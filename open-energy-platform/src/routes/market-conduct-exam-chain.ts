// ═══════════════════════════════════════════════════════════════════════════════
// W220 — Regulator Market Conduct Examination
// NERSA ERA §34 + FSCA Conduct Standard 1/2020
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  MceStatus, MceAction, MceTier,
  deriveMceSla, MCE_HARD_TERMINALS,
  MCE_VALID_TRANSITIONS, MCE_STATE_TRANSITIONS,
  mceCrossesIntoRegulator, mceSlaBreachCrossesIntoRegulator,
} from '../utils/market-conduct-exam-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'regulator', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function mceSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_market_conduct_exams
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('enforcement_action','closed_satisfactory','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_market_conduct_exams SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (mceSlaBreachCrossesIntoRegulator(row.exam_tier as MceTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'market_conduct_exam', row.id,
          'mce_sla_breach',
          `Market conduct exam SLA breached — ${row.exam_tier} — ${(row.examination_ref as string) ?? (row.id as string).slice(0, 8)}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'mce_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'market_conduct_exam', entity_id: row.id as string,
      data: { exam_tier: row.exam_tier, subject_participant_id: row.subject_participant_id },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'regulator', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_market_conduct_exams WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    active: all.filter(r => !['enforcement_action', 'closed_satisfactory', 'withdrawn'].includes(r.chain_status as string)).length,
    enforcement: all.filter(r => r.chain_status === 'enforcement_action').length,
    closed_satisfactory: all.filter(r => r.chain_status === 'closed_satisfactory').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_market_conduct_exams WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'regulator', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'market_conduct_exam' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    exam_tier?: MceTier;
    exam_type?: string;
    subject_participant_id?: string;
    subject_licence_class?: string;
    examination_ref?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.exam_tier ?? 'routine';

  const now = new Date().toISOString();
  const slaDays = deriveMceSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_market_conduct_exams
      (id, participant_id, exam_tier, exam_type, subject_participant_id,
       subject_licence_class, examination_ref,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,'examination_scheduled',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.exam_type ?? null,
      body.subject_participant_id ?? null, body.subject_licence_class ?? null,
      body.examination_ref ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'mce_created' as EventType,
    actor_id: user.id, entity_type: 'market_conduct_exam', entity_id: id,
    data: { exam_tier: tier, subject_participant_id: body.subject_participant_id },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_market_conduct_exams WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: MceAction;
    reason?: string;
    notice_ref?: string;
    document_request_ref?: string;
    document_deadline?: string;
    on_site_start_date?: string;
    on_site_end_date?: string;
    on_site_lead_examiner?: string;
    preliminary_findings_ref?: string;
    response_deadline?: string;
    subject_response_ref?: string;
    final_report_ref?: string;
    findings_summary?: string;
    adverse_findings_count?: number;
    remedial_action_ref?: string;
    remedial_action_deadline?: string;
    enforcement_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_market_conduct_exams WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as MceStatus;
  if (MCE_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Examination in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = MCE_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = MCE_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_market_conduct_exams SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'issue_notice') {
    extra.push('notice_issued_at = ?', 'notice_ref = ?');
    eb.push(now, body.notice_ref ?? null);
  }
  if (action === 'request_documents') {
    extra.push('document_request_ref = ?', 'document_deadline = ?');
    eb.push(body.document_request_ref ?? null, body.document_deadline ?? null);
  }
  if (action === 'documents_received') { extra.push('documents_received_at = ?'); eb.push(now); }
  if (action === 'commence_on_site') {
    extra.push('on_site_start_date = ?', 'on_site_lead_examiner = ?');
    eb.push(body.on_site_start_date ?? now, body.on_site_lead_examiner ?? null);
  }
  if (body.on_site_end_date) { extra.push('on_site_end_date = ?'); eb.push(body.on_site_end_date); }
  if (action === 'issue_preliminary_findings') {
    extra.push('preliminary_findings_ref = ?', 'preliminary_issued_at = ?', 'response_deadline = ?');
    eb.push(body.preliminary_findings_ref ?? null, now, body.response_deadline ?? null);
  }
  if (action === 'file_subject_response') {
    extra.push('subject_response_ref = ?', 'subject_response_at = ?');
    eb.push(body.subject_response_ref ?? null, now);
  }
  if (action === 'issue_final_report') {
    extra.push('final_report_ref = ?', 'final_report_issued_at = ?', 'findings_summary = ?');
    eb.push(body.final_report_ref ?? null, now, body.findings_summary ?? null);
    if (body.adverse_findings_count != null) { extra.push('adverse_findings_count = ?'); eb.push(body.adverse_findings_count); }
  }
  if (action === 'order_remedial_action') {
    extra.push('remedial_action_ref = ?', 'remedial_action_deadline = ?');
    eb.push(body.remedial_action_ref ?? null, body.remedial_action_deadline ?? null);
  }
  if (action === 'commence_enforcement') {
    extra.push('enforcement_ref = ?');
    eb.push(body.enforcement_ref ?? null);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_market_conduct_exams SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (mceCrossesIntoRegulator(action, row.exam_tier as MceTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'market_conduct_exam', id,
        `mce_${action}`,
        `Market conduct exam ${action.replace(/_/g, ' ')} — ${row.exam_tier} — ${(row.examination_ref as string) ?? (row.id as string).slice(0, 8)}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_market_conduct_exams SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `mce_${action}` as EventType,
    actor_id: user.id, entity_type: 'market_conduct_exam', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, exam_tier: row.exam_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_market_conduct_exams WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'regulator', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await mceSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
