'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SkillPicker from '@/components/SkillPicker';
import { createStudent, updateStudent } from '@/lib/actions';
import type { Skill } from '@/lib/types';

type StudentProfileFormProps = {
  /** Omit to run the onboarding flow and start a session on submit. */
  studentId?: string;
  initial?: {
    name: string;
    /** Only needed for sign-up; the edit form has no password field. */
    password?: string;
    github: string;
    linkedin: string;
    skills: Skill[];
  };
  submitLabel: string;
};

const EMPTY = { name: '', password: '', github: '', linkedin: '', skills: [] as Skill[] };

export default function StudentProfileForm({
  studentId,
  initial,
  submitLabel,
}: StudentProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setValues(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (studentId) {
          await updateStudent(studentId, values);
        } else {
          await createStudent({ ...values, password: values.password ?? '' });
        }
        router.push('/student/dashboard');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="row-2">
        <div className="form-group">
          <label htmlFor="name">Full name</label>
          <input
            id="name"
            required
            maxLength={80}
            value={values.name}
            onChange={e => set('name', e.target.value)}
            placeholder="John Doe"
          />
        </div>
        {!studentId && (
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={values.password}
              onChange={e => set('password', e.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              You will need this password to sign in again.
            </p>
          </div>
        )}
      </div>

      <div className="row-2">
        <div className="form-group">
          <label htmlFor="github">GitHub profile</label>
          <input
            id="github"
            type="url"
            value={values.github}
            onChange={e => set('github', e.target.value)}
            placeholder="https://github.com/..."
          />
        </div>
        <div className="form-group">
          <label htmlFor="linkedin">LinkedIn profile</label>
          <input
            id="linkedin"
            type="url"
            value={values.linkedin}
            onChange={e => set('linkedin', e.target.value)}
            placeholder="https://linkedin.com/in/..."
          />
        </div>
      </div>

      <SkillPicker
        label="Technical skills"
        placeholder="Start typing, e.g. Pyth or React"
        selected={values.skills}
        onChange={skills => set('skills', skills)}
      />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary btn-lg" disabled={pending}>
        {pending ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
