// ═══════════════════════════════════════════════════════════════════════════════
// W204 — Offtaker SLB KPI & Sustainability-Linked PPA Ratchet
// ICMA SLB Principles 2023 + JSE Sustainability Rules + NERSA ERA §4
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import { resolveNextStatus } from '../utils/chain-sla';
import {
  SlbStatus, SlbAction, SlbTier,
  deriveSlbSla, SLB_HARD_TERMINALS,
  SLB_VALID_TRANSITIONS, SLB_STATE_TRANSITIONS,
  slbCrossesIntoRegulator, slbSlaBreachCrossesIntoRegulator,
} from '../utils/slb-kpi-spec';
import { badEnum } from '../utils/validation';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'offtaker', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function slbSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_slb_kpi_ratchets
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('ratchet_applied','ratchet_waived','kpi_missed','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_slb_kpi_ratchets SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (slbSlaBreachCrossesIntoRegulator(row.slb_tier as SlbTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'slb_kpi_ratchet', row.id,
          'slb_kpi_sla_breach',
          `SLB KPI ratchet SLA breached — ${row.kpi_period} — ${row.slb_tier} tier`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'slb_kpi_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'slb_kpi_ratchet', entity_id: row.id as string,
      data: { kpi_period: row.kpi_period, slb_tier: row.slb_tier },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_slb_kpi_ratchets WHERE participant_id = ? ORDER BY kpi_period DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    applied: all.filter(r => r.chain_status === 'ratchet_applied').length,
    pending: all.filter(r => !SLB_HARD_TERMINALS.has(r.chain_status as SlbStatus)).length,
    kpi_missed: all.filter(r => r.chain_status === 'kpi_missed').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_slb_kpi_ratchets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'slb_kpi_ratchet' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    ppa_ref?: string;
    slb_tier?: SlbTier;
    kpi_period: string;
    period_start: string;
    period_end: string;
    kpi_name?: string;
    kpi_target_value?: number;
    kpi_unit?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.slb_tier ?? 'green_finance';
  const tierErr = badEnum('slb_tier', body.slb_tier, ['voluntary', 'green_finance', 'listed', 'regulatory']);
  if (tierErr) return c.json({ success: false, error: tierErr }, 422);

  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + deriveSlbSla(tier) * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_slb_kpi_ratchets
      (id, participant_id, ppa_ref, slb_tier, kpi_period, period_start, period_end,
       kpi_name, kpi_target_value, kpi_unit,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'kpi_pending',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.ppa_ref ?? null, tier,
      body.kpi_period, body.period_start, body.period_end,
      body.kpi_name ?? null, body.kpi_target_value ?? null, body.kpi_unit ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'slb_kpi_created' as EventType,
    actor_id: user.id, entity_type: 'slb_kpi_ratchet', entity_id: id,
    data: { kpi_period: body.kpi_period, slb_tier: tier },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_slb_kpi_ratchets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: SlbAction;
    reason?: string;
    kpi_actual_value?: number;
    kpi_data_source?: string;
    verifier_name?: string;
    verifier_report_ref?: string;
    kpi_met?: boolean;
    ratchet_basis_points?: number;
    ratchet_zar?: number;
    ratchet_direction?: string;
    dispute_ref?: string;
    arbitration_ref?: string;
    dispute_description?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_slb_kpi_ratchets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as SlbStatus;
  if (SLB_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `KPI ratchet in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = SLB_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const rdErr = badEnum('ratchet_direction', body.ratchet_direction, ['step_up', 'step_down', 'neutral']);
  if (rdErr) return c.json({ success: false, error: rdErr }, 422);

  // sla_breach holds position (flag event), never rewinds to the mapped state.
  const nextStatus = resolveNextStatus(action, currentStatus, SLB_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (!row.sla_breached && (action === 'sla_breach' || (row.sla_deadline && row.sla_deadline < now))) {
    await c.env.DB.prepare(`UPDATE oe_slb_kpi_ratchets SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.kpi_actual_value != null) { extra.push('kpi_actual_value = ?'); eb.push(body.kpi_actual_value); }
  if (body.kpi_data_source) { extra.push('kpi_data_source = ?'); eb.push(body.kpi_data_source); }
  if (action === 'submit_kpi_data') { extra.push('kpi_measured_at = ?'); eb.push(now); }
  if (body.verifier_name) { extra.push('verifier_name = ?'); eb.push(body.verifier_name); }
  if (body.verifier_report_ref) { extra.push('verifier_report_ref = ?'); eb.push(body.verifier_report_ref); }
  if (action === 'certify_kpi') { extra.push('verified_at = ?'); eb.push(now); }
  if (body.kpi_met != null) { extra.push('kpi_met = ?'); eb.push(body.kpi_met ? 1 : 0); }
  if (body.ratchet_basis_points != null) { extra.push('ratchet_basis_points = ?'); eb.push(body.ratchet_basis_points); }
  if (body.ratchet_zar != null) { extra.push('ratchet_zar = ?'); eb.push(body.ratchet_zar); }
  if (body.ratchet_direction) { extra.push('ratchet_direction = ?'); eb.push(body.ratchet_direction); }
  if (body.dispute_ref) { extra.push('dispute_ref = ?'); eb.push(body.dispute_ref); }
  if (body.arbitration_ref) { extra.push('arbitration_ref = ?'); eb.push(body.arbitration_ref); }
  if (body.dispute_description) { extra.push('dispute_description = ?'); eb.push(body.dispute_description); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_slb_kpi_ratchets SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (slbCrossesIntoRegulator(action, row.slb_tier as SlbTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'slb_kpi_ratchet', id,
        `slb_kpi_${action}`,
        `SLB KPI ratchet ${action} — ${row.kpi_period} — ${row.slb_tier} tier`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_slb_kpi_ratchets SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `slb_kpi_${action}` as EventType,
    actor_id: user.id, entity_type: 'slb_kpi_ratchet', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, kpi_period: row.kpi_period },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_slb_kpi_ratchets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await slbSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
