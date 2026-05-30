// ═══════════════════════════════════════════════════════════════════════════
// Wave 94 — NTCSA Renewable-Energy-Zone (REZ) Capacity Allocation &
// Competitive Auction. Mounted at /api/grid/rez-capacity/chain.
//
// The COMPETITIVE-ZONAL-ALLOCATION layer of a best-in-class system-operator
// stack. W58 grid-capacity-allocation gives a generic first-come-first-served
// queue; W28 GCA gives the physical connection agreement; W75 connection-
// energization gives the energization gate. W94 inserts the COMPETITIVE ZONAL
// AUCTION between them: announcement → application → compliance → shortlist
// → multi-criteria scoring → award → financial-close → construction →
// commercial-operation.
//
// DISTINCTIVE move (beat AEMO REZ / NYISO TPP / CAISO TPP / ERCOT CREZ /
// EU TYNDP / ENTSO-E TYNDP / NGESO Holistic Network Design / Hydro Quebec
// MRC — most run REZ auctions on spreadsheets and never recycle forfeit MW):
// every allocation is LIVE-scored on every fetch against ZONE-HEADROOM
// (configured ceiling vs allocated-to-date), a multi-criteria WEIGHTED-SCORE
// (price 0.50 + B-BBEE 0.20 + ED 0.15 + local-content 0.15 per the DMRE 40%
// local-content REIPPPP rule), a COMPETITION-RATIO from applications-per-lot,
// a MILESTONE-COMPLIANCE %, a FORFEIT-RATE per zone, and a PREDICTED-OPERATION
// -DATE rolling forward from current state.
//
// Write model — SINGLE-PARTY {admin, grid_operator} (SO side). READ platform-
// wide (APPLICANT must see their own case via tenant scoping). actor_party
// (compliance_officer / evaluation_panel / council / system_operator) is per-
// action functional attribution, NOT an access split.
//
// Reportability — the W94 SIGNATURE is AWARD/FORFEIT-driven (every capacity
// award and every forfeit-recycling is publicly registered regardless of MW):
//   award_capacity       crosses regulator EVERY tier — SIGNATURE hard line.
//   forfeit_allocation   crosses regulator EVERY tier — security-of-supply.
//   reject_application   crosses material+mega only (governance).
//   complete_evaluation  crosses mega only (multi-criteria public scrutiny).
//   confirm_operation    crosses mega only (security-of-supply milestone).
//   sla_breached         crosses material+mega only (procedural risk).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierFromCapacity,
  effectiveCapacityMw,
  isHighTier,
  isReportable,
  isFloorAtMegaClass,
  actionCrossesRegulator,
  authorityFor,
  remainingHeadroomMw,
  competitionRatio,
  competitionIntensityBand,
  weightedScore,
  priceScore,
  localContentScore,
  milestoneCompliancePct,
  forfeitRatePct,
  predictedOperationDate,
  urgencyBand,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  reasonCodeFor,
  inboxSeverityForTier,
  SLA_MINUTES,
  SCORE_WEIGHTS,
  LOCAL_CONTENT_THRESHOLD_PCT,
  type RezCapacityStatus,
  type RezCapacityAction,
  type RezCapacityTier,
  type RezAllocationClass,
} from '../utils/rez-capacity-spec';

const READ_ROLES = new Set([
  'admin', 'grid_operator', 'regulator',
  'ipp', 'ipp_developer', 'wind',
  'carbon_fund', 'offtaker', 'lender', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'grid_operator']);

interface RezAllocationRow {
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trigger_kind: string | null;
  applicant_party_id: string;
  applicant_party_name: string | null;
  applicant_persona: string | null;
  applicant_contact: string | null;
  bbbee_level: number | null;
  allocation_class: RezAllocationClass;
  zone_code: string;
  zone_name: string | null;
  technology: string | null;
  capacity_tier: RezCapacityTier;
  authority_required: string | null;
  requested_capacity_mw: number;
  awarded_capacity_mw: number | null;
  zone_total_capacity_mw: number;
  zone_allocated_to_date_mw: number;
  zone_lots_available: number;
  zone_applications_in_round: number;
  zone_forfeit_to_date_mw: number;
  bid_price_zar_per_mwh: number;
  price_floor_zar_per_mwh: number;
  price_ceiling_zar_per_mwh: number;
  bbbee_score: number | null;
  ed_score: number | null;
  local_content_pct: number | null;
  weighted_score: number | null;
  award_clearance_price_zar_per_mw: number | null;
  financial_close_target_at: string | null;
  financial_close_actual_at: string | null;
  construction_start_target_at: string | null;
  construction_start_actual_at: string | null;
  operation_target_at: string | null;
  operation_actual_at: string | null;
  milestones_total: number;
  milestones_met_on_time: number;
  announcement_ref: string | null;
  evaluation_ref: string | null;
  award_ref: string | null;
  fc_ref: string | null;
  construction_ref: string | null;
  operation_ref: string | null;
  forfeit_ref: string | null;
  rejection_ref: string | null;
  regulator_ref: string | null;
  gca_ref: string | null;
  energization_ref: string | null;
  application_basis: string | null;
  evaluation_basis: string | null;
  award_basis: string | null;
  rejection_basis: string | null;
  forfeit_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: RezCapacityStatus;
  announcement_published_at: string;
  application_submitted_at: string | null;
  compliance_check_at: string | null;
  shortlisted_at: string | null;
  evaluation_complete_at: string | null;
  award_proposed_at: string | null;
  capacity_awarded_at: string | null;
  financial_close_met_at: string | null;
  construction_in_progress_at: string | null;
  in_operation_at: string | null;
  rejected_at: string | null;
  forfeit_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RezEventRow {
  id: string;
  allocation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<RezCapacityStatus, keyof RezAllocationRow | null> = {
  announcement_published:    null,
  application_submitted:     'application_submitted_at',
  compliance_check:          'compliance_check_at',
  shortlisted:               'shortlisted_at',
  evaluation_complete:       'evaluation_complete_at',
  award_proposed:            'award_proposed_at',
  capacity_awarded:          'capacity_awarded_at',
  financial_close_met:       'financial_close_met_at',
  construction_in_progress:  'construction_in_progress_at',
  in_operation:              'in_operation_at',
  rejected:                  'rejected_at',
  forfeit:                   'forfeit_at',
  withdrawn:                 'withdrawn_at',
};

function decorate(row: RezAllocationRow, now: Date) {
  const tier = row.capacity_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const effMw = effectiveCapacityMw(row.requested_capacity_mw, row.awarded_capacity_mw);
  const tierLive = tierFromCapacity(effMw, row.allocation_class);

  const headroomLive = remainingHeadroomMw(
    row.zone_total_capacity_mw,
    row.zone_allocated_to_date_mw,
  );
  const compRatioLive = competitionRatio(
    row.zone_applications_in_round,
    row.zone_lots_available,
  );
  const compBandLive = competitionIntensityBand(compRatioLive);

  const priceScoreLive = priceScore(
    row.bid_price_zar_per_mwh,
    row.price_floor_zar_per_mwh,
    row.price_ceiling_zar_per_mwh,
  );
  const localContentScoreLive = localContentScore(row.local_content_pct ?? 0);
  const weightedScoreLive = weightedScore(
    priceScoreLive,
    row.bbbee_score ?? 0,
    row.ed_score ?? 0,
    row.local_content_pct ?? 0,
  );

  const milestoneCompliance = milestoneCompliancePct(
    row.milestones_met_on_time,
    row.milestones_total,
  );
  const forfeitRate = forfeitRatePct(
    row.zone_forfeit_to_date_mw,
    row.zone_total_capacity_mw,
  );

  const stateEnteredCol = TIMESTAMP_COLUMN[status];
  const stateEnteredIso = stateEnteredCol ? (row[stateEnteredCol] as string | null) : null;
  const stateEnteredAt = stateEnteredIso ? new Date(stateEnteredIso) : now;
  const predictedOpDate = predictedOperationDate(status, tierLive, stateEnteredAt);

  const urgency = urgencyBand(
    status,
    slaIso ? new Date(slaIso) : null,
    now,
  );

  const floorApplied = isFloorAtMegaClass(row.allocation_class);
  const signatureClass = floorApplied;

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0 && !isTerminal(status),
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    urgency_band: urgency,
    is_reportable_flag: !!row.is_reportable,
    high_tier_flag: isHighTier(tier),
    floor_at_mega_class_flag: floorApplied,
    signature_class_flag: signatureClass,
    authority_required_live: authorityFor(tier),
    effective_capacity_mw_live: effMw,
    tier_live: tierLive,
    remaining_headroom_mw_live: headroomLive,
    competition_ratio_live: compRatioLive,
    competition_intensity_band_live: compBandLive,
    price_score_live: priceScoreLive,
    local_content_score_live: localContentScoreLive,
    weighted_score_live: weightedScoreLive,
    local_content_meets_threshold_flag: (row.local_content_pct ?? 0) >= LOCAL_CONTENT_THRESHOLD_PCT,
    milestone_compliance_pct_live: milestoneCompliance,
    forfeit_rate_pct_live: forfeitRate,
    predicted_operation_date_live: predictedOpDate,
    inbox_severity_live: inboxSeverityForTier(tier),
    reportable_per_spec: isReportable(tier),
    score_weights: SCORE_WEIGHTS,
    local_content_threshold_pct: LOCAL_CONTENT_THRESHOLD_PCT,
  };
}

const app = new Hono<HonoEnv>();

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const capacity_tier    = c.req.query('capacity_tier');
  const status           = c.req.query('status');
  const allocation_class = c.req.query('allocation_class');
  const zone_code        = c.req.query('zone_code');
  const technology       = c.req.query('technology');
  const applicant        = c.req.query('applicant_party_id');
  const breached         = c.req.query('breached');
  const reportable       = c.req.query('reportable');
  const floor_only       = c.req.query('floor_only');

  let sql = 'SELECT * FROM oe_rez_capacity_allocations WHERE 1=1';
  const binds: unknown[] = [];
  if (capacity_tier)    { sql += ' AND capacity_tier = ?';    binds.push(capacity_tier); }
  if (status)           { sql += ' AND chain_status = ?';     binds.push(status); }
  if (allocation_class) { sql += ' AND allocation_class = ?'; binds.push(allocation_class); }
  if (zone_code)        { sql += ' AND zone_code = ?';        binds.push(zone_code); }
  if (technology)       { sql += ' AND technology = ?';       binds.push(technology); }
  if (applicant)        { sql += ' AND applicant_party_id = ?'; binds.push(applicant); }

  sql += ' ORDER BY datetime(announcement_published_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RezAllocationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);
  if (floor_only === 'true') items = items.filter((r) => r.floor_at_mega_class_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_zone: Record<string, number> = {};
  const by_technology: Record<string, number> = {};
  const by_applicant: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const r of items) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + 1;
    by_tier[r.capacity_tier] = (by_tier[r.capacity_tier] || 0) + 1;
    by_class[r.allocation_class] = (by_class[r.allocation_class] || 0) + 1;
    by_zone[r.zone_code] = (by_zone[r.zone_code] || 0) + 1;
    if (r.technology) by_technology[r.technology] = (by_technology[r.technology] || 0) + 1;
    by_applicant[r.applicant_party_id] = (by_applicant[r.applicant_party_id] || 0) + 1;
    by_urgency[r.urgency_band] = (by_urgency[r.urgency_band] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const in_operation_count  = items.filter((i) => i.chain_status === 'in_operation').length;
  const awarded_count       = items.filter((i) => i.chain_status === 'capacity_awarded').length;
  const rejected_count      = items.filter((i) => i.chain_status === 'rejected').length;
  const forfeit_count       = items.filter((i) => i.chain_status === 'forfeit').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count      = items.filter((i) => i.sla_breached).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const signature_count     = items.filter((i) => i.signature_class_flag).length;
  const floor_applied_count = items.filter((i) => i.floor_at_mega_class_flag).length;
  const local_content_meets_count = items.filter((i) => i.local_content_meets_threshold_flag).length;

  const total_requested_mw = items.reduce((s, i) => s + (i.requested_capacity_mw || 0), 0);
  const total_awarded_mw   = items.reduce((s, i) => s + (i.awarded_capacity_mw || 0), 0);
  const total_forfeit_mw   = items.reduce((s, i) => s + (i.zone_forfeit_to_date_mw || 0), 0);
  const total_headroom_mw  = items.reduce((s, i) => s + (i.remaining_headroom_mw_live || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_class,
      by_zone,
      by_technology,
      by_applicant,
      by_urgency,
      open_count,
      in_operation_count,
      awarded_count,
      rejected_count,
      forfeit_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      floor_applied_count,
      local_content_meets_count,
      total_requested_mw,
      total_awarded_mw,
      total_forfeit_mw,
      total_headroom_mw,
      score_weights: SCORE_WEIGHTS,
      local_content_threshold_pct: LOCAL_CONTENT_THRESHOLD_PCT,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_rez_capacity_allocations WHERE id = ?').bind(id).first<RezAllocationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_rez_capacity_events WHERE allocation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RezEventRow>();

  return c.json({
    success: true,
    data: {
      allocation: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: RezCapacityAction,
  bodyHandler?: (row: RezAllocationRow, body: Record<string, unknown>) => Partial<RezAllocationRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_rez_capacity_allocations WHERE id = ?').bind(id).first<RezAllocationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier RE-DERIVED on every transition from effective capacity (awarded
  // preferred over requested) with floor-at-mega override for priority /
  // constraint_relief / jet allocation classes (W94 distinctive class-floor).
  const requestedMw = (overrides.requested_capacity_mw as number | undefined) ?? row.requested_capacity_mw;
  const awardedMw = (overrides.awarded_capacity_mw as number | undefined) ?? row.awarded_capacity_mw;
  const allocationClass = (overrides.allocation_class as RezAllocationClass | undefined) ?? row.allocation_class;
  const effMw = effectiveCapacityMw(requestedMw, awardedMw);
  const tier = tierFromCapacity(effMw, allocationClass);
  overrides.capacity_tier = tier;
  overrides.authority_required = authorityFor(tier);

  // Reportability — DETERMINATION-driven (award + forfeit + class + tier).
  const crosses = actionCrossesRegulator(action, tier, allocationClass);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_rez_capacity_allocations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `rez_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_rez_capacity_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    specEventTypeFor(to),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action, reason_code: reasonCode }),
    nowIso,
  ).run();

  const eventName = specEventTypeFor(to) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'rez_capacity',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      capacity_tier: tier,
      allocation_class: allocationClass,
      chain_status: to,
      from_status: row.chain_status,
      action,
      reason_code: reasonCode,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_rez_capacity_allocations WHERE id = ?').bind(id).first<RezAllocationRow>();
  return c.json({ success: true, data: { allocation: refreshed ? decorate(refreshed, now) : null } });
}

interface ApplyBody {
  applicant_party_id?: string;
  applicant_party_name?: string;
  applicant_persona?: string;
  applicant_contact?: string;
  bbbee_level?: number;
  technology?: string;
  requested_capacity_mw?: number;
  bid_price_zar_per_mwh?: number;
  bbbee_score?: number;
  ed_score?: number;
  local_content_pct?: number;
  application_basis?: string;
  reason_code?: string;
}

interface ComplianceBody {
  evaluation_ref?: string;
  evaluation_basis?: string;
  reason_code?: string;
}

interface ShortlistBody {
  evaluation_ref?: string;
  reason_code?: string;
}

interface EvaluateBody {
  evaluation_ref?: string;
  evaluation_basis?: string;
  weighted_score?: number;
  reason_code?: string;
}

interface ProposeAwardBody {
  award_ref?: string;
  award_basis?: string;
  awarded_capacity_mw?: number;
  award_clearance_price_zar_per_mw?: number;
  reason_code?: string;
}

interface ConfirmAwardBody {
  award_ref?: string;
  awarded_capacity_mw?: number;
  financial_close_target_at?: string;
  construction_start_target_at?: string;
  operation_target_at?: string;
  milestones_total?: number;
  regulator_ref?: string;
  reason_code?: string;
}

interface FcBody {
  fc_ref?: string;
  financial_close_actual_at?: string;
  reason_code?: string;
}

interface StartConstructionBody {
  construction_ref?: string;
  construction_start_actual_at?: string;
  reason_code?: string;
}

interface ConfirmOperationBody {
  operation_ref?: string;
  operation_actual_at?: string;
  energization_ref?: string;
  gca_ref?: string;
  reason_code?: string;
}

interface RejectBody {
  rejection_ref?: string;
  rejection_basis?: string;
  reason_code?: string;
}

interface ForfeitBody {
  forfeit_ref?: string;
  forfeit_basis?: string;
  reason_code?: string;
}

interface WithdrawBody {
  withdrawal_basis?: string;
  reason_code?: string;
}

app.post('/:id/submit-application', async (c) => transition(c, 'submit_application', (_row, body) => {
  const b = body as Partial<ApplyBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.applicant_party_id === 'string')   out.applicant_party_id = b.applicant_party_id;
  if (typeof b.applicant_party_name === 'string') out.applicant_party_name = b.applicant_party_name;
  if (typeof b.applicant_persona === 'string')    out.applicant_persona = b.applicant_persona;
  if (typeof b.applicant_contact === 'string')    out.applicant_contact = b.applicant_contact;
  if (typeof b.bbbee_level === 'number')          out.bbbee_level = b.bbbee_level;
  if (typeof b.technology === 'string')           out.technology = b.technology;
  if (typeof b.requested_capacity_mw === 'number') out.requested_capacity_mw = b.requested_capacity_mw;
  if (typeof b.bid_price_zar_per_mwh === 'number') out.bid_price_zar_per_mwh = b.bid_price_zar_per_mwh;
  if (typeof b.bbbee_score === 'number')          out.bbbee_score = b.bbbee_score;
  if (typeof b.ed_score === 'number')             out.ed_score = b.ed_score;
  if (typeof b.local_content_pct === 'number')    out.local_content_pct = b.local_content_pct;
  if (typeof b.application_basis === 'string')    out.application_basis = b.application_basis;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/check-compliance', async (c) => transition(c, 'start_compliance', (_row, body) => {
  const b = body as Partial<ComplianceBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.evaluation_ref === 'string')   out.evaluation_ref = b.evaluation_ref;
  if (typeof b.evaluation_basis === 'string') out.evaluation_basis = b.evaluation_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/shortlist', async (c) => transition(c, 'shortlist', (_row, body) => {
  const b = body as Partial<ShortlistBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.evaluation_ref === 'string') out.evaluation_ref = b.evaluation_ref;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/complete-evaluation', async (c) => transition(c, 'complete_evaluation', (row, body) => {
  const b = body as Partial<EvaluateBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.evaluation_ref === 'string')   out.evaluation_ref = b.evaluation_ref;
  if (typeof b.evaluation_basis === 'string') out.evaluation_basis = b.evaluation_basis;
  if (typeof b.weighted_score === 'number') {
    out.weighted_score = b.weighted_score;
  } else if (row.weighted_score == null) {
    const ps = priceScore(
      row.bid_price_zar_per_mwh,
      row.price_floor_zar_per_mwh,
      row.price_ceiling_zar_per_mwh,
    );
    out.weighted_score = weightedScore(
      ps,
      row.bbbee_score ?? 0,
      row.ed_score ?? 0,
      row.local_content_pct ?? 0,
    );
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/propose-award', async (c) => transition(c, 'propose_award', (_row, body) => {
  const b = body as Partial<ProposeAwardBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.award_ref === 'string')                       out.award_ref = b.award_ref;
  if (typeof b.award_basis === 'string')                     out.award_basis = b.award_basis;
  if (typeof b.awarded_capacity_mw === 'number')             out.awarded_capacity_mw = b.awarded_capacity_mw;
  if (typeof b.award_clearance_price_zar_per_mw === 'number') out.award_clearance_price_zar_per_mw = b.award_clearance_price_zar_per_mw;
  if (typeof b.reason_code === 'string')                     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/award-capacity', async (c) => transition(c, 'award_capacity', (row, body) => {
  const b = body as Partial<ConfirmAwardBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.award_ref === 'string') out.award_ref = b.award_ref;
  if (typeof b.awarded_capacity_mw === 'number') {
    out.awarded_capacity_mw = b.awarded_capacity_mw;
  } else if (row.awarded_capacity_mw == null) {
    out.awarded_capacity_mw = row.requested_capacity_mw;
  }
  if (typeof b.financial_close_target_at === 'string')    out.financial_close_target_at = b.financial_close_target_at;
  if (typeof b.construction_start_target_at === 'string') out.construction_start_target_at = b.construction_start_target_at;
  if (typeof b.operation_target_at === 'string')          out.operation_target_at = b.operation_target_at;
  if (typeof b.milestones_total === 'number')             out.milestones_total = b.milestones_total;
  if (typeof b.regulator_ref === 'string')                out.regulator_ref = b.regulator_ref;
  if (typeof b.reason_code === 'string')                  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/meet-financial-close', async (c) => transition(c, 'confirm_financial_close', (_row, body) => {
  const b = body as Partial<FcBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.fc_ref === 'string') out.fc_ref = b.fc_ref;
  if (typeof b.financial_close_actual_at === 'string') {
    out.financial_close_actual_at = b.financial_close_actual_at;
  } else {
    out.financial_close_actual_at = new Date().toISOString();
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/start-construction', async (c) => transition(c, 'start_construction', (_row, body) => {
  const b = body as Partial<StartConstructionBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.construction_ref === 'string') out.construction_ref = b.construction_ref;
  if (typeof b.construction_start_actual_at === 'string') {
    out.construction_start_actual_at = b.construction_start_actual_at;
  } else {
    out.construction_start_actual_at = new Date().toISOString();
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/confirm-operation', async (c) => transition(c, 'confirm_operation', (_row, body) => {
  const b = body as Partial<ConfirmOperationBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.operation_ref === 'string')   out.operation_ref = b.operation_ref;
  if (typeof b.energization_ref === 'string') out.energization_ref = b.energization_ref;
  if (typeof b.gca_ref === 'string')          out.gca_ref = b.gca_ref;
  if (typeof b.operation_actual_at === 'string') {
    out.operation_actual_at = b.operation_actual_at;
  } else {
    out.operation_actual_at = new Date().toISOString();
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reject-application', async (c) => transition(c, 'reject_application', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/forfeit-allocation', async (c) => transition(c, 'forfeit_allocation', (_row, body) => {
  const b = body as Partial<ForfeitBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.forfeit_ref === 'string')   out.forfeit_ref = b.forfeit_ref;
  if (typeof b.forfeit_basis === 'string') out.forfeit_basis = b.forfeit_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<RezAllocationRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function rezCapacitySlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_rez_capacity_allocations
     WHERE chain_status NOT IN ('in_operation','rejected','forfeit','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RezAllocationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_rez_capacity_allocations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `rez_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_rez_capacity_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'rez_capacity.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.capacity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (isHighTier(row.capacity_tier)) {
      await fireCascade({
        event: 'rez_capacity.sla_breached',
        actor_id: 'system',
        entity_type: 'rez_capacity',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
