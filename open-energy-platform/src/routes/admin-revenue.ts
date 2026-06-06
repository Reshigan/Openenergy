// ═══════════════════════════════════════════════════════════════════════════
// Layer B — admin revenue control + analytics. Mounted at /api/admin/revenue.
// Admin-only. The schedule endpoints are the "flip a fee live" control (fees
// ship all-free; an operator sets is_enabled + rate with no deploy). The
// analytics endpoints read oe_platform_revenue / oe_fee_schedule only — never a
// live chain table — so they stay cheap as the revenue log grows.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

function requireAdmin(role: string): boolean { return role === 'admin'; }
// Billing period is a bound param (not injectable), but reject anything that
// isn't a YYYY-MM string before it reaches D1 — a malformed value can only
// match zero rows, so falling back to the current period is the honest default.
function period(c: Context<HonoEnv>): string {
  const q = c.req.query('period');
  return q && /^\d{4}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 7);
}

// ─── Schedule (rate card) ────────────────────────────────────────────────────
r.get('/schedule', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM oe_fee_schedule ORDER BY is_enabled DESC, trigger_event`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Flip a fee live / adjust the rate card. Only whitelisted columns are mutable.
r.patch('/schedule/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const existing = await c.env.DB.prepare(`SELECT * FROM oe_fee_schedule WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'not found' }, 404);

  const allowed: Record<string, 'int' | 'num' | 'text'> = {
    is_enabled: 'int', rate: 'num', min_fee_zar: 'num', max_fee_zar: 'num',
    payer_role: 'text', payer_resolution: 'text', fee_type: 'text',
    applicable_tiers: 'text', split_config: 'text', description: 'text',
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, t] of Object.entries(allowed)) {
    if (!(k in b)) continue;
    const v = b[k];
    if (t === 'int') { sets.push(`${k} = ?`); vals.push(v == null ? null : Number(v) ? 1 : 0); }
    else if (t === 'num') {
      // Guard the money columns: NaN/Infinity would store as NULL or a
      // non-standard SQLite float and silently corrupt the rate card.
      if (v != null) { const n = Number(v); if (!Number.isFinite(n)) return c.json({ success: false, error: `invalid number for ${k}` }, 400); sets.push(`${k} = ?`); vals.push(n); }
      else { sets.push(`${k} = ?`); vals.push(null); }
    }
    else { sets.push(`${k} = ?`); vals.push(v == null ? null : String(v)); }
  }
  if (sets.length === 0) return c.json({ success: false, error: 'no mutable fields supplied' }, 400);
  sets.push(`updated_at = ?`);
  vals.push(new Date().toISOString());
  vals.push(id);
  await c.env.DB.prepare(`UPDATE oe_fee_schedule SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  // Audit the rate-card change through the cascade (real platform event).
  await fireCascade({
    event: 'fee_schedule.updated' as EventType,
    actor_id: user.id,
    entity_type: 'fee_schedule',
    entity_id: id,
    data: { trigger_event: existing.trigger_event, changed: Object.keys(b) },
    env: c.env,
    chain_key: 'admin_revenue',
  }).catch(() => { /* best-effort audit; the UPDATE already committed */ });

  return c.json({ success: true });
});

// ─── Analytics (read-only, off the revenue log) ──────────────────────────────
r.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS events,
            COALESCE(SUM(fee_zar), 0) AS total_fee_zar,
            COALESCE(SUM(entity_value), 0) AS total_value_zar,
            SUM(CASE WHEN status = 'waived' THEN 1 ELSE 0 END) AS free_events,
            SUM(CASE WHEN status != 'waived' THEN 1 ELSE 0 END) AS paid_events
       FROM oe_platform_revenue WHERE billing_period = ?`,
  ).bind(p).first<any>();
  return c.json({ success: true, data: { period: p, ...row } });
});

r.get('/by-event', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const rs = await c.env.DB.prepare(
    `SELECT trigger_event, COUNT(*) AS events,
            COALESCE(SUM(fee_zar), 0) AS fee_zar,
            COALESCE(SUM(entity_value), 0) AS value_zar
       FROM oe_platform_revenue WHERE billing_period = ?
       GROUP BY trigger_event ORDER BY fee_zar DESC`,
  ).bind(p).all();
  return c.json({ success: true, data: rs.results || [] });
});

r.get('/by-role', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const rs = await c.env.DB.prepare(
    `SELECT COALESCE(payer_role, 'unattributed') AS payer_role,
            COUNT(*) AS events, COALESCE(SUM(fee_zar), 0) AS fee_zar
       FROM oe_platform_revenue WHERE billing_period = ?
       GROUP BY payer_role ORDER BY fee_zar DESC`,
  ).bind(p).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Leakage = billable events that fired R0 against real ZAR value (forgone revenue).
r.get('/leakage', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const rs = await c.env.DB.prepare(
    `SELECT trigger_event, COUNT(*) AS r0_events,
            COALESCE(SUM(entity_value), 0) AS forgone_value_zar
       FROM oe_platform_revenue
       WHERE billing_period = ? AND fee_zar = 0 AND entity_value > 0
       GROUP BY trigger_event ORDER BY forgone_value_zar DESC`,
  ).bind(p).all();
  return c.json({ success: true, data: rs.results || [] });
});

r.get('/top-events', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
  const rs = await c.env.DB.prepare(
    `SELECT trigger_event, COALESCE(SUM(fee_zar), 0) AS fee_zar, COUNT(*) AS events
       FROM oe_platform_revenue WHERE billing_period = ?
       GROUP BY trigger_event ORDER BY fee_zar DESC LIMIT ?`,
  ).bind(p, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Projected ARR: annualise the trailing period's actual fees (12×). Honest and
// cheap; a richer model (enabled-schedule × forecast volume) is a later refinement.
r.get('/arr', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(fee_zar), 0) AS period_fee_zar FROM oe_platform_revenue WHERE billing_period = ?`,
  ).bind(p).first<any>();
  const monthly = Number(row?.period_fee_zar || 0);
  return c.json({ success: true, data: { period: p, monthly_fee_zar: monthly, projected_arr_zar: monthly * 12 } });
});

export default r;
