import { getDb, transact } from './index.ts';
import type {
  Application,
  ApplicationWithJob,
  ApplicationWithStudent,
  Job,
  OpportunityType,
  Recruiter,
  Student,
} from '../types.ts';

const now = () => new Date().toISOString();

export function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/* -------------------------------------------------------------------------- */
/*                                  Students                                  */
/* -------------------------------------------------------------------------- */

type StudentRow = {
  id: string;
  name: string;
  github: string;
  linkedin: string;
  created_at: string;
};

function toStudent(row: StudentRow, skills: string[]): Student {
  return {
    id: row.id,
    name: row.name,
    github: row.github,
    linkedin: row.linkedin,
    createdAt: row.created_at,
    skills,
  };
}

type SkillTable = 'student_skills' | 'job_skills' | 'application_matched_skills';

function skillsFor(table: 'student_skills' | 'job_skills', idColumn: string, id: string) {
  const rows = getDb()
    .prepare(`SELECT skill FROM ${table} WHERE ${idColumn} = ? ORDER BY position`)
    .all(id) as { skill: string }[];
  return rows.map(r => r.skill);
}

export function findStudentById(id: string): Student | null {
  const row = getDb().prepare('SELECT * FROM students WHERE id = ?').get(id) as
    | StudentRow
    | undefined;
  if (!row) return null;
  return toStudent(row, skillsFor('student_skills', 'student_id', id));
}

export function insertStudent(data: {
  name: string;
  skills: string[];
  github: string;
  linkedin: string;
}): Student {
  const student: Student = { ...data, id: generateId(), createdAt: now() };
  transact(db => {
    db.prepare('INSERT INTO students (id, name, github, linkedin, created_at) VALUES (?, ?, ?, ?, ?)').run(
      student.id,
      student.name,
      student.github,
      student.linkedin,
      student.createdAt,
    );
    writeSkills(db, 'student_skills', 'student_id', student.id, student.skills);
  });
  return student;
}

export function updateStudentRow(
  id: string,
  data: { name: string; skills: string[]; github: string; linkedin: string },
): Student {
  transact(db => {
    db.prepare('UPDATE students SET name = ?, github = ?, linkedin = ? WHERE id = ?').run(
      data.name,
      data.github,
      data.linkedin,
      id,
    );
    db.prepare('DELETE FROM student_skills WHERE student_id = ?').run(id);
    writeSkills(db, 'student_skills', 'student_id', id, data.skills);
  });
  const updated = findStudentById(id);
  if (!updated) throw new Error('Student not found');
  return updated;
}

function writeSkills(
  db: ReturnType<typeof getDb>,
  table: SkillTable,
  idColumn: string,
  id: string,
  skills: string[],
) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ${table} (${idColumn}, skill, position) VALUES (?, ?, ?)`,
  );
  // De-duplicate so a repeated skill cannot trip the primary key.
  [...new Set(skills)].forEach((skill, index) => stmt.run(id, skill, index));
}

/* -------------------------------------------------------------------------- */
/*                                 Recruiters                                 */
/* -------------------------------------------------------------------------- */

type RecruiterRow = { id: string; name: string; company: string };

export function findRecruiterById(id: string): Recruiter | null {
  return (getDb().prepare('SELECT * FROM recruiters WHERE id = ?').get(id) as RecruiterRow) ?? null;
}

export function findRecruiterByName(name: string, company: string): Recruiter | null {
  const row = getDb()
    .prepare('SELECT * FROM recruiters WHERE lower(name) = lower(?) AND lower(company) = lower(?)')
    .get(name, company) as RecruiterRow | undefined;
  return row ?? null;
}

export function insertRecruiter(name: string, company: string): Recruiter {
  const recruiter: Recruiter = { id: generateId(), name, company };
  getDb()
    .prepare('INSERT INTO recruiters (id, name, company) VALUES (?, ?, ?)')
    .run(recruiter.id, recruiter.name, recruiter.company);
  return recruiter;
}

/* -------------------------------------------------------------------------- */
/*                              Jobs / internships                            */
/* -------------------------------------------------------------------------- */

type JobRow = {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  eligibility: string;
  recruiter_id: string;
  created_at: string;
};

function toJob(row: JobRow, skills: string[]): Job {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    eligibility: row.eligibility,
    recruiterId: row.recruiter_id,
    createdAt: row.created_at,
    skillsRequired: skills,
  };
}

function hydrateJob(row: JobRow): Job {
  return toJob(row, skillsFor('job_skills', 'job_id', row.id));
}

export function insertJob(data: {
  type: OpportunityType;
  title: string;
  description: string;
  eligibility: string;
  skillsRequired: string[];
  recruiterId: string;
}): Job {
  const job: Job = { ...data, id: generateId(), createdAt: now() };
  transact(db => {
    db.prepare(
      `INSERT INTO jobs (id, type, title, description, eligibility, recruiter_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      job.id,
      job.type,
      job.title,
      job.description,
      job.eligibility,
      job.recruiterId,
      job.createdAt,
    );
    writeSkills(db, 'job_skills', 'job_id', job.id, job.skillsRequired);
  });
  return job;
}

export function findJobById(id: string): Job | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  return row ? hydrateJob(row) : null;
}

export function listOpenJobs(): Job[] {
  const rows = getDb()
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC')
    .all() as JobRow[];
  return rows.map(hydrateJob);
}

export function listJobsByRecruiter(recruiterId: string): Job[] {
  const rows = getDb()
    .prepare('SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(recruiterId) as JobRow[];
  return rows.map(hydrateJob);
}

/* -------------------------------------------------------------------------- */
/*                                Applications                                */
/* -------------------------------------------------------------------------- */

type ApplicationRow = {
  id: string;
  student_id: string;
  job_id: string;
  stage: Application['stage'];
  match_score: number;
  created_at: string;
};

function toApplication(row: ApplicationRow, matchedSkills: string[]): Application {
  return {
    id: row.id,
    studentId: row.student_id,
    jobId: row.job_id,
    stage: row.stage,
    matchScore: row.match_score,
    matchedSkills,
    createdAt: row.created_at,
  };
}

function hydrateApplication(row: ApplicationRow): Application {
  const rows = getDb()
    .prepare(
      'SELECT skill FROM application_matched_skills WHERE application_id = ? ORDER BY position',
    )
    .all(row.id) as { skill: string }[];
  return toApplication(row, rows.map(r => r.skill));
}

export function findApplicationById(id: string): Application | null {
  const row = getDb().prepare('SELECT * FROM applications WHERE id = ?').get(id) as
    | ApplicationRow
    | undefined;
  return row ? hydrateApplication(row) : null;
}

export function findApplicationByStudentAndJob(
  studentId: string,
  jobId: string,
): Application | null {
  const row = getDb()
    .prepare('SELECT * FROM applications WHERE student_id = ? AND job_id = ?')
    .get(studentId, jobId) as ApplicationRow | undefined;
  return row ? hydrateApplication(row) : null;
}

/**
 * Inserts an application, or returns the existing one. The UNIQUE
 * (student_id, job_id) constraint makes a double submit a no-op rather than a
 * duplicate row.
 */
export function insertApplication(data: {
  studentId: string;
  jobId: string;
  stage: Application['stage'];
  matchScore: number;
  matchedSkills: string[];
}): Application {
  const existing = findApplicationByStudentAndJob(data.studentId, data.jobId);
  if (existing) return existing;

  const application: Application = { ...data, id: generateId(), createdAt: now() };
  try {
    transact(db => {
      db.prepare(
        `INSERT INTO applications (id, student_id, job_id, stage, match_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        application.id,
        application.studentId,
        application.jobId,
        application.stage,
        application.matchScore,
        application.createdAt,
      );
      writeSkills(
        db,
        'application_matched_skills',
        'application_id',
        application.id,
        application.matchedSkills,
      );
    });
  } catch (error) {
    // Lost a race with a concurrent submit: fall back to the winning row.
    const raced = findApplicationByStudentAndJob(data.studentId, data.jobId);
    if (raced) return raced;
    throw error;
  }
  return application;
}

export function setApplicationStage(id: string, stage: Application['stage']): Application {
  const result = getDb().prepare('UPDATE applications SET stage = ? WHERE id = ?').run(stage, id);
  if (result.changes === 0) throw new Error('Application not found');
  const updated = findApplicationById(id);
  if (!updated) throw new Error('Application not found');
  return updated;
}

export function listApplicationsByStudent(studentId: string): ApplicationWithJob[] {
  const rows = getDb()
    .prepare(
      `SELECT a.* FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.student_id = ?
       ORDER BY a.created_at DESC, a.rowid DESC`,
    )
    .all(studentId) as ApplicationRow[];
  return rows.map(row => {
    const jobRow = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(row.job_id) as JobRow;
    return { ...hydrateApplication(row), job: hydrateJob(jobRow) };
  });
}

export function listApplicationsByJob(jobId: string): ApplicationWithStudent[] {
  const rows = getDb()
    .prepare(
      `SELECT a.* FROM applications a
       JOIN students s ON s.id = a.student_id
       WHERE a.job_id = ?
       ORDER BY a.match_score DESC, a.created_at ASC`,
    )
    .all(jobId) as ApplicationRow[];
  return rows.map(row => {
    const studentRow = getDb()
      .prepare('SELECT * FROM students WHERE id = ?')
      .get(row.student_id) as StudentRow;
    return {
      ...hydrateApplication(row),
      student: toStudent(studentRow, skillsFor('student_skills', 'student_id', studentRow.id)),
    };
  });
}
