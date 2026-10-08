import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import { getCurrentStudent } from '@/lib/actions';
import * as repo from '@/lib/db/repo';
import * as roundsRepo from '@/lib/db/rounds.repo';

const MAX_BYTES = 100 * 1024 * 1024; // 100MB max for video chunks

function proctoringRoot(): string {
  const configured = process.env.RECRUITFLOW_DB_PATH;
  const base =
    configured && configured !== ':memory:' && !isAbsolute(configured)
      ? join(process.cwd(), configured)
      : configured;
  const dir = base ? join(base, '..') : join(process.cwd(), '.data');
  return normalize(join(dir, 'proctoring'));
}

export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return new Response('Sign in as a student to upload proctoring data.', { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as Blob | null;
  const roundId = formData.get('roundId') as string | null;
  const type = formData.get('type') as string | null;

  if (!file || !roundId || !type) {
    return new Response('file, roundId, and type are required.', { status: 400 });
  }

  const round = roundsRepo.findRoundById(roundId);
  if (!round) return new Response('Round not found.', { status: 404 });

  const application = repo.findApplicationById(round.application_id);
  if (!application || application.studentId !== student.id) {
    return new Response('That round does not belong to you.', { status: 403 });
  }

  const body = Buffer.from(await file.arrayBuffer());
  if (body.byteLength === 0) return new Response('Empty video.', { status: 400 });
  if (body.byteLength > MAX_BYTES) {
    return new Response('Recording is too large.', { status: 413 });
  }

  const filename = `${type}.webm`; // e.g. webcam.webm or screen.webm

  const dir = join(proctoringRoot(), roundId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), body);

  return Response.json({ ok: true, bytes: body.byteLength });
}
