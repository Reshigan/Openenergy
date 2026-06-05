// ═══════════════════════════════════════════════════════════════════════════════
// W211 — Grid Transformer / Substation Asset Lifecycle
// NERSA Grid Code Chapter 3 + NRS 048-2 + IEC 60076 + NRS 097
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  SasStatus, SasAction, SubstationAssetTier,
  deriveSasSla, SAS_HARD_TERMINALS,
  SAS_VALID_TRANSITIONS, SAS_STATE_TRANSITIONS,
  sasCrossesIntoRegulator, sasSlaBreachCrossesIntoRegulator,
} from '../utils/substation-asset-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'grid_operator', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function sasSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_substation_assets
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('decommissioned','failed')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_substation_assets SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (sasSlaBreachCrossesIntoRegulator(row.asset_tier as SubstationAssetTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'substation_asset', row.id,
          'sas_sla_breach',
          `Substation asset SLA breached — ${row.asset_tier} — ${row.name}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'sas_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'substation_asset', entity_id: row.id as string,
      data: { asset_tier: row.asset_tier, name: row.name, asset_number: row.asset_number },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'grid_operator', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_substation_assets WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    energised: all.filter(r => r.chain_status === 'energised').length,
    out_of_service: all.filter(r => ['out_of_service', 'refurbishment'].includes(r.chain_status as string)).length,
    condition_due: all.filter(r => r.chain_status === 'condition_assessment').length,
    failed: all.filter(r => r.chain_status === 'failed').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_substation_assets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'grid_operator', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'substation_asset' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    asset_number: string;
    asset_type?: string;
    asset_tier?: SubstationAssetTier;
    name: string;
    location_name?: string;
    voltage_kv?: number;
    rated_mva?: number;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
    year_manufactured?: number;
    expected_life_years?: number;
    reason?: string;
  }>();

  if (!body.asset_number || !body.name) return c.json({ success: false, error: 'asset_number and name required' }, 422);

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.asset_tier ?? 'distribution';

  const now = new Date().toISOString();
  const slaDays = deriveSasSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_substation_assets
      (id, participant_id, asset_number, asset_type, asset_tier, name, location_name,
       voltage_kv, rated_mva, manufacturer, model, serial_number, year_manufactured, expected_life_years,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'registered',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.asset_number, body.asset_type ?? 'power_transformer', tier,
      body.name, body.location_name ?? null,
      body.voltage_kv ?? null, body.rated_mva ?? null,
      body.manufacturer ?? null, body.model ?? null, body.serial_number ?? null,
      body.year_manufactured ?? null, body.expected_life_years ?? 40,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'sas_created' as EventType,
    actor_id: user.id, entity_type: 'substation_asset', entity_id: id,
    data: { asset_tier: tier, asset_number: body.asset_number, name: body.name },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_substation_assets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: SasAction;
    reason?: string;
    condition_score?: number;
    remaining_life_years?: number;
    refurbishment_type?: string;
    refurbishment_cost_zar?: number;
    decommission_reason?: string;
    failure_mode?: string;
    failure_investigation_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_substation_assets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as SasStatus;
  if (SAS_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Asset in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = SAS_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = SAS_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_substation_assets SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'energise') { extra.push('commissioned_at = ?'); eb.push((row.commissioned_at as string | null) ?? now); }
  if (action === 'schedule_assessment') { extra.push('last_assessed_at = ?'); eb.push(now); }
  if (body.condition_score != null) { extra.push('condition_score = ?'); eb.push(body.condition_score); }
  if (body.remaining_life_years != null) { extra.push('remaining_life_years = ?'); eb.push(body.remaining_life_years); }
  if (body.refurbishment_type) { extra.push('refurbishment_type = ?'); eb.push(body.refurbishment_type); }
  if (body.refurbishment_cost_zar != null) { extra.push('refurbishment_cost_zar = ?'); eb.push(body.refurbishment_cost_zar); }
  if (action === 'start_refurbishment') { extra.push('refurbishment_started_at = ?'); eb.push(now); }
  if (action === 'return_to_service') { extra.push('refurbishment_completed_at = ?'); eb.push(now); }
  if (body.decommission_reason) { extra.push('decommission_reason = ?'); eb.push(body.decommission_reason); }
  if (action === 'decommission') { extra.push('decommissioned_at = ?'); eb.push(now); }
  if (body.failure_mode) { extra.push('failure_mode = ?'); eb.push(body.failure_mode); }
  if (action === 'record_failure') { extra.push('failure_reported_at = ?'); eb.push(now); }
  if (body.failure_investigation_ref) { extra.push('failure_investigation_ref = ?'); eb.push(body.failure_investigation_ref); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_substation_assets SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (sasCrossesIntoRegulator(action, row.asset_tier as SubstationAssetTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'substation_asset', id,
        `sas_${action}`,
        `Asset ${action.replace(/_/g, ' ')} — ${row.asset_tier} — ${row.name} (${row.asset_number})`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_substation_assets SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `sas_${action}` as EventType,
    actor_id: user.id, entity_type: 'substation_asset', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, asset_tier: row.asset_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_substation_assets WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'grid_operator', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await sasSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
