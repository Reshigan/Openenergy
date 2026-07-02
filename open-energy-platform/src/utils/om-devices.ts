// ═══════════════════════════════════════════════════════════════════════════
// O&M device model — the generic core for one O&M module across device kinds.
//
// The platform started solar-first (SolaX inverters). This generalises the O&M
// device model so meters are FIRST-CLASS and INDEPENDENT of solar: an
// electricity, water, waste, gas, heat or fuel meter is monitored the same way an
// inverter is — reading → performance ratio → health → alert. Health uses the MTN
// LiveWire taxonomy (healthy / sub-healthy / abnormal) so the same rollups serve
// telecom-site O&M and renewable-asset O&M.
//
// Pure (no D1/DO) so it unit-tests without infrastructure; the telemetry ingest
// and fault engine compose these instead of hard-coding solar assumptions.
// ═══════════════════════════════════════════════════════════════════════════

export type OmDeviceKind = 'solar_inverter' | 'meter' | 'battery' | 'genset';

// A meter's medium — deliberately not tied to electricity/solar. A water or waste
// meter needs no inverter, no generation; it just reads and rolls up like any other.
export type MeterMedium = 'electricity' | 'water' | 'waste' | 'gas' | 'heat' | 'fuel';

// MTN LiveWire SOW health taxonomy — shared across inverters, meters, batteries.
export type OmHealth = 'healthy' | 'sub_healthy' | 'abnormal';

/** Display unit per meter medium (used for readings, deltas, reports). */
export const METER_UNIT: Record<MeterMedium, string> = {
  electricity: 'kWh',
  water: 'kL',
  waste: 'kg',
  gas: 'm³',
  heat: 'kWh_th',
  fuel: 'L',
};

/** True for a metering device — no solar/inverter dependency. */
export function isMeter(kind: OmDeviceKind): boolean {
  return kind === 'meter';
}

/** The reading unit for a device: meters by medium, inverters/gensets in kW,
 *  batteries by state of charge. */
export function readingUnit(kind: OmDeviceKind, medium?: MeterMedium): string {
  if (kind === 'meter') return medium ? METER_UNIT[medium] : 'unit';
  if (kind === 'battery') return '%SoC';
  return 'kW'; // solar_inverter, genset
}

// ─── Health classification ──────────────────────────────────────────────────
// A device is healthy/sub-healthy/abnormal from a performance RATIO (actual ÷
// expected). Works for any kind: inverter yield ratio, meter throughput vs
// baseline, genset efficiency, battery SoH. Two thresholds, sensible defaults.

export interface HealthBand { warn: number; crit: number } // ratio below warn → sub-healthy; below crit → abnormal
export const DEFAULT_HEALTH_BAND: HealthBand = { warn: 0.9, crit: 0.7 };

export function classifyHealth(ratio: number, band: HealthBand = DEFAULT_HEALTH_BAND): OmHealth {
  if (!Number.isFinite(ratio) || ratio < band.crit) return 'abnormal';
  if (ratio < band.warn) return 'sub_healthy';
  return 'healthy';
}

/** Performance ratio = actual ÷ expected, clamped ≥ 0; 0 when no expectation. */
export function performanceRatio(actual: number, expected: number): number {
  if (!(expected > 0)) return 0;
  return Math.max(0, actual / expected);
}

// ─── Readings ───────────────────────────────────────────────────────────────

/** Consumption/production over a period from two cumulative meter reads.
 *  Guards a meter roll-over / bad read by never returning negative. */
export function meterDelta(prev: number, curr: number): number {
  return Math.max(0, curr - prev);
}

/** Solar inverter (and any AC-from-DC converter) efficiency = AC out ÷ DC in. */
export function inverterEfficiency(acKw: number, dcKw: number): number {
  return dcKw > 0 ? Math.max(0, acKw / dcKw) : 0;
}

// ─── Roll-up ──────────────────────────────────────────────────────────────
// A site/portfolio health roll-up (the MTN "proportions of healthy/sub-healthy/
// abnormal" one-key view), medium-agnostic.
export interface HealthRollup { healthy: number; sub_healthy: number; abnormal: number; total: number }

export function rollupHealth(statuses: OmHealth[]): HealthRollup {
  const r: HealthRollup = { healthy: 0, sub_healthy: 0, abnormal: 0, total: statuses.length };
  for (const s of statuses) r[s]++;
  return r;
}
