# CI And Security Gates

Last reviewed: 2026-04-14

## Policy

This repository uses automated merge gates for code quality and security-sensitive regressions.

A change is not complete unless it passes:

- `pnpm ci:verify`
- diff coverage threshold on changed production TypeScript statements (pull requests)
- PR test policy checks (pull requests)
- dependency audit in CI

## Quality Workflow

The primary workflow is defined in `.github/workflows/quality-gates.yml`.

It enforces:

- `pnpm install --frozen-lockfile`
- `pnpm ci:verify`
- diff coverage on production source changes in pull requests (`pnpm coverage:diff`, threshold `85%`)
- PR test plan policy:
  - either tests were added/updated
  - or `no-test-needed` is selected with rationale and a linked test debt issue

**Trigger policy:**
- Runs on `pull_request` only — not on push to main (redundant after merge)
- A `change-scope` job runs first and detects whether the PR touches only `*.md` / `docs/**` files. All heavy jobs (`ci-verify`, `dependency-audit`, `codeql`) skip when `docs_only == true`.
- A `required-gate` job aggregates all job results; branch protection requires this job to pass.
- Concurrency group `quality-gates-pr-<number>` cancels in-progress runs when a new commit is pushed to the same PR

## Security Workflow

The security workflow is defined in `.github/workflows/security.yml`.

It enforces:

- production dependency audit with `pnpm audit --prod --audit-level high`
- repository secret scanning
- CodeQL analysis for JavaScript/TypeScript

**Trigger policy:**
- Runs on `pull_request` and weekly schedule (`0 6 * * 1`)
- Uses the same `change-scope` pattern as quality-gates: docs-only PRs skip `dependency-audit` and `codeql`
- Weekly schedule catches newly disclosed vulnerabilities in unchanged dependencies
- Job-level concurrency groups (`dependency-audit-<ref>`, `codeql-<ref>`) cancel in-progress runs on rapid PR updates

## Docs Lint Workflow

The docs lint workflow is defined in `.github/workflows/docs-lint.yml`.

It enforces:

- No tab characters in changed markdown files
- No trailing whitespace in changed markdown files

**Trigger policy:**
- Runs on `pull_request` when any `*.md` or `docs/**` file changes (path filter)
- Only lints files changed in the PR (not the full repo)
- Concurrency group `docs-lint-pr-<number>` cancels in-progress runs on rapid PR updates

## Claude Review Workflow

The review workflow is defined in `.github/workflows/claude-review.yml` and `scripts/claude-review.mjs`.

It provides:

- Automated PR review on every `pull_request` event via direct Anthropic API call; review is posted as a PR comment
- Interactive `@claude` mention support in PR and issue comments via `anthropics/claude-code-action`

The review prompt prioritises: audit event compliance, domain layer purity, TDD compliance, double-entry integrity, security, and general quality — in that order.

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

- statements: 80
- branches: 80
- functions: 80
- lines: 80

These are minimums, not targets. Thresholds should rise as coverage matures.
