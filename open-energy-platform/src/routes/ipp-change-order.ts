// ═══════════════════════════════════════════════════════════════════════════
// Wave 117 — IPP Change Orders & Variations chain.
// 12th IPP-pure chain — TARGET-CLOSING for the Phase-A 12-chain IPP gold
// standard (W1/W10/W19/W20/W23/W27/W112/W113/W114/W115/W116/W117). SIXTH
// AND FINAL Phase-A world-class wave. Mounted at /api/ipp/change-orders/chain.
//
// CR-workflow engine that owns "where is every change order right now,
// who has the ball, is engineering quoted, is the owner reviewing, has
// the IPP CEO approved, is the cumulative CR-value still inside the
// REIPPPP cap, does this CR change the scope baseline or trigger
// regulator re-consent, is anyone on a dispute hold?" for every IPP
// project end-to-end.
//
// Beats Procore Change Mgmt / Aconex Cost Mgmt CRs / Oracle Aconex
// Variations / Autodesk Construction Cloud Cost / e-Builder Change Mgmt
// / Asite CRs / Coreworx Change / SAP S/4HANA EPC variations / Deltek
// Cobra change mgmt / InEight Control change mgmt.
//
// Standards: FIDIC Silver §13 + NEC4 §60-65 + AIA G701/G714 + CSI 01 26 00
// + REIPPPP variations protocol + DMRE EPC change-control circular.
//
// Write {admin, ipp_developer}. READ all 9 personas. 4-party split:
//   PM        : propose, submit_for_review, hold_resume, void
//   engineer  : assess_impact, quote_cost
//   owner_rep : negotiate, reject, dispute
//   IPP_CEO   : approve, issue, schedule, commence_execution,
//               complete_execution, close_out, archive
//
// SIGNATURE Phase-A IPP regulator crossings:
//   approve -> EVERY tier when scope_baseline_change ||
//              regulatory_re_consent_required
//              (W117 SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE hard line)
//   reject  -> EVERY tier when cumulative_change_value_pct >= 15
//   dispute -> major + transformational only
//   close_out, archive, void, hold_resume -> no regulator
//   sla_breached -> major + transformational only
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
  tierForChangeValue,
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
  cumulativeCapBand,
  eacDeltaSign,
  daysToCriticalPathRecovery,
  bridgesToRfiChain,
  bridgesToSubmittalChain,
  bridgesToDocumentControlChain,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToCodChain,
  changeOrderCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
  type IcoStatus,
  type IcoAction,
  type IcoTier,
} from '../utils/ipp-change-order-spec';

const READ_ROLES = new Set([
  'admin', 'ipp_developer',
  'trader', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IcoRow {
  id: string;
  change_order_number: string;

  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  contract_ref: string | null;
  contract_value_zar: number;

  rfi_ref: string | null;
  submittal_ref: string | null;
  document_control_ref: string | null;
  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;

  change_type: string | null;
  change_class: string | null;
  initiator_role: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  spec_section: string | null;
  csi_section: string | null;
  basis_clause: string | null;
  scope_summary_short: string | null;
  scope_summary_long: string | null;
  proposed_resolution: string | null;

  pm_name: string | null;
  engineer_name: string | null;
  owner_rep_name: string | null;
  ceo_name: string | null;
  current_ball_in_court_party: string | null;
  last_actor_party: string | null;

  scope_baseline_change: number;
  regulatory_re_consent_required: number;
  schedule_impact_critical_path: number;
  lender_consent_required: number;
  safety_design_change: number;

  change_value_zar: number;
  schedule_impact_days: number;
  eac_delta_zar: number;
  cumulative_change_value_zar: number;
  cumulative_change_value_pct: number;
  cumulative_cap_band: string | null;

  current_tier: IcoTier;
  authority_required: string | null;
  urgency_band: string | null;
  change_order_health_band: string | null;
  change_order_completeness_index: number;
  change_order_age_days: number;
  days_to_critical_path_recovery: number | null;
  regulator_filing_window_hours: number;

  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  hold_reason: string | null;
  dispute_reason: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: IcoStatus;
  change_proposed_at: string | null;
  impact_assessed_at: string | null;
  cost_quoted_at: string | null;
  owner_review_at: string | null;
  negotiated_at: string | null;
  approved_at: string | null;
  issued_for_execution_at: string | null;
  scheduled_at: string | null;
  executing_at: string | null;
  executed_at: string | null;
  closed_out_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  void_at: string | null;
  on_hold_at: string | null;
  disputed_at: string | null;

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

interface IcoEventRow {
  id: string;
  change_order_id: string;
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
const TIMESTAMP_COLUMN: Record<IcoStatus, keyof IcoRow | null> = {
  change_proposed:      'change_proposed_at',
  impact_assessed:      'impact_assessed_at',
  cost_quoted:          'cost_quoted_at',
  owner_review:         'owner_review_at',
  negotiated:           'negotiated_at',
  approved:             'approved_at',
  issued_for_execution: 'issued_for_execution_at',
  scheduled:            'scheduled_at',
  executing:            'executing_at',
  executed:             'executed_at',
  closed_out:           'closed_out_at',
  archived:             'archived_at',
  rejected:             'rejected_at',
  void:                 'void_at',
  on_hold:              'on_hold_at',
  disputed:             'disputed_at',
};

function statusEnteredAt(row: IcoRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.change_proposed_at ? new Date(row.change_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.change_proposed_at ? new Date(row.change_proposed_at) : null);
}

// CR health band - green/amber/red/critical from completeness +
// rejected/void/disputed/on_hold + SLA. Inert if archived (closed clean).
function changeOrderHealthBand(
  status: IcoStatus,
  completeness: number,
  slaBreached: boolean,
  rejected: boolean,
  voided: boolean,
  disputed: boolean,
  onHold: boolean,
): 'green' | 'amber' | 'red' | 'critical' {
  if (rejected || voided) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (disputed) return 'amber';
  if (onHold) return 'amber';
  if (completeness < 30) return 'amber';
  if (completeness < 90) return 'amber';
  return 'green';
}

function decorate(row: IcoRow, now: Date) {
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
    scope_baseline_change:           row.scope_baseline_change,
    regulatory_re_consent_required:  row.regulatory_re_consent_required,
    schedule_impact_critical_path:   row.schedule_impact_critical_path,
    lender_consent_required:         row.lender_consent_required,
    safety_design_change:            row.safety_design_change,
  });

  const completenessLive = changeOrderCompletenessIndex({
    change_proposed:      !!row.change_proposed_at,
    impact_assessed:      !!row.impact_assessed_at,
    cost_quoted:          !!row.cost_quoted_at,
    owner_review:         !!row.owner_review_at,
    negotiated:           !!row.negotiated_at,
    approved:             !!row.approved_at,
    issued_for_execution: !!row.issued_for_execution_at,
    scheduled:            !!row.scheduled_at,
    executing:            !!row.executing_at,
    executed:             !!row.executed_at,
    closed_out:           !!row.closed_out_at,
    archived:             !!row.archived_at,
    clean_close_bonus:    (status === 'archived' || status === 'closed_out') && !row.rejected_at && !row.void_at,
  });

  const proposedAt = row.change_proposed_at ? new Date(row.change_proposed_at) : null;
  const ageDays = proposedAt
    ? Math.floor((now.getTime() - proposedAt.getTime()) / (24 * 3600 * 1000))
    : 0;

  const cpr = daysToCriticalPathRecovery(
    !!row.schedule_impact_critical_path,
    row.schedule_impact_days,
  );

  const capBand = cumulativeCapBand(row.cumulative_change_value_pct);
  const eacSign = eacDeltaSign(row.eac_delta_zar);

  const healthBand = row.change_order_health_band
    ? row.change_order_health_band
    : changeOrderHealthBand(
        status,
        completenessLive,
        minutesUntilSla != null && minutesUntilSla < 0,
        !!row.rejected_at,
        !!row.void_at,
        status === 'disputed',
        status === 'on_hold',
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
    change_order_completeness_index_live: completenessLive,
    change_order_health_band_live: healthBand,
    change_order_age_days_live: ageDays,
    days_to_critical_path_recovery_live: cpr,
    cumulative_cap_band_live: capBand,
    eac_delta_sign_live: eacSign,
    bridges_to_rfi_chain_live: bridgesToRfiChain(row.rfi_ref),
    bridges_to_submittal_chain_live: bridgesToSubmittalChain(row.submittal_ref),
    bridges_to_document_control_chain_live: bridgesToDocumentControlChain(row.document_control_ref),
    bridges_to_schedule_chain_live: bridgesToScheduleChain(row.schedule_ref),
    bridges_to_evm_chain_live: bridgesToEvmChain(row.evm_ref),
    bridges_to_procurement_chain_live: bridgesToProcurementChain(row.procurement_ref),
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
  const health     = c.req.query('change_order_health_band');
  const cls        = c.req.query('change_class');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ipp_change_order WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?'; binds.push(status); }
  if (project)   { sql += ' AND project_id = ?';   binds.push(project); }
  if (health)    { sql += ' AND change_order_health_band = ?'; binds.push(health); }
  if (cls)       { sql += ' AND change_class = ?'; binds.push(cls); }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IcoRow>();
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
  const by_cap_band: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.change_order_health_band_live] = (by_health[i.change_order_health_band_live] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
    if (i.change_class) by_class[i.change_class] = (by_class[i.change_class] || 0) + 1;
    by_cap_band[i.cumulative_cap_band_live] = (by_cap_band[i.cumulative_cap_band_live] || 0) + 1;
  }

  const active_count             = items.filter((i) => !i.is_terminal).length;
  const proposed_count           = items.filter((i) => i.chain_status === 'change_proposed').length;
  const impact_assessed_count    = items.filter((i) => i.chain_status === 'impact_assessed').length;
  const cost_quoted_count        = items.filter((i) => i.chain_status === 'cost_quoted').length;
  const owner_review_count       = items.filter((i) => i.chain_status === 'owner_review').length;
  const negotiated_count         = items.filter((i) => i.chain_status === 'negotiated').length;
  const approved_count           = items.filter((i) => i.chain_status === 'approved').length;
  const issued_count             = items.filter((i) => i.chain_status === 'issued_for_execution').length;
  const scheduled_count          = items.filter((i) => i.chain_status === 'scheduled').length;
  const executing_count          = items.filter((i) => i.chain_status === 'executing').length;
  const executed_count           = items.filter((i) => i.chain_status === 'executed').length;
  const closed_out_count         = items.filter((i) => i.chain_status === 'closed_out').length;
  const archived_count           = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count           = items.filter((i) => i.chain_status === 'rejected').length;
  const void_count               = items.filter((i) => i.chain_status === 'void').length;
  const on_hold_count            = items.filter((i) => i.chain_status === 'on_hold').length;
  const disputed_count           = items.filter((i) => i.chain_status === 'disputed').length;
  const transformational_count   = items.filter((i) => i.current_tier === 'transformational').length;
  const major_count              = items.filter((i) => i.current_tier === 'major').length;
  const breached_count           = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total         = items.filter((i) => i.is_reportable_flag).length;
  const scope_baseline_count     = items.filter((i) => i.scope_baseline_change).length;
  const regulatory_consent_count = items.filter((i) => i.regulatory_re_consent_required).length;
  const critical_path_count      = items.filter((i) => i.schedule_impact_critical_path).length;
  const lender_consent_count     = items.filter((i) => i.lender_consent_required).length;
  const safety_design_count      = items.filter((i) => i.safety_design_change).length;
  const rfi_bridged              = items.filter((i) => i.bridges_to_rfi_chain_live).length;
  const submittal_bridged        = items.filter((i) => i.bridges_to_submittal_chain_live).length;
  const doc_bridged              = items.filter((i) => i.bridges_to_document_control_chain_live).length;
  const schedule_bridged         = items.filter((i) => i.bridges_to_schedule_chain_live).length;
  const evm_bridged              = items.filter((i) => i.bridges_to_evm_chain_live).length;
  const procurement_bridged      = items.filter((i) => i.bridges_to_procurement_chain_live).length;
  const cod_bridged              = items.filter((i) => i.bridges_to_cod_chain_live).length;
  const completeness_avg         = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.change_order_completeness_index_live || 0), 0) / items.length)
    : 0;
  const change_value_zar_total       = items.reduce((s, i) => s + (i.change_value_zar || 0), 0);
  const cumulative_value_zar_total   = items.reduce((s, i) => s + (i.cumulative_change_value_zar || 0), 0);
  const schedule_impact_days_total   = items.reduce((s, i) => s + (i.schedule_impact_days || 0), 0);
  const eac_delta_zar_total          = items.reduce((s, i) => s + (i.eac_delta_zar || 0), 0);

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
      by_cap_band,
      active_count,
      proposed_count,
      impact_assessed_count,
      cost_quoted_count,
      owner_review_count,
      negotiated_count,
      approved_count,
      issued_count,
      scheduled_count,
      executing_count,
      executed_count,
      closed_out_count,
      archived_count,
      rejected_count,
      void_count,
      on_hold_count,
      disputed_count,
      transformational_count,
      major_count,
      breached: breached_count,
      reportable_total,
      scope_baseline_count,
      regulatory_consent_count,
      critical_path_count,
      lender_consent_count,
      safety_design_count,
      rfi_bridged_count: rfi_bridged,
      submittal_bridged_count: submittal_bridged,
      document_control_bridged_count: doc_bridged,
      schedule_bridged_count: schedule_bridged,
      evm_bridged_count: evm_bridged,
      procurement_bridged_count: procurement_bridged,
      cod_bridged_count: cod_bridged,
      completeness_avg,
      change_value_zar_total,
      cumulative_value_zar_total,
      schedule_impact_days_total,
      eac_delta_zar_total,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, change_order_health_band, change_class, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ipp_change_order GROUP BY chain_status, current_tier, change_order_health_band, change_class, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; change_order_health_band: string | null;
    change_class: string | null;
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
    if (r.change_order_health_band) by_health[r.change_order_health_band] = (by_health[r.change_order_health_band] || 0) + r.n;
    if (r.change_class) by_class[r.change_class] = (by_class[r.change_class] || 0) + r.n;
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_change_order WHERE id = ?').bind(id).first<IcoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_change_order_events WHERE change_order_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IcoEventRow>();

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
  contract_ref?: string;
  contract_value_zar?: number;
  rfi_ref?: string;
  submittal_ref?: string;
  document_control_ref?: string;
  schedule_ref?: string;
  evm_ref?: string;
  procurement_ref?: string;
  cod_ref?: string;
  change_type?: string;
  change_class?: string;
  initiator_role?: string;
  discipline?: string;
  package_code?: string;
  drawing_number?: string;
  spec_section?: string;
  csi_section?: string;
  basis_clause?: string;
  scope_summary_short?: string;
  scope_summary_long?: string;
  proposed_resolution?: string;
  pm_name?: string;
  scope_baseline_change?: boolean | number;
  regulatory_re_consent_required?: boolean | number;
  schedule_impact_critical_path?: boolean | number;
  lender_consent_required?: boolean | number;
  safety_design_change?: boolean | number;
  change_value_zar?: number;
  schedule_impact_days?: number;
  eac_delta_zar?: number;
  cumulative_change_value_zar?: number;
  cumulative_change_value_pct?: number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface AssessImpactBody extends CommonBody {
  engineer_name?: string;
  schedule_impact_days?: number;
  eac_delta_zar?: number;
}

interface QuoteCostBody extends CommonBody {
  change_value_zar?: number;
  cumulative_change_value_zar?: number;
  cumulative_change_value_pct?: number;
}

interface SubmitForReviewBody extends CommonBody {
  owner_rep_name?: string;
}

interface NegotiateBody extends CommonBody {
  scope_summary_long?: string;
  change_value_zar?: number;
}

interface ApproveBody extends CommonBody {
  ceo_name?: string;
}

interface IssueBody extends CommonBody {
  proposed_resolution?: string;
}

interface ScheduleBody extends CommonBody {
  schedule_impact_days?: number;
}

interface CommenceExecutionBody extends CommonBody {
  // no extras
}

interface CompleteExecutionBody extends CommonBody {
  // no extras
}

interface CloseOutBody extends CommonBody {
  // no extras
}

interface RejectBody extends CommonBody {
  reject_reason?: string;
}

interface VoidBody extends CommonBody {
  void_reason?: string;
}

interface HoldResumeBody extends CommonBody {
  hold_reason?: string;
}

interface DisputeBody extends CommonBody {
  dispute_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<IcoRow>): Partial<IcoRow> {
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

// ─── Create endpoint (propose) ─────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ico-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `CO-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const changeValueZar = Number(body.change_value_zar ?? 0);
  const flags = {
    scope_baseline_change:           toFlag(body.scope_baseline_change) ?? 0,
    regulatory_re_consent_required:  toFlag(body.regulatory_re_consent_required) ?? 0,
    schedule_impact_critical_path:   toFlag(body.schedule_impact_critical_path) ?? 0,
    lender_consent_required:         toFlag(body.lender_consent_required) ?? 0,
    safety_design_change:            toFlag(body.safety_design_change) ?? 0,
  };
  const rawTier = tierForChangeValue(changeValueZar);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('change_proposed', tier, now);
  const slaHrs = slaWindowHours('change_proposed', tier);
  const hashPos = hashChainPositionFor(0);
  const merkleSeg = placeholderMerkleSegment(id, hashPos);
  const regFilingWindow = regulatorFilingWindowHours(tier);
  const cumPct = Number(body.cumulative_change_value_pct ?? 0);
  const capBand = cumulativeCapBand(cumPct);

  await c.env.DB.prepare(
    `INSERT INTO oe_ipp_change_order (
      id, change_order_number,
      project_id, project_name, project_capacity_mw, project_type,
      contract_ref, contract_value_zar,
      rfi_ref, submittal_ref, document_control_ref, schedule_ref, evm_ref,
      procurement_ref, cod_ref,
      change_type, change_class, initiator_role, discipline, package_code,
      drawing_number, spec_section, csi_section, basis_clause,
      scope_summary_short, scope_summary_long, proposed_resolution,
      pm_name,
      scope_baseline_change, regulatory_re_consent_required,
      schedule_impact_critical_path, lender_consent_required, safety_design_change,
      change_value_zar, schedule_impact_days, eac_delta_zar,
      cumulative_change_value_zar, cumulative_change_value_pct, cumulative_cap_band,
      current_tier, authority_required, urgency_band,
      change_order_completeness_index, regulator_filing_window_hours,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, change_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      hash_chain_position, merkle_root_segment,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? 'project-unknown', body.project_name ?? null,
    Number(body.project_capacity_mw ?? 0), body.project_type ?? null,
    body.contract_ref ?? null, Number(body.contract_value_zar ?? 0),
    body.rfi_ref ?? null, body.submittal_ref ?? null,
    body.document_control_ref ?? null, body.schedule_ref ?? null, body.evm_ref ?? null,
    body.procurement_ref ?? null, body.cod_ref ?? null,
    body.change_type ?? 'variation', body.change_class ?? 'admin',
    body.initiator_role ?? 'PM', body.discipline ?? null, body.package_code ?? null,
    body.drawing_number ?? null, body.spec_section ?? null, body.csi_section ?? null,
    body.basis_clause ?? null,
    body.scope_summary_short ?? null, body.scope_summary_long ?? null, body.proposed_resolution ?? null,
    body.pm_name ?? null,
    flags.scope_baseline_change, flags.regulatory_re_consent_required,
    flags.schedule_impact_critical_path, flags.lender_consent_required, flags.safety_design_change,
    changeValueZar, Number(body.schedule_impact_days ?? 0), Number(body.eac_delta_zar ?? 0),
    Number(body.cumulative_change_value_zar ?? 0), cumPct, capBand,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    5, regFilingWindow,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'change_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    hashPos, merkleSeg,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ipp_change_order_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_change_order_events (id, change_order_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ipp_change_order_proposed',
    null, 'change_proposed',
    user.id, partyForAction('propose'),
    null, JSON.stringify({ tier, change_value_zar: changeValueZar, project_id: body.project_id }), nowIso,
  ).run();

  await fireCascade({
    event: 'ipp_change_order_proposed',
    actor_id: user.id,
    entity_type: 'ipp_change_order',
    entity_id: id,
    data: {
      tier, change_value_zar: changeValueZar, project_id: body.project_id,
      chain_status: 'change_proposed',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_change_order WHERE id = ?').bind(id).first<IcoRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: IcoAction,
  bodyHandler?: (row: IcoRow, body: Record<string, unknown>) => Partial<IcoRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_change_order WHERE id = ?').bind(id).first<IcoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current change_value_zar + 5 floor flags.
  const changeValueZar = (overrides.change_value_zar as number | undefined) ?? row.change_value_zar;
  const rawTier = tierForChangeValue(changeValueZar);
  const floorFlags = {
    scope_baseline_change:
      (overrides.scope_baseline_change as number | undefined) ?? row.scope_baseline_change,
    regulatory_re_consent_required:
      (overrides.regulatory_re_consent_required as number | undefined) ?? row.regulatory_re_consent_required,
    schedule_impact_critical_path:
      (overrides.schedule_impact_critical_path as number | undefined) ?? row.schedule_impact_critical_path,
    lender_consent_required:
      (overrides.lender_consent_required as number | undefined) ?? row.lender_consent_required,
    safety_design_change:
      (overrides.safety_design_change as number | undefined) ?? row.safety_design_change,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.regulator_filing_window_hours = regulatorFilingWindowHours(tier);

  // Refresh cumulative_cap_band from current cumulative_change_value_pct.
  const cumPct = (overrides.cumulative_change_value_pct as number | undefined) ?? row.cumulative_change_value_pct;
  overrides.cumulative_cap_band = cumulativeCapBand(cumPct);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof IcoRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = changeOrderCompletenessIndex({
    change_proposed:      willSetTs('change_proposed_at'),
    impact_assessed:      willSetTs('impact_assessed_at'),
    cost_quoted:          willSetTs('cost_quoted_at'),
    owner_review:         willSetTs('owner_review_at'),
    negotiated:           willSetTs('negotiated_at'),
    approved:             willSetTs('approved_at'),
    issued_for_execution: willSetTs('issued_for_execution_at'),
    scheduled:            willSetTs('scheduled_at'),
    executing:            willSetTs('executing_at'),
    executed:             willSetTs('executed_at'),
    closed_out:           willSetTs('closed_out_at'),
    archived:             willSetTs('archived_at'),
    clean_close_bonus:    (to === 'archived' || to === 'closed_out') && !row.rejected_at && !row.void_at,
  });
  overrides.change_order_completeness_index = completeness;

  // Re-derive change_order_health_band from new completeness + sticky markers.
  const rejectedNow = to === 'rejected' || !!row.rejected_at;
  const voidedNow = to === 'void' || !!row.void_at;
  const disputedNow = to === 'disputed';
  const onHoldNow = to === 'on_hold';
  overrides.change_order_health_band = changeOrderHealthBand(
    to,
    completeness,
    !!row.sla_breached,
    rejectedNow,
    voidedNow,
    disputedNow,
    onHoldNow,
  );

  // SIGNATURE crossings — approve + scope/regulatory flag, reject + cum
  // pct >= 15, dispute on heavy tiers.
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    cumulative_change_value_pct: cumPct,
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
    `UPDATE oe_ipp_change_order SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ipp_change_order_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_change_order_events (id, change_order_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'ipp_change_order',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_change_order WHERE id = ?').bind(id).first<IcoRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/assess-impact', async (c) => transition(c, 'assess_impact', (_row, body) => {
  const b = body as Partial<AssessImpactBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.engineer_name === 'string') out.engineer_name = b.engineer_name;
  if (typeof b.schedule_impact_days === 'number') out.schedule_impact_days = b.schedule_impact_days;
  if (typeof b.eac_delta_zar === 'number') out.eac_delta_zar = b.eac_delta_zar;
  return applyCommon(b, out);
}));

app.post('/:id/quote-cost', async (c) => transition(c, 'quote_cost', (_row, body) => {
  const b = body as Partial<QuoteCostBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.change_value_zar === 'number') out.change_value_zar = b.change_value_zar;
  if (typeof b.cumulative_change_value_zar === 'number') out.cumulative_change_value_zar = b.cumulative_change_value_zar;
  if (typeof b.cumulative_change_value_pct === 'number') out.cumulative_change_value_pct = b.cumulative_change_value_pct;
  return applyCommon(b, out);
}));

app.post('/:id/submit-for-review', async (c) => transition(c, 'submit_for_review', (_row, body) => {
  const b = body as Partial<SubmitForReviewBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.owner_rep_name === 'string') out.owner_rep_name = b.owner_rep_name;
  return applyCommon(b, out);
}));

app.post('/:id/negotiate', async (c) => transition(c, 'negotiate', (_row, body) => {
  const b = body as Partial<NegotiateBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.scope_summary_long === 'string') out.scope_summary_long = b.scope_summary_long;
  if (typeof b.change_value_zar === 'number') out.change_value_zar = b.change_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.ceo_name === 'string') out.ceo_name = b.ceo_name;
  return applyCommon(b, out);
}));

app.post('/:id/issue', async (c) => transition(c, 'issue', (_row, body) => {
  const b = body as Partial<IssueBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.proposed_resolution === 'string') out.proposed_resolution = b.proposed_resolution;
  return applyCommon(b, out);
}));

app.post('/:id/schedule', async (c) => transition(c, 'schedule', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.schedule_impact_days === 'number') out.schedule_impact_days = b.schedule_impact_days;
  return applyCommon(b, out);
}));

app.post('/:id/commence-execution', async (c) => transition(c, 'commence_execution', (_row, body) =>
  applyCommon(body as Partial<CommenceExecutionBody>, {}),
));

app.post('/:id/complete-execution', async (c) => transition(c, 'complete_execution', (_row, body) =>
  applyCommon(body as Partial<CompleteExecutionBody>, {}),
));

app.post('/:id/close-out', async (c) => transition(c, 'close_out', (_row, body) =>
  applyCommon(body as Partial<CloseOutBody>, {}),
));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.void_reason === 'string') out.void_reason = b.void_reason;
  return applyCommon(b, out);
}));

app.post('/:id/hold-resume', async (c) => transition(c, 'hold_resume', (_row, body) => {
  const b = body as Partial<HoldResumeBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.hold_reason === 'string') out.hold_reason = b.hold_reason;
  return applyCommon(b, out);
}));

app.post('/:id/dispute', async (c) => transition(c, 'dispute', (_row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<IcoRow> = {};
  if (typeof b.dispute_reason === 'string') out.dispute_reason = b.dispute_reason;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active CR whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires
// ipp_change_order_sla_breached. Breach crosses regulator on major +
// transformational (heavy tiers).
export async function ippChangeOrderSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_change_order
     WHERE chain_status NOT IN ('archived', 'rejected', 'void')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IcoRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ipp_change_order
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ipp_change_order_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ipp_change_order_events (id, change_order_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ipp_change_order_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'PM',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'ipp_change_order_sla_breached',
        actor_id: 'system',
        entity_type: 'ipp_change_order',
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

// ─── Cron: nightly cumulative CR-value-pct recompute (00:40 UTC) ──────────
//
// Walks every active CR and refreshes the live CR battery
// (change_order_age_days + completeness + health band + cumulative cap
// band) WITHOUT auto-transitioning. CR decisions are never moved by
// cron — only LIVE fields are refreshed so dashboards stay current.
export async function ippChangeOrderCumPctRefresh(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_change_order
     WHERE chain_status NOT IN ('archived', 'rejected', 'void')`,
  ).all<IcoRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const proposedAt = row.change_proposed_at ? new Date(row.change_proposed_at) : null;
    const ageDays = proposedAt
      ? Math.floor((now.getTime() - proposedAt.getTime()) / (24 * 3600 * 1000))
      : 0;

    const completeness = changeOrderCompletenessIndex({
      change_proposed:      !!row.change_proposed_at,
      impact_assessed:      !!row.impact_assessed_at,
      cost_quoted:          !!row.cost_quoted_at,
      owner_review:         !!row.owner_review_at,
      negotiated:           !!row.negotiated_at,
      approved:             !!row.approved_at,
      issued_for_execution: !!row.issued_for_execution_at,
      scheduled:            !!row.scheduled_at,
      executing:            !!row.executing_at,
      executed:             !!row.executed_at,
      closed_out:           !!row.closed_out_at,
      archived:             !!row.archived_at,
      clean_close_bonus:    (row.chain_status === 'archived' || row.chain_status === 'closed_out') && !row.rejected_at && !row.void_at,
    });
    const capBand = cumulativeCapBand(row.cumulative_change_value_pct);
    const health = changeOrderHealthBand(
      row.chain_status,
      completeness,
      !!row.sla_breached,
      !!row.rejected_at,
      !!row.void_at,
      row.chain_status === 'disputed',
      row.chain_status === 'on_hold',
    );

    await env.DB.prepare(
      `UPDATE oe_ipp_change_order
       SET change_order_age_days = ?, change_order_completeness_index = ?,
           change_order_health_band = ?, cumulative_cap_band = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(ageDays, completeness, health, capBand, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

export default app;
