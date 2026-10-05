'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInRecruiter, signUpRecruiter } from '@/lib/actions';

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
        </form>
      </div>
    </div>
  );
}
