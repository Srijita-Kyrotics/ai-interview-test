import { generateOpenRouterCompletion } from '../src/lib/ai/openrouter.ts';
import { parseAiJson, normalizeAiEvaluation } from '../src/lib/assessment/ai-response.ts';

if (!process.env.OPENROUTER_API_KEY?.trim()) {
  console.error('OPENROUTER_API_KEY is not set. Export it before running this script.');
  process.exit(1);
}

async function testSection(name, instruction) {
  process.stdout.write(`Testing ${name}... `);
  try {
    const raw = await generateOpenRouterCompletion(
      instruction,
      'You are an assessment generator. Return ONLY valid JSON.',
      true
    );
    const parsed = parseAiJson(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.question) {
      console.log('FAIL (Invalid structure)', raw);
      return false;
    }
    console.log(`OK -> "${parsed.question.slice(0, 60)}..."`);
    return true;
  } catch (err) {
    console.log('FAIL:', err.message);
    return false;
  }
}

async function testEvaluation() {
  process.stdout.write('Testing AI Evaluation... ');
  try {
    const evalPrompt = `Evaluate the candidate's answer to this question:
Question: Tell me about a time you handled conflict in a team.
Correct Answer/Criteria: Looking for STAR method, empathy, constructive communication, positive outcome.
Candidate Answer: In my final year project, our team had a disagreement on whether to use React or Vue. I organized a meeting where each member listed pros and cons for our use case. We decided on React based on team familiarity and completed the project on time.

Provide JSON with:
{
  "score": <number 0 to 10>,
  "feedback": "<string feedback for candidate>",
  "signals": [
    {"label": "<string>", "detail": "<string>", "level": "<good | ok | poor>"}
  ]
}`;
    const raw = await generateOpenRouterCompletion(
      evalPrompt,
      'You are an expert interviewer evaluating a candidate. Return ONLY valid JSON.',
      true
    );
    const parsed = parseAiJson(raw);
    const evalResult = normalizeAiEvaluation(parsed, 10);
    console.log(`OK -> Score: ${evalResult.score}/10, Feedback: "${evalResult.feedback.slice(0, 60)}..."`);
    return true;
  } catch (err) {
    console.log('FAIL:', err.message);
    return false;
  }
}

async function main() {
  console.log('Testing OpenRouter API Integration...\n');
  
  const sections = [
    ['HR Cultural Fit', 'Generate an HR interview question assessing cultural fit, personal background, and alignment with company culture. Provide JSON: {"question": "...", "evaluation_criteria": "..."}'],
    ['HR Teamwork & Conflict', 'Generate a behavioral HR interview question about conflict resolution, teamwork, or collaborating under differences. Provide JSON: {"question": "...", "evaluation_criteria": "..."}'],
    ['HR Adaptability', 'Generate a situational HR interview question about adaptability, working under tight deadlines, or handling unexpected change. Provide JSON: {"question": "...", "evaluation_criteria": "..."}'],
    ['HR Career Goals', 'Generate an HR interview question about career aspirations, motivation, self-growth, and long-term professional goals. Provide JSON: {"question": "...", "evaluation_criteria": "..."}'],
    ['Tech 1 Fundamentals', 'Generate a question about programming fundamentals (e.g. OOP, functional programming). Provide JSON: {"question": "...", "evaluation_criteria": "..."}'],
    ['Tech 2 System Design', 'Generate a system design interview question. Provide JSON: {"question": "...", "evaluation_criteria": "..."}'],
    ['Aptitude Logic', 'Generate a logical reasoning question for an aptitude test. Provide JSON: {"question": "...", "correct_answer": "...", "difficulty": "medium", "concept": "logic"}'],
    ['Communication Grammar', 'Generate an English grammar question. Provide JSON: {"question": "...", "correct_answer": "...", "difficulty": "medium", "concept": "grammar"}'],
  ];

  let ok = 0;
  for (const [name, instruction] of sections) {
    if (await testSection(name, instruction)) ok++;
  }

  if (await testEvaluation()) ok++;

  console.log(`\nResults: ${ok}/${sections.length + 1} tests succeeded.`);
  if (ok < sections.length + 1) process.exit(1);
}

main();
