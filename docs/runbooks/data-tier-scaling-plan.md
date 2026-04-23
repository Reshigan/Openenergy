# Data tier scaling plan

**Status:** draft — living document. Owner: platform team.
**Last updated:** 2026-04-23.
**Covers:** migration of high-volume tables off D1 (single-SQLite instance) as
the platform grows beyond the comfortable D1 operating envelope (~10 GB hot
working set for <100 ms P99 reads).

---

## 1 · Why

Cloudflare D1 is a single-region SQLite database. Rows are serialised; writes
block other writes on the same DB; query planner is SQLite's. Today we run the
whole platform (participants, contracts, trades, metering, audit logs, POPIA)
on one D1 instance bound as `DB`. Reads are fast (~10 ms) while the working
set stays small, but three tables grow unboundedly with usage:

| Table | Rows / yr at national scale | Source |
|---|---|---|
| `metering_readings` | 40k meters × 48 half-hours × 365 = **~700 M** | HTTPS push + SCADA ingest |
| `audit_logs` | ~5 M / yr for a ZA-size tenant base | every mutation writes a row |
| `ona_forecasts` | 2k sites × 4 forecasts/day × 365 = **~3 M** | forecaster |

At ~500 GB D1 will throttle. At ~50 GB ad-hoc queries slow. Production-grade
national deployments should plan to move these tables before they reach ~10 GB.

This doc defines the migration path, the interim partitioning that buys
runway, and the cutover strategy — all tested against the existing codebase.

---

## 2 · Current mitigations (shipped in migration 029)

Already landed via `migrations/029_data_tier_scaling.sql` and
`src/routes/data-tier.ts`:

- **Daily rollup tables:** `metering_readings_daily`, `ona_forecast_summary`.
  Dashboards, reports, and settlement read from these (low cardinality) rather
  than from the raw fact tables.
- **R2 archive + pointer index:** `metering_readings_archives` and
  `audit_log_archives` hold month/day R2 keys + row counts + sha256. Old
  months are zipped to `archive/metering/<yyyy>/<mm>/<connection>.json.gz`
  and then deleted from D1.
- **Cron rollups** (wrangler.toml `[triggers]`): `05 0 * * *` daily rollup,
  `10 0 * * *` daily settlement, `30 0 * * *` usage + margin runs.
- **Tenant quotas** (`tenant_rate_limits` + KV token buckets) cap per-tenant
  write rate to keep one noisy tenant from saturating D1.

These give **3-5 months** of extra runway at current trajectory. The rest of
this doc covers what to do beyond that.

---

## 3 · Target architecture

Two independent migrations, in order:

### 3.1 `metering_readings` → Hyperdrive + Postgres

- Provision a Cloudflare Hyperdrive binding + a managed Postgres (Neon or
  RDS). Hyperdrive gives us connection pooling and edge caching of hot queries
  from Workers.
- New table `metering_readings` in Postgres, partitioned by RANGE on
  `reading_date` (monthly partitions).
- Write path: the HTTPS push endpoint in `src/routes/settlement-automation.ts`
  (`POST /api/settlement-auto/ingest/push`) writes to Postgres instead of D1.
  The raw payload buffer (`meter_ingest_raw`) stays in D1 — small and
  append-only.
- Read path: callers continue to hit the same routes
  (`GET /metering/readings`); the route code switches the underlying binding
  from `env.DB` to `env.HYPERDRIVE_DB`. Daily rollups in
  `metering_readings_daily` stay in D1 (only 40k rows/day nationally).
- Dashboards don't change — they already read rollups.

### 3.2 `audit_logs` → R2 + CloudWatch/Logpush, D1 keeps 90-day hot window

- Move anything older than 90 days to R2 via the existing
  `POST /api/data-tier/audit/archive-day` endpoint + cron.
- Add a Logpush destination for auditable writes (security-relevant actions)
  so they're retained for 7 years in R2 + shipped to an external SIEM in
  real time.
- `GET /api/admin/audit-logs` keeps D1 for the 90-day window; adds an
  `archive=true` query param that resolves the manifest in
  `audit_log_archives`, streams the correct R2 object, and returns the
  filtered rows. Caller pays the latency penalty for historical queries.

### 3.3 `ona_forecasts` — KV + D1 summary only

ONA forecasts are write-dominant and read mainly for the current day.
Approach:

- Keep raw forecasts in **KV** (30-day TTL) keyed by
  `ona:forecast:<site>:<forecast_type>:<YYYYMMDD>`.
- Keep the daily summary (`ona_forecast_summary`) in D1 — already implemented.
- Drop the raw `ona_forecasts` D1 table after back-fill from KV.

---

## 4 · Migration sequence

A safe cut, never more than one table in-flight at a time:

1. **Prereqs (week 0):**
   - Raise a Cloudflare support ticket to provision Hyperdrive + Postgres.
   - Add `HYPERDRIVE_DB` binding to `wrangler.toml` (placeholder,
     production-only).
   - Stand up a read-only Grafana view against D1 for baseline metrics
     (rows/day, bytes, P99 latency).
2. **metering_readings (weeks 1-4):**
   - Week 1: land Postgres schema, dual-write from the ingest endpoint
     (writes go to both D1 and Postgres). Verify row counts match for 7 days.
   - Week 2: switch read path route-by-route to Postgres, keep dual-write on.
     Monitor error rate + latency.
   - Week 3: disable D1 writes. Keep D1 rows for 30 days as a rollback.
   - Week 4: drop old D1 `metering_readings` rows. R2 archive covers history.
3. **audit_logs (week 5):**
   - Daily archive cron already running. After 90 days of retention, enable
     automatic delete of rows past the window.
   - Add Logpush destination.
4. **ona_forecasts (week 6):**
   - Shim the forecast write API to write to KV. Cron already maintains the
     summary.
   - After 30 days, drop the raw table.

Each phase has a stop-the-world rollback (flip the write path back to D1;
bringing back historical rows is fine because dual-write was the whole point
of the overlap window).

---

## 5 · Failure modes + watches

| Risk | Mitigation | Alarm |
|---|---|---|
| D1 writes fall behind Postgres during dual-write | Queue via Cloudflare Queues; ingest endpoint always returns 202 | ingest_dual_write_lag > 60s |
| Archive cron fails silently | `settlement_runs` / `data_tier_snapshots` track last success | no new row > 36h |
| Hyperdrive connection pool exhausted | Pre-warm + max 5 queries per request | pool_exhaustion_errors > 0 |
| Postgres partition-pruning misconfigured | Manual check on week-1 partition | P99 > 500 ms |
| R2 archive key collision (two archives for same month) | `UNIQUE (connection_id, month_bucket)` already on the pointer table | 409 responses to archive endpoint |

---

## 6 · What does NOT need to move

These stay on D1 — fine for national scale:

- `participants`, `tenants`, `tenant_subscriptions`, `tenant_plans`, SSO configs
- `contract_documents`, `document_signatories`, `loi_documents`
- `trade_orders`, `trade_matches`, `trade_fills` — volume is O(thousands/day)
  even at national scale; OrderBook Durable Object handles concurrency.
- `ipp_projects`, `epc_contracts`, `insurance_policies`, etc. — low-cardinality
  operational metadata.
- `regulator_*`, `lender_*`, `offtaker_*`, `carbon_*` — low-cardinality.
- All POPIA tables.

---

## 7 · Open questions

- **Postgres vendor:** Neon is serverless and bills per active time, which
  matches Workers' usage patterns; RDS is cheaper at steady-state. Default
  recommendation: **Neon** — switch to RDS once active-hours > 18/day for a
  month.
- **Geographic residency:** South African tenants may require ZA data
  residency under POPIA s.72. Neither Hyperdrive nor RDS currently offer ZA
  regions → interim: host in Frankfurt (closest, adequate for Section 72
  where data is pseudonymised at rest, encrypted in transit, and covered by
  a POPIA s.72 derogation letter from the Information Regulator).
- **Time-series DB (InfluxDB, TimescaleDB):** deferred until we have a use
  case requiring second-granular queries over years of meter data.
  Rollups cover the reporting needs; raw half-hourly data is the
  once-in-a-year audit artefact, served from R2.

---

## 7.5 · What's in-code today (PR-National-6)

Shipped in advance of the cut-over:

- **Postgres schema** — [migrations/postgres/001_metering_schema.sql](../../open-energy-platform/migrations/postgres/001_metering_schema.sql) declares the RANGE-partitioned `metering_readings` parent + monthly child partitions (−12 months through +3 months) plus the daily rollup mirror.
- **Hyperdrive binding** — the `HYPERDRIVE_DB` binding is declared in [src/utils/types.ts](../../open-energy-platform/src/utils/types.ts) (`HonoEnv`) and reserved in [wrangler.toml](../../open-energy-platform/wrangler.toml) with a commented-out `[[hyperdrive]]` block ready to uncomment once the operator runs `wrangler hyperdrive create`.
- **Dual-write façade** — [src/utils/hyperdrive.ts](../../open-energy-platform/src/utils/hyperdrive.ts) exports `insertMeteringReading()`. When the binding is present, it writes to Postgres (authoritative) and dual-writes to D1 for the overlap window. When absent it falls through to D1 transparently. Already wired into the HMAC-authenticated meter ingest endpoint (`POST /api/settlement-auto/ingest/push`).
- **Read path switch** — `readFromHyperdrive(env)` reads the `METERING_READ_SOURCE` env var; operator flips it from unset → `hyperdrive` once satisfied with the dual-write window.
- **Tests** — [tests/hyperdrive.test.ts](../../open-energy-platform/tests/hyperdrive.test.ts) exercises all four branches of the façade (D1-only, primary+dual, primary-only, Postgres-fail-fallback).

Switch-over checklist once Hyperdrive is provisioned:

1. `wrangler hyperdrive create open-energy-metering --connection-string "postgres://..."`
2. Uncomment the `[[hyperdrive]]` block in wrangler.toml with the returned ID.
3. `psql "$HYPERDRIVE_PG_URL" -f migrations/postgres/001_metering_schema.sql`.
4. `wrangler deploy` — worker comes up with dual-write enabled.
5. Verify: `SELECT COUNT(*) FROM metering_readings` in Postgres matches the D1 count + any new rows from the last 5 minutes.
6. After 2 weeks of parity: `wrangler secret put METERING_READ_SOURCE` → `hyperdrive`. Dashboards now read from Postgres.
7. After another 2 weeks: set `dualWrite: false` call-site in ingest, drop the D1 `metering_readings` rows, rely on Postgres + R2 archives.

## 8 · Exit criteria

When the migration is done, the following are true:

- `metering_readings` is in Postgres, D1 copy dropped, monthly archives in R2.
- `audit_logs` in D1 covers last 90 days only; older days are in R2 +
  Logpush'd to SIEM.
- Raw `ona_forecasts` removed from D1.
- D1 `total_db_bytes` (tracked in `data_tier_snapshots`) fits comfortably
  under 5 GB.
- All existing API responses unchanged; dashboards unchanged; tests green.
