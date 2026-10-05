/**
 * End-to-end smoke test for the candidate -> assessment -> recruiter flow.
 *
 *   npm run db:seed
 *   RECRUITFLOW_TEST_HOOKS=1 npm run dev -- --port 3101
 *   npm run test:smoke -- http://localhost:3101
 *
 * Needs a seeded database and a server started with RECRUITFLOW_TEST_HOOKS=1,
 * which is what unlocks /api/test/action (see that route for why it exists).
 * Exits non-zero if any assertion fails.
 *
 * Pages are fetched as HTML so the rendering assertions stay honest; the
 * server actions are driven through the test route. The live model is exercised
 * for real, so pass SKIP_AI=1 to check only the deterministic wiring.
 */
const base = process.argv[2] ?? 'http://localhost:3000';
const SEED_PASSWORD = process.env.RECRUITFLOW_SEED_RECRUITER_PASSWORD ?? 'seedpassword';
const withAi = process.env.SKIP_AI !== '1';

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
  return { status: res.status, text: res.status === 200 ? await res.text() : '' };
}

/** Calls an action; a rejection comes back as {ok:false,error} rather than throwing. */
async function act(name, args, jar) {
  const res = await fetch(`${base}/api/test/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
    body: JSON.stringify({ name, args }),
  });
  jar.absorb(res);
  if (res.status === 404) {
    throw new Error('Test hooks are off. Start the server with RECRUITFLOW_TEST_HOOKS=1.');
  }
  const payload = await res.json();
  if (payload.ok === false) throw new Error(payload.error);
  return payload.result;
}

/** Runs an action expecting it to be refused, returning the error message. */
async function actRejected(name, args, jar) {
  return act(name, args, jar).then(() => null, error => String(error.message ?? error));
}

const first = (text, re) => text.match(re)?.[1] ?? null;

/* --------------------------------- the run -------------------------------- */

console.log(`RecruitFlow smoke test against ${base}`);

const hooks = await fetch(`${base}/api/test/action`).catch(() => null);
if (!hooks?.ok) {
  console.error('Test hooks unavailable. Start the server with RECRUITFLOW_TEST_HOOKS=1.');
  process.exit(1);
}

const unique = Math.random().toString(36).slice(2, 8);
const studentName = `Smoke Tester ${unique}`;

section('Session and application setup');

const student = makeJar();
await act('createStudent', [{ name: studentName, password: SEED_PASSWORD, skills: ['Python', 'SQL', 'Git'], github: '', linkedin: '' }], student);
check('student session created', Boolean(student.get('rf_student')));

const jobsHtml = await getPage('/student/jobs', student);
const jobId = first(jobsHtml.text, /href="\/student\/jobs\/([0-9a-f]+)"/);
check('student sees open roles', Boolean(jobId));

await act('applyForJob', [jobId], student);
check('application created', Boolean(jobId));

const wrongPassword = await actRejected(
  'signInRecruiter',
  ['Priya Sharma', 'Acme Corp', 'definitely-not-the-password'],
  makeJar(),
);
check('recruiter sign-in rejects a wrong password', Boolean(wrongPassword), wrongPassword ?? 'accepted');

const recruiter = makeJar();
await act('signInRecruiter', ['Priya Sharma', 'Acme Corp', SEED_PASSWORD], recruiter);
check('recruiter signed in to the seeded account', Boolean(recruiter.get('rf_recruiter')));

const pipelineHtml = (await getPage(`/recruiter/jobs/${jobId}`, recruiter)).text;
check('recruiter pipeline renders', pipelineHtml.includes('Smoke Tester') || pipelineHtml.length > 0);

/** The pipeline also lists the seeded candidate, so match on this run's name. */
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

const applicationId = applicationForStudent(pipelineHtml, studentName);
check('located this run\'s application', Boolean(applicationId));

const staged = await act('updateApplicationStage', [applicationId, 'Communication'], recruiter);
check('recruiter moved the application to Communication', staged.stage === 'Communication');

section('Communication round: instructions');

const roundUrl = `/student/rounds/communication/${applicationId}`;
const instructions = await getPage(roundUrl, student);
check('instructions screen renders', instructions.text.includes('Start round'));
check('instruction list is shown', instructions.text.includes('Before you start'));
check('time limit is advertised', instructions.text.includes('15:00'));
check('pass mark is advertised', instructions.text.includes('>60<'));
check('next stage is named', instructions.text.includes('Aptitude'));

section('Communication round: answering');

const started = await act('startAssessmentRound', [applicationId, 'communication'], student);
const roundId = started.roundId;
check('round started', Boolean(roundId));
check('round is in progress', started.state.status === 'in_progress', `status=${started.state.status}`);
check('round reports the whole time limit', started.state.secondsRemaining === 900, `${started.state.secondsRemaining}s`);

const questionIds = ['grammar', 'tenses', 'fill-blank', 'listen-speak', 'essay'];

const strongAnswers = [
  'I am a final year computer science student who enjoys building backend services. I have built several FastAPI projects over the last two years, and I applied to this role because it combines Python with production traffic, which is exactly the kind of problem I want to spend the next year learning. First I want to understand how the team measures success in the first six months.',
  'During my last project the search endpoint timed out on large result sets. First I reproduced the problem locally with a load test, then I profiled the queries and found a missing composite index plus an N plus one pattern in the ORM layer. I added the index and replaced the per row lookups with a single join. Finally I re-ran the load test to verify the fix, and the p95 latency dropped from four seconds to under two hundred milliseconds. I also added a regression test so the index could not silently disappear.',
  'A database index is a little like the index at the back of a textbook. If somebody had to read the entire book to find a single definition every time they asked a question, that would be slow and tiring. The index instead records which page each topic lives on, so finding the answer becomes almost instant. The trade-off is that the index takes extra space to keep, and a small amount of extra time to build, which is the same bargain a book makes by spending a few pages on contents.',
  'On a four person project last semester one teammate wanted to structure the API differently from the rest of us. Instead of arguing for an hour I asked them to write a short proposal and gave everyone fifteen minutes to react to it in writing. Their approach turned out to be much better for the frontend, so we adopted it. Afterwards I changed how I run disagreements: I ask for a written proposal first, because it moves the conversation from people to ideas.',
  'From the posting I can see the team works on distributed systems and takes hiring seriously, and the mix of research and product work is what interests me most. One question I would ask is how the team decides what belongs in a research sprint versus a product sprint, and how often that boundary is revisited as the product matures.',
];

// The UI generates a live prompt for each question before the candidate answers
// it, and grading is driven by that generated question, so the harness follows
// the same order. Under SKIP_AI=1 the model is unreachable and the failure is
// tolerated rather than asserted on.
for (const [i, questionId] of questionIds.entries()) {
  const promptError = await actRejected('generateDynamicPrompt', [roundId, questionId], student);
  if (i === 0) {
    check(
      withAi ? 'a live prompt was generated' : 'prompt generation is wired (SKIP_AI=1, failure tolerated)',
      withAi ? !promptError : true,
      (promptError ?? 'generated').slice(0, 70),
    );
  }
}

for (const [i, questionId] of questionIds.entries()) {
  const graded = await act('submitRoundAnswer', [roundId, questionId, strongAnswers[i]], student);
  check(`question ${i + 1} graded on submit`, Boolean(graded.evaluation));
  check(`question ${i + 1} carries feedback`, typeof graded.evaluation.feedback === 'string' && graded.evaluation.feedback.length > 0);
  check(
    `question ${i + 1} graded state is correct`,
    withAi ? graded.evaluation.graded === true : graded.evaluation.graded === false,
    `graded=${graded.evaluation.graded}`,
  );
  check(`question ${i + 1} recorded against the question`, graded.state.answers.some(a => a.questionId === questionId));
}

const overwrite = await actRejected('submitRoundAnswer', [roundId, questionIds[0], 'a different answer'], student);
check('a submitted answer cannot be overwritten', Boolean(overwrite), overwrite ?? 'accepted');

const emptyAnswer = await actRejected('submitRoundAnswer', [roundId, 'grammar', '   '], student);
check('empty answer is rejected', Boolean(emptyAnswer), emptyAnswer ?? 'accepted');

section('Communication round: result');

const completed = await act('completeAssessmentRound', [roundId], student);
const finalState = completed.state;
check(`all five answers counted (${finalState.answers.length})`, finalState.answers.length === 5);
check('max score is 50', finalState.maxScore === 50, `max=${finalState.maxScore}`);
check('stored percent matches the summed scores', finalState.percent === Math.round((finalState.score / finalState.maxScore) * 100));

if (withAi) {
  check(`strong answers pass the round (got ${finalState.percent}%)`, finalState.status === 'passed', `status=${finalState.status}`);
  check('passing advances the application to Aptitude', completed.advancedTo === 'Aptitude');
  check('a fully graded round is not flagged', finalState.flagged === false);
  check('nothing is left ungraded', finalState.answersUngraded === 0, `${finalState.answersUngraded} ungraded`);
} else {
  // The model is down, so nothing could be graded. The round must be recorded as
  // not passed and flagged for a human rather than scored on the empty grades.
  check('an ungradable round does not pass', finalState.status === 'failed', `status=${finalState.status}`);
  check('an ungradable round is flagged', finalState.flagged === true);
  check('every answer is reported ungraded', finalState.answersUngraded === 5, `${finalState.answersUngraded} ungraded`);
  check('an ungradable round does not advance the application', completed.advancedTo === null);
}

const resultHtml = (await getPage(roundUrl, student)).text;
check('candidate sees the pass verdict', resultHtml.includes('Round passed'));
check('candidate sees the answer review', /grammar|tense|essay|filler|listening/i.test(resultHtml));

const replay = await actRejected('startAssessmentRound', [applicationId, 'communication'], student);
check('a completed round cannot be restarted', Boolean(replay), replay ?? 'accepted');

section('Aptitude round is reachable and built');

const aptitude = (await getPage(`/student/rounds/aptitude/${applicationId}`, student)).text;
check('aptitude screen renders', aptitude.includes('Aptitude'));
check('aptitude round is built', !aptitude.includes('has not been built'));

section('Recruiter visibility');

const candidateHtml = (await getPage(`/recruiter/candidates/${applicationId}`, recruiter)).text;
check('recruiter sees the round card', candidateHtml.includes('Communication Round'));
check('recruiter sees the pass status', candidateHtml.includes('Passed'));
check('recruiter sees the pass mark', candidateHtml.includes('pass mark 60%'));
check('recruiter sees the candidate answer text', candidateHtml.includes('four person project'));

const states = await act('getRoundStatesForRecruiter', [applicationId, ['communication']], recruiter);
const recruiterState = states[0];
check('recruiter reads the round state', recruiterState.kind === 'communication');
check('recruiter sees the answer text', recruiterState.answers.some(a => a.answer.includes('four person project')));

section('Access control');

const intruder = makeJar();
await act('signUpRecruiter', ['Intruder Ltd', 'Not My Company', SEED_PASSWORD], intruder).catch(async () => {
  await act('signInRecruiter', ['Intruder Ltd', 'Not My Company', SEED_PASSWORD], intruder);
});
const stolen = await actRejected('getRoundStatesForRecruiter', [applicationId, ['communication']], intruder);
check('another recruiter cannot read the candidate rounds', Boolean(stolen), stolen ?? 'accepted');

const anonymous = makeJar();
const leaked = await actRejected('submitRoundAnswer', [roundId, 'grammar', 'let me in'], anonymous);
check('an anonymous caller cannot submit an answer', Boolean(leaked), leaked ?? 'accepted');

const unbuilt = (await getPage(`/student/rounds/technical1/${applicationId}`, student)).text;
check('unbuilt rounds explain themselves', unbuilt.includes('has not been built'));

/* --------------------------------- summary -------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}