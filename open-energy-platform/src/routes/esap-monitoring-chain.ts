// ═══════════════════════════════════════════════════════════════════════════════
// W214 — Lender E&S Action Plan (ESAP) Monitoring
// Equator Principles IV + IFC Performance Standards (PS1–PS8)
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  EsapStatus, EsapAction, EsapTier,
  deriveEsapSla, ESAP_HARD_TERMINALS,
  ESAP_VALID_TRANSITIONS, ESAP_STATE_TRANSITIONS,
  esapCrossesIntoRegulator, esapSlaBreachCrossesIntoRegulator,
} from '../utils/esap-monitoring-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'lender', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function esapSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_esap_monitoring
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('closed_satisfactory','closed_escalated','non_compliant','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_esap_monitoring SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (esapSlaBreachCrossesIntoRegulator(row.esap_tier as EsapTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'esap_monitoring', row.id,
          'esap_sla_breach',
          `ESAP SLA breached — ${row.esap_tier} — ${row.site_name ?? row.project_ref}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'esap_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'esap_monitoring', entity_id: row.id as string,
      data: { esap_tier: row.esap_tier, project_ref: row.project_ref },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'lender', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_esap_monitoring WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    satisfactory: all.filter(r => r.chain_status === 'closed_satisfactory').length,
    in_progress: all.filter(r => !['closed_satisfactory', 'closed_escalated', 'non_compliant', 'withdrawn'].includes(r.chain_status as string)).length,
    non_compliant: all.filter(r => r.chain_status === 'non_compliant').length,
    escalated: all.filter(r => r.chain_status === 'closed_escalated').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_esap_monitoring WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'lender', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'esap_monitoring' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    project_ref?: string;
    facility_ref?: string;
    loan_ref?: string;
    esap_tier?: EsapTier;
    ep_category?: string;
    ps_triggers?: string;
    monitoring_cycle?: string;
    site_name?: string;
    site_location?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.esap_tier ?? 'category_b';

  const now = new Date().toISOString();
  const slaDays = deriveEsapSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_esap_monitoring
      (id, participant_id, project_ref, facility_ref, loan_ref,
       esap_tier, ep_category, ps_triggers, monitoring_cycle, site_name, site_location,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'esap_issued',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.project_ref ?? null, body.facility_ref ?? null, body.loan_ref ?? null,
      tier, body.ep_category ?? null, body.ps_triggers ?? null,
      body.monitoring_cycle ?? null, body.site_name ?? null, body.site_location ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'esap_created' as EventType,
    actor_id: user.id, entity_type: 'esap_monitoring', entity_id: id,
    data: { esap_tier: tier, project_ref: body.project_ref },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_esap_monitoring WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: EsapAction;
    reason?: string;
    auditor_name?: string;
    auditor_firm?: string;
    visit_scheduled_date?: string;
    visit_completed_date?: string;
    findings_summary?: string;
    finding_count_major?: number;
    finding_count_minor?: number;
    cap_reference?: string;
    cap_due_date?: string;
    tpa_firm?: string;
    tpa_ref?: string;
    tpa_outcome?: string;
    escalation_reason?: string;
    non_compliance_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_esap_monitoring WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as EsapStatus;
  if (ESAP_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `ESAP record in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = ESAP_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, ESAP_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_esap_monitoring SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.auditor_name) { extra.push('auditor_name = ?'); eb.push(body.auditor_name); }
  if (body.auditor_firm) { extra.push('auditor_firm = ?'); eb.push(body.auditor_firm); }
  if (body.visit_scheduled_date) { extra.push('visit_scheduled_date = ?'); eb.push(body.visit_scheduled_date); }
  if (action === 'complete_visit') { extra.push('visit_completed_date = ?'); eb.push(body.visit_completed_date ?? now); }
  if (body.findings_summary) { extra.push('findings_summary = ?'); eb.push(body.findings_summary); }
  if (body.finding_count_major != null) { extra.push('finding_count_major = ?'); eb.push(body.finding_count_major); }
  if (body.finding_count_minor != null) { extra.push('finding_count_minor = ?'); eb.push(body.finding_count_minor); }
  if (body.cap_reference) { extra.push('cap_reference = ?', 'cap_submitted_at = ?'); eb.push(body.cap_reference, now); }
  if (body.cap_due_date) { extra.push('cap_due_date = ?'); eb.push(body.cap_due_date); }
  if (action === 'start_remediation') { extra.push('remediation_started_at = ?'); eb.push(now); }
  if (action === 'close_satisfactory' || action === 'record_partial_close') { extra.push('remediation_completed_at = ?'); eb.push(now); }
  if (body.tpa_firm) { extra.push('tpa_firm = ?'); eb.push(body.tpa_firm); }
  if (body.tpa_ref) { extra.push('tpa_ref = ?'); eb.push(body.tpa_ref); }
  if (action === 'request_tpa' || body.tpa_outcome) { extra.push('tpa_completed_at = ?'); eb.push(now); }
  if (body.tpa_outcome) { extra.push('tpa_outcome = ?'); eb.push(body.tpa_outcome); }
  if (action === 'close_satisfactory' || action === 'escalate' || action === 'issue_non_compliance') {
    extra.push('closed_at = ?'); eb.push(now);
  }
  if (body.escalation_reason) { extra.push('escalation_reason = ?'); eb.push(body.escalation_reason); }
  if (body.non_compliance_ref) { extra.push('non_compliance_ref = ?'); eb.push(body.non_compliance_ref); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_esap_monitoring SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (esapCrossesIntoRegulator(action, row.esap_tier as EsapTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'esap_monitoring', id,
        `esap_${action}`,
        `ESAP ${action.replace(/_/g, ' ')} — ${row.esap_tier} — ${row.site_name ?? row.project_ref}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_esap_monitoring SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `esap_${action}` as EventType,
    actor_id: user.id, entity_type: 'esap_monitoring', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, esap_tier: row.esap_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_esap_monitoring WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'lender', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await esapSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
