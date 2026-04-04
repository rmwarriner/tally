# Service Layer

## Current Implementation

The repository now includes an application service layer in `apps/api`.

Implemented pieces:

- file-system workspace repository
- read service for loading workspace documents
- read service for dashboard projections
- write service for transaction creation
- write service for reconciliation
- write service for CSV import
- HTTP request handler for read and write routes
- Node HTTP server adapter
- structured service-layer logging
- persistence of workspace mutations back to disk
- web read integration for workspace and dashboard loading
- web write integration for transaction posting, reconciliation, and CSV import
- strict request schema validation for core write routes

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
- data directory: `./data`

Supported environment variables:

- `GNUCASH_NG_API_HOST`
- `GNUCASH_NG_API_PORT`
- `GNUCASH_NG_DATA_DIR`
- `GNUCASH_NG_LOG_LEVEL`

The web app proxies `/api` requests to `http://127.0.0.1:4000` during Vite development.

## Current Gaps

- no production runtime/bootstrap script yet
- no auth or actor identity integration beyond explicit request fields
- no request validation middleware
- no metrics or tracing
- no external audit stream beyond workspace persistence
- no mobile client integration yet
- no richer UI workflows for envelopes, schedules, or budget editing

## Recommended Next Steps

1. Add typed configuration and error handling
2. Add auth, permissions, and request correlation ids
3. Add rate limiting, metrics, and tracing
4. Add mobile client integration
5. Add richer UI workflows for envelopes, schedules, and budget editing
