'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveJobCustomRound } from '@/lib/custom-actions';

export interface BankQuestionOption {
  id: string;
  prompt: string;
  maxScore: number;
}

export default function CustomRoundSettings({
  jobId,
  bank,
  initial,
}: {
  jobId: string;
  bank: BankQuestionOption[];
  initial: { enabled: boolean; passThreshold: number; questionIds: string[] };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [passThreshold, setPassThreshold] = useState(initial.passThreshold);
  const [selected, setSelected] = useState<string[]>(initial.questionIds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSaved(false);
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        // Preserve the order the questions appear in the bank for grading order.
        const ordered = bank.filter(q => selected.includes(q.id)).map(q => q.id);
        await saveJobCustomRound(jobId, { enabled, passThreshold, questionIds: ordered });
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the screening round.');
      }
    });
  }

  return (
    <div className="panel">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <h3>Screening round (optional)</h3>
          <p className="lead-muted">
            Add your own questions as the first round of this role&apos;s pipeline. Candidates answer
            them and you grade the answers manually.
          </p>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            setSaved(false);
            setEnabled(e.target.checked);
          }}
          disabled={bank.length === 0}
        />
        Enable the screening round for this role
      </label>

      {bank.length === 0 ? (
        <p className="lead-muted">
          Your question bank is empty.{' '}
          <Link href="/recruiter/questions">Add questions</Link> first.
        </p>
      ) : (
        <>
          <div className="form-group" style={{ maxWidth: '220px' }}>
            <label htmlFor="custom-threshold">Pass mark (%)</label>
            <input
              id="custom-threshold"
              type="number"
              min={1}
              max={100}
              value={passThreshold}
              onChange={e => {
                setSaved(false);
                setPassThreshold(Number(e.target.value));
              }}
            />
          </div>

          <div className="form-group">
            <span className="label-like">Questions in this round ({selected.length} selected)</span>
            <div className="stack" style={{ gap: '0.5rem' }}>
              {bank.map(question => (
                <label
                  key={question.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(question.id)}
                    onChange={() => toggle(question.id)}
                  />
                  <span>
                    {question.prompt}
                    <span className="muted small"> · {question.maxScore} marks</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="round-words-ok">Screening round saved.</p>}

      <button
        type="button"
        className="btn-primary btn-sm"
        onClick={handleSave}
        disabled={pending || (enabled && selected.length === 0)}
        style={{ marginTop: '0.5rem' }}
      >
        {pending ? 'Saving...' : 'Save screening round'}
      </button>
    </div>
  );
}
