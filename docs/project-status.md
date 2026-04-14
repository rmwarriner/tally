# Project Status

Last reviewed: 2026-04-15

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
- implemented `tally-cli` command package across Phases 1-3 with TypeScript command tree, config module, API client, output formatters, and period/date parsing
- deterministic CLI integration fixture reset flow with fixed test book/account IDs
- deterministic CLI integration fixture reset flow now seeds both JSON and SQLite persistence paths (including managed-auth tokens) so integration behavior is stable across backend defaults
- CLI integration suite passing (47/47) against dev API fixture data
- quality gates passing via `pnpm ci:verify`
- CSS custom property theme architecture with light and dark themes; user-selectable density (compact/comfortable) and amount display style (colour+sign, colour only, sign only) persisted to localStorage; component polish across buttons, inputs, register rows, and status chips
- 2026-04-11: shipped named-theme support in web preferences with a new Gruvbox theme option and persisted selection
- 2026-04-13: completed register visual identity pass with explicit row rhythm, density-aware register typography, embedded inline edit fields, and semantic warning/danger split-balance callouts
- 2026-04-13: added API boundary validation for optional `posting.reconciledAt` to reject malformed ISO 8601 timestamps on POST/PUT transaction payloads with new validation and HTTP coverage
- 2026-04-13: completed GitHub-Issues workflow docs refresh by fixing stale absolute links in `docs/git-workflow.md` and confirming archive/migration references for `docs/issues.md` and `docs/ideas.md`
- 2026-04-13: migrated workflow docs from local queue files to GitHub-Issues-first execution and idea tracking, with `docs/issues.md` and `docs/ideas.md` converted to archive stubs
- 2026-04-14: tightened GitHub PR gates — docs-only PRs skip ci:verify/CodeQL/audit via dynamic `change-scope` job; added `docs-lint.yml` for markdown hygiene; `security.yml` now schedule/dispatch only; `required-gate` job aggregates all quality-gates results
- 2026-04-14: updated AGENTS.md and ai-team-operations.md to reflect GitHub Issues as canonical handoff queue (replaced docs/handoffs/I-NNN.md flow)
- 2026-04-14: updated ci-and-security-gates.md to reflect current workflow topology; converted github-automation-backlog.md items to GitHub Issues #147, #148, #149
- 2026-04-14: removed register panel title, balance chip, date-range selector, and status filter from LedgerRegisterPanel (#133); account chips remain as the primary in-panel filter UI
- 2026-04-14: added prompt caching to claude-review.mjs (#154); system prompt cached with `cache_control: ephemeral` to reduce per-review API cost
- 2026-04-14: removed CodeQL from PR required gates (#156); CodeQL now runs on weekly schedule only via security.yml

## Completed

### Product And Architecture

- product positioning and core requirements documented
- architecture baseline documented
- service-layer next move documented
- GitHub repository initialized and roadmap execution tracking established
- desktop UI direction documented and finalized (ledger book mental model, global period selector, two balance modes, Obsidian-style status bar); wireframe at `docs/design/shell-wireframe.excalidraw`
- shell chrome rebuilt: `ShellTopbar`, `ShellActivityBar`, `CoaSidebar`, `ShellStatusBar`; COA sidebar persistent across all activity views; period selector promoted to global application state; register two balance modes (running balance on complete slice, filtered subtotal on text-search slice); COA contextual quick actions wired to existing mutation handlers

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
- visual design pass: CSS variable architecture, light/dark theme, compact/comfortable density, amount display style (both/color/sign), component polish (buttons, inputs, register rows, chips), preferences persistence
- ledger UI Slice 2 (inline split editing) completed: register split preview now supports quick inline split account/amount/memo editing with reorder/add/remove controls, live balance validation callouts, save-through-service wiring, and dynamic balances-panel as-of date display
- COA account creation flow: `+ Account` and `+ Sub-account` open a real inline creation modal; account POSTed through existing API route; parent type pre-set for sub-accounts
- ledger UI Slice 4 (keyboard hardening): `e` begins inline edit on selected row; Tab/Shift+Tab traverses date→description→payee fields; hotkey suppression regression coverage added
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
- compact pretty log format: startup config printed once as a summary block; subsequent lines are single-line `HH:mm:ss LEVEL  message  key=value` with static infrastructure fields suppressed
- initial persistence abstraction under the API repository, with JSON, SQLite, and Postgres backends now supported plus admin copy/copy-all/export/import workflow, validation reports, dry-run verification, and backup-backed rollback support between them
- SQLite promoted as default API persistence backend; explicit runtime `json` selection remains supported but now logs a deprecation warning
- CI and security quality gates
- PR test-policy gate with required rationale + test-debt issue linkage for approved test exceptions
- changed-line diff coverage gate for production TypeScript source in pull requests
- security baseline documentation and audited hardening for API/runtime boundaries
- CLI-local Vitest config and package-level unit suite for config resolution, API client behavior, output formatting, and date/period parsing
- app-format.ts test coverage expanded to cover all exported functions

### CLI Implementation (Phases 1-3, 2026-04-09)

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
- integration tests now run against deterministic reset data in `tally-cli/src/integration/reset-fixture.ts`
- integration suite passes end-to-end (47/47) against a running dev API
- integration coverage no longer depends on arbitrary environment book/account state
- Phase 2 commands implemented:
  - `tally report net-worth|income|cash-flow|budget|envelopes`
  - `tally import csv|qif|ofx|qfx|gnucash`
  - `tally export qif|ofx|qfx|gnucash`
  - `tally reconcile`
  - `tally backup create|list|restore`
- Phase 3 commands implemented:
  - `tally schedules list|add|execute|skip|defer`
  - `tally approvals list|request|grant|deny`
  - `tally audit list`
  - `tally close` (`--confirm` required, explicit period/range required)
  - `tally members list|add|remove|role`
  - `tally tokens list|new|revoke`
- Phase 3 integration fixture support now seeds deterministic reviewer token data and managed-auth records for approval workflow coverage
- integration suite passes end-to-end (47/47) against a running dev API

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
1. Desktop client — ledger UI Slices 1–4 complete (inline row editing, split editing, multi-register tabs, keyboard hardening); COA account creation flow shipped; next slice TBD from `docs/ledger-ui-rebuild-plan.md` deferred cleanup backlog or a new execution item
2. UI theming: Gruvbox theme as first named theme once custom theme architecture (theme picker, named themes) is implemented; spec in `docs/ideas.md` Track 7

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
- UI theming and visual customisation (Track 7 — Gruvbox as first named theme)

The next roadmap phase should promote a small number of these tracks into bounded implementation slices. See `docs/ideas.md` for the full list and promotion criteria.

- 2026-04-11: I-013 fixed web write paths to send If-Match book version headers across transaction/account/reconciliation/import/budget/envelope/schedule mutations.

- 2026-04-11: I-014 shipped shell redesign slice 1 foundation in web (Geist + JetBrains Mono fonts, Phosphor activity bar icons, and redundant sidebar/overview/inspector chrome removal).

- 2026-04-11: I-015 register-first landing — default view is ledger, last-used account restored from localStorage.

- 2026-04-11: I-016 redesigned the shell inspector panel with collapsed-by-default behavior, keyboard/edge-strip toggles, account summary metrics, and selected-transaction audit/schedule detail.

- 2026-04-11: I-017 applied a typography hierarchy pass with ledger register column alignment, active tab account identity styling, COA account code/balance typography, and refreshed overview/status text scale.

- 2026-04-12: I-018 completed deferred web cleanup by expanding `LedgerOperationsPanels` reconciliation rendering tests and narrowing `NonLedgerMainPanels` by importing utility/API dependencies directly instead of passthrough props.

- 2026-04-12: I-019 refined register visual identity with density-driven cell padding, styled headers, stronger description weight, embedded inline/new-row register inputs, and a saving-row visual state with inline Save label feedback.

- 2026-04-12: I-021 fixed activity bar icon background shape by converting nav/settings controls to centered 36x36 square buttons and removing settings width stretch override.

- 2026-04-12: I-020 replaced register row text actions with compact caret/ellipsis icon controls, dropdown menu actions, double-click inline edit entry, and dirty-cancel discard confirmation.

- 2026-04-12: I-022 added inline status controls (Uncleared/Cleared/Reconciled select) to register inline edit and new-transaction rows, wiring status through to cleared and reconciledAt on postings.

- 2026-04-12: I-024 removed the register search bar and slash-focus shortcut, simplifying register state to range/status/account filters only.

- 2026-04-12: I-026 replaced register status chips with a compact status selector (All/Uncleared/Cleared/Reconciled) while keeping filter behavior unchanged.

- 2026-04-12: I-025 removed persistent bottom ledger panels (Balances and Ledger Operations) and made Advanced Editor render only when explicitly opened.

- 2026-04-12: I-029 redesigned the COA sidebar into collapsible account-type sections with per-section totals and hierarchical disclosure rows for parent/child accounts.

- 2026-04-12: I-027 replaced the ledger register pill row with a real tab strip and trailing + new-tab action, removing the account selector/open-tab controls while preserving close/link behaviors.

- 2026-04-12: I-028 wired COA account click to load into the active register tab and added right-click context-menu navigation to open accounts in new ledger tabs.

- 2026-04-12: I-030 added clickable status-bar balance modes (total/available/both) with persisted localStorage preference and pending-balance detail display.

- 2026-04-14: streamlined GitHub PR automation with context-aware required gating (required-gate), docs-only fast paths, PR concurrency cancellation, and a new docs-lint workflow; documented remaining GitHub automation backlog items.

- 2026-04-14: I-133 removed register panel title chrome plus active-balance/date-range/status toolbar controls, leaving account chips as the only in-panel register filter UI.

- 2026-04-14: I-130 tightened global web density tokens (comfortable + compact) and reduced COA tree indentation to improve data-first information density.
