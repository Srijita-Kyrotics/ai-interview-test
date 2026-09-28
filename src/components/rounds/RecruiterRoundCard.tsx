import { getRoundDefinition } from '@/lib/assessment/registry';
import type { RoundState } from '@/lib/assessment/types';
import { RoundStatusBadge } from './RoundStatus';

function formatDateTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Read-only view of a candidate's round result for the recruiter: status,
 * score, and the same per-answer breakdown the candidate saw.
 */
export function RecruiterRoundCard({ state }: { state: RoundState }) {
  const definition = getRoundDefinition(state.kind);
  const scored = state.status === 'passed' || state.status === 'failed';

  return (
    <div className={`round-card-recruiter round-card-recruiter-${state.status}`}>
      <div className="round-card-recruiter-head">
        <div>
          <h3>{definition.title}</h3>
          <p className="muted small">
            {state.status === 'not_started'
              ? `Opens at the ${definition.stage} stage.`
              : state.status === 'in_progress'
                ? `Started ${formatDateTime(state.startedAt)}`
                : state.status === 'locked'
                  ? 'Not reached yet.'
                  : `Completed ${formatDateTime(state.completedAt)}`}
          </p>
        </div>
        <RoundStatusBadge state={state} showScore />
      </div>

      {scored && (
        <>
          <div className="round-scorebar">
            <div
              className="round-scorebar-fill"
              style={{ width: `${Math.min(100, state.percent ?? 0)}%` }}
            />
            <div
              className="round-scorebar-threshold"
              style={{ left: `${state.passThreshold}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="muted small">
            {state.score} of {state.maxScore} marks &middot; pass mark {state.passThreshold}%
          </p>

          <ol className="round-review">
            {state.answers.map(answer => (
              <li key={answer.id} className="round-review-item">
                <div className="round-review-head">
                  <h4>{answer.prompt}</h4>
                  <span className="round-review-score">
                    {answer.score} / {answer.maxScore}
                  </span>
                </div>
                <p className="round-review-answer">{answer.answer}</p>
                <p className="round-review-feedback">{answer.feedback}</p>
                <ul className="round-signals">
                  {answer.signals.map(signal => (
                    <li key={signal.label} className={`round-signal round-signal-${signal.level}`}>
                      <span className="round-signal-label">{signal.label}</span>
                      <span className="round-signal-detail">{signal.detail}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}

      {!scored && state.status === 'in_progress' && (
        <p className="muted small">
          {state.answers.length} of {definition.questions.length} answers submitted so far.
        </p>
      )}

      {state.status === 'locked' && (
        <p className="muted small">Available once the application reaches {definition.stage}.</p>
      )}
      {state.status === 'not_started' && (
        <p className="muted small">Waiting on the candidate to start the round.</p>
      )}
      {scored && (
        <p className="muted small">
          {state.status === 'passed'
            ? 'Passed, and the application advanced automatically.'
            : 'Not passed, so the application stayed at the current stage.'}{' '}
          Scored automatically on submission.
        </p>
      )}
    </div>
  );
}
