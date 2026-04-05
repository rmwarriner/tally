# Engineering Roadmap

## Roadmap Structure

The repository has moved out of the initial service-foundation phase.

The roadmap now separates work into:

- completed foundation phases
- active execution themes for the next phase
- idea backlog themes that need design and promotion before execution

## Standards Added

- Testing / TDD
  Documented in `docs/testing-and-tdd.md`
- UI review and regression testing workflow
  Documented in `docs/ui-review-checklist.md` and `docs/testing-and-tdd.md`
- Structured logging
  Documented in `docs/logging-standards.md`
- Formal audit events
  Documented in `docs/audit-events.md`
- Service layer foundation
  Documented in `docs/service-layer.md`
- Configuration and error handling
  Documented in `docs/config-and-error-handling.md`
- CI and security quality gates
  Documented in `docs/ci-and-security-gates.md`
- Security baseline
  Documented in `docs/security-standards.md`
- API runtime operations
  Documented in `docs/api-runtime-operations.md`

## Standards Still Needed

- external metrics, tracing, and alert routing beyond in-process foundations
- encryption-at-rest and key-handling guidance once backup and restore are implemented
- multi-user identity and authorization guidance for family-scale collaboration

## Phase 1 Completed

The original backend and service-boundary roadmap is complete.

Completed:

1. Metrics, tracing, and health checks
2. Configuration and deployment operations
3. Import/export expansion beyond QIF
4. Reporting engine and durable close workflow
5. Backup, migration, restore, and broader resilience hardening

## Phase 2 Themes

The next phase should be driven by a smaller set of explicit themes rather than a flat list of features.

### 1. Core Trust And Integrity

- deeper transaction lifecycle audit coverage
- soft-delete by default with privileged destructive flows
- stronger end-to-end data integrity guarantees
- encryption-at-rest and backup key-handling guidance
- family-scale identity, authorization, and actor attribution

### 2. Budgeting And Planning Model

- explicit remaining-to-budget money pool
- envelope funding adjustments and transfer semantics
- rollover, cleanup, and overspending workflows
- traditional line-item budget alongside envelopes
- spending-plan and forward-looking balance views

### 3. Layered Architecture And Persistence Evolution

- keep the ledger/accounting core minimal and authoritative
- model envelope and bank-sync behaviors as decorators or higher-order layers
- define persistence abstractions for JSON, SQLite, and Postgres
- preserve migration, backup, and audit behavior across future backends

### 4. Automation, Ingestion, And Assistive Workflows

- transaction review and inbox flows
- rules engine for categorization and normalization
- SimpleFIN and other sync-oriented ingestion paths
- receipt and document scanning
- optional AI-assisted suggestions and explainability surfaces

### 5. Collaboration And Product Surface Expansion

- family-scale multi-user access and approvals
- exception center and review workflows
- period snapshots and what-if planning
- product-driven client cleanup and desktop-wrapper discovery

## Active Execution Queue

These are the next candidates for promotion into active delivery work.

1. Add verification and rollback workflow across JSON, SQLite, and Postgres backends
2. Trust and integrity hardening for transaction audit depth, soft delete, and destructive controls
3. Budgeting model definition for remaining-to-budget, rollover, and envelope funding rules
4. Family-scale identity and authorization model, including external access providers such as Cloudflare Access and OpenID/OIDC
5. Transaction review and import-automation foundation

## Idea Backlog Policy

Ideas stay as GitHub issues labeled `idea` until they meet all of the following:

- the user problem is clear
- the domain and data model boundaries are understood
- the impact on audit, integrity, and migration behavior is understood
- there is a bounded first implementation slice
