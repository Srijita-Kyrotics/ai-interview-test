import { getRoundDefinition } from '@/lib/assessment/registry';
import type { RoundKind, RoundState, RoundStatus } from '@/lib/assessment/types';
import * as roundsRepo from '@/lib/db/rounds.repo';
import type { RoundRow } from '@/lib/db/rounds.repo';
import type { Application } from '@/lib/types';

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

  const answers = row
    ? roundsRepo.listAnswers(row.id).map(answer => ({
        ...answer,
        prompt: definition.questions.find(q => q.id === answer.questionId)?.prompt ?? answer.questionId,
      }))
    : [];

  const percent =
    row && row.max_score > 0 ? Math.round((row.score / row.max_score) * 100) : null;

  const passed = row ? row.status === 'passed' : null;

  let secondsRemaining: number | null = null;
  if (row && row.status === 'in_progress') {
    const elapsed = Math.floor((now - new Date(row.started_at).getTime()) / 1000);
    secondsRemaining = Math.max(0, definition.timeLimitSec - elapsed);
  }

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
    passThreshold: definition.passThreshold,
    answers,
    secondsRemaining,
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
