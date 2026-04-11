# AGENTS.md

**Policy source of truth: [CLAUDE.md](CLAUDE.md)**

All execution rules, non-negotiables, PR requirements, coding conventions, and project standards are defined in `CLAUDE.md` and apply to every Codex session without exception. Do not duplicate or override policy text here.

This file contains only Codex-specific operational instructions — session startup, worktree sync, and handoff mechanics — that are not relevant to Claude Code and do not belong in the shared policy file.

## Codex Session Start

Run these commands at the start of every session before reading any handoff or doing any work:

```bash
cd /Users/robert/Projects/tally-codex
git fetch origin
git checkout main
git pull --ff-only
```

This ensures the worktree is current with `main` before branching. Do not skip this step even if the worktree appears up to date.

## Starting an Issue

When told to "start on I-NNN", read `docs/handoffs/I-NNN.md` for the full spec.

1. Check the `**Dependencies:**` field first. If a listed issue is not yet merged into `main`, stop and prompt the user — do not proceed.
2. Run the session-start sync above if not already done this session.
3. Create the branch specified in `**Branch:**` from `origin/main`.
4. Follow the spec exactly. Do not expand scope beyond the stated acceptance criteria.
