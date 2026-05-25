// ════════════════════════════════════════════════════════════════════════
// run-failure-explainer — settlement-run failure → human-readable cause.
//
// Mirrors src/utils/rejection-explainer.ts (trader rejection codes) for
// the settlement side. When a settlement_run fails or lands in the DLQ,
// the explainer turns the underlying error into a 1-line cause + a
// 1-line suggested action, with a deterministic fallback for known
// failure codes and an AI gateway fall-through for novel ones.
//
// The result is logged into ai_settlement_run_failures regardless of
// source, so the SPA DLQ "Explain failure" button can audit-log
// acceptance and the team can spot which novel failures repeat.
// ════════════════════════════════════════════════════════════════════════

export type FailureExplanation = {
  explanation: string;
  suggested_action: string;
  confidence: number;
  source: 'deterministic' | 'ai_gateway' | 'fallback';
};

const KNOWN_FAILURES: Record<string, FailureExplanation> = {
  metering_gap: {
    explanation:
      'The settlement engine could not find meter readings covering the full delivery period.',
    suggested_action:
      'Re-sync site telemetry for the period via the OEM connector, or backfill manually at POST /api/esums/telemetry/import.',
    confidence: 0.95,
    source: 'deterministic',
  },
  contract_missing: {
    explanation:
      'The invoice references a contract that is not in the active book (deleted, draft, or not yet executed).',
    suggested_action:
      'Confirm the contract is in phase=active and that counterparties are correctly linked. Re-run after fixing.',
    confidence: 0.95,
    source: 'deterministic',
  },
  price_curve_stale: {
    explanation:
      'The price curve used for take-or-pay/imbalance lookup has not been refreshed for the settlement period.',
    suggested_action:
      'Run the price-curve refresh cron, then re-run the failed settlement batch via POST /settlement-auto/runs/retry.',
    confidence: 0.92,
    source: 'deterministic',
  },
  counterparty_unknown_bank: {
    explanation:
      'The payer has no bank account on file, so the settlement engine cannot produce the payment instruction.',
    suggested_action:
      'Ask the offtaker to add bank details under /settings/banking, then re-run.',
    confidence: 0.96,
    source: 'deterministic',
  },
  tariff_validation_failed: {
    explanation:
      'The tariff applied to one or more line items violates the regulated band (price collar in the PPA).',
    suggested_action:
      'Check the contract\'s price_floor / price_ceiling and the latest market clearing price. Recompute fees only after the collar issue is resolved.',
    confidence: 0.9,
    source: 'deterministic',
  },
  duplicate_invoice_period: {
    explanation:
      'Another invoice already exists for the same (counterparty, contract, period). The run would have produced a duplicate.',
    suggested_action:
      'Mark the duplicate as cancelled (or merge line items into the existing invoice) and re-run.',
    confidence: 0.97,
    source: 'deterministic',
  },
  fx_rate_missing: {
    explanation:
      'A required FX rate (USD/ZAR or EUR/ZAR for an indexed contract) is not in the rates cache for the settlement date.',
    suggested_action:
      'Trigger the FX-rate refresh cron and re-run. If the date is older than the cache horizon, set the rate manually under /admin-platform/fx-rates.',
    confidence: 0.94,
    source: 'deterministic',
  },
};

// Deterministic-only resolver. Use this when no AI gateway is configured
// or when the failure code matches a known bucket.
export function explainKnown(failureCode: string | null | undefined): FailureExplanation | null {
  if (!failureCode) return null;
  const hit = KNOWN_FAILURES[failureCode];
  return hit ? { ...hit } : null;
}

// AI gateway path — falls through when the failure_code is novel.
// Stubbed deterministically here so the route always succeeds even
// without a configured gateway; production wires this to env.AI.run().
export async function explainViaGateway(
  failureCode: string | null | undefined,
  failureMessage: string | null | undefined,
): Promise<FailureExplanation> {
  const code = failureCode || 'unknown';
  const msg = (failureMessage || '').slice(0, 200);
  return {
    explanation: `Settlement run failed with code "${code}". ${msg ? `Underlying: ${msg}` : 'No detail recorded.'}`,
    suggested_action:
      'Open settlement-auto DLQ for context. If the failure repeats, file a settlement break against the affected invoice and escalate to platform support.',
    confidence: 0.5,
    source: 'fallback',
  };
}

// Top-level entry point. Tries deterministic first; falls back to the
// gateway path for novel codes. The caller writes the chosen result
// into ai_settlement_run_failures.
export async function explainSettlementRunFailure(
  failureCode: string | null | undefined,
  failureMessage: string | null | undefined,
): Promise<FailureExplanation> {
  const known = explainKnown(failureCode);
  if (known) return known;
  return explainViaGateway(failureCode, failureMessage);
}

// List of known failure codes — useful for the route to enumerate the
// deterministic-bucket library in admin / docs surfaces.
export function knownFailureCodes(): string[] {
  return Object.keys(KNOWN_FAILURES);
}
