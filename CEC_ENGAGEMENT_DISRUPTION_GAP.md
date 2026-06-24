# CEC Platform — Return-Drivers & Disruption Gap

**Brief (Directive #3, verbatim):** *"load up all specialist and roleplayers from all areas, relook the screens, there nothing that brings the roles back to the system often other than the system of record. in parralel work out what we are missing for this disruptive industry innovation."*

**Method.** Five specialist lenses re-walked every Meridian landing surface across all 11 roles, asking two questions: (1) *what would make this role open the platform when nothing forces them to?* and (2) *what is missing for this to be disruptive, not just a better record?* Every finding is grounded in code (`file:line`).

---

## The one finding under all the findings

The pull machinery **already exists in code.** It is unwired, gated, or mouthless — not unbuilt.

Every Meridian landing surface today is one of two shapes, and both only pull a user back **when forced**:
- **A queue of my non-terminal cases** — `horizon.ts` only surfaces chain cases that are *not* in a terminal state.
- **A count of my pending work** — `HorizonKpis.tsx` / `cockpit.ts roleBlock` returns counts of things I owe.

There is **zero outbound** (notifications are in-app rows only; `email.ts` is wired to 4 auth templates; `briefing.ts:122 /briefing/send` is an explicit demo fake) and **no ambient market signal** (the trader BBO/depth/tape the `OrderBook` DO already computes is consumed by *no* frontend file; the carbon VCM book is unwired; the national market-health dashboard is admin-gated). The platform is a world-class **record + inbox** with no daily reason to log in.

**The fix is overwhelmingly wiring + aggregation + two new producers (a time/market-triggered cascade and an outbound channel) — not a rewrite.**

---

## Per-role: return-driver today · pull gap · disruptive build

| Role | What pulls them today | The gap (pull sitting unwired in code) | Disruptive build |
|---|---|---|---|
| **Trader** | Own non-terminal orders/cases | `OrderBook` DO computes `best_bid/best_ask/depth/mid/spread_bps` (`do/order-book.ts:300-344`), exposed `GET /trading/orderbook-depth` + `/prints` (`trading.ts:489-523`), cron snapshots every 15min — **consumed by no `pages/src/meridian/` file.** | Live BBO/depth/tape ticker on Horizon + price-move push. A market with no visible price isn't a market. |
| **Offtaker (Goldrush)** | PPA contract rows, master-data counts | KPI band leads with **RECs** (`HorizonKpis.tsx:39-45`) — a product Goldrush doesn't buy; `offtakerStats` returns **no money fields**; monthly settlement lanes unseeded. | Money headline: annual PPA spend, delivered-vs-contracted %, open settlement ZAR, carbon offset tCO2e + a monthly "your bill is ready / take-or-pay triggered" push. |
| **Lender (Growvest)** | 1 covenant certificate | Drawdown/DSCR/default/security-perfection chains all blank; no portfolio-risk roll-up on landing. | Covenant-breach early-warning + DSCR trend band; "watchlist moved" push the morning it crosses. |
| **IPP (GoNXT)** | Commissioning, QGR, tariff rows | 122 of 130 chains blank; no construction/finance/operate cross-roll-up; W71 savings ledger computed then discarded. | Single project-health cockpit (schedule × cost × covenant × generation) + milestone/CP-expiry countdown push. |
| **Carbon (Envera)** | Registration + 2 MRV rows | VCM order book (`vcm-order-book.ts`: `/market-data` 30d VWAP, `/depth`, `/trades`, mounted `mount-routes.ts:729`) + W109 rating + W91 CCP chains **unwired to carbon headline.** | Live carbon spot/VWAP band + issuance/retirement pipeline + "credits cleared / buffer event" push. |
| **Regulator** | Disposition inbox (reactive) | `national-dashboard.ts:110` returns **403 unless admin** — a full live market-health control room (active_chains, sla_breach_rate_pct, value_30d_zar, per-domain breach rollups, event_trend) sits behind one guard. | Open it to regulator → live national market-health room with **zero new compute**. |
| **Grid** | Connection/capacity/dispatch cases | Capacity-headroom and curtailment signals are queue rows, not an ambient "grid state" surface. | Live capacity-headroom + curtailment-stage band; "headroom thinned / curtailment armed" push. |
| **ESCO / O&M** | **Nothing** — no KPI band at all | `roleBlock` (`cockpit.ts:304-323`) has no esco case → `default:{}`; `KPI_SPECS` has no esco key → `HorizonKpis` returns null. W71 prognostics savings (`asset-prognostics-chain.ts:112-116`: reactive_cost_zar, savings_zar, savings_pct) computed per-asset on `/compute` then thrown away. | Predictive asset-health band (RUL, anomaly count, **ZAR saved vs reactive — the NTT-beating number**) + "failure predicted in N days" push. |
| **OEM-Support** | **Nothing** — no KPI band | Same `default:{}` / no `KPI_SPECS` key as esco; only unprompted pull is emergency-PTW (`cascade-rules/predictive-maintenance.ts:34-48`). | Ticket/SLA-breach band + spare-parts-at-risk (W72 predictive demand) + SLA-countdown push. |
| **EPC** | Submittal/RFI/ITP cases | Document-control throughput has no landing roll-up. | Submittal-turnaround + open-NCR band; "RFI overdue" push. |
| **Admin** | Platform ops | `admin-revenue.ts` full live P&L (`/summary` monthly_fee_zar, `/by-role`, `/leakage`, `/arr`, flippable live via `PUT`) reached only via a buried surface. | Revenue P&L + leakage headline on Horizon; one-click fee flip. |

---

## Cross-cutting: the 5 builds that convert SOR → daily-pull (ranked)

| # | Build | Why it's the unlock | Cost (it's wiring, not new system) |
|---|---|---|---|
| **1** | **06:00 SAST daily-brief email** | The platform has **no outbound mouth.** `email.ts:151 sendEmail` (MailChannels) is wired to 4 auth templates only; `email_sent` column written 0, read nowhere. | Add a `daily_brief` template + a `0 4 * * *` cron case (`index.ts:219 runCron`) that renders each role's existing Horizon duty/KPI payload. Reuses all existing compute. |
| **2** | **Platform Pulse ticker (BBO / VWAP / depth)** | The clearing price already exists (`OrderBook` DO, `vcm-order-book.ts`) and **no screen shows it.** A market without a visible price gives no ambient reason to look. | Wire the already-exposed `/orderbook-depth` + `/market-data` into a Horizon header strip. Zero new backend. |
| **3** | **Opportunity-broadcast cascade rule** | Every cascade rule today matches a *counterparty event* — nothing is **time- or market-triggered.** No rule ever says "a deal opened that fits you." | One cron-driven producer that `pushRoleAction()`s "listing/headroom/opportunity" cards into the reactive `/api/feed` rail (`role-actions.ts:42`). |
| **4** | **Peer-benchmarking band** | Roles see their own numbers, never their **rank.** Comparison is the strongest habitual pull (Strava/Bloomberg). | Aggregate existing per-tenant metrics into anonymised percentiles; one new read endpoint + one band. |
| **5** | **SLA-countdown push** | SLA timers exist on every chain but only surface as a queue row; the user learns of a breach **after** it costs them. | Push on the existing SLA timer when `time_remaining` crosses a threshold — reuses the timer already computed per chain. |

**Builds 1, 3 and 5 share one new primitive: a producer that fires on *time/market state*, not on a counterparty action.** That single primitive plus an outbound channel is the whole disruption delta. Everything else (2, 4, and all per-role bands) is repointing data the system already computes onto the landing screen.

---

## Bottom line

CEC is already a real exchange — 207 governed flows, 78 cross-role handoffs, a fee engine that bills only for work done. What it is *not*, yet, is **habit-forming**: it speaks only when spoken to, and it never shows a price or a rank. The gap between "system of record" and "platform you open every morning" is two new producers (a time/market-triggered cascade + an email/push mouth) and a wiring pass that surfaces compute the platform already does. None of it is a rewrite.
