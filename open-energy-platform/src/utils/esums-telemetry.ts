// Native esums telemetry helpers — site-level aggregation primitives.
//
// Per-timestamp summation of inverter / device power across a site, used
// by the site-level Live tab and the `aggregate=1` mode of the telemetry
// endpoint. HTTP polling is owned by oem-adapters.ts and fault detection
// by the deterministic fault engine.

export interface EsumsTelemetryRow {
  ts: string;
  device_id?: string | null;
  power_kw?: number | null;
  energy_kwh?: number | null;
  [key: string]: unknown;
}

/**
 * Aggregate site telemetry into a single timeseries (sum of per-device power
 * per timestamp). Used by the site-level Live tab and the `aggregate=1` mode
 * of GET /sites/:siteId/telemetry.
 */
export function aggregateSitePower(
  rows: EsumsTelemetryRow[],
): Array<{ ts: string; power_kw: number; energy_kwh: number; devices: number }> {
  const buckets = new Map<string, { power_kw: number; energy_kwh: number; devices: number }>();
  for (const r of rows) {
    const ts = r.ts;
    if (!ts) continue;
    const cur = buckets.get(ts) || { power_kw: 0, energy_kwh: 0, devices: 0 };
    cur.power_kw += Number(r.power_kw || 0);
    cur.energy_kwh += Number(r.energy_kwh || 0);
    cur.devices += 1;
    buckets.set(ts, cur);
  }
  return Array.from(buckets.entries())
    .map(([ts, v]) => ({ ts, ...v }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
}
