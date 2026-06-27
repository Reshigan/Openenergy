// ═══════════════════════════════════════════════════════════════════════════════
// W201 — FSCA Annual Compliance Certificate & Compliance Officer Report
// FAIS Act §17 + Conduct Standard 1/2021
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  FsccStatus, FsccAction, FspClass,
  deriveFsccSla, FSCC_HARD_TERMINALS,
  FSCC_VALID_TRANSITIONS, FSCC_STATE_TRANSITIONS,
  fsccCrossesIntoRegulator, fsccSlaBreachCrossesIntoRegulator,
} from '../utils/fsca-compliance-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'trader', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fsccSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_fsca_compliance_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('filed','refiled','revocation_risk')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_fsca_compliance_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (fsccSlaBreachCrossesIntoRegulator(row.fsp_class as FspClass)) {
      await env.DB
        .prepare(`INSERT INTO regulator_inbox (id, entity_type, entity_id, event_type, summary, participant_id, created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'fsca_compliance_report', row.id,
          'fsca_compliance_sla_breach',
          `FSCA compliance report SLA breached — ${row.report_year} — FSP ${row.fsp_licence_number ?? 'unknown'} — ${row.fsp_class}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'fsca_compliance_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'fsca_compliance_report',
      entity_id: row.id as string,
      data: { report_year: row.report_year, fsp_class: row.fsp_class },
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
  const yearStr = c.req.query('year');

  let where = isAdmin && participantId ? `participant_id = ?` : `participant_id = ?`;
  const binds: (string | number)[] = [isAdmin && participantId ? participantId : user.id];
  if (yearStr) { where += ` AND report_year = ?`; binds.push(parseInt(yearStr)); }

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_compliance_reports WHERE ${where} ORDER BY report_year DESC`)
    .bind(...binds)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    filed: all.filter(r => ['filed','refiled'].includes(r.chain_status as string)).length,
    pending: all.filter(r => !['filed','refiled','revocation_risk'].includes(r.chain_status as string)).length,
    revocation_risk: all.filter(r => r.chain_status === 'revocation_risk').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_compliance_reports WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'fsca_compliance_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    participant_id?: string;
    fsp_licence_number?: string;
    fsp_class?: FspClass;
    report_year: number;
    reporting_period_start: string;
    reporting_period_end: string;
    compliance_officer_id?: string;
    compliance_officer_name?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const fspClass = body.fsp_class ?? 'standard';
  const reportYear = body.report_year ?? new Date().getFullYear();

  // Deduplicate by participant + year
  const existing = await c.env.DB
    .prepare(`SELECT id FROM oe_fsca_compliance_reports WHERE participant_id = ? AND report_year = ?`)
    .bind(participantId, reportYear)
    .first<{ id: string }>();
  if (existing) {
    return c.json({ success: false, error: `Compliance report for ${reportYear} already exists` }, 409);
  }

  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + deriveFsccSla(fspClass) * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_fsca_compliance_reports
      (id, participant_id, fsp_licence_number, fsp_class, report_year,
       reporting_period_start, reporting_period_end,
       compliance_officer_id, compliance_officer_name,
       chain_status, sla_deadline, sla_breached, regulator_notified,
       actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'report_scheduled',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.fsp_licence_number ?? null, fspClass,
      reportYear,
      body.reporting_period_start ?? `${reportYear}-01-01`,
      body.reporting_period_end ?? `${reportYear}-12-31`,
      body.compliance_officer_id ?? null, body.compliance_officer_name ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'fsca_compliance_report_created' as EventType,
    actor_id: user.id,
    entity_type: 'fsca_compliance_report',
    entity_id: id,
    data: { report_year: reportYear, fsp_class: fspClass, participant_id: participantId },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_compliance_reports WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json<{
    action: FsccAction;
    reason?: string;
    fsca_reference?: string;
    compliance_officer_id?: string;
    compliance_officer_name?: string;
    query_note?: string;
    deficiency_description?: string;
    remediation_plan?: string;
    remediation_deadline?: string;
    revocation_risk_reason?: string;
  }>();
  const { action, reason } = body;

  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_compliance_reports WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as FsccStatus;
  if (FSCC_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Report is in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = FSCC_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, FSCC_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  // Check SLA breach inline
  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB
      .prepare(`UPDATE oe_fsca_compliance_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  // Build update fields
  const extraFields: string[] = [];
  const extraBinds: (string | number | null)[] = [];

  if (action === 'co_sign') {
    extraFields.push('co_signed_at = ?');
    extraBinds.push(now);
    if (body.compliance_officer_id) {
      extraFields.push('compliance_officer_id = ?', 'compliance_officer_name = ?');
      extraBinds.push(body.compliance_officer_id, body.compliance_officer_name ?? null);
    }
  }
  if (action === 'co_sign') {
    extraFields.push('submitted_at = ?');
    extraBinds.push(now);
    if (body.fsca_reference) { extraFields.push('fsca_reference = ?'); extraBinds.push(body.fsca_reference); }
  }
  if (action === 'fsca_raises_queries') {
    extraFields.push('query_count = query_count + 1', 'last_query_at = ?');
    extraBinds.push(now);
  }
  if (action === 'respond_to_queries') {
    extraFields.push('last_response_at = ?'); extraBinds.push(now);
  }
  if (action === 'file_clean') {
    extraFields.push('filed_at = ?'); extraBinds.push(now);
  }
  if (action === 'refile') {
    extraFields.push('refiled_at = ?'); extraBinds.push(now);
  }
  if (action === 'flag_deficiency') {
    if (body.deficiency_description) { extraFields.push('deficiency_description = ?'); extraBinds.push(body.deficiency_description); }
  }
  if (action === 'start_remediation') {
    if (body.remediation_plan) { extraFields.push('remediation_plan = ?'); extraBinds.push(body.remediation_plan); }
    if (body.remediation_deadline) { extraFields.push('remediation_deadline = ?'); extraBinds.push(body.remediation_deadline); }
  }
  if (action === 'flag_revocation_risk') {
    if (body.revocation_risk_reason) { extraFields.push('revocation_risk_reason = ?'); extraBinds.push(body.revocation_risk_reason); }
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extraFields].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_fsca_compliance_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...extraBinds, id)
    .run();

  // Regulator inbox crossing
  const fspClass = row.fsp_class as FspClass;
  if (fsccCrossesIntoRegulator(action, fspClass)) {
    const isNotified = await c.env.DB
      .prepare(`SELECT id FROM oe_fsca_compliance_reports WHERE id = ? AND regulator_notified = 1`)
      .bind(id).first<{ id: string }>();
    if (!isNotified || ['flag_revocation_risk', 'co_sign'].includes(action)) {
      await c.env.DB
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'fsca_compliance_report', id,
          `fsca_compliance_${action}`,
          `FSCA compliance report ${action} — ${row.report_year} — ${fspClass} FSP`,
          row.participant_id, now,
        ).run().catch(() => {});
      await c.env.DB
        .prepare(`UPDATE oe_fsca_compliance_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
        .bind(now, id).run();
    }
  }

  await fireCascade({
    event: `fsca_compliance_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'fsca_compliance_report',
    entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, report_year: row.report_year, fsp_class: fspClass },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_fsca_compliance_reports WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await fsccSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
