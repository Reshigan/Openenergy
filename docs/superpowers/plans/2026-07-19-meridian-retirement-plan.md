# Meridian Frontend Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully retire the legacy Meridian frontend (Horizon/Atlas/Ledger/Thread/Deals chrome) under `open-energy-platform/pages/src/`, leaving the v2 four-surface design (Home `/v2`, Transaction `/v2/t/:id`, Find `/v2/find`, Trade `/v2/trade`) as the single frontend.

**Architecture:** A two-bucket split. **Bucket A** is dead legacy chrome — delete once the routes that render it redirect to v2. **Bucket B** is load-bearing infrastructure currently mislabeled under `meridian/` that v2 (and ~15 unrelated still-live callers) import — it must be *relocated* (import-path-only, exported symbols unchanged) before Bucket A can go. Task order keeps the tree buildable after every task: relocate Bucket B and fix its callers' import paths first, redirect routes second, delete Bucket A last.

**Tech Stack:** React 18 + TypeScript, React Router v6, Vite SPA, vitest (unit), Playwright (browser). No new dependencies.

## Global Constraints

- **No behavior change** to any in-scope-but-untouched system: the backend `src/utils/chain-registry-meridian.ts` registry (a *separate* system from the frontend `meridian/` folder), the still-live legacy-launch system (`components/launch/*`, `/launch-legacy/:role` routes), and `components/launch/WorkstationShell.tsx`'s own logic beyond its ease-kit import path.
- **Bucket B relocation is import-path-only** for its external callers: zero logic changes, exported symbol names and signatures unchanged, callers only get new import paths.
- **`npm test` (vitest) and `npm run check` + `npm run check:pages` must stay green after every task.** This is a large mechanical move; each task must leave the tree buildable.
- **Do NOT touch the backend** `open-energy-platform/src/utils/chain-registry-meridian.ts` or any `open-energy-platform/src/**`. This plan is entirely within `open-energy-platform/pages/src/**`, `open-energy-platform/tests/*.test.ts` (root, meridian-frontend-only), and `open-energy-platform/tests/browser/*.spec.ts`.
- **Do NOT touch** `components/launch/*` internals or `/launch-legacy` routes beyond (a) their ease-kit import path (Task 2) and (b) the literal `/cockpit` destination string if they navigate there (Task 8).
- Preserve every Bucket B exported symbol name: `SURFACE_REGISTRY`, `SurfaceBoundary`, `humanizeKey`, `statusLabel`, `STATUS_TONE_CLASS`, `EaseLoading`, `EaseError`, `EaseEmpty`, `PrimaryAction`, `byAtRisk`, `fmtZar`, `zarMagnitudeClass`, `fuseFraction`, `singleChainOf`, `classifyLoadError`, `fetchLookup`, `fetchLedger`, `fetchHorizon`, `useViewPrefs`, `applyViewPrefs`, and the `JourneyAdmin` cluster's exports.
- All paths below are relative to `open-energy-platform/pages/src/` unless prefixed with `tests/` (relative to `open-energy-platform/`).
- Commands run from `open-energy-platform/pages/` for `npm run check`; from `open-energy-platform/` for `npm test` and Playwright.

---

## Design

### The two buckets (exhaustive, dependency-closed)

**Bucket A — dead legacy chrome, delete after routes redirect:**
`meridian/{AtlasPage.tsx, DealDeskPage.tsx, DealOfferComposer.tsx, DealProcessRail.tsx, OfferCompareGrid.tsx, JourneyCockpit.tsx, LedgerPage.tsx, ThreadPage.tsx, NewPage.tsx, MeridianFrame.tsx, MeridianHeader.tsx, CommandPalette.tsx, HorizonKpis.tsx, GettingStarted.tsx, GuidedTour.tsx, PlatformPulse.tsx, StreamInsight.tsx, StreamInsight.test.tsx, FieldForm.tsx, components.tsx, reachability.ts, lib-pure test surface via reachability, useTourState.ts}` plus the **default `MeridianSurfacePage` component** (the `/surface/:key` page — its `SurfaceBoundary` class is Bucket B and is extracted first). `meridian/meridian.css` dies here too (its live subset is relocated first).

> **Correction to the original bucket list:** `JourneyAdmin.tsx` was originally listed in Bucket A but is **not** dead chrome — it backs the live `admin:journeys` surface (per-role feature availability + per-action pricing, persisting to `/api/journey-config/:role/:feature`) and is lazy-imported by the Bucket B `SURFACE_REGISTRY`. Per user decision (2026-07-19) it is **ported forward as-is (temporary)** — relocated, not deleted, with no v2 redesign. This pulls its dependency cluster (`journeys.ts`, `icons.tsx`, `labels.ts`, `quicklinks.ts`) into Bucket B as well. A v2-native redesign is a separate future plan.

**Bucket B — relocate (import-path-only), do NOT delete:**

| Current location | New location | Consumed by |
|---|---|---|
| `meridian/lib.ts`, `meridian/lib-pure.ts` | `shared/lib.ts`, `shared/lib-pure.ts` | v2/Surface + Bucket A (dying) + ease/money |
| `meridian/ease/**` (statusLabel.ts, states.tsx, PrimaryAction.tsx, applyViewPrefs.ts, money.ts, useViewPrefs.ts) | `shared/ease/**` | v2/Surface + ~15 external components + Bucket A + surfaces/** |
| `SurfaceBoundary` class (from `meridian/MeridianSurfacePage.tsx`) | `shared/SurfaceBoundary.tsx` | App.tsx, v2/Surface |
| live subset of `meridian/meridian.css` (`.mer .mer-kyc-*` + `.mer .ja-*`) | `shared/surfaces.css` | KycSubmission, JourneyAdmin |
| `meridian/surfaces.tsx` (`SURFACE_REGISTRY`) + `meridian/surfaces/**` | `v2/surfaces.tsx` + `v2/surfaces/**` | v2/Surface |
| `JourneyAdmin.tsx`, `journeys.ts`, `icons.tsx`, `labels.ts`, `quicklinks.ts` | `v2/JourneyAdmin.tsx`, `v2/journeys.ts`, `v2/icons.tsx`, `v2/labels.ts`, `v2/quicklinks.ts` | `v2/surfaces.tsx` (lazy) |

**Why `shared/` and `v2/`:** `shared/` items are consumed by *both* v2 and non-v2, non-meridian callers, so a folder named after neither is correct. `surfaces.tsx`/`surfaces/**` and the JourneyAdmin cluster are v2-only, so they live under `v2/`. `meridian/` and both `shared/`/`v2/` are all direct children of `pages/src/`, so a file moved `meridian/X → shared/X` or `meridian/X → v2/X` keeps every `../…` import valid; only imports naming `meridian/` need rewriting.

### Route redirect table (App.tsx)

| Legacy route | Today renders | After |
|---|---|---|
| `/cockpit` | `JourneyCockpit` | `<Navigate to="/v2" replace>` |
| `/thread/:chainKey/:id` | `ThreadPage` | `<Navigate to="/v2/t/:id" replace>` (v2 Transaction resolves `chain_key` from the txn id internally — confirmed `Transaction.tsx:37`) |
| `/ledger/:chainKey` | `LedgerPage` | `<Navigate to="/v2/find?chain_key=:chainKey" replace>` (per `Find.tsx` `?chain_key=` deep-link) |
| `/surface/:key` | `MeridianSurfacePage` | `<Navigate to="/v2/s/:key" replace>` — v2 already has `/v2/s/:key` → `V2Surface`, which wraps the same `SURFACE_REGISTRY` + `SurfaceBoundary`. The legacy page is redundant; redirect it and delete the default `MeridianSurfacePage` component. |
| `/deals` | `DealDeskPage` | `<Navigate to="/v2/trade" replace>` |
| `CommandPalette` mounted globally at `App.tsx:790` (outside `<Routes>`) | global ⌘K | removed — v2 `Shell.tsx` has its own ⌘K `Palette`; the global mount only served now-deleted non-v2 pages |

### Tests

- **Root vitest (delete):** `tests/meridian-reachability.test.ts`, `tests/meridian-reachability-ratchet.test.ts` — test `reachability.ts` (Bucket A, deleted).
- **Root vitest (repoint, do NOT delete):** `tests/meridian-labels.test.ts` (tests `cleanLabel` in `labels.ts`, which *survives* in `v2/labels.ts`), `tests/journey-taxonomy.test.ts` (tests `journeys.ts`, survives in `v2/journeys.ts`). Original plan said delete; corrected because those files are kept.
- **Do NOT touch:** `tests/horizon.test.ts`, `tests/thread.test.ts`, `tests/ledger-route.test.ts`, `tests/chain-registry-meridian.test.ts`, `tests/v2/import-legacy.test.ts` — these test the *backend* registry, out of scope.
- **Browser specs:** delete Meridian-only specs; edit shared specs' `/cockpit`|`/horizon`|`/launch` assertions to the new v2 destination; extend `v2.spec.ts` redirect list; add minimal new v2 coverage only for genuine gaps (see Task 9).

---

## Task 1: Relocate `lib.ts` + `lib-pure.ts` → `shared/`

**Files:**
- Create: `shared/lib.ts` (from `meridian/lib.ts`), `shared/lib-pure.ts` (from `meridian/lib-pure.ts`)
- Delete: `meridian/lib.ts`, `meridian/lib-pure.ts`
- Modify (import paths only): `v2/Surface.tsx:17`, `meridian/ease/money.ts:5`, and every Bucket-A file importing `./lib` — `meridian/AtlasPage.tsx`, `meridian/CommandPalette.tsx`, `meridian/JourneyCockpit.tsx`, `meridian/DealOfferComposer.tsx`, `meridian/NewPage.tsx`, `meridian/DealProcessRail.tsx`, `meridian/HorizonKpis.tsx`, `meridian/MeridianSurfacePage.tsx`, `meridian/OfferCompareGrid.tsx`, `meridian/LedgerPage.tsx`, `meridian/ThreadPage.tsx`, `meridian/FieldForm.tsx`, `meridian/DealDeskPage.tsx`, `meridian/components.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `shared/lib.ts` re-exporting everything `meridian/lib.ts` did (`humanizeKey`, `fmtZar`, `zarMagnitudeClass`, `fuseFraction`, `fetchHorizon`, `fetchLedger`, `fetchInitiable`, `fetchLookup`, `fetchRoleStats`, `fetchDealTypes`, `dealLabel`, `classifyLoadError`, `singleChainOf`, and all exported types) at the same names. Later tasks import `humanizeKey` from `../shared/lib`.

- [ ] **Step 1: Move the two files with git mv (preserves history)**

```bash
cd open-energy-platform/pages/src
mkdir -p shared
git mv meridian/lib.ts shared/lib.ts
git mv meridian/lib-pure.ts shared/lib-pure.ts
```

- [ ] **Step 2: Fix the internal cross-reference inside `shared/lib.ts`**

`shared/lib.ts` re-exports from `./lib-pure` (line ~5: `export { singleChainOf, classifyLoadError } from './lib-pure';` and `export type { LoadErrorKind } from './lib-pure';`). Both files moved together into `shared/`, so `./lib-pure` is still correct — **verify no edit is needed** by reading `shared/lib.ts` lines 1-10. If it says `./lib-pure`, leave it.

- [ ] **Step 3: Repoint every importer of the moved files**

Run this to see the exact lines to change (from `open-energy-platform/pages/src`):

```bash
grep -rn "meridian/lib'\|from '\./lib'\|from '\./lib-pure'" . | grep -v node_modules
```

Apply these edits (old → new):

- `v2/Surface.tsx:17`: `from '../meridian/lib'` → `from '../shared/lib'`
- `meridian/ease/money.ts:5`: `import type { Bucket } from '../lib';` → `import type { Bucket } from '../../shared/lib';` (from `meridian/ease/`, `../../shared/lib` = `pages/src/shared/lib`)
- In each of these Bucket-A files (all in `meridian/`), change `from './lib'` → `from '../shared/lib'` and `from './lib-pure'` → `from '../shared/lib-pure'`:
  `AtlasPage.tsx`, `CommandPalette.tsx`, `JourneyCockpit.tsx`, `DealOfferComposer.tsx`, `NewPage.tsx`, `DealProcessRail.tsx`, `HorizonKpis.tsx`, `MeridianSurfacePage.tsx`, `OfferCompareGrid.tsx`, `LedgerPage.tsx`, `ThreadPage.tsx`, `FieldForm.tsx`, `DealDeskPage.tsx`, `components.tsx`

Portable bulk rewrite for the `meridian/*.tsx` `./lib` importers (macOS-safe perl):

```bash
cd open-energy-platform/pages/src
perl -pi -e "s{from '\./lib'}{from '../shared/lib'}g; s{from '\./lib-pure'}{from '../shared/lib-pure'}g" \
  meridian/AtlasPage.tsx meridian/CommandPalette.tsx meridian/JourneyCockpit.tsx \
  meridian/DealOfferComposer.tsx meridian/NewPage.tsx meridian/DealProcessRail.tsx \
  meridian/HorizonKpis.tsx meridian/MeridianSurfacePage.tsx meridian/OfferCompareGrid.tsx \
  meridian/LedgerPage.tsx meridian/ThreadPage.tsx meridian/FieldForm.tsx \
  meridian/DealDeskPage.tsx meridian/components.tsx
```

Then hand-edit `v2/Surface.tsx:17` and `meridian/ease/money.ts:5` (different relative depths — do NOT include them in the perl above).

- [ ] **Step 4: Confirm no dangling references**

```bash
cd open-energy-platform/pages/src
grep -rn "meridian/lib'\|meridian/lib-pure\|from '\./lib'\|from '\./lib-pure'" . | grep -v node_modules
```
Expected: empty (no matches).

- [ ] **Step 5: Typecheck**

```bash
cd open-energy-platform/pages && npm run check
```
Expected: no new errors.

- [ ] **Step 6: Unit tests still green**

```bash
cd open-energy-platform && npm test
```
Expected: all pass (baseline count unchanged).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(v2): relocate meridian/lib + lib-pure to shared/"
```

---

## Task 2: Relocate `ease/**` → `shared/ease/`

**Files:**
- Move: `meridian/ease/{statusLabel.ts, states.tsx, PrimaryAction.tsx, applyViewPrefs.ts, money.ts, useViewPrefs.ts}` → `shared/ease/`
- Modify (import paths only): all ease importers listed below.

**Interfaces:**
- Consumes: `shared/lib.ts` (Task 1) — `money.ts` imports `Bucket` from it.
- Produces: `shared/ease/*` exporting `statusLabel`, `STATUS_TONE_CLASS`, `StatusTone` (statusLabel.ts); `EaseLoading`, `EaseError`, `EaseEmpty` (states.tsx); `PrimaryAction` (PrimaryAction.tsx); `byAtRisk` (money.ts); `useViewPrefs` (useViewPrefs.ts); `applyViewPrefs` (applyViewPrefs.ts). Same names as before.

- [ ] **Step 1: Move the ease directory**

```bash
cd open-energy-platform/pages/src
git mv meridian/ease shared/ease
```

- [ ] **Step 2: Fix `money.ts`'s lib import to the new depth**

After the move, `shared/ease/money.ts` reaches `shared/lib` via `../lib`. Change the import set in Task 1 (`from '../../shared/lib'`) back to `../lib`:

- `shared/ease/money.ts`: `import type { Bucket } from '../../shared/lib';` → `import type { Bucket } from '../lib';`

- [ ] **Step 3: Repoint every ease importer**

Because `meridian/` and `shared/` are siblings at the same depth, callers that named `meridian/ease/` only need `meridian` → `shared`. Bulk rewrite (macOS-safe):

```bash
cd open-energy-platform/pages/src
grep -rl "meridian/ease/" . --include="*.ts" --include="*.tsx" | grep -v node_modules \
  | xargs perl -pi -e "s{meridian/ease/}{shared/ease/}g"
```

This covers: `v2/Surface.tsx:18`, `components/ChainCard.tsx:15`, `components/ippLessonsLearned/IppLessonsLearnedTab.tsx`, `components/launch/WorkstationShell.tsx:20`, `components/ippIssues/IppIssuesTab.tsx`, `components/ippRisk/IppRiskTab.tsx`, `components/ippStakeholder/IppStakeholderTab.tsx`, `components/esums/ProtectionRelayTestTab.tsx`, `components/ipp/IppAnnualReportTab.tsx`, `components/esums/StationParticipantLinkTab.tsx`, `components/pages/BillingRunDetailPage.tsx`, `components/pages/LicenceActionDetailPage.tsx`, `components/pages/ComplianceSettingsPage.tsx`, `components/pages/ComplianceAdminPage.tsx`, `components/pages/EsumsOmFieldWosPage.tsx`, `components/pages/SupportTicketDetailPage.tsx`, `components/onboarding/KycSubmission.tsx:25`, and the Bucket-A `meridian/*` files (`AtlasPage`, `CommandPalette`, `JourneyCockpit`, `LedgerPage`, `MeridianSurfacePage`, `components.tsx`, `DealDeskPage`, `ThreadPage`) — all use `meridian/ease/`, so all are correctly rewritten to `shared/ease/`.

- [ ] **Step 4: Fix the surfaces/** internal ease imports (different pattern)**

The 12 `meridian/surfaces/<role>/*.tsx` files import ease as `../../ease/statusLabel` (relative, no `meridian/` in the string). From `meridian/surfaces/<role>/`, the new `shared/ease` is three levels up: `../../../shared/ease/`. Rewrite them **now, while still under `meridian/surfaces/`** (Task 5 moves the directory to `v2/surfaces/` at the same depth-from-`src/`, so the path stays valid):

```bash
cd open-energy-platform/pages/src
grep -rl "\.\./\.\./ease/" meridian/surfaces | grep -v node_modules \
  | xargs perl -pi -e "s{\.\./\.\./ease/}{../../../shared/ease/}g"
```

Affected (12): `surfaces/admin/{BillingSurface,DataSubjectRequestSurface,SubscriptionBillingSurface}.tsx`, `surfaces/carbon/MrvSurface.tsx`, `surfaces/epc/{RfisSurface,TechnicalQueriesSurface}.tsx`, `surfaces/ipp/ProjectsSurface.tsx`, `surfaces/lender/FacilitiesSurface.tsx`, `surfaces/offtaker/BillsSurface.tsx`, `surfaces/regulator/LicencesSurface.tsx`, `surfaces/support/TicketsSurface.tsx`, `surfaces/trader/OrdersSurface.tsx`.

- [ ] **Step 5: Confirm no dangling ease references**

```bash
cd open-energy-platform/pages/src
grep -rn "meridian/ease\|\.\./\.\./ease/\|from '\./ease/" . | grep -v node_modules
```
Expected: empty.

- [ ] **Step 6: Typecheck + unit tests**

```bash
cd open-energy-platform/pages && npm run check
cd open-energy-platform && npm test
```
Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(v2): relocate meridian/ease kit to shared/ease"
```

---

## Task 3: Extract `SurfaceBoundary` → `shared/SurfaceBoundary.tsx`

**Files:**
- Create: `shared/SurfaceBoundary.tsx` (the `SurfaceBoundary` class, moved out of `meridian/MeridianSurfacePage.tsx`)
- Modify: `meridian/MeridianSurfacePage.tsx` (import `SurfaceBoundary` from `../shared/SurfaceBoundary` instead of defining it — it still uses it in its default component until Task 6 deletes that component), `App.tsx:7`, `v2/Surface.tsx:16`

**Interfaces:**
- Consumes: nothing new.
- Produces: `shared/SurfaceBoundary.tsx` exporting `class SurfaceBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }>` — same signature. App.tsx and v2/Surface import `{ SurfaceBoundary }` from `../shared/SurfaceBoundary`.

- [ ] **Step 1: Read the current class**

Read `meridian/MeridianSurfacePage.tsx` lines 1-32 to capture the `SurfaceBoundary` class verbatim (imports it needs: `React`, and `EaseLoading`/`EaseError` from `./ease/states` → now `../shared/ease/states` after Task 2; check whether the boundary class itself uses them or only the default component does).

- [ ] **Step 2: Create `shared/SurfaceBoundary.tsx`**

Create `shared/SurfaceBoundary.tsx` containing exactly the `SurfaceBoundary` class (lines 17-31 of the original), with a minimal import header. From `shared/`, ease is `./ease/...`:

```tsx
// shared/SurfaceBoundary.tsx — error boundary for surface panels. Extracted from
// the retired meridian/MeridianSurfacePage so v2 and the /kyc Layout can share it.
import React from 'react';

export class SurfaceBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  // ← paste the class body verbatim from meridian/MeridianSurfacePage.tsx:17-31
}
```

(If the class body references `EaseError`/`EaseLoading`, add `import { EaseError } from './ease/states';` — include only what the class actually uses.)

- [ ] **Step 3: Update `meridian/MeridianSurfacePage.tsx` to import the class**

Remove the `SurfaceBoundary` class definition from `meridian/MeridianSurfacePage.tsx` and add at the top: `import { SurfaceBoundary } from '../shared/SurfaceBoundary';` (the file's default `MeridianSurfacePage()` component stays — it's deleted in Task 6). This keeps the file compiling until then.

- [ ] **Step 4: Repoint App.tsx and v2/Surface.tsx**

- `App.tsx:7`: `import { SurfaceBoundary } from './meridian/MeridianSurfacePage';` → `import { SurfaceBoundary } from './shared/SurfaceBoundary';`
- `v2/Surface.tsx:16`: `import { SurfaceBoundary } from '../meridian/MeridianSurfacePage';` → `import { SurfaceBoundary } from '../shared/SurfaceBoundary';`

- [ ] **Step 5: Typecheck + unit tests**

```bash
cd open-energy-platform/pages && npm run check
cd open-energy-platform && npm test
```
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(v2): extract SurfaceBoundary to shared/SurfaceBoundary"
```

---

## Task 4: Relocate the live `meridian.css` subset → `shared/surfaces.css`

**Files:**
- Create: `shared/surfaces.css` (verbatim copy of the `.mer .mer-kyc-*` block and the `.mer .ja-*` "Journey crafting" block from `meridian/meridian.css`)
- Modify: `components/onboarding/KycSubmission.tsx:26` (css import path)
- (`meridian/meridian.css` itself is NOT edited or deleted here — Bucket A files and `JourneyAdmin` still import it until Tasks 5/6.)

**Interfaces:** none (CSS only).

**Note:** These rules are `.mer`-descendant selectors and KycSubmission/JourneyAdmin do not render under a `.mer` ancestor, so the rules are currently inert. They are relocated **verbatim (keeping the `.mer` prefix)** to guarantee byte-identical behavior under the no-behavior-change constraint. Un-prefixing them to actually style KYC/JourneyAdmin is explicitly out of scope (a future task).

- [ ] **Step 1: Identify the exact line ranges**

```bash
cd open-energy-platform/pages/src
grep -n "mer-kyc" meridian/meridian.css | head -1   # first mer-kyc rule (~1083)
grep -n "mer-kyc" meridian/meridian.css | tail -1   # last mer-kyc rule (~1203)
grep -n "Journey crafting (admin:journeys)" meridian/meridian.css   # ja- section start (~2358)
```
Read `meridian/meridian.css` around 1083-1210 (the kyc block, including any surrounding `@media` wrappers) and 2358 to the end of the `.ja-*` block, so you copy complete rule sets (do not split a rule or an `@media` block).

- [ ] **Step 2: Create `shared/surfaces.css`**

Create `shared/surfaces.css` and paste **verbatim** (a) the full `.mer .mer-kyc-*` block (including its `@media` variants) and (b) the full `/* Journey crafting (admin:journeys) */ .mer .ja-*` block. Add a one-line header comment:

```css
/* shared/surfaces.css — kyc + journey-crafting styles carried out of the retired
   meridian.css. Kept verbatim (.mer-prefixed, currently inert) for zero behavior change. */
```

- [ ] **Step 3: Repoint KycSubmission's css import**

- `components/onboarding/KycSubmission.tsx:26`: `import '../../meridian/meridian.css';` → `import '../../shared/surfaces.css';`

- [ ] **Step 4: Typecheck + unit tests**

```bash
cd open-energy-platform/pages && npm run check
cd open-energy-platform && npm test
```
Expected: both green (CSS imports don't affect tsc/vitest, but confirm nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(v2): carry kyc + journey-crafting css into shared/surfaces.css"
```

---

## Task 5: Relocate `surfaces.tsx` + `surfaces/**` + the JourneyAdmin cluster → `v2/`

**Files:**
- Move: `meridian/surfaces.tsx` → `v2/surfaces.tsx`; `meridian/surfaces/**` → `v2/surfaces/**`; `meridian/JourneyAdmin.tsx` → `v2/JourneyAdmin.tsx`; `meridian/journeys.ts` → `v2/journeys.ts`; `meridian/icons.tsx` → `v2/icons.tsx`; `meridian/labels.ts` → `v2/labels.ts`; `meridian/quicklinks.ts` → `v2/quicklinks.ts`
- Modify: `v2/Surface.tsx:15` (registry import), `v2/JourneyAdmin.tsx` (css import → shared), and any moved file whose imports name `meridian/` or crossed the `meridian↔v2` boundary.

**Interfaces:**
- Consumes: `shared/lib`, `shared/ease` (Tasks 1-2), `shared/surfaces.css` (Task 4).
- Produces: `v2/surfaces.tsx` exporting `SURFACE_REGISTRY` and `SurfaceComponent` (same names). `v2/Surface.tsx` imports `{ SURFACE_REGISTRY } from './surfaces'`.

**Why these move together:** `v2/Surface.tsx` imports `SURFACE_REGISTRY`; `surfaces.tsx` lazy-imports `./JourneyAdmin` (`surfaces.tsx:26`); `JourneyAdmin.tsx` imports `./journeys`, `./icons`, `./labels`; `journeys.ts` imports `./quicklinks`. This is a closed cluster — none of it imports Bucket A or `lib`. Moving anything less breaks a `./`-relative import.

- [ ] **Step 1: Move the directory and files**

```bash
cd open-energy-platform/pages/src
git mv meridian/surfaces.tsx v2/surfaces.tsx
git mv meridian/surfaces v2/surfaces
git mv meridian/JourneyAdmin.tsx v2/JourneyAdmin.tsx
git mv meridian/journeys.ts v2/journeys.ts
git mv meridian/icons.tsx v2/icons.tsx
git mv meridian/labels.ts v2/labels.ts
git mv meridian/quicklinks.ts v2/quicklinks.ts
```

- [ ] **Step 2: Fix imports inside the moved cluster**

Because all seven items moved from `meridian/` to `v2/` at the same depth, `./`-relative imports *within the cluster* (`surfaces.tsx`→`./surfaces/...`, `surfaces.tsx`→`./JourneyAdmin`, `JourneyAdmin`→`./journeys`/`./icons`/`./labels`, `journeys`→`./quicklinks`) stay valid, and `../…` imports (e.g. `../ux-alternatives/launchpad-nav/roleData`, `../lib/api`) stay valid. Only two things change:

1. `v2/JourneyAdmin.tsx` css import: `import './meridian.css';` → `import '../shared/surfaces.css';`
2. Any file in the cluster that named `meridian/` explicitly or reached a Bucket B target by a now-wrong path. Find them:

```bash
cd open-energy-platform/pages/src
grep -rn "meridian/\|'\.\./meridian" v2/surfaces.tsx v2/surfaces v2/JourneyAdmin.tsx v2/journeys.ts v2/icons.tsx v2/labels.ts v2/quicklinks.ts
```

For each hit, rewrite `../meridian/X` → the shared/v2 location, or `meridian/ease`/`meridian/lib` → `shared/ease`/`shared/lib` (the surfaces/** ease imports were already fixed to `../../../shared/ease/` in Task 2 Step 4 and remain valid at the new depth — confirm they show no error). If `surfaces.tsx` imports `SurfaceBoundary`/`MeridianSurfacePage`, point it at `../shared/SurfaceBoundary`.

- [ ] **Step 3: Repoint `v2/Surface.tsx`**

- `v2/Surface.tsx:15`: `import { SURFACE_REGISTRY } from '../meridian/surfaces';` → `import { SURFACE_REGISTRY } from './surfaces';`

- [ ] **Step 4: Confirm no dangling references to the moved cluster**

```bash
cd open-energy-platform/pages/src
grep -rn "meridian/surfaces\|meridian/JourneyAdmin\|meridian/journeys\|meridian/icons\|meridian/labels\|meridian/quicklinks" . | grep -v node_modules
```
Expected: empty. (Bucket A files `AtlasPage`/`CommandPalette`/`JourneyCockpit` import `./journeys`/`./icons`/`./labels`/`./quicklinks`/`./reachability` — those are now broken, but those files are deleted in Task 6. **This task must run immediately before Task 6; the tree does NOT fully typecheck between Step 4 and Task 6.** To keep this task self-contained and buildable, proceed to Step 5 which folds the Bucket-A deletions that reference the moved files.)

> **Right-sizing note:** Steps 5-6 fold the deletion of the Bucket-A files that import the just-moved cluster into this task, because moving the cluster necessarily breaks their `./journeys`/`./icons`/`./labels`/`./quicklinks`/`./reachability` imports. Redirecting the *routes* those files backed is Task 6.

- [ ] **Step 5: Delete the Bucket-A files that imported the moved cluster**

These import `./journeys`/`./icons`/`./labels`/`./quicklinks`/`./reachability` and are dead chrome — delete them now so the tree compiles:

```bash
cd open-energy-platform/pages/src
git rm meridian/JourneyCockpit.tsx meridian/AtlasPage.tsx meridian/CommandPalette.tsx \
       meridian/NewPage.tsx meridian/ThreadPage.tsx meridian/FieldForm.tsx \
       meridian/reachability.ts
```

Then check what still imports these deleted files (App.tsx lazy-imports them — those are removed in Task 6, but if `check` fails here because App.tsx references them, move the App.tsx route-redirect edits from Task 6 Step 1-2 into this step). Run:

```bash
cd open-energy-platform/pages/src
grep -rn "JourneyCockpit\|AtlasPage\|CommandPalette\|meridian/NewPage\|meridian/ThreadPage\|meridian/FieldForm\|reachability" . | grep -v node_modules
```

If App.tsx is the only remaining referrer, perform Task 6 Steps 1-3 (route redirects + App.tsx import cleanup) as part of this commit to keep the tree green, then continue Task 6 with the remaining Bucket-A deletions.

- [ ] **Step 6: Typecheck + unit tests**

```bash
cd open-energy-platform/pages && npm run check
cd open-energy-platform && npm test
```
Expected: `check:pages` green. `npm test` may fail *only* on `tests/meridian-reachability*.test.ts` / `tests/journey-taxonomy.test.ts` / `tests/meridian-labels.test.ts` (they import moved/deleted files) — those are handled in Task 6/7. If any *other* test fails, fix before committing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(v2): relocate SURFACE_REGISTRY + surfaces/** + JourneyAdmin cluster into v2/"
```

---

## Task 6: Redirect legacy routes, remove global CommandPalette, delete remaining Bucket A

**Files:**
- Modify: `App.tsx` (route redirects, remove dead lazy imports, remove `<CommandPalette />` mount at line ~790)
- Delete: remaining Bucket A files — `meridian/DealDeskPage.tsx`, `meridian/DealOfferComposer.tsx`, `meridian/DealProcessRail.tsx`, `meridian/OfferCompareGrid.tsx`, `meridian/LedgerPage.tsx`, `meridian/MeridianFrame.tsx`, `meridian/MeridianHeader.tsx`, `meridian/HorizonKpis.tsx`, `meridian/GettingStarted.tsx`, `meridian/GuidedTour.tsx`, `meridian/PlatformPulse.tsx`, `meridian/StreamInsight.tsx`, `meridian/StreamInsight.test.tsx`, `meridian/components.tsx`, `meridian/useTourState.ts`, `meridian/MeridianSurfacePage.tsx` (default component — `SurfaceBoundary` already extracted), `meridian/meridian.css`

**Interfaces:** none produced.

- [ ] **Step 1: Redirect the five legacy routes in App.tsx**

Replace these route elements (line numbers approximate — match on the `path=`):

```tsx
// /cockpit
<Route path="/cockpit" element={<Navigate to="/v2" replace />} />
// /thread/:chainKey/:id  — v2 Transaction resolves chain_key from the id
<Route path="/thread/:chainKey/:id" element={<ThreadRedirect />} />
// /ledger/:chainKey
<Route path="/ledger/:chainKey" element={<LedgerRedirect />} />
// /surface/:key  — v2 already renders SURFACE_REGISTRY at /v2/s/:key
<Route path="/surface/:key" element={<SurfaceRedirect />} />
// /deals
<Route path="/deals" element={<Navigate to="/v2/trade" replace />} />
```

The three param-carrying redirects need tiny helper components (add them near the other small helpers in App.tsx, e.g. beside `LaunchRedirect`):

```tsx
function ThreadRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/v2/t/${id}`} replace />;
}
function LedgerRedirect() {
  const { chainKey = '' } = useParams();
  return <Navigate to={`/v2/find?chain_key=${encodeURIComponent(chainKey)}`} replace />;
}
function SurfaceRedirect() {
  const { key = '' } = useParams();
  return <Navigate to={`/v2/s/${encodeURIComponent(key)}`} replace />;
}
```

Ensure `useParams` and `Navigate` are imported from `react-router-dom` in App.tsx (they already are — `Navigate` is used by the existing `/horizon` redirect and `useParams` by other detail routes; confirm).

- [ ] **Step 2: Remove the global CommandPalette mount + its lazy import**

- Delete the `<CommandPalette />` element at `App.tsx:~790` (mounted outside `<Routes>`).
- Delete the lazy import `const CommandPalette = React.lazy(() => import('./meridian/CommandPalette'));` at `App.tsx:71`.

- [ ] **Step 3: Remove all now-dead lazy imports in App.tsx**

Delete these lazy-import lines (the components are deleted in Task 5 or this task):

```
const ThreadPage          = React.lazy(() => import('./meridian/ThreadPage'));       // 35
const AtlasPage           = React.lazy(() => import('./meridian/AtlasPage'));        // 36
const NewPage             = React.lazy(() => import('./meridian/NewPage'));          // 37
const LedgerPage          = React.lazy(() => import('./meridian/LedgerPage'));       // 38
const DealDeskPage        = React.lazy(() => import('./meridian/DealDeskPage'));     // 39
const MeridianSurfacePage = React.lazy(() => import('./meridian/MeridianSurfacePage')); // 40
const JourneyCockpit      = React.lazy(() => import('./meridian/JourneyCockpit'));   // 41
```

Then grep App.tsx for any *other* remaining reference to a Bucket A component (e.g. `CockpitBoundary` at `App.tsx:646`/`50-63` wraps `JourneyCockpit`; the `/cockpit` route no longer renders it, so remove the now-unused `CockpitBoundary` wrapper and the `<Link to="/cockpit">` inside it if it becomes dead code — verify with tsc `noUnusedLocals`). Also check `return_to` default `'/cockpit'` at `App.tsx:262` — leave the default string as-is (it now redirects to /v2 via the /cockpit route) OR change to `'/v2'`; changing is cleaner. Set `App.tsx:262` default to `'/v2'`.

- [ ] **Step 4: Delete remaining Bucket A files**

```bash
cd open-energy-platform/pages/src
git rm meridian/DealDeskPage.tsx meridian/DealOfferComposer.tsx meridian/DealProcessRail.tsx \
       meridian/OfferCompareGrid.tsx meridian/LedgerPage.tsx meridian/MeridianFrame.tsx \
       meridian/MeridianHeader.tsx meridian/HorizonKpis.tsx meridian/GettingStarted.tsx \
       meridian/GuidedTour.tsx meridian/PlatformPulse.tsx meridian/StreamInsight.tsx \
       meridian/StreamInsight.test.tsx meridian/components.tsx meridian/useTourState.ts \
       meridian/MeridianSurfacePage.tsx meridian/meridian.css
```

- [ ] **Step 5: Confirm the `meridian/` folder is empty (or gone)**

```bash
cd open-energy-platform/pages/src
ls meridian 2>/dev/null || echo "meridian/ removed"
find meridian -type f 2>/dev/null
```
Expected: no files (delete the empty dir if git left it: it won't — git removes empty dirs). If any file remains, it was missed — cross-check against the Bucket A list.

- [ ] **Step 6: Typecheck**

```bash
cd open-energy-platform/pages && npm run check
```
Expected: green (no unused-import or missing-module errors).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(v2): redirect legacy meridian routes to v2 and delete Bucket A chrome"
```

---

## Task 7: Delete/repoint the affected root vitest tests

**Files:**
- Delete: `tests/meridian-reachability.test.ts`, `tests/meridian-reachability-ratchet.test.ts`
- Modify: `tests/meridian-labels.test.ts` (import path), `tests/journey-taxonomy.test.ts` (import path)

**Interfaces:** none.

- [ ] **Step 1: Delete the reachability tests (subject file deleted)**

```bash
cd open-energy-platform
git rm tests/meridian-reachability.test.ts tests/meridian-reachability-ratchet.test.ts
```

- [ ] **Step 2: Repoint the surviving tests to the relocated files**

- `tests/meridian-labels.test.ts:3`: `from '../pages/src/meridian/labels'` → `from '../pages/src/v2/labels'`
- `tests/journey-taxonomy.test.ts:4`: `from '../pages/src/meridian/journeys'` → `from '../pages/src/v2/journeys'` (the `roleData` import on the next line is unchanged)

- [ ] **Step 3: Confirm no test references a deleted path**

```bash
cd open-energy-platform
grep -rn "meridian/labels\|meridian/journeys\|meridian/reachability\|meridian/quicklinks\|meridian/lib-pure\|meridian/icons" tests | grep -v node_modules
```
Expected: empty.

- [ ] **Step 4: Run the full unit suite**

```bash
cd open-energy-platform && npm test
```
Expected: all pass (the two repointed tests now resolve; the baseline count drops only by the deleted reachability tests' cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(v2): drop reachability tests, repoint labels/taxonomy tests to v2/"
```

---

## Task 8: Update hard `/cockpit`, `/ledger`, `/thread` links in still-live source

**Files (destination-string changes only, no logic):**
`components/ActivityFeedShell.tsx:505`, `components/SuiteHero.tsx:69`, `components/onboarding/KycSubmission.tsx:403`, `components/onboarding/OnboardingWizard.tsx:331,375,404`, `components/pages/BillingRunDetailPage.tsx:79,95`, `components/pages/Briefing.tsx:103`, `components/pages/GridOutageDetailPage.tsx:116,310`, `components/pages/LenderAuditPage.tsx:94`, `components/pages/LenderWorkoutPage.tsx:178`, `components/pages/LicenceActionDetailPage.tsx:136,275`, `components/pages/LoginPage.tsx:253,277`, `components/pages/Support.tsx:171`, `components/pages/SupportTicketDetailPage.tsx:377`, `components/pages/TenantDetailPage.tsx:56,73`, `components/pages/VintageDetailPage.tsx:118,270`, `components/widgets/EsumsOmCockpit.tsx:399,431`

Plus the out-of-scope-internals launch files, **destination string only** (do NOT alter their logic): `components/launch/CapabilityPalette.tsx:17`, `components/launch/LaunchpadHomePage.tsx:245,260`, `components/launch/SubCockpitPage.tsx:304,332,542`, `components/launch/WorkstationShell.tsx:419`.

**Interfaces:** none.

**Rule:** `/cockpit` → `/v2`. `/ledger/:chainKey` links → `/v2/find?chain_key=<chainKey>`. `/thread/:chainKey/:id` links → `/v2/t/<id>`. These are the same mappings the redirects use; fixing at source removes the redirect hop/flash. Where a link is built from a variable (e.g. `` `/thread/${chainKey}/${id}` ``), rewrite to `` `/v2/t/${id}` ``; where `` `/ledger/${chainKey}` ``, rewrite to `` `/v2/find?chain_key=${encodeURIComponent(chainKey)}` ``.

- [ ] **Step 1: Enumerate every hard link**

```bash
cd open-energy-platform/pages/src
grep -rn "'/cockpit\|\"/cockpit\|\`/cockpit\|/ledger/\|/thread/" components | grep -v node_modules
```
Read each hit in context to classify it as a `/cockpit`, `/ledger`, or `/thread` link and see whether the destination is a literal or a template.

- [ ] **Step 2: Rewrite each destination**

For each file/line above, apply the mapping. Examples:
- `navigate('/cockpit')` → `navigate('/v2')`
- `<Link to="/cockpit">` → `<Link to="/v2">`
- `` navigate(`/ledger/${chainKey}`) `` → `` navigate(`/v2/find?chain_key=${encodeURIComponent(chainKey)}`) ``
- `` to={`/thread/${chainKey}/${row.id}`} `` → `` to={`/v2/t/${row.id}`} ``

Leave `components/launch/*` **logic** untouched — only swap the literal destination string.

- [ ] **Step 3: Confirm no stale hard links remain**

```bash
cd open-energy-platform/pages/src
grep -rn "'/cockpit\|\"/cockpit\|\`/cockpit\|/ledger/\|/thread/" components | grep -v node_modules
```
Expected: empty (or only `return_to`-style deep-link *parsing* that legitimately still accepts old paths — leave those; they still redirect).

- [ ] **Step 4: Typecheck + unit tests**

```bash
cd open-energy-platform/pages && npm run check
cd open-energy-platform && npm test
```
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(v2): repoint in-app cockpit/ledger/thread links to v2 destinations"
```

---

## Task 9: Browser specs — delete Meridian-only, edit shared, extend v2, add gap coverage

**Files:**
- Delete: `tests/browser/{meridian.spec.ts, meridian-ledger.spec.ts, meridian-journeys.spec.ts, meridian-advance-journeys.spec.ts, meridian-crossrole-advance.spec.ts, meridian-green-bond-canary.spec.ts, meridian-ipp-acs-create.spec.ts, do-next-stream.spec.ts, ease-capture.spec.ts}`
- Modify: `tests/browser/v2.spec.ts` (extend redirect list) and, per-file after reading their assertions, the mixed specs `full-journey-audit.spec.ts`, `workstations.spec.ts`, `login-and-tabs.spec.ts`, `month-simulation.spec.ts`, `onboarding-activation.spec.ts`, `onboarding-kyc.spec.ts`, `onboarding-tour.spec.ts`

**Interfaces:** none.

- [ ] **Step 1: Delete the purely-Meridian specs**

```bash
cd open-energy-platform
git rm tests/browser/meridian.spec.ts tests/browser/meridian-ledger.spec.ts \
       tests/browser/meridian-journeys.spec.ts tests/browser/meridian-advance-journeys.spec.ts \
       tests/browser/meridian-crossrole-advance.spec.ts tests/browser/meridian-green-bond-canary.spec.ts \
       tests/browser/meridian-ipp-acs-create.spec.ts tests/browser/do-next-stream.spec.ts \
       tests/browser/ease-capture.spec.ts
```

- [ ] **Step 2: Extend the v2 redirect assertion**

In `tests/browser/v2.spec.ts`, the `retired routes redirect to /v2` test (~line 108-112) loops over `['/horizon', '/atlas', '/new', '/trading', '/admin']`. Add the newly-redirected routes that land on `/v2`:

```ts
for (const path of ['/horizon', '/atlas', '/new', '/trading', '/admin', '/cockpit', '/deals']) {
```

`/thread/x/y`, `/ledger/x`, `/surface/x` redirect to *parametrized* v2 URLs, not `/v2`, so add a second, separate assertion block:

```ts
test('parametrized legacy routes redirect into their v2 equivalents', async ({ page, baseURL }) => {
  // seed token via addInitScript per the repo pattern (see workstations.spec.ts)
  await page.goto(`${baseURL}/thread/some_chain/abc123`, { waitUntil: 'load' });
  await page.waitForURL('**/v2/t/abc123', { timeout: 15000 });
  await page.goto(`${baseURL}/ledger/green_bond`, { waitUntil: 'load' });
  await page.waitForURL('**/v2/find?chain_key=green_bond', { timeout: 15000 });
  await page.goto(`${baseURL}/surface/admin:journeys`, { waitUntil: 'load' });
  await page.waitForURL('**/v2/s/admin%3Ajourneys', { timeout: 15000 });
});
```

Match the existing file's login/token-seeding helper (read the top of `v2.spec.ts` and reuse its `beforeEach`/auth pattern — do NOT add a second login path that would trip the auth rate-limiter).

- [ ] **Step 3: Edit the mixed specs (read first, per-file decision)**

For each of `full-journey-audit.spec.ts`, `workstations.spec.ts`, `login-and-tabs.spec.ts`, `month-simulation.spec.ts`, `onboarding-activation.spec.ts`, `onboarding-kyc.spec.ts`, `onboarding-tour.spec.ts`:

```bash
cd open-energy-platform
grep -n "/cockpit\|/horizon\|/launch\|/ledger/\|/thread/\|/deals\|MeridianFrame\|JourneyCockpit\|mer-" tests/browser/<file>
```

Read each hit and update the assertion to the v2 destination (e.g. an assertion expecting to land on `/cockpit` after login should expect `/v2`; a nav that clicks into a Meridian ledger should target `/v2/find` or a `/v2/t/:id`). If a whole test in a mixed file is Meridian-structure-specific with no v2 analogue, delete that `test(...)` block but keep the file. Do not weaken assertions to make them pass — retarget them.

- [ ] **Step 4: Identify genuine new-coverage gaps and add minimal specs**

Check what v2 e2e coverage already exists (v2.spec.ts covers Home mount, Find→Transaction link, Trade render, a redirect list). Add a spec **only** where a real gap exists — candidates:
- v2 Transaction page loaded directly by a real txn id renders the event log (v2.spec only hits a zero-UUID). Add if not covered.
- v2 Find with `?chain_key=` param filters to that chain (the `/ledger` redirect target). Add if not covered.
- `/v2/s/admin:journeys` renders the ported JourneyAdmin surface without a 5xx (guards the port-forward). Add — this is genuinely new.

Write each as a minimal Playwright test reusing v2.spec.ts's auth/token-seed helper. Do not pad coverage already present elsewhere.

- [ ] **Step 5: Run the affected browser specs against local dev**

```bash
cd open-energy-platform
npm run dev &                                   # Worker :8787
( cd pages && npm run dev & )                   # SPA :3000
# wait for both to be ready, then:
BASE=http://localhost:8787 npx playwright test tests/browser/v2.spec.ts
```
Expected: v2.spec.ts (with new redirect + gap tests) passes. Run the edited mixed specs the same way. Stop dev servers when done.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(v2): retire meridian browser specs, extend v2 redirects, add gap coverage"
```

---

## Task 10: Final validation + manual persona smoke

**Files:** none (validation only — no commit unless a fix is needed).

- [ ] **Step 1: Full type + unit gate**

```bash
cd open-energy-platform && npm run check && npm run check:pages && npm test
```
Expected: all green.

- [ ] **Step 2: Confirm `meridian/` is fully gone**

```bash
cd open-energy-platform/pages/src
test -d meridian && echo "STILL PRESENT — investigate" || echo "meridian/ retired"
grep -rn "meridian/" . | grep -v node_modules | grep -v "chain-registry-meridian"
```
Expected: `meridian/ retired`, and the only remaining `meridian` matches are `chain-registry-meridian` (backend, out of scope) and comments.

- [ ] **Step 3: Manual persona smoke (dev servers up)**

Start dev (`npm run dev` + `cd pages && npm run dev`). Log in via the SPA as **trader@openenergy.co.za** / `Demo@2024!`, then repeat as **ipp@openenergy.co.za**. For each:
- Click through Home (`/v2`), open a transaction (`/v2/t/:id`), Find (`/v2/find`), Trade (`/v2/trade` — trader; confirm ipp sees the surfaces available to it).
- Directly visit each legacy URL and confirm the landing:
  - `/cockpit` → `/v2`
  - `/thread/anychain/<a-real-txn-id>` → `/v2/t/<id>` (renders the event log)
  - `/ledger/<a-real-chain-key>` → `/v2/find?chain_key=<key>`
  - `/surface/admin:journeys` → `/v2/s/admin:journeys` (JourneyAdmin renders; admin persona for this one)
  - `/deals` → `/v2/trade`
- Confirm no console 5xx and no white-screen.

- [ ] **Step 4: Report**

Summarize: buckets retired, files deleted vs relocated, routes redirected, tests changed, and the JourneyAdmin port-forward status (temporary, admin:journeys still reachable at `/v2/s/admin:journeys`, no v2 redesign yet). Note the inert `.mer`-prefixed CSS carried verbatim as a future un-prefix opportunity. Then hand off via superpowers:finishing-a-development-branch.

---

## Self-Review

**Spec coverage:** Bucket B relocation (Tasks 1-5) ✓; route redirects incl. the corrected `/surface`→`/v2/s/:key` (Task 6) ✓; CommandPalette removal (Task 6) ✓; Bucket A deletion (Tasks 5-6) ✓; JourneyAdmin port-forward per user decision (Task 5) ✓; root test delete/repoint (Task 7) ✓; hard-link source updates (Task 8) ✓; browser specs delete/edit/extend/add (Task 9) ✓; manual smoke (Task 10) ✓.

**Corrections to the original brief baked in:** (1) `JourneyAdmin` + `journeys.ts`/`icons.tsx`/`labels.ts`/`quicklinks.ts` reclassified Bucket A→B (relocate, per user "port forward as-is"). (2) `lib-pure.ts` is a hidden Bucket B member (re-exported by `lib.ts`). (3) `/surface/:key` is a redirect to the existing `/v2/s/:key`, not a survive-in-place route; the default `MeridianSurfacePage` component dies, only `SurfaceBoundary` survives. (4) `tests/meridian-labels.test.ts` + `tests/journey-taxonomy.test.ts` are repointed, not deleted (their subject files survive). (5) The `.mer .mer-kyc-*`/`.mer .ja-*` CSS is inert today and carried verbatim.

**Type consistency:** every exported symbol name preserved (see Global Constraints list); redirect helper component names (`ThreadRedirect`, `LedgerRedirect`, `SurfaceRedirect`) are consistent between Task 6 Step 1's route table and helper definitions.

**Buildability:** ordering (shared kit → surfaces/JourneyAdmin move + coupled Bucket-A deletion → route redirects + remaining Bucket-A deletion → tests → links → specs) keeps `check:pages` green after every task; the one interior window (Task 5 Step 4→5) is explicitly folded into a single task/commit.
