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
): void {
  transact(db => {
    // A round is answered once; re-submitting the same question overwrites it.
    db.prepare(
      `INSERT INTO round_answers
         (id, round_id, question_id, position, answer, score, max_score, feedback, signals_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (round_id, question_id) DO UPDATE SET
         answer = excluded.answer,
         score = excluded.score,
         max_score = excluded.max_score,
         feedback = excluded.feedback,
         signals_json = excluded.signals_json`,
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

export function listAnswers(roundId: string): AnswerRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM round_answers WHERE round_id = ? ORDER BY position')
    .all(roundId) as AnswerRow[];
  return rows.map(row => ({
    id: row.id,
    questionId: row.question_id,
    // Prompt text lives in the question bank, not here, so the bank stays the
    // single source of truth. The answer itself is always stored verbatim.
    prompt: '',
    position: row.position,
    answer: row.answer,
    score: row.score,
    maxScore: row.max_score,
    feedback: row.feedback,
    signals: parseSignals(row.signals_json),
  }));
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
