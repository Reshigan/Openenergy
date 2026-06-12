// ═══════════════════════════════════════════════════════════════════════════
// Meridian — GET /api/horizon/:role
//
// Aggregates live (non-terminal) chain cases across all chains visible to a
// given role, returning three top-level structures:
//
//   lanes  — cases grouped by the per-role lane key from the chain registry
//   duty   — top-8 cases ranked by attentionScore (breach + quantum)
//   counts — total + breached case counts
//
// Table/column/terminal-status values come exclusively from the static
// MERIDIAN_CHAINS literal — never from request input. One D1 batch round-trip
// covers all chains for the role.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import {
  chainsForRole, bucketFor, attentionScore,
  type ChainDescriptor, type HorizonBucket,
} from '../utils/chain-registry-meridian';

export interface ChainRows { chain: ChainDescriptor; rows: Record<string, unknown>[] }

export interface HorizonCase {
  chain: string; wave: number; id: string; ref: string; title: string;
  status: string; deadline_at: string | null; bucket: HorizonBucket;
  quantum_zar: number | null; counterparty: string | null;
  score: number;
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string }[];
}

export function assembleHorizon(data: ChainRows[], role: string, now: number) {
  const laneMap = new Map<string, HorizonCase[]>();
  const all: HorizonCase[] = [];

  for (const { chain, rows } of data) {
    const laneKey = chain.lanes[role];
    if (!laneKey) continue;
    for (const r of rows) {
      const deadline = (r[chain.deadlineCol] as string | null) ?? null;
      const rawZar = chain.quantumCol ? r[chain.quantumCol] : null;
      const zar = rawZar == null || Number.isNaN(Number(rawZar)) ? null : Number(rawZar);
      const c: HorizonCase = {
        chain: chain.key, wave: chain.wave,
        id: String(r.id ?? r[chain.refCol]),
        ref: String(r[chain.refCol] ?? r.id),
        title: chain.titleCol ? String(r[chain.titleCol] ?? chain.title) : chain.title,
        status: String(r[chain.statusCol] ?? ''),
        deadline_at: deadline, bucket: bucketFor(deadline, now),
        quantum_zar: zar,
        counterparty: chain.counterpartyCol ? String(r[chain.counterpartyCol] ?? '') || null : null,
        score: attentionScore(zar, deadline, now),
        actions: chain.actions
          .filter(a => a.roles.includes(role))
          .map(({ roles: _r, ...a }) => a),
      };
      all.push(c);
      (laneMap.get(laneKey) ?? laneMap.set(laneKey, []).get(laneKey)!).push(c);
    }
  }

  const lanes = [...laneMap.entries()].map(([key, cases]) => ({
    key,
    cases: cases.sort((a, b) => b.score - a.score),
  }));
  const duty = [...all].sort((a, b) => b.score - a.score).slice(0, 8);
  const counts = { total: all.length, breached: all.filter(c => c.bucket === 'breached').length };
  return { lanes, duty, counts };
}

const horizon = new Hono<HonoEnv>();
horizon.use('*', authMiddleware);

horizon.get('/:role', async (c) => {
  const role = c.req.param('role');
  const user = getCurrentUser(c);
  if (user.role !== role && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const chains = chainsForRole(role);
  if (!chains.length) return c.json({ success: true, data: { lanes: [], duty: [], counts: { total: 0, breached: 0 } } });

  // One D1 round-trip for all chains. Table/column names come from the static
  // MERIDIAN_CHAINS literal only; never from request input.
  const stmts = chains.map(d =>
    c.env.DB.prepare(
      `SELECT * FROM ${d.table}
       WHERE ${d.statusCol} NOT IN (${d.terminal.map(() => '?').join(',')})
       ORDER BY ${d.deadlineCol} ASC LIMIT 60`,
    ).bind(...d.terminal),
  );
  const results = await c.env.DB.batch(stmts);
  const data: ChainRows[] = chains.map((chain, i) => ({
    chain, rows: (results[i].results ?? []) as Record<string, unknown>[],
  }));
  return c.json({ success: true, data: assembleHorizon(data, role, Date.now()) });
});

export default horizon;
