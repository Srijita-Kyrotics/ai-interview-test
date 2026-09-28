import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { RoundRunner } from '@/components/rounds/RoundRunner';
import { getRoundDefinition, isRoundBuilt, isRoundKind } from '@/lib/assessment/registry';
import { toSerializable } from '@/lib/assessment/types';
import { getCurrentStudent } from '@/lib/actions';
import * as repo from '@/lib/db/repo';
import { buildRoundState } from '@/lib/rounds';

export const metadata = { title: 'Assessment round' };

export default async function RoundPage({
  params,
}: {
  params: Promise<{ kind: string; applicationId: string }>;
}) {
  const { kind, applicationId } = await params;

  const student = await getCurrentStudent();
  if (!student) redirect('/student');
  if (!isRoundKind(kind)) notFound();

  const application = repo.findApplicationById(applicationId);
  // A candidate may only ever open a round on their own application.
  if (!application || application.studentId !== student.id) notFound();

  const job = repo.findJobById(application.jobId);
  if (!job) notFound();

  const definition = getRoundDefinition(kind);
  const state = buildRoundState(application, kind);

  if (!isRoundBuilt(kind)) {
    return (
      <div className="container container-narrow">
        <div className="card empty-state">
          <h1>{definition.title}</h1>
          <p className="lead-muted">
            This round has not been built yet. Only the Communication round is available at the
            moment.
          </p>
          <Link href="/student/dashboard" className="btn-ghost btn-sm">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === 'locked') {
    return (
      <div className="container container-narrow">
        <div className="card empty-state">
          <p className="eyebrow">{definition.shortTitle} round</p>
          <h1>Not available yet</h1>
          <p className="lead-muted">
            The {definition.shortTitle} round opens once your application for{' '}
            <strong>{job.title}</strong> reaches the <strong>{definition.stage}</strong> stage. It
            is currently at <strong>{application.stage}</strong>.
          </p>
          <Link href="/student/dashboard" className="btn-ghost btn-sm">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container container-narrow">
      <p className="crumbs">
        <Link href="/student/dashboard">My applications</Link>
        <span aria-hidden="true"> / </span>
        <span>{job.title}</span>
      </p>
      <RoundRunner
        definition={toSerializable(definition)}
        applicationId={application.id}
        initialState={state}
        stageNow={application.stage}
      />
    </div>
  );
}
