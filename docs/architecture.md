# Architecture

Last reviewed: 2026-04-06

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

- OFX / QFX ingest and export
- QIF ingest and export
- CSV mapping pipelines
- GnuCash XML workspace snapshot import and export
- ledger-safe deduplication and source traceability

### Reporting Engine

Responsibilities:

- net worth
- cash flow
- income and expense statements
- budget vs actual
- envelope funding and burn-down
- tax-category and period reporting
- period close review and durable close-state tracking

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

## Current Operating Shape

The repository now runs as:

- shared TypeScript domain and workspace logic reused across clients and the API
- `apps/api` as the command, persistence, auth, validation, audit, and import/export boundary
- pluggable workspace persistence with `json`, `sqlite`, and `postgres` backends behind one repository contract
- web and mobile clients consuming the same service boundary for reads and writes
- a documented single-host Linux deployment model for the API runtime
- an offline/admin migration workflow for moving workspaces between supported persistence backends

See `docs/service-layer.md`, `docs/api-runtime-operations.md`, and `docs/api-deployment-and-recovery-runbook.md` for the current operational shape.

## Architectural Direction

The current architecture direction is:

- keep the ledger/accounting layer minimal, deterministic, and authoritative
- implement budgeting, envelopes, sync behaviors, AI assistance, and similar concerns as higher-order layers above the ledger
- keep `apps/api` as the operational boundary for persistence, auth, validation, audit, and import/export
- evolve persistence behind explicit abstractions rather than binding the product to JSON-only storage
- preserve auditability and integrity rules even as backends, clients, and assistive features expand

## Data Strategy

- The ledger remains the system of record.
- Budgets store intent and allocation state, never replacing journal entries.
- Envelope actions create explicit allocation events that can be reconciled back to funding accounts.
- Imports store source fingerprints to avoid duplicate postings.
- Higher-order layers should annotate or derive from ledger entities instead of redefining accounting truth.

## Delivery Phases

Completed:

1. Domain and ledger invariants
2. Workspace document model and write commands
3. Service layer for persistence, command handling, audit, and runtime operations
4. Web workspace backed by service APIs
5. Mobile client backed by the same service contract
6. Import/export adapters for CSV, QIF, OFX, QFX, and GnuCash XML snapshot flows
7. Reporting, close workflow, backup, restore, and migration foundations

Next:

1. Continue trust and integrity hardening after the first transaction soft-delete and privileged-destroy pass
2. Budgeting and planning model definition for remaining-to-budget, rollover, and envelope funding rules
3. Family-scale identity and authorization model
4. Automation and review workflows, including sync, inbox, rules, and optional AI assistance
5. Encryption-at-rest, external observability sinks, and production security guidance across supported backends
