// ═══════════════════════════════════════════════════════════════════════════
// BRP imbalance settlement engine — pure calculator.
//
// Follows the SA Grid Code — System Operations Code pattern for Balance
// Responsible Parties (BRPs). Each BRP nominates expected MWh per 30-min
// settlement period; metering produces the actual. Imbalance is the
// difference, priced per direction:
//
//   imbalance_mwh        = actual_mwh − scheduled_mwh
//   imbalance_direction  = long (surplus)   if imbalance_mwh > 0
//                          short (deficit)   if imbalance_mwh < 0
//                          balanced          if within ±tolerance
//   imbalance_charge_zar = |imbalance_mwh| × imbalance_price_zar_per_mwh
//
// Direction-specific pricing (SO-published):
//   - A BRP long on the system pays or is paid at the long_price (typically
//     lower — system is absorbing the surplus). In SA this is often the
//     system marginal price less a spread.
//   - A BRP short pays the short_price (typically higher — system must
//     cover the shortfall from ancillary services).
//
// Charge semantics (who-pays):
//   - Short BRP always pays the system (positive charge out).
//   - Long BRP either receives (negative charge) or pays a haircut, depending
//     on the prevailing price regime.
//
// Outputs per BRP per period, aggregated monthly for invoicing. All
// calculations pure; persistence is the caller's responsibility.
// ═══════════════════════════════════════════════════════════════════════════

export type ImbalanceDirection = 'long' | 'short' | 'balanced';

export interface PeriodNomination {
  brp_participant_id: string;
  period_start: string;       // ISO datetime
  period_end: string;
  scheduled_mwh: number;
  actual_mwh: number;
}

export interface PeriodPricing {
  period_start: string;
  period_end: string;
  long_price_zar_mwh: number;   // price BRP receives (or pays a haircut) when long
  short_price_zar_mwh: number;  // price BRP pays when short
  tolerance_mwh?: number;        // deadband where imbalance is treated as balanced (default 0)
}

export interface ImbalanceRecord {
  brp_participant_id: string;
  period_start: string;
  period_end: string;
  scheduled_mwh: number;
  actual_mwh: number;
  imbalance_mwh: number;
  direction: ImbalanceDirection;
  price_applied_zar_mwh: number;
  imbalance_charge_zar: number;   // +ve = BRP owes, -ve = BRP receives
}

export interface BrpMonthlyTotal {
  brp_participant_id: string;
  period: string;                 // YYYY-MM
  periods_count: number;
  scheduled_mwh_total: number;
  actual_mwh_total: number;
  imbalance_mwh_long: number;
  imbalance_mwh_short: number;
  net_charge_zar: number;         // +ve = BRP owes
  long_charge_zar: number;
  short_charge_zar: number;
  on_target_period_pct: number;
}

const DEFAULT_TOLERANCE_MWH = 0.05;   // ±50 kWh per 30-min period treated as balanced

/**
 * Compute the imbalance for a single period × BRP.
 *
 * Short-side charge is strictly positive (BRP pays).
 * Long-side charge can be either sign — when `long_price_zar_mwh` is
 * positive the BRP receives (stored as negative charge); when it's
 * negative the BRP pays a haircut (stored as positive charge).
 */
export function computePeriodImbalance(
  nomination: PeriodNomination,
  pricing: PeriodPricing,
): ImbalanceRecord {
  const tolerance = pricing.tolerance_mwh ?? DEFAULT_TOLERANCE_MWH;
  const imbalance = round4(nomination.actual_mwh - nomination.scheduled_mwh);

  let direction: ImbalanceDirection;
  let priceApplied: number;
  let chargeZar: number;

  if (Math.abs(imbalance) <= tolerance) {
    direction = 'balanced';
    priceApplied = 0;
    chargeZar = 0;
  } else if (imbalance > 0) {
    direction = 'long';
    priceApplied = pricing.long_price_zar_mwh;
    // BRP is long — receives (negative charge) when long price is positive;
    // pays a haircut when long price is negative (system-over-supplied).
    chargeZar = -imbalance * priceApplied;
  } else {
    direction = 'short';
    priceApplied = pricing.short_price_zar_mwh;
    // BRP is short — always pays.
    chargeZar = -imbalance * priceApplied; // -imbalance is +ve, price ≥ 0 → +ve charge
  }

  return {
    brp_participant_id: nomination.brp_participant_id,
    period_start: nomination.period_start,
    period_end: nomination.period_end,
    scheduled_mwh: nomination.scheduled_mwh,
    actual_mwh: nomination.actual_mwh,
    imbalance_mwh: imbalance,
    direction,
    price_applied_zar_mwh: priceApplied,
    imbalance_charge_zar: round2(chargeZar),
  };
}

/**
 * Compute imbalance for every matching (nomination × pricing) pair. Skips
 * periods where no price is configured. Caller typically builds the
 * pricing index once per settlement run.
 */
export function computeRun(
  nominations: PeriodNomination[],
  pricingByPeriodStart: Map<string, PeriodPricing>,
): ImbalanceRecord[] {
  const out: ImbalanceRecord[] = [];
  for (const nom of nominations) {
    const pricing = pricingByPeriodStart.get(nom.period_start);
    if (!pricing) continue;
    out.push(computePeriodImbalance(nom, pricing));
  }
  return out;
}

/**
 * Aggregate a month's worth of period-level imbalance records into a single
 * invoice-ready summary per BRP.
 *
 * `period` is the month bucket (YYYY-MM) the caller assigns to all records.
 * `on_target_period_pct` is the share of periods classified as 'balanced'
 * — useful as a BRP scorecard input.
 */
export function aggregateMonthly(
  records: ImbalanceRecord[],
  period: string,
): BrpMonthlyTotal[] {
  const byBrp = new Map<string, BrpMonthlyTotal>();
  for (const r of records) {
    const key = r.brp_participant_id;
    const cur = byBrp.get(key) || blankTotal(key, period);
    cur.periods_count += 1;
    cur.scheduled_mwh_total = round4(cur.scheduled_mwh_total + r.scheduled_mwh);
    cur.actual_mwh_total = round4(cur.actual_mwh_total + r.actual_mwh);
    if (r.direction === 'long') {
      cur.imbalance_mwh_long = round4(cur.imbalance_mwh_long + r.imbalance_mwh);
      cur.long_charge_zar = round2(cur.long_charge_zar + r.imbalance_charge_zar);
    } else if (r.direction === 'short') {
      cur.imbalance_mwh_short = round4(cur.imbalance_mwh_short + r.imbalance_mwh);
      cur.short_charge_zar = round2(cur.short_charge_zar + r.imbalance_charge_zar);
    }
    cur.net_charge_zar = round2(cur.long_charge_zar + cur.short_charge_zar);
    byBrp.set(key, cur);
  }
  // Compute on-target percentage.
  const balancedPerBrp = new Map<string, number>();
  for (const r of records) {
    if (r.direction === 'balanced') {
      balancedPerBrp.set(r.brp_participant_id, (balancedPerBrp.get(r.brp_participant_id) || 0) + 1);
    }
  }
  for (const [brp, total] of byBrp) {
    const balanced = balancedPerBrp.get(brp) || 0;
    total.on_target_period_pct =
      total.periods_count > 0 ? round2((balanced / total.periods_count) * 100) : 0;
  }
  return Array.from(byBrp.values()).sort((a, b) => b.net_charge_zar - a.net_charge_zar);
}

function blankTotal(brp: string, period: string): BrpMonthlyTotal {
  return {
    brp_participant_id: brp,
    period,
    periods_count: 0,
    scheduled_mwh_total: 0,
    actual_mwh_total: 0,
    imbalance_mwh_long: 0,
    imbalance_mwh_short: 0,
    net_charge_zar: 0,
    long_charge_zar: 0,
    short_charge_zar: 0,
    on_target_period_pct: 0,
  };
}

function round2(x: number): number { return Math.round(x * 100) / 100; }
function round4(x: number): number { return Math.round(x * 10000) / 10000; }
