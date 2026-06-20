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
import { getChain, quantumZar, type ChainDescriptor } from '../utils/chain-registry-meridian';
import { LockBusyError } from '../utils/locks';
import { listSignatories, addSignatory, recordSignature } from '../utils/chain-esign';

// A role may write to a chain (add signatories) if it holds any action on it.
function canWriteChain(chain: ChainDescriptor, role: string): boolean {
  return role === 'admin' || chain.actions.some(a => a.roles.includes(role));
}

export function shapeThread(
  chain: ChainDescriptor, row: Record<string, unknown>,
  events: Record<string, unknown>[], role: string,
) {
  const zar = quantumZar(chain, row);
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
  // Two-sided access: any role with a lane on this chain may VIEW, and so may
  // any role named in an action hint (respondent roles — e.g. an offtaker
  // asked to request_reconsideration on tariff_determination — often hold an
  // action without a lane and must still open the thread they act in).
  // Actions are filtered by role in shapeThread.
  const canView = user.role === 'admin'
    || user.role in chain.lanes
    || chain.actions.some(a => a.roles.includes(user.role));
  if (!canView) {
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
  const signatories = await listSignatories(c.env, chain.key, c.req.param('id'));
  return c.json({
    success: true,
    data: {
      ...shapeThread(chain, row, events, user.role),
      signatories,
      can_manage_signatories: canWriteChain(chain, user.role),
    },
  });
});

// POST /api/thread/:chainKey/:id/signatories — add a party to the e-sign roster.
// Writer roles only (anyone holding an action on the chain, or admin).
thread.post('/:chainKey/:id/signatories', async (c) => {
  const chain = getChain(c.req.param('chainKey'));
  if (!chain) return c.json({ success: false, error: 'unknown chain' }, 404);
  const user = getCurrentUser(c);
  if (!canWriteChain(chain, user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const participantId = typeof body.participant_id === 'string' ? body.participant_id : '';
  if (!participantId) return c.json({ success: false, error: 'participant_id required' }, 400);

  const res = await addSignatory(c.env, {
    entityType: chain.key,
    entityId: c.req.param('id'),
    participantId,
    name: typeof body.signatory_name === 'string' ? body.signatory_name : undefined,
    designation: typeof body.signatory_designation === 'string' ? body.signatory_designation : undefined,
    tenantId: user.tenant_id,
  });
  if (!res.added) {
    const code = res.reason === 'unknown_participant' ? 404 : 403;
    return c.json({ success: false, error: res.reason }, code);
  }
  return c.json({ success: true, data: { added: true } });
});

// POST /api/thread/:chainKey/:id/sign — the current user signs. Fires
// `<chainKey>.signed` when the last signatory signs (hash-bound, vault-backed).
thread.post('/:chainKey/:id/sign', async (c) => {
  const chain = getChain(c.req.param('chainKey'));
  if (!chain) return c.json({ success: false, error: 'unknown chain' }, 404);
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));

  try {
    const data = await recordSignature(c.env, {
      entityType: chain.key,
      entityId: c.req.param('id'),
      userId: user.id,
      signatureR2Key: typeof body.signature_r2_key === 'string' ? body.signature_r2_key : undefined,
      documentHash: typeof body.document_hash === 'string' ? body.document_hash : undefined,
    });
    return c.json({ success: true, data });
  } catch (err) {
    if (err instanceof LockBusyError) {
      switch (err.key) {
        case '__not_signatory__': return c.json({ success: false, error: 'Not listed as a signatory' }, 403);
        case '__already_signed__': return c.json({ success: false, error: 'Already signed' }, 400);
        default: return c.json({ success: false, error: 'Another signature is in progress — retry in a moment' }, 409);
      }
    }
    throw err;
  }
});

export default thread;
