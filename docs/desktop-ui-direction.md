# Desktop UI Direction

## Intent

The desktop shell should borrow the spatial workflow of tools like VS Code and Obsidian without copying their visual language.

The goal is not to make a code editor for finance. The goal is to use a familiar, high-productivity shell model for dense accounting work:

- activity bar for major work modes
- left pane whose contents depend on the active mode
- middle document area for the primary working surface
- right contextual pane for focused supporting detail
- later, an optional bottom utility panel for secondary tools and status

The distinctive part of the product should come from accounting-native workflows, not from cloning another application's styling.

## Core Principle

The ledger register should be the central desktop experience.

Most desktop finance work should flow from the register, not from scattered forms or inspector-driven editing. The current inspector-heavy editing model is a transitional state, not the target end state.

## Target Shell Model

### Activity Bar

The activity bar selects the current workspace mode, such as ledger, budget, envelopes, automation, imports, reporting, or review-oriented workflows.

### Left Pane

The left pane is mode-specific.

Examples:

- ledger mode: chart of accounts, saved searches, register shortcuts
- budget mode: budget sheets, categories, periods
- import mode: import batches and review queues

### Middle Document Area

The middle area is the primary work surface and should support a document or tab model.

In ledger mode, selecting an account should open that account register in the middle area. Multiple account registers should eventually be open at once in tabs or an equivalent document model.

### Right Contextual Pane

The right pane should be optional and hidden by default. When visible, it should respond to the current focus in the middle area.

Examples:

- no register row selected: account-level context
- register row selected: transaction-level context
- import review focused: import diagnostics and mapping detail

The right pane should support the primary surface, not compete with it.

### Bottom Utility Panel

The bottom panel is a later addition for secondary tools such as audit trail, validation output, batch review, status, and other utility surfaces that should not crowd the main register.

## Register-First Direction

The ledger should feel like a true accounting register, not a CRUD table with an attached form.

Desired direction:

- direct inline editing of routine transaction fields in the register
- new transaction entry from a blank row, similar to established desktop finance tools
- split and posting editing available without displacing the register as the main surface
- active ledger balance visible in context
- date or timeframe filtering alongside other register filters
- support for multiple open registers

Longer-term power-user direction:

- linked register tabs that can follow each other based on a shared rule such as date
- a command palette that can handle both search and action-oriented finance workflows

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
2. Support multiple open account registers.
3. Shift routine transaction editing toward inline register behavior.
4. Use the right pane as contextual support rather than the primary editing surface.
5. Improve register filtering with date, status, tag, and account-aware controls.
6. Decide where reconciliation should live outside or alongside the main register.
7. Explore command palette and linked-register workflows after the register model is stable.

## Relationship To Native Desktop Work

This direction applies whether the desktop shell stays browser-hosted or later gains a native wrapper. A Tauri or Electron shell does not change the core interaction model; it only changes packaging and platform integration.
