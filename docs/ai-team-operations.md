# AI Team Operations

Last reviewed: 2026-04-09

This document defines how the solo maintainer, Claude Code, and Codex work together with minimal process overhead.

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
