# Engineering Roadmap

Last reviewed: 2026-04-07

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
- encryption-at-rest and key-handling guidance across supported persistence backends
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
- preserve migration, backup, audit, and rollback behavior across future backends

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

1. Continue trust and integrity hardening after the first soft-delete and privileged-destroy pass, especially encryption guidance and broader review controls
2. Budgeting model definition for remaining-to-budget, rollover, and envelope funding rules
3. Family-scale identity and authorization model, including external access providers such as Cloudflare Access and OpenID/OIDC
4. Transaction review and import-automation foundation
5. External observability sinks and production security guidance beyond the single-node default

## Refactor Plan Alignment

The implementation sequencing and acceptance gates for the April 2026 refactor effort are tracked in:

- `docs/refactor-plan-2026-04.md`

Use that plan as the per-PR execution reference (scope, done criteria, measurement protocol, and rollout notes), while this roadmap remains the theme and prioritization source.

## Architecture Guardrails (PR-0)

These guardrails define expected dependency direction and operational boundaries during the April 2026 refactor sequence.

1. Directional dependency rule: `apps/*` may depend on `packages/*`, but `packages/*` must not depend on `apps/*`.
2. Boundary validation rule: all external input validation stays at API or UI boundaries; core domain/workspace modules consume validated data.
3. Domain/workspace purity rule: `packages/domain` and `packages/workspace` remain side-effect free except for explicit storage/import-export boundaries already designated in those packages.
4. Operational observability rule: structured logging, rate limits, and metrics capture are applied at operational boundaries (`apps/api`, persistence adapters), not inside core accounting rules.
5. Audit integrity rule: financial mutations must preserve audit event emission and actor attribution behavior.
6. Contract stability rule: refactor slices do not change endpoint contracts or workspace document contracts unless explicitly scoped and documented.

PR checklist mapping: each refactor PR should include a `structural impact` note that names which guardrail(s) were affected and confirms whether behavior/contract impact is unchanged.

## Next Suggested Move

The next recommended Phase 2 execution slice is:

1. Family-scale identity and authorization design

Scope the first pass around:

- household member roles and actor attribution rules
- separation of ordinary write access from privileged destructive actions
- review and approval semantics for high-trust operations such as transaction destroy
- external identity integration boundaries for Cloudflare Access and OpenID/OIDC
- the minimal service, auth, and document changes needed to support that model without broad UI churn yet

## Idea Backlog Policy

Ideas stay as GitHub issues labeled `idea` until they meet all of the following:

- the user problem is clear
- the domain and data model boundaries are understood
- the impact on audit, integrity, and migration behavior is understood
- there is a bounded first implementation slice
