import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import PipelineTracker from '@/components/PipelineTracker';
import SkillMatchSummary from '@/components/SkillMatchSummary';
import StageControls from '@/components/StageControls';
import { RecruiterRoundCard } from '@/components/rounds/RecruiterRoundCard';
import { ACTIVE_ROUND_KINDS } from '@/lib/assessment/types';
import { getApplication, getCurrentRecruiter, getJob, getStudent } from '@/lib/actions';
import { getRoundStatesForRecruiter } from '@/lib/round-actions';
import { OPPORTUNITY_TYPE_LABELS } from '@/lib/types';

type CandidatePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: CandidatePageProps) {
  const { id } = await params;
  const application = await getApplication(id);
  const student = application ? await getStudent(application.studentId) : null;
  return { title: student ? student.name : 'Candidate not found' };
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const { id } = await params;

  const recruiter = await getCurrentRecruiter();
  if (!recruiter) redirect('/recruiter');

  const application = await getApplication(id);
  if (!application) notFound();

  const [job, student] = await Promise.all([
    getJob(application.jobId),
    getStudent(application.studentId),
  ]);
  if (!job || !student) notFound();
  // Recruiters may only open candidates who applied to their own roles.
  if (job.recruiterId !== recruiter.id) notFound();

  const roundStates = await getRoundStatesForRecruiter(id, ACTIVE_ROUND_KINDS);
  const rounds = Object.values(roundStates);

  return (
    <div className="container container-narrow">
      <Link href={`/recruiter/jobs/${job.id}`} className="back-link">
        &larr; Back to {job.title}
      </Link>

      <article className="card">
        <div className="page-head">
          <div>
            <h1>{student.name}</h1>
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
              {!student.github && !student.linkedin && (
                <span className="lead-muted">No profile links provided.</span>
              )}
            </div>
          </div>
          <span className={`stage-pill stage-${slug(application.stage)}`}>
            {application.stage}
          </span>
        </div>

        <section>
          <h2>Applying for</h2>
          <p className="prose">
            <span className="tag">{OPPORTUNITY_TYPE_LABELS[job.type]}</span> {job.title}
          </p>
        </section>

        <section>
          <h2>Skill match for this role</h2>
          <SkillMatchSummary
            job={job}
            student={student}
            matchedSkills={application.matchedSkills}
          />
        </section>

        <section>
          <h2>Assessment rounds</h2>
          <div className="stack">
            {rounds.map(state => (
              <RecruiterRoundCard key={state.kind} state={state} />
            ))}
          </div>
        </section>

        <section>
          <h2>Hiring progress</h2>
          <PipelineTracker stage={application.stage} />
          <StageControls applicationId={application.id} stage={application.stage} />
        </section>

        <section>
          <h2>All skills on the student profile</h2>
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
        </section>

        <hr className="divider" />
        <p className="lead-muted">Applied on {formatDate(application.createdAt)}</p>
      </article>
    </div>
  );
}

function slug(stage: string) {
  return stage.toLowerCase().replace(/\s+/g, '-');
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
