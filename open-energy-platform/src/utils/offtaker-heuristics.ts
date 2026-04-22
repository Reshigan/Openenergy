// ═══════════════════════════════════════════════════════════════════════════
// Offtaker heuristics — deterministic extraction + mix-building helpers that
// guarantee the Offtaker AI flow always returns structured output, even when
// the LLM free-form responds with prose/code instead of JSON.
// ═══════════════════════════════════════════════════════════════════════════

export type BillProfile = {
  annual_kwh: number;
  peak_pct: number;
  standard_pct: number;
  offpeak_pct: number;
  avg_tariff_zar_per_kwh: number;
  demand_charge_zar_per_kva: number;
  nmd_kva?: number;
  tou_risk: 'low' | 'medium' | 'high';
};

// Normalise any user/LLM-supplied percentage to a 0-1 fraction.
// Accepts 35, "35%", 0.35, etc.
function toFraction(value: number | undefined, fallback: number): number {
  if (value === undefined || value === null || Number.isNaN(value)) return fallback;
  if (value > 1 && value <= 100) return value / 100;
  if (value > 0 && value <= 1) return value;
  return fallback;
}

/**
 * Pull tariff-shape facts out of free-form bill text using simple regexes.
 * Designed to be forgiving: any line with "annual consumption: 18,500,000 kWh"
 * or "18.5 GWh" or "Avg tariff R2.10/kWh" will match.
 */
export function extractBillProfile(
  content: string,
  overrides: { annual_kwh?: number; avg_tariff?: number } = {},
): BillProfile {
  const text = content || '';

  // annual_kwh — accept kWh, MWh, GWh.
  let annualKwh = overrides.annual_kwh;
  if (annualKwh === undefined) {
    const gwhMatch = text.match(/([\d,.]+)\s*GWh/i);
    const mwhMatch = text.match(/([\d,.]+)\s*MWh/i);
    const kwhMatch = text.match(/annual[^0-9]*([\d,.]+)\s*kWh/i) ||
      text.match(/consumption[^0-9]*([\d,.]+)\s*kWh/i) ||
      text.match(/([\d,.]+)\s*kWh\s*\/?\s*(?:year|yr|annum|a)/i);
    if (gwhMatch) annualKwh = Number(gwhMatch[1].replace(/,/g, '')) * 1_000_000;
    else if (mwhMatch) annualKwh = Number(mwhMatch[1].replace(/,/g, '')) * 1_000;
    else if (kwhMatch) annualKwh = Number(kwhMatch[1].replace(/,/g, ''));
  }
  if (!annualKwh || !isFinite(annualKwh)) annualKwh = 1_200_000;

  // tariff — accept "R2.10/kWh", "avg tariff 2.1", etc.
  let avgTariff = overrides.avg_tariff;
  if (avgTariff === undefined) {
    const m = text.match(/R\s*([\d.]+)\s*\/?\s*kWh/i) ||
      text.match(/tariff[^0-9]*([\d.]+)/i);
    if (m) avgTariff = Number(m[1]);
  }
  if (!avgTariff || !isFinite(avgTariff)) avgTariff = 2.15;

  // peak / standard / off-peak percentages.
  const peakM = text.match(/peak[^0-9]*([\d.]+)\s*%/i);
  const standardM = text.match(/standard[^0-9]*([\d.]+)\s*%/i);
  const offpeakM = text.match(/off[\s-]?peak[^0-9]*([\d.]+)\s*%/i);

  const peakPct = toFraction(peakM ? Number(peakM[1]) : undefined, 0.22);
  const standardPct = toFraction(standardM ? Number(standardM[1]) : undefined, 0.48);
  const offpeakPct = toFraction(offpeakM ? Number(offpeakM[1]) : undefined, Math.max(0, 1 - peakPct - standardPct));

  // Demand charge.
  const dM = text.match(/demand[^0-9]*R?\s*([\d.]+)/i);
  const demandCharge = dM ? Number(dM[1]) : 180;

  // Notified maximum demand.
  const nmdM = text.match(/NMD[^0-9]*([\d,.]+)/i);
  const nmdKva = nmdM ? Number(nmdM[1].replace(/,/g, '')) : undefined;

  // TOU risk — explicit "high|medium|low" in text, else derive from peak share.
  let touRisk: 'low' | 'medium' | 'high';
  const rM = text.match(/TOU[^a-z]*(high|medium|low)/i) || text.match(/tou\s*risk[^a-z]*(high|medium|low)/i);
  if (rM) touRisk = rM[1].toLowerCase() as 'low' | 'medium' | 'high';
  else if (peakPct >= 0.3) touRisk = 'high';
  else if (peakPct >= 0.2) touRisk = 'medium';
  else touRisk = 'low';

  return {
    annual_kwh: annualKwh,
    peak_pct: peakPct,
    standard_pct: standardPct,
    offpeak_pct: offpeakPct,
    avg_tariff_zar_per_kwh: avgTariff,
    demand_charge_zar_per_kva: demandCharge,
    nmd_kva: nmdKva,
    tou_risk: touRisk,
  };
}

export type MixItem = {
  project_id: string;
  project_name: string;
  stage: string;
  share_pct: number;
  mwh_per_year: number;
  blended_price: number;
  rationale: string;
};

/**
 * Build a deterministic mix across the best-ranked projects. Called whenever
 * the LLM response doesn't contain a usable mix. Weights 45/30/15/10 across
 * the first four projects (which the DB query already ranks by stage + size).
 */
export function buildDeterministicMix(
  projects: Array<Record<string, unknown>>,
  requiredMwh: number,
  currentTariff: number,
): { mix: MixItem[]; savings_pct: number; carbon_tco2e: number; warnings: string[] } {
  const weights = [0.45, 0.3, 0.15, 0.1];
  const selected = projects.slice(0, 4);
  const mix: MixItem[] = selected.map((p, i) => {
    const w = weights[i] ?? 0;
    const ppa = Number(p.ppa_price ?? 0) || 1850;
    return {
      project_id: String(p.id),
      project_name: String(p.project_name || p.name || p.id || 'Unnamed'),
      stage: String(p.status || 'unknown'),
      share_pct: Math.round(w * 100),
      mwh_per_year: Math.round(w * requiredMwh),
      blended_price: ppa,
      rationale: `Stage ${p.status} weighted ${Math.round(w * 100)}% vs R${currentTariff}/kWh benchmark.`,
    };
  });

  const weightedPrice = mix.reduce((acc, m) => acc + (m.share_pct / 100) * m.blended_price, 0);
  const currentPerMwh = currentTariff * 1000;
  const savingsPct = currentPerMwh > 0 ? Math.max(0, Math.round(((currentPerMwh - weightedPrice) / currentPerMwh) * 100)) : 0;
  const carbon = Math.round(requiredMwh * 0.95);

  return {
    mix,
    savings_pct: savingsPct,
    carbon_tco2e: carbon,
    warnings: mix.length === 0 ? ['No eligible projects found'] : [],
  };
}
