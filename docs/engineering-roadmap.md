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

## Standards Still Needed

### Configuration Management Extensions

Required for:

- safe secret handling
- local/test/prod separation
- deployment-facing operational guidance

### Security Baseline

Required for:

- encryption and key handling
- dependency and secret scanning
- deployment and TLS guidance

### Observability

Required for:

- metrics
- tracing
- health checks
- alertable failure signals

### CI/CD Gates

Required for:

- mandatory tests
- typecheck
- coverage expectations
- linting and dependency checks

## Implementation Order

1. Metrics, tracing, and health checks
2. Configuration and deployment operations
3. Import/export expansion beyond CSV
4. Reporting engine and close workflow
5. Backup, migration, restore, and broader resilience hardening
