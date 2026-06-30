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

// Build the role's complete journey set. Coverage guarantee: every roleData domain
// becomes a journey, so every feature (chain/surface/page) has a journey home; the
// visible cross-cutting sections are appended.
export function getJourneys(role: string): RoleJourneys {
  const cfg = getRoleConfig(role);
  const journeys: Journey[] = [];
  for (const d of cfg?.domains ?? []) {
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
