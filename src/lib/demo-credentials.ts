/**
 * Fixed demo logins for local testing. This module is intentionally free of
 * server-only imports so client components (the sign-in forms) can show the
 * credentials. The seeding that creates these accounts lives in
 * `@/lib/demo-accounts`.
 */
export const DEMO_PASSWORD = 'Demo@1234';

export const DEMO_STUDENT = {
  name: 'Alex Johnson',
  email: 'alex.demo@recruitflow.dev',
  github: 'https://github.com/alexjohnson-demo',
  linkedin: 'https://linkedin.com/in/alexjohnson-demo',
  skills: ['React', 'TypeScript', 'Node.js', 'Python', 'SQL', 'Docker', 'REST API', 'Git'],
} as const;

/** A recruiter that already owns roles in the seed data, so its dashboard has a pipeline. */
export const DEMO_RECRUITER = {
  name: 'Sarah',
  company: 'Acme Corp',
} as const;
