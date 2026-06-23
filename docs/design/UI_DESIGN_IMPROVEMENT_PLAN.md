# UI Design Analysis & Improvement Plan

**Date:** 2026-06-12
**Scope:** Entire SPA — `open-energy-platform/pages/src` (11 role workstations, 104 chain tabs, 111 routes, 4 chrome systems)
**Method:** Five parallel audits — chrome/navigation architecture, design tokens, workstation UX density, accessibility, component duplication.

---

## Executive summary

The platform's functional depth (76 waves, L4/L5 chains) far outruns its design system maturity. The UI is **visually consistent by convention, not by system**: 120+ files each re-declare the same OKLCH palette, 104 chain tabs each re-implement ~70% identical scaffolding, and role accents are defined in 3 separate maps. Nothing is broken — but every new wave adds ~400 lines of copy-pasted boilerplate, and a single design change (e.g. adjusting muted-text contrast) currently requires touching 120 files.

The five highest-leverage problems, in order:

| # | Problem | Evidence | Cost of inaction |
|---|---------|----------|------------------|
| 1 | **No central design tokens** — palette re-declared per file | 123 files declare `ACC`, 125 declare `BORDER`; 74 CSS vars in index.css sit unused; 407× hardcoded `#fff` | Any theme change = 120-file edit; drift already visible (7 ACC variants) |
| 2 | **Chain-tab boilerplate** — ~70% structural duplication across 104 tabs | `fmtDate` ×155, `fmtZar` ×97, `STATE_TONE` ×60, fetch pattern ×90+, inline drawer ×34 | Each new wave ships ~300 lines of duplicated code; inconsistencies multiply |
| 3 | **Muted-text contrast at small sizes** | `TX3` (oklch 0.60) used at 9–11px for KPI captions, table cells, section headers in WorkstationShell — below WCAG AA at those sizes | Fails the a11y floor flagged in the 2026-06-06 critique; real readability problem on dense screens |
| 4 | **Four overlapping chrome systems** | FioriShell (1023 LOC, sidebar), AppShell (283 LOC, top bar), WorkstationShell (1139 LOC), StitchPage (44 pages) — role metadata duplicated in 4 maps | Navigation inconsistency per route family; new pages must pick a chrome by folklore |
| 5 | **Loading/empty states are bare text** | All sampled chain tabs render `<div>Loading...</div>` and `<div>No X match.</div>` — no skeletons, no guidance, inconsistent padding | Perceived quality gap; the "first 5 seconds" of every tab looks unfinished |

---

## Audit findings (detail)

### A. Design tokens & visual system

- **Palette duplication:** every component file opens with `const ACC/BG/BG1/BORDER/TX1/TX2/TX3 = 'oklch(...)'`. Counts: ACC ×123, BG ×118, BORDER ×125, TX1 ×121, TX2 ×121, TX3 ×120. The neutral values are 100% identical across files (good — no drift yet), but they're 120 copies of the same fact.
- **ACC drift:** 7 distinct accent values found. Most are legitimate role accents, but the distribution is accidental — e.g. `oklch(0.46 0.12 230)` (platform neutral) on 14 pages vs `oklch(0.46 0.16 55)` (IPP amber) on 98 pages including non-IPP surfaces.
- **Central tokens exist and are ignored:** index.css defines 74 `--oe-*` custom properties (plus legacy `--fiori-*`, `--ionex-*` aliases). Components bypass them with inline literals.
- **Hardcoded hex:** `#fff` ×407, `#6b7685` ×1759, plus ~20 other hex values used thousands of times in STATE_TONE maps and chart code.
- **Styling approach:** 97–100% inline `style={{}}` on sampled pages. Tailwind is configured (type scale, spacing scale) but essentially unused in components. This is a *convention*, not a bug — but it forfeits `:hover`/`:focus-visible`/`:active` pseudo-classes, forcing `onMouseEnter` hover hacks (see D).
- **Typography:** body text clusters at 11–13px (13px ×222, 12px ×208, 11px ×172) with a long tail of 8–10px. No applied type scale; the Tailwind scale (`headline-*`, `body-*`, `label-*`) exists unused. Fonts themselves are good (IBM Plex Sans / JetBrains Mono).
- **Role accents defined 3×:** `ROLE_META` in AppShell.tsx:27, `ROLE_ACCENT_MAP` in WorkstationShell.tsx:99, `ROLE_DISPLAY` in FioriShell.tsx:430 — different shapes, same data, plus inconsistent labels ("IPP" vs "IPP Developer").

### B. Component duplication

- **104 chain tabs, ~68–72% structural duplication.** Each re-implements: token constants, Row/Event interfaces, tier types, filter pills, `getActions()` state→action map, format helpers, KPI useMemo, fetch-into-state, filtered list, detail drawer, action modal.
- **Formatters:** `fmtDate` ×155 definitions, `fmtZar` ×97, `fmtMinutes` ×90+. ~2,500 wasted LOC. No `lib/formatters.ts`.
- **Status colors:** 60 files define their own `STATE_TONE` map with hex values; same semantic palette (red=fatal, amber=warning, green=ok, gray=neutral) re-invented each time.
- **Fetch pattern:** zero shared data hook. The `useState(rows) + useCallback(load) + useEffect` pattern is hand-copied ~90+ times. `lib/api.ts` handles auth/refresh well but stops at HTTP.
- **ChainCard adoption: 66%.** 69/104 tabs use the shared ChainCard; 34 hand-roll their own card + drawer (~150–200 LOC each).
- **Drawers:** 151 files implement inline `position:fixed` overlay + right slide-out panel. ~40 near-identical variations; no shared `<DetailDrawer>`.
- **Giant files:** IppWorkstationPage 3,234 LOC; roleCompletionTabs 3,045; ESG 2,573; OfftakerWorkstationPage 2,267.

### C. Chrome & navigation architecture

- **Four chrome systems coexist:** FioriShell (sidebar, 146 nav items, role filtering), AppShell (52px top bar), WorkstationShell (two-column workstation grid), StitchPage (header band, 44 pages). A page's chrome depends on which era it was built in.
- **Chrome stacking:** workstation routes render AppShell top bar *above* WorkstationShell's own 52px header — two stacked headers consuming ~104px before content.
- **Dead code:** `Cockpit.tsx` (585 LOC, unrouted), legacy listing pages (Contracts/Trading/Settlement/Carbon/Projects/Grid .tsx — routes now redirect, components remain), `roleCompletionTabs.tsx` (3,045 LOC — verify usage before delete).
- **ux-alternatives/ = 2.1MB of routed prototype code.** ApexApp, PulseLens, TimeAxis, CommandLens, CockpitGrid all lazy-loaded but reachable in production. Per the UX-exploration-track directive these are deliberate prototypes — but they ship to prod with 21 `outline:none` violations and no role gating.
- **Mobile:** bottom nav shows only first 4 role nav items; hamburger menu is one flat scroll for 40+ items (admin); workstation tab strip relies on hidden-scrollbar horizontal scroll with no position indicator.

### D. Accessibility & interaction

- **Contrast (highest severity):** `TX3` = `oklch(0.60 0.007 250)` on white, used at 9–11px throughout WorkstationShell (KPI captions, section headers, table cells at lines 294–357, 605–646). Fails WCAG AA for normal text. The 2026-06-06 critique deferred the "a11y floor" — this is it.
- **Focus:** global `:focus-visible` rule exists (index.css:148) ✓, but 21 `outline:'none'` declarations in ux-alternatives/ have no replacement ring, and `input:focus` at index.css:532 strips outline.
- **Keyboard:** tabs have `role="tab"`/`aria-selected` but **no arrow-key navigation**; modals close on Escape ✓ but don't trap focus; tables are keyboard-actionable ✓.
- **Hover via JS:** inline-styled buttons use `onMouseEnter`/`onMouseLeave` to simulate `:hover` (repeated ~15× in WorkstationShell alone). Keyboard focus never triggers these — keyboard users get no state feedback.
- **Touch targets:** modal close buttons ~28×28px (below 44px floor); tab pills 28px tall.
- **ARIA:** 311 attributes total but only 9 `aria-live` regions; no landmark roles (`main`, `navigation`) in any shell.
- **Reduced motion:** CSS media query handled ✓; framer-motion calls not gated (manual check exists in lib/motion.ts but inconsistently applied).
- **Forms:** labels correctly associated ✓; placeholder-as-label avoided ✓; error `role="alert"` present ✓ — forms are the strongest a11y area.

### E. Workstation UX

- **Tab volume:** IPP ~90 tabs, Trader/Lender/Offtaker 40–60, ESCO/EPC ~15–20. TabNav handles this with group-filter pills + search (>8 tabs) + horizontal scroll — functional but no overflow indicator, no keyboard jump, no "recently used".
- **Group taxonomy is per-page folklore:** "Reporting" vs "Reporting & compliance" vs "Compliance & reporting"; GridOps has 3 groups, Lender has 6. No shared group vocabulary.
- **`cleanTabLabel` works at render** (TabNav:244 strips "(W###)") ✓ — but raw codes still leak through wizard titles, KPI labels, and IncomingPanel copy in places.
- **Empty states:** uniformly `<div>No X match.</div>` — no icon, no "create one" action, inconsistent padding/borders between tabs.
- **Loading states:** uniformly `<div>Loading...</div>` — no skeletons anywhere in chain tabs (>300ms loads get a text flash).
- **Wizards + tours:** all 11 workstations have both ✓ — strongest UX area.

---

## Improvement plan

Phased to be executable in waves, each independently shippable, ordered by leverage. Phases 1–2 are foundations that make every later phase (and every future wave) cheaper.

### Phase 0 — Dead weight (½ day)

1. Delete `Cockpit.tsx` (585 LOC, unrouted).
2. Grep-verify and delete legacy listing components whose routes are now redirects: `Contracts.tsx`, `Trading.tsx`, `Settlement.tsx`, `Carbon.tsx`, `Projects.tsx`, `Grid.tsx`, `Admin.tsx` (keep detail pages `ContractDetail`, `ProjectDetail`, `ProjectLifecycle`).
3. Gate `ux-alternatives/*` routes behind a feature flag (`lib/featureFlags.ts` exists) or admin-only guard — prototypes shouldn't be publicly routable in prod.
4. Verify `roleCompletionTabs.tsx` (3,045 LOC) usage; delete if orphaned.

**Verify:** `npm run check` + `npm run build`; bundle size delta recorded.

### Phase 1 — Design token foundation (1–2 days)

Create `pages/src/lib/theme.ts` as the single source of truth:

```ts
// Neutrals (today's values, unchanged — this is consolidation, not redesign)
export const BG     = 'oklch(0.96 0.003 250)';
export const BG1    = 'oklch(0.99 0.002 250)';
export const BG2    = 'oklch(0.93 0.004 250)';
export const BORDER = 'oklch(0.87 0.006 250)';
export const TX1    = 'oklch(0.17 0.010 250)';
export const TX2    = 'oklch(0.40 0.010 250)';
export const TX3    = 'oklch(0.49 0.010 250)';  // darkened from 0.60 — see Phase 4
export const MONO   = '"JetBrains Mono","IBM Plex Mono",monospace';

// Role accents — ONE map, consumed by AppShell, WorkstationShell, FioriShell, pages
export const ROLE_ACCENTS: Record<string, { label: string; acc: string; accBg: string; accBdr: string }> = { ... };

// Semantic status tones — replaces 60 per-file STATE_TONE maps
export const TONE = {
  danger:  { bg: 'oklch(0.93 0.04 25)',  fg: 'oklch(0.40 0.15 25)'  },
  warning: { bg: 'oklch(0.95 0.05 85)',  fg: 'oklch(0.45 0.12 70)'  },
  success: { bg: 'oklch(0.94 0.05 150)', fg: 'oklch(0.40 0.12 150)' },
  info:    { bg: 'oklch(0.94 0.03 240)', fg: 'oklch(0.42 0.10 240)' },
  neutral: { bg: 'oklch(0.92 0.005 250)',fg: 'oklch(0.40 0.01 250)' },
} as const;
```

Create `pages/src/lib/formatters.ts`: `fmtZar`, `fmtDate`, `fmtDateTime`, `fmtMinutes`, `fmtPct`, `fmtMwh` — canonical implementations of what's copy-pasted 350+ times.

**Migration (codemod, not hand-edit):** the per-file declarations are byte-identical, so a script can (a) delete local `const BG/BG1/BORDER/TX1/TX2/TX3/MONO = ...` lines, (b) add `import { ... } from '../../lib/theme'`. Local `ACC` stays per-page for now (it's role-specific) but should import from `ROLE_ACCENTS` where it matches a role. Formatters same pattern. Run in 3 batches (~40 files each) with `npm run check` between batches.

**Explicitly not in scope:** changing any visual value except TX3 (Phase 4). This phase is pure consolidation — zero visual diff expected except muted text.

### Phase 2 — Chain-tab kit (2–3 days, then per-tab adoption is incremental)

Build the shared scaffold that eliminates the 70% boilerplate for all future waves and lets existing tabs migrate opportunistically:

1. **`useChainList(endpoint, opts)`** hook — wraps the fetch/loading/error/reload pattern (×90 copies today). Returns `{ rows, loading, err, reload }`.
2. **`<StatusPill tone={...}>`** — consumes `TONE` from theme.ts; kills the 60 STATE_TONE maps.
3. **`<DetailDrawer open onClose width>`** — the right slide-out panel (×34 hand-rolled copies). Includes focus trap, Escape close, `aria-modal`, body-scroll lock, and 280ms ease-out slide per the motion standard.
4. **`<TabEmptyState icon title hint action?>`** and **`<TabSkeleton rows={n}>`** — replaces bare "Loading..." / "No X match." divs. Skeleton matches ListingTable row shape.
5. **`<FilterPills options value onChange>`** — the state/tier filter row every tab rebuilds.

**Adoption policy:** all *new* chain tabs must use the kit (add to CLAUDE.md). Existing tabs migrate when touched — no big-bang rewrite. Priority migration: the 34 non-ChainCard tabs (worst duplication).

### Phase 3 — A11y floor (1–2 days) *(elevated from "deferred" in 2026-06-06 critique)*

1. **Contrast:** darken TX3 to `oklch(0.49 0.010 250)` (≈ AA at 11px+); enforce 11px minimum for any TX3 text (the 8–10px tail moves to TX2 or 11px). Single-point change once Phase 1 lands.
2. **Keyboard tabs:** arrow-key navigation in TabNav (Left/Right moves, Home/End jumps) — standard roving-tabindex pattern, one component.
3. **Focus parity for hover:** add `onFocus`/`onBlur` mirroring every `onMouseEnter`/`onMouseLeave` in WorkstationShell, or migrate those buttons to CSS classes with `:hover`/`:focus-visible`.
4. **Touch targets:** modal close buttons and icon buttons to ≥40px hit area (padding, not icon size).
5. **Landmarks:** `<main>`, `<nav aria-label>` in AppShell/WorkstationShell/FioriShell.
6. **ux-alternatives outline:none:** restore focus rings in the 21 flagged spots (or accept, since flagged prototype-only and now flag-gated by Phase 0.3).
7. Remove `outline: none` from `input:focus` at index.css:532; rely on the global `:focus-visible` ring.

### Phase 4 — Chrome consolidation (2–3 days)

1. **One role metadata source:** all three shells import `ROLE_ACCENTS` from theme.ts (Phase 1 created it; this deletes the 3 local maps). Labels unify on the long form ("IPP Developer").
2. **Collapse the double header:** on workstation routes, AppShell's top bar and WorkstationShell's header merge — either AppShell hides on `WORKSTATION_PREFIXES` (mirroring FioriShell's suppression) and WorkstationShell absorbs the avatar/notifications/⌘K cluster, or WorkstationShell drops its own header row. Recommended: suppress AppShell, since WorkstationShell's header already carries role accent + back-link + KPIs. Recovers 52px of vertical space on the densest screens.
3. **Declare FioriShell legacy:** it serves the remaining StitchPage-era routes only. Document: new pages use AppShell (simple) or WorkstationShell (workstation); no new FioriShell nav items.
4. **Workstation group taxonomy:** fix a shared vocabulary (~8 canonical groups: Operations, Contracts & trading, Finance, Compliance & regulatory, Asset health, Supply chain, Safety, Reporting) and map every workstation's groups onto it. Pure label change, no rewiring.

### Phase 5 — Perceived-quality pass (2 days)

1. **Skeletons everywhere:** `<TabSkeleton>` adoption across the 104 tabs' loading branches (mechanical once Phase 2 lands; can be a single grep-driven batch since the `loading ?` branches are near-identical).
2. **Empty states with actions:** `<TabEmptyState>` with per-tab one-liner + primary action (usually "open wizard X") — this is where the wizard investment becomes discoverable.
3. **Press feedback:** `:active { transform: scale(0.97) }` on primary action buttons (needs the CSS-class migration from Phase 3.3, or a shared `<Btn>` in the kit).
4. **Tab strip overflow affordance:** subtle right-edge fade + count badge ("32 tabs") when content overflows; optional "recent tabs" row (last 5 visited, localStorage) for the 40+ tab workstations.
5. **Drawer/modal motion:** standardize 200ms ease-out enter / 150ms exit on DetailDrawer + modals (currently a mix of instant and framer-motion).

### Phase 6 — Typography & density tune (1 day, optional)

1. Establish the working scale as named constants in theme.ts: `FS = { xs: 11, sm: 12, md: 13, lg: 16, xl: 22 }` — matching today's de-facto usage; migrate the 8–10px stragglers up to 11px.
2. Tabular numerals (`fontVariantNumeric: 'tabular-nums'`) on all KPI values, table number columns, and tickers — prevents layout jitter on live data.

---

## What this plan deliberately does NOT do

- **No visual redesign.** The mockup-b light system is established and recently shipped; this plan systematizes it rather than replacing it. (The ux-alternatives track continues separately per the 2026-05-31 directive.)
- **No Tailwind migration.** 97% inline styles is entrenched across ~400 files; converting is high-risk/low-reward. We standardize *values* (tokens) not *mechanism* — except where pseudo-classes are needed (Phase 3.3/5.3).
- **No chain-tab big-bang rewrite.** The kit (Phase 2) stops the bleeding for new waves; old tabs converge opportunistically.
- **No FioriShell removal.** 44 StitchPage routes still depend on it; retiring those pages is a separate product decision.

## Sequencing & effort

| Phase | Effort | Depends on | Shippable alone |
|-------|--------|-----------|-----------------|
| 0 Dead weight | 0.5d | — | ✓ |
| 1 Tokens + formatters | 1–2d | — | ✓ |
| 2 Chain-tab kit | 2–3d | 1 | ✓ |
| 3 A11y floor | 1–2d | 1 | ✓ |
| 4 Chrome consolidation | 2–3d | 1 | ✓ |
| 5 Perceived quality | 2d | 2, 3 | ✓ |
| 6 Typography tune | 1d | 1 | ✓ |

Total ≈ 10–13 working days. Recommended order: 0 → 1 → 3 → 2 → 5 → 4 → 6 (a11y floor early because it's user-facing debt already flagged twice).

## Verification per phase

- `npm run check` (pages tsc) + `npm run build` after every batch.
- Phase 1/4: screenshot diff of one workstation per role (the change should be visually nil except TX3).
- Phase 3: keyboard-only walkthrough of one workstation (tab → arrow through tabs → open drawer → Escape); axe-core scan on `/launch/trader` + `/trader-risk/workstation`.
- Phase 5: throttled-network load of 3 chain tabs (skeleton visible, no text flash).
- Playwright suite (`npm run test:browser` against local dev) green before any deploy.
