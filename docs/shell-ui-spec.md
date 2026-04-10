# Tally Shell UI — Implementation Spec

Primary handoff for `apps/web/` shell rebuild. Execute slices in order; each slice is independently mergeable and testable.

## Mental Model (read once, apply everywhere)

The shell is a **digital ledger book**. Tabs are account dividers. The register is the ruled pages. The COA sidebar is the spine — always visible regardless of active section. The activity bar switches binder sections (ledger, budget, reports, settings). The bottom panel is the front pocket (global appliance operations only). The status bar floats near edges like Obsidian's — not a full-width bar.

The **general ledger is the master**. Selecting an account focuses a slice of it. The period selector is global application state — all views share one `currentPeriod`. Text search is a further filter but changes register semantics (see Slice 3).

## Relationship To Native Desktop (Tauri)

**`apps/web` is always the UI layer.** Tauri is a native wrapper that hosts a webview — it renders `apps/web` inside a native window. The two are not alternatives; they are layered.

This spec targets `apps/web` only. Do not introduce any Tauri APIs, `@tauri-apps/*` imports, or IPC calls into `apps/web`. The shell must remain fully functional in a plain browser.

The Tauri wrapper (`tally-desktop/`) is a separate, later spike that will package the finished `apps/web` shell into a native app and add OS-level concerns: file dialogs, menu bar, tray, and local API process management. None of that work belongs here.

When a design decision feels like "this would be better as a native feature" (e.g. a native file picker), note it in a comment and implement the browser fallback. The Tauri layer will override it later.

## Baseline

Package: `apps/web/` (`@tally/web`)  
Stack: React, Vite, TypeScript  
Styles: plain CSS (`styles.css`) — no CSS framework  
Token/UI design: `@tally/ui` (colors, typography tokens)

## What To Preserve Unchanged

Do not modify these files unless a slice explicitly lists them:

- `shell.ts` — business logic, `createLedgerBookModel`, account search, view definitions
- `ledger-state.ts` — inline edit state, keyboard navigation
- `LedgerRegisterPanel.tsx` — register UI (Slices 3 and 4 touch it)
- `LedgerTransactionEditorPanel.tsx` — transaction detail panel
- `LedgerMainPanels.tsx` — register + tab bar composition
- `LedgerOperationsPanels.tsx` — operation forms
- `NonLedgerMainPanels.tsx` — budget/envelope/import panels
- `use-book-runtime.ts` — already accepts dynamic range, no changes needed
- `api.ts` — no changes
- `app-format.ts` — Slice 2 adds one function, nothing removed
- `transaction-editor.ts` — no changes

## Current Shell State (context for Slice 1)

`App.tsx` is monolithic (~500 lines). Current CSS grid:

```
grid-template-columns: 72px 280px minmax(0, 1fr) 320px
```

No topbar. No status bar. The activity bar and sidebar content live inline in `App.tsx`. The COA sidebar (`LedgerSidebar.tsx`) only renders in ledger mode. Period is hardcoded as `APRIL_RANGE = { from: "2026-04-01", to: "2026-04-30" }` in `app-constants.ts`.

`LedgerRegisterTabState` currently holds per-tab `ledgerRange`. After Slice 2 this field is removed — period is global.

---

## Slice 1 — Shell Chrome and Layout

**Goal:** Replace the current layout with the target shell structure. No functional or state changes — all existing behaviour must work after this slice.

### New files

#### `apps/web/src/app/ShellTopbar.tsx`

```tsx
interface ShellTopbarProps {
  currentPeriodLabel: string;       // e.g. "April 2026" (display only in Slice 1)
  onPeriodClick: () => void;        // no-op in Slice 1, wired in Slice 2
  onCommandPaletteClick: () => void;
}
```

Renders:
- Left: window-control dots (decorative, 3 circles: red/amber/green)
- Centre: app name "tally" (muted)
- Right group: period pill → `currentPeriodLabel` + command palette pill → "> cmd..."

Use `role="button"` + `tabIndex={0}` on pills. No form elements in Slice 1.

#### `apps/web/src/app/ShellActivityBar.tsx`

```tsx
interface ShellActivityBarProps {
  activeView: BookView;
  onViewChange: (view: BookView) => void;
}
```

Renders one icon button per `bookViews` entry from `shell.ts`. Use `shortLabel` as the visible text. Active view gets a distinct background. Settings/profile icon pinned to bottom.

#### `apps/web/src/app/CoaSidebar.tsx`

```tsx
interface CoaSidebarProps {
  accounts: FinanceBookDocument["accounts"];
  activeView: BookView;
  onAccountSelect: (accountId: string | null) => void;
  selectedAccountId: string | null;
}
```

Renders:
- Quick action row at top (static placeholder buttons in Slice 1: "＋ Txn" and "＋ Acct")
- COA tree grouped by account type (asset, liability, income, expense, equity)
- Each account is a button; selected account gets highlight
- This component renders regardless of `activeView` — it is always visible

**Delete `LedgerSidebar.tsx`** after wiring `CoaSidebar.tsx` into `App.tsx`. The `ShellSidePanels.tsx` sidebar path that currently renders `LedgerSidebar` should be replaced by `CoaSidebar`.

#### `apps/web/src/app/ShellStatusBar.tsx`

```tsx
interface ShellStatusBarProps {
  apiStatus: "online" | "offline" | "unknown";
  statusMessage: string | null;   // e.g. "47 transactions · balance $7,108.81"
}
```

Renders two floating nodes — not a full-width bar:
- Bottom-left: API status dot (green/amber/grey) + label "online" / "offline"
- Bottom-right: `statusMessage` text (muted when null)

CSS: `position: fixed; bottom: 0;` for each node independently. No background bar spanning the full width.

### Modify `App.tsx`

Replace the shell layout structure:

```
<ShellTopbar .../>
<div className="workspace">
  <ShellActivityBar .../>
  <CoaSidebar .../>
  <main>  {/* LedgerMainPanels or NonLedgerMainPanels */}
  <aside>  {/* inspector / detail panel */}
</div>
<ShellStatusBar .../>
```

Pass `currentPeriodLabel` as the formatted string of `APRIL_RANGE` (static in Slice 1).  
Pass `apiStatus` derived from `error` state: null error and not loading → "online", error → "offline", loading → "unknown".

### Modify `styles.css`

Replace `.workspace` grid:

```css
.workspace {
  display: grid;
  grid-template-rows: 36px 1fr;
  grid-template-columns: 46px 220px minmax(0, 1fr) 300px;
  height: 100vh;
}
```

Remove old `.activity-bar` full styles (moved to `ShellActivityBar.tsx` inline or scoped class).  
Add `.shell-status-left` and `.shell-status-right` for the two fixed status nodes.

### Acceptance criteria

- `pnpm --filter @tally/web typecheck` passes
- All existing ledger and non-ledger flows work (no regressions)
- `LedgerSidebar.tsx` is deleted
- COA sidebar visible when switching to budget/reports/automations views
- Status bar does not span full width

---

## Slice 2 — Global Period State

**Goal:** Make `currentPeriod` global application state. The topbar period pill controls it. All views share it.

### Add to `app-format.ts`

```ts
/**
 * Parses user period input into a date range.
 * Accepts: "2026-04", "April 2026", "apr 2026", "2026" (full year).
 * Returns null if unparseable.
 */
export function parsePeriodExpression(text: string): { from: string; to: string } | null
```

Implementation: normalise input, detect year-only vs month-year, return ISO date range strings. Use no external libraries — plain string/Date arithmetic.

### Modify `App.tsx`

1. Add top-level state:
   ```ts
   const [currentPeriod, setCurrentPeriod] = useState(APRIL_RANGE);
   const [isPeriodInputOpen, setIsPeriodInputOpen] = useState(false);
   ```

2. Remove `ledgerRange` from `LedgerRegisterTabState` — tabs no longer own the period.

3. Wire `currentPeriod` to `useBookRuntime` (already accepts `range`):
   ```ts
   useBookRuntime({ range: currentPeriod, bookId: BOOK_ID })
   ```

4. Wire `currentPeriod` to `createLedgerBookModel` (`rangeStart` / `rangeEnd`).

5. Format `currentPeriodLabel` from `currentPeriod.from`:
   ```ts
   // "2026-04-01" → "April 2026"
   const currentPeriodLabel = formatPeriodLabel(currentPeriod.from);
   ```
   Add `formatPeriodLabel(isoDate: string): string` to `app-format.ts`.

### Modify `ShellTopbar.tsx`

When `isPeriodInputOpen` is true, replace the period pill with a text input:
- Placeholder: "e.g. April 2026 or 2026-04"
- On Enter or blur: call `parsePeriodExpression`, update `currentPeriod` if valid, close input
- On Escape: close input without change
- Auto-focus when opened

```tsx
interface ShellTopbarProps {
  currentPeriodLabel: string;
  isPeriodInputOpen: boolean;
  onPeriodClick: () => void;
  onPeriodSubmit: (text: string) => void;
  onPeriodCancel: () => void;
  onCommandPaletteClick: () => void;
}
```

### Acceptance criteria

- Typing "March 2026" in the period pill reloads the register for that month
- Typing "2026" shows the full year range
- Invalid input closes the pill without changing the period
- `pnpm --filter @tally/web typecheck` passes
- No per-tab `ledgerRange` field remains in `LedgerRegisterTabState`

---

## Slice 3 — Register Balance Modes

**Goal:** The balance column shows a running balance on complete slices and disappears on filtered slices. The status bar reflects the current mode.

### Modify `shell.ts`

Extend `LedgerBookModel`:

```ts
export interface LedgerBookModel {
  // ... existing fields ...
  isFiltered: boolean;           // true when searchText has tokens
  openingBalance: number;        // sum of account postings before rangeStart (0 if no account selected or no rangeStart)
  totalCount: number;            // total transactions for account before text filter
}
```

Extend `createLedgerBookModel`:

- `isFiltered`: `searchTokens.length > 0`
- `totalCount`: count of transactions passing account + period filters before text filter
- `openingBalance`: when `selectedAccountId` and `rangeStart` are set, sum `posting.amount.quantity` for all postings to `selectedAccountId` where `transaction.occurredOn < rangeStart`. Otherwise 0.

### Modify `LedgerRegisterPanel.tsx`

Accept two additional props:

```tsx
isFiltered: boolean;
openingBalance: number;
totalCount: number;
```

**Complete slice** (`!isFiltered`):
- Add "Balance" column header
- Compute running balance per row: `openingBalance + cumulative amounts up to and including this row`
- Display as formatted currency, coloured by sign

**Filtered slice** (`isFiltered`):
- Remove "Balance" column entirely
- Add a "showing N of M" note below the register (muted text)

### Modify `ShellStatusBar.tsx`

Add `registerStatus` prop:

```tsx
interface ShellStatusBarProps {
  apiStatus: "online" | "offline" | "unknown";
  registerStatus: string | null;
  // e.g. "47 transactions · balance $7,108.81"
  // or   "showing 4 of 47 · filtered total −$297.69"
}
```

Compute `registerStatus` in `App.tsx`:

```ts
const registerStatus = ledgerBook
  ? ledgerBook.isFiltered
    ? `showing ${ledgerBook.filteredTransactions.length} of ${ledgerBook.totalCount} · filtered total ${formatCurrency(filteredTotal)}`
    : `${ledgerBook.filteredTransactions.length} transactions · balance ${formatCurrency(runningBalance)}`
  : null;
```

Where `filteredTotal` = sum of account-side amounts on filtered rows, and `runningBalance` = `openingBalance` + sum of all account-side amounts in period.

### Acceptance criteria

- With no search text: balance column present, status bar shows total count + balance
- With search text active: balance column absent, status bar shows "showing N of M · filtered total"
- `pnpm --filter @tally/web typecheck` passes
- Existing inline edit and keyboard nav behaviour unchanged

---

## Slice 4 — COA Sidebar Contextual Actions

**Goal:** Quick action buttons at top of `CoaSidebar` are contextual to tree selection.

### Modify `CoaSidebar.tsx`

Add props:

```tsx
interface CoaSidebarProps {
  accounts: FinanceBookDocument["accounts"];
  activeView: BookView;
  onAccountSelect: (accountId: string | null) => void;
  onAddTransaction: () => void;    // open transaction editor for selected account
  onNewAccount: () => void;        // open new account form
  onReconcile: () => void;         // open reconciliation for selected account
  selectedAccountId: string | null;
}
```

Quick action row logic:

- **No account selected**: render "＋ Account" button (calls `onNewAccount`)
- **Account selected**: render "＋ Txn" (calls `onAddTransaction`) + "Reconcile" (calls `onReconcile`) + "＋ Sub-account" (calls `onNewAccount` — reuse, context is clear from selection)

Buttons are compact icon-label pairs. No tooltips required in this slice.

### Modify `App.tsx`

Wire the three callbacks to the existing mutation/navigation handlers already present in `App.tsx` for transaction creation, account creation, and reconciliation flow entry.

### Acceptance criteria

- No account selected: only "＋ Account" visible in action row
- Account selected: "＋ Txn", "Reconcile", "＋ Sub-account" visible
- Each button triggers the correct existing flow
- `pnpm --filter @tally/web typecheck` passes

---

## Acceptance Criteria (all slices)

Before any slice is marked done:

1. `pnpm --filter @tally/web typecheck` passes
2. `pnpm test` passes (no new failures)
3. Manual smoke: load dev app, navigate between activity views, open and edit a transaction, verify register renders
4. No console errors on load

## File Change Summary

| File | Slice | Action |
|------|-------|--------|
| `ShellTopbar.tsx` | 1, 2 | Create |
| `ShellActivityBar.tsx` | 1 | Create |
| `CoaSidebar.tsx` | 1, 4 | Create |
| `ShellStatusBar.tsx` | 1, 3 | Create |
| `LedgerSidebar.tsx` | 1 | Delete |
| `App.tsx` | 1, 2, 3, 4 | Modify |
| `styles.css` | 1 | Modify |
| `app-format.ts` | 2 | Add functions |
| `shell.ts` | 3 | Extend model |
| `LedgerRegisterPanel.tsx` | 3 | Add balance modes |
| `CoaSidebar.tsx` | 4 | Extend props |
