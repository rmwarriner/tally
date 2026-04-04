# Project Status

## Current State

This repository currently includes:

- product and architecture foundation documents
- shared domain logic for ledger, budgets, schedules, and reporting inputs
- workspace document model with commands, selectors, reconciliation, and CSV import
- application service layer for read/write orchestration and persistence
- HTTP transport for service-layer routes
- service-backed web and mobile clients for core household finance workflows
- TDD baseline with automated unit tests
- structured logging foundation with workspace-layer instrumentation
- GitHub issue, milestone, and project-board tracking for the current roadmap

## Completed

### Product And Architecture

- product positioning and core requirements documented
- architecture baseline documented
- service-layer next move documented
- GitHub repository initialized and roadmap execution tracking established

### Domain And Workspace

- double-entry transaction validation
- ledger posting and balance computation
- baseline budget calculations
- envelope budget calculations
- recurring schedule materialization
- workspace document model
- reconciliation support
- CSV import with duplicate detection
- JSON workspace persistence

### Service Layer

- file-system workspace repository
- service methods for workspace reads and dashboard projections
- service methods for transaction creation, reconciliation, and CSV import
- HTTP handler for workspace and dashboard reads plus core write routes
- Node HTTP server adapter
- runnable API bootstrap and local development server wiring
- service-layer logging around command execution and persistence

### Client Integration

- web workspace reads now load through service-backed API calls
- web transaction posting, CSV import, and reconciliation now write through service-backed API calls
- web baseline budget editing, envelope setup/allocation, and schedule editing now write through service-backed API calls
- mobile workspace reads and dashboard reads now load through service-backed API calls
- mobile envelope operations, transaction capture, schedule editing, due-schedule approvals, and schedule exceptions now write through the same authenticated service boundary
- mobile reconciliation capture now records statement sessions through the same service boundary
- mobile schedule editing now supports multi-account template postings with inline validation and account pickers

### Engineering Standards

- Vitest test harness and TDD policy
- structured logging package and logging standards
- typed configuration and boundary error handling standard
- CI and security quality gates
- security baseline documentation and audited hardening for API/runtime boundaries

### Audit And Observability Foundation

- formal workspace audit-event system for successful financial mutations
- durable audit-event persistence in workspace documents

### Security Foundation

- non-loopback API binding requires auth configuration
- typed authentication and workspace-level authorization
- HTTP body size limits and JSON enforcement
- strict request schema validation for core write routes
- transport-level rate limiting with separate read, mutation, and import thresholds
- response security headers and `no-store` behavior
- path-safe workspace identifier enforcement
- HTTP transport no longer trusts client-supplied actor identity

## Not Started

- configuration and secret management standards
- metrics, tracing, and health checks
- import/export adapters for OFX, QFX, QIF, and GnuCash XML
- reporting engine and close workflow
- backup, migration, and restore strategy

## Recommended Next Sequence

1. Add metrics, tracing, and health checks
2. Add configuration and secret management operations
3. Add import/export adapters for OFX, QFX, QIF, and GnuCash XML
4. Add reporting engine and close workflow
5. Add backup, migration, and restore strategy

## Deferred Follow-Up

- extract the mobile quick-transaction and quick-envelope cards into dedicated components so `apps/mobile/src/App.tsx` becomes mostly screen composition and API orchestration
- keep GitHub roadmap issues, milestones, and the `GnuCash NG Roadmap` project board aligned as execution moves forward
