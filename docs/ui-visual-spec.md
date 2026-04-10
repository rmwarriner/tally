# UI Visual Design Spec

Last reviewed: 2026-04-10

## Purpose

This document is the implementation handoff for the visual design polish pass. It covers:

1. A CSS custom property architecture that supports light/dark theming and a future third-party theme slot.
2. A user-selectable register density (compact vs. comfortable).
3. A user-selectable amount display style (color + sign, color only, sign only).
4. CSS component polish that consumes the new variable system.
5. A preferences persistence layer and settings UI for the three user-facing controls.

This work should land as a single focused PR before further register rebuild slices so that all subsequent UI work is built on the polished foundation.

## What Is Not In Scope

- Radix UI / headless component integration — belongs in register rebuild slices when specific interaction primitives are needed.
- Custom user-defined colour themes — the architecture supports them; building the theme editor is deferred.
- Mobile app styling — `apps/mobile/` is out of scope for this pass.

---

## Slice 1: CSS Variable Architecture

### Goal

Replace the runtime `<style>` injection in `App.tsx` with a proper CSS custom property system declared in `styles.css`. All hardcoded hex values in `styles.css` are replaced with variable references. Light and dark themes are defined as CSS selector blocks. The root element receives a `data-theme` attribute driven by app state.

### Token Source of Truth

Expand `packages/ui/src/tokens.ts` to export two theme objects — `lightTheme` and `darkTheme` — each containing the full set of semantic token values. These objects document the intended values; the CSS file encodes them directly (no runtime CSS generation from JS beyond the `data-theme` attribute switch).

**Semantic token set:**

```
Surface tokens:
  bg             — page background
  surface        — panel / card surface
  surfaceAlt     — sidebar and alternate surface
  surfaceInput   — input background
  surfaceHover   — row hover background
  surfaceSelected — row selected background
  surfaceWarm    — warm highlight surface (dashed callout, empty state)
  overlay        — command palette overlay scrim

Text tokens:
  text           — primary text
  textMuted      — secondary / label text

Accent tokens (teal):
  accent         — primary interactive accent
  accentSoft     — accent background chip

Accent warm tokens (amber — used for active/selected states):
  accentWarm         — warm amber background (active tabs, selected rows)
  accentWarmText     — warm amber text
  accentWarmBorder   — warm amber border

Border token:
  border         — standard border

Semantic state tokens:
  warning        — warning text/icon
  danger         — error/destructive text
  success        — success text

Status chip tokens (per status):
  statusOpenBg, statusOpenText
  statusClearedBg, statusClearedText
  statusReconciledBg, statusReconciledText

Amount tokens:
  amountPositive — colour for credit / inflow amounts
  amountNegative — colour for debit / outflow amounts

Activity bar (stays dark in both themes):
  activityBarBg
  activityBarText
  activityBarButtonActive

API status dot tokens:
  dotOnline, dotOffline, dotUnknown

Body gradient:
  gradientTop, gradientBottom, gradientRadial
```

**Light theme values:**

```
bg:                #f0ece3
surface:           #fffdf7
surfaceAlt:        #ece6d9
surfaceInput:      #fffaf1
surfaceHover:      rgba(255, 247, 232, 0.80)
surfaceSelected:   rgba(255, 241, 207, 0.75)
surfaceWarm:       rgba(255, 247, 232, 0.50)
overlay:           rgba(31, 29, 26, 0.25)
text:              #1f2321
textMuted:         #5f675f
accent:            #006b5f
accentSoft:        #d8efe8
accentWarm:        #fff1cf
accentWarmText:    #8b5c12
accentWarmBorder:  rgba(181, 129, 40, 0.42)
border:            #c9c1b4
warning:           #ad5f00
danger:            #8f2d1f
success:           #165a39
statusOpenBg:      #f3ebdb
statusOpenText:    #6f5a36
statusClearedBg:   #fff1cf
statusClearedText: #8b5c12
statusReconciledBg:   rgba(232, 245, 233, 0.95)
statusReconciledText: #2f6f37
amountPositive:    #006b5f   (same as accent — does not clash with warm bg)
amountNegative:    #8f2d1f   (warm dark red — same as danger)
activityBarBg:     rgba(31, 35, 33, 0.94)
activityBarText:   #fdf8ef
activityBarButtonActive: rgba(255, 255, 255, 0.20)
dotOnline:         #66c85f
dotOffline:        #f2b340
dotUnknown:        #8b8d89
gradientTop:       #efe7d7
gradientBottom:    #e6dece
gradientRadial:    #fff7d9
```

**Dark theme values:**

The dark theme preserves the warm/natural character. Backgrounds use desaturated warm greens, not cold blue-blacks.

```
bg:                #1a1c1b
surface:           #232825
surfaceAlt:        #2b302d
surfaceInput:      #2b302d
surfaceHover:      rgba(255, 200, 100, 0.055)
surfaceSelected:   rgba(255, 200, 100, 0.10)
surfaceWarm:       rgba(255, 200, 100, 0.04)
overlay:           rgba(0, 0, 0, 0.50)
text:              #e6e2da
textMuted:         #8a9088
accent:            #4dc4b0
accentSoft:        #1a3530
accentWarm:        #2a2210
accentWarmText:    #c8903a
accentWarmBorder:  rgba(181, 129, 40, 0.32)
border:            #3c4240
warning:           #e8a24a
danger:            #e87060
success:           #7ac880
statusOpenBg:      #2d2920
statusOpenText:    #b8a880
statusClearedBg:   #2a2210
statusClearedText: #c8903a
statusReconciledBg:   rgba(40, 80, 45, 0.45)
statusReconciledText: #7ac880
amountPositive:    #4dc4b0   (same as dark accent)
amountNegative:    #e87060   (warm salmon — readable on dark bg)
activityBarBg:     #141716
activityBarText:   #e8e4dd
activityBarButtonActive: rgba(255, 255, 255, 0.15)
dotOnline:         #66c85f
dotOffline:        #f2b340
dotUnknown:        #6a6d69
gradientTop:       #1a1c1b
gradientBottom:    #1a1c1b
gradientRadial:    #1f2220
```

### CSS Structure

Remove the `<style>` injection block from `App.tsx` entirely (lines ~1188–1201). Replace it with:

**In `styles.css`, at the top:**

```css
:root,
[data-theme="light"] {
  --bg: #f0ece3;
  --surface: #fffdf7;
  /* ... all light values ... */
  --amount-positive: #006b5f;
  --amount-negative: #8f2d1f;
}

[data-theme="dark"] {
  --bg: #1a1c1b;
  --surface: #232825;
  /* ... all dark values ... */
  --amount-positive: #4dc4b0;
  --amount-negative: #e87060;
}
```

CSS variable names use kebab-case matching the token names: `--surface-hover`, `--accent-warm-text`, `--status-open-bg`, etc.

### App Integration

In `App.tsx`:
- Import `usePreferences` (see Slice 3) to get `theme` preference.
- Apply `data-theme={theme}` to the root `.workspace` div.
- Remove the `colors` and `typography` imports from `@tally/ui` (they are no longer needed at runtime).

### Body Background

The body background gradient currently uses hardcoded values. Move them to CSS variables and reference them in `body { background: ... }` using the gradient tokens. For dark mode the gradient reduces to a flat near-black (both gradient stops are the same value).

---

## Slice 2: Density and Amount Style Systems

### Density

User-selectable at runtime. Default: `comfortable`.

| Variable | Compact | Comfortable |
|---|---|---|
| `--row-height` | 36px | 48px |
| `--cell-pad-y` | 7px | 11px |
| `--chip-pad-y` | 3px | 5px |
| `--form-pad-y` | 8px | 10px |
| `--gap-sm` | 6px | 8px |
| `--gap-md` | 10px | 14px |

In `styles.css`:

```css
:root,
[data-density="comfortable"] {
  --row-height: 48px;
  --cell-pad-y: 11px;
  /* ... */
}

[data-density="compact"] {
  --row-height: 36px;
  --cell-pad-y: 7px;
  /* ... */
}
```

Replace all hardcoded `padding: 10px` etc. on `th`, `td`, `.ledger-chip`, `.form-stack input`, `.form-stack button`, `.topbar-pill`, and `.account-search-option` with the corresponding density variables.

### Amount Display Style

User-selectable at runtime. Default: `both`.

**Rendering rules:**

| Setting | Colour | Prefix |
|---|---|---|
| `both` | positive = `--amount-positive`, negative = `--amount-negative` | `+` prefix on positive |
| `color` | positive = `--amount-positive`, negative = `--amount-negative` | no `+` prefix; `-` sign on negative (standard) |
| `sign` | both = `--text` (no colour) | `+` prefix on positive; `-` sign on negative |

**CSS:** The `[data-amount-style="sign"]` selector overrides amount colour variables to `var(--text)`. The `color` and `both` settings use the default `--amount-positive` / `--amount-negative` values from the theme block. No CSS override needed for `color` or `both`.

```css
[data-amount-style="sign"] {
  --amount-positive: var(--text);
  --amount-negative: var(--text);
}
```

**JS formatter** — add to `apps/web/src/app/app-format.ts`:

```typescript
export type AmountStyle = "both" | "color" | "sign";

export function formatAmount(
  value: number,
  formatCurrencyFn: (n: number) => string,
  style: AmountStyle,
): string {
  const absolute = Math.abs(value);
  const formatted = formatCurrencyFn(absolute);
  if (value > 0 && (style === "both" || style === "sign")) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}
```

Add tests in `apps/web/src/app/app-format.test.ts` covering all three styles × positive/negative/zero values.

**CSS classes** — `.amount-positive` and `.amount-negative` replace the existing `.numeric-positive` / `.numeric-negative` classes:

```css
.amount-positive { color: var(--amount-positive); font-family: var(--mono-font); }
.amount-negative { color: var(--amount-negative); font-family: var(--mono-font); }
.amount-neutral  { color: var(--text);             font-family: var(--mono-font); }
```

Update all existing uses of `.numeric-positive` / `.numeric-negative` in `LedgerRegisterPanel.tsx` to use `.amount-positive` / `.amount-negative` instead.

The `data-amount-style` attribute is applied to the root `.workspace` div alongside `data-theme` and `data-density`.

---

## Slice 3: Preferences Hook and Settings UI

### Preferences Hook

New file: `apps/web/src/app/use-preferences.ts`

```typescript
export type Theme = "light" | "dark";
export type Density = "compact" | "comfortable";
export type AmountStyle = "both" | "color" | "sign";

export interface AppPreferences {
  theme: Theme;
  density: Density;
  amountStyle: AmountStyle;
}

const DEFAULTS: AppPreferences = {
  theme: "light",
  density: "comfortable",
  amountStyle: "both",
};

const STORAGE_KEY = "tally.preferences";
```

The hook reads from `localStorage` on mount and writes on every change. Use `useState` initialised from `localStorage.getItem(STORAGE_KEY)` parsed as `AppPreferences` with fallback to `DEFAULTS`. Return `{ preferences, setTheme, setDensity, setAmountStyle }`.

Do not add tests for the hook itself — localStorage interaction is not valuable to unit-test. Test the formatter instead (Slice 2).

### App Integration

In `App.tsx`:
- Replace the direct `colors`/`typography` import usage with `usePreferences`.
- Apply `data-theme`, `data-density`, `data-amount-style` to the root div.
- Thread `amountStyle` down to `LedgerRegisterPanel` via a prop so the register can pass it to `formatAmount`.
- Expose `setTheme`, `setDensity`, `setAmountStyle` to the settings view.

### Settings UI

Add a "Display" section to the settings view (the existing settings activity). This section contains three controls:

**Theme toggle:**
```
○ Light   ● Dark
```
Radio group, no label needed beyond the section heading.

**Density toggle:**
```
○ Compact (36px rows)   ● Comfortable (48px rows)
```

**Amount style:**
```
● Both (colour + sign)   ○ Colour only   ○ Sign only
```

Use plain `<label><input type="radio" />` pattern — no custom component needed. Apply `.form-stack` wrapping for consistent spacing.

---

## Slice 4: Component CSS Polish

With the variable system in place, this slice upgrades the visual quality of interactive components.

### Buttons

All buttons currently have no consistent hover/focus/active states except within specific parent contexts. Define three button variants as CSS classes:

**`.btn-primary`** — accent fill:
```
background: var(--accent); color: #fff; border: 0; border-radius: 10px;
padding: var(--form-pad-y) 14px;
:hover → filter: brightness(1.08)
:active → filter: brightness(0.95)
:focus-visible → outline: 2px solid var(--accent); outline-offset: 2px
:disabled → opacity: 0.55; cursor: not-allowed
```

**`.btn-secondary`** — bordered:
```
background: var(--surface-input); border: 1px solid var(--border); border-radius: 10px;
padding: var(--form-pad-y) 14px;
:hover → background: var(--surface-hover)
:active → background: var(--surface-selected)
:focus-visible → outline: 2px solid var(--accent); outline-offset: 2px
:disabled → opacity: 0.55; cursor: not-allowed
```

**`.btn-ghost`** — no border, minimal fill:
```
background: transparent; border: 0; border-radius: 8px;
padding: var(--chip-pad-y) 8px;
:hover → background: var(--surface-hover)
:active → background: var(--surface-selected)
```

Apply `.btn-primary` to the primary action button in form panels (Post, Save, Confirm). Apply `.btn-secondary` to secondary action buttons (Cancel, Close, Edit, Advanced). Apply `.btn-ghost` to toolbar icon/label buttons (activity bar buttons, register tab controls, ledger chip row buttons).

Do NOT rename every existing button in the codebase in this slice. Focus on:
- `form-stack button` (already gets `.btn-primary` styling — update the rule)
- COA quick action buttons
- Register row action buttons (Edit, Delete, Save, Cancel)
- Register tab buttons

### Inputs and Selects

All `input[type=text]`, `input[type=date]`, `select`, `textarea` within the app receive consistent base styles:

```
background: var(--surface-input);
border: 1px solid var(--border);
border-radius: 10px;
padding: var(--form-pad-y) 12px;
color: var(--text);
:focus → outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent)
```

### Register Rows

```css
.register-row { min-height: var(--row-height); }
td { padding: var(--cell-pad-y) 0; }
.register-row:hover td { background: var(--surface-hover); }
.register-row.selected td { background: var(--surface-selected); }
```

Add a `.register-row.editing td` state for inline edit rows:
```
background: var(--accent-soft);
border-top: 1px solid var(--accent);
border-bottom: 1px solid var(--accent);
```

### Status Chips

Replace hardcoded colours with variables:

```css
.status-chip.open       { background: var(--status-open-bg);       color: var(--status-open-text); }
.status-chip.cleared    { background: var(--status-cleared-bg);    color: var(--status-cleared-text); }
.status-chip.reconciled { background: var(--status-reconciled-bg); color: var(--status-reconciled-text); }
```

### Ledger Chips (Status/Account Filter Buttons)

```css
.ledger-chip        { background: var(--surface-input); border-color: var(--border); color: var(--text); }
.ledger-chip:hover  { background: var(--surface-hover); }
.ledger-chip.active { background: var(--accent-warm); border-color: var(--accent-warm-border); color: var(--accent-warm-text); }
```

### Summary Cards and Balance Callouts

Replace the hardcoded `#dff2e6` / `#165a39` with `var(--status-reconciled-bg)` / `var(--status-reconciled-text)` for balanced states. Replace `#fff1cf` / `#8b5c12` warning states with `var(--accent-warm)` / `var(--accent-warm-text)`.

### Text Size and Weight

The register table body currently renders at the default body font size. Add:

```css
table { font-size: 13px; }
th    { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; }
```

For the register balance column, amounts should be `font-family: var(--mono-font); font-weight: 500`.

---

## Acceptance Criteria

Each slice must meet all of the following before merge:

1. `pnpm --filter @tally/web typecheck` passes.
2. `pnpm test` passes (all 1207 tests; new `formatAmount` tests added in Slice 2).
3. Manual: toggling each preference in the settings view visibly changes the UI immediately.
4. Manual: dark mode does not show any white flash or incomplete theme coverage (no hardcoded backgrounds escaping the variable system).
5. No regression in service-backed write flows.

---

## File Map

| File | Change |
|---|---|
| `packages/ui/src/tokens.ts` | Expand to export `lightTheme` and `darkTheme` objects; remove `colors` and `typography` named exports or mark deprecated |
| `apps/web/src/app/styles.css` | Add `:root`/`[data-theme]`/`[data-density]`/`[data-amount-style]` blocks; replace all hardcoded hex values; add `.btn-primary`, `.btn-secondary`, `.btn-ghost`; update `.amount-positive`/`.amount-negative` |
| `apps/web/src/app/use-preferences.ts` | New file: preferences hook with localStorage persistence |
| `apps/web/src/app/app-format.ts` | Add `formatAmount(value, formatCurrencyFn, style)` and `AmountStyle` type |
| `apps/web/src/app/app-format.test.ts` | Add `formatAmount` tests |
| `apps/web/src/app/App.tsx` | Remove `<style>` injection; import `usePreferences`; apply `data-*` attributes; thread `amountStyle` to register |
| `apps/web/src/app/LedgerRegisterPanel.tsx` | Replace `.numeric-positive`/`.numeric-negative` with `.amount-positive`/`.amount-negative`; use `formatAmount` for balance column |
