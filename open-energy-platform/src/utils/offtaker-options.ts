// Builds the offtaker "procurement options" view: marketplace listings available
// now + upcoming IPP projects, each scored for cost-benefit against the bill
// profile. Additive util consumed by GET /api/offtaker/options. No writes.
import type { HonoBindings } from './types';

// SA grid emission factor (tCO₂e per MWh). Mirrors the inline 0.95 used by
// buildDeterministicMix in offtaker-heuristics.ts (Eskom grid intensity).
const SA_GRID_EF = 0.95;
// Fallback blended PPA price when a project/listing has no price, matching the
// 1850 fallback used by buildDeterministicMix in offtaker-heuristics.ts.
const FALLBACK_PRICE_ZAR_PER_MWH = 1850;
// Indicative-band granularity. Cross-tenant project PPA prices must never be
// surfaced verbatim (POPIA / commercial confidentiality), so a not-yet-operating
// project's modelled price is rounded to the nearest R50 and labelled indicative.
const INDICATIVE_BAND_ZAR = 50;

// How a surfaced price should be read:
//  - 'listed'         a public marketplace offer — shown verbatim
//  - 'indicative'     a modelled (not-yet-contracted) project price — banded
//  - 'contact_seller' price withheld (operating project on a signed PPA)
export type PriceBasis = 'listed' | 'indicative' | 'contact_seller';

function toIndicativeBand(price: number): number {
  return Math.round(price / INDICATIVE_BAND_ZAR) * INDICATIVE_BAND_ZAR;
}

export interface OfftakerOption {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  annual_mwh: number;
  price_basis: PriceBasis;
  // null ⇒ withheld (price_basis 'contact_seller'); the cost/saving fields go
  // null in lockstep because they cannot be computed without a price.
  blended_price_zar_per_mwh: number | null;
  est_annual_cost_zar: number | null;
  est_saving_zar: number | null;
  est_saving_pct: number | null;
  co2_avoided_tco2e: number;
  rationale: string;
}

export interface OfftakerOptions {
  available_now: OfftakerOption[];
  upcoming_projects: OfftakerOption[];
}

export interface BillProfileInput {
  annual_kwh: number;
  avg_tariff_zar_per_kwh: number;
}

export interface OptionBase {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  offered_annual_mwh: number;
  price_basis: PriceBasis;
  // null ⇒ price withheld. Already banded by the caller when 'indicative'.
  blended_price: number | null;
}

// Exported as scoreEnergyOption for the deal registry's energy_supply descriptor,
// which delegates its scoring to this exact function (no behaviour divergence).
export function scoreEnergyOption(base: OptionBase, bill: BillProfileInput): OfftakerOption {
  const demandMwh = bill.annual_kwh / 1000;
  const coveredMwh = Math.min(base.offered_annual_mwh, demandMwh);
  const co2 = coveredMwh * SA_GRID_EF;
  const when = base.availability === 'now' ? 'Available now' : (base.cod_estimate ?? 'upcoming');
  const common = {
    option_id: base.option_id,
    kind: base.kind,
    title: base.title,
    target_participant_id: base.target_participant_id,
    availability: base.availability,
    cod_estimate: base.cod_estimate,
    annual_mwh: Math.round(coveredMwh),
    price_basis: base.price_basis,
    co2_avoided_tco2e: Math.round(co2),
  };

  // Price withheld (operating project on a signed PPA): surface the volume + CO₂
  // benefit only — never a cost/saving derived from a price we won't show.
  if (base.blended_price === null) {
    return {
      ...common,
      blended_price_zar_per_mwh: null,
      est_annual_cost_zar: null,
      est_saving_zar: null,
      est_saving_pct: null,
      rationale: `${when} · covers ~${Math.round(coveredMwh).toLocaleString()} MWh/yr · contact seller for pricing`,
    };
  }

  const price = base.blended_price;
  const estAnnualCost = coveredMwh * price;
  const currentCostForCovered = coveredMwh * 1000 * bill.avg_tariff_zar_per_kwh;
  const estSaving = currentCostForCovered - estAnnualCost;
  const estSavingPct = currentCostForCovered > 0 ? (estSaving / currentCostForCovered) * 100 : 0;
  const priceLabel = base.price_basis === 'indicative'
    ? `~R${Math.round(price).toLocaleString()}/MWh (indicative)`
    : `R${Math.round(price).toLocaleString()}/MWh`;
  return {
    ...common,
    blended_price_zar_per_mwh: Math.round(price),
    est_annual_cost_zar: Math.round(estAnnualCost),
    est_saving_zar: Math.round(estSaving),
    est_saving_pct: Math.round(estSavingPct * 10) / 10,
    rationale: `${when} · covers ${Math.round(coveredMwh).toLocaleString()} MWh/yr at ${priceLabel} vs R${bill.avg_tariff_zar_per_kwh}/kWh`,
  };
}

export async function buildOfftakerOptions(
  env: HonoBindings,
  _offtakerId: string,
  bill: BillProfileInput,
): Promise<OfftakerOptions> {
  const demandMwh = bill.annual_kwh / 1000;

  const projectsRes = await env.DB.prepare(
    `SELECT id, project_name, status, ppa_price_per_mwh, ppa_volume_mwh, developer_id
       FROM ipp_projects
      WHERE status IN ('development','construction','commissioning','commercial_operations')
        AND developer_id IS NOT NULL
      ORDER BY CASE status
        WHEN 'commercial_operations' THEN 1
        WHEN 'commissioning' THEN 2
        WHEN 'construction' THEN 3
        WHEN 'development' THEN 4
        ELSE 5 END
      LIMIT 20`,
  ).all();

  const listingsRes = await env.DB.prepare(
    `SELECT id, title, seller_id, price, volume_available
       FROM marketplace_listings
      WHERE status = 'active'
        AND listing_type IN ('energy','capacity')
        AND seller_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20`,
  ).all();

  const upcoming_projects: OfftakerOption[] = [];
  for (const row of (projectsRes.results ?? []) as Array<Record<string, unknown>>) {
    const status = String(row.status ?? '');
    const isOperating = status === 'commercial_operations';
    const offered = Number(row.ppa_volume_mwh ?? 0) || demandMwh;
    const rawPrice = Number(row.ppa_price_per_mwh ?? 0) || FALLBACK_PRICE_ZAR_PER_MWH;
    // Operating project ⇒ the PPA is contracted/confidential: withhold price.
    // Otherwise the price is modelled ⇒ expose only a banded indicative figure,
    // never the raw cross-tenant ppa_price_per_mwh.
    upcoming_projects.push(scoreEnergyOption({
      option_id: String(row.id),
      kind: 'project',
      title: String(row.project_name ?? 'Unnamed project'),
      target_participant_id: String(row.developer_id),
      availability: isOperating ? 'now' : 'upcoming',
      cod_estimate: isOperating ? null : status,
      offered_annual_mwh: offered,
      price_basis: isOperating ? 'contact_seller' : 'indicative',
      blended_price: isOperating ? null : toIndicativeBand(rawPrice),
    }, bill));
  }

  const available_now: OfftakerOption[] = [];
  for (const row of (listingsRes.results ?? []) as Array<Record<string, unknown>>) {
    const offered = Number(row.volume_available ?? 0) || demandMwh;
    const price = Number(row.price ?? 0) || FALLBACK_PRICE_ZAR_PER_MWH;
    // A marketplace listing is a public offer — its price is shown verbatim.
    available_now.push(scoreEnergyOption({
      option_id: String(row.id),
      kind: 'listing',
      title: String(row.title ?? 'Marketplace listing'),
      target_participant_id: String(row.seller_id),
      availability: 'now',
      cod_estimate: null,
      offered_annual_mwh: offered,
      price_basis: 'listed',
      blended_price: price,
    }, bill));
  }

  return { available_now, upcoming_projects };
}
