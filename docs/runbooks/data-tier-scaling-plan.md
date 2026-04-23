# Data tier scaling plan — Cloudflare-only

**Status:** active. Owner: platform team.
**Last updated:** 2026-04-23.
**Stack commitment:** 100% Cloudflare primitives. No external Postgres, no
external S3, no external message broker.

This document replaces an earlier draft that considered Hyperdrive +
managed Postgres. We've committed to a fully Cloudflare stack:
**D1 (sharded) · Durable Objects · R2 · KV · Queues · Workers AI**.

---

## 1 · Why sharding, not migration

Cloudflare D1 caps a single database at 10 GB (soft, will grow). At
national scale (40k meters × 48 half-hours × 365 days ≈ 700 M rows/yr for
`metering_readings` alone) one D1 will bottleneck. The answer is
**multiple D1 databases** bound to the same Worker, with routing logic
picking the right shard per request.

This is natively supported: `wrangler d1 create` any number of
databases, declare each in `wrangler.toml`, read them via the bindings
on `env`.

---

## 2 · Shard model

### Hot / cold split for `metering_readings`

| Binding | Contents | Writes | Reads |
|---|---|---|---|
| `DB` | Everything else (contracts, trades, participants, POPIA, audits, rollups…) | yes | yes |
| `METERING_DB_CURRENT` | Current-calendar-month raw metering_readings | yes | yes |
| `METERING_DB_ARCHIVE_YYYY_MM` | Prior months, read-only | no | yes, on demand |

Router: [src/utils/metering-router.ts](../../open-energy-platform/src/utils/metering-router.ts).

```ts
// writeDbFor(env)  → always returns CURRENT (or DB fallback).
// readDbFor(env, reading_date) → picks CURRENT for ≤ 31 days old,
//                                 ARCHIVE_YYYY_MM when older and bound,
//                                 DB fallback otherwise.
```

Monthly cron creates the next-month binding:

```bash
wrangler d1 create open-energy-metering-2026-05
# copy returned id into wrangler.toml [[d1_databases]] with binding
#   METERING_DB_ARCHIVE_2026_04
# rotate METERING_DB_CURRENT to 2026-05
```

On rotation the previous `CURRENT` becomes an `ARCHIVE_*` binding,
read-only. No data copy — just a rename of the binding.

### Other high-volume tables

| Table | Strategy |
|---|---|
| `audit_logs` | Kept in `DB` hot for 90 days. Daily cron archives older days to R2 via [/api/data-tier/audit/archive-day](../../open-energy-platform/src/routes/data-tier.ts). Pointer in `audit_log_archives`. Optional SIEM forward: [src/routes/siem.ts](../../open-energy-platform/src/routes/siem.ts). |
| `ona_forecasts` | Keep a 30-day window in `DB`. Older forecasts are summarised in `ona_forecast_summary` (in `DB`) and the raw rows are deleted. |
| `trade_orders / trade_fills` | Stay in `DB`. Volume at national scale (~10 orders/sec) well inside D1's envelope. Matching serialised via the `OrderBook` Durable Object, not the database. |
| Market prints (`market_prints`) | Pre-aggregated per minute by the DO, so scans are always over a small window. |

---

## 3 · Cost-efficiency playbook

Every national-scale query must satisfy at least one of these properties:

1. **Indexed predicate** — hits a column that has an index (migrations 001+).
2. **Bounded result set** — every SELECT has `LIMIT N` where N is ≤ 500.
3. **Aggregate from rollup** — reads from `*_daily` or `*_summary`, not
   the raw fact table.
4. **KV cache** — served from KV when the answer is valid for ≥ 30 s.

Hot-path audits done:

| Endpoint | Before | After |
|---|---|---|
| `GET /api/cockpit/stats` | 6 separate SELECT COUNTs | 1 compound SELECT + 30 s KV cache |
| `GET /api/trading/orders` | `SELECT *` (24 cols) | Explicit 15 cols + `LIMIT 50` |
| Meter ingest | Direct INSERT + `SELECT *` reads | Routed via sharded router + KV aggregate cache |
| Cockpit national KPIs (per role) | 6-8 separate COUNTs | 1 compound subquery SELECT |
| Monitoring cron-health | Per-table probes | 8 × `SELECT MAX()` (covered by existing indexes) |

Further optimisations available if needed later: row-level caching of
individual contract documents (rarely read twice in a row), stored
procedures for settlement runs (D1 doesn't support, so this is a
rewrite-as-SQL-function item).

---

## 4 · Operational cadence

| When | Job | Where |
|---|---|---|
| Every 15 min | Surveillance scan + SIEM dispatch + DO depth snapshots | Cron `*/15 * * * *` in [src/index.ts](../../open-energy-platform/src/index.ts) |
| Hourly | VWAP mark prices | Cron `0 * * * *` |
| Daily 00:05 | Metering + ONA daily rollup | Cron `5 0 * * *` |
| Daily 00:10 | Previous-day settlement run | Cron `10 0 * * *` |
| Daily 00:30 | Tenant usage snapshot + margin-call run | Cron `30 0 * * *` |
| Monthly day-1 02:00 | Platform invoice run | Cron `0 2 1 * *` |
| Monthly (manual) | Shard rotation — create next-month D1, rotate `METERING_DB_CURRENT`, archive audit_logs > 90d | Runbook |

---

## 5 · Failure modes + observability

Probes: `GET /api/health/deep` exercises D1 (main + current metering
shard), KV, R2, OrderBook DO, and Workers AI. Returns a per-subsystem
breakdown with latency.

Operator dashboards live under [/admin/admin-platform](../../open-energy-platform/pages/src/components/pages/AdminPlatformPage.tsx):

- **Cascade DLQ** — anything that failed the audit / notification /
  webhook / special-handler stage.
- **Settlement runs** — last 20, with 30-day status counts and open
  `settlement_dlq` count.
- **Cron-health** — last-side-effect timestamp per scheduled job.
- **PII access log** — POPIA s.19 evidence tail.
- **SIEM forwarders** — `/api/siem/forwarders` + per-forwarder
  delivery log, configurable from the admin workbench.

---

## 6 · What changed vs the earlier (archived) plan

- **Removed**: Postgres + Hyperdrive direction. `src/utils/hyperdrive.ts`
  and its tests deleted. `[[hyperdrive]]` removed from wrangler.toml.
  `HYPERDRIVE_DB` and `METERING_READ_SOURCE` removed from `HonoEnv`.
- **Added**: [src/utils/metering-router.ts](../../open-energy-platform/src/utils/metering-router.ts) routes between `DB`, `METERING_DB_CURRENT`, and monthly archive bindings. Backed by [20 metering-router unit tests](../../open-energy-platform/tests/metering-router.test.ts).

---

## 7 · Exit criteria

A Cloudflare-only national deployment is complete when:

- `METERING_DB_CURRENT` is bound in production, receiving all ingest
  writes; last month's data moved to `METERING_DB_ARCHIVE_2026_03`.
- `audit_logs` older than 90 days have been archived to R2 for the
  last 3 consecutive monthly windows.
- `GET /api/health/deep` returns `status: "healthy"` on every binding.
- Cockpit / dashboard P99 latency ≤ 300 ms measured via the
  request_stats telemetry table for 7 consecutive days.
- An external SIEM forwarder has delivered ≥ 1 week of audit events with
  0 failures.
