import { NextResponse } from 'next/server';

import {
  applyForJob,
  createJob,
  createStudent,
  signInRecruiter,
  signUpRecruiter,
  updateApplicationStage,
  updateStudent,
} from '@/lib/actions';
import {
  completeAssessmentRound,
  generateDynamicPrompt,
  getRoundStatesForRecruiter,
  startAssessmentRound,
  submitRoundAnswer,
} from '@/lib/round-actions';
import { findGeneratedQuestion } from '@/lib/db/rounds.repo';

/**
 * A JSON front door onto the real server actions, for the smoke test.
 *
 *   POST /api/test/action   { "name": "...", "args": [...] }
 *
 * Server action ids are build output: they are minified away in development and
 * carry no function name in production, so a black-box HTTP test cannot address
 * them without a private endpoint. This route calls the exact same exported
 * functions the UI does, so the assertions still cover the real auth, ownership
 * and persistence paths.
 *
 * It refuses to load unless RECRUITFLOW_TEST_HOOKS is exactly "1", so it can
 * never be reached by accident in a deployed instance.
 */

export const dynamic = 'force-dynamic';

const handlers: Record<string, (...args: never[]) => unknown> = {
  createStudent: createStudent as never,
  updateStudent: updateStudent as never,
  signInRecruiter: signInRecruiter as never,
  signUpRecruiter: signUpRecruiter as never,
  createJob: createJob as never,
  applyForJob: applyForJob as never,
  updateApplicationStage: updateApplicationStage as never,
  startAssessmentRound: startAssessmentRound as never,
  generateDynamicPrompt: generateDynamicPrompt as never,
  submitRoundAnswer: submitRoundAnswer as never,
  completeAssessmentRound: completeAssessmentRound as never,
  getRoundStatesForRecruiter: getRoundStatesForRecruiter as never,
  // The harness needs the generated prompt (including the answer key for
  // closed questions) so it can answer like a candidate who knows the material.
  getGeneratedQuestion: findGeneratedQuestion as never,
};

function enabled(): boolean {
  return process.env.RECRUITFLOW_TEST_HOOKS === '1';
}

export async function POST(request: Request) {
  if (!enabled()) {
    return NextResponse.json({ error: 'Test hooks are disabled.' }, { status: 404 });
  }

  const { name, args } = (await request.json().catch(() => null)) ?? {};
  const handler = typeof name === 'string' ? handlers[name] : undefined;
  if (!handler) {
    return NextResponse.json(
      { error: `Unknown action "${name}".`, available: Object.keys(handlers) },
      { status: 400 },
    );
  }

  try {
    const result = await handler(...((Array.isArray(args) ? args : []) as never[]));
    return NextResponse.json({ ok: true, result: result ?? null });
  } catch (error) {
    // Surfaced as a 200 with ok:false so the harness can assert on the message
    // instead of every expected rejection becoming a transport error.
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function GET() {
  if (!enabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, actions: Object.keys(handlers) });
}