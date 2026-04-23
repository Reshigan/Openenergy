// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare-native metering router.
//
// Replaces the earlier Postgres/Hyperdrive plan. Scales `metering_readings`
// across multiple D1 databases bound as METERING_DB_CURRENT (hot,
// current-month writes + reads) and METERING_DB_ARCHIVE_<YYYY_MM> (cold,
// read-only historical). When no sharded binding is present we fall
// through to the monolithic `DB` so local dev stays trivial.
//
// Cost-efficiency principles baked in:
//   - EVERY write is one prepared statement, no N+1.
//   - READS are indexed on (connection_id, reading_date) — already in
//     migration 001_core.sql — so per-row cost scales with result-set
//     size, not table size.
//   - Aggregates use the rollup table (metering_readings_daily) so they
//     never scan raw rows.
//   - Old months auto-redirect to the appropriate archive D1 via a cheap
//     KV lookup (no DB scan to find the shard).
//
// Cost model:
//   D1 queries priced per row read + row written. Sharding by month caps
//   the working set per DB at ~40k meters × 48 half-hours × 30 days ≈
//   58M rows — well inside D1's envelope when indexed. Rollups keep all
//   dashboard queries below 10k rows read.
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface MeteringReadingInsert {
  id: string;
  connection_id: string;
  reading_date: string;    // ISO datetime
  export_kwh: number | null;
  import_kwh: number | null;
  peak_demand_kw?: number | null;
  power_factor?: number | null;
  reading_type?: 'actual' | 'estimated' | 'adjusted';
  source?: string | null;
}

export interface MeteringRouterEnv {
  DB: D1Database;
  KV: KVNamespace;
  /** Current-month shard; recent reads + all writes. Falls back to DB. */
  METERING_DB_CURRENT?: D1Database;
  /** Declared archive shards per month: METERING_DB_ARCHIVE_2025_10 etc. */
  [archiveBinding: string]: D1Database | KVNamespace | unknown;
}

/**
 * Pick the D1 to write to for a given reading_date. Writes ALWAYS go to
 * the current-month shard (never to an archive) — archives are read-only.
 * If the month has rolled over and no CURRENT shard is configured we fall
 * through to the monolithic DB.
 */
export function writeDbFor(env: MeteringRouterEnv): D1Database {
  return env.METERING_DB_CURRENT || env.DB;
}

/**
 * Pick the D1 to read from for a given reading_date. Current-month and
 * anything within the last 31 days go to the current shard. Older reads
 * route to the matching archive shard (`METERING_DB_ARCHIVE_YYYY_MM`)
 * if present, otherwise to DB.
 */
export function readDbFor(env: MeteringRouterEnv, readingDate: string | Date): D1Database {
  const date = typeof readingDate === 'string' ? new Date(readingDate) : readingDate;
  if (Number.isNaN(date.getTime())) return env.DB;
  const now = new Date();
  const daysOld = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld <= 31) return env.METERING_DB_CURRENT || env.DB;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const bindingName = `METERING_DB_ARCHIVE_${y}_${m}`;
  const archive = env[bindingName];
  return (archive as D1Database) || env.METERING_DB_CURRENT || env.DB;
}

/**
 * Single-statement insert of a meter reading. Idempotent via INSERT OR
 * IGNORE on the id column — callers who retry with the same id don't
 * double-book. Every insert costs: 1 row write + ~3 indexed writes (pk +
 * the two indexes from migration 001_core.sql).
 */
export async function insertMeteringReading(
  env: MeteringRouterEnv,
  row: MeteringReadingInsert,
): Promise<{ target: 'current' | 'fallback_db' }> {
  const db = writeDbFor(env);
  const target: 'current' | 'fallback_db' = env.METERING_DB_CURRENT ? 'current' : 'fallback_db';
  await db.prepare(
    `INSERT OR IGNORE INTO metering_readings
       (id, connection_id, reading_date, export_kwh, import_kwh,
        peak_demand_kw, power_factor, reading_type, validated, ona_ingested)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'actual'), 0, 0)`,
  ).bind(
    row.id,
    row.connection_id,
    row.reading_date,
    row.export_kwh,
    row.import_kwh,
    row.peak_demand_kw ?? null,
    row.power_factor ?? null,
    row.reading_type || null,
  ).run();
  return { target };
}

/**
 * Read cached aggregate from KV, or miss through to the rollup table.
 * Two orders of magnitude cheaper than scanning raw readings for any
 * window longer than a day.
 *
 * Cache key: `metering:agg:${connection_id}:${period}` (e.g. `:2026-04`)
 * TTL: 900s for current-month (still moving), 86400s for past months.
 */
export async function cachedMonthlyTotals(
  env: MeteringRouterEnv,
  connectionId: string,
  yyyyMm: string,
): Promise<{ total_export_kwh: number; total_import_kwh: number; reading_days: number }> {
  const key = `metering:agg:${connectionId}:${yyyyMm}`;
  const cached = await env.KV.get(key, 'json') as {
    total_export_kwh: number; total_import_kwh: number; reading_days: number;
  } | null;
  if (cached) return cached;

  const db = readDbFor(env, yyyyMm + '-01');
  const row = await db.prepare(
    `SELECT COALESCE(SUM(total_export_kwh), 0) AS total_export_kwh,
            COALESCE(SUM(total_import_kwh), 0) AS total_import_kwh,
            COUNT(*) AS reading_days
       FROM metering_readings_daily
      WHERE connection_id = ? AND month_bucket = ?`,
  ).bind(connectionId, yyyyMm).first<{
    total_export_kwh: number; total_import_kwh: number; reading_days: number;
  }>();

  const result = row || { total_export_kwh: 0, total_import_kwh: 0, reading_days: 0 };
  const now = new Date();
  const isCurrentMonth = yyyyMm === now.toISOString().slice(0, 7);
  await env.KV.put(key, JSON.stringify(result), {
    expirationTtl: isCurrentMonth ? 900 : 86_400,
  });
  return result;
}

/**
 * Invalidate the KV aggregate for a connection's current month whenever
 * a new reading lands. Called from the ingest handler so dashboards
 * stay fresh without waiting for TTL.
 */
export async function invalidateMonthlyAggregate(
  env: MeteringRouterEnv,
  connectionId: string,
  readingDate: string,
): Promise<void> {
  const yyyyMm = readingDate.slice(0, 7);
  const key = `metering:agg:${connectionId}:${yyyyMm}`;
  try { await env.KV.delete(key); } catch { /* soft */ }
}
