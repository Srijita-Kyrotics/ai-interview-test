'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInStudent } from '@/lib/actions';
import StudentProfileForm from './StudentProfileForm';

export default function StudentAuth() {
  const router = useRouter();
  const [isSignIn, setIsSignIn] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await signInStudent(name, password);
        router.push('/student/dashboard');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not sign in.');
      }
    });
  }

  if (!isSignIn) {
    return (
      <div className="card">
        <h1>Create your student profile</h1>
        <p className="lead-muted">
          Your skills drive job matching, so pick them from the standardized list.
        </p>
        <StudentProfileForm submitLabel="Create profile and continue" />
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button 
            type="button" 
            className="btn-ghost" 
            onClick={() => setIsSignIn(true)}
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Student sign in</h1>
      <p className="lead-muted">
        Sign in to view your dashboard and apply for roles.
      </p>
      <form onSubmit={handleSignIn}>
        <div className="form-group">
          <label htmlFor="student-name">Your full name</label>
          <input
            id="student-name"
            required
            maxLength={80}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John Doe"
          />
        </div>
        <div className="form-group">
          <label htmlFor="student-password">Password</label>
          <input
            id="student-password"
            type="password"
            maxLength={80}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
          />
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <button type="submit" className="btn-primary btn-lg" disabled={pending}>
            {pending ? 'Signing in...' : 'Sign in'}
          </button>
          <button 
            type="button" 
            className="btn-ghost" 
            onClick={() => { setIsSignIn(false); setError(null); }}
          >
            Don't have an account? Create profile
          </button>
        </div>
      </form>
    </div>
  );
}
