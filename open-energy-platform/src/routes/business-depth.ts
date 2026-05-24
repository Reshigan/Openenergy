// ════════════════════════════════════════════════════════════════════════
// business-depth — extra business logic surfaces:
//   • Late-payment fees     — list / waive / charge
//   • Variation orders      — raise / lender-review / offtaker-review /
//                              approve / reject
//   • Prime-rate register   — operator-editable rate that drives fees
//
// Mounted at /api/business-depth.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const adminOrSupport = (role: string) => ['admin', 'support'].includes(role);

// ─── Late-payment fees ──────────────────────────────────────────────────
r.get('/late-fees', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  // Caller sees only fees against invoices they're a party to, unless admin.
  const sql = adminOrSupport(user.role)
    ? `SELECT * FROM oe_late_payment_fees ${status ? `WHERE status = ?` : ''} ORDER BY computed_at DESC LIMIT 200`
    : `SELECT lpf.* FROM oe_late_payment_fees lpf
         JOIN invoices i ON i.id = lpf.invoice_id
         WHERE (i.from_participant_id = ? OR i.to_participant_id = ?)
           ${status ? `AND lpf.status = ?` : ''}
         ORDER BY lpf.computed_at DESC LIMIT 200`;
  const binds = adminOrSupport(user.role) ? (status ? [status] : []) : (status ? [user.id, user.id, status] : [user.id, user.id]);
  const rows = await c.env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/late-fees/:id/waive', requireStepUp('settlement.late_fee_waive.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOrSupport(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.reason) return c.json({ success: false, error: 'reason required' }, 400);
  const res = await c.env.DB.prepare(`
    UPDATE oe_late_payment_fees
    SET status = 'waived', waived_by = ?, waiver_reason = ?
    WHERE id = ? AND status = 'pending'
  `).bind(user.id, b.reason, id).run();
  if (!res.meta.changes) return c.json({ success: false, error: 'not found or not pending' }, 404);
  await fireCascade({
    event: 'settlement.late_fee_waived',
    actor_id: user.id,
    entity_type: 'late_payment_fee',
    entity_id: String(id),
    data: { id, reason: b.reason, waived_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/late-fees/:id/charge', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOrSupport(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE oe_late_payment_fees SET status = 'charged' WHERE id = ? AND status = 'pending'`
  ).bind(id).run();
  await fireCascade({
    event: 'settlement.late_fee_charged',
    actor_id: user.id,
    entity_type: 'late_payment_fee',
    entity_id: String(id),
    data: { id, charged_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Prime-rate register ───────────────────────────────────────────────
r.get('/prime-rate', async (c) => {
  const cur = await c.env.DB.prepare(
    `SELECT * FROM oe_prime_rate WHERE effective_from <= date('now') ORDER BY effective_from DESC LIMIT 1`
  ).first();
  const hist = await c.env.DB.prepare(
    `SELECT * FROM oe_prime_rate ORDER BY effective_from DESC LIMIT 20`
  ).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: { current: cur || null, history: hist.results || [] } });
});

r.post('/prime-rate', requireStepUp('settlement.prime_rate_update.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOrSupport(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.effective_from || b.rate_pct == null) {
    return c.json({ success: false, error: 'effective_from + rate_pct required' }, 400);
  }
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_prime_rate (effective_from, rate_pct, source, updated_by)
    VALUES (?,?,?,?)
  `).bind(b.effective_from, Number(b.rate_pct), b.source || 'manual', user.id).run();
  await fireCascade({
    event: 'settlement.prime_rate_updated',
    actor_id: user.id,
    entity_type: 'prime_rate',
    entity_id: String(b.effective_from),
    data: {
      effective_from: b.effective_from,
      rate_pct: Number(b.rate_pct),
      source: b.source || 'manual',
      updated_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Variation orders ──────────────────────────────────────────────────
r.get('/variation-orders', async (c) => {
  const project = c.req.query('project_id');
  const status = c.req.query('status');
  const sql = `SELECT * FROM oe_variation_orders
    WHERE 1=1 ${project ? 'AND project_id = ?' : ''} ${status ? 'AND status = ?' : ''}
    ORDER BY raised_at DESC LIMIT 200`;
  const binds = [project, status].filter((x) => x !== undefined) as string[];
  const rows = await c.env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/variation-orders', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['project_id', 'category', 'scope_change', 'rationale'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  if (!['scope', 'cost', 'schedule', 'equipment', 'other'].includes(String(b.category))) {
    return c.json({ success: false, error: 'category must be one of scope|cost|schedule|equipment|other' }, 400);
  }
  // Auto-number per project — next sequential VO number.
  const existing = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_variation_orders WHERE project_id = ?`
  ).bind(b.project_id).first<{ n: number }>();
  const voNum = `VO-${String((existing?.n || 0) + 1).padStart(3, '0')}`;
  const id = genId('vo');
  await c.env.DB.prepare(`
    INSERT INTO oe_variation_orders
      (id, project_id, raised_by, vo_number, category, scope_change,
       cost_delta_zar, schedule_delta_days, rationale, evidence_r2_key)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.project_id, user.id, voNum, b.category, String(b.scope_change).slice(0, 4000),
    b.cost_delta_zar != null ? Number(b.cost_delta_zar) : null,
    b.schedule_delta_days != null ? Number(b.schedule_delta_days) : null,
    String(b.rationale).slice(0, 4000),
    b.evidence_r2_key || null,
  ).run();
  await fireCascade({
    event: 'ipp.variation_order_raised',
    actor_id: user.id,
    entity_type: 'variation_order',
    entity_id: id,
    data: {
      id, project_id: b.project_id, vo_number: voNum,
      category: b.category,
      cost_delta_zar: b.cost_delta_zar != null ? Number(b.cost_delta_zar) : null,
      schedule_delta_days: b.schedule_delta_days != null ? Number(b.schedule_delta_days) : null,
      raised_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, vo_number: voNum } }, 201);
});

r.post('/variation-orders/:id/lender-decision', requireStepUp('ipp.variation_decision.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'lender'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!['approved', 'rejected'].includes(String(b.decision))) {
    return c.json({ success: false, error: "decision must be 'approved' or 'rejected'" }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE oe_variation_orders
    SET lender_decision = ?, lender_decided_by = ?, lender_decided_at = datetime('now'),
        lender_comment  = ?,
        status = CASE
          WHEN ? = 'rejected' THEN 'rejected'
          WHEN offtaker_decision = 'approved' THEN 'approved'
          ELSE 'offtaker_review'
        END,
        rejected_at     = CASE WHEN ? = 'rejected' THEN datetime('now') ELSE rejected_at END,
        rejected_reason = CASE WHEN ? = 'rejected' THEN ? ELSE rejected_reason END,
        approved_at     = CASE WHEN ? = 'approved' AND offtaker_decision = 'approved' THEN datetime('now') ELSE approved_at END
    WHERE id = ?
  `).bind(
    b.decision, user.id, b.comment || null,
    b.decision, b.decision, b.decision, b.comment || null, b.decision, id,
  ).run();
  await fireCascade({
    event: 'ipp.variation_order_lender_decided',
    actor_id: user.id,
    entity_type: 'variation_order',
    entity_id: String(id),
    data: { id, decision: b.decision, comment: b.comment || null, lender_id: user.id },
    env: c.env,
  });
  const updated = await c.env.DB.prepare(`SELECT status FROM oe_variation_orders WHERE id = ?`).bind(id).first<{ status: string }>();
  if (updated?.status === 'approved') {
    await fireCascade({
      event: 'ipp.variation_order_approved',
      actor_id: user.id,
      entity_type: 'variation_order',
      entity_id: String(id),
      data: { id, both_approved_at: 'lender' },
      env: c.env,
    });
  } else if (updated?.status === 'rejected') {
    await fireCascade({
      event: 'ipp.variation_order_rejected',
      actor_id: user.id,
      entity_type: 'variation_order',
      entity_id: String(id),
      data: { id, rejected_by: 'lender', reason: b.comment || null },
      env: c.env,
    });
  }
  return c.json({ success: true });
});

r.post('/variation-orders/:id/offtaker-decision', requireStepUp('ipp.variation_decision.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'offtaker'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!['approved', 'rejected'].includes(String(b.decision))) {
    return c.json({ success: false, error: "decision must be 'approved' or 'rejected'" }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE oe_variation_orders
    SET offtaker_decision = ?, offtaker_decided_by = ?, offtaker_decided_at = datetime('now'),
        offtaker_comment  = ?,
        status = CASE
          WHEN ? = 'rejected' THEN 'rejected'
          WHEN lender_decision = 'approved' THEN 'approved'
          ELSE 'lender_review'
        END,
        rejected_at     = CASE WHEN ? = 'rejected' THEN datetime('now') ELSE rejected_at END,
        rejected_reason = CASE WHEN ? = 'rejected' THEN ? ELSE rejected_reason END,
        approved_at     = CASE WHEN ? = 'approved' AND lender_decision = 'approved' THEN datetime('now') ELSE approved_at END
    WHERE id = ?
  `).bind(
    b.decision, user.id, b.comment || null,
    b.decision, b.decision, b.decision, b.comment || null, b.decision, id,
  ).run();
  await fireCascade({
    event: 'ipp.variation_order_offtaker_decided',
    actor_id: user.id,
    entity_type: 'variation_order',
    entity_id: String(id),
    data: { id, decision: b.decision, comment: b.comment || null, offtaker_id: user.id },
    env: c.env,
  });
  const updated = await c.env.DB.prepare(`SELECT status FROM oe_variation_orders WHERE id = ?`).bind(id).first<{ status: string }>();
  if (updated?.status === 'approved') {
    await fireCascade({
      event: 'ipp.variation_order_approved',
      actor_id: user.id,
      entity_type: 'variation_order',
      entity_id: String(id),
      data: { id, both_approved_at: 'offtaker' },
      env: c.env,
    });
  } else if (updated?.status === 'rejected') {
    await fireCascade({
      event: 'ipp.variation_order_rejected',
      actor_id: user.id,
      entity_type: 'variation_order',
      entity_id: String(id),
      data: { id, rejected_by: 'offtaker', reason: b.comment || null },
      env: c.env,
    });
  }
  return c.json({ success: true });
});

r.post('/variation-orders/:id/withdraw', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const cur = await c.env.DB.prepare(`SELECT raised_by, status FROM oe_variation_orders WHERE id = ?`).bind(id).first<any>();
  if (!cur) return c.json({ success: false, error: 'not found' }, 404);
  if (cur.raised_by !== user.id && !adminOrSupport(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  if (!['raised', 'lender_review', 'offtaker_review'].includes(cur.status)) return c.json({ success: false, error: 'cannot withdraw past current state' }, 400);
  await c.env.DB.prepare(`UPDATE oe_variation_orders SET status = 'withdrawn' WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'ipp.variation_order_withdrawn',
    actor_id: user.id,
    entity_type: 'variation_order',
    entity_id: String(id),
    data: { id, withdrawn_by: user.id, prior_status: cur.status },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Late-fee compute (used by the daily cron, exported) ────────────────
// Walks every invoice that is `issued|partial|overdue` past its due_date
// and either creates or updates a pending fee row. Caps accrual at 90 days.
export async function computeLatePaymentFees(env: HonoEnv['Bindings']): Promise<{ computed: number; total_zar: number }> {
  // Pull the prime rate that's currently effective.
  const rate = await env.DB.prepare(
    `SELECT rate_pct FROM oe_prime_rate WHERE effective_from <= date('now') ORDER BY effective_from DESC LIMIT 1`
  ).first<{ rate_pct: number }>().catch(() => null);
  const annualRate = (rate?.rate_pct || 11.75) + 1; // prime + 1%
  const dailyRate = annualRate / 365 / 100;

  // Mark issued/partial invoices as overdue once past due_date.
  await env.DB.prepare(
    `UPDATE invoices SET status = 'overdue'
     WHERE status IN ('issued','viewed','partial') AND due_date < date('now')`
  ).run().catch(() => null);

  const overdues = await env.DB.prepare(`
    SELECT id, to_participant_id, total_amount, COALESCE(paid_amount,0) AS paid_amount,
           CAST(julianday('now') - julianday(due_date) AS INTEGER) AS days_over
    FROM invoices
    WHERE status = 'overdue' AND COALESCE(paid_amount,0) < total_amount
  `).all<any>().catch(() => ({ results: [] as any[] }));

  let computed = 0;
  let totalZar = 0;
  for (const inv of ((overdues.results || []) as any[])) {
    const principal = Number(inv.total_amount) - Number(inv.paid_amount);
    const daysCapped = Math.min(90, Math.max(1, Number(inv.days_over)));
    const fee = Math.round(principal * dailyRate * daysCapped * 100) / 100;
    const id = genId('lpf');
    // INSERT OR REPLACE on (invoice_id) — keep a single live row per invoice.
    await env.DB.prepare(`
      INSERT INTO oe_late_payment_fees
        (id, invoice_id, participant_id, invoice_total, days_overdue,
         annual_rate_pct, fee_zar, status)
      VALUES (?,?,?,?,?,?,?,'pending')
      ON CONFLICT(id) DO NOTHING
    `).bind(id, inv.id, inv.to_participant_id, Number(inv.total_amount), daysCapped, annualRate, fee).run().catch(() => null);
    // Update the most recent pending row for this invoice to current accrual.
    await env.DB.prepare(`
      UPDATE oe_late_payment_fees
      SET days_overdue = ?, annual_rate_pct = ?, fee_zar = ?, computed_at = datetime('now')
      WHERE invoice_id = ? AND status = 'pending'
    `).bind(daysCapped, annualRate, fee, inv.id).run().catch(() => null);
    computed += 1; totalZar += fee;
  }
  return { computed, total_zar: Math.round(totalZar * 100) / 100 };
}

export default r;
