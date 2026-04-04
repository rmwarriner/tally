# Testing And TDD

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
