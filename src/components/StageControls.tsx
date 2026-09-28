'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { advanceApplicationStage, updateApplicationStage } from '@/lib/actions';
import { FINAL_STAGES, PIPELINE_STAGES } from '@/lib/types';
import type { ApplicationStage } from '@/lib/types';

type StageControlsProps = {
  applicationId: string;
  stage: ApplicationStage;
};

/** Recruiter control for moving a candidate through the hiring funnel. */
export default function StageControls({ applicationId, stage }: StageControlsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentIndex = PIPELINE_STAGES.indexOf(stage);
  const decided = FINAL_STAGES.includes(stage);
  const nextStage = PIPELINE_STAGES[currentIndex + 1] ?? null;

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update this stage.');
      }
    });
  }

  return (
    <div className="stage-controls">
      <select
        aria-label="Recruitment stage"
        value={stage}
        disabled={pending}
        onChange={e => run(() => updateApplicationStage(applicationId, e.target.value))}
      >
        <optgroup label="Pipeline stages">
          {PIPELINE_STAGES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </optgroup>
        <optgroup label="Final result">
          {FINAL_STAGES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </optgroup>
      </select>

      {nextStage && !decided && (
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() => run(() => advanceApplicationStage(applicationId, 'next'))}
        >
          Move to {nextStage}
        </button>
      )}

      {!decided && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() => run(() => advanceApplicationStage(applicationId, 'reject'))}
        >
          Reject
        </button>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
