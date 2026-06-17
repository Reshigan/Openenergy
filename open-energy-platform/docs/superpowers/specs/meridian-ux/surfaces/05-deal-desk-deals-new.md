## Surface: Deal Desk (/deals, /new)

### Purpose
Author and track bilateral & marketplace deals. The Deal Desk is the canonical entry point for roles to publish requests ("I need…") or offers ("I have…"), compare scored counterparty responses, and dispatch matched deals into chain workflows. Alongside the Ledger (+New initiation per chain), the Deal Desk is ONE OF TWO canonical "start a transaction" entry points; the Ledger is for state-machine-driven workflows, the Deal Desk is for offer-matching-driven workflows.

---

### Route Structure

| Route | View | Initiated from |
|-------|------|---|
| `/deals` | Deal Desk list—full desk with requests lane + offers lane | Header "Deals" link; Atlas "DEAL DESK" section link; direct URL |
| `/deals` (future) | _/deals/new not currently implemented; authors use the **AUTHOR BAR** on /deals itself to open the Compose modal_ | — |

**Clarification on /new routing:** The project has `/new` (NewPage.tsx) which is the transaction picker for **state-machine chains** (those with `ChainDescriptor.initiation`). The Deal Desk does NOT use `/new`—it uses in-page buttons on the AUTHOR BAR to trigger the Compose modal. A future `POST /deals/:type` → chain auto-dispatch might eventually deepen the `/new` integration, but the current model is: Ledger +New = state machines; Deal Desk Compose = marketplace/bilateral deals.

---

### Page Layout & Regions

#### Header (pinned, 60px height)
- **Wordmark**: "CEC" link to /horizon
- **Context**: "DEAL DESK" label + live counts  
  `{requests.length} requests · {offers.length} offers`
- **Spacer**
- **Quicklinks**: Deals (self), ESG, Reports, Intelligence, National  
- **Clock**: Date + time, SAST, refreshed on mount
- **+ New**: primary header action → `/new` (state-machine picker, NOT deal compose)
- **⌘K hint**: "Atlas — search anything" → `/atlas`
- **Avatar**: account menu (sign out)

#### Body (scrollable, 34px padding top + 44px sides + 60px bottom)

```
┌─ LOAD ERROR (if fetch failed) ────────────────────────────┐
│ [oxide bg] "Couldn't load the deal desk. [error]"         │
│ [Retry button]                                            │
└───────────────────────────────────────────────────────────┘

┌─ ACTION ERROR (if mutation failed) ────────────────────────┐
│ [oxide bg] "[Error message from Compose/Compare]"        │
│ [Dismiss button]                                         │
└───────────────────────────────────────────────────────────┘

┌─ SKELETON: while loaded === false ──────────────────────────┐
│ aria-busy="true"                                           │
│ "Loading deal desk…"                                      │
└───────────────────────────────────────────────────────────┘

┌─ AUTHOR BAR ────────────────────────────────────────────────┐
│ [Request Energy Supply pri] [Offer Energy Supply ghost]    │
│ [Request Carbon Retire pri] [Offer Carbon Retire ghost]    │
│ [Request ... pri]  [Offer ... ghost]  ← buttons per can_request / can_offer │
│ aria-label="Author a deal"                                │
└───────────────────────────────────────────────────────────┘

┌────────────────────────┬────────────────────────────────────┐
│  MY REQUESTS           │  MY OFFERS                        │
│  (section aria-label)  │  (section aria-label)             │
├────────────────────────┼────────────────────────────────────┤
│ h2 (mono, petrol,      │  h2 (mono, petrol,                │
│  uppercase, borders)   │   uppercase, borders)              │
│                        │                                    │
│ ┌─ Request Card ─────┐ │ ┌─ Offer Card ──────────┐        │
│ │ Title + [chip]      │ │ │ Title + [chip]         │        │
│ │ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁  │ │ │ {bid/committed amt}    │        │
│ │ [5-step process]    │ │ │                        │        │
│ │ "3 offers · R 50m"  │ │ │                        │        │
│ │ [Compare offers]    │ │ │                        │        │
│ │ [Open thread]       │ │ │                        │        │
│ └─────────────────────┘ │ └────────────────────────┘        │
│                        │                                    │
│ (empty: "No open      │ (empty: "No live                   │
│  requests...")         │  offers...")                       │
└────────────────────────┴────────────────────────────────────┘
```

**Layout behavior:**
- 2-column grid at ≥900px viewport: `grid-template-columns: 1fr 1fr; gap: 0 52px;`
- Single column at <900px: `grid-template-columns: 1fr; gap: 34px 0;`
- Both columns align-items:start so short column doesn't stretch

---

### AUTHOR BAR
(Top bar, just below header; aria-label="Author a deal")

**Rendered buttons:**
```
For each dealType in types:
  if dealType.can_request:
    [Request {dealLabel(deal_type)} | btn pri | onclick → setCompose({ info: t, mode: 'request' })]
  if dealType.can_offer:
    [Offer {dealLabel(deal_type)} | btn ghost | onclick → setCompose({ info: t, mode: 'offer' })]
```

**Interaction:**
- Click "Request X" or "Offer X" → opens **Compose Veil** modal (see below)
- Button class `.btn.pri` for request (primary intent: demand initiation), `.btn.ghost` for offer (secondary, provider capability)
- Disabled state: never—author buttons are always available if the role's deal types loaded
- Tooltip on hover: implicit via button label (no extra title attr)

**Accessibility:**
- Plain button elements, no icon-only affordances
- dealLabel() converts snake_case to Title Case (e.g., `energy_supply` → "Energy Supply")
- No role restrictions here; middleware will gate the POST if the JWT doesn't permit

---

### DEAL LANES: MY REQUESTS & MY OFFERS

#### Layout per lane
```
<section aria-label="My requests" | "My offers">
  <h2>MY REQUESTS | MY OFFERS</h2>
  {requests.length === 0 && <div className="deal-empty">No open requests…</div>}
  {requests.map(r => <DealCard key={r.id} {...r} />)}
</section>
```

#### Empty State
- Rendered only when `.length === 0`
- Text: "No open requests. Author one from the bar above." | "No live offers. Author one from the bar above."
- Color: var(--ink2) (secondary text), font-size 12.5px
- No icon, no CTA button (the AUTHOR BAR is the CTA)

#### Deal Request Card (MY REQUESTS)
**Schema:**
```typescript
{
  id: string;
  deal_type: string;
  status: string;           // e.g. 'open', 'matched', 'accepted', 'dispatched'
  need: Record<string, unknown>;     // unparsed JSON fields user submitted
  target_amount_zar: number | null;  // headline quantum
  bid_window_close: string | null;   // ISO deadline
  clearing_rule: string | null;      // e.g. 'pay_as_bid', 'uniform_price'
  selected_offer_id: string | null;  // if user picked one
  dispatched_chain_key: string | null;  // if accepted → moved into a chain
  dispatched_case_id: string | null;    // the case ID in that chain
  offer_count: number;               // live responses
  created_at: string;                // ISO
}
```

**Card structure:**
```
┌─────────────────────────────────────────────┐
│ .dcard-top:                                 │
│  <b>{dealLabel(deal_type)}</b>              │
│                           <span class="chip">{status}</span>
│                                             │
│ <DealProcessRail kind={kindFor()} stage={dealStage()} />  │
│                                             │
│ .dcard-meta (mono, ink3):                  │
│  "{offer_count} offers"                     │
│  " · {fmtZar(target_amount_zar)}"  ← if not null│
│                                             │
│ .dcard-acts:                                │
│  {offer_count > 0 && [Compare offers pri]}  │
│  {dispatched_chain_key && [Open thread/LOI ghost]} │
└─────────────────────────────────────────────┘
```

**Status chip:**
- `<span className="chip">{status}</span>` — renders as a small rounded badge
- Color: inherits from chip CSS (typically secondary text + light bg)
- Never disabled; purely informational

**Process rail:**
```
DealProcessRail({ 
  kind: {marketplace|auction|syndication|negotiation|obligation|submission},
  stage: dealStage(r)  // 'offer' | 'match' | 'evaluate' | 'accept' | 'track'
})
```
- Canonical 5-step horizontal spine: Offer → Match → Evaluate → Accept → Track
- Kind-specific labels per LABELS map (e.g., auction: Bid → Collect → Clear → Settle → Track)
- Styling: `.drail` (flex row, gap:0); `.step` (flex:1, position:relative)
  - `.step.done::before` = filled petrol dot + petrol connector line to next
  - `.step.now::before` = amber dot with 4px outer-glow halo; aria-current="step"
  - `.step.ahead` = empty dot + gray line
- No interactions on the rail itself; purely status indicator

**Actions:**
- **Compare offers** button (`.btn.pri`): rendered only if `offer_count > 0`
  - onClick → `openCompare(r)` → fetches `/deals/:dealType/options?request_id=:id` → opens **Compare Veil**
- **Open thread / Open LOI** button (`.btn.ghost`): rendered only if both `dispatched_chain_key` and `dispatched_case_id` are set
  - If `dispatched_chain_key === 'loi'`: Link to `/lois/:id` (legacy LOI surface, not a chain)
  - Else: Link to `/thread/:chainKey/:id` (standard Thread page)
  - Used after accept: the deal has been dispatched into a live chain workflow

**Card interactivity:**
- Hover: `.dcard:hover` = border → petrol, slight lift (translateY -2px), shadow
- Active: `.dcard:active` = slight scale down (scale 0.98)
- Keyboard: not focusable as a unit—buttons inside are Tab-reachable
- Cursor: pointer (for hover effect visual feedback)

#### Deal Offer Card (MY OFFERS)
**Schema:**
```typescript
{
  id: string;
  deal_type: string;
  title: string | null;       // custom title from provider
  status: string;             // e.g. 'live', 'accepted', 'rejected'
  request_id: string | null;  // if responding to a specific request
  bid_amount_zar: number | null;  // auction bid quantum
  committed_amount_zar: number | null;  // syndication commitment
  term_sheet: Record<string, unknown>;   // offer fields user submitted
  expiry: string | null;      // ISO deadline for this offer
  created_at: string;         // ISO
}
```

**Card structure:**
```
┌────────────────────────────────────────┐
│ .dcard-top:                            │
│  <b>{title || dealLabel(deal_type)}</b>│
│                    <span class="chip">{status}</span>
│                                       │
│ .dcard-meta (mono, ink3):             │
│  "{dealLabel(deal_type)}"             │
│  {bid_amount_zar && " · bid {fmtZar(bid_amount_zar)}"} │
│  {committed_amount_zar && " · committed {fmtZar(committed_amount_zar)}"} │
└────────────────────────────────────────┘
```

**Card interactivity:**
- Hover/Active: same as request cards
- No actions rendered on the offer card itself (v1 is read-only view)
- Offers flow backwards from provider → demand, so the provider sees what they've published and waits for demand to shop them via the COMPARE VEIL

---

### COMPOSE VEIL (Modal: Request or Offer)

**Trigger:** Click "Request X" or "Offer X" button on AUTHOR BAR

**Veil container:**
```css
position: fixed; inset: 0; z-index: 1000;
background: oklch(0.21 0.012 85 / 0.18);  /* semi-transparent scrim */
display: grid; place-items: start center; padding-top: 14vh;
animation: mer-veil-in 160ms cubic-bezier(...);
```

**Dialog (.veil-body):**
```css
width: min(720px, 92vw);
max-height: 82vh;
overflow-y: auto;
border-radius: 14px;
box-shadow: <shadow>;
animation: mer-panel-in 220ms;  /* rise + fade-in */
```

**Markup:**
```jsx
<div className="mer veil" onClick={() => setCompose(null)}>
  <div className="veil-body" role="dialog" aria-modal="true" aria-label={`${mode} ${dealLabel(deal_type)} (${kind})`} onClick={e => e.stopPropagation()}>
    <DealOfferComposer ... />
  </div>
</div>
```

#### Keyboard & Focus Behavior

**Open:**
- Stores current `document.activeElement` (pre-veil focus)
- Escape key → close veil + restore pre-veil focus
- Click outside veil-body (on the scrim) → close veil

**Closed:**
- cleanup: `prev?.focus?.()` restores the author-bar button that was clicked

**No focus trap implemented** (audit note: aria-modal but missing inert/FocusScope)

#### DealOfferComposer (Form inside veil-body)

**Purpose:** Schema-driven form to collect term-sheet (offer) or need (request) fields

**State:**
```typescript
values: Record<string, unknown>        // form field values
missing: Set<string>                   // which required fields failed validation
submitting: boolean                    // POST in flight
err: string | null                     // fetch error
```

**Schema source:**
```
mode === 'request' ? compose.info.need_schema : compose.info.term_sheet_schema
```

**Form structure:**
```
<form className="composer" onSubmit={submit} aria-label={`Publish ${mode} — ${dealType} (${kind})`}>

  {schema.map(s => {
    const id = `deal-${s.key}`;
    return (
      <div className={missing.has(s.key) ? 'field flag' : 'field'}>
        <label htmlFor={id}>
          {s.label}{s.required && ' *'}
          {s.unit && <span className="mono"> · {s.unit}</span>}
        </label>
        
        {s.type === 'number' && <input type="number" inputMode="decimal" />}
        {s.type === 'string' && <input type="text" />}
        {s.type === 'date' && <input type="date" />}
        {s.type === 'enum' && <select><option>...</option></select>}
        {s.type === 'boolean' && <input type="checkbox" />}
        
        {missing.has(s.key) && <span id={`${id}-err`} className="mono field-required">required</span>}
      </div>
    );
  })}

  <div className="preview" aria-live="polite">
    {hasMonetary ? <>ZAR equivalent · <b>{fmtZar(zarTotal)}</b></> : 'Ready to publish'}
  </div>

  <div className="cascade-hint">{cascadeHint}</div>

  {err && <div className="act-error" role="alert">{err}</div>}

  <div className="actbar-btns">
    <button type="submit" className="btn pri" disabled={submitting}>
      {submitting ? (mode === 'offer' ? 'Publishing offer…' : 'Publishing request…') : ...}
    </button>
    <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
  </div>
</form>
```

**Field Spec:**
```typescript
interface DealFieldSpec {
  key: string;               // form field name
  label: string;             // user-visible label
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean';
  required?: boolean;        // true → * suffix on label
  unit?: string;             // e.g. 'MWh', 'ZAR', 'months'; shown on label
  options?: string[];        // for type:'enum'
}
```

**Validation (on submit):**
- Iterate schema; for each field:
  - If `required === true` and value is null/undefined/empty-string (except booleans, which are always "supplied"):
    - Add to `missing` set; render error
  - If not required and empty: skip validation, pass through as empty/null
- If `missing.size > 0`: early return, block submit
- Else: coerce each field to declared type, call `onPublish(values, {})`

**On error:**
- Catch from onPublish promise
- Extract `e?.response?.data?.error ?? e?.message`
- Set err state, display in `.act-error` alert
- Form remains open; user can fix and retry

**On success:**
- Close veil (parent sets `compose = null`)
- Refetch deals list
- Clear all form state

**Styling:**
- `.field`: flex column, gap 5px, margin-bottom 14px
- `.field.flag`: error state (aria-invalid applied to input/select)
- `label`: small uppercase, mono unit suffix, ink3 color
- `input/select`: full width, petrol focus ring + box-shadow, aria-invalid border = oxide + halo
- `.preview`: mono, 11.5px, petrol-bg summary of ZAR total (live update as user types monetary fields)
- `.cascade-hint`: small petrol-bg box explaining what firing this request/offer does (e.g., "Publishing fires deal.request.published → opens this to providers.")
- `.composer input[type=checkbox]`: intrinsic size, not full width

**Accessibility:**
- form has aria-label matching the action (Request/Offer + deal type + kind)
- each input: id + label htmlFor linkage
- required fields: * suffix on label + aria-required (if implemented)
- error fields: aria-invalid=true + aria-describedby pointing to error span
- preview: aria-live="polite" to announce ZAR total updates
- cascade hint: informational (no role, user reads it)
- submit button: disabled while submitting (shows "Publishing…" instead of "Publish")
- Escape key closes veil (see Keyboard & Focus Behavior above)

**ZAR Preview Live Update:**
- On every keystroke in any field:
  - `hasMonetary = schema.some(s => s.type === 'number' && isMonetary(s.unit))`
  - `zarTotal = schema.reduce(..., 0)` summing all numeric fields with monetary units
  - `.preview` updates (aria-live="polite" announces changes)
  - "Ready to publish" shown if no monetary fields

---

### COMPARE VEIL (Modal: Scored Offer Options)

**Trigger:** Click "Compare offers" button on a request card (only rendered if `offer_count > 0`)

**Flow:**
1. `openCompare(req)` called with DealRequestSummary
2. Fetches `GET /deals/:dealType/options?request_id=:id`
3. Receives `ScoredOption[]` (pre-sorted best-first by est_value_zar)
4. Sets `compare = { req, options }` → mounts Compare Veil

**Veil & Dialog:**
- Same container as Compose Veil (`.mer.veil` + `.veil-body`)
- aria-label: "Compare offers — {dealLabel(deal_type)}"
- Escape key closes compare veil

**OfferCompareGrid (inside veil-body):**

**ScoredOption schema:**
```typescript
{
  option_id: string;
  title: string;                 // provider name / offer title
  primary_metric: number | null;     // headline number (e.g. price, MW)
  est_value_zar: number | null;      // ranked headline value
  sweetener_value_zar: number;       // bundled sweeteners ZAR-equiv sum
  secondary: Record<string, unknown>; // extra fields (rate, unit, notes)
  price_basis: 'firm' | 'indicative' | 'forecast';  // price credibility
  rationale: string;             // why this option is good
}
```

**Grid layout:**
```
<div className="ocard-grid" data-deal-type={dealType} data-request={requestId}>
  {options.length === 0 && <div className="ocard-empty">No matching offers yet.</div>}
  {options.map((opt, i) => (
    <OfferCard key={opt.option_id} opt={opt} best={i === 0} onAccept={opt => accept(...)} />
  ))}
</div>
```

**Empty state:**
- Rendered only if options.length === 0
- Text: "No matching offers yet."
- Implies: wait for providers to respond to the request, or check back later

**Offer Card (individual card in grid):**

**Structure:**
```
┌─ .ocard {best ? '.best' : ''} ─────────────────────┐
│ .ocard-top:                                        │
│  <b>{opt.title}</b>                                │
│  {opt.price_basis === 'indicative' && [chip 'indicative']} │
│                                                   │
│ {opt.primary_metric != null && (                  │
│   <div className="metric">                        │
│     {looksZar(metric) ? fmtZar(metric) : `${metric}${unitHint()}`} │
│   </div>                                          │
│ )}                                                │
│                                                   │
│ {opt.est_value_zar != null && (                   │
│   <div className="est">est value <span className={`zar ${zarMagnitudeClass(est)}`}>{fmtZar(est)}</span></div> │
│ )}                                                │
│                                                   │
│ {opt.sweetener_value_zar > 0 && (                 │
│   <>                                              │
│     <button class="sweet-toggle" aria-expanded={open}> │
│       {open ? '▾' : '▸'} sweeteners               │
│     </button>                                     │
│     <div className={open ? 'sweet-reveal open' : 'sweet-reveal'}> │
│       <div className="sweet">+ {fmtZar(sweetener)}</div> │
│     </div>                                        │
│   </>                                             │
│ )}                                                │
│                                                   │
│ {opt.rationale && <div className="why">{rationale}</div>} │
│                                                   │
│ <button className="btn pri" onClick={onAccept}>Accept</button> │
└────────────────────────────────────────────────────┘
```

**Card styling (.ocard):**
- `.best`: 3px petrol left border (visual "recommended" indicator)
- Hover: border → petrol, lift shadow, scale(0.98) on active
- Margin-bottom: 12px between cards

**Content:**
- `.metric`: large monospace, petrol-deep color, 18px font
  - Determined by `looksZar(metric)`: if >= 1000 → fmtZar format (R 50m), else raw number + unit from secondary
  - Example: price = 750 R/MWh → "750 R/MWh"; value = 50_000_000 → "R 50m"
- `.est`: "est value" label + fmtZar-formatted value, secondary text (ink2)
  - Magnitude class applied: m1 (< 1M), m2 (1M–100M), m3 (>= 100M) for visual weight scaling
- `.sweet-toggle`: mono, 11px, moss-deep color, no border (transparent button)
  - Toggles grid-rows expansion on `.sweet-reveal`
  - aria-expanded reflects state
- `.sweet-reveal`: grid with 0fr→1fr animation on open, opacity fade
  - Opens inline below toggle (no popover, no extra modal)
- `.why`: rationale text, 11.5px, secondary color, 1.45 line-height

**Accept button:**
- `.btn.pri`, onclick → `accept(req, opt)` → POST `/deals/:dealType/accept` with request_id + offer_id
- Disabled state: never (no loading feedback here; parent shows global actErr)

**Keyboard & a11y:**
- Tab through options → each can reach the Accept button
- No focus trap in veil
- Sweetener toggle: aria-expanded reflects open state, keyboard-activatable

**On accept:**
- Parent `accept(req, opt)` called
- POST `/deals/:dealType/accept { request_id: req.id, offer_id: opt.option_id }`
- On success: close veil, refetch deals → both request and offer lanes refresh
- On error: keep veil open, show `actErr` banner above grid

---

### Responsive Behavior (<760px)

**Header:**
- Quicklinks (Deals, ESG, Reports, Intelligence, National) → hidden (will collapse in future implementation, currently static)
- Clock → hidden
- ⌘K hint → hidden or reduced
- Avatar → stays visible

**Body:**
- `.deal-cols`: switches from 2-column (gap 52px) to single column (gap 34px stacked)
- AUTHOR BAR: wraps buttons if needed (flex-wrap: wrap)
- Cards: no layout change, just narrower viewport

**Modals:**
- `.veil-body`: `width: min(720px, 92vw)` adapts to narrow screens
- Composer form: fields stay full width, stack as normal

---

### Error States & Recovery

#### Load Error (initial fetch of deals + types fails)
- Banner rendered: `.act-error` (oxide bg, oxide border)
- Text: "Couldn't load the deal desk. {error_message}"
- Button: "Retry" → calls `loadAll()` again
- Lanes hidden (don't show empty state when uncertain if truly empty)

#### Action Error (publish, compare, accept fails)
- Banner rendered: `.act-error` above lanes/modals
- Text: error message from API
- Button: "Dismiss" → clears error
- Underlying page state persists (if compare was open, it stays open; user can try again)

#### No requests / No offers
- Empty state text shown per lane
- No error tone (this is expected, not a failure)
- AUTHOR BAR still visible (user can create new ones)

---

### Deal Type Coverage & Chain Dispatch

**Deal registry** (src/utils/deal-registry.ts) is static; each DealDescriptor maps:
```typescript
deal_type: string
kind: InteractionKind  // marketplace | auction | syndication | negotiation | obligation | submission
accept_dispatch: {
  live: { chain_key: string; endpoint: (caseSeed: Json) => string };
  upcoming: { loi: true } | null;
}
```

**How deals map to chains:**
- Each deal_type has an `accept_dispatch.live.chain_key` (e.g., "energy_supply" → "ppa")
- When user accepts an offer, the deal engine calls `POST /api/ledger/{chain_key}/create` (or equivalent chain initiation endpoint)
- Returned case_id is stored in request.dispatched_case_id + request.dispatched_chain_key
- Request card button then links to `/thread/{chain_key}/{case_id}` (or `/lois/{case_id}` if loi)

**One canonical entry per chain?**
- Ledger `/ledger/:chainKey?compose=1` initiates via schema-driven +New form
- Deal Desk `/deals` initiates via schema-driven Compose form (request/offer match → dispatch)
- Reconciliation: both feed the same chain, but different flows
  - Ledger: synchronous state-machine kickoff (clerk fills order details, submits, case created)
  - Deal Desk: bilateral/marketplace (provider publishes terms, demand shops, selects, case created from accepted deal)
- A role might reach the same chain via EITHER path depending on their position (demand vs supply)

---

### Live States & Transitions

#### Request Lifecycle
```
Authored (status: 'open', stage: 'offer')
  ↓ providers publish offers
Matched (status: 'open', stage: 'match')
  ↓ demand opens Compare veil
Evaluate (status: 'open', stage: 'evaluate')
  ↓ demand selects one option
Accept (status: 'open', stage: 'accept')
  ↓ POST /deals/:type/accept
Dispatched (status: 'open', stage: 'track', dispatched_chain_key + case_id set)
```

**Process rail updates in real-time as card renders** (computed from dealStage(r) function).

#### Offer Lifecycle
```
Authored (status: 'live')
  ↓ matched by demand engine (async background job)
Matched (status: 'live', request_id set)
  ↓ demand clicks Compare
Evaluated (status: 'live')
  ↓ demand accepts
Accepted (status: 'accepted')
```

---

### Keyboard Shortcuts (Global)

Not implemented in DealDeskPage itself, but inherited from MeridianHeader:
- **⌘K** → Atlas (command palette)
- **/new** header link → transaction picker
- **Deals** header link → /deals (self)
- **Escape** → closes open veil (Compose or Compare)

---

### Accessibility Features Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| aria-label on sections | ✓ | "My requests", "My offers", "Author a deal" |
| aria-label on modals | ✓ | "Request X (kind)", "Compare offers — X" |
| aria-modal="true" on veil-body | ✓ | But no inert sibling or focus trap |
| aria-busy="true" during load | ✓ | Skeleton state |
| role="alert" on error banners | ✓ | `act-error`, `load-error` |
| aria-live="polite" on preview | ✓ | ZAR total updates announced |
| aria-invalid + aria-describedby | ✓ | Required field errors in Composer |
| aria-expanded on sweetener toggle | ✓ | Reflects open/closed state |
| aria-current="step" on process rail | ✓ | `.step.now` marks current stage |
| aria-haspopup on avatar menu | ✓ | MeridianHeader, not Deal Desk |
| Focus restoration on veil close | ✓ | Restore pre-veil focus (author button) |
| Keyboard navigation Tab | ✓ | All inputs/buttons are Tab-reachable |
| Escape key to close veil | ✓ | Global keydown listener |
| Visible focus rings | ✓ | Petrol halo on input:focus-visible, inset oxide+petrol on invalid |
| Secondary text contrast | ⚠️ | ink3 (var(--ink3)) may fall below WCAG AA; design review needed |
| Reduced motion support | ✓ | @media (prefers-reduced-motion:reduce) neutralizes transform + easing |

**Audit findings:**
- **Missing focus trap**: veil has aria-modal but no FocusTrap/inert directive. Pressing Tab inside Compare modal may focus elements outside the veil.
- **Missing role="list" semantics**: deal lanes don't use <ul>; cards are <div className="dcard">. Could be acceptable if cards are presentational (not required).
- **Inline required asterisk**: "label {required && ' *'}" is good; no red-only indicator.

---

### Copy Strings (Verbatim User-Visible Text)

| Context | String | Component |
|---------|--------|-----------|
| Header context | "DEAL DESK" | MeridianHeader.tsx |
| Header counts | "{requests.length} requests · {offers.length} offers" | DealDeskPage.tsx |
| Load error | "Couldn't load the deal desk. {error}" | DealDeskPage.tsx |
| Load error CTA | "Retry" | DealDeskPage.tsx |
| Action error CTA | "Dismiss" | DealDeskPage.tsx |
| Skeleton | "Loading deal desk…" | DealDeskPage.tsx |
| Request empty | "No open requests. Author one from the bar above." | DealDeskPage.tsx |
| Offer empty | "No live offers. Author one from the bar above." | DealDeskPage.tsx |
| Lane heading | "MY REQUESTS" / "MY OFFERS" | DealDeskPage.tsx |
| Compare button | "Compare offers" | DealDeskPage.tsx |
| Open thread button | "Open thread" | DealDeskPage.tsx |
| Open LOI button | "Open LOI" | DealDeskPage.tsx |
| Compose mode | "Request {dealLabel}" / "Offer {dealLabel}" | DealDeskPage.tsx (author-bar) |
| Field required suffix | "*" | DealOfferComposer.tsx |
| Field error | "required" | DealOfferComposer.tsx |
| Preview ready | "Ready to publish" | DealOfferComposer.tsx |
| Request cascade hint | "Publishing fires deal.request.published → opens this to providers." | DealOfferComposer.tsx |
| Offer cascade hint | "Publishing fires deal.offer.published → notifies matching demand parties." | DealOfferComposer.tsx |
| Submit button idle | "Publish request" / "Publish offer" | DealOfferComposer.tsx |
| Submit button loading | "Publishing request…" / "Publishing offer…" | DealOfferComposer.tsx |
| Cancel button | "Cancel" | DealOfferComposer.tsx |
| Composer error | "{error.response.data.error \|\| error.message}" | DealOfferComposer.tsx |
| Compare empty | "No matching offers yet." | OfferCompareGrid.tsx |
| Accept button | "Accept" | OfferCard (in OfferCompareGrid.tsx) |
| Sweetener toggle closed | "▸ sweeteners" | OfferCard |
| Sweetener toggle open | "▾ sweeteners" | OfferCard |
| Indicative chip | "indicative" | OfferCard |
| Est value label | "est value" | OfferCard |

---

### Future Enhancements (Out of Scope for This Spec)

1. **Deep-link into Compose**: Future `/deals/new?type=energy_supply&mode=request` to skip the author-bar and open Compose directly.
2. **Bulk deal management**: Export, filter, sort on requests/offers lanes.
3. **Notifications**: Badge on Deals quicklink when new offers arrive.
4. **Syndication UI**: Multi-tranche allocation picker for syndicated deals.
5. **Negotiation UI**: Counter-offer and decline workflows (currently read-only offer cards).
6. **Deal timeline**: Historical transitions + cascaded events visible in a side panel or modal.
7. **Admin Deal Desk**: separate surface for admins to view cross-tenant deals (current scope is per-tenant only).
