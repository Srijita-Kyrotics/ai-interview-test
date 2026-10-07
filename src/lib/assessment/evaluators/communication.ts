import type { AnswerEvaluation, EvaluationSignal, RoundQuestion } from '../types.ts';

/**
 * Deterministic, explainable scoring for spoken/written communication.
 *
 * Every signal below is a heuristic on surface form (length, structure,
 * vocabulary spread, filler usage, tone). It is intentionally transparent:
 * the candidate sees exactly which signals pushed the score up or down, and a
 * recruiter can read the same breakdown. It is not a model and does not
 * pretend to judge the truth of what someone said.
 *
 * Swapping in a model-backed evaluator later means implementing
 * `AnswerEvaluation` from `RoundQuestion + string` and registering it in
 * `registry.ts` — nothing else in the app changes.
 */

const FILLER_WORDS = [
  'um',
  'uh',
  'erm',
  'hmm',
  'like',
  'basically',
  'literally',
  'actually',
  'obviously',
  'sort of',
  'kind of',
  'you know',
  'i mean',
  'right?',
];

const CONNECTORS = [
  'first',
  'second',
  'third',
  'finally',
  'then',
  'next',
  'because',
  'since',
  'therefore',
  'however',
  'moreover',
  'furthermore',
  'for example',
  'for instance',
  'as a result',
  'in addition',
  'in conclusion',
  'overall',
  'meanwhile',
  'additionally',
];

const UNPROFESSIONAL = [
  'dude',
  'bro',
  'gonna',
  'wanna',
  'gotta',
  'kinda',
  'cuz',
  'aint',
  'lol',
  'haha',
  'yeah no',
  'whatever',
  'stuff',
];

const PRONOUN_REFERENCE = ['i ', 'we ', 'my ', 'our '];

function words(answer: string): string[] {
  return answer.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}

function sentences(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function countOccurrences(haystack: string, needles: string[]): string[] {
  return needles.filter(n => haystack.includes(n));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function band(value: number, good: number, ok: number): EvaluationSignal['level'] {
  if (value >= good) return 'good';
  if (value >= ok) return 'ok';
  return 'poor';
}

type Dimension = { value: number; signal: EvaluationSignal };

function scoreDimension(
  label: string,
  value: number,
  good: number,
  ok: number,
  detail: string,
): Dimension {
  return { value, signal: { label, detail, level: band(value, good, ok) } };
}

export function evaluateCommunicationAnswer(input: {
  question: RoundQuestion;
  answer: string;
  maxScore: number;
}): AnswerEvaluation {
  const { question, answer, maxScore } = input;
  const text = answer.trim();
  const wordList = words(text);
  const wordCount = wordList.length;
  const sentenceList = sentences(text);
  const lower = text.toLowerCase();

  // --- Content: is there enough substance to assess at all? ---
  const contentRatio = clamp01(
    (wordCount - question.minWords) / Math.max(1, question.suggestedWords - question.minWords),
  );
  const content = scoreDimension(
    'Content depth',
    contentRatio,
    1,
    0.5,
    wordCount < question.minWords
      ? `${wordCount} words — aim for at least ${question.minWords}.`
      : `${wordCount} words, which is in the expected range for this question.`,
  );

  // --- Structure: broken into sentences, with explicit ordering. ---
  const hasConnectors = countOccurrences(lower, CONNECTORS);
  const hasPronounReference = PRONOUN_REFERENCE.some(p => lower.includes(p));
  const structureRatio = clamp01(
    (Math.min(sentenceList.length, 5) / 5) * 0.45 +
      (hasConnectors.length > 0 ? 0.35 : 0) +
      (hasPronounReference ? 0.2 : 0),
  );
  const structure = scoreDimension(
    'Structure',
    structureRatio,
    0.8,
    0.5,
    `${sentenceList.length} sentence(s)` +
      (hasConnectors.length > 0
        ? `, organised with linking words (${hasConnectors.slice(0, 3).join(', ')}).`
        : ', but no linking words to show how the ideas connect.'),
  );

  // --- Vocabulary: how many distinct words relative to length. ---
  const uniqueRatio = wordCount === 0 ? 0 : new Set(wordList).size / wordCount;
  const avgWordLength =
    wordCount === 0 ? 0 : wordList.reduce((sum, w) => sum + w.length, 0) / wordCount;
  const vocabRatio = clamp01((uniqueRatio - 0.35) / 0.3) * 0.7 + clamp01((avgWordLength - 3.5) / 2) * 0.3;
  const vocabulary = scoreDimension(
    'Vocabulary range',
    vocabRatio,
    0.75,
    0.45,
    `${new Set(wordList).size} distinct words across ${wordCount}, averaging ${avgWordLength.toFixed(1)} characters.`,
  );

  // --- Fluency: filler usage, penalised by density rather than raw count. ---
  const fillerHits = countOccurrences(lower, FILLER_WORDS);
  const fillerDensity = wordCount === 0 ? 1 : fillerHits.length / Math.max(1, wordCount / 50);
  const fluencyRatio = clamp01(1 - fillerDensity / 2);
  const fluency = scoreDimension(
    'Fluency',
    fluencyRatio,
    0.85,
    0.5,
    fillerHits.length === 0
      ? 'No filler words detected.'
      : `Detected ${fillerHits.length} filler word(s): ${fillerHits.join(', ')}.`,
  );

  // --- Tone: professional register. ---
  const toneHits = countOccurrences(lower, UNPROFESSIONAL);
  const shouting = /[A-Z]{4,}/.test(text) && wordCount > 3;
  const toneRatio = clamp01(1 - toneHits.length * 0.25 - (shouting ? 0.25 : 0));
  const tone = scoreDimension(
    'Professional tone',
    toneRatio,
    0.9,
    0.5,
    toneHits.length === 0 && !shouting
      ? 'Register is appropriately professional.'
      : `Tone flagged: ${[...toneHits, shouting ? 'all-caps emphasis' : ''].filter(Boolean).join(', ')}.`,
  );

  const dimensions = [content, structure, vocabulary, fluency, tone];
  const weights = [0.3, 0.2, 0.2, 0.2, 0.1];
  const weighted = dimensions.reduce((sum, d, i) => sum + d.value * weights[i], 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const percent = Math.round(clamp01(weighted / totalWeight) * 100);
  const score = Math.round((percent / 100) * maxScore * 10) / 10;

  const signals = dimensions.map(d => d.signal);

  const strengths = signals.filter(s => s.level === 'good').map(s => s.label);
  const weaknesses = signals.filter(s => s.level === 'poor');

  const summaryParts: string[] = [];
  if (strengths.length > 0) summaryParts.push(`Strong on ${lowerList(strengths)}.`);
  if (weaknesses.length > 0) {
    summaryParts.push(
      `Work on ${lowerList(weaknesses.map(s => s.label))} — ${
        weaknesses[0].detail.charAt(0).toLowerCase() + weaknesses[0].detail.slice(1)
      }`,
    );
  }
  if (summaryParts.length === 0) summaryParts.push('A reasonable answer across all five signals.');

  return {
    score,
    maxScore,
    feedback: `${summaryParts.join(' ')} (${percent}% of the marks for this answer.)`,
    signals,
  };
}

function lowerList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
