// ═══════════════════════════════════════════════════════════════════════════════
// W224 — IPP Grid Technical Interface Agreement (GTIA)
// NERSA Grid Code §C-4: protection/SCADA/metering interface settings
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  GtiaStatus, GtiaAction, GtiaTier,
  deriveGtiaSla, GTIA_HARD_TERMINALS,
  GTIA_VALID_TRANSITIONS, GTIA_STATE_TRANSITIONS,
  gtiaCrossesIntoRegulator, gtiaSlaBreachCrossesIntoRegulator,
} from '../utils/gtia-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'grid_operator', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function gtiaSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_gtia
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('gtia_executed','ipp_rejected','so_rejected','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_gtia SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (gtiaSlaBreachCrossesIntoRegulator(row.gtia_tier as GtiaTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'gtia', row.id,
          'gtia_sla_breach',
          `GTIA SLA breached — ${row.gtia_tier} — ${(row.installed_capacity_mw as number) ?? '?'}MW — ${(row.network_operator_name as string) ?? (row.id as string).slice(0, 8)}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'gtia_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'gtia', entity_id: row.id as string,
      data: { gtia_tier: row.gtia_tier, installed_capacity_mw: row.installed_capacity_mw },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'ipp_developer', 'grid_operator', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_gtia WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    in_progress: all.filter(r => !['gtia_executed','ipp_rejected','so_rejected','withdrawn'].includes(r.chain_status as string)).length,
    executed: all.filter(r => r.chain_status === 'gtia_executed').length,
    rejected: all.filter(r => ['ipp_rejected','so_rejected'].includes(r.chain_status as string)).length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_gtia WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'ipp_developer', 'grid_operator', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'gtia' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    gtia_tier?: GtiaTier;
    project_ref?: string;
    gca_ref?: string;
    capacity_ref?: string;
    installed_capacity_mw?: number;
    connection_voltage_kv?: number;
    connection_type?: string;
    network_operator_name?: string;
    scada_protocol?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.gtia_tier ?? 'medium';

  const now = new Date().toISOString();
  const slaDays = deriveGtiaSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_gtia
      (id, participant_id, gtia_tier, project_ref, gca_ref, capacity_ref,
       installed_capacity_mw, connection_voltage_kv, connection_type,
       network_operator_name, scada_protocol,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'gtia_initiated',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.project_ref ?? null, body.gca_ref ?? null, body.capacity_ref ?? null,
      body.installed_capacity_mw ?? null, body.connection_voltage_kv ?? null,
      body.connection_type ?? null, body.network_operator_name ?? null,
      body.scada_protocol ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'gtia_created' as EventType,
    actor_id: user.id, entity_type: 'gtia', entity_id: id,
    data: { gtia_tier: tier, installed_capacity_mw: body.installed_capacity_mw },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_gtia WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: GtiaAction;
    reason?: string;
    protection_relay_type?: string;
    protection_settings_ref?: string;
    scada_protocol?: string;
    scada_point_list_ref?: string;
    metering_class?: string;
    metering_standards_ref?: string;
    rejection_party?: string;
    rejection_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_gtia WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as GtiaStatus;
  if (GTIA_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `GTIA in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = GTIA_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, GTIA_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_gtia SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'raise_queries') { extra.push('queries_raised_at = ?'); eb.push(now); }
  if (action === 'respond_to_queries') { extra.push('queries_responded_at = ?'); eb.push(now); }
  if (action === 'ipp_approve') { extra.push('ipp_approved_at = ?'); eb.push(now); }
  if (action === 'commence_so_review') { extra.push('so_review_commenced_at = ?'); eb.push(now); }
  if (action === 'agree_protection_settings') {
    extra.push('protection_agreed_at = ?', 'protection_relay_type = ?', 'protection_settings_ref = ?');
    eb.push(now, body.protection_relay_type ?? null, body.protection_settings_ref ?? null);
  }
  if (action === 'agree_scada_interface') {
    extra.push('scada_agreed_at = ?', 'scada_protocol = ?', 'scada_point_list_ref = ?',
               'metering_class = ?', 'metering_standards_ref = ?');
    eb.push(now, body.scada_protocol ?? null, body.scada_point_list_ref ?? null,
            body.metering_class ?? null, body.metering_standards_ref ?? null);
  }
  if (action === 'execute_gtia') { extra.push('gtia_executed_at = ?'); eb.push(now); }
  if (action === 'ipp_reject' || action === 'so_reject') {
    extra.push('rejection_party = ?', 'rejection_reason = ?', 'rejected_at = ?');
    eb.push(action === 'ipp_reject' ? 'ipp' : 'so', body.rejection_reason ?? null, now);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_gtia SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (gtiaCrossesIntoRegulator(action, row.gtia_tier as GtiaTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'gtia', id,
        `gtia_${action}`,
        `GTIA ${action.replace(/_/g, ' ')} — ${row.gtia_tier} — ${(row.installed_capacity_mw as number) ?? '?'}MW — ${(row.network_operator_name as string) ?? (row.id as string).slice(0, 8)}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_gtia SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `gtia_${action}` as EventType,
    actor_id: user.id, entity_type: 'gtia', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, gtia_tier: row.gtia_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_gtia WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'ipp_developer', 'grid_operator', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await gtiaSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
