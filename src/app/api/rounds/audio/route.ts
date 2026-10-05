import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';

import { getCurrentAdmin, getCurrentRecruiter, getCurrentStudent } from '@/lib/actions';
import * as repo from '@/lib/db/repo';
import * as roundsRepo from '@/lib/db/rounds.repo';
import { findGeneratedQuestion, generatedQuestionId } from '@/lib/db/rounds.repo';

/**
 * Stores the audio for one spoken answer.
 *
 *   POST /api/rounds/audio?roundId=...&questionId=...   (raw webm body)
 *
 * Ownership is checked here rather than trusted from the query string: the
 * student must own the round the answer belongs to. Files are written under the
 * database's own directory and served back by `GET` on the same route, so a
 * recording is never world-readable by URL alone.
 */

const MAX_BYTES = 8 * 1024 * 1024;

const AUDIO_TYPES = new Map<string, string>([
  ['webm', 'audio/webm'],
  ['ogg', 'audio/ogg'],
  ['mp3', 'audio/mpeg'],
  ['mpeg', 'audio/mpeg'],
  ['mp4', 'audio/mp4'],
]);

/**
 * Recordings live beside the database. The path is anchored to a static folder
 * so the bundler does not trace the whole project as a side effect.
 */
function audioRoot(): string {
  const configured = process.env.RECRUITFLOW_DB_PATH;
  const base =
    configured && configured !== ':memory:' && !isAbsolute(configured)
      ? join(process.cwd(), configured)
      : configured;
  const dir = base ? join(base, '..') : join(process.cwd(), '.data');
  return normalize(join(dir, 'audio'));
}

export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return new Response('Sign in as a student to upload audio.', { status: 401 });

  const url = new URL(request.url);
  const roundId = url.searchParams.get('roundId');
  const questionId = url.searchParams.get('questionId');
  if (!roundId || !questionId) {
    return new Response('roundId and questionId are required.', { status: 400 });
  }

  const round = roundsRepo.findRoundById(roundId);
  if (!round) return new Response('Round not found.', { status: 404 });

  const application = repo.findApplicationById(round.application_id);
  if (!application || application.studentId !== student.id) {
    return new Response('That round does not belong to you.', { status: 403 });
  }

  const answer = roundsRepo.findAnswer(roundId, questionId);
  if (!answer) {
    return new Response('Submit the answer before attaching audio to it.', { status: 409 });
  }

  const contentType = request.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!AUDIO_TYPES.has(contentType.split('/')[1] ?? '')) {
    return new Response(`Unsupported audio type: ${contentType || 'unknown'}.`, { status: 415 });
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength === 0) return new Response('Empty audio.', { status: 400 });
  if (body.byteLength > MAX_BYTES) {
    return new Response('Recording is too large.', { status: 413 });
  }

  const extension = contentType.split('/')[1] ?? 'webm';
  const filename = `${generatedQuestionId(roundId, questionId).replace(/[^\w-]/g, '_')}.${extension}`;

  const dir = join(audioRoot(), roundId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), body);

  roundsRepo.setAnswerAudio(roundId, questionId, `/api/rounds/audio?roundId=${roundId}&questionId=${questionId}`);

  return Response.json({ ok: true, bytes: body.byteLength, generated: findGeneratedQuestion(roundId, questionId) !== null });
}

/**
 * Streams a stored recording. The student who owns the round, the recruiter who
 * owns the job and an admin may all read it; nobody else gets a byte.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const roundId = url.searchParams.get('roundId');
  const questionId = url.searchParams.get('questionId');
  if (!roundId || !questionId) return new Response('Not found.', { status: 404 });

  const round = roundsRepo.findRoundById(roundId);
  if (!round) return new Response('Not found.', { status: 404 });

  const application = repo.findApplicationById(round.application_id);
  if (!application) return new Response('Not found.', { status: 404 });

  if (!(await mayRead(application.studentId, application.jobId))) {
    return new Response('Not found.', { status: 404 });
  }

  const answer = roundsRepo.findAnswer(roundId, questionId);
  if (!answer?.audioUrl) return new Response('Not found.', { status: 404 });

  // The extension comes from whatever the upload actually used, so the file is
  // located by prefix rather than by guessing a content type back.
  const stem = `${generatedQuestionId(roundId, questionId).replace(/[^\w-]/g, '_')}.`;
  let path: string | null = null;
  let contentType = 'application/octet-stream';
  try {
    for (const entry of readdirSync(join(audioRoot(), roundId))) {
      if (!entry.startsWith(stem)) continue;
      path = join(audioRoot(), roundId, entry);
      contentType = AUDIO_TYPES.get(entry.slice(stem.length)) ?? contentType;
      break;
    }
  } catch {
    return new Response('Not found.', { status: 404 });
  }
  if (!path) return new Response('Not found.', { status: 404 });

  let data: Buffer;
  try {
    data = readFileSync(path);
  } catch {
    return new Response('Not found.', { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

async function mayRead(studentId: string, jobId: string): Promise<boolean> {
  const student = await getCurrentStudent();
  if (student?.id === studentId) return true;

  if (await getCurrentAdmin()) return true;

  const recruiter = await getCurrentRecruiter();
  if (!recruiter) return false;
  const job = repo.findJobById(jobId);
  return job?.recruiterId === recruiter.id;
}