// ═══════════════════════════════════════════════════════════════════════════
// Wave 108 — Lender Loan Restructure & Amendment-and-Extend (A&E) /
// Forbearance Chain. 11th Lender chain. Mounted at
// /api/lender/loan-restructure/chain.
//
// STRUCTURED-FORBEARANCE bridge between W38 covenant certificate (point-in-
// time breach detection) + W86 DSCR monitoring (rolling coverage watch) and
// W45 default enforcement (acceleration / step-in). Without W108 every
// breach escalates straight to acceleration — that kills bankability.
// Restructure is the renegotiation runway every project-finance loan needs
// at least once in its life.
//
// 12-state P6 lifecycle:
//   trigger_event → preliminary_assessment → restructure_proposal_drafted
//     → lender_credit_committee_review → borrower_term_sheet_negotiation
//     → term_sheet_signed → legal_documentation_drafted
//     → consent_solicitation → signing → effective_date
//     → monitoring_period → completed (hard terminal)
//
// Branches:
//   credit_committee_review → restructure_proposal_drafted (revise_proposal)
//   credit_committee_review → rejected_by_committee (terminal)
//   any pre-effective state → abandoned (terminal — borrower withdraws)
//   any non-terminal state → escalated_to_default (terminal — feeds W45)
//
// Beats LMA "Amend & Extend" templates / Fitch RestructuringRating / S&P
// Recovery Ratings / Moody's Covenant Quality Index / Reorg Research
// RestructuringDB / Debtwire Restructuring / Crescendo Strategic Advisors /
// Houlihan Lokey Financial Restructuring / FTI Consulting Corporate Finance
// / AlixPartners Restructuring.
//
// Standards: LMA "Amendment & Extension" template + Basel III IFRS 9
// Stage 2/3 trigger framework + SARB Banks Act §61 (forbearance disclosure
// to Prudential Authority) + Companies Act §155 (Compromise with creditors).
//
// Write {admin, lender}. READ all 9 personas. actor_party split:
//   lender writes:           start_preliminary_assessment, draft_proposal,
//                            submit_to_credit_committee, approve_proposal,
//                            reject_proposal, draft_documentation,
//                            launch_consent_solicitation, mark_effective,
//                            monitor_compliance, complete_restructure,
//                            escalate_to_default
//   borrower writes:         trigger_restructure, revise_proposal,
//                            negotiate_term_sheet, sign_term_sheet,
//                            sign_amendment, abandon
//   syndicate_member writes: record_consent
//
// SIGNATURE crossings (LMA "Amend & Extend" + Basel III IFRS 9 + SARB
// Banks Act §61 + Companies Act §155):
//   escalate_to_default          crosses regulator EVERY tier (W108 SIGNATURE
//                                — failed restructure feeding W45 universally
//                                reportable; sister of W104 reject EVERY tier
//                                on regulator_relevant + W105 raise_dispute
//                                EVERY tier on HV_brp + W106 impose_sanction
//                                EVERY tier on licence_revocation + W107
//                                reject_order EVERY tier on credit_grade_<B)
//   submit_to_credit_committee   crosses regulator EVERY tier on systemic OR
//                                ifrs9_stage_3_at_trigger=TRUE
//                                (Companies Act s.155 Compromise trigger)
//   mark_effective               crosses regulator material+systemic
//                                (SARB Banks Act §61 large-exposure
//                                disclosure of effective restructure)
//   launch_consent_solicitation  crosses strategic only when
//                                public_bondholder_consent_required
//   sla_breached                 crosses regulator material+systemic
//
// Tier RE-DERIVED on every transition from facility_amount_zar (minor<R50m
// / standard<R500m / material<R5b / systemic>=R5b) with FLOOR-AT-MATERIAL
// on any one of 5 floor flags and FLOOR-AT-SYSTEMIC on 2+ flags OR
// public_bondholder OR sarb_large_exposure.
//
// INVERTED SLA polarity (systemic = LONGEST runway) stored as HOURS.
// LMA consent solicitations + syndicate roadshows + SARB notifications
// take time; rushing breaches LMA syndicate fairness + SARB disclosure
// rules. trigger_event window: minor 30d / standard 60d / material 120d
// / systemic 180d.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  tierForFacility,
  effectiveTier,
  countFloorFlags,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  restructureCompletenessIndex,
  consentThresholdPct,
  consentMajorityPct,
  daysToConsentDeadline,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  boardEscalationRequired,
  regulatorFilingWindowHours,
  bridgesToCovenantCertificateChain,
  bridgesToDscrMonitoringChain,
  bridgesToDefaultChain,
  ifrs9StageAtTrigger,
  proposedReliefZar,
  principalReschedulePct,
  SLA_HOURS,
  type LrsStatus,
  type LrsAction,
  type LrsTier,
  type LrsConsentSeverity,
} from '../utils/loan-restructure-spec';

const READ_ROLES = new Set([
  'admin', 'lender',
  'ipp_developer', 'offtaker', 'regulator', 'trader',
  'support', 'carbon_fund', 'grid_operator',
]);

const WRITE_ROLES = new Set(['admin', 'lender']);

interface LrsRow {
  id: string;
  restructure_number: string;
  facility_id: string;
  facility_name: string | null;
  borrower_id: string;
  borrower_name: string | null;
  lender_agent_id: string;
  lender_agent_name: string | null;
  project_id: string | null;
  project_name: string | null;
  syndicate_size: number;
  facility_amount_zar: number;
  outstanding_debt_zar: number;
  debt_service_per_month_zar: number;
  trigger_reason_code: string | null;
  trigger_narrative: string | null;
  covenant_breach_ref: string | null;
  dscr_shortfall_ref: string | null;
  default_chain_ref: string | null;
  forbearance_period_months: number;
  principal_reschedule_zar: number;
  principal_reschedule_pct: number;
  maturity_extension_months: number;
  equity_cure_quantum_zar: number;
  proposed_relief_zar: number;
  consent_severity: LrsConsentSeverity | null;
  consent_threshold_pct: number;
  consent_majority_pct: number;
  syndicate_consented: number;
  consent_deadline_at: string | null;
  consent_majority_passed: number;
  cross_border_syndicate: number;
  sustainability_linked_loan: number;
  public_bondholder_consent_required: number;
  ifrs9_stage_3_at_trigger: number;
  sarb_large_exposure_threshold: number;
  was_on_watch_at_trigger: number;
  ifrs9_stage_at_trigger: number;
  current_tier: LrsTier;
  authority_required: string | null;
  board_escalation_required: number;
  urgency_band: string | null;
  restructure_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  cancel_reason: string | null;
  rejection_reason: string | null;
  abandon_reason: string | null;
  escalation_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: LrsStatus;
  trigger_event_at: string | null;
  preliminary_assessment_at: string | null;
  restructure_proposal_drafted_at: string | null;
  lender_credit_committee_review_at: string | null;
  borrower_term_sheet_negotiation_at: string | null;
  term_sheet_signed_at: string | null;
  legal_documentation_drafted_at: string | null;
  consent_solicitation_at: string | null;
  signing_at: string | null;
  effective_date_at: string | null;
  monitoring_period_at: string | null;
  completed_at: string | null;
  rejected_by_committee_at: string | null;
  abandoned_at: string | null;
  escalated_to_default_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LrsEventRow {
  id: string;
  restructure_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LrsStatus, keyof LrsRow | null> = {
  trigger_event:                  'trigger_event_at',
  preliminary_assessment:         'preliminary_assessment_at',
  restructure_proposal_drafted:   'restructure_proposal_drafted_at',
  lender_credit_committee_review: 'lender_credit_committee_review_at',
  borrower_term_sheet_negotiation:'borrower_term_sheet_negotiation_at',
  term_sheet_signed:              'term_sheet_signed_at',
  legal_documentation_drafted:    'legal_documentation_drafted_at',
  consent_solicitation:           'consent_solicitation_at',
  signing:                        'signing_at',
  effective_date:                 'effective_date_at',
  monitoring_period:              'monitoring_period_at',
  completed:                      'completed_at',
  rejected_by_committee:          'rejected_by_committee_at',
  abandoned:                      'abandoned_at',
  escalated_to_default:           'escalated_to_default_at',
};

function statusEnteredAt(row: LrsRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.trigger_event_at ? new Date(row.trigger_event_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.trigger_event_at ? new Date(row.trigger_event_at) : null);
}

function decorate(row: LrsRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;

  const hoursUntilSla = row.sla_deadline_at
    ? Math.round((new Date(row.sla_deadline_at).getTime() - now.getTime()) / (3600 * 1000))
    : null;

  const entered = statusEnteredAt(row);
  const slaLeftHrs = slaHoursRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaLeftHrs);
  const authority = authorityRequired(tier);
  const regFilingHours = regulatorFilingWindowHours(tier);

  const floorFlags = {
    cross_border_syndicate:             !!row.cross_border_syndicate,
    sustainability_linked_loan:         !!row.sustainability_linked_loan,
    public_bondholder_consent_required: !!row.public_bondholder_consent_required,
    ifrs9_stage_3_at_trigger:           !!row.ifrs9_stage_3_at_trigger,
    sarb_large_exposure_threshold:      !!row.sarb_large_exposure_threshold,
  };
  const floorFlagCount = countFloorFlags(floorFlags);
  const boardEsc = boardEscalationRequired(tier, floorFlags);

  const consentSev = row.consent_severity || 'special_majority';
  const consentThr = consentThresholdPct(consentSev);
  const consentMaj = consentMajorityPct(row.syndicate_consented, row.syndicate_size);
  const consentDays = daysToConsentDeadline(row.consent_deadline_at, now);

  const reliefZar = proposedReliefZar({
    forbearance_period_months: row.forbearance_period_months,
    principal_reschedule_zar:  row.principal_reschedule_zar,
    maturity_extension_months: row.maturity_extension_months,
    debt_service_per_month_zar: row.debt_service_per_month_zar,
  });
  const reschPct = principalReschedulePct(row.principal_reschedule_zar, row.facility_amount_zar);

  const ifrs9 = ifrs9StageAtTrigger(row.ifrs9_stage_3_at_trigger, row.was_on_watch_at_trigger);

  const completeness = restructureCompletenessIndex({
    preliminary_assessment:   !!row.preliminary_assessment_at,
    proposal_drafted:         !!row.restructure_proposal_drafted_at,
    credit_committee_review:  !!row.lender_credit_committee_review_at,
    term_sheet_signed:        !!row.term_sheet_signed_at,
    documentation_drafted:    !!row.legal_documentation_drafted_at,
    consent_launched:         !!row.consent_solicitation_at,
    consent_majority_passed:  !!row.consent_majority_passed,
    amendment_signed:         !!row.signing_at,
    effective:                !!row.effective_date_at,
    monitoring:               !!row.monitoring_period_at,
    first_cure_period_clean:  status === 'completed',
  });

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    hours_until_sla: hoursUntilSla,
    sla_breached_live: hoursUntilSla != null && hoursUntilSla < 0,
    sla_window_hours: SLA_HOURS[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    // ─── LIVE battery (16-field decoration) ───────────────────────────────
    sla_hours_remaining_live:           slaLeftHrs,
    urgency_band_live:                  urgency,
    authority_required_live:            authority,
    board_escalation_required_live:     boardEsc,
    regulator_filing_window_hours_live: regFilingHours,
    consent_threshold_pct_live:         consentThr,
    consent_majority_pct_live:          consentMaj,
    consent_majority_passed_live:       consentMaj >= consentThr,
    days_to_consent_deadline_live:      consentDays,
    floor_flag_count_live:              floorFlagCount,
    proposed_relief_zar_live:           reliefZar,
    principal_reschedule_pct_live:      reschPct,
    ifrs9_stage_at_trigger_live:        ifrs9,
    restructure_completeness_index_live: completeness,
    bridges_to_covenant_certificate_chain_live: bridgesToCovenantCertificateChain(row.covenant_breach_ref),
    bridges_to_dscr_monitoring_chain_live:      bridgesToDscrMonitoringChain(row.dscr_shortfall_ref),
    bridges_to_default_chain_live:              bridgesToDefaultChain(status, row.default_chain_ref),
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
  const facility    = c.req.query('facility_id');
  const borrower    = c.req.query('borrower_id');
  const lender      = c.req.query('lender_agent_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');
  const covenantRef = c.req.query('covenant_breach_ref');
  const dscrRef     = c.req.query('dscr_shortfall_ref');

  let sql = 'SELECT * FROM oe_loan_restructure WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)        { sql += ' AND current_tier = ?';         binds.push(tier); }
  if (status)      { sql += ' AND chain_status = ?';         binds.push(status); }
  if (facility)    { sql += ' AND facility_id = ?';          binds.push(facility); }
  if (borrower)    { sql += ' AND borrower_id = ?';          binds.push(borrower); }
  if (lender)      { sql += ' AND lender_agent_id = ?';      binds.push(lender); }
  if (covenantRef) { sql += ' AND covenant_breach_ref = ?';  binds.push(covenantRef); }
  if (dscrRef)     { sql += ' AND dscr_shortfall_ref = ?';   binds.push(dscrRef); }
  sql += ' ORDER BY datetime(trigger_event_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<LrsRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live || r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
  }

  const active_count            = items.filter((i) => !i.is_terminal).length;
  const completed_count         = items.filter((i) => i.chain_status === 'completed').length;
  const escalated_count         = items.filter((i) => i.chain_status === 'escalated_to_default').length;
  const rejected_count          = items.filter((i) => i.chain_status === 'rejected_by_committee').length;
  const abandoned_count         = items.filter((i) => i.chain_status === 'abandoned').length;
  const systemic_count          = items.filter((i) => i.current_tier === 'systemic').length;
  const material_count          = items.filter((i) => i.current_tier === 'material').length;
  const breached_count          = items.filter((i) => (i.sla_breached_live || i.sla_breached) && !i.is_terminal).length;
  const reportable_total        = items.filter((i) => i.is_reportable_flag).length;
  const consent_open_count      = items.filter((i) => i.chain_status === 'consent_solicitation').length;
  const consent_passed_count    = items.filter((i) => i.consent_majority_passed_live).length;
  const ifrs9_stage_3_count     = items.filter((i) => !!i.ifrs9_stage_3_at_trigger).length;
  const public_bondholder_count = items.filter((i) => !!i.public_bondholder_consent_required).length;
  const sarb_le_count           = items.filter((i) => !!i.sarb_large_exposure_threshold).length;
  const covenant_bridged        = items.filter((i) => i.bridges_to_covenant_certificate_chain_live).length;
  const dscr_bridged            = items.filter((i) => i.bridges_to_dscr_monitoring_chain_live).length;
  const default_bridged         = items.filter((i) => i.bridges_to_default_chain_live).length;
  const board_escalated_count   = items.filter((i) => i.board_escalation_required_live).length;
  const total_facility_zar      = items.reduce((s, i) => s + (i.facility_amount_zar || 0), 0);
  const total_relief_zar        = items.reduce((s, i) => s + (i.proposed_relief_zar_live || 0), 0);
  const total_outstanding_zar   = items.reduce((s, i) => s + (i.outstanding_debt_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      active_count,
      completed_count,
      escalated_count,
      rejected_count,
      abandoned_count,
      systemic_count,
      material_count,
      breached: breached_count,
      reportable_total,
      consent_open_count,
      consent_passed_count,
      ifrs9_stage_3_count,
      public_bondholder_count,
      sarb_le_count,
      covenant_bridged_count: covenant_bridged,
      dscr_bridged_count:     dscr_bridged,
      default_bridged_count:  default_bridged,
      board_escalated_count,
      total_facility_zar,
      total_relief_zar,
      total_outstanding_zar,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_loan_restructure GROUP BY chain_status, current_tier, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string;
    regulator_relevant: number; sla_breached: number;
    n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_loan_restructure WHERE id = ?').bind(id).first<LrsRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_loan_restructure_events WHERE restructure_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<LrsEventRow>();

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
  facility_id?: string;
  facility_name?: string;
  borrower_id?: string;
  borrower_name?: string;
  lender_agent_id?: string;
  lender_agent_name?: string;
  project_id?: string;
  project_name?: string;
  syndicate_size?: number;
  facility_amount_zar?: number;
  outstanding_debt_zar?: number;
  debt_service_per_month_zar?: number;
  trigger_reason_code?: string;
  trigger_narrative?: string;
  covenant_breach_ref?: string;
  dscr_shortfall_ref?: string;
  cross_border_syndicate?: boolean | number;
  sustainability_linked_loan?: boolean | number;
  public_bondholder_consent_required?: boolean | number;
  ifrs9_stage_3_at_trigger?: boolean | number;
  sarb_large_exposure_threshold?: boolean | number;
  was_on_watch_at_trigger?: boolean | number;
  consent_severity?: LrsConsentSeverity;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface StartPreliminaryBody extends CommonBody {}
interface DraftProposalBody extends CommonBody {
  forbearance_period_months?: number;
  principal_reschedule_zar?: number;
  maturity_extension_months?: number;
  equity_cure_quantum_zar?: number;
  consent_severity?: LrsConsentSeverity;
}
interface SubmitToCreditCommitteeBody extends CommonBody {}
interface ApproveProposalBody extends CommonBody {}
interface RejectProposalBody extends CommonBody { rejection_reason?: string; }
interface ReviseProposalBody extends CommonBody {
  forbearance_period_months?: number;
  principal_reschedule_zar?: number;
  maturity_extension_months?: number;
  equity_cure_quantum_zar?: number;
}
interface NegotiateTermSheetBody extends CommonBody {
  forbearance_period_months?: number;
  principal_reschedule_zar?: number;
  maturity_extension_months?: number;
  equity_cure_quantum_zar?: number;
}
interface SignTermSheetBody extends CommonBody {}
interface DraftDocumentationBody extends CommonBody {}
interface LaunchConsentBody extends CommonBody {
  consent_severity?: LrsConsentSeverity;
  consent_deadline_at?: string;
}
interface RecordConsentBody extends CommonBody {
  syndicate_consented?: number;
  consent_majority_passed?: boolean | number;
}
interface SignAmendmentBody extends CommonBody {}
interface MarkEffectiveBody extends CommonBody {}
interface MonitorComplianceBody extends CommonBody {}
interface CompleteRestructureBody extends CommonBody {}
interface AbandonBody extends CommonBody { abandon_reason?: string; }
interface EscalateToDefaultBody extends CommonBody {
  escalation_reason?: string;
  default_chain_ref?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<LrsRow>): Partial<LrsRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
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

// ─── Create endpoint (trigger_restructure) ────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `lrs-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `LRS-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const facility = Number(body.facility_amount_zar ?? 0);
  const outstanding = Number(body.outstanding_debt_zar ?? facility);
  const debtSvc = Number(body.debt_service_per_month_zar ?? 0);

  const flags = {
    cross_border_syndicate:             toFlag(body.cross_border_syndicate) ?? 0,
    sustainability_linked_loan:         toFlag(body.sustainability_linked_loan) ?? 0,
    public_bondholder_consent_required: toFlag(body.public_bondholder_consent_required) ?? 0,
    ifrs9_stage_3_at_trigger:           toFlag(body.ifrs9_stage_3_at_trigger) ?? 0,
    sarb_large_exposure_threshold:      toFlag(body.sarb_large_exposure_threshold) ?? 0,
    was_on_watch_at_trigger:            toFlag(body.was_on_watch_at_trigger) ?? 0,
  };
  const rawTier = tierForFacility(facility);
  const tier = effectiveTier(rawTier, {
    cross_border_syndicate:             !!flags.cross_border_syndicate,
    sustainability_linked_loan:         !!flags.sustainability_linked_loan,
    public_bondholder_consent_required: !!flags.public_bondholder_consent_required,
    ifrs9_stage_3_at_trigger:           !!flags.ifrs9_stage_3_at_trigger,
    sarb_large_exposure_threshold:      !!flags.sarb_large_exposure_threshold,
  });
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('trigger_event', tier, now);
  const slaTargetHours = SLA_HOURS['trigger_event'][tier] ?? 0;
  const ifrs9 = ifrs9StageAtTrigger(flags.ifrs9_stage_3_at_trigger, flags.was_on_watch_at_trigger);
  const consentSev: LrsConsentSeverity = body.consent_severity || 'special_majority';
  const consentThr = consentThresholdPct(consentSev);
  const boardEsc = boardEscalationRequired(tier, {
    public_bondholder_consent_required: !!flags.public_bondholder_consent_required,
    sarb_large_exposure_threshold:      !!flags.sarb_large_exposure_threshold,
  });

  await c.env.DB.prepare(
    `INSERT INTO oe_loan_restructure (
      id, restructure_number,
      facility_id, facility_name, borrower_id, borrower_name,
      lender_agent_id, lender_agent_name, project_id, project_name,
      syndicate_size,
      facility_amount_zar, outstanding_debt_zar, debt_service_per_month_zar,
      trigger_reason_code, trigger_narrative,
      covenant_breach_ref, dscr_shortfall_ref, default_chain_ref,
      forbearance_period_months, principal_reschedule_zar, principal_reschedule_pct,
      maturity_extension_months, equity_cure_quantum_zar, proposed_relief_zar,
      consent_severity, consent_threshold_pct, consent_majority_pct,
      syndicate_consented, consent_deadline_at, consent_majority_passed,
      cross_border_syndicate, sustainability_linked_loan,
      public_bondholder_consent_required, ifrs9_stage_3_at_trigger,
      sarb_large_exposure_threshold, was_on_watch_at_trigger,
      ifrs9_stage_at_trigger,
      current_tier, authority_required, board_escalation_required,
      urgency_band, restructure_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, trigger_event_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.facility_id ?? `fac-${id}`, body.facility_name ?? null,
    body.borrower_id ?? 'borrower-unknown', body.borrower_name ?? null,
    body.lender_agent_id ?? user.id, body.lender_agent_name ?? null,
    body.project_id ?? null, body.project_name ?? null,
    Number(body.syndicate_size ?? 1),
    facility, outstanding, debtSvc,
    body.trigger_reason_code ?? null, body.trigger_narrative ?? null,
    body.covenant_breach_ref ?? null, body.dscr_shortfall_ref ?? null, null,
    0, 0, 0,
    0, 0, 0,
    consentSev, consentThr, 0,
    0, null, 0,
    flags.cross_border_syndicate, flags.sustainability_linked_loan,
    flags.public_bondholder_consent_required, flags.ifrs9_stage_3_at_trigger,
    flags.sarb_large_exposure_threshold, flags.was_on_watch_at_trigger,
    ifrs9,
    tier, authorityRequired(tier), boardEsc ? 1 : 0,
    urgencyBand(tier, slaTargetHours), 0,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'trigger_event', nowIso,
    slaTargetHours, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `loan_restructure_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_loan_restructure_events (id, restructure_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'loan_restructure_triggered', null, 'trigger_event',
    user.id, partyForAction('trigger_restructure'),
    typeof body.narrative === 'string' ? body.narrative : null,
    JSON.stringify({ action: 'trigger_restructure', tier, facility_amount_zar: facility }),
    nowIso,
  ).run();

  await fireCascade({
    event: 'loan_restructure_triggered',
    actor_id: user.id,
    entity_type: 'loan_restructure',
    entity_id: id,
    data: {
      id,
      restructure_number: num,
      chain_status: 'trigger_event',
      current_tier: tier,
      facility_amount_zar: facility,
      action: 'trigger_restructure',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_loan_restructure WHERE id = ?').bind(id).first<LrsRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

async function transition(
  c: Context<HonoEnv>,
  action: LrsAction,
  bodyHandler?: (row: LrsRow, body: Record<string, unknown>) => Partial<LrsRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_loan_restructure WHERE id = ?').bind(id).first<LrsRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from facility_amount_zar + 5 floor flags. Any flag may
  // have been updated by this transition's body.
  const facility = (overrides.facility_amount_zar as number | undefined) ?? row.facility_amount_zar;
  const rawTier = tierForFacility(facility);
  const floorFlags = {
    cross_border_syndicate:
      Boolean((overrides.cross_border_syndicate as number | undefined) ?? row.cross_border_syndicate),
    sustainability_linked_loan:
      Boolean((overrides.sustainability_linked_loan as number | undefined) ?? row.sustainability_linked_loan),
    public_bondholder_consent_required:
      Boolean((overrides.public_bondholder_consent_required as number | undefined) ?? row.public_bondholder_consent_required),
    ifrs9_stage_3_at_trigger:
      Boolean((overrides.ifrs9_stage_3_at_trigger as number | undefined) ?? row.ifrs9_stage_3_at_trigger),
    sarb_large_exposure_threshold:
      Boolean((overrides.sarb_large_exposure_threshold as number | undefined) ?? row.sarb_large_exposure_threshold),
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.board_escalation_required = boardEscalationRequired(tier, floorFlags) ? 1 : 0;

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaTargetHours = SLA_HOURS[to]?.[tier] ?? 0;

  overrides.sla_target_hours = slaTargetHours;

  // Re-derive LIVE numeric fields.
  const debtSvc = (overrides.debt_service_per_month_zar as number | undefined) ?? row.debt_service_per_month_zar;
  const fb = (overrides.forbearance_period_months as number | undefined) ?? row.forbearance_period_months;
  const pr = (overrides.principal_reschedule_zar as number | undefined) ?? row.principal_reschedule_zar;
  const me = (overrides.maturity_extension_months as number | undefined) ?? row.maturity_extension_months;
  overrides.proposed_relief_zar = proposedReliefZar({
    forbearance_period_months: fb,
    principal_reschedule_zar:  pr,
    maturity_extension_months: me,
    debt_service_per_month_zar: debtSvc,
  });
  overrides.principal_reschedule_pct = principalReschedulePct(pr, facility);

  const consentSev = (overrides.consent_severity as LrsConsentSeverity | undefined) ?? row.consent_severity ?? 'special_majority';
  overrides.consent_threshold_pct = consentThresholdPct(consentSev);
  const consented = (overrides.syndicate_consented as number | undefined) ?? row.syndicate_consented;
  const synSize = (overrides.syndicate_size as number | undefined) ?? row.syndicate_size;
  const consentMaj = consentMajorityPct(consented, synSize);
  overrides.consent_majority_pct = consentMaj;
  if (overrides.consent_majority_passed === undefined) {
    overrides.consent_majority_passed = consentMaj >= consentThresholdPct(consentSev) ? 1 : 0;
  }

  overrides.ifrs9_stage_at_trigger = ifrs9StageAtTrigger(
    floorFlags.ifrs9_stage_3_at_trigger,
    Boolean((overrides.was_on_watch_at_trigger as number | undefined) ?? row.was_on_watch_at_trigger),
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    ifrs9_stage_3_at_trigger:           floorFlags.ifrs9_stage_3_at_trigger,
    public_bondholder_consent_required: floorFlags.public_bondholder_consent_required,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaTargetHours);

  // Re-compute completeness index using fresh timestamps.
  const stamps = {
    preliminary_assessment_at:
      (overrides.preliminary_assessment_at as string | null | undefined) ?? row.preliminary_assessment_at,
    restructure_proposal_drafted_at:
      (overrides.restructure_proposal_drafted_at as string | null | undefined) ?? row.restructure_proposal_drafted_at,
    lender_credit_committee_review_at:
      (overrides.lender_credit_committee_review_at as string | null | undefined) ?? row.lender_credit_committee_review_at,
    term_sheet_signed_at:
      (overrides.term_sheet_signed_at as string | null | undefined) ?? row.term_sheet_signed_at,
    legal_documentation_drafted_at:
      (overrides.legal_documentation_drafted_at as string | null | undefined) ?? row.legal_documentation_drafted_at,
    consent_solicitation_at:
      (overrides.consent_solicitation_at as string | null | undefined) ?? row.consent_solicitation_at,
    signing_at:
      (overrides.signing_at as string | null | undefined) ?? row.signing_at,
    effective_date_at:
      (overrides.effective_date_at as string | null | undefined) ?? row.effective_date_at,
    monitoring_period_at:
      (overrides.monitoring_period_at as string | null | undefined) ?? row.monitoring_period_at,
  };
  if (tsCol && to !== row.chain_status) {
    if (tsCol === 'preliminary_assessment_at')         stamps.preliminary_assessment_at = nowIso;
    if (tsCol === 'restructure_proposal_drafted_at')   stamps.restructure_proposal_drafted_at = nowIso;
    if (tsCol === 'lender_credit_committee_review_at') stamps.lender_credit_committee_review_at = nowIso;
    if (tsCol === 'term_sheet_signed_at')              stamps.term_sheet_signed_at = nowIso;
    if (tsCol === 'legal_documentation_drafted_at')    stamps.legal_documentation_drafted_at = nowIso;
    if (tsCol === 'consent_solicitation_at')           stamps.consent_solicitation_at = nowIso;
    if (tsCol === 'signing_at')                        stamps.signing_at = nowIso;
    if (tsCol === 'effective_date_at')                 stamps.effective_date_at = nowIso;
    if (tsCol === 'monitoring_period_at')              stamps.monitoring_period_at = nowIso;
  }
  overrides.restructure_completeness_index = restructureCompletenessIndex({
    preliminary_assessment:   !!stamps.preliminary_assessment_at,
    proposal_drafted:         !!stamps.restructure_proposal_drafted_at,
    credit_committee_review:  !!stamps.lender_credit_committee_review_at,
    term_sheet_signed:        !!stamps.term_sheet_signed_at,
    documentation_drafted:    !!stamps.legal_documentation_drafted_at,
    consent_launched:         !!stamps.consent_solicitation_at,
    consent_majority_passed:  Number(overrides.consent_majority_passed ?? row.consent_majority_passed) === 1,
    amendment_signed:         !!stamps.signing_at,
    effective:                !!stamps.effective_date_at,
    monitoring:               !!stamps.monitoring_period_at,
    first_cure_period_clean:  to === 'completed',
  });

  // Party tracking.
  const party = partyForAction(action);
  overrides.last_responder_party = party;
  // Forward path — next responder is the inverse party in most cases. For
  // self-loops we keep the current ball-in-court.
  if (action === 'trigger_restructure')         overrides.current_ball_in_court_party = 'lender';
  if (action === 'start_preliminary_assessment')overrides.current_ball_in_court_party = 'lender';
  if (action === 'draft_proposal')              overrides.current_ball_in_court_party = 'lender';
  if (action === 'submit_to_credit_committee')  overrides.current_ball_in_court_party = 'lender';
  if (action === 'approve_proposal')            overrides.current_ball_in_court_party = 'borrower';
  if (action === 'reject_proposal')             overrides.current_ball_in_court_party = 'borrower';
  if (action === 'revise_proposal')             overrides.current_ball_in_court_party = 'lender';
  if (action === 'negotiate_term_sheet')        overrides.current_ball_in_court_party = 'borrower';
  if (action === 'sign_term_sheet')             overrides.current_ball_in_court_party = 'lender';
  if (action === 'draft_documentation')         overrides.current_ball_in_court_party = 'lender';
  if (action === 'launch_consent_solicitation') overrides.current_ball_in_court_party = 'syndicate_member';
  if (action === 'record_consent')              overrides.current_ball_in_court_party = 'syndicate_member';
  if (action === 'sign_amendment')              overrides.current_ball_in_court_party = 'lender';
  if (action === 'mark_effective')              overrides.current_ball_in_court_party = 'lender';
  if (action === 'monitor_compliance')          overrides.current_ball_in_court_party = 'lender';
  if (action === 'complete_restructure')        overrides.current_ball_in_court_party = null;
  if (action === 'abandon')                     overrides.current_ball_in_court_party = null;
  if (action === 'escalate_to_default')         overrides.current_ball_in_court_party = null;

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
    `UPDATE oe_loan_restructure SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `loan_restructure_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_loan_restructure_events (id, restructure_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    party,
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'loan_restructure',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_loan_restructure WHERE id = ?').bind(id).first<LrsRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (17 — trigger_restructure is the create above) ─────
app.post('/:id/start-preliminary-assessment', async (c) =>
  transition(c, 'start_preliminary_assessment', (_row, body) =>
    applyCommon(body as Partial<StartPreliminaryBody>, {}),
  ),
);

app.post('/:id/draft-proposal', async (c) => transition(c, 'draft_proposal', (_row, body) => {
  const b = body as Partial<DraftProposalBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.forbearance_period_months === 'number') out.forbearance_period_months = b.forbearance_period_months;
  if (typeof b.principal_reschedule_zar === 'number')  out.principal_reschedule_zar = b.principal_reschedule_zar;
  if (typeof b.maturity_extension_months === 'number') out.maturity_extension_months = b.maturity_extension_months;
  if (typeof b.equity_cure_quantum_zar === 'number')   out.equity_cure_quantum_zar = b.equity_cure_quantum_zar;
  if (typeof b.consent_severity === 'string')          out.consent_severity = b.consent_severity;
  return applyCommon(b, out);
}));

app.post('/:id/submit-to-credit-committee', async (c) =>
  transition(c, 'submit_to_credit_committee', (_row, body) =>
    applyCommon(body as Partial<SubmitToCreditCommitteeBody>, {}),
  ),
);

app.post('/:id/approve-proposal', async (c) =>
  transition(c, 'approve_proposal', (_row, body) =>
    applyCommon(body as Partial<ApproveProposalBody>, {}),
  ),
);

app.post('/:id/reject-proposal', async (c) => transition(c, 'reject_proposal', (_row, body) => {
  const b = body as Partial<RejectProposalBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.rejection_reason === 'string') out.rejection_reason = b.rejection_reason;
  return applyCommon(b, out);
}));

app.post('/:id/revise-proposal', async (c) => transition(c, 'revise_proposal', (_row, body) => {
  const b = body as Partial<ReviseProposalBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.forbearance_period_months === 'number') out.forbearance_period_months = b.forbearance_period_months;
  if (typeof b.principal_reschedule_zar === 'number')  out.principal_reschedule_zar = b.principal_reschedule_zar;
  if (typeof b.maturity_extension_months === 'number') out.maturity_extension_months = b.maturity_extension_months;
  if (typeof b.equity_cure_quantum_zar === 'number')   out.equity_cure_quantum_zar = b.equity_cure_quantum_zar;
  return applyCommon(b, out);
}));

app.post('/:id/negotiate-term-sheet', async (c) => transition(c, 'negotiate_term_sheet', (_row, body) => {
  const b = body as Partial<NegotiateTermSheetBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.forbearance_period_months === 'number') out.forbearance_period_months = b.forbearance_period_months;
  if (typeof b.principal_reschedule_zar === 'number')  out.principal_reschedule_zar = b.principal_reschedule_zar;
  if (typeof b.maturity_extension_months === 'number') out.maturity_extension_months = b.maturity_extension_months;
  if (typeof b.equity_cure_quantum_zar === 'number')   out.equity_cure_quantum_zar = b.equity_cure_quantum_zar;
  return applyCommon(b, out);
}));

app.post('/:id/sign-term-sheet', async (c) =>
  transition(c, 'sign_term_sheet', (_row, body) =>
    applyCommon(body as Partial<SignTermSheetBody>, {}),
  ),
);

app.post('/:id/draft-documentation', async (c) =>
  transition(c, 'draft_documentation', (_row, body) =>
    applyCommon(body as Partial<DraftDocumentationBody>, {}),
  ),
);

app.post('/:id/launch-consent-solicitation', async (c) =>
  transition(c, 'launch_consent_solicitation', (_row, body) => {
    const b = body as Partial<LaunchConsentBody>;
    const out: Partial<LrsRow> = {};
    if (typeof b.consent_severity === 'string')     out.consent_severity = b.consent_severity;
    if (typeof b.consent_deadline_at === 'string')  out.consent_deadline_at = b.consent_deadline_at;
    return applyCommon(b, out);
  }),
);

app.post('/:id/record-consent', async (c) => transition(c, 'record_consent', (_row, body) => {
  const b = body as Partial<RecordConsentBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.syndicate_consented === 'number')       out.syndicate_consented = b.syndicate_consented;
  if (b.consent_majority_passed !== undefined)         out.consent_majority_passed = toFlag(b.consent_majority_passed) ?? 0;
  return applyCommon(b, out);
}));

app.post('/:id/sign-amendment', async (c) =>
  transition(c, 'sign_amendment', (_row, body) =>
    applyCommon(body as Partial<SignAmendmentBody>, {}),
  ),
);

app.post('/:id/mark-effective', async (c) =>
  transition(c, 'mark_effective', (_row, body) =>
    applyCommon(body as Partial<MarkEffectiveBody>, {}),
  ),
);

app.post('/:id/monitor-compliance', async (c) =>
  transition(c, 'monitor_compliance', (_row, body) =>
    applyCommon(body as Partial<MonitorComplianceBody>, {}),
  ),
);

app.post('/:id/complete-restructure', async (c) =>
  transition(c, 'complete_restructure', (_row, body) =>
    applyCommon(body as Partial<CompleteRestructureBody>, {}),
  ),
);

app.post('/:id/abandon', async (c) => transition(c, 'abandon', (_row, body) => {
  const b = body as Partial<AbandonBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.abandon_reason === 'string') out.abandon_reason = b.abandon_reason;
  return applyCommon(b, out);
}));

app.post('/:id/escalate-to-default', async (c) => transition(c, 'escalate_to_default', (_row, body) => {
  const b = body as Partial<EscalateToDefaultBody>;
  const out: Partial<LrsRow> = {};
  if (typeof b.escalation_reason === 'string') out.escalation_reason = b.escalation_reason;
  if (typeof b.default_chain_ref === 'string') out.default_chain_ref = b.default_chain_ref;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// INVERTED SLA polarity stored in HOURS — sweeps every 15 min for active
// rows whose sla_deadline_at has elapsed. SLA breaches cross regulator on
// material+systemic (LMA + SARB Banks Act §61 disclosure).
export async function loanRestructureSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_loan_restructure
     WHERE chain_status NOT IN ('completed','rejected_by_committee','abandoned','escalated_to_default')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<LrsRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_loan_restructure
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `loan_restructure_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_loan_restructure_events (id, restructure_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'loan_restructure_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'lender',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier}, ${row.sla_target_hours}h target)`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at, sla_target_hours: row.sla_target_hours }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'loan_restructure_sla_breached',
        actor_id: 'system',
        entity_type: 'loan_restructure',
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

// ─── Cron: Consent-deadline countdown sweep (daily 05:00) ─────────────────
//
// Walks every consent_solicitation row, refreshes consent_majority_pct from
// the current syndicate_consented / syndicate_size, and recomputes
// consent_majority_passed. When the consent_deadline_at has elapsed and the
// majority has NOT been met, an event is recorded so the desk sees the
// solicitation failed; the row stays in consent_solicitation so the operator
// can decide to abandon or re-launch.
export async function loanRestructureConsentDeadlineSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; updated: number; deadlines_passed: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_loan_restructure
     WHERE chain_status = 'consent_solicitation'`,
  ).all<LrsRow>();

  const rows = rs.results || [];
  let updated = 0;
  let deadlines_passed = 0;

  for (const row of rows) {
    const sev = (row.consent_severity || 'special_majority') as LrsConsentSeverity;
    const thr = consentThresholdPct(sev);
    const maj = consentMajorityPct(row.syndicate_consented, row.syndicate_size);
    const passed = maj >= thr ? 1 : 0;

    if (
      maj !== row.consent_majority_pct ||
      thr !== row.consent_threshold_pct ||
      passed !== row.consent_majority_passed
    ) {
      await env.DB.prepare(
        `UPDATE oe_loan_restructure
         SET consent_majority_pct = ?, consent_threshold_pct = ?, consent_majority_passed = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(maj, thr, passed, nowIso, row.id).run();
      updated++;
    }

    // Check whether consent_deadline_at has elapsed without majority.
    if (
      row.consent_deadline_at &&
      new Date(row.consent_deadline_at).getTime() < now.getTime() &&
      !passed
    ) {
      const evtId = `loan_restructure_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      await env.DB.prepare(
        'INSERT INTO oe_loan_restructure_events (id, restructure_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        evtId,
        row.id,
        'loan_restructure_consent_recorded',
        row.chain_status,
        row.chain_status,
        'system',
        'syndicate_member',
        `Consent deadline elapsed without ${sev} majority (got ${maj.toFixed(1)}% / need ${thr.toFixed(1)}%) — operator decision required (abandon or relaunch).`,
        JSON.stringify({
          consent_deadline_at: row.consent_deadline_at,
          consent_severity: sev,
          consent_majority_pct: maj,
          consent_threshold_pct: thr,
          deadline_elapsed: true,
        }),
        nowIso,
      ).run();
      deadlines_passed++;
    }
  }
  return { scanned: rows.length, updated, deadlines_passed };
}

export default app;
