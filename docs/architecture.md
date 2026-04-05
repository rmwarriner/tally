# Architecture

## Top-Level Modules

### Ledger Engine

Responsibilities:

- maintain the chart of accounts
- validate balanced postings
- support splits, commodities, lots, tags, and reconciliation metadata
- expose transaction creation, editing, reversal, and void flows

### Budget Engine

Responsibilities:

- baseline budgets by period, category, and scenario
- envelope allocations tied to ledger funding sources
- rollover logic, funding rules, and overspend treatment
- variance reporting between planned and operational budget states

### Automation Engine

Responsibilities:

- recurring schedules
- forecast generation
- rule-based categorization
- reminders and task queues

### Import / Export Engine

Responsibilities:

- OFX / QFX ingest
- QIF ingest and export
- CSV mapping pipelines
- GnuCash XML import and export
- ledger-safe deduplication and source traceability

### Reporting Engine

Responsibilities:

- net worth
- cash flow
- income and expense statements
- budget vs actual
- envelope funding and burn-down
- tax-category and period reporting

## Cross-Cutting Concerns

- event-sourced audit trail for key mutations
- local-first capable persistence with syncable change sets
- deterministic domain rules shared across web and mobile
- permission model suitable for family and household collaboration

## Proposed Technical Stack

- `packages/domain`
  Shared TypeScript business rules and invariant enforcement
- `packages/workspace`
  Workspace documents, commands, selectors, and storage adapters
- `apps/web`
  Dense desktop/web workspace with keyboard-first flows
- `apps/mobile`
  Focused mobile client for quick operations and review
- `apps/api` or `packages/server`
  Service boundary for persistence, commands, imports, audit, and sync preparation

### Stack Review Notes

- Rust is a possible future backend/runtime option, but it is not the current recommendation for the API layer.
- See `docs/rust-api-reassessment.md` for the conditions that would justify revisiting that decision.

## Data Strategy

- The ledger remains the system of record.
- Budgets store intent and allocation state, never replacing journal entries.
- Envelope actions create explicit allocation events that can be reconciled back to funding accounts.
- Imports store source fingerprints to avoid duplicate postings.

## Delivery Phases

1. Domain and ledger invariants
2. Workspace document model and write commands
3. Service layer for persistence, command handling, and audit
4. Web workspace backed by service APIs
5. Mobile quick-actions client backed by the same service contract
6. Import/export adapters
7. Reporting and close workflow
