// ═══════════════════════════════════════════════════════════════════════════
// Journeys — the role-based organisation of every chain opener + management
// screen into the domains a role actually works in. This is the "user
// journeys" layer: it turns the flat 142-chain registry into "here is what
// YOU do, grouped the way you think about it."
//
// Source of truth for the taxonomy is roleData.ts (human-curated role→domain→
// feature). We trust that curation for *visibility* — if a chain is in a role's
// journey, that role starts it. We do NOT re-gate on the chain's abstract
// party-roles (operator/buyer/developer/…): those are per-transaction party
// slots, not JWT roles, so `by.includes(jwtRole)` mis-gates ~40% of chains.
// The server is the real authorisation backstop on POST /txn.
//
// Two joins bridge roleData → v2:
//   roleAlias   JWT role (trader/ipp/…) → roleData role (ipp_developer/…)
//   v2Key       stale roleData chainKey → real v2 chain key (rename drift)
// Orphan slotting gives the 33 v2 chains no roleData feature references a home,
// so every one of the 142 chains is reachable through some journey — the
// "Other" catch-all then stays empty in practice (no noise), while still
// existing so nothing can ever be structurally hidden.
// ═══════════════════════════════════════════════════════════════════════════

import { getRoleConfig, type Feature } from '../ux-alternatives/launchpad-nav/roleData';
import { newEdges, type ChainMap, type ChainDecl, type TransitionDecl } from './decl';

// ── JWT role → roleData role ────────────────────────────────────────────────
const ROLE_ALIAS: Record<string, string> = {
  ipp: 'ipp_developer',
  wind: 'ipp_developer',
  carbon: 'carbon_fund',
  grid: 'grid_operator',
  esums_owner: 'esco',
};
export const roleAlias = (r: string): string => ROLE_ALIAS[r] ?? r;

// ── stale roleData chainKey → real v2 chain key ─────────────────────────────
// Verified: every value exists in the 142-chain v2 registry, every key exists
// in roleData. Keys NOT here (e.g. the ipp_* construction family) have no v2
// chain — they render as journey labels only, resolving to a /surface screen.
const CHAIN_REMAP: Record<string, string> = {
  ppa_contract_chain: 'ppa_contract',
  market_abuse_case: 'market_abuse',
  work_order: 'wo',
  om_work_order: 'wo',
  gca_connection: 'gca',
  trade_report: 'trade_reporting',
  imbalance_settlement: 'imbalance',
  demand_response_event: 'demand_response',
  credit_facility_application: 'credit_origination',
  ppa_take_or_pay: 'take_or_pay',
  support_tickets: 'support_ticket',
  kyc_verification: 'kyc',
  milestone_variance_report: 'milestone_variance',
  ipp_doc_control: 'ipp_document_control',
  procurement_rfp: 'procurement',
  crediting_period_renewal: 'crediting_renewal',
  green_bond_report: 'green_bond',
  green_tariff_disclosure: 'green_tariff',
  slb_kpi_ratchet: 'slb_kpi',
  carbon_scope3_disclosure: 'scope3_disclosure',
  problem_record: 'problem_management',
  algo_certification: 'algo_cert',
  cod_chain: 'cod',
  ppa_payment_security: 'payment_security',
  mrv_submissions: 'carbon_mrv',
  carbon_tax_return: 'carbon_tax',
  change_request: 'change_enablement',
  rez_capacity: 'grid_capacity_allocation',
};
export const v2Key = (chainKey: string): string => CHAIN_REMAP[chainKey] ?? chainKey;

// ── orphan slotting: the 33 v2 chains no roleData feature references ─────────
// Each gets (roleData role, domain label). Cross-cutting chains list under
// several roles. Domain labels reuse existing role-domain labels where possible
// so slots MERGE into the curated domain instead of spawning a duplicate.
interface OrphanSlot {
  chain: string;
  role: string; // roleData role
  domain: string; // domain label (merged case-insensitively)
}
const DOMAIN_COLOR: Record<string, string> = {
  'Risk & Margin': 'oklch(0.48 0.14 30)',
  'Active Trading': 'oklch(0.55 0.15 150)',
  Compliance: 'oklch(0.46 0.11 300)',
  Contracts: 'oklch(0.50 0.12 250)',
  Connection: 'oklch(0.50 0.14 230)',
  Monitoring: 'oklch(0.48 0.12 140)',
  'Carbon Compliance': 'oklch(0.52 0.13 160)',
  Enforcement: 'oklch(0.48 0.16 25)',
  POPIA: 'oklch(0.46 0.10 300)',
  Platform: 'oklch(0.46 0.02 250)',
  'Risk & Quality': 'oklch(0.48 0.14 30)',
  Finance: 'oklch(0.42 0.12 140)',
};
const ORPHAN_SLOTS: OrphanSlot[] = [
  { chain: 'capital_adequacy', role: 'trader', domain: 'Risk & Margin' },
  { chain: 'close_out_netting', role: 'trader', domain: 'Risk & Margin' },
  { chain: 'collateral_substitution', role: 'trader', domain: 'Risk & Margin' },
  { chain: 'security_margin', role: 'trader', domain: 'Risk & Margin' },
  { chain: 'isda_agreement', role: 'trader', domain: 'Risk & Margin' },
  { chain: 'tcpi', role: 'trader', domain: 'Risk & Margin' },
  { chain: 'cross_border_trade', role: 'trader', domain: 'Active Trading' },
  { chain: 'fsca_compliance', role: 'trader', domain: 'Compliance' },
  { chain: 'fsca_conduct_report', role: 'trader', domain: 'Compliance' },
  { chain: 'contract_execution', role: 'trader', domain: 'Contracts' },
  { chain: 'dispute_resolution', role: 'trader', domain: 'Contracts' },
  { chain: 'force_majeure_claim', role: 'trader', domain: 'Contracts' },
  { chain: 'connection_budget_quote', role: 'grid_operator', domain: 'Connection' },
  { chain: 'protection_relay', role: 'grid_operator', domain: 'Connection' },
  { chain: 'gtia', role: 'grid_operator', domain: 'Connection' },
  { chain: 'wayleave_consent', role: 'grid_operator', domain: 'Compliance' },
  { chain: 'disbursement', role: 'lender', domain: 'Monitoring' },
  { chain: 'facility_amendment', role: 'lender', domain: 'Monitoring' },
  { chain: 'cp_clearance', role: 'lender', domain: 'Monitoring' },
  { chain: 'esap_compliance', role: 'lender', domain: 'Monitoring' },
  { chain: 'esap_monitoring', role: 'lender', domain: 'Monitoring' },
  { chain: 'rec_device_registration', role: 'offtaker', domain: 'Carbon Compliance' },
  { chain: 'rec_issuance', role: 'offtaker', domain: 'Carbon Compliance' },
  { chain: 'sustainability_transaction', role: 'offtaker', domain: 'Carbon Compliance' },
  { chain: 'consultation_notice', role: 'offtaker', domain: 'Compliance' },
  { chain: 'cbt_sed', role: 'offtaker', domain: 'Carbon Compliance' },
  { chain: 'enforcement_action_s35', role: 'regulator', domain: 'Enforcement' },
  { chain: 'construction_cost_report', role: 'ipp_developer', domain: 'Finance' },
  { chain: 'environmental_authorisation', role: 'ipp_developer', domain: 'Risk & Quality' },
  { chain: 'audit', role: 'admin', domain: 'Platform' },
  { chain: 'subscription_billing', role: 'admin', domain: 'Platform' },
  { chain: 'data_breach_notification', role: 'admin', domain: 'POPIA' },
  { chain: 'data_subject_request', role: 'admin', domain: 'POPIA' },
];

// ── the journey model the surfaces consume ──────────────────────────────────
export interface JourneyStart {
  chainKey: string;
  chain: ChainDecl;
  edge: TransitionDecl; // the @new opener (first, if several)
  edges: TransitionDecl[]; // all openers (chains can have >1 way in)
  label: string; // feature label from roleData, else chain noun
}
export interface JourneyLink {
  key: string; // surface key (role:key) or route
  label: string;
  to: string; // resolved href
  description?: string;
}
export interface JourneyDomain {
  key: string;
  label: string;
  color: string;
  starts: JourneyStart[];
  links: JourneyLink[]; // management screens (projects, meters, portfolios…)
}

/** Resolve a roleData feature to its href when it is NOT a chain start. */
function featureHref(role: string, f: Feature): JourneyLink | null {
  if (f.route) return { key: f.route, label: f.label, to: f.route, description: f.description };
  // Non-chain, non-route → a /surface screen, only if one is registered.
  const key = `${role}:${f.key}`;
  if (SURFACE_KEYS.has(key)) {
    return { key, label: f.label, to: `/surface/${key}`, description: f.description };
  }
  return null;
}

/**
 * groupedStarts — the journey home screen for a JWT role: its domains, each
 * with the chain openers and management screens it owns. Domains come in
 * roleData order; orphan slots merge into the matching domain (by label) or
 * append. Every start is a real, openable v2 chain.
 */
export function groupedStarts(chains: ChainMap, jwtRole: string): JourneyDomain[] {
  const role = roleAlias(jwtRole);
  const cfg = getRoleConfig(role);
  const out: JourneyDomain[] = [];
  const seenChain = new Set<string>();

  const pushStart = (dom: JourneyDomain, chainKey: string, label?: string) => {
    if (seenChain.has(chainKey)) return;
    const chain = chains[chainKey];
    if (!chain) return;
    const edges = newEdges(chain);
    if (edges.length === 0) return; // no way to start it → not a start
    seenChain.add(chainKey);
    dom.starts.push({ chainKey, chain, edge: edges[0], edges, label: label || chain.noun });
  };

  for (const d of cfg?.domains ?? []) {
    const dom: JourneyDomain = { key: d.key, label: d.label, color: d.color, starts: [], links: [] };
    for (const f of d.features) {
      if (f.chainKey) pushStart(dom, v2Key(f.chainKey), f.label);
      else {
        const link = featureHref(role, f);
        if (link) dom.links.push(link);
      }
    }
    if (dom.starts.length || dom.links.length) out.push(dom);
  }

  // Merge orphan slots for this role into a matching domain, else append one.
  for (const slot of ORPHAN_SLOTS) {
    if (slot.role !== role) continue;
    let dom = out.find((o) => o.label.toLowerCase() === slot.domain.toLowerCase());
    if (!dom) {
      dom = { key: `orphan_${slot.domain}`, label: slot.domain, color: DOMAIN_COLOR[slot.domain] ?? 'oklch(0.46 0.02 250)', starts: [], links: [] };
      out.push(dom);
    }
    pushStart(dom, slot.chain);
  }

  // Catch-all: any startable chain NOT surfaced above whose openers name this
  // role directly. Almost always empty after slotting — the guarantee nothing
  // is ever structurally hidden, not a routine bucket.
  const other: JourneyDomain = { key: 'other', label: 'Other', color: 'oklch(0.46 0.02 250)', starts: [], links: [] };
  for (const [key, chain] of Object.entries(chains)) {
    if (seenChain.has(key)) continue;
    const edges = newEdges(chain);
    if (edges.some((e) => e.by.includes(jwtRole))) pushStart(other, key);
  }
  if (other.starts.length) out.push(other);

  return out;
}

/** Flat list of every startable chain across a role's journey — for palettes. */
export function roleStarts(chains: ChainMap, jwtRole: string): JourneyStart[] {
  return groupedStarts(chains, jwtRole).flatMap((d) => d.starts);
}

// ── the trade surface: the role's trading-shaped journey domains ─────────────
// Trade (/v2/trade) is not a separate taxonomy — it's the slice of THIS role's
// journey that is trading/markets/margin/settlement/contracts. Derived from
// roleData domain labels, not a chain-key regex (the old TRADE_RE mis-grouped).
const TRADE_DOMAIN_RE = /trad|market|position|margin|order|auction|hedge|deal|contract|settlement/i;
export function tradeStarts(chains: ChainMap, jwtRole: string): JourneyDomain[] {
  return groupedStarts(chains, jwtRole).filter(
    (d) => TRADE_DOMAIN_RE.test(d.label) || TRADE_DOMAIN_RE.test(d.key),
  );
}
/** Does this role trade at all? Drives whether the Trade nav item shows. */
export function hasTrade(chains: ChainMap, jwtRole: string): boolean {
  return tradeStarts(chains, jwtRole).some((d) => d.starts.length > 0);
}

// SURFACE_REGISTRY keys, mirrored from meridian/surfaces.tsx. Kept as a literal
// set so starts.ts imports nothing from the Meridian chrome (which pulls the
// whole legacy tree). A management link only shows if its screen is registered.
// ponytail: hand-mirrored; a stale entry just hides one link, never crashes.
const SURFACE_KEYS = new Set<string>([
  'admin:anomaly_admin','admin:billing','admin:contracts_admin','admin:cron','admin:erp_connectors',
  'admin:fault_fingerprint_admin','admin:filing_connectors','admin:flags','admin:journeys','admin:market_halt',
  'admin:marketplace','admin:monitoring','admin:pii_access','admin:platform_audit','admin:popia',
  'admin:reconciliation_attestation','admin:reports','admin:rul_prediction_admin','admin:settlement_audit',
  'admin:settlement_rails','admin:subscription_billing','admin:tenant_events','admin:users',
  'carbon_fund:audit','carbon_fund:certificates','carbon_fund:doc_studio','carbon_fund:mrv','carbon_fund:reports','carbon_fund:vintages',
  'epc_contractor:audit','epc_contractor:rfis',
  'esco:accruals','esco:alerts','esco:audit','esco:cockpit','esco:devices','esco:faults','esco:ingestion',
  'esco:integrations','esco:maintenance','esco:opportunities','esco:parts','esco:predictions','esco:projects',
  'esco:sites','esco:technicians','esco:workorders',
  'grid_operator:ancillary','grid_operator:audit','grid_operator:curtailment','grid_operator:market_rules',
  'grid_operator:nersa_reporting','grid_operator:outage','grid_operator:reports','grid_operator:scada','grid_operator:wheeling_charges',
  'ipp_developer:annual_report','ipp_developer:audit','ipp_developer:community','ipp_developer:gtia','ipp_developer:insurance',
  'ipp_developer:integrations','ipp_developer:invite_partners','ipp_developer:issues_log','ipp_developer:lessons_learned',
  'ipp_developer:milestones','ipp_developer:plant_revenue','ipp_developer:projects','ipp_developer:reports',
  'ipp_developer:risk_register','ipp_developer:scada','ipp_developer:schedule','ipp_developer:stakeholder_register',
  'lender:audit','lender:benchmark_lender','lender:carbon_lender','lender:concentrations','lender:covenant_reports',
  'lender:doc_studio','lender:dunning','lender:facilities','lender:facility_reports','lender:ie_certifications',
  'lender:lender_risk','lender:portfolio','lender:reports',
  'offtaker:annual_reports','offtaker:audit','offtaker:billing','offtaker:bills','offtaker:budgets','offtaker:credit_support',
  'offtaker:delivery_reports','offtaker:energy_cost','offtaker:metering','offtaker:obligations','offtaker:ppa_portfolio',
  'offtaker:procurement_options','offtaker:rec_retirement','offtaker:reports','offtaker:scope2','offtaker:settlement_bills',
  'offtaker:sites','offtaker:tariffs','offtaker:wheeling',
  'regulator:audit','regulator:enforcement','regulator:government_filing','regulator:icfr_attestations','regulator:inbox',
  'regulator:licences','regulator:notices','regulator:reports','regulator:surveillance',
  'support:anomaly_ml','support:audit','support:cross_tenant','support:escalations','support:fault_ml','support:mqtt_opcua',
  'support:reports','support:rul_ml','support:tickets',
  'trader:audit','trader:exceptions','trader:margin','trader:oe_mm_obligations','trader:orders','trader:positions',
  'trader:rejections','trader:reports','trader:risk','trader:trades',
]);
