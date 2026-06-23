// Builds the IPP "funding & offtake options" view: every standing offer aimed at
// ipp_developer (carbon-fund credit offtake + lender funding), each scored for
// fit against the project's technology / capacity / PPA volume. Additive util
// consumed by GET /api/projects/:id/funding-options. No writes.
//
// Mirrors offtaker-options.ts: a pure matcher the route calls. SQL identifiers
// are static; the project id binds to a ? placeholder in the caller.
import type { HonoBindings } from './types';

// SA grid emission factor (tCO₂e per MWh) — same Eskom intensity used across the
// platform (offtaker-options.ts, offtaker-heuristics.ts).
const SA_GRID_EF = 0.95;
// Indicative solar capacity factor for an annual-generation estimate when the
// project carries no PPA volume. ponytail: single blended CF; refine per-tech if
// wind/storage projects need their own factor.
const SOLAR_CF = 0.22;
const HOURS_PER_YEAR = 8760;
// Indicative all-in capex per MW (ZAR) for a utility/C&I solar plant — used only
// to express a lender ticket as "covers ~X% of build". ponytail: flat rate.
const CAPEX_ZAR_PER_MW = 12_000_000;

export interface FundingOfferTerms {
  [k: string]: unknown;
}

export interface FundingOffer {
  offer_id: string;
  offeror_id: string;
  offeror_role: string;
  category: 'carbon' | 'funding';
  offer_kind: string;
  registry_standard: string | null;
  headline: string;
  terms: FundingOfferTerms;
  // Indicative value the offer unlocks for this project, ZAR/yr (carbon) or ZAR
  // facility size (funding). null when it can't be computed.
  est_value_zar: number | null;
  fit_score: number;   // 0–100, higher = better fit
  fit_reason: string;
}

export interface FundingOptions {
  project_id: string;
  annual_mwh: number;
  annual_tco2e: number;
  est_capex_zar: number;
  carbon: FundingOffer[];
  funding: FundingOffer[];
}

export interface ProjectProfile {
  id: string;
  technology: string | null;
  capacity_mw: number;
  ppa_volume_mwh: number | null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseTerms(raw: unknown): FundingOfferTerms {
  if (typeof raw !== 'string' || !raw) return {};
  try { return JSON.parse(raw) as FundingOfferTerms; } catch { return {}; }
}

// Score a carbon offtake offer against the project's annual credit volume.
function scoreCarbon(terms: FundingOfferTerms, annualMwh: number, annualTco2e: number): {
  value: number | null; score: number; reason: string;
} {
  const isRec = typeof terms.price_per_mwh === 'number';
  if (isRec) {
    const value = Math.round(annualMwh * num(terms.price_per_mwh));
    return {
      value,
      score: annualMwh > 0 ? 88 : 40,
      reason: `~R${value.toLocaleString()}/yr from ${Math.round(annualMwh).toLocaleString()} MWh of attribute certificates`,
    };
  }
  const price = num(terms.price_per_tco2e);
  const minVol = num(terms.min_volume_tco2e);
  const meetsFloor = annualTco2e >= minVol;
  const value = Math.round(annualTco2e * price);
  const base = price > 0 ? 70 : 40;
  const score = Math.max(20, Math.min(95, base + (meetsFloor ? 20 : -15) + (annualTco2e > 5000 ? 5 : 0)));
  const floorNote = minVol > 0
    ? (meetsFloor ? `clears the ${minVol.toLocaleString()} tCO2e floor` : `below the ${minVol.toLocaleString()} tCO2e floor`)
    : 'no minimum volume';
  return {
    value,
    score,
    reason: `~R${value.toLocaleString()}/yr from ${Math.round(annualTco2e).toLocaleString()} tCO2e · ${floorNote}`,
  };
}

// Score a funding offer against the project's estimated capex.
function scoreFunding(terms: FundingOfferTerms, capexZar: number): {
  value: number | null; score: number; reason: string;
} {
  const ticket = num(terms.ticket_zar);
  if (ticket <= 0) return { value: null, score: 40, reason: 'terms on application' };
  const coverPct = capexZar > 0 ? Math.round((ticket / capexZar) * 100) : 0;
  // Senior debt that covers a meaningful slice scores highest; an oversized
  // ticket is fine (caps at full cover), an undersized one scores lower.
  const score = Math.max(25, Math.min(95, 50 + Math.min(coverPct, 100) / 2));
  const rate = typeof terms.rate_pct === 'number'
    ? `${terms.rate_pct}% fixed`
    : (terms.margin_bps ? `${terms.rate_basis ?? 'base'}+${terms.margin_bps}bps` : 'indicative pricing');
  return {
    value: ticket,
    score,
    reason: `R${ticket.toLocaleString()} (${coverPct}% of ~R${Math.round(capexZar).toLocaleString()} build) · ${rate} · ${num(terms.tenor_years)}yr`,
  };
}

export async function buildFundingOptions(
  env: HonoBindings,
  project: ProjectProfile,
): Promise<FundingOptions> {
  const annualMwh = project.ppa_volume_mwh && project.ppa_volume_mwh > 0
    ? project.ppa_volume_mwh
    : Math.round(project.capacity_mw * HOURS_PER_YEAR * SOLAR_CF);
  const annualTco2e = Math.round(annualMwh * SA_GRID_EF);
  const capexZar = Math.round(project.capacity_mw * CAPEX_ZAR_PER_MW);

  const res = await env.DB.prepare(
    `SELECT id, offeror_participant_id, offeror_role, offer_kind, registry_standard,
            headline, terms_json
       FROM oe_counterparty_offers
      WHERE target_role = 'ipp_developer' AND status = 'active'
      ORDER BY offer_kind, id`,
  ).all();

  const carbon: FundingOffer[] = [];
  const funding: FundingOffer[] = [];

  for (const row of (res.results ?? []) as Array<Record<string, unknown>>) {
    const kind = String(row.offer_kind ?? '');
    const terms = parseTerms(row.terms_json);
    const isCarbon = kind.startsWith('carbon_');
    const scored = isCarbon
      ? scoreCarbon(terms, annualMwh, annualTco2e)
      : scoreFunding(terms, capexZar);
    const offer: FundingOffer = {
      offer_id: String(row.id),
      offeror_id: String(row.offeror_participant_id ?? ''),
      offeror_role: String(row.offeror_role ?? ''),
      category: isCarbon ? 'carbon' : 'funding',
      offer_kind: kind,
      registry_standard: row.registry_standard ? String(row.registry_standard) : null,
      headline: String(row.headline ?? ''),
      terms,
      est_value_zar: scored.value,
      fit_score: scored.score,
      fit_reason: scored.reason,
    };
    (isCarbon ? carbon : funding).push(offer);
  }

  // Best fit first within each category.
  carbon.sort((a, b) => b.fit_score - a.fit_score);
  funding.sort((a, b) => b.fit_score - a.fit_score);

  return { project_id: project.id, annual_mwh: annualMwh, annual_tco2e: annualTco2e, est_capex_zar: capexZar, carbon, funding };
}
