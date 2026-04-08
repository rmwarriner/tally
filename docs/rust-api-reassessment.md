# Rust API Reassessment

Last reviewed: 2026-04-06

## Purpose

This note captures when a Rust implementation of the API layer would be worth revisiting as the project matures.

The current recommendation is:

- keep `apps/api` in TypeScript for now
- continue treating the shared TypeScript domain and workspace packages as the primary execution core
- revisit Rust only when it solves a concrete problem better than the current architecture

## Current Conclusion

Rust is not rejected on principle. It is simply not the highest-leverage move at the current stage of the repository.

Today the project gets more value from:

- shared TypeScript business rules across web, mobile, and API
- a single command-oriented service boundary in `apps/api`
- strengthening observability, configuration, import/export breadth, reporting, and resilience

Moving the API to Rust now would introduce significant integration cost before it resolves the most important current gaps.

## Why TypeScript Remains The Better Fit Today

- `packages/domain` and `packages/book` already hold the core finance rules and command behavior in shared TypeScript
- web and mobile already consume the same model vocabulary
- the API layer is still relatively thin and orchestration-oriented
- the main near-term needs are operational maturity and product capability, not language-level replacement

Rewriting the API in Rust now would force one of two weak outcomes:

- duplicate business logic in Rust and TypeScript
- keep the business logic in TypeScript and add a cross-language seam that increases system complexity

Neither is attractive at the current stage.

## Reassessment Signals

Revisit Rust only when several of these conditions become true:

1. The backend becomes the canonical home of business execution rather than a thin service wrapper around shared TypeScript packages.
2. Multi-user coordination, sync, background jobs, or stronger concurrency guarantees become central product requirements.
3. Performance or memory bottlenecks are measured in production-like workloads rather than assumed.
4. Native desktop work becomes strategic and a Tauri-based runtime starts to own more local execution concerns.
5. The team is ready to operate a long-term dual-language architecture with Rust and TypeScript.

If only one of these is true, Rust is probably still an interesting idea rather than the right next move.

## Candidate Future Rust Targets

If Rust is investigated later, prefer a bounded subsystem over a full API rewrite.

Good candidates:

- sync and conflict-resolution engine
- import and parser engine for messy financial formats
- compute-heavy reporting engine
- desktop-local runtime services under a future Tauri wrapper
- persistence and locking layer if file-backed coordination becomes a bottleneck

Poor candidate right now:

- a broad rewrite of `apps/api` just for stronger type safety

## Review Trigger

Review this decision again when any of the following roadmap shifts happen:

- a serious native desktop spike is promoted
- sync or household collaboration enters active implementation
- persistence moves beyond the current local JSON file approach
- observability data shows real backend performance or concurrency pressure

## Decision Summary

Rust becomes a good API-layer decision only when it aligns with a broader architectural shift and a measured operational need.

Until then, the project should invest in the current TypeScript service boundary and keep the Rust question open for future review rather than near-term execution.
