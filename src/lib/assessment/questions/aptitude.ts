import type { RoundQuestion } from '../types';

export const aptitudeQuestions: RoundQuestion[] = [
  {
    id: 'logical-reasoning',
    kind: 'aptitude',
    position: 0,
    prompt: 'Logical Reasoning',
    hint: 'Read the scenario carefully and deduce the logical conclusion.',
    minWords: 5,
    suggestedWords: 30,
  },
  {
    id: 'numerical-ability',
    kind: 'aptitude',
    position: 1,
    prompt: 'Numerical Ability',
    hint: 'Solve the math problem and explain your steps.',
    minWords: 5,
    suggestedWords: 30,
  },
  {
    id: 'data-interpretation',
    kind: 'aptitude',
    position: 2,
    prompt: 'Data Interpretation',
    hint: 'Interpret the provided data and answer the question.',
    minWords: 10,
    suggestedWords: 40,
  },
  {
    id: 'spatial-reasoning',
    kind: 'aptitude',
    position: 3,
    prompt: 'Spatial Reasoning',
    hint: 'Solve the spatial puzzle described.',
    minWords: 5,
    suggestedWords: 20,
  },
  {
    id: 'pattern-recognition',
    kind: 'aptitude',
    position: 4,
    prompt: 'Pattern Recognition',
    hint: 'Identify the pattern and provide the next item in the sequence.',
    minWords: 5,
    suggestedWords: 20,
  },
];
