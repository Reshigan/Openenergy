// ═══════════════════════════════════════════════════════════════════════════
// Carbon Tax Act (Act 15 of 2019) pure calculators.
//
// Tax rate: R190/tCO₂e for 2024 tax year, escalating per GN schedule. We
// take the rate as an input so this module doesn't rot annually.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Section 13 offset allowance percentage by industry group.
 * Most sectors: 5%. Mining/petroleum ("Annex 2"): 10%.
 * Not encyclopedic — caller supplies the industry; this just returns the rate.
 */
export function offsetAllowancePct(industryGroup: 'general' | 'annex_2'): number {
  return industryGroup === 'annex_2' ? 10 : 5;
}

/**
 * Compute the effective net carbon tax after applying retired offset credits.
 * Credits are capped at the s.13 allowance percentage of gross liability.
 *
 * Returns:
 *   gross                 — input liability
 *   offset_limit_zar      — monetary cap per s.13
 *   offset_applied_zar    — credits × tax rate, capped at offset_limit_zar
 *   net                   — gross − offset_applied
 *   credits_unused_tco2e  — retired credits that couldn't be applied (over-cap)
 */
export function applyOffsetAllowance(params: {
  gross_tax_liability_zar: number;
  industry_group: 'general' | 'annex_2';
  credits_tco2e: number;
  tax_rate_zar_per_tco2e: number;
}): {
  gross: number;
  offset_limit_pct: number;
  offset_limit_zar: number;
  offset_applied_zar: number;
  net: number;
  credits_used_tco2e: number;
  credits_unused_tco2e: number;
} {
  const { gross_tax_liability_zar: gross, industry_group, credits_tco2e, tax_rate_zar_per_tco2e: rate } = params;
  const pct = offsetAllowancePct(industry_group);
  const limitZar = Math.max(0, gross * (pct / 100));
  const requestedValue = Math.max(0, credits_tco2e) * rate;
  const applied = Math.min(requestedValue, limitZar);
  const creditsUsed = rate > 0 ? applied / rate : 0;
  return {
    gross,
    offset_limit_pct: pct,
    offset_limit_zar: limitZar,
    offset_applied_zar: applied,
    net: Math.max(0, gross - applied),
    credits_used_tco2e: creditsUsed,
    credits_unused_tco2e: Math.max(0, credits_tco2e - creditsUsed),
  };
}

/**
 * Verify a registry serial range is non-overlapping with existing serials.
 * Used when issuing new vintages or splitting a serial block on transfer.
 */
export function rangeOverlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end;
}
