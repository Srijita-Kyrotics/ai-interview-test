import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 6;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  password   TEXT NOT NULL DEFAULT '',
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
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  company  TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admins (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS job_rounds (
  id             TEXT PRIMARY KEY,
  job_id         TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  pass_threshold REAL NOT NULL,
  UNIQUE (job_id, kind)
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
  -- set when an answer could not be auto-graded or proctoring crossed its
  -- threshold, so a recruiter knows the result needs a human
  flagged        INTEGER NOT NULL DEFAULT 0,
  -- a candidate can only ever sit one round of a given kind
  UNIQUE (application_id, kind)
);

CREATE TABLE IF NOT EXISTS proctoring_events (
  id         TEXT PRIMARY KEY,
  round_id   TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  timestamp  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id                 TEXT PRIMARY KEY,
  category           TEXT NOT NULL,
  question_type      TEXT NOT NULL,
  content            TEXT NOT NULL,
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL
);

-- A recruiter's reusable library of questions for the optional custom round.
CREATE TABLE IF NOT EXISTS recruiter_questions (
  id           TEXT PRIMARY KEY,
  recruiter_id TEXT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  prompt       TEXT NOT NULL,
  hint         TEXT NOT NULL DEFAULT '',
  max_score    REAL NOT NULL DEFAULT 10,
  created_at   TEXT NOT NULL
);

-- Which bank questions are attached to a job's custom round, and in what order.
-- A job is considered to have a custom round only when this table has rows for
-- it (enablement), with the pass threshold living in job_rounds kind='custom'.
CREATE TABLE IF NOT EXISTS job_custom_questions (
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES recruiter_questions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (job_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_recruiter_questions_recruiter ON recruiter_questions(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_job_custom_questions_job ON job_custom_questions(job_id);

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
  -- 0 when the model could not grade the answer, which blocks an automatic pass
  graded       INTEGER NOT NULL DEFAULT 1,
  audio_url    TEXT,
  UNIQUE (round_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_rounds_app ON rounds(application_id);
CREATE INDEX IF NOT EXISTS idx_answers_round ON round_answers(round_id);
`;

function getDatabaseFilePath(): string {
  if (process.env.RECRUITFLOW_DB_PATH) {
    return process.env.RECRUITFLOW_DB_PATH;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return join(tmpdir(), 'recruitflow.db');
  }
  return join(process.cwd(), '.data', 'recruitflow.db');
}

function open(): DatabaseSync {
  let file = getDatabaseFilePath();
  if (file !== ':memory:') {
    try {
      mkdirSync(dirname(file), { recursive: true });
    } catch {
      file = join(tmpdir(), 'recruitflow.db');
      try {
        mkdirSync(dirname(file), { recursive: true });
      } catch {
        file = ':memory:';
      }
    }
  }

  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = WAL');
  } catch {
    try {
      db.exec('PRAGMA journal_mode = DELETE');
    } catch {
      // PRAGMA journal_mode fallback
    }
  }
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

  if (current > 0 && current < 3) {
    try {
      db.exec("ALTER TABLE round_answers ADD COLUMN audio_url TEXT;");
    } catch {
      // Column might already exist if migration was partially run
    }
  }

  if (current > 0 && current < 4) {
    try {
      db.exec("ALTER TABLE students ADD COLUMN password TEXT NOT NULL DEFAULT '';");
    } catch {
      // Column might already exist
    }
  }

  if (current > 0 && current < 5) {
    for (const statement of [
      "ALTER TABLE recruiters ADD COLUMN password TEXT NOT NULL DEFAULT '';",
      "ALTER TABLE rounds ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE round_answers ADD COLUMN graded INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE students ADD COLUMN email TEXT NOT NULL DEFAULT '';"
    ]) {
      try {
        db.exec(statement);
      } catch {
        // Column already exists if the migration was partially applied
      }
    }
  }

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
