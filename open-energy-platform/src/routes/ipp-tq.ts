// Wave 142 — IPP Technical Query (TQ) Log
// ISO 9001:2015 design communication requirements + FIDIC EPC contracts + CIDB best practice.
// URGENT SLA: safety_critical 24h (tightest) / construction_blocking 48h / standard 168h / information_only 336h.
// SIGNATURE: flag_design_change EVERY tier on floor_structural_safety;
//            escalate_tq when floor_ie_notification_required;
//            issue_response when floor_nersa_impact.
// Beats Aconex (static document workflow) with full designer-response P6 lifecycle.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  SLA_HOURS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  eventTypeFor,
  statusTsCol,
  type TqStatus,
  type TqAction,
  type QueryUrgency,
} from '../utils/ipp-tq-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface TqRow {
  id: string;
  project_id: string;
  project_name: string | null;
  tq_number: string | null;
  chain_status: TqStatus;
  tq_title: string;
  discipline: string | null;
  query_urgency: QueryUrgency | null;
  contractor_ref: string | null;
  query_description: string;
  drawing_ref: string | null;
  specification_ref: string | null;
  proposed_solution: string | null;
  assigned_designer: string | null;
  design_company: string | null;
  assigned_at: string | null;
  response_description: string | null;
  response_type: string | null;
  design_change_ref: string | null;
  rejection_reason: string | null;
  escalation_reason: string | null;
  escalation_notes: string | null;
  floor_structural_safety: number;
  floor_ie_notification_required: number;
  floor_lender_notification: number;
  floor_nersa_impact: number;
  floor_specification_deviation: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  rfi_ref: string | null;
  ncr_ref: string | null;
  ms_ref: string | null;
  submittal_ref: string | null;
  raised_at: string | null;
  logged_at: string | null;
  allocated_at: string | null;
  under_review_at: string | null;
  response_drafted_at: string | null;
  response_approved_at: string | null;
  response_issued_at: string | null;
  acknowledged_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  design_change_required_at: string | null;
  escalated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const OPEN_STATUSES = new Set<TqStatus>([
  'raised', 'logged', 'allocated', 'under_review', 'response_drafted',
  'response_approved', 'response_issued', 'design_change_required', 'escalated',
]);

function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

function decorateLiveFields(row: TqRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isOpen = OPEN_STATUSES.has(row.chain_status);
  const isSignature = !!(
    (row.chain_status === 'design_change_required' && row.floor_structural_safety) ||
    (row.chain_status === 'escalated' && row.floor_ie_notification_required)
  );

  return {
    ...row,
    time_in_state_hours_live: timeInState,
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    is_open_live: isOpen,
    is_signature_live: isSignature,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-tq ──────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_tqs ORDER BY created_at DESC',
  ).all<TqRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const openCount = data.filter(r => OPEN_STATUSES.has(r.chain_status)).length;
  const constructionBlockingCount = data.filter(r =>
    r.query_urgency === 'construction_blocking' && OPEN_STATUSES.has(r.chain_status),
  ).length;
  const designChangeCount = data.filter(r => r.chain_status === 'design_change_required').length;
  const escalatedCount = data.filter(r => r.chain_status === 'escalated').length;
  const slaBreachedCount = data.filter(r => r.sla_breached).length;
  const safetyCriticalCount = data.filter(r =>
    r.query_urgency === 'safety_critical' && OPEN_STATUSES.has(r.chain_status),
  ).length;

  const dashboard = {
    tqs: {
      total_count: data.length,
      open_count: openCount,
      construction_blocking_count: constructionBlockingCount,
      design_change_count: designChangeCount,
      escalated_count: escalatedCount,
      sla_breached_count: slaBreachedCount,
      safety_critical_count: safetyCriticalCount,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-tq/:id ─────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_tqs WHERE id = ?',
  ).bind(c.req.param('id')).first<TqRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_tq_events WHERE tq_id = ? ORDER BY created_at ASC',
  ).bind(row.id).all();

  return c.json({
    data: {
      tq: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-tq ────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    tq_title?: string;
    project_id?: string;
    project_name?: string;
    tq_number?: string;
    discipline?: string;
    query_urgency?: QueryUrgency;
    query_description?: string;
    drawing_ref?: string;
    specification_ref?: string;
    proposed_solution?: string;
    contractor_ref?: string;
    floor_structural_safety?: number;
    floor_ie_notification_required?: number;
    floor_lender_notification?: number;
    floor_nersa_impact?: number;
    floor_specification_deviation?: number;
    rfi_ref?: string;
    ncr_ref?: string;
    ms_ref?: string;
    submittal_ref?: string;
    [k: string]: unknown;
  };

  if (!body.tq_title || !body.project_id || !body.query_description || !body.discipline || !body.query_urgency) {
    return c.json(
      { error: 'tq_title, project_id, query_description, discipline, and query_urgency are required' },
      400,
    );
  }

  const urgency = body.query_urgency as QueryUrgency;
  const now = new Date();
  const slaHrs = SLA_HOURS[urgency];
  const slaDeadline = new Date(now.getTime() + slaHrs * 3600 * 1000);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_tqs',
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `tq-${String(cnt + 1).padStart(3, '0')}`;
  const tqNumber = body.tq_number || `TQ-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_tqs (
      id, project_id, project_name, tq_number, chain_status,
      tq_title, discipline, query_urgency, contractor_ref,
      query_description, drawing_ref, specification_ref, proposed_solution,
      floor_structural_safety, floor_ie_notification_required,
      floor_lender_notification, floor_nersa_impact, floor_specification_deviation,
      rfi_ref, ncr_ref, ms_ref, submittal_ref,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      raised_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'raised',
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, tqNumber,
    body.tq_title, body.discipline, urgency, body.contractor_ref ?? null,
    body.query_description, body.drawing_ref ?? null, body.specification_ref ?? null, body.proposed_solution ?? null,
    Number(body.floor_structural_safety ?? 0),
    Number(body.floor_ie_notification_required ?? 0),
    Number(body.floor_lender_notification ?? 0),
    Number(body.floor_nersa_impact ?? 0),
    Number(body.floor_specification_deviation ?? 0),
    body.rfi_ref ?? null, body.ncr_ref ?? null, body.ms_ref ?? null, body.submittal_ref ?? null,
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_tqs WHERE id = ?',
  ).bind(id).first<TqRow>();

  await fireCascade({
    event: 'ipp_tq.log_tq' as any,
    actor_id: user.id,
    entity_type: 'ipp_tq',
    entity_id: id,
    data: {
      action: 'create',
      tq_title: body.tq_title,
      discipline: body.discipline,
      query_urgency: urgency,
      project_id: body.project_id,
      floor_structural_safety: Number(body.floor_structural_safety ?? 0),
      floor_ie_notification_required: Number(body.floor_ie_notification_required ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-tq/:id/:action ────────────────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    assigned_designer?: string;
    design_company?: string;
    response_description?: string;
    response_type?: string;
    design_change_ref?: string;
    rejection_reason?: string;
    escalation_reason?: string;
    escalation_notes?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_tqs WHERE id = ?',
  ).bind(id).first<TqRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `TQ is in terminal state: ${row.chain_status}` }, 409);
  }

  const tqAction = action as TqAction;
  const toStatus = nextStatus(row.chain_status, tqAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(tqAction, {
    floor_structural_safety: row.floor_structural_safety,
    floor_ie_notification_required: row.floor_ie_notification_required,
    floor_nersa_impact: row.floor_nersa_impact,
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
      const ref = `W142-TQ-${(row.query_urgency ?? 'standard').toUpperCase()}-${now.getFullYear()}-${id.replace('tq-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates based on action
  if (body.assigned_designer)    { updates.push('assigned_designer = ?');    vals.push(body.assigned_designer); }
  if (body.design_company)       { updates.push('design_company = ?');        vals.push(body.design_company); }
  if (tqAction === 'allocate_to_designer') {
    updates.push('assigned_at = ?');
    vals.push(now.toISOString());
  }
  if (body.response_description) { updates.push('response_description = ?'); vals.push(body.response_description); }
  if (body.response_type)        { updates.push('response_type = ?');         vals.push(body.response_type); }
  if (body.design_change_ref)    { updates.push('design_change_ref = ?');     vals.push(body.design_change_ref); }
  if (body.rejection_reason)     { updates.push('rejection_reason = ?');      vals.push(body.rejection_reason); }
  if (body.escalation_reason)    { updates.push('escalation_reason = ?');     vals.push(body.escalation_reason); }
  if (body.escalation_notes)     { updates.push('escalation_notes = ?');      vals.push(body.escalation_notes); }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_tqs SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...vals).run();

  // Write event row
  const eventId = `tqevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(tqAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_tq_events
      (id, tq_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, tqAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.rejection_reason ?? body.escalation_reason ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_tq',
    entity_id: id,
    data: {
      action: tqAction,
      from_status: row.chain_status,
      to_status: toStatus,
      query_urgency: row.query_urgency,
      discipline: row.discipline,
      floor_structural_safety: row.floor_structural_safety,
      floor_ie_notification_required: row.floor_ie_notification_required,
      floor_nersa_impact: row.floor_nersa_impact,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_tqs WHERE id = ?',
  ).bind(id).first<TqRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ──────────────────────────────
export async function ippTqSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_tqs
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('closed', 'rejected')
  `).all<TqRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const urgency = (row.query_urgency ?? 'standard') as QueryUrgency;
      const reg = slaBreachCrossesIntoRegulator(urgency, {
        floor_structural_safety: !!row.floor_structural_safety,
        floor_ie_notification_required: !!row.floor_ie_notification_required,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_tqs
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_tq.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_tq',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          query_urgency: row.query_urgency,
          discipline: row.discipline,
          floor_structural_safety: row.floor_structural_safety,
          floor_ie_notification_required: row.floor_ie_notification_required,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
