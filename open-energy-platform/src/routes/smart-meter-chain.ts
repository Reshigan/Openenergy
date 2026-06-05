// ═══════════════════════════════════════════════════════════════════════════
// Wave 199 — Smart Meter Asset Commissioning & Data Quality Lifecycle
// Mounted at /api/smart-meter-assets
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  SmaMeterStatus, SmaMeterAction, MeterClass,
  deriveSmaSla, SMA_HARD_TERMINALS,
  SMA_VALID_TRANSITIONS, SMA_STATE_TRANSITIONS,
  smaCrossesIntoRegulator, smaSlaBreachCrossesIntoRegulator,
} from '../utils/smart-meter-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'support', 'grid_operator', 'ipp_developer'];

export async function smaSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...SMA_HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, meter_class FROM oe_smart_meter_assets
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...SMA_HARD_TERMINALS, now)
    .all<{ id: string; meter_class: MeterClass }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = smaSlaBreachCrossesIntoRegulator(row.meter_class);

    await env.DB
      .prepare(
        `UPDATE oe_smart_meter_assets
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    if (reportable) {
      await env.DB
        .prepare(
          `INSERT INTO regulator_inbox
             (id, category, priority, subject, body, source_table, source_id,
              source_event, participant_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `sma_sla_${row.id}_${Date.now()}`,
          'smart_meter',
          'high',
          `Smart Meter SLA Breach — ${row.meter_class}`,
          `Smart meter asset ${row.id} (${row.meter_class}) has breached its SLA deadline.`,
          'oe_smart_meter_assets',
          row.id,
          'sma_evt_sla_breached',
          row.id,
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'sma_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'smart_meter_asset',
      entity_id: row.id,
      data: { meter_class: row.meter_class, regulator_notified: reportable },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list ────────────────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);
  const {
    status, meter_class, site_id, owner_id: qOwner,
    page = '1', per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('owner_id = ?');
    binds.push(user.id);
  } else {
    if (qOwner)     { clauses.push('owner_id = ?');     binds.push(qOwner); }
    if (status)     { clauses.push('chain_status = ?'); binds.push(status); }
    if (meter_class){ clauses.push('meter_class = ?');  binds.push(meter_class); }
    if (site_id)    { clauses.push('site_id = ?');      binds.push(site_id); }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPh = [...SMA_HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(`SELECT * FROM oe_smart_meter_assets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_smart_meter_assets ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           SUM(CASE WHEN chain_status NOT IN (${terminalPh}) THEN 1 ELSE 0 END) as in_progress,
           SUM(CASE WHEN chain_status = 'operational' THEN 1 ELSE 0 END) as operational,
           SUM(CASE WHEN chain_status = 'fault_detected' THEN 1 ELSE 0 END) as faulted,
           SUM(CASE WHEN chain_status = 'decommissioned' THEN 1 ELSE 0 END) as decommissioned,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached
         FROM oe_smart_meter_assets ${where}`,
      )
      .bind(...[...SMA_HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: {
      in_progress:  kpis?.in_progress  ?? 0,
      operational:  kpis?.operational  ?? 0,
      faulted:      kpis?.faulted      ?? 0,
      decommissioned: kpis?.decommissioned ?? 0,
      sla_breached: kpis?.sla_breached ?? 0,
    },
    pagination: {
      page: pageNum, per_page: perPage,
      total: totalRow?.n ?? 0,
      total_pages: Math.ceil((totalRow?.n ?? 0) / perPage),
    },
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_smart_meter_assets WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator', 'grid_operator'].includes(user.role) &&
    row.owner_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'smart_meter_asset' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: { ...row, timeline: timeline.results ?? [] } });
});

// ─── POST / — create asset record ────────────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    meter_serial: string;
    meter_class?: MeterClass;
    site_id: string;
    owner_id?: string;
    make_model?: string;
    communication_tech?: string;
  }>();

  if (!body.meter_serial || !body.site_id) {
    return c.json({ success: false, error: 'meter_serial and site_id are required' }, 400);
  }

  const meterClass = (body.meter_class ?? 'post_paid') as MeterClass;
  const now        = new Date();
  const nowIso     = now.toISOString();
  const id         = `sma_${crypto.randomUUID()}`;
  const slaDays    = deriveSmaSla(meterClass);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000).toISOString().slice(0, 10);
  const ownerId    = body.owner_id ?? user.id;

  await c.env.DB
    .prepare(
      `INSERT INTO oe_smart_meter_assets
         (id, meter_serial, meter_class, site_id, owner_id, make_model,
          communication_tech, chain_status,
          sla_deadline, sla_breached, regulator_notified,
          actor_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,'ordered',?,0,0,?,?,?)`,
    )
    .bind(
      id, body.meter_serial, meterClass, body.site_id, ownerId,
      body.make_model ?? null, body.communication_tech ?? null,
      slaDeadline, user.id, nowIso, nowIso,
    )
    .run();

  await fireCascade({
    event: 'sma_evt_created' as EventType,
    actor_id: user.id,
    entity_type: 'smart_meter_asset',
    entity_id: id,
    data: { meter_serial: body.meter_serial, meter_class: meterClass, site_id: body.site_id, sla_deadline: slaDeadline },
    env: c.env,
  });

  return c.json({ success: true, data: { id, meter_class: meterClass, sla_deadline: slaDeadline } }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const body = await c.req.json<{
    action: SmaMeterAction;
    reason?: string | null;
    fault_code?: string | null;
    firmware_version?: string | null;
    installation_photo_ref?: string | null;
    commissioning_cert_ref?: string | null;
    fat_certificate_ref?: string | null;
    data_quality_score?: number | null;
    replacement_reason?: string | null;
  }>();

  if (!body.action) return c.json({ success: false, error: 'action is required' }, 400);

  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_smart_meter_assets WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const current   = row.chain_status as SmaMeterStatus;
  const action    = body.action as SmaMeterAction;
  const meterClass = row.meter_class as MeterClass;

  if (SMA_HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 400);
  }

  const rule = SMA_VALID_TRANSITIONS[action];
  if (!rule) return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  if (!rule.from.includes(current)) {
    return c.json({ success: false, error: `Cannot apply '${action}' from '${current}'` }, 400);
  }

  const nextStatus = SMA_STATE_TRANSITIONS[action];
  const now        = new Date();
  const nowIso     = now.toISOString();
  const reportable = smaCrossesIntoRegulator(action, meterClass);

  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached       = 1;
    regulatorNotified = 1;
  }

  const decommissionedAt = (nextStatus === 'decommissioned') ? nowIso : (row.decommissioned_at as string | null);

  await c.env.DB
    .prepare(
      `UPDATE oe_smart_meter_assets
       SET chain_status = ?, reason = ?, actor_id = ?,
           sla_breached = ?, regulator_notified = ?,
           fault_code = COALESCE(?, fault_code),
           fault_detected_at = CASE WHEN ? = 'fault_detected' THEN ? ELSE fault_detected_at END,
           firmware_version = COALESCE(?, firmware_version),
           installation_photo_ref = COALESCE(?, installation_photo_ref),
           commissioning_cert_ref = COALESCE(?, commissioning_cert_ref),
           fat_certificate_ref = COALESCE(?, fat_certificate_ref),
           data_quality_score = COALESCE(?, data_quality_score),
           replacement_reason = COALESCE(?, replacement_reason),
           decommissioned_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus, body.reason ?? null, user.id,
      slaBreached, regulatorNotified,
      body.fault_code ?? null,
      nextStatus, nowIso,
      body.firmware_version ?? null,
      body.installation_photo_ref ?? null,
      body.commissioning_cert_ref ?? null,
      body.fat_certificate_ref ?? null,
      body.data_quality_score ?? null,
      body.replacement_reason ?? null,
      decommissionedAt,
      nowIso,
      id,
    )
    .run();

  if (reportable) {
    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id,
            source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        `sma_reg_${id}_${action}_${Date.now()}`,
        'smart_meter',
        meterClass === 'hv_bulk' ? 'critical' : 'high',
        `Smart Meter — ${action.replace(/_/g, ' ')} — ${meterClass}`,
        `Smart meter asset ${id} (${meterClass}) reached '${nextStatus}' via '${action}'.`,
        'oe_smart_meter_assets', id, `sma_evt_${action}`,
        row.owner_id as string, nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `sma_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'smart_meter_asset',
    entity_id: id,
    data: {
      action, from_status: current, to_status: nextStatus,
      meter_class: meterClass, reason: body.reason ?? null,
      regulator_notified: reportable, crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, status: nextStatus, regulator_notified: regulatorNotified === 1 } });
});

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await smaSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const smartMeterRoutes = router;
export default router;
