import { getDb, transact } from './index.ts';
import { generateId } from './repo.ts';
import type { AnswerRecord, AnswerEvaluation, EvaluationSignal, RoundKind, RoundStatus } from '../assessment/types.ts';

export type { RoundRow };

/** The row shape as stored, before answers are hydrated. */
type RoundRow = {
  id: string;
  application_id: string;
  kind: RoundKind;
  status: Exclude<RoundStatus, 'locked' | 'not_started'>;
  score: number;
  max_score: number;
  started_at: string;
  completed_at: string | null;
  flagged: number;
};

type AnswerRow = {
  id: string;
  round_id: string;
  question_id: string;
  position: number;
  answer: string;
  score: number;
  max_score: number;
  feedback: string;
  signals_json: string;
  graded: number;
  audio_url: string | null;
};

function parseSignals(json: string): EvaluationSignal[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as EvaluationSignal[]) : [];
  } catch {
    // A malformed blob should not break the candidate's result page.
    return [];
  }
}

function parseJsonObject(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A prompt generated for one section of one round. */
export type GeneratedQuestion = {
  sectionId: string;
  /** The question text the candidate was shown. */
  question: string;
  /** Everything the generator returned, including the answer key. */
  data: Record<string, unknown>;
};

export function generatedQuestionId(roundId: string, sectionId: string): string {
  return `${roundId}_${sectionId}`;
}

export function findGeneratedQuestion(roundId: string, sectionId: string): GeneratedQuestion | null {
  const row = getDb()
    .prepare('SELECT question_type, content FROM questions WHERE id = ?')
    .get(generatedQuestionId(roundId, sectionId)) as
    | { question_type: string; content: string }
    | undefined;
  if (!row) return null;
  const data = parseJsonObject(row.content);
  const question = typeof data.question === 'string' ? data.question.trim() : '';
  return { sectionId: row.question_type, question, data };
}

/**
 * Generated prompts are cached per round and section. The round page can ask for
 * the same section twice, so the insert loses the race rather than throwing.
 */
export function saveGeneratedQuestion(
  roundId: string,
  sectionId: string,
  data: Record<string, unknown>,
): void {
  const payload = JSON.stringify(data);
  getDb()
    .prepare(
      `INSERT INTO questions (id, category, question_type, content, metadata_json, created_by, created_at)
       VALUES (?, 'dynamic_ai', ?, ?, ?, 'system', ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(generatedQuestionId(roundId, sectionId), sectionId, payload, payload, new Date().toISOString());
}

export function findRoundById(id: string): RoundRow | null {
  const row = getDb().prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow | undefined;
  return row ? { ...row } : null;
}

export function findRound(applicationId: string, kind: RoundKind): RoundRow | null {
  const row = getDb()
    .prepare('SELECT * FROM rounds WHERE application_id = ? AND kind = ?')
    .get(applicationId, kind) as RoundRow | undefined;
  return row ? { ...row } : null;
}

export function listRoundsForApplication(applicationId: string): RoundRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM rounds WHERE application_id = ? ORDER BY started_at')
    .all(applicationId) as RoundRow[];
  return rows.map(r => ({ ...r }));
}

export function startRound(applicationId: string, kind: RoundKind): RoundRow {
  return transact(db => {
    const existing = db
      .prepare('SELECT * FROM rounds WHERE application_id = ? AND kind = ?')
      .get(applicationId, kind) as RoundRow | undefined;
    // Re-entering a round that is already underway just hands back the same one.
    if (existing) return { ...existing };

    const id = generateId();
    db.prepare(
      `INSERT INTO rounds (id, application_id, kind, status, score, max_score, started_at)
       VALUES (?, ?, ?, 'in_progress', 0, 0, ?)`,
    ).run(id, applicationId, kind, new Date().toISOString());
    return db.prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow;
  });
}

/**
 * Re-inserts a round row. Used when a recruiter sends a candidate back to a
 * stage, so the candidate gets a genuine second attempt rather than a stale
 * result.
 */
export function resetRound(applicationId: string, kind: RoundKind): RoundRow {
  return transact(db => {
    db.prepare('DELETE FROM rounds WHERE application_id = ? AND kind = ?').run(applicationId, kind);
    const id = generateId();
    db.prepare(
      `INSERT INTO rounds (id, application_id, kind, status, score, max_score, started_at)
       VALUES (?, ?, ?, 'in_progress', 0, 0, ?)`,
    ).run(id, applicationId, kind, new Date().toISOString());
    const row = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow;
    return { ...row };
  });
}

export function saveAnswer(
  roundId: string,
  questionId: string,
  position: number,
  answer: string,
  evaluation: AnswerEvaluation,
  graded: boolean = true,
): void {
  transact(db => {
    db.prepare(
      `INSERT INTO round_answers
         (id, round_id, question_id, position, answer, score, max_score, feedback, signals_json, graded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (round_id, question_id) DO UPDATE SET
         answer = excluded.answer,
         score = excluded.score,
         max_score = excluded.max_score,
         feedback = excluded.feedback,
         signals_json = excluded.signals_json,
         graded = excluded.graded`,
    ).run(
      generateId(),
      roundId,
      questionId,
      position,
      answer,
      evaluation.score,
      evaluation.maxScore,
      evaluation.feedback,
      JSON.stringify(evaluation.signals),
      graded ? 1 : 0,
    );
  });
}

export function recordProctoringEvent(roundId: string, eventType: string): void {
  transact(db => {
    db.prepare(
      'INSERT INTO proctoring_events (id, round_id, event_type, timestamp) VALUES (?, ?, ?, ?)'
    ).run(generateId(), roundId, eventType, new Date().toISOString());
  });
}

export function listProctoringEvents(roundId: string) {
  const rows = getDb().prepare('SELECT event_type, timestamp FROM proctoring_events WHERE round_id = ? ORDER BY timestamp ASC').all(roundId) as { event_type: string, timestamp: string }[];
  return rows.map(r => ({ eventType: r.event_type, timestamp: r.timestamp }));
}

export function findAnswer(roundId: string, questionId: string): AnswerRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM round_answers WHERE round_id = ? AND question_id = ?')
    .get(roundId, questionId) as AnswerRow | undefined;
  return row ? toAnswerRecord(row, '') : null;
}

export function listAnswers(roundId: string): AnswerRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM round_answers WHERE round_id = ? ORDER BY position')
    .all(roundId) as AnswerRow[];
  return rows.map(row => toAnswerRecord(row, ''));
}

function toAnswerRecord(row: AnswerRow, prompt: string): AnswerRecord {
  return {
    id: row.id,
    questionId: row.question_id,
    prompt,
    position: row.position,
    answer: row.answer,
    score: row.score,
    maxScore: row.max_score,
    feedback: row.feedback,
    signals: parseSignals(row.signals_json),
    graded: row.graded !== 0,
    audioUrl: row.audio_url ?? null,
  };
}

/** Attaches a recorded answer to the row once the upload succeeds. */
export function setAnswerAudio(roundId: string, questionId: string, audioUrl: string): void {
  getDb()
    .prepare('UPDATE round_answers SET audio_url = ? WHERE round_id = ? AND question_id = ?')
    .run(audioUrl, roundId, questionId);
}

export function setRoundFlagged(roundId: string, flagged: boolean): void {
  getDb().prepare('UPDATE rounds SET flagged = ? WHERE id = ?').run(flagged ? 1 : 0, roundId);
}

export function scoreRound(
  roundId: string,
  status: 'passed' | 'failed',
): RoundRow {
  const totals = getDb()
    .prepare(
      'SELECT COALESCE(SUM(score), 0) AS score, COALESCE(SUM(max_score), 0) AS max_score FROM round_answers WHERE round_id = ?',
    )
    .get(roundId) as { score: number; max_score: number };

  transact(db => {
    db.prepare(
      `UPDATE rounds SET status = ?, score = ?, max_score = ?, completed_at = ? WHERE id = ?`,
    ).run(status, totals.score, totals.max_score, new Date().toISOString(), roundId);
  });

  const row = getDb().prepare('SELECT * FROM rounds WHERE id = ?').get(roundId) as RoundRow;
  return { ...row };
}
