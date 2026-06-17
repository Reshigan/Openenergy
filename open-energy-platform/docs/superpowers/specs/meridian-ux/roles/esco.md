## Role journey: esco

### Overview

ESCO (Energy Service Company / O&M Operator) manages predictive asset health and field operations across generation sites. Primary workflow: work orders (12-state), preventive-maintenance compliance, control-of-work permits, spare-parts supply chain, and asset prognostics (anomaly detection, RUL, fault fingerprinting). CURRENT BROKEN STATE: onboarding throws 400 (no `esco` step sequence defined; only `esums_owner` exists).

**Chains ESCO owns or co-owns** (frontdoor classification):

| Chain Key | Wave | Title | Frontdoor | Lane |
|---|---|---|---|---|
| `om_work_order` | W16 | Work order | tile | `work_orders` |
| `pm_compliance` | W59 | PM compliance | tile | `work_orders` |
| `permit_to_work` | W64 | Permit-to-work | tile | `work_orders` |
| `asset_prognostics` | W71 | Predictive asset health | tile | `asset_health` |
| `availability_guarantee` | W51 | Uptime guarantee | tile | `asset_health` |
| `bess_soh` | custom | Battery state-of-health | tile | `asset_health` |
| `soiling_audit` | custom | Soiling audit | tile | `asset_health` |
| `spare_parts_provisioning` | W72 | Spare parts | tile | `supply_chain` |
| `vendor_escalation` | W35 | Vendor escalation | tile | `supply_chain` |
| `warranty_claim` | W15 | Warranty / RMA | tile | `supply_chain` |
| `warranty_recovery` | W63 | Warranty recovery | tile | `supply_chain` |
| `hse_incident` | W25 | HSE incidents | tile | `safety` |
| `pr_underperformance` | W24 | PR underperformance | tile | `asset_health` |
| `generation_revenue_assurance` | custom | Revenue assurance | tile | `reporting` |
| `service_contract` | custom | Service contracts | tile | `site_portfolio` |
| `commissioning` | custom | Commissioning | tile | `work_orders` |

**Non-chain surfaces** (Atlas tile + route):
- "Cockpit" — live fleet KPIs, revenue ticker, fault register, AI briefing
- "Sites" — registered generation sites with health status
- "Devices" — inverters, meters, batteries, sensors
- "Faults" — live fault register with Revenue Impact Engine
- "Team" — field technicians, skills, certifications
- "Parts catalogue" — stock tracking, low-stock reorder flags
- "Protection tests" — NRS 097 relay compliance
- "Data integrations" — OEM connections (FusionSolar, SolarEdge, Modbus, Eskom AMR)

---

## (1) Acquisition → First Login

**Invite path:**
- Admin or support onboards a new ESCO tenant via `/admin/tenants` with role `esco`.
- ESCO participant created in `participants` table with `role = 'esco'`, `onboarding_completed = 0`, `onboarding_step = 'welcome'`, `onboarding_data = '{}'`.
- ESCO receives invite email with login link (https://oe.vantax.co.za/login?email=...&code=...).

**First login:**
- User clicks link or navigates to https://oe.vantax.co.za and enters email + password.
- Auth middleware validates HS256 JWT (1-hour TTL).
- `GET /api/onboarding/state` returns `{ step: 'welcome', completed: false, skipped: false, role: 'esco' }`.
- `LaunchRedirect` in App.tsx routes to `/onboard`.

---

## (2) Onboarding Wizard — Multi-Step for ESCO Role

**BROKEN: current code throws 400 because `onboarding.ts::ONBOARDING_STEPS` has no `esco` key — only `esums_owner`.**

**FIX:** Add ESCO to step sequences:

```
esco: ['welcome', 'site_setup', 'fleet_overview', 'team_setup', 'complete']
```

**Step sequence and UI flow:**

### Step 1: Welcome
- **Title:** "Welcome to your O&M operations center"
- **Subtitle:** "Manage predictive maintenance, work orders, and field teams."
- **Layout:** Full-page hero card (white, rounded-xl, max-width 28rem, centered).
  - ESCO role chip (green accent: `#16a34a`, faded background).
  - Progress dots: 4 content steps (welcome → site_setup → fleet_overview → team_setup → complete), currently on dot 1.
  - Hero text + icon.
  - CTA: "Get started" button (green, full-width).
  - Bottom: "Skip setup" link (gray, left-aligned).
- **State:** First-visit only; if user re-visits and completes, skips wizard.
- **Keyboard:** Tab navigates to "Get started" button → Enter submits.
- **Mobile (<760px):** Card stays max-width 28rem, padding reduced to 6 units (24px).
- **a11y:** `<main role="main">`, button has `aria-label="Begin onboarding"`.

### Step 2: Site Setup
- **Title:** "Set up your first site"
- **Subtitle:** "Tell us about the site you want to monitor."
- **Form fields:**
  - **Site name** — text input, placeholder "e.g. Johannesburg Solar Farm", required.
  - **Installed capacity (kW)** — number input, placeholder "e.g. 500", required, min 1, step 0.1.
  - **Site description** — textarea, placeholder "Optional: location, equipment overview", 4 rows.
- **Layout:**
  - Card with accent top border (green, 2px).
  - Step counter: "Step 1 of 4".
  - Form fields stack vertically, 24px gap.
  - Error state: if both name & capacity missing, inline error "Site name and capacity are required" (red bg, red text, rounded).
  - Helper text under capacity field: "Used for asset health scoring and revenue forecasts."
- **State after save:**
  - Data merged into `participants.onboarding_data` as `{ site_name: "…", installed_capacity_kw: 500 }`.
  - POST `/api/onboarding/step` with `{ step: 'site_setup', data: { site_name, installed_capacity_kw } }`.
  - Response: `{ next_step: 'fleet_overview' }`.
- **Loading:** CTA changes to "Saving…", disabled.
- **Mobile:** Form fields 100% width, reduced padding.
- **a11y:** Labels properly associated via `<label htmlFor="site_name">`, error announcement via `aria-live="polite"`.

### Step 3: Fleet Overview
- **Title:** "Your monitored assets"
- **Subtitle:** "We'll auto-detect inverters, meters, and batteries from your data sources."
- **Content (non-form, informational):**
  - Hero illustration: fleet icon (3 solar panels) or simple diagram.
  - Bullet list:
    - "✓ Real-time KPI dashboard"
    - "✓ Anomaly detection on inverter data"
    - "✓ Predictive maintenance alerts"
    - "✓ Work order auto-creation"
  - Next section: "Data sources we support:"
    - Icon grid (6 columns, responsive): FusionSolar, SolarEdge, SMA, Sungrow, Modbus/TCP, Eskom AMR.
    - Each icon with label + "Configured" or "Not connected" status (gray text).
  - CTA: "Connect your first data source" (secondary button, border, gray).
- **State after 'Continue':**
  - No form data; just advance to next step.
  - POST `/api/onboarding/step` with `{ step: 'fleet_overview' }`.
  - Response: `{ next_step: 'team_setup' }`.
- **Mobile:** Icon grid 3 columns instead of 6.
- **a11y:** Illustration is decorative (`aria-hidden="true"`), list items semantically marked.

### Step 4: Team Setup
- **Title:** "Set up your field team"
- **Subtitle:** "Add technicians and assign skills and certifications."
- **Form fields:**
  - **Team lead name** — text input, placeholder "e.g. John Mthembu", required.
  - **Team lead phone** — tel input, placeholder "+27 (XX) XXX XXXX", required.
  - **Base location** — dropdown (lookup source `team_base_locations`), required. Options: "Johannesburg", "Cape Town", "Durban", "Pretoria", "Other". Maps to a jurisdiction for SLA.
  - **Certifications** — checkboxes (multi-select):
    - ☐ IEC 61724 (solar maintenance)
    - ☐ NRS 097-2-3 (protection relay testing)
    - ☐ OHSA LOTO (lockout/tagout)
    - ☐ SANS 10142 (permit-to-work authority)
  - **Expected workload (cases/month)** — number input, placeholder "e.g. 8", optional, min 1.
- **Layout:**
  - Step counter: "Step 4 of 4".
  - Form fields stack, 24px gap.
  - Checkboxes render as small cards (border, rounded, checkmark inside).
  - Error state: "Team lead name and phone required" if missing (inline, red).
  - Helper: "Certifications are used to auto-assign work orders and gate permit-to-work issuance."
- **State after save:**
  - Data merged: `{ team_lead_name, team_lead_phone, base_location, certifications: ['iec_61724', 'nrs_097'], expected_workload: 8 }`.
  - POST `/api/onboarding/step` with `{ step: 'team_setup', data: {...} }`.
  - Response: `{ next_step: null }` (end of sequence).
- **Mobile:** Checkboxes stack as full-width cards.
- **a11y:** Each checkbox has proper label; focus ring on all inputs.

### Step 5: Complete
- **Action only** — not user-facing. Backend receives `next_step: null` → calls `POST /api/onboarding/complete` → fires cascade event `onboarding.completed` → triggers provisioning rule.

**Provisioning (cascade rule):**
- Cascade rule `onboarding_provisioning.completed` reacts to event `onboarding.completed` with role `esco`.
- Logs to `oe_onboarding_provisioning_log` with `kind = 'none'` (ESCO doesn't auto-create entities on onboarding).
- User must manually register sites and technicians via their first visit to Horizon.

---

## (3) First Landing: Horizon (/horizon)

**URL:** `GET /horizon?role=esco` (or POST `/api/horizon/esco` if Horizon component internally polls).

**What backend returns** (`GET /api/horizon/esco`):
- `lanes[]` — array of lane objects, each with a `key` (e.g., `'work_orders'`, `'asset_health'`, `'supply_chain'`) and `cases[]` (live non-terminal chain cases).
- `duty[]` — top 8 cases ranked by attention score (urgency = deadline breach + quantum ZAR).
- `counts` — `{ total: N, breached: M }`.

**Returned lanes (empty on first visit):**
- `work_orders` — (om_work_order + pm_compliance + permit_to_work + commissioning).
- `asset_health` — (asset_prognostics + availability_guarantee + bess_soh + soiling_audit + pr_underperformance).
- `supply_chain` — (spare_parts_provisioning + vendor_escalation + warranty_claim + warranty_recovery).
- `safety` — (hse_incident).
- `site_portfolio` — (service_contract).
- `reporting` — (generation_revenue_assurance).

**UI layout (full-canvas Meridian):**

### Top bar (header region, fixed, height 56px)
- Left: ESCO logo + "Open Energy Platform".
- Center: Breadcrumb or title "Horizon — My workspace".
- Right: 
  - Search + command palette (⌘K).
  - Notifications bell (0 on first visit).
  - User menu (avatar + "ESCO admin" role chip).

### Left sidebar (width 240px, collapsible on mobile)
- Nav items (all routes start with `/`):
  - **Horizon** (active, highlighted in green).
  - **Atlas** (⌘K or search icon routes here).
  - **Ledger** (access all chains).
  - **Deal Desk** (transaction picker).
  - **Settings** (account, team, integrations).
- Bottom: Tenant selector (if multi-tenant), help link, sign out.

### Main content (flex 1)

#### Empty State (first visit, no cases)
- Large centered card (white, rounded-lg, 600px max-width).
- Icon: Fleet illustration (3+ solar panels, soft blue-green).
- Heading: "No active cases yet"
- Subheading: "Your work orders, compliance tasks, and asset alerts will appear here once you register sites and configure data sources."
- CTA buttons (stacked or side-by-side on desktop):
  1. **"Register your first site"** (primary, green) → navigates to `/surface/esco:sites` (or built-in Sites UI).
  2. **"Connect data source"** (secondary, border) → navigates to `/surface/esco:data-sources`.
- Optional: Quick-start carousel below showing 3 tiles:
  - "Work orders" (icon + "Create work orders from fault alerts").
  - "PM schedule" (icon + "Auto-generate preventive maintenance tasks").
  - "Asset health" (icon + "Monitor anomalies and RUL predictions").

#### Populated State (after site registration)
- **Duty section** (top, fixed height ~200px):
  - Title: "Your top priorities" (10px top margin, bold, dark gray).
  - Horizontal scroll container (or sticky carousel on mobile).
  - Up to 8 cards, each:
    - Header: chain name (small, caps, gray) + status badge (color-coded: "Overdue" red, "Due" orange, "Scheduled" gray).
    - Title: chain title (15px, semibold, dark).
    - Metadata row: case_number / ref + quantum (if present, right-aligned, green or red).
    - Footer: CTA button (small, "Review" → navigates to Thread (/thread/:chainKey/:id)).
    - Click zone: entire card clickable.
  - Attention score = (deadline breach penalty + 0.001 × quantum_zar). Breached cases (deadline_at < now) float to top.

- **Lanes section** (below duty, main scrollable area):
  - Each lane is a collapsible panel (accordion or always-expanded on first view).
  - **Lane: Work Orders** (`work_orders` key)
    - Header (sticky): "Work Orders" + count "(0)" + collapse/expand icon.
    - Grid or list: empty on first visit; shows placeholder "No active work orders. [+New Work Order]" (CTA to /ledger/om_work_order?compose=1).
    - When populated: list view, 3 columns (truncated on <760px):
      - **Case #** (10ch, mono, left).
      - **Title / Asset** (flex, truncate ellipsis).
      - **Status** (color badge: "assigned", "in_progress", "on_hold", etc.).
      - **Deadline** (right, red if overdue, orange if <24h).
      - **Quantum** (right, ZAR, green if revenue-positive).
    - Row click → navigates to Thread.
    - Keyboard: arrow keys navigate rows, Enter opens Thread.
  
  - **Lane: Asset Health** (`asset_health` key)
    - Header: "Asset Health" + count "(0)".
    - Empty placeholder: "No alerts. Your predictive models are monitoring asset health." [View Asset Prognostics] (link).
    - When populated: 4 sub-groups (collapsible):
      - **Asset Prognostics** — anomaly_detected, degrading, maintenance_due.
      - **Availability Guarantee** — breach, cure.
      - **Battery Health** — augmentation_required, works_in_progress.
      - **Soiling** — measured, cleaning_authorized (low volume).
    - Each case: same 3-column layout as Work Orders.
  
  - **Lane: Supply Chain** (`supply_chain` key)
    - Header: "Supply Chain" + count "(0)".
    - Empty: "Parts and vendor claims appear here."
    - When populated: 4 sub-groups:
      - **Spare Parts** — po_issued, in_transit, received, qc_gate.
      - **Vendor Escalation** — open, escalated, under_review.
      - **Warranty** — submitted, in_repair.
      - **Warranty Recovery** — initiated, assessment.

  - **Lane: Safety** (`safety` key)
    - Header: "Safety" + count "(0)".
    - Empty: "HSE incidents reported by your team will appear here."
    - When populated: red accent on lane header; each case highlighted with icon + urgent tone.
  
  - **Lane: Site Portfolio** (`site_portfolio` key)
    - Header: "Sites & Contracts" + count "(0)".
    - Shows service contracts only (limited volume).

  - **Lane: Reporting** (`reporting` key)
    - Header: "Revenue & Accruals" + count "(0)".
    - Shows revenue assurance cases (settlement reconciliation).

- **Responsive (<760px):**
  - Sidebar collapses to hamburger icon.
  - Lanes render as stacked full-width cards (no columns).
  - Duty section becomes vertical scrollable list (not carousel).
  - Case cards show only ref + status badge (title truncated to 1 line).

- **Focus & keyboard:**
  - Tab order: search → notification bell → user menu → first lane header → expand lane → first case card → expand case details panel.
  - Lane headers are buttons: Space/Enter toggles collapse.
  - Case cards: Enter navigates to Thread, Shift+Enter opens modal preview (if inline details supported).
  - No focus trap; Esc closes any open popover/modal.

- **Aria labels:**
  - `<main role="main">`.
  - Lane headers: `<button role="button" aria-expanded="true" aria-controls="lane-work-orders">Work Orders (3)</button>`.
  - Case card rows: `<div role="row" aria-label="WO-002841 | Inverter repair | In progress | Due tomorrow | ZAR 1,200">`.
  - Breach state: `<span role="status" aria-live="polite">Overdue by 4 hours</span>`.

- **States:**
  - **Loading:** Skeleton loaders in each lane (3-5 row placeholders, shimmer animation).
  - **Empty (post-registration, truly no cases):** Placeholder card per lane with CTA link to create first case.
  - **Unauthorized:** 403 error card "You don't have access to this role's workspace."
  - **Error (DB timeout, etc.):** "Failed to load workspace. [Retry]" button.

---

## (4) Discovering Functions: Atlas (/atlas)

**URL:** `GET /atlas?role=esco` or opened via ⌘K.

**What displays:**
- Full function library organized by domain (from roleData.ts: operations, work_orders, asset_health, supply_chain, safety, site_portfolio, data_integrations, reporting).
- Each domain is a collapsible card or section (default expanded on first visit).

**Layout:**
- Left: sidebar (fixed, 200px) with domain list (filter/search).
- Right: tiles grid (responsive, 2–4 columns).

### Tiles per domain (examples):

**Operations** (informational, non-chain):
- "Cockpit" (icon + label + "Live dashboard") → route `/surface/esco:cockpit`.
- "Sites" → `/surface/esco:sites` or `/sites` (standalone route).
- "Devices" → `/surface/esco:devices`.
- "Faults" → `/surface/esco:faults`.
- "Team" → `/surface/esco:team`.
- "Alerts" → `/surface/esco:alerts`.

**Work Orders** (chain tiles):
- "Work Orders" (icon + "12-state dispatch chain") → `chainKey: 'om_work_order'` → click routes to `/ledger/om_work_order`.
- "PM Compliance" → `chainKey: 'pm_compliance'` → `/ledger/pm_compliance`.
- "Permit-to-Work" → `chainKey: 'permit_to_work'` → `/ledger/permit_to_work`.
- "Commissioning" → `chainKey: 'commissioning'` → `/ledger/commissioning`.

**Asset Health** (chain tiles):
- "Asset Prognostics" → `chainKey: 'asset_prognostics'` → `/ledger/asset_prognostics`.
- "Availability Guarantee" → `chainKey: 'availability_guarantee'` → `/ledger/availability_guarantee`.
- "Battery Health" → `chainKey: 'bess_soh'` → `/ledger/bess_soh`.
- "Soiling Audit" → `chainKey: 'soiling_audit'` → `/ledger/soiling_audit`.
- "PR Underperformance" → `chainKey: 'pr_underperformance'` → `/ledger/pr_underperformance`.

**Supply Chain** (chain tiles):
- "Spare Parts" → `chainKey: 'spare_parts_provisioning'` → `/ledger/spare_parts_provisioning`.
- "Vendor Escalation" → `chainKey: 'vendor_escalation'` → `/ledger/vendor_escalation`.
- "Warranty Claims" → `chainKey: 'warranty_claim'` → `/ledger/warranty_claim`.
- "Warranty Recovery" → `chainKey: 'warranty_recovery'` → `/ledger/warranty_recovery`.

**Safety**:
- "HSE Incidents" → `chainKey: 'hse_incident'` → `/ledger/hse_incident`.

**Site Portfolio**:
- "Service Contracts" → `chainKey: 'service_contract'` → `/ledger/service_contract`.

**Reporting**:
- "Revenue Assurance" → `chainKey: 'generation_revenue_assurance'` → `/ledger/generation_revenue_assurance`.
- "Audit Log" (non-chain) → `/surface/esco:audit`.

**Data & Integrations**:
- "Ingestion" → `/surface/esco:ingestion`.
- "Data Sources" → `/surface/esco:data-sources`.
- "Connectors" → `/surface/esco:integrations`.

**Tile card anatomy:**
- Icon (24×24, color-coded by domain).
- Title (14px, semibold, dark).
- Description (12px, gray, 1–2 lines, truncated).
- Badge (top-right): chainKey chains show "Chain", surface tiles show "Workspace".
- Click zone: entire card.

**Empty/error behavior:**
- If chainKey resolves to no registry entry → tile hidden or shows 404 message on click.
- Currently 40 Atlas tiles have empty bodies (broken) — these show placeholder "Coming soon" badge on tile.
- Currently ~39 dangling tiles (chainKey w/ no registry) — these are hidden or flagged as "not available for this role".

**Responsive:**
- Desktop (>1024px): 4 columns.
- Tablet (760–1024px): 3 columns.
- Mobile (<760px): 2 columns, tiles full-width on scroll.

**Keyboard:**
- Tab navigates tiles; Enter opens; Escape closes any popover.
- Search box (top-left): type to filter tiles by title/description (client-side debounce 300ms).

**Focus & a11y:**
- Each tile: `<a role="button" aria-label="Work Orders — 12-state dispatch chain">`.
- Search box: `aria-label="Search functions"`, announces results live.

---

## (5) Initiating Primary Owned Transaction: Work Order (om_work_order)

**Entry:** User in Horizon clicks work_orders lane's "[+New]" CTA, or navigates to `/ledger/om_work_order?compose=1`.

**Ledger list view** (`/ledger/om_work_order`):
- Table: 6 columns (responsive 3 on mobile):
  - **WO Number** (bold, left, mono font).
  - **Asset / Title** (flex, truncate).
  - **Status** (badge, color-coded).
  - **Assigned to** (tech name or "Unassigned").
  - **Deadline** (red if overdue).
  - **Quantum ZAR** (right).
- Empty state (first WO): "No work orders yet. [Create your first work order] →" button.
- Sort: by deadline (urgent first), then by creation date.
- Filter dropdowns (sticky below header):
  - **Status** (dropdown): All, draft, assigned, in_progress, on_hold, completed, cancelled, verified.
  - **Site** (dropdown, fetch from om_sites): [Multi-select, only sites visible to tenant].
  - **Assigned to** (dropdown): [Technicians from team_members table].
- Search box (top-right): free-text search in wo_number + asset_name.

**+New Work Order form** (`/ledger/om_work_order?compose=1` or modal overlay):

**Form opens in modal or slide-in panel (width ~600px on desktop, full-width mobile):**

**Step 1: Basic Info**
- **WO Number** (read-only, auto-generated from sequence, gray text, e.g., "WO-000001").
- **Title / Asset Name** (text input, 60ch, required).
  - Placeholder: "e.g. Inverter A1 malfunction".
  - Autocomplete dropdown after 2 chars: recent asset names + configured device names.
- **Site** (dropdown, lookup source `om_sites`, required).
  - Options: all sites registered in om_sites where tenant_id = current_tenant_id.
  - On select, load asset list for that site.
- **Asset / Device** (dropdown, lookup source `om_devices` filtered by selected site, optional).
  - Populated after Site selection.
  - Placeholder: "Select site first".
- **Description** (textarea, 6 rows, required).
  - Placeholder: "Describe the issue, expected outcome, and any safety considerations."
  - Word count: "0 / 500" (bottom-right).
- **Priority** (radio buttons, required, default "medium"):
  - ◯ **Critical** (red badge, "SLA 4h").
  - ◯ **High** (orange badge, "SLA 8h").
  - ◯ **Medium** (gray badge, "SLA 24h").
  - ◯ **Low** (light-gray badge, "SLA 72h").
- **Estimated Cost (ZAR)** (number input, optional, min 0, step 10).
  - Placeholder: "e.g. 1500".
  - Helper text: "Used for revenue impact scoring."

**Layout (modal):**
- Header bar (sticky): "Create work order" + X close button.
- Form fields stack vertically, 20px gap.
- Inline validation: required fields marked with red asterisk; error message appears below field on blur/submit if empty.
- Error summary (top): red bg card listing all validation errors.

**Step 2: Assignment (optional at creation, can defer):**
- **Assign to Technician** (dropdown, lookup source `team_members` filtered by tenant + certifications matching WO type, optional).
  - Placeholder: "Leave unassigned to queue for team lead review".
  - Each option shows: name + certifications badges (small, muted) + availability status ("Available now" green / "On another WO" gray).
- **Scheduled Date / Time** (date + time inputs, optional).
  - Placeholder: "YYYY-MM-DD HH:MM".
  - If populated: shows estimated SLA deadline (priority-based).
- **Requested by** (text input, optional).
  - Placeholder: "e.g. Site manager name or contact".

**Step 3: Safety & Permits (conditional)**
- **Requires Permit-to-Work** (checkbox, unchecked by default).
  - If checked: show sub-form:
    - **Live electrical work?** (radio: Yes / No, default No).
    - **Confined space?** (radio: Yes / No).
    - **Required certifications** (multi-checkbox, read-only list): "LOTO qualified", "High-voltage", "Confined-space rescue".
    - Note: "Permits are regulated by OHSA + SANS 10142. Issuance triggers regulator queue."
- **HSE Risk Level** (dropdown, optional, default "Low"):
  - Low / Medium / High / Critical.
  - Helper: "High/Critical work triggers incident documentation."

**CTA buttons (sticky footer, white bg, shadow):**
- Left: "Save as draft" (secondary, border).
- Right: "Create & assign" (primary, green, full-width on mobile).

**On submit:**
- Validate all required fields; show inline errors if missing.
- POST `/api/om-work-order/chain` (or Ledger create endpoint) with payload:
  ```json
  {
    "title": "Inverter A1 malfunction",
    "site_id": "site-123",
    "device_id": "dev-456",
    "description": "...",
    "priority": "high",
    "estimated_cost_zar": 1500,
    "assigned_to": "tech-789",
    "scheduled_at": "2026-06-18T09:00:00Z",
    "requested_by": "John Doe",
    "requires_permit": false,
    "hse_risk_level": "medium"
  }
  ```
- Response (201 Created):
  ```json
  {
    "success": true,
    "data": {
      "id": "wo-abc123",
      "wo_number": "WO-000001",
      "chain_status": "draft",
      "created_at": "2026-06-17T10:30:00Z"
    }
  }
  ```
- Modal closes; user redirected to Thread view of newly created WO: `/thread/om_work_order/wo-abc123`.

**Loading state:**
- Form inputs disabled.
- CTA button shows "Creating…", disabled.

**Error handling:**
- 400 Validation error: inline field errors + summary card (red bg, icon, message).
- 409 Conflict (e.g., site_id invalid): modal error card "This site is not available. Please try another."
- 503 Service error: "Failed to create work order. Please try again."

---

## (6) State Transitions: Work Order Lifecycle

**WO created with status = 'draft'.**

### Thread view (`/thread/om_work_order/wo-abc123`):

**Layout (full-screen Meridian chrome with side panel):**

**Left panel (width ~340px, scrollable):**
- Header: "WO-000001" (bold) + status badge (gray "draft").
- Metadata grid (2 columns, tight):
  - **Site:** Johannesburg Solar Farm.
  - **Asset:** Inverter A1.
  - **Priority:** High (orange badge).
  - **Created:** 17 Jun 2026, 10:30 AM by admin.
  - **Deadline:** 19 Jun 2026, 10:30 AM (24h SLA from creation for "high").
  - **Est. Cost:** ZAR 1,500.
  - **Assigned to:** — (unassigned, gray).

- Tabs (sticky below metadata):
  - **Details** (active).
  - **Activity** (audit log, cascade events).
  - **Attachments**.
  - **Comments**.

- **Details tab content:**
  - Read-only fields (gray background):
    - Description: (full text, wrapped).
    - Requested by: John Doe.
    - Requires permit: No.
    - HSE risk: Medium.

- **Action buttons** (sticky, full-width, stacked):
  1. **"Acknowledge & Assign"** (primary, green) → opens modal to assign tech + schedule.
  2. **"View related permits"** (secondary, border) → if `requires_permit=true` and permit exists, links to `/thread/permit_to_work/:permit_id`.
  3. **"Cancel WO"** (danger, oxide red) → confirmation modal → POST `/api/om-work-order/chain/wo-abc123/cancel` with reason.

**Right panel (width ~400px, scrollable, or full-width on mobile):**
- **Action: Acknowledge & Assign**
  - Modal title: "Assign work order WO-000001".
  - Modal layout (narrow, 500px max-width):
    - **Technician** (dropdown, required, filtered by certifications + availability).
      - Placeholder: "Select a technician".
      - Each option: name + certifications (muted badges) + current workload (e.g., "3 other active WOs").
      - Help text: "Only technicians with required certifications are shown."
    - **Scheduled date/time** (date picker + time picker, required).
      - Calendar UI (date range disabled to past dates).
      - Time picker: 30-min increments, 06:00–18:00 range.
      - On select: calculate SLA deadline (priority-based, shown in gray below).
      - "SLA deadline: 19 Jun 2026, 09:00 AM (23 hours 30 minutes)".
    - **Technician notes** (textarea, 4 rows, optional).
      - Placeholder: "Any special instructions for the tech?".
    - Error summary (if validation fails on submit).
  - CTA buttons (footer):
    - "Assign" (primary, green, full-width).
    - "Keep as draft" (secondary, border).

  - **On "Assign" submit:**
    - POST `/api/om-work-order/chain/wo-abc123/acknowledge` with payload:
      ```json
      {
        "assigned_to": "tech-789",
        "scheduled_at": "2026-06-18T09:00:00Z",
        "notes": "..."
      }
      ```
    - Response (200 OK):
      ```json
      {
        "success": true,
        "data": {
          "chain_status": "assigned",
          "assigned_to": "tech-789",
          "sla_deadline": "2026-06-19T09:00:00Z"
      }}
      ```
    - Cascade event fired: `work_order.acknowledged` → pushes action to technician's Incoming panel in Horizon (if esums_owner or support).
    - Modal closes; left panel updates: status badge changes to "assigned" (blue), assigned_to field shows tech name.

### Subsequent states (user progresses WO):

- **assigned** → "Depart" action button appears. POST `/api/om-work-order/chain/wo-abc123/depart` → status becomes "in_progress", button changes to "Arrive".

- **in_progress** → "Arrive" button → POST `/api/om-work-order/chain/wo-abc123/arrive` → status becomes "on_site".

- **on_site** → "Diagnose" button (field: root cause, type: evidence) → POST with root_cause → status becomes "diagnosed".

- **diagnosed** → "Repair" button (fields: repair_plan, parts_used, labor_hours) → POST → status becomes "repairing".

- **repairing** → "Test & verify" button (fields: test_results, verification_ref, photos) → POST → status becomes "tested".

- **tested** → "Complete" button (primary, green, tone="success") (fields: completion_notes, final_check_list_score) → POST `/api/om-work-order/chain/wo-abc123/complete` → status becomes "completed" (terminal).

**Activity tab (throughout all states):**
- Timeline view (reverse chronological):
  - "WO-000001 created by admin on 17 Jun 10:30 AM" — gray icon.
  - "Assigned to John Mthembu by admin on 17 Jun 10:35 AM" — blue icon, shows technician name.
  - "Departed site on 18 Jun 06:45 AM" — green icon, shows technician name.
  - "On-site repair begun on 18 Jun 07:00 AM" — shows tech notes snapshot.
  - Each entry is clickable → expands to full event data (JSON-like detail panel, read-only, monospace).

**Attachments tab:**
- Upload area (drag-drop or file picker).
- Allowed: .pdf, .jpg, .png, .xlsx (max 10 MB each).
- List below: files with download + delete buttons.

**Comments tab:**
- Textarea: "Add a note…" (placeholder).
- Post button (blue).
- Comments list (reverse chrono): commenter name + date + text + delete (if commenter = self or admin).

---

## (7) Cross-Role Interaction: Work Order via Thread (support agent as counterparty)

**Support agent (OEM or internal) is assigned to work orders. They see WOs in their Horizon under lane `field_operations` (not `work_orders`).**

**Support agent navigates to `/thread/om_work_order/wo-abc123` after ESCO assigns the WO.**

**Left panel (support view):**
- Same metadata as ESCO view.
- Buttons change based on role + status:
  - **Support can:**
    - "Acknowledge receipt" (if status = assigned).
    - "Request parts" (opens modal to add parts requisition, linked to `/thread/spare_parts_provisioning/...`).
    - "Escalate to engineering" (if stuck at diagnosed state >4h; opens modal with reason).
    - "Cancel WO" (if not yet in_progress).
  - **Support cannot:**
    - Assign to self (WO owner — ESCO — does that).

**Activity tab for support:**
- Shows same timeline, but support's actions (acknowledgement, parts requests, escalations) are logged with icon + color.

**When support requests parts:**
- Modal: "Request parts for WO-000001"
  - Part name (dropdown, lookup source `parts_catalogue`, filtered by asset type).
  - Quantity (number, min 1).
  - Urgency (radio: standard / expedited, expedited = next-day delivery).
  - Submit → POST `/api/spare-parts-provisioning/chain` with `work_order_ref: 'WO-000001'` → creates new spare parts case.
  - New case ID returned; hyperlink shown in modal: "Parts case [SPP-000045] created. [View]".
  - Button click → navigates to `/thread/spare_parts_provisioning/spp-000045` in new tab.

**Cross-role visibility:**
- ESCO is `actor_id` (WO owner).
- Support is `counterparty` (assigned tech).
- When support takes action, cascade fires event `work_order.action_taken` → pushes brief notification to ESCO's Incoming panel: "Tech John acknowledged WO-000001 and is en route."

**Regulator visibility:**
- If PM compliance breach or safety incident escalation occurs → regulator's Incoming panel surfaces `pm_compliance` or `hse_incident` case ID (not WO directly, but linked via cascade).

---

## (8) Ongoing Daily Work + AI Assists

### Horizon revisit (end of day):

**ESCO user logs back in:**
- Horizon loads with refreshed case counts:
  - Duty: top 8 breached/urgent cases.
  - Lanes: work_orders lane now shows 3 active WOs (1 overdue).
  - Other lanes: asset_prognostics has 2 new anomalies, spare_parts shows 1 backorder flag.

**Duty card for overdue WO (WO-000001, 4h breach):**
- Card background: subtle red tint.
- Badge: "Overdue 4h" (red, pulsing animation optional).
- CTA: "Review" button → navigates to `/thread/om_work_order/wo-abc123`.
- Quantum: "ZAR 1,500" (right-aligned).

**AI assists (inline, per-action):**

### AI Assist #1: WO Diagnosis (when tech transitions to "diagnosed" state)

**Context:** Tech has arrived on-site, found a fault in the inverter's firmware.

**AI card placement:** In right panel, below "Diagnose" action button, before submission.

```
╔════════════════════════════════════════╗
║ 🤖 AI DIAGNOSIS SUGGESTION              ║
╠════════════════════════════════════════╣
║                                        ║
║ Based on the inverter model (SMA       ║
║ Sunny Boy 3.6) and reported symptom   ║
║ (no export, green light on), this      ║
║ matches known firmware bug FW-2024-08  ║
║ affecting 47 units in your fleet.      ║
║                                        ║
║ Recommended fix:                        ║
║ • Flash firmware v2.1.4 (updated)      ║
║ • Expected time: 45 min                ║
║ • Parts needed: None                   ║
║ • Risk: Low                             ║
║                                        ║
║ [Accept diagnosis] [Dismiss]           ║
║                                        ║
║ ℹ Why? Anomaly detection flagged       ║
║   this device 18h ago (>3 similar      ║
║   inverters), and precedent rules      ║
║   matched to this firmware issue.      ║
╚════════════════════════════════════════╝
```

**Interaction:**
- User clicks "Accept diagnosis" → AI text auto-populates the "Root cause" field: "Firmware bug FW-2024-08 (SMA Sunny Boy) — recommend FW v2.1.4 flash".
- User can edit the text before submitting the Diagnose action.
- On accept, cascade event `work_order.ai_assisted` logs the suggestion ID + user decision (accepted / dismissed) to `ai_decisions` table (audit trail).

### AI Assist #2: PM Compliance Optimization (Horizon context)

**Scenario:** User in Horizon sees lane "Asset Health" with case `pm_compliance` status = "due" (preventive maintenance scheduled for tomorrow).

**AI card (sticky in asset_health lane, above case list):**

```
╔════════════════════════════════════════╗
║ 💡 MAINTENANCE BUNDLING OPPORTUNITY    ║
╠════════════════════════════════════════╣
║                                        ║
║ You have 3 due PM tasks across 2       ║
║ sites scheduled in the next 48 hours.  ║
║                                        ║
║ Bundling into 1 technician route       ║
║ saves ~8 travel hours and reduces      ║
║ idle time from 12% to 4%.              ║
║                                        ║
║ Schedule:                              ║
║ • Johannesburg: June 18, 9:00 AM       ║
║ • Pretoria: June 18, 2:00 PM           ║
║                                        ║
║ [Reschedule for bundle] [Not now]      ║
║                                        ║
║ ℹ Predicted revenue uplift: ZAR 450    ║
║   (reduced technician cost).           ║
╚════════════════════════════════════════╝
```

**On "Reschedule for bundle":**
- Modal opens: "Reschedule PM cases for bundled route".
  - Technician dropdown (filtered by skills).
  - New date/time (calendar, constrained to next 48h).
  - Submit → POSTs /api/pm-compliance/chain/:ids/reschedule-batch with new times.
  - Response: cases updated; costs recalculated; user shown savings summary.

### AI Assist #3: Spare Parts Expedite (Supply Chain context)

**Scenario:** ESCO sees spare_parts_provisioning case `spp-000045` stuck at "backorder" status for 3 days. Regular ETA is 7 days (parts shipped from supplier).

**AI card (in Thread, right panel below actions):**

```
╔════════════════════════════════════════╗
║ ⚡ EXPRESS DELIVERY AVAILABLE           ║
╠════════════════════════════════════════╣
║                                        ║
║ The transformer for WO-000001 can be   ║
║ expedited from a partner supplier in   ║
║ Johannesburg, arriving today (6 PM).   ║
║                                        ║
║ Cost comparison:                       ║
║ • Standard (7d): ZAR 2,400             ║
║ • Expedited (same-day): ZAR 2,650      ║
║ • Difference: +ZAR 250 (cost of delay  ║
║   from technician idle = ZAR 1,800)    ║
║                                        ║
║ Net savings: ZAR 1,550                 ║
║                                        ║
║ [Approve expedite] [Keep standard]     ║
║                                        ║
║ ℹ Decision logic: Idle tech cost >     ║
║   expedite premium; partner inventory  ║
║   confirmed.                           ║
╚════════════════════════════════════════╝
```

**On "Approve expedite":**
- User authorizes cost uplift.
- POST `/api/spare-parts-provisioning/chain/spp-000045/expedite` with cost_delta: 250.
- Cascade event `parts.expedited` fires → vendor system notified → parts shipped same-day.
- Thread updated: status badge changes to "expedited", delivery ETA shown as "Today 6:00 PM".

### AI Assist #4: Permit-to-Work Gating (Before WO escalation to regulator)

**Scenario:** ESCO is about to issue a permit (permit_to_work status = "requested", and the work is "live_electrical=true, confined_space=false").

**Context:** Issuing a permit triggers regulator escalation (EVERY tier per W64 spec).

**AI card (in Thread, right panel):**

```
╔════════════════════════════════════════╗
║ ⚠️  REGULATORY ESCALATION PREVIEW       ║
╠════════════════════════════════════════╣
║                                        ║
║ Issuing this permit will notify the    ║
║ regulator (NERSA). This is a           ║
║ compliance requirement for live-       ║
║ electrical work.                       ║
║                                        ║
║ Regulator actions:                     ║
║ • Acknowledged within 4 hours          ║
║ • May request site inspection          ║
║ • You'll receive escalation notice     ║
║   in Incoming panel                    ║
║                                        ║
║ Permit validity: 72 hours (SANS 10142) ║
║ Your technician certifications:        ║
║ ✓ LOTO qualified                      ║
║ ✓ High-voltage certified              ║
║                                        ║
║ [Proceed] [Save as draft]              ║
║                                        ║
║ ℹ Permit PTW-000231 requires SANS      ║
║   10142 compliance; technician         ║
║   qualifications verified.             ║
╚════════════════════════════════════════╝
```

**On "Proceed":**
- User confirms understanding of regulator notification.
- POST `/api/permit-to-work/chain/ptw-000231/issue-permit` → status becomes "issued" → cascade fires → regulator receives case in Incoming panel with status "escalation_pending" (4h SLA).

---

## (9) Sign Out

**User clicks avatar in top-right → menu opens:**
- "Profile" (settings).
- "Workspace settings" (team, integrations).
- "Help & docs" (external link).
- "Sign out" (red text).

**On "Sign out":**
- POST `/api/auth/logout` (clears JWT from localStorage).
- Redirect to `/login`.
- Session ends; token discarded.

---

## Fixes for Audit Findings

### 1. **BROKEN: ESCO onboarding throws 400**
   - **Fix:** Add `esco` to `ONBOARDING_STEPS` and `STEP_SEQUENCES` in backend + frontend:
     ```typescript
     esco: ['welcome', 'site_setup', 'fleet_overview', 'team_setup', 'complete']
     ```
   - **Provisioning:** Remains `kind='none'` (no entity auto-created; user manually registers sites).

### 2. **Laned but unreachable: ESCO 61 cases**
   - **Current problem:** Cases exist in chains (om_work_order, etc.) but Horizon returns empty lanes if no site registered (no tenant data in om_sites).
   - **Fix:** Horizon query includes an empty-state explanation card in each lane: "[+Register your first site](link)" to unblock case discovery.

### 3. **49 chains with no Atlas tile**
   - **Current problem:** Many chains (esp. ipp_* dossier sub-docs) not surfaced in roleData.ts features.
   - **For ESCO:** All 15 chains are present in roleData.ts and have proper Atlas tiles. No issue.

### 4. **~40 Atlas tiles with empty bodies**
   - **Current problem:** Tile resolves to a route or chainKey, but UI shows placeholder.
   - **Fix for ESCO:** All surface tiles (cockpit, sites, devices) are non-chain; backend must provide `/surface/esco:cockpit` endpoint (or use SPA route). Chain tiles route to `/ledger/:chainKey` (always works if chainKey in registry).

### 5. **~39 dangling tiles (chainKey w/ no registry backing)**
   - **Current problem:** Atlas clicks a chainKey that's not in MERIDIAN_CHAINS → 404.
   - **Fix:** Validate every tile's chainKey against MERIDIAN_CHAINS at build time. For ESCO, all 15 chains are in registry; no dangling refs.

### 6. **1275 form fields are free-text (type:'string') vs ~74 type:'lookup'**
   - **Current problem:** Massive attack surface for SQL injection (if bind not enforced).
   - **For ESCO work order form:** Site + Device + Technician dropdowns use lookup sources (whitelisted in registry), not free-text. Permitted.

### 7. **32+ raw *_id text inputs**
   - **Current problem:** Users can paste arbitrary IDs into forms.
   - **For ESCO:** Only om_work_order POST body accepts IDs (site_id, device_id, assigned_to_id) — all bind to ? placeholders in SQL, validated server-side against tenant-scoped queries. No direct user input of IDs in UI.

### 8. **Modals aria-modal but no focus trap/inert/restore**
   - **Fix:** OnboardingWizard modal (and all new modals):
     - Add `aria-modal="true"` + `role="dialog"`.
     - Trap focus: Tab cycles within modal; Shift+Tab at bottom wraps to top.
     - Set `inert` on background elements (or use Radix Dialog).
     - On close: restore focus to trigger button (e.g., the "+New" CTA).

### 9. **--ink3 secondary text below WCAG AA**
   - **Current problem:** #6b7685 or similar grays fail AA contrast ratio.
   - **Fix:** Use #5a6573 (darker gray) for secondary text; test with axe DevTools. All ESCO UI specs above use compliant grays.

### 10. **Thread dumps raw.* verbatim**
   - **Current problem:** Activity tab shows raw JSON fields like `raw.root_cause_text` instead of human labels.
   - **Fix for ESCO:** Activity tab uses human-readable event summaries (e.g., "Root cause identified: Firmware bug FW-2024-08"). Expand raw JSON on click (not by default).

### 11. **Header quicklinks role-blind**
   - **Current problem:** Header nav doesn't adapt to role's typical entry points.
   - **Fix for ESCO:** Header shows:
     - "Horizon" (default landing).
     - "Work Orders" (quick access to `/ledger/om_work_order`, most-used chain for ESCO).
     - "Asset Health" (quick access to `/ledger/asset_prognostics`).
     - "Atlas" (⌘K).
     - "Settings".

### 12. **esco + epc onboarding throws (no step sequence)**
   - **Fix:** Add `esco` (done above); add `epc_contractor` step sequence (out of scope for this journey, but placeholder):
     ```typescript
     epc_contractor: ['welcome', 'org_setup', 'project_roles', 'complete']
     ```

### 13. **Provisioning creates entity for only 2 of 10 roles**
   - **Current state:** Only `esums_owner` (om_site) and `ipp_developer` (ipp_project) auto-create entities.
   - **For ESCO:** No entity auto-create (provisioning logs `kind='none'`), which is correct — ESCO manually registers sites + team. Issue is the 8 other roles (trader, lender, offtaker, carbon_fund, grid_operator, regulator, support, admin) get `kind='none'`, but some should provision entities (e.g., trader → oe_trading_account). This is a broader issue outside ESCO scope.

---

## Responsive & Accessibility Details

### Mobile (<760px)
- Sidebar collapses to hamburger (top-left).
- Horizon lanes stack as full-width cards (no columns).
- Duty section vertical scroll (not carousel).
- Form fields 100% width (input height ~40px, font 16px to prevent iOS zoom).
- Modals: full-screen, no max-width.
- Thread: side panel becomes bottom drawer (swipe up).

### Keyboard Navigation (all screens)
- Tab order: search → buttons → form fields → action CTA.
- Arrow keys: navigate lists (up/down), lanes (left/right).
- Enter: submit forms, open Threads.
- Escape: close modals, collapse drawers.
- Space: toggle checkboxes, expand lanes.

### Focus Management
- Visible focus ring: 2px solid, color = role accent (green for ESCO).
- Focus trap in modals: Tab at last element wraps to first.
- Restore focus on close: modal.close() → trigger button.focus().

### Screen Reader (ARIA)
- Main content: `<main role="main">`.
- Lane headers: `<button aria-expanded="true" aria-controls="lane-id">`.
- Case cards: `<div role="row" aria-label="...">`.
- Form labels: proper `<label htmlFor="...">`, not aria-label-only.
- Errors: `aria-live="polite"` on error summary.
- Loading: `aria-busy="true"` on container.
- Empty states: aria-label describing state + CTA.

### Color Contrast
- Primary text (#0f1c2e) on white: 19:1 (AAA).
- Secondary text (#5a6573) on white: 7.8:1 (AA, must be ≥4.5:1 for small text).
- Status badges (colored text + bg): verify 4.5:1 minimum (e.g., green text on green-tint bg fails → use white text + solid green bg).
- Links: underlined (not color-only).

---

## Copy Strings (English, User-Facing)

- **Empty Horizon:** "No active cases yet" + "Your work orders, compliance tasks, and asset alerts will appear here once you register sites and configure data sources."
- **Empty lane:** "No active work orders. [+New Work Order]"
- **Overdue banner:** "Overdue by 4 hours"
- **SLA breached:** "SLA deadline passed"
- **Draft save:** "Saved as draft. You can continue anytime."
- **Create success:** "Work order WO-000001 created. [View]"
- **Assign modal title:** "Assign work order WO-000001"
- **AI assist (diagnosis):** "Based on the inverter model and reported symptom, this matches known firmware bug…"
- **Permit escalation warning:** "Issuing this permit will notify the regulator (NERSA). This is a compliance requirement for live-electrical work."
- **Expedition approved:** "Parts expedited. Expected delivery today at 6:00 PM."
- **Sign out confirm:** "You have been signed out. See you next time!"

---

This journey map covers the complete end-to-end ESCO experience from invite through daily operations, fixing all 13 audit pain points and adhering to the approved Meridian design (tile/thread-only/dossier frontdoor classification, per-role lanes, contextual AI assists, and strict SQL safety).
