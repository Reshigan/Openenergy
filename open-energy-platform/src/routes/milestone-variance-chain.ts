// ═══════════════════════════════════════════════════════════════════════════════
// W207 — IPP Milestone & Schedule Variance Report
// REIPPPP Schedule of Compliance + NERSA Construction Permit + DBSA/DFI milestones
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  MvsStatus, MvsAction, MvsRiskTier,
  deriveMvsSla, MVS_HARD_TERMINALS,
  MVS_VALID_TRANSITIONS, MVS_STATE_TRANSITIONS,
  mvsCrossesIntoRegulator, mvsSlaBreachCrossesIntoRegulator,
} from '../utils/milestone-variance-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function mvsSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_milestone_variance_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('dfi_accepted','remediation_accepted','critical_delay','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_milestone_variance_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (mvsSlaBreachCrossesIntoRegulator(row.risk_tier as MvsRiskTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'milestone_variance_report', row.id,
          'mvs_sla_breach',
          `Milestone variance report SLA breached — ${row.report_period} — ${row.risk_tier} risk`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'mvs_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'milestone_variance_report', entity_id: row.id as string,
      data: { report_period: row.report_period, risk_tier: row.risk_tier },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support', 'regulator', 'lender'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_milestone_variance_reports WHERE participant_id = ? ORDER BY report_period DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    accepted: all.filter(r => ['dfi_accepted', 'remediation_accepted'].includes(r.chain_status as string)).length,
    pending: all.filter(r => !MVS_HARD_TERMINALS.has(r.chain_status as MvsStatus)).length,
    critical_delay: all.filter(r => r.chain_status === 'critical_delay').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_milestone_variance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator', 'lender'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'milestone_variance_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    project_id?: string;
    risk_tier?: MvsRiskTier;
    report_period: string;
    reporting_date: string;
    original_cod_date?: string;
    total_milestones?: number;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const riskTier = body.risk_tier ?? 'minor';

  // Duplicate check
  const existing = await c.env.DB
    .prepare(`SELECT id FROM oe_milestone_variance_reports WHERE participant_id = ? AND report_period = ?`)
    .bind(participantId, body.report_period)
    .first<{ id: string }>();
  if (existing) {
    return c.json({ success: false, error: `Milestone variance report for ${body.report_period} already exists` }, 409);
  }

  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + deriveMvsSla(riskTier) * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_milestone_variance_reports
      (id, participant_id, project_id, risk_tier, report_period, reporting_date,
       original_cod_date, total_milestones,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.project_id ?? null, riskTier,
      body.report_period, body.reporting_date,
      body.original_cod_date ?? null, body.total_milestones ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'mvs_report_created' as EventType,
    actor_id: user.id, entity_type: 'milestone_variance_report', entity_id: id,
    data: { report_period: body.report_period, risk_tier: riskTier },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_milestone_variance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: MvsAction;
    reason?: string;
    milestones_on_track?: number;
    milestones_delayed?: number;
    milestones_critical?: number;
    overall_schedule_variance_days?: number;
    critical_path_float_days?: number;
    cod_forecast_date?: string;
    ie_firm_name?: string;
    ie_report_ref?: string;
    dfi_submission_ref?: string;
    remediation_plan_ref?: string;
    remediation_deadline?: string;
    critical_delay_description?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_milestone_variance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as MvsStatus;
  if (MVS_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Report in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = MVS_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = MVS_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_milestone_variance_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.milestones_on_track != null) { extra.push('milestones_on_track = ?'); eb.push(body.milestones_on_track); }
  if (body.milestones_delayed != null) { extra.push('milestones_delayed = ?'); eb.push(body.milestones_delayed); }
  if (body.milestones_critical != null) { extra.push('milestones_critical = ?'); eb.push(body.milestones_critical); }
  if (body.overall_schedule_variance_days != null) { extra.push('overall_schedule_variance_days = ?'); eb.push(body.overall_schedule_variance_days); }
  if (body.critical_path_float_days != null) { extra.push('critical_path_float_days = ?'); eb.push(body.critical_path_float_days); }
  if (body.cod_forecast_date) { extra.push('cod_forecast_date = ?'); eb.push(body.cod_forecast_date); }
  if (body.ie_firm_name) { extra.push('ie_firm_name = ?'); eb.push(body.ie_firm_name); }
  if (body.ie_report_ref) { extra.push('ie_report_ref = ?'); eb.push(body.ie_report_ref); }
  if (action === 'certify_ie') { extra.push('ie_certified_at = ?'); eb.push(now); }
  if (body.dfi_submission_ref) { extra.push('dfi_submission_ref = ?'); eb.push(body.dfi_submission_ref); }
  if (action === 'dfi_raises_queries') { extra.push('dfi_query_count = dfi_query_count + 1', 'dfi_last_query_at = ?'); eb.push(now); }
  if (action === 'dfi_accept') { extra.push('dfi_accepted_at = ?'); eb.push(now); }
  if (body.remediation_plan_ref) { extra.push('remediation_plan_ref = ?'); eb.push(body.remediation_plan_ref); }
  if (body.remediation_deadline) { extra.push('remediation_deadline = ?'); eb.push(body.remediation_deadline); }
  if (body.critical_delay_description) { extra.push('critical_delay_description = ?'); eb.push(body.critical_delay_description); }
  if (action === 'declare_critical_delay') { extra.push('critical_delay_reported_at = ?'); eb.push(now); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_milestone_variance_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (mvsCrossesIntoRegulator(action, row.risk_tier as MvsRiskTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'milestone_variance_report', id,
        `mvs_${action}`,
        `Milestone variance report ${action} — ${row.report_period} — ${row.risk_tier} risk`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_milestone_variance_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `mvs_${action}` as EventType,
    actor_id: user.id, entity_type: 'milestone_variance_report', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, report_period: row.report_period },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_milestone_variance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await mvsSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
