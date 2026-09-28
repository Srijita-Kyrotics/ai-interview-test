/**
 * Populates an empty database with demo data so the UI has something to show.
 *
 *   npm run db:seed
 *
 * Safe to re-run: it refuses to insert if data already exists.
 */
import { getDb } from '../src/lib/db/index.ts';
import * as repo from '../src/lib/db/repo.ts';
import { calculateSkillMatch } from '../src/lib/types.ts';

const db = getDb();

const { count } = db.prepare('SELECT COUNT(*) AS count FROM jobs').get();
if (count > 0) {
  console.log(`Skipped: ${count} job(s) already present. Run "npm run db:reset" first.`);
  process.exit(0);
}

const recruiter = repo.insertRecruiter('Priya Sharma', 'Acme Corp');

const backend = repo.insertJob({
  type: 'internship',
  title: 'Backend Developer Intern',
  description:
    'You will build and ship REST APIs with FastAPI and SQL against a production Postgres database.\n\nYou will work closely with the platform team on schema design, query performance and observability.',
  eligibility:
    'Final-year B.Tech / B.S. students. 60% aggregate or above. Prior internship experience is a plus, not a requirement.',
  skillsRequired: ['Python', 'SQL', 'FastAPI', 'Docker', 'Git'],
  recruiterId: recruiter.id,
});

repo.insertJob({
  type: 'job',
  title: 'Full Stack Engineer',
  description:
    'Own features end to end across a Next.js frontend and a Node.js API.\n\nExpect to work on design systems, performance and developer experience.',
  eligibility: '1-3 years of professional experience. Comfortable with a git-based workflow.',
  skillsRequired: ['TypeScript', 'React', 'Next.js', 'Node.js', 'SQL', 'Git'],
  recruiterId: recruiter.id,
});

const student = repo.insertStudent({
  name: 'Srijita Ghorai',
  github: 'https://github.com/srijita',
  linkedin: 'https://linkedin.com/in/srijita',
  skills: ['Python', 'SQL', 'FastAPI', 'Git', 'Machine Learning'],
});

const match = calculateSkillMatch(backend.skillsRequired, student.skills);

repo.insertApplication({
  studentId: student.id,
  jobId: backend.id,
  stage: 'Communication',
  matchScore: match.score,
  matchedSkills: match.matched,
});

console.log('Seeded:');
console.log(`  recruiter  ${recruiter.name} (${recruiter.company})`);
console.log('  jobs       Backend Developer Intern + Full Stack Engineer');
console.log(`  student    ${student.name}`);
console.log(`  applicant  at Communication, ${match.score}% skill match`);
console.log('');
console.log('Sign in as recruiter: Priya Sharma / Acme Corp');
