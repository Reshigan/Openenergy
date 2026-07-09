// Wave 134 - IPP Stakeholder Register & Engagement Tracking
// PMBOK 7 Section 13 + ISO 21500:2021 + REIPPPP S4 + IFC PS1 + EP4.
// URGENT SLA polarity: strategic_ally 24h TIGHTEST (daily contact required).
// SIGNATURE: escalate_engagement EVERY tier; flag_resistant crosses when power_score >= 4.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  slaHoursFor,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  eventTypeFor,
  statusTsCol,
  timeInStateHours,
  urgencyBand,
  deriveTierFromScore,
  type StakeholderStatus,
  type StakeholderAction,
  type StakeholderTier,
  type StakeholderCrossArgs,
} from '../utils/ipp-stakeholder-spec';
import { badEnum } from '../utils/validation';

// Migration 358 CHECK(stakeholder_type IN (...)) — reject before D1 500s.
const STAKEHOLDER_TYPES = ['community_leader', 'municipality', 'traditional_authority', 'regulator', 'funder', 'offtaker', 'contractor', 'consultant', 'ngo', 'government_dept', 'media', 'internal'];

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface StakeholderRow {
  id: string;
  project_id: string;
  project_name: string | null;
  stakeholder_name: string;
  organization: string | null;
  stakeholder_type: string;
  chain_status: StakeholderStatus;
  power_score: number | null;
  interest_score: number | null;
  urgency_score: number | null;
  engagement_score: number | null;
  stakeholder_tier: StakeholderTier | null;
  current_engagement_level: string | null;
  desired_engagement_level: string | null;
  communication_frequency: string | null;
  communication_channel: string | null;
  communication_plan: string | null;
  last_engagement_at: string | null;
  next_engagement_due_at: string | null;
  engagement_notes: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  floor_ep4_required: number;
  floor_board_notify: number;
  floor_legal_risk: number;
  floor_nersa_required: number;
  floor_lender_required: number;
  is_reportable: number;
  regulator_relevant: number;
  regulator_ref: string | null;
  stage_gate_ref: string | null;
  issue_ref: string | null;
  risk_ref: string | null;
  ed_commitment_ref: string | null;
  hse_incident_ref: string | null;
  identified_at: string | null;
  analyzed_at: string | null;
  classified_at: string | null;
  engagement_planned_at: string | null;
  active_engagement_at: string | null;
  responsive_at: string | null;
  supportive_at: string | null;
  champion_at: string | null;
  resistant_at: string | null;
  disengaged_at: string | null;
  escalated_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function decorateLiveFields(row: StakeholderRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const tier = row.stakeholder_tier ?? 'monitor';
  return {
    ...row,
    time_in_state_hours_live: timeInStateHours(stateAt, now),
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    urgency_band_live: urgencyBand(tier as StakeholderTier),
    is_high_power_resistant_live: !!(row.chain_status === 'resistant' && (row.power_score ?? 0) >= 4),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-stakeholder ─────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_stakeholders ORDER BY engagement_score DESC, created_at DESC'
  ).all<StakeholderRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const active = data.filter(r => !isHardTerminal(r.chain_status));
  const dashboard = {
    stakeholders: {
      total_count:        data.length,
      active_count:       active.length,
      champion_count:     data.filter(r => r.chain_status === 'champion').length,
      resistant_count:    data.filter(r => r.chain_status === 'resistant').length,
      sla_breached_count: data.filter(r => r.sla_breached).length,
      high_power_resistant: data.filter(r =>
        r.chain_status === 'resistant' && (r.power_score ?? 0) >= 4
      ).length,
      key_player_count: data.filter(r =>
        r.stakeholder_tier === 'strategic_ally' || r.stakeholder_tier === 'key_player'
      ).length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-stakeholder/:id ─────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_stakeholders WHERE id = ?'
  ).bind(c.req.param('id')).first<StakeholderRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_stakeholder_events WHERE stakeholder_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({
    data: {
      stakeholder: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-stakeholder ────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    stakeholder_name?: string;
    organization?: string;
    stakeholder_type?: string;
    power_score?: number;
    interest_score?: number;
    urgency_score?: number;
    current_engagement_level?: string;
    desired_engagement_level?: string;
    communication_frequency?: string;
    communication_channel?: string;
    communication_plan?: string;
    contact_person?: string;
    contact_email?: string;
    contact_phone?: string;
    floor_ep4_required?: number;
    floor_board_notify?: number;
    floor_legal_risk?: number;
    floor_nersa_required?: number;
    floor_lender_required?: number;
    stage_gate_ref?: string;
    issue_ref?: string;
    risk_ref?: string;
    ed_commitment_ref?: string;
    hse_incident_ref?: string;
    engagement_notes?: string;
    [k: string]: unknown;
  };

  if (!body.project_id || !body.stakeholder_name || !body.stakeholder_type) {
    return c.json({ error: 'project_id, stakeholder_name, and stakeholder_type required' }, 400);
  }

  const typeErr = badEnum('stakeholder_type', body.stakeholder_type, STAKEHOLDER_TYPES);
  if (typeErr) return c.json({ error: typeErr }, 400);

  const powerScore = body.power_score ?? 3;
  const interestScore = body.interest_score ?? 3;
  const urgencyScore = body.urgency_score ?? 3;
  const engagementScore = powerScore * interestScore * urgencyScore;
  const tier = deriveTierFromScore(engagementScore, powerScore, interestScore);

  const now = new Date();
  const slaHrs = slaHoursFor(tier);
  const slaDeadline = slaDeadlineFor(tier, now);

  // Derive ID from count
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_stakeholders'
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `sth-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_stakeholders (
      id, project_id, project_name, stakeholder_name, organization, stakeholder_type,
      chain_status, power_score, interest_score, urgency_score, engagement_score,
      stakeholder_tier, current_engagement_level, desired_engagement_level,
      communication_frequency, communication_channel, communication_plan,
      last_engagement_at, next_engagement_due_at, engagement_notes,
      contact_person, contact_email, contact_phone,
      sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count,
      floor_ep4_required, floor_board_notify, floor_legal_risk,
      floor_nersa_required, floor_lender_required,
      is_reportable, regulator_relevant,
      stage_gate_ref, issue_ref, risk_ref, ed_commitment_ref, hse_incident_ref,
      identified_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      'identified', ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, 0, 0,
      ?, ?, ?,
      ?, ?,
      0, 0,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.stakeholder_name, body.organization ?? null, body.stakeholder_type,
    powerScore, interestScore, urgencyScore, engagementScore,
    tier,
    body.current_engagement_level ?? 'neutral', body.desired_engagement_level ?? 'supportive',
    body.communication_frequency ?? 'monthly', body.communication_channel ?? 'meeting', body.communication_plan ?? null,
    null, slaDeadline.toISOString(), body.engagement_notes ?? null,
    body.contact_person ?? null, body.contact_email ?? null, body.contact_phone ?? null,
    slaHrs, slaDeadline.toISOString(),
    Number(body.floor_ep4_required ?? 0), Number(body.floor_board_notify ?? 0), Number(body.floor_legal_risk ?? 0),
    Number(body.floor_nersa_required ?? 0), Number(body.floor_lender_required ?? 0),
    body.stage_gate_ref ?? null, body.issue_ref ?? null, body.risk_ref ?? null, body.ed_commitment_ref ?? null, body.hse_incident_ref ?? null,
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_stakeholders WHERE id = ?'
  ).bind(id).first<StakeholderRow>();

  await fireCascade({
    event: 'ipp_stakeholder.analyze_stakeholder',
    actor_id: user.id,
    entity_type: 'ipp_stakeholder',
    entity_id: id,
    data: { action: 'create', stakeholder_type: body.stakeholder_type, tier, engagement_score: engagementScore },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-stakeholder/:id/:action ────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    reason_code?: string;
    engagement_notes?: string;
    last_engagement_at?: string;
    communication_plan?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_stakeholders WHERE id = ?'
  ).bind(id).first<StakeholderRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (user.role !== 'admin' && row.created_by !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Stakeholder is in terminal state: ${row.chain_status}` }, 409);
  }

  const stkAction = action as StakeholderAction;

  // flag_overdue is cron-only — handle separately
  if (stkAction === 'flag_overdue') {
    const now = new Date();
    await c.env.DB.prepare(`
      UPDATE oe_ipp_stakeholders
      SET sla_breached = 1, sla_breach_count = sla_breach_count + 1,
          last_sla_breach_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now.toISOString(), now.toISOString(), id).run();

    const eventId = `sevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await c.env.DB.prepare(`
      INSERT INTO oe_ipp_stakeholder_events
        (id, stakeholder_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(
      eventId, id, 'flag_overdue',
      row.chain_status, row.chain_status,
      user.id, user.role, 'SLA sweep — overdue flagged',
      now.toISOString(),
    ).run();

    return c.json({ data: { swept: true, stakeholder_id: id } });
  }

  const toStatus = nextStatus(row.chain_status, stkAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();
  const crossArgs: StakeholderCrossArgs = {
    power_score: row.power_score,
    chain_status: row.chain_status,
    floor_nersa_required: row.floor_nersa_required,
  };

  const regulatorCrossed = crossesIntoRegulator(stkAction, crossArgs);
  const isRep = isReportable(stkAction, crossArgs);

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  // Record state timestamp
  if (toStatus !== row.chain_status) {
    const tsCol = statusTsCol(toStatus);
    updates.push(`${tsCol} = ?`);
    vals.push(now.toISOString());
  }

  if (regulatorCrossed || isRep) {
    updates.push('is_reportable = 1', 'regulator_relevant = 1', 'regulator_crossed_at = ?');
    vals.push(now.toISOString());
    if (!row.regulator_ref) {
      const ref = `W134-STH-${row.stakeholder_type.toUpperCase()}-${now.getFullYear()}-${id.replace('sth-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  if (body.engagement_notes) { updates.push('engagement_notes = ?'); vals.push(body.engagement_notes); }
  if (body.last_engagement_at) { updates.push('last_engagement_at = ?'); vals.push(body.last_engagement_at); }
  if (body.communication_plan) { updates.push('communication_plan = ?'); vals.push(body.communication_plan); }

  // Track last engagement on active transitions
  if (stkAction === 'record_response' || stkAction === 'confirm_supportive' ||
      stkAction === 'elevate_to_champion' || stkAction === 're_engage') {
    updates.push('last_engagement_at = ?');
    vals.push(now.toISOString());
  }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_stakeholders SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `sevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(stkAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_stakeholder_events
      (id, stakeholder_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, stkAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.reason_code ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType,
    actor_id: user.id,
    entity_type: 'ipp_stakeholder',
    entity_id: id,
    data: {
      action: stkAction,
      from_status: row.chain_status,
      to_status: toStatus,
      stakeholder_tier: row.stakeholder_tier,
      stakeholder_type: row.stakeholder_type,
      power_score: row.power_score,
      regulator_crossed: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_stakeholders WHERE id = ?'
  ).bind(id).first<StakeholderRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────
export async function ippStakeholderSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_stakeholders
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('archived','champion')
  `).all<StakeholderRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const crossArgs: StakeholderCrossArgs = {
        power_score: row.power_score,
        floor_nersa_required: row.floor_nersa_required,
      };
      const tier = (row.stakeholder_tier ?? 'monitor') as StakeholderTier;
      const reg = slaBreachCrossesIntoRegulator(tier, crossArgs);
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_stakeholders
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            last_sla_breach_at = ?,
            ${reg ? 'regulator_relevant = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_stakeholder.sla_breached',
        actor_id: 'cron',
        entity_type: 'ipp_stakeholder',
        entity_id: row.id,
        data: {
          stakeholder_tier: row.stakeholder_tier,
          stakeholder_type: row.stakeholder_type,
          power_score: row.power_score,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }
  return { swept, crossed };
}
