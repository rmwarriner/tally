# Desktop UI Direction

Last reviewed: 2026-04-10

## Intent

The desktop shell is a digital ledger book — specifically a 3-ring binder with tabbed account dividers. This is not a VS Code clone; the layout resembles an IDE workbench because both solve the same underlying problem (hierarchical navigation + keyboard-first + multi-context work), but the mental model is grounded in accounting tradition.

- **Activity bar** — switches major sections of the binder (ledger, budget, reports, settings)
- **COA sidebar** — the spine of the binder, persistent across all activities
- **Tabs** — account dividers; each tab opens one account register
- **Register** — the ruled pages; the primary surface and the heart of the system
- **Bottom panel** — the front pocket of the binder; global appliance operations only
- **Status bar** — minimal floating status nodes, Obsidian-style

The distinctive part of the product should come from accounting-native workflows, not from visual styling.

## Core Principle

The ledger register should be the central desktop experience.

Most desktop finance work should flow from the register, not from scattered forms or inspector-driven editing. The current inspector-heavy editing model is a transitional state, not the target end state.

## Interaction Rule

Adopt this product-wide interaction rule:

- routine editing should happen in the primary working surface for the active mode
- secondary panes should be used only for complex, exception, or review-specific tasks

Applied by mode:

- ledger: routine transaction editing belongs in the register
- envelopes: routine envelope edits belong in envelope rows/lists, not detached forms
- budget: routine budget edits belong in budget sheets/grids, not detached forms
- automations/schedules: routine schedule edits belong in schedule rows/lists, with detail panes reserved for complex templates

This rule is intended to keep the desktop shell understandable for household users while preserving advanced workflows through progressive disclosure.

## Target Shell Model

### Activity Bar

The activity bar switches major binder sections: ledger, budget, envelopes, reports, settings. Each section is a distinct part of the binder, not a reconfiguration of the ledger view.

### COA Sidebar

The COA sidebar is persistent across all activities — it does not change when the activity bar selection changes. This matches Obsidian's file tree, not VS Code's mode-switching explorer.

The sidebar shows the full chart of accounts hierarchy. Clicking any account opens that account register in the middle area regardless of which activity is active.

Quick action buttons at the top of the sidebar are contextual to the current tree selection:
- account selected → add transaction, reconcile, add sub-account
- no selection → add account, import

### Middle Document Area

The middle area is the primary work surface with a tab/document model.

Tabs are account dividers — each open tab corresponds to one account register. This is the 3-ring binder metaphor: the tab is the physical divider, the register is the ruled pages behind it. Tabs are not "open files."

Multiple account registers can be open simultaneously and independently filtered.

### Right Contextual Pane

The right pane is optional and hidden by default. When visible, it responds to the current focus in the middle area:

- no register row selected: account-level context
- register row selected: transaction detail, attachments, audit trail
- import review focused: import diagnostics and mapping detail

The right pane supports the primary surface; it does not compete with it.

### Bottom Panel (Global Appliance)

The bottom panel is the front pocket of the binder — a global appliance for operations that affect the whole book rather than a specific account:

- import and export flows
- reconciliation queue
- scheduled transaction log
- rules engine output

The bottom panel is not a developer terminal. It should not expose raw API logs or HTTP status codes to end users. Developer/debug output may live behind a separate toggle for development builds.

### Status Bar

The status bar follows the Obsidian model: status nodes float near the edges of the screen and occupy only as much width as they need. Nothing stretches uselessly across the full width.

Candidate status nodes:
- bottom-left: API online/offline indicator (dot, green/amber/red)
- bottom-right: current period balance, last reconciliation date

The status bar also signals which register mode is active:
- complete slice (account + period, no text search): "47 transactions · balance $7,108.81"
- filtered slice (text search active): "showing 4 of 47 · filtered total −$297.69"

## Period Selector

The period selector is a global temporal context — a single `currentPeriod` in application state that all views subscribe to and interpret appropriately. It is not a per-view filter.

- **Ledger**: shows transactions within the period; computes opening balance as of period start
- **Reports**: bounds the report to the period
- **Scheduled transactions**: shows upcoming transactions within the range
- **Import/export**: restricts to the period

The period selector lives in the topbar as a persistent pill — it is application-level context, not a ledger control. Natural language input is supported ("last quarter", "YTD", "since last reconciliation").

The period selector and command palette share the same interaction pattern (spotlight-style input). They may be implemented as the same component with different modes: a `>` prefix invokes a command, a date or range string sets the period, natural language may do either.

## Register-First Direction

The ledger should feel like a true accounting register, not a CRUD table with an attached form.

The general ledger is the master. Selecting an account focuses on that account's slice of the general ledger — it is not a separate data store. The period selector further narrows the temporal window. Text search narrows further still, but changes the semantics of what the register shows.

Desired direction:

- direct inline editing of routine transaction fields in the register
- new transaction entry from a blank row, similar to established desktop finance tools
- split and posting editing available without displacing the register as the main surface
- active ledger balance visible in context
- support for multiple open registers

### Balance Column — Two Modes

The balance column behavior depends on the active filter state:

**Complete slice** (account + period, no text search active):
- Show running balance
- Pre-compute the opening balance as of period start from all transactions before the period boundary
- Each transaction within the period accumulates from that opening balance

**Filtered slice** (text search active):
- Drop the running balance column — it is undefined because hidden transactions affect it
- Show per-row amounts only
- Show filtered subtotal in the status bar
- The register is honest about what it is displaying

Longer-term power-user direction:

- linked register tabs that can follow each other based on a shared rule such as date
- a command palette with natural language support for search and action-oriented finance workflows

## What Makes This Unique

The product should not try to be unique through styling alone. It should become distinctive through accounting-native power and workflow quality.

Areas with real differentiation potential:

- linked registers for cross-account investigation
- genuinely strong keyboard-first ledger workflows
- finance-aware command palette behavior
- dedicated register modes for review, reconciliation, and audit-oriented work
- context-aware suggestions such as balancing help, likely account/category suggestions, and anomaly surfacing

## What To Avoid

- copying VS Code visually instead of learning from its shell flow
- letting the desktop UI become half register and half form-builder
- pushing routine transaction editing into the inspector by default
- overloading the main ledger view with specialized workflows like reconciliation if they need a distinct mode

## Near-Term Design Priorities

1. Move the desktop shell decisively toward a register-first layout.
2. Support multiple open account registers (tabs as account dividers).
3. Shift routine transaction editing toward inline register behavior.
4. Use the right pane as contextual support rather than the primary editing surface.
5. Implement the period selector as global application state; wire all views to it.
6. Implement the two balance modes (complete slice vs filtered slice) in the register.
7. Scope the bottom panel to global appliance operations; remove developer-facing log output from the end-user surface.
8. Implement Obsidian-style status bar with per-mode status messaging.
9. Explore command palette and natural language period input after the register model is stable.

## Relationship To Native Desktop Work

This direction applies whether the desktop shell stays browser-hosted or later gains a native wrapper. A Tauri or Electron shell does not change the core interaction model; it only changes packaging and platform integration.
