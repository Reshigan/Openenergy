// Briefing Routes — consolidated role-aware daily digest.
// Pulls from action_queue (assignee_id, not participant_id — the original stub
// used the wrong column), intelligence_items, unread notifications, upcoming
// invoice due dates, and recent trade matches.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const briefing = new Hono<HonoEnv>();
briefing.use('*', authMiddleware);

type Row = Record<string, unknown>;

async function marketSnapshot(c: any) {
  // Last trade match prices (fallback to sensible seeded figures).
  const lastMatches = (await c.env.DB.prepare(`
    SELECT energy_type, AVG(matched_price) AS avg_price, SUM(matched_volume_mwh) AS volume
    FROM trade_matches m
    JOIN trade_orders o ON m.buy_order_id = o.id
    WHERE m.matched_at >= datetime('now', '-7 days')
    GROUP BY energy_type
  `).all()).results as Array<{ energy_type: string; avg_price: number; volume: number }> | undefined;

  const snapshot: Record<string, { price_zar_per_mwh: number; volume_mwh: number }> = {
    solar: { price_zar_per_mwh: 185, volume_mwh: 0 },
    wind: { price_zar_per_mwh: 162, volume_mwh: 0 },
    hydro: { price_zar_per_mwh: 158, volume_mwh: 0 },
    battery: { price_zar_per_mwh: 245, volume_mwh: 0 },
  };
  for (const row of lastMatches || []) {
    if (snapshot[row.energy_type]) {
      snapshot[row.energy_type] = {
        price_zar_per_mwh: Math.round(Number(row.avg_price || 0)),
        volume_mwh: Math.round(Number(row.volume || 0) * 100) / 100,
      };
    }
  }
  return { ...snapshot, peak: { price_zar_per_mwh: 285, volume_mwh: 0 }, offpeak: { price_zar_per_mwh: 142, volume_mwh: 0 } };
}

// GET /briefing — consolidated daily briefing for the caller.
briefing.get('/', async (c) => {
  const user = getCurrentUser(c);
  const now = new Date().toISOString();

  const [actions, intel, notif, invoicesDue, tradesRecent] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, type, priority, entity_type, entity_id, title, description, due_date, created_at
      FROM action_queue
      WHERE assignee_id = ? AND status = 'pending'
      ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, created_at DESC
      LIMIT 10
    `).bind(user.id).all(),
    c.env.DB.prepare(`
      SELECT id, type, severity, title, description, entity_type, entity_id, action_required, created_at
      FROM intelligence_items
      WHERE (participant_id = ? OR participant_id IS NULL) AND resolved = 0
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC
      LIMIT 6
    `).bind(user.id).all(),
    c.env.DB.prepare(`
      SELECT id, type, title, body, created_at
      FROM notifications WHERE participant_id = ? AND read = 0
      ORDER BY created_at DESC LIMIT 8
    `).bind(user.id).all(),
    c.env.DB.prepare(`
      SELECT id, invoice_number, total_amount, due_date, status
      FROM invoices
      WHERE to_participant_id = ? AND status IN ('issued','partial','overdue')
        AND julianday(due_date) - julianday('now') <= 14
      ORDER BY due_date ASC LIMIT 10
    `).bind(user.id).all(),
    c.env.DB.prepare(`
      SELECT m.id, m.matched_price, m.matched_volume_mwh, m.matched_at, o.energy_type
      FROM trade_matches m
      JOIN trade_orders o ON m.buy_order_id = o.id
      WHERE o.participant_id = ? OR m.sell_order_id IN (SELECT id FROM trade_orders WHERE participant_id = ?)
      ORDER BY m.matched_at DESC LIMIT 5
    `).bind(user.id, user.id).all(),
  ]);

  const markets = await marketSnapshot(c);

  const summaryBits: string[] = [];
  const actionRows = (actions.results || []) as Row[];
  const intelRows = (intel.results || []) as Row[];
  const invoiceRows = (invoicesDue.results || []) as Row[];
  if (actionRows.length) summaryBits.push(`${actionRows.length} action${actionRows.length === 1 ? '' : 's'} awaiting you`);
  if (intelRows.some((r) => r.severity === 'critical')) summaryBits.push('critical intelligence flagged');
  else if (intelRows.length) summaryBits.push(`${intelRows.length} intelligence update${intelRows.length === 1 ? '' : 's'}`);
  if (invoiceRows.length) summaryBits.push(`${invoiceRows.length} invoice${invoiceRows.length === 1 ? '' : 's'} due in the next 14 days`);
  const summary = summaryBits.length
    ? `Good morning ${user.name || ''}. ${summaryBits.join('; ')}.`
    : `Good morning ${user.name || ''}. No outstanding actions — a quiet morning across your portfolio.`;

  return c.json({
    success: true,
    data: {
      date: now,
      role: user.role,
      summary,
      markets,
      action_items: actionRows,
      intelligence: intelRows,
      notifications: notif.results || [],
      invoices_due: invoiceRows,
      recent_trades: tradesRecent.results || [],
    },
  });
});

// POST /briefing/mark-read — mark all briefing notifications as read.
briefing.post('/mark-read', async (c) => {
  const user = getCurrentUser(c);
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE participant_id = ? AND read = 0').bind(user.id).run();
  return c.json({ success: true });
});

// POST /briefing/send — queue-only endpoint. Email delivery not wired (user
// opted to skip Resend/Clickatell). Returns success with queued=true so the
// UI can pretend we sent it for the demo.
briefing.post('/send', async (c) => {
  const user = getCurrentUser(c);
  const nid = 'ntf_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO notifications (id, participant_id, type, title, body, data, read, email_sent, created_at)
    VALUES (?, ?, 'daily_briefing', 'Your OpenEnergy morning briefing', 'See /briefing for the full digest.', ?, 0, 0, ?)
  `).bind(nid, user.id, JSON.stringify({ source: 'briefing.send' }), new Date().toISOString()).run();
  return c.json({ success: true, queued: true });
});

export default briefing;
