# Audit Events

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
- `schedule.upserted`
- `baseline-budget-line.upserted`
- `envelope.upserted`
- `envelope-allocation.recorded`
- `reconciliation.recorded`
- `import.csv.recorded`

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

## Current Boundary

Audit events are currently persisted inside the workspace document. This is enough for a local-first foundation and makes the history durable across save/load cycles.

The future service layer should extend this by:

- attaching request and actor identity from authentication
- appending audit events through service handlers
- optionally writing append-only audit streams for external retention
