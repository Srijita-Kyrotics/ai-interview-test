'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInRecruiter } from '@/lib/actions';

export default function RecruiterSignIn() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await signInRecruiter(name, company);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not sign you in.');
      }
    });
  }

  return (
    <div className="container container-narrow">
      <div className="card">
        <h1>Recruiter sign in</h1>
        <p className="lead-muted">
          Sign in to post roles and manage your hiring pipeline.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="recruiter-name">Your name</label>
            <input
              id="recruiter-name"
              required
              maxLength={80}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Srijita Ghorai"
            />
          </div>
          <div className="form-group">
            <label htmlFor="recruiter-company">Company</label>
            <input
              id="recruiter-company"
              required
              maxLength={80}
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary btn-lg" disabled={pending}>
            {pending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
