// Smoke test for the deterministic fault engine. Inserts a site + device +
// crafted telemetry that should trip individual detectors, then asserts the
// engine opens (and only opens once) the expected om_faults row.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { runFaultEngine } from '../src/utils/esums-fault-engine';

type DB = ReturnType<typeof createTestDb>;
let db: DB;
let env: ReturnType<typeof envFor>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => db.close());

async function seedSiteAndDevice(opts: {
  technology?: string; ratedKw?: number; lastSeen?: string; tariff?: number;
} = {}) {
  await env.DB.prepare(`
    INSERT INTO om_sites (id, name, technology, capacity_mw, ppa_tariff_zar_mwh, status)
    VALUES ('s1','Site 1',?,?,?,'operational')
  `).bind(opts.technology || 'solar', 1.0, opts.tariff || 1500).run();
  await env.DB.prepare(`
    INSERT INTO om_devices (id, site_id, device_type, manufacturer, model, rated_kw, status, last_seen_at)
    VALUES ('d1','s1','inverter','TestCo','M1',?,'online',?)
  `).bind(opts.ratedKw || 50, opts.lastSeen || new Date().toISOString()).run();
}

async function pushTelemetry(rows: Array<Record<string, unknown>>) {
  for (const r of rows) {
    const cols = ['id','device_id','site_id','ts','ac_kw','dc_kw','interval_kwh',
                  'voltage_v','current_a','frequency_hz','temperature_c','irradiance_w_m2',
                  'flow_lps','pressure_bar','level_m','treated_kl','raw_kl','pump_kw',
                  'status_code','quality'];
    const vals = cols.map((c) => r[c] ?? null);
    await env.DB.prepare(
      `INSERT INTO om_telemetry (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
    ).bind(...vals).run();
  }
}

describe('esums fault engine', () => {
  it('opens communication_loss when device last_seen > 60 min ago', async () => {
    await seedSiteAndDevice({ lastSeen: new Date(Date.now() - 120 * 60_000).toISOString() });
    const res = await runFaultEngine(env as any, { sites: ['s1'] });
    expect(res.detected).toBe(1);
    expect(res.by_detector['detector_communication_loss']).toBe(1);
  });

  it('is idempotent — second scan does not re-raise the same fault', async () => {
    await seedSiteAndDevice({ lastSeen: new Date(Date.now() - 120 * 60_000).toISOString() });
    await runFaultEngine(env as any, { sites: ['s1'] });
    const res2 = await runFaultEngine(env as any, { sites: ['s1'] });
    expect(res2.detected).toBe(0);
    expect(res2.skipped_existing).toBeGreaterThan(0);
  });

  it('opens inverter_overtemp after 3 consecutive high-temperature readings', async () => {
    await seedSiteAndDevice();
    const base = Date.now();
    await pushTelemetry([
      { id: 't1', device_id: 'd1', site_id: 's1', ts: new Date(base - 45*60_000).toISOString(), temperature_c: 78 },
      { id: 't2', device_id: 'd1', site_id: 's1', ts: new Date(base - 30*60_000).toISOString(), temperature_c: 80 },
      { id: 't3', device_id: 'd1', site_id: 's1', ts: new Date(base - 15*60_000).toISOString(), temperature_c: 82 },
    ]);
    const res = await runFaultEngine(env as any, { sites: ['s1'] });
    expect(res.by_detector['detector_inverter_overtemp']).toBe(1);
  });

  it('opens frequency_deviation after 2 consecutive out-of-band readings', async () => {
    await seedSiteAndDevice();
    const base = Date.now();
    await pushTelemetry([
      { id: 'f1', device_id: 'd1', site_id: 's1', ts: new Date(base - 30*60_000).toISOString(), frequency_hz: 51.2 },
      { id: 'f2', device_id: 'd1', site_id: 's1', ts: new Date(base - 15*60_000).toISOString(), frequency_hz: 51.3 },
    ]);
    const res = await runFaultEngine(env as any, { sites: ['s1'] });
    expect(res.by_detector['detector_frequency_deviation']).toBe(1);
  });
});
