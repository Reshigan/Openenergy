// ═══════════════════════════════════════════════════════════════════════════
// CPMI-IOSCO PFMI quantitative disclosure — pure compute helpers.
//
// One snapshot per month. The 13 metrics defined by CPMI-IOSCO §1-23 (we
// publish the quantitative subset: §4 Credit, §6 Margin, §7 Liquidity,
// §15 General business risk, §17 Operational risk).
//
// All inputs are plain numbers extracted from D1 reads; the math is
// deterministic and unit-tested without DB.
// ═══════════════════════════════════════════════════════════════════════════

export type DisclosureInputs = {
  // §6 Margin
  initial_margin_total_zar: number;
  variation_margin_total_zar: number;
  margin_var99_lookback_zar: number;       // 99th-percentile VaR over lookback
  // §7 Liquidity
  qualifying_liquid_resources_zar: number;
  largest_member_exposure_zar: number;
  // §4 Credit
  default_fund_balance_zar: number;
  default_fund_required_zar: number;
  // §15 General business risk
  ccp_capital_zar: number;
  ccp_capital_sitg_pct: number;            // skin-in-game pct of capital (typically 25%)
  // §17 Operational risk
  settled_instruction_count: number;
  failed_instruction_count: number;
  // Members
  active_member_count: number;
};

export type DisclosureSnapshot = {
  as_of_date: string;
  initial_margin_total_zar: number;
  variation_margin_total_zar: number;
  margin_coverage_pct: number;
  qualifying_liquid_resources_zar: number;
  largest_member_exposure_zar: number;
  liquidity_coverage_ratio: number;
  default_fund_balance_zar: number;
  default_fund_required_zar: number;
  default_fund_coverage_ratio: number;
  ccp_capital_zar: number;
  ccp_capital_skin_in_game_zar: number;
  settlement_finality_pct: number;
  failed_instruction_count: number;
  active_member_count: number;
};

// Avoid division-by-zero. Returns 0 when denominator is 0.
function safeRatio(num: number, denom: number): number {
  if (!denom || denom === 0) return 0;
  return num / denom;
}

export function computeDisclosure(
  inputs: DisclosureInputs,
  as_of_date: string,
): DisclosureSnapshot {
  const total_settled = inputs.settled_instruction_count + inputs.failed_instruction_count;
  return {
    as_of_date,
    initial_margin_total_zar: inputs.initial_margin_total_zar,
    variation_margin_total_zar: inputs.variation_margin_total_zar,
    margin_coverage_pct: safeRatio(inputs.initial_margin_total_zar, inputs.margin_var99_lookback_zar) * 100,
    qualifying_liquid_resources_zar: inputs.qualifying_liquid_resources_zar,
    largest_member_exposure_zar: inputs.largest_member_exposure_zar,
    liquidity_coverage_ratio: safeRatio(inputs.qualifying_liquid_resources_zar, inputs.largest_member_exposure_zar),
    default_fund_balance_zar: inputs.default_fund_balance_zar,
    default_fund_required_zar: inputs.default_fund_required_zar,
    default_fund_coverage_ratio: safeRatio(inputs.default_fund_balance_zar, inputs.default_fund_required_zar),
    ccp_capital_zar: inputs.ccp_capital_zar,
    ccp_capital_skin_in_game_zar: inputs.ccp_capital_zar * inputs.ccp_capital_sitg_pct,
    settlement_finality_pct: safeRatio(inputs.settled_instruction_count, total_settled) * 100,
    failed_instruction_count: inputs.failed_instruction_count,
    active_member_count: inputs.active_member_count,
  };
}

// CPMI-IOSCO PFMI passing thresholds. Cover-1 standard (largest single member
// default fully collateralised; CPMI §4-§7) requires:
//   - margin_coverage_pct ≥ 100 (IM ≥ 99% VaR over lookback)
//   - default_fund_coverage_ratio ≥ 1.0
//   - liquidity_coverage_ratio ≥ 1.0
//   - settlement_finality_pct ≥ 99.5 (CPMI §8 — finality)
export type DisclosureBreach = { metric: string; value: number; threshold: number; why: string };

export function evaluateBreaches(snap: DisclosureSnapshot): DisclosureBreach[] {
  const out: DisclosureBreach[] = [];
  if (snap.margin_coverage_pct < 100) {
    out.push({
      metric: 'margin_coverage_pct',
      value: snap.margin_coverage_pct,
      threshold: 100,
      why: 'CPMI §6: initial margin must cover 99% VaR over lookback (Cover-1).',
    });
  }
  if (snap.default_fund_coverage_ratio < 1.0) {
    out.push({
      metric: 'default_fund_coverage_ratio',
      value: snap.default_fund_coverage_ratio,
      threshold: 1.0,
      why: 'CPMI §4: default fund must cover largest member exposure under stress.',
    });
  }
  if (snap.liquidity_coverage_ratio < 1.0) {
    out.push({
      metric: 'liquidity_coverage_ratio',
      value: snap.liquidity_coverage_ratio,
      threshold: 1.0,
      why: 'CPMI §7: qualifying liquid resources must cover largest payment obligation.',
    });
  }
  if (snap.settlement_finality_pct < 99.5) {
    out.push({
      metric: 'settlement_finality_pct',
      value: snap.settlement_finality_pct,
      threshold: 99.5,
      why: 'CPMI §8: settlement finality must hit 99.5%+ for an FMI.',
    });
  }
  return out;
}
