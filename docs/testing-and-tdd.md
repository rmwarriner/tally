# Testing And TDD

Last reviewed: 2026-04-06

## Policy

This repository uses test-driven development as the default implementation method.

For all new behavior:

1. write or update a failing automated test first
2. implement the smallest change required to make the test pass
3. refactor while keeping the test suite green

Bug fixes follow the same rule:

1. reproduce the bug with a failing test
2. fix the bug
3. keep the regression test

## Required Practice

- new domain logic requires unit tests
- new workspace commands require unit tests
- service-layer handlers must have handler-level tests
- import parsers must have fixture-driven tests
- bug fixes are not complete without a regression test

## Test Pyramid

- unit tests for ledger, budgeting, schedules, selectors, and commands
- integration tests for persistence, APIs, imports, and reconciliation flows
- UI tests only for critical workflows and regressions

## Functional Review

Manual functional review is now an explicit part of the project workflow for web and mobile UI work.

Use [docs/ui-review-checklist.md](/Users/robert/Projects/tally/docs/ui-review-checklist.md) when reviewing:

- new desktop shell workflows
- mobile workflow changes
- layout and keyboard interaction changes
- reconciliation, schedule, and inline editing changes

Manual review does not replace automated tests. It complements them for:

- focus and keyboard behavior
- layout and responsive behavior
- multi-step workflows that are not yet covered by browser automation
- product-quality fit and usability issues that unit tests cannot express

## Regression Testing Policy

Regressions should be captured at the narrowest reliable layer first.

- domain regression: add or update a domain test
- workspace command regression: add or update a workspace test
- API or transport regression: add or update handler/service tests
- UI-only regression with stable logic: add or update client view-model tests
- UI workflow regression that cannot be trusted without interaction coverage: add it to the manual review checklist immediately and plan automation once the workflow stabilizes

When a manual UI regression is found:

1. create a bug issue
2. record the exact reproduction steps
3. add a failing automated test at the best available layer
4. if full automation is not yet practical, add the workflow to the manual checklist until automation is added

## Current Functional Regression Targets

The highest-value end-to-end regression targets in this repo are now:

- desktop ledger filtering and keyboard navigation
- desktop transaction detail editing and split reordering
- desktop reconciliation matching and statement difference behavior
- mobile transaction capture
- mobile reconciliation capture
- mobile multi-posting schedule editing and validation
- import flows that mutate ledger state

## Automation Direction

The next tier of test formalization should be:

1. preserve unit and handler-first TDD as the default
2. keep manual review checklists current for desktop and mobile
3. add browser-level automated workflow coverage for the most stable desktop shell flows
4. add targeted mobile interaction coverage for the most failure-prone form workflows

Do not try to automate every UI path immediately. Prioritize workflows that are:

- financially material
- keyboard-heavy
- multi-step
- easy to regress during layout or interaction refactors

## Commands

- `pnpm test`
  Run the full unit test suite
- `pnpm test:watch`
  Run tests continuously during development
- `pnpm coverage`
  Run the suite with coverage reporting
- `pnpm typecheck`
  Run TypeScript verification across the workspace

## Development Workflow

Before coding a feature:

- choose the behavior to prove
- add a test that fails for the expected reason
- implement only enough production code to satisfy the test

Before finishing a change:

- run `pnpm test`
- run `pnpm typecheck`
- run focused manual UI review for user-facing web/mobile changes
- check whether the tests describe behavior clearly enough for future refactors

## Current Focus

The highest-value test targets in this repo are:

- double-entry validation
- ledger posting and balance calculations
- baseline and envelope budget projections
- schedule materialization
- workspace command handlers
- reconciliation behavior
- import deduplication

## Enforcement

Going forward, changes should be considered incomplete if they add behavior without corresponding automated tests at the appropriate layer.
