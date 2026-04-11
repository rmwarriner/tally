# Codex Handoff — I-011

**Branch:** `feat/i-011-app-format-test-coverage`

**First step:** `git fetch origin && git checkout -B feat/i-011-app-format-test-coverage origin/main`

**Context:**
`apps/web/src/app/app-format.ts` exports 10 functions. Only `formatAmount`, `formatPeriodLabel`, and `parsePeriodExpression` have tests in `app-format.test.ts`. The remaining 7 are untested, leaving the file at 74% statement and 50% function coverage. This task adds tests for all untested functions — no implementation changes needed.

**Acceptance criteria:**

1. Add tests in `apps/web/src/app/app-format.test.ts` for each of the following untested functions:
   - `formatCurrency` — formats a number as USD currency (e.g. `1234.5` → `"$1,234.50"`, `0` → `"$0.00"`, negative `-50` → `"-$50.00"`)
   - `formatSignedCurrency` — like `formatCurrency` but always shows sign: positive returns plain formatted value, negative prepends `-` (e.g. `50` → `"$50.00"`, `-50` → `"-$50.00"`, `0` → `"$0.00"`)
   - `formatTransactionStatus` — maps `"cleared"` → `"Cleared"`, `"reconciled"` → `"Reconciled"`, `"open"` → `"Open"`
   - `formatAccountOptionLabel` — returns `"Name (code)"` when code is present, `"Name"` when code is falsy (empty string or absent)
   - `parseCsvRows` — parses newline-separated CSV into row objects with `{ occurredOn, description, amount, counterpartAccountId, cashAccountId }`; test at least: a single valid row, multiple rows, and a row with leading/trailing whitespace that gets trimmed
   - `createTransactionId` — returns a string starting with `"txn-web-"`
   - `createEntityId` — returns a string starting with the given prefix followed by `-`

2. All new tests are in the existing `describe` blocks or new `describe` blocks in `app-format.test.ts` — no new test files needed.

3. `pnpm --filter @tally/web typecheck` passes.

4. `pnpm ci:verify` passes (branch coverage for `app-format.ts` should improve from 75% toward 90%+).

5. Append one line to `docs/project-status.md` in the Engineering Standards section: `- app-format.ts test coverage expanded to cover all exported functions`

6. Add I-011 to `docs/issues.md` Done section with `completed: <date>`.

**Key files:**
- `apps/web/src/app/app-format.test.ts` — add tests here only
- `apps/web/src/app/app-format.ts` — read for context, do not modify
- `docs/project-status.md` — append completion line
- `docs/issues.md` — add I-011 to Done

**Risk:** R1. Test-only change. No implementation modifications.

**Rollback:** revert commits to `apps/web/src/app/app-format.test.ts` only.

**Final step:** push the branch and open a PR using `.github/PULL_REQUEST_TEMPLATE.md`. Fill out all sections including risk tier (R1), rollback plan, and handoff packet. `pnpm ci:verify` must pass before opening the PR.
