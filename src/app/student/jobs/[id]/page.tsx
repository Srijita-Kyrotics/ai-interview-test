import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ApplyButton from '@/components/ApplyButton';
import { getCurrentStudent, getJob, getStudentApplications } from '@/lib/actions';
import { OPPORTUNITY_TYPE_LABELS, calculateSkillMatch } from '@/lib/types';

type JobDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: JobDetailPageProps) {
  const { id } = await params;
  const job = await getJob(id);
  return { title: job ? job.title : 'Opportunity not found' };
}

export default async function StudentJobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const student = await getCurrentStudent();
  if (!student) redirect('/student');

  const job = await getJob(id);
  if (!job) notFound();

  const applications = await getStudentApplications(student.id);
  const hasApplied = applications.some(a => a.jobId === job.id);
  const match = calculateSkillMatch(job.skillsRequired, student.skills);

  return (
    <div className="container container-narrow">
      <Link href="/student/jobs" className="back-link">
        &larr; All opportunities
      </Link>

      <article className="card">
        <div className="job-card-top">
          <span className="tag">{OPPORTUNITY_TYPE_LABELS[job.type]}</span>
          <span className="match-inline">
            {match.matched.length}/{match.total} of your skills match
          </span>
        </div>

        <h1>{job.title}</h1>

        <section>
          <h2>About this role</h2>
          <p className="prose">{job.description}</p>
        </section>

        <section>
          <h2>Required skills</h2>
          {job.skillsRequired.length === 0 ? (
            <p className="lead-muted">No specific skills were listed.</p>
          ) : (
            <div className="chip-row">
              {job.skillsRequired.map(skill => (
                <span
                  key={skill}
                  className={`badge ${match.matched.includes(skill) ? 'badge-success' : 'badge-dim'}`}
                >
                  {match.matched.includes(skill) ? '✓' : '✗'} {skill}
                </span>
              ))}
            </div>
          )}
        </section>

        {job.eligibility && (
          <section>
            <h2>Eligibility &amp; requirements</h2>
            <p className="prose">{job.eligibility}</p>
          </section>
        )}

        <section>
          <h2>What happens next</h2>
          <p className="lead-muted">
            Your application moves through Screening, Communication, Aptitude, Technical 1,
            Technical 2 and HR rounds. You can follow every stage from your dashboard.
          </p>
        </section>

        <hr className="divider" />
        <ApplyButton jobId={job.id} hasApplied={hasApplied} />
      </article>
    </div>
  );
}
