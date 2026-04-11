# Ledger UI Rebuild Plan

Last reviewed: 2026-04-11

## Purpose

This document tracks two things:

1. Remaining app-shell cleanup work that should be deferred and resolved in bounded follow-ups.
2. The active plan for rebuilding the desktop ledger UI toward the register-first direction.

Use this document as the implementation handoff and sequencing guide for ledger-focused UI work.

## Deferred Cleanup Backlog

These items are useful, but not required blockers for the initial ledger rebuild slices:

1. Replace broad `any` usage in:
   - `apps/web/src/app/NonLedgerMainPanels.tsx`
   - `apps/web/src/app/ShellSidePanels.tsx`
2. Extract operation-form local state in `apps/web/src/app/App.tsx` into focused hooks:
   - `useLedgerOperationsState`
   - `useBudgetFormState`
   - `useEnvelopeFormState`
   - `useImportFormState`
3. Add focused component tests for:
   - `LedgerOperationsPanels`
   - `ShellSidebarContent`
   - `ShellInspectorContent`
4. Tighten prop contracts to minimize cross-component coupling (reduce pass-through props where possible).

These cleanup items should be resolved incrementally while avoiding broad behavior changes.

## Rebuild Goals

The ledger mode should evolve from a form-supported table into a true register-first workspace:

- inline-first transaction editing in the register
- new transaction entry from register rows
- split editing that supports the register instead of displacing it
- support for multiple open account registers (tabs as account dividers — see mental model below)
- keyboard-first navigation and mutation workflows
- period selector wired as global application state; register responds to `currentPeriod`
- two balance modes: running balance for complete slices, filtered subtotal for text-search slices

Design intent source: `docs/desktop-ui-direction.md`.

## Mental Model

The general ledger is the master data set. Selecting an account in the COA sidebar focuses on that account's slice of the general ledger — not a separate data store. The period selector (global application state) further narrows the temporal window. Text search narrows further still, but changes the semantics of what the register shows.

Tabs are account dividers in the binder metaphor. Each open tab corresponds to one account register. They are not "open files."

### Balance Column

**Complete slice** (account + period, no text search):
- Show running balance
- Opening balance = sum of all postings to the account before period start
- Each transaction within the period accumulates from that opening balance

**Filtered slice** (text search active):
- Drop running balance column — undefined because hidden transactions affect it
- Show per-row amounts only
- Status bar shows filtered subtotal: "showing N of M · filtered total −$X"

## Cross-Mode Rule

Carry this interaction rule across desktop modes:

- routine editing belongs in each mode's primary grid/list surface
- detached editor panes are for complex exceptions, diagnostics, or review

This applies to ledger, envelopes, budgeting, and scheduling workflows.

## Current Baseline

The current ledger code is now modularized enough for targeted rebuild slices:

- register surface: `apps/web/src/app/LedgerRegisterPanel.tsx`
- transaction detail surface: `apps/web/src/app/LedgerTransactionEditorPanel.tsx`
- ledger operations surface: `apps/web/src/app/LedgerOperationsPanels.tsx`
- ledger view model and keyboard logic: `apps/web/src/app/shell.ts` and `apps/web/src/app/ledger-state.ts`

## Implementation Slices

### ~~Slice 1: Register Row Editing Foundation~~ *(done)*

Scope:

- add row-level edit state in register rows for core fields (date, description, payee)
- preserve existing transaction detail panel as fallback/editor parity while inline mode lands
- keep existing service write route usage and validation behavior

Primary files:

- `apps/web/src/app/LedgerRegisterPanel.tsx`
- `apps/web/src/app/ledger-state.ts`
- `apps/web/src/app/shell.ts`

### ~~Slice 2: Inline Split Editing In Register Context~~ *(done)*

Scope:

- add inline split preview/edit affordances directly in register row expansion
- keep focus movement and balance feedback near edited row
- avoid forcing context switch to detail panel for routine split adjustments

Primary files:

- `apps/web/src/app/LedgerRegisterPanel.tsx`
- `apps/web/src/app/LedgerTransactionEditorPanel.tsx`
- `apps/web/src/app/transaction-editor.ts`

### ~~Slice 3: Register Tabs / Multi-Register Support~~ *(done)*

Scope:

- support multiple open account registers
- tabs represent account dividers (the binder metaphor) — not arbitrary open views
- preserve independent text filters and selection state per open register
- all tabs share the global `currentPeriod` — period selector is not per-tab
- add close/reorder behavior for open register tabs

Primary files:

- `apps/web/src/app/ledger-state.ts`
- `apps/web/src/app/LedgerRegisterPanel.tsx`
- `apps/web/src/app/App.tsx` (composition wiring)

### ~~Slice 4: Keyboard-First Workflow Hardening~~ *(done)*

Scope:

- improve keyboard command map for register entry/editing
- unify command semantics across inline row editing and detail editing
- add regression tests for critical hotkeys and focus transitions

Primary files:

- `apps/web/src/app/ledger-state.ts`
- `apps/web/src/app/ledger-state.test.ts`
- `apps/web/src/app/shell.ts`
- `apps/web/src/app/shell.test.ts`

## Acceptance Criteria Per Slice

Each slice should meet all of the following before merge:

1. `pnpm --filter @tally/web typecheck` passes.
2. Focused ledger tests pass (`shell`, `ledger-state`, and relevant new tests).
3. Manual UI review checklist items for ledger are run (`docs/ui-review-checklist.md`).
4. No regression in service-backed write flows for transactions/reconciliation.

## Immediate Next Step

Start Slice 1 by introducing a bounded inline-edit mode for three register columns:

- `occurredOn`
- `description`
- `payee`

Use optimistic local draft state with explicit save/cancel controls per row, then persist through existing transaction update operations.
