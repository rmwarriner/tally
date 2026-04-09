# tally-cli

CLI package for Tally (`@tally-cli/app`).

## Current Status (2026-04-09)

Phase 1 (daily driver) command implementation is in place:

- `tally books list`
- `tally books new <name>`
- `tally use <bookId>`
- `tally` / `tally dashboard`
- `tally transactions list` (`tally reg`, `tally transactions ls`)
- `tally transactions add` (`tally add`)
- `tally accounts list` (`tally bal`)

Core modules implemented:

- config loading + precedence (`--flag` > env > `~/.tally/config.json`)
- API client wrapper with auth headers and write precondition handling
- period/date parsing helpers
- table/json/csv output formatting helpers

Validation:

- `pnpm --filter @tally-cli/app typecheck` passes
- `pnpm --filter @tally-cli/app test` passes
- integration tests exist at `src/integration` and require a running dev API

## Commands

```bash
pnpm --filter @tally-cli/app typecheck
pnpm --filter @tally-cli/app test
pnpm --filter @tally-cli/app test:integration
pnpm --filter @tally-cli/app start -- --help
```
