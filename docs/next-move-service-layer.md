# Next Move: Service Layer

This document captured the service-layer implementation proposal before the initial service boundary existed. The first foundation is now implemented in `apps/api`; see `docs/service-layer.md` for current status.

## Why This Is Next

The repository now has:

- pure accounting and budgeting rules in `packages/domain`
- a workspace document model and write commands in `packages/workspace`
- web and mobile shells that can render derived state

The next useful move is to introduce a small backend or local service boundary that owns loading, saving, and mutating the workspace document. Without that layer, the apps can render seeded data but they do not yet have a durable execution path for real user actions.

## Goal

Create a service layer that:

- loads household workspace documents from persistent storage
- exposes command-oriented APIs for ledger, budgets, envelopes, schedules, imports, and reconciliation
- applies domain and workspace validations centrally
- saves successful mutations with an audit trail
- becomes the future sync boundary for multi-device and family collaboration

## Recommended Shape

### Package / App Roles

- `packages/domain`
  Remains pure accounting logic and invariant enforcement.
- `packages/workspace`
  Remains document model, commands, selectors, and storage adapters.
- `apps/web`
  Consumes service APIs instead of constructing state directly.
- `apps/mobile`
  Consumes a subset of the same service APIs.
- `apps/api` or `packages/server`
  New backend boundary for persistence, commands, imports, and audit.

### Service Style

Use command-style endpoints rather than generic CRUD-first endpoints.

Examples:

- `POST /api/workspaces/:id/transactions`
- `POST /api/workspaces/:id/reconciliations`
- `POST /api/workspaces/:id/envelope-allocations`
- `POST /api/workspaces/:id/imports/csv`
- `POST /api/workspaces/:id/schedules`
- `GET /api/workspaces/:id/dashboard?from=2026-04-01&to=2026-04-30`

This matches the business model better than exposing raw table updates.

## First Delivery Slice

### 1. Read Path

Implement:

- load workspace document by id
- derive dashboard snapshot from the stored document
- return accounts, transactions, schedules, budgets, envelopes, imports, and reconciliations

This gives the UI a single source of truth immediately.

### 2. Write Path

Implement command handlers for:

- add transaction
- upsert scheduled transaction
- upsert baseline budget line
- upsert envelope
- record envelope allocation
- reconcile account

Each handler should:

1. load the workspace document
2. run the relevant `packages/workspace` command
3. persist the updated document on success
4. append an audit event
5. return the updated document or projection

### 3. Import Path

Implement CSV import first because it is already modeled.

The handler should:

- parse rows
- map rows into command input
- run duplicate checks
- persist resulting transactions and import-batch metadata

After that, extend the same flow to OFX, QFX, QIF, and GnuCash XML.

## Persistence Recommendation

Start simple and local-first:

- workspace document stored as JSON per household
- audit events stored append-only as JSONL or a dedicated event file
- attachments stored in a workspace-scoped directory

This keeps development fast while preserving a migration path to SQLite or Postgres later.

## Audit Model

Every successful mutation should emit an audit event with:

- event id
- workspace id
- event type
- actor
- occurred at timestamp
- command payload summary
- affected entity ids

This supports household accountability and later sync/conflict work.

## Suggested API Contract

### Reads

- `GET /api/workspaces/:id`
- `GET /api/workspaces/:id/dashboard`
- `GET /api/workspaces/:id/register`
- `GET /api/workspaces/:id/reports/:kind`

### Writes

- `POST /api/workspaces/:id/transactions`
- `POST /api/workspaces/:id/schedules`
- `POST /api/workspaces/:id/budget-lines`
- `POST /api/workspaces/:id/envelopes`
- `POST /api/workspaces/:id/envelope-allocations`
- `POST /api/workspaces/:id/reconciliations`
- `POST /api/workspaces/:id/imports/csv`

## Validation Rules The Service Must Own

- transactions must balance
- postings must reference known accounts
- baseline budgets must target income or expense accounts
- envelopes must reference expense accounts and asset-backed funding sources
- imported transactions must deduplicate by source fingerprint
- reconciliation sessions must compute and return statement differences explicitly

## Delivery Order

1. Create `apps/api` or `packages/server`
2. Add workspace repository abstraction with JSON file implementation
3. Add command handlers wrapping `packages/workspace`
4. Add audit event appenders
5. Switch web app from seeded workspace import to API-backed loading
6. Add mutation flows from the web UI
7. Reuse the same service contract from mobile

## What This Unlocks

- persistent real user data instead of demo-only state
- safe mutation flows for finance operations
- import/export pipelines with traceability
- reconciliation workflows that survive reloads
- a clean future path to sync, auth, permissions, and collaboration
