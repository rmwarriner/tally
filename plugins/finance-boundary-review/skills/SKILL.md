---
name: finance-boundary-review
description: Review API and mutation-path changes for validation, auth, audit, logging, and test gaps in this financial application.
---

# Finance Boundary Review

Use this plugin when reviewing changes that touch:

- API handlers and request validation
- auth and actor handling
- workspace commands that mutate financial state
- audit-event generation and persistence
- operational logging around mutations, imports, and reconciliations

## Review Priorities

Findings should focus on:

1. missing or weak boundary validation
2. trusting client-supplied actor identity
3. missing audit events for successful financial mutations
4. missing structured logging at operational boundaries
5. missing tests for risky mutation or authorization branches

## Repo Standards To Apply

From this repository's standards:

- validate all external input at the boundary
- never trust client-supplied identity or actor metadata
- preserve durable audit events for financial mutations
- use structured logging in operational code paths
- treat new behavior as incomplete without automated coverage at the right layer

## Review Workflow

1. Identify whether the change crosses a trust boundary.
2. Check request validation and payload-shape enforcement.
3. Check auth and actor handling.
4. Check whether successful mutations append the correct audit event.
5. Check whether operational logs exist at start, failure, and completion paths.
6. Check whether tests cover the highest-risk branches.
7. Report findings ordered by severity with file references.

## What Good Looks Like

- request schemas reject malformed input before service execution
- transport layers ignore spoofed actor fields
- successful financial mutations emit durable audit events
- logs use structured fields and avoid secret leakage
- tests cover validation failures, authorization failures, and success paths

## Helper Script

This plugin includes `scripts/review-checklist.sh` to print the repo's finance-boundary checklist:

- `zsh plugins/finance-boundary-review/scripts/review-checklist.sh`
- `zsh plugins/finance-boundary-review/scripts/review-checklist.sh api`
- `zsh plugins/finance-boundary-review/scripts/review-checklist.sh mutation`
