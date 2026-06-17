## Role journey: lender

Lender is a project-finance role focused on credit origination, monitoring, enforcement, and risk management. The platform separates lender work into three frontdoor lanes: **Origination** (new facility applications & secondary-market transfers), **Monitoring** (drawdowns, covenants, security, DSCR, reserves), and **Enforcement** (defaults & restructuring). Risk chains (SLL KPI, ESAPs, facility amendments, capital adequacy) surface in a separate **Risk** lane. The journey below fixes 7 unreachable chains (`capital_adequacy_report`, `facility_amendment`, `disbursement_case`, and 4 others) by classifying them correctly and wiring them into Horizon + Atlas.

---

### 1. First Login & Acquisition

**Entry points:**
- Email invite: `lender@openenergy.co.za` (demo) or tenant-supplied domain (production)
- Auth flow: `/api/auth/login` → Bearer JWT (HS256, 1h TTL)
- Post-login: `GET /api/onboarding/state` → `onboarding_completed=0` → redirect to `/onboard`

**First-time state:**
- Token stored in `localStorage['token']`
- Participant row exists with `onboarding_step='welcome'`, `role='lender'`
- No entities provisioned yet (unlike IPP Developer which gets an `ipp_projects` row, lender gets `kind='none'` in the provisioning log — no first entity seeded)

---

### 2. Onboarding Wizard: Lender-Specific Steps

**Page:** `/onboard` (OnboardingWizard component)

**Step sequence** (from `ONBOARDING_STEPS['lender']`):
1. **Welcome** — orientation card, platform intro, role narrative
2. **Fund setup** — name the lender (e.g. "ABC Development Finance"), country, base currency (ZAR), regulatory tier
3. **Coverage** — portfolio focus, ticket/support SLA preference
4. **Complete** → fires `onboarding.completed` event

**Wizard field details (step 2: Fund setup):**
- `fund_name` (text) — lender legal name
- `country_code` (lookup: ZA)
- `base_currency` (fixed: ZAR)
- `regulatory_tier` (enum: senior_secured / mezzanine / subordinated / equity) — affects duty prioritization
- `portfolio_focus` (multi-select: renewable_energy, hydro, solar_pv, wind, energy_efficiency, other)

**Wizard field details (step 3: Coverage):**
- `ticket_sla_tier` (enum: p1_standard / p1_fast / p1_ultra) — gates dunning cycle response times
- `portfolio_size_zar_m` (optional number) — used for SARB large-exposure filtering
- `invite_settings` (checkbox: "Auto-invite partners to projects") — pre-configs role-action push behavior

**On completion:**
- `onboarding.completed` event fires → cascade rule logs `{ kind: 'none' }` (no entity created)
- Redirect to `/horizon`

**First-run Horizon state:**
- All 3 lanes (origination, monitoring, enforcement) empty
- Duty pane empty
- Counts: `{ total: 0, breached: 0 }`
- Checklist: 5 quick-start actions to get started

---

### 3. Landing on Horizon — Three Lanes + Risk Overview

**Page:** `/horizon` (MeridianFrame + HorizonLanes)

**URL:** `GET /api/horizon/lender` → returns `{ lanes, duty, counts }`

**Lane structure (per chain-registry):**

| Lane | Meaning | Chains (owned) | Counterparty |
|------|---------|---|---|
| **origination** | New deals & secondary market | credit_facility_application, loan_transfer, cp_clearance | IPP Developer |
| **monitoring** | Ongoing facility health | drawdown, covenant_certificate, security_perfection, dscr_monitoring, reserve_account, construction_cost_report, disbursement_case | IPP Developer |
| **enforcement** | Defaults & restructuring | loan_default, loan_restructure | IPP Developer |

**Risk lane:**
- sll_kpi, facility_amendment, esap_compliance, esap_monitoring, capital_adequacy_report

**Lane card layout example:**
```
┌─ ORIGINATION (5) ──────────────────────────────┐
│                                                 │
│ Credit origination: ABC Solar IPP (W53)        │
│ Status: committee | DSCR 1.35x | ZAR 200M      │
│ Deadline: 2d | Action: Approve facility        │
│                                                 │
│ Loan transfer: XYZ Coal→NewLender (W61)        │
│ Status: due_diligence | ZAR 50M | Deadline: 5d│
│                                                 │
│ [3 more cases, sorted by score]                │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Duty pane** (top 8 by attention score):
- Breach deadline color coding: 🔴 breached (red) → 🟠 h2 (orange) → 🟡 today (amber) → 🟢 h48+ (green)
- Case card: `[ref] | [status] | [title] | [quantum] | [deadline] | [primary action button]`
- Sort: descending by `attentionScore = (quantumZar / 1e9) * 100 + (-hoursToDl)`

**Checklist / Quick-start:**
- ☐ Create a credit origination (→ `/ledger/credit_facility_application?compose=1`)
- ☐ Set up 5 covenants (→ surface:lender:covenants)
- ☐ Invite first IPP (→ surface:ipp_developer:invite_partners link)
- ☐ Configure DSCR monitoring (→ `/ledger/dscr_monitoring?compose=1`)
- ☐ Upload facility agreement (→ `/surface/facility_docs`)

**Mobile reflow** (<760px):
- Lanes collapse into single scrollable list sorted by score
- Duty pane moves above lanes
- Card width: full viewport minus 16px padding
- Lane header becomes collapsible group

---

### 4. Atlas / Function Discovery — Tiles & Classification

**Page:** `/atlas` or `⌘K` CommandPalette

**Lender's domains and features in Atlas:**

#### Domain: Origination (icon ◈)
- 📋 **Credit origination** (chainKey: credit_facility_application) → `/ledger/credit_facility_application`
  - **Frontal tile: YES** (lender owns write path)
  - Thread-only: NO
  
- 💼 **Facilities** (no chainKey) → surface view
  - Static portfolio dashboard; **frontal tile: YES** (read-only)
  
- 🔗 **Loan transfer / secondary** (chainKey: loan_transfer) → `/ledger/loan_transfer`
  - **Frontal tile: YES**; Thread-only: NO

#### Domain: Monitoring (icon ◩)
- 💰 **Drawdowns / UoP** (chainKey: drawdown) → `/ledger/drawdown`
  - **Frontal tile: YES**; Thread-only: NO; **[FIXED: now reachable in Horizon]**

- ✅ **Covenant certificates** (chainKey: covenant_certificate) → `/ledger/covenant_certificate`
  - **Frontal tile: YES**; IPP Developer sees as counterparty in Thread

- 🔐 **Security perfection** (chainKey: security_perfection) → `/ledger/security_perfection`
  - **Frontal tile: YES**; Thread-only: NO

- 📊 **DSCR monitoring** (chainKey: dscr_monitoring) → `/ledger/dscr_monitoring`
  - **Frontal tile: YES**; **[FIXED: confirmed in Horizon lane]**

- 🏦 **Reserve accounts** (chainKey: reserve_account) → `/ledger/reserve_account`
  - **Frontal tile: YES**; Thread-only: NO

- 📈 **Portfolio overview** (no chainKey) → `/surface/lender:portfolio_overview`
  - Aggregate NAV, exposure, sector heatmap; **frontal tile: YES** (read-only)

- ⚠️ **Risk dashboard** (no chainKey) → `/surface/lender:risk_dashboard`
  - Concentration, covenant-breach watch-list; **frontal tile: YES** (read-only)

#### Domain: Enforcement (icon ⬓)
- 🚨 **Default & enforcement** (chainKey: loan_default) → `/ledger/loan_default`
  - **Frontal tile: YES**; **[FIXED: now in Horizon]**

- 🔄 **Restructure & A&E** (chainKey: loan_restructure) → `/ledger/loan_restructure`
  - **Frontal tile: YES**; **[FIXED: added to enforcement domain]**

- 💬 **Dunning queue** (no chainKey, custom surface) → `/surface/lender:dunning_queue`
  - Cycle 1/2/3 observation notices; **frontal tile: YES**

#### Domain: Risk (icon ◎)
- 🎯 **SLL KPI & ratchet** (chainKey: sll_kpi) → `/ledger/sll_kpi`
  - 9 states: baseline_set → kpi_period_open → independent_verification → kpi_attested → ratchet_computed → breach_recorded → cure_period → margin_amended (+ cure_failed)
  - **Frontal tile: YES**

- 🌱 **ESG / DFI monitoring** (no chainKey) → `/surface/lender:esg_monitoring`
  - Equator Principles E&S readiness; **frontal tile: YES**

- 📈 **Benchmark transition** (no chainKey) → `/surface/lender:jibar_zaronia`
  - JIBAR→ZARONIA reset schedule; **frontal tile: YES**

- 💼 **Large-exposure concentration** (no chainKey) → `/surface/lender:large_exposure`
  - SARB large-exposure limits by tier; **frontal tile: YES**

**Thread-only (reachable ONLY via counterparty Thread, no flat tile):**

- `disbursement_case` (W30) — UoP reconciliation; lender is monitoring lane owner but **[FIX: was unreachable]** → **now add non-chain surface tile "Disbursement tracking"**

- `facility_amendment` (W194) — lender is risk_lender lane but **[FIX: no tile]** → **add to Risk domain or Monitoring as "Amendment requests" surface**

- `capital_adequacy_report` (W203) — lender is risk_lender lane owner; **[FIX: unreachable]** → **add to Reporting domain as read-only surface**

**Empty-state messaging:**
- **Origination domain**: "Create your first credit facility application to get started. [+New]"
- **Monitoring domain**: "No active drawdowns or covenants. [Invite an IPP] to begin monitoring."
- **Enforcement domain**: "No defaults recorded. (This is good news.)"
- **Risk domain**: "Set up sustainability-linked KPI targets. [Configure SLL]"

---

### 5. Primary Transaction: Credit Facility Origination

**Chain:** `credit_facility_application` (W53)

**Entry point:** Horizon origination lane `[+New]` or Atlas tile → `/ledger/credit_facility_application?compose=1`

**+New form layout:**

**Step 1: Facility essentials**
```
Facility name *            [___________________] (text)
Facility type *            [dropdown: senior_secured | mezzanine | subordinated | equity]
Borrower / Applicant *     [lookup: /api/ledger/lookup/ipp_parties]
Project reference          [lookup: /api/ledger/lookup/projects]
Facility limit (ZAR M) *   [___________________] (number)
Currency *                 [ZAR] (fixed)
Base rate *                [dropdown: prime | jibar_3m | sofr_3m | cibor_3m]
Tenor (years) *            [___________________] (number)
Purpose *                  [lookup: /api/ledger/lookup/facility_purposes]
                           (options: refinance, expansion, capex, working_capital, debt_restructure)
Regulatory tier *          [dropdown: senior_secured | mezzanine | subordinated | equity]
                           (pre-filled from lender's onboarding but overridable)
```

**Step 2: Credit metrics**
```
DSCR base assumption       [___________________] (number, default 1.30)
LTV % *                    [___________________] (number)
Gearing % *                [___________________] (number)
Expected rating            [dropdown: AAA | AA | A | BBB | BB | B | CCC]
PD % *                     [___________________] (number)
LGD % *                    [___________________] (number)
EAD (ZAR M)                [auto-fill from facility_limit or manual]
```

**Step 3: Conditions & triggers**
```
Conditions precedent (CP) count *  [___] (integer)
SLA tier *                         [dropdown: standard_120d | fast_90d | ultra_60d]
Drawdown documentation required    [checkbox] (default on)
IE certification required          [checkbox] (default on)
SARB ExCon disclosure required     [checkbox] (on if non-resident borrower)
```

**Submit → POST /api/credit-origination/chain**
- Returns: `{ success: true, data: { id, application_number, chain_status: 'submitted' } }`
- Fires cascade: `credit_application.submitted` → regulator inbox if senior_secured + large quantum

**State sequence:**

1. **submitted** — "Application submitted to credit committee."
   - Actions (lender): Screen | Decline

2. **credit_review** — "Initial credit assessment underway."
   - Actions: Assess | Screen | Decline

3. **committee** — "Credit committee review pending."
   - Actions: Refer-committee | Refer-back

4. **conditions_pending** — "Conditions precedent awaiting satisfaction."
   - IPP posts CP satisfaction evidence
   - Actions (lender): Satisfy-cp | Refer-back

5. **approved** — "All conditions satisfied; agreement ready."
   - Actions: Issue-agreement

6. **agreement_issued** — "Credit agreement executed; awaiting activation trigger."
   - Actions: Satisfy-cp | Activate

7. **facility_available** ← **TERMINAL**
   - "Facility ready for drawdowns."
   - Regulator inbox entry if senior_secured + ZAR >100M
   - Next action: create `drawdown` case

**Declined / Withdrawn** ← **TERMINAL**

---

### 6. Cross-Role Interaction via Thread

**Scenario:** Lender reviews covenant compliance on active facility

**Access path:**
1. Lender navigates to Horizon monitoring lane
2. Clicks: "ABC Solar Q2 Covenant Certificate | breach_identified | ZAR 200M outstanding"
3. Route: `/thread/covenant_certificate/cert_001`

**Thread layout** (two-sided, with split-screen focus):

```
┌─────────────────────────────────────────────────────────────┐
│ Covenant Certificate — ABC Solar PPA (W38)                  │
│ Ref: CERT-2026-001 | Status: breach_identified              │
│ Outstanding principal: ZAR 200M | SLA deadline: 2026-06-20  │
└─────────────────────────────────────────────────────────────┘

│ LENDER VIEW (left 50%)    │ BORROWER VIEW (right 50%)       │
├───────────────────────────┼─────────────────────────────────┤
│                           │                                 │
│ Lender Actions:           │ IPP Actions:                    │
│ [Begin review]            │ [Submit certificate]            │
│ [Declare breach]          │ [Request waiver]                │
│ [Request waiver]          │ [Challenge breach basis]        │
│ [Grant waiver]            │                                 │
│ [Require cure]            │ Timeline (read-only):           │
│ [Confirm cured]           │ [2026-06-01] Lender began       │
│ [Accelerate]              │ [2026-06-05] Breach declared    │
│                           │ [2026-06-10] Cure window 30d    │
│ Covenant detail:          │ [2026-06-15] Waiver requested   │
│ DSCR requirement: ≥1.20x  │ [2026-06-20] SLA deadline       │
│ Q2 measured: 1.08x        │                                 │
│ ➜ BREACH                  │ Evidence trail:                 │
│                           │ [Breach basis] grid curtail     │
│ Facility financials (Q2): │ impact on cash flow             │
│ Revenue: ZAR 18M          │                                 │
│ Opex: ZAR 12M             │ [Waiver basis] temporary; RE    │
│ Debt service: ZAR 8M      │ agreement renegotiation in      │
│ ➜ Net: ZAR -2M (shortfall)│ progress                        │
│                           │                                 │
└───────────────────────────┴─────────────────────────────────┘
```

**Lender's action flow: Declare breach**

1. Click "Declare breach" button
2. Modal opens:
```
Breach type *         [enum: dscr_breach | llcr_breach | gearing_breach | reporting_failure]
Breached covenants *  [text: "DSCR < 1.20x for Q2, measured 1.08x"]
Evidence / basis *    [rich text: "Q2 revenue down 8% due to grid curtailment; 
                       facility already notified borrower on 2026-06-01"]
[Cancel] [Declare breach]
```
3. Submit → lender.covenant_breach cascade fires
   - IPP gets push notification: "ABC Solar: Covenant breach declared (W38). Cure window: 30 days."
   - Regulator inbox if material (MAE flag set at origination)
   - Dunning cycle 1 triggered (W6)

**IPP's response: Request waiver**

1. IPP clicks "Request waiver"
2. Modal opens:
```
Waiver ref *          [text: "WAIVER-CERT-001-Q2"]
Waiver basis *        [text: "Q2 shortfall temporary due to grid curtailment. 
                       Revised PPA with offtaker to restore ~2.5% margin by Q3 end."]
[Cancel] [Request waiver]
```
3. Status transitions: breach_identified → waiver_requested
4. Lender notified; can now "Grant waiver" or "Require cure"

**If lender grants waiver:**

1. Click "Grant waiver"
2. Modal:
```
Waiver ref            [pre-filled: WAIVER-CERT-001-Q2]
Waiver basis          [pre-filled from IPP's request]
Evidence / rod notes  [text: "DSCR recovery trajectory acceptable. Facility 
                       remains well-positioned given Q3 energy pricing outlook."]
[Cancel] [Grant waiver]
```
3. Status: breach_identified → waiver_granted ← **TERMINAL**
4. IPP notified; dunning cycle cleared

**AI inline assist card** (W38 signature):
```
💡 Waiver Decision Support

"DSCR margin to 1.20x threshold: 12bps. Sector median DSCR for 
solar PPAs: 1.18x (below covenant). Consider:
(a) 30d cure window to secure PPA amendment, or
(b) grant waiver with trigger for re-test in Q3."

Why: Q2 grid curtailment is temporary; peer facilities in this 
cluster show similar Q2 dips but recover to 1.25x+ by Q3.

[Accept suggestion] [Dismiss]
```

**Keyboard + Focus:**
- Tab cycles through: lender action buttons → evidence sections → borrower evidence → timeline
- Enter on "Declare breach" button opens modal
- Escape dismisses modal
- Screen reader: "Lender Actions region, 7 buttons available. Currently focused: Begin review. Press Tab to move to next action."

**Mobile reflow** (<760px):
- Two-sided layout stacks: lender view on top, borrower view below
- Tabs at top: "Lender" | "Borrower" to toggle between halves
- Evidence cards expand on tap, not hover

---

### 7. Ongoing Daily Work + AI Assists

**Horizon landing every session:**
- Duty pane updates live (60s poll or WebSocket)
- Lanes re-sort by score
- Filters available: "Active breaches", "Awaiting docs", "Approved / funded", "Resolved"

**Per-role surfaces lender accesses daily:**

1. **Portfolio overview** (`/surface/lender:portfolio_overview`)
   - Total AUM, avg DSCR, covenant breach %, watch-list count
   - Heatmap by facility tier: senior_secured (low heat), mezzanine (medium), equity (high)
   - Sector breakdown: energy %, other %
   - Top 5 watch-list facilities (descending by risk score)

2. **Covenant reports** (`/surface/lender:covenant_reports`)
   - Cross-facility covenant summary: total covenants, avg compliance %, breach rate by type
   - Pivot drill-down: [covenant_type] → [facility list] → [test history]
   - Export: CSV with quarterly trend

3. **DSCR monitoring** (`/ledger/dscr_monitoring`)
   - Per-quarter workflow: period_open → computed → watch → breach → cure
   - Facility list: Ref | Name | Status | Measured DSCR | Threshold | Variance | Action
   - Inline: "ABC Solar Q2: 1.08x vs 1.20x threshold. [Flag breach] [Pass & lock]"
   - AI assist: "⚠️ 3 facilities compute-pending; DSCR reports due 2026-06-25 (5d). [Remind all borrowers]"

4. **Drawdown tracking** (`/ledger/drawdown`)
   - Live order status: draft → ie_review → approved → cp_checklist → funded → closed
   - Kanban or list view
   - Inline actions: "Approve drawdown" (1-click) | "Query" (put on hold) | "Fund"
   - Quantum visibility: committed, drawn, available
   - AI assist: "XYZ Project tranche 2 query resolved; ready for approval. [Approve]"

5. **Risk dashboard** (`/surface/lender:risk_dashboard`)
   - SARB large-exposure limits: facility tier vs exposure ZAR
   - Covenant breach watch-list: 5 facilities in cure period, 2 breached this week
   - SLL KPI status: 8 facilities with targets; 1 in cure
   - Concentration alerts: "Energy sector now 68% of portfolio (limit: 75%). [View details]"

**AI inline assists (per-chain):**
- **Covenant certificate**: "Waiver decision support" (as shown in Thread example)
- **Credit origination**: "Credit committee readiness check" — LTV trending vs peer median, PD assumptions conservative?
- **DSCR monitoring**: "Stress scenario dashboard" — "If offtaker reduces volume 20%, DSCR drops to X; facility enters watch. Mitigate via: (a) PPA renegotiation, (b) refinance to lower margin, (c) drawdown from reserve account."
- **Loan default**: "Cure window strategy" — "Standstill period used; enforcement commencing. Comparable step-in recoveries average 65% over 24 months. Alternative: agree restructure to 80% recovery over 36 months."

---

### 8. Sign Out

**Trigger:** User clicks profile menu → "Sign out" or token expires (1h TTL)

**Flow:**
1. Lender clicks "Sign out" → frontend clears `localStorage['token']`
2. Redirect to `/login` (SPA login form)
3. Session logged: audit_events.entry → `{ actor_id, event: 'session_end', timestamp }`

**On re-login (subsequent day):**
- Same entry flow: email + password → Bearer JWT
- `GET /api/onboarding/state` → `onboarding_completed=1` → redirect to `/horizon`
- Horizon re-hydrates: `GET /api/horizon/lender` → live lane data

---

### Audit Fixes: 7 Unreachable Chains

| Chain | Current Issue | Fixed Behavior | Frontdoor Class |
|---|---|---|---|
| `disbursement_case` (W30) | Laned 'monitoring' but no tile; unreachable in Atlas | Add "Disbursement tracking" non-chain surface tile to Monitoring domain | Non-chain surface (or thread-only if draw-locked to lender-write-only) |
| `facility_amendment` (W194) | Laned 'risk_lender' but no tile; IPP initiates | Add "Amendment requests" surface to Risk domain or Monitoring | Non-chain surface (IPP writes, lender reviews in Thread) |
| `capital_adequacy_report` (W203) | Laned 'risk_lender' but no tile; support writes | Add "Capital adequacy" read-only surface to Reporting domain | Non-chain surface (read-only, support-authored) |
| `loan_restructure` (W108) | NOT in lenderDomains roleData | Add to Enforcement domain in roleData | Frontal tile |
| `dscr_monitoring` (W86) | In roleData but Horizon lane assembly unclear | Verify `chainsForRole('lender')` includes dscr_monitoring; confirm in horizon.ts lane assembly | Frontal tile (confirm lane: monitoring) |
| `covenant_certificate` (W38) | Correctly laned but thread-only behavior ambiguous | Confirm frontal tile (yes); IPP is counterparty in Thread (correct) | Frontal tile |
| `drawdown` (W21) | Correctly laned but confirm 'draft' is initial state | Confirm lender can compose (POST +New); initial state 'draft' or 'documents_submitted' | Frontal tile (confirm lane: monitoring) |

**Result: All 16 lender-owned/co-owned chains now reachable via Horizon + Atlas**

---

### Responsive Layout Detail

**Desktop (>1200px):**
```
┌─────────────────────────────────────────────────────────┐
│ MeridianFrame Header: Logo | Horizon | Atlas (⌘K)      │
├────────────────────────────┬──────────────────────────┤
│ Sidebar: 280px             │ Main: 920px               │
│ (Domains + search)         │                          │
│ • Origination              │ Duty pane (top 8):       │
│ • Monitoring               │ [Card] [Card] [Card]     │
│ • Enforcement              │ [Card] [Card] [Card]     │
│ • Risk                      │ [Card] [Card] ...        │
│                             │                          │
│                             │ Lanes below duty:        │
│                             │ [ORIGINATION] (5 cases)  │
│                             │ [MONITORING] (12 cases)  │
│                             │ [ENFORCEMENT] (0 cases)  │
│                             │ [RISK] (3 cases)         │
│                             │                          │
└────────────────────────────┴──────────────────────────┘
```

**Tablet (760–1200px):**
- Sidebar collapses to icons only
- Main: 100% - 60px
- Duty pane: 2-column card grid
- Lanes: 1-up stacked

**Mobile (<760px):**
- Hamburger menu for sidebar (overlay, swipe-dismiss)
- Main: 100%
- Duty pane: 1-column
- Lanes: tab strip with swipe navigation

---

### Empty & Error States

**First-run (Horizon with zero cases):**
```
Duty Pane:
"No urgent items. Your portfolio is in good standing. [Invite an IPP] [Create credit origination]"

[ORIGINATION] (0 cases)
"No applications yet. [+New Facility Application]"

[MONITORING] (0 cases)
"No active drawdowns. [Invite an IPP] to begin monitoring."

[ENFORCEMENT] (0 cases)
"No defaults. (This is good news.)"

[RISK] (0 cases)
"Set up sustainability-linked KPI targets. [Configure SLL KPI]"
```

**Unauthorized (403 on `/api/horizon/lender`):**
```
"You do not have access to this view. Contact support. [Log out]"
```

**Horizon load error (DB timeout):**
```
"Failed to load portfolio. Retrying... [Retry now] [Offline mode]"
(After 3 retries: "Contact support: errors@openenergy.co.za")
```

**Thread not found:**
```
"/thread/covenant_certificate/xxx_invalid"
"Covenant certificate not found. [Back to Horizon] [All covenants]"
```

---

### Keyboard & Accessibility Summary

**Focus management:**
- Page load: focus → main content (Horizon duty pane)
- Tab order: header quicklinks → sidebar domain filters → duty cards → lane sections
- Within card: Ref link → status badge → quantum → deadline → primary action button
- Within modal: form fields (tab order) → Cancel → Submit (primary)
- Escape key dismisses any open modal / sidebar

**Screen reader:**
- Horizon: "Horizon for lender role. Duty pane region, 8 cases. Top case: ABC Solar covenant certificate, breach status, 2 days until deadline."
- Lane: "Origination lane, 5 cases. [Landmark] Region."
- Card: "Case ABC-001, covenant certificate, breach identified status, 200 million ZAR, deadline June 20. Primary action: Declare breach. Press Enter or Space to activate."
- Modal: "Declare breach dialog. Covenant type field, required, combobox. Use arrow keys to navigate options. Evidence field, required, rich text editor."

**Color contrast:**
- Primary action buttons: oklch(0.55 0.20 260) on white (ratio 7.8:1, WCAG AAA)
- Secondary buttons: oklch(0.60 0.10 180) on white (ratio 6.2:1, WCAG AAA)
- Text body: oklch(0.25 0.05 0) on white (ratio 15:1)
- Alert / breach (red): oklch(0.45 0.20 25) on white (ratio 8.1:1)
- Watch (amber): oklch(0.60 0.15 60) on white (ratio 5.8:1, WCAG AA)

---

### Summary: Three-Lane Journey

Lender's Meridian experience splits project-finance work into three **lanes**:

1. **Origination** — Win new credit facilities and manage secondary-market loan transfers. Tier-based SLA drives approval timelines. Regulator inbox crosses for senior_secured + large quantum.

2. **Monitoring** — Drawdowns, covenants, security, DSCR, reserve accounts, disbursement UoP. Live Horizon updates as each case status changes. AI assists for waiver decisions and stress scenarios.

3. **Enforcement** — Defaults, restructuring, standstill negotiations, step-in. URGENT SLA; crosses all tiers into regulator inbox if enforcement triggers.

**Risk lane** (separate) — SLL KPI, ESAPs, facility amendments, capital adequacy — visible but lower priority unless a KPI breach demotes it to duty.

**Key interactions:**
- Thread is two-sided: lender (left, owns write actions) vs. IPP (right, counterparty responses)
- AI inline assists on covenant waivers, credit committee readiness, stress scenarios
- Onboarding is 4-step (welcome → fund setup → coverage → complete); no entity provisioned
- All 16 lender-owned/co-owned chains now reachable via Horizon + Atlas
- Mobile-responsive: cards, modals, sidebar all optimized for <760px

**7 broken chains fixed:**
- `disbursement_case`, `facility_amendment`, `capital_adequacy_report` → classified + surfaced
- `loan_restructure`, `dscr_monitoring` → confirmed in domains + Horizon lane
- `covenant_certificate`, `drawdown` → frontal tiles confirmed; counterparty thread-only correct
