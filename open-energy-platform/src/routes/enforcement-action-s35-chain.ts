// ===========================================================================
// Wave 106 - Regulator NERSA Section 35 Administrative Enforcement Action &
// Fine Imposition chain. Mounted at /api/regulator/enforcement-action-s35/chain.
//
// 10th Regulator chain. The formal NERSA s35 enforcement-action lifecycle:
// NOTICE -> RESPONSE -> ADJUDICATION -> SANCTION -> APPEAL -> settled.
// Sister of W40 (compliance inspection finds non-conformance) + W66
// (complaints intake) + W31 (disposition exit). Coexists with W93
// enforcement-actions (admin-penalty audi/PAJA layer) at a different surface
// - W106 is the full s35 state machine with licence-suspension /
// licence-revocation sanctions + appeals + gazette publication.
//
// Beats FCA Enforcement & Decision Notice / ESMA Sanctions / FERC Enforcement
// / ACCC enforcement / DG-COMP / Eskom IPP non-compliance / DOJ Energy /
// OFCOM enforcement / FSCA Administrative Sanctions Committee - every one of
// these surfaces enforcement as a case-management spreadsheet with email
// reminders; W106 makes it a procedural state-machine with PAJA-fairness
// LIVE flag, gazette-required LIVE flag, appeal-window countdown,
// repeat-offender index, and 4-step authority ladder culminating at the
// full NERSA Council for licence revocation.
//
// LIVE battery on every row: sanction_quantum_zar_live, appeal_status_band,
// days_to_appeal_window_close, adjudication_progress_pct,
// repeat_offence_count, cumulative_sanctions_history_zar,
// enforcement_compliance_index (0-130), urgency_band, authority_required,
// bridges_to_inspection / complaint / licence_renewal_chain,
// paja_fairness_at_risk_flag, gazette_publication_required.
//
// Write {admin, regulator}. READ all 9 personas. actor_party derived from
// ACTION: NERSA writes (draft / issue / start_adjudication / adjudicate /
// impose_sanction / decide_appeal / commence_enforcement / withdraw /
// cancel / archive); respondent writes (acknowledge / submit_response /
// lodge_appeal); either mark_settled (bilateral).
//
// SIGNATURE regulator crossings (ERA s35 + PAJA s5 + Companies Act s38 +
// Constitution s33):
//   impose_sanction         EVERY tier when licence_revocation_proposed=TRUE
//                            (W106 signature hard line).
//   commence_enforcement    EVERY tier on strategic (Gazette publication).
//   commence_enforcement    EVERY tier when triggering criminal_intelligence
//                            (SAPS handoff).
//   mark_settled            material+strategic when sanction_type in
//                            {licence_suspended, licence_revoked,
//                             criminal_referral}.
//   sla_breached            material+strategic (PAJA fairness exposure).
// ===========================================================================

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  tierForQuantum,
  effectiveTier,
  quantumBase,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  authorityRequired,
  urgencyBand,
  appealStatusBand,
  daysToAppealWindowClose,
  adjudicationProgressPct,
  enforcementComplianceIndex,
  pajaFairnessAtRiskFlag,
  gazettePublicationRequired,
  bridgesToInspectionChain,
  bridgesToComplaintChain,
  bridgesToLicenceRenewalChain,
  deriveSlaDeadline,
  slaDaysRemaining,
  SLA_MINUTES,
  type EnfStatus,
  type EnfAction,
  type EnfTier,
  type EnfFloorFlags,
} from '../utils/enforcement-action-s35-spec';

const READ_ROLES = new Set([
  'admin', 'regulator',
  'grid_operator', 'ipp_developer', 'offtaker', 'trader', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'regulator']);

interface EnfRow {
  id: string;
  enforcement_case_number: string;
  respondent_party_id: string;
  respondent_party_label: string | null;
  respondent_licence_id: string | null;
  respondent_licence_class: string | null;
  triggering_event_type: string | null;
  triggering_inspection_id: string | null;
  triggering_complaint_id: string | null;
  triggering_sla_breach_chain_ref: string | null;
  triggering_reason_summary_text: string | null;
  notice_drafted_by_actor_id: string | null;
  notice_issued_at: string | null;
  notice_reference: string | null;
  notice_legal_provisions: string | null;
  respondent_response_due_at: string | null;
  respondent_responded_at: string | null;
  respondent_position_text: string | null;
  adjudication_panel_label: string | null;
  adjudication_started_at: string | null;
  adjudication_completed_at: string | null;
  adjudication_decision_text: string | null;
  sanction_imposed_at: string | null;
  sanction_type: string | null;
  sanction_quantum_zar: number;
  sanction_effective_at: string | null;
  sanction_end_at: string | null;
  appeal_window_open_at: string | null;
  appeal_window_close_at: string | null;
  appeal_lodged_at: string | null;
  appeal_lodged_by_actor_id: string | null;
  appeal_grounds_text: string | null;
  appeal_outcome: string | null;
  appeal_decided_at: string | null;
  re_adjudication_decision_text: string | null;
  enforcement_started_at: string | null;
  enforcement_method: string | null;
  amount_collected_zar: number;
  settled_at: string | null;
  withdrawn_at: string | null;
  withdrawal_reason_code: string | null;
  cancellation_reason_text: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  is_reportable: number;
  sanction_quantum_zar_floor: number;
  enforcement_floor_flag_licence_revocation_proposed: number;
  enforcement_floor_flag_repeat_offender_within_36mo: number;
  enforcement_floor_flag_public_safety_impact_strict: number;
  enforcement_floor_flag_financial_quantum_over_50m: number;
  enforcement_floor_flag_criminal_referral_recommended: number;
  repeat_offender_count_36mo: number;
  cumulative_sanctions_history_zar: number;
  current_tier: EnfTier;
  authority_required: string | null;
  urgency_band: string | null;
  title: string | null;
  narrative: string | null;
  chain_status: EnfStatus;
  triggered_at: string | null;
  notice_drafted_at: string | null;
  respondent_acknowledged_at: string | null;
  response_received_at: string | null;
  adjudication_in_progress_at: string | null;
  adjudicated_at: string | null;
  appeal_window_open_state_at: string | null;
  appealed_at: string | null;
  re_adjudicated_at: string | null;
  enforcement_in_progress_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by_actor_id: string;
  updated_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

interface EnfEventRow {
  id: string;
  action_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<EnfStatus, keyof EnfRow | null> = {
  triggered:                'triggered_at',
  notice_drafted:           'notice_drafted_at',
  notice_issued:            'notice_issued_at',
  respondent_acknowledged:  'respondent_acknowledged_at',
  response_received:        'response_received_at',
  adjudication_in_progress: 'adjudication_in_progress_at',
  adjudicated:              'adjudicated_at',
  sanction_imposed:         'sanction_imposed_at',
  appeal_window_open:       'appeal_window_open_state_at',
  appealed:                 'appealed_at',
  re_adjudicated:           're_adjudicated_at',
  enforcement_in_progress:  'enforcement_in_progress_at',
  settled:                  'settled_at',
  archived:                 'archived_at',
  withdrawn:                'withdrawn_at',
  cancelled:                'cancelled_at',
};

function statusEnteredAt(row: EnfRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  const iso = col ? (row[col] as string | null) : null;
  if (iso) return new Date(iso);
  return row.triggered_at ? new Date(row.triggered_at) : null;
}

function rowFloorFlags(row: EnfRow): EnfFloorFlags {
  return {
    enforcement_floor_flag_licence_revocation_proposed:  row.enforcement_floor_flag_licence_revocation_proposed,
    enforcement_floor_flag_repeat_offender_within_36mo:  row.enforcement_floor_flag_repeat_offender_within_36mo,
    enforcement_floor_flag_public_safety_impact_strict:  row.enforcement_floor_flag_public_safety_impact_strict,
    enforcement_floor_flag_financial_quantum_over_50m:   row.enforcement_floor_flag_financial_quantum_over_50m,
    enforcement_floor_flag_criminal_referral_recommended: row.enforcement_floor_flag_criminal_referral_recommended,
  };
}

function decorate(row: EnfRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaLeft = slaDaysRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaLeft);
  const authority = authorityRequired(tier);

  const quantumLive = quantumBase(row.sanction_quantum_zar, row.sanction_quantum_zar_floor);
  const appealBand = appealStatusBand(
    status,
    row.appeal_lodged_at,
    row.appeal_outcome,
    row.appeal_window_close_at,
    now,
  );
  const daysToClose = daysToAppealWindowClose(row.appeal_window_close_at, now);
  const progress = adjudicationProgressPct(status);

  const adjudicationCompleted = !!row.adjudication_completed_at;
  const appealHandledOrSkip = !!row.appeal_decided_at || (!row.appeal_lodged_at && progress >= 75);
  const compliance = enforcementComplianceIndex({
    notice_issued:           !!row.notice_issued_at,
    response_received:       !!row.response_received_at,
    adjudication_completed:  adjudicationCompleted,
    sanction_imposed:        !!row.sanction_imposed_at,
    appeal_handled_or_skip:  appealHandledOrSkip,
    enforcement_started:     !!row.enforcement_started_at,
    settled:                 !!row.settled_at,
    no_withdrawal_bonus:     !row.withdrawn_at,
    first_pass_clean_bonus:  !!row.settled_at && !row.appeal_lodged_at && !row.withdrawn_at,
  });

  const paja = pajaFairnessAtRiskFlag(row.sla_breached, tier);
  const gazette = gazettePublicationRequired(tier, row.sanction_type);

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    sla_days_remaining_live: slaLeft,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sanction_quantum_zar_live: quantumLive,
    appeal_status_band_live: appealBand,
    days_to_appeal_window_close_live: daysToClose,
    adjudication_progress_pct_live: progress,
    repeat_offence_count_live: Number(row.repeat_offender_count_36mo ?? 0),
    cumulative_sanctions_history_zar_live: Number(row.cumulative_sanctions_history_zar ?? 0),
    enforcement_compliance_index_live: compliance,
    urgency_band_live: urgency,
    authority_required_live: authority,
    bridges_to_inspection_chain_live: bridgesToInspectionChain(row.triggering_inspection_id),
    bridges_to_complaint_chain_live: bridgesToComplaintChain(row.triggering_complaint_id),
    bridges_to_licence_renewal_chain_live: bridgesToLicenceRenewalChain(row.respondent_licence_id),
    paja_fairness_at_risk_flag_live: paja,
    gazette_publication_required_live: gazette,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier        = c.req.query('tier');
  const status      = c.req.query('status');
  const respondent  = c.req.query('respondent_party_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');
  const trigger     = c.req.query('triggering_event_type');

  let sql = 'SELECT * FROM oe_enforcement_action WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)       { sql += ' AND current_tier = ?';            binds.push(tier); }
  if (status)     { sql += ' AND chain_status = ?';            binds.push(status); }
  if (respondent) { sql += ' AND respondent_party_id = ?';     binds.push(respondent); }
  if (trigger)    { sql += ' AND triggering_event_type = ?';   binds.push(trigger); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<EnfRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_trigger: Record<string, number> = {};
  const by_sanction_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    if (i.triggering_event_type) by_trigger[i.triggering_event_type] = (by_trigger[i.triggering_event_type] || 0) + 1;
    if (i.sanction_type) by_sanction_type[i.sanction_type] = (by_sanction_type[i.sanction_type] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const strategic_count     = items.filter((i) => i.current_tier === 'strategic').length;
  const appeals_open_count  = items.filter((i) => i.chain_status === 'appeal_window_open' || i.chain_status === 'appealed').length;
  const paja_at_risk_count  = items.filter((i) => i.paja_fairness_at_risk_flag_live).length;
  const gazette_count       = items.filter((i) => i.gazette_publication_required_live).length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const inspection_bridged  = items.filter((i) => i.bridges_to_inspection_chain_live).length;
  const complaint_bridged   = items.filter((i) => i.bridges_to_complaint_chain_live).length;
  const total_sanction_zar  = items.reduce((s, i) => s + (i.sanction_quantum_zar_live || 0), 0);
  const total_collected_zar = items.reduce((s, i) => s + (i.amount_collected_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_trigger,
      by_sanction_type,
      active_count,
      strategic_count,
      appeals_open_count,
      paja_at_risk_count,
      gazette_required_count: gazette_count,
      breached: breached_count,
      reportable_total,
      inspection_bridged_count: inspection_bridged,
      complaint_bridged_count: complaint_bridged,
      total_sanction_zar,
      total_collected_zar,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, sanction_type, triggering_event_type,
            regulator_relevant, sla_breached, COUNT(*) as n,
            SUM(COALESCE(sanction_quantum_zar, 0)) as total_sanction,
            SUM(COALESCE(amount_collected_zar, 0)) as total_collected
     FROM oe_enforcement_action
     GROUP BY chain_status, current_tier, sanction_type, triggering_event_type,
              regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; sanction_type: string | null;
    triggering_event_type: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
    total_sanction: number; total_collected: number;
  }>();

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_sanction_type: Record<string, number> = {};
  const by_trigger: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  let total_sanction_zar = 0;
  let total_collected_zar = 0;
  let total = 0;
  let appeals_pending = 0;
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.sanction_type) by_sanction_type[r.sanction_type] = (by_sanction_type[r.sanction_type] || 0) + r.n;
    if (r.triggering_event_type) by_trigger[r.triggering_event_type] = (by_trigger[r.triggering_event_type] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
    total_sanction_zar += Number(r.total_sanction || 0);
    total_collected_zar += Number(r.total_collected || 0);
    total += r.n;
    if (r.chain_status === 'appeal_window_open' || r.chain_status === 'appealed') {
      appeals_pending += r.n;
    }
  }

  return c.json({
    success: true,
    data: {
      total,
      by_status,
      by_tier,
      by_sanction_type,
      by_trigger,
      by_regulator_relevant,
      by_sla_breached,
      total_sanction_zar,
      total_collected_zar,
      appeals_pending,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_enforcement_action WHERE id = ?').bind(id).first<EnfRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_enforcement_action_events WHERE action_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EnfEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
}

interface CreateBody extends CommonBody {
  respondent_party_id?: string;
  respondent_party_label?: string;
  respondent_licence_id?: string;
  respondent_licence_class?: string;
  triggering_event_type?: string;
  triggering_inspection_id?: string;
  triggering_complaint_id?: string;
  triggering_sla_breach_chain_ref?: string;
  triggering_reason_summary_text?: string;
  sanction_quantum_zar?: number;
  sanction_quantum_zar_floor?: number;
  enforcement_floor_flag_licence_revocation_proposed?: boolean | number;
  enforcement_floor_flag_repeat_offender_within_36mo?: boolean | number;
  enforcement_floor_flag_public_safety_impact_strict?: boolean | number;
  enforcement_floor_flag_financial_quantum_over_50m?: boolean | number;
  enforcement_floor_flag_criminal_referral_recommended?: boolean | number;
  repeat_offender_count_36mo?: number;
  cumulative_sanctions_history_zar?: number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface DraftNoticeBody extends CommonBody {
  notice_reference?: string;
  notice_legal_provisions?: string;
}
interface IssueNoticeBody extends CommonBody {
  notice_reference?: string;
  respondent_response_due_at?: string;
}
interface AckNoticeBody extends CommonBody {}
interface SubmitResponseBody extends CommonBody {
  respondent_position_text?: string;
}
interface StartAdjBody extends CommonBody {
  adjudication_panel_label?: string;
}
interface AdjudicateBody extends CommonBody {
  adjudication_decision_text?: string;
}
interface ImposeSanctionBody extends CommonBody {
  sanction_type?: string;
  sanction_quantum_zar?: number;
  sanction_effective_at?: string;
  sanction_end_at?: string;
  enforcement_floor_flag_licence_revocation_proposed?: boolean | number;
}
interface OpenAppealWindowBody extends CommonBody {
  appeal_window_close_at?: string;
}
interface LodgeAppealBody extends CommonBody {
  appeal_grounds_text?: string;
}
interface DecideAppealBody extends CommonBody {
  appeal_outcome?: string;
  re_adjudication_decision_text?: string;
}
interface ReAdjudicateBody extends CommonBody {
  re_adjudication_decision_text?: string;
}
interface CommenceEnforcementBody extends CommonBody {
  enforcement_method?: string;
}
interface MarkSettledBody extends CommonBody {
  amount_collected_zar?: number;
}
interface ArchiveBody extends CommonBody {}
interface WithdrawBody extends CommonBody {
  withdrawal_reason_code?: string;
}
interface CancelBody extends CommonBody {
  cancellation_reason_text?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<EnfRow>): Partial<EnfRow> {
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// === Create endpoint ======================================================
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `enf-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `ENF-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const flags: EnfFloorFlags = {
    enforcement_floor_flag_licence_revocation_proposed:  toFlag(body.enforcement_floor_flag_licence_revocation_proposed) ?? 0,
    enforcement_floor_flag_repeat_offender_within_36mo:  toFlag(body.enforcement_floor_flag_repeat_offender_within_36mo) ?? 0,
    enforcement_floor_flag_public_safety_impact_strict:  toFlag(body.enforcement_floor_flag_public_safety_impact_strict) ?? 0,
    enforcement_floor_flag_financial_quantum_over_50m:   toFlag(body.enforcement_floor_flag_financial_quantum_over_50m) ?? 0,
    enforcement_floor_flag_criminal_referral_recommended: toFlag(body.enforcement_floor_flag_criminal_referral_recommended) ?? 0,
  };
  const quantum = Number(body.sanction_quantum_zar ?? 0);
  const quantumFloor = Number(body.sanction_quantum_zar_floor ?? 0);
  const base = quantumBase(quantum, quantumFloor);
  const rawTier = tierForQuantum(base);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 1;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = deriveSlaDeadline('triggered', tier, now);

  await c.env.DB.prepare(
    `INSERT INTO oe_enforcement_action (
      id, enforcement_case_number,
      respondent_party_id, respondent_party_label,
      respondent_licence_id, respondent_licence_class,
      triggering_event_type, triggering_inspection_id, triggering_complaint_id,
      triggering_sla_breach_chain_ref, triggering_reason_summary_text,
      sanction_quantum_zar, sanction_quantum_zar_floor,
      enforcement_floor_flag_licence_revocation_proposed,
      enforcement_floor_flag_repeat_offender_within_36mo,
      enforcement_floor_flag_public_safety_impact_strict,
      enforcement_floor_flag_financial_quantum_over_50m,
      enforcement_floor_flag_criminal_referral_recommended,
      repeat_offender_count_36mo, cumulative_sanctions_history_zar,
      current_tier, authority_required, urgency_band,
      title, narrative,
      regulator_relevant, regulator_reason_text, is_reportable,
      chain_status, triggered_at,
      sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by_actor_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.respondent_party_id ?? 'respondent-unknown', body.respondent_party_label ?? null,
    body.respondent_licence_id ?? null, body.respondent_licence_class ?? null,
    body.triggering_event_type ?? null, body.triggering_inspection_id ?? null, body.triggering_complaint_id ?? null,
    body.triggering_sla_breach_chain_ref ?? null, body.triggering_reason_summary_text ?? null,
    quantum, quantumFloor,
    flags.enforcement_floor_flag_licence_revocation_proposed ? 1 : 0,
    flags.enforcement_floor_flag_repeat_offender_within_36mo ? 1 : 0,
    flags.enforcement_floor_flag_public_safety_impact_strict ? 1 : 0,
    flags.enforcement_floor_flag_financial_quantum_over_50m ? 1 : 0,
    flags.enforcement_floor_flag_criminal_referral_recommended ? 1 : 0,
    Number(body.repeat_offender_count_36mo ?? 0),
    Number(body.cumulative_sanctions_history_zar ?? 0),
    tier, authorityRequired(tier), urgencyBand(tier, 30),
    body.title ?? null, body.narrative ?? null,
    regRelevant, body.regulator_reason_text ?? null, isReportable(tier) ? 1 : 0,
    'triggered', nowIso,
    sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `enforcement_action_s35_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_enforcement_action_events (id, action_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'enforcement_action.triggered', null, 'triggered',
    user.id, partyForAction('trigger'),
    typeof body.notes === 'string' ? body.notes : null,
    JSON.stringify({ trigger: body.triggering_event_type }),
    nowIso,
  ).run();

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_enforcement_action WHERE id = ?').bind(id).first<EnfRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

async function transition(
  c: Context<HonoEnv>,
  action: EnfAction,
  bodyHandler?: (row: EnfRow, body: Record<string, unknown>) => Partial<EnfRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_enforcement_action WHERE id = ?').bind(id).first<EnfRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current quantum + 5 floor flags (may have been
  // updated in this transition's body).
  const quantum = (overrides.sanction_quantum_zar as number | undefined) ?? row.sanction_quantum_zar;
  const quantumFloor = (overrides.sanction_quantum_zar_floor as number | undefined) ?? row.sanction_quantum_zar_floor;
  const base = quantumBase(quantum, quantumFloor);
  const rawTier = tierForQuantum(base);
  const floorFlags: EnfFloorFlags = {
    enforcement_floor_flag_licence_revocation_proposed:
      (overrides.enforcement_floor_flag_licence_revocation_proposed as number | undefined)
        ?? row.enforcement_floor_flag_licence_revocation_proposed,
    enforcement_floor_flag_repeat_offender_within_36mo:
      (overrides.enforcement_floor_flag_repeat_offender_within_36mo as number | undefined)
        ?? row.enforcement_floor_flag_repeat_offender_within_36mo,
    enforcement_floor_flag_public_safety_impact_strict:
      (overrides.enforcement_floor_flag_public_safety_impact_strict as number | undefined)
        ?? row.enforcement_floor_flag_public_safety_impact_strict,
    enforcement_floor_flag_financial_quantum_over_50m:
      (overrides.enforcement_floor_flag_financial_quantum_over_50m as number | undefined)
        ?? row.enforcement_floor_flag_financial_quantum_over_50m,
    enforcement_floor_flag_criminal_referral_recommended:
      (overrides.enforcement_floor_flag_criminal_referral_recommended as number | undefined)
        ?? row.enforcement_floor_flag_criminal_referral_recommended,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = deriveSlaDeadline(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  overrides.urgency_band = urgencyBand(tier, slaDaysRemaining(to, tier, now, now));
  overrides.updated_by_actor_id = user.id;

  // SIGNATURE crossings.
  const sanctionTypeNow = (overrides.sanction_type as string | undefined) ?? row.sanction_type;
  const triggeringEventTypeNow = (overrides.triggering_event_type as string | undefined) ?? row.triggering_event_type;
  const crosses = crossesIntoRegulator(action, tier, {
    licence_revocation_proposed: floorFlags.enforcement_floor_flag_licence_revocation_proposed,
    criminal_referral_recommended: floorFlags.enforcement_floor_flag_criminal_referral_recommended,
    triggering_event_type: triggeringEventTypeNow,
    sanction_type: sanctionTypeNow,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_enforcement_action SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `enforcement_action_s35_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_enforcement_action_events (id, action_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'enforcement_action_s35',
      entity_id: id,
      data: {
        ...row,
        ...overrides,
        current_tier: tier,
        chain_status: to,
        from_status: row.chain_status,
        action,
        crosses_into_regulator: crosses,
      },
      env: c.env,
    });
  }

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_enforcement_action WHERE id = ?').bind(id).first<EnfRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// === Action endpoints (16) ================================================
app.post('/:id/draft-notice', async (c) => transition(c, 'draft_notice', (_row, body) => {
  const b = body as Partial<DraftNoticeBody>;
  const out: Partial<EnfRow> = { notice_drafted_by_actor_id: null };
  if (typeof b.notice_reference === 'string')        out.notice_reference = b.notice_reference;
  if (typeof b.notice_legal_provisions === 'string') out.notice_legal_provisions = b.notice_legal_provisions;
  return applyCommon(b, out);
}));

app.post('/:id/issue-notice', async (c) => transition(c, 'issue_notice', (_row, body) => {
  const b = body as Partial<IssueNoticeBody>;
  const out: Partial<EnfRow> = { notice_issued_at: new Date().toISOString() };
  if (typeof b.notice_reference === 'string')         out.notice_reference = b.notice_reference;
  if (typeof b.respondent_response_due_at === 'string') out.respondent_response_due_at = b.respondent_response_due_at;
  else {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 21);
    out.respondent_response_due_at = t.toISOString();
  }
  return applyCommon(b, out);
}));

app.post('/:id/acknowledge-notice', async (c) => transition(c, 'acknowledge_notice', (_row, body) =>
  applyCommon(body as Partial<AckNoticeBody>, {}),
));

app.post('/:id/submit-response', async (c) => transition(c, 'submit_response', (_row, body) => {
  const b = body as Partial<SubmitResponseBody>;
  const out: Partial<EnfRow> = { respondent_responded_at: new Date().toISOString() };
  if (typeof b.respondent_position_text === 'string') out.respondent_position_text = b.respondent_position_text;
  return applyCommon(b, out);
}));

app.post('/:id/start-adjudication', async (c) => transition(c, 'start_adjudication', (_row, body) => {
  const b = body as Partial<StartAdjBody>;
  const out: Partial<EnfRow> = { adjudication_started_at: new Date().toISOString() };
  if (typeof b.adjudication_panel_label === 'string') out.adjudication_panel_label = b.adjudication_panel_label;
  return applyCommon(b, out);
}));

app.post('/:id/adjudicate', async (c) => transition(c, 'adjudicate', (_row, body) => {
  const b = body as Partial<AdjudicateBody>;
  const out: Partial<EnfRow> = { adjudication_completed_at: new Date().toISOString() };
  if (typeof b.adjudication_decision_text === 'string') out.adjudication_decision_text = b.adjudication_decision_text;
  return applyCommon(b, out);
}));

app.post('/:id/impose-sanction', async (c) => transition(c, 'impose_sanction', (_row, body) => {
  const b = body as Partial<ImposeSanctionBody>;
  const out: Partial<EnfRow> = { sanction_imposed_at: new Date().toISOString() };
  if (typeof b.sanction_type === 'string')        out.sanction_type = b.sanction_type;
  if (typeof b.sanction_quantum_zar === 'number') out.sanction_quantum_zar = b.sanction_quantum_zar;
  if (typeof b.sanction_effective_at === 'string') out.sanction_effective_at = b.sanction_effective_at;
  if (typeof b.sanction_end_at === 'string')       out.sanction_end_at = b.sanction_end_at;
  const lr = toFlag(b.enforcement_floor_flag_licence_revocation_proposed);
  if (lr !== undefined) out.enforcement_floor_flag_licence_revocation_proposed = lr;
  return applyCommon(b, out);
}));

app.post('/:id/open-appeal-window', async (c) => transition(c, 'open_appeal_window', (_row, body) => {
  const b = body as Partial<OpenAppealWindowBody>;
  const out: Partial<EnfRow> = { appeal_window_open_at: new Date().toISOString() };
  if (typeof b.appeal_window_close_at === 'string') out.appeal_window_close_at = b.appeal_window_close_at;
  else {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 30);
    out.appeal_window_close_at = t.toISOString();
  }
  return applyCommon(b, out);
}));

app.post('/:id/lodge-appeal', async (c) => transition(c, 'lodge_appeal', (_row, body) => {
  const b = body as Partial<LodgeAppealBody>;
  const out: Partial<EnfRow> = { appeal_lodged_at: new Date().toISOString() };
  if (typeof b.appeal_grounds_text === 'string') out.appeal_grounds_text = b.appeal_grounds_text;
  return applyCommon(b, out);
}));

app.post('/:id/decide-appeal', async (c) => transition(c, 'decide_appeal', (_row, body) => {
  const b = body as Partial<DecideAppealBody>;
  const out: Partial<EnfRow> = { appeal_decided_at: new Date().toISOString() };
  if (typeof b.appeal_outcome === 'string')              out.appeal_outcome = b.appeal_outcome;
  if (typeof b.re_adjudication_decision_text === 'string') out.re_adjudication_decision_text = b.re_adjudication_decision_text;
  return applyCommon(b, out);
}));

app.post('/:id/re-adjudicate', async (c) => transition(c, 're_adjudicate', (_row, body) => {
  const b = body as Partial<ReAdjudicateBody>;
  const out: Partial<EnfRow> = {};
  if (typeof b.re_adjudication_decision_text === 'string') out.re_adjudication_decision_text = b.re_adjudication_decision_text;
  return applyCommon(b, out);
}));

app.post('/:id/commence-enforcement', async (c) => transition(c, 'commence_enforcement', (_row, body) => {
  const b = body as Partial<CommenceEnforcementBody>;
  const out: Partial<EnfRow> = { enforcement_started_at: new Date().toISOString() };
  if (typeof b.enforcement_method === 'string') out.enforcement_method = b.enforcement_method;
  return applyCommon(b, out);
}));

app.post('/:id/mark-settled', async (c) => transition(c, 'mark_settled', (row, body) => {
  const b = body as Partial<MarkSettledBody>;
  const out: Partial<EnfRow> = { settled_at: new Date().toISOString() };
  if (typeof b.amount_collected_zar === 'number') {
    out.amount_collected_zar = (row.amount_collected_zar || 0) + b.amount_collected_zar;
  }
  return applyCommon(b, out);
}));

app.post('/:id/archive-action', async (c) => transition(c, 'archive_action', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/withdraw-action', async (c) => transition(c, 'withdraw_action', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<EnfRow> = {};
  if (typeof b.withdrawal_reason_code === 'string') out.withdrawal_reason_code = b.withdrawal_reason_code;
  return applyCommon(b, out);
}));

app.post('/:id/cancel-action', async (c) => transition(c, 'cancel_action', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<EnfRow> = {};
  if (typeof b.cancellation_reason_text === 'string') out.cancellation_reason_text = b.cancellation_reason_text;
  return applyCommon(b, out);
}));

// === Cron: SLA sweep (15-min) ============================================
export async function enforcementActionS35SlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_enforcement_action
     WHERE chain_status NOT IN ('settled','archived','withdrawn','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<EnfRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_enforcement_action
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `enforcement_action_s35_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_enforcement_action_events (id, action_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'enforcement_action.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'enforcement_action.sla_breached',
        actor_id: 'system',
        entity_type: 'enforcement_action_s35',
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

// === Cron: Appeal-window sweep (nightly 05:00) ============================
//
// Walks every appeal_window_open row past appeal_window_close_at without an
// appeal lodged, transitions to enforcement_in_progress (deemed upheld by
// inaction). Strategic + licence-revocation rows cross regulator (Gazette).
export async function enforcementActionS35AppealWindowSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; lapsed: number; regulator_crossed: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_enforcement_action
     WHERE chain_status = 'appeal_window_open'
       AND appeal_window_close_at IS NOT NULL
       AND appeal_lodged_at IS NULL
       AND datetime(appeal_window_close_at) < datetime(?)`,
  ).bind(nowIso).all<EnfRow>();

  const rows = rs.results || [];
  let lapsed = 0;
  let regulatorCrossed = 0;
  for (const row of rows) {
    const flags = rowFloorFlags(row);
    const tier = effectiveTier(tierForQuantum(quantumBase(row.sanction_quantum_zar, row.sanction_quantum_zar_floor)), flags);
    const crosses = crossesIntoRegulator('commence_enforcement', tier, {
      licence_revocation_proposed: flags.enforcement_floor_flag_licence_revocation_proposed,
      criminal_referral_recommended: flags.enforcement_floor_flag_criminal_referral_recommended,
      triggering_event_type: row.triggering_event_type,
      sanction_type: row.sanction_type,
    });

    const setParts: string[] = [
      'chain_status = ?',
      'enforcement_in_progress_at = ?',
      'enforcement_started_at = ?',
      'enforcement_method = ?',
      'updated_at = ?',
    ];
    const setBinds: unknown[] = [
      'enforcement_in_progress',
      nowIso,
      nowIso,
      'deemed_upheld_no_appeal',
      nowIso,
    ];
    if (crosses) {
      setParts.push('regulator_crossed_at = ?', 'is_reportable = ?');
      setBinds.push(nowIso, 1);
      regulatorCrossed++;
    }
    setBinds.push(row.id);

    await env.DB.prepare(
      `UPDATE oe_enforcement_action SET ${setParts.join(', ')} WHERE id = ?`,
    ).bind(...setBinds).run();

    lapsed++;

    const evtId = `enforcement_action_s35_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_enforcement_action_events (id, action_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'enforcement_action.enforcement_in_progress',
      row.chain_status,
      'enforcement_in_progress',
      'system',
      'system',
      `Auto-lapsed: appeal window closed without lodge (tier ${tier})`,
      JSON.stringify({ appeal_window_close_at: row.appeal_window_close_at }),
      nowIso,
    ).run();

    if (crosses) {
      await fireCascade({
        event: 'enforcement_action.enforcement_in_progress',
        actor_id: 'system',
        entity_type: 'enforcement_action_s35',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }
  }
  return { scanned: rows.length, lapsed, regulator_crossed: regulatorCrossed };
}

export default app;
