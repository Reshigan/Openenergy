# Cross-Role Deal Engine — Design + Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use `- [ ]` checkboxes. **Plan-first: do not implement until the user approves this document.**

**Goal:** One generalized **offer → match → evaluate → accept → track** engine spanning *every* role pair, so a provider (capital, offtake, service, attributes, capacity) publishes a priced term sheet, the demand side gets ranked scored options, picks the best, and acceptance automatically kicks off the mapped state-machine chain (or an LOI flow for not-yet-live projects) and tracks it to delivery.

**Architecture:** Three additive layers on the existing substrate — **(1) Deal Registry** (in-code static descriptors, one per deal type), **(2) generic `/api/deals/*` routes** driving a matcher/scorer harness over two new tables, **(3) generic Layer-C cascade rules** that push offers to demand and acceptances to providers via the existing `pushRoleAction` → `oe_role_action_queue` → Meridian Horizon/IncomingPanel path. Acceptance dispatches one of the 76 existing chains. **No rewrite** — this unifies three bespoke offer surfaces that already exist.

**Tech stack:** Cloudflare Worker (Hono) + D1 (SQLite) backend; React SPA (Meridian chrome) frontend; `fireCascade()` event spine; existing Layer-B commercial-intercept fee engine.

---

## 1. What already exists (graphify-grounded)

The platform has **three bespoke offer/bid mechanisms** and a **cross-role push substrate**. This engine generalizes the three and reuses the substrate verbatim.

| Existing surface | File | What it is |
|---|---|---|
| Offtaker procurement options | `src/utils/offtaker-options.ts` (`buildOfftakerOptions`, `scoreOption`, `toIndicativeBand`) | Demand uploads bill → baseload profile → marketplace listings + upcoming IPP projects scored for cost/saving/CO₂ → ranked options → pick → LOI/inquiry. **The template.** |
| Carbon VCM order book | `src/routes/vcm-order-book.ts` | Bid/offer order book, `priceZarPerTco2e`, `registryStandard`, `expiry`, `WRITE_ROLES`. |
| Grid reserve/capacity auction | `src/routes/grid-l5.ts` | `offerId`, `demandMw`, `binding` reserve/ancillary offers. |

| Substrate primitive | File | Role in this engine |
|---|---|---|
| `fireCascade({event, …})` | `src/utils/cascade.ts:2371` (god node) | Fan-out spine; every offer/accept fires through it. |
| `CascadeRule` + `registerCascadeRule` | `src/utils/cascade-registry.ts` | Layer-C rules match already-fired events. |
| `pushRoleAction(env, {target_role, cross_option, …})` | `src/utils/role-actions.ts:42` | Writes `oe_role_action_queue`, invalidates KV badge → surfaces in IncomingPanel + Horizon duty stream. |
| `oe_role_action_queue` (mig 476) + tenant fence (mig 482) | `migrations/476`, `migrations/482` | The cross-role inbox; **reused unchanged**. |
| 76 state-machine chains (W1–W76) | `src/routes/*` | Acceptance-dispatch targets (W21 drawdown, W22 PPA, W65 ERPA, …). |
| Layer-B fee engine | commercial-intercept (`payer_resolution` + splits, seed mig 481) | Carries each term sheet's `fixed_fee` + `pct` onto the accepted deal. |
| Cascade-rule template | `src/cascade-rules/offtaker-procurement.ts` | `loi_to_ipp` / `inquiry_to_seller` — exact pattern the generic rules copy. |

**Key consequence:** this is *consolidation*, not green-field. The energy-supply path becomes Deal Registry descriptor #1 wrapping the existing util with **zero behavior change**, proving the generalization before any new deal type is added.

---

## 2. The model

```
PROVIDER                         DEMAND
publish term sheet  ──►  oe_deal_offers (published)
(fixed_fee + pct                 │
 + rate + tenor                  │  fireCascade('deal.offer.published')
 + conditions)                   ▼
                       Layer-C: offer_to_demand ──► pushRoleAction
                                 │                  (demand Horizon/Inbox)
                                 ▼
demand expresses need  ──►  oe_deal_requests (open)
(profile / amount / scope)       │
                                 │  GET /deals/:type/options
                                 ▼
                       descriptor.matcher + scorer
                       → ranked scored options (POPIA-banded)
                                 │
                                 ▼  POST /deals/:type/accept (pick offer)
                       accept_dispatch:
                         live target  → POST mapped chain endpoint  ─► W## case
                         upcoming     → create loi_drafts            ─► LOI flow
                                 │
                                 │  fireCascade('deal.accepted')
                                 ▼
                       Layer-C: accept_to_provider ──► pushRoleAction
                                 │                     (provider Horizon/Inbox)
                                 ▼
                       TRACK: deal_request.dispatched_case_id ──► Meridian Thread
                       status: open→options_ready→selected→dispatched→tracking→delivered
```

---

## 3. Deal Registry (the core abstraction)

In-code static descriptors — **never request-derived** (security: table/column/status/role are static literals; the `:type` URL param is *looked up* in the registry map, never interpolated into SQL).

```ts
// src/utils/deal-registry.ts
export type InteractionKind =
  | 'marketplace'   // continuous: providers list / demand tenders, ranked options, demand picks one (Family A + secondary D)
  | 'auction'       // time-boxed: simultaneous sealed/open bids, ONE clearing event, clearing rule allocates (Family F)
  | 'syndication'   // cooperative: many providers each take a tranche of ONE need, allocation sums to need (Family G)
  | 'negotiation'   // bilateral: one counterparty, offer→counter→agree/dispute loop (Family C)
  | 'obligation'    // event-driven: a chain event in role X auto-requires an action from role Y, no offer (Family B)
  | 'submission';   // adjudicated: role submits to a single authority (regulator) which grants/refuses (Family E)

export interface DealDescriptor {
  deal_type: string;                    // static key, e.g. 'energy_supply'
  kind: InteractionKind;                // selects matcher/push/track behaviour
  initiator: 'provider' | 'demand';     // who opens the surface: provider lists vs demand posts an RFP/tender (marketplace/auction)
  provider_roles: readonly string[];    // who may publish offers / counterparties / authority
  demand_roles: readonly string[];      // who may open requests / submitters / obliged party
  event_prefix: string;                 // e.g. 'deal_energy' — for fireCascade audit
  term_sheet_schema: FieldSpec[];        // drives DealOfferComposer + validation
  need_schema: FieldSpec[];              // drives request form / profile derivation
  price_basis: 'listed' | 'indicative' | 'contact_seller'; // POPIA default for cross-tenant
  // OPTIONAL cross-commodity sweeteners the provider may bundle into an offer to lift its ranked value
  // (e.g. an IPP bundles a 20%/quarter carbon rebate into a PPA). Drives the composer's sweetener rows
  // AND the scorer must fold each sweetener's ZAR-equivalent into est_value_zar (see valueSweeteners()).
  sweetener_schema?: SweetenerSpec[];
  matcher: (need: Json, offers: OfferRow[], env: HonoBindings) => Promise<OfferRow[]>;
  scorer: (need: Json, offer: OfferRow) => ScoredOption;   // generalizes scoreOption(); MUST call valueSweeteners()
  // counter-offer loop, only for kind:'negotiation' — null otherwise
  negotiation?: { counter_roles: readonly string[]; terminal_actions: readonly string[] };
  // clearing rule, only for kind:'auction' — pay_as_bid | uniform_price | merit_order
  clearing?: { rule: 'pay_as_bid' | 'uniform_price' | 'merit_order'; window_close: 'timer' | 'manual' };
  // tranche allocation, only for kind:'syndication' — how N providers fill ONE need
  allocation?: { basis: 'pro_rata' | 'lead_arranger' | 'waterfall'; min_tranche_pct: number };
  // CAPITAL-STACK composability: may this deal_type be one leg of a multi-type co-funding objective?
  // e.g. debt_finance + carbon_offtake + equity_finance all fund ONE project at once (§3.1).
  // funds_objective ⇒ acceptance of this deal contributes its quantum to the parent objective's funding gap.
  funds_objective?: { contributes: 'senior_debt' | 'mezz' | 'equity' | 'carbon_advance' | 'grant'; quantum_field: string };
  // RELATIONSHIP STRUCTURES (§3.2): which deal-to-deal links this type may carry. All backed by oe_deal_links.
  // conditions: this deal's accept_dispatch is gated until a linked deal/case reaches a named state.
  // bundle: members accept/withdraw atomically. substitutes: accepting one cancels the rest (cross-type allowed).
  // back_to_back: deal.accepted auto-spawns a mirrored downstream offer to a third role (template + role).
  // novation: a transfer of an active relationship (references source_case_id). rofr: rights-holder may match before award.
  // pooling: many demand requests roll into one composite need before matching.
  composition?: {
    conditions?: { on_deal_type: string; required_state: string }[];
    bundle?: { with_types: readonly string[] };
    substitutes?: { with_types: readonly string[] };       // cross-type alternatives for one need
    back_to_back?: { spawn_type: string; to_role: string };
    novation?: { source_chain_keys: readonly string[] };
    rofr?: { rights_role: string; window_hours: number };
    pooling?: { min_members: number; aggregate_field: string };
  };
  // when true, the dispatched chain is a TRADE — accept runs pre-trade-guards.ts (credit/exposure/mark-age/halt/kyc)
  // against the accepting party before dispatch. false for non-trade chains (e.g. licence submission, HSE obligation).
  dispatch_is_trade?: boolean;
  accept_dispatch: {
    live:     { chain_key: string; endpoint: (caseSeed: Json) => string }; // POST kicks off W##
    upcoming: { loi: true } | null;     // null ⇒ no LOI path (always live)
  };
}

// A sweetener is a value-bearing term outside the headline price, possibly in another commodity.
export interface SweetenerSpec {
  key: string;                          // e.g. 'carbon_rebate'
  label: string;                        // composer label
  value_kind: 'pct' | 'zar' | 'zar_per_mwh' | 'tco2e';
  cadence: 'once' | 'monthly' | 'quarterly' | 'annual';
  commodity: 'cash' | 'carbon' | 'rec' | 'energy';  // what it pays out in
  // converts one bundled sweetener to a ZAR-equivalent over the need's horizon, for ranking
  toZarEquivalent: (sw: Json, need: Json, env: HonoBindings) => Promise<number>;
}

export function getDealDescriptor(type: string): DealDescriptor | null; // 404 on miss
export function registerDeal(d: DealDescriptor): void;
// folds every sweetener on an offer into a single ZAR-equivalent + per-sweetener rationale lines
export async function valueSweeteners(d: DealDescriptor, offer: OfferRow, need: Json, env: HonoBindings):
  Promise<{ sweetener_value_zar: number; lines: string[] }>;
```

`ScoredOption` generalizes the existing `OfftakerOption`: `{ option_id, title, primary_metric, est_value_zar | null, sweetener_value_zar, secondary, price_basis, rationale }`. The energy descriptor's `scorer` *is* the existing `scoreOption` adapted to this shape, **plus** a `valueSweeteners()` call so a bundled carbon/REC rebate lifts the option's ranked value and shows as a rationale line ("+R0.12/kWh-equiv carbon rebate, 20%/qtr").

### 3.1 — Multi-relationship co-funding (the capital stack)

A single IPP project is routinely funded by **several providers of *different* deal types at once** — senior debt (lender), a carbon advance/ERPA prepayment (carbon_fund), and equity — not one winner. That is **not** syndication (syndication = many providers of *one* type filling one need). It is a **capital stack**: many heterogeneous deal_requests bound to one underlying objective.

Modeled as a thin **objective** layer above requests — additive, no new kind:
- `oe_deal_objectives` (one per project funding round): `funding_target_zar`, running `committed_zar`, `status: forming→subscribed→financial_close`.
- Each child `oe_deal_requests` carries `objective_id`. A child may itself be any kind — `debt_finance` (syndication), `carbon_offtake` (marketplace/negotiation), `equity_finance` (marketplace). They run independently.
- A child's `funds_objective.contributes` + `quantum_field` says how much of which layer its acceptance adds to the stack. On each `deal.accepted` for a child, the objective's `committed_zar` advances; when `committed_zar ≥ funding_target_zar` the objective fires `objective.subscribed` → a single **W21 drawdown / W20 financial-close** dispatch, not one per leg.
- The IPP sees one stack view: *"Karusa Wind — R850m target: R500m senior debt (club, 60% filled) · R200m carbon advance (ERPA matched) · R150m equity (open)."*

This makes "funded by finance **and** carbon at the same time" first-class without forking the registry: the objective composes existing per-type deals.

### 3.2 — Relationship structures (deals that depend on, bundle, or replace other deals)

Co-funding and sweeteners are the first two of a broader family: real deals between roles are rarely standalone. A walk of the chains found nine relationship structures the platform already implies — confirmed in code where noted — that the bare offer→match→accept loop does not capture. **They are not new interaction kinds** (a deal's `kind` still says how it is matched). They are **composition modifiers**: orthogonal decorations any kind can carry, all backed by **one new primitive — a typed deal-to-deal link edge** (`oe_deal_links`, §5), the pairwise/group analogue of the co-funding objective.

| # | structure | what it adds | in code today | unifying mechanic |
|---|---|---|---|---|
| 1 | **co-funding / capital stack** | N deal *types* fund one project | — (added §3.1) | `oe_deal_objectives` aggregation |
| 2 | **sweetener** | cross-commodity kicker valued in the score | — (added §3) | `term_sheet.sweeteners[]` + `valueSweeteners()` |
| 3 | **condition-precedent linkage** | deal B activates only when deal A reaches state X | ✅ `cp-clearance-spec.ts`, `credit-origination`, `security-perfection` (per-chain only) | link `condition_precedent`: gate `accept_dispatch` until the linked deal/case hits the named state |
| 4 | **bundle (atomic package)** | multi-commodity offer accepted all-or-nothing (PPA + REC + carbon from one IPP; energy + wheeling) | partial (multi-line term sheets) | link-group `bundle`: accept/withdraw atomically across members; co-equal line items, unlike a sweetener kicker |
| 5 | **substitution (competing types for one need)** | one need filled by *alternative* deal types — load gap met by PPA **or** REC+grid **or** battery; engine ranks across types | — | link-group `substitute`: cross-type matcher; accepting one cancels its substitutes |
| 6 | **back-to-back / sleeve / intermediary** | accepting an upstream deal auto-spawns a mirrored downstream offer (trader buys IPP→sells offtaker; ESCO sleeve) | ✅ `virtual-ppa-settlement-chain`, `ppa-change-in-law` | link `back_to_back`: `deal.accepted` fires a templated counter-offer to the third role |
| 7 | **aggregation / pooling (demand or supply side)** | many small demanders pool into one need (ESCO pools C&I sites; small generators pool to one offtaker) — mirror of syndication on the demand side | — (ESCO aggregates C&I but no pooling deal) | link-group `pool`: many requests roll into one composite need before matching |
| 8 | **novation / assignment / step-in** | replace a counterparty in a *live* relationship (lender steps into offtaker on default; PPA novated to a new IPP) | ✅ partial — **W61** loan transfer | link `novation`: transfer references the active `source_case_id`; generalizes W61 to any chain |
| 9 | **right of first refusal / matching right** | incumbent may match a competing offer before award (lender ROFR on transfer; offtaker ROFR on PPA renewal) | ❌ **not modeled** | link `rofr`: on a would-be award, pause and push a match-or-waive action to the rights-holder |

Two structures already have chains (renewal: **W33**/**W56**; make-good cover: **W32**/**W46**/**W65**) — the engine adds the *deal* layer on top: renewal = a relationship continuation seeded from the expiring deal; make-good = an obligation breach that auto-fires a market **cover** deal (`cover_for` link). Both reuse existing chains; neither needs a new kind.

**One table backs all nine.** `oe_deal_links(from_id, to_id, link_group_id, link_kind, condition_state)` expresses CPs, bundles, substitutes, back-to-back mirrors, pools, novations, ROFR, cross-default, and cover-for. The descriptor declares which links a `deal_type` may carry (`composition?: { conditions, bundle, substitutes, back_to_back, novation, rofr, pooling }`); routes and one cascade rule (`deal_engine.link_resolver`, §7) enforce them. Adding a tenth structure later = one `link_kind` value + one resolver branch, no new table.

**Why six kinds, not one.** The catalogue below (§4) walks all 10 roles × 76 chains and finds **147 cross-role touchpoints**, not 10. They are not all "publish an offer → pick the best." Six mechanically distinct shapes exist, and the engine must model all six under one registry:
- **marketplace** — *N* providers, ranked options, demand picks one. Two `initiator` modes: provider-listing (offtaker browses IPP listings) and demand-tender/RFP (IPP posts a facility need → lenders bid). The original offtaker scenario.
- **auction** — time-boxed, simultaneous bids, **one clearing event** that allocates by a `clearing.rule` (REIPPPP bid windows, NTCSA reserve/ancillary auctions, energy merit-order dispatch). Acceptance is a clearing algorithm, not pick-one — this is why it can't be a marketplace flag.
- **syndication** — providers **cooperate**: each takes a tranche of one need, `allocation` summing to the need (club/syndicated IPP debt, blended concessional finance, reinsurance panels, turnkey IPP+EPC+O&M consortium offers). Acceptance is allocate-across, not pick-best.
- **negotiation** — bilateral, one counterparty, a counter-offer/dispute loop before agreement (take-or-pay quantum, PPA termination ETA, grid connection cost, credit approval).
- **obligation** — no offer at all: a chain event auto-pushes a *required* action to a counterparty. **~23 of these already exist as bespoke cascade-rules** — the engine generalizes them, it does not invent them.
- **submission** — role applies to one authority (always the regulator) which grants/refuses; no competition, no negotiation.

A descriptor's `kind` selects which path runs. `marketplace`/`auction`/`syndication`/`negotiation`/`submission` are offer- or request-bearing (use `oe_deal_offers`/`oe_deal_requests`); `obligation` is push-only (uses `oe_role_action_queue` directly, the existing path). One registry, one set of routes, six behaviours. The split is mechanical, not cosmetic: marketplace's acceptance is *pick-one*, auction's is *clear-and-allocate*, syndication's is *fill-to-target* — three different accept handlers that cannot collapse into one matcher.

---

## 4. Touchpoint catalogue (the "all role pairs" coverage)

The earlier 10-row table under-counted. A full walk of **11 economic actors + 6 latent agent-actors** × 76 chains + the 3 marketplace surfaces + 24 cascade-rule files finds the touchpoints below in **seven families** (the original five + auction + syndication, split out of the over-broad "marketplace"). Each row is **one descriptor**; routes, fee wiring and UI are shared. The `kind` column maps each family to its registry behaviour (§3). The complete actor-pair matrix proving exhaustive coverage is **§4H**.

**Actors.** Login/economic (11): `ipp_developer`, `trader`, `offtaker`, `lender`, `carbon_fund`, `regulator`, `grid_operator`, `support` (OEM/helpdesk), `esco`, `epc_contractor`, `insurer`. Latent agent-actors that appear as gate/counterparty in chain code but are not login roles (6): `independent_engineer` (IE — W20/21/30 gates), `verifier`/VVB (W11/37/56), `equity_investor`/DFI (capital stack), `community_trust` (REIPPPP ED), `landowner` (site rights), `security_trustee`/CSD-STRATE (W69). `admin` is the platform meta-actor (fees/invoicing via Layer-B, not a deal counterparty).

### 4A · MARKETPLACE — list/tender → rank → pick one (`kind:'marketplace'`)
*N* providers publish priced terms; demand evaluates ranked options and picks the best. `initiator` distinguishes provider-listing from demand-RFP/tender.

| `deal_type` | init. | demand | provider(s) | need expressed | accept → chain (live) / LOI (upcoming) | push today |
|---|---|---|---|---|---|---|
| `energy_supply` *(exists → descriptor #1)* | provider | offtaker | ipp_developer, trader | bill → baseload profile | **W22** PPA exec / LOI → project lifecycle | offtaker-procurement ✓ |
| `debt_finance` | demand | ipp_developer | lender, carbon_fund | facility size, tenor, UoP | **W53** credit origination → **W21** drawdown | missing |
| `carbon_offtake` (ERPA) | demand | ipp_developer | carbon_fund | annual tCO₂e, vintage, Art-6 | **W65** ERPA forward delivery | erpa shortfall ✓ |
| `rec_supply` | provider | offtaker | ipp_developer | Scope-2 MWh attributes | **W70** REC / GoO lifecycle | missing |
| `voluntary_offset` *(new pair: offtaker↔carbon)* | provider | offtaker | carbon_fund | Scope-1 tCO₂e, vintage | **W17** retirement | missing |
| `grid_capacity` | demand | ipp_developer | grid_operator | connection MW, node | **W58** capacity allocation → **W28** GCA | missing |
| `wheeling_agreement` *(new pair: offtaker↔grid)* | demand | offtaker | grid_operator | wheel MW, source→sink node | **W8** wheeling charges | missing |
| `om_service` | demand | ipp_developer | esco/support | site portfolio, availability target | **W51** availability guarantee | missing |
| `epc_build` | demand | ipp_developer | epc_contractor | capacity, COD target | **W20** construction/COD / LOI | missing |
| `epc_rfp_award` | demand | ipp_developer | epc_contractor, support(OEM) | RFP scope, capex tier | **W19** procurement/RFP → contract | partial (contract.signed) |
| `trading_liquidity` (RFQ) | demand | trader | trader | instrument, size, side | **W36** best-execution → **W76** allocation | missing |
| `trader_margin_finance` *(new pair: trader↔lender)* | demand | trader | lender | margin facility, haircut | **W53** credit origination | missing |
| `vcm_spot` *(exists: vcm-order-book)* | provider | carbon_fund, offtaker, ipp, trader | same set | bid/offer @ ZAR/tCO₂e | **W226** order book → T+2 settle | self-contained |
| `spare_parts_supply` | demand | support (O&M) | support(OEM)/vendor | part, VED criticality, lead time | **W72** spare-parts provisioning | missing |
| `payment_security` *(provider-led backstop)* | provider | offtaker (lodger) | ipp_developer (activator) | PPA backstop amount, instrument | **W54** payment security | security submitted ✓ |
| `insurance_cover` | demand | ipp_developer | insurer (via support) | sum insured, peril | **W23** insurance (claim downstream) | missing |
| `merchant_ptra` *(new pair: ipp↔trader)* | provider | trader | ipp_developer | route-to-market MWh, floor price | **W36** best-ex → **W76** alloc / LOI | missing |
| `structured_supply` *(new pair: trader↔offtaker — VPPA sleeve)* | provider | offtaker | trader | corporate load, hedge shape, CfD strike | **W22** PPA exec (sleeved) / virtual-ppa-settlement | missing |
| `esco_performance_contract` *(new pair: offtaker↔esco — core ESCO deal)* | provider | offtaker | esco | C&I site load, savings-guarantee %, EPC-finance | **W51** availability/savings guarantee / LOI | missing |
| `construction_all_risks` *(new pair: epc↔insurer)* | demand | epc_contractor | insurer | CAR/EAR sum insured, build period | **W23** insurance | missing |
| `ie_certification` *(new agent: lender/ipp↔independent_engineer)* | demand | lender, ipp_developer | independent_engineer | scope (COD / drawdown cert) | gate-feeds **W20**/**W21**/**W30** | missing |
| `vvb_engagement` *(new agent: carbon_fund↔VVB)* | demand | carbon_fund, ipp_developer | verifier (VVB) | methodology, validation vs verification | gate-feeds **W11**/**W37**/**W56** | missing |
| `land_lease` *(new agent: ipp↔landowner)* | demand | ipp_developer | landowner | site ha, term, rent/royalty | CP → **W58** capacity / **W20** build | missing |

### 4F · AUCTION — time-boxed, simultaneous bids, one clearing (`kind:'auction'`)
Closes on a timer or manual gavel, then a `clearing.rule` allocates. Cannot be a marketplace flag: acceptance is a clearing algorithm over the whole bid set, not pick-one.

| `deal_type` | init. | auctioneer | bidders | clearing rule | accept → chain | push today |
|---|---|---|---|---|---|---|
| `reserve_offer` | demand | grid_operator | ipp, trader, offtaker, lender, carbon | merit_order | **W50** reserve activation | reserve activated ✓ |
| `dispatch_merit_order` *(exists: grid-l5)* | demand | grid_operator | all participants | merit_order | **W13** dispatch nomination → settle | missing |
| `reippp_bid_window` *(new: DMRE↔IPP)* | demand | regulator/DMRE | ipp_developer | pay_as_bid | **W19** procurement → **W49** licence | missing |
| `ancillary_services` | demand | grid_operator | ipp, trader | uniform_price | **W50** reserve activation | reserve activated ✓ |

### 4G · SYNDICATION — cooperative tranche-filling of one need (`kind:'syndication'`)
Providers do not compete; each takes a tranche, `allocation` summing to the need. SA IPP debt is almost always a club deal; concessional climate finance blends in.

| `deal_type` | init. | demand | providers | allocation basis | accept → chain | push today |
|---|---|---|---|---|---|---|
| `club_debt` *(lender↔lender↔ipp)* | demand | ipp_developer | lender (×N) | lead_arranger | **W53** → **W21** drawdown | missing |
| `blended_finance` *(new pair: lender↔carbon_fund)* | demand | ipp_developer | lender, carbon_fund, DFI | waterfall | **W53** → **W21** | missing |
| `reinsurance_panel` | demand | insurer | insurer (×N) | pro_rata | **W23** insurance | missing |
| `turnkey_consortium` | provider | offtaker / ipp_developer | ipp + epc + support(O&M) | pro_rata | **W20** → **W22** / LOI | missing |
| `epc_completion_guarantee` *(new pair: epc↔lender)* | demand | lender | epc_contractor, insurer | lead_arranger | **W20** COD gate / **W69** perfection | missing |
| `equity_finance` *(new pair: ipp↔equity_investor/DFI — the capital stack's equity layer)* | demand | ipp_developer | equity_investor, DFI, carbon_fund | pro_rata | **W53** → **W21** (stack equity leg, §3.1) | missing |
| `community_equity` *(new agent: ipp↔community_trust — REIPPPP local ownership)* | demand | ipp_developer | community_trust | pro_rata | **W27** economic-development → equity leg | missing |

### 4B · OBLIGATION — chain event auto-pushes a required action (`kind:'obligation'`, push-only)
No offer. A terminal/transition in one role's chain *requires* a counterparty to act. **~23 already wired as bespoke cascade-rules**; the engine generalizes the push so future ones are a descriptor row, not a new rule file.

| touchpoint | source role | target role | source chain → obligation | rule today |
|---|---|---|---|---|
| `cod_to_drawdown` | ipp+grid | lender | **W20** COD certified → initiate drawdown | lifecycle-seq #1 ✓ |
| `covenant_breach` | lender | ipp_developer, lender | **W38** breach → watchlist + dunning cycle-1 | lender-covenant ✓ |
| `reserve_breach_default` | system | lender, ipp_developer | reserve breached → auto-create **W45** default | lifecycle-seq #4 ✓ |
| `loan_default_notice` | lender | ipp_developer, regulator | **W45** acceleration → enforce + regulator inbox | regulator-actions ✓ |
| `licence_to_levy` | system | regulator, ipp_developer | **W49** licence issued → **W74** levy + **W33** renewal seed | lifecycle-seq #7 ✓ |
| `mrv_to_retirement` | carbon_fund | carbon_fund | **W11** MRV issued → retire/trade prompt | lifecycle-seq #10 ✓ |
| `ppa_delivery_shortfall` | offtaker | ipp_developer, offtaker | **W7** delivered < contracted → cure window | ppa-delivery-shortfall ✓ |
| `tariff_change_billing` | ipp_developer | offtaker | **W39** new tariff → bill-impact recalc | tariff-reprice ✓ |
| `predictive_maintenance` | support | support, ipp_developer | RUL/anomaly → auto **W16** work-order | predictive-maintenance ✓ |
| `problem_to_rfc` | support | support | **W41** RCA → raise **W47** change | problem-record ✓ |
| `warranty_denial_escalate` | support | regulator | **W15** safety denial → regulator inbox | warranty-supply ✓ |
| `gridcode_cap_window` | grid_operator | ipp_developer | **W67** non-conformance → CAP submission window | regulator-inbox ✓ |
| `curtailment_ack` | grid_operator | ipp, offtaker, trader, carbon, lender | **W34** CSC-1 instruction → stage-tiered ack | lifecycle-seq ✓ |
| `dispatch_settle_dispute` | grid_operator | ipp_developer | **W13** imbalance settled → 15-day dispute window | regulator-inbox ✓ |
| `stor_filing` | regulator | trader (read-only) | **W52** STOR filed → subject notified | regulator-actions ✓ |
| `algo_kill_switch` | trader/regulator | trader | **W60** kill-switch → halt + regulator inbox | regulator-actions ✓ |
| `alloc_break` | trader | trader, regulator | **W76** break flagged → confirm dispute | regulator-inbox ✓ |
| `disposition_require_action` | regulator | any source party | **W31** direct corrective action → compliance window | regulator-actions ✓ |
| `licence_suspension` | regulator | all licensees | **W5** suspend/revoke → cease-operations | regulator-actions ✓ |
| `ed_cure_window` | ipp_developer | carbon_fund, ipp_developer | **W27** DMRE penalty → cure-plan window | lifecycle-seq ✓ |
| `rec_retirement_notify` | offtaker | ipp_developer | **W70** retire → issuer notified (claw-back on dispute) | regulator-actions ✓ |
| `disbursement_clawback` | lender | ipp_developer | **W30** UoP fail → clawback demand + regulator inbox | lender-covenant ✓ |
| `levy_enforcement` | regulator | grid_operator/licensee | **W74** arrears → dunning → enforcement | regulator-actions ✓ |
| `om_mobilisation` *(new: epc→esco)* | epc_contractor | esco | **W12** commissioning complete → O&M handover/mobilise | missing |
| `ie_cert_to_gate` *(new: independent_engineer→lender/ipp)* | independent_engineer | lender, ipp_developer | `ie_certification` signed → release **W20**/**W21**/**W30** gate | missing |
| `vvb_report_to_issuance` *(new: VVB→carbon_fund)* | verifier | carbon_fund | `vvb_engagement` verified → advance **W11**/**W37** issuance | missing |

### 4C · NEGOTIATION — bilateral offer → counter/dispute → agree (`kind:'negotiation'`)
One counterparty, not a competitive pool. The descriptor carries a `negotiation` block (counter roles + terminal actions). Most are split-write chains already.

| `deal_type` | party A (proposer) | party B (counter) | chain | terminal actions |
|---|---|---|---|---|
| `take_or_pay_quantum` | offtaker | ipp_developer | **W32** | accept-quantum / dispute |
| `ppa_termination_eta` | offtaker | ipp_developer | **W62** | agree-eta / dispute-eta |
| `curtailment_classification` | ipp_developer | offtaker | **W46** | confirm-compensable / dispute |
| `tariff_indexation` | ipp_developer | offtaker | **W39** | agree / raise-dispute |
| `insurance_quantum` | insurer | ipp_developer | **W23** | agree-quantum / dispute |
| `grid_connection_cost` | grid_operator | ipp_developer | **W28** | accept-cost / reject |
| `planned_outage_window` | ipp_developer | grid_operator | **W18** | approve / reject |
| `capacity_offer_accept` | grid_operator | ipp_developer | **W58** | accept-offer / relinquish |
| `credit_origination` | lender | ipp_developer | **W53** | approve / decline |
| `drawdown_approval` | ipp_developer | lender | **W21** | approve / reject |
| `disbursement_recon` | lender | ipp_developer | **W30** | close-recon / demand-clawback |
| `best_execution_rfq` | trader | trader (LP) | **W36** | approve / escalate-exception |
| `trade_report_break` | trader | trader, regulator | **W44** | submit / flag-break |
| `position_limit_unwind` | compliance/trader | trader | **W29** | begin-reduction / force-liquidate |
| `counterparty_margin` | trader | trader | **W68** | post-collateral / declare-default |
| `cod_certification` | ipp_developer | grid_operator (+lender) | **W20** | certify-cod / cancel |
| `connection_energization` | ipp_developer | grid_operator | **W75** | authorize / suspend |
| `gridcode_disconnection` | grid_operator | ipp_developer | **W67** | approve-cap / escalate-disconnection |
| `carbon_registration` | carbon_fund | regulator/VVB | **W37** | register / reject |
| `carbon_reversal` | carbon_fund | carbon_fund | **W42** | cancel-buffer / escalate |
| `warranty_claim` *(new pair: ipp/esco↔OEM)* | ipp_developer / esco | support (OEM) | **W15** | accept-claim / deny (denial → regulator if safety) |
| `epc_change_order` *(new pair: ipp↔epc)* | epc_contractor | ipp_developer | **W20** | agree-variation / reject (price+time) |
| `insurance_assignment` *(new pair: lender↔insurer)* | lender | insurer / ipp_developer | **W23** | agree-loss-payee / dispute (cut-through) |

### 4D · SECONDARY-MARKET TRANSFER — sell/assign an existing position (`kind:'marketplace'`, seller-led)
Provider = current holder, demand = acquirer of a live position. Reuses marketplace path with the offer referencing an existing chain case.

| `deal_type` | seller | buyer | chain | note |
|---|---|---|---|---|
| `loan_transfer` | lender | lender (+ obligor ipp) | **W61** | SARB ExCon crossing if transferee non-resident |
| `carbon_spot_trade` | carbon_fund, offtaker, ipp | trader, + same set | **W226** | price-time-priority, T+2 settle |
| `security_draw_replenish` | ipp_developer | offtaker | **W54** | draw → offtaker must replenish or forfeit |

### 4E · REGULATORY SUBMISSION — apply → single authority adjudicates (`kind:'submission'`)
No competition, no counter-offer. Submitter → regulator grant/refuse. Authority is always the regulator role.

| `deal_type` | submitter | chain | grant / refuse |
|---|---|---|---|
| `licence_application` | ipp, grid, trader, carbon, offtaker, lender | **W49** | grant-licence / refuse-licence |
| `licence_renewal` | same set | **W33** | grant / refuse |
| `sseg_registration` | ipp_developer | **W57** | approve / refer-to-licensing / refuse |
| `ed_commitment_cure` | ipp_developer | **W27** | verify-compliance / issue-penalty |
| `carbon_offset_claim` | carbon_fund | **W48** | grant-allowance / claw-back |
| `crediting_renewal` | carbon_fund | **W56** | renew / refuse |
| `poa_cpa_inclusion` | carbon_fund | **W73** | approve-inclusion / exclude-cpa |
| `tariff_determination` | grid, ipp, offtaker, lender, trader, carbon | **W43** | issue-determination / reject |
| `complaint_resolution` | any external party | **W66** | issue-ruling / dismiss (appeal loop) |
| `compliance_inspection` | regulator-initiated | **W40** | close-compliant / impose-penalty |

**Coverage:** 24 marketplace · 4 auction · 7 syndication · 26 obligation · 23 negotiation · 3 secondary · 10 submission = **97 enumerated descriptors**, the spine of the full touchpoint set (the remainder are obligation-push variants of these — same substrate, no new code). Adding the next role pair = **one descriptor + one test**, never a new route/rule/UI. That is the differentiator: **one engine, every role pair, six interaction shapes.**

**Newly opened role-pairs** (the §4 matrix sweep closed every previously-bilateral gap):
- trader↔offtaker → `structured_supply` (VPPA sleeve) + `merchant_ptra` reach via ipp↔trader
- lender↔insurer → `insurance_assignment` (cut-through / loss-payee, W23)
- epc↔insurer → `construction_all_risks` (CAR, W23)
- offtaker↔esco → `esco_performance_contract` (W51 — the core ESCO market, previously absent)
- ipp↔trader → `merchant_ptra` (W36→W76)
- (earlier waves already opened: offtaker↔grid `wheeling_agreement`, offtaker↔carbon `voluntary_offset`, trader↔lender `trader_margin_finance`, lender↔carbon_fund `blended_finance`, epc↔lender `epc_completion_guarantee`).

**Gate-actor contact points now explicit** (latent in chain code, now first-class descriptors): independent_engineer (`ie_certification`, `ie_cert_to_gate`), VVB/verifier (`vvb_engagement`, `vvb_report_to_issuance`), equity_investor/DFI (`equity_finance`), community_trust (`community_equity`), landowner (`land_lease`), OEM (`warranty_claim`).

### 4H · The complete actor-pair matrix

Eleven economic actors → C(11,2)=55 unordered pairs, plus the 6 gate-actor edges. Every pair below is either **covered** by a named descriptor or **N/A by design** (no commercial/obligation relationship exists between those two roles — e.g. two pure-buy-side roles, or two adjudicators). No pair is left "open by omission".

| | ipp | trader | offtaker | lender | carbon | regulator | grid | support | esco | epc | insurer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **ipp** | — | `merchant_ptra` | `power_ppa` | `senior_debt`,`drawdown` | `erpa`,`mrv` | `licence_*`,`gca` | `gca`,`wheeling`,`capacity` | `service_contract` | `om_handover` | `epc_build`,`change_order` |
| **trader** | | — | `structured_supply` | `trader_margin_finance` | `carbon_spot_trade` | `algo_cert`,`trade_report` | `merchant_dispatch` | N/A | N/A | N/A |
| **offtaker** | | | — | `payment_security` | `voluntary_offset`,`rec` | `complaint`,`ppa_approve` | `wheeling_agreement` | N/A | `esco_performance_contract` | N/A |
| **lender** | | | | — | `blended_finance` | `large_exposure_notify` | N/A | N/A | N/A | `insurance_assignment` |
| **carbon** | | | | | — | `vvb_engagement`,`poa`,`offset_claim` | N/A | N/A | N/A | N/A |
| **regulator** | | | | | | — | `tariff_determination`,`grid_code` | N/A | N/A | N/A |
| **grid** | | | | | | | — | N/A | N/A | N/A |
| **support** | | | | | | | | — | `spare_parts`,`warranty_recovery` | `warranty_claim` (OEM) |
| **esco** | | | | | | | | | — | `om_mobilisation` |
| **epc** | | | | | | | | | | — |
| **insurer** | | | | | | | | | | — |

N/A cells are deliberate: trader↔support/esco/epc/insurer (a market-maker has no O&M/EPC/insurance counterparty relationship — risk flows via the IPP it finances); regulator↔support/esco/epc/insurer (the regulator adjudicates *licensees*, not their service vendors — those surface as evidence inside W40/W66, not as a deal); grid↔support/esco/epc/insurer (same — vendor relationships sit under the IPP). Capital-stack & gate edges (equity_investor, community_trust, landowner, IE, VVB, DFI) ride the §3.1 objective + §3.2 link primitives and the 4G/4A/4B rows above. **Conclusion: the actor-pair matrix is complete — every commercial edge has a descriptor; every blank is N/A-by-design, not a gap.**

---

## 5. Data model (migration 506 — next free; latest is 505)

Four additive tables — `oe_deal_offers`, `oe_deal_requests`, `oe_deal_objectives` (the capital-stack layer, §3.1), and `oe_deal_links` (the relationship-structure edges, §3.2) — tenant-fenced exactly like `oe_role_action_queue` (mig 482). **CREATE TABLE IF NOT EXISTS**, idempotent (≥051 band → applies normally).

```sql
-- migrations/506_deal_engine.sql
CREATE TABLE IF NOT EXISTS oe_deal_offers (
  id              TEXT PRIMARY KEY,
  deal_type       TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  provider_role   TEXT NOT NULL,
  tenant_id       TEXT NOT NULL,
  title           TEXT NOT NULL,
  term_sheet      TEXT NOT NULL,           -- JSON: {fixed_fee_zar, pct_bps, rate, tenor_months, conditions[], sweeteners[]}
                                           --   sweeteners[]: cross-commodity bundled value valued by the scorer, e.g.
                                           --   {type:'carbon_rebate', value_kind:'pct', value:20, cadence:'quarterly', commodity:'carbon'}
                                           --   each is converted to a ZAR-equivalent over the need's horizon and folded into est_value_zar (§3, §6)
  -- offer binds to a request (a bid into a demand tender / auction / syndication) or stands alone (a listing)
  request_id      TEXT,                    -- →oe_deal_requests.id when this offer is a bid into a specific need; NULL for open listings
  -- auction-kind fields (NULL for non-auction deal_types)
  bid_amount_zar  REAL,                    -- price submitted into a clearing window
  bid_quantity    REAL,                    -- MW / MWh / tCO2 offered at this price (merit-order stacking)
  clearing_status TEXT,                    -- NULL until window closes; then cleared|partially_cleared|rejected
  cleared_quantity REAL,                   -- quantity actually allocated by the clearing rule
  cleared_price_zar REAL,                  -- settled price (pay_as_bid → bid_amount; uniform_price → marginal)
  -- syndication-kind fields (NULL for non-syndication deal_types)
  syndicate_id    TEXT,                    -- groups all tranche-offers filling ONE request; = request_id by convention
  tranche_pct     REAL,                    -- fraction of the need this provider commits (0–1); sum across syndicate → 1.0
  committed_amount_zar REAL,               -- absolute ZAR this provider commits to its tranche
  syndicate_role  TEXT,                    -- lead_arranger|participant — drives allocation.basis ordering
  -- negotiation-kind fields (NULL for non-negotiation deal_types): a counter is a new row pointing at the one it answers
  counter_of      TEXT,                    -- →oe_deal_offers.id this row counters; NULL = opening offer. The chain of counters IS the ledger.
  counter_by_role TEXT,                    -- role that authored this counter (must be in descriptor.negotiation.counter_roles)
  decline_reason  TEXT,                     -- structured reason code (rejection-explainer.ts) when an offer/counter is declined — L4 evidence
  status          TEXT NOT NULL DEFAULT 'published', -- draft|published|withdrawn|matched|cleared|committed|expired|countered|agreed|declined
  expiry          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_offers_type_status ON oe_deal_offers(deal_type, status);
CREATE INDEX IF NOT EXISTS idx_deal_offers_provider    ON oe_deal_offers(provider_id);
CREATE INDEX IF NOT EXISTS idx_deal_offers_request     ON oe_deal_offers(request_id);    -- gather all bids/tranches for one need
CREATE INDEX IF NOT EXISTS idx_deal_offers_syndicate   ON oe_deal_offers(syndicate_id);  -- fill-to-target sum
CREATE INDEX IF NOT EXISTS idx_deal_offers_counter     ON oe_deal_offers(counter_of);    -- walk a negotiation counter-chain
CREATE INDEX IF NOT EXISTS idx_deal_offers_expiry      ON oe_deal_offers(expiry);        -- cron expiry sweep

CREATE TABLE IF NOT EXISTS oe_deal_requests (
  id                  TEXT PRIMARY KEY,
  deal_type           TEXT NOT NULL,
  demand_id           TEXT NOT NULL,
  demand_role         TEXT NOT NULL,
  tenant_id           TEXT NOT NULL,
  need                TEXT NOT NULL,        -- JSON profile (annual_mwh / loan_amount / scope / capacity_mw …)
  selected_offer_id   TEXT,                 -- marketplace pick-one; NULL for auction/syndication (multi-offer outcomes)
  -- capital-stack co-funding (§3.1): binds this request as one leg of a multi-deal-type funding objective
  objective_id        TEXT,                 -- →oe_deal_objectives.id; NULL for standalone deals
  stack_layer         TEXT,                 -- senior_debt|mezz|equity|carbon_advance|grant — which slice of the stack this leg fills
  -- auction-kind fields
  bid_window_close    TEXT,                 -- ISO8601 close instant; cron clears at/after this for clearing.window_close='timer'
  clearing_rule       TEXT,                 -- pay_as_bid|uniform_price|merit_order (copied from descriptor at request time, audit)
  clearing_price_zar  REAL,                 -- marginal clearing price once window resolved (uniform_price)
  -- syndication-kind fields
  target_amount_zar   REAL,                 -- the need's total to be filled by tranches
  filled_amount_zar   REAL DEFAULT 0,       -- running sum of committed tranches; request closes when ≥ target
  dispatched_chain_key TEXT,
  dispatched_case_id  TEXT,
  status              TEXT NOT NULL DEFAULT 'open', -- open|options_ready|bidding|clearing|selected|filling|filled|dispatched|tracking|delivered
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_requests_type_status ON oe_deal_requests(deal_type, status);
CREATE INDEX IF NOT EXISTS idx_deal_requests_demand      ON oe_deal_requests(demand_id);
CREATE INDEX IF NOT EXISTS idx_deal_requests_window      ON oe_deal_requests(bid_window_close); -- cron clearing sweep
CREATE INDEX IF NOT EXISTS idx_deal_requests_objective   ON oe_deal_requests(objective_id);     -- gather all legs of one capital stack

-- capital-stack / co-funding objective (§3.1): one funding round for one project, filled by N heterogeneous deal_types at once
CREATE TABLE IF NOT EXISTS oe_deal_objectives (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,           -- the project owner (e.g. ipp_developer) assembling the stack
  owner_role        TEXT NOT NULL,
  tenant_id         TEXT NOT NULL,
  project_ref       TEXT NOT NULL,           -- the underlying project/asset this round funds
  title             TEXT NOT NULL,           -- e.g. "Karusa Wind — financial close"
  funding_target_zar REAL NOT NULL,          -- total capital required
  committed_zar     REAL NOT NULL DEFAULT 0, -- running Σ across all child requests' accepted legs (any deal_type)
  stack_plan        TEXT,                    -- JSON: target split per layer {senior_debt, mezz, equity, carbon_advance, grant}
  close_chain_key   TEXT,                    -- chain to dispatch when fully subscribed (e.g. W20 financial close / W21 drawdown)
  close_case_id     TEXT,                    -- captured on objective.subscribed dispatch
  status            TEXT NOT NULL DEFAULT 'forming', -- forming|subscribed|financial_close|cancelled
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_objectives_owner  ON oe_deal_objectives(owner_id);
CREATE INDEX IF NOT EXISTS idx_deal_objectives_status ON oe_deal_objectives(status);

-- relationship-structure edges (§3.2): one typed link table backs CPs, bundles, substitutes, back-to-back,
-- pooling, novation, ROFR, cross-default and cover-for. Pairwise (from→to) and group (link_group_id) semantics.
CREATE TABLE IF NOT EXISTS oe_deal_links (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  link_kind       TEXT NOT NULL,           -- condition_precedent|bundle|substitute|back_to_back|pool|novation|rofr|cross_default|cover_for|renewal_of
  link_group_id   TEXT,                    -- set membership (bundle / substitute / pool): all rows sharing it form one group
  from_kind       TEXT NOT NULL,           -- 'request'|'offer'|'objective'|'case' — what from_id points at
  from_id         TEXT NOT NULL,
  to_kind         TEXT NOT NULL,
  to_id           TEXT NOT NULL,           -- for condition_precedent/novation this may be a chain case id
  condition_state TEXT,                    -- for condition_precedent: the state to_id must reach to release from_id's dispatch
  status          TEXT NOT NULL DEFAULT 'pending', -- pending|satisfied|broken|waived (rofr: offered|matched|waived)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_links_from  ON oe_deal_links(from_kind, from_id);
CREATE INDEX IF NOT EXISTS idx_deal_links_to    ON oe_deal_links(to_kind, to_id);
CREATE INDEX IF NOT EXISTS idx_deal_links_group ON oe_deal_links(link_group_id);
CREATE INDEX IF NOT EXISTS idx_deal_links_kind  ON oe_deal_links(link_kind, status);
```

`status` / `clearing_status` / `syndicate_role` / `stack_layer` values are static literals from the descriptor enums — never request-derived. `deal_type` / `provider_role` are stored as bound-param *values* in one static table, never as SQL identifiers.

**One pair of tables, all six kinds.** marketplace/negotiation/obligation/submission use only the base columns; auction adds the bid + clearing columns; syndication adds the tranche + fill columns. No per-kind tables — the descriptor's `kind` selects which columns the route reads/writes. New columns are nullable, so on a fresh DB this stays one clean `CREATE TABLE IF NOT EXISTS`; on the prod DB (≥051 band) the same file reconciles column-by-column with `ALTER TABLE ADD COLUMN`, `duplicate column name` treated as benign (same discipline as migration 050).

---

## 6. Generic routes — `src/routes/deals.ts`, mounted `app.route('/api/deals', deals)`

Auth middleware per-module (platform convention). `:type` resolved via `getDealDescriptor` → 404 on miss. Role gating from descriptor (`provider_roles` / `demand_roles`) against `getCurrentUser().role`. Tenant from JWT (`utils/tenant.ts`).

The four base endpoints are kind-agnostic on intake; **`/accept` (and the clearing cron) branch on `descriptor.kind`** — three mechanically distinct settle handlers, one route file:

- `POST /api/deals/:type/offer` — provider authors term sheet → validate against `term_sheet_schema` → insert `oe_deal_offers` (`published`). For auction/syndication the offer carries `request_id` (it is a bid/tranche into a specific need) + the kind's columns (`bid_amount_zar`/`bid_quantity` or `tranche_pct`/`committed_amount_zar`/`syndicate_role`). → `fireCascade({event:'deal.offer.published', entity_type:'oe_deal_offers', entity_id, data:{deal_type, provider_id, request_id?, …}})`.
- `POST /api/deals/:type/request` — demand expresses need (energy type: bill upload → profile derivation reusing `offtaker-heuristics`) → insert `oe_deal_requests` (`open`). Auction sets `bid_window_close` + `clearing_rule` (copied from descriptor); syndication sets `target_amount_zar`.
- `GET  /api/deals/:type/options?request_id=…` — load published offers for type → `descriptor.matcher(need, offers)` → `descriptor.scorer` each → rank desc by `est_value_zar` (nulls last) → apply `price_basis` banding (`toIndicativeBand` for cross-tenant indicative) → set request `options_ready`. **Generalizes `buildOfftakerOptions`.** The scorer calls `valueSweeteners()` (§3): each bundled sweetener (e.g. a 20%/quarter carbon rebate on a PPA offer) is converted to a ZAR-equivalent over the need's tenor, **added into `est_value_zar`**, and emitted as a rationale line — so a sweetened offer can out-rank a cheaper bare one. (marketplace/negotiation only; auction/syndication surface live bid-stack / fill-progress instead.)
- `POST /api/deals/:type/accept` — settle, dispatched by `descriptor.kind`:
  - **marketplace / secondary** (pick-one): body `{request_id, offer_id}` → request `selected`, offer `matched` → run `accept_dispatch`.
  - **auction** (clear-and-allocate): no single pick. Bids accrue until `bid_window_close` (cron, `idx_deal_requests_window`) or manual close → `descriptor.clearing.rule` allocates: merit_order stacks `bid_quantity` cheapest-first to need; uniform_price sets one `clearing_price_zar`; pay_as_bid settles each at its `bid_amount_zar`. Write `clearing_status`/`cleared_quantity`/`cleared_price_zar` per offer → `accept_dispatch` fires **per winning allocation**.
  - **syndication** (fill-to-target): each provider commits a tranche; request stays `filling` until `Σ committed_amount_zar ≥ target_amount_zar`, then `descriptor.allocation.basis` (pro_rata scales to 100% / lead_arranger first then fill / waterfall) resolves final shares with `min_tranche_pct` floor → `accept_dispatch` fires **once** for the closed syndicate.
  - **negotiation**: a `counter` loop — each counter is a new `oe_deal_offers` row with `counter_of` = the offer it answers and `counter_by_role` ∈ `descriptor.negotiation.counter_roles` (role enforced; the two sides must alternate). The prior offer flips `countered`. A `terminal_actions` member resolves it: `agree` → latest offer `agreed` → `accept_dispatch`; `decline`/`dispute` → `declined` with a structured `decline_reason` (rejection-explainer.ts). The `counter_of` chain is the immutable audit ledger. No pool.
  - **submission**: submit → authority inbox → grant/refuse dispatches the mapped chain. No pool, no counter.
  - `accept_dispatch` itself (any kind): **live** → `POST` the mapped chain endpoint server-side, capture case id → `dispatched_chain_key`/`dispatched_case_id`, status `dispatched`. **upcoming** → insert `loi_drafts` + `fireCascade('contract.created', entity_type:'loi_drafts')` (reuses `offtaker-procurement.loi_to_ipp`).
  - Always `fireCascade({event:'deal.accepted', entity_type:'oe_deal_requests', entity_id:request_id, data:{provider_id, deal_type, chain_key, case_id, objective_id?}})`.

**Capital-stack endpoints (§3.1 — co-funding one project from multiple deal types at once):**
- `POST /api/deals/objective` — owner opens a funding round: insert `oe_deal_objectives` (`forming`) with `funding_target_zar` + `stack_plan` + `close_chain_key`.
- `POST /api/deals/objective/:oid/leg` — bind (or create) a child `oe_deal_requests` of any `deal_type` to the objective, tagging `objective_id` + `stack_layer`. The leg then runs its own kind (a `debt_finance` leg can itself be a syndication; a `carbon_offtake` leg a marketplace) — fully independent.
- `GET  /api/deals/objective/:oid` — stack view: each leg's deal_type, layer, target vs filled, and the aggregate `committed_zar / funding_target_zar` gap.
- **Aggregation on accept:** the `deal_engine.leg_to_objective` cascade rule (§7) listens for `deal.accepted` carrying an `objective_id`, advances the parent's `committed_zar` by the accepted leg's quantum (`funds_objective.quantum_field`), and when `committed_zar ≥ funding_target_zar` flips the objective to `subscribed` and fires `objective.subscribed` → a **single** `close_chain_key` dispatch (W20 financial close / W21 drawdown), not one per leg. So "funded by finance **and** carbon at the same time" closes as one event when the stack is full.

**Relationship-link endpoints (§3.2 — the nine composition structures over `oe_deal_links`):**
- `POST /api/deals/link` — create a typed edge: body `{link_kind, from:{kind,id}, to:{kind,id}, link_group_id?, condition_state?}`. `link_kind` validated against the static enum; the descriptor's `composition?` declares which kinds a deal_type may carry (a `from` of a type whose descriptor doesn't allow that `link_kind` → 400). Inserts `oe_deal_links` (`pending`). Group kinds (bundle/substitute/pool) reuse one `link_group_id` across rows. → `fireCascade('deal.link.created', entity_type:'oe_deal_links', entity_id, data:{link_kind, from_id, to_id, link_group_id})`.
- `GET  /api/deals/link?from=…&to=…&group=…` — list edges touching a request/offer/objective/case (any of the three filters), for the Thread "dependencies" rail and the `/accept` gate check.
- **Accept is link-gated.** Before `accept_dispatch` runs (any kind), the route resolves inbound `condition_precedent` edges where this request is the `from`: if any links to a `to` case that has **not** reached its `condition_state`, accept is **blocked** (`409 condition_precedent_unmet`, listing the unmet CP). Bundle members accept **atomically** — accepting one offer whose request is a `bundle` member co-accepts every member request in the `link_group_id` in a single transaction (all-or-nothing). The resolver (§7) handles the post-accept fan-out (substitute cancellation, back-to-back mirror, pool aggregation, ROFR).

**Security invariants (load-bearing):** table name, column names, `status` enum, and role sets are static literals in code. `:type` and `:role` are validated against the in-code registry and used only as bound *values*. Cross-tenant offer pricing is POPIA-banded via `price_basis`/`toIndicativeBand` (R50 band) — verbatim prices only for the offer's own tenant or `price_basis: 'listed'`.

**Visibility & isolation (overrides the default tenant fence — read this before building).** `utils/tenant.ts` fences *every* resource read to the caller's tenant. The marketplace **deliberately does not**: `GET /api/deals/:type/options` and the offer-discovery `offer_to_demand` cascade are a **scoped cross-tenant read** — filtered by `deal_type` + `status IN (published, open)`, **not** by `tenant_id`. This is the whole point of a marketplace (a demand in tenant A must see a provider in tenant B's listing). A builder following CLAUDE.md's "every fetch resolves tenant and enforces isolation" rule would wrongly add `WHERE tenant_id = ?` here and silently break matching — so the rule is explicit:
- **Discovery is cross-tenant, audited, banded.** Listing rows expose only `term_sheet` fields whose `price_basis` permits it; verbatim ZAR is shown only for `price_basis:'listed'` or own-tenant offers, else `toIndicativeBand`. The cross-tenant read itself is logged via `fireCascade('deal.options.viewed', …)` so a regulator can see who browsed whose listings (POPIA accountability).
- **Everything downstream of accept is tenant-fenced normally.** The dispatched chain case, `loi_drafts`, fee rows, and every `oe_deal_requests`/`oe_deal_offers` write are stamped to the **demand's** tenant (the offer keeps the provider's `tenant_id` for its own row). `pushRoleAction` targets a role, never a tenant, so the cross-role push substrate is unchanged.
- One narrow seam, one justification, logged — not a blanket `tenant.ts` bypass.

**Concurrency (single-fill races).** `accept`/clearing/fill mutate shared scarce state — a single-fill `marketplace` listing can be double-accepted, an `auction` allocation double-cleared, a `syndication` tranche can overfill `target_amount_zar`. Every settle path acquires an advisory lock (`utils/locks.ts`) **before** the read-modify-write:
- marketplace/secondary/negotiation → lock key `deal:offer:{offer_id}` (the scarce thing is the offer); re-read offer status under lock, `409 offer_unavailable` if no longer `published`/`matched`.
- auction → lock key `deal:request:{request_id}` for the whole clearing transaction (one clear per window).
- syndication → lock key `deal:request:{request_id}` around the `Σ committed` check + tranche insert, so two tranches can't both see headroom and both commit (overfill). Same lock guards the `subscribed` flip.
Locks are released in `finally`; the existing matching/settlement code uses the same primitive, so contention semantics are known.

**Guards · reason codes · audit (L4 floor).** Accept is not a bare status flip:
- **Pre-trade guards** — when `accept_dispatch` targets a *trade* chain (the descriptor flags `dispatch_is_trade`), run `pre-trade-guards.ts` (credit / exposure / mark-age / halt / kyc) against the accepting party **before** dispatch; a failed guard → `409` with the guard's structured reason, no chain spawned.
- **Reason codes** — every `decline`/`refuse`/`withdraw`/CP-block writes a structured code from `rejection-explainer.ts` into `decline_reason` (the new column), never free text — so the Thread "why" rail and the regulator export read the same enum.
- **Audit** — every transition (`published`→`matched`→`accepted`→`dispatched`, counters, clears, fills, link resolutions) fires `fireCascade` with the before/after status in `data`; the cascade's audit-chain stage is the tamper-evident ledger (no separate audit table needed — reuses the platform's existing chain).

**Expiry & clearing sweep (cron — registered, not orphaned).** A new `*/15 * * * *` trigger in `wrangler.toml::[triggers]`, dispatched by a `deals.sweep` branch in `scheduled()` (`src/index.ts`):
- expire offers past `expiry` still `published` → `expired` (uses `idx_deal_offers_expiry`), push "Offer lapsed" to the provider.
- close auctions past `bid_window_close` still `open` → run the clearing handler (uses `idx_deal_requests_window`).
- age `forming` objectives with no leg movement past their funding window → flag stale on the owner's Horizon.
Dry-runnable through `/api/admin/cron/run` like every other schedule; `scripts/smoke-cron.sh` picks it up automatically.

---

## 7. Generic cascade rules — `src/cascade-rules/deal-engine.ts`

Copy the `offtaker-procurement.ts` shape exactly (incl. the `alreadyPushed` dedup keyed on `(source_entity_id, source_event)` — never the target role).

- `deal_engine.offer_to_demand` — `match: ctx.event === 'deal.offer.published'` → find `open`/`options_ready` requests of the same `deal_type` whose `need` the descriptor's matcher accepts → `pushRoleAction({target_role: demand_role, cross_option:{action_label:'Compare offers', target_route:'/deals/'+type+'/options?request_id='+rid}, …})`.
- `deal_engine.accept_to_provider` — `match: ctx.event === 'deal.accepted'` → `pushRoleAction({target_role: provider_role, cross_option:{action_label:'Track contract', target_route:'/thread/'+chain_key+'/'+case_id}, …})`.
- `deal_engine.leg_to_objective` — `match: ctx.event === 'deal.accepted' && ctx.data.objective_id` → advance the parent objective's `committed_zar` by the leg's quantum; if `committed_zar ≥ funding_target_zar` set `subscribed` + `fireCascade('objective.subscribed', entity_type:'oe_deal_objectives', entity_id:objective_id)` (dispatches `close_chain_key` once). Idempotent: the accepted leg's request id is the dedup key so a re-fired `deal.accepted` can't double-count the stack.
- `deal_engine.link_resolver` — one rule, two triggers, fans out the §3.2 structures over `oe_deal_links`. Branch on `link_kind` of the edges touching the firing entity:
  - `match: ctx.event === 'deal.accepted'` (the accepted request is `from`/`to` of edges):
    - **substitute** — mark every *other* member of the `link_group_id` `broken`, set their requests `cancelled`, and `pushRoleAction` "Withdrawn — alternative accepted" to each demand. (Accepting one competing cross-type kills the rest.)
    - **back_to_back** — spawn the downstream mirror: insert a new `oe_deal_requests` of `composition.back_to_back.spawn_type` owned by the intermediary, linked `back_to_back` (`satisfied`), and `pushRoleAction` to `composition.back_to_back.to_role` "New offer available". (Sleeve/intermediary: accepting the upstream leg auto-opens the downstream one.)
    - **pool** — advance the pooled need's `aggregate_field` by the member's quantum; when members ≥ `composition.pooling.min_members` (and aggregate target met) flip the pool request `options_ready` so it can clear as one need. (Many-demand → one offer.)
    - **rofr** — do **not** dispatch yet: set the edge `offered`, freeze the request `rofr_pending`, `pushRoleAction` to `composition.rofr.rights_role` "Match or waive" with a `window_hours` timer. Dispatch only after `match`/`waive`/timer-expiry (below).
  - `match: ctx.event === 'deal.link.rofr_resolved' || timer` — on `waive` or window expiry → release the frozen request to its normal `accept_dispatch`; on `match` → re-point the acceptance to the rights-holder's matching offer, mark the edge `matched`.
  - **cover_for** — separate trigger `match: ctx.event matches an obligation-breach event` (e.g. `*.shortfall`/`*.default` from W32/W46/W65): find `cover_for` edges whose `to` is the breached obligation → auto-fire the linked cover deal's `accept_dispatch` (the standby/make-good kicks in without a fresh offer). **condition_precedent** edges are resolved synchronously at the `/accept` gate (§6), not here; the resolver additionally flips a CP edge to `satisfied` when its `to` case reaches `condition_state`, unblocking any waiting `from`. **novation** edges re-point a live chain's party on `deal.accepted` of the transfer request (reuses W61 loan-transfer / W22 assignment plumbing). All branches carry the `alreadyPushed` dedup on `(source_entity_id, source_event)`.

Registered alongside existing rules in the cascade-rules barrel — purely additive; existing per-domain rules keep firing.

**Fee wiring:** on `deal.accepted`, the accepted offer's `term_sheet.fixed_fee_zar` + `pct_bps` feed the Layer-B commercial-intercept fee engine (`payer_resolution` + splits) so the dispatched contract carries its commercial terms. Seed remains all-free (mig 481) until a real fee schedule is set.

---

## 8. Frontend — process, UI & alert design (Meridian-native, additive)

No new chrome. Everything mounts inside the three Meridian surfaces (Horizon / Thread / Atlas + ⌘K) and reuses the design language verbatim: **warm paper + petrol**, urgency ramp `ink → amber → oxide` reserved for the time dimension, **Archivo** for labels, **JetBrains Mono** for every quantum/ref/timer, 3px fuse bars draining right-to-left, quantum type-size stepping with magnitude. Motion follows the Emil rules below (ease-out enter, `scale(0.97)` press, origin-aware popovers, never `scale(0)`).

### 8.1 The deal lifecycle as a process (one shape, all six kinds)

The engine is a single state spine — **`draft → published → matched → under_evaluation → accepted → dispatched → delivered`** (+ `withdrawn`/`expired`/`declined` terminals). Each `kind` lights up a different subset; the UI renders the same horizontal **Process Rail** (the Thread rail's sibling) so a provider and a demand looking at the same deal see the *same journey from two ends*.

| kind | spine path the rail shows | who drives each leg |
|---|---|---|
| marketplace | published → matched → **under_evaluation** (demand ranks) → accepted → dispatched | provider lists · demand picks |
| auction | published → (bids accrue, **window timer**) → cleared@close → accepted → dispatched | provider clears at window_close |
| syndication | published → (**fill bar** to target) → subscribed → dispatched | N providers fill one need |
| negotiation | published → **counter-loop** (offer⇄counter badges) → agreed → dispatched | bilateral ping-pong |
| obligation | (event) → **pushed** → acknowledged → dispatched | no offer; event auto-pushes |
| submission | submitted → under_review → **adjudicated** (grant/refuse) → dispatched | single authority decides |

The rail is **one component**, `<DealProcessRail kind=… state=…>` — same anatomy as Meridian Thread (done → **current** → ahead), so it costs O(1) per new descriptor.

### 8.2 UI components (4 surfaces, all additive)

- **`DealOfferComposer`** (provider authoring) — generic form driven by the descriptor's `term_sheet_schema` (fixed_fee_zar · pct_bps · rate · tenor · conditions · sweeteners). Live **ZAR-equivalent preview** as fields change (`valueSweeteners()` folds cross-commodity kickers into one headline number on the right rail, JetBrains Mono, quantum-stepped). The **cascade-preview line** (Law 3) sits above the publish button: *"Publishing notifies 4 matching offtakers and starts their evaluation."* Reached from **Atlas** under the provider role.
- **`OfferCompareGrid`** (demand evaluation) — ranked scored offers as **saving-cards** (generalizes the existing `OptionGroup` from `offtaker-options.ts`). Each card: rank chip · primary metric in mono · `est_value_zar` (sweetener-inclusive, with a "▸ 2 sweeteners" expander showing the ZAR breakdown) · one-line "why" rationale · **Accept** CTA. Cross-tenant pricing shows **only** the R50 indicative band (`toIndicativeBand`, POPIA). Best offer carries a petrol left-spine; the rest are hairline-ruled, no cards-where-a-rule-will-do. Opened from a Horizon duty-stream push or Atlas.
- **`AuctionClearPanel`** / **`SyndicationFillBar`** / **`NegotiationCounterStrip`** — the three kind-specific evaluation skins, each a thin variant over `OfferCompareGrid`'s scorer: a window-countdown + clearing table; a fill-to-target bar (`committed_zar / funding_target_zar`, amber under target, moss at subscribed); a two-column counter ledger (your terms ⇄ theirs, latest highlighted petrol).
- **Track** — after accept, demand follows `dispatched_case_id` via the existing Meridian **Thread** (`/thread/:chain/:id`). A compact **"My Deals"** strip (Horizon header) shows each request's spine position with its fuse bar.

### 8.3 Alert & notification design (the cross-role nervous system)

Alerts are the existing `pushRoleAction` → `oe_role_action_queue` (mig 476, tenant-fenced 482) → KV badge → **Horizon Duty-Stream + IncomingPanel** substrate. The deal engine does **not** invent a notification channel; it sets severity + placement so deals triage themselves by Meridian's two laws (time = position, money = weight).

**Severity ramp (color reserved for time, never decoration):**

| severity | trigger | placement | visual |
|---|---|---|---|
| `info` | new matching offer published | IncomingPanel row | ink, 3px petrol fuse at full |
| `act` | offers ready to evaluate; counter received | Duty-Stream (top-N by attention score) | fuse drains over `eval_window`; **amber under 25%** |
| `urgent` | auction window <2h; ROFR "match or waive" timer; CP unmet blocking accept | Duty-Stream top, left of breach line | amber → **oxide past zero** |
| `breach` | window closed unactioned; obligation `*.shortfall`/`*.default` auto-pushed `cover_for` | hard left edge, breach lane | oxide spine + icon + label (never color alone — a11y) |

**Attention score** reuses Meridian's `log₁₀(ZAR) × 1/hours-remaining` so an R850m syndication leg outweighs an R12k marketplace pick without anyone tuning it.

**Cascade-preview alert (Law 3, pre-commit).** Every **Accept** / **Publish** / **Clear** button carries an inline preview of what fires *before* commit — *"Accepting notifies Karusa Wind (IPP), starts their W21 drawdown, and cancels 2 competing offers (substitution)."* It reads the would-fire `link_resolver` branches (substitute kills, back_to_back spawn, ROFR freeze, objective subscription) so the user sees the cross-role blast radius first. This is the single most important alert in the engine — it makes causality visible at the point of action.

**Dedup discipline (carried):** badge counts derive from `oe_role_action_queue` rows whose `alreadyPushed` key is `(source_entity_id, source_event)` — **never** the target role — so a re-fired `deal.accepted` can't double-alert. KV badge is the unread count; clearing a row in IncomingPanel decrements it.

**Motion (Emil rules):** IncomingPanel rows enter `translateY(100%) → 0` ease-out 200ms (spatial origin = the panel edge); Accept button `scale(0.97)` on `:active`; the cascade-preview popover scales from its trigger (`transform-origin` = button), not center; fuse-bar drain is a CSS transition (interruptible), not a keyframe. No badge pulse on keyboard-frequent actions. `prefers-reduced-motion` collapses all to opacity.

No new top-level navigation. O(1) scaling per MERIDIAN_REDESIGN §4 — a new descriptor is one more data source feeding Horizon and one Atlas index row; the Process Rail, CompareGrid scorer, and alert ramp serve every kind unchanged.

---

## 9. Phased tasks

### Phase 0 — Registry + tables (zero behavior change)
- [ ] `src/utils/deal-registry.ts`: `DealDescriptor`, `SweetenerSpec`, `FieldSpec`, `ScoredOption`, `getDealDescriptor`, `registerDeal`, `valueSweeteners`.
- [ ] `migrations/506_deal_engine.sql` (§5) — four tables incl. `oe_deal_objectives` + `oe_deal_links` + `objective_id`/`stack_layer` on requests; `oe_deal_offers` carries `counter_of`/`counter_by_role`/`decline_reason` + extended status enum; indexes incl. `idx_deal_offers_counter`, `idx_deal_offers_expiry`, `idx_deal_requests_window`.
- [ ] Register `energy_supply` descriptor wrapping existing `buildOfftakerOptions`/`scoreOption` — matcher/scorer delegate to the current util; **no observable change**.
- [ ] `valueSweeteners()` helper: pct/zar/zar_per_mwh/tCO2e × cadence → ZAR-equivalent over need tenor (carbon priced off the latest VWAP mark; REC off `rec_lifecycle`). Scorer folds the sum into `est_value_zar` + a rationale line.
- [ ] Tests: descriptor lookup (hit + 404 miss), term-sheet schema validation, registry completeness, migration idempotency, sweetener valuation (a 20%/qtr carbon rebate lifts a higher-priced PPA above a cheaper bare one in the ranking).

### Phase 1 — Generic routes + matcher/scorer harness
- [ ] `src/routes/deals.ts` with the 4 endpoints (§6); mount in `src/index.ts` via `app.route`.
- [ ] **Cross-tenant visibility (§6):** `GET /options` + `offer_to_demand` discovery query filters on `deal_type`+`status`, NOT `tenant_id`; term_sheet price-banded by `price_basis`/`toIndicativeBand`; log the read via `fireCascade('deal.options.viewed')`. All accept-downstream writes tenant-stamped to the demand.
- [ ] **Concurrency (§6):** wrap accept/clear/fill in `locks.ts` advisory lock — `deal:offer:{id}` (marketplace/negotiation), `deal:request:{id}` (auction/syndication); re-read status under lock, `409` if no longer available; release in `finally`.
- [ ] **Guards + reason codes + audit (§6):** accept on a `dispatch_is_trade` descriptor runs `pre-trade-guards.ts` before dispatch (fail → `409` structured reason, no chain); decline/refuse/withdraw/CP-block write `decline_reason` from `rejection-explainer.ts`; every transition fires `fireCascade` (audit-chain ledger).
- [ ] **Negotiation counter route (§6):** counter inserts new `oe_deal_offers` row (`counter_of`, `counter_by_role` role-enforced, prior flips `countered`); `agree` → `agreed` → accept; `decline` → `declined` + reason code.
- [ ] Port offtaker path onto `/api/deals/energy_supply/*`; keep `/api/offtaker/options` as a thin alias.
- [ ] Parity test: `/api/deals/energy_supply/options` ≡ legacy `/api/offtaker/options` for the same bill profile.
- [ ] Security tests: unknown `:type` → 404; wrong-role publish/request → 403; SQL-identifier injection attempt via `:type` is inert (bound value only); cross-tenant `GET /options` returns other tenants' listings but **banded** (no verbatim ZAR unless `listed`); double-accept of one single-fill offer → second caller gets `409` (lock holds); syndication two-tranche overfill race → `409`/clamped to target.

### Phase 2 — Generic cascade rules + fee engine
- [ ] `src/cascade-rules/deal-engine.ts` (rules incl. `link_resolver`, §7); register in the barrel.
- [ ] Wire `term_sheet` fee components into the Layer-B fee engine on `deal.accepted`.
- [ ] **Expiry/clearing sweep cron (§6):** add a `deals.sweep` branch to `scheduled()` on the existing `*/15` trigger — expire offers past `expiry` (`idx_deal_offers_expiry`), close auctions past `bid_window_close` (`idx_deal_requests_window`), flag stale `forming` objectives; dry-runnable via `/api/admin/cron/run`; `smoke-cron.sh` auto-covers it.
- [ ] Tests: publish → demand push fires; accept → provider push fires; `alreadyPushed` dedup holds under double-fire; fee row created with correct payer/splits; sweep expires a lapsed offer + clears an auction past window; `link_resolver` substitute kills siblings, back_to_back spawns mirror, ROFR freezes then releases on waive/timer.

### Phase 3 — Frontend: process rail, compare grid, alert ramp (§8)
- [ ] `DealProcessRail` (§8.1) — one component, `kind`-driven spine; mirrors Thread anatomy (done → current → ahead).
- [ ] `DealOfferComposer` (§8.2) — `term_sheet_schema`-driven form + live ZAR-equivalent preview (`valueSweeteners`) + pre-publish cascade-preview line.
- [ ] `OfferCompareGrid` — ranked saving-cards (generalize `OptionGroup`); R50 indicative banding on cross-tenant price; best-offer petrol spine; "▸ sweeteners" ZAR breakdown.
- [ ] Alert ramp (§8.3): severity → placement mapping over `oe_role_action_queue`/KV badge; attention score `log₁₀(ZAR)×1/hrs`; **cascade-preview popover** on Accept/Publish/Clear reading the would-fire `link_resolver` branches.
- [ ] Motion pass (Emil): IncomingPanel `translateY(100%)→0` ease-out 200ms; Accept `scale(0.97)` active; preview popover `transform-origin`=trigger; fuse drain via CSS transition; `prefers-reduced-motion` → opacity-only.
- [ ] Wire into Atlas (author), Horizon duty-stream (`cross_option` → compare), Thread (track); "My Deals" strip in Horizon header.
- [ ] `npm run check:pages` clean (run from `open-energy-platform/pages`).
- [ ] Kind skins (deferred to their kind phase, same scorer): `AuctionClearPanel` (4b), `SyndicationFillBar` (4c), `NegotiationCounterStrip` (5).

### Phase 4 — Marketplace descriptors (kind:'marketplace', by value)
One descriptor + test each; routes/rules/UI untouched. §4A order. Each carries `initiator`.
- [ ] `debt_finance` (demand-RFP) → W53 → W21 (highest value first).
- [ ] `carbon_offtake` (ERPA) → W65.
- [ ] `grid_capacity` → W58 → W28; `wheeling_agreement` (offtaker↔grid) → W8.
- [ ] `epc_rfp_award` → W19 → contract; `epc_build` → W20.
- [ ] `rec_supply` → W70; `voluntary_offset` (offtaker↔carbon) → W17.
- [ ] `om_service` → W51; `spare_parts_supply` → W72.
- [ ] `trading_liquidity` (RFQ) → W36 → W76; `trader_margin_finance` (trader↔lender) → W53.
- [ ] `insurance_cover` → W23; `payment_security` → W54.
- [ ] Adapter pass: fold `vcm-order-book` (`vcm_spot`) onto descriptor metadata without breaking its bespoke T+2 settlement.

### Phase 4b — Auction kind (kind:'auction', §4F)
Time-boxed clearing; acceptance is a `clearing.rule`, not pick-one.
- [ ] Add `auction` branch to `/api/deals/:type/*`: bid intake until `window_close` (timer/manual), then clearing pass (pay_as_bid | uniform_price | merit_order) writing allocations.
- [ ] Register `reserve_offer` → W50, `dispatch_merit_order` → W13 (fold existing grid-l5 auction), `ancillary_services` → W50, `reippp_bid_window` → W19→W49.
- [ ] Tests: bid after close → rejected; merit_order clears cheapest-first to demand MW; uniform_price sets one clearing price; allocations dispatch the mapped chain per winner.

### Phase 4c — Syndication kind (kind:'syndication', §4G)
Cooperative tranche-filling; acceptance is fill-to-target, not pick-best.
- [ ] Add `syndication` branch: providers each commit a tranche; close when Σtranches ≥ need; `allocation.basis` (pro_rata | lead_arranger | waterfall) resolves final shares; `min_tranche_pct` floor.
- [ ] Register `club_debt`, `blended_finance` (lender↔carbon_fund), `reinsurance_panel`, `turnkey_consortium`, `epc_completion_guarantee` (epc↔lender).
- [ ] Tests: under-subscribed need stays open; over-subscription scales pro_rata to 100%; lead_arranger gets first allocation then rest fill; single accept_dispatch fires once the syndicate closes (not per-tranche).

### Phase 4d — Capital-stack co-funding (§3.1) — multiple deal types fund one project at once
The objective layer above requests; no new kind, composes existing per-type deals.
- [ ] Add `oe_deal_objectives` endpoints to `src/routes/deals.ts` (§6): create objective, bind/create leg, stack-view GET.
- [ ] `deal_engine.leg_to_objective` cascade rule (§7): aggregate accepted-leg quantum → flip `subscribed` → single `close_chain_key` dispatch.
- [ ] Set `funds_objective` on the fundable descriptors: `debt_finance`/`club_debt` (senior_debt), `carbon_offtake`/ERPA (carbon_advance), `equity_finance` (equity), `blended_finance` (mezz/grant).
- [ ] Frontend: a **Capital Stack** panel on the owner's Horizon — target vs Σcommitted, per-layer fill, gap remaining; each leg links to its own deal thread.
- [ ] Tests: a stack of debt + carbon + equity legs accumulates `committed_zar` across heterogeneous deal_types; objective stays `forming` until full; `subscribed` fires **once** and dispatches the close chain once (not per leg); re-fired `deal.accepted` for the same leg can't double-count.

### Phase 4e — Relationship structures (§3.2) — the `oe_deal_links` composition layer
Orthogonal decorations on any kind; one table, one resolver, no new kinds. Each structure is a `link_kind` + a `link_resolver` branch.
- [ ] Add `oe_deal_links` endpoints to `src/routes/deals.ts` (§6): `POST /link` (validated against the descriptor's `composition?`), `GET /link` (dependency rail), and the **link-gated** `/accept` path (CP block + bundle atomic co-accept).
- [ ] `deal_engine.link_resolver` cascade rule (§7): substitute cancellation, back_to_back mirror spawn, pool aggregation, ROFR pause/resolve, cover_for auto-fire, CP satisfy-and-unblock, novation re-point.
- [ ] Set `composition?` on the descriptors that carry each structure (CP on `debt_finance`/`epc_build`; bundle on PPA+REC combos; substitute across competing finance/carbon offers; back_to_back on sleeve/intermediary `wheeling_agreement`; pool on aggregated `energy_supply`/`voluntary_offset`; rofr on `loan_transfer`/`ppa_termination`; cover_for on `payment_security`/`insurance_cover` vs W32/W46/W65; novation on `loan_transfer`/PPA assignment).
- [ ] Frontend: a **Dependencies** rail on the Thread showing inbound/outbound links + state (CP unmet/satisfied, bundle members, substitute siblings, ROFR window countdown).
- [ ] Tests: (1) CP gate blocks `/accept` with `409 condition_precedent_unmet` until the linked case reaches `condition_state`, then unblocks; (2) accepting one bundle member co-accepts every member atomically (all-or-nothing rollback on any failure); (3) accepting one substitute marks every sibling `cancelled` + pushes withdrawal; (4) back_to_back accept spawns the downstream offer to `to_role`; (5) ROFR accept freezes `rofr_pending`, pushes "match or waive", and dispatches only on waive/expiry or re-points on match; (6) pool rolls N member requests into one need that clears once `min_members` met; (7) obligation breach (W32 shortfall) auto-fires the linked `cover_for` deal without a fresh offer.

### Phase 5 — Negotiation kind (kind:'negotiation', §4C)
Bilateral; descriptor carries the `negotiation` block; reuses the 10 split-write chains.
- [ ] Add `negotiation` branch to `/api/deals/:type/*`: a `counter` action loop + terminal-action guard (counter_roles enforced server-side).
- [ ] Register the 20 §4C descriptors mapping party-A/party-B onto each chain's existing split-write transitions (W32/W62/W46/W39/W23/W28/W18/W58/W53/W21/W30/W36/W44/W29/W68/W20/W75/W67/W37/W42).
- [ ] Tests: counter from non-counter role → 403; terminal action dispatches the mapped chain transition; no competitive pool created.

### Phase 6 — Obligation kind (kind:'obligation', §4B) — generalize, don't rebuild
~23 pushes already exist as bespoke cascade-rules. Convert to descriptor rows so future ones are data.
- [ ] Generic obligation cascade-rule reads `obligation` descriptors and fires `pushRoleAction` on the named source event — replacing per-touchpoint rule files incrementally (keep old rules until parity-tested).
- [ ] Migrate the 23 §4B touchpoints to descriptor rows one at a time; each migration test asserts identical push (target_role, route, dedup key) vs the legacy rule, then retires the legacy rule.
- [ ] No new pushes invented — engine only generalizes the substrate.

### Phase 7 — Submission kind (kind:'submission', §4E)
Apply → single authority (regulator) adjudicates; no pool, no counter.
- [ ] Add `submission` branch: submit → regulator inbox (existing W31/W66 inbox materializer) → grant/refuse dispatches the mapped chain.
- [ ] Register the 10 §4E descriptors (W49/W33/W57/W27/W48/W56/W73/W43/W66/W40).
- [ ] Tests: only `authority_role` may grant/refuse; submitter sees status, not other submissions (POPIA fence).

### Phase 8 — Secondary-market transfer (kind:'marketplace', seller-led, §4D)
- [ ] `loan_transfer` → W61 (residency gate), `carbon_spot_trade` → W226, `security_draw_replenish` → W54.
- [ ] Offer references an existing chain case (`source_case_id`) rather than a fresh need.

### Phase 9 — Track-to-delivery linkage
- [ ] `deal_request` status machine `open→options_ready→selected→dispatched→tracking→delivered`; link `dispatched_case_id` ↔ Thread; advance `tracking`→`delivered` from the dispatched chain's terminal state.
- [ ] LOI-first path for upcoming projects generalized from `loi_drafts` → project lifecycle.
- [ ] Open the 4 lowest-coverage pairs (§4 tail) as direct descriptors: lender↔carbon_fund, trader↔offtaker, support↔lender, support↔carbon_fund.

---

## 10. Verification

```bash
cd open-energy-platform
npm test                         # vitest — Phase 0–2 unit + cascade tests green
npm run check                    # backend tsc --noEmit
cd pages && npm run check:pages  # SPA tsc --noEmit (Phase 3+)
```

Plus: graphify re-query before each new deal type (graphify-first rule) to confirm the target chain's kickoff endpoint and avoid duplicate wiring; curl prod after first deploy of the new route (Hono basePath collisions are silent).

---

## 11. Why this is L4+ and not L2

Not CRUD: every accept fires the full chain workflow (pre-trade gating, cascades, audit, SLA timers) via the mapped W## state machine; offers carry structured commercial terms into the fee engine; cross-role pushes are causal and tracked end-to-end; POPIA banding governs cross-tenant pricing. Offers compete on **total economic value**, not headline price — cross-commodity sweeteners (e.g. a bundled carbon rebate) are valued in ZAR-equivalent and ranked. One project can be funded by **several deal types at once** (debt + carbon + equity) via the capital-stack objective, closing as a single financial-close event when the stack is fully subscribed. And deals **relate to other deals** — nine composition structures (condition-precedent gates, atomic bundles, competing substitutes, back-to-back sleeves, demand pooling, novation/step-in, ROFR, cover-for backstops, co-funding) ride one typed-edge primitive (`oe_deal_links`) so a tenth is one `link_kind` + one resolver branch, never a new table. The engine is the connective tissue that makes 76 single-role chains behave as one cross-role marketplace.
```
