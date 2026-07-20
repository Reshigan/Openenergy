# Integration Gaps — findings from the LTM/KDM seed-and-capture exercise

**Status:** analysis for build planning. Nothing here is fixed except the render-race (item 4), which is already deployed.
**Date:** 2026-07-08
**Method:** we seeded one full IPP (LTM Energy → KDM 2.1 MW solar site, R1.85/kWh PPA, 18 retrospective months Jan 2025–Jun 2026) and drove every role's surface until every screen and chart populated. The friction points — where data had to be seeded *separately per surface* instead of flowing from one record, and where a surface returned other tenants' rows — are the integration gaps. All findings below are backed by code citations (`file:line`), not inference.

## Why this document exists

The platform's pitch is **"one shared record of truth — nobody re-keys."** Getting the demo to look end-to-end coherent required us to hand-seed each surface's backing table independently and, for three surfaces, to filter cross-tenant rows on the client. That means the coherence is presentational, not structural: the seams between platform pieces are not wired. This doc enumerates every seam, states whether it holds, and gives a build target for each that doesn't.

Severity legend: **P1** = data-isolation/security or a claim the product actively makes that is false; **P2** = missing derivation that forces manual re-keying (the "nobody re-keys" gap); **P3** = correctness/UX debt.

## Why it feels like features, not a platform

The most common reaction to a walkthrough is *"the features work, but it doesn't feel cohesive."* That is not a visual-design complaint and it will not be fixed by restyling. Cohesion is a structural property. A platform feels like one thing when four conditions hold. None of them hold here, and each one's absence is already enumerated below as a gap — the list is the diagnosis, this section is the symptom.

**1. One canonical object that everything orbits.** Amazon orbits *the order*: every screen, notification, and role is a view onto it. Open Energy has no single "the transaction" that every role sees the same way. A chain can be started five different ways (Ledger `?compose=1`, Deal Desk, or one of four parallel marketplace surfaces — see gap 11). Thread comes closest to being the shared object, but most chains bypass it entirely. This is the single largest contributor to the incoherent feel.

**2. Data flows along that object instead of being re-keyed onto it.** The honesty note at the foot of this document states the test we accidentally ran: *if the seams were wired, we'd have seeded one feed and watched it propagate. We didn't — we seeded each table.* When the same fact carries a different value on different screens — three price stores (gap 5), the grid emission factor recorded as 950, 0.942, and 0.95 in three places (gap 6), four of seven cross-surface seams absent entirely (gap 3) — the product reads as three applications sharing a nav bar.

**3. A handoff pulls the next role in.** Every real transaction crosses roles: the IPP sells, the offtaker buys, the lender finances, the regulator watches. Gap 10's stubbed kickoff notification means a deal is "done" on one role's screen and invisible on the next role's until that person independently goes looking for it. That produces N disconnected inboxes rather than one object visibly moving between hands.

**4. Home shows your work, not a menu of functions.** Atlas is a function library — tiles indexed by role, then domain, then feature. That is the SAP model: powerful, and incoherent. Horizon is closer, but its lanes are chain-cases rather than tasks with a deadline and a single next action.

**The reframe:** the platform orbits *features*, not *the transaction*. Every gap below is a place where that shows. Fixing cohesion does not require new features — it requires making the deal the centre of gravity: one object, discovered rather than typed in (gap 11), with data flowing along it (gaps 3, 5, 6), handoffs notifying down it (gap 10), and home showing your open transactions rather than the function catalogue. The work is wiring the features that already exist onto one spine.

## Structural findings — what sits underneath the numbered gaps

The fourteen gaps below are seams that don't hold. This section is about why they don't: five properties of the architecture that make each individual seam expensive to wire and easy to unwire again. Wiring a seam without addressing these produces a fix that decays. They are ordered by leverage, not severity.

### S1 — There is no state machine. Status is free text.

Roughly eighty live chain tables each carry their own `status` column ([chain-state.ts:4](../../open-energy-platform/src/utils/chain-state.ts#L4)). The four tokens `draft` / `pending` / `approved` / `submitted` alone appear 360 times as string literals across `src/routes/`. Nothing declares the legal states of a chain, and nothing declares the legal transitions between them.

Consequently the platform infers state rather than knowing it. `isTerminalStatus()` in [chain-state.ts:26-32](../../open-energy-platform/src/utils/chain-state.ts#L26-L32) buckets a status as open-or-terminal by substring-matching it against a 24-token list. The file's own header is candid about the cost: *"~22% of status tokens are context-dependent — `paid`, `issued`, `closed`, `settled`, `rejected`, `withdrawn` are terminal in some chains but intermediate/live in others."* Exact classification exists only for the five chains registered in [chain-terminal-registry.ts:36-40](../../open-energy-platform/src/utils/chain-terminal-registry.ts#L36-L40) (`drawdown`, `loan_default`, `reserve_account`, `levy_assessment`, `carbon_retirement`).

This sits underneath gaps 3 and 10. A handoff notification fires on a state transition; you cannot cascade on a transition that is not a first-class object. Today a transition is a string one route module happened to write into a column.

**Target:** each chain declares `states` and `transitions` alongside its existing `MERIDIAN_CHAINS` entry. A transition is applied through one shared function that validates the edge, writes the row, and emits the event — never by a route module assigning a string.

### S2 — The event log exists, but it is an analytics sink, not the source of truth.

`oe_platform_events` is append-only and is already written on every cascade ([cascade.ts:14](../../open-energy-platform/src/utils/cascade.ts#L14) imports `recordPlatformEvent` from `analytics-sink.ts`). Its readers are `insights.ts`, `metrics-rollup.ts`, and `chain-state.ts`.

So the platform has an event log used for reporting, and eighty tables used as the record. That inversion is the direct cause of the honesty note at the foot of this document: there is no single feed to seed, because no single feed is authoritative. It is also why the same fact carries three values in three places (gaps 5, 6) and why a fan-out can partially commit (gap 12) — each table is written independently, so each can be written wrongly independently.

This is the highest-leverage change available, and it is not a rewrite: the log is already built, already written to, and already carries `chain_key` and `source_chain_status`. What is missing is that writes go to the tables *first* and the log *after*, rather than the log being the commit point and the tables being projections rebuilt from it.

**Target:** the transition (S1) writes one event; the row is a projection. Gaps 3, 5, 6, and 12 mostly cease to exist rather than being fixed one at a time.

### S3 — Tenancy is single-owner. A marketplace transaction has two owners.

[tenant.ts](../../open-energy-platform/src/utils/tenant.ts) resolves exactly one `tenant_id` per resource, reached by joining through whichever of `creator_id`, `counterparty_id`, `participant_id`, or a direct `tenant_id` column that table happens to use. There is no primitive that expresses *"this row is visible to exactly these two parties and to nobody else."*

That is what the three-tier visibility model above is really describing: tier 1 (marketplace) and tier 3 (private book) are both expressible as single-owner predicates, and tier 2 (bilateral) is not expressible at all. Gap 1 therefore is not a set of leaky queries to be patched query-by-query — it is a missing relation. Patching the queries leaves the next bilateral chain to reinvent the leak.

**Target:** a parties-on-transaction relation (transaction id × participant id × role-on-this-transaction), with tier 2 reads scoped by membership in it. This is also what makes Thread a real object rather than a rendering convention.

### S4 — The spine covers seventeen chains. The platform has about eighty.

`MERIDIAN_CHAINS` in [chain-registry-meridian.ts](../../open-energy-platform/src/utils/chain-registry-meridian.ts) has 17 entries. `chain-state.ts` counts roughly 80 live chain tables. So Ledger, Thread, and the Horizon lanes reach about a fifth of the platform; the rest is reachable only as a `/surface/:key` function tile.

Atlas-as-a-function-menu, named as cohesion property 4 above, is therefore not a UI decision that can be undone in the UI. It is the fallback surface for the sixty-odd chains that have nowhere on the spine to live. Registering a chain in `MERIDIAN_CHAINS` is what promotes it from a function to a transaction, and only a fifth have been promoted.

**Target:** registration is a consequence of S1 — a chain that declares its states and emits its transitions has, by construction, everything `MERIDIAN_CHAINS` needs. The 17 becomes 80 as a by-product rather than as 63 pieces of manual work.

### S5 — Money does not move. There is no Escrow.

`wrangler.toml` binds exactly one Durable Object class: `OrderBook` (lines 87, 259). `src/do/` contains exactly one file, `order-book.ts`. `class Escrow`, `class Risk`, and `class Smart` do not exist anywhere under `src/`. (The Durable Objects section of `CLAUDE.md` asserts these classes "exist in code but aren't bound in `wrangler.toml`." That statement is false and should be corrected.)

Settlement therefore writes ledger rows against no custody and no payment rails. This is not a cohesion problem and not a wiring problem — it is the difference between an exchange and a system of record, and it is a product decision rather than a refactor. It is listed here because every roleplayer conversation eventually arrives at it.

**Target:** out of scope for this document. Named so it is not mistaken for something the fourteen gaps below cover.

### Leverage order

S1 and S2 are one change, not two: declare the states, emit the transitions, derive the tables and the screens from the log. S3 follows and unblocks gap 1 at the root. S4 falls out of S1 and S2 once every chain emits. S5 is a separate decision.

## The interaction model is a marketplace — visibility is three-tier, not binary

The platform is a **marketplace of interactions**: participants (IPP, offtaker, lender, carbon fund, ESCO, trader, grid) discover each other, match, then transact bilaterally. That framing is load-bearing for the isolation gaps below, because **some cross-tenant visibility is the product, not a bug.** A marketplace where you can only see your own rows has nothing to discover.

There is already a real marketplace spine — `/deals`: `POST /deals/:type/request` publishes demand, `GET /deals/:type/options` returns **deliberately cross-tenant**, matcher-scored, POPIA-banded offers, and `accept` dispatches the matched `chain_key` and fires a `deal.accepted` cascade so the chain starts with the counterparty pre-filled. But it is **one of four parallel marketplaces** (`/deals` spine; `/marketplace` classifieds — inquiry-only, no chain dispatch; `/dealroom` LOI/term-sheet negotiation; `/marketplace-l5` RFQ+auction; `/sustainability/marketplace` carbon/REC), and **most of the ~148 chains bypass all of them** — initiated from Ledger `?compose=1` with the counterparty id typed in by the initiator, who therefore had to already know who they were transacting with.

So every list surface belongs to exactly one of three visibility tiers, and the isolation work is to **classify and enforce the tier**, not to lock everything to owner:

| Tier | What lives here | Cross-tenant? | Examples |
|---|---|---|---|
| **Public / marketplace** | listings, deal options, open order book, available capacity | **Yes, by design** — this is discovery | `/deals/:type/options`, `/marketplace/listings`, order book |
| **Bilateral / thread** | a matched transaction between counterparties | Only the parties to the row | `/thread/:chainKey/:id`, dealroom |
| **Private book** | internal ops, financials, predictions | **No — owner only** | reserves, DSCR, devices, predictions, waterfalls |

The Gap 1 leaks are **private-book rows leaking through unscoped lists** — tier 3 behaving like tier 1. The fix is per-chain tier classification, **not** blanket owner-scoping (which would break the marketplace tier).

| # | Gap | Severity | Current | Target |
|---|-----|----------|---------|--------|
| 1 | **Cross-tenant leakage is systemic — ~110 of 148 chain list endpoints (74%) leak**, plus 5 non-chain | **P1** | Everyone sees everyone's rows | One scoped-list choke point |
| 2 | `/api/horizon/:role` leaks every tenant's live cases | **P1** | No owner predicate | Owner column in chain WHERE |
| 3 | 4 of 7 cross-domain seams don't auto-flow | **P2** | Manual re-key / hand-seed | Cascade or cron wiring (L4) |
| 4 | recharts render-race (whole SPA) | **P3** | Fixed + deployed | — (document as a class) |
| 5 | Three unreconciled price stores; "reconciliation" chains are manual shells | **P2** | Numbers can drift freely | Derive + tie-back (L4) |
| 6 | Carbon MRV tonnage hand-entered, not derived; two carbon planes unlinked | **P2** | Standalone values | Link to metered ledger (L4) |
| 7 | No safe scoped admin/all-fleet seat | **P2** | Admin sees everything or nothing | Tenant-scoped admin |
| 8 | Surface discovery only via ⌘K/Atlas tile resolution | **P3** | Structurally hidden tiles | Coverage audit |
| 9 | Invoice id format claim (`ESI-KDM-YYYYMM`) is fiction | **P3** | id is `esi_<stn>_<date>` | Fix doc/UI or code |
| 10 | **Chain-kickoff notifications are a stub** — actor-only recipient, raw-event title/body, rich payload discarded | **P1** | Counterparty never told a chain started | Recipient resolver + content renderer (L4) |
| 11 | **Marketplace is fragmented + most chains bypass it** — 4 parallel marketplaces, ~148 chains initiated with counterparty pre-known | **P2** | No unified discovery; you must already know your counterparty | Route chains through one deal/discovery spine (L4) |
| 12 | **No atomic boundary around fan-out writes** — cascade fires post-commit; `persistMatch` = 6 loose `.run()`; no idempotency guard | **P1** | Partial commits; retries double-fire audit/notifs/fills | `batch()` the fan-out + idempotency key (L4) |
| 13 | **Day boundaries are naive UTC, not SAST (+02:00)** — 113 UTC day-keys, 1 SAST-aware | **P1** | Trades/settlement/accruals mis-bucket 00:00–02:00 UTC | One `sastDayKey` helper across the call sites (L4) |
| 14 | **Connector reconciliation breaks dead-end** — detected + counted; remediation chain (W120) exists but unwired; no inbound replay guard | **P2** | Breaks tracked, nobody routed to fix them | Cascade break → W120 attestation (L4) |

---

## Gap 1 — Cross-tenant leakage is systemic (P1)

The KDM capture exposed 5 leaking endpoints; widening the audit across **all chains** shows those 5 are not exceptions — they are the majority behaviour. **~110 of 148 chain list endpoints (~74%) return every tenant's rows**, scoped only by an optional request value or by nothing. Only ~38 are owner-scoped. During capture we had to intercept three of the worst client-side and keep only KDM rows (`capture.spec.ts` `filterKdm()`), which is exactly the symptom an unscoped list produces.

**The pattern is bimodal, and predictable by chain shape:**
- **Scoped** (~38): single-owner *report / registration* chains — one participant owns the row and the handler hand-rolls `WHERE <owner_col> = user.id` (projects `projects.ts:28`, plant-revenue `esums-accruals.ts:1199`, offtaker portfolio `role-completions.ts:40`, carbon vintages/MRV `carbon-registry.ts:592/648`).
- **Leaking** (~110): multi-party *transaction* chains — the row has two+ counterparties, no single obvious owner column, so the handler scopes nothing and every user of the role sees every tenant's cases.

The 5 originally-cited endpoints are the concrete tip:

| Endpoint | Query | WHERE actually applied |
|---|---|---|
| `GET /api/esums/devices` | `esums-om.ts:243` | `site_id = ?`/`status = ?` — request-only; **none** if omitted |
| `GET /api/esums/predictions` | `esums-om-intel.ts:115` | `status = ?` only |
| `GET /api/lender/reserves` | `lender-suite.ts:616` | `project_id = ?` **only if** query param supplied |
| `GET /api/lender/waterfalls` | `lender-suite.ts:497` | `project_id = ?` **only if** query param supplied |

**Asymmetry worth noting:** the *write* paths on these same resources already enforce ownership (`assertSiteOwnership` at `esums-om.ts:248/270`, `esums-om-intel.ts:127`). Only the read/list paths are open. So a caller cannot mutate another tenant's device, but can enumerate all of them. This holds across the leaking chains generally — mutations route through per-resource asserts; lists don't.

**Root cause — no shared choke point.** `utils/tenant.ts` already exposes the correct primitive: `participantsInCallerTenant(c)` (`tenant.ts:202`) returns the id set a caller may see. It has **zero callers**. Isolation is "owner-id-by-`user.id`, applied ad hoc per handler," so every handler that forgets it leaks, and the ones that get it right can't be told apart from the ones that don't except by reading each query. At 148 chains that discipline does not hold — and 74% is the measurement of it not holding.

**Build — classify by tier, don't blanket-scope** (see the marketplace framing above; blanket owner-scoping would break the public/discovery tier).
- Structural (the real fix): tag every chain in the static `MERIDIAN_CHAINS` with a `visibility` field — `'marketplace' | 'bilateral' | 'private'` — plus `ownerColumns: [...]` for the non-marketplace tiers. Then one `listChainCases(c, chainKey, {filters})` helper every chain list route goes through:
  - `marketplace` → no owner predicate (deliberate cross-tenant discovery, e.g. `/deals/:type/options`); may still filter by `deal_type`/`status`.
  - `bilateral` / `private` → append `AND (${ownerColumns[0]} IN (${participantsInCallerTenant}) OR ${ownerColumns[1]} IN (...))` — identifiers from the static literal (security invariant preserved), ids bound to `?`.
  - "Forgot to scope" becomes structurally impossible, *and* a deliberate marketplace read can't be mistaken for a leak (it's declared, not inferred from whether a WHERE clause happens to be there). Target **L4** (isolation is a security invariant).
- Short term, if staged: tag + scope the 5 cited private-book handlers first (~5 small diffs), then sweep the remaining chains onto the helper, classifying each as you go.
- Multi-owner (bilateral) chains need the `ownerColumns` list, not one column — the row is visible to either counterparty. This is why the leaking chains were skipped originally: no single obvious owner, so the handler scoped nothing rather than scoping to both.

## Gap 2 — `/api/horizon/:role` leaks every tenant's live cases (P1)

Separate from Gap 1 because it is the **default post-login workspace** and therefore the highest-exposure leak. `horizon.ts:99` builds each lane from `SELECT ... WHERE <statusCol> NOT IN (<terminal>)` — **no tenant/owner/participant predicate at all**. The role guard at `horizon.ts:86` gates *who may call* the endpoint, but every user of a given role then sees every other tenant's in-flight cases for that role's chains. `assembleHorizon` groups by lane and role, never by owner.

**Why it's harder than Gap 1.** Horizon iterates the static `MERIDIAN_CHAINS` descriptors (`utils/chain-registry-meridian.ts`) and each chain has a different owner column. To scope it without breaking the security invariant (SQL identifiers come only from the static literal, never request input), the descriptors need an explicit `ownerColumn` field, and the horizon query appends `AND ${descriptor.ownerColumn} = ?` bound to `user.id`.

**Build.** Add `ownerColumn` to each `MERIDIAN_CHAINS` entry; thread it into the horizon WHERE. Target **L4**.

## Gap 3 — Cross-domain seams don't auto-flow (P2)

We tested the "nobody re-keys" claim across seven seams. **Three are genuinely automatic; four require independent seeding or human re-keying.**

| # | Seam | Verdict | Evidence |
|---|------|---------|----------|
| 1 | metered generation → settlement invoice | **EXISTS** (cron) | `esums-accruals.ts:184` upsert, nightly via `index.ts:315` |
| 2 | fault → work order | **ABSENT** | `cascade-rules/ona-operations.ts:21` writes a `fault_review` task, never an `om_work_orders` row |
| 3 | telemetry/fault → predictive prediction | **ABSENT** | no telemetry→`oe_asset_prognostics` generator; chain is manually initiated, ML routes only score existing rows |
| 4 | MRV verified → credit issuance | **ABSENT** | `cascade-rules/carbon-events.ts:19` enqueues an `mrv_followup` prompt only |
| 5 | metered MWh → carbon tCO₂e | **EXISTS** (cron) | `esums-accruals.ts:216` `kwh × 950 gCO₂e`, bridged to `esums_carbon_credits` |
| 6 | settlement/generation → lender reserve/DSCR/waterfall | **ABSENT** | reserves/DSCR/waterfalls all manual (`lender-suite.ts:533/582`, `dscr-monitoring-chain.ts:411`); only covenant-breach events touch reserves |
| 7 | PPA chain state → cross-role notification | **EXISTS** (cascade) | `ppa-contract-chain.ts:348` fires events; `lifecycle-sequencing.ts:77` consumes |

The four ABSENT seams are the "nobody re-keys" gap made concrete:

- **Seam 2 — fault → WO.** `ona.fault_detected` produces an intelligence item and a human review task, not a work order. Operator re-keys the WO (`esums-om.ts:573`). This is L3 (task prompt), not the L4 auto-cascade the pitch implies. **Build:** a cascade rule on `ona.fault_detected` (above a severity threshold) that inserts an `om_work_orders` row and links it back to the fault. L4.
- **Seam 3 — telemetry → prediction.** No engine turns telemetry/fault history into predictions. **Build:** a nightly scan (co-located with the existing accrual/telemetry cron) that writes `om_predictions`/`oe_asset_prognostics` from telemetry trends; the ML routes then score them. L4. (Note: for the demo, every "prediction" shown was hand-seeded.)
- **Seam 4 — MRV → issuance.** Verification only tells the submitter to go request issuance from their registry; no vintage/credit is minted. **Build:** on `carbon.mrv_verified`, mint an `esums_carbon_credits`/vintage row (or a pending-issuance record) linked to the MRV submission. L4. See also Gap 6.
- **Seam 6 — settlement → lender.** Lender financial state (reserves, DSCR, waterfalls) never derives from settlement cashflow or metered generation; the only automated reserve reactions are covenant-breach-driven. **Build:** on the nightly settlement run, post cashflows into the reserve/waterfall engine and recompute DSCR. L4.

**Two caveats on the EXISTS verdicts:**
- Seam 1 is real but **cron-driven, not `fireCascade`**, and the invoice id is `esi_<stationId>_<YYYY-MM-01>`, **not** the `ESI-KDM-YYYYMM` we assumed (see Gap 9).
- Seams 4 and 5 are **different carbon systems** — seam 5 (esums per-generation credits) is automatic; seam 4 (formal MRV→registry vintage) is not. Do not report "carbon issuance works" — half of it does.

## Gap 4 — recharts render-race, whole-SPA class (P3, fixed)

Documented as a *class* so it doesn't regress. `ResponsiveContainer` measures 0px on first paint; series (`Bar`/`Scatter`/`Area`/`Line`/`Pie`/`Radar`) finish their mount animation at zero size and never repaint → invisible charts. Surfaced on nearly every seeded surface during capture; the spec worked around it by reloading each page once (`capture.spec.ts:103-109`).

**Fix (deployed):** `isAnimationActive={false}` on every series component. Commit `00de5158`, 17 chart files. **Guard to add:** a lint/CI check that any recharts series in `pages/src` sets `isAnimationActive={false}` — otherwise the next new chart reintroduces it silently.

## Gap 5 — Three unreconciled price stores; "reconciliation" chains are manual shells (P2)

The KDM plant-revenue surface showed **blended 2.128 R/kWh** against a **signed PPA base of 1.85**. That is not indexation drift — it is three independent, unreconciled price stores:

| Number | Source | Where |
|---|---|---|
| 2.128 R/kWh (blended) | capacity-weighted mean of `om_sites.ppa_tariff_zar_mwh` | `esums-om.ts:1091` (`fleetKpisCompute`) |
| invoice rate (default **1.28**) | `manufacturer_credentials.tariff_rate_zar_per_kwh` | `esums-accruals.ts:127`, written onto each invoice `:184` |
| 1.85 R/kWh | the signed PPA contract record | (not read by either of the above) |

None reference each other. The "blended" figure is a denormalized tariff copied onto each `om_sites` row; the invoice engine reads a *different* column on `manufacturer_credentials` and defaults to R1.28; the actual PPA price feeds neither.

**The two reconciliation chains that exist read the request body, not the data:**
- **W79 Generation Revenue Assurance** (`generation-revenue-assurance-chain.ts:504-520`): `metered/settled/invoiced_generation_mwh`, `expected/settled_revenue_zar`, `variance_zar` are all `typeof b.X === 'number'` values from the request. `variance_zar` is operator-typed, not computed. No query touches `esums_settlement_invoices` or `site_accruals`.
- **PPA Annual Reconciliation** (`ppa-annual-recon-chain.ts:613-658`): `base/indexed_tariff`, `metered_mwh`, `cpi_true_up_zar`, `net_cash_position_zar` all body-supplied. Actions named `compute-top-residual`/`apply-cpi-capacity` **compute nothing** — they store typed numbers.

**CPI note:** the only escalation code is `tariffForPeriod()` (`esums-accruals.ts:33`) — a single hardcoded two-value step (base → stepRate at one date), **not** CPI-indexed. There is no CPI series/table.

**Build.**
- Make the invoice engine read its rate from the PPA contract record (with the two-step/CPI escalation applied), not from `manufacturer_credentials`. Single source.
- Make W79 and PPA-annual-recon actually query `esums_settlement_invoices`/`site_accruals` and compute `variance = expected − settled` server-side instead of accepting typed numbers. Target **L4** (a "reconciliation" that displays whatever the operator types is worse than none).

## Gap 6 — Carbon MRV tonnage hand-entered, not derived; two carbon planes unlinked (P2)

The MRV surface's `claimed_reductions_tco2e` (`carbon-mrv-chain.ts:55`) is caller-supplied at `carbon-registry.ts:296-321` — `baseline`, `project`, `leakage`, `claimed` are all `Number(b.X)` from the request body, with **no server check** that `claimed = baseline − project − leakage` and **no** `MWh × emission factor` derivation. The `mrv_submissions` table has no `site_id`/generation column, so there is no link to the plant's actual output.

Meanwhile a **correct** metered derivation already exists on a different plane: `esums-accruals.ts:129` computes `carbonTco2e = kwhDelta × (carbonIntensity/1e6)` from real telemetry and writes it to `esums_carbon_credits`. Nothing joins `esums_carbon_credits` → `mrv_submissions`. So the hand-typed MRV tonnage is never reconciled against the metering-derived credits for the same site.

**Grid emission factor is also inconsistent** — three different constants: `SA_CARBON_INTENSITY_DEFAULT = 950` gCO₂e/kWh (`esums-accruals.ts:27`), `DFFE_DGGEF = 0.942` (`doc-generators.ts:31`, `vcm-pdd-generator.ts:29`), `SA_GRID_EF = 0.95` (`offtaker-options.ts:8`, inline `offtaker-heuristics.ts:147`).

**Build.**
- One shared grid-EF table/constant, referenced everywhere.
- Link `mrv_submissions` to the site's metered generation; pre-fill `claimed_reductions_tco2e` from `esums_carbon_credits` and flag variance against the operator's claim. Target **L4/L5** (MRV feeds registry issuance and regulator exports — this is exactly where L5 tamper-evidence matters).

## Gap 7 — No safe scoped admin / all-fleet seat (P2)

Because isolation is per-handler owner-id (Gaps 1–2), there is no seat that can safely see one tenant's whole fleet across roles without either (a) being that tenant's specific role logins, or (b) being admin/support, which the *scoped* endpoints treat as a global override (`esums-accruals.ts:1199` lets admin pass any `participant_id`; `carbon-registry.ts:592` gives admin/regulator all rows). On a shared demo tenant an "all-seeing" seat leaks everyone. During capture we could not use one admin login to shoot all surfaces — we logged in as each LTM role separately.

**Build.** A tenant-scoped admin role: full visibility **within one org**, none across orgs. Depends on Gaps 1–2 landing first (need a real owner/tenant column to scope to). Target **L4**.

## Gap 8 — Surface discovery only via ⌘K/Atlas tile resolution (P3)

Every surface we captured was reached by typing a `/surface/<role>:<key>` path directly. In the product, surfaces are discoverable only through Atlas (⌘K), and a tile is **structurally hidden unless** it resolves to a chain Ledger (`f.chainKey`), a `route`, or a registered `/surface` key (`roleData.ts` → `surfaces.tsx` allow-list). A surface that exists server-side but has no resolving tile is invisible to users. We did not audit which of the 347 route modules have a discoverable tile vs which are orphaned.

**Build.** A coverage audit: for each role, diff registered surfaces/routes against `getRoleConfig(role).domains→features` tiles; list orphans (reachable by URL, not by Atlas) and dead tiles (resolve to nothing). Mechanical — a test can assert every `SURFACE_REGISTRY` key has a tile and vice versa. Target **L3**.

## Gap 9 — Invoice-id format claim is fiction (P3)

We assumed settlement invoices were `ESI-KDM-YYYYMM`. The actual id is `esi_<stationId>_<YYYY-MM-01>` (`esums-accruals.ts:184`). Any spec, UI label, or doc asserting the `ESI-KDM` format is wrong. **Build:** either adopt a human-readable id in the invoice generator, or correct every reference. Trivial.

## Gap 10 — Chain-kickoff notifications are a stub (P1)

When a chain kicks off, the counterparty is the person who most needs to know — a PPA offered, a reserve drawn, an RFI raised, a change order filed. The kickoff *does* fire reliably: all 48 in-file chain `POST '/'` handlers call `fireCascade`, and cascade reaches the notification stage (`cascade.ts:2529` → `createNotifications`, `notification-engine.ts:574`). But the notification that lands is content-free and goes to the wrong person. **The chain starts; effectively nobody useful is told, and what they're told carries none of the record.**

Three failures, all in `notification-engine.ts`:

1. **Recipient is the actor, and usually *only* the actor.** `determineNotificationRecipients` (`:128`) adds `actor_id`, then a `switch(entity_type)` that only matches **legacy dotted entity types** — none of the ~207 chain keys match a case, so the switch falls through. Net recipients for a chain kickoff = the person who initiated it. The counterparty (offtaker, lender, IPP on the other side) is never resolved. (One chain, `mrv_submissions`, matches a legacy case by coincidence of naming — the exception that proves it's unintended.)
2. **Title and body are the raw event string.** `buildNotificationContent` (`:351`) is keyed by legacy dotted events; a chain event misses every case and hits the fallback (`:562-563`): `title = event`, `body = "Event ${event} on ${entity_type}:${entity_id}"`. So the user sees `ppa_contract_chain.created` / `Event ppa_contract_chain.created on ppa_contract_chain:ppa_kdmmall01` — the literal wiring, not "LTM offered you a 20-year PPA at R1.85/kWh."
3. **The rich payload is discarded.** Kickoff handlers pass a full `ctx.data` into the cascade (counterparty ids, quantum, tariff, deadline). The notification insert (`:588-601`) stores `data` but title/body never read it, so the one place the information exists is the one place the UI doesn't surface. Worse, many kickoffs pass **thin** `data` to begin with (`{tier, one_ref}`), so even a renderer that read `ctx.data` would have little to show.

Two structural holes beyond the three:
- **System-spawned chains notify nothing.** Chains started by `lifecycle-sequencing.ts` (a chain completing spawns the next) don't re-enter a `POST '/'` handler, so they fire **no** kickoff notification at all — the automatic hand-offs are silent.
- **21 chains have `initiation: null`** — no kickoff surface, so no `POST '/'`, so no cascade origin. These can only be started by a system path, and per the point above that path is silent.

**Build — "notify with more info." Both halves hook seams that already exist; no new plumbing.**

1. **Recipient resolution keyed on the chain, not legacy entity types.** Extend `determineNotificationRecipients` (or, cleaner, resolve upstream in the cascade notification stage) so that for a chain event it reads the counterparty ids out of `ctx.data` (`counterparty_id`, `offtaker_id`, `lender_id`, `ipp_id`, …) and the chain's `ownerColumns` from the static `MERIDIAN_CHAINS` (the same field Gaps 1–2 add), and notifies **every party to the row**, not just the actor. Identifiers from the static literal; ids bound to `?`.
2. **Content from the record, not the wiring.** Replace the raw-event fallback (`:562-563`) with a generic chain renderer: read the chain descriptor's column labels from `MERIDIAN_CHAINS` and the values from `ctx.data`, and render `"<initiator> started <chain label>: <key fields> — <required action> by <deadline>"`. Per-event templates for the high-traffic chains (PPA, reserve draw, RFI, change order) can override the generic renderer where the phrasing matters. Both live inside `buildNotificationContent` — the existing seam.
3. **Enrich the kickoff payload at the source.** The handlers that pass thin `{tier, one_ref}` data should pass the fields the renderer needs — counterparty id(s), quantum, tariff/rate, deadline, and a required-action verb. Small per-handler diffs; the renderer degrades gracefully when a field is absent.
4. **Emit on system-spawned kickoffs.** Have `lifecycle-sequencing.ts` fire the same kickoff cascade (or call the notification stage directly) when it spawns the next chain, so automatic hand-offs are not silent.

Target **L4** — a kickoff notification that names the counterparty, the quantum, and the required action with a deadline is the difference between a notification feed and a to-do list. Steps 1–2 are the leverage (recipient + content); 3–4 make it complete.

**Marketplace framing:** in a marketplace, kickoff *is* a market event — an offer posted, interest expressed, a deal accepted, a counter-offered. The `deal.accepted` cascade (Gap 11) is already exactly this signal on the `/deals` spine; it just terminates in the same actor-only, content-free notification. So the same recipient-resolver + renderer serves both: bilateral chain kickoffs (notify the counterparty) and marketplace matches (notify the matched offeror/requester). Build it once against the cascade notification stage and both light up.

## Gap 11 — Marketplace is fragmented and most chains bypass it (P2)

The platform's interaction model is a marketplace (see framing near the top), but it exists as **four disconnected marketplaces plus a bypass**:

| Surface | Role | Chain-connected? |
|---|---|---|
| `/deals/:type/request` + `/options` + `accept` | **the real spine** — publish demand, discover cross-tenant offers, accept → dispatch `chain_key` + fire `deal.accepted` | **Yes** — dispatches and kicks the chain |
| `/marketplace/listings` | classifieds — energy/capacity/carbon/equipment | **No** — inquiry/respond only, no chain dispatch |
| `/dealroom/:contractId` | private LOI/term-sheet phase negotiation | Partial — separate downstream flow |
| `/marketplace-l5` | RFQ + auctions, multi-party quote scoring | Separate spine |
| `/sustainability/marketplace/browse` | carbon/REC listings, tiered SLA | Separate spine |

And the ~148 transaction chains overwhelmingly **do not enter through any of them** — they're initiated from Ledger `?compose=1`, where the initiator types the counterparty id in. That means the default path to starting a transaction **assumes you already know who you're transacting with** — the opposite of a marketplace. Discovery exists (`/deals/:type/options`, `/offtaker/options`) but is a minority entry point wired to a minority of chains.

**Why it matters.** The whole value of a marketplace — price discovery, matching, liquidity, "find me an offtaker/lender/carbon buyer" — only accrues on the `/deals` spine, and only for the chains wired to it. Everywhere else the platform is a bilateral-contract tool with the counterparty pre-known. This is also *why* Gap 1 exists: chains that never modelled discovery never modelled a visibility tier either, so their lists default to unscoped.

**Build.**
- Make `/deals` the single discovery spine: fold classifieds, RFQ/auction, and carbon/REC browse into one listing/offer model with `deal_type` discriminators, rather than four parallel stores.
- Give every transaction chain a marketplace entry: a chain's `initiation` should be able to start from a **discovered** counterparty (`/deals/options` → accept → dispatch with counterparty pre-filled), not only from a typed-in id. Chains that are genuinely bilateral-by-nature (e.g. an existing PPA's annual reconciliation) stay compose-only; new-counterparty chains (PPA offer, debt facility, carbon offtake) get a discovery front door.
- The `visibility: 'marketplace'` tag from Gap 1 and this discovery spine are the same modelling decision seen from two sides — do them together. Target **L4**.

---

## Backbone gaps — found by a follow-on code audit, not the capture

Gaps 1–11 came out of driving the LTM/KDM seed until every screen populated. Gaps 12–14 came out of a targeted read of the integration *backbone* the capture exercise didn't stress: the cascade/write path, the day-boundary clock, and the external-system connectors. They are structural — they don't need a populated screen to bite, and they underlie several of the gaps above.

## Gap 12 — No atomic boundary around fan-out writes; partial commits + double-fire (P1)

Two of the busiest write paths fan a single logical action across many independent D1 statements with **no transaction wrapper**, so a mid-flight failure leaves the record split — and a retry re-runs the whole fan-out with **no idempotency guard**, so it double-writes.

- **Cascade fires after the mutation commits, outside any transaction.** Every mutation that matters calls `fireCascade` *after* its own `.run()` has already committed (`src/routes/ipp-submittal.ts:723-725`, `src/routes/esg-reports.ts:141-144`). Nothing spans the mutation and the cascade, so if a stage throws post-commit the mutation persists but the downstream (audit append, notifications, action queue, webhooks) never happens, with no rollback. `runStage` (`src/utils/cascade.ts:2703`) retries 3× then writes the failure to `cascade_dlq` (`:2728`) and continues — so the cascade is only ever *eventually, partially* consistent with the mutation that triggered it.
- **`persistMatch` is six loose `.run()` calls.** The OrderBook DO persists a fill as six independent D1 writes — `trade_matches`, taker `trade_fills`, maker `trade_fills`, the market print, and two order-status updates (`src/do/order-book.ts:209-266`) — none wrapped in `batch()`, only serialized by `blockConcurrencyWhile` (concurrency, not atomicity). A crash between writes yields split-brain: a match row with missing fills, or an order still `status='open'` whose fill already landed. On restart the DO rehydrates from `trade_orders` only (`order-book.ts:143-175`) — it never reconciles the half-written fill. Order entry itself is also non-atomic across the D1 insert and the DO route (`src/routes/trading.ts:454-465`).
- **No idempotency guard → retries double-fire.** Audit logs and notifications insert with a fresh `generateId()` and no UNIQUE constraint (`cascade.ts:2926`); `src/utils/deal-engine.ts:23` comments outright "check-then-insert with no DB UNIQUE guard." A DLQ replay, a client double-POST, or a cascade re-run therefore double-appends audit rows, double-enqueues actions, and double-notifies. The DLQ is write-only: the purge cron deletes resolved/abandoned rows >90d (`src/index.ts:341`) but nothing auto-reprocesses — replay is manual (`cascade.ts:2788`).

**Why it's one gap.** All three are the same missing primitive: **no atomic, idempotent boundary around a multi-statement fan-out.** Both the trade path and the cascade path hand-roll sequential `.run()`s and trust nothing fails in between.

**Build.** Wrap each all-or-nothing fan-out in a single D1 `batch([...])` (which *is* a transaction) — `persistMatch`'s six writes first (money path). Add an idempotency key (deterministic hash of `event + entity_id + stage`, UNIQUE) to the audit/notification/action inserts so replays and double-POSTs are no-ops — which also makes the DLQ safe to auto-drain. Give the DLQ a reprocessor cron (drain → retry → escalate), not just a purge. Target **L4** — this is settlement/audit integrity, not a feature.

## Gap 13 — Day boundaries are naive UTC, not SAST (P1)

SAST = UTC+2, no DST. The platform computes day keys as **naive UTC** almost everywhere: `.toISOString().slice(0,10)` appears **113 times** in `src/`, and exactly **one** function applies the `+02:00` offset (`src/routes/esums-accruals.ts:35`, tariff step parsing). Every other day boundary — shard bucketing, settlement windows, accrual rollups, VWAP mark dates — is UTC. For the two hours between 00:00 and 02:00 SAST (22:00–00:00 UTC), "today" in the code is yesterday in Johannesburg.

- **Shard/delivery-day misbucket.** `deriveShardKey` (`src/utils/matching.ts:181`) slices the client `delivery_date` unnormalized; a trade placed 01:00 SAST for delivery "2026-07-09" is 23:00 UTC on the 8th, while the settlement cron computing `yesterday` in UTC (`src/index.ts:249`) looks at the 8th. Order and settlement can land in different day buckets.
- **Settlement window is UTC.** The previous-day PPA run (cron `10 0 * * *` = 02:10 SAST) passes a UTC `yesterday` into `executeSettlementRun` (`src/routes/settlement-automation.ts:352`), and the reading-date window (`:472`) is UTC midnight-to-midnight — not the SAST trading day it means to settle.
- **Metering rollup misalignment.** Inverter `daily_kwh` resets at local SAST midnight, but the accrual rollup (cron `5 0 * * *`) queries the window from UTC midnight (`esums-accruals.ts:116`) — a 2-hour skew on every reading in the 00:00–02:00 UTC band.

**Build.** One `sastDayKey(instant)` helper (add +2h before slicing — a constant offset is correct since SA has no DST) routed through the day-boundary call sites: settlement window, shard/delivery-day derivation, accrual rollup, VWAP mark date first (money + regulatory). `matching.ts` normalizes the client `delivery_date` to a SAST day on the way in. Target **L4**. (This is a calibration knob, not just fewer lines — the physical grid runs on SAST; the clock has to match it.)

## Gap 14 — Connector reconciliation breaks are dead-end rows; the remediation chain exists but isn't wired (P2)

Seven external-system connectors (W122 SCADA, W124 STRATE/SWIFT, W125 SAP/Oracle ERP, W126 government-filing, and the W127–129 ML drift monitors) run nightly reconciliation sweeps. Each **detects** breaks and **counts** them — `reconciliation_break_count` / `_zar` feed a quality/health index (`src/routes/scada-connector.ts:128`, `src/routes/strate-swift-connector.ts:128`, `src/routes/sap-oracle-erp-connector.ts:134`) — and then stops. The ML monitors set `regulator_relevant=1` on drift (`src/routes/anomaly-detection-ml.ts:1227`, `rul-prediction-ml.ts`, `fault-fingerprint-ml.ts`) and stop. No break opens a case anyone is routed to.

The frustrating part: **the remediation workflow already exists.** W120 reconciliation-attestation is a full break-resolution state machine — `break_classified → root_cause_logged → remediation_proposed`, with a break taxonomy (`migrations/330_reconciliation_attestation.sql`). But its breaks are **manually admin-created**; there is **zero cascade wiring** from a connector detecting a break to an attestation being opened. A tracked break and a workflow that could resolve it live in the same system and never touch.

Inbound trust is fine on identity (all connectors verify an mTLS fingerprint, e.g. `scada-connector.ts:298-310`) but has **no replay protection** — no nonce, no idempotency key — the same missing primitive as Gap 12, on the ingress side.

**Build.** On a connector reconciliation detecting a break above threshold, `fireCascade` a `reconciliation.break_detected` event whose rule opens (or appends to) a W120 attestation case with the break metadata pre-filled, owner + SLA assigned — so detection routes into the existing remediation chain instead of dead-ending in a counter. Add a nonce/idempotency check on connector ingress (pairs with Gap 12). Target **L4** — this is exactly the rubric's L4 "structured reason codes + escalation + evidence chain," and it feeds L5 regulator exports.

---

## Suggested build order

The isolation/notification P1s share one modelling decision — a `visibility` + `ownerColumns` tag on every `MERIDIAN_CHAINS` entry. Land that once and Gaps 1, 2, 10, and 11 all build on it. The backbone P1s (12, 13) are independent and mechanical but gate correctness underneath everything else.

1. **Add `visibility: 'marketplace'|'bilateral'|'private'` + `ownerColumns` to `MERIDIAN_CHAINS`.** The shared substrate for the isolation/discovery cluster.
2. **Gaps 1 + 2 (P1 isolation).** `listChainCases` helper enforcing the tier; horizon appends the owner predicate. Security, and Gap 7 depends on them.
3. **Gap 12 (P1 write atomicity + idempotency).** `batch()` the fan-outs (`persistMatch` first — money path), add the idempotency key. Gap 10's double-notify and Gap 14's ingress both need this primitive to exist — land it before them.
4. **Gap 10 (kickoff notifications).** Same `ownerColumns` for recipients; renderer in `notification-engine.ts`. The idempotency key from step 3 stops the double-fire. Highest visible-value P1 after isolation.
5. **Gap 13 (P1 UTC→SAST day keys).** One `sastDayKey` helper across settlement / shard / accrual / VWAP. Independent and mechanical, but money + regulatory — don't let it ride.
6. **Gap 11 (unify marketplace + discovery front door).** Same `visibility` tag from the other side; fold the four marketplaces onto the `/deals` spine and give new-counterparty chains a discovery entry.
7. **Gap 5 (price single-source) + Gap 6 (carbon derivation).** Make "nobody re-keys" and "reconciliation" true instead of decorative; both feed regulator-grade exports.
8. **Gap 3 seams 2/3/4/6 + Gap 14 (wire connector breaks → W120).** Same "missing seam" family — each a cascade rule or a cron scan; Gap 14 needs step 3's cascade reliability.
9. **Gap 7** (needs 1+2), **Gap 8** (audit), **Gaps 4-guard / 9** (cheap hygiene).

## Honesty note carried from the exercise

All operational data behind these surfaces in the demo (devices, faults, work orders, predictions, telemetry, carbon vintages, MRV, the 18-month history) was **fabricated/back-dated demo data**, seeded per-surface. That per-surface seeding is *why* this exercise found the gaps: if the seams were wired, we'd have seeded one feed and watched it propagate. We didn't — we seeded each table. The gaps above are the list of seams that would have carried the data if they existed.
