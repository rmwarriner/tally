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

Common safety flags:

- `--dry-run`
  - validate and inspect the operation without writing target data
- `--report-path <path>`
  - write a JSON report describing validation results and target-write conditions
- `--skip-validation`
  - bypass persistence validation reports for source/target documents

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
- this workflow is intended for operator-controlled migration and recovery tasks, not live multi-writer synchronization

## Operator Guidance

Recommended sequence:

1. Run `copy` or `import` first with `--dry-run --report-path ...`.
2. Review the validation report before writing target data.
3. When overwriting an existing target workspace, add `--backup-target --rollback-on-failure`.
4. Keep the generated report with the migration record so the source and target validation state is preserved.

## Near-Term Follow-Up

- add broader verification against a real Postgres instance in CI or local integration scripts
- decide whether to add a higher-level workspace migration command that can enumerate multiple workspaces in one run
- decide whether rollback should become implicit whenever `--backup-target` is enabled
