# CI And Security Gates

Last reviewed: 2026-04-06

## Policy

This repository uses automated merge gates for code quality and security-sensitive regressions.

A change is not complete unless it passes:

- typecheck
- test
- coverage threshold
- secret scan
- dependency audit in CI

## Quality Workflow

The primary workflow is defined in `.github/workflows/quality-gates.yml`.

It enforces:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm security:secrets`

## Security Workflow

The security workflow is defined in `.github/workflows/security.yml`.

It enforces:

- production dependency audit with `pnpm audit --prod --audit-level high`
- repository secret scanning
- CodeQL analysis for JavaScript/TypeScript

## Dependency Update Workflow

Dependency update policy is defined in `.github/dependabot.yml`.

Current policy:

- npm updates run weekly on Monday at 08:00 `America/Chicago`
- GitHub Actions updates run weekly on Monday at 08:15 `America/Chicago`
- npm PRs are capped at 5 open at a time and grouped by tool area
- GitHub Actions PRs are capped at 3 open at a time and grouped together
- semver-major npm updates are ignored by default and handled as planned upgrade work

Automated merge execution is defined in `.github/workflows/dependabot-auto-merge.yml`.

It merges Dependabot pull requests only when:

- `Quality Gates` completed successfully for the PR
- the PR author is `dependabot[bot]`
- the update is semver patch or semver minor

Merges use squash + branch deletion and do not rely on the repository auto-merge plan feature.

## Local Commands

- `pnpm ci:verify`
- `pnpm security:check`
- `pnpm security:secrets`

## Coverage Floor

Coverage thresholds are enforced in `vitest.config.ts`.

Current floors:

- statements: 70
- branches: 75
- functions: 85
- lines: 70

These are minimums, not targets. Thresholds should rise as coverage matures.
