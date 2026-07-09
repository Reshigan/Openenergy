// Wave 138 — IPP Environmental Monitoring Log
// NEMA s30 + DFFE EIA conditions + ISO 14001:2015 + REIPPPP environmental compliance.
// URGENT SLA: critical 24h (tightest) → baseline 720h (loosest).
// SIGNATURE: flag_exceedance EVERY tier on near_sensitive_receptor/eia_condition_breach/nema_s30_notification;
//            submit_report crosses when floor_dffe_report_required.

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
  type EnvMonitoringStatus,
  type EnvMonitoringAction,
  type MonitoringTier,
} from '../utils/ipp-env-monitoring-spec';
import { badEnum } from '../utils/validation';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface EnvMonitoringRow {
  id: string;
  project_id: string;
  project_name: string | null;
  monitoring_ref: string | null;
  chain_status: EnvMonitoringStatus;
  monitoring_title: string;
  monitoring_category: string | null;
  monitoring_tier: MonitoringTier | null;
  eia_condition_ref: string | null;
  sampling_location: string | null;
  monitoring_frequency: string | null;
  parameter_name: string | null;
  measured_value: number | null;
  measurement_unit: string | null;
  permit_limit_min: number | null;
  permit_limit_max: number | null;
  exceedance_magnitude: number | null;
  exceedance_pct: number | null;
  is_near_sensitive_receptor: number;
  lab_accredited: number;
  lab_name: string | null;
  lab_sample_ref: string | null;
  sampled_at: string | null;
  results_received_at: string | null;
  sampling_methodology: string | null;
  findings: string | null;
  exceedance_cause: string | null;
  corrective_actions: string | null;
  corrective_action_deadline: string | null;
  report_title: string | null;
  report_submitted_to: string | null;
  complaint_description: string | null;
  floor_nema_s30_notification: number;
  floor_dffe_report_required: number;
  floor_public_notice_required: number;
  floor_lender_report_required: number;
  floor_eia_condition_breach: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ncr_ref: string | null;
  hse_incident_ref: string | null;
  ms_ref: string | null;
  stage_gate_ref: string | null;
  scheduled_at: string | null;
  sampling_at: string | null;
  sample_submitted_at: string | null;
  compliance_assessed_at: string | null;
  report_drafted_at: string | null;
  report_submitted_at: string | null;
  closed_at: string | null;
  exceedance_flagged_at: string | null;
  corrective_action_at: string | null;
  under_investigation_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES = new Set([
  'scheduled', 'sampling', 'sample_submitted', 'results_received',
  'compliance_assessed', 'report_drafted', 'report_submitted',
  'exceedance_flagged', 'corrective_action', 'under_investigation',
]);

const EXCEEDANCE_STATUSES = new Set(['exceedance_flagged', 'corrective_action', 'under_investigation']);

function decorateLiveFields(row: EnvMonitoringRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isExceedance = EXCEEDANCE_STATUSES.has(row.chain_status);
  const isSignature = !!(
    isExceedance && (row.is_near_sensitive_receptor || row.floor_eia_condition_breach || row.floor_nema_s30_notification)
  );
  return {
    ...row,
    time_in_state_hours_live:   timeInState,
    sla_remaining_hours_live:   slaHoursRemaining(row.sla_deadline_at, now),
    is_exceedance_live:         isExceedance,
    is_signature_live:          isSignature,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-env-monitoring ──────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_env_monitoring ORDER BY created_at DESC'
  ).all<EnvMonitoringRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const activeRows = data.filter(r => ACTIVE_STATUSES.has(r.chain_status));

  const dashboard = {
    env_monitoring: {
      total_count:          data.length,
      active_count:         activeRows.length,
      exceedance_count:     data.filter(r => EXCEEDANCE_STATUSES.has(r.chain_status)).length,
      critical_tier_count:  activeRows.filter(r => r.monitoring_tier === 'critical').length,
      near_receptor_count:  activeRows.filter(r => r.is_near_sensitive_receptor).length,
      sla_breached_count:   data.filter(r => r.sla_breached).length,
      dffe_report_count:    data.filter(r => r.floor_dffe_report_required && r.chain_status !== 'closed' && r.chain_status !== 'cancelled').length,
      eia_breach_count:     data.filter(r => r.floor_eia_condition_breach).length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-env-monitoring/:id ─────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_env_monitoring WHERE id = ?'
  ).bind(c.req.param('id')).first<EnvMonitoringRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_env_events WHERE monitoring_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({
    data: {
      env_monitoring: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-env-monitoring ─────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    monitoring_ref?: string;
    monitoring_title?: string;
    monitoring_category?: string;
    monitoring_tier?: MonitoringTier;
    eia_condition_ref?: string;
    sampling_location?: string;
    monitoring_frequency?: string;
    parameter_name?: string;
    measurement_unit?: string;
    permit_limit_min?: number;
    permit_limit_max?: number;
    is_near_sensitive_receptor?: number;
    lab_accredited?: number;
    lab_name?: string;
    lab_sample_ref?: string;
    sampling_methodology?: string;
    complaint_description?: string;
    floor_nema_s30_notification?: number;
    floor_dffe_report_required?: number;
    floor_public_notice_required?: number;
    floor_lender_report_required?: number;
    floor_eia_condition_breach?: number;
    ncr_ref?: string;
    hse_incident_ref?: string;
    ms_ref?: string;
    stage_gate_ref?: string;
    [k: string]: unknown;
  };

  if (!body.monitoring_title || !body.project_id || !body.monitoring_category || !body.monitoring_tier) {
    return c.json({ error: 'monitoring_title, project_id, monitoring_category, and monitoring_tier are required' }, 400);
  }
  const monitoringTierErr = badEnum('monitoring_tier', body.monitoring_tier, ['critical', 'regular', 'routine', 'baseline']);
  if (monitoringTierErr) return c.json({ error: monitoringTierErr }, 400);

  const tier = body.monitoring_tier as MonitoringTier;
  const now = new Date();
  const slaHrs = SLA_HOURS[tier];
  const slaDeadline = slaDeadlineFor(tier, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_env_monitoring'
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `env-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_env_monitoring (
      id, project_id, project_name, monitoring_ref, chain_status,
      monitoring_title, monitoring_category, monitoring_tier,
      eia_condition_ref, sampling_location, monitoring_frequency,
      parameter_name, measurement_unit, permit_limit_min, permit_limit_max,
      is_near_sensitive_receptor, lab_accredited, lab_name, lab_sample_ref,
      sampling_methodology, complaint_description,
      floor_nema_s30_notification, floor_dffe_report_required,
      floor_public_notice_required, floor_lender_report_required, floor_eia_condition_breach,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      ncr_ref, hse_incident_ref, ms_ref, stage_gate_ref,
      scheduled_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'scheduled',
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.monitoring_ref ?? null,
    body.monitoring_title, body.monitoring_category, tier,
    body.eia_condition_ref ?? null, body.sampling_location ?? null, body.monitoring_frequency ?? null,
    body.parameter_name ?? null, body.measurement_unit ?? null,
    body.permit_limit_min ?? null, body.permit_limit_max ?? null,
    Number(body.is_near_sensitive_receptor ?? 0), Number(body.lab_accredited ?? 0),
    body.lab_name ?? null, body.lab_sample_ref ?? null,
    body.sampling_methodology ?? null, body.complaint_description ?? null,
    Number(body.floor_nema_s30_notification ?? 0), Number(body.floor_dffe_report_required ?? 0),
    Number(body.floor_public_notice_required ?? 0), Number(body.floor_lender_report_required ?? 0),
    Number(body.floor_eia_condition_breach ?? 0),
    slaHrs, slaDeadline.toISOString(),
    body.ncr_ref ?? null, body.hse_incident_ref ?? null,
    body.ms_ref ?? null, body.stage_gate_ref ?? null,
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_env_monitoring WHERE id = ?'
  ).bind(id).first<EnvMonitoringRow>();

  await fireCascade({
    event: 'ipp_env_monitoring.start_sampling' as any,
    actor_id: user.id,
    entity_type: 'ipp_env_monitoring',
    entity_id: id,
    data: {
      action: 'create',
      monitoring_title: body.monitoring_title,
      monitoring_category: body.monitoring_category,
      monitoring_tier: tier,
      project_id: body.project_id,
      is_near_sensitive_receptor: Number(body.is_near_sensitive_receptor ?? 0),
      floor_eia_condition_breach: Number(body.floor_eia_condition_breach ?? 0),
      floor_nema_s30_notification: Number(body.floor_nema_s30_notification ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-env-monitoring/:id/:action ────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    reason_code?: string;
    measured_value?: number;
    measurement_unit?: string;
    permit_limit_max?: number;
    exceedance_magnitude?: number;
    exceedance_pct?: number;
    exceedance_cause?: string;
    corrective_actions?: string;
    corrective_action_deadline?: string;
    findings?: string;
    sampling_methodology?: string;
    lab_name?: string;
    lab_sample_ref?: string;
    lab_accredited?: number;
    report_title?: string;
    report_submitted_to?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_env_monitoring WHERE id = ?'
  ).bind(id).first<EnvMonitoringRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Monitoring record is in terminal state: ${row.chain_status}` }, 409);
  }

  const envAction = action as EnvMonitoringAction;
  const toStatus = nextStatus(row.chain_status, envAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(envAction, {
    is_near_sensitive_receptor: row.is_near_sensitive_receptor,
    floor_eia_condition_breach:  row.floor_eia_condition_breach,
    floor_nema_s30_notification: row.floor_nema_s30_notification,
    floor_dffe_report_required:  row.floor_dffe_report_required,
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
      const tier = (row.monitoring_tier ?? 'routine').toUpperCase();
      const ref = `W138-ENV-${tier}-${now.getFullYear()}-${id.replace('env-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates based on action
  if (body.measured_value != null)   { updates.push('measured_value = ?');        vals.push(body.measured_value); }
  if (body.measurement_unit)         { updates.push('measurement_unit = ?');       vals.push(body.measurement_unit); }
  if (body.permit_limit_max != null) { updates.push('permit_limit_max = ?');       vals.push(body.permit_limit_max); }
  if (body.exceedance_magnitude != null) { updates.push('exceedance_magnitude = ?'); vals.push(body.exceedance_magnitude); }
  if (body.exceedance_pct != null)   { updates.push('exceedance_pct = ?');         vals.push(body.exceedance_pct); }
  if (body.exceedance_cause)         { updates.push('exceedance_cause = ?');        vals.push(body.exceedance_cause); }
  if (body.corrective_actions)       { updates.push('corrective_actions = ?');      vals.push(body.corrective_actions); }
  if (body.corrective_action_deadline) { updates.push('corrective_action_deadline = ?'); vals.push(body.corrective_action_deadline); }
  if (body.findings)                 { updates.push('findings = ?');                vals.push(body.findings); }
  if (body.sampling_methodology)     { updates.push('sampling_methodology = ?');    vals.push(body.sampling_methodology); }
  if (body.lab_name)                 { updates.push('lab_name = ?');                vals.push(body.lab_name); }
  if (body.lab_sample_ref)           { updates.push('lab_sample_ref = ?');          vals.push(body.lab_sample_ref); }
  if (body.lab_accredited != null)   { updates.push('lab_accredited = ?');          vals.push(body.lab_accredited); }
  if (body.report_title)             { updates.push('report_title = ?');             vals.push(body.report_title); }
  if (body.report_submitted_to)      { updates.push('report_submitted_to = ?');      vals.push(body.report_submitted_to); }
  // Record results_received_at on record_results action
  if (envAction === 'record_results') {
    updates.push('results_received_at = ?');
    vals.push(now.toISOString());
  }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_env_monitoring SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `envevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(envAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_env_events
      (id, monitoring_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, envAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.reason_code ?? body.exceedance_cause ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_env_monitoring',
    entity_id: id,
    data: {
      action: envAction,
      from_status: row.chain_status,
      to_status: toStatus,
      monitoring_tier: row.monitoring_tier,
      monitoring_category: row.monitoring_category,
      is_near_sensitive_receptor: row.is_near_sensitive_receptor,
      floor_eia_condition_breach:  row.floor_eia_condition_breach,
      floor_nema_s30_notification: row.floor_nema_s30_notification,
      floor_dffe_report_required:  row.floor_dffe_report_required,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
      measured_value: row.measured_value,
      permit_limit_max: row.permit_limit_max,
      exceedance_pct: row.exceedance_pct,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_env_monitoring WHERE id = ?'
  ).bind(id).first<EnvMonitoringRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────────
export async function ippEnvMonitoringSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_env_monitoring
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('closed', 'cancelled')
  `).all<EnvMonitoringRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const tier = (row.monitoring_tier ?? 'routine') as MonitoringTier;
      const reg = slaBreachCrossesIntoRegulator(tier, {
        is_near_sensitive_receptor: !!row.is_near_sensitive_receptor,
        floor_eia_condition_breach:  !!row.floor_eia_condition_breach,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_env_monitoring
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_env_monitoring.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_env_monitoring',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          monitoring_tier: row.monitoring_tier,
          monitoring_category: row.monitoring_category,
          is_near_sensitive_receptor: row.is_near_sensitive_receptor,
          floor_eia_condition_breach:  row.floor_eia_condition_breach,
          floor_nema_s30_notification: row.floor_nema_s30_notification,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
