// ═══════════════════════════════════════════════════════════════════════════
// Hyperdrive+Postgres facade for high-volume tables.
//
// The Worker binds Hyperdrive as HYPERDRIVE_DB. When the binding is absent
// (local dev, test env, preview deploys without the secret) we fall back to
// the D1 path so nothing in the caller cares about which side is live.
//
// At time of writing only metering_readings is migrated. Call sites should
// prefer this façade so the cut-over happens in one place.
// ═══════════════════════════════════════════════════════════════════════════

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
  tenant_id?: string | null;
}

/**
 * The Hyperdrive binding surface we depend on. Real Hyperdrive in Workers
 * gives us a node-postgres-compatible pool via its `connect()` method. We
 * only need `query(text, params)` for the ingest write path.
 */
export interface HyperdriveLike {
  connect: () => Promise<{
    query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    release?: () => void;
  }>;
}

export interface MeteringWriteEnv {
  DB: { prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } } };
  HYPERDRIVE_DB?: HyperdriveLike;
}

/**
 * Insert a metering reading. If Hyperdrive is configured, the row goes to
 * Postgres (authoritative). Until the cut-over is final we also dual-write
 * to D1 so any read path not yet migrated stays functional. Callers set
 * `dualWrite: false` once the D1 mirror is no longer needed.
 */
export async function insertMeteringReading(
  env: MeteringWriteEnv,
  row: MeteringReadingInsert,
  opts: { dualWrite?: boolean } = { dualWrite: true },
): Promise<{ target: 'hyperdrive' | 'd1'; dualWrote: boolean }> {
  const hasHyperdrive = !!env.HYPERDRIVE_DB;
  let target: 'hyperdrive' | 'd1' = 'd1';
  let dualWrote = false;

  if (hasHyperdrive) {
    try {
      const client = await env.HYPERDRIVE_DB!.connect();
      try {
        await client.query(
          `INSERT INTO metering_readings
             (id, connection_id, reading_date, export_kwh, import_kwh,
              peak_demand_kw, power_factor, reading_type, source, tenant_id)
           VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            row.id, row.connection_id, row.reading_date,
            row.export_kwh, row.import_kwh,
            row.peak_demand_kw ?? null, row.power_factor ?? null,
            row.reading_type || 'actual',
            row.source ?? null, row.tenant_id ?? null,
          ],
        );
        target = 'hyperdrive';
      } finally {
        client.release?.();
      }
    } catch (err) {
      // Hyperdrive unavailable — degrade to D1 so ingest never fails.
      // Surface the error to the logger but don't throw.
      console.warn('hyperdrive_insert_failed', (err as Error).message);
    }
  }

  // Dual-write / D1-only path.
  if (!hasHyperdrive || opts.dualWrite) {
    try {
      await env.DB.prepare(
        `INSERT INTO metering_readings
           (id, connection_id, reading_date, export_kwh, import_kwh,
            peak_demand_kw, power_factor, reading_type, validated, ona_ingested)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'actual'), 0, 0)`,
      ).bind(
        row.id, row.connection_id, row.reading_date,
        row.export_kwh, row.import_kwh,
        row.peak_demand_kw ?? null, row.power_factor ?? null,
        row.reading_type || null,
      ).run();
      if (hasHyperdrive) dualWrote = true;
    } catch (err) {
      // If the Postgres write succeeded, the D1 miss is acceptable — the
      // Postgres row is authoritative. If the Hyperdrive write also failed
      // we have a lost row and must surface it.
      if (target !== 'hyperdrive') throw err;
      console.warn('d1_dual_write_failed', (err as Error).message);
    }
  }

  return { target, dualWrote };
}

/**
 * True iff the caller should read from Hyperdrive instead of D1. The
 * cut-over flag is set via an env var so we can A/B the migration.
 */
export function readFromHyperdrive(env: { HYPERDRIVE_DB?: HyperdriveLike; METERING_READ_SOURCE?: string }): boolean {
  return !!env.HYPERDRIVE_DB && env.METERING_READ_SOURCE === 'hyperdrive';
}
