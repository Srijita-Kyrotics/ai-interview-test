/**
 * Unit tests for the pure decision logic behind the assessment rounds.
 *
 *   npm run test:unit
 *
 * No server and no API key needed: everything under test here is deliberately
 * free of database and model access so the rules can be checked directly.
 */
import { getDb } from '../src/lib/db/index.ts';
import * as repo from '../src/lib/db/repo.ts';
import { parseAiJson, normalizeAiEvaluation } from '../src/lib/assessment/ai-response.ts';
import { decideRoundOutcome } from '../src/lib/assessment/scoring.ts';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  isLegacyPlaintextPassword,
} from '../src/lib/passwords.ts';
import { consume, resetRateLimits } from '../src/lib/rate-limit.ts';

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const graded = (score, maxScore = 10) => ({ score, maxScore, graded: true });
const ungraded = (score = 0, maxScore = 10) => ({ score, maxScore, graded: false });

/* ------------------------------ AI json parsing ---------------------------- */

section('parseAiJson');

check('parses bare JSON', parseAiJson('{"a":1}').a === 1);
check('parses fenced JSON', parseAiJson('```json\n{"a":2}\n```').a === 2);
check('parses a fence with no language tag', parseAiJson('```\n{"a":3}\n```').a === 3);
check('digs JSON out of prose', parseAiJson('Here you go: {"a":4} hope that helps').a === 4);
check('tolerates surrounding whitespace', parseAiJson('  \n {"a":5} \n ').a === 5);
check('throws on prose with no object', (() => {
  try {
    parseAiJson('I cannot help with that.');
    return false;
  } catch {
    return true;
  }
})());
check('throws on an empty string', (() => {
  try {
    parseAiJson('   ');
    return false;
  } catch {
    return true;
  }
})());

/* --------------------------- evaluation normalising ----------------------- */

section('normalizeAiEvaluation');

check('keeps a valid score', normalizeAiEvaluation({ score: 7 }, 10).score === 7);
check('clamps a score above the maximum', normalizeAiEvaluation({ score: 42 }, 10).score === 10);
check('clamps a negative score', normalizeAiEvaluation({ score: -3 }, 10).score === 0);
check('rejects a non-numeric score', normalizeAiEvaluation({ score: '8' }, 10).score === 0);
check('rejects NaN', normalizeAiEvaluation({ score: Number.NaN }, 10).score === 0);
check('defaults the score when absent', normalizeAiEvaluation({}, 10).score === 0);
check('survives a null payload', normalizeAiEvaluation(null, 10).score === 0);
check('stamps the round max score', normalizeAiEvaluation({ score: 1 }, 10).maxScore === 10);
check('keeps real feedback', normalizeAiEvaluation({ feedback: 'Good.' }, 10).feedback === 'Good.');
check('substitutes missing feedback', normalizeAiEvaluation({}, 10).feedback.length > 0);
check('accepts known signal levels', normalizeAiEvaluation(
  { signals: [{ label: 'a', detail: 'd', level: 'good' }] }, 10,
).signals[0].level === 'good');
check('downgrades an unknown signal level', normalizeAiEvaluation(
  { signals: [{ label: 'a', detail: 'd', level: 'excellent' }] }, 10,
).signals[0].level === 'ok');
check('drops signals with no label', normalizeAiEvaluation(
  { signals: [{ detail: 'd', level: 'good' }] }, 10,
).signals.length === 0);
check('drops non-object signals', normalizeAiEvaluation(
  { signals: ['nope', null, { label: 'ok', detail: 'd', level: 'ok' }] }, 10,
).signals.length === 1);
check('defaults a missing signal detail', normalizeAiEvaluation(
  { signals: [{ label: 'a', level: 'ok' }] }, 10,
).signals[0].detail === '');
check('survives signals not being an array', normalizeAiEvaluation({ signals: 'x' }, 10).signals.length === 0);

/* ------------------------------ round scoring ------------------------------ */

section('decideRoundOutcome');

const opts = { passThreshold: 60, minAnswersToPass: 4 };

const full = decideRoundOutcome([graded(8), graded(8), graded(8), graded(8), graded(8)], opts);
check('five good answers pass', full.passed === true);
check('five good answers report 80%', full.percent === 80);
check('a passing round is not flagged', full.flagged === false);

const thin = decideRoundOutcome([graded(10), graded(10), graded(10), graded(10), graded(10)], opts);
check('five perfect answers are 100%', thin.percent === 100);

const tooFew = decideRoundOutcome([graded(10), graded(10), graded(10)], opts);
check('three perfect answers do not pass', tooFew.passed === false, `percent=${tooFew.percent}`);
check('too few answers is flagged', tooFew.flagged === true);
check('too few answers reports enoughAnswers=false', tooFew.enoughAnswers === false);
check('the decision percent matches the stored denominator', tooFew.percent === 100);

const partial = decideRoundOutcome([graded(10), graded(6), graded(0), graded(4)], opts);
check('four answers clear the minimum count', partial.enoughAnswers === true);
check('four weak answers fail on percent', partial.passed === false);
check('four answers are not flagged merely for being few', partial.flagged === false);

const withUngraded = decideRoundOutcome([graded(10), graded(10), graded(10), ungraded(), graded(10)], opts);
check('an ungraded answer blocks a pass', withUngraded.passed === false);
check('an ungraded answer flags the round', withUngraded.flagged === true);
check('ungraded count is reported', withUngraded.ungradedCount === 1);
check('percent still reflects what was scored', withUngraded.percent === 80);

const empty = decideRoundOutcome([], opts);
check('no answers never passes', empty.passed === false);
check('no answers is flagged', empty.flagged === true);
check('no answers reports 0%', empty.percent === 0);
check('no answers has no denominator', empty.maxScore === 0);

const boundary = decideRoundOutcome([graded(6), graded(6), graded(6), graded(6)], { passThreshold: 60, minAnswersToPass: 4 });
check('exactly the threshold passes', boundary.passed === true);

const below = decideRoundOutcome([graded(6), graded(6), graded(6), graded(6)], { passThreshold: 61, minAnswersToPass: 4 });
check('one point under the threshold fails', below.passed === false);

const custom = decideRoundOutcome([graded(8), graded(8), graded(8), graded(8), graded(8)], {
  passThreshold: 95,
  minAnswersToPass: 5,
});
check('a stricter threshold is honoured', custom.passed === false);

const fractional = decideRoundOutcome([{ score: 7.5, maxScore: 10, graded: true }, graded(8), graded(8), graded(8), graded(8)], opts);
check('fractional scores round to a whole percent', Number.isInteger(fractional.percent));

/* -------------------------------- passwords -------------------------------- */

section('passwords');

const hash = hashPassword('correct horse battery');
check('hash is tagged scrypt', hash.startsWith('scrypt$'));
check('hash does not contain the plaintext', !hash.includes('correct horse'));
check('verifies the right password', verifyPassword('correct horse battery', hash));
check('rejects the wrong password', !verifyPassword('wrong', hash));
check('rejects empty input', !verifyPassword('', hash));
check('rejects an empty stored secret', !verifyPassword('anything', ''));
check('salts differ between hashes', hashPassword('same') !== hashPassword('same'));
check('a legacy plaintext secret still verifies', verifyPassword('plain', 'plain'));
check('legacy plaintext is detected', isLegacyPlaintextPassword('plain'));
check('a hash is not flagged as legacy', !isLegacyPlaintextPassword(hash));
check('an empty secret is not flagged as legacy', !isLegacyPlaintextPassword(''));
check('a corrupted hash is rejected', !verifyPassword('x', 'scrypt$notbase64$alsonot'));
check('a hash with the wrong shape is rejected', !verifyPassword('x', 'scrypt$only-two'));
check('strength rejects a short password', validatePasswordStrength('short') !== null);
check('strength rejects a missing password', validatePasswordStrength(undefined) !== null);
check('strength accepts eight characters', validatePasswordStrength('longenough') === null);

/* ------------------------------- rate limits ------------------------------- */

section('rate limit');

resetRateLimits();
check('first call is allowed', consume('a', 3, 60_000) === true);
check('second call is allowed', consume('a', 3, 60_000) === true);
check('third call is allowed', consume('a', 3, 60_000) === true);
check('fourth call is blocked', consume('a', 3, 60_000) === false);
check('a separate key has its own budget', consume('b', 3, 60_000) === true);
check('an exhausted key stays exhausted', consume('a', 3, 60_000) === false);
resetRateLimits();
check('reset clears the budget', consume('a', 1, 60_000) === true);

/* ------------------------- storage and pass thresholds --------------------- */

section('storage and per-job thresholds');

const db = getDb();
const columns = table => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

check('recruiters has a password column', columns('recruiters').includes('password'));
check('rounds has a flagged column', columns('rounds').includes('flagged'));
check('round_answers has a graded column', columns('round_answers').includes('graded'));

const suffix = Math.random().toString(36).slice(2, 8);
const student = repo.insertStudent({
  name: `Unit Student ${suffix}`,
  email: `unitstudent${suffix}@example.com`,
  passwordHash: hashPassword('studentpass'),
  skills: ['Python'],
  github: '',
  linkedin: '',
});
const studentSecret = repo.findStudentCredentialsByEmail(`unitstudent${suffix}@example.com`);
check('a student secret is hashed at rest', studentSecret.password.startsWith('scrypt$'));
check('the stored secret verifies', verifyPassword('studentpass', studentSecret.password));
check('the public Student exposes no password', repo.findStudentById(student.id).password === undefined);

const recruiter = repo.insertRecruiter(`Unit Recruiter ${suffix}`, `Unit Co ${suffix}`, hashPassword('recruiterpass'));
const recruiterSecret = repo.findRecruiterCredentials(`unit recruiter ${suffix}`, `unit co ${suffix}`);
check('a recruiter secret is hashed at rest', recruiterSecret.password.startsWith('scrypt$'));
check('the public Recruiter exposes no password', repo.findRecruiterById(recruiter.id).password === undefined);
check('recruiter lookup is case insensitive', repo.findRecruiterCredentials(`UNIT RECRUITER ${suffix}`, `UNIT CO ${suffix}`) !== null);

const job = repo.insertJob({
  type: 'job',
  title: `Unit Job ${suffix}`,
  description: 'Unit test fixture.',
  eligibility: '',
  skillsRequired: ['Python'],
  recruiterId: recruiter.id,
});
repo.insertJobRound(job.id, 'aptitude', 0, 75);
repo.insertJobRound(job.id, 'communication', 1, 50);
const rounds = repo.listJobRounds(job.id);
check('a per-job threshold round-trips', rounds.find(r => r.kind === 'aptitude').passThreshold === 75);
check('a second per-job threshold round-trips', rounds.find(r => r.kind === 'communication').passThreshold === 50);
check('an unconfigured round has no row', rounds.find(r => r.kind === 'hr') === undefined);

/* --------------------------------- summary -------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}