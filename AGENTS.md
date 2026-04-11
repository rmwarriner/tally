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

Each handoff file is self-contained: it includes an explicit **First step** with the exact git commands to sync the worktree and create the branch. Execute that first step before doing anything else.

After the first step:
1. Check the `**Dependencies:**` field. If a listed issue is not yet merged into `main`, stop and prompt the user — do not proceed.
2. Follow the spec exactly. Do not expand scope beyond the stated acceptance criteria.
