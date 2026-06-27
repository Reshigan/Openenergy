// ═══════════════════════════════════════════════════════════════════════════════
// W203 — Basel III Regulatory Capital & RWA Adequacy Report
// SARB BA 900 + Basel III / CRR III Pillar 2 ICAAP + SARB Directive 1/2014
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CapStatus, CapAction, BankTier,
  deriveCapSla, CAP_HARD_TERMINALS,
  CAP_VALID_TRANSITIONS, CAP_STATE_TRANSITIONS,
  capCrossesIntoRegulator, capSlaBreachCrossesIntoRegulator,
} from '../utils/capital-adequacy-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'lender', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function capSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_capital_adequacy_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('accepted','capital_breach','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_capital_adequacy_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (capSlaBreachCrossesIntoRegulator(row.bank_tier as BankTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'capital_adequacy_report', row.id,
          'cap_adequacy_sla_breach',
          `Capital adequacy report SLA breached — ${row.report_period} — ${row.bank_tier} tier`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'cap_adequacy_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'capital_adequacy_report', entity_id: row.id as string,
      data: { report_period: row.report_period, bank_tier: row.bank_tier },
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
    .prepare(`SELECT * FROM oe_capital_adequacy_reports WHERE participant_id = ? ORDER BY report_period DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    accepted: all.filter(r => r.chain_status === 'accepted').length,
    pending: all.filter(r => !CAP_HARD_TERMINALS.has(r.chain_status as CapStatus)).length,
    capital_breach: all.filter(r => r.chain_status === 'capital_breach').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_capital_adequacy_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'capital_adequacy_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    bank_tier?: BankTier;
    report_period: string;
    reporting_date: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const bankTier = body.bank_tier ?? 'mid_tier';

  // Duplicate check (UNIQUE by participant+period)
  const existing = await c.env.DB
    .prepare(`SELECT id FROM oe_capital_adequacy_reports WHERE participant_id = ? AND report_period = ?`)
    .bind(participantId, body.report_period)
    .first<{ id: string }>();
  if (existing) {
    return c.json({ success: false, error: `Capital adequacy report for ${body.report_period} already exists` }, 409);
  }

  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + deriveCapSla(bankTier) * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_capital_adequacy_reports
      (id, participant_id, bank_tier, report_period, reporting_date,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,'data_gathering',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, bankTier, body.report_period, body.reporting_date,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'cap_adequacy_report_created' as EventType,
    actor_id: user.id, entity_type: 'capital_adequacy_report', entity_id: id,
    data: { report_period: body.report_period, bank_tier: bankTier },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_capital_adequacy_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CapAction;
    reason?: string;
    cet1_ratio?: number;
    tier1_ratio?: number;
    total_capital_ratio?: number;
    leverage_ratio?: number;
    rwa_credit_risk?: number;
    rwa_market_risk?: number;
    rwa_operational_risk?: number;
    rwa_total?: number;
    sarb_submission_ref?: string;
    ba900_form_ref?: string;
    remediation_description?: string;
    remediation_deadline?: string;
    breach_description?: string;
    breach_cet1_ratio?: number;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_capital_adequacy_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CapStatus;
  if (CAP_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Report in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CAP_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, CAP_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  // Inline SLA breach check
  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_capital_adequacy_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  // Build dynamic update
  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.cet1_ratio != null) { extra.push('cet1_ratio = ?'); eb.push(body.cet1_ratio); }
  if (body.tier1_ratio != null) { extra.push('tier1_ratio = ?'); eb.push(body.tier1_ratio); }
  if (body.total_capital_ratio != null) { extra.push('total_capital_ratio = ?'); eb.push(body.total_capital_ratio); }
  if (body.leverage_ratio != null) { extra.push('leverage_ratio = ?'); eb.push(body.leverage_ratio); }
  if (body.rwa_credit_risk != null) { extra.push('rwa_credit_risk = ?'); eb.push(body.rwa_credit_risk); }
  if (body.rwa_market_risk != null) { extra.push('rwa_market_risk = ?'); eb.push(body.rwa_market_risk); }
  if (body.rwa_operational_risk != null) { extra.push('rwa_operational_risk = ?'); eb.push(body.rwa_operational_risk); }
  if (body.rwa_total != null) { extra.push('rwa_total = ?'); eb.push(body.rwa_total); }
  if (body.sarb_submission_ref) { extra.push('sarb_submission_ref = ?'); eb.push(body.sarb_submission_ref); }
  if (body.ba900_form_ref) { extra.push('ba900_form_ref = ?'); eb.push(body.ba900_form_ref); }
  if (action === 'sarb_accept') { extra.push('sarb_accepted_at = ?'); eb.push(now); }
  if (action === 'sarb_raises_queries') { extra.push('query_count = query_count + 1', 'last_query_at = ?'); eb.push(now); }
  if (action === 'respond_to_queries') { extra.push('last_response_at = ?'); eb.push(now); }
  if (body.remediation_description) { extra.push('remediation_description = ?'); eb.push(body.remediation_description); }
  if (body.remediation_deadline) { extra.push('remediation_deadline = ?'); eb.push(body.remediation_deadline); }
  if (body.breach_description) { extra.push('breach_description = ?'); eb.push(body.breach_description); }
  if (body.breach_cet1_ratio != null) { extra.push('breach_cet1_ratio = ?'); eb.push(body.breach_cet1_ratio); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_capital_adequacy_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  // Regulator crossing
  if (capCrossesIntoRegulator(action, row.bank_tier as BankTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'capital_adequacy_report', id,
        `cap_adequacy_${action}`,
        `Capital adequacy report ${action} — ${row.report_period} — ${row.bank_tier} tier`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_capital_adequacy_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `cap_adequacy_${action}` as EventType,
    actor_id: user.id, entity_type: 'capital_adequacy_report', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, report_period: row.report_period },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_capital_adequacy_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await capSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
