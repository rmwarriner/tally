# GitHub Automation Backlog

This backlog tracks post-phase-2 GitHub workflow tightening items.

## Pending Improvements

1. CodeQL transient-rate-limit auto-retry
- Goal: Automatically retry CodeQL setup/analyze when GitHub action download failures are transient (for example HTTP 429 from action tarball fetches).
- Implementation sketch: add a lightweight workflow/job that detects known transient failure signatures and triggers one bounded rerun.
- Guardrails: max one automatic retry per run to avoid loops.

2. Centralized PR-body policy checker
- Goal: Keep PR template-policy rules in one shared script/module so policy behavior is explicit and easy to evolve.
- Implementation sketch: move regex/validation logic from inline workflow YAML into a script in `scripts/ci/` and call it from the workflow.
- Guardrails: preserve current failure messages to avoid surprise UX changes.

3. CODEOWNERS for process and policy surfaces
- Goal: Require explicit review for high-impact process/policy files.
- Candidate paths:
  - `.github/workflows/**`
  - `AGENTS.md`
  - `CLAUDE.md`
- Guardrails: keep reviewer set small to avoid review bottlenecks.
