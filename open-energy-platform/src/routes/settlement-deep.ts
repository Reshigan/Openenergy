// ════════════════════════════════════════════════════════════════════════
// settlement-deep — T+1 net settlement + default management waterfall.
//
//   /cycles                — daily T+1 settlement cycle lifecycle
//   /cycles/:id/net        — compute net legs from raw fills
//   /cycles/:id/novate     — central counterparty novation step
//   /cycles/:id/settle     — finalise + emit settlement instructions
//   /default-events        — counterparty default workout pipeline
//   /default-events/:id/close-out + /:id/recover
//   /instructions          — bank rail instruction tracking
//
// Mounted at /api/settlement-deep. T+1 cycle is triggered by the existing
// `10 0 * * *` cron (settlement run for previous day) — see
// src/index.ts which calls /cycles/auto-create.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';
import { withLock, LockBusyError } from '../utils/locks';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const adminOnly = (role: string) => ['admin', 'support'].includes(role);

// ─── Cycles ─────────────────────────────────────────────────────────────
r.get('/cycles', async (c) => {
  const days = Math.min(60, Math.max(1, Number(c.req.query('days') || 30)));
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_settlement_cycles
    WHERE trade_date >= date('now', ? || ' days')
    ORDER BY trade_date DESC
  `).bind(`-${days}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/cycles', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const tradeDate = b.trade_date || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const valueDate = b.value_date || new Date(Date.now()).toISOString().slice(0, 10);
  const id = genId('cyc');
  await c.env.DB.prepare(`
    INSERT INTO oe_settlement_cycles (id, trade_date, value_date, status)
    VALUES (?,?,?,?)
  `).bind(id, tradeDate, valueDate, 'open').run();
  await fireCascade({
    event: 'settlement.cycle_opened',
    actor_id: user.id,
    entity_type: 'oe_settlement_cycles',
    entity_id: id,
    data: { trade_date: tradeDate, value_date: valueDate },
    env: c.env,
  });
  return c.json({ success: true, data: { id, trade_date: tradeDate, value_date: valueDate } }, 201);
});

r.post('/cycles/:id/net', requireStepUp('settlement.net'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');

  // Netting is a one-shot open→net_calculated transition that writes a set of
  // net legs. Two concurrent POSTs on the same cycle would BOTH read status
  // 'open', both pass the gate, and both INSERT a full set of legs — a TOCTOU
  // race that doubles the obligations. Serialise the whole read-check-write
  // under an advisory lock AND re-read the status inside the lock, so the loser
  // sees 'net_calculated' and bails with 409. A caller that cannot even acquire
  // the lock (a truly simultaneous run) also gets a 409 via LockBusyError.
  try {
    return await withLock(
      c.env,
      `settlement:netting:${id}`,
      user.id,
      async (): Promise<Response> => {
        const cycle = await c.env.DB.prepare(`SELECT * FROM oe_settlement_cycles WHERE id = ?`).bind(id).first<any>();
        if (!cycle) return c.json({ success: false, error: 'not found' }, 404);
        if (cycle.status !== 'open') return c.json({ success: false, error: `cannot net from status ${cycle.status}` }, 409);
        // Gather raw fills for the trade date — try preferred trade_fills schema
        // first, fall back to invoices for the demo data model.
        let fills: Array<{ from: string; to: string; energy_type: string; volume: number; value: number }> = [];
        try {
          const r1 = await c.env.DB.prepare(`
            SELECT f.buyer_id AS buyer, f.seller_id AS seller, o.energy_type, f.volume_mwh, f.price
            FROM trade_fills f JOIN trade_orders o ON o.id = f.order_id
            WHERE date(f.executed_at) = ?
          `).bind(cycle.trade_date).all<any>();
          fills = (r1.results || []).map((r: any) => ({
            from: r.buyer, to: r.seller, energy_type: r.energy_type,
            volume: Number(r.volume_mwh), value: Number(r.volume_mwh) * Number(r.price),
          }));
        } catch { /* fall through */ }
        if (!fills.length) {
          const r2 = await c.env.DB.prepare(`
            SELECT from_participant_id AS from_p, to_participant_id AS to_p, total_amount
            FROM invoices WHERE date(created_at) = ?
          `).bind(cycle.trade_date).all<any>();
          fills = (r2.results || []).map((r: any) => ({
            from: r.from_p, to: r.to_p, energy_type: 'power',
            volume: 0, value: Number(r.total_amount),
          }));
        }
        // Compute net per (from, to, energy_type) — bilateral netting
        const netMap = new Map<string, { from: string; to: string; energy_type: string; volume: number; value: number }>();
        for (const f of fills) {
          const key = `${f.from}|${f.to}|${f.energy_type}`;
          const reverse = `${f.to}|${f.from}|${f.energy_type}`;
          if (netMap.has(reverse)) {
            const rev = netMap.get(reverse)!;
            rev.volume -= f.volume; rev.value -= f.value;
            if (Math.abs(rev.value) < 0.01) netMap.delete(reverse);
          } else {
            const cur = netMap.get(key) || { from: f.from, to: f.to, energy_type: f.energy_type, volume: 0, value: 0 };
            cur.volume += f.volume; cur.value += f.value;
            netMap.set(key, cur);
          }
        }
        // Write net legs
        let netCount = 0;
        for (const leg of netMap.values()) {
          if (Math.abs(leg.value) < 0.01) continue;
          const direction = leg.value >= 0 ? { from: leg.from, to: leg.to } : { from: leg.to, to: leg.from };
          const legId = genId('nlg');
          await c.env.DB.prepare(`
            INSERT INTO oe_settlement_net_legs
              (id, cycle_id, from_participant_id, to_participant_id, energy_type,
               net_volume_mwh, net_value_zar, status)
            VALUES (?,?,?,?,?,?,?,?)
          `).bind(
            legId, id, direction.from, direction.to, leg.energy_type,
            Math.abs(leg.volume), Math.abs(leg.value), 'pending',
          ).run();
          netCount += 1;
        }
        const grossVolume = fills.reduce((s, f) => s + f.volume, 0);
        const grossValue  = fills.reduce((s, f) => s + Math.abs(f.value), 0);
        const efficiency  = fills.length > 0 ? 1 - (netCount / fills.length) : 0;
        await c.env.DB.prepare(`
          UPDATE oe_settlement_cycles
          SET status = 'net_calculated', total_trades = ?, total_volume_mwh = ?,
              total_value_zar = ?, net_legs_count = ?, netting_efficiency = ?
          WHERE id = ?
        `).bind(fills.length, grossVolume, grossValue, netCount, efficiency, id).run();
        await fireCascade({
          event: 'settlement.cycle_netted',
          actor_id: user.id,
          entity_type: 'oe_settlement_cycles',
          entity_id: String(id),
          data: {
            gross_trades: fills.length,
            gross_volume_mwh: grossVolume,
            gross_value_zar: grossValue,
            net_legs: netCount,
            netting_efficiency: efficiency,
          },
          env: c.env,
        });
        return c.json({
          success: true,
          data: { id, gross_trades: fills.length, net_legs: netCount, netting_efficiency: Math.round(efficiency * 1000) / 10 },
        });
      },
      { ttlSeconds: 30 },
    );
  } catch (e) {
    if (e instanceof LockBusyError) {
      return c.json({ success: false, error: 'netting already in progress for this cycle' }, 409);
    }
    throw e;
  }
});

r.post('/cycles/:id/novate', requireStepUp('settlement.novate'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const cycle = await c.env.DB.prepare(`SELECT status FROM oe_settlement_cycles WHERE id = ?`).bind(id).first<any>();
  if (!cycle || cycle.status !== 'net_calculated') return c.json({ success: false, error: 'cycle not in net_calculated state' }, 409);
  // Mark legs as novated to the central counterparty
  await c.env.DB.prepare(`UPDATE oe_settlement_net_legs SET status = 'novated', novated_at = datetime('now') WHERE cycle_id = ? AND status = 'pending'`).bind(id).run();
  await c.env.DB.prepare(`UPDATE oe_settlement_cycles SET status = 'novated', novated_at = datetime('now') WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'settlement.cycle_novated',
    actor_id: user.id,
    entity_type: 'oe_settlement_cycles',
    entity_id: String(id),
    data: {},
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/cycles/:id/settle', requireStepUp('settlement.transfer'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = String(c.req.param('id'));
  const cycle = await c.env.DB.prepare(`SELECT status FROM oe_settlement_cycles WHERE id = ?`).bind(id).first<any>();
  if (!cycle || cycle.status !== 'novated') return c.json({ success: false, error: 'cycle not in novated state' }, 409);
  // Emit settlement instructions for every net leg
  const legs = await c.env.DB.prepare(`SELECT * FROM oe_settlement_net_legs WHERE cycle_id = ?`).bind(id).all<any>();
  const legList = (legs.results || []) as any[];
  const settleStmts: D1PreparedStatement[] = [];
  for (const leg of legList) {
    // Debit instruction for the payer
    settleStmts.push(c.env.DB.prepare(`
      INSERT INTO oe_settlement_instructions
        (id, net_leg_id, participant_id, direction, amount_zar, bank, bank_account_ref, reference, status)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      genId('si'), leg.id, leg.from_participant_id, 'debit',
      Number(leg.net_value_zar), 'TBD', 'TBD',
      `OE-SETTLE-${id.slice(-6)}-${leg.id.slice(-4)}`,
      'queued',
    ));
    // Credit instruction for the payee
    settleStmts.push(c.env.DB.prepare(`
      INSERT INTO oe_settlement_instructions
        (id, net_leg_id, participant_id, direction, amount_zar, bank, bank_account_ref, reference, status)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      genId('si'), leg.id, leg.to_participant_id, 'credit',
      Number(leg.net_value_zar), 'TBD', 'TBD',
      `OE-SETTLE-${id.slice(-6)}-${leg.id.slice(-4)}`,
      'queued',
    ));
    settleStmts.push(c.env.DB.prepare(`UPDATE oe_settlement_net_legs SET status = 'settled', settled_at = datetime('now') WHERE id = ?`).bind(leg.id));
  }
  settleStmts.push(c.env.DB.prepare(`UPDATE oe_settlement_cycles SET status = 'settled', settled_at = datetime('now') WHERE id = ?`).bind(id));
  for (let i = 0; i < settleStmts.length; i += 100) await c.env.DB.batch(settleStmts.slice(i, i + 100));
  const queued = legList.length * 2;
  await fireCascade({
    event: 'settlement.cycle_settled',
    actor_id: user.id,
    entity_type: 'oe_settlement_cycles',
    entity_id: id,
    data: { instructions_queued: queued, legs_count: (legs.results || []).length },
    env: c.env,
  });
  return c.json({ success: true, data: { instructions_queued: queued } });
});

r.get('/cycles/:id/legs', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_settlement_net_legs WHERE cycle_id = ? ORDER BY net_value_zar DESC LIMIT 500`).bind(id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Default events ─────────────────────────────────────────────────────
r.get('/defaults', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_default_events ORDER BY declared_at DESC LIMIT 100`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/defaults', requireStepUp('default.declare.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.participant_id || !b.trigger_type) return c.json({ success: false, error: 'participant_id + trigger_type required' }, 400);
  const id = genId('def');
  await c.env.DB.prepare(`
    INSERT INTO oe_default_events
      (id, participant_id, trigger_type, initial_exposure_zar, notes, declared_by)
    VALUES (?,?,?,?,?,?)
  `).bind(id, b.participant_id, b.trigger_type, b.initial_exposure_zar || null, b.notes || null, user.id).run();
  // Suspend all open positions / orders — best-effort
  await c.env.DB.prepare(`UPDATE trade_orders SET status = 'cancelled' WHERE participant_id = ? AND status IN ('open','partial')`).bind(b.participant_id).run().catch(() => null);
  await fireCascade({
    event: 'settlement.default_declared',
    actor_id: user.id,
    entity_type: 'oe_default_events',
    entity_id: id,
    data: {
      participant_id: b.participant_id,
      trigger_type: b.trigger_type,
      initial_exposure_zar: b.initial_exposure_zar || null,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/defaults/:id/close-out', requireStepUp('default.close_out.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_default_events SET status = 'close_out_priced', close_out_priced_at = datetime('now'), notes = COALESCE(notes,'') || char(10) || ?
    WHERE id = ?
  `).bind(`Close-out priced at ${b.close_out_price || 'mark'} on ${new Date().toISOString()}`, id).run();
  await fireCascade({
    event: 'settlement.default_close_out',
    actor_id: user.id,
    entity_type: 'oe_default_events',
    entity_id: String(id),
    data: { close_out_price: b.close_out_price ?? null },
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/defaults/:id/recover', requireStepUp('default.recover'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_default_events
    SET status = 'recovered', recovery_amount_zar = ?, recovery_at = datetime('now')
    WHERE id = ?
  `).bind(Number(b.recovery_amount_zar || 0), id).run();
  await fireCascade({
    event: 'settlement.default_recovered',
    actor_id: user.id,
    entity_type: 'oe_default_events',
    entity_id: String(id),
    data: { recovery_amount_zar: Number(b.recovery_amount_zar || 0) },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Settlement instructions ────────────────────────────────────────────
r.get('/instructions', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = adminOnly(user.role);
  const sql = isOfficer
    ? `SELECT * FROM oe_settlement_instructions ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM oe_settlement_instructions WHERE participant_id = ? ORDER BY created_at DESC LIMIT 100`;
  const rows = isOfficer
    ? await c.env.DB.prepare(sql).all()
    : await c.env.DB.prepare(sql).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/instructions/:id/confirm', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_settlement_instructions
    SET status = 'confirmed', confirmed_at = datetime('now'), bank_confirmation = ?
    WHERE id = ?
  `).bind(b.bank_confirmation || null, id).run();
  await fireCascade({
    event: 'settlement.instruction_confirmed',
    actor_id: user.id,
    entity_type: 'oe_settlement_instructions',
    entity_id: String(id),
    data: { bank_confirmation: b.bank_confirmation || null },
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/instructions/:id/fail', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_settlement_instructions
    SET status = 'failed', failure_reason = ?
    WHERE id = ?
  `).bind(b.reason || 'unknown', id).run();
  await fireCascade({
    event: 'settlement.instruction_failed',
    actor_id: user.id,
    entity_type: 'oe_settlement_instructions',
    entity_id: String(id),
    data: { reason: b.reason || 'unknown' },
    env: c.env,
  });
  return c.json({ success: true });
});

export default r;
