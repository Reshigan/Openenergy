# CEC Platform — End-to-End Validation, Goldrush Worked Example

**Method.** Walk the real take-on as four reviewers at once: the *energy analyst* (is the physics/contract right?), the *marketplace analyst* (is there a two-sided transaction with price discovery?), the *role specialist* (would a real offtaker procurement lead use this daily?), and the *CEO* (does each screen deliver value the user would pay for?). Goldrush — the offtaker buying one master PPA over GoNXT's 10 private-wire C&I solar sites, settled in carbon not RECs — is the spine. Every verdict is grounded in code (`file:line`) or a live `cec-energy-db` row count.

**Verdict scale.** 🟢 marketplace value · 🟡 latent value, wrong framing · 🔴 record-keeping / dead.

---

## 0. The deal, as the energy analyst sees it

| Fact | Value | Source |
|---|---|---|
| Generator | GoNXT (`p_live_gonxt`), 10 real solar sites | `ipp_projects` developer_id=p_live_gonxt |
| Offtaker | Goldrush (`p_live_goldrush`), 1 master PPA / 10 sites | `off_ppa_portfolio` (10 active, counterparty GoNXT) |
| Financier | Growvest (`p_live_growvest`) — finances the **generator**, not the buyer | `covenants` (5), `oe_covenant_certificates` (1, borrower GoNXT) |
| Carbon | Envera (`p_live_envera`) — monetises the tonnes | `carbon_projects` (2), `oe_carbon_issuances` (1 = 2,899 tCO2e, GoNXT) |
| Settlement | Carbon, **not** RECs | memory: "goldrush is carbon not recs" |
| Tariff | 1230 ZAR/MWh, CPI-indexed, 20y, take-or-pay 95% | backfill SQL + `tariff_indexation` chain |

The contract physics are sound — capacity × 1752 capacity-factor drives all volumes, no synthetic kWh (honors the actuals-only rule). The problem is **never the data model; it is what the first screen chooses to show.**

---

## 1. Login → Horizon (the first screen)

`LaunchRedirect` → `/horizon`. `HorizonPage` renders KPI band → board (time-to-consequence lanes) → duty stream (ZAR×time-remaining ranked) → The Wire ticker (`HorizonPage.tsx:161-320`, `horizon.ts:75`).

🟢 **Frame is excellent.** The board buckets non-terminal cases by time-to-money and the duty stream ranks by `attentionScore = ZAR × time_remaining`. This is already L4-shaped — a genuine "what costs me money next" grid, not a list.

🔴 **Headline is record-keeping.** Goldrush's KPI band (`HorizonKpis.tsx:39-45`) leads with **Active RECs / REC MWh** — a product Goldrush *explicitly does not buy*. Those tiles read 0/0 and the band self-suppresses (`HorizonKpis.tsx:140`), leaving the buyer staring at "Site groups / Delivery points" — master-data counts. The single biggest number in a buyer's world — **annual energy spend and contracted-vs-delivered position** — is absent.

- *Energy analyst:* the band shows inventory counts, not the take-or-pay exposure that actually governs the contract.
- *Marketplace analyst:* no price, no position, no counterparty — nothing transactional.
- *CEO verdict:* **the most important screen leads with a product the customer isn't buying.** Fix #1.

**Highest-leverage fix.** Re-spec the offtaker band to **spend + delivery + carbon**: `annual_ppa_spend_zar`, `delivered_vs_contracted_pct` (the take-or-pay trigger), `open_settlement_zar`, `carbon_offset_tco2e`. Same `/cockpit/stats` plumbing already in place — cheapest change, largest "is this worth money?" payoff.

---

## 2. The money-lanes that should move every month

Goldrush holds 10 live PPAs, yet the chains that *are* the deal economics are **blank**:

| Chain | State | Should be | Revenue hook |
|---|---|---|---|
| `virtual_ppa_settlement` | 0 rows 🔴 | 1 settled/month/PPA + current month open | `settlement.cycle_settled` (coded, `settlement-deep.ts:237`) |
| `ppa_take_or_pay` | 0 rows 🔴 | fires when delivered < 95% | **gap** — `take_or_pay.settled` (Table B) |
| `carbon_offset_claim` | 0 rows 🔴 | monthly tCO2e claim → Envera | **gap** — no schedule row |
| `curtailment_claim` | 0 rows 🔴 | when buyer/SO curtails available plant | **gap** — `curtailment.settled` (Table B) |
| `carbon_scope3_disclosure` | 0 rows 🔴 | replaces the wrong RECs seed | n/a (disclosure) |

🔴 **This is what makes Horizon feel like a filing cabinet.** The board's time-to-consequence grid has no moving, money-bearing cases — only static contract rows. A buyer logs in monthly and sees nothing happened, despite 10 plants delivering power and 2,899 carbon credits in the programme.

**Fix.** Seed one `virtual_ppa_settlement` + one `carbon_offset_claim` per PPA per month (history settled, current month open per the non-terminal-lane rule). This is the old pivot work (swap RECs→`carbon_scope3_disclosure`, add monthly settlements) — the CEO critique independently re-derives it as the #4 platform-wide fix. **It is a real code obligation, not deferred polish.**

---

## 3. The two-sided transaction: where is the marketplace?

A marketplace needs price discovery and a counterparty who can say yes/no. Goldrush's cross-role handoffs:

- **Goldrush ↔ GoNXT** (settlement, take-or-pay, curtailment): the PPA-delivery bucket is the most cross-role in the system — **13 of 16 chains cross a role boundary** (process-flow catalogue). 🟢 The seam exists and is wired through `fireCascade` → counterparty `IncomingPanel` cards.
- **Goldrush ↔ Envera** (carbon offset): blank 🔴 — no `carbon_offset_claim` rows, so the buyer's Scope-2/3 position never reaches the fund.
- **Goldrush → Deal Desk**: 🔴 **near-dead.** `deal-registry.ts:299` registers exactly ONE deal type — `energy_supply` (provider `ipp_developer`/`trader`, demand `offtaker`). Live `oe_deal_requests`=0, `oe_deal_offers`=0. The desk is technically alive for Goldrush but literally empty, and **completely empty for Growvest and Envera** (neither is a provider/demander on any deal type).

🔴 **CEO verdict — "a marketplace that isn't a marketplace."** Four parties, one PPA, carbon credits, a debt facility — and the Deal Desk offers one product to two of the four. This is the single biggest gap between the pitch ("energy exchange") and the screen.

**Fix.** Expand the registry: add `debt_facility` (provider `lender` → demand `ipp_developer`) and `carbon_offtake`/ERPA (provider `ipp_developer`/`esco` → demand `carbon_fund`/`offtaker`), then author the live take-on deals so the desk stops reading 0.

---

## 4. The reports the buyer actually needs

🟡 **ESG reporting** — backend is L5 (`esg-disclosure-chain.ts:13-50`: 12-state, INVERTED SLA, 4-framework completeness, 15-category Scope 3), but only **1** `oe_esg_disclosure` row exists (Goldrush, FY2025/26), and the surface is Atlas-only, not on Horizon. The statutory panels hit `reports_registry`/`report_catalog`/`oe_report_submissions` — **all 0 rows**. Capability L5; population and discoverability L1.

🔴 **Reports not on Horizon at all.** `HorizonPage.tsx:176-179` offers only `+ New transaction` and `Browse records`. Reports live at `/surface/offtaker:reports`, reachable only via Atlas. The PPA-contract panel hits live data (10 PPAs); the statutory panels are blank. Half-blank by data, fully-hidden by navigation.

**Fix.** Put Deals + Reports next to New/Browse on the board (one-line nav change), and seed the `report_catalog` so statutory panels render the take-on.

---

## 5. Revenue overlay — where does Goldrush's journey earn the platform money?

Every Goldrush economic event maps to a fee hook. Status today: **all coded hooks are `is_enabled=0` (launch-free), proven end-to-end, flip-on via `PUT /api/admin/revenue/schedule/:id` — no deploy.**

| Goldrush event | Fee hook | Coded? | Location |
|---|---|---|---|
| PPA contract signed | `contract.signed` flat_zar | ✅ | `contracts.ts:806` |
| Monthly settlement | `settlement.cycle_settled` bps | ✅ | `settlement-deep.ts:237` |
| Carbon retired (via Envera) | `carbon.retired` flat_zar | ✅ | `carbon.ts:209/431` |
| Take-or-pay claim settled | `take_or_pay.settled` bps on quantum | 🔴 **gap** | add `oe_fee_schedule` row (W32 cascade) |
| Curtailment claim settled | `curtailment.settled` bps | 🔴 **gap** | add row (W46 cascade) |
| Cross-role deal accepted | `deal.accepted` bps | ✅ (mig 507) | `deals.ts` |

🟢 **Architecture is right:** the `commercial` cascade stage (`fee-engine.ts:111`, `cascade.ts:2579`) runs on *every* `fireCascade`, so adding a Table-B hook is a one-row `INSERT` + passing `commercial:{entity_value}` at the fire site. The fee follows the workflow — the platform can't bill for work it didn't do.

🟡 **Two engines compute but don't auto-fire:** `trade-fees.ts` and `settlement-fees.ts` only run via manual `POST .../recompute`. Real revenue requires wiring them to fire-at-event / cron. (Not on Goldrush's critical path — those are trader/settlement-side.)

---

## Goldrush scorecard

| Touchpoint | Specialist | Marketplace | CEO value |
|---|---|---|---|
| Horizon frame (board/duty/wire) | 🟢 | 🟢 | 🟢 keep |
| KPI headline band | 🔴 counts | 🔴 no price | 🔴 **fix #1** |
| Monthly settlement lanes | 🔴 blank | 🟡 seam exists | 🔴 **fix #4 (seed)** |
| Take-or-pay / curtailment | 🟡 modelled | 🔴 no fee | 🔴 gap + revenue gap |
| Carbon offset → Envera | 🔴 blank | 🔴 no handoff | 🔴 fix #5 (wiring) |
| Deal Desk | 🔴 1 product | 🔴 empty | 🔴 **fix #2** |
| ESG / Reports | 🟡 L5 backend | n/a | 🟡 surface + seed |
| Revenue hooks | 🟢 coded | 🟢 launch-free | 🟢 + 2 gaps to code |

**Bottom line for the CEO:** the chassis is a real exchange — 207 governed workflows, 78 cross-role handoffs, a fee engine that bills only for work done. What stops Goldrush *feeling* like a marketplace is three things, in priority order: **(1) the headline shows counts not money, (2) the deal desk ships one product to two of four roles, (3) the monthly money-lanes are unseeded so the board never moves.** All three are code obligations, all three are surfaced — not polish, not deferred.
