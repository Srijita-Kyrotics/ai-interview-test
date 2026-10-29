# RecruitFlow

An AI-driven campus hiring platform. Recruiters post jobs and manage a candidate
pipeline; students build a profile, get skill-matched to roles, and take a
proctored, AI-graded assessment funnel.

Built with **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**,
and a local **SQLite** database via Node's built-in `node:sqlite`.

## The assessment pipeline

A passing score in one round advances the application to the next:

```
Applied → Communication → Aptitude → Technical 1 → Technical 2 → HR → Selected
                                  ↘                                ↙
                                        Rejected
```

Each round is defined once in `src/lib/assessment/registry.ts` (questions, time
limit, pass threshold, proctoring tolerance, evaluator). The database, server
actions, and runner UI are all driven from that map, so adding or changing a
round does not touch the runner.

- **Grading** — open questions are graded by an LLM through OpenRouter the moment
  an answer is submitted. If grading fails, the answer is stored *ungraded* and
  the round is flagged for a human rather than scored as a zero.
- **Coding** — the Technical rounds embed a Monaco IDE and run code through
  [Judge0](https://judge0.com/).
- **Proctoring** — webcam and screen recordings plus tab-switch/copy/paste events.
  Crossing the event threshold flags the round for review. Recordings are served
  only to the owning student, the job's recruiter, or an admin.

## Getting started

Requires **Node.js >= 22.5** (for `node:sqlite`).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Environment variables

Create a `.env.local` (git-ignored):

| Variable | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes, for AI rounds | OpenRouter API key used to generate and grade questions. |
| `OPENROUTER_MODEL` | No | Model id. Defaults to `openai/gpt-4o-mini`. |
| `OPENROUTER_REFERER` | No | `HTTP-Referer` sent to OpenRouter. Defaults to `http://localhost:3000`. |
| `JUDGE0_URL` | No | Judge0 base URL for code execution. |
| `RECRUITFLOW_DB_PATH` | No | SQLite file path. Defaults to `.data/recruitflow.db`. |
| `RECRUITFLOW_ENABLE_DEMO` | No | Set to `1` to enable one-click demo logins in production (they are off there by default). |
| `RECRUITFLOW_ADMIN_EMAIL` / `RECRUITFLOW_ADMIN_PASSWORD` | No | Credentials that open the admin question bank. |
| `RECRUITFLOW_TEST_HOOKS` | No | Set to `1` to enable `/api/test/action` for the smoke test. |

### Demo logins

No sign-up needed in development — use the **Try Demo** buttons on the home page,
or sign in manually:

- **Student** — `alex.demo@recruitflow.dev`
- **Recruiter** — `Sarah` / `Acme Corp`
- **Password (both)** — `Demo@1234`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` / `npm start` | Production build and server. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test:unit` | Unit tests for parsing, scoring, passwords, rate limiting, storage. |
| `npm run test:smoke` | End-to-end smoke test against a running server (requires `RECRUITFLOW_TEST_HOOKS=1`). |
| `npm run db:reset` | Drop and reseed the local database. |

## Project layout

```
src/
  app/            routes: student, recruiter, admin portals + API handlers
  components/     UI, including components/rounds/* for the runner and IDE
  lib/
    assessment/   round registry, pure scoring, AI-response parsing, question banks
    ai/           OpenRouter client
    db/           schema + migrations, repositories
    actions.ts    server actions for sessions, jobs, applications, questions
    round-actions.ts  server actions for taking and grading rounds
  proxy.ts        cookie gate for the portal routes
```

## Notes

- The database is a single SQLite file and the recordings live on local disk
  under `.data/`. That is fine for local/demo use but **not** for serverless
  hosts with ephemeral storage — swap in a managed database and object storage.
- Server actions and route handlers re-check ownership on every call; `proxy.ts`
  only redirects unauthenticated navigation.
