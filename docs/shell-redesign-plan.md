# Shell Redesign Plan

Last reviewed: 2026-04-11

## Design Direction

**Inspiration:** Zed IDE (minimal chrome, content-as-UI, near-invisible panel dividers, icon-only navigation) combined with Obsidian (warm document surface, strong typographic hierarchy, navigation that feels like moving through a notebook rather than switching dashboard tabs).

**Primary design target:** Gruvbox dark theme.

**Principles:**
- The register is the product. It should be the landing surface and the primary visual statement.
- Chrome recedes. Panel headers, section labels, and structural decoration should be invisible or absent. Content declares itself.
- Typography does the work that decoration currently does. Hierarchy through weight and size, not borders and cards.
- Warmth is committed to. The Gruvbox palette has warmth — the shell should lean into it, not fight it with generic web-app patterns.

## Implementation Slices

---

### Slice 1 — Foundations: Fonts, Icons, Chrome Removal (R1)

**Goal:** Replace placeholder infrastructure (abbreviation labels, system fonts) with the real design foundation. Every subsequent slice builds on this.

**Dependencies:** None. Purely additive.

**Risk:** R1 — no behavioral changes, no API or domain changes. Auto-merge after `pnpm ci:verify`.

#### 1a. Typography — Geist + JetBrains Mono

Install both typefaces as self-hosted npm packages. No CDN dependency.

**Packages to add:**
- `geist` (Vercel, MIT) — provides `GeistVariable` and `GeistMonoVariable` as CSS-importable WOFF2 files
- `@fontsource/jetbrains-mono` (OFL) — or use `geist`'s mono variant; evaluate at implementation time and pick the cleaner import path

**CSS changes in `apps/web/src/app/styles.css`:**

Update the font-face declarations and the two CSS custom properties already in use:
```css
--ui-font: 'Geist', system-ui, sans-serif;
--mono-font: 'JetBrains Mono', 'GeistMono', monospace;
```

Apply `font-family: var(--ui-font)` to `:root` body text. Apply `font-family: var(--mono-font)` to amount cells, date cells, account codes, and running balance values in the register. Do not restyle every element — just wire the variables and apply them at the right semantic boundaries. Deep typographic hierarchy (scale, weights) is Slice 4.

**Verification:** Render the shell and confirm Geist loads for UI text and JetBrains Mono loads for register amount columns. Check network tab — no external font requests.

#### 1b. Activity Bar — Phosphor Icons

**Package to add:** `@phosphor-icons/react`

**Files:**
- `apps/web/src/app/shell.ts` — add an `icon` field to `BookViewDefinition` interface and to each entry in `bookViews`
- `apps/web/src/app/ShellActivityBar.tsx` — render the icon component instead of `view.shortLabel`

**Icon mapping** (Phosphor component names, `light` weight inactive / `regular` weight active):

| View | Phosphor icon | Rationale |
|---|---|---|
| overview | `SquaresFour` | Grid/overview metaphor |
| ledger | `Ledger` | Direct thematic match — a ledger book |
| budget | `Target` | Planning against a target |
| envelopes | `Envelope` | Direct thematic match |
| imports | `ArrowLineDown` | Inbound data |
| automations | `CalendarBlank` | Scheduled/recurring |
| reports | `ChartLineUp` | Reporting trend |
| settings | `Gear` | Universal settings metaphor |

**Implementation:** In `ShellActivityBar.tsx`, render the icon at 20px. Pass `weight="light"` when inactive, `weight="regular"` when active. Keep the existing `title` attribute on the button (or add it) equal to `view.label` for accessibility/tooltip.

Remove the `shortLabel` field from `BookViewDefinition` — it has no remaining uses after this change.

**Verification:** All activity bar items render Phosphor icons. Hovering shows a tooltip with the view label. Active state renders at regular weight. No text abbreviations visible.

#### 1c. Panel Chrome Removal

Remove panel title bars that label surfaces the user can already see.

**`apps/web/src/app/CoaSidebar.tsx`:**
- Remove the `<div className="panel-header">` block containing "Chart of accounts" and the active view label. The account list is self-evident.

**`apps/web/src/app/NonLedgerMainPanels.tsx`:**
- Overview panel: remove the `<div className="panel-header">` containing "Workspace modes" / "Desktop command center" from the overview article. The card grid speaks for itself.

**`apps/web/src/app/App.tsx`:**
- Remove the `<div className="panel-header">` inside `<aside className="inspector">` containing "Inspector" / the active view label. Slice 3 will give the inspector real content; the label is pure noise.

**`apps/web/src/app/styles.css`:**
- Keep the `.panel-header` class — it is used in many inner panels (budget line forms, envelope forms, etc.) where it provides genuine section separation. Only remove the instances listed above.

**Verification:** Shell renders without "Chart of accounts", "Workspace modes / Desktop command center", and "Inspector" title bars. Inner panel section headers within forms are unaffected.

---

### Slice 2 — Register-First Landing (R2)

**Goal:** When a book loads, navigate directly to the ledger register of the last-used account. The dashboard (overview) remains accessible via the activity bar but is no longer the default landing surface.

**Dependencies:** Slice 1 (icons must be in place so the activity bar is navigable).

**Risk:** R2 — behavioral change to the default landing view. Leave PR open for review.

#### Persistence

Add a `LAST_ACCOUNT_ID_STORAGE_KEY` constant in `apps/web/src/app/use-book-runtime.ts` (alongside the existing `LAST_BOOK_ID_STORAGE_KEY`). Write the selected account ID to `localStorage` whenever `selectedLedgerAccountId` changes in `App.tsx`.

#### Initial navigation

In `App.tsx`, change the default `activeView` state from `"overview"` to `"ledger"`:
```ts
const [activeView, setActiveView] = useState<BookView>("ledger");
```

On book load (after `loadedBook` is available), resolve the initial account:
1. Read `localStorage` for the last account ID.
2. If it exists in `loadedBook.accounts`, use it as the initial `selectedLedgerAccountId`.
3. If not found (first launch or account deleted), fall back to the first `asset` account in `loadedBook.accounts`, sorted by `code`.
4. If no asset accounts exist, fall back to the first account of any type.

Set both `activeView` to `"ledger"` and `selectedLedgerAccountId` to the resolved account ID as part of the book-load effect so the initial render lands directly in the register.

#### Account selection persistence

Wherever `setSelectedLedgerAccountId` is called in `App.tsx`, also write the new value to `localStorage`. A thin wrapper function handles both:
```ts
function selectLedgerAccount(accountId: string) {
  setSelectedLedgerAccountId(accountId);
  localStorage.setItem(LAST_ACCOUNT_ID_STORAGE_KEY, accountId);
}
```

Replace all `setSelectedLedgerAccountId` call sites with `selectLedgerAccount`.

**Verification:**
- Fresh load with no localStorage: lands in the ledger register of the first asset account.
- Reload after selecting an account: lands in the register of the previously selected account.
- Dashboard is accessible by clicking the overview icon in the activity bar.
- Selecting a different account in the COA sidebar persists to localStorage.

---

### Slice 3 — Inspector Panel Redesign (R2)

**Goal:** Collapse the inspector by default. When opened, show contextual content: account summary when no transaction is selected, transaction detail when one is selected.

**Dependencies:** Slices 1 and 2 (register-first is the primary context for the inspector).

**Risk:** R2 — behavioral and layout change. Leave PR open for review.

#### Collapsed state (default)

The inspector (`<aside className="inspector">`) should have zero width when collapsed. The shell grid currently allocates a fixed `300px` for column 4. Change the grid to:
```css
grid-template-columns: 46px 220px minmax(0, 1fr) var(--inspector-width);
```
Where:
- `--inspector-width: 0px` when collapsed (inspector hidden)
- `--inspector-width: 280px` when expanded

Apply `overflow: hidden` to the inspector aside so collapsed state is invisible, not just empty. Set `transition: width 150ms ease-out` for a smooth open/close.

#### Toggle mechanism

- **Keyboard:** `i` key toggles the inspector open/closed (wire in `shell.ts` keyboard handler, suppress when focus is in an input).
- **Button:** A small toggle button on the left edge of the inspector panel, visible at all times as a thin strip (8px wide, full height, with a subtle `>` / `<` indicator). Clicking it toggles.

Add `isInspectorOpen` boolean state to `App.tsx`, defaulting to `false`.

#### No-selection state (account context)

When no transaction is selected (`ledgerBook.selectedTransaction` is null), show:

```
[Account name]          [account type badge]

Cleared balance         $X,XXX.XX
Pending balance         $X,XXX.XX
Scheduled (30d)         $X,XXX.XX
```

- **Cleared balance:** sum of all cleared postings to the active account
- **Pending balance:** sum of all postings (cleared + uncleared) to the active account within the current period
- **Scheduled (30d):** sum of upcoming scheduled transaction amounts for the active account in the next 30 days, derived from `book.scheduledTransactions`

All amounts use JetBrains Mono, right-aligned. Positive amounts use `--amount-positive`, negative use `--amount-negative`.

If no account is selected (edge case on first load), show a minimal empty state: "Select an account to see its summary."

#### Transaction-selection state

When a transaction is selected (`ledgerBook.selectedTransaction` is not null), show:

**Header row:**
```
[occurredOn]   [description]
[payee or "—"]
```

**Splits section:**
A compact table of all postings for the selected transaction:
```
Account name          amount
Account name          amount
```
Each row: account name (truncated if needed) left-aligned, amount right-aligned in JetBrains Mono with positive/negative color. A subtle separator between the table and the next section.

**Audit trail section:**
Filter `book.auditEvents` for events where `entityId === selectedTransaction.id` or `entityIds` includes it. Show up to 10 events, most recent first:
```
[timestamp]   [event type label]   [actor]
```
Event type labels should be human-readable (e.g. `transaction.posted` → "Posted", `transaction.updated` → "Updated", `transaction.soft-deleted` → "Deleted"). If no audit events match, show "No audit history."

**Schedule section (conditional):**
If the selected transaction has a `scheduleId`, look up the matching schedule in `book.scheduledTransactions`. Show:
```
From schedule: [schedule name]
Next: [nextDueOn]   [amount]
```
If the schedule has future occurrences, list up to 3 in a compact stack. If no `scheduleId`, this section is omitted entirely.

**Attachments placeholder:**
A single line: "Attachments — coming soon" rendered in `--text-muted`. This reserves the space and signals the feature without requiring any API work.

#### Non-ledger views

When `activeView` is not `"ledger"`, the inspector toggle button remains visible but the inspector content shows a minimal view-appropriate summary (retain the existing per-view content from `ShellSidePanels.tsx`, cleaned up to remove the placeholder text about roadmap notes and architectural guidance — those are developer notes, not user-facing content).

**Verification:**
- Inspector is collapsed on load.
- `i` key and edge button both toggle it.
- No-selection state shows account balances for the active account.
- Transaction selection populates the detail, splits, audit trail, and schedule sections correctly.
- Inspector collapses smoothly with CSS transition.
- `pnpm ci:verify` passes.

---

### Slice 4 — Typography Hierarchy and Register Visual Identity (R2)

**Goal:** Apply a proper type scale, establish visual rhythm in the register, and make the ledger surface feel like a precision instrument rather than a generic data table.

**Dependencies:** Slice 1 (fonts must be loaded).

**Risk:** R2 — visual changes across all surfaces. Leave PR open for review.

#### Type scale

Add to `apps/web/src/app/styles.css` under `:root`:

```css
--text-2xs: 10px;   /* micro labels, chips */
--text-xs:  11px;   /* status bar, secondary metadata */
--text-sm:  12px;   /* register rows, sidebar items, table cells */
--text-base: 13px;  /* primary body text */
--text-md:  14px;   /* form labels, section headings */
--text-lg:  16px;   /* panel-level headings */
--text-xl:  20px;   /* account name in register header */
--text-2xl: 24px;   /* major view headings (if used) */

--weight-normal:   400;
--weight-medium:   500;
--weight-semibold: 600;
--weight-bold:     700;
```

#### Specific applications

**COA sidebar:**
- Account name: `--text-sm`, `--weight-normal`, `--text` color
- Account code: `--text-xs`, `--text-muted`, JetBrains Mono
- Account balance: `--text-sm`, JetBrains Mono, right-aligned, positive/negative color
- Section type headers ("asset", "liability", etc.): `--text-2xs`, `--weight-semibold`, `--text-muted`, uppercase letter-spacing

**Register header (active account tab):**
- Account name: `--text-xl`, `--weight-semibold`, Geist
- Account type badge: `--text-xs`, `--text-muted`, rounded chip

**Register rows:**
- Date: `--text-sm`, JetBrains Mono, `--text-muted`, fixed width column
- Description: `--text-sm`, `--weight-normal`, `--text` color, flex-grow
- Payee: `--text-sm`, `--text-muted`
- Amount: `--text-sm`, JetBrains Mono, right-aligned, fixed width, positive/negative color
- Running balance: `--text-sm`, JetBrains Mono, right-aligned, fixed width, `--text-muted`
- Status chip (cleared/pending/reconciled): `--text-2xs`, `--weight-medium`

**Register row rhythm:**
- Comfortable density: row height 40px (reduced from 48px — tighter, more editorial)
- Compact density: row height 28px
- Horizontal padding: 12px left, 12px right
- Row separator: 1px solid `color-mix(in srgb, var(--border) 40%, transparent)` — very subtle, almost invisible
- Hover background: `--surface-hover`
- Selected background: `--surface-selected`
- The amount and balance columns should have fixed widths (`--amount-col-width: 100px`, `--balance-col-width: 110px`) so columns align perfectly across all rows

**Amount column formatting:**
- Tabular figures via `font-variant-numeric: tabular-nums` on all JetBrains Mono amount values
- Positive amounts: `--amount-positive` color
- Negative amounts: `--amount-negative` color
- Zero amounts: `--text-muted`

**Overview cards (dashboard):**
- Card metric number: `--text-2xl`, `--weight-bold`, Geist
- Card label: `--text-sm`, `--weight-medium`, `--text-muted`
- Card summary: `--text-xs`, `--text-muted`

**Verification:**
- Register columns align vertically across all rows (amounts line up, dates line up).
- COA sidebar account list has clear hierarchy between type headers and account names.
- No surface has all text at the same visual weight — hierarchy is immediately legible.
- Both density modes render correctly with the new row heights.
- `pnpm ci:verify` passes.

---

## Acceptance Per Slice

Each slice must satisfy before merge:

1. `pnpm --filter @tally/web typecheck` passes
2. `pnpm ci:verify` passes
3. Manual spot-check in the running dev server against the Gruvbox dark theme
4. No regression in service-backed write flows

## Sequencing

```
Slice 1 (R1, auto-merge) → Slice 2 (R2, review) → Slice 3 (R2, review) → Slice 4 (R2, review)
```

Slices 2 and 4 could be parallelized if needed (they have no shared file conflicts), but sequential is safer and keeps the review surface manageable.

## Deferred

- Sparkline and expense distribution chart in the no-selection inspector state (requires charting library decision)
- Gruvbox light variant
- Iconography beyond the activity bar (register toolbar, COA quick actions, status bar)
- Motion and micro-interactions (row transitions, edit activation states)
- Attachment file list in inspector (requires attachment API feature)
