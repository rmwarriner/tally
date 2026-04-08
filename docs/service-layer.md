# Service Layer

Last reviewed: 2026-04-08

## Current Implementation

The repository now includes an application service layer in `apps/api`.

Implemented pieces:

- file-system workspace repository
- read service for loading workspace documents
- read service for dashboard projections
- write service for transaction creation
- write service for transaction updates
- write service for transaction soft delete
- privileged write service for transaction destroy
- write service for reconciliation
- write service for CSV import
- write service for QIF import
- write service for OFX and QFX statement imports
- write service for GnuCash XML workspace imports
- read service for QIF export
- read service for OFX, QFX, and GnuCash XML exports
- read service for net worth, income statement, budget-vs-actual, and envelope summary reports
- read service for cash-flow reports
- read service for period close summaries
- write service for durable period close recording
- repository-backed backup creation, listing, and restore flows
- write service for baseline budget lines, envelopes, envelope allocations, scheduled transaction execution, and schedule exceptions
- HTTP request handler for read and write routes
- Node HTTP server adapter
- structured service-layer logging
- request correlation via `x-request-id` in the HTTP layer
- liveness and readiness endpoints for API health checks
- in-memory Prometheus-style request metrics exposed at `/metrics`
- persistence of workspace mutations back to disk
- web read integration for workspace and dashboard loading
- web write integration for transaction posting, reconciliation, CSV import, budgets, envelopes, and schedules
- mobile read integration for workspace and dashboard loading
- mobile write integration for transaction capture, reconciliation capture, schedules, due approvals, schedule exceptions, and envelope operations
- strict request schema validation for core write routes
- strict request/query validation for QIF, OFX, QFX, and GnuCash XML routes
- auth, authorization, actor handling, body limits, security headers, and rate limiting at the HTTP boundary
- local development seeding of the demo workspace for first-run UI review
- explicit runtime modes for development and production-oriented startup
- graceful HTTP server shutdown handling on `SIGINT` and `SIGTERM`
- file-backed auth secret loading for production-oriented runtime configuration
- safe startup logging for runtime configuration without secret material
- load-time migration of legacy workspace documents into the current schema
- an explicit persistence backend seam underneath the repository, with the current JSON/file implementation wired through it
- a sqlite persistence backend with the same repository contract for load, save, backup, and restore flows
- a postgres persistence backend with the same repository contract for load, save, backup, and restore flows
- an admin persistence migration and export workflow for copy, copy-all, export, and import operations across supported backends
- dry-run validation reports plus backup-backed rollback handling for persistence copy and import operations
- multi-book persistence migration, partial-failure policy controls, and retry-from-report workflow across supported backends
- concrete deployment and recovery runbook for a single-node Linux `systemd` target
- household member management service and HTTP routes (`GET/POST /api/books/:id/members`, `PUT /api/books/:id/members/:actor/role`, `DELETE /api/books/:id/members/:actor`)
- approval/review semantics for destructive operations: `requestApproval`, `grantApproval`, `denyApproval` service methods and HTTP routes (`GET/POST /api/books/:id/approvals`, `POST /api/books/:id/approvals/:approvalId/grant`, `POST /api/books/:id/approvals/:approvalId/deny`)

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
- `pnpm --filter @tally/api start`

Defaults:

- API host: `127.0.0.1`
- API port: `4000`
- data directory: `./data` relative to the API process working directory

When started through the repository root with `pnpm dev:api`, the default data directory resolves to:

- `apps/api/data`

Supported environment variables:

- `TALLY_API_RUNTIME_MODE`
- `TALLY_API_HOST`
- `TALLY_API_PERSISTENCE_BACKEND`
- `TALLY_API_POSTGRES_URL`
- `TALLY_API_SQLITE_PATH`
- `TALLY_API_PORT`
- `TALLY_DATA_DIR`
- `TALLY_API_SEED_DEMO_WORKSPACE`
- `TALLY_API_SHUTDOWN_TIMEOUT_MS`
- `TALLY_LOG_LEVEL`
- `TALLY_LOG_FORMAT`
- `TALLY_API_AUTH_TOKEN`
- `TALLY_API_AUTH_TOKEN_FILE`
- `TALLY_API_AUTH_IDENTITIES`
- `TALLY_API_AUTH_IDENTITIES_FILE`
- `TALLY_API_BODY_LIMIT_BYTES`
- `TALLY_API_RATE_LIMIT_WINDOW_MS`
- `TALLY_API_RATE_LIMIT_READS`
- `TALLY_API_RATE_LIMIT_MUTATIONS`
- `TALLY_API_RATE_LIMIT_IMPORTS`

The web app proxies `/api` requests to `http://127.0.0.1:4000` during Vite development.
On local development startup, the API seeds `workspace-household-demo.json` automatically if it is missing from the data directory.
Production-oriented startup does not seed demo data and requires explicit auth configuration.

See `docs/api-runtime-operations.md` and `docs/api-deployment-and-recovery-runbook.md` for the current runtime-mode and deployment-facing guidance.
See `docs/persistence-migration-workflow.md` for backend migration and export commands.

## Current Gaps

- no durable metrics backend yet beyond in-process `/metrics`
- no distributed tracing yet beyond request correlation ids in logs and responses
- no external audit stream beyond book persistence
- no encryption-at-rest or external key-management guidance yet beyond the current idea backlog

## Recommended Next Steps

1. Book provisioning endpoints — `POST /api/books` and `GET /api/books` for self-service onboarding
2. Trust and integrity hardening — concurrent write safety (optimistic locking), idempotency keys
3. Add encryption-at-rest guidance and decide where key material should live across `json`, `sqlite`, and `postgres`
4. Add external observability sinks once hosting is selected beyond the single-node default

See `docs/project-status.md` for current project state.
