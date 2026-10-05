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

      {state.flagged && (
        <div className="round-flagged">
          <h4>Needs manual review</h4>
          <p className="small">
            {state.answers.filter(a => !a.graded).length > 0 &&
              `${state.answers.filter(a => !a.graded).length} answer(s) could not be graded by the model, `}
            {state.answers.length < definition.minAnswersToPass &&
              `only ${state.answers.length} of the ${definition.minAnswersToPass} required answers were submitted, `}
            so this round was recorded as not passed rather than scored on partial input.
          </p>
        </div>
      )}

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
                    {answer.graded ? `${answer.score} / ${answer.maxScore}` : 'Not graded'}
                  </span>
                </div>
                <p className="round-review-answer">{answer.answer}</p>
                <p className="round-review-feedback">{answer.feedback}</p>
                {answer.audioUrl && (
                  <audio controls preload="none" src={answer.audioUrl}>
                    <a href={answer.audioUrl}>Listen to the recorded answer</a>
                  </audio>
                )}
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

      {state.proctoringEvents && state.proctoringEvents.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fee2e2', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
          <h4 style={{ margin: 0, color: '#991b1b', fontSize: '1rem' }}>Proctoring Alerts</h4>
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', fontSize: '0.9rem', color: '#7f1d1d' }}>
            {state.proctoringEvents.map((event, i) => (
              <li key={i}>
                <strong>{event.eventType}</strong> at {formatDateTime(event.timestamp)}
              </li>
            ))}
          </ul>
        </div>
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
