# Tally CLI Handoff Core

Purpose: token-efficient implementation handoff for Codex.  
Reference spec: `docs/cli-spec.md` (full UX and long-form details).

## Implementation Status (2026-04-09)

Implemented in `tally-cli/src`:
- command tree and entrypoint (`books`, `use`, `dashboard`, `transactions`, `accounts`, plus aliases)
- config resolution and secure config writes
- API client with auth header, query serialization, and write precondition support
- output formatter and period/date parsing modules
- package typecheck and unit tests passing

Still pending for closure:
- run integration tests against a live dev API and reconcile any contract/UX deltas before marking Phase 1 done

## 1) Scope (Now vs Later)

Implement now (Phase 1 daily driver only):
- `tally books list`
- `tally books new <name>`
- `tally use <bookId>`
- `tally` and `tally dashboard`
- `tally transactions list` (plus aliases `tally reg`, `tally transactions ls`)
- `tally transactions add` (plus alias `tally add`, including multi-posting balance flow)
- `tally accounts list` (plus alias `tally bal`)

Do not implement yet:
- reports, imports/exports, reconcile, schedules, approvals, backups, close, audit, members, tokens management commands (except token value consumption via config/env/flag)

## 2) Non-Negotiable Constraints

- CLI is API-only: no direct persistence/book access.
- Config precedence: flag > env > `~/.tally/config.json` > error.
- Global flags on all commands:
  - `--book <id>`
  - `--api <url>`
  - `--token <token>`
  - `--format table|json|csv`
  - `--no-color`
- Output default:
  - TTY: `table`
  - non-TTY: `json`
- Interactive prompts allowed only when `process.stdin.isTTY === true`.
- Missing required args in non-TTY mode must fail fast (no hanging prompts).

## 3) API Mapping (Phase 1)

Base URL from config/flag/env; prefix routes with `/api`.

Books/context:
- `books list` -> `GET /api/books`
- `books new <name>` -> `POST /api/books`
- `use <bookId>` -> local config write only

Dashboard:
- `dashboard` / bare `tally` -> `GET /api/books/:bookId/dashboard`

Transactions:
- `transactions list` -> `GET /api/books/:bookId/transactions`
- `transactions add` -> `POST /api/books/:bookId/transactions`

Accounts:
- `accounts list` / `bal` -> `GET /api/books/:bookId/accounts`

## 4) Command Contracts (Phase 1)

`tally use <bookId>`
- Writes `currentBook` in `~/.tally/config.json`.
- File mode should be `0600`.
- Prints confirmation.

`tally transactions list`
- Options: `-p/--period`, `-b/--begin`, `-e/--end`, `--account`, `--status`, `--limit`, `--cursor`.
- Date behavior:
  - `-p` supports: `this-month`, `last-month`, `this-quarter`, `last-quarter`, `ytd`, `last-year`, `Q1..Q4`, `YYYY`, `YYYY-MM`.
  - `-b/-e` accept ISO and natural language input.
- Emits table/json/csv by selected format.

`tally transactions add`
- Fast path: if amount + debit + credit are provided and balanced, confirm then POST.
- Interactive fallback: keep collecting postings until running unbalanced total is exactly `0.00`.
- Minimum two postings.
- Signed amount input accepted (and optional debit/credit helper toggle).

`tally accounts list` / `tally bal`
- Displays hierarchical account tree with balances.
- Supports `--depth <n>` and `--include-archived`.
- Includes final net line.

`tally dashboard` / bare `tally`
- Shows net position, account summary, pending tx count, upcoming schedules (if returned by API).

## 5) Error Contract

Standard stderr messages + exit code `1`:
- API error: `error: <message>`
- Auth error: `error: authentication failed — check TALLY_TOKEN or config file`
- Network error: `error: could not reach API at <url>`
- Validation error: include field-level details when present
- Stack traces hidden unless `DEBUG=tally` is set

## 6) Build Order (Strict)

1. Scaffold CLI entry + commander command tree + global options.
2. Implement config module:
   - load/merge precedence
   - validate required fields for commands that need them
   - secure write for `tally use`
3. Implement thin API client wrapper over `fetch`:
   - auth header
   - query serialization
   - normalized error mapping
4. Implement formatter layer:
   - table/json/csv
   - TTY default switching
   - money formatting (2 decimals + separators)
5. Implement commands in this order:
   - books list/new
   - use
   - dashboard (and bare default command)
   - transactions list
   - transactions add (fast path, then interactive multi-posting)
   - accounts list/bal
6. Add tests and pass typecheck.

## 7) Acceptance Criteria

Functional:
- All Phase 1 commands execute against dev API.
- `tally add` cannot submit while unbalanced.
- Non-TTY with missing required inputs exits with clear error.
- Global overrides (flag/env/config) resolve correctly.

Quality gates:
- Unit tests:
  - config precedence and validation
  - api-client success + failure mapping
  - amount formatting
- Integration tests against live dev API:
  - `transactions list`
  - `transactions add`
  - `accounts list`
  - `dashboard`

## 8) Exact Request/Response Shapes (from source)

### `POST /api/books/:bookId/transactions` body
```ts
{
  transaction: {
    id: string;           // crypto.randomUUID() — generate client-side
    occurredOn: string;   // "YYYY-MM-DD"
    description: string;
    postings: Array<{
      accountId: string;
      amount: {
        commodityCode: string;  // Phase 1: hardcode "USD"
        quantity: number;       // signed — positive = debit, negative = credit
      };
      cleared?: boolean;
    }>;
  }
}
```
Response: `{ book: FinanceBookDocument }`  
Success: print `✓ transaction <id> posted`

### `GET /api/books/:bookId/transactions` response
```ts
{ transactions: Transaction[], nextCursor?: string }
```

### `GET /api/books/:bookId/accounts` response
```ts
{ accounts: Array<{ id, code, name, type, parentAccountId?, archivedAt? }> }
```
**Note:** this endpoint does NOT return balances. For `tally bal`, fetch `GET /api/books/:bookId/dashboard` and use `dashboard.accountBalances` if present. Verify the exact field name against `buildDashboardSnapshot` in `packages/book/` before implementing — field name is an open assumption.

### `GET /api/books/:bookId/dashboard` query params
```
from   ISO date (required)
to     ISO date (required)
```
For bare `tally dashboard`, use `from = today - 30 days, to = today`.

## 9) Multi-Posting Mode — Blank Input Rule

Blank input at any posting prompt is **ignored and re-prompted**. Do not treat blank as "done" or exit. The only way out of the posting loop is:
- Unbalanced total reaches exactly `0.00` → prompt to confirm and POST
- User sends `Ctrl+C` → abort with no POST

## 10) Open Assumptions (Resolve During Implementation)

- Query parameter names for period/date/account filters should match current API handler contract.
- Dashboard `accountBalances` field name — verify against `buildDashboardSnapshot` in `packages/book/src/` before rendering.
- Dashboard response shape may evolve; renderer should ignore unknown fields gracefully.
- CSV output for list-like endpoints first; non-tabular commands should return a clear `error: csv not supported for this command` message.
