// Cross-role deal engine — the registry (Phase 0, additive, zero behaviour change).
//
// Static in-code descriptors keyed by deal_type. The `:type` URL param is *looked
// up* in this map — never interpolated into SQL. Table/column/status/role values
// are static literals; only bound-param VALUES are request-derived. This is the
// security spine of the engine (see CROSS_ROLE_DEAL_ENGINE_PLAN.md §3, §6).
//
// Phase 0 ships the types + the registry + valueSweeteners + the first descriptor
// (`energy_supply`) which delegates its scoring to the existing offtaker-options
// util. Nothing consumes the registry yet (routes are Phase 1), so behaviour is
// unchanged on this commit.
import type { HonoBindings } from './types';
import { scoreEnergyOption, type PriceBasis } from './offtaker-options';

// Loose JSON bag for term sheets / need profiles parsed out of TEXT columns.
export type Json = Record<string, unknown>;

// How a deal is matched and settled. Selects matcher/push/track behaviour.
export type InteractionKind =
  | 'marketplace'   // N providers, ranked options, demand picks one
  | 'auction'       // time-boxed simultaneous bids, ONE clearing event allocates
  | 'syndication'   // cooperative tranche-filling of ONE need, allocation sums to need
  | 'negotiation'   // bilateral offer→counter→agree/dispute loop
  | 'obligation'    // chain event auto-pushes a required action, no offer
  | 'submission';   // role applies to a single authority which grants/refuses

// One field on a term sheet or need profile. Drives the composer form + validation.
export interface FieldSpec {
  key: string;
  label: string;
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean';
  required?: boolean;
  unit?: string;                       // e.g. 'MWh', 'ZAR/MWh', 'months'
  options?: readonly string[];         // for type:'enum'
}

// A value-bearing term outside the headline price, possibly in another commodity.
export interface SweetenerSpec {
  key: string;                                          // e.g. 'carbon_rebate'
  label: string;
  value_kind: 'pct' | 'zar' | 'zar_per_mwh' | 'tco2e';
  cadence: 'once' | 'monthly' | 'quarterly' | 'annual';
  commodity: 'cash' | 'carbon' | 'rec' | 'energy';      // what it pays out in
  // converts one bundled sweetener to a ZAR-equivalent over the need's horizon
  toZarEquivalent: (sw: Json, need: Json, env: HonoBindings) => Promise<number>;
}

// A row of oe_deal_offers as seen by a matcher/scorer (term_sheet still raw JSON).
export interface OfferRow {
  id: string;
  deal_type: string;
  provider_id: string;
  provider_role: string;
  tenant_id: string;
  title: string;
  term_sheet: string;                  // JSON string — parse with parseTermSheet()
  request_id: string | null;
  // auction
  bid_amount_zar?: number | null;
  bid_quantity?: number | null;
  clearing_status?: string | null;
  cleared_quantity?: number | null;
  cleared_price_zar?: number | null;
  // syndication
  syndicate_id?: string | null;
  tranche_pct?: number | null;
  committed_amount_zar?: number | null;
  syndicate_role?: string | null;
  // negotiation
  counter_of?: string | null;
  counter_by_role?: string | null;
  decline_reason?: string | null;
  status: string;
  expiry?: string | null;
}

// Generalizes the existing OfftakerOption into a kind-agnostic scored option.
export interface ScoredOption {
  option_id: string;
  title: string;
  primary_metric: number | null;       // the headline number (e.g. blended price)
  est_value_zar: number | null;        // ranked value; null ⇒ withheld (price unknown)
  sweetener_value_zar: number;         // ZAR-equiv folded in from bundled sweeteners
  secondary: Json;                     // extra fields for the compare grid
  price_basis: PriceBasis;
  rationale: string;
}

export interface DealDescriptor {
  deal_type: string;                    // static key, e.g. 'energy_supply'
  kind: InteractionKind;
  initiator: 'provider' | 'demand';
  provider_roles: readonly string[];
  demand_roles: readonly string[];
  event_prefix: string;                 // fireCascade audit prefix, e.g. 'deal_energy'
  term_sheet_schema: FieldSpec[];
  need_schema: FieldSpec[];
  price_basis: PriceBasis;              // POPIA default for cross-tenant surfacing
  sweetener_schema?: SweetenerSpec[];
  matcher: (need: Json, offers: OfferRow[], env: HonoBindings) => Promise<OfferRow[]>;
  // Sync, pure ranking of one offer. Sweetener folding (async, env-bound) is applied
  // by the options route via valueSweeteners() — see §6 — then added into est_value_zar.
  scorer: (need: Json, offer: OfferRow) => ScoredOption;
  negotiation?: { counter_roles: readonly string[]; terminal_actions: readonly string[] };
  clearing?: { rule: 'pay_as_bid' | 'uniform_price' | 'merit_order'; window_close: 'timer' | 'manual' };
  allocation?: { basis: 'pro_rata' | 'lead_arranger' | 'waterfall'; min_tranche_pct: number };
  funds_objective?: { contributes: 'senior_debt' | 'mezz' | 'equity' | 'carbon_advance' | 'grant'; quantum_field: string };
  composition?: {
    conditions?: { on_deal_type: string; required_state: string }[];
    bundle?: { with_types: readonly string[] };
    substitutes?: { with_types: readonly string[] };
    back_to_back?: { spawn_type: string; to_role: string };
    novation?: { source_chain_keys: readonly string[] };
    rofr?: { rights_role: string; window_hours: number };
    pooling?: { min_members: number; aggregate_field: string };
  };
  // when true, accept runs pre-trade-guards.ts against the accepting party first.
  dispatch_is_trade?: boolean;
  accept_dispatch: {
    live:     { chain_key: string; endpoint: (caseSeed: Json) => string };
    upcoming: { loi: true } | null;
  };
}

// ── Registry ────────────────────────────────────────────────────────────────
const REGISTRY = new Map<string, DealDescriptor>();

export function registerDeal(d: DealDescriptor): void {
  REGISTRY.set(d.deal_type, d);          // last registration wins (idempotent re-import)
}

export function getDealDescriptor(type: string): DealDescriptor | null {
  return REGISTRY.get(type) ?? null;     // 404 on miss at the route layer
}

export function listDealDescriptors(): DealDescriptor[] {
  return [...REGISTRY.values()];
}

/** Test-only: drop all registrations so a test starts from a known state. */
export function _resetDealRegistryForTests(): void {
  REGISTRY.clear();
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Validates a term-sheet / need payload against a FieldSpec[]. Returns the list of
// human-readable errors (empty ⇒ valid). Used by the offer/request composer and by
// the route layer before persisting — never trust client-shaped JSON unchecked.
export function validateFields(schema: FieldSpec[], data: Json): string[] {
  const errors: string[] = [];
  for (const f of schema) {
    const v = data[f.key];
    const missing = v === undefined || v === null || v === '';
    if (missing) {
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    switch (f.type) {
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${f.label} must be a number`);
        break;
      case 'boolean':
        if (typeof v !== 'boolean') errors.push(`${f.label} must be true or false`);
        break;
      case 'string':
      case 'date':
        if (typeof v !== 'string') errors.push(`${f.label} must be text`);
        break;
      case 'enum':
        if (typeof v !== 'string' || !(f.options ?? []).includes(v)) {
          errors.push(`${f.label} must be one of: ${(f.options ?? []).join(', ')}`);
        }
        break;
    }
  }
  return errors;
}

export function parseTermSheet(offer: OfferRow): Json {
  try {
    const parsed = JSON.parse(offer.term_sheet) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Json) : {};
  } catch {
    return {};
  }
}

// Folds every sweetener bundled on an offer into a single ZAR-equivalent over the
// need's horizon, plus one rationale line per sweetener. The options route adds the
// returned `sweetener_value_zar` into the scored option's est_value_zar so a
// sweetened offer can out-rank a cheaper bare one (§3, §6).
export async function valueSweeteners(
  d: DealDescriptor,
  offer: OfferRow,
  need: Json,
  env: HonoBindings,
): Promise<{ sweetener_value_zar: number; lines: string[] }> {
  const specs = d.sweetener_schema;
  if (!specs || specs.length === 0) return { sweetener_value_zar: 0, lines: [] };
  const ts = parseTermSheet(offer);
  const bundled = Array.isArray(ts.sweeteners) ? (ts.sweeteners as Json[]) : [];
  if (bundled.length === 0) return { sweetener_value_zar: 0, lines: [] };

  let total = 0;
  const lines: string[] = [];
  for (const sw of bundled) {
    const spec = specs.find(s => s.key === (sw as Json).type || s.key === (sw as Json).key);
    if (!spec) continue;                 // unknown sweetener key — ignore, never trust client
    let zar = 0;
    try {
      zar = await spec.toZarEquivalent(sw, need, env);
    } catch {
      zar = 0;                           // valuation failure must not break ranking
    }
    if (!Number.isFinite(zar) || zar <= 0) continue;
    total += zar;
    lines.push(`+${spec.label}: R${Math.round(zar).toLocaleString('en-ZA')} over horizon`);
  }
  return { sweetener_value_zar: total, lines };
}

// ── Descriptor #1 — energy_supply (marketplace) ───────────────────────────────
// Delegates scoring to scoreEnergyOption() in offtaker-options.ts (the exact math
// behind the live GET /api/offtaker/options). No route consumes this yet.
const ENERGY_SUPPLY: DealDescriptor = {
  deal_type: 'energy_supply',
  kind: 'marketplace',
  initiator: 'provider',
  provider_roles: ['ipp_developer', 'trader'],
  demand_roles: ['offtaker'],
  event_prefix: 'deal_energy',
  price_basis: 'indicative',
  term_sheet_schema: [
    { key: 'offered_annual_mwh', label: 'Annual energy', type: 'number', required: true, unit: 'MWh' },
    { key: 'blended_price_zar_per_mwh', label: 'Blended price', type: 'number', unit: 'ZAR/MWh' },
    { key: 'cod_estimate', label: 'COD estimate', type: 'date' },
    { key: 'availability', label: 'Availability', type: 'enum', options: ['now', 'upcoming'] },
  ],
  need_schema: [
    { key: 'annual_kwh', label: 'Annual consumption', type: 'number', required: true, unit: 'kWh' },
    { key: 'avg_tariff_zar_per_kwh', label: 'Average tariff', type: 'number', required: true, unit: 'ZAR/kWh' },
  ],
  // Phase 0: identity matcher (real candidate selection is wired in Phase 1).
  matcher: async (_need, offers) => offers,
  scorer: (need, offer) => {
    const ts = parseTermSheet(offer);
    const bill = {
      annual_kwh: num((need as Json).annual_kwh) ?? 0,
      avg_tariff_zar_per_kwh: num((need as Json).avg_tariff_zar_per_kwh) ?? 0,
    };
    const availability = ts.availability === 'now' ? 'now' : 'upcoming';
    const scored = scoreEnergyOption(
      {
        option_id: offer.id,
        kind: 'project',
        title: offer.title,
        target_participant_id: offer.provider_id,
        availability,
        cod_estimate: typeof ts.cod_estimate === 'string' ? ts.cod_estimate : null,
        offered_annual_mwh: num(ts.offered_annual_mwh) ?? 0,
        price_basis: 'indicative',
        blended_price: num(ts.blended_price_zar_per_mwh),
      },
      bill,
    );
    return {
      option_id: scored.option_id,
      title: scored.title,
      primary_metric: scored.blended_price_zar_per_mwh,
      est_value_zar: scored.est_saving_zar,
      sweetener_value_zar: 0,            // route adds valueSweeteners() result
      secondary: {
        annual_mwh: scored.annual_mwh,
        est_annual_cost_zar: scored.est_annual_cost_zar,
        est_saving_pct: scored.est_saving_pct,
        co2_avoided_tco2e: scored.co2_avoided_tco2e,
        cod_estimate: scored.cod_estimate,
      },
      price_basis: scored.price_basis,
      rationale: scored.rationale,
    };
  },
  dispatch_is_trade: true,
  accept_dispatch: {
    live: { chain_key: 'ppa_contract', endpoint: () => '/api/ppa/contracts' },
    upcoming: { loi: true },
  },
};

let registered = false;

// Self-registers all built-in descriptors. Idempotent. Called from the registry
// barrel and from tests that need the energy descriptor present.
export function registerDealDescriptors(): void {
  if (registered) return;
  registerDeal(ENERGY_SUPPLY);
  registered = true;
}

registerDealDescriptors();
