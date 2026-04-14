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
- **Icons:** use `@phosphor-icons/react` throughout the web app. Use `weight="light"` for inactive states and `weight="regular"` for active/selected states. Do not add a second icon library. Inline SVGs are acceptable only when a Phosphor icon does not exist for the specific use case.

## Git Workflow

- Branch from `main` per issue: `feat/5-metrics-and-tracing`, `fix/42-auth-validation`, etc.
- PRs required for all code changes — no exceptions, including trivial changes. Branch protection on `main` enforces this at the GitHub level.
- Run `pnpm ci:verify` before merge for broad changes
- Prefer squash merges; direct pushes to `main` are blocked by branch protection
- GitHub Issues is the canonical execution queue; use `gh issue list` / `gh issue view`
- Ideas not ready for execution should be tracked as GitHub Issues with the `idea` label

See `docs/git-workflow.md` for the full workflow and `docs/ci-and-security-gates.md` for merge gate details.

## Collaboration & Automation

This repository is maintained by a solo developer. AI assistants and automation are part of the working team model.

- Prefer automation for repetitive, operational, and verification tasks when practical.
- Require explicit user authorization before executing impactful automation actions.
- Keep workflows cross-platform and minimize platform-specific assumptions.
- Ensure repository guidance remains compatible with both Claude Code and Codex.
- Follow `docs/ai-team-operations.md` for definition of done, risk escalation, do-not-touch boundaries, and handoff requirements.

## Codex Execution Rules

These rules apply to every Codex task without exception.

**Session start**
- When told to "start on #NNN", run `pnpm start-issue NNN` first — this fetches origin, reads the issue, and creates a correctly named branch from `origin/main` automatically. Do not manually fetch or create branches.
- After `pnpm start-issue NNN` completes, read the issue body with `gh issue view NNN` for the full spec
- Check dependency notes in the issue body first — stop and prompt if any referenced prerequisite issue is not yet merged

**Git discipline**
- Always use `pnpm start-issue NNN` to begin work on any issue — never manually create branches or build on a leftover branch from a previous task.
- Commit after each logical unit of work with a clear message
- Push and open a PR when done: `gh pr create` using `.github/PULL_REQUEST_TEMPLATE.md`
- Reference the issue in the PR body with `Closes #NNN`
- Never push directly to `main`

**PR requirements**
- Fill out every section of `.github/PULL_REQUEST_TEMPLATE.md` including risk tier, rollback plan, and handoff packet
- `pnpm ci:verify` must pass before the PR is opened
- Append a one-line completion entry to `docs/project-status.md` before opening the PR
- If risk tier is **R1**: run `gh pr merge --squash --delete-branch` immediately after `gh pr create` — local `pnpm ci:verify` is the gate, no waiting for remote CI
- If risk tier is **R2**: open the PR and leave it open for maintainer review — do not merge
- If risk tier is **R3**: open the PR and leave it open for maintainer review — do not merge
- Expect a Claude automated review comment on every PR — this is informational, not a merge gate

**Repository context**
- The repository is public on GitHub
- Branch protection is enforced on `main`: direct pushes and force pushes are blocked, `pr-policy` and `ci-verify` must pass before merge
- CI runs on PRs only — not on push to main. Docs-only changes skip CI via path filters.
- CodeQL runs on a weekly schedule; findings appear in the GitHub Security tab

**Non-negotiables**
- TDD: write the failing test before the implementation for any logic changes
- Never remove or skip audit event emission from mutation paths
- Never trust client-supplied actor identity
- Never add dependencies without explicit instruction
- Do not modify files outside the stated task scope

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
