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
2. Claude reads `docs/issues.md` and the roadmap, picks the next item, and produces a spec packet: acceptance criteria, files to touch, test requirements, risk tier, and branch name
3. User pastes the spec to Codex; Codex checks out the branch in `tally-codex/` and implements
4. Codex opens a PR; user asks Claude to review it
5. Claude fetches and detach-checks out the PR branch for review — no changes pushed from `tally/`
6. After merge, Claude pulls `main` in `tally/` and updates any remaining docs

See `docs/git-workflow.md` → **Workspace Setup** for worktree paths and commands.

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
