# Project Status

Last reviewed: 2026-04-07 (updated post family-scale identity and authorization implementation)

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
- GitHub issue, milestone, and project-board tracking for the current roadmap
- documented branch, PR, and merge workflow for ongoing execution
- GitHub issue and PR templates for idea intake, roadmap work, bug reports, refactors, and pull requests
- documented weekly roadmap review cadence and direct-to-`main` exception for small admin/docs changes
- repo-local Codex plugin scaffolds for GitHub roadmap work, workspace health checks, and financial-boundary review
- first-pass native desktop wrapper assessment for the desktop shell, with a Tauri-first recommendation and Electron fallback criteria
- manual UI review checklist and regression-testing guidance for the desktop and mobile clients
- documented register-first desktop UI direction for the next phase of shell work
- architecture guardrails and baseline metrics documentation for April refactor execution
- web Playwright E2E harness with ledger smoke and keyboard workflow coverage

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
- security baseline documentation and audited hardening for API/runtime boundaries

### Family-Scale Identity And Authorization

- workspace commands for household member management (add, remove, set role)
- audit events for all household member mutations (`household-member.added`, `household-member.removed`, `household-member.role-changed`)
- `"manage"` access level on `WorkspaceAccess` for admin-only member management operations
- service methods for `getHouseholdMembers`, `addHouseholdMember`, `setHouseholdMemberRole`, `removeHouseholdMember`
- HTTP routes: `GET/POST /members`, `PUT /members/:actor/role`, `DELETE /members/:actor`
- last-admin lockout guard: cannot remove or demote the only remaining admin
- documented multi-token and trusted-header/OIDC identity strategies in `docs/api-runtime-operations.md`

### Audit And Observability Foundation

- formal workspace audit-event system for successful financial mutations
- durable audit-event persistence in workspace documents
- health checks, request correlation, and in-process request metrics for the API layer
- transaction lifecycle now includes soft delete by default plus privileged destroy with durable audit coverage

### Security Foundation

- non-loopback API binding requires auth configuration
- typed authentication and workspace-level authorization
- privileged destructive transaction removal separate from ordinary write access
- HTTP body size limits and JSON enforcement
- strict request schema validation for core write routes
- transport-level rate limiting with separate read, mutation, and import thresholds
- response security headers and `no-store` behavior
- path-safe workspace identifier enforcement
- HTTP transport no longer trusts client-supplied actor identity

## Remaining Follow-Up

The repository is no longer mainly missing core backend foundations.

The main remaining work is now product and architecture shaping across a growing idea backlog. The highest-value next areas are:

1. Continue trust and integrity hardening: approval/review semantics for high-trust operations (e.g., second-admin confirmation for destroy), encryption guidance, and broader review controls
2. Budgeting-model definition for remaining-to-budget, rollover, cleanup, and envelope funding semantics
3. Review, automation, and ingestion workflows on top of the current import foundation
4. Encryption-at-rest, key-handling, and broader trust-boundary guidance across supported persistence backends

## Next Suggested Restart Point

Family-scale identity and authorization is now implemented. The next recommended slice is **approval/review semantics for high-trust operations** — the remaining gap from the original family-scale auth intent.

The goal of that pass is:

- a pending-approval model for destructive operations (e.g., a second admin must confirm `destroyTransaction`)
- time-limited approval tokens or out-of-band confirmation flows
- audit events for approval grants and denials

## Deferred Follow-Up

- keep GitHub roadmap issues, milestones, and the `Tally Roadmap` project board aligned as execution moves forward
- keep native desktop wrapper work in idea/discovery state until a bounded wrapper spike is ready to prove local launch, file access, and local API coordination
- track deferred web shell cleanup and ledger rebuild sequencing in `docs/ledger-ui-rebuild-plan.md`

## Backlog Direction

Recent idea intake has clustered into these broader tracks:

- core trust, audit, integrity, and security
- budgeting, envelopes, planning, and forecasting
- layered architecture and account decorators
- automation, sync, and AI-assisted workflows
- family-scale collaboration and review flows

The next roadmap phase should promote a small number of these tracks into bounded implementation slices instead of treating the entire idea backlog as active execution.
