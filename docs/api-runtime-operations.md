# API Runtime Operations

Last reviewed: 2026-04-07

## Scope

This document defines how `apps/api` should be started and configured in development, test, and production-oriented environments.

## Startup Modes

The API now supports explicit runtime modes:

- `development`
  - default for `apps/api/src/dev-server.ts`
  - demo book seeding is enabled by default
  - intended for local review and interactive development
- `production`
  - default for `apps/api/src/server.ts`
  - demo book seeding is disabled
  - explicit auth configuration is required
- `test`
  - available through `TALLY_API_RUNTIME_MODE=test`
  - demo book seeding is disabled unless explicitly enabled

## Commands

- local development:
  - `pnpm dev:api`
- production-oriented startup from the repo:
  - `pnpm --filter @tally/api start`

The production-oriented startup path now uses the same runtime assembly as development, but with production defaults for auth and seeding behavior.

Administrative persistence migration and export commands are documented in `docs/persistence-migration-workflow.md`.

## Environment Variables

- `TALLY_API_RUNTIME_MODE`
  - `development`, `production`, or `test`
  - optional in the entrypoints because the mode is implied by the launcher
- `TALLY_API_HOST`
  - bind host
  - defaults to `127.0.0.1`
- `TALLY_API_PORT`
  - bind port
  - defaults to `4000`
- `TALLY_API_PERSISTENCE_BACKEND`
  - persistence backend selector
  - `json`, `sqlite`, or `postgres`
  - defaults to `json`
- `TALLY_API_SQLITE_PATH`
  - sqlite database file path
  - only used when `TALLY_API_PERSISTENCE_BACKEND=sqlite`
  - defaults to `books.sqlite` under the configured data directory
- `TALLY_API_POSTGRES_URL`
  - postgres connection string
  - required when `TALLY_API_PERSISTENCE_BACKEND=postgres`
  - should be supplied through environment or secret injection, not logged
- `TALLY_DATA_DIR`
  - book data directory
  - defaults to `data` relative to the API process working directory
- `TALLY_API_AUTH_TOKEN`
  - simple single-admin auth token
- `TALLY_API_AUTH_TOKEN_FILE`
  - path to a file containing the simple single-admin auth token
- `TALLY_API_AUTH_IDENTITIES`
  - JSON array of explicit actor and token bindings
- `TALLY_API_AUTH_IDENTITIES_FILE`
  - path to a file containing the JSON array of explicit actor and token bindings
- `TALLY_API_AUTH_TRUSTED_ACTOR_HEADER`
  - request header name used to read actor identity from a trusted upstream gateway
- `TALLY_API_AUTH_TRUSTED_ROLE_HEADER`
  - optional request header name used to read role (`admin` or `member`) from a trusted upstream gateway
  - defaults to `x-tally-auth-role`
- `TALLY_API_AUTH_TRUSTED_PROXY_KEY`
  - shared key expected in the trusted proxy key header when trusted-header auth is enabled
- `TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE`
  - file containing the shared key expected in the trusted proxy key header
- `TALLY_API_AUTH_TRUSTED_PROXY_KEY_HEADER`
  - optional request header name containing the proxy shared key
  - defaults to `x-tally-auth-proxy-key`
- `TALLY_API_BODY_LIMIT_BYTES`
  - max JSON request body size
- `TALLY_API_RATE_LIMIT_WINDOW_MS`
  - shared rate-limit window
- `TALLY_API_RATE_LIMIT_READS`
  - per-window read limit
- `TALLY_API_RATE_LIMIT_MUTATIONS`
  - per-window mutation limit
- `TALLY_API_RATE_LIMIT_IMPORTS`
  - per-window import limit
- `TALLY_API_SEED_DEMO_WORKSPACE`
  - `true` or `false`
  - defaults to `true` only in development mode
  - invalid in production mode
- `TALLY_API_SHUTDOWN_TIMEOUT_MS`
  - graceful shutdown timeout before shutdown is treated as failed
  - defaults to `10000`
- `TALLY_LOG_LEVEL`
  - `debug`, `info`, `warn`, or `error`
- `TALLY_LOG_FORMAT`
  - `auto`, `pretty`, or `json`
  - defaults to `auto`
  - `auto` uses `pretty` when stdout is an interactive terminal and `json` otherwise

## Rename Transition Compatibility

During the rename transition, the API runtime accepts both new and legacy keys.
When both are present, canonical `TALLY_*` values win.

- canonical: `TALLY_API_*`, `TALLY_LOG_*`
- legacy fallback: `GNUCASH_NG_API_*`, `GNUCASH_NG_LOG_*`

Header compatibility during transition:

- canonical api key header: `x-tally-api-key`
- legacy api key header accepted: `x-gnucash-ng-api-key`

## Operational Rules

- production runtime requires explicit auth configuration
- non-loopback binding requires explicit auth configuration
- production runtime cannot auto-seed the demo book
- choose exactly one auth source: inline token, inline identities JSON, token file, identities file, or trusted-header auth
- trusted-header auth requires both a trusted actor header and a proxy shared key (inline or file)
- auth secret files must exist, be readable by the API process, and contain non-empty values
- startup must fail fast for invalid numeric, boolean, auth, or runtime-mode configuration
- startup must fail fast for unsupported persistence backend selections
- runtime shutdown should close the HTTP server gracefully on `SIGINT` and `SIGTERM`
- startup logs should confirm the selected runtime mode, persistence backend, data directory, rate limits, and auth source without logging secret material
- book authorization is role-scoped per book membership:
  - `member`: read and standard write mutations
  - `guardian`: member access plus operate-level mutations (imports, backups, close-period operations)
  - `admin`: guardian access plus destructive transaction destroy and household member management
  - `local-admin`: runtime bootstrap/admin bypass for local operator contexts
- book role bindings are stored in `householdMemberRoles` on each book document and enforced by the API service layer
- mutation audit events include authorization context (`actorRole` and `authorization`) in event summaries
- household member management is available through dedicated routes:
  - `GET /api/books/:id/members` — list members and their roles (any member)
  - `POST /api/books/:id/members` — add a member (admin only)
  - `PUT /api/books/:id/members/:actor/role` — set a member role (admin only)
  - `DELETE /api/books/:id/members/:actor` — remove a member (admin only)
  - the last admin of a book cannot be removed or demoted; all changes emit audit events
- approval/review workflows for high-trust operations are available through dedicated routes:
  - `GET /api/books/:id/approvals` — list pending approvals (any member)
  - `POST /api/books/:id/approvals` — request an approval (admin only; currently supports `destroy-transaction`)
  - `POST /api/books/:id/approvals/:approvalId/grant` — grant an approval (admin only; must be a different admin than the requester; executes the operation on grant)
  - `POST /api/books/:id/approvals/:approvalId/deny` — deny an approval (admin only)
  - approvals expire after 24 hours; grants after the TTL are rejected
  - all approval state changes emit audit events (`approval.requested`, `approval.granted`, `approval.denied`)

## Multi-Actor Identity Strategies

Two auth strategies support family-scale deployments where each household member has their own identity.

### Multi-Token Identities

Use `TALLY_API_AUTH_IDENTITIES` (or `TALLY_API_AUTH_IDENTITIES_FILE` for secret-file storage) to assign each family member a distinct token:

```json
[
  { "actor": "Alice", "role": "admin", "token": "tok-alice-..." },
  { "actor": "Bob",   "role": "member", "token": "tok-bob-..."  }
]
```

Each token resolves to the named actor. That actor is then checked against `householdMembers` in each book to determine whether access is granted, and `householdMemberRoles` to determine the effective book role.

Prefer `TALLY_API_AUTH_IDENTITIES_FILE` in production so token material stays out of process-manager environment logs.

### Trusted-Header / OIDC

Use `TALLY_API_AUTH_TRUSTED_*` variables to delegate identity resolution to an upstream proxy such as Cloudflare Access or another OIDC gateway. The proxy authenticates the user, then injects actor identity as request headers that Tally trusts after verifying a shared proxy key:

| Environment variable | Purpose | Default header name |
|---|---|---|
| `TALLY_API_AUTH_TRUSTED_ACTOR_HEADER` | Header carrying the authenticated actor name | (required, no default) |
| `TALLY_API_AUTH_TRUSTED_ROLE_HEADER` | Header carrying `admin` or `member` | `x-tally-auth-role` |
| `TALLY_API_AUTH_TRUSTED_PROXY_KEY_HEADER` | Header carrying the shared proxy key | `x-tally-auth-proxy-key` |
| `TALLY_API_AUTH_TRUSTED_PROXY_KEY` | Inline shared key (use file variant in production) | — |
| `TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE` | Path to file containing the shared key | — |

**Cloudflare Access integration example:**

1. Configure a Cloudflare Access application in front of the Tally API.
2. Set `TALLY_API_AUTH_TRUSTED_ACTOR_HEADER=cf-access-authenticated-user-email` (or a custom JWT claim header).
3. Set `TALLY_API_AUTH_TRUSTED_ROLE_HEADER` to whichever header carries role information from your Access policy.
4. Set `TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE` to a file containing a long random secret shared with the proxy.
5. Configure Access to inject that secret as the `x-tally-auth-proxy-key` header on every forwarded request.
6. Ensure the API is not reachable except through the Access-protected entry point.

The Tally API validates the proxy key before trusting any injected actor or role header. Requests without a valid proxy key are rejected with `401`.

## Current Deployment Assumptions

- persistence currently supports `json`, `sqlite`, and `postgres`
- `json` stores one book file per document under the configured data directory
- `sqlite` stores workspaces and repository-managed backups in a single database file
- `postgres` stores workspaces and repository-managed backups in relational tables behind the same repository contract
- the runtime now assembles persistence through a backend seam rather than hard-coding file storage directly into the repository contract
- book backups are stored either under the API data root for `json` or in backend-managed backup tables for `sqlite` and `postgres`
- metrics are exposed from the same API process at `/metrics`
- liveness and readiness are exposed at `/healthz` and `/readyz` (`/health/live` and `/health/ready` remain backward-compatible aliases)
- request correlation is carried through logs with `requestId`
- backup creation and restore are currently exposed through the same authenticated API process

## Secret Handling Guidance

- prefer `*_FILE` auth variables in production-oriented environments so token material stays out of shell history and process managers
- keep auth secret files outside the book data directory and restrict file permissions to the API runtime user
- use inline auth variables only for local development, short-lived tests, or other low-risk environments

## Concrete Runbook

The repository now treats the default production deployment target as:

- one Linux host
- one `systemd` API service
- local persistent filesystem storage for book data and repository-managed backups

See `docs/api-deployment-and-recovery-runbook.md` for the concrete deployment, smoke-check, backup, and restore procedure.

## Near-Term Follow-Up

- add external metrics, tracing sinks, and alert routing once the hosting target is selected beyond the single-node default
- add encryption-at-rest and key-handling guidance once secret-management and external backup targets are finalized
