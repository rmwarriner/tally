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
- `copy-all`
  - enumerate every workspace in the source backend and copy each one into the target backend
- `export`
  - load a workspace from a backend and write a JSON workspace snapshot to disk
- `import`
  - load a JSON workspace snapshot from disk and write it into a backend

Common safety flags:

- `--dry-run`
  - validate and inspect the operation without writing target data
- `--report-path <path>`
  - write a JSON report describing validation results and target-write conditions
- `--skip-validation`
  - bypass persistence validation reports for source/target documents
- `--on-error halt|continue`
  - for `copy-all`, choose whether the run stops at the first failed workspace or continues through the rest

Write-safety flags for `copy` and `import`:

- `--backup-target`
  - create a repository-native backup before overwriting an existing target workspace
- `--rollback-on-failure`
  - if a backup was created and the verified write fails, restore the target from that backup

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

Dry-run a migration and emit a JSON validation report:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  copy \
  --workspace-id workspace-household-demo \
  --dry-run \
  --report-path ./tmp/persistence-copy-report.json \
  --source-backend json \
  --source-data-dir ./apps/api/data \
  --target-backend sqlite \
  --target-sqlite-path ./apps/api/data/workspaces.sqlite
```

Copy every workspace from JSON storage into SQLite:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  copy-all \
  --report-path ./tmp/persistence-copy-all-report.json \
  --source-backend json \
  --source-data-dir ./apps/api/data \
  --target-backend sqlite \
  --target-sqlite-path ./apps/api/data/workspaces.sqlite
```

Continue `copy-all` after individual workspace failures while still emitting a non-zero result and JSON report:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  copy-all \
  --report-path ./tmp/persistence-copy-all-report.json \
  --backup-target \
  --rollback-on-failure \
  --on-error continue \
  --source-backend json \
  --source-data-dir ./apps/api/data \
  --target-backend sqlite \
  --target-sqlite-path ./apps/api/data/workspaces.sqlite
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

Import over an existing target with backup-and-rollback safety:

```bash
pnpm --filter @gnucash-ng/api persistence:admin -- \
  import \
  --workspace-id workspace-household-demo \
  --backend sqlite \
  --sqlite-path ./apps/api/data/workspaces.sqlite \
  --input ./tmp/workspace-household-demo.json \
  --backup-target \
  --rollback-on-failure \
  --report-path ./tmp/persistence-import-report.json
```

## Current Rules

- backend selection must be explicit
- Postgres commands require a connection string
- JSON import snapshots still pass through the workspace migration layer before being written
- copy/import writes use the same repository save path as normal runtime persistence
- copy/import can validate both the source document and the persisted target document
- `--dry-run` executes load and validation paths but does not write target workspace data
- rollback only runs when a target backup was created first
- `copy-all` preserves source workspace ids and applies the same validation and backup flags to each copied workspace
- `copy-all` defaults to `--on-error halt`
- `copy-all --on-error continue` still exits non-zero if any workspace fails, but it continues processing later workspaces and records every failure in the JSON report
- this workflow is intended for operator-controlled migration and recovery tasks, not live multi-writer synchronization

## Operator Guidance

Recommended sequence:

1. Run `copy`, `copy-all`, or `import` first with `--dry-run --report-path ...`.
2. Review the validation report before writing target data.
3. When overwriting an existing target workspace, add `--backup-target --rollback-on-failure`.
4. Use the default halt behavior when you want the first failure to stop the migration immediately.
5. Use `--on-error continue` only when partial success is acceptable and you intend to reconcile failures from the generated report.
6. Keep the generated report with the migration record so the source and target validation state is preserved.

## Near-Term Follow-Up

- add broader verification against a real Postgres instance in CI or local integration scripts
- decide whether rollback should become implicit whenever `--backup-target` is enabled
- decide whether operators need a second-stage helper to retry only failed workspaces from a prior `copy-all` report
