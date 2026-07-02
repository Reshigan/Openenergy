// pages/src/meridian/journeys.ts — the journey taxonomy.
// ONE journey-shaped workspace replaces Horizon/Atlas/Ledger/Thread. A journey is
// an OUTCOME a role works toward; every reachable tool lands in exactly one journey
// (zero orphans), so nothing needs a separate menu. Journeys derive from:
//   • the role's roleData domains (each domain → a journey covering its features —
//     chains, surfaces and standalone pages), PLUS
//   • the cross-cutting sections (Deals / ESG / Reports / Intelligence / National)
//     the role can see, folded in as their own journeys.
// Icons are custom-icon KEYS (rendered by JourneyIcon) — never emoji.
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { QUICKLINKS, quicklinkVisible } from './quicklinks';

export type IconKey =
  | 'today' | 'finance' | 'deliver' | 'sell' | 'comply' | 'operate'
  | 'trade' | 'risk' | 'settle' | 'watch' | 'license' | 'tariff'
  | 'deals' | 'esg' | 'reports' | 'insight' | 'national' | 'admin'
  | 'grid' | 'carbon' | 'people' | 'more';

export interface Journey {
  key: string;
  label: string;            // outcome language (from the domain/section label)
  icon: IconKey;
  domainKeys: string[];     // roleData domain keys this journey covers ([] for a route-only section)
  route?: string;           // cross-cutting sections open a standalone route for now
}

export interface RoleJourneys {
  journeys: Journey[];
  // The role's primary createable entity — drives the cockpit "Start › New X".
  primaryEntity: { label: string; verb: string };
}

// Heuristic: a custom-icon key for a domain, from its key/label keywords.
function iconForDomain(key: string, label: string): IconKey {
  const s = `${key} ${label}`.toLowerCase();
  if (/financ|fund|capital|loan|draw|covenant|reserve|credit|disburs/.test(s)) return 'finance';
  if (/complian|regulat|esap|grid code|licen|audit|legal|govern|popia/.test(s)) return 'comply';
  if (/deliver|construct|commission|cod|project|schedul|epc|milestone/.test(s)) return 'deliver';
  if (/operat|o&m|asset|work order|mainten|spare|prognost|fault/.test(s)) return 'operate';
  if (/ppa|offtake|nominat|sell|power|energy sale|take.?or.?pay|wheel/.test(s)) return 'sell';
  if (/trade|trading|order|match|position|book|execution/.test(s)) return 'trade';
  if (/risk|margin|limit|var|exposure|clearing|default/.test(s)) return 'risk';
  if (/settle|payment|invoice|reconcil|clearing|billing/.test(s)) return 'settle';
  if (/surveil|abuse|enforc|inspection|monitor|case/.test(s)) return 'watch';
  if (/tariff|determination|indexation|pricing/.test(s)) return 'tariff';
  if (/grid|dispatch|curtail|connection|ancillary|capacity/.test(s)) return 'grid';
  if (/carbon|emission|mrv|offset|credit|article 6|retire/.test(s)) return 'carbon';
  if (/tenant|user|member|stakeholder|community|people|support|ticket/.test(s)) return 'people';
  return 'more';
}

const CROSS_CUTTING: { route: string; icon: IconKey }[] = [
  { route: '/deals', icon: 'deals' },
  { route: '/esg', icon: 'esg' },
  { route: '/reports', icon: 'reports' },
  { route: '/intelligence', icon: 'insight' },
  { route: '/dashboard', icon: 'national' },
];

// The role's primary 'new X' (drives Start). Mirrors the onboarding first-entity step.
const PRIMARY_ENTITY: Record<string, { label: string; verb: string }> = {
  ipp_developer: { label: 'project', verb: 'Register' },
  esco:          { label: 'site', verb: 'Add' },
  esums_owner:   { label: 'site', verb: 'Add' },
  epc_contractor:{ label: 'work package', verb: 'Create' },
  trader:        { label: 'order', verb: 'Place' },
  lender:        { label: 'facility', verb: 'Originate' },
  offtaker:      { label: 'PPA', verb: 'Start' },
  carbon_fund:   { label: 'carbon project', verb: 'Register' },
  grid_operator: { label: 'dispatch instruction', verb: 'Issue' },
  regulator:     { label: 'licence application', verb: 'Open' },
  support:       { label: 'ticket', verb: 'Log' },
  admin:         { label: 'tenant', verb: 'Provision' },
};

// Outcome model: collapse a role's roleData domains into a small set of OUTCOMES
// (≤5 + Today), named in outcome language. Each outcome bundles one or more domain
// keys; the union of a role's outcome domainKeys is a complete partition of its
// domains, so every feature (chain/surface/page) still has a journey home. Any
// domain not named here is appended as its own journey by getJourneys (safety net),
// so coverage can never silently regress — see journey-taxonomy.test.ts.
interface Outcome { key: string; label: string; icon: IconKey; domainKeys: string[] }
const OUTCOME_MAP: Record<string, Outcome[]> = {
  trader: [
    { key: 'trade', label: 'Trade', icon: 'trade', domainKeys: ['active_trading'] },
    { key: 'clear', label: 'Clear', icon: 'risk', domainKeys: ['risk_margin'] },
    { key: 'settle', label: 'Settle', icon: 'settle', domainKeys: ['post_trade'] },
    { key: 'report', label: 'Report', icon: 'reports', domainKeys: ['compliance_reporting'] },
  ],
  lender: [
    { key: 'originate', label: 'Originate', icon: 'finance', domainKeys: ['origination'] },
    { key: 'monitor', label: 'Monitor', icon: 'watch', domainKeys: ['monitoring', 'risk_lender'] },
    { key: 'resolve', label: 'Resolve', icon: 'risk', domainKeys: ['enforcement'] },
    { key: 'report', label: 'Report', icon: 'reports', domainKeys: ['reporting_lender'] },
  ],
  ipp_developer: [
    { key: 'build', label: 'Build', icon: 'deliver', domainKeys: ['project_controls', 'construction', 'documents', 'safety_grid'] },
    { key: 'fund', label: 'Fund', icon: 'finance', domainKeys: ['finance'] },
    { key: 'comply', label: 'Comply', icon: 'comply', domainKeys: ['regulatory_risk', 'environmental'] },
    { key: 'operate', label: 'Operate', icon: 'operate', domainKeys: ['risk_quality', 'predictive_ml'] },
  ],
  offtaker: [
    { key: 'contract', label: 'Contract', icon: 'sell', domainKeys: ['contracts'] },
    { key: 'deliver', label: 'Deliver', icon: 'deliver', domainKeys: ['operations_offtaker'] },
    { key: 'secure', label: 'Secure', icon: 'finance', domainKeys: ['security_offtaker'] },
    { key: 'report', label: 'Report', icon: 'reports', domainKeys: ['compliance_offtaker', 'reporting_offtaker'] },
  ],
  carbon_fund: [
    { key: 'develop', label: 'Develop', icon: 'carbon', domainKeys: ['project_pipeline'] },
    { key: 'verify', label: 'Verify', icon: 'comply', domainKeys: ['mrv_verification'] },
    { key: 'issue', label: 'Issue', icon: 'finance', domainKeys: ['issuance_registry', 'article6_compliance'] },
    { key: 'retire', label: 'Retire', icon: 'settle', domainKeys: ['retirement_offset', 'trading_markets'] },
  ],
  grid_operator: [
    { key: 'dispatch', label: 'Dispatch', icon: 'grid', domainKeys: ['operations_grid'] },
    { key: 'connect', label: 'Connect', icon: 'grid', domainKeys: ['connections'] },
    { key: 'comply', label: 'Comply', icon: 'comply', domainKeys: ['compliance_grid'] },
  ],
  support: [
    { key: 'resolve', label: 'Resolve', icon: 'people', domainKeys: ['itil_service_mgmt'] },
    { key: 'dispatch', label: 'Dispatch', icon: 'operate', domainKeys: ['field_operations'] },
    { key: 'supply', label: 'Supply', icon: 'more', domainKeys: ['oem_supply_chain'] },
    { key: 'assure', label: 'Assure', icon: 'comply', domainKeys: ['platform_ops'] },
  ],
  regulator: [
    { key: 'license', label: 'License', icon: 'license', domainKeys: ['licensing'] },
    { key: 'enforce', label: 'Enforce', icon: 'watch', domainKeys: ['enforcement_regulator'] },
    { key: 'tariff', label: 'Tariff', icon: 'tariff', domainKeys: ['tariff_determinations'] },
    { key: 'report', label: 'Report', icon: 'reports', domainKeys: ['levies', 'data_reporting'] },
  ],
  admin: [
    { key: 'provision', label: 'Provision', icon: 'people', domainKeys: ['tenants_users'] },
    { key: 'operate', label: 'Operate', icon: 'operate', domainKeys: ['platform_admin', 'trading_admin'] },
    { key: 'assure', label: 'Assure', icon: 'comply', domainKeys: ['compliance_admin'] },
    { key: 'integrate', label: 'Integrate', icon: 'more', domainKeys: ['integrations', 'platform_intelligence'] },
  ],
  esco: [
    { key: 'operate', label: 'Operate', icon: 'operate', domainKeys: ['operations', 'site_portfolio'] },
    { key: 'maintain', label: 'Maintain', icon: 'deliver', domainKeys: ['work_orders', 'supply_chain'] },
    { key: 'predict', label: 'Predict', icon: 'insight', domainKeys: ['asset_health'] },
    { key: 'assure', label: 'Assure', icon: 'comply', domainKeys: ['safety', 'data_integrations', 'reporting'] },
  ],
  epc_contractor: [
    { key: 'deliver', label: 'Deliver', icon: 'deliver', domainKeys: ['document_control', 'site_setup'] },
    { key: 'assure', label: 'Assure', icon: 'comply', domainKeys: ['quality', 'safety'] },
    { key: 'handover', label: 'Handover', icon: 'settle', domainKeys: ['handover'] },
  ],
};
// esums_owner shares the ESCO/O&M domain set and outcomes.
OUTCOME_MAP.esums_owner = OUTCOME_MAP.esco;
OUTCOME_MAP.epc = OUTCOME_MAP.epc_contractor;

// Build the role's complete journey set. Outcome-led: a role's domains collapse into
// its ≤5 named outcomes; any domain the outcome map doesn't name is appended as its
// own journey so nothing is lost (zero-orphan). Visible cross-cutting sections append
// last. Coverage is asserted by journey-taxonomy.test.ts.
export function getJourneys(role: string): RoleJourneys {
  const cfg = getRoleConfig(role);
  const domains = cfg?.domains ?? [];
  const domainKeySet = new Set(domains.map(d => d.key));
  const journeys: Journey[] = [];
  const covered = new Set<string>();

  const outcomes = OUTCOME_MAP[role];
  if (outcomes) {
    for (const o of outcomes) {
      // Keep only domain keys that actually exist for this role (defensive).
      const keys = o.domainKeys.filter(k => domainKeySet.has(k));
      if (!keys.length) continue;
      keys.forEach(k => covered.add(k));
      journeys.push({ key: o.key, label: o.label, icon: o.icon, domainKeys: keys });
    }
  }
  // Safety net: any domain not folded into an outcome becomes its own journey, so
  // no feature is ever stranded outside the journey model.
  for (const d of domains) {
    if (covered.has(d.key)) continue;
    journeys.push({ key: d.key, label: d.label, icon: iconForDomain(d.key, d.label), domainKeys: [d.key] });
  }
  for (const cc of CROSS_CUTTING) {
    if (!quicklinkVisible(role, cc.route)) continue;
    const label = QUICKLINKS.find(q => q.to === cc.route)?.label ?? cc.route;
    journeys.push({ key: `x:${cc.route}`, label, icon: cc.icon, domainKeys: [], route: cc.route });
  }
  return {
    journeys,
    primaryEntity: PRIMARY_ENTITY[role] ?? { label: 'record', verb: 'Create' },
  };
}

// Coverage check (used by tests): every reachable domain key for the role appears
// in exactly one journey — proves no tool is orphaned out of the journey model.
export function journeyCoversAllDomains(role: string): boolean {
  const cfg = getRoleConfig(role);
  const domainKeys = new Set((cfg?.domains ?? []).map(d => d.key));
  const covered = new Set(getJourneys(role).journeys.flatMap(j => j.domainKeys));
  for (const k of domainKeys) if (!covered.has(k)) return false;
  return true;
}
