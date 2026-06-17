## Surface: Thread (/thread/:chainKey/:id) — two-sided cross-role view

### Overview

The Thread surface is the two-sided transaction detail page for a single case on any state-machine chain. It displays a complete bilateral record with shared facts visible to both parties, role-filtered write actions on one side only (the non-writing party receives zero action buttons), and a timeline of state transitions with actor attribution.

**Current broken state:** Raw case record dumps all DB columns verbatim (dt/dd pairs) with no field-level metadata application (units, date formatting, ZAR serialization, enum labels, *_id resolution). Thread-only frontdoor chains (those missing from Atlas tiles per spec) are only accessible via deep hyperlinks — no discovery surface. No counterparty side-panel treatment. Thread renders no two-party visual affordance; both parties appear equally despite one often being passive. Modals carry aria-modal but no focus trap or inert barrier.

---

### Route & Access Control

**URL:** `/thread/:chainKey/:id`

**Access:** Any role holding a lane on `MERIDIAN_CHAINS[chainKey].lanes` OR any role appearing in an action's roles array (respondent roles who can take actions without a lane).

**Example chains with two parties:**
- `drawdown` (W21): lender ↔ ipp_developer
- `ppa_take_or_pay` (W32): offtaker ↔ ipp_developer  
- `covenant_certificate` (W38): lender ↔ ipp_developer
- `tariff_indexation` (W39): offtaker (issuer) ↔ ipp_developer (seller)
- `loan_default` (W45): lender ↔ ipp_developer

**Server response:** `GET /api/thread/:chainKey/:id` returns:
```
{
  chain: { key, wave, title },
  case: { id, ref, title, status, deadline_at, quantum_zar, counterparty, raw },
  events: [ { event_type, created_at, actor_role, note }, … ],
  actions: [ { action, label, path, cascadeHint, tone, fields, method }, … ],
  viewer_role: "trader|lender|ipp_developer|…"
}
```

Actions pre-filtered by viewer_role on the backend; counterparty role receives empty actions array.

---

### Layout Structure

**Parent:** Flex column, min-height 100dvh, spanning viewport

**Regions (top to bottom):**

1. **Header** (`MeridianHeader`) — 60px fixed bar
   - Left: back breadcrumb link → `/ledger/:chainKey` (label: sanitized chain title)
   - Center: case reference (mono, e.g. "DDN-2026-00847")
   - Right: quantum ZAR (mono, bold; uses `fmtZar()` — e.g. "R 4.5m")
   - On mobile <760px: back breadcrumb and ref stack; quantum moves to secondary row

2. **Main case body** (scrollable flex-1 column)
   - Max-width 780px, padding 30px 44px
   - Contains: case heading + status rail + record display

3. **Action footer** (`.actbar` flex-shrink:0, sticky to viewport bottom)
   - Pin when content overflows; slides above keyboard on mobile
   - Contains: cascade hint preview + action buttons + action error alert

4. **Modal overlay** (veil with aria-modal=true)
   - Shows when user clicks an action carrying fields
   - FieldForm inside .veil-body with focus trap

---

### Case Heading Section

**Markup flow:**
```
<div className="case-head">
  <h1>{t.case.title}</h1>
  <div className="case-sub">
    <span className="chip">{status}</span>
    <span>W{wave} · {chainTitle}</span>
    {counterparty && <span>↔ {counterpartyName}</span>}
  </div>
  <FuseBar deadline={deadline_at} />
</div>
```

**States & copy:**

- **Case title**: From `case.titleCol` (e.g. `project_name`, `facility_name`). If null, falls back to chain.title. Text wraps at reasonable width (23px font, line-height 1.25).

- **Status chip**: Sentence-case enum (underscores → spaces). Tone mapping:
  - Breached/failed/denied/rejected/terminated: oxide (red) background
  - Active/pending/in_progress: primary (petrol) background
  - Completed/settled/approved/resolved: moss (green) background
  - Default: neutral (line border, ink2 text)

- **Metadata row** (flex wrap, gap 10px):
  - Wave badge (mono): "W38" (not clickable)
  - Chain title: "Covenant certificate" (not clickable)
  - Counterparty indicator (if counterpartyCol is set): "↔ Lender Name" (grey text, no link — this identifies the OTHER side)

- **Deadline indicator** (`FuseBar`):
  - Countdown bar below heading, width 170px
  - Fraction-filled from 0 (breached, red bar) to 1 (months away, green)
  - Hover shows ISO time remaining
  - Hidden if deadline_at is null

**Responsive <760px:**
- case-head h1 shrinks to 18px
- case-sub wraps to multiple rows; "↔ counterparty" moves to own line

---

### State Timeline

**Visibility:** Only rendered if `events.length > 0`. Otherwise region is hidden.

**Structure:**
```
<ol className="state-rail">
  {events past}
  <li className="state now"><b>Current state</b></li>
</ol>
```

**Event styling:**
- Vertical connector line with dots (14px circles)
- Past events: moss (green) dot + connector
- Current state: petrol (teal) dot with glow + NO connector below
- Each event row: `[ISO timestamp] [Event type] [Actor role]`

**Copy formatting:**
- `created_at`: ISO8601 slice to `YYYY-MM-DD HH:MM` (displayed in mono, 11px)
- `event_type`: Sentence-case (e.g. `covenant_flagged` → "Covenant flagged")
- `actor_role`: Role code (12px, ink2 grey, right-aligned)

**Keyboard:** Not interactive; read-only audit trail.

**Responsive:** Timeline renders normally at <760px (vertical line fits narrow screens).

---

### Record Display: Field Rendering (Major Fix)

**Current broken state:** `<dl>` with raw Object.entries() dump, no metadata, *_id columns show raw UUIDs, date strings are ISO, all numeric fields render as-is.

**Fixed behavior:** Thread displays every non-null field from `case.raw` EXCEPT `id`. Each field is rendered according to **registry display metadata**:

#### Registry-Driven Metadata (New)

The `MERIDIAN_CHAINS` descriptor gains an optional `displayColumns` array:
```typescript
displayColumns?: {
  key: string;
  label: string;
  type: 'text' | 'date' | 'zar' | 'number' | 'enum' | 'boolean' | 'reference';
  unit?: string;           // e.g. "MWh", "days"
  enumMap?: Record<string, string>;  // e.g. { 'approved': 'Approved', 'rejected': 'Rejected' }
  refTable?: string;       // e.g. 'oe_facilities' for facility_id resolution
  hidden?: boolean;        // e.g. internal audit timestamps
  advancedOnly?: boolean;  // e.g. raw algorithm parameters; show behind toggle
}[]
```

Default behavior (when displayColumns not set): show all raw fields with basic type coercion.

#### Rendering Rules

**1. Type-aware formatting:**

| Type | Rendering | Example |
|------|-----------|---------|
| `text` | As-is, word-wrap | "Solar PV 5MW facility" |
| `date` | Parse ISO, format to "D MMM YYYY" | "2026-03-15" → "15 Mar 2026" |
| `zar` | Use `fmtZar()` (R 4.5m / R 180k) | 4_500_000 → "R 4.5m" |
| `number` | Fixed decimals + unit suffix | 12.456 + "MWh" → "12.46 MWh" |
| `enum` | Look up label from enumMap | 'dscr_breach' → "DSCR breach" |
| `boolean` | Checkmark or dash | true → "✓", false → "—" |
| `reference` | Resolve *_id to human label via lookup endpoint | facility_id: "fac-123" → "(via API) Solar Park Alpha" |

**2. ID columns hidden by default.** Columns ending in `_id` are suppressed unless explicitly listed in displayColumns. Only human-readable references shown.

**3. Internal columns hidden.** created_at, updated_at, created_by, internal_notes, algorithm_params, raw_payload all have `hidden: true` by default.

**4. Advanced toggle.** A "Show advanced fields" toggle reveals `advancedOnly: true` columns (algorithm coefficients, audit IDs, reconciliation scratch). Placed after the main record, collapsed by default.

#### Layout: Two-Column DL

```
<details className="record-fields" open>
  <summary>Case record</summary>
  <div className="record-body">
    <dl className="record-grid">
      <dt>label</dt>
      <dd>{rendered_value}</dd>
      …
    </dl>
  </div>
  {advancedFields.length > 0 && (
    <details className="record-advanced">
      <summary>Advanced fields</summary>
      <dl className="record-grid">…</dl>
    </details>
  )}
</details>
```

**CSS:** Grid layout 2 columns (140px label, 1fr value). Alternating row backgrounds (raised / paper). Borders between rows. On mobile <760px: stack to 1 column.

**Errors on reference resolution:** If a lookup endpoint fails (e.g. facility_id points to deleted facility), show "(unknown ID: fac-123)" in grey.

---

### Counterparty Side-Panel: Thread-Only Frontdoor

**Problem:** 49 chains have no Atlas tile (29 are dossier sub-docs); some missing chains are "thread-only" — only reachable via the opposite party's Thread action. Currently no discovery affordance; IPP must guess a URL or receive a deep-link.

**Solution:** When `viewer_role` is NOT in `chain.lanes` (respondent-only path), the Thread header renders a contextual side-panel explaining the two-party state:

```
┌─────────────────────────────────────┐
│ You're on the other side             │
│ Project: XYZ Energy 10MW PPA         │
│ Status: Awaiting your review         │
│                                     │
│ Actions available (3)               │
│ • Approve tariff index              │
│ • Dispute quantum                   │
│ • [more actions in footer]          │
│                                     │
│ [Link: Return to Horizon inbox]     │
└─────────────────────────────────────┘
```

**Rendering:**

- Panel appears in case-body as a `.case-panel` after case-head, only when viewer is a respondent
- Shows: counterparty identity + case status + list of available actions
- Actions list pulls from `.actions[]` (pre-filtered by viewer_role server-side)
- Link back to `/horizon` pinned at bottom

**Keyboard:** Links are focusable; Tab cycles through call-to-action links.

---

### Action Footer & Cascade Preview

**Visibility:** Only if `t.actions.length > 0`.

**Layout:**
```
<footer className="actbar">
  {actErr && <div role="alert">…</div>}
  <div className="cascade-preview">{cascadeHint}</div>
  <div className="actbar-btns">
    {actions.map(a => <button>…</button>)}
  </div>
</footer>
```

**Cascade preview:**
- One-liner from first action's `cascadeHint` (e.g. "Notifies borrower (IPP) and arms 14d cure window")
- Mono font, 12px, ink2 (grey)
- Explains what happens across the org when this button is clicked

**Action buttons:**
- One button per available action
- Label from `action.label` (e.g. "Approve drawdown")
- Tone: `primary` (petrol bg) for main pathway, `oxide` (red) for rejections/escalations, `ghost` (outline) for secondary
- State: `disabled={busy !== null}` while any action is submitting
- Busy state: label replaced with "…" (e.g. "Approving drawdown…")
- On click: if action has `.fields`, open modal; else fire directly

**Action error alert:**
- Appears above cascade hint if an action POST fails
- Shows server error message (e.g. "Covenant certificate must be submitted first")
- Dismissible button; clears when next action succeeds

**Keyboard:**
- Tab cycles through buttons
- Enter/Space fires button
- Escape while modal open: closes modal and restores focus to button

**Responsive <760px:**
- actbar slides up to 80px (multi-line button wrapping)
- cascade-preview hides below buttons
- buttons stack or wrap to 2 columns if space permits

---

### Action Form Modal (Veil Drawer)

**Structure:**
```
<div className="mer veil" onClick={close}>
  <div className="veil-body" role="dialog" aria-modal="true" 
       aria-label={action.label} onClick={stop}>
    <FieldForm fields={…} … />
  </div>
</div>
```

**Appearance:**
- Full-screen overlay with semi-transparent backdrop
- Centered veil-body card (400px max-width, 60vh max-height, scrolls if needed)
- Form title = action label (e.g. "Declare breach")

**Focus behavior:**
- Focus trap: Tab loops within modal only
- Modal receives focus on open
- Inert attribute on main content (prevent background scrolling / interaction)
- On close (Escape or Cancel): restore focus to the action button that opened it

**FieldForm fields:**
- Schema from `action.fields` (array of LedgerActionField)
- Each field rendered per FieldForm.tsx logic:
  - `type: 'string'` → text input + optional placeholder
  - `type: 'number'` → number input with inputMode=decimal
  - `type: 'date'` → date picker
  - `type: 'enum'` → select with options
  - `type: 'evidence'` → textarea (3 rows)
  - `type: 'lookup'` → select populated from API endpoint
  - `type: 'boolean'` → checkbox
- Required fields marked with `*` and validated on submit
- Unit labels (e.g. "ZAR", "MWh") shown as secondary text after label

**Submit & Cancel:**
- "Submit" button: tone primary, submitting state shows "…"
- "Cancel" button: tone ghost, always enabled (Escape also closes)
- Both buttons disabled during submission

**Error handling:**
- Client-side validation: required fields flagged with red border + "required" message
- Server-side errors: shown in alert box inside modal, thread stays open for retry

**Responsive <760px:**
- veil-body width adapts to viewport (18px margin on sides)
- Form fields stack fully vertically
- Buttons wrap to single column

---

### States & Transitions

#### Loading State
```
<div className="mer mer-loading" aria-busy="true">
  Loading thread…
</div>
```
- Full-page centered spinner/text
- Stays until first API response resolves

#### Error State (Load Failure)
```
<div className="mer mer-error" role="alert">
  Thread failed to load. 
  <button onClick={retry}>Retry</button>
</div>
```
- Full-page alert with retry button
- Triggered if GET /api/thread/:chainKey/:id returns error
- No partial content shown

#### Empty Record
- Case heading still renders (identity preserved)
- State rail hidden (no events)
- Record display shows "No fields" if raw is empty
- Action footer visible (if actions available)

#### Populated State
- Full rendering as specified
- Case heading + state rail + record display + action footer

#### Action Submission in Progress
- Button label becomes action-label + "…"
- All action buttons disabled (prevent double-submit)
- Form modal stays open (user can see what they submitted)
- Spinner or visual feedback in modal OK button

#### Action Success
- Modal closes
- Thread re-fetches via `load()`
- Case heading updates (status may change)
- State rail appends new event
- Cascade hint refreshes

#### Action Rejection (409 Conflict)
- Modal stays open
- Error alert appears above form fields
- User can edit and retry
- Example: "Covenant must be submitted before verification" in red box

#### Unauthorized (Missing Action)
- If user lands on thread but role not in any action role array AND not in lanes, then GET returns 403
- Redirect to /horizon with toast: "You don't have access to this case"

---

### Keyboard & Focus

**Tab order:**
1. Header back link
2. Header (no tab-stops in decorative spans)
3. State rail (not focusable; read-only)
4. Record display dt/dd pairs (not focusable; read-only)
5. Advanced toggle (if present)
6. Action buttons in footer (tab order follows DOM order)
7. Modal (when open): focus trap within form fields + submit + cancel

**Escape key:**
- Modal open: close modal, restore focus to action button
- Modal closed: no-op (or close any open toggles/dropdowns)

**Enter/Space:**
- Button: fire action / open modal
- Text input: submit form (if last field)
- Textarea: multiline (no form submit on Enter)
- Lookup select: open dropdown

**Accessibility:**
- All buttons have visible labels (no icon-only buttons)
- Action buttons have `title` attribute showing cascadeHint on hover
- Form fields have explicit `<label>` with `for` binding
- Required fields marked with `*` in visual + aria-required=true
- Error messages linked via aria-describedby to input
- Modal: role="dialog" + aria-modal=true + aria-label
- Status alerts: role="alert" for action errors + cascade failures

---

### Responsive Behavior <760px

**Viewport <760px stacking:**

1. **Header:** Case heading stacks to 2 rows (back + ref above, quantum on second line)
2. **Case body:** Padding reduces to 18px 20px
3. **Case heading:** h1 shrinks to 18px; case-sub wraps each item to own line
4. **State rail:** Renders normally (vertical connectors adapt)
5. **Record display:** DL switches to 1 column (label above value, no side-by-side grid)
6. **Action footer:** Buttons stack to 1 column or 2-column wrap; cascade-preview hides
7. **Modal:** veil-body width auto (18px margins); form fields 100% width

**Test viewport widths:**
- 768px (iPad)
- 600px (large phone)
- 375px (iPhone)

---

### Specific Chain Examples

#### Example 1: Drawdown (W21, IPP-Lender)

**Scenario:** IPP submits drawdown request; Lender is reviewing.

- `chainKey` = 'drawdown'
- `viewer_role` = 'lender'
- `case.counterparty` = "IPP Developer Ltd"
- `case.status` = 'ie_review'
- `case.quantum_zar` = 45_000_000 (formats to "R 45m")
- `case.title` = "Tranche 1 @ 2026-Q1"
- Events: [submitted, ie_certifier_assigned, ie_review_started]
- Actions (lender only):
  - "Begin IE review" → opens modal [ie_certifier: text]
  - "Query drawdown" → opens modal [reason_code: string]
  - "Pass to CP checklist" → opens modal [ie_cert_doc_ref: evidence]

**Display:**
```
Header:
  › Drawdown | DDN-2026-00014 | R 45m

Case heading:
  Tranche 1 @ 2026-Q1
  [ie_review] W21 · Drawdown ↔ IPP Developer Ltd
  [Fuse bar: 2 days remaining]

State rail:
  ✓ 2026-03-10 13:45 Documents submitted [ipp_developer]
  ✓ 2026-03-11 09:20 IE certifier assigned [lender]
  ● 2026-03-12 14:10 IE review started [lender]

Record display:
  Amount (ZAR)     | R 45m
  Project          | Solar Alpha 10MW
  IE Certifier     | PwC South Africa
  Submitted at     | 12 Mar 2026
  [Show advanced fields ▼]

Action footer:
  "Commits tranche; triggers SARB disclosure for senior tranches"
  [Begin IE review] [Query] [Pass to CP]
```

#### Example 2: Take-or-Pay (W32, Offtaker-IPP, respondent view)

**Scenario:** Offtaker proposes TOP quantum; IPP is reviewing (respondent).

- `chainKey` = 'ppa_take_or_pay'
- `viewer_role` = 'ipp_developer'
- `case.counterparty` = "Eskom"
- `case.status` = 'quantum_proposed'
- `case.quantum_zar` = 850_000 (takes 90-day shortfall)
- Events: [statement_issued, quantum_proposed]
- Actions (IPP only):
  - "Accept quantum" → opens modal [top_amount_agreed: number (ZAR), evidence]
  - "Dispute quantum" → opens modal [reason_code, evidence, section34_ref]

**Display (respondent side-panel visible):**
```
Case heading:
  Take-or-pay: PPA contract year 2026
  [quantum_proposed] W32 · Take-or-pay ↔ Eskom
  [Fuse bar: 14 days to accept]

Side-panel:
  ╭────────────────────────────────╮
  │ You're on the other side        │
  │ PPA: Renewable Energy Supply    │
  │ Status: Quantum proposed        │
  │                                │
  │ Your actions:                  │
  │ • Accept quantum (R 850k)      │
  │ • Dispute quantum              │
  │                                │
  │ [← Back to Horizon]            │
  ╰────────────────────────────────╯

Record display:
  Delivery period | Jan 2026
  Contracted vol  | 12,000 MWh
  Delivered vol   | 11,150 MWh
  Shortfall       | 850 MWh
  TOP amount      | R 850k
  Offtaker name   | Eskom SOC Ltd

Action footer:
  "IPP accepts; opens settlement payment window"
  [Accept quantum] [Dispute]
```

---

### Current Audit Findings to Fix

| Finding | Spec Behavior | Implementation Note |
|---------|---------------|---------------------|
| Raw fields dump verbatim | Fields render per type metadata | Add displayColumns to MERIDIAN_CHAINS; default to sensible coercion |
| *_id columns show UUIDs | Resolve to human label via lookup | facility_id → API → "Solar Park Alpha" |
| No enum label mapping | Enum values sentence-cased + looked up | Add enumMap to display metadata |
| Dates as ISO strings | Format to "D MMM YYYY" | Use date-fns or Intl.DateTimeFormat |
| Dates as ISO strings | ZAR formatted with fmtZar() | Use existing utility, apply to any *_zar column |
| No counterparty affordance | Side-panel for respondent-only roles | Render .case-panel when viewer not in chain.lanes |
| Thread-only chains unreachable | IncomingPanel deep-link + side-panel | Part of Horizon/Thread integration |
| Modal no focus trap | Trap focus; apply inert to background | React.useEffect on formAction state |
| aria-modal but no inert | Prevent background scrolling | Add overflow:hidden to body on modal open |
| No advanced toggle | Toggle reveals hidden columns | Separate .record-advanced <details> |

---

### Accessibility Checklist

- [x] Header: back link has title="All Covenant certificate cases"
- [x] Case status chip: color + text (not color alone)
- [x] State rail: role=list, li.state with role=listitem, connector lines are decoration (aria-hidden)
- [x] Record DL: `<dt>` labels always paired with `<dd>` values
- [x] Action buttons: visible label, title for cascadeHint tooltip
- [x] Action buttons: disabled state visually distinct
- [x] Form fields: label + input with id/for binding
- [x] Form validation: aria-invalid + aria-describedby on error
- [x] Modal: role=dialog + aria-modal=true + aria-label
- [x] Modal: focus trap (Tab loops within modal only)
- [x] Alerts: role="alert" for errors; auto-announce
- [x] Escape key: documented as close-modal affordance

---

### Implementation Sequence

1. **Phase 1 (Field rendering):** Add `displayColumns` optional descriptor to MERIDIAN_CHAINS; implement type-driven rendering in ThreadPage (date, zar, enum, reference).
2. **Phase 2 (Respondent UX):** Add .case-panel render when viewer not in chain.lanes; surface available actions + back link.
3. **Phase 3 (Focus & modality):** Add focus trap to action modal (useEffect on formAction); apply inert to body.
4. **Phase 4 (Advanced fields):** Separate .record-advanced <details> for advancedOnly columns.
5. **Phase 5 (Responsive):** Test <760px reflow; adjust DL grid to 1 column; stack actbar buttons.

---
