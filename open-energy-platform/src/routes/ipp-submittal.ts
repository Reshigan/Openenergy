// ═══════════════════════════════════════════════════════════════════════════
// Wave 115 — IPP Submittal / Transmittal Lifecycle chain.
// 10th IPP-pure chain. FOURTH Phase-A IPP wave (sibling of W112 schedule,
// W113 EVM, W114 document control). Mounted at /api/ipp/submittals/chain.
//
// Submittal-workflow engine that owns "where is every submittal package
// right now, has the engineer stamped it, what's the CSI 01 33 00 stamp
// (A/B/C/D/E), do we have any commissioning-critical packages stuck in
// resubmission, is anyone holding up a long-lead procurement?" for every
// IPP project end-to-end.
//
// Beats Procore Submittals / Aconex Workflows / Newforma Transmittals /
// Autodesk Construction Cloud Submittals / e-Builder Submittals / Asite
// Workflows / Conject Submittals / Oracle CCS / Coreworx EDMS / SmartUse.
//
// Standards: ISO 19650-2 §5.7 + CSI 01 33 00 (STAMPS A/B/C/D/E) + FIDIC
// Silver Book §6 + NEC4 §54 + REIPPPP Schedule 4 + DMRE EPC submittal.
//
// Write {admin, ipp_developer}. READ all 9 personas. 4-party split:
//   contractor_PM : draft_package, assemble_package, submit, void
//   doc_controller: screen, assign_reviewer
//   engineer      : commence_review, coordinate_review, draft_response,
//                   stamp_return, request_resubmission,
//                   approve_with_comments
//   owner_rep     : close_out, archive, reject, escalate
//
// SIGNATURE Phase-A IPP regulator crossings:
//   stamp_return -> EVERY tier when stamp_code='E' AND
//                   (critical_safety || commissioning_critical)
//                   (W115 SIGNATURE STAMP-E-REJECT-CRITICAL hard line —
//                    supplier disqualification reportable to IE/IPPO/NERSA)
//   reject       -> EVERY tier when long_lead_item AND cycle_count>=3
//                   (cycle-fatigue disqualification)
//   escalate     -> critical_safety + material_approval only when
//                   regulatory_witness_required
//   close_out    -> no regulator
//   sla_breached -> critical_safety + shop_drawing only
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
  tierForSubmittalClass,
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
  regulatoryWitnessWindowHours,
  stampForAction,
  incrementCycleCount,
  bridgesToDocumentControlChain,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToInsuranceChain,
  bridgesToCodChain,
  submittalCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
  type IpsStatus,
  type IpsAction,
  type IpsTier,
  type IpsStampCode,
} from '../utils/ipp-submittal-spec';
import { badEnum } from '../utils/validation';

// Migration 320 CHECK(stamp_code IN (...)) — reject before D1 500s.
const IPS_STAMP_CODES = ['A', 'B', 'C', 'D', 'E'];

const READ_ROLES = new Set([
  'admin', 'ipp_developer',
  'trader', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IpsRow {
  id: string;
  submittal_number: string;

  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;

  document_control_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  insurance_ref: string | null;
  cod_ref: string | null;

  submittal_class: string | null;
  submittal_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  drawing_title: string | null;
  csi_section: string | null;
  contractor_name: string | null;
  supplier_name: string | null;

  stamp_code: IpsStampCode | null;
  cycle_count: number;
  last_transmittal_number: string | null;
  last_transmittal_at: string | null;
  contractor_pm_name: string | null;
  doc_controller_name: string | null;
  reviewer_name: string | null;
  reviewer_party: string | null;
  owner_rep_name: string | null;

  long_lead_item: number;
  commissioning_critical: number;
  regulatory_witness_required: number;
  lender_information_covenant: number;
  dispute_history: number;

  long_lead_deadline_at: string | null;

  current_tier: IpsTier;
  authority_required: string | null;
  urgency_band: string | null;
  submittal_health_band: string | null;
  submittal_completeness_index: number;
  regulatory_witness_window_hours: number;
  coordination_disciplines: string | null;
  comments_open: number;

  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  escalation_reason: string | null;
  comments_summary: string | null;

  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: IpsStatus;
  contractor_drafted_at: string | null;
  package_assembled_at: string | null;
  submitted_at: string | null;
  screening_at: string | null;
  assigned_to_reviewer_at: string | null;
  under_review_at: string | null;
  coordination_review_at: string | null;
  response_drafted_at: string | null;
  stamped_returned_at: string | null;
  resubmission_requested_at: string | null;
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

interface IpsEventRow {
  id: string;
  submittal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  stamp_code: string | null;
  cycle_count: number | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

// Map each status to its primary timestamp column.
const TIMESTAMP_COLUMN: Record<IpsStatus, keyof IpsRow | null> = {
  contractor_drafted:     'contractor_drafted_at',
  package_assembled:      'package_assembled_at',
  submitted:              'submitted_at',
  screening:              'screening_at',
  assigned_to_reviewer:   'assigned_to_reviewer_at',
  under_review:           'under_review_at',
  coordination_review:    'coordination_review_at',
  response_drafted:       'response_drafted_at',
  stamped_returned:       'stamped_returned_at',
  resubmission_requested: 'resubmission_requested_at',
  closed_out:             'closed_out_at',
  archived:               'archived_at',
  rejected:               'rejected_at',
  void:                   'void_at',
  escalated:              'escalated_at',
};

function statusEnteredAt(row: IpsRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.contractor_drafted_at ? new Date(row.contractor_drafted_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.contractor_drafted_at ? new Date(row.contractor_drafted_at) : null);
}

// Submittal health band - green/amber/red/critical from completeness +
// rejected/void/escalated + SLA. Inert if archived (closed clean).
function submittalHealthBand(
  status: IpsStatus,
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

function decorate(row: IpsRow, now: Date) {
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
  const witnessRequired = !!row.regulatory_witness_required;
  const witnessWindow = regulatoryWitnessWindowHours(tier, witnessRequired);

  const floorFlags = countFloorFlags({
    long_lead_item:              row.long_lead_item,
    commissioning_critical:      row.commissioning_critical,
    regulatory_witness_required: row.regulatory_witness_required,
    lender_information_covenant: row.lender_information_covenant,
    dispute_history:             row.dispute_history,
  });

  const completenessLive = submittalCompletenessIndex({
    contractor_drafted:     !!row.contractor_drafted_at,
    package_assembled:      !!row.package_assembled_at,
    submitted:              !!row.submitted_at,
    screening:              !!row.screening_at,
    assigned_to_reviewer:   !!row.assigned_to_reviewer_at,
    under_review:           !!row.under_review_at,
    coordination_review:    !!row.coordination_review_at,
    response_drafted:       !!row.response_drafted_at,
    stamped_returned:       !!row.stamped_returned_at,
    resubmission_requested: !!row.resubmission_requested_at,
    closed_out:             !!row.closed_out_at,
    archived:               !!row.archived_at,
    clean_close_bonus:      (status === 'archived' || status === 'closed_out') && !row.rejected_at && !row.void_at,
  });

  const daysToLongLead = row.long_lead_deadline_at
    ? Math.floor((new Date(row.long_lead_deadline_at).getTime() - now.getTime()) / (24 * 3600 * 1000))
    : null;

  const healthBand = row.submittal_health_band
    ? row.submittal_health_band
    : submittalHealthBand(
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
    regulatory_witness_window_hours_live: witnessWindow,
    floor_flag_count_live: floorFlags,
    submittal_completeness_index_live: completenessLive,
    submittal_health_band_live: healthBand,
    days_to_long_lead_deadline_live: daysToLongLead,
    bridges_to_document_control_chain_live: bridgesToDocumentControlChain(row.document_control_ref),
    bridges_to_schedule_chain_live: bridgesToScheduleChain(row.schedule_ref),
    bridges_to_evm_chain_live: bridgesToEvmChain(row.evm_ref),
    bridges_to_procurement_chain_live: bridgesToProcurementChain(row.procurement_ref),
    bridges_to_insurance_chain_live: bridgesToInsuranceChain(row.insurance_ref),
    bridges_to_cod_chain_live: bridgesToCodChain(row.cod_ref),
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
  const health     = c.req.query('submittal_health_band');
  const stampCode  = c.req.query('stamp_code');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ipp_submittal WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?'; binds.push(status); }
  if (project)   { sql += ' AND project_id = ?';   binds.push(project); }
  if (health)    { sql += ' AND submittal_health_band = ?'; binds.push(health); }
  if (stampCode) { sql += ' AND stamp_code = ?'; binds.push(stampCode); }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IpsRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_stamp: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.submittal_health_band_live] = (by_health[i.submittal_health_band_live] || 0) + 1;
    if (i.stamp_code) by_stamp[i.stamp_code] = (by_stamp[i.stamp_code] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
  }

  const active_count          = items.filter((i) => !i.is_terminal).length;
  const drafted_count         = items.filter((i) => i.chain_status === 'contractor_drafted').length;
  const assembled_count       = items.filter((i) => i.chain_status === 'package_assembled').length;
  const submitted_count       = items.filter((i) => i.chain_status === 'submitted').length;
  const screening_count       = items.filter((i) => i.chain_status === 'screening').length;
  const assigned_count        = items.filter((i) => i.chain_status === 'assigned_to_reviewer').length;
  const review_phase_count    = items.filter((i) =>
    i.chain_status === 'under_review' ||
    i.chain_status === 'coordination_review' ||
    i.chain_status === 'response_drafted'
  ).length;
  const stamped_count         = items.filter((i) => i.chain_status === 'stamped_returned').length;
  const resub_count           = items.filter((i) => i.chain_status === 'resubmission_requested').length;
  const closed_out_count      = items.filter((i) => i.chain_status === 'closed_out').length;
  const archived_count        = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count        = items.filter((i) => i.chain_status === 'rejected').length;
  const void_count            = items.filter((i) => i.chain_status === 'void').length;
  const escalated_count       = items.filter((i) => i.chain_status === 'escalated').length;
  const critical_safety_count = items.filter((i) => i.current_tier === 'critical_safety').length;
  const breached_count        = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const long_lead_count       = items.filter((i) => i.long_lead_item).length;
  const ccp_count             = items.filter((i) => i.commissioning_critical).length;
  const witness_count         = items.filter((i) => i.regulatory_witness_required).length;
  const dispute_count         = items.filter((i) => i.dispute_history).length;
  const stamp_e_count         = items.filter((i) => i.stamp_code === 'E').length;
  const doc_bridged           = items.filter((i) => i.bridges_to_document_control_chain_live).length;
  const schedule_bridged      = items.filter((i) => i.bridges_to_schedule_chain_live).length;
  const evm_bridged           = items.filter((i) => i.bridges_to_evm_chain_live).length;
  const procurement_bridged   = items.filter((i) => i.bridges_to_procurement_chain_live).length;
  const insurance_bridged     = items.filter((i) => i.bridges_to_insurance_chain_live).length;
  const cod_bridged           = items.filter((i) => i.bridges_to_cod_chain_live).length;
  const cycles_total          = items.reduce((s, i) => s + (i.cycle_count || 0), 0);
  const completeness_avg      = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.submittal_completeness_index_live || 0), 0) / items.length)
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_health,
      by_stamp,
      by_project,
      active_count,
      drafted_count,
      assembled_count,
      submitted_count,
      screening_count,
      assigned_count,
      review_phase_count,
      stamped_count,
      resub_count,
      closed_out_count,
      archived_count,
      rejected_count,
      void_count,
      escalated_count,
      critical_safety_count,
      breached: breached_count,
      reportable_total,
      long_lead_count,
      ccp_count,
      witness_count,
      dispute_count,
      stamp_e_count,
      document_control_bridged_count: doc_bridged,
      schedule_bridged_count: schedule_bridged,
      evm_bridged_count: evm_bridged,
      procurement_bridged_count: procurement_bridged,
      insurance_bridged_count: insurance_bridged,
      cod_bridged_count: cod_bridged,
      cycles_total,
      completeness_avg,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, submittal_health_band, stamp_code, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ipp_submittal GROUP BY chain_status, current_tier, submittal_health_band, stamp_code, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; submittal_health_band: string | null;
    stamp_code: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_stamp: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.submittal_health_band) by_health[r.submittal_health_band] = (by_health[r.submittal_health_band] || 0) + r.n;
    if (r.stamp_code) by_stamp[r.stamp_code] = (by_stamp[r.stamp_code] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_health, by_stamp, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_submittal WHERE id = ?').bind(id).first<IpsRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_submittal_events WHERE submittal_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IpsEventRow>();

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
  narrative?: string;
}

interface CreateBody extends CommonBody {
  project_id?: string;
  project_name?: string;
  project_capacity_mw?: number;
  project_type?: string;
  document_control_ref?: string;
  schedule_ref?: string;
  evm_ref?: string;
  procurement_ref?: string;
  insurance_ref?: string;
  cod_ref?: string;
  submittal_class?: string;
  submittal_type?: string;
  discipline?: string;
  package_code?: string;
  drawing_number?: string;
  drawing_title?: string;
  csi_section?: string;
  contractor_name?: string;
  supplier_name?: string;
  long_lead_item?: boolean | number;
  commissioning_critical?: boolean | number;
  regulatory_witness_required?: boolean | number;
  lender_information_covenant?: boolean | number;
  dispute_history?: boolean | number;
  long_lead_deadline_at?: string;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface AssembleBody extends CommonBody {
  submittal_class?: string;
  submittal_type?: string;
  discipline?: string;
  package_code?: string;
  csi_section?: string;
  drawing_title?: string;
}

interface SubmitBody extends CommonBody {
  last_transmittal_number?: string;
}

interface ScreenBody extends CommonBody {
  doc_controller_name?: string;
}

interface AssignReviewerBody extends CommonBody {
  reviewer_name?: string;
  reviewer_party?: string;
}

interface CommenceReviewBody extends CommonBody {}

interface CoordinateReviewBody extends CommonBody {
  coordination_disciplines?: string;
}

interface DraftResponseBody extends CommonBody {
  comments_summary?: string;
  comments_open?: number;
}

interface StampReturnBody extends CommonBody {
  stamp_code?: IpsStampCode;
  comments_summary?: string;
}

interface RequestResubmissionBody extends CommonBody {}

interface ApproveWithCommentsBody extends CommonBody {
  comments_summary?: string;
}

interface CloseOutBody extends CommonBody {
  owner_rep_name?: string;
}

interface ArchiveBody extends CommonBody {}

interface RejectBody extends CommonBody {
  reject_reason?: string;
}

interface VoidBody extends CommonBody {
  void_reason?: string;
}

interface EscalateBody extends CommonBody {
  escalation_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<IpsRow>): Partial<IpsRow> {
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

// ─── Create endpoint (draft_package) ─────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ips-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `SUB-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const submittalClass = body.submittal_class ?? 'om_manual';
  const flags = {
    long_lead_item:              toFlag(body.long_lead_item) ?? 0,
    commissioning_critical:      toFlag(body.commissioning_critical) ?? 0,
    regulatory_witness_required: toFlag(body.regulatory_witness_required) ?? 0,
    lender_information_covenant: toFlag(body.lender_information_covenant) ?? 0,
    dispute_history:             toFlag(body.dispute_history) ?? 0,
  };
  const rawTier = tierForSubmittalClass(submittalClass);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('contractor_drafted', tier, now);
  const slaHrs = slaWindowHours('contractor_drafted', tier);
  const hashPos = hashChainPositionFor(0);
  const merkleSeg = placeholderMerkleSegment(id, hashPos);
  const witnessWindow = regulatoryWitnessWindowHours(tier, !!flags.regulatory_witness_required);

  await c.env.DB.prepare(
    `INSERT INTO oe_ipp_submittal (
      id, submittal_number,
      project_id, project_name, project_capacity_mw, project_type,
      document_control_ref, schedule_ref, evm_ref, procurement_ref, insurance_ref, cod_ref,
      submittal_class, submittal_type, discipline, package_code,
      drawing_number, drawing_title, csi_section,
      contractor_name, supplier_name,
      cycle_count,
      long_lead_item, commissioning_critical, regulatory_witness_required,
      lender_information_covenant, dispute_history,
      long_lead_deadline_at,
      current_tier, authority_required, urgency_band,
      submittal_completeness_index, regulatory_witness_window_hours,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, contractor_drafted_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      hash_chain_position, merkle_root_segment,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? 'project-unknown', body.project_name ?? null,
    Number(body.project_capacity_mw ?? 0), body.project_type ?? null,
    body.document_control_ref ?? null, body.schedule_ref ?? null,
    body.evm_ref ?? null, body.procurement_ref ?? null,
    body.insurance_ref ?? null, body.cod_ref ?? null,
    submittalClass, body.submittal_type ?? null, body.discipline ?? null, body.package_code ?? null,
    body.drawing_number ?? null, body.drawing_title ?? null, body.csi_section ?? null,
    body.contractor_name ?? null, body.supplier_name ?? null,
    0,
    flags.long_lead_item, flags.commissioning_critical, flags.regulatory_witness_required,
    flags.lender_information_covenant, flags.dispute_history,
    body.long_lead_deadline_at ?? null,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    6, witnessWindow,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'contractor_drafted', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    hashPos, merkleSeg,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ipp_submittal_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_submittal_events (id, submittal_id, event_type, from_status, to_status, stamp_code, cycle_count, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ipp_submittal_drafted',
    null, 'contractor_drafted', null, 0,
    user.id, partyForAction('draft_package'),
    null, JSON.stringify({ tier, submittal_class: submittalClass, project_id: body.project_id }), nowIso,
  ).run();

  await fireCascade({
    event: 'ipp_submittal_drafted',
    actor_id: user.id,
    entity_type: 'ipp_submittal',
    entity_id: id,
    data: {
      tier, submittal_class: submittalClass, project_id: body.project_id,
      chain_status: 'contractor_drafted',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_submittal WHERE id = ?').bind(id).first<IpsRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: IpsAction,
  bodyHandler?: (row: IpsRow, body: Record<string, unknown>) => Partial<IpsRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_submittal WHERE id = ?').bind(id).first<IpsRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current submittal_class + 5 floor flags.
  const submittalClass = (overrides.submittal_class as string | undefined) ?? row.submittal_class;
  const rawTier = tierForSubmittalClass(submittalClass);
  const floorFlags = {
    long_lead_item:
      (overrides.long_lead_item as number | undefined) ?? row.long_lead_item,
    commissioning_critical:
      (overrides.commissioning_critical as number | undefined) ?? row.commissioning_critical,
    regulatory_witness_required:
      (overrides.regulatory_witness_required as number | undefined) ?? row.regulatory_witness_required,
    lender_information_covenant:
      (overrides.lender_information_covenant as number | undefined) ?? row.lender_information_covenant,
    dispute_history:
      (overrides.dispute_history as number | undefined) ?? row.dispute_history,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.regulatory_witness_window_hours = regulatoryWitnessWindowHours(
    tier,
    !!floorFlags.regulatory_witness_required,
  );

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;

  // Action-specific bookkeeping.
  if (action === 'submit') {
    overrides.last_transmittal_at = nowIso;
  }
  if (action === 'close_out' && row.chain_status === 'escalated') {
    overrides.resumed_at = nowIso;
  }
  if (action === 'stamp_return' || action === 'approve_with_comments') {
    const bodyStamp = (body as Partial<StampReturnBody>).stamp_code;
    const stampErr = badEnum('stamp_code', bodyStamp, IPS_STAMP_CODES);
    if (stampErr) return c.json({ success: false, error: stampErr }, 422);
    const stamp = stampForAction(action, bodyStamp ?? null);
    if (stamp) overrides.stamp_code = stamp;
  }

  // Cycle count increments on request_resubmission OR assemble_package from
  // resubmission_requested.
  const newCycleCount = incrementCycleCount(action, row.chain_status, row.cycle_count || 0);
  overrides.cycle_count = newCycleCount;

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof IpsRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = submittalCompletenessIndex({
    contractor_drafted:     willSetTs('contractor_drafted_at'),
    package_assembled:      willSetTs('package_assembled_at'),
    submitted:              willSetTs('submitted_at'),
    screening:              willSetTs('screening_at'),
    assigned_to_reviewer:   willSetTs('assigned_to_reviewer_at'),
    under_review:           willSetTs('under_review_at'),
    coordination_review:    willSetTs('coordination_review_at'),
    response_drafted:       willSetTs('response_drafted_at'),
    stamped_returned:       willSetTs('stamped_returned_at'),
    resubmission_requested: willSetTs('resubmission_requested_at'),
    closed_out:             willSetTs('closed_out_at'),
    archived:               willSetTs('archived_at'),
    clean_close_bonus:      (to === 'archived' || to === 'closed_out') && !row.rejected_at && !row.void_at,
  });
  overrides.submittal_completeness_index = completeness;

  // Re-derive submittal_health_band from new completeness + sticky markers.
  const rejectedNow = to === 'rejected' || !!row.rejected_at;
  const voidedNow = to === 'void' || !!row.void_at;
  const escalatedNow = to === 'escalated' || (!!row.escalated_at && !row.resumed_at);
  overrides.submittal_health_band = submittalHealthBand(
    to,
    completeness,
    !!row.sla_breached,
    rejectedNow,
    voidedNow,
    escalatedNow,
  );

  // SIGNATURE crossings — stamp E + critical_safety/ccp, reject + long_lead +
  // cycles>=3, escalate + witness for critical_safety/material_approval.
  const stampForRegCheck = (overrides.stamp_code as IpsStampCode | undefined) ?? row.stamp_code;
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    stamp_code: stampForRegCheck,
    cycle_count: newCycleCount,
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
    `UPDATE oe_ipp_submittal SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ipp_submittal_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_submittal_events (id, submittal_id, event_type, from_status, to_status, stamp_code, cycle_count, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    (overrides.stamp_code as string | undefined) ?? row.stamp_code ?? null,
    newCycleCount,
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
      entity_type: 'ipp_submittal',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_submittal WHERE id = ?').bind(id).first<IpsRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; draft_package handled by POST /) ──
app.post('/:id/assemble-package', async (c) => transition(c, 'assemble_package', (_row, body) => {
  const b = body as Partial<AssembleBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.submittal_class === 'string') out.submittal_class = b.submittal_class;
  if (typeof b.submittal_type === 'string')  out.submittal_type = b.submittal_type;
  if (typeof b.discipline === 'string')      out.discipline = b.discipline;
  if (typeof b.package_code === 'string')    out.package_code = b.package_code;
  if (typeof b.csi_section === 'string')     out.csi_section = b.csi_section;
  if (typeof b.drawing_title === 'string')   out.drawing_title = b.drawing_title;
  return applyCommon(b, out);
}));

app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.last_transmittal_number === 'string') out.last_transmittal_number = b.last_transmittal_number;
  return applyCommon(b, out);
}));

app.post('/:id/screen', async (c) => transition(c, 'screen', (_row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.doc_controller_name === 'string') out.doc_controller_name = b.doc_controller_name;
  return applyCommon(b, out);
}));

app.post('/:id/assign-reviewer', async (c) => transition(c, 'assign_reviewer', (_row, body) => {
  const b = body as Partial<AssignReviewerBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.reviewer_name === 'string')  out.reviewer_name = b.reviewer_name;
  if (typeof b.reviewer_party === 'string') out.reviewer_party = b.reviewer_party;
  return applyCommon(b, out);
}));

app.post('/:id/commence-review', async (c) => transition(c, 'commence_review', (_row, body) =>
  applyCommon(body as Partial<CommenceReviewBody>, {}),
));

app.post('/:id/coordinate-review', async (c) => transition(c, 'coordinate_review', (_row, body) => {
  const b = body as Partial<CoordinateReviewBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.coordination_disciplines === 'string') out.coordination_disciplines = b.coordination_disciplines;
  return applyCommon(b, out);
}));

app.post('/:id/draft-response', async (c) => transition(c, 'draft_response', (_row, body) => {
  const b = body as Partial<DraftResponseBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  if (typeof b.comments_open === 'number')    out.comments_open = b.comments_open;
  return applyCommon(b, out);
}));

app.post('/:id/stamp-return', async (c) => transition(c, 'stamp_return', (_row, body) => {
  const b = body as Partial<StampReturnBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  // stamp_code handled inside transition() so SIGNATURE crossings see it.
  return applyCommon(b, out);
}));

app.post('/:id/request-resubmission', async (c) => transition(c, 'request_resubmission', (_row, body) =>
  applyCommon(body as Partial<RequestResubmissionBody>, {}),
));

app.post('/:id/approve-with-comments', async (c) => transition(c, 'approve_with_comments', (_row, body) => {
  const b = body as Partial<ApproveWithCommentsBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  return applyCommon(b, out);
}));

app.post('/:id/close-out', async (c) => transition(c, 'close_out', (_row, body) => {
  const b = body as Partial<CloseOutBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.owner_rep_name === 'string') out.owner_rep_name = b.owner_rep_name;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.void_reason === 'string') out.void_reason = b.void_reason;
  return applyCommon(b, out);
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.escalation_reason === 'string') out.escalation_reason = b.escalation_reason;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active submittal whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires
// ipp_submittal_sla_breached. Breach crosses regulator on critical_safety
// + shop_drawing (heavy tiers).
export async function ippSubmittalSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_submittal
     WHERE chain_status NOT IN ('archived', 'rejected', 'void')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IpsRow>();

  const rows = rs.results || [];
  // Per-row UPDATE + event INSERT collected and committed in atomic batches of 100;
  // fireCascade (multi-stage fan-out, not a D1 statement) runs in a separate loop after.
  const stmts: D1PreparedStatement[] = [];
  const toCascade: IpsRow[] = [];
  for (const row of rows) {
    stmts.push(env.DB.prepare(
      `UPDATE oe_ipp_submittal
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id));

    const evtId = `ipp_submittal_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    stmts.push(env.DB.prepare(
      'INSERT INTO oe_ipp_submittal_events (id, submittal_id, event_type, from_status, to_status, stamp_code, cycle_count, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ipp_submittal_sla_breached',
      row.chain_status,
      row.chain_status,
      row.stamp_code,
      row.cycle_count,
      'system',
      'doc_controller',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ));

    if (slaBreachCrossesIntoRegulator(row.current_tier)) toCascade.push(row);
  }

  for (let i = 0; i < stmts.length; i += 100) {
    await env.DB.batch(stmts.slice(i, i + 100));
  }

  for (const row of toCascade) {
    await fireCascade({
      event: 'ipp_submittal_sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_submittal',
      entity_id: row.id,
      data: {
        ...row,
        crosses_into_regulator: true,
      },
      env,
    });
  }

  return { scanned: rows.length, breached: rows.length };
}

// ─── Cron: nightly cycle-count + stamp refresh (00:30 UTC) ────────────────
//
// Walks every active submittal and refreshes the live submittal battery
// (completeness + health band) WITHOUT auto-transitioning. Submittal
// decisions are never moved by cron — only LIVE fields are refreshed so
// dashboards stay current.
export async function ippSubmittalCycleRefresh(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const nowIso = new Date().toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_submittal
     WHERE chain_status NOT IN ('archived', 'rejected', 'void')`,
  ).all<IpsRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const completeness = submittalCompletenessIndex({
      contractor_drafted:     !!row.contractor_drafted_at,
      package_assembled:      !!row.package_assembled_at,
      submitted:              !!row.submitted_at,
      screening:              !!row.screening_at,
      assigned_to_reviewer:   !!row.assigned_to_reviewer_at,
      under_review:           !!row.under_review_at,
      coordination_review:    !!row.coordination_review_at,
      response_drafted:       !!row.response_drafted_at,
      stamped_returned:       !!row.stamped_returned_at,
      resubmission_requested: !!row.resubmission_requested_at,
      closed_out:             !!row.closed_out_at,
      archived:               !!row.archived_at,
      clean_close_bonus:      (row.chain_status === 'archived' || row.chain_status === 'closed_out') && !row.rejected_at && !row.void_at,
    });
    const health = submittalHealthBand(
      row.chain_status,
      completeness,
      !!row.sla_breached,
      !!row.rejected_at,
      !!row.void_at,
      !!row.escalated_at && !row.resumed_at,
    );

    await env.DB.prepare(
      `UPDATE oe_ipp_submittal
       SET submittal_completeness_index = ?,
           submittal_health_band = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(completeness, health, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

export default app;
