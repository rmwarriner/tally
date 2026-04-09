# Project Status

Last reviewed: 2026-04-09 (CLI Phase 1 implemented in package; integration validation pending)

## Current State

This repository currently includes:

- product and architecture foundation documents
- shared domain logic for ledger, budgets, schedules, and reporting inputs
- workspace-level reporting read models and close summaries
- workspace document model with commands, selectors, reconciliation, and multi-format import/export adapters
- application service layer for read/write orchestration and persistence
- HTTP transport for service-layer routes
- service-backed web and mobile clients for core household finance workflows
- TDD baseline with automated unit tests
- structured logging foundation with workspace-layer instrumentation
- GitHub issue and milestone tracking for roadmap execution work
- documented branch, PR, and merge workflow for ongoing execution
- GitHub issue and PR templates for idea intake, roadmap work, bug reports, refactors, and pull requests
- documented weekly roadmap review cadence and direct-to-`main` exception for small admin/docs changes
- repo-local Codex plugin scaffolds for GitHub roadmap work, workspace health checks, and financial-boundary review
- first-pass native desktop wrapper assessment for the desktop shell, with a Tauri-first recommendation and Electron fallback criteria
- manual UI review checklist and regression-testing guidance for the desktop and mobile clients
- documented register-first desktop UI direction for the next phase of shell work
- architecture guardrails and baseline metrics documentation for April refactor execution
- web Playwright E2E harness with ledger smoke and keyboard workflow coverage
- CLI command surface spec with phased rollout plan (`docs/cli-spec.md`)
- implemented `tally-cli` Phase 1 command package with TypeScript command tree, config module, API client, output formatters, and period/date parsing

## Completed

### Product And Architecture

- product positioning and core requirements documented
- architecture baseline documented
- service-layer next move documented
- GitHub repository initialized and roadmap execution tracking established
- desktop UI direction documented around a register-first shell model

### Domain And Workspace

- double-entry transaction validation
- ledger posting and balance computation
- baseline budget calculations
- envelope budget calculations
- recurring schedule materialization
- workspace document model
- reconciliation support
- CSV import with duplicate detection
- QIF import and export foundation
- OFX and QFX statement import and export foundation
- GnuCash XML workspace snapshot import and export foundation
- JSON workspace persistence
- report generation for net worth, income statement, budget-vs-actual, and envelope summary
- cash-flow reporting
- durable close periods with period-lock enforcement for back-dated ledger writes
- filesystem-native backup creation, listing, and restore flows
- load-time workspace migration for legacy document snapshots

### Service Layer

- file-system workspace repository
- service methods for workspace reads and dashboard projections
- service methods for transaction creation, transaction updates, soft delete, privileged destroy, reconciliation, and CSV import
- service methods for QIF import and QIF export
- service methods for reports and close-summary reads
- HTTP handler for workspace and dashboard reads plus core write routes
- Node HTTP server adapter
- runnable API bootstrap and local development server wiring
- explicit development and production-oriented API runtime entry paths
- service-layer logging around command execution and persistence
- automatic demo workspace seeding for local `pnpm dev:api` startup

### Client Integration

- web workspace reads now load through service-backed API calls
- web transaction posting, transaction editing, CSV import, and reconciliation now write through service-backed API calls
- web baseline budget editing, envelope setup/allocation, and schedule editing now write through service-backed API calls
- web desktop shell now includes workspace navigation, ledger drill-down, keyboard register navigation, account code/name search, account autocomplete, active-ledger balance context, transaction status display, date-range register filtering, reconciliation matching, and a fuller register detail pane
- mobile workspace reads and dashboard reads now load through service-backed API calls
- mobile envelope operations, transaction capture, schedule editing, due-schedule approvals, and schedule exceptions now write through the same authenticated service boundary
- mobile reconciliation capture now records statement sessions through the same service boundary
- mobile schedule editing now supports multi-account template postings with inline validation and account pickers

### Engineering Standards

- Vitest test harness and TDD policy
- manual UI review checklist for desktop and mobile
- regression-testing guidance that distinguishes unit, integration, and UI workflow coverage
- structured logging package and logging standards
- typed configuration and boundary error handling standard
- documented API runtime operations for environment, startup mode, and shutdown behavior
- concrete single-host deployment and recovery runbook for the API runtime
- file-backed auth secret loading and safe runtime configuration logging
- runtime-selectable log output format (`auto`, `pretty`, `json`) for human-friendly local console output and structured production logs
- initial persistence abstraction under the API repository, with JSON, SQLite, and Postgres backends now supported plus admin copy/copy-all/export/import workflow, validation reports, dry-run verification, and backup-backed rollback support between them
- CI and security quality gates
- PR test-policy gate with required rationale + test-debt issue linkage for approved test exceptions
- changed-line diff coverage gate for production TypeScript source in pull requests
- security baseline documentation and audited hardening for API/runtime boundaries
- CLI-local Vitest config and package-level unit suite for config resolution, API client behavior, output formatting, and date/period parsing

### CLI Phase 1 Implementation (2026-04-09)

- CLI entrypoint implemented in `tally-cli/src/index.ts` with global flags and standardized error handling
- Phase 1 commands implemented:
  - `tally books list`
  - `tally books new <name>`
  - `tally use <bookId>`
  - `tally` and `tally dashboard`
  - `tally transactions list` (`tally reg`, `tally transactions ls`)
  - `tally transactions add` (`tally add`) with direct and interactive multi-posting flows
  - `tally accounts list` (`tally bal`)
- config precedence implemented (flag > env > config file) with secure `0600` write behavior for `~/.tally/config.json`
- API client implemented with query serialization, auth header wiring, normalized error mapping, and optimistic-write precondition handling for book write routes
- package-level `typecheck` and unit tests pass locally
- integration tests are present (`tally-cli/src/integration`) but still require execution against a running dev API for final Phase 1 verification

### Approval And Review Semantics

- `PendingApproval` model in book document (`kind`, `entityId`, `requestedBy`, `expiresAt`, `status`, `reviewedBy`)
- 24-hour TTL on pending approvals
- `requestApproval` command: admin creates a pending destroy-transaction approval
- `grantApproval` command: second admin (must differ from requester) grants approval, immediately executes the destroy
- `denyApproval` command: any admin denies the approval, leaving the transaction intact
- Self-approval guard: requester cannot also be the reviewer
- Expiry guard: grants after TTL are rejected
- Audit events: `approval.requested`, `approval.granted`, `approval.denied`
- Service methods: `getApprovals`, `requestApproval`, `grantApproval`, `denyApproval` — all at `destroy` access level
- HTTP routes: `GET/POST /api/books/:id/approvals`, `POST /api/books/:id/approvals/:approvalId/grant`, `POST /api/books/:id/approvals/:approvalId/deny`

### Family-Scale Identity And Authorization

- book commands for household member management (add, remove, set role)
- audit events for all household member mutations (`household-member.added`, `household-member.removed`, `household-member.role-changed`)
- `"manage"` access level on `BookAccess` for admin-only member management operations
- service methods for `getHouseholdMembers`, `addHouseholdMember`, `setHouseholdMemberRole`, `removeHouseholdMember`
- HTTP routes: `GET/POST /api/books/:id/members`, `PUT /api/books/:id/members/:actor/role`, `DELETE /api/books/:id/members/:actor`
- last-admin lockout guard: cannot remove or demote the only remaining admin
- documented multi-token and trusted-header/OIDC identity strategies in `docs/api-runtime-operations.md`

### Audit And Observability Foundation

- formal book audit-event system for successful financial mutations
- durable audit-event persistence in book documents
- health checks, request correlation, and in-process request metrics for the API layer
- optional external observability via OpenTelemetry OTLP export (traces + metrics) with canonical route-label parity
- request log correlation fields (`traceId`, `spanId`) when observability export is enabled
- transaction lifecycle now includes soft delete by default plus privileged destroy with durable audit coverage

### Security Foundation

- non-loopback API binding requires auth configuration
- typed authentication and book-level authorization
- privileged destructive transaction removal separate from ordinary write access
- HTTP body size limits and JSON enforcement
- strict request schema validation for core write routes
- transport-level rate limiting with separate read, mutation, and import thresholds
- response security headers and `no-store` behavior
- path-safe book identifier enforcement
- HTTP transport no longer trusts client-supplied actor identity
- documented encryption-at-rest baseline and key-management guidance for books, backups, attachments, and backend storage/snapshots

### API Completions

- CORS configuration: allowlist-based origin validation with dev/prod mode fallback
- Audit event read endpoint: `GET /api/books/:id/audit-events` with `since`, `eventType`, and `limit` filters
- Account management routes: `GET /api/books/:id/accounts`, `POST /api/books/:id/accounts` (upsert), `DELETE /api/books/:id/accounts/:accountId` (archive); `upsertAccount` and `archiveAccount` commands with `account.upserted` and `account.archived` audit events
- Book provisioning endpoints: `GET /api/books` (actor-scoped summaries) and `POST /api/books` (minimal payload provisioning)
- Restore endpoint: `POST /api/books/:bookId/transactions/:transactionId/restore`
- Server-side transaction query endpoint with filters/cursor pagination: `GET /api/books/:bookId/transactions`
- Attachment/file linking support: upload/download and transaction link/unlink endpoints
- API versioning parity: `/api/v1/...` canonical with `/api/...` compatibility alias
- Trust/integrity hardening: book-level optimistic locking (`If-Match`), POST idempotency keys, managed token/session endpoints

### Terminology Alignment

- Renamed financial container from "workspace" to "book" throughout: `packages/book/` (was `packages/workspace/`), `@tally/book` (was `@tally/workspace`), API routes now `/api/books/:id/...`

## Remaining Follow-Up

The repository is no longer mainly missing core backend foundations.

**Near-term client work:**
1. CLI Phase 1 validation and hardening — run integration suite against dev API, close contract gaps, and complete acceptance verification for I-002
2. CLI Phase 2 (data operations) — import/export, reports, reconciliation, backup
3. CLI Phase 3 (second tier) — schedules, approvals, audit, close, members, tokens
4. Desktop client — Tauri-first shell (Electron fallback); register-first UI direction documented; pending Figma design completion

**Longer-horizon product and architecture work:**
1. Budgeting-model definition for remaining-to-budget, rollover, cleanup, and envelope funding semantics
2. Review, automation, and ingestion workflows on top of the current import foundation
3. Observability operations beyond export plumbing: alert routing, SLO ownership, and dashboard/runbook expectations
4. App-layer encryption-at-rest execution planning and migration strategy across `json`, `sqlite`, and `postgres`

## Deferred Follow-Up

- keep GitHub roadmap issues and milestones aligned as execution moves forward; idea backlog lives in `docs/ideas.md`
- keep native desktop wrapper work in idea/discovery state until a bounded wrapper spike is ready to prove local launch, file access, and local API coordination
- track deferred web shell cleanup and ledger rebuild sequencing in `docs/ledger-ui-rebuild-plan.md`

## Backlog Direction

The idea backlog is organized by track in `docs/ideas.md`:

- core trust, audit, integrity, and security
- budgeting, envelopes, planning, and forecasting
- layered architecture and account decorators
- automation, sync, and AI-assisted workflows
- family-scale collaboration and review flows
- operations and infrastructure

The next roadmap phase should promote a small number of these tracks into bounded implementation slices. See `docs/ideas.md` for the full list and promotion criteria.
