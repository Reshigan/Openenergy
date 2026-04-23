// ═══════════════════════════════════════════════════════════════════════════
// Tariff comparison engine. Given a consumption profile (48 half-hour buckets
// for a day, or a monthly summary with TOU breakdown) and a set of candidate
// tariffs, return the cost per tariff and rank them.
//
// TOU schedule format (stored in tariff_products.tou_schedule_json):
//   {
//     "off_peak":  { "cents_per_kwh": 75,  "hours": [[22,6]] },
//     "standard":  { "cents_per_kwh": 115, "hours": [[6,7],[10,18],[20,22]] },
//     "peak":      { "cents_per_kwh": 320, "hours": [[7,10],[18,20]] }
//   }
//
// "hours" is a list of [startHour, endHour) ranges. A range like [22, 6]
// wraps across midnight. Inputs outside any bucket fall back to "standard".
// ═══════════════════════════════════════════════════════════════════════════

export interface TouBucket {
  cents_per_kwh: number;
  hours: Array<[number, number]>;
}
export type TouSchedule = Record<string, TouBucket>;

export interface HalfHourProfile {
  /** 48-element array, index 0 = 00:00-00:30, index 47 = 23:30-00:00 */
  half_hour_kwh: number[];
}

export interface FlatTariff {
  type: 'flat';
  cents_per_kwh: number;
}
export interface TouTariff {
  type: 'tou';
  schedule: TouSchedule;
}
export type SimpleTariff = FlatTariff | TouTariff;

/**
 * Compute the cost (ZAR) of a single day's consumption under a tariff.
 */
export function dayCost(profile: HalfHourProfile, tariff: SimpleTariff): number {
  if (profile.half_hour_kwh.length !== 48) {
    throw new Error('half_hour_kwh must contain 48 elements');
  }
  if (tariff.type === 'flat') {
    const totalKwh = profile.half_hour_kwh.reduce((s, kwh) => s + kwh, 0);
    return (totalKwh * tariff.cents_per_kwh) / 100;
  }
  let totalCents = 0;
  for (let i = 0; i < 48; i++) {
    const hour = i / 2; // 0, 0.5, 1.0, ..., 23.5
    const bucket = resolveBucket(hour, tariff.schedule);
    totalCents += profile.half_hour_kwh[i] * bucket.cents_per_kwh;
  }
  return totalCents / 100;
}

function resolveBucket(hour: number, schedule: TouSchedule): TouBucket {
  for (const [name, bucket] of Object.entries(schedule)) {
    for (const [start, end] of bucket.hours) {
      if (hourInRange(hour, start, end)) return bucket;
    }
    // avoid unused-var lint on `name`
    if (name === '__never__') { /* noop */ }
  }
  // Fallback — return the standard bucket if present, else the first bucket, else zero.
  return schedule.standard || Object.values(schedule)[0] || { cents_per_kwh: 0, hours: [] };
}

function hourInRange(hour: number, start: number, end: number): boolean {
  if (start <= end) {
    return hour >= start && hour < end;
  }
  // wraps midnight, e.g. [22, 6]
  return hour >= start || hour < end;
}

/**
 * Rank a set of tariffs by daily cost for a given profile, cheapest first.
 */
export function rankTariffs(
  profile: HalfHourProfile,
  candidates: Array<{ id: string; tariff: SimpleTariff; name?: string }>,
): Array<{ id: string; name?: string; daily_cost_zar: number; annualised_zar: number; save_vs_worst_zar: number }> {
  const costs = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    daily_cost_zar: dayCost(profile, c.tariff),
  }));
  const worst = Math.max(...costs.map((c) => c.daily_cost_zar));
  return costs
    .map((c) => ({
      ...c,
      annualised_zar: c.daily_cost_zar * 365,
      save_vs_worst_zar: (worst - c.daily_cost_zar) * 365,
    }))
    .sort((a, b) => a.daily_cost_zar - b.daily_cost_zar);
}

/**
 * Compute market-based Scope 2 emissions.
 * location_based = grid_factor × total_consumption
 * market_based   = grid_factor × (total_consumption − renewable_claimed)
 * clamped at 0 when RECs over-cover consumption.
 */
export function scope2(params: {
  total_consumption_mwh: number;
  renewable_claimed_mwh: number;
  grid_factor_tco2e_per_mwh: number;
}): { location_based_tco2e: number; market_based_tco2e: number; renewable_percentage: number } {
  const { total_consumption_mwh: total, renewable_claimed_mwh: ren, grid_factor_tco2e_per_mwh: gf } = params;
  const locationBased = total * gf;
  const marketBased = Math.max(0, (total - ren) * gf);
  const renPct = total > 0 ? Math.min(100, (ren / total) * 100) : 0;
  return {
    location_based_tco2e: locationBased,
    market_based_tco2e: marketBased,
    renewable_percentage: renPct,
  };
}
