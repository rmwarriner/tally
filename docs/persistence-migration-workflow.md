# Persistence Migration Workflow

## Scope

This document defines the current admin workflow for moving workspace data between the supported persistence backends in `apps/api`.

Supported backends:

- `json`
- `sqlite`
- `postgres`

The workflow is intentionally offline/admin-oriented for now. It is not exposed through the HTTP API.

## Admin Command

Run:

- `pnpm --filter @gnucash-ng/api persistence:admin -- <command> ...flags`

Supported commands:

- `copy`
  - load from one backend and write directly into another backend
- `export`
  - load a workspace from a backend and write a JSON workspace snapshot to disk
- `import`
  - load a JSON workspace snapshot from disk and write it into a backend

## Copy Examples

Copy from JSON storage into SQLite:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  copy \
  --workspace-id workspace-household-demo \
  --source-backend json \
  --source-data-dir ./apps/api/data \
  --target-backend sqlite \
  --target-sqlite-path ./apps/api/data/workspaces.sqlite
```

Copy from SQLite into Postgres:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  copy \
  --workspace-id workspace-household-demo \
  --source-backend sqlite \
  --source-sqlite-path ./apps/api/data/workspaces.sqlite \
  --target-backend postgres \
  --target-postgres-url postgres://ledger:secret@localhost:5432/ledger
```

Copy into a different workspace id on the target backend:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  copy \
  --workspace-id workspace-household-demo \
  --source-backend json \
  --source-data-dir ./apps/api/data \
  --target-backend postgres \
  --target-postgres-url postgres://ledger:secret@localhost:5432/ledger \
  --target-workspace-id workspace-household-demo-migrated
```

## Export Example

Export a workspace from Postgres to a JSON snapshot file:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  export \
  --workspace-id workspace-household-demo \
  --backend postgres \
  --postgres-url postgres://ledger:secret@localhost:5432/ledger \
  --output ./tmp/workspace-household-demo.json
```

## Import Example

Import a JSON workspace snapshot into SQLite:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  import \
  --workspace-id workspace-household-demo \
  --backend sqlite \
  --sqlite-path ./apps/api/data/workspaces.sqlite \
  --input ./tmp/workspace-household-demo.json
```

## Current Rules

- backend selection must be explicit
- Postgres commands require a connection string
- JSON import snapshots still pass through the workspace migration layer before being written
- copy/import writes use the same repository save path as normal runtime persistence
- this workflow is intended for operator-controlled migration and recovery tasks, not live multi-writer synchronization

## Near-Term Follow-Up

- add runbook guidance for pre-migration backup, verification, and rollback
- add broader verification against a real Postgres instance in CI or local integration scripts
- decide whether to add a higher-level workspace migration command that can enumerate multiple workspaces in one run
