// For every (role, chain) where the chain's lanes now include role, check
// whether that role can ACT (appears in some action.roles) or is the chain's
// natural counterparty. A lane with neither => the role only ever sees a
// read-only case that still competes for a top-8 duty-stream slot (noise).
// Read-only; ground truth from the static MERIDIAN_CHAINS literal.
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian.ts';

const LIVE = new Set(['esco', 'ipp_developer', 'offtaker', 'regulator', 'trader', 'grid_operator', 'carbon_fund', 'lender', 'support', 'admin']);

type Row = { wave: number; chain: string; role: string; lane: string; canAct: boolean; actionRoles: string[] };
const noAct: Row[] = [];

for (const c of MERIDIAN_CHAINS as any[]) {
  const lanes = c.lanes || {};
  const actionRoles = new Set<string>();
  for (const a of c.actions || []) for (const r of a.roles || []) actionRoles.add(r);
  for (const role of Object.keys(lanes)) {
    if (!LIVE.has(role)) continue;
    const canAct = actionRoles.has(role);
    if (!canAct) {
      noAct.push({ wave: c.wave, chain: c.key, role, lane: lanes[role], canAct, actionRoles: [...actionRoles] });
    }
  }
}

console.log(`\n=== laned roles that CANNOT act on the chain (read-only duty-stream entries) — ${noAct.length} ===\n`);
for (const r of noAct.sort((a, b) => a.role.localeCompare(b.role) || a.wave - b.wave)) {
  console.log(`  ${r.role.padEnd(14)} W${String(r.wave).padEnd(4)} ${r.chain.padEnd(30)} lane=${r.lane.padEnd(22)} actionRoles=[${r.actionRoles.join(',')}]`);
}
