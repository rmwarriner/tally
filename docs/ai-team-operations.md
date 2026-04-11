# AI Team Operations

Last reviewed: 2026-04-09

This document defines how the solo maintainer, Claude Code, and Codex work together with minimal process overhead.

## Role Separation

| Agent | Worktree | Responsibilities |
|---|---|---|
| Claude Code | `tally/` (primary, always `main`) | analysis, planning, doc edits, PR review, Codex handoffs |
| Codex | `tally-codex/` (feature branches) | all implementation, TDD, CI verification, PR authoring |

**Handoff flow:**
1. User asks Claude Code "what's next" or "prep a Codex handoff"
2. Claude reads `docs/issues.md` and the roadmap, picks the next item, and writes the spec to `docs/codex-handoff.md`, then pushes to `main`
3. User opens Codex in `tally-codex/`; Codex detects the handoff file at session start and asks whether to execute it
4. User confirms; Codex checks out the branch, implements, and opens a PR
5. User asks Claude to review the PR; Claude fetches and detach-checks out the PR branch — no changes pushed from `tally/`
6. After merge, Claude pulls `main` in `tally/`, updates `docs/issues.md`, and deletes `docs/codex-handoff.md`

See `docs/git-workflow.md` → **Workspace Setup** for worktree paths and commands.

## Handoff File Format

`docs/codex-handoff.md` is the task spec passed from Claude Code to Codex. It is a temporary file — deleted as part of post-merge cleanup after every task.

Structure:
```
# Codex Handoff — <issue id>

**Branch:** `feat/<branch-name>`

**First step:** `git fetch origin && git checkout -B feat/<branch-name> origin/main`

**Context:** <why this work is being done>

**Acceptance criteria:** <numbered list of observable outcomes and verification commands>

**Key files:** <file paths and what to change in each>

**Risk:** <R1/R2/R3>

**Rollback:** <one-line revert plan>

**Final step:** push the branch and open a PR using `.github/PULL_REQUEST_TEMPLATE.md`. Fill out all sections. `pnpm ci:verify` must pass before opening the PR. Append a one-line completion entry to `docs/project-status.md` before opening the PR.
- If risk tier is **R1**: run `gh pr merge --squash --delete-branch --yes` immediately after `gh pr create`. Local `pnpm ci:verify` is the gate; no waiting for remote CI.
- If risk tier is **R2 or R3**: leave the PR open for maintainer review. Do not merge.
```

## Post-Merge Checklist

Run these steps after every PR is squash-merged:

1. Pull `main` in `tally/`: `git pull`
2. If `docs/codex-handoff.md` exists, delete it: `git rm docs/codex-handoff.md && git commit -m "docs: remove stale codex handoff" && git push origin main`

Claude Code will prompt you to run these steps after confirming a merge.

## Definition Of Done

A task is done only when all are true:

- acceptance criteria in `docs/issues.md` item are met
- verification evidence is recorded (commands, tests, screenshots, or rationale)
- risk tier is set (`R1`, `R2`, or `R3`)
- rollback plan is documented
- handoff packet is updated

## Risk And Escalation

- `R1`: low risk (docs, safe refactors, non-behavioral maintenance)
- `R2`: medium risk (bounded behavior changes)
- `R3`: high risk (security, auth, schema, persistence, audit, destructive or irreversible operations)

Explicit maintainer approval is required before executing `R3` work.

## Do-Not-Touch Without Approval

- authentication and authorization boundaries
- persistence schema and migration behavior
- audit event emission paths
- security workflows and policy gates
- destructive data operations

## Handoff Packet Template

Use this in PR descriptions or issue updates:

```md
## Handoff
- current state:
- next step:
- commands run:
- known risks:
- rollback plan:
- open questions:
```

## Weekly AI Ops Review (20 Minutes)

- clean `docs/issues.md` (`in-progress`, `ready`, `blocked`, `done`)
- pick top 3 priorities for next cycle
- review cycle time and rework on recently completed items
- review escaped defects and decide whether to add higher-level tests
- tune prompts/workflow docs based on misses
