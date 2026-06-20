// src/utils/autofill.ts — server-side form autofill ("prefill") resolver.
//
// Across the platform 139 chain-initiation forms and every statutory/licence
// document make users re-key data the system already holds: their own
// participant identity, their flagship project's capacity/technology/grid point,
// the reporting year, the trading currency. This resolver computes ONE flat
// profile map keyed by the ACTUAL field keys used in MERIDIAN_CHAINS.initiation
// (project_id, capacity_mw, technology, …). The ledger GET response carries it
// as `prefill`; FieldForm seeds each field from prefill[field.key] (with an
// explicit `defaultFrom` alias winning when present). No per-form wiring.
//
// Only fields that UNAMBIGUOUSLY refer to the ACTOR's own entity/project are
// filled. Counterparty/borrower/contractor names are direction-ambiguous and
// deliberately left blank.
//
// SECURITY: every column/table name below is a static literal; the only request
// -derived value (user.id) binds to a `?` placeholder. Mirrors the chain-registry
// SQL invariant.
import type { D1Database } from '@cloudflare/workers-types';

interface ActorLike {
  id: string;
  role?: string;
  name?: string;
  email?: string;
  tenant_id?: string;
}

// Year-valued fields → current calendar year. Reporting/compliance/vintage cycles
// all default to "this year"; users adjust when back-filling a prior period.
const YEAR_KEYS = [
  'reporting_year', 'report_year', 'compliance_year', 'financial_year',
  'verification_year', 'assessment_year', 'vintage_year', 'credit_vintage_year',
  'review_year', 'renewal_year', 'levy_year', 'tax_year',
];

// Currency fields → ZAR. SA energy market; every quantum settles in rand.
const CURRENCY_KEYS = ['currency', 'base_currency', 'notional_currency', 'settlement_currency'];

/**
 * Build the prefill profile for `user`. Returns a flat {fieldKey: value} map.
 * Safe to call for any chain that has an initiation block; missing source rows
 * just yield a smaller map (never throws on absent project/participant).
 */
export async function buildPrefill(env: { DB: D1Database }, user: ActorLike): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (!user?.id) return out;

  // --- participant identity (the actor's own party) ---
  const p = await env.DB
    .prepare('SELECT id, name, company_name, role, bbbee_level, kyc_status, email FROM participants WHERE id = ?')
    .bind(user.id)
    .first<{ id: string; name: string | null; company_name: string | null; role: string | null;
             bbbee_level: string | null; kyc_status: string | null; email: string | null }>();

  if (p) {
    const partyName = p.company_name || p.name || user.name || '';
    // every alias the registry uses for "this actor's id"
    for (const k of ['participant_id', 'applicant_party_id', 'party_id', 'developer_id', 'ipp_id',
                     'owner_id', 'licensee_user_id', 'provider_id', 'taxpayer_id', 'holder_id']) {
      out[k] = p.id;
    }
    for (const k of ['company_name', 'applicant_party_name', 'party_name', 'licensee_name',
                     'applicant_name', 'developer_name', 'entity_name']) {
      if (partyName) out[k] = partyName;
    }
    if (p.bbbee_level != null) out.bbbee_level = p.bbbee_level;
    if (p.email) out.contact_email = p.email;
  }

  // --- flagship project (most recent IPP project the actor develops) ---
  const proj = await env.DB
    .prepare(
      `SELECT id, project_name, technology, capacity_mw, location, grid_connection_point, commercial_operation_date, ppa_price_per_mwh
         FROM ipp_projects WHERE developer_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(user.id)
    .first<{ id: string; project_name: string | null; technology: string | null; capacity_mw: number | null;
             location: string | null; grid_connection_point: string | null;
             commercial_operation_date: string | null; ppa_price_per_mwh: number | null }>();

  if (proj) {
    for (const k of ['project_id', 'project_ref', 'facility_id', 'plant_id', 'site_id', 'asset_id']) out[k] = proj.id;
    if (proj.project_name) for (const k of ['project_name', 'facility_name', 'plant_name', 'site_name']) out[k] = proj.project_name;
    if (proj.capacity_mw != null) for (const k of ['capacity_mw', 'project_mw', 'plant_mw', 'installed_capacity_mw']) out[k] = proj.capacity_mw;
    if (proj.technology) for (const k of ['technology', 'generation_technology', 'energy_type']) out[k] = proj.technology;
    if (proj.location) for (const k of ['location', 'location_name', 'facility_location', 'province']) out[k] = proj.location;
    if (proj.grid_connection_point) for (const k of ['grid_connection_point', 'grid_connection_ref', 'connection_point']) out[k] = proj.grid_connection_point;
    if (proj.commercial_operation_date) {
      const d = String(proj.commercial_operation_date).slice(0, 10);
      for (const k of ['commercial_operation_date', 'commissioning_date', 'cod_date']) out[k] = d;
    }
    if (proj.ppa_price_per_mwh != null) out.ppa_price_per_mwh = proj.ppa_price_per_mwh;
  } else if (user.role && /carbon/.test(user.role)) {
    // carbon_fund has no IPP project; fall back to its flagship carbon project
    const cp = await env.DB
      .prepare(
        `SELECT id, project_name, project_number, methodology, host_country
           FROM carbon_projects WHERE developer_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(user.id)
      .first<{ id: string; project_name: string | null; project_number: string | null;
               methodology: string | null; host_country: string | null }>();
    if (cp) {
      for (const k of ['project_id', 'project_ref', 'carbon_project_id']) out[k] = cp.id;
      if (cp.project_name) out.project_name = cp.project_name;
      if (cp.project_number) out.project_number = cp.project_number;
      if (cp.methodology) out.methodology = cp.methodology;
      if (cp.host_country) out.host_country = cp.host_country;
    }
  }

  // --- constants (year / currency) ---
  const year = new Date().getFullYear();
  for (const k of YEAR_KEYS) out[k] = year;
  for (const k of CURRENCY_KEYS) out[k] = 'ZAR';

  return out;
}
