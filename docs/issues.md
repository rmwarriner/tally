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
- [ ] I-003 Implement tally CLI — Phase 2 (data operations)
  - status: ready
  - risk: R2
  - type: feature
  - owner: agent
  - links: /Users/robert/Projects/tally/docs/cli-spec.md, /Users/robert/Projects/tally/docs/cli-handoff-core.md
  - rollback: tally-cli is standalone; revert commits to tally-cli/ only — no effect on other packages
  - acceptance:
    - `tally report net-worth|income|cash-flow|budget|envelopes` renders report output (table + json)
    - `tally import csv|qif|ofx|qfx|gnucash <file>` posts to the appropriate import endpoint and reports row/entry counts
    - `tally export qif|ofx|qfx|gnucash` streams file to stdout or writes to `--out <file>`
    - `tally reconcile` opens an interactive reconciliation session (TTY) or accepts `--statement-balance` flag for non-TTY
    - `tally backup create` creates a backup and prints the backup ID
    - `tally backup list` lists backups (table + json)
    - `tally backup restore <id>` restores a backup with a confirmation prompt in TTY mode
    - period flags (`-p`, `-b`, `-e`) work on all report and register surfaces
    - `--format csv` works on report and transaction list outputs
    - integration tests added for import/export happy paths and report smoke tests
    - `pnpm ci:verify` passes
  - handoff:
    - current state: Phase 2 command surface is implemented in `tally-cli/src/commands/` (`report`, `import`, `export`, `reconcile`, `backup`) and wired in `src/index.ts`; integration suite now includes report smoke coverage and import/export happy paths
    - next step: rerun `pnpm test:cli:integration` in an environment with a running dev API (`TALLY_API_URL`) to exercise live HTTP paths end-to-end, then proceed to I-004
    - commands run: `pnpm --filter @tally-cli/app typecheck`, `pnpm --filter @tally-cli/app test`, `pnpm test:cli:integration` (failed: dev API unreachable), `pnpm ci:verify`
    - known risks: `pnpm test:cli:integration` currently requires an active dev API and failed in this environment; reconcile TTY flow currently captures cleared transaction IDs via a comma-separated prompt (not per-row multi-select UX)
    - open questions: (resolved) `tally report budget` and `tally report envelopes` accept both `--period` and `--budget-id`; if `--budget-id` is omitted, default to the first budget in the book

- [ ] I-004 Implement tally CLI — Phase 3 (admin and second tier)
  - status: ready
  - risk: R2
  - type: feature
  - owner: agent
  - links: /Users/robert/Projects/tally/docs/cli-spec.md
  - rollback: tally-cli is standalone; revert commits to tally-cli/ only
  - acceptance:
    - `tally schedules list` lists scheduled transactions (table + json)
    - `tally schedules add` creates a schedule (interactive TTY or direct flags)
    - `tally schedules execute|skip|defer <id>` executes, skips, or defers the next occurrence
    - `tally approvals list` lists pending approvals
    - `tally approvals request <transactionId>` requests a destroy approval
    - `tally approvals grant|deny <approvalId>` grants or denies an approval
    - `tally audit list` lists audit events with `--since`, `--type`, `--limit` filters
    - `tally close` closes the current period (prompts for confirmation in TTY)
    - `tally members list|add|remove` manages household members
    - `tally members role <actor> <role>` sets a member role
    - `tally tokens list|new|revoke` manages API tokens
    - all commands respect `--format table|json` and global flags
    - self-approval guard surfaced as a clear CLI error
    - integration tests cover schedules list, approvals list/grant/deny, and audit list
    - `pnpm ci:verify` passes
  - handoff:
    - current state: Phase 3 command surface is implemented in `tally-cli/src/commands/` (`schedules`, `approvals`, `audit`, `close`, `members`, `tokens`) and wired in `tally-cli/src/index.ts`; integration fixture now seeds managed auth tokens for both requester and reviewer actors via `tally-cli/src/integration/reset-fixture.ts`, and integration suite includes Phase 3 coverage additions
    - next step: rerun `pnpm test:cli:integration` with a running dev API (`pnpm dev:api` + reachable `TALLY_API_URL`) to execute live HTTP integration scenarios end-to-end, then close I-004
    - commands run: `pnpm --filter @tally-cli/app typecheck`, `pnpm --filter @tally-cli/app test`, `pnpm test:cli:integration` (failed: dev API unreachable), `pnpm ci:verify`
    - known risks: `pnpm test:cli:integration` is environment-dependent and could not run here without a reachable dev API; `tally close` intentionally requires explicit `--confirm` plus explicit period/range (no TTY prompt fallback) per resolved decision
    - open questions: none; resolved decisions applied (`tally close --confirm` required, reviewer token seeded in reset fixture)
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
- [x] I-002 Implement tally CLI — Phase 1 (daily driver)
  - status: done
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
    - integration suite passes against deterministic fixture reset data
  - handoff:
    - current state: Phase 1 is implemented and validated end-to-end; deterministic reset fixture runs in `beforeAll`
    - next step: start I-003 for Phase 2 command surface (reports/import/export/reconcile/backup)
    - commands run: `pnpm --filter @tally-cli/app typecheck`, `pnpm --filter @tally-cli/app test`, `pnpm test:cli:integration`, `pnpm ci:verify`
    - known risks: interactive TTY multi-posting automation still depends on future `node-pty` style harness if we require full prompt-flow automation
    - open questions: none for Phase 1 closure
  - completed: 2026-04-09
