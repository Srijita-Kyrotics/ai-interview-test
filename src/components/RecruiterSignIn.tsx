'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInRecruiter, signUpRecruiter } from '@/lib/actions';
import { DEMO_PASSWORD, DEMO_RECRUITER } from '@/lib/demo-credentials';

export default function RecruiterSignIn() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [isSignIn, setIsSignIn] = useState(true);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (isSignIn) {
          await signInRecruiter(name, company, password);
        } else {
          await signUpRecruiter(name, company, password);
        }
        setPassword('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    });
  }

  return (
    <div className="container container-narrow">
      <div className="card">
        <h1>{isSignIn ? 'Recruiter sign in' : 'Create recruiter profile'}</h1>
        <p className="lead-muted">
          {isSignIn 
            ? 'Sign in to manage your hiring pipeline.' 
            : 'Sign up to post roles and manage your hiring pipeline.'}
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
              placeholder="Jane Smith"
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
              placeholder="Your company"
            />
          </div>
          <div className="form-group">
            <label htmlFor="recruiter-password">Password</label>
            <input
              id="recruiter-password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isSignIn ? 'Your password' : 'At least 8 characters'}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary btn-lg" disabled={pending}>
              {pending ? (isSignIn ? 'Signing in...' : 'Creating profile...') : (isSignIn ? 'Sign in' : 'Create profile')}
            </button>
            <button 
              type="button" 
              className="btn-ghost" 
              onClick={() => { setIsSignIn(!isSignIn); setError(null); }}
            >
              {isSignIn ? "Don't have an account? Create profile" : "Already have an account? Sign in"}
            </button>
          </div>
          {isSignIn && (
            <div
              style={{
                marginTop: '1.25rem',
                padding: '0.85rem 1rem',
                border: '1px dashed var(--border-strong, var(--border))',
                borderRadius: '12px',
                background: 'var(--surface-hover)',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
              }}
            >
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '0.25rem' }}>
                Demo account
              </strong>
              <span>Name: {DEMO_RECRUITER.name}</span>
              <br />
              <span>Company: {DEMO_RECRUITER.company}</span>
              <br />
              <span>Password: {DEMO_PASSWORD}</span>
              <br />
              <button
                type="button"
                className="btn-ghost btn-sm"
                style={{ marginTop: '0.6rem' }}
                onClick={() => {
                  setName(DEMO_RECRUITER.name);
                  setCompany(DEMO_RECRUITER.company);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
              >
                Fill demo credentials
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
