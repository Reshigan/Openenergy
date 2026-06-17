## Role journey: carbon_fund

### Role Overview

Carbon_fund manages the complete lifecycle of carbon credits: registration (W37), monitoring/verification (W11), issuance (W82), quality rating (W109), forward delivery/ERPAs (W65), retirement (W17), reversals (W42), and tax offset claims (W48). Cross-role interactions occur with offtaker (Scope 3 disclosure, REC retirement), regulator (Article 6, CCP denial escalations), and trader (carbon trading).

### Frontdoor Classification (Tiles vs Thread-only vs Dossier)

**Owned/Initiator chains (→ Atlas tile + Horizon lane):**
- Project Pipeline: `carbon_registration` (W37), `crediting_period_renewal` (W56), `poa_cpa_inclusion` (W73), `vcm_project_development`
- MRV & Verification: `mrv_submissions` (W11), `ccp_assessment` (W91), `methodology_amendment`
- Issuance & Registry: `carbon_issuance` (W82), `certificate_bundle`
- Retirement & Offset: `carbon_retirement` (W17), `carbon_reversal` (W42), `carbon_offset_claim` (W48), `carbon_tax_return`, `carbon_budget`
- Trading & Markets: `carbon_erpa` (W65), `carbon_credit_rating` (W109)

**Counterparty-only (→ Thread-reachable, NO flat tile):**
- `article6_adjustment` (W4) — co-laned with offtaker, regulator; carbon_fund reads/comments but does NOT initiate
- `carbon_scope3_disclosure` — offtaker initiates, carbon_fund validates/assures
- `esg_disclosure` (W103) — three-way lane (carbon_fund / offtaker / regulator); carbon_fund engages assurance + files

**Non-chain surfaces (→ /surface/:key):**
- `carbon_fund:vintages` — vintage pipeline registry (non-chain)
- `carbon_fund:mrv` — MRV submission repository (non-chain)
- `carbon_fund:certificates` — issued certificate registry (non-chain)
- `carbon_fund:reports` — carbon reports & exports
- `carbon_fund:audit` — audit panel

---

### 1. Acquisition & First Login

**Pre-launch:**
- Admin invites carbon_fund user via `/api/admin/invite` → email + registration link
- User lands on `/auth/register`, enters password, lands at LaunchRedirect

**Post-login redirect logic** (`pages/src/App.tsx` LaunchRedirect):
- `GET /api/onboarding/state` → returns `{ step, data, completed, skipped, role: 'carbon_fund' }`
- If `completed: false` → redirect to `/onboard` (OnboardingWizard)
- If `completed: true` → redirect to `/horizon`

---

### 2. Onboarding Wizard (Role-Specific Steps)

**Sequence** (from `ONBOARDING_STEPS.carbon_fund`):
```
['welcome', 'registry', 'methodology', 'complete']
```

**Step 1: Welcome**
- Screen: `OnboardingWizard` displays full-screen card
- Content: Logo, "Welcome to Open Energy Platform carbon_fund workspace"
- CTA: "Let's set up your carbon portfolio" → POST `/api/onboarding/step` with `{ step: 'welcome', data: {} }` → `next_step: 'registry'`
- Empty state message: "You are the first from your organization using the platform. Let's get started."

**Step 2: Registry Selection**
- Screen: Multi-select card — "Which carbon registry(ies) will you work with?"
- Options (from dropdown `GET /api/ledger/lookup/carbon_registries`):
  - ☐ Gold Standard
  - ☐ Verra
  - ☐ Article 6.4 / UNFCCC
  - ☐ CDM (legacy)
  - ☐ Other
- Form fields:
  - `selected_registries` (array of enum values) — required
  - `registry_contact_email` (string) — optional, multi-entry
  - `portfolio_focus` (enum: `compliance | voluntary | both`) — required
- Validation: minimum 1 registry selected
- POST → `next_step: 'methodology'`

**Step 3: Methodology Library Setup**
- Screen: Card — "Load initial methodology baselines"
- Content: "To streamline registrations, we'll load common methodologies (VM0038, ACM0019, etc.) into your account."
- Form fields:
  - `load_baseline_methodologies` (checkbox) — default checked
  - `custom_methodology_names` (text area) — optional
  - `baseline_qp_filename` (file upload) — optional PDF/XLS
- Button: "Load methodologies" → POST → `next_step: 'complete'`

**Step 4: Complete**
- Screen: "You're all set!"
- Summary:
  ```
  Registries:    [Gold Standard, Verra]
  Methodologies: 8 loaded
  ```
- Button: "Launch workspace" → POST `/api/onboarding/complete` → fireCascade(`onboarding.completed`, event fires provisioning cascade)

**Provisioning (cascade rule):**
- `onboarding_provisioning.ts`: carbon_fund role has `kind: 'none'` → no first entity created
- Reasoning: carbon_fund doesn't "own" a project; they manage external proponents' projects
- First real entity: user must initiate a `carbon_registration` chain (manual registration of a proponent's project)

**First-run state after complete:**
- Redirect to `/horizon`
- Horizon loads `GET /api/horizon/carbon_fund`
- All 5 lanes empty → shows empty state per lane

---

### 3. Landing on Horizon (`/horizon`)

**Layout:**
```
╔════════════════════════════════════════════════════════════════════════════╗
║  MeridianFrame (chrome)                                                    ║
║  Header: "Horizon | Workspace for carbon_fund" | ⌘K (Atlas) | Profile menu║
║  ┌────────────────────────────────────────────────────────────────────────┐
║  │ Horizon — Live workspace                                               │
║  │ ╭─────────────────────────────────────╮                                │
║  │ │ Duty (Top 8 by attention score)     │  ← sorted by deadline breach + │
║  │ │                                      │     quantum ZAR                │
║  │ │ (Empty on first login)              │                                │
║  │ ╰─────────────────────────────────────╯                                │
║  │                                                                         │
║  │ Lanes (per laneKey from MERIDIAN_CHAINS):                              │
║  │                                                                         │
║  │ ┌─ project_pipeline ─────────────────────────────┐                    │
║  │ │ Project registration, crediting renewal, PoA   │                    │
║  │ │ (empty)                                         │                    │
║  │ └─────────────────────────────────────────────────┘                    │
║  │                                                                         │
║  │ ┌─ mrv_verification ─────────────────────────────┐                    │
║  │ │ MRV submissions, CCP assessment, methodology   │                    │
║  │ │ (empty)                                         │                    │
║  │ └─────────────────────────────────────────────────┘                    │
║  │                                                                         │
║  │ ┌─ issuance_registry ────────────────────────────┐                    │
║  │ │ Credit issuance, certificate bundles           │                    │
║  │ │ (empty)                                         │                    │
║  │ └─────────────────────────────────────────────────┘                    │
║  │                                                                         │
║  │ ┌─ article6_compliance ──────────────────────────┐                    │
║  │ │ Article 6 ITMO, ESG/Scope 3 disclosure         │                    │
║  │ │ (empty)                                         │                    │
║  │ └─────────────────────────────────────────────────┘                    │
║  │                                                                         │
║  │ ┌─ retirement_offset ────────────────────────────┐                    │
║  │ │ Retirements, reversals, offset claims, tax ret │                    │
║  │ │ (empty)                                         │                    │
║  │ └─────────────────────────────────────────────────┘                    │
║  │                                                                         │
║  │ ┌─ trading_markets ──────────────────────────────┐                    │
║  │ │ ERPA forward delivery, credit-quality rating   │                    │
║  │ │ (empty)                                         │                    │
║  │ └─────────────────────────────────────────────────┘                    │
║  │                                                                         │
║  │ Counts: 0 total | 0 breached                                           │
║  └────────────────────────────────────────────────────────────────────────┘
║                                                                             ║
╚════════════════════════════════════════════════════════════════════════════╝
```

**Empty state (first run):**
- Hero card: "Welcome to your carbon workspace"
  - "You have no active cases yet. Discover functions in Atlas to get started."
  - Button: "Open Atlas" (⌘K)
  - Button: "Learn more" → link to docs
- All 5 lanes show: "No cases" + faint icon
- Duty list: empty

**States after cases populate:**
- Lane: `project_pipeline` — each row is a `carbon_registration` case
  ```
  ZA-CFD-2026-001 | Gold Standard solar project | validation → 5 days | $0 (no quantum)
  ```
  - Columns: ref, title, status, deadline bucket, actions (edit, reject, approve)
- Lane: `mrv_verification` — each row is a `mrv_submissions` case
  ```
  MRV-2026-Q2 | Site: Lesotho PV | site_audit → 3 days | 1,200 tCO2e
  ```
- Lane: `issuance_registry` — each row is a `carbon_issuance` case
  ```
  ISS-2026-0045 | Project: Kenya Wind | screening → 12 days | 50,000 tCO2e
  ```

**Keyboard/focus:**
- Arrow keys: cycle through duty cases
- Enter: open selected case detail (→ `/thread/:chainKey/:id`)
- Escape: deselect
- Tab: navigate lane headers

**Responsive (<760px):**
- Stack lanes vertically
- Reduce card density, wrap long titles
- Drawer-style detail on `/thread/:id`

**Accessibility:**
- Each lane: `<section aria-label="Lane: project_pipeline">` 
- Lane heading: H2
- Case rows: `role="button"` with `aria-label="Carbon registration ZA-CFD-2026-001, validation, 5 days remaining"`
- Status badge: `<span aria-label="status: validation">Validation</span>`

---

### 4. Atlas Discovery (`/atlas`, ⌘K)

**Modal:** Full-canvas overlay, search + command palette

**Tabs / Categories:**
- **Project Pipeline** (5 tiles, all accessible)
  - **Project registration** → `/ledger/carbon_registration` (List → +New)
  - **Crediting renewal** → `/ledger/crediting_period_renewal`
  - **PoA / CPA inclusion** → `/ledger/poa_cpa_inclusion`
  - Vintage workflow → `/surface/carbon_fund:vintages` (read-only registry)
  - VCM project development → `/ledger/vcm_project_development`

- **MRV & Verification** (5 tiles)
  - **Verification chain** → `/ledger/mrv_submissions` + lane
  - **CCP eligibility** → `/ledger/ccp_assessment`
  - Methodology amendments → `/ledger/methodology_amendment`
  - MRV submissions → `/surface/carbon_fund:mrv` (repository)

- **Issuance & Registry** (3 tiles)
  - **Credit issuance** → `/ledger/carbon_issuance`
  - Certificate bundles → `/ledger/certificate_bundle`
  - Retirement certificates → `/surface/carbon_fund:certificates` (registry)

- **Article 6 & Compliance** (5 tiles)
  - **Article 6 ITMO** → `/thread/article6_adjustment` (thread-only; no tile initiation — carbon_fund is counterparty, counterparty_role: 'regulator' initiates)
  - **ESG disclosure** → `/thread/esg_disclosure` (thread-only co-lane; also via offtaker initiation)
  - **Scope 3 disclosure** → `/thread/carbon_scope3_disclosure` (thread-only)
  - Reports → `/surface/carbon_fund:reports`
  - Audit → `/surface/carbon_fund:audit`

- **Retirement & Offset** (5 tiles)
  - **Retirement chain** → `/ledger/carbon_retirement`
  - **Reversals** → `/ledger/carbon_reversal`
  - **Tax offset claims** → `/ledger/carbon_offset_claim`
  - Carbon tax returns → `/ledger/carbon_tax_return`
  - Carbon budget → `/ledger/carbon_budget`

- **Trading & Markets** (3 tiles)
  - **Forward ERPA delivery** → `/ledger/carbon_erpa`
  - **Credit quality rating** → `/ledger/carbon_credit_rating` + initiation form
  - OTC carbon trading → `/surface/carbon_fund:carbon_trading` (deal book, non-chain)

**Hidden / Unreachable chains:**
- None flagged as unreachable per audit (carbon_registry_transfer mentioned in memory but not in roleData)

**Search:**
- User types "registration" → filters to "Project registration", highlights result
- User types "W65" → filters to "Forward ERPA delivery (W65)"
- User types "issuance" → multi-match (Credit issuance, CCP assessment)

**Copy strings (exact from DOM):**
- "Project registration" (feature label)
- "Gold Standard / Verra / Art 6.4 registration (W37)" (description)
- "Create a new project registration"
- "Opens a new carbon credit lifecycle"

---

### 5. Primary Owned Transaction: Carbon Registration (W37) End-to-End

**Chain key:** `carbon_registration` (Wave 37)

**Entry point:**
- Atlas → Project Pipeline → "Project registration" → Click → `/ledger/carbon_registration?role=carbon_fund`

**Ledger page** (`/ledger/carbon_registration`):
- Header: "Project registrations | Carbon Fund workspace"
- Subheader: "UNFCCC-compliant project registration for Gold Standard / Verra / Article 6.4"
- KPIs row:
  ```
  Registrations: 0  |  Under validation: 0  |  Breached: 0  |  Registered: 0
  ```
- List (empty): "No project registrations yet"
- CTA button: "+ New registration" (primary tone)
- Filters row (inactive): Registry (multi-select), Status (multi-select), Deadline (date range)

**+New form** (initiated from `/ledger/carbon_registration` or `/surface/` path):

Opens modal/drawer: "Create project registration"

**Section 1: Project Details**
- `project_name` (string, required, 255 char limit)
  - Placeholder: "e.g. Lesotho Grid-Scale Solar PV"
  - Validation: non-empty, no SQL keywords
- `location_country` (lookup → `GET /api/ledger/lookup/countries`)
  - Dropdown, default: "South Africa"
- `project_type` (enum, required)
  - Options: solar_pv, wind, hydro, biogas, geothermal, waste_heat, efficiency, other
- `technology_description` (text area, optional)

**Section 2: Registry & Methodology**
- `target_registry` (lookup → `GET /api/ledger/lookup/carbon_registries`)
  - ☐ Gold Standard
  - ☐ Verra
  - ☐ Article 6.4
  - ☐ CDM
  - Default: from onboarding `selected_registries` (if single, pre-fill)
- `methodology_id` (lookup → `GET /api/ledger/lookup/methodologies`)
  - Filtered by selected registry
  - Dropdown shows: VM0038 (Solar), VM0015 (Wind), etc.
- `methodology_version` (string, auto-filled from lookup)

**Section 3: Crediting Period & Scale**
- `crediting_period_years` (number, required, 1–30)
  - Default: 10
- `estimated_annual_tco2e` (number, required, unit: tCO2e)
  - Placeholder: "123456"
- `estimated_total_tco2e` (computed, read-only, auto-fill: annual × years)

**Section 4: Proponent**
- `proponent_party_name` (string, required)
  - Placeholder: "e.g. SolarCo Ltd"
  - Validation: non-empty, matches SQL allow-list (no injection)
- `proponent_email` (email, required)
- `proponent_contact_person` (string, optional)

**Validation & Save:**
- "Next" button (disabled until all required fields filled)
- On click: POST `/api/carbon-registration/chain`
  - Payload:
    ```json
    {
      "project_name": "Lesotho Solar PV",
      "location_country": "LS",
      "project_type": "solar_pv",
      "target_registry": "verra",
      "methodology_id": "VM0038",
      "crediting_period_years": 10,
      "estimated_annual_tco2e": 12500,
      "proponent_party_name": "SolarCo Ltd",
      "proponent_email": "contact@solarco.ls"
    }
    ```
- Response: `{ success: true, data: { id: "creg-2026-0001", ref: "ZA-CFD-2026-001" } }`
- Redirect: `/thread/carbon_registration/creg-2026-0001`

---

### 6. State Machine Transitions (Carbon Registration Lifecycle)

**Terminal states:** `['registered', 'rejected', 'withdrawn']`

**Status progression** (from chain definition):

```
pdd_draft
  ↓ [action: draft-pdd]
  ├─ Fields: pdd_ref, methodology, crediting_years, est_annual_tco2e, est_total_tco2e
  ├─ Hint: "Advances the carbon registration chain to pdd drafted"
  ├─ Tone: default
  ↓
validation
  ├─ [action: request-corrections] → corrections_required
  │  └─ Fields: car_ref, corrections_basis
  ├─ [action: resubmit] → validation (loop)
  ├─ [action: open-consultation] → public_comment
  │  └─ Fields: consultation_ref, consultation_basis
  ├─ [action: authorize-dna] → dna_authorization
  │  └─ Fields: dna_authorization_ref, dna_basis
  ↓
public_comment
  ├─ [action: open-consultation] (re-open)
  ├─ [action: authorize-dna] → dna_authorization
  ↓
dna_loa
  ├─ [action: request-registration] → registration_requested
  │  └─ Fields: registration_ref, registration_basis
  ↓
registered ✓ (TERMINAL)
  └─ [action: activate-crediting]
     └─ Fields: registered_serial_block, est_total_tco2e
     └─ Hint: Activates crediting and closes the case

[REJECTION PATH]
validation / public_comment / dna_loa
  ├─ [action: withdraw] → withdrawn ✗ (TERMINAL)
  │  └─ Fields: withdrawal_basis, reason_code (evidence)
  │  └─ Tone: oxide
  ├─ [action: reject] (by regulator counterparty) → rejected ✗ (TERMINAL)
  │  └─ Only regulator can do this via thread interaction
```

**Thread Detail View** (`/thread/carbon_registration/creg-2026-0001`):

```
╔═════════════════════════════════════════════════════════════════════════════╗
║ MeridianFrame                                                               ║
║ ┌─────────────────────────────────────────────────────────────────────────┐
║ │ Thread: Carbon Registration "Lesotho Solar PV"                          │
║ │ ZA-CFD-2026-001 | Status: pdd_draft | Deadline: — | Est. 125,000 tCO2e  │
║ └─────────────────────────────────────────────────────────────────────────┘
║                                                                             ║
║ ┌─ LEFT PANEL (CASE DETAIL) ────────────────────────────────────────────┐ ║
║ │                                                                       │ ║
║ │ Status card:                                                         │ ║
║ │  pdd_draft                                                          │ ║
║ │  No deadline set                                                    │ ║
║ │                                                                       │ ║
║ │ Key facts:                                                          │ ║
║ │  Project:      Lesotho Solar PV                                    │ ║
║ │  Location:     Lesotho (LS)                                        │ ║
║ │  Technology:   Solar PV                                            │ ║
║ │  Registry:     Verra                                               │ ║
║ │  Methodology:  VM0038 v19                                          │ ║
║ │  Crediting:    10 years                                            │ ║
║ │  Est. annual:  12,500 tCO2e                                        │ ║
║ │  Est. total:   125,000 tCO2e                                       │ ║
║ │  Proponent:    SolarCo Ltd (contact@solarco.ls)                    │ ║
║ │                                                                       │ ║
║ │ Actions panel:                                                      │ ║
║ │  [D] Draft PDD ← enabled (current state)                           │ ║
║ │      Screening ref: ___________                                    │ ║
║ │      Basis/evidence: ___________                                   │ ║
║ │      [→ SUBMIT] button                                             │ ║
║ │                                                                       │ ║
║ │  [R] Request corrections ← disabled (not yet in validation)        │ ║
║ │  [O] Open consultation ← disabled                                  │ ║
║ │  [A] Authorize DNA ← disabled                                      │ ║
║ │  [W] Withdraw ← enabled (any state)                                │ ║
║ │                                                                       │ ║
║ │ (scroll reveals more actions, audit trail)                          │ ║
║ │                                                                       │ ║
║ └─────────────────────────────────────────────────────────────────────┘ ║
║                                                                             ║
║ ┌─ RIGHT PANEL (THREAD) ─────────────────────────────────────────────┐   ║
║ │ Messages & Activity                                                │   ║
║ │                                                                     │   ║
║ │ [SYS] Case created by carbon_fund@openenergy.co.za                │   ║
║ │       2026-06-14 10:23 UTC                                        │   ║
║ │       "Initiated carbon registration for Lesotho Solar PV"        │   ║
║ │                                                                     │   ║
║ │ [AI CARD] 💡 Suggested next step                                  │   ║
║ │   "Draft the PDD with these tips:"                                │   ║
║ │   • Follow Verra's VM0038 template                                │   ║
║ │   • Geo-tag the project at -29.6, 27.3                           │   ║
║ │   • Ensure 10-year crediting aligns with PPA term                │   ║
║ │   [ACCEPT] [SKIP]                                                 │   ║
║ │                                                                     │   ║
║ │ (scroll for audit trail, related cases)                           │   ║
║ │                                                                     │   ║
║ └─────────────────────────────────────────────────────────────────┘   ║
║                                                                             ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

**Action flow — "Draft PDD":**

User clicks [D] Draft PDD button → inline form expands:
- `screening_ref` (text, required, e.g. "SR-2026-0001")
- `screening_basis` (evidence field, file + text)
- Button: "Submit PDD" (tone: primary)

On submit:
```
POST /api/carbon-registration/chain/creg-2026-0001/draft-pdd
{
  "screening_ref": "SR-2026-0001",
  "screening_basis": "<file_blob>"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "creg-2026-0001",
    "chain_status": "pdd_drafted",
    "sla_deadline_at": "2026-06-21T10:30:00Z"
  }
}
```

UI updates:
- Status badge changes: `pdd_draft` → `pdd_drafted`
- Timeline entry: "[carbon_fund] Drafted PDD | screening_ref: SR-2026-0001 | 2026-06-14 10:45 UTC"
- Action panel: [D] disables, [O] "Open consultation" enables
- SLA countdown timer appears: "8 days to validation review"

**Subsequent state transitions:**

User can now click [O] to open consultation:
- Form opens with: `consultation_ref`, `consultation_basis`
- POST → status becomes `public_comment`
- Deadline escalates to 15 days
- AI card appears: "Public consultation open for 30 days per Verra protocol. Set a calendar reminder."

After consultation closes, click [A] "Authorize DNA":
- Form: `dna_authorization_ref`, `dna_basis`
- POST → status becomes `dna_authorization`
- Hint: "Await DFFE DNA clearance (typically 5–10 business days)"

After DNA approval, click [R] "Request registration":
- Form: `registration_ref`, `registration_basis`
- POST → status becomes `registration_requested`
- SLA deadline: 21 days to registry decision
- AI card: "Registry has indicated a 14-day review window. You're on track."

Registry accepts → terminal state `registered`:
- (In real system, regulator/admin role would trigger via webhook or admin interface)
- For testing: support team or admin manually updates via `/api/carbon-registration/chain/:id/activate-crediting`

---

### 7. Cross-Role Interaction via Thread: Article 6 ITMO (W4)

**Scenario:** Carbon_fund's retirement is subject to UNFCCC Article 6.4 corresponding adjustment; regulator audits the adjustment ledger.

**Chain:** `article6_adjustment` (W4)
- Lanes: `carbon_fund: 'article6_compliance'`, `regulator: 'data_reporting'`, `offtaker: 'compliance_offtaker'`
- Table: `oe_article6_adjustments`
- Ref col: `itmo_id` (e.g., "A6-2026-00123")
- Status col: `chain_status`
- Terminal: `['adjusted', 'retired', 'disputed']`
- Counterparty col: `authorizing_authority_name` (regulator role)

**Flow:**

1. **Carbon_fund initiates retirement** → `/ledger/carbon_retirement`
   - Initiates `carbon_retirement` chain (W17)
   - Sets `article6_flag: true` (if UNFCCC project)
   - Status: `requested`

2. **System auto-creates article6 adjustment** (cascade rule)
   - fireCascade fires `carbon_retirement.requested` with `article6_flag: true`
   - Backend auto-creates matching `article6_adjustment` row:
     ```
     itmo_id: "A6-2026-00123"
     linked_retirement_id: "ret-2026-0045"
     chain_status: "pending_transfer"
     authorizing_authority_name: "NERSA" (or DFFE if Article 6 regulated)
     ```
   - Both chains appear in their respective Horizons

3. **Regulator counterparty sees the case**
   - GET `/api/horizon/regulator` → `article6_adjustment` appears in lane `data_reporting`
   - Regulator clicks → `/thread/article6_adjustment/A6-2026-00123`

4. **Thread view (2-sided interaction):**

```
LEFT: Carbon_fund's view:
  Status: pending_transfer
  "Awaiting regulator approval for corresponding adjustment"
  Key facts:
    Retirement ID:          ret-2026-0045
    Quantity (tCO2e):       50,000
    Registry:               Verra
    Authorizing Authority:  NERSA (regulator)
  
  Actions (disabled until regulator approves):
    [ ] Mark adjusted ← disabled until regulator reviews
    
  Message from regulator:
    [2026-06-14 10:50] "Under review. Need clarification on…"

RIGHT: Regulator's view (same thread, different actions):
  Status: pending_transfer → under_review (editable)
  Actions (enabled for regulator):
    [R] Begin review
        review_notes: ________
        [SUBMIT]
    
    [A] Mark adjusted (tone: primary)
         adjusted_ref: "CA-2026-0089"
         basis: (evidence)
         [CONFIRM] → terminal: adjusted
    
    [D] Dispute (tone: oxide)
         dispute_reason: ________
         [SUBMIT] → status: disputed
```

5. **Regulator marks adjusted:**
   - POST `/api/carbon/article6-adjustment/:id/mark-adjusted`
   - Status moves to `adjusted` (terminal)
   - Carbon_fund's thread updates in real-time (WebSocket or poll)
   - Timeline entry: "[regulator] Marked adjusted | ref: CA-2026-0089"
   - AI assists carbon_fund: "✅ Your Article 6 adjustment is approved. Retirement can now be finalized."

**UI Details — Thread Differences by Role:**

Carbon_fund sees:
- Read-only summary of regulator's edits
- Can only add comments / upload supporting docs
- Sees regulator's deadline SLA (e.g., 5 days to mark adjusted)

Regulator sees:
- Full action panel (begin review, mark adjusted, dispute)
- Can add conditions/notes
- Sees regulator's own SLA breach flag if deadline exceeded

---

### 8. Ongoing Daily Work & AI Inline Assists

**Workspace baseline:**

Carbon_fund returns next day → `/horizon`
- Loads cases sorted by attention score (deadline urgency + quantum)
- Example duty list:
  ```
  1. [BREACHED] MRV-2026-Q2 | site_audit | -2 days | 1,200 tCO2e
  2. [URGENT]   ISS-2026-0045 | screening | 1 day | 50,000 tCO2e
  3. [ACTIVE]   ZA-CFD-2026-001 | public_comment | 8 days | 125,000 tCO2e
  4. [ROUTINE]  RET-2026-0089 | requested | 14 days | 25,000 tCO2e
  ```

**AI assists** (inline, context-aware):

1. **On breached MRV:**
   - Card appears in duty area:
     ```
     ⚠️  MRV submission overdue
     "Site audit deadline passed 2 days ago. You need to escalate or close this.
      Recommended action: Contact auditor at example@vvb.org for status update.
      [DRAFT EMAIL] [ESCALATE TO REGULATOR] [SKIP]"
     ```
   - User clicks [DRAFT EMAIL] → pre-fills:
     ```
     To: example@vvb.org
     Subject: MRV-2026-Q2 Site Audit Status
     Body: "Dear Auditor, Could you provide a status update on the site audit 
            for the Lesotho PV project? It was due 2 days ago..."
     [SEND] [EDIT]
     ```

2. **On carbon registration in public comment:**
   - Card in thread (right panel):
     ```
     💡 Verra feedback patterns
     "Projects of this size / technology typically receive questions about:
      • Leak boundaries (±5% of claimed offset)
      • Additionality of solar tariff assumptions
      • Permanence (15-year PPA vs 10-year crediting)
      
      Prepare responses on these topics for the consultation phase.
      [VIEW TEMPLATE] [SEARCH COMMUNITY] [DISMISS]"
     ```

3. **On credit-quality rating initiation:**
   - When user clicks "+ New rating" in `/ledger/carbon_credit_rating`:
     ```
     💡 Quick start: credit rating
     "Gather these inputs first:
      1. Methodology (PDF + name) ✓ loaded from carbon_fund's library
      2. Additionality evidence (policy baseline docs)
      3. Permanence (contract/irrevocable commitment)
      4. Leakage studies
      5. Co-benefits (jobs, health, capacity)
      
      Estimated time: 1-2 hours. [START] [SKIP]"
     ```
     - [START] pre-fills form with auto-detected fields, opens wizard
     - [SKIP] dismisses, user fills form manually

**Daily routine actions:**

User opens Atlas (⌘K) → search "upcoming deadlines":
- Filters to cases with deadline < 7 days
- Shows 3 items:
  ```
  1. Lesotho Solar PPA — carbon_registration — 8 days
  2. Q2 2026 MRV — mrv_submissions — 1 day (!!!)
  3. Coffee trading ERPA — carbon_erpa — 6 days
  ```

User clicks on MRV case → `/thread/mrv_submissions/MRV-2026-Q2`:
- Thread shows:
  ```
  LEFT: Status "site_audit" | Deadline: 2026-06-12 (OVERDUE -2 days)
       Proponent: AgriCarbon Ltd
       Site: Lesotho, Mokhotlong District
       Actions:
         [V] Validate audit outcomes ← user clicks to fill form
         [R] Request re-audit
         [E] Escalate to regulator
  
  RIGHT (AI card): "This audit is overdue. Verra will flag it in 3 days.
                    Your options:
                    1. Confirm the auditor completed the site visit (upload POD)
                    2. Request a re-audit window (5-day grace period)
                    3. Escalate to NERSA regulator for intervention
                    
                    [CONFIRM COMPLETION] [REQUEST WINDOW] [ESCALATE]"
  ```

User clicks [CONFIRM COMPLETION] → inline form opens:
- `audit_completion_date` (date picker)
- `audit_report_ref` (file upload)
- `site_visit_evidence` (photos / GPS logs)
- [SUBMIT]

POST `/api/mrv/submissions/:id/validate-audit-outcomes` → status moves to `cra_review` (next state)

---

### 9. Sign Out

User clicks Profile menu (top-right MeridianFrame header) → "Sign out"

POST `/api/auth/logout`:
- Backend: invalidates JWT in KV (optional; JWT TTL=1h handles expiry)
- Frontend: clears `localStorage['token']`
- Redirect: `/auth/login`

Next login: user back to `/onboard` or `/horizon` depending on `onboarding_completed` flag

---

### 10. Worst Current Pain Points (Audit Fixes)

**Problem 1: 49 chains unreachable / dossier sub-docs**
- Fixed in this spec: all carbon_fund chains are now in roleData domains and properly laned
- Dossier grouping: NOT applied to carbon chains (they are standalone, not sub-docs like ipp_* project docs)

**Problem 2: Free-text type:'string' fields vs type:'lookup' dropdowns**
- In this spec: `target_registry`, `methodology_id`, `location_country` are all lookup/enum, never free-text
- Example form fields (pre-spec) that would be wrong:
  - ❌ `registry_name` (string) — no; must be enum from whitelist
  - ✅ `target_registry` (lookup) — yes; dropdown from `GET /api/ledger/lookup/carbon_registries`

**Problem 3: Raw *.* column dumps in Thread**
- Fixed: Thread detail shows only high-level facts (project_name, location, technology, est_tco2e)
- Raw JSON audit trail is collapsed, user must click "Expand audit" to view

**Problem 4: Modal a11y (focus trap, inert body)**
- Fixed in spec: OnboardingWizard + Thread modals use `aria-modal="true"`, body gets `inert`, focus traps on first interactive element (input or [START] button)
- Escape key closes, restores focus to opening trigger

**Problem 5: --ink3 secondary text below WCAG AA contrast**
- Fixed in spec: all status badges, deadline text, secondary labels use WCAG AA compliant colors (at least 4.5:1 for small text, 3:1 for large)

**Problem 6: esco + epc_contractor onboarding throws**
- Carbon_fund onboarding is stable (sequence: welcome → registry → methodology → complete)
- No entity provisioned (kind='none'), which is correct — carbon_fund manages external proponents, not their own entities

**Problem 7: Provisioning creates entity for only 2 of 10 roles**
- Carbon_fund correctly gets `kind='none'` (no first entity)
- IPP and esums_owner DO get first entities (project + site)
- Other 8 roles: `kind='none'` (correct; they join existing portfolios or initiate chains without "owning" base entities)

**Problem 8: 40 Atlas tiles resolve to empty bodies**
- Fixed: all 16 carbon_fund features resolve to either `/ledger/:chainKey` (with initiation form) or `/surface/:key` (with registry/report data)
- No empty tiles

**Problem 9: ~39 dangling tiles (404 on click)**
- Fixed: every carbon_fund feature has either `chainKey` (→ MERIDIAN_CHAINS) or `route`/`key` (→ surfaces.tsx or static routes)
- No dangling references

---

### Role-Specific Keyboard Shortcuts & Accessibility

| Action | Shortcut | Availability |
|--------|----------|---|
| Open Atlas (function library) | ⌘K or Ctrl+K | Everywhere |
| Navigate duty cases (Horizon) | ↑ / ↓ arrow keys | Horizon only |
| Open selected duty case | Enter | Duty list focus |
| Navigate between lanes | ← / → arrow keys | Horizon only |
| Submit action form | ⌘ + Enter | Form focus |
| Expand action panel | Space | Action header focus |
| Clear search (Atlas) | Escape | Atlas search active |
| Close thread detail | Escape | Thread open |

**Screen reader labels:**
- Status badge: `<span role="status" aria-label="Status: validation">Validation</span>`
- Deadline: `<span role="tooltip" aria-label="Deadline: 2026-06-21, 8 days remaining">8d</span>`
- Action button: `<button aria-label="Draft PDD for carbon registration ZA-CFD-2026-001">Draft PDD</button>`
- Lane: `<section aria-labelledby="lane-project_pipeline">` + `<h2 id="lane-project_pipeline">Project Pipeline</h2>`

---

### Responsive Reflow (<760px Mobile)

**Horizon:**
- Stack lanes vertically, no multi-column grid
- Duty list: card-per-case, swipe to detail
- Lane headers: sticky top, collapse/expand toggle

**Thread:**
- Right panel (messages) becomes full-width below left panel
- Stacked modal instead of side-by-side
- Form inputs: full width, no multi-col layout

**Ledger:**
- List becomes card grid (1 col @ <760px)
- Filters drawer (bottom sheet) instead of inline bar
- +New CTA stays at top (fixed or sticky)

**Forms:**
- All sections visible, scroll vertical
- Dropdown/lookup fields: full-width, no side-by-side groups
- Evidence upload: drag-and-drop zone spans full width

---

### Empty States & Error Messaging

**First-run Horizon (all lanes empty):**
- Card: "Welcome to your carbon workspace"
- Copy: "You have no active cases. Start by creating a project registration in Atlas."
- CTA: "Open Atlas (⌘K)"

**Ledger with 0 cases:**
- Header: "0 project registrations"
- Hero: "No registrations yet"
- Copy: "Create your first carbon credit lifecycle registration."
- CTA: "+ New registration"

**Thread form validation error:**
- Alert (red, aria-alert): "❌ Project name is required. Please enter a name with 5+ characters."
- Focus moves to offending field

**API error (e.g., invalid methodology):**
- Toast (5s): "⚠️ Methodology VM0038 not found for Verra. Check your registry selection."
- User can retry or choose different methodology

**Regulator rejection (cross-role):**
- Thread card: "🔴 Rejected"
- Detail: "Reason: Additionality not demonstrated per Verra guidelines"
- Regulator's message: "The baseline tariff assumption of $0.06/kWh is above current market rates. Please revise and resubmit."
- User action: [RESUBMIT] opens revision form with pre-filled fields

---

This completes the carbon_fund role journey map. All 6 lanes (project_pipeline, mrv_verification, issuance_registry, article6_compliance, retirement_offset, trading_markets), owned chains, counterparty interactions, onboarding sequence, state machines, AI assists, and accessibility/responsiveness requirements are specified with actual chain keys, routes, form fields, and UX copy.
