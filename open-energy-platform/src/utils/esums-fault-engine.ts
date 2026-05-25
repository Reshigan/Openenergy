// ════════════════════════════════════════════════════════════════════════
// Esums — Deterministic fault engine.
//
// Reads the last `windowMinutes` of om_telemetry, applies ten rule-based
// detectors per device, and INSERTs om_faults rows where a condition trips.
// Zero LLM inference; every fault is reproducible from SQL + arithmetic.
//
// Idempotency: a detector never opens a second fault on the same
// (device_id, fault_code) while the previous one is still open. Operators
// must resolve / close before the engine will re-raise.
//
// Hourly loss heuristic:
//   • Solar / wind: device rated_kw × site PPA tariff (R/MWh) / 1000.
//     Falls back to 1500 R/MWh when the site has no tariff on file.
//   • Water sites: 0 (operational issue, no direct revenue bleed). The
//     opportunity engine in routes/esums-om-analysis.ts handles the
//     commercial framing for water faults.
//
// Detectors implemented (10 of 11; see spec WP-C for the 11th — string-
// level mismatch needs string topology which is roadmap):
//   1. communication_loss        — device last_seen_at > 60 min ago
//   2. zero_output_daylight      — solar ac_kw == 0 for ≥3 daytime ticks
//   3. underperformance          — ac_kw / rated_kw < 0.4 for ≥4 daytime ticks
//   4. inverter_overtemp         — temperature_c > 75 for ≥3 ticks
//   5. voltage_high              — voltage_v > 440 for ≥3 ticks
//   6. voltage_low               — voltage_v < 360 for ≥3 ticks
//   7. frequency_deviation       — outside 49.5–50.5 Hz for ≥2 ticks
//   8. water_leak                — flow_lps > 1 for ≥4 ticks, level not rising
//   9. pump_inefficiency         — pump_kw high but flow_lps low (<0.5 ratio)
//  10. treatment_recovery_low    — treated/raw < 0.8 over last 24h
// ════════════════════════════════════════════════════════════════════════

import type { HonoEnv } from './types';

const TARIFF_FALLBACK = 1500; // R/MWh

interface DeviceMeta {
  id: string;
  site_id: string;
  device_type: string;
  rated_kw: number | null;
  last_seen_at: string | null;
  status: string;
}

interface SiteMeta {
  id: string;
  technology: string | null;
  ppa_tariff_zar_mwh: number | null;
  capacity_mw: number | null;
}

interface TelemetryRow {
  device_id: string;
  ts: string;
  ac_kw: number | null;
  dc_kw: number | null;
  interval_kwh: number | null;
  voltage_v: number | null;
  frequency_hz: number | null;
  temperature_c: number | null;
  flow_lps: number | null;
  pressure_bar: number | null;
  level_m: number | null;
  treated_kl: number | null;
  raw_kl: number | null;
  pump_kw: number | null;
}

interface PendingFault {
  device_id: string | null;
  site_id: string;
  category: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  fault_code: string;
  description: string;
  detected_at: string;
  hourly_loss_zar: number;
}

interface FaultEngineResult {
  scanned_devices: number;
  detected: number;
  skipped_existing: number;
  by_detector: Record<string, number>;
  ran_at: string;
}

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function hourlyLossForDevice(device: DeviceMeta, site: SiteMeta): number {
  if (site.technology === 'water') return 0;
  const tariff = site.ppa_tariff_zar_mwh || TARIFF_FALLBACK;
  const ratedKw = device.rated_kw || (site.capacity_mw ? site.capacity_mw * 1000 / 4 : 50);
  return Math.round((ratedKw / 1000) * tariff);
}

function isDaytime(ts: string): boolean {
  const h = new Date(ts).getUTCHours();
  return h >= 5 && h <= 15; // 07:00–17:00 SAST ≈ 05:00–15:00 UTC
}

export async function runFaultEngine(
  env: HonoEnv['Bindings'],
  opts: { sites?: string[]; windowMinutes?: number } = {},
): Promise<FaultEngineResult> {
  const windowMinutes = Math.max(15, Math.min(opts.windowMinutes || 60, 720));
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const ranAt = new Date().toISOString();

  // Load sites + devices in scope once.
  const sitesQ = opts.sites && opts.sites.length
    ? `SELECT id, technology, ppa_tariff_zar_mwh, capacity_mw FROM om_sites WHERE id IN (${opts.sites.map(() => '?').join(',')})`
    : `SELECT id, technology, ppa_tariff_zar_mwh, capacity_mw FROM om_sites`;
  const sitesBinds = opts.sites && opts.sites.length ? opts.sites : [];
  const sitesRows = await env.DB.prepare(sitesQ).bind(...sitesBinds).all<SiteMeta>();
  const sites = new Map<string, SiteMeta>();
  for (const s of (sitesRows.results || [])) sites.set(s.id, s);

  const devicesQ = sites.size
    ? `SELECT id, site_id, device_type, rated_kw, last_seen_at, status
         FROM om_devices WHERE site_id IN (${Array.from(sites.keys()).map(() => '?').join(',')})`
    : null;
  if (!devicesQ) {
    return { scanned_devices: 0, detected: 0, skipped_existing: 0, by_detector: {}, ran_at: ranAt };
  }
  const devicesRows = await env.DB.prepare(devicesQ).bind(...Array.from(sites.keys())).all<DeviceMeta>();
  const devices = (devicesRows.results || []) as DeviceMeta[];
  if (!devices.length) {
    return { scanned_devices: 0, detected: 0, skipped_existing: 0, by_detector: {}, ran_at: ranAt };
  }

  // Existing open faults — used for idempotency.
  const openRows = await env.DB.prepare(
    `SELECT device_id, fault_code FROM om_faults
      WHERE status IN ('open','acknowledged','in_progress')`,
  ).all<{ device_id: string | null; fault_code: string | null }>();
  const openKey = new Set<string>();
  for (const r of (openRows.results || [])) {
    if (r.device_id && r.fault_code) openKey.add(`${r.device_id}::${r.fault_code}`);
  }

  // Telemetry window — only the columns we read.
  const telemRows = await env.DB.prepare(
    `SELECT device_id, ts, ac_kw, dc_kw, interval_kwh, voltage_v, frequency_hz,
            temperature_c, flow_lps, pressure_bar, level_m, treated_kl, raw_kl, pump_kw
       FROM om_telemetry
      WHERE site_id IN (${Array.from(sites.keys()).map(() => '?').join(',')})
        AND ts >= ?
      ORDER BY device_id ASC, ts ASC`,
  ).bind(...Array.from(sites.keys()), since).all<TelemetryRow>();
  const byDevice = new Map<string, TelemetryRow[]>();
  for (const r of (telemRows.results || [])) {
    const arr = byDevice.get(r.device_id) || [];
    arr.push(r);
    byDevice.set(r.device_id, arr);
  }

  const pending: PendingFault[] = [];
  const byDetector: Record<string, number> = {};
  let skippedExisting = 0;

  const enqueue = (f: PendingFault) => {
    const k = `${f.device_id || ''}::${f.fault_code}`;
    if (openKey.has(k)) { skippedExisting += 1; return; }
    openKey.add(k); // dedup within this scan too
    pending.push(f);
    byDetector[f.fault_code] = (byDetector[f.fault_code] || 0) + 1;
  };

  // ─── Detector 1: communication_loss (no device telemetry) ──────────────
  // Uses devices.last_seen_at to avoid scanning empty telemetry.
  const commCutoff = Date.now() - 60 * 60_000;
  for (const d of devices) {
    if (d.status === 'decommissioned') continue;
    const seen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    if (seen && seen < commCutoff) {
      const site = sites.get(d.site_id);
      if (!site) continue;
      enqueue({
        device_id: d.id,
        site_id: d.site_id,
        category: 'communication',
        severity: 'major',
        fault_code: 'detector_communication_loss',
        description: `No telemetry from device since ${d.last_seen_at}.`,
        detected_at: ranAt,
        hourly_loss_zar: hourlyLossForDevice(d, site),
      });
    }
  }

  // ─── Telemetry-driven detectors (per-device) ──────────────────────────
  for (const d of devices) {
    const site = sites.get(d.site_id);
    if (!site) continue;
    const rows = byDevice.get(d.id) || [];
    if (!rows.length) continue;

    const isSolar = d.device_type === 'inverter' || d.device_type === 'string' || site.technology === 'solar';
    const isWater = site.technology === 'water';
    const hourly = hourlyLossForDevice(d, site);

    let zeroRun = 0, underRun = 0, hotRun = 0, hvRun = 0, lvRun = 0, fdRun = 0, waterRun = 0;
    let leakLevelStart: number | null = null;

    for (const r of rows) {
      if (isSolar && isDaytime(r.ts)) {
        // Zero-output
        if ((r.ac_kw ?? 0) <= 0.1) zeroRun += 1; else zeroRun = 0;
        if (zeroRun === 3) {
          enqueue({
            device_id: d.id, site_id: d.site_id, category: 'inverter', severity: 'major',
            fault_code: 'detector_zero_output_daylight',
            description: `Inverter ac_kw at or below 0.1 kW for 3 consecutive daytime readings.`,
            detected_at: r.ts, hourly_loss_zar: hourly,
          });
        }
        // Underperformance vs rated
        if (d.rated_kw && (r.ac_kw ?? 0) > 0 && r.ac_kw! / d.rated_kw < 0.4) underRun += 1; else underRun = 0;
        if (underRun === 4) {
          enqueue({
            device_id: d.id, site_id: d.site_id, category: 'inverter', severity: 'minor',
            fault_code: 'detector_underperformance',
            description: `Inverter output < 40% of rated ${d.rated_kw} kW for 4 consecutive daytime readings.`,
            detected_at: r.ts, hourly_loss_zar: Math.round(hourly * 0.6),
          });
        }
      } else {
        zeroRun = 0; underRun = 0;
      }

      // Over-temperature
      if ((r.temperature_c ?? 0) > 75) hotRun += 1; else hotRun = 0;
      if (hotRun === 3) {
        enqueue({
          device_id: d.id, site_id: d.site_id, category: 'inverter', severity: 'major',
          fault_code: 'detector_inverter_overtemp',
          description: `Device temperature > 75 °C for 3 consecutive readings.`,
          detected_at: r.ts, hourly_loss_zar: hourly,
        });
      }

      // Voltage bounds (LV-side ≈ 400 V)
      if ((r.voltage_v ?? 0) > 440) hvRun += 1; else hvRun = 0;
      if (hvRun === 3) {
        enqueue({
          device_id: d.id, site_id: d.site_id, category: 'grid', severity: 'major',
          fault_code: 'detector_voltage_high',
          description: `Voltage > 440 V for 3 consecutive readings.`,
          detected_at: r.ts, hourly_loss_zar: Math.round(hourly * 0.3),
        });
      }
      if ((r.voltage_v ?? 0) > 0 && (r.voltage_v ?? 999) < 360) lvRun += 1; else lvRun = 0;
      if (lvRun === 3) {
        enqueue({
          device_id: d.id, site_id: d.site_id, category: 'grid', severity: 'major',
          fault_code: 'detector_voltage_low',
          description: `Voltage < 360 V for 3 consecutive readings.`,
          detected_at: r.ts, hourly_loss_zar: Math.round(hourly * 0.3),
        });
      }

      // Frequency deviation
      const f = r.frequency_hz ?? 0;
      if (f > 0 && (f < 49.5 || f > 50.5)) fdRun += 1; else fdRun = 0;
      if (fdRun === 2) {
        enqueue({
          device_id: d.id, site_id: d.site_id, category: 'grid', severity: 'critical',
          fault_code: 'detector_frequency_deviation',
          description: `Grid frequency outside 49.5–50.5 Hz for 2 consecutive readings (last: ${f.toFixed(2)} Hz).`,
          detected_at: r.ts, hourly_loss_zar: hourly,
        });
      }

      // Water-only detectors
      if (isWater) {
        if ((r.flow_lps ?? 0) > 1) {
          waterRun += 1;
          if (leakLevelStart === null && r.level_m !== null) leakLevelStart = r.level_m;
        } else { waterRun = 0; leakLevelStart = null; }
        if (waterRun === 4 && r.level_m !== null && leakLevelStart !== null && r.level_m <= leakLevelStart) {
          enqueue({
            device_id: d.id, site_id: d.site_id, category: 'bos', severity: 'major',
            fault_code: 'detector_water_leak',
            description: `Outflow > 1 L/s for 4 readings with reservoir level not rising — suspected leak.`,
            detected_at: r.ts, hourly_loss_zar: 0,
          });
        }
        // Pump inefficiency
        if (
          (r.pump_kw ?? 0) > 0 && (r.flow_lps ?? 0) >= 0 &&
          (r.pump_kw ?? 0) >= ((d.rated_kw || 10) * 0.8) &&
          (r.flow_lps ?? 0) / Math.max(0.1, r.pump_kw ?? 1) < 0.5
        ) {
          enqueue({
            device_id: d.id, site_id: d.site_id, category: 'bos', severity: 'minor',
            fault_code: 'detector_pump_inefficiency',
            description: `Pump drawing ≥80% rated kW but flow/kW ratio < 0.5 — likely cavitation, fouling, or impeller wear.`,
            detected_at: r.ts, hourly_loss_zar: 0,
          });
        }
      }
    }
  }

  // ─── Detector 10: treatment_recovery_low (site-level, 24h aggregate) ──
  const recovery = await env.DB.prepare(
    `SELECT site_id, COALESCE(SUM(treated_kl),0) AS t, COALESCE(SUM(raw_kl),0) AS r
       FROM om_telemetry
      WHERE site_id IN (${Array.from(sites.keys()).map(() => '?').join(',')})
        AND ts >= datetime('now','-24 hours')
      GROUP BY site_id`,
  ).bind(...Array.from(sites.keys())).all<{ site_id: string; t: number; r: number }>();
  for (const r of (recovery.results || [])) {
    if (r.r > 1 && (r.t / r.r) < 0.8) {
      const site = sites.get(r.site_id);
      if (!site || site.technology !== 'water') continue;
      enqueue({
        device_id: null, site_id: r.site_id, category: 'bos', severity: 'minor',
        fault_code: 'detector_treatment_recovery_low',
        description: `Treatment recovery ${(r.t / r.r * 100).toFixed(1)}% over last 24h (target ≥ 80%).`,
        detected_at: ranAt, hourly_loss_zar: 0,
      });
    }
  }

  // ─── Insert ────────────────────────────────────────────────────────────
  for (const f of pending) {
    const id = genId('omflt');
    await env.DB.prepare(`
      INSERT INTO om_faults
        (id, site_id, device_id, category, severity, fault_code, description,
         detected_at, status, hourly_loss_zar)
      VALUES (?,?,?,?,?,?,?,?,'open',?)
    `).bind(
      id, f.site_id, f.device_id, f.category, f.severity, f.fault_code,
      f.description, f.detected_at, f.hourly_loss_zar,
    ).run().catch(() => null);
  }

  return {
    scanned_devices: devices.length,
    detected: pending.length,
    skipped_existing: skippedExisting,
    by_detector: byDetector,
    ran_at: ranAt,
  };
}
