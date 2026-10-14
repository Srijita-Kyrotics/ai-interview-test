import * as repo from '@/lib/db/repo';
import { hashPassword } from '@/lib/passwords';
import { DEMO_PASSWORD, DEMO_RECRUITER, DEMO_STUDENT } from '@/lib/demo-credentials';
import type { Recruiter, Student } from '@/lib/types';

export { DEMO_PASSWORD, DEMO_RECRUITER, DEMO_STUDENT };

/**
 * Whether the one-click demo logins are available. They are a development and
 * showcase convenience, so they are off in production unless a deployment opts
 * in explicitly with `RECRUITFLOW_ENABLE_DEMO=1`. Setting it to `0` forces them
 * off everywhere.
 */
export function demoLoginEnabled(): boolean {
  const flag = process.env.RECRUITFLOW_ENABLE_DEMO;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Fixed credentials for local testing and demos, so nobody has to keep creating
 * throwaway accounts. The password is re-hashed and written on every seed, so
 * these logins stay valid even if someone changes the password in the UI.
 */

/** Creates the demo student if missing and pins its password. */
export function ensureDemoStudent(): Student {
  const existing = repo.findStudentByEmail(DEMO_STUDENT.email);
  const passwordHash = hashPassword(DEMO_PASSWORD);

  if (existing) {
    repo.setStudentPassword(existing.id, passwordHash);
    return existing;
  }

  return repo.insertStudent({
    name: DEMO_STUDENT.name,
    email: DEMO_STUDENT.email,
    passwordHash,
    skills: [...DEMO_STUDENT.skills],
    github: DEMO_STUDENT.github,
    linkedin: DEMO_STUDENT.linkedin,
  });
}

/** Creates the demo recruiter if missing and pins its password. */
export function ensureDemoRecruiter(): Recruiter {
  const existing = repo.findRecruiterByName(DEMO_RECRUITER.name, DEMO_RECRUITER.company);
  const passwordHash = hashPassword(DEMO_PASSWORD);

  if (existing) {
    repo.setRecruiterPassword(existing.id, passwordHash);
    return existing;
  }

  return repo.insertRecruiter(DEMO_RECRUITER.name, DEMO_RECRUITER.company, passwordHash);
}
