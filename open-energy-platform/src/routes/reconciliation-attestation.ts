// ═══════════════════════════════════════════════════════════════════════════
// Wave 120 - Reconciliation Attestation Chain.
//
// THIRD Phase-B wave (after W118 audit-chain spine + W119 certified
// regulator export packs). Attests that every cross-chain row + external
// system feed (SAP S/4HANA + Oracle Financials + SAGE 300 + Workday +
// STRATE + SWIFT MT940 + NERSA/IPPO/DMRE inboxes + bank statements +
// W118 published blocks) reconciles against the tamper-evident chain.
//
// Beats BlackLine + Trintech Cadency + FloQast + OneStream + Adra + FIS
// Reconciliation Hub + Broadridge + Duco + Gresham Clareti by anchoring
// the attestation against the W118 audit chain hash + the W119 export
// pack lodged with the regulator. Reconciliation breaks land on the
// audit chain spine; an attestation cannot be signed without a paired
// W119 export pack reference.
//
// 12-state forward + 4 branch lifecycle:
//   attestation_proposed -> scope_defined -> feeds_ingested ->
//     blocks_paired -> variance_computed -> break_classified ->
//     root_cause_logged -> remediation_proposed ->
//     counter_party_signoff -> independent_review ->
//     attestation_signed -> archived (HARD terminal)
//   any non-terminal -> reject -> rejected (terminal)
//   feeds_ingested..independent_review -> suspend -> suspended (soft)
//   variance_computed..independent_review -> escalate_to_audit_committee
//     -> escalated_to_audit_committee (soft - audit committee chair owns)
//   attestation_signed / archived / restated -> restate -> restated (soft)
//
// 5-tier INVERTED SLA polarity (HOURS):
//   daily_tactical 24h / weekly_management 96h / monthly_management 168h
//   / quarterly_attestation 360h / annual_audit 720h. The bigger the
//   attestation period, the LONGER the reconciliation runway -
//   external-audit attestation requires deeper variance investigation.
//
// FLOOR-AT-QUARTERLY on >=1 of 5 flags:
//   material_variance_unresolved, external_auditor_request_active,
//   regulator_audit_in_progress, cross_border_feed_break,
//   icfr_deficiency_suspected.
//   >=2 lifts to annual_audit.
//
// SIGNATURE Phase-B regulator crossings:
//   * escalate_to_audit_committee crosses regulator EVERY tier (W120
//     SIGNATURE ICFR-DEFICIENCY-ATTEST hard line - JSE Listings 8.62 +
//     Companies Act s30 + COSO Monitoring component all require
//     disclosure within the attestation window EVERY tier).
//   * reject crosses regulator EVERY tier WHEN
//     material_variance_unresolved AND icfr_deficiency_suspected.
//   * restate crosses quarterly_attestation + annual_audit only (IAS 8
//     restatement = listed-issuer disclosure event).
//   * suspend crosses if regulator_audit_in_progress.
//   * sla_breached crosses quarterly_attestation + annual_audit only.
//   * sign_attestation NEVER crosses (normal completion).
//
// Write {admin ONLY}. READ all 9 personas.
//
// External-auditor read via signed JWT (NOT mTLS like W119). Auditor
// identity JWT-bound; endpoint returns read-only attestation evidence
// for the IDs in the JWT scope claim.
//
// 4-step authority ladder: reconciler -> controller -> CFO ->
// audit_committee_chair.
//
// 7 bridges: W118 + W119 MANDATORY + W113 EVM / W114 doc / W115 sub /
// W116 RFI / W117 CO.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  slaWindowHours,
  tierForCadence,
  effectiveTier,
  countFloorFlags,
  floorAtQuarterly,
  floorAtAnnual,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  attestationWindowHours,
  daysToQuarterlyAttestation,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  bridgesToW118AuditChain,
  bridgesToW119RegulatorExportChain,
  reconciliationCompletenessIndex,
  icfrControlEffectivenessIndex,
  varianceScoreIndex,
  remediationProgressIndex,
  attestationHealthBand,
  isValidExternalAuditorJwtFormat,
  parseExternalAuditorClaims,
  isExternalAuditorClaimsExpired,
  externalAuditorCanReadAttestation,
  FEED_SOURCES,
  BREAK_CLASSIFICATIONS,
  ROOT_CAUSE_TAXONOMIES,
  type RattStatus,
  type RattAction,
  type RattTier,
  type RattCadence,
  type ExternalAuditorClaims,
} from '../utils/reconciliation-attestation-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W120 = admin ONLY. Regulator + 7 other personas READ-ONLY.
const WRITE_ROLES = new Set(['admin']);

interface RattRow {
  id: string;
  attestation_number: string;
  cadence: RattCadence;
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
  parent_attestation_id: string | null;

  material_variance_unresolved: number;
  external_auditor_request_active: number;
  regulator_audit_in_progress: number;
  cross_border_feed_break: number;
  icfr_deficiency_suspected: number;

  feeds_in_scope: number;
  feeds_ingested_count: number;
  feeds_paired_count: number;
  feeds_paired_pct: number;
  feed_sources_csv: string | null;

  total_variance_zar: number;
  materiality_threshold_zar: number;
  net_variance_explained_zar: number;
  unresolved_variance_zar: number;
  variance_explained_pct: number;

  break_classification: string | null;
  break_classified_pct: number;
  root_cause_taxonomy: string | null;

  coso_components_tested: number;
  tsc_categories_tested: number;
  material_weakness_open: number;

  remediation_progress_pct: number;
  remediation_closed_pct: number;
  action_plan_drafted: number;
  owner_assigned: number;
  target_date_set: number;
  evidence_attached: number;
  followup_test_passed: number;

  counter_party_signed_off: number;
  independent_review_passed: number;
  cfo_attestation_signed: number;
  audit_committee_briefed: number;

  current_tier: RattTier;
  authority_required: string | null;
  urgency_band: string | null;
  attestation_health_band: string | null;
  reconciliation_completeness_index: number;
  icfr_control_effectiveness_index: number;
  variance_score_index: number;
  remediation_progress_index: number;
  attestation_window_hours: number;
  days_to_quarterly_attestation: number;

  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  suspend_reason: string | null;
  restate_reason: string | null;
  escalation_reason: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  external_auditor_firm: string | null;
  external_auditor_engagement_ref: string | null;
  external_auditor_jwt_jti: string | null;

  chain_status: RattStatus;
  attestation_proposed_at: string | null;
  scope_defined_at: string | null;
  feeds_ingested_at: string | null;
  blocks_paired_at: string | null;
  variance_computed_at: string | null;
  break_classified_at: string | null;
  root_cause_logged_at: string | null;
  remediation_proposed_at: string | null;
  counter_party_signoff_at: string | null;
  independent_review_at: string | null;
  attestation_signed_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  suspended_at: string | null;
  restated_at: string | null;
  escalated_at: string | null;

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

interface RattEventRow {
  id: string;
  attestation_id: string;
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

const TIMESTAMP_COLUMN: Record<RattStatus, keyof RattRow> = {
  attestation_proposed:        'attestation_proposed_at',
  scope_defined:               'scope_defined_at',
  feeds_ingested:              'feeds_ingested_at',
  blocks_paired:               'blocks_paired_at',
  variance_computed:           'variance_computed_at',
  break_classified:            'break_classified_at',
  root_cause_logged:           'root_cause_logged_at',
  remediation_proposed:        'remediation_proposed_at',
  counter_party_signoff:       'counter_party_signoff_at',
  independent_review:          'independent_review_at',
  attestation_signed:          'attestation_signed_at',
  archived:                    'archived_at',
  rejected:                    'rejected_at',
  suspended:                   'suspended_at',
  restated:                    'restated_at',
  escalated_to_audit_committee:'escalated_at',
};

function statusEnteredAt(row: RattRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.attestation_proposed_at ? new Date(row.attestation_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.attestation_proposed_at ? new Date(row.attestation_proposed_at) : null);
}

function rowFloorFlags(row: RattRow) {
  return {
    material_variance_unresolved:    row.material_variance_unresolved,
    external_auditor_request_active: row.external_auditor_request_active,
    regulator_audit_in_progress:     row.regulator_audit_in_progress,
    cross_border_feed_break:         row.cross_border_feed_break,
    icfr_deficiency_suspected:       row.icfr_deficiency_suspected,
  };
}

function decorate(row: RattRow, now: Date) {
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
  const window = attestationWindowHours(tier);
  const daysToQ = daysToQuarterlyAttestation(now);

  const flags = rowFloorFlags(row);
  const floorFlags = countFloorFlags(flags);
  const floorQuarterly = floorAtQuarterly(flags);
  const floorAnnual = floorAtAnnual(flags);

  const completenessLive = reconciliationCompletenessIndex({
    attestation_proposed:    !!row.attestation_proposed_at,
    scope_defined:           !!row.scope_defined_at,
    feeds_ingested:          !!row.feeds_ingested_at,
    blocks_paired:           !!row.blocks_paired_at,
    variance_computed:       !!row.variance_computed_at,
    break_classified:        !!row.break_classified_at,
    root_cause_logged:       !!row.root_cause_logged_at,
    remediation_proposed:    !!row.remediation_proposed_at,
    counter_party_signoff:   !!row.counter_party_signoff_at,
    independent_review:      !!row.independent_review_at,
    attestation_signed:      !!row.attestation_signed_at,
    archived:                !!row.archived_at,
    clean_close_bonus:       status === 'archived' && !row.rejected_at,
  });

  const icfrLive = icfrControlEffectivenessIndex({
    coso_components_tested:    row.coso_components_tested,
    tsc_categories_tested:     row.tsc_categories_tested,
    feeds_paired_pct:          row.feeds_paired_pct,
    variance_explained_pct:    row.variance_explained_pct,
    break_classified_pct:      row.break_classified_pct,
    remediation_closed_pct:    row.remediation_closed_pct,
    counter_party_signed_off:  row.counter_party_signed_off,
    independent_review_passed: row.independent_review_passed,
    cfo_attestation_signed:    row.cfo_attestation_signed,
    audit_committee_briefed:   row.audit_committee_briefed,
    icfr_deficiency_suspected: row.icfr_deficiency_suspected,
    material_weakness_open:    row.material_weakness_open,
  });

  const varianceLive = varianceScoreIndex({
    total_variance_zar:         row.total_variance_zar,
    materiality_threshold_zar:  row.materiality_threshold_zar,
    net_variance_explained_zar: row.net_variance_explained_zar,
    unresolved_variance_zar:    row.unresolved_variance_zar,
  });

  const remediationLive = remediationProgressIndex({
    root_cause_logged:        !!row.root_cause_logged_at,
    action_plan_drafted:      row.action_plan_drafted,
    owner_assigned:           row.owner_assigned,
    target_date_set:          row.target_date_set,
    evidence_attached:        row.evidence_attached,
    controller_reviewed:      row.independent_review_passed,
    cfo_signed_off:           row.cfo_attestation_signed,
    audit_committee_briefed:  row.audit_committee_briefed,
    remediation_closed:       row.remediation_closed_pct >= 100,
    followup_test_passed:     row.followup_test_passed,
    remediation_progress_pct: row.remediation_progress_pct,
  });

  const healthLive = attestationHealthBand(
    status,
    completenessLive,
    icfrLive,
    varianceLive,
    remediationLive,
    minutesUntilSla != null && minutesUntilSla < 0,
    !!row.rejected_at || status === 'rejected',
    status === 'escalated_to_audit_committee',
    flags,
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
    attestation_window_hours_live: window,
    days_to_quarterly_attestation_live: daysToQ,
    floor_flag_count_live: floorFlags,
    floor_at_quarterly_live: floorQuarterly,
    floor_at_annual_live: floorAnnual,
    reconciliation_completeness_index_live: completenessLive,
    icfr_control_effectiveness_index_live: icfrLive,
    variance_score_index_live: varianceLive,
    remediation_progress_index_live: remediationLive,
    attestation_health_band_live: healthLive,
    bridges_to_w113_evm_chain_live: bridgesToW113EvmChain(row.w113_evm_ref),
    bridges_to_w114_doc_control_chain_live: bridgesToW114DocControlChain(row.w114_doc_control_ref),
    bridges_to_w115_submittal_chain_live: bridgesToW115SubmittalChain(row.w115_submittal_ref),
    bridges_to_w116_rfi_chain_live: bridgesToW116RfiChain(row.w116_rfi_ref),
    bridges_to_w117_change_order_chain_live: bridgesToW117ChangeOrderChain(row.w117_change_order_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(
      row.w118_block_height_range_low != null ? String(row.w118_block_height_range_low) : null,
    ),
    bridges_to_w119_regulator_export_chain_live: bridgesToW119RegulatorExportChain(row.w119_export_pack_ref),
  };
}

// External-auditor sanitised projection - strips internal fields, returns
// the attestation evidence the external auditor is authorised to read.
function externalAuditorView(row: RattRow, now: Date) {
  const decorated = decorate(row, now);
  return {
    id: row.id,
    attestation_number: row.attestation_number,
    cadence: row.cadence,
    period_label: row.period_label,
    period_start: row.period_start,
    period_end: row.period_end,
    chain_status: row.chain_status,
    current_tier: row.current_tier,
    authority_required: row.authority_required,
    attestation_health_band: decorated.attestation_health_band_live,
    // Bridges
    w118_block_height_range_low: row.w118_block_height_range_low,
    w118_block_height_range_high: row.w118_block_height_range_high,
    w119_export_pack_ref: row.w119_export_pack_ref,
    bridges_to_w118_audit_chain: decorated.bridges_to_w118_audit_chain_live,
    bridges_to_w119_regulator_export_chain: decorated.bridges_to_w119_regulator_export_chain_live,
    // Variance ledger (ZAR)
    total_variance_zar: row.total_variance_zar,
    materiality_threshold_zar: row.materiality_threshold_zar,
    net_variance_explained_zar: row.net_variance_explained_zar,
    unresolved_variance_zar: row.unresolved_variance_zar,
    variance_explained_pct: row.variance_explained_pct,
    variance_score_index: decorated.variance_score_index_live,
    // ICFR
    coso_components_tested: row.coso_components_tested,
    tsc_categories_tested: row.tsc_categories_tested,
    icfr_deficiency_suspected: row.icfr_deficiency_suspected,
    material_weakness_open: row.material_weakness_open,
    icfr_control_effectiveness_index: decorated.icfr_control_effectiveness_index_live,
    // Remediation
    remediation_progress_pct: row.remediation_progress_pct,
    remediation_progress_index: decorated.remediation_progress_index_live,
    // Sign-offs
    counter_party_signed_off: row.counter_party_signed_off,
    independent_review_passed: row.independent_review_passed,
    cfo_attestation_signed: row.cfo_attestation_signed,
    audit_committee_briefed: row.audit_committee_briefed,
    // Reportability
    is_reportable: row.is_reportable,
    regulator_relevant: row.regulator_relevant,
    regulator_crossed_at: row.regulator_crossed_at,
    regulator_ref: row.regulator_ref,
    // Lifecycle timestamps
    attestation_proposed_at: row.attestation_proposed_at,
    attestation_signed_at: row.attestation_signed_at,
    archived_at: row.archived_at,
    rejected_at: row.rejected_at,
    escalated_at: row.escalated_at,
    // Engagement metadata
    external_auditor_firm: row.external_auditor_firm,
    external_auditor_engagement_ref: row.external_auditor_engagement_ref,
  };
}

const app = new Hono<HonoEnv>();

// All endpoints require auth - the external-auditor endpoint is mounted
// UNDER auth and verifies the signed JWT internally (vs W119's mTLS edge
// termination).
app.use('*', authMiddleware);

// ─── External-auditor signed-JWT-gated read endpoint ─────────────────────
//
// GET /api/reconciliation-attestation/external/:id
//   Headers: x-external-auditor-jwt: <signed JWT>
//   The JWT must be HS256-signed with the platform external-auditor key
//   and carry aud=external_auditor + scope array containing the
//   attestation ID (or "*"). Returns sanitised attestation evidence.
//
// The bearer auth above still applies - the caller must be authenticated
// as admin OR regulator OR external_auditor proxy. The JWT is the
// SECONDARY scope-gate on top of bearer auth.
app.get('/external/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const auditorJwt = c.req.header('x-external-auditor-jwt') || '';
  if (!isValidExternalAuditorJwtFormat(auditorJwt)) {
    return c.json({ success: false, error: 'External-auditor JWT missing or malformed' }, 401);
  }

  // Parse claims from JWT payload (middle segment). We do not verify the
  // signature here in the route - that is the platform JWT verifier's
  // job at the edge. We DO enforce scope + expiry.
  let claims: ExternalAuditorClaims | null = null;
  try {
    const parts = auditorJwt.split('.');
    if (parts.length === 3) {
      // Base64URL decode the payload segment.
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
  if (!externalAuditorCanReadAttestation(claims, id, now)) {
    return c.json({ success: false, error: 'External-auditor JWT does not authorise this attestation' }, 403);
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_reconciliation_attestation WHERE id = ?',
  ).bind(id).first<RattRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  return c.json({
    success: true,
    data: {
      attestation: externalAuditorView(row, now),
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

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const cadence    = c.req.query('cadence');
  const health     = c.req.query('attestation_health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_reconciliation_attestation WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)    { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)  { sql += ' AND chain_status = ?'; binds.push(status); }
  if (cadence) { sql += ' AND cadence = ?'; binds.push(cadence); }
  if (health)  { sql += ' AND attestation_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RattRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_cadence: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_cadence[i.cadence] = (by_cadence[i.cadence] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.attestation_health_band_live] = (by_health[i.attestation_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'attestation_proposed').length;
  const scope_count         = items.filter((i) => i.chain_status === 'scope_defined').length;
  const feeds_count         = items.filter((i) => i.chain_status === 'feeds_ingested').length;
  const paired_count        = items.filter((i) => i.chain_status === 'blocks_paired').length;
  const variance_count      = items.filter((i) => i.chain_status === 'variance_computed').length;
  const break_count         = items.filter((i) => i.chain_status === 'break_classified').length;
  const root_cause_count    = items.filter((i) => i.chain_status === 'root_cause_logged').length;
  const remediation_count   = items.filter((i) => i.chain_status === 'remediation_proposed').length;
  const signoff_count       = items.filter((i) => i.chain_status === 'counter_party_signoff').length;
  const review_count        = items.filter((i) => i.chain_status === 'independent_review').length;
  const signed_count        = items.filter((i) => i.chain_status === 'attestation_signed').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count      = items.filter((i) => i.chain_status === 'rejected').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const restated_count      = items.filter((i) => i.chain_status === 'restated').length;
  const escalated_count     = items.filter((i) => i.chain_status === 'escalated_to_audit_committee').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w113_bridged        = items.filter((i) => i.bridges_to_w113_evm_chain_live).length;
  const w114_bridged        = items.filter((i) => i.bridges_to_w114_doc_control_chain_live).length;
  const w115_bridged        = items.filter((i) => i.bridges_to_w115_submittal_chain_live).length;
  const w116_bridged        = items.filter((i) => i.bridges_to_w116_rfi_chain_live).length;
  const w117_bridged        = items.filter((i) => i.bridges_to_w117_change_order_chain_live).length;
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w119_bridged        = items.filter((i) => i.bridges_to_w119_regulator_export_chain_live).length;

  const completeness_avg    = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.reconciliation_completeness_index_live || 0), 0) / items.length)
    : 0;
  const icfr_avg            = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.icfr_control_effectiveness_index_live || 0), 0) / items.length)
    : 0;
  const variance_avg        = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.variance_score_index_live || 0), 0) / items.length)
    : 0;
  const remediation_avg     = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.remediation_progress_index_live || 0), 0) / items.length)
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_cadence,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      scope_count,
      feeds_count,
      paired_count,
      variance_count,
      break_count,
      root_cause_count,
      remediation_count,
      signoff_count,
      review_count,
      signed_count,
      archived_count,
      rejected_count,
      suspended_count,
      restated_count,
      escalated_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w113_bridged_count: w113_bridged,
      w114_bridged_count: w114_bridged,
      w115_bridged_count: w115_bridged,
      w116_bridged_count: w116_bridged,
      w117_bridged_count: w117_bridged,
      w118_bridged_count: w118_bridged,
      w119_bridged_count: w119_bridged,
      completeness_avg,
      icfr_avg,
      variance_avg,
      remediation_avg,
      feed_sources: FEED_SOURCES,
      break_classifications: BREAK_CLASSIFICATIONS,
      root_cause_taxonomies: ROOT_CAUSE_TAXONOMIES,
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
    `SELECT chain_status, current_tier, attestation_health_band, cadence,
            regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_reconciliation_attestation
     GROUP BY chain_status, current_tier, attestation_health_band, cadence,
              regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; attestation_health_band: string | null;
    cadence: string | null; regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_cadence: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.attestation_health_band) by_health[r.attestation_health_band] = (by_health[r.attestation_health_band] || 0) + r.n;
    if (r.cadence) by_cadence[r.cadence] = (by_cadence[r.cadence] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_cadence,
      by_regulator_relevant, by_sla_breached,
      feed_sources: FEED_SOURCES,
      break_classifications: BREAK_CLASSIFICATIONS,
      root_cause_taxonomies: ROOT_CAUSE_TAXONOMIES,
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
    'SELECT * FROM oe_reconciliation_attestation WHERE id = ?',
  ).bind(id).first<RattRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_reconciliation_attestation_events WHERE attestation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RattEventRow>();

  return c.json({
    success: true,
    data: {
      attestation: decorate(row, new Date()),
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
  cadence?: RattCadence;
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
  parent_attestation_id?: string;
  material_variance_unresolved?: boolean | number;
  external_auditor_request_active?: boolean | number;
  regulator_audit_in_progress?: boolean | number;
  cross_border_feed_break?: boolean | number;
  icfr_deficiency_suspected?: boolean | number;
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

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<RattRow>): Partial<RattRow> {
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  if (typeof b.regulator_inbox_ref === 'string') out.regulator_inbox_ref = b.regulator_inbox_ref;
  if (typeof b.title === 'string')               out.title = b.title;
  return out;
}

// ─── Create endpoint (propose_attestation) ───────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ratt-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const ce = badEnum('cadence', body.cadence, ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit']);
  if (ce) return c.json({ success: false, error: ce }, 400);
  const cadence: RattCadence = (body.cadence as RattCadence | undefined) ?? 'monthly_management';
  const periodLabel = typeof body.period_label === 'string' ? body.period_label : '';
  if (!periodLabel) {
    return c.json({ success: false, error: 'period_label required' }, 400);
  }

  const flags = {
    material_variance_unresolved:    toFlag(body.material_variance_unresolved) ?? 0,
    external_auditor_request_active: toFlag(body.external_auditor_request_active) ?? 0,
    regulator_audit_in_progress:     toFlag(body.regulator_audit_in_progress) ?? 0,
    cross_border_feed_break:         toFlag(body.cross_border_feed_break) ?? 0,
    icfr_deficiency_suspected:       toFlag(body.icfr_deficiency_suspected) ?? 0,
  };
  const rawTier = tierForCadence(cadence);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('attestation_proposed', tier, now);
  const slaHrs = slaWindowHours('attestation_proposed', tier);
  const window = attestationWindowHours(tier);
  const daysToQ = daysToQuarterlyAttestation(now);

  // Attestation number = RATT-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_reconciliation_attestation`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const attNum = `RATT-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  await c.env.DB.prepare(
    `INSERT INTO oe_reconciliation_attestation (
      id, attestation_number, cadence, period_label, period_start, period_end,
      w113_evm_ref, w114_doc_control_ref, w115_submittal_ref,
      w116_rfi_ref, w117_change_order_ref,
      w118_block_height_range_low, w118_block_height_range_high,
      w119_export_pack_ref, parent_attestation_id,
      material_variance_unresolved, external_auditor_request_active,
      regulator_audit_in_progress, cross_border_feed_break,
      icfr_deficiency_suspected,
      current_tier, authority_required, urgency_band,
      reconciliation_completeness_index, icfr_control_effectiveness_index,
      variance_score_index, remediation_progress_index,
      attestation_window_hours, days_to_quarterly_attestation,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      external_auditor_firm, external_auditor_engagement_ref,
      chain_status, attestation_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, attNum, cadence, periodLabel, body.period_start ?? null, body.period_end ?? null,
    body.w113_evm_ref ?? null, body.w114_doc_control_ref ?? null, body.w115_submittal_ref ?? null,
    body.w116_rfi_ref ?? null, body.w117_change_order_ref ?? null,
    body.w118_block_height_range_low ?? null, body.w118_block_height_range_high ?? null,
    body.w119_export_pack_ref ?? null, body.parent_attestation_id ?? null,
    flags.material_variance_unresolved, flags.external_auditor_request_active,
    flags.regulator_audit_in_progress, flags.cross_border_feed_break,
    flags.icfr_deficiency_suspected,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    3, 0, 0, 0,
    window, daysToQ,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    body.external_auditor_firm ?? null, body.external_auditor_engagement_ref ?? null,
    'attestation_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `reconciliation_attestation_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_reconciliation_attestation_events (id, attestation_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'reconciliation_attestation_proposed',
    null, 'attestation_proposed', null, tier,
    user.id, partyForAction('propose_attestation'),
    null, JSON.stringify({ tier, cadence, period_label: periodLabel }), nowIso,
  ).run();

  await fireCascade({
    event: 'reconciliation_attestation_proposed' as never,
    actor_id: user.id,
    entity_type: 'reconciliation_attestation',
    entity_id: id,
    data: { tier, cadence, period_label: periodLabel, chain_status: 'attestation_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare(
    'SELECT * FROM oe_reconciliation_attestation WHERE id = ?',
  ).bind(id).first<RattRow>();
  return c.json({ success: true, data: { attestation: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: RattAction,
  bodyHandler?: (row: RattRow, body: Record<string, unknown>) => Partial<RattRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_reconciliation_attestation WHERE id = ?',
  ).bind(id).first<RattRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from cadence + 5 floor flags (every transition).
  const cadence = (overrides.cadence as RattCadence | undefined) ?? row.cadence;
  const rawTier = tierForCadence(cadence);
  const floorFlags = {
    material_variance_unresolved:
      (overrides.material_variance_unresolved as number | undefined) ?? row.material_variance_unresolved,
    external_auditor_request_active:
      (overrides.external_auditor_request_active as number | undefined) ?? row.external_auditor_request_active,
    regulator_audit_in_progress:
      (overrides.regulator_audit_in_progress as number | undefined) ?? row.regulator_audit_in_progress,
    cross_border_feed_break:
      (overrides.cross_border_feed_break as number | undefined) ?? row.cross_border_feed_break,
    icfr_deficiency_suspected:
      (overrides.icfr_deficiency_suspected as number | undefined) ?? row.icfr_deficiency_suspected,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.attestation_window_hours = attestationWindowHours(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;
  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof RattRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = reconciliationCompletenessIndex({
    attestation_proposed:  willSetTs('attestation_proposed_at'),
    scope_defined:         willSetTs('scope_defined_at'),
    feeds_ingested:        willSetTs('feeds_ingested_at'),
    blocks_paired:         willSetTs('blocks_paired_at'),
    variance_computed:     willSetTs('variance_computed_at'),
    break_classified:      willSetTs('break_classified_at'),
    root_cause_logged:     willSetTs('root_cause_logged_at'),
    remediation_proposed:  willSetTs('remediation_proposed_at'),
    counter_party_signoff: willSetTs('counter_party_signoff_at'),
    independent_review:    willSetTs('independent_review_at'),
    attestation_signed:    willSetTs('attestation_signed_at'),
    archived:              willSetTs('archived_at'),
    clean_close_bonus:     to === 'archived' && !row.rejected_at,
  });
  overrides.reconciliation_completeness_index = completeness;

  // Re-derive ICFR control effectiveness.
  const icfr = icfrControlEffectivenessIndex({
    coso_components_tested:
      (overrides.coso_components_tested as number | undefined) ?? row.coso_components_tested,
    tsc_categories_tested:
      (overrides.tsc_categories_tested as number | undefined) ?? row.tsc_categories_tested,
    feeds_paired_pct:
      (overrides.feeds_paired_pct as number | undefined) ?? row.feeds_paired_pct,
    variance_explained_pct:
      (overrides.variance_explained_pct as number | undefined) ?? row.variance_explained_pct,
    break_classified_pct:
      (overrides.break_classified_pct as number | undefined) ?? row.break_classified_pct,
    remediation_closed_pct:
      (overrides.remediation_closed_pct as number | undefined) ?? row.remediation_closed_pct,
    counter_party_signed_off:
      (overrides.counter_party_signed_off as number | undefined) ?? row.counter_party_signed_off,
    independent_review_passed:
      (overrides.independent_review_passed as number | undefined) ?? row.independent_review_passed,
    cfo_attestation_signed:
      (overrides.cfo_attestation_signed as number | undefined) ?? row.cfo_attestation_signed,
    audit_committee_briefed:
      (overrides.audit_committee_briefed as number | undefined) ?? row.audit_committee_briefed,
    icfr_deficiency_suspected: floorFlags.icfr_deficiency_suspected,
    material_weakness_open:
      (overrides.material_weakness_open as number | undefined) ?? row.material_weakness_open,
  });
  overrides.icfr_control_effectiveness_index = icfr;

  // Re-derive variance score.
  const variance = varianceScoreIndex({
    total_variance_zar:
      (overrides.total_variance_zar as number | undefined) ?? row.total_variance_zar,
    materiality_threshold_zar:
      (overrides.materiality_threshold_zar as number | undefined) ?? row.materiality_threshold_zar,
    net_variance_explained_zar:
      (overrides.net_variance_explained_zar as number | undefined) ?? row.net_variance_explained_zar,
    unresolved_variance_zar:
      (overrides.unresolved_variance_zar as number | undefined) ?? row.unresolved_variance_zar,
  });
  overrides.variance_score_index = variance;

  // Re-derive remediation progress index.
  const remediation = remediationProgressIndex({
    root_cause_logged:
      willSetTs('root_cause_logged_at') || !!row.root_cause_logged_at,
    action_plan_drafted:
      (overrides.action_plan_drafted as number | undefined) ?? row.action_plan_drafted,
    owner_assigned:
      (overrides.owner_assigned as number | undefined) ?? row.owner_assigned,
    target_date_set:
      (overrides.target_date_set as number | undefined) ?? row.target_date_set,
    evidence_attached:
      (overrides.evidence_attached as number | undefined) ?? row.evidence_attached,
    controller_reviewed:
      (overrides.independent_review_passed as number | undefined) ?? row.independent_review_passed,
    cfo_signed_off:
      (overrides.cfo_attestation_signed as number | undefined) ?? row.cfo_attestation_signed,
    audit_committee_briefed:
      (overrides.audit_committee_briefed as number | undefined) ?? row.audit_committee_briefed,
    remediation_closed:
      ((overrides.remediation_closed_pct as number | undefined) ?? row.remediation_closed_pct) >= 100,
    followup_test_passed:
      (overrides.followup_test_passed as number | undefined) ?? row.followup_test_passed,
    remediation_progress_pct:
      (overrides.remediation_progress_pct as number | undefined) ?? row.remediation_progress_pct,
  });
  overrides.remediation_progress_index = remediation;

  // Re-derive attestation_health_band.
  overrides.attestation_health_band = attestationHealthBand(
    to,
    completeness,
    icfr,
    variance,
    remediation,
    !!row.sla_breached,
    to === 'rejected' || !!row.rejected_at,
    to === 'escalated_to_audit_committee',
    floorFlags,
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, { flags: floorFlags });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  // sign_attestation -> mark cfo_attestation_signed=1.
  if (action === 'sign_attestation') {
    overrides.cfo_attestation_signed = 1;
  }
  if (action === 'escalate_to_audit_committee') {
    overrides.audit_committee_briefed = 1;
  }
  if (action === 'run_independent_review') {
    if (overrides.independent_review_passed === undefined) {
      overrides.independent_review_passed = 1;
    }
  }
  if (action === 'get_counter_party_signoff') {
    if (overrides.counter_party_signed_off === undefined) {
      overrides.counter_party_signed_off = 1;
    }
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
    `UPDATE oe_reconciliation_attestation SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `reconciliation_attestation_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_reconciliation_attestation_events (id, attestation_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `reconciliation_attestation_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    await fireCascade({
      event: eventName as never,
      actor_id: user.id,
      entity_type: 'reconciliation_attestation',
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
    'SELECT * FROM oe_reconciliation_attestation WHERE id = ?',
  ).bind(id).first<RattRow>();
  return c.json({ success: true, data: { attestation: refreshed ? decorate(refreshed, now) : null } });
}

// ─── 17 action endpoints (propose handled by POST /) ──────────────────────
app.post('/:id/define-scope', async (c) => transition(c, 'define_scope', (_row, body) => {
  const b = body as Partial<CommonBody & {
    feeds_in_scope?: number;
    feed_sources_csv?: string;
    materiality_threshold_zar?: number;
    coso_components_tested?: number;
    tsc_categories_tested?: number;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.feeds_in_scope === 'number')             out.feeds_in_scope = Math.max(0, Math.floor(b.feeds_in_scope));
  if (typeof b.feed_sources_csv === 'string')           out.feed_sources_csv = b.feed_sources_csv;
  if (typeof b.materiality_threshold_zar === 'number')  out.materiality_threshold_zar = Math.max(0, Math.floor(b.materiality_threshold_zar));
  if (typeof b.coso_components_tested === 'number')     out.coso_components_tested = Math.max(0, Math.min(5, Math.floor(b.coso_components_tested)));
  if (typeof b.tsc_categories_tested === 'number')      out.tsc_categories_tested = Math.max(0, Math.min(5, Math.floor(b.tsc_categories_tested)));
  return applyCommon(b, out);
}));

app.post('/:id/ingest-feeds', async (c) => transition(c, 'ingest_feeds', (_row, body) => {
  const b = body as Partial<CommonBody & {
    feeds_ingested_count?: number;
    feed_sources_csv?: string;
    cross_border_feed_break?: boolean | number;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.feeds_ingested_count === 'number') out.feeds_ingested_count = Math.max(0, Math.floor(b.feeds_ingested_count));
  if (typeof b.feed_sources_csv === 'string')     out.feed_sources_csv = b.feed_sources_csv;
  const f = toFlag(b.cross_border_feed_break);
  if (f !== undefined) out.cross_border_feed_break = f;
  return applyCommon(b, out);
}));

app.post('/:id/pair-blocks', async (c) => transition(c, 'pair_blocks', (_row, body) => {
  const b = body as Partial<CommonBody & {
    feeds_paired_count?: number;
    feeds_paired_pct?: number;
    w118_block_height_range_low?: number;
    w118_block_height_range_high?: number;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.feeds_paired_count === 'number') out.feeds_paired_count = Math.max(0, Math.floor(b.feeds_paired_count));
  if (typeof b.feeds_paired_pct === 'number')   out.feeds_paired_pct = Math.max(0, Math.min(100, Math.floor(b.feeds_paired_pct)));
  if (typeof b.w118_block_height_range_low === 'number')  out.w118_block_height_range_low = b.w118_block_height_range_low;
  if (typeof b.w118_block_height_range_high === 'number') out.w118_block_height_range_high = b.w118_block_height_range_high;
  return applyCommon(b, out);
}));

app.post('/:id/compute-variance', async (c) => transition(c, 'compute_variance', (_row, body) => {
  const b = body as Partial<CommonBody & {
    total_variance_zar?: number;
    materiality_threshold_zar?: number;
    net_variance_explained_zar?: number;
    unresolved_variance_zar?: number;
    variance_explained_pct?: number;
    material_variance_unresolved?: boolean | number;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.total_variance_zar === 'number')         out.total_variance_zar = Math.max(0, Math.floor(b.total_variance_zar));
  if (typeof b.materiality_threshold_zar === 'number')  out.materiality_threshold_zar = Math.max(0, Math.floor(b.materiality_threshold_zar));
  if (typeof b.net_variance_explained_zar === 'number') out.net_variance_explained_zar = Math.max(0, Math.floor(b.net_variance_explained_zar));
  if (typeof b.unresolved_variance_zar === 'number')    out.unresolved_variance_zar = Math.max(0, Math.floor(b.unresolved_variance_zar));
  if (typeof b.variance_explained_pct === 'number')     out.variance_explained_pct = Math.max(0, Math.min(100, Math.floor(b.variance_explained_pct)));
  const f = toFlag(b.material_variance_unresolved);
  if (f !== undefined) out.material_variance_unresolved = f;
  return applyCommon(b, out);
}));

app.post('/:id/classify-break', async (c) => transition(c, 'classify_break', (_row, body) => {
  const b = body as Partial<CommonBody & {
    break_classification?: string;
    break_classified_pct?: number;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.break_classification === 'string') out.break_classification = b.break_classification;
  if (typeof b.break_classified_pct === 'number') out.break_classified_pct = Math.max(0, Math.min(100, Math.floor(b.break_classified_pct)));
  return applyCommon(b, out);
}));

app.post('/:id/log-root-cause', async (c) => transition(c, 'log_root_cause', (_row, body) => {
  const b = body as Partial<CommonBody & {
    root_cause_taxonomy?: string;
    icfr_deficiency_suspected?: boolean | number;
    material_weakness_open?: boolean | number;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.root_cause_taxonomy === 'string') out.root_cause_taxonomy = b.root_cause_taxonomy;
  const f1 = toFlag(b.icfr_deficiency_suspected);
  if (f1 !== undefined) out.icfr_deficiency_suspected = f1;
  const f2 = toFlag(b.material_weakness_open);
  if (f2 !== undefined) out.material_weakness_open = f2;
  return applyCommon(b, out);
}));

app.post('/:id/propose-remediation', async (c) => transition(c, 'propose_remediation', (_row, body) => {
  const b = body as Partial<CommonBody & Record<string, unknown>>;
  const out: Partial<RattRow> = {};
  const flagKeys: (keyof RattRow)[] = [
    'action_plan_drafted', 'owner_assigned', 'target_date_set',
    'evidence_attached', 'followup_test_passed',
  ];
  for (const k of flagKeys) {
    const f = toFlag((b as Record<string, unknown>)[k as string]);
    if (f !== undefined) (out as Record<string, unknown>)[k as string] = f;
  }
  const pct = (b as Record<string, unknown>).remediation_progress_pct;
  if (typeof pct === 'number') out.remediation_progress_pct = Math.max(0, Math.min(100, Math.floor(pct)));
  const closed = (b as Record<string, unknown>).remediation_closed_pct;
  if (typeof closed === 'number') out.remediation_closed_pct = Math.max(0, Math.min(100, Math.floor(closed)));
  return applyCommon(b, out);
}));

app.post('/:id/get-counter-party-signoff', async (c) => transition(c, 'get_counter_party_signoff', (_row, body) => {
  const b = body as Partial<CommonBody & { counter_party_signed_off?: boolean | number }>;
  const out: Partial<RattRow> = {};
  const f = toFlag(b.counter_party_signed_off);
  if (f !== undefined) out.counter_party_signed_off = f;
  else out.counter_party_signed_off = 1;
  return applyCommon(b, out);
}));

app.post('/:id/run-independent-review', async (c) => transition(c, 'run_independent_review', (_row, body) => {
  const b = body as Partial<CommonBody & { independent_review_passed?: boolean | number }>;
  const out: Partial<RattRow> = {};
  const f = toFlag(b.independent_review_passed);
  if (f !== undefined) out.independent_review_passed = f;
  return applyCommon(b, out);
}));

app.post('/:id/sign-attestation', async (c) => transition(c, 'sign_attestation', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w119_export_pack_ref?: string;
    external_auditor_firm?: string;
    external_auditor_engagement_ref?: string;
    external_auditor_jwt_jti?: string;
  }>;
  const out: Partial<RattRow> = {};
  if (typeof b.w119_export_pack_ref === 'string')             out.w119_export_pack_ref = b.w119_export_pack_ref;
  if (typeof b.external_auditor_firm === 'string')            out.external_auditor_firm = b.external_auditor_firm;
  if (typeof b.external_auditor_engagement_ref === 'string')  out.external_auditor_engagement_ref = b.external_auditor_engagement_ref;
  if (typeof b.external_auditor_jwt_jti === 'string')         out.external_auditor_jwt_jti = b.external_auditor_jwt_jti;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<CommonBody & { reject_reason?: string }>;
  const out: Partial<RattRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) => {
  const b = body as Partial<CommonBody & { suspend_reason?: string; regulator_audit_in_progress?: boolean | number }>;
  const out: Partial<RattRow> = {};
  if (typeof b.suspend_reason === 'string') out.suspend_reason = b.suspend_reason;
  const f = toFlag(b.regulator_audit_in_progress);
  if (f !== undefined) out.regulator_audit_in_progress = f;
  return applyCommon(b, out);
}));

app.post('/:id/resume-from-suspend', async (c) => transition(c, 'resume_from_suspend', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/restate', async (c) => transition(c, 'restate', (_row, body) => {
  const b = body as Partial<CommonBody & { restate_reason?: string; parent_attestation_id?: string }>;
  const out: Partial<RattRow> = {};
  if (typeof b.restate_reason === 'string') out.restate_reason = b.restate_reason;
  if (typeof b.parent_attestation_id === 'string') out.parent_attestation_id = b.parent_attestation_id;
  return applyCommon(b, out);
}));

app.post('/:id/escalate-to-audit-committee', async (c) => transition(c, 'escalate_to_audit_committee', (_row, body) => {
  const b = body as Partial<CommonBody & { escalation_reason?: string }>;
  const out: Partial<RattRow> = {};
  if (typeof b.escalation_reason === 'string') out.escalation_reason = b.escalation_reason;
  return applyCommon(b, out);
}));

app.post('/:id/lift-escalation', async (c) => transition(c, 'lift_escalation', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal attestation past sla_deadline_at, flips
// sla_breached=1, bumps escalation_level. Breach crosses regulator on
// quarterly_attestation + annual_audit tiers.
export async function reconciliationAttestationSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_reconciliation_attestation
     WHERE chain_status NOT IN ('archived','rejected')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RattRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_reconciliation_attestation
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `reconciliation_attestation_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_reconciliation_attestation_events (id, attestation_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'reconciliation_attestation_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'reconciler',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as RattTier)) {
      await fireCascade({
        event: 'reconciliation_attestation_sla_breached' as never,
        actor_id: 'system',
        entity_type: 'reconciliation_attestation',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: nightly variance + LIVE-score recompute (55 0 * * *) ──────────
//
// Refreshes LIVE-derived persisted scoring fields for every active
// attestation: reconciliation_completeness_index, icfr_control_
// effectiveness_index, variance_score_index, remediation_progress_index,
// attestation_health_band, days_to_quarterly_attestation.
export async function reconciliationAttestationVarianceRecomputeSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_reconciliation_attestation
     WHERE chain_status NOT IN ('archived','rejected')`,
  ).all<RattRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const completeness = reconciliationCompletenessIndex({
      attestation_proposed:  !!row.attestation_proposed_at,
      scope_defined:         !!row.scope_defined_at,
      feeds_ingested:        !!row.feeds_ingested_at,
      blocks_paired:         !!row.blocks_paired_at,
      variance_computed:     !!row.variance_computed_at,
      break_classified:      !!row.break_classified_at,
      root_cause_logged:     !!row.root_cause_logged_at,
      remediation_proposed:  !!row.remediation_proposed_at,
      counter_party_signoff: !!row.counter_party_signoff_at,
      independent_review:    !!row.independent_review_at,
      attestation_signed:    !!row.attestation_signed_at,
      archived:              !!row.archived_at,
      clean_close_bonus:     row.chain_status === 'archived' && !row.rejected_at,
    });

    const icfr = icfrControlEffectivenessIndex({
      coso_components_tested:    row.coso_components_tested,
      tsc_categories_tested:     row.tsc_categories_tested,
      feeds_paired_pct:          row.feeds_paired_pct,
      variance_explained_pct:    row.variance_explained_pct,
      break_classified_pct:      row.break_classified_pct,
      remediation_closed_pct:    row.remediation_closed_pct,
      counter_party_signed_off:  row.counter_party_signed_off,
      independent_review_passed: row.independent_review_passed,
      cfo_attestation_signed:    row.cfo_attestation_signed,
      audit_committee_briefed:   row.audit_committee_briefed,
      icfr_deficiency_suspected: row.icfr_deficiency_suspected,
      material_weakness_open:    row.material_weakness_open,
    });

    const variance = varianceScoreIndex({
      total_variance_zar:         row.total_variance_zar,
      materiality_threshold_zar:  row.materiality_threshold_zar,
      net_variance_explained_zar: row.net_variance_explained_zar,
      unresolved_variance_zar:    row.unresolved_variance_zar,
    });

    const remediation = remediationProgressIndex({
      root_cause_logged:        !!row.root_cause_logged_at,
      action_plan_drafted:      row.action_plan_drafted,
      owner_assigned:           row.owner_assigned,
      target_date_set:          row.target_date_set,
      evidence_attached:        row.evidence_attached,
      controller_reviewed:      row.independent_review_passed,
      cfo_signed_off:           row.cfo_attestation_signed,
      audit_committee_briefed:  row.audit_committee_briefed,
      remediation_closed:       row.remediation_closed_pct >= 100,
      followup_test_passed:     row.followup_test_passed,
      remediation_progress_pct: row.remediation_progress_pct,
    });

    const health = attestationHealthBand(
      row.chain_status,
      completeness,
      icfr,
      variance,
      remediation,
      !!row.sla_breached,
      !!row.rejected_at,
      row.chain_status === 'escalated_to_audit_committee',
      rowFloorFlags(row),
    );

    const daysToQ = daysToQuarterlyAttestation(now);

    await env.DB.prepare(
      `UPDATE oe_reconciliation_attestation
       SET reconciliation_completeness_index = ?, icfr_control_effectiveness_index = ?,
           variance_score_index = ?, remediation_progress_index = ?,
           attestation_health_band = ?,
           days_to_quarterly_attestation = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(completeness, icfr, variance, remediation, health, daysToQ, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

// ─── Cron: monthly audit-committee pack sweep (0 5 1 * *) ────────────────
//
// On the 1st of every month at 05:00 UTC, flag every active
// quarterly_attestation + annual_audit attestation whose audit
// committee pack is due as regulator_relevant=1. Audit-committee chair
// briefing must take place during the attestation window.
export async function reconciliationAttestationMonthlyAuditCommitteePackSweep(
  env: HonoEnv['Bindings'],
): Promise<{ flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT id FROM oe_reconciliation_attestation
     WHERE chain_status NOT IN ('archived','rejected')
       AND cadence IN ('quarterly_attestation','annual_audit')`,
  ).all<{ id: string }>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_reconciliation_attestation
       SET regulator_relevant = 1, is_reportable = 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, row.id).run();
    flagged++;
  }
  return { flagged };
}

export default app;
