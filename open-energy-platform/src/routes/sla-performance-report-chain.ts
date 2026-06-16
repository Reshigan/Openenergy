// ═══════════════════════════════════════════════════════════════════════════════
// W217 — Support SLA Performance Report & Root Cause Analysis
// ITIL 4 Service Level Management + ISO 20000-1
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  SprStatus, SprAction, SprTier,
  deriveSprSla, SPR_HARD_TERMINALS,
  SPR_VALID_TRANSITIONS, SPR_STATE_TRANSITIONS,
  sprCrossesIntoRegulator, sprSlaBreachCrossesIntoRegulator,
} from '../utils/sla-performance-report-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function sprSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_sla_performance_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('approved','disputed','remediation_plan','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  const rows = overdue.results ?? [];
  const db = env.DB as D1Database;
  const stmts: D1PreparedStatement[] = [];
  for (const row of rows) {
    stmts.push(
      db.prepare(`UPDATE oe_sla_performance_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
        .bind(now, row.id),
    );
    if (sprSlaBreachCrossesIntoRegulator(row.report_tier as SprTier)) {
      stmts.push(
        db.prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                    VALUES (?,?,?,?,?,?,?)`)
          .bind(
            crypto.randomUUID(), 'sla_performance_report', row.id,
            'spr_sla_breach',
            `SLA performance report overdue — ${row.report_tier} — ${row.reporting_period}`,
            row.participant_id, now,
          ),
      );
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  for (const row of rows) {
    await fireCascade({
      event: 'spr_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'sla_performance_report', entity_id: row.id as string,
      data: { report_tier: row.report_tier, reporting_period: row.reporting_period },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: rows.length };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_sla_performance_reports WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    approved: all.filter(r => r.chain_status === 'approved').length,
    in_progress: all.filter(r => !['approved', 'disputed', 'remediation_plan', 'withdrawn'].includes(r.chain_status as string)).length,
    remediation_required: all.filter(r => r.chain_status === 'remediation_plan').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sla_performance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'sla_performance_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    report_tier?: SprTier;
    reporting_period: string;
    period_start: string;
    period_end: string;
    target_sla_pct?: number;
    reason?: string;
  }>();

  if (!body.reporting_period || !body.period_start || !body.period_end) {
    return c.json({ success: false, error: 'reporting_period, period_start, and period_end required' }, 422);
  }

  const isAdmin = ['admin'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.report_tier ?? 'standard';

  const now = new Date().toISOString();
  const slaDays = deriveSprSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_sla_performance_reports
      (id, participant_id, report_tier, reporting_period, period_start, period_end, target_sla_pct,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,'data_collection',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.reporting_period, body.period_start, body.period_end,
      body.target_sla_pct ?? 95.0,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'spr_created' as EventType,
    actor_id: user.id, entity_type: 'sla_performance_report', entity_id: id,
    data: { report_tier: tier, reporting_period: body.reporting_period },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sla_performance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: SprAction;
    reason?: string;
    total_incidents?: number;
    p1_count?: number;
    p2_count?: number;
    p1_sla_pct?: number;
    p2_sla_pct?: number;
    overall_sla_pct?: number;
    rca_triggered?: boolean;
    rca_lead?: string;
    rca_findings?: string;
    root_causes?: string;
    remediation_actions?: string;
    reviewer_name?: string;
    remediation_plan_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sla_performance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as SprStatus;
  if (SPR_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Report in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = SPR_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = SPR_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_sla_performance_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.total_incidents != null) { extra.push('total_incidents = ?'); eb.push(body.total_incidents); }
  if (body.p1_count != null) { extra.push('p1_count = ?'); eb.push(body.p1_count); }
  if (body.p2_count != null) { extra.push('p2_count = ?'); eb.push(body.p2_count); }
  if (body.p1_sla_pct != null) { extra.push('p1_sla_pct = ?'); eb.push(body.p1_sla_pct); }
  if (body.p2_sla_pct != null) { extra.push('p2_sla_pct = ?'); eb.push(body.p2_sla_pct); }
  if (body.overall_sla_pct != null) { extra.push('overall_sla_pct = ?'); eb.push(body.overall_sla_pct); }
  if (body.rca_triggered != null) { extra.push('rca_triggered = ?'); eb.push(body.rca_triggered ? 1 : 0); }
  if (body.rca_lead) { extra.push('rca_lead = ?'); eb.push(body.rca_lead); }
  if (body.rca_findings) { extra.push('rca_findings = ?'); eb.push(body.rca_findings); }
  if (action === 'complete_rca') { extra.push('rca_completed_at = ?'); eb.push(now); }
  if (body.root_causes) { extra.push('root_causes = ?'); eb.push(body.root_causes); }
  if (body.remediation_actions) { extra.push('remediation_actions = ?'); eb.push(body.remediation_actions); }
  if (body.reviewer_name) { extra.push('reviewer_name = ?'); eb.push(body.reviewer_name); }
  if (action === 'approve') { extra.push('review_completed_at = ?'); eb.push(now); }
  if (body.remediation_plan_ref) { extra.push('remediation_plan_ref = ?'); eb.push(body.remediation_plan_ref); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_sla_performance_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (sprCrossesIntoRegulator(action, row.report_tier as SprTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'sla_performance_report', id,
        `spr_${action}`,
        `SLA report ${action.replace(/_/g, ' ')} — ${row.report_tier} — ${row.reporting_period}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_sla_performance_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `spr_${action}` as EventType,
    actor_id: user.id, entity_type: 'sla_performance_report', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, report_tier: row.report_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_sla_performance_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await sprSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
