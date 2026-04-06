# API Runtime Operations

## Scope

This document defines how `apps/api` should be started and configured in development, test, and production-oriented environments.

## Startup Modes

The API now supports explicit runtime modes:

- `development`
  - default for `apps/api/src/dev-server.ts`
  - demo workspace seeding is enabled by default
  - intended for local review and interactive development
- `production`
  - default for `apps/api/src/server.ts`
  - demo workspace seeding is disabled
  - explicit auth configuration is required
- `test`
  - available through `GNUCASH_NG_API_RUNTIME_MODE=test`
  - demo workspace seeding is disabled unless explicitly enabled

## Commands

- local development:
  - `pnpm dev:api`
- production-oriented startup from the repo:
  - `pnpm --filter @gnucash-ng/api start`

The production-oriented startup path now uses the same runtime assembly as development, but with production defaults for auth and seeding behavior.

Administrative persistence migration and export commands are documented in `docs/persistence-migration-workflow.md`.

## Environment Variables

- `GNUCASH_NG_API_RUNTIME_MODE`
  - `development`, `production`, or `test`
  - optional in the entrypoints because the mode is implied by the launcher
- `GNUCASH_NG_API_HOST`
  - bind host
  - defaults to `127.0.0.1`
- `GNUCASH_NG_API_PORT`
  - bind port
  - defaults to `4000`
- `GNUCASH_NG_API_PERSISTENCE_BACKEND`
  - persistence backend selector
  - `json`, `sqlite`, or `postgres`
  - defaults to `json`
- `GNUCASH_NG_API_SQLITE_PATH`
  - sqlite database file path
  - only used when `GNUCASH_NG_API_PERSISTENCE_BACKEND=sqlite`
  - defaults to `workspaces.sqlite` under the configured data directory
- `GNUCASH_NG_API_POSTGRES_URL`
  - postgres connection string
  - required when `GNUCASH_NG_API_PERSISTENCE_BACKEND=postgres`
  - should be supplied through environment or secret injection, not logged
- `GNUCASH_NG_DATA_DIR`
  - workspace data directory
  - defaults to `data` relative to the API process working directory
- `GNUCASH_NG_API_AUTH_TOKEN`
  - simple single-admin auth token
- `GNUCASH_NG_API_AUTH_TOKEN_FILE`
  - path to a file containing the simple single-admin auth token
- `GNUCASH_NG_API_AUTH_IDENTITIES`
  - JSON array of explicit actor and token bindings
- `GNUCASH_NG_API_AUTH_IDENTITIES_FILE`
  - path to a file containing the JSON array of explicit actor and token bindings
- `GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER`
  - request header name used to read actor identity from a trusted upstream gateway
- `GNUCASH_NG_API_AUTH_TRUSTED_ROLE_HEADER`
  - optional request header name used to read role (`admin` or `member`) from a trusted upstream gateway
  - defaults to `x-gnucash-ng-auth-role`
- `GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY`
  - shared key expected in the trusted proxy key header when trusted-header auth is enabled
- `GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE`
  - file containing the shared key expected in the trusted proxy key header
- `GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_HEADER`
  - optional request header name containing the proxy shared key
  - defaults to `x-gnucash-ng-auth-proxy-key`
- `GNUCASH_NG_API_BODY_LIMIT_BYTES`
  - max JSON request body size
- `GNUCASH_NG_API_RATE_LIMIT_WINDOW_MS`
  - shared rate-limit window
- `GNUCASH_NG_API_RATE_LIMIT_READS`
  - per-window read limit
- `GNUCASH_NG_API_RATE_LIMIT_MUTATIONS`
  - per-window mutation limit
- `GNUCASH_NG_API_RATE_LIMIT_IMPORTS`
  - per-window import limit
- `GNUCASH_NG_API_SEED_DEMO_WORKSPACE`
  - `true` or `false`
  - defaults to `true` only in development mode
  - invalid in production mode
- `GNUCASH_NG_API_SHUTDOWN_TIMEOUT_MS`
  - graceful shutdown timeout before shutdown is treated as failed
  - defaults to `10000`
- `GNUCASH_NG_LOG_LEVEL`
  - `debug`, `info`, `warn`, or `error`

## Operational Rules

- production runtime requires explicit auth configuration
- non-loopback binding requires explicit auth configuration
- production runtime cannot auto-seed the demo workspace
- choose exactly one auth source: inline token, inline identities JSON, token file, identities file, or trusted-header auth
- trusted-header auth requires both a trusted actor header and a proxy shared key (inline or file)
- auth secret files must exist, be readable by the API process, and contain non-empty values
- startup must fail fast for invalid numeric, boolean, auth, or runtime-mode configuration
- startup must fail fast for unsupported persistence backend selections
- runtime shutdown should close the HTTP server gracefully on `SIGINT` and `SIGTERM`
- startup logs should confirm the selected runtime mode, persistence backend, data directory, rate limits, and auth source without logging secret material

## Current Deployment Assumptions

- persistence currently supports `json`, `sqlite`, and `postgres`
- `json` stores one workspace file per document under the configured data directory
- `sqlite` stores workspaces and repository-managed backups in a single database file
- `postgres` stores workspaces and repository-managed backups in relational tables behind the same repository contract
- the runtime now assembles persistence through a backend seam rather than hard-coding file storage directly into the repository contract
- workspace backups are stored either under the API data root for `json` or in backend-managed backup tables for `sqlite` and `postgres`
- metrics are exposed from the same API process at `/metrics`
- liveness and readiness are exposed at `/healthz` and `/readyz` (`/health/live` and `/health/ready` remain backward-compatible aliases)
- request correlation is carried through logs with `requestId`
- backup creation and restore are currently exposed through the same authenticated API process

## Secret Handling Guidance

- prefer `*_FILE` auth variables in production-oriented environments so token material stays out of shell history and process managers
- keep auth secret files outside the workspace data directory and restrict file permissions to the API runtime user
- use inline auth variables only for local development, short-lived tests, or other low-risk environments

## Concrete Runbook

The repository now treats the default production deployment target as:

- one Linux host
- one `systemd` API service
- local persistent filesystem storage for workspace data and repository-managed backups

See `docs/api-deployment-and-recovery-runbook.md` for the concrete deployment, smoke-check, backup, and restore procedure.

## Near-Term Follow-Up

- add external metrics, tracing sinks, and alert routing once the hosting target is selected beyond the single-node default
- add encryption-at-rest and key-handling guidance once secret-management and external backup targets are finalized
