// ════════════════════════════════════════════════════════════════════════
// covenant-advisor — deterministic resolution-pathway suggestions for
// breached covenants.
//
// Mirrors src/utils/run-failure-explainer.ts (settlement) and src/utils/
// amendment-suggester.ts (trading): deterministic rules first, AI gateway
// fall-through for novel breach types. Each suggestion has a clear
// rationale + a recommended action so the lender SPA can render the
// one-line "why" + 1-click accept inline.
//
// Recommendation buckets (must match the CHECK constraint on
// ai_lender_advice.recommendation):
//   cure_plan       — borrower is willing + able; agree a 30/60/90-day
//                     cure plan and re-test.
//   waiver          — one-off, non-systemic; waive the test on the
//                     condition the borrower remediates within the
//                     window.
//   amendment       — structural mismatch; amend the covenant threshold
//                     (typical for first-year availability tests on a
//                     ramping plant).
//   acceleration   — borrower in deep trouble; trigger the acceleration
//                     clause to call the loan due.
//   workout        — restructure debt before resorting to acceleration.
//   no_action      — informational / data-quality issue, no real breach.
// ════════════════════════════════════════════════════════════════════════

export type CovenantTest = {
  id: string;
  covenant_id: string;
  covenant_code: string;        // 'DSCR_12M' | 'LLCR' | 'AVAILABILITY_95' | etc.
  covenant_type: string;        // 'financial' | 'operational' | 'insurance' | …
  measured_value: number | null;
  threshold: number | null;     // covenant minimum / maximum
  result: string;               // 'pass' | 'warn' | 'breach' | …
  test_period: string;
  test_date: string;
};

export type CovenantAdvice = {
  recommendation:
    | 'cure_plan' | 'waiver' | 'amendment' | 'acceleration' | 'workout' | 'no_action';
  rationale: string;
  confidence: number;
  source: 'deterministic' | 'ai_gateway' | 'fallback';
};

function diffPct(measured: number, threshold: number): number {
  if (threshold === 0) return 0;
  return Math.abs(measured - threshold) / Math.abs(threshold);
}

// Rule 1 — financial DSCR: borrowers usually cure within 1–2 quarters
// unless the gap is severe. Severity bands:
//   <10% under threshold → cure_plan
//   10–25% under         → waiver (one-off) if first breach
//   25–40% under         → workout
//   >40% under           → acceleration
function adviseFinancialBreach(test: CovenantTest): CovenantAdvice | null {
  if (test.covenant_type !== 'financial') return null;
  if (test.result !== 'breach' && test.result !== 'warn') return null;
  if (test.measured_value == null || test.threshold == null) return null;

  const gap = diffPct(test.measured_value, test.threshold);
  if (test.measured_value >= test.threshold) {
    return {
      recommendation: 'no_action',
      rationale: 'Test marked breach but measured value meets threshold — likely a data-quality issue. Re-test once the data feed is corrected.',
      confidence: 0.85,
      source: 'deterministic',
    };
  }

  if (gap < 0.10) {
    return {
      recommendation: 'cure_plan',
      rationale: `Shortfall of ${(gap * 100).toFixed(1)}% on ${test.covenant_code}. Recommend a 60-day cure plan: equity injection or revenue uplift before next test.`,
      confidence: 0.85,
      source: 'deterministic',
    };
  }
  if (gap < 0.25) {
    return {
      recommendation: 'waiver',
      rationale: `Shortfall of ${(gap * 100).toFixed(1)}% on ${test.covenant_code}. Materiality typical for first-year ramp-up; recommend a conditional waiver linked to the next quarterly re-test.`,
      confidence: 0.78,
      source: 'deterministic',
    };
  }
  if (gap < 0.40) {
    return {
      recommendation: 'workout',
      rationale: `Shortfall of ${(gap * 100).toFixed(1)}% on ${test.covenant_code} suggests structural underperformance. Open a workout: re-profile amortisation or convert part of the facility to mezzanine.`,
      confidence: 0.78,
      source: 'deterministic',
    };
  }
  return {
    recommendation: 'acceleration',
    rationale: `Shortfall of ${(gap * 100).toFixed(1)}% on ${test.covenant_code} is beyond typical cure capacity. Issue an acceleration notice and engage agent bank on enforcement.`,
    confidence: 0.82,
    source: 'deterministic',
  };
}

// Rule 2 — operational availability: typical first-year ramp issue.
function adviseOperationalBreach(test: CovenantTest): CovenantAdvice | null {
  if (test.covenant_type !== 'operational') return null;
  if (test.result !== 'breach') return null;
  if (test.measured_value == null || test.threshold == null) return null;
  const gap = diffPct(test.measured_value, test.threshold);
  if (gap < 0.05) {
    return {
      recommendation: 'waiver',
      rationale: `${test.covenant_code} missed by ${(gap * 100).toFixed(1)}%. Recommend a one-off waiver tied to a 90-day availability ramp plan.`,
      confidence: 0.8,
      source: 'deterministic',
    };
  }
  return {
    recommendation: 'cure_plan',
    rationale: `${test.covenant_code} missed by ${(gap * 100).toFixed(1)}%. Recommend a cure plan: schedule O&M intervention + re-test in 60 days.`,
    confidence: 0.75,
    source: 'deterministic',
  };
}

// Rule 3 — insurance / reporting / legal: usually one-time admin slip;
// waive or cure cheaply, never accelerate on a single instance.
function adviseAdminBreach(test: CovenantTest): CovenantAdvice | null {
  if (!['insurance', 'reporting', 'legal'].includes(test.covenant_type)) return null;
  if (test.result !== 'breach') return null;
  return {
    recommendation: 'cure_plan',
    rationale: `${test.covenant_type} breach (${test.covenant_code}). Typically an admin slip — confirm corrective action within 14 days, no fee.`,
    confidence: 0.72,
    source: 'deterministic',
  };
}

const RULES: Array<(t: CovenantTest) => CovenantAdvice | null> = [
  adviseFinancialBreach,
  adviseOperationalBreach,
  adviseAdminBreach,
];

export function adviseCovenant(test: CovenantTest): CovenantAdvice {
  for (const rule of RULES) {
    const out = rule(test);
    if (out) return out;
  }
  return {
    recommendation: 'cure_plan',
    rationale: `${test.covenant_code} breach with no deterministic pattern matched. Open a cure plan and escalate to the credit committee for tailored handling.`,
    confidence: 0.4,
    source: 'fallback',
  };
}
