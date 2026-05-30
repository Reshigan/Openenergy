// ═══════════════════════════════════════════════════════════════════════════
// Wave 116 — IPP RFI (Request For Information) Management chain.
// 11th IPP-pure chain. FIFTH Phase-A IPP wave (sibling of W112 schedule,
// W113 EVM, W114 document control, W115 submittals). Mounted at
// /api/ipp/rfis/chain.
//
// RFI-workflow engine that owns "where is every RFI right now, who has
// the ball, has the engineer returned an answer, is anyone holding up
// active construction, has a safety hazard or regulatory inquiry been
// surfaced, does the RFI feed a change order or dispute?" for every IPP
// project end-to-end.
//
// Beats Procore RFIs / Aconex RFIs / Newforma RFIs / Autodesk
// Construction Cloud RFIs / e-Builder RFIs / Asite RFIs / SmartUse RFIs
// / Bluebeam Studio / Fieldwire RFIs / Bentley AssetWise RFIs.
//
// Standards: CSI 01 31 19 + ISO 19650-2 §5.7 + FIDIC Silver §1.3 + AIA
// G716 + NEC4 §61 + REIPPPP technical-coordination protocol.
//
// Write {admin, ipp_developer}. READ all 9 personas. 4-party split:
//   contractor_PM : draft_question, submit, void, link_to_dispute
//   doc_controller: triage, assign_responder
//   engineer      : commence_research, draft_response, coordinate_review,
//                   return_answer, request_clarification,
//                   convert_to_change_order
//   owner_rep     : close_out, archive, reject, escalate
//
// SIGNATURE Phase-A IPP regulator crossings:
//   escalate -> EVERY tier when safety_hazard_identified ||
//               regulatory_inquiry_triggered
//               (W116 SIGNATURE SAFETY-RFI-ESCALATE hard line —
//                safety/regulatory RFI escalation = IPPO/NERSA notice)
//   reject   -> EVERY tier when contractor_claim_basis AND
//               cost_impact_zar >= R10m
//   convert_to_change_order -> construction_blocking + emergency_safety
//                              only (W117 auto-link)
//   link_to_dispute -> EVERY tier when dispute_basis_referenced AND
//                       (claim || stoppage)
//   close_out -> no regulator
//   sla_breached -> emergency_safety + construction_blocking only
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
  slaWindowHours,
  tierForRfiClass,
  effectiveTier,
  countFloorFlags,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  daysToConstructionBlockResolution,
  bridgesToDocumentControlChain,
  bridgesToSubmittalChain,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToCodChain,
  hasChangeOrderLink,
  rfiCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
  type IprStatus,
  type IprAction,
  type IprTier,
} from '../utils/ipp-rfi-spec';

const READ_ROLES = new Set([
  'admin', 'ipp_developer',
  'trader', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IprRow {
  id: string;
  rfi_number: string;

  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;

  document_control_ref: string | null;
  submittal_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  linked_change_order_ref: string | null;

  rfi_class: string | null;
  rfi_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  spec_section: string | null;
  csi_section: string | null;
  contractor_name: string | null;
  question_short: string | null;
  question_long: string | null;
  proposed_answer: string | null;

  contractor_pm_name: string | null;
  doc_controller_name: string | null;
  responder_name: string | null;
  responder_party: string | null;
  owner_rep_name: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  safety_hazard_identified: number;
  construction_stoppage_in_effect: number;
  contractor_claim_basis: number;
  dispute_basis_referenced: number;
  regulatory_inquiry_triggered: number;

  stoppage_started_at: string | null;

  cost_impact_zar: number;
  schedule_impact_days: number;

  current_tier: IprTier;
  authority_required: string | null;
  urgency_band: string | null;
  rfi_health_band: string | null;
  rfi_completeness_index: number;
  rfi_age_days: number;
  escalation_count: number;
  regulator_filing_window_hours: number;
  coordination_disciplines: string | null;
  comments_open: number;

  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  escalation_reason: string | null;
  comments_summary: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: IprStatus;
  question_drafted_at: string | null;
  submitted_at: string | null;
  triage_at: string | null;
  assigned_to_responder_at: string | null;
  research_in_progress_at: string | null;
  response_drafted_at: string | null;
  cross_discipline_review_at: string | null;
  answer_returned_at: string | null;
  clarification_requested_at: string | null;
  closed_out_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  void_at: string | null;
  escalated_at: string | null;
  resumed_at: string | null;

  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;

  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;

  hash_chain_position: number;
  merkle_root_segment: string | null;

  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface IprEventRow {
  id: string;
  rfi_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

// Map each status to its primary timestamp column.
const TIMESTAMP_COLUMN: Record<IprStatus, keyof IprRow | null> = {
  question_drafted:        'question_drafted_at',
  submitted:               'submitted_at',
  triage:                  'triage_at',
  assigned_to_responder:   'assigned_to_responder_at',
  research_in_progress:    'research_in_progress_at',
  response_drafted:        'response_drafted_at',
  cross_discipline_review: 'cross_discipline_review_at',
  answer_returned:         'answer_returned_at',
  clarification_requested: 'clarification_requested_at',
  closed_out:              'closed_out_at',
  archived:                'archived_at',
  rejected:                'rejected_at',
  void:                    'void_at',
  escalated:               'escalated_at',
};

function statusEnteredAt(row: IprRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.question_drafted_at ? new Date(row.question_drafted_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.question_drafted_at ? new Date(row.question_drafted_at) : null);
}

// RFI health band - green/amber/red/critical from completeness +
// rejected/void/escalated + SLA. Inert if archived (closed clean).
function rfiHealthBand(
  status: IprStatus,
  completeness: number,
  slaBreached: boolean,
  rejected: boolean,
  voided: boolean,
  escalated: boolean,
): 'green' | 'amber' | 'red' | 'critical' {
  if (rejected || voided) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (escalated) return 'amber';
  if (completeness < 30) return 'amber';
  if (completeness < 90) return 'amber';
  return 'green';
}

function decorate(row: IprRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaHrs = slaHoursRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaHrs);
  const authority = authorityRequired(tier);
  const regFilingHours = regulatorFilingWindowHours(tier);

  const floorFlags = countFloorFlags({
    safety_hazard_identified:        row.safety_hazard_identified,
    construction_stoppage_in_effect: row.construction_stoppage_in_effect,
    contractor_claim_basis:          row.contractor_claim_basis,
    dispute_basis_referenced:        row.dispute_basis_referenced,
    regulatory_inquiry_triggered:    row.regulatory_inquiry_triggered,
  });

  const completenessLive = rfiCompletenessIndex({
    question_drafted:        !!row.question_drafted_at,
    submitted:               !!row.submitted_at,
    triage:                  !!row.triage_at,
    assigned_to_responder:   !!row.assigned_to_responder_at,
    research_in_progress:    !!row.research_in_progress_at,
    response_drafted:        !!row.response_drafted_at,
    cross_discipline_review: !!row.cross_discipline_review_at,
    answer_returned:         !!row.answer_returned_at,
    clarification_requested: !!row.clarification_requested_at,
    closed_out:              !!row.closed_out_at,
    archived:                !!row.archived_at,
    clean_close_bonus:       (status === 'archived' || status === 'closed_out') && !row.rejected_at && !row.void_at,
  });

  const draftedAt = row.question_drafted_at ? new Date(row.question_drafted_at) : null;
  const rfiAgeDays = draftedAt
    ? Math.floor((now.getTime() - draftedAt.getTime()) / (24 * 3600 * 1000))
    : 0;

  const stoppage = !!row.construction_stoppage_in_effect;
  const stoppageStartedAt = row.stoppage_started_at ? new Date(row.stoppage_started_at) : null;
  const daysBlocked = daysToConstructionBlockResolution(stoppage, stoppageStartedAt, now);

  const healthBand = row.rfi_health_band
    ? row.rfi_health_band
    : rfiHealthBand(
        status,
        completenessLive,
        minutesUntilSla != null && minutesUntilSla < 0,
        !!row.rejected_at,
        !!row.void_at,
        !!row.escalated_at,
      );

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_hours: slaWindowHours(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    regulator_filing_window_hours_live: regFilingHours,
    floor_flag_count_live: floorFlags,
    rfi_completeness_index_live: completenessLive,
    rfi_health_band_live: healthBand,
    rfi_age_days_live: rfiAgeDays,
    days_construction_blocked_live: daysBlocked,
    bridges_to_document_control_chain_live: bridgesToDocumentControlChain(row.document_control_ref),
    bridges_to_submittal_chain_live: bridgesToSubmittalChain(row.submittal_ref),
    bridges_to_schedule_chain_live: bridgesToScheduleChain(row.schedule_ref),
    bridges_to_evm_chain_live: bridgesToEvmChain(row.evm_ref),
    bridges_to_procurement_chain_live: bridgesToProcurementChain(row.procurement_ref),
    bridges_to_cod_chain_live: bridgesToCodChain(row.cod_ref),
    has_change_order_link_live: hasChangeOrderLink(row.linked_change_order_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const project    = c.req.query('project_id');
  const health     = c.req.query('rfi_health_band');
  const rfiClass   = c.req.query('rfi_class');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ipp_rfi WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?'; binds.push(status); }
  if (project)   { sql += ' AND project_id = ?';   binds.push(project); }
  if (health)    { sql += ' AND rfi_health_band = ?'; binds.push(health); }
  if (rfiClass)  { sql += ' AND rfi_class = ?'; binds.push(rfiClass); }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IprRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.rfi_health_band_live] = (by_health[i.rfi_health_band_live] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
    if (i.rfi_class) by_class[i.rfi_class] = (by_class[i.rfi_class] || 0) + 1;
  }

  const active_count           = items.filter((i) => !i.is_terminal).length;
  const drafted_count          = items.filter((i) => i.chain_status === 'question_drafted').length;
  const submitted_count        = items.filter((i) => i.chain_status === 'submitted').length;
  const triage_count           = items.filter((i) => i.chain_status === 'triage').length;
  const assigned_count         = items.filter((i) => i.chain_status === 'assigned_to_responder').length;
  const research_count         = items.filter((i) =>
    i.chain_status === 'research_in_progress' ||
    i.chain_status === 'response_drafted' ||
    i.chain_status === 'cross_discipline_review'
  ).length;
  const answered_count         = items.filter((i) => i.chain_status === 'answer_returned').length;
  const clarification_count    = items.filter((i) => i.chain_status === 'clarification_requested').length;
  const closed_out_count       = items.filter((i) => i.chain_status === 'closed_out').length;
  const archived_count         = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count         = items.filter((i) => i.chain_status === 'rejected').length;
  const void_count             = items.filter((i) => i.chain_status === 'void').length;
  const escalated_count        = items.filter((i) => i.chain_status === 'escalated').length;
  const emergency_safety_count = items.filter((i) => i.current_tier === 'emergency_safety').length;
  const breached_count         = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total       = items.filter((i) => i.is_reportable_flag).length;
  const safety_count           = items.filter((i) => i.safety_hazard_identified).length;
  const stoppage_count         = items.filter((i) => i.construction_stoppage_in_effect).length;
  const claim_count            = items.filter((i) => i.contractor_claim_basis).length;
  const dispute_count          = items.filter((i) => i.dispute_basis_referenced).length;
  const regulatory_count       = items.filter((i) => i.regulatory_inquiry_triggered).length;
  const doc_bridged            = items.filter((i) => i.bridges_to_document_control_chain_live).length;
  const submittal_bridged      = items.filter((i) => i.bridges_to_submittal_chain_live).length;
  const schedule_bridged       = items.filter((i) => i.bridges_to_schedule_chain_live).length;
  const evm_bridged            = items.filter((i) => i.bridges_to_evm_chain_live).length;
  const procurement_bridged    = items.filter((i) => i.bridges_to_procurement_chain_live).length;
  const cod_bridged            = items.filter((i) => i.bridges_to_cod_chain_live).length;
  const co_linked              = items.filter((i) => i.has_change_order_link_live).length;
  const completeness_avg       = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.rfi_completeness_index_live || 0), 0) / items.length)
    : 0;
  const cost_impact_zar_total  = items.reduce((s, i) => s + (i.cost_impact_zar || 0), 0);
  const schedule_impact_days_total = items.reduce((s, i) => s + (i.schedule_impact_days || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_health,
      by_project,
      by_class,
      active_count,
      drafted_count,
      submitted_count,
      triage_count,
      assigned_count,
      research_count,
      answered_count,
      clarification_count,
      closed_out_count,
      archived_count,
      rejected_count,
      void_count,
      escalated_count,
      emergency_safety_count,
      breached: breached_count,
      reportable_total,
      safety_count,
      stoppage_count,
      claim_count,
      dispute_count,
      regulatory_count,
      document_control_bridged_count: doc_bridged,
      submittal_bridged_count: submittal_bridged,
      schedule_bridged_count: schedule_bridged,
      evm_bridged_count: evm_bridged,
      procurement_bridged_count: procurement_bridged,
      cod_bridged_count: cod_bridged,
      change_order_linked_count: co_linked,
      completeness_avg,
      cost_impact_zar_total,
      schedule_impact_days_total,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, rfi_health_band, rfi_class, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ipp_rfi GROUP BY chain_status, current_tier, rfi_health_band, rfi_class, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; rfi_health_band: string | null;
    rfi_class: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.rfi_health_band) by_health[r.rfi_health_band] = (by_health[r.rfi_health_band] || 0) + r.n;
    if (r.rfi_class) by_class[r.rfi_class] = (by_class[r.rfi_class] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_health, by_class, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_rfi WHERE id = ?').bind(id).first<IprRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_rfi_events WHERE rfi_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IprEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Body interfaces ──────────────────────────────────────────────────────
interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
}

interface CreateBody extends CommonBody {
  project_id?: string;
  project_name?: string;
  project_capacity_mw?: number;
  project_type?: string;
  document_control_ref?: string;
  submittal_ref?: string;
  schedule_ref?: string;
  evm_ref?: string;
  procurement_ref?: string;
  cod_ref?: string;
  rfi_class?: string;
  rfi_type?: string;
  discipline?: string;
  package_code?: string;
  drawing_number?: string;
  spec_section?: string;
  csi_section?: string;
  contractor_name?: string;
  question_short?: string;
  question_long?: string;
  proposed_answer?: string;
  safety_hazard_identified?: boolean | number;
  construction_stoppage_in_effect?: boolean | number;
  contractor_claim_basis?: boolean | number;
  dispute_basis_referenced?: boolean | number;
  regulatory_inquiry_triggered?: boolean | number;
  stoppage_started_at?: string;
  cost_impact_zar?: number;
  schedule_impact_days?: number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface SubmitBody extends CommonBody {
  question_short?: string;
  question_long?: string;
}

interface TriageBody extends CommonBody {
  doc_controller_name?: string;
}

interface AssignResponderBody extends CommonBody {
  responder_name?: string;
  responder_party?: string;
}

interface DraftResponseBody extends CommonBody {
  proposed_answer?: string;
  comments_summary?: string;
  comments_open?: number;
}

interface CoordinateReviewBody extends CommonBody {
  coordination_disciplines?: string;
}

interface ReturnAnswerBody extends CommonBody {
  proposed_answer?: string;
  comments_summary?: string;
}

interface RequestClarificationBody extends CommonBody {
  comments_summary?: string;
}

interface CloseOutBody extends CommonBody {
  owner_rep_name?: string;
}

interface RejectBody extends CommonBody {
  reject_reason?: string;
}

interface VoidBody extends CommonBody {
  void_reason?: string;
}

interface EscalateBody extends CommonBody {
  escalation_reason?: string;
}

interface ConvertCoBody extends CommonBody {
  linked_change_order_ref?: string;
  cost_impact_zar?: number;
  schedule_impact_days?: number;
}

interface LinkDisputeBody extends CommonBody {
  escalation_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<IprRow>): Partial<IprRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// ─── Create endpoint (draft_question) ─────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ipr-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `RFI-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const rfiClass = body.rfi_class ?? 'clarification';
  const flags = {
    safety_hazard_identified:        toFlag(body.safety_hazard_identified) ?? 0,
    construction_stoppage_in_effect: toFlag(body.construction_stoppage_in_effect) ?? 0,
    contractor_claim_basis:          toFlag(body.contractor_claim_basis) ?? 0,
    dispute_basis_referenced:        toFlag(body.dispute_basis_referenced) ?? 0,
    regulatory_inquiry_triggered:    toFlag(body.regulatory_inquiry_triggered) ?? 0,
  };
  const rawTier = tierForRfiClass(rfiClass);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('question_drafted', tier, now);
  const slaHrs = slaWindowHours('question_drafted', tier);
  const hashPos = hashChainPositionFor(0);
  const merkleSeg = placeholderMerkleSegment(id, hashPos);
  const regFilingWindow = regulatorFilingWindowHours(tier);

  await c.env.DB.prepare(
    `INSERT INTO oe_ipp_rfi (
      id, rfi_number,
      project_id, project_name, project_capacity_mw, project_type,
      document_control_ref, submittal_ref, schedule_ref, evm_ref,
      procurement_ref, cod_ref,
      rfi_class, rfi_type, discipline, package_code,
      drawing_number, spec_section, csi_section,
      contractor_name, question_short, question_long, proposed_answer,
      safety_hazard_identified, construction_stoppage_in_effect,
      contractor_claim_basis, dispute_basis_referenced,
      regulatory_inquiry_triggered,
      stoppage_started_at,
      cost_impact_zar, schedule_impact_days,
      current_tier, authority_required, urgency_band,
      rfi_completeness_index, regulator_filing_window_hours,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, question_drafted_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      hash_chain_position, merkle_root_segment,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? 'project-unknown', body.project_name ?? null,
    Number(body.project_capacity_mw ?? 0), body.project_type ?? null,
    body.document_control_ref ?? null, body.submittal_ref ?? null,
    body.schedule_ref ?? null, body.evm_ref ?? null,
    body.procurement_ref ?? null, body.cod_ref ?? null,
    rfiClass, body.rfi_type ?? null, body.discipline ?? null, body.package_code ?? null,
    body.drawing_number ?? null, body.spec_section ?? null, body.csi_section ?? null,
    body.contractor_name ?? null, body.question_short ?? null, body.question_long ?? null, body.proposed_answer ?? null,
    flags.safety_hazard_identified, flags.construction_stoppage_in_effect,
    flags.contractor_claim_basis, flags.dispute_basis_referenced,
    flags.regulatory_inquiry_triggered,
    body.stoppage_started_at ?? null,
    Number(body.cost_impact_zar ?? 0), Number(body.schedule_impact_days ?? 0),
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    6, regFilingWindow,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'question_drafted', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    hashPos, merkleSeg,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ipp_rfi_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_rfi_events (id, rfi_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ipp_rfi_drafted',
    null, 'question_drafted',
    user.id, partyForAction('draft_question'),
    null, JSON.stringify({ tier, rfi_class: rfiClass, project_id: body.project_id }), nowIso,
  ).run();

  await fireCascade({
    event: 'ipp_rfi_drafted',
    actor_id: user.id,
    entity_type: 'ipp_rfi',
    entity_id: id,
    data: {
      tier, rfi_class: rfiClass, project_id: body.project_id,
      chain_status: 'question_drafted',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_rfi WHERE id = ?').bind(id).first<IprRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: IprAction,
  bodyHandler?: (row: IprRow, body: Record<string, unknown>) => Partial<IprRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_rfi WHERE id = ?').bind(id).first<IprRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current rfi_class + 5 floor flags.
  const rfiClass = (overrides.rfi_class as string | undefined) ?? row.rfi_class;
  const rawTier = tierForRfiClass(rfiClass);
  const floorFlags = {
    safety_hazard_identified:
      (overrides.safety_hazard_identified as number | undefined) ?? row.safety_hazard_identified,
    construction_stoppage_in_effect:
      (overrides.construction_stoppage_in_effect as number | undefined) ?? row.construction_stoppage_in_effect,
    contractor_claim_basis:
      (overrides.contractor_claim_basis as number | undefined) ?? row.contractor_claim_basis,
    dispute_basis_referenced:
      (overrides.dispute_basis_referenced as number | undefined) ?? row.dispute_basis_referenced,
    regulatory_inquiry_triggered:
      (overrides.regulatory_inquiry_triggered as number | undefined) ?? row.regulatory_inquiry_triggered,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.regulator_filing_window_hours = regulatorFilingWindowHours(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;

  // Action-specific bookkeeping.
  if ((action === 'commence_research' || action === 'close_out') && row.chain_status === 'escalated') {
    overrides.resumed_at = nowIso;
  }
  if (action === 'escalate') {
    overrides.escalation_count = (row.escalation_count || 0) + 1;
  }

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof IprRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = rfiCompletenessIndex({
    question_drafted:        willSetTs('question_drafted_at'),
    submitted:               willSetTs('submitted_at'),
    triage:                  willSetTs('triage_at'),
    assigned_to_responder:   willSetTs('assigned_to_responder_at'),
    research_in_progress:    willSetTs('research_in_progress_at'),
    response_drafted:        willSetTs('response_drafted_at'),
    cross_discipline_review: willSetTs('cross_discipline_review_at'),
    answer_returned:         willSetTs('answer_returned_at'),
    clarification_requested: willSetTs('clarification_requested_at'),
    closed_out:              willSetTs('closed_out_at'),
    archived:                willSetTs('archived_at'),
    clean_close_bonus:       (to === 'archived' || to === 'closed_out') && !row.rejected_at && !row.void_at,
  });
  overrides.rfi_completeness_index = completeness;

  // Re-derive rfi_health_band from new completeness + sticky markers.
  const rejectedNow = to === 'rejected' || !!row.rejected_at;
  const voidedNow = to === 'void' || !!row.void_at;
  const escalatedNow = to === 'escalated' || (!!row.escalated_at && !row.resumed_at);
  overrides.rfi_health_band = rfiHealthBand(
    to,
    completeness,
    !!row.sla_breached,
    rejectedNow,
    voidedNow,
    escalatedNow,
  );

  // SIGNATURE crossings — escalate + safety/regulatory flag, reject +
  // claim + R10m, convert_to_change_order on heavy tiers, link_to_dispute
  // when dispute + (claim || stoppage).
  const costForRegCheck = (overrides.cost_impact_zar as number | undefined) ?? row.cost_impact_zar;
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    cost_impact_zar: costForRegCheck,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Hash-chain pre-stage (W118 backfill).
  const newHashPos = hashChainPositionFor(row.hash_chain_position);
  overrides.hash_chain_position = newHashPos;
  overrides.merkle_root_segment = placeholderMerkleSegment(id, newHashPos);

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
    `UPDATE oe_ipp_rfi SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ipp_rfi_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_rfi_events (id, rfi_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'ipp_rfi',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_rfi WHERE id = ?').bind(id).first<IprRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; draft_question handled by POST /) ──
app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.question_short === 'string') out.question_short = b.question_short;
  if (typeof b.question_long === 'string')  out.question_long = b.question_long;
  return applyCommon(b, out);
}));

app.post('/:id/triage', async (c) => transition(c, 'triage', (_row, body) => {
  const b = body as Partial<TriageBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.doc_controller_name === 'string') out.doc_controller_name = b.doc_controller_name;
  return applyCommon(b, out);
}));

app.post('/:id/assign-responder', async (c) => transition(c, 'assign_responder', (_row, body) => {
  const b = body as Partial<AssignResponderBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.responder_name === 'string')  out.responder_name = b.responder_name;
  if (typeof b.responder_party === 'string') out.responder_party = b.responder_party;
  return applyCommon(b, out);
}));

app.post('/:id/commence-research', async (c) => transition(c, 'commence_research', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/draft-response', async (c) => transition(c, 'draft_response', (_row, body) => {
  const b = body as Partial<DraftResponseBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.proposed_answer === 'string') out.proposed_answer = b.proposed_answer;
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  if (typeof b.comments_open === 'number')    out.comments_open = b.comments_open;
  return applyCommon(b, out);
}));

app.post('/:id/coordinate-review', async (c) => transition(c, 'coordinate_review', (_row, body) => {
  const b = body as Partial<CoordinateReviewBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.coordination_disciplines === 'string') out.coordination_disciplines = b.coordination_disciplines;
  return applyCommon(b, out);
}));

app.post('/:id/return-answer', async (c) => transition(c, 'return_answer', (_row, body) => {
  const b = body as Partial<ReturnAnswerBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.proposed_answer === 'string') out.proposed_answer = b.proposed_answer;
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  return applyCommon(b, out);
}));

app.post('/:id/request-clarification', async (c) => transition(c, 'request_clarification', (_row, body) => {
  const b = body as Partial<RequestClarificationBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  return applyCommon(b, out);
}));

app.post('/:id/close-out', async (c) => transition(c, 'close_out', (_row, body) => {
  const b = body as Partial<CloseOutBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.owner_rep_name === 'string') out.owner_rep_name = b.owner_rep_name;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.void_reason === 'string') out.void_reason = b.void_reason;
  return applyCommon(b, out);
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.escalation_reason === 'string') out.escalation_reason = b.escalation_reason;
  return applyCommon(b, out);
}));

app.post('/:id/convert-to-change-order', async (c) => transition(c, 'convert_to_change_order', (_row, body) => {
  const b = body as Partial<ConvertCoBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.linked_change_order_ref === 'string') out.linked_change_order_ref = b.linked_change_order_ref;
  if (typeof b.cost_impact_zar === 'number') out.cost_impact_zar = b.cost_impact_zar;
  if (typeof b.schedule_impact_days === 'number') out.schedule_impact_days = b.schedule_impact_days;
  return applyCommon(b, out);
}));

app.post('/:id/link-to-dispute', async (c) => transition(c, 'link_to_dispute', (_row, body) => {
  const b = body as Partial<LinkDisputeBody>;
  const out: Partial<IprRow> = {};
  if (typeof b.escalation_reason === 'string') out.escalation_reason = b.escalation_reason;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active RFI whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires ipp_rfi_sla_breached.
// Breach crosses regulator on emergency_safety + construction_blocking
// (heavy tiers).
export async function ippRfiSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_rfi
     WHERE chain_status NOT IN ('archived', 'rejected', 'void')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IprRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ipp_rfi
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ipp_rfi_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ipp_rfi_events (id, rfi_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ipp_rfi_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'doc_controller',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'ipp_rfi_sla_breached',
        actor_id: 'system',
        entity_type: 'ipp_rfi',
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

// ─── Cron: nightly RFI-aging recompute (00:35 UTC) ─────────────────────────
//
// Walks every active RFI and refreshes the live RFI battery
// (rfi_age_days + completeness + health band) WITHOUT auto-transitioning.
// RFI decisions are never moved by cron — only LIVE fields are refreshed
// so dashboards stay current.
export async function ippRfiAgingRefresh(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_rfi
     WHERE chain_status NOT IN ('archived', 'rejected', 'void')`,
  ).all<IprRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const draftedAt = row.question_drafted_at ? new Date(row.question_drafted_at) : null;
    const ageDays = draftedAt
      ? Math.floor((now.getTime() - draftedAt.getTime()) / (24 * 3600 * 1000))
      : 0;

    const completeness = rfiCompletenessIndex({
      question_drafted:        !!row.question_drafted_at,
      submitted:               !!row.submitted_at,
      triage:                  !!row.triage_at,
      assigned_to_responder:   !!row.assigned_to_responder_at,
      research_in_progress:    !!row.research_in_progress_at,
      response_drafted:        !!row.response_drafted_at,
      cross_discipline_review: !!row.cross_discipline_review_at,
      answer_returned:         !!row.answer_returned_at,
      clarification_requested: !!row.clarification_requested_at,
      closed_out:              !!row.closed_out_at,
      archived:                !!row.archived_at,
      clean_close_bonus:       (row.chain_status === 'archived' || row.chain_status === 'closed_out') && !row.rejected_at && !row.void_at,
    });
    const health = rfiHealthBand(
      row.chain_status,
      completeness,
      !!row.sla_breached,
      !!row.rejected_at,
      !!row.void_at,
      !!row.escalated_at && !row.resumed_at,
    );

    await env.DB.prepare(
      `UPDATE oe_ipp_rfi
       SET rfi_age_days = ?, rfi_completeness_index = ?,
           rfi_health_band = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(ageDays, completeness, health, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

export default app;
