import type { AnswerEvaluation } from './types';

/**
 * The model is asked for bare JSON, but it sometimes wraps the object in a
 * markdown fence or adds a sentence around it. Rather than failing the answer,
 * dig the outermost object out of whatever came back.
 */
export function parseAiJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();

  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('The AI response did not contain JSON.');
  }
}

const SIGNAL_LEVELS = new Set(['good', 'ok', 'poor']);

/**
 * The score is written straight to the candidate's record, so it is clamped to
 * the range the round defines and every signal is coerced to the shape the
 * result page renders. A malformed signal would otherwise become an unknown
 * `round-signal-*` class.
 */
export function normalizeAiEvaluation(parsed: unknown, maxScore: number): AnswerEvaluation {
  const raw = (parsed ?? {}) as {
    score?: unknown;
    feedback?: unknown;
    signals?: unknown;
  };

  const numericScore =
    typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : 0;
  const feedback =
    typeof raw.feedback === 'string' && raw.feedback.trim() !== ''
      ? raw.feedback.trim()
      : 'No feedback was returned for this answer.';

  const signals = Array.isArray(raw.signals)
    ? raw.signals
        .filter((signal): signal is Record<string, unknown> => !!signal && typeof signal === 'object')
        .filter(signal => typeof signal.label === 'string' && signal.label.trim() !== '')
        .map(signal => ({
          label: String(signal.label),
          detail: typeof signal.detail === 'string' ? signal.detail : '',
          level: SIGNAL_LEVELS.has(String(signal.level))
            ? (signal.level as AnswerEvaluation['signals'][number]['level'])
            : 'ok',
        }))
    : [];

  return {
    score: Math.min(maxScore, Math.max(0, numericScore)),
    maxScore,
    feedback,
    signals,
  };
}