# Ledger UI Mockup Handoff

Last reviewed: 2026-04-06

Use this file to turn Figma mockups into implementation-ready requirements for `apps/web`.

## Scope

- Feature area: `ledger` view in desktop shell
- Primary target: reduce UI clunkiness in register-first workflows
- Non-goals:
  - broad visual redesign outside ledger mode
  - behavior changes in unrelated views unless explicitly listed below

## Artifact Index

Place exported assets in this folder and list them here.

- Figma file URL:
- Main prototype URL:
- Exports:
  - `frame-01-shell-overview.png`
  - `frame-02-ledger-no-selection.png`
  - `frame-03-ledger-row-selected.png`
  - `frame-04-ledger-inline-edit.png`
  - `frame-05-split-editor-expanded.png`
  - `frame-06-new-transaction-row.png`
  - `frame-07-empty-state.png`
  - `frame-08-validation-error.png`

## Figma Naming Convention

Use this naming scheme so exports map directly to implementation tasks.

- Page name: `Ledger Rework`
- Section names:
  - `00 Foundations`
  - `01 Core Flows`
  - `02 Errors And Recovery`
  - `03 Responsive`
- Frame names:
  - `L-01 Shell Overview`
  - `L-02 Ledger No Selection`
  - `L-03 Ledger Row Selected`
  - `L-04 Ledger Inline Edit`
  - `L-05 Split Editor Expanded`
  - `L-06 New Transaction Row`
  - `L-07 Empty State`
  - `L-08 Validation Error`
- Component page name:
  - `Ledger Components`
- Component naming:
  - `ledger/register-row`
  - `ledger/register-cell`
  - `ledger/status-chip`
  - `ledger/tab`
  - `ledger/toolbar-filter`
  - `ledger/split-row`
  - `ledger/detail-panel-section`

### Export Contract

- Export format: `PNG` at `2x`
- File names:
  - `frame-01-shell-overview.png`
  - `frame-02-ledger-no-selection.png`
  - `frame-03-ledger-row-selected.png`
  - `frame-04-ledger-inline-edit.png`
  - `frame-05-split-editor-expanded.png`
  - `frame-06-new-transaction-row.png`
  - `frame-07-empty-state.png`
  - `frame-08-validation-error.png`
- Prototype walkthrough recording (optional): `ledger-flow-walkthrough.mp4`

## Viewport Matrix

Define required behavior at each width.

| Viewport | Required | Notes |
| --- | --- | --- |
| 1440 | yes | primary desktop |
| 1200 | yes | compact desktop |
| 1024 | yes | minimum supported desktop |

## Register Layout Contract

- Columns in order:
  1. Date
  2. Description
  3. Payee
  4. Account
  5. Tags
  6. Status
  7. Debit
  8. Credit
  9. Balance
- Column sizing rules:
  - fixed:
  - min/max:
  - flex:
- Row heights:
  - default:
  - expanded:
- Sticky/frozen columns:
- Scroll behavior:

## Interaction Semantics

### Selection And Focus

- Selected row style:
- Focused cell style:
- Hover style:
- Multi-select (if any):
- Selection persistence across filter/search changes:

### Keyboard Map

Document exactly what each key does.

- `/`:
- `j` / `k`:
- `ArrowUp` / `ArrowDown`:
- `Enter`:
- `Esc`:
- `Cmd/Ctrl+S`:
- `Alt+Up` / `Alt+Down`:
- `Tab` / `Shift+Tab`:

### Inline Edit Rules

- Editable fields inline:
- Save triggers:
- Cancel triggers:
- Dirty state indicator:
- Validation message location:
- Unsaved navigation behavior:

### Split Editor Rules

- Open trigger:
- Add split:
- Remove split:
- Reorder split:
- Auto-balance behavior:
- Invalid state visuals:

## Toolbar And Filters

- Search scope:
- Date range behavior:
- Status chips behavior (`all`, `open`, `cleared`, `reconciled`):
- Account filter behavior:
- Clear/reset behavior:

## Register Tabs (Document Model)

- Tab creation trigger:
- Tab close rules:
- Active tab style:
- Unsaved tab indicator:
- Overflow behavior:

## Right Detail Pane Contract

Describe exactly what appears for each state.

- No selection:
- Row selected:
- Inline edit active:
- Split editor active:
- Actions intentionally disabled in this pane:

## Async, Errors, And Recovery

- Save in-progress feedback:
- Save success feedback:
- API failure display:
- Retry flow:
- Conflict/out-of-date handling:

## Visual Tokens

Match these values in implementation.

- Typography:
  - font family:
  - size scale:
  - line heights:
  - weights:
- Spacing scale:
- Colors:
  - background:
  - surface:
  - border:
  - text primary:
  - text muted:
  - success:
  - warning:
  - danger:
  - focus ring:
- Radius:
- Shadow:
- Motion:
  - durations:
  - easing:

## Accessibility Requirements

- Minimum contrast targets:
- Focus ring requirements:
- Minimum hit targets:
- Keyboard-only completion path for key flows:
- Screen-reader naming notes:

## Must Match Exactly

List details that should be pixel/behavior exact.

1.
2.
3.

## Implementation Can Approximate

List details where reasonable approximation is acceptable.

1.
2.
3.

## Open Questions

Track unresolved design decisions.

1.
2.
3.
