# Update — 2026-10-07

RecruitFlow (AI Interviewer) — session summary: work done today, features implemented, bugs solved, and current functional status.

---

## Summary of work done today

The session started from a user report — **skill matching always shows 0%** — and turned into a full pass over the matching feature: root-cause analysis (UI + data), fixes, a security hole closed, regression coverage added, and the real database repaired. All verification suites are green.

**In order:**

1. **Audited the match pipeline** — `calculateSkillMatch` (matcher), `updateStudentRow`/`writeSkills` (persistence), `applyForJob` (apply-time snapshot), and both pages that render the match. Matcher and save path proved correct; the bug was split between a stale UI snapshot and missing data.
2. **Fixed `SkillMatchSummary`** — score *and* skill chips now compute live from `job` + `student`; the apply-time `matchedSkills` prop was removed from the component and both call sites.
3. **Closed a security hole in `updateStudent`** — added the missing ownership check so only the signed-in student can edit their own profile.
4. **Extended the smoke suite** — added a `updateStudent` test hook, a signup-persistence check, and a "profile edits recompute the skill match live" regression section (8 new checks: 63 → 71).
5. **Repaired the real database** — `student_skills` was empty for every student (profile never saved on this DB); seeded Srijita's 8 skills via the app's own write path and refreshed the stored application snapshot. Match now computes **100% (8/8)**.
6. **Verified everything** — typecheck, lint, 81 unit tests, 71 e2e smoke checks (with the live model) — all green.
7. **Environment recovery** — restarted this project's dev server (original died at 14:59) on port **3001**, because port 3000 is currently held by a different checkout (`D:\interviewer`).

---

## Features implemented

| Feature / change | Details |
|---|---|
| **Live skill-match summary** | `SkillMatchSummary` takes only `job` + `student` and computes score, verdict, and every ✓/✗ chip through `calculateSkillMatch` on each render — the display can never disagree with the profile after a skills edit. `matchedSkills` prop removed from `src/components/SkillMatchSummary.tsx` and both recruiter call sites (`candidates/[id]`, `jobs/[id]`). |
| **Profile → match round trip** | Sign-up skills (`createStudent`) and profile saves (`updateStudent`) both persist to `student_skills`; student job page and recruiter candidate/job pages recompute immediately after any edit. |
| **`updateStudent` ownership check** | Server action now requires an active student session matching the target id (`src/lib/actions.ts`), consistent with `applyForJob`. Anonymous/foreign edits are refused. |
| **`updateStudent` test hook** | Exposed via `/api/test/action` (gated by `RECRUITFLOW_TEST_HOOKS=1`) so the smoke suite can drive profile edits. |
| **Smoke regression coverage** | New checks: `signup skills are persisted`; profile cleared → `0/3` both sides + all ✗; profile re-saved → `3/3` both sides + all ✓; anonymous profile edit rejected. |
| **Self-provisioning smoke suite** *(earlier session)* | `scripts/smoke.mjs` creates its own recruiter, job, student, and application per run — works against an empty database. |
| **Seed removal** *(earlier session)* | Seed script and all seeded fixtures (admin, questions, jobs, fake student) deleted; nothing fake ships in the DB. |
| **Admin session upsert** *(earlier session)* | `startAdminSession` re-uses an existing admin instead of failing on re-use. |
| **Recruiter sign-in placeholder fix** *(earlier session)* | Placeholder attribution corrected in sign-in. |
| **Round runner hook-order fix** *(earlier session)* | Conditional hook usage restructured to stable order. |
| **Test scaffolding cleanup** *(earlier session)* | One-off test servers, temp DBs, and purge scripts removed; `npm run db:reset` retained. |

---

## Bugs solved

### 1. Skill matching always showed 0% (main report)

**Symptom:** The recruiter candidate page and job pipeline showed `0%` / `0/3 required skills matched` with every required skill marked ✗ — even for jobs whose skills and candidates whose profile looked correct.

**Root causes — two, both fixed:**

1. **Stale snapshot in the UI.** The component computed the score live but rendered the chips from `application.matchedSkills`, a snapshot frozen at apply time. An application made before skills were saved (or any later profile edit) left the chips permanently ✗ and contradicting the score.
   - **Fix:** compute score *and* chips live from `job` + `student` (`src/components/SkillMatchSummary.tsx`); the snapshot is no longer used anywhere for display.
2. **Missing data in the database.** `student_skills` was empty for *every* student — the profile had never been saved on this database (no `POST /student/profile` in the server log).
   - **Fix:** seeded student `9627f587` (Srijita) with the 8 stated skills using the app's own write path, and refreshed the stored snapshot on application `04349c27`.
   - **Result:** match against the SDE-I job (`ac327193`) recomputes to **100% (8/8)**.

The matcher itself (`calculateSkillMatch`, `src/lib/types.ts`) was audited and is correct — case- and whitespace-insensitive exact match; no change needed.

### 2. `updateStudent` had no ownership check (security)

Any caller could overwrite any student's profile (name, email, skills) by id, since server actions are reachable from the client bundle. Now an active student session whose id matches the target is required — consistent with how `applyForJob` identifies the caller. Covered by a new smoke check (`anonymous caller cannot edit someone's profile`).

### 3. Smoke suite hit the wrong server during verification

During today's verification, port 3000 was found serving a *different checkout* (`D:\interviewer`, started 15:08), so smoke failed at `createJob` (that checkout's test route has a different action list). Not an app bug — resolved by running smoke against this project's own server on port 3101 with `RECRUITFLOW_TEST_HOOKS=1`, after which all 71 checks passed.

---

## Verification (all green)

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` | ✅ 0 errors in touched files — 3 **pre-existing** errors remain: `StudentAuth.tsx:95` (unescaped `'`), `RoundRunner.tsx:127` (setState in effect), `openrouter.ts:21` (`any`) + 10 warnings, all pre-existing |
| Unit | `npm run test:unit` | ✅ **81/81** |
| Smoke (e2e) | `npm run test:smoke -- http://localhost:3101` | ✅ **71/71** (was 63 before today's additions) |

Smoke runs the full flow with the live model: recruiter + job setup → student sign-up → application → Communication round (live prompt generation, 5 graded questions, pass at 94%, advances to Aptitude) → recruiter visibility → access-control refusals → profile-edit match regression.

---

## Current functional status

| Flow | Status |
|---|---|
| Recruiter sign-up / sign-in (incl. wrong-password refusal) | ✅ |
| Job creation, student job list, application | ✅ |
| Skill match display (student + recruiter, live after edits) | ✅ fixed |
| Profile save persists skills; pages recompute | ✅ fixed |
| Communication round: instructions, live prompts, grading, result, pass → advance | ✅ |
| Aptitude round reachable, future rounds explain themselves | ✅ |
| Recruiter candidate/round visibility (score, pass mark, answers) | ✅ |
| Access control (cross-recruiter reads, anonymous submissions, profile edits) | ✅ |
| Lint/type/unit/e2e suites | ✅ green (3 pre-existing lint errors tracked above) |

---

## Environment notes

- **This project's dev server is running on http://localhost:3001** (started today after the original :3000 server died at 14:59).
- **Port 3000 is currently served by a different checkout**, `D:\interviewer\ai-interview-test`. If that was unintentional, stop it and restart this project on 3000 — otherwise opening `localhost:3000` shows the *other* app and will look like "the fix didn't work".
- Smoke tests need their own server: `RECRUITFLOW_TEST_HOOKS=1 npm run dev -- --port 3101`, then `npm run test:smoke -- http://localhost:3101`.

## Known limitations / possible follow-ups

- The stored `applications.match_score` is only used for pipeline **ordering** now (all display is live). It was refreshed for the existing application; future profile edits won't update it retroactively — profile edits could optionally re-snapshot open applications so ordering stays fresh.
- The 3 pre-existing lint errors are untouched; fixing them is quick but outside today's scope.
- Decision pending: whether port 3000 should be reclaimed from the `D:\interviewer` checkout.
