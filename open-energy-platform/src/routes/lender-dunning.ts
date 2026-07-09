// ═══════════════════════════════════════════════════════════════════════════
// Lender dunning queue + watchlist events — Wave 6 P6-grade lender portal.
//
// Mounted at /api/lender/dunning (flat — avoids the basePath param-collision
// lesson saved in [[feedback_route_mount_collision]]).
//
// The dunning queue closes the borrower-side observation loop:
//   • covenant breach cascade → auto-create watchlist row + cycle-1 notice
//     with 14-day cure window (see materializeLenderWatchlist in cascade.ts)
//   • cron `lender_dunning_overdue_sweep` escalates 1→2 (7d) → 3 (3d)
//   • cycle 3 expiry fires `lender.watchlist_critical_escalation` which
//     lands on the Wave 5 regulator inbox at severity high
//
// Endpoints (READ):
//   GET    /                                list dunning notices (filterable
//                                           by status / cycle / borrower)
//   GET    /watchlist                       open watchlist rows with cycle
//   GET    /watchlist/:id/events            escalation history for one row
//   GET    /:id                             one notice
//
// Endpoints (WRITE):
//   POST   /                                issue new notice manually
//   POST   /:id/ack                         borrower acknowledges receipt
//   POST   /:id/cure                        borrower marks cured w/ evidence
//   POST   /:id/withdraw                    lender withdraws notice
//
// Reads: admin / support / lender / ipp_developer / offtaker / trader.
// Writes: lender / admin / support for issue + withdraw; borrower roles for
//         ack + cure (must be the same borrower).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { initialDunningCycle } from '../utils/lender-escalation-spec';

const dunning = new Hono<HonoEnv>();
dunning.use('*', authMiddleware);

const READ_ROLES = new Set(['admin', 'support', 'lender', 'ipp_developer', 'offtaker', 'trader', 'carbon_fund']);
const LENDER_WRITE = new Set(['admin', 'support', 'lender']);
const BORROWER_ROLES = new Set(['ipp_developer', 'offtaker', 'trader', 'carbon_fund']);

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function requireRead(c: any) {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  return null;
}

// ─── Listing ──────────────────────────────────────────────────────────
dunning.get('/', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const status = c.req.query('status');
  const cycle = c.req.query('cycle');
  const borrower = c.req.query('borrower_id');
  const facility = c.req.query('facility_id');
  const where: string[] = [];
  const binds: any[] = [];
  // Borrower role can only see their own notices.
  if (BORROWER_ROLES.has(u.role)) {
    where.push('borrower_id = ?');
    binds.push(u.id);
  } else if (borrower) {
    where.push('borrower_id = ?');
    binds.push(borrower);
  }
  if (status) { where.push('status = ?'); binds.push(status); }
  if (cycle)  { where.push('cycle = ?');  binds.push(Number(cycle)); }
  if (facility) { where.push('facility_id = ?'); binds.push(facility); }
  const sql = `
    SELECT * FROM oe_lender_dunning_notices
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY issued_at DESC LIMIT 200
  `;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Watchlist surface (sliced for the UI dunning tab) ────────────────
dunning.get('/watchlist', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const binds: any[] = [];
  let where = 'cleared_at IS NULL';
  if (BORROWER_ROLES.has(u.role)) {
    where += ' AND participant_id = ?';
    binds.push(u.id);
  }
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_lender_watchlist
    WHERE ${where}
    ORDER BY watchlist_tier DESC, added_at DESC
    LIMIT 200
  `).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

dunning.get('/watchlist/:id/events', async (c) => {
  if (requireRead(c)) return requireRead(c)!;
  const u = getCurrentUser(c);
  const id = c.req.param('id');
  const wl = await c.env.DB.prepare('SELECT participant_id FROM oe_lender_watchlist WHERE id = ?').bind(id).first<{ participant_id: string | null }>();
  if (!wl) return c.json({ success: false, error: 'not_found' }, 404);
  if (BORROWER_ROLES.has(u.role) && wl.participant_id !== u.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_lender_watchlist_events
    WHERE watchlist_id = ?
    ORDER BY occurred_at ASC
  `).bind(id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Drill-down (must come after /watchlist routes) ──────────────────
dunning.get('/:id', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_lender_dunning_notices WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (BORROWER_ROLES.has(u.role) && row.borrower_id !== u.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  return c.json({ success: true, data: row });
});

// ─── Write: issue notice manually ─────────────────────────────────────
dunning.post('/', async (c) => {
  const u = getCurrentUser(c);
  if (!LENDER_WRITE.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({})) as {
    watchlist_id?: string; facility_id?: string; borrower_id?: string;
    trigger_signal?: string; title?: string; body?: Record<string, unknown>;
    cure_deadline_at?: string;
  };
  if (!body.facility_id || !body.borrower_id || !body.trigger_signal || !body.title) {
    return c.json({ success: false, error: 'facility_id + borrower_id + trigger_signal + title required' }, 400);
  }
  const id = newId('dun');
  const now = new Date();
  const init = initialDunningCycle(now);
  const deadline = body.cure_deadline_at || init.cure_deadline_at;
  await c.env.DB.prepare(`
    INSERT INTO oe_lender_dunning_notices
      (id, watchlist_id, facility_id, borrower_id, cycle, trigger_signal,
       title, body_json, status, issued_at, issued_by, cure_deadline_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'issued', ?, ?, ?)
  `).bind(
    id, body.watchlist_id || null, body.facility_id, body.borrower_id,
    body.trigger_signal, body.title,
    JSON.stringify(body.body || {}),
    now.toISOString(), u.id, deadline,
  ).run();

  if (body.watchlist_id) {
    await c.env.DB.prepare(`
      INSERT INTO oe_lender_watchlist_events
        (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
      VALUES (?, ?, 'dunning_issued', NULL, NULL, ?, ?, datetime('now'))
    `).bind(newId('we'), body.watchlist_id, u.id, `Manual cycle 1 notice ${id} issued`).run().catch(() => null);
  }

  await fireCascade({
    event: 'lender.dunning_issued',
    actor_id: u.id,
    entity_type: 'lender_dunning_notice',
    entity_id: id,
    data: {
      id, watchlist_id: body.watchlist_id || null,
      facility_id: body.facility_id, borrower_id: body.borrower_id,
      cycle: 1, trigger_signal: body.trigger_signal,
      cure_deadline_at: deadline,
    },
    env: c.env,
  }).catch(() => null);

  return c.json({ success: true, data: { id, cycle: 1, cure_deadline_at: deadline } }, 201);
});

// ─── Borrower acks receipt ────────────────────────────────────────────
dunning.post('/:id/ack', async (c) => {
  const u = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_lender_dunning_notices WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (BORROWER_ROLES.has(u.role) && row.borrower_id !== u.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  if (!BORROWER_ROLES.has(u.role) && !LENDER_WRITE.has(u.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  if (row.status !== 'issued') {
    return c.json({ success: false, error: `cannot ack from ${row.status}` }, 400);
  }
  const body = await c.req.json().catch(() => ({})) as { note?: string };
  await c.env.DB.prepare(`
    UPDATE oe_lender_dunning_notices
       SET status = 'acknowledged', acked_at = datetime('now'), acked_by = ?, updated_at = datetime('now')
     WHERE id = ?
  `).bind(u.id, id).run();
  if (row.watchlist_id) {
    await c.env.DB.prepare(`
      UPDATE oe_lender_watchlist SET borrower_acked_at = datetime('now') WHERE id = ?
    `).bind(row.watchlist_id).run().catch(() => null);
  }
  await fireCascade({
    event: 'lender.dunning_acked',
    actor_id: u.id,
    entity_type: 'lender_dunning_notice',
    entity_id: id,
    data: { id, watchlist_id: row.watchlist_id, borrower_id: row.borrower_id, note: body.note || null },
    env: c.env,
  }).catch(() => null);
  return c.json({ success: true });
});

// ─── Borrower marks cured ─────────────────────────────────────────────
dunning.post('/:id/cure', async (c) => {
  const u = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_lender_dunning_notices WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (BORROWER_ROLES.has(u.role) && row.borrower_id !== u.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  if (!BORROWER_ROLES.has(u.role) && !LENDER_WRITE.has(u.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  if (!['issued', 'acknowledged', 'overdue'].includes(row.status)) {
    return c.json({ success: false, error: `cannot cure from ${row.status}` }, 400);
  }
  const body = await c.req.json().catch(() => ({})) as { evidence_r2_key?: string; note?: string };
  if (!body.evidence_r2_key) {
    return c.json({ success: false, error: 'evidence_r2_key required' }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE oe_lender_dunning_notices
       SET status = 'cured', cured_at = datetime('now'), cured_by = ?,
           cure_evidence_r2_key = ?, updated_at = datetime('now')
     WHERE id = ?
  `).bind(u.id, body.evidence_r2_key, id).run();

  // If this was the last open notice on the watchlist row, clear it.
  if (row.watchlist_id) {
    const remaining = await c.env.DB.prepare(`
      SELECT COUNT(*) AS c FROM oe_lender_dunning_notices
      WHERE watchlist_id = ? AND status IN ('issued','acknowledged','overdue')
    `).bind(row.watchlist_id).first<{ c: number }>();
    if ((remaining?.c ?? 0) === 0) {
      await c.env.DB.prepare(`
        UPDATE oe_lender_watchlist SET cleared_at = datetime('now') WHERE id = ?
      `).bind(row.watchlist_id).run().catch(() => null);
      await c.env.DB.prepare(`
        INSERT INTO oe_lender_watchlist_events
          (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
        VALUES (?, ?, 'cleared', NULL, NULL, ?, ?, datetime('now'))
      `).bind(newId('we'), row.watchlist_id, u.id, `Cleared after cure of notice ${id}`).run().catch(() => null);
    }
    await c.env.DB.prepare(`
      INSERT INTO oe_lender_watchlist_events
        (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
      VALUES (?, ?, 'dunning_cured', NULL, NULL, ?, ?, datetime('now'))
    `).bind(newId('we'), row.watchlist_id, u.id, `Notice ${id} cured`).run().catch(() => null);
  }

  await fireCascade({
    event: 'lender.dunning_cured',
    actor_id: u.id,
    entity_type: 'lender_dunning_notice',
    entity_id: id,
    data: {
      id, watchlist_id: row.watchlist_id, facility_id: row.facility_id,
      borrower_id: row.borrower_id, evidence_r2_key: body.evidence_r2_key,
      note: body.note || null,
    },
    env: c.env,
  }).catch(() => null);
  return c.json({ success: true });
});

// ─── Lender withdraws notice ──────────────────────────────────────────
dunning.post('/:id/withdraw', async (c) => {
  const u = getCurrentUser(c);
  if (!LENDER_WRITE.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { reason?: string };
  if (!body.reason) return c.json({ success: false, error: 'reason required' }, 400);
  const row = await c.env.DB.prepare(`SELECT * FROM oe_lender_dunning_notices WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (!['issued', 'acknowledged', 'overdue'].includes(row.status)) {
    return c.json({ success: false, error: `cannot withdraw a ${row.status} notice` }, 409);
  }
  await c.env.DB.prepare(`
    UPDATE oe_lender_dunning_notices
       SET status = 'withdrawn', withdrawn_at = datetime('now'), withdrawn_by = ?,
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(u.id, id).run();
  return c.json({ success: true });
});

export default dunning;
