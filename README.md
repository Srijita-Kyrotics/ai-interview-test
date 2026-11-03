# RecruitFlow

RecruitFlow is an AI-driven campus hiring and assessment platform. Recruiters
publish jobs and internships, review applicants, configure an optional screening
round, and move candidates through a multi-stage assessment pipeline. Students
create a profile, see skill-match scores, apply, and take timed, proctored rounds
whose questions and grading are produced by an LLM.

The app is built as a single **Next.js 16** application with **React 19**,
**TypeScript**, server actions, route handlers, and a local **SQLite** database
through Node's built-in `node:sqlite`. It is a complete local/demo
implementation, not a production-hardened service. See
[Known issues](#known-issues-and-incomplete-work) before deploying it.

## What the project does

### Student

- Create an account with name, email, password, skills, GitHub, and LinkedIn.
- Browse open jobs and internships and see a skill-match percentage against each
  role's required skills.
- Apply to a role and track the application on a pipeline tracker.
- Take the assessment rounds that are unlocked by the current application stage.
- Answer by typing, speaking (browser speech recognition writes into the text
  area), or recording audio. Technical rounds also provide a code workspace.
- See each answer's score and feedback immediately after submission, plus a
  final round result and the next stage on a pass.
- Join a round with webcam and screen sharing enabled; tab switches, copy, and
  paste are recorded as proctoring events.

### Recruiter

- Sign up and sign in with name, company, and password.
- Create jobs or internships with description, eligibility, and required skills.
- See the applicant pipeline grouped by stage.
- Open a candidate profile to view their skills, skill match, every round result,
  answer text, feedback, proctoring events, and recordings.
- Move an application to any stage, advance it one step, reject it, or select it.
- Maintain a reusable question bank for the optional screening/custom round.
- Attach bank questions to a job's screening round, set a pass threshold, and
  enable or disable the round.
- Manually score custom-round answers and pass or fail the round.

### Admin

- Sign in with deployment-level credentials configured by environment variables.
- Add questions to a shared `questions` table and list all questions currently in
  that table.

The admin area is only partially implemented; see
[Known issues](#known-issues-and-incomplete-work).

## The hiring pipeline

The canonical stage order is defined in `src/lib/types.ts`:

```text
Applied
  -> Screening        (optional custom round, manually graded)
  -> Communication    (AI generated + AI graded)
  -> Aptitude         (AI generated + AI graded)
  -> Technical 1      (AI generated + AI graded, optional code workspace)
  -> Technical 2      (AI generated + AI graded, optional code workspace)
  -> HR               (AI generated + AI graded)
  -> Selected

Any stage can also be set to Rejected by the recruiter.
```

`Screening` is only meaningful when the recruiter has attached at least one
custom question to the job. Without that configuration the application can still
be moved to `Screening` manually, but no round exists there.

### Round definitions

All six round kinds are registered and active in
`src/lib/assessment/registry.ts`:

| Kind | Stage | Questions | Time limit | Pass mark | Minimum answers | Grading |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `custom` | Screening | Recruiter-defined | Not timed | Configurable | 1 | Recruiter, manual |
| `communication` | Communication | 5 | 15 min | 60% | 4 | OpenRouter LLM |
| `aptitude` | Aptitude | 5 | 20 min | 60% | 4 | OpenRouter LLM |
| `technical1` | Technical 1 | 3 | 30 min | 60% | 2 | OpenRouter LLM |
| `technical2` | Technical 2 | 3 | 45 min | 60% | 2 | OpenRouter LLM |
| `hr` | HR | 4 | 25 min | 60% | 3 | OpenRouter LLM |

The built-in rounds use question IDs such as `grammar`, `logical-reasoning`,
`tech1-algorithms`, and `hr-cultural-fit`. Those IDs select the generation
instruction and identify the question in the database. The actual prompt shown
to the candidate is generated per round and cached in the database.

## How the assessment works

### 1. Application and stage unlock

A student applies to a job, producing an `applications` row at stage `Applied`
with a stored skill-match score and matched skills. A round can only be started
when the application's current stage equals the round's stage. `buildRoundState`
in `src/lib/rounds.ts` is the single place that derives `locked`, `not_started`,
`in_progress`, `submitted`, `passed`, and `failed` from the application and round
rows.

### 2. Starting a round

`RoundRunner` first requires camera and screen sharing. The candidate clicks
"Start round", which calls `startAssessmentRound` in
`src/lib/round-actions.ts`. The server verifies that the signed-in student owns
the application, the application is at the right stage, and the round has not
already been completed. It then creates the `rounds` row.

### 3. Dynamic question generation

For each built-in round question, the client calls `generateDynamicPrompt`. The
server:

1. Verifies ownership and that the round is still in progress.
2. Returns a cached generated question if one already exists for that
   round/section.
3. Otherwise sends a section-specific instruction to OpenRouter in JSON mode.
4. Parses the response, extracts `question`, `correct_answer` or
   `evaluation_criteria`, and caches the whole payload in the `questions` table
   under `category = 'dynamic_ai'` with an id of `<roundId>_<sectionId>`.
5. Runs a second "answer-key review" LLM call for questions that have a
   `correct_answer`, correcting an obviously inconsistent key before it is used.
6. Returns the generated prompt to the browser.

The generated question is cached per round and section, so revisiting a question
does not generate a new prompt.

### 4. Answer submission and grading

`submitRoundAnswer` handles every answer:

- It rejects answers for closed rounds, timed-out rounds, unknown questions, and
  empty text.
- A submitted answer is final. Re-sending the same text replays the stored
  result; sending different text is rejected.
- The custom round stores the answer as ungraded and waits for a recruiter.
- Every built-in round sends the generated question, its answer key or
  evaluation criteria, and the candidate answer to OpenRouter.
- The response is normalized into `{ score, feedback, signals }` and stored with
  the answer.
- If the LLM call fails, the answer is stored as **ungraded** with a human-review
  message. The round is flagged and cannot pass automatically.

`normalizeAiEvaluation` in `src/lib/assessment/ai-response.ts` clamps scores to
the allowed range, cleans feedback, and normalizes signal levels. Submission is
rate-limited to 20 answers per round per minute in-process.

### 5. Completing a round

`completeAssessmentRound` sums the submitted answers and applies
`decideRoundOutcome` from `src/lib/assessment/scoring.ts`:

```text
percent = sum(score) / sum(maxScore) * 100
passed  = enough answers
          AND every answer is graded
          AND percent >= pass threshold
```

The denominator is the marks actually submitted, not the marks available in the
whole round. A candidate who submits four of five answers is scored out of what
they submitted, but the round is still flagged because `minAnswersToPass` was
not met. On a pass, the application advances to the round's `passesTo` stage if
the application is still at that round's stage.

A custom round is different: completing it marks it `submitted`, and only the
recruiter's manual review can pass or fail it.

### 6. Proctoring

While a round is active, `RoundRunner`:

- Records webcam video/audio and screen video with `MediaRecorder`.
- Logs `tab_switched`, `copy`, and `paste` events through
  `logProctoringEvent`.
- Flags the round when events exceed the registry threshold (3 by default).
- Uploads webcam and screen recordings on finish or time-up to
  `/api/rounds/proctoring`.
- Optionally records a spoken answer and uploads it to `/api/rounds/audio` after
  the answer text is submitted.

Recordings are stored on local disk beside the database and are readable only by
the student who owns the round, the recruiter who owns the job, or an admin.

## Architecture

```text
Browser
  |
  |-- React client components (RoundRunner, CodingIDE, forms, stage controls)
  |
  |-- Next.js Server Components (pages under src/app)
  |       read data through repositories
  |
  |-- Server Actions ('use server')
  |       src/lib/actions.ts         sessions, profiles, jobs, applications
  |       src/lib/round-actions.ts   start/submit/complete rounds, AI grading
  |       src/lib/custom-actions.ts  question bank, custom round review
  |
  |-- Route Handlers
          /api/demo/*                lazy demo account creation
          /api/judge0                code execution proxy
          /api/rounds/audio          answer audio upload/download
          /api/rounds/proctoring     webcam/screen upload/download
          /api/test/action           test-only action bridge

Storage and external services
  node:sqlite  -> .data/recruitflow.db
  local disk   -> .data/audio and .data/proctoring
  OpenRouter   -> question generation, answer-key review, grading
  Judge0       -> candidate-triggered code execution
```

### Key layers

- **Registry** — `src/lib/assessment/registry.ts` defines round metadata,
  questions, timing, thresholds, and evaluator hooks. `toSerializable` strips the
  evaluator before definitions cross into client components.
- **Pure scoring** — `src/lib/assessment/scoring.ts` decides pass/fail without
  touching the database or the LLM, which makes the decision easy to test.
- **Round state** — `src/lib/rounds.ts` composes database rows and registry
  definitions into `RoundState`, including locked/derived statuses, timers,
  answers, proctoring summary, and pass threshold overrides.
- **Persistence** — `src/lib/db/index.ts` contains the schema and migrations.
  `src/lib/db/repo.ts` handles students, recruiters, jobs, applications, and
  questions; `src/lib/db/rounds.repo.ts` handles rounds, answers, generated
  questions, and proctoring events.
- **Server actions** — mutations and authenticated reads. Most round actions
  re-check ownership through `requireOwnApplication` / `requireOwnedRound`.
- **Route handlers** — binary uploads/downloads and the Judge0 proxy.
- **Proxy** — `src/proxy.ts` only checks for the presence of a session cookie and
  redirects unauthenticated portal navigation. It is not the authorization
  boundary.

### Project layout

```text
src/
  app/
    student/            student dashboard, jobs, profile, round runner
    recruiter/          recruiter dashboard, jobs, candidate review
    admin/              admin layout + question bank (incomplete)
    api/                demo, judge0, audio, proctoring, test hook
  components/
    rounds/             RoundRunner, CodingIDE, recruiter round card
    ...                 forms, pipeline tracker, skill picker, stage controls
  lib/
    assessment/         registry, types, scoring, AI parsing, evaluators,
                        static question banks
    ai/                 OpenRouter client
    db/                 SQLite schema/migrations and repositories
    actions.ts          sessions, profiles, jobs, applications
    round-actions.ts    round lifecycle and AI grading
    custom-actions.ts   custom question bank and manual review
    demo-accounts.ts    lazy demo student/recruiter creation
    judge0.ts           language list and Judge0 client
    passwords.ts        scrypt password hashing and verification
    rate-limit.ts       per-process fixed-window limiter
    rounds.ts           round-state composition
    types.ts            shared domain types and skill matching
  proxy.ts              cookie-presence gate
scripts/
  reset.mjs             deletes the local database file
  unit.mjs              unit tests
  smoke.mjs             end-to-end smoke test
  ...                   ad-hoc DB/API/Judge0 check scripts
```

### Database tables

| Table | Purpose |
| --- | --- |
| `students`, `student_skills` | Candidate profile and ordered skill list. |
| `recruiters` | Recruiter account, company, password hash. |
| `admins` | Admin row created on first successful admin login. |
| `jobs`, `job_skills` | Jobs/internships and required skills. |
| `job_rounds` | Per-job round configuration; currently only the custom threshold is set from the UI. |
| `applications`, `application_matched_skills` | One application per student/job, stage, match score, matched skills. |
| `rounds` | One row per application/round kind, status, score, max score, timestamps, flagged bit. |
| `round_answers` | Answer text, per-answer score/max, feedback, signals, graded bit, audio URL. |
| `proctoring_events` | Tab switch/copy/paste events. |
| `questions` | Admin/legacy question bank and generated-question storage. |
| `recruiter_questions` | Reusable recruiter question bank for custom rounds. |
| `job_custom_questions` | Which recruiter questions are attached to a job's custom round. |

Schema version: **6**. Migrations run automatically when the database is opened.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.3.6, App Router, Turbopack, server actions |
| UI | React 19.2.8, React DOM, plain CSS in `globals.css`, inline styles |
| Language | TypeScript 5, strict typechecking via `tsc --noEmit` |
| Database | Node built-in `node:sqlite` (`DatabaseSync`), WAL mode |
| AI | OpenRouter chat completions, default model `openai/gpt-4o-mini` |
| Code execution | Judge0 HTTP API, default base URL `https://judge.bhasantar.com/judge0` |
| Passwords | Node `crypto.scryptSync` with per-password salt |
| Tests | Node's built-in test runner for unit tests; custom HTTP smoke script |
| Styling | No Tailwind, no component library, no ORM |

## Functionality reference

### Student routes

- `/student` — sign in / create profile.
- `/student/dashboard` — applications, stages, round status, next action.
- `/student/jobs` — open jobs and internships with skill match.
- `/student/jobs/[id]` — job detail and apply action.
- `/student/profile` — edit profile and skills.
- `/student/rounds/[kind]/[applicationId]` — instructions, live round, result.

### Recruiter routes

- `/recruiter` — sign in / sign up and job list.
- `/recruiter/jobs/new` — create a job or internship.
- `/recruiter/jobs/[id]` — pipeline, custom round configuration, candidate cards.
- `/recruiter/candidates/[id]` — candidate profile, round review, recordings,
  stage controls.
- `/recruiter/questions` — reusable custom-round question bank.

### Admin routes

- `/admin/questions` — question bank form and list. This page also renders the
  admin login form when no admin session exists.

There is no `/admin` page and no `/admin/pipelines` page even though the admin
sidebar links to the latter.

### API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/demo/student` | GET | Create/sign in the demo student. |
| `/api/demo/recruiter` | GET | Create/sign in the demo recruiter. |
| `/api/judge0` | POST | Execute candidate code through Judge0. Rate-limited by IP. |
| `/api/rounds/audio` | POST/GET | Upload or stream an answer recording. |
| `/api/rounds/proctoring` | POST/GET | Upload or stream webcam/screen video. |
| `/api/test/action` | GET/POST | Test-only bridge for the smoke test; disabled unless `RECRUITFLOW_TEST_HOOKS=1`. |

## Getting started

Requires **Node.js >= 22.5** for `node:sqlite`.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

The first request creates `.data/recruitflow.db` and the schema. A fresh
database starts empty: there are no jobs until a recruiter creates one, and the
demo accounts are created lazily by the demo endpoints.

### Environment variables

Create `.env.local` (git-ignored). A `.env` may also exist locally; `.env.local`
takes precedence.

| Variable | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes, for all built-in rounds | OpenRouter key used to generate questions, review answer keys, and grade answers. Without it, built-in rounds cannot be taken successfully. |
| `OPENROUTER_MODEL` | No | Model id. Defaults to `openai/gpt-4o-mini`. |
| `OPENROUTER_REFERER` | No | `HTTP-Referer` sent to OpenRouter. Defaults to `http://localhost:3000`. |
| `JUDGE0_URL` | No | Judge0 base URL. Defaults to `https://judge.bhasantar.com/judge0`. |
| `RECRUITFLOW_DB_PATH` | No | SQLite file path. Defaults to `.data/recruitflow.db`; on Vercel/Lambda it defaults to a temp directory. |
| `RECRUITFLOW_ADMIN_EMAIL` | No | Admin login email. Admin access is closed if either admin variable is missing. |
| `RECRUITFLOW_ADMIN_PASSWORD` | No | Admin login password. |
| `RECRUITFLOW_ENABLE_DEMO` | No | Set to `1` to allow demo logins in production. Demo logins are allowed in development by default. |
| `RECRUITFLOW_TEST_HOOKS` | No | Set to `1` to enable `/api/test/action` for the smoke test. Never enable on a public deployment. |
| `NEXT_PUBLIC_BYPASS_WEBCAM` | No | Development-only escape hatch for machines without a webcam. Hard-disabled in production builds; screen sharing is still required. |

If the local `.env` contains an expired OpenRouter key, AI generation and grading
will fail with a 401 until a valid key is supplied.

### Demo logins

In development, use the **Try Demo** buttons on the home page. They create the
demo accounts on first use. After that, the credentials are:

- Student: `alex.demo@recruitflow.dev`
- Recruiter: `Sarah` / `Acme Corp`
- Password for both: `Demo@1234`

Manual sign-in before the first demo login fails on an empty database because
the accounts do not exist yet. In production, demo endpoints return 404 unless
`RECRUITFLOW_ENABLE_DEMO=1`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Production build. |
| `npm start` | Start the production server. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm run test:unit` | Unit tests for AI parsing, scoring, passwords, rate limiting, and storage. |
| `npm run test:smoke` | End-to-end HTTP smoke test against a running server. |
| `npm run db:reset` | Delete the entire `.data` directory (database and recordings). It does **not** reseed. |

`db:reset` removes `.data`, including stored audio and proctoring files. Stop the
dev server first on Windows if the database file is locked. There is no seed
script and no sample job data.

## Testing

The unit tests pass with:

```bash
npm run typecheck
npm run lint
npm run test:unit
```

The smoke test drives the real HTTP server and the real server actions through
`/api/test/action`:

```bash
# Terminal 1
$env:RECRUITFLOW_TEST_HOOKS = "1"
npm run dev -- --port 3101

# Terminal 2
npm run test:smoke -- http://localhost:3101
```

It creates its own recruiter, job, student, and application, then exercises the
communication round, grading, completion, recruiter visibility, and access
control. It needs a valid OpenRouter key. `SKIP_AI=1` is intended to test the
deterministic wiring without the model, but that path is currently broken (see
below).

There is no CI configuration, no component/browser test suite, and no automated
regression test for the authorization gaps listed below.

## Known issues and incomplete work

This section documents behavior that is broken, unsafe, or not implemented in the
current codebase. It is intentionally specific so the next contributor can find
the relevant files quickly.

### AI and round correctness

- **All built-in rounds depend on OpenRouter.** There is no offline or
  deterministic fallback for Communication, Aptitude, Technical 1, Technical 2,
  or HR. Missing, expired, or rate-limited credentials make those rounds
  unusable.
- **The deterministic Communication evaluator is dead code.**
  `evaluateCommunicationAnswer` in
  `src/lib/assessment/evaluators/communication.ts` is wired into the registry,
  but `submitRoundAnswer` handles `communication` in its AI branch before it
  reaches `definition.evaluate`. The fallback branch is therefore unreachable.
- **The registry is not the only source of round behavior.**
  `generateDynamicPrompt` hardcodes a section-by-section `if/else` chain in
  `src/lib/round-actions.ts`, and grading is selected by a hardcoded kind check.
  Adding a round still requires editing those branches, despite the registry's
  comments.
- **A failed dynamic prompt has no retry UI.** If generation fails, the error
  text is shown as the question. The candidate can leave and reopen the page to
  trigger another attempt, but there is no retry button in the runner.
- **Custom-round pass thresholds are informational only.**
  `finalizeCustomRound` passes or fails based solely on the recruiter's decision;
  it does not enforce the configured threshold.
- **Custom-round review does not require every answer to be graded.**
  A recruiter can finalize the round while answers remain ungraded; ungraded
  answers count as zero in the stored score.
- **Per-job thresholds for built-in rounds have no UI.**
  `resolvePassThreshold` reads `job_rounds`, but only the custom round is
  configurable from the recruiter UI. Built-in thresholds can only be changed by
  writing to the database.
- **The static `types.ts` comment is stale.** It says Communication is the only
  implemented round, while all six kinds are registered and active.

### Authorization and security

- **Stage mutation actions allow anonymous callers.**
  `updateApplicationStage` and `advanceApplicationStage` in
  `src/lib/actions.ts` only check recruiter ownership when a recruiter session
  exists. An anonymous caller that invokes the server action directly can change
  an application's stage. The `if (recruiter)` guard should be inverted to
  require a recruiter.
- **Session cookies are unsigned.** `rf_student`, `rf_recruiter`, and `rf_admin`
  contain raw user IDs. Anyone who learns an ID can set the cookie and act as
  that user. IDs are 8 hexadecimal characters, so guessing is not trivial but is
  far weaker than a signed session token.
- **Several read server actions do not check ownership.**
  `getStudent`, `getStudentApplications`, `getJobApplications`, and
  `getApplication` are exported from the `'use server'` module without
  authorization checks. The current pages re-check ownership, but the functions
  themselves are not safe to expose as actions and can leak profile and
  application data if they are reachable from a client bundle.
- **The Judge0 proxy is unauthenticated.** `/api/judge0` only rate-limits by IP
  and trusts `x-forwarded-for`, which is spoofable. Anyone can submit code to the
  configured Judge0 instance.
- **Login and question generation are not rate-limited.** Only answer submission
  (20/minute/round) and Judge0 execution (30/minute/IP) have limits.
- **Rate limiting is per process and in-memory.** It resets on restart and does
  not coordinate across multiple server instances.
- **Recordings have no retention or cleanup policy.** Files accumulate under
  `.data/audio` and `.data/proctoring`; deleting a database row does not remove
  the files.

### Proctoring and recordings

- **Resuming a round skips proctoring setup.** When a round is already
  `in_progress`, `RoundRunner` starts in the active phase with no webcam/screen
  streams, no recording, and no proctoring grant. Refreshing mid-round therefore
  lets the candidate continue without active proctoring.
- **Webcam/screen recordings are only uploaded on finish or time-up.** Navigating
  away, closing the tab, or unmounting the component loses the recording;
  recorders are not stopped on unmount.
- **Upload endpoints do not require an in-progress round.** A student can upload
  audio or proctoring video to their own completed round.
- **Audio upload can race the answer save.** `submit` stops the answer recorder,
  whose `onstop` handler uploads immediately, and then calls
  `submitRoundAnswer`. If the upload reaches the server before the answer is
  saved, the audio route returns `409 Submit the answer before attaching audio to
  it.` The audio is then lost.
- **Proctoring uploads accept up to 100 MB per request.** There is no streaming
  or chunked upload; the whole blob is buffered in memory.
- **The webcam bypass is development-only.** `NEXT_PUBLIC_BYPASS_WEBCAM=1` skips
  webcam capture in non-production builds; screen sharing is still required.

### Candidate UX and state

- **Reloading a submitted custom round shows the instructions screen.**
  `RoundRunner` only treats `passed` and `failed` as finished. A `submitted`
  custom round falls back to the instructions phase, and clicking Start then
  fails because the round is already closed.
- **Resuming at an answered question can show a blank answer.** The initial
  `draft` is empty and is not populated from the current answer on mount. The
  read-only text area stays blank until the candidate navigates away and back.
- **Leaving a round does not warn about losing progress.** There is no
  `beforeunload` guard, and in-progress answers that were not submitted are lost.
- **Question navigation after submit uses stale state.** `submit` calls
  `goTo(index + 1)` before React has applied the new answer state, so the next
  question's draft is read from the previous state snapshot.
- **Skill matching is substring-based.** `calculateSkillMatch` treats `Java` as a
  match for `JavaScript` and vice versa, despite comments describing exact
  matching.
- **The landing page overstates the product.** It advertises "AI voice agents"
  and "live proctored interviews", but the implemented rounds are asynchronous
  text/voice-answer assessments with a browser speech-to-text helper, not a
  live AI interviewer.
- **The recruiter card mislabels custom-round scoring.** It says "Scored
  automatically on submission" for every scored round, including the manually
  graded custom round.
- **Lists are unpaginated.** Job lists, applicant lists, and question lists load
  every row.

### Admin and content management

- **The admin area is incomplete.** Only `/admin/questions` exists. There is no
  `/admin` root page and no `/admin/pipelines` page, although the sidebar links
  to it. An admin login failure redirects to `/admin?error=...`, which 404s.
- **The admin question bank is disconnected from assessments.** Questions added
  through `/admin/questions` are stored in the `questions` table but are not read
  by the assessment flow. The same table is also used for generated questions.
- **There is no admin UI for users, jobs, applications, rounds, or recordings.**
  Admin can only view and add question-bank rows.

### Missing product functionality

- No job editing, deletion, closing, or expiry.
- No student application withdrawal.
- No notifications, email, or in-app messaging.
- No password change or password reset flow for students or recruiters.
- No recruiter profile editing.
- No admin user management.
- No pagination, search, or filtering beyond client-side skill suggestions.
- No resume parsing or profile import.
- No audit log for stage changes or admin actions.

### Data, setup, and tests

- **`db:reset` does not reseed.** `scripts/reset.mjs` only deletes the database
  file. A fresh checkout has no jobs, no demo users, and no sample applications.
- **Demo credentials imply seed data that does not exist.** The demo recruiter
  comment says Sarah owns roles, but a fresh database has no jobs. Jobs appear
  only after a recruiter creates them.
- **The `SKIP_AI=1` smoke path is broken.** Even with generation failures
  tolerated, `submitRoundAnswer` requires a generated question and throws
  "Question not found", and the final assertion still expects
  `Round passed`, which an ungraded round cannot produce.
- **Some ad-hoc scripts are not part of `package.json`.** Files such as
  `check_db.mjs`, `check_jobs.mjs`, `test_openrouter.mjs`, and the Judge0 scripts
  are development helpers, not maintained test commands.
- **No CI.** Typecheck, lint, unit tests, and smoke tests are manual.

### Deployment

- SQLite and local-disk recordings are not suitable for serverless or
  multi-instance deployments. On Vercel/Lambda the database falls back to a temp
  directory, which is ephemeral, and recording storage has the same problem.
- Replace SQLite with a managed database and local files with object storage
  before treating this as a production service.
- Demo login and test hooks are environment-gated, but enabling them on a public
  deployment exposes demo sessions and a JSON bridge onto sensitive actions.

## Where to start reading

1. `src/lib/assessment/registry.ts` — round definitions and thresholds.
2. `src/lib/round-actions.ts` — round lifecycle, AI generation, and grading.
3. `src/lib/rounds.ts` — derived round state used by every UI.
4. `src/lib/assessment/scoring.ts` — pass/fail rules.
5. `src/components/rounds/RoundRunner.tsx` — candidate experience, timer,
   proctoring, and submission.
6. `src/lib/db/index.ts` — schema and migrations.
7. `src/lib/actions.ts` — sessions, profiles, jobs, applications, stage changes.
