import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StartOverButton } from '@/components/SessionButtons';
import { getCurrentStudent, getOpenJobs, getStudentApplications } from '@/lib/actions';
import { OPPORTUNITY_TYPE_LABELS, calculateSkillMatch } from '@/lib/types';

export const metadata = { title: 'Browse opportunities' };

export default async function StudentJobsPage() {
  const [student, jobs] = await Promise.all([getCurrentStudent(), getOpenJobs()]);
  if (!student) redirect('/student');

  const applications = await getStudentApplications(student.id);
  const appliedJobIds = new Set(applications.map(a => a.jobId));

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Browse opportunities</h1>
          <p className="lead-muted">
            {jobs.length} open {jobs.length === 1 ? 'role' : 'roles'} matched against your skills.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/student/dashboard">My applications</Link>
          <Link href="/student/profile">My profile</Link>
          <StartOverButton />
        </div>
      </div>

      {jobs.length === 0 && (
        <div className="card empty-state">
          <p>No roles have been posted yet. Check back soon.</p>
        </div>
      )}

      <div className="job-grid">
        {jobs.map(job => {
          const match = calculateSkillMatch(job.skillsRequired, student.skills);
          const hasApplied = appliedJobIds.has(job.id);
          return (
            <article key={job.id} className="card job-card">
              <div className="job-card-top">
                <span className="tag">{OPPORTUNITY_TYPE_LABELS[job.type]}</span>
                {hasApplied && <span className="tag tag-success">Applied</span>}
              </div>
              <h3>
                <Link href={`/student/jobs/${job.id}`}>{job.title}</Link>
              </h3>
              <p className="job-desc">{job.description}</p>
              <div className="chip-row">
                {job.skillsRequired.map(skill => (
                  <span
                    key={skill}
                    className={`badge ${match.matched.includes(skill) ? '' : 'badge-dim'}`}
                  >
                    {skill}
                  </span>
                ))}
              </div>
              <div className="job-card-foot">
                <span className="match-inline">
                  {match.matched.length}/{match.total} skills matched
                </span>
                <Link href={`/student/jobs/${job.id}`} className="btn-primary btn-sm">
                  View details
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
