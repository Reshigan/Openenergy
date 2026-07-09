// ═══════════════════════════════════════════════════════════════════════════════
// W221 — Esums Grid Export Curtailment & Compensation Claim
// IEC 61724 / NERSA Grid Code §CSC-2
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  EcStatus, EcAction, EcTier,
  deriveEcSla, EC_HARD_TERMINALS,
  EC_VALID_TRANSITIONS, EC_STATE_TRANSITIONS,
  ecCrossesIntoRegulator, ecSlaBreachCrossesIntoRegulator,
} from '../utils/export-curtailment-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'support', 'ipp_developer', 'grid_operator'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function ecSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_export_curtailments
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('settled','rejected','withdrawn','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_export_curtailments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (ecSlaBreachCrossesIntoRegulator(row.curtailment_tier as EcTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'export_curtailment', row.id,
          'ec_sla_breach',
          `Export curtailment SLA breached — ${row.curtailment_tier} — ${row.deemed_energy_mwh ?? '?'}MWh`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'ec_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'export_curtailment', entity_id: row.id as string,
      data: { curtailment_tier: row.curtailment_tier, site_id: row.site_id },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support', 'ipp_developer', 'grid_operator'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_export_curtailments WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const totalDeemedMwh = all.reduce((s: number, r: Record<string, unknown>) => s + ((r.deemed_energy_mwh as number) ?? 0), 0);
  const totalClaimZar = all.reduce((s: number, r: Record<string, unknown>) => s + ((r.claim_amount_zar as number) ?? 0), 0);
  const kpis = {
    total: all.length,
    active: all.filter(r => !['settled','rejected','withdrawn','cancelled'].includes(r.chain_status as string)).length,
    settled: all.filter(r => r.chain_status === 'settled').length,
    disputed: all.filter(r => ['disputed','arbitration'].includes(r.chain_status as string)).length,
    total_deemed_mwh: Math.round(totalDeemedMwh * 10) / 10,
    total_claim_zar: Math.round(totalClaimZar),
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_export_curtailments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'ipp_developer', 'grid_operator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'export_curtailment' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    curtailment_tier?: EcTier;
    curtailment_type?: string;
    site_id?: string;
    meter_id?: string;
    so_curtailment_ref?: string;
    ppa_ref?: string;
    curtailment_start?: string;
    curtailment_end?: string;
    curtailment_duration_h?: number;
    available_capacity_mw?: number;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tierErr = badEnum('curtailment_tier', body.curtailment_tier, ['minor','moderate','significant','systemic']);
  if (tierErr) return c.json({ success: false, error: tierErr }, 400);
  const typeErr = badEnum('curtailment_type', body.curtailment_type, ['network_congestion','load_management','emergency_curtailment','planned_maintenance','frequency_deviation','voltage_violation']);
  if (typeErr) return c.json({ success: false, error: typeErr }, 400);
  const tier = body.curtailment_tier ?? 'moderate';

  const now = new Date().toISOString();
  const slaDays = deriveEcSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_export_curtailments
      (id, participant_id, curtailment_tier, curtailment_type, site_id, meter_id,
       so_curtailment_ref, ppa_ref, curtailment_start, curtailment_end,
       curtailment_duration_h, available_capacity_mw,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'curtailment_detected',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.curtailment_type ?? null,
      body.site_id ?? null, body.meter_id ?? null,
      body.so_curtailment_ref ?? null, body.ppa_ref ?? null,
      body.curtailment_start ?? null, body.curtailment_end ?? null,
      body.curtailment_duration_h ?? null, body.available_capacity_mw ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'ec_created' as EventType,
    actor_id: user.id, entity_type: 'export_curtailment', entity_id: id,
    data: { curtailment_tier: tier, site_id: body.site_id },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_export_curtailments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: EcAction;
    reason?: string;
    actual_generation_mwh?: number;
    deemed_energy_mwh?: number;
    irradiance_ghi_kwh_m2?: number;
    tariff_rate_per_mwh?: number;
    claim_amount_zar?: number;
    compensation_paid_zar?: number;
    settlement_ref?: string;
    dispute_grounds?: string;
    arbitration_ref?: string;
    rejection_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_export_curtailments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as EcStatus;
  if (EC_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Claim in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = EC_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, EC_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_export_curtailments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.actual_generation_mwh != null) { extra.push('actual_generation_mwh = ?'); eb.push(body.actual_generation_mwh); }
  if (body.deemed_energy_mwh != null) { extra.push('deemed_energy_mwh = ?'); eb.push(body.deemed_energy_mwh); }
  if (body.irradiance_ghi_kwh_m2 != null) { extra.push('irradiance_ghi_kwh_m2 = ?'); eb.push(body.irradiance_ghi_kwh_m2); }
  if (body.tariff_rate_per_mwh != null) { extra.push('tariff_rate_per_mwh = ?'); eb.push(body.tariff_rate_per_mwh); }
  if (body.claim_amount_zar != null) { extra.push('claim_amount_zar = ?'); eb.push(body.claim_amount_zar); }
  if (body.compensation_paid_zar != null) { extra.push('compensation_paid_zar = ?'); eb.push(body.compensation_paid_zar); }
  if (body.settlement_ref) { extra.push('settlement_ref = ?'); eb.push(body.settlement_ref); }
  if (body.dispute_grounds) { extra.push('dispute_grounds = ?'); eb.push(body.dispute_grounds); }
  if (body.arbitration_ref) { extra.push('arbitration_ref = ?'); eb.push(body.arbitration_ref); }
  if (body.rejection_reason) { extra.push('rejection_reason = ?'); eb.push(body.rejection_reason); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_export_curtailments SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (ecCrossesIntoRegulator(action, row.curtailment_tier as EcTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'export_curtailment', id,
        `ec_${action}`,
        `Export curtailment ${action.replace(/_/g, ' ')} — ${row.curtailment_tier} — ${row.deemed_energy_mwh ?? '?'}MWh`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_export_curtailments SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `ec_${action}` as EventType,
    actor_id: user.id, entity_type: 'export_curtailment', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, curtailment_tier: row.curtailment_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_export_curtailments WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'ipp_developer', 'grid_operator'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await ecSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
