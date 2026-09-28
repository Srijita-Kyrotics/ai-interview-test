import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import PipelineTracker from '@/components/PipelineTracker';
import SkillMatchSummary from '@/components/SkillMatchSummary';
import StageControls from '@/components/StageControls';
import { RoundStatusBadge } from '@/components/rounds/RoundStatus';
import { ACTIVE_ROUND_KINDS } from '@/lib/assessment/types';
import { getCurrentRecruiter, getJob, getJobApplications } from '@/lib/actions';
import { getRoundStatesForRecruiter } from '@/lib/round-actions';
import { OPPORTUNITY_TYPE_LABELS, PIPELINE_STAGES } from '@/lib/types';
import type { RoundState } from '@/lib/assessment/types';
import type { ApplicationWithStudent, Job } from '@/lib/types';

type JobPipelinePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: JobPipelinePageProps) {
  const { id } = await params;
  const job = await getJob(id);
  return { title: job ? `${job.title} pipeline` : 'Opportunity not found' };
}

export default async function JobPipelinePage({ params }: JobPipelinePageProps) {
  const { id } = await params;

  const recruiter = await getCurrentRecruiter();
  if (!recruiter) redirect('/recruiter');

  const job = await getJob(id);
  if (!job) notFound();
  // A recruiter may only see the pipeline for their own roles.
  if (job.recruiterId !== recruiter.id) notFound();

  const applications = await getJobApplications(job.id);

  // One batched pass so each card can show its round status without N+1 calls.
  const roundByApplication = new Map<string, RoundState>();
  await Promise.all(
    applications.map(async application => {
      const states = await getRoundStatesForRecruiter(application.id, ACTIVE_ROUND_KINDS);
      const communication = states.communication;
      if (communication) roundByApplication.set(application.id, communication);
    }),
  );

  const decided = applications.filter(
    a => a.stage === 'Selected' || a.stage === 'Rejected',
  );
  const active = applications.filter(a => !decided.includes(a));

  return (
    <div className="container container-wide">
      <Link href="/recruiter" className="back-link">
        &larr; Back to dashboard
      </Link>

      <div className="page-head">
        <div>
          <div className="job-card-top">
            <span className="tag">{OPPORTUNITY_TYPE_LABELS[job.type]}</span>
          </div>
          <h1>{job.title}</h1>
          <p className="lead-muted">
            {applications.length} {applications.length === 1 ? 'applicant' : 'applicants'}
          </p>
        </div>
      </div>

      <div className="panel">
        <h3>Required skills</h3>
        {job.skillsRequired.length === 0 ? (
          <p className="lead-muted">No required skills were listed for this role.</p>
        ) : (
          <div className="chip-row">
            {job.skillsRequired.map(skill => (
              <span key={skill} className="badge">
                {skill}
              </span>
            ))}
          </div>
        )}
        {job.eligibility && (
          <>
            <h3>Eligibility &amp; requirements</h3>
            <p className="prose">{job.eligibility}</p>
          </>
        )}
      </div>

      <h2>Pipeline</h2>
      {applications.length === 0 ? (
        <div className="card empty-state">
          <p>No applicants yet. Applications will appear here automatically.</p>
        </div>
      ) : (
        <>
          {PIPELINE_STAGES.map(stage => {
            const candidates = active.filter(a => a.stage === stage);
            if (candidates.length === 0) return null;
            return (
              <section key={stage} className="stage-group">
                <h3 className="stage-group-title">
                  {stage} <span className="count">{candidates.length}</span>
                </h3>
                <div className="stack">
                  {candidates.map(application => (
                    <CandidateCard
                      key={application.id}
                      application={application}
                      job={job}
                      round={roundByApplication.get(application.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {decided.length > 0 && (
            <section className="stage-group">
              <h3 className="stage-group-title">Final result</h3>
              <div className="stack">
                {decided.map(application => (
                  <CandidateCard
                  key={application.id}
                  application={application}
                  job={job}
                  round={roundByApplication.get(application.id)}
                />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CandidateCard({
  application,
  job,
  round,
}: {
  application: ApplicationWithStudent;
  job: Job;
  round?: RoundState;
}) {
  const { student } = application;
  return (
    <article className="card">
      <div className="candidate-head">
        <div>
          <h4>
            <Link href={`/recruiter/candidates/${application.id}`}>{student.name}</Link>
          </h4>
          <div className="link-row">
            {student.github && (
              <a href={student.github} target="_blank" rel="noreferrer noopener">
                GitHub
              </a>
            )}
            {student.linkedin && (
              <a href={student.linkedin} target="_blank" rel="noreferrer noopener">
                LinkedIn
              </a>
            )}
          </div>
        </div>
        <div className="candidate-badges">
          <span className={`stage-pill stage-${slug(application.stage)}`}>
            {application.stage}
          </span>
          {round && round.status !== 'locked' && <RoundStatusBadge state={round} showScore />}
        </div>
      </div>

      <div className="candidate-body">
        <div>
          <h4 className="sub-label">Skill match</h4>
          <SkillMatchSummary
            job={job}
            student={student}
            matchedSkills={application.matchedSkills}
          />
        </div>
        <div>
          <h4 className="sub-label">Student skills</h4>
          <div className="chip-row">
            {student.skills.length === 0 && (
              <span className="lead-muted">No skills on this profile.</span>
            )}
            {student.skills.map(skill => (
              <span
                key={skill}
                className={`badge ${job.skillsRequired.includes(skill) ? 'badge-success' : 'badge-dim'}`}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>

      <PipelineTracker stage={application.stage} />

      <StageControls applicationId={application.id} stage={application.stage} />
    </article>
  );
}

function slug(stage: string) {
  return stage.toLowerCase().replace(/\s+/g, '-');
}
