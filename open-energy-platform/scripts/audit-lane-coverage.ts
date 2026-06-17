// One-off audit: which roles can ACT on a chain but have no LANE (invisible on
// Horizon + Atlas). Ground truth from the static MERIDIAN_CHAINS literal only.
// Run: node scripts/audit-lane-coverage.ts   (Node >=23 strips TS types natively)
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian.ts';

const ROLES = ['trader','ipp_developer','offtaker','lender','carbon_fund','regulator','grid_operator','support','epc_contractor','esums_owner'];

type Gap = { key: string; wave: number; title: string; role: string; actions: string[] };
const gaps: Gap[] = [];
const perRoleVisible: Record<string, number> = {};
const perRoleActable: Record<string, Set<string>> = {};
ROLES.forEach(r => { perRoleVisible[r] = 0; perRoleActable[r] = new Set(); });

let totalChains = 0;
for (const c of MERIDIAN_CHAINS) {
  totalChains++;
  const laneRoles = new Set(Object.keys(c.lanes || {}));
  for (const r of ROLES) if (laneRoles.has(r)) perRoleVisible[r]++;

  // roles that can act (from action.roles), excluding admin (sees everything)
  const actByRole: Record<string, string[]> = {};
  for (const a of c.actions || []) {
    for (const role of a.roles || []) {
      if (role === 'admin') continue;
      (actByRole[role] ??= []).push(a.action);
    }
  }
  for (const role of Object.keys(actByRole)) {
    if (ROLES.includes(role)) perRoleActable[role].add(c.key);
    if (!laneRoles.has(role) && ROLES.includes(role)) {
      gaps.push({ key: c.key, wave: c.wave, title: c.title, role, actions: actByRole[role] });
    }
  }
}

console.log(`\n=== MERIDIAN coverage audit — ${totalChains} chains ===\n`);
console.log('Per-role: visible(lanes) / actable(can act on)');
for (const r of ROLES) {
  console.log(`  ${r.padEnd(15)} visible=${String(perRoleVisible[r]).padStart(3)}  actable=${String(perRoleActable[r].size).padStart(3)}`);
}

console.log(`\n=== GAPS: role can ACT but has NO LANE (invisible) — ${gaps.length} ===`);
const byRole: Record<string, Gap[]> = {};
for (const g of gaps) (byRole[g.role] ??= []).push(g);
for (const r of Object.keys(byRole).sort()) {
  console.log(`\n  ${r}  (${byRole[r].length} invisible chains):`);
  for (const g of byRole[r].sort((a,b)=>a.wave-b.wave)) {
    console.log(`    W${g.wave} ${g.key.padEnd(34)} actions: ${g.actions.join(',')}`);
  }
}

// chains with zero lanes (orphan — nobody sees them)
const orphans = MERIDIAN_CHAINS.filter(c => Object.keys(c.lanes||{}).length === 0);
console.log(`\n=== ORPHAN chains (zero lanes — invisible to everyone): ${orphans.length} ===`);
for (const c of orphans) console.log(`    W${c.wave} ${c.key} (${c.title})`);
