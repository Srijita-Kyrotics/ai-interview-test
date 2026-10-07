import type { RoundQuestion } from '../types.ts';

export const communicationQuestions: RoundQuestion[] = [
  {
    id: 'grammar',
    kind: 'communication',
    position: 0,
    prompt: 'English Grammar',
    hint: 'Select or write the correct grammatical answer.',
    minWords: 0,
    suggestedWords: 0,
  },
  {
    id: 'tenses',
    kind: 'communication',
    position: 1,
    prompt: 'Tenses',
    hint: 'Provide the correct tense.',
    minWords: 0,
    suggestedWords: 0,
  },
  {
    id: 'fill-blank',
    kind: 'communication',
    position: 2,
    prompt: 'Fill in the Missing Word',
    hint: 'Provide the missing word for the sentence.',
    minWords: 0,
    suggestedWords: 0,
  },
  {
    id: 'listen-speak',
    kind: 'communication',
    position: 3,
    prompt: 'Listen & Speak',
    hint: 'Listen to the prompt and speak your response.',
    minWords: 5,
    suggestedWords: 30,
  },
  {
    id: 'essay',
    kind: 'communication',
    position: 4,
    prompt: 'Short Essay',
    hint: 'Speak a short essay on the provided topic (150-250 words).',
    minWords: 30,
    suggestedWords: 150,
  },
];
