## Surface: /surface/:key (SURFACE_REGISTRY) & shared SurfaceState

### Route Resolution & Registry Lookup

**MeridianSurfacePage** (`pages/src/meridian/MeridianSurfacePage.tsx`) is the single parametric route for all 124 non-chain surfaces. URL: `/surface/:key` (e.g., `/surface/sites`, `/surface/bills`, `/surface/reports`).

**Resolution logic:**
1. Extract `key` from URL params.
2. Resolve `user.role` (esums_owner → esco; others unchanged).
3. Look up `SURFACE_REGISTRY[`${role}:${key}`]`.
4. If found, render it inside `<MeridianFrame>` with Suspense fallback (see **States** below).
5. If NOT found, render error state.

**Registry structure** (surfaces.tsx, lines 606–767): 124 keys mapping `${role}:${tabKey}` → a React component (lazy or direct). Both keys and components are **static literals** authored in surfaces.tsx. NO request input, NO dynamic key construction.

**Roles with surfaces:** admin (18 keys), lender (8), offtaker (13), trader (8), support (8), grid_operator (7), esco (20), epc_contractor (3), carbon_fund (5), regulator (9), ipp_developer (11).

---

### Real Surface Keys (5 exemplars)

| Chain | Role | Key | Type | Registered |
|-------|------|-----|------|------------|
| — | lender | `facilities` | CRUD listing (Bucket B) | `lender:facilities` |
| W74 NERSA levy assessment | regulator | `licences` | Inline event-log (Bucket B) | `regulator:licences` |
| — | offtaker | `bills` | AI analyser + options (Bucket D/E) | `offtaker:bills` |
| — | esco | `sites-portfolio` | Portfolio CRUD (Bucket B) | `esco:sites-portfolio` |
| — | ipp_developer | `projects` | Project controls CRUD (Bucket B) | `ipp_developer:projects` |

**Other high-use surfaces:** trader:orders, trader:margin, trader:risk, admin:tenant_events, admin:reports, support:tickets, grid_operator:curtailment, carbon_fund:mrv.

---

### Hyphen vs Underscore Bug — Dead Key Example

**Breaking issue:** roleData regulator feature `government_filing` (line 677, underscore) does NOT match registry key `regulator:government-filing` (hyphen). The hyphen variant is aliased (line 627 comment + line 627 code: `'regulator:government_filing': GovernmentFilingConnector`), BUT roleData is not updated. **Current broken state:** regulator clicks Atlas tile → navigates to `/surface/government_filing` → 404 "Surface not available."

**Fix:** Update roleData (line 677) to emit `government-filing` (hyphen), OR add regulator:government_filing alias to registry (already done line 627). The alias is the safest path since it maintains backwards-compatibility if URLs remain hyphenated.

**Lesson:** Audit every new surface: (1) find the roleData feature key emitted by Atlas, (2) verify it exists in SURFACE_REGISTRY as `${role}:${featureKey}`, (3) if hyphenated in roleData, hyphenate in registry, else use underscores throughout.

---

### States

Every surface body is wrapped in a **React.Suspense** boundary (MeridianSurfacePage line 36). Surfaces receive no shared state management; each body manages its own async fetch + UI state. The frame supplies three global states:

#### 1. **Loading (initial page load)**
```jsx
<MeridianFrame ctx={<b>Surface Name</b>}>
  <React.Suspense fallback={<div className="mer mer-loading" aria-busy="true">Loading…</div>}>
    <Comp role={role} />
  </React.Suspense>
</MeridianFrame>
```
- `.mer.mer-loading` class: `display:flex; align-items:center; justify-content:center; gap:12px; color:var(--ink2); padding:24px;` (meridian.css line 35).
- Text: "Loading…"
- `aria-busy="true"` + `role="status"` (implicit).
- Full height, centered spinner (if component-level spinner not present). Blocks user interaction.
- **Duration:** until the lazy component loads AND mounts (typically <1s for cached, <3s on cold load).

#### 2. **Error (registry key not found / role mismatch)**
```jsx
<MeridianFrame ctx={<b>Surface</b>}>
  <div className="mer mer-error" role="alert">
    Surface not available. <Link to="/atlas">Open Atlas</Link>
  </div>
</MeridianFrame>
```
- `.mer.mer-error` class: same flexbox as loading (line 35–38).
- `role="alert"` for screen readers.
- Link to `/atlas` to recover.
- **Trigger:** SURFACE_REGISTRY[`${role}:${key}`] is undefined OR lazy import rejects.
- **Responsive:** <760px: link stacks below text; padding scales to 18px.

#### 3. **Component-level states (per surface body)**
Each surface body is responsible for its own lifecycle states; the frame does NOT provide a shared component. Examples:

**Empty (first run / zero results after filter):**
```jsx
<div className="mer board-empty">
  <p>No items yet.</p>
  <button className="btn pri">+ New</button>
  <p className="board-empty-sub">Start by creating the first entry.</p>
</div>
```
(meridian.css line 50–54). Used by Lender Facilities, Support Tickets, etc.

**Empty (filtered):**
```jsx
<div className="mer board-empty">
  <p>No matches for "<em>solar_200mw</em>".</p>
  <button className="btn" onClick={clearFilters}>Clear filters</button>
</div>
```

**Loading (within body):**
```jsx
<div className="mer mer-loading" aria-busy="true">Loading ledger…</div>
```
Used mid-page (e.g., LedgerPage while fetching chain list).

**Error (within body):**
```jsx
<div className="mer act-error" role="alert">
  <strong>Error:</strong> Failed to fetch — {reason}. <button onClick={retry}>Retry</button>
</div>
```
(meridian.css line 45–49). Inline, non-fatal error that keeps the page rendered behind it.

**Unauthorized (within body):**
```jsx
<div className="mer mer-error" role="alert">
  Access denied. Contact your administrator.
</div>
```

---

### Layout Regions

**Full-canvas frame:**
```
┌─────────────────────────────────────────────────┐
│ MeridianFrame                                   │
├─────────────────────────────────────────────────┤
│ header (mer)                                    │  60px
│  • Wordmark (left)                              │
│  • Context: Surface Name (humanized key)        │
│  • Clock + ⌘K hint (right)                      │
├─────────────────────────────────────────────────┤
│ main.mer-frame-body                             │
│  • Padding: 24px 44px 64px (desktop)            │
│  • Max-width: 1280px                            │
│  • Scrollable (overflow-y:auto; min-height:0)   │
│  • <Suspense fallback={loading}>                │
│    └ <SurfaceBody>                              │
├─────────────────────────────────────────────────┤
```

**Header context display:**
- `<MeridianFrame ctx={<b>{humanizeKey(key, true)}</b>}>` → "Sites Portfolio" (titleCase).
- Wordmark + breadcrumb nav (planned E2.9): back-link to Atlas or role Horizon (not yet wired).
- Clock (right): UTC HH:MM.

**Body width breakpoints (meridian.css line 626):**
- **Desktop (>900px):** 44px horizontal padding, 24px top/bottom. Max-width 1280px (centered).
- **Tablet/mobile (<900px):** 18px horizontal padding, 18px top/48px bottom.
- **<760px:** Stack modals/drawers full-width; font-sizes scale down 1px (–0.5px on --ink3).

---

### Keyboard & Focus Behavior

**Globally available (all Meridian surfaces):**
- **⌘K / Ctrl+K:** Open Atlas (function-library modal). Wired in App.tsx + MeridianHeader.
- **Tab / Shift+Tab:** Native focus order through page (header → body → Suspense children).
- **Enter on tile/button:** Navigate to surface.
- **Escape:** Close any open modal/drawer inside the surface body (each component handles).

**Within Meridian surfaces (examples):**

**Lender Facilities listing:**
- Tab through table rows → row focus outline (outline:2px solid var(--petrol-deep)).
- **Space/Enter on row:** Open facility detail (side-panel or modal).
- **Delete on row:** Trigger row action (if permitted).

**Support Tickets CRUD:**
- **Tab:** Form fields → buttons.
- **Shift+Tab:** Reverse.
- **Focus trap in ActionModal:** when modal opens, focus moves to first input; when modal closes, focus returns to the "New Ticket" button.
  - **NOT YET IMPLEMENTED** (audit finding): inert + aria-modal currently present but focus restoration missing. Fix: add `useRestoreFocus()` hook on ActionModal mount/unmount.

**Admin Tenant Events:**
- **Tab through filters** (date picker, status dropdown).
- **Enter in date-range picker:** Submit date range.
- **Escape in dropdown:** Close dropdown, return focus to trigger button.

---

### Accessibility (a11y)

**WCAG AA minimum (not yet fully met — audit findings noted):**

| Aspect | Spec | Status |
|--------|------|--------|
| Contrast | text ≥4.5:1 on background | --ink3 (secondary text) = ~3.3:1 on --raised; --moss-deep used for small moss text to hit 6.5:1. FIX: all text ≥4.5:1. |
| Focus visible | outline:2px solid var(--petrol-deep) on :focus-visible | Applied to buttons/links; missing on form inputs (FIX). |
| Modal focus trap | focus stays within modal until close | aria-modal present, inert pending; focus restoration missing (FIX). |
| Keyboard nav | all interactive elements reachable via Tab | TRUE for buttons/links; form input keyboard shortcuts vary per component (FIX: document per surface). |
| Labels | <label for="..."> or aria-label on all inputs | PARTIAL: many text inputs use aria-label; some lack both (FIX: audit form components). |
| Empty state | descriptive text + recovery action | TRUE in board-empty; PARTIAL in error states (link to Atlas present but no form-specific guidance). |
| Roles + ARIA | semantic HTML + explicit roles where needed | role="alert" on errors; role="status" on loading (implicit); tabindex="0" on interactive divs. Missing: role="listitem" on table rows, role="option" on dropdowns (FIX: add to LedgerPage/ThreadPage list components, which share the code). |
| Announcements | aria-live regions for state changes | MISSING for "filter results updated" or "item added" (FIX: add aria-live="polite" to data containers on mutation). |

**Specific fixes for SurfaceState patterns:**

```jsx
// Loading state
<div className="mer mer-loading" aria-busy="true" role="status">
  Loading…
</div>

// Error state with label
<div className="mer mer-error" role="alert" aria-label="Surface not available">
  Surface not available. <Link to="/atlas">Open Atlas</Link>
</div>

// Empty state with recovery button
<div className="mer board-empty">
  <p role="status">No items yet.</p>
  <button className="btn pri" aria-label="Create the first item">
    + New
  </button>
</div>
```

---

### Print & Export Affordance

**Report-class surfaces** (Bucket D: ReportPanel children) have built-in print/export:

- **ReportPanel** (components/launch/ReportPanel.tsx) wraps report data in a tabular grid.
- **Print button:** top-right of panel, text "Print" or icon only (⌨).
- **Export options:** CSV, PDF, JSON (right-click menu or dropdown).
- **@media print rule (in component CSS):**
  ```css
  @media print {
    .report-table { page-break-inside: avoid; }
    .report-controls { display: none; }
    .report-title { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
  }
  ```
- **Print layout:** full-width, single-column, monospace for numbers, landscape for wide tables.

**Examples with print/export:**
- `admin:reports` — platform invoicing + billing cycles.
- `lender:reports` — covenant certificates, DSCR monitoring.
- `trader:reports` — trade recon, best-execution.
- `regulator:reports` — compliance exams, market-abuse cases.
- `esco:predictions` — RUL forecasts + confidence intervals (Print exports as static PDF with charts).

**Non-report surfaces** (Bucket B/C/E: CRUD/listing/connector) have **no global print affordance**. Individual rows may offer "export" (e.g., "Download as PDF" for a permit-to-work checklist), but only if the domain warrants it.

---

### Responsive Reflow <760px

**Desktop (>900px):**
- Body padding: 44px horizontal, 24px top/bottom.
- Modals/drawers: side-panel (right-edge slide-in, 400px wide).
- Tables: horizontal scroll if >100% width.
- Grid layouts: 3+ columns.

**Tablet (760–900px):**
- Body padding: 18px horizontal, 18px top/48px bottom.
- Side-panels → full-height panel (still right-edge slide).
- Font scales: base 14px → 13px.

**Mobile (<760px):**
- Body padding: 18px horizontal, 18px top/48px bottom.
- Side-panels → stacked modal (full-width, bottom-sheet) or full-screen overlay.
- Modals: stack vertically, no side-panel slide.
- Tables: stack to cards (one field per row).
- Dropdowns: fixed-height scrollable list (max-height: 50vh).
- Forms: single-column, inputs full-width.
- Buttons: full-width stacked (if >1 button in action row).

**Example: Lender Facilities on <760px:**
```
┌─────────────────────┐
│ [←] Open Atlas      │  60px header
├─────────────────────┤
│ 🔍 Filter (full)   │
├─────────────────────┤
│                     │
│ Facility A          │  Card-stacked table
│ Status: Active      │
│ [Details]           │
│                     │
│ Facility B          │
│ Status: On Watch    │
│ [Details]           │
│                     │
│ [+ New Facility]    │  Full-width button
└─────────────────────┘
```

---

### Unknown-Key Fallback Template

When SURFACE_REGISTRY[`${role}:${key}`] is undefined:

```jsx
<MeridianFrame ctx={<b>Surface</b>}>
  <div className="mer mer-error" role="alert">
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <p>
        <strong>Surface not available</strong>
      </p>
      <p style={{ fontSize: '13px', color: 'var(--ink2)' }}>
        The requested page does not exist or you don't have permission to access it.
      </p>
      <p style={{ marginTop: '16px' }}>
        <Link to="/atlas" style={{ color: 'var(--petrol-deep)', fontWeight: '600', textDecoration: 'none' }}>
          ← Open Atlas
        </Link>
      </p>
    </div>
  </div>
</MeridianFrame>
```

**Triggers for this fallback:**
1. User types invalid URL: `/surface/nonexistent`.
2. Role mismatch: esco role tries to access `regulator:licences` (no registry key for esco).
3. Chain vs surface mismatch: atlas feature has `chainKey: 'support_tickets'` but surface registers as `support:tickets` (hyphen/underscore mismatch; example: government_filing bug above).
4. Lazy import fails: React.lazy() promise rejects (network error, module not found).

**Recovery path:** Link to Atlas (always accessible) → user re-selects the feature tile (which is now validated to exist in their role's feature list).

---

### Humanized Key Display

`humanizeKey(key, titleCase)` (lib.ts line 150–153):
- Replaces underscores with spaces.
- If titleCase=true, capitalizes first letter of each word.
- Examples:
  - `sites_portfolio` → "Sites Portfolio" (titleCase) or "sites portfolio" (default).
  - `rul_prediction` → "RUL Prediction" (titleCase).
  - `mm_obligations` → "MM Obligations" (titleCase).

**Display location:** MeridianFrame ctx slot (header):
```jsx
<MeridianFrame ctx={<b>{humanizeKey(key, true)}</b>}>
```

---

### Shared SurfaceState Component (Proposed but NOT YET BUILT)

**Current state:** Each surface body rolls its own loading/empty/error states. No shared component exists.

**Proposed (for P3 / post-go-live consistency audit):**

```tsx
// pages/src/meridian/SurfaceState.tsx
export type SurfaceStateKind = 'loading' | 'empty' | 'empty-filtered' | 'error' | 'unauthorized';

export interface SurfaceStateProps {
  kind: SurfaceStateKind;
  message?: string;
  reason?: string; // error details
  action?: { label: string; onClick: () => void }; // e.g., "Create the first item"
  filterValue?: string; // for 'empty-filtered' hint
}

export function SurfaceState({ kind, message, reason, action, filterValue }: SurfaceStateProps) {
  const render = {
    loading: () => (
      <div className="mer mer-loading" aria-busy="true" role="status">
        {message || 'Loading…'}
      </div>
    ),
    empty: () => (
      <div className="mer board-empty">
        <p role="status">{message || 'No items yet.'}</p>
        {action && <button className="btn pri" onClick={action.onClick}>{action.label}</button>}
      </div>
    ),
    'empty-filtered': () => (
      <div className="mer board-empty">
        <p role="status">No matches for "<em>{filterValue}</em>".</p>
        {action && <button className="btn" onClick={action.onClick}>{action.label}</button>}
      </div>
    ),
    error: () => (
      <div className="mer act-error" role="alert">
        <strong>Error:</strong> {message || 'An error occurred.'} {reason && `(${reason})`}
        {action && <button className="btn" onClick={action.onClick}>{action.label}</button>}
      </div>
    ),
    unauthorized: () => (
      <div className="mer mer-error" role="alert">
        Access denied. {message || 'Contact your administrator.'}
      </div>
    ),
  };
  return render[kind]?.() || null;
}
```

**Adoption:** All 63 surface bodies (Bucket A: reporting; B: CRUD/listing; C: transaction; D: reports; E: read-only) would import + use this component for consistent messaging, styling, and a11y. **Benefit:** single place to fix focus-trap bugs, contrast issues, and aria-live announcements.

---

### Summary: Current Broken State → Fixed UX

| Issue | Current | Fixed |
|-------|---------|-------|
| 49 chains unreachable (29 ipp_* no tiles) | — | Dossier surface groups 29 sub-docs under one tile (not 29 tiles). |
| ~39 dangling tiles (chainKey w/ no registry) | 404 on click | Audit registry: every Atlas feature key must have SURFACE_REGISTRY entry. |
| government_filing hyphen/underscore mismatch | Regulator navigates to `/surface/government_filing` → 404 | Verify roleData key (line 677: change `government_filing` → `government-filing`) OR verify registry alias exists (line 627: ✓ done). |
| Modals lack focus trap + aria-modal | Keyboard escape anywhere; no return-focus | Add useRestoreFocus() + inert attribute (already has aria-modal). |
| --ink3 text fails WCAG AA on --raised | 3.3:1 contrast | Use --moss-deep for all small text; increase --ink3 lightness or darken --raised. |
| No shared SurfaceState component | 63 bodies, 63 different loading/empty patterns | Build SurfaceState component + roll out to all surfaces (P3). |
| No print/export on non-report surfaces | Users copy-paste data | Add export affordance to CRUD/listing bodies (e.g., "Download as CSV"). |
| No keyboard shortcuts for actions | Tab + Enter only | Add ⌘S for Save, ⌘E for Export, ⌘D for Delete (with confirmation). Communicate via header kbd-hint. |
