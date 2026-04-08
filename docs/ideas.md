# Ideas

Captured ideas not yet ready for roadmap execution, organized by track. This file is the authoritative idea inbox — GitHub Issues are only created when an idea is promoted to execution.

## Promotion criteria

Promote an idea to a GitHub Issue when:
- the outcome is clear enough to execute
- the rough implementation area is known
- it can be prioritized against current roadmap work
- it is ready to work in the near term

## Weekly review

- scan each track for ideas ready to promote
- promote by creating a focused GitHub Issue using the appropriate template
- close or remove stale ideas that no longer apply

---

## Track 1: Trust, Audit, Integrity, and Security

### Cross-cutting data integrity hardening
The project has several integrity mechanisms in place (domain validation, audit events, close-period locks, backup/restore) but lacks an explicit end-to-end integrity strategy that treats correctness as a cross-cutting architectural concern.

Parked until the team is ready to design this deliberately across domain, persistence, migration, and backup/restore rather than adding isolated safeguards reactively.

**Key open questions:**
- Which integrity guarantees should be synchronous on every write versus deferred to verification flows?
- What should happen when violations are detected: reject, quarantine, attempt repair, or require operator action?
- Should backup creation and restore include integrity verification before acceptance?
- How should this evolve if SQLite or Postgres backends are adopted?

---

## Track 2: Budgeting, Envelopes, Planning, and Forecasting

### Explicit remaining-to-budget money pool
Multiple envelope ideas imply a pool of money available to allocate that is distinct from accounting income, transfer activity, or raw account balances. Defining this explicitly would give envelope funding a clearer source of truth and help line-item and envelope budgets coexist cleanly.

Parked until the broader envelope model is settled.

**Key open questions:**
- Is this pool derived or stored?
- How do off-budget transfers affect it?
- How does it interact with rollover, cleanup, and goals?

### Traditional line-item budgets alongside envelope budgeting
Formalize two complementary budgeting lenses: a fixed authored budget representing intention (the baseline) and an envelope layer representing execution. This enables variance reporting, a cleaner onboarding path, and personas that use one or both layers.

Parked until the team is ready to make an explicit budgeting-model decision rather than continuing with incremental envelope refinements.

**Key open questions:**
- Should the existing baseline budget become the formal line-item budget, or does it need richer structure first?
- How tightly should envelope funding be seeded or refreshed from the line-item budget?
- How should traditional-budget variance and envelope-balance variance be reported separately?

### Envelope rollover, funding, and cleanup rules
Envelope balances should roll over month to month rather than resetting. Fresh funding adds on top of carried balances. Configurable funding and cleanup rules (inspired by Actual Budget) would reduce manual adjustment and create predictable month-boundary behavior.

Parked until the broader envelope semantics are decided — this needs to be designed alongside the virtual-ledger and ongoing-funding ideas.

**Key open questions:**
- Should rollover be mandatory, default, or configurable per envelope?
- How should negative balances behave across month boundaries?
- Should cleanup happen automatically at period boundaries or as an explicit user action?

### Ongoing envelope funding adjustments
Users need to add, remove, and move funds between envelopes beyond initial setup, including inflows that are budgetable but not classified as accounting income (e.g., lump-sum transfers from off-budget savings).

Parked until the broader envelope semantics are settled — should be scoped together rather than added piecemeal.

**Key open questions:**
- Should incoming budgetable money be a distinct concept from income and transfer activity?
- How should cross-envelope funding transfers be represented in the data model and audit trail?
- How should reports distinguish true income from funding inflows used only for budgeting?

### Overspent envelope visibility and coverage flows
Overspending should be allowed but made obvious, with explicit flows to cover the overage from another envelope or from unallocated remaining-to-budget funds.

Parked until the envelope funding, rollover, and cleanup model is defined.

**Key open questions:**
- Should some envelope types behave differently on overspend?
- Should coverage be suggested automatically based on likely source envelopes?
- Can the user defer coverage until month-end cleanup?

### Envelope budgeting with an explicit virtual ledger
The envelope layer could be made more explicit by treating it as its own virtual ledger, giving power users direct access to the underlying funding entries while normal users continue with the simplified envelope interface.

Parked until the team is ready to choose between event-driven envelopes, ledger-like envelopes, or both views.

**Key open questions:**
- Should the virtual envelope ledger be a first-class ledger with postings, or a derived representation?
- How do edits to the virtual envelope ledger stay consistent with the main financial ledger?
- What invariants prevent the virtual ledger from drifting from the underlying source of truth?

### Period snapshots for budget and planning state
Preserved snapshots of budgeting, envelope, and planning state at period close would enable month-over-month budget comparisons and easier variance review.

Parked until the close model and rollover semantics are more settled.

**Key open questions:**
- What exactly is snapshotted — envelope allocations, budget entries, both?
- Are snapshots immutable?
- How do snapshots interact with closes, rollovers, and later corrections?

### Physical balance forecasting from recurring transactions
A forward-looking account balance forecast ("if all my scheduled items post, what will my bank balance be?") is a distinct and more practical question than period cash-flow. This would live on or near the recurring screen.

Parked until the team is ready to define a bounded forecasting slice including scope, time horizon, and account grouping.

**Key open questions:**
- Which accounts to forecast: all cash accounts combined, per account, or both?
- What time horizon: end of month, rolling 30 days, next due cycle, or configurable?
- How are already-recorded recurring transactions excluded so only pending items affect the forecast?

### Goal-tracking layer for savings targets and sinking funds
Envelope budgeting and traditional budgets do not fully cover longer-term savings intentions — target amounts, deadlines, and progress tracking without polluting the ledger core.

Parked until the broader envelope and remaining-to-budget model is settled.

**Key open questions:**
- Is a goal a specialized envelope or a separate layer?
- How are goal contributions funded and reported?
- How should goals interact with rollover and cleanup rules?

### What-if planning and sandbox scenarios
Users may want to test funding decisions, recurring changes, or large purchases without mutating the real workspace.

Parked until the forecasting and envelope model is more mature.

**Key open questions:**
- Is sandbox state ephemeral, saved, or branch-like?
- Can scenarios be promoted into real commands?
- How does sandbox state interact with forecasts, budgets, and envelopes?

---

## Track 3: Layered Architecture and Account Decorators

### Clean accounting core with higher-order feature layers
Formalize an architectural principle: the ledger and account layer stays minimal and authoritative; envelopes, forecasting, goals, sync, and other product concepts live as separate layers above it. This prevents feature creep from polluting the accounting core.

Parked as an architectural idea that should be made explicit before more product layers accumulate. First captured as an idea, then translated into specific roadmap work when the team is ready to define concrete boundary patterns.

**Key open questions:**
- What exact boundary rules determine whether a concept belongs in the ledger or a higher-order layer?
- Which invariants belong to the ledger core versus upper layers?
- Should there be a formal pattern for upper layers: decorators, projections, virtual ledgers, or companion models?

### Decorator-style account markers for envelope participation
Accounts that participate in envelope behavior could carry an explicit decorator marker rather than overloading the base account definition. This keeps the chart-of-accounts clean and makes envelope-related behavior composable.

Parked until the team is ready to make broader envelope-semantics and account-role-metadata decisions.

**Key open questions:**
- Should the decorator be a boolean marker, a role enum, or a richer metadata object?
- Is it attached to accounts, envelopes, or the relationship between them?
- Could the same mechanism be used for other account roles later?

### Bank-synchronized accounts as decorated accounts
If the decorator pattern is adopted for account behaviors, bank sync should follow the same approach — annotating a normal ledger account with sync metadata rather than changing the core account model.

Parked until the decorator pattern and sync integration (SimpleFIN) are scoped together.

**Key open questions:**
- What should the sync decorator contain: provider type, remote identifiers, status, last-sync timestamps, cursor state?
- Is it attached directly to the account or maintained as a keyed companion model?
- How should credential material stay separate from account metadata?

### Formal account roles and balance-scope metadata
Multiple future features (on-budget vs off-budget, sync-enabled, envelope-participating, forecast-included) imply account-level roles or scopes that should not mutate core accounting semantics. A composable metadata model above the accounting core would serve all of these.

Parked until the decorator/layering architectural direction is clearer.

**Key open questions:**
- Which roles belong on accounts directly versus in companion models?
- Can an account have multiple layered roles at once?
- Which roles affect behavior versus only presentation?

### Ledger as a module within a broader household system
Investigate whether Ledger should be able to operate as one module within a broader household system in the future, rather than only as a standalone finance application.

Parked as a future-facing architecture and product-shaping investigation.

**Key open questions:**
- Should Ledger remain a standalone product that can also be embedded, or be designed as a household-system module from the start?
- What service, identity, and UI boundaries would make modular embedding feasible?
- What data ownership boundaries should remain inside Ledger even if other household modules exist?

---

## Track 4: Automation, Sync, and AI-assisted Workflows

### AI as an optional assistive layer
Formalize AI as an optional layer in the product — core accounting, persistence, validation, audit, and reporting must remain fully usable with AI disabled. AI should suggest, summarize, classify, explain, or draft; users confirm any financially meaningful mutation.

Parked as an architectural stance idea that should be captured before ad hoc integrations accumulate.

**Key open questions:**
- Where should AI settings live: global user settings, workspace settings, device settings, or some combination?
- Should AI support be one unified service boundary or multiple feature-local integrations?
- What privacy and data-handling controls are required if external AI providers are used?

### SimpleFIN Bridge integration for automated transaction download
SimpleFIN Bridge (used by Actual Budget and Lunch Money) offers a token-based HTTP API for automated bank transaction download without the compliance complexity of Plaid or direct bank APIs. Transactions would map into the existing import model with deduplication.

Parked until the team is ready to define a proper sync slice with credential handling, polling semantics, and deduplication strategy.

**Key open questions:**
- Where should SimpleFIN credentials be stored, especially with SQLite or Postgres backends?
- How should polling be triggered: manual sync, background job, or scheduled worker?
- How should imported transactions be matched against existing manual imports or previously synced items?

### Financial rule engine for categorization and automation
Repeated categorization, merchant cleanup, schedule recognition, and funding suggestions create repetitive user work. A rule engine would support merchant normalization, recurring-transaction recognition, import classification, and funding automation.

Parked until the import and review workflows are more settled.

**Key open questions:**
- How much should be deterministic rules versus AI-assisted rules?
- Where should rules live and how are they versioned?
- How are false positives reviewed and corrected?

### Transaction review and inbox workflows
As imports, sync, AI suggestions, receipt scanning, and soft-delete flows grow, the product needs a place for users to review uncertain or newly arrived transactions before they blend into normal workflows.

Parked until the sync and AI-assist features that would feed it are further along.

**Key open questions:**
- Is review state separate from posted state?
- Which actions require review versus immediate acceptance?
- How does this interact with audit, reconciliation, and recurring items?

### Receipt and document scanning into line-item postings
Read a receipt image or PDF and generate individual transaction postings at the line-item level, with optional AI-assisted account assignment based on existing posting patterns. Links to the existing receipt attachment feature rather than acting as an unrelated import path.

Parked until the team is ready to scope it as a coherent workflow spanning OCR, transaction modeling, review UX, and attachments.

**Key open questions:**
- Should line items become separate postings within one transaction, separate child transactions, or another structure?
- How should confidence and user review work before anything is posted to the ledger?
- What privacy and security controls are required if external AI/OCR services are used?

### Explainability surfaces for financial state and suggestions
As forecasting, budgeting, AI suggestions, and layered planning features grow, users will increasingly need explanations for why the system produced a result (why is an envelope negative? why did the forecast change?).

Parked until those features exist to explain.

**Key open questions:**
- Which explanations belong in deterministic systems versus AI-assisted summaries?
- Where should explanations live in the UI?

### Centralized exception center
The product is accumulating several categories of exceptions users need to resolve: overspent envelopes, unreconciled items, failed imports, pending recurring items, sync failures, uncertain transaction matches. A single operational surface for unresolved issues would improve visibility.

Parked until the exception sources (sync, AI review, envelopes) are further built out.

**Key open questions:**
- Is this a dashboard surface, a queue, or a dedicated workbench?
- Which exception types belong together?
- How should severity and urgency be represented?

### Undo and user-facing history for non-destructive actions
As the product gains more layers, funding flows, and operational actions, users will need a safe way to reverse non-destructive mistakes without relying on raw restore operations.

Parked until the command model is more mature.

**Key open questions:**
- Which actions are undoable?
- Is undo command-based, snapshot-based, or event-based?
- How does it interact with audit trails and soft delete?

### Import/export support for plain-text accounting formats
Support importing and exporting Ledger, hledger, and Beancount formats to improve portability and migration paths for users coming from text-ledger workflows.

Parked until scoped for roadmap execution.

**Key open questions:**
- Mapping model differences between each format and the internal account/transaction model
- Round-trip fidelity expectations and known lossy edges
- Handling commodities, pricing directives, metadata/tags, and splits

### Import/export support for GnuCash CSV account data
Improve interoperability for users migrating from GnuCash workflows and CSV-based tooling.

Parked until scoped for roadmap execution.

**Key open questions:**
- Confirm the exact GnuCash CSV variants and field mappings to support first
- Behavior for account hierarchy, currency, opening balances, and account types
- Round-trip fidelity limits for known lossy cases

---

## Track 5: Family-Scale Collaboration and Review Flows

### Household collaboration controls and approval roles
Household finance involves shared data but different comfort levels and authority levels for edits, approvals, and destructive actions. Approval/review workflows and clearer change attribution would complement the identity foundation already in place.

Parked — the identity layer is implemented; this is the next natural slice but needs scoping around which actions require approval and what the data model looks like.

**Key open questions:**
- What roles are needed beyond the current member roles?
- Which actions need approval vs. just attribution?
- How does approval interact with audit trails and destructive actions?

---

## Track 6: Operations and Infrastructure

### Dev containers for reproducible local development
A dev-container workflow would provide a reproducible development environment, reduce setup friction, and improve consistency between local validation and CI.

Parked until scope is bounded (single default container vs. role-specific variants) and expected developer impact is validated.

**Key open questions:**
- Which workflows should be first-class in-container: `pnpm dev:api`, tests, typecheck, web/mobile?
- How should mobile/Expo ergonomics work with containerized development?
- What is the maintenance cost of keeping devcontainer definitions aligned with CI and runtime?

### Production deployment in Docker or Podman containers
A containerized production target would simplify deployment automation, standardize operational runbooks, and reduce environment drift. Supporting both Docker and Podman would broaden hosting options.

Parked until scope is narrowed and the first production slice is defined (likely API-first).

**Key open questions:**
- What should be containerized first: API only vs. full stack components?
- Should Docker and Podman both be first-class, or one primary with compatibility guidance?
- What are the runtime requirements for persistence, secrets, and backup/restore in a containerized setup?
