# Local Issue Queue
Last reviewed: 2026-04-09
This is the canonical issue tracker for day-to-day solo development.
## How To Use
- add new work to `Backlog` with the next `I-###` id
- move an item to `Ready` when scope and outcome are clear
- keep only one item in `In Progress` at a time unless explicitly parallelized
- move completed items to `Done` with completion date
- if an item needs external collaboration, convert or mirror it to a GitHub issue
- run `pnpm issues:next` to print the current actionable item (`in-progress` first, then `ready`)
- run `pnpm issue:start I-###` to mark an item in progress
- run `pnpm issue:close I-###` to mark an item done and stamp completion date
## Risk Tiers
- `R1`: low risk (safe refactor, docs, non-behavioral changes)
- `R2`: medium risk (behavioral changes with bounded impact)
- `R3`: high risk (security, auth, data model, persistence, audit, destructive operations)
## Item Template
```md
- [ ] I-000 Short title
  - status: backlog | ready | in-progress | blocked | done
  - risk: R1 | R2 | R3
  - type: feature | bug | refactor | docs | ops
  - owner: robert | agent
  - links: (optional PR/doc/issue links)
  - rollback: one-line safe rollback plan
  - acceptance:
    - clear observable outcome
    - verification command(s) or review evidence
  - handoff:
    - current state:
    - next step:
    - commands run:
    - known risks:
    - open questions:
```
## In Progress
- [ ] I-001 Define local-first issue workflow
  - status: in-progress
  - risk: R1
  - type: docs
  - owner: agent
  - links: /Users/robert/Projects/tally/docs/git-workflow.md
  - acceptance:
    - local issue queue documented
    - agent guidance updated to reference local queue
## Ready
- [ ] I-002 Implement tally CLI — Phase 1 (daily driver)
  - status: ready
  - risk: R1
  - type: feature
  - owner: agent
  - links: /Users/robert/Projects/tally/docs/cli-handoff-core.md (primary), /Users/robert/Projects/tally/docs/cli-spec.md (reference)
  - rollback: tally-cli is a standalone package; removal has no effect on other packages
  - acceptance:
    - `tally books list` and `tally use <id>` work against a running dev API
    - `tally transactions list` returns paginated results with period filtering
    - `tally add` completes a balanced transaction in both direct and multi-posting modes
    - `tally bal` renders an account balance tree
    - `tally dashboard` renders a summary
    - config file written/read correctly; env vars and flags override it
    - TTY detection switches default output format to json when piped
    - unit tests cover config resolution, API client, and amount formatting
  - handoff:
    - current state: tally-cli/ exists as a package.json placeholder only
    - next step: implement per docs/cli-spec.md Phase 1 scope
    - commands run: none
    - known risks: none — pure API client, no persistence touch
    - open questions: none, spec is complete
## Backlog
- [ ] (add next item here)
## Blocked
- [ ] (empty)
## Done
- [x] I-000 Bootstrap local issue queue
  - status: done
  - risk: R1
  - type: ops
  - owner: agent
  - links: /Users/robert/Projects/tally/docs/issues.md
  - acceptance:
    - queue file exists
    - workflow instructions included
  - completed: 2026-04-09

