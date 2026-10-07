import { getDb } from '../src/lib/db/index.ts';

const db = getDb();

console.log('Cleaning up unit test fixtures from database...');

// 1. Delete test jobs
const testJobs = db.prepare("SELECT id, title FROM jobs WHERE title LIKE 'Unit Job%'").all();
console.log(`Found ${testJobs.length} unit test jobs to remove.`);
for (const j of testJobs) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(j.id);
}

// 2. Delete test recruiters
const testRecruiters = db.prepare("SELECT id, name FROM recruiters WHERE name LIKE 'Unit Recruiter%' OR name LIKE 'Jane Recruiter'").all();
console.log(`Found ${testRecruiters.length} unit test recruiters to remove.`);
for (const r of testRecruiters) {
  db.prepare('DELETE FROM recruiters WHERE id = ?').run(r.id);
}

// 3. Delete test students
const testStudents = db.prepare("SELECT id, name, email FROM students WHERE name LIKE 'Unit Student%' OR email LIKE 'student_%@kyrotics.com'").all();
console.log(`Found ${testStudents.length} unit test students to remove.`);
for (const s of testStudents) {
  db.prepare('DELETE FROM students WHERE id = ?').run(s.id);
}

console.log('Remaining jobs:');
const remaining = db.prepare('SELECT id, title, type FROM jobs').all();
console.table(remaining);

console.log('Database cleanup complete!');
