# Service Layer

## Current Implementation

The repository now includes an application service layer in `apps/api`.

Implemented pieces:

- file-system workspace repository
- read service for loading workspace documents
- read service for dashboard projections
- write service for transaction creation
- write service for transaction updates
- write service for reconciliation
- write service for CSV import
- write service for baseline budget lines, envelopes, envelope allocations, scheduled transaction execution, and schedule exceptions
- HTTP request handler for read and write routes
- Node HTTP server adapter
- structured service-layer logging
- persistence of workspace mutations back to disk
- web read integration for workspace and dashboard loading
- web write integration for transaction posting, reconciliation, CSV import, budgets, envelopes, and schedules
- mobile read integration for workspace and dashboard loading
- mobile write integration for transaction capture, reconciliation capture, schedules, due approvals, schedule exceptions, and envelope operations
- strict request schema validation for core write routes
- auth, authorization, actor handling, body limits, security headers, and rate limiting at the HTTP boundary
- local development seeding of the demo workspace for first-run UI review

## Current Shape

Key files:

- `apps/api/src/repository.ts`
- `apps/api/src/service.ts`
- `apps/api/src/types.ts`

The service layer now exposes:

- command-oriented service methods
- HTTP request handling over `Request` / `Response`
- a Node server adapter for runtime hosting

## Local Development

Run:

- `pnpm dev:api`
- `pnpm dev:web`

Defaults:

- API host: `127.0.0.1`
- API port: `4000`
- data directory: `./data` relative to the API process working directory

When started through the repository root with `pnpm dev:api`, the default data directory resolves to:

- `apps/api/data`

Supported environment variables:

- `GNUCASH_NG_API_HOST`
- `GNUCASH_NG_API_PORT`
- `GNUCASH_NG_DATA_DIR`
- `GNUCASH_NG_LOG_LEVEL`

The web app proxies `/api` requests to `http://127.0.0.1:4000` during Vite development.
On local development startup, the API seeds `workspace-household-demo.json` automatically if it is missing from the data directory.

## Current Gaps

- no production runtime/bootstrap script yet
- no metrics or tracing
- no external audit stream beyond workspace persistence
- no OFX, QFX, QIF, or GnuCash XML adapters yet
- no reporting or close workflow yet
- no backup, migration, or restore strategy yet

## Recommended Next Steps

1. Add metrics, tracing, and health checks
2. Add configuration and secret management operations
3. Extend import/export support beyond CSV
4. Add reporting engine and close workflow
5. Add backup, migration, and restore strategy
