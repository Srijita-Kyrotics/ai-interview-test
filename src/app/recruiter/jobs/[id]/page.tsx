'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getJob, getJobApplications, updateApplicationStage } from '@/lib/actions';
import { Job, Application, Student, ApplicationStage, PIPELINE_STAGES } from '@/lib/store';

export default function JobApplicantsPipeline({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<(Application & { student?: Student })[]>([]);

  useEffect(() => { loadData(); }, [params.id]);

  const loadData = async () => {
    setJob(await getJob(params.id));
    setApplications(await getJobApplications(params.id));
  };

  const handleStageChange = async (appId: string, newStage: ApplicationStage) => {
    await updateApplicationStage(appId, newStage);
    loadData();
  };

  if (!job) return <div className="container" style={{ textAlign: 'center' }}>Loading Pipeline...</div>;

  return (
    <div className="container" style={{ maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/recruiter" style={{ color: 'var(--accent)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>← Back to Dashboard</Link>
        <h1>Pipeline: {job.title}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <span style={{ color: 'var(--text-muted)', marginRight: '1rem', alignSelf: 'center' }}>Requirements:</span>
          {job.skillsRequired.map(s => <span key={s} className="badge">{s}</span>)}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
        {applications.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No applicants for this role yet.</div>
        ) : (
          <table>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th>Candidate</th>
                <th>Skills Match</th>
                <th>Match %</th>
                <th>Current Stage</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'white', marginBottom: '0.25rem' }}>{app.student?.name}</div>
                    <div style={{ fontSize: '0.8rem', display: 'flex', gap: '0.5rem' }}>
                      <a href={app.student?.github} target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>GitHub</a>
                      <a href={app.student?.linkedin} target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>LinkedIn</a>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '250px' }}>
                      {app.student?.skills.map(s => {
                        const isMatch = job.skillsRequired.includes(s);
                        return (
                          <span key={s} style={{ 
                            fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px',
                            background: isMatch ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: isMatch ? '#86efac' : '#ccc'
                          }}>
                            {s}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <div style={{ 
                      fontSize: '1.25rem', fontWeight: 700,
                      color: app.matchScore >= 80 ? 'var(--success)' : app.matchScore >= 50 ? 'var(--warning)' : 'var(--danger)'
                    }}>
                      {Math.round(app.matchScore)}%
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                      {app.stage}
                    </span>
                  </td>
                  <td>
                    <select 
                      value={app.stage} 
                      onChange={(e) => handleStageChange(app.id, e.target.value as ApplicationStage)}
                      style={{ padding: '0.5rem', width: '150px' }}
                    >
                      <optgroup label="Pipeline Stages">
                        {PIPELINE_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                      </optgroup>
                      <optgroup label="Decisions">
                        <option value="Selected">Selected</option>
                        <option value="Rejected">Rejected</option>
                      </optgroup>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
