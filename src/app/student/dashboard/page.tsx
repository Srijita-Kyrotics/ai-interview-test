'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJobs, getStudentApplications, applyForJob, getStudent } from '@/lib/actions';
import { Job, Application, Student, PIPELINE_STAGES } from '@/lib/store';

export default function StudentDashboard() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId');

  const [student, setStudent] = useState<Student | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<(Application & { job?: Job })[]>([]);
  
  useEffect(() => {
    if (studentId) loadData();
  }, [studentId]);

  const loadData = async () => {
    if (!studentId) return;
    const s = await getStudent(studentId);
    setStudent(s);
    setJobs(await getJobs());
    setApplications(await getStudentApplications(studentId));
  };

  const handleApply = async (jobId: string) => {
    if (!studentId) return;
    await applyForJob(studentId, jobId);
    await loadData();
  };

  if (!student) return <div className="container" style={{ textAlign: 'center' }}>Loading your dashboard...</div>;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Welcome, {student.name}</h1>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {student.skills.map(s => <span key={s} className="badge">{s}</span>)}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: '3rem' }}>Your Applications</h2>
      {applications.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>You haven't applied to any roles yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {applications.map(app => (
            <div key={app.id} className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3>{app.job?.title}</h3>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>{app.stage}</span>
              </div>
              
              <div className="pipeline">
                {[...PIPELINE_STAGES, 'Selected', 'Rejected'].map(stage => {
                  if (stage === 'Selected' || stage === 'Rejected') {
                    if (app.stage !== 'Selected' && app.stage !== 'Rejected') return null;
                    if (stage !== app.stage) return null;
                  }
                  return (
                    <div key={stage} className={`pipeline-stage ${app.stage === stage ? 'active' : ''}`}>
                      {stage}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: '3rem' }}>Available Opportunities</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {jobs.map(job => {
          const hasApplied = applications.some(a => a.jobId === job.id);
          return (
            <div key={job.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.25rem' }}>{job.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', flex: 1 }}>{job.description}</p>
              
              <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {job.skillsRequired.map(s => <span key={s} className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>{s}</span>)}
              </div>
              
              <button onClick={() => handleApply(job.id)} disabled={hasApplied} className="btn-primary" style={{ width: '100%' }}>
                {hasApplied ? 'Application Submitted' : 'Apply Now'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
