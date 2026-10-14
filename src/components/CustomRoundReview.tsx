'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { finalizeCustomRound, gradeCustomAnswer } from '@/lib/custom-actions';
import type { AnswerRecord, RoundState } from '@/lib/assessment/types';

/**
 * Recruiter's manual grading surface for the optional screening round. Each
 * answer is scored by hand, then the round is finalised as a pass or a fail.
 */
export default function CustomRoundReview({ state }: { state: RoundState }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roundId = state.id;
  const awaitingReview = state.status === 'submitted';

  function saveGrade(answer: AnswerRecord, score: number, feedback: string) {
    if (!roundId) return;
    setError(null);
    startTransition(async () => {
      try {
        await gradeCustomAnswer(roundId, answer.questionId, score, feedback);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that grade.');
      }
    });
  }

  function finalize(decision: 'passed' | 'failed') {
    if (!roundId) return;
    setError(null);
    startTransition(async () => {
      try {
        await finalizeCustomRound(roundId, decision);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not finalise this round.');
      }
    });
  }

  if (state.answers.length === 0) {
    return (
      <div className="panel">
        <h3>Screening round review</h3>
        <p className="lead-muted">The candidate has not submitted any answers yet.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Screening round review</h3>
      <p className="lead-muted">
        {awaitingReview
          ? 'Grade each answer, then record a final decision.'
          : 'This round has been reviewed.'}
      </p>

      <div className="stack">
        {state.answers.map(answer => (
          <AnswerGrader
            key={answer.id}
            answer={answer}
            disabled={!awaitingReview || pending}
            onSave={saveGrade}
          />
        ))}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {awaitingReview && (
        <div className="stage-controls" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={pending}
            onClick={() => finalize('passed')}
          >
            Mark as passed
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={pending}
            onClick={() => finalize('failed')}
          >
            Mark as not passed
          </button>
        </div>
      )}
    </div>
  );
}

function AnswerGrader({
  answer,
  disabled,
  onSave,
}: {
  answer: AnswerRecord;
  disabled: boolean;
  onSave: (answer: AnswerRecord, score: number, feedback: string) => void;
}) {
  const [score, setScore] = useState(answer.score);
  const [feedback, setFeedback] = useState(answer.feedback);

  return (
    <article className="card">
      <h4 style={{ marginBottom: '0.5rem' }}>{answer.prompt}</h4>
      <p className="round-review-answer">{answer.answer}</p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ maxWidth: '160px', margin: 0 }}>
          <label htmlFor={`score-${answer.id}`}>Score (of {answer.maxScore})</label>
          <input
            id={`score-${answer.id}`}
            type="number"
            min={0}
            max={answer.maxScore}
            value={score}
            disabled={disabled}
            onChange={e => setScore(Number(e.target.value))}
          />
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: '240px', margin: 0 }}>
          <label htmlFor={`feedback-${answer.id}`}>Feedback</label>
          <input
            id={`feedback-${answer.id}`}
            value={feedback}
            disabled={disabled}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Notes for the candidate (optional)"
          />
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => onSave(answer, score, feedback)}
        >
          {answer.graded ? 'Update grade' : 'Save grade'}
        </button>
      </div>
    </article>
  );
}
