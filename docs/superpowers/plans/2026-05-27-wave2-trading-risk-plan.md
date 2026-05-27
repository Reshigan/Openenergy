# Wave 2 — Trading & Risk to CFTC + BIS PFMI grade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship daily historical-simulation VaR + scenario engine to CFTC-aligned depth: 6 D1 tables, /api/risk + /ai/risk routes, nightly cron, Risk tab in Trader workstation, scenario builder, Friday-17:00 MTD digest to antoinette only.

**Architecture:** D1 + nightly cron + reuse of `oe_digest_subscriptions`. Per spec `docs/superpowers/specs/2026-05-27-wave2-trading-risk-design.md`.

**Tech Stack:** Cloudflare Workers + D1 + KV + Hono; React 18 SPA; vitest + Playwright; pure-function vector math for VaR (no third-party stats lib).

---

## File Structure

**Backend:**
- Create `migrations/094_risk_engine.sql` — 6 risk tables
- Create `migrations/095_risk_seed.sql` — system scenarios + factor history + portfolios + subscription swap
- Create `src/utils/var.ts` — revalue + simulate + var + ES + scenario
- Create `src/routes/risk.ts` — REST surface, mounted at `/api/risk`
- Modify `src/routes/ai.ts` — add risk/explain-var + risk/suggest-scenario
- Modify `src/index.ts` — mount risk routes + extend runCron for VaR compute and Friday MTD digest
- Modify `wrangler.toml` — add `0 15 * * 5` cron

**Frontend:**
- Create `pages/src/components/risk/RiskTab.tsx` — Bloomberg-density risk surface
- Create `pages/src/components/risk/ScenarioBuilderModal.tsx` — factor-shock builder
- Modify `pages/src/components/pages/TraderWorkstationPage.tsx` — add Risk tab key
- Modify launch board (admin) — add VaR-summary card

**Tests:**
- Create `tests/var-utils.test.ts` — pure-function unit tests with fixture P&L vectors
- Create `tests/risk-routes.test.ts` — Hono route registration introspection
- Create `tests/browser/trader-risk.spec.ts` — Playwright smoke

---

## Tasks (compact)

### Task 1 — Migration 094 (data model)

Files: Create `migrations/094_risk_engine.sql` with 6 tables per spec.
Step 1: Write SQL. Step 2: `wrangler d1 migrations apply --local`. Step 3: Verify with `wrangler d1 execute --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'risk_%'"`. Step 4: Commit `feat(risk): migration 094 — VaR + scenario tables`.

### Task 2 — `src/utils/var.ts` + unit tests

Files: Create `src/utils/var.ts` + `tests/var-utils.test.ts`.
TDD: write 4 failing tests (revaluePosition known answer, simulateHistoricalPnL length, varAtConfidence with sorted fixture, expectedShortfall with sorted fixture) → implement → green → commit `feat(risk): historical-simulation VaR utilities`.

### Task 3 — `src/routes/risk.ts` (12 endpoints)

Files: Create `src/routes/risk.ts`, mount in `src/index.ts` at `/api/risk` (single mount — no `/:projectId/...` nesting, no risk of basePath collision per [feedback-route-mount-collision]).
TDD with route-registration test file `tests/risk-routes.test.ts` first → implement endpoints → green → commit `feat(risk): /api/risk routes (portfolios + var + scenarios)`.

### Task 4 — Cron integration in `runCron()`

Files: Modify `src/index.ts`.
On `5 0 * * *`: add VaR refresh stage that iterates portfolios, calls `simulateHistoricalPnL`, persists `risk_var_results`, then iterates system scenarios and persists `risk_scenario_results`. On new `0 15 * * 5`: build MTD HTML, write `oe_digest_deliveries`. Add the new cron to `wrangler.toml`. Commit `feat(risk): nightly VaR compute + Friday MTD digest cron`.

### Task 5 — AI inline assists

Files: Modify `src/routes/ai.ts`. Add `POST /ai/risk/explain-var` + `POST /ai/risk/suggest-scenario`. Both query the latest var_results / scenario_results, build a narration, log to `ai_decisions`, fire cascade. Commit `feat(ai): risk explain-var + suggest-scenario assists`.

### Task 6 — Migration 095 (seed)

Files: Create `migrations/095_risk_seed.sql` with: 8-10 risk_factors, 260 days of factor history (synthetic but realistic SA price ranges), 12 system scenarios with factor_shocks_json, 4 system portfolios (one per major filter), and the subscription swap (disable dgsub_demo_admin + dgsub_demo_ipp, insert antoinette MTD weekly). Commit `feat(risk): seed factors + scenarios + antoinette MTD subscription`.

### Task 7 — Frontend RiskTab

Files: Create `pages/src/components/risk/RiskTab.tsx`. Top KPI strip, P&L histogram SVG, factor-contribution + scenario tables. data-testid attributes for Playwright. Commit `feat(risk): RiskTab UI (KPIs + P&L histogram + scenario table)`.

### Task 8 — Frontend Scenario builder modal

Files: Create `pages/src/components/risk/ScenarioBuilderModal.tsx`. Factor picker + shock inputs + save + run-now. Commit `feat(risk): scenario builder modal`.

### Task 9 — Wire Risk tab into Trader workstation + admin landing card

Files: Modify `pages/src/components/pages/TraderWorkstationPage.tsx` and launch board admin config. Commit `feat(risk): wire Risk tab into Trader workstation + admin VaR card`.

### Task 10 — Playwright spec

Files: Create `tests/browser/trader-risk.spec.ts`. Login as admin → trader workstation → Risk tab → KPIs visible, scenario table visible, no 5xx. Commit `test(risk): Playwright spec for trader Risk tab`.

### Task 11 — Apply migrations on prod + push + verify

Steps: `wrangler d1 execute --remote --file migrations/094_risk_engine.sql`, same for 095. Push to main. Wait for CI green. curl `/api/risk/portfolios` and `/api/risk/scenarios` from prod, confirm 200 + data. Update memory with Wave 2 outcome + roadmap status. Commit `docs(roadmap): Wave 2 shipped — Trading risk to CFTC grade`.

---

## Self-review

- All 11 tasks have specific files + specific commands.
- Route mount avoids the basePath/param collision lesson from Wave 1 — risk routes use a flat `/api/risk` mount.
- TDD enforced on `var.ts` and `risk-routes.test.ts`.
- Spec coverage: data model (T1), utils (T2), routes (T3), cron (T4), AI (T5), seed (T6, includes subscription swap), UI (T7-9), tests (T10), deploy (T11). No gaps.
- Subscription swap is in T6 — antoinette gets the MTD digest, samuel/abigail get nothing, existing morning_briefing subs disabled.
