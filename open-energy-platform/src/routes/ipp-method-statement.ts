// Wave 137 — IPP Method Statement (SWMS) Management
// OHSA Construction Regulations 2014 Reg.7 + Equator Principles EP4 + REIPPPP site safety
// URGENT SLA: high_risk 24h (tightest) → routine 336h (loosest)
// SIGNATURE: approve_ms EVERY tier when critical_lift/confined_space/live_electrical;
//            suspend_work crosses when floor_regulatory_notification.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  SLA_HOURS,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  eventTypeFor,
  statusTsCol,
  type MsStatus,
  type MsAction,
  type RiskTier,
} from '../utils/ipp-method-statement-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface MsRow {
  id: string;
  project_id: string;
  project_name: string | null;
  ms_number: string | null;
  chain_status: MsStatus;
  ms_title: string;
  work_type: string | null;
  risk_tier: RiskTier | null;
  work_area: string | null;
  scheduled_start_date: string | null;
  scheduled_duration_days: number | null;
  is_critical_lift: number;
  is_confined_space: number;
  is_live_electrical: number;
  is_hot_work: number;
  is_working_at_height: number;
  scope_of_work: string;
  work_sequence: string | null;
  resources_personnel: string | null;
  plant_equipment: string | null;
  hazard_register: string | null;
  ppe_requirements: string | null;
  emergency_procedure: string | null;
  environmental_controls: string | null;
  toolbox_talk_notes: string | null;
  suspension_reason: string | null;
  revision_number: number;
  superseded_by_ref: string | null;
  floor_ptw_required: number;
  floor_ie_review_required: number;
  floor_regulatory_notification: number;
  floor_lender_notification: number;
  floor_third_party_inspection: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ptw_ref: string | null;
  ncr_ref: string | null;
  hse_incident_ref: string | null;
  work_order_ref: string | null;
  risk_ref: string | null;
  drafted_at: string | null;
  reviewed_at: string | null;
  risk_assessed_at: string | null;
  approved_at: string | null;
  toolbox_briefed_at: string | null;
  active_at: string | null;
  work_completed_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  superseded_at: string | null;
  suspended_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES = new Set([
  'drafted', 'reviewed', 'risk_assessed', 'approved',
  'toolbox_briefed', 'active', 'work_completed',
]);

function decorateLiveFields(row: MsRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isCriticalWork = !!(row.is_critical_lift || row.is_confined_space || row.is_live_electrical);
  const isSignature = !!(
    row.chain_status === 'approved' && isCriticalWork ||
    row.chain_status === 'suspended' && row.floor_regulatory_notification
  );
  return {
    ...row,
    time_in_state_hours_live:   timeInState,
    sla_remaining_hours_live:   slaHoursRemaining(row.sla_deadline_at, now),
    is_signature_live:          isSignature,
    is_critical_work_live:      isCriticalWork,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-method-statement ──────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_method_statements ORDER BY created_at DESC'
  ).all<MsRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const activeRows = data.filter(r => ACTIVE_STATUSES.has(r.chain_status));

  const dashboard = {
    method_statements: {
      total_count:            data.length,
      active_count:           activeRows.length,
      high_risk_count:        activeRows.filter(r => r.risk_tier === 'high_risk').length,
      awaiting_approval_count:data.filter(r => r.chain_status === 'risk_assessed').length,
      sla_breached_count:     data.filter(r => r.sla_breached).length,
      critical_lift_count:    activeRows.filter(r => r.is_critical_lift).length,
      confined_space_count:   activeRows.filter(r => r.is_confined_space).length,
      live_electrical_count:  activeRows.filter(r => r.is_live_electrical).length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-method-statement/:id ──────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_method_statements WHERE id = ?'
  ).bind(c.req.param('id')).first<MsRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ms_events WHERE ms_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({
    data: {
      method_statement: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-method-statement ─────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    ms_number?: string;
    ms_title?: string;
    work_type?: string;
    risk_tier?: RiskTier;
    work_area?: string;
    scheduled_start_date?: string;
    scheduled_duration_days?: number;
    scope_of_work?: string;
    work_sequence?: string;
    resources_personnel?: string;
    plant_equipment?: string;
    hazard_register?: string;
    ppe_requirements?: string;
    emergency_procedure?: string;
    environmental_controls?: string;
    is_critical_lift?: number;
    is_confined_space?: number;
    is_live_electrical?: number;
    is_hot_work?: number;
    is_working_at_height?: number;
    floor_ptw_required?: number;
    floor_ie_review_required?: number;
    floor_regulatory_notification?: number;
    floor_lender_notification?: number;
    floor_third_party_inspection?: number;
    ptw_ref?: string;
    ncr_ref?: string;
    hse_incident_ref?: string;
    work_order_ref?: string;
    risk_ref?: string;
    [k: string]: unknown;
  };

  if (!body.ms_title || !body.project_id || !body.work_type || !body.risk_tier || !body.scope_of_work) {
    return c.json({ error: 'ms_title, project_id, work_type, risk_tier, and scope_of_work are required' }, 400);
  }

  const tier = body.risk_tier as RiskTier;
  const now = new Date();
  const slaHrs = SLA_HOURS[tier];
  const slaDeadline = slaDeadlineFor(tier, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_method_statements'
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `ms-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_method_statements (
      id, project_id, project_name, ms_number, chain_status,
      ms_title, work_type, risk_tier, work_area, scheduled_start_date,
      scheduled_duration_days,
      is_critical_lift, is_confined_space, is_live_electrical, is_hot_work, is_working_at_height,
      scope_of_work, work_sequence, resources_personnel, plant_equipment,
      hazard_register, ppe_requirements, emergency_procedure, environmental_controls,
      floor_ptw_required, floor_ie_review_required, floor_regulatory_notification,
      floor_lender_notification, floor_third_party_inspection,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      ptw_ref, ncr_ref, hse_incident_ref, work_order_ref, risk_ref,
      drafted_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'drafted',
      ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.ms_number ?? null,
    body.ms_title, body.work_type, tier, body.work_area ?? null,
    body.scheduled_start_date ?? null,
    body.scheduled_duration_days ?? null,
    Number(body.is_critical_lift ?? 0), Number(body.is_confined_space ?? 0),
    Number(body.is_live_electrical ?? 0), Number(body.is_hot_work ?? 0),
    Number(body.is_working_at_height ?? 0),
    body.scope_of_work, body.work_sequence ?? null, body.resources_personnel ?? null,
    body.plant_equipment ?? null, body.hazard_register ?? null,
    body.ppe_requirements ?? null, body.emergency_procedure ?? null,
    body.environmental_controls ?? null,
    Number(body.floor_ptw_required ?? 0), Number(body.floor_ie_review_required ?? 0),
    Number(body.floor_regulatory_notification ?? 0), Number(body.floor_lender_notification ?? 0),
    Number(body.floor_third_party_inspection ?? 0),
    slaHrs, slaDeadline.toISOString(),
    body.ptw_ref ?? null, body.ncr_ref ?? null, body.hse_incident_ref ?? null,
    body.work_order_ref ?? null, body.risk_ref ?? null,
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_method_statements WHERE id = ?'
  ).bind(id).first<MsRow>();

  await fireCascade({
    event: 'ipp_method_statement.submit_for_review' as any,
    actor_id: user.id,
    entity_type: 'ipp_method_statement',
    entity_id: id,
    data: {
      action: 'create',
      ms_title: body.ms_title,
      work_type: body.work_type,
      risk_tier: tier,
      project_id: body.project_id,
      is_critical_lift: Number(body.is_critical_lift ?? 0),
      is_confined_space: Number(body.is_confined_space ?? 0),
      is_live_electrical: Number(body.is_live_electrical ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-method-statement/:id/:action ──────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    reason_code?: string;
    suspension_reason?: string;
    superseded_by_ref?: string;
    toolbox_talk_notes?: string;
    work_sequence?: string;
    resources_personnel?: string;
    plant_equipment?: string;
    hazard_register?: string;
    ppe_requirements?: string;
    emergency_procedure?: string;
    environmental_controls?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_method_statements WHERE id = ?'
  ).bind(id).first<MsRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Method statement is in terminal state: ${row.chain_status}` }, 409);
  }

  const msAction = action as MsAction;
  const toStatus = nextStatus(row.chain_status, msAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(msAction, {
    is_critical_lift:             row.is_critical_lift,
    is_confined_space:            row.is_confined_space,
    is_live_electrical:           row.is_live_electrical,
    floor_regulatory_notification:row.floor_regulatory_notification,
  });

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  // Record state timestamp
  const tsCol = statusTsCol(toStatus);
  updates.push(`${tsCol} = ?`);
  vals.push(now.toISOString());

  if (regulatorCrossed) {
    updates.push('is_reportable = 1');
    if (!row.regulator_ref) {
      const tier = (row.risk_tier ?? 'general').toUpperCase();
      const ref = `W137-MS-${tier}-${now.getFullYear()}-${id.replace('ms-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates
  if (body.suspension_reason)   { updates.push('suspension_reason = ?');  vals.push(body.suspension_reason); }
  if (body.superseded_by_ref)   { updates.push('superseded_by_ref = ?');  vals.push(body.superseded_by_ref); }
  if (body.toolbox_talk_notes)  { updates.push('toolbox_talk_notes = ?'); vals.push(body.toolbox_talk_notes); }
  if (body.work_sequence)       { updates.push('work_sequence = ?');       vals.push(body.work_sequence); }
  if (body.resources_personnel) { updates.push('resources_personnel = ?'); vals.push(body.resources_personnel); }
  if (body.plant_equipment)     { updates.push('plant_equipment = ?');     vals.push(body.plant_equipment); }
  if (body.hazard_register)     { updates.push('hazard_register = ?');     vals.push(body.hazard_register); }
  if (body.ppe_requirements)    { updates.push('ppe_requirements = ?');    vals.push(body.ppe_requirements); }
  if (body.emergency_procedure) { updates.push('emergency_procedure = ?'); vals.push(body.emergency_procedure); }
  if (body.environmental_controls) { updates.push('environmental_controls = ?'); vals.push(body.environmental_controls); }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_method_statements SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `msevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(msAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_ms_events
      (id, ms_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, msAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.reason_code ?? body.suspension_reason ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_method_statement',
    entity_id: id,
    data: {
      action: msAction,
      from_status: row.chain_status,
      to_status: toStatus,
      risk_tier: row.risk_tier,
      work_type: row.work_type,
      is_critical_lift: row.is_critical_lift,
      is_confined_space: row.is_confined_space,
      is_live_electrical: row.is_live_electrical,
      floor_regulatory_notification: row.floor_regulatory_notification,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_method_statements WHERE id = ?'
  ).bind(id).first<MsRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────────
export async function ippMethodStatementSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_method_statements
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('closed', 'rejected', 'superseded', 'archived')
  `).all<MsRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const tier = (row.risk_tier ?? 'routine') as RiskTier;
      const reg = slaBreachCrossesIntoRegulator(tier, {
        is_critical_lift:   row.is_critical_lift,
        is_confined_space:  row.is_confined_space,
        is_live_electrical: row.is_live_electrical,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_method_statements
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_method_statement.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_method_statement',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          risk_tier: row.risk_tier,
          work_type: row.work_type,
          is_critical_lift: row.is_critical_lift,
          is_confined_space: row.is_confined_space,
          is_live_electrical: row.is_live_electrical,
          floor_regulatory_notification: row.floor_regulatory_notification,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
