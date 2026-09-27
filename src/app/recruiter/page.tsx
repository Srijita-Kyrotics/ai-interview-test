'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createJob, getJobs, getSkillSuggestions } from '@/lib/actions';
import { Job } from '@/lib/store';

export default function RecruiterDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [skillInput, setSkillInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = async () => setJobs(await getJobs());

  const handleSkillChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSkillInput(val);
    if (val.length > 0) {
      const sugs = await getSkillSuggestions(val);
      setSuggestions(sugs.filter(s => !selectedSkills.includes(s)));
    } else {
      setSuggestions([]);
    }
  };

  const addSkill = (skill: string) => {
    if (!selectedSkills.includes(skill)) setSelectedSkills([...selectedSkills, skill]);
    setSkillInput('');
    setSuggestions([]);
  };

  const removeSkill = (skill: string) => setSelectedSkills(selectedSkills.filter(s => s !== skill));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createJob({ title, description, skillsRequired: selectedSkills, recruiterId: 'recruiter1' });
    setTitle(''); setDescription(''); setSelectedSkills([]); loadJobs();
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Recruiter Dashboard</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
        <div className="glass-card" style={{ alignSelf: 'start' }}>
          <h2>Post New Role</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Job Title</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Backend Engineer" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the role..." style={{ minHeight: '120px' }} />
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
              <label>Required Skills</label>
              <input value={skillInput} onChange={handleSkillChange} placeholder="Search skills..." />
              {suggestions.length > 0 && (
                <div className="suggestions-box">
                  {suggestions.map(s => <div key={s} className="suggestion-item" onClick={() => addSkill(s)}>{s}</div>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                {selectedSkills.map(s => (
                  <span key={s} className="badge">
                    {s} <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => removeSkill(s)}>×</span>
                  </span>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>Publish Role</button>
          </form>
        </div>

        <div>
          <h2>Active Roles</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {jobs.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No active roles posted yet.</p> : jobs.map(job => (
              <div key={job.id} className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{job.title}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {job.skillsRequired.slice(0, 3).map(s => <spaney={s} className="badge" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>{s}</spaney>)}
                    {job.skillsRequired.length > 3 && <span className="badge" style={{ fontSize: '0.75rem', background: 'transparent' }}>+{job.skillsRequired.length - 3}</span>}
                  </div>
                </div>
                <Link href={`/recruiter/jobs/${job.id}`} className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--card-border)' }}>
                  Manage Pipeline
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
