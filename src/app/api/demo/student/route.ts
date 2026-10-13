import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ensureDemoStudent } from '@/lib/demo-accounts';

/**
 * Fixed demo student credentials (see `@/lib/demo-accounts`).
 * Visiting /api/demo/student seeds the account if missing,
 * starts a session, and redirects to /student/dashboard.
 */
const STUDENT_COOKIE = 'rf_student';
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

export async function GET() {
  const student = ensureDemoStudent();

  // Start a session for this student
  (await cookies()).set(STUDENT_COOKIE, student.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: SECURE_COOKIES,
  });

  redirect('/student/dashboard');
}
