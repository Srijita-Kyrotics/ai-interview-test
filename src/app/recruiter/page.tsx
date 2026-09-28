import Link from 'next/link';
import PostOpportunityForm from '@/components/PostOpportunityForm';
import RecruiterSignIn from '@/components/RecruiterSignIn';
import { SignOutRecruiterButton } from '@/components/SessionButtons';
import { getCurrentRecruiter, getJobsByRecruiter } from '@/lib/actions';
import { OPPORTUNITY_TYPE_LABELS } from '@/lib/types';

export const metadata = { title: 'Recruiter dashboard' };

export default async function RecruiterDashboardPage() {
  const recruiter = await getCurrentRecruiter();
  if (!recruiter) return <RecruiterSignIn />;

  const jobs = await getJobsByRecruiter(recruiter.id);

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Recruiter dashboard</h1>
          <p className="lead-muted">
            Signed in as {recruiter.name}
            {recruiter.company ? ` at ${recruiter.company}` : ''}
          </p>
        </div>
        <div className="head-actions">
          <Link href="/">Home</Link>
          <SignOutRecruiterButton />
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-side">
          <PostOpportunityForm recruiterId={recruiter.id} />
        </div>

        <div>
          <h2>Your roles</h2>
          {jobs.length === 0 ? (
            <div className="card empty-state">
              <p>You have not posted any roles yet.</p>
            </div>
          ) : (
            <div className="stack">
              {jobs.map(job => (
                <article key={job.id} className="card job-card">
                  <div className="job-card-top">
                    <span className="tag">{OPPORTUNITY_TYPE_LABELS[job.type]}</span>
                  </div>
                  <h3>{job.title}</h3>
                  <p className="job-desc">{job.description}</p>
                  <div className="chip-row">
                    {job.skillsRequired.slice(0, 5).map(skill => (
                      <span key={skill} className="badge badge-dim">
                        {skill}
                      </span>
                    ))}
                    {job.skillsRequired.length > 5 && (
                      <span className="badge badge-dim">
                        +{job.skillsRequired.length - 5} more
                      </span>
                    )}
                  </div>
                  <div className="job-card-foot">
                    <Link href={`/recruiter/jobs/${job.id}`} className="btn-primary btn-sm">
                      Manage pipeline
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
