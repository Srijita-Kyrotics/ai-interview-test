import Link from 'next/link';
import { redirect } from 'next/navigation';
import PipelineTracker from '@/components/PipelineTracker';
import { RoundStatusBadge } from '@/components/rounds/RoundStatus';
import { StartOverButton } from '@/components/SessionButtons';
import { ACTIVE_ROUND_KINDS } from '@/lib/assessment/types';
import { isRoundActionable } from '@/lib/assessment/status';
import { getCurrentStudent, getStudentApplications } from '@/lib/actions';
import { OPPORTUNITY_TYPE_LABELS, calculateSkillMatch, matchLabel } from '@/lib/types';
import { buildAllRoundStates } from '@/lib/rounds';

export const metadata = { title: 'My applications' };

export default async function StudentDashboardPage() {
  const student = await getCurrentStudent();
  if (!student) redirect('/student');

  const applications = await getStudentApplications(student.id);
  const inProgress = applications.filter(
    a => a.stage !== 'Selected' && a.stage !== 'Rejected',
  ).length;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Welcome, {student.name}</h1>
          <div className="chip-row">
            {student.skills.map(skill => (
              <span key={skill} className="badge">
                {skill}
              </span>
            ))}
            {student.skills.length === 0 && (
              <span className="lead-muted">No skills selected yet.</span>
            )}
          </div>
        </div>
        <div className="head-actions">
          <Link href="/student/jobs">Browse opportunities</Link>
          <Link href="/student/profile">Edit profile</Link>
          <StartOverButton />
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{applications.length}</span>
          <span className="stat-label">Total applied</span>
        </div>
        <div className="stat">
          <span className="stat-value">{inProgress}</span>
          <span className="stat-label">In progress</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {applications.filter(a => a.stage === 'Selected').length}
          </span>
          <span className="stat-label">Selected</span>
        </div>
      </div>

      <h2>Your applications</h2>
      {applications.length === 0 ? (
        <div className="card empty-state">
          <p>You have not applied to any roles yet.</p>
          <Link href="/student/jobs" className="btn-primary btn-sm">
            Browse opportunities
          </Link>
        </div>
      ) : (
        <div className="stack">
          {applications.map(application => {
            const match = calculateSkillMatch(
              application.job.skillsRequired,
              student.skills,
            );
            return (
              <article key={application.id} className="card">
                <div className="app-head">
                  <div>
                    <span className="tag">{OPPORTUNITY_TYPE_LABELS[application.job.type]}</span>
                    <h3>
                      <Link href={`/student/jobs/${application.job.id}`}>
                        {application.job.title}
                      </Link>
                    </h3>
                  </div>
                  <span className={`stage-pill stage-${slug(application.stage)}`}>
                    {application.stage}
                  </span>
                </div>

                <PipelineTracker stage={application.stage} />

                {(() => {
                  const rounds = buildAllRoundStates(application, ACTIVE_ROUND_KINDS);
                  const open = Object.values(rounds).find(isRoundActionable);
                  const done = Object.values(rounds).filter(
                    r => r.status === 'passed' || r.status === 'failed',
                  );
                  return (
                    <div className="round-summary" style={{ marginTop: '1.5rem' }}>
                      <div className="round-summary-list">
                        {done.map(round => (
                          <Link
                            key={round.kind}
                            className="round-summary-item"
                            href={`/student/rounds/${round.kind}/${application.id}`}
                          >
                            <RoundStatusBadge state={round} showScore />
                          </Link>
                        ))}
                      </div>
                      {open ? (
                        <Link
                          className="btn-primary btn-sm"
                          href={`/student/rounds/${open.kind}/${application.id}`}
                        >
                          {open.status === 'in_progress'
                            ? `Resume ${open.kind} round`
                            : `Start ${open.kind} round`}
                        </Link>
                      ) : (
                        done.length > 0 && (
                          <span className="muted small">
                            No rounds open at the {application.stage} stage.
                          </span>
                        )
                      )}
                    </div>
                  );
                })()}

                <p className="app-foot">
                  Applied on {formatDate(application.createdAt)} &middot; Skill match{' '}
                  <strong>
                    {match.matched.length}/{match.total}
                  </strong>{' '}
                  &middot; {matchLabel(match.score)}
                </p>
              </article>
            );
          })}
        </div>
      )}
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
