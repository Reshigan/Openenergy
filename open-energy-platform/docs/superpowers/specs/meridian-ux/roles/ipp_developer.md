## Role journey: ipp_developer

The IPP Developer role represents a **project finance owner** managing a single 12-MW to 450-MW greenfield or repowering project through its entire lifecycle: DG0 feasibility → DG1 prep → DG2 design → DG3 FID → construction → COD → operations → possible loan restructure or PPA buyout. Today, 61 of their 207 visible chains are laned but completely unreachable (29 are sub-document collections belonging under one "Project Dossier" surface; the rest are counterparty-read-only via Thread); 50+ chain tiles exist but resolve to empty bodies or 404s; onboarding fails for esco/epc roles; only 2 of 10 roles get a provisioned entity on signup. This journey fixes all of that.

---

### 1. Acquisition, invite & first login

**Path:** User receives email invite with OE link → clicks sign-up button → email verification → password set → first login redirect.

**Screen: Email invite**
- Hero: "You've been invited to Open Energy Platform by [Lender/Offtaker name]"
- Copy: "Join the energy exchange. Manage your project's full lifecycle: construction, financing, settlement, and grid integration in one workspace."
- CTA: "Create account" (links to sign-up form)

**Screen: Sign-up form (email verified)**
- Fields: Full name · Mobile · Organization · Password confirmation · read ToS checkbox
- On submit: creates `oe_users.email_verified=true` record, role defaults to `ipp_developer` (inferred from invite tenant role context), redirects to `/onboard`

**Screen: After first login, LaunchRedirect**
- Checks `GET /api/onboarding/state` → returns `{ onboarding_complete: false }`
- Redirects to `/onboard` (OnboardingWizard component)

---

### 2. Onboarding wizard for ipp_developer

**Current broken state:** Onboarding tries to run for ALL roles in sequence (admin + trader + ipp_developer + 7 more). Each step checks role-specific flags in `oe_onboarding_steps` table. For esco/epc, the step sequence throws because no role mapping exists. Provisioning creates entity for only 2 roles. **Fixed state below.**

**Screen: Onboarding step 1 — "Welcome to your workspace"**

Header: "Open Energy Platform — Energy Project Lifecycle" (logo + gradient)

Six role-specific hero cards in a grid (only ipp_developer's card has check ✓ visible until completion):

- **Your role: IPP Developer** — "Manage your project from feasibility through operations. Finance, construction, grid connection, trading."
- Lender card (greyed, "Coming soon") — only shows if user is a co-admin on a lender tenant
- Offtaker card (greyed, "Coming soon") — only shows if user is a co-admin on an offtaker tenant
- (etc. for other registered roles on their tenant)

CTA: "Next" (button)

**Screen: Onboarding step 2 — "Create your first project"**

Copy: "Tell us about your project to unlock all features. We'll auto-populate your dashboard with relevant workflows."

Fields (form):
- Project name* (lookup: `/api/ledger/lookup/ipp-projects?tenant=X&unlinked=1` returns projects in the user's tenant with no `oe_projects.project_owner` yet)
  - If no projects exist, show: "Didn't find your project? File will be created after you click Next."
  - Type: `lookup` with autocomplete; alternatively type: `string` for new entry
- Project type* (enum: Solar · Wind · Hydro · Biomass · Other); default: empty
- Capacity (MW)* (number, 1–500 MW)
- Technology (string; placeholder: "e.g. 250 MW PV, fixed tilt")
- Location / province* (enum: Eastern Cape · Free State · Gauteng · KwaZulu-Natal · Limpopo · Mpumalanga · Northern Cape · North West · Western Cape)
- Expected COD date (date; placeholder: today+24 months)

On submit → POST `/api/onboarding/provision-entity` with payload:
```
{
  role: 'ipp_developer',
  entity_type: 'ipp_project',
  entity_name: <project_name>,
  metadata: { capacity_mw, technology, province, expected_cod }
}
```

Response creates:
- `oe_projects` row (if new)
- `oe_project_owners` link row (entity_type='ipp_developer', owner_id=current_user.id)
- Returns `{ success: true, entity_id: 'proj_xxx' }`

**Screen: Onboarding step 3 — "Sandbox practice"**

Copy: "Try the platform risk-free. We've pre-loaded a demo project in an isolated sandbox. Click 'Open demo project' to explore workflows."

Two cards:
1. **Live project** — "[Your project name]" — CTA: "Continue to my project" (navigates to `/horizon`)
2. **Sandbox demo** — "Demo 50 MW Solar (Limpopo)" — CTA: "Open demo" (navigates to `/horizon?tenant=demo&project=demo-50mw-solar`)

Note at bottom: "Your sandbox data resets every Monday. Real project data saves permanently."

**Screen: Onboarding step 4 — "Set up your team" (optional; can skip)**

Copy: "Invite lenders, offtakers, and service providers. They'll see only the parts of your project they need."

Field: "Invite by email" (text input, comma-separated emails, 0+ entries)

CTA: "Send invites" (or "Skip for now")

On send → for each email, creates `oe_user_invites` record, fires async email with tenant-scoped link (lender/offtaker/etc. role inferred from context).

**Screen: Onboarding step 5 — "Checklist: get to COD"**

Copy: "Your project journey in 5 phases."

Five-card timeline (collapsed accordion or card stack):

1. **Feasibility (DG0)**
   - ✓ Environmental assessment submitted
   - ☐ Financial model built
   - ☐ Grid study complete
   
2. **Preparation (DG1)**
   - ☐ REIPPPP application filed
   - ☐ Lender pre-qualification
   - ☐ EPC RFP launched

3. **Design (DG2)**
   - ☐ IE engineering sign-off
   - ☐ Offtaker PPA agreed
   - ☐ Procurement awarded

4. **Close (DG3–FID)**
   - ☐ Lender credit approved
   - ☐ Financial close
   - ☐ Construction notice issued

5. **Build (DG3–COD)**
   - ☐ Mechanical completion
   - ☐ Reliability run
   - ☐ COD certified by IE

Each card is clickable → navigates to the corresponding chain ledger (e.g., "Financial model built" → `/ledger/stage_gate?filter=dg1_pending`, "Lender pre-qualification" → `/ledger/credit_facility_application`).

**Screen: Onboarding complete**

Header: "Welcome! You're ready to go."

Three CTAs (side by side):
- "Open your Horizon workspace" (primary button → `/horizon`)
- "Browse all functions" (secondary → `/atlas`)
- "Read the IPP developer guide" (ghost → external link to help docs)

Post-completion → `POST /api/onboarding/mark-complete` with `role: 'ipp_developer'` → sets `oe_onboarding_steps.ipp_developer_complete = true` at tenant level. Next login → LaunchRedirect sees `onboarding_complete: true` → redirects to `/horizon`.

---

### 3. Landing on Horizon — Per-role workspace

**Path:** `/horizon` (no role param; inferred from JWT)

**Screen: Horizon landing (ipp_developer)**

**Header chrome (MeridianFrame)**
- Logo (OE)
- Role badge: "IPP Developer" (teal pill)
- Search/command palette (⌘K)
- User menu (profile / settings / sign out)
- Mobile: hamburger menu

**Main layout:**
- Left sidebar (collapsible): 6 domain icons + labels (Project Controls · Construction · Documents · Finance · Risk & Quality · Regulatory Compliance · Safety & Grid · Predictive ML · Environmental)
- Center: Duty board (top-8 cases by attention score) + lane cards below
- Right: (optional) context panel showing selected case detail or empty state

**Screen state: First login / zero cases**

**Duty board (top section)**
- Heading: "Your top priorities this week"
- Icon: "🔔" (bell) → Empty state graphic
- Copy: "No urgent cases yet. Once you create your first project and link it to lenders/offtakers, cases will appear here."
- CTA: "Create first case" (button, primary, navigates to `/atlas`)

**Lanes (middle section)**
- Six lane cards (one per domain visible to ipp_developer):

  1. **Construction** (Construction icon ⬡, teal gradient)
     - "0 active" (grey text)
     - Headline: "Procurement / RFPs, Construction / COD, Site diary, Change orders, …"
     - CTA: "View all" (→ filters lanes to show construction only; or side-panel expands)
     - Empty: "No construction cases yet. Start with a stage gate review or RFP."

  2. **Finance** (Finance icon ◎, gold gradient)
     - "0 active"
     - Headline: "Drawdown, Covenant certificates, Loan default, Take-or-pay, …"
     - CTA: "View all"
     - Empty: "No finance cases yet. Once lenders approve your facility, drawdown requests appear here."

  3. **Regulatory Compliance** (Regulatory icon ⬓, blue gradient)
     - "0 active"
     - Headline: "ED commitments, BBBEE, NERSA licence, Annual audit, …"
     - CTA: "View all"
     - Empty: "Regulatory cases populate as your project matures."

  4. **Safety & Grid** (Grid icon ⬡, purple gradient)
     - "0 active"
     - Headline: "Grid connection, Planned outages, HSE incidents, …"
     - CTA: "View all"
     - Empty: "Grid and safety cases appear post-COD."

  5. **Risk & Quality** (Risk icon ◩, orange gradient)
     - "0 active"
     - Headline: "Stage gates (DG0–DG4), Risk register, NCR log, …"
     - CTA: "View all"
     - Empty: "Start with a DG0 stage gate to begin your governance journey."

  6. **Project Controls** (Project icon ◈, purple gradient)
     - "0 active"
     - Headline: "Milestones, Schedule, Cost & EVM, Variance reports, …"
     - CTA: "View all"
     - Empty: "Project controls unlock after DG0 gate pass."

**Screen state: After creating first project + stage gate**

**Duty board (updated)**
- Case card: "Stage gate DG0: [Project name]" (title truncated)
  - Status: "gate_proposed" (yellow badge)
  - Deadline: "5 days left" (red if <2 hrs, yellow if <24 hrs, grey if dormant)
  - Quantum: "R 450M capex" (right-aligned, smaller font)
  - Attention score: Ranked #1 (sorted by breach + money/hours-remaining)
  - Actions visible: "Compile evidence · Defer · Record decision · Pass gate" (up to 4 primary/ghost actions; overflow in menu)

**Lane: Construction** (now populated)
- "1 active" (bold)
- Card inside: "Stage gate DG0: [Project]" (same as duty board case)
  - Click → navigates to `/thread/stage_gate/sg_xxx` (Thread two-sided detail panel opens right-side)

**Keyboard + focus**
- Tab cycles: lanes → duty cases → CTAs
- Enter on lane card: opens `/thread` detail or `/ledger/:chainKey?filter=active`
- ⌘K: opens command palette (Atlas discovery)
- Escape: closes right panel if open
- Arrow keys (if focus on lane): ↓ cycles lane cards

**Responsive (<760px mobile)**
- Sidebar collapses to icon-only (hamburger reveals labels)
- Lanes stack vertically (full width, no columns)
- Duty board truncates to top-3 cases (view-all link expands)
- Right panel becomes full-width modal overlay (back button dismisses)

**A11y**
- Lane card: `role="region" aria-label="Construction cases"`
- Duty case: `role="article" aria-label="Stage gate DG0: [project]"`
- Card links: `tabindex="0"` (focusable), Enter/Space triggers nav
- Empty states: `role="status"` announces via screen reader on page load
- Attention score not exposed to AT (visual only; deadline + status convey urgency)

---

### 4. Discovering functions in Atlas (⌘K function library)

**Path:** `/atlas` or ⌘K from anywhere

**Screen: Atlas (ipp_developer)**

**Top section: Search + filter**
- Search box (auto-focused): "Search functions…" (debounce 300ms)
- Filter chip row (each toggles on/off): All · Construction · Finance · Regulatory · Risk & Quality · Safety · Project Controls · Predictive ML · Environmental
- "Show hidden chains" (toggle, ghost button) — only visible to admin/support

**Main grid (8–12 columns on desktop, 2–4 on mobile)**
Each tile = one entry from `roleData.domains[].features` for ipp_developer.

**Tile anatomy:**
```
┌─ Icon (domain color background) ─┐
│  [◈]                             │
├─────────────────────────────────┤
│ Feature label (16px, bold)       │
│ "Procurement / RFPs"             │
├─────────────────────────────────┤
│ 1-line description (12px, grey)  │
│ "REIPPPP RFP and procurement…"   │
├─────────────────────────────────┤
│ [Status pill: "draft"]           │  ← mockState (if exists)
│ Or: [Chevron >] (if no status)   │
└─────────────────────────────────┘
```

**Three tile types:**

1. **Chain ledger tile** (chainKey present in roleData.Feature)
   - Example: "Procurement / RFPs" (feature.chainKey = 'procurement_rfp')
   - Click → `/ledger/procurement_rfp`
   - Shows: list of all RFP cases visible to this role, +New form at top

2. **Dossier tile** (fake tile for sub-document collection)
   - Example: "Project Dossier" (icon: 📋, label hardcoded in surfaces.tsx)
   - Feature key: `ipp_developer:dossier`
   - Chains under it: 29 ipp_* sub-docs (ipp_schedule, ipp_evm, ipp_doc_control, ipp_submittal, ipp_rfi, ipp_tq, ipp_mir, ipp_subcontractor, ipp_method_statement, ipp_construction_diary, ipp_dfr, ipp_punch_list, ipp_handover_dossier, ipp_final_completion, ipp_om_handover, ipp_payment_cert, ipp_performance_bonds, ipp_bfs, ipp_ccc, ipp_cep, ipp_eco, ipp_env_closure, ipp_esmr, ipp_fm, ipp_ie_cert, ipp_land_register, ipp_tpa, ipp_refi, ipp_lta, ipp_iear)
   - Click → `/surface/ipp_developer:dossier` (renders ProjectDossierSurface, accordion with sections: Schedule · EVM · Documents · Material · Handover · Financial)
   - Each section shows tab-style list of cases

3. **Connector/ML tile** (route present in roleData.Feature, no chainKey)
   - Example: "SCADA connectors" (feature.route NOT PRESENT in existing code; surfaces.tsx has 'ipp_developer:scada')
   - Feature key: `scada`
   - Click → `/surface/ipp_developer:scada` (renders ScadaConnectorComponent)
   - Shows: telemetry ingestion UI, real-time data chart, connection status

**Search results behavior:**
- Typing "covenant" → filters tiles to "Covenant certificates" (lender:monitoring lane) — BUT THIS TILE IS HIDDEN
  - Tile still appears in search results (because user has read access via Thread)
  - Card header shows warning label: "Read-only (via counterparty)" (ghost pill)
  - Click → navigates to `/thread/covenant_certificate?role_view=ipp_developer` (Thread detail with read-only status note)

- Typing "drawdown" → shows "Drawdown requests" (finance lane, owned)
  - Tile shows normal clickability (no warning)
  - Click → `/ledger/drawdown` (editable list + +New form)

**Empty state after search**
- No matches: "No functions match 'xyz'" with hint: "Try searching for 'covenant', 'stage gate', or 'procurement'."

**Hidden chains** (40 tiles that resolve to empty bodies / 404)
- If "Show hidden chains" toggle ON (admin/support only):
  - Tiles appear with a ⚠️ icon + yellow border
  - Label: "Coal futures trading [EMPTY]" (dimmed text)
  - Copy: "This chain is not yet implemented for your role."
  - Click-disabled (no nav)

**Hover state (desktop)**
- Tile background color lightens 10%
- Shadow elevation increases (lift effect)
- Cursor: pointer

**Focus state (keyboard)**
- Tile border gains 2px focus ring (accent color)
- Box-shadow: 0 0 0 4px rgba(accent, 0.2)

**A11y**
- Each tile: `role="link" tabindex="0" aria-label="Procurement RFPs: REIPPPP RFP and procurement chain"`
- Heading: `<h1 role="heading" level="1">Atlas: Function library</h1>`
- Search box: `role="searchbox" aria-describedby="search-hint"`
- Filter chips: `role="group" aria-label="Domain filters"`
- Status pill (if mockState): `role="status" aria-label="Draft stage"`
- Empty state: `role="status" aria-live="polite">`

---

### 5. Initiating their PRIMARY owned transaction end-to-end: Stage Gate DG0

**Path:** `/ledger/stage_gate` or `+New` button on Horizon lane

**Screen: +New stage gate form** (Modal or in-page form)

**Header:** "Create new stage gate review"

**Form fields:**
1. **Gate index** (required, enum type → dropdown)
   - Options: ["0 (Feasibility)", "1 (Preparation)", "2 (Design)", "3 (Financial Close)", "4 (Construction)"]
   - Default: empty
   - Help text: "DG0 is for feasibility review. DG3 is the final investment decision (FID) gate."
   - Type: `enum` → UI: `<select>` (or segmented control for 5 options)

2. **Project** (required, lookup type)
   - Source: `/api/ledger/lookup/ipp-projects?tenant=X&exclude_closed=1`
   - Response: `{ success: true, data: [ { id: 'proj_xxx', label: 'Solar 250MW Limpopo' }, ... ] }`
   - UI: autocomplete searchbox (type to filter)
   - Default: if user created project in onboarding, pre-fill
   - Validation: if empty, show inline error "Project is required" (red border + icon)

3. **Title** (optional, string)
   - Placeholder: "e.g. DG0 technical feasibility review"
   - Max 255 chars

4. **Capex (ZAR)** (optional, number)
   - Placeholder: "e.g. 450000000"
   - Suffix: "ZAR"
   - Validation: if provided, must be ≥ 100_000 and ≤ 500_000_000_000 (floor/ceiling per Wave 131 rules)
   - Help: "Total capital expenditure for this phase. Used to determine SLA tier and regulator notification requirements."

5. **Equator Category** (optional, enum)
   - Options: ["Category A (Highest risk)", "Category B (Medium risk)", "Category C (Lower risk)"]
   - Help: "IFC Equator Principles classification. Category A → lender escalation required."

6. **Debt sized?** (optional, boolean checkbox)
   - Label: "Project has been financed"
   - Help: "Check if lender facility amount is confirmed."

7. **FID committed amount (ZAR)** (optional, number)
   - Placeholder: "1500000000"
   - Only visible if "Debt sized" is checked
   - Help: "Final Investment Decision committed amount."

8. **NERSA notifiable?** (optional, boolean)
   - Label: "Meets NERSA reporting threshold (>100 MW)"
   - Auto-checked if capex > threshold per NERSA rules
   - Help: "If checked, regulator inbox receives a notification on gate pass."

9. **Reason / notes** (optional, string)
   - Placeholder: "e.g. Scope refined following IE geotechnical survey"
   - Max 500 chars
   - Help: "Internal notes for your team."

**Form state: Submission**

On submit:
- Client-side validation: Gate index + Project required; capex must be numeric if provided
- If invalid: form stays open, field errors inline (red borders + "Required" or "Invalid number" label)
- If valid: Show loading spinner, disable submit button
- POST `/api/stage-gate` with payload:
  ```json
  {
    gate_index: 0,
    project_id: "proj_xxx",
    title: "DG0 technical feasibility review",
    capex_zar: 450000000,
    equator_category: "cat_a",
    debt_sized: true,
    fid_committed: 1500000000,
    nersa_notifiable: true,
    reason_code: "Scope refined following IE geotechnical survey"
  }
  ```

**Response:** `{ success: true, data: { id: 'sg_001', chain: 'stage_gate', status: 'gate_proposed' } }`

**Screen: Post-creation redirect → `/thread/stage_gate/sg_001`**

**Thread detail view (two-sided):**

**Left panel (Case header + status):**
- Breadcrumb: "Horizon > Construction > Stage gates > DG0"
- Title: "DG0 technical feasibility review" (h2)
- Case ref: "Gate SG-001" (grey subtitle)
- Status badge: "gate_proposed" (yellow)
- Quantum: "R 450M capex" (grey label "Capex")
- Deadline: "SLA deadline: 30 days from creation" (if set; grey)
- Counterparty: None (sponsor-side, no counterparty column in registry)

**Tabs:**
1. **Overview** (active)
   - Field rows (read-only display of submitted form):
     - Gate index: "0 (Feasibility)"
     - Project: "[Project name]"
     - Title: "[User-entered title]"
     - Capex: "R 450,000,000"
     - Equator Category: "Category A"
     - Debt sized: ✓ (checked)
     - FID committed: "R 1,500,000,000"
     - NERSA notifiable: ✓ (checked)
     - Reason: "[User notes]"

2. **Actions** (collapsible section or separate tab)
   - Header: "Next steps"
   - Action cards (each is a button leading to form modal):
     - "Compile evidence" (primary tone)
       - Label: "Compile evidence"
       - Description: "Upload Gate Review documentation: technical appraisals, financial models, environmental studies, IE report."
       - Click → Modal opens with file upload field + evidence textarea
       - Fields: `evidence_payload` (type: 'evidence') — renders as rich textarea + file picker
       - On submit → POST `/api/stage-gate/sg_001/compile_evidence`
     - "Record decision" (primary tone)
       - Label: "Record decision"
       - Description: "Document the gate review decision and any conditions."
       - Click → Modal opens
       - Fields:
         - `decision` (string): "e.g. Conditional pass — DG3 financial close"
         - `conditions_payload` (evidence): conditions text + files
         - `evidence_payload` (evidence): basis for decision
       - On submit → POST `/api/stage-gate/sg_001/record_decision`
     - "Pass gate" (primary tone, green)
       - Label: "Pass gate"
       - Description: "Approve this gate and proceed to the next phase. Downstream workflow notifications fire."
       - Click → confirmation dialog: "Passing DG0 will unlock DG1 prep workflows. Confirm?"
       - On confirm → POST `/api/stage-gate/sg_001/pass_gate`
     - "Defer gate" (ghost tone)
       - Label: "Defer gate"
       - Description: "Pause this gate review. You can resume later."
       - Fields: `reason_code` (string), `evidence_payload` (evidence)
     - "Reject gate" (oxide tone, red)
       - Label: "Reject gate"
       - Description: "Kill this gate. Project exits governance."
       - Fields: `reason_code` (string), `evidence_payload` (evidence)

3. **Timeline** (if eventsTable present)
   - Events table: Created (today) · Evidence compiled (if user clicked that action) · Decision recorded (if applicable)
   - Each event: timestamp, actor (ipp_developer email), action label, notes snippet

4. **Audit** (read-only; admin/support only)
   - Full audit trail of all changes (fireCascade events) with actor, timestamp, before/after values

**Right panel (Context / related items)** — Collapsed drawer or sticky panel
- "Related items" heading
- Card: "Project: [Project name]"
  - Link → `/ledger/ipp_projects/proj_xxx` (if that endpoint exists; else gray-out)
  - Metadata: Status, Capacity, Expected COD

- Collapsible section: "Linked lenders" (if any)
  - If project has no linked lenders: "(None yet. Add via 'Invite partners' in Atlas)"
  - If linked: List of lender orgs + "View facility applications" link

**Empty state for right panel** (common on first case)
- Icon: 🔗 (link icon)
- Copy: "No related items yet. Once you link a lender or offtaker to this project, their cases appear here."

**Keyboard + focus**
- Tab cycles: Case title → Status → Action buttons → Timeline → Close button (X)
- Enter on action button: opens modal
- Escape in modal: closes modal, focus returns to button
- Escape on panel: closes right panel
- Arrow keys: scroll timeline up/down if focused

**Responsive (<760px)**
- Right panel becomes modal (tap X or tap outside to dismiss)
- Action buttons stack vertically (full width)
- Timeline text size 12px (not 14px)

**A11y**
- Status badge: `role="status" aria-live="polite" aria-label="Gate status: Proposed"`
- Action section: `role="region" aria-label="Stage gate actions"`
- Action button: `role="button" tabindex="0" aria-label="Compile evidence: Upload Gate Review documentation"`
- Deadline (if present): `aria-label="SLA deadline: 30 days from creation (5 days remaining, breached if red)"`
- Timeline: `role="log" aria-live="polite">`
- Evidence upload field: `aria-describedby="evidence-hint">` with hint text below

**AI inline assist** (on Actions tab)

Below the action cards, a collapsible card:

```
┌─ 🤖 AI Insight ─────────────────────┐
│ Looks like you haven't compiled     │
│ evidence yet. Based on your project │
│ details, here are typical docs:     │
│                                     │
│ ✓ IE technical appraisal            │
│ ✓ Financial model (NPV, IRR)        │
│ ✓ Environmental screening           │
│ ✓ Grid connection study             │
│                                     │
│ [← Dismiss] [Add to evidence →]     │
└─────────────────────────────────────┘
```

- Toggled on by default if case.status = 'gate_proposed' AND no evidence_payload yet
- Dismiss: hides card for this session (localStorage flag)
- Add to evidence: copies checklist text to evidence_payload field + focuses it
- Powered by `buildTraderAiSuggestions` pattern (cf. src/routes/launch.ts)

---

### 6. Cross-role interaction via Thread: Covenant certificate (Counterparty read-only)

**Scenario:** IPP project financed by a lender. Lender requests Q2 covenant certificate from IPP borrower.

**Path:** Lender posts `POST /api/covenant-certificate/chain` (initiates case) → Case appears in lender's Horizon lane (monitoring) BUT NOT in IPP's Horizon (because ipp_developer lane for covenant_certificate = 'finance', which is a counterparty-read lane, not owned).

IPP discovers covenant_certificate via:
- Email notification from cascade: "Covenant certificate Q2 2026 requested by [Lender]. Certificate due in 14 days."
- Or Atlas search: typing "covenant" reveals tile with "Read-only (via counterparty)" warning label
- Or Thread deep-link sent by lender: `https://oe.vantax.co.za/thread/covenant_certificate/cc_001?role_view=ipp_developer`

**Screen: Covenant certificate Thread (ipp_developer view)**

**Left panel (Case detail)**
- Breadcrumb: "Horizon > Finance > Covenant certificates (read-only)" (grey italic; note: not in owned lanes)
- Title: "Covenant certificate Q2 2026" (h2)
- Case ref: "CC-Q2-2026-101" (grey subtitle)
- Status badge: "under_review" (grey)
- Facility name: "Project: [IPP project name]" (grey label)
- Quantum: "R 450M outstanding principal" (grey)
- Deadline: "14 days until certificate due" (red if <2 days, yellow if <7 days)
- Counterparty: "Lender: [Lender bank name]" (grey label)

**Role note card** (at top of Overview tab)
```
┌─ ℹ️ You're viewing this as Borrower ──┐
│ This covenant certificate was        │
│ initiated by your lender. You can    │
│ submit your compliance certificate   │
│ and respond to queries, but cannot   │
│ modify the lender's review status.   │
│                                      │
│ [Learn more] [Contact support]       │
└──────────────────────────────────────┘
```

**Tabs:**
1. **Overview** (read-only fields)
   - Certificate number: "CC-Q2-2026-101"
   - Facility name: "Tranche A Senior Debt"
   - Covenant type: "DSCR ≥ 1.20x"
   - Status: "under_review"
   - Deadline: (red if breached)

2. **Your actions** (only actions where ipp_developer role has write access)
   - Heading: "Borrower actions"
   - Action cards (ipp_developer can execute these per chains registry):
     - "Submit certificate" (primary tone)
       - Label: "Submit certificate"
       - Description: "Upload your Q2 audited financial statements and covenant compliance certificate."
       - Fields: `certificate_ref` (string), `dscr_actual` (number), `llcr_actual` (number), `gearing_actual` (number), `submission_basis` (evidence)
       - On submit → POST `/api/covenant-certificate/chain/cc_001/submit-certificate` (roles: [admin, support, lender]; ipp_developer NOT in roles, so will fail with 403 unless route explicitly allows ipp_developer)
       - **Issue found:** registry says submit-certificate roles: ['admin', 'support', 'lender'] only. IPP can't submit. **Fixed state:** roles updated to ['admin', 'support', 'lender', 'ipp_developer'].
     - "Request waiver" (ghost tone)
       - Label: "Request waiver"
       - Description: "Ask lender for a waiver if you expect a temporary breach."
       - Fields: `waiver_ref` (string), `waiver_basis` (evidence)
     - "Flag breach" (oxide tone, red)
       - Label: "Report breach"
       - Description: "Notify lender if your Q2 covenant ratio fell below threshold. Do this immediately to trigger the cure window."
       - Fields: `reason_code` (enum: ['dscr_breach', 'llcr_breach', 'gearing_breach', 'reporting_failure']), `breached_covenants` (string), `breach_basis` (evidence)

3. **Lender actions** (read-only for reference)
   - Heading: "Lender actions (view only)" (grey italic)
   - Disabled action cards (greyed out, no click):
     - Begin review (disabled, shows: "Lender only")
     - Flag breach (disabled)
     - Grant waiver (disabled)
     - Confirm compliant (disabled)
   - Note: "(Your lender controls these steps.)"

4. **Timeline**
   - Events: Case created (2 days ago), Reviewed by lender (1 day ago), Awaiting your certificate submission (status now)

**Right panel (Context)**
- Related case: "Drawdown request TR-2026-Q2" (if linked via cascade)
  - Status: "lender_review"
  - Link: → `/thread/drawdown/dr_xxx`
  - Note: "Drawdown will complete once covenant certificate is signed off."

- Related surface: "Facility details"
  - Link: → `/surface/ipp_developer:projects?project=proj_xxx` (project surface)

**Keyboard + focus**
- Tab: Case header → Your actions section → Action buttons → Lender actions (read-only) → Timeline
- Enter on action button (Your actions): opens modal
- Escape in modal: closes, focus returns to button
- Arrow keys: scroll action buttons if many

**Responsive (<760px)**
- Right panel → modal
- Action buttons stack vertically

**A11y**
- Role note card: `role="region" aria-label="Important: You are viewing as borrower"`
- Status: `aria-label="Status: Under review. Certificate due in 14 days (red if overdue)"`
- Your actions: `role="region" aria-label="Actions you can take as borrower"`
- Lender actions: `aria-disabled="true" role="button" aria-label="Begin review (lender only)">`
- Deadline: `aria-live="assertive"` (announces urgency changes)

**Cascade integration:**
When lender posts "Flag breach" action → `fireCascade({ event: 'covenant_certificate.breach_flagged', actor_id: lender_id, entity_type: 'covenant_certificate', entity_id: 'cc_001', data: { ... } })` → pushRoleAction to IPP in 'finance' lane + email notification + dunning cycle 1 kicks off (W6 regulator inbox note).

---

### 7. Ongoing daily work + AI inline assists

**Scenario:** IPP developer has 3 live projects in Horizon. One is in Stage Gate DG2 (design phase), another in Construction (COD), third in Finance (drawdown review).

**Screen: Horizon, Day 5 of working on projects**

**Duty board (top section, updated with live cases)**
- Case #1: "Stage gate DG2: [Project A]" — Status: "board_briefing_circulated" — Deadline: "3 days" (yellow) — Capex: "R 620M" — Action: "Record decision"
- Case #2: "Drawdown request TR1: [Project B]" — Status: "ie_review" — Deadline: "1 day" (red ⚠️ BREACHED) — Amount: "R 150M" — Action: "Approve drawdown"
- Case #3: "Procurement RFP: [Project C]" — Status: "evaluation" — Deadline: "10 days" — Capex: "R 240M" — Action: "Shortlist vendors"

**AI assist cards** (injected per case in duty board)

Each case card has a small "+ AI insight" link (or auto-expands on hover for first 2 cases).

**Case #2 (Drawached drawdown):**
```
┌─ 🤖 AI Insight (Case #2) ─────────────────┐
│ Your IE review is 1 day overdue. We       │
│ analyzed your project risk profile and    │
│ recommend these CP priorities to unlock   │
│ funding:                                  │
│                                           │
│ Priority 1: Finalize land title cession   │
│   (Security perfection W69 gate)          │
│ Priority 2: Confirm insurance coverage    │
│   (Main perils rider)                     │
│ Priority 3: Grid connection approval      │
│   (GCA C-1 chain, ref: gca_456)           │
│                                           │
│ [View CP tracker] [Dismiss]               │
└───────────────────────────────────────────┘
```

- Generated by `buildTraderAiSuggestions` in `/api/launch` or on-demand via `/api/ai/suggest?chain=drawdown&id=dr_001`
- If user clicks "View CP tracker" → navigates to `/ledger/cp_tracker?filter=drawdown_tr1`
- Dismiss: localStorage flag per case (doesn't appear again for 24 hours or until status changes)

**Lane cards (Construction domain expanded)**

"Construction" lane shows 3 cards:
1. Stage gate DG2 (with AI insight card below)
2. Procurement RFP (with AI insight card)
3. (Empty placeholder) "Start a change order for Project A" (CTA)

**Search + command palette (⌘K)**

User presses ⌘K:
```
┌─────────────────────────────────────┐
│ Search functions…                   │
│ [search box, auto-focused]          │
│                                     │
│ Recent:                             │
│ • Stage gate DG2 (Project A)        │
│ • Drawdown request TR1              │
│ • Procurement RFP                   │
│                                     │
│ Suggestions:                        │
│ ⌘K again → Shortcuts                │
│ ? → Help                            │
└─────────────────────────────────────┘
```

Type "create insurance claim":
```
│ Insurance claim                      │
│ "File a warranty RMA or insurance… │
│ [ipp_developer:insurance_claims]    │
│ [Enter to navigate]                 │
└─────────────────────────────────────┘
```

Press Enter → navigates to `/ledger/insurance_claim` (show all insurance cases or +New form).

---

### 8. Sign out

**Path:** User menu (top-right) → "Sign out"

**Confirmation dialog (optional, if session has unsaved changes)**
```
┌─ Sign out? ─────────────────────┐
│ You have unsaved changes in:    │
│ • Stage gate DG2 evidence       │
│                                 │
│ [Cancel] [Sign out & discard]   │
└─────────────────────────────────┘
```

**Action:** DELETE JWT token (clear localStorage['token']), DELETE session cookie, redirect to `/auth/login`.

**Screen: Login page**

Empty login form (email + password), with "Register" link if tenant allows self-signup.

Copy: "Welcome back to Open Energy Platform. Log in to your project workspace."

---

## Pain points fixed in this journey

1. **61 unreachable chains** → Now visible:
   - 29 ipp_* sub-docs grouped under "Project Dossier" surface (single tile in Atlas, not 29)
   - Counterparty-read chains (covenant_certificate, loan_default, ppa_take_or_pay) now discoverable in Atlas with "Read-only" label; Thread detail available
   - Admin chains still laned but appear only in admin Horizon, not ipp_developer

2. **50+ empty Atlas tiles** → All tiles now have:
   - Landing page: `/ledger/:chainKey` with list + +New form, OR
   - `/surface/:key` with rich component (Project Dossier accordion, connectors, ML, etc.)
   - No 404s; every tile routes to a real component

3. **Onboarding fails for esco/epc** → Fixed:
   - Step sequence is per-role, not all-roles-in-sequence
   - Only ipp_developer step sequence runs for IPP users
   - Provisioning creates entity for all 10 roles (one per tenant signup)

4. **No entity provisioned** → Fixed:
   - Onboarding step 2 creates `oe_projects` + `oe_project_owners` link
   - User lands on Horizon with at least one "owned" case (stage gate or project reference)

5. **Duty board empty, zero urgency cues** → Fixed:
   - Duty board ranks by attention score (quantum + deadline urgency)
   - Breached cases float to top (red badges)
   - AI assists surface missing CPs, overdue actions, related downstream cases

6. **No guided entry to primary workflow** → Fixed:
   - Onboarding step 5 (checklist) links each phase directly to relevant chain ledgers
   - +New buttons on Horizon lanes + Atlas tiles provide full form

7. **Thread doesn't show cross-role context** → Fixed:
   - Right panel shows "Related items" (lender if finance case, offtaker if PPA case)
   - Role note card (top of left panel) clarifies read-only vs. write access
   - Lender actions shown as greyed-out reference, not hidden

8. **Form fields: 1275 free-text, only 74 lookups** → Fixed:
   - All *_id fields now route through `/api/ledger/lookup/:source` (whitelisted in static literal, not request input)
   - Dropdowns for enum fields (gate_index, equator_category, reason_code)
   - Evidence fields (rich textarea + file upload) for narrative + docs

9. **No AI assists** → Fixed:
   - AI insight cards on duty board cases (what CPs to fix next, overdue alerts, related cases)
   - Inline in Action sections (e.g., "Typical docs for Stage Gate DG0")
   - Powered by `/api/ai/suggest?chain=X&id=Y` (calls Claude via Workers AI binding)

10. **Header quicklinks role-blind** → Fixed:
    - Hero badge shows current role (IPP Developer)
    - Recent cases in ⌘K reflect role's visible chains only
    - Quick jump links in header update based on role context

---

**End of IPP Developer journey map.**
