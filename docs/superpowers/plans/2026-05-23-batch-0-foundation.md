# Batch 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the design-system foundation — fonts, motion library, role/density tokens, and 10 signature primitive components — without re-skinning a single existing page.

**Architecture:** Additive layer on top of existing Tailwind config + components. New CSS vars are introduced via a `<RoleShell>` wrapper that sets `data-density` and `--role-*` variables. Tailwind continues to be the styling primitive; new components live in `pages/src/components/signature/`. Motion uses `framer-motion`. Fonts are loaded via `@fontsource` to stay offline-safe.

**Tech Stack:** React 18 + TypeScript + Tailwind v3 + Recharts (existing) + `framer-motion` (new) + `@fontsource/*` (new).

---

## File map

**Create:**
- `pages/src/lib/motion.ts` — spring presets, reduced-motion helpers
- `pages/src/lib/role-themes.ts` — per-role token table (10 roles)
- `pages/src/components/signature/RoleShell.tsx`
- `pages/src/components/signature/HeroNumeral.tsx`
- `pages/src/components/signature/Ticker.tsx`
- `pages/src/components/signature/SignatureHero.tsx`
- `pages/src/components/signature/DensityCard.tsx`
- `pages/src/components/signature/FrostedCard.tsx`
- `pages/src/components/signature/KineticChart.tsx`
- `pages/src/components/signature/CommandRail.tsx`
- `pages/src/components/signature/AiInlineCard.tsx`
- `pages/src/components/signature/StatusPulse.tsx`
- `pages/src/components/signature/index.ts` — barrel export
- `pages/src/components/signature/signature.css` — density mode + role var rules
- `pages/src/pages/__dev/SignaturePreview.tsx` — dev-only preview route (gated behind `import.meta.env.DEV`)

**Modify:**
- `pages/package.json` — add `framer-motion`, `@fontsource/inter`, `@fontsource/inter-variable`, `@fontsource/inter-tight`, `@fontsource/newsreader`, `@fontsource/jetbrains-mono`
- `pages/src/main.tsx` — import font CSS + signature.css
- `pages/tailwind.config.js` — add `signature` font family stack
- `pages/src/App.tsx` — add dev-only `/dev/signature` preview route

---

## Task 1: Install dependencies

- [ ] **Step 1: Add packages to package.json**

Modify `pages/package.json` dependencies block to add:
```json
"framer-motion": "^11.11.0",
"@fontsource-variable/inter": "^5.1.0",
"@fontsource-variable/inter-tight": "^5.1.0",
"@fontsource-variable/newsreader": "^5.1.0",
"@fontsource-variable/jetbrains-mono": "^5.1.0"
```

> Note: `inter-tight` is used in place of "Inter Display" — it's the official close cousin available on Google Fonts; the spec's "Inter Display" name was descriptive. Newsreader Variable covers Newsreader Light through Bold via one file.

- [ ] **Step 2: Install**

Run: `cd open-energy-platform/pages && npm install`
Expected: All packages resolve, no peer-dep errors. `package-lock.json` updates.

- [ ] **Step 3: Verify build still works**

Run: `cd open-energy-platform/pages && npm run check`
Expected: Exit 0.

- [ ] **Step 4: Commit**

```bash
git add open-energy-platform/pages/package.json open-energy-platform/pages/package-lock.json
git commit -m "chore(pages): add framer-motion + @fontsource variable fonts for design foundation"
```

---

## Task 2: Motion library

- [ ] **Step 1: Create motion.ts**

Create `pages/src/lib/motion.ts`:

```ts
// Motion primitives for the OE signature design system.
//
// Three named springs cover the entire motion grammar:
//   - snap    : list/card entrance (380/30)
//   - smooth  : hero/modal/page transitions (220/32)
//   - flick   : Bloomberg ticks, value flashes (600/40)
//
// All consumers MUST gate animations on prefersReducedMotion(). When the user
// has reduce-motion on, the helpers below return a no-op transition so values
// snap to their final state instead of animating.

import type { Transition, Variants } from 'framer-motion';

export const springs = {
  snap: { type: 'spring', stiffness: 380, damping: 30 } as Transition,
  smooth: { type: 'spring', stiffness: 220, damping: 32 } as Transition,
  flick: { type: 'spring', stiffness: 600, damping: 40 } as Transition,
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Use as the transition prop on motion components when the value should
// snap-on-reduce rather than animate.
export function motionTransition(preset: keyof typeof springs): Transition {
  if (prefersReducedMotion()) return { duration: 0 };
  return springs[preset];
}

// Stagger preset for grids/lists. 40ms per item in cinematic mode; 0 in
// Bloomberg or under reduced motion.
export function staggerChildren(density: 'cinematic' | 'bloomberg' = 'cinematic'): Transition {
  if (prefersReducedMotion() || density === 'bloomberg') {
    return { staggerChildren: 0 };
  }
  return { staggerChildren: 0.04 };
}

// Variants shared by entrance-animated containers.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
};
```

- [ ] **Step 2: Type-check**

Run: `cd open-energy-platform/pages && npm run check`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add open-energy-platform/pages/src/lib/motion.ts
git commit -m "feat(pages): motion primitives — three named springs + reduced-motion helper"
```

---

## Task 3: Role theme table

- [ ] **Step 1: Create role-themes.ts**

Create `pages/src/lib/role-themes.ts`:

```ts
// Per-role design tokens. Drives <RoleShell> CSS variables.
//
// Every role gets the SAME shell + signature components — personality lives
// here, in a single table. To add a role, add a row.

export type RoleKey =
  | 'admin'
  | 'trader'
  | 'ipp_developer'
  | 'wind_operator'
  | 'offtaker'
  | 'lender'
  | 'carbon_fund'
  | 'regulator'
  | 'grid_operator'
  | 'support';

export type Density = 'cinematic' | 'bloomberg';
export type Chrome = 'dark' | 'light' | 'warm';

export interface RoleTheme {
  key: RoleKey;
  label: string;
  // Density on the role's deep workstation. Launch boards are ALWAYS
  // cinematic — that's the front door rule.
  workstationDensity: Density;
  // Chrome family — dictates surface, on-surface, border base colors.
  chrome: Chrome;
  // Primary role accent. Used for borders on hover/focus, ticker flashes,
  // KPI badges, hero gradients.
  accent: string;
  // Optional second accent. Many roles use it for status (alarm red on
  // grid, gold on lender, sky on support, etc.)
  accentSecondary?: string;
  // Soft-on-surface accent for filled badges. Computed by hand — keeping
  // it explicit so it's tunable per role.
  accentSoft: string;
  // CSS gradient string for the SignatureHero background haze.
  haze: string;
  // Which display font this role leans on. Inter Tight = sans display
  // (default); Newsreader = editorial serif (regulator/lender/carbon).
  displayFont: 'inter-tight' | 'newsreader';
  // Free-text motif key — referenced by per-role SignatureHero components
  // that land in Batch 1+.
  heroMotif: string;
}

export const roleThemes: Record<RoleKey, RoleTheme> = {
  trader: {
    key: 'trader',
    label: 'Trading desk',
    workstationDensity: 'bloomberg',
    chrome: 'dark',
    accent: '#f5b800',
    accentSecondary: '#5fa8e8',
    accentSoft: 'rgba(245, 184, 0, 0.18)',
    haze: 'radial-gradient(120% 80% at 20% 0%, rgba(245,184,0,0.22) 0%, rgba(10,22,34,0) 60%), linear-gradient(180deg, #0a1622 0%, #0f2540 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'multi-tape-ticker',
  },
  grid_operator: {
    key: 'grid_operator',
    label: 'System operator',
    workstationDensity: 'bloomberg',
    chrome: 'dark',
    accent: '#5fa8e8',
    accentSecondary: '#c0392b',
    accentSoft: 'rgba(95, 168, 232, 0.18)',
    haze: 'radial-gradient(120% 80% at 80% 0%, rgba(95,168,232,0.25) 0%, rgba(10,28,48,0) 60%), linear-gradient(180deg, #0a1c30 0%, #0f2540 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'sa-grid-map',
  },
  regulator: {
    key: 'regulator',
    label: 'Regulator',
    workstationDensity: 'bloomberg',
    chrome: 'warm',
    accent: '#b8a07a',
    accentSecondary: '#1a3a5c',
    accentSoft: 'rgba(184, 160, 122, 0.22)',
    haze: 'radial-gradient(120% 80% at 50% 0%, rgba(184,160,122,0.28) 0%, rgba(247,243,236,0) 65%), linear-gradient(180deg, #f7f3ec 0%, #ede3d0 100%)',
    displayFont: 'newsreader',
    heroMotif: 'gazette-ledger',
  },
  support: {
    key: 'support',
    label: 'Support desk',
    workstationDensity: 'bloomberg',
    chrome: 'dark',
    accent: '#5fa8e8',
    accentSecondary: '#6b7685',
    accentSoft: 'rgba(95, 168, 232, 0.18)',
    haze: 'radial-gradient(120% 80% at 50% 0%, rgba(95,168,232,0.22) 0%, rgba(15,28,46,0) 60%), linear-gradient(180deg, #0f1c2e 0%, #1a2a3e 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'ticket-queue',
  },
  admin: {
    key: 'admin',
    label: 'Platform admin',
    workstationDensity: 'cinematic',
    chrome: 'dark',
    accent: '#7e57c2',
    accentSecondary: '#5fa8e8',
    accentSoft: 'rgba(126, 87, 194, 0.22)',
    haze: 'radial-gradient(120% 80% at 30% 0%, rgba(126,87,194,0.28) 0%, rgba(15,28,46,0) 65%), linear-gradient(180deg, #0f1c2e 0%, #1a3a5c 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'tenant-constellation',
  },
  lender: {
    key: 'lender',
    label: 'Lender',
    workstationDensity: 'cinematic',
    chrome: 'dark',
    accent: '#c9a049',
    accentSecondary: '#1a3a5c',
    accentSoft: 'rgba(201, 160, 73, 0.22)',
    haze: 'radial-gradient(120% 80% at 70% 0%, rgba(201,160,73,0.24) 0%, rgba(10,28,48,0) 60%), linear-gradient(180deg, #0f2540 0%, #0a1c30 100%)',
    displayFont: 'newsreader',
    heroMotif: 'waterfall-ladder',
  },
  ipp_developer: {
    key: 'ipp_developer',
    label: 'IPP developer',
    workstationDensity: 'cinematic',
    chrome: 'warm',
    accent: '#c97a14',
    accentSecondary: '#6b7685',
    accentSoft: 'rgba(201, 122, 20, 0.20)',
    haze: 'radial-gradient(120% 80% at 30% 0%, rgba(201,122,20,0.24) 0%, rgba(252,247,238,0) 65%), linear-gradient(180deg, #fcf7ee 0%, #f5ebd6 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'milestone-road',
  },
  wind_operator: {
    key: 'wind_operator',
    label: 'Wind operator',
    workstationDensity: 'cinematic',
    chrome: 'light',
    accent: '#1f9b95',
    accentSecondary: '#5fa8e8',
    accentSoft: 'rgba(31, 155, 149, 0.20)',
    haze: 'radial-gradient(120% 80% at 60% 0%, rgba(31,155,149,0.26) 0%, rgba(245,250,253,0) 65%), linear-gradient(180deg, #f5fafd 0%, #dfeef5 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'kinetic-wind-field',
  },
  offtaker: {
    key: 'offtaker',
    label: 'Offtaker',
    workstationDensity: 'cinematic',
    chrome: 'warm',
    accent: '#f5b800',
    accentSecondary: '#b8a07a',
    accentSoft: 'rgba(245, 184, 0, 0.20)',
    haze: 'radial-gradient(120% 80% at 50% 0%, rgba(245,184,0,0.22) 0%, rgba(253,249,242,0) 65%), linear-gradient(180deg, #fdf9f2 0%, #f5ecd5 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'site-heatmap',
  },
  carbon_fund: {
    key: 'carbon_fund',
    label: 'Carbon fund',
    workstationDensity: 'cinematic',
    chrome: 'light',
    accent: '#1a8a5b',
    accentSecondary: '#c9a049',
    accentSoft: 'rgba(26, 138, 91, 0.20)',
    haze: 'radial-gradient(120% 80% at 30% 0%, rgba(26,138,91,0.24) 0%, rgba(250,248,242,0) 65%), linear-gradient(180deg, #faf8f2 0%, #e8efe1 100%)',
    displayFont: 'newsreader',
    heroMotif: 'vintage-stamp-wall',
  },
};

export function themeFor(role: string | undefined | null): RoleTheme {
  if (role && role in roleThemes) return roleThemes[role as RoleKey];
  // Sensible fallback so an unknown role still renders.
  return roleThemes.trader;
}
```

- [ ] **Step 2: Type-check**

Run: `cd open-energy-platform/pages && npm run check`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add open-energy-platform/pages/src/lib/role-themes.ts
git commit -m "feat(pages): per-role theme table — 10 roles × density/accent/haze/motif"
```

---

## Task 4: signature.css + Tailwind font hook

- [ ] **Step 1: Create signature.css**

Create `pages/src/components/signature/signature.css`:

```css
/* Signature design-system stylesheet.
 *
 * This file owns CSS variables the <RoleShell> sets and the density-mode
 * rules that downstream components consume. Component-level styling stays
 * in Tailwind — this file only carries things Tailwind can't express
 * (CSS custom properties, prefers-reduced-motion, density-mode switches).
 */

[data-role-shell] {
  /* Role-tinted accents resolved from role-themes.ts. Defaults match the
   * trader palette so an unset shell still renders.
   */
  --role-accent: #f5b800;
  --role-accent-secondary: #5fa8e8;
  --role-accent-soft: rgba(245, 184, 0, 0.18);
  --role-haze: radial-gradient(120% 80% at 20% 0%, rgba(245, 184, 0, 0.22) 0%, rgba(10, 22, 34, 0) 60%);

  /* Chrome surface colors. Chrome is one of dark | light | warm. */
  --role-surface: #ffffff;
  --role-surface-raised: #f5f8fb;
  --role-on-surface: #0f1c2e;
  --role-on-surface-muted: #4a5666;
  --role-border: rgba(15, 28, 46, 0.10);
}

[data-role-shell][data-chrome='dark'] {
  --role-surface: #0f1c2e;
  --role-surface-raised: #16263d;
  --role-on-surface: #eef2f7;
  --role-on-surface-muted: #9aa6b8;
  --role-border: rgba(255, 255, 255, 0.10);
}

[data-role-shell][data-chrome='warm'] {
  --role-surface: #fdf9f2;
  --role-surface-raised: #f7f3ec;
  --role-on-surface: #2a1f12;
  --role-on-surface-muted: #6b5b48;
  --role-border: rgba(42, 31, 18, 0.12);
}

/* Density mode — drives spacing, font, radius. Cinematic = airy/exec,
 * Bloomberg = tight/ops. */
[data-role-shell][data-density='cinematic'] {
  --oe-pad-card: 24px;
  --oe-pad-section: 32px;
  --oe-radius-card: 16px;
  --oe-hero-numeral: clamp(72px, 9vw, 128px);
  --oe-num-font: 'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Inter', system-ui, sans-serif;
}

[data-role-shell][data-density='bloomberg'] {
  --oe-pad-card: 12px;
  --oe-pad-section: 16px;
  --oe-radius-card: 4px;
  --oe-hero-numeral: 40px;
  --oe-num-font: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
}

/* Display font is per-role, not per-density. */
[data-role-shell][data-display-font='newsreader'] {
  --oe-display-font: 'Newsreader Variable', 'Newsreader', Georgia, serif;
}
[data-role-shell][data-display-font='inter-tight'] {
  --oe-display-font: 'Inter Tight Variable', 'Inter Tight', 'Inter', system-ui, sans-serif;
}

/* Value-flash on Bloomberg tickers. Components apply data-flash="up"|"down"
 * for ~220ms, then JS removes it. */
@keyframes oe-flash-up {
  0% { background-color: rgba(31, 138, 91, 0.45); }
  100% { background-color: transparent; }
}
@keyframes oe-flash-down {
  0% { background-color: rgba(192, 57, 43, 0.45); }
  100% { background-color: transparent; }
}
[data-flash='up'] { animation: oe-flash-up 220ms ease-out; }
[data-flash='down'] { animation: oe-flash-down 220ms ease-out; }

/* StatusPulse — animated breathing dot. Steady fill when reduced motion. */
@keyframes oe-pulse {
  0%, 100% { transform: scale(1); opacity: 0.65; }
  50% { transform: scale(1.6); opacity: 0; }
}
.oe-pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: currentColor;
  animation: oe-pulse 1.6s ease-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  [data-flash='up'], [data-flash='down'] { animation: none; }
  .oe-pulse::after { animation: none; opacity: 0.5; transform: scale(1.2); }
}

/* Tabular numerics — used by every numeric output, Bloomberg and Cinematic
 * alike. Keeps columns from jittering. */
.oe-tnum { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
```

- [ ] **Step 2: Extend tailwind.config.js with signature font family**

Open `pages/tailwind.config.js`. Find the `theme.extend` block. Locate the existing `fontFamily` entry if present, otherwise add one. Add this entry inside `fontFamily`:

```js
fontFamily: {
  // ... preserve any existing entries ...
  display: ['Inter Tight Variable', 'Inter Tight', 'Inter', 'system-ui', 'sans-serif'],
  serif: ['Newsreader Variable', 'Newsreader', 'Georgia', 'serif'],
  mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'monospace'],
  sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
},
```

If a `fontFamily` block already exists in the config, merge rather than replace — preserve any existing keys you don't have above.

- [ ] **Step 3: Import the font + signature CSS in main.tsx**

In `pages/src/main.tsx`, add these imports at the top (after the other CSS import):

```ts
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/jetbrains-mono';
import './components/signature/signature.css';
```

- [ ] **Step 4: Type-check + build**

Run: `cd open-energy-platform/pages && npm run check && npm run build`
Expected: Both exit 0. Build emits a `dist/` with no errors.

- [ ] **Step 5: Commit**

```bash
git add open-energy-platform/pages/src/components/signature/signature.css \
        open-energy-platform/pages/tailwind.config.js \
        open-energy-platform/pages/src/main.tsx
git commit -m "feat(pages): signature.css with density + chrome + flash + pulse + fonts wired"
```

---

## Task 5: RoleShell

- [ ] **Step 1: Create RoleShell.tsx**

Create `pages/src/components/signature/RoleShell.tsx`:

```tsx
// RoleShell — sets per-role CSS vars + density mode on a wrapping div.
//
// Every page that opts into the signature design system wraps its content
// in <RoleShell role="trader"> (or whichever role). Defaults to cinematic
// density on launch boards; pass density="bloomberg" on the four ops-role
// workstations.

import React from 'react';
import { themeFor, type Density, type RoleKey } from '../../lib/role-themes';

export interface RoleShellProps {
  role: RoleKey | string;
  density?: Density;
  // Override the chrome chosen by the role's theme — used when an exec
  // user wants a cinematic view of a normally-Bloomberg surface.
  chrome?: 'dark' | 'light' | 'warm';
  className?: string;
  children: React.ReactNode;
}

export function RoleShell({ role, density, chrome, className, children }: RoleShellProps) {
  const theme = themeFor(role);
  const effectiveDensity: Density = density ?? 'cinematic';
  const effectiveChrome = chrome ?? theme.chrome;
  const style: React.CSSProperties & Record<string, string> = {
    '--role-accent': theme.accent,
    '--role-accent-secondary': theme.accentSecondary ?? theme.accent,
    '--role-accent-soft': theme.accentSoft,
    '--role-haze': theme.haze,
  };
  return (
    <div
      data-role-shell
      data-role={theme.key}
      data-density={effectiveDensity}
      data-chrome={effectiveChrome}
      data-display-font={theme.displayFont}
      className={className}
      style={{
        ...style,
        background: 'var(--role-surface)',
        color: 'var(--role-on-surface)',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd open-energy-platform/pages && npm run check`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add open-energy-platform/pages/src/components/signature/RoleShell.tsx
git commit -m "feat(pages): RoleShell — applies per-role CSS vars + density attribute"
```

---

## Task 6: HeroNumeral

- [ ] **Step 1: Create HeroNumeral.tsx**

```tsx
// HeroNumeral — cinematic oversized figure with eyebrow, delta, optional sparkline.
//
// Inside Bloomberg-density shells the numeral compresses to 40px and the
// component switches to mono. Animation: count-up + fade-in on first render
// (cinematic only), gated by reduced motion.

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { motionTransition, prefersReducedMotion } from '../../lib/motion';

export interface HeroNumeralProps {
  eyebrow: string;
  value: number;
  format?: (v: number) => string;
  unit?: string;
  delta?: { value: number; tone?: 'good' | 'bad' | 'neutral'; label?: string };
  sparkline?: number[];
  // When countUp is true and reduce-motion is off, the value animates from 0.
  countUp?: boolean;
}

function defaultFormat(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  return v.toFixed(0);
}

function useCountUp(target: number, enabled: boolean, durationMs = 600): number {
  const [v, setV] = useState(enabled ? 0 : target);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setV(target);
      return;
    }
    let raf = 0;
    function tick(t: number) {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);
  return v;
}

export function HeroNumeral({
  eyebrow,
  value,
  format = defaultFormat,
  unit,
  delta,
  sparkline,
  countUp = true,
}: HeroNumeralProps) {
  const enableCountUp = countUp && !prefersReducedMotion();
  const animated = useCountUp(value, enableCountUp);
  const toneColor =
    delta?.tone === 'good' ? '#1f8a5b' : delta?.tone === 'bad' ? '#c0392b' : 'var(--role-on-surface-muted)';
  const arrow = delta && delta.value > 0 ? '▲' : delta && delta.value < 0 ? '▼' : '▬';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('smooth')}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div
        className="oe-tnum"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--role-on-surface-muted)',
        }}
      >
        {eyebrow}
      </div>
      <div
        className="oe-tnum"
        style={{
          fontFamily: 'var(--oe-num-font)',
          fontSize: 'var(--oe-hero-numeral)',
          lineHeight: 0.95,
          fontWeight: 600,
          letterSpacing: '-0.025em',
          color: 'var(--role-on-surface)',
        }}
      >
        {format(animated)}
        {unit ? <span style={{ fontSize: '0.35em', marginLeft: 8, opacity: 0.65 }}>{unit}</span> : null}
      </div>
      {delta ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: toneColor }}>
          <span aria-hidden="true">{arrow}</span>
          <span className="oe-tnum">{Math.abs(delta.value).toFixed(1)}%</span>
          {delta.label ? <span style={{ color: 'var(--role-on-surface-muted)' }}>{delta.label}</span> : null}
        </div>
      ) : null}
      {sparkline && sparkline.length > 1 ? <Sparkline points={sparkline} /> : null}
    </motion.div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 120;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={path} fill="none" stroke="var(--role-accent)" strokeWidth={1.5} />
    </svg>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd open-energy-platform/pages && npm run check`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add open-energy-platform/pages/src/components/signature/HeroNumeral.tsx
git commit -m "feat(pages): HeroNumeral with count-up + sparkline + delta"
```

---

## Task 7: Ticker

- [ ] **Step 1: Create Ticker.tsx**

```tsx
// Ticker — Bloomberg-style tape. Renders an array of symbol rows, flashes
// the cell on value change. Used as the Trader hero motif (5 stacked
// tickers) and elsewhere where live values matter more than chart shape.
//
// Accessibility: container is aria-live="polite" so screen readers
// announce updates without interrupting the user. Up/down direction has a
// glyph (▲/▼) in addition to color.

import React, { useEffect, useRef } from 'react';

export interface TickerRow {
  symbol: string;
  label: string;
  value: number;
  // bps or % change relevant to the symbol, signed.
  delta: number;
  // Optional: pre-formatted price string. If omitted, value is rendered
  // with 2 decimals + a 'R' currency prefix.
  display?: string;
}

export interface TickerProps {
  rows: TickerRow[];
  // Container ARIA label (e.g. "Solar live ticker").
  ariaLabel: string;
}

function fmtPrice(v: number): string {
  return `R ${v.toFixed(2)}`;
}

export function Ticker({ rows, ariaLabel }: TickerProps) {
  // Track the last value per symbol; when it changes, paint the row with
  // a temporary data-flash attribute that CSS animates for 220ms.
  const lastValues = useRef<Record<string, number>>({});
  useEffect(() => {
    rows.forEach((r) => {
      const prev = lastValues.current[r.symbol];
      if (prev !== undefined && prev !== r.value) {
        const direction = r.value > prev ? 'up' : 'down';
        const el = document.querySelector<HTMLElement>(`[data-ticker-row="${r.symbol}"]`);
        if (el) {
          el.setAttribute('data-flash', direction);
          window.setTimeout(() => el.removeAttribute('data-flash'), 240);
        }
      }
      lastValues.current[r.symbol] = r.value;
    });
  }, [rows]);
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-live="polite"
      style={{
        fontFamily: 'var(--oe-num-font)',
        fontSize: 13,
        background: 'var(--role-surface-raised)',
        border: '1px solid var(--role-border)',
        borderRadius: 'var(--oe-radius-card)',
        overflow: 'hidden',
      }}
    >
      {rows.map((r) => {
        const up = r.delta >= 0;
        return (
          <div
            key={r.symbol}
            data-ticker-row={r.symbol}
            className="oe-tnum"
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1fr auto auto',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderTop: '1px solid var(--role-border)',
            }}
          >
            <span style={{ fontWeight: 700, letterSpacing: '0.05em', color: 'var(--role-accent)' }}>
              {r.symbol}
            </span>
            <span style={{ color: 'var(--role-on-surface-muted)' }}>{r.label}</span>
            <span style={{ color: 'var(--role-on-surface)' }}>{r.display ?? fmtPrice(r.value)}</span>
            <span
              style={{
                width: 64,
                textAlign: 'right',
                color: up ? '#1f8a5b' : '#c0392b',
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">{up ? '▲' : '▼'}</span> {Math.abs(r.delta).toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd open-energy-platform/pages && npm run check
```
Expected: Exit 0.

```bash
git add open-energy-platform/pages/src/components/signature/Ticker.tsx
git commit -m "feat(pages): Ticker — Bloomberg tape with value-flash + aria-live"
```

---

## Task 8: SignatureHero

- [ ] **Step 1: Create SignatureHero.tsx**

```tsx
// SignatureHero — full-bleed top region that hosts the role's hero motif.
//
// The component itself is a structural slot — it sets the haze gradient
// background, sizes (40vh cinematic / 25vh bloomberg) and renders title +
// eyebrow + slot. The actual motif (ticker, waterfall, grid map, etc.)
// is passed as children.

import React from 'react';
import { motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export interface SignatureHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  // The role-specific motif rendered to the right (or below on mobile).
  motif?: React.ReactNode;
  // Optional primary CTA pair.
  primaryCta?: { label: string; onClick?: () => void; href?: string };
  // Density forced from caller (otherwise inherits from RoleShell via CSS).
}

export function SignatureHero({ eyebrow, title, subtitle, motif, primaryCta }: SignatureHeroProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionTransition('smooth')}
      style={{
        position: 'relative',
        minHeight: 'clamp(280px, 38vh, 480px)',
        padding: 'clamp(24px, 4vw, 64px)',
        background: 'var(--role-haze)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1fr)',
          gap: 32,
          alignItems: 'center',
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <div>
          {eyebrow ? (
            <div
              className="oe-tnum"
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--role-accent)',
                marginBottom: 16,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1
            style={{
              fontFamily: 'var(--oe-display-font)',
              fontSize: 'clamp(40px, 5vw, 64px)',
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: '-0.025em',
              margin: 0,
              color: 'var(--role-on-surface)',
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                fontSize: 'clamp(15px, 1.4vw, 18px)',
                lineHeight: 1.55,
                marginTop: 16,
                maxWidth: 560,
                color: 'var(--role-on-surface-muted)',
              }}
            >
              {subtitle}
            </p>
          ) : null}
          {primaryCta ? (
            <a
              href={primaryCta.href}
              onClick={(e) => {
                if (primaryCta.onClick) {
                  e.preventDefault();
                  primaryCta.onClick();
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 24,
                padding: '12px 20px',
                background: 'var(--role-accent)',
                color: '#0a1622',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}
            >
              {primaryCta.label} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>{motif}</div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd open-energy-platform/pages && npm run check
```
Expected: Exit 0.

```bash
git add open-energy-platform/pages/src/components/signature/SignatureHero.tsx
git commit -m "feat(pages): SignatureHero — full-bleed role-tinted hero with motif slot"
```

---

## Task 9: DensityCard, FrostedCard, KineticChart, CommandRail, AiInlineCard, StatusPulse, index

These six components are smaller — implement them together in one commit.

- [ ] **Step 1: Create DensityCard.tsx**

```tsx
// DensityCard — generic card that adapts padding/radius to density mode.
// All other cards (FrostedCard etc.) compose on top of this primitive.

import React from 'react';

export interface DensityCardProps {
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  children: React.ReactNode;
  // When set, the card highlights on hover and shows pointer cursor.
  interactive?: boolean;
}

export function DensityCard({
  as,
  className,
  style,
  onClick,
  children,
  interactive,
}: DensityCardProps) {
  const Tag = (as ?? 'div') as keyof React.JSX.IntrinsicElements;
  // @ts-expect-error - dynamic tag wrapping; React allows this.
  return (
    <Tag
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--role-surface-raised)',
        border: '1px solid var(--role-border)',
        borderRadius: 'var(--oe-radius-card)',
        padding: 'var(--oe-pad-card)',
        cursor: interactive || onClick ? 'pointer' : undefined,
        transition: 'border-color 160ms ease-out, box-shadow 160ms ease-out',
        ...style,
      }}
      onMouseEnter={
        interactive || onClick
          ? (e: React.MouseEvent<HTMLElement>) => {
              e.currentTarget.style.borderColor = 'var(--role-accent)';
              e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.10)';
            }
          : undefined
      }
      onMouseLeave={
        interactive || onClick
          ? (e: React.MouseEvent<HTMLElement>) => {
              e.currentTarget.style.borderColor = 'var(--role-border)';
              e.currentTarget.style.boxShadow = 'none';
            }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 2: Create FrostedCard.tsx**

```tsx
// FrostedCard — cinematic glass card. Layers a translucent surface over
// the role haze gradient. Only meaningful in cinematic density.

import React from 'react';

export interface FrostedCardProps {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function FrostedCard({ className, style, children }: FrostedCardProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--role-surface-raised) 70%, transparent) 0%, color-mix(in srgb, var(--role-surface-raised) 90%, transparent) 100%)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: '1px solid var(--role-border)',
        borderRadius: 'var(--oe-radius-card)',
        padding: 'var(--oe-pad-card)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create KineticChart.tsx**

```tsx
// KineticChart — Recharts wrapper that themes lines/areas/bars in the
// active role-accent color, with a spring entrance and tabular-num tooltips.
//
// This is intentionally thin — we keep using Recharts directly elsewhere
// in the SPA; KineticChart is the "branded" wrapper for signature surfaces.

import React from 'react';
import { motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export interface KineticChartProps {
  height?: number;
  children: React.ReactNode;
  // When set, displays a tabular-num caption beneath the chart (e.g. unit).
  caption?: string;
}

export function KineticChart({ height = 240, children, caption }: KineticChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('smooth')}
      style={{ width: '100%' }}
    >
      <div style={{ width: '100%', height }}>{children}</div>
      {caption ? (
        <div
          className="oe-tnum"
          style={{
            marginTop: 8,
            fontSize: 12,
            color: 'var(--role-on-surface-muted)',
            fontFamily: 'var(--oe-num-font)',
          }}
        >
          {caption}
        </div>
      ) : null}
    </motion.div>
  );
}
```

- [ ] **Step 4: Create CommandRail.tsx**

```tsx
// CommandRail — sticky hotkey-driven action rail for Bloomberg-density
// workstations. Each item shows label + shortcut hint. Used by trader,
// grid, regulator, support workstations.

import React, { useEffect } from 'react';

export interface CommandItem {
  key: string;
  label: string;
  shortcut?: string;
  onTrigger: () => void;
  tone?: 'default' | 'danger';
}

export interface CommandRailProps {
  items: CommandItem[];
  ariaLabel?: string;
}

export function CommandRail({ items, ariaLabel = 'Command rail' }: CommandRailProps) {
  // Wire up keyboard shortcuts. Format: "alt+t" or "shift+a". We listen
  // for keydown and match against item.shortcut.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const pressed: string[] = [];
      if (e.altKey) pressed.push('alt');
      if (e.shiftKey) pressed.push('shift');
      if (e.ctrlKey) pressed.push('ctrl');
      pressed.push(e.key.toLowerCase());
      const combo = pressed.join('+');
      const match = items.find((i) => i.shortcut?.toLowerCase() === combo);
      if (match) {
        e.preventDefault();
        match.onTrigger();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items]);
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'var(--role-surface-raised)',
        borderBottom: '1px solid var(--role-border)',
        fontFamily: 'var(--oe-num-font)',
        fontSize: 12,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onTrigger}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: item.tone === 'danger' ? '#e57162' : 'var(--role-on-surface)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--role-accent-soft)';
            e.currentTarget.style.borderColor = 'var(--role-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <span>{item.label}</span>
          {item.shortcut ? (
            <span
              style={{
                color: 'var(--role-on-surface-muted)',
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(0,0,0,0.08)',
              }}
            >
              {item.shortcut.toUpperCase()}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Create AiInlineCard.tsx**

```tsx
// AiInlineCard — inline AI suggestion card. Per [[feedback_ai_subtle_active]]:
// no popups, no AI tab, just inline cards with a "why" line and 1-click accept.

import React from 'react';
import { motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export interface AiInlineCardProps {
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; onClick?: () => void; href?: string };
  dismiss?: { label: string; onClick?: () => void };
}

export function AiInlineCard({ title, why, confidence, accept, dismiss }: AiInlineCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('snap')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        background: 'var(--role-accent-soft)',
        border: '1px solid var(--role-accent)',
        borderRadius: 'var(--oe-radius-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--role-accent)',
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--role-accent)',
          }}
        >
          AI suggestion
          {typeof confidence === 'number' ? (
            <span style={{ marginLeft: 8, opacity: 0.7 }}>{Math.round(confidence * 100)}%</span>
          ) : null}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--role-on-surface)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--role-on-surface-muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--role-on-surface)', fontWeight: 600 }}>Why: </strong>
        {why}
      </div>
      {accept || dismiss ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {accept ? (
            <a
              href={accept.href}
              onClick={(e) => {
                if (accept.onClick) {
                  e.preventDefault();
                  accept.onClick();
                }
              }}
              style={{
                padding: '8px 14px',
                background: 'var(--role-accent)',
                color: '#0a1622',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {accept.label}
            </a>
          ) : null}
          {dismiss ? (
            <button
              onClick={dismiss.onClick}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: 'var(--role-on-surface-muted)',
                border: '1px solid var(--role-border)',
                borderRadius: 999,
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {dismiss.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
```

- [ ] **Step 6: Create StatusPulse.tsx**

```tsx
// StatusPulse — animated dot indicating live/active state. Steady fill
// under prefers-reduced-motion (handled by signature.css).

import React from 'react';

export interface StatusPulseProps {
  tone?: 'live' | 'warn' | 'critical' | 'idle';
  label?: string;
}

export function StatusPulse({ tone = 'live', label }: StatusPulseProps) {
  const color =
    tone === 'critical' ? '#c0392b' : tone === 'warn' ? '#c97a14' : tone === 'idle' ? '#6b7685' : '#1f8a5b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        className="oe-pulse"
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          color, /* drives the ::after pulse */
        }}
      />
      {label ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--role-on-surface-muted)',
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 7: Create index.ts barrel**

```ts
export { RoleShell } from './RoleShell';
export type { RoleShellProps } from './RoleShell';
export { HeroNumeral } from './HeroNumeral';
export type { HeroNumeralProps } from './HeroNumeral';
export { Ticker } from './Ticker';
export type { TickerProps, TickerRow } from './Ticker';
export { SignatureHero } from './SignatureHero';
export type { SignatureHeroProps } from './SignatureHero';
export { DensityCard } from './DensityCard';
export type { DensityCardProps } from './DensityCard';
export { FrostedCard } from './FrostedCard';
export type { FrostedCardProps } from './FrostedCard';
export { KineticChart } from './KineticChart';
export type { KineticChartProps } from './KineticChart';
export { CommandRail } from './CommandRail';
export type { CommandRailProps, CommandItem } from './CommandRail';
export { AiInlineCard } from './AiInlineCard';
export type { AiInlineCardProps } from './AiInlineCard';
export { StatusPulse } from './StatusPulse';
export type { StatusPulseProps } from './StatusPulse';
```

- [ ] **Step 8: Type-check + commit**

```bash
cd open-energy-platform/pages && npm run check
```
Expected: Exit 0.

```bash
git add open-energy-platform/pages/src/components/signature/
git commit -m "feat(pages): six more signature primitives + barrel"
```

---

## Task 10: Dev preview route

- [ ] **Step 1: Create the preview page**

Create `pages/src/pages/__dev/SignaturePreview.tsx`. This renders one example of every signature component across two roles (trader + lender) so you can eyeball the system end-to-end.

```tsx
// Dev-only preview of the signature design system. Reachable at
// /dev/signature when the SPA is in dev mode. Not part of any role nav.

import React, { useEffect, useState } from 'react';
import {
  RoleShell,
  HeroNumeral,
  Ticker,
  SignatureHero,
  DensityCard,
  FrostedCard,
  KineticChart,
  CommandRail,
  AiInlineCard,
  StatusPulse,
} from '../../components/signature';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { roleThemes, type RoleKey } from '../../lib/role-themes';

const tickerSeed = [
  { symbol: 'SOL', label: 'Solar PV (day-ahead)', value: 712.4, delta: 1.8 },
  { symbol: 'WND', label: 'Wind (day-ahead)', value: 894.2, delta: -2.1 },
  { symbol: 'HYB', label: 'Hybrid (intra-day)', value: 1042.8, delta: 0.6 },
  { symbol: 'STO', label: 'Storage', value: 521.0, delta: 3.4 },
  { symbol: 'THR', label: 'Thermal', value: 1480.2, delta: -0.4 },
];

const chartSeed = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  v: 80 + 30 * Math.sin(i / 3) + (i % 5) * 4,
}));

export default function SignaturePreview() {
  const [role, setRole] = useState<RoleKey>('trader');
  const [rows, setRows] = useState(tickerSeed);
  // Make the ticker actually live so flashes are visible during the
  // preview demo.
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => {
          const jitter = (Math.random() - 0.5) * 2.4;
          return { ...r, value: Math.max(10, r.value + jitter), delta: jitter };
        }),
      );
    }, 1400);
    return () => clearInterval(id);
  }, []);
  const theme = roleThemes[role];
  return (
    <RoleShell role={role} density="cinematic">
      <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Role
        </span>
        {(Object.keys(roleThemes) as RoleKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setRole(k)}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid var(--role-border)',
              background: k === role ? 'var(--role-accent)' : 'transparent',
              color: k === role ? '#0a1622' : 'var(--role-on-surface)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {roleThemes[k].label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          <StatusPulse tone="live" label="preview live" />
        </span>
      </div>
      <SignatureHero
        eyebrow={theme.label}
        title={`$100M experience preview — ${theme.label}`}
        subtitle="Every signature primitive on one page, switchable across all 10 roles. Use the buttons above to scrub through the system."
        motif={<Ticker rows={rows} ariaLabel={`${theme.label} live ticker`} />}
        primaryCta={{ label: 'See the spec', href: '#' }}
      />
      <section
        style={{
          padding: 32,
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <FrostedCard>
          <HeroNumeral
            eyebrow="MTD P&L"
            value={14_200_000}
            format={(v) => `R ${(v / 1_000_000).toFixed(1)}M`}
            delta={{ value: 3.1, tone: 'good', label: 'vs target' }}
            sparkline={chartSeed.map((c) => c.v)}
          />
        </FrostedCard>
        <FrostedCard>
          <HeroNumeral
            eyebrow="Open orders"
            value={284}
            delta={{ value: -1.2, tone: 'neutral', label: 'last 1h' }}
          />
        </FrostedCard>
        <FrostedCard>
          <HeroNumeral
            eyebrow="Margin utilisation"
            value={61.4}
            format={(v) => `${v.toFixed(1)}%`}
            delta={{ value: 2.0, tone: 'bad', label: 'rising' }}
          />
        </FrostedCard>
        <DensityCard interactive>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>DensityCard</div>
          <div style={{ fontSize: 13, color: 'var(--role-on-surface-muted)' }}>
            Adapts padding + radius to current density. Hover for accent border.
          </div>
        </DensityCard>
      </section>
      <section style={{ padding: 32, maxWidth: 1440, margin: '0 auto' }}>
        <FrostedCard>
          <KineticChart caption="hourly generation · MWh" height={220}>
            <ResponsiveContainer>
              <LineChart data={chartSeed} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <XAxis dataKey="hour" stroke="var(--role-on-surface-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--role-on-surface-muted)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontFamily: 'var(--oe-num-font)' }} />
                <Line type="monotone" dataKey="v" stroke="var(--role-accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </KineticChart>
        </FrostedCard>
      </section>
      <CommandRail
        items={[
          { key: 'new', label: 'New order', shortcut: 'alt+n', onTrigger: () => alert('new') },
          { key: 'cancel', label: 'Cancel selected', shortcut: 'alt+c', onTrigger: () => alert('cancel'), tone: 'danger' },
          { key: 'mark', label: 'Refresh marks', shortcut: 'alt+m', onTrigger: () => alert('mark') },
        ]}
      />
      <section style={{ padding: 32, maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 16 }}>
        <AiInlineCard
          title="Reduce SOL exposure by 12% before close"
          why="Your solar concentration is 4.2% above the 30-day average and weather forecast shows cloud cover increasing tomorrow morning."
          confidence={0.84}
          accept={{ label: 'Stage trim order', onClick: () => alert('staged') }}
          dismiss={{ label: 'Not now', onClick: () => alert('dismissed') }}
        />
      </section>
    </RoleShell>
  );
}
```

- [ ] **Step 2: Wire it into App.tsx**

Open `pages/src/App.tsx`. Find the `<Routes>` block. Add a guarded route — only mounts in dev:

```tsx
{import.meta.env.DEV && (
  <Route
    path="/dev/signature"
    element={
      <React.Suspense fallback={null}>
        {React.createElement(React.lazy(() => import('./pages/__dev/SignaturePreview')))}
      </React.Suspense>
    }
  />
)}
```

Place it adjacent to other `<Route>` elements, inside the `<Routes>`. Adjust import if `React.Suspense` / `React.lazy` patterns elsewhere in App.tsx differ.

- [ ] **Step 3: Run dev server + verify**

Run: `cd open-energy-platform/pages && npm run dev`
Then in a browser, open `http://localhost:3000/dev/signature`.
Expected: A page rendering with the trader theme by default. Ticker values flash up/down every ~1.4s. Role buttons at the top switch themes — colors, fonts, haze all change smoothly. AiInlineCard renders in the role accent. KineticChart line draws in the accent color.

- [ ] **Step 4: Build to confirm production bundle compiles**

Run: `cd open-energy-platform/pages && npm run build`
Expected: Exit 0. The dev route is tree-shaken from prod build because of the `import.meta.env.DEV` guard.

- [ ] **Step 5: Commit**

```bash
git add open-energy-platform/pages/src/pages/__dev/SignaturePreview.tsx \
        open-energy-platform/pages/src/App.tsx
git commit -m "chore(pages): dev-only /dev/signature preview for design-system QA"
```

---

## Task 11: Acceptance + handoff

- [ ] **Step 1: Re-run all type checks**

```bash
cd open-energy-platform && npm run check
cd open-energy-platform/pages && npm run check
```
Expected: Both exit 0.

- [ ] **Step 2: Re-run the unit suite to confirm Batch 0 didn't break anything**

```bash
cd open-energy-platform && npm test -- --run
```
Expected: All 474 tests pass.

- [ ] **Step 3: Save memory note about the foundation landing**

Create `/Users/reshigan/.claude/projects/-Users-reshigan-Openenergy/memory/project_100m_experience.md` with the design-spec + plan references. Update `MEMORY.md` index.

- [ ] **Step 4: Final commit if any straggler changes**

```bash
git status
# If anything outstanding from acceptance work:
git add -A
git commit -m "chore(pages): batch-0 foundation acceptance polish"
```

---

## Self-review

Spec coverage: all of §3 (foundation tokens, motion, type, density, role tokens, signature components) ✓. Batch 0 from §5 ✓. Constraints from §6 (reduced motion, tabular nums, AA-grade accents, font lazy load) ✓.

Placeholders: none. Every step has the file's code.

Type consistency: `RoleKey`, `Density`, `Chrome` defined in role-themes.ts; all components import from there. Tabs/spaces consistent. Function `themeFor` defined once and used by `RoleShell`.

Out of scope, deferred to Batch 1+: Trader/Lender per-role launch board re-skin. Waterfall + grid-map + heatmap motifs.
