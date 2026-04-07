# Phase 2: `tally-go` Repository Extraction

This document defines the Phase 2 extraction gate for moving `tally-go/apps/mobile` into its own repository while keeping behavior stable.

## Preconditions

- Phase 1 package and import rename to `@tally-core/*`, `@tally-portal/*`, and `@tally-go/*` is complete.
- Mobile relies on versioned dependencies for shared contracts and logic from `tally-core`.
- CI parity checks are passing in the monorepo before extraction.

## Extraction Approach

1. Create a new repository target for `tally-go`.
2. Extract `tally-go/apps/mobile` with history preservation (for example, filter-repo style extraction).
3. Bring over only mobile-specific configuration and docs needed for standalone development.
4. Replace any direct internal path coupling with published/versioned dependencies.

## Exact Command Sequence

Run these commands from a clean checkout on the branch where Phase 1 is complete.

```bash
# 1) Clone a fresh working copy for extraction so the source repo stays untouched.
git clone git@github.com:rmwarriner/tally.git tally-go-extract
cd tally-go-extract

# 2) Ensure git-filter-repo is installed.
# macOS example:
brew install git-filter-repo

# 3) Rewrite history to keep only the mobile subtree.
git filter-repo \
  --path tally-go/apps/mobile \
  --path-rename tally-go/apps/mobile/:

# 4) Add a minimal root manifest/readme if needed (after rewrite).
# (Create or keep files appropriate for the standalone mobile repo.)

# 5) Point to the new target repository and push extracted history.
git remote remove origin
git remote add origin git@github.com:rmwarriner/tally-go.git
git branch -M main
git push -u origin main
```

Optional branch-first dry run:

```bash
git checkout -b chore/extract-tally-go
git filter-repo --path tally-go/apps/mobile --path-rename tally-go/apps/mobile/:
```

## Post-Extraction Tasks

In the new `tally-go` repository:

```bash
pnpm install
pnpm typecheck
pnpm test
```

- Replace any `workspace:*` dependencies with versioned published dependencies from `tally-core`/`tally-portal` where applicable.
- Add CI workflow parity for `typecheck`, `test`, and security checks.
- Add/update runbook notes for local development and release flow.

In the remaining monorepo (`tally-core` + `tally-portal`):

```bash
pnpm install
pnpm typecheck
pnpm test
```

- Remove in-repo `tally-go` workspace entries only after the standalone repo is green.
- Update docs and developer onboarding links to point mobile contributors to `tally-go`.

## Cutover Gate

- New `tally-go` repo passes typecheck and tests for mobile.
- Existing `tally-core` + `tally-portal` repo remains green after dependency updates.
- Developer runbooks are updated for both repositories.
