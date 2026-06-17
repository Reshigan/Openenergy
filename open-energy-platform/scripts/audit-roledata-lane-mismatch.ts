// Precise coverage audit: a feature is declared for a role in roleData.ts
// (role.domains[].features[].chainKey) but the chain's lanes map omits that
// role — so Meridian's chainsForRole() (filters on lanes[role]) hides it.
// This is the exact "features not on each role" gap. Read-only; ground truth
// from the two static literals.
// Run: node scripts/audit-roledata-lane-mismatch.ts
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian.ts';
import { ROLES as ROLE_CONFIGS } from '../pages/src/ux-alternatives/launchpad-nav/roleData.ts';

// chainKey -> chain (lanes live here)
const byKey = new Map<string, any>();
for (const c of MERIDIAN_CHAINS) byKey.set(c.key, c);

type Miss = { role: string; chainKey: string; domain: string; feature: string; wave: number; laneRoles: string[] };
const misses: Miss[] = [];
const noChain: { role: string; chainKey: string; feature: string }[] = [];

for (const cfg of ROLE_CONFIGS as any[]) {
  const role = cfg.role;
  for (const dom of cfg.domains || []) {
    for (const f of dom.features || []) {
      if (!f.chainKey) continue;            // non-chain surface — not a lane concern
      const chain = byKey.get(f.chainKey);
      if (!chain) { noChain.push({ role, chainKey: f.chainKey, feature: f.key }); continue; }
      const laneRoles = Object.keys(chain.lanes || {});
      if (!laneRoles.includes(role)) {
        misses.push({ role, chainKey: f.chainKey, domain: dom.key, feature: f.key, wave: chain.wave, laneRoles });
      }
    }
  }
}

console.log(`\n=== roleData declares a chain feature, but chain.lanes omits that role (INVISIBLE) — ${misses.length} ===\n`);
const byRole: Record<string, Miss[]> = {};
for (const m of misses) (byRole[m.role] ??= []).push(m);
for (const r of Object.keys(byRole).sort()) {
  console.log(`  ${r}  (${byRole[r].length}):`);
  for (const m of byRole[r].sort((a, b) => a.wave - b.wave)) {
    console.log(`    W${String(m.wave).padEnd(4)} ${m.chainKey.padEnd(30)} domain=${m.domain.padEnd(18)} lanes=[${m.laneRoles.join(',')}]`);
  }
  console.log('');
}

console.log(`=== roleData references a chainKey NOT in MERIDIAN_CHAINS (no chain) — ${noChain.length} ===`);
const ncByRole: Record<string, string[]> = {};
for (const n of noChain) (ncByRole[n.role] ??= []).push(n.chainKey);
for (const r of Object.keys(ncByRole).sort()) console.log(`  ${r}: ${[...new Set(ncByRole[r])].join(', ')}`);
