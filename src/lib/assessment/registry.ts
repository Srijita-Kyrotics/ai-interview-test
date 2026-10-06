import { communicationQuestions } from './questions/communication';
import { aptitudeQuestions } from './questions/aptitude';
import { technical1Questions } from './questions/technical1';
import { technical2Questions } from './questions/technical2';
import { evaluateCommunicationAnswer } from './evaluators/communication';
import type { AnswerEvaluation, RoundDefinition, RoundKind, RoundQuestion } from './types';

/**
 * The single place a round is defined. Adding Aptitude, Technical 1, etc. means
 * adding an entry here — the database, server actions and runner UI are all
 * driven from this map and need no changes.
 */
const definitions: Record<RoundKind, RoundDefinition> = {
  communication: {
    kind: 'communication',
    title: 'Communication Round',
    shortTitle: 'Communication',
    stage: 'Communication',
    passesTo: 'Aptitude',
    summary:
      'Five short written prompts that assess how clearly you explain your background, your thinking and your questions.',
    instructions: [
      'Answer all five questions in your own words. There is no right answer, only how well you communicate.',
      'Structure each answer like you would in an interview: a short opening, your reasoning, then a closing.',
      'Aim for the suggested word count on each question. The evaluator looks at depth, structure, vocabulary, fluency and tone.',
      'Your answer is assessed as soon as you submit it, so you cannot revise it afterwards. Read the question before you start.',
      'The round is timed. If the timer runs out the round closes with whatever you have submitted and the result is still recorded.',
    ],
    timeLimitSec: 15 * 60,
    passThreshold: 60,
    minAnswersToPass: 4,
    proctoringFlagThreshold: 3,
    maxScorePerAnswer: 10,
    questions: communicationQuestions,
    evaluate: ({ question, answer }): AnswerEvaluation =>
      evaluateCommunicationAnswer({ question, answer, maxScore: 10 }),
  },

  // --- Registered but not built yet. The runner will say so explicitly. ---
  aptitude: {
    kind: 'aptitude',
    title: 'Aptitude Round',
    shortTitle: 'Aptitude',
    stage: 'Aptitude',
    passesTo: 'Technical 1',
    summary: 'Five questions testing logical, numerical, and reasoning abilities.',
    instructions: [
      'Answer all five questions.',
      'Use logical thinking to arrive at the solution.',
      'The evaluator scores your reasoning and final answer.',
      'Your answer is assessed as soon as you submit it, so you cannot revise it afterwards.',
      'The round is timed. If the timer runs out the round closes with whatever you have submitted.'
    ],
    timeLimitSec: 20 * 60,
    passThreshold: 60,
    minAnswersToPass: 4,
    proctoringFlagThreshold: 3,
    maxScorePerAnswer: 10,
    questions: aptitudeQuestions,
    // Graded in `submitRoundAnswer` against the generated question and its
    // answer key, so there is no deterministic evaluator to fall back to.
    // Returning a default of 0 here would quietly fail every candidate.
    evaluate: () => {
      throw new Error('The Aptitude evaluator is driven by the AI path in submitRoundAnswer.');
    },
  },
  technical1: {
    kind: 'technical1',
    title: 'Technical Round 1',
    shortTitle: 'Technical 1',
    stage: 'Technical 1',
    passesTo: 'Technical 2',
    summary: 'Three programming fundamentals and logic questions evaluated by our AI Interviewer.',
    instructions: [
      'Answer all three questions.',
      'Explain your thought process clearly.',
      'The evaluator scores your understanding and approach.',
      'Your answer is assessed as soon as you submit it, so you cannot revise it afterwards.',
      'The round is timed. If the timer runs out the round closes with whatever you have submitted.'
    ],
    timeLimitSec: 30 * 60,
    passThreshold: 60,
    minAnswersToPass: 2,
    proctoringFlagThreshold: 3,
    maxScorePerAnswer: 10,
    questions: technical1Questions,
    evaluate: () => {
      throw new Error('The Technical 1 evaluator is driven by the AI path in submitRoundAnswer.');
    },
  },
  technical2: {
    kind: 'technical2',
    title: 'Technical Round 2',
    shortTitle: 'Technical 2',
    stage: 'Technical 2',
    passesTo: 'HR',
    summary: 'Three advanced system design and coding questions evaluated by our AI Interviewer.',
    instructions: [
      'Answer all three questions.',
      'Discuss trade-offs and edge cases where applicable.',
      'The evaluator scores your system-level thinking and robust coding practices.',
      'Your answer is assessed as soon as you submit it, so you cannot revise it afterwards.',
      'The round is timed. If the timer runs out the round closes with whatever you have submitted.'
    ],
    timeLimitSec: 45 * 60,
    passThreshold: 60,
    minAnswersToPass: 2,
    proctoringFlagThreshold: 3,
    maxScorePerAnswer: 10,
    questions: technical2Questions,
    evaluate: () => {
      throw new Error('The Technical 2 evaluator is driven by the AI path in submitRoundAnswer.');
    },
  },
  hr: notBuilt('hr', 'HR Round', 'HR', 'Selected'),
};

function notBuilt(
  kind: RoundKind,
  title: string,
  stage: RoundDefinition['stage'],
  passesTo: RoundDefinition['passesTo'],
): RoundDefinition {
  return {
    kind,
    title,
    shortTitle: title,
    stage,
    passesTo,
    summary: 'Not built yet.',
    instructions: [],
    timeLimitSec: 0,
    passThreshold: 0,
    minAnswersToPass: 0,
    proctoringFlagThreshold: 0,
    maxScorePerAnswer: 0,
    questions: [],
    evaluate: () => {
      throw new Error(`The ${title} evaluator is not implemented.`);
    },
  };
}

export function isRoundKind(value: string): value is RoundKind {
  return value in definitions;
}

export function getRoundDefinition(kind: RoundKind): RoundDefinition {
  return definitions[kind];
}

export function isRoundBuilt(kind: RoundKind): boolean {
  return definitions[kind].questions.length > 0;
}

export function getQuestion(kind: RoundKind, questionId: string): RoundQuestion | null {
  return definitions[kind].questions.find(q => q.id === questionId) ?? null;
}
