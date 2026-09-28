'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyForJob } from '@/lib/actions';

export default function ApplyButton({
  jobId,
  hasApplied,
}: {
  jobId: string;
  hasApplied: boolean;
}) {
  const router = useRouter();
  const [applied, setApplied] = useState(hasApplied);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApply() {
    setError(null);
    startTransition(async () => {
      try {
        await applyForJob(jobId);
        setApplied(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not submit your application.');
      }
    });
  }

  if (applied) {
    return (
      <div className="apply-done">
        <strong>Application submitted.</strong>
        <a href="/student/dashboard">Track your application</a>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="btn-primary btn-lg" onClick={handleApply} disabled={pending}>
        {pending ? 'Submitting...' : 'Apply Now'}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
