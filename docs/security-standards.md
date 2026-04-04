# Security Standards

## Policy

Security is a first-class engineering requirement for this repository.

Changes are incomplete if they introduce new operational behavior without considering:

- authentication and authorization impact
- input validation
- data protection
- auditability
- logging impact
- abuse and denial-of-service risk

## Required Practices

- validate all external input at the boundary
- enforce least privilege in configuration and filesystem access
- never trust client-supplied identity or actor metadata
- redact secrets and sensitive identifiers from logs
- preserve durable audit events for financial mutations
- prefer deny-by-default behavior for network exposure
- require automated CI quality and security gates before merge

## API Baseline

- non-loopback binding requires explicit authentication configuration
- write routes must require `application/json`
- request bodies must be size-limited
- write route payloads must pass strict schema validation before service execution
- API routes must enforce rate limiting with stricter thresholds for imports and mutations
- workspace identifiers must be constrained and path-safe
- responses for financial data must use `Cache-Control: no-store`

## Data Baseline

- ledger and workspace files are sensitive financial records
- persistence adapters must not allow path traversal
- backups and exports should be treated as sensitive artifacts

## Logging And Audit

- logs must be structured and redact secrets
- audit records must be durable for financial mutations
- client-controlled actor fields must not be trusted across the transport boundary

## CI And Automation

- pull requests must pass typecheck, tests, coverage, and secret scanning
- dependency audit must run in CI on a recurring schedule
- CodeQL analysis should run for JavaScript/TypeScript changes
- dependency updates for npm and GitHub Actions should be automated

## Before Shipping New Features

1. identify trust boundaries
2. validate all inbound inputs
3. confirm auth and actor handling
4. confirm logging and audit implications
5. add security-focused tests where practical
6. document unresolved risks
