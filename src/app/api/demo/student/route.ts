import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import * as repo from '@/lib/db/repo';
import { hashPassword } from '@/lib/passwords';

/**
 * Fixed demo student credentials.
 * Visiting /api/demo/student seeds the account if missing,
 * starts a session, and redirects to /student/dashboard.
 */
const DEMO_STUDENT = {
  name: 'Alex Johnson',
  email: 'alex.demo@recruitflow.dev',
  password: 'Demo@1234',
  github: 'https://github.com/alexjohnson-demo',
  linkedin: 'https://linkedin.com/in/alexjohnson-demo',
  skills: ['React', 'TypeScript', 'Node.js', 'Python', 'SQL', 'Docker', 'REST API', 'Git'],
};

const STUDENT_COOKIE = 'rf_student';
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

export async function GET() {
  // Find or create the demo student
  let student = repo.findStudentByEmail(DEMO_STUDENT.email);

  if (!student) {
    student = repo.insertStudent({
      name: DEMO_STUDENT.name,
      email: DEMO_STUDENT.email,
      passwordHash: hashPassword(DEMO_STUDENT.password),
      skills: DEMO_STUDENT.skills,
      github: DEMO_STUDENT.github,
      linkedin: DEMO_STUDENT.linkedin,
    });
  }

  // Start a session for this student
  (await cookies()).set(STUDENT_COOKIE, student.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: SECURE_COOKIES,
  });

  redirect('/student/dashboard');
}
