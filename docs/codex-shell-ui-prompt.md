# Codex Prompt — Tally Shell UI Implementation

## Task

Implement the Tally web shell UI rebuild as specified in `docs/shell-ui-spec.md`. Work slice by slice in order (Slice 1 → 2 → 3 → 4). Complete and verify each slice before starting the next.

## Git Setup (do this first, before any code changes)

```bash
git checkout main && git pull
git checkout -b feat/shell-ui-rebuild
```

Commit after each slice with a clear message:

```bash
git add <files changed in this slice>
git commit -m "feat(web): shell chrome and layout (Slice 1)"
# feat(web): global period state (Slice 2)
# feat(web): register balance modes (Slice 3)
# feat(web): COA sidebar contextual actions (Slice 4)
```

After all slices pass verification, push and open a PR:

```bash
git push -u origin feat/shell-ui-rebuild
gh pr create --title "feat(web): shell UI rebuild — chrome, period state, balance modes, COA actions" --body "$(cat <<'EOF'
## Summary

- Rebuilt shell chrome: ShellTopbar, ShellActivityBar, CoaSidebar, ShellStatusBar
- COA sidebar persistent across all activity views
- Period selector promoted to global application state
- Register two balance modes: running balance on complete slice, filtered subtotal on text-search slice
- COA sidebar contextual quick actions wired to existing mutation handlers

## Linked Work

- roadmap item: desktop client shell UI rebuild
- risk tier: R2

## Verification

- [x] `pnpm --filter @tally/web typecheck`
- [x] `pnpm test`
- [x] `pnpm ci:verify`
- [x] Manual smoke: navigate views, open/edit transaction, verify register renders

## Definition Of Done

- [x] acceptance criteria met (per docs/shell-ui-spec.md)
- [x] verification evidence included
- [x] risk tier recorded
- [x] rollback plan documented
- [x] handoff packet completed

## Test Plan

- [ ] Added or updated automated tests for behavior changes.

## UI Evidence

- [ ] screenshots attached

## Rollback Plan

- revert: `git revert` the slice commits or `git checkout main` and delete branch

## Handoff

- current state: [fill in — what was completed, what was skipped or flagged]
- next step: Claude review → merge → Tauri spike planning
- commands run: pnpm --filter @tally/web typecheck, pnpm test, pnpm ci:verify
- known risks: [fill in any deviations from spec or edge cases found]
- rollback plan: revert commits, branch can be deleted safely
- open questions: [fill in anything that needs maintainer decision]
EOF
)"
```

## Project Rules (always apply, no exceptions)

- **TDD**: write the failing test before the implementation for any logic added to `shell.ts`, `app-format.ts`, or `ledger-state.ts`
- **Coverage**: do not regress below 80% statements/branches/functions/lines — run `pnpm coverage` if in doubt
- **Audit events**: never remove or skip audit event emission from any mutation path
- **Actor identity**: never trust client-supplied actor identity — do not add any shortcut that bypasses `apps/api` auth
- **CI gate**: `pnpm ci:verify` must pass before the PR is opened
- **No new dependencies**: use only packages already in `apps/web/package.json`
- **No Tauri imports**: `apps/web/` must work in a plain browser — no `@tauri-apps/*` anywhere
- **No unrequested changes**: do not modify files not listed in the slice's change table; do not refactor, add comments, or "improve" code outside the slice scope

## Read First (in this order)

1. `docs/shell-ui-spec.md` — full implementation spec; primary reference
2. `apps/web/src/app/App.tsx` — current monolithic shell (read in sections, it is large)
3. `apps/web/src/app/styles.css` — current CSS
4. `apps/web/src/app/shell.ts` — `BookView`, `bookViews`, `createLedgerBookModel` (do not modify until Slice 3)
5. `apps/web/src/app/LedgerSidebar.tsx` — understand before deleting in Slice 1
6. `apps/web/src/app/ShellSidePanels.tsx` — understand current sidebar/inspector split

Do not read other files unless a slice explicitly names them. The spec lists what to preserve unchanged.

## Execution Per Slice

For each slice:
1. Read the files the slice touches
2. Implement the changes described
3. Run `pnpm --filter @tally/web typecheck` — fix all errors before proceeding
4. Run `pnpm test` — fix any new failures before proceeding
5. Commit the slice
6. Move to the next

## Final Verification (before opening PR)

```bash
pnpm --filter @tally/web typecheck
pnpm test
pnpm ci:verify
```

Manual smoke checklist:
- [ ] Load dev app — no console errors
- [ ] Navigate all activity bar views — COA sidebar visible in each
- [ ] Period pill opens input, accepts "March 2026", register reloads
- [ ] With no search: balance column present in register
- [ ] With search text: balance column absent, "showing N of M" visible
- [ ] Open and edit a transaction inline — no regression
- [ ] COA quick actions change based on tree selection

## Update project-status.md

After the PR is open, append to the `Completed` → `Client Integration` section:

```
- shell chrome rebuilt (ShellTopbar, ShellActivityBar, CoaSidebar, ShellStatusBar); COA sidebar persistent across all activities; period selector promoted to global state; register two balance modes implemented; COA contextual quick actions wired
```
