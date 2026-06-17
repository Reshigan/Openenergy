## Cross-cutting: Full onboarding system — per-role sequences, per-component first-run, provisioning, sandbox, KYC gate

### Part 1: Per-role step sequences (all 12 roles + fallback)

The OnboardingWizard is the single entry point post-login (via LaunchRedirect in App.tsx). Each role follows a scripted sequence defined in `ONBOARDING_STEPS` (src/routes/onboarding.ts:24–35 and pages/src/components/onboarding/OnboardingWizard.tsx:53–64), exclusive of the terminal 'complete' step. Data is collected in the wizard and persisted to `participants.onboarding_data` (JSON) via `POST /api/onboarding/step`.

**Sequence design — 12 roles:**

1. **esums_owner** (Asset Owner)
   - Steps: welcome → site_setup → device_config → data_sources → alerts → complete
   - First entity provisioned: `om_sites` row at `commissioning_status='planned'` (W12 entry)
   - Fields collected: site_name, site_type (solar_pv|wind|bess|hybrid), installed_capacity_kw, location_province, grid_connection_type
   - Card subtitle: "Monitor and manage your renewable energy sites with real-time data, predictive analytics, and automated O&M workflows."

2. **ipp_developer** (IPP Developer)
   - Steps: welcome → company_profile → first_project → compliance → complete
   - First entity provisioned: `ipp_projects` row at `status='development'` (W1 entry)
   - Fields collected: company_reg_no (CIPC), installed_capacity_mw, technology array (solar_pv|wind|biomass|hydro), company_name, contact_person
   - Card subtitle: "Manage your IPP project lifecycle from procurement through COD, with REIPPPP compliance, lender reporting, and regulatory submissions."

3. **trader** (Trader)
   - Steps: welcome → entity → risk_limits → complete
   - First entity provisioned: none (profile-only; rig KYC gate instead)
   - Fields collected: entity_name, fsa_license_number, lei, base_currency, initial_vark_limit, position_limit
   - Card subtitle: "Access the South African energy exchange to place orders, manage positions, and stay ahead of pre-trade risk controls."

4. **lender** (Lender)
   - Steps: welcome → fund_setup → coverage → complete
   - First entity provisioned: none (profile-only)
   - Fields collected: fund_name, fund_aum_zar, portfolio_type (project_finance|green_bonds|mezzanine), mandate_start_date, focus_technologies array
   - Card subtitle: "Track project finance portfolios, monitor covenant health, and manage drawdown approvals across your clean-energy book."

5. **offtaker** (Offtaker)
   - Steps: welcome → entity → ppa_prefs → complete
   - First entity provisioned: none (profile-only)
   - Fields collected: entity_name, annual_consumption_mwh, preferred_provinces array, ppa_term_years, coverage_type (full|partial|trial)
   - Card subtitle: "Manage your PPA contracts, track contracted-vs-delivered energy, and handle tariff indexation and payment security."

6. **carbon_fund** (Carbon Fund)
   - Steps: welcome → registry → methodology → complete
   - First entity provisioned: none (profile-only)
   - Fields collected: fund_name, registry_accreditations array (verra|goldstandard|article6|poa), primary_methodology array, annual_allocation_credits, target_cost_per_credit
   - Card subtitle: "Administer carbon credit registries, MRV verification chains, ITMO transfers, and Article 6 corresponding adjustments."

7. **grid_operator** (Grid Operator)
   - Steps: welcome → authority → services → complete
   - First entity provisioned: none (profile-only)
   - Fields collected: operator_name, zone_code (G1|G2|G3|G4), managed_capacity_mw, ancillary_services array (frequency_control|voltage_support|reactive_power|black_start), primary_contact_email
   - Card subtitle: "Monitor dispatch nominations, ancillary services, connection agreements, and grid-code compliance across your zone."

8. **regulator** (Regulator — NERSA)
   - Steps: welcome → body → jurisdiction → complete
   - First entity provisioned: none (profile-only)
   - Fields collected: regulator_body_name, jurisdiction_scope (national|provincial|regional), licence_classes_managed array (on_grid|off_grid|micro|utility), escalation_email, case_routing_rules (optional)
   - Card subtitle: "Process licence applications, manage compliance inspections, issue enforcement notices, and run MYPD tariff determinations."

9. **support** (OEM Support)
   - Steps: welcome → org → sla → complete
   - First entity provisioned: none (profile-only)
   - Fields collected: org_name, oem_brands array (sunsynk|victron|sma|huawei|solax), coverage_footprint_provinces array, p1_sla_minutes, p2_sla_minutes, p3_sla_hours
   - Card subtitle: "Handle ITIL incident, problem, and change management across OEM brands with SLA tracking and escalation workflows."

10. **admin** (Administrator)
    - Steps: welcome → complete
    - First entity provisioned: none (no-op; all access)
    - Fields collected: none
    - Card subtitle: "Full platform access across all roles, modules, and administrative functions."

11. **esco** (ESCO — Energy Service Company)
    - Steps: [CURRENTLY MISSING; fallback to 'none' branch below] 
    - First entity provisioned: none (currently broken; should provision `oe_esco_contracts` or similar per roadmap)
    - Fallback: logs error event, shows admin alert, does not break login
    - Card subtitle: [Not configured; fallback message: "Energy service company operations currently under development."]

12. **epc_contractor** (EPC Contractor)
    - Steps: [CURRENTLY MISSING; fallback to 'none' branch below]
    - First entity provisioned: none (currently broken)
    - Fallback: logs error event, shows admin alert, does not break login
    - Card subtitle: [Not configured; fallback message: "EPC contractor operations currently under development."]

**Fallback for unmapped roles (esco, epc_contractor, unknown):**
- If `ONBOARDING_STEPS[user.role]` is undefined, the backend responds with 400 "No onboarding steps configured for role: {role}". The SPA catches this, logs to Sentry, and offers:
  1. "Skip setup" button (posts to `/onboarding/skip`; fires cascade event `onboarding.skipped` with no entity provisioning, no error)
  2. "Contact support" link (mailto to support@openenergy.co.za with pre-filled subject "Onboarding unavailable for role: {role}")
  3. Fallback navigate to `/horizon` (to avoid login-loop)
- A backend admin alert (cascade event `onboarding.role_unconfigured` → regulator inbox) notifies that a new role arrived without a sequence defined.

---

### Part 2: Per-component first-run registry (intro cards on every surface)

**Schema: FirstRunIntroCard**
```typescript
interface FirstRunIntroCard {
  key: string;                // unique, role+chain+surface scoped: 'trader:trading_risk:overview'
  chainKey?: string;          // if tied to a specific chain (e.g., 'covenant_certificate')
  surfaceKey?: string;        // if tied to /surface/:key (e.g., 'esums_commissioning')
  roles: string[];            // which roles see this card (e.g., ['trader', 'admin'])
  title: string;              // "What is position risk?"
  body: React.ReactNode;      // explanation + context
  primaryAction?: {
    label: string;            // "View settings" / "Create order"
    href?: string;            // route to navigate to, or...
    actionKey?: string;       // ...trigger an in-place action (e.g., 'open_tutorial')
  };
  tone?: 'info' | 'success' | 'amber';  // color palette
  dismissible: boolean;       // true = can close permanently; false = always shown first-run
  minCriteriaToHide?: 'first_entity' | 'first_completion' | 'chain_has_data'; // when does card auto-retire
}
```

**Firing logic:**
- On mount of any Ledger, Thread, or workstation surface, the SPA reads the card's `key` from `GET /api/ux-state/first-run-cards` (a new endpoint returning `{cards: {[key]: dismissed_at}}`).
- If `dismissed_at === null` and `minCriteriaToHide` is met, the card is **not shown** (data already present, user has completed the action).
- If `dismissed_at === null` and criteria not met, render the intro card above the surface content.
- When the user clicks "Dismiss" (via InlineHelp dismissal pattern) or the criteria auto-satisfy, POST to `/api/ux-state/first-run-cards/:key/dismiss` to persist.

**Card registry: 10 high-impact examples** (extensible via SPA Ledger/Thread/workstation mounts)

1. **Trader — Position Risk Overview**
   - key: `trader:trading_risk:overview`
   - chainKey: `trading_risk` (W2)
   - roles: ['trader', 'admin']
   - title: "Position risk is your daily lens into exposure."
   - body: "Every order you place increments your overall position (long/short energy). The Horizon shows breaches in real time; the Ledger details every live position. Mark age updates hourly; if it's stale, the order queue locks."
   - primaryAction: { label: "View risk settings", href: "/surface/trader:risk-settings" }
   - tone: 'info'
   - dismissible: true
   - minCriteriaToHide: 'chain_has_data' (hide once position count > 0)

2. **IPP Developer — Project Dossier Kickoff**
   - key: `ipp:project_dossier:welcome`
   - surfaceKey: `ipp:project_dossier`
   - roles: ['ipp_developer', 'admin']
   - title: "Your project file is now open."
   - body: "Everything from site screening to COD lives here: permits, EPC contracts, financing, grid connection. Each section is a workflow. Start with Site Assessment in Origination, then Permits."
   - primaryAction: { label: "Open Project Dossier", href: "/surface/ipp:project-dossier" }
   - tone: 'success'
   - dismissible: true
   - minCriteriaToHide: 'first_entity' (hide once project created)

3. **Lender — Covenant Monitoring Intro**
   - key: `lender:covenant_certificate:lane_intro`
   - chainKey: `covenant_certificate` (W38)
   - roles: ['lender', 'admin']
   - title: "Covenant certificates keep you ahead of breaches."
   - body: "Your borrowers (IPP developers) must file quarterly compliance reports. You review them, flag breaches, and invoke cure windows or acceleration. SLAs are URGENT."
   - primaryAction: { label: "Review certificates", href: "/ledger/covenant_certificate?role=lender" }
   - tone: 'amber'
   - dismissible: true
   - minCriteriaToHide: 'none' (always show on first Lender login)

4. **Esums Owner — Site Commissioning First Run**
   - key: `esums_owner:site_commissioning:planned`
   - chainKey: `site_commissioning` (W12)
   - roles: ['esums_owner', 'admin']
   - title: "Your first site is in 'planned' status."
   - body: "From here you configure inverters and meters, then move to 'commissioned' once telemetry flows. The whole commissioning workflow is on the right tab."
   - primaryAction: { label: "Configure devices", href: "/esums/sites/[site-id]/commissioning" }
   - tone: 'info'
   - dismissible: true
   - minCriteriaToHide: 'first_completion' (hide once first device_config step done)

5. **Offtaker — PPA Preferences Saved**
   - key: `offtaker:ppa_preferences:confirm`
   - roles: ['offtaker', 'admin']
   - title: "Your PPA wishlist is locked in."
   - body: "We'll match you to open PPAs from our seller community that fit your capacity, technology, and term. New matches arrive weekly."
   - primaryAction: { label: "Browse listings", href: "/deals?tab=available_ppas" }
   - tone: 'success'
   - dismissible: true
   - minCriteriaToHide: 'first_entity' (hide after first PPA inquiry)

6. **Carbon Fund — Registry Accreditation**
   - key: `carbon_fund:registry:accreditation_required`
   - roles: ['carbon_fund', 'admin']
   - title: "Verify your registry accreditations."
   - body: "You've selected Verra, Gold Standard, and Article 6. We'll need to see your account credentials so we can sync your portfolio in real time."
   - primaryAction: { label: "Link registry accounts", href: "/surface/carbon:registry-accounts" }
   - tone: 'amber'
   - dismissible: true
   - minCriteriaToHide: 'none'

7. **Grid Operator — Dispatch Nominations**
   - key: `grid_operator:dispatch_nominations:intro`
   - chainKey: `dispatch_nominations` (W13)
   - roles: ['grid_operator', 'admin']
   - title: "Dispatch nominations are your interface to generators."
   - body: "Each trading interval, generators submit MWh bids. You accept, activate, and settle. SLA is per-interval (tighter on congestion). Disputes go to the Regulator."
   - primaryAction: { label: "View nominations", href: "/ledger/dispatch_nominations?role=grid_operator" }
   - tone: 'info'
   - dismissible: true
   - minCriteriaToHide: 'chain_has_data'

8. **Regulator — Licence Applications**
   - key: `regulator:licence_application:submission_received`
   - chainKey: `licence_application` (W49)
   - roles: ['regulator', 'admin']
   - title: "Your first licence application has arrived."
   - body: "It's from an on-grid utility. You have 180 days to evaluate technical fit, hold public hearings, and decide. Reject crosses all tiers (denied entry)."
   - primaryAction: { label: "Review application", href: "/ledger/licence_application?role=regulator" }
   - tone: 'info'
   - dismissible: true
   - minCriteriaToHide: 'none'

9. **Support — ITIL Incident Queue**
   - key: `support:incident_management:first_ticket`
   - chainKey: `support_ticket` (W14)
   - roles: ['support', 'admin']
   - title: "Your first support ticket has arrived."
   - body: "P1 issues (safety-critical) get 60 minutes to first response, then 120 to resolution. Track SLA on the incident detail. Escalate if you hit the window."
   - primaryAction: { label: "Review queue", href: "/ledger/support_ticket?role=support&filter=open" }
   - tone: 'amber'
   - dismissible: true
   - minCriteriaToHide: 'none'

10. **Admin — Overview & User Onboarding**
    - key: `admin:dashboard:welcome`
    - roles: ['admin']
    - title: "You have full platform access."
    - body: "Platform health, role inventories, cascade audit trail, and pending registrations are on the Admin dashboard. Most common task: onboard new participants."
    - primaryAction: { label: "Go to Admin dashboard", href: "/admin" }
    - tone: 'success'
    - dismissible: true
    - minCriteriaToHide: 'none'

**Storage: UX State tables**
- `oe_onboarding_state` (already exists, per routes/ux-state.ts) — tracks `step_key` per user.
- New table: `oe_first_run_cards` (POST migration 483)
  ```sql
  CREATE TABLE oe_first_run_cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    card_key TEXT NOT NULL,
    dismissed_at TEXT,                    -- NULL = first-run; ISO 8601 = dismissed
    criteria_met_at TEXT,                 -- auto-met (e.g., 'first_entity')
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_fcards_user_key ON oe_first_run_cards(user_id, card_key);
  ```
- GET `/api/ux-state/first-run-cards` — returns `{cards: {[key]: {dismissed_at, criteria_met_at}}}`
- POST `/api/ux-state/first-run-cards/:key/dismiss` — upserts `dismissed_at = NOW()`

---

### Part 3: Role getting-started checklist + Horizon progress surfacing

**Checklist model: SetupChecklist component** (already partially scaffolded in pages/src/components/launch/SetupChecklist.tsx)

The checklist is displayed on the Horizon (per-role workstation) as a sticky card above the lane list. It fetches real chain state via a new endpoint `GET /api/launch/:role/checklist`, which returns:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ipp:first_project",
        "label": "Create your first project",
        "description": "Set up the project file and basic details.",
        "href": "/ledger/ipp_projects?role=ipp_developer&compose=1",
        "done": false
      },
      {
        "id": "ipp:permits",
        "label": "File environmental permits",
        "description": "NEMA s.24 + water use authorization.",
        "href": "/ledger/environmental_authorisations?role=ipp_developer",
        "done": true  // counted from DB: WHERE project_id = user's_first_project
      },
      {
        "id": "ipp:financing",
        "label": "Secure financing commitment",
        "description": "Lender approval for your project.",
        "href": "/ledger/loan_facility_applications?role=ipp_developer",
        "done": false
      }
    ]
  }
}
```

**Per-role checklist specs:**

1. **esums_owner** (6 items)
   - ✓ "Create your first site" → POST to ledger, done when `om_sites.count > 0`
   - ✓ "Configure inverters and meters" → /esums/commissioning, done when `om_devices.count > 0`
   - ✓ "Link data sources" → /esums/data-sources, done when `om_data_sources.active > 0`
   - ✓ "Set alert thresholds" → /esums/alerts, done when `om_alert_rules.count > 0`
   - ✓ "Verify first telemetry" → /esums/sites, done when `om_readings.count > 0`
   - ✓ "View O&M predictive insights" → /esums/predictive, done when user visits

2. **ipp_developer** (5 items)
   - ✓ "Register your first project" → POST to ledger, done when `ipp_projects.count > 0`
   - ✓ "Run site assessment" → /ledger/site_assessments, done when `ipp_site_assessments.count > 0`
   - ✓ "Commission yield estimate" → /ledger/yield_estimates, done when `ipp_yield_estimates.count > 0`
   - ✓ "File permits & environmental approvals" → /ledger/environmental_authorisations, done when count > 0
   - ✓ "Secure financing commitment" → /ledger/covenant_certificate, done when lender has reviewed (W38)

3. **trader** (3 items)
   - ✓ "Update risk limits" → /surface/trader:risk-settings, done when `trading_risk_limits.updated_at > onboarding_completed`
   - ✓ "Place your first test order" → /deals?compose=1, done when `oe_trades.count > 0`
   - ✓ "Review daily position report" → /horizon, done when user has viewed "Today" bucket

4. **lender** (4 items)
   - ✓ "Set portfolio configuration" → /surface/lender:portfolio, done when `lender_fund_config.updated_at` is set
   - ✓ "Review your first financing request" → /ledger/credit_facility_applications, done when `oe_credit_facility_applications.count > 0`
   - ✓ "Monitor drawdowns" → /ledger/drawdown_chains, done when `oe_drawdown_chains.count > 0`
   - ✓ "Set up covenant alerts" → /surface/lender:covenant-alerts, done when `lender_alert_rules.count > 0`

5. **offtaker** (3 items)
   - ✓ "Set PPA preferences" → /onboard (already done in wizard), marked done after onboarding
   - ✓ "Browse available PPAs" → /deals?tab=available_ppas, done when `oe_ppa_inquiries.count > 0`
   - ✓ "Set up payment security" → /surface/offtaker:payment-security, done when `oe_ppa_payment_securities.count > 0`

6. **carbon_fund** (3 items)
   - ✓ "Link registry accounts" → /surface/carbon:registry-accounts, done when any registry oauth token is stored
   - ✓ "Upload project portfolio" → /ledger/carbon_projects, done when `oe_carbon_projects.count > 0`
   - ✓ "Configure verification rules" → /surface/carbon:verification-rules, done when `carbon_verification_rules.count > 0`

7. **grid_operator** (3 items)
   - ✓ "Configure dispatch zones" → /surface/grid:zones, done when `oe_grid_zones.participant_id = user AND count > 0`
   - ✓ "Review ancillary services" → /ledger/ancillary_services, done when user viewed the ledger
   - ✓ "Set grid code compliance rules" → /surface/grid:compliance-rules, done when rules exist

8. **regulator** (2 items)
   - ✓ "Review your jurisdiction" → /surface/regulator:jurisdiction, done when `regulator_config.jurisdiction_updated_at` is set
   - ✓ "Process first licence application" → /ledger/licence_application, done when `oe_licence_applications.chain_status != 'submitted'` (moved forward)

9. **support** (2 items)
   - ✓ "Configure SLA tiers" → /surface/support:sla-config, done when `support_sla_config.updated_at` is set
   - ✓ "Review your first ticket" → /ledger/support_ticket?filter=open, done when user clicked open

10. **admin** (1 item)
    - ✓ "Invite your first user" → /admin/users, done when `participants.count > 1` (more than just admin)

**Implementation:**
- New backend route `GET /api/launch/:role/checklist` reads from the provisioned entity IDs (from `oe_onboarding_provisioning_log`) and queries real chain counts.
- SetupChecklist renders above Horizon lanes if `items.remaining > 0` and not dismissed.
- Dismissal persists via `POST /api/ux-state/help-dismissals` (existing pattern).
- Progress auto-updates when user navigates (Horizon refetches on mount).

---

### Part 4: Sandbox practice transactions — isolated demo-tenant model

**Architecture: Isolated demo tenant for each role**

- On first login, if the user is completing onboarding for the **first time**, the system creates an isolated sandbox tenant:
  - Table: `oe_sandbox_tenants` (new migration 484)
    ```sql
    CREATE TABLE oe_sandbox_tenants (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      tenant_name TEXT,                  -- 'Demo: {role} - {participant name}'
      role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reset_at TEXT,                     -- when the user last chose "reset sandbox"
      UNIQUE(participant_id, role)
    );
    ```
  - All subsequent data written during onboarding (provisioned first site, first project, etc.) is scoped to `sandbox_tenant_id` = this ID.
  - The real tenant (where the user later conducts actual business) is a separate namespace, gated by KYC approval.

**Sandbox feature set — "L3 practice mode":**
- Same UI/UX as the real platform, but all transactions are reversible.
- Read-only views of Horizon and Ledger restricted to the sandbox tenant's data.
- Users can:
  1. Create test entities (sites, projects, trades) and drive them through the first few workflow steps.
  2. Invite demo counterparties (system-generated dummy accounts with predictable IDs, e.g., `demo_trader_1@sandbox.openenergy.co.za`).
  3. Execute a one-way end-to-end journey (e.g., an esums_owner: create site → configure devices → receive mock telemetry → check commissioning tab).
  4. Reset the sandbox to a clean state via `/api/sandbox/:sandbox_id/reset` (DELETE all entities for this tenant, keep the tenant row for idempotency).
  5. Graduate to the real tenant once KYC is approved (cascade event `kyc_verification.approved` → `UPDATE participants SET sandbox_graduated_at=NOW()`, lock sandbox writes).

**Sandbox labeling & separation:**
- Every Horizon lane, Ledger table, and Thread title displays a beta/demo chip: **"🧪 Sandbox"** (teal color, non-intrusive).
- API enforcement: every data query and mutation checks `participant.sandbox_tenant_id` if set, and filters to that tenant's scope.
- No synthetic kWh/billing/metering rows are ever inserted into sandbox tenants; data is mock (wire-frame only).
- Sandbox transactions do NOT fan out to real cascades (no notifications, no regulator inbox, no downstream chains). A sandbox order does not fire `trading_risk` chain updates.

**Mock data generation for end-to-end journey:**
- On sandbox creation, POST to `/api/sandbox/:sandbox_id/generate-journey` with a journey type (e.g., 'esums_onboarding'):
  - esums_onboarding: creates a site with 3 mock devices (Victron inverter, 2 sensors), generates 7 days of random telemetry (1-minute intervals), pre-configures alerts.
  - ipp_onboarding: creates a project with site assessment, yield estimate, permit stub.
  - trader_onboarding: creates 5 mock order books, seeds position snapshots.
  - **All routes through `/api/sandbox/...` POST to ensure no production data contamination.**

**Acquisition funnel — sandbox journey:**
1. User registers at /register with email + password.
2. Email verification link confirms identity; redirects to /verify?token=...
3. First login: OnboardingWizard runs (data collected, first entity provisioned to **sandbox tenant**).
4. LaunchRedirect detects `sandbox_tenant_id` is set, navigates to `/horizon?sandbox=true`.
5. Horizon + Ledger + Thread all display the sandbox chip and limit to sandbox data.
6. User navigates `/sandbox/generate-journey` to seed mock end-to-end data (opt-in button on Horizon empty state).
7. User rehearses the workflow (create order, advance status, etc.).
8. User clicks "Ready for real" → triggers KYC flow (see Part 5).
9. On KYC approval: cascaded event `kyc_verification.approved` → `UPDATE participants SET sandbox_graduated_at=NOW()`, sandbox writes lock, real tenant activates.
10. User can still view sandbox data (read-only) or reset it for another practice run.

**Sandbox reset endpoint:**
```
POST /api/sandbox/:sandbox_id/reset
Response:
{
  "success": true,
  "data": {
    "reset_at": "2026-06-17T14:23:00Z",
    "message": "Sandbox reset. All test data cleared. You can create new entities and try again."
  }
}
```
- Deletes all entities (om_sites, ipp_projects, oe_trades, etc.) scoped to `sandbox_tenant_id`.
- Keeps the `oe_sandbox_tenants` row (idempotency).
- Fires cascade event `sandbox.reset` for audit.

---

### Part 5: KYC / market-access gate — flow + states only (PII storage/encryption as HARD-GATE)

**KYC gate architecture: Gated by `kyc_status` column (participants table)**

The KYC gate is a series of states, not a single form. It blocks real-world transacting (trading orders, PPA execution, settlement) until a regulator or admin approves the participant.

**KYC state machine: `kyc_status` enum values**

```
'not_started'    → User logged in, no KYC submitted yet
   ↓ (user submits form)
'submitted'      → Form received; waiting for review
   ↓ (admin/regulator reviews)
'under_review'   → Assigned to an officer; evidence/docs being verified
   ↓ (review complete)
'approved'       → GRANT — participant can now transact in real markets
'approved_conditional' → GRANT with conditions (e.g., "restricted to <R10m orders")
'rejected'       → DENY — participant not admitted; can reapply after 90 days
'suspended'      → Previously approved, now revoked (e.g., sanctions match, breach)
```

**KYC submission flow (frontend):**
1. Post-onboarding, on first visit to Horizon or any Ledger, the UI shows a modal: **"KYC verification required before trading"**
   - Title: "Verify your identity"
   - Body: "To trade or settle, we need to verify your company and individuals. Takes 5 minutes."
   - Actions: "Start KYC" (primary), "Later" (ghost)
2. Click "Start KYC" → navigate to `/kyc/verify` (new surface)
3. Multi-step form (L2 depth for now, extensible to L4):
   - Step 1: Company details (name, reg no, VAT, address)
   - Step 2: Beneficial ownership (if entity is a trust/partnership)
   - Step 3: Individual officer (name, ID, role)
   - Step 4: Terms agreement + data consent checkbox ("I consent to KYC checks including sanctions screening and credit bureau inquiries")
4. Submit form → `POST /api/kyc-verifications` (new endpoint; idempotent on participant_id)
   - Request body: `{company_details, beneficial_owners, officers, consent_signed_at}`
   - Response: `{success: true, kyc_verification_id, status: 'submitted'}`
   - **IMPORTANT: Form data is NOT persisted to DB here.** Only `kyc_status='submitted'` and a timestamp are recorded. Actual company/officer details go to a **separate encrypted vault** (PII hard-gate; design only, not implemented). The KYC audit trail lives in `oe_kyc_verifications` table, which logs state transitions but NOT the sensitive data.
5. Update `participants.kyc_status = 'submitted'`.
6. Fire cascade event `kyc_verification.submitted` → admin inbox alert (new).

**KYC verification table (audit trail only; no PII stored):**
```sql
CREATE TABLE oe_kyc_verifications (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'submitted' | 'under_review' | 'approved' | 'approved_conditional' | 'rejected' | 'suspended'
  submitted_at TEXT,
  reviewed_by TEXT,                 -- admin or regulator participant_id
  reviewed_at TEXT,
  decision_reason TEXT,             -- "Sanctions match: Crimea list" / "Approved for <R10m/day"
  condition_text TEXT,              -- if approved_conditional
  reapply_after_days INTEGER DEFAULT 90,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(participant_id)
);
```

**KYC review flow (admin/regulator):**
1. Admin/regulator sees a KYC Verification Inbox on their Horizon.
   - Lane key: `kyc_verification` (new chain W115 or treated as admin task queue).
   - Status counts: "Submitted: 5 | Under review: 2 | Approved: 127".
2. Click "Under Review" → filter to cases assigned to them.
3. Open a case detail (Thread-like view):
   - Display: participant name, company, submitted at
   - Actions:
     - "Approve" → `PUT /api/kyc-verifications/:id/approve` with optional condition text
     - "Request more info" → comment + async email to participant
     - "Reject" → `PUT /api/kyc-verifications/:id/reject` with reason + reapply_after_days
     - "Mark under review" → self-assignment
4. On approve/reject: update `participants.kyc_status`, fire cascade event `kyc_verification.approved` / `kyc_verification.rejected`.

**Market-access blocking (pre-trade guard):**
- Every order creation, drawdown request, trade initiation, or settlement flow checks:
  ```typescript
  if (participant.kyc_status !== 'approved' && participant.kyc_status !== 'approved_conditional') {
    throw new AppError(ErrorCode.FORBIDDEN, 'KYC verification required to transact', 403);
  }
  ```
- If `approved_conditional` with condition text parsed as `{max_order_zar: 10_000_000}`, enforce that limit at order-submission time.
- Rejected or suspended participants see: **"Your account is not eligible to trade at this time. Contact support."**

**PII storage/encryption — HARD-GATE (design only, NOT implemented autonomously):**
- **This is an external commitment.** The form collects PII (company name, officer names, ID numbers, addresses) but **the backend does NOT store them in open text or in the primary D1 database**.
- Instead:
  1. Form data is POSTed to `/api/kyc-verifications` with a `vault_token` generated by a separate PII-encryption service (out of scope; could be Cloudflare Secret Manager, AWS Secrets Manager, or a third-party KYC provider like IDEMIA, GB Group, Onfido, or a local South African provider like Verify.co.za or Thales Data).
  2. The D1 record stores only `{kyc_verification_id, participant_id, status, vault_token_ref}` — no plaintext PII.
  3. Admin review workflow: on case detail, if admin clicks "View submitted details", the SPA calls `GET /api/kyc-verifications/:id/details` which fetches the encrypted blob from the vault, decrypts it (via a Cloudflare Worker env secret), and displays it in a sensitive-data component (watermarked, no copy-paste, auto-expires from DOM after 5 minutes).
  4. **The decision is NOT automatic.** It is a manual human-in-the-loop review by an admin/regulator who sees the decrypted data on-screen but whose action (`approve` / `reject`) stores only the decision, not the data.

**Why the HARD-GATE?**
- POPIA (Promotion of Access to Personal Information Act, South African privacy law) and GDPR (if EU users) require explicit encryption of personal data at rest.
- Storing ID numbers or passport data in plaintext, even in an "encrypted database", creates liability.
- **Design says:** "The system collects KYC data, stores only the decision, and delegates the secure vault to a third party." Implementation teams must plan for that third-party integration separately; this design does NOT attempt to build the encryption layer.

---

### Part 6: Acquisition/invite funnel — register → invite → first-login → /onboard → /horizon (unified DB-authoritative)

**Onboarding store: Single source of truth**

Two flows merge: **Self-service registration** and **Admin invite**.

**Path A: Self-service registration**
1. Marketing → click "Sign up" → `/register` (unauthenticated page)
2. Form: email, password, name, company_name, role
3. POST `/auth/register` → creates `participants` row with `status='pending'`, sends email verification token (token generated and persisted in `password_reset_tokens` or a dedicated `email_verification_tokens` table — existing pattern from auth.ts)
4. Email: "Verify your email" + link `/verify-email?token=...`
5. Click link → `GET /verify-email?token=...` → consumes token, sets `participants.email_verified=1`, redirects to `/login`
6. Login → JWT issued → LaunchRedirect checks `onboarding_completed` → routes to `/onboard` (if false) or `/horizon` (if true)
7. OnboardingWizard runs → `POST /api/onboarding/complete` → fires cascade event `onboarding.completed` → provisioning rule runs → user navigates to `/horizon`

**Path B: Admin invite (bulk user acquisition for a tenant)**
1. Admin at `/admin/users` clicks "Invite user"
2. Form: email(s), role, optionally pre-fill company_name
3. POST `/admin/invite-users` (new endpoint):
   - Creates `participants` rows with `status='active'` (pre-approved; no email verification needed)
   - Generates temporary password or passwordless token
   - Sends email: "Your account is ready. Click here to set your password and get started: /set-password?token=..."
4. Invitee clicks link → `/set-password?token=...` (unauthenticated page)
   - Consumes token, shows password creation form
   - POST `/auth/set-password` → sets password, sets `participants.email_verified=1`
   - Redirects to `/login`
5. Login → JWT issued → LaunchRedirect checks `onboarding_completed` → routes to `/onboard`
6. OnboardingWizard runs (same flow as Path A)

**Unified DB schema (participants table additions):**
```sql
ALTER TABLE participants ADD COLUMN IF NOT EXISTS onboarding_completed INTEGER DEFAULT 0;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS onboarding_skipped INTEGER DEFAULT 0;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS onboarding_step TEXT DEFAULT 'welcome';
ALTER TABLE participants ADD COLUMN IF NOT EXISTS onboarding_data TEXT;        -- JSON
ALTER TABLE participants ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 0;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'not_started';
ALTER TABLE participants ADD COLUMN IF NOT EXISTS sandbox_tenant_id TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS sandbox_graduated_at TEXT;
```

**State after first login (both paths):**
- `participants.status = 'active'` (both paths end here)
- `participants.email_verified = 1` (Path A: user clicked; Path B: admin action)
- `participants.onboarding_completed = 0` (wizard not finished)
- `participants.onboarding_step = 'welcome'` (first screen)
- `participants.kyc_status = 'not_started'` (KYC gate not triggered)
- `participants.sandbox_tenant_id = <uuid>` (created by onboarding provisioning rule, or null if role has no first entity)

**Email template (single "activation" email used by both paths):**
```
Subject: Welcome to the Consolidated Energy Cockpit, {first_name}

Hi {first_name},

Your account is ready. Sign in and complete your setup in about 2 minutes.

[BUTTON: Get started → {login_url}]

You've been set up as a {role_label} on our energy exchange platform. Once you log in, you'll be walked through a quick onboarding to set up your workspace.

Questions? Contact support@openenergy.co.za

— The Open Energy Team
```

**Email seam — two tables, one query:**
```sql
-- When to send invitation emails (cron job at signup & admin-invite):
SELECT id, email, role, name, created_at
  FROM participants
  WHERE email_verified = 0
    AND created_at > (NOW() - INTERVAL 1 HOUR)
    AND status IN ('pending', 'active');
```
- Path A (self-service): lookup token in `email_verification_tokens` table
- Path B (admin invite): lookup token in `password_reset_tokens` or new `invite_tokens` table (whichever is cleaner)

---

### Part 7: Complete per-role layout & UX — Onboarding Wizard screens

**Layout model: Full-page centered card (OnboardingWizard.tsx)**

All steps follow the same frame:
- **Top:** 1px accent bar (role color, 15% opacity)
- **Left margin:** role chip (e.g., "IPP Developer" with color) + progress dots (8px circles, filled=done, active=wide, future=gray)
- **Center:** white card (rounded-xl, 1px border #dde4ec, max-width 512px, centered in viewport)
  - Accent bar (0.5px height, role color, 100% width, top-left of card border)
  - Step header (visible except on "welcome"):
    - "Step N of M" (uppercase, 11px, #6b7685, tracking-wider)
    - Title (20px semibold, #0f1c2e)
    - Subtitle (13px, #6b7685, optional)
  - Content area (p-8, form fields or welcome prose)
  - Error message (red-50 bg, red-200 border, red-700 text, if validation fails)
- **Bottom:** sticky action bar (flex, justify-between)
  - Left: "Skip setup" link (12px, underline, #6b7685 hover:#3a4658)
  - Right: "Back" button (border, ghost) + "Continue" / "Finish setup" button (primary, role color)

**Welcome step (all roles):**
- Title: "Welcome to the Consolidated Energy Cockpit, {first_name}"
- Decorative grid pattern background (opacity 3%, no interaction)
- Role-specific description (from ROLE_DESCS in steps.tsx)
- "This will take about 2 minutes" (12px, uppercase, #6b7685)
- Primary button: "Get started"

**Form step patterns (esums_owner / ipp_developer / trader / etc.):**
- Grid layout (grid-cols-2 gap-x-4 gap-y-3) for label-input pairs
- Fields: text, number, select, checkbox, date, checkbox-array
- Labels: 12px font-medium, #3a4658
- Inputs: 13px, h-9 (36px), border #dde4ec, focus:border-[role-color], rounded
- Select options: alphabetical or semantic grouping (provinces, technologies, etc.)
- Validation: errors shown inline below field, red text, 12px
- Placeholder text: "e.g. Stellenbosch Solar Farm" (descriptive, not instruction)

**Form fields per role (from steps.tsx ~150–800):**

**esums_owner — site_setup step:**
- Site name (text, required, max 100 chars)
- Site type (select: Solar PV, Wind, BESS, Hybrid)
- Installed capacity (number, kW, required)
- Location province (select: 9 SA provinces)
- Grid connection type (select: on-grid, off-grid, hybrid)

**ipp_developer — company_profile step:**
- Company name (text, required)
- Company registration number (text, CIPC format, required)
- Annual turnover (number, ZAR, optional)
- Primary sector (select: renewable energy, conventional, mixed)

**ipp_developer — first_project step:**
- Project name (text, required, max 120 chars)
- Capacity (number, MW, required)
- Technology (multi-checkbox: Solar PV, Wind, Biomass, Hydro)
- Target location province (select)
- Estimated COD (date picker, required)

**trader — entity step:**
- Entity name (text, required)
- FSCA licence number (text, optional but recommended)
- LEI (Lookup Exchange Identifier) (text, optional)
- Primary contact (text, email-like)

**trader — risk_limits step:**
- Daily VaR limit (number, ZAR, required)
- Position limit (number, MWh, required)
- Counterparty exposure (number, ZAR, required)
- Mark-age tolerance (number, hours, required)

**lender — fund_setup step:**
- Fund name (text, required)
- AUM (number, ZAR, required)
- Fund type (select: Project Finance, Green Bonds, Mezzanine)
- Mandate start (date picker)

**lender — coverage step:**
- Focus technologies (multi-checkbox: Solar, Wind, Hydro, Hybrid)
- Provinces of interest (multi-checkbox: all 9)
- Preferred loan tenor (number, years)
- Min ticket size (number, ZAR, optional)

**offtaker — entity step:**
- Entity name (text, required)
- Annual consumption (number, MWh, required)
- Industry/sector (select: mining, manufacturing, retail, other)
- Preferred provinces (multi-checkbox)

**offtaker — ppa_prefs step:**
- PPA term (number, years)
- Preferred technology (multi-checkbox: Solar, Wind, Hybrid)
- Price sensitivity (radio: fixed rate, index-linked, flexible)
- Minimum contract size (number, MWh)

**carbon_fund — registry step:**
- Registry accreditations (multi-checkbox: Verra, Gold Standard, Article 6, PoA)
- Regional focus (select: Africa, Global, Specific countries)
- Primary contact (text)

**carbon_fund — methodology step:**
- Technology focus (multi-checkbox: Renewable Energy, Agriculture/Forestry, Cookstove, Methane)
- Vintage preference (radio: current year, 1–2 year lag, flexible)
- Typical price target (number, USD/credit, optional)

**grid_operator — authority step:**
- Operator name (text, required)
- Grid zone (select: G1, G2, G3, G4)
- Managed capacity (number, MW, required)

**grid_operator — services step:**
- Ancillary services (multi-checkbox: Frequency Control, Voltage Support, Reactive Power, Black Start)
- Procurement model (select: auction, direct, hybrid)
- Contact for nominations (text, email)

**regulator — body step:**
- Regulator body name (text, required)
- Jurisdiction scope (radio: National, Provincial, Regional)

**regulator — jurisdiction step:**
- Licence classes managed (multi-checkbox: On-grid, Off-grid, Micro, Embedded)
- Escalation email (text, email format, required)
- Case routing (textarea, optional, for custom rules)

**support — org step:**
- Organization name (text, required)
- OEM brands (multi-checkbox: Sunsynk, Victron, SMA, Huawei, Solax, Other)
- Coverage footprint (multi-checkbox: all 9 provinces)

**support — sla step:**
- P1 SLA (minutes, required, default 60)
- P2 SLA (minutes, required, default 240)
- P3 SLA (hours, required, default 24)
- Escalation email (text, email format, required)

---

### Part 8: Responsive reflow (<760px mobile) + a11y compliance

**Responsive grid:**
- < 760px: `grid-cols-1` (single column)
- ≥ 760px: `grid-cols-2` (existing two-column grid for label pairs)
- Card max-width stays 512px; padding scales (p-6 on mobile, p-8 on desktop)

**A11y requirements:**
- Form labels: associated `htmlFor` to input `id` (all `<Field>` children must have id)
- Focus indicators: `:focus-visible` on inputs, button focus rings (not suppressed)
- Colors meet WCAG AA: input text #0f1c2e on white (contrast 10:1+), label #3a4658 (7:1+)
- Error messages: red-700 (#ba1a1a) on red-50 (#ffebee) = 8:1 contrast
- Progress dots and buttons: role-color is role-specific (see ROLE_COLORS); all pass AA when tested against white/light backgrounds
- Aria labels: "Skip tour" on close button, "Back" button, "Continue" button all have text content (no icon-only buttons)
- Focus restore: when wizard closes, focus returns to the launcher (LaunchRedirect)
- Keyboard navigation: Tab through form fields, Shift+Tab back, Enter on primary button, Escape on "Skip setup"
- Modals: not aria-modal (single-page, not stacked); background does not scroll (body `overflow-y: hidden` while wizard is active)

---

### Summary table: What each role provisions on onboarding completion

| Role | First entity | Entity type | Table | Status | SLA set | Notes |
|---|---|---|---|---|---|---|
| esums_owner | Site | om_sites | om_sites | planned | Yes (W12 SLA) | provisioning rule `registerOnboardingProvisioningRules()` |
| ipp_developer | Project | ipp_projects | ipp_projects | development | No | creates in DB; no W1 chain entry yet |
| trader | None | — | — | — | — | profile-only; KYC gate instead |
| lender | None | — | — | — | — | profile-only |
| offtaker | None | — | — | — | — | profile-only |
| carbon_fund | None | — | — | — | — | profile-only |
| grid_operator | None | — | — | — | — | profile-only |
| regulator | None | — | — | — | — | profile-only |
| support | None | — | — | — | — | profile-only |
| admin | None | — | — | — | — | no-op |
| esco | None (BROKEN) | — | — | — | — | falls back to 'none' log entry, admin alert |
| epc_contractor | None (BROKEN) | — | — | — | — | falls back to 'none' log entry, admin alert |
