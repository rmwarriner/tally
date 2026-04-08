# Audit Events

Last reviewed: 2026-04-08

## Purpose

Audit events provide a durable financial mutation history that is separate from transient logs.

They are intended to answer:

- who performed a financial action
- when it occurred
- what command was executed
- which entities were affected
- what business summary should be preserved for later review

## Current Implementation

The workspace document now stores audit events in `auditEvents`.

Implemented event types:

- `transaction.created`
- `transaction.updated`
- `transaction.deleted`
- `transaction.restored`
- `transaction.destroyed`
- `schedule.upserted`
- `schedule.executed`
- `schedule.exception.applied`
- `baseline-budget-line.upserted`
- `envelope.upserted`
- `envelope-allocation.recorded`
- `reconciliation.recorded`
- `import.csv.recorded`
- `import.qif.recorded`
- `import.ofx.recorded`
- `import.qfx.recorded`
- `import.gnucash-xml.recorded`
- `close.recorded`
- `household-member.added`
- `household-member.removed`
- `household-member.role-changed`
- `approval.requested`
- `approval.granted`
- `approval.denied`

## Event Shape

Each event includes:

- `id`
- `workspaceId`
- `actor`
- `occurredAt`
- `eventType`
- `entityIds`
- `summary`

## Emission Rules

- successful workspace mutations append audit events
- rejected commands do not append audit events
- nested import posting suppresses per-transaction audit events so the import command records one batch-level event
- if no actor is provided, the actor defaults to `system`
- soft-deleted transactions remain persisted for investigation but are hidden from normal operational views, reports, and exports
- privileged destroy removes the transaction from the active document while preserving prior audit history plus a final `transaction.destroyed` event

## Current Boundary

Audit events are currently persisted inside the workspace document. This is enough for a local-first foundation and makes the history durable across save/load cycles.

The current service layer attaches authenticated actor identity and authorization context before write commands. Household member mutations and approval operations are fully covered.

Remaining extensions are:

- optional append-only audit streams for external retention
- broader mutation coverage as account management and other new commands are added
