# Update — 5 October 2026

A security, correctness and testing pass over the assessment pipeline. Synced with
`origin/main` at `18b4ed5` before starting; everything below is uncommitted work in the
working tree.

## Where it stands

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean, 0 errors |
| `npm run build` | succeeds, 13 routes |
| `npm run test:unit` | **81 passed, 0 failed** |
| `npx eslint .` | 7 problems, all pre-existing (was 19) |
| `npm run test:smoke` | harness rebuilt, not yet fully green |

## Features implemented

**Password security.** Student and recruiter passwords are hashed with scrypt and a
per-password salt. Secrets no longer appear on the public records the UI reads, and a
legacy plaintext password is transparently upgraded on next sign-in.

**Real admin authentication.** `/admin` used to auto-provision a session for any visitor.
It now requires credentials from `RECRUITFLOW_ADMIN_EMAIL` and `RECRUITFLOW_ADMIN_PASSWORD`,
and reports that access is disabled when they are unset.

**Recruiter sign-in.** Recruiters now sign in with a password instead of name and company
alone. Session cookies are marked `secure` in production.

**AI spend controls.** Grading is rate limited per round, and an answer that has already
been graded can no longer be silently overwritten — so a double-click or retry no longer
re-bills the model.

**Answer locking.** Submitted questions render read-only in the candidate UI with a visible
notice, and revisiting a question shows its graded answer.

**Audio capture and playback.** Answers can be recorded and stored. Playback is authorised:
the owning student, the recruiter who owns the job, or an admin — nobody else.

**Proctoring and review flags.** Rounds record whether they need human review, and
recruiters see *why* — ungraded answers or too few submitted — with ungraded ones shown as
"Not graded" instead of a misleading score.

**Audio + video question types** were added to the admin question model.

**Test suites.** A unit suite covering JSON parsing, evaluation normalising, scoring rules,
password hashing, rate limiting and storage. The end-to-end smoke harness was rebuilt
around a guarded test endpoint, because server action ids are minified away in development
and never expose their names in production, so scraping the build can never work.

**Schema** bumped to version 5: `recruiters.password`, `rounds.flagged`,
`round_answers.graded`.

## Bugs solved

**The same round produced two different verdicts.** The pass decision scored against the
full question count while the result page scored against what was actually submitted, so a
part-finished round could fail the decision while the page reported a high percentage for
identical scores. Both now read one denominator.

**Part-finished rounds could pass.** Three perfect answers out of five was enough. There is
now a minimum-answers requirement.

**AI failures were disguised as real grades.** When the model could not grade an answer it
was silently awarded 5/10. It is now stored as ungraded, which blocks the pass and flags
the round for review.

**Per-job pass thresholds were dead.** The `job_rounds.pass_threshold` column existed but
was never read. It now drives scoring.

**Generated answer keys were accepted unchecked.** They are now validated by a second pass.

**Zero-answer rounds showed a blank shell.** The runner now derives its phase from terminal
status, so a failure with no answers still displays its result.

**`refresh()` threw outside a Server Action**, which would break any caller reaching these
actions over HTTP.

**Speech-to-text was mandatory for recording.** A browser without speech recognition could
not record audio, and one without a microphone could not type. The two are now independent.

## Known outstanding

- `technical1`, `technical2` and `hr` are still stubs, so the pipeline dead-ends after
  Aptitude.
- Accounts seeded before today have blank passwords and can no longer sign in; a reset path
  is needed.
- `middleware.ts` should become `proxy.ts` under the Next 16 convention.
- Two pre-existing lint errors remain: an unescaped entity and an `any`.
- `OPENROUTER_API_KEY` was exposed in chat during this session and should be rotated. It is
  gitignored and not committed.