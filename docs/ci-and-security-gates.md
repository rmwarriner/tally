# CI And Security Gates

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
