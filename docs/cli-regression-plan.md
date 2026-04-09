# CLI Regression Test Plan — Phase 1

Covers `tally-cli` Phase 1 commands. Organized by layer: unit → integration → CLI contract.  
Reference: `docs/cli-handoff-core.md`, `docs/cli-spec.md`.

---

## Layer 1 — Unit Tests (no API, no filesystem I/O)

### Config resolution (`config.ts`)

| # | Test | Expected |
|---|---|---|
| U-C1 | Flag value provided | flag wins over env and config file |
| U-C2 | Env var set, no flag | env wins over config file |
| U-C3 | Config file only | config file value used |
| U-C4 | No source for required field | throws / returns error |
| U-C5 | Config file has extra unknown fields | ignored, no crash |
| U-C6 | Config file contains invalid JSON | clear parse error, exit 1 |
| U-C7 | Config file does not exist | treated as empty (no crash) |
| U-C8 | `tally use` writes correct JSON to config path | file contains `currentBook` |
| U-C9 | `tally use` sets file mode `0600` | `fs.stat(path).mode & 0o777 === 0o600` |

### API client (`api-client.ts`)

| # | Test | Expected |
|---|---|---|
| U-A1 | GET 200 | returns parsed body |
| U-A2 | POST 200 | returns parsed body |
| U-A3 | 401 | throws `ApiError` with auth message |
| U-A4 | 400 with `{ error: "..." }` body | throws `ApiError` with message from body |
| U-A5 | 409 | throws `ApiError` with conflict message |
| U-A6 | 500 | throws `ApiError("API returned 500")` |
| U-A7 | Network failure (fetch throws) | throws with "could not reach API" message |
| U-A8 | Non-JSON 200 response | throws, does not crash on parse |
| U-A9 | Auth header set on every request | `Authorization: Bearer <token>` present |
| U-A10 | Query params serialized correctly | `?from=2026-01-01&limit=50` in URL |

### Formatter (`format.ts`)

| # | Test | Expected |
|---|---|---|
| U-F1 | `1234.56` → `"1,234.56"` | thousands separator, 2 decimals |
| U-F2 | `0` → `"0.00"` | always 2 decimal places |
| U-F3 | `-1234.56` → `"-1,234.56"` | negative preserved |
| U-F4 | `0.1 + 0.2` (float hazard) | `"0.30"` (not `"0.30000000000000004"`) |
| U-F5 | `isTTY = true`, no `--format` | default format is `table` |
| U-F6 | `isTTY = false`, no `--format` | default format is `json` |
| U-F7 | `--format json` when TTY | json output regardless |
| U-F8 | `--format csv` on list command | CSV output with header row |
| U-F9 | `--format csv` on non-list command | `error: csv not supported for this command` |

### Period parser

| # | Test | Expected `[from, to]` (ISO dates) |
|---|---|---|
| U-P1 | `this-month` | first of current month → today |
| U-P2 | `last-month` | first → last day of previous month |
| U-P3 | `this-quarter` | first day of current quarter → today |
| U-P4 | `last-quarter` | full previous calendar quarter |
| U-P5 | `ytd` | Jan 1 current year → today |
| U-P6 | `last-year` | Jan 1 → Dec 31 previous year |
| U-P7 | `Q1` (in current year) | Jan 1 → Mar 31 |
| U-P8 | `Q4` (in current year) | Oct 1 → Dec 31 |
| U-P9 | `2025` | Jan 1 → Dec 31 2025 |
| U-P10 | `2025-03` | Mar 1 → Mar 31 2025 |
| U-P11 | `-b 2025-01-01 -e 2025-06-30` | exact ISO dates passed through |
| U-P12 | `-b "jan 1" -e "mar 31"` (current year) | natural language parsed to ISO |
| U-P13 | Invalid period string | clear error, exit 1 |

### Multi-posting balance logic (pure, no prompts)

| # | Test | Expected |
|---|---|---|
| U-M1 | Two postings sum to 0 | balanced = true |
| U-M2 | Two postings do not sum to 0 | balanced = false, delta shown |
| U-M3 | Single posting | balanced = false regardless of amount |
| U-M4 | Three postings summing to 0 | balanced = true |
| U-M5 | Float amounts summing to 0 (e.g. 3× 33.33 + 0.01) | no false negative from float drift |

---

## Layer 2 — Integration Tests (real dev API required)

Run with `TALLY_API_URL=http://localhost:3000` and a seeded dev book.  
Each test should use an isolated or reset book state where mutations are involved.

### `tally books list`

| # | Scenario | Expected |
|---|---|---|
| I-BL1 | At least one book exists | list contains book id + name |
| I-BL2 | `--format json` | valid JSON array |

### `tally dashboard`

| # | Scenario | Expected |
|---|---|---|
| I-D1 | Default invocation | net worth and pending count rendered |
| I-D2 | API date range sent | `from` = today-30d, `to` = today |
| I-D3 | Missing book in config | exit 1 with clear message |

### `tally accounts list` / `tally bal`

| # | Scenario | Expected |
|---|---|---|
| I-AL1 | Book has accounts | tree rendered with balances |
| I-AL2 | `tally bal` alias | identical output to `accounts list` |
| I-AL3 | `--depth 1` | only top-level accounts shown |
| I-AL4 | `--include-archived` | archived accounts appear |
| I-AL5 | Net total line | printed at bottom of tree |
| I-AL6 | `--format json` | raw accounts array in JSON |

### `tally transactions list`

| # | Scenario | Expected |
|---|---|---|
| I-TL1 | Default (no filters) | up to 50 transactions returned |
| I-TL2 | `--status cleared` | only cleared transactions |
| I-TL3 | `--status pending` | only pending transactions |
| I-TL4 | `--account <id>` | only transactions touching that account |
| I-TL5 | `-b 2026-01-01 -e 2026-03-31` | date range applied |
| I-TL6 | `-p last-month` | correct date range sent to API |
| I-TL7 | `--limit 5` | at most 5 results |
| I-TL8 | `--cursor <token>` from prior response | next page returned |
| I-TL9 | No transactions in range | empty result, no crash |
| I-TL10 | `tally reg` alias | identical to `transactions list` |
| I-TL11 | Piped output | valid JSON |

### `tally transactions add` — simple path

| # | Scenario | Expected |
|---|---|---|
| I-TA1 | All flags provided, confirm Y | transaction posted, id printed |
| I-TA2 | All flags provided, confirm N | no POST, exit 0 |
| I-TA3 | `tally add` alias | identical behaviour |
| I-TA4 | Invalid account id | API returns 400, exit 1 with message |
| I-TA5 | Book not found | API returns 404, exit 1 |
| I-TA6 | Posted transaction appears in `transactions list` | round-trip verified |

### `tally transactions add` — multi-posting

| # | Scenario | Expected |
|---|---|---|
| I-TM1 | No flags → interactive mode entered | first posting prompt shown |
| I-TM2 | Blank input at account prompt | re-prompted, no advance |
| I-TM3 | Blank input at amount prompt | re-prompted, no advance |
| I-TM4 | After posting 1, unbalanced total shown | matches posting 1 amount |
| I-TM5 | After posting 2 balances to 0, confirm prompt shown | "Post transaction? [Y/n]" |
| I-TM6 | Confirm Y → POST succeeds | id printed |
| I-TM7 | Confirm N → no POST | exit 0 |
| I-TM8 | Three-posting transaction summing to 0 | accepted and posted |
| I-TM9 | Non-TTY stdin with missing args | exit 1 with clear error, no hang |

---

## Layer 3 — CLI Contract Tests (exit codes, stderr, aliases)

These can be run without a live API by mocking fetch or pointing at a stub.

| # | Scenario | Exit | Stderr contains |
|---|---|---|---|
| CT-1 | Missing `TALLY_TOKEN`, no config | 1 | "token" |
| CT-2 | Missing `TALLY_BOOK`, no config | 1 | "book" |
| CT-3 | API at wrong URL | 1 | "could not reach API" |
| CT-4 | API returns 401 | 1 | "authentication failed" |
| CT-5 | API returns 400 with message | 1 | API message text |
| CT-6 | API returns 409 | 1 | "conflict" |
| CT-7 | API returns 500 | 1 | "API returned 500" |
| CT-8 | `DEBUG=tally` set, API error | 1 | stack trace included |
| CT-9 | `DEBUG=tally` not set, API error | 1 | no stack trace |
| CT-10 | `--no-color` flag | 0 | no ANSI escape codes in output |
| CT-11 | `tally reg` → same as `transactions list` | 0 | — |
| CT-12 | `tally transactions ls` → same as `transactions list` | 0 | — |
| CT-13 | `tally add` → same as `transactions add` | 0 | — |
| CT-14 | `tally bal` → same as `accounts list` | 0 | — |

---

## Regression Triggers

Run the full plan when any of these change:

- `tally-cli/src/config.ts`
- `tally-cli/src/api-client.ts`
- `tally-cli/src/format.ts`
- Any command implementation file
- API endpoints used by Phase 1 commands (`/api/books`, `/api/books/:id/transactions`, `/api/books/:id/accounts`, `/api/books/:id/dashboard`)
- `Transaction`, `Posting`, or `Account` type definitions in `packages/domain`

---

## Known Gaps (out of scope for Phase 1 plan)

- Schedule/approval/import/export command families are now implemented (Phases 2/3); keep this regression plan focused on Phase 1 stability checks and use integration suite coverage for broader command surfaces
- Multi-currency `transactions add` — Phase 2+
- Account name/code autocomplete in multi-posting — Phase 2+
