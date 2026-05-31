// ═══════════════════════════════════════════════════════════════════════════
// Wave 121 - Control-Environment Audit.
//
// FOURTH and FINAL Phase-B wave. Closes Phase B (W118 spine + W119
// exports + W120 attestation + W121 control-environment audit).
//
// Unified control-environment EVIDENCE framework. Where W118 publishes
// the canonical audit-block spine, W119 packages regulator export files,
// W120 attests cross-system books tie out, W121 builds per-control
// evidence dossiers (Design / ToD / ToOE / deficiency / remediation)
// that close the SOC 2 Type II + COSO 2013 ICIF + ISO 27001:2022 ISMS
// certification loop.
//
// 12-state forward + 4 branch lifecycle:
//   control_defined -> design_documented -> walkthrough_completed ->
//     tod_test_planned -> tod_evidence_collected -> tod_test_executed ->
//     tooe_test_planned -> tooe_evidence_collected ->
//     tooe_test_executed -> deficiency_assessed ->
//     remediation_completed -> archived (HARD terminal)
//   any non-terminal -> flag_deficient -> deficient (TERMINAL)
//   any pre-archive -> accept_with_exception -> excepted (SOFT)
//   any active -> suspend -> suspended (SOFT)
//   failed-ToD/ToOE / deficiency / remediation -> initiate_re_test ->
//     remediated_re_test (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS):
//   preventive 168h / detective 240h / corrective 360h / directive 480h
//   / governance 720h. LONGER classification = MORE prep time
//   (deeper evidence, board-level sign-off).
//
// FLOOR-AT-DIRECTIVE on >=1 of 5 floor flags:
//   material_weakness_suspected / regulator_audit_in_progress /
//   soc2_type2_period_open / iso27001_surveillance_audit_due /
//   sox_404_attestation_pending.
//   >=2 lifts to governance.
//
// SIGNATURE Phase-B regulator crossings:
//   * flag_deficient crosses EVERY tier when material_weakness_suspected
//     (W121 SIGNATURE MATERIAL-WEAKNESS-DEFICIENT hard line - SSAE 18 +
//     ISA 265 + JSE 8.62 + Companies Act s30 + COSO Monitoring).
//   * accept_with_exception crosses directive + governance only.
//   * archive crosses EVERY tier when external_auditor_sign_off.
//   * sla_breached crosses directive + governance only.
//
// Write {admin ONLY}. READ all 9 personas. External-auditor read via
// signed JWT on /external/:id (same pattern as W120).
//
// 4-step authority ladder: control_owner -> process_owner -> CISO ->
// audit_committee_chair.
//
// 8 bridges (W118 MANDATORY): W113 EVM + W114 doc-control + W115
// submittal + W116 RFI + W117 CO + W118 block range + W119 export pack
// + W120 attestation ref.
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
  tierForClassification,
  effectiveTier,
  countFloorFlags,
  floorAtDirective,
  floorAtGovernance,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  auditWindowHours,
  daysToQuarterlyCutoff,
  daysToAnnualAudit,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  bridgesToW118AuditChain,
  bridgesToW119RegulatorExportChain,
  bridgesToW120ReconciliationAttestationChain,
  designDocumentationCompletenessIndex,
  todTestCompletenessIndex,
  tooeTestCompletenessIndex,
  evidenceCoverageIndex,
  controlHealthBand,
  isValidExternalAuditorJwtFormat,
  parseExternalAuditorClaims,
  isExternalAuditorClaimsExpired,
  externalAuditorCanReadControl,
  CONTROL_FRAMEWORKS,
  CONTROL_CLASSIFICATIONS,
  DEFICIENCY_SEVERITIES,
  type CeaStatus,
  type CeaAction,
  type CeaTier,
  type CeaClassification,
  type DeficiencySeverity,
  type ExternalAuditorClaims,
} from '../utils/control-environment-audit-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W121 = admin ONLY. Regulator + 7 other personas READ-ONLY.
const WRITE_ROLES = new Set(['admin']);

interface CeaRow {
  id: string;
  control_number: string;
  control_classification: CeaClassification;
  control_framework: string | null;
  framework_control_ref: string | null;
  period_label: string;
  period_start: string | null;
  period_end: string | null;

  w113_evm_ref: string | null;
  w114_doc_control_ref: string | null;
  w115_submittal_ref: string | null;
  w116_rfi_ref: string | null;
  w117_change_order_ref: string | null;
  w118_block_height_range_low: number | null;
  w118_block_height_range_high: number | null;
  w119_export_pack_ref: string | null;
  w120_attestation_ref: string | null;
  parent_control_id: string | null;

  material_weakness_suspected: number;
  regulator_audit_in_progress: number;
  soc2_type2_period_open: number;
  iso27001_surveillance_audit_due: number;
  sox_404_attestation_pending: number;

  control_description: number;
  control_objective: number;
  responsible_party: number;
  frequency_documented: number;
  inputs_documented: number;
  outputs_documented: number;
  ipe_documented: number;
  manual_or_automated: number;
  coso_principle_mapped: number;
  iso27001_control_mapped: number;
  soc2_criteria_mapped: number;
  walkthrough_evidence: number;
  soa_linked: number;

  tod_sample_size: number;
  tod_reviewer_signoff: number;
  tod_pass_rate_pct: number;
  tod_exceptions_logged: number;
  tod_passed: number;

  tooe_sample_size: number;
  tooe_reviewer_signoff: number;
  tooe_pass_rate_pct: number;
  tooe_exceptions_logged: number;
  tooe_passed: number;

  deficiency_severity: DeficiencySeverity | null;
  remediation_progress_pct: number;
  external_auditor_sign_off: number;

  current_tier: CeaTier;
  authority_required: string | null;
  urgency_band: string | null;
  control_health_band: string | null;
  design_documentation_completeness_index: number;
  tod_test_completeness_index: number;
  tooe_test_completeness_index: number;
  evidence_coverage_index: number;
  audit_window_hours: number;
  days_to_quarterly_cutoff: number;
  days_to_annual_audit: number;

  title: string | null;
  reason_code: string | null;
  deficient_reason: string | null;
  exception_reason: string | null;
  suspend_reason: string | null;

  is_reportable_flag: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  external_auditor_firm: string | null;
  external_auditor_engagement_ref: string | null;
  external_auditor_jwt_jti: string | null;

  chain_status: CeaStatus;
  control_defined_at: string | null;
  design_documented_at: string | null;
  walkthrough_completed_at: string | null;
  tod_test_planned_at: string | null;
  tod_evidence_collected_at: string | null;
  tod_test_executed_at: string | null;
  tooe_test_planned_at: string | null;
  tooe_evidence_collected_at: string | null;
  tooe_test_executed_at: string | null;
  deficiency_assessed_at: string | null;
  remediation_completed_at: string | null;
  archived_at: string | null;
  deficient_at: string | null;
  excepted_at: string | null;
  suspended_at: string | null;
  remediated_re_test_at: string | null;

  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;

  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  escalation_level: number;

  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CeaEventRow {
  id: string;
  control_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_tier: string | null;
  to_tier: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CeaStatus, keyof CeaRow> = {
  control_defined:        'control_defined_at',
  design_documented:      'design_documented_at',
  walkthrough_completed:  'walkthrough_completed_at',
  tod_test_planned:       'tod_test_planned_at',
  tod_evidence_collected: 'tod_evidence_collected_at',
  tod_test_executed:      'tod_test_executed_at',
  tooe_test_planned:      'tooe_test_planned_at',
  tooe_evidence_collected:'tooe_evidence_collected_at',
  tooe_test_executed:     'tooe_test_executed_at',
  deficiency_assessed:    'deficiency_assessed_at',
  remediation_completed:  'remediation_completed_at',
  archived:               'archived_at',
  deficient:              'deficient_at',
  excepted:               'excepted_at',
  suspended:              'suspended_at',
  remediated_re_test:     'remediated_re_test_at',
};

function statusEnteredAt(row: CeaRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.control_defined_at ? new Date(row.control_defined_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.control_defined_at ? new Date(row.control_defined_at) : null);
}

function rowFloorFlags(row: CeaRow) {
  return {
    material_weakness_suspected:     row.material_weakness_suspected,
    regulator_audit_in_progress:     row.regulator_audit_in_progress,
    soc2_type2_period_open:          row.soc2_type2_period_open,
    iso27001_surveillance_audit_due: row.iso27001_surveillance_audit_due,
    sox_404_attestation_pending:     row.sox_404_attestation_pending,
  };
}

function decorate(row: CeaRow, now: Date) {
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
  const window = auditWindowHours(tier);
  const daysToQ = daysToQuarterlyCutoff(now);
  const daysToA = daysToAnnualAudit(now);

  const flags = rowFloorFlags(row);
  const floorFlagsCount = countFloorFlags(flags);
  const floorDirective = floorAtDirective(flags);
  const floorGovernance = floorAtGovernance(flags);

  const designLive = designDocumentationCompletenessIndex({
    control_description:     !!row.control_description,
    control_objective:       !!row.control_objective,
    control_classification:  !!row.control_classification,
    responsible_party:       !!row.responsible_party,
    frequency_documented:    !!row.frequency_documented,
    inputs_documented:       !!row.inputs_documented,
    outputs_documented:      !!row.outputs_documented,
    ipe_documented:          !!row.ipe_documented,
    manual_or_automated:     !!row.manual_or_automated,
    preventive_or_detective: !!row.control_classification,
    coso_principle_mapped:   !!row.coso_principle_mapped,
    iso27001_control_mapped: !!row.iso27001_control_mapped,
    soc2_criteria_mapped:    !!row.soc2_criteria_mapped,
    walkthrough_evidence:    !!row.walkthrough_evidence,
    soa_linked:              !!row.soa_linked,
  });

  const todLive = todTestCompletenessIndex({
    tod_test_plan:                 !!row.tod_test_planned_at,
    tod_sample_size_documented:    row.tod_sample_size > 0,
    tod_sample_population_defined: row.tod_sample_size > 0,
    tod_evidence_collected:        !!row.tod_evidence_collected_at,
    tod_test_executed:             !!row.tod_test_executed_at,
    tod_reviewer_signoff:          !!row.tod_reviewer_signoff,
    tod_pass_rate_pct:             row.tod_pass_rate_pct,
    tod_exceptions_logged:         !!row.tod_exceptions_logged,
    tod_root_cause_assessed:       !!row.tod_exceptions_logged,
    tod_remediation_proposed:      !!row.remediation_completed_at || row.remediation_progress_pct > 0,
    tod_passed:                    !!row.tod_passed,
  });

  const tooeLive = tooeTestCompletenessIndex({
    tooe_test_plan:                 !!row.tooe_test_planned_at,
    tooe_sample_size_documented:    row.tooe_sample_size > 0,
    tooe_period_defined:            !!row.period_start && !!row.period_end,
    tooe_sample_population_defined: row.tooe_sample_size > 0,
    tooe_evidence_collected:        !!row.tooe_evidence_collected_at,
    tooe_test_executed:             !!row.tooe_test_executed_at,
    tooe_reviewer_signoff:          !!row.tooe_reviewer_signoff,
    tooe_pass_rate_pct:             row.tooe_pass_rate_pct,
    tooe_exceptions_logged:         !!row.tooe_exceptions_logged,
    tooe_root_cause_assessed:       !!row.tooe_exceptions_logged,
    tooe_remediation_proposed:      !!row.remediation_completed_at || row.remediation_progress_pct > 0,
    tooe_passed:                    !!row.tooe_passed,
    external_auditor_sign_off:      !!row.external_auditor_sign_off,
  });

  const evidenceLive = evidenceCoverageIndex({
    w118_block_range_paired:         row.w118_block_height_range_low != null,
    w119_export_pack_attached:       !!row.w119_export_pack_ref,
    w120_attestation_ref_attached:   !!row.w120_attestation_ref,
    w113_evm_ref_attached:           !!row.w113_evm_ref,
    w114_doc_control_ref_attached:   !!row.w114_doc_control_ref,
    w115_submittal_ref_attached:     !!row.w115_submittal_ref,
    w116_rfi_ref_attached:           !!row.w116_rfi_ref,
    w117_change_order_ref_attached:  !!row.w117_change_order_ref,
    walkthrough_evidence:            !!row.walkthrough_evidence,
    tod_evidence_collected:          !!row.tod_evidence_collected_at,
    tooe_evidence_collected:         !!row.tooe_evidence_collected_at,
    reviewer_signoff:                !!row.tod_reviewer_signoff || !!row.tooe_reviewer_signoff,
    external_auditor_sign_off:       !!row.external_auditor_sign_off,
  });

  const healthLive = controlHealthBand(
    status,
    designLive,
    todLive,
    tooeLive,
    evidenceLive,
    minutesUntilSla != null && minutesUntilSla < 0,
    status === 'deficient',
    status === 'excepted',
    flags,
    row.deficiency_severity ?? null,
  );

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_hours: slaWindowHours(status, tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    audit_window_hours_live: window,
    days_to_quarterly_cutoff_live: daysToQ,
    days_to_annual_audit_live: daysToA,
    floor_flag_count_live: floorFlagsCount,
    floor_at_directive_live: floorDirective,
    floor_at_governance_live: floorGovernance,
    design_documentation_completeness_index_live: designLive,
    tod_test_completeness_index_live: todLive,
    tooe_test_completeness_index_live: tooeLive,
    evidence_coverage_index_live: evidenceLive,
    control_health_band_live: healthLive,
    bridges_to_w113_evm_chain_live: bridgesToW113EvmChain(row.w113_evm_ref),
    bridges_to_w114_doc_control_chain_live: bridgesToW114DocControlChain(row.w114_doc_control_ref),
    bridges_to_w115_submittal_chain_live: bridgesToW115SubmittalChain(row.w115_submittal_ref),
    bridges_to_w116_rfi_chain_live: bridgesToW116RfiChain(row.w116_rfi_ref),
    bridges_to_w117_change_order_chain_live: bridgesToW117ChangeOrderChain(row.w117_change_order_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(
      row.w118_block_height_range_low != null ? String(row.w118_block_height_range_low) : null,
    ),
    bridges_to_w119_regulator_export_chain_live: bridgesToW119RegulatorExportChain(row.w119_export_pack_ref),
    bridges_to_w120_reconciliation_attestation_chain_live: bridgesToW120ReconciliationAttestationChain(row.w120_attestation_ref),
  };
}

// External-auditor sanitised projection - strips internal fields,
// returns the control evidence dossier the auditor is authorised to read.
function externalAuditorView(row: CeaRow, now: Date) {
  const decorated = decorate(row, now);
  return {
    id: row.id,
    control_number: row.control_number,
    control_classification: row.control_classification,
    control_framework: row.control_framework,
    framework_control_ref: row.framework_control_ref,
    period_label: row.period_label,
    period_start: row.period_start,
    period_end: row.period_end,
    chain_status: row.chain_status,
    current_tier: row.current_tier,
    authority_required: row.authority_required,
    control_health_band: decorated.control_health_band_live,
    // Bridges
    w118_block_height_range_low: row.w118_block_height_range_low,
    w118_block_height_range_high: row.w118_block_height_range_high,
    w119_export_pack_ref: row.w119_export_pack_ref,
    w120_attestation_ref: row.w120_attestation_ref,
    bridges_to_w118_audit_chain: decorated.bridges_to_w118_audit_chain_live,
    bridges_to_w119_regulator_export_chain: decorated.bridges_to_w119_regulator_export_chain_live,
    bridges_to_w120_reconciliation_attestation_chain: decorated.bridges_to_w120_reconciliation_attestation_chain_live,
    // Scoring
    design_documentation_completeness_index: decorated.design_documentation_completeness_index_live,
    tod_test_completeness_index: decorated.tod_test_completeness_index_live,
    tooe_test_completeness_index: decorated.tooe_test_completeness_index_live,
    evidence_coverage_index: decorated.evidence_coverage_index_live,
    // ToD/ToOE outcome
    tod_passed: row.tod_passed,
    tooe_passed: row.tooe_passed,
    tod_pass_rate_pct: row.tod_pass_rate_pct,
    tooe_pass_rate_pct: row.tooe_pass_rate_pct,
    tod_sample_size: row.tod_sample_size,
    tooe_sample_size: row.tooe_sample_size,
    // Deficiency
    deficiency_severity: row.deficiency_severity,
    remediation_progress_pct: row.remediation_progress_pct,
    external_auditor_sign_off: row.external_auditor_sign_off,
    // Reportability
    is_reportable_flag: row.is_reportable_flag,
    regulator_relevant: row.regulator_relevant,
    regulator_crossed_at: row.regulator_crossed_at,
    regulator_ref: row.regulator_ref,
    // Lifecycle
    control_defined_at: row.control_defined_at,
    tooe_test_executed_at: row.tooe_test_executed_at,
    remediation_completed_at: row.remediation_completed_at,
    archived_at: row.archived_at,
    deficient_at: row.deficient_at,
    // Engagement metadata
    external_auditor_firm: row.external_auditor_firm,
    external_auditor_engagement_ref: row.external_auditor_engagement_ref,
  };
}

const app = new Hono<HonoEnv>();

app.use('*', authMiddleware);

// ─── External-auditor signed-JWT-gated read endpoint ─────────────────────
//
// GET /api/control-environment-audit/external/:id
//   Headers: x-external-auditor-jwt: <signed JWT>
//   JWT must be HS256-signed with the platform external-auditor key and
//   carry aud=external_auditor + scope array containing the control ID
//   (or "*"). Returns sanitised control evidence dossier.
app.get('/external/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const auditorJwt = c.req.header('x-external-auditor-jwt') || '';
  if (!isValidExternalAuditorJwtFormat(auditorJwt)) {
    return c.json({ success: false, error: 'External-auditor JWT missing or malformed' }, 401);
  }

  let claims: ExternalAuditorClaims | null = null;
  try {
    const parts = auditorJwt.split('.');
    if (parts.length === 3) {
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
      const payloadJson = atob(padded);
      claims = parseExternalAuditorClaims(payloadJson);
    }
  } catch {
    claims = null;
  }
  if (!claims) {
    return c.json({ success: false, error: 'External-auditor JWT claims unreadable' }, 401);
  }

  const now = new Date();
  if (isExternalAuditorClaimsExpired(claims, now)) {
    return c.json({ success: false, error: 'External-auditor JWT expired' }, 401);
  }

  const id = c.req.param('id')!;
  if (!externalAuditorCanReadControl(claims, id, now)) {
    return c.json({ success: false, error: 'External-auditor JWT does not authorise this control' }, 403);
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_control_environment_audit WHERE id = ?',
  ).bind(id).first<CeaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  return c.json({
    success: true,
    data: {
      control: externalAuditorView(row, now),
      auditor: {
        sub: claims.sub,
        firm: claims.audit_firm ?? row.external_auditor_firm,
        engagement_ref: claims.engagement_ref ?? row.external_auditor_engagement_ref,
        scope_match: id,
      },
    },
  });
});

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier           = c.req.query('tier');
  const status         = c.req.query('status');
  const classification = c.req.query('classification');
  const framework      = c.req.query('framework');
  const health         = c.req.query('control_health_band');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_control_environment_audit WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)           { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)         { sql += ' AND chain_status = ?'; binds.push(status); }
  if (classification) { sql += ' AND control_classification = ?'; binds.push(classification); }
  if (framework)      { sql += ' AND control_framework = ?'; binds.push(framework); }
  if (health)         { sql += ' AND control_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CeaRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => !!r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_classification: Record<string, number> = {};
  const by_framework: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_classification[i.control_classification] = (by_classification[i.control_classification] || 0) + 1;
    if (i.control_framework) by_framework[i.control_framework] = (by_framework[i.control_framework] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.control_health_band_live] = (by_health[i.control_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const defined_count       = items.filter((i) => i.chain_status === 'control_defined').length;
  const design_count        = items.filter((i) => i.chain_status === 'design_documented').length;
  const walkthrough_count   = items.filter((i) => i.chain_status === 'walkthrough_completed').length;
  const tod_planned_count   = items.filter((i) => i.chain_status === 'tod_test_planned').length;
  const tod_evidence_count  = items.filter((i) => i.chain_status === 'tod_evidence_collected').length;
  const tod_executed_count  = items.filter((i) => i.chain_status === 'tod_test_executed').length;
  const tooe_planned_count  = items.filter((i) => i.chain_status === 'tooe_test_planned').length;
  const tooe_evidence_count = items.filter((i) => i.chain_status === 'tooe_evidence_collected').length;
  const tooe_executed_count = items.filter((i) => i.chain_status === 'tooe_test_executed').length;
  const deficiency_count    = items.filter((i) => i.chain_status === 'deficiency_assessed').length;
  const remediation_count   = items.filter((i) => i.chain_status === 'remediation_completed').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const deficient_count     = items.filter((i) => i.chain_status === 'deficient').length;
  const excepted_count      = items.filter((i) => i.chain_status === 'excepted').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const re_test_count       = items.filter((i) => i.chain_status === 'remediated_re_test').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => !!i.is_reportable_flag).length;
  const material_weakness_total = items.filter((i) => i.deficiency_severity === 'material_weakness').length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w113_bridged        = items.filter((i) => i.bridges_to_w113_evm_chain_live).length;
  const w114_bridged        = items.filter((i) => i.bridges_to_w114_doc_control_chain_live).length;
  const w115_bridged        = items.filter((i) => i.bridges_to_w115_submittal_chain_live).length;
  const w116_bridged        = items.filter((i) => i.bridges_to_w116_rfi_chain_live).length;
  const w117_bridged        = items.filter((i) => i.bridges_to_w117_change_order_chain_live).length;
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w119_bridged        = items.filter((i) => i.bridges_to_w119_regulator_export_chain_live).length;
  const w120_bridged        = items.filter((i) => i.bridges_to_w120_reconciliation_attestation_chain_live).length;

  const design_avg     = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.design_documentation_completeness_index_live || 0), 0) / items.length)
    : 0;
  const tod_avg        = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.tod_test_completeness_index_live || 0), 0) / items.length)
    : 0;
  const tooe_avg       = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.tooe_test_completeness_index_live || 0), 0) / items.length)
    : 0;
  const evidence_avg   = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.evidence_coverage_index_live || 0), 0) / items.length)
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_classification,
      by_framework,
      by_urgency,
      by_health,
      active_count,
      defined_count,
      design_count,
      walkthrough_count,
      tod_planned_count,
      tod_evidence_count,
      tod_executed_count,
      tooe_planned_count,
      tooe_evidence_count,
      tooe_executed_count,
      deficiency_count,
      remediation_count,
      archived_count,
      deficient_count,
      excepted_count,
      suspended_count,
      re_test_count,
      breached: breached_count,
      reportable_total,
      material_weakness_total,
      floor_flag_total,
      w113_bridged_count: w113_bridged,
      w114_bridged_count: w114_bridged,
      w115_bridged_count: w115_bridged,
      w116_bridged_count: w116_bridged,
      w117_bridged_count: w117_bridged,
      w118_bridged_count: w118_bridged,
      w119_bridged_count: w119_bridged,
      w120_bridged_count: w120_bridged,
      design_avg,
      tod_avg,
      tooe_avg,
      evidence_avg,
      control_frameworks: CONTROL_FRAMEWORKS,
      control_classifications: CONTROL_CLASSIFICATIONS,
      deficiency_severities: DEFICIENCY_SEVERITIES,
    },
  });
});

// ─── Aggregate ───────────────────────────────────────────────────────────
app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, control_health_band, control_classification,
            regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_control_environment_audit
     GROUP BY chain_status, current_tier, control_health_band, control_classification,
              regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; control_health_band: string | null;
    control_classification: string | null; regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_classification: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.control_health_band) by_health[r.control_health_band] = (by_health[r.control_health_band] || 0) + r.n;
    if (r.control_classification) by_classification[r.control_classification] = (by_classification[r.control_classification] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_classification,
      by_regulator_relevant, by_sla_breached,
      control_frameworks: CONTROL_FRAMEWORKS,
      control_classifications: CONTROL_CLASSIFICATIONS,
      deficiency_severities: DEFICIENCY_SEVERITIES,
    },
  });
});

// ─── Get one ─────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_control_environment_audit WHERE id = ?',
  ).bind(id).first<CeaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_control_environment_audit_events WHERE control_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CeaEventRow>();

  return c.json({
    success: true,
    data: {
      control: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Body interfaces ──────────────────────────────────────────────────────
interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  regulator_inbox_ref?: string;
  title?: string;
}

interface CreateBody extends CommonBody {
  control_classification?: CeaClassification;
  control_framework?: string;
  framework_control_ref?: string;
  period_label?: string;
  period_start?: string;
  period_end?: string;
  w113_evm_ref?: string;
  w114_doc_control_ref?: string;
  w115_submittal_ref?: string;
  w116_rfi_ref?: string;
  w117_change_order_ref?: string;
  w118_block_height_range_low?: number;
  w118_block_height_range_high?: number;
  w119_export_pack_ref?: string;
  w120_attestation_ref?: string;
  parent_control_id?: string;
  material_weakness_suspected?: boolean | number;
  regulator_audit_in_progress?: boolean | number;
  soc2_type2_period_open?: boolean | number;
  iso27001_surveillance_audit_due?: boolean | number;
  sox_404_attestation_pending?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  external_auditor_firm?: string;
  external_auditor_engagement_ref?: string;
  tenant_id?: string;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<CeaRow>): Partial<CeaRow> {
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  if (typeof b.regulator_inbox_ref === 'string') out.regulator_inbox_ref = b.regulator_inbox_ref;
  if (typeof b.title === 'string')               out.title = b.title;
  return out;
}

// ─── Create endpoint (define_control) ────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `cea-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const classification: CeaClassification =
    (body.control_classification as CeaClassification | undefined) ?? 'detective';
  const periodLabel = typeof body.period_label === 'string' ? body.period_label : '';
  if (!periodLabel) {
    return c.json({ success: false, error: 'period_label required' }, 400);
  }

  const flags = {
    material_weakness_suspected:     toFlag(body.material_weakness_suspected) ?? 0,
    regulator_audit_in_progress:     toFlag(body.regulator_audit_in_progress) ?? 0,
    soc2_type2_period_open:          toFlag(body.soc2_type2_period_open) ?? 0,
    iso27001_surveillance_audit_due: toFlag(body.iso27001_surveillance_audit_due) ?? 0,
    sox_404_attestation_pending:     toFlag(body.sox_404_attestation_pending) ?? 0,
  };
  const rawTier = tierForClassification(classification);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('control_defined', tier, now);
  const slaHrs = slaWindowHours('control_defined', tier);
  const window = auditWindowHours(tier);
  const daysToQ = daysToQuarterlyCutoff(now);
  const daysToA = daysToAnnualAudit(now);

  // Control number = CEA-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_control_environment_audit`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const ctlNum = `CEA-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  await c.env.DB.prepare(
    `INSERT INTO oe_control_environment_audit (
      id, control_number, control_classification, control_framework, framework_control_ref,
      period_label, period_start, period_end,
      w113_evm_ref, w114_doc_control_ref, w115_submittal_ref,
      w116_rfi_ref, w117_change_order_ref,
      w118_block_height_range_low, w118_block_height_range_high,
      w119_export_pack_ref, w120_attestation_ref, parent_control_id,
      material_weakness_suspected, regulator_audit_in_progress,
      soc2_type2_period_open, iso27001_surveillance_audit_due,
      sox_404_attestation_pending,
      current_tier, authority_required, urgency_band,
      design_documentation_completeness_index, tod_test_completeness_index,
      tooe_test_completeness_index, evidence_coverage_index,
      audit_window_hours, days_to_quarterly_cutoff, days_to_annual_audit,
      title,
      is_reportable_flag, regulator_relevant, regulator_reason_text,
      external_auditor_firm, external_auditor_engagement_ref,
      chain_status, control_defined_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ctlNum, classification, body.control_framework ?? null, body.framework_control_ref ?? null,
    periodLabel, body.period_start ?? null, body.period_end ?? null,
    body.w113_evm_ref ?? null, body.w114_doc_control_ref ?? null, body.w115_submittal_ref ?? null,
    body.w116_rfi_ref ?? null, body.w117_change_order_ref ?? null,
    body.w118_block_height_range_low ?? null, body.w118_block_height_range_high ?? null,
    body.w119_export_pack_ref ?? null, body.w120_attestation_ref ?? null, body.parent_control_id ?? null,
    flags.material_weakness_suspected, flags.regulator_audit_in_progress,
    flags.soc2_type2_period_open, flags.iso27001_surveillance_audit_due,
    flags.sox_404_attestation_pending,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    0, 0, 0, 0,
    window, daysToQ, daysToA,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    body.external_auditor_firm ?? null, body.external_auditor_engagement_ref ?? null,
    'control_defined', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `control_environment_audit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_control_environment_audit_events (id, control_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'control_environment_audit_defined',
    null, 'control_defined', null, tier,
    user.id, partyForAction('define_control'),
    null, JSON.stringify({ tier, classification, period_label: periodLabel }), nowIso,
  ).run();

  await fireCascade({
    event: 'control_environment_audit_defined' as never,
    actor_id: user.id,
    entity_type: 'control_environment_audit',
    entity_id: id,
    data: { tier, classification, period_label: periodLabel, chain_status: 'control_defined' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare(
    'SELECT * FROM oe_control_environment_audit WHERE id = ?',
  ).bind(id).first<CeaRow>();
  return c.json({ success: true, data: { control: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: CeaAction,
  bodyHandler?: (row: CeaRow, body: Record<string, unknown>) => Partial<CeaRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_control_environment_audit WHERE id = ?',
  ).bind(id).first<CeaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // HARD_TERMINALS check fires BEFORE TRANSITIONS lookup.
  if (isHardTerminal(row.chain_status)) {
    return c.json({
      success: false,
      error: `Cannot transition from hard-terminal state ${row.chain_status}`,
    }, 422);
  }

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from classification + 5 floor flags on every transition.
  const classification =
    (overrides.control_classification as CeaClassification | undefined) ?? row.control_classification;
  const rawTier = tierForClassification(classification);
  const floorFlags = {
    material_weakness_suspected:
      (overrides.material_weakness_suspected as number | undefined) ?? row.material_weakness_suspected,
    regulator_audit_in_progress:
      (overrides.regulator_audit_in_progress as number | undefined) ?? row.regulator_audit_in_progress,
    soc2_type2_period_open:
      (overrides.soc2_type2_period_open as number | undefined) ?? row.soc2_type2_period_open,
    iso27001_surveillance_audit_due:
      (overrides.iso27001_surveillance_audit_due as number | undefined) ?? row.iso27001_surveillance_audit_due,
    sox_404_attestation_pending:
      (overrides.sox_404_attestation_pending as number | undefined) ?? row.sox_404_attestation_pending,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.audit_window_hours = auditWindowHours(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;
  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Helper: whether a timestamp column will be set on this transition
  // (either freshly via tsCol, or already populated).
  const willSetTs = (col: keyof CeaRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };

  // Re-derive design documentation completeness.
  const design = designDocumentationCompletenessIndex({
    control_description:     ((overrides.control_description as number | undefined) ?? row.control_description) > 0,
    control_objective:       ((overrides.control_objective as number | undefined) ?? row.control_objective) > 0,
    control_classification:  !!classification,
    responsible_party:       ((overrides.responsible_party as number | undefined) ?? row.responsible_party) > 0,
    frequency_documented:    ((overrides.frequency_documented as number | undefined) ?? row.frequency_documented) > 0,
    inputs_documented:       ((overrides.inputs_documented as number | undefined) ?? row.inputs_documented) > 0,
    outputs_documented:      ((overrides.outputs_documented as number | undefined) ?? row.outputs_documented) > 0,
    ipe_documented:          ((overrides.ipe_documented as number | undefined) ?? row.ipe_documented) > 0,
    manual_or_automated:     ((overrides.manual_or_automated as number | undefined) ?? row.manual_or_automated) > 0,
    preventive_or_detective: !!classification,
    coso_principle_mapped:   ((overrides.coso_principle_mapped as number | undefined) ?? row.coso_principle_mapped) > 0,
    iso27001_control_mapped: ((overrides.iso27001_control_mapped as number | undefined) ?? row.iso27001_control_mapped) > 0,
    soc2_criteria_mapped:    ((overrides.soc2_criteria_mapped as number | undefined) ?? row.soc2_criteria_mapped) > 0,
    walkthrough_evidence:    ((overrides.walkthrough_evidence as number | undefined) ?? row.walkthrough_evidence) > 0,
    soa_linked:              ((overrides.soa_linked as number | undefined) ?? row.soa_linked) > 0,
  });
  overrides.design_documentation_completeness_index = design;

  // Re-derive ToD completeness.
  const tod = todTestCompletenessIndex({
    tod_test_plan:                 willSetTs('tod_test_planned_at') || !!row.tod_test_planned_at,
    tod_sample_size_documented:    ((overrides.tod_sample_size as number | undefined) ?? row.tod_sample_size) > 0,
    tod_sample_population_defined: ((overrides.tod_sample_size as number | undefined) ?? row.tod_sample_size) > 0,
    tod_evidence_collected:        willSetTs('tod_evidence_collected_at') || !!row.tod_evidence_collected_at,
    tod_test_executed:             willSetTs('tod_test_executed_at') || !!row.tod_test_executed_at,
    tod_reviewer_signoff:          ((overrides.tod_reviewer_signoff as number | undefined) ?? row.tod_reviewer_signoff) > 0,
    tod_pass_rate_pct:             (overrides.tod_pass_rate_pct as number | undefined) ?? row.tod_pass_rate_pct,
    tod_exceptions_logged:         ((overrides.tod_exceptions_logged as number | undefined) ?? row.tod_exceptions_logged) > 0,
    tod_root_cause_assessed:       ((overrides.tod_exceptions_logged as number | undefined) ?? row.tod_exceptions_logged) > 0,
    tod_remediation_proposed:      willSetTs('remediation_completed_at')
                                    || !!row.remediation_completed_at
                                    || ((overrides.remediation_progress_pct as number | undefined) ?? row.remediation_progress_pct) > 0,
    tod_passed:                    ((overrides.tod_passed as number | undefined) ?? row.tod_passed) > 0,
  });
  overrides.tod_test_completeness_index = tod;

  // Re-derive ToOE completeness.
  const tooe = tooeTestCompletenessIndex({
    tooe_test_plan:                 willSetTs('tooe_test_planned_at') || !!row.tooe_test_planned_at,
    tooe_sample_size_documented:    ((overrides.tooe_sample_size as number | undefined) ?? row.tooe_sample_size) > 0,
    tooe_period_defined:            !!row.period_start && !!row.period_end,
    tooe_sample_population_defined: ((overrides.tooe_sample_size as number | undefined) ?? row.tooe_sample_size) > 0,
    tooe_evidence_collected:        willSetTs('tooe_evidence_collected_at') || !!row.tooe_evidence_collected_at,
    tooe_test_executed:             willSetTs('tooe_test_executed_at') || !!row.tooe_test_executed_at,
    tooe_reviewer_signoff:          ((overrides.tooe_reviewer_signoff as number | undefined) ?? row.tooe_reviewer_signoff) > 0,
    tooe_pass_rate_pct:             (overrides.tooe_pass_rate_pct as number | undefined) ?? row.tooe_pass_rate_pct,
    tooe_exceptions_logged:         ((overrides.tooe_exceptions_logged as number | undefined) ?? row.tooe_exceptions_logged) > 0,
    tooe_root_cause_assessed:       ((overrides.tooe_exceptions_logged as number | undefined) ?? row.tooe_exceptions_logged) > 0,
    tooe_remediation_proposed:      willSetTs('remediation_completed_at')
                                     || !!row.remediation_completed_at
                                     || ((overrides.remediation_progress_pct as number | undefined) ?? row.remediation_progress_pct) > 0,
    tooe_passed:                    ((overrides.tooe_passed as number | undefined) ?? row.tooe_passed) > 0,
    external_auditor_sign_off:      ((overrides.external_auditor_sign_off as number | undefined) ?? row.external_auditor_sign_off) > 0,
  });
  overrides.tooe_test_completeness_index = tooe;

  // Re-derive evidence coverage.
  const evidence = evidenceCoverageIndex({
    w118_block_range_paired:         (overrides.w118_block_height_range_low as number | undefined) != null
                                       || row.w118_block_height_range_low != null,
    w119_export_pack_attached:       !!((overrides.w119_export_pack_ref as string | undefined) ?? row.w119_export_pack_ref),
    w120_attestation_ref_attached:   !!((overrides.w120_attestation_ref as string | undefined) ?? row.w120_attestation_ref),
    w113_evm_ref_attached:           !!((overrides.w113_evm_ref as string | undefined) ?? row.w113_evm_ref),
    w114_doc_control_ref_attached:   !!((overrides.w114_doc_control_ref as string | undefined) ?? row.w114_doc_control_ref),
    w115_submittal_ref_attached:     !!((overrides.w115_submittal_ref as string | undefined) ?? row.w115_submittal_ref),
    w116_rfi_ref_attached:           !!((overrides.w116_rfi_ref as string | undefined) ?? row.w116_rfi_ref),
    w117_change_order_ref_attached:  !!((overrides.w117_change_order_ref as string | undefined) ?? row.w117_change_order_ref),
    walkthrough_evidence:            ((overrides.walkthrough_evidence as number | undefined) ?? row.walkthrough_evidence) > 0,
    tod_evidence_collected:          willSetTs('tod_evidence_collected_at') || !!row.tod_evidence_collected_at,
    tooe_evidence_collected:         willSetTs('tooe_evidence_collected_at') || !!row.tooe_evidence_collected_at,
    reviewer_signoff:                ((overrides.tod_reviewer_signoff as number | undefined) ?? row.tod_reviewer_signoff) > 0
                                       || ((overrides.tooe_reviewer_signoff as number | undefined) ?? row.tooe_reviewer_signoff) > 0,
    external_auditor_sign_off:       ((overrides.external_auditor_sign_off as number | undefined) ?? row.external_auditor_sign_off) > 0,
  });
  overrides.evidence_coverage_index = evidence;

  // Re-derive control_health_band.
  const deficiencySeverity =
    (overrides.deficiency_severity as DeficiencySeverity | null | undefined) ?? row.deficiency_severity ?? null;
  overrides.control_health_band = controlHealthBand(
    to,
    design,
    tod,
    tooe,
    evidence,
    !!row.sla_breached,
    to === 'deficient',
    to === 'excepted',
    floorFlags,
    deficiencySeverity,
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    external_auditor_sign_off:
      (overrides.external_auditor_sign_off as number | undefined) ?? row.external_auditor_sign_off,
  });
  overrides.is_reportable_flag = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  // Action-specific side effects.
  if (action === 'flag_deficient' && overrides.deficiency_severity === undefined) {
    // Default to control_deficiency unless material_weakness already set.
    overrides.deficiency_severity = floorFlags.material_weakness_suspected
      ? 'material_weakness'
      : (row.deficiency_severity ?? 'control_deficiency');
  }
  if (action === 'archive' && overrides.remediation_progress_pct === undefined) {
    overrides.remediation_progress_pct = 100;
  }

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
    `UPDATE oe_control_environment_audit SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `control_environment_audit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_control_environment_audit_events (id, control_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `control_environment_audit_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    await fireCascade({
      event: eventName as never,
      actor_id: user.id,
      entity_type: 'control_environment_audit',
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

  const refreshed = await c.env.DB.prepare(
    'SELECT * FROM oe_control_environment_audit WHERE id = ?',
  ).bind(id).first<CeaRow>();
  return c.json({ success: true, data: { control: refreshed ? decorate(refreshed, now) : null } });
}

// ─── 15 action endpoints (define_control handled by POST /) ───────────────

app.post('/:id/document-design', async (c) => transition(c, 'document_design', (_row, body) => {
  const b = body as Partial<CommonBody & Record<string, unknown>>;
  const out: Partial<CeaRow> = {};
  const flagKeys: (keyof CeaRow)[] = [
    'control_description', 'control_objective', 'responsible_party',
    'frequency_documented', 'inputs_documented', 'outputs_documented',
    'ipe_documented', 'manual_or_automated',
    'coso_principle_mapped', 'iso27001_control_mapped', 'soc2_criteria_mapped',
    'soa_linked',
  ];
  for (const k of flagKeys) {
    const f = toFlag((b as Record<string, unknown>)[k as string]);
    if (f !== undefined) (out as Record<string, unknown>)[k as string] = f;
  }
  const cf = (b as Record<string, unknown>).control_framework;
  if (typeof cf === 'string') out.control_framework = cf;
  const fcr = (b as Record<string, unknown>).framework_control_ref;
  if (typeof fcr === 'string') out.framework_control_ref = fcr;
  return applyCommon(b, out);
}));

app.post('/:id/complete-walkthrough', async (c) => transition(c, 'complete_walkthrough', (_row, body) => {
  const b = body as Partial<CommonBody & { walkthrough_evidence?: boolean | number }>;
  const out: Partial<CeaRow> = {};
  const f = toFlag(b.walkthrough_evidence);
  if (f !== undefined) out.walkthrough_evidence = f;
  else out.walkthrough_evidence = 1;
  return applyCommon(b, out);
}));

app.post('/:id/plan-tod-test', async (c) => transition(c, 'plan_tod_test', (_row, body) => {
  const b = body as Partial<CommonBody & { tod_sample_size?: number }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.tod_sample_size === 'number') {
    out.tod_sample_size = Math.max(0, Math.floor(b.tod_sample_size));
  }
  return applyCommon(b, out);
}));

app.post('/:id/collect-tod-evidence', async (c) => transition(c, 'collect_tod_evidence', (_row, body) => {
  const b = body as Partial<CommonBody & { tod_sample_size?: number }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.tod_sample_size === 'number') {
    out.tod_sample_size = Math.max(0, Math.floor(b.tod_sample_size));
  }
  return applyCommon(b, out);
}));

app.post('/:id/execute-tod-test', async (c) => transition(c, 'execute_tod_test', (_row, body) => {
  const b = body as Partial<CommonBody & {
    tod_pass_rate_pct?: number;
    tod_exceptions_logged?: boolean | number;
    tod_passed?: boolean | number;
    tod_reviewer_signoff?: boolean | number;
  }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.tod_pass_rate_pct === 'number') {
    out.tod_pass_rate_pct = Math.max(0, Math.min(100, Math.floor(b.tod_pass_rate_pct)));
  }
  const f1 = toFlag(b.tod_exceptions_logged);
  if (f1 !== undefined) out.tod_exceptions_logged = f1;
  const f2 = toFlag(b.tod_passed);
  if (f2 !== undefined) out.tod_passed = f2;
  const f3 = toFlag(b.tod_reviewer_signoff);
  if (f3 !== undefined) out.tod_reviewer_signoff = f3;
  return applyCommon(b, out);
}));

app.post('/:id/plan-tooe-test', async (c) => transition(c, 'plan_tooe_test', (_row, body) => {
  const b = body as Partial<CommonBody & { tooe_sample_size?: number }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.tooe_sample_size === 'number') {
    out.tooe_sample_size = Math.max(0, Math.floor(b.tooe_sample_size));
  }
  return applyCommon(b, out);
}));

app.post('/:id/collect-tooe-evidence', async (c) => transition(c, 'collect_tooe_evidence', (_row, body) => {
  const b = body as Partial<CommonBody & { tooe_sample_size?: number }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.tooe_sample_size === 'number') {
    out.tooe_sample_size = Math.max(0, Math.floor(b.tooe_sample_size));
  }
  return applyCommon(b, out);
}));

app.post('/:id/execute-tooe-test', async (c) => transition(c, 'execute_tooe_test', (_row, body) => {
  const b = body as Partial<CommonBody & {
    tooe_pass_rate_pct?: number;
    tooe_exceptions_logged?: boolean | number;
    tooe_passed?: boolean | number;
    tooe_reviewer_signoff?: boolean | number;
  }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.tooe_pass_rate_pct === 'number') {
    out.tooe_pass_rate_pct = Math.max(0, Math.min(100, Math.floor(b.tooe_pass_rate_pct)));
  }
  const f1 = toFlag(b.tooe_exceptions_logged);
  if (f1 !== undefined) out.tooe_exceptions_logged = f1;
  const f2 = toFlag(b.tooe_passed);
  if (f2 !== undefined) out.tooe_passed = f2;
  const f3 = toFlag(b.tooe_reviewer_signoff);
  if (f3 !== undefined) out.tooe_reviewer_signoff = f3;
  return applyCommon(b, out);
}));

app.post('/:id/assess-deficiency', async (c) => transition(c, 'assess_deficiency', (_row, body) => {
  const b = body as Partial<CommonBody & {
    deficiency_severity?: DeficiencySeverity;
    material_weakness_suspected?: boolean | number;
  }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.deficiency_severity === 'string') {
    out.deficiency_severity = b.deficiency_severity;
  }
  const f = toFlag(b.material_weakness_suspected);
  if (f !== undefined) out.material_weakness_suspected = f;
  return applyCommon(b, out);
}));

app.post('/:id/complete-remediation', async (c) => transition(c, 'complete_remediation', (_row, body) => {
  const b = body as Partial<CommonBody & { remediation_progress_pct?: number }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.remediation_progress_pct === 'number') {
    out.remediation_progress_pct = Math.max(0, Math.min(100, Math.floor(b.remediation_progress_pct)));
  } else {
    out.remediation_progress_pct = 100;
  }
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) => {
  const b = body as Partial<CommonBody & {
    external_auditor_sign_off?: boolean | number;
    external_auditor_firm?: string;
    external_auditor_engagement_ref?: string;
    external_auditor_jwt_jti?: string;
  }>;
  const out: Partial<CeaRow> = {};
  const f = toFlag(b.external_auditor_sign_off);
  if (f !== undefined) out.external_auditor_sign_off = f;
  if (typeof b.external_auditor_firm === 'string')           out.external_auditor_firm = b.external_auditor_firm;
  if (typeof b.external_auditor_engagement_ref === 'string') out.external_auditor_engagement_ref = b.external_auditor_engagement_ref;
  if (typeof b.external_auditor_jwt_jti === 'string')        out.external_auditor_jwt_jti = b.external_auditor_jwt_jti;
  return applyCommon(b, out);
}));

app.post('/:id/flag-deficient', async (c) => transition(c, 'flag_deficient', (_row, body) => {
  const b = body as Partial<CommonBody & {
    deficient_reason?: string;
    deficiency_severity?: DeficiencySeverity;
    material_weakness_suspected?: boolean | number;
  }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.deficient_reason === 'string')    out.deficient_reason = b.deficient_reason;
  if (typeof b.deficiency_severity === 'string') out.deficiency_severity = b.deficiency_severity;
  const f = toFlag(b.material_weakness_suspected);
  if (f !== undefined) out.material_weakness_suspected = f;
  return applyCommon(b, out);
}));

app.post('/:id/accept-with-exception', async (c) => transition(c, 'accept_with_exception', (_row, body) => {
  const b = body as Partial<CommonBody & { exception_reason?: string }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.exception_reason === 'string') out.exception_reason = b.exception_reason;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) => {
  const b = body as Partial<CommonBody & {
    suspend_reason?: string;
    regulator_audit_in_progress?: boolean | number;
  }>;
  const out: Partial<CeaRow> = {};
  if (typeof b.suspend_reason === 'string') out.suspend_reason = b.suspend_reason;
  const f = toFlag(b.regulator_audit_in_progress);
  if (f !== undefined) out.regulator_audit_in_progress = f;
  return applyCommon(b, out);
}));

app.post('/:id/initiate-re-test', async (c) => transition(c, 'initiate_re_test', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal control past sla_deadline_at, flips
// sla_breached=1, bumps escalation_level. Breach crosses regulator on
// directive + governance tiers only.
export async function controlEnvironmentAuditSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_control_environment_audit
     WHERE chain_status NOT IN ('archived','deficient')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND sla_breached = 0`,
  ).bind(nowIso).all<CeaRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_control_environment_audit
       SET sla_breached = 1,
           escalation_level = escalation_level + 1,
           updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, row.id).run();

    const evtId = `control_environment_audit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_control_environment_audit_events (id, control_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'control_environment_audit_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'control_owner',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as CeaTier)) {
      await fireCascade({
        event: 'control_environment_audit_sla_breached' as never,
        actor_id: 'system',
        entity_type: 'control_environment_audit',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: nightly evidence-coverage recompute (58 0 * * *) ──────────────
//
// Refreshes LIVE-derived persisted scoring fields for every active
// control: design_documentation_completeness_index,
// tod_test_completeness_index, tooe_test_completeness_index,
// evidence_coverage_index, control_health_band,
// days_to_quarterly_cutoff, days_to_annual_audit.
export async function controlEnvironmentAuditNightlyEvidenceCoverageSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_control_environment_audit
     WHERE chain_status NOT IN ('archived','deficient')`,
  ).all<CeaRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const design = designDocumentationCompletenessIndex({
      control_description:     row.control_description > 0,
      control_objective:       row.control_objective > 0,
      control_classification:  !!row.control_classification,
      responsible_party:       row.responsible_party > 0,
      frequency_documented:    row.frequency_documented > 0,
      inputs_documented:       row.inputs_documented > 0,
      outputs_documented:      row.outputs_documented > 0,
      ipe_documented:          row.ipe_documented > 0,
      manual_or_automated:     row.manual_or_automated > 0,
      preventive_or_detective: !!row.control_classification,
      coso_principle_mapped:   row.coso_principle_mapped > 0,
      iso27001_control_mapped: row.iso27001_control_mapped > 0,
      soc2_criteria_mapped:    row.soc2_criteria_mapped > 0,
      walkthrough_evidence:    row.walkthrough_evidence > 0,
      soa_linked:              row.soa_linked > 0,
    });

    const tod = todTestCompletenessIndex({
      tod_test_plan:                 !!row.tod_test_planned_at,
      tod_sample_size_documented:    row.tod_sample_size > 0,
      tod_sample_population_defined: row.tod_sample_size > 0,
      tod_evidence_collected:        !!row.tod_evidence_collected_at,
      tod_test_executed:             !!row.tod_test_executed_at,
      tod_reviewer_signoff:          row.tod_reviewer_signoff > 0,
      tod_pass_rate_pct:             row.tod_pass_rate_pct,
      tod_exceptions_logged:         row.tod_exceptions_logged > 0,
      tod_root_cause_assessed:       row.tod_exceptions_logged > 0,
      tod_remediation_proposed:      !!row.remediation_completed_at || row.remediation_progress_pct > 0,
      tod_passed:                    row.tod_passed > 0,
    });

    const tooe = tooeTestCompletenessIndex({
      tooe_test_plan:                 !!row.tooe_test_planned_at,
      tooe_sample_size_documented:    row.tooe_sample_size > 0,
      tooe_period_defined:            !!row.period_start && !!row.period_end,
      tooe_sample_population_defined: row.tooe_sample_size > 0,
      tooe_evidence_collected:        !!row.tooe_evidence_collected_at,
      tooe_test_executed:             !!row.tooe_test_executed_at,
      tooe_reviewer_signoff:          row.tooe_reviewer_signoff > 0,
      tooe_pass_rate_pct:             row.tooe_pass_rate_pct,
      tooe_exceptions_logged:         row.tooe_exceptions_logged > 0,
      tooe_root_cause_assessed:       row.tooe_exceptions_logged > 0,
      tooe_remediation_proposed:      !!row.remediation_completed_at || row.remediation_progress_pct > 0,
      tooe_passed:                    row.tooe_passed > 0,
      external_auditor_sign_off:      row.external_auditor_sign_off > 0,
    });

    const evidence = evidenceCoverageIndex({
      w118_block_range_paired:         row.w118_block_height_range_low != null,
      w119_export_pack_attached:       !!row.w119_export_pack_ref,
      w120_attestation_ref_attached:   !!row.w120_attestation_ref,
      w113_evm_ref_attached:           !!row.w113_evm_ref,
      w114_doc_control_ref_attached:   !!row.w114_doc_control_ref,
      w115_submittal_ref_attached:     !!row.w115_submittal_ref,
      w116_rfi_ref_attached:           !!row.w116_rfi_ref,
      w117_change_order_ref_attached:  !!row.w117_change_order_ref,
      walkthrough_evidence:            row.walkthrough_evidence > 0,
      tod_evidence_collected:          !!row.tod_evidence_collected_at,
      tooe_evidence_collected:         !!row.tooe_evidence_collected_at,
      reviewer_signoff:                row.tod_reviewer_signoff > 0 || row.tooe_reviewer_signoff > 0,
      external_auditor_sign_off:       row.external_auditor_sign_off > 0,
    });

    const health = controlHealthBand(
      row.chain_status,
      design,
      tod,
      tooe,
      evidence,
      !!row.sla_breached,
      row.chain_status === 'deficient',
      row.chain_status === 'excepted',
      rowFloorFlags(row),
      row.deficiency_severity ?? null,
    );

    const daysToQ = daysToQuarterlyCutoff(now);
    const daysToA = daysToAnnualAudit(now);

    await env.DB.prepare(
      `UPDATE oe_control_environment_audit
       SET design_documentation_completeness_index = ?,
           tod_test_completeness_index = ?,
           tooe_test_completeness_index = ?,
           evidence_coverage_index = ?,
           control_health_band = ?,
           days_to_quarterly_cutoff = ?,
           days_to_annual_audit = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(design, tod, tooe, evidence, health, daysToQ, daysToA, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

// ─── Cron: annual external-audit cycle opener (0 6 1 1 *) ────────────────
//
// On 1 January at 06:00 UTC, raise iso27001_surveillance_audit_due=1 +
// sox_404_attestation_pending=1 + soc2_type2_period_open=1 on every
// active control whose framework lists the corresponding standard.
// Flips regulator_relevant=1 + is_reportable_flag=1 to indicate the
// annual external-audit cycle is open.
export async function controlEnvironmentAuditAnnualAuditCycleOpenerSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; opened: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT id, control_framework FROM oe_control_environment_audit
     WHERE chain_status NOT IN ('archived','deficient')`,
  ).all<{ id: string; control_framework: string | null }>();
  const rows = rs.results || [];
  let opened = 0;
  for (const row of rows) {
    const isIso  = row.control_framework === 'iso27001_2022' || row.control_framework === 'iso27002_2022';
    const isSox  = row.control_framework === 'sox_404';
    const isSoc2 = row.control_framework === 'soc2_tsc';
    if (!isIso && !isSox && !isSoc2) continue;

    await env.DB.prepare(
      `UPDATE oe_control_environment_audit
       SET iso27001_surveillance_audit_due = CASE WHEN ? = 1 THEN 1 ELSE iso27001_surveillance_audit_due END,
           sox_404_attestation_pending     = CASE WHEN ? = 1 THEN 1 ELSE sox_404_attestation_pending END,
           soc2_type2_period_open          = CASE WHEN ? = 1 THEN 1 ELSE soc2_type2_period_open END,
           regulator_relevant = 1,
           is_reportable_flag = 1,
           updated_at = ?
       WHERE id = ?`,
    ).bind(isIso ? 1 : 0, isSox ? 1 : 0, isSoc2 ? 1 : 0, nowIso, row.id).run();

    const evtId = `control_environment_audit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_control_environment_audit_events (id, control_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'control_environment_audit_annual_cycle_opened',
      null, null, null, null,
      'system', 'audit_committee_chair',
      `Annual external-audit cycle opened for ${row.control_framework}`,
      JSON.stringify({ isIso, isSox, isSoc2 }), nowIso,
    ).run();

    opened++;
  }
  return { scanned: rows.length, opened };
}

export default app;
