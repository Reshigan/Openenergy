# 06 - Data Flows

How energy data enters the platform, where it lands, and what reads it. Written
for a support engineer new to the system. Grounded in `src/routes/esums-accruals.ts`,
`src/routes/esums-ingest.ts`, `src/routes/esums-solax.ts`,
`src/utils/cascade.ts`, and `src/routes/asset-prognostics-chain.ts`.

---

## 1. The two data planes

There are two separate planes that hold energy data. Knowing which one a screen
reads from is the key to triaging "the numbers are wrong" tickets.

### Financial plane - `site_accruals`

The money-and-carbon ledger. One row per station per hour. Columns that matter:

- `kwh_delta` - energy generated in that hour
- `cumulative_kwh` - running total
- `carbon_tco2e` - tonnes CO2e avoided (kWh times grid intensity, default
  950 gCO2e/kWh)
- `revenue_zar` - fund revenue (kWh times PPA tariff rate)
- `savings_zar` - customer savings (kWh times customer tariff rate)
- plus the rates actually used and an `is_backfill` flag

This is treated as the immutable source-of-truth ledger. Everything financial
(settlement invoices, carbon credits, carbon-fund holdings) is a MATERIALIZED
VIEW derived from it, rebuilt idempotently by `materializeFinancials(...)`.
Never hand-edit derived tables; rebuild them from `site_accruals` instead.

### Telemetry plane - `om_telemetry` per `om_devices`

The engineering/operations plane. Time-series sensor rows keyed by device. Used
by the O&M dashboards and by the Wave 71 predictive ML (asset prognostics).
Columns include `ac_kw`, `dc_kw`, `yield_kwh`, `interval_kwh`, plus voltage,
current, frequency, temperature, irradiance, and water-treatment fields, and a
`quality` flag. Devices live in `om_devices`, which belong to `om_sites`.

The two planes are populated independently in normal operation: telemetry comes
from live device pushes (section 3), accruals come from SolaX yield readings.

### The bridge (latest change)

As of the latest change, the SolaX historical backfill seeds BOTH planes from
the SAME readings. When `backfillStationHistory` runs it writes the financial
rows to `site_accruals` AND seeds `om_sites` + `om_devices` + hourly
`om_telemetry` from the same SolaX yield readings. No extra API calls, no
synthetic data. This means a freshly backfilled station has both a financial
history and a telemetry history that the O&M and ML surfaces can read, derived
from identical source readings.

The telemetry seed is idempotent: it uses deterministic ids
(`omt_bf_<station>_<hour>` for telemetry, `omdev_<station>` for the device,
the linked `site_id` or `site_bf_<station>` for the site) and upserts on
re-run. For each backfilled hour it writes `ac_kw` and `interval_kwh` equal to
that hour's `kwhDelta` (average power over the 1-hour interval) and `yield_kwh`
equal to the cumulative meter reading.

---

## 2. How one reading flows from SolaX into both planes

Tracing the backfill path in `esums-accruals.ts`:

1. SolaX API call. `backfillStationHistory` walks the history in 11-hour
   windows (SolaX caps a request at 12 hours), calling `getHistoricalData(creds,
   deviceSn, winStart, winEnd, 60)` at 60-minute resolution. Concurrency is
   capped at 2 because SolaX silently returns empty data for too many
   simultaneous requests on one token.
2. `hourTotals` map. Each returned point's cumulative `total_kwh` is bucketed by
   hour key (`"2026-06-04T17"`), keeping the max seen for that hour.
3. `hourPoints` array. Hours are sorted chronologically and the per-hour delta
   is computed as `totalYield[i] - totalYield[i-1]` (floored at 0).
4. Financial plane write. For each `hourPoint` the engine computes
   `carbon_tco2e`, `revenue_zar` (using the period's tariff, which honours a
   one-step PPA escalation via `tariffForPeriod`), and `savings_zar`, then
   batch-upserts the rows into `site_accruals` (batched to stay within the D1
   round-trip budget; conflict key is `(station_id, period_hour)`).
5. Telemetry plane write. From the SAME `hourPoints` it batch-upserts
   `om_sites`, one `om_devices` inverter row, and an `om_telemetry` row per hour
   (in slices of 100).
6. Resumable job state. A full portfolio backfill walks back up to 2 years, one
   ~7-day chunk per station per tick, and persists progress in
   `solax_backfill_jobs`. The frontend drives it across many short requests via:
   - `POST /backfill/start` - queues one job per active SolaX station
   - `POST /backfill/tick` - advances up to `max_jobs` jobs by one chunk each
     (stops a station after 3 consecutive empty chunks past real data =
     end-of-history)
   - `GET /backfill/status` - per-station and aggregate percent for the panel
   - `POST /backfill/finalize` - after the import drains, runs
     `materializeFinancials` over full history to rebuild invoices/credits/
     holdings, then fires one "historic data loaded" notification per
     stakeholder (deterministic id, no per-row spam) and an audit-only cascade.

The hourly cron path (`computeStationAccruals`, the `5 0 * * *` job) is the
live, ongoing version: it reads the latest realtime snapshot
(`station_telemetry_snapshot`, refreshed from SolaX if stale > 70 min), uses
`daily_kwh` to compute the new hour's delta against today's prior accruals, and
writes one `site_accruals` row. It also bridges to monthly
`esums_carbon_credits` and `esums_settlement_invoices` rows when the station has
a carbon/offtaker participant linked, and fires an `esums_accrual_computed`
cascade.

---

## 3. Live telemetry connector (the other way into the telemetry plane)

`esums-ingest.ts` is the live device path, mounted at `/api/esums-ingest`. It
does NOT use a user JWT. Devices, on-prem gateways, and CSV uploads send a
per-site ingest token in `Authorization: Bearer`; the token hashes to
`om_ingest_keys.token_hash`.

- `POST /telemetry` - JSON body `{ readings: [{ device_id, ts, ... }] }`
- `POST /telemetry/csv` - text/CSV body with a header row

Scope rule: a key issued for `site_id = X` may only write telemetry for devices
that already belong to site X. Out-of-scope rows are counted as rejected and
surfaced in `error_sample`. Every batch is bracketed by an `om_connector_runs`
record (status ok / partial / failed) so operators can audit each push on the
Live tab. Successful writes also refresh `om_devices.last_seen_at`.

---

## 4. SolaX integration and credentials

### Station discovery - `esums-solax.ts`

`POST /sync` discovers all SolaX plants and inverters and upserts them:

- each SolaX plant becomes one `om_sites` row (matched by participant + name,
  created if absent)
- each inverter upserts a `solax_stations` row linked to that site

Sync never clobbers a manually set `site_id` (it uses `COALESCE`). A site can
hold many stations of mixed make ("many integrations per site"). All SolaX calls
use `businessType=4` (Commercial & Industrial).

### Credential resolution

Both the proxy/sync (`resolveCreds` in `esums-solax.ts`) and the accruals engine
(`computeStationAccruals` and `backfillStationHistory`) resolve SolaX
credentials the same way: a JOIN onto `manufacturer_credentials`
(`client_id` / `client_secret`, and optionally `base_url`) for the participant,
falling back to the worker env vars `SOLAX_CLIENT_ID` / `SOLAX_CLIENT_SECRET`
(and `SOLAX_BASE_URL`) when no per-org row exists.

This is what lets an org enter its own SolaX keys in the CEC UI and have the
proxy use them instead of a single platform-wide key. If credentials are missing
the proxy throws a 503 ("SolaX credentials not configured"); the accruals/
backfill engine returns zero rows rather than erroring.

OAuth: client_credentials grant, token cached per isolate keyed by `client_id`
so tenants never share a token, re-fetched on cold start or expiry (token TTL is
30 days per the SolaX docs noted in code).

Base URL gotcha: demo defaults to the EU base
(`openapi-eu.solaxcloud.com`); live uses the GLOBAL base
(`openapi.solaxcloud.com`) because the SA Goldrush plants are registered there.
A per-org `manufacturer_credentials.base_url` overrides either.

---

## 5. Goldrush / GoNXT - ACTUALS ONLY

Goldrush is a real C&I portfolio of 10 SolaX inverter stations
(GoNXT / NXT Energy). Hard policy, stated repeatedly in the codebase and the
team memory:

**Never insert synthetic kWh or billing rows for these sites.** Every kWh and
every ZAR figure must come from real SolaX API actuals. The backfill bridge into
the telemetry plane (section 1) was specifically built to reuse the same SolaX
yield readings rather than fabricate telemetry. If a Goldrush dashboard looks
empty, the fix is to run the backfill, not to seed data.

---

## 6. The cascade system

`fireCascade(ctx)` in `src/utils/cascade.ts` is the fan-out hub. Every mutation
that matters calls it with `{ event, actor_id, entity_type, entity_id, data,
env }`. It then runs these stages, each error-isolated so one failure never
breaks the user request or the other stages:

1. Audit. A durable `audit_logs` row is written. The fast path batches the audit
   row and all notification rows into a single `env.DB.batch()` call. It also
   appends to the tamper-evident L5 audit chain (`appendAudit`), skipped only
   for `audit.event_appended` events to avoid recursion.
2. Notifications. Fans out to the resolved recipients
   (`createNotifications` / `determineNotificationRecipients`).
3. Webhooks. Fire-and-forget async delivery (`deliverWebhooks`) so a slow
   external receiver never holds up the response.
4. Ecosystem layers - registry (`runCascadeRegistry`, the cross-role rules),
   analytics (`recordPlatformEvent`), and commercial/fee (`computeAndRecordFee`).

Queue behaviour: if the cascade `QUEUE` binding is provisioned, the ecosystem
layers are enqueued as a `PlatformEvent` so the request returns immediately and
the Worker's `queue` handler (`processCascadeQueueBatch`) runs registry +
analytics + commercial off the request path. If the Queue send fails, or the
binding is not live, the same layers run inline so tests still observe the
effect synchronously.

Failure handling: a stage that fails terminally (after retry with exponential
backoff) is persisted to the `cascade_dlq` table for inspection and retry from
the support cascade-DLQ console. The nightly `5 0 * * *` cron purges resolved/
abandoned DLQ rows older than 90 days.

The `EventType` union in `cascade.ts` enumerates the full event taxonomy
(auth, contract, trading, settlement, carbon, IPP, grid, Esums O&M, and the
Wave 1-74 state-machine chains). Energy example: `computeStationAccruals` fires
`esums_accrual_computed`, carrying the hour's kWh/carbon/revenue/savings plus the
linked lender/carbon/offtaker participant ids, so downstream roles get notified
without per-row spam during a backfill.

---

## 7. Predictive ML tables

The Wave 71 asset-prognostics surface (`asset-prognostics-chain.ts`) is the
predictive O&M brain. It reads the telemetry plane (`om_telemetry` / `om_devices`
/ `om_faults` / `om_predictions`) and works alongside these ML tables:

- `oe_anomaly_detection_ml`
- `oe_rul_prediction_ml` (remaining-useful-life)
- `oe_fault_fingerprint_ml`
- `oe_asset_prognostics`

`POST /compute` is the live predictive endpoint. It consumes a numeric LOAD
SERIES from the request body (`series: number[]`, with an optional `latest`
value) and runs the predictive math on it: degradation trend, an anomaly fusion
(`mlAnomalyFusion`), and a survival/RUL estimate (`survivalRul`) against a
failure threshold. In other words, the caller passes the device's recent reading
series (sourced from the telemetry plane) and `/compute` returns the
anomaly/degradation/RUL decision support. This is the same telemetry the SolaX
backfill now seeds, so a backfilled station can feed the predictive brain
without waiting for live device pushes to accumulate.

---

## Quick reference: which table does this screen read?

| Surface | Plane / table |
|---|---|
| Revenue, savings, carbon tCO2e dashboards | financial - `site_accruals` |
| Settlement invoices, carbon credits, fund holdings | derived from `site_accruals` via `materializeFinancials` |
| O&M live data, device health, fleet status | telemetry - `om_telemetry` / `om_devices` |
| Predictive anomaly / RUL / fault fingerprint | telemetry plane + `oe_*_ml` tables; `/compute` on a load series |
| Backfill progress panel | `solax_backfill_jobs` |
| Live device push audit | `om_connector_runs` |
