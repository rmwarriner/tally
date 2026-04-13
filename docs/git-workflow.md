# Git Workflow

Last reviewed: 2026-04-13

## Policy

This repository uses a light trunk-based workflow:

- `main` is the integration branch and should remain releasable
- all feature, fix, refactor, and documentation work starts on a short-lived branch
- changes merge through pull requests, not direct pushes to `main`

Work tracking uses GitHub Issues as the canonical execution queue. All actionable work — features, bugs, refactors, ops — is tracked there.

Exception:

- all changes must go through a pull request; branch protection on `main` enforces this
- documentation or admin changes that are part of a significant feature should stay on that feature branch and land with the feature work

This repository's CI and security gates are defined in [docs/ci-and-security-gates.md](/Users/robert/Projects/tally/docs/ci-and-security-gates.md) and [docs/security-standards.md](/Users/robert/Projects/tally/docs/security-standards.md).

## Agent Guidance Source Of Truth

Repository agent policy is canonical in [CLAUDE.md](/Users/robert/Projects/tally/CLAUDE.md).

- [AGENTS.md](/Users/robert/Projects/tally/AGENTS.md) is intentionally a thin pointer for Codex
- contributors should update policy in `CLAUDE.md` and not duplicate policy text in `AGENTS.md`
- run `pnpm agent-guidance:check` (or `pnpm ci:verify`) to verify no drift between canonical policy and pointer shim

## Branch Strategy

- branch from the latest `main`
- keep branches scoped to one issue or one coherent slice of work
- rebase or merge `main` into the branch if it drifts
- delete branches after merge

Recommended branch names (use the GitHub issue number):

- `feat/111-ledger-operations-test-gaps`
- `fix/113-reconciled-at-validation`
- `refactor/112-register-visual-identity`
- `docs/git-workflow`

## Pull Requests

Every code change should land through a pull request.

Pull requests should:

- link the relevant GitHub issue or roadmap item
- summarize user-facing and technical changes
- include local verification such as `pnpm ci:verify` or the relevant narrower commands
- include screenshots or recordings for web or mobile UI changes
- follow the repository pull request template in `.github/PULL_REQUEST_TEMPLATE.md`
- include a test plan selection in the PR template; if `No test needed` is selected, provide rationale and link a `test-debt` issue
- include risk tier, rollback plan, and handoff packet in the PR template

## Idea Intake Before Roadmap

Not every idea belongs on the roadmap immediately.

Use `docs/ideas.md` as the authoritative idea inbox for work that is still exploratory, underspecified, or not yet prioritized. Ideas are organized there by track.

To add a new idea:

- add an entry to the relevant track in `docs/ideas.md`
- include: the problem or opportunity, why it is parked, and the key open questions
- commit directly to `main` if it is a small admin change

Promote an idea to a GitHub Issue only when:

- the outcome is clear enough to execute
- the rough implementation area is known
- it can be prioritized against current roadmap work
- someone is ready to work it in the near term

Use the appropriate GitHub Issue template (bug, feat, refactor, ops) and include acceptance criteria, risk tier, and rollback plan in the issue body.

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

## Workspace Setup

Both Claude Code and Codex work in the same directory: `/Users/robert/Projects/tally`.

| Agent | Directory | Branch |
|---|---|---|
| Claude Code | `/Users/robert/Projects/tally` | always `main` |
| Codex | `/Users/robert/Projects/tally` | feature branches only, never `main` |

**Claude Code** stays on `main` at all times. For PR review, `gh pr diff <number>` is sufficient — no checkout needed.

**Codex** fetches and creates a feature branch before any work:
```bash
cd /Users/robert/Projects/tally
git fetch origin
git checkout -B feat/<task> origin/main
```

After a Codex PR merges, Claude Code pulls `main`:
```bash
git pull
```

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

- review `docs/ideas.md` and either keep ideas parked, promote them to GitHub Issues, or remove stale ones
- re-rank open GitHub Issues against current priorities
- review open Dependabot pull requests and ensure patch/minor updates are flowing through CI-based merge automation
- convert major dependency updates into tracked GitHub Issues when deferred
- check CI status so repeated failures do not become background noise
- close or relabel GitHub Issues whose scope has changed

See [docs/ai-team-operations.md](/Users/robert/Projects/tally/docs/ai-team-operations.md) for definition of done, escalation boundaries, do-not-touch zones, handoff template, and weekly AI ops review.

## Repository Status

- Repository is public at `github.com/rmwarriner/tally`
- Branch protection is enforced on `main`: direct pushes and force pushes are blocked; `pr-policy` and `ci-verify` must pass before merge
- Dependency updates flow through `.github/workflows/dependabot-auto-merge.yml` (patch/minor auto-merge after CI passes)
