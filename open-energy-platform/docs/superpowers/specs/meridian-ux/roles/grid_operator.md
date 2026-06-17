## Role journey: grid_operator

### 1. Acquisition & First Login

**Acquisition flow**: Grid operator (NTCSA system operator) is invited by admin with email invitation link to `https://oe.vantax.co.za`. Email contains temporary credentials. Upon clicking, they land on the login page (`/login` or the SPA root redirects them there).

**Login screen state**:
- Form: `email` + `password` text inputs, remember-me checkbox (optional)
- Action: "Sign in" button (primary tone)
- Error state: if credentials fail, displays "Invalid email or password" and resets password field
- Rate limiting: 10 login attempts per IP / 5 minutes enforced at `/api/auth/login`; if exceeded, "Too many login attempts. Try again in 5 minutes." (no countdown shown)

**Post-login redirect**: `LaunchRedirect` checks `GET /api/onboarding/state`. For first-time grid_operator:
- `completed: false` → redirect to `/onboard?step=welcome`
- `skipped: true` → redirect to `/horizon` (returning user who skipped)
- `completed: true` → redirect to `/horizon`

---

### 2. Onboarding Wizard (First-Visit Only)

**Role**: grid_operator  
**Step sequence**: `['welcome', 'authority', 'services', 'complete']`

#### Step: `welcome`
**Screen layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Open Energy Platform                                  [⚙] [👤] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Welcome to Open Energy Platform                                 │
│  System Operator Portal                                          │
│                                                                   │
│  This portal provides NERSA Grid Code compliance, dispatch       │
│  nomina tions, ancillary-service activation, and real-time       │
│  grid-code monitoring for SA's system operator.                  │
│                                                                   │
│  You will:                                                        │
│  • Set your authority identity (NTCSA, regional operator)        │
│  • Configure grid services (dispatch, reserves, curtailment)     │
│  • Learn your Horizon workspace and regulatory inbox             │
│                                                                   │
│  ┌─────────────────────┐          ┌──────────────────────────┐  │
│  │ Skip onboarding     │          │ Start setup →            │  │
│  └─────────────────────┘          └──────────────────────────┘  │
│                                                                   │
│  Progress: ●○○○ (1 of 4 steps)                                  │
└─────────────────────────────────────────────────────────────────┘
```
**Copy**: "Welcome to Open Energy Platform — System Operator Portal."  
**Action**: "Start setup" advances to `authority` step. "Skip onboarding" triggers `POST /onboarding/skip`, marking role as `onboarding_skipped = 1`, and redirects to `/horizon`.

#### Step: `authority`
**Screen layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Authority & Registration                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  What is your grid operator authority?                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ National Transmission Company South Africa (NTCSA)         │ │
│  │ [  ] Regional Distribution Operator (RDO)                  │ │
│  │ [  ] Local Retailing Entity (LRE)                          │ │
│  │ [  ] Embedded-generation aggregator                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Your authority jurisdictions (checkboxes):                      │
│  [✓] Transmission (EHV/HV)                                       │
│  [ ] Distribution (MV/LV)                                        │
│  [ ] Embedded generation (RE < 10 MW)                            │
│                                                                   │
│  Service coverage area (text input):                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ E.g., "Eastern grid zone, nodes 1–15"                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────┐          ┌──────────────────────────┐  │
│  │ Back                │          │ Next: Services →         │  │
│  └─────────────────────┘          └──────────────────────────┘  │
│                                                                   │
│  Progress: ●●○○ (2 of 4)                                        │
└─────────────────────────────────────────────────────────────────┘
```
**Fields saved to `onboarding_data`**:
- `authority` (select): one of 'ntcsa', 'rdo', 'lre', 'aggregator'
- `jurisdictions` (array): subset of ['transmission', 'distribution', 'embedded_gen']
- `coverage_area` (string): free text

#### Step: `services`
**Screen layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Grid Services Configuration                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Which grid services do you operate?                             │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [✓] Dispatch & Nomination (BRP→SO)                         │ │
│  │ [✓] Ancillary Services (reserve activation, metering)      │ │
│  │ [ ] Demand Response                                        │ │
│  │ [ ] Load Curtailment (CSC-1 emergency)                     │ │
│  │ [ ] Black Start                                            │ │
│  │ [✓] Grid-Code Compliance Monitoring                        │ │
│  │ [ ] Interconnector Scheduling (SAPP)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Peak demand (MW) in your zone:                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 5000                                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────┐          ┌──────────────────────────┐  │
│  │ Back                │          │ Complete setup →         │  │
│  └─────────────────────┘          └──────────────────────────┘  │
│                                                                   │
│  Progress: ●●●○ (3 of 4)                                        │
└─────────────────────────────────────────────────────────────────┘
```
**Fields saved to `onboarding_data`**:
- `services` (array): subset of ['dispatch', 'ancillary', 'demand_response', 'curtailment', 'black_start', 'grid_code_compliance', 'interconnector']
- `peak_demand_mw` (number): installed capacity or peak zone capacity

#### Step: `complete`
**Screen layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Setup Complete                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ✓ System Operator registration complete                         │
│                                                                   │
│  Your Horizon workspace is ready. You can now:                   │
│                                                                   │
│  • View live dispatch nominations and reserve activations       │
│  • Monitor grid-code compliance across connected facilities     │
│  • Access your regulatory inbox for escalated matters           │
│  • File formal non-conformance notifications (NCRs)             │
│                                                                   │
│  First items waiting:                                            │
│  • Accept or reject the first dispatch nomination               │
│  • Review any pending grid-code non-conformances                │
│  • Configure SCADA connector (if available)                     │
│                                                                   │
│                             ┌──────────────────────┐             │
│                             │ Go to workspace →    │             │
│                             └──────────────────────┘             │
│                                                                   │
│  Progress: ●●●● (4 of 4)                                        │
└─────────────────────────────────────────────────────────────────┘
```
**Action**: "Go to workspace" calls `POST /onboarding/complete`, fires cascade `onboarding.completed`, then redirects to `/horizon`.

**Onboarding provisioning result** (from `cascade-rules/onboarding-provisioning.ts`):
- grid_operator role is NOT esums_owner nor ipp_developer → **no entity created** (`kind: 'none'`)
- Logged to `oe_onboarding_provisioning_log` with `kind='none'`
- AUDIT FINDING FIXED: Previous versions created no entities for grid_operator; now onboarding state is logged for audit.

---

### 3. Landing on Horizon

**URL**: `/horizon` (auto-navigated post-onboarding or post-login for returning users)

**Endpoint**: `GET /api/horizon/grid_operator` returns:
```json
{
  "success": true,
  "data": {
    "lanes": [
      {
        "key": "operations_grid",
        "cases": [
          { "chain": "oe_dispatch_nominations", "id": "nom_001", "ref": "001", "title": "DA 2026-06-17 15:00", "status": "submitted", "bucket": "breached", "score": 18.5, ... },
          { "chain": "reserve_activation", "id": "rsv_002", "ref": "002", "title": "Primary reserve 10min", "status": "activated", "bucket": "ontime", "score": 8.2, ... }
        ]
      },
      {
        "key": "connections",
        "cases": [
          { "chain": "gca_connection", "id": "gca_101", "ref": "C-2026-042", "title": "Eastern Wind Farm GCA", "status": "technical_evaluation", "bucket": "ontime", "score": 5.1, ... },
          { "chain": "connection_energization", "id": "coe_202", "ref": "E-2026-015", "status": "energization_authorized", "bucket": "warning", "score": 12.3, ... }
        ]
      },
      {
        "key": "compliance_grid",
        "cases": [
          { "chain": "grid_code_compliance", "id": "gcc_003", "ref": "NC-2026-0156", "status": "investigation", "bucket": "warning", "score": 11.2, ... }
        ]
      }
    ],
    "duty": [ /* top 8 by attention score */ ],
    "counts": { "total": 47, "breached": 3 }
  }
}
```

**MeridianFrame layout** (wrapper chrome for all authed pages):
```
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐                                      [⚙] [👤] │
│  │ [OE] Horizon │  ⌘K                          [Breadcrumb trail]│
│  └──────────────┘                                                │
├──────────────────┬──────────────────────────────────────────────┤
│ ◈ Operations     │ OPERATIONS GRID (23 live)                    │
│   ├─ Dispatch    │ ┌─────────────────────────────────────────┐ │
│   │  (9)         │ │ [ICON] Dispatch nomination 001          │ │
│   ├─ Reserves    │ │ DA 2026-06-17 15:00                     │ │
│   │  (8)         │ │ Status: Submitted  ◆ Breached (18.5 pts)│ │
│   ├─ Demand resp │ │ Next SLA: NOW (5h overdue)              │ │
│   │  (0)         │ │ Accept | Reject | ⋮                     │ │
│   ├─ Curtailment │ └─────────────────────────────────────────┘ │
│   │  (0)         │ ┌─────────────────────────────────────────┐ │
│   ├─ Planned out │ │ [ICON] Reserve activation rsv_002       │ │
│   │  (6)         │ │ Primary reserve 10min                   │ │
│   │              │ │ Status: Activated  ◆ On-time (8.2 pts)  │ │
│ ⬡ Connections    │ │ Next SLA: 2026-06-17 18:00              │ │
│   ├─ GCA         │ │ Begin ramp | ⋮                          │ │
│   │  (2)         │ └─────────────────────────────────────────┘ │
│   ├─ REZ alloc   │ [Load more cases] or [View all in lane]      │
│   │  (1)         │                                               │
│   ├─ Connection  │ CONNECTIONS (3 live)                         │
│   │  energy      │ ┌─────────────────────────────────────────┐ │
│   │  (1)         │ │ [ICON] GCA connection gca_101           │ │
│ ⬓ Compliance     │ │ Eastern Wind Farm GCA (C-2026-042)      │ │
│   ├─ Grid-code   │ │ Status: Technical evaluation  ◆ OK      │ │
│   │  compliance  │ │ Deadline: 2026-06-22 17:00              │ │
│   │  (3)         │ │ Request studies | Begin studies | ⋮     │ │
│   ├─ Smart meter │ └─────────────────────────────────────────┘ │
│   │  asset       │ ┌─────────────────────────────────────────┐ │
│   │  (2)         │ │ [ICON] Connection energization coe_202  │ │
│   ├─ Substation  │ │ (E-2026-015)                            │ │
│   │  asset       │ │ Status: Energization authorized ⚠ 12.3  │ │
│   │  (0)         │ │ Deadline: 2026-06-17 22:00              │ │
│              … │ │ Conduct inspection | ⋮                  │ │
│              … │ └─────────────────────────────────────────┘ │
│                  │                                               │
│                  │ COMPLIANCE (6 live)                          │
│                  │ ┌─────────────────────────────────────────┐ │
│                  │ │ [ICON] Grid-code compliance gcc_003     │ │
│                  │ │ NRS 097 voltage breach — Eastern zone   │ │
│                  │ │ Status: Investigation  ⚠ 11.2 pts       │ │
│                  │ │ Deadline: 2026-06-19 09:00              │ │
│                  │ │ Begin assessment | Require CAP | ⋮      │ │
│                  │ └─────────────────────────────────────────┘ │
│                  │ [Load more]                                  │
└──────────────────┴──────────────────────────────────────────────┘
```

**Horizon lanes for grid_operator** (from `chainsForRole('grid_operator')` in chain-registry-meridian.ts):
1. **operations_grid** (13 chains):
   - `oe_dispatch_nominations` (W13)
   - `reserve_activation` (W50)
   - `demand_response_event` (W205)
   - `eop_activation` (W215)
   - `load_curtailment` (W34)
   - `planned_outage` (W18)
   - `imbalance_settlement`
   - `transmission_outage` (W110)
   - `work_order` (W16) — shared with support
   - `supply_request` — shared with esco
   - `demand_response_event` (cross-listed)
   - `interconnector_schedule` (W234)
   - + others

2. **connections** (3 chains):
   - `gca_connection` (W28) — NERSA Grid Code C-1 connection agreement
   - `connection_energization` (W75) — physical go-live commissioning
   - `rez_capacity` (W58) — NTCSA 2024 capacity rules queue

3. **compliance_grid** (6 chains):
   - `grid_code_compliance` (W67) — NRS 097 monitoring
   - `smart_meter_asset` (W199)
   - `substation_asset` (W211)
   - `availability_guarantee` (W51)
   - `market_conduct_exam` (W220)
   - `gcc_ncr` — formal non-conformance notifications

**Empty state** (first login, no live cases):
```
┌──────────────────────────────────────────────────────────────┐
│ OPERATIONS GRID                                             │
│                                                              │
│  [⚠ circle]                                                 │
│  No active cases yet.                                       │
│                                                              │
│  When dispatch nominations arrive or reserve orders are    │
│  activated, they will appear here sorted by deadline.      │
│                                                              │
│  To practice:                                              │
│  • Open Atlas (⌘K) and create a demo dispatch nomination   │
│  • Or contact your system administrator                    │
│                                                              │
│  [← Back to Horizon] [Browse all chains →]                 │
└──────────────────────────────────────────────────────────────┘
```

**Keyboard + focus behavior**:
- ⌘K opens Atlas (Command Palette) from anywhere
- Tab cycles through case cards; Enter opens the card's Thread
- Esc closes any open modals
- Arrow keys scroll lane list (if long)
- Focus trap: contained within the currently-visible lane scrollable region until explicit nav

**Responsive < 760px**:
- Left sidebar collapses to icon bar (lane icons only, tooltips on hover)
- Case cards stack full-width in central area
- Action buttons reflow to 2-per-row or stack vertically
- Bottom sheet for lane legend (swipe up to reveal)

**Accessibility**:
- `role="main"` on center panel
- Each lane has `role="region" aria-label="Grid operations lane"`
- Case cards: `role="article"` with `aria-describedby="status_badge breach_score"`
- Status badges use `aria-label` (e.g., "Breached, 18 points")
- Breach indicators use `role="img" aria-label="Breach indicator"`
- Link copy is descriptive: "Accept dispatch nomination 001" not "Click here"
- Color not sole indicator; status text + icon + aria-label required

**WCAG AA compliance fixes** (from audit):
- Secondary text (deadline labels) upgraded from --ink3 to --ink2 for ≥4.5:1 contrast
- All buttons have visible focus outline (2px solid oklch)
- Modals have `aria-modal="true"` + focus trap + inert backdrop
- No bare `role="button"` on divs; all interactive elements are `<button>` or `<a>`

**AI inline assists**:
- If a dispatch case is breached and the SO has not acted in 4h, an "AI Insight" card appears above the case:
  ```
  [💡 Insight]
  "This nomination is 4+ hours overdue. Grid stability may be at risk.
  Recommended action: Accept and activate immediately to begin dispatch.
  [Accept now] [Dismiss]"
  ```
  - Clicking "Accept now" calls `POST /api/grid/dispatch-nominations/:id/accept` with `ai_suggested: true` logged to cascade
  - Clicking "Dismiss" hides the card for this session

---

### 4. Discovering Functions in Atlas

**URL**: `/atlas` or triggered by ⌘K / "⌘K" header button

**Screen layout**:
```
┌────────────────────────────────────────────────────────────────┐
│ ⌘ Atlas — Function Library                         [🔍] [🔤] [✕]│
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Search: "dispatch" ______________________________]              │
│                                                                  │
│  GRID OPERATIONS (13 functions)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ◈ Dispatch nominations                                  │   │
│  │   BRP→SO 10-state dispatch chain (W13)                  │   │
│  │   [1-min read] [8 cases live] [→ Horizon] [+ New]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ◈ Ancillary services                                    │   │
│  │   NTCSA reserve activation settlement (W50)             │   │
│  │   [2-min read] [3 cases live] [→ Horizon] [+ New]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ◈ Load curtailment                                      │   │
│  │   NERSA §CSC-1 urgent curtailment (W34)                 │   │
│  │   [1-min read] [0 cases live] [→ Horizon] [+ New]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ◈ Demand response                                       │   │
│  │   DR programme activation, metering & settlement (W205) │   │
│  │   [3-min read] [0 cases live] [→ Horizon] [+ New]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ◈ EOP activations                                       │   │
│  │   Emergency Operations Plan activation (W215)           │   │
│  │   [2-min read] [1 case live] [→ Horizon] [+ New]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  CONNECTION QUEUE (3 functions)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⬡ Connection agreements                                │   │
│  │   NERSA Grid Code C-1 GCA chain (W28)                   │   │
│  │   [4-min read] [2 cases live] [→ Connections] [+ New]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⬡ REZ capacity allocation                               │   │
│  │   NTCSA 2024 capacity rules queue (W58)                 │   │
│  │   [3-min read] [1 case live] [→ Connections] [+ New]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⬡ Connection energization                               │   │
│  │   Physical go-live COD commissioning (W75)              │   │
│  │   [2-min read] [1 case live] [→ Connections] [+ New]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  COMPLIANCE (6 functions)                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⬓ Grid-code compliance                                  │   │
│  │   NRS 097 non-conformance monitoring (W67)              │   │
│  │   [2-min read] [3 cases live] [→ Compliance] [+ New]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⬓ Smart-meter assets                                    │   │
│  │   Smart-meter asset commissioning (W199)                │   │
│  │   [3-min read] [2 cases live] [→ Compliance] [+ New]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ... [2 more]                                                   │
│                                                                  │
│  [Show all 22 functions]                                        │
└────────────────────────────────────────────────────────────────┘
```

**Atlas features for grid_operator**:
- **22 functions** across 3 domains (operations_grid, connections, compliance_grid)
- Each tile is a **TILE** frontdoor (grid_operator is the primary actor, can initiate + see incoming cases)
- **NO dossier-grouped tiles** — all 22 are flat tiles
- **NO thread-only invisible chains** — all chains grid_operator touches have tiles or are explicitly thread-reachable via counterparties

**Clicking a tile**:
- "→ Horizon" link: jumps to `/horizon`, scrolls to the lane, filters to cases on that chain
- "+ New" link: jumps to `/ledger/:chainKey?compose=1`, opens the +New modal (if the role can initiate on that chain)
- Case-count badge: jumps to `/ledger/:chainKey` (read-only list if role has no write access)

**Unreachable/hidden chains per audit**:
- **wheeling_access** (W219) — grid_operator is NOT listed in lanes; only offtaker can initiate
- **unserved_energy_claim** — same; only offtaker initiate
- **transmission_outage** — grid_operator's lane is in `operations_grid`, but only 1 case live; properly surfaced
- **interconnector_schedule** — proper lane coverage
- **imbalance_settlement** — listed but largely read-only for regulatory inbox

**FIXED in this UX**: All 5 previously-unreachable chains are now either:
1. Properly surfaced in Horizon if grid_operator has a role (transmission_outage, interconnector_schedule, imbalance_settlement)
2. Explicitly documented as thread-only if grid_operator is counterparty (wheeling_access, unserved_energy_claim — reachable only when offtaker pushes a case via cascade, visible in Thread side-panel)

---

### 5. Initiating Primary Transaction: Dispatch Nomination

**Chain**: `oe_dispatch_nominations` (W13)  
**Frontdoor**: TILE in operations_grid domain; grid_operator can initiate ONLY via admin seed-data or via inbound cascade (BRP→SO nomination)

**In practice**, grid_operator does NOT initiate dispatch nominations; a Trader (BRP) submits them. However, the UX for grid_operator's primary actions on a live nomination is:

**URL**: `/ledger/oe_dispatch_nominations/:id` or `/thread/oe_dispatch_nominations/:id`

**Thread screen** (two-sided case detail):
```
┌────────────────────────────────────────────────────────────────────┐
│ ◄ Back to Horizon                                                  │
├────────────────────┬─────────────────────────────────────────────┤
│ GRID OPERATOR      │ DISPATCH NOMINATION 001 (W13)              │
│ [SO avatar]        │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ System Operator    │                                              │
│                    │ Trading Day: 2026-06-17                     │
│ Counterparty:      │ Status: SUBMITTED ⚠ Breached (5h overdue)  │
│ Trader / BRP       │ Deadline: NOW (SLA: 15 min to ACK)          │
│ [Trader avatar]    │                                              │
│ Trading Company    │ ┌──────────────────────────────────────────┐│
│                    │ │ Schedule (MWh):           150             ││
│                    │ │ Nominated by:     ABC Energy Trading     ││
│                    │ │ Delivery window:  15:00–16:00 SAST       ││
│                    │ │ Energy type:      Renewable              ││
│                    │ │ Imbalance risk:   ±8 MWh forecast       ││
│                    │ │ Next SLA due:     2026-06-17 15:15       ││
│                    │ └──────────────────────────────────────────┘│
│                    │                                              │
│                    │ AI Insight (optional, if breached):         │
│                    │ ┌──────────────────────────────────────────┐│
│                    │ │ 💡 Grid imbalance risk detected.         ││
│                    │ │ This dispatch is overdue for acceptance. ││
│                    │ │ Recommend: Accept immediately to begin   ││
│                    │ │ dispatch and start metering.             ││
│                    │ │ [Accept Now] [Learn more] [Dismiss]      ││
│                    │ └──────────────────────────────────────────┘│
│                    │                                              │
│                    │ ACTIONS (color-coded by tone):              │
│                    │ [Accept nomination] [Reject] [More ⋮]       │
│                    │                                              │
│                    │ History & audit trail:                      │
│                    │ 2026-06-17 14:55  Trader ABC nominated    │
│                    │                   150 MWh (automation)     │
│                    │ 2026-06-17 14:56  System detected         │
│                    │                   imbalance risk ±8 MWh    │
│                    │ 2026-06-17 15:10  [No action yet]         │
│                    │                                              │
│                    │ [Show full event log]                       │
└────────────────────┴────────────────────────────────────────────┘
```

**Grid operator's actions on nominated dispatch** (from MERIDIAN_CHAINS):
1. **accept** — "Accept nomination"
   - Path: `POST /api/grid/dispatch-nominations/:id/accept`
   - Roles: admin, support, grid, grid_operator
   - Effect: advances to `accepted` status; pre-gate-closure activation clock starts (15 min ACK window)
   - Fields: none
   - Tone: primary

2. **reject** — "Reject nomination"
   - Path: `POST /api/grid/dispatch-nominations/:id/reject`
   - Roles: admin, support, grid, grid_operator
   - Fields:
     - `reason` (string, required): "Grounds for rejecting the nomination"
     - Placeholder: "Insufficient transmission capacity" or "Conflicting outage window"
   - Effect: closes chain to `nomination_rejected` (terminal); cascades to regulator inbox
   - Tone: oxide (warning/negative)

3. **activate** — "Activate dispatch" (only available after acceptance)
   - Path: `POST /api/grid/dispatch-nominations/:id/activate`
   - Roles: admin, support, grid, grid_operator
   - Fields: none
   - Effect: advances to `activated`; 60-minute performance-recording clock starts
   - Tone: primary

4. **record-performance** — "Record performance" (only after activation)
   - Path: `POST /api/grid/dispatch-nominations/:id/record-performance`
   - Roles: admin, support, grid, grid_operator
   - Fields:
     - `actual_mwh` (number, required, unit='MWh'): "Actual delivered" — e.g., 148
     - `notes` (string): "Performance note" — e.g., "Wind farm site 1 trip at 15:42, recovered by 15:58"
   - Effect: advances to `performance_recorded`; computes imbalance vs schedule; arms 5-day settlement SLA
   - Tone: primary

5. **settle** — "Settle imbalance"
   - Path: `POST /api/grid/dispatch-nominations/:id/settle`
   - Roles: admin, support, grid, grid_operator
   - Fields:
     - `charge_zar` (number, unit='ZAR'): "Imbalance charge" — e.g., 1250.75 for 2-MWh over-delivery at VWAP+5%
     - `notes` (string): "Settlement note" — e.g., "2 MWh over-delivery; charged at VWAP + balancing reserve uplift"
   - Effect: advances to `settled`; 15-day dispute window opens
   - Tone: primary

6. **close** — "Close out"
   - Path: `POST /api/grid/dispatch-nominations/:id/close`
   - Roles: admin, support, grid, grid_operator
   - Effect: advances to `closed` (terminal); fired after 15-day dispute window with no disputes raised
   - Tone: default

7. **raise-dispute** — "Raise dispute" (if dispute detected post-settlement)
   - Path: `POST /api/grid/dispatch-nominations/:id/raise-dispute`
   - Roles: admin, support, ipp, ipp_developer, trader (Trader/BRP raises the dispute, not SO)
   - Fields:
     - `reason` (string, required): "Dispute reason" — e.g., "Settlement charge incorrect; our actual delivery was 149 MWh, not 148"
   - Effect: advances to `disputed`; 10-day dispute-resolution SLA arms
   - Tone: oxide

**Filters** (in /ledger/:chainKey):
- Awaiting SO: statuses=['nominated', 'accepted']
- In delivery: statuses=['activated', 'performance_recorded']
- Settled: statuses=['settled']
- Disputed: statuses=['disputed', 'dispute_resolved']
- Resolved: statuses=['closed', 'nomination_rejected', 'closed_disputed']

**KPIs on ledger**:
- Total nominations: count
- Breached: count with deadline past SLA
- Imbalance charge (ZAR): sum of all charge_zar across settled cases

**+New modal** (POST /api/grid/dispatch-nominations via form):
```
┌──────────────────────────────────────────────────────┐
│ New Dispatch Nomination                          [✕] │
├──────────────────────────────────────────────────────┤
│                                                       │
│ Trading day (date):                                  │
│ ┌────────────────────────────────────────────────┐  │
│ │ 2026-06-17                    [📅 pick]        │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ Delivery window (time range):                        │
│ From: ┌──────────┐  To: ┌──────────┐               │
│       │ 15:00    │      │ 16:00    │               │
│       └──────────┘      └──────────┘               │
│                                                       │
│ Nominated energy (MWh):                              │
│ ┌────────────────────────────────────────────────┐  │
│ │ 150                                            │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ Energy type (dropdown):                              │
│ ┌────────────────────────────────────────────────┐  │
│ │ ▼ Select...                                    │  │
│   • Renewable                                       │
│   • Wind                                            │
│   • Solar PV                                        │
│   • Hydro                                           │
│   • Conventional                                    │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ Nominated by (lookup):                               │
│ ┌────────────────────────────────────────────────┐  │
│ │ ▼ ABC Energy Trading (TRADER_001)              │  │
│   → Fetched from /api/ledger/lookup/trader_orgs   │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ Imbalance tolerance (MWh, optional):                 │
│ ┌────────────────────────────────────────────────┐  │
│ │ ±10                                            │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ Notes (optional):                                    │
│ ┌────────────────────────────────────────────────┐  │
│ │ Wind farm primary, site 2 maintenance 14:30   │  │
│ │                                                │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ ┌─────────────┐        ┌──────────────────────────┐ │
│ │ Cancel      │        │ Create nomination        │ │
│ └─────────────┘        └──────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Lookups** (static whitelist):
- `trader_orgs`: GET `/api/ledger/lookup/trader_orgs` returns { id, name, trader_id, status }
- `energy_types`: hardcoded dropdown from MERIDIAN_CHAINS field definition

**Form validation**:
- `trading_day`: required, not in past, not >7 days ahead
- `delivery_window`: from < to, both within trading day
- `nominated_mwh`: required, >0, ≤ max capacity per facility
- `energy_type`: required, from enum ['renewable', 'wind', 'solar_pv', 'hydro', 'conventional']
- `nominated_by`: required, lookup must resolve to active Trader
- `imbalance_tolerance`: optional, if provided must be ≥0, ≤nominal±20%

**Error states**:
- "Trader not found" if lookup fails
- "Delivery window outside trading hours" if 22:00–06:00
- "Oversubscription: capacity available is 100 MWh, requested 150 MWh" if exceeds limit
- "Trading day is locked" if settlement for that day has started

**Success state**:
- Modal closes; new case appears in ledger list with status='nominated'
- Trader is notified via cascade (push action queued)
- Toast: "Dispatch nomination created (001). Awaiting trader acknowledgement."

---

### 6. Cross-Role Interaction via Thread

**Scenario**: Trader (BRP) submits a dispatch nomination. Grid operator (SO) receives it in Horizon, and two-sided Thread dialog opens.

**Initial state** (Trader's side):
- Trader initiated the nomination in their workstation
- They see status='nominated' with a waiting icon ("Awaiting SO acknowledgement")
- Can cancel before SO accepts (within 15 min ACK window)

**Grid operator's side** (SO receiving the nomination):
- Case appears in `operations_grid` lane with status='submitted' (external naming from Trader's perspective)
- Clicks case → opens `/thread/oe_dispatch_nominations/nom_001`
- Sees both sides of the transaction

**Thread layout** (left = SO, right = Trader):
```
┌────────────────────────────────────────────────────────────────┐
│ ◄ Back to Horizon                                              │
├────────────────────────┬─────────────────────────────────────┤
│ SYSTEM OPERATOR (you)  │ DISPATCH NOMINATION 001           │
│ [SO avatar]            │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ NTCSA SO               │ Trading Day: 2026-06-17           │
│                        │ Status: NOMINATED (Awaiting SO)   │
│ Counterparty:          │ SLA: 15 min to ACK                │
│ ABC Energy Trading     │ ⚠ NOW (5 minutes overdue)        │
│ [Trader avatar]        │                                    │
│ Trader BRP             │ Schedule: 150 MWh / 15:00–16:00   │
│                        │                                    │
│ ┌───────────────────┐  │ SO ACTIONS:                        │
│ │ SO's view:        │  │ ┌─────────────────────────────┐  │
│ │ [Placeholder for  │  │ │ [Accept] [Reject ⋮]         │  │
│ │  technical panel  │  │ └─────────────────────────────┘  │
│ │  showing real-time│  │                                    │
│ │  grid telemetry,  │  │ TRADER'S VIEW (read-only):       │
│ │  capacity,        │  │ ┌─────────────────────────────┐  │
│ │  demand curve]    │  │ │ Schedule: 150 MWh          │  │
│ │                   │  │ │ Window: 15:00–16:00 SAST   │  │
│ │                   │  │ │ Facility: Eastern Wind A-2  │  │
│ │                   │  │ │ Status: Pending SO review   │  │
│ │                   │  │ │ Tolerance: ±8 MWh          │  │
│ │ AUDIT TRAIL:      │  │ │                             │  │
│ │ 14:55 Trader ABC  │  │ │ Trader notes:               │  │
│ │      nominated    │  │ │ "Primary dispatch"          │  │
│ │ 14:56 Sys detect  │  │ │ [View full event log]       │  │
│ │      imbalance    │  │ └─────────────────────────────┘  │
│ │                   │  │                                    │
│ │ [Show all events] │  │ CROSS-CHAIN IMPACTS:              │
│ │                   │  │ • If accepted: feeds reserve      │
│ │                   │  │   activation metering (W50)       │
│ │                   │  │ • If rejected: escalates to       │
│ │                   │  │   regulator inbox (W31)           │
│ └───────────────────┘  │                                    │
│                        │ [Full case details]                │
└────────────────────────┴────────────────────────────────────┘
```

**Cross-role visibility**:
- SO sees the nomination as submitted by Trader
- Trader sees the nomination as awaiting SO review (read-only from their side until SO acts)
- When SO clicks "Accept", Trader is notified via cascade (push action queued); their view updates to status='accepted'
- When SO clicks "Activate", Trader's view updates to status='activated'; Trader can now see the delivery window

**Thread-only (non-initiation) chains**:
- `wheeling_access`: offtaker initiates, SO is counterparty (reads only in Thread)
- `unserved_energy_claim`: offtaker initiates, grid_operator reads in Thread, regulator settles

**Cascade integration**:
- When SO accepts nomination, `fireCascade({ event: 'dispatch.accepted', actor_id: so_id, entity_type: 'dispatch_nomination', entity_id: nom_id })` fires
- Cascade rules:
  - Push action to Trader's inbox: "Nomination 001 accepted by SO — activation window now 60 minutes"
  - Potentially trigger reserve-activation rule if linked to ancillary service
  - Log to audit chain

---

### 7. Ongoing Daily Work + AI Inline Assists

**Primary workstation**: `/horizon` (refreshes every 60 seconds; real-time streaming via WebSocket planned for W300+)

**Daily workflow** for grid_operator:

08:00 — Morning standup
- SO opens Horizon
- Sees 3 breached cases in operations_grid
- AI Insight: "3 cases overdue. Grid imbalance at 2-hour peak window. Recommend reviewing curtailment reserve availability."
- Clicks case 1 (dispatch nomination): accepts, activates
- Clicks case 2 (reserve activation): acknowledges, confirms sustaining (SO responds to dynamic reserve call)
- Clicks case 3 (load curtailment): reviews demand profile; declines activation (demand lower than forecast)

15:00 — Real-time dispatch
- Trader submits new dispatch nomination
- Case appears in Horizon with status='submitted', score=18.5 (high attention)
- SO receives push notification: "New dispatch nomination 042 — 200 MWh, 15:15–16:15"
- SO clicks to open Thread
- Checks real-time capacity via SCADA connector (not shown in UX, but backend polls `/api/scada/facility/east_wind_a2/live`)
- Determines: capacity available, no grid-code violations
- Clicks "Accept nomination" → status='accepted'
- 2 minutes later, clicks "Activate dispatch" → status='activated'
- Dispatch begins; SO monitors live SCADA telemetry (shown in a real-time panel, not detailed here)
- 60 minutes later, clicks "Record performance": enters actual_mwh=198 (2 MWh under-delivery due to wind speed drop), notes="Wind ramp-down post-15:45"
- Status='performance_recorded'; imbalance computed as -2 MWh × VWAP €75/MWh = -€150 credit to Trader
- 5 days later, SO settles: clicks "Settle imbalance", charge_zar=0 (credit side), status='settled'
- 15 days later (dispute window closed), SO clicks "Close out" → status='closed' (terminal)

16:30 — Grid-code compliance issue detected
- AI Insight card appears in compliance_grid lane: "⚠ NRS 097 voltage deviation detected at node 3. Eastern zone voltage dipped to 0.92 pu (limit 0.95 pu). Non-conformance indicator raised."
- SO clicks the grid_code_compliance case
- Reviews the 5-minute waveform data (SCADA telemetry visualization)
- Clicks "Raise non-conformance": fields auto-populate:
  - Raise basis: "Transient voltage dip following sudden load loss"
  - NC ref: auto-generated (gcc_nc_20260617_001)
  - Parameter: "Voltage (pu)"
  - Measured value: 0.92
  - Limit value: 0.95
  - Code reference: "NRS 097 section 4.2.1"
- Status='non_conformance_raised'; cascades to regulator inbox (Regulator is pushed: "Grid non-conformance #001 filed — Eastern zone voltage dip")

17:00 — Compliance monitoring
- SO opens compliance_grid lane
- Reviews grid_code_compliance cases
- Sees one case in status='investigation' (from earlier session)
- Clicks "Begin assessment": fields:
  - Assessment basis: "RMS voltage analysis over 10-cycle window"
  - Assessment ref: "GCA_ASSESS_20260617"
- Status='under_assessment'

18:00 — Connection queue follow-up
- SO opens connections lane
- Sees GCA connection in status='technical_evaluation'
- New hire Trader filed an RFP for a 50 MW wind farm. SO's team needs to:
  1. Request interconnection studies from NTCSA grid planning (behind-the-scenes handoff, not shown in UX)
  2. Issue a cost estimate for TPA charges
- SO clicks "Issue cost estimate": fields:
  - cost_estimate_zar: 250000 (study + feasibility assessment)
  - gia_ref: "GIA_2026_042"
- Status='cost_estimate_issued'; Trader (IPP) is pushed: "Grid connection C-2026-042: cost estimate R250k issued"

20:00 — Regulatory reporting
- SO opens compliance_grid → levy_compliance view (read-only list of NERSA levy assessments)
- Sees annual levy invoice from Regulator: R 12.5M
- Reviews breakdown by zone (network support charges, balancing services, admin fees)
- Clicks case → audit trail shows Regulator's calculation
- No action needed (SO is payer, not adjudicator); Regulator owns the chain

22:00 — End-of-day summary
- SO opens Horizon → duty (top 8 cases by attention score)
- Sees: all live dispatch nominations settled or closed
- Sees: 2 grid-code compliance cases under remediation (SLA: 10 days from raise)
- Sees: 1 connection case awaiting applicant response to cost estimate
- No breached cases
- AI Insight: "✓ Grid operations normal. No breached SLAs today. 8 dispatch nominations settled, 0 disputes raised."
- SO closes browser

**AI inline assists throughout day**:
1. **Dispatch case breached** (overdue >4h):
   - Card: "This nomination is overdue. Grid stability at risk. [Accept now]"
   - Clicking: logs `ai_suggested: true` to cascade

2. **Grid-code non-conformance detected**:
   - Card: "NRS 097 voltage breach detected. Recommend: Begin assessment immediately. [Learn more] [Begin assessment]"

3. **Connection case pending >5 days**:
   - Card: "GCA cost estimate issued 5 days ago. No applicant response. Recommend: Send reminder to Trader. [Send reminder now]"

4. **Demand response program ends soon**:
   - Card: "Demand response program ends in 2 days. Activate final DR event? [View program] [Activate]"

5. **Top 8 ranking**:
   - Each duty card shows: "Score 18.5 (breach +10, quantum +5, deadline weight +3.5)"
   - SO can click to understand why a case is ranked high

**Keyboard shortcuts**:
- `a` — Accept current case
- `r` — Reject current case
- `s` — Settle current case
- `c` — Close current case
- `⌘k` — Open Atlas
- `?` — Show help overlay with all shortcuts

**Sign out**:
- URL: `/api/auth/logout` (POST)
- Clears `localStorage['token']`
- Redirects to `/login`
- Browser back-button: does not re-auth (403 on next API call)

---

### 8. Empty / First-Run States & Pain Point Fixes

**First login, no live cases** (Horizon):
```
┌──────────────────────────────────────────────────────┐
│ OPERATIONS GRID                                      │
│                                                      │
│  ⚠ No active cases yet                              │
│                                                      │
│  Dispatch nominations and reserves will appear here │
│  once traders begin submitting for your zone.       │
│                                                      │
│  To practice or seed demo data:                     │
│  • Open Atlas (⌘K) and create a dispatch nomination│
│  • Or ask your administrator to seed test data      │
│                                                      │
│  [← Back] [Browse all chains →] [Atlas ⌘K]         │
│                                                      │
│  Learn: [Grid operations quickstart] [Video demo]   │
└──────────────────────────────────────────────────────┘
```

**Empty filtered view** (no cases match "failed" filter):
```
┌──────────────────────────────────────────────────────┐
│ Resolved (0 cases)                                   │
│                                                      │
│  ✓ No resolved cases today                          │
│                                                      │
│  When dispatch nominations close or connections are │
│  terminated, they will appear here.                 │
│                                                      │
│  [Clear filter] [View all cases]                    │
└──────────────────────────────────────────────────────┘
```

**AUDIT PAIN POINTS FIXED**:

1. **5 unreachable chains** (wheeling_access, unserved_energy_claim, & 3 others):
   - ✅ All now have proper lane assignments or thread-only paths
   - ✅ Atlas shows all 22 tiles; clicking "+New" only allows initiation if role has write access
   - ✅ Counterparty cases (wheeling_access, unserved_energy_claim) are thread-reachable via cascade notification

2. **40 Atlas tiles with empty bodies**:
   - ✅ All 22 grid_operator tiles now resolve to either `/ledger/:chainKey` or `/surface/:key` with working components
   - ✅ No 404s on click

3. **39 dangling tiles**:
   - ✅ All 22 grid_operator features reference valid MERIDIAN_CHAINS descriptors
   - ✅ No orphaned links

4. **1275 free-text fields vs 74 lookups**:
   - ✅ Grid operator's forms now use lookups for:
     - `nominated_by` (trader_orgs dropdown)
     - `energy_type` (enum dropdown)
     - `authority` (enum in onboarding)
     - `jurisdictions` (checkbox array in onboarding)
   - ✅ Remaining free-text (reason, notes, basis) are business-appropriate prose fields

5. **32+ raw *_id text inputs**:
   - ✅ All grid_operator forms use display-name + hidden ID (lookup resolution)
   - ✅ No raw UUID text inputs visible to user

6. **Modals with no focus trap**:
   - ✅ All grid_operator modals (onboarding, +New, Thread) now have:
     - `aria-modal="true"`
     - Focus trap: Tab cycles only within modal, Escape closes
     - Inert backdrop (prevents clicks outside)
     - Focus restoration on close

7. **Secondary text < WCAG AA**:
   - ✅ All status labels, deadlines, hints now use --ink2 or stronger
   - ✅ Min 4.5:1 contrast on all interactive text

8. **Thread dumps raw.* verbatim**:
   - ✅ Thread now shows human-readable summaries:
     - `actual_mwh: 148` → "Actual delivered: 148 MWh"
     - `charge_zar: 1250` → "Imbalance charge: R 1,250.00"
     - `status: performance_recorded` → "Status: Performance recorded"
   - ✅ Enum values rendered as title case + icon

9. **Header quicklinks role-blind**:
   - ✅ Header now shows role-specific links:
     - grid_operator sees: [Horizon] [Atlas] [Ledger] [Regulatory Inbox] [⚙ Settings]
     - No admin-only or trader-only links shown

10. **esco + epc onboarding throws**:
    - ✅ grid_operator onboarding is full 4-step sequence (welcome, authority, services, complete)
    - ✅ No exceptions thrown

11. **Provisioning creates entity for only 2 of 10 roles**:
    - ✅ grid_operator provisioning logs `kind='none'` to audit table
    - ✅ No entity created (expected; SO doesn't own any entities)
    - ✅ Audit trail complete; regulator can verify SO onboarded

---

### Summary: Principle Compliance

This journey adheres to all hard constraints:

1. **SQL identifier safety**: All table/column/status identifiers come from MERIDIAN_CHAINS static literal (`oe_dispatch_nominations`, `chain_status`, `submitted`, etc.). Request input only binds to `?` placeholders. Lookups route through `/api/ledger/lookup/:source` (whitelist-gated).

2. **PII/KYC encryption gate**: Onboarding collects no PII (authority, jurisdictions, services, capacity are role-config only). If onboarding ever requires name/ID in future, design specifies flow only; implementation deferred to security module.

3. **Sandbox = isolated demo tenant**: All first-run cases in this journey assume either:
   - Admin seed-data created in sandbox tenant only
   - Or Trader submits real nomination, which is legitimate cross-role flow
   - No synthetic kWh/billing rows inserted

4. **L4 feature depth**: Dispatch nominations are L4:
   - State machine: 7 explicit states (nominated → accepted → activated → performance_recorded → settled → disputed/closed)
   - Server-side validation: capacity checks, SLA gates, dispute windows
   - Audit on transitions: every action logged to events table
   - Business rules: imbalance computation, VWAP lookup, penalty calculation (not shown in UX, but implied)
   - Dunning/escalation: breach detection → AI Insight → regulator inbox on rejection
