// ═══════════════════════════════════════════════════════════════════════════
// Wave 93 — NERSA ERA s35 Enforcement Actions & Administrative Penalties.
//
// Mounted at /api/regulator/enforcement-action/chain.
//
// The ENFORCEMENT-TEETH layer of a best-in-class regulator stack. W5 inbox
// (case-arrival), W31 disposition (queue/adjudication), W40 compliance
// inspection (findings of non-conformance) all hand a case OUT — W93 is the
// formal administrative-penalty machinery that picks them up and runs them
// through ERA s35 / PAJA s4 due-process to a public-register penalty notice.
//
// DISTINCTIVE move (beat FERC Office of Enforcement / Ofgem provisional+final
// penalty notice / Bundesnetzagentur Bußgeldverfahren / CRE CoRDiS / AER /
// ACER / SEC ALJ / SARS TAA Ch15): every case is LIVE-scored on every fetch
// against an AUDI-WINDOW COMPLIANCE battery (PAJA s4 + ERA s35(3) 21-day
// minimum), a procedural-irregularity flag fires on under-21-day windows or
// denied hearing without reasoned refusal, the ERA s35 cap of R1m/offence is
// enforced automatically with stacking across offence_count, prescribed-
// rate interest (15.5% per Prescribed Rate of Interest Act 55/1975) accrues
// from due date on unpaid penalty, repeat-offender score raises floor-at-
// severe. Best-in-class regulators run this in spreadsheets and miss
// procedural windows; W93 does not.
//
// Write model — SINGLE-PARTY {admin, regulator} (NERSA side). READ platform-
// wide (RESPONDENT must see their own case). actor_party (enforcement_officer
// / panel_chair / council / sheriff) is per-action functional attribution.
//
// Reportability — the W93 SIGNATURE is DETERMINATION-driven (a penalty notice
// at any tier is itself the reportable signal):
//   impose_penalty       crosses regulator EVERY tier — SIGNATURE hard line.
//   initiate_enforcement crosses every tier — court-system signal.
//   lodge_appeal         crosses every tier — Tribunal signal.
//   make_determination   crosses every tier on severe, material+ otherwise.
//   serve_allegations    crosses every tier when floor-at-severe class.
//   dismiss / withdraw   crosses material+severe only.
//   sla_breached         crosses material+severe (judicial-review risk).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierFromPenalty,
  cappedPenaltyPerOffenceZar,
  totalPenaltyZar,
  isHighTier,
  isReportable,
  isFloorAtSevereClass,
  actionCrossesRegulator,
  authorityFor,
  audiWindowDaysRemaining,
  audiMinimumMetFlag,
  proceduralIrregularityFlag,
  accruedInterestZar,
  recoveryPct,
  repeatOffenderScore,
  repeatOffenderFlag,
  predictedRecoveryDays,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  reasonCodeFor,
  urgencyBand,
  SLA_MINUTES,
  type EnforcementActionStatus,
  type EnforcementActionAction,
  type EnforcementActionTier,
  type AllegationClass,
} from '../utils/enforcement-action-spec';

const READ_ROLES = new Set([
  'admin', 'regulator',
  'ipp', 'ipp_developer', 'wind',
  'carbon_fund', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'regulator']);

interface EnforcementActionRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trigger_kind: string | null;
  respondent_party_id: string;
  respondent_party_name: string | null;
  respondent_licence_no: string | null;
  respondent_persona: string | null;
  respondent_contact: string | null;
  allegation_class: AllegationClass;
  allegation_summary: string | null;
  era_section_cited: string | null;
  offence_count: number;
  contravention_period_start: string | null;
  contravention_period_end: string | null;
  penalty_tier: EnforcementActionTier;
  authority_required: string | null;
  proposed_penalty_per_offence_zar: number;
  proposed_penalty_total_zar: number;
  imposed_penalty_zar: number | null;
  recovered_zar: number;
  accrued_interest_zar: number;
  representations_opened_at: string | null;
  representations_closed_at: string | null;
  representations_received_flag: number;
  representations_summary: string | null;
  hearing_requested_flag: number;
  hearing_held_flag: number;
  reasoned_refusal_flag: number;
  procedural_irregularity_flag: number;
  determination_liable_flag: number | null;
  determination_basis: string | null;
  determination_date: string | null;
  enforcement_step: string | null;
  enforcement_step_at: string | null;
  payment_due_date: string | null;
  days_overdue: number;
  appeal_filed_at: string | null;
  appeal_forum: string | null;
  appeal_outcome: string | null;
  prior_penalty_count: number;
  days_since_last_penalty: number | null;
  serve_ref: string | null;
  hearing_ref: string | null;
  determination_ref: string | null;
  penalty_ref: string | null;
  payment_ref: string | null;
  appeal_ref: string | null;
  enforcement_ref: string | null;
  regulator_ref: string | null;
  allegations_basis: string | null;
  determination_summary: string | null;
  penalty_basis: string | null;
  appeal_basis: string | null;
  enforcement_basis: string | null;
  reason_code: string | null;
  chain_status: EnforcementActionStatus;
  case_opened_at: string;
  allegations_drafted_at: string | null;
  allegations_served_at: string | null;
  representations_period_at: string | null;
  hearing_held_at: string | null;
  determination_at: string | null;
  penalty_imposed_at: string | null;
  paid_at: string | null;
  appealed_at: string | null;
  enforced_via_court_at: string | null;
  dismissed_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EnforcementActionEventRow {
  id: string;
  case_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<EnforcementActionStatus, keyof EnforcementActionRow | null> = {
  case_opened:            null,
  allegations_drafted:    'allegations_drafted_at',
  allegations_served:     'allegations_served_at',
  representations_period: 'representations_period_at',
  hearing_held:           'hearing_held_at',
  determination:          'determination_at',
  penalty_imposed:        'penalty_imposed_at',
  paid:                   'paid_at',
  appealed:               'appealed_at',
  enforced_via_court:     'enforced_via_court_at',
  dismissed:              'dismissed_at',
  withdrawn:              'withdrawn_at',
};

function decorate(row: EnforcementActionRow, now: Date) {
  const tier = row.penalty_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const cappedPerOff = cappedPenaltyPerOffenceZar(row.proposed_penalty_per_offence_zar);
  const totalLive = totalPenaltyZar(row.proposed_penalty_per_offence_zar, row.offence_count);
  const tierLive = tierFromPenalty(totalLive, row.allegation_class);

  const repsOpened = row.representations_opened_at ? new Date(row.representations_opened_at) : null;
  const audiDaysRemaining = audiWindowDaysRemaining(repsOpened, tier, now);
  const audiMinMet = audiMinimumMetFlag(tier);
  const proceduralIrregularity = proceduralIrregularityFlag(
    tier,
    row.hearing_requested_flag === 1,
    row.hearing_held_flag === 1 || row.reasoned_refusal_flag === 1,
  );

  const imposed = row.imposed_penalty_zar || 0;
  const recovered = row.recovered_zar || 0;
  const interestLive = accruedInterestZar(imposed - recovered, row.days_overdue);
  const recoveryPctLive = recoveryPct(recovered, imposed);

  const repeatScore = repeatOffenderScore(row.prior_penalty_count, row.days_since_last_penalty ?? 9999);
  const repeatFlag = repeatOffenderFlag(row.prior_penalty_count, row.days_since_last_penalty ?? 9999);

  const predictedDays = predictedRecoveryDays(row.enforcement_step || 'none');

  const floorApplied = isFloorAtSevereClass(row.allegation_class);
  const signatureClass = floorApplied;

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0 && !isTerminal(status),
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    urgency_band: urgencyBand(status, slaIso ? new Date(slaIso) : null, now),
    is_reportable_flag: !!row.is_reportable,
    high_tier_flag: isHighTier(tier),
    floor_at_severe_class_flag: floorApplied,
    signature_class_flag: signatureClass,
    authority_required_live: authorityFor(tier),
    capped_penalty_per_offence_zar_live: cappedPerOff,
    proposed_penalty_total_zar_live: totalLive,
    tier_live: tierLive,
    audi_window_days_remaining_live: audiDaysRemaining,
    audi_minimum_met_flag: audiMinMet,
    procedural_irregularity_flag_live: proceduralIrregularity,
    accrued_interest_zar_live: interestLive,
    recovery_pct_live: recoveryPctLive,
    repeat_offender_score_live: repeatScore,
    repeat_offender_flag_live: repeatFlag,
    predicted_recovery_days_live: predictedDays,
    reportable_per_spec: isReportable(tier),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const penalty_tier      = c.req.query('penalty_tier');
  const status            = c.req.query('status');
  const allegation_class  = c.req.query('allegation_class');
  const respondent        = c.req.query('respondent_party_id');
  const enforcement_step  = c.req.query('enforcement_step');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');
  const procedural        = c.req.query('procedural_irregularity');
  const repeat_offender   = c.req.query('repeat_offender');

  let sql = 'SELECT * FROM oe_enforcement_actions WHERE 1=1';
  const binds: unknown[] = [];
  if (penalty_tier)     { sql += ' AND penalty_tier = ?';     binds.push(penalty_tier); }
  if (status)           { sql += ' AND chain_status = ?';     binds.push(status); }
  if (allegation_class) { sql += ' AND allegation_class = ?'; binds.push(allegation_class); }
  if (respondent)       { sql += ' AND respondent_party_id = ?'; binds.push(respondent); }
  if (enforcement_step) { sql += ' AND enforcement_step = ?'; binds.push(enforcement_step); }

  sql += ' ORDER BY datetime(case_opened_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<EnforcementActionRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);
  if (procedural === 'true') items = items.filter((r) => r.procedural_irregularity_flag_live);
  if (repeat_offender === 'true') items = items.filter((r) => r.repeat_offender_flag_live);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_respondent: Record<string, number> = {};
  const by_enforcement_step: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const r of items) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + 1;
    by_tier[r.penalty_tier] = (by_tier[r.penalty_tier] || 0) + 1;
    by_class[r.allegation_class] = (by_class[r.allegation_class] || 0) + 1;
    by_respondent[r.respondent_party_id] = (by_respondent[r.respondent_party_id] || 0) + 1;
    const step = r.enforcement_step || 'none';
    by_enforcement_step[step] = (by_enforcement_step[step] || 0) + 1;
    by_urgency[r.urgency_band] = (by_urgency[r.urgency_band] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const paid_count          = items.filter((i) => i.chain_status === 'paid').length;
  const dismissed_count     = items.filter((i) => i.chain_status === 'dismissed').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const appealed_count      = items.filter((i) => i.chain_status === 'appealed').length;
  const enforced_count      = items.filter((i) => i.chain_status === 'enforced_via_court').length;
  const breached_count      = items.filter((i) => i.sla_breached).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const signature_count     = items.filter((i) => i.signature_class_flag).length;
  const floor_applied_count = items.filter((i) => i.floor_at_severe_class_flag).length;
  const procedural_irregularity_count = items.filter((i) => i.procedural_irregularity_flag_live).length;
  const repeat_offender_count = items.filter((i) => i.repeat_offender_flag_live).length;
  const total_proposed_zar = items.reduce((s, i) => s + (i.proposed_penalty_total_zar_live || 0), 0);
  const total_imposed_zar  = items.reduce((s, i) => s + (i.imposed_penalty_zar || 0), 0);
  const total_recovered_zar = items.reduce((s, i) => s + (i.recovered_zar || 0), 0);
  const total_interest_zar = items.reduce((s, i) => s + (i.accrued_interest_zar_live || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_class,
      by_respondent,
      by_enforcement_step,
      by_urgency,
      open_count,
      paid_count,
      dismissed_count,
      withdrawn_count,
      appealed_count,
      enforced_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      floor_applied_count,
      procedural_irregularity_count,
      repeat_offender_count,
      total_proposed_zar,
      total_imposed_zar,
      total_recovered_zar,
      total_interest_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_enforcement_actions WHERE id = ?').bind(id).first<EnforcementActionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_enforcement_actions_events WHERE case_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EnforcementActionEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface DraftBody {
  allegations_basis?: string;
  allegation_summary?: string;
  era_section_cited?: string;
  offence_count?: number;
  proposed_penalty_per_offence_zar?: number;
  notes?: string;
}
interface ServeBody { serve_ref?: string; notes?: string; }
interface OpenRepBody {
  representations_opened_at?: string;
  notes?: string;
}
interface HoldHearingBody {
  hearing_ref?: string;
  hearing_held_flag?: number;
  reasoned_refusal_flag?: number;
  notes?: string;
}
interface MakeDeterminationBody {
  determination_ref?: string;
  determination_liable_flag?: number;
  determination_basis?: string;
  determination_summary?: string;
  determination_date?: string;
  notes?: string;
}
interface ImposePenaltyBody {
  penalty_ref?: string;
  imposed_penalty_zar?: number;
  payment_due_date?: string;
  penalty_basis?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface RecordPaymentBody {
  payment_ref?: string;
  recovered_zar?: number;
  notes?: string;
}
interface LodgeAppealBody {
  appeal_ref?: string;
  appeal_forum?: string;
  appeal_filed_at?: string;
  appeal_basis?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface InitiateEnforcementBody {
  enforcement_ref?: string;
  enforcement_step?: string;
  enforcement_step_at?: string;
  enforcement_basis?: string;
  days_overdue?: number;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface DismissBody { reason_code?: string; notes?: string; }
interface WithdrawBody { reason_code?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: EnforcementActionAction,
  bodyHandler?: (row: EnforcementActionRow, body: Record<string, unknown>) => Partial<EnforcementActionRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_enforcement_actions WHERE id = ?').bind(id).first<EnforcementActionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier RE-DERIVED on every transition from current proposed_penalty_total
  // with floor-at-severe override for safety_violation / repeat_offender /
  // systemic_market_abuse (W93 distinctive class-floor).
  const perOff = (overrides.proposed_penalty_per_offence_zar as number | undefined) ?? row.proposed_penalty_per_offence_zar;
  const offCount = (overrides.offence_count as number | undefined) ?? row.offence_count;
  const allegationClass = (overrides.allegation_class as AllegationClass | undefined) ?? row.allegation_class;
  const cappedPerOff = cappedPenaltyPerOffenceZar(perOff);
  const total = totalPenaltyZar(perOff, offCount);
  const tier = tierFromPenalty(total, allegationClass);
  overrides.proposed_penalty_per_offence_zar = cappedPerOff;
  overrides.proposed_penalty_total_zar = total;
  overrides.penalty_tier = tier;
  overrides.authority_required = authorityFor(tier);

  // Procedural-irregularity flag — recomputed from current state.
  const hearingRequested = (overrides.hearing_requested_flag as number | undefined) ?? row.hearing_requested_flag;
  const hearingHeld = (overrides.hearing_held_flag as number | undefined) ?? row.hearing_held_flag;
  const reasonedRefusal = (overrides.reasoned_refusal_flag as number | undefined) ?? row.reasoned_refusal_flag;
  overrides.procedural_irregularity_flag = proceduralIrregularityFlag(
    tier, hearingRequested === 1, hearingHeld === 1 || reasonedRefusal === 1,
  ) ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const liable = (overrides.determination_liable_flag as number | undefined) ?? row.determination_liable_flag;
  const crosses = actionCrossesRegulator(action, tier, allegationClass, liable === 1);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

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
    `UPDATE oe_enforcement_actions SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `enf_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action, allegationClass, tier);
  await c.env.DB.prepare(
    'INSERT INTO oe_enforcement_actions_events (id, case_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'enforcement_action',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      penalty_tier: tier,
      allegation_class: allegationClass,
      chain_status: to,
      from_status: row.chain_status,
      action,
      reason_code: reasonCode,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_enforcement_actions WHERE id = ?').bind(id).first<EnforcementActionRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/draft-allegations', async (c) => transition(c, 'draft_allegations', (_row, body) => {
  const b = body as Partial<DraftBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.allegations_basis === 'string') out.allegations_basis = b.allegations_basis;
  if (typeof b.allegation_summary === 'string') out.allegation_summary = b.allegation_summary;
  if (typeof b.era_section_cited === 'string')  out.era_section_cited = b.era_section_cited;
  if (typeof b.offence_count === 'number')      out.offence_count = b.offence_count;
  if (typeof b.proposed_penalty_per_offence_zar === 'number') {
    out.proposed_penalty_per_offence_zar = b.proposed_penalty_per_offence_zar;
  }
  return out;
}));

app.post('/:id/serve-allegations', async (c) => transition(c, 'serve_allegations', (_row, body) => {
  const b = body as Partial<ServeBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.serve_ref === 'string') out.serve_ref = b.serve_ref;
  return out;
}));

app.post('/:id/open-representations', async (c) => transition(c, 'open_representations', (_row, body) => {
  const b = body as Partial<OpenRepBody>;
  const out: Partial<EnforcementActionRow> = {};
  out.representations_opened_at = b.representations_opened_at || new Date().toISOString();
  return out;
}));

app.post('/:id/hold-hearing', async (c) => transition(c, 'hold_hearing', (_row, body) => {
  const b = body as Partial<HoldHearingBody>;
  const out: Partial<EnforcementActionRow> = { hearing_held_flag: 1 };
  if (typeof b.hearing_ref === 'string') out.hearing_ref = b.hearing_ref;
  if (typeof b.reasoned_refusal_flag === 'number') out.reasoned_refusal_flag = b.reasoned_refusal_flag;
  return out;
}));

app.post('/:id/make-determination', async (c) => transition(c, 'make_determination', (_row, body) => {
  const b = body as Partial<MakeDeterminationBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.determination_ref === 'string') out.determination_ref = b.determination_ref;
  if (typeof b.determination_liable_flag === 'number') out.determination_liable_flag = b.determination_liable_flag;
  if (typeof b.determination_basis === 'string') out.determination_basis = b.determination_basis;
  if (typeof b.determination_summary === 'string') out.determination_summary = b.determination_summary;
  out.determination_date = b.determination_date || new Date().toISOString();
  return out;
}));

app.post('/:id/impose-penalty', async (c) => transition(c, 'impose_penalty', (row, body) => {
  const b = body as Partial<ImposePenaltyBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.penalty_ref === 'string') out.penalty_ref = b.penalty_ref;
  if (typeof b.imposed_penalty_zar === 'number') {
    out.imposed_penalty_zar = b.imposed_penalty_zar;
  } else if (row.imposed_penalty_zar == null) {
    out.imposed_penalty_zar = row.proposed_penalty_total_zar;
  }
  if (typeof b.payment_due_date === 'string') out.payment_due_date = b.payment_due_date;
  if (typeof b.penalty_basis === 'string') out.penalty_basis = b.penalty_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/record-payment', async (c) => transition(c, 'record_payment', (row, body) => {
  const b = body as Partial<RecordPaymentBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.payment_ref === 'string') out.payment_ref = b.payment_ref;
  if (typeof b.recovered_zar === 'number') {
    out.recovered_zar = b.recovered_zar;
  } else if (row.imposed_penalty_zar != null && row.recovered_zar < row.imposed_penalty_zar) {
    out.recovered_zar = row.imposed_penalty_zar;
  }
  return out;
}));

app.post('/:id/lodge-appeal', async (c) => transition(c, 'lodge_appeal', (_row, body) => {
  const b = body as Partial<LodgeAppealBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.appeal_ref === 'string') out.appeal_ref = b.appeal_ref;
  if (typeof b.appeal_forum === 'string') out.appeal_forum = b.appeal_forum;
  out.appeal_filed_at = b.appeal_filed_at || new Date().toISOString();
  if (typeof b.appeal_basis === 'string') out.appeal_basis = b.appeal_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/initiate-enforcement', async (c) => transition(c, 'initiate_enforcement', (_row, body) => {
  const b = body as Partial<InitiateEnforcementBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.enforcement_ref === 'string') out.enforcement_ref = b.enforcement_ref;
  if (typeof b.enforcement_step === 'string') out.enforcement_step = b.enforcement_step;
  out.enforcement_step_at = b.enforcement_step_at || new Date().toISOString();
  if (typeof b.enforcement_basis === 'string') out.enforcement_basis = b.enforcement_basis;
  if (typeof b.days_overdue === 'number') out.days_overdue = b.days_overdue;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/dismiss', async (c) => transition(c, 'dismiss', (_row, body) => {
  const b = body as Partial<DismissBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<{ reason_code?: string }>;
  const out: Partial<EnforcementActionRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function enforcementActionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_enforcement_actions
     WHERE chain_status NOT IN ('paid','dismissed','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<EnforcementActionRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_enforcement_actions
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `enf_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_enforcement_actions_events (id, case_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'enforcement_action.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.penalty_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (isHighTier(row.penalty_tier)) {
      await fireCascade({
        event: 'enforcement_action.sla_breached',
        actor_id: 'system',
        entity_type: 'enforcement_action',
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
