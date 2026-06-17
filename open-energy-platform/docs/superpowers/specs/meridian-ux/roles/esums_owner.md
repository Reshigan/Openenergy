## Role journey: esums_owner

**Role Context:** Esums_owner is the Esums/ESCO O&M site owner operator. The role shares all ESCO chain lanes via `laneRoleFor(esums_owner) → esco` in horizon.ts (lines 31–32). At signup, they receive a distinct login at `esums_owner@openenergy.co.za` but resolve to the same chain-accessible set as the `esco` role. Onboarding provisions one `om_sites` row at `commissioning_status='planned'`. All 17 esco-laned chains are visible in Horizon and Atlas; no "thread-only" unreachable chains exist for this role.

---

### 1. Acquisition & First Login

**Email invite flow:** `esums_owner@openenergy.co.za` (password: `Demo@2024!`)
- Admin creates participant record with role `esums_owner` and sends invite link  
- User clicks email link → `/auth/login` route  
- After first successful login (HS256 JWT, 1-hour TTL), user is **NOT** at `/horizon`; instead `LaunchRedirect` in App.tsx calls `GET /api/onboarding/state` and checks `onboarding_completed` flag

**Current broken state:** 
- esco + esums_owner onboarding step sequences throw on role="esums_owner" because onboarding.ts `ONBOARDING_STEPS` map has no key for `esums_owner` (only `esco`). Code references mismatched role spellings (`om`, `esums`, `esums_om` in chain actions vs. JWT role `esums_owner`).  
- Provisioning only creates entity for ipp_developer and esums_owner roles; other 8 roles get kind='none' entry with no entity.

**Fixed behavior:**
- Onboarding.ts ONBOARDING_STEPS adds entry: `esums_owner: ['welcome', 'site_setup', 'device_config', 'data_sources', 'alerts', 'complete']` (identical to esco path for symmetry; see roleData.ts line 25).
- JWT role enforcement changes to accept both `esco` and `esums_owner` in chain action roles arrays (currently lists `['admin', 'support', 'om', 'esums', 'esco']` — align to suffixed long forms).

---

### 2. Onboarding Wizard

**Route:** `/onboard` (first visit only; existing onboards skip to `/horizon`)

**Step Sequence for esums_owner:**
1. **Welcome** — "Set up your Esums operation"  
   - Static intro copy; no data capture  
   - CTA: "Next"
   
2. **Site setup** — Provision the first O&M site  
   - Single form with two required text/number fields:
     - `site_name` (string, placeholder: "e.g. Crescent Solar Park Elandsfontein")
     - `installed_capacity_kw` (number, unit: kW, placeholder: "e.g. 5000")
   - Submit → calls `POST /api/onboarding/step` with `{ step: 'site_setup', data: { site_name, installed_capacity_kw } }`
   - Onboarding.ts merges data into participant `onboarding_data` JSONB column
   - CTA: "Next"

3. **Device config** — "Connect inverters and meters"  
   - Static intro + screenshot of FusionSolar/SolarEdge/SMA credential dialog  
   - One checkbox: "I understand I can add connectors in the Operations panel"  
   - Captures bool `device_config_acknowledged`  
   - CTA: "Next"

4. **Data sources** — "Enable real-time telemetry"  
   - Static intro explaining MQTT/OPC-UA/Modbus ingestion  
   - Radio buttons: `{ data_source_preference: 'modbus' | 'mqtt' | 'opcua' | 'oem_api' }`  
   - CTA: "Next"

5. **Alerts** — "Configure alert thresholds"  
   - Sliders for three numeric thresholds (all optional):
     - `performance_ratio_floor` (0–1, step 0.01, default 0.85)
     - `temperature_warning_c` (number, default 65)
     - `daily_kwh_minimum` (number, default 0)
   - Captures `alerts_config: { pr_floor: 0.85, temp_c: 65, kwh_min: 0 }`
   - CTA: "Next"

6. **Complete** — Summary + confirm button  
   - Displays: "Site: {site_name}, Capacity: {capacity_kw} kW"
   - "Data source: {data_source_preference}"  
   - CTA: "Complete onboarding" → POST `/api/onboarding/complete`

**Cascade on completion:**  
- Fires `onboarding.completed` event with `entity_id=participant_id`, `data={ role: 'esums_owner', ...onboarding_data }`
- `onboarding-provisioning.ts` rule listens, confirms role is `esums_owner`, generates a site ID, and INSERTs into `om_sites`:
  ```
  INSERT INTO om_sites (id, name, participant_id, capacity_mw, commissioning_status, created_at)
    VALUES (genId(), 'Crescent Solar...', participant_id, 5.0, 'planned', now())
  ```
- Logs entry to `oe_onboarding_provisioning_log` with `kind='om_site'`, `entity_type='om_sites'`, `entity_id=site_id`
- Redirect → `/horizon`

**Empty/first-run states:**
- On `/onboard` load, if step is null, UI renders Welcome step with "Get started" narrative
- If user has already completed, step='complete' and UI hides the wizard, shows "You're all set" + button to go to Horizon
- Skipped onboarding (e.g., admin force-skips) returns `{ skipped: true }` and redirects to `/horizon` directly

---

### 3. Horizon Landing

**Route:** `/horizon`  
**GET `/api/horizon/esums_owner`**

The response includes:
- `lanes` — array of 7 lane objects, each with `{ key, cases: [] }` (cases sorted by attentionScore desc):
  1. **operations** (Operations domain) — no chains (non-chain features only: cockpit, opportunities, sites, devices, faults, workorders, technicians, maintenance, projects, alerts)
  2. **site_portfolio** (Site Portfolio domain) — `service_contract` chain cases laned here  
  3. **work_orders** (Work Orders domain) — `om_work_order`, `pm_compliance`, `permit_to_work`, `commissioning` cases  
  4. **asset_health** (Asset Health & AI) — `asset_prognostics`, `availability_guarantee`, `bess_soh`, `soiling_audit` cases  
  5. **supply_chain** (Supply Chain) — `spare_parts_provisioning`, `warranty_claim`, `warranty_recovery`, `vendor_escalation` cases  
  6. **safety** (Safety & Permits) — `hse_incident` cases  
  7. **reporting** (Reporting) — `generation_revenue_assurance` cases
- `duty` — top 8 breached/urgent cases ranked by attentionScore (log10(ZAR) × 1/hours-remaining)
- `counts` — `{ total: N, breached: M }`

**First-run empty state (just onboarded):**
- All lanes have `cases: []` (the new site just created is in `commissioning_status='planned'`, so no chains fire yet — site must be "commissioned" to trigger O&M chains)
- Duty array is `[]`
- Counts show `{ total: 0, breached: 0 }`
- Page renders: "No active work orders" + "You're all set for your first operation"  
- Hero CTA: "Go to Operations" (routes to Cockpit surface)

**Populated state (after site commissioning):**
- Work Orders lane shows: e.g., `[{ chain: 'om_work_order', ref: 'WO-2024-00142', status: 'on_site', ... }, ...]`  
- Asset Health lane shows: e.g., `[{ chain: 'asset_prognostics', ref: 'PROG-2024-0015', title: 'Inverter IGBT degradation', status: 'triaged', deadline_at: '2026-06-18T14:30Z', bucket: 'today', quantum_zar: 125000, score: 890.5 }, ...]`
- Duty shows top issues (high ZAR + urgent deadline)
- Each case card displays:  
  - **Title** — chain.titleCol value (or chain.title fallback)  
  - **Ref** — case ID or refCol (e.g., "PROG-2024-0015")  
  - **Status badge** — color-coded by bucket: red (breached), orange (h2), yellow (today), blue (h48), gray (week/later)  
  - **Quantum** — if quantumCol set, shows "ZAR 125,000 at risk"  
  - **Deadline** — if not null, shows "Due 2026-06-18 2:30 PM"  
  - **Action buttons** (from chain.actions filtered by role) — e.g., "Triage", "Raise WO", "Resolve"

**a11y + responsive:**
- Lanes rendered as vertical stacks on desktop; <760px reflow to single-column  
- Each case is a focusable card (`role="button"` on click → Thread detail)  
- Lane headers are `<h2>` scoped to region; case lists use `role="list"` + list items  
- Duty section labeled "Urgent: Top 8 cases"  
- Keyboard: Tab navigates case cards; Enter/Space opens Thread detail  
- Focus trap on Horizon page, restored on back from Thread

**Checklist/progress tracking:**
- Horizon does NOT show a checklist widget (audit notes "needs tracking"). A first-time user should see a "Setup checklist" floating card:
  - ☐ Add generation site (DONE on onboarding completion)
  - ☐ Configure inverter connector (route to Cockpit → Integrations)
  - ☐ Run first daily report (route to Reporting → Accruals)
  - ☐ Invite team member (route to People or Team management)
  - Collapsible; closes after 3 interactions

---

### 4. Discovering Functions in Atlas

**Route:** `/atlas` or ⌘K command palette  
**GET `/api/onboarding/state`** → role=esums_owner  
**atlasConfig (from roleData.ts esumsDomains):**

**7 Domains + 45 Features** (all routable via role.domains in roleData):

#### **a. Operations** (10 non-chain features, routes only)
- **Cockpit** — `{ route: undefined, label: 'Cockpit' }` → GET /surface/esco:cockpit (EsumsOmCockpit component)  
  *Live fleet revenue ticker, fault register, fleet health grid, AI briefing*
- **Opportunities** — → /surface/esco:opportunities (EsumsOmOpportunities)  
  *Rule-based scan for monetisable perf improvements*
- **Sites** — → /surface/esco:sites (SitesSurface)  
  *Generation sites with live KPIs*
- **Devices** — → /surface/esco:devices (DevicesSurface)  
  *Inverters, meters, batteries, sensors across all sites*
- **Faults** — → /surface/esco:faults (FaultsSurface)  
  *Live fault register with Revenue Impact Engine*
- **Work orders** — → /surface/esco:workorders (WorkOrdersSurface)  
  *12-state WO lifecycle*
- **Technicians** — → /surface/esco:technicians (TechniciansSurface)  
  *Field technicians — skills, certifications, availability*
- **Maintenance** — → /surface/esco:maintenance (MaintenanceSurface)  
  *Scheduled preventive maintenance auto-creating WOs*
- **Projects** — → /surface/esco:projects (ProjectsSurface)  
  *Portfolio-level project grouping (IPP-linked or standalone)*
- **Alerts** — → /surface/esco:alerts (AlertsSurface)  
  *All alerts fired across the fleet in last 7 days*

#### **b. Site Portfolio** (2 features: 1 chain, 1 non-chain)
- **Service contracts** — `{ chainKey: 'service_contract' }` → /ledger/service_contract  
  *O&M service contract management (W104 equivalent)*
- **Sites portfolio** — → /surface/esco:sites-portfolio (SitesPortfolioSurface)  
  *Full site portfolio — status, health, capacity*

#### **c. Work Orders** (4 chain features)
- **Work orders** — `{ chainKey: 'om_work_order', mockState: 'in_progress' }` → /ledger/om_work_order (W16)  
  *12-state P6 WO dispatch chain*
- **PM compliance** — `{ chainKey: 'pm_compliance' }` → /ledger/pm_compliance (W59)  
  *IEC 62446 preventive-maintenance compliance*
- **Permit-to-work** — `{ chainKey: 'permit_to_work' }` → /ledger/permit_to_work (W64)  
  *OHSA + SANS 10142 control-of-work gate*
- **Commissioning** — `{ chainKey: 'commissioning' }` → /ledger/commissioning (W12)  
  *Site commissioning and energization workflow*

#### **d. Asset Health & AI** (5 chain features)
- **Asset prognostics** — `{ chainKey: 'asset_prognostics', mockState: 'nominal' }` → /ledger/asset_prognostics (W71)  
  *Predictive O&M — anomaly, RUL, fault fingerprint*
- **Availability guarantee** — `{ chainKey: 'availability_guarantee', mockState: 'active' }` → /ledger/availability_guarantee (W51)  
  *IEC 61724 uptime contract and LD tracking*
- **BESS state-of-health** — `{ chainKey: 'bess_soh', mockState: 'monitoring' }` → /ledger/bess_soh (W88)  
  *Battery degradation tracking and augmentation programme*
- **Soiling audit** — `{ chainKey: 'soiling_audit', mockState: 'measured' }` → /ledger/soiling_audit (W91)  
  *IEC 61724 soiling losses and cleaning economics*
- **Predictive** — → /surface/esco:predictions (PredictionsSurface)  
  *AI-derived predictive maintenance signals (weeks ahead)*

#### **e. Supply Chain** (5 chain features + 1 non-chain)
- **Spare parts** — `{ chainKey: 'spare_parts_provisioning', mockState: 'in_stock' }` → /ledger/spare_parts_provisioning (W72)  
  *VED-critical spare parts replenishment*
- **Parts catalogue** — → /surface/esco:parts (PartsSurface)  
  *Parts catalogue and stock with low-stock reorder flags*
- **Vendor escalation** — `{ chainKey: 'vendor_escalation', mockState: 'open' }` → /ledger/vendor_escalation (W35)  
  *CPA §56/§61 vendor claim chain*
- **Warranty claims** — `{ chainKey: 'warranty_claim', mockState: 'submitted' }` → /ledger/warranty_claim (W15)  
  *OEM 10-state RMA workflow*
- **Warranty recovery** — `{ chainKey: 'warranty_recovery', mockState: 'initiated' }` → /ledger/warranty_recovery (W63)  
  *Supplier cost-recovery against warranty defects*

#### **f. Safety & Permits** (1 chain feature + 1 non-chain)
- **HSE incidents** — `{ chainKey: 'hse_incident', mockState: 'reported' }` → /ledger/hse_incident (W25)  
  *OHSA s24 + NEMA s30 incident chain*
- **Protection tests** — → /surface/esco:protection-relay-tests (ProtectionRelayTestTab)  
  *NRS 097-2-3 + NERSA Grid Code protection relay compliance*

#### **g. Data & Integrations** (5 non-chain features)
- **Ingestion** → /surface/esco:ingestion (IngestionSurface)  
  *OEM connections (FusionSolar, SolarEdge, SMA, etc.) with last-poll status*
- **Integrations** → /surface/esco:integrations (InverterIntegrationsTab)  
  *Connect inverters and generation assets — credentials, live telemetry*
- **Data sources** → /surface/esco:data-sources (DataSourcesTab)  
  *Sensor connections and data-ingest APIs (Modbus, SunSpec, MQTT, REST, OPC-UA)*
- **Participant links** → /surface/esco:participant-links (StationParticipantLinkTab)  
  *Two-party onboarding handshake linking stations to downstream modules*

#### **h. Reporting** (5 non-chain features + 1 chain feature)
- **Audit log** → /surface/esco:audit (AuditPanel adapter)  
  *Tamper-evident audit chain and evidence log (prefix /esums)*
- **Generation revenue assurance** — `{ chainKey: 'generation_revenue_assurance', mockState: 'reconciling' }` → /ledger/generation_revenue_assurance (W79)  
  *Settlement-vs-expected reconciliation and recovery*
- **Accruals** → /surface/esco:accruals (AccrualsSurface)  
  *Real-time generation accrual ledger from inverter data*
- **Settlement invoices** → /surface/esco:settlement-invoices (SettlementInvoicesSurface)  
  *Monthly settlement invoices derived from accruals ledger*
- **Carbon credits** → /surface/esco:carbon-credits (CarbonCreditsSurface)  
  *Monthly carbon credit records auto-minted from accruals ledger*

**No "dossier-grouped" sub-chains or "thread-only unreachable" chains for esums_owner.**  
- All 17 esco-laned chains are discoverable via Atlas tiles or Horizon lanes
- No admin-only chains  
- No "49 chains with no Atlas tile" issue for this role (esums_owner surface mappings are 100% complete as of E2.8a)

**Search/filtering in Atlas:**
- ⌘K opens CommandPalette with role-filtered features  
- User types "asset" → filters to "Asset prognostics", "Asset health", "Availability guarantee", "BESS state-of-health"  
- Click a tile → routes to /ledger/:chainKey or /surface/:key as configured

---

### 5. Initiating Primary Owned Transaction: Asset Prognostics (W71)

**Chain:** `asset_prognostics` (W71) — Predictive O&M anomaly/RUL/fault-fingerprint prediction lifecycle

**Frontdoor:** **Tile** — "Asset prognostics" in Atlas, Operations lane in Horizon  
**Routes:** `/ledger/asset_prognostics` (+New form) or `/thread/asset_prognostics/:id` (detail)

#### **5a. +New Initiation**

**Route:** `/ledger/asset_prognostics?compose=1`  
**Form body:** Single-page modal or slide-out drawer

**Fields (from chain-registry-meridian.ts, no initiation block defined — auto-generated from +New discovery):**
- `asset_label` (string, required) — inverter/device identifier  
  *Dropdown sourced from GET /api/ledger/lookup/serviceable_assets*  
  *Shows: "INV-001 (SMA Sunny Boy 10.0 kW)", "INV-002 (SolarEdge SE27K)", etc.*
- `anomaly_type` (enum, required) — options: `['degradation', 'fault_imminent', 'performance_loss', 'thermal_stress']`
- `predicted_failure_days` (number, required, min 1) — "Days until predicted failure"
- `confidence` (number, required, 0–1, step 0.01) — "Model confidence (0–1)"
- `revenue_at_risk_zar` (number, optional, unit: ZAR) — "Revenue at risk (ZAR)"  
- `notes` (string, optional) — free-form prediction reasoning

**Submit action:**  
- POST `/api/asset-prognostics/chain` with JSON body:
  ```json
  {
    "asset_label": "INV-001",
    "anomaly_type": "degradation",
    "predicted_failure_days": 7,
    "confidence": 0.92,
    "revenue_at_risk_zar": 125000,
    "notes": "IGBT temperature trending +2°C/day; RUL model predicts failure within 7d."
  }
  ```
- Backend generates ID, inserts row into `oe_asset_prognostics`:
  ```
  INSERT INTO oe_asset_prognostics (id, participant_id, asset_label, anomaly_type, 
    predicted_failure_days, confidence, revenue_at_risk_zar, notes, status, 
    created_at, sla_deadline) VALUES (genId(), ..., 'predicted', now(), DATE_ADD(now(), INTERVAL 7 DAY))
  ```
- Fires cascade event `asset_prognostics.initiated`
- Redirects to `/thread/asset_prognostics/:id` (detail view)

**Form validation + error states:**
- Empty asset_label → "Select a serviceable asset"  
- confidence > 1 → "Confidence must be 0–1"  
- predicted_failure_days ≤ 0 → "Must be positive days"  
- Network error → Toast: "Failed to create prediction. Retry?"
- Success → Toast: "Prediction created — PROG-2026-0482"

**Dropdown: GET /api/ledger/lookup/serviceable_assets**  
- Returns `{ success: true, data: [ { id: 'INV-001', label: 'INV-001 (SMA Sunny Boy 10.0 kW)' }, ... ] }`
- Sourced from static whitelist in a lookup-sources allow-list (MERIDIAN_CHAINS security rule — never from request input)

---

#### **5b. State Transitions**

**Chain status flow:** `predicted` → `triaged` → `diagnosed` → `action_planned` → `wo_raised` | `monitoring` → `resolved` | `dismissed` | `expired` | `confirmed_failure`

**Example journey (esums_owner as esco):**

1. **Predicted** (initial, at creation)  
   - Only action available: `triage-prediction` (label: "Triage prediction")  
   - Form fields: `fault_mode` (string), `fault_mode_confidence` (0–1), `revenue_at_risk_zar` (number), `safety_implicated` (boolean), `predicted_failure_at` (date), `assigned_to` (string), `notes` (string)  
   - CTA button tone: "primary"  
   - Cascade hint: "Confirms the prediction as actionable; the diagnosis SLA arms on the revenue-weighted tier."

2. **Triaged** (after triage-prediction)  
   - Available actions: `raise-work-order` (primary), `diagnose-root-cause`, `dismiss-prediction`  
   - Esums_owner clicks "Raise work order" → Form:
     - `work_order_id` (string, optional) — link to existing W16 WO or auto-create  
     - `assigned_to` (string)  
     - `notes` (string)  
     - Submit → cascades `asset_prognostics.wo_raised` event → status becomes `wo_raised`

3. **WO Raised** (after raise-work-order)  
   - Available actions: `record-failure`, `begin-monitoring`, `dismiss-prediction`, `auto-suppress`  
   - Status badge: "In flight" (blue)

4. **Monitoring** (after begin-monitoring)  
   - Available actions: `confirm-resolved`, `escalate-prognostic`, `reopen-recurrence`  
   - Status badge: "Open" (yellow)

5. **Resolved** (after confirm-resolved)  
   - Terminal status; no further actions  
   - Status badge: "Resolved" (green)  
   - Form on confirm-resolved:
     - `resolution_summary` (evidence type — string or file upload)

---

#### **5c. Thread Detail View**

**Route:** `/thread/asset_prognostics/PROG-2026-0482`  
**GET `/api/thread/asset_prognostics/PROG-2026-0482`**

**Layout (Meridian Thread standard):**
- **Header strip:** Title "Asset prognostics" | Ref "PROG-2026-0482" | Status badge  
- **Two-column split:**
  - **Left panel (70%):** Detail form + timeline
    - **Case summary card:**
      - "Asset: INV-001 (SMA Sunny Boy 10.0 kW)"  
      - "Anomaly: Degradation"  
      - "Confidence: 92%"  
      - "Revenue at risk: ZAR 125,000"  
      - "Predicted failure: 2026-06-18"  
      - "SLA deadline: 2026-06-18 14:30"  
    - **Case raw data** (Bucket E): Thread dumps the full row as `.raw` JSON (audit notes: currently dumps raw.* verbatim — should elide PII columns)  
    - **Timeline/events:** If `eventsTable='oe_asset_prognostics_events'` is set, renders event log:
      - 2026-06-14 14:22 | Prediction created | esums_owner@openenergy.co.za
      - 2026-06-14 14:45 | Triaged | esums_owner@openenergy.co.za  
      - 2026-06-14 15:10 | Work order raised (WO-2026-00089) | esums_owner@openenergy.co.za
  - **Right panel (30%) — Counterparty / Actions:**
    - No counterpartyCol set for asset_prognostics (operator-side prediction record; no contractual counterparty)  
    - **Actions** section: Buttons for all chain.actions filtered by role='esco':
      - ["Triage prediction", "Raise work order", "Record failure", "Dismiss prediction", "Auto suppress", "Diagnose root cause", "Plan action", "Begin monitoring", "Confirm resolved", "Escalate prognostic", "Expire prognostic", "Reopen recurrence"]
      - Only buttons for current-status-compatible actions are enabled (others greyed out)

**Responsive <760px:**
- Two-column collapses to stacked single-column  
- Timeline becomes collapsible accordion  
- Action buttons stack vertically

**a11y:**
- Timeline entries are `<div role="listitem">` scoped to `<ul role="list">`  
- Action buttons have `aria-label="Triage prediction for asset INV-001"`  
- Focus trap on Thread; Escape closes and returns to Horizon  
- Keyboard: Tab navigates buttons; Enter fires action  
- No focus rings visible (audit notes: "floor flags caller-supplied not gate_index-derived"; zero focus rings currently broken — FIX: apply `:focus-visible` outline)

---

### 6. Cross-Role Interaction via Thread: Support Escalation

**Scenario:** Esums_owner's asset-prognostics case escalates to Support team via cascade rule.

**Current flow:**
- Esums_owner on `/thread/asset_prognostics/PROG-2026-0482` clicks "Escalate prognostic"  
- POST `/api/asset-prognostics/chain/PROG-2026-0482/escalate-prognostic`  
- Backend fires cascade event `asset_prognostics.escalated`  
- Cascade rule in `onboarding-provisioning.ts` or a hypothetical `asset-prognostics-escalation.ts` should fire, generating a `pushRoleAction` event routed to the `support` role's inbox
- Support user sees a new action in their "Incoming panel" on Horizon (not yet implemented per audit)

**Broken state:**
- Asset_prognostics.actions include `escalate-prognostic` but no corresponding `pushRoleAction` cascade rule wires it to Support inbox  
- No two-sided Thread view exists (Thread only shows case owner + actions, not a reply panel)  
- Support role has NO lane for `asset_prognostics` in MERIDIAN_CHAINS — cascade cannot route them there  

**Fixed behavior (Phase E end-state):**
1. Cascade rule `asset-prognostics-escalation.ts` listens for `asset_prognostics.escalated`:
   ```typescript
   match: ctx.event === 'asset_prognostics.escalated',
   run: async (ctx) => {
     const actionId = genId();
     await ctx.env.DB.prepare(
       `INSERT INTO oe_role_actions (id, actor_role, target_role, action_type, entity_type, entity_id, ...)
        VALUES (?, 'esco', 'support', 'escalation', 'asset_prognostics', ?, ...)`
     ).bind(actionId, ctx.entity_id).run();
     await fireCascade({
       event: 'role_action.created', entity_type: 'role_actions', entity_id: actionId, ...
     });
   }
   ```

2. Support user's Horizon for `support` role adds a new lane: **"Escalations"** (or re-uses field_operations lane)  
   - Shows: `{ chain: 'asset_prognostics', ref: 'PROG-2026-0482', title: 'INV-001 IGBT degradation (escalated)', status: 'escalated' }`  
   - Counterparty: esums_owner@openenergy.co.za  
   - Note: Asset_prognostics adds `counterpartyCol: null` → no display of counterparty name (correct for operator-side record); instead, thread side-panel shows "Escalated by: esums_owner" tag

3. Support clicks case → `/thread/asset_prognostics/PROG-2026-0482`  
   - Left panel shows case detail (identical to esums_owner's view)  
   - Right panel shows:
     - "Escalated by: esums_owner@openenergy.co.za on 2026-06-14 15:45"  
     - "Status: Escalated"  
     - Available actions for support role: `record-failure`, `confirm-resolved`, `escalate-prognostic` (re-escalate)  
     - NO actions for esco (`triage-prediction` etc. grayed out — roles filtered by action.roles array)

4. Support updates case (e.g., "Confirm resolved") → cascades back to esums_owner as a briefing notification (not a Thread reply yet — Phase E doesn't implement two-sided write)

---

### 7. Daily Work & AI Inline Assists

**Cockpit Surface** (`/surface/esco:cockpit`)  
- **Widget: Live fleet revenue ticker**  
  - "Today's generation: 4,821 MWh"  
  - "Revenue earned: ZAR 1,284,560"  
  - "Target: ZAR 1,400,000 (91% track)"  
  - Sparkline: last 7 days MWh + revenue

- **Widget: Fault register**  
  - Live list of open faults (last 24h)  
  - Columns: Device | Fault type | Severity | Revenue impact | Time detected  
  - Color-coded: Red (critical), Orange (high), Yellow (medium), Gray (low)  
  - Example row: "INV-002 | Overtemp | High | ZAR 45,000 | 2h ago"  
  - Clicking a fault row → navigates to asset_prognostics detail if a linked prognostic exists, else shows inline fault card

- **Widget: Fleet health grid (KPI dashboard)**  
  - Scatterplot: X-axis = PR (performance ratio 0–1), Y-axis = Availability %  
  - Each site = dot, sized by capacity  
  - Thresholds drawn: PR < 0.85 = red zone, PR 0.85–0.90 = yellow, >0.90 = green  
  - Availability < 95% = orange zone  
  - Hovering a dot shows site name + exact KPIs  
  - Clicking a dot → routes to site detail (Sites surface)

- **Widget: AI briefing (inline assist)**  
  - "Daily briefing for {esums_owner@openenergy.co.za}"  
  - Prose paragraph generated by `/api/ai/brief?role=esco` (Workers AI):
    - "Fleet performed at 91% target today. INV-002 overtemp event correlates with morning heatwave (37°C recorded). Recommend urgent service call to clean filters and check coolant. Preventive maintenance on Unit-3 due next Tuesday — flagged for scheduling."
  - "Why this matters:" dropdown explanation  
  - "Accept recommendation" button → auto-creates PM compliance task or escalates to Support  
  - "Dismiss" button → hidden for 7 days (user preference)

**Current broken state:**  
- No AI briefing card exists  
- Cockpit is a static widget without the "why" + accept flow  
- Fault list is read-only; no "Assign technician" quick-action

**Fixed behavior:**
- AI briefing card in Cockpit renders inline at top  
- Prose updated hourly via cron job or on-demand  
- Accept flow calls `POST /api/ai/action` with action payload (e.g., `{ type: 'create_pm_task', asset_id: '...', due_date: '2026-06-25' }`)  
- Feeds into cascade → creates pm_compliance case or pushes escalation

---

**Operations lane daily checklist:**  
- Horizon "Duty" section highlights 3–5 top-priority cases daily  
- Esums_owner scans Duty at 06:00 AM via email briefing (if subscribed):
  - "Urgent: 1 work order overdue, 2 asset predictions breached, 3 PM compliance tasks due"  
  - Link to `/horizon` jump to Duty section

---

### 8. Sign Out

**Route:** `GET /auth/logout` (or button in top-right user menu)  
- Clears `localStorage['token']` (JWT)  
- Clears `sessionStorage` (temporary UI state)  
- Navigates to `/auth/login` with query param `?reason=signed_out`  
- Login page shows brief toast: "You've been signed out."  
- TTL: If user is idle >1 hour, JWT auto-expires; next action triggers 401 → redirect to `/auth/login` with `?reason=session_expired`

---

### Key Differences: Esums_owner vs Esco

**esums_owner** and **esco** are FUNCTIONALLY IDENTICAL in the chain-access layer:
- Both resolve to `laneRoleFor(role) = 'esco'` in horizon.ts  
- Both have identical esumsDomains from roleData  
- Both have identical onboarding step sequences  
- Both receive suffixed JWT role claim (`esums_owner` vs `esco`)
- Both route via `/surface/esco:*` and `/ledger/:chainKey`

**DISTINGUISHING FACTOR:** Tenant ownership and provisioning  
- **esums_owner**: Owns their own tenant; provisions one om_sites row on onboarding (self-operator scenario)  
- **esco**: Multi-tenant ESCO service provider; provisions zero om_sites on onboarding (joins IPPs' sites as third-party operator)

**In workflow terms:** Both see the same Horizon lanes, same Assets chains, same Actions. The difference is DATA ISOLATION — esums_owner's site records carry their own `participant_id`, whereas esco records belong to IPP participant rows and are linked via foreign key.

---

### Audit Fixes Checklist (Meridian Phase E)

**Critical (blocking go-live):**
- ☐ Onboarding STEPS map adds `esums_owner` key  
- ☐ Chain action roles arrays accept suffixed long forms (`esums_owner`, not `esums` or `om`)  
- ☐ Atlas tiles for all 17 esco-laned chains (all mapped in surfaces.tsx as of E2.8a)  
- ☐ Provisioning creates om_sites for both esums_owner AND ipp_developer roles  
- ☐ Asset_prognostics + other escalable chains wire cascades to Support inbox (pushRoleAction)  
- ☐ Thread focus trap + visible focus rings (`:focus-visible` outline)  
- ☐ Thread redact PII columns (don't dump raw.* verbatim)

**High (UX polish):**
- ☐ First-run Horizon: show onboarding checklist card  
- ☐ Cockpit: inline AI briefing card with "why" + accept flow  
- ☐ Asset_prognostics linked-WO dropdown populated from serviceable_assets lookup  
- ☐ Two-sided Thread view (reply panel for cross-role updates)

**Nice-to-have (later phases):**
- ☐ Email briefing subscription setting  
- ☐ Custom SLA tiers per asset (revenue-weighted)  
- ☐ Bulk actions (select N cases → apply action to all)
