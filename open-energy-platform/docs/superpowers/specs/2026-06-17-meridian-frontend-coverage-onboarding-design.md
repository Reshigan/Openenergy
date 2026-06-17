# Meridian Frontend Coverage, Onboarding & Neatening — Design

> **Status:** Design / spec. Plan-first gate. No implementation until this spec is approved and an implementation plan is written (`writing-plans`).
> **Date:** 2026-06-17 · **Branch:** `meridian-redesign` · **Target:** prod `oe.vantax.co.za`

## Goal

Make **every** backend capability reachable and usable from the Meridian frontend, give **every role and every component** a full digital onboarding, and neaten all frontend elements so any role can complete a journey without friction. Resolve the headline complaint verbatim: Atlas-everywhere clutter, dead pages, "everything shown to every role", left-rail "W-number" text, unclickable labels, hard IPP journeys, missing dropdowns for DB-backed fields, weak O&M predictive analysis.

This is the front-door layer on top of the existing 168-chain backend — no chain rewrites. It exposes, guides, and neatens what already exists.

## Scope decisions (resolved 2026-06-17)

1. **Invisible-chain disposition → best IA.** Owned/initiator chains get an Atlas tile; counterparty-read chains become **Thread-only** (reached from the two-sided Thread, not a flat tile); the 29 `ipp_*` dossier sub-documents group under **one "Project Dossier" surface** with sections, not 29 flat tiles.
2. **Onboarding → entire system.** Per-role + per-component first-run guidance, provisioning a first entity for all 10 roles, checklist/progress, **and** sandbox practice transactions — with two carve-outs below.
3. **Go-live scope → complete P0–P3, all use cases.** The full backlog lands before declaring go-live; every role × every chain × counterparty combination is covered.

### Hard constraints carried into every workstream

- **SQL identifier safety (IN FORCE):** every table/column/terminal-status SQL identifier comes from a static code literal (`MERIDIAN_CHAINS`, `LOOKUP_SOURCES`). Request input only ever flows through parameterized `?` binds. New dropdowns route through a whitelisted `GET /api/ledger/lookup/:source` with a static `LOOKUP_SOURCES` allow-list.
- **PII encryption (HARD-GATE):** the KYC / market-access gate handles PII. Its encryption design is presented separately and **not built autonomously**. This spec designs the *flow*; the *storage/encryption* is a separate approval.
- **Sandbox vs real data (Goldrush actuals only):** sandbox practice transactions live in a clearly-isolated **demo tenant** and **never** INSERT synthetic kWh/billing/telemetry into real tenants. NXT Energy's 10 Goldrush C&I sites stay on real Solax actuals, untouched.
- **KYC / market-access gate:** flow designed here; gating users out of real markets is **build-gated** behind the PII approval.

---

## Current state (audit w08jywqqh, 22 agents)

Deterministic matrix: **168 registry chains · 12 roles · 124 surface keys · 63 surface bodies.** Findings verified against source.

### Reachability gaps

| # | Finding | Count | Note |
|---|---|---|---|
| F1 | Chains with **no Atlas tile anywhere** | 49 | server-permissioned, `/ledger` route exists, no front door; 29 are `ipp_*` dossier sub-docs |
| F2 | Per-role **laned-but-unreachable** chains | ipp 61 · regulator 13 · support 10 · trader 7 · lender 7 · grid 5 · offtaker/carbon/esco 1 | laned (server-visible) but role's `roleData` has no `feature.chainKey` |
| F2b | **Admin** laned on only **4** of ~207 chains | 203 invisible | entire "Trading Ops" domain renders empty; NERSA market-halt control unreachable |
| F3 | Dead surface key | 1 | `regulator:government-filing` (hyphen); likely same class in epc `submittals`/`change-orders` |
| F4 | Atlas tiles **resolving to nothing** (no body) | 40 | section returns `null`; whole domains vanish |
| F5 | **Dangling tiles** (chainKey, no registry backing) | ~39 | `ipp_schedule`, `ipp_evm`, `milestone_variance_report`, `dfr`, `punch_list`, `submittal_rfi` — Atlas renders them, click → ambiguous `/ledger` error |

F4 + F5 together are the true dead-tile total. F1 + F2 + F2b are an **RBAC-grants-but-UI-hides** mismatch: data + route + permission all exist; only the navigational entry is missing.

### Usability findings (12; full detail in audit)

Highest-leverage first:

1. **DB-backed fields as free text** — only ~6% addressed (74 `lookup` fields vs 1275 `string`; 32+ raw `*_id` text inputs e.g. `asset_id`, `oem_id`, `respondent_party_id`, `interconnector_id`, `retirement_id`, `ticket_id`). `FieldForm` already renders `lookup` as a populated `<select>`; the gap is registry **data**, not the component.
2. **Modal a11y** — every veil (CommandPalette, Ledger +New, Thread action, DealDesk) sets `aria-modal="true"` but **none** traps focus, moves initial focus in, or inerts the background. One shared Dialog primitive fixes all four.
3. **`--ink3` contrast** — meaningful secondary text at 9–10.5px in `oklch 0.50` sits below WCAG AA 4.5:1.
4. **Thread raw record dump** — `raw.*` rendered verbatim (foreign keys, JSON, ISO timestamps) as the primary record body.
5. **Header quicklinks role-blind** — Deals/ESG/Reports/Intelligence/National shown to every role.
6. **Empty header ctx** — Layout-wrapped + `/surface/:key` routes show bare wordmark, no wayfinding.
7. **Avatar menu** — `role="menu"` without ARIA keyboard support. ("No logout" is **resolved** — Sign out is in this menu.)
8. **Veil forms no initial focus.**
9. **`cleanLabel`** mishandles multi-wave lists (`Esums chains W12 · W24` → leaks `W12`).
10. **Onboarding exits via retired `/launch/:role`** (extra redirect hop; breaks if shim removed).
11. **Horizon duty-stream actions** POST with no busy/confirm → double-fire on fast double-click.
12. **Admin Atlas vs Horizon role mismatch** — admin's Horizon role-switcher isn't read by Atlas/⌘K/NewPage.

### Onboarding gaps

- **esco + epc_contractor have NO step sequence** → `getOnboardingState` throws (`onboarding.ts:93-95`). 9 roles configured.
- Provisioning creates a real first entity for **only 2 of 10 roles**.
- Per-component onboarding essentially absent (1 chain tour, 1 help card).
- Two disjoint onboarding stores (DB `onboarding_step`/`onboarding_data` vs SPA tour state) never reconcile.
- No checklist, progress surfacing, manifest, completion gating, KYC/market-access gate, sample/sandbox transaction; acquisition/email funnel broken.

### Six directive-relevant modalities never measured (critique)

Mobile/responsive (zero `@media` in per-page TSX), deep-link integrity (unknown key = ambiguous error), i18n/ZAR locale (hand-rolled `fmtZar`, money inferred from column-name regex), print/export (2 of 63 surfaces), a11y never actually run (no axe/Lighthouse), DealDesk deal-type↔chain coverage.

---

## Design

Seven workstreams. A–C are the coverage/onboarding/neatening core; D–G are the critique's unmeasured modalities. All land before go-live.

### WS-A — Reachability & IA remediation

**A1 — Owned vs counterparty disposition (per chain).** Add a `frontdoor` field to each `MERIDIAN_CHAINS` descriptor (static literal): `'tile' | 'thread-only' | 'dossier:<group>'`.
- `tile` — role is a genuine owner/initiator → Atlas tile + Horizon lane.
- `thread-only` — role only sees it as a counterparty → reachable from the two-sided Thread side-panel; **no** flat tile. (Splits F2's inflated 61: e.g. `covenant_certificate`, `loan_default`, `ppa_take_or_pay` are counterparty-read for ipp_developer.)
- `dossier:project` — the 29 `ipp_*` sub-documents group under one **Project Dossier** surface (sections/tabs), not 29 tiles.

Disposition is **explicit per (chain, role)** and documented in the registry. Each F1/F2/F2b chain resolves to exactly one of the three.

**A2 — Project Dossier surface.** New parametric surface keyed by project; renders the 29 `ipp_*` sub-doc chains as grouped sections, each linking to its `/ledger/:chainKey`. One Atlas tile ("Project Dossier") replaces 29.

**A3 — Admin reachability.** Admin is a superuser acting on ~207 chains but laned on 4. Add an **admin "All Transactions" index surface** (searchable, grouped by community/domain) that lists every chain admin can act on, each linking to its ledger. Restores the missing Trading Ops domain (market-halt, settlement-run, order-book health) as explicit admin tiles.

**A4 — Dead-tile cleanup (F3/F4/F5).**
- Drop dead `regulator:government-filing` key; sweep **all** hyphenated `SURFACE_REGISTRY` keys against `feature.key` for the same underscore/hyphen class (epc `submittals`/`change-orders`).
- For each F4 tile: either build the missing surface body or remove the tile.
- For each F5 dangling tile: either back the chainKey with a registry descriptor or remove the tile. `AtlasPage.isReachable` must verify `f.chainKey` exists in the registry (not just truthy).

**A5 — Deep-link integrity (P0).** `LedgerPage` and `ThreadPage` validate `:chainKey` against a client-side mirror of `MERIDIAN_CHAINS` keys **before** fetch, rendering a dedicated **"No such transaction type — Open Atlas"** state (mirroring `MeridianSurfacePage`'s unknown-key fallback) instead of the ambiguous "Ledger failed to load. Retry".

**A6 — Continuous integrity guard (P0).** A committed CI test JOINs, and **fails the build** on any orphan in either direction:
- every `roleData` `feature.chainKey` → `MERIDIAN_CHAINS` keys;
- every `SURFACE_REGISTRY` key → the `feature.key` it aliases under `surfaceRole`;
- every registry chain laned to a role → that role's reachable tiles (respecting `frontdoor`: `thread-only`/`dossier` chains are reachable-by-design, not orphans).

This converts the one-shot audit into a regression guard so F1–F5 cannot regrow on the next wave (W77+).

### WS-B — Full digital onboarding (per role + per component)

**B1 — Fix the throwing roles + unify tracks.** Add `esco` + `epc_contractor` step sequences to `ONBOARDING_STEPS`; `getOnboardingState` falls back to a generic `['welcome','complete']` for any unconfigured role instead of throwing. Reconcile the two onboarding stores into one contract (DB `onboarding_step`/`onboarding_data` as source of truth; SPA reads it). Wizard exits navigate directly to `/horizon`, not retired `/launch/:role`.

**B2 — Provision a first entity for all 10 roles.** Each role's wizard provisions one real starter entity (in the user's own tenant) so Horizon isn't empty on first login. A provisioning manifest records what was created.

**B3 — Per-component first-run guidance.** A `first_run_registry` keyed by surface/chain key: a one-time intro card per component (what it does, the one primary action, a "why"). Resumable (abandon at step 3, resume later). Dismissible per component, tracked in `onboarding_data`.

**B4 — Role-scoped getting-started checklist + progress.** A persistent checklist per role (provision entity → run first transaction → invite counterparty → …) with progress surfacing on Horizon.

**B5 — Sandbox practice transactions (demo tenant only).** A clearly-labeled, isolated **demo tenant** where a new user can rehearse a journey end-to-end. **Never** writes synthetic kWh/billing/telemetry into real tenants (Goldrush-actuals constraint). Sandbox state is namespaced and disposable.

**B6 — KYC / market-access gate (flow designed, build-gated).** Completion gating: a user cannot transact in real markets until KYC + market-access checks pass. **The PII storage/encryption for this is a separate HARD-GATE approval** — this spec defines the *flow and states*, not the PII storage.

**B7 — Acquisition / invite funnel + email seam.** Trace register→invite→first-login→`/onboard`→`/horizon` for all 12 roles; fix the broken email delivery seam; confirm which roles self-register vs invite-only and that the invite role set matches the 12 `roleData` roles. (Email provider integration may be its own external-service approval.)

### WS-C — Frontend neatening & a11y

**C1 — DB-backed dropdowns (highest-leverage).** Convert `*_id` / `*_party_id` / entity-reference fields in `chain-registry-meridian.ts` from `type:'string'` → `type:'lookup'` with a `source`. Where no lookup endpoint exists, add one behind the static `LOOKUP_SOURCES` whitelist on `GET /api/ledger/lookup/:source`. Fallback to `<datalist>` where a true select isn't feasible, so the id is selectable not memorised. Target: drive the 32+ raw id inputs and the bulk of the 1275 string fields that are really enums/references down toward zero.

**C2 — One shared accessible Dialog primitive.** Focus trap + initial-focus + background inert/`aria-hidden` + focus-restore on close. Route CommandPalette, Ledger +New, Thread action drawer, DealDesk through it. Then run an **axe + keyboard-only pass** across the 4 chrome surfaces and 63 bodies.

**C3 — `--ink3` contrast.** Raise smallest functional text to ~11px min; darken meaningful metadata to `--ink2` / new `--ink-meta` (~oklch 0.46); reserve `--ink3` for decorative. Verify each small-text/background pair ≥ 4.5:1.

**C4 — Thread record presentation.** Render known fields with registry display metadata (units, dates, `fmtZar`, enum labels); resolve `*_id` → human label via lookup; hide internal columns (`tenant_id`, raw JSON). Verbatim dump behind an "advanced/raw" toggle.

**C5 — Role-gated header quicklinks.** Drive quicklinks from `getRoleConfig(role)` / per-role allow-list; National/Intelligence regulator/admin-gated.

**C6 — Header ctx everywhere.** Pass title/ctx to `MeridianFrame` for every Layout-wrapped page (ESG, Reports, Intelligence, National) and `/surface/:key`; add a back/breadcrumb to Horizon matching Ledger's "← Horizon".

**C7 — Avatar menu ARIA.** Either downgrade to a disclosure with focusable buttons, or implement the full menu pattern (focus first item on open, Arrow/Home/End, Escape returns focus to trigger).

**C8 — Veil initial focus.** Move focus to the first field on open (folded into C2's primitive).

**C9 — `cleanLabel` fix.** Broaden the trailing-wave-list regex to match bare-space-led `Wnn( · Wnn)*` tails; unit test `'Esums chains W12 · W24 · W25' → 'Esums chains'`.

**C10 — Duty-stream action guard.** Per-case busy flag, disable buttons while POST in flight, in-flight label; confirm step for irreversible/oxide-toned actions.

**C11 — Admin role-context consistency.** Persist admin's selected board-role (localStorage); Atlas/⌘K/NewPage read it so the function index matches the board.

### WS-D — Locale / i18n & ZAR correctness

- `fmtZar` adopts `Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'})` with a compact-notation variant.
- Replace the name-regex ZAR heuristic in `LedgerPage.fmtKpi` with an **explicit `unit`** on the registry kpi/column shape (`'zar' | 'mwh' | 'pct' | 'count' | …`).
- Set `<html lang="en">`; add a thin copy-string layer so the SA product is i18n-ready and formats money/dates correctly.

### WS-E — Responsive / mobile pass

Per-page TSX has zero breakpoints. Verify reflow below 760px for Horizon lanes, Atlas domain grid, Ledger KPI strip + card list, Thread two-sided detail, DealDesk columns, and all 63 surface tables (horizontal-scroll or stacked), given `viewport-fit=cover` is already set and a fullscreen field-tech PWA flow exists.

### WS-F — State consistency & certified export

- **F1 — `<SurfaceState kind="empty|loading|error">`** shared component with role-aware first-run copy + retry, applied across 63 bodies + Horizon lanes (Ledger's "No cases. Start one with…" is the template). The first-run zero-data experience is part of onboarding.
- **F2 — Print/export reachability.** Regulator, lender, carbon, settlement surfaces expose certified PDF/CSV export (L5 "certified exports NERSA/EMIR"); add `@media print` to `meridian.css`; every report-class surface has an Atlas-reachable export affordance.

### WS-G — DealDesk & admin self-test

- **G1 — DealDesk catalogue.** Verify `fetchDealTypes` covers every transactable chain and the `/new` picker can initiate the chains a role owns; reconcile the DealDesk Atlas section with the Ledger +New path so there is **one** canonical "start a transaction" entry per chain.
- **G2 — Admin reachability self-test surface.** Renders the live WS-A6 JOIN result (orphan chains, dead tiles, RBAC-vs-UI mismatches) so the number trends to zero across waves.

---

## Data model / interfaces

- **Registry (`chain-registry-meridian.ts`):** add `frontdoor` (per role disposition), `unit` on kpi/column shapes, and `type:'lookup'`+`source` on entity-reference fields. All static literals.
- **Lookup endpoint:** `GET /api/ledger/lookup/:source` gated by static `LOOKUP_SOURCES` allow-list → `{ value, label }[]`. Tenant-isolated. SQL identifiers from the whitelist only; the `:source` param selects a whitelist entry, never interpolates.
- **Onboarding:** `ONBOARDING_STEPS` gains `esco`/`epc_contractor`; generic fallback; `first_run_registry` (component → intro card); provisioning manifest; checklist definitions per role. Single store contract (DB authoritative).
- **CI guard:** committed test (vitest) performing the three-way JOIN, run in `deploy.yml`'s vitest gate.

## Security & compliance invariants

1. Every SQL identifier is a static code literal; request input only via `?` binds; dropdowns via the `LOOKUP_SOURCES` whitelist.
2. PII (KYC) storage/encryption — **separate HARD-GATE approval** before build.
3. Sandbox writes only to an isolated demo tenant; real tenants keep Goldrush actuals.
4. `frontdoor: 'thread-only'`/`'dossier'` chains are reachable-by-design and excluded from the CI orphan check — but their reachability path (Thread side-panel / Dossier surface) is asserted positively.

## Testing strategy

- **Unit (vitest, backend):** `cleanLabel` multi-wave; `fmtZar` en-ZA; CI integrity JOIN; lookup-source whitelist enforcement; onboarding fallback (no throw for any role).
- **Reachability:** WS-A6 JOIN is the standing guard.
- **a11y:** axe + keyboard-only pass on 4 chrome surfaces + 63 bodies (WS-C2).
- **Responsive:** narrow-viewport reflow check on all surfaces (WS-E).
- **Journeys (prod, per directive):** create transactions through the frontend for every role × every owned chain, plus counterparty combinations via Thread. Respect the 10/5min/IP login limiter (`login_or_cached`, one login; seed token via `addInitScript`).

## Sequencing

All P0–P3 before go-live (per decision 3). Suggested build order (refined in the implementation plan): **WS-A6 + A5 first** (integrity guard + deep-link safety lock in the invariants), then **WS-A1–A4** (disposition + dead-tile cleanup) and **WS-C1** (dropdowns) in parallel, then **WS-B** (onboarding, with B6 gated), then **WS-C2–C11 / WS-D / WS-E / WS-F / WS-G**. The CI guard (A6) lands early so every subsequent change is checked.

## Open HARD-GATES (do not build autonomously)

- **PII encryption for KYC (B6).** Present storage/encryption design separately; obtain approval.
- **Email-provider integration (B7).** Sending onboarding/invite email is outward-facing; confirm provider + approval before wiring live delivery.

## Out of scope

- Chain/state-machine rewrites (this is the front-door layer only).
- Surface-body **depth** upgrades (L2→L4); flagged by the critique but a separate wave program. This spec guarantees reachability + usability, not per-surface depth.
