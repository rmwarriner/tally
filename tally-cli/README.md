# tally-cli

CLI package for Tally (`@tally-cli/app`).

## Current Status (2026-04-09)

Phase 1 (daily driver) implementation and validation are complete:

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
- `pnpm --filter @tally-cli/app test:integration` passes against a running dev API
- integration tests use deterministic fixture reset data (`src/integration/reset-fixture.ts`) with fixed IDs:
  - book: `workspace-cli-integration`
  - debit account: `acct-expense-groceries`
  - credit account: `acct-checking`

## Commands

```bash
pnpm --filter @tally-cli/app typecheck
pnpm --filter @tally-cli/app test
pnpm --filter @tally-cli/app test:integration
pnpm --filter @tally-cli/app start -- --help
```

## Token Helper

Use the repo helper to populate `TALLY_TOKEN` quickly:

```bash
# No-auth local dev API mode
eval "$(scripts/get-cli-token.sh --mode none --print-export)"

# Managed token creation (requires admin/local-admin bootstrap token)
eval "$(scripts/get-cli-token.sh --mode managed --admin-token "$BOOTSTRAP_TOKEN" --actor "$USER" --role admin --print-export)"
```
