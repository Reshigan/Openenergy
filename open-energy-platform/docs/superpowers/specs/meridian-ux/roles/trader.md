## Role journey: trader

### 1. Acquisition & First Login

**Invite delivery:** Admin sends invite via email link to `trader@openenergy.co.za`. Trader clicks link, lands on login page. Credentials pre-set: email, password set to `Demo@2024!` (demo personas) or via KYC gate (production). 

**First-load state:** JWT issued with role suffix `trader`. Frontend detects `onboarding_completed=0`, redirects from `/horizon` to `/onboard`.

---

### 2. Onboarding Wizard — Trader-Specific Steps

**Step sequence** (from ONBOARDING_STEPS): `welcome → entity → risk_limits → complete`

#### Step 1: Welcome
- **Copy:** "Welcome to the Open Energy Platform — power trading, risk, settlement and compliance in one workspace."
- **Layout:** Hero illustration (abstract trading chart). One CTA: "Get started".
- **Keyboard:** Enter or Space triggers next step.
- **State:** Loading spinner until cascade confirms step advance; error state shows red toast if `POST /api/onboarding/step` fails (e.g., network).

#### Step 2: Entity Setup
- **Header:** "Create your trading entity"
- **Fields (all required):**
  - **Entity Name** — text input, placeholder "e.g. Arbitrage Holdings (Pty) Ltd", stored in `onboarding_data.entity_name`
  - **Registration Number** — text input, placeholder "CIPC 2021/123456"
  - **Business Address** — textarea, 3 rows
  - **Primary Contact Email** — email input, pre-filled with login email
  - **Trading Book** — dropdown (lookup type), fetches from `/api/ledger/lookup/trading-books` returning `[{id: 'spo_energy', label: 'Spot Energy'}, {id: 'otc_derivatives', label: 'OTC Derivatives'}, ...]`
- **Layout:** 2-column form on desktop (640px+); single column on mobile.
- **Validation:** Email format checked inline. On submit, all required fields highlighted if empty.
- **Accessibility:** Each input has an `<label>` with `for` matching the input `id`. Focus moves through form in tab order.
- **Copy on CTA:** "Next: Risk limits"

#### Step 3: Risk Limits Configuration
- **Header:** "Set your daily position limits"
- **Fields (all required, numeric with unit labels):**
  - **Daily VaR Limit** — number input, unit "ZAR", placeholder "5000000" (R5M default)
  - **Notional Exposure Cap** — number input, unit "MW", placeholder "500"
  - **Counterparty Concentration Limit** — number input, unit "%", placeholder "15" (15% max per counterparty)
  - **Force-liquidation Threshold** — number input, unit "ZAR", placeholder "10000000" (hard stop)
- **Layout:** Inline labels (left-aligned on desktop, stacked on <480px)
- **Validation feedback:** Numbers validated as positive integers. Warn if VaR > Force-liquidation threshold (illogical ordering).
- **Accessibility:** `aria-describedby` links each field to its unit label.
- **Copy on CTA:** "Complete setup"

#### Step 4: Complete
- **Header:** "Onboarding complete"
- **Body:** "Your trading entity is provisioned. Cascade fires `onboarding.completed`, which logs to `oe_onboarding_provisioning_log` with `kind='none'` (traders don't auto-create an entity row — they set up trading books and limits via the ledgers later)."
- **CTA:** "Enter Horizon"

---

### 3. Landing on Horizon — Post-Onboarding

**URL:** `GET /horizon` → `GET /api/horizon/trader` (role suffix)

**Empty-first-run state:** Horizon shows 4 lanes (trader domain keys from roleData → chain registry lanes):
1. **active_trading** (empty if no orders/positions created yet)
   - Lane key: `active_trading` → *no chains lane to this* — this is a standalone surface, not a Meridian chain. Empty state shows: "No open orders yet. Start trading in Atlas."
2. **risk_margin**
   - Chains: `poslimit_case` (W29), `counterparty_margin` (W68)
   - Empty state per chain: "No position-limit breaches." "No counterparty margin issues."
3. **post_trade**
   - Chains: `best_execution` (W36), `trade_allocation` (W76), `trade_report` (W44)
   - Empty state: "No RFQs, allocations or reports pending."
4. **compliance_reporting**
   - Chains: `market_abuse_case` (W52, read-only), `algo_certification` (W60)
   - Empty state: "No market surveillance alerts. All algos certified."

**Duty section** (top 8 cases by attentionScore): All empty on first run. Shows placeholder "Your top priorities will appear here as cases arise."

**KPIs card:** Shows `{total: 0, breached: 0}` for each lane.

**Keyboard nav:** Tab cycles through lanes. Enter on a lane expands it. Arrow keys scroll case list within expanded lane.

**Responsive (<760px):** Lanes stack vertically. Duty section moves below lanes.

**a11y:** Duty section has `role="region" aria-label="Top priorities"`. Each lane is an `<article>`.

---

### 4. Discovering Functions in Atlas — ⌘K / /atlas

**URL:** `/atlas` → fetches features from `traderDomains` (roleData.ts)

**Domains shown:**
- **Active Trading** (icon ◈, orange)
  - Tiles: Open orders, Positions, Trade blotter, Rejections
  - Status: "Open orders" → `route: '/trader/orders'` (non-chain, standalone surface)
  - Status: "Positions" → `route: '/trader/positions'` (similar)
  - Status: "Trade blotter" → `route: '/trader/trades'`
  - Status: "Rejections" → `route: '/trader/rejections'` (why pre-trade guards rejected an order)
  
- **Risk & Margin** (icon ◩)
  - Tiles: Risk dashboard, Margin calls, Position limits, Counterparty margin, Benchmark transition
  - "Risk dashboard" → `route: '/trader/risk'`
  - "Margin calls" → no feature in roleData (W6 dunning is Lender+Regulator write; Trader reads margin events in Risk workstation)
  - "Position limits" → `chainKey: 'poslimit_case'` → `/ledger/poslimit_case` (list view)
  - "Counterparty margin" → `chainKey: 'counterparty_margin'` → `/ledger/counterparty_margin`
  - "Benchmark transition" → `route: '/trader/benchmark-transition'` (non-chain surface)

- **Post-trade & Settlement** (icon ◎)
  - Tiles: Settlement, Trade allocation, Trade reporting, Best-execution / RFQ, Exceptions, Imbalance settlement, Black start, Benchmark transition
  - "Trade allocation" → `chainKey: 'trade_allocation'` → `/ledger/trade_allocation`
  - "Trade reporting" → `chainKey: 'trade_report'` → `/ledger/trade_report` (FMA reporting deadline tracking)
  - "Best-execution / RFQ" → `chainKey: 'best_execution'` → `/ledger/best_execution` (client RFQ to dealer evaluation to execution)
  - Other features are non-chain surfaces (exceptions triage, settlement reconciliation)

- **Compliance & Reporting** (icon ⬓)
  - Tiles: Market surveillance, MM compliance, Algo certification, ESG reports, Article 6 ITMO, Black start chain, Settlement rails, ERP connectors, Filing connectors, Reports, Audit
  - "Market surveillance" → `chainKey: 'market_abuse_case'` → `/ledger/market_abuse_case` (read-only lane for subject trader; write-only for regulator)
  - "MM compliance" → `route: '/surface/oe_mm_obligations'` (W9, no chainKey because not in MERIDIAN_CHAINS; breach_status tracked on oe_mm_obligations but no sla_deadline_at)
  - "Algo certification" → `chainKey: 'algo_certification'` → `/ledger/algo_certification` (pre-deployment governance gate)
  - Connectors: `/surface/trader:strate-swift`, `/surface/trader:sap-oracle-erp`, `/surface/trader:government-filing` (all read-only integration status)

**Current audit finding:** 40 Atlas tiles resolve to empty/broken pages. For trader role, key missing:
- Tile "Open orders" exists in roleData but no route/chainKey → **FIXED:** route to `/surface/trader:orders` (TraderOrders component, standalone workstation)
- Tile "Positions" → **FIXED:** route to `/surface/trader:positions`
- "Trade blotter" → **FIXED:** `/surface/trader:trades`

**Dossier grouping:** Trader has no dossier-grouped chains (no multi-part sub-document pattern like ipp_* sub-documents). All chains are flat.

**Thread-only (unreachable via tile):** Per audit: 7 chains laned to trader but with no active frontdoor:
- `cross_border_trade` (W234 — SAPP interconnector, actually laned to `grid_operator`, not trader; may be audit error)
- `isda_agreement` (master agreement; likely laned to `trader` for read-only cross-reference, not a primary initiation)
- `pnl_attribution` (post-trade analytics, not a state-machine chain; may not be in MERIDIAN_CHAINS)
- `pretrade_credit_check` (pre-trade guard, flows in `pre-trade-guards.ts`, not a chain case)
- `settlement_fail` (settlement exception, likely a lookup or non-chain surface)

**FIXED behavior:** The 7 unreachable chains are surfaced by:
1. Making them discoverable in `/ledger/:chainKey` lists (even if trader can only READ, not WRITE)
2. Adding them to Atlas tiles with `chainKey` pointing to ledger
3. For truly counterparty-only chains (e.g., isda_agreement where trader is the counterparty), adding a Thread-only flag so they show ONLY in the side-panel of a counterparty's Thread view, not in Horizon lanes

---

### 5. Initiating a Primary Owned Transaction — Best-Execution / RFQ (W36)

**Chain key:** `best_execution` (Wave 36 — FSCA Conduct Standard 1/2020)

**Primary CTA:** Atlas tile "Best-execution / RFQ" → `/ledger/best_execution` → button `+ New` in top-right.

**Ledger list view (before +New):**
- **Column headers:** "RFQ #", "Instrument", "Notional (ZAR)", "Status", "Deadline", "Client"
- **Columns source:** `listSelectCols(chain)` → `id, rfq_number, instrument, notional_zar, chain_status, sla_deadline_at, client_party_name` (from ChainDescriptor.refCol, titleCol, quantumCol, statusCol, deadlineCol, counterpartyCol)
- **Empty state:** "No RFQs. Create one to solicit dealer quotes and evaluate best execution."
- **Filters (left sidebar):** rfq_open (received/solicited/quotes_received), evaluating (evaluated/approved), executed (executed/tca_reviewed), resolved (closed/escalated/expired)
- **KPIs:** Total RFQs, Breached (SLA deadline passed), Notional (sum of quantum)
- **Responsive:** On <760px, columns stack as cards; "Status" shows as a badge in top-right corner of each card.

**+New initiation form (modal):**
- **Title:** "Initiate RFQ"
- **Fields from `initiation.fields` in MERIDIAN_CHAINS:**
  - **Instrument** — text input (free-form or lookup?), placeholder "e.g. ZAR Swap 3Y"
  - **Notional (ZAR)** — number input, unit "ZAR", required
  - **Delivery Period** — date picker (start) or text enum (spot/1m/3m), required
  - **Client Party** — lookup dropdown, source `/api/ledger/lookup/clients`, returns `[{id: 'party_abc', label: 'ABC Hedge Fund (Pty) Ltd'}, ...]`
  - **Request Reason** — enum dropdown, options: ['portfolio_rebalance', 'liability_match', 'speculative', 'arbitrage']
  - **RFQ Reference** — text input, placeholder "Optional internal ref"
- **Layout:** Full-width modal on desktop; slides from bottom on mobile. Form fields stack vertically. 2 CTAs at bottom: "Cancel" (ghost), "Create RFQ" (primary, disabled until all required fields filled).
- **Keyboard:** Tab through fields. Shift+Tab backward. Escape closes modal. Enter in last field submits.
- **Accessibility:** Form is `role="dialog" aria-labelledby="initiation-title"` with focus trap. Submit button only enabled after validation passes.
- **Validation (client-side):** Notional > 0, Client selected, Instrument non-empty. On submit blur, show red error text below field.
- **Submit action:** `POST /api/ledger/best-execution/initiate` with payload:
  ```json
  {
    "instrument": "...",
    "notional_zar": 5000000,
    "client_party_id": "party_abc",
    "rfq_ref": "..."
  }
  ```

**Successful initiation:** Backend returns `{success: true, data: {rfq_id: "....", rfq_number: "RFQ-2026-0847"}}`. Modal closes, new row appears in ledger list at status `rfq_received`. Horizon lane refreshes to show the new case.

**Error state:** `{success: false, error: "client not found"}` displays red toast at top. Modal stays open; user corrects input.

---

### 6. State Transitions — RFQ to Execution

**Thread view** for an active RFQ: `/thread/best_execution/RFQ-2026-0847`

**Layout (2-sided):**
- **Left panel (60%):** RFQ detail
  - Header: "RFQ-2026-0847" — Instrument "ZAR Swap 3Y"
  - Status badge: `rfq_received` (pill, grey)
  - SLA deadline: "2026-06-20 16:00 (2h remaining)" (attentionScore coloring: breach=red, h2=orange, today=yellow)
  - Quantum: "R 5.0M notional"
  - Client: "ABC Hedge Fund"
  - Raw fields from DB (Thread shows SELECT * verbatim): quote_deadline_at, quote_collect_window_hours, etc. — **BROKEN:** dumps raw columns without labels. **FIXED:** Use chain.columns schema to render each field with its label + unit.
  
- **Right panel (40%):** Timeline (events) + Actions
  - **Timeline:** Renders rows from `oe_best_execution_events` (FK `rfq_id`). Event types: rfq_received (timestamp), quotes_solicited, quote_recorded, best_ex_evaluated, execution_approved, executed, tca_reviewed, closed.
  - **Empty timeline:** "No events yet" if newly created.
  - **Actions list:** Filters by role. For `trader` role, available actions on `rfq_received`:
    - `solicit-quotes` (primary button, "Solicit quotes from dealer panel")
    - `expire` (oxide, "Expire RFQ")
  
**Action: Solicit quotes**
- **Modal:** "Send RFQ to dealers"
- **Fields:**
  - **Dealer Panel** — lookup dropdown or multi-select, source `/api/ledger/lookup/dealer-panel`, returns list of authorized dealer firms
  - **Solicitation Basis** — evidence field (file upload + comment)
- **CTA:** "Send quotes request"
- **Cascade:** Posts to `/api/best-execution/chain/:id/solicit-quotes`, chain_status advances to `quotes_solicited`. Event fires: `rfq_quoted_solicited`. Right-panel actions update to show `record-quotes`.

**Action: Record quotes**
- **Fields:**
  - **Quotes Received (count)** — number, required
  - **Best Quote Price** — number, required
  - **Quotes Basis** — evidence
- **Cascade:** Status → `quotes_received`. Actions update to show `evaluate`.

**Action: Evaluate best execution**
- **Fields:**
  - **Selected Dealer** — lookup, source `/api/ledger/lookup/dealers`
  - **Evaluation Basis** — evidence
- **Cascade:** Status → `best_ex_evaluated`. Actions → `approve`.

**Action: Approve execution** (Compliance decision)
- **Fields:**
  - **Approval Ref** — text, required
  - **Basis / Evidence** — evidence
- **Cascade:** Status → `execution_approved`. Hard market execution window opens (dealer has 2 hours). Actions → `execute` or `execute-override`.

**Action: Execute order**
- **Fields:**
  - **Fill Price** — number, required
  - **Execution Ref** — text
  - **Basis** — evidence
- **Cascade:** Status → `executed`. Actions → `review-tca`.

**Action: Review TCA**
- **Fields:**
  - **TCA Ref** — evidence
  - **Slippage** — number unit "bps"
  - **Basis** — evidence
- **Cascade:** Status → `tca_reviewed`. Actions → `close`.

**Action: Close case**
- **Fields:** Closure basis (evidence)
- **Cascade:** Status → `closed` (terminal). Thread shows "Case closed" banner. No more actions available.

**Keyboard in Thread:** Tab through actions. Shift+Tab backward. Enter on action opens modal. Escape closes modal.

**Responsive (<760px):** Panels stack vertically. Right panel (actions) moves below detail. Timeline collapses into a drawer.

**a11y:** Thread is a `<main>` region. Detail section: `<section role="region" aria-label="RFQ Details">`. Timeline: `<ol role="list" aria-label="Event timeline">`. Each event: `<li>`. Actions: `<nav role="region" aria-label="Available actions">`.

---

### 7. Cross-Role Interaction via Thread — Dealer's Perspective

**Scenario:** Trader submits RFQ at status `execution_approved`. Dealer (counterparty, a separate trading firm user) should see this RFQ and respond.

**Dealer's Horizon:** The dealer's role is also `trader`. The RFQ case is laned to `trader: 'post_trade'`. So the Dealer sees the same RFQ in their Horizon `post_trade` lane — **BUT ONLY if they are the selected dealer or explicitly added to the counterparty_name**.

**Current broken state:** Thread dumps `.raw` verbatim — dealer sees: `{rfq_id: "...", client_party_name: "ABC Hedge Fund", dealer_panel_spec: "...", client_hedging: 1}` as raw JSON blob. No human-readable labels.

**FIXED state:**
- Thread renders each column with its label from the chain registry.
- Dealer's Thread view shows read-only detail + separate Actions section (only available actions for `trader` role where dealer is the actor).
- If Dealer is NOT the selected dealer, action buttons are disabled (gray) with tooltip "You are not the selected dealer for this RFQ".
- If Dealer IS the selected dealer, actions are `execute` + `close`.

---

### 8. Ongoing Daily Work + AI Inline Assists

**Scenario:** Trader lands on Horizon at 09:30. 

**Horizon duty section:** Shows top 8 cases:
1. Market abuse case (status `under_investigation`, R450m suspect value, breached SLA from yesterday)
2. Position limit breach (warning, soft_breach status, near R15M cap)
3. Best-execution RFQ (quotes_received, R5M, 4h until deadline)
4. Counterparty margin call (issued, R 2.3M margin call outstanding, 1d until due)
5. Trade allocation (pending affirmation, R 50M notional)
6. Trade report (submitted to TR, 2h until FMA T+1 deadline)
7. Algo certification (deployed, last recertification 89d ago — watchlist alert)
8. Settlement fail on prior day's block (2 trades unmatched)

**Each case card shows:**
- Status badge
- Quantum (red if breached)
- Deadline countdown
- Next action (e.g., "Flag break", "Record collateral", "Affirm confirmation")
- **AI assist inline card (Layer D):** "Fix this" button with LLM suggestion

**AI assists (from buildTraderAiSuggestions):**
1. **Position limit case:** "Your ZAR Swap exposure is 15.2MW (cap 15MW). Recommend liquidating 250kW spot trade to bring under limit. [Approve liquidation]"
2. **Best-execution:** "5 quotes in. Best quote from StandardBank @ 3.85% (spread +12bps vs mid). Recommend executing. [Approve & execute]"
3. **Counterparty margin:** "Counterparty posted R1.8M collateral; still R 500k short. Send reminder or restrict positions? [Send reminder] [Restrict]"

Each assist card has:
- Short title + 1-2 sentence rationale
- 1 primary CTA button (pre-fills action modal with suggested values)
- Click flow: User clicks "Approve liquidation" → Position limit Thread opens with liquidation_amount pre-filled → User adds justification → Submits → Case closes
- Tone: Professional, not conversational. No "Hi!" or emojis.

**Risk dashboard (non-chain surface, /trader/risk):**
- **Gauges (4 columns):**
  1. Daily VaR: 2.3M / 5.0M (46% utilization, green gauge)
  2. Notional exposure: 487 MW / 500 MW (97% utilization, yellow gauge — risk warning)
  3. Max counterparty concentration: 12.5% / 15% (green)
  4. Force-liquidation proximity: R 7.2M / R 10M (72%, orange)
- **Scenarios (table):** Stress tests (interest rate +200bps, FX -5%, equity -15%). Shows P&L impact for each.
- **Open orders (mini table):** Side (Buy/Sell), Instrument, Size, Price, Time in market, Status (working/partial/filled). Refresh rate 100ms (real-time websocket in production; polling in demo).

**Margin calls panel:**
- **Active margin calls (list):**
  - Counterparty "AIG Derivatives", Call amount R 2.3M, Posted R 1.8M, Gap R 500k, Due 2026-06-19 14:00 (1d), Actions: [Record collateral] [Restrict positions] [Declare default]
  - (Each row is clickable; opens Thread)

**Trade blotter (non-chain, /trader/trades):**
- **Columns:** Time, Counterparty, Instrument, Side, Size, Price, Notional, P&L (mark-to-market), Status
- **Filtering:** Instrument, Status (filled/partial), Counterparty, Date range
- **Sorting:** Click column header to sort; double-click to reverse
- **Responsive:** Scrolls horizontally on <760px; snaps to Counterparty + Status columns (most critical)

**Rejections surface (/trader/rejections, non-chain):**
- **Why orders were rejected:** Lists pre-trade guard rejections (from `pre-trade-guards.ts`)
- **Rows:** Order ID, Counterparty, Instrument, Reason, Timestamp
- **Reasons:** "Credit limit exceeded", "Daily VaR exceeded", "Counterparty in watchlist", "Force-liquidation threshold breached", "Market halt active", "Instrument halted"
- **Each rejection has an inline AI assist:** "Reason: Credit limit exceeded (counterparty used 87% of limit). Options: [1] Wait for existing trades to settle (next settlement in 2h). [2] Request credit increase from lender. [3] Use different counterparty."

---

### 9. Sign Out

**Hamburger menu (top-right, Meridian chrome):**
- Avatar circle with initials "TP" (Trader Person)
- Click → popover: "Account", "Settings", "Help", "Audit log", "Sign out"
- **Sign out CTA:** Clears localStorage['token'], redirects to `/login`
- On `/login`, greeting: "Signed out successfully" (green toast, 4s auto-dismiss)

---

### 10. Fixing Current Pain Points

**Audit finding 1: Admin laned on only 4 of ~207 chains**
- **FIXED:** Admin gets a master "Platform Operations" workstation where they see ALL non-terminal chains across all roles, organized by wave number or stage-gate status. No lane filtering for admin.

**Audit finding 2: ~39 dangling tiles (chainKey w/ no registry backing)**
- **FIXED:** Audit script runs pre-deploy to validate every roleData Feature.chainKey has a MERIDIAN_CHAINS entry. Dangling tiles are surfaced as build errors.

**Audit finding 3: 1275 free-text type:'string' vs ~74 type:'lookup'**
- **FIXED:** Form builder checks field spec. For trader, critically, form fields with deterministic value sets (Dealer, Client, Instrument) are converted from 'string' to 'lookup' with source path `/api/ledger/lookup/dealers` etc. Free-text only where data is genuinely unbounded (justification, evidence notes).

**Audit finding 4: 32+ raw *_id text inputs**
- **FIXED:** Any field ending in `_id` or `_party` is automatically converted to a lookup dropdown rendering the human label (party_name, not party_id). Lookup source is derived from table + relationship (e.g., party_id → parties.id → parties.legal_name).

**Audit finding 5: Modals aria-modal but no focus trap**
- **FIXED:** Every modal applies:
  - `role="dialog" aria-modal="true" aria-labelledby="dialog-title"`
  - Focus trap on open (first focusable element inside modal gets focus)
  - Escape key closes modal
  - Outside-click closes (unless user is in a dropdown)
  - Inert applied to background

**Audit finding 6: --ink3 secondary text below WCAG AA**
- **FIXED:** All secondary text (#666 or lighter) bumped to 4.5:1 contrast ratio minimum.

**Audit finding 7: Thread dumps raw.* verbatim**
- **FIXED:** Thread renders each column using chain.columns schema:
  ```tsx
  {columns.map(col => (
    <div key={col.key}>
      <label>{col.label}</label>
      <span>{formatValue(row[col.key], col.type, col.unit)}</span>
    </div>
  ))}
  ```

**Audit finding 8: Header quicklinks role-blind**
- **FIXED:** Header nav (Horizon, Atlas, Ledger tabs + role selector) reads user.role and hides/shows tabs:
  - Trader: shows Horizon, Atlas, Ledger, Deal Desk (NOT /surface/:key unless explicitly navigated)
  - No /admin tab for traders
  - No /launch/:role legacy paths (all 404 → /horizon)

**Audit finding 9: Esco+EPC onboarding throws (no step sequence)**
- **FIXED:** ONBOARDING_STEPS now includes:
  ```ts
  esco: ['welcome', 'site_setup', 'device_config', 'data_sources', 'alerts', 'complete'],
  epc_contractor: ['welcome', 'org_profile', 'certifications', 'complete'],
  ```

**Audit finding 10: Provisioning creates entity for only 2 of 10 roles**
- **FIXED:** Cascade rule now handles all 10:
  - `esums_owner` → om_sites row (commissioning_status='planned')
  - `ipp_developer` → ipp_projects row (status='development')
  - `trader` → (none, creates no row; trader creates trading books + counterparties via ledger actions)
  - `lender` → (none, creates no row; lender manages facilities via credit origination chain)
  - `offtaker` → (none, creates no row; offtaker manages PPAs via PPA contract chain)
  - `carbon_fund` → (none; manages projects via registration chain)
  - `grid_operator` → (none; manages network via operations ledgers)
  - `regulator` → (none; reads-only on most chains)
  - `support` → (none; manages tickets)
  - `admin` → (none; manages platform)
  - (Logged to provisioning_log with kind='none' for audit trail)

---

### Worst-Case Flows (Trader + Regulator Interaction)

**Scenario: Market Surveillance Alert fires on trader's algo system**
1. Trader deploys algo via `algo_certification` chain, gets `deployed` status + kill-switch enabled.
2. Regulator (FSCA role) runs market surveillance scan.
3. Alert raised: suspicious layering detected (orders placed 10ms apart, cancelled immediately).
4. Market abuse case created, status `alert_raised`, trader is added to `subject_party_name`.
5. Trader's Horizon + market_abuse_case lane updates: "Market abuse case (read-only) — under investigation".
6. Trader clicks case → Thread view shows read-only detail: typology, suspect_value, alert_timestamp. NO ACTION BUTTONS (trader is subject, not investigator). Comment section shows "Case under investigation by FSCA. Do not delete comms."
7. Regulator's Horizon + enforcement_regulator lane shows same case with actions: [Triage], [Open investigation], [Compile evidence], [File STOR], [Clear].
8. Regulator escalates to File STOR → case advances to `stor_filed`, crosses Regulator inbox (tier-based). Trader receives notification: "Your algo system flagged for STOR filing. Contact compliance officer."
9. Trader requests waiver via out-of-band process (not a chain action). Regulator creates dispute via `raise-dispute` action.
10. Case resolves at `dispute_resolved` terminal. Trader is released.

---

### Summary: Trader Role Frontdoor Classification

| Chain | Wave | Frontdoor | Lane |
|-------|------|-----------|------|
| best_execution | 36 | **tile** (Atlas, initiate +New) | post_trade |
| trade_allocation | 76 | **tile** (Atlas, initiate +New) | post_trade |
| trade_report | 44 | **tile** (Atlas, list-only, no initiate) | post_trade |
| poslimit_case | 29 | **tile** (Atlas, list-only) | risk_margin |
| counterparty_margin | 68 | **tile** (Atlas, list-only) | risk_margin |
| market_abuse_case | 52 | **thread-only** (subject trader read-only, no tiles) | compliance_reporting |
| algo_certification | 60 | **tile** (Atlas, submit for cert) | compliance_reporting |

Non-chain surfaces (no Meridian entry, routed to /surface/:key):
- trader:orders, trader:positions, trader:trades, trader:rejections, trader:risk, trader:margin, trader:exceptions, trader:oe_mm_obligations, trader:reports, trader:audit
- Settlement rails (STRATE/SWIFT), ERP (SAP/Oracle), Filing connectors

Human-centered wins:
- **Pre-trade guards reject with inline AI explainer:** "Your daily VaR budget is exhausted. Three options: [1] Wait 6 hours for settlement. [2] Request temp increase from risk committee (4h approval SLA). [3] Use lower-volatility instrument." Each option is a clickable path that auto-navigates.
- **Margin call cascade:** Trader gets notification → Thread auto-opens → AI card suggests: "Counterparty owes R500k. Send demand in 30min or restrict positions. [Send demand now] [Set 30min timer]." One click executes the action with pre-filled justification.
- **Best-ex TCA review:** Trader completes execution → AI card shows: "Slippage 14bps vs mid. Better than median (18bps). TCA review clean. [Close case]." Saves 2 modal fills.
- **Responsive breakpoints:** Mobile trader never scrolls horizontally in Horizon (lanes stack, cases compress to 2-column card layout). Trade blotter on phone shows only Side + Instrument + Price + P&L (essentials); full detail in side drawer.

Human-centered pain point fixes:
- **Before:** Trader had to manually parse Thread raw-field JSON to understand a counterparty margin call. 3-minute decode lag.
- **After:** Thread renders "Counterparty: AIG Derivatives | Exposure: R 2.3M | Collateral Posted: R 1.8M | Gap: R 500k | Due: 2026-06-19 14:00". Read in 5 seconds.
- **Before:** No connection between RFQ rejection and next action. Trader manually checks if dealer was added, credit was extended, market was halted. 15-minute detective work.
- **After:** Rejection inline card shows reason + root cause + 3 auto-suggested paths with SLAs. Trader picks one; cascade wires next step.

---

**End of trader role journey.**
