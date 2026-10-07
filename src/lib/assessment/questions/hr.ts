import type { RoundQuestion } from '../types.ts';

export const hrQuestions: RoundQuestion[] = [
  {
    id: 'hr-cultural-fit',
    kind: 'hr',
    position: 0,
    prompt: 'Introduction & Cultural Alignment',
    hint: 'Introduce yourself, what excites you about this role, and how your values align with our work culture.',
    minWords: 25,
    suggestedWords: 80,
  },
  {
    id: 'hr-teamwork-conflict',
    kind: 'hr',
    position: 1,
    prompt: 'Teamwork & Conflict Resolution',
    hint: 'Describe a time you faced disagreement in a team. How did you handle it and what was the outcome?',
    minWords: 30,
    suggestedWords: 100,
  },
  {
    id: 'hr-adaptability-pressure',
    kind: 'hr',
    position: 2,
    prompt: 'Adaptability & Handling Pressure',
    hint: 'Give an example of how you managed tight deadlines, changing requirements, or high-stress situations.',
    minWords: 30,
    suggestedWords: 100,
  },
  {
    id: 'hr-career-goals',
    kind: 'hr',
    position: 3,
    prompt: 'Career Aspirations & Motivation',
    hint: 'Explain your short-term and long-term career aspirations and what keeps you motivated to perform at your best.',
    minWords: 25,
    suggestedWords: 80,
  },
];
