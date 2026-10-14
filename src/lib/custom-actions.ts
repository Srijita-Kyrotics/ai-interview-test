'use server';

import { revalidatePath } from 'next/cache';

import * as repo from '@/lib/db/repo';
import * as roundsRepo from '@/lib/db/rounds.repo';
import { getCurrentRecruiter, updateApplicationStage } from '@/lib/actions';
import { buildRoundState, resolvePassThreshold } from '@/lib/rounds';
import { getRoundDefinition } from '@/lib/assessment/registry';
import type { RecruiterQuestion } from '@/lib/db/repo';
import type { RoundState } from '@/lib/assessment/types';
import type { Application } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                              Question bank                                 */
/* -------------------------------------------------------------------------- */

async function requireRecruiter() {
  const recruiter = await getCurrentRecruiter();
  if (!recruiter) throw new Error('Sign in as a recruiter to manage questions.');
  return recruiter;
}

export async function listRecruiterQuestions(): Promise<RecruiterQuestion[]> {
  const recruiter = await requireRecruiter();
  return repo.listRecruiterQuestions(recruiter.id);
}

export async function createRecruiterQuestion(data: {
  prompt: string;
  hint: string;
  maxScore: number;
}): Promise<RecruiterQuestion> {
  const recruiter = await requireRecruiter();
  const prompt = data.prompt.trim();
  if (!prompt) throw new Error('A question prompt is required.');
  const maxScore = Number.isFinite(data.maxScore) && data.maxScore > 0 ? data.maxScore : 10;

  const question = repo.insertRecruiterQuestion({
    recruiterId: recruiter.id,
    prompt,
    hint: data.hint.trim(),
    maxScore,
  });
  revalidatePath('/recruiter/questions');
  return question;
}

export async function deleteRecruiterQuestion(id: string): Promise<void> {
  const recruiter = await requireRecruiter();
  repo.deleteRecruiterQuestion(recruiter.id, id);
  revalidatePath('/recruiter/questions');
}

/* -------------------------------------------------------------------------- */
/*                        Per-job custom round config                         */
/* -------------------------------------------------------------------------- */

export interface JobCustomRoundConfig {
  enabled: boolean;
  passThreshold: number;
  questions: repo.JobCustomQuestion[];
}

async function requireOwnedJob(jobId: string) {
  const recruiter = await requireRecruiter();
  const job = repo.findJobById(jobId);
  if (!job || job.recruiterId !== recruiter.id) {
    throw new Error('That role is not one of yours.');
  }
  return { recruiter, job };
}

export async function getJobCustomRound(jobId: string): Promise<JobCustomRoundConfig> {
  await requireOwnedJob(jobId);
  const configured = repo.listJobRounds(jobId).find(r => r.kind === 'custom');
  const questions = repo.listJobCustomQuestions(jobId);
  return {
    enabled: Boolean(configured) && questions.length > 0,
    passThreshold: resolvePassThreshold(jobId, 'custom', getRoundDefinition('custom').passThreshold),
    questions,
  };
}

export async function saveJobCustomRound(
  jobId: string,
  data: { enabled: boolean; passThreshold: number; questionIds: string[] },
): Promise<void> {
  const { recruiter } = await requireOwnedJob(jobId);

  // Only the recruiter's own bank questions may be attached to their job.
  const owned = new Set(repo.listRecruiterQuestions(recruiter.id).map(q => q.id));
  const questionIds = data.questionIds.filter(id => owned.has(id));

  const passThreshold =
    Number.isFinite(data.passThreshold) && data.passThreshold > 0
      ? Math.min(100, Math.round(data.passThreshold))
      : getRoundDefinition('custom').passThreshold;

  if (data.enabled && questionIds.length > 0) {
    repo.upsertJobRound(jobId, 'custom', 0, passThreshold);
    repo.setJobCustomQuestions(jobId, questionIds);
  } else {
    repo.deleteJobRound(jobId, 'custom');
    repo.setJobCustomQuestions(jobId, []);
  }

  revalidatePath(`/recruiter/jobs/${jobId}`);
  revalidatePath('/student/dashboard');
}

/* -------------------------------------------------------------------------- */
/*                            Manual review / grading                         */
/* -------------------------------------------------------------------------- */

async function requireOwnedCustomRound(roundId: string): Promise<{ application: Application }> {
  const recruiter = await requireRecruiter();
  const round = roundsRepo.findRoundById(roundId);
  if (!round) throw new Error('Round not found.');
  if (round.kind !== 'custom') throw new Error('Only the screening round is graded manually.');

  const application = repo.findApplicationById(round.application_id);
  if (!application) throw new Error('Application not found.');

  const job = repo.findJobById(application.jobId);
  if (!job || job.recruiterId !== recruiter.id) {
    throw new Error('That candidate is not one of yours.');
  }
  return { application };
}

/** Saves a recruiter's score and feedback for one answer of a custom round. */
export async function gradeCustomAnswer(
  roundId: string,
  questionId: string,
  score: number,
  feedback: string,
): Promise<RoundState> {
  const { application } = await requireOwnedCustomRound(roundId);

  const question = repo.findJobCustomQuestion(application.jobId, questionId);
  if (!question) throw new Error('That question is not part of this round.');

  const maxScore = question.maxScore;
  const clamped = Math.max(0, Math.min(maxScore, Number.isFinite(score) ? score : 0));
  roundsRepo.gradeAnswer(roundId, questionId, clamped, maxScore, feedback.trim());

  const state = buildRoundState(application, 'custom');
  revalidatePath(`/recruiter/candidates/${application.id}`);
  return state;
}

/**
 * Finalises a manually reviewed round with the recruiter's decision and, on a
 * pass, advances the application to the next stage.
 */
export async function finalizeCustomRound(
  roundId: string,
  decision: 'passed' | 'failed',
): Promise<RoundState> {
  const { application } = await requireOwnedCustomRound(roundId);

  const round = roundsRepo.findRoundById(roundId);
  if (!round) throw new Error('Round not found.');
  if (round.status !== 'in_progress' || !round.completed_at) {
    throw new Error('This round is not awaiting review.');
  }

  roundsRepo.scoreRound(roundId, decision);

  const definition = getRoundDefinition('custom');
  if (decision === 'passed' && application.stage === definition.stage) {
    await updateApplicationStage(application.id, definition.passesTo);
  }

  const updated = repo.findApplicationById(application.id) ?? application;
  revalidatePath(`/recruiter/candidates/${application.id}`);
  revalidatePath(`/recruiter/jobs/${application.jobId}`);
  revalidatePath('/student/dashboard');
  return buildRoundState(updated, 'custom');
}
