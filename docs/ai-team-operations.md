# AI Team Operations

Last reviewed: 2026-04-11

This document defines how the solo maintainer, Claude Code, and Codex work together with minimal process overhead.

## Role Separation

| Agent | Directory | Responsibilities |
|---|---|---|
| Claude Code | `tally/` (always `main`) | analysis, planning, doc edits, PR review, Codex handoffs |
| Codex | `tally/` (feature branches only, never `main`) | all implementation, TDD, CI verification, PR authoring |

## Agent File Responsibilities

| File | Owner | Purpose |
|---|---|---|
| `CLAUDE.md` | Shared policy | Canonical source of truth for all agents — rules, conventions, non-negotiables, PR requirements |
| `AGENTS.md` | Codex-specific | Operational instructions for Codex only (handoff mechanics, document ownership). Always references `CLAUDE.md` as policy source. Never duplicates or overrides policy. |

GitHub Issues is the canonical execution queue. Handoff specs are written as comments on the relevant issue; there are no local handoff files.

**Handoff flow:**
1. User asks Claude Code to write up an issue for implementation
2. Claude reads the issue, posts a detailed spec as a comment on the GitHub issue
3. User tells Codex: "start on #NNN" — Codex fetches origin, reads the issue with `gh issue view NNN`, checks dependencies, and begins
4. Codex finishes and opens (or auto-merges) a PR with `Closes #NNN` in the body
5. User asks Claude to review the PR if R2/R3; Claude fetches the PR branch for review
6. After merge, Claude pulls `main` in `tally/` and updates `docs/issues.md`

Both agents work in the same `tally/` directory. Claude Code stays on `main`; Codex always branches from `origin/main` before making changes.


## Post-Merge Checklist

Run these steps after every PR is squash-merged:

1. Pull `main` in `tally/`: `git pull`
2. Update `docs/issues.md`: move the completed issue to Done

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
