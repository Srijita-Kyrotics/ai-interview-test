import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { demoLoginEnabled, ensureDemoRecruiter } from '@/lib/demo-accounts';

/**
 * Fixed demo recruiter credentials (see `@/lib/demo-accounts`).
 * Visiting /api/demo/recruiter seeds the account if missing,
 * starts a session, and redirects to /recruiter.
 *
 * Disabled in production unless `RECRUITFLOW_ENABLE_DEMO=1`: it hands out a
 * working session to anyone who asks.
 */
const RECRUITER_COOKIE = 'rf_recruiter';
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

export async function GET() {
  if (!demoLoginEnabled()) {
    return new Response('Demo login is disabled.', { status: 404 });
  }

  const recruiter = ensureDemoRecruiter();

  // Start a session for this recruiter
  (await cookies()).set(RECRUITER_COOKIE, recruiter.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: SECURE_COOKIES,
  });

  redirect('/recruiter');
}
