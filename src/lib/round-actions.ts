'use server';

import { refresh } from 'next/cache';
import { generateOpenRouterCompletion } from '@/lib/ai/openrouter';

import * as repo from '@/lib/db/repo';
import { getDb } from '@/lib/db/index';
import * as roundsRepo from '@/lib/db/rounds.repo';
import type { RoundRow } from '@/lib/db/rounds.repo';
import { getQuestion, getRoundDefinition, isRoundBuilt, isRoundKind } from '@/lib/assessment/registry';
import { buildRoundState } from '@/lib/rounds';
import { getCurrentRecruiter, getCurrentStudent, updateApplicationStage } from '@/lib/actions';
import type { RoundKind, RoundState } from '@/lib/assessment/types';
import type { Application, ApplicationStage } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

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
  refresh();
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

  let evaluation: any = { score: 0, maxScore: 10, feedback: '', signals: [] };

  if (round.kind === 'communication') {
    const dynamicQ = getDb().prepare('SELECT * FROM questions WHERE id = ?').get(`${round.id}_${questionId}`) as any;
    if (!dynamicQ) throw new Error('Question not found. Did it fail to generate?');
    const qData = JSON.parse(dynamicQ.metadata_json);
    
    // Evaluate via AI
    const evalPrompt = `Evaluate the candidate's answer to this question:
Question: ${qData.question}
Correct Answer/Criteria: ${qData.correct_answer || qData.evaluation_criteria}
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
      const aiResponse = await generateOpenRouterCompletion(evalPrompt, 'You are an expert interviewer evaluating a candidate. Return ONLY valid JSON.', true);
      const parsed = JSON.parse(aiResponse);
      evaluation = {
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        maxScore: 10,
        feedback: parsed.feedback || 'Evaluated.',
        signals: parsed.signals || []
      };
    } catch (e) {
      console.error(e);
      evaluation = { score: 5, maxScore: 10, feedback: 'AI Evaluation failed, default score applied.', signals: [] };
    }
  } else {
    evaluation = definition.evaluate({ question, answer: text });
  }

  roundsRepo.saveAnswer(round.id, question.id, question.position, text, evaluation);

  refresh();
  return { evaluation, state: buildRoundState(application, round.kind) };
}

export async function logProctoringEvent(roundId: string, eventType: string) {
  const { round } = await requireOwnedRound(roundId);
  if (round.status !== 'in_progress') return;
  roundsRepo.recordProctoringEvent(roundId, eventType);
}

export async function generateDynamicPrompt(roundId: string, sectionId: string): Promise<string> {
  const existing = getDb().prepare('SELECT * FROM questions WHERE id = ?').get(`${roundId}_${sectionId}`) as any;
  if (existing) {
    const parsed = JSON.parse(existing.content);
    return parsed.question;
  }

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
  } else {
    return 'Default prompt';
  }
  
  try {
    const aiResponse = await generateOpenRouterCompletion(instruction, 'You are an assessment generator. Return ONLY valid JSON.', true);
    const parsed = JSON.parse(aiResponse);
    getDb().prepare('INSERT INTO questions (id, category, question_type, content, metadata_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(`${roundId}_${sectionId}`, 'communication_dynamic', sectionId, JSON.stringify(parsed), JSON.stringify(parsed), 'system', new Date().toISOString());
    return parsed.question;
  } catch (e) {
    console.error(e);
    return 'Error generating question. Please try again.';
  }
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
  if (answers.length === 0) {
    throw new Error('Submit at least one answer before finishing the round.');
  }

  const maxScore = definition.questions.length * definition.maxScorePerAnswer;
  const score = answers.reduce((sum, a) => sum + a.score, 0);
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = percent >= definition.passThreshold;

  const scored = roundsRepo.scoreRound(round.id, passed ? 'passed' : 'failed');

  if (passed && application.stage === definition.stage) {
    await updateApplicationStage(application.id, definition.passesTo);
  }

  const updated = repo.findApplicationById(application.id) ?? application;
  refresh();
  return {
    round: scored,
    state: buildRoundState(updated, round.kind),
    advancedTo: passed ? definition.passesTo : null,
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
