# Logging Standards

## Policy

Structured logging is required for operational code paths in this repository.

Going forward, changes are incomplete if they add new operational behavior without appropriate logging at the execution boundary.

Pure domain functions may remain side-effect free and do not need inline logging. Logging belongs at the boundary where commands, persistence, imports, APIs, jobs, and UI-triggered operations execute.

## Goals

- make failures diagnosable without reproducing them locally
- support auditability for financial operations
- enable future observability across desktop, web, mobile, and service layers
- avoid leaking secrets or sensitive financial identifiers

## Required Characteristics

- structured logs, not ad hoc string dumps
- log level usage: `debug`, `info`, `warn`, `error`
- console output format suitable for context:
  - interactive terminal output may be human-readable (`pretty`)
  - non-interactive and aggregated environments should prefer structured JSON (`json`)
- stable operation names in log context
- workspace, entity, and command identifiers where relevant
- redaction of sensitive fields
- consistent success, warning, and failure events for write operations

## Where Logging Is Required

- workspace command handlers
- file and database persistence adapters
- API handlers and middleware
- import and export pipelines
- reconciliation and close workflows
- background jobs, schedules, and automation execution

## Where Logging Is Optional

- pure domain calculations with no side effects
- presentational UI rendering
- deterministic selectors with no operational impact

## Event Shape

Every log record should include:

- timestamp
- level
- service
- message
- structured fields

Recommended fields:

- `operation`
- `command`
- `workspaceId`
- `transactionId`
- `accountId`
- `envelopeId`
- `batchId`
- `durationMs`
- `error`

## Sensitive Data Rules

Never log:

- passwords
- tokens
- secrets
- full account numbers
- routing numbers
- raw authorization headers

Use redaction rather than relying on developer discipline at every call site.

## Implementation Standard

Use the shared logger in `packages/logging`.

- create child loggers with operation context
- log start and completion for mutating operations
- log validation failures at `warn`
- log unexpected exceptions at `error`

## Development Workflow

When adding a feature:

1. define the operational boundary
2. add or update tests for expected logging behavior where practical
3. implement the feature with structured logs
4. verify tests and typecheck pass

## Current Foundation

The repository currently provides:

- shared structured logger with redaction in `packages/logging`
- workspace command logging in `packages/workspace/src/commands.ts`
- workspace storage logging in `packages/workspace/src/storage-node.ts`

Future service-layer code should build on the same logger and carry correlation or request identifiers through the stack.
