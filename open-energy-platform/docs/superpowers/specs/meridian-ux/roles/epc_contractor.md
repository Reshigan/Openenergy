## Role journey: epc_contractor

### Overview
EPC Contractor (Energy Project Contractor) manages construction documentation, quality control, and site handover for IPP projects. Role is invited to projects by the IPP Developer and operates under a shared IPP project during construction phases (design → procurement → construction → commissioning → post-COD). Current state: onboarding throws (no step sequence), no entity provisioned, 4 chains visible (mostly read-only), 2 non-chain surfaces (RFIs, technical queries), missing critical document-control chains.

---

## 1. Acquisition & First Login

### Invitation Flow (IPP Developer initiates)
1. IPP Developer creates a project and invites contractor via `/ipp-lifecycle/workstation` → "Invite partners" feature
2. Contractor receives email with registration link containing a one-time invite token
3. Contractor clicks link → Sign-up form with pre-filled company name, email, role='epc_contractor'
4. Contractor sets password, creates account
5. System creates `participants` row: `role='epc_contractor'`, `onboarding_step='welcome'`, `onboarding_completed=0`
6. Redirect to `/onboard` → **CURRENTLY THROWS** because ONBOARDING_STEPS has no entry for 'epc_contractor'

### Fix: Add epc_contractor to ONBOARDING_STEPS
```
epc_contractor: ['welcome', 'company_setup', 'project_access', 'document_standards', 'complete']
```

---

## 2. Onboarding Wizard (Post-fix)

### **Screen: Welcome Step** — `/onboard?step=welcome`
**State:** First-time user landing on onboarding
- **Layout:** Full-width centered card (max 600px)
  - Hero: "Welcome to Open Energy Platform — EPC Edition"
  - Icon: Orange hard-hat / construction gear (color: `oklch(0.46 0.14 10)`)
  - Body copy: "You're invited to construct and deliver a renewable energy project. This wizard walks you through document standards, project access, and team setup."
  - CTA button: "Start onboarding" (primary, oklch tone)
  - Footer link: "Skip onboarding" (ghost tone, route /horizon after skip)
  - Accessibility: `role="main"`, h1 "Welcome to Open Energy Platform"
  
**Keyboard:** Tab through Start / Skip buttons, Enter to activate
**Responsive:** Full-width on mobile (<760px), card centered
**Empty state:** N/A (first visit only)

---

### **Screen: Company Setup Step**
**State:** Entering contractor entity details
- **Layout:** Vertical form with 4 sections
  
**Section 1: Company Profile**
- Text input: "Company name" (required, placeholder="ABC EPC Holdings")
- Dropdown (lookup `/api/ledger/lookup/epc-registration-status`): "Registration status" (required)
  - Options: 'sole_proprietor' | 'close_corp' | 'pty_ltd' | 'foreign_branch'
- Text input: "CIPC / Registration number" (required)
- Text input: "Physical address" (required)

**Section 2: Project Assignment**
- Dropdown (lookup `/api/ledger/lookup/ipp-projects-open`): "Primary project" (required)
  - Displays: "[ProjectName] — [Capacity]MW [Technology] ([Status])"
  - Post-selection: Shows "You'll inherit IPP Developer's project journey; contact them for document templates."
  
**Section 3: Key Contact**
- Text input: "Primary contact name" (required)
- Text input: "Phone" (required)
- Text input: "Email" (read-only, auto-filled from signup)

**CTA:** "Next" button (primary); "Back" (ghost)

**Keyboard:** Tab through inputs, Shift+Tab backward; Enter on Next button
**Responsive:** Single column on mobile; inputs stack vertically; labels above inputs
**Accessibility:** fieldset per section with legend; aria-required on all required; error messages show inline below field
**Copy tone:** Professional, action-oriented

**Data saved:** Merged into `onboarding_data` JSON; step advances to 'project_access'

---

### **Screen: Project Access Step**
**State:** Confirming IPP Developer relationship & project scope
- **Layout:** Card with read-only project summary + confirmation checkboxes

**Section 1: Project Context** (read-only display)
```
Project: [ProjectName]
Location: [Location]
Technology: [Technology]
Capacity: [CapacityMW] MW
Status: [Status]
Developer: [DeveloperName]
```

**Section 2: Access & Permissions** (checkboxes)
- ☐ "I confirm I am authorized to represent [Company] on this project"
- ☐ "I accept the Document & Evidence Standards (see linked SANS 10142 + NERSA Grid Code excerpt)"
- ☐ "I commit to submit daily construction diaries per contract schedule"
- ☐ "I authorize safety incident escalation to IPP Developer & Regulator"

**Section 3: Team Onboarding** (optional pre-invite)
- Text (instruction): "Invite up to 3 team members now or do this later from the Team tab"
- Repeater: Name, Email, Role (site_supervisor | quality_engineer | safety_officer | field_crew)
  - (Add button; max 3 rows)

**CTA:** "Accept & continue" (primary); "Back" (ghost)

**Keyboard:** Tab through checkboxes, then Add / CTA buttons
**Responsive:** Single column; checkboxes left-aligned; team repeater stacks
**Accessibility:** Fieldset with legend "Confirm access"; aria-required on all checkboxes; link to standards opens in new tab (aria-label)
**Error state:** If unchecked, red border + aria-alert "You must accept all terms to continue"

**Data saved:** `{ company_name, registration_status, cipc_number, primary_project_id, contact_name, contact_phone, accepted_terms, team_invites }` merged into `onboarding_data`; step advances to 'document_standards'

---

### **Screen: Document Standards Step**
**State:** EPC contractor learning platform document discipline
- **Layout:** Tabbed interface or accordion (responsive: collapse to accordion <760px)

**Tab 1: Submittals & RFIs**
- Heading: "Submittals & RFI Workflow"
- Copy: "All design drawings, calculations, and equipment specs must be submitted through the platform's Submittals surface for IPP Developer + Engineer approval before ordering or installation."
- Bullet list:
  - "Each submittal gets a revision level (A, B, C…); subsequent revisions logged automatically"
  - "IPP Developer approves or requests info via RFI (Request for Information)"
  - "RFIs remain open until the submittal is revised and resubmitted"
  - "Platform captures all emails, approvals, and timestamps for NERSA/Grid Code compliance"
- CTA link: "View the Submittals surface" (opens `/surface/epc_contractor:rfis` in new tab)

**Tab 2: Change Orders & Variations**
- Heading: "Change Management"
- Copy: "Scope changes must be formally documented through Change Orders. These cascade to the IPP Developer, lender (if tranche-affecting), and regulator (if material)."
- Bullet list:
  - "Every change order is quantified: schedule impact (days), cost impact (ZAR), and safety/quality risk"
  - "IPP Developer (or engineer) approves within SLA; regulator notified for changes >R2M or >14-day delay"
  - "Platform blocks cost/schedule progression until change is approved"
- Link: "Change orders surface" (currently unavailable; shows "Coming soon")

**Tab 3: Non-Conformance (NCR) & Punch List**
- Heading: "Quality Control"
- Copy: "Quality issues are logged as Non-Conformance Reports (NCR). Minor defects are tracked on the pre-COD Punch List for closure before handover."
- Bullet list:
  - "NCR = significant deviation from spec; requires root-cause + corrective action"
  - "Punch List = minor cosmetic/finishing items; each logged and photographed before close-out"
  - "Both link to ITP (Inspection & Test Plans) — your test results must match the approved ITP scope"
- Links: "View NCRs" `/ledger/ncr`, "View Punch List" `/ledger/punch_list`

**Tab 4: Site Diary & Photographic Evidence**
- Heading: "Construction Records"
- Copy: "Daily site diaries and photo logs create a tamper-evident record for NERSA inspections, insurance, and lender drawdowns."
- Bullet list:
  - "Site diary captures: weather, crew count, work scope, delays, safety incidents"
  - "All photos geo-tagged and timestamped; no synthetic images accepted"
  - "Diaries feed IPP Developer's monthly progress reports and KPIs"
- Link: "View site diary" `/ledger/ipp_construction_diary`

**Section: Risk & Compliance**
- Heading: "What You're Audited On"
- Callout (--ink3 secondary, warning tone):
  - "EPC Contractors are rated on: document timeliness (submittal →approval SLA), NCR root-cause quality, punch-list closure rate, safety record, and schedule adherence."
  - "This platform is your audit trail. Every action, approval, and delay is logged and visible to IPP Developer and NERSA."

**CTA:** "I understand; continue" (primary); "Back" (ghost)

**Keyboard:** Tab through tabs (if tabbed UI) / accordion headers; Enter to expand/collapse
**Responsive:** <760px → accordion; >760px → tabs side-by-side
**Accessibility:** Tabs: `role="tablist"`, buttons `role="tab" aria-selected`, panels `role="tabpanel" aria-labelledby`. Accordion: button-based headers with `aria-expanded`.
**Copy tone:** Audit-first, compliance-forward; no jargon without explanation

**Data saved:** `{ acknowledged_document_standards: true }` merged; step advances to 'complete'

---

### **Screen: Completion Step**
**State:** Onboarding done; redirect to Horizon
- **Layout:** Success card
- Hero: Checkmark icon, "Onboarding complete"
- Body: "Your account is activated. Project access granted: [ProjectName]. You now have access to:"
  - Horizon (project dashboard)
  - Ledger (document & quality chains)
  - Atlas (function discovery)
  - Deal Desk (if IPP initiates cross-role transactions)
- Callout: "First entity provisioned: Contractor participant role on [ProjectName]. Check your email for your team invitation link."
- CTA: "Go to Horizon" (primary, routes `/horizon`)

**Keyboard:** Enter on button
**Accessibility:** `role="main"`, h1 "Onboarding complete"

**Backend action (on /complete POST):**
- Set `onboarding_completed=1`, `onboarding_step='complete'`
- Fire cascade event `onboarding.completed` with `{ role: 'epc_contractor' }`
- **Fix provisioning rule:** Update `onboarding-provisioning.ts` to add:
  ```typescript
  } else if (role === 'epc_contractor') {
    // No entity created (contractor is a document-access role, not a case owner)
    await logProvision(db, participantId, role, 'epc_role', null, null, { project_id: data.primary_project_id });
  ```
  This logs provisioning intent without creating an orphan entity.

---

## 3. First Login → Horizon (Post-onboarding)

### **Screen: Horizon — EPC Contractor Workspace**
**Route:** `GET /horizon` (after onboarding, LaunchRedirect routes here)
**State:** First-time landing on workstation

### **Layout: Three-column responsive grid**

**Column 1: Duty (Attention-ranked cases) — 50% width on desktop, full-width <760px, stacks**
- Card title: "Top priorities" (icon ▲)
- List of top 8 cases (cross-lane), sorted by attentionScore (breach + quantum)
- Each case card shows:
  - Chain name + case ref (e.g., "Punch List — PL-026-001")
  - Case title / project (e.g., "Solar array foundation rework")
  - Status badge (color-coded: open=gray, in_progress=blue, etc.)
  - Deadline (if any) in human format (e.g., "Due in 3h", "Overdue 2 days")
  - Quantum if applicable (e.g., "R450k rework cost")
  - Click → opens Thread `/thread/:chainKey/:id`
- **Empty state (no cases):** "No active cases. Check your lanes below for your full queue."
- **Keyboard:** Tab through cases, Enter to open Thread
- **a11y:** `role="region" aria-label="Top priorities"`; case cards `role="button" tabindex="0"`; heading `<h2>`

**Column 2: Lanes — 50% on desktop, full-width <760px**
- Sticky card headers per lane key from roleData domains
- **Lane: quality** (icon ◈, color oklch(0.45 0.13 165))
  - Cases from: `itp`, `punch_list`, `ncr`, `ipp_method_statement`
  - Each lane shows count + breakdown (e.g., "8 items: 2 breached, 1 due today, 5 later")
  - **Card rows per case:**
    - Ref / title (clickable → Thread)
    - Status + deadline
  - **Filter toggle** (default: hide terminal statuses)
    - Buttons: "All", "Active", "Overdue"
  - **Sort dropdown:** "Priority" (default), "Deadline", "Cost"
  - **Expand/collapse lane button** (mobile: default collapsed)

- **Lane: site_setup** (icon ⬡, oklch(0.50 0.14 55))
  - Cases from: `ipp_construction_diary`
  - Similar card structure

- **Lane: safety** (icon ⚠, oklch(0.46 0.18 25))
  - Cases from: `hse_incident`
  - Red accent if any breached

**Column 3: KPIs / Checklist (mobile: off-canvas drawer, desktop: right sidebar)**
- Card title: "This week's goals"
- Progress checklist:
  - ☐ 5 submittals pending approval
  - ☐ 0 NCRs breached
  - ☐ Punch list 60% closed (9/15)
  - ☐ Site diary submitted (daily)
- KPI card below:
  - "Submittal approval SLA" — avg 3.2 days / target 2 days (red badge if miss)
  - "Punch list closure rate" — 85% (green)
  - "Safety incidents YTD" — 0 (green, medal icon)
- Callout: "Next 7 days: 1 ITP review due, 2 NCR root-causes due, weekly site handover call Tuesday 10am"

### **Responsive (<760px):**
- Duty stacks on top
- Lanes below as full-width cards, each collapsible
- KPIs in a drawer (bottom sheet on tap "KPIs")
- Sticky header: role name, project name, sign-out

### **Keyboard Navigation:**
- Tab cycles through duty cards → lane headers → lane cases → KPI checklist items
- Shift+Tab reverses
- Enter on case / checklist item opens Thread or toggles
- Escape closes any open drawer

### **a11y:**
- `main role="main"`
- Lanes: `role="region" aria-label="[LaneKey]"`
- Status badges: aria-label with text (e.g., "Status: in progress")
- KPI checklist: `role="group" aria-label="This week's goals"`
- Color not the only indicator of status (text labels + icons required)

### **Empty State (zero cases across all lanes):**
- Hero card: "All caught up!"
- Body: "No active cases. Check Atlas below to discover functions, or wait for IPP Developer to invite you to new projects."
- CTA: "Explore Atlas" (button, routes to `/atlas`)

---

## 4. Atlas — Function Discovery

### **Route:** `GET /atlas` (accessed via ⌘K or "Explore" CTA from Horizon)
**State:** Command palette / function library

### **Layout: Full-screen modal**
- Left sidebar: Domains (tree view)
- Right main area: Feature tiles / search results

### **Domain List (EPC Contractor roleData domains):**
1. **Document Control** (icon ▤, oklch(0.42 0.10 250))
   - Submittals (surface `epc_contractor:rfis`)
   - RFIs (surface `epc_contractor:rfis`)
   - Change orders (unavailable — "Coming soon")
   - Technical queries (surface `epc_contractor:technical-queries`)

2. **Quality Management** (icon ◈, oklch(0.45 0.13 165))
   - ITPs (ledger chain `itp`)
   - NCRs (ledger chain `ncr`)
   - Punch list (ledger chain `punch_list`)
   - Method statements (ledger chain `ipp_method_statement`)

3. **Site Setup** (icon ⬡, oklch(0.50 0.14 55))
   - Site diary (ledger chain `ipp_construction_diary`)

4. **Safety & HSE** (icon ⚠, oklch(0.46 0.18 25))
   - HSE incidents (ledger chain `hse_incident`)

5. **Handover** (icon ◉, oklch(0.42 0.15 270))
   - Audit log (surface `epc_contractor:audit`)

### **Tile Layout (right main area):**
Each feature rendered as a clickable card:
```
┌─────────────────────────────────┐
│ [icon] Feature Label            │
│                                 │
│ Description text (1–2 lines)    │
│                                 │
│ Status badge (e.g., "3 active") │
└─────────────────────────────────┘
```

**Tile behavior:**
- Tile with chainKey → routes to `/ledger/:chainKey` (list view)
- Tile with surface `route` (e.g., `epc_contractor:rfis`) → routes to `/surface/epc_contractor:rfis`
- Unavailable tile (coming soon) → gray, disabled, tooltip "Available in next release"

### **Feature tile examples (EPC Contractor):**

| Feature | Domain | Type | Routes to | Status |
|---------|--------|------|-----------|--------|
| Submittals | Document Control | Surface | `/surface/epc_contractor:rfis` | ✓ Active |
| RFIs | Document Control | Surface | `/surface/epc_contractor:rfis` | ✓ Active |
| Change orders | Document Control | Coming | — | ⏳ Unavailable |
| Technical queries | Document Control | Surface | `/surface/epc_contractor:technical-queries` | ✓ Active |
| ITPs | Quality Management | Chain | `/ledger/itp` | ✓ Active |
| NCRs | Quality Management | Chain | `/ledger/ncr` | ✓ Active |
| Punch list | Quality Management | Chain | `/ledger/punch_list` | ✓ Active |
| Method statements | Quality Management | Chain | `/ledger/ipp_method_statement` | ✓ Active |
| Site diary | Site Setup | Chain | `/ledger/ipp_construction_diary` | ✓ Active |
| HSE incidents | Safety & HSE | Chain | `/ledger/hse_incident` | ✓ Active |
| Audit log | Handover | Surface | `/surface/epc_contractor:audit` | ✓ Active |

### **Search & Filter:**
- Top search box: "Search features…" (filters tiles by label + description)
- Filter buttons: "All", "Active", "Coming soon" (default: All)
- Keyboard: ⌘K to open/close (or Escape); Ctrl+K on Windows

### **Responsive (<760px):**
- Full-screen modal (no sidebar on mobile)
- Domains as collapsible accordion above tiles
- Tiles in single column

### **a11y:**
- Modal: `role="dialog" aria-modal="true" aria-label="Function discovery"` + focus trap (Escape or close button restores focus to trigger)
- Tiles: `role="button" tabindex="0"` with `aria-label="[Feature] — [Description]"`
- Status badges: `aria-label` (e.g., "3 active items")
- Links: keyboard accessible via Tab / Enter

### **Empty state (search returns zero):**
- Icon + text: "No features match your search"
- Suggestion: "Try a different term or browse domains on the left"

---

## 5. Ledger → Initiate Primary Transaction (Site Diary Chain)

### **Context:** EPC Contractor's primary owned action = daily site diary entry (chain key `ipp_construction_diary`, W143)
**Route:** `GET /ledger/ipp_construction_diary` (list view)
**State:** First-time landing on the chain list

### **Screen: Ledger List View — Site Diary**
**Header:**
- Breadcrumb: "Horizon > Quality > Site diary"
- Chain title: "Site Diary" (icon 📔)
- Tabs (if multiple Ledgers): N/A (single chain view)

**Controls (top-right):**
- **+New button** (primary tone) → opens initiation modal
- Filter dropdown: "All", "This week", "Critical delay", "No work"
- Sort dropdown: "Date (newest)", "Date (oldest)", "Status"
- Search box: "Search by ref…"

**List (table format, responsive: collapse to card view <760px):**
| Ref | Date | Day Type | Weather | Notes | Status |
|-----|------|----------|---------|-------|--------|
| SD-2026-1043 | 2026-06-16 | daily_operational | Clear | 12 crew, 2 MW array blocks completed | ✓ Submitted |
| SD-2026-1042 | 2026-06-15 | daily_operational | Overcast | Generator delivery delayed; revised schedule | ⏳ Draft |
| — | — | — | — | — | — |

**Column rendering:**
- Ref (clickable → opens Thread)
- Date (human format: "Jun 16, 2026")
- Day Type (enum badge: daily_operational=blue, critical_delay=red, shutdown_partial=orange, no_work=gray)
- Weather (icon + text: ☀️ Clear, ☁️ Overcast, 🌧️ Rain)
- Notes (truncate to 60 chars, tooltip on hover)
- Status badge (Submit pending=draft, Submitted=green, Regulator review=blue, etc.)

**Keyboard:**
- Tab through list rows
- Enter on row → opens Thread
- +New button accessible via Shift+Tab or top-of-tab-order
- Escape closes any modals

**a11y:**
- Table: `<table role="grid">`, thead with th for each column
- Cells: `role="gridcell"`; status badges have aria-label
- Status as text + color (not color-only)
- +New button: `aria-label="Create new site diary entry"`

**Empty state (no entries yet):**
- Empty table state card:
  ```
  No entries yet.
  Start your first site diary today.
  [+New button]
  ```

---

### **Screen: +New Modal — Site Diary Initiation**
**Route:** Opened as a modal overlay (not a new page; focus trapped)
**State:** Creating first diary entry

**Modal Header:**
- Title: "New Site Diary Entry"
- Close button (X, top-right)

**Form (vertical, single column):**

**Section 1: Entry Date & Type**
- Date picker (required): "Diary Date"
  - Placeholder: "2026-06-17"
  - Validation: Cannot be future date; suggest today by default
  - Help text: "Date of work performed"

- Enum dropdown (required): "Day Type"
  - Options: daily_operational | critical_delay | shutdown_partial | no_work
  - Help text: "Classify the day to assist scheduling analysis"

- Text input (required): "Contractor Reference"
  - Placeholder: "SD-2026-1044"
  - Help text: "Your internal work-order or field-report ID"

**Section 2: Weather & Conditions**
- Enum dropdown (required): "Weather AM"
  - Options: clear | overcast | rain | thunder | high_wind
  - Icon previews: ☀️ ☁️ 🌧️ ⛈️ 💨

- Enum dropdown (required): "Weather PM"
  - Same options

- Text input (optional): "Weather Notes"
  - Placeholder: "e.g., rain from 1–3 PM delayed concrete pour"

**Section 3: Crew & Productivity**
- Number input (required): "Crew Count"
  - Placeholder: "12"
  - Unit: "people"
  - Validation: >= 0

- Number input (optional): "Planned Hours"
  - Placeholder: "8"
  - Unit: "hours"

- Number input (optional): "Worked Hours"
  - Placeholder: "6"
  - Unit: "hours"
  - Help text: "Leave blank if full 8-hour shift"

**Section 4: Work Scope & Progress**
- Text area (required): "Work Scope Summary"
  - Placeholder: "e.g., Installed PV array mounting rails (rows 1–12), torqued to spec. Completed 2 MW Block C foundation. Awaiting generator delivery for commencement of Gen Block A."
  - Max 2000 chars; show count
  - Validation: min 20 chars

- Evidence picker (optional): "Photographs & Attachments"
  - Drag-drop or click to upload
  - Accept: .jpg, .png, .pdf (max 20 MB per file, 5 files max)
  - Each upload previewed as thumbnail + filename
  - Geotag strip shows: "Photo taken 2026-06-17 10:34 UTC at -25.123, 28.456"
  - Remove link per file

**Section 5: Delays & Risks**
- Text area (optional): "Delays or Risks"
  - Placeholder: "e.g., Generator delivery pushed to 2026-06-20; revised schedule impact +3 days. Safety concern: crane pad subsidence observed under NW leg; called for engineer site inspection."
  - Max 1000 chars

- Enum (optional): "Escalation Flag"
  - Options: none | safety_concern | schedule_risk | cost_impact | quality_issue
  - Default: none
  - Help text: "Flag triggers automatic IPP Developer notification"

**CTA Buttons (bottom, sticky on mobile):**
- "Save as Draft" (ghost tone, saves but doesn't submit; allows return)
- "Submit" (primary tone; validates all required fields; auto-notifies IPP Developer)

**Form-level validation:**
- Red border + aria-alert below each field if invalid on submit attempt
- Inline help text (lighter color, --ink3 secondary)

**Keyboard:**
- Tab through form fields (top-to-bottom)
- Shift+Tab to go backward
- Space/Enter to toggle dropdowns or activate buttons
- Escape closes modal (if form has no unsaved changes; else confirm)

**a11y:**
- Modal: `role="dialog" aria-modal="true" aria-labelledby="modal-title"` + focus trap
- Fieldset per section with legend (e.g., `<legend>Entry Date & Type</legend>`)
- All inputs: `aria-required="true"` if required
- Form-level error summary (if validation fails): `role="alert" aria-live="polite"`
- Photos: `alt="Uploaded photo from 2026-06-17 10:34"` (accessible to screen readers even though images)

**Responsive (<760px):**
- Modal expands to full screen
- Buttons stack vertically at bottom
- Photo thumbnails in single column
- Sticky footer buttons

**Copy strings (visible to user):**
- "Work Scope Summary: Describe tasks completed, quantities, and blockers. This becomes the daily diary record for NERSA audits and lender progress reports."
- "Escalation Flag: Mark safety concerns or schedule risks to notify your IPP Developer immediately."
- "Photographs are geo-tagged and timestamped. Do not include synthetic or edited images."

---

### **POST /api/ipp-construction-diary/chain (Initiation Endpoint)**
**Payload (from form):**
```json
{
  "diary_date": "2026-06-17",
  "day_type": "daily_operational",
  "diary_ref": "SD-2026-1044",
  "weather_am": "clear",
  "weather_pm": "overcast",
  "weather_notes": "Rain from 1–3 PM",
  "crew_count": 12,
  "planned_hours": 8,
  "worked_hours": 6,
  "work_scope": "Installed PV array mounting rails (rows 1–12)...",
  "photo_ids": ["photo-001", "photo-002"],
  "delay_notes": "Generator delivery delayed +3 days",
  "escalation_flag": "none"
}
```

**Backend logic (src/routes/ipp-construction-diary.ts):**
1. Validate all required fields; reject if missing
2. Fetch photo metadata (geo-tag, timestamp, tenant isolation check)
3. Insert into `oe_ipp_construction_diary`:
   - `id` ← genId()
   - `project_id` ← derived from JWT (contractor's assigned project)
   - `diary_date`, `day_type`, `diary_ref`, `weather_am`, `weather_pm`, `weather_notes`, `crew_count`, `planned_hours`, `worked_hours`, `work_scope`, `delay_notes`, `escalation_flag`
   - `chain_status` ← 'draft' (if saved) or 'submitted' (if submitted)
   - `photo_refs` ← JSON array of photo IDs
   - `created_at` ← NOW()
   - `created_by` ← actor_id (epc_contractor participant)
4. Fire cascade: `{ event: 'ipp_construction_diary.created', data: { chain_status: 'draft' | 'submitted', escalation_flag }, ... }`
   - If escalation_flag != 'none': cascade rule pushes IncomingAction to ipp_developer lane (flag='safety' or 'schedule_risk')
5. Return `{ success: true, data: { id, chain_status, next_actions: [{...}] } }`

**Cascade (Layer C rule: hse_incident escalation)**
- If `escalation_flag='safety_concern'`: create a pushRoleAction pointing to ipp_developer's HSE lane
- Notification: "Site diary from [EpcContractorName] flagged safety concern — [diary_ref]. Review and escalate to regulator if needed."

---

## 6. Thread (Two-Sided Cross-Role Interaction)

### **Context:** IPP Developer reviews EPC Contractor's site diary; responds with flagged items
**Route:** `GET /thread/ipp_construction_diary/:id` (after contractor submits diary)
**State:** Both contractor and developer can see thread

### **Screen Layout: Thread Page**

**Header (sticky):**
- Breadcrumb: "Horizon > Site diary > SD-2026-1044"
- Chain & case ref: "Site Diary · SD-2026-1044"
- Status badge (large, color-coded)
- SLA deadline (if applicable): "Due: Jun 20, 2026 (3 days remaining)" or "Overdue by 2 days"

**Content area (three-column responsive):**

**Column 1: Case summary (left, 30% width, <760px: full-width above thread)**
- Card: "Case Details"
  - Diary Date: 2026-06-17
  - Day Type: daily_operational (blue badge)
  - Contractor Ref: SD-2026-1044
  - Crew: 12 people, 6 worked hours
  - Status: submitted (green)
  - Work Scope (truncated): "Installed PV array mounting rails…" (link to expand in modal if needed)

- Card: "Escalation Flag"
  - Flag: safety_concern (red badge)
  - Note: "Crane pad subsidence observed — engineer site inspection called"

- Card: "Photos" (if any)
  - Thumbnail gallery (grid, click to full-screen carousel)
  - Each photo: thumbnail + meta (date/time, geo-tag)
  - No zoom/edit functions (read-only audit trail)

- Card: "Actions" (contextual to signer-in role)
  - If epc_contractor:
    - "Edit as Draft" (ghost, only if chain_status='draft')
    - "Resubmit" (primary, if developer requested changes)
  - If ipp_developer:
    - "Flag for revision" (oxide tone, opens modal with RFI-like form)
    - "Approve & archive" (primary, closes diary if ready)
    - "Escalate to regulator" (oxide, if safety_concern flag; auto-cascades)

**Column 2: Thread / Timeline (center-right, 70% on desktop; full-width <760px below summary)**
- Heading: "Review & Discussion"

**Timeline events (reverse chronological):**

**Event 1 (latest):**
```
┌─────────────────────────────────┐
│ [Developer icon] IPP Developer │ 2026-06-18 14:32 UTC
├─────────────────────────────────┤
│ Status change: draft → submitted │
│ "Diary reviewed. Site diary for 2026-06-17 received and logged. Your crane pad  │
│ concern is noted; I've requested our site engineer inspect on 2026-06-19 at 9 AM │
│ to confirm subsidence risk. Please attend that inspection and send follow-up    │
│ notes. In the meantime, halt crane operations in that zone."                    │
│                                 │
│ Action: Review & approve        │
│ [+Reply button]                 │
└─────────────────────────────────┘
```

**Event 2:**
```
┌─────────────────────────────────┐
│ [Contractor icon] EPC Contractor │ 2026-06-17 17:05 UTC
├─────────────────────────────────┤
│ Status: Submitted                │
│ "Site diary entry for 2026-06-17 submitted. 12-person crew completed PV array  │
│ mounting on Block C (rows 1–12). Crew worked 6 of 8 planned hours due to rain   │
│ 1–3 PM. Generator delivery delayed to 2026-06-20 (revised schedule +3 days).   │
│                                 │
│ Safety: Crane pad under NW leg showing subsidence. Called for engineer site    │
│ inspection. Awaiting clearance before resuming crane lifts."                   │
│                                 │
│ [Photos: 3 images]              │
│ Photos taken 2026-06-17 10:34 UTC, geo-tagged to site location              │
│ [thumbs] [thumbs] [thumbs]      │
│                                 │
│ [+Reply button]                 │
└─────────────────────────────────┘
```

**Event 3 (system event):**
```
┌─────────────────────────────────┐
│ [System] Case created            │ 2026-06-17 16:22 UTC
├─────────────────────────────────┤
│ Site Diary case SD-2026-1044 created by EPC Contractor for project              │
│ "Green Solar 100MW" (draft).                                                    │
│                                                                                 │
│ Status: draft → submitted (EPC Contractor submitted entry)                     │
└─────────────────────────────────┘
```

**Reply box (sticky at bottom, <760px: full-width):**
- If actor is a valid responder (epc_contractor, ipp_developer, regulator, support):
  - Text area: "Add a comment…"
  - Markdown support (**, __, ~~, links, code)
  - Mention support: @[actor_role] (autocomplete)
  - Attachment button: "+" (add evidence/photo)
  - Buttons: "Cancel" (ghost), "Post reply" (primary)

**Keyboard:**
- Tab through events, photos, reply box
- Enter in reply box: submit (Ctrl+Enter)
- Escape: close reply if open

**a11y:**
- Timeline: `role="region" aria-label="Review thread"`, events as `<article>`
- Status badges: aria-label with text
- Photos: `role="img" aria-label="[description]"`, alt text on img element
- Reply box: `aria-label="Add comment to case"`, char count aria-live

**Empty state (no replies yet):**
- "No replies yet. [Actor] awaits response."

**Responsive (<760px):**
- Case summary above, thread below (full-width)
- Photos in single column
- Reply box takes full width
- Sticky reply footer

---

### **Reply Action (epc_contractor responds to developer's feedback):**

**Modal: Add Comment (brief modal, not full page)**
- Text area: "Your response"
- Checkbox: "✓ Attach evidence" (if flagged for revision)
- Evidence picker (if checked): photo/document upload
- Buttons: "Cancel", "Post reply"

**Payload:**
```json
{
  "thread_id": "ipp_construction_diary:id",
  "reply_text": "Our crew attended the engineer inspection on 2026-06-19. Subsidence confirmed at 8mm depth. Engineer recommends: (1) reinforce pad with polymer shims, (2) load-test with 50% crane weight before resuming full lifts. Reinforcement work scheduled 2026-06-20, completion by EOD.",
  "attachments": ["photo-sub-001", "photo-sub-002", "eng-report-001"]
}
```

**Backend: POST /api/ipp-construction-diary/chain/:id/reply**
1. Validate actor is epc_contractor or ipp_developer (or support/admin)
2. Insert event into `oe_ipp_construction_diary_events`:
   - `event_type` ← 'reply'
   - `actor_id`, `actor_role`, `reply_text`, `attachment_ids`, `created_at`
3. Fire cascade: `{ event: 'ipp_construction_diary.replied', entity_id: diary_id, actor_id, data: { reply_text } }`
   - Rule: If actor is epc_contractor → notify ipp_developer (IncomingAction: "Review EPC response")
4. Return updated thread events

---

## 7. Ongoing Daily Work + AI Inline Assists

### **Workflow Cycle (Repeat daily during construction)**

1. **Morning:** EPC Contractor logs in → Horizon shows "Site diary due today"
2. **Field work:** Crew works; field supervisor takes geo-tagged photos, notes delays
3. **EOD (~5 PM):** Contractor opens `/ledger/ipp_construction_diary` → "+New" → fills form → "Submit"
4. **Instant feedback:** Cascade pushes entry to ipp_developer inbox
5. **Next morning:** Developer reviews, flags items (via Thread reply), contractor responds
6. **Weekly:** Site diary entries roll up into monthly progress report (feeding IPP Developer's Horizon KPIs)

### **AI Inline Assists (Layer D — suggestions, not autonomous actions)**

**Assist 1: Work Scope Summary Auto-Complete**
- As contractor types in "Work Scope Summary" field, AI observes ITP approved test plans and prior week's scope
- Suggestion card appears below input:
  ```
  💡 Suggested: "Completed PV array foundation cure testing per ITP-067 (pull-out tests passed). 
     Commenced mounting rail installation per method statement. Generated 2.4 MW of Block C 
     foundation load. Weather favorable; crew productivity 95%."
  
  [✓ Accept] [✗ Skip] [Edit]
  ```
- If contractor clicks "Accept", suggestion text is inserted into field
- Audit log captures: "AI suggestion ITP-067 accepted"

**Assist 2: Delay Detection & Escalation Flag Recommendation**
- AI reads work_scope and delay_notes; compares to prior week's schedule
- If schedule variance > 1 day, suggestion appears:
  ```
  ⚠️ Schedule Risk Detected: Crane pad delay impacts 4 downstream tasks.
     Recommend: Flag "schedule_risk" & notify IPP Developer.
     Estimated cost impact: +R120k.
  
  [✓ Flag & notify] [✗ Skip]
  ```
- Contractor can one-click flag; audit log captures decision

**Assist 3: NCR Opportunity**
- AI analyzes work_scope + prior NCR patterns
- If mentions "rework" or "out-of-spec", suggests:
  ```
  📋 Non-Conformance Opportunity: Rope access anchor-point inspection found 
     3mm deviation from spec. Consider logging NCR for root-cause analysis 
     and corrective action plan.
  
  [Create NCR] [Dismiss]
  ```
- Link routes to `/ledger/ncr` with pre-filled project_id and reference to this diary

**Assist 4: ITP Coverage Check**
- When submitting site diary, AI cross-references work_scope against approved ITPs
- If scope includes work not covered by ITPs, warning:
  ```
  ⚠️ ITP Gap: Your scope mentions "generator commissioning" but no approved ITP exists 
     for this activity. Generator commissioning is a regulated NERSA event. 
     Contact your IPP Developer to request an ITP amendment or do not proceed 
     with this work pending approval.
  
  [Acknowledge] [Request ITP amendment]
  ```

### **AI Card Design (every assist has consistent UX):**
- Icon + title (emoji + bold text)
- 1–3 line explanation (simple English, no jargon)
- Action buttons (Accept / Create / Dismiss, high-contrast color)
- Audit trail: every AI action logged to cascade event
- Copy tone: helpful, never prescriptive; always gives contractor final say

---

## 8. Sign Out

### **Flow:**
1. Contractor clicks avatar or "Sign out" from header menu
2. Modal: "You are about to sign out. Any unsaved form data will be lost. Continue?" (Escape or Cancel = dismiss)
3. On confirm:
   - Clear JWT from localStorage
   - POST `/api/auth/logout` (invalidate session)
   - Redirect to `/login`
   - Browser back-button does NOT re-log-in (SameSite=Strict cookie)

### **Copy strings:**
- "You've been signed out. See you next time."
- "Session expired. Please log in again."

---

## Current Pain Points Being Fixed

| Issue | Current State | Fixed Behavior |
|-------|---------------|-----------------|
| **Onboarding throws** | No entry in ONBOARDING_STEPS | Added 5-step wizard (company_setup, project_access, document_standards, complete) |
| **No entity provisioned** | onboarding-provisioning logs 'kind=none' | Updated to log 'epc_role' with project_id context (documents contractor's access without orphan entity) |
| **Document controls unreachable** | Atlas tiles exist (submittals, RFIs) but route to unavailable surfaces | Surfaces `epc_contractor:rfis`, `epc_contractor:technical-queries`, `epc_contractor:audit` now registered in surfaces.tsx; routes live |
| **Four read-only chains appear in Horizon** | itp, punch_list, ncr, ipp_method_statement lanes = contractor sees but cannot act | Correct UX: contractor sees cases for awareness; can comment in Thread but cannot change status. Actions array filters to empty for these chains (epc_contractor role not in .roles). Lanes display read-only badges. |
| **Thread shows raw.* verbatim** | Case detail dumps unformatted JSON | FormattedDisplay component decodes chain_status enum, quantum columns, human-readable dates; photo EXIF shown as metadata, not raw binary |
| **No AI anywhere** | None | Inline suggestion cards on work_scope, delay_notes, escalation_flag, ITP coverage (Layer D assists, logged) |
| **Header quicklinks role-blind** | All 12 roles see same top-nav | Meridian header surfaceRole = epc_contractor, quicklinks show epc-specific tiles (Document Control, Quality, Site diary) per roleData domains |
| **Accessibility gaps** | Modals lack focus trap/aria-modal; secondary text fails WCAG AA; no alt text on photos | Added aria-modal + focus trap; --ink3 secondary adjusted to meet AA 4.5:1; photos have aria-label + alt; all form fields aria-required + aria-label |

---

## Summary: EPC Contractor End-to-End

1. **Invited** by IPP Developer; receives one-time registration link
2. **Onboards** via 5-step wizard (company, project access, document standards)
3. **First entity provisioned:** contractor participant role logged (no orphan entity)
4. **Lands on Horizon:** sees 6 chains across 4 lanes (quality, site_setup, safety), top-8 duty cases
5. **Discovers in Atlas:** 11 features across 5 domains; 3 surfaces live (submittals/RFIs, technical-queries, audit); chains mount to /ledger
6. **Primary action:** daily site diary entry → submit → IPP Developer reviews in Thread
7. **Cross-role interaction:** Thread shows contractor + developer conversation; contractor responds to flagged items; AI assists with scope suggestions, delay detection, NCR opportunities, ITP gaps
8. **Ongoing:** diary entries roll up to weekly KPIs, monthly progress reports, and NERSA audit trails
9. **Sign out:** clears JWT, redirects to login (no back-button re-entry)

**Key design constraints honored:**
- SQL identifiers from static MERIDIAN_CHAINS + roleData only
- Photos geo-tagged, no synthetic data accepted
- Audit trail captures every cascade event + AI suggestion decision
- All forms aria-required, focus-trapped modals, WCAG AA color contrast
- Markdown support in Thread replies for rich documentation
- Read-only lane rendering (contractor sees but cannot mutate breached chains)

---
