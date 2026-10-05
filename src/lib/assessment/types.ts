import type { ApplicationStage } from '@/lib/types';

/**
 * Every assessment round in the pipeline. The Communication round is the only
 * one implemented so far; the rest exist here so that adding a round is a
 * matter of registering a definition, not touching the runner UI.
 */
export const ROUND_KINDS = ['communication', 'aptitude', 'technical1', 'technical2', 'hr'] as const;

export type RoundKind = (typeof ROUND_KINDS)[number];

/** Rounds that currently have questions and an evaluator wired up. */
export const ACTIVE_ROUND_KINDS: RoundKind[] = ['communication', 'aptitude'];

/**
 * `locked` is derived, not stored: a round is locked until the application
 * reaches the pipeline stage the round is attached to.
 */
export type RoundStatus = 'locked' | 'not_started' | 'in_progress' | 'passed' | 'failed';

export type SignalLevel = 'good' | 'ok' | 'poor';

export interface EvaluationSignal {
  label: string;
  detail: string;
  level: SignalLevel;
}

export interface AnswerEvaluation {
  /** Points earned for this answer, out of `maxScore`. */
  score: number;
  maxScore: number;
  /** One short paragraph of feedback written for the candidate. */
  feedback: string;
  signals: EvaluationSignal[];
}

export interface RoundQuestion {
  id: string;
  kind: RoundKind;
  position: number;
  prompt: string;
  /** Shown under the prompt to steer the candidate. */
  hint?: string;
  /** Below this the answer is treated as too thin to assess. */
  minWords: number;
  /** Around this the answer is considered comfortably complete. */
  suggestedWords: number;
}

/**
 * A single reusable scoring strategy. The Communication round ships with a
 * deterministic rule-based evaluator; a model-backed evaluator can be dropped
 * in later without the runner, database or UI changing at all.
 */
export type Evaluator = (input: { question: RoundQuestion; answer: string }) => AnswerEvaluation;

export interface RoundDefinition {
  kind: RoundKind;
  title: string;
  shortTitle: string;
  /** The application stage this round unlocks and is graded against. */
  stage: ApplicationStage;
  /** Stage the application moves to when the round is passed. */
  passesTo: ApplicationStage;
  summary: string;
  instructions: string[];
  /** Whole-round budget, in seconds. */
  timeLimitSec: number;
  /** Percentage needed to pass. */
  passThreshold: number;
  /** Answers that must be submitted before a pass can be awarded. */
  minAnswersToPass: number;
  /** Proctoring events tolerated before the round is flagged for a recruiter. */
  proctoringFlagThreshold: number;
  /** Marks each question is worth. */
  maxScorePerAnswer: number;
  questions: RoundQuestion[];
  evaluate: Evaluator;
}

/** Questions and metadata, safe to send to a client component. */
export type SerializableRoundDefinition = Omit<RoundDefinition, 'evaluate'>;

/**
 * Strips the evaluator so the definition can cross the server/client boundary.
 * Written out explicitly rather than by omitting a key, so a new field is never
 * leaked to the client by accident.
 */
export function toSerializable(definition: RoundDefinition): SerializableRoundDefinition {
  return {
    kind: definition.kind,
    title: definition.title,
    shortTitle: definition.shortTitle,
    stage: definition.stage,
    passesTo: definition.passesTo,
    summary: definition.summary,
    instructions: definition.instructions,
    timeLimitSec: definition.timeLimitSec,
    passThreshold: definition.passThreshold,
    minAnswersToPass: definition.minAnswersToPass,
    proctoringFlagThreshold: definition.proctoringFlagThreshold,
    maxScorePerAnswer: definition.maxScorePerAnswer,
    questions: definition.questions,
  };
}

/** A stored answer joined back to its question, ready to render. */
export interface AnswerRecord {
  id: string;
  questionId: string;
  prompt: string;
  position: number;
  answer: string;
  score: number;
  maxScore: number;
  feedback: string;
  signals: EvaluationSignal[];
  /** False when the model could not grade this answer. */
  graded: boolean;
  /** Set once the candidate's spoken answer has been stored. */
  audioUrl: string | null;
}

export interface RoundState {
  /** `null` until the round has been started. */
  id: string | null;
  applicationId: string;
  kind: RoundKind;
  status: RoundStatus;
  score: number;
  maxScore: number;
  /** 0-100, or `null` before the round is completed. */
  percent: number | null;
  passed: boolean | null;
  startedAt: string | null;
  completedAt: string | null;
  passThreshold: number;
  /** Percentage needed to pass. */
  minAnswersToPass: number;
  /** Proctoring events tolerated before the round is flagged for review. */
  proctoringFlagThreshold: number;
  answers: AnswerRecord[];
  /** True when the round needs a human to look at it before it is trusted. */
  flagged: boolean;
  /** How many answers the model could not grade. */
  answersUngraded: number;
  /** Seconds left on the whole-round timer, or `null` if not started/finished. */
  secondsRemaining: number | null;
  proctoringEvents: { eventType: string; timestamp: string }[];
}
