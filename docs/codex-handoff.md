# Codex Handoff — I-013

**Branch:** `fix/I-013-if-match-header`

**First step:** `git fetch origin && git checkout -B fix/I-013-if-match-header origin/main`

**Context:**
All book write routes in the API enforce an `If-Match: "book-<version>"` header (HTTP 428 if missing). The web client never sends this header — every write function in `apps/web/src/app/api.ts` omits it. The result is that every mutation (add account, post transaction, edit transaction, CSV import, etc.) fails with "If-Match is required for book write routes."

The book document already has a `version: number` field (`packages/book/src/types.ts:108`). The fix is to thread `bookVersion` through every write path and inject the header.

**Acceptance criteria:**

1. Every write function in `apps/web/src/app/api.ts` accepts a `bookVersion: number` parameter (as the second argument, after `bookId`) and sends `"if-match": \`"book-${bookVersion}"\`` in the request headers.
   - Affected functions: `postTransaction`, `putTransaction`, `deleteTransaction`, `postAccount`, `postReconciliation`, `postCsvImport`, `postBaselineBudgetLine`, `postEnvelope`, `postEnvelopeAllocation`, `postScheduledTransaction`

2. All call sites pass the current book version:
   - `apps/web/src/app/App.tsx` — 5 direct call sites (`putTransaction` ×3, `postTransaction`, `deleteTransaction`, `postAccount`). Use `loadedBook.version`. Also add `bookVersion={loadedBook.version}` to the `NonLedgerMainPanels` and `LedgerOperationsPanels` prop sets.
   - `apps/web/src/app/NonLedgerMainPanels.tsx` — add `bookVersion: number` to `NonLedgerMainPanelsProps`; pass it at the 8 call sites (`postBaselineBudgetLine` ×2, `postEnvelope` ×2, `postEnvelopeAllocation`, `postCsvImport`, `postScheduledTransaction` ×2).
   - `apps/web/src/app/LedgerOperationsPanels.tsx` — add `bookVersion: number` to props; pass it at the 1 `postReconciliation` call site.

3. Adding an account, posting a transaction, editing a transaction, and all other write flows no longer return 428.

4. `pnpm --filter @tally/web typecheck` passes.

5. `pnpm ci:verify` passes.

**Key files:**

- `apps/web/src/app/api.ts` — add `bookVersion: number` param + `if-match` header to all 10 write functions
- `apps/web/src/app/App.tsx` — pass `loadedBook.version` at 5 direct call sites; pass `bookVersion` prop to `NonLedgerMainPanels` and `LedgerOperationsPanels`
- `apps/web/src/app/NonLedgerMainPanels.tsx` — add `bookVersion` prop; pass at 8 call sites
- `apps/web/src/app/LedgerOperationsPanels.tsx` — add `bookVersion` prop; pass at 1 call site

**Do not touch:**
- API enforcement logic in `apps/api/src/http.ts` — it is correct as-is
- Any domain or persistence code

**Risk:** R2

**Rollback:** revert commits to `apps/web/` only — no API, domain, or persistence changes

**Final step:** push the branch and open a PR using `.github/PULL_REQUEST_TEMPLATE.md`. Fill out all sections. `pnpm ci:verify` must pass before opening the PR. Append a one-line completion entry to `docs/project-status.md` before opening the PR. Risk is R2 — leave the PR open for maintainer review, do not merge.
