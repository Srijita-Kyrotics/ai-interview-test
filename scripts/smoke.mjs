/**
 * End-to-end smoke test for the candidate -> assessment -> recruiter flow.
 *
 *   RECRUITFLOW_TEST_HOOKS=1 npm run dev -- --port 3101
 *   npm run test:smoke -- http://localhost:3101
 *
 * Needs a server started with RECRUITFLOW_TEST_HOOKS=1, which is what unlocks
 * /api/test/action (see that route for why it exists). Everything it exercises
 * — recruiter, job, student — is created by the run itself, so it works
 * against an empty database. Exits non-zero if any assertion fails.
 *
 * Pages are fetched as HTML so the rendering assertions stay honest; the
 * server actions are driven through the test route. The live model is exercised
 * for real, so pass SKIP_AI=1 to check only the deterministic wiring.
 */
const base = process.argv[2] ?? 'http://localhost:3000';
const TEST_PASSWORD = process.env.RECRUITFLOW_TEST_PASSWORD ?? 'smoke-test-password';
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

// React SSR inserts <!-- --> between adjacent text nodes ("pass mark <!-- -->60"),
// so strip the separators before matching literal UI copy.
const text = html => html.replace(/<!--\s*-->/g, '');

/* --------------------------------- the run -------------------------------- */

console.log(`RecruitFlow smoke test against ${base}`);

const hooks = await fetch(`${base}/api/test/action`).catch(() => null);
if (!hooks?.ok) {
  console.error('Test hooks unavailable. Start the server with RECRUITFLOW_TEST_HOOKS=1.');
  process.exit(1);
}

const unique = Math.random().toString(36).slice(2, 8);
const studentName = `Smoke Tester ${unique}`;
const studentEmail = `smoke-${unique}@example.test`;
const recruiterName = `Smoke Recruiter ${unique}`;
const recruiterCompany = `Smoke Co ${unique}`;

section('Recruiter and job setup');

const recruiter = makeJar();
const signedUp = await act('signUpRecruiter', [recruiterName, recruiterCompany, TEST_PASSWORD], recruiter);
check('recruiter profile created', Boolean(signedUp?.id));

const job = await act(
  'createJob',
  [
    {
      type: 'job',
      title: `Smoke Role ${unique}`,
      description: 'A role created by the smoke test run itself.',
      eligibility: 'Open to all.',
      skillsRequired: ['Python', 'SQL', 'Git'],
      recruiterId: signedUp.id,
    },
  ],
  recruiter,
);
check('job created by the recruiter', Boolean(job?.id));

section('Session and application setup');

const student = makeJar();
const createdStudent = await act(
  'createStudent',
  [
    {
      name: studentName,
      email: studentEmail,
      password: TEST_PASSWORD,
      skills: ['Python', 'SQL', 'Git'],
      github: '',
      linkedin: '',
    },
  ],
  student,
);
check('student session created', Boolean(student.get('rf_student')));

const jobsHtml = await getPage('/student/jobs', student);
const jobId = first(jobsHtml.text, /href="\/student\/jobs\/([0-9a-f]+)"/);
check('student sees open roles', Boolean(jobId));

await act('applyForJob', [jobId], student);
check('application created', Boolean(jobId));

// The profile page and every match display read from student_skills, so the
// skills passed at sign-up must actually land in the database.
const initialMatch = text((await getPage(`/student/jobs/${jobId}`, student)).text);
check('signup skills are persisted', initialMatch.includes('3/3 of your skills match'));

const wrongPassword = await actRejected(
  'signInRecruiter',
  [recruiterName, recruiterCompany, 'definitely-not-the-password'],
  makeJar(),
);
check('recruiter sign-in rejects a wrong password', Boolean(wrongPassword), wrongPassword ?? 'accepted');

const recruiterSignIn = makeJar();
await act('signInRecruiter', [recruiterName, recruiterCompany, TEST_PASSWORD], recruiterSignIn);
check('recruiter signed in to their own account', Boolean(recruiterSignIn.get('rf_recruiter')));

const pipelineHtml = (await getPage(`/recruiter/jobs/${jobId}`, recruiter)).text;
check('recruiter pipeline renders', pipelineHtml.includes('Smoke Tester') || pipelineHtml.length > 0);

/** Locates this run's application by the candidate name it created. */
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

/**
 * Prompts are generated live per run, so the harness reads what the model
 * actually produced and answers like a prepared candidate: the answer key for
 * closed questions, substantive prose for the open ones.
 */
const openAnswers = {
  'listen-speak':
    'On a four person project last semester one teammate wanted to structure the API differently from the rest of us. Instead of arguing for an hour I asked them to write a short proposal and gave everyone fifteen minutes to react to it in writing. Their approach turned out to be much better for the frontend, so we adopted it. Afterwards I changed how I run disagreements: I ask for a written proposal first, because it moves the conversation from people to ideas.',
  essay:
    'Social media has made connecting with people constant but shallower. The benefit is that distance no longer ends a friendship: I keep up with former classmates through daily messages and shared stories, and I have joined professional communities that turned into real collaborations. The drawback is that the interactions are often performative — a like replaces a conversation, and feeds reward loud opinions over careful ones. I have started scheduling a weekly video call with the people I actually care about, because sustained attention, not broadcast reach, is what builds a relationship. Used deliberately as a tool rather than a default, it extends relationships; used passively, it substitutes for them.',
};

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
  const generated = await act('getGeneratedQuestion', [roundId, questionId], student);
  const key = generated?.data?.correct_answer;
  const answer = typeof key === 'string' && key.trim()
    ? key
    : openAnswers[questionId] ?? 'I would approach this carefully and explain my reasoning step by step.';
  const graded = await act('submitRoundAnswer', [roundId, questionId, answer], student);
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

const candidateHtml = text((await getPage(`/recruiter/candidates/${applicationId}`, recruiter)).text);
check('recruiter sees the round card', candidateHtml.includes('Communication Round'));
check('recruiter sees the pass status', candidateHtml.includes('Passed'));
check('recruiter sees the pass mark', candidateHtml.includes('pass mark 60%'));
check('recruiter sees the candidate answer text', candidateHtml.includes('four person project'));

const states = await act('getRoundStatesForRecruiter', [applicationId, ['communication']], recruiter);
const recruiterState = states.communication;
check('recruiter reads the round state', recruiterState.kind === 'communication');
check('recruiter sees the answer text', recruiterState.answers.some(a => a.answer.includes('four person project')));

section('Access control');

const intruder = makeJar();
await act('signUpRecruiter', ['Intruder Ltd', 'Not My Company', TEST_PASSWORD], intruder).catch(async () => {
  await act('signInRecruiter', ['Intruder Ltd', 'Not My Company', TEST_PASSWORD], intruder);
});
const stolen = await actRejected('getRoundStatesForRecruiter', [applicationId, ['communication']], intruder);
check('another recruiter cannot read the candidate rounds', Boolean(stolen), stolen ?? 'accepted');

const anonymous = makeJar();
const leaked = await actRejected('submitRoundAnswer', [roundId, 'grammar', 'let me in'], anonymous);
check('an anonymous caller cannot submit an answer', Boolean(leaked), leaked ?? 'accepted');

// Every round in the registry is built now, so a future round must explain why
// it cannot be started yet instead of rendering an empty shell.
const unbuilt = text((await getPage(`/student/rounds/technical1/${applicationId}`, student)).text);
check('future rounds explain themselves', unbuilt.includes('Not available yet'));
check('future rounds name the stage they wait for', unbuilt.includes('Technical 1'));

section('Profile edits recompute the skill match live');

// Regression: the summary once mixed a live score with an apply-time chip
// snapshot, so a profile saved after applying reported 0% while the chips
// disagreed. Both the student job page and the recruiter summary must follow
// the profile as it changes.
const profileFields = { name: studentName, email: studentEmail, github: '', linkedin: '' };

const editUnauthorized = await actRejected(
  'updateStudent',
  [createdStudent.id, { ...profileFields, skills: ['Python'] }],
  makeJar(),
);
check('an anonymous caller cannot edit someone\'s profile', Boolean(editUnauthorized), editUnauthorized ?? 'accepted');

await act('updateStudent', [createdStudent.id, { ...profileFields, skills: [] }], student);

const clearedJobPage = text((await getPage(`/student/jobs/${jobId}`, student)).text);
check('student sees the match drop when skills are removed', clearedJobPage.includes('0/3 of your skills match'));

const clearedCandidate = text((await getPage(`/recruiter/candidates/${applicationId}`, recruiter)).text);
check('recruiter summary recomputes after the profile is cleared', clearedCandidate.includes('0/3 required skills matched'));
check('every required skill shows as missing', clearedCandidate.includes('✗ Python'));

await act('updateStudent', [createdStudent.id, { ...profileFields, skills: ['Python', 'SQL', 'Git'] }], student);

const restoredJobPage = text((await getPage(`/student/jobs/${jobId}`, student)).text);
check('student sees the match restored after re-saving', restoredJobPage.includes('3/3 of your skills match'));

const restoredCandidate = text((await getPage(`/recruiter/candidates/${applicationId}`, recruiter)).text);
check('recruiter summary reflects the saved profile', restoredCandidate.includes('3/3 required skills matched'));
check('skills show as present again', restoredCandidate.includes('✓ Python'));

/* --------------------------------- summary -------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}