import { isRoundBuilt } from './registry';
import type { RoundState, RoundStatus } from './types';

/**
 * Pure helpers derived from round state. Kept separate from `src/lib/rounds.ts`
 * because that module imports the database, and client components must never
 * pull `node:sqlite` into the browser bundle.
 */

/** Human-readable label used on badges across the app. */
export function roundStatusLabel(status: RoundStatus): string {
  switch (status) {
    case 'locked':
      return 'Not available yet';
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Not passed';
  }
}

/** True when the candidate can still take the round. */
export function isRoundActionable(state: RoundState): boolean {
  return (
    isRoundBuilt(state.kind) && (state.status === 'not_started' || state.status === 'in_progress')
  );
}
