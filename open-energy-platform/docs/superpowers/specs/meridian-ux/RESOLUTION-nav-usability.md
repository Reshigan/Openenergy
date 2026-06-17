# Meridian — simulated frontend test & nav + usability resolution

> **Companion to** [`../2026-06-17-meridian-frontend-coverage-onboarding-design.md`](../2026-06-17-meridian-frontend-coverage-onboarding-design.md) (the remediation plan, workstreams WS-A…WS-G) and to [`README.md`](README.md) (the intended-experience tree).
> This doc is the **measured gap + fix order**. It answers request 2 verbatim: *"a full user simulated test on the frontend and a plan to resolve for all roles and all functionality with navigation and usability the key criteria."*

**Status:** plan/evidence only — brainstorming HARD-GATE. No implementation until the consolidated spec is approved.

---

## Method

Two independent passes, cross-checked:

1. **Deterministic matrix** (audit `w08jywqqh`, 22 agents) — static analysis of registry × roleData × SURFACE_REGISTRY. Produced F1–F5 reachability findings + 12 usability findings (see parent spec §"Current state").
2. **Behavioral journey simulation** (`w8msxa32l`, 16 agents, 12 roles + 4 cross-cutting checks, ~1.42M tokens, 506s). Each role agent **traced the signature journey** Horizon → Atlas/⌘K → Ledger → Thread against the actual source, classifying every tile and lane and recording per-step friction P0–P3.

**Resolution rule that matters (existence, not truthiness):** `AtlasPage.tsx:56` and `CommandPalette.tsx:80` decide a tile is reachable with a **shallow** check — `!!f.chainKey || !!f.route || SURFACE_REGISTRY['<role>:<key>']`. It never verifies the `chainKey` exists in `MERIDIAN_CHAINS` or that the `route` is mounted. So a tile splits three ways:

- **REACHABLE** — target genuinely resolves (chainKey in registry / route mounted / surface body present).
- **DEAD (hidden)** — no target at all → silently filtered out, vanishes from Atlas with no explanation.
- **DANGLING (false-positive)** — has a `chainKey`/`route` string that does **not** resolve → **passes the filter, renders as a clickable tile, then 404s on click.** This is the worst class for the user: it looks like the platform works, then breaks mid-journey.

---

## The 12-role matrix

| Role | Tiles | Reachable | Dead (hidden) | Empty/broken | Lanes | Lane nav? | Label leaks | Journey P0 | P1 |
|---|---:|---:|---:|---:|---:|:--:|---:|---:|---:|
| admin | 33 | 26 | 7 | 0 | 0¹ | ✗ | 3 | 1 | 2 |
| trader | 24 | 20 | 4 | 5 | 3 | ✗ | 3 | 5 | 5 |
| ipp_developer | 76 | 76² | 0 | 0 | 14 | ✗ | 6 | 0 | 1 |
| carbon_fund | 25 | 24 | 1 | 0 | 6 | ✗ | 0 | 0 | 1 |
| offtaker | 42 | 40 | 2 | 1 | 5 | ✗ | 0 | 0 | 2 |
| lender | 26 | 17 | 9 | 0 | 5 | ✗ | 0 | 0 | 2 |
| grid_operator | 39 | 31 | 8 | 0 | 4 | ✗ | 3 | 0 | 2 |
| regulator | 24 | 23 | 0³ | 0 | 5 | ✗ | 0 | 0 | 0 |
| support | 24 | 24 | 0 | 0 | 4 | ✗ | 0 | 0 | 1 |
| esco | 35 | 35 | 0 | 0 | 6 | ✗ | 0 | 0 | 0 |
| esums_owner | 37 | 37 | 0 | 0 | 6 | ✗ | 0 | 0 | 0 |
| epc_contractor | 11 | 9 | 2 | 0 | 3 | ✗ | 0 | 0 | 1 |

¹ Admin holds **no lanes of its own**; Horizon gives it a role-switcher to view any other role's board.
² **False-positive reachable.** ipp's 76 "reachable" tiles include dangling chainKeys (`ipp_schedule`, `ipp_evm`, `dfr`, `mir`, `ipp_progress_claim`, …) that pass the shallow filter and **404 on click**. Cross-referenced with audit F5 (~39 dangling). This is precisely the "very difficult for an IPP to go through a journey" complaint.
³ regulator's one dead tile (`stage_gates_view`) is the lone discoverable-but-unreachable; sim counted it under top-fixes, not the dead column.

**Universal result: `Lane nav? = ✗` for every one of the 12 roles.** `HorizonPage.tsx:170` renders each lane label as a collapse/expand `<button>`, never a link to `/ledger/:chainKey`. No role can click a lane header to see its case list. This is the single most repeated friction across the whole sim.

---

## Mapping to the headline UI directive (the user's exact words)

| User said | Sim/audit finding | Where it's resolved |
|---|---|---|
| "it has atlas everywhere … the roles are showing everything" | Header crosscut P1: National Dashboard + Intelligence quicklinks shown to **all** roles though endpoints are admin/regulator-only; Deals/Reports/ESG ungated; ⌘K Atlas shown unconditionally. Admin role-switcher exposes every role's board. | WS-A (header role-gating) + crosscut §3 below |
| "pages dont work" | DEAD (hidden) tiles ~39 + EMPTY/broken ~6 + DANGLING ~39 (404 on click). | WS-A1–A4 + integrity guard A6 |
| "the left part of the screen is just text with w numbers" | Label leaks: snake_case lane labels (`STAGE GATES`, `RISK QUALITY`, `COST EVM`, `DFR`, `MIR`, `WBS SCHEDULE`); `cleanLabel` strips `(W###)` but multi-wave lists still leak `W12`. | WS-C (labels) + per-role lane-label fixes below |
| "none of the labels are clickable" | **Universal** — lane headers are collapse-only, not links to Ledger (all 12 roles). | WS-A (lane-header → Ledger link) — top universal fix |
| "very difficult for an ipp to go through a journey" | ipp_developer: 76 tiles, 14 lanes, 6 label leaks, **dangling chainKeys 404 mid-journey**, Ledger-initiation trap (chains with no `ChainInitiation` show list-only, no +New). | WS-A (dangling cleanup) + Ledger +New fallback |
| "there is no logout" | Sign out **exists** in the avatar menu (audit usability #7); discoverability is the real gap — avatar `role="menu"` lacks ARIA/keyboard support; no confirmation. | WS-C (avatar menu a11y) |
| "the text input are not drop downs for fields already in the db on all forms" | FieldForm crosscut P1: 55+ critical `*_id` / methodology / asset fields typed as `type:'string'` instead of `type:'lookup'` though the component already renders lookups as populated `<select>`. | WS-C1 (registry dropdown data) + crosscut §1 below |
| "on the O&M we need the best possible predictive fault analysis and very accurate anomaly detection" | Functional-depth directive (esums/support O&M). Out of nav+usability scope; tracked separately under the Esums-predictive-vs-NTT program (Wave 71 asset prognostics). | Out of scope here — see parent §"Out of scope" |

---

## Universal fixes (apply once, benefit every role)

These four land in shared chrome and clear the bulk of the matrix:

- **U1 — Lane headers navigate to Ledger.** Wrap the `HorizonPage.tsx:170` lane label in a `Link` to `/ledger/:laneChainKey`, keep collapse/expand on a **separate** chevron. Requires a `lane.key → primary chainKey` map (most lanes have a dominant chain). Fixes the universal "none of the labels are clickable." *(WS-A)*
- **U2 — Atlas/⌘K reachability becomes an existence check.** Replace the shallow truthiness in `AtlasPage.tsx:56` / `CommandPalette.tsx:80` with `chainKey ∈ MERIDIAN_CHAINS ∧ route ∈ mountedRoutes ∧ SURFACE_REGISTRY[...]`. Converts ~39 DANGLING false-positives from "404 on click" to either correctly-hidden or correctly-shown. *(WS-A5)*
- **U3 — CI integrity guard.** Build-time assertion that every `roleData` tile resolves to a real chain/route/surface, and every laned chain has a front-door tile. A typo like `ppa_contrcat` fails CI instead of shipping a clickable 404. This is the durable fix — it freezes the dead-tile count at zero going forward. *(WS-A6, lands first)*
- **U4 — Shared Dialog primitive.** One focus-trapping, background-inerting, focus-restoring `Dialog` replaces the 4 independent veils (Ledger +New, Thread action, DealDesk composer, header avatar/CommandPalette). Fixes modal a11y crosscut P1 for all surfaces at once. *(WS-C)*

---

## Per-role resolution

Each role lists its DEAD/EMPTY/DANGLING tiles, top P0/P1 journey friction, and the fix. All "remove or back" decisions mean: **either** give the tile a real chain/route/surface **or** delete it from `roleData` — never leave a target-less tile.

### admin
- **Dead (7, hidden):** Users · Cron jobs · Trading operations · Settlement operations · Market halt controls · ESG reporting · Contract templates — all no chainKey/route/surface.
- **Label leaks (3):** when admin role-switches, lane headers fall through to raw snake_case (`STAGE GATES`, `RISK QUALITY`, `CONSTRUCTION`) because admin domain keys never match the viewed role's lane keys.
- **P0:** the 7 admin-platform functions are invisible in Atlas; an admin with old-UI muscle memory finds nothing and assumes the platform is broken.
- **P1:** role-switched lane headers ugly snake_case; 7 tiles silently filtered with no "deferred" affordance.
- **Fix:** back the 7 admin tiles with surfaces (user-admin, cron, market-halt are real admin endpoints — high value) or remove; when role-switched, use the **target role's** `getRoleConfig()` for lane-label lookup; add a "View board as:" label above the switcher.

### trader
- **Dead (4):** Positions (`active_trading:positions`) · Trade blotter (`active_trading:trades`) · Risk dashboard (`risk_margin:risk`) · Margin calls (`risk_margin:margin`) — no backing.
- **Empty/broken (5):** Settlement · Post-trade exceptions · Imbalance settlement · Black start · ESG/sustainability → `/surface/*` keys with no body.
- **Label leaks (3):** `POST TRADE`, `RISK MARGIN`, `COMPLIANCE REPORTING`.
- **P0 (×5):** core Active-Trading + Post-trade functions hidden/broken; Position-limit and Trade-allocation journeys **do** work end-to-end (verified Ledger→Thread→action→cascade) — proves the pattern, isolates the gaps to missing surfaces.
- **Fix:** add `route`/surface for orders/positions/trades/settlement/margin; **remove dead duplicates** `black_start` (dup of `black_start_chain`) and `benchmark_transition` (listed twice); expose the 7 backend-laned compliance chains (`settlement_fail`, `fsca_*`, `isda_agreement`, `pnl_attribution`, `pretrade_credit_check`, `cross_border_trade`) as tiles.

### ipp_developer *(headline "hard journey")*
- **Dangling (the real story):** 76 tiles all pass the shallow filter, but lane/feature keys `ipp_schedule`, `ipp_evm`, `dfr`, `mir`, `ipp_progress_claim`, `subcontractors`, `wbs_schedule`, `handover_dossier` reference chains/keys that don't resolve → **404 on click mid-journey** (corroborated by audit F5).
- **Label leaks (6):** `COST EVM`, `DFR`, `MIR`, `HANDOVER DOSSIER`, `SUBCONTRACTORS`, `WBS SCHEDULE`.
- **P1 — Ledger Initiation Trap:** chains with no `ChainInitiation` render `/ledger/:chainKey` list-only with **no +New** — the user lands in a read-only dead end and must back out to Deal Desk.
- **Fix:** this role is the prime beneficiary of **U2** (existence check turns the silent 404s into honest hide/show) and **U3** (guard prevents recurrence); rename ipp lane keys to friendly labels (`cost_evm→finance`, `dfr/mir/subcontractors/handover_dossier→construction`, `wbs_schedule→project_controls`); add a Ledger +New fallback ("New cases created via Deal Desk →") for non-initiable chains.

### carbon_fund
- **Dead (1):** OTC carbon trading (`carbon_trading`) — no backing; **dangling-class** (passes filter, 404 on click).
- **P1:** the OTC trading tile looks reachable then fails.
- **Fix:** back `carbon_trading` with a chain/route/surface or remove; add `ChainInitiation` to `carbon_registration` so +New works from the Ledger.

### offtaker
- **Dead (2):** Procurement options · PPA variations — no backing.
- **Empty/broken (1):** Annual reports → `/surface/annual_reports` (no body).
- **P1 (×2):** Annual-reports tile 404s; Scope-2 emissions tile destination ambiguous.
- **Fix:** remove `procurement_options`/`ppa_variations` (cognitive debt) or back them; register `offtaker:annual_reports` surface or delete; clean up duplicate REC tiles; backfill `quantumCol`/`eventsTable`/`initiation` on the bare PPA chains so Thread timeline + duty-stream ranking + +New all work.

### lender
- **Dead (9):** Portfolio overview · Risk dashboard · ESG/DFI monitoring · Benchmark transition · Large-exposure concentration · IE certifications · Facility reports · Covenant summary · ESG carbon reports — all feature-keys with no backing (highest dead-count of any role).
- **P1 (×2):** lane headers don't link to Ledger; 9 dashboard/report tiles hidden — lender's analytic surface is almost entirely absent from Atlas.
- **Fix:** audit the 9 against roadmap — back the portfolio/risk/concentration dashboards (core lender value) and the IE-certification + covenant + facility reports; delete any genuinely deferred; enrich 409 duty-stream errors with valid-next-action hints.

### grid_operator
- **Dead (8):** Curtailment events · Ancillary service events · Outage responses · Wheeling & TPA charges · NERSA statutory reporting · Interconnection studies · Levy compliance · Market rule changes.
- **Label leaks (3):** `GRID OPERATIONS`, `CONNECTION QUEUE`, `COMPLIANCE` (proper labels rendered, flagged as fallback-derived — verify friendly labels are defined, not coincidental).
- **P1 (×2):** 8 prototype tiles silently hidden; maintainers see clutter, users see gaps.
- **Fix:** these 8 map to **real grid chains** (curtailment, ancillary, outage, wheeling, levy) — add the `chainKey` to wire them up (high value), or remove the genuine prototypes (`market_rules`, `interconnection`); wrap surfaces in a retry error boundary.

### regulator
- **Clean** — 24 tiles, 23 reachable, 0 dead, 0 leaks, 0 P0/P1.
- **Only fix (P2):** remove or back the `stage_gates_view` tile (discoverable-by-title, unreachable-by-navigation).

### support
- **Clean reachability** — 24/24 reachable, 0 dead.
- **P1:** Thread cross-chain linkage invisible — resolving a work order silently feeds upstream escalation chains (W25 HSE / W26 cyber → regulator inbox) with no UI cue.
- **Fix:** split `tickets` (CRUD browse) vs `ticket_chain` (lifecycle) with clear descriptions; add "Create from lane" context action on Horizon lane headers; surface cross-chain cascade hints in Thread; the O&M anomaly→work-order quick-create belongs to the predictive-O&M program.

### esco / esums_owner
- **Clean** — 35/35 and 37/37 reachable, 0 dead, 0 leaks, 0 P0/P1.
- **Fixes (P2/P3):** Operations + Data-Integrations domains exist but no chains reference them → either remove or back with lightweight tracking surfaces; add chain-vs-surface tile visual distinction; `cleanLabel` drops `& AI` suffix (`ASSET HEALTH & AI` → `ASSET HEALTH`) — use the full roleData label on Horizon; per-role Thread field-visibility (hide `quantum_zar`/`covenant_ref` from O&M roles).
- **esums_owner P1 (dev-guard):** add SURFACE_REGISTRY init-time validation that every roleData feature without chainKey/route has a matching surface entry → dev-time error before deploy (this is the local form of **U3**).

### epc_contractor *(newest role)*
- **Dead (2):** Submittals · Change Orders — no chainKey/route/surface → Document-Control domain shows a gapped 2/4 grid.
- **P1:** gapped domain on the newest role's first impression.
- **Fix:** back Submittals/Change Orders with chains (they exist conceptually in the EPC document-control set) or mark WIP; chain-vs-surface tile distinction so RFIs/Technical-Queries (surfaces) don't masquerade as chain tiles.

---

## Cross-cutting resolution (4 checks)

### 1. FieldForm — DB-backed dropdowns vs free text *(WS-C1)*
`FieldForm` + `FieldSpec` already support `type:'lookup'` (renders a `<select>` populated from whitelisted `/api/ledger/lookup/*`). The gap is **registry data, not the component**: 55+ critical fields are typed `string`, forcing hand-typed IDs that fail with FK violations at submit:
- **P1:** `es_monitor_id` (W12), `asset_id` (W34 transmission), `brp_id` (W83 imbalance, 200+ BRPs).
- **P2:** `oem_id`/`supplier_party_id` (W66 — typo class `oem_sungrow`/`OEM_SUNGROW`/`sungrow` breaks W15/W63 cascade), `respondent_party_id`/`asset_id` (W71), cross-chain `linked_wo_id`/`linked_warranty_claim_id`/`holder_id`, `methodology_id` (VM0042/ACM0002 curated registries), `interconnector_id` (W82).
- **P3:** no client-side stale-lookup revalidation.
- **Fix:** flip these to `type:'lookup'` against the whitelisted `LOOKUP_SOURCES` allow-list (`:source` selects a static whitelist entry — never interpolated; values bind only to `?`). Mechanical, high-leverage, directly answers "text inputs are not drop downs."

### 2. Atlas reachability depth + ⌘K *(WS-A5 + A6 — = U2 + U3)*
- **P1:** shallow `isReachable` (AtlasPage:56) + identical `targetFor` (CommandPalette:80) → 39 dead-end tiles with chainKeys to non-existent chains render as hits, break on click.
- **P1:** no CI integrity guard — typos ship silently.
- **P2:** asymmetric failure UX — LedgerPage shows bare "failed to load + Retry"; MeridianSurfacePage shows graceful "Surface not available + Open Atlas". Unify on the graceful pattern with an "Open Atlas" escape hatch.

### 3. Header chrome — role-gating + "atlas everywhere" *(WS-A)*
- **P1:** National Dashboard quicklink shown to all roles, endpoint admin-only.
- **P1:** Intelligence quicklink shown to all roles, endpoint admin/regulator-only.
- **P2:** Deals quicklink ungated though deal types are role-gated server-side; Reports/ESG lack frontend gating; no breadcrumb/role/location context cue.
- **P3:** Logout has no confirmation; ⌘K Atlas shown even to roles with no searchable features.
- **Fix:** gate every header quicklink by the same role predicate the backend enforces; add a role/location context cue. This is the literal "atlas everywhere / roles showing everything" complaint.

### 4. Modal focus-trap + keyboard a11y *(WS-C — = U4)*
- **P1:** veils (+New, Thread actions, DealDesk composer/compare) **lack focus trap** — Tab escapes to background; backgrounds **not marked `inert`**.
- **P1:** **no shared Dialog primitive** — 4 duplicated veil implementations.
- **P2:** Escape handler on `window` not the veil (nested-overlay conflict); focus-restore fails if trigger scrolled away; avatar dropdown no trap/auto-focus; `--ink3` on `--line` = 4.25:1, **below WCAG AA 4.5:1**.
- **Fix:** one shared `Dialog` (trap + inert + Escape-on-veil + focus-restore) replaces all four; bump `--ink3` lightness to clear AA.

---

## Prioritized fix order (navigation + usability as key criteria)

Ordered by reach × severity. Maps onto parent workstreams.

| # | Fix | Class | Roles helped | WS |
|---|---|---|---|---|
| 1 | **U3** CI integrity guard (resolve-or-fail every tile/lane) | nav | all | WS-A6 |
| 2 | **U2** Atlas/⌘K existence check (kill 404-on-click) | nav | ipp + all | WS-A5 |
| 3 | **U1** Lane headers → Ledger links (+ separate collapse chevron) | nav | **all 12** | WS-A |
| 4 | Header quicklink role-gating ("atlas everywhere") | nav | all | WS-A |
| 5 | Dead/empty/dangling tile disposition (back or remove) — lender 9, grid 8, admin 7, trader 9, epc 2, offtaker 3, carbon 1, regulator 1 | nav | 8 roles | WS-A1–A4 |
| 6 | **WS-C1** flip 55+ `*_id`/methodology fields to `lookup` | usability | all forms | WS-C1 |
| 7 | **U4** shared Dialog (focus-trap/inert/restore) + `--ink3` contrast | usability/a11y | all | WS-C |
| 8 | Label-leak cleanup (friendly lane labels; `cleanLabel` multi-wave + `& AI`) | usability | admin, trader, grid, ipp, esums | WS-C |
| 9 | Ledger +New fallback for non-initiable chains | nav | ipp, carbon, offtaker | WS-A |
| 10 | Per-role Thread field-visibility; cross-chain cascade hints; duty-stream busy/confirm | usability | support, esco, all | WS-C/F |

Items 1–5 are navigation; 6–10 are usability — both the user's stated key criteria, addressed in that priority. All P0–P3 land before go-live (parent decision 3).

---

## Provenance

- Behavioral sim: workflow `w8msxa32l` (12 role agents + 4 crosscut agents, clean run, `logs: []`). Raw result archived in the run task output.
- Deterministic audit: `w08jywqqh` (parent spec §"Current state").
- An earlier sim run (`wiovmtp6n`) produced 10 of 12 roles; admin + ipp_developer failed StructuredOutput there and are sourced from `w8msxa32l`, which completed all 12.
