# Engineering Roadmap

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
- broader import/export format coverage and resilience playbooks

## Implementation Order

Completed:

1. Metrics, tracing, and health checks
2. Configuration and deployment operations
3. Import/export expansion beyond QIF
4. Reporting engine and durable close workflow
5. Backup, migration, restore, and broader resilience hardening

Current next sequence:

1. External observability sinks and alert routing
2. Encryption-at-rest and key-handling guidance for persisted data and backups
3. Product-driven client cleanup and desktop-wrapper discovery
