// Inverse of audit-lane-actionability: for every chain, find LIVE roles that CAN
// act (appear in some action.roles) but have NO lane on that chain. Such a role
// can never SEE the case in Horizon (chainsForRole filters by lane), so it can
// never reach the action — a broken workflow and a real go-live defect.
// Read-only; ground truth from the static MERIDIAN_CHAINS literal.
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian.ts';

// Action-role aliases the registry uses that map onto a live Horizon role.
// e.g. an action tagged `ipp` is actable by the ipp_developer persona.
const ALIAS: Record<string, string> = {
  ipp: 'ipp_developer', funder: 'lender', om: 'esco', esums: 'esco',
  carbon: 'carbon_fund', grid: 'grid_operator', compliance: 'regulator',
};
const LIVE = new Set(['esco', 'ipp_developer', 'offtaker', 'regulator', 'trader', 'grid_operator', 'carbon_fund', 'lender', 'support', 'admin']);
const norm = (r: string) => ALIAS[r] ?? r;

type Row = { wave: number; chain: string; role: string; actions: string[]; lanedRoles: string[] };
const gaps: Row[] = [];

for (const c of MERIDIAN_CHAINS as any[]) {
  const lanedRoles = new Set(Object.keys(c.lanes || {}).map(norm));
  // role -> which action verbs it can perform
  const actByRole = new Map<string, string[]>();
  for (const a of c.actions || []) {
    for (const raw of a.roles || []) {
      const role = norm(raw);
      if (!LIVE.has(role)) continue;
      (actByRole.get(role) ?? actByRole.set(role, []).get(role)!).push(a.action);
    }
  }
  for (const [role, verbs] of actByRole) {
    if (!lanedRoles.has(role)) {
      gaps.push({ wave: c.wave, chain: c.key, role, actions: verbs, lanedRoles: [...lanedRoles] });
    }
  }
}

console.log(`\n=== roles that CAN ACT but have NO lane (invisible-in-Horizon defects) — ${gaps.length} ===\n`);
for (const g of gaps.sort((a, b) => a.role.localeCompare(b.role) || a.wave - b.wave)) {
  console.log(`  ${g.role.padEnd(14)} W${String(g.wave).padEnd(4)} ${g.chain.padEnd(30)} canDo=[${g.actions.join(',')}] lanedTo=[${g.lanedRoles.join(',')}]`);
}
