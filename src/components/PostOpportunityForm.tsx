'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SkillPicker from '@/components/SkillPicker';
import { createJob } from '@/lib/actions';
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS } from '@/lib/types';
import type { OpportunityType, Skill } from '@/lib/types';

export default function PostOpportunityForm({ recruiterId }: { recruiterId: string }) {
  const router = useRouter();
  const [type, setType] = useState<OpportunityType>('job');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eligibility, setEligibility] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createJob({
          type,
          title,
          description,
          eligibility,
          skillsRequired: skills,
          recruiterId,
        });
        setTitle('');
        setDescription('');
        setEligibility('');
        setSkills([]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not publish this role.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <h2>Post a new role</h2>

      <div className="form-group">
        <span className="label-like">Opportunity type</span>
        <div className="segmented" role="radiogroup" aria-label="Opportunity type">
          {OPPORTUNITY_TYPES.map(t => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={`segment ${type === t ? 'is-active' : ''}`}
              onClick={() => setType(t)}
            >
              {OPPORTUNITY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="job-title">Title</label>
        <input
          id="job-title"
          required
          maxLength={120}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Backend Developer Intern"
        />
      </div>

      <div className="form-group">
        <label htmlFor="job-description">Description</label>
        <textarea
          id="job-description"
          required
          maxLength={4000}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What the role involves, the team, and what you will build."
        />
      </div>

      <div className="form-group">
        <label htmlFor="job-eligibility">Eligibility &amp; requirements</label>
        <textarea
          id="job-eligibility"
          className="textarea-sm"
          maxLength={2000}
          value={eligibility}
          onChange={e => setEligibility(e.target.value)}
          placeholder="e.g. Final-year B.Tech students, 60% aggregate, no prior internship required."
        />
      </div>

      <SkillPicker
        label="Required skills"
        placeholder="Search standardized skills, e.g. FastAPI"
        selected={skills}
        onChange={setSkills}
      />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary btn-lg" disabled={pending}>
        {pending ? 'Publishing...' : 'Publish role'}
      </button>
    </form>
  );
}
