# Codex Handoff — I-014

**Branch:** `feat/I-014-shell-redesign-slice-1`

**First step:** `git fetch origin && git checkout -B feat/I-014-shell-redesign-slice-1 origin/main`

**Context:**
This is Slice 1 of the shell redesign documented in `docs/shell-redesign-plan.md`. The goal is to replace the placeholder design infrastructure with the real foundation: Geist as the UI typeface, JetBrains Mono as the data/amount typeface, Phosphor icons in the activity bar, and removal of three panel title bars that label surfaces the user can already see. No behavioral changes — purely additive visual foundation that every subsequent slice builds on.

Design reference: `docs/shell-redesign-plan.md` → Slice 1.

**Acceptance criteria:**

1. **Fonts installed and loading:**
   - `geist` and `@fontsource/jetbrains-mono` added as dependencies to `apps/web/package.json`
   - Both fonts load from the app bundle — no external CDN requests in the network tab
   - `--display-font` custom property updated to `'Geist', system-ui, sans-serif` in `apps/web/src/app/styles.css`
   - `--mono-font` custom property updated to `'JetBrains Mono', monospace` in `apps/web/src/app/styles.css`
   - Font imports wired into `apps/web/src/main.tsx` or `apps/web/src/app/styles.css` (whichever is cleaner for the Vite build)
   - `body` continues to use `var(--display-font)`; all existing `var(--mono-font)` usages automatically pick up JetBrains Mono

2. **Phosphor icons in activity bar:**
   - `@phosphor-icons/react` added as a dependency to `apps/web/package.json`
   - `BookViewDefinition` interface in `apps/web/src/app/shell.ts` gains an `icon` field typed as a Phosphor icon component (`React.ElementType` or the specific Phosphor type)
   - Each entry in `bookViews` has an icon assigned per the mapping below
   - `ShellActivityBar.tsx` renders the icon component at 20px instead of `view.shortLabel`
   - Inactive buttons: `weight="light"`; active button: `weight="regular"`
   - Each button retains a `title={view.label}` attribute for accessibility
   - `shortLabel` field removed from `BookViewDefinition` interface and all `bookViews` entries (no remaining usages after this change)

   **Icon mapping:**
   | View ID | Phosphor component |
   |---|---|
   | overview | `SquaresFour` |
   | ledger | `Ledger` |
   | budget | `Target` |
   | envelopes | `Envelope` |
   | imports | `ArrowLineDown` |
   | automations | `CalendarBlank` |
   | reports | `ChartLineUp` |
   | settings | `Gear` |

3. **Panel chrome removed:**
   - `CoaSidebar.tsx`: the `<div className="panel-header">` containing "Chart of accounts" and the active view label is removed. The account list is self-evident. The quick-actions row below it is unchanged.
   - `NonLedgerMainPanels.tsx`: the `<div className="panel-header">` containing "Workspace modes" / "Desktop command center" is removed from the overview `<article>` only. All other inner `panel-header` elements within forms, budget lines, envelope sections, etc. are left untouched.
   - `App.tsx`: the `<div className="panel-header">` inside `<aside className="inspector">` containing "Inspector" / the active view label is removed. The inspector `<aside>` itself and its content remain.

4. `pnpm --filter @tally/web typecheck` passes.
5. `pnpm ci:verify` passes.

**Key files:**

- `apps/web/package.json` — add `geist`, `@fontsource/jetbrains-mono`, `@phosphor-icons/react`
- `apps/web/src/app/styles.css` — update `--display-font` and `--mono-font` values; add font imports if done via CSS `@import`
- `apps/web/src/main.tsx` — add font CSS imports if done via JS entry point (Vite handles both)
- `apps/web/src/app/shell.ts` — add `icon` field to `BookViewDefinition`; remove `shortLabel`; assign icons in `bookViews`
- `apps/web/src/app/ShellActivityBar.tsx` — render Phosphor icon instead of `shortLabel`
- `apps/web/src/app/CoaSidebar.tsx` — remove panel-header block
- `apps/web/src/app/NonLedgerMainPanels.tsx` — remove overview panel-header block only
- `apps/web/src/app/App.tsx` — remove inspector panel-header block

**Do not touch:**
- Any inner `panel-header` elements in forms, settings, budget, envelope, schedule, or import sections
- Any behavioral logic — keyboard handlers, state, API calls
- Any file outside `apps/web/`

**Risk:** R1 — purely additive visual changes; no behavioral, API, or domain changes

**Rollback:** revert changes to `apps/web/` only; `pnpm install` to restore prior lockfile state

**Final step:** `pnpm ci:verify` must pass. Then:
```
gh pr create --title "feat: shell redesign slice 1 — fonts, icons, chrome removal (I-014)" \
  --body "$(cat .github/PULL_REQUEST_TEMPLATE.md)"
gh pr merge --squash --delete-branch --yes
```
Risk is R1 — merge immediately after CI passes. Append a one-line completion entry to `docs/project-status.md` before opening the PR.
