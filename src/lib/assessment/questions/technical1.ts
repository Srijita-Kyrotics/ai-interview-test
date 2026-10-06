import type { RoundQuestion } from '../types';

export const technical1Questions: RoundQuestion[] = [
  {
    id: 'tech1-fundamentals',
    kind: 'technical1',
    position: 0,
    prompt: 'Programming Fundamentals',
    hint: 'Explain the core concepts and how they apply.',
    minWords: 15,
    suggestedWords: 50,
  },
  {
    id: 'tech1-algorithms',
    kind: 'technical1',
    position: 1,
    prompt: 'Algorithms & Data Structures',
    hint: 'Describe an optimal approach to the problem.',
    minWords: 20,
    suggestedWords: 80,
  },
  {
    id: 'tech1-debugging',
    kind: 'technical1',
    position: 2,
    prompt: 'Debugging & Troubleshooting',
    hint: 'Identify the issue and propose a fix.',
    minWords: 15,
    suggestedWords: 50,
  }
];
