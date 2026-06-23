# Production Live-Simulation — Findings & Improvement Report

**Date:** 2026-06-16
**Harness:** `open-energy-platform/tests/prod/prod-live-sim.ts` (+ `tests/browser/month-simulation.spec.ts`)
**Target:** production (`oe.vantax.co.za`)
**Scope:** every role, every createable chain, cross-functional journeys, real transaction capture, 5xx triage from the prod `error_log` table.

---

## 1. What the simulation does

The harness logs in as each of the nine demo personas, then for every createable chain in the `MERIDIAN_CHAINS` registry it builds an initiation payload from the chain's declared `initiation.fields`, POSTs it to the live endpoint, advances the resulting case through its state machine, and records the real transaction. It then reads the production `error_log` table (populated by `app.onError` in `src/index.ts`, keyed by `req_id`) and buckets every 5xx by root cause. The browser walk (`month-simulation.spec.ts`) drives each role's Horizon workspace, surface walk, and Thread chain-advance with console/network/visual capture, simulating a month of activity per role.

This is the final full pre-national-launch test: does the code logic actually satisfy every scenario, persona, and journey against the real production stack — not a mock.

## 2. 5xx triage — seven root-cause classes (all fixed)

Every 5xx the simulation produced fell into one of seven classes. All are resolved (commit `4b8cdbc4`); the harness commit is `c7ad6b5a`.

> **Class 2 extension (commit `276a58be`).** A re-fired post-deploy run surfaced three residual Class-2 5xx on carbon creates: the handlers guarded only their `*_tier` column and left the *sibling* `CHECK`-constrained enum columns unguarded (`methodology`/`registry_standard` on `/api/carbon/vcm-projects`, `sector` on `/api/carbon/budget`, `bundle_type` on `/api/certificate-track/bundle`). Two fixes were applied together: (a) `badEnum()` guards covering **every** `CHECK`-constrained column each handler writes from body — not just the tier — turning the 500 into a clean 400; and (b) the matching `MERIDIAN_CHAINS` initiation fields were converted from bare `string` to `enum` + `options` (static literals matching the prod DDL) so the registry-driven path — both the sim and the onboarding wizard — emits in-range values and the create *succeeds* rather than 400ing. Inline enum pickers also make this class impossible from the UI by construction (per §3.2). The lesson generalises: the Class-2 guard pass must enumerate *all* `CHECK` columns a handler writes, not only the field that happened to trip first.

| Class | Symptom | Root cause | Fix |
|---|---|---|---|
| **1** | All ledger/thread reads + audit-chain/compliance-notices POSTs 500 under burst | An **unwrapped KV `PUT` returning 429** on the per-request front-door middleware (module-access cache, security rate-limiter, tenant-quota persist, metering aggregate cache) bubbled to a 500 — so a transient KV throttle took down *every* read and write, not just the cache write | Wrapped all six front-door KV `PUT`s in `try/catch`. A KV 429 now falls through to the freshly-computed value. Rate-limiting "falls open" (it is capacity shaping, not a security boundary). |
| **2** | `CHECK constraint failed` 500 on create | A handler passed a caller-supplied enum string straight into a `CHECK`-constrained column | Server-side `badEnum()` guards returning **400** across 21 chain routes. Allow-lists are hardcoded literals in each handler. |
| **3** | `no such column: cb_tier / vcm_tier / bundle_tier` | Carbon tier columns missing on prod | Migration `508` + `deploy.yml` column reconcile |
| **4** | `no such column: tier` on ipp-ppa-variation | Prod ran old code; branch code correctly INSERTs `variation_tier` | Resolved by deploying the branch |
| **5** | `RangeError: Invalid time value` | `new Date(bad).toISOString()` on a malformed caller date (ipp-mir, ipp-progress-claim, ipp-subcontractor) | `badDate()` guards returning **400** before the throw |
| **6** | `no such column: external_ref` on trade order create | Column missing on prod | `deploy.yml` reconciles `external_ref` onto `trade_orders` |
| **7** | `FOREIGN KEY constraint failed` on carbon/credits | Credit referenced a non-existent project | FK pre-validation in `carbon.ts` → **404** when project absent |

**Security invariant held throughout:** every table/column/status identifier written is a static literal. No identifier is ever derived from request input. Class 2/5 fixes are hardcoded enum/format allow-lists in handlers; they never read schema names from the body.

**Net effect:** the registry is now all-enum, so the *registry-driven* sim path can no longer trip a CHECK constraint. The server-side guards are the defensive backstop for direct API clients (anything not going through the registry), turning silent 500s into clean 400/404s with structured messages.

## 3. Improvement findings (beyond the 5xx fixes)

### 3.1 Marketplace — price-band control is shadowed by mark staleness

`pre-trade-guards.ts` evaluates guards in fixed order. **Step 4 (`STALE_MARK`)** rejects any order whose mark price is missing or older than 30 minutes, and it runs **before step 5 (`INVALID_PRICE_BAND`)**. On production the VWAP mark-price cron (`0 * * * *`) had not populated marks, so *every* limit order was rejected with `STALE_MARK` and the fat-finger price-band control was never reached — it is effectively invisible and untestable end-to-end until marks exist.

**Recommendation:**
1. **Seed marks before launch.** Run the VWAP mark cron (or backfill `mark_prices`) for every traded `energy_type` so the freshness gate passes and the price-band control actually engages. Without this, the marketplace looks "broken" to a trader (every order rejected) when the logic is correct.
2. **Surface the distinction in the UI.** `STALE_MARK` is an *operational* state (market not yet marked), not a *user error*. The trader's order ticket should show a "market not yet marked — orders open at HH:MM" banner rather than a generic rejection, so the trader doesn't read an infra gap as a bug.
3. **Monitor mark age.** Add a surveillance alert when any active instrument's mark age exceeds the threshold during trading hours — a stale mark silently halts that instrument's order flow.

### 3.2 Onboarding & wizards

The chains are deep (L4/L5) but a first-time user of any role faces an empty Horizon with no guided first transaction. Each role's `initiation.fields` already encodes everything a wizard needs (field types, enums, required-ness).

**Recommendation:** drive a per-role onboarding wizard directly off the registry `initiation.fields` — the same metadata the sim uses to build payloads. One generic wizard component, fed by registry descriptors, gives every role a guided "create your first <chain>" flow with inline enum pickers (which also makes Class 2 impossible from the UI by construction). The multi-batch onboarding plan already drafted at `open-energy-platform/docs/superpowers/plans/2026-06-13-onboarding-multi-batch.md` is the right vehicle.

### 3.3 Algorithms

- **Mark-price dependency (above)** is the highest-leverage algorithmic gap: several downstream controls (price band, pre-trade margin) silently no-op without fresh marks.
- The predictive Esums brain (asset prognostics, RUL, fault fingerprinting — Wave 71) and the spare-parts demand signal that consumes it (Wave 72) are sound but depend on real telemetry; confirm they are fed actuals (per the "Goldrush actuals only" rule) before launch rather than empty windows that produce degenerate predictions.

### 3.4 Cross-role interaction

The cascade fabric (`fireCascade`) and the Layer-C cross-role push (counterparty `IncomingPanel`) work end-to-end in the sim. The remaining gap is **observability**, not correctness: when a cascade fans out across roles there is no single trace view a launch operator can watch. Recommend a lightweight admin "cascade trace" surface keyed by the existing cascade event IDs.

## 4. Systemic recommendation — registry ↔ DB-schema contract test in CI

Classes 2, 3, 4, and 6 are all the **same underlying defect**: drift between the `MERIDIAN_CHAINS` registry (and the handlers) and the actual D1 schema on prod. Each was found only by hitting production. This should be caught in CI, not on the live system.

**Add a CI test that, for every createable chain in the registry:**
1. Asserts the target table exists and every column the handler writes exists in the migration-defined schema (catches Class 3/4/6 — missing columns).
2. Asserts every enum value the registry can emit for a `CHECK`-constrained column is within that column's `CHECK` allow-list (catches Class 2 — constraint violations).
3. Asserts every date field is guarded by `badDate` before any `toISOString()` (catches Class 5 — `RangeError`).

This turns "discover the schema drift by 500ing on prod" into "fail the build". It runs against the migration-applied local D1, costs no prod traffic, and is the single highest-value reliability investment from this exercise.

## 5. Status

- All seven 5xx classes fixed (plus the Class-2 extension above); backend `tsc` clean; SPA build clean; **8165/8165** unit tests green.
- Deployed to production via CI (`deploy.yml` on `main`, deploy `27606668901` / SHA `276a58be`), which also reconciles the Class 3/6 columns on the prod database.
- **Post-deploy re-run confirms a clean zero-real-5xx pass**, triple-verified against three independent sources:
  1. Harness report totals — `status5xx: 0`, `networkErrors: 0`, `findingsP1: 0` (run `SIM-20260616111259-a8a293`, 539 HTTP calls, 515 2xx).
  2. Raw `ledger.jsonl` — 0 of 539 records with `status >= 500`.
  3. Prod `error_log` for the run window — 0 rows (`app.onError` never fired).
- The remaining 24 4xx are all expected, non-defect outcomes: input-validation 400s, role-gate 403s on synthetic `-nonexistent` ids, not-found 404s (incl. the Class-7 FK pre-validation returning 404 on an absent carbon project), idempotency 409s, and three `STALE_MARK` 422 pre-trade rejections (the §3.1 marketplace observation). The single P2 — a 404 on `GET /api/thread/ipp_fm/<uuid>` — is correct: that id is a synthetic probe and does not exist in `oe_ipp_fm`.
