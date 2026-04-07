# Security Audit

Last reviewed: 2026-04-06

Date: 2026-04-03

Scope reviewed:

- API runtime configuration
- HTTP transport
- file-system repository
- service-layer request handling
- workspace persistence boundary
- web client API usage

## Summary

Critical and major issues identified in the current implementation were remediated in this pass.

Primary fixes shipped:

- non-loopback API binding now requires an auth token
- unsafe workspace identifiers are rejected to prevent path traversal
- HTTP write routes now enforce `application/json`
- strict schema validation now rejects malformed transaction, reconciliation, and CSV import payloads
- transport-level rate limiting now applies separate thresholds for reads, mutations, and imports
- request body size limits are enforced
- HTTP responses now include baseline security headers and `no-store` caching
- actor spoofing from browser-supplied request bodies was removed at the HTTP boundary

## Findings

### Fixed

#### Major: Unauthenticated exposure when binding beyond loopback

Risk:

- financial data and mutation endpoints could be exposed if the API bound to a non-loopback interface without access control

Fix:

- runtime config now rejects non-loopback binding unless `TALLY_API_AUTH_TOKEN` is configured

Relevant files:

- `apps/api/src/config.ts`
- `apps/api/src/server.ts`

#### Major: Path traversal risk in workspace identifier handling

Risk:

- attacker-controlled workspace ids could attempt to access files outside the intended data directory

Fix:

- workspace ids are now restricted to a safe identifier pattern
- repository paths are resolved against the configured root directory

Relevant files:

- `apps/api/src/repository.ts`

#### Major: Missing content-type and body-size enforcement

Risk:

- malformed or oversized requests could be accepted too far into the stack
- this increased parser abuse and denial-of-service risk

Fix:

- POST routes now require `application/json`
- request bodies are size-limited
- invalid JSON returns a controlled `400`
- oversized payloads return `413`

Relevant files:

- `apps/api/src/http.ts`

#### Major: Missing strict request schema validation

Risk:

- malformed financial payloads could reach service/domain logic
- error handling would be inconsistent and overly dependent on downstream validation

Fix:

- route-level schema validation now rejects malformed transaction, reconciliation, and CSV import payloads with `400`

Relevant files:

- `apps/api/src/http.ts`
- `apps/api/src/validation.ts`

#### Major: No transport-level rate limiting or abuse control

Risk:

- repeated requests could hammer read and mutation paths without throttling
- import routes were exposed to brute-force and denial-of-service behavior

Fix:

- HTTP transport now enforces configurable in-memory rate limits
- read, mutation, and import routes use separate thresholds
- throttled requests return `429` with `Retry-After` and rate-limit headers

Relevant files:

- `apps/api/src/http.ts`
- `apps/api/src/rate-limit.ts`
- `apps/api/src/config.ts`

#### Major: Client-controlled audit actor values

Risk:

- browser callers could spoof the actor written into audit history by supplying arbitrary values

Fix:

- HTTP transport now derives actor identity at the boundary instead of trusting browser payloads
- local unauthenticated mode records `local-user`
- authenticated token mode records `authenticated-user`

Relevant files:

- `apps/api/src/http.ts`

#### Major: Weak response hardening for sensitive financial endpoints

Risk:

- financial responses were missing basic browser-facing hardening

Fix:

- responses now include:
  - `Cache-Control: no-store`
  - `Content-Security-Policy: default-src 'none' ...`
  - `Referrer-Policy: no-referrer`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`

Relevant files:

- `apps/api/src/http.ts`

### Remaining For Future Resolution

#### High: No production-grade identity, session, or authorization model

Current state:

- remote binding is protected by a static auth token requirement
- there is no user/session model, role model, or per-household authorization policy

Needed:

- real authentication
- actor identity propagation
- authorization policy for read/write scopes

#### Medium: No request schema validation framework

Current state:

- transport enforces JSON, body limits, route shape, and basic parameter checks
- deep schema validation is still ad hoc

Needed:

- strict request schema validation for every endpoint
- explicit field allowlists and numeric/date constraints

#### High: No encryption-at-rest or secret-management system

Current state:

- workspace data is stored as JSON on disk
- no key management, secret rotation, or encrypted storage layer exists

Needed:

- encrypted storage or filesystem strategy
- secret management
- backup protection

#### Medium: No TLS termination strategy documented

Current state:

- local development uses plain HTTP

Needed:

- production deployment guidance with TLS termination and trusted proxy handling

#### Medium: No dependency or secret scanning in CI

Current state:

- no automated CI security gates exist yet

Needed:

- dependency audit
- secret scanning
- SAST / lint security checks

#### Medium: No security event monitoring beyond logs and audit events

Current state:

- logs and audit records exist
- no alerting or anomaly detection exists

Needed:

- security metrics
- alert thresholds
- suspicious activity reporting

## Verification

Security-related verification added and passing:

- config security tests
- repository path-safety tests
- HTTP auth/header/content-type/body-limit tests
- full workspace typecheck and test suite

Commands run:

- `pnpm test`
- `pnpm typecheck`
