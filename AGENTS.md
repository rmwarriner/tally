# Repository Guidelines

Last reviewed: 2026-04-06

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

Tests live next to source as `*.test.ts` files.

## Build, Test, and Development Commands

- `pnpm test`: run the full Vitest suite
- `pnpm test:watch`: run tests continuously during development
- `pnpm coverage`: run tests with coverage reporting
- `pnpm typecheck`: run TypeScript checks across all workspaces
- `pnpm ci:verify`: local equivalent of the main CI quality gate
- `pnpm dev:api`: start the API server
- `pnpm dev:web`: start the web client
- `pnpm dev:mobile`: start the Expo mobile client

`pnpm dev:api` seeds the demo workspace automatically for local review if the default workspace file is missing.

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
- coverage thresholds: 80% statements, 80% branches, 80% functions, 80% lines

Focus tests on domain rules, workspace commands, API handlers, and critical client API flows.
For user-facing web and mobile changes, also run focused manual review using [docs/ui-review-checklist.md](/Users/robert/Projects/tally/docs/ui-review-checklist.md) and treat repeat regressions as candidates for higher-level automated workflow coverage.

## Commit & Pull Request Guidelines

Git history is now initialized for this workspace. Follow a simple imperative style for commits, for example: `Add mobile schedule exception handling`.

Pull requests should include:

- a concise description of user-facing and technical changes
- linked issue or roadmap item when applicable
- test evidence such as `pnpm test` and `pnpm typecheck`
- screenshots or screen recordings for web/mobile UI changes

Branch workflow for this repository:

- branch from `main` for each issue or focused work slice
- prefer names such as `feat/5-metrics-and-tracing` or `refactor/6-mobile-action-cards`
- keep branches short-lived and scoped to one coherent change
- small administrative or documentation-only changes may go directly to `main`
- documentation or admin changes tied to a significant feature should stay on that feature branch
- commit and push at reasonable milestones instead of batching too much local work
- run `pnpm ci:verify` before merge when the change is broad enough to justify it
- prefer squash merges and avoid direct pushes to `main`
- verify Git state sequentially after push operations to avoid misleading stale status output

See [docs/git-workflow.md](/Users/robert/Projects/tally/docs/git-workflow.md) for the full workflow.

Active roadmap tracking lives in the repository:

- repository: `rmwarriner/tally`
- ideas that are not ready for execution go in `docs/ideas.md`, organized by track — do not create GitHub issues for ideas
- GitHub issues are only created when an idea is promoted to execution (outcome is clear, area is known, ready to work)
- GitHub issue templates exist for roadmap items, bugs, and refactors, and pull requests should use the repository PR template

See [docs/git-workflow.md](/Users/robert/Projects/tally/docs/git-workflow.md) for full idea intake and promotion criteria.

## Security & Architecture Notes

This is a financial application. Validate all external inputs at the boundary, do not trust client-supplied actor identity, preserve audit events for financial mutations, and keep structured logging in operational code paths.
