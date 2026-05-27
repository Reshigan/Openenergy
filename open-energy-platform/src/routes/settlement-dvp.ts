// ═══════════════════════════════════════════════════════════════════════════
// Settlement DvP — Wave 3 atomic Delivery-vs-Payment lock per cycle.
//
// Mounted at /api/settlement/dvp (flat).
//
// State machine (per cycle):
//   open → cash_in → locked    (cash confirmed first, then energy)
//   open → energy_in → locked  (energy confirmed first, then cash)
//   locked → released          (cycle reversed: default / break)
//
// Endpoints:
//   GET    /cycle/:cycleId      — current lock state
//   POST   /cycle/:cycleId/cash — confirm cash leg
//   POST   /cycle/:cycleId/energy — confirm energy leg
//   POST   /cycle/:cycleId/release — release a locked cycle (admin only)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const dvp = new Hono<HonoEnv>();
dvp.use('*', authMiddleware);

const READ_ROLES = new Set(['admin', 'support', 'trader', 'regulator', 'lender', 'risk']);
const CONFIRM_ROLES = new Set(['admin', 'support', 'trader']);
const RELEASE_ROLES = new Set(['admin', 'support']);

async function ensureLockRow(c: any, cycleId: string): Promise<any> {
  const db = c.env.DB as D1Database;
  const row = await db.prepare(`SELECT * FROM settlement_dvp_locks WHERE cycle_id = ?`).bind(cycleId).first<any>();
  if (row) return row;
  await db.prepare(`INSERT INTO settlement_dvp_locks (cycle_id) VALUES (?)`).bind(cycleId).run();
  return await db.prepare(`SELECT * FROM settlement_dvp_locks WHERE cycle_id = ?`).bind(cycleId).first<any>();
}

function nextStatusAfter(current: string, leg: 'cash' | 'energy', existing: any): string {
  if (current === 'locked' || current === 'released') return current;
  const cashOk = leg === 'cash' || !!existing.cash_confirmed_at;
  const energyOk = leg === 'energy' || !!existing.energy_confirmed_at;
  if (cashOk && energyOk) return 'locked';
  if (cashOk) return 'cash_in';
  if (energyOk) return 'energy_in';
  return 'open';
}

// ── GET /cycle/:cycleId ────────────────────────────────────────────────────
dvp.get('/cycle/:cycleId', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const cycleId = c.req.param('cycleId');
  const row = await ensureLockRow(c, cycleId);
  return c.json({ data: row });
});

// ── POST /cycle/:cycleId/cash ─────────────────────────────────────────────
dvp.post('/cycle/:cycleId/cash', async (c) => {
  const u = getCurrentUser(c);
  if (!CONFIRM_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const cycleId = c.req.param('cycleId');
  const body = await c.req.json().catch(() => ({}));
  const ref = (body.cash_ref || '').toString().slice(0, 80) || null;

  const existing = await ensureLockRow(c, cycleId);
  if (existing.lock_status === 'locked' || existing.lock_status === 'released') {
    return c.json({ error: `cannot_modify_${existing.lock_status}` }, 409);
  }
  const nextStatus = nextStatusAfter(existing.lock_status, 'cash', existing);
  const lockedAt = nextStatus === 'locked' ? new Date().toISOString() : null;

  await (c.env.DB as D1Database).prepare(`
    UPDATE settlement_dvp_locks
       SET lock_status = ?, cash_confirmed_at = datetime('now'), cash_confirmed_by = ?, cash_ref = ?,
           locked_at = COALESCE(locked_at, ?), updated_at = datetime('now')
     WHERE cycle_id = ?
  `).bind(nextStatus, u.id, ref, lockedAt, cycleId).run();

  await fireCascade({
    event: nextStatus === 'locked' ? 'settlement.dvp.locked' : 'settlement.dvp.cash_confirmed',
    actor_id: u.id, entity_type: 'settlement_cycle', entity_id: cycleId,
    data: { lock_status: nextStatus, cash_ref: ref },
    env: c.env,
  });
  return c.json({ data: { cycle_id: cycleId, lock_status: nextStatus } });
});

// ── POST /cycle/:cycleId/energy ───────────────────────────────────────────
dvp.post('/cycle/:cycleId/energy', async (c) => {
  const u = getCurrentUser(c);
  if (!CONFIRM_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const cycleId = c.req.param('cycleId');
  const body = await c.req.json().catch(() => ({}));
  const ref = (body.energy_ref || '').toString().slice(0, 80) || null;

  const existing = await ensureLockRow(c, cycleId);
  if (existing.lock_status === 'locked' || existing.lock_status === 'released') {
    return c.json({ error: `cannot_modify_${existing.lock_status}` }, 409);
  }
  const nextStatus = nextStatusAfter(existing.lock_status, 'energy', existing);
  const lockedAt = nextStatus === 'locked' ? new Date().toISOString() : null;

  await (c.env.DB as D1Database).prepare(`
    UPDATE settlement_dvp_locks
       SET lock_status = ?, energy_confirmed_at = datetime('now'), energy_confirmed_by = ?, energy_ref = ?,
           locked_at = COALESCE(locked_at, ?), updated_at = datetime('now')
     WHERE cycle_id = ?
  `).bind(nextStatus, u.id, ref, lockedAt, cycleId).run();

  await fireCascade({
    event: nextStatus === 'locked' ? 'settlement.dvp.locked' : 'settlement.dvp.energy_confirmed',
    actor_id: u.id, entity_type: 'settlement_cycle', entity_id: cycleId,
    data: { lock_status: nextStatus, energy_ref: ref },
    env: c.env,
  });
  return c.json({ data: { cycle_id: cycleId, lock_status: nextStatus } });
});

// ── POST /cycle/:cycleId/release ──────────────────────────────────────────
dvp.post('/cycle/:cycleId/release', async (c) => {
  const u = getCurrentUser(c);
  if (!RELEASE_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const cycleId = c.req.param('cycleId');
  const body = await c.req.json().catch(() => ({}));
  const reason = (body.reason || '').toString().slice(0, 200) || 'manual_release';

  const existing = await ensureLockRow(c, cycleId);
  if (existing.lock_status === 'released') return c.json({ error: 'already_released' }, 409);

  await (c.env.DB as D1Database).prepare(`
    UPDATE settlement_dvp_locks
       SET lock_status = 'released', released_at = datetime('now'), released_reason = ?, updated_at = datetime('now')
     WHERE cycle_id = ?
  `).bind(reason, cycleId).run();

  await fireCascade({
    event: 'settlement.dvp.released',
    actor_id: u.id, entity_type: 'settlement_cycle', entity_id: cycleId,
    data: { reason },
    env: c.env,
  });
  return c.json({ data: { cycle_id: cycleId, lock_status: 'released' } });
});

export default dvp;
