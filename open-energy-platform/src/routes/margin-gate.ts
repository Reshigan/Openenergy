// ═══════════════════════════════════════════════════════════════════════════
// Margin Gate — Wave 3 per-member enforcement state for pre-trade rejection.
//
// Mounted at /api/clearing/margin-gate (flat).
//
// Pre-trade guard reads margin_enforcement_state.gate_status:
//   clear   → allow order
//   warning → allow with reason_code (logged on rejection list with severity=info)
//   blocked → reject order with reason_code=MARGIN_GATE_BLOCKED
//
// Endpoints:
//   GET    /:memberId           — current gate state for member
//   GET    /                    — all members with non-clear state
//   POST   /:memberId/recompute — recompute from oe_margin_calls
//   POST   /:memberId/override  — set manual override (admin only)
//   DELETE /:memberId/override  — clear manual override
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { recomputeMarginGate } from '../utils/margin-gate';

const gate = new Hono<HonoEnv>();
gate.use('*', authMiddleware);

const READ_ROLES = new Set(['admin', 'support', 'regulator', 'risk', 'trader', 'lender']);
const ADMIN_ROLES = new Set(['admin', 'support']);

// ── GET / ─────────────────────────────────────────────────────────────────
gate.get('/', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const rows = await (c.env.DB as D1Database).prepare(`
    SELECT * FROM margin_enforcement_state WHERE gate_status <> 'clear' ORDER BY gate_status DESC, earliest_deadline ASC
  `).all<any>();
  return c.json({ data: rows.results || [] });
});

// ── GET /:memberId ────────────────────────────────────────────────────────
gate.get('/:memberId', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const memberId = c.req.param('memberId');
  const row = await (c.env.DB as D1Database).prepare(`
    SELECT * FROM margin_enforcement_state WHERE member_id = ?
  `).bind(memberId).first<any>();
  if (!row) return c.json({ data: { member_id: memberId, gate_status: 'clear' } });
  return c.json({ data: row });
});

// ── POST /:memberId/recompute ─────────────────────────────────────────────
gate.post('/:memberId/recompute', async (c) => {
  const u = getCurrentUser(c);
  if (!ADMIN_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const memberId = c.req.param('memberId');
  const state = await recomputeMarginGate(c.env, memberId);
  await fireCascade({
    event: 'clearing.margin.gate_changed',
    actor_id: u.id, entity_type: 'margin_enforcement_state', entity_id: memberId,
    data: { gate_status: state.gate_status }, env: c.env,
  });
  return c.json({ data: state });
});

// ── POST /:memberId/override ──────────────────────────────────────────────
gate.post('/:memberId/override', async (c) => {
  const u = getCurrentUser(c);
  if (!ADMIN_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const memberId = c.req.param('memberId');
  const body = await c.req.json().catch(() => ({}));
  const gateStatus = String(body.gate_status || 'clear');
  const reason = (body.reason || '').toString().slice(0, 200);
  if (!['clear', 'warning', 'blocked'].includes(gateStatus)) {
    return c.json({ error: 'invalid_gate_status' }, 400);
  }
  if (!reason) return c.json({ error: 'reason_required' }, 400);

  await (c.env.DB as D1Database).prepare(`
    INSERT INTO margin_enforcement_state (member_id, gate_status, manual_override, override_reason, override_by, override_at, last_evaluated_at)
    VALUES (?,?,1,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(member_id) DO UPDATE SET
      gate_status = excluded.gate_status,
      manual_override = 1,
      override_reason = excluded.override_reason,
      override_by = excluded.override_by,
      override_at = datetime('now'),
      last_evaluated_at = datetime('now')
  `).bind(memberId, gateStatus, reason, u.id).run();

  await fireCascade({
    event: 'clearing.margin.override_set',
    actor_id: u.id, entity_type: 'margin_enforcement_state', entity_id: memberId,
    data: { gate_status: gateStatus, reason }, env: c.env,
  });
  return c.json({ data: { member_id: memberId, gate_status: gateStatus, manual_override: 1 } });
});

// ── DELETE /:memberId/override ────────────────────────────────────────────
gate.delete('/:memberId/override', async (c) => {
  const u = getCurrentUser(c);
  if (!ADMIN_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const memberId = c.req.param('memberId');
  await (c.env.DB as D1Database).prepare(`
    UPDATE margin_enforcement_state
       SET manual_override = 0, override_reason = NULL, override_by = NULL, override_at = NULL
     WHERE member_id = ?
  `).bind(memberId).run();
  // Re-evaluate from live data after clearing override.
  const state = await recomputeMarginGate(c.env, memberId);
  return c.json({ data: state });
});

export default gate;
