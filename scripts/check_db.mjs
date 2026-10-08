import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('.data/recruitflow.db');
console.log('Jobs:', db.prepare('SELECT * FROM jobs LIMIT 1').get());
console.log('Job Skills:', db.prepare('SELECT * FROM job_skills LIMIT 5').all());
console.log('Students:', db.prepare('SELECT * FROM students LIMIT 1').get());
console.log('Student Skills:', db.prepare('SELECT * FROM student_skills LIMIT 5').all());
