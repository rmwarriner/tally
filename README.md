# Tally

Tally is a greenfield personal finance system for households, families, and individuals. It combines strict double-entry accounting with two complementary budgeting modes:

- Traditional budget tracking establishes the plan-of-record baseline.
- Envelope budgeting is the operational cash-allocation layer used day to day.

The product target is a VS Code-inspired workspace flow on desktop and web, with mobile support for review, capture, approvals, and envelope operations. The goal is to borrow the shell model, not copy the visual language.

## Product Principles

- Double-entry accounting is the source of truth.
- Envelope budgeting never bypasses the ledger.
- Scheduled transactions, reporting, and standards-based import/export are core features.
- GAAP-aligned guardrails are applied where they make sense for household accounting.
- Mobile is a first-class client, not an afterthought.

## Monorepo Layout

- `docs/`: product and architecture decisions
- `apps/api/`: application service layer for persistence and command orchestration
- `apps/web/`: desktop/web workspace shell
- `apps/mobile/`: mobile companion shell
- `packages/domain/`: shared accounting and budgeting domain model
- `packages/workspace/`: application state, persistence, reconciliation, and import commands
- `packages/ui/`: shared UI tokens and view model helpers

## Initial Direction

This repository currently bootstraps:

- a domain model for accounts, transactions, schedules, budgets, and envelopes
- a workspace document model with write flows and file-backed persistence
- a service layer with HTTP transport for workspace reads, writes, reconciliation, and CSV import
- a desktop/web shell with workspace navigation, ledger drill-down, status-aware register filtering, reconciliation matching, and inline transaction editing through the service boundary
- a mobile shell that now connects to the same API for workspace reads, dashboard reads, transaction capture, reconciliation capture, schedule editing, approvals, exceptions, and envelope operations
- a GitHub-backed roadmap with issues, milestones, and a project board for near-term execution planning
- an architectural baseline for a ledger-first finance platform
- reviewable UI surfaces for a VS Code-inspired desktop workspace and mobile companion experience
- a documented register-first desktop UI direction for the next phase of shell evolution

## Recommended Next Steps

1. Add metrics, tracing, and health checks.
2. Add secret management and stronger deployment/security operations.
3. Extend the import path from CSV to OFX, QFX, QIF, and GnuCash XML.
4. Add reporting engine and close workflow.
5. Add backup, migration, and restore strategy.

Deferred UI cleanup: extract the mobile quick-transaction and quick-envelope cards into dedicated components after the GitHub handoff work.

See [docs/service-layer.md](/Users/robert/Projects/tally/docs/service-layer.md) and [docs/next-move-service-layer.md](/Users/robert/Projects/tally/docs/next-move-service-layer.md).

## Testing

- `pnpm test`
- `pnpm test:watch`
- `pnpm coverage`
- `pnpm typecheck`
- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm dev:mobile`

TDD workflow and testing expectations are documented in [docs/testing-and-tdd.md](/Users/robert/Projects/tally/docs/testing-and-tdd.md).
UI review workflows are documented in [docs/ui-review-checklist.md](/Users/robert/Projects/tally/docs/ui-review-checklist.md).
`pnpm dev:api` now seeds the local demo workspace automatically if `apps/api/data/workspace-household-demo.json` is missing, so the desktop and mobile shells have reviewable data on first run.
CI and security merge gates are documented in [docs/ci-and-security-gates.md](/Users/robert/Projects/tally/docs/ci-and-security-gates.md).
Git branch and pull request workflow is documented in [docs/git-workflow.md](/Users/robert/Projects/tally/docs/git-workflow.md).

## Logging

Structured logging standards and expectations are documented in [docs/logging-standards.md](/Users/robert/Projects/tally/docs/logging-standards.md).

## Audit

Formal audit-event behavior and event structure are documented in [docs/audit-events.md](/Users/robert/Projects/tally/docs/audit-events.md).

## Security

Security standards are documented in [docs/security-standards.md](/Users/robert/Projects/tally/docs/security-standards.md).
The latest audit is documented in [docs/security-audit-2026-04-03.md](/Users/robert/Projects/tally/docs/security-audit-2026-04-03.md).

## Configuration And Errors

Typed configuration and API error-handling standards are documented in [docs/config-and-error-handling.md](/Users/robert/Projects/tally/docs/config-and-error-handling.md).

## Tracking

- Current project status: [docs/project-status.md](/Users/robert/Projects/tally/docs/project-status.md)
- Engineering standards roadmap: [docs/engineering-roadmap.md](/Users/robert/Projects/tally/docs/engineering-roadmap.md)
- Git workflow: [docs/git-workflow.md](/Users/robert/Projects/tally/docs/git-workflow.md)
- Native desktop wrapper assessment: [docs/native-desktop-assessment.md](/Users/robert/Projects/tally/docs/native-desktop-assessment.md)
- Desktop UI direction: [docs/desktop-ui-direction.md](/Users/robert/Projects/tally/docs/desktop-ui-direction.md)
- GitHub roadmap project: `https://github.com/users/rmwarriner/projects/1`

Ideas that are not ready for roadmap execution should stay in a separate GitHub issue inbox with the `idea` label until they are clear enough to prioritize. The promotion rule is documented in [docs/git-workflow.md](/Users/robert/Projects/tally/docs/git-workflow.md).
GitHub issue templates now cover ideas, roadmap-ready execution work, bugs, and refactors, and pull requests use the repo-level template in [.github/PULL_REQUEST_TEMPLATE.md](/Users/robert/Projects/tally/.github/PULL_REQUEST_TEMPLATE.md).
Small admin or documentation-only changes may go directly to `main`, but docs/admin work that supports a major feature should stay on that feature branch. The weekly review cadence is documented in [docs/git-workflow.md](/Users/robert/Projects/tally/docs/git-workflow.md).

## Local Plugins

Repo-local Codex plugin scaffolds live under `plugins/` and are registered in [.agents/plugins/marketplace.json](/Users/robert/Projects/tally/.agents/plugins/marketplace.json):

- `github-roadmap`
- `workspace-health`
- `finance-boundary-review`
