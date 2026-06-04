// ═══════════════════════════════════════════════════════════════════════════
// DB Adapter — multi-tier database routing for the Open Energy Platform.
//
// Current tiers (in activation order):
//
//   D1 (SQLite) — default, always available
//     All existing tables (379 migrations).
//     Best for: < 200 req/s writes, < 5 GB per logical dataset.
//
//   D1 shards — same SQLite engine, multiple databases
//     METERING_DB_CURRENT    → metering_readings (current month)
//     ESUMS_TELEMETRY_DB     → esums_telemetry (all sites)
//     ESUMS_DB_<SHARD_KEY>   → esums_telemetry for one large project
//     Pattern: metering-router.ts and esums-telemetry-router.ts
//
//   Hyperdrive → Postgres — activate when D1 reaches its limits
//     True MVCC, window functions, TimescaleDB for time-series.
//     Recommended target: Neon (serverless Postgres, free tier covers dev).
//     Activate:
//       1. wrangler hyperdrive create open-energy-pg \
//            --connection-string "postgres://user:pass@neon-host/db"
//       2. Uncomment [[hyperdrive]] block in wrangler.toml
//       3. Install a Postgres driver: npm i postgres
//          (or @neondatabase/serverless for Neon's HTTP driver — no TCP)
//       4. Call getPgPool(env) in handlers for tables you've migrated.
//
// Tables recommended for early Postgres migration (highest write contention):
//   • order_trades / order_book_snapshots   (matching engine hot path)
//   • settlement_invoices                   (needs strict ACID)
//   • om_telemetry / esums_telemetry        (high ingest volume)
//   • metering_readings                     (when METERING shards fill)
//
// Tables that are fine in D1 long-term:
//   • participants, sessions, kyc_*         (low write rate)
//   • contracts, covenants, ppa_*           (moderate, advisory-locked)
//   • audit_log, cascade_events             (append-only, good in D1)
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database } from '@cloudflare/workers-types';
import type { HonoBindings, HyperdriveBinding } from './types';

// ─── D1 shard helpers ────────────────────────────────────────────────────────

/**
 * Return the right D1 for a per-project Esums shard.
 * Falls back through: project shard → dedicated telemetry DB → main DB.
 */
export function getEsumsDb(env: HonoBindings, projectShardKey?: string | null): D1Database {
  if (projectShardKey) {
    const key = `ESUMS_DB_${projectShardKey.toUpperCase()}`;
    const shard = (env as unknown as Record<string, unknown>)[key];
    if (shard && typeof shard === 'object' && 'prepare' in (shard as object)) {
      return shard as D1Database;
    }
  }
  return env.ESUMS_TELEMETRY_DB ?? env.DB;
}

/**
 * Resolve the telemetry table name for the active shard.
 * Dedicated and per-project shards use esums_telemetry;
 * main-DB fallback uses om_telemetry (original schema).
 */
export function esumsTableFor(env: HonoBindings, projectShardKey?: string | null): string {
  if (projectShardKey || env.ESUMS_TELEMETRY_DB) return 'esums_telemetry';
  return 'om_telemetry';
}

// ─── Hyperdrive / Postgres ────────────────────────────────────────────────────

/**
 * Check whether a Hyperdrive Postgres connection is available.
 */
export function hasHyperdrive(env: HonoBindings): boolean {
  return typeof env.HYPERDRIVE?.connectionString === 'string';
}

/**
 * Return the Hyperdrive binding when available.
 * Callers must check hasHyperdrive(env) or handle null.
 *
 * Usage with the `postgres` npm package:
 *
 *   import postgres from 'postgres';
 *   const pg = getHyperdrive(env);
 *   if (pg) {
 *     const sql = postgres(pg.connectionString, { max: 5 });
 *     const rows = await sql`SELECT * FROM order_trades WHERE ...`;
 *     await sql.end();
 *   }
 *
 * Usage with @neondatabase/serverless (HTTP driver — no TCP, works in Workers):
 *
 *   import { neon } from '@neondatabase/serverless';
 *   const pg = getHyperdrive(env);
 *   if (pg) {
 *     const sql = neon(pg.connectionString);
 *     const rows = await sql`SELECT * FROM order_trades WHERE ...`;
 *   }
 */
export function getHyperdrive(env: HonoBindings): HyperdriveBinding | null {
  return env.HYPERDRIVE ?? null;
}

// ─── Capacity planning helpers ────────────────────────────────────────────────

export interface DbCapacityHint {
  /** Which D1 to watch for this dataset. */
  binding: string;
  /** Estimated rows/day based on current fleet size. */
  estimatedRowsPerDay: number;
  /** Days until the 10 GB D1 limit is reached at current rate. */
  daysToLimit: number;
  recommendation: string;
}

/**
 * Rough capacity estimates. Call from an admin endpoint to guide ops decisions
 * on when to activate the next storage tier.
 *
 * Assumptions:
 *   • avg row size: om_telemetry ~100 bytes, esums_telemetry ~120 bytes
 *   • D1 limit: 10 GB = 10_000_000_000 bytes
 */
export function estimateCapacity(
  siteCount: number,
  devicesPerSite: number,
  readingsPerDevicePerDay: number,
): DbCapacityHint {
  const rowsPerDay = siteCount * devicesPerSite * readingsPerDevicePerDay;
  const bytesPerRow = 120;
  const bytesPerDay = rowsPerDay * bytesPerRow;
  const d1Limit = 10_000_000_000;
  const daysToLimit = Math.floor(d1Limit / bytesPerDay);

  let recommendation: string;
  if (daysToLimit > 365) {
    recommendation = 'Main D1 is sufficient for this scale (>1 year runway).';
  } else if (daysToLimit > 90) {
    recommendation = 'Activate ESUMS_TELEMETRY_DB dedicated shard to extend runway.';
  } else if (daysToLimit > 30) {
    recommendation = 'Activate per-project shards (ESUMS_DB_*) for large projects.';
  } else {
    recommendation = 'Activate Hyperdrive → Postgres (Tier 5) — D1 limit is < 30 days away.';
  }

  return {
    binding: 'ESUMS_TELEMETRY_DB or main DB',
    estimatedRowsPerDay: rowsPerDay,
    daysToLimit,
    recommendation,
  };
}
