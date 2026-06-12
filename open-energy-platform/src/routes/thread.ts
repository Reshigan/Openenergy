// ═══════════════════════════════════════════════════════════════════════════
// Meridian — GET /api/thread/:chainKey/:id
//
// Generic two-sided case view over the Meridian chain registry. Any role
// holding a lane on the chain may VIEW the case; write actions are filtered
// down to the viewer's role (the other side sees the same facts, no buttons).
//
// Returns:
//   chain   — registry identity (key, wave, title)
//   case    — envelope (ref, status, deadline, quantum, counterparty) + raw row
//   events  — per-chain event timeline ([] until eventsTable wired per chain)
//   actions — role-filtered transition hints, each with a Law-3 cascadeHint
//
// Table/column values come exclusively from the static MERIDIAN_CHAINS
// literal — never from request input.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { getChain, type ChainDescriptor } from '../utils/chain-registry-meridian';

export function shapeThread(
  chain: ChainDescriptor, row: Record<string, unknown>,
  events: Record<string, unknown>[], role: string,
) {
  const rawZar = chain.quantumCol ? row[chain.quantumCol] : null;
  const zar = rawZar == null || Number.isNaN(Number(rawZar)) ? null : Number(rawZar);
  return {
    chain: { key: chain.key, wave: chain.wave, title: chain.title },
    case: {
      id: String(row.id ?? row[chain.refCol]),
      ref: String(row[chain.refCol] ?? row.id),
      title: chain.titleCol ? String(row[chain.titleCol] ?? chain.title) : chain.title,
      status: String(row[chain.statusCol] ?? ''),
      deadline_at: (row[chain.deadlineCol] as string | null) ?? null,
      quantum_zar: zar,
      counterparty: chain.counterpartyCol ? String(row[chain.counterpartyCol] ?? '') || null : null,
      raw: row, // Thread UI renders chain-specific fields from raw, read-only
    },
    events, // [] until eventsTable populated per chain — UI hides timeline when empty
    actions: chain.actions
      .filter(a => a.roles.includes(role))
      .map(({ roles: _r, ...a }) => a),
    viewer_role: role,
  };
}

const thread = new Hono<HonoEnv>();
thread.use('*', authMiddleware);

thread.get('/:chainKey/:id', async (c) => {
  const chain = getChain(c.req.param('chainKey'));
  if (!chain) return c.json({ success: false, error: 'unknown chain' }, 404);
  const user = getCurrentUser(c);
  // Two-sided access: any role with a lane on this chain may VIEW; actions
  // are filtered by role in shapeThread.
  if (!(user.role in chain.lanes) && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  // Table/column names come from the static MERIDIAN_CHAINS literal only;
  // never from request input.
  const row = await c.env.DB.prepare(`SELECT * FROM ${chain.table} WHERE id = ?`)
    .bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);

  let events: Record<string, unknown>[] = [];
  if (chain.eventsTable && chain.eventsFk) {
    const r = await c.env.DB.prepare(
      `SELECT * FROM ${chain.eventsTable} WHERE ${chain.eventsFk} = ? ORDER BY created_at ASC LIMIT 200`,
    ).bind(c.req.param('id')).all();
    events = (r.results ?? []) as Record<string, unknown>[];
  }
  return c.json({ success: true, data: shapeThread(chain, row, events, user.role) });
});

export default thread;
