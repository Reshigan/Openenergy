// ═══════════════════════════════════════════════════════════════════════════════
// W222 — Trader Cross-Border Transaction & Regulatory Pre-Approval
// FMA §17 + SARB ExCon / Currency & Exchanges Act §9
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CbtStatus, CbtAction, CbtTier,
  deriveCbtSla, CBT_HARD_TERMINALS,
  CBT_VALID_TRANSITIONS, CBT_STATE_TRANSITIONS,
  cbtCrossesIntoRegulator, cbtSlaBreachCrossesIntoRegulator,
} from '../utils/cross-border-trade-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'trader', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function cbtSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_cross_border_trades
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('trade_executed','fsca_rejected','sarb_rejected','withdrawn','expired')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_cross_border_trades SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (cbtSlaBreachCrossesIntoRegulator(row.cbt_tier as CbtTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'cross_border_trade', row.id,
          'cbt_sla_breach',
          `Cross-border trade SLA breached — ${row.cbt_tier} — ${row.counterparty_jurisdiction} — R${row.notional_zar ?? '?'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'cbt_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'cross_border_trade', entity_id: row.id as string,
      data: { cbt_tier: row.cbt_tier, counterparty_jurisdiction: row.counterparty_jurisdiction },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'trader', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_cross_border_trades WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    pending_approval: all.filter(r => !['trade_executed','fsca_rejected','sarb_rejected','withdrawn','expired'].includes(r.chain_status as string)).length,
    approved: all.filter(r => r.chain_status === 'fully_approved').length,
    executed: all.filter(r => r.chain_status === 'trade_executed').length,
    rejected: all.filter(r => ['fsca_rejected','sarb_rejected'].includes(r.chain_status as string)).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_cross_border_trades WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'trader', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'cross_border_trade' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    cbt_tier?: CbtTier;
    counterparty_jurisdiction?: string;
    counterparty_type?: string;
    trade_type?: string;
    notional_zar?: number;
    notional_currency?: string;
    underlying_trade_ref?: string;
    algo_cert_ref?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.cbt_tier ?? 'standard';

  const now = new Date().toISOString();
  const slaDays = deriveCbtSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_cross_border_trades
      (id, participant_id, cbt_tier, counterparty_jurisdiction, counterparty_type,
       trade_type, notional_zar, notional_currency, underlying_trade_ref, algo_cert_ref,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pre_approval_required',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.counterparty_jurisdiction ?? null,
      body.counterparty_type ?? null, body.trade_type ?? null,
      body.notional_zar ?? null, body.notional_currency ?? 'ZAR',
      body.underlying_trade_ref ?? null, body.algo_cert_ref ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'cbt_created' as EventType,
    actor_id: user.id, entity_type: 'cross_border_trade', entity_id: id,
    data: { cbt_tier: tier, counterparty_jurisdiction: body.counterparty_jurisdiction },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_cross_border_trades WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CbtAction;
    reason?: string;
    fsca_application_ref?: string;
    fsca_approval_ref?: string;
    fsca_rejection_reason?: string;
    sarb_application_ref?: string;
    sarb_approval_ref?: string;
    sarb_rejection_reason?: string;
    trade_executed_at?: string;
    trade_settlement_date?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_cross_border_trades WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CbtStatus;
  if (CBT_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Trade in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CBT_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, CBT_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_cross_border_trades SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'submit_fsca_application') {
    extra.push('fsca_application_ref = ?', 'fsca_submitted_at = ?');
    eb.push(body.fsca_application_ref ?? null, now);
  }
  if (action === 'fsca_review_commenced') { extra.push('fsca_review_started_at = ?'); eb.push(now); }
  if (action === 'fsca_grant_approval') {
    extra.push('fsca_approval_ref = ?', 'fsca_approved_at = ?');
    eb.push(body.fsca_approval_ref ?? null, now);
  }
  if (action === 'fsca_reject') {
    extra.push('fsca_rejection_reason = ?');
    eb.push(body.fsca_rejection_reason ?? null);
  }
  if (action === 'submit_sarb_application') {
    extra.push('sarb_application_ref = ?', 'sarb_submitted_at = ?');
    eb.push(body.sarb_application_ref ?? null, now);
  }
  if (action === 'sarb_review_commenced') { extra.push('sarb_review_started_at = ?'); eb.push(now); }
  if (action === 'obtain_full_approval') {
    extra.push('sarb_approval_ref = ?', 'sarb_approved_at = ?');
    eb.push(body.sarb_approval_ref ?? null, now);
  }
  if (action === 'sarb_reject') {
    extra.push('sarb_rejection_reason = ?');
    eb.push(body.sarb_rejection_reason ?? null);
  }
  if (action === 'execute_trade') {
    extra.push('trade_executed_at = ?', 'trade_settlement_date = ?');
    eb.push(body.trade_executed_at ?? now, body.trade_settlement_date ?? null);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_cross_border_trades SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (cbtCrossesIntoRegulator(action, row.cbt_tier as CbtTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'cross_border_trade', id,
        `cbt_${action}`,
        `Cross-border trade ${action.replace(/_/g, ' ')} — ${row.cbt_tier} — ${row.counterparty_jurisdiction} — R${row.notional_zar ?? '?'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_cross_border_trades SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `cbt_${action}` as EventType,
    actor_id: user.id, entity_type: 'cross_border_trade', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, cbt_tier: row.cbt_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_cross_border_trades WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'trader', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await cbtSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
