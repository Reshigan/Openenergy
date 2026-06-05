// ═══════════════════════════════════════════════════════════════════════════════
// W216 — Trader FSCA Periodic Conduct Report
// FSCA Conduct Standard 1/2020 + FMA Chapter X + FAIS s18
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  FcrStatus, FcrAction, FcrTier,
  deriveFcrSla, FCR_HARD_TERMINALS,
  FCR_VALID_TRANSITIONS, FCR_STATE_TRANSITIONS,
  fcrCrossesIntoRegulator, fcrSlaBreachCrossesIntoRegulator,
} from '../utils/fsca-conduct-report-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'trader', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function fcrSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_fsca_conduct_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('accepted','rejected','escalated','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_fsca_conduct_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (fcrSlaBreachCrossesIntoRegulator(row.report_tier as FcrTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'fsca_conduct_report', row.id,
          'fcr_sla_breach',
          `FSCA conduct report SLA breached — ${row.report_tier} — ${row.reporting_period}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'fcr_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'fsca_conduct_report', entity_id: row.id as string,
      data: { report_tier: row.report_tier, reporting_period: row.reporting_period },
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
    .prepare(`SELECT * FROM oe_fsca_conduct_reports WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    accepted: all.filter(r => r.chain_status === 'accepted').length,
    in_progress: all.filter(r => !['accepted', 'rejected', 'escalated', 'withdrawn'].includes(r.chain_status as string)).length,
    rejected: all.filter(r => r.chain_status === 'rejected').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_conduct_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'trader', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'fsca_conduct_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    report_tier?: FcrTier;
    reporting_period: string;
    reporting_year: number;
    is_annual?: boolean;
    total_notional_zar?: number;
    client_count?: number;
    complaint_count?: number;
    compliance_officer?: string;
    reason?: string;
  }>();

  if (!body.reporting_period || !body.reporting_year) {
    return c.json({ success: false, error: 'reporting_period and reporting_year required' }, 422);
  }

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.report_tier ?? 'professional';

  const now = new Date().toISOString();
  const slaDays = deriveFcrSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_fsca_conduct_reports
      (id, participant_id, report_tier, reporting_period, reporting_year, is_annual,
       total_notional_zar, client_count, complaint_count, compliance_officer,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.reporting_period, body.reporting_year,
      body.is_annual ? 1 : 0,
      body.total_notional_zar ?? null, body.client_count ?? null, body.complaint_count ?? null,
      body.compliance_officer ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'fcr_created' as EventType,
    actor_id: user.id, entity_type: 'fsca_conduct_report', entity_id: id,
    data: { report_tier: tier, reporting_period: body.reporting_period },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_conduct_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: FcrAction;
    reason?: string;
    compliance_officer?: string;
    board_sign_off_date?: string;
    board_signatory?: string;
    fsca_submission_ref?: string;
    fsca_acknowledgement_ref?: string;
    query_summary?: string;
    query_response_ref?: string;
    rejection_reason?: string;
    escalation_reason?: string;
    best_ex_exceptions?: number;
    conduct_breaches?: number;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_conduct_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as FcrStatus;
  if (FCR_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Report in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = FCR_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = FCR_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_fsca_conduct_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.compliance_officer) { extra.push('compliance_officer = ?'); eb.push(body.compliance_officer); }
  if (body.board_sign_off_date) { extra.push('board_sign_off_date = ?'); eb.push(body.board_sign_off_date); }
  if (body.board_signatory) { extra.push('board_signatory = ?'); eb.push(body.board_signatory); }
  if (action === 'submit_to_fsca') { extra.push('submitted_at = ?'); eb.push(now); }
  if (body.fsca_submission_ref) { extra.push('fsca_submission_ref = ?'); eb.push(body.fsca_submission_ref); }
  if (body.fsca_acknowledgement_ref) { extra.push('fsca_acknowledgement_ref = ?'); eb.push(body.fsca_acknowledgement_ref); }
  if (body.query_summary) { extra.push('query_summary = ?', 'query_raised_at = ?'); eb.push(body.query_summary, now); }
  if (action === 'respond_to_queries') { extra.push('query_responded_at = ?'); eb.push(now); }
  if (body.query_response_ref) { extra.push('query_response_ref = ?'); eb.push(body.query_response_ref); }
  if (action === 'accept') { extra.push('accepted_at = ?'); eb.push(now); }
  if (action === 'reject') { extra.push('rejected_at = ?'); eb.push(now); }
  if (body.rejection_reason) { extra.push('rejection_reason = ?'); eb.push(body.rejection_reason); }
  if (body.escalation_reason) { extra.push('escalation_reason = ?'); eb.push(body.escalation_reason); }
  if (body.best_ex_exceptions != null) { extra.push('best_ex_exceptions = ?'); eb.push(body.best_ex_exceptions); }
  if (body.conduct_breaches != null) { extra.push('conduct_breaches = ?'); eb.push(body.conduct_breaches); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_fsca_conduct_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (fcrCrossesIntoRegulator(action, row.report_tier as FcrTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'fsca_conduct_report', id,
        `fcr_${action}`,
        `FSCA conduct report ${action.replace(/_/g, ' ')} — ${row.report_tier} — ${row.reporting_period}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_fsca_conduct_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `fcr_${action}` as EventType,
    actor_id: user.id, entity_type: 'fsca_conduct_report', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, report_tier: row.report_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_conduct_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'trader', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await fcrSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
