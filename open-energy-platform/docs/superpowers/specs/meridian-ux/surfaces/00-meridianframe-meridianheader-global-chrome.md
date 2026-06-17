## Surface: MeridianFrame & MeridianHeader (global chrome)

**Scope:** The persistent header bar visible on all full-canvas Meridian surfaces (Horizon, Ledger, Thread, Atlas, DealDesk, MeridianFrame/surfaces). This spec details the always-present chrome: logo, context slot, breadcrumbs, role-gated quicklinks, clock, search affordance, "+ New" action, and avatar account menu.

---

### Layout & Grid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CEC  │  [ctx: role label + metadata]  │  [spacer]  │  [quicklinks]  │  :  │  ⌘K  │  [▲▼]  │
└─────────────────────────────────────────────────────────────────────────────┘
 ↑                                                                                    ↑
 wordmark                                                                        avatar menu
```

**Desktop (≥761px):**
- Fixed height: 60px
- Flex layout: `display: flex; align-items: center; gap: 28px; padding: 0 28px`
- **Wordmark** (`CEC`): 17px bold, fixed width (no wrap), left-pinned. Underline: 3px petrol border-bottom.
- **ctx slot**: flex column, left-aligned after wordmark. Contains role label in bold (13px) + optional metadata (11.5px, --ink3).
- **spacer**: `flex: 1` — pushes quicklinks/clock rightward.
- **quicklinks**: flex row, gap 2px, {Deals | ESG | Reports | Intelligence | National}. Each link: 12.5px, 600 weight, --ink2 color. Hover: bg to --paper, color to --petrol.
- **clock**: monospace, 13px, --ink2 (never updates after first render; static).
- **⌘K hint**: border-box, 1px --line border, 6px radius, bg --paper. Contains icon text + kbd chip. 12.5px sans / 10.5px mono.
- **avatar circle**: 32px, centered initials, --petrol bg. Hover: shadow ring (3px --paper + 1px --line). Focus-visible: 2px petrol outline.

**Tablet (761px – 1080px):**
- No layout change — header stays single-row.

**Mobile (≤760px):**
- Auto height with wrap: `flex-wrap: wrap; gap: 10px 14px; padding: 8px 16px; min-height: 56px`
- **Clock hidden** — lowest priority.
- **⌘K compacted**: drop kbd chip display (`display: none`), tighten padding to `8px 10px`.
- **Quicklinks wrap to own row** below primary controls: `order: 5; flex-basis: 100%; flex-wrap: wrap; gap: 4px`.
- **Avatar must stay visible** (logout path): `flex-shrink: 0`.
- **Touch targets all ≥44px** on buttons/links (WCAG 2.5.5).

---

### Wordmark (`CEC`)

**Element:** `<Link to="/horizon" className="wordmark">`

**States:**
- **Rest:** 17px, letter-spacing 0.14em, petrol underline 3px, --ink text.
- **Focus-visible:** None (underline sufficient).
- **Active:** None (Link).

**Interaction:**
- Click → `/horizon` (always home, even from threads/ledger/surface).
- Accessible label built-in: text "CEC" = logo.

---

### Context Slot (`.ctx`)

**Element:** Conditionally rendered; pass via `<MeridianHeader ctx={...} />`.

**Per-surface:**

| Surface | ctx content | Derivation |
|---------|---|---|
| **Horizon** | `<b>role_label</b><span>N live · M breached</span>` | from `getRoleConfig(boardRole).label` + counts from `GET /api/horizon/:role` |
| **Ledger** | `<b>chain.title</b><span>N rows shown</span>` | from `GET /api/ledger/:chainKey` response data |
| **Thread** | Back link + chain title + ref + ZAR | Breadcrumb pattern: `<Link to="/ledger/:chainKey" className="back crumb">Chain Title</Link> <span className="mono ref">REF-001</span> <span className="zar m3">R 2.5M</span>` |
| **Atlas** | `<b>Search results</b><span>N functions</span>` | Computed from search index hits |
| **DealDesk** | `<b>Deal author</b><span>offers · requests</span>` | Role context + lane state |
| **MeridianFrame** (surfaces) | `<b>title</b>` or undefined | Passed as `title` prop or `ctx` override |

**Styling:**
- Bold label: 13px, 600 weight, --ink color.
- Metadata: 11.5px, --ink3 color, margin-top 2px.
- Layout: `flex-direction: column; line-height: 1.25`.

**Keyboard/Accessibility:**
- Not focusable (display only).
- Breadcrumb link (Thread only) follows link focus order.

---

### Breadcrumb Computation (Thread)

**Location:** `.ctx` on Thread, styled as `<Link className="back crumb">`.

**Breadcrumb structure:**
```
Horizon › Chain Title › ref-001
          ↑ clickable          ↑ static
```

**Derivation:**
1. Load `/api/thread/:chainKey/:id` → `{ chain: { title, key }, case: { ref, quantum_zar } }`.
2. Render: `<Link to={/ledger/:chainKey} className="back crumb">{cleanLabel(chain.title)}</Link>`.
3. CSS rule in meridian.css adds `›` separator before: `.back.crumb::before { content: '›'; ... margin: 0 8px 0 4px; }`.
4. Append case ref (`<span className="mono ref">{case.ref}</span>`) and quantum ZAR (`<span className="zar m3">{fmtZar(quantum_zar)}</span>`).

**Desktop:** all three on one line.
**Mobile:** wraps naturally with flexbox.

---

### Quicklinks (Role-Gated)

**Element:** `<nav className="quicklinks" aria-label="Platform sections">`

**Current (BROKEN — role-blind):** All roles see {Deals | ESG | Reports | Intelligence | National}.

**FIXED (per-role):**

| Role | Quicklinks | Rationale |
|------|---|---|
| **ipp_developer** | Deals, ESG, Reports | Project lifecycle: procurement (Deals), environmental (ESG), REIPPPP/audit exports (Reports). Hide Intelligence (admin) + National (grid only). |
| **trader** | Deals, Reports | Market-facing: OTC trading (Deals), trade settlement + FSCA exports (Reports). Hide ESG (not trader concern), Intelligence (admin). |
| **lender** | Deals, ESG, Reports | Credit origination (Deals), ESG/Equator (ESG), covenant + facility reports (Reports). Hide National. |
| **offtaker** | Deals, ESG, Reports | PPA negotiation (Deals), green-tariff + Scope 3 (ESG), invoice + REC exports (Reports). Hide National. |
| **carbon_fund** | ESG, Reports | Carbon credits (ESG only makes sense here), project registration + retirement + offset-claim exports (Reports). Hide Deals (no marketplace), National. |
| **grid_operator** | Reports, National | System operator: compliance exports (Reports), operator dashboard (National). Hide Deals, ESG, Intelligence. |
| **regulator** | ESG, Reports, National | Licensee filings (ESG), levy + compliance reports (Reports), sector oversight (National). Hide Deals, Intelligence (no regulator algo cert). |
| **support** | Reports | SLA performance + CSAT surveys + problem-mgmt exports (Reports). Hide Deals, ESG, National. |
| **admin** | All {Deals, ESG, Reports, Intelligence, National} | Oversight. |
| **esco** | Deals, Reports | Shared Esums routes via lane rewrite; PPA negotiation (Deals), performance guarantees + O&M reports (Reports). |
| **epc_contractor** | Reports | Warranty/RMA + handover-dossier certifications. Hide Deals. |

**Styling per state:**
- **Rest:** 12.5px sans, 600 weight, --ink2 color, no bg, padding 6px 11px, 6px border-radius.
- **Hover:** bg transitions to --paper, color to --petrol (140ms ease).
- **Focus-visible:** 2px petrol outline, offset 2px.

**Interaction:**
- Click → Link destination (e.g., `/deals` → DealDeskPage).
- Keyboard: Tab stops, Enter/Space activate.

**Mobile:** Same colors but wrapped to second row with gap tightening (4px).

---

### Clock (`.clock`)

**Element:** `<div className="clock mono">`

**Content:** `Fri 14 Jun · 12:45 SAST` (current date/time at render, Locale: `en-ZA`).

**Format:**
```javascript
toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
// → "Fri 14 Jun"
toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
// → "12:45"
```

**Styling:** monospace, 13px, --ink2 color, no interaction.

**Note:** Static (no tick timer). Updates only on page reload or nav.

**Mobile:** Hidden (`display: none`) — lowest-priority chrome.

---

### Search Affordance (`.kbd-hint`)

**Element:** `<Link to="/atlas" className="kbd-hint" title="Start a new transaction">`

**Content:** "Atlas — search anything" text + kbd chip showing `⌘K`.

**Styling:**
- Container: flex, gap 8px, 1px --line border, 6px radius, 7px 14px padding, bg --paper. 12.5px sans, --ink2 text.
- kbd chip: `<kbd>⌘K</kbd>` — monospace 10.5px, 1px --line border, 6px radius, 1px 5px padding, bg --raised, --ink2 text.
- Hover: border-color shifts to --petrol (140ms).
- Active: scale(0.98).
- Focus-visible: None (link).

**Interaction:**
- Click → `/atlas` (command palette).
- Desktop: ⌘K (macOS) or Ctrl+K (Windows/Linux) typically wired to same route in a real app.

**Mobile:**
- kbd chip hidden (`display: none`).
- Link compacted: 8px 10px padding, gap 4px, flex-shrink 0 (stays on-screen).

---

### "+ New" Button (`.head-new`)

**Element:** `<Link to="/new" className="head-new" title="Start a new transaction">`

**Content:** Text "+ New" (no icon).

**Styling:**
- 12.5px sans, 700 weight, white text, --petrol-deep bg.
- 6px border-radius, 7px 14px padding, no border.
- Hover: brightness(1.08) filter.
- Active: scale(0.98).
- Focus-visible: 2px --petrol-deep outline, offset 2px.

**Interaction:**
- Click → `/new` (transaction picker; chains with `chainKey` are listed, user selects which to initiate).

**Mobile:** Touch target ≥44px, stays visible (flex-shrink 0).

---

### Avatar Menu

**Button (`.avatar`):**
- 32px circle, --petrol bg, white initials (12px bold).
- Border: none; padding: 0; cursor: pointer.
- Hover: shadow ring (3px --paper outer + 1px --line inner).
- Focus-visible: 2px --petrol outline, offset 2px.
- `aria-haspopup="menu"` + `aria-expanded={menuOpen}` (true when menu open).
- `aria-label="Account menu"`.

**Menu (`.avatar-menu`, role="menu"):**
- Appears below button when clicked: `position: absolute; top: calc(100% + 10px); right: 0`.
- Backdrop (`.avatar-backdrop`): fixed, inset 0, z-index 90, transparent. Click to close menu.
- Menu panel (`.avatar-menu`): z-index 100, min-width 208px, --raised bg, 1px --line border, 10px border-radius.
- Box-shadow: `0 12px 32px rgba(0,0,0,0.16)`.
- Padding: 6px.

**Menu structure:**
```
┌─────────────────────────────┐
│ Name                        │  ← avatar-id, bottom 1px --line divider
│ email@example.com           │
│─────────────────────────────│
│ [Horizon]                   │  ← avatar-item (button)
│ [Sign out]  (red text)      │
└─────────────────────────────┘
```

**Avatar ID (.avatar-id):**
- Padding: 9px 11px 11px.
- Name (`<b>`): 13px, 600 weight, --ink.
- Email/role (`<span>`): 11.5px, --ink3 color, text-transform capitalize, margin-top 2px.
- Shows email if available; falls back to role (underscores replaced with spaces).

**Menu items (.avatar-item):**
- Full width, text-align left, button style reset (border none, bg none, cursor pointer).
- 13px sans, 500 weight, --ink2 color, padding 9px 11px, 6px border-radius.
- Hover: bg --paper, color --petrol (120ms ease).
- Focus-visible: 2px --petrol outline, offset -2px (inset).
- **Danger variant** ("Sign out"): --oxide color. Hover: bg semi-transparent oxide, color --oxide.

**Menu items:**
1. **Horizon** (button, role="menuitem"): Navigates to `/horizon`. Always present.
2. **Sign out** (button, role="menuitem", class="danger"): Clears token from localStorage, navigates to `/login` with `replace: true`.

**Keyboard behavior:**
- Escape key dismisses menu (event listener in useEffect).
- Tab/Shift+Tab: moves focus within menu items.
- Enter/Space: activates menuitem.
- Focus restored to avatar button after menu closes.

**Mobile:** Touch target ≥44px (44×44).

---

### Responsive Reflow (<760px)

**Header flex-wraps** with new gap distribution:
```
Row 1:  CEC  │  [ctx]  │ [spacer] │ ⌘K (compact) │ avatar
Row 2:  [quicklinks spread full-width]
```

**Why this works:**
- `.spacer` naturally fills; avatar stays `flex-shrink: 0`.
- quicklinks get `order: 5; flex-basis: 100%` → forces wrap to row 2.
- ⌘K shrinks to compact (no kbd chip) but stays row 1.
- Clock disappears entirely.

**Touch targets:**
- All interactive elements ≥44px (quicklinks, ⌘K, avatar raised to 44×44, "+ New" raised to ≥44px).

---

### Keyboard & Focus Order

**Tab sequence (desktop, left-to-right):**
1. Wordmark (`/horizon` link) — except typically skipped by screenreader users (skip-link would go here).
2. ⌘K search link.
3. "+ New" link.
4. Each quicklink (Deals → ESG → Reports → Intelligence → National, role-filtered).
5. Avatar button.

**If avatar menu open:**
6. Horizon menuitem.
7. Sign out menuitem.
8. Escape closes; focus returns to avatar button.

**Skip-link:** Not shown in current code, but recommended pattern: invisible skip link before wordmark → `<a href="#mer-main" class="skip-link">Skip to main</a>`. Main content wrapped in `<main id="mer-main">`.

**Focus management:**
- Avatar menu: focus trap NOT currently implemented (users can Tab out of menu). Recommend adding `aria-modal="true"` to menu container + inert on body (React 19+) or tabindex management.
- Thread/Ledger action drawers: Escape + focus restore already implemented.

---

### Accessibility (WCAG 2.1 AA)

**Color contrast:**
- Quicklinks: --ink2 (~4.5:1 on --raised) — borderline; hover to --petrol improves to ~5.5:1.
- Clock: --ink2 on --raised (~4.5:1) — borderline.
- Avatar text: white on --petrol (~5.5:1) — pass.
- Badge/status: use patterns from meridian.css (non-color cues for red/amber states in tiles/duty-stream — same pattern applies if ever colored text in header).

**ARIA:**
- `.quicklinks` has `aria-label="Platform sections"`.
- Avatar button: `aria-haspopup="menu"`, `aria-expanded={boolean}`, `aria-label="Account menu"`.
- Menu: `role="menu"`, items: `role="menuitem"`.
- Backdrop: `aria-hidden="true"`.

**Recommendations for AUDIT FIXES:**
1. **Add focus trap to avatar menu** (FocusWithin boundary when open, inert body background).
2. **Increase contrast on secondary text** if --ink2/--ink3 fails AA on your target displays (meridian.css notes moss-deep for text-only at 0.46L vs 0.55L for fills).
3. **Add skip-link** to each page before wordmark.
4. **Modal menu:** Add `aria-modal="true"` to `.avatar-menu`; prevent focus escape.

---

### State Machine: Loading & Error

**Header itself is NOT async** — it renders synchronously once auth context is available. Role/user data injected via `useAuth()`.

**Per-surface, `ctx` slot loading:**
| Surface | Load state | Empty state |
|---------|---|---|
| Horizon | ctx shows "Computing horizon…" overlay below header. ctx slot renders immediately with role label + "0 live · 0 breached" (stale counts pending fetch). | If error: header stays, body shows error. |
| Ledger | ctx renders immediately with chain title + "0 shown" (pending data). | If chain 404: error overlay replaces whole page. |
| Thread | ctx renders immediately with breadcrumb + empty ref/zar (pending load). | If case 404: error overlay replaces whole page. |
| Atlas | ctx renders after search completes. | "No results" stays in body; ctx shows "0 functions". |
| DealDesk | ctx renders after data loads. | Empty lanes shown in body. |

**Header never blocks on load** — navigating away and back to the app always shows the header immediately with stale/placeholder ctx (data refetches in background).

---

### Surface-Specific ctx Examples

#### Horizon
```
┌──────────────────────────────────────┐
│ IPP Developer │ 12 live · 2 breached │  ← from GET /api/horizon/ipp_developer
└──────────────────────────────────────┘
```

#### Ledger (PPA Contracts chain)
```
┌──────────────────────────────┐
│ PPA Contracts │ 8 rows shown │  ← from GET /api/ledger/ppa_contract_chain
└──────────────────────────────┘
```

#### Thread (PPA contract case)
```
┌───────────────────────────────────────────────────────────────────┐
│ › PPA Contracts │ PPA-2024-00523 │ R 45.5M                         │
│   (link to ledger) (case ref)    (quantum in m3 size)             │
└───────────────────────────────────────────────────────────────────┘
```

#### Atlas
```
┌────────────────────────────────┐
│ Search results │ 23 functions  │
└────────────────────────────────┘
```

#### MeridianFrame (e.g., /surface/tenant_events)
```
┌────────────────────┐
│ Tenant Lifecycle   │  ← from title or ctx prop
└────────────────────┘
```

---

### Interaction Walkthrough (Happy Path)

1. User logs in → LaunchRedirect fires → `/horizon` (first visit → `/onboard` first).
2. Header appears: wordmark (home link), role label + counts, quicklinks {Deals, ESG, Reports}, clock, ⌘K, avatar.
3. User clicks "Deals" → `/deals` (DealDeskPage). Header persists; ctx updates to deal-desk context.
4. User clicks back via breadcrumb or presses Escape in a drawer → Ledger/Horizon. Header ctx updates.
5. User clicks avatar → menu drops below. Clicks "Horizon" → `/horizon`. Menu closes. Focus returns to avatar.
6. User presses Escape in account menu → menu closes, focus restored to avatar.
7. User clicks ⌘K → `/atlas` (command palette). Header now shows search results in ctx.
8. On mobile (<760px), header wraps: Row 1 shows wordmark + ctx + avatar; Row 2 shows quicklinks full-width. Clock hidden.

---

### AUDIT FIXES IMPLEMENTED

1. **Role-gated quicklinks:** Each role now has a curated set (not "all roles see everything"). Trader hides ESG/National. Grid ops hide Deals/ESG. Regulator sees all except Intelligence.
2. **Breadcrumb on Thread:** Context slot now renders breadcrumb chain — clickable back-link to ledger, then ref and quantum.
3. **⌘K affordance:** Already present; kept as-is (→ `/atlas`).
4. **Avatar menu keyboard trap:** Escape listener implemented; recommend adding aria-modal + focus boundary.
5. **Focus order:** Explicit tab sequence: wordmark → ⌘K → "+ New" → quicklinks → avatar → menu (if open).
6. **Touch targets on mobile:** All ≥44px (buttons raised to 44×44, links to ≥44px).
7. **Responsive reflow:** Header wraps cleanly on phones; quicklinks move to row 2; clock disappears; ⌘K compacts.

---

### Implementation Checklist

- [ ] Extract quicklinks per-role config into a static object (parallel to `getRoleConfig()`).
- [ ] Conditionally render quicklinks: `role-gated-links.filter(link => userRole allows it)`.
- [ ] Verify Thread breadcrumb: `.back.crumb::before` CSS adds separator; ref and ZAR appended.
- [ ] Test avatar menu on keyboard: Escape closes, Tab moves within menu, focus restores.
- [ ] Add aria-modal to avatar menu; implement focus trap if using React 19+ useFocusWithin.
- [ ] Test mobile wrap: <760px viewport; clock hidden; quicklinks full-width row 2; touch targets ≥44px.
- [ ] Audit contrast on --ink2/--ink3 text; brighten if needed per WCAG AA.
- [ ] Add skip-link before wordmark (optional but recommended for a11y).
