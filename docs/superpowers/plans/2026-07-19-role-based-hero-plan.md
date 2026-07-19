# Role-based hero + role-based menu (v2 frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every v2 surface (Home, Transaction, Find, Trade) shows a role-based hero — role name, one-line blurb, and a role-scoped domain menu — collapsible to a single compact row, wired once into `Shell.tsx` so it appears everywhere automatically.

**Architecture:** One new component, `HeroBar.tsx`, rendered inside `Shell` between the topbar and `<main>`. All of its decision logic (which blurb, default collapsed/expanded state, localStorage key) is extracted into three new pure functions in `decl.ts`, following the codebase's established convention (`decl.ts` holds every unit-testable piece of v2 logic; JSX components are not unit-tested — see Global Constraints). The role-scoped menu reuses `groupedStarts()` from `starts.ts` unchanged — no new data model.

**Tech Stack:** React 19 + TypeScript, react-router-dom (`useLocation`/`useNavigate`), vitest (node environment), no new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-role-based-hero-design.md` — every requirement below traces to it.
- **Test-environment fact (overrides the spec's literal Testing section):** the repo's only vitest config is `open-energy-platform/vitest.config.ts`, which sets `environment: 'node'` and includes only `pages/src/**/*.test.tsx` (note the `.tsx` extension requirement — a `.test.ts` file under `pages/src` is silently NOT picked up). There is no jsdom, no `@testing-library/react`, in the `pages` workspace (`pages/package.json` has no `test` script and no such devDependency). Nothing in `pages/src/**` renders a component in a test today — the one precedent, `pages/src/meridian/StreamInsight.test.tsx`, imports and calls two exported pure functions, nothing else. This plan follows that precedent: HeroBar's logic is tested as pure functions in `decl.test.tsx`; `HeroBar.tsx` itself has no test file, matching every other v2 surface component.
- No new npm dependencies.
- No new backend endpoint or fetch — `chains` is already loaded once in `Shell` via `getChains()`.
- Blurb copy, per JWT role, is exactly the 10 lines in the spec's table — copy them verbatim, do not paraphrase.
- Out of scope (do not touch): `Home.tsx`'s empty-queue `.v2-hero`/`.v2-journeys` block; any data in `roleData.ts`; any sidebar or layout restructuring beyond the one new row in `Shell`.

---

### Task 1: Pure hero-logic helpers in `decl.ts`

**Files:**
- Modify: `open-energy-platform/pages/src/v2/decl.ts` (append at end, after `tsToSAST`, line 361)
- Test: `open-energy-platform/pages/src/v2/decl.test.tsx` (NEW — must be `.test.tsx`, not `.test.ts`, or vitest's include glob silently skips it)

**Interfaces:**
- Consumes: nothing new (uses only string/boolean primitives).
- Produces:
  - `heroBlurb(role: string): string | undefined`
  - `heroStorageKey(role: string): string`
  - `heroDefaultCollapsed(pathname: string): boolean`
  - These three are consumed by `HeroBar.tsx` in Task 2.

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/pages/src/v2/decl.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { heroBlurb, heroStorageKey, heroDefaultCollapsed } from './decl';

describe('heroBlurb', () => {
  it('returns the exact copy for a documented role', () => {
    expect(heroBlurb('trader')).toBe('Order book, positions, and margin at a glance.');
  });
  it('returns undefined for a role with no entry', () => {
    expect(heroBlurb('nonexistent_role')).toBeUndefined();
  });
});

describe('heroStorageKey', () => {
  it('namespaces the key by role', () => {
    expect(heroStorageKey('trader')).toBe('heroCollapsed:trader');
    expect(heroStorageKey('admin')).toBe('heroCollapsed:admin');
  });
});

describe('heroDefaultCollapsed', () => {
  it('is true for a Transaction path', () => {
    expect(heroDefaultCollapsed('/v2/t/abc-123')).toBe(true);
  });
  it('is false for Home, Find, and Trade paths', () => {
    expect(heroDefaultCollapsed('/v2')).toBe(false);
    expect(heroDefaultCollapsed('/v2/find')).toBe(false);
    expect(heroDefaultCollapsed('/v2/trade')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `open-energy-platform/`): `npx vitest run pages/src/v2/decl.test.tsx`
Expected: FAIL — `heroBlurb`, `heroStorageKey`, `heroDefaultCollapsed` are not exported from `./decl`.

- [ ] **Step 3: Write minimal implementation**

Append to `open-energy-platform/pages/src/v2/decl.ts`, after the `tsToSAST` function (end of file):

```ts
// ── HeroBar — role display copy + collapse-state decisions ──────────────────
// Keyed by raw JWT role (admin/trader/ipp/wind/offtaker/lender/carbon/regulator/
// grid/support) — HeroBar shows blurb before any roleAlias() bridging, same as
// the account-menu role chip in Shell.
const HERO_BLURB: Record<string, string> = {
  admin: 'Platform oversight — users, tenants, configuration, and system health.',
  trader: 'Order book, positions, and margin at a glance.',
  ipp: 'Project delivery — schedule, cost, documents, and compliance.',
  wind: 'Wind asset delivery — schedule, cost, documents, and compliance.',
  offtaker: 'Contracts, delivery, and settlement across your PPAs.',
  lender: 'Drawdowns, covenants, and portfolio risk across financed assets.',
  carbon: 'Carbon credits, verification, and registry retirements.',
  regulator: 'Compliance filings, licence obligations, and market oversight.',
  grid: 'Grid connections, outages, and network compliance.',
  support: 'Tickets, escalations, and platform assistance.',
};
export function heroBlurb(role: string): string | undefined {
  return HERO_BLURB[role];
}

export function heroStorageKey(role: string): string {
  return `heroCollapsed:${role}`;
}

// Transaction (/v2/t/:id) always starts compact — a high-frequency page a
// high-volume user opens repeatedly; every other surface starts full.
export function heroDefaultCollapsed(pathname: string): boolean {
  return pathname.startsWith('/v2/t/');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run pages/src/v2/decl.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add open-energy-platform/pages/src/v2/decl.ts open-energy-platform/pages/src/v2/decl.test.tsx
git commit -m "feat(v2): add pure hero-logic helpers (blurb, storage key, default-collapsed)"
```

---

### Task 2: `HeroBar.tsx` component

**Files:**
- Create: `open-energy-platform/pages/src/v2/HeroBar.tsx`

**Interfaces:**
- Consumes:
  - `heroBlurb`, `heroStorageKey`, `heroDefaultCollapsed`, `type ChainMap` — from `./decl` (Task 1)
  - `roleAlias`, `groupedStarts`, `type JourneyDomain` — from `./starts` (existing, unchanged)
  - `getRoleConfig` — from `../ux-alternatives/launchpad-nav/roleData` (existing, unchanged)
  - `useLocation`, `useNavigate` — from `react-router-dom`
- Produces: `export function HeroBar({ role, chains }: { role: string; chains: ChainMap }): JSX.Element` — consumed by `Shell.tsx` in Task 3.
- No test file for this task — see Global Constraints (JSX components are unverified by vitest in this repo; verification is `npm run check:pages` plus a manual dev-server check in Task 3's last step).

- [ ] **Step 1: Write the component**

Create `open-energy-platform/pages/src/v2/HeroBar.tsx`:

```tsx
// ═══════════════════════════════════════════════════════════════════════════
// HeroBar — the role-based hero + role-based menu shown on every v2 surface.
// Rendered once by Shell, between the topbar and <main>. Full state shows role
// name + blurb + domain menu; Compact drops the blurb to a single-line role
// chip. Transaction always starts Compact (high-frequency page); everywhere
// else starts Full unless the user collapsed it before (per-role localStorage).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { heroBlurb, heroStorageKey, heroDefaultCollapsed, type ChainMap } from './decl';
import { roleAlias, groupedStarts, type JourneyDomain } from './starts';

export function HeroBar({ role, chains }: { role: string; chains: ChainMap }) {
  const loc = useLocation();
  const nav = useNavigate();

  const readCollapsed = () => {
    if (heroDefaultCollapsed(loc.pathname)) return true;
    return localStorage.getItem(heroStorageKey(role)) === '1';
  };
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Re-derive on role or route change — a different JWT role has its own
  // stored preference, and entering/leaving Transaction flips the default.
  useEffect(() => { setCollapsed(readCollapsed()); }, [role, loc.pathname]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(heroStorageKey(role), next ? '1' : '0');
  };

  const label = getRoleConfig(roleAlias(role))?.label ?? role;
  const blurb = heroBlurb(role);
  const domains = groupedStarts(chains, role);
  const loading = Object.keys(chains).length === 0;

  return (
    <div className={`v2-herobar${collapsed ? ' compact' : ''}`}>
      {collapsed ? (
        <span className="v2-role-chip">{label}</span>
      ) : (
        <div className="v2-herobar-id">
          <span className="v2-herobar-name">{label}</span>
          {blurb && <p className="v2-herobar-blurb">{blurb}</p>}
        </div>
      )}
      <div className="v2-spacer" />
      {(loading || domains.length > 0) && (
        <DomainMenu domains={domains} loading={loading} onNavigate={(to) => nav(to)} />
      )}
      <button
        className="v2-btn v2-btn-ghost v2-herobar-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand role summary' : 'Collapse role summary'}
        onClick={toggle}
      >
        {collapsed ? '⌄' : '⌃'}
      </button>
    </div>
  );
}

// ── the domain dropdown: the "role-based menu" ───────────────────────────────
function DomainMenu({
  domains, loading, onNavigate,
}: { domains: JourneyDomain[]; loading: boolean; onNavigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="v2-herobar-menu">
      <button
        className="v2-btn v2-btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Menu
      </button>
      {open && (
        <>
          <div className="v2-menu-scrim" onClick={() => setOpen(false)} />
          <div className="v2-menu v2-hero-dropdown" role="menu">
            {loading && <div className="v2-hero-domain-loading">Loading…</div>}
            {domains.map((d) => (
              <div key={d.key} className="v2-hero-domain">
                <button
                  role="menuitem"
                  className="v2-hero-domain-hd"
                  aria-expanded={expanded === d.key}
                  onClick={() => setExpanded((cur) => (cur === d.key ? null : d.key))}
                >
                  <span className="dot" style={{ ['--dc' as any]: d.color }} />
                  <span className="grow">{d.label}</span>
                  <span className="n">{d.starts.length}</span>
                </button>
                {expanded === d.key && (
                  <div className="v2-hero-domain-body">
                    {d.starts.map((s) => (
                      <button
                        key={`${s.chainKey}:${s.edge.id}`}
                        role="menuitem"
                        onClick={() => { onNavigate(`/v2/find?start=${s.chainKey}:${s.edge.id}`); setOpen(false); }}
                      >
                        <span className="start">＋</span> {s.label}
                      </button>
                    ))}
                    {d.links.map((l) => (
                      <button
                        key={l.key}
                        role="menuitem"
                        onClick={() => { onNavigate(l.to); setOpen(false); }}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `open-energy-platform/pages/`): `npm run check`
Expected: no new errors from `HeroBar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add open-energy-platform/pages/src/v2/HeroBar.tsx
git commit -m "feat(v2): add HeroBar component (role hero + role-scoped domain menu)"
```

---

### Task 3: Wire `HeroBar` into `Shell.tsx` + styles

**Files:**
- Modify: `open-energy-platform/pages/src/v2/Shell.tsx:97-98`
- Modify: `open-energy-platform/pages/src/v2/tokens.css` (append new rules near the existing `.v2-role-chip`/`.v2-menu` block, after line 137, and near `.v2-hero` at line 344-346)

**Interfaces:**
- Consumes: `HeroBar` from `./HeroBar` (Task 2); `role` and `chains`, both already in scope in `Shell` (`Shell.tsx:49`, `Shell.tsx:34`).
- Produces: nothing new — this is the final integration point.

- [ ] **Step 1: Import and render `HeroBar` in `Shell.tsx`**

Add the import alongside the existing `./decl` and `./starts` imports (`Shell.tsx:19-20`):

```tsx
import { tsToSAST, type ChainMap, type TxnRow } from './decl';
import { roleStarts, hasTrade, type JourneyStart } from './starts';
import { HeroBar } from './HeroBar';
```

Replace `Shell.tsx:97-98`:

```tsx
      </header>
      <main className="v2-main">{children}</main>
```

with:

```tsx
      </header>
      <HeroBar role={role} chains={chains} />
      <main className="v2-main">{children}</main>
```

- [ ] **Step 2: Add HeroBar styles to `tokens.css`**

Append after the `.v2-menu-sep` rule block (after `tokens.css:137`, before `.v2-main`):

```css
/* ── HeroBar: role hero + role-scoped domain menu ──────────────────────── */
.v2-herobar {
  display: flex; align-items: center; gap: var(--sp-4);
  max-width: 1240px; margin: 0 auto; padding: var(--sp-4) var(--sp-6) 0;
}
.v2-herobar.compact { padding-top: var(--sp-2); }
.v2-herobar-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.v2-herobar-name { font-size: var(--t-15); font-weight: 600; color: var(--ink); letter-spacing: -0.005em; }
.v2-herobar-blurb { font-size: var(--t-13); color: var(--ink-2); max-width: 62ch; }
.v2-herobar-toggle { padding: 4px 8px; line-height: 1; }
.v2-herobar-menu { position: relative; }
.v2-hero-dropdown { min-width: 280px; max-height: 70vh; overflow-y: auto; }
.v2-hero-domain-hd {
  display: flex; align-items: center; gap: var(--sp-2); width: 100%;
}
.v2-hero-domain-hd .dot { width: 8px; height: 8px; border-radius: 2px; background: var(--dc, var(--accent)); flex: none; }
.v2-hero-domain-hd .n { font-size: var(--t-11); color: var(--ink-2); font-family: var(--font-mono); }
.v2-hero-domain-body { display: flex; flex-direction: column; padding-left: var(--sp-4); }
.v2-hero-domain-loading { font-size: var(--t-13); color: var(--ink-2); padding: 8px 10px; }
```

- [ ] **Step 3: Typecheck**

Run (from `open-energy-platform/pages/`): `npm run check`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run (from `open-energy-platform/`): `npm run dev` (Worker on :8787), and in a second terminal `cd pages && npm run dev` (SPA on :3000). Log in as any demo persona (e.g. `trader@openenergy.co.za` / `Demo@2024!`) and confirm:
- Home, Find, Trade show the Full hero (role name + blurb + Menu button) below the topbar.
- Opening any transaction (`/v2/t/:id`) shows the Compact row (role chip + Menu button only, no blurb).
- The chevron toggles Full ⇄ Compact; reloading the page keeps the last-chosen state for that role.
- Clicking "Menu" opens the domain popover; clicking a domain expands its starts/links; clicking a start/link navigates and closes the popover.

Stop the dev servers once verified.

- [ ] **Step 5: Commit**

```bash
git add open-energy-platform/pages/src/v2/Shell.tsx open-energy-platform/pages/src/v2/tokens.css
git commit -m "feat(v2): wire HeroBar into Shell so every v2 surface gets it"
```

---

### Task 4: Full-suite regression check

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend + pages unit suite**

Run (from `open-energy-platform/`): `npm test`
Expected: PASS, including the 7 new `decl.test.tsx` hero tests, with no regressions elsewhere.

- [ ] **Step 2: Run the pages typecheck**

Run (from `open-energy-platform/pages/`): `npm run check`
Expected: PASS.

- [ ] **Step 3: Confirm nothing outside scope changed**

Run (from repo root): `git diff --stat main...HEAD -- open-energy-platform/pages/src/v2/`
Expected: only `decl.ts`, `decl.test.tsx`, `HeroBar.tsx`, `Shell.tsx`, `tokens.css` listed — `Home.tsx`, `Transaction.tsx`, `Find.tsx`, `Trade.tsx`, and `roleData.ts` untouched, per the spec's Out of scope section.

No commit for this task — it is a verification gate, not a change.

---

## Self-Review

**Spec coverage:**
- Component & placement (new `HeroBar.tsx`, rendered in `Shell` between topbar and `<main>`) → Task 2 + Task 3 Step 1.
- Role display name (`getRoleConfig(roleAlias(role))?.label ?? role`) → `HeroBar.tsx`, `label` line.
- Blurb table (10 roles, verbatim copy, undefined fallback) → Task 1 `HERO_BLURB` + tests.
- Domain dropdown reusing `groupedStarts` → `HeroBar.tsx`'s `DomainMenu`.
- Full vs Compact states, chevron toggle, per-role localStorage persistence, Transaction always-Compact → `heroDefaultCollapsed`/`heroStorageKey` (Task 1) + `HeroBar`'s `collapsed` state (Task 2).
- Edge cases (chains still loading → "Loading…"; zero domains → menu hidden; role not in blurb map → blurb omitted) → `HeroBar.tsx`'s `loading` check, the `(loading || domains.length > 0)` guard, and `blurb &&` guard.
- Testing intent (toggle persistence, dropdown content correctness, defensive fallback, Transaction-always-Compact) → re-expressed as pure-function tests in Task 1 against the actual `environment: 'node'` vitest setup, since component-render tests are not executable in this repo (see Global Constraints).
- Out of scope (Home's `.v2-journeys`, `roleData.ts` data, sidebar/layout restructuring) → untouched by every task; verified explicitly in Task 4 Step 3.

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code.

**Type consistency:** `HeroBar({ role, chains }: { role: string; chains: ChainMap })` in Task 2 matches the call site `<HeroBar role={role} chains={chains} />` added in Task 3 — `role` and `chains` are the exact same-named variables already in scope in `Shell.tsx` (`role` at line 49, `chains` at line 34). `heroBlurb`/`heroStorageKey`/`heroDefaultCollapsed` signatures in Task 1 match their call sites in Task 2 exactly. `JourneyDomain` imported from `./starts` in Task 2 matches the type `groupedStarts` already returns (defined in `starts.ts:145-151`).
