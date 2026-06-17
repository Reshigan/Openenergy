## Role journey: admin

### Role Overview
Admin is the platform superuser. The approved design surfaces admin as a governing console with four primary surface areas: **(1) Tenants & Users** — multi-tenant lifecycle, KYC queue, access provisioning; **(2) Trading Ops** — settlement runs, market halts, order-book governance; **(3) Compliance & Audit** — tamper-evident audit-chain publication, regulator export packages, control-environment attestation; **(4) Intelligence** — executive dashboard, AI decision trails, anomaly/RUL/fault-fingerprint ML fleet monitoring.

Admin is the ONLY role that can assume any other role's persona (board-role switching) for cross-role troubleshooting and delegation. Admin lanes are computed by Horizon against exactly 4 chains in MERIDIAN_CHAINS today (audit_chain_block, kyc_verification, control_environment_audit, levy_assessment); the remaining ~203 chains that admin should supervise (market-halt orders, platform settlement, per-role portfolio anomalies, NERSA regulatory inbox escalations) are **invisible on Horizon today** — a critical gap this journey fixes.

---

### (1) Acquisition & First Login

**Invite Flow (unauthenticated → authenticated)**

1. **Email invite** → admin@platform receives: `"You have been invited as Platform Admin. Visit https://oe.vantax.co.za/auth/register?token=<opaque>"`

2. **Registration form** (GET `/auth/register?token=...`)
   - Email (pre-filled, read-only): admin@openenergy.co.za
   - Full name: _input_
   - Password: _input (regex: ≥12 chars, ≥1 upper, ≥1 digit, ≥1 special)_
   - Confirm password: _input_
   - Accept T&C: _checkbox_
   - [Register] button
   - POST `/api/auth/register` → issues HS256 JWT (1h TTL) with role=admin, stores in localStorage['token']

3. **Browser persistence**
   - Token stored in localStorage; page checks on mount via GET `/api/onboarding/state` (checks onboarding_completed flag)
   - If first-time: navigates to `/onboard` (OnboardingWizard)
   - If returning: navigates to `/horizon`

---

### (2) Onboarding Wizard (First-Time Flow)

**Sequence:** ONBOARDING_STEPS['admin'] = ['welcome', 'complete']

#### Step 1: Welcome Screen (`/onboard?step=welcome`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│                  Welcome to Open Energy Platform              │
│                     Platform Admin Console                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Your role: Platform Admin                                  │
│  Tenant: [auto-detected from JWT]                           │
│  Email: admin@openenergy.co.za                              │
│                                                              │
│  Quick Orientation                                          │
│  ───────────────────────────────────────────────────────────  │
│  • Horizon: live case lanes per supervision area             │
│  • Atlas: function discovery via ⌘K                          │
│  • KYC Queue: new-entity verifications (W198)                │
│  • Audit Chain: tamper-evident log publication (W118)        │
│  • Regulator Exports: certified compliance packs (W119)      │
│  • Revenue Dashboard: platform fees earned                   │
│  • Feature Flags: per-tenant overrides                       │
│  • Board Role Switch: assume other roles for testing         │
│                                                              │
│  [Next → Complete Onboarding]                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Interaction:**
- Read-only status cards (name, tenant, email, role)
- Links to inline help (shift+? brings up contextual docs per feature)
- [Next] → POST `/api/onboarding/step` with `{step: 'welcome', data: {orientation_viewed: true}}` → advances to 'complete'

#### Step 2: Completion (`/onboard?step=complete`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│            You're All Set, Admin!                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✓ Onboarding complete                                      │
│  ✓ Your sandbox tenant provisioned (isolated demo)          │
│  ✓ One test entity created per role (10 personas)           │
│  ✓ KYC queue subscribed (notifications on new requests)     │
│                                                              │
│  Test Entities Created                                      │
│  ───────────────────────────────────────────────────────────  │
│  • ipp_developer: Test Renewables Inc (project + PPA ready)  │
│  • trader: Demo Trading Desk (pre-populated orders)          │
│  • lender: Sandbox Finance Ltd (covenant certs seeded)       │
│  • offtaker: Test Buyer Corp (monthly consumption)           │
│  • carbon_fund: Demo Carbon Registry (retired credits)       │
│  • grid_operator: Test SO (dispatch notifications)           │
│  • support: Test OEM (warranty claims queued)                │
│  • regulator: Demo Regulator (inbox materialized)            │
│  • esco: Test O&M Operator (fleet with 3 sites)             │
│  • epc_contractor: Demo EPC (construction diary)             │
│                                                              │
│  [Go to Horizon] → Start supervising live cases              │
│  [View Feature Flags] → Configure per-tenant behavior        │
│  [Open KYC Queue] → Review pending verifications             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Provisioning triggered on completion:**
- POST `/api/onboarding/complete` fires cascade event `onboarding.completed`
- Cascade creates:
  - **Isolated demo tenant** (sandbox_<timestamp>) with status='sandbox'
  - **10 test participant accounts** — one per role — with dummy data (email: {role}+admin-test@sandbox.local)
  - **Seeded entities per role:** e.g. a loan_default case for testing lender enforcement, a covenant_certificate for monitoring, an audit_chain_block waiting for admin's merkle-build action
  - **Notifications subscriptions:** admin auto-subscribed to KYC queue alerts, settlement run errors, audit-chain fork detection
- Page navigates to `/horizon` after 2s

---

### (3) Horizon Landing — Admin's Duty Board

**GET `/api/horizon/admin`** → returns lanes + duty top-8 by attentionScore (law: log₁₀(ZAR quantum) × 1/hrs-remaining, with BREACH_FLOOR = 1M ZAR for any overdue case)

#### Current Broken State (Audit Finding)
- Admin laned on only 4 chains: `audit_chain_block`, `kyc_verification`, `control_environment_audit`, `levy_assessment`
- ~203 chains with admin actions (market-halt, settlement-run triggers, per-role portfolio anomalies) are **not laned** → admin cannot see them on Horizon even though they have full action access in the backend
- Result: admin must navigate via Atlas tiles or direct /ledger/:chainKey URLs to supervise most work

#### Fixed Horizon Layout

**Wireframe:**
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Open Energy Platform — Admin Console                                          │
├───────────────────────────────────────────────────────────────────────────────┤
│ [user-menu] [board-role: Admin ▼]  ⌘K  [notifications 3]  [help]            │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│ Duty Board (Top 8 by attention score)                                        │
│ ─────────────────────────────────────────────────────────────────────────── │
│ ┌─ BREACHED (1) ────────────────────────────────────────────────────────┐   │
│ │ • audit_chain_block #1203 — Integrity verified [2h overdue SLA]       │   │
│ │   Quantum: — | Deadline: 2026-06-17T08:00Z (16h overdue)              │   │
│ │   Actions: [Open for independent verify] [Fork] [Emergency seal]      │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│ ┌─ Next 2h (2) ─────────────────────────────────────────────────────────┐   │
│ │ • kyc_verification #KYC-456 — Documents submitted                      │   │
│ │   Participant: Acme Energy Trading | Deadline: 2026-06-17T11:30Z      │   │
│ │   Actions: [Complete EDD] [Approve conditionally] [Suspend]           │   │
│ │                                                                        │   │
│ │ • settlement_admin run #SR-2026-06-17 — Awaiting trigger               │   │
│ │   Quantum: R2.3B | Deadline: 2026-06-17T16:00Z (auto-run 10:00 UTC)   │   │
│ │   Actions: [Dry-run settlement] [Approve run] [Investigate breaks]    │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│ Lanes (supervisory areas) — organized by domain                              │
│ ─────────────────────────────────────────────────────────────────────────── │
│ ┌─ Tenants & Users (6 pending) ───────────────────────────────────────┐   │
│ │ ├─ kyc_verification (3 in-review)                                   │   │
│ │ │  • #KYC-456: Acme Energy Trading — submitted                      │   │
│ │ │  • #KYC-457: Solar Africa Inc — pending docs                      │   │
│ │ │  • #KYC-458: MainStream Energy — edd triggered (EDD in progress)  │   │
│ │ │  [+ 0 more]  [View all]                                            │   │
│ │ │                                                                    │   │
│ │ ├─ Tenant provisioning requests (3 pending)                         │   │
│ │ │  • ABC Energy (South Africa) — enterprise tier                    │   │
│ │ │  • XYZ Renewables (Botswana) — professional tier                  │   │
│ │ │  • Local Trader Co (South Africa) — starter tier                  │   │
│ │ │  [+ 0 more]  [View all]                                            │   │
│ │                                                                     │   │
│ └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│ ┌─ Trading Ops (2 active) ──────────────────────────────────────────────┐   │
│ │ ├─ Market halt (1 active) [managed via /api/admin-platform/market-halt] │
│ │ │  • Energy market (NERSA-authorized) — halted 06-17 09:22 UTC        │   │
│ │ │    Reason: Critical price-feed audit (circuit-breaker baseline drift) │
│ │ │    [Inspect details] [Lift halt (admin action)]                      │   │
│ │ │                                                                      │   │
│ │ ├─ Settlement runs (0 active, 1 scheduled)                              │
│ │ │  • Daily settlement run #SR-2026-06-17 — scheduled 16:00 UTC         │   │
│ │ │    Expected settlement: R2.3B, 847 trade breaks (vs 234 yesterday)    │   │
│ │ │    [Dry-run now] [Approve] [Defer 24h]                               │   │
│ │ │                                                                      │   │
│ │ ├─ Order-book health                                                    │   │
│ │ │  • Active orders: 3,247 | Pending: 421 | In-flight: 89              │   │
│ │ │  • Mid-price drift (2h): +0.3% | Volatility: 1.2% (historical avg)  │   │
│ │ │  [View book depth] [Circuit-breaker config]                         │   │
│ │                                                                     │   │
│ └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│ ┌─ Compliance & Audit (1 active) ────────────────────────────────────────┐  │
│ │ ├─ audit_chain_block (1 SLA breached)                                  │  │
│ │ │  • #1203 — Integrity verified → Published [2h overdue]              │  │
│ │ │    Last segment: 2026-06-17 06:00Z | Hash: 0x7a3f2e…                │  │
│ │ │    Status: segments_collected → merkle_built → integrity_verified   │  │
│ │ │    Next: [Open for independent verify] (needs 2-of-3 verifiers)     │  │
│ │ │                                                                     │  │
│ │ ├─ control_environment_audit (1 scheduled)                             │  │
│ │ │  • Annual control audit — period 2026-01-01 to 2026-12-31           │  │
│ │ │    Status: draft | Deadline: 2026-09-30                              │  │
│ │ │                                                                     │  │
│ │ ├─ regulator_export_pack (0 pending)                                   │  │
│ │ │  • Last exported: 2026-06-16 22:15Z (daily run)                     │  │
│ │ │  • [Generate export] [View archive]                                 │  │
│ │ │                                                                     │  │
│ │ └─ levy_assessment (0 active)                                          │  │
│ │    • NERSA levies assessed quarterly; next assessment: 2026-09-30     │  │
│ │                                                                     │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│ ┌─ Intelligence ────────────────────────────────────────────────────────┐   │
│ │ ├─ Executive dashboard (live KPIs)                                   │   │
│ │ │  • Platform uptime: 99.97% (30d) | Active tenants: 42               │   │
│ │ │  • Monthly revenue: R1.2M | Settlement volume: R124.5B (ytd)         │   │
│ │ │  • KYC queue depth: 6 | Avg processing: 4.2h                        │   │
│ │ │                                                                    │   │
│ │ ├─ AI decision audit (all escalations logged)                         │   │
│ │ │  • Last 7 days: 347 decisions logged (cascade events)               │   │
│ │ │  • Most-triggered: covenant breach detection (84 cases)             │   │
│ │ │  • [Browse audit trail]                                             │   │
│ │ │                                                                    │   │
│ │ └─ Anomaly/RUL/fault fleet monitoring                                 │   │
│ │    • ESUMS (Esums Owner) fleet health (3 sites, 12 inverters)         │   │
│ │      Anomaly alerts: 2 | RUL warnings: 0 | Fault risks: 1             │   │
│ │      [View asset prognostics]                                         │   │
│ │                                                                    │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Keyboard & Navigation:**
- ⌘K opens Atlas CommandPalette for function search (includes all admin tiles + cross-role surfaces)
- Tab through lanes; Enter to expand lane or drill into a case
- Lane title is a link to full `/ledger/:chainKey` view (e.g., clicking "Tenants & Users (6 pending)" → `/ledger/kyc_verification?role=admin`)
- "View all" link in each lane collapses back to list, scrolls to top, and shows full 60-case window
- Hover over "Actions" buttons shows cascadeHint in a tooltip (e.g., "Clears KYC/AML screening; obligor consent solicitation opens")

**Empty State (first visit after onboarding, before test data populates):**
```
┌─────────────────────────────────────────────────────────────┐
│ Horizon — No active cases yet                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Your sandbox tenant has no live cases.                       │
│ • Create a test entity using the roleData personas           │
│ • Initiate a case from your test entity's Ledger             │
│ • Return here to see it lane on your Horizon                 │
│                                                              │
│ Or explore Production via Board Role Switch:                 │
│ [Switch to Lender ▼] → see the actual lending portfolio      │
│ [Switch to Trader ▼] → live order book + settlement runs     │
│                                                              │
│ [Go to Atlas to create your first case]                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Board Role Switch (header control, persistent across session)**

- Dropdown: "[Board Role: Admin ▼]"
- Options: Admin, Trader, IPP Developer, Lender, Offtaker, Carbon Fund, Grid Operator, Regulator, Support, ESCO
- On change: POST `/api/board-role-switch` with `{role: 'trader'}` → JWT re-issued with `board_role: 'trader'` (orig `role: 'admin'` preserved in token) → Atlas/Horizon/surfaces re-render for trader persona
- Admin still sees all audit logs as 'admin'; cascade events log original role, board role is metadata for UX only
- Persists to localStorage['board_role'] so returning sessions resume the same persona

---

### (4) Atlas Discovery — All Admin Functions (⌘K)

**CommandPalette (`pages/src/meridian/CommandPalette.tsx`)**

Filter by role (current: Admin); search results include:

#### Tiles (Domain-grouped features)

**Tenants & Users**
- "Users" (route: `/surface/admin:users`) — full user account table with role/status filters; search by email/name
- "Feature Flags" (route: `/surface/admin:feature-flags`) — global + per-tenant toggle overrides (FlagDef schema)
- "KYC Queue" (chainKey: `kyc_verification`, tile) → `/ledger/kyc_verification?role=admin`
- "POPIA Rights" (route: `/surface/admin:popia`) — data-subject access/erasure requests log
- "PII Access Log" (route: `/surface/admin:pii-access-log`) — POPIA s.18/19 cross-tenant PII reads

**Trading Ops**
- "Order Book Health" (route: `/surface/admin:order-book`) — live depth, mid-price, volatility; circuit-breaker settings
- "Market Halt Controls" (route: `/surface/admin:market-halt`) — NERSA-authorized halt trigger/lift UI
- "Settlement Admin" (route: `/surface/admin:settlement`) — settlement-run dry-run, approval, break investigation
- "Settlement Audit" (route: `/surface/admin:settlement-audit`) — settlement reconciliation + break-review board

**Compliance & Audit**
- "Audit Chain" (chainKey: `audit_chain_block`, tile) → `/ledger/audit_chain_block?role=admin` — propose/build/merkle/verify/publish/archive
- "Regulator Exports" (chainKey: `regulator_export_pack`, tile) → `/ledger/regulator_export_pack?role=admin` — certified packs for NERSA/FSCA
- "Control Environment" (chainKey: `control_environment_audit`, tile) → `/ledger/control_environment_audit?role=admin` — annual control audit
- "Reconciliation Attestation" (route: `/surface/admin:reconciliation-attestation`) — CA(SA)-signed packs (W120)
- "ESG Admin" (route: `/surface/admin:esg-admin`) — platform-wide ESG aggregate reports

**Platform**
- "Billing Runs" (route: `/admin/billing`) — monthly subscription invoice generation
- "Revenue Dashboard" (route: `/admin/revenue`) — platform fee revenue by tenant (W-commercial intercept)
- "Monitoring" (route: `/surface/admin:monitoring`) — DLQ, cascade errors, system health snapshots
- "Cron Jobs" (route: `/surface/admin:cron`) — manual trigger or dry-run for all 7 scheduled tasks (surveillance scan, VWAP marks, metering rollup, PPA settlement, margin-call cycle, watershed anomaly, monthly invoicing)

**Intelligence**
- "Executive Dashboard" (route: `/dashboard`) — CEO/COO KPI board (uptime, revenue, settlement volume, KYC queue depth)
- "AI Intelligence" (route: `/intelligence`) — platform AI decision audit trail (cascade events, alerts logged, reasons)
- "Briefing" (route: `/briefing`) — daily AI briefings per role (generated via cascade)
- "Anomaly Detection" (route: `/surface/admin:anomaly-detection`) — platform ML anomaly monitoring (W127)
- "RUL Prediction" (route: `/surface/admin:rul-prediction`) — remaining-useful-life ML monitoring (W128)
- "Fault Fingerprint" (route: `/surface/admin:fault-fingerprint`) — physics-based fault ML diagnostics (W129)

**Integrations**
- "Settlement Rails" (route: `/surface/admin:settlement-rails`) — STRATE/SWIFT connector health (W124)
- "ERP Connectors" (route: `/surface/admin:erp-connectors`) — SAP/Oracle integration status (W125)
- "Filing Connectors" (route: `/surface/admin:filing-connectors`) — NERSA/SARS government filing status (W126)
- "Marketplace" (route: `/marketplace`) — connector and service marketplace catalog

#### Chains (laned on admin, sorted by wave)

- `levy_assessment` (W74) — NERSA levy assessment & collection
- `kyc_verification` (W198) — KYC verification queue
- `control_environment_audit` (W121) — annual internal control audit
- `audit_chain_block` (W118) — tamper-evident Merkle audit chain
- `regulator_export_pack` (W119) — certified regulatory export packs

**Hidden Chains (thread-only, reachable ONLY via cross-role Thread):**
- All 67 signature chains that cross the regulator inbox (every W with crosses regulator) are visible in Thread but not on admin's Ledger tiles (regulator owns those as primary)
- Example: if admin assumes `board_role: trader` via board-role switch, they see `market_abuse_case` (W52) tile appear in their personal Horizon

---

### (5) Primary Owned Transaction: Audit Chain Block Lifecycle

**Initiation: `/ledger/audit_chain_block` → [+New] button**

**Form (schema-driven, all fields from ChainInitiation.fields):**
```
┌─────────────────────────────────────────────────────────────┐
│ Propose Audit Chain Block                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Block Cadence (required, dropdown) *                        │
│ ○ Hourly                                                     │
│ ○ Daily                                                      │
│ ○ Weekly                                                     │
│ ○ Monthly                                                    │
│ ○ Quarterly                                                  │
│                                                              │
│ Note (optional): _[e.g. "Monthly P&L settlement closeout"]_  │
│                                                              │
│ [Create Block] [Cancel]                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**State Transitions:**

1. **block_proposed** → admin created the case; next action is collect-segments
   - **Button: [Collect segments]** (admin only) — Gather audit-log segments to seal into this block
   - POST `/api/audit-chain/:id/collect-segments` → rolls D1 cursor through audit_logs table since last block's segment cut, batches segments into chunks
   - State → **segments_collected**

2. **segments_collected** → segments batched; next action is merkle-build
   - **Button: [Build Merkle tree]** (admin only) — Builds the Merkle tree over collected segments
   - POST `/api/audit-chain/:id/build-merkle` → computes SHA-256 tree, stores leaf nodes
   - State → **merkle_built**

3. **merkle_built** → tree built; next action is verify-integrity
   - **Button: [Verify integrity]** (admin only) — Verifies hash-chain integrity of the block
   - POST `/api/audit-chain/:id/verify-integrity` → re-hashes all leaves against stored tree, checks root
   - State → **integrity_verified**

4. **integrity_verified** → block ready for signing; **Critical: fork() branch available here**
   - **Button: [Sign block]** (admin only) — Applies the platform signature to the block
   - POST `/api/audit-chain/:id/sign-block` → signs root hash with platform key, embeds signature into block record
   - State → **block_signed**
   - **OR Emergency: [Fork block]** (tone: oxide) — Non-emergency divergence for investigation
     - Requires: fork_reason (evidence), notes (evidence)
     - Cascade: fires fork event + crosses regulator inbox at every tier (signature control integrity)
     - State → **forked** (terminal, archive-only)
   - **OR Critical: [Emergency seal]** (tone: oxide) — Hash-chain break detected, halt immediately
     - Requires: signature_chain_break_detected (boolean), hash_collision_suspected (boolean), fork_reason (evidence), notes (evidence)
     - Cascade: fires emergency-seal + crosses regulator inbox EVERY tier immediately (Law 3: "SIGNATURE hard line: crosses regulator inbox EVERY tier immediately")
     - State → **sealed** (terminal, audit-sealed, no further transitions)

5. **block_signed** → signed, ready for anchoring
   - **Button: [Anchor block]** (admin only) — Anchors the signed block to the external timestamp authority
   - POST `/api/audit-chain/:id/anchor-block` → calls external timestamp service (e.g., RFC 3161 TSA)
   - State → **anchored**

6. **anchored** → timestamped, ready for publication
   - **Button: [Publish block]** (tone: primary) — Publishes the anchored block for independent verification
   - POST `/api/audit-chain/:id/publish-block` → sets published_at, block now open for independent verifier quorum (2-of-3)
   - Cascade: fires publish event → opens distribution to independent verifiers (Byzantine quorum pattern)
   - State → **published**

7. **published** → open for verification
   - **Button: [Open for independent verify]** (tone: primary) — Opens block for independent verification
   - Path: `/api/audit-chain/:id/open-independent-verify`
   - Requires: independent_verifier_count (number), notes (evidence)
   - Cascade: registers verifiers, starts quorum timeout (typically 7 days)
   - State → **independently_verifiable** (waiting for 2-of-3 verifier signatures)

8. **independently_verifiable** → awaiting quorum (read-only until verifiers respond or timeout)
   - Displays: verification progress (1 of 3 verifiers signed), verifier names, deadline
   - **Button: [Reconcile]** (if quorum met) — Reconciles the block against the live audit ledger
   - POST `/api/audit-chain/:id/reconcile` → checks published block against live ledger for divergence
   - State → **reconciled**

9. **reconciled** → verified and reconciled, ready to archive
   - **Button: [Archive]** (tone: primary) — Archives the block (terminal)
   - POST `/api/audit-chain/:id/archive` → moves to immutable archive, block immutable forever
   - Cascade: fires archive event (log preservation confirmation)
   - State → **archived** (terminal, immutable read-only)

**Alternative Paths (rejections, restates, suspends):**
- **[Restate]** (tone: oxide) — only from **reconciled** state → if a published block has a discovered defect, restate it (requires reason)
  - POST `/api/audit-chain/:id/restate` with reason (evidence)
  - State → **restated** (terminal, marked defective)
  - Cascade: fires restate + crosses regulator inbox
- **[Reject]** (tone: oxide) — from **block_proposed** or **segments_collected** → reject the proposed block (requires reason)
  - POST `/api/audit-chain/:id/reject` with reason (evidence)
  - State → **rejected** (terminal, discarded)
- **[Suspend]** (tone: oxide) — from any non-terminal state → suspend the block (requires reason)
  - POST `/api/audit-chain/:id/suspend` with suspend_reason (evidence)
  - State → **suspended** (pauses; admin can [Resume] to integrity_verified)
  - **[Resume]** — from **suspended** → re-open for verification
    - POST `/api/audit-chain/:id/resume` → state → **integrity_verified**

**Thread Details (read-only cross-admin collaboration):**
- Thread side-panel surfaces:
  - **Status timeline:** block_proposed → segments_collected → merkle_built → integrity_verified → [±fork/emergency seal] → block_signed → anchored → published → independently_verifiable → reconciled → archived
  - **Block summary:** cadence, segment count, merkle root hash (first 16 chars shown, full on hover)
  - **Event log (if eventsTable = oe_audit_chain_block_events):** all transition events + cascade triggers
  - **Verifier quorum display:** names, signatures, deadline, "X of 3 verified"
  - **Raw block data:** can view full JSON audit ledger contents (big)

---

### (6) Cross-Role Interaction via Thread

**Scenario: Admin exercises "fork" action on audit_chain_block #1203, which escalates to regulator.**

**Admin's Thread perspective (`/thread/audit_chain_block/1203`):**

Left panel:
```
Audit Chain Block #1203
Status: integrity_verified
Created: 2026-06-17 06:00Z | Admin: admin@openenergy.co.za

[Fork] [Emergency seal] [Sign block]
```

Right panel (two-sided transaction):
```
─────────────────────────────────────────
Admin                    |  Regulator
─────────────────────────────────────────
                         |
Fork block               |  [Regulatory
(integrity broke)        |   inbox alert]
─────────────────────────────────────────
                         |
                         |  View: read-only
                         |  mirror of fork
                         |  reason + notes
```

Admin clicks [Fork]:
- Modal appears: "Fork reason (evidence): _________" , "Notes: _________"
- Admin enters: "Hash collision suspected in segment 234; pending external verification"
- POST `/api/audit-chain/1203/fork` with reason + notes
- Response: {success, data: {chain_status: 'forked', event_id: evt_...}}
- Cascade fires: `fireCascade({event: 'audit_chain.forked', actor_id: admin_id, entity_type: 'audit_chain_block', entity_id: '1203', data: {reason, notes}, env: c.env})`
  - Cascade pushes to regulator's RoleAction queue: `{chain: 'audit_chain_block', action: 'fork_detected', ref: '#1203', title: 'Audit fork', actor: 'admin', reason: '...', status: 'pending_review'}`
  - Regulator sees an IncomingPanel notification: "Audit-chain fork detected: Block #1203 (admin initiated)"

**Regulator's Horizon (read-only mirror):**
```
┌─ Regulatory Inbox (3 active) ────────────────────┐
│ ├─ audit_chain_block fork detected               │
│ │  • #1203 (admin forked) — reason: "Hash coll..." │
│ │  • Admin notes: "...pending external verif..."  │
│ │  [Read full details] [Acknowledge]              │
```

Regulator clicks [Read full details] → `/thread/audit_chain_block/1203?perspective=regulator`:

Right panel (regulator side):
```
Audit Chain Block #1203 [Forked]
Created: 2026-06-17 06:00Z
Forked by: admin@openenergy.co.za (2026-06-17 09:45Z)
Fork reason: Hash collision suspected in segment 234; pending external verification

[Acknowledge] [Escalate to NERSA]

Timeline:
├─ 06:00Z — block_proposed
├─ 06:15Z — segments_collected
├─ 06:30Z — merkle_built
├─ 06:45Z — integrity_verified
├─ 09:45Z — forked (admin initiated)
```

Regulator can:
- Click [Acknowledge] → sets their status to 'reviewed', removes from inbox
- Click [Escalate to NERSA] → fires cascade that creates a formal regulatory notice (crosses into external regulator system via filing_connectors W126)

Admin's Thread **does NOT change** — they remain on forked state. Regulator's view is **read-only mirroring** of the admin's chain record.

---

### (7) Daily Work + AI Inline Assists

**AI Presence (non-intrusive):**

Admin receives two types of AI-driven suggestions:

1. **Horizon-level briefing card** (appears on first morning visit to `/horizon`):
   ```
   ┌─────────────────────────────────────────────────────────┐
   │ AI Briefing — Admin Duty Summary                         │
   │                                                          │
   │ "Good morning. You have 6 new KYC submissions since      │
   │  yesterday 17:00. 2 triggered EDD (enhanced due          │
   │  diligence). Audit block #1203 integrity verified 1h     │
   │  ago but is 2h overdue on SLA (publish urgency: 8/10).   │
   │  Settlement run at 16:00 today expects 847 breaks (vs    │
   │  234 yesterday — up 3.6x). Recommend dry-running early." │
   │                                                          │
   │ [Dismiss] [View full briefing]                           │
   └─────────────────────────────────────────────────────────┘
   ```
   - Powered by cascade events from last 24h (onboarding.completed, kyc_verification.* events, audit_chain_block.integrity_verified, settlement_run.* events)
   - Admin can dismiss once per day; reappears next day

2. **Thread-level action explanations** (hover on action button):
   ```
   Button: [Emergency seal] (tone: oxide)
   
   Tooltip on hover:
   "SIGNATURE hard line: hash-chain break detected — seals 
    block and crosses regulator inbox EVERY tier immediately.
    
    Cascade effect:
    • Block marked sealed (no further transitions)
    • Audit integrity alert fired to regulator
    • Alert priority: P0 (highest)
    • SLA: Regulator must acknowledge within 4 hours"
   ```

3. **Smart settlement-run pre-flight** (admin views `/surface/admin:settlement` before dry-run):
   ```
   Settlement Run #SR-2026-06-17 — 16:00 UTC
   
   AI Pre-flight Check:
   ✓ All trade-blotter positions reconciled (3,247 trades)
   ✓ Imbalance settlement ready (R2.3B quantum)
   ✓ Reserve activation pool settled (12 capacity contracts)
   ⚠ Warning: Break count up 3.6x vs yesterday
     • 847 breaks expected (vs 234 yesterday)
     • Top break reason: Price precision mismatch (234)
     • Top break reason: Volume rounding (198)
     • Recommendation: Inspect circuit-breaker config for 
       mid-price drift tolerance before dry-run
   
   [View circuit-breaker settings] [Dry-run anyway] [Inspect breaks]
   ```

---

### (8) Sign Out

**Header menu → [Sign Out]**

- POST `/api/auth/logout` with current JWT
- Revokes token (adds to blacklist in KV cache, TTL = 1h)
- Clears localStorage['token']
- Clears board_role from localStorage
- Redirects to `/auth/login`
- Session history cleared (no PII retained in browser)

---

### Fixed Pain Points (Audit Corrections)

| Audit Finding | Current State | Fix Applied Here |
|---|---|---|
| Admin laned on only 4 chains (~203 chains invisible) | Horizon shows 4 lanes (audit, kyc, control, levy) | Duty board now surfaces ALL admin-actionable chains (market-halt, settlement, per-role portfolio anomalies) via cross-domain lane grouping |
| Per-role laned-but-unreachable chains (ipp 61, regulator 13, support 10, trader 7, lender 7, grid 5) | These chains appear in Thread but NOT in Horizon | Fixed by ensuring every role's lane mapping includes all chains where that role has actions; Horizon filters by role membership in chain.lanes |
| 40 dangling Atlas tiles (chainKey w/ no registry backing) | Clicking tile → 404 | All tiles validated against MERIDIAN_CHAINS; missing tiles → removed from roleData features or chainKey updated |
| ~39 chainKey w/ empty bodies | Ledger shows "no cases" even when cases exist | Verified listSelectCols() includes all necessary columns (refCol, titleCol, quantumCol, statusCol, deadlineCol); lazy-load pagination added for large tables |
| 1275 form fields type:'string' vs ~74 type:'lookup' | Free-text fields everywhere, no dropdowns | Admin's kyc_verification actions now use type:'lookup' for screening_basis (whitelisted values from GET /api/ledger/lookup/kyc_screening_basis); dropdown vs text determined by ActionFieldSpec.type |
| 32+ raw *_id text inputs | Participant names showed as UUIDs | Thread now surfaces counterpartyCol (participant name) as display; *_id stored but not shown in UX |
| Modals without focus-trap/inert/restore | Accessibility floor: zero | Modal component adds aria-modal=true, applies inert to rest of page, auto-restores focus to [trigger] on close |
| Thread dumps raw.* verbatim | Layout messy, raw JSON unreadable | Thread normalizes display: status displays as badge (tone-colored), deadline displays as human-readable "2h overdue", quantum displays with ZAR formatting |
| Header quicklinks role-blind | All roles see identical quicklinks | Admin's header now shows board-role-aware quicklinks: [Your KYC Queue], [Settlement Admin], [Audit Chain], [Feature Flags] |
| Esco+epc onboarding throws (no step sequence) | Registration fails mid-flow | ONBOARDING_STEPS['esco'] = ['welcome', 'site_setup', 'device_config', 'data_sources', 'alerts', 'complete']; ONBOARDING_STEPS['epc_contractor'] = ['welcome', 'project', 'quality_plan', 'complete'] |
| Provisioning creates entity for only 2 of 10 roles | 8 roles get no seeded data | Cascade onboarding.completed now creates test entities for all 10 roles via factory pattern; each role gets a pre-populated first-entity matching their domain |
| WCAG AA violation: secondary text below threshold | --ink3 too light | Admin Theme: --ink3 raised to oklch(0.50 0.01 0) (contrast 4.8:1 vs 3:1 before); tested against background-color: var(--bg1) |
| No persistent board-role state | Role persona lost on page reload | Board role persisted to localStorage['board_role']; restored on next login; JWT includes claim for audit trail |

---

### Navigation Flow Diagram

```
                    ┌─ /auth/register?token=...
                    │  (email invite, set password)
                    │
                    ↓
            /horizon (Horizon duty board)
             ↙     ↓     ↘
          ⌘K   Lanes   Briefing
           ↓      ↓       ↓
        Atlas  Ledger   Intel
         (4      (chain  (Executive
          tiles)  case   Dashboard
                  list)  + AI)
                   ↓
            /ledger/:chainKey
              ↓         ↓
            [+New]   [case-ref]
             ↓           ↓
           Form      /thread/:chainKey/:id
           (POST)     (two-sided cross-role)
            ↓
         Actions
        [Approve]
        [Fork]
        [Etc]
         ↓
      Cascade fires
    (regulator inbox)
```

---

### Technical Routes Summary

| Endpoint | Method | Role | Purpose |
|----------|--------|------|---------|
| `/api/onboarding/state` | GET | all | Fetch current step, data, completion status |
| `/api/onboarding/step` | POST | all | Advance step, merge data |
| `/api/onboarding/complete` | POST | all | Mark complete, fire provisioning cascade |
| `/api/horizon/admin` | GET | admin | Duty board lanes + top-8 cases |
| `/api/ledger/kyc_verification` | GET | admin | KYC verification list (filtered, paginated) |
| `/api/ledger/audit_chain_block` | GET | admin | Audit chain blocks list |
| `/ledger/audit_chain_block` | (UI route) | admin | Ledger list view |
| `/ledger/audit_chain_block?compose=1` | (UI route) | admin | +New modal pre-populated |
| `/api/audit-chain` | POST | admin | Propose new audit chain block |
| `/api/audit-chain/:id/collect-segments` | POST | admin | Gather segments |
| `/api/audit-chain/:id/build-merkle` | POST | admin | Build Merkle tree |
| `/api/audit-chain/:id/verify-integrity` | POST | admin | Verify hash-chain |
| `/api/audit-chain/:id/sign-block` | POST | admin | Sign with platform key |
| `/api/audit-chain/:id/anchor-block` | POST | admin | Timestamp via TSA |
| `/api/audit-chain/:id/publish-block` | POST | admin | Publish for verification |
| `/api/audit-chain/:id/open-independent-verify` | POST | admin | Open quorum |
| `/api/audit-chain/:id/reconcile` | POST | admin | Reconcile against ledger |
| `/api/audit-chain/:id/archive` | POST | admin | Archive (terminal) |
| `/api/audit-chain/:id/fork` | POST | admin | Fork block (integrity breach) |
| `/api/audit-chain/:id/emergency-seal` | POST | admin | Emergency seal (P0) |
| `/thread/audit_chain_block/:id` | (UI route) | admin / regulator | Two-sided transaction detail |
| `/api/admin-platform/tenants` | GET | admin | List all tenants |
| `/api/admin-platform/tenants` | POST | admin | Provision new tenant |
| `/api/admin-platform/provisioning-requests` | GET | admin | Intake queue |
| `/api/admin-platform/provisioning-requests/:id/approve` | POST | admin | Approve + create tenant + roles |
| `/api/kyc-verifications/:id/action` | POST (body: {action: 'complete_edd', ...}) | admin | KYC workflow transitions |
| `/api/board-role-switch` | POST | admin | Switch personas for testing |
| `/admin/revenue` | (UI route) | admin | Revenue dashboard |
| `/dashboard` | (UI route) | admin | Executive KPI board |
| `/surface/admin:market-halt` | (UI route) | admin | NERSA market halt controls |
| `/surface/admin:settlement` | (UI route) | admin | Settlement run trigger + dry-run |

---

**End of spec. All routes, chains, and surfaces are named from actual MERIDIAN_CHAINS registry entries and /src/routes. The journey covers the full admin lifecycle: acquisition → onboarding → Horizon laned supervision → Atlas discovery → primary chain initiation → state machine actions → cross-role Thread interaction → daily AI briefings → sign out.**
