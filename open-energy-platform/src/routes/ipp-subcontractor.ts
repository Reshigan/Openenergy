// Wave 140 — IPP Subcontractor Management
// OHSA Construction Regs 2014 Reg.6 + ISO 45001:2018 + REIPPPP ED + Equator Principles EP4.
// URGENT SLA: critical_trade 24h (tightest) → labor_only 168h (loosest).
// SIGNATURE: terminate_subcontractor EVERY tier on safety_violation;
//            suspend_subcontractor when floor_ohsa_notification;
//            close_subcontract when floor_lender_escrow_release.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { badDate, badEnum } from '../utils/validation';
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
  type SubcontractorStatus,
  type SubcontractorAction,
  type SubcontractorTier,
} from '../utils/ipp-subcontractor-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface SubcontractorRow {
  id: string;
  project_id: string;
  project_name: string | null;
  company_name: string;
  chain_status: SubcontractorStatus;
  trade_category: string | null;
  subcontractor_tier: SubcontractorTier | null;
  contract_ref: string | null;
  contract_value_zar: number | null;
  scope_description: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  bee_level: number | null;
  local_content_pct: number | null;
  sa_employee_count: number | null;
  insurance_expiry_date: string | null;
  cidb_grade: string | null;
  registration_number: string | null;
  performance_score: number | null;
  hse_incident_count: number;
  ncr_count: number;
  review_notes: string | null;
  termination_cause: string | null;
  suspension_reason: string | null;
  reinstatement_conditions: string | null;
  site_representative: string | null;
  site_representative_phone: string | null;
  safety_officer: string | null;
  safety_officer_phone: string | null;
  floor_ohsa_notification: number;
  floor_lender_escrow_release: number;
  floor_reipppp_ed_reporting: number;
  floor_bee_verification: number;
  floor_ie_oversight: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ed_commitment_ref: string | null;
  hse_incident_ref: string | null;
  ncr_ref: string | null;
  ms_ref: string | null;
  registered_at: string | null;
  pre_qualification_at: string | null;
  inducted_at: string | null;
  mobilized_at: string | null;
  performing_at: string | null;
  under_review_at: string | null;
  good_standing_at: string | null;
  work_complete_at: string | null;
  demobilized_at: string | null;
  closed_at: string | null;
  suspended_at: string | null;
  terminated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES = new Set([
  'registered', 'pre_qualification', 'inducted', 'mobilized',
  'performing', 'under_review', 'good_standing', 'work_complete', 'demobilized',
]);

function decorateLiveFields(row: SubcontractorRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isActive = ACTIVE_STATUSES.has(row.chain_status);
  const isSuspended = row.chain_status === 'suspended';
  const isTerminated = row.chain_status === 'terminated';
  const isSignature = !!(
    (isTerminated && row.termination_cause === 'safety_violation') ||
    (isSuspended && row.floor_ohsa_notification)
  );
  // Insurance near-expiry: flag if within 60 days or already expired
  const insuranceExpiry = row.insurance_expiry_date ? new Date(row.insurance_expiry_date) : null;
  const insuranceNearExpiry = insuranceExpiry
    ? insuranceExpiry.getTime() - now.getTime() < 60 * 24 * 3600 * 1000
    : false;

  return {
    ...row,
    time_in_state_hours_live: timeInState,
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    is_active_live: isActive,
    is_suspended_live: isSuspended,
    is_terminated_live: isTerminated,
    is_signature_live: isSignature,
    insurance_near_expiry_live: insuranceNearExpiry,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-subcontractor ───────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  // Static literal status fragment — never derived from request input.
  const ACTIVE_SQL =
    "chain_status IN ('registered','pre_qualification','inducted','mobilized','performing','under_review','good_standing','work_complete','demobilized')";

  // Dashboard aggregates computed in SQL over the full table (not the paged rows below).
  const agg = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total_count,
       SUM(CASE WHEN ${ACTIVE_SQL} THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN chain_status = 'suspended' THEN 1 ELSE 0 END) AS suspended_count,
       SUM(CASE WHEN chain_status = 'terminated' THEN 1 ELSE 0 END) AS terminated_count,
       SUM(CASE WHEN ${ACTIVE_SQL} AND subcontractor_tier = 'critical_trade' THEN 1 ELSE 0 END) AS critical_trade_count,
       SUM(CASE WHEN COALESCE(sla_breached,0) <> 0 THEN 1 ELSE 0 END) AS sla_breached_count,
       SUM(CASE WHEN (COALESCE(floor_ohsa_notification,0) <> 0 AND ${ACTIVE_SQL}) OR chain_status = 'suspended' THEN 1 ELSE 0 END) AS ohsa_notification_count,
       SUM(CASE WHEN chain_status IN ('performing','under_review','good_standing') THEN COALESCE(performance_score,0) ELSE 0 END) AS perf_sum,
       SUM(CASE WHEN chain_status IN ('performing','under_review','good_standing') THEN 1 ELSE 0 END) AS perf_count
     FROM oe_ipp_subcontractors`,
  ).first<{
    total_count: number; active_count: number; suspended_count: number; terminated_count: number;
    critical_trade_count: number; sla_breached_count: number; ohsa_notification_count: number;
    perf_sum: number; perf_count: number;
  }>();

  const perfCount = agg?.perf_count ?? 0;
  const avgScore = perfCount > 0 ? (agg!.perf_sum ?? 0) / perfCount : null;

  // Bounded row set for the listing (dashboard counts above stay whole-table accurate).
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '200', 10) || 200, 1), 500);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_subcontractors ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(limit, offset).all<SubcontractorRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const dashboard = {
    subcontractors: {
      total_count:            agg?.total_count ?? 0,
      active_count:           agg?.active_count ?? 0,
      suspended_count:        agg?.suspended_count ?? 0,
      terminated_count:       agg?.terminated_count ?? 0,
      critical_trade_count:   agg?.critical_trade_count ?? 0,
      sla_breached_count:     agg?.sla_breached_count ?? 0,
      ohsa_notification_count: agg?.ohsa_notification_count ?? 0,
      avg_performance_score:  avgScore !== null ? Math.round(avgScore * 10) / 10 : null,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-subcontractor/:id ──────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_subcontractors WHERE id = ?',
  ).bind(c.req.param('id')).first<SubcontractorRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_subcontractor_events WHERE subcontractor_id = ? ORDER BY created_at ASC',
  ).bind(row.id).all();

  return c.json({
    data: {
      subcontractor: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-subcontractor ──────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    company_name?: string;
    project_id?: string;
    project_name?: string;
    trade_category?: string;
    subcontractor_tier?: SubcontractorTier;
    scope_description?: string;
    contract_ref?: string;
    contract_value_zar?: number;
    scheduled_start_date?: string;
    scheduled_end_date?: string;
    bee_level?: number;
    local_content_pct?: number;
    sa_employee_count?: number;
    insurance_expiry_date?: string;
    cidb_grade?: string;
    registration_number?: string;
    site_representative?: string;
    site_representative_phone?: string;
    safety_officer?: string;
    safety_officer_phone?: string;
    floor_ohsa_notification?: number;
    floor_lender_escrow_release?: number;
    floor_reipppp_ed_reporting?: number;
    floor_bee_verification?: number;
    floor_ie_oversight?: number;
    ed_commitment_ref?: string;
    ms_ref?: string;
    [k: string]: unknown;
  };

  if (!body.company_name || !body.project_id || !body.trade_category || !body.subcontractor_tier || !body.scope_description) {
    return c.json(
      { error: 'company_name, project_id, trade_category, subcontractor_tier, and scope_description are required' },
      400,
    );
  }

  const enumErr = badEnum('subcontractor_tier', body.subcontractor_tier, ['critical_trade', 'specialist', 'general_trade', 'labor_only']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const dateErr =
    badDate('scheduled_start_date', body.scheduled_start_date) ??
    badDate('scheduled_end_date', body.scheduled_end_date) ??
    badDate('insurance_expiry_date', body.insurance_expiry_date);
  if (dateErr) return c.json({ error: dateErr }, 400);

  const tier = body.subcontractor_tier as SubcontractorTier;
  const now = new Date();
  const slaHrs = SLA_HOURS[tier];
  const slaDeadline = slaDeadlineFor(tier, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_subcontractors',
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `sub-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_subcontractors (
      id, project_id, project_name, company_name, chain_status,
      trade_category, subcontractor_tier, scope_description,
      contract_ref, contract_value_zar,
      scheduled_start_date, scheduled_end_date,
      bee_level, local_content_pct, sa_employee_count,
      insurance_expiry_date, cidb_grade, registration_number,
      site_representative, site_representative_phone,
      safety_officer, safety_officer_phone,
      floor_ohsa_notification, floor_lender_escrow_release, floor_reipppp_ed_reporting,
      floor_bee_verification, floor_ie_oversight,
      ed_commitment_ref, ms_ref,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      registered_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'registered',
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.company_name,
    body.trade_category, tier, body.scope_description,
    body.contract_ref ?? null, body.contract_value_zar ?? null,
    body.scheduled_start_date ?? null, body.scheduled_end_date ?? null,
    body.bee_level ?? null, body.local_content_pct ?? null, body.sa_employee_count ?? null,
    body.insurance_expiry_date ?? null, body.cidb_grade ?? null, body.registration_number ?? null,
    body.site_representative ?? null, body.site_representative_phone ?? null,
    body.safety_officer ?? null, body.safety_officer_phone ?? null,
    Number(body.floor_ohsa_notification ?? 0), Number(body.floor_lender_escrow_release ?? 0),
    Number(body.floor_reipppp_ed_reporting ?? 0), Number(body.floor_bee_verification ?? 0),
    Number(body.floor_ie_oversight ?? 0),
    body.ed_commitment_ref ?? null, body.ms_ref ?? null,
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_subcontractors WHERE id = ?',
  ).bind(id).first<SubcontractorRow>();

  await fireCascade({
    event: 'ipp_subcontractor.start_prequalification' as any,
    actor_id: user.id,
    entity_type: 'ipp_subcontractor',
    entity_id: id,
    data: {
      action: 'create',
      company_name: body.company_name,
      trade_category: body.trade_category,
      subcontractor_tier: tier,
      project_id: body.project_id,
      floor_ohsa_notification: Number(body.floor_ohsa_notification ?? 0),
      floor_ie_oversight: Number(body.floor_ie_oversight ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-subcontractor/:id/:action ──────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    termination_cause?: string;
    suspension_reason?: string;
    reinstatement_conditions?: string;
    performance_score?: number;
    review_notes?: string;
    hse_incident_ref?: string;
    ncr_ref?: string;
    actual_start_date?: string;
    actual_end_date?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_subcontractors WHERE id = ?',
  ).bind(id).first<SubcontractorRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && user.role !== 'support' && row.created_by !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Subcontractor is in terminal state: ${row.chain_status}` }, 409);
  }

  const subAction = action as SubcontractorAction;
  const toStatus = nextStatus(row.chain_status, subAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const terminationCause = body.termination_cause ?? row.termination_cause ?? undefined;
  const regulatorCrossed = crossesIntoRegulator(subAction, {
    termination_cause: terminationCause,
    floor_ohsa_notification: row.floor_ohsa_notification,
    floor_lender_escrow_release: row.floor_lender_escrow_release,
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
      const tierPart = (row.subcontractor_tier ?? 'general').toUpperCase();
      const ref = `W140-SUB-${tierPart}-${now.getFullYear()}-${id.replace('sub-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates based on action
  if (body.termination_cause)       { updates.push('termination_cause = ?');       vals.push(body.termination_cause); }
  if (body.suspension_reason)        { updates.push('suspension_reason = ?');        vals.push(body.suspension_reason); }
  if (body.reinstatement_conditions) { updates.push('reinstatement_conditions = ?'); vals.push(body.reinstatement_conditions); }
  if (body.performance_score != null) { updates.push('performance_score = ?');       vals.push(body.performance_score); }
  if (body.review_notes)             { updates.push('review_notes = ?');             vals.push(body.review_notes); }
  if (body.hse_incident_ref)         { updates.push('hse_incident_ref = ?');         vals.push(body.hse_incident_ref); }
  if (body.ncr_ref)                  { updates.push('ncr_ref = ?');                  vals.push(body.ncr_ref); }
  if (body.actual_start_date)        { updates.push('actual_start_date = ?');         vals.push(body.actual_start_date); }
  if (body.actual_end_date)          { updates.push('actual_end_date = ?');           vals.push(body.actual_end_date); }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_subcontractors SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...vals).run();

  // Write event row
  const eventId = `subevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(subAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_subcontractor_events
      (id, subcontractor_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, subAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.suspension_reason ?? body.review_notes ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_subcontractor',
    entity_id: id,
    data: {
      action: subAction,
      from_status: row.chain_status,
      to_status: toStatus,
      subcontractor_tier: row.subcontractor_tier,
      trade_category: row.trade_category,
      termination_cause: terminationCause,
      floor_ohsa_notification: row.floor_ohsa_notification,
      floor_lender_escrow_release: row.floor_lender_escrow_release,
      floor_ie_oversight: row.floor_ie_oversight,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_subcontractors WHERE id = ?',
  ).bind(id).first<SubcontractorRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ──────────────────────────────
export async function ippSubcontractorSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_subcontractors
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('closed', 'terminated')
  `).all<SubcontractorRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const tier = (row.subcontractor_tier ?? 'general_trade') as SubcontractorTier;
      const reg = slaBreachCrossesIntoRegulator(tier, {
        floor_ohsa_notification: !!row.floor_ohsa_notification,
        floor_ie_oversight: !!row.floor_ie_oversight,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_subcontractors
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_subcontractor.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_subcontractor',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          subcontractor_tier: row.subcontractor_tier,
          trade_category: row.trade_category,
          floor_ohsa_notification: row.floor_ohsa_notification,
          floor_ie_oversight: row.floor_ie_oversight,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
