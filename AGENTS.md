# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` monorepo.

- `apps/api/`: Node HTTP API, auth, validation, rate limiting, and service orchestration
- `apps/web/`: Vite-based desktop/web client
- `apps/mobile/`: Expo/React Native mobile client
- `packages/domain/`: core accounting, ledger, budgeting, and schedule logic
- `packages/workspace/`: workspace document model, commands, persistence, reconciliation, and audit events
- `packages/logging/`: structured logging utilities
- `packages/ui/`: shared UI tokens
- `docs/`: architecture, standards, security, and roadmap documents

Tests live next to source as `*.test.ts` under `apps/**/src` and `packages/**/src`.

## Build, Test, and Development Commands

- `pnpm test`: run the full Vitest suite
- `pnpm test:watch`: run tests continuously during development
- `pnpm coverage`: run tests with coverage reporting
- `pnpm typecheck`: run TypeScript checks across all workspaces
- `pnpm ci:verify`: local equivalent of the main CI quality gate
- `pnpm dev:api`: start the API server
- `pnpm dev:web`: start the web client
- `pnpm dev:mobile`: start the Expo mobile client

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the existing style in the repo:

- 2-space indentation
- `camelCase` for variables/functions
- `PascalCase` for React components and exported types/interfaces
- keep domain and workspace logic side-effect free unless the file is explicitly an operational boundary
- use descriptive file names such as `service.ts`, `validation.ts`, `commands.ts`

No formatter or linter config is currently checked in, so match surrounding code closely.

## Testing Guidelines

TDD is the default workflow: write a failing test first, implement the smallest fix, then refactor. New behavior is incomplete without automated coverage at the right layer.

- test files: `*.test.ts`
- framework: Vitest
- coverage thresholds: 70% statements, 75% branches, 85% functions, 70% lines

Focus tests on domain rules, workspace commands, API handlers, and critical client API flows.

## Commit & Pull Request Guidelines

Local `.git` history is not available in this workspace, so follow a simple imperative style for commits, for example: `Add mobile schedule exception handling`.

Pull requests should include:

- a concise description of user-facing and technical changes
- linked issue or roadmap item when applicable
- test evidence such as `pnpm test` and `pnpm typecheck`
- screenshots or screen recordings for web/mobile UI changes

## Security & Architecture Notes

This is a financial application. Validate all external inputs at the boundary, do not trust client-supplied actor identity, preserve audit events for financial mutations, and keep structured logging in operational code paths.
