# Refactor Plan - April 2026

Last updated: 2026-04-06

## Context

This plan converts the current architecture and UX critiques into implementation-ready slices.

Goals:

- preserve current API and workspace behavior while reducing structural hotspots
- improve mobile and API maintainability through decomposition
- add behavior-level UI regression coverage for critical user flows
- define decision-ready designs for persistence evolution and encryption-at-rest

Non-goals:

- no immediate rewrite of persistence model
- no broad visual redesign
- no user-facing workflow changes unless explicitly scoped in a PR

## Execution Principles

1. Keep each PR scoped to one coherent change.
2. For refactor PRs, preserve behavior and contracts unless explicitly called out.
3. Capture before/after evidence for latency, test runtime, and regression checks.
4. Run `pnpm test` and `pnpm typecheck` per PR; run `pnpm ci:verify` for broader slices.

## Phases and PR Slices

## PR-0: Architecture Guardrails + Baseline Metrics

Scope:

- add a short architecture guardrail section to existing docs (layer direction and boundaries)
- capture baseline metrics for:
  - common read/write endpoint latency
  - workspace load/save timings by document size
  - current test runtime

Deliverables:

- baseline metrics artifact in `docs/`
- explicit regression thresholds recorded with the artifact

Acceptance criteria:

- baseline script/process is reproducible locally
- metrics can be rerun after each phase without manual interpretation

## PR-1: Extract API Route Registry from `apps/api/src/http.ts`

Scope:

- isolate route labeling, route matching, and dispatch mapping into focused modules
- keep `createHttpHandler` as orchestration only

Deliverables:

- new route registry/matcher modules under `apps/api/src/`
- updated `http.ts` delegating to those modules

Acceptance criteria:

- no endpoint contract change (paths, methods, status behavior)
- existing `http.test.ts` remains green
- new tests verify route matching and dispatch behavior

## PR-2: Extract Request Parsing and Validation Orchestration

Scope:

- move JSON body/query parsing and validation orchestration out of `http.ts`
- keep existing validators in `validation.ts` unchanged unless bug fixes are required

Deliverables:

- parser/validation orchestration modules under `apps/api/src/`

Acceptance criteria:

- error envelopes and status codes remain unchanged
- tests cover malformed JSON, size limits, and validation failures

## PR-3: Extract Auth, Rate Limit, and Metrics Middleware Units

Scope:

- isolate auth resolution, rate-limit decisioning, and metrics capture from handler body
- preserve current security headers and logging semantics

Deliverables:

- middleware-style modules for auth, rate limit, metrics, and request context

Acceptance criteria:

- auth-required and auth-optional paths behave exactly as before
- metrics and rate-limit headers/behavior remain stable

## PR-4: Mobile App Shell Decomposition

Scope:

- split `apps/mobile/src/App.tsx` into:
  - app shell
  - screen/workflow coordinator
  - shared state hooks
- do not change user workflows in this slice

Deliverables:

- extracted modules with clear ownership and prop boundaries

Acceptance criteria:

- mobile app behavior remains unchanged in manual verification
- existing mobile tests remain green

## PR-5: Mobile Feature Slice Extraction

Scope:

- extract transaction capture, envelopes, and schedule actions into feature-specific modules/components
- reduce cross-feature coupling in top-level component state

Deliverables:

- feature modules under `apps/mobile/src/components` and related files

Acceptance criteria:

- each feature has focused tests for critical interactions
- top-level app component has reduced responsibility and size

## PR-6: Mobile State Model Cleanup

Scope:

- replace scattered state transitions with reducer-driven flows where complexity warrants it
- keep network and payload contracts unchanged

Deliverables:

- reducer(s) and tests for major transition paths

Acceptance criteria:

- state transition tests cover happy path and failure/rollback paths
- no regression in existing mobile API integration tests

## PR-7: Web Behavior Test Foundation

Scope:

- add minimal browser-level regression harness for critical flows:
  - create transaction
  - edit transaction
  - delete transaction
  - reconciliation happy path

Deliverables:

- E2E/smoke test setup integrated into repo tooling
- initial stable smoke scenarios

Acceptance criteria:

- tests run in CI-compatible mode
- failures provide actionable diagnostics

## PR-8: Keyboard and Workflow Regression Coverage

Scope:

- extend behavior tests for keyboard-first register interactions and focus safety
- map tests to existing manual checklist items

Deliverables:

- test cases linked to `docs/ui-review-checklist.md` coverage areas

Acceptance criteria:

- key hotkeys and focus transitions have automated regression coverage
- manual checklist is reduced for repeated high-risk areas

## PR-9: Persistence Evolution RFC (Design-Only)

Scope:

- write a decision-ready design doc for post-document persistence evolution:
  - append-log plus snapshot strategy
  - entity-level persistence strategy
  - optimistic concurrency token approach
  - conflict handling policy

Deliverables:

- RFC in `docs/` with tradeoffs, migration steps, rollback plan, and compatibility constraints

Acceptance criteria:

- design includes explicit migration path from current full-document writes
- includes operational risk analysis and phased rollout option

## PR-10: Encryption-at-Rest and Key Handling RFC (Design-Only)

Scope:

- define encryption-at-rest and key lifecycle guidance for `json`, `sqlite`, and `postgres` backends
- cover key provisioning, rotation, backup/restore implications, and recovery handling

Deliverables:

- RFC in `docs/` aligned with existing security and operations documentation

Acceptance criteria:

- design is implementation-ready and identifies required infrastructure assumptions
- roadmap dependencies are explicit

## Recommended Order

1. PR-0
2. PR-1
3. PR-2
4. PR-3
5. PR-4
6. PR-5
7. PR-6
8. PR-7
9. PR-8
10. PR-9
11. PR-10

## Tracking Template (Per PR)

Use this checklist in each PR description:

- objective and scope (what changed and what did not)
- user-facing impact
- contract impact (explicitly "none" if unchanged)
- risk and rollback notes
- test evidence:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm ci:verify` (when applicable)
- before/after measurements (if performance or structural refactor)

