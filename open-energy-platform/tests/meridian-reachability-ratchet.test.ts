import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian';
import { ROLES } from '../pages/src/ux-alternatives/launchpad-nav/roleData';

const QUARANTINE = 'tests/meridian-known-unreachable.json';

const surfaceRole = (r: string) => (r === 'esums_owner' ? 'esco' : r);

// --- ground truth sources ---
const chainKeys = new Set(MERIDIAN_CHAINS.map((c) => c.key));

// SURFACE_REGISTRY composite keys: '<role>:<key>' — key segment may contain hyphens.
const surfacesSrc = readFileSync('pages/src/meridian/surfaces.tsx', 'utf8');
const surfaceKeys = new Set<string>();
for (const m of surfacesSrc.matchAll(/['"]([a-z_]+:[a-z0-9_-]+)['"]\s*:/g)) surfaceKeys.add(m[1]);

// Mounted routes from App.tsx: collect every <Route path="...">.
const appSrc = readFileSync('pages/src/App.tsx', 'utf8');
const routePaths: string[] = [];
for (const m of appSrc.matchAll(/path=['"]([^'"]+)['"]/g)) routePaths.push(m[1]);

function routeMounted(route: string): boolean {
  const want = route.split('?')[0].split('/').filter(Boolean);
  return routePaths.some((p) => {
    const have = p.split('/').filter(Boolean);
    if (have.length !== want.length) return false;
    return have.every((seg, i) => seg.startsWith(':') || seg === want[i]);
  });
}

type Broken = { role: string; key: string; kind: 'dangling' | 'route-dead' | 'dead' };

function computeBroken(): Broken[] {
  const out: Broken[] = [];
  for (const cfg of ROLES) {
    const role = (cfg as { role?: string; key?: string }).role
      ?? (cfg as { key?: string }).key
      ?? '';
    for (const d of cfg.domains ?? []) {
      for (const f of d.features ?? []) {
        if (f.chainKey) {
          if (!chainKeys.has(f.chainKey)) out.push({ role, key: f.key, kind: 'dangling' });
        } else if (f.route) {
          if (!routeMounted(f.route)) out.push({ role, key: f.key, kind: 'route-dead' });
        } else if (!surfaceKeys.has(`${surfaceRole(role)}:${f.key}`)) {
          out.push({ role, key: f.key, kind: 'dead' });
        }
      }
    }
  }
  return out;
}

const sortKey = (b: Broken) => `${b.role}|${b.key}|${b.kind}`;

describe('meridian reachability ratchet', () => {
  it('every tile resolves, or is in the shrink-only quarantine', () => {
    const broken = computeBroken().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    if (process.env.SEED) {
      writeFileSync(QUARANTINE, JSON.stringify(broken, null, 2) + '\n');
      console.log(`SEEDED ${broken.length} quarantined tiles`);
      return;
    }

    const quarantine: Broken[] = JSON.parse(readFileSync(QUARANTINE, 'utf8'));
    const brokenSet = new Set(broken.map(sortKey));
    const quarSet = new Set(quarantine.map(sortKey));

    // dangling / route-dead must NEVER exist — those are hard regressions.
    const hardRegressions = broken.filter((b) => b.kind !== 'dead');
    expect(hardRegressions, `dangling/route-dead tiles introduced: ${JSON.stringify(hardRegressions)}`)
      .toEqual([]);

    // New broken tiles not in the quarantine = regression.
    const newlyBroken = broken.filter((b) => !quarSet.has(sortKey(b)));
    expect(newlyBroken, `new unreachable tiles (add a surface or fix the tile): ${JSON.stringify(newlyBroken)}`)
      .toEqual([]);

    // Quarantine entries that now resolve must be removed (ratchet shrinks).
    const stale = quarantine.filter((b) => !brokenSet.has(sortKey(b)));
    expect(stale, `quarantine lists tiles that now resolve — delete them from ${QUARANTINE}: ${JSON.stringify(stale)}`)
      .toEqual([]);
  });
});
