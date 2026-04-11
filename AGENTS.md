# AGENTS.md

Canonical repository agent guidance lives in [CLAUDE.md](/Users/robert/Projects/tally/CLAUDE.md).

This file is intentionally a thin pointer so Claude Code and Codex share one policy source of truth.
Do not duplicate policy text here.

## Session Start — Handoff Check

At the start of every session, before doing anything else:

1. Check whether `docs/codex-handoff.md` exists in the repository root.
2. If it exists, read it and ask the user: "A handoff file is present — would you like me to execute it?"
3. Wait for confirmation before proceeding. Do not execute the handoff automatically.
4. If no handoff file is present, proceed normally.
