## Role journey: offtaker

### Overview

The **offtaker** is the PPA buyer. This role procures and manages power purchase agreements (PPAs), monitors delivery against contract, handles take-or-pay true-ups, processes curtailment claims, manages tariff escalation, and ensures compliance with payment-security and carbon-disclosure obligations. Offtaker is a **two-party writer** on most chains (counterparty is the IPP seller; regulator can escalate disputes).

**19 chains visible to offtaker across 5 domain lanes:**
- Contracts (W22, W39, W62, W78, W219, W229, W204): PPA execution, tariff indexation, termination, change-in-law, wheeling, virtual PPAs, SLB KPIs
- Operations (W7, W32, W46, W87, W101, W154): delivery obligations, take-or-pay cases, curtailment claims, nominations, annual reconciliations, unserved-energy claims
- Security (W54): payment-security letters of credit / guarantees / personal guarantees
- Compliance (W103, W210, W48, W200+): ESG/Scope 3 disclosure, green-tariff disclosure, carbon offsets
- **Thread-only (unreachable from Atlas):** ppa_obligation (W7 sub-list; delivery shortfall cure acceptance gate)

---

### (1) Acquisition & First Login

**Identity-verified invite flow (not detailed here; PII/KYC gate per spec constraint):**
- Offtaker entity registers via `/auth/register` with company number, LEI, banking details (encrypted).
- Email verification + KYC gate (`/api/admin/kyc/:tenant_id/verify` via admin or `/kyc` portal).
- First login: user navigates to `https://oe.vantax.co.za/` → sign-in form (`GET /` with no `Authorization` header → redirects to `/login`).
- JWT HS256 issued on successful POST `/api/auth/login` (email, password; cached via `login_or_cached` in scripts).
- Token stored in `localStorage['token']` and `Authorization: Bearer` header for all API calls.
- Rate limiter: 10/5min per IP on login (shared risk across all tenants — plan multiple logins in scripts with delays).

---

### (2) Onboarding Wizard

**Entry point:** `GET /onboarding/state` in LaunchRedirect (`pages/src/App.tsx`):
- If `is_onboarded: false` → route to `/onboard` (displays OnboardingWizard).
- If `is_onboarded: true` → route to `/horizon`.

**Wizard sequence (pages/src/components/onboarding/OnboardingWizard.tsx):**
```
[Welcome] → [Entity] → [PPA Prefs] → [Complete] → /horizon
```

**FIXED behavior (current audit finding):**
- **Entity step (OfftakerEntityStep):** Offtaker company name, FSCA identifier (if trade-exposed), LEI code.
  - Form fields: company_name (string), fsca_reference (string, optional), lei_code (string, optional), jurisdiction (enum: 'SA', 'regional').
  - Submit → POST `/api/onboarding/offtaker/entity` (creates tenant's root `oe_offtaker_entities` row).
  - **Current broken:** throws if step not found → **FIX:** ensure OfftakerEntityStep component exists and is mapped in STEP_COMPONENT_OVERRIDES.
  
- **PPA Prefs step (OfftakerPpaPrefsStep):** Offtaker's procurement profile — energy types, capacity band, preferred seller tiers, take-or-pay floor.
  - Form fields: energy_types (multi-select: 'solar', 'wind', 'hydro', 'biomass'), capacity_band (enum: '<10MW', '10-50MW', '50-100MW', '>100MW'), preferred_currencies (multi: 'ZAR', 'USD'), financing_structure (enum: 'direct_purchase', 'lease', 'ppa'), take_or_pay_floor_pct (number, default 95), counterparty_creditworthiness (enum: 'AAA', 'AA', 'A', 'BBB', 'unrated').
  - Submit → POST `/api/onboarding/offtaker/ppa-prefs` (upserts to `oe_offtaker_preferences` table; drives Horizon lane filtering and Atlas discovery).

- **Complete step:** "You're ready! Click below to enter Horizon."
  - POST `/api/onboarding/complete` (sets `is_onboarded: true`).
  - Button: "Go to Horizon" → navigate `/horizon`.

**Provisioned first entity:**
- On entity step submit: backend creates one `oe_offtaker_entities` row with the submitted company name, FSCA ref, LEI; generates a synthetic offtaker_party_id (GUID).
- **Current audit finding:** provisioning only covers 2 of 10 roles → **FIX:** ensure provisioning spans all 10 roles including offtaker, esco, epc_contractor, etc.

**Sandbox practice (if applicable for demo tenant):**
- Offtaker can opt-in to "Demo mode" checkbox → all subsequent /api calls route to a sandboxed replica DB tenant (isolated copy).
- **Constraint:** no synthetic kWh/billing inserted into real tenants; demo transactions stay in demo-tenant schema.

---

### (3) Landing on Horizon

**GET /api/horizon/offtaker:**
- Backend uses `laneRoleFor('offtaker')` → 'offtaker' (no aliasing needed; only esums_owner→esco).
- `chainsForRole('offtaker')` returns 19 ChainDescriptors filtered by `lanes.offtaker` presence.
- D1 batch query: SELECT (case summary columns) FROM each of the 19 tables WHERE chain_status NOT IN (terminal statuses) LIMIT 60 per chain, ordered by SLA deadline.

**Horizon layout (MeridianFrame + HorizonPage):**

```
┌─────────────────────────────────────────────────────────────────┐
│  Open Energy Platform — Offtaker                   [Ⓜ] [⌘K] [⚙] │  ← header
├─────────────────────────────────────────────────────────────────┤
│  Duty Panel (top 8 cases by attentionScore)                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  PPA-C-2024-001 | drafting | 2 days  | ⚠ high-value        │ │
│  │  TOP-JAN-2024   | quantum  | 12h     | ⚠ BREACH            │ │
│  │  …                                                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Lane: Contracts (5 cases)      [↓ collapse]                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PPA-C-2024-001 (ppa_contract_chain)                         │ │
│  │   draft → in_negotiation | no deadline | project: Solar-MA │ │
│  │   Actions: [Begin negotiation] [Lock terms]                │ │
│  │                                                             │ │
│  │ TAR-IX-2024-01 (tariff_indexation)                         │ │
│  │   notice_issued → disputed | 8 days | project: Wind-WC    │ │
│  │   Actions: [Agree tariff] [Dispute]                       │ │
│  │                                                             │ │
│  │ … (3 more in lane)                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Lane: Operations (7 cases)      [↓ collapse]                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PPA-OBL-JAN-2024 (ppa_obligation — **unreachable tile**)   │ │
│  │   [hidden from lane; requires deep-link from Thread]       │ │
│  │                                                             │ │
│  │ TOP-JAN-2024 (ppa_take_or_pay)                             │ │
│  │   quantum_proposed | 12h | BREACH | project: Solar-MA     │ │
│  │   Actions: [Accept quantum] [Propose quantum] [Settle]     │ │
│  │                                                             │ │
│  │ CLAIM-CURT-001 (curtailment_claim)                        │ │
│  │   claim_lodged | 5 days | project: Wind-WC                │ │
│  │   Actions: [Submit claim] [Confirm compensable]           │ │
│  │                                                             │ │
│  │ … (4 more in lane)                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Lane: Security (1 case)         [↓ collapse]                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PS-LC-2024-001 (ppa_payment_security)                      │ │
│  │   active | 90 days | project: Solar-MA | ZAR 45M           │ │
│  │   Actions: [Renew] [Flag expiry]                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Lane: Compliance (4 cases)      [↓ collapse]                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ESG-DISC-2024 (esg_disclosure)                             │ │
│  │   submitted | 30 days | org: Offtaker Corp                 │ │
│  │   Actions: [Verify] [Publish]                              │ │
│  │                                                             │ │
│  │ … (3 more)                                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**First-run state (empty Horizon):**
- All 5 lanes render but are empty (no non-terminal cases).
- Duty panel shows zero breached cases.
- KPI summary: "0 PPA contracts in force | 0 Take-or-pay cases | 0 Payment securities active".
- Large empty-state card with: "No active transactions yet. Start by exploring the contract and procurement modules in **Atlas** (⌘K)."
- CTA: "Explore PPAs" button → routes to Atlas filtered to 'contracts' domain.

**Populated state (normal operation):**
- Lanes are sorted by attentionScore (breaches at top; BREACH_FLOOR hard-floor ensures any breach ranks above non-urgent items).
- Each case card shows: ref (e.g. "PPA-C-2024-001"), chain key (e.g. ppa_contract_chain), status, SLA deadline (color-coded: red <2h, orange <24h, yellow <7d, grey later), counterparty (if present), and 2–3 primary actions.
- Counterparty name pulled from `counterpartyCol` (e.g. "Green Power SA" for ppa_contract_chain, but null if no seller name in table).
- Quantum (ZAR-at-risk) shown as "ZAR 45M" if present; unit normalized via `quantumZar()` (handles both raw ZAR and _zar_m suffixes).
- Click any case → navigate to `/thread/:chainKey/:id` (full detail + Thread side-panel for cross-role actions).

**Keyboard & focus:**
- Tab order: duty panel → lane headers (collapsible) → cases in each lane (in score order) → footer.
- ⌘K opens Atlas (CommandPalette).
- Collapse/expand lanes persisted in `localStorage['mer.lanes.collapsed']` (JSONified Set<string> of lane keys).
- Focus trap: if only one lane, focus stays within that lane's case list until user Tab+Shift back to header.

**Responsive (<760px):**
- Duty panel stacks vertically (full width).
- Lanes stack vertically; each case card widens to 100%.
- SLA deadline and actions stack under the ref/status line.
- Footer (logout) sticks to bottom.

**A11y:**
- Each lane is a `<section role="region" aria-label="Contracts (5 cases)">`.
- Case card is a `<article>` with tabindex="0" (keyboard-navigable).
- Actions are `<button>` with `aria-label="Begin negotiation"`.
- Breached cases announced with `aria-live="assertive"` on Duty panel.
- --ink3 secondary text (e.g. deadline) must meet WCAG AA (currently broken → **FIX**: bump contrast).

---

### (4) Discovering Functions in Atlas

**Invoke Atlas: ⌘K or click ⌘K in header.**

**Atlas layout (meridian/AtlasPanel.tsx):**
```
┌───────────────────────────────────────────────────────────┐
│  [🔍 Search chains & functions…]                          │ ← input
├───────────────────────────────────────────────────────────┤
│  📋 Contracts                          [→ view all]        │
│  ├─ PPA contracts (W22)         [NEW]  [tile icon]        │
│  ├─ Tariff indexation (W39)    [tile icon]               │
│  ├─ PPA termination (W62)       [tile icon]               │
│  ├─ Change-in-law relief (W78)  [tile icon]               │
│  ├─ Wheeling access (W219)      [tile icon]               │
│  ├─ Virtual PPA / CfD (W229)    [tile icon]               │
│  └─ SLB KPI ratchet (W204)      [tile icon]               │
│                                                           │
│  ⚙ Operations                         [→ view all]        │
│  ├─ Take-or-pay obligations (W32) [tile icon]            │
│  ├─ Curtailment claims (W46)     [tile icon]             │
│  ├─ Energy nominations (W87)     [tile icon]             │
│  ├─ Annual reconciliation (W101)  [tile icon]            │
│  ├─ Unserved-energy claims (W154) [tile icon]            │
│  └─ Delivery reports             [empty body] ✗         │
│                                                           │
│  🔐 Payment Security                   [→ view all]        │
│  ├─ Payment security (W54)       [tile icon]             │
│  └─ Credit support docs          [empty body] ✗         │
│                                                           │
│  ✓ Compliance                         [→ view all]        │
│  ├─ ESG disclosure (W103)        [tile icon]             │
│  ├─ Scope 3 disclosure (W200)    [tile icon]             │
│  ├─ Carbon offsets (W48)         [tile icon]             │
│  ├─ Green-tariff disclosure (W210) [tile icon]           │
│  └─ [+5 more surfaces: sites, tariffs, budgets, bills...]│
│                                                           │
│  [Sign out]                                              │
└───────────────────────────────────────────────────────────┘
```

**Tile vs thread-only classification:**

| Chain | Feature | Frontdoor | Lane | Type |
|-------|---------|-----------|------|------|
| ppa_contract_chain | PPA contracts | Tile | contracts | Owned: offtaker initiates; IPP counterparty read/action |
| ppa_take_or_pay | Take-or-pay obligations | Tile | operations | Two-party: offtaker proposes quantum, IPP accepts/disputes |
| curtailment_claim | Curtailment claims | Tile | operations | Two-party: IPP submits, offtaker classifies/settles |
| ppa_nomination | Energy nominations | Tile | operations | Two-party: day-ahead nomination window |
| ppa_annual_recon | Annual reconciliation | Tile | operations | Two-party: true-up at fiscal year-end |
| tariff_indexation | Tariff indexation | Tile | contracts | Two-party: seller publishes index, offtaker agrees |
| ppa_termination | PPA termination | Tile | contracts | Two-party: early-termination buy-out chain |
| ppa_change_in_law | Change-in-law relief | Tile | contracts | Two-party: offtaker cost-pass claim; arbitration branch |
| ppa_payment_security | Payment security | Tile | security | Owned: offtaker manages guarantees/LCs |
| rec_lifecycle | REC lifecycle | Tile | contracts | Two-party: I-REC/SAREC/EU-GO certificate retirement |
| virtual_ppa_settlement | Virtual PPA / CfD | Tile | contracts | Owned: contract-for-difference financial settlement |
| wheeling_access | Wheeling access | Tile | contracts | Two-party: third-party transmission access |
| slb_kpi_ratchet | SLB KPI ratchet | Tile | contracts | Owned: sustainability-linked-bond KPI monitoring |
| unserved_energy_claim | Unserved-energy claims | Tile | operations | Owned: offtaker claims against grid use-of-system |
| esg_disclosure | ESG disclosure | Tile | compliance | Owned: ESG & assurance reporting |
| carbon_scope3_disclosure | Scope 3 disclosure | Tile | compliance | Owned: value-chain emissions disclosure |
| carbon_offset_claim | Carbon offsets | Tile | compliance | Owned: carbon Tax Act offset claim |
| green_tariff_disclosure | Green-tariff disclosure | Tile | compliance | Owned: Scope-2 zero-carbon claim disclosure |
| **ppa_obligation** | **Delivery obligations** | **None (unreachable)** | **operations** | **Thread-only: reachable ONLY from ppa_take_or_pay Thread side-panel** |

**Dossier grouping:** None for offtaker (IPP role has 29 ipp_* sub-docs grouped under "Project Dossier"). Offtaker chains are all standalone.

**Atlas search:**
- Type "take-or-pay" → highlights "Take-or-pay obligations (W32)" + autocomplete from chain titles/descriptions.
- Type "payment" → returns "Payment security" + "PPA contracts" (if keyword in description).
- Type "emission" → returns "ESG disclosure" + "Scope 3 disclosure" + "Green-tariff disclosure".

**Empty bodies (broken audit finding):**
- "Delivery reports" → feature key 'delivery_reports', no chainKey, route NOT registered in surfaces.tsx → **FIX:** either mount the tab or remove the feature.
- "Credit support docs" → 'credit_support', no chainKey → similar issue → **FIX:** mount or remove.
- "REC retirement" → 'rec_retirement', mapped to OfftakerRecs surface (lazy-loaded) in surfaces.tsx → WORKING (not empty).

**Dangling tiles (broken audit finding):**
- If chainKey does not exist in MERIDIAN_CHAINS → clicking tile returns 404 on Thread → **FIX:** validate all roleData chainKeys against MERIDIAN_CHAINS at build-time.

**Responsive (<760px):**
- Atlas panel collapses to full-screen overlay (modal-like).
- Domain sections stack vertically; features wrap to 2-column grid.

---

### (5) Initiating a Primary Owned Transaction: PPA Contract Execution (ppa_contract_chain / W22)

**User workflow:**
1. Click "PPA contracts (W22)" tile in Atlas → navigate `/ledger/ppa_contract_chain`.
2. Ledger page shows list of PPAs (all statuses including terminal). CTA: **[+ New PPA]**.
3. Click [+ New PPA] → modal/drawer opens with form.

**+New initiation form (from chain initiation descriptor):**

```
╔════════════════════════════════════════════════════════════╗
║  New PPA Contract                                          ║
║  ────────────────────────────────────────────────────────  ║
║                                                            ║
║  Step 1 of 3: Project Selection                           ║
║  ┌────────────────────────────────────────────────────┐   ║
║  │ Select or create project *                         │   ║
║  │ ┌──────────────────────────────────────┐           │   ║
║  │ │ [v] Filter active projects           │           │   ║
║  │ └──────────────────────────────────────┘           │   ║
║  │ ○ Solar-MA-2024 (5 MW, Solar, Mpumalanga)          │   ║
║  │ ○ Wind-WC-2024 (20 MW, Wind, Western Cape)        │   ║
║  │ ○ Hydro-Eastern-2024 (10 MW, Hydro, Free State)   │   ║
║  │ ◉ + New project [Requires IPP registration]       │   ║
║  └────────────────────────────────────────────────────┘   ║
║                                                            ║
║  Seller details *                                         ║
║  ┌────────────────────────────────────────────────────┐   ║
║  │ Company/IPP name                                   │   ║
║  │ [________________________________________]         │   ║
║  │ FSCA reference (optional)                          │   ║
║  │ [________________________________________]         │   ║
║  │ Email                                              │   ║
║  │ [________________@________.co.za]                  │   ║
║  └────────────────────────────────────────────────────┘   ║
║                                                            ║
║                                    [Back]  [Next]          ║
╚════════════════════════════════════════════════════════════╝
```

**Step 1: Project Selection**
- Dropdown (lookup source `/api/ledger/lookup/ipp_projects`; returns [{id, label}] of active projects the offtaker has engaged with).
  - Type: 'lookup'
  - Label: "Select or create project"
  - Source: '/api/ledger/lookup/ipp_projects'
  - Required: true
- **Fallback:** if no projects exist, offer "Create a new project" (routes to IPP workstation to seed a project; Offtaker cannot create IPP projects directly).
- Seller name (string, free-text or auto-populated from project.ipp_name).
- Seller FSCA ref (string, optional).
- Seller email (string, prefilled from IPP entity email if available).

**Step 2: PPA Terms**
```
╔════════════════════════════════════════════════════════════╗
║  Step 2 of 3: Commercial Terms                            ║
║                                                            ║
║  Contract period                                          ║
║  From: [2025-01-01]  To: [2045-01-01]  [20 years]        ║
║                                                            ║
║  Capacity committed (MW) *                                ║
║  [________]                                              ║
║                                                            ║
║  Base tariff (ZAR/MWh) *                                  ║
║  [________]                                              ║
║                                                            ║
║  Escalation mechanism *                                   ║
║  ○ Fixed tariff (no escalation)                           ║
║  ◉ CPI-linked annual escalation [1.3% baseline]          ║
║  ○ Wholesale price collar (min / max)                     ║
║                                                            ║
║  Take-or-pay floor (% of contracted capacity) *           ║
║  [_95_]% [prefilled from offtaker prefs]                 ║
║                                                            ║
║  Payment terms *                                          ║
║  ○ Monthly invoice (30-day settlement)                    ║
║  ◉ Monthly invoice (15-day settlement)                   ║
║  ○ Bi-weekly settlement                                   ║
║                                                            ║
║                                    [Back]  [Next]          ║
╚════════════════════════════════════════════════════════════╝
```

- Fields:
  - contract_start_date (type: 'date', required)
  - contract_end_date (type: 'date', required)
  - contract_term_years (number, auto-calculated, read-only)
  - capacity_mw (type: 'number', unit: 'MW', required)
  - base_tariff_zar_mwh (type: 'number', unit: 'ZAR/MWh', required)
  - escalation_mechanism (type: 'enum', required, options: ['fixed', 'cpi_linked', 'wholesale_collar'])
  - cpi_baseline_pct (type: 'number', visible if escalation='cpi_linked', unit: '%', default: 1.3)
  - take_or_pay_floor_pct (type: 'number', required, prefilled from onboarding prefs)
  - payment_terms (type: 'enum', required, options: ['monthly_30d', 'monthly_15d', 'fortnightly'])

**Step 3: Legal & Execution**
```
╔════════════════════════════════════════════════════════════╗
║  Step 3 of 3: Legal Setup                                 ║
║                                                            ║
║  Contract legal template *                                ║
║  ┌──────────────────────────────────────┐                 ║
║  │ [v] NERSA Section 34 Standard PPA   │                 ║
║  └──────────────────────────────────────┘                 ║
║                                                            ║
║  Dispute resolution *                                     ║
║  ○ Negotiation only                                        ║
║  ◉ Mediation → Arbitration (London Rules)                ║
║  ○ Escalation to regulator                                ║
║                                                            ║
║  Counterparty legal entity name *                         ║
║  [________________________________]                       ║
║                                                            ║
║  Counterparty registration number *                       ║
║  [________________________________]                       ║
║                                                            ║
║  Counterparty banking details (BIC/IBAN) *               ║
║  [________________________________]                       ║
║                                                            ║
║  Notes (optional)                                         ║
║  [________________________________]                       ║
║  [________________________________]                       ║
║                                                            ║
║  I confirm this PPA is legally executed and              ║
║  ready for commencement. □ (required)                     ║
║                                                            ║
║                                    [Back]  [Create]        ║
╚════════════════════════════════════════════════════════════╝
```

- Fields:
  - contract_legal_template (type: 'enum', required, options from lookup `/api/ledger/lookup/ppa_templates`: ['nersa_s34_standard', 'customized_nersa', 'non_standard'])
  - dispute_mechanism (type: 'enum', required, options: ['negotiation', 'mediation_arbitration', 'regulator_escalation'])
  - counterparty_legal_name (type: 'string', required)
  - counterparty_reg_number (type: 'string', required)
  - counterparty_banking_bic_iban (type: 'string', required, placeholder: 'BIC: XXXXX | IBAN: XXXX…')
  - notes (type: 'string', optional, placeholder: 'Internal contract notes')
  - confirmed_executable (type: 'boolean', required, label: 'I confirm this PPA is legally executed and ready for commencement.')

**Form behavior:**
- Mandatory fields marked with `*`.
- Type: 'lookup' fields show a dropdown with async results from `/api/ledger/lookup/:source`.
- Type: 'date' fields show a date-picker (browser native or custom calendar).
- Type: 'enum' fields show radio buttons or <select> depending on option count.
- Type: 'string' with unit shows input + unit suffix (e.g. "15 ZAR/MWh").
- Type: 'evidence' fields show file upload + metadata (W22 initiation has none, but "Board approval ref" in actions is evidence type).

**Submit:**
- POST `/api/offtaker/ppa-contract-chain` with {project_id, seller_name, seller_fsca_ref, contract_start_date, …, notes}.
- Backend creates row in `oe_ppa_contract_chain` table with chain_status='draft'.
- Returns {success: true, data: {id: '...', ref: 'PPA-C-2024-001'}} (auto-generated ref from sequence or KSUID).
- Frontend redirects to `/thread/ppa_contract_chain/:id` (detail page opens below).

---

### (6) Detail Page: PPA Contract Chain Thread (Cross-Role Interaction)

**Navigate to: `/thread/ppa_contract_chain/PPA-C-2024-001`**

**Thread layout (two-sided Transaction UI):**

```
┌───────────────────────────────────────────────────────────────────┐
│ ◄ Back              PPA Contract: PPA-C-2024-001                  │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Left side: CASE DETAIL]           [Right side: SIDE PANEL]     │
│                                                                   │
│  Status: draft                       Actions available:          │
│  Project: Solar-MA-2024              ┌──────────────────────┐    │
│  Capacity: 5 MW                      │ Begin negotiation    │    │
│  Base tariff: ZAR 1,200/MWh          │                      │    │
│  Term: 20 years (2025–2045)         │ [This will:]         │    │
│  Escalation: CPI-linked @ 1.3%      │ - Start timer        │    │
│  ToP floor: 95%                     │ - Notify seller      │    │
│  Counterparty: Green Power SA        │ - Open negotiation   │    │
│  Payment terms: Monthly 15d          │   window (SLA)       │    │
│  Dispute: Arbitration                │ [Begin negotiation]  │    │
│                                      │                      │    │
│  ─────────────────────────────────   │ ─────────────────────│    │
│  Timeline                            │                      │    │
│  Created: 2024-12-15 13:22 UTC       │ [User avatar]        │    │
│  [+ event log below]                 │ [Read-only log]      │    │
│                                      │ - Draft created      │    │
│  Raw record (for comparison):        │ - By: reshigan@..    │    │
│  {                                   │                      │    │
│    id: 'abc-123-def',                │ ┌─────────────────┐  │    │
│    ppa_number: 'PPA-C-2024-001',    │ │ [Messages]       │  │    │
│    project_name: 'Solar-MA-2024',    │ │ Ready to sign?   │  │    │
│    ... [all 40+ columns from         │ │ [Yes/No buttons] │  │    │
│        oe_ppa_contract_chain]        │ │                 │  │    │
│  }                                   │ └─────────────────┘  │    │
│                                      │                      │    │
│                                      │ Related chains:      │    │
│                                      │ - W39 Tariff index   │    │
│                                      │ - W32 Take-or-pay    │    │
│                                      │ - W54 Payment sec    │    │
│                                      │ - W70 REC lifecycle  │    │
│                                      │                      │    │
│                                      │ [Link to these]      │    │
│                                      │ [IPP detail]         │    │
│                                      └──────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Left panel: Case detail**
- Card shows all key fields from the `oe_ppa_contract_chain` row (via listSelectCols + full row on Thread).
- Status badge: "draft" (color-coded: grey for draft, blue for in_force, orange for in_dispute, red for terminated).
- QR code to share case URL: [QR] (useful for cross-role stakeholders to quickly access).
- Full event log (if eventsTable = 'oe_ppa_contract_chain_events'):
  - Rows from that events table, ordered by created_at DESC.
  - Shows: action taken, actor_role, timestamp, reason_code (if present).

**Right side panel: Actions + cross-role interactions**
- **Visible actions (filtered by JWT role):** Only actions where JWT role is in `actions[].roles[]`.
  - For offtaker role viewing their own draft: shows ['begin-negotiation', 'lock-terms', 'legal-sign', 'execute', 'cancel'].
  - Each action shows: button label (e.g. "Begin negotiation"), cascadeHint ("Opens commercial negotiation on a draft PPA; arms the negotiation SLA window."), and tone (primary/ghost/oxide).
  
- **Primary action (Begin negotiation):**
  - Click → modal opens (no extra fields for this action; it's a stateless transition).
  - Modal body: cascadeHint text + confirmation.
  - Submit → POST `/api/offtaker/ppa-contract-chain/:id/begin-negotiation`.
  - Backend: updates chain_status to 'in_negotiation', sets sla_deadline_at to (now + 30 days).
  - Fires cascade: `fireCascade({event: 'ppa_contract.begin_negotiation', actor_id, entity_type: 'ppa_contract_chain', entity_id, data: {...}, env})`.
    - Cascade delivers: push notification to seller (IPP) → "Offtaker XYZ has initiated PPA negotiation on Solar-MA-2024. Respond by [date]."
    - Adds entry to seller's Horizon (ipp_developer lane 'finance' now shows this case).
    - Audit log records the action.

- **Message thread:** Expandable chat-like section (if cascade includes messaging; for v1, this is read-only log).

- **Related chains:** Shows hyperlinks to downstream chains spawned by this one:
  - W39 (tariff_indexation) — triggered when PPA moves to 'in_force'.
  - W32 (ppa_take_or_pay) — triggered monthly once delivery starts.
  - W54 (ppa_payment_security) — parallel chain created at PPA execution (letter of credit required).
  - W70 (rec_lifecycle) — triggered once PPA is in_force (REC ownership transfer).

**Counterparty side-panel (if viewer is NOT the owner):**
- If a different role (e.g. ipp_developer, regulator) accesses this Thread via a cross-role action, they see a **read-only** summary:
  - "Viewing as counterparty (IPP Developer)"
  - Case summary (same left panel, but buttons are disabled).
  - Their own actions (if any): e.g. IPP can see ['lock-terms', 'legal-sign', 'execute'] (roles check).
  - Separate message thread for counterparty responses.

**AI inline assist (example):**
- If offtaker is in 'draft' state for >7 days, an AI card appears: "Suggested next step: Begin negotiation to lock commercial terms. This will notify the seller and start a 30-day window for term lockdown."
  - Powered by `buildTraderAiSuggestions`-style logic in `/api/launch.ts` for offtaker domain.
  - Card has [Why?] button (explains reasoning) and [Accept] CTA (auto-clicks Begin negotiation button).

**Keyboard & focus:**
- Tab navigates: back button → case fields → actions → side panel components.
- Escape closes side panel (if modal overlay).
- Enter on action button opens confirmation modal.

**Responsive (<760px):**
- Side panel moves below the case detail (stacked layout).
- Case detail cards reduce to single-column layout.
- Action buttons stack vertically.

**A11y:**
- Case detail is a `<section aria-label="PPA-C-2024-001 details">`.
- Each field is a `<dl>` (definition list) with term + value.
- Actions are `<button>` with aria-label + aria-describedby pointing to cascadeHint.
- Status badge is a `<span role="status" aria-live="polite">` (updated when action completes).

---

### (7) Ongoing Daily Work + AI Assists

**Scenario: Offtaker receives a "Curtailment claim" from the seller**

1. **IPP submits a claim:**
   - IPP logs into their ipp_developer workspace.
   - Navigates `/ledger/curtailment_claim` → clicks [+ New claim].
   - Fills form: facility name (Solar-MA-2024), curtailment event (date), deemed energy (500 MWh), claimed amount (ZAR 600k).
   - Submits → chain created in 'claim_lodged' status.
   - Cascade fires → offtaker's Horizon immediately shows new case in "Operations" lane.

2. **Offtaker Horizon updates (GET /api/horizon/offtaker re-fetched on return to tab):**
   - CLAIM-CURT-001 now appears at top of Operations lane (score = high quantum + short deadline).
   - Card shows: "CLAIM-CURT-001 | claim_lodged | 10 days | ZAR 600k" (quantum visible).
   - Actions shown: [Submit claim] (IPP action, hidden) → [Confirm compensable] (offtaker action, visible).

3. **Offtaker clicks the case → `/thread/curtailment_claim/CLAIM-CURT-001`:**
   - Left panel shows: curtailment event, deemed energy (500 MWh), claimed amount (ZAR 600k), counterparty: Green Power SA.
   - Right panel shows actions:
     - [Begin classification] — opens SCADA validation workflow.
     - [Confirm compensable] — fast-path if claim is obviously valid (e.g. seller's SCADA outage data confirms curtailment).
     - [Reject non-compensable] — if curtailment was IPP-caused or scheduled maintenance.
   - **AI assist card:** "This curtailment matches the SO's published event on 2024-12-15 14:00–15:30 (load-shedding stage 4). SCADA data from Solar-MA-2024 shows zero production. Likely compensable under PPA clause 3.2(a)."
     - [Why?] → explains matching logic.
     - [Accept] → auto-clicks [Confirm compensable] button.

4. **Offtaker clicks [Confirm compensable]:**
   - Modal opens: "Classification basis" (text, required).
   - Offtaker types: "SCADA confirms zero production 14:00–15:30 UTC. SO load-shedding event confirmed via Grid dispatch system."
   - Upload evidence file (optional): SO dispatch notification PDF.
   - Submit → POST `/api/curtailment-claim/chain/:id/confirm-compensable`.
   - Backend: updates status to 'quantum_validation', sets next SLA (5 days for quantum agreement).
   - Cascade fires:
     - Adds offtaker's classification note to Thread.
     - Notifies IPP: "Offtaker has classified the curtailment as compensable. Waiting for quantum agreement (5 days)."
     - Updates Horizon for both offtaker and IPP (case moves to 'quantum_validation' bucket).

5. **Next day: Offtaker returns to Horizon.**
   - Case still in Operations lane, now status = "quantum_validation" (yellow indicator, 4 days left).
   - Offtaker clicks case → side panel shows [Propose quantum] action.
   - Clicks [Propose quantum]:
     - Modal: "Proposed amount (ZAR)" = [600000] (prefilled from claimed amount).
     - "Quantum basis" (text, required) = offtaker enters: "W39 indexed tariff ZAR 1,200/MWh × 500 MWh = ZAR 600k (no adjustment for partial curtailment)."
     - Upload basis document (PDF of tariff schedule).
     - Submit → POST `/api/curtailment-claim/chain/:id/propose-quantum`.
     - Backend: status → 'quantum_agreed' (if IPP auto-agrees within SLA), or 'dispute' (if IPP disputes).
     - Cascade: IPP notified → waits for acceptance.
   - Cascade fires: regulator added to watchers if dispute risk detected (not present yet).

6. **AI inline assist for offtaker's daily work:**
   - **On Horizon:** KPI card shows "Take-or-pay exposure: ZAR 2.1M (3 open cases)". [Expand] reveals the TOP cases in "Operations" lane.
   - **In Thread for ppa_take_or_pay case (Jan 2024):** AI card says "January TOP is accrued. Offtaker typically proposes quantum by Jan 31. You have 5 days to propose. Suggested amount: ZAR 287k (12 MWh shortfall × ZAR 1,200/MWh × 2% degradation)."
     - [Why?] → shows calculation logic.
     - [Propose this] → pre-fills form with suggested quantum.

---

### (8) Sign Out

**On any page, click user avatar (top-right) → dropdown menu:**
```
  👤 reshigan@vantax.co.za
  ────────────────────────────────────
  Role: Offtaker (Solar-MA-2024)
  Tenant: My Company Ltd
  ────────────────────────────────────
  ⚙ Settings
  📋 Profile
  🔐 Change password
  ────────────────────────────────────
  🚪 Sign out
```

**Click [🚪 Sign out]:**
- DELETE JWT from localStorage: `localStorage.removeItem('token')`.
- POST `/api/auth/logout` (invalidates server-side session, if any).
- Redirect to `/login` (or `/?logout=true` with banner "Signed out successfully").
- SPA shell frozen (no data fetches).

**Re-login required to access `/horizon` or any protected route.**

---

### Current Broken Behaviors (Audit Findings) — FIXED

| Issue | Current State | Fixed Behavior |
|-------|---------------|---|
| **ppa_obligation unreachable** | Chain laned to 'operations_offtaker' but NO roleData feature; zero Atlas tile. On Horizon, shows but not in side-panel. | ppa_obligation remains a **Thread-only chain** — deeplink from ppa_take_or_pay side-panel. Do NOT add to roleData; keep it as a sub-ledger. Horizon shows it only if cases exist (non-terminal); clicking navigates `/thread/ppa_obligation/:id`. |
| **Empty-body tiles** | 'delivery_reports', 'credit_support' have no chainKey + no registered surface. | Remove from roleData if out-of-scope for L4. Or mount tab: add component + register in surfaces.tsx as 'offtaker:delivery_reports'. |
| **Dangling chainKeys** | roleData points to chainKeys not in MERIDIAN_CHAINS (e.g. 'foo_chain'). | Pre-build validation: verify all roleData Feature.chainKey values exist in MERIDIAN_CHAINS. Fail build if mismatch. |
| **Secondary text WCAG AA failure** | --ink3 secondary text (e.g. SLA deadline on Horizon cards) fails WCAG AA contrast (4.5:1). | Bump secondary text contrast to 4.5:1 minimum on all backgrounds. Use accessible color pair (e.g. #555 on white instead of #999). |
| **Focus trap missing on modals** | Action modals have aria-modal=true but no focus-trap + inert sibling. | Wrap modal body in custom `<FocusManager>` that traps Tab/Shift+Tab inside modal + restores focus to button on close. Mark off-modal content with inert="true". |
| **Thread dumps raw.* verbatim** | Case detail shows all 40+ columns from the raw row without formatting or PII redaction. | Filter raw columns: omit PII (e.g. individual_id, passport_number); format numeric/date columns (commas, ISO dates); truncate long strings. Provide [Raw JSON] download for auditors only. |
| **esco + epc_contractor onboarding throws** | STEP_SEQUENCES + STEP_COMPONENT_OVERRIDES missing keys for esco, epc_contractor. | Add sequences: esco → ['welcome', 'org_setup', 'connectivity', 'alerts', 'complete']; epc_contractor → ['welcome', 'org_setup', 'projects', 'complete']. Implement missing step components. |
| **Provisioning creates entity for only 2 of 10 roles** | Only trader + lender get seeded first entity on onboarding completion. | Extend provisioning to all 10: trader, lender, offtaker, ipp_developer, carbon_fund, grid_operator, regulator, support, esco, epc_contractor. Call `/api/onboarding/:role/provision-entity` with role-specific defaults. |
| **Header quicklinks role-blind** | Header "Horizon" link shows same menu for all roles (e.g. "[IPP Workstation] [Trading] [Carbon]"). | Compute visible links from `getRoleConfig(role).domains` + filter to roles the JWT permits. Admin sees all; trader sees only '[Trading] [Settlement]'; offtaker sees '[Contracts] [Operations]' etc. |
| **40 Atlas tiles have empty bodies** | Tile onClick routes to /surface/:key, but surface component is lazy-loading stub or not mounted. | Pre-load all lazy components on App mount (low priority). Or replace stubs with real surfaces. For chains, verify all link to real Ledger pages. |
| **49 chains unreachable from any role** | Chains laned but no roleData Domain/Feature pointing to them. Example: ppa_obligation. | Audit each: either add roleData feature (if user-facing), or mark as internal-only (no Horizon lane, Thread-only). ppa_obligation is intentionally internal. |

---

## Summary

The **offtaker role's UX journey** spans procurement (PPA contract execution), delivery management (take-or-pay true-ups, curtailment claims), tariff management (escalation), compliance (ESG/carbon), and payment security. Every transaction is two-party (counterparty = IPP seller) except a few owned chains (unserved-energy claims, virtual PPAs). The journey is **L4-complete**: state machines with pre-trade gates (seller verification), downstream cascades (notifying IPP + regulator), AI assists (curtailment classification, TOP quantum), and audit trails. Horizon lanes organize the 19 chains into 5 domains (Contracts, Operations, Security, Compliance); ppa_obligation is uniquely thread-only (reachable only from ppa_take_or_pay side-panel). The fixed behaviors address the audit gaps: focus traps on modals, WCAG AA contrast, roleData validation, esco+epc provisioning, and role-aware header navigation.
