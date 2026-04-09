# Tally CLI Spec

This document defines the command surface, UX conventions, and implementation guidance for the `tally-cli` package. It is the authoritative handoff document for CLI implementation work.

## Overview

The CLI is a pure API client — all operations go through the HTTP API, no direct book or persistence access. It targets the same `BookService` routes as the web and desktop clients.

Entry point: `tally-cli/` monorepo package (`@tally-cli/app`).

---

## Stack

- **Language:** TypeScript (ESM, consistent with monorepo)
- **Arg parsing:** `commander`
- **Interactive prompts:** `@inquirer/prompts`
- **Table output:** `cli-table3`
- **Color/styling:** `chalk`
- **HTTP client:** native `fetch` (Node 18+), thin wrapper in `tally-cli/src/api-client.ts`
- **Config:** `~/.tally/config.json` (see Config File section)

---

## Config File

Location: `~/.tally/config.json`

```json
{
  "currentBook": "<bookId>",
  "apiUrl": "http://localhost:3000",
  "token": "<api-token>"
}
```

Resolution order for each value (first wins):

1. CLI flag (`--book`, `--api`, `--token`)
2. Environment variable (`TALLY_BOOK`, `TALLY_API_URL`, `TALLY_TOKEN`)
3. Config file field
4. Error (required fields missing → clear message, exit 1)

Config file is created/updated by `tally use` and should be readable/writable by the current user only (mode `0600`).

---

## Global Flags

Available on all commands:

```
--book <id>              override current book
--api <url>              override API base URL
--token <token>          override auth token
--format table|json|csv  output format (default: table when TTY, json when piped)
--no-color               disable ANSI color output
```

TTY detection: if `process.stdout.isTTY` is false, default output format switches to `json` automatically.

---

## Date and Period Conventions

Borrowed from hledger. Available on all `list`, `report`, and `export` commands as:

```
-p, --period <expr>   period shorthand (see below)
-b, --begin <date>    start date inclusive (ISO 8601 or natural language)
-e, --end <date>      end date exclusive (ISO 8601 or natural language)
```

Period shorthands:

| Expression | Meaning |
|---|---|
| `this-month` | first day of current month to today |
| `last-month` | full previous calendar month |
| `this-quarter` | current calendar quarter |
| `last-quarter` | previous calendar quarter |
| `ytd` | Jan 1 of current year to today |
| `last-year` | full previous calendar year |
| `Q1`..`Q4` | named quarter of current year |
| `YYYY` | full calendar year |
| `YYYY-MM` | full calendar month |

Natural language date parsing for `-b`/`-e`: `"jan 1"`, `"last monday"`, `"3 days ago"` etc.

---

## Command Surface

### Context

```
tally books list
tally books new <name>
tally use <bookId>
```

`tally use` writes `currentBook` to `~/.tally/config.json` and prints confirmation.

---

### Transactions

```
tally transactions list   [alias: tally reg, tally transactions ls]
  -p / -b / -e
  --account <id|name-pattern>
  --status pending|cleared|deleted
  --limit <n>              (default: 50)
  --cursor <token>         for manual pagination

tally transactions add    [alias: tally add]
  [amount]                 optional positional
  [memo]                   optional positional
  --debit <accountId>      account to debit
  --credit <accountId>     account to credit
  --date <date>            (default: today)
  --status pending|cleared (default: pending)

tally transactions edit <id>      interactive edit of an existing transaction
tally transactions delete <id>    soft delete
tally transactions restore <id>   restore soft-deleted transaction
tally transactions show <id>      detail view of one transaction
```

#### `tally add` — smart entry flow

The add command uses a two-phase approach:

**Phase 1 — try direct entry.** If `amount`, `--debit`, and `--credit` are all supplied, construct a balanced two-posting transaction immediately and confirm before posting.

**Phase 2 — multi-posting mode.** Triggered automatically when any of the above are missing, or when the postings provided do not balance. In this mode:

```
Date [today]:
Memo: groceries
Status [pending]:

Posting 1
  Account: expenses:food
  Amount: 85.42

  Unbalanced: +85.42

Posting 2
  Account: assets:checking
  Amount: -85.42

  Unbalanced: 0.00 ✓

Post transaction? [Y/n]:
```

Rules:
- Running unbalanced total is shown after every posting entry.
- The prompt continues until the unbalanced total reaches exactly 0.00.
- Blank input does NOT exit — the user must reach zero balance to proceed.
- Amounts: positive = debit, negative = credit. CLI should accept both signed amounts and a debit/credit toggle.
- Minimum two postings required.

---

### Accounts

```
tally accounts list    [alias: tally bal]
  --depth <n>          limit hierarchy display depth (hledger convention)
  --include-archived

tally accounts add     interactive account creation
tally accounts archive <id>
tally accounts show <id>
```

`tally bal` (and `tally accounts list`) displays a tree of accounts with running balances, e.g.:

```
assets                          12,450.00
  assets:checking                8,200.00
  assets:savings                 4,250.00
liabilities                    -3,100.00
  liabilities:credit-card       -3,100.00
────────────────────────────────────────
net                              9,350.00
```

---

### Reports

```
tally report net-worth    [alias: tally bs]
tally report income       [alias: tally is]
tally report cash-flow    [alias: tally cf]
tally report budget
tally report envelopes
```

All report subcommands accept `-p`, `-b`, `-e`.

---

### Dashboard

```
tally             bare invocation → dashboard summary for current book
tally dashboard   explicit alias
```

Dashboard output: net position, account balances summary, pending transactions count, upcoming schedules (if any).

---

### Import / Export

```
tally import csv <file>
  --source <label>         human label for the import batch
  --batch <id>             idempotency batch ID (default: generated UUID)

tally import qif <file>
  --account <id>           cash account receiving the import
  --counterpart <id>       default counterpart account

tally import ofx <file>
  --account <id>
  --counterpart <id>

tally import qfx <file>
  --account <id>
  --counterpart <id>

tally import gnucash <file>

tally export qif --account <id> -b -e
tally export ofx --account <id> -b -e
tally export qfx --account <id> -b -e
tally export gnucash
```

Imports print a summary on success: rows/transactions imported, duplicates skipped, errors.

---

### Reconciliation

```
tally reconcile    interactive reconciliation session
```

Interactive flow:
1. Prompt: select account
2. Prompt: statement date, statement balance
3. List uncleared transactions with toggle UI
4. Show running cleared balance vs statement balance
5. Confirm when they match, post reconciliation

---

### Schedules (second tier)

```
tally schedules list
tally schedules add           interactive
tally schedules execute <id>
  --date <date>               occurrence date (default: today)
tally schedules skip <id>     skip next occurrence
tally schedules defer <id>
  --to <date>                 new next-due date
```

---

### Approvals (second tier)

```
tally approvals list
tally approvals request <transactionId>
tally approvals grant <approvalId>
tally approvals deny <approvalId>
```

---

### Maintenance

```
tally backup create
tally backup list
tally backup restore <id>

tally close     interactive period close — prompts for from/to dates, notes, confirmation

tally audit list
  --type <eventType>
  --since <date>
  --limit <n>    (default: 50)
```

---

### Admin

```
tally members list
tally members add <actor> --role member|admin|guardian
tally members remove <actor>
tally members role <actor> <role>

tally tokens list
tally tokens new --actor <name> --role <role>
tally tokens revoke <id>
```

---

## Error Handling

- API errors → print `error: <message>` to stderr, exit 1
- Auth errors → print `error: authentication failed — check TALLY_TOKEN or config file`, exit 1
- Network errors → print `error: could not reach API at <url>`, exit 1
- Validation errors from API → print field-level messages if available
- Never print stack traces unless `DEBUG=tally` env var is set

---

## Implementation Notes

- The API client (`tally-cli/src/api-client.ts`) should be a thin typed wrapper over `fetch`. All routes from `apps/api` are available; implement only what commands need.
- Config loading lives in `tally-cli/src/config.ts`. Validate on load and fail early with a clear message if required fields are missing.
- Interactive prompts only when `process.stdin.isTTY` is true. If stdin is not a TTY and required args are missing, exit with a clear error rather than hanging.
- All currency amounts displayed with 2 decimal places and thousands separators.
- Account IDs in output should be accompanied by account names where available.
- Tests: unit test the API client, config resolution, and amount formatting. Integration tests against a real dev API instance for the happy paths of `transactions list`, `transactions add`, and `import csv`.

---

## Phased Rollout

**Phase 1 — daily driver**
`transactions list`, `transactions add` (simple + multi-posting), `accounts list`/`bal`, `dashboard`, config/auth setup (`use`, `books list`)

**Phase 2 — data operations**
All import/export, `report`, `reconcile`, `backup`

**Phase 3 — second tier**
`schedules`, `approvals`, `audit`, `close`, `members`, `tokens`
