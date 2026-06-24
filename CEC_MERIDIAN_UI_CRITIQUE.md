# Meridian UI — Prioritized Critical Analysis

> Multi-specialist critique of the Meridian SPA (Horizon / Atlas / Ledger / Thread / Deal Desk). 14 role + cross-cutting lenses read the real frontend source; findings below are confirmed in source, not speculative. Generated 2026-06-22.

## State of the UI (verdict)

Meridian is a **disciplined, accessibility-aware case-management chrome** — the Horizon time-to-consequence board, the ZAR×time duty stream, and the warm-paper Bloomberg aesthetic with real oklch tokens and focus rings are a genuine strength, and the Horizon→Thread spine is a coherent operator path. But the through-line weakness is severe and repeated across all 14 lenses: **Meridian is a generic case-router wearing 12 role costumes.** The KPI band is a flat strip of context-free counts that can't say whether a number is good, bad, or moving; the most consequential actions silently 409 or fire without confirm; and every role-specific instrument that would make the surface a *trading desk / credit cockpit / control room / service desk* — order entry, exposure-at-risk, DSCR headroom, frequency, SLA clocks, project pivots, tonnes — is either absent or thrown away after the backend computes it. The chrome tells you *how much* there is; it almost never tells you *how close to consequence, in what direction, worth how much money.*

---

## Cross-cutting themes (ranked by lens-count × severity)

**1. KPI band keys off `role`, not `boardRole` — admin role-switch shows the wrong headline.** *(lender, esco, grid, admin, kpi-dataviz — 5 lenses)*
`HorizonPage.tsx:171` renders `<HorizonKpis role={role} />` while the board/duty/header all use `boardRole` (`HorizonPage.tsx:54`). An admin inspecting the trader board sees `active_tenants`/`pending_kyc` over trader lanes. **Confirmed in source.** Correctness defect, not a nit — the most-glanced strip contradicts the board under it. Trivial fix (pass `boardRole`), highest lens-consensus.

**2. KPI band is trend-blind, threshold-naive, and chart-free.** *(kpi-dataviz, trader, lender, offtaker, carbon, support, a11y — 7 lenses)*
Two structural bugs compound: (a) `HorizonKpis.tsx:161` tints alert on `v > 0` not a threshold, so "1 insurance expiry" screams as loud as "40", and `delivered_pct` (where LOW is bad) can't express badness at all; (b) every tile is a bare instantaneous scalar (`HorizonKpis.tsx:163`) — no delta, no arrow, no sparkline, no chart anywhere in `pages/src/meridian/`. A trader sees "P&L R4.2m" with no idea it was R8m an hour ago.

**3. All-zero suppression (`HorizonKpis.tsx:156`) hides the band exactly when zero is signal.** *(ipp, offtaker, esco, regulator, admin, a11y — 6 lenses)* For oversight/ops roles (regulator, admin) and live-but-pre-money accounts, the whole headline vanishes — an operator can't distinguish "zero failures (healthy)" from "band failed to load". Suppression should be per-tile and exempt anchor/oversight roles.

**4. Headline shows portfolio SIZE / raw counts, never money-at-risk or the role's unit of account.** *(lender, offtaker, carbon, esco, support, grid, kpi-dataviz — 7 lenses)*
Lender band is five context-free COUNTs with no ZAR (`HorizonKpis.tsx:25-31`); offtaker leads with static volume/carbon, not shortfall ZAR; carbon shows credit *counts* not *tCO2e*; support has zero SLA/breach clock; grid hides the already-computed `non_compliant`. The backend often *already computes* the decision-relevant number and the band drops it.

**5. Inline duty/thread actions fire blind — bare empty-body POST, no confirm, no fields, no busy state.** *(trader, esco, support, grid, interaction, a11y — 6 lenses)*
`HorizonPage.tsx:103-115,274-284` — `act()` POSTs `{}` on a single click; fielded transitions (reason code, quantum, evidence) silently 409 and surface a raw error. No `aria-busy`/disable (double-fire), no confirm on destructive grid/safety actions (`escalate_disconnection`, `issue permit`, `forced_liquidation`). Horizon's action shape carries no `fields` (`horizon.ts:62`) while Thread's drawer (`ThreadPage.tsx:189`) handles them correctly — the board strips them.

**6. Duty-stream is ZAR-only ranked — wrong for non-money roles, degrades silently when quantum is null.** *(grid, carbon, lender, offtaker — 4 lenses)*
`horizon.ts:75` + `HorizonPage.tsx:254` advertise "ranked by ZAR at risk × time remaining". A CSC-1 curtailment / N-1 outage / crediting-period lapse has trivial ZAR but maximal urgency and sinks below a fat invoice. Needs a non-ZAR consequence weight (load-shed stage, forfeited tCO2e, imputed facility balance).

**7. Thread is an event-log, not a state machine — no future gates, no cross-chain genealogy, raw `String(v)` dump.** *(ipp, support, regulator, trader, offtaker, visual-hierarchy — 6 lenses)*
`ThreadPage.tsx:137-148` renders emitted events as a uniform green "done" ladder with no remaining states (the registry knows the full path); `:150-161` dumps every raw column via `humanizeKey`/`String(v)` — unformatted ZAR/MWh/dates/enums on the L5 audit surface. No reject/breach node styling, no parent-ticket→problem→change→RMA "Related" rail, no per-case verify/export for regulators.

**8. Ledger/KPI currency formatting hinges on a regex over the column name.** *(ipp, carbon, visual-hierarchy — 3 lenses)* `LedgerPage.tsx:101` uses `/exposure|zar|amount|value/i` to choose `fmtZar` vs bare number — `capex` renders without R, `mwh`/`cpi`/`spi`/`tco2e` render unit-less, a tonnage named `value` gets wrongly stamped with R. Fix: explicit `unit` field on the KPI shape from the registry.

**9. First-run / discovery is uncoordinated.** *(a11y, visual-hierarchy, interaction — 3 lenses)* A fresh account stacks GettingStarted + GuidedTour + empty board CTA + dead duty placeholder simultaneously (`HorizonPage.tsx:165-171,239,292`) with no aria-live announcement on `?welcome=1`; ⌘K is the primary search but keyboard-only and undiscoverable on touch (`CommandPalette.tsx:47`).

---

## Top 10 prioritized actions

| # | Action | Area | Impact | Effort |
|---|---|---|---|---|
| 1 | Pass `boardRole` (not `role`) to HorizonKpis at `HorizonPage.tsx:171` so the headline matches the board being viewed | KPI band | high | S |
| 2 | Replace `v>0` alert tinting (`HorizonKpis.tsx:161`) with per-tile warn/crit numeric thresholds; add bad-when-low variant for `delivered_pct`/availability | KPI band | high | S |
| 3 | Surface already-computed but dropped stats: trader `net_exposure_mwh`, esco `pm_open`/`pr_cases_open`, grid `non_compliant`/`in_flight_connections` | KPI band | high | S |
| 4 | Token sweep `--oxide` → `--oxide-deep` on all danger TEXT (code documents `--oxide` fails AA at `meridian.css:22-24`) | chrome | high | S |
| 5 | Fix all-zero band suppression (`HorizonKpis.tsx:156`): suppress per-tile, exempt oversight/anchor roles so zero reads as affirmative OK | KPI band | medium | S |
| 6 | Route fielded duty-stream actions into the Thread FieldForm drawer instead of bare empty-body POST; add aria-busy/disable + confirm on destructive transitions | Horizon | high | M |
| 7 | Carry an explicit `unit` field (zar\|mwh\|pct\|tco2e\|days\|count) on the Ledger/KPI shape from the registry, replacing the column-name regex at `LedgerPage.tsx:101` | Ledger | medium | M |
| 8 | Render Thread as the chain's full ordered state ladder (done/current/future) + type-aware field formatting, not a uniform-green event log with `String(v)` dump | Thread | high | M |
| 9 | Add a non-ZAR consequence weight to duty-stream ranking (load-shed stage, forfeited tCO2e, imputed facility balance) so security/expiry cases out-rank fat invoices | Horizon | high | M |
| 10 | Reframe each role headline around money/unit-at-risk: shortfall-ZAR (offtaker), drawn-exposure+DSCR (lender), SLA-breach clock (support), tCO2e+clawbacks (carbon), realised-30d savings (esco) | KPI band | high | L |

Items 1–5 are all **S-effort, high-impact correctness/clarity fixes** — ship these first.

---

## KPI upgrades

**Money-led framing is the recurring ask — every role's headline should name the money/unit at stake, not the portfolio size.**

### Uses existing backend (surface a stat the backend already computes)
- **Trader — `net_exposure_mwh`** (signed): exists `cockpit.ts:413`, not in `KPI_SPECS.trader`.
- **ESCO — `pm_open` + `pr_cases_open`**: exist `cockpit.ts:388,390`, omitted from band.
- **Grid — `non_compliant` + `in_flight_connections`**: exist `cockpit.ts:369,373`, dropped (NERSA enforcement trigger + queue depth).
- **Carbon — render `credits_active` as tCO2e**: already a tonnage SUM (`cockpit.ts:512`); only the formatter (`HorizonKpis.tsx:163`) needs a `tco2e` branch.
- **Offtaker — delivery-shortfall ZAR**: derivable from existing contracted/delivered/tariff (`cockpit.ts:500-503`), no new table.
- **Admin — `failed_settlement_runs_7d`** promoted out of the auto-suppressing band into a persistent ops card (`cockpit.ts:533`).
- **Cross-role — `counts.breached / counts.total`** ratio: already returned (`horizon.ts:77`), shown only in header ctx, not as a tile.

### Needs new backend
- **Trader** — BBO/spread + VWAP mark from OrderBook DO depth snapshots (cron writes them */15, no read endpoint consumes them); position-limit utilisation %; nearest margin-call deadline (countdown).
- **Lender** — drawn-exposure ZAR + ZAR-at-risk-on-watchlist + min-DSCR-headroom (LMA forward-looking test; `lenderStats` has no monetary aggregate).
- **Offtaker** — payment-security expiring / unsecured-PPA ZAR (full Payment Security domain, zero headline signal); blended-tariff-vs-market.
- **Carbon** — ITMOs awaiting corresponding adjustment + offset clawbacks/rejections open + buffer-pool coverage % (the two highest-consequence carbon exposures, both invisible).
- **Support** — `tickets_sla_breached` + `tickets_breaching_1h` (no time-bounded count exists in `supportStats`; the number a service desk opens the screen for).
- **Regulator** — surveillance/enforcement past-SLA + levy arrears 90d ZAR.
- **Grid** — system frequency / reserve margin MW / active load-shed stage from SCADA snapshot (control-room baseline).
- **ESCO** — realised-30d predictive savings vs at-risk (replace the un-windowed lifetime SUM at `cockpit.ts:384`).
- **All roles** — prior-period delta + 24h micro-sparkline on money tiles (KV-cached previous value + lightweight history table).

---

## Enhancements & new features (by role, with depth target)

**Trader** — Live `trader:market` surface (BBO/VWAP/depth ladder from OrderBook DO) **L4**; order-ticket surface POSTing `trading.ts` with inline pre-trade-guard rejection **L4**; deadline-aware margin-call widget **L4**; trade-reporting reconciliation export (W44) **L5**.

**Lender** — Facility credit cockpit (exposure / DSCR headroom / watchlist migration / security status per facility) **L4**; watchlist migration ledger with cure clocks **L4**; security-perfection completeness as a pre-drawdown gate **L4**; DSCR/LLCR forward breach forecast + certified covenant export **L5**.

**IPP developer** — **Project as a first-class pivot** (per-project rollup of every chain vs `ipp_projects.id` — the single missing organizing entity) **L3→L4**; EVM/CPM schedule-health engine feeding SPI/critical-path KPI + milestone-variance auto-raise **L4**; insurance/bond expiry dunning chain **L4**; CP tracker tied to drawdown gating **L4**.

**Offtaker** — Take-or-pay settlement surfaced money-first (quantum auto-computed, cure-window timer) **L4**; payment-security lifecycle as monitored exposure **L4**; REC/GoO retirement with certified Scope-2 export + reconciliation **L5**; tariff-indexation notice→dispute→agree, calendar-driven **L4**.

**Carbon fund** — Article 6 corresponding-adjustment reconciliation vs UNFCCC ledger **L5**; carbon-tax offset claim with SARS audit + clawback dunning tail surfaced end-to-end **L4**; buffer-pool / reversal-coverage with non-permanence headroom gate **L4**; vintage stock-ledger **L4**.

**Regulator** — **National dashboard** (licences/enforcement/tariff/levy/surveillance heat) — the role's defining view, absent **L4**; theme AuditPanel into Meridian (today hardcoded Tailwind hex, `AuditPanel.tsx:116`) — the L5 surface looks most foreign; surveillance alert→triage→enforcement as one gated chain **L4**; per-case verify/export on Thread **L5**; scheduled external recon vs DMRE/NERSA/Eskom **L5**.

**ESCO** — Predictive-savings ledger (projected vs realised, averted-failure attribution — the NTT-beating proof) **L4**; availability-guarantee LD engine with cure timers **L4**; PM→WO auto-generation visible as a board lane **L4**; spare-parts-blocked WO overlay **L4**; live permit-to-work board **L5**.

**Support** — Cross-chain incident→problem→change→RMA traceability rail with evidence chain **L5**; cross-lane SLA-breach/priority board filter **L4**; forward state stepper on Thread **L3**; CAB/emergency-change split metric + change calendar **L4**.

**Grid** — Curtailment dispatch console (CSC-1 issue→ack→implement→meter→compensate, live countdowns) **L4**; reserve/ancillary activation settlement with penalty arm **L4**; grid-code non-conformance→disconnection track with certified NERSA export **L5**; live grid-state telemetry header from SCADA **L3**.

**Admin** — Operations Horizon (cron last-run+failures / DLQ depth / failed settlements / provisioning-KYC queue age / market-halt state), demoting the role-switcher to "view as role" **L4**; cron run-history ledger **L4**; market-halt as a first-class state-machine chain + persistent header LIVE/HALTED chip **L4**; tenant chip on cross-tenant case rows.

**Cross-cutting (IA/dataviz/a11y)** — dependency-free inline `<Sparkline>` SVG primitive wired to top-4 money tiles; per-tile warn/crit thresholds; semantic Thread state-rail (reject/breach=oxide, waiver=moss); single first-run coordinator (checklist→tour→KPIs in sequence) with aria-live on `?welcome=1`; `--oxide`→`--oxide-deep` token sweep on all danger TEXT; auto-collapse zero-case lanes (the 14-lane board is ~70% empty 96px cells).

---

## Per-role one-liner table

| Role | Top defect | Top opportunity |
|---|---|---|
| **Trader** | No order entry or live market anywhere — read-only risk monitor, not a trading desk (`surfaces.tsx:759-768`) | Live `trader:market` (BBO/VWAP/depth from OrderBook DO) + guarded order ticket — **L4** pair |
| **Lender** | Headline is 5 context-free COUNTs, zero ZAR/exposure (`HorizonKpis.tsx:25-31`); band uses `role` not `boardRole` | Drawn-exposure + ZAR-at-risk-on-watchlist + DSCR-headroom money tiles |
| **IPP developer** | No project dimension — can't see one project end-to-end across its ~14 chains (`horizon.ts:46-69`) | Per-project rollup pivot vs `ipp_projects.id` |
| **Offtaker** | Headline shows contract size, not money-at-risk; `delivered_pct` can't express "low is bad" (`HorizonKpis.tsx:41,161`) | Delivery-shortfall-ZAR tile + bad-when-low threshold + 1-click into take-or-pay |
| **Carbon fund** | Band shows credit COUNTS, never tCO2e/registry; double-counting + SARS clawback invisible (`HorizonKpis.tsx:46-52`) | tCO2e band + "ITMOs awaiting adjustment" + "clawbacks open" alert tiles |
| **Regulator** | Surveillance KPI→surface mismatch lands you on triaged decisions, excluding the open alerts it counts (`SurveillanceSurface.tsx:32`) | National dashboard + open-alert backlog with row-driven triage |
| **ESCO / O&M** | `predictive_savings_zar` is an un-windowed lifetime SUM masquerading as live signal (`cockpit.ts:384`); `pm_open`/`pr_cases_open` computed but hidden | Realised-30d vs at-risk savings split + surface PM/PR tiles |
| **Support** | Zero SLA/breach clock — the one number ITIL lives by (`HorizonKpis.tsx:69-76`) | `tickets_sla_breached` + `tickets_breaching_1h` tiles + incident→problem→change Related rail |
| **Grid operator** | ZAR-only duty ranking buries CSC-1/N-1 under fat invoices; `non_compliant` computed then dropped (`horizon.ts:75`, `cockpit.ts:369`) | Grid-state strip (frequency/reserve/load-shed stage) + security-weighted ranking |
| **Admin** | No ops home — Horizon defaults to impersonating trader; cron surface has no run history (`CronSurface.tsx`) | Operations Horizon + cron run-history ledger + persistent market-halt chip |
