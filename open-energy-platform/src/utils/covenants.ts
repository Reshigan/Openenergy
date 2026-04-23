// ═══════════════════════════════════════════════════════════════════════════
// Covenant testing engine — pure evaluator. Callers supply the measured value
// and the covenant definition; the evaluator returns pass / warn / breach.
//
// Warn band: 5% bleed margin toward breach — lets lenders track trajectory
// before a hard breach. Adjustable via thresholdWarnPct.
// ═══════════════════════════════════════════════════════════════════════════

export type CovenantOperator = 'gte' | 'lte' | 'eq' | 'gt' | 'lt' | 'between';
export type CovenantResult = 'pass' | 'warn' | 'breach' | 'not_tested';

export interface CovenantDefinition {
  operator: CovenantOperator;
  threshold: number | null;
  threshold_upper: number | null;
}

export interface TestOptions {
  thresholdWarnPct?: number;  // default 5% — how close to breach triggers 'warn'
}

/**
 * Evaluate a numeric measurement against a covenant. Returns 'not_tested' if
 * the measurement is missing or the definition is incomplete.
 *
 * Examples:
 *   evaluate({ operator: 'gte', threshold: 1.2, ... }, 1.5)   → 'pass'
 *   evaluate({ operator: 'gte', threshold: 1.2, ... }, 1.22)  → 'warn'  (within 5%)
 *   evaluate({ operator: 'gte', threshold: 1.2, ... }, 1.1)   → 'breach'
 */
export function evaluateCovenant(
  def: CovenantDefinition,
  measured: number | null | undefined,
  opts: TestOptions = {},
): CovenantResult {
  if (measured == null || Number.isNaN(measured)) return 'not_tested';
  const warnPct = opts.thresholdWarnPct ?? 5;
  const warn = warnPct / 100;

  switch (def.operator) {
    case 'gte': {
      if (def.threshold == null) return 'not_tested';
      if (measured < def.threshold) return 'breach';
      const warnLine = def.threshold * (1 + warn);
      if (measured < warnLine) return 'warn';
      return 'pass';
    }
    case 'gt': {
      if (def.threshold == null) return 'not_tested';
      if (measured <= def.threshold) return 'breach';
      const warnLine = def.threshold * (1 + warn);
      if (measured <= warnLine) return 'warn';
      return 'pass';
    }
    case 'lte': {
      if (def.threshold == null) return 'not_tested';
      if (measured > def.threshold) return 'breach';
      const warnLine = def.threshold * (1 - warn);
      if (measured > warnLine) return 'warn';
      return 'pass';
    }
    case 'lt': {
      if (def.threshold == null) return 'not_tested';
      if (measured >= def.threshold) return 'breach';
      const warnLine = def.threshold * (1 - warn);
      if (measured >= warnLine) return 'warn';
      return 'pass';
    }
    case 'eq': {
      if (def.threshold == null) return 'not_tested';
      if (Math.abs(measured - def.threshold) < 1e-9) return 'pass';
      const warnBand = Math.abs(def.threshold) * warn || warn;
      return Math.abs(measured - def.threshold) <= warnBand ? 'warn' : 'breach';
    }
    case 'between': {
      if (def.threshold == null || def.threshold_upper == null) return 'not_tested';
      const [lo, hi] = [def.threshold, def.threshold_upper].sort((a, b) => a - b);
      if (measured < lo || measured > hi) return 'breach';
      const span = hi - lo;
      const warnBand = span * warn;
      if (measured < lo + warnBand || measured > hi - warnBand) return 'warn';
      return 'pass';
    }
    default:
      return 'not_tested';
  }
}

// ─── Standard financial covenant calculators ──────────────────────────────
/**
 * DSCR = CFADS / Debt Service
 * CFADS = Cash From Available Debt Service (revenue - opex - tax)
 * Debt service = principal + interest paid in the period
 */
export function dscr(cfadsZar: number, debtServiceZar: number): number | null {
  if (!debtServiceZar || debtServiceZar <= 0) return null;
  return cfadsZar / debtServiceZar;
}

/**
 * LLCR = PV of future CFADS / outstanding debt
 * caller discount-factors the CFADS series before calling.
 */
export function llcr(pvFutureCfadsZar: number, outstandingDebtZar: number): number | null {
  if (!outstandingDebtZar || outstandingDebtZar <= 0) return null;
  return pvFutureCfadsZar / outstandingDebtZar;
}

/**
 * Waterfall execution — pure function that allocates available cash across
 * ordered tranches up to each tranche's required amount.
 * Returns per-tranche allocation + remaining surplus.
 */
export interface WaterfallTrancheInput {
  id: string;
  priority: number;
  required_amount_zar: number;
}
export interface WaterfallAllocationOutput {
  tranche_id: string;
  allocated_zar: number;
  shortfall_zar: number;
}
export interface WaterfallResult {
  allocations: WaterfallAllocationOutput[];
  surplus_after_all_tranches_zar: number;
  total_allocated_zar: number;
}
export function runWaterfall(
  availableCashZar: number,
  tranches: WaterfallTrancheInput[],
): WaterfallResult {
  const ordered = [...tranches].sort((a, b) => a.priority - b.priority);
  let remaining = Math.max(0, availableCashZar);
  const allocations: WaterfallAllocationOutput[] = [];
  let totalAllocated = 0;
  for (const t of ordered) {
    const want = Math.max(0, t.required_amount_zar);
    const give = Math.min(want, remaining);
    allocations.push({
      tranche_id: t.id,
      allocated_zar: give,
      shortfall_zar: Math.max(0, want - give),
    });
    remaining -= give;
    totalAllocated += give;
  }
  return {
    allocations,
    surplus_after_all_tranches_zar: remaining,
    total_allocated_zar: totalAllocated,
  };
}
