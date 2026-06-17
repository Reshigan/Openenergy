// One-off: dump MERIDIAN_CHAINS into a compact journey matrix for E2E planning.
// Run: npx tsx scripts/extract-journey-matrix.ts > /tmp/journey-matrix.json
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian';

const rows = MERIDIAN_CHAINS.map((c) => {
  const actionRoles = new Set<string>();
  for (const a of c.actions || []) for (const r of a.roles || []) actionRoles.add(r);
  return {
    key: c.key,
    wave: c.wave,
    title: c.title,
    table: c.table,
    statusCol: c.statusCol,
    hasInitiation: !!c.initiation,
    initPath: c.initiation?.path || null,
    initFieldCount: c.initiation?.fields?.length ?? 0,
    actionCount: (c.actions || []).length,
    actionRoles: [...actionRoles].sort(),
    actions: (c.actions || []).map((a) => ({ action: a.action, path: a.path, roles: a.roles, method: a.method || 'POST', fieldCount: a.fields?.length ?? 0, cascadeHint: a.cascadeHint })),
    counterpartyCol: c.counterpartyCol,
    lanes: c.lanes ? Object.keys(c.lanes) : [],
    terminal: c.terminal || [],
  };
});

const withInit = rows.filter((r) => r.hasInitiation);
const noInit = rows.filter((r) => !r.hasInitiation);
const summary = {
  total: rows.length,
  withInitiation: withInit.length,
  withoutInitiation: noInit.length,
  byWave: rows.reduce<Record<number, number>>((m, r) => { m[r.wave] = (m[r.wave] || 0) + 1; return m; }, {}),
  rolesSeen: [...new Set(rows.flatMap((r) => [...r.actionRoles, ...r.lanes]))].sort(),
  noInitKeys: noInit.map((r) => r.key),
};
process.stdout.write(JSON.stringify({ summary, rows }, null, 2));
