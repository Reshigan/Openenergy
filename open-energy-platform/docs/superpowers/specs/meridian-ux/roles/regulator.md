## Role journey: regulator

### Regulator role overview

NERSA licensing, compliance inspection, enforcement actions, complaint resolution, tariff determinations, levy assessment. 13 chains: **licensing** domain owns `licence_application` (W49), `licence_renewal` (W33), `sseg_registration` (W57); **enforcement_regulator** domain owns `disposition` (W31), `compliance_inspection` (W40), `enforcement_action` (W93), `complaint_resolution` (W66); **tariff_determinations** domain owns `tariff_determination` (W43), `public_consultation` (W209), `market_conduct_exam` (W220); **levies** domain owns `levy_assessment` (W74), `regulator_export_pack` (W119); **data_reporting** read-only inbox for cross-chain regulatory escalations (W5 regulator inbox). Currently broken: 13 chains are laned but unreachable from Atlas tiles; onboarding provisioning skips regulator (logs `kind='none'`); Horizon lanes exist but 40 Atlas tiles are empty bodies; modals lack focus traps; compliance_notice and market_abuse_case tiles dangling with no Ledger route.

---

### 1. Acquisition & first login

**Email invitation path**: Admin provisions a new NERSA user via platform (out-of-band):
- Email: `regulator@openenergy.co.za` (NERSA staff email, verified by admin)
- Password: auto-generated, expires at first login
- Role: `regulator` (JWT role suffix: `regulator`, not shortened)
- Tenant: `national` (NERSA is multi-tenant observer; see KYC/market-access gate below)

**First sign-in (no SSO integration yet)**:
- `POST /api/auth/login` with email + password
- JWT expires in 1 hour; token stored in `localStorage['token']`
- `LaunchRedirect` in App.tsx reads `/api/onboarding/state` → `completed=false` → redirects to `/onboard`

---

### 2. Onboarding wizard (regulator steps)

**Step sequence** (from `ONBOARDING_STEPS['regulator']`): `['welcome', 'body', 'jurisdiction', 'complete']`

**Welcome step** (`GET /onboard` → OnboardingWizard component):
- Heading: "Welcome to Open Energy Platform — NERSA Regulator Portal"
- Copy: "This platform centralizes licensing applications, compliance inspections, enforcement actions, and statutory reporting for South African energy licensees under your jurisdiction."
- Layout: full-height single-column, centered text (max-width 640px on mobile <760px)
- Button: "Get started" → `POST /api/onboarding/step { step: 'welcome' }`
- a11y: heading h1 semantic, focus starts on button

**Body step** (regulator identity + NERSA directorate):
- Heading: "NERSA body details"
- Fields (all required):
  - `body_name` (string): "Directorate name or unit" — e.g. "Licensing Division"
  - `body_type` (enum): ['licensing', 'enforcement', 'tariff', 'compliance'] — determines which chain-lanes to surface in Horizon later
  - `directorate_head_name` (string): "Your directorate head"
  - `contact_email` (string): pre-filled with `regulator@openenergy.co.za` (read-only)
- On save: `POST /api/onboarding/step { step: 'body', data: {...} }`
- Merges into `onboarding_data`; advances to `jurisdiction`
- Error state: if `body_type` not in enum, re-render with inline error "Invalid directorate type"
- Empty state N/A: all fields required

**Jurisdiction step** (geographic + market scope):
- Heading: "Jurisdiction & market scope"
- Fields:
  - `geographic_scope` (string): "Province(s) or national" — e.g. "National"
  - `market_segment` (string): "Market segments you oversee" — e.g. "IPPP, Municipal, Municipal+IPPP"
  - `languages` (string): "Preferred language" — e.g. "English"
- Checkbox: "I confirm this NERSA regulator account will comply with POPIA data minimisation and confidentiality requirements"
- On accept: `POST /api/onboarding/step { step: 'jurisdiction', data: {...} }` → advances to `complete`
- Error state: if checkbox not checked, disable "Continue" button with tooltip "Confirm POPIA compliance to proceed"

**Complete step** (summary + launch):
- Heading: "You're ready!"
- Display: Summary card with body_name, body_type, geographic_scope
- Copy: "No sandbox practice transactions for regulators — you'll go directly to the live Horizon workspace."
- Button: "Launch Horizon" → `POST /api/onboarding/complete` → redirect to `/horizon`
- Behind the scenes:
  - `onboarding.completed` event fires cascade
  - `onboarding-provisioning` rule catches it:
    - Regulator logs `kind='none'` in `oe_onboarding_provisioning_log` (no entity provisioned — regulator uses existing participant ID as actor)
    - No om_site or ipp_project created (regulator reads entities, never owns them)

**First-run empty Horizon** (after /onboarding complete):
- All lanes appear empty until matrix is populated
- CTA: "No pending matters — check back soon or navigate Atlas to explore available functions"

---

### 3. Landing on Horizon (`/horizon` workspace)

**Regulator Horizon lanes** (from chain registry):
1. **licensing lane** → chains: `licence_application`, `licence_renewal`, `sseg_registration`
2. **enforcement_regulator lane** → chains: `disposition`, `compliance_inspection`, `enforcement_action`, `complaint_resolution`
3. **tariff_determinations lane** → chains: `tariff_determination`, `public_consultation`, `market_conduct_exam`
4. **levies lane** → chains: `levy_assessment`, `regulator_export_pack`
5. **data_reporting lane** → read-only cross-chain inbox (escalations from W31, W40, W66, etc.; no initiation here)

**Horizon layout** (GET `/api/horizon/regulator` returns `{lanes, duty, counts}`):
- **Header region** (sticky):
  - Logo + "NERSA Regulator" (no role quick-switch; nav is role-blind currently — BROKEN, fixed: quick-links now show only regulator functions)
  - Search/⌘K → Atlas
  - User menu: "regulator@openenergy.co.za | Sign out"
- **Duty panel** (top-right, "Top 8"):
  - Sorted by `attentionScore` (deadline + quantum ZAR)
  - Breached cases (red bg, BREACH_FLOOR ranking) float to top
  - Each row: case ref | chain | status | deadline bucket (e.g. "2h") | counterparty | quantum (if any) | click → Thread
  - Empty: "No urgent matters"
- **Lane cards** (left-to-right, 5 cols on desktop, stack <760px):
  - Each lane is a collapsible card:
    - **Lane heading** + count: "Licensing (14)" | "Enforcement (9)" | etc.
    - **Status filters** (collapsible):
      - Per-chain filter buttons: "Active", "Awaiting action", "Resolved" (chains define `.filters[]`)
      - Clicking a filter narrows the lane to matching cases
    - **KPI mini-bars** (collapsed by default, expand on hover):
      - E.g. "14 total | 2 breached | R1.2B quantum"
    - **Case list** (scrollable within lane, max 60 rows per chain, sorted by score):
      - Each row: ref | title | status + badge color | deadline | quantum | click → Thread
      - Hover: "View details" tooltip
    - **Empty lane**: "No cases in this lane"

**Responsive <760px**:
- Duty panel collapses to a dismissible alert banner (showing top 1 case)
- Lanes stack vertically, full width
- Lane filters appear inline as a horizontal pill-scroll

**a11y**:
- Lane headings are `<button role="region">`; clicking expands/collapses the lane via `aria-expanded`
- Case rows are `<article>` with screen-reader text: "Case {ref} in {status} state, deadline {bucket}"
- Keyboard: Tab through cases; Enter → navigate to Thread
- WCAG AA compliance: text contrast 4.5:1 (currently --ink3 secondary text FAILS, fixed: upgrade to --ink2)

**States**:
- **Loading**: skeleton loaders for lane cards + duty panel; pulse animation
- **Empty workspace** (first run or filtered to 0): "Welcome to NERSA workspace. No cases yet. Explore functions in Atlas (⌘K)."
- **Error** (DB timeout, auth fail): banner "Unable to load cases. Retry?" button
- **Unauthorized** (e.g. admin viewing regulator horizon without admin flag): 403 redirect to `/horizon?role=admin`

---

### 4. Discovering functions in Atlas (`/atlas` or ⌘K)

**Atlas for regulator role**:
- **Organized by domain** (5 sections):
  1. **Licensing** (icon: ◈, blue)
     - Tile: "Licence applications" → `/ledger/licence_application` (owned tile; +New initiates)
     - Tile: "Licence renewals" → `/ledger/licence_renewal`
     - Tile: "SSEG registration" → `/ledger/sseg_registration`
     - Tile: "Licence actions" (non-chain; static register) → `/surface/regulator:licences`
  2. **Enforcement** (icon: ⬓, red)
     - Tile: "Compliance inspections" → `/ledger/compliance_inspection`
     - Tile: "Dispositions" → `/ledger/disposition`
     - Tile: "Enforcement actions" → `/ledger/enforcement_action`
     - Tile: "Complaint resolution" → `/ledger/complaint_resolution`
     - **Hidden but thread-reachable** (BROKEN, fixed: now listed as "thread-only" with icon indicator):
       - "Market abuse cases" (trader STOR referrals; regulator reads/escalates, never initiates)
       - "Regulator inbox" (cross-chain escalations; materialized list, not a case-initiation surface)
  3. **Tariff & Determinations** (icon: ◎, grey)
     - Tile: "MYPD tariff determinations" → `/ledger/tariff_determination`
     - Tile: "Public consultations" → `/ledger/public_consultation`
     - Tile: "Market conduct exams" → `/ledger/market_conduct_exam`
     - Tile: "Compliance notices" (non-chain register) → `/surface/regulator:compliance_notices`
  4. **Levies & Finance** (icon: ◉, teal)
     - Tile: "Levy assessments" → `/ledger/levy_assessment`
     - Tile: "Regulatory exports" → `/ledger/regulator_export_pack` (read-only export packs created by admin)
  5. **Data & Reporting** (icon: ▤, grey)
     - Tile: "Regulatory inbox" → `/surface/regulator:inbox` (materialized cross-chain escalations)
     - Tile: "Stage gates (read)" → `/surface/regulator:stage_gates` (platform-wide DG gate oversight)
     - Tile: "ESG disclosure (read)" → `/ledger/esg_disclosure` (read-only, from carbon_fund + offtaker)
     - Tile: "Reports & exports" → `/surface/regulator:reports` (statutory, levy, disposition CSV/PDF)
     - Tile: "Audit & compliance" → `/surface/regulator:audit` (tamper-evident audit log)

**DOSSIER grouping (if applicable)**: None for regulator (no sub-document chains like ipp_*)

**Tile visual design** (NEW — currently empty bodies):
- Each tile:
  - Icon (domain color)
  - Title: "Licence applications"
  - Subtitle: "ERA ss.8-11 initial licence adjudication" (truncated at 2 lines)
  - Badge: "14 cases" (auto-count from ledger) | "read-only" (non-initiation) | "NEW" (recently added)
  - Hover: "Click to view" CTA
  - Keyboard: Tab + Enter to navigate

**Empty body fix**: Each tile now routes to either:
- `/ledger/:chainKey` (case list + schema-driven +New) → works if chainKey in MERIDIAN_CHAINS
- `/surface/regulator::key` (static surface registered in SURFACE_REGISTRY) → works if registered
- If neither: 404 "This surface is not yet available"

**Thread-only chains** (FIXED via new "indicator"):
- Tiles for `market_abuse_case` (trader initiates; regulator escalates via Thread side-panel "flag to regulator")
- Copy: "Market abuse cases — referred by traders for STOR filing. Read-only in this view; actions available in individual cases."
- Icon overlay: "👁 Read-only" badge

---

### 5. PRIMARY OWNED TRANSACTION END-TO-END: `licence_application` (W49)

**Scenario**: A wind IPP applies for a utility-scale generation licence under ERA s.8-11. Regulator reviews, runs public participation, evaluates, approves or refuses.

**Initiation** (`/ledger/licence_application` → "+New" button):
- Route: `GET /api/ledger/lookup/licence_application` → schema-driven form builder
- Form fields (all required unless noted):
  - `application_number` (string, auto-generated format): "APPL-2026-0001"
  - `applicant_party_name` (lookup): "Select applicant" → `GET /api/ledger/lookup/parties?type=ipp_developer` → dropdown ["IPP DevCorp", "Solar Energy SA", ...]
  - `facility_name` (string): "Project name"
  - `technology` (enum): ['solar_pv', 'wind', 'hydro', 'battery', 'hybrid'] → dropdown
  - `capacity_mw` (number): "Generation capacity" (unit: MW)
  - `estimated_capex_zar_m` (number, optional): "Estimated CAPEX" (unit: R millions)
  - `geographic_location` (string): "Province / district"

**Form submission** (POST `/api/licence-application/chain`):
- Request:
  ```json
  {
    "applicant_party_name": "Wind Power SA",
    "facility_name": "Karoo Wind Farm",
    "technology": "wind",
    "capacity_mw": 50,
    "estimated_capex_zar_m": 750,
    "geographic_location": "Eastern Cape"
  }
  ```
- Backend:
  - Generates row in `oe_licence_applications` with `chain_status='received'`, `sla_deadline_at=NOW+30days` (W49 completeness SLA)
  - Creates event in `oe_licence_applications_events` (audit trail)
  - Fires cascade `licence_application.created` → notifies IPP applicant via email
- Response: `{success: true, data: {id: 'lic-app-00001', application_number: 'APPL-2026-0001'}}`
- Redirect to `/thread/licence_application/lic-app-00001`

**Horizon update**: New case appears in `licensing` lane, status=`received`, score calculated by deadline (30 days, not urgent yet)

**Thread detail** (`/thread/licence_application/:id`):
- **Left panel** (case summary):
  - Ref: "APPL-2026-0001" | Status badge: "Completeness check" (blue)
  - Title: "Karoo Wind Farm — 50 MW wind, Eastern Cape"
  - Counterparty: "Wind Power SA" (link → IPP profile, read-only for regulator)
  - Quantum: "R750M CAPEX" (informational, not financeable by regulator)
  - Deadline: "30 days" | Timer: "29 days 14h remaining" (red if breached)
  - Timeline: collapsible "Audit trail" → events: "2026-06-14 10:30 — Application received" | "2026-06-14 15:45 — Assigned to Your Team"

- **Right panel** (actions + details):
  - **Data section** (raw case):
    - All application_number, facility_name, etc. displayed read-only (or editable if status is `received`; currently BROKEN — Thread dumps raw.* verbatim, no schema)
    - FIXED: Thread now uses chain schema to render each column with proper type formatting (dates, currency, enums)

  - **Actions section**:
    - Status-dependent action buttons (from `chain.actions[]`, filtered by regulator role):
      - Status = `received`: buttons "Request information" | "Accept for review"
      - Status = `completeness_check`: buttons "Request information" | "Accept for review"
      - Status = `public_participation`: buttons "Open public participation" (primary, tone) | "Defer"
      - Status = `technical_evaluation`: buttons "Issue determination" (primary) | "Refer back"
      - Status = `council_decision`: buttons "Grant licence" (primary, green) | "Refuse" (oxide, red) | "Withdraw"

  - **Action form** (modal on click):
    - Action: "Open public participation"
    - Fields (from `chain.actions[].fields[]`):
      - `participation_ref` (string, required): "Participation notice reference" — e.g. "PART-2026-0042"
      - `participation_basis` (evidence, optional): "Notes on participation window" — rich-text editor
    - Buttons: "Cancel" | "Open window" (primary)
    - Modal: aria-modal, focus trap (currently BROKEN — no focus trap; fixed: add inert on background, restore focus on close)
    - Accessibility: form fields labeled correctly; error states in-line with red text (WCAG AA)

  - **AI assist card** (inline, not a tab):
    - Heading: "AI Suggestion" (small icon: ✨)
    - Content: "Based on application completeness, you may be ready to open public participation. 80% of applications similar to this one progressed at this stage."
    - Button: "Apply suggestion" (1-click → fill participation_ref with auto-generated value + submit)
    - Tone: conversational, not commanding

**State transitions (happy path)**:
1. `received` → (user action "Accept for review") → `completeness_check`
2. `completeness_check` → (no issues found) → (action "Open public participation") → `public_participation`
3. `public_participation` → (end of public comment window, user reviews responses) → (action "Begin technical evaluation") → `technical_evaluation`
4. `technical_evaluation` → (full evaluation complete) → (action "Refer to council") → `council_decision`
5. `council_decision` → (action "Grant licence" or "Refuse") → `licence_issued` or `refused` (terminal)

**Cascade effects**:
- On each transition, cascade fires:
  - `licence_application.{event}` (e.g. `licence_application.public_participation_opened`)
  - Notifies IPP applicant of status change via email + in-app notification
  - For major applicants (IPPP tier), notifies regulator inbox of milestone
  - If granted: fires `licence_issued` → creates a license record in `oe_licences` table + notifications to all stakeholders

**Error states**:
- **Missing required field**: inline error "Participation reference is required"
- **Validation fail** (e.g. ref format wrong): "Reference must start with 'PART-'"
- **Stale object** (case moved to another status between view + submit): "This case has changed. Refresh to see updates."
- **Permission denied** (non-regulator tries to action): 403 "You don't have permission to action this case"

---

### 6. CROSS-ROLE INTERACTION via Thread (regulator ↔ IPP counterparty)

**Scenario**: Wind IPP responds to regulator's information request on `licence_application`.

**Regulator initiates** (Thread side-panel action):
- Button: "Request information" → modal
- Fields:
  - `information_requested` (evidence, required): "What information is needed?" (rich text)
  - `deadline_days` (number, default 14): "Response deadline"
- Submit: POST `/api/licence-application/chain/:id/request-information`
- Cascade:
  - Updates case status to `information_requested`
  - Fires event: `licence_application.information_requested`
  - Email to IPP (Wind Power SA) applicant: "NERSA has requested the following information..." + 14-day countdown timer

**IPP receives notification**:
- In-app: badge on `/horizon` IPP workspace, regulatory_risk lane
- Email: "Action required: NERSA Licence Application — Respond by 2026-07-15"
- IPP navigates to `/thread/licence_application/lic-app-00001` (same chain, same case, IPP-readable view)

**IPP side of Thread** (IPP finance role):
- Same layout as regulator view, but:
  - Actions visible to IPP: "Submit information" (button, primary)
  - Other actions greyed out / hidden (regulator-only)
  - Copy on status: "Information requested — respond by 2026-07-15 (10 days remaining)"
  - Action form: "Submit information"
    - Fields:
      - `notes` (evidence, required): "Your response"
      - `supporting_docs` (file upload): "Attach documents" (max 5 files, 50 MB each)
    - Button: "Submit response" → POST `/api/licence-application/chain/:id/submit-info`

**Regulator receives response**:
- Case re-appears in Horizon, `licensing` lane, status `information_requested_response`
- Duty panel: "Wind Power SA has responded to your information request"
- Thread now shows IPP response in the timeline:
  - "2026-06-15 16:30 — IPP submitted information"
  - Expandable details: IPP's response text + download links for attachments

**Regulator action** (on Thread):
- Button: "Accept response and continue review" → returns to `completeness_check`
- Or: "Request additional information" → extends deadline
- Both actions notify IPP of outcome

**No direct messaging**: All communication via structured action responses + email (not a chat interface).

---

### 7. Ongoing daily work + AI inline assists

**Morning routine** (regulator logs in):
1. Lands on `/horizon`
2. **Duty panel** shows top 8 urgent matters: 2 breach-deadline compliance_inspections (red), 1 tariff_determination in technical_analysis (orange), rest blue
3. **Licensing lane** shows 14 cases: 6 `received` (yellow), 5 `information_requested_response` (new responses), 3 `council_decision` (ready to vote)
4. **Enforcement lane** shows 9 cases: 1 `compliance_inspection` on-site visit tomorrow (red), 2 in remediation window (orange), 6 resolved

**Quick actions**:
- Click case in duty panel → jump to Thread
- Filter licensing lane to "Awaiting action" → shows only cases regulator hasn't actioned
- Click "Expand" on a lane → full-screen grid of all cases with columns (ref | status | deadline | applicant)

**AI assists** (per-surface, not in-app chat):
- On `compliance_inspection` Thread (status=`on_site`):
  - Card: "Based on similar inspections, you typically find 3-5 non-conformances. This facility had 1 historical breach. Recommended preliminary findings: [list]"
  - Button: "Adopt findings" → fills `findings_ref` + prefills `findings_basis` with template
  - Human still edits before submitting

- On `tariff_determination` (status=`technical_analysis`):
  - Card: "Utility's requested revenue of R2.1B is 8% above peer median. Public comments (127 received) focus on cost-base recoverability. Consider issuing determination at R1.95B (93% of request)."
  - Button: "See detailed analysis" → expands with sensitivity tables

- On `levy_assessment` (status=`invoice_issued`):
  - Card: "This licensee has 2 historical invoice-payment delays. Consider escalating to final_demand at Day 45 instead of Day 60."
  - Checkbox: "Apply this SLA override"

**Keyboard shortcuts** (⌘K = Atlas):
- Alt+H: jump to Horizon
- Alt+D: focus duty panel
- Alt+L: focus licensing lane
- Alt+F: open first-flagged case
- ? → help overlay (keyboard guide)

**Sign out**:
- Click user menu → "Sign out"
- Token deleted from localStorage
- Redirect to `/` (landing page)
- Session audit logged: "2026-06-14 17:30 — regulator@openenergy.co.za logged out"

---

### 8. Fixed pain points (audit facts)

**Current breakage → Fixed behavior**:

1. **13 unreachable chains**: compliance_notice, enforcement_action_s35, regulator_inbox, market_abuse_case, etc. tiles existed but routes 404'd
   - **Fixed**: All 13 chains now have Ledger routes (`/ledger/:chainKey`) wired to `GET /api/ledger/:chainKey` or Thread-only designation with read-only indicator in Atlas

2. **Onboarding provisioning skips regulator** (logs `kind='none'`, no entity)
   - **Fixed**: Provisioning correctly logs regulator without error; no om_site or ipp_project expected (regulator uses participant ID as actor, doesn't own entities)

3. **40 Atlas tiles have empty bodies**
   - **Fixed**: Each tile now resolves to either:
     - Ledger list + +New form (for owned chains)
     - Static surface page (for reports, connectors, read-only views)
     - Clear 404 if missing

4. **Modal focus traps missing** (a11y failure)
   - **Fixed**: Action modals now have `aria-modal="true"`, background `inert`, focus restore on close

5. **Thread dumps raw.* verbatim** (no schema rendering)
   - **Fixed**: Thread now renders each column using chain schema (types: number, date, enum, evidence, lookup)

6. **Header quicklinks role-blind** (no per-role shortcuts)
   - **Fixed**: Quicklinks now show only functions available to the logged-in role

7. **Compliance notices dangling** (no backing tile/route)
   - **Fixed**: Now a static surface `/surface/regulator:compliance_notices` (register-view, auto-populated from events)

8. **Esco + EPC onboarding throws** (no step sequence)
   - **Fixed** (separate effort): ONBOARDING_STEPS now has entries for esco and epc_contractor

9. **WCAG AA text contrast fails** (--ink3 secondary below 4.5:1)
   - **Fixed**: Secondary text upgraded to --ink2 (4.8:1 ratio)

10. **Regulator laned on only 4/207 chains** (203 invisible incl. NERSA market-halt)
    - **Fixed**: Regulator now visible on all 13 owned chains + thread-only read-only chains (market_abuse_case, etc.)

---

### Wireframe: Horizon workspace (regulator, post-onboarding)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ OEP Logo  ▸ NERSA Regulator  │  🔍  ⌘K      👤 regulator@... ▼        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Duty (Top 8)                      Licensing (14)                       │
│  ┌────────────────────┐           ┌──────────────────┐                  │
│  │ COMP-2026-001      │           │ Active (6)       │                  │
│  │ Compliance inspect │     👁     │ • APPL-2026-0001 │                  │
│  │ On-site 1h ◄───  │           │   Karoo Wind     │                  │
│  │ R0 | 🏢           │           │   information_req│                  │
│  │ [Navigate]        │           │ • APPL-2026-0002 │                  │
│  └────────────────────┘           │ • APPL-2026-0003 │                  │
│                                    │ [more...]        │                  │
│  TARI-2026-042                     │ Awaiting (5)     │                  │
│  Tariff determine                  │ • APPL-2026-0007 │                  │
│  Technical analysis                │ [more...]        │                  │
│  28d remaining | 🏢                │ Resolved (3)     │                  │
│  [Navigate]                        │ [Collapse]       │                  │
│                                    └──────────────────┘                  │
│  [6 more cases...]                                                       │
│                                    Enforcement (9)                       │
│                                    ┌──────────────────┐                  │
│                                    │ Active (1)       │                  │
│                                    │ • DISP-2026-003  │                  │
│                                    │   Respondent XYZ │                  │
│                                    │   triage pending │                  │
│                                    │ Remediation (2)  │                  │
│                                    │ [more...]        │                  │
│                                    │ Resolved (6)     │                  │
│                                    │ [Collapse]       │                  │
│                                    └──────────────────┘                  │
│                                                                           │
│                                    Tariff & Determine (5)                │
│                                    [Cards...]                            │
│                                                                           │
│                                    Levies & Finance (4)                  │
│                                    [Cards...]                            │
│                                                                           │
│                                    Data & Reporting                      │
│                                    [Cards...]                            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

< 760px: lanes stack, duty collapses to banner
```

---

### Wireframe: Thread — licence_application case (W49)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ◄ Back to Horizon                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│ LEFT PANEL                      │  RIGHT PANEL                           │
│ ───────────────────────────      │  ────────────────────────             │
│                                  │                                       │
│ APPL-2026-0001                   │  CASE DETAILS                         │
│ Completeness check ◆ blue         │  ────────────────────────             │
│                                  │  Application number: APPL-2026-0001   │
│ Karoo Wind Farm                  │  Applicant: Wind Power SA [link]      │
│ 50 MW wind, Eastern Cape         │  Facility: Karoo Wind Farm           │
│                                  │  Technology: wind                    │
│ Wind Power SA                     │  Capacity: 50 MW                     │
│ [Visit profile]                  │  Est. CAPEX: R750M                   │
│                                  │  Location: Eastern Cape              │
│ Deadline: 29d 14h remaining      │  Status: Completeness check          │
│ (30 days from receipt)           │                                      │
│                                  │  ACTIONS                              │
│ Timeline (Audit)                 │  ────────────────────────             │
│ ├─ 2026-06-14 10:30              │  ┌──────────────────────┐             │
│ │  App received                  │  │ [Request info]       │             │
│ │  by NERSA inbox                │  │ [Accept + continue]  │             │
│ │                                │  │ [Defer]              │             │
│ ├─ 2026-06-14 15:45              │  └──────────────────────┘             │
│ │  Auto-assigned to               │                                      │
│ │  your team                      │  AI ASSIST                           │
│ │  (Licensing div)                │  ────────────────────────             │
│ │                                │  ✨ 80% of similar apps               │
│ └─ [Expand]                      │  progress from this                  │
│                                  │  stage. Ready to open                │
│                                  │  participation?                       │
│                                  │  [Adopt suggestion]                  │
│                                  │                                      │
│                                  │  DATA (read-only unless              │
│                                  │  status=received)                    │
│                                  │  ────────────────────────             │
│                                  │  [Scrollable list of                 │
│                                  │   all chain columns]                 │
│                                  │                                      │
└─────────────────────────────────────────────────────────────────────────┘

ACTION MODAL (Request information)
┌────────────────────────────────────────────────────────┐
│ Request information                            × Close  │
├────────────────────────────────────────────────────────┤
│                                                         │
│ Information needed *                                   │
│ ┌──────────────────────────────────────────────┐       │
│ │ [Rich text editor]                          │       │
│ │ - proof of land rights                      │       │
│ │ - environmental baseline study              │       │
│ │ - grid connection feasibility                │       │
│ └──────────────────────────────────────────────┘       │
│                                                         │
│ Response deadline (days) *                            │
│ ┌──────────┐                                          │
│ │ 14       │                                          │
│ └──────────┘                                          │
│                                                         │
│ [Cancel]  [Request information]  (primary, blue)      │
│                                                         │
└────────────────────────────────────────────────────────┘
```

---

### Wireframe: Onboarding — jurisdiction step

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                         Open Energy Platform                             │
│                  NERSA Regulator Portal — Setup                         │
│                                                                           │
│                              [Progress: 3/4]                             │
│                                                                           │
│  Jurisdiction & Market Scope                                            │
│  ─────────────────────────────────────────────────────────              │
│                                                                           │
│  Geographic scope *                                                     │
│  ┌──────────────────────────────────────────────────────┐               │
│  │ National                                ▼            │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                           │
│  Market segments you oversee *                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │ (multi-select)                                       │               │
│  │ ☑ IPPP (government procurement)                     │               │
│  │ ☐ Municipal renewable energy                         │               │
│  │ ☑ Private wheeling (municipal + IPPP)               │               │
│  │ ☐ Community energy                                   │               │
│  │ ☐ Self-generation (SSEG)                            │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                           │
│  Preferred language *                                                   │
│  ┌──────────────────────────────────────────────────────┐               │
│  │ English                                ▼            │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                           │
│  ┌─────────────────────────────────────────────────────┐                │
│  │ ☐ I confirm this NERSA regulator account will       │                │
│  │   comply with POPIA data minimisation and           │                │
│  │   confidentiality requirements.                     │                │
│  └─────────────────────────────────────────────────────┘                │
│                                                                           │
│                   [Back]  [Continue] (disabled until checked)            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### API endpoints (regulator-scoped)

**Read-only**:
- `GET /api/horizon/regulator` — Horizon lanes + duty + counts
- `GET /api/ledger/licence_application?filter=...` — list + filters
- `GET /api/ledger/lookup/parties?type=ipp_developer` — autocomplete for form
- `GET /api/thread/licence_application/:id` — full case detail
- `GET /api/ledger/lookup/compliance_notices` — static register
- `GET /api/surface/regulator:inbox` — materialized cross-chain inbox

**Write** (action transitions):
- `POST /api/licence-application/chain/:id/accept-review` — advance to `completeness_check`
- `POST /api/licence-application/chain/:id/open-participation` — advance to `public_participation`
- `POST /api/licence-application/chain/:id/issue-determination` — advance to `technical_evaluation`
- `POST /api/licence-application/chain/:id/grant-licence` — advance to `licence_issued` (terminal)
- `POST /api/licence-application/chain/:id/refuse` — advance to `refused` (terminal)
- Similar endpoints for other chains (disposition, compliance_inspection, tariff_determination, levy_assessment)

**Admin provisioning**:
- `POST /api/admin/participants` (admin-only) — create new regulator user
  - Body: `{email, role: 'regulator', tenant_id, ...}`
  - Returns: participant_id + sends invite email

---

### Accessibility & responsive summary

**WCAG 2.1 AA compliance** (desktop + mobile):
- Heading hierarchy: h1 (page), h2 (lane), h3 (section) — no skips
- Form labels `<label for="...">` or aria-label
- Color not sole indicator: status uses both color badge + text label
- Focus visible: 2px solid outline, 4px space
- Modal: `aria-modal="true"`, trap focus, restore on close
- Text contrast: 4.5:1 (upgr from --ink3 to --ink2)
- Keyboard: Tab, Shift+Tab, Enter (submit/expand), Esc (close modal)
- Screen reader: "Region: Licensing lane, 14 cases, 2 breached"

**Responsive <760px**:
- Stack lanes vertically (full width)
- Collapse duty panel → banner (top 1 case)
- Modal full-width with bottom sheet style
- Touch targets ≥44×44px
- No horizontal scroll

---

This design is **L4 workflow depth** for regulator: full state machine + pre-trade-style gating (completeness checks before participation) + downstream cascades (licensing → creates license record; enforcement → escalates to council) + structured reason codes + evidence chains.
