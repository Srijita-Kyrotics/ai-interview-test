/**
 * End-to-end smoke test for the candidate -> assessment -> recruiter flow.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Assumes a server is already running and the database has been seeded with
 * `npm run db:seed`. Exits non-zero on the first failing assertion group.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3000';

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

/* ---------------------------- action discovery ---------------------------- */

function discoverActions() {
  const dir = join(process.cwd(), '.next', 'static', 'chunks');
  const ids = {};
  const pattern = /createServerReference\)\("([0-9a-f]{20,})"[^)]*,"(\w+)"\)/g;
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) ids[match[2]] = match[1];
  }
  return ids;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

const actions = discoverActions();

/** Minimal cookie jar so a session survives across requests. */
function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '') jar.delete(name);
        else jar.set(name, value);
      }
    },
    get: name => jar.get(name) ?? null,
  };
}

async function getPage(path, jar) {
  const res = await fetch(`${base}${path}`, {
    headers: jar.header() ? { cookie: jar.header() } : {},
    redirect: 'manual',
  });
  jar.absorb(res);
  return res.status === 200 ? await res.text() : '';
}

async function act(name, args, jar) {
  if (!actions[name]) throw new Error(`Server action "${name}" not found in the build.`);
  const res = await fetch(`${base}/student`, {
    method: 'POST',
    headers: {
      'Next-Action': actions[name],
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
    body: JSON.stringify(args),
  });
  jar.absorb(res);
  const text = await res.text();

  // Next encodes a successful `redirect()` as an RSC row with the `E` tag, so
  // `<n>:E{...}` alone is not proof of failure. Only real errors (a digest that
  // is not a NEXT_REDIRECT) should be treated as a thrown action.
  const errorRows = [...text.matchAll(/(?:^|\n)\d+:E\{([^\n]*)/g)].map(m => m[1]);
  const realErrors = errorRows.filter(row => !row.includes('NEXT_REDIRECT'));
  if (realErrors.length > 0) {
    const digest = realErrors[0].match(/"digest":"([^"]*)"/)?.[1];
    throw new Error(`action ${name} threw (digest ${digest ?? 'unknown'})`);
  }
  return text;
}

const first = (text, re) => text.match(re)?.[1] ?? null;

/* --------------------------------- the run -------------------------------- */

console.log(`RecruitFlow smoke test against ${base}`);

section('Session and application setup');

const student = makeJar();
await act(
  'createStudent',
  [{ name: 'Smoke Tester', skills: ['Python', 'SQL', 'Git'], github: '', linkedin: '' }],
  student,
);
check('student session created', Boolean(student.get('rf_student')));

const jobsHtml = await getPage('/student/jobs', student);
const jobId = first(jobsHtml, /href="\/student\/jobs\/([0-9a-f]+)"/);
check('student sees open roles', Boolean(jobId));

await act('applyForJob', [jobId], student);

const recruiter = makeJar();
await act('signInRecruiter', ['Priya Sharma', 'Acme Corp'], recruiter);
check('recruiter signed in to the seeded account', Boolean(recruiter.get('rf_recruiter')));

const pipelineHtml = await getPage(`/recruiter/jobs/${jobId}`, recruiter);
const applicationId = first(pipelineHtml, /\/recruiter\/candidates\/([0-9a-f]+)/);
check('recruiter sees the applicant', Boolean(applicationId));

// The pipeline also lists the seeded candidate, so pick the application whose
// card belongs to the smoke-test student: the last candidate link that appears
// before their name in the document.
function applicationForStudent(html, name) {
  const nameAt = html.indexOf(name);
  if (nameAt === -1) return null;
  let best = null;
  for (const match of html.matchAll(/\/recruiter\/candidates\/([0-9a-f]+)/g)) {
    if (match.index < nameAt) best = match[1];
    else break;
  }
  return best;
}

const ownApplicationId = applicationForStudent(pipelineHtml, 'Smoke Tester');
check('located the smoke test student application', Boolean(ownApplicationId), `nameAt=${pipelineHtml.indexOf('Smoke Tester')}`);

const stageResult = await act('updateApplicationStage', [ownApplicationId, 'Communication'], recruiter);
check(
  'recruiter moved the application to Communication',
  stageResult.includes('"stage":"Communication"'),
);

section('Communication round: instructions');

const roundUrl = `/student/rounds/communication/${ownApplicationId}`;
const instructions = await getPage(roundUrl, student);
check('instructions screen renders', instructions.includes('Start round'));
check('instruction list is shown', instructions.includes('Before you start'));
check('time limit is advertised', instructions.includes('15:00'));
check('pass mark is advertised', instructions.includes('>60<'));
check('next stage is named', instructions.includes('Aptitude'));

section('Communication round: answering');

const startResult = await act('startAssessmentRound', [ownApplicationId, 'communication'], student);
const roundId = first(startResult, /"roundId":"([0-9a-f]+)"/);
check('round started', Boolean(roundId));
check('round is in progress', startResult.includes('"status":"in_progress"'));

const strongAnswers = [
  'I am a final year computer science student who enjoys building backend services. I have built several FastAPI projects over the last two years, and I applied to this role because it combines Python with production traffic, which is exactly the kind of problem I want to spend the next year learning. First I want to understand how the team measures success in the first six months.',
  'During my last project the search endpoint timed out on large result sets. First I reproduced the problem locally with a load test, then I profiled the queries and found a missing composite index plus an N plus one pattern in the ORM layer. I added the index and replaced the per row lookups with a single join. Finally I re-ran the load test to verify the fix, and the p95 latency dropped from four seconds to under two hundred milliseconds. I also added a regression test so the index could not silently disappear.',
  'A database index is a little like the index at the back of a textbook. If somebody had to read the entire book to find a single definition every time they asked a question, that would be slow and tiring. The index instead records which page each topic lives on, so finding the answer becomes almost instant. The trade-off is that the index takes extra space to keep, and a small amount of extra time to build, which is the same bargain a book makes by spending a few pages on contents.',
  'On a four person project last semester one teammate wanted to structure the API differently from the rest of us. Instead of arguing for an hour I asked them to write a short proposal and gave everyone fifteen minutes to react to it in writing. Their approach turned out to be much better for the frontend, so we adopted it. Afterwards I changed how I run disagreements: I ask for a written proposal first, because it moves the conversation from people to ideas.',
  'From the posting I can see the team works on distributed systems and takes hiring seriously, and the mix of research and product work is what interests me most. One question I would ask is how the team decides what belongs in a research sprint versus a product sprint, and how often that boundary is revisited as the product matures.',
];

const questionIds = ['com-intro', 'com-problem', 'com-explain', 'com-team', 'com-questions'];
let lastAnswer = '';
for (const [i, questionId] of questionIds.entries()) {
  lastAnswer = await act('submitRoundAnswer', [roundId, questionId, strongAnswers[i]], student);
  check(`question ${i + 1} graded on submit`, lastAnswer.includes('"evaluation"'));
  check(
    `question ${i + 1} returned five signals`,
    lastAnswer.includes('Content depth') && lastAnswer.includes('Professional tone'),
  );
}

const emptyAnswer = await act('submitRoundAnswer', [roundId, 'com-intro', '   '], student).catch(
  () => 'rejected',
);
check('empty answer is rejected', emptyAnswer === 'rejected' || emptyAnswer.includes('write an answer'));

section('Communication round: result');

const completion = await act('completeAssessmentRound', [roundId], student);
const roundStatus = first(completion, /"status":"(\w+)"/);
const percent = first(completion, /"percent":(\d+)/);
check(`strong answers pass the round (got ${percent}%)`, roundStatus === 'passed', `status=${roundStatus}`);
check('passing advances the application to Aptitude', completion.includes('"advancedTo":"Aptitude"'));
check('max score is 50', completion.includes('"maxScore":50'));

const resultHtml = await getPage(roundUrl, student);
check('candidate sees the pass verdict', resultHtml.includes('Round passed'));
check('candidate sees the feedback', /Strong on|Work on/.test(resultHtml));
check('candidate sees the answer review', resultHtml.includes('What do you know about this role'));
check('candidate sees the signals', resultHtml.includes('Vocabulary range'));

const replay = await act('startAssessmentRound', [ownApplicationId, 'communication'], student).catch(
  e => e.message,
);
check('a completed round cannot be restarted', replay.includes('already completed'));

section('Recruiter visibility');

const candidateHtml = await getPage(`/recruiter/candidates/${ownApplicationId}`, recruiter);
check('recruiter sees the round card', candidateHtml.includes('Communication Round'));
check('recruiter sees the pass status', candidateHtml.includes('Passed'));
check('recruiter sees the pass mark', candidateHtml.includes('pass mark 60%'));
check('recruiter sees the candidate answer text', candidateHtml.includes('four person project'));
check('recruiter sees the per-answer signals', candidateHtml.includes('Professional tone'));

const pipeline = await getPage(`/recruiter/jobs/${jobId}`, recruiter);
check('pipeline shows a round badge', pipeline.includes('round-badge'));
check('pipeline badge shows the score', pipeline.includes('round-badge-passed'));

section('Access control');

const intruder = makeJar();
await act('signInRecruiter', ['Intruder Ltd', 'Not My Company'], intruder);
const stolen = await act(
  'getRoundStatesForRecruiter',
  [ownApplicationId, ['communication']],
  intruder,
).catch(e => e.message);
check(
  'another recruiter cannot read the candidate rounds',
  stolen.includes('not one of yours') || stolen.includes('not found'),
  stolen.slice(0, 80),
);

const unbuilt = await getPage(`/student/rounds/aptitude/${ownApplicationId}`, student);
check('unbuilt rounds explain themselves', unbuilt.includes('has not been built'));

/* --------------------------------- summary -------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
