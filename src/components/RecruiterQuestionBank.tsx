'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRecruiterQuestion, deleteRecruiterQuestion } from '@/lib/custom-actions';

export interface BankQuestion {
  id: string;
  prompt: string;
  hint: string;
  maxScore: number;
}

export default function RecruiterQuestionBank({ questions }: { questions: BankQuestion[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [hint, setHint] = useState('');
  const [maxScore, setMaxScore] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createRecruiterQuestion({ prompt, hint, maxScore });
        setPrompt('');
        setHint('');
        setMaxScore(10);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save this question.');
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteRecruiterQuestion(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete this question.');
      }
    });
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2>Add a question</h2>
        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label htmlFor="q-prompt">Question</label>
            <textarea
              id="q-prompt"
              required
              rows={3}
              maxLength={1000}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Walk us through a project you are proud of."
            />
          </div>
          <div className="form-group">
            <label htmlFor="q-hint">Guidance for the candidate (optional)</label>
            <input
              id="q-hint"
              maxLength={300}
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder="e.g. Focus on your specific contribution."
            />
          </div>
          <div className="form-group" style={{ maxWidth: '200px' }}>
            <label htmlFor="q-score">Marks</label>
            <input
              id="q-score"
              type="number"
              min={1}
              max={100}
              value={maxScore}
              onChange={e => setMaxScore(Number(e.target.value))}
            />
          </div>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary btn-sm" disabled={pending || !prompt.trim()}>
            {pending ? 'Saving...' : 'Save question'}
          </button>
        </form>
      </div>

      <h2>Your questions ({questions.length})</h2>
      {questions.length === 0 ? (
        <div className="card empty-state">
          <p>You have not written any questions yet.</p>
        </div>
      ) : (
        <div className="stack">
          {questions.map(question => (
            <article key={question.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>{question.prompt}</p>
                  {question.hint && <p className="muted small">{question.hint}</p>}
                  <p className="muted small">{question.maxScore} marks</p>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => handleDelete(question.id)}
                  disabled={pending}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
