# Phase 2: Mobile Repository Extraction

This document defines the Phase 2 extraction gate for moving `apps/mobile` into its own repository while keeping behavior stable.

## Preconditions

- Mobile relies on versioned dependencies for shared contracts and logic from the monorepo packages.
- CI parity checks are passing in the monorepo before extraction.

## Extraction Approach

1. Create a new repository target for mobile.
2. Extract `apps/mobile` with history preservation (for example, filter-repo style extraction).
3. Bring over only mobile-specific configuration and docs needed for standalone development.
4. Replace any direct internal path coupling with published/versioned dependencies.

## Exact Command Sequence

Run these commands from a clean checkout on the branch where Phase 1 is complete.

```bash
# 1) Clone a fresh working copy for extraction so the source repo stays untouched.
git clone git@github.com:rmwarriner/tally.git tally-mobile-extract
cd tally-mobile-extract

# 2) Ensure git-filter-repo is installed.
# macOS example:
brew install git-filter-repo

# 3) Rewrite history to keep only the mobile subtree.
git filter-repo \
  --path apps/mobile \
  --path-rename apps/mobile/:

# 4) Add a minimal root manifest/readme if needed (after rewrite).
# (Create or keep files appropriate for the standalone mobile repo.)

# 5) Point to the new target repository and push extracted history.
git remote remove origin
git remote add origin git@github.com:rmwarriner/tally-mobile.git
git branch -M main
git push -u origin main
```

Optional branch-first dry run:

```bash
git checkout -b chore/extract-mobile
git filter-repo --path apps/mobile --path-rename apps/mobile/:
```

## Post-Extraction Tasks

In the new mobile repository:

```bash
pnpm install
pnpm typecheck
pnpm test
```

- Replace any `workspace:*` dependencies with versioned published dependencies where applicable.
- Add CI workflow parity for `typecheck`, `test`, and security checks.
- Add/update runbook notes for local development and release flow.

In the remaining monorepo:

```bash
pnpm install
pnpm typecheck
pnpm test
```

- Remove in-repo mobile workspace entries only after the standalone repo is green.
- Update docs and developer onboarding links to point mobile contributors to the new repository.

## Cutover Gate

- New mobile repo passes typecheck and tests for mobile.
- Existing monorepo remains green after dependency updates.
- Developer runbooks are updated for both repositories.
