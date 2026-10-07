'use server';

import { refresh } from 'next/cache';
import { generateOpenRouterCompletion } from '@/lib/ai/openrouter';

import * as repo from '@/lib/db/repo';
import * as roundsRepo from '@/lib/db/rounds.repo';
import type { RoundRow } from '@/lib/db/rounds.repo';
import { getQuestion, getRoundDefinition, isRoundBuilt, isRoundKind } from '@/lib/assessment/registry';
import { normalizeAiEvaluation, parseAiJson } from '@/lib/assessment/ai-response';
import { decideRoundOutcome } from '@/lib/assessment/scoring';
import { buildRoundState, resolvePassThreshold } from '@/lib/rounds';
import { consume } from '@/lib/rate-limit';
import { getCurrentRecruiter, getCurrentStudent, updateApplicationStage } from '@/lib/actions';
import type { AnswerEvaluation, AnswerRecord, RoundKind, RoundState } from '@/lib/assessment/types';
import type { Application, ApplicationStage } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

/**
 * `refresh()` re-renders the client router after a mutation, but it throws unless
 * it is called from inside a real Server Action. These actions are also invoked
 * directly by the smoke harness through /api/test/action, where there is no
 * router to refresh, so the call is best-effort: in a browser it always
 * succeeds, and elsewhere it is a no-op.
 */
function refreshRouter(): void {
  try {
    refresh();
  } catch {
    // Not running inside a Server Action; nothing to revalidate.
  }
}

/**
 * Server actions are reachable by direct POST, so every one of these re-checks
 * ownership instead of trusting the ids it was handed.
 */
async function requireOwnApplication(applicationId: string): Promise<{
  application: Application;
  studentId: string;
}> {
  const student = await getCurrentStudent();
  if (!student) throw new Error('Sign in as a student to take a round.');

  const application = repo.findApplicationById(applicationId);
  if (!application) throw new Error('Application not found.');
  if (application.studentId !== student.id) {
    throw new Error('That application does not belong to you.');
  }
  return { application, studentId: student.id };
}

async function requireOwnedRound(roundId: string) {
  const round = roundsRepo.findRoundById(roundId);
  if (!round) throw new Error('Round not found.');
  const { application } = await requireOwnApplication(round.application_id);
  return { round, application };
}

function requireDefinition(kind: RoundKind) {
  const definition = getRoundDefinition(kind);
  if (!isRoundBuilt(kind)) {
    throw new Error(`The ${definition.title} has not been built yet.`);
  }
  return definition;
}

/**
 * The model is asked for bare JSON, but it sometimes wraps the object in a
 * markdown fence or adds a sentence around it. Rather than failing the answer,
 * dig the outermost object out of whatever came back.
 */
function parseKind(value: string): RoundKind {
  if (!isRoundKind(value)) throw new Error(`Unknown round: ${value}`);
  return value;
}

/* -------------------------------------------------------------------------- */
/*                              Candidate actions                              */
/* -------------------------------------------------------------------------- */

export async function getRoundState(applicationId: string, kind: string): Promise<RoundState> {
  const { application } = await requireOwnApplication(applicationId);
  return buildRoundState(application, parseKind(kind));
}

export async function startAssessmentRound(applicationId: string, kind: string) {
  const { application } = await requireOwnApplication(applicationId);
  const roundKind = parseKind(kind);
  const definition = requireDefinition(roundKind);

  if (application.stage !== definition.stage) {
    throw new Error(
      application.stage === 'Rejected' || application.stage === 'Selected'
        ? `This application is ${application.stage.toLowerCase()}, so no rounds remain.`
        : `The ${definition.shortTitle} opens when your application reaches the ${definition.stage} stage.`,
    );
  }

  const existing = roundsRepo.findRound(application.id, roundKind);
  // A completed round is kept as the candidate's record; they can still look
  // at the result rather than silently overwriting it with a new attempt.
  if (existing && existing.status !== 'in_progress') {
    throw new Error('You have already completed this round.');
  }

  const round = existing ?? roundsRepo.startRound(application.id, roundKind);
  refreshRouter();
  return { roundId: round.id, state: buildRoundState(application, roundKind) };
}

/**
 * Grades a single answer the moment it is submitted, so the candidate gets
 * immediate feedback and the stored result is never a re-graded afterthought.
 */
export async function submitRoundAnswer(roundId: string, questionId: string, answer: string) {
  const { round, application } = await requireOwnedRound(roundId);
  const definition = requireDefinition(round.kind);

  if (round.status !== 'in_progress') {
    throw new Error('This round is already closed.');
  }

  const state = buildRoundState(application, round.kind);
  if (state.secondsRemaining !== null && state.secondsRemaining <= 0) {
    throw new Error('Time is up for this round.');
  }

  const question = getQuestion(round.kind, questionId);
  if (!question) throw new Error('That question is not part of this round.');

  const text = answer.trim();
  if (!text) throw new Error('Please write an answer before submitting.');

  // An answer is final once graded. Re-sending the identical text is treated as a
  // retry of the same submission and replays the stored result, so a dropped
  // response cannot silently overwrite a score or bill a second evaluation.
  const existing = roundsRepo.findAnswer(round.id, questionId);
  if (existing) {
    if (existing.answer === text) {
      return { evaluation: toEvaluation(existing), state: buildRoundState(application, round.kind) };
    }
    throw new Error('This question has already been submitted and cannot be changed.');
  }

  if (!consume(`grade:${round.id}`, 20, 60_000)) {
    throw new Error('Too many submissions in a short time. Wait a moment and try again.');
  }

  let graded = true;
  let evaluation: AnswerEvaluation = {
    score: 0,
    maxScore: definition.maxScorePerAnswer,
    feedback: '',
    signals: [],
  };

  if (round.kind === 'communication' || round.kind === 'aptitude' || round.kind === 'technical1' || round.kind === 'technical2' || round.kind === 'hr') {
    const generated = roundsRepo.findGeneratedQuestion(round.id, questionId);
    if (!generated) throw new Error('Question not found. Did it fail to generate?');

    const evalPrompt = `Evaluate the candidate's answer to this question:
Question: ${generated.question}
Correct Answer/Criteria: ${String(generated.data.correct_answer ?? generated.data.evaluation_criteria ?? '')}
Candidate Answer: ${text}

Provide JSON with:
{
  "score": <number 0 to 10>,
  "feedback": "<string feedback for candidate>",
  "signals": [
    {"label": "<string>", "detail": "<string>", "level": "<good | ok | poor>"}
  ]
}`;
    try {
      const aiResponse = await generateOpenRouterCompletion(
        evalPrompt,
        'You are an expert interviewer evaluating a candidate. Return ONLY valid JSON.',
        true,
      );
      evaluation = normalizeAiEvaluation(
        parseAiJson(aiResponse),
        definition.maxScorePerAnswer,
      );
    } catch (e) {
      // An infrastructure failure must not become a real grade. The answer is
      // stored ungraded so the round is flagged for a human instead.
      console.error(e);
      graded = false;
      evaluation = {
        score: 0,
        maxScore: definition.maxScorePerAnswer,
        feedback: 'This answer could not be graded automatically. A recruiter will review it.',
        signals: [
          {
            label: 'Automated grading',
            detail: 'Unavailable for this answer.',
            level: 'poor',
          },
        ],
      };
    }
  } else {
    evaluation = definition.evaluate({ question, answer: text });
  }

  roundsRepo.saveAnswer(round.id, question.id, question.position, text, evaluation, graded);

  refreshRouter();
  return { evaluation: { ...evaluation, graded }, state: buildRoundState(application, round.kind) };
}

function toEvaluation(record: AnswerRecord): AnswerEvaluation {
  return {
    score: record.score,
    maxScore: record.maxScore,
    feedback: record.feedback,
    signals: record.signals,
    graded: record.graded,
    audioUrl: record.audioUrl,
  };
}

export async function logProctoringEvent(roundId: string, eventType: string) {
  const { round } = await requireOwnedRound(roundId);
  if (round.status !== 'in_progress') return;
  roundsRepo.recordProctoringEvent(roundId, eventType);

  const definition = getRoundDefinition(round.kind);
  const total = roundsRepo.listProctoringEvents(roundId).length;
  if (total > definition.proctoringFlagThreshold) {
    roundsRepo.setRoundFlagged(roundId, true);
  }
}

export async function generateDynamicPrompt(roundId: string, sectionId: string): Promise<string> {
  const { round } = await requireOwnedRound(roundId);
  if (round.status !== 'in_progress') {
    throw new Error('This round is already closed.');
  }

  const cached = roundsRepo.findGeneratedQuestion(round.id, sectionId);
  if (cached) return cached.question;

  let instruction = '';
  if (sectionId === 'grammar') {
    instruction = "Generate an English grammar question. It can be subject-verb agreement, articles, etc. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"grammar\"}";
  } else if (sectionId === 'tenses') {
    instruction = "Generate a question testing English tenses. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"tenses\"}";
  } else if (sectionId === 'fill-blank') {
    instruction = "Generate a fill in the missing word sentence. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"vocabulary\"}";
  } else if (sectionId === 'listen-speak') {
    instruction = "Generate a short scenario or conversational statement for a tech interview listening/speaking test. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'essay') {
    instruction = "Generate a short essay prompt (non-technical). Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'logical-reasoning') {
    instruction = "Generate a logical reasoning question for an aptitude test. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"logic\"}";
  } else if (sectionId === 'numerical-ability') {
    instruction = "Generate a numerical ability math question for an aptitude test. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"math\"}";
  } else if (sectionId === 'data-interpretation') {
    instruction = "Generate a data interpretation question, providing a small set of data and a question about it. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"data\"}";
  } else if (sectionId === 'spatial-reasoning') {
    instruction = "Generate a text-based spatial reasoning puzzle or scenario. Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"spatial\"}";
  } else if (sectionId === 'pattern-recognition') {
    instruction = "Generate a pattern recognition sequence question (e.g. number or letter series). Provide JSON: {\"question\": \"...\", \"correct_answer\": \"...\", \"difficulty\": \"medium\", \"concept\": \"pattern\"}";
  } else if (sectionId === 'tech1-fundamentals') {
    instruction = "Generate a question about programming fundamentals (e.g. OOP, functional programming). Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'tech1-algorithms') {
    instruction = "Generate an algorithms and data structures interview question. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'tech1-debugging') {
    instruction = "Generate a debugging or code review question. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'tech2-system-design') {
    instruction = "Generate a system design interview question. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'tech2-scalability') {
    instruction = "Generate a question about application scalability or performance optimization. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'tech2-advanced-coding') {
    instruction = "Generate an advanced software engineering problem. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'hr-cultural-fit') {
    instruction = "Generate an HR interview question assessing cultural fit, personal background, and alignment with company culture. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'hr-teamwork-conflict') {
    instruction = "Generate a behavioral HR interview question about conflict resolution, teamwork, or collaborating under differences. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'hr-adaptability-pressure') {
    instruction = "Generate a situational HR interview question about adaptability, working under tight deadlines, or handling unexpected change. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else if (sectionId === 'hr-career-goals') {
    instruction = "Generate an HR interview question about career aspirations, motivation, self-growth, and long-term professional goals. Provide JSON: {\"question\": \"...\", \"evaluation_criteria\": \"...\"}";
  } else {
    throw new Error(`Unknown question section: ${sectionId}`);
  }

  const aiResponse = await generateOpenRouterCompletion(instruction, 'You are an assessment generator. Return ONLY valid JSON.', true);
  const parsed = parseAiJson(aiResponse) as Record<string, unknown>;
  const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  if (!question) {
    throw new Error('The generated question was empty.');
  }

  const verified = await verifyAnswerKey(parsed, question);

  roundsRepo.saveGeneratedQuestion(round.id, sectionId, verified);
  return question;
}

/**
 * The generator occasionally returns a key that does not follow from its own
 * question — a real risk for the logic and pattern sections, where more than one
 * option can look defensible. One cheap second pass catches the obvious cases
 * before the key is ever used to score a candidate.
 */
async function verifyAnswerKey(
  parsed: Record<string, unknown>,
  question: string,
): Promise<Record<string, unknown>> {
  const key = parsed.correct_answer;
  if (typeof key !== 'string' || key.trim() === '') return parsed;

  try {
    const response = await generateOpenRouterCompletion(
      `Question: ${question}
Stated correct answer: ${key}

Decide whether that answer is actually correct and unambiguous. Reply with JSON:
{"consistent": true|false, "corrected_answer": "<the correct answer, or the stated one if it was already right>"}`,
      'You are a meticulous assessment reviewer. Return ONLY valid JSON.',
      true,
    );
    const verdict = parseAiJson(response) as { consistent?: unknown; corrected_answer?: unknown };
    if (verdict.consistent === false && typeof verdict.corrected_answer === 'string' && verdict.corrected_answer.trim()) {
      return { ...parsed, correct_answer: verdict.corrected_answer.trim(), answer_key_corrected: true };
    }
  } catch (e) {
    // A failed review must not lose the question; the original key still stands.
    console.error(e);
  }

  return parsed;
}

export interface RoundCompletion {
  round: RoundRow;
  state: RoundState;
  advancedTo: ApplicationStage | null;
}

/**
 * Closes the round, decides pass/fail against the definition's threshold, and
 * on a pass moves the application to the next pipeline stage.
 */
export async function completeAssessmentRound(roundId: string): Promise<RoundCompletion> {
  const { round, application } = await requireOwnedRound(roundId);
  const definition = requireDefinition(round.kind);

  if (round.status !== 'in_progress') {
    return { round, state: buildRoundState(application, round.kind), advancedTo: null };
  }

  const answers = roundsRepo.listAnswers(round.id);

  const passThreshold = resolvePassThreshold(application.jobId, round.kind, definition.passThreshold);
  const outcome = decideRoundOutcome(answers, {
    passThreshold,
    minAnswersToPass: definition.minAnswersToPass,
  });

  const scored = roundsRepo.scoreRound(round.id, outcome.passed ? 'passed' : 'failed');
  if (outcome.flagged) roundsRepo.setRoundFlagged(round.id, true);

  if (outcome.passed && application.stage === definition.stage) {
    await updateApplicationStage(application.id, definition.passesTo);
  }

  const updated = repo.findApplicationById(application.id) ?? application;
  refreshRouter();
  return {
    round: scored,
    state: buildRoundState(updated, round.kind),
    advancedTo: outcome.passed ? definition.passesTo : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Recruiter actions                              */
/* -------------------------------------------------------------------------- */

export async function getRoundStatesForRecruiter(applicationId: string, kinds: RoundKind[]) {
  const recruiter = await getCurrentRecruiter();
  if (!recruiter) throw new Error('Sign in as a recruiter to view rounds.');

  const application = repo.findApplicationById(applicationId);
  if (!application) throw new Error('Application not found.');

  const job = repo.findJobById(application.jobId);
  if (!job || job.recruiterId !== recruiter.id) {
    throw new Error('That candidate is not one of yours.');
  }

  const now = Date.now();
  return Object.fromEntries(
    kinds.map(kind => [kind, buildRoundState(application, kind, now)] as const),
  ) as Record<RoundKind, RoundState>;
}
