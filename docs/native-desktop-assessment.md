# Native Desktop Assessment

## Scope

This document evaluates whether the current `apps/web` desktop shell should gain a native desktop wrapper, and if so, whether the first wrapper should be Electron or Tauri.

The question is not whether to replace the current web UI. The current desktop shell should remain the primary UI surface and should continue to be built from the existing React and Vite codebase.

## Current Baseline

- `apps/web` is a Vite and React desktop/web shell.
- `apps/api` already exists as a service boundary for persistence, validation, commands, and audit-aware writes.
- The desktop shell is becoming denser and more keyboard-first, which increases the value of desktop packaging and local OS integration.
- There is no desktop-wrapper scaffold in the repo yet.

## What A Native Wrapper Would Actually Add

The realistic benefits are:

- packaged desktop distribution for macOS, Windows, and Linux
- local file-open and file-save flows for workspace documents
- better OS-level shortcut integration
- tray, menu, and window-management hooks
- cleaner offline and local-first ergonomics
- optional tighter coordination with a local API/runtime process

It would not replace:

- the shared domain model in `packages/domain`
- the workspace command and persistence model in `packages/workspace`
- the React desktop shell in `apps/web`
- the need for the audited service boundary for financial mutations

## Recommendation

Recommend a Tauri-first evaluation path.

Reasoning:

- the desktop shell is already a web application, so both Electron and Tauri can host it without rewriting the UI
- this project is not currently Node-runtime heavy on the desktop client side
- the core business logic already lives in shared TypeScript packages, not in Electron-specific main-process code
- Tauri is a better fit when the goal is a lighter native shell around an existing web UI, especially for local packaging, windowing, file dialogs, and native menus
- smaller runtime footprint is a meaningful product advantage for a personal-finance desktop app

Electron should remain the fallback option, not the first choice.

Use Electron only if one or more of these become true:

- the desktop runtime needs deep Node.js package access that is awkward through Tauri commands
- the app needs mature Electron-only ecosystem pieces for auto-update, background services, or platform-specific integrations
- the team decides JavaScript-only desktop runtime code is materially preferable to a Rust-backed host layer

## Recommended Architecture If A Wrapper Is Added

The first native wrapper should preserve the current separation of concerns:

- `apps/web` remains the rendered desktop shell
- the desktop wrapper hosts that shell
- `apps/api` remains the command and persistence boundary
- the wrapper starts or connects to a local API process instead of pushing financial mutation logic directly into renderer code

That keeps the financial boundary disciplined:

- request validation stays in one place
- actor and auth handling stay explicit
- audit behavior remains consistent across web, mobile, and desktop packaging
- native desktop packaging does not fork business logic away from the service contract

## Why Not Collapse Everything Into The Native Wrapper Immediately

That would create avoidable architectural drift:

- duplicated command boundaries
- more coupling between desktop packaging and financial mutation logic
- a higher chance that browser and native builds behave differently
- a harder path to keep mobile and desktop aligned on the same service contract

The desktop wrapper should initially be packaging and local-integration infrastructure, not a second application architecture.

## Evaluation Criteria

Before promoting native desktop work onto the roadmap, assess these criteria:

1. Can the wrapper launch the existing desktop shell with minimal UI code changes?
2. Can it manage local workspace file selection and persistence cleanly?
3. Can it start or connect to a local API process without weakening validation or audit boundaries?
4. Can packaging and update strategy be explained clearly for all target desktop platforms?
5. Does the resulting app materially improve user experience over the browser-based shell?

## Proposed First Spike

The first execution spike should be small and bounded:

1. Add a disposable wrapper prototype around `apps/web`
2. Prove local launch of the desktop shell
3. Prove open/save workspace file flows
4. Prove local API bootstrap or connection model
5. Document packaging size, startup complexity, and developer workflow impact

The spike should not attempt:

- feature parity with every browser flow
- production auto-update
- background sync
- a second persistence path

## Decision Summary

- browser-first desktop shell remains the active product path
- native desktop support is reasonable, but not urgent enough to displace current roadmap work
- Tauri is the recommended first wrapper candidate
- Electron remains a valid fallback if desktop runtime requirements become more Node-centric
- the wrapper should initially package the existing web shell and preserve `apps/api` as the service boundary
