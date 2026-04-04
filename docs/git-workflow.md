# Git Workflow

## Policy

This repository uses a light trunk-based workflow:

- `main` is the integration branch and should remain releasable
- all feature, fix, refactor, and documentation work starts on a short-lived branch
- changes merge through pull requests, not direct pushes to `main`

This repository's CI and security gates are defined in [docs/ci-and-security-gates.md](/Users/robert/Projects/gnucash-ng/docs/ci-and-security-gates.md) and [docs/security-standards.md](/Users/robert/Projects/gnucash-ng/docs/security-standards.md).

## Branch Strategy

- branch from the latest `main`
- keep branches scoped to one issue or one coherent slice of work
- rebase or merge `main` into the branch if it drifts
- delete branches after merge

Recommended branch names:

- `feat/5-metrics-and-tracing`
- `fix/42-auth-header-validation`
- `refactor/6-mobile-action-cards`
- `docs/git-workflow`

## Pull Requests

Every code change should land through a pull request.

Pull requests should:

- link the relevant GitHub issue or roadmap item
- summarize user-facing and technical changes
- include local verification such as `pnpm ci:verify` or the relevant narrower commands
- include screenshots or recordings for web or mobile UI changes

## Merge Style

- prefer squash merges to keep `main` readable
- use an imperative PR title and squash-merge commit title
- include the issue number in the branch name, PR title, or commit title when practical

## Commit And Push Cadence

- commit at reasonable milestones instead of letting large uncommitted changes accumulate
- push the working branch after meaningful verified progress, even before the final PR is ready
- prefer small, reviewable commits that preserve a clear implementation story
- avoid waiting until the end of a long session to save all local work

## Local Workflow

1. update `main`
2. create a focused branch
3. implement the change with tests
4. commit at a reasonable milestone
5. run local verification
6. push the branch
7. open a pull request
8. squash merge after review and CI pass
9. delete the branch

Example:

```bash
git checkout main
git pull --ff-only
git checkout -b feat/5-metrics-and-tracing
pnpm ci:verify
git push -u origin feat/5-metrics-and-tracing
```

## Current Constraint

Branch protection is not currently available for this private repository on the active GitHub plan, so the no-direct-push rule for `main` is a team process requirement rather than an enforced GitHub setting.
