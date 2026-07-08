// open-energy-platform/scripts/audit-role-depth.mjs
// Mechanical, read-only depth audit. Reads roleData + MERIDIAN_CHAINS + SURFACE_REGISTRY
// and emits docs/operations/ROLE_DEPTH_MATRIX.md. No opinion, no guessing — every
// verdict is derived from a signal present in these three files (spec honesty rule).
//
// Real-shape notes (verified against source before writing this script):
// - roleData.ts does NOT interleave `role: '...'` with feature blocks. Features live in
//   separately-named `const <name>Domains: Domain[] = [...]` consts; the late
//   `export const ROLES: RoleConfig[] = [...]` array binds each `role: '...'` to a
//   `domains: <name>Domains` reference. We join role -> domains-var -> feature block.
// - Domain-header objects (`{ key, label, icon, color, features: [...] }`) share the
//   same `key:`/`label:` shape as feature objects, so they must be excluded. Only
//   domain headers carry `icon:` immediately after `label:` — a negative lookahead
//   anchored to the comma (not preceded by a greedy `\s*`, which the regex engine can
//   backtrack around) tells them apart.
// - chain-registry-meridian.ts quotes VALUES only; property names (`key`, `wave`,
//   `table`, ...) are bare identifiers. `ActionFieldSpec` objects nested inside
//   `actions[].fields[]` also carry a `key:` (e.g. `reason_code`), so a naive
//   `key: '...'` scan over-collects by >20x. Real ChainDescriptor entries are the only
//   ones where `key: '...'` is immediately followed by `, wave: <number>` — that pair
//   is unique to the top-level descriptor per the ChainDescriptor interface.
// - surfaces.tsx registers keys with hyphens on both sides of the colon (e.g.
//   `'lender:strate-swift'`); a `[a-z0-9_]+` character class misses those and produces
//   false dead-tiles.
// - `esums_owner` is a real, separate role slug, but SURFACE_REGISTRY only registers
//   its tiles under the `esco:` prefix (mirrors `laneRoleFor()` in src/routes/horizon.ts:
//   "esums_owner is a registerable O&M role that shares ESCO's chain lanes"). Surface
//   lookups for esums_owner must remap to esco first or every esums_owner surface tile
//   false-positives as dead-tile.
// - Some features carry a `route: '...'` instead of (or in addition to) a chainKey —
//   standalone routed pages (e.g. `/esg`, `/dashboard`, `/admin/revenue`). These
//   resolve to a real page, so they are not dead-tile, but no chain/state-machine
//   signal is derivable for them here — they land as 'routed' (L?), not thin-card,
//   since thin-card asserts an L2-L3 depth this audit did not measure.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const R = (p) => resolve(here, '..', p);

const roleData = readFileSync(R('pages/src/ux-alternatives/launchpad-nav/roleData.ts'), 'utf8');
const chains = readFileSync(R('src/utils/chain-registry-meridian.ts'), 'utf8');
const surfaces = readFileSync(R('pages/src/meridian/surfaces.tsx'), 'utf8');

// Chain keys present in MERIDIAN_CHAINS (L3 candidate: state machine + lanes + actions).
// Anchored on `wave:` — the property that only exists on top-level ChainDescriptor
// entries, not on nested ActionFieldSpec `key:` props.
const chainKeys = new Set(
  [...chains.matchAll(/key:\s*['"]([a-z0-9_]+)['"],\s*wave:\s*\d+/g)].map((m) => m[1])
);

// Surface keys registered as '<role>:<key>' (Bucket-B: L2-L3). Hyphens allowed on
// both sides — real keys like 'lender:strate-swift' use them.
const surfaceKeys = new Set(
  [...surfaces.matchAll(/['"]([a-z0-9_-]+:[a-z0-9_-]+)['"]/gi)].map((m) => m[1])
);

// esums_owner shares ESCO's surface registrations (mirrors laneRoleFor in
// src/routes/horizon.ts). Only remapping needed: esums_owner -> esco.
const laneRoleFor = (role) => (role === 'esums_owner' ? 'esco' : role);

// Step 1: pull every `const <name>Domains: Domain[] = [...]` block by name.
const domBlocks = {};
for (const m of roleData.matchAll(/const (\w+)Domains: Domain\[\] = (\[[\s\S]*?\n\]);/g)) {
  domBlocks[m[1]] = m[2];
}

// Step 2: pull role -> domains-var-name pairs from the ROLES array section only
// (scoping avoids matching stray `role:`-shaped text earlier in the file).
const rolesSection = roleData.slice(roleData.indexOf('export const ROLES'));
const roleMap = [...rolesSection.matchAll(/role:\s*['"]([a-z_]+)['"][\s\S]*?domains:\s*(\w+)Domains,/g)].map(
  (m) => [m[1], m[2]]
);

// Step 3: within each role's joined domain block, extract feature objects, excluding
// domain-header objects (which have `icon:` right after `label:`).
const featRe =
  /\{\s*key:\s*['"]([a-z0-9_-]+)['"],\s*label:\s*['"][^'"]*['"],(?!\s*icon:)\s*(?:chainKey:\s*['"]([a-z0-9_]+)['"])?(?:[^}]*?route:\s*['"]([^'"]+)['"])?/g;

function classify(role, featKey, chainKey, route) {
  const chained = chainKey && chainKeys.has(chainKey);
  const asSurface = surfaceKeys.has(`${laneRoleFor(role)}:${featKey}`);
  if (chained) return { L: 'L3', verdict: 'journey-ready' };
  if (asSurface) return { L: 'L2–L3', verdict: 'thin-card' };
  if (route) return { L: 'L?', verdict: 'routed' }; // route-only: unmeasured depth, not asserted L2
  return { L: 'L1', verdict: 'dead-tile' };
}

const rows = [];
for (const [role, varName] of roleMap) {
  const block = domBlocks[varName];
  if (!block) continue; // no domains block found for this role's var name
  for (const [, featKey, chainKey, route] of block.matchAll(featRe)) {
    const { L, verdict } = classify(role, featKey, chainKey, route);
    rows.push({ role, feature: featKey, L, verdict });
  }
}

const byRole = {};
for (const r of rows) (byRole[r.role] ||= []).push(r);

let md = `# Role Depth Matrix\n\n`;
md += `> Generated by \`scripts/audit-role-depth.mjs\`. Regenerable — do not hand-edit.\n`;
md += `> Method: spec \`docs/superpowers/specs/2026-07-08-do-next-stream-design.md\` §"Method".\n`;
md += `> Signals are derived from roleData + MERIDIAN_CHAINS + SURFACE_REGISTRY only. No guessed L-levels.\n\n`;
md += `| Role | Feature | Current-L | Verdict |\n|---|---|---|---|\n`;
for (const role of Object.keys(byRole).sort()) {
  for (const r of byRole[role]) md += `| ${r.role} | ${r.feature} | ${r.L} | ${r.verdict} |\n`;
}
md += `\n## Summary\n\n| Role | journey-ready | thin-card | routed | dead-tile |\n|---|---|---|---|---|\n`;
for (const role of Object.keys(byRole).sort()) {
  const c = (v) => byRole[role].filter((r) => r.verdict === v).length;
  md += `| ${role} | ${c('journey-ready')} | ${c('thin-card')} | ${c('routed')} | ${c('dead-tile')} |\n`;
}

writeFileSync(R('../docs/operations/ROLE_DEPTH_MATRIX.md'), md);
console.log(`wrote ROLE_DEPTH_MATRIX.md — ${rows.length} features across ${Object.keys(byRole).length} roles`);
