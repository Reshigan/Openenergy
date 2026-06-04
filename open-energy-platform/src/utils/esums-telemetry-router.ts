// ═══════════════════════════════════════════════════════════════════════════
// Esums Telemetry Router
//
// Mirrors the metering-router.ts sharding model for Esums sensor data.
//
// Storage tiers (each optional, progressively activated):
//
//   Tier 1 — Main D1 (always available, fallback)
//     Table: om_telemetry in env.DB
//     Limit: ~10 GB shared with all other platform tables
//     Best for: <10 sites, dev, small deployments
//
//   Tier 2 — Dedicated telemetry D1 (env.ESUMS_TELEMETRY_DB)
//     Table: esums_telemetry in its own D1 database
//     Limit: 10 GB telemetry-only (~800M rows @ 12 bytes avg + indexes)
//     Best for: 10–200 sites, medium deployments
//     Provision: wrangler d1 create esums-telemetry
//
//   Tier 3 — Per-project D1 shard (env.ESUMS_DB_<shard_key>)
//     Table: esums_telemetry in a project-scoped D1
//     Limit: 10 GB per project
//     Best for: large projects (>50 sites) needing full isolation
//     Provision: wrangler d1 create esums-<project-key>
//     Then set shard_key on the esums_projects row and bind in wrangler.toml
//
//   Tier 4 — Analytics Engine (env.TELEMETRY, side-write)
//     Non-blocking fire-and-forget alongside any D1 tier
//     Writes to Cloudflare Analytics Engine — unlimited scale, query via
//     CF Analytics Engine SQL API (no reads from Workers).
//     Best for: dashboards, long-term trend analysis, billing reports
//
//   Tier 5 — Hyperdrive → Postgres (env.HYPERDRIVE, future)
//     Activate via db-adapter.ts once HYPERDRIVE binding is provisioned.
//     Best for: >500 sites or strict ACID requirements.
//
// The router is transparent: callers use the same insert/query helpers
// regardless of which tier is active. Upgrade by adding the binding.
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database } from '@cloudflare/workers-types';

export interface TelemetryReading {
  id: string;
  device_id: string;
  site_id: string;
  project_id?: string | null;
  ts: string;
  ac_kw?: number | null;
  dc_kw?: number | null;
  yield_kwh?: number | null;
  interval_kwh?: number | null;
  voltage_v?: number | null;
  current_a?: number | null;
  frequency_hz?: number | null;
  temperature_c?: number | null;
  irradiance_w_m2?: number | null;
  status_code?: string | null;
  quality?: string;
}

export interface TelemetryRouterEnv {
  DB: D1Database;
  /** Dedicated telemetry D1 — Tier 2. Isolates hot writes from main DB. */
  ESUMS_TELEMETRY_DB?: D1Database;
  /** Analytics Engine — Tier 4 side-write. Never used for reads. */
  TELEMETRY?: AnalyticsEngineDataset;
  /** Per-project shards: ESUMS_DB_<shard_key> — Tier 3. */
  [binding: string]: unknown;
}

// Analytics Engine type (subset of @cloudflare/workers-types)
interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    blobs?: (string | null | undefined)[];
    doubles?: (number | null | undefined)[];
    indexes?: string[];
  }): void;
}

// ─── Shard resolution ────────────────────────────────────────────────────────

/**
 * Resolve the D1 that owns telemetry for a given project.
 * Priority: project shard > dedicated telemetry DB > main DB.
 */
export function telemetryDbFor(
  env: TelemetryRouterEnv,
  projectShardKey?: string | null,
): D1Database {
  if (projectShardKey) {
    const key = `ESUMS_DB_${projectShardKey.toUpperCase()}`;
    const shard = env[key];
    if (shard && typeof shard === 'object' && 'prepare' in (shard as object)) {
      return shard as D1Database;
    }
  }
  return env.ESUMS_TELEMETRY_DB ?? env.DB;
}

/** Table name differs between the dedicated shard and the main DB. */
export function telemetryTable(env: TelemetryRouterEnv, projectShardKey?: string | null): string {
  // Dedicated ESUMS_TELEMETRY_DB and per-project shards use the richer
  // esums_telemetry schema (includes project_id column).
  if (projectShardKey || env.ESUMS_TELEMETRY_DB) return 'esums_telemetry';
  // Fallback to the original table in the main DB.
  return 'om_telemetry';
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function writeTelemetry(
  env: TelemetryRouterEnv,
  readings: TelemetryReading[],
  projectShardKey?: string | null,
): Promise<number> {
  if (readings.length === 0) return 0;

  const db = telemetryDbFor(env, projectShardKey);
  const table = telemetryTable(env, projectShardKey);
  const usingEnrichedSchema = table === 'esums_telemetry';

  // D1 write — batched for efficiency
  const stmts = readings.map((r) => {
    if (usingEnrichedSchema) {
      return db.prepare(`
        INSERT OR IGNORE INTO esums_telemetry
          (id, device_id, site_id, project_id, ts, ac_kw, dc_kw,
           yield_kwh, interval_kwh, voltage_v, current_a,
           frequency_hz, temperature_c, irradiance_w_m2, status_code, quality)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        r.id, r.device_id, r.site_id, r.project_id ?? null, r.ts,
        r.ac_kw ?? null, r.dc_kw ?? null,
        r.yield_kwh ?? null, r.interval_kwh ?? null,
        r.voltage_v ?? null, r.current_a ?? null,
        r.frequency_hz ?? null, r.temperature_c ?? null,
        r.irradiance_w_m2 ?? null,
        r.status_code ?? null, r.quality ?? 'valid',
      );
    }
    return db.prepare(`
      INSERT OR IGNORE INTO om_telemetry
        (id, device_id, site_id, ts, ac_kw, dc_kw,
         yield_kwh, interval_kwh, voltage_v, current_a,
         frequency_hz, temperature_c, irradiance_w_m2, status_code, quality)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.device_id, r.site_id, r.ts,
      r.ac_kw ?? null, r.dc_kw ?? null,
      r.yield_kwh ?? null, r.interval_kwh ?? null,
      r.voltage_v ?? null, r.current_a ?? null,
      r.frequency_hz ?? null, r.temperature_c ?? null,
      r.irradiance_w_m2 ?? null,
      r.status_code ?? null, r.quality ?? 'valid',
    );
  });

  // D1 batch — up to 100 statements per batch
  const CHUNK = 100;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await db.batch(stmts.slice(i, i + CHUNK));
  }

  // Analytics Engine side-write (fire-and-forget, Tier 4)
  if (env.TELEMETRY) {
    for (const r of readings) {
      try {
        env.TELEMETRY.writeDataPoint({
          // blobs[0..5]: dimensions for GROUP BY in Analytics Engine SQL
          blobs: [
            r.site_id,
            r.device_id,
            r.project_id ?? null,
            r.quality ?? 'valid',
            r.status_code ?? null,
          ],
          // doubles[0..7]: measured values
          doubles: [
            r.ac_kw ?? undefined,
            r.dc_kw ?? undefined,
            r.interval_kwh ?? undefined,
            r.yield_kwh ?? undefined,
            r.voltage_v ?? undefined,
            r.current_a ?? undefined,
            r.temperature_c ?? undefined,
            r.irradiance_w_m2 ?? undefined,
          ],
          // index1 partitions queries by site so cross-site scans never happen
          indexes: [`${r.site_id}`],
        });
      } catch {
        // Analytics Engine write failure is non-fatal — D1 is the source of truth
      }
    }
  }

  return readings.length;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function readTelemetry(
  env: TelemetryRouterEnv,
  deviceId: string,
  hours = 24,
  projectShardKey?: string | null,
): Promise<Record<string, unknown>[]> {
  const db = telemetryDbFor(env, projectShardKey);
  const table = telemetryTable(env, projectShardKey);
  const limit = Math.min(10_000, hours * 240); // max 4/min × hours

  const rows = await db.prepare(`
    SELECT ts, ac_kw, dc_kw, interval_kwh, yield_kwh,
           voltage_v, current_a, frequency_hz,
           temperature_c, irradiance_w_m2, status_code, quality
    FROM ${table}
    WHERE device_id = ?
      AND ts >= datetime('now', ? || ' hours')
    ORDER BY ts ASC
    LIMIT ?
  `).bind(deviceId, `-${hours}`, limit).all();

  return (rows.results ?? []) as Record<string, unknown>[];
}

export async function readSiteTelemetry(
  env: TelemetryRouterEnv,
  siteId: string,
  hours = 24,
  projectShardKey?: string | null,
): Promise<Record<string, unknown>[]> {
  const db = telemetryDbFor(env, projectShardKey);
  const table = telemetryTable(env, projectShardKey);

  const rows = await db.prepare(`
    SELECT ts, device_id, ac_kw, dc_kw, interval_kwh, temperature_c, quality
    FROM ${table}
    WHERE site_id = ?
      AND ts >= datetime('now', ? || ' hours')
    ORDER BY ts ASC
    LIMIT 20000
  `).bind(siteId, `-${hours}`).all();

  return (rows.results ?? []) as Record<string, unknown>[];
}

// ─── Aggregate (for dashboards) ───────────────────────────────────────────────

export async function aggregateSitePower(
  env: TelemetryRouterEnv,
  siteId: string,
  intervalHours = 1,
  projectShardKey?: string | null,
): Promise<{ bucket: string; ac_kw_avg: number; interval_kwh_sum: number }[]> {
  const db = telemetryDbFor(env, projectShardKey);
  const table = telemetryTable(env, projectShardKey);
  const lookbackHours = Math.min(168, intervalHours * 24);

  const rows = await db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00Z',
        datetime(ts, ? || ' minutes', 'start of hour')) AS bucket,
      AVG(ac_kw) AS ac_kw_avg,
      SUM(interval_kwh) AS interval_kwh_sum
    FROM ${table}
    WHERE site_id = ?
      AND ts >= datetime('now', ? || ' hours')
    GROUP BY bucket
    ORDER BY bucket ASC
  `).bind(
    String(intervalHours * 60 / 2),  // offset to middle of interval
    siteId,
    `-${lookbackHours}`,
  ).all();

  return (rows.results ?? []) as { bucket: string; ac_kw_avg: number; interval_kwh_sum: number }[];
}
