// ═══════════════════════════════════════════════════════════════════════════════
// W212 — IPP Revenue Bond / DSCR Reporting
// REIPPPP Schedule 2 + DFI covenant requirements + Basel III/LMA
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  DscrStatus, DscrAction, DscrTier,
  deriveDscrSla, DSCR_HARD_TERMINALS,
  DSCR_VALID_TRANSITIONS, DSCR_STATE_TRANSITIONS,
  dscrCrossesIntoRegulator, dscrSlaBreachCrossesIntoRegulator,
} from '../utils/dscr-report-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'lender', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function dscrSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_dscr_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('accepted','covenant_breach','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_dscr_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (dscrSlaBreachCrossesIntoRegulator(row.dscr_tier as DscrTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'dscr_report', row.id,
          'dscr_sla_breach',
          `DSCR report SLA breached — ${row.dscr_tier} — ${row.reporting_period}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'dscr_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'dscr_report', entity_id: row.id as string,
      data: { dscr_tier: row.dscr_tier, reporting_period: row.reporting_period },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'ipp_developer', 'lender', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_dscr_reports WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    accepted: all.filter(r => r.chain_status === 'accepted').length,
    in_progress: all.filter(r => !['accepted', 'covenant_breach', 'withdrawn'].includes(r.chain_status as string)).length,
    covenant_breach: all.filter(r => r.chain_status === 'covenant_breach').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_dscr_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'ipp_developer', 'lender', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'dscr_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    dscr_tier?: DscrTier;
    reporting_period: string;
    dfi_name?: string;
    dfi_reference?: string;
    minimum_dscr_covenant?: number;
    reason?: string;
  }>();

  if (!body.reporting_period) return c.json({ success: false, error: 'reporting_period required' }, 422);

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.dscr_tier ?? 'standard';

  const now = new Date().toISOString();
  const slaDays = deriveDscrSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_dscr_reports
      (id, participant_id, dscr_tier, reporting_period, dfi_name, dfi_reference, minimum_dscr_covenant,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,'data_gathering',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.reporting_period,
      body.dfi_name ?? null, body.dfi_reference ?? null,
      body.minimum_dscr_covenant ?? 1.20,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'dscr_created' as EventType,
    actor_id: user.id, entity_type: 'dscr_report', entity_id: id,
    data: { dscr_tier: tier, reporting_period: body.reporting_period },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_dscr_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: DscrAction;
    reason?: string;
    net_revenue_zar?: number;
    operating_costs_zar?: number;
    debt_service_zar?: number;
    dscr_value?: number;
    dscr_cushion?: number;
    ie_name?: string;
    ie_certification_ref?: string;
    ie_comments?: string;
    dfi_query_details?: string;
    ipp_response_summary?: string;
    breach_dscr?: number;
    breach_type?: string;
    cure_period_days?: number;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_dscr_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as DscrStatus;
  if (DSCR_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `DSCR report in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = DSCR_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = DSCR_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_dscr_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.net_revenue_zar != null) { extra.push('net_revenue_zar = ?'); eb.push(body.net_revenue_zar); }
  if (body.operating_costs_zar != null) { extra.push('operating_costs_zar = ?'); eb.push(body.operating_costs_zar); }
  if (body.debt_service_zar != null) { extra.push('debt_service_zar = ?'); eb.push(body.debt_service_zar); }
  if (body.dscr_value != null) { extra.push('dscr_value = ?'); eb.push(body.dscr_value); }
  if (body.dscr_cushion != null) { extra.push('dscr_cushion = ?'); eb.push(body.dscr_cushion); }
  if (body.ie_name) { extra.push('ie_name = ?'); eb.push(body.ie_name); }
  if (body.ie_certification_ref) { extra.push('ie_certification_ref = ?'); eb.push(body.ie_certification_ref); }
  if (body.ie_comments) { extra.push('ie_comments = ?'); eb.push(body.ie_comments); }
  if (action === 'ie_certify') { extra.push('ie_certified_at = ?'); eb.push(now); }
  if (action === 'submit_to_dfi') { extra.push('dfi_submitted_at = ?'); eb.push(now); }
  if (body.dfi_query_details) { extra.push('dfi_query_details = ?'); eb.push(body.dfi_query_details); }
  if (action === 'raise_dfi_query') { extra.push('dfi_query_raised_at = ?'); eb.push(now); }
  if (body.ipp_response_summary) { extra.push('ipp_response_summary = ?'); eb.push(body.ipp_response_summary); }
  if (action === 'respond_to_queries') { extra.push('ipp_responded_at = ?'); eb.push(now); }
  if (action === 'accept') { extra.push('dfi_accepted_at = ?'); eb.push(now); }
  if (body.breach_dscr != null) { extra.push('breach_dscr = ?'); eb.push(body.breach_dscr); }
  if (body.breach_type) { extra.push('breach_type = ?'); eb.push(body.breach_type); }
  if (body.cure_period_days != null) { extra.push('cure_period_days = ?'); eb.push(body.cure_period_days); }
  if (action === 'flag_breach') { extra.push('covenant_breach_at = ?'); eb.push(now); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_dscr_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (dscrCrossesIntoRegulator(action, row.dscr_tier as DscrTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'dscr_report', id,
        `dscr_${action}`,
        `DSCR ${action.replace(/_/g, ' ')} — ${row.dscr_tier} — ${row.reporting_period} — DSCR: ${body.dscr_value ?? body.breach_dscr ?? 'n/a'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_dscr_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `dscr_${action}` as EventType,
    actor_id: user.id, entity_type: 'dscr_report', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, dscr_tier: row.dscr_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_dscr_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'ipp_developer', 'lender', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await dscrSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
