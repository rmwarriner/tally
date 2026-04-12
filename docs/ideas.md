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

### ~~CORS configuration~~ *(implemented)*
Allowlist-based origin validation with `TALLY_API_CORS_ALLOWED_ORIGINS` env var. Wildcard in non-production, exact-origin matching in production. `OPTIONS` preflight handling with 24-hour max-age.

### ~~Audit event read endpoint~~ *(implemented)*
`GET /api/books/:id/audit-events` with `?since=`, `?eventType=`, and `?limit=` query params. Auth at `read` level. Returns all matching audit events from the book document.

### Concurrent write safety (optimistic locking)
No ETag or document-version conflict detection exists. Two household members writing simultaneously will silently produce a last-write-wins outcome. This is a data integrity risk in the multi-user household scenario the product is targeting.

**Next slice:** Add a `version` integer to `FinanceBookDocument`, increment on every `save`, enforce `If-Match` header on write routes, return `409 Conflict` on mismatch.

**Key open questions:**
- Should version be per-book or per-resource (per-transaction, per-account)?
- What is the client recovery flow when a conflict is detected?

### Idempotency keys for mutations
No idempotency mechanism on POST mutations. A network timeout followed by a client retry will create duplicate transactions. This is especially problematic for import endpoints and transaction creation.

**Next slice:** Accept a client-supplied `Idempotency-Key` header on mutation endpoints. Store seen keys with a TTL (e.g., 24 hours) and return the cached response for duplicate requests.

**Key open questions:**
- Where is the idempotency key store — in-memory (per-process) or durable (per-book)?
- Should all POST routes support idempotency or only specific high-risk ones?

### Token and session management endpoints
Tokens are configured at API startup and have no management surface. There is no way to issue, list, or revoke tokens via the API. In a household context where a member may lose a device or be removed from the workspace, revocation is a security gap.

**Next slice:** Admin-only routes for `GET /tokens`, `POST /tokens` (issue a new token), and `DELETE /tokens/:tokenId` (revoke). Tie token identity to the book authorization model.

**Key open questions:**
- Should token management be book-scoped or global to the API instance?
- How should token secrets be stored — hashed in book doc, or in a separate secrets store?
- What is the revocation mechanism — denylist or signed token expiry?

### Cross-cutting data integrity hardening
The project has several integrity mechanisms in place (domain validation, audit events, close-period locks, backup/restore) but lacks an explicit end-to-end integrity strategy that treats correctness as a cross-cutting architectural concern.

Parked until the team is ready to design this deliberately across domain, persistence, migration, and backup/restore rather than adding isolated safeguards reactively.

**Key open questions:**
- Which integrity guarantees should be synchronous on every write versus deferred to verification flows?
- What should happen when violations are detected: reject, quarantine, attempt repair, or require operator action?
- Should backup creation and restore include integrity verification before acceptance?
- How should this evolve if SQLite or Postgres backends are adopted?

### Optional end-to-end encryption between clients and the API
Add an optional E2E encryption layer so that sensitive financial data is encrypted on the client before transmission and decrypted only on the client after retrieval, preventing the API server from seeing plaintext payload data even in transit.

Parked until the team is ready to define key management, the scope of encrypted fields, and the operational trade-offs around server-side search, audit, and backup/restore.

**Key open questions:**
- Which payloads or fields should be encrypted — full transaction bodies, specific sensitive fields, or everything?
- How are encryption keys managed: user-held, device-derived, or a key management service?
- How does E2E encryption interact with server-side audit events, search, and import/export?
- What is the recovery path if a user loses their key?

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
Users may want to test funding decisions, recurring changes, or large purchases without mutating the real book.

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

### Expose the Tally API as an MCP service
Surface the Tally API as a Model Context Protocol (MCP) server so that AI assistants (Claude, Codex, etc.) can query accounts, transactions, budgets, and envelopes directly via tool calls rather than through raw HTTP.

Parked until the API surface is more stable and the team is ready to define the MCP tool contract.

**Key open questions:**
- Which resources and actions should be exposed as MCP tools — read-only first, or include mutations?
- Should this be a separate MCP adapter package or a transport layer built into `apps/api`?
- How should the existing token-based auth model map to MCP session credentials?
- How do audit events and the no-trust-client-identity rule apply to AI-issued mutations?

---

## Track 4: Automation, Sync, and AI-assisted Workflows

### AI as an optional assistive layer
Formalize AI as an optional layer in the product — core accounting, persistence, validation, audit, and reporting must remain fully usable with AI disabled. AI should suggest, summarize, classify, explain, or draft; users confirm any financially meaningful mutation.

Parked as an architectural stance idea that should be captured before ad hoc integrations accumulate.

**Key open questions:**
- Where should AI settings live: global user settings, workspace settings, device settings, or some combination?
- Should AI support be one unified service boundary or multiple feature-local integrations?
- What privacy and data-handling controls are required if external AI providers are used?

### Local LLM categorization via Ollama during import

When importing transactions from CSV, OFX, QFX, or GnuCash, payee descriptions are noisy (`SQ *COFFEE SHOP 1234`, `AMZN MKTP US*AB123`, `ACH PYMT UTIL CO 883`). A locally-running Ollama model could suggest an account assignment for each imported row based on the payee/description and the book's chart of accounts. Suggestions surface in the import review flow — the user confirms or overrides before anything posts to the ledger. If Ollama is not configured, the feature is simply absent; nothing breaks.

This is the only AI-assist scenario where financial data **must not leave the machine** — local execution is the correct architectural choice, not a convenience. It implements the "AI as optional assistive layer" principle already captured above.

**Intended architecture:**
- Optional `TALLY_OLLAMA_URL` env var (e.g. `http://localhost:11434`); if absent, the feature is disabled
- During import, the API calls Ollama once per row with the payee, description, and a compact COA listing; receives a suggested `accountId` and a confidence signal
- Suggestions are returned alongside parsed rows — the import review UI shows the suggestion and lets the user accept, change, or skip it; nothing is auto-posted
- No new dependency for users who don't run Ollama; existing import paths are unaffected
- Payee normalization (e.g. `SQ *COFFEE HOUSE #4 PORTLAND OR` → `Coffee House`) could run as a second optional pass through the same Ollama endpoint, producing cleaner ledger descriptions before review

**Key open questions:**
- Which model to recommend: Llama 3.1 8B and Phi-4 are the current leading candidates for local quality vs. speed; the prompt contract should be model-agnostic
- How should suggestions surface in the import review UI — inline alongside each row, as a bulk pre-fill with edit affordance, or as a separate confirmation step?
- What is the prompt contract: how is the COA passed (full list, top-N by usage frequency, or account types only)?
- Should categorization history (user overrides) feed back into future prompts as few-shot examples?
- How does this interact with the rule engine idea below — should Ollama suggestions become rules after the user confirms them a configurable number of times?

**Promotion criteria:** promote when the import review workflow UI is further defined and an Ollama integration spike has validated the prompt contract and latency against a real book.

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

Implemented — approval/review semantics for `destroyTransaction` are now in place. This idea is closed.

### Webhook and change notification delivery
In a multi-user household, polling is the only way for one client to learn about changes made by another. A webhook registration endpoint or server-sent events stream would enable real-time collaborative updates without continuous polling.

Parked until the collaboration model is stable enough to define a durable notification contract.

**Key open questions:**
- Webhook registration vs. SSE vs. WebSocket — which delivery model fits the single-host deployment shape?
- What is the payload: full workspace snapshot, event list, or delta?
- How should webhook delivery failures be handled (retries, dead-letter)?
- How does this interact with the approval model — should approval requests trigger notifications?

---

## Track 6: Operations and Infrastructure

### Single-node deployment — everything on one machine
Support a first-class single-node deployment target where the API, web client, and database all run on one computer (personal server, NAS, home lab). This is distinct from the current dev setup — it should be a supported, documented production mode with a stable startup story and no external dependencies.

Parked until the SQLite-primary persistence work is settled, since SQLite is the natural backend for this deployment shape.

**Key open questions:**
- Should this be a single process (embedded API + static web assets served together) or coordinated processes with a simple launcher?
- What is the intended host environment: bare metal, a NAS OS (Synology, TrueNAS), or a single-machine Docker/Podman stack?
- How should upgrade and backup/restore work in this mode?
- Does this subsume or replace the dev-containers idea for local non-developer users?

### Dev containers for reproducible local development
A dev-container workflow would provide a reproducible development environment, reduce setup friction, and improve consistency between local validation and CI.

Parked until scope is bounded (single default container vs. role-specific variants) and expected developer impact is validated.

**Key open questions:**
- Which workflows should be first-class in-container: `pnpm dev:api`, tests, typecheck, web/mobile?
- How should mobile/Expo ergonomics work with containerized development?
- What is the maintenance cost of keeping devcontainer definitions aligned with CI and runtime?

### Promote SQLite to primary persistence, retire JSON backend, support Postgres
Remove the JSON persistence adapter as a runtime backend. Make SQLite the primary supported adapter. Add Postgres as a second supported runtime backend. Repurpose JSON as a pure import/export format rather than a live persistence target.

Parked until the team is ready to define the migration path for existing JSON workspaces and scope the Postgres adapter work.

**Key open questions:**
- What is the migration path for users with existing JSON workspaces?
- Should Postgres be a first-class equal to SQLite or a later addition once SQLite is stable?
- How does removing JSON persistence affect the backup/restore runbook and CI fixtures?
- Does the import/export JSON format stay identical to the current book schema or get redesigned as a portable exchange format?

### Production deployment in Docker or Podman containers
A containerized production target would simplify deployment automation, standardize operational runbooks, and reduce environment drift. Supporting both Docker and Podman would broaden hosting options.

Parked until scope is narrowed and the first production slice is defined (likely API-first).

**Key open questions:**
- What should be containerized first: API only vs. full stack components?
- Should Docker and Podman both be first-class, or one primary with compatibility guidance?
- What are the runtime requirements for persistence, secrets, and backup/restore in a containerized setup?

### ~~Account management routes~~ *(implemented)*
`GET /api/books/:id/accounts` (list, with `?includeArchived=true`), `POST /api/books/:id/accounts` (upsert — create or update), `DELETE /api/books/:id/accounts/:accountId` (archive). `upsertAccount` and `archiveAccount` book commands. `archivedAt?: string` on `Account`. Archive rejected if the account has undeleted transactions.

**Remaining open questions:**
- Should archive prevent new postings only, or also hide the account from UI views?
- How does archiving interact with envelopes and budget lines that reference the account?
- Should `parentAccountId` hierarchy changes be allowed after creation?

### Soft-delete recovery (undelete transaction)
Transactions can be soft-deleted but there is no route to undo that operation. The only recovery path today is a full backup restore. This is disproportionately destructive for a common mistake.

**Next slice:** `POST /api/books/:id/transactions/:transactionId/restore` — clears the `deletion` field and emits a `transaction.restored` audit event. Requires `write` access.

**Key open questions:**
- Should restore be available within a TTL window only, or always?
- How should restore interact with locked close periods?

### Server-side transaction filtering and pagination
The workspace endpoint returns the full document. As transaction volumes grow this becomes a client-side performance problem. There is no way to fetch only the transactions for a given account, date range, or status without downloading and filtering everything locally.

**Next slice:** `GET /api/books/:id/transactions` with `?accountId=`, `?from=`, `?to=`, `?status=cleared|pending|deleted`, `?limit=`, and `?cursor=` query parameters. Returns a paginated transaction list, not the full book.

**Key open questions:**
- Should this be a separate endpoint alongside the book read, or replace it for client use?
- How should the cursor be structured for stable pagination across concurrent writes?
- Which indexes are needed for each filter combination in the SQLite and Postgres backends?

### API versioning strategy
All routes are at `/api/...` with no version segment. As account management, pagination, and other breaking changes land, clients need a stable migration path. The decision — URL versioning (`/api/v1/`), header-based, or something else — needs to be made before the API surface is too large to move.

**Next slice:** Agree on a versioning policy and document it. Likely `/api/v1/` prefix with the current surface, leaving `/api/` as a redirect or alias during a transition window.

**Key open questions:**
- URL versioning vs. `Accept` header versioning vs. custom header?
- Should old versions be supported simultaneously or deprecated on a schedule?

### Transaction attachment and file linking
Receipt scanning and document attachment are mentioned in the product vision but the API has no file storage or linking model. Before any OCR or AI-assist layer can land, there must be an attachment endpoint and a link from transaction to attached files.

**Next slice:** `POST /api/books/:id/attachments` (upload a file, returns an attachment id), `GET /api/books/:id/attachments/:attachmentId` (download). `attachmentIds` field on `Transaction`. Storage backend TBD (local filesystem, object store).

**Key open questions:**
- Where do files live — local filesystem next to the book, or a separate object store?
- What file types and size limits should be enforced?
- How does attachment storage interact with backup/restore?

## Track 7: Visual Design and Aesthetics

Visual quality is a first-class product concern, not a phase deferred until workflows are complete. Users decide whether to adopt an app based on how it feels to use — a beautiful, considered design invites daily use in a way that a functionally correct but utilitarian interface does not. GnuCash has the right accounting model and a decades-long adoption problem; that is the specific failure mode to avoid.

The items in this track are not cosmetic extras. They are the difference between an app that users choose and an app that users tolerate.

---

### Design language system

Define and implement a coherent design language that applies consistently across all surfaces: typography, spacing scale, component shape (radius, shadow, border treatment), and color semantics. Currently the shell has a CSS variable architecture and a functional dark/light theme, but no explicit design language — the visual result is internally consistent but aesthetically unresolved.

**What this covers:**
- Typography: a considered font pairing with a clear hierarchy for headings, body, labels, amounts, and monospace register values. Not system-ui defaults.
- Spacing scale: a defined step scale (e.g. 4px base) applied consistently so sections, rows, and components group and breathe in a principled way.
- Component shape: a single radius and shadow decision applied uniformly to inputs, buttons, cards, chips, and panels.
- Color roles: semantic color applied with restraint — positive/negative amounts, warning, danger, accent — with a neutral base that recedes rather than competes.

**Key open questions:**
- What typeface family? (serif for ledger-book character, monospace-influenced for data density, or a neutral grotesque used with more intention?)
- Does the shape language lean minimal and recessive or does it have a more distinct material quality?
- How tightly should the design language be documented and enforced — CSS custom properties only, or a component library with enforced tokens?

---

### Theme picker architecture

Implement user-selectable named themes accessible from Settings. The CSS variable token architecture already supports this; what is missing is the picker UI, the settings persistence, and the convention for registering named themes. This is the prerequisite for Gruvbox and any future themes.

**Should not be deferred until after all register slices are complete.** A named theme early in the product's life signals visual intent and gives the daily development environment an aesthetic identity worth working inside.

**Key open questions:**
- Where in Settings does the theme picker live — alongside density and amount style, or a dedicated Appearance section?
- Is the picker a dropdown, a swatch grid, or a live preview panel?
- Should the theme name be persisted to `localStorage` alongside density/amount style (consistent with current pattern)?

---

### Gruvbox theme

Implement Gruvbox as the first named theme. Gruvbox uses warm, retro earth tones with strong contrast ratios — a natural fit for the ledger book mental model and a well-known palette with a dedicated following. The implementation is a single `[data-theme="gruvbox"]` CSS selector block.

Gruvbox palette reference (dark variant as primary target):
- bg0_h `#1d2021` → `--bg`
- bg0 `#282828` → `--surface`
- bg1 `#3c3836` → `--surface-alt`
- bg2 `#504945` → `--surface-input`
- fg1 `#ebdbb2` → `--text`
- fg4 `#a89984` → `--text-muted`
- bright_green `#b8bb26` → `--amount-positive`
- bright_red `#fb4934` → `--amount-negative`
- bright_yellow `#fabd2f` → `--accent` / `--accent-warm`
- bright_aqua `#8ec07c` → `--accent` (or bright_green — decide at implementation)
- neutral_orange `#d65d0e` → `--warning`
- neutral_red `#cc241d` → `--danger`

A light Gruvbox variant (`bg0` → `#fbf1c7`, `fg` → `#3c3836`) can follow as a second step.

**Parked until:** theme picker architecture is implemented.

**Key open questions:**
- Ship dark-only first or dark + light together?
- Should Gruvbox be the default out of the box, or opt-in from the picker?
- How do positive/negative amount colors interact with the Gruvbox warm background at both density modes?

---

### Register visual identity

The register is the heart of the product and its primary visual statement. Currently it reads as a functional HTML table. The target is a surface that conveys precision and craft — dense but considered, data-rich but not visually noisy.

**Specific properties to address:**
- Row rhythm: height, padding, and border treatment that makes rows feel intentional rather than default. The running balance and amount columns should be visually distinct from each other and from description text.
- Amount typography: right-aligned, monospace or tabular-figures, with positive/negative color applied with restraint. Numbers should scan instantly.
- Row states: hover, selected, inline-editing, and saving states that are clearly differentiated without being heavy. The editing state should feel like activation, not breakage.
- Inline edit fields: inputs that appear within a row should feel embedded, not dropped-in from a form.
- Balance callout: the out-of-balance warning in split editing should feel informative and considered, not like a validation error dump.

**Key open questions:**
- Should the register lean toward a spreadsheet aesthetic (Airtable/Linear) or a more document-like ledger book aesthetic?
- How do the two density modes (compact/comfortable) manifest specifically in the register — is it purely row height, or also typography scale?

---

### Register column customization — visibility and order

Allow users to choose which columns appear in the register and in what order. The current fixed column set (Date, Status, Description, Payee, Accounts, Amount, Balance, Tags, Actions) is appropriate as a default but not every user needs every column, and some may want to reorder for their workflow.

**Visibility:** users can hide columns they don't use (e.g. Tags, Payee, Balance in filtered mode). Hidden columns persist to localStorage alongside density and theme preferences.

**Order:** users can drag or configure the column sequence. Date and Actions should likely be locked (date always first, actions always last) but the middle columns are fair game.

**Key open questions:**
- Where does the column configurator live — a gear icon in the register toolbar, a right-click on a column header, or in Settings?
- Should column config be per-account-tab or global across all register tabs?
- How does column order interact with the keyboard Tab traversal during inline editing?
- Are any columns non-hideable (Date, Description, Amount seem like candidates)?

---

### Designed empty states

Every primary surface that can be empty needs a deliberate visual treatment. Currently blank states are unstyled or absent. A designed empty state signals craft and guides the user forward.

**Surfaces that need treatment:**
- Empty register (no transactions in period)
- New book with no accounts
- Empty envelope list
- Empty schedule list
- Empty audit log
- Search with no results

Each empty state should have a short explanatory label and a clear primary action, with visual treatment that matches the surrounding surface.

---

### Motion and micro-interactions

Subtle, functional motion applied at key interaction points: row expansion in the register, inline edit activation/save/cancel, panel open/close, error/success state transitions, async loading. The goal is not decorative animation but motion that makes state changes legible and the interface feel responsive.

**Parked until:** the design language and register visual identity are more settled, so motion is designed against a stable visual base rather than applied to placeholder components.

**Key open questions:**
- What is the appropriate duration and easing for register row transitions? (Likely 100–150ms, ease-out — fast enough to not impede power users.)
- Should async save states use a spinner, a progress indicator on the row, or a subtle color pulse?
- How does motion interact with the `prefers-reduced-motion` media query — full disable or reduced intensity?

---

### Iconography

The shell currently uses text labels for most actions. A coherent icon set would reduce visual noise in dense surfaces (register toolbar, status bar, COA sidebar quick actions) and signal product maturity.

**Parked until:** the design language and component shape are settled, so icon style (stroke weight, corner radius) matches the overall language.

**Key open questions:**
- Custom icons vs. a curated open-source set (Lucide, Phosphor, Radix Icons)?
- Which surfaces get icons first — the activity bar, the COA sidebar quick actions, the status bar, or all simultaneously?
- How should icons relate to text labels — icons with labels, icons-only with tooltips, or context-dependent?

---

### Status bar active user indicator

Extend the bottom-left status node (currently API online/offline dot + label) to also show the authenticated user — e.g. `● online · robert`.

The identity is already available on the book response via household member records; no extra round-trip needed.

**Key open questions:**
- Raw actor identifier or resolved household member display name?
- How does it render when the shell is unauthenticated or the API is offline?
- Same left status node alongside API status, or a separate node?
