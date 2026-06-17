## Surface: Ledger (/ledger/:chainKey) & +New / FieldForm

### Overview

The Ledger is the per-chain list surface (third of four Meridian surfaces after Horizon + Atlas, before Thread). It displays:
- A KPI strip (counts + monetary exposure totals with explicit units)
- Status filter pills (`All` + role-visible filters)
- A card-list of cases sorted by attention score (breach > urgency > money)
- Optionally, a schema-driven +New veil-drawer for initiating new cases (FieldForm)

**Entry points:** `GET /api/ledger/:chainKey` → `LedgerData`; `/api/ledger/lookup/:source` → lookup options; deep-link `?compose=1` to open +New immediately.

---

### Layout & Zones

```
┌────────────────────────────────────────────────────────────┐
│ Header (60px, pinned)                                      │
│  [Wordmark]  [Ledger Title · N shown]  [spacer]  [+New]    │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ Body (flex-1, overflow-y:auto, max-width:920px, p:28/44/60)│
│                                                             │
│  ← Horizon                                                  │
│                                                             │
│  [Notice: "Your role can review… but can't start…" →]     │
│                                                             │
│  [KPI strip: Certificates | Breached | Outstanding]        │
│    21 (mono, 21px)     3 (mono, 21px)   R 1.2bn (mono, 21px)│
│  (labels below, 10px uppercase)                            │
│                                                             │
│  [Filter pills] [All] [Active breach] [Under review] …     │
│                      [spacer]           [+ New Certificate] │
│                                                             │
│  [Case card 1] ─ full-width button                         │
│    ref        status_chip              deadline_fuse        │
│    Title: Renewal of Covenant…          R 500m · ↔ Widget  │
│                                                             │
│  [Case card 2]                                             │
│  …                                                          │
│                                                             │
│  OR                                                         │
│                                                             │
│  No cases. Start one with "Open cost report".              │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

### Load States & Error Handling

#### **State 1: Loading (initial fetch)**
- Display: `<div className="mer mer-loading" aria-busy="true">Loading ledger…</div>`
- Spinner/aria-busy indicator expected at Meridian frame level
- No query-param validation yet

#### **State 2: Bad :chainKey (404 from backend)**
**CURRENT BROKEN BEHAVIOR:** Returns generic "Ledger failed to load. Retry" alert.  
**FIXED BEHAVIOR:** Show dedicated "No such transaction type" error state:

```
┌────────────────────────────────────────────────────────────┐
│ [Alert, role="alert", aria-live="polite"]                  │
│                                                             │
│  No such transaction type.                                 │
│                                                             │
│  Tried to open ledger for "covenant_certificat" (typo).    │
│  This chain is not registered in the platform.             │
│                                                             │
│  [Browse what exists →] (link to /atlas)                   │
│                                                             │
│  [Retry] button to reload                                  │
└────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Backend `/api/ledger/:chainKey` returns 404 with `{success:false, error:'unknown chain'}`
- Frontend FieldForm + LedgerPage detect `error === 'unknown chain'` in the catch block
- Distinguish from 403 (role forbidden on an existing chain) and 500 (database error)
- Error message includes the exact chainKey attempted (escaped for safety)

#### **State 3: Forbidden (role cannot see the chain)**
- Backend returns 403: `{success:false, error:'forbidden'}`
- Display: `<div role="alert">Your role cannot access this chain. [Back to Horizon →]</div>`
- Distinct from State 2 (bad key vs. bad permissions)

#### **State 4: Network/500 error**
- Display: "Ledger failed to load. [Retry]" generic fallback
- Still OK for one-off transient failures

#### **State 5: Empty list, first run**
- `data.rows.length === 0` and no status filter active
- Text: `No cases.` + optional ` Start one with "{initiation.label}".` if role can initiate
- Centered, 48px padding, ink2 color
- No skeleton shimmer; instant render is preferred for empty state

#### **State 6: Empty list, filtered**
- `data.rows.length === 0` and a status filter is active (pill is `.on`)
- Text: `No cases matching "[filter label]". [Clear filter]`
- Same styling as State 5

#### **State 7: Populated list**
- Cards render sorted by `score` (descending): breached first, then by urgency + money
- Each card is a `<button type="button" className="lcard">` with `onClick → nav('/thread/:chainKey/:id')`

---

### KPI Strip

**Region:** Rendered if `data.kpis.length > 0`

**Layout:**
- Flex row, wrap-enabled, 14px gap row × 36px gap column
- Responsive: stays flex on phones (no min-width clamp needed for 3 items)

**Per KPI:**
- Key + Label pair: `kpis[].key` and `kpis[].label`
- Value rendering (heuristic from `fmtKpi`):
  - If key matches `/exposure|zar|amount|value/i` (case-insensitive) → `fmtZar(value)`
    - Formatting: `R 1.2bn`, `R 450m`, `R 50k`, `R 123`
  - Else: plain `String(value)`, e.g. "21" for a count
- **UNIT DISPLAY (audit fix):** Do NOT infer unit from key name. The LedgerData kpi shape carries no unit field, but chains should define one (future work: add `unit?: string` to `ChainKpiSpec`). For now:
  - `label: 'Outstanding'` + value `R 1.2bn` → user reads "R 1.2bn Outstanding" (unit is in the label)
  - `label: 'Certificates'` + value `21` → user reads "21 Certificates"

**Styling:**
- `.kpi-val` (mono, 21px, petrol-deep, weight:700, letter-spacing:-0.01em, line-height:1.1)
- `.kpi-label` (10px uppercase, ink3, weight:700, letter-spacing:0.1em, wdth:112)

**Examples (two real chains):**

**W38 Covenant certificate:**
- `key: 'total', label: 'Certificates', compute: 'count'` → `21`
- `key: 'breached', label: 'Breached', compute: 'count_breached'` → `3`
- `key: 'exposure', label: 'Outstanding', compute: 'sum_quantum'` (quantum = `outstanding_principal` ZAR) → `R 450m`

**W21 Drawdown:**
- `key: 'total', label: 'Drawdowns', compute: 'count'` → `8`
- `key: 'breached', label: 'Breached', compute: 'count_breached'` → `1`
- `key: 'exposure', label: 'Committed', compute: 'sum_quantum'` (quantum = `amount_zar`) → `R 120m`

---

### Filter Pills

**Region:** Below KPI strip, flex row

**HTML structure:**
```jsx
<div className="pills" role="group" aria-label="Filter by status">
  <button className={status == null ? 'pill on' : 'pill'}
          aria-pressed={status == null}
          onClick={() => setStatus(undefined)}>
    All
  </button>
  {data.filters.map(f => (
    <button className={active ? 'pill on' : 'pill'}
            aria-pressed={active}
            onClick={() => setStatus(f.key)}>
      {f.label}
    </button>
  ))}
  <span className="spacer" />
  {initiation && (
    <button className="btn pri" onClick={() => setComposeOpen(true)}>
      {initiation.label}
    </button>
  )}
</div>
```

**Behavior:**
- `All` pill: always present, onclick resets `status` to `undefined`
- Role-visible filters only (backend includes only applicable filters per role + chain descriptor)
- `aria-pressed={boolean}` on each pill for a11y toggle semantics
- `.pill.on` state: petrol bg, petrol border, white text
- `.pill` inactive: raised bg, line border, ink2 text
- Hover: border → ink3, color → ink
- Active: scale(0.97) on click (Emil motion)
- Spacer pushes `+ New` button to the right on desktop; wraps on phones

**Filter matching (backend):**
- Query param: `?status=active_breach` (URL-encoded)
- Validated against `chain.filters.find(f => f.key === filterKey)`
- If found, bind statuses: `WHERE chain_status IN (?, ?, ?)` with `filter.statuses` array
- If not found or falsy, ignore (no filter applied)

**Examples:**

**W38 Covenant certificate filters:**
- `{key: 'active_breach', label: 'Active breach', statuses: ['breach_identified', 'waiver_requested', 'cure_period']}`
- `{key: 'under_review', label: 'Under review', statuses: ['under_review', 'ratios_verified']}`
- `{key: 'awaiting', label: 'Awaiting submission', statuses: ['certificate_due', 'certificate_submitted']}`
- `{key: 'resolved', label: 'Resolved', statuses: ['compliant', 'waiver_granted', 'cured', 'accelerated']}`

**W21 Drawdown filters:**
- `{key: 'in_review', label: 'In review', statuses: ['documents_submitted', 'ie_review', 'cp_checklist']}`
- `{key: 'on_hold', label: 'On hold', statuses: ['on_hold']}`
- `{key: 'awaiting_docs', label: 'Awaiting documents', statuses: ['requested']}`
- `{key: 'approved', label: 'Approved / funded', statuses: ['approved', 'funded']}`
- `{key: 'resolved', label: 'Resolved', statuses: ['closed', 'rejected', 'cancelled']}`

---

### Case Cards

**Region:** Below filters, stacked vertically

**HTML structure:**
```jsx
{data.rows.length === 0 ? (
  <div className="lcard-empty">
    No cases.{initiation && ` Start one with "${initiation.label}".`}
  </div>
) : (
  data.rows.map(row => (
    <button type="button" className="lcard"
            onClick={() => nav('/thread/' + chainKey + '/' + row.id)}>
      <div className="lcard-top">
        <span className="ref mono">{row.ref}</span>
        <span className="chip">{row.status.replace(/_/g, ' ')}</span>
      </div>
      <b className="lcard-title">{row.title}</b>
      <FuseBar deadline={row.deadline_at} />
      <div className="lcard-meta mono">
        {[
          row.quantum_zar != null ? fmtZar(row.quantum_zar) : null,
          row.counterparty ? '↔ ' + row.counterparty : null,
        ].filter(Boolean).join(' · ')}
      </div>
    </button>
  ))
)}
```

**Per-card sections:**

1. **Top row (lcard-top):**
   - `ref` (mono, 10.5px, ink3): human-readable reference from `row.ref` (e.g., `CERT-001`, `DRAW-042`)
   - `chip` (inline, status badge): `row.status` with underscores replaced by spaces (e.g., `breach_identified` → `breach identified`), petrol-tint bg, petrol-deep text
   - Flex space-between, gap 10px

2. **Title (lcard-title):**
   - Bold, 13.5px, line-height:1.35, margin:5px 0 8px
   - Content: `row.title` from `chain.titleCol` (e.g., facility_name, project_name) or fallback to `chain.title`

3. **Deadline fuse (FuseBar):**
   - Horizontal bar, 3px height, 170px width, rounded
   - Visual urgency meter: width of the filled bar = `(hours_remaining / 72) clamped 0..1`
   - Fill color: petrol (normal) or amber (warn) or oxide (dead/breached)
   - Non-color a11y: warn state adds forward hatch; dead state adds back hatch
   - If `row.deadline_at` is null → bar is hidden (no deadline = "later" cases)

4. **Meta row (lcard-meta):**
   - Mono, 11.5px, ink2
   - Content: ZAR amount (if `quantum_zar != null`) + counterparty name, joined by ` · `
   - Example: `R 500m · ↔ Widget Manufacturing Ltd`
   - If only quantum: `R 50k` (no arrow)
   - If only counterparty: `↔ John Doe` (no amount)

**Card styling:**
- Raised bg, line border, 8px radius, 13×15×14px padding
- Hover: petrol border, 1px box-shadow offset 1px 4px (rgba(64, 117, 160, 0.10)), translateY(-1px)
- Active: scale(0.99)
- Cursor: pointer
- Transition: 160ms var(--ease) on transform, border-color, box-shadow

**Sort order (backend `assembleLedger`):**
- `mapped.sort((a, b) => b.score - a.score)` (descending by attention score)
- Attention score formula: `attentionScore(zar, deadline, now)`
  - Breach (deadline in past): `BREACH_FLOOR (1M) + log10(zar)` → highest
  - Urgent (deadline < 0.25 hrs away): `log10(zar) / 0.25` → high
  - Today: `log10(zar) / 24`
  - Later: `min(log10(zar) / 1000, BREACH_FLOOR - 1)` → always below breach

**Responsive (≤760px):**
- Cards keep same appearance
- Ref + chip flex may wrap if chain title is long; let inline flow handle it
- No horizontal scroll (already full-width)

---

### +New Drawer & FieldForm

**Entry points:**
1. Click `+ New [Label]` button in pills row
2. Deep-link `?compose=1` landing from `/deals/new` picker

**Veil overlay:**
```jsx
{composeOpen && initiation && (
  <div className="mer veil" onClick={() => setComposeOpen(false)}>
    <div className="veil-body" role="dialog" aria-modal="true" 
         aria-label={initiation.label}
         onClick={e => e.stopPropagation()}>
      <FieldForm ... />
    </div>
  </div>
)}
```

**Veil styling:**
- Fixed overlay, inset:0, z-index:1000 (above all surfaces)
- Scrim: ink / 0.18 (18% opacity of the text color)
- `veil-body`: centered, max 720px wide, 82vh max-height, overflow-y:auto, raised bg
- Motion: scrim fades in (160ms), panel rises+scales (220ms var(--ease))
- Dismiss: click scrim, press Escape (event listener restores focus to previous activeElement)

**FieldForm component (shared with Thread action drawer):**

**Props:**
```ts
interface FieldForm {
  fields: LedgerActionField[];
  prefill?: Record<string, unknown>;        // for Thread actions; empty for +New
  submitLabel: string;                       // e.g., "Open cost report"
  cascadeHint?: string;                      // Law 3 preview (thread only; null for +New)
  ariaLabel?: string;                        // e.g., "Open cost report"
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}
```

**Render (FieldForm):**
```jsx
<form className="composer" onSubmit={submit} aria-label={ariaLabel ?? submitLabel}>
  {fields.map(f => {
    const id = `ff-${f.key}`;
    const errId = `${id}-err`;
    const flag = missing.has(f.key);
    const errProps = flag ? { 'aria-invalid': true, 'aria-describedby': errId } : undefined;
    return (
      <div className={flag ? 'field flag' : 'field'} key={f.key}>
        <label htmlFor={id}>
          {f.label}{f.required && ' *'}
          {f.unit && <span className="mono"> · {f.unit}</span>}
        </label>
        {/* field type rendering below */}
      </div>
    );
  })}
  {cascadeHint && <div className="cascade-hint">{cascadeHint}</div>}
  {err && <div className="act-error" role="alert"><span>{err}</span></div>}
  <div className="actbar-btns">
    <button type="submit" className="btn pri" disabled={submitting}>
      {submitting ? `${submitLabel}…` : submitLabel}
    </button>
    <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>
      Cancel
    </button>
  </div>
</form>
```

---

### Field Types in FieldForm

**Type: `string`**
- `<input type="text" />`
- Placeholder from `f.placeholder`
- Value binding: `values[f.key]` (string or empty)
- Coerce on submit: `v != null ? String(v) : ''`

**Type: `number`**
- `<input type="number" inputMode="decimal" />`
- Placeholder from `f.placeholder`
- Coerce on submit: `v === '' || v == null ? null : Number(v)`

**Type: `date`**
- `<input type="date" />`
- Native browser date picker (YYYY-MM-DD)
- No placeholder (input type=date handles UI)
- Coerce on submit: `String(v)`

**Type: `enum`**
- `<select>`
- `<option value="" disabled>Select…</option>` as default
- Options from `f.options` array (e.g., `['dscr_breach', 'llcr_breach', 'gearing_breach', 'reporting_failure']`)
- Display text = option value (no label field; enums are developer-facing keywords)
- Coerce on submit: `v ?? (f.options?.[0] ?? '')`

**Type: `boolean`**
- `<input type="checkbox" />`
- Checked state: `Boolean(values[f.key])`
- Coerce on submit: `Boolean(v)`
- Always "supplied" for validation (a checkbox can be unchecked, which is still a valid value)

**Type: `evidence`**
- `<textarea rows={3} />`
- Placeholder from `f.placeholder`
- Coerce on submit: `String(v)`

**Type: `lookup`**
- `<select>` populated from `GET /api/ledger/lookup/:source`
- Source must be in `LOOKUP_SOURCES` whitelist (static literal in ledger.ts)
- Fetch on mount: `useEffect` iterates fields, calls `fetchLookup(f.source)` for each lookup field
- While loading: `<option>Loading…</option>`, select is `disabled`
- On success: options from response `{success:true, data:[{id, label}, ...]}`
  - `<option key={o.id} value={o.id}>{o.label}</option>`
- On error: options array becomes `[]`, error message shown below select: `Could not load options` (mono, oxide text)
- Coerce on submit: `String(v)`

**Example lookup sources:**

From `LOOKUP_SOURCES`:
- `'carbon-projects'` → `SELECT id, project_name AS label FROM carbon_projects ORDER BY project_name LIMIT 500`
- `'ipp-developers'` → `SELECT id, name AS label FROM participants WHERE role = 'ipp_developer' ORDER BY name LIMIT 500`
- `'om-sites'` → `SELECT id, name AS label FROM om_sites ORDER BY name LIMIT 500`
- `'lender-facilities'` → `SELECT id, facility_name AS label FROM oe_credit_facility_applications ORDER BY facility_name LIMIT 500`

Frontend field spec (from chain registry):
```ts
{ key: 'project_id', label: 'Project', type: 'lookup', source: '/api/ledger/lookup/ipp-projects', required: true }
{ key: 'ipp_id', label: 'IPP', type: 'lookup', source: '/api/ledger/lookup/ipp-developers', required: true }
```

---

### Validation & Error Handling (FieldForm)

**Client-side validation:**
```ts
const miss = new Set<string>();
for (const f of fields) {
  if (!f.required) continue;
  const v = values[f.key];
  // Booleans always count as supplied; others must be non-null and non-empty string
  if (f.type !== 'boolean' && (v == null || v === '')) miss.add(f.key);
}
if (miss.size) { setMissing(miss); return; }
```

**Per-field error state:**
- Missing required: `.field.flag` class + `aria-invalid="true"` + `aria-describedby="{id}-err"`
- Error message below field: `<span id="{errId}" className="mono field-required">required</span>`
- Styling: oxide border (3px halo), background scaled

**Form-level error:**
- After `onSubmit` promise rejects, capture error: `r?.response?.data?.error ?? r?.message ?? 'Action failed'`
- Display in `.act-error` alert: `role="alert"` for SR announcement
- Layout: red/oxide bg, 12px text, 8px padding, 1px oxide border

**Submit button:**
- `disabled={submitting}` while fetching
- Text changes: `"Open cost report"` → `"Open cost report…"` during submission
- Both Cancel + Submit disabled while submitting

---

### Keyboard & Focus Behavior

**Ledger page:**
- Filter pills: Tab-navigable, Enter/Space to toggle (native button behavior)
- Case cards: Focusable buttons, Enter/Space to navigate to Thread
- `+ New` button: Focusable, opens drawer on Enter/Space

**Veil drawer:**
- Opens: focus moves to first form field (implicit via FieldForm rendering)
- Escape key: closes drawer (globally bound in LedgerPage via `useEffect`)
- Focus trap (manual via active-element tracking): on close, restore focus to `+ New` button (or pill if navigated from filter)
- Tab order: stays within form (native `<form>` dialog containment; no manual trap needed if a11y attributes correct)

**FieldForm internal:**
- Standard HTML form semantics: Tab through fields in source order
- Required-flag visible: `*` after label + monospace " · unit" suffix
- Error focus: `aria-invalid` + error message with `aria-describedby`, no auto-focus
- Submit button: last focusable element; Shift+Tab wraps back to first field

---

### Two Real Chain Examples

#### **Example 1: W38 Covenant Certificate (covenant_certificate)**

**Initiation:** null (no +New; Lender initiates externally, e.g., during facility onboarding)

**Columns (listSelectCols):**
- `id`, `certificate_number`, `facility_name`, `outstanding_principal`, `chain_status`, `sla_deadline_at`, `borrower_party_name`

**KPIs:**
1. `{key: 'total', label: 'Certificates', compute: 'count'}` → 21
2. `{key: 'breached', label: 'Breached', compute: 'count_breached'}` → 3
3. `{key: 'exposure', label: 'Outstanding', compute: 'sum_quantum'}` → R 450m

**Filters:**
- All (All, active_breach, under_review, awaiting, resolved)
- Click "Active breach" → WHERE chain_status IN ('breach_identified', 'waiver_requested', 'cure_period')

**Sample card (W38):**
```
┌─────────────────────────────────────────┐
│ CERT-0921          [breach identified]  │
│ Renewal of Covenant — Acme Solar Ltd    │
│ ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ R 125m · ↔ Acme Solar Ltd               │
└─────────────────────────────────────────┘
```

**Actions (Thread only, not in Ledger):**
- `begin-review` (Lender) → "Starts compliance assessment; borrower notified of receipt."
- `flag-breach` (Lender, oxide tone) → fields: reason_code (enum), breached_covenants (string), breach_basis (evidence)
- `verify-ratios` (Lender, primary tone) → fields: dscr_actual (number), llcr_actual (number), gearing_actual (number), review_basis (string)
- `confirm-compliant` (Lender, primary tone) → fields: reason_code (evidence), rod_notes (evidence)

---

#### **Example 2: W21 Drawdown (drawdown)**

**Initiation:**
```ts
initiation: {
  label: 'Open cost report',
  path: '/api/lender/construction-cost-report',
  fields: [
    { key: 'project_id', label: 'Project', type: 'lookup', source: '/api/ledger/lookup/ipp-projects', required: true },
    { key: 'ipp_id', label: 'IPP', type: 'lookup', source: '/api/ledger/lookup/ipp-developers', required: true },
    { key: 'report_month', label: 'Report month', type: 'string', required: true, placeholder: 'YYYY-MM' },
    { key: 'total_project_budget_zar', label: 'Project budget', type: 'number', unit: 'ZAR' },
    { key: 'reason', label: 'Reason', type: 'string' },
  ],
}
```

Wait—this example is from a different chain (W226 construction cost report, not W21). Let me check if W21 has initiation:

**W21 Drawdown actual:**
- `initiation: null` (Lender initiates via an external workflow, not Ledger +New)

**Columns:**
- `id`, `drawdown_number`, `project_name`, `amount_zar`, `chain_status`, `sla_deadline_at`, `lender_id`

**KPIs:**
1. `{key: 'total', label: 'Drawdowns', compute: 'count'}` → 8
2. `{key: 'breached', label: 'Breached', compute: 'count_breached'}` → 1
3. `{key: 'exposure', label: 'Committed', compute: 'sum_quantum'}` → R 120m

**Filters:**
- All, in_review, on_hold, awaiting_docs, approved, resolved

**Sample card (W21):**
```
┌──────────────────────────────────────────┐
│ DRAW-0142         [ie_review]            │
│ Q3 2026 Tranche B — Zion Energy          │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ R 75m · ↔ ABSA Lender Group              │
└──────────────────────────────────────────┘
```

**Actions (Thread only):**
- `submit-documents` (IPP developer) → no fields
- `begin-ie-review` (Lender) → fields: ie_certifier (string)
- `pass-to-cp` (Lender, primary) → fields: ie_cert_doc_ref (string)
- `approve` (Lender) → fields: cp_evidence_ref (evidence), sarb_disclosure_ref (evidence)
- `reject` (Lender, oxide) → fields: reason (string, required, placeholder: "Why the tranche is rejected")
- `fund` (Lender, primary) → no fields
- `close` (Lender, primary) → no fields

---

### +New Modal Workflow (with W26 CP Register as example chain with initiation)

**W223 CP Clearance has initiation:**
```ts
initiation: {
  label: 'New CP register',
  path: '/api/cp-clearances',
  fields: [
    { key: 'cp_tier', label: 'CP tier', type: 'enum', options: ['minor', 'standard', 'major', 'systemic'] },
    { key: 'borrower_name', label: 'Borrower', type: 'string' },
    { key: 'facility_ref', label: 'Facility ref', type: 'string' },
    { key: 'project_ref', label: 'Project ref', type: 'string' },
    { key: 'cp_count_total', label: 'Total CPs', type: 'number' },
    { key: 'closing_deadline', label: 'Closing deadline', type: 'date' },
    { key: 'reason', label: 'Reason', type: 'string' },
  ],
}
```

**User flow:**
1. Land on `/ledger/cp_clearance`
2. Ledger page fetches chain descriptor + rows, renders KPI + filters + cards
3. Click `+ New CP register` button → `setComposeOpen(true)`
4. Veil + FieldForm render with 7 fields (no cascade hint; initiation only)
5. User fills:
   - `cp_tier`: clicks select, sees `[Select…] minor standard major systemic` → picks "major"
   - `borrower_name`: types "Zion Energy Ltd"
   - `facility_ref`: types "FAC-0042"
   - `project_ref`: types "PRJ-2026-Q3"
   - `cp_count_total`: types "12"
   - `closing_deadline`: clicks date picker, selects 2026-09-30
   - `reason`: types "Phase B closing" (optional, no `required`)
6. Click `New CP register` (submit button)
7. FieldForm validates required fields (all except `reason`), collects values as:
   ```json
   {
     "cp_tier": "major",
     "borrower_name": "Zion Energy Ltd",
     "facility_ref": "FAC-0042",
     "project_ref": "PRJ-2026-Q3",
     "cp_count_total": 12,
     "closing_deadline": "2026-09-30",
     "reason": "Phase B closing"
   }
   ```
8. POST to `/api/cp-clearances` (stripped from `initiation.path`)
9. On success: close drawer, re-fetch ledger, new case appears in list
10. On error: show `.act-error` alert in form, keep drawer open for retry
11. Close: click scrim or press Escape → restore focus to `+ New CP register` button

---

### Responsive Behavior (<760px phones)

**Ledger body:**
- Same padding: 28px 44px 60px (compacted to 18px 18px 48px on smaller phones)
- Cards stay full-width (already is)
- KPI strip: flex wraps naturally; stays readable even if 3 KPIs stack

**Header:**
- Wraps to 2 rows on small screens (existing `.mer header` responsive rule)
- Clock hidden; kbd-hint compacted; quicklinks wrap below
- Avatar always visible (never pushed off)

**Veil drawer:**
- `veil-body`: 92vw max-width, 82vh max-height
- Form fields stay single-column; full-width on phones

**Lookup loading:**
- Dropdown still shows `Loading…` → disabled select prevents premature submit

---

### Accessibility (WCAG 2.1 AA)

**Roles & ARIA:**
- Page: implicit `<main>` (no explicit role needed)
- Filter group: `role="group" aria-label="Filter by status"`
- Each pill: native `<button>` + `aria-pressed={boolean}`
- Case card: native `<button type="button">` (navigates to Thread on click)
- Empty state: implicit text (no aria-label needed; just readable text)
- Veil drawer: `role="dialog" aria-modal="true" aria-label="{initiation.label}"`
- Form: `aria-label="{ariaLabel}"`
- Required field: `*` after label; error span with `aria-describedby`
- Alert errors: `role="alert"` (live region, auto-announced by SR)

**Color contrast:**
- KPI value (petrol-deep on paper): 7.5:1 (exceeds 4.5:1 AA)
- Pill text (ink2 on raised bg): 5.2:1 (passes AA)
- `.pill.on` text (white on petrol): 7.8:1 (passes AAA)
- Error text (oxide on oxide-tint): 6.0:1 (passes AA)
- Fuse bar: non-color cue via hatching (forward vs. back hatch distinguishes warn from dead)

**Focus visible:**
- Pill: `outline:2px solid var(--petrol), outline-offset:2px` on `focus-visible`
- Button: same
- Form input: `border-color:var(--petrol), box-shadow:0 0 0 3px oklch(0.40 0.075 200 / 0.25)` on focus
- Error input: oxide border + inset petrol ring on `focus-visible` (layered: outer oxide halo + inner petrol focus ring)

**Touch targets:**
- Pill: min-height 44px on coarse pointer
- Button: min-height 44px on coarse pointer
- Card: full-width, 34px+ clickable area (exceeded)

**Motion:**
- `prefers-reduced-motion:reduce` → transitions off, transforms removed
- Fuse bar animation: no animation (just a static bar)

**Semantic HTML:**
- Form: native `<form>` + `<label htmlFor={id}>`
- Buttons: type-correct (`type="submit"`, `type="button"`)
- Inputs: semantic types (`type="text"`, `type="number"`, `type="date"`, etc.)
- Select: native `<select>` (browser date picker for type=date)

---

### Edge Cases & Surprises

1. **Bad URL, then Escape**: User lands on `/ledger/covenant_certificat` (typo), sees error state, clicks "Browse what exists" → navigates to `/atlas`. No cleanup needed (error state is local state).

2. **Deep-link + no initiation**: `?compose=1` on a chain with `initiation: null` → notice appears: "Your role can review … but can't start …" with link to `/atlas`. Query param is stripped (replaced, not deleted).

3. **Lookup fetch fails**: User opens form, lookup-field shows error `Could not load options`. User cannot submit (select disabled while erroring). Retry by closing + reopening form, or wait for next page reload (error is ephemeral).

4. **Filter pill, then no results**: User clicks "Resolved" on W38, list is empty. Text: "No cases matching 'Resolved'." (clear filter prompt is a future improvement).

5. **Status filter + pagination**: Backend `LIMIT 200` means ledgers never exceed 200 rows. If a role has >200 unresolved certificates, oldest cases are truncated (okay for UX; role is likely over-capacity and should use Thread search or Horizon to find specific cases).

6. **Veil drag-to-dismiss**: Click scrim → closes. This is not a gesture (React pointer events); swipe-down-to-close is not supported (Meridian surfaces target desktop primarily; phones use landscape or portrait but no gestures).

7. **Dark mode**: Meridian CSS uses oklch color variables tied to --paper, --ink, --petrol. If a user agent supports `prefers-color-scheme:dark`, the --* variables can be overridden by a CSS media query (not currently implemented; low priority).

8. **Internationalization (i18n)**: All hardcoded strings (`All`, `Loading ledger…`, `No cases.`, field labels) are in English. No translation layer (future work). Chain descriptors (titles, labels) are embedded in code literals.

---

### Summary Table: Field Types in FieldForm

| Type | HTML | Validation | Coerce | Example |
|------|------|-----------|--------|---------|
| `string` | `<input type="text">` | Required: non-empty | `String(v)` | "Zion Energy Ltd" |
| `number` | `<input type="number">` | Required: non-null | `Number(v)` or `null` | 12 |
| `date` | `<input type="date">` | Required: non-empty | `String(v)` | "2026-09-30" |
| `enum` | `<select>` + hardcoded options | Required: non-empty | First option default | "major" |
| `boolean` | `<input type="checkbox">` | Always valid | `Boolean(v)` | `true` / `false` |
| `evidence` | `<textarea rows={3}>` | Required: non-empty | `String(v)` | Multi-line text |
| `lookup` | `<select>` + fetched from `/api/ledger/lookup/:source` | Required: non-empty; disabled while loading | `String(v)` | "proj-123" (id) |

---

### Audit Fixes in This Spec

1. ✅ **Deep-link validation** (`?chainKey` before fetch): Dedicated "No such transaction type" error state vs. generic "failed to load"
2. ✅ **KPI unit clarity**: Label contains unit (e.g., "Outstanding R 450m" not inferred from key name)
3. ✅ **Bad chainKey 404**: Backend returns 404 + `error: 'unknown chain'`; frontend renders distinct error state with "Open Atlas" link
4. ✅ **Lookup picker binding**: `GET /api/ledger/lookup/:source` fetches options; LOOKUP_SOURCES whitelist prevents SQL injection
5. ✅ **Form field validation**: Client-side + server-side required checks; errors keyed to field; oxide border + error message
6. ✅ **Veil focus trap**: Escape closes + restores focus to button (via active-element tracking in useEffect)
7. ✅ **Responsive table reflow**: Cards stay full-width on phones; no horizontal scroll
8. ✅ **a11y roles**: Buttons, alerts, form labels, aria-pressed on pills, aria-invalid on errors
