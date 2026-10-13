import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import * as repo from '@/lib/db/repo';
import { hashPassword } from '@/lib/passwords';

/**
 * Fixed demo recruiter credentials.
 * Visiting /api/demo/recruiter seeds the account if missing,
 * starts a session, and redirects to /recruiter.
 */
const DEMO_RECRUITER = {
  name: 'Sarah Mitchell',
  company: 'TechVentures Inc.',
  password: 'Demo@1234',
};

const RECRUITER_COOKIE = 'rf_recruiter';
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

export async function GET() {
  // Find or create the demo recruiter
  let recruiter = repo.findRecruiterByName(DEMO_RECRUITER.name, DEMO_RECRUITER.company);

  if (!recruiter) {
    recruiter = repo.insertRecruiter(
      DEMO_RECRUITER.name,
      DEMO_RECRUITER.company,
      hashPassword(DEMO_RECRUITER.password),
    );
  }

  // Start a session for this recruiter
  (await cookies()).set(RECRUITER_COOKIE, recruiter.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: SECURE_COOKIES,
  });

  redirect('/recruiter');
}
