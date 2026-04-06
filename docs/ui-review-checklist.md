# UI Review Checklist

Last reviewed: 2026-04-06

## Desktop Shell

Run:

```bash
pnpm dev:api
pnpm dev:web
```

Review the desktop shell with this sequence:

1. Open the workspace and confirm the shell loads without API errors.
2. Move through the top-level views:
   - overview
   - ledger
   - budget
   - envelopes
   - imports
   - automations
   - reports (roadmap placeholder)
3. In ledger:
   - filter by account from the sidebar and balance cards
   - change the date range and confirm the register updates to match
   - search by description, payee, account, memo, tag, account code, and status
   - use `/`, `j`, `k`, arrow keys, and `Esc`
   - confirm row selection stays aligned with filters
   - confirm transaction status is visible in the register and detail pane
4. Open a transaction in the register detail pane:
   - edit description, date, payee, and tags
   - edit split accounts, amounts, memos, and cleared flags
   - add, remove, and reorder splits
   - use `Enter`, `Alt+Up`, `Alt+Down`, `Ctrl/Cmd+S`, and `Esc`
   - confirm a new posting defaults to the remaining balancing amount
   - confirm balance validation blocks invalid saves
5. In the account picker:
   - search by name
   - search by code
   - search by account id
   - confirm suggested account bias changes when split sign changes
6. In reconciliation:
   - choose an account
   - change statement date and balance
   - toggle cleared candidates
   - confirm cleared total and difference update correctly
7. In budget, envelopes, imports, and automations:
   - submit at least one happy-path form in each view
   - confirm status messaging and refresh behavior
8. Resize the browser:
   - desktop wide layout
   - narrower tablet-like width
   - confirm the shell remains usable when sidebar and inspector collapse

## Mobile Shell

Run:

```bash
pnpm dev:api
pnpm dev:mobile
```

Review the mobile client with this sequence:

1. Confirm workspace and dashboard data load.
2. Post a quick transaction.
3. Record a reconciliation session.
4. Edit a scheduled transaction with multiple postings.
5. Use account pickers and account search in schedule postings.
6. Confirm inline validation blocks invalid schedules.
7. Review due schedule approval and exception flows.
8. Exercise envelope actions and confirm status messaging.

## What To Record During Review

- exact workflow exercised
- whether the result was correct
- whether the UI was confusing even if technically correct
- any keyboard or focus traps
- layout issues at narrow widths
- any mismatch between visible state and persisted state

## Review Output

For each review pass, capture:

- date
- surface reviewed
- commit or branch reviewed
- workflows exercised
- defects found
- follow-up ideas that should become `idea` issues instead of immediate roadmap work
