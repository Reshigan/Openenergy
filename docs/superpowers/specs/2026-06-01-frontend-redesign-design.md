# Open Energy Platform — Frontend Redesign: Full Design Specification

> **Version:** 1.0 · 2026-06-01  
> **Visual direction:** Apex (confirmed) — navy-ink gradients, white surfaces, DM Sans, JetBrains Mono  
> **Status:** Ready for implementation

---

## 0. What We Are Building and Why

The current platform has ~50 tabs per workstation. Users are drowning in chrome. The redesign solves three distinct problems:

1. **Cognitive overload** — too many tabs of equal visual weight. Fix: persistent sidebar with collapsible sections, section-level badge counts bubble up urgency so inactive sections can stay collapsed.
2. **No context** — users lose track of where they are, what's pending, what's blocking. Fix: persistent context bar, state machine progress on every detail page, cross-role chain references.
3. **Not transactional enough** — the UI shows data but doesn't make it obvious what to DO. Fix: every feature detail page has an embedded ActionPanel showing available transitions, with reason-code forms, confirmation flows, and document upload built in.

The redesign also adds a world-class reporting layer — branded exportable reports for regulatory submissions, ESG disclosure, carbon performance, trade statements, and lender compliance packages.

---

## 1. Design Language (Apex)

### 1.1 Design Tokens

```css
/* Accent — navy-ink (NOT purple) */
--navy-0: #07182e;
--navy-1: #0b1f3a;
--navy-2: #162d52;
--navy-3: #1e3d6e;

/* Surfaces */
--canvas: #ffffff;
--surf:   #f7f9fc;
--surf-2: #f1f4f8;

/* Borders */
--border:   #e2e8f0;
--border-2: #edf1f6;

/* Text */
--text-1: #0a1628;   /* headings, primary */
--text-2: #445570;   /* body */
--text-3: #8698b0;   /* labels, placeholders */

/* Semantic */
--green:    #0b7040;  --green-bg:  #e6f6ed;
--amber:    #8c5a09;  --amber-bg:  #fdf2da;
--rose:     #b02929;  --rose-bg:   #fceaea;
--blue:     #1549a0;  --blue-bg:   #e9f0fd;
--violet:   #5c2d91;  --violet-bg: #f1ebff;  /* carbon/ESG only */

/* Gradients */
--grad-active:  linear-gradient(90deg, #0b1f3a 0%, #1e3d6e 100%);
--grad-sidebar: linear-gradient(180deg, rgba(255,255,255,.97) 0%, rgba(241,244,248,.99) 100%);
--grad-hero:    linear-gradient(160deg, rgba(230,240,255,.65) 0%, rgba(255,255,255,0) 60%);
--grad-title:   linear-gradient(130deg, #07182e 0%, #1e3d6e 100%);  /* gradient text */
--grad-button:  linear-gradient(145deg, #0b1f3a 0%, #1e3d6e 100%);
--grad-body:    radial-gradient(ellipse at 18% 60%, rgba(7,24,46,.10) 0%, transparent 55%),
                radial-gradient(ellipse at 82% 15%, rgba(14,54,102,.07) 0%, transparent 45%),
                linear-gradient(145deg, #d3dae5 0%, #c8d2e0 40%, #d6dde8 100%);

/* Radius */
--r-card:   12px;
--r-input:  8px;
--r-btn:    8px;
--r-pill:   4px;
--r-shell:  18px;

/* Shadows */
--shadow-card:  0 1px 2px rgba(7,24,46,.04), 0 4px 12px rgba(7,24,46,.06);
--shadow-shell: 0 0 0 1px rgba(255,255,255,.7), 0 8px 24px rgba(7,24,46,.08), 0 32px 72px rgba(7,24,46,.12);
--shadow-btn:   0 1px 3px rgba(7,24,46,.25), 0 4px 12px rgba(7,24,46,.1);
```

### 1.2 Typography

```
DM Sans      — all UI text (labels, nav, body)
JetBrains Mono — all numbers, codes, amounts, IDs, timestamps
```

Scale:
- Page title: 22px / 800 weight / gradient text / -0.03em tracking
- Section header: 9.5px / 700 / uppercase / +0.09em (nav labels)
- Body: 13.5px / 400 / var(--text-2)
- Data: 11.5px / 500 / var(--text-1)
- Label: 9.5–10px / 600 / uppercase / var(--text-3)
- KPI number: 24–32px / 800 / JetBrains Mono / -0.04em

### 1.3 Custom Icon Set (16×16 SVG, 1.4–1.7px stroke, round caps)

All icons are inline SVG `<symbol>` defs, never emoji or font glyphs.

Core set (minimum 40 icons):
- Navigation: home, calendar, chart-line, hierarchy, folder, blueprint, checklist, gate, flag, list, leaf, shield, dollar, scales, grid, tower, lightning, satellite, wrench, ticket, gear, bell, search, chevron-d, chevron-r, plus, export, close, drag
- Status: check-circle, x-circle, clock, alert-triangle, info-circle, lock, unlock
- Actions: edit, trash, download, upload, eye, send, approve, reject, sign, escalate
- Data: bar-chart, pie-chart, trend-up, trend-down, filter, sort, expand, collapse
- Reporting: pdf, xlsx, report, stamp, certificate, qr

### 1.4 Motion

```
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

- Sidebar section collapse: 160ms ease-out height + opacity
- Active state transition: 80ms background
- Button press: scale(0.97) 80ms (Emil principle: every pressable element)
- Page transition: 120ms fade (no slide — this is a daily driver app)
- State machine step highlight: 200ms ease-out
- SLA countdown: no animation (too distracting in cockpit-density UI)
- Modal/drawer: 200ms ease-out scale(0.97→1) + opacity

---

## 2. Shell Architecture

### 2.1 Global Layout

```
┌──────────────────────────────────────────────────────────┐
│ ALERT BAR (conditional — shows when SLA breaches exist)  │
├──────────────┬───────────────────────────────────────────┤
│              │ TOPBAR: breadcrumb / context tag / actions │
│   SIDEBAR    ├───────────────────────────────────────────┤
│   232px      │                                           │
│              │   CONTENT AREA (scrollable)               │
│   Brand mark │   · Hero strip (title + tags + KPIs)      │
│   Role badge │   · Feature body (table OR detail)        │
│   ──────     │                                           │
│   Search     │                                           │
│   ──────     │                                           │
│   Nav        │                                           │
│   sections   │                                           │
│   ──────     │                                           │
│   User foot  │                                           │
└──────────────┴───────────────────────────────────────────┘
```

**Fixed rule:** sidebar is always visible. No hamburger on desktop. No tabs. No secondary top-nav.

### 2.2 Alert Bar

Shown only when there are SLA breaches or P1 alerts. Collapses when dismissed. Max-height: 36px.

```
⚠  2 SLA breaches · NCR log item OE-NCR-0012 overdue by 3h · Drawdown DDR-0041 lender review due in 45min   [View all →]  [×]
```

Background: var(--rose-bg), border-bottom 1px var(--rose). Text: rose.

### 2.3 Sidebar

**Dimensions:** 232px wide, full viewport height, fixed.

**Sections (top to bottom):**
1. Brand area: OE three-ring logo + "Open Energy" wordmark + role badge + role switcher
2. Search bar: `⌘K` command palette trigger
3. Nav body (scrollable): section headers + nav items
4. User footer: avatar + name + role + settings + grid icons

**Section headers:**
- 9.5px uppercase label
- Chevron (rotates -90° when collapsed) — CSS transition 120ms
- Optional alert badge (rose) for items with breaches in that section
- Click anywhere on the header to collapse/expand

**Nav items:**
- 11.5px DM Sans
- 14×14 custom SVG icon left-aligned
- Hover: background rgba(0,0,0,.03)
- Active: gradient background (navy→indigo), white text
- Badges: state tag (P6, DG2, New) or count (rose for alerts, blue for info)

**Role switcher:**
- Pill in sidebar head showing current role
- Click → dropdown with all available roles for this user
- On switch: sidebar sections change, topbar context tag updates, content resets to launch board

**Command palette (⌘K):**
- Full-width overlay, centered vertically
- Type to search across ALL features across ALL sections
- Results grouped by section
- Shows feature name + current state + last actor
- Keyboard navigable (↑↓ Enter)
- Also accepts commands: "new drawdown", "open ticket", "run report"

### 2.4 Topbar

**Height:** 52px. Fixed at top of content area.

Left side:
- Section name (muted, 12px) › Feature name (bold, 13px)
- Optional: Item name (muted, 12px) when inside a detail page

Right side:
- Context tag (current project/entity, green dot): "Cosmos Wind Farm" or "All Projects"
- Secondary action button (outlined): "Export", "Filter", "Back"
- Primary action button (gradient fill): "+ New [Feature]" or "Submit", "Approve" etc.
- Notification bell with unread count badge

### 2.5 Context Awareness Principles

Every screen must answer these questions without the user having to look for them:
1. **Where am I?** → Breadcrumb in topbar
2. **What state is this item in?** → StatusPill prominently in the detail header
3. **What can I do next?** → ActionPanel on detail pages, always visible
4. **What's urgent?** → Alert bar + section badge counts
5. **Who else is involved?** → ChainLink panel showing related cross-role entities
6. **What just happened?** → Timeline/audit trail at bottom of every detail page
7. **What does the AI think?** → AIInsightCard inline on detail pages (not a popup)

---

## 3. Component Library (Full Inventory)

### 3.1 Layout
| Component | Purpose |
|---|---|
| `AppShell` | Root layout: alert bar + sidebar + topbar + content |
| `Sidebar` | Left nav with all sub-components |
| `SidebarSection` | Collapsible section with label + badge |
| `SidebarItem` | Nav item with icon + label + badges |
| `Topbar` | Fixed top bar with breadcrumb + actions |
| `AlertBar` | Conditional SLA breach banner |
| `ContentArea` | Padded scrollable content wrapper |
| `HeroStrip` | Page title + subtitle + tags + KPI grid |
| `SplitLayout` | Two-column: main content + right panel |

### 3.2 Data Display
| Component | Purpose |
|---|---|
| `StatCard` | KPI card: label + number + delta + colored top accent |
| `StatGrid` | Responsive 2/3/4-column grid of StatCards |
| `DataTable` | Sortable, filterable, selectable table with row actions |
| `StatusPill` | Colored pill for state machine states |
| `BadgeCount` | Small count badge (rose alert, blue info) |
| `ProgressBar` | Gradient fill with percentage label |
| `ProgressStack` | Multiple bars showing breakdown (civil/mech/elec) |
| `StateFlow` | Horizontal state machine visualization (clickable steps) |
| `Timeline` | Vertical audit trail with actor, action, timestamp, reason |
| `ChainLink` | Related-chain card: icon + chain type + entity name + state |
| `ChainMap` | Expandable panel showing all connected chains |
| `AIInsightCard` | Inline AI suggestion: summary + why + 1-click accept |
| `DocumentCard` | File card: type icon + name + date + download |
| `CoverageMap` | SA map for carbon/grid spatial features |
| `MiniChart` | Sparkline or mini bar/line for inline trends |

### 3.3 Charts (for dashboards and reports)
| Component | Purpose |
|---|---|
| `LineChart` | Time series (P&L, SPI, generation output) |
| `BarChart` | Comparison bars (budget vs actual, role breakdown) |
| `StackedBarChart` | Stacked breakdown (portfolio by status) |
| `DonutChart` | Portfolio composition (by state, by type) |
| `GanttChart` | Project schedule (P6-style, read-only) |
| `WaterfallChart` | Cost variance analysis (EVM) |
| `HeatMap` | Time-of-day trading patterns |
| `SankeyDiagram` | Carbon flow (generation → certification → retirement) |

### 3.4 Forms and Actions
| Component | Purpose |
|---|---|
| `ActionPanel` | Available state machine transitions with button set |
| `TransitionForm` | Form triggered by an action: reason code + notes + docs |
| `TransactionForm` | Multi-step form for creating new entities (drawdown, order, etc.) |
| `ConfirmationModal` | Final confirm before irreversible actions |
| `DocumentUpload` | Drag-drop + file list + validation |
| `SignaturePanel` | Digital sign with timestamp (for certified submissions) |
| `FilterBar` | Search + dropdown filters + date range |
| `BulkActionBar` | Appears when rows selected in DataTable |
| `DateRangePicker` | Calendar picker for reports |
| `ReasonCodeSelect` | Dropdown of structured reason codes per state machine |

### 3.5 Notifications and Context
| Component | Purpose |
|---|---|
| `NotificationBell` | Bell icon + unread count, dropdown of recent notifications |
| `NotificationItem` | Single notification: icon + message + time + action link |
| `ActivityFeed` | Role-filtered stream of recent platform events |
| `CrossRoleAlert` | Alert card when a cross-role chain item needs attention |
| `SLACountdown` | Remaining time display (color-coded green/amber/rose) |
| `CommandPalette` | ⌘K overlay for global feature search + commands |

### 3.6 Reporting
| Component | Purpose |
|---|---|
| `ReportShell` | Full-screen report layout with branded header + footer |
| `ReportHeader` | OE logo + report title + entity + date range + ref number |
| `ReportSection` | Named section with content + page-break handling |
| `ExportToolbar` | PDF / XLSX / CSV export buttons + share |
| `ReportBuilder` | Guided report creation: type → filters → preview → export |
| `BrandedCover` | Report cover page: logo + client name + regulatory ref |

---

## 4. Feature Screen Pattern (Universal — All Roles)

Every feature in the system (drawdown, stage gate, NCR, trade, carbon credit, etc.) follows the same three-screen pattern:

### 4.1 Screen A — Feature List

**User question:** *"What are all my [drawdowns / stage gates / NCRs / etc.] and which ones need my attention right now?"*

Layout:
```
[HeroStrip: title + count badge + status summary]
[FilterBar: search + status filter + date filter + assignee + export]
[DataTable]
  Columns (varies by feature, but always):
  · ID/Reference (JetBrains Mono, link to detail)
  · Name/Description
  · Status (StatusPill)
  · Key date (SLA or due date, SLACountdown if near breach)
  · Amount/Value (JetBrains Mono, right-aligned)
  · Last actor
  · Row action: [View] [Quick action button if single available]
[BulkActionBar: appears on row selection]
```

Design principles:
- Default sort: most urgent first (SLA soonest, then most recently updated)
- Status filter chips shown inline above table (not just in dropdown) for 1-click filtering
- SLA countdown shown only when < 24 hours remaining (red glow)
- Empty state: illustrated prompt with "Create your first [X]" CTA
- Loading: skeleton rows matching the table structure

### 4.2 Screen B — Feature Detail

**User question:** *"What is the current state of this specific [drawdown / NCR / etc.], what happened, what can I do, and what else does it affect?"*

Layout:
```
[Sticky detail header]
  · Breadcrumb: Section › Feature List › [Item Name]
  · StatusPill (prominent, current state)
  · SLACountdown (if time-bound)
  · ActionPanel inline (buttons for available transitions)

[StateFlow — horizontal progress stepper]
  States shown left-to-right with the flow of the machine.
  Current state: filled navy circle + label
  Completed states: checked green circle
  Future states: hollow circle, muted
  Terminal states (closed/rejected/written-off): shown with clear terminal icon

[Two-column SplitLayout below StateFlow]
  LEFT (2/3 width):
    · MetaCard: all key fields (submitted by, date, amount, category, etc.)
    · Feature-specific sections (e.g., for drawdown: utilisation breakdown, conditions precedent list)
    · DocumentCard list (all attached evidence)
    · AIInsightCard (1-2 AI observations, dismissible)
    · Timeline (full audit trail, newest first)

  RIGHT (1/3 width):
    · ChainMap: all related chains, grouped by type (parent / child / cross-role)
    · ActivityFeed: recent events on this specific item
    · CrossRoleAlert: if another role needs to act (e.g., "Lender review pending")
```

Design principles:
- The StateFlow is THE most important element — it tells the user exactly where they are in the workflow
- ActionPanel is always visible without scrolling on the initial viewport
- ChainMap shows the interconnected nature — clicking any chain link opens that item in a drawer (not a new page, to preserve context)
- AIInsightCard should be subtle — it doesn't interrupt, it appears naturally between the MetaCard and the Timeline
- The Timeline shows who did what when and why (with reason codes) — this is the audit chain made visible

### 4.3 Screen C — Transaction Entry (Create / Edit)

**User question:** *"I need to submit a new [drawdown request / NCR / trade order / etc.] — what do I need to provide?"*

Layout:
- Multi-step `TransactionForm` (replaces the old modal pattern)
- Step indicator at the top (1 / 2 / 3 style)
- Each step is one logical group of fields (never overwhelming)
- Step 1: Core details (type, amount, description)
- Step 2: Supporting data (conditions, schedules, counterparty selection)
- Step 3: Document upload (required evidence)
- Step 4: Preview + submit (read-only summary before final commit)
- Confirmation screen: success state with reference number + "View record" CTA

Design principles:
- Never show all fields at once
- Inline validation as user types (not on submit)
- Required fields marked with a subtle asterisk, not a warning
- Unsaved changes persist across navigation (draft system)
- Large text inputs use full width; amounts/codes use fixed-width JetBrains Mono inputs

---

## 5. Role-Specific Design (All 9 Roles)

### 5.1 IPP Developer

**Mental model:** A construction project manager running a major infrastructure build who also needs to manage financing, compliance, and regulatory relationships simultaneously.

**Primary daily questions:**
- Is my construction on schedule and within budget?
- Do I have any NCRs or compliance gates blocking progress?
- Is my drawdown approved? When does the money land?
- Are there any regulatory actions pending?

**Sidebar sections and items:**

```
PROJECT
  Dashboard (home)
  Schedule         [P6 badge]
  Cost & EVM
  WBS
  Documents
  Drawing Register [New badge when new drawings uploaded]
  Commissioning Log

COMPLIANCE & SAFETY
  Stage Gates       [DG badge for current gate: DG1–DG5]
  NCR Log           [rose count badge]
  Method Statements
  Env. Monitoring
  HSE Incidents
  Cyber Incidents   [rose if open]

CONTRACTS & FINANCE
  Progress Claims
  Drawdowns
  Bonds & Insurance
  Subcontractors
  Procurement / RFP

RISK & QUALITY
  Risk Register     [rose count if unmitigated high risks]
  Issues Log
  Lessons Learned
  TQ Log

REGULATORY
  Licence Applications
  Environmental Approvals
  ED Commitments    [amber if behind target]
  Insurance Claims
```

**Launch Board (IPP Developer):**

KPIs row 1: SPI (color-coded) | CPI (color-coded) | EAC vs Budget (variance amount) | DG2 gate (days remaining)
KPIs row 2: Open NCRs | Active drawdowns | Bond expiry (nearest) | ED commitment %

Pending Actions panel: ordered by urgency
- "NCR-0012 response due in 3h" [→ View NCR]
- "DG2 milestone evidence requires upload by Jun 14" [→ Upload docs]
- "Drawdown DDR-041 lender review pending — no action needed" (informational)

AI Insights panel:
- "Your CPI is 0.89 — trend shows recovery on 3 tasks. Flagging turbine procurement delay as the primary risk. Review critical path?"
- "Drawing Register has 14 unreviewed submissions from the civil contractor."

Activity Feed: last 10 events across all IPP chains

**Feature screens unique to IPP Developer:**

*Schedule (P6 integration):*
- Gantt-style table showing tasks, baseline vs actual, SPI/CPI per work package
- Critical path highlighted in rose
- Earned Value chart (BCWS / BCWP / ACWP over time)
- Ability to log progress updates (% complete per task)
- Export: P6-compatible XML for external viewers; PDF Gantt report

*Stage Gates:*
- StateFlow shows: DG0 → DG1 → DG2 → DG3 → DG4 (current gate highlighted)
- Each gate expands to show its evidence checklist (document-by-document status)
- Gate submission: multi-step form uploading all required documents
- Lender and regulator review status visible (cross-role chain links)

*Drawdowns:*
- List: all drawdown requests with status and lender review countdown
- Detail: StateFlow showing submitted → IE review → CP check → lender approved → disbursed
- Utilisation table: which budget lines the drawdown funds
- Conditions Precedent checklist (each CP with uploaded evidence)
- Cross-role link → Lender's view of this drawdown

---

### 5.2 Lender

**Mental model:** A project finance credit officer managing a portfolio of infrastructure loans. Primary concern is covenant compliance and ensuring the project is progressing as underwritten.

**Primary daily questions:**
- Which of my projects are on watchlist? Which are in covenant breach?
- Are there drawdown requests waiting for my approval?
- Are all covenant certificates current?
- Am I within SARB large-exposure limits?

**Sidebar sections:**

```
PORTFOLIO
  Dashboard
  Loan Book          [amber count: watchlist loans]
  Credit Facilities
  DSCR Monitor       [rose if below covenant]

DRAWDOWNS & DISBURSEMENTS
  Drawdown Requests  [rose: pending approval]
  Disbursements
  Reserve Accounts   [rose: shortfall]
  Utilisation of Proceeds

COVENANTS & COMPLIANCE
  Covenant Certificates  [amber: due soon]
  Covenant Tracker       [rose: breaches]
  Inspection Reports
  Insurance Compliance

RISK & CREDIT
  Risk Ratings
  Security & Collateral  [rose: perfection gaps]
  Loan Transfers
  Default & Enforcement

REPORTING
  Portfolio Reports
  Regulatory Reports     [SARB]
```

**Feature screens unique to Lender:**

*Loan Book dashboard:*
- Portfolio donut: healthy / watchlist / breach / enforcement
- Total exposure vs SARB limit (utilisation bar — amber at 80%, rose at 95%)
- DSCR heatmap: each project × each period, cells colored by DSCR vs covenant
- Clickable cells → drawdown into DSCR detail for that project/period

*Drawdown Approval:*
- StateFlow: submitted → IE review → CP review → lender approval → disbursed
- Conditions Precedent panel: each CP as a checklist item with uploaded document (click to preview inline)
- AI insight: "CP-7 (insurance certificate) expires in 34 days — drawdown will fund construction through that period. Flag for renewal monitoring."
- ActionPanel: [Approve] [Request Further Information] [Reject] — each triggers TransitionForm asking for reason

*Covenant Certificate:*
- Per-covenant table: covenant | threshold | actual | status | last tested
- Status pill per covenant (green passing / amber waiver / rose breach)
- Cure period countdown (for any breach — prominent SLACountdown)
- Full covenant test workings uploaded as document
- Cross-role link: IPP Developer can also see this certificate

---

### 5.3 Offtaker

**Mental model:** A commercial or industrial electricity buyer with a long-term Power Purchase Agreement. They care about delivery reliability, tariff correctness, and managing their energy costs.

**Primary daily questions:**
- Did I receive the MWh I contracted for this month?
- Is my current tariff correct after indexation?
- Do I have any take-or-pay shortfall exposure?
- Are my RECs / Guarantees of Origin up to date?

**Sidebar sections:**

```
PPA MANAGEMENT
  Dashboard
  My PPAs
  Tariff Schedule    [amber: indexation due]
  Take-or-Pay Monitor [rose: shortfall risk]

DELIVERY & BILLING
  Monthly Recon      [amber: disputes open]
  Curtailment Claims
  Payment Securities
  Invoice Tracker

CERTIFICATES
  RECs / Guarantees of Origin [amber: pending retirement]
  Scope-2 Register
  Carbon Certificates

CONTRACTS
  Contract Execution
  Change-in-Law Events
  PPA Termination
  Amendments

REPORTING
  Delivery Reports
  ESG / Scope-2 Reports
```

**Feature screens unique to Offtaker:**

*Monthly Recon:*
- Three-column comparison: Contracted MWh | Metered MWh | Invoiced MWh
- Variance column with absolute and % delta
- Classification: within tolerance (green) / shortfall / surplus / dispute
- Drill-down to hourly metering data
- "Raise Dispute" button opens TransitionForm inline
- Export: Monthly recon statement (PDF, branded)

*Take-or-Pay Monitor:*
- Annual contracted volume vs delivered volume (running cumulative line chart)
- Take-or-pay exposure calculation (ZAR) real-time
- Cure window countdown (if already in shortfall territory)
- AI: "At current delivery pace you will have a R4.2M take-or-pay exposure by Q3 end. Primary cause: scheduled maintenance outage weeks 22–24."

*RECs / GoO Lifecycle:*
- StateFlow: issued → in-registry → allocated → retired → scope-2-claim
- Retirement form: links REC to specific reporting period and scope-2 claim
- Export: GoO certificate (PDF, I-REC compliant, branded)

---

### 5.4 Trader

**Mental model:** An energy market participant managing a book of spot and forward positions, exposed to price risk, counterparty risk, and regulatory obligations.

**Primary daily questions:**
- What is my current net position? Am I within limits?
- What is today's P&L? Any margin calls?
- Are there orders waiting to be filled?
- Are there any regulatory reporting deadlines today?

**Sidebar sections:**

```
TRADING
  Dashboard          [live P&L counter]
  Order Book         [pending fill count]
  My Positions
  Trade Blotter

RISK MANAGEMENT
  Position Limits    [rose: limit utilisation > 90%]
  VaR / Scenario
  Margin & Collateral [rose: margin call]
  Counterparty Risk

COMPLIANCE
  Market Conduct     [amber: monitoring alerts]
  Algo Certification
  Trade Reporting    [rose: T+1 deadline today]
  Market Abuse

SETTLEMENT
  Settlement Runs
  Allocations & Give-ups
  Disputed Trades

REPORTING
  Trade Statements
  Risk Reports
  Regulatory Reports
```

**Feature screens unique to Trader:**

*Order Book (live):*
- Bid/ask ladder showing depth at each price level (table, not chart — cockpit density)
- My orders highlighted in navy
- One-click order entry panel: instrument | side | price | quantity → [Submit]
- Order status: pending / partially filled / filled / cancelled
- Price column uses JetBrains Mono; large fills shown with amber flash
- Real-time updates without full page refresh (WebSocket-ready architecture)

*Position Dashboard:*
- Current positions: instrument | long/short | quantity | entry price | mark price | unrealised P&L
- P&L colors: green positive, rose negative
- Position limit utilisation bar per instrument (rose at > 90%)
- VaR indicator: current VaR vs daily limit
- One-click: [Close position] [Reduce by X%] [Hedge]

*Algo Certification:*
- StateFlow: application → testing → approval → deployed / suspended
- Live systems table: system name | status | last kill-switch test date
- Kill-switch button: prominent, red-bordered, requires explicit confirm
- AI: "Algo SYS-003 shows elevated rejection rate (+3.2σ) in last 6 hours. Consider reviewing strategy parameters before next session."

---

### 5.5 Carbon Fund

**Mental model:** A climate finance professional managing a portfolio of carbon-credit projects through validation, verification, issuance, and trading of credits against emission reduction obligations.

**Primary daily questions:**
- Which of my projects are in active MRV verification?
- What credits have been issued this month? What is the portfolio value?
- Are there any ERPA delivery obligations coming up?
- How is my buffer pool holding up?

**Sidebar sections:**

```
PROJECT PORTFOLIO
  Dashboard
  Project Register
  PoA Inclusions     [amber: pending screen]
  Crediting Renewals

CARBON LIFECYCLE
  MRV Verification   [P6 stepper per project]
  Credit Issuance
  ERPA Delivery
  Credit Retirement

MARKET & COMPLIANCE
  Carbon Tax Offsets [rose: SARS deadline]
  Carbon Reversal
  Registry Accounts
  Article 6 / ITMO

REPORTING
  Portfolio Reports
  Carbon Performance
  DFFE / DNA Filings
```

**Feature screens unique to Carbon Fund:**

*MRV Verification (the 14-state chain):*
- StateFlow is very long — shows full UNFCCC validation → site audit → CRA → issuance flow
- Collapsed by default into phase groups: [Preparation] [Validation] [Verification] [Issuance]
- Expand any phase to see individual states
- Document checklist per state (each required document with upload + status)
- Auditor annotations show inline in the Timeline

*Carbon Portfolio Dashboard:*
- Total credits issued (tCO2e) — JetBrains Mono large number
- Credits retired vs available vs reserved for ERPAs (Sankey diagram)
- Project breakdown donut (project A / B / C / others)
- Monthly issuance trend (bar chart)
- ERPA delivery schedule (upcoming 6 months Gantt)
- Carbon price chart (spot + forward) — sparkline

*Article 6 / ITMO Ledger:*
- Per ITMO: host country | acquiring country | vintage | tCO2e | corresponding adjustment status
- UN registry reconciliation status
- Export: ITMO transfer report (UN-standard format)

---

### 5.6 Regulator (NERSA)

**Mental model:** A regulatory authority officer managing the full lifecycle of market participation — granting licences, monitoring compliance, enforcing standards, setting tariffs, and resolving disputes.

**Primary daily questions:**
- What new licence applications need review?
- Are there any compliance inspection reports requiring disposition?
- Are there any complaints open beyond their SLA?
- What are today's dispositions (enforcement decisions)?

**Sidebar sections:**

```
LICENSING
  Dashboard
  Licence Applications [rose: decision overdue]
  Licence Register
  SSEG Registrations
  Renewals             [amber: due within 90d]

COMPLIANCE
  Inspections          [rose: enforcement needed]
  Disposition Inbox    [rose count]
  Compliance Notices
  Non-Conformances

MARKET OVERSIGHT
  Surveillance Cases   [rose: active]
  Complaints           [rose: SLA breach]
  Market Abuse Cases

TARIFF & ECONOMIC
  MYPD Determinations
  Levy Assessments     [amber: collection due]
  Tariff Indexations

REPORTING
  Regulatory Reports
  Compliance Statistics
  Enforcement Register
```

**Feature screens unique to Regulator:**

*Disposition Inbox:*
- This is the Regulator's most important screen — it is their "action queue"
- All items from other roles that require regulatory action appear here
- Filter by origin chain (drawdown / curtailment / market abuse / complaint / etc.)
- Priority order: P1 safety/criminal → P2 enforcement → P3 compliance → P4 informational
- Each item shows: source role | chain type | brief description | SLA countdown | [Dispose]
- Disposition: approve / reject / refer / adjourn — with structured reason codes

*MYPD Tariff Determination:*
- The 12-state MYPD chain — very formal regulatory process
- Public participation tracking: submissions count, response deadline, summary
- Technical evaluation panel (internal scoring)
- Council decision record (formal minutes attachment)
- Export: MYPD determination notice (official PDF, regulatory letterhead, stamp)

---

### 5.7 Grid Operator (NTCSA / SO)

**Mental model:** The system operator managing real-time grid stability, medium-term capacity planning, and long-term connection queue management.

**Primary daily questions:**
- What are today's dispatch nominations and are they all confirmed?
- Are there any curtailment orders in effect?
- What is the connection capacity queue status?
- Are there any non-conformance events requiring follow-up?

**Sidebar sections:**

```
DISPATCH OPERATIONS
  Dashboard          [live generation mix indicator]
  Nominations
  Dispatch Schedule
  Load Curtailment   [rose: active curtailments]

NETWORK & CAPACITY
  Connection Queue   [capacity utilisation bar]
  GCA Register
  Wheeling Charges   [amber: disputes open]
  Energization Log

COMPLIANCE
  Grid Code Compliance [rose: non-conformances]
  Ancillary Services
  Planned Outages

REPORTING
  Grid Operations Reports
  Capacity Reports
  Settlement Reports
```

**Feature screens unique to Grid:**

*Dispatch Dashboard (real-time):*
- Generation mix by technology (hydro / wind / solar / gas / batteries) — live donut chart
- Current system frequency (display only — color coded vs nominal)
- Active nominations: bid capacity | awarded | activated | deviation %
- Curtailment map: SA geographic map with active curtailment zones highlighted
- Merit order table: generators ranked by cost, showing dispatch status

*Connection Capacity Queue:*
- Queue position table: applicant | project | MW | voltage | zone | status | queue date
- Substation capacity utilisation: each substation as a card with MW capacity bar
- Filter by zone (Eskom transmission zones)
- Action: allocate capacity → links to GCA creation (chain reference)

---

### 5.8 Esums / O&M

**Mental model:** An operations and maintenance manager responsible for fleet health across multiple wind/solar sites, using predictive analytics to prevent failures and optimise availability.

**Primary daily questions:**
- What assets are currently underperforming or in fault state?
- What scheduled maintenance is due this week?
- Are there any RUL (Remaining Useful Life) alerts requiring intervention?
- What is the current fleet availability (OEM target vs actual)?

**Sidebar sections:**

```
ASSET FLEET
  Dashboard          [live fleet availability %]
  Site Overview      [asset map]
  Asset Detail       [by asset ID]
  Performance (PR)   [amber: underperforming]

MAINTENANCE
  Work Orders        [rose: overdue]
  PM Compliance      [amber: deferred]
  Permit to Work     [rose: expired/near expiry]
  Vendor Escalations

PREDICTIVE
  Asset Health       [rose: critical predictions]
  Anomaly Detection
  RUL Predictions    [amber: < 30 days remaining]
  Fault Fingerprint
  Revenue Assurance  [amber: revenue leakage]

WARRANTY & CLAIMS
  Warranty Claims
  Warranty Recovery
  Spare Parts

REPORTING
  O&M Reports
  Predictive Reports
  ESG / PR Reports
```

**Feature screens unique to Esums:**

*Asset Health (W71 predictive brain):*
- Fleet health score (composite — 0–100) as large JetBrains Mono number
- Per-asset health tiles: asset ID | current state | anomaly score | RUL estimate | fault risk %
- Color-coded: green (healthy) / amber (monitor) / rose (intervention required)
- Click asset → full predictive detail: 
  - Anomaly detection: ensemble score + which methods triggered
  - Degradation trend: OLS trendline chart with projection to end-of-life
  - Fault fingerprint: classified fault type (12-mode) with confidence %
  - RUL estimate: days remaining with confidence interval
  - Recommended action: AI insight with "Raise Work Order" 1-click

*Revenue Assurance (W79):*
- The "four numbers" display: Expected | Metered | Settled | Invoiced
- Leakage classification: meter_drift / settlement_error / curtailment / clipping
- ZAR leakage quantification per category
- Action: [Raise Dispute] [Verify Meter] [Accept Variance]

---

### 5.9 OEM Support

**Mental model:** A service desk and field service manager handling the full ITIL service lifecycle — incidents, problems, changes, warranty claims — for a fleet of energy assets.

**Primary daily questions:**
- What are the open P1/P2 incidents? Are any breaching SLA?
- Is there a pending change that needs CAB approval?
- Are there any recurring faults (problem records) we haven't root-caused?
- What spare parts are on backorder and blocking maintenance?

**Sidebar sections:**

```
SERVICE DESK
  Dashboard          [P1 SLA timer if active]
  Incidents          [rose: SLA breach count]
  Problems           [amber: pending root cause]

CHANGE MANAGEMENT
  Change Requests    [amber: CAB approval due]
  Emergency Changes  [rose: active ECAB]
  PIR Register

WARRANTY
  Warranty Claims
  Warranty Recovery
  FCO / Bulletins

SPARES & SUPPLY
  Spare Parts        [rose: vital backorder]
  Security Patches   [rose: CVSS critical]

REPORTING
  SLA Reports
  MTTR / MTBF Reports
  Warranty Reports
```

---

## 6. Reporting and Export System

### 6.1 Report Builder (Self-service)

A guided 4-step flow:
1. **Select report type** — grouped by category (Regulatory / Financial / ESG / Operations / Compliance)
2. **Set scope** — project(s), date range, counterparties, role filter
3. **Preview** — rendered report in browser with OE branding
4. **Export** — PDF (print-ready, branded) / XLSX (structured data) / CSV (raw data)

### 6.2 Report Types by Category

**Regulatory Reports:**
- NERSA Licence Status Certificate (PDF, regulatory letterhead)
- NERSA Compliance Inspection Report (PDF, with enforcement recommendations)
- REIPPPP Stage Gate Certification Pack (PDF, per gate)
- MYPD Tariff Determination Notice (PDF, council-stamp, official)
- Levy Assessment Notice (PDF, NERSA)
- FSCA Trade Repository Report (XLSX, per FMA format)

**Financial Reports:**
- Drawdown Statement (PDF, per drawdown)
- Covenant Compliance Certificate (PDF, LMA-format, signed)
- EAC Budget Report (PDF, EVM with variances)
- SARB Large-Exposure Report (XLSX)
- Progress Claim Certificate (PDF, per claim)
- Disbursement Utilisation Statement (PDF)

**ESG / Carbon Reports:**
- Carbon Performance Dashboard (PDF, 4 pages, branded)
- MRV Verification Summary Report (PDF, UN/GS/Verra format)
- ITMO Transfer Record (PDF, UN standard)
- Scope-2 Emissions Report (PDF, GHG Protocol format)
- GoO / REC Retirement Certificate (PDF, I-REC compliant)
- ESG Disclosure Pack (PDF, TCFD-aligned)

**Trading Reports:**
- Daily Trade Statement (PDF/XLSX, per entity)
- Position and Exposure Report (PDF, daily snapshot)
- Settlement Statement (PDF, per settlement run)
- Margin Call Notice (PDF, formal)
- Market Abuse STOR Filing (PDF, FSCA format)

**O&M Reports:**
- Fleet Availability Report (PDF, monthly)
- Predictive Maintenance Report (PDF, per site)
- Revenue Assurance Summary (PDF, ZAR leakage quantified)
- PR Underperformance Report (PDF, per IEC 61724)

### 6.3 Report Branding

All PDF exports share:
- Cover page: OE three-ring logo (large) + report title + entity name + date range + reference number
- Header (every page): OE logo small + report title + page X of Y + confidential watermark
- Footer (every page): generated timestamp + entity registration number + "Powered by Open Energy Platform"
- Typography: the Apex design tokens applied (navy headings, gray body, JetBrains Mono for numbers)
- Colour-coded status tables (not grey-only — semantic colours for status cells)

---

## 7. Cross-Role Interconnection Design

### 7.1 Chain Map Component

Every feature detail page shows a `ChainMap` panel in the right column. It displays:

```
PARENT CHAINS              THIS ITEM               CHILD CHAINS
─────────────              ─────────               ────────────
Credit Facility ──────────► Drawdown ──────────────► Settlement
(Lender: Active)          DDR-0041                  (Pending)
                          [Current item]
GCA Connection ───────────►
(Grid: Active)
                                                   ► Disbursement
Stage Gate DG2 ───────────►                          (Completed)
(IPP: Passed)
```

Clicking any chain link opens a `SideDrawer` (slides in from the right at 400px width) showing a condensed version of that item's detail — so users can inspect a related chain without losing their current context.

### 7.2 Cross-Role Notifications

When a state transition in chain A requires action from a different role in chain B, a `CrossRoleAlert` appears:
- In the originating chain: "Waiting for Lender review" (informational, no action)
- In the receiving chain (Lender view): "Drawdown DDR-0041 from Cosmos Wind Farm requires your approval by Jun 14 14:00" [→ Review now]

These also appear in:
- The notification bell dropdown
- The Alert Bar (if SLA is < 6 hours)
- The Launch Board pending actions panel

### 7.3 Activity Feed

A filterable live stream of platform events. Available on:
- Launch Board (role-filtered)
- Feature detail pages (item-specific)
- Notification dropdown

Each event shows:
- Icon (custom SVG representing the event type)
- Message: "[Actor name] [actioned] [item] in [chain]" e.g. "IE approved drawdown DDR-0041 (Cosmos Wind Farm)"
- Time: relative ("3 min ago") with tooltip showing absolute timestamp
- Link to the item

---

## 8. AI Assist Pattern

Consistent with the existing platform principle: no AI tabs, no AI popups. AI shows up inline.

Every feature detail page may have 1–2 `AIInsightCard` components:
- Position: between the MetaCard and the Timeline (naturally in-page flow)
- Structure: icon + summary (1 sentence) + reasoning (2–3 sentences) + action button
- States: visible / dismissed / accepted
- On dismiss: the card slides out and is replaced by a thin "AI hidden" link
- On accept: the AI's suggested action is pre-filled into the ActionPanel's TransitionForm

Examples:
- "CPI trending below 0.90 for 3 consecutive periods. Recommend raising a formal cost variance report before DG2 submission." [→ Create cost variance report]
- "Drawdown utilisation of CP-7 (insurance) expires in 34 days, within this drawdown's fund period. Flag for renewal?" [→ Flag for renewal]
- "Counterparty ENRG-SA has 2 open margin calls on other positions. Consider reducing exposure." [→ View counterparty risk]

---

## 8B. In-System Analytics and Trends (Per Role)

Every role gets a dedicated **Analytics** section in the sidebar — distinct from the operational sections. These are interactive, in-system dashboards (not just exports) showing trends, predictive signals, and business intelligence.

### IPP Developer Analytics

**Asset Summary Dashboard:**
- Project-level health score (composite: schedule + cost + compliance + safety)
- Cost performance over time: SPI/CPI 12-month trend line (amber threshold lines at 0.90)
- Budget waterfall: Original budget → approved changes → forecast → EAC
- Milestone calendar: all upcoming gates, deadlines, bond expiries on a single timeline
- Subcontractor performance: value certified vs time elapsed per package
- **Value created:** Identify schedule drift weeks before it becomes a gate issue

**Earned Value Management Dashboard:**
- BCWS / BCWP / ACWP cumulative curves (the classic S-curve)
- Variance at completion (VAC) projected range (optimistic / likely / pessimistic)
- Work package EVM breakdown: each WBS item with its own SPI and CPI
- Schedule criticality: % of tasks on critical path
- **Value created:** Early warning of budget overrun before drawdown is exhausted

**Compliance Trends:**
- NCR open/close rate trend (are we closing faster than we open?)
- HSE incident frequency rate (TRIR, LTIFR) — OHSA/ISO 45001 metrics
- Stage gate preparation score (% documents ready for each gate)
- **Value created:** Shows regulatory risk trajectory, not just current state

### Lender Analytics

**Portfolio Summary Dashboard:**
- Total portfolio exposure: senior debt | mezzanine | guarantee (stacked bar)
- Weighted average DSCR by vintage (line chart — shows portfolio health trend)
- Watchlist migration: heat-map showing loans moving between healthy/watchlist/breach
- Concentration risk: exposure by technology / geography / counterparty (donut)
- Interest income vs provisions (P&L bar chart, quarterly)
- **Value created:** SARB ICAAP and credit committee reporting in seconds

**Credit Risk Trends:**
- DSCR distribution across portfolio (histogram — how many loans below 1.2x?)
- Covenant compliance rate over time (% loans fully compliant, per quarter)
- LGD trend by collateral type
- Expected credit loss (ECL) waterfall
- **Value created:** Basel III ICAAP, ECL provisioning under IFRS 9

**Revenue and Margin Analytics:**
- Margin analysis: net interest margin per loan vs origination cost
- Drawdown velocity: % of committed facilities drawn down (utilisation over time)
- Fee income: arrangement, agency, commitment fees — all in one view
- **Value created:** Helps treasury optimise funding cost vs deployment timing

### Offtaker Analytics

**Energy Portfolio Summary:**
- Total contracted capacity (MW) vs total delivered (MWh) — annual trend
- Tariff indexation history: base tariff → CPI adjustments over PPA lifetime
- Take-or-pay exposure history: quarterly shortfall/surplus trend
- Cost per MWh: all-in effective cost vs spot market (make-or-buy comparison)
- **Value created:** Shows whether PPAs are delivering value vs market alternatives

**Scope-2 Analytics:**
- Scope-2 emissions sourced from contracted PPAs (tCO2e, monthly)
- Residual mix emissions factor (for market-based reporting)
- REC coverage ratio: contracted MWh covered by GoO vs total consumption
- Emissions intensity trend: tCO2e / GWh production output (if industrial offtaker)
- **Value created:** GHG Protocol Scope-2 reporting, CDP disclosure, TCFD

### Trader Analytics

**Trading Summary Dashboard:**
- P&L attribution: realised + unrealised by strategy/book/instrument
- Win rate: % of profitable days / trades (histogram)
- Position sizing trend: average position vs limit over time
- Execution quality: VWAP vs executed price (best-execution evidence for FSCA)
- **Value created:** Trader performance review, risk committee reporting

**Risk Dashboard:**
- VaR time series (daily VaR vs VaR limit — any breach flagged)
- Stress test results: P&L impact of +/-10%, +/-20% price scenarios
- Correlation matrix: inter-instrument correlations (heatmap)
- Counterparty exposure: per counterparty net exposure vs credit limit
- **Value created:** Risk committee deck built automatically; FSCA position limits monitoring

**Market Intelligence:**
- Price trend charts: spot + forward curve for each traded instrument
- Volume analysis: traded volume by session / time of day (heatmap)
- Bid-ask spread trend (market liquidity indicator)
- **Value created:** Market microstructure analysis for strategy improvement

### Carbon Fund Analytics

**Carbon Portfolio Summary:**
- Credits by status: validated / verified / issued / retired / buffer pool (Sankey)
- Portfolio tCO2e breakdown by project / technology / country
- Price realisation: achieved ERPA price vs spot carbon price benchmark
- Issuance velocity: credits issued per quarter vs plan
- Buffer pool adequacy: permanence buffer vs AFOLU standards (%)
- **Value created:** Carbon portfolio valuation, investor reporting, DFFE DNA filings

**Carbon Market Analytics:**
- Carbon price chart: project vintage prices vs market benchmarks
- ERPA delivery schedule: forward delivery obligations on Gantt
- Article 6 ITMO flow: corresponding adjustments by host/acquiring country
- **Value created:** ITMO trading strategy, ERPA pricing decisions

### Regulator Analytics

**Market Oversight Dashboard:**
- Licence health: count of active/suspended/revoked by class (donut)
- Compliance inspection outcomes: % compliant vs non-compliant (trend)
- Enforcement pipeline: notice → penalty → appeal → resolution flow (Sankey)
- Complaint resolution SLA performance: % resolved within SLA by quarter
- **Value created:** NERSA annual report, Minister briefing packs

**Revenue Regulation Analytics:**
- MYPD allowed revenue vs actual revenue by licensee
- Cross-subsidy flows: tariff category analysis
- Levy collection efficiency: assessed vs collected vs in-dispute
- **Value created:** MYPD affordability review, parliamentary committee reporting

### Grid Operator Analytics

**Grid Operations Summary:**
- Generation mix by technology over time (area chart)
- Load factor by hour-of-day and day-of-week (heatmap)
- Curtailment volume trend: MWh curtailed per month by reason
- Reserve adequacy: spinning reserve coverage % vs security standard
- System Average Interruption Duration Index (SAIDI) trend
- **Value created:** NERSA grid performance reporting, security of supply assessment

**Capacity Planning Analytics:**
- Connection queue visualisation: MW in queue by substation / voltage level
- New capacity coming online (12-month forecast from active GCAs)
- Wheeling revenue trend: total network charges billed vs collected
- **Value created:** NTCSA capacity planning reports, NERSA transmission investment review

### Esums / O&M Analytics

**Fleet Asset Summary Dashboard:**
- Fleet availability: actual PR% vs OEM guarantee vs REIPPPP threshold (3 lines)
- Site-level performance ranking: all sites ranked by PR (best to worst)
- Asset health distribution: healthy / monitor / intervention needed (donut)
- Generation output: actual MWh vs budget vs modelled P50 (monthly bars)
- O&M cost: spend vs budget by cost category (labour / parts / contractor)
- **Value created:** Owner's engineer reports, lender technical review packs

**Predictive Analytics Intelligence:**
- Anomaly detection rate: how many anomalies flagged vs confirmed failures
- RUL accuracy: predicted vs actual time-to-failure for historical cases
- Fault classification accuracy (model performance — precision/recall per class)
- Savings-vs-NTT: quantified ZAR savings from predictive vs reactive maintenance
- Remaining asset life distribution across fleet (histogram of RUL estimates)
- **Value created:** O&M strategy optimisation, OPEX budget justification

**Revenue Assurance Trends:**
- Revenue leakage trend: ZAR/month by leakage category
- Dispute resolution rate: raised vs resolved vs outstanding
- Meter performance: drift history per meter by site
- **Value created:** Direct ZAR recovery quantification; PPA compliance evidence

### OEM Support Analytics

**Service Level Dashboard:**
- SLA compliance rate: % P1/P2/P3/P4 tickets resolved within SLA
- MTTR trend: Mean Time to Repair by priority and equipment category
- MTBF trend: Mean Time Between Failures (fleet-wide reliability trend)
- Ticket volume by site / equipment type / failure mode
- **Value created:** Contractual KPI reporting, OEM performance benchmarking

**ITIL Analytics:**
- Problem recurrence rate: % of incidents linked to known problems
- Change success rate: % of RFCs implemented without rollback
- Emergency change frequency (should be low — tracks RFC governance maturity)
- **Value created:** ITIL maturity assessment, customer service review

---

## 8C. ESG Value Creation (Per Role)

The platform should be the authoritative source for ESG data at every level.

### ESG Data Model
- **Scope 1:** Direct emissions — diesel gensets on construction sites (IPP), gas turbines (Grid)
- **Scope 2:** Indirect — electricity consumed at offices/operations (all roles)
- **Scope 3:** Value chain — construction materials (IPP), transmission losses (Grid), upstream fuel (all)
- **Social:** Jobs created (IPP ED commitments), community investment (Carbon Fund)
- **Governance:** Board diversity (not in scope), audit trail completeness (SOX-aligned)

### ESG Features Per Role

**IPP Developer ESG Panel:**
- Construction carbon footprint tracker (Scope 1 + 2 during construction)
- ED commitment progress: ZAR spent / jobs created / local content %
- Community benefit fund disbursements
- Export: REIPPPP ED Compliance Report (DMRE format)

**Carbon Fund ESG Panel:**
- Net GHG impact: credits issued (avoided + removed) vs leakage
- Co-benefit tracking: biodiversity, water, livelihoods (Gold Standard co-benefits)
- SDG alignment: which UN Sustainable Development Goals each project contributes to
- Export: GHG Protocol Project Protocol report; Gold Standard Impact Report

**Offtaker ESG Panel:**
- Real-time Scope-2 emissions: market-based (GoO-retired) vs location-based
- Renewable energy % of total consumption
- Water usage intensity (for industrial offtakers)
- Export: CDP Climate disclosure module; GHG Protocol Scope-2 report

**All Roles — TCFD Dashboard:**
- Physical climate risk: exposure of assets to flood / heat / drought (SA-specific)
- Transition risk: carbon price sensitivity analysis on asset valuations
- Governance: board-level oversight of climate risk (links to regulatory chain)
- Export: TCFD-aligned disclosure report (4 pillars: governance / strategy / risk management / metrics)

---

## 8D. SOX-Compliant Reporting

SOX (Sarbanes-Oxley Act Section 302/404) requires reliable financial reporting with internal controls evidence. While the OE Platform operates in South African jurisdiction (Companies Act 71/2008, JSE Listings Requirements for listed entities), the reporting framework should match SOX-grade controls for platforms used by JSE-listed counterparties.

### SOX Controls Built Into the Platform

**1. Segregation of Duties (SoD)**
- Role-based access: IPP Developer cannot approve their own drawdown (Lender approves)
- No single role can both submit AND approve any financial transaction
- Audit log captures: who submitted vs who approved for every financial transition
- Export: SoD matrix report showing which roles can perform which actions

**2. Immutable Audit Trail**
- Every state transition is appended to `oe_audit_logs` — no update, no delete
- Audit entries include: actor_id, role, timestamp, action, reason_code, IP (hashed), prior_state, new_state
- Tamper-evident: SHA-256 hash chaining (each entry includes hash of previous)
- Export: Certified Audit Extract (PDF, signed with report timestamp)

**3. Financial Reporting Controls**
- Every financial amount in the system is traceable to a source document
- Three-way matching: drawdown amount ↔ IE certification ↔ disbursement record
- Variance flagging: any material difference (> ZAR 100k or 1%) between certified and disbursed is flagged
- Export: Three-way Match Report (for external auditors)

**4. Access Controls Report**
- User access log: who logged in, when, from where
- Permission changes: any role assignment change is audited
- Failed access attempts: flagged in security summary
- Export: SOX Access Controls Report (quarterly, per auditor request)

**5. Internal Controls Evaluation**
- Control performance dashboard: all defined controls with pass/fail status
- Exception report: any control test that failed in the period
- Management assertions: sign-off workflow for period-end control attestations
- Export: SOX 302 Control Attestation Pack (management sign-off PDF)

### SOX-Aligned Report Templates

| Report | Use Case | Format |
|---|---|---|
| Audit Trail Export | External auditor review | PDF, tamper-evident |
| SoD Matrix | Internal controls testing | XLSX |
| Three-way Match | Financial audit | PDF + XLSX |
| Access Controls | IT audit | PDF |
| Control Attestation | CEO/CFO sign-off | PDF with signature |
| Journal Entry Testing | GL audit support | XLSX (structured) |
| Material Variance Report | Auditor materiality test | PDF |

---

## 9. Implementation Plan

### Phase 1 — Foundation (3 days)

**Goal:** A working AppShell with the complete design system. No real data — just the structure.

**Deliverables:**
1. Design tokens file (`src/design-tokens.css`)
2. `AppShell` component (sidebar + topbar + content area skeleton)
3. `Sidebar` with all sub-components (SidebarSection, SidebarItem, search, role switcher, user footer)
4. `Topbar` with breadcrumb + notification bell + action buttons
5. `CommandPalette` (⌘K overlay with keyboard nav)
6. `AlertBar` component
7. Core display components: `StatCard`, `StatGrid`, `StatusPill`, `BadgeCount`, `SLACountdown`
8. `DataTable` (sortable, filterable, with row actions — the most-used component)
9. `StateFlow` (horizontal step progress visualization)
10. `Timeline` (audit trail with event types)
11. `ChainLink` + `ChainMap` + `SideDrawer`
12. `AIInsightCard`
13. Full custom SVG icon set (40+ icons in a `<defs>` sprite)
14. `ActionPanel` + basic `TransitionForm`

**Directory structure:**
```
pages/src/ux-alternatives/apex/
  ├── design-tokens.css
  ├── components/
  │   ├── shell/
  │   │   ├── AppShell.tsx
  │   │   ├── Sidebar.tsx
  │   │   ├── Topbar.tsx
  │   │   ├── AlertBar.tsx
  │   │   └── CommandPalette.tsx
  │   ├── display/
  │   │   ├── StatCard.tsx
  │   │   ├── DataTable.tsx
  │   │   ├── StateFlow.tsx
  │   │   ├── Timeline.tsx
  │   │   ├── ChainMap.tsx
  │   │   ├── StatusPill.tsx
  │   │   └── AIInsightCard.tsx
  │   ├── actions/
  │   │   ├── ActionPanel.tsx
  │   │   ├── TransitionForm.tsx
  │   │   └── TransactionForm.tsx
  │   ├── reporting/
  │   │   ├── ReportShell.tsx
  │   │   ├── ReportBuilder.tsx
  │   │   └── ExportToolbar.tsx
  │   └── icons/
  │       └── Icons.tsx  (all 40+ symbols)
  ├── hooks/
  │   ├── useCommandPalette.ts
  │   ├── useChainLinks.ts
  │   └── useSideDrawer.ts
  └── pages/
      (one file per role, one file per feature — built in phases 2–4)
```

### Phase 2 — IPP Developer + Lender (4 days)

Screens:
- `ipp/LaunchBoard.tsx`
- `ipp/project/Schedule.tsx`, `CostEVM.tsx`, `WBS.tsx`, `Documents.tsx`, `DrawingRegister.tsx`
- `ipp/compliance/StageGates.tsx`, `NcrLog.tsx`, `HseIncidents.tsx`
- `ipp/finance/Drawdowns.tsx`, `ProgressClaims.tsx`, `Bonds.tsx`
- `ipp/reports/IPPReports.tsx`
- `lender/LaunchBoard.tsx`
- `lender/portfolio/LoanBook.tsx`, `CreditFacilities.tsx`, `DscrMonitor.tsx`
- `lender/drawdowns/DrawdownRequests.tsx`, `ReserveAccounts.tsx`
- `lender/covenants/CovenantCertificates.tsx`, `CovenantTracker.tsx`
- `lender/risk/SecurityPerfection.tsx`, `LoanTransfers.tsx`
- `lender/reports/LenderReports.tsx`

### Phase 3 — Trader + Carbon + Offtaker (4 days)

Screens:
- `trader/LaunchBoard.tsx` + OrderBook + Positions + VaR + AlgoCert + TradeReporting
- `carbon/LaunchBoard.tsx` + ProjectRegister + MRVVerification + CreditIssuance + ERPA + Article6
- `offtaker/LaunchBoard.tsx` + PPAManagement + TakeOrPay + MonthlyRecon + RECs
- Reports for all three

### Phase 4 — Regulator + Grid + Esums + OEM (4 days)

Screens:
- `regulator/LaunchBoard.tsx` + DispositionInbox + LicenceApplications + Inspections + MYPD + Levies
- `grid/LaunchBoard.tsx` + Nominations + CurtailmentOrders + ConnectionQueue + WheelCharges
- `esums/LaunchBoard.tsx` + AssetHealth + WorkOrders + PMCompliance + PredictiveAnalytics + RevenueAssurance
- `oem/LaunchBoard.tsx` + Incidents + Problems + ChangeRequests + WarrantyClaims + SpareParts
- Reports for all four

### Phase 5 — Reporting System (3 days)

- `ReportBuilder` with all report types
- PDF generation (react-pdf or similar)
- Chart library integration (recharts — lightweight, SSR-compatible)
- Branded report templates for 20+ report types
- XLSX export
- Report history / saved reports

### Phase 6 — Integration and Polish (2 days)

- Wire all pages to existing API endpoints (the 51 Hono route modules)
- Real-time notification system (polling or WebSocket)
- Route registration in App.tsx (new `/apex/*` route tree)
- Role-based routing (each role's sidebar auto-populates from their JWT role)
- Performance: code-split by role, lazy-load charts
- Light QA pass: keyboard navigation, WCAG AA contrast check

---

## 10. Key Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Navigation | Persistent sidebar, collapsible sections | 50+ tabs is unworkable; sidebar scales to any depth |
| Accent colour | Navy-ink (#0b1f3a) | Financial-grade, not AI-purple |
| Typography | DM Sans + JetBrains Mono | DM Sans less generic than Inter; JetBrains for all numbers |
| Icons | Custom 16px SVG set | No emoji, no font glyphs, consistent visual language |
| Active state | Gradient (navy→indigo), white text | Inverted = unambiguous; gradient adds premium depth |
| Feature layout | StateFlow + MetaCard + ActionPanel + ChainMap + Timeline | Every question a user has answered on one page |
| Reports | Branded PDFs via ReportBuilder | Regulatory submissions need official-looking output |
| AI | Inline cards with accept/dismiss | Not tabs, not popups — contextually surfaced |
| Transactions | Embedded multi-step TransactionForm | Not modals — modals lose context; embedded keeps the page alive |
| Charts | Recharts (lightweight) | Minimal bundle; SSR-friendly; sufficient for our chart types |

---

## 11. What Success Looks Like

A user of any role should be able to:
1. Land on their Launch Board and immediately know what needs their attention today
2. Navigate to any feature within 2 clicks (section → item)
3. Open a feature and immediately see its current state, what actions are available, and what the AI recommends
4. Find any item using ⌘K in under 3 keystrokes
5. Export a compliant, branded regulatory report in under 60 seconds
6. See how a chain they're working on connects to chains in other roles — without leaving their current page
7. Complete a full transaction (e.g., approve a drawdown with reason code and document upload) without navigating away
