// Wave 136 — IPP Non-Conformance Report (NCR) Management
// ISO 9001:2015 §8.7 + Equator Principles IV QA + REIPPPP quality requirements
// URGENT SLA: safety_critical 24h (tightest) → cosmetic 720h (loosest)
// SIGNATURE: reject_escalate EVERY tier; accept_as_is crosses when IE/NERSA flag.

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
  type NcrStatus,
  type NcrAction,
  type NcrSeverity,
} from '../utils/ipp-ncr-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface NcrRow {
  id: string;
  project_id: string;
  project_name: string | null;
  ncr_number: string | null;
  chain_status: NcrStatus;
  ncr_category: string | null;
  ncr_severity: NcrSeverity | null;
  discipline: string | null;
  work_area: string | null;
  specification_ref: string | null;
  description: string;
  detected_by: string | null;
  detection_method: string | null;
  disposition: string | null;
  disposition_justification: string | null;
  rework_scope: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  root_cause: string | null;
  rca_method: string | null;
  reinspection_notes: string | null;
  closure_notes: string | null;
  ie_comments: string | null;
  lender_notified: number;
  rework_cost_zar: number | null;
  schedule_impact_days: number | null;
  floor_ie_notification_required: number;
  floor_lender_consent_required: number;
  floor_nersa_reportable: number;
  floor_hold_point_triggered: number;
  floor_safety_stop_work: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  itp_ref: string | null;
  issue_ref: string | null;
  rfi_ref: string | null;
  submittal_ref: string | null;
  hse_incident_ref: string | null;
  change_order_ref: string | null;
  raised_at: string | null;
  acknowledged_at: string | null;
  under_investigation_at: string | null;
  disposition_proposed_at: string | null;
  disposition_reviewed_at: string | null;
  rework_in_progress_at: string | null;
  reinspection_at: string | null;
  corrective_action_planned_at: string | null;
  closed_at: string | null;
  accepted_as_is_at: string | null;
  rejected_escalated_at: string | null;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function decorateLiveFields(row: NcrRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isSignature = !!(
    row.chain_status === 'rejected_escalated' ||
    (row.chain_status === 'accepted_as_is' && (row.floor_ie_notification_required || row.floor_nersa_reportable))
  );
  return {
    ...row,
    time_in_state_hours_live:  timeInState,
    sla_remaining_hours_live:  slaHoursRemaining(row.sla_deadline_at, now),
    is_signature_live:         isSignature,
    is_hold_point_active_live: !!(
      row.floor_hold_point_triggered &&
      !['closed', 'accepted_as_is', 'rejected_escalated', 'voided'].includes(row.chain_status)
    ),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-ncr ────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ncrs ORDER BY created_at DESC'
  ).all<NcrRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const openStatuses = ['raised','acknowledged','under_investigation','disposition_proposed','disposition_reviewed','rework_in_progress','reinspection','corrective_action_planned'];

  const dashboard = {
    ncrs: {
      total_count:          data.length,
      open_count:           data.filter(r => openStatuses.includes(r.chain_status)).length,
      safety_critical_count:data.filter(r => r.ncr_severity === 'safety_critical' && openStatuses.includes(r.chain_status)).length,
      hold_point_count:     data.filter(r => r.is_hold_point_active_live).length,
      sla_breached_count:   data.filter(r => r.sla_breached).length,
      closed_count:         data.filter(r => r.chain_status === 'closed').length,
      rework_cost_total:    data.filter(r => r.chain_status === 'closed').reduce((sum, r) => sum + (r.rework_cost_zar ?? 0), 0),
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-ncr/:id ────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ncrs WHERE id = ?'
  ).bind(c.req.param('id')).first<NcrRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ncr_events WHERE ncr_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({
    data: {
      ncr: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-ncr ───────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    ncr_number?: string;
    ncr_category?: string;
    ncr_severity?: NcrSeverity;
    discipline?: string;
    work_area?: string;
    specification_ref?: string;
    description?: string;
    detected_by?: string;
    detection_method?: string;
    rework_cost_zar?: number;
    schedule_impact_days?: number;
    floor_ie_notification_required?: number;
    floor_lender_consent_required?: number;
    floor_nersa_reportable?: number;
    floor_hold_point_triggered?: number;
    floor_safety_stop_work?: number;
    itp_ref?: string;
    issue_ref?: string;
    rfi_ref?: string;
    submittal_ref?: string;
    hse_incident_ref?: string;
    change_order_ref?: string;
    [k: string]: unknown;
  };

  if (!body.description || !body.project_id || !body.ncr_category || !body.ncr_severity) {
    return c.json({ error: 'description, project_id, ncr_category, and ncr_severity are required' }, 400);
  }

  const severity = body.ncr_severity as NcrSeverity;
  const now = new Date();
  const slaHrs = SLA_HOURS[severity];
  const slaDeadline = slaDeadlineFor(severity, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_ncrs'
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `ncr-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_ncrs (
      id, project_id, project_name, ncr_number, chain_status,
      ncr_category, ncr_severity, discipline, work_area, specification_ref,
      description, detected_by, detection_method,
      rework_cost_zar, schedule_impact_days,
      itp_ref, issue_ref, rfi_ref, submittal_ref, hse_incident_ref, change_order_ref,
      floor_ie_notification_required, floor_lender_consent_required,
      floor_nersa_reportable, floor_hold_point_triggered, floor_safety_stop_work,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      raised_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'raised',
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.ncr_number ?? null,
    body.ncr_category, severity, body.discipline ?? null, body.work_area ?? null, body.specification_ref ?? null,
    body.description, body.detected_by ?? null, body.detection_method ?? null,
    body.rework_cost_zar ?? null, body.schedule_impact_days ?? null,
    body.itp_ref ?? null, body.issue_ref ?? null, body.rfi_ref ?? null,
    body.submittal_ref ?? null, body.hse_incident_ref ?? null, body.change_order_ref ?? null,
    Number(body.floor_ie_notification_required ?? 0), Number(body.floor_lender_consent_required ?? 0),
    Number(body.floor_nersa_reportable ?? 0), Number(body.floor_hold_point_triggered ?? 0),
    Number(body.floor_safety_stop_work ?? 0),
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ncrs WHERE id = ?'
  ).bind(id).first<NcrRow>();

  await fireCascade({
    event: 'ipp_ncr.acknowledge_ncr' as any,
    actor_id: user.id,
    entity_type: 'ipp_ncr',
    entity_id: id,
    data: {
      action: 'create',
      ncr_category: body.ncr_category,
      ncr_severity: severity,
      project_id: body.project_id,
      floor_hold_point_triggered: Number(body.floor_hold_point_triggered ?? 0),
      floor_safety_stop_work: Number(body.floor_safety_stop_work ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-ncr/:id/:action ──────────────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    reason_code?: string;
    disposition?: string;
    disposition_justification?: string;
    rework_scope?: string;
    corrective_action?: string;
    preventive_action?: string;
    root_cause?: string;
    rca_method?: string;
    reinspection_notes?: string;
    closure_notes?: string;
    ie_comments?: string;
    rework_cost_zar?: number;
    schedule_impact_days?: number;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ncrs WHERE id = ?'
  ).bind(id).first<NcrRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `NCR is in terminal state: ${row.chain_status}` }, 409);
  }

  const ncrAction = action as NcrAction;
  const toStatus = nextStatus(row.chain_status, ncrAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(ncrAction, {
    floor_ie_notification_required: row.floor_ie_notification_required,
    floor_nersa_reportable: row.floor_nersa_reportable,
    ncr_severity: row.ncr_severity ?? undefined,
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
      const sev = (row.ncr_severity ?? 'general').toUpperCase();
      const ref = `W136-NCR-${sev}-${now.getFullYear()}-${id.replace('ncr-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates from body
  if (body.disposition)             { updates.push('disposition = ?');             vals.push(body.disposition); }
  if (body.disposition_justification){ updates.push('disposition_justification = ?'); vals.push(body.disposition_justification); }
  if (body.rework_scope)            { updates.push('rework_scope = ?');            vals.push(body.rework_scope); }
  if (body.corrective_action)       { updates.push('corrective_action = ?');       vals.push(body.corrective_action); }
  if (body.preventive_action)       { updates.push('preventive_action = ?');       vals.push(body.preventive_action); }
  if (body.root_cause)              { updates.push('root_cause = ?');              vals.push(body.root_cause); }
  if (body.rca_method)              { updates.push('rca_method = ?');              vals.push(body.rca_method); }
  if (body.reinspection_notes)      { updates.push('reinspection_notes = ?');      vals.push(body.reinspection_notes); }
  if (body.closure_notes)           { updates.push('closure_notes = ?');           vals.push(body.closure_notes); }
  if (body.ie_comments)             { updates.push('ie_comments = ?');             vals.push(body.ie_comments); }
  if (body.rework_cost_zar != null) { updates.push('rework_cost_zar = ?');         vals.push(body.rework_cost_zar); }
  if (body.schedule_impact_days != null) { updates.push('schedule_impact_days = ?'); vals.push(body.schedule_impact_days); }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_ncrs SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `nevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(ncrAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_ncr_events
      (id, ncr_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, ncrAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.reason_code ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_ncr',
    entity_id: id,
    data: {
      action: ncrAction,
      from_status: row.chain_status,
      to_status: toStatus,
      ncr_severity: row.ncr_severity,
      ncr_category: row.ncr_category,
      floor_ie_notification_required: row.floor_ie_notification_required,
      floor_nersa_reportable: row.floor_nersa_reportable,
      floor_hold_point_triggered: row.floor_hold_point_triggered,
      floor_safety_stop_work: row.floor_safety_stop_work,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_ncrs WHERE id = ?'
  ).bind(id).first<NcrRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────────
export async function ippNcrSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_ncrs
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('closed', 'accepted_as_is', 'rejected_escalated', 'voided')
  `).all<NcrRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const severity = (row.ncr_severity ?? 'minor') as NcrSeverity;
      const reg = slaBreachCrossesIntoRegulator(severity, {
        floor_hold_point_triggered: row.floor_hold_point_triggered,
        floor_safety_stop_work: row.floor_safety_stop_work,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_ncrs
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_ncr.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_ncr',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          ncr_severity: row.ncr_severity,
          ncr_category: row.ncr_category,
          floor_hold_point_triggered: row.floor_hold_point_triggered,
          floor_safety_stop_work: row.floor_safety_stop_work,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
