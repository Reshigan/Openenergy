# Meridian Phase E — Workstation Teardown & Secondary-Route Migration

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Execute one
> role-community batch per implementer subagent → spec-compliance review → code-quality review →
> mark complete. Same cadence proven across Phase D. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Retire the 11 tab-based `*WorkstationPage` husks + `WorkstationShell` + dead `FioriShell`,
relocating every surface they still hold into the Meridian model: chain-initiation wizards fold into
the dormant Ledger `initiation` form; non-chain master-data CRUD + analytics panels become standalone
`MeridianFrame`-wrapped routes reachable via Atlas (⌘K).

**Architecture:** Phase D already migrated all 76 state-machine chains to Ledger/Thread and deleted
their per-chain ChainTab components. Phase D deliberately LEFT 414 secondary surfaces inside the
workstation pages (audit 2026-06-14). This phase disposes of all of them, then deletes the husks.
AppShell STAYS (load-bearing global chrome for every authenticated non-Meridian route). FioriShell is
already dead code. WorkstationShell dies once its 11 pages are gone.

**Tech Stack:** React SPA (`pages/`), Hono Worker backend, Meridian surfaces under `pages/src/meridian/`,
registry `src/utils/chain-registry-meridian.ts` (BACKEND code — verify via `npm run check`).

---

## The audit worklist (the contract)

Per-page disposition from the 2026-06-14 audit. Buckets:
- **A — Ledger-redundant chain listing (165):** already covered by `/ledger/:chainKey`. DELETE the tab.
- **B — Non-chain master-data CRUD (52):** EXTRACT to standalone MeridianFrame route + Atlas entry.
- **C — Chain-initiation wizard (131):** FOLD into the chain descriptor's `initiation` field.
- **D — Setup/config wizard (20):** EXTRACT to a MeridianFrame settings/config route (Atlas-reachable).
- **E — Analytics/report/ML panel (46):** EXTRACT to standalone MeridianFrame route + Atlas entry.

Per-page A/B/C/D/E counts (audit): Admin 7/4/1/7/10 · Carbon 16/1/7/1/2 · Epc 5/2/3/1/1 ·
Esco 3/0/3/1/1 · GridOps 9/3/11/1/4 · Ipp 68/9/36/5/6 · Lender 11/1/20/1/5 · Offtaker 9/9/17/1/3 ·
Regulator 11/3/6/1/2 · Support 7/2/6/1/4 · Trader 9/5/18/1/4 · EsumsOm 9/13/0/0/4.

**30 Bucket-A items lack a chainKey in-file** (chainKey lives inside the imported `*ChainTab`
component or on an `/esums/*` endpoint). Each MUST have its chainKey confirmed (grep the component,
or the `MERIDIAN_CHAINS` registry) before its tab is deleted — a wrong delete orphans a live surface.

**Trader order surfaces are NOT chains** (Open orders `/trading/orders`, Place-first-order,
Post-trade exceptions `/trading/exceptions`) — treat as Bucket B (extract), never delete as A.

---

## Mechanism recipes (verified 2026-06-14)

### Recipe C — fold an initiation wizard into Ledger
Set `initiation` on the chain's descriptor in `src/utils/chain-registry-meridian.ts`:
```ts
initiation: {
  label: 'New <thing>',
  path: '/api/<chain-route>',          // chain-root CREATE endpoint, no :id; what the wizard already POSTs to
  fields: [ /* ActionFieldSpec[] — map the wizard's fields, same derivation rules as Phase D */ ],
},
```
`LedgerPage` then auto-renders a "+ New" button + a `FieldForm` drawer that POSTs the coerced values
to `path` (with `/api` stripped, no `:id`). No frontend change. **The create endpoint must already
exist server-side and accept the field `key`s as its body** — confirm against the route file.
Field-derivation rules are IDENTICAL to the Phase D template (enum/string/evidence/number+unit/date/
boolean; `required:true` only where the route 400s or the wizard marked it required). Dedupe the
~15 duplicate-intent wizard pairs the audit flagged — pick ONE canonical create endpoint per chain.

### Recipe BDE — extract a tab to a standalone MeridianFrame route
1. The component is already a self-contained tab body. Give it a route in `pages/src/App.tsx`, mounted
   BARE inside `<ProtectedRoute>` (no `<Layout>`/`<AppShellLayout>` wrapper), wrapped in `<MeridianFrame>`.
2. Add an Atlas registry entry so it is ⌘K-reachable (Atlas function library — find its source list).
3. Remove the tab object + its import from the workstation page.
Shared connector/panel components reused across N workstations (e.g. `GovernmentFilingConnectorTab`)
get ONE route, not N.

### `MeridianFrame` (built in E0 — does not exist yet)
Convention today (no wrapper): `import './meridian.css'` + `<div className="mer …">` +
`<MeridianHeader ctx={…} />` + bare App.tsx mount. E0 packages that into a reusable
`pages/src/meridian/MeridianFrame.tsx` so the ~98 extracted routes share one chrome.

---

## Tasks

### Task E0 — Build `MeridianFrame` + resolve unknowns

**Files:**
- Create: `pages/src/meridian/MeridianFrame.tsx`
- Reference: `pages/src/meridian/LedgerPage.tsx`, `pages/src/meridian/MeridianHeader.tsx`, `pages/src/meridian/meridian.css`

- [ ] **Step 1:** Build `MeridianFrame({ title?, ctx?, children })`: imports `./meridian.css`, renders
  `<div className="mer <variantClass>">` + `<MeridianHeader ctx={ctx} />` + a `<main>` holding `children`.
  Mirror the chrome LedgerPage/HorizonPage apply. Keep it a thin presentational wrapper.
- [ ] **Step 2:** Resolve the `ScadaConnector` unknown — grep `pages/src` for the real component name
  (audit could not find `ScadaConnector`; IppWorkstationPage references `scada-connectors`). Record the
  true component path for E2.
- [ ] **Step 3:** `npm run check:pages` → 0. Commit `feat(meridian): MeridianFrame wrapper for Phase E secondary routes`.

### Tasks E1.x — Fold initiation wizards (Recipe C), per role-community batch

One batch per role community, mirroring Phase D batch order. Each batch: for every Bucket-C wizard in
that community, derive `initiation` + set it on the descriptor, dedupe duplicates, delete the wizard
from the workstation page. Backend (`npm run check`) + SPA (`npm run check:pages`) both 0, then commit.

- [ ] **E1.1 Lender** (20 C) · **E1.2 Trader** (18 C) · **E1.3 IPP/Grid** (36+11 C) ·
  **E1.4 Offtaker** (17 C) · **E1.5 Carbon** (7 C) · **E1.6 Regulator** (6 C) ·
  **E1.7 OEM-Support/Esco/Epc** (6+3+3 C) · **E1.8 Admin** (1 C).
- Per batch Definition of Done: every input-carrying create-wizard has a matching descriptor
  `initiation`; field `key`s verified against the route body; duplicates collapsed to one endpoint;
  wizard removed from the page; both checks 0.

### Tasks E2.x — Extract non-chain content to MeridianFrame routes (Recipe BDE), per community

For each Bucket-B/D/E surface: standalone route + Atlas entry + remove tab. Shared components → one route.

- [ ] **E2.1 Admin** (4 B + 7 D + 10 E) · **E2.2 EsumsOm** (13 B + 4 E — biggest, SuitePage not WorkstationShell) ·
  **E2.3 Trader** (5 B + 4 E + connectors) · **E2.4 Support** (2 B + 4 E + ML panels) ·
  **E2.5 GridOps** (3 B + 4 E) · **E2.6 Offtaker** (9 B + 3 E) · **E2.7 IPP** (9 B + 6 E + connectors) ·
  **E2.8 Lender/Regulator/Carbon/Esco/Epc** (remaining B/D/E).
- Shared connectors (`GovernmentFilingConnectorTab`, `MqttOpcuaConnectorTab`, `StrateSwiftConnectorTab`,
  `SapOracleErpConnectorTab`, the ML tabs) get ONE route each, mounted once, referenced by Atlas.
- Per batch DoD: every B/D/E surface reachable at a standalone route + in Atlas; tab removed; checks 0.

### Tasks E3.x — Delete the husks

By this point each workstation page should hold ZERO remaining tabs. Verify, then delete.

- [ ] **E3.1** For each of the 11 `*WorkstationPage.tsx`: confirm no remaining tab objects (grep
  `chainKey:` + tab arrays empty). Delete the page, its `*_WIZARDS`/`*_REPORTS` constants, and its
  App.tsx route(s). Repoint any nav/CTA deep-link to `/horizon` or the relevant `/ledger/:chainKey`.
- [ ] **E3.2** Delete `WorkstationShell.tsx` + companions that become unused (`WizardModal`, `WizardShell`,
  `AuditPanel`, `IncomingPanel`, `InsightsPanel` — grep each; delete only if zero importers remain).
- [ ] **E3.3** Delete `FioriShell.tsx` after clearing its 4 non-route refs (OEIcon, ChainCard, LtmLogo,
  ServiceContractChainTab type-imports).
- [ ] **E3.4** KEEP `AppShell.tsx` (load-bearing). `npm run check:pages` → 0. Commit.

### Task E4 — Final review + finish

- [ ] **E4.1** Dispatch a final whole-implementation code-quality reviewer over the full Meridian diff.
- [ ] **E4.2** Address findings.
- [ ] **E4.3** superpowers:finishing-a-development-branch.

---

## Definition of done (phase)

- [ ] All 131 Bucket-C wizards folded into Ledger `initiation` (or dropped as confirmed duplicates).
- [ ] All 98 Bucket-B/D/E surfaces live at standalone MeridianFrame routes + Atlas-reachable.
- [ ] All 165 Bucket-A tabs deleted; the 30 chainKey-less ones verified before deletion.
- [ ] 11 workstation pages + WorkstationShell + FioriShell deleted; AppShell retained.
- [ ] `npm run check` and `npm run check:pages` both 0.
- [ ] No orphan importers; no dangling `?tab=` deep-links.
