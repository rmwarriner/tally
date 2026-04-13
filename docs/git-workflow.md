# Git Workflow

Last reviewed: 2026-04-13

## Policy

This repository uses a light trunk-based workflow:

- `main` is the integration branch and should remain releasable
- all feature, fix, refactor, and documentation work starts on a short-lived branch
- changes merge through pull requests, not direct pushes to `main`
- branch protection enforces PR-based merges for all changes

Work tracking is GitHub-first:

- GitHub Issues are the canonical execution queue
- use `gh issue list` for queue view and `gh issue view <number>` for full specs
- execution work should be tied to an issue number

Ideas not ready for execution should be tracked as GitHub Issues labeled `idea`.

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

Recommended branch names:

- `feat/111-ledger-ops`
- `fix/113-reconciled-at-validation`
- `refactor/112-register-visual-identity`
- `docs/139-github-issues-workflow`

## Pull Requests

Every change should land through a pull request.

Pull requests should:

- link the relevant GitHub issue or roadmap item
- summarize user-facing and technical changes
- include local verification such as `pnpm ci:verify` or the relevant narrower commands
- include screenshots or recordings for web or mobile UI changes
- follow the repository pull request template in `.github/PULL_REQUEST_TEMPLATE.md`
- include a test plan selection in the PR template; if `No test needed` is selected, provide rationale and link a `test-debt` issue
- include risk tier, rollback plan, and handoff packet in the PR template
- include `Closes #NNN` in the PR body for issue-linked work

## Idea Intake

Use GitHub Issues with the `idea` label for exploratory or underspecified work.

Promote an idea to execution when:

- the outcome is clear enough to execute
- the rough implementation area is known
- it can be prioritized against current roadmap work
- someone is ready to work it in the near term

## Merge Style

- prefer squash merges to keep `main` readable
- use an imperative PR title and squash-merge commit title
- include the issue number in branch name, PR title, or commit title when practical

## Commit And Push Cadence

- commit at reasonable milestones instead of letting large uncommitted changes accumulate
- push the working branch after meaningful verified progress, even before the final PR is ready
- prefer small, reviewable commits that preserve a clear implementation story
- avoid waiting until the end of a long session to save all local work
- verify Git state sequentially after commit and push operations instead of running `git push` and `git status` in parallel

## Workspace Setup

Both Claude Code and Codex work in the same directory: `/Users/robert/Projects/tally`.

| Agent | Directory | Branch |
|---|---|---|
| Claude Code | `/Users/robert/Projects/tally` | `main` |
| Codex | `/Users/robert/Projects/tally` | feature branches only |

## Local Workflow

1. `git fetch origin`
2. `git checkout -B <type>/NNN-short-description origin/main`
3. implement the change with tests
4. commit at a reasonable milestone
5. run local verification
6. push the branch
7. open a pull request with `.github/PULL_REQUEST_TEMPLATE.md`
8. merge after required checks and review policy
9. delete the branch

Example:

```bash
git fetch origin
git checkout -B feat/111-ledger-ops origin/main
pnpm ci:verify
git push -u origin feat/111-ledger-ops
```

## Weekly Review Cadence

At least once a week:

- review open GitHub Issues and re-rank by priority
- triage `idea`-labeled issues and promote ready items into execution issues
- review open Dependabot pull requests and ensure patch/minor updates flow through CI
- convert deferred major dependency updates into tracked GitHub issues
- check CI status so repeated failures do not become background noise

See [docs/ai-team-operations.md](/Users/robert/Projects/tally/docs/ai-team-operations.md) for definition of done, escalation boundaries, do-not-touch zones, handoff template, and weekly AI ops review.

## Repository Status

Branch protection is active on `main`; PR-based workflow and required status checks are enforced by repository rules.
