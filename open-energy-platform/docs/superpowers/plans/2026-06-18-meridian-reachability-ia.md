# Meridian Reachability & IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Atlas/Horizon tile honestly resolve or hide — convert tile-target resolution from a truthiness guess into a single tested predicate, surface single-chain Horizon lanes as clickable links, distinguish Ledger load failures (403/404/network), gate superuser quicklinks by role, and add a CI ratchet that can only shrink the set of unreachable tiles.

**Architecture:** One pure SPA module (`reachability.ts`) owns tile→target resolution and is consumed by both `AtlasPage` and `CommandPalette`, eliminating two divergent inline copies. Pure helpers (`singleChainOf`, `classifyLoadError`, `quicklinkVisible`) live beside the surfaces they serve and are unit-tested by the backend vitest runner (the only CI hard-gate; the SPA has no test runner). A backend ratchet test imports the real `MERIDIAN_CHAINS` array + `roleData` and reads `surfaces.tsx`/`App.tsx` as text to classify every tile, asserting the broken set never grows beyond a committed quarantine file.

**Tech Stack:** React + TypeScript SPA (`pages/`), Hono Worker backend (`src/`), vitest (node env, `globals: false`, `include: tests/**/*.test.ts`), axios for SPA data fetch.

---

## Baseline (verified 2026-06-18 — authoritative, supersedes the parent design doc's inline figures)

Measured by importing `MERIDIAN_CHAINS` + `ROLES` directly (not regex):

- **207** chains in `MERIDIAN_CHAINS` (a `ChainDescriptor[]`; chain key = `descriptor.key`). NOT 168.
- **392** Atlas tiles · **352 reachable (89.8%)** · **0 dangling** (every tile `chainKey ∈` the 207) · **0 route-dead** · **40 dead** (no `chainKey`, no `route`, no `SURFACE_REGISTRY` entry — already silently hidden by `isReachable`, never 404).
- The earlier "168 chains / 44 dangling / 78.6% / ~39 dangling false-positives that 404 on click" baseline was a measurement artifact of an undercounted key set. There is **no live dangling-404 bug**. Keys the parent doc flagged as 404-ing (`ipp_schedule`, `ipp_evm`, `dfr`, `ipp_mir`) all resolve to real descriptors.

**Consequences for this plan:**
- **NO roleData repoints.** The 11 "high-confidence repoints" (dfr→…, ipp_submittal→…, etc.) are wrong — those tiles already resolve to real chains. Repointing would break correctly-resolving tiles.
- The U2 reachability hardening is therefore **defense-in-depth + honest hide of the 40 dead**, not a 404 fix. Its lasting value is the CI ratchet: future `chainKey` typos / unmounted routes / missing surfaces get caught at build time instead of shipping as silent dead tiles.
- The 40 dead are all **surface-class** (need an L4 surface component built — tracked by follow-on plans). They are quarantined in a committed `known-unreachable.json` that the ratchet enforces shrink-only.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `pages/src/meridian/reachability.ts` | Pure tile→target resolution; `surfaceRole`, `Tile`, `tileTarget`, `isTileReachable`. No registry import (keeps it out of the browser bundle). | Create |
| `pages/src/meridian/lib.ts` | Add pure `singleChainOf`, `LoadErrorKind`, `classifyLoadError` beside existing fetch helpers. | Modify |
| `pages/src/meridian/AtlasPage.tsx` | Consume `reachability.ts` instead of inline `isReachable`/`to`. | Modify |
| `pages/src/meridian/CommandPalette.tsx` | Consume `reachability.ts` instead of inline `surfaceFor`/`targetFor`. | Modify |
| `pages/src/meridian/HorizonPage.tsx` | Single-chain lane label → `<Link>`; chevron becomes its own toggle button. | Modify |
| `pages/src/meridian/LedgerPage.tsx` | Distinguish forbidden/notfound/network/unknown load errors. | Modify |
| `pages/src/meridian/MeridianHeader.tsx` | Gate `Intelligence`/`National` quicklinks by role via `quicklinkVisible`. | Modify |
| `pages/src/meridian/meridian.css` | `.lane-label-split` / `.lane-chev-btn` / `.lane-label-link`; small `.mer-error button` rule. | Modify |
| `tests/meridian-reachability.test.ts` | Unit-test the pure helpers with stub predicates (no JSX). | Create |
| `tests/meridian-reachability-ratchet.test.ts` | Build-time ratchet over all tiles; asserts broken set == quarantine. | Create |
| `tests/meridian-known-unreachable.json` | Committed quarantine of the 40 dead tiles (self-seeded). | Create (via SEED run) |
| `docs/superpowers/specs/2026-06-17-meridian-frontend-coverage-onboarding-design.md` | Correct the stale 168/dangling baseline figures. | Modify |

**Helper contracts (names are stable across all tasks — do not rename):**

```ts
// reachability.ts
export const surfaceRole: (r: string) => string;
export type Tile = { key: string; chainKey?: string; route?: string };
export function tileTarget(role: string, f: Tile, hasSurface: (k: string) => boolean): string | null;
export function isTileReachable(role: string, f: Tile, hasSurface: (k: string) => boolean): boolean;

// lib.ts
export function singleChainOf(cases: { chain: string }[]): string | null;
export type LoadErrorKind = 'forbidden' | 'notfound' | 'network' | 'unknown';
export function classifyLoadError(e: unknown): LoadErrorKind;

// MeridianHeader.tsx
export function quicklinkVisible(role: string, to: string): boolean;
```

---

## Task 1: Branch off `meridian-redesign`

**Files:** none (git only)

- [ ] **Step 1: Create and switch to the feature branch**

Run:
```bash
cd /Users/reshigan/Openenergy
git checkout meridian-redesign
git checkout -b meridian-reachability
git rev-parse --abbrev-ref HEAD
```
Expected: prints `meridian-reachability`.

---

## Task 2: Pure reachability module + unit tests

**Files:**
- Create: `open-energy-platform/pages/src/meridian/reachability.ts`
- Test: `open-energy-platform/tests/meridian-reachability.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/meridian-reachability.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { surfaceRole, tileTarget, isTileReachable } from '../pages/src/meridian/reachability';

// hasSurface stub: only this one composite key exists.
const hasSurface = (k: string) => k === 'esco:sites-portfolio';

describe('surfaceRole', () => {
  it('maps esums_owner to esco, leaves others unchanged', () => {
    expect(surfaceRole('esums_owner')).toBe('esco');
    expect(surfaceRole('trader')).toBe('trader');
  });
});

describe('tileTarget', () => {
  it('prefers chainKey -> ledger', () => {
    expect(tileTarget('trader', { key: 'x', chainKey: 'covenant_certificate' }, hasSurface))
      .toBe('/ledger/covenant_certificate');
  });
  it('falls back to route', () => {
    expect(tileTarget('trader', { key: 'x', route: '/reports' }, hasSurface)).toBe('/reports');
  });
  it('falls back to surface when registered (role-mapped)', () => {
    expect(tileTarget('esums_owner', { key: 'sites-portfolio' }, hasSurface))
      .toBe('/surface/sites-portfolio');
  });
  it('returns null when nothing resolves', () => {
    expect(tileTarget('trader', { key: 'ghost' }, hasSurface)).toBeNull();
  });
});

describe('isTileReachable', () => {
  it('true when a target resolves, false otherwise', () => {
    expect(isTileReachable('trader', { key: 'x', route: '/reports' }, hasSurface)).toBe(true);
    expect(isTileReachable('trader', { key: 'ghost' }, hasSurface)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: FAIL — cannot resolve `../pages/src/meridian/reachability`.

- [ ] **Step 3: Write the module**

Create `open-energy-platform/pages/src/meridian/reachability.ts`:
```ts
// Pure tile -> route resolution shared by AtlasPage and CommandPalette.
// No SURFACE_REGISTRY import here — callers inject `hasSurface` so this
// module stays out of the browser bundle's registry dependency.

export const surfaceRole = (r: string): string => (r === 'esums_owner' ? 'esco' : r);

export type Tile = { key: string; chainKey?: string; route?: string };

export function tileTarget(
  role: string,
  f: Tile,
  hasSurface: (k: string) => boolean,
): string | null {
  if (f.chainKey) return `/ledger/${f.chainKey}`;
  if (f.route) return f.route;
  return hasSurface(`${surfaceRole(role)}:${f.key}`) ? `/surface/${f.key}` : null;
}

export function isTileReachable(
  role: string,
  f: Tile,
  hasSurface: (k: string) => boolean,
): boolean {
  return tileTarget(role, f, hasSurface) !== null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/reachability.ts open-energy-platform/tests/meridian-reachability.test.ts
git commit -m "feat(meridian): pure tile-reachability module + unit tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Wire AtlasPage to the reachability module

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/AtlasPage.tsx`

- [ ] **Step 1: Read the current change sites**

Run: `cd open-energy-platform && sed -n '10,20p;54,96p' pages/src/meridian/AtlasPage.tsx`
Confirm: `import { SURFACE_REGISTRY } from './surfaces';` (~:12), local `const surfaceRole` (~:18), `const isReachable = (f...) => !!(f.chainKey || f.route || SURFACE_REGISTRY[...])` (~:56), `const reachable = d.features.filter(isReachable);` (~:84), and the `const to = f.chainKey ? ... ` target computation (~:94).

- [ ] **Step 2: Add the import**

After the existing `import { SURFACE_REGISTRY } from './surfaces';` line, add:
```ts
import { isTileReachable, tileTarget } from './reachability';
```

- [ ] **Step 3: Replace the local `surfaceRole` + `isReachable` with injected calls**

Delete the local `const surfaceRole = (r: string) => (r === 'esums_owner' ? 'esco' : r);` line (now provided by `reachability.ts`). Replace the `isReachable` definition with:
```ts
const hasSurface = (k: string) => !!SURFACE_REGISTRY[k];
const isReachable = (f: { chainKey?: string; route?: string; key: string }) =>
  isTileReachable(role, f, hasSurface);
```
Leave `const reachable = d.features.filter(isReachable);` unchanged.

- [ ] **Step 4: Replace the inline target computation**

Replace the `const to = f.chainKey ? \`/ledger/${f.chainKey}\` : f.route ? f.route : \`/surface/${f.key}\`;` line with:
```ts
const to = tileTarget(role, f, hasSurface) ?? '#';
```
(`f` is iterated over `reachable`, so the target is non-null; `?? '#'` only satisfies the type.)

- [ ] **Step 5: Type-check the SPA**

Run: `cd open-energy-platform/pages && npm run check:pages`
Expected: 0 errors. (If an "unused `surfaceRole`" error appears, the local const from Step 3 was not fully removed — remove it.)

- [ ] **Step 6: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/AtlasPage.tsx
git commit -m "refactor(meridian): AtlasPage uses shared reachability module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire CommandPalette to the reachability module

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/CommandPalette.tsx`

- [ ] **Step 1: Read the current change sites**

Run: `cd open-energy-platform && sed -n '8,20p;76,84p' pages/src/meridian/CommandPalette.tsx`
Confirm: `import { SURFACE_REGISTRY } from './surfaces';` (~:11), local `const surfaceRole` (~:18), `const surfaceFor = (key) => SURFACE_REGISTRY[...]` (~:79), `const targetFor = (f) => f.chainKey ? ... : surfaceFor(f.key) ? \`/surface/${f.key}\` : null;` (~:80-81).

- [ ] **Step 2: Add the import**

After `import { SURFACE_REGISTRY } from './surfaces';`, add:
```ts
import { tileTarget } from './reachability';
```

- [ ] **Step 3: Replace local `surfaceRole`/`surfaceFor`/`targetFor`**

Delete the local `const surfaceRole = …` line and the `const surfaceFor = …` line. Replace the `targetFor` definition with:
```ts
const hasSurface = (key: string) => !!SURFACE_REGISTRY[key];
const targetFor = (f: { chainKey?: string; route?: string; key: string }) =>
  tileTarget(role, f, hasSurface);
```
`targetFor` keeps its existing `string | null` contract (callers already null-check it).

- [ ] **Step 4: Type-check the SPA**

Run: `cd open-energy-platform/pages && npm run check:pages`
Expected: 0 errors. (Remove any now-unused `surfaceRole` local if flagged.)

- [ ] **Step 5: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/CommandPalette.tsx
git commit -m "refactor(meridian): CommandPalette uses shared reachability module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `singleChainOf` helper + test

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/lib.ts`
- Test: `open-energy-platform/tests/meridian-reachability.test.ts` (append)

- [ ] **Step 1: Append the failing test**

Append to `open-energy-platform/tests/meridian-reachability.test.ts`:
```ts
import { singleChainOf } from '../pages/src/meridian/lib';

describe('singleChainOf', () => {
  it('returns the chain when every case shares one chain', () => {
    expect(singleChainOf([{ chain: 'cod_chain' }, { chain: 'cod_chain' }])).toBe('cod_chain');
  });
  it('returns null when cases span multiple chains', () => {
    expect(singleChainOf([{ chain: 'a' }, { chain: 'b' }])).toBeNull();
  });
  it('returns null for an empty lane', () => {
    expect(singleChainOf([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: FAIL — `singleChainOf` is not exported from `lib`.

- [ ] **Step 3: Add the helper**

In `open-energy-platform/pages/src/meridian/lib.ts`, after the `HorizonData` type declaration (~:23), add:
```ts
export function singleChainOf(cases: { chain: string }[]): string | null {
  const set = new Set(cases.map((c) => c.chain));
  return set.size === 1 ? [...set][0] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/lib.ts open-energy-platform/tests/meridian-reachability.test.ts
git commit -m "feat(meridian): singleChainOf lane helper + test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Horizon single-chain lane → clickable Link

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/HorizonPage.tsx`
- Modify: `open-energy-platform/pages/src/meridian/meridian.css`

- [ ] **Step 1: Read the current lane header block**

Run: `cd open-energy-platform && sed -n '1,14p;165,192p' pages/src/meridian/HorizonPage.tsx`
Confirm the imports region and the single `<button className="lane-label" onClick={() => toggleLane(lane.key)}>` block containing `<span className="lane-chev">`, `{laneLabel(lane.key)}`, and `<span className="n">{lane.cases.length}</span>`.

- [ ] **Step 2: Ensure `Link` and `singleChainOf` are imported**

In the imports region of `HorizonPage.tsx`: if `Link` is not already imported from `react-router-dom`, add it (e.g. `import { Link } from 'react-router-dom';`). Add `singleChainOf` to the existing `./lib` import, e.g.:
```ts
import { fetchHorizon, singleChainOf, type HorizonData, type MerCase } from './lib';
```
(Match the existing import's exact member list — add `singleChainOf` to it; do not duplicate the import.)

- [ ] **Step 3: Replace the lane-label button**

Replace the single `<button className="lane-label" …>…</button>` block with:
```tsx
{(() => {
  const chain = singleChainOf(lane.cases);
  return (
    <div className="lane-label-split">
      <button
        className="lane-chev-btn"
        aria-label={collapsed ? 'Expand lane' : 'Collapse lane'}
        onClick={() => toggleLane(lane.key)}
      >
        {collapsed ? '▸' : '▾'}
      </button>
      {chain ? (
        <Link className="lane-label-link" to={`/ledger/${chain}`}>
          {laneLabel(lane.key)}
          <span className="n">{lane.cases.length}</span>
        </Link>
      ) : (
        <button className="lane-label-link lane-label-text" onClick={() => toggleLane(lane.key)}>
          {laneLabel(lane.key)}
          <span className="n">{lane.cases.length}</span>
        </button>
      )}
    </div>
  );
})()}
```
(`collapsed`, `toggleLane`, `laneLabel`, `lane` are all already in scope at this point in the render — confirm from Step 1's read.)

- [ ] **Step 4: Add the CSS**

In `open-energy-platform/pages/src/meridian/meridian.css`, immediately after the existing `.lane-label` / `.lane-chev` / `.lane-label .n` rules (~:161-171), add:
```css
.lane-label-split { display: flex; align-items: center; width: 100%; }
.lane-chev-btn {
  flex: 0 0 auto;
  background: none; border: 0; cursor: pointer;
  padding: 14px 4px 14px 24px;
  color: var(--ink3);
  font-size: 11px; line-height: 1;
}
.lane-label-link {
  flex: 1 1 auto;
  display: flex; align-items: center; justify-content: space-between;
  background: none; border: 0; cursor: pointer; text-align: left;
  padding: 14px 14px 14px 0;
  font-weight: 700; font-size: 11px; letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--petrol-deep); text-decoration: none;
}
.lane-label-link:hover { color: var(--oxide); }
.lane-label-link .n { color: var(--ink3); font-weight: 600; }
```
(If `.lane-label` already sets `text-transform`/`letter-spacing`, mirror those exact values from it so the link reads identically to the old label. Read `.lane-label` first and match.)

- [ ] **Step 5: Type-check the SPA**

Run: `cd open-energy-platform/pages && npm run check:pages`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/HorizonPage.tsx open-energy-platform/pages/src/meridian/meridian.css
git commit -m "feat(meridian): single-chain Horizon lanes link to their Ledger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `classifyLoadError` helper + test

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/lib.ts`
- Test: `open-energy-platform/tests/meridian-reachability.test.ts` (append)

- [ ] **Step 1: Append the failing test**

Append to `open-energy-platform/tests/meridian-reachability.test.ts`:
```ts
import { classifyLoadError } from '../pages/src/meridian/lib';

describe('classifyLoadError', () => {
  it('403 -> forbidden', () => {
    expect(classifyLoadError({ response: { status: 403 } })).toBe('forbidden');
  });
  it('404 -> notfound', () => {
    expect(classifyLoadError({ response: { status: 404 } })).toBe('notfound');
  });
  it('axios network error (request, no response) -> network', () => {
    expect(classifyLoadError({ request: {} })).toBe('network');
  });
  it('plain Error -> unknown', () => {
    expect(classifyLoadError(new Error('boom'))).toBe('unknown');
  });
  it('500 response -> unknown', () => {
    expect(classifyLoadError({ response: { status: 500 } })).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: FAIL — `classifyLoadError` not exported.

- [ ] **Step 3: Add the helper**

In `open-energy-platform/pages/src/meridian/lib.ts`, after `singleChainOf` (added in Task 5), add:
```ts
export type LoadErrorKind = 'forbidden' | 'notfound' | 'network' | 'unknown';

export function classifyLoadError(e: unknown): LoadErrorKind {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  if (status === undefined && (e as { request?: unknown })?.request) return 'network';
  return 'unknown';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/lib.ts open-energy-platform/tests/meridian-reachability.test.ts
git commit -m "feat(meridian): classifyLoadError helper + test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Ledger load-error distinction

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/LedgerPage.tsx`
- Modify: `open-energy-platform/pages/src/meridian/meridian.css`

- [ ] **Step 1: Read the current error handling**

Run: `cd open-energy-platform && sed -n '14,40p;60,70p' pages/src/meridian/LedgerPage.tsx`
Confirm: `chainKey` from `useParams` (~:18), `const [err, setErr] = React.useState<string | null>(null);` (~:25), the load `.catch(e => { if (live) setErr(String(e)); })` (~:32-38), and the error block rendering "Ledger failed to load." + Retry (~:62-69).

- [ ] **Step 2: Import the helper and retype `err`**

Add `classifyLoadError` and `LoadErrorKind` to the existing `./lib` import in `LedgerPage.tsx`. Change the state declaration to:
```ts
const [err, setErr] = React.useState<LoadErrorKind | null>(null);
```

- [ ] **Step 3: Classify in the catch**

Change the load `.catch` to:
```ts
.catch((e) => { if (live) setErr(classifyLoadError(e)); })
```

- [ ] **Step 4: Switch the error block on kind**

Replace the existing error block with:
```tsx
{err && (
  <div className="mer mer-error">
    {err === 'forbidden' ? (
      <>You don't have access to this ledger.</>
    ) : err === 'notfound' ? (
      <>Ledger "{chainKey}" not found.</>
    ) : err === 'network' ? (
      <>Network error — check your connection and retry.</>
    ) : (
      <>Ledger failed to load.</>
    )}
    {(err === 'network' || err === 'unknown') && (
      <button onClick={() => { setErr(null); load(); }}>Retry</button>
    )}
  </div>
)}
```
(`forbidden`/`notfound` omit Retry — a re-fetch won't change a 403/404. `load` is the existing load callback in scope; confirm its name from Step 1.)

- [ ] **Step 5: Add the small CSS rule**

In `meridian.css`, after the existing `.mer.mer-error` rule (~:35-38), add:
```css
.mer-error button {
  margin-left: 10px;
  background: none; border: 1px solid currentColor; border-radius: 6px;
  padding: 4px 12px; cursor: pointer; font-size: 12px; color: inherit;
}
```

- [ ] **Step 6: Type-check the SPA**

Run: `cd open-energy-platform/pages && npm run check:pages`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/LedgerPage.tsx open-energy-platform/pages/src/meridian/meridian.css
git commit -m "feat(meridian): distinguish Ledger 403/404/network/unknown load failures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Quicklink role-gating + `quicklinkVisible` test

**Files:**
- Modify: `open-energy-platform/pages/src/meridian/MeridianHeader.tsx`
- Test: `open-energy-platform/tests/meridian-reachability.test.ts` (append)

- [ ] **Step 1: Append the failing test**

Append to `open-energy-platform/tests/meridian-reachability.test.ts`:
```ts
import { quicklinkVisible } from '../pages/src/meridian/MeridianHeader';

describe('quicklinkVisible', () => {
  it('Intelligence is admin-only', () => {
    expect(quicklinkVisible('admin', '/intelligence')).toBe(true);
    expect(quicklinkVisible('trader', '/intelligence')).toBe(false);
  });
  it('National (/dashboard) is admin + regulator + grid', () => {
    expect(quicklinkVisible('regulator', '/dashboard')).toBe(true);
    expect(quicklinkVisible('grid_operator', '/dashboard')).toBe(true);
    expect(quicklinkVisible('grid', '/dashboard')).toBe(true);
    expect(quicklinkVisible('admin', '/dashboard')).toBe(true);
    expect(quicklinkVisible('ipp_developer', '/dashboard')).toBe(false);
  });
  it('Deals / ESG / Reports stay visible to everyone', () => {
    expect(quicklinkVisible('trader', '/deals')).toBe(true);
    expect(quicklinkVisible('ipp_developer', '/esg')).toBe(true);
    expect(quicklinkVisible('lender', '/reports')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: FAIL — `quicklinkVisible` not exported from `MeridianHeader`.

- [ ] **Step 3: Read the current quicklinks block**

Run: `cd open-energy-platform && sed -n '1,12p;36,46p' pages/src/meridian/MeridianHeader.tsx`
Confirm the unconditional `<Link>`s: `/deals` Deals, `/esg` ESG, `/reports` Reports, `/intelligence` Intelligence, `/dashboard` National.

- [ ] **Step 4: Add the exported helper**

At module top level in `MeridianHeader.tsx` (outside the component, e.g. just above the component declaration), add:
```ts
export function quicklinkVisible(role: string, to: string): boolean {
  if (to === '/intelligence') return role === 'admin';
  if (to === '/dashboard') return ['admin', 'regulator', 'grid_operator', 'grid'].includes(role);
  return true;
}
```

- [ ] **Step 5: Gate the two restricted quicklinks in the render**

Wrap the Intelligence and National links so they only render when visible. Replace the two lines with:
```tsx
{quicklinkVisible(user?.role ?? '', '/intelligence') && <Link to="/intelligence">Intelligence</Link>}
{quicklinkVisible(user?.role ?? '', '/dashboard') && <Link to="/dashboard">National</Link>}
```
(`user` is from `useAuth()` at ~:9; confirm `user?.role` is the field name from Step 3's read of the component. Leave Deals/ESG/Reports unconditional.)

- [ ] **Step 6: Run test + type-check**

Run: `cd open-energy-platform && npx vitest run tests/meridian-reachability.test.ts`
Expected: PASS (19 tests total).
Run: `cd open-energy-platform/pages && npm run check:pages`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/pages/src/meridian/MeridianHeader.tsx open-energy-platform/tests/meridian-reachability.test.ts
git commit -m "feat(meridian): gate Intelligence/National quicklinks by role

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Build-time reachability ratchet (the durable guard)

**Files:**
- Create: `open-energy-platform/tests/meridian-reachability-ratchet.test.ts`
- Create: `open-energy-platform/tests/meridian-known-unreachable.json` (seeded by running the test once with `SEED=1`)

This test imports the real `MERIDIAN_CHAINS` (a `ChainDescriptor[]`; chain key = `.key`) and `roleData` `ROLES`, and reads `surfaces.tsx` + `App.tsx` as text. It classifies every tile and asserts the broken set equals the committed quarantine. **The quarantine can only shrink:** a new broken tile fails the test, and a fixed tile still listed in the JSON also fails (telling you to remove it).

- [ ] **Step 1: Confirm the imports resolve and the shapes**

Run:
```bash
cd open-energy-platform
grep -n "export const MERIDIAN_CHAINS" src/utils/chain-registry-meridian.ts
grep -n "export const ROLES" pages/src/ux-alternatives/launchpad-nav/roleData.ts
node -e "console.log(require('fs').readFileSync('pages/src/meridian/surfaces.tsx','utf8').length, require('fs').readFileSync('pages/src/App.tsx','utf8').length)"
```
Expected: `MERIDIAN_CHAINS` and `ROLES` exports found; both file lengths print (non-zero) — confirms cwd-relative paths work.

- [ ] **Step 2: Write the ratchet test**

Create `open-energy-platform/tests/meridian-reachability-ratchet.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian';
import { ROLES } from '../pages/src/ux-alternatives/launchpad-nav/roleData';

const QUARANTINE = 'tests/meridian-known-unreachable.json';

const surfaceRole = (r: string) => (r === 'esums_owner' ? 'esco' : r);

// --- ground truth sources ---
const chainKeys = new Set(MERIDIAN_CHAINS.map((c) => c.key));

// SURFACE_REGISTRY composite keys: '<role>:<key>' — key segment may contain hyphens.
const surfacesSrc = readFileSync('pages/src/meridian/surfaces.tsx', 'utf8');
const surfaceKeys = new Set<string>();
for (const m of surfacesSrc.matchAll(/['"]([a-z_]+:[a-z0-9_-]+)['"]\s*:/g)) surfaceKeys.add(m[1]);

// Mounted routes from App.tsx: collect every <Route path="...">.
const appSrc = readFileSync('pages/src/App.tsx', 'utf8');
const routePaths: string[] = [];
for (const m of appSrc.matchAll(/path=['"]([^'"]+)['"]/g)) routePaths.push(m[1]);

function routeMounted(route: string): boolean {
  const want = route.split('?')[0].split('/').filter(Boolean);
  return routePaths.some((p) => {
    const have = p.split('/').filter(Boolean);
    if (have.length !== want.length) return false;
    return have.every((seg, i) => seg.startsWith(':') || seg === want[i]);
  });
}

type Broken = { role: string; key: string; kind: 'dangling' | 'route-dead' | 'dead' };

function computeBroken(): Broken[] {
  const out: Broken[] = [];
  for (const cfg of ROLES) {
    const role = (cfg as { role?: string; key?: string }).role
      ?? (cfg as { key?: string }).key
      ?? '';
    for (const d of cfg.domains ?? []) {
      for (const f of d.features ?? []) {
        if (f.chainKey) {
          if (!chainKeys.has(f.chainKey)) out.push({ role, key: f.key, kind: 'dangling' });
        } else if (f.route) {
          if (!routeMounted(f.route)) out.push({ role, key: f.key, kind: 'route-dead' });
        } else if (!surfaceKeys.has(`${surfaceRole(role)}:${f.key}`)) {
          out.push({ role, key: f.key, kind: 'dead' });
        }
      }
    }
  }
  return out;
}

const sortKey = (b: Broken) => `${b.role}|${b.key}|${b.kind}`;

describe('meridian reachability ratchet', () => {
  it('every tile resolves, or is in the shrink-only quarantine', () => {
    const broken = computeBroken().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    if (process.env.SEED) {
      writeFileSync(QUARANTINE, JSON.stringify(broken, null, 2) + '\n');
      console.log(`SEEDED ${broken.length} quarantined tiles`);
      return;
    }

    const quarantine: Broken[] = JSON.parse(readFileSync(QUARANTINE, 'utf8'));
    const brokenSet = new Set(broken.map(sortKey));
    const quarSet = new Set(quarantine.map(sortKey));

    // dangling / route-dead must NEVER exist — those are hard regressions.
    const hardRegressions = broken.filter((b) => b.kind !== 'dead');
    expect(hardRegressions, `dangling/route-dead tiles introduced: ${JSON.stringify(hardRegressions)}`)
      .toEqual([]);

    // New broken tiles not in the quarantine = regression.
    const newlyBroken = broken.filter((b) => !quarSet.has(sortKey(b)));
    expect(newlyBroken, `new unreachable tiles (add a surface or fix the tile): ${JSON.stringify(newlyBroken)}`)
      .toEqual([]);

    // Quarantine entries that now resolve must be removed (ratchet shrinks).
    const stale = quarantine.filter((b) => !brokenSet.has(sortKey(b)));
    expect(stale, `quarantine lists tiles that now resolve — delete them from ${QUARANTINE}: ${JSON.stringify(stale)}`)
      .toEqual([]);
  });
});
```

- [ ] **Step 3: Confirm the `ROLES` element role-key field**

Run: `cd open-energy-platform && sed -n '1,30p' pages/src/ux-alternatives/launchpad-nav/roleData.ts | grep -n "interface RoleConfig" ` then read the `RoleConfig` interface to confirm the field that holds the role string (`role` or `key`). If it is neither, adjust the `role` extraction in Step 2 to the actual field. (The `?? ''` fallback keeps the test from throwing, but the surface prefix must be correct for `dead` classification to be accurate.)

- [ ] **Step 4: Seed the quarantine**

Run:
```bash
cd open-energy-platform && SEED=1 npx vitest run tests/meridian-reachability-ratchet.test.ts
```
Expected: prints `SEEDED 40 quarantined tiles` and writes `tests/meridian-known-unreachable.json`.

- [ ] **Step 5: Verify the seed matches the baseline**

Run:
```bash
cd open-energy-platform
node -e "const q=require('./tests/meridian-known-unreachable.json'); const by={}; for(const b of q){by[b.kind]=(by[b.kind]||0)+1;} console.log('total',q.length,by);"
```
Expected: `total 40 { dead: 40 }` — 40 dead, zero dangling, zero route-dead. **If `dangling` or `route-dead` is non-zero, STOP** — the corrected baseline is contradicted; re-verify the chain key set before committing (do not silently quarantine a real 404).

- [ ] **Step 6: Run the ratchet in assert mode (green)**

Run:
```bash
cd open-energy-platform && npx vitest run tests/meridian-reachability-ratchet.test.ts
```
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/tests/meridian-reachability-ratchet.test.ts open-energy-platform/tests/meridian-known-unreachable.json
git commit -m "test(meridian): build-time tile-reachability ratchet + 40-dead quarantine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Correct the stale baseline figures in the parent design doc

**Files:**
- Modify: `open-energy-platform/docs/superpowers/specs/2026-06-17-meridian-frontend-coverage-onboarding-design.md`

The doc's inline figures (168 chains, 44 dangling, ~39 dangling false-positives) are a measurement artifact. Rather than rewrite every scattered figure, prepend a correction banner that supersedes them and fix the two most load-bearing lines.

- [ ] **Step 1: Prepend the correction banner**

Insert at the very top of the file (before the existing first line), a banner:
```markdown
> **CORRECTION (2026-06-18) — verified baseline supersedes inline figures below.**
> Measured by importing `MERIDIAN_CHAINS` + `ROLES` directly (not regex): **207 chains** (not 168),
> **392 tiles · 352 reachable (89.8%) · 0 dangling · 0 route-dead · 40 dead** (surface-class, already hidden).
> There is **no dangling-404 bug**; the "44 dangling / ~39 false-positives" figures were an undercount artifact.
> The reachability hardening (WS-A5 / U2) ships as defense-in-depth + a CI ratchet, not a 404 fix, and there are
> **no roleData repoints**. See `docs/superpowers/plans/2026-06-18-meridian-reachability-ia.md`.

```

- [ ] **Step 2: Fix the "168-chain backend" line**

Run: `cd open-energy-platform && grep -n "168-chain backend" docs/superpowers/specs/2026-06-17-meridian-frontend-coverage-onboarding-design.md`
Replace `168-chain backend` with `207-chain backend` on that line.

- [ ] **Step 3: Fix the matrix line**

Run: `cd open-energy-platform && grep -n "168 registry chains" docs/superpowers/specs/2026-06-17-meridian-frontend-coverage-onboarding-design.md`
Replace `168 registry chains` with `207 registry chains` on that line.

- [ ] **Step 4: Commit**

```bash
cd /Users/reshigan/Openenergy
git add open-energy-platform/docs/superpowers/specs/2026-06-17-meridian-frontend-coverage-onboarding-design.md
git commit -m "docs(meridian): correct chain-count/reachability baseline (207, 0 dangling)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Backend type-check**

Run: `cd open-energy-platform && npm run check`
Expected: 0 errors.

- [ ] **Step 2: SPA type-check**

Run: `cd open-energy-platform/pages && npm run check:pages`
Expected: 0 errors.

- [ ] **Step 3: Full backend test suite**

Run: `cd open-energy-platform && npm test`
Expected: all tests pass, including `meridian-reachability.test.ts` (19) and `meridian-reachability-ratchet.test.ts` (1). Confirm the total test count increased by the new tests vs the prior baseline and there are 0 failures.

- [ ] **Step 4: Confirm the working tree is clean**

Run: `cd /Users/reshigan/Openenergy && git status --short`
Expected: empty (everything committed). The pre-existing untracked `.docx`/`build_cec_*.py` files at repo root are unrelated to this branch — leave them untracked.

---

## Self-Review

**1. Spec coverage** (against the parent design doc's WS-A reachability workstream + the headline directive "none of the labels are clickable / very difficult for an IPP to go through a journey"):
- U2 existence-check reachability → Tasks 2-4 (shared module) + Task 10 (CI ratchet enforcing `chainKey ∈ MERIDIAN_CHAINS ∧ route mounted ∧ surface present`). ✔
- "labels not clickable" → Task 6 (single-chain lanes become `<Link>`s). ✔
- Honest hide vs 404 → Task 8 (Ledger error distinction) + Tasks 2-4 (dead tiles hidden, not rendered clickable). ✔
- "roles showing everything" (superuser leakage) → Task 9 (quicklink gating). ✔
- Baseline correction (the spec is built on wrong numbers) → Task 11. ✔
- Explicitly **out of scope** (deferred to follow-on plans, stated in baseline): building the 40 dead surfaces to L4, DB-backed dropdowns, onboarding, a11y contrast/focus — none are reachability/IA. The ratchet (Task 10) tracks the 40 so the follow-on plans can drive the number down.
- Explicitly **dropped** (corrected baseline): the 11 roleData repoints and the "back the dangling chainKey or remove the tile" item — there are 0 dangling.

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code. The one `?? '#'` (Task 3) and `?? ''` (Task 10) are deliberate type-satisfiers with inline justification, not placeholders. Task 10 Step 3 asks the implementer to confirm one field name against source — this is a verification step with a safe fallback, not an unfilled blank.

**3. Type consistency:** `Tile` shape `{ key; chainKey?; route? }` is identical in `reachability.ts`, the AtlasPage/CommandPalette call sites, and the ratchet's feature reads. `tileTarget`/`isTileReachable` signatures `(role, f, hasSurface)` match across Tasks 2-4. `LoadErrorKind` defined in Task 7 is consumed in Task 8. `singleChainOf(cases: {chain:string}[])` defined in Task 5 is called in Task 6 against `lane.cases` (each case has `.chain`). `quicklinkVisible(role, to)` defined and consumed in Task 9. Chain key field is `.key` on `ChainDescriptor` (verified). No signature drift.

**Note on test-importing-`../pages`:** This is the first backend test to import SPA source. vitest/esbuild transforms `.ts` on the fly, and the imported modules (`reachability.ts`, `lib.ts`, `roleData.ts`) are pure (no JSX, no browser-only deps). `MeridianHeader.tsx` is imported only for its top-level `quicklinkVisible` export — esbuild strips the unused JSX component during transform, but if Task 9's import surfaces a transform error from React/JSX, move `quicklinkVisible` into `lib.ts` (pure) and re-import from there in both the component and the test. This fallback keeps the test green without changing behavior.
