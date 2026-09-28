import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  github     TEXT NOT NULL DEFAULT '',
  linkedin   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_skills (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (student_id, skill)
);

CREATE TABLE IF NOT EXISTS recruiters (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('job', 'internship')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  eligibility TEXT NOT NULL DEFAULT '',
  recruiter_id TEXT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_skills (
  job_id   TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill    TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (job_id, skill)
);

CREATE TABLE IF NOT EXISTS applications (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL DEFAULT 'Applied',
  match_score REAL NOT NULL,
  created_at  TEXT NOT NULL,
  -- one application per student per job, enforced by the database
  UNIQUE (student_id, job_id)
);

CREATE TABLE IF NOT EXISTS application_matched_skills (
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  skill          TEXT NOT NULL,
  position       INTEGER NOT NULL,
  PRIMARY KEY (application_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_jobs_recruiter ON jobs(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_apps_student   ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_apps_job       ON applications(job_id);

-- One row per candidate per round. status mirrors the assessment framework.
CREATE TABLE IF NOT EXISTS rounds (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('in_progress', 'passed', 'failed')),
  score          REAL NOT NULL DEFAULT 0,
  max_score      REAL NOT NULL DEFAULT 0,
  started_at     TEXT NOT NULL,
  completed_at   TEXT,
  -- a candidate can only ever sit one round of a given kind
  UNIQUE (application_id, kind)
);

-- Answers store their own evaluation, so a result stays readable even if the
-- question bank or the evaluator changes later.
CREATE TABLE IF NOT EXISTS round_answers (
  id           TEXT PRIMARY KEY,
  round_id     TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  position     INTEGER NOT NULL,
  answer       TEXT NOT NULL,
  score        REAL NOT NULL,
  max_score    REAL NOT NULL,
  feedback     TEXT NOT NULL,
  signals_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (round_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_rounds_app ON rounds(application_id);
CREATE INDEX IF NOT EXISTS idx_answers_round ON round_answers(round_id);
`;

function open(): DatabaseSync {
  const file = process.env.RECRUITFLOW_DB_PATH ?? join(process.cwd(), '.data', 'recruitflow.db');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (current >= SCHEMA_VERSION) return;
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// Held on globalThis so dev hot reloads reuse one connection instead of
// opening a new handle (and re-running migrations) on every file save.
const globalDb = globalThis as typeof globalThis & { __recruitflowDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  return (globalDb.__recruitflowDb ??= open());
}

/** Runs a set of statements in a single transaction. */
export function transact<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
