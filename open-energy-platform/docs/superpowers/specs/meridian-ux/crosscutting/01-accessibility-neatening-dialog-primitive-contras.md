## Cross-cutting: Accessibility & neatening (Dialog primitive, contrast, focus, keyboard, labels)

### Shared Dialog Primitive

All four veils (CommandPalette, LedgerPage +New, ThreadPage action-form, DealDeskPage compose/compare) adopt a unified `AccessibleDialog` primitive with the following guarantees:

**Component structure** (mounts at veil scope):
```
<div className="mer veil" /* background scrim, fixed inset, dismissible */>
  <DialogContent
    onClose={() => setOpen(false)}
    ariaLabel={string}
    initialFocus={React.RefObject<HTMLElement>}
  >
    {children}
  </DialogContent>
</div>
```

**Properties enforced:**
1. **Focus trap**: all keyboard focus stays within the dialog until dismiss. Tab at last tabbable element wraps to first; Shift+Tab at first wraps to last.
2. **Initial focus**: on mount, focus moves to `initialFocus` ref (defaults to the first input or button if not specified). CommandPalette focuses the search input; forms focus the first required field.
3. **Background inert**: while dialog is open, `document.body` gets `inert="true"` + `aria-hidden="true"` to prevent screen-reader access to content behind the scrim.
4. **Focus restore on close**: unmounting the dialog restores focus to the element that had it before the veil opened (stored via `React.useRef(document.activeElement)`).
5. **Escape key**: pressing Escape dismisses the dialog (already present in CommandPalette, LedgerPage, ThreadPage, DealDeskPage); this is wired to the component via an `onEscape` callback, not a global listener.
6. **Click scrim to dismiss**: clicking the outer `.mer.veil` scrim (not the `.palette` / `.veil-body` panel) dismisses the dialog.

**Implementation location**: `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/AccessibleDialog.tsx` (new file).

**Veils adopting the primitive:**
1. **CommandPalette.tsx** (`<div className="mer veil">` + `.palette`) — search input auto-focused, Escape dismisses, focus restored.
2. **LedgerPage.tsx** (compose +New drawer, `<div className="mer veil">` + `.veil-body`) — first required field auto-focused, Escape dismisses.
3. **ThreadPage.tsx** (action-form drawer, `<div className="mer veil">` + `.veil-body`) — first required field auto-focused, Escape dismisses.
4. **DealDeskPage.tsx** (compose + compare veils, `<div className="mer veil">` + `.veil-body` ×2) — composer/grid first input auto-focused, Escape dismisses both independently.

**WCAG criteria satisfied**:
- **2.1.1 Keyboard** (Level A): all dialog interactions (open, navigate options, submit, dismiss) via keyboard only.
- **2.4.3 Focus Order** (Level A): focus moves into trap on open; visually-indicated focus ring on every tabbable element.
- **4.1.2 Name, Role, State** (Level A): `aria-modal="true"` + `aria-label` + `aria-hidden="true"` on background signals modal to AT.
- **2.5.3 Label in Name** (Level A): form labels use `<label htmlFor="id">` + aria-describedby on error fields.

---

### Contrast Fix for `--ink3` (Secondary Text)

**Current broken state**: `--ink3: oklch(0.50 0.012 85)` reads ~3.3:1 on `--raised` paper. Fails WCAG AA 4.5:1.

**Fixed palette** (meridian.css, new variable):
```css
--ink3-text: oklch(0.42 0.012 85);  /* L≈0.42 = ~4.7:1 on --raised, passes AA */
```

**Application scope**:
1. **Meaningful metadata only** — text that operators must read to make decisions:
   - `.bucket-h` (bucket column headers: "BREACHED", "< 2H", "TODAY") → use `--ink3-text`
   - `.tile .ref` (case reference ID) → use `--ink3-text`
   - `.lcard .ref` (ledger card reference) → use `--ink3-text`
   - `.case-sub` (status chip + chain metadata) → use `--ink3-text` for the non-chip text
   - `.raw-fields dt` (case-record field names) → use `--ink3-text`
   - `.hit .sub` (palette search hit subtitle: domain/function group) → use `--ink3-text`
   - Filter/status labels in `.kpi-label`, `.lane-label .n` → use `--ink3-text`

2. **Decorative or low-priority stays `--ink3`**:
   - `.lane-chev` (chevron collapse indicator) — visual-only, OK at 3.3:1
   - `.pulse` dot in wire ticker — visual indicator, OK at 3.3:1
   - `.fuse` bar background stripe — visual-only, OK at 3.3:1

**Hex fallbacks** (for browsers not supporting oklch):
- `--ink3: #6a6a6a` (current, decorative)
- `--ink3-text: #5a5a5a` (new, readable text)

**Minimum functional text size rule**: any text smaller than 11px must use `--ink3-text` if it's semantic (IDs, counts, labels). 10px is permitted ONLY for decorative labels (e.g., `.lane-chev`).

**WCAG criteria satisfied**:
- **1.4.3 Contrast (Minimum)** (Level AA): all meaningful text ≥4.5:1.
- **1.4.11 Non-text Contrast** (Level AA): decorative elements (dots, stripes) ≥3:1 OK.

---

### Keyboard Navigation & Focus Behavior

**Scope: 4 chrome surfaces + 63 body surfaces** (Horizon, Ledger, Thread, Deal Desk, Atlas, NewPage, OnboardingWizard, 58+ role-specific /surface pages).

**Chrome (Horizon header + footer + aside):**
1. **Wordmark / logo** → no focus (decorative link, only a Shift+Tab escape hatch).
2. **Quicklinks** (Deals / ESG / Reports / Intelligence / National) → focus-visible outline 2px petrol, outline-offset 2px.
3. **Clock** → not focusable (read-only status text).
4. **Kbd hint** (⌘K link) → focus-visible outline; on click or ⌘K, opens palette with input auto-focused.
5. **Avatar button** → focus-visible outline; opens menu on click or Enter/Space.
   - **Avatar menu**: `role="menu"` + Home/End/Arrow keys cycle through items (per ARIA 1.2 menu pattern).
   - Escape closes menu + restores focus to avatar button.
6. **Duty rail** (collapsed/expanded toggle) → focus-visible outline on `.duty-collapse` button.

**Body (Horizon board, Ledger list, Thread state rail, Deal Desk lanes):**
1. **Lane labels** (Horizon board row headers) → focusable buttons; Enter/Space toggles collapse; focus-visible petrol outline inset.
2. **Lane-collapsed-summary** (expanded placeholder text) → focusable; enters focus order when lane is collapsed.
3. **Tiles** (case cards on board / ledger) → focusable links; Enter/Space/click navigates to thread.
4. **Pills** (status filters on ledger) → focusable buttons; `aria-pressed` reflects state; visual on/off style.
5. **Deal cards** (request/offer summaries) → focusable divs or buttons depending on action availability.
6. **Action buttons** (Thread actbar, Deal Desk author buttons) → focusable; disabled state when action is in-flight (`.then { button disabled }`).

**Focus visible styling** (every interactive element):
```css
:focus-visible {
  outline: 2px solid var(--petrol);
  outline-offset: 2px;  /* 2px gutter for desktop; -2px for inset elements (menu items) */
}
```

**Mobile keyboard behavior** (<760px):
- Touch keyboard shows on input focus (inherent to platform).
- Tab still cycles through focusable elements; Shift+Tab reverses.
- Arrow keys only work in specialized contexts (avatar menu Home/End, palette Up/Down).
- Dismiss buttons (pill, action) remain finger-hittable (≥44px × 44px WCAG 2.5.5).

**Escape key scope**:
- Closes any open modal/veil (palette, +New drawer, action form, compare grid).
- Closes avatar menu if open.
- Does NOT navigate back (use browser back button).

**WCAG criteria satisfied**:
- **2.1.1 Keyboard** (Level A): all functions available via keyboard.
- **2.4.7 Focus Visible** (Level AA): all interactive elements have visible focus indicator.
- **2.4.3 Focus Order** (Level A): focus order is logical (header → board/body → footer); no focus jumps.

---

### Label Hygiene: `cleanLabel()` Multi-Wave Fix

**Current state** (pages/src/meridian/labels.ts):
```typescript
export function cleanLabel(label: string): string {
  return label
    .replace(/\s*\(W\d[^)]*\)/gi, '')            // "(W123)" build codes
    .replace(/\s*[—·-]\s*W\d[\dW\s·/,-]*\.?\s*$/i, '') // " · W12 · W71" wave lists
    .replace(/\s+([.,;:)])/g, '$1')              // tidy trailing space before punctuation
    .replace(/\s{2,}/g, ' ')                     // collapse double spaces
    .trim() || label;
}
```

**Before/after examples** (all roles, all surfaces):

| Before | After | Context |
|--------|-------|---------|
| `"Esums chains (W12) · W24 · W25"` | `"Esums chains"` | TabLabel in Horizon (esums_owner lane header) |
| `"Wave 12 site commissioning (W12)"` | `"Wave 12 site commissioning"` | Atlas tile label (ipp_developer domain) |
| `"Carbon retirement (W17) · Scope 1 / Scope 2 (W48)."` | `"Carbon retirement · Scope 1 / Scope 2"` | Ledger chain title (admin) |
| `"IPP procurement/RFP (W19)"` | `"IPP procurement/RFP"` | Thread breadcrumb (ipp_developer, lender) |
| `"Lender drawdown (W21)"` | `"Lender drawdown"` | Deal type label (trader, lender) |
| `"Grid connection — W28"` | `"Grid connection"` | Command palette function entry (grid_operator) |
| `"Support ticket P6 · W14"` | `"Support ticket P6"` | /surface breadcrumb (support, admin) |
| `"Regulator — W5 · W31 · W40 · W49"` | `"Regulator"` | Quicklink label (regulator, admin) |

**Implementation**: Replace the existing `cleanLabel()` in pages/src/meridian/labels.ts with the version above; it already handles all 8 patterns.

**Affected call sites** (63 surfaces):
1. **CommandPalette.tsx** (line 87) — `cleanLabel(f.label)` for function hits + domain subtitle.
2. **AtlasPage.tsx** — `cleanLabel()` on domain + feature labels.
3. **MeridianHeader.tsx** (line 79) — breadcrumb chain title.
4. **LedgerPage.tsx** — chain title in header; status filter labels.
5. **ThreadPage.tsx** (line 79, 80, 92) — breadcrumb, status display, event type display.
6. **HorizonPage.tsx** — lane-label titles, bucket headers.
7. **NewPage.tsx** — function picker row labels.
8. **DealDeskPage.tsx** — deal-type labels, request/offer titles.
9. **All role-specific /surface pages** (58 ModalFrame variants, 1 per role-domain) — page title, breadcrumbs, section headers.

**Testing scope**: verify cleanLabel on inputs containing:
- `(W\d)` patterns (single or multiple digits: W5, W123).
- `(W12/24)` range syntax.
- Trailing `(W##).` with period.
- ` · W\d[\dW · /,]*` wave-list suffix.
- Spaces before punctuation after stripping.

**WCAG criteria satisfied**:
- **2.4.2 Page Titled** (Level A): page titles are now clean (no build codes).
- **1.3.1 Info and Relationships** (Level A): labels relate to their context without noise.

---

### Duty-Stream Busy / Confirm Guard

**Current state** (meridian.css `.duty` section, HorizonPage.tsx): duty rail items render without gating user actions on state transitions.

**Fixed flow**:

1. **Veil transition guard** — when a duty item is clicked to navigate to its thread, the entire duty rail gets `opacity:0.5; pointer-events:none` until the new page loads.
   - Prevents double-clicks on the duty list.
   - Provides visual feedback that the action was received.

2. **Busy state on actions** (Thread, Deal Desk) — while an action POST is in-flight:
   - The action button text changes to `"…"` (ellipsis).
   - `disabled` attribute is set on ALL action buttons in `.actbar` / `.dcard-acts`.
   - Other buttons (non-action) remain functional (dismiss, cancel, back).
   - After response (success or failure), busy state clears and the operator can retry or take a different action.

3. **Confirm dialog** (optional, for destructive actions only) — actions with `tone: 'oxide'` (withdraw, void, reject) may open a lightweight confirmation veil before firing:
   - Modal dialog: "Do you want to [action]? This can't be undone."
   - Two buttons: "Cancel" (focus defaults here) + "[Action]" (oxide/red).
   - Escape closes without confirming.

**CSS additions** (meridian.css):
```css
.mer .duty-rail.busy { opacity: 0.5; pointer-events: none; }
.mer .actbar-btns button:disabled { opacity: 0.6; cursor: not-allowed; }
.mer .confirm-veil { /* same as .mer.veil */ }
.mer .confirm-dialog { /* same as .palette */ }
```

**Implementation** (ThreadPage.tsx, DealDeskPage.tsx):
- `useState<string | null>(busy)` — action.action string while in-flight, null otherwise.
- Before `api.post()`, set busy to the action key; after response, set busy to null.
- `button disabled={busy !== null}` on all action buttons.

**WCAG criteria satisfied**:
- **4.1.2 Name, Role, State** (Level A): disabled state communicated to AT via `disabled` attribute.
- **2.1.1 Keyboard** (Level A): keyboard users can still submit forms or dismiss dialogs while actions load.

---

### Focus & Inert Escape Hatch (Duty Collapse, Escape from Deep Modals)

**Escape from duty rail collapse** (when aside is collapsed on <1080px):
- The `.duty-rail` transforms off-screen to the right.
- Tab order automatically skips the off-screen elements (browser native, due to `transform:translateX(100%)` + `.main overflow-x:clip`).
- Escape does NOT reopen the rail; the user must click `.duty-collapse` to reopen (or narrow to ≤1080px).

**Escape from nested modals** (if a veil contains a sub-form/picker):
- Escape only dismisses the innermost modal.
- Parent modal stays visible.
- Focus restores to the parent's trigger button.

---

### Axe + Manual Keyboard-Only Pass Scope

**4 chrome surfaces tested**:
1. **HorizonPage** (header + board + duty rail) — 100 interactive elements (lane labels, tiles, duty items, collapse button, avatar menu).
2. **LedgerPage** (header + KPI strip + pills + card list) — 50+ elements (pills, cards, +New button, back link).
3. **ThreadPage** (header + state rail + case record details + action buttons) — 40+ elements (breadcrumb, details toggle, action buttons, form if opened).
4. **DealDeskPage** (header + author bar + deal lanes + veils) — 80+ elements (author buttons, deal cards, Compare button, action buttons in compare veil).

**63 body surfaces** (role-specific, /surface/:key):
- Each renders a ModalFrame (header + body + optional footer) wrapping a role-domain surface.
- Surfaces include: master-data CRUD tables, settings panels, analytics charts, connectors, onboarding wizards.
- Total ~63 unique surfaces (one per role + domain combination; some roles have 8–12 domains).

**Testing checklist per surface**:
- [ ] All interactive elements are keyboard-reachable (Tab cycles; Escape exits modals).
- [ ] Focus is visible on all :focus-visible elements (outline color, offset, or inset style).
- [ ] Focus order is logical (header → body → footer) and matches visual flow.
- [ ] All form labels are associated via `<label htmlFor="id">` or `aria-label`.
- [ ] Required fields are marked with `*` or `aria-required="true"`.
- [ ] Error states use `aria-invalid="true"` + `aria-describedby="error-id"`.
- [ ] Buttons and links have clear, meaningful text (no icon-only without aria-label).
- [ ] Color is not the only means of information (e.g., status uses text + color, not color alone).
- [ ] Contrast is ≥4.5:1 for all meaningful text (≥14px or bold ≥18px); ≥3:1 for graphics.
- [ ] Modal dialogs have `aria-modal="true"` + `aria-label` + background `aria-hidden="true"`.

**Automated scanning (axe-core)** — run before each release:
```bash
# In the test suite (Playwright or Jest integration)
const { axe } = require('jest-axe');
expect(await axe(container)).toHaveNoViolations();
```

**Manual keyboard-only pass** — for each surface:
1. Start with mouse unplugged or hidden (or use browser's "disable pointer" dev tool).
2. Tab through every focusable element; verify focus is visible and order is logical.
3. Use arrow keys (Avatar menu: Home/End to jump; Palette: Up/Down to navigate hits).
4. Press Escape and confirm dialogs close.
5. Press Enter on buttons; confirm they activate (not just focus).
6. Tab through a form; verify all labels are read by screen reader (or visible on-screen).
7. Verify status changes (e.g., "Loading" → "Loaded") are announced or visible.

**WCAG criteria satisfied**:
- **2.1.1 Keyboard** (Level A): all interactions via keyboard.
- **2.4.7 Focus Visible** (Level AA): all interactive elements have visible focus indicator.
- **4.1.2 Name, Role, State** (Level A): all interactive roles clearly labeled + state communicated.
- **1.4.3 Contrast (Minimum)** (Level AA): all text ≥4.5:1 (or ≥3:1 for graphics).

---

### Implementation Roadmap

1. **AccessibleDialog primitive** — create once, use in all 4 veils.
2. **Contrast fix** — add `--ink3-text` to meridian.css; apply to ~20 selector rules.
3. **Focus rings** — add `:focus-visible` to ~40 interactive elements across 4 chrome surfaces.
4. **cleanLabel()** — already handles all patterns; no code change needed (verify in tests).
5. **Busy guards** — add `useState(busy)` + `disabled={busy !== null}` to Thread + Deal Desk action flows.
6. **Axe + manual pass** — integrate axe-core into Playwright suite; schedule manual keyboard-only audit before Phase E final release.

**Files to modify**:
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/AccessibleDialog.tsx` (NEW)
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/meridian.css` (~30 lines)
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/CommandPalette.tsx` (wrap in AccessibleDialog)
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/LedgerPage.tsx` (wrap in AccessibleDialog)
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/ThreadPage.tsx` (wrap in AccessibleDialog, add busy guard)
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/DealDeskPage.tsx` (wrap in AccessibleDialog, add busy guard)
- `/Users/reshigan/Openenergy/open-energy-platform/pages/src/meridian/MeridianHeader.tsx` (avatar menu keydown handler refine)
