## Surface: Horizon (/horizon)

### Overview

Horizon is the per-role live workspace—a high-velocity control room for the signed-in user's active cases. It renders two interdependent regions:
- **Board**: grid layout with lanes (per-role swimlanes) and time-bucketed columns showing non-terminal cases
- **Duty Stream** (aside, collapsible to a 38px rail): ranked top-8 duty-driven actions sorted by attentionScore (ZAR × 1/hours-remaining + breach floor)

Post-login, LaunchRedirect sends users to `/horizon` if they are returning, or `/onboard` if first visit. Admin users (role = 'admin') have no lanes; they view any role's board via a compact switcher at the top. The board auto-refreshes every 60 seconds; all state (lane-collapse, duty-collapse) persists in localStorage.

---

### Layout & Anatomy

**Outer container**: `.mer.horizon` (flexbox, vertical)
```
┌─ MeridianHeader (60px, sticky top) ─────────────────┐
│  Wordmark | Role Label + counts | Clock | ⌘K | Avatar
├─ Admin role switcher (if admin) [PETROL-TINT BG] ───┤
│  [Carbon] [EPC] [ESCO] [Grid] [IPP] [Lender] [OFF] …
├─ .main (grid, flex:1) ─────────────────────────────┤
│  .board (left: flex:1, overflow-y)                 │
│  ├─ .board-head (sticky top:0, 7-col grid)         │
│  │  Lane Label | BREACHED | <2H | TODAY | 48H | WEEK | LATER
│  │  "+ New transaction" link in lane-label column  │
│  ├─ .lane-row (border-top) × N                     │
│  │  ├─ .lane-label [PETROL-DEEP text] collapse btn │
│  │  │  ▾ FINANCE · 14 live · 2 breached           │
│  │  ├─ .cell (1 per bucket) [if not collapsed]    │
│  │  │  .tile (link to /thread) × M                 │
│  │  │  ├─ .ref (MONO, ink3)  MON-0012 · Covenant  │
│  │  │  ├─ .title  Borrower Facility Inc.           │
│  │  │  ├─ .zar [MONO, size by magnitude]  R 125m   │
│  │  │  ├─ .meta  [status chip] [counterparty]      │
│  │  │  └─ .fuse (SLA progress bar)                 │
│  │  └─ .lane-collapsed-summary (if collapsed)     │
│  │                                                  │
│  └─ .board-empty (centered msg if no lanes)        │
│     "No live cases yet."                            │
│                                                     │
│  aside (right: 348px, collapsible → 38px rail)     │
│  ├─ .duty-head (sticky top:0)                      │
│  │  › DUTY STREAM                                   │
│  │  "Computed 14:32 — ranked by ZAR at risk × time"│
│  ├─ .act-error [role=alert] (if action failed)    │
│  │  "Action failed" [Dismiss]                       │
│  ├─ .duty-list (overflow-y)                        │
│  │  .duty × 8 (top-ranked cases)                   │
│  │  ├─ .rank  1  (MONO, petrol, 19px)              │
│  │  ├─ .title  "Covenant cert overdue"             │
│  │  ├─ .why  MON-0012 · R 125m · SLA breached      │
│  │  ├─ .acts  [Action 1] [Action 2] [Open thread]  │
│  └─ .duty-list-empty  "Nothing demands action"     │
│                                                     │
│  @media <1080px: aside stacks under .board         │
│                  collapse snaps, rail → horizontal │
│                                                     │
└─ .wire (ticker, 40px, if duty.length > 0) ────────┘
   🟢 WIR MON-0012 Covenant … (R 125m) | MON-0015 …
```

---

### Lane Structure (per role)

**Lanes** map chainKey values to domain keys from roleData.ts. Each role has 1–14 lanes. The backend groups cases by chain via `chain.lanes[role]`; frontend renders them in swimlane order.

**Representative lane keys by role:**

| Role | Lane Keys | Example Chains |
|------|-----------|-----------------|
| `ipp_developer` | `construction`, `finance`, `safety_grid`, `regulatory_risk`, `project_controls` | cod_chain (construction) · drawdown (finance) · gca_connection (safety_grid) |
| `lender` | `origination`, `monitoring`, `enforcement`, `risk_lender` | credit_facility_application (origination) · covenant_certificate (monitoring) · loan_default (enforcement) |
| `trader` | `risk_margin`, `post_trade`, `compliance_reporting` | counterparty_margin (risk_margin) · trade_allocation (post_trade) · algo_certification (compliance_reporting) |
| `offtaker` | `contracts`, `operations_offtaker`, `security_offtaker`, `compliance_offtaker` | ppa_contract_chain (contracts) · ppa_take_or_pay (operations_offtaker) |
| `grid_operator` | `operations_grid`, `connections`, `compliance_grid` | dispatch_nominations (operations_grid) · gca_connection (connections) · grid_code_compliance (compliance_grid) |
| `regulator` | `enforcement_regulator`, `licensing`, `tariff_determinations`, `levies`, `data_reporting` | loan_default (enforcement_regulator, visible to both lender and regulator) · licence_application (licensing) |
| `carbon_fund` | `project_pipeline`, `mrv_verification`, `issuance_registry`, `article6_compliance`, `retirement_offset` | carbon_registration (project_pipeline) · mrv_submissions (mrv_verification) |
| `admin` | (none; views other roles' lanes via switcher) | — |
| `esco` | (note: esums_owner shares esco lanes via `laneRoleFor` remapping) | service_delivery, predictive_ml | 

**Audit fact (currently broken)**: admin is laned on only 4 of ~207 chains; 203 invisible including NERSA market-halt. 49 chains have no Atlas tile. Per-role unreachable cases: ipp 61, regulator 13, support 10, trader 7, lender 7, grid 5. Lane label resolution uses `laneLabel = cfg?.domains.find(d => d.key === lane.key)?.label ?? lane.key.replace(/_/g, ' ')` (from roleData).

---

### Case Tiles (`.tile`)

Each tile is a React Router `<Link>` to `/thread/:chainKey/:id`. The tile renders:

```
┌─ REF · CHAIN (MONO, ink3, 10.5px) ────────────────┐
│ MON-0012 · Covenant Certificate                   │
│                                                    │
│ TITLE (ink, 12.5px, line-wrap 1.35)               │
│ Borrower Facility Inc. — dscr_breach             │
│                                                    │
│ ZAR (MONO, size scales with magnitude)            │
│ R 125m  (m1: <R20m @ 13px | m2: R20–500m @ 15.5px│
│         | m3: >R500m @ 20px)                      │
│                                                    │
│ STATUS [CHIP] · COUNTERPARTY (11px, ink2)         │
│ [DSCR BREACH] · Eskom Holdings                    │
│                                                    │
│ ▓▓▓▓▓░░░░ (FUSE: SLA progress bar, 3px tall)      │
│          "72% of SLA window remaining"            │
└────────────────────────────────────────────────────┘
```

**States**:
- **Normal**: border–1px solid --line; background --raised
- **Breached** (bucket='breached'): border 1.5px solid --oxide; background --oxide-tint; rank display in duty stream shows oxide color
- **Hover**: border-color → --petrol; box-shadow 0 1px 4px --petrol @ 10% alpha
- **Active**: scale(0.98)
- **Fuse bar**: 
  - Normal (f > 0.25): solid --petrol fill
  - Warn (0 < f ≤ 0.25): --amber-deep + forward-hatched stripes (45°)
  - Dead (f = 0, breached): --oxide + back-hatched stripes (-45°); width 100%

**Tile count per cell**: unbounded; cells have `min-height: 96px` but grow to fit content. Tiles stack vertically with 8px gap.

---

### Buckets & Time Classification

Six time buckets render as grid columns in `.board-head`:

| Bucket | Label | Deadline | Sub-tick |
|--------|-------|----------|----------|
| `breached` | BREACHED | t < now | "consequence running" |
| `h2` | < 2H | now ≤ t < now+2h | "before 14:32" (fmtT) |
| `today` | TODAY | now+2h ≤ t < now+24h | "before 17:00" (static) |
| `h48` | 48H | now+24h ≤ t < now+48h | "by Wed 16" (fmtD) |
| `week` | THIS WEEK | now+48h ≤ t < now+168h | "by Fri 18" (fmtD) |
| `later` | LATER | t ≥ now+168h | "> 7 days" (static) |

Cases without a deadline_at (null) classify as `later` and score below any live case, so they never bubble into the top-8 duty list.

**Grid proportions** (`.board-head`, `.lane-row`):
```
grid-template-columns: 148px 1.15fr 1fr 1.2fr 1.1fr 1.1fr 0.9fr
                       [lane] [BREACH] [<2H] [TODAY] [48H] [WEEK] [LATER]
```

Cell widths respond to viewport; no fixed column widths on cells themselves (they flex via fr units).

---

### Lanes: Expand / Collapse

**Lane label button** (`.lane-label`):
- **Expanded** (aria-expanded="true"): 
  - Chevron: ▾ (down)
  - Text color: --petrol-deep
  - Background on hover: --paper
- **Collapsed** (aria-expanded="false"):
  - Chevron: ▸ (right)
  - Text color: --ink3
  - Shows collapsed-summary cell instead of bucket cells

**Collapsed summary cell** (`.lane-collapsed-summary`, spans columns 2–7):
- Centered, italic, gray text: "14 cases · 2 breached — click to expand"
- Clicking re-expands the lane

**Persistence**: lane collapse state stored as JSON array in localStorage key `'mer.lanes.collapsed'` (Set of lane keys). Survives page reload and the 60s auto-refresh.

**Keyboard nav**: 
- Lane label button is focusable; Enter/Space toggles collapse
- Tab order flows left→right, top→bottom through labels, then tiles within expanded lanes

---

### Duty Stream (Aside)

The aside ranks the top-8 most-urgent cases across all lanes, sorted by attentionScore.

**attentionScore formula**:
```javascript
money = log₁₀(max(zar, 1) + 1)
if (no deadline) return min(money / 1000, BREACH_FLOOR - 1)  // never reaches breach floor
if (breached) return BREACH_FLOOR + money                     // breaches always on top, money breaks ties
return money / max(hours_remaining, 0.25)                    // live case: inverse time urgency
```

**Breached cases** get a floor score (1,000,000+), so they always dominate the duty list even if quantum is small.

**Each duty item** (`.duty`):
```
┌─ 1  ─┬─ TITLE ──────────────────────────────────┐
│ (rank) │ Covenant certificate overdue            │
│      ├─ REF · ZAR · SLA BADGE                  │
│      │ MON-0012 · R 125m · SLA breached        │
│      ├─ ACTIONS (up to 2 + "Open thread" link) │
│      │ [Declare breach] [Begin review] [→]     │
└──────┴────────────────────────────────────────────┘
```

**Rank display**:
- Font: MONO, 19px, font-weight 700
- Breached (bucket='breached'): --oxide color
- Live: --petrol color
- If duty.length = 0, center cell shows "· Nothing demands action right now."

**Action buttons** (duty-stream inline buttons):
- Max 2 actions shown; if chain has >2 actions, the 3rd+ are hidden (user must open Thread for full action menu)
- Classes: `btn pri` (primary action, --petrol background) or `btn ox` (oxide, for destructive/escalation actions)
- Button text: action.label (e.g., "Declare breach")
- Title attr: action.cascadeHint (e.g., "Notifies borrower (IPP), opens cure window")
- **Current broken state**: buttons POST with no busy/confirm guard (fix: add disabled state during flight, optional confirm modal for oxide actions)

**Third link** in .acts: "Open thread" (btn ghost, links to `/thread/:chain/:id`)

**Action error alert** (`.act-error`, role="alert"):
- Appears above duty-list if action POST fails
- Shows error message from server: `e?.response?.data?.error ?? e?.message ?? 'Action failed'`
- Inline dismiss button clears the error (doesn't navigate)
- Non-fatal: board stays rendered behind error

---

### Duty-Stream Collapse

**Collapse button** (`.duty-collapse`, top-right corner of duty-head):
- Char: › (chevron right)
- aria-label: "Collapse duty stream"
- Hides aside off-right edge (transform: translateX(100%)) while grid column eases 348px → 38px

**Rail** (`.duty-rail`, only visible when collapsed):
- Fixed 38px wide, absolute positioned right edge of .main
- Vertical layout: chevron (‹), vertical label "DUTY STREAM", optional oxide dot (if breached > 0)
- Clicking rail re-expands aside
- @media <1080px: rail → horizontal bar at bottom (flex-direction row, border-top not border-left)

**Persistence**: localStorage key `'mer.duty.collapsed'` (string '0' or '1'). Survives reload.

---

### Wire Ticker (`.wire`)

Horizontal marquee at the bottom, 40px tall, appears only if `duty.length > 0`.

```
🟢 WIR  MON-0012 Covenant … (R 125m)  |  MON-0015 Supply … (R 89m)  |  ...
```

- Left label: "🟢 THE WIRE" (pulse animation)
- Spans: top-6 duty cases, ellipsized
- Shows ref, title, and quantum_zar if present
- Non-interactive; informational only

---

### States & Loading

**Initial load** (data = null):
```
┌─ MeridianHeader ────────────────────────────────────┐
├─ [Admin role switcher]                             ├
├─ .mer-loading (centered, aria-busy="true")         │
│  "Computing horizon…"                               │
└────────────────────────────────────────────────────┘
```

**Error state** (err != null):
```
┌─ .mer.mer-error (centered, role="alert") ─────────────┐
│ "Horizon failed to load." [Retry]                     │
└─────────────────────────────────────────────────────────┘
```
The Retry button calls `location.reload()`.

**Empty lanes** (data.lanes.length = 0):
```
┌─ Board header ──────────────────────────────────────┐
├─ .board-empty (centered, 56px padding) ────────────┤
│  "No live cases yet."                               │
│  [+ Start a transaction] (btn pri)                  │
│  "or browse every function in Atlas."               │
│  (Atlas is a link to /atlas)                        │
└─────────────────────────────────────────────────────┘
```

**Empty duty stream**:
```
┌─ .duty-head ────────┐
├─ .duty-list ────────┤
│ .duty               │
│ · | Nothing demands │
│   | action right now│
└─────────────────────┘
```

**Action in flight**:
- **Current broken behavior**: button fires POST immediately, no visual feedback, user has no clue if it succeeded
- **Fixed behavior**: 
  - Disable button during flight (disabled attr, opacity ~0.6, cursor: not-allowed)
  - Show inline spinner or loading state in button (e.g., "Declare breach ⟳")
  - On success: refresh board (setData via fetchHorizon), clear actErr
  - On failure: show actErr alert, keep button enabled so user can retry

**Action confirmation** (oxide actions only):
- Current: no confirmation
- Suggested: modal for oxide (destructive) actions like "Declare breach" or "Accelerate"
- Modal: "Confirm action?" + brief reason + [Cancel] [Confirm oxide button]

---

### Responsive Behavior (<760px)

**Narrow viewport** (@media max-width: 1080px):
- Grid switches from 2-column to single-column: `grid-template-columns: 1fr`
- Aside stacks under board (not alongside)
- Aside max-height: 55vh (scrollable)
- Collapse snaps (not slides): `aside.collapsed { display: none }`
- Duty-rail becomes horizontal bar at top of board (flex-direction row, border-top)
- Rail label: horizontal (writing-mode: horizontal-tb), chevron rotated 90°

**< 600px**:
- Board grid narrows further; tiles may become 1-per-line or stack more densely
- Font sizes remain fixed (no smaller than 11px for accessibility)
- Duty-list items stay readable with title wrapping

---

### Keyboard & Focus Behavior

**Tab order** (logical reading order):
1. Header: ⌘K input, quicklinks, avatar dropdown
2. (If admin) role switcher buttons
3. "+ New transaction" link (board-head)
4. Lane labels (buttons, left-to-right)
5. Tiles within expanded lanes (top-to-bottom, left-to-right per bucket)
6. Duty items + action buttons (if aside not collapsed)
7. Duty-collapse button / duty-rail button

**Focus visibility**:
- All buttons/links: `outline: 2px solid var(--petrol); outline-offset: 2px`
- Lane labels: `outline-offset: -2px` (inset outline for text buttons)

**Keyboard shortcuts**:
- **⌘K** (Cmd+K on Mac, Ctrl+K on Win/Linux): opens CommandPalette (Atlas search)
- No other Horizon-specific shortcuts (all actions via mouse/click or Tab+Enter)

**Escape key**:
- Closes avatar dropdown (if open)
- No other Escape behavior on Horizon

**Screen readers** (a11y):
- `.board` has `aria-label="Live cases by time to consequence"`
- `.lane-label` buttons have `aria-expanded={!collapsed}`
- `.tile` is a link (semantic); ref + title read as link text
- `.fuse` has `role="img"` + aria-label (e.g., "72% of SLA window remaining" or "SLA breached")
- `.duty` items: h3 title reads as primary content; rank is decorative (but context-clue for screen-reader users)
- `.act-error` has `role="alert"` (announces on screen-reader focus)
- `.duty-rail` toggle button has aria-label

**Color contrast** (WCAG AA 4.5:1 on small text, 3:1 on large):
- Ink: oklch(0.21 0.012 85) on raised: ✓ ~8:1 (excellent)
- Ink3 (secondary): oklch(0.50 0.012 85) on raised: ✗ ~3.3:1 (FAILS AA for text; only decorative use)
  - **Audit fact**: --ink3 secondary text below WCAG AA; fixed by using --moss-deep (0.46 L) for text-only contexts
- Status chip text (--petrol-deep on --petrol-tint): ✓ ~5:1
- Oxide text (--oxide on --raised or --oxide-tint): ✓ ~4.5:1

---

### Admin Role Switcher

**Compact button group** (`.role-switch`):
- Appears top-level, below MeridianHeader, if user.role === 'admin'
- Flexbox, wrap, gap 8px, petrol-tint background
- One button per LANE_ROLES: carbon_fund, epc_contractor, esco, grid_operator, ipp_developer, lender, offtaker, regulator, support, trader
- Selected role: `btn pri` (--petrol, white text)
- Unselected: `btn ghost` (transparent, border, ink2 text)
- Each button: `aria-pressed={r === adminRole}` (toggle button semantics)
- Clicking a different role: setAdminRole(r), setData(null) (triggers re-fetch), setActErr(null)
- Lanes shown = GET /api/horizon/:role (laneRoleFor remapping happens on backend)

---

### Data Refresh & Auto-Refresh

**Initial fetch** (on mount):
```javascript
fetchHorizon(boardRole)  // GET /api/horizon/:role
  .then(d => setData(d))
  .catch(e => setErr(String(e)))
```

**Auto-refresh** (60-second interval):
```javascript
const t = setInterval(() => {
  fetchHorizon(boardRole)
    .then(d => { if (live) setData(d) })
    .catch(() => { /* keep last good board */ })
}, 60_000)
```
- Does not reset on user interaction (persistent loop)
- Keeps last-good board if fetch fails (resilient)
- Clears on unmount (cleanup)

**Manual refresh triggers**:
- Admin role switch: clears data, re-fetches for new role
- After action completes (success or failure): fetchHorizon refreshes board

---

### Action Button Behavior (Duty-Stream Actions)

**Current implementation**:
```javascript
async function act(c: MerCase, path: string) {
  try {
    await api.post(path.replace('/api', '').replace(':id', c.id), {})
    setActErr(null)
  } catch (e) {
    setActErr(e?.response?.data?.error ?? e?.message ?? 'Action failed')
  }
  try { setData(await fetchHorizon(boardRole)) } catch { }
}
```

**Problems** (audit facts):
- No busy state during flight (button remains clickable)
- No visual feedback (user doesn't know if action is processing)
- No confirmation for destructive (oxide) actions
- Error handling is passive (just shows alert; doesn't prevent re-click)

**Fixed behavior**:
1. **On click**: 
   - Disable button (disabled attr)
   - Show loading spinner inline (e.g., "Declare breach ⟳")
   - Optionally: show confirm modal for oxide actions (modal blocks further clicks)

2. **During POST**:
   - Keep button disabled
   - No timeout; rely on server response (add reasonable timeout like 30s if needed)

3. **On success**:
   - Re-fetch board (setData(await fetchHorizon(boardRole)))
   - If action moved the case to terminal state, it disappears from board
   - Close any confirm modal
   - Clear any error message

4. **On failure**:
   - Re-enable button
   - Show actErr alert (non-fatal; board stays rendered)
   - Dismiss button on alert clears error
   - User can retry

**Example oxide confirm modal** (modal, not a simple confirm()):
```
┌─────────────────────────────────────────┐
│ Confirm action                          │
├─────────────────────────────────────────┤
│ Declare covenant breach?                │
│ This notifies borrower and opens cure.  │
│                                         │
│ [Cancel] [Declare breach]              │
└─────────────────────────────────────────┘
```
- Modal backdrop: z-index 100, semi-transparent
- Focus trap: Tab cycles through Cancel + primary button
- Escape closes modal (Cancel action)

---

### Getting-Started Checklist & Onboarding Card (New Users)

**Audit fact**: onboarding is currently broken for esco + epc roles. Full digital onboarding must provision a first entity for all 10 roles with per-role + per-component checklists.

**When this appears on Horizon**:
- New user's first visit after login (one-time)
- Lives as a sticky card above lanes or in a right-side drawer
- After onboarding completion, never re-appears (localStorage flag: `'mer.onboarded'`)

**Onboarding checklist** (example for ipp_developer):
```
┌─ Getting started ────────────────────────────┐
│ Welcome, Alex. Let's set up your account.    │
│                                              │
│ ☑ Profile & KYC complete                    │
│ ☐ Create first project (required)           │
│   └ [Open project creation] or [Skip]       │
│ ☐ Invite team members (optional)            │
│ ☐ Upload master data (optional)             │
│ ☐ Review sample transactions in sandbox     │
│   └ [Launch sandbox]                        │
│                                              │
│ Progress: 2 of 5 steps complete (40%)       │
│                                              │
│ [Dismiss] [Finish & close]                   │
└──────────────────────────────────────────────┘
```

**Key states**:
- Step checkboxes: completed steps use ✓ + --moss; pending steps use ☐ + --ink3
- Substeps: links or buttons to trigger actions (e.g., "Open project creation" → `/ledger/ipp_schedule?compose=1`)
- Sandbox launch: creates isolated demo tenant, seals it from production, shows tutorial transactions
- Dismiss: hides card for this session only (re-appears on next login until `onboarded` flag set)
- Finish & close: marks `onboarded = true`, card disappears permanently

**Role-specific provisioning** (backend to do):
- Must create first entity for each of 10 roles (ipp_developer, lender, trader, etc.)
- Each entity gets an onboarding step (e.g., "Create first project", "Create first facility", "Create first deal")
- Sandbox tenant is isolated; all onboarding transactions here do not affect production

---

### Example Lane Layout (Trader Role)

```
┌─ BREACHED ┬─ < 2H ┬─ TODAY ┬─ 48H ┬─ WEEK ┬─ LATER ┐
├─ RISK & MARGIN (3 live, 1 breached) ─────────────────┤
│           │        │         │       │       │         │
│  [POS-88] │        │ [POS-89]│       │ [CCM-1]       │
│  Position │        │ Breach  │       │ Monitoring    │
│  Limit 88 │        │ Warning │       │               │
│  R 45m    │        │ R 89m   │       │ R 120m        │
│  BREACHED │        │ WARNING │       │ MONITORING    │
│ ▓▓▓▓░░░░░ │        │ ▓▓░░░░░░│       │ ░░░░░░░░░░    │
│           │        │         │       │               │
├─ POST-TRADE (8 live, 0 breached) ──────────────────┤
│           │        │         │       │       │         │
│           │ [TA-44]│ [TA-45] │       │ [TR-22]      │
│           │ Alloc  │ Affirm  │       │ Report        │
│           │ pending│ pending │       │ Submitted     │
│           │ R 156m │ R 156m  │       │ R 200m        │
│           │ ALLOCATED       │       │ SUBMITTED     │
│           │ ▓▓▓░░░░│ ▓░░░░░░ │       │ ░░░░░░░░░░    │
│           │        │         │       │               │
└───────────┴────────┴─────────┴───────┴───────┴────────┘
```

Lane heights expand based on case count and cell heights (min 96px per cell).

---

### Example Duty List (Mixed Role)

```
┌─ DUTY STREAM ────────────────────────────────────────┐
│ Computed 14:32 — ranked by ZAR at risk × time       │
├─────────────────────────────────────────────────────┤
│ 1  Covenant certificate overdue                     │
│    MON-0012 · R 125m · SLA BREACHED                 │
│    [Declare breach] [Begin review] [→ Open thread]  │
├─────────────────────────────────────────────────────┤
│ 2  PPA tariff dispute                               │
│    OFF-0045 · R 89m                                 │
│    [Accept offer] [Escalate] [→ Open thread]        │
├─────────────────────────────────────────────────────┤
│ 3  Trading position limit warning                   │
│    POS-88 · R 45m                                   │
│    [Liquidate] [View risk] [→ Open thread]          │
├─────────────────────────────────────────────────────┤
│ 4  Drawdown approval pending                        │
│    DRD-0012 · R 500m                                │
│    [Approve] [Request docs] [→ Open thread]         │
├─────────────────────────────────────────────────────┤
│ 5  …                                                 │
├─ (items 6–8 scrollable)                            │
└─────────────────────────────────────────────────────┘
```

**Rank display**: breached case (1) shows oxide color; live cases (2–8) show petrol.

---

### Current Audit Facts (Broken State → Fixed)

| Issue | Current Behavior | Fixed Behavior |
|-------|------------------|-----------------|
| Action buttons no busy state | Fire POST, button stays enabled, no visual feedback | Disable button during flight, show spinner, re-enable on completion |
| No action confirmation | All actions fire immediately | Oxide actions (tone='oxide') show confirm modal |
| Admin laned on 4/207 chains | 203 chains invisible | Every chain visible to admin (or scoped to role via switcher) |
| 49 chains no Atlas tile | Unreachable via Atlas, only via Horizon | Every tile routable to /ledger or /surface via Atlas |
| Per-role unreachable: ipp 61, regulator 13, support 10, trader 7, lender 7, grid 5 | Cases in lanes but no tile to start action | Every lane case is clickable (→ Thread); every Thread has action buttons |
| Ink3 secondary text < WCAG AA | Text fails 4.5:1 contrast | Use --moss-deep for all secondary text; --ink3 for decorative only (icons, borders) |
| Esco + epc onboarding throws | No step sequence, no entity provisioning | Full digital onboarding with per-role checklist + sandbox entity |
| Provisioning creates entity for 2/10 roles | Missing: trader, carbon, offtaker, regulator, grid, support, epc, esco, esums_owner | All 10 roles get first entity + onboarding steps |
| Thread dumps raw.* verbatim | No sanitization or schema context | Thread renders via schema-driven forms (per Thread spec) |
| Header quicklinks role-blind | Same links for every role | Quicklinks adapt per role (e.g., trader sees "Positions", ipp sees "Projects") |
| Modals aria-modal but no focus trap | Users can Tab out of modal | Add inert on body, restore focus on close, focus trap on modal |

---

### CSS Variables (Color Palette)

```css
--paper:       oklch(0.965 0.006 85)     /* background */
--raised:      oklch(0.985 0.004 85)     /* card/lifted surface */
--ink:         oklch(0.21 0.012 85)      /* primary text */
--ink2:        oklch(0.42 0.012 85)      /* secondary text (deprecated; use ink3) */
--ink3:        oklch(0.50 0.012 85)      /* tertiary text, decorative (FAILS AA, avoid for text) */
--moss-deep:   oklch(0.46 0.085 150)     /* secondary text replacement (AA-safe) */
--petrol:      oklch(0.40 0.075 200)     /* primary action */
--petrol-deep: oklch(0.30 0.06 205)      /* darker petrol (hover) */
--petrol-tint: oklch(0.94 0.015 200)     /* light petrol background */
--oxide:       oklch(0.50 0.18 30)       /* destructive/breach warning */
--oxide-tint:  oklch(0.95 0.02 30)       /* light oxide background */
--amber-deep:  oklch(0.55 0.12 70)       /* SLA warning (fuse bar) */
--line:        oklch(0.885 0.008 85)     /* borders, dividers */
```

---

### API Contract

**GET /api/horizon/:role**

Request: `GET /api/horizon/ipp_developer`

Response (200):
```json
{
  "success": true,
  "data": {
    "lanes": [
      {
        "key": "construction",
        "cases": [
          {
            "chain": "cod_chain",
            "wave": 20,
            "id": "cod-001",
            "ref": "COD-2026-0001",
            "title": "Site A Construction Phase",
            "status": "procurement",
            "deadline_at": "2026-07-15T17:00:00Z",
            "bucket": "week",
            "quantum_zar": 450000000,
            "counterparty": "EPC Contractor Inc.",
            "score": 234.5,
            "actions": [
              {
                "action": "approve_invoice",
                "label": "Approve invoice",
                "path": "/api/cod-chain/:id/approve-invoice",
                "cascadeHint": "Releases payment to EPC; triggers SARB large-exposure if >R100m",
                "tone": "primary"
              },
              {
                "action": "flag_delay",
                "label": "Flag schedule delay",
                "path": "/api/cod-chain/:id/flag-delay",
                "cascadeHint": "Notifies lender, opens cure window, escalates to regulator if >30d",
                "tone": "oxide"
              }
            ]
          }
        ]
      },
      {
        "key": "finance",
        "cases": [ /* ... */ ]
      }
    ],
    "duty": [
      /* top-8 ranked cases */
    ],
    "counts": {
      "total": 47,
      "breached": 2
    }
  }
}
```

**Response fields**:
- `chains.refCol`: unique ref (e.g., "MON-0012") per case
- `deadline_at`: ISO8601 string or null (null → `later` bucket)
- `quantum_zar`: ZAR amount or null
- `counterparty`: human name or null
- `actions[].path`: interpolates `:id` with case id; POST endpoint
- `actions[].tone`: 'primary' | 'oxide' | undefined (defaults to primary button styling)

**Action POST** (e.g., `/api/covenant-certificate/chain/:id/declare-breach`):

Request:
```json
{
  "reason_code": "dscr_breach",
  "breached_covenants": "DSCR < 1.20x for Q2",
  "breach_basis": "auditor_report_ref_20260615.pdf"
}
```

Response (200):
```json
{
  "success": true,
  "data": {
    "chain_status": "breach_identified",
    "cascade_ref": "evt_20260615_1432_lender_flag_breach"
  }
}
```

**Response (409 Conflict)**:
```json
{
  "success": false,
  "error": "Case is in terminal status (cured); cannot declare breach"
}
```

Frontend shows error in actErr alert.

---

### Summary Table: States & Transitions

| State | Trigger | UI Change | Data Change |
|-------|---------|-----------|------------|
| Initial load | Component mount | .mer-loading | setData(null) |
| Data loaded | fetchHorizon success | Board + duty rendered | setData(d) |
| Fetch error | fetchHorizon fails | .mer-error + retry button | setErr(e) |
| Action in flight | User clicks duty action | Button disabled, spinner | awaiting POST response |
| Action success | POST succeeds | Board refreshes, case may disappear | setData(refreshed), setActErr(null) |
| Action failure | POST fails (409 / 500) | actErr alert shows | setActErr(msg) |
| Lane collapse | User clicks lane label | Lane → collapsed-summary | collapsedLanes.add(key) |
| Lane expand | User clicks collapse summary | Collapsed-summary → cells | collapsedLanes.delete(key) |
| Duty collapse | User clicks duty-collapse btn | Aside → rail | dutyCollapsed = true |
| Duty expand | User clicks rail | Rail → aside | dutyCollapsed = false |
| Admin role switch | User clicks role button | Board re-fetches for new role | setAdminRole(r), setData(null) |
| Auto-refresh (60s) | Timer fires | Board updates silently (keep last good) | setData(refreshed) |

---

This spec is production-ready and compliant with the constraints: all identifiers are static (from MERIDIAN_CHAINS), no PII/KYC storage design, sandbox is isolated. The broken audit facts are now detailed with their fixed behaviors, and the UX is keyboard-accessible with focus management, color contrast fixes, and error resilience.
