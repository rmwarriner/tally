# Product Foundation

## Users

- Individuals managing their own finances
- Couples and families coordinating household spending
- Households that want ledger integrity without giving up budgeting usability

## Core Jobs

- Maintain an accurate personal general ledger
- Plan monthly and annual spending with category budgets
- Operate day to day using envelope balances
- Reconcile bank, card, cash, and liability accounts
- Automate recurring household activity
- Import statements and export data to portable formats

## Differentiators

- VS Code-style workspace for dense finance workflows
- Dual-budget model where baseline budgets and envelopes coexist cleanly
- Mobile support for capture, review, and envelope movement
- Ledger-first architecture that keeps reports, budgets, and imports consistent

## Non-Negotiable Capabilities

- Double-entry accounting with balanced postings
- Split transactions and transfers
- Scheduled and recurring transactions
- Import and export for common financial formats
- Reporting across cash flow, net worth, category, tax, and budget dimensions
- Household-relevant GAAP guardrails

## Household GAAP Guardrails

- Preserve auditable transaction history
- Track assets, liabilities, equity, income, and expenses distinctly
- Separate realized transactions from planned budget allocations
- Prevent envelope movements from masquerading as income or expense
- Maintain period-based reporting with explicit close semantics
- Preserve source metadata for imports, attachments, and reconciliations

## Product Model

1. Ledger
   The canonical double-entry record.
2. Baseline budget
   The planning layer organized by period and category.
3. Envelope budget
   The operational allocation layer for liquid and near-liquid funds.
4. Reporting
   Derived views over the ledger plus budget context.

## Interface Direction

- Left rail for navigation, accounts, reports, and automation
- Primary editor surface for registers, budget sheets, reports, and import review
- Bottom panel for audit trail, validation, and reconciliation details
- Inspector panel for account metadata, envelope state, and scheduled transaction rules
- Mobile flows focused on capture, approvals, envelopes, quick views, and notifications
