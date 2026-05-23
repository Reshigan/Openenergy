# $100M Experience — Per-Role Design System

**Status:** Draft — pending user approval
**Date:** 2026-05-23
**Owner:** UX foundation work, applies to entire SPA at [open-energy-platform/pages/](../../../open-energy-platform/pages/)
**Predecessors:** Brand palette already locked in [tailwind.config.js](../../../open-energy-platform/pages/tailwind.config.js) (navy / blue / teal / sky industrial-fintech). This spec layers on top, not over.

---

## 1. Goal

Lift the SPA from competent-generic-SaaS chrome to a defensibly premium, role-aware experience that reads as a single product but gives each of the 10 user roles a distinct personality, hero motif, and density profile.

Concrete tests of "done":
- Side-by-side with Bloomberg Terminal, Linear, and Apple Pro apps, the platform looks like it belongs in that company.
- A new user lands on `/launch/:role` and within 1 second knows which role they're in without reading text.
- A trader looking at their workstation feels they are in a power-user environment; a lender looking at theirs feels they are in an exec brief.
- All of the above without breaking WCAG AA, `prefers-reduced-motion`, or the existing API surface.

---

## 2. Design Register

**Hybrid Bloomberg + Apple Pro.** Two density modes on one tokenized foundation:

- **Cinematic mode (default for ALL launch boards)** — Apple Pro register. Editorial typography, oversized hero numerals (96-128pt), frosted glass over role-tinted gradient hazes, spring-eased motion, generous whitespace. First impression matters: every role's front door reads as premium and considered.

- **Bloomberg mode (workstations for the four ops roles)** — Trading-desk register. Dense rows, monospaced numerics, value-flash micro-motion, hotkey-driven command rail, tight 4pt spacing rhythm, sticky toolbars. Used on the deep work surfaces for **trader, grid operator, regulator, support** — roles whose users spend hours in dense data.

The remaining six roles (admin, lender, IPP, wind, offtaker, carbon) keep cinematic mode on their workstations too. A power-user density toggle is in scope for Batch 4 but not Batch 0-3.

---

## 3. Foundation Layer

### 3.1 Typography

| Role in system | Font | Source |
|---|---|---|
| Display serif (editorial hero, regulator/lender/carbon) | Newsreader | Google Fonts via @fontsource |
| Display sans (most hero numerals, all headlines) | Inter Display | Google Fonts via @fontsource |
| Body sans | Inter | Google Fonts via @fontsource |
| Mono (Bloomberg numerics, tickers, IDs) | JetBrains Mono | Google Fonts via @fontsource |

All `font-display: swap`. Critical preload for Inter Display + JetBrains Mono. Tabular-nums locked on for all numeric output.

### 3.2 Type scale (semantic tokens)

```
hero-display    96-128pt   Newsreader Light            (cinematic exec only)
hero-numeric    72pt       Inter Display 700 tabular   (cinematic launch boards)
display-1       48/56      Newsreader OR Inter Display
headline        32/40      Inter Display 600
title           20/28      Inter 600
body            16/24      Inter 400
caption-mono    12/16      JetBrains Mono 500
tick-mono       13/16      JetBrains Mono 600          (Bloomberg ticker rows)
```

### 3.3 Density modes

Set at route-shell level via `data-density="bloomberg" | "cinematic"`. CSS vars switch on the attribute:

| Token | Cinematic | Bloomberg |
|---|---|---|
| Base spacing unit | 8pt | 4pt |
| Card padding | 24/32pt | 8/12pt |
| Section gap | 32pt | 12pt |
| Card radius | 16px | 4px |
| Hero numeral size | 96-128pt | n/a (no hero) |
| Motion | Full spring entrances + stagger | Value-flash only |
| Numeric font | Inter Display tabular | JetBrains Mono |
| Toolbar | None / floating | Sticky, mono labels, hotkeys |

### 3.4 Motion primitives

Library: `framer-motion`. Three named springs:

| Name | Stiffness | Damping | Use |
|---|---|---|---|
| `oe.spring.snap` | 380 | 30 | Cards/list rows entering |
| `oe.spring.smooth` | 220 | 32 | Hero entrances, modals, page transitions |
| `oe.spring.flick` | 600 | 40 | Bloomberg ticks, value flashes, micro-interactions |

Other rules:
- Stagger: 40ms per item (cinematic), 0ms (Bloomberg)
- Number count-up: 600ms ease-out on cinematic hero numerals
- Value-flash: 220ms opacity ramp with role-accent on Bloomberg ticker on change
- Page entrance: 240ms `smooth` spring with 4px upward translate
- All motion gated by `prefers-reduced-motion: reduce` — fade-only fallback at 120ms

### 3.5 Role color tokens (CSS variables)

Set at `<RoleShell>` per route:

```css
--role-accent           /* signature color */
--role-accent-soft      /* 20% alpha on surface */
--role-haze             /* radial gradient for SignatureHero bg */
--role-chrome           /* dark | light | warm */
--role-density          /* bloomberg | cinematic */
--role-display-font     /* Newsreader | "Inter Display" */
```

### 3.6 Signature components

New directory: [open-energy-platform/pages/src/components/signature/](../../../open-energy-platform/pages/src/components/signature/)

| Component | Purpose |
|---|---|
| `<RoleShell>` | Wraps page, sets all role CSS vars + density mode |
| `<HeroNumeral>` | 96-128pt cinematic figure with eyebrow, delta, sparkline |
| `<Ticker>` | Bloomberg tape, value-flash on tick, virtualized, ARIA-live polite |
| `<SignatureHero>` | Slot for role-specific top motif. ~40vh cinematic, 25vh Bloomberg |
| `<DensityCard>` | Auto-adapts spacing/type to current density mode |
| `<FrostedCard>` | Cinematic glass card over role-haze gradient |
| `<KineticChart>` | Recharts wrapper with role-color theming + spring entrance |
| `<CommandRail>` | Bloomberg hotkey-driven sticky action rail |
| `<AiInlineCard>` | AI suggestion with "why" + 1-click accept (preserves [[feedback_ai_subtle_active]]) |
| `<StatusPulse>` | Live indicator. Reduced-motion safe (steady fill when reduced) |

All components consume only the role CSS vars + density attribute — no hard-coded per-role logic inside them. This is what makes the foundation reusable.

---

## 4. Per-Role Themes

All 10 roles, all using the same `<RoleShell>` + signature components, differentiated by tokens and signature hero motif.

| Role | Workstation mode | Accent | Chrome | Display font | **Signature Hero Motif** |
|------|---|---|---|---|---|
| **Trader** (`/launch/trader`) | Bloomberg | Amber `#f5b800` | Dark `#0a1622` | Inter Display + JetBrains Mono | **Live multi-tape ticker** — SOL/WND/HYB/STO/THR stacked, 60fps value-flash on tick |
| **Grid Operator** (`/launch/grid_operator`) | Bloomberg | Sky `#5fa8e8` + alarm `#c0392b` | Dark `#0a1c30` | Inter Display + JetBrains Mono | **Animated SA grid map** — Eskom nodal zones, dispatch instructions lighting in real time |
| **Regulator** (`/launch/regulator`) | Bloomberg-formal | Sand `#b8a07a` + Navy | Cream `#f7f3ec` | Newsreader + Inter | **Gazette ledger** — chronological enforcement record set in serif, parchment grain |
| **Support** (`/launch/support`) | Bloomberg | Slate `#6b7685` + Sky | Dark slate | Inter + JetBrains Mono | **Live ticket queue** — rows tick in, SLA countdown rings |
| **Platform Admin** (`/launch/admin`) | Cinematic | Violet `#7e57c2` + Iron | Dark indigo | Inter Display | **Tenant constellation** — dot grid of all tenants, sized by usage, pulse on activity |
| **Lender** (`/launch/lender`) | Cinematic | Navy + Gold `#c9a049` | Dark forest | Newsreader + Inter | **Waterfall ladder** — animated cascade visualizing senior→sub debt payment flow |
| **IPP Developer** (`/launch/ipp_developer`) | Cinematic | Construction `#c97a14` + concrete | Warm cream | Inter Display | **Milestone road** — site timeline as horizontal journey, current position glowing |
| **Wind Operator** (`/launch/wind_operator`) | Cinematic | Teal `#1f9b95` + Sky | Cool blue-white | Inter Display | **Kinetic wind field** — animated vector field of actual wind speeds at the farms |
| **Offtaker** (`/launch/offtaker`) | Cinematic | Solar `#f5b800` + Sand | Warm white | Inter Display | **Site heatmap** — grouped sites as heatmap, consumption intensity in role color |
| **Carbon Fund** (`/launch/carbon_fund`) | Cinematic | Forest `#1a8a5b` + Cream | Cream | Newsreader + Inter | **Vintage stamp wall** — credit serials as a stamp grid; retired ones desaturate elegantly |

### Launch board skeleton (universal)

```
<RoleShell>
  <SignatureHero>           <!-- full-bleed role motif, ~40vh cinematic -->
  <KpiStrip>                <!-- 4-6 HeroNumeral / FrostedCard tiles -->
  <WorkflowGrid>             <!-- 6-9 cards with role icons -->
  <AiInlineRail>             <!-- 1-3 AiInlineCard, role-tone copy -->
  <ActionQueue>              <!-- existing component, density-aware -->
</RoleShell>
```

### Workstation skeleton

```
<RoleShell density={role.density}>
  <CommandRail visible={role.density === 'bloomberg'}>
  <TabStrip>                  <!-- existing per-role tabs -->
  <Tab content>               <!-- tabular num tables (Bloomberg) or FrostedCard grids (Cinematic) -->
</RoleShell>
```

---

## 5. Execution Batches

Each batch is one PR, reviewable and revertable.

### Batch 0 — Foundation

- Extend [tailwind.config.js](../../../open-energy-platform/pages/tailwind.config.js) with role/density CSS var hooks
- Add `@fontsource/newsreader`, `@fontsource/inter`, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` to [open-energy-platform/pages/package.json](../../../open-energy-platform/pages/package.json)
- Install `framer-motion`
- Create [open-energy-platform/pages/src/lib/motion.ts](../../../open-energy-platform/pages/src/lib/motion.ts) with named spring presets + reduced-motion wrapper
- Build all 10 signature components in [open-energy-platform/pages/src/components/signature/](../../../open-energy-platform/pages/src/components/signature/)
- Build per-role token table in [open-energy-platform/pages/src/lib/role-themes.ts](../../../open-energy-platform/pages/src/lib/role-themes.ts)
- Storybook/preview not required; visual sanity via existing launch board still rendering

**Acceptance**: Existing launch boards still render. Signature components render in isolation via a temp dev route. Lighthouse perf doesn't regress more than 5pts.

### Batch 1 — Trader + Lender pilot

- Re-skin [LaunchBoardShell.tsx](../../../open-energy-platform/pages/src/components/launch/LaunchBoardShell.tsx) to delegate to `<RoleShell>` when role is `trader` or `lender`
- Build `<Ticker>` signature hero with mock live data wired to existing trading endpoints
- Build `<Waterfall>` signature hero for Lender (animated payment cascade)
- Re-skin Trader and Lender launch boards end-to-end
- Adjust [LaunchRedirect](../../../open-energy-platform/pages/src/App.tsx) only if needed (likely not)

**Acceptance**: Trader and Lender launch boards demo-able. Both density modes proven in production. Existing 8 boards still work via fallback.

### Batch 2 — Remaining 8 launch boards

- 3 Bloomberg: grid operator, regulator, support
- 5 Cinematic: admin, IPP developer, wind operator, offtaker, carbon fund
- Each role's signature hero motif gets implemented
- Remove `LaunchBoardShell` legacy branch — all 10 roles on new shell

**Acceptance**: All 10 launch boards in the new system. Side-by-side regression check vs. old screenshots.

### Batch 3 — Workstations

Priority order (highest user volume first):
1. Trader workstation (Bloomberg mode + `<CommandRail>` + tabular tables)
2. Grid Operator workstation
3. Lender workstation
4. Carbon Fund workstation
5. Regulator workstation
6. Remaining 5 (IPP, wind, offtaker, support, admin)

Each workstation is one sub-PR.

**Acceptance**: [WorkstationShell.tsx](../../../open-energy-platform/pages/src/components/launch/WorkstationShell.tsx) consumes `<RoleShell>` + density mode. Tabular data tables in Bloomberg mode use `<DensityCard>` + mono numerics.

### Batch 4 — Chrome polish

- Top navigation: per-role accent strip
- Sidebar: density-aware
- Modal system: spring-eased entrance/exit
- Toast system: `aria-live="polite"`, role-tinted
- Density toggle for power users on cinematic-default roles (last)

**Acceptance**: No raw chrome elements left. Full system consistency.

---

## 6. Non-negotiable Constraints

### Accessibility
- WCAG AA contrast (4.5:1 body, 3:1 large/UI) in BOTH chrome modes (dark and warm/light). Hero numerals at 96pt+ qualify as large text; smaller display sizes must hit 4.5:1.
- `prefers-reduced-motion: reduce` → all springs collapse to 120ms fade; value-flash becomes no-op; count-up renders final value immediately
- Focus rings visible on all interactive elements (2-4px in role-accent)
- Tickers/live regions use `aria-live="polite"` (not assertive — these update constantly)
- Color is never the only signal (Bloomberg up/down ticks include `▲`/`▼` glyphs alongside green/red)
- Tabular numerics use `font-variant-numeric: tabular-nums` so columns don't jitter

### Performance
- Critical font preload: Inter Display 600, JetBrains Mono 600. Others lazy.
- Newsreader: loaded only on routes that need serif (regulator, lender, carbon, exec heads)
- Signature hero motifs: opt-in lazy import (each hero is a chunk)
- Recharts already in use — `<KineticChart>` is a wrapper, not a replacement
- Total JS payload increase budget: ≤ 80KB gzipped post-Batch 0
- Lighthouse Perf regression budget: ≤ 5 points

### Backwards compatibility
- All existing routes keep working through every batch
- `LaunchBoardShell` public props unchanged; only internal rendering branches
- API contract unchanged (`/api/launch/:role` shape preserved)
- Existing tests in [tests/](../../../open-energy-platform/tests/) must still pass (the 474-unit-test suite)

---

## 7. Out of Scope

- New API endpoints or data shape changes
- Mobile native apps (we adapt for narrow viewports but don't ship native)
- Internationalization beyond existing en-ZA
- New role types (the 10 are fixed)
- Workstation business logic changes (just chrome + density)
- The legacy [StitchPage.tsx](../../../open-energy-platform/pages/src/components/StitchPage.tsx) wrapper — it stays until pages migrate organically

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| 10 themes feel fragmented, not unified | Same shell + spacing rhythm + motion grammar everywhere. Personality is via accent + hero motif, not chrome rewrites |
| Bloomberg ops mode loses non-power-users | Cinematic is the default everywhere; Bloomberg only on workstations of the four ops roles where the user is a power user by definition |
| Font payload kills perf | Critical preload only Inter Display + JBM; Newsreader lazy; all `font-display: swap` |
| Hero motifs become decorative bloat | Each motif must show LIVE data, not be a static image. Lazy-loaded per route |
| Reduced-motion users get a flat experience | Reduced-motion fallback is designed first; springs are additive |
| Visual regressions in unrelated pages | Foundation is additive (CSS vars, new components). Existing pages render unchanged until they opt in |

---

## 9. Memory updates

After this lands, write to memory:
- `project_100m_experience.md` — references this spec; tracks which batches shipped
- Update `project_l5_completion_plan.md` to note this work runs in parallel with L5 deepening (chrome upgrade, not feature deepening)
