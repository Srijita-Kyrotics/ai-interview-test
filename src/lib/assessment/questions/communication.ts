import type { RoundQuestion } from '../types';

/**
 * Superset-style behavioural/communication prompts: open enough to be real
 * conversation, structured enough to compare candidates. Each one targets a
 * different communication skill.
 */
export const communicationQuestions: RoundQuestion[] = [
  {
    id: 'com-intro',
    kind: 'communication',
    position: 0,
    prompt:
      'Introduce yourself and tell us why you are interested in this role.',
    hint: 'A short background, then the specific reason this role fits you.',
    minWords: 40,
    suggestedWords: 90,
  },
  {
    id: 'com-problem',
    kind: 'communication',
    position: 1,
    prompt:
      'Describe a technical problem you solved. Walk us through how you approached it.',
    hint: 'Set up the problem, explain the steps you took, and say how you verified the result.',
    minWords: 60,
    suggestedWords: 130,
  },
  {
    id: 'com-explain',
    kind: 'communication',
    position: 2,
    prompt:
      'Explain something you know well to someone with no technical background.',
    hint: 'Avoid jargon, or define it. Use an analogy if it helps.',
    minWords: 50,
    suggestedWords: 110,
  },
  {
    id: 'com-team',
    kind: 'communication',
    position: 3,
    prompt:
      'Tell us about a time you worked in a team. How did you handle disagreement?',
    hint: 'Give a specific situation, describe your own contribution honestly, and say what you changed afterwards.',
    minWords: 50,
    suggestedWords: 120,
  },
  {
    id: 'com-questions',
    kind: 'communication',
    position: 4,
    prompt:
      'What do you know about this role, and what questions do you have for us?',
    hint: 'Show you have thought about the work, then ask something specific.',
    minWords: 35,
    suggestedWords: 80,
  },
];
