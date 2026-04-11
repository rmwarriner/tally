# Codex Handoff — I-012

**Branch:** `feat/I-012-theme-picker-gruvbox`

**First step:** `git fetch origin && git checkout -B feat/I-012-theme-picker-gruvbox origin/main`

**Context:**
The CSS custom property architecture and light/dark themes are already in place. The `Theme` type in `use-preferences.ts` is currently constrained to `"light" | "dark"`, and the theme picker in Settings is a hardcoded two-option radio group. This issue extends the theme system to support named themes and ships Gruvbox as the first named theme.

This work is explicitly called out in `docs/ideas.md` Track 7 as "should not be deferred until after all register slices are complete." All register slices (1–4) are now done, so this is the right next step.

**Acceptance criteria:**

1. `Theme` type in `apps/web/src/app/use-preferences.ts` is extended to `"light" | "dark" | "gruvbox"`.
2. `loadPreferences` in `use-preferences.ts` accepts `"gruvbox"` as a valid stored value (no fallback to `"light"` on deserialisation).
3. A `[data-theme="gruvbox"]` CSS block is added to `apps/web/src/app/styles.css` using the Gruvbox dark palette specified below. All semantic tokens (`--bg`, `--surface`, `--surface-alt`, `--surface-input`, `--surface-hover`, `--surface-selected`, `--surface-warm`, `--text`, `--text-muted`, `--accent`, `--accent-warm`, `--amount-positive`, `--amount-negative`, `--warning`, `--danger`) are mapped.
4. The theme radio group in `apps/web/src/app/NonLedgerMainPanels.tsx` (currently `["light", "dark"]`) is extended to `["light", "dark", "gruvbox"]`. Label for Gruvbox renders as `"Gruvbox"`.
5. `data-theme` is applied to the root element in `App.tsx` correctly for all three theme values — this should already work if the attribute binding uses the preference value directly; verify it does.
6. Selecting Gruvbox in Settings persists to `localStorage` and survives a page reload.
7. `pnpm --filter @tally/web typecheck` passes.
8. `pnpm ci:verify` passes.

**Gruvbox dark palette mapping** (from `docs/ideas.md` Track 7):

```
--bg:               #1d2021   (bg0_h)
--surface:          #282828   (bg0)
--surface-alt:      #3c3836   (bg1)
--surface-input:    #504945   (bg2)
--text:             #ebdbb2   (fg1)
--text-muted:       #a89984   (fg4)
--amount-positive:  #b8bb26   (bright_green)
--amount-negative:  #fb4934   (bright_red)
--accent:           #8ec07c   (bright_aqua)
--accent-warm:      #fabd2f   (bright_yellow)
--warning:          #d65d0e   (neutral_orange)
--danger:           #cc241d   (neutral_red)
```

Derive `--surface-hover`, `--surface-selected`, and `--surface-warm` as low-opacity overlays of `--accent-warm` (matching the approach used by the dark theme with `rgba(255, 200, 100, ...)` — replace with Gruvbox yellow `#fabd2f` at equivalent opacities: ~0.055, ~0.10, ~0.04).

**Key files:**

- `apps/web/src/app/use-preferences.ts` — extend `Theme` type; update `loadPreferences` deserialisation guard to accept `"gruvbox"`
- `apps/web/src/app/styles.css` — add `[data-theme="gruvbox"]` block after the `[data-theme="dark"]` block
- `apps/web/src/app/NonLedgerMainPanels.tsx` — extend theme radio group array to include `"gruvbox"` with label `"Gruvbox"`
- `apps/web/src/app/App.tsx` — verify `data-theme` attribute binding passes through correctly (no change likely needed)

**Do not touch:**
- Gruvbox light variant — explicitly deferred to a follow-up
- Motion, iconography, or other Track 7 items — out of scope

**Risk:** R1 — purely additive visual/preference change; no persistence schema changes, no API changes, no domain logic

**Rollback:** Revert the three file changes to `use-preferences.ts`, `styles.css`, and `NonLedgerMainPanels.tsx` — no other packages affected

**Final step:** push the branch and open a PR using `.github/PULL_REQUEST_TEMPLATE.md`. Fill out all sections including risk tier (R1), rollback plan, and handoff packet. `pnpm ci:verify` must pass before opening the PR. Append a one-line completion entry to `docs/project-status.md` before opening the PR.
