// ═══════════════════════════════════════════════════════════════════════════════
// W209 — Regulator Public Consultation & Stakeholder Engagement
// ERA 2006 §10 + NERSA Public Participation Framework + PAJA §3-4
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  PcStatus, PcAction, ConsultationTier,
  derivePcSla, PC_HARD_TERMINALS,
  PC_VALID_TRANSITIONS, PC_STATE_TRANSITIONS,
  pcCrossesIntoRegulator, pcSlaBreachCrossesIntoRegulator,
} from '../utils/public-consultation-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'regulator'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function pcSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_public_consultations
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('closed','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_public_consultations SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (pcSlaBreachCrossesIntoRegulator(row.consultation_tier as ConsultationTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'public_consultation', row.id,
          'pc_sla_breach',
          `Public consultation SLA breached — ${row.consultation_tier} — ${row.title}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'pc_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'public_consultation', entity_id: row.id as string,
      data: { consultation_tier: row.consultation_tier, title: row.title },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'regulator'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_public_consultations WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    published: all.filter(r => r.chain_status === 'published' || r.chain_status === 'objection_period').length,
    under_determination: all.filter(r => ['analysis', 'determination_draft', 'determination_notice'].includes(r.chain_status as string)).length,
    appealed: all.filter(r => r.chain_status === 'appealed').length,
    closed: all.filter(r => r.chain_status === 'closed').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_public_consultations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'public_consultation' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    consultation_type?: string;
    consultation_tier?: ConsultationTier;
    title: string;
    description?: string;
    reference_number?: string;
    licence_ref?: string;
    tariff_ref?: string;
    ppa_ref?: string;
    reason?: string;
  }>();

  if (!body.title) return c.json({ success: false, error: 'title required' }, 422);

  const isAdmin = ['admin', 'regulator'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.consultation_tier ?? 'routine';

  const now = new Date().toISOString();
  const slaDays = derivePcSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_public_consultations
      (id, participant_id, consultation_type, consultation_tier, title, description,
       reference_number, licence_ref, tariff_ref, ppa_ref,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.consultation_type ?? 'policy_review', tier,
      body.title, body.description ?? null,
      body.reference_number ?? null, body.licence_ref ?? null,
      body.tariff_ref ?? null, body.ppa_ref ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'pc_created' as EventType,
    actor_id: user.id, entity_type: 'public_consultation', entity_id: id,
    data: { consultation_tier: tier, title: body.title },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_public_consultations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: PcAction;
    reason?: string;
    gazette_number?: string;
    gazette_date?: string;
    comment_deadline?: string;
    objection_deadline?: string;
    submissions_count?: number;
    objections_count?: number;
    submissions_summary?: string;
    determination_summary?: string;
    determination_ref?: string;
    appeal_filed_by?: string;
    appeal_grounds?: string;
    appeal_outcome?: string;
    appeal_resolved_at?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_public_consultations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as PcStatus;
  if (PC_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Consultation in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = PC_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = PC_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_public_consultations SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'publish_notice') { extra.push('publication_date = ?'); eb.push(now); }
  if (body.gazette_number) { extra.push('gazette_number = ?'); eb.push(body.gazette_number); }
  if (body.gazette_date) { extra.push('gazette_date = ?'); eb.push(body.gazette_date); }
  if (body.comment_deadline) { extra.push('comment_deadline = ?'); eb.push(body.comment_deadline); }
  if (body.objection_deadline) { extra.push('objection_deadline = ?'); eb.push(body.objection_deadline); }
  if (body.submissions_count != null) { extra.push('submissions_count = ?'); eb.push(body.submissions_count); }
  if (body.objections_count != null) { extra.push('objections_count = ?'); eb.push(body.objections_count); }
  if (body.submissions_summary) { extra.push('submissions_summary = ?'); eb.push(body.submissions_summary); }
  if (body.determination_summary) { extra.push('determination_summary = ?'); eb.push(body.determination_summary); }
  if (action === 'issue_determination') { extra.push('determination_issued_at = ?'); eb.push(now); }
  if (body.determination_ref) { extra.push('determination_ref = ?'); eb.push(body.determination_ref); }
  if (body.appeal_filed_by) { extra.push('appeal_filed_by = ?'); eb.push(body.appeal_filed_by); }
  if (body.appeal_grounds) { extra.push('appeal_grounds = ?'); eb.push(body.appeal_grounds); }
  if (action === 'resolve_appeal') { extra.push('appeal_resolved_at = ?'); eb.push(body.appeal_resolved_at ?? now); }
  if (body.appeal_outcome) { extra.push('appeal_outcome = ?'); eb.push(body.appeal_outcome); }
  if (action === 'start_analysis') { extra.push('analysis_completed_at = ?'); eb.push(null); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_public_consultations SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (pcCrossesIntoRegulator(action, row.consultation_tier as ConsultationTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'public_consultation', id,
        `pc_${action}`,
        `Consultation ${action.replace(/_/g, ' ')} — ${row.consultation_tier} — ${row.title}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_public_consultations SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `pc_${action}` as EventType,
    actor_id: user.id, entity_type: 'public_consultation', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, consultation_tier: row.consultation_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_public_consultations WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'regulator'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await pcSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
