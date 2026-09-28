import { roundStatusLabel } from '@/lib/assessment/status';
import type { RoundState } from '@/lib/assessment/types';

/**
 * Compact status pill for a round. Used on the candidate dashboard, the
 * pipeline rows and the candidate detail page so the wording is identical
 * everywhere.
 */
export function RoundStatusBadge({
  state,
  showScore = false,
}: {
  state: RoundState;
  showScore?: boolean;
}) {
  const scored = state.status === 'passed' || state.status === 'failed';
  const label = scored && showScore && state.percent !== null
    ? `${roundStatusLabel(state.status)} · ${state.percent}%`
    : roundStatusLabel(state.status);

  return (
    <span className={`round-badge round-badge-${state.status}`}>
      <span className="round-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Larger variant used on the round page itself. */
export function RoundStatusHeadline({ state }: { state: RoundState }) {
  return (
    <div className={`round-headline round-headline-${state.status}`}>
      <span className="round-headline-label">{roundStatusLabel(state.status)}</span>
      {state.percent !== null && (
        <span className="round-headline-score">
          {state.percent}%
          <span className="round-headline-denom"> / {state.passThreshold}% to pass</span>
        </span>
      )}
    </div>
  );
}
