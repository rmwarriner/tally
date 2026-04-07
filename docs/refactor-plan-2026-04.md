# Refactor Plan - April 2026

Last updated: 2026-04-07

## Context

This plan converts current architecture and UX critiques into implementation-ready slices.

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
5. Treat TDD as default: write or extend failing tests first for changed behavior surfaces.
6. Define explicit structural done criteria per slice to avoid partial extractions.

## Global Definition of Done (All Refactor PRs)

Each refactor PR must include:

- contract statement: explicit "contract impact: none" or a scoped contract change section
- structural impact statement: what responsibility moved and from where to where
- test evidence: `pnpm test`, `pnpm typecheck` (and `pnpm ci:verify` when broad)
- rollback note: concrete revert strategy for the slice
- observability/regression note: what metric or test would detect silent regressions

## Baseline and Measurement Protocol (Applies to PR-0 and performance-sensitive slices)

Use this protocol so comparisons remain meaningful:

- dataset profile:
  - `small`: ~1k transactions
  - `medium`: ~10k transactions
  - `large`: ~50k transactions
- endpoint latency sampling:
  - sample each endpoint 30 times after a warmup of 5 requests
  - record p50 and p95 latency
- workspace load/save timing:
  - run 10 iterations per dataset size and record median and p95
- test runtime:
  - run the full suite 3 times and record median wall-clock time
- environment capture:
  - record machine profile and Node/pnpm versions in the artifact

Fail threshold guidance (unless explicitly overridden in a PR):

- latency regression: p95 worse by more than 10%
- workspace load/save regression: p95 worse by more than 10%
- full test runtime regression: median worse by more than 15%

## Phases and PR Slices

## PR-0: Architecture Guardrails + Baseline Metrics

Scope:

- add architecture guardrails to docs (layer direction and boundaries)
- capture baseline metrics using the protocol in this document

Deliverables:

- baseline metrics artifact in `docs/`
- initial baseline artifact: `docs/refactor-baseline-metrics-2026-04.md`
- explicit thresholds and run instructions recorded with the artifact
- architecture guardrail section linked from `docs/engineering-roadmap.md`

Acceptance criteria:

- baseline process is reproducible locally without manual interpretation
- reruns produce comparable outputs with environment metadata
- at least one command/script path exists for rerunning metrics

## PR-1: Extract API Route Registry from `apps/api/src/http.ts`

Scope:

- isolate route labeling, route matching, and dispatch mapping into focused modules
- keep `createHttpHandler` as orchestration only

Deliverables:

- route registry/matcher modules under `apps/api/src/`
- updated `http.ts` delegating to extracted modules
- targeted unit tests for route matching and dispatch edge cases

Acceptance criteria:

- no endpoint contract change (paths, methods, status behavior)
- existing `http.test.ts` remains green
- route matching edge cases covered (method mismatch, path mismatch, param extraction)
- `http.ts` no longer contains inline route table construction logic

## PR-2: Extract Request Parsing and Validation Orchestration

Scope:

- move JSON body/query parsing and validation orchestration out of `http.ts`
- keep existing validators in `validation.ts` unchanged unless bug fixes are required

Deliverables:

- parser/validation orchestration modules under `apps/api/src/`
- focused tests for malformed JSON, payload size, query coercion, and validation failures

Acceptance criteria:

- error envelopes and status codes remain unchanged
- malformed body and size-limit handling behavior is unchanged
- parsing/validation paths are covered without relying only on broad integration tests

## PR-3: Extract Auth, Rate Limit, and Metrics Middleware Units

Scope:

- isolate auth resolution, rate-limit decisioning, and metrics capture from handler body
- preserve security headers, audit behavior, and logging semantics

Deliverables:

- middleware-style modules for auth, rate limit, metrics, and request context
- tests for auth-required vs auth-optional endpoints and rate-limit header behavior

Acceptance criteria:

- auth-required and auth-optional paths behave exactly as before
- metrics and rate-limit headers/behavior remain stable
- request logs and audit-relevant context fields remain present and unchanged

## PR-4: Mobile App Shell Decomposition

Scope:

- split `apps/mobile/src/App.tsx` into:
  - app shell
  - screen/workflow coordinator
  - shared state hooks
- do not change user workflows in this slice

Deliverables:

- extracted modules with clear ownership and prop boundaries
- characterization tests for current app-shell behavior before extraction

Acceptance criteria:

- mobile behavior remains unchanged in manual verification using `docs/ui-review-checklist.md`
- existing mobile tests remain green
- at least one new automated characterization test protects app-shell composition behavior

## PR-5: Mobile Feature Slice Extraction

Scope:

- extract transaction capture, envelopes, and schedule actions into feature modules/components
- reduce cross-feature coupling in top-level component state

Deliverables:

- feature modules under `apps/mobile/src/components` and related files
- focused interaction tests per extracted feature

Acceptance criteria:

- each feature has focused tests for critical interactions and key failure paths
- top-level app component has reduced responsibility (documented in PR structural impact section)
- no network/payload contract changes

## PR-6: Mobile State Model Cleanup

Scope:

- replace scattered state transitions with reducer-driven flows where complexity warrants it
- keep network and payload contracts unchanged

Deliverables:

- reducer(s) and transition tests for major paths
- migration notes documenting old vs new state transition ownership

Acceptance criteria:

- transition tests cover happy path and failure/rollback paths
- no regression in existing mobile API integration tests
- state transitions for targeted flows are centralized in reducers rather than distributed callbacks

## PR-7: Web Behavior Test Foundation

Scope:

- add minimal browser-level regression harness for critical flows:
  - create transaction
  - edit transaction
  - delete transaction
  - reconciliation happy path

Deliverables:

- E2E/smoke setup integrated into repo tooling and CI path
- initial stable smoke scenarios with diagnostics (trace/screenshot/log on failure)

Acceptance criteria:

- tests run in CI-compatible mode
- failures provide actionable diagnostics
- local developer run path is documented and repeatable

## PR-8: Keyboard and Workflow Regression Coverage

Scope:

- extend behavior tests for keyboard-first register interactions and focus safety
- map tests to manual checklist items

Deliverables:

- test cases linked to `docs/ui-review-checklist.md` coverage areas
- checklist matrix showing which high-risk manual checks are now automated

Acceptance criteria:

- key hotkeys and focus transitions have automated regression coverage
- repeated high-risk manual checks are reduced and documented

## PR-9: Persistence Evolution RFC (Design-Only)

Scope:

- write a decision-ready design doc for post-document persistence evolution:
  - append-log plus snapshot strategy
  - entity-level persistence strategy
  - optimistic concurrency token approach
  - conflict handling policy

Deliverables:

- RFC in `docs/` with tradeoffs, migration steps, rollback plan, compatibility constraints, and observability implications

Acceptance criteria:

- includes explicit migration path from current full-document writes
- includes operational risk analysis and phased rollout option
- includes minimum viable slice and kill-switch/rollback strategy for first implementation

## PR-10: Encryption-at-Rest and Key Handling RFC (Design-Only)

Scope:

- define encryption-at-rest and key lifecycle guidance for `json`, `sqlite`, and `postgres` backends
- cover key provisioning, rotation, backup/restore implications, and recovery handling

Deliverables:

- RFC in `docs/` aligned with security and operations documentation

Acceptance criteria:

- design is implementation-ready and identifies infrastructure assumptions
- roadmap dependencies are explicit
- includes key loss/recovery runbook requirements and staged rollout guidance

## Recommended Order

Primary sequence (refactor-focused):

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

Roadmap alignment note:

- `docs/engineering-roadmap.md` currently identifies family-scale identity/authorization design as the next suggested Phase 2 move.
- If roadmap priority must remain strict, run that design slice in parallel with PR-7/PR-8 or immediately after PR-3 before entering deeper mobile decomposition.

## Tracking Template (Per PR)

Use this checklist in each PR description:

- objective and scope (what changed and what did not)
- user-facing impact
- contract impact (explicitly "none" if unchanged)
- structural impact (responsibility moved, module boundaries updated)
- risk and rollback notes
- test evidence:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm ci:verify` (when applicable)
- before/after measurements (if performance or structural refactor)
- observability/regression detection note
