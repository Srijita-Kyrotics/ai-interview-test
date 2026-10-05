import { getRoundDefinition } from '@/lib/assessment/registry';
import type { RoundKind, RoundState, RoundStatus } from '@/lib/assessment/types';
import * as roundsRepo from '@/lib/db/rounds.repo';
import type { RoundRow } from '@/lib/db/rounds.repo';
import * as repo from '@/lib/db/repo';
import type { Application } from '@/lib/types';

/**
 * A job may set its own bar per round. Falling back to the registry default
 * keeps the existing behaviour for jobs that never configured one.
 */
export function resolvePassThreshold(jobId: string, kind: RoundKind, fallback: number): number {
  const configured = repo.listJobRounds(jobId).find(r => r.kind === kind)?.passThreshold;
  return typeof configured === 'number' && configured > 0 ? configured : fallback;
}

/**
 * Composes the database rows for a round with its definition from the registry
 * into a single renderable state object. This is the only place that decides
 * what `locked` means, so the student UI, the recruiter UI and the server
 * actions can never disagree about whether a round is available.
 */
export function buildRoundState(
  application: Application,
  kind: RoundKind,
  now: number = Date.now(),
): RoundState {
  const definition = getRoundDefinition(kind);
  const row = roundsRepo.findRound(application.id, kind);

  // No row yet: the round is open only once the application has actually
  // reached the stage the round is attached to.
  const status: RoundStatus = row ? row.status : application.stage === definition.stage ? 'not_started' : 'locked';

  // The prompt a candidate actually answered is the generated one for the
  // dynamic rounds, so the result page has to read that rather than the
  // registry's static label.
  const answers = row
    ? roundsRepo.listAnswers(row.id).map(answer => ({
        ...answer,
        prompt:
          roundsRepo.findGeneratedQuestion(row.id, answer.questionId)?.question ||
          definition.questions.find(q => q.id === answer.questionId)?.prompt ||
          answer.questionId,
      }))
    : [];

  // A round closed without a single answer is a scored zero, not "not yet
  // scored", so the candidate sees a real percentage on the result page.
  const percent =
    row && row.status !== 'in_progress'
      ? row.max_score > 0
        ? Math.round((row.score / row.max_score) * 100)
        : 0
      : null;

  const passed = row ? row.status === 'passed' : null;

  let secondsRemaining: number | null = null;
  if (row && row.status === 'in_progress') {
    const elapsed = Math.floor((now - new Date(row.started_at).getTime()) / 1000);
    secondsRemaining = Math.max(0, definition.timeLimitSec - elapsed);
  }

  const proctoringEvents = row ? roundsRepo.listProctoringEvents(row.id) : [];
  const answersUngraded = answers.filter(answer => !answer.graded).length;
  const flagged =
    row?.flagged === 1 ||
    answersUngraded > 0 ||
    proctoringEvents.length > definition.proctoringFlagThreshold;

  return {
    id: row?.id ?? null,
    applicationId: application.id,
    kind,
    status,
    score: row?.score ?? 0,
    maxScore: row?.max_score ?? 0,
    percent,
    passed,
    startedAt: row?.started_at ?? null,
    completedAt: row?.completed_at ?? null,
    passThreshold: resolvePassThreshold(application.jobId, kind, definition.passThreshold),
    minAnswersToPass: definition.minAnswersToPass,
    proctoringFlagThreshold: definition.proctoringFlagThreshold,
    answers,
    flagged,
    answersUngraded,
    secondsRemaining,
    proctoringEvents,
  };
}

/** Round states keyed by kind, for views that show the whole pipeline. */
export function buildAllRoundStates(
  application: Application,
  kinds: RoundKind[],
  now: number = Date.now(),
): Record<RoundKind, RoundState> {
  const entries = kinds.map(kind => [kind, buildRoundState(application, kind, now)] as const);
  return Object.fromEntries(entries) as Record<RoundKind, RoundState>;
}

export function roundRowFor(applicationId: string, kind: RoundKind): RoundRow | null {
  return roundsRepo.findRound(applicationId, kind);
}
