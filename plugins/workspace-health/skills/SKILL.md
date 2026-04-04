---
name: workspace-health
description: Run and summarize the repo's standard verification commands with the smallest useful scope first.
---

# Workspace Health

Use this plugin when the task is to verify repository health, explain CI failures, or choose the smallest correct validation command for a change.

## Repo Commands

Use these commands in this repository:

- `pnpm typecheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm ci:verify`
- `pnpm test <path-to-test-file>`

## Default Workflow

1. Prefer the smallest command that answers the question.
2. If the user asks whether the repo is healthy, run `pnpm ci:verify`.
3. If a single file or package changed, prefer the narrowest relevant test command first.
4. If CI is failing, identify the first failing gate and explain that before discussing downstream failures.
5. Summaries should be brief and concrete:
   - what ran
   - what failed or passed
   - the likely root cause
   - the next command or fix

## Repo-Specific Guidance

- `pnpm ci:verify` is the local equivalent of the main quality gate.
- Coverage matters in this repo because the configured thresholds are enforced in CI.
- This is a financial application, so boundary-validation and mutation-path regressions should be treated as high signal.
- Avoid recommending broad verification when a narrower command is enough, unless the user asks for full confidence.

## Helper Script

This plugin includes `scripts/run-checks.sh` for common verification entry points:

- `./plugins/workspace-health/scripts/run-checks.sh quick`
- `./plugins/workspace-health/scripts/run-checks.sh test apps/api/src/validation.test.ts`
- `./plugins/workspace-health/scripts/run-checks.sh coverage`
- `./plugins/workspace-health/scripts/run-checks.sh ci`
