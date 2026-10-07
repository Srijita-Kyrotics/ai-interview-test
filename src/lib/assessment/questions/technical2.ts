import type { RoundQuestion } from '../types.ts';

export const technical2Questions: RoundQuestion[] = [
  {
    id: 'tech2-system-design',
    kind: 'technical2',
    position: 0,
    prompt: 'System Design',
    hint: 'Outline the architecture, components, and trade-offs.',
    minWords: 30,
    suggestedWords: 100,
  },
  {
    id: 'tech2-scalability',
    kind: 'technical2',
    position: 1,
    prompt: 'Scalability & Performance',
    hint: 'Discuss bottlenecks and optimization strategies.',
    minWords: 30,
    suggestedWords: 100,
  },
  {
    id: 'tech2-advanced-coding',
    kind: 'technical2',
    position: 2,
    prompt: 'Advanced Coding Problem',
    hint: 'Provide a robust, edge-case-handled solution in the code editor.',
    minWords: 20,
    suggestedWords: 80,
    isCoding: true,
  }
];
