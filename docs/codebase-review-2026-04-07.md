# Tally Codebase Review
_April 7, 2026_

## Overview

This is a well-intentioned codebase with real architectural discipline behind it. Most of what follows isn't "this is wrong" — it's "this has a cost that may not be paying off yet."

---

## Findings

### 1. Monorepo structure adds unnecessary nesting

The current layout has three top-level sub-directories — `tally-core`, `tally-portal`, `tally-go` — each containing its own `apps/` and `packages/` subdirectories. That's two levels of grouping before reaching actual code.

The pnpm workspace flattens all of it anyway — packages reference each other regardless of which top-level folder they live in. The hierarchy adds navigational friction without adding enforcement.

**Recommendation**: Flatten to a conventional `apps/` and `packages/` at the root. The separation between core logic and clients is better expressed through package boundaries and dependency direction than filesystem nesting.

---

### 2. API package size is a red flag worth investigating

At ~13,800 lines, the API package is the largest in the repo — bigger than the domain, workspace, and web client packages combined. For an HTTP service, that's a signal worth taking seriously.

A service that large typically means one or more of: routing, business logic, and persistence concerns aren't cleanly separated internally; or features that could be independent modules have accumulated into a single boundary.

**Recommendation**: Audit whether the API package has coherent internal seams. If it does, consider whether those seams should become explicit sub-modules or separate packages.

---

### 3. Three persistence backends is one too many

JSON, SQLite, and PostgreSQL behind a shared repository interface is a thoughtful design. But three production-quality implementations is a significant maintenance commitment — every schema change and behavioral edge case must be handled correctly across all three.

JSON-backed persistence is useful for tests and local development but has no clear runtime deployment target. SQLite and PostgreSQL serve genuinely different deployment needs (self-hosted vs. cloud-hosted) and are both worth maintaining.

**Recommendation**: Demote JSON to a test fixture backend only. Focus maintenance effort on SQLite and PostgreSQL.

---

### 4. Placeholder packages add noise

`tally-cli` and `tally-desktop` are stubs with no real code. They sit in the pnpm workspace, appear in typecheck runs, and imply a roadmap commitment to two full new clients.

Stub packages carry a subtle tax: they make the repo feel larger than it is, can break CI in unexpected ways as tooling evolves, and signal intent that may drift from reality.

**Recommendation**: Delete them. Re-add when there is actual code to put in them.

---

### 5. Coverage thresholds are incoherent

Current thresholds: 70% statements, 75% branches, 85% functions, 70% lines.

Functions at 85% but statements at 70% is an unusual configuration. If 85% of functions are covered, you'd normally expect more than 70% of their statements to be exercised. This suggests the thresholds were set independently rather than as a coherent policy — in practice it means a function can be "covered" (called once) without most of its internal logic being exercised.

**Recommendation**: Normalize to a coherent baseline — 80% across statements, branches, and functions — with explicit justification for any metric set lower.

---

### 6. The "workspace" mental model may not suit end users

The codebase borrows the "workspace" concept from developer tooling (VS Code, JetBrains), and the UI is explicitly described as "VS Code-inspired." This may reflect the developers' mental models more than the target audience's.

Most successful consumer finance tools use domain-specific metaphors: accounts, budgets, envelopes, categories. "Workspace" is an abstraction one level above those — more like "a project containing all your financial data" — which may be unfamiliar to households managing personal finances.

**Recommendation**: Audit whether "workspace" appears in user-facing surfaces. If it does, evaluate whether the abstraction is earning its place with real users. The underlying architecture can retain the concept without exposing it in the UI.

---

### 7. Documentation volume may be premature

Twenty-eight documentation files for a project this early is ambitious. Some are clearly load-bearing: architecture decisions, security standards, logging conventions. Others — detailed deployment runbooks, operations guides — may be premature for a project that hasn't shipped to production yet.

Docs have a cost: they need to stay synchronized with the code, they create a false sense of stability around evolving decisions, and they take time to write.

**Recommendation**: Audit the doc set. For each file, ask: "Would a new contributor need this, or did we write it to feel more finished than we are?" Delete or defer the latter category.

---

## What to Leave Alone

The following are genuinely good and worth protecting as the project grows:

- **Layered domain/workspace/service/client separation** — clean, coherent, and worth enforcing strictly
- **Persistence abstraction** — the right instinct even if the scope should be reduced
- **Audit event model** — essential for a finance app
- **Structured logging with secret redaction** — correct default for financial data
- **TypeScript strict mode** — non-negotiable
- **CI with security scanning** — already in place, keep it

The architectural bones of this project are sound. The recommendations above are about reducing surface area and friction, not fixing fundamental mistakes.
