# Wave 2 — Trading & Risk to CFTC + BIS PFMI grade — Design

**Date:** 2026-05-27
**Status:** Approved
**Reference standard:** CFTC + BIS PFMI (US-style, real-time pre-trade risk + end-of-day VaR + scenario)
**Cadence pick:** Daily mark + manual margin calls (per user)
**Scope pick:** Daily VaR + scenario engine only (margin call workflow, surveillance, CAT-style audit deferred to later waves)
**MTD report:** Friday 17:00 SAST → antoinette@gonxt.tech (only digest; existing morning_briefing subs disabled)

## Intent

Lift the trading surface from L3 to CFTC-aligned daily risk: 250-day historical-simulation VaR (95% + 99%) + Expected Shortfall, scenario engine with a curated 12-scenario SA-grid library + user-defined builder, per-portfolio + per-counterparty exposure breakdown. Risk results computed nightly by cron, served by `/api/risk` to a new Risk tab on the trader workstation, plus a Friday MTD email digest to antoinette.

## Architecture

Single nightly cron piggy-backing on the existing `5 0 * * *` slot does the heavy lift:
1. Refresh `risk_factor_history` from `mark_prices` + external feed stubs (FX, fuel).
2. For each portfolio, compute the 250-day simulated P&L vector by re-valuing current positions against each historical day's factor shifts.
3. Persist VaR 95/99 + ES into `risk_var_results` (one row per portfolio × as_of_date × confidence × horizon).
4. For each portfolio × each system scenario, persist P&L impact + factor breakdown into `risk_scenario_results`.

A second new cron `0 15 * * 5` (Fri 17:00 SAST) builds the MTD digest for antoinette by aggregating that week's risk_var_results + risk_scenario_results into an HTML body and writing it to `oe_digest_deliveries`.

All synchronous (no Durable Objects). 250 days × ~200 positions/portfolio × ~10 portfolios = ~500k revaluations per night, comfortably under the Worker 30s budget when implemented as pure-function vector math.

## Data model — migration 094

Six new tables:

- `risk_factors (id PK, name, factor_type [spot|fx|rates|fuel|index], unit, source, created_at)` — the priced universe (ZA spot energy, ZAR/USD, coal API4, REIPPPP RR4, carbon offset ZAR, etc.)
- `risk_factor_history (factor_id FK, as_of_date, value, source_run_id, PRIMARY KEY (factor_id, as_of_date))` — daily closes, 250+ rows per factor
- `risk_portfolios (id PK, name, owner_id FK→users, basis_filter_json, is_system, created_at)` — saved views (filter by trader, counterparty, energy_type, side)
- `risk_var_results (id PK, portfolio_id FK, as_of_date, methodology, confidence, horizon_days, var_amount_zar, es_amount_zar, components_json, created_at)` — one row per portfolio × date × confidence (95/99) × horizon (1/10 day)
- `risk_scenarios (id PK, name, description, is_system, factor_shocks_json, owner_id FK, created_at, updated_at)` — system library + user-defined
- `risk_scenario_results (id PK, scenario_id FK, portfolio_id FK, as_of_date, pnl_impact_zar, breakdown_json, created_at)` — one row per scenario × portfolio × date

Migration is CREATE TABLE IF NOT EXISTS only (idempotent, matches the platform's discipline).

## Utilities — `src/utils/var.ts`

Pure functions, easy to unit-test:
- `revaluePosition(position, factor_shifts: Record<factor_id, pct>): number` — re-mark one position under a factor scenario
- `simulateHistoricalPnL(positions, factor_history, lookback=250): number[]` — return 250-element P&L vector
- `varAtConfidence(pnls: number[], confidence: 0.95|0.99): number` — negative of percentile
- `expectedShortfall(pnls: number[], confidence: 0.95|0.99): number` — mean of worst tail
- `runScenario(positions, scenario.factor_shocks): { pnl, breakdown[] }`

## Routes — `src/routes/risk.ts` mounted at `/api/risk`

- `GET /portfolios` — list (user's own + system)
- `POST /portfolios`, `PUT /portfolios/:id`, `DELETE /portfolios/:id` — user-owned only
- `GET /portfolios/:id/var?as_of=YYYY-MM-DD&confidence=0.95` — latest if as_of omitted
- `GET /portfolios/:id/var/history?days=30` — sparkline data
- `POST /portfolios/:id/var/recompute` — manual rerun (idempotent, also fires the cron path)
- `GET /portfolios/:id/exposure` — per-counterparty mark-to-market breakdown
- `GET /scenarios` — system + user-defined visible to caller
- `POST /scenarios`, `PUT /scenarios/:id`, `DELETE /scenarios/:id` — user only (system scenarios are read-only)
- `GET /scenarios/:id/results?portfolio_id=X` — historical scenario P&Ls
- `POST /scenarios/:id/run?portfolio_id=X` — on-demand run; returns immediate result + persists
- `GET /factors` — list
- `GET /factors/:id/history?days=N` — chart data

Role gating: traders + admin + regulator + support read; only owner + admin can mutate user-owned rows.

## AI inline assists

- `POST /api/ai/risk/explain-var` — narrate top 5 drivers ("Spot ZA energy explains 62% of today's VaR via your 24 long positions; ZAR/USD adds 18% via the dollar-priced coal cost basis").
- `POST /api/ai/risk/suggest-scenario` — given recent factor moves, propose 3 historically-rhyming named scenarios.

Both follow the `fireCascade` + `ai_decisions` audit-trail pattern from Wave 1.

## Frontend

**New "Risk" tab in Trader workstation** — Bloomberg-density layout:
- Top strip: portfolio selector, as-of date picker, VaR 95% / VaR 99% / Expected Shortfall (mono, large)
- Middle: 250-day historical P&L histogram (SVG, red tail past the VaR cut)
- Bottom: factor-contribution table + scenario results table (sortable by P&L impact)

**Scenario builder modal** (Risk tab + Regulator workstation):
- Pick factors → set shock magnitudes (% or absolute) → name & save → run-now

**Admin platform launch board card**: top 10 portfolios by VaR, count of triggered scenarios, "VaR YoY trend" sparkline.

## Seed — migration 095

- 12 SA-grid system scenarios (load-shedding stage 4/6/8, Eskom tariff hike, REIPPPP delay, coal +30%, ZAR ±15%, carbon tax escalation, grid code change, gas supply shock, drought hydro, REC oversupply, peak demand spike, transmission outage)
- 8-10 risk_factors with 260+ days of stubbed history (so VaR has data to compute on day 1)
- 1 system risk_portfolio per role (trader desk, all counterparties, all renewables, all baseload)
- **Subscriptions:** disable `dgsub_demo_admin` + `dgsub_demo_ipp` (set enabled=0; preserve rows). Insert one new subscription:
  - `dgsub_risk_mtd_antoinette` → antoinette@gonxt.tech, channel=email, digest_type=risk_mtd_weekly, send_hour_sast=17, send_days='fri', enabled=1

## Cron

Add one new schedule to `wrangler.toml`:
- `0 15 * * 5` → Friday 17:00 SAST risk MTD digest

Extend `runCron()` in `src/index.ts`:
- On `5 0 * * *` (existing), after VWAP marks: refresh factor history, compute VaR + scenarios for every portfolio.
- On the new `0 15 * * 5`: query subscriptions where digest_type='risk_mtd_weekly' and enabled=1, build MTD HTML body, write to `oe_digest_deliveries` ('sent' if EMAIL_API_KEY set, otherwise 'would_send').

## Test plan

- Unit tests for `var.ts`: revalue + percentile + ES against fixed fixtures (known answers).
- Route registration tests for `risk.ts` (Hono introspection, same pattern as Wave 1).
- Playwright: navigate to trader workstation → Risk tab → KPIs render, scenario table renders, no 5xx.
- Cron dry-run: `POST /api/admin/cron/run-once?pattern=0+15+*+*+5` produces an `oe_digest_deliveries` row in 'would_send' status.

## Open questions

None at brainstorm exit. Proceeding to write the plan.
