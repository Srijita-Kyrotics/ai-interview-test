import { DatabaseSync } from 'node:sqlite';
import { calculateSkillMatch } from '../src/lib/types.ts';

const db = new DatabaseSync('.data/recruitflow.db');

function skillsFor(table, idColumn, id) {
  const rows = db
    .prepare(`SELECT skill FROM ${table} WHERE ${idColumn} = ? ORDER BY position`)
    .all(id);
  return rows.map(r => r.skill);
}

const jobs = db.prepare('SELECT id FROM jobs').all();
const students = db.prepare('SELECT id FROM students').all();

console.log('--- Checking all Jobs and Students ---');
for (const job of jobs) {
  const jobSkills = skillsFor('job_skills', 'job_id', job.id);
  console.log(`Job ${job.id} skills:`, jobSkills);
  for (const student of students) {
    const studentSkills = skillsFor('student_skills', 'student_id', student.id);
    const match = calculateSkillMatch(jobSkills, studentSkills);
    console.log(`  Student ${student.id} skills:`, studentSkills);
    console.log(`  Match: ${match.matched.length}/${jobSkills.length} -> ${match.score}%`);
  }
}
