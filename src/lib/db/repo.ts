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
  email: string;
  password?: string;
  github: string;
  linkedin: string;
  created_at: string;
};

function toStudent(row: StudentRow, skills: string[]): Student {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
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

export function findStudentByName(name: string): Student | null {
  const row = getDb().prepare('SELECT * FROM students WHERE lower(name) = lower(?)').get(name) as StudentRow | undefined;
  if (!row) return null;
  return toStudent(row, skillsFor('student_skills', 'student_id', row.id));
}

export function findStudentByEmail(email: string): Student | null {
  const row = getDb().prepare('SELECT * FROM students WHERE lower(email) = lower(?)').get(email) as StudentRow | undefined;
  if (!row) return null;
  return toStudent(row, skillsFor('student_skills', 'student_id', row.id));
}

/**
 * The stored secret is only ever returned to a sign-in check. It is kept out of
 * `Student` so it cannot be handed to a client component by accident.
 */
export function findStudentCredentialsByEmail(email: string): { id: string; password: string } | null {
  const row = getDb()
    .prepare('SELECT id, password FROM students WHERE lower(email) = lower(?)')
    .get(email.trim()) as { id: string; password: string } | undefined;
  return row ? { id: row.id, password: row.password ?? '' } : null;
}

export function setStudentPassword(id: string, passwordHash: string): void {
  getDb().prepare('UPDATE students SET password = ? WHERE id = ?').run(passwordHash, id);
}

export function insertStudent(data: {
  name: string;
  email: string;
  passwordHash: string;
  skills: string[];
  github: string;
  linkedin: string;
}): Student {
  const student: Student = {
    id: generateId(),
    name: data.name,
    email: data.email,
    github: data.github,
    linkedin: data.linkedin,
    createdAt: now(),
    skills: data.skills,
  };
  transact(db => {
    db.prepare('INSERT INTO students (id, name, email, password, github, linkedin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      student.id,
      student.name,
      student.email,
      data.passwordHash,
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
  data: { name: string; email: string; skills: string[]; github: string; linkedin: string },
): Student {
  transact(db => {
    db.prepare('UPDATE students SET name = ?, email = ?, github = ?, linkedin = ? WHERE id = ?').run(
      data.name,
      data.email,
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

type RecruiterRow = { id: string; name: string; company: string; password?: string };

function toRecruiter(row: RecruiterRow): Recruiter {
  return { id: row.id, name: row.name, company: row.company };
}

export function findRecruiterById(id: string): Recruiter | null {
  const row = getDb().prepare('SELECT * FROM recruiters WHERE id = ?').get(id) as RecruiterRow | undefined;
  return row ? toRecruiter(row) : null;
}

export function findRecruiterByName(name: string, company: string): Recruiter | null {
  const row = getDb()
    .prepare('SELECT * FROM recruiters WHERE lower(name) = lower(?) AND lower(company) = lower(?)')
    .get(name, company) as RecruiterRow | undefined;
  return row ? toRecruiter(row) : null;
}

/** Sign-in only: returns the stored secret alongside the recruiter id. */
export function findRecruiterCredentials(
  name: string,
  company: string,
): { id: string; password: string } | null {
  const row = getDb()
    .prepare('SELECT id, password FROM recruiters WHERE lower(name) = lower(?) AND lower(company) = lower(?)')
    .get(name.trim(), company.trim()) as { id: string; password?: string } | undefined;
  return row ? { id: row.id, password: row.password ?? '' } : null;
}

export function insertRecruiter(name: string, company: string, passwordHash: string): Recruiter {
  const recruiter: Recruiter = { id: generateId(), name, company };
  getDb()
    .prepare('INSERT INTO recruiters (id, name, company, password) VALUES (?, ?, ?, ?)')
    .run(recruiter.id, recruiter.name, recruiter.company, passwordHash);
  return recruiter;
}

export function setRecruiterPassword(id: string, passwordHash: string): void {
  getDb().prepare('UPDATE recruiters SET password = ? WHERE id = ?').run(passwordHash, id);
}

/* -------------------------------------------------------------------------- */
/*                                  Admins                                    */
/* -------------------------------------------------------------------------- */

type AdminRow = { id: string; email: string; created_at: string };

export function findAdminById(id: string) {
  const row = getDb().prepare('SELECT * FROM admins WHERE id = ?').get(id) as AdminRow | undefined;
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
}

export function findAdminByEmail(email: string) {
  const row = getDb()
    .prepare('SELECT * FROM admins WHERE lower(email) = lower(?)')
    .get(email.trim()) as AdminRow | undefined;
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
}

export function insertAdmin(email: string) {
  const admin = { id: generateId(), email, createdAt: now() };
  getDb()
    .prepare('INSERT INTO admins (id, email, created_at) VALUES (?, ?, ?)')
    .run(admin.id, admin.email, admin.createdAt);
  return admin;
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
/*                                Job Rounds                                  */
/* -------------------------------------------------------------------------- */

type JobRoundRow = { id: string; job_id: string; kind: string; position: number; pass_threshold: number };

export function insertJobRound(jobId: string, kind: string, position: number, passThreshold: number) {
  const jobRound = { id: generateId(), jobId, kind, position, passThreshold };
  getDb()
    .prepare('INSERT INTO job_rounds (id, job_id, kind, position, pass_threshold) VALUES (?, ?, ?, ?, ?)')
    .run(jobRound.id, jobRound.jobId, jobRound.kind, jobRound.position, jobRound.passThreshold);
  return jobRound;
}

/** Inserts or updates a job's configuration for one round kind. */
export function upsertJobRound(jobId: string, kind: string, position: number, passThreshold: number) {
  getDb()
    .prepare(
      `INSERT INTO job_rounds (id, job_id, kind, position, pass_threshold)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (job_id, kind) DO UPDATE SET position = excluded.position, pass_threshold = excluded.pass_threshold`,
    )
    .run(generateId(), jobId, kind, position, passThreshold);
}

/** Removes a job's configuration for a round, used to disable the custom round. */
export function deleteJobRound(jobId: string, kind: string): void {
  getDb().prepare('DELETE FROM job_rounds WHERE job_id = ? AND kind = ?').run(jobId, kind);
}

export function listJobRounds(jobId: string) {
  const rows = getDb().prepare('SELECT * FROM job_rounds WHERE job_id = ? ORDER BY position ASC').all(jobId) as JobRoundRow[];
  return rows.map(r => ({ id: r.id, jobId: r.job_id, kind: r.kind, position: r.position, passThreshold: r.pass_threshold }));
}

/* -------------------------------------------------------------------------- */
/*                                Questions                                   */
/* -------------------------------------------------------------------------- */

type QuestionRow = { id: string; category: string; question_type: string; content: string; metadata_json: string; created_by: string; created_at: string };

export function insertQuestion(data: { category: string; questionType: string; content: string; metadataJson: string; createdBy: string }) {
  const question = { ...data, id: generateId(), createdAt: now() };
  getDb()
    .prepare('INSERT INTO questions (id, category, question_type, content, metadata_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(question.id, question.category, question.questionType, question.content, question.metadataJson, question.createdBy, question.createdAt);
  return question;
}

export function listQuestionsByCategory(category: string) {
  const rows = getDb().prepare('SELECT * FROM questions WHERE category = ? ORDER BY created_at DESC').all(category) as QuestionRow[];
  return rows.map(r => ({ id: r.id, category: r.category, questionType: r.question_type, content: r.content, metadataJson: r.metadata_json, createdBy: r.created_by, createdAt: r.created_at }));
}

export function listAllQuestions() {
  const rows = getDb().prepare('SELECT * FROM questions ORDER BY created_at DESC').all() as QuestionRow[];
  return rows.map(r => ({ id: r.id, category: r.category, questionType: r.question_type, content: r.content, metadataJson: r.metadata_json, createdBy: r.created_by, createdAt: r.created_at }));
}

/* -------------------------------------------------------------------------- */
/*                    Recruiter question bank (custom round)                   */
/* -------------------------------------------------------------------------- */

export interface RecruiterQuestion {
  id: string;
  recruiterId: string;
  prompt: string;
  hint: string;
  maxScore: number;
  createdAt: string;
}

type RecruiterQuestionRow = {
  id: string;
  recruiter_id: string;
  prompt: string;
  hint: string;
  max_score: number;
  created_at: string;
};

function toRecruiterQuestion(row: RecruiterQuestionRow): RecruiterQuestion {
  return {
    id: row.id,
    recruiterId: row.recruiter_id,
    prompt: row.prompt,
    hint: row.hint,
    maxScore: row.max_score,
    createdAt: row.created_at,
  };
}

export function insertRecruiterQuestion(data: {
  recruiterId: string;
  prompt: string;
  hint: string;
  maxScore: number;
}): RecruiterQuestion {
  const question: RecruiterQuestion = { ...data, id: generateId(), createdAt: now() };
  getDb()
    .prepare(
      `INSERT INTO recruiter_questions (id, recruiter_id, prompt, hint, max_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      question.id,
      question.recruiterId,
      question.prompt,
      question.hint,
      question.maxScore,
      question.createdAt,
    );
  return question;
}

export function listRecruiterQuestions(recruiterId: string): RecruiterQuestion[] {
  const rows = getDb()
    .prepare('SELECT * FROM recruiter_questions WHERE recruiter_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(recruiterId) as RecruiterQuestionRow[];
  return rows.map(toRecruiterQuestion);
}

export function findRecruiterQuestion(id: string): RecruiterQuestion | null {
  const row = getDb().prepare('SELECT * FROM recruiter_questions WHERE id = ?').get(id) as
    | RecruiterQuestionRow
    | undefined;
  return row ? toRecruiterQuestion(row) : null;
}

export function deleteRecruiterQuestion(recruiterId: string, id: string): void {
  getDb()
    .prepare('DELETE FROM recruiter_questions WHERE id = ? AND recruiter_id = ?')
    .run(id, recruiterId);
}

export interface JobCustomQuestion {
  id: string;
  prompt: string;
  hint: string;
  maxScore: number;
  position: number;
}

/** Replaces the whole ordered set of questions attached to a job's custom round. */
export function setJobCustomQuestions(jobId: string, questionIds: string[]): void {
  transact(db => {
    db.prepare('DELETE FROM job_custom_questions WHERE job_id = ?').run(jobId);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO job_custom_questions (job_id, question_id, position) VALUES (?, ?, ?)',
    );
    [...new Set(questionIds)].forEach((questionId, position) => stmt.run(jobId, questionId, position));
  });
}

export function listJobCustomQuestions(jobId: string): JobCustomQuestion[] {
  const rows = getDb()
    .prepare(
      `SELECT q.id, q.prompt, q.hint, q.max_score, j.position
       FROM job_custom_questions j
       JOIN recruiter_questions q ON q.id = j.question_id
       WHERE j.job_id = ?
       ORDER BY j.position ASC`,
    )
    .all(jobId) as { id: string; prompt: string; hint: string; max_score: number; position: number }[];
  return rows.map(r => ({
    id: r.id,
    prompt: r.prompt,
    hint: r.hint,
    maxScore: r.max_score,
    position: r.position,
  }));
}

export function findJobCustomQuestion(jobId: string, questionId: string): JobCustomQuestion | null {
  return listJobCustomQuestions(jobId).find(q => q.id === questionId) ?? null;
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
