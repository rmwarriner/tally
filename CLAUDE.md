# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Tally Is

Tally is a personal finance system combining strict double-entry accounting with two complementary budgeting modes: a traditional baseline budget and an operational envelope budgeting layer. The ledger is always the source of truth — budgets and envelopes annotate it, never replace it.

## Monorepo Layout

This is a `pnpm` monorepo. The flattened structure (as of the latest refactor) is:

- `apps/api/` — Node HTTP API: auth, validation, rate limiting, book persistence, import/export, audit events
- `apps/web/` — Vite-based desktop/web shell (VS Code-inspired keyboard-first UI)
- `apps/mobile/` — Expo/React Native mobile companion (quick capture, approvals, envelope ops)
- `packages/domain/` — pure TypeScript accounting, ledger, budgeting, schedules, envelopes (no side effects)
- `packages/book/` — book document model, commands, selectors, persistence adapters (json/sqlite/postgres behind one repository contract), reconciliation, and audit events
- `packages/logging/` — structured logging utilities
- `packages/ui/` — shared UI tokens and view model helpers
- `tally-cli/` — CLI tool
- `tally-desktop/` — native desktop wrapper
- `scripts/` — CI and metrics utilities
- `docs/` — authoritative architecture, standards, and roadmap documents

Tests live next to source as `*.test.ts` files.

## Commands

```bash
pnpm test              # run full Vitest suite
pnpm test:watch        # continuous test run during development
pnpm coverage          # tests with coverage reporting
pnpm typecheck         # TypeScript checks across all workspaces
pnpm ci:verify         # local equivalent of CI gate (typecheck + test + coverage + secrets scan)
pnpm dev:api           # start API server (auto-seeds demo workspace on first run)
pnpm dev:web           # start web client
pnpm dev:mobile        # start Expo mobile client
pnpm security:secrets  # scan for accidentally committed secrets
```

To run tests for a single package: `pnpm --filter @tally/domain test` (replace with `@tally/api`, `@tally/book`, etc.)

## Architecture

### Layer Rules

- `packages/domain` is pure business logic — no I/O, no side effects. This is where ledger invariants, accounting rules, and budget/envelope logic live.
- `packages/book` sits above domain: book document model, write commands, persistence adapters, and reconciliation. Commands are the only way to mutate book state.
- `apps/api` is the single operational boundary for all persistence, auth, validation, audit events, and import/export. Clients do not bypass it.
- Web and mobile clients share the same service contract. Neither has privileged access.

### Persistence

The API supports pluggable backends (`json`, `sqlite`, `postgres`) behind one repository interface. Do not assume JSON-only storage. See `docs/api-runtime-operations.md` for the operational model.

### Audit & Integrity

Financial mutations emit structured audit events. These are non-negotiable — do not remove or skip audit event emission when modifying mutation paths. Validate all external inputs at the API boundary; never trust client-supplied actor identity.

## Testing Policy

TDD is the default: write a failing test first, implement the minimum fix, then refactor.

Coverage thresholds: **80% statements, 80% branches, 80% functions, 80% lines**

Test placement by concern:
- Ledger invariants and domain rules → `packages/domain` unit tests
- Book commands and selectors → `packages/book` unit tests
- API handlers → handler-level tests in `apps/api`
- Import parsers → fixture-driven tests
- Bug fixes require a regression test before the fix is considered complete

## Coding Conventions

- TypeScript throughout, 2-space indentation
- `camelCase` for variables/functions, `PascalCase` for components and exported types
- Keep `packages/domain` and `packages/book` side-effect free unless the file is explicitly at an operational boundary
- No linter/formatter config is checked in — match surrounding code style closely

## Git Workflow

- Branch from `main` per issue: `feat/5-metrics-and-tracing`, `fix/42-auth-validation`, etc.
- PRs required for all code changes; small docs/admin changes may go directly to `main`
- Run `pnpm ci:verify` before merge for broad changes
- Prefer squash merges; no direct pushes to `main`
- Ideas not ready for execution go to GitHub as `idea`-labeled issues, not directly to the roadmap

See `docs/git-workflow.md` for the full workflow and `docs/ci-and-security-gates.md` for merge gate details.

## Key Documentation

| Topic | File |
|---|---|
| Architecture decisions | `docs/architecture.md` |
| Service layer design | `docs/service-layer.md` |
| API runtime operations | `docs/api-runtime-operations.md` |
| Security standards | `docs/security-standards.md` |
| Logging standards | `docs/logging-standards.md` |
| Audit events | `docs/audit-events.md` |
| TDD and testing policy | `docs/testing-and-tdd.md` |
| Git workflow | `docs/git-workflow.md` |
| CI and security gates | `docs/ci-and-security-gates.md` |
| Current project status | `docs/project-status.md` |
