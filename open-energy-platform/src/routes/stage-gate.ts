// ═══════════════════════════════════════════════════════════════════════════
// Wave 131 - Project Stage Gates (DG0-DG4) governance chain.
//
// PHASE E WAVE 1 OF N - First IPP-PM profile-completeness wave.
// 12-state P6 on oe_stage_gates; 5 gates per project (DG0-DG4).
//
// 17 actions: propose_gate / compile_evidence / ie_review / lender_review
//   / circulate_board_briefing / hold_cab / set_conditions / record_decision
//   / satisfy_conditions / pass_gate / notify_downstream / archive /
//   defer_gate / withdraw_gate / reject_gate / conditional_pass /
//   sla_breach (cron-only).
//
// SIGNATURE W131: reject_gate crosses regulator EVERY tier.
// Write {admin, ipp_developer}. READ all 9 personas.
// AUDIT_PREFIX_MAP: stage_gate -> 'ipp' (JOINS existing IPP-PM family).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  slaDeadlineFor,
  slaWindowHours,
  tierForScope,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  conditionsAgingDays,
  timeInStateHours,
  GATE_NAMES,
  type SgStatus,
  type SgAction,
  type SgTier,
  type SgFloorFlags,
} from '../utils/stage-gate-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W131 = admin + ipp_developer write (gate sponsor party — IPP runs the gate).
const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

// ─── Row + event interfaces ────────────────────────────────────────────────
interface SgRow {
  id: string;
  gate_index: number;
  project_id: string;
  title: string | null;
  capex_zar: number | null;
  capex_band: string | null;
  equator_category: string | null;
  debt_sized: number;
  current_tier: SgTier;
  floor_equator_cat_a: number;
  floor_fid_committed: number;
  floor_nersa_notifiable: number;
  floor_debt_sized: number;
  floor_shareholder_consent_required: number;
  w19_procurement_ref: string | null;
  w20_cod_ref: string | null;
  w21_drawdown_ref: string | null;
  w113_evm_ref: string | null;
  w118_block_ref: string | null;
  decision: string | null;
  conditions_payload: string | null;
  evidence_payload: string | null;
  ie_letter_r2_key: string | null;
  cab_minutes_r2_key: string | null;
  board_minutes_r2_key: string | null;
  cost_confidence_aace_class_live: string | null;
  schedule_confidence_p50_live: number | null;
  irr_post_tax_live: number | null;
  debt_sizing_zar_live: number | null;
  e_s_risk_score_live: number | null;
  ie_letter_attached_bool_live: number;
  cab_minutes_attached_bool_live: number;
  board_minutes_attached_bool_live: number;
  cumulative_capex_committed_zar_live: number | null;
  bridges_to_w19_live: number;
  bridges_to_w20_live: number;
  bridges_to_w21_live: number;
  bridges_to_w113_live: number;
  bridges_to_w118_live: number;
  reason_code: string | null;
  authority_required: string | null;
  urgency_band: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  regulator_crossed_at: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  chain_status: SgStatus;
  gate_proposed_at: string | null;
  evidence_compiled_at: string | null;
  ie_reviewed_at: string | null;
  lender_reviewed_at: string | null;
  board_briefing_circulated_at: string | null;
  cab_held_at: string | null;
  conditions_set_at: string | null;
  decision_recorded_at: string | null;
  conditions_satisfied_at: string | null;
  gate_passed_at: string | null;
  notified_downstream_at: string | null;
  archived_at: string | null;
  gate_deferred_at: string | null;
  gate_withdrawn_at: string | null;
  gate_rejected_at: string | null;
  gate_conditional_pass_at: string | null;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Get the status timestamp column for the current status.
function statusTsCol(status: SgStatus): string {
  const map: Record<SgStatus, string> = {
    gate_proposed:               'gate_proposed_at',
    evidence_compiled:           'evidence_compiled_at',
    ie_reviewed:                 'ie_reviewed_at',
    lender_reviewed:             'lender_reviewed_at',
    board_briefing_circulated:   'board_briefing_circulated_at',
    cab_held:                    'cab_held_at',
    conditions_set:              'conditions_set_at',
    decision_recorded:           'decision_recorded_at',
    conditions_satisfied:        'conditions_satisfied_at',
    gate_passed:                 'gate_passed_at',
    notified_downstream:         'notified_downstream_at',
    archived:                    'archived_at',
    gate_deferred:               'gate_deferred_at',
    gate_withdrawn:              'gate_withdrawn_at',
    gate_rejected:               'gate_rejected_at',
    gate_conditional_pass:       'gate_conditional_pass_at',
  };
  return map[status];
}

// Decorate LIVE fields that are computed at fetch, not persisted.
function decorateLiveFields(row: SgRow, now: Date): SgRow & {
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  conditions_aging_days_live: number | null;
  equator_category_live: string;
  gate_name: string;
} {
  const statusTs = statusTsCol(row.chain_status);
  const enteredAt = statusTs ? (row as any)[statusTs] : null;
  const timeInState = enteredAt ? timeInStateHours(enteredAt, now) : null;
  const slaRemaining = enteredAt
    ? slaHoursRemaining(row.chain_status, row.current_tier, new Date(enteredAt), now)
    : null;
  const condAging = conditionsAgingDays(row.conditions_set_at, now);
  const equatorCatLive =
    row.floor_equator_cat_a ? 'cat_a' : (row.equator_category ?? 'cat_c');

  return {
    ...row,
    time_in_state_hours_live: timeInState,
    sla_remaining_hours_live: slaRemaining,
    conditions_aging_days_live: condAging,
    equator_category_live: equatorCatLive,
    gate_name: GATE_NAMES[row.gate_index] ?? `DG${row.gate_index}`,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────
const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ── GET /api/stage-gate — list all gates with LIVE decoration
app.get('/', async (c: Context<HonoEnv>) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { project_id, gate_index, chain_status, tier } = c.req.query() as Record<string, string>;

  let sql = 'SELECT * FROM oe_stage_gates WHERE 1=1';
  const params: string[] = [];
  if (project_id) { sql += ' AND project_id = ?'; params.push(project_id); }
  if (gate_index !== undefined) { sql += ' AND gate_index = ?'; params.push(gate_index); }
  if (chain_status) { sql += ' AND chain_status = ?'; params.push(chain_status); }
  if (tier) { sql += ' AND current_tier = ?'; params.push(tier); }
  sql += ' ORDER BY project_id, gate_index';

  const rows = await c.env.DB.prepare(sql).bind(...params).all<SgRow>();
  const now = new Date();
  const decorated = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  // Aggregate counts for the dashboard
  const activeGates = decorated.filter(r =>
    !isHardTerminal(r.chain_status) && r.chain_status !== 'gate_withdrawn'
  ).length;
  const breachedGates = decorated.filter(r => r.sla_breached).length;
  const rejectedGates = decorated.filter(r => r.chain_status === 'gate_rejected').length;

  return c.json({
    data: decorated,
    dashboard: {
      stage_gates: {
        active_gates_count: activeGates,
        sla_breached_count: breachedGates,
        rejected_count: rejectedGates,
        total_count: decorated.length,
      },
    },
  });
});

// ── GET /api/stage-gate/:id — single gate with LIVE decoration
app.get('/:id', async (c: Context<HonoEnv>) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM oe_stage_gates WHERE id = ?').bind(id).first<SgRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: decorateLiveFields(row, new Date()) });
});

// ── POST /api/stage-gate — create new gate (propose_gate)
app.post('/', async (c: Context<HonoEnv>) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    id?: string;
    gate_index: number;
    project_id: string;
    title?: string;
    capex_zar?: number;
    capex_band?: string;
    equator_category?: string;
    debt_sized?: boolean;
    w19_procurement_ref?: string;
    w20_cod_ref?: string;
    w21_drawdown_ref?: string;
    w113_evm_ref?: string;
    reason_code?: string;
    [k: string]: unknown;
  }>();

  if (body.gate_index === undefined || !body.project_id) {
    return c.json({ error: 'gate_index and project_id required' }, 400);
  }
  if (![0,1,2,3,4].includes(Number(body.gate_index))) {
    return c.json({ error: 'gate_index must be 0-4' }, 400);
  }

  const flags: SgFloorFlags = {
    floor_equator_cat_a: body.equator_category === 'cat_a' ? 1 : 0,
    floor_fid_committed: body.gate_index >= 3 ? 1 : 0,
    floor_nersa_notifiable: (body.gate_index === 0 || body.gate_index === 4) ? 1 : 0,
    floor_debt_sized: body.debt_sized || body.gate_index >= 3 ? 1 : 0,
    floor_shareholder_consent_required: 0,
  };

  const rawTier = tierForScope({
    capex_zar: body.capex_zar,
    equator_category: body.equator_category,
    debt_sized: body.debt_sized,
  });
  const tier = effectiveTier(rawTier, flags);
  const now = new Date();
  const slaHrs = slaWindowHours('gate_proposed', tier);
  const slaDeadline = slaDeadlineFor('gate_proposed', tier, now);
  const id = body.id ?? `sg-${Date.now().toString(36)}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_stage_gates (
      id, gate_index, project_id, title,
      capex_zar, capex_band, equator_category, debt_sized,
      current_tier,
      floor_equator_cat_a, floor_fid_committed, floor_nersa_notifiable,
      floor_debt_sized, floor_shareholder_consent_required,
      w19_procurement_ref, w20_cod_ref, w21_drawdown_ref, w113_evm_ref,
      bridges_to_w19_live, bridges_to_w20_live, bridges_to_w21_live, bridges_to_w113_live,
      reason_code,
      authority_required, urgency_band,
      chain_status, gate_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached,
      is_reportable,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?,
      ?, ?,
      'gate_proposed', ?,
      ?, ?, 0,
      0,
      ?, ?, ?
    )
  `).bind(
    id, body.gate_index, body.project_id, body.title ?? null,
    body.capex_zar ?? null, body.capex_band ?? null, body.equator_category ?? null, body.debt_sized ? 1 : 0,
    tier,
    flags.floor_equator_cat_a ? 1 : 0, flags.floor_fid_committed ? 1 : 0, flags.floor_nersa_notifiable ? 1 : 0,
    flags.floor_debt_sized ? 1 : 0, flags.floor_shareholder_consent_required ? 1 : 0,
    body.w19_procurement_ref ?? null, body.w20_cod_ref ?? null, body.w21_drawdown_ref ?? null, body.w113_evm_ref ?? null,
    body.w19_procurement_ref ? 1 : 0, body.w20_cod_ref ? 1 : 0, body.w21_drawdown_ref ? 1 : 0, body.w113_evm_ref ? 1 : 0,
    body.reason_code ?? null,
    authorityRequired(body.gate_index, tier), urgencyBand(tier, slaHrs),
    now.toISOString(),
    slaHrs, slaDeadline?.toISOString() ?? null,
    user.id, now.toISOString(), now.toISOString()
  ).run();

  // Fire cascade event
  await fireCascade({
    event: 'stage_gate.proposed',
    actor_id: user.id,
    entity_type: 'stage_gate',
    entity_id: id,
    data: { gate_index: body.gate_index, project_id: body.project_id, tier },
    env: c.env,
  });

  const row = await c.env.DB.prepare('SELECT * FROM oe_stage_gates WHERE id = ?').bind(id).first<SgRow>();
  return c.json({ data: decorateLiveFields(row!, new Date()) }, 201);
});

// ── POST /api/stage-gate/:id/:action — state transition
app.post('/:id/:action', async (c: Context<HonoEnv>) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { id, action } = c.req.param() as { id: string; action: string };
  const body = (await c.req.json().catch(() => ({}))) as {
    reason_code?: string;
    decision?: string;
    conditions_payload?: string;
    evidence_payload?: string;
    w118_block_ref?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare('SELECT * FROM oe_stage_gates WHERE id = ?').bind(id).first<SgRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);

  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Gate is in terminal state: ${row.chain_status}` }, 409);
  }

  const sgAction = action as SgAction;
  const toStatus = nextStatus(row.chain_status, sgAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();
  const flags: SgFloorFlags = {
    floor_equator_cat_a: row.floor_equator_cat_a,
    floor_fid_committed: row.floor_fid_committed,
    floor_nersa_notifiable: row.floor_nersa_notifiable,
    floor_debt_sized: row.floor_debt_sized,
    floor_shareholder_consent_required: row.floor_shareholder_consent_required,
  };
  const tier = effectiveTier(row.current_tier, flags);
  const regulatorCrossed = crossesIntoRegulator(sgAction, tier, { gate_index: row.gate_index });
  const isRep = isReportable(sgAction, tier, { gate_index: row.gate_index });
  const party = partyForAction(sgAction);
  const eventType = eventTypeFor(sgAction);

  // Compute SLA for new status
  const newSlaHrs = slaWindowHours(toStatus, tier);
  const newSlaDeadline = slaDeadlineFor(toStatus, tier, now);

  // Build update fields
  const tsCol = statusTsCol(toStatus);
  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  if (tsCol) {
    updates.push(`${tsCol} = ?`);
    vals.push(now.toISOString());
  }
  updates.push('sla_target_hours = ?', 'sla_deadline_at = ?');
  vals.push(newSlaHrs, newSlaDeadline?.toISOString() ?? null);

  if (regulatorCrossed) {
    updates.push('is_reportable = 1', 'regulator_relevant = 1', 'regulator_crossed_at = ?');
    vals.push(now.toISOString());
  }
  if (isRep) {
    updates.push('is_reportable = 1');
  }
  if (body.reason_code) { updates.push('reason_code = ?'); vals.push(body.reason_code); }
  if (body.decision) { updates.push('decision = ?'); vals.push(body.decision); }
  if (body.conditions_payload) { updates.push('conditions_payload = ?'); vals.push(body.conditions_payload); }
  if (body.evidence_payload) { updates.push('evidence_payload = ?'); vals.push(body.evidence_payload); }
  if (body.w118_block_ref) {
    updates.push('w118_block_ref = ?', 'bridges_to_w118_live = 1');
    vals.push(body.w118_block_ref);
  }
  // Record decision at DG3/DG4 sets fid_committed
  if (sgAction === 'record_decision' && row.gate_index >= 3) {
    updates.push('floor_fid_committed = 1');
  }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_stage_gates SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const evtId = `sge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await c.env.DB.prepare(`
    INSERT INTO oe_stage_gate_events
      (id, gate_id, event_type, actor_id, actor_party, from_status, to_status, payload, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    evtId, id, eventType, user.id, party,
    row.chain_status, toStatus,
    JSON.stringify(body),
    regulatorCrossed ? 1 : 0,
    now.toISOString()
  ).run();

  // Fire cascade
  await fireCascade({
    event: eventType,
    actor_id: user.id,
    entity_type: 'stage_gate',
    entity_id: id,
    data: {
      action: sgAction,
      from_status: row.chain_status,
      to_status: toStatus,
      tier,
      gate_index: row.gate_index,
      regulator_crossed: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare('SELECT * FROM oe_stage_gates WHERE id = ?').bind(id).first<SgRow>();
  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron sweep functions ─────────────────────────────────────────────────

// stageGateSlaSweep — runs on */15 * * * * (shared runner).
// Walks every non-terminal gate with a sla_deadline_at in the past,
// sets sla_breached=1, fires stage_gate.sla_breached cascade event,
// crosses regulator on high_capex + mega_capex + equator_cat_a.
export async function stageGateSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date().toISOString();
  const overdue = await env.DB.prepare(`
    SELECT id, current_tier, gate_index, chain_status
    FROM oe_stage_gates
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND sla_deadline_at < ?
      AND chain_status NOT IN ('archived','gate_rejected','gate_withdrawn')
  `).bind(now).all<{ id: string; current_tier: SgTier; gate_index: number; chain_status: SgStatus }>();

  let swept = 0, crossed = 0;
  for (const row of (overdue.results ?? [])) {
    await env.DB.prepare(`
      UPDATE oe_stage_gates SET sla_breached = 1, last_sla_breach_at = ?, updated_at = ? WHERE id = ?
    `).bind(now, now, row.id).run();

    const crossesReg = slaBreachCrossesIntoRegulator(row.current_tier);
    if (crossesReg) {
      await env.DB.prepare(`
        UPDATE oe_stage_gates SET is_reportable = 1, regulator_relevant = 1 WHERE id = ?
      `).bind(row.id).run();
      crossed++;
    }

    await fireCascade({
      event: 'stage_gate.sla_breached',
      actor_id: 'cron',
      entity_type: 'stage_gate',
      entity_id: row.id,
      data: { tier: row.current_tier, gate_index: row.gate_index, regulator_crossed: crossesReg },
      env: env as never,
    });

    swept++;
  }
  return { swept, crossed };
}

// stageGateConditionsAgingSweep — runs on 0 6 * * 1 (Monday 08:00 SAST).
// Walks every gate in conditions_set / gate_conditional_pass with aging
// conditions, flags regulator_relevant when conditions_aging_days > 90.
export async function stageGateConditionsAgingSweep(env: HonoEnv['Bindings']): Promise<{ flagged: number }> {
  const now = new Date();
  const threshold_days = 90;
  const cutoff = new Date(now.getTime() - threshold_days * 24 * 3600 * 1000).toISOString();

  const stale = await env.DB.prepare(`
    SELECT id, conditions_set_at, current_tier
    FROM oe_stage_gates
    WHERE chain_status IN ('conditions_set','decision_recorded','conditions_satisfied','gate_conditional_pass')
      AND conditions_set_at IS NOT NULL
      AND conditions_set_at < ?
      AND regulator_relevant = 0
  `).bind(cutoff).all<{ id: string; conditions_set_at: string; current_tier: SgTier }>();

  let flagged = 0;
  for (const row of (stale.results ?? [])) {
    await env.DB.prepare(`
      UPDATE oe_stage_gates SET regulator_relevant = 1, updated_at = ? WHERE id = ?
    `).bind(now.toISOString(), row.id).run();

    await fireCascade({
      event: 'stage_gate.conditions_set',
      actor_id: 'cron',
      entity_type: 'stage_gate',
      entity_id: row.id,
      data: { type: 'condition_stale', conditions_set_at: row.conditions_set_at, aging_days: threshold_days },
      env: env as never,
    });

    flagged++;
  }
  return { flagged };
}
