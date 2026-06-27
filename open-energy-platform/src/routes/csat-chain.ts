// ═══════════════════════════════════════════════════════════════════════════════
// W208 — Support SLA Escalation & Customer Satisfaction (CSAT) Lifecycle
// ITIL 4 CSM + ISO 20000-1 CSI
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CsatStatus, CsatAction, SupportTier,
  deriveCsatSla, CSAT_HARD_TERMINALS,
  CSAT_VALID_TRANSITIONS, CSAT_STATE_TRANSITIONS,
  csatCrossesIntoRegulator, csatSlaBreachCrossesIntoRegulator,
} from '../utils/csat-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function csatSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_csat_records
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('closed_satisfied','closed_escalated','no_response')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_csat_records SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (csatSlaBreachCrossesIntoRegulator(row.support_tier as SupportTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'csat_record', row.id,
          'csat_sla_breach',
          `CSAT survey SLA breached — ${row.support_tier} ticket`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'csat_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'csat_record', entity_id: row.id as string,
      data: { support_tier: row.support_tier, ticket_id: row.ticket_id },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_csat_records WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const scored = all.filter(r => r.csat_score != null);
  const avgScore = scored.length > 0
    ? scored.reduce((s, r) => s + (r.csat_score as number), 0) / scored.length
    : null;
  const kpis = {
    total: all.length,
    satisfied: all.filter(r => r.chain_status === 'closed_satisfied').length,
    escalated: all.filter(r => ['escalated', 'closed_escalated'].includes(r.chain_status as string)).length,
    avg_csat_score: avgScore != null ? parseFloat(avgScore.toFixed(2)) : null,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_csat_records WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'csat_record' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    ticket_id?: string;
    support_tier?: SupportTier;
    resolved_at?: string;
    resolution_time_minutes?: number;
    sla_target_minutes?: number;
    sla_met?: boolean;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.support_tier ?? 'p3_medium';

  const now = new Date().toISOString();
  // SLA in hours for CSAT surveys
  const slaSecs = deriveCsatSla(tier) * 3600000;
  const slaDeadline = new Date(Date.now() + slaSecs).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_csat_records
      (id, participant_id, ticket_id, support_tier, resolved_at,
       resolution_time_minutes, sla_target_minutes, sla_met,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'survey_pending',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.ticket_id ?? null, tier,
      body.resolved_at ?? now,
      body.resolution_time_minutes ?? null,
      body.sla_target_minutes ?? null,
      body.sla_met != null ? (body.sla_met ? 1 : 0) : null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'csat_record_created' as EventType,
    actor_id: user.id, entity_type: 'csat_record', entity_id: id,
    data: { support_tier: tier, ticket_id: body.ticket_id },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_csat_records WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CsatAction;
    reason?: string;
    csat_score?: number;
    csat_comment?: string;
    follow_up_reason?: string;
    follow_up_score?: number;
    escalation_reason?: string;
    escalation_resolution?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_csat_records WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CsatStatus;
  if (CSAT_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `CSAT record in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CSAT_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, CSAT_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_csat_records SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'send_survey') { extra.push('survey_sent_at = ?'); eb.push(now); }
  if (action === 'record_response') { extra.push('survey_responded_at = ?'); eb.push(now); }
  if (body.csat_score != null) { extra.push('csat_score = ?'); eb.push(body.csat_score); }
  if (body.csat_comment) { extra.push('csat_comment = ?'); eb.push(body.csat_comment); }
  if (body.follow_up_reason) { extra.push('follow_up_reason = ?'); eb.push(body.follow_up_reason); }
  if (action === 'send_follow_up') { extra.push('follow_up_sent_at = ?'); eb.push(now); }
  if (action === 'record_follow_up_response') { extra.push('follow_up_responded_at = ?'); eb.push(now); }
  if (body.follow_up_score != null) { extra.push('follow_up_score = ?'); eb.push(body.follow_up_score); }
  if (body.escalation_reason) { extra.push('escalation_reason = ?'); eb.push(body.escalation_reason); }
  if (action === 'escalate_to_management') { extra.push('escalated_at = ?'); eb.push(now); }
  if (body.escalation_resolution) { extra.push('escalation_resolution = ?'); eb.push(body.escalation_resolution); }
  if (action === 'close_escalated') { extra.push('escalation_resolved_at = ?'); eb.push(now); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_csat_records SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (csatCrossesIntoRegulator(action, row.support_tier as SupportTier, body.csat_score)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'csat_record', id,
        `csat_${action}`,
        `CSAT ${action} — ${row.support_tier} — score: ${body.csat_score ?? 'n/a'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_csat_records SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `csat_${action}` as EventType,
    actor_id: user.id, entity_type: 'csat_record', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, support_tier: row.support_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_csat_records WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await csatSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
