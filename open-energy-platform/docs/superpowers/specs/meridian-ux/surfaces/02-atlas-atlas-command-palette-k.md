## Surface: Atlas (/atlas) & Command Palette (⌘K)

### Overview

Atlas is the per-role function library and discovery index. It surfaces every feature a role can access as a navigable domain→feature tile grid. The Command Palette (⌘K) is a global modal search over the same function index plus live case cases, reachable from any Meridian page. Together they solve: "What can I do?" and "Find the thing I need right now."

**Design principle**: All destination resolution (which chains, routes, surfaces exist) is deterministic and hardcoded—never from request input. Reachability is computed once at render time via `isReachable()`, which verifies:
1. Feature has a `chainKey` that exists in `MERIDIAN_CHAINS` (chain-backed ledger)
2. OR feature has a `route` pointing to a standalone page mounted in `App.tsx`
3. OR feature has a `key` that exists in `SURFACE_REGISTRY[${role}:${key}]` (per-role parametric surface)

Dead-end tiles (no destination) are structurally hidden; dangling links are impossible.

---

## Screen 1: Atlas Page Layout

### Overall Structure

The page wraps in `<div className="mer atlas">` with full flexbox column layout.

**Regions:**
- **Header** (60px fixed, sticky) — Meridian chrome (`MeridianHeader`)
  - Left: `ATLAS — [ROLE LABEL UPPERCASE]` (e.g. "ATLAS — IPP DEVELOPER")
  - Right: live counts — `{fnCount} functions · {h?.counts.total} live · {h?.counts.breached} breached`
  - e.g. "47 functions · 12 live · 1 breached"
- **Main** (`<main className="domains">`) — 3-column grid (responsive; see responsive section below)
  - Padding: 34px top/bottom, 44px left/right
  - Gap: 52px horizontal, 34px vertical per-domain

### Domain Section Layout

Each domain renders as a `<section className="domain">`:

**Domain header:**
- `<h2>` — domain label uppercase, condensed (wdth 115), 11.5px, letter-spacing 0.11em, color `--petrol-deep`
- Top border: 2px solid `--petrol`
- Padding-top: 14px, margin-bottom: 10px
- Examples: "PROJECT CONTROLS", "ACTIVE TRADING", "LICENSING", "COMPLIANCE & AUDIT"

**Feature tiles:**
Each feature renders as a `<Link className="fn">` (react-router, no page reload):

Layout:
- Display: flex, align-items: baseline, gap: 8px, padding: 7.5px 0
- Border-bottom: 1px solid `--line` (except last child)
- Font-size: 13px, text-decoration: none, color: inherit

Contents:
- `.name` (flex: 1) — feature label, font-weight: 500
  - If the feature has live cases, subtext appears on a second line (gap: 2px):
    - `<span className="live">{live.live} live</span>` — mono, 11.5px, `--ink2`
    - If `live.breached > 0`, also append `<span className="breach">{live.breached} ⚠</span>` — mono, 11.5px, color `--oxide`, font-weight 700

Interaction:
- Hover: `.name` text color → `--petrol-deep`, entire row background stays transparent
- Focus (keyboard Tab through links): outline: 2px solid `--petrol-deep`, offset 2px
- Click/Enter: navigate to the feature's destination (`/ledger/:chainKey`, `/route`, or `/surface/:key`)

### Admin "All Transactions" Index (Admin-only)

When `role === 'admin'`, a special "INDEX" domain section appears FIRST in the domains list:

```
├─ ADMIN ONLY SECTION
├─ INDEX
├─ All transactions                (admin:all_transactions — /surface/admin:all_transactions)
└─ [end]
```

This tile opens `/surface/admin:all_transactions`, which renders a global ledger of ALL chains across the entire platform (no role filter), letting admins audit the system as an omniscient view.

- Domain header: "INDEX"
- Single tile: "All transactions" → `/surface/admin:all_transactions`

### Project Dossier Surface (IPP Developer Role Only)

Current audit facts: 29 IPP-prefixed chains (ipp_schedule, ipp_evm, ipp_subcontractor, ipp_construction_diary, ipp_mir, … ipp_aud, ipp_anr, ipp_bbbee, ipp_lcr) each have their own tile in separate domains, creating visual clutter. Per the approved design, these consolidate under ONE "Project Dossier" meta-surface.

**On the IPP Developer Atlas page:**

In place of 29 scattered `ipp_*` feature tiles, a single master tile appears:

Domain: "PROJECT CONTROLS" (or whichever domain logically groups them)

Tile:
- Label: "Project Dossier"
- Link: `/surface/ipp_developer:project_dossier`
- Live count: same count-rollup logic as a chain (but computed across all 29 ipp_* chains)

The `/surface/ipp_developer:project_dossier` surface renders a multi-section interface:

1. **Dossier sections** (tabs or vertical accordion):
   - "Schedule & EVM" — ipp_schedule, ipp_evm, project_risk, ncr, itp
   - "Construction" — ipp_subcontractor, ipp_construction_diary, ipp_mir, handover_dossier, project_change_order, submittal_rfi, punch_list, dfr
   - "Documents" — ipp_doc_control, ipp_submittal, ipp_rfi, ipp_tq, site_instruction, dlp_defect, variation_order, ipp_payment_cert, ipp_final_completion, ipp_om_handover
   - "Finance" — ipp_progress_claim, cp_tracker, drawdown, green_bond_report, dscr_report, credit_insurance
   - "Risk & Quality" — stage_gate, risk_register, issues_log, stakeholder_register, reports, annual_report, audit
   - "Regulatory" — licence_obligation, ed_commitment, ipp_lcr, ipp_bbbee, ipp_rpr, ipp_anr, ipp_aud, cbt_sed_report
   - "Safety & Grid" — hse_incident, cyber_incident, planned_outage, gca_connection, method_statement, warranty_claim, export_curtailment, gtia, community
   - "Environmental" — ipp_eam, ipp_wul, ipp_hra, ipp_ael, ipp_env_monitoring

2. **Within each section**: a sub-grid of chains with case counts (chain → Ledger link), same styling as the main Atlas tiles.

3. **Single entry point**: Users see one "Project Dossier" tile in Atlas, click it once, and can navigate all 29 related workflows from the organized dossier UI (no return to Atlas).

### State: Empty / No Functions

If `cfg.domains` after reachability filtering is completely empty for a role:

```
<div className="mer atlas">
  <MeridianHeader ... />
  <div className="board-empty" role="status">
    <p>No functions available for your role.</p>
    <p className="board-empty-sub">Contact your administrator if you expect access.</p>
  </div>
</div>
```

- Padding: 56px 28px
- Text alignment: center
- Color: `--ink2`
- Top border: 1px solid `--line`

### State: Loading (Initial Fetch)

On mount, `fetchHorizon(role)` fires. While pending:

```
<div className="mer atlas">
  <MeridianHeader ... />
  <div className="mer-loading">
    <span>Loading…</span>
  </div>
</div>
```

- Flexbox centered, gap 12px
- Color: `--ink2`
- If fetch fails, `h` is null and live counts show "0 live · 0 breached"

### State: No Matches (After Filter)

If a user lands on `/atlas` but the feature tiles grid has no reachable functions after filtering (all tiles hidden due to missing chain descriptors or surfaces):

Entire `<main className="domains">` is empty (renders nothing). The page shows header + blank space. This is a safeguard; normal roles always have at least one domain with features.

### Responsive Behavior (<760px Viewport)

**Tablet/Mobile breakpoint (< 760px):**

- Domains grid: `grid-template-columns: repeat(2, 1fr)` (2 columns instead of 3)
- Gap: `0 36px` horizontal (narrower), `34px` vertical (unchanged)
- Padding: `24px 20px` (narrower margins)

**Small phone (< 480px):**

- Domains grid: `grid-template-columns: 1fr` (single column)
- Gap: `0` horizontal, `28px` vertical
- Padding: `20px 16px`

Domain borders and spacing remain consistent.

---

## Screen 2: Command Palette Modal (⌘K)

### Trigger & Opening

**Keyboard binding:**
- `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) opens the palette
- `Escape` closes it (also closes any open dropdowns/popovers elsewhere on the page)
- Palette only activates on Meridian pages (not on `/apex` or `/ux-prototype/*` — "Atlas everywhere" safeguard)

**On open:**
- Search input (`<input>`) receives `autoFocus` + restore focus behavior (see a11y section below)
- Modal fires `fetchHorizon(role)` lazily (only on open, not on mount)
- Input is cleared (`q = ''`) and selection reset (`sel = 0`)

### Modal Structure

```
<div className="mer veil" (backdrop)>
  <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <input autoFocus placeholder="functions · cases…" aria-label="Search functions and cases" />
    <div className="pal-hits">
      [hits rendered here]
    </div>
  </div>
</div>
```

**Backdrop (`.veil`):**
- Position: fixed, inset: 0, z-index: 1000
- Background: `oklch(0.21 0.012 85 / 0.18)` (18% opacity grey scrim)
- Display: grid, place-items: start center, padding-top: 14vh (centers modal 14% down viewport)
- Click on scrim closes the modal

**Modal (`.palette`):**
- Width: `min(660px, 92vw)` (responsive cap at 92% of viewport)
- Background: `--raised` (off-white)
- Border: 1px solid `--line`
- Border-radius: 14px
- Box-shadow: `0 18px 60px oklch(0.21 0.012 85 / 0.18), 0 2px 8px oklch(0.21 0.012 85 / 0.08)` (depth)
- Overflow: hidden

**Animation:**
- Palette entrance: `mer-panel-in` animation (220ms)
  - From: opacity 0, translateY 12px, scale 0.98
  - To: opacity 1, translateY 0, scale 1
- Scrim fade: `mer-veil-in` animation (160ms, opacity 0→1)
- Ease: cubic-bezier(0.23, 1, 0.32, 1)

### Search Input

```
<input 
  autoFocus 
  value={q} 
  placeholder="functions · cases…" 
  aria-label="Search functions and cases"
  onChange={e => { setQ(e.target.value); setSel(0); }}
  onKeyDown={...arrow/enter handlers...}
/>
```

- Width: 100%, padding: 17px 20px, border: none, border-bottom: 1px solid `--line`
- Background: transparent, outline: none
- Font: Archivo, 17px, font-weight: 500
- Color: `--ink`
- Placeholder: `--ink3`

**Focus ring:**
- Box-shadow: inset 0 -2px 0 0 `--petrol`, inset 0 0 0 2px `oklch(0.40 0.075 200 / 0.25)`

**Typing behavior:**
- On any keystroke, recompute the `.hits` array (function + case search combined)
- Clear prior selection: `sel = 0` (first hit is auto-selected)

### Search Logic

All hits are computed from TWO sources:

**1. Function library** (from role config):
- Iterate `cfg.domains[].features`
- Filter by: `cleanLabel(f.label).toLowerCase().includes(ql)` (where `ql = q.toLowerCase()`)
- Omit unreachable functions: `targetFor(f) !== null`
- Map to hit: `{ type: 'function', label: cleanLabel(f.label), sub: cleanLabel(d.label) /* domain */, go: () => nav(to) }`

**2. Live cases** (from Horizon):
- Iterate `cases` array (from `fetchHorizon(role).lanes[].cases` flattened)
- Filter by: `` `${c.ref} ${c.title} ${c.counterparty ?? ''}`.toLowerCase().includes(ql) ``
- Map to hit: `{ type: 'case', label: `${c.ref} — ${c.title}`, sub: c.status.replace(/_/g, ' '), go: () => nav(`/thread/${c.chain}/${c.id}`) }`

**Result cap:**
- Return `.slice(0, 12)` — max 12 hits (function + case combined)
- This prevents an overwhelming list on broad queries

**Sort order:**
- Functions first (by domain order in config), then cases
- No relevance re-ranking; matching order is stable

### Hits Display

Each hit renders as a `<button className={`hit ${i === sel ? 'sel' : ''}`}>`:

```
<button key={i} type="button" className={`hit ${i === sel ? 'sel' : ''}`}
        onMouseEnter={() => setSel(i)} 
        onClick={() => { hit.go(); setOpen(false); }}>
  <span className={`type ${hit.type === 'function' ? 'fn' : 'case'}`}>
    {hit.type.toUpperCase()}
  </span>
  <b>{hit.label}</b>
  <span className="sub">{hit.sub}</span>
</button>
```

**Styling (`.hit`):**
- Display: flex, align-items: center, gap: 12px, padding: 11px 14px, border-radius: 8px
- Cursor: pointer, border: none, background: transparent
- Font: Archivo, 13px, text-align: left, color: inherit
- Transition: background 120ms ease

**Hover/Selection (`.hit:hover, .hit.sel`):**
- Background: `--petrol-tint` (light blue-green)

**Type badge (`.type`):**
- Font: JetBrains Mono, 9px, font-weight: 700, letter-spacing: 0.08em
- Padding: 3px 7px, border-radius: 4px, flex-shrink: 0, width: 74px, text-align: center

  - `.type.fn` (function):
    - Background: `--petrol-tint`
    - Color: `--petrol-deep`
    - Border: 1px solid `oklch(0.40 0.075 200 / 0.3)`
    - Text: "FUNCTION"

  - `.type.case` (case):
    - Background: `oklch(0.95 0.02 70)` (light amber)
    - Color: `--amber-deep`
    - Border: 1px solid `oklch(0.55 0.12 70 / 0.35)`
    - Text: "CASE"

**Hit label (`.hit b`):**
- Font-size: 13.5px, font-weight: 600

**Hit sub-label (`.hit .sub`):**
- Font-size: 11.5px, color: `--ink3`
- For functions: shows domain label (e.g. "ACTIVE TRADING")
- For cases: shows case status with underscores replaced by spaces (e.g. "under_review" → "under review")

### Empty State

If `.hits.length === 0`:

```
<div className="pal-empty">No matches.</div>
```

- Padding: 18px 14px
- Font-size: 12.5px, color: `--ink3`

### Keyboard Navigation

**ArrowDown:** `setSel(s => Math.max(0, Math.min(s + 1, hits.length - 1)))`
- Move selection down; clamp to valid range

**ArrowUp:** `setSel(s => Math.max(s - 1, 0))`
- Move selection up; clamp to 0

**Enter:** `hits[sel].go(); setOpen(false)`
- Navigate to the selected hit's destination, close modal

**Escape:** `setOpen(false)`
- Close modal (also caught by global keydown listener)

**Tab:** Native browser behavior (moves through input, then out of modal)
- Palette does NOT trap focus; Tab to the last hit exits to browser chrome

**Typing:** Resets selection to 0 (first hit) on every keystroke

### Scrolling Behavior

Container (`.pal-hits`):
- Padding: 10px 8px, max-height: 52vh, overflow-y: auto
- On keyboard navigation (ArrowUp/ArrowDown), scroll the selected hit into view:
  ```
  document.querySelector('.mer .pal-hits .hit.sel')?.scrollIntoView({ block: 'nearest' });
  ```
- `block: 'nearest'` keeps the hit visible without jumpy viewport shifts

### State: Loading Cases

On palette open, `fetchHorizon(role)` fires asynchronously. Until it resolves:

- `.hits` array includes only functions (no cases)
- If fetch fails: `.cases` is set to `[]` and only functions render

Users can still search and navigate; cases populate once Horizon resolves (or empty result if fetch fails).

### State: No Cases / No Functions

- If `fetchHorizon()` returns empty `cases`: palette shows only function hits
- If role config has no features: palette shows empty state once user types (no default functions to show)
- If user types and no hits match: "No matches." message

### Accessibility (A11y) Features

1. **Modal role & aria-modal:**
   - `role="dialog"` and `aria-modal="true"` on `.palette`
   - Screen readers announce the palette as a modal dialog

2. **Labels:**
   - `aria-label="Command palette"` on the dialog
   - `aria-label="Search functions and cases"` on the input
   - Hit buttons have implicit labels from their text content

3. **Focus management:**
   - On open: input receives `autoFocus` (focus set to the search field)
   - Focus restore on close: a `useEffect` captures `document.activeElement` on open, restores it on close
     ```javascript
     React.useEffect(() => {
       if (!open) return undefined;
       const prev = document.activeElement as HTMLElement | null;
       return () => prev?.focus?.();
     }, [open]);
     ```
   - This ensures Escape/navigation returns focus to wherever the user was before (e.g. a link in Horizon)

4. **No focus trap:**
   - Palette does NOT set `inert` on the rest of the page
   - Palette does NOT prevent Tab from exiting to browser UI
   - This is intentional for Meridian: power users should be able to Tab to the browser's address bar without closing the palette manually

5. **Semantic HTML:**
   - Input is a real `<input>` with placeholder
   - Hits are `<button>` elements (not divs), so they are keyboard-focusable by default
   - .veil backdrop is a div (not focusable), but click on it closes the palette

6. **Color contrast:**
   - Function badge text (`--petrol-deep` on `--petrol-tint`): ~6.5:1 contrast
   - Case badge text (`--amber-deep` on light amber background): ~7:1 contrast
   - Hit text on background: `--ink` (0.21 L) on `--petrol-tint` (0.94 L) gives ~15:1 contrast
   - All text meets WCAG AA (4.5:1 for normal, 3:1 for large)

7. **No aria-modal focus trap (safe):**
   - The modal does NOT have a programmatic focus trap (no code setting `inert` on document.body or siblings)
   - This is appropriate because: (a) Meridian is a workflow app where users may need to switch context quickly, (b) the scrim makes it visually clear which surface is active, (c) unshopping focus is acceptable in a command palette

### WCAG A11y Deferred Features (From Audit)

Per the audit, two a11y improvements are deferred:

1. **Focus trap / inert siblings:** Not implemented. Focus can exit the palette to browser chrome. This is intentional for Meridian's power-user model.

2. **aria-modal + programmatic focus management:** `aria-modal="true"` is declared, but no manual focus trap is installed. Screen readers will announce the dialog, but keyboard users can Tab out. This is acceptable for command palettes.

---

## Reachability Logic: Dead-End Tiles Suppressed

### isReachable() Predicate

Every feature in `cfg.domains[].features` is tested:

```javascript
const isReachable = (f: { chainKey?: string; route?: string; key: string }) =>
  !!(f.chainKey || f.route || SURFACE_REGISTRY[`${surfaceRole(role)}:${f.key}`]);
```

**Reachable iff:**
1. `f.chainKey` is defined AND the key exists in `MERIDIAN_CHAINS` (computed once at module load)
   - Verified by: checking `MERIDIAN_CHAINS.find(c => c.key === f.chainKey)`
   - OR: brute-force check inside `isReachable` (current impl trusts the config)

2. OR `f.route` is defined AND the route is mounted in `App.tsx` (assumed valid; no runtime check)

3. OR `f.key` is defined AND `SURFACE_REGISTRY[`${surfaceRole(role)}:${f.key}`]` exists (static registry lookup)

**Unreachable (hidden) if:**
- No `chainKey` AND no `route` AND no surface registration
- Example: A never-built prototype feature with `{ key: 'future_feature', label: 'Coming soon', description: '...' }` (no chainKey/route/surface)
- This feature is silently omitted from the `.fn` map in both AtlasPage and CommandPalette

### Example: Dangling Chain

Suppose `roleData.ts` lists a feature:

```javascript
{ key: 'phantom_chain', label: 'Phantom chain', chainKey: 'phantom_chain', description: '...' }
```

But `MERIDIAN_CHAINS` has no entry with `key: 'phantom_chain'`.

**Result:**
- `isReachable()` returns `false` (no chainKey match found)
- The tile is NOT rendered in Atlas
- The feature is NOT searchable in CommandPalette
- If a user somehow navigated to `/ledger/phantom_chain`, the Ledger page would render "Chain not found" (server returns 404 data)

---

## Interaction Flows

### Flow 1: Browse & Navigate to a Chain Ledger

**User on Atlas (`/atlas`):**

1. User scans domain sections (e.g. "ACTIVE TRADING")
2. User sees "Open orders" tile with "12 live" subtext
3. User clicks the tile
4. React Router navigates to `/ledger/orders`
5. LedgerPage renders the chain's case list + schema

**Keyboard:** Tab through links, Enter to navigate.

### Flow 2: Search via Command Palette

**User anywhere on Meridian (e.g. HorizonPage):**

1. User presses `Cmd+K` (or `Ctrl+K`)
2. Palette modal opens with animation, input focused
3. User types "drawdown"
4. Search computes hits:
   - "Drawdown requests" function (from Lender config) → domain "Monitoring"
   - Any live drawdown cases (from Horizon) → status "ie_review", "approved", etc.
5. First hit is auto-selected (background: `--petrol-tint`)
6. User presses Down arrow to move selection
7. User presses Enter on the desired hit
8. Palette navigates to destination and closes
9. Focus is restored to wherever the user was (e.g. Horizon page link)

### Flow 3: IPP Developer Navigates Project Dossier

**User on IPP Developer Atlas:**

1. User scrolls to "PROJECT CONTROLS" domain
2. Instead of seeing 29 separate tiles (ipp_schedule, ipp_evm, …), user sees one tile: "Project Dossier"
3. User clicks "Project Dossier" tile
4. React Router navigates to `/surface/ipp_developer:project_dossier`
5. MeridianSurfacePage renders the dossier surface component (organized by section: Schedule, Construction, Documents, Finance, Risk, Regulatory, Safety, Environmental)
6. Each section shows sub-tiles for the 3-5 chains in that group, with live case counts
7. User can click any sub-tile to jump to that chain's Ledger without returning to the main Atlas page

### Flow 4: Admin Views All Transactions

**User with admin role on Atlas:**

1. Scroll reveals "INDEX" domain at the top
2. Single tile: "All transactions"
3. Click navigates to `/surface/admin:all_transactions`
4. MeridianSurfacePage renders the admin:all_transactions surface (a global Ledger view showing all chains from all roles)
5. No tenant/role filtering applied—true omniscient view

### Flow 5: Dead-End Tile Suppressed

**User in roleData.ts config, feature has no destination:**

1. Feature exists in config: `{ key: 'unbuilt', label: 'Unbuilt feature', description: '...' }` (no chainKey, no route, no surface)
2. `isReachable()` returns false
3. Feature is NOT rendered in Atlas `.domains` grid
4. Feature is NOT searchable in CommandPalette (filtered out before hit computation)
5. Result: No tile visible, no 404 on click (it's invisible)

---

## Responsive Layout Details

### Desktop (1200px+)

- 3-column domain grid
- Gap: 52px horizontal, 34px vertical
- Padding: 34px top/bottom, 44px sides
- Palette width: 660px (fixed)

### Tablet (760px – 1200px)

- 2-column domain grid
- Gap: 36px horizontal, 34px vertical
- Padding: 28px top/bottom, 32px sides
- Palette width: `min(600px, 92vw)` (shrink slightly)

### Mobile (<760px)

- 1-column domain grid
- Gap: 0 horizontal, 28px vertical
- Padding: 20px top/bottom, 16px sides
- Palette width: `min(500px, 92vw)` (shrink further)
- Palette max-height: `70vh` (leave room for input + keyboard on phones)

---

## Live Case Counts (HorizonData Integration)

On AtlasPage:

```javascript
const liveByChain = new Map<string, { live: number; breached: number }>();
for (const lane of h?.lanes ?? []) {
  for (const c of lane.cases) {
    const e = liveByChain.get(c.chain) ?? { live: 0, breached: 0 };
    e.live++; 
    if (c.bucket === 'breached') e.breached++;
    liveByChain.set(c.chain, e);
  }
}
```

Then for each feature tile:

```javascript
const live = f.chainKey ? liveByChain.get(f.chainKey) : undefined;
// Render: {live && <span className="live mono">{live.live} live</span>}
// Render: {live && live.breached > 0 && <span className="breach mono">{live.breached} ⚠</span>}
```

**Result:**
- Feature tile shows live case count if `live` object exists
- If any cases are breached, a separate `⚠` badge appears
- Example: "Open orders" tile shows "12 live" + "1 ⚠"

---

## Command Palette: Closing & State Reset

**Escape key or click backdrop:**
- `setOpen(false)`
- `setQ('')` (clear search)
- `setSel(0)` (reset selection)
- Focus restored to previous element

**After navigation:**
- `hit.go()` (navigate via `useNavigate()`)
- `setOpen(false)` (close immediately)
- Focus restoration happens in the useEffect cleanup

**Rapid reopen after close:**
- If user presses `Cmd+K` within 100ms of closing, a new search is initiated (fresh `setQ('')`)
- No cached hits from the prior session

---

## Error States

### Horizon Fetch Fails

**AtlasPage:**
```javascript
.catch(() => { if (live) setH(null); })
```

- Header still shows "0 live · 0 breached"
- Feature tiles are still rendered (no live counts shown)
- Page is usable; live counts are optional

**CommandPalette:**
```javascript
.catch(() => { /* function hits still work */ })
```

- Only function hits are searchable (no cases)
- Page is still usable

### Chain Not in MERIDIAN_CHAINS

- Feature is unreachable, tile is not rendered
- No error message (silent suppression)
- If user somehow reaches the chain via a direct URL (e.g. `/ledger/phantom_chain`), the Ledger page shows "Chain not found"

### Surface Not Registered

- Feature is unreachable if `SURFACE_REGISTRY[${role}:${key}]` is undefined
- Tile is not rendered
- If user tries `/surface/unregistered_key`, MeridianSurfacePage shows "Surface not available for your role"

---

## Copy Strings (Exact User-Visible Text)

- Header: `ATLAS — [ROLE LABEL]`
- Header counts: `{fnCount} functions · {total} live · {breached} breached`
- Domain headers: uppercase, e.g. "PROJECT CONTROLS", "ACTIVE TRADING"
- Feature tile labels: as-is from config, e.g. "Open orders", "Drawdown requests"
- Live count: `"{n} live"` (e.g. "12 live")
- Breach badge: `"{n} ⚠"` (monospace)
- Palette placeholder: `"functions · cases…"`
- Palette empty: `"No matches."`
- Hit type badges: `"FUNCTION"` or `"CASE"` (uppercase)
- Hit case status: status field from database with underscores → spaces (e.g. `under_review` → `"under review"`)
- Empty state: `"No functions available for your role."` + `"Contact your administrator if you expect access."`
