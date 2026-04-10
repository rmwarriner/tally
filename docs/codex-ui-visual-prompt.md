# Codex Prompt: UI Visual Design Pass

## Context

You are implementing a visual design pass for the `apps/web/` desktop shell. The full spec is at `docs/ui-visual-spec.md`. Read it before writing any code.

Also read before starting:
- `packages/ui/src/tokens.ts` — current token exports
- `apps/web/src/app/styles.css` — all ~1060 lines; understand every existing class before touching it
- `apps/web/src/app/App.tsx` — find the `<style>` injection block near the bottom (lines ~1188–1201)
- `apps/web/src/app/app-format.ts` — where `formatAmount` will be added
- `apps/web/src/app/app-format.test.ts` — existing formatter tests to extend
- `apps/web/src/app/LedgerRegisterPanel.tsx` — find `.numeric-positive`/`.numeric-negative` usage

## Project rules

- TypeScript throughout; 2-space indentation
- TDD: write the failing test before implementation for any logic changes (`formatAmount` requires tests first)
- Never add dependencies without checking with the user; all packages in this task use only what is already installed
- `pnpm ci:verify` must pass before the PR is opened
- Append a one-line completion entry to `docs/project-status.md` before opening the PR
- Open a PR using `.github/PULL_REQUEST_TEMPLATE.md` when all slices are complete

## Git setup

```bash
git checkout main && git pull
git checkout -b feat/ui-visual-pass
```

Commit after each slice with a clear message. Do not squash into one commit.

---

## Slice 1: CSS Variable Architecture

**Goal:** Replace runtime `<style>` injection in `App.tsx` with a CSS custom property system. Light and dark themes live in `styles.css`. App sets `data-theme` on the root element.

### Step 1 — Expand `packages/ui/src/tokens.ts`

Replace the current `colors` and `typography` exports with:

```typescript
export const lightTheme = {
  bg: "#f0ece3",
  surface: "#fffdf7",
  surfaceAlt: "#ece6d9",
  surfaceInput: "#fffaf1",
  surfaceHover: "rgba(255, 247, 232, 0.80)",
  surfaceSelected: "rgba(255, 241, 207, 0.75)",
  surfaceWarm: "rgba(255, 247, 232, 0.50)",
  overlay: "rgba(31, 29, 26, 0.25)",
  text: "#1f2321",
  textMuted: "#5f675f",
  accent: "#006b5f",
  accentSoft: "#d8efe8",
  accentWarm: "#fff1cf",
  accentWarmText: "#8b5c12",
  accentWarmBorder: "rgba(181, 129, 40, 0.42)",
  border: "#c9c1b4",
  warning: "#ad5f00",
  danger: "#8f2d1f",
  success: "#165a39",
  statusOpenBg: "#f3ebdb",
  statusOpenText: "#6f5a36",
  statusClearedBg: "#fff1cf",
  statusClearedText: "#8b5c12",
  statusReconciledBg: "rgba(232, 245, 233, 0.95)",
  statusReconciledText: "#2f6f37",
  amountPositive: "#006b5f",
  amountNegative: "#8f2d1f",
  activityBarBg: "rgba(31, 35, 33, 0.94)",
  activityBarText: "#fdf8ef",
  activityBarButtonActive: "rgba(255, 255, 255, 0.20)",
  dotOnline: "#66c85f",
  dotOffline: "#f2b340",
  dotUnknown: "#8b8d89",
  gradientTop: "#efe7d7",
  gradientBottom: "#e6dece",
  gradientRadial: "#fff7d9",
  displayFont: '"IBM Plex Sans", "Avenir Next", sans-serif',
  monoFont: '"IBM Plex Mono", "SFMono-Regular", monospace',
} as const;

export const darkTheme = {
  bg: "#1a1c1b",
  surface: "#232825",
  surfaceAlt: "#2b302d",
  surfaceInput: "#2b302d",
  surfaceHover: "rgba(255, 200, 100, 0.055)",
  surfaceSelected: "rgba(255, 200, 100, 0.10)",
  surfaceWarm: "rgba(255, 200, 100, 0.04)",
  overlay: "rgba(0, 0, 0, 0.50)",
  text: "#e6e2da",
  textMuted: "#8a9088",
  accent: "#4dc4b0",
  accentSoft: "#1a3530",
  accentWarm: "#2a2210",
  accentWarmText: "#c8903a",
  accentWarmBorder: "rgba(181, 129, 40, 0.32)",
  border: "#3c4240",
  warning: "#e8a24a",
  danger: "#e87060",
  success: "#7ac880",
  statusOpenBg: "#2d2920",
  statusOpenText: "#b8a880",
  statusClearedBg: "#2a2210",
  statusClearedText: "#c8903a",
  statusReconciledBg: "rgba(40, 80, 45, 0.45)",
  statusReconciledText: "#7ac880",
  amountPositive: "#4dc4b0",
  amountNegative: "#e87060",
  activityBarBg: "#141716",
  activityBarText: "#e8e4dd",
  activityBarButtonActive: "rgba(255, 255, 255, 0.15)",
  dotOnline: "#66c85f",
  dotOffline: "#f2b340",
  dotUnknown: "#6a6d69",
  gradientTop: "#1a1c1b",
  gradientBottom: "#1a1c1b",
  gradientRadial: "#1f2220",
  displayFont: '"IBM Plex Sans", "Avenir Next", sans-serif',
  monoFont: '"IBM Plex Mono", "SFMono-Regular", monospace',
} as const;

// Keep these for any existing callers during the transition; remove in a follow-up.
export const colors = {
  background: lightTheme.bg,
  panel: lightTheme.surface,
  panelAlt: lightTheme.surfaceAlt,
  text: lightTheme.text,
  textMuted: lightTheme.textMuted,
  accent: lightTheme.accent,
  accentSoft: lightTheme.accentSoft,
  border: lightTheme.border,
  warning: lightTheme.warning,
  danger: lightTheme.danger,
} as const;

export const typography = {
  display: lightTheme.displayFont,
  mono: lightTheme.monoFont,
} as const;
```

### Step 2 — Add CSS variable blocks to `styles.css`

At the very top of `styles.css`, before the `* { box-sizing: border-box; }` reset, insert:

```css
:root,
[data-theme="light"] {
  --bg: #f0ece3;
  --surface: #fffdf7;
  --surface-alt: #ece6d9;
  --surface-input: #fffaf1;
  --surface-hover: rgba(255, 247, 232, 0.80);
  --surface-selected: rgba(255, 241, 207, 0.75);
  --surface-warm: rgba(255, 247, 232, 0.50);
  --overlay: rgba(31, 29, 26, 0.25);
  --text: #1f2321;
  --text-muted: #5f675f;
  --accent: #006b5f;
  --accent-soft: #d8efe8;
  --accent-warm: #fff1cf;
  --accent-warm-text: #8b5c12;
  --accent-warm-border: rgba(181, 129, 40, 0.42);
  --border: #c9c1b4;
  --warning: #ad5f00;
  --danger: #8f2d1f;
  --success: #165a39;
  --status-open-bg: #f3ebdb;
  --status-open-text: #6f5a36;
  --status-cleared-bg: #fff1cf;
  --status-cleared-text: #8b5c12;
  --status-reconciled-bg: rgba(232, 245, 233, 0.95);
  --status-reconciled-text: #2f6f37;
  --amount-positive: #006b5f;
  --amount-negative: #8f2d1f;
  --activity-bar-bg: rgba(31, 35, 33, 0.94);
  --activity-bar-text: #fdf8ef;
  --activity-bar-button-active: rgba(255, 255, 255, 0.20);
  --dot-online: #66c85f;
  --dot-offline: #f2b340;
  --dot-unknown: #8b8d89;
  --gradient-top: #efe7d7;
  --gradient-bottom: #e6dece;
  --gradient-radial: #fff7d9;
  --display-font: "IBM Plex Sans", "Avenir Next", sans-serif;
  --mono-font: "IBM Plex Mono", "SFMono-Regular", monospace;
}

[data-theme="dark"] {
  --bg: #1a1c1b;
  --surface: #232825;
  --surface-alt: #2b302d;
  --surface-input: #2b302d;
  --surface-hover: rgba(255, 200, 100, 0.055);
  --surface-selected: rgba(255, 200, 100, 0.10);
  --surface-warm: rgba(255, 200, 100, 0.04);
  --overlay: rgba(0, 0, 0, 0.50);
  --text: #e6e2da;
  --text-muted: #8a9088;
  --accent: #4dc4b0;
  --accent-soft: #1a3530;
  --accent-warm: #2a2210;
  --accent-warm-text: #c8903a;
  --accent-warm-border: rgba(181, 129, 40, 0.32);
  --border: #3c4240;
  --warning: #e8a24a;
  --danger: #e87060;
  --success: #7ac880;
  --status-open-bg: #2d2920;
  --status-open-text: #b8a880;
  --status-cleared-bg: #2a2210;
  --status-cleared-text: #c8903a;
  --status-reconciled-bg: rgba(40, 80, 45, 0.45);
  --status-reconciled-text: #7ac880;
  --amount-positive: #4dc4b0;
  --amount-negative: #e87060;
  --activity-bar-bg: #141716;
  --activity-bar-text: #e8e4dd;
  --activity-bar-button-active: rgba(255, 255, 255, 0.15);
  --dot-online: #66c85f;
  --dot-offline: #f2b340;
  --dot-unknown: #6a6d69;
  --gradient-top: #1a1c1b;
  --gradient-bottom: #1a1c1b;
  --gradient-radial: #1f2220;
}
```

### Step 3 — Replace hardcoded values in `styles.css`

Go through all ~1060 lines and replace every hardcoded hex colour and rgba value with the appropriate CSS variable. The mapping is:

| Hardcoded value | Replace with |
|---|---|
| `#f3f0e7`, `#efe7d7`, `#e6dece` | `var(--bg)` or gradient vars |
| `#fffdf7`, `#fffaf1`, `rgba(255, 253, 247, …)` | `var(--surface)` or `var(--surface-input)` |
| `#ece6d9` | `var(--surface-alt)` |
| `rgba(255, 247, 232, 0.8)` (row hover) | `var(--surface-hover)` |
| `rgba(255, 241, 207, 0.75)` (row selected) | `var(--surface-selected)` |
| `#fff7e8`, `rgba(255, 247, 232, 0.50)` (warm tints) | `var(--surface-warm)` |
| `#1f2321` | `var(--text)` |
| `#5f675f` | `var(--text-muted)` |
| `#006b5f` | `var(--accent)` |
| `#d8efe8` | `var(--accent-soft)` |
| `#fff1cf` (warm bg) | `var(--accent-warm)` |
| `#8b5c12` (warm text) | `var(--accent-warm-text)` |
| `rgba(181, 129, 40, …)` (warm border) | `var(--accent-warm-border)` |
| `#c9c1b4`, `rgba(201, 193, 180, …)` | `var(--border)` |
| `#8f2d1f` (error text) | `var(--danger)` |
| `#ad5f00` | `var(--warning)` |
| `#165a39` | `var(--success)` |
| `#f3ebdb` / `#6f5a36` (open chip) | `var(--status-open-bg)` / `var(--status-open-text)` |
| `#fff1cf` / `#8b5c12` (cleared chip) | `var(--status-cleared-bg)` / `var(--status-cleared-text)` |
| `rgba(232, 245, 233…)` / `#2f6f37` (reconciled) | `var(--status-reconciled-bg)` / `var(--status-reconciled-text)` |
| `rgba(31, 35, 33, 0.94)` (activity bar) | `var(--activity-bar-bg)` |
| `#fdf8ef` (activity bar text) | `var(--activity-bar-text)` |
| `rgba(255, 255, 255, 0.20)` (activity button active) | `var(--activity-bar-button-active)` |
| `#66c85f` (dot online) | `var(--dot-online)` |
| `#f2b340` (dot offline) | `var(--dot-offline)` |
| `#8b8d89` (dot unknown) | `var(--dot-unknown)` |
| `#1f7a46` (numeric positive) | `var(--amount-positive)` |
| `#8f2d1f` (numeric negative) | `var(--amount-negative)` |
| `rgba(31, 29, 26, 0.25)` (overlay) | `var(--overlay)` |

Also update the `body` background rule:
```css
body {
  background:
    radial-gradient(circle at top left, var(--gradient-radial) 0, transparent 28%),
    linear-gradient(180deg, var(--gradient-top) 0%, var(--gradient-bottom) 100%);
  color: var(--text);
  font-family: var(--display-font);
}
```

Update `html` or the shell root to also carry `background-color: var(--bg)` so dark mode doesn't show white on overscroll.

Update `.shell-activity-bar`, `.shell-activity-button.active`, `.shell-activity-settings` to use `--activity-bar-*` variables.

### Step 4 — Update `App.tsx`

Remove the `<style>` injection block (lines ~1188–1201) entirely. Remove the `colors` and `typography` imports from `@tally/ui` at the top of `App.tsx`. Add `data-theme="light"` as a static attribute for now (Slice 3 wires it to preferences).

Commit: `feat: CSS variable architecture and light/dark theme tokens`

---

## Slice 2: Density and Amount Style Systems

### Step 1 — Density variables in `styles.css`

After the theme blocks, add:

```css
:root,
[data-density="comfortable"] {
  --row-height: 48px;
  --cell-pad-y: 11px;
  --chip-pad-y: 5px;
  --form-pad-y: 10px;
  --gap-sm: 8px;
  --gap-md: 14px;
}

[data-density="compact"] {
  --row-height: 36px;
  --cell-pad-y: 7px;
  --chip-pad-y: 3px;
  --form-pad-y: 8px;
  --gap-sm: 6px;
  --gap-md: 10px;
}
```

Replace the following hardcoded padding values in `styles.css` with density variables:
- `th`, `td` → `padding: var(--cell-pad-y) 0`
- `.ledger-chip` → `padding: var(--chip-pad-y) 10px`
- `.topbar-pill`, `.topbar-period-input` → `padding: var(--chip-pad-y) 10px`
- `.form-stack input`, `.form-stack select`, `.form-stack textarea`, `.form-stack button` → `padding: var(--form-pad-y) 12px`
- `.account-search-option` → `padding: var(--form-pad-y) 12px`

Add to `.register-row`:
```css
.register-row { min-height: var(--row-height); }
```

Add `data-density="comfortable"` as a static attribute to the root div in `App.tsx` for now.

### Step 2 — Amount style variables and CSS classes in `styles.css`

After the density blocks, add:

```css
[data-amount-style="sign"] {
  --amount-positive: var(--text);
  --amount-negative: var(--text);
}
```

Replace the existing `.numeric-positive` and `.numeric-negative` rules at the bottom of `styles.css`:

```css
.amount-positive {
  color: var(--amount-positive);
  font-family: var(--mono-font);
  font-weight: 500;
}

.amount-negative {
  color: var(--amount-negative);
  font-family: var(--mono-font);
  font-weight: 500;
}

.amount-neutral {
  color: var(--text);
  font-family: var(--mono-font);
  font-weight: 500;
}
```

Keep `.numeric-positive` and `.numeric-negative` as aliases pointing to the same rules until all call sites are updated.

### Step 3 — `formatAmount` in `app-format.ts`

**Write the test first** in `app-format.test.ts`:

```typescript
describe("formatAmount", () => {
  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  it("both: adds + prefix for positive", () => {
    expect(formatAmount(50, fmt, "both")).toBe("+$50.00");
  });
  it("both: adds - prefix for negative", () => {
    expect(formatAmount(-50, fmt, "both")).toBe("-$50.00");
  });
  it("both: zero has no prefix", () => {
    expect(formatAmount(0, fmt, "both")).toBe("$0.00");
  });
  it("color: no + prefix for positive", () => {
    expect(formatAmount(50, fmt, "color")).toBe("$50.00");
  });
  it("color: - prefix for negative", () => {
    expect(formatAmount(-50, fmt, "color")).toBe("-$50.00");
  });
  it("sign: + prefix for positive", () => {
    expect(formatAmount(50, fmt, "sign")).toBe("+$50.00");
  });
  it("sign: - prefix for negative", () => {
    expect(formatAmount(-50, fmt, "sign")).toBe("-$50.00");
  });
  it("sign: zero has no prefix", () => {
    expect(formatAmount(0, fmt, "sign")).toBe("$0.00");
  });
});
```

Then implement in `app-format.ts`:

```typescript
export type AmountStyle = "both" | "color" | "sign";

export function formatAmount(
  value: number,
  formatCurrencyFn: (n: number) => string,
  style: AmountStyle,
): string {
  const formatted = formatCurrencyFn(Math.abs(value));
  if (value > 0 && (style === "both" || style === "sign")) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}
```

### Step 4 — Update `LedgerRegisterPanel.tsx`

Replace `.numeric-positive` / `.numeric-negative` className usage with `.amount-positive` / `.amount-negative`. Add `amountStyle: AmountStyle` to `LedgerRegisterPanelProps`. Use `formatAmount` for the running balance cell. The CSS class (`.amount-positive` vs `.amount-negative`) is determined by whether the balance is positive or negative.

Add `data-amount-style="both"` as a static attribute to the root div in `App.tsx` for now.

Commit: `feat: density and amount style systems`

---

## Slice 3: Preferences Hook and Settings UI

### Step 1 — Create `use-preferences.ts`

```typescript
// apps/web/src/app/use-preferences.ts
import { useState } from "react";

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

function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      theme: parsed.theme === "dark" ? "dark" : "light",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      amountStyle:
        parsed.amountStyle === "color" || parsed.amountStyle === "sign"
          ? parsed.amountStyle
          : "both",
    };
  } catch {
    return DEFAULTS;
  }
}

function savePreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable — proceed without persistence
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(loadPreferences);

  function update(next: AppPreferences) {
    setPreferences(next);
    savePreferences(next);
  }

  return {
    preferences,
    setTheme: (theme: Theme) => update({ ...preferences, theme }),
    setDensity: (density: Density) => update({ ...preferences, density }),
    setAmountStyle: (amountStyle: AmountStyle) => update({ ...preferences, amountStyle }),
  };
}
```

### Step 2 — Wire `App.tsx`

- Import `usePreferences` and call it at the top of the `App` component.
- Replace the static `data-theme="light"`, `data-density="comfortable"`, `data-amount-style="both"` with the values from preferences:
  ```tsx
  <div
    className="workspace"
    data-theme={preferences.theme}
    data-density={preferences.density}
    data-amount-style={preferences.amountStyle}
  >
  ```
- Pass `amountStyle={preferences.amountStyle}` to `LedgerRegisterPanel` (add the prop to its props interface).
- Pass `setTheme`, `setDensity`, `setAmountStyle` down to the settings view.

### Step 3 — Settings UI

In the settings view component (find it via `bookViews` and `getBookViewDefinition` in `shell.ts`, then follow to the render path in `NonLedgerMainPanels.tsx`), add a "Display" section:

```tsx
<div className="inspector-section">
  <h3>Display</h3>
  <div className="form-stack">
    <fieldset>
      <legend className="eyebrow">Theme</legend>
      <div className="ledger-chip-row">
        {(["light", "dark"] as const).map((t) => (
          <label key={t} className={`ledger-chip${preferences.theme === t ? " active" : ""}`}>
            <input
              type="radio"
              name="theme"
              value={t}
              checked={preferences.theme === t}
              onChange={() => setTheme(t)}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </label>
        ))}
      </div>
    </fieldset>
    <fieldset>
      <legend className="eyebrow">Register density</legend>
      <div className="ledger-chip-row">
        {(["comfortable", "compact"] as const).map((d) => (
          <label key={d} className={`ledger-chip${preferences.density === d ? " active" : ""}`}>
            <input
              type="radio"
              name="density"
              value={d}
              checked={preferences.density === d}
              onChange={() => setDensity(d)}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </label>
        ))}
      </div>
    </fieldset>
    <fieldset>
      <legend className="eyebrow">Amount display</legend>
      <div className="ledger-chip-row">
        {([
          { value: "both", label: "Colour + sign" },
          { value: "color", label: "Colour only" },
          { value: "sign", label: "Sign only" },
        ] as const).map(({ value, label }) => (
          <label key={value} className={`ledger-chip${preferences.amountStyle === value ? " active" : ""}`}>
            <input
              type="radio"
              name="amountStyle"
              value={value}
              checked={preferences.amountStyle === value}
              onChange={() => setAmountStyle(value)}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  </div>
</div>
```

Commit: `feat: preferences hook and settings display controls`

---

## Slice 4: Component CSS Polish

### Step 1 — Button variants

Add to `styles.css`:

```css
/* Primary button */
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 10px;
  padding: var(--form-pad-y) 14px;
  cursor: pointer;
  transition: filter 120ms ease;
}
.btn-primary:hover  { filter: brightness(1.08); }
.btn-primary:active { filter: brightness(0.95); }
.btn-primary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

/* Secondary button */
.btn-secondary {
  background: var(--surface-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: var(--form-pad-y) 14px;
  color: var(--text);
  cursor: pointer;
  transition: background 100ms ease;
}
.btn-secondary:hover  { background: var(--surface-hover); }
.btn-secondary:active { background: var(--surface-selected); }
.btn-secondary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }

/* Ghost button */
.btn-ghost {
  background: transparent;
  border: 0;
  border-radius: 8px;
  padding: var(--chip-pad-y) 8px;
  color: var(--text);
  cursor: pointer;
}
.btn-ghost:hover  { background: var(--surface-hover); }
.btn-ghost:active { background: var(--surface-selected); }
.btn-ghost:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

Apply the classes:
- `.form-stack button` (primary form submit) → also add `.btn-primary` to those buttons in the JSX, OR update the `.form-stack button` CSS rule to mirror `.btn-primary`'s hover/focus/active states
- Register row Save button → `btn-primary`
- Register row Cancel, Edit, Advanced buttons → `btn-secondary`
- Register row Delete button → `btn-secondary` (danger styling can come later)
- COA quick action buttons → `btn-secondary`
- Activity bar buttons already have their own rules (leave them)

### Step 2 — Input focus ring

In `styles.css`, add a global input focus rule:

```css
input:not([type="radio"]):not([type="checkbox"]):not([type="range"]),
select,
textarea {
  background: var(--surface-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
}

input:not([type="radio"]):not([type="checkbox"]):focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}
```

Remove any duplicate focus rules already in `.ledger-filter input:focus`.

### Step 3 — Register table polish

```css
table { font-size: 13px; line-height: 1.4; }
th    { font-size: 11px; }

.register-row.editing td {
  background: var(--accent-soft);
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
```

Add `.editing` class in `LedgerRegisterPanel.tsx` to the `<tr>` when `isEditingRow` is true:
```tsx
className={[
  "register-row",
  props.selectedLedgerTransactionId === transaction.id ? "selected" : "",
  isEditingRow ? "editing" : "",
].filter(Boolean).join(" ")}
```

### Step 4 — Status chips

Replace existing hardcoded colour rules for `.status-chip.*`:

```css
.status-chip.open       { background: var(--status-open-bg);        color: var(--status-open-text); }
.status-chip.cleared    { background: var(--status-cleared-bg);     color: var(--status-cleared-text); }
.status-chip.reconciled { background: var(--status-reconciled-bg);  color: var(--status-reconciled-text); }
.status-chip.warning    { background: var(--status-cleared-bg);     color: var(--status-cleared-text); }
```

### Step 5 — Summary cards and balance callouts

Replace:
- `.summary-card.balanced` → use `--status-reconciled-bg` / `--status-reconciled-text`
- `.summary-card.warning` → use `--accent-warm` / `--accent-warm-text`
- `.editor-balance-callout.balanced` → use `--status-reconciled-bg` with border `--status-reconciled-text` at 0.35 alpha
- `.editor-balance-callout.warning` → use `--accent-warm` with border `--accent-warm-border`
- `.reconciliation-note` background → `var(--surface-alt)`

Commit: `feat: component CSS polish (buttons, inputs, register rows, chips)`

---

## Final Verification

Before opening the PR:

```bash
pnpm --filter @tally/web typecheck
pnpm test
pnpm ci:verify
```

Manual checks:
1. Open settings → toggle theme Light ↔ Dark. Entire shell updates. No white backgrounds visible in dark mode.
2. Toggle density Comfortable ↔ Compact. Register rows visibly change height.
3. Toggle amount style through all three options. Register balance column changes colour and sign behavior.
4. Preferences survive page reload (localStorage).
5. Inline row edit turns the row teal-tinted.
6. Status chips render correctly in both themes.

Append to `docs/project-status.md` under Client Integration:
```
- visual design pass: CSS variable architecture, light/dark theme, compact/comfortable density, amount display style (both/color/sign), component polish (buttons, inputs, register rows, chips), preferences persistence
```

Then open the PR:
```bash
gh pr create --title "feat: UI visual design pass" --body "$(cat .github/PULL_REQUEST_TEMPLATE.md)"
```
Fill out every section of the PR template.
