import { getDb } from '../src/lib/db/index.ts';

const db = getDb();
const jobs = db.prepare('SELECT id, title, type FROM jobs').all();
console.table(jobs);
