# Tally CLI Spec (Appendix)

Primary implementation handoff: `docs/cli-handoff-core.md`  
This appendix keeps only reference details that are likely to be reused across phases.

## Baseline

- Package: `tally-cli/` (`@tally-cli/app`)
- Model: pure HTTP API client (no direct persistence/book access)
- Runtime: Node 18+ (native `fetch`)
- Stack: TypeScript ESM, `commander`, `@inquirer/prompts`, `cli-table3`, `chalk`

## Config and Resolution

Config file: `~/.tally/config.json`

```json
{
  "currentBook": "<bookId>",
  "apiUrl": "http://localhost:3000",
  "token": "<api-token>"
}
```

Resolution order:
1. CLI flag (`--book`, `--api`, `--token`)
2. Env var (`TALLY_BOOK`, `TALLY_API_URL`, `TALLY_TOKEN`)
3. Config file
4. Error (exit 1 with clear message)

`tally use <bookId>` updates `currentBook`. Config file mode should be `0600`.

## Global CLI Conventions

Global flags:

```text
--book <id>
--api <url>
--token <token>
--format table|json|csv
--no-color
```

Output default:
- TTY -> `table`
- non-TTY -> `json`

Prompting:
- Only prompt when `process.stdin.isTTY` is true.
- In non-TTY mode, missing required args must fail fast.

## Date and Period Conventions

Shared on list/report/export surfaces:

```text
-p, --period <expr>
-b, --begin <date>
-e, --end <date>
```

Period shorthand set:
- `this-month`, `last-month`, `this-quarter`, `last-quarter`
- `ytd`, `last-year`
- `Q1`..`Q4`
- `YYYY`, `YYYY-MM`

`-b/-e` should support ISO and natural language dates.

## Command Catalog (Reference by Tier)

Phase 1 (daily driver):
- `tally books list`
- `tally books new <name>`
- `tally use <bookId>`
- `tally` (dashboard default)
- `tally dashboard`
- `tally transactions list` (aliases: `tally reg`, `tally transactions ls`)
- `tally transactions add` (alias: `tally add`)
- `tally accounts list` (alias: `tally bal`)

Phase 2 (data operations):
- Reports: `report net-worth|income|cash-flow|budget|envelopes`
- Import: `import csv|qif|ofx|qfx|gnucash`
- Export: `export qif|ofx|qfx|gnucash`
- Reconcile: `reconcile`
- Backups: `backup create|list|restore`

Phase 3 (second tier/admin):
- Schedules: `schedules list|add|execute|skip|defer`
- Approvals: `approvals list|request|grant|deny`
- Maintenance: `close`, `audit list`
- Admin: `members list|add|remove|role`, `tokens list|new|revoke`

## Smart Add Flow (Reference)

`tally add` two-mode behavior:
- Direct mode when amount + debit + credit are present and balanced.
- Interactive multi-posting mode otherwise.

Rules:
- Show running imbalance after each posting entry.
- Continue until imbalance is exactly `0.00`.
- Minimum two postings.
- Accept signed amounts; support debit/credit helper toggle.

## API Route Reference

Book/context:
- `GET /api/books`
- `POST /api/books`
- `GET /api/books/:bookId`
- `GET /api/books/:bookId/dashboard`

Transactions/accounts:
- `GET /api/books/:bookId/transactions`
- `POST /api/books/:bookId/transactions`
- `PUT /api/books/:bookId/transactions/:transactionId`
- `POST /api/books/:bookId/transactions/:transactionId/restore`
- `DELETE /api/books/:bookId/transactions/:transactionId/destroy`
- `GET /api/books/:bookId/accounts`
- `POST /api/books/:bookId/accounts`
- `DELETE /api/books/:bookId/accounts/:accountId`

Reports and close:
- `GET /api/books/:bookId/reports/:kind`
- `GET /api/books/:bookId/close-summary`
- `POST /api/books/:bookId/close-periods`

Imports/exports:
- `POST /api/books/:bookId/imports/csv|qif|ofx|qfx|gnucash-xml`
- `GET /api/books/:bookId/exports/qif|ofx|qfx|gnucash-xml`

Other:
- `POST /api/books/:bookId/reconciliations`
- `GET|POST /api/books/:bookId/schedules`
- `POST /api/books/:bookId/schedules/:scheduleId/execute`
- `POST /api/books/:bookId/schedules/:scheduleId/exceptions`
- `GET|POST /api/books/:bookId/approvals`
- `POST /api/books/:bookId/approvals/:approvalId/grant|deny`
- `GET /api/books/:bookId/audit-events`
- `GET|POST /api/books/:bookId/members`
- `PUT /api/books/:bookId/members/:actor/role`
- `DELETE /api/books/:bookId/members/:actor`
- `POST|GET /api/books/:bookId/backups`
- `POST /api/books/:bookId/backups/:backupId/restore`
- `GET|POST /api/tokens`
- `DELETE /api/tokens/:tokenId`
- `POST /api/sessions/exchange`
- `DELETE /api/sessions/current`

## Error and Output Contract

On failure, print to stderr and exit 1:
- API error: `error: <message>`
- Auth error: `error: authentication failed - check TALLY_TOKEN or config file`
- Network error: `error: could not reach API at <url>`
- Validation error: include field-level details when available
- Hide stack traces unless `DEBUG=tally` is set

Formatting:
- Currency with 2 decimals and thousands separators
- Include account names alongside IDs where possible

## Test Targets

Unit:
- config resolution/validation
- API client request/response and error mapping
- amount and table formatting

Integration (dev API):
- `transactions list`
- `transactions add`
- `accounts list`
- `dashboard`
- import/export happy paths in Phase 2
