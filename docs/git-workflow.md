# Git Workflow

Last reviewed: 2026-04-06

## Policy

This repository uses a light trunk-based workflow:

- `main` is the integration branch and should remain releasable
- all feature, fix, refactor, and documentation work starts on a short-lived branch
- changes merge through pull requests, not direct pushes to `main`

Exception:

- small administrative or documentation-only changes may go directly to `main`
- documentation or admin changes that are part of a significant feature should stay on that feature branch and land with the feature work

This repository's CI and security gates are defined in [docs/ci-and-security-gates.md](/Users/robert/Projects/tally/docs/ci-and-security-gates.md) and [docs/security-standards.md](/Users/robert/Projects/tally/docs/security-standards.md).

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
- follow the repository pull request template in `.github/PULL_REQUEST_TEMPLATE.md`

## Idea Intake Before Roadmap

Not every idea belongs on the roadmap immediately.

Use a separate idea inbox for work that is still exploratory, underspecified, or not yet prioritized:

- create a GitHub issue
- label it `idea`
- do not assign a milestone yet
- do not add it to the `Tally Roadmap` project yet
- prefer the `Idea` GitHub issue template for consistent capture

Idea issues should capture:

- the problem or opportunity
- why it matters
- the likely area such as `api`, `web`, `mobile`, `domain`, or `operations`
- open questions or unknowns
- why now or why later

Promote an idea to the roadmap only when:

- the outcome is clear enough to execute
- the rough implementation area is known
- it can be prioritized against current roadmap work
- someone is ready to work it in the near term

Roadmap-ready execution work, bugs, and refactors should use the corresponding GitHub issue templates so intake stays consistent.

## Merge Style

- prefer squash merges to keep `main` readable
- use an imperative PR title and squash-merge commit title
- include the issue number in the branch name, PR title, or commit title when practical

## Commit And Push Cadence

- commit at reasonable milestones instead of letting large uncommitted changes accumulate
- push the working branch after meaningful verified progress, even before the final PR is ready
- prefer small, reviewable commits that preserve a clear implementation story
- avoid waiting until the end of a long session to save all local work
- verify Git state sequentially after commit and push operations instead of running `git push` and `git status` in parallel
- after a push, run a fresh `git status --short --branch`; if needed, confirm with `git rev-parse HEAD` and `git rev-parse origin/main`

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

## Weekly Review Cadence

At least once a week:

- review new `idea` issues and either keep parked, promote, or close them
- re-rank open roadmap issues against current priorities
- check the roadmap project for stale or missing items
- review open Dependabot pull requests and ensure patch/minor updates are flowing through CI-based merge automation
- convert major dependency updates into tracked upgrade issues when they are deferred
- check CI status so repeated failures do not become background noise
- close or relabel issues whose scope has changed

## Current Constraint

Branch protection is not currently available for this private repository on the active GitHub plan, so the no-direct-push rule for `main` is a team process requirement rather than an enforced GitHub setting.

Native GitHub auto-merge may also be unavailable on the active plan. Dependency update flow therefore uses a CI-driven merge workflow (`.github/workflows/dependabot-auto-merge.yml`) rather than relying on the repository auto-merge toggle.

## GitHub Rename Checklist (External Steps)

When executing the repository rename to `rmwarriner/tally`, complete this checklist in GitHub UI/admin settings:

1. Rename repository from `rmwarriner/gnucash-ng` to `rmwarriner/tally`.
2. Rename the roadmap project title from `Tally Roadmap` to the finalized title if needed.
3. Verify branch protection and required status checks still target the same workflows.
4. Verify GitHub Actions, Dependabot, and any webhook/app integrations still run against the renamed repository.
5. Update local clones:
   - `git remote set-url origin https://github.com/rmwarriner/tally.git`
6. Verify CI on a fresh PR after rename to confirm no hidden repository-name coupling.

### Rename Execution Status (2026-04-07)

- completed: repository renamed to `rmwarriner/tally`
- completed: roadmap project created and titled `Tally Roadmap`
- completed: local clone `origin` updated to `rmwarriner/tally`
- pending verification: branch protection and required checks after rename
- pending verification: Actions, Dependabot, and webhook/app integrations after rename
- pending verification: CI pass on a fresh PR after rename
