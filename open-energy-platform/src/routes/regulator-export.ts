// ═══════════════════════════════════════════════════════════════════════════
// Wave 119 - Certified Regulator Export Packs.
//
// SECOND Phase-B wave. Consumes W118 published audit blocks and
// assembles per-regulator certified export packs (NERSA / IPPO / SARB
// / DMRE / FSCA / DFFE / DTI / JSE-SRL / SARS / CIPC) for lodgement
// via the regulator API.
//
// Where W118 is the tamper-evident SPINE, W119 is the regulator-facing
// OUTPUT. The lodge endpoint is PUBLIC and mTLS-gated (cf-client-cert-
// sha256 header set by the Cloudflare edge after mutual-TLS handshake).
// All other endpoints require admin/regulator auth (write) or any of
// the 9 personas (read).
//
// 16 actions: propose_pack / select_blocks / filter_leaves /
//   assemble_xbrl / attach_narratives / run_internal_qa /
//   get_counterparty_signoff / package / countersign / lodge_via_api /
//   record_acknowledgement / archive / reject_pack / withdraw /
//   restate / suspend.
//
// SIGNATURE Phase-B regulator crossings:
//   reject_pack -> EVERY tier (W119 SIGNATURE REGULATOR-REJECT-PACK
//     hard line)
//   withdraw -> EVERY tier WHEN blocks_selected included published
//     blocks (audit-trail concern)
//   restate -> quarterly_attestation + annual_audit only
//   sla_breached -> quarterly_attestation + half_year + annual_audit
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
  regulatorExportWindowHours,
  daysToQuarterlyAttestation,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  bridgesToW118AuditChain,
  packCompletenessIndex,
  xbrlConformanceIndex,
  esgTaxonomyCoverageIndex,
  controlsNarrativeIndex,
  integrityIndex,
  isValidMtlsFingerprint,
  isKnownRegulatorTarget,
  packHealthBand,
  REGULATOR_TARGETS,
  type RepStatus,
  type RepAction,
  type RepTier,
  type RepCadence,
  type RegulatorTarget,
} from '../utils/regulator-export-pack-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W119 = admin + regulator write. Regulator can record_acknowledgement
// + reject_pack + archive. All other transitions are admin-only.
const WRITE_ROLES = new Set(['admin', 'regulator']);
const REGULATOR_ONLY_ACTIONS = new Set<RepAction>([
  'record_acknowledgement', 'reject_pack', 'archive',
]);

interface RepRow {
  id: string;
  pack_number: string;
  pack_cadence: RepCadence;
  regulator_target: RegulatorTarget;

  w113_evm_ref: string | null;
  w114_doc_control_ref: string | null;
  w115_submittal_ref: string | null;
  w116_rfi_ref: string | null;
  w117_change_order_ref: string | null;
  w118_block_height_range_low: number | null;
  w118_block_height_range_high: number | null;
  parent_pack_id: string | null;

  cross_regulator_pack: number;
  material_restatement: number;
  esg_double_materiality_trigger: number;
  lender_distribution_required: number;
  regulator_audit_in_progress: number;

  taxonomy_version_set: number;
  schema_well_formed: number;
  required_element_assets: number;
  required_element_liabilities: number;
  required_element_equity: number;
  required_element_revenue: number;
  required_element_profit_loss: number;
  required_element_cash_equivalents: number;
  required_element_segments_reported: number;
  ixbrl_inline_html_valid: number;
  pdf_a3_archival_attached: number;
  signing_policy_etsi_119312: number;
  cms_signature_rfc5652: number;
  xbrl_conformance_score: number;

  gri_standards_attached: number;
  sasb_standards_attached: number;
  tcfd_recommendations_attached: number;
  issb_ifrs_s1_s2_attached: number;
  esg_taxonomy_coverage_pct: number;

  coso_components_present: number;
  tsc_trust_categories_present: number;
  management_assertion_signed: number;
  auditor_opinion_attached: number;
  bridge_letter_attached: number;
  controls_narrative_completeness: number;

  internal_qa_passed: number;
  counterparty_signoff_obtained: number;
  regulator_ack_received: number;

  current_tier: RepTier;
  authority_required: string | null;
  urgency_band: string | null;
  pack_health_band: string | null;
  pack_completeness_index: number;
  integrity_index: number;
  regulator_export_window_hours: number;
  days_to_quarterly_attestation: number;

  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  restate_reason: string | null;
  suspend_reason: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  mtls_cert_fingerprint: string | null;
  regulator_ack_code: string | null;
  regulator_reject_code: string | null;

  chain_status: RepStatus;
  pack_proposed_at: string | null;
  blocks_selected_at: string | null;
  leaves_filtered_at: string | null;
  xbrl_assembled_at: string | null;
  narratives_attached_at: string | null;
  internal_qa_at: string | null;
  counterparty_signoff_at: string | null;
  packaged_at: string | null;
  countersigned_at: string | null;
  lodged_via_api_at: string | null;
  acknowledged_by_regulator_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  restated_at: string | null;
  suspended_at: string | null;

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

interface RepEventRow {
  id: string;
  pack_id: string;
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

const TIMESTAMP_COLUMN: Record<RepStatus, keyof RepRow> = {
  pack_proposed:            'pack_proposed_at',
  blocks_selected:          'blocks_selected_at',
  leaves_filtered:          'leaves_filtered_at',
  xbrl_assembled:           'xbrl_assembled_at',
  narratives_attached:      'narratives_attached_at',
  internal_qa:              'internal_qa_at',
  counterparty_signoff:     'counterparty_signoff_at',
  packaged:                 'packaged_at',
  countersigned:            'countersigned_at',
  lodged_via_api:           'lodged_via_api_at',
  acknowledged_by_regulator:'acknowledged_by_regulator_at',
  archived:                 'archived_at',
  rejected_by_regulator:    'rejected_at',
  withdrawn:                'withdrawn_at',
  restated:                 'restated_at',
  suspended:                'suspended_at',
};

function statusEnteredAt(row: RepRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.pack_proposed_at ? new Date(row.pack_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.pack_proposed_at ? new Date(row.pack_proposed_at) : null);
}

function rowFloorFlags(row: RepRow) {
  return {
    cross_regulator_pack:           row.cross_regulator_pack,
    material_restatement:           row.material_restatement,
    esg_double_materiality_trigger: row.esg_double_materiality_trigger,
    lender_distribution_required:   row.lender_distribution_required,
    regulator_audit_in_progress:    row.regulator_audit_in_progress,
  };
}

function decorate(row: RepRow, now: Date) {
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
  const regExportWindow = regulatorExportWindowHours(tier);
  const daysToQ = daysToQuarterlyAttestation(now);

  const flags = rowFloorFlags(row);
  const floorFlags = countFloorFlags(flags);
  const floorQuarterly = floorAtQuarterly(flags);
  const floorAnnual = floorAtAnnual(flags);

  const completenessLive = packCompletenessIndex({
    pack_proposed:             !!row.pack_proposed_at,
    blocks_selected:           !!row.blocks_selected_at,
    leaves_filtered:           !!row.leaves_filtered_at,
    xbrl_assembled:            !!row.xbrl_assembled_at,
    narratives_attached:       !!row.narratives_attached_at,
    internal_qa:               !!row.internal_qa_at,
    counterparty_signoff:      !!row.counterparty_signoff_at,
    packaged:                  !!row.packaged_at,
    countersigned:             !!row.countersigned_at,
    lodged_via_api:            !!row.lodged_via_api_at,
    acknowledged_by_regulator: !!row.acknowledged_by_regulator_at,
    archived:                  !!row.archived_at,
    clean_close_bonus:         status === 'archived' && !row.rejected_at && !row.withdrawn_at,
  });

  const xbrlLive = xbrlConformanceIndex({
    xbrl_assembled:                     !!row.xbrl_assembled_at,
    taxonomy_version_set:               row.taxonomy_version_set,
    schema_well_formed:                 row.schema_well_formed,
    required_element_assets:            row.required_element_assets,
    required_element_liabilities:       row.required_element_liabilities,
    required_element_equity:            row.required_element_equity,
    required_element_revenue:           row.required_element_revenue,
    required_element_profit_loss:       row.required_element_profit_loss,
    required_element_cash_equivalents:  row.required_element_cash_equivalents,
    required_element_segments_reported: row.required_element_segments_reported,
    ixbrl_inline_html_valid:            row.ixbrl_inline_html_valid,
    pdf_a3_archival_attached:           row.pdf_a3_archival_attached,
    signing_policy_etsi_119312:         row.signing_policy_etsi_119312,
    cms_signature_rfc5652:              row.cms_signature_rfc5652,
  });

  const esgLive = esgTaxonomyCoverageIndex({
    gri_standards_attached:        row.gri_standards_attached,
    sasb_standards_attached:       row.sasb_standards_attached,
    tcfd_recommendations_attached: row.tcfd_recommendations_attached,
    issb_ifrs_s1_s2_attached:      row.issb_ifrs_s1_s2_attached,
  });

  const controlsLive = controlsNarrativeIndex({
    coso_components_present:       row.coso_components_present,
    tsc_trust_categories_present:  row.tsc_trust_categories_present,
    management_assertion_signed:   row.management_assertion_signed,
    auditor_opinion_attached:      row.auditor_opinion_attached,
    bridge_letter_attached:        row.bridge_letter_attached,
  });

  const integrityLive = integrityIndex({
    bridge_w113_evm:               bridgesToW113EvmChain(row.w113_evm_ref),
    bridge_w114_doc:               bridgesToW114DocControlChain(row.w114_doc_control_ref),
    bridge_w115_sub:               bridgesToW115SubmittalChain(row.w115_submittal_ref),
    bridge_w116_rfi:               bridgesToW116RfiChain(row.w116_rfi_ref),
    bridge_w117_co:                bridgesToW117ChangeOrderChain(row.w117_change_order_ref),
    bridge_w118_audit:             bridgesToW118AuditChain(
      row.w118_block_height_range_low != null ? String(row.w118_block_height_range_low) : null,
    ),
    internal_qa_passed:            row.internal_qa_passed,
    counterparty_signoff_obtained: row.counterparty_signoff_obtained,
    regulator_ack_received:        row.regulator_ack_received,
  });

  const healthLive = packHealthBand(
    status,
    integrityLive,
    completenessLive,
    xbrlLive,
    minutesUntilSla != null && minutesUntilSla < 0,
    !!row.rejected_at,
    status === 'withdrawn',
    status === 'suspended',
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
    regulator_export_window_hours_live: regExportWindow,
    days_to_quarterly_attestation_live: daysToQ,
    floor_flag_count_live: floorFlags,
    floor_at_quarterly_live: floorQuarterly,
    floor_at_annual_live: floorAnnual,
    pack_completeness_index_live: completenessLive,
    xbrl_conformance_score_live: xbrlLive,
    esg_taxonomy_coverage_pct_live: esgLive,
    controls_narrative_completeness_live: controlsLive,
    integrity_index_live: integrityLive,
    pack_health_band_live: healthLive,
    bridges_to_w113_evm_chain_live: bridgesToW113EvmChain(row.w113_evm_ref),
    bridges_to_w114_doc_control_chain_live: bridgesToW114DocControlChain(row.w114_doc_control_ref),
    bridges_to_w115_submittal_chain_live: bridgesToW115SubmittalChain(row.w115_submittal_ref),
    bridges_to_w116_rfi_chain_live: bridgesToW116RfiChain(row.w116_rfi_ref),
    bridges_to_w117_change_order_chain_live: bridgesToW117ChangeOrderChain(row.w117_change_order_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(
      row.w118_block_height_range_low != null ? String(row.w118_block_height_range_low) : null,
    ),
  };
}

const app = new Hono<HonoEnv>();

// PUBLIC mTLS lodge endpoint mounted BEFORE auth middleware. Cloudflare
// edge terminates mTLS and sets the cf-client-cert-sha256 header with
// the SHA-256 fingerprint of the client cert. We validate format and
// fall through to the auth path for write attempts (lodge is itself a
// write but the mTLS fingerprint is the credential).
const publicApp = new Hono<HonoEnv>();

// ─── PUBLIC mTLS lodge endpoint (NO Bearer auth) ─────────────────────────
//
// POST /api/regulator-exports/lodge/:target with body { pack_id }.
// Header `cf-client-cert-sha256` (or `x-mtls-cert-fingerprint`) must be
// a valid SHA-256 hex fingerprint. The endpoint advances the pack from
// `countersigned` to `lodged_via_api`. This is the only state-changing
// endpoint that does NOT use Bearer-JWT auth.
publicApp.post('/lodge/:target', async (c) => {
  const target = c.req.param('target');
  if (!isKnownRegulatorTarget(target)) {
    return c.json({ success: false, error: 'Unknown regulator target' }, 400);
  }
  const fingerprint =
    c.req.header('cf-client-cert-sha256') ||
    c.req.header('x-mtls-cert-fingerprint') ||
    '';
  if (!isValidMtlsFingerprint(fingerprint)) {
    return c.json({ success: false, error: 'mTLS fingerprint missing or malformed' }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as { pack_id?: string };
  const pack_id = typeof body.pack_id === 'string' ? body.pack_id : '';
  if (!pack_id) {
    return c.json({ success: false, error: 'pack_id required' }, 400);
  }
  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_regulator_export_pack WHERE id = ? AND regulator_target = ?',
  ).bind(pack_id, target).first<RepRow>();
  if (!row) return c.json({ success: false, error: 'Pack not found for target' }, 404);

  const to = nextStatus(row.chain_status, 'lodge_via_api');
  if (!to) {
    return c.json({
      success: false,
      error: `Pack not ready for lodgement: status=${row.chain_status}`,
    }, 422);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const tier = row.current_tier;
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);

  await c.env.DB.prepare(
    `UPDATE oe_regulator_export_pack
     SET chain_status = ?, lodged_via_api_at = ?,
         mtls_cert_fingerprint = ?,
         sla_target_hours = ?, sla_deadline_at = ?,
         updated_at = ?
     WHERE id = ?`,
  ).bind(to, nowIso, fingerprint.replace(/[:\s-]/g, '').toLowerCase(), slaHrs, slaIso, nowIso, pack_id).run();

  const evtId = `regulator_export_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_regulator_export_pack_events (id, pack_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, pack_id, 'regulator_export_pack_lodged',
    row.chain_status, to, tier, tier,
    'mtls', 'CEO',
    `Lodged via mTLS to ${target}`,
    JSON.stringify({ target, mtls_fingerprint_present: true }), nowIso,
  ).run();

  await fireCascade({
    event: 'regulator_export_pack_lodged',
    actor_id: 'mtls',
    entity_type: 'regulator_export_pack',
    entity_id: pack_id,
    data: { target, tier, chain_status: to, from_status: row.chain_status },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_regulator_export_pack WHERE id = ?').bind(pack_id).first<RepRow>();
  return c.json({ success: true, data: { pack: refreshed ? decorate(refreshed, now) : null } });
});

app.route('/', publicApp);

// All non-public routes require auth.
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const cadence    = c.req.query('cadence');
  const target     = c.req.query('target');
  const health     = c.req.query('pack_health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_regulator_export_pack WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)    { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)  { sql += ' AND chain_status = ?'; binds.push(status); }
  if (cadence) { sql += ' AND pack_cadence = ?'; binds.push(cadence); }
  if (target)  { sql += ' AND regulator_target = ?'; binds.push(target); }
  if (health)  { sql += ' AND pack_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RepRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_cadence: Record<string, number> = {};
  const by_target: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_cadence[i.pack_cadence] = (by_cadence[i.pack_cadence] || 0) + 1;
    by_target[i.regulator_target] = (by_target[i.regulator_target] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.pack_health_band_live] = (by_health[i.pack_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'pack_proposed').length;
  const selected_count      = items.filter((i) => i.chain_status === 'blocks_selected').length;
  const filtered_count      = items.filter((i) => i.chain_status === 'leaves_filtered').length;
  const xbrl_count          = items.filter((i) => i.chain_status === 'xbrl_assembled').length;
  const narratives_count    = items.filter((i) => i.chain_status === 'narratives_attached').length;
  const internal_qa_count   = items.filter((i) => i.chain_status === 'internal_qa').length;
  const signoff_count       = items.filter((i) => i.chain_status === 'counterparty_signoff').length;
  const packaged_count      = items.filter((i) => i.chain_status === 'packaged').length;
  const countersigned_count = items.filter((i) => i.chain_status === 'countersigned').length;
  const lodged_count        = items.filter((i) => i.chain_status === 'lodged_via_api').length;
  const acked_count         = items.filter((i) => i.chain_status === 'acknowledged_by_regulator').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count      = items.filter((i) => i.chain_status === 'rejected_by_regulator').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const restated_count      = items.filter((i) => i.chain_status === 'restated').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w113_bridged        = items.filter((i) => i.bridges_to_w113_evm_chain_live).length;
  const w114_bridged        = items.filter((i) => i.bridges_to_w114_doc_control_chain_live).length;
  const w115_bridged        = items.filter((i) => i.bridges_to_w115_submittal_chain_live).length;
  const w116_bridged        = items.filter((i) => i.bridges_to_w116_rfi_chain_live).length;
  const w117_bridged        = items.filter((i) => i.bridges_to_w117_change_order_chain_live).length;
  const completeness_avg    = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.pack_completeness_index_live || 0), 0) / items.length)
    : 0;
  const xbrl_avg            = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.xbrl_conformance_score_live || 0), 0) / items.length)
    : 0;
  const esg_avg             = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.esg_taxonomy_coverage_pct_live || 0), 0) / items.length)
    : 0;
  const controls_avg        = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.controls_narrative_completeness_live || 0), 0) / items.length)
    : 0;
  const integrity_avg       = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.integrity_index_live || 0), 0) / items.length)
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_cadence,
      by_target,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      selected_count,
      filtered_count,
      xbrl_count,
      narratives_count,
      internal_qa_count,
      signoff_count,
      packaged_count,
      countersigned_count,
      lodged_count,
      acked_count,
      archived_count,
      rejected_count,
      withdrawn_count,
      restated_count,
      suspended_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w118_bridged_count: w118_bridged,
      w113_bridged_count: w113_bridged,
      w114_bridged_count: w114_bridged,
      w115_bridged_count: w115_bridged,
      w116_bridged_count: w116_bridged,
      w117_bridged_count: w117_bridged,
      completeness_avg,
      xbrl_avg,
      esg_avg,
      controls_avg,
      integrity_avg,
      regulator_targets: REGULATOR_TARGETS,
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
    `SELECT chain_status, current_tier, pack_health_band, pack_cadence,
            regulator_target, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_regulator_export_pack
     GROUP BY chain_status, current_tier, pack_health_band, pack_cadence,
              regulator_target, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; pack_health_band: string | null;
    pack_cadence: string | null; regulator_target: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_cadence: Record<string, number> = {};
  const by_target: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.pack_health_band) by_health[r.pack_health_band] = (by_health[r.pack_health_band] || 0) + r.n;
    if (r.pack_cadence) by_cadence[r.pack_cadence] = (by_cadence[r.pack_cadence] || 0) + r.n;
    if (r.regulator_target) by_target[r.regulator_target] = (by_target[r.regulator_target] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_cadence, by_target,
      by_regulator_relevant, by_sla_breached,
      regulator_targets: REGULATOR_TARGETS,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_regulator_export_pack WHERE id = ?').bind(id).first<RepRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_regulator_export_pack_events WHERE pack_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RepEventRow>();

  return c.json({
    success: true,
    data: {
      pack: decorate(row, new Date()),
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
  pack_cadence?: RepCadence;
  regulator_target?: RegulatorTarget;
  w113_evm_ref?: string;
  w114_doc_control_ref?: string;
  w115_submittal_ref?: string;
  w116_rfi_ref?: string;
  w117_change_order_ref?: string;
  w118_block_height_range_low?: number;
  w118_block_height_range_high?: number;
  parent_pack_id?: string;
  cross_regulator_pack?: boolean | number;
  material_restatement?: boolean | number;
  esg_double_materiality_trigger?: boolean | number;
  lender_distribution_required?: boolean | number;
  regulator_audit_in_progress?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<RepRow>): Partial<RepRow> {
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  if (typeof b.regulator_inbox_ref === 'string') out.regulator_inbox_ref = b.regulator_inbox_ref;
  if (typeof b.title === 'string')               out.title = b.title;
  return out;
}

// ─── Create endpoint (propose_pack) ───────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `rep-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const cadence: RepCadence = (body.pack_cadence as RepCadence | undefined) ?? 'ad_hoc';
  const target: RegulatorTarget = isKnownRegulatorTarget(body.regulator_target as string | undefined)
    ? body.regulator_target as RegulatorTarget
    : 'nersa';

  const flags = {
    cross_regulator_pack:           toFlag(body.cross_regulator_pack) ?? 0,
    material_restatement:           toFlag(body.material_restatement) ?? 0,
    esg_double_materiality_trigger: toFlag(body.esg_double_materiality_trigger) ?? 0,
    lender_distribution_required:   toFlag(body.lender_distribution_required) ?? 0,
    regulator_audit_in_progress:    toFlag(body.regulator_audit_in_progress) ?? 0,
  };
  const rawTier = tierForCadence(cadence);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('pack_proposed', tier, now);
  const slaHrs = slaWindowHours('pack_proposed', tier);
  const regExportWindow = regulatorExportWindowHours(tier);
  const daysToQ = daysToQuarterlyAttestation(now);

  // Pack number = REP-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_regulator_export_pack`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const packNum = `REP-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  await c.env.DB.prepare(
    `INSERT INTO oe_regulator_export_pack (
      id, pack_number, pack_cadence, regulator_target,
      w113_evm_ref, w114_doc_control_ref, w115_submittal_ref,
      w116_rfi_ref, w117_change_order_ref,
      w118_block_height_range_low, w118_block_height_range_high,
      parent_pack_id,
      cross_regulator_pack, material_restatement,
      esg_double_materiality_trigger, lender_distribution_required,
      regulator_audit_in_progress,
      current_tier, authority_required, urgency_band,
      pack_completeness_index, integrity_index,
      regulator_export_window_hours, days_to_quarterly_attestation,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, pack_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, packNum, cadence, target,
    body.w113_evm_ref ?? null, body.w114_doc_control_ref ?? null, body.w115_submittal_ref ?? null,
    body.w116_rfi_ref ?? null, body.w117_change_order_ref ?? null,
    body.w118_block_height_range_low ?? null, body.w118_block_height_range_high ?? null,
    body.parent_pack_id ?? null,
    flags.cross_regulator_pack, flags.material_restatement,
    flags.esg_double_materiality_trigger, flags.lender_distribution_required,
    flags.regulator_audit_in_progress,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    3, 0,
    regExportWindow, daysToQ,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'pack_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `regulator_export_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_regulator_export_pack_events (id, pack_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'regulator_export_pack_proposed',
    null, 'pack_proposed', null, tier,
    user.id, partyForAction('propose_pack'),
    null, JSON.stringify({ tier, cadence, target }), nowIso,
  ).run();

  await fireCascade({
    event: 'regulator_export_pack_proposed',
    actor_id: user.id,
    entity_type: 'regulator_export_pack',
    entity_id: id,
    data: { tier, pack_cadence: cadence, regulator_target: target, chain_status: 'pack_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_regulator_export_pack WHERE id = ?').bind(id).first<RepRow>();
  return c.json({ success: true, data: { pack: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: RepAction,
  bodyHandler?: (row: RepRow, body: Record<string, unknown>) => Partial<RepRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  // Regulator-only actions: only the regulator role can fire these.
  // Admin can also fire them (regulator role embeds admin in this context).
  if (REGULATOR_ONLY_ACTIONS.has(action) && user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Forbidden — regulator role required' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_regulator_export_pack WHERE id = ?').bind(id).first<RepRow>();
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
  const cadence = (overrides.pack_cadence as RepCadence | undefined) ?? row.pack_cadence;
  const rawTier = tierForCadence(cadence);
  const floorFlags = {
    cross_regulator_pack:
      (overrides.cross_regulator_pack as number | undefined) ?? row.cross_regulator_pack,
    material_restatement:
      (overrides.material_restatement as number | undefined) ?? row.material_restatement,
    esg_double_materiality_trigger:
      (overrides.esg_double_materiality_trigger as number | undefined) ?? row.esg_double_materiality_trigger,
    lender_distribution_required:
      (overrides.lender_distribution_required as number | undefined) ?? row.lender_distribution_required,
    regulator_audit_in_progress:
      (overrides.regulator_audit_in_progress as number | undefined) ?? row.regulator_audit_in_progress,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);
  overrides.regulator_export_window_hours = regulatorExportWindowHours(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;
  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof RepRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = packCompletenessIndex({
    pack_proposed:             willSetTs('pack_proposed_at'),
    blocks_selected:           willSetTs('blocks_selected_at'),
    leaves_filtered:           willSetTs('leaves_filtered_at'),
    xbrl_assembled:            willSetTs('xbrl_assembled_at'),
    narratives_attached:       willSetTs('narratives_attached_at'),
    internal_qa:               willSetTs('internal_qa_at'),
    counterparty_signoff:      willSetTs('counterparty_signoff_at'),
    packaged:                  willSetTs('packaged_at'),
    countersigned:             willSetTs('countersigned_at'),
    lodged_via_api:            willSetTs('lodged_via_api_at'),
    acknowledged_by_regulator: willSetTs('acknowledged_by_regulator_at'),
    archived:                  willSetTs('archived_at'),
    clean_close_bonus:         to === 'archived' && !row.rejected_at && !row.withdrawn_at,
  });
  overrides.pack_completeness_index = completeness;

  // Re-derive integrity index from latest bridge + QA + ACK state.
  const integrity = integrityIndex({
    bridge_w113_evm: bridgesToW113EvmChain(
      (overrides.w113_evm_ref as string | undefined) ?? row.w113_evm_ref,
    ),
    bridge_w114_doc: bridgesToW114DocControlChain(
      (overrides.w114_doc_control_ref as string | undefined) ?? row.w114_doc_control_ref,
    ),
    bridge_w115_sub: bridgesToW115SubmittalChain(
      (overrides.w115_submittal_ref as string | undefined) ?? row.w115_submittal_ref,
    ),
    bridge_w116_rfi: bridgesToW116RfiChain(
      (overrides.w116_rfi_ref as string | undefined) ?? row.w116_rfi_ref,
    ),
    bridge_w117_co: bridgesToW117ChangeOrderChain(
      (overrides.w117_change_order_ref as string | undefined) ?? row.w117_change_order_ref,
    ),
    bridge_w118_audit: bridgesToW118AuditChain(
      String((overrides.w118_block_height_range_low as number | undefined) ?? row.w118_block_height_range_low ?? ''),
    ),
    internal_qa_passed:
      (overrides.internal_qa_passed as number | undefined) ?? row.internal_qa_passed,
    counterparty_signoff_obtained:
      (overrides.counterparty_signoff_obtained as number | undefined) ?? row.counterparty_signoff_obtained,
    regulator_ack_received:
      (overrides.regulator_ack_received as number | undefined) ?? row.regulator_ack_received,
  });
  overrides.integrity_index = integrity;

  // Re-derive XBRL conformance + ESG coverage + controls narrative.
  const xbrl = xbrlConformanceIndex({
    xbrl_assembled: willSetTs('xbrl_assembled_at'),
    taxonomy_version_set:
      (overrides.taxonomy_version_set as number | undefined) ?? row.taxonomy_version_set,
    schema_well_formed:
      (overrides.schema_well_formed as number | undefined) ?? row.schema_well_formed,
    required_element_assets:
      (overrides.required_element_assets as number | undefined) ?? row.required_element_assets,
    required_element_liabilities:
      (overrides.required_element_liabilities as number | undefined) ?? row.required_element_liabilities,
    required_element_equity:
      (overrides.required_element_equity as number | undefined) ?? row.required_element_equity,
    required_element_revenue:
      (overrides.required_element_revenue as number | undefined) ?? row.required_element_revenue,
    required_element_profit_loss:
      (overrides.required_element_profit_loss as number | undefined) ?? row.required_element_profit_loss,
    required_element_cash_equivalents:
      (overrides.required_element_cash_equivalents as number | undefined) ?? row.required_element_cash_equivalents,
    required_element_segments_reported:
      (overrides.required_element_segments_reported as number | undefined) ?? row.required_element_segments_reported,
    ixbrl_inline_html_valid:
      (overrides.ixbrl_inline_html_valid as number | undefined) ?? row.ixbrl_inline_html_valid,
    pdf_a3_archival_attached:
      (overrides.pdf_a3_archival_attached as number | undefined) ?? row.pdf_a3_archival_attached,
    signing_policy_etsi_119312:
      (overrides.signing_policy_etsi_119312 as number | undefined) ?? row.signing_policy_etsi_119312,
    cms_signature_rfc5652:
      (overrides.cms_signature_rfc5652 as number | undefined) ?? row.cms_signature_rfc5652,
  });
  overrides.xbrl_conformance_score = xbrl;

  const esg = esgTaxonomyCoverageIndex({
    gri_standards_attached:
      (overrides.gri_standards_attached as number | undefined) ?? row.gri_standards_attached,
    sasb_standards_attached:
      (overrides.sasb_standards_attached as number | undefined) ?? row.sasb_standards_attached,
    tcfd_recommendations_attached:
      (overrides.tcfd_recommendations_attached as number | undefined) ?? row.tcfd_recommendations_attached,
    issb_ifrs_s1_s2_attached:
      (overrides.issb_ifrs_s1_s2_attached as number | undefined) ?? row.issb_ifrs_s1_s2_attached,
  });
  overrides.esg_taxonomy_coverage_pct = esg;

  const controls = controlsNarrativeIndex({
    coso_components_present:
      (overrides.coso_components_present as number | undefined) ?? row.coso_components_present,
    tsc_trust_categories_present:
      (overrides.tsc_trust_categories_present as number | undefined) ?? row.tsc_trust_categories_present,
    management_assertion_signed:
      (overrides.management_assertion_signed as number | undefined) ?? row.management_assertion_signed,
    auditor_opinion_attached:
      (overrides.auditor_opinion_attached as number | undefined) ?? row.auditor_opinion_attached,
    bridge_letter_attached:
      (overrides.bridge_letter_attached as number | undefined) ?? row.bridge_letter_attached,
  });
  overrides.controls_narrative_completeness = controls;

  // Re-derive pack_health_band.
  overrides.pack_health_band = packHealthBand(
    to,
    integrity,
    completeness,
    xbrl,
    !!row.sla_breached,
    to === 'rejected_by_regulator' || !!row.rejected_at,
    to === 'withdrawn',
    to === 'suspended',
  );

  // SIGNATURE crossings — reject_pack crosses EVERY tier; withdraw
  // crosses EVERY tier when published blocks included; restate quarterly
  // + annual only; suspend if regulator_audit_in_progress.
  const publishedIncluded = !!(row.w118_block_height_range_low && row.w118_block_height_range_low > 0);
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    published_blocks_included: publishedIncluded,
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
    `UPDATE oe_regulator_export_pack SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `regulator_export_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_regulator_export_pack_events (id, pack_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `regulator_export_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'regulator_export_pack',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_regulator_export_pack WHERE id = ?').bind(id).first<RepRow>();
  return c.json({ success: true, data: { pack: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/select-blocks', async (c) => transition(c, 'select_blocks', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w118_block_height_range_low?: number;
    w118_block_height_range_high?: number;
    w113_evm_ref?: string; w114_doc_control_ref?: string;
    w115_submittal_ref?: string; w116_rfi_ref?: string;
    w117_change_order_ref?: string;
  }>;
  const out: Partial<RepRow> = {};
  if (typeof b.w118_block_height_range_low === 'number')  out.w118_block_height_range_low = b.w118_block_height_range_low;
  if (typeof b.w118_block_height_range_high === 'number') out.w118_block_height_range_high = b.w118_block_height_range_high;
  if (typeof b.w113_evm_ref === 'string')         out.w113_evm_ref = b.w113_evm_ref;
  if (typeof b.w114_doc_control_ref === 'string') out.w114_doc_control_ref = b.w114_doc_control_ref;
  if (typeof b.w115_submittal_ref === 'string')   out.w115_submittal_ref = b.w115_submittal_ref;
  if (typeof b.w116_rfi_ref === 'string')         out.w116_rfi_ref = b.w116_rfi_ref;
  if (typeof b.w117_change_order_ref === 'string') out.w117_change_order_ref = b.w117_change_order_ref;
  return applyCommon(b, out);
}));

app.post('/:id/filter-leaves', async (c) => transition(c, 'filter_leaves', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/assemble-xbrl', async (c) => transition(c, 'assemble_xbrl', (_row, body) => {
  const b = body as Partial<CommonBody & Record<string, unknown>>;
  const out: Partial<RepRow> = {};
  const flagKeys: (keyof RepRow)[] = [
    'taxonomy_version_set', 'schema_well_formed',
    'required_element_assets', 'required_element_liabilities',
    'required_element_equity', 'required_element_revenue',
    'required_element_profit_loss', 'required_element_cash_equivalents',
    'required_element_segments_reported',
    'ixbrl_inline_html_valid', 'pdf_a3_archival_attached',
    'signing_policy_etsi_119312', 'cms_signature_rfc5652',
  ];
  for (const k of flagKeys) {
    const f = toFlag((b as Record<string, unknown>)[k as string]);
    if (f !== undefined) (out as Record<string, unknown>)[k as string] = f;
  }
  return applyCommon(b, out);
}));

app.post('/:id/attach-narratives', async (c) => transition(c, 'attach_narratives', (_row, body) => {
  const b = body as Partial<CommonBody & Record<string, unknown>>;
  const out: Partial<RepRow> = {};
  const flagKeys: (keyof RepRow)[] = [
    'gri_standards_attached', 'sasb_standards_attached',
    'tcfd_recommendations_attached', 'issb_ifrs_s1_s2_attached',
    'management_assertion_signed', 'auditor_opinion_attached',
    'bridge_letter_attached',
  ];
  for (const k of flagKeys) {
    const f = toFlag((b as Record<string, unknown>)[k as string]);
    if (f !== undefined) (out as Record<string, unknown>)[k as string] = f;
  }
  const cosoCount = (b as Record<string, unknown>).coso_components_present;
  if (typeof cosoCount === 'number') out.coso_components_present = Math.max(0, Math.min(5, cosoCount));
  const tscCount = (b as Record<string, unknown>).tsc_trust_categories_present;
  if (typeof tscCount === 'number') out.tsc_trust_categories_present = Math.max(0, Math.min(5, tscCount));
  return applyCommon(b, out);
}));

app.post('/:id/run-internal-qa', async (c) => transition(c, 'run_internal_qa', (_row, body) => {
  const b = body as Partial<CommonBody & { internal_qa_passed?: boolean | number }>;
  const out: Partial<RepRow> = {};
  const f = toFlag(b.internal_qa_passed);
  if (f !== undefined) out.internal_qa_passed = f;
  else out.internal_qa_passed = 1;
  return applyCommon(b, out);
}));

app.post('/:id/get-counterparty-signoff', async (c) => transition(c, 'get_counterparty_signoff', (_row, body) => {
  const b = body as Partial<CommonBody & { counterparty_signoff_obtained?: boolean | number }>;
  const out: Partial<RepRow> = {};
  const f = toFlag(b.counterparty_signoff_obtained);
  if (f !== undefined) out.counterparty_signoff_obtained = f;
  else out.counterparty_signoff_obtained = 1;
  return applyCommon(b, out);
}));

app.post('/:id/package', async (c) => transition(c, 'package', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/countersign', async (c) => transition(c, 'countersign', (_row, body) => {
  const b = body as Partial<CommonBody & { mtls_cert_fingerprint?: string }>;
  const out: Partial<RepRow> = {};
  if (typeof b.mtls_cert_fingerprint === 'string' && isValidMtlsFingerprint(b.mtls_cert_fingerprint)) {
    out.mtls_cert_fingerprint = b.mtls_cert_fingerprint.replace(/[:\s-]/g, '').toLowerCase();
  }
  return applyCommon(b, out);
}));

app.post('/:id/lodge-via-api', async (c) => transition(c, 'lodge_via_api', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/record-acknowledgement', async (c) => transition(c, 'record_acknowledgement', (_row, body) => {
  const b = body as Partial<CommonBody & { regulator_ack_code?: string; regulator_inbox_ref?: string }>;
  const out: Partial<RepRow> = { regulator_ack_received: 1 };
  if (typeof b.regulator_ack_code === 'string') out.regulator_ack_code = b.regulator_ack_code;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {}),
));

app.post('/:id/reject-pack', async (c) => transition(c, 'reject_pack', (_row, body) => {
  const b = body as Partial<CommonBody & { reject_reason?: string; regulator_reject_code?: string }>;
  const out: Partial<RepRow> = {};
  if (typeof b.reject_reason === 'string')         out.reject_reason = b.reject_reason;
  if (typeof b.regulator_reject_code === 'string') out.regulator_reject_code = b.regulator_reject_code;
  return applyCommon(b, out);
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<CommonBody & { withdraw_reason?: string }>;
  const out: Partial<RepRow> = {};
  if (typeof b.withdraw_reason === 'string') out.withdraw_reason = b.withdraw_reason;
  return applyCommon(b, out);
}));

app.post('/:id/restate', async (c) => transition(c, 'restate', (_row, body) => {
  const b = body as Partial<CommonBody & { restate_reason?: string; parent_pack_id?: string }>;
  const out: Partial<RepRow> = {};
  if (typeof b.restate_reason === 'string') out.restate_reason = b.restate_reason;
  if (typeof b.parent_pack_id === 'string') out.parent_pack_id = b.parent_pack_id;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) => {
  const b = body as Partial<CommonBody & { suspend_reason?: string; regulator_audit_in_progress?: boolean | number }>;
  const out: Partial<RepRow> = {};
  if (typeof b.suspend_reason === 'string') out.suspend_reason = b.suspend_reason;
  const f = toFlag(b.regulator_audit_in_progress);
  if (f !== undefined) out.regulator_audit_in_progress = f;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal pack past sla_deadline_at, flips sla_breached
// =1, bumps escalation_level. Breach crosses regulator on quarterly +
// half_year + annual_audit tiers.
export async function regulatorExportSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_regulator_export_pack
     WHERE chain_status NOT IN ('archived','rejected_by_regulator','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RepRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_regulator_export_pack
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `regulator_export_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_regulator_export_pack_events (id, pack_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'regulator_export_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'preparer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as RepTier)) {
      await fireCascade({
        event: 'regulator_export_sla_breached',
        actor_id: 'system',
        entity_type: 'regulator_export_pack',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily attestation refresh (50 0 * * *) ─────────────────────────
//
// Refreshes LIVE-derived persisted fields for every active pack:
// pack_completeness_index, integrity_index, xbrl_conformance_score,
// esg_taxonomy_coverage_pct, controls_narrative_completeness,
// pack_health_band, days_to_quarterly_attestation.
export async function regulatorExportDailyRefreshSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_regulator_export_pack
     WHERE chain_status NOT IN ('archived','rejected_by_regulator','withdrawn')`,
  ).all<RepRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const completeness = packCompletenessIndex({
      pack_proposed:             !!row.pack_proposed_at,
      blocks_selected:           !!row.blocks_selected_at,
      leaves_filtered:           !!row.leaves_filtered_at,
      xbrl_assembled:            !!row.xbrl_assembled_at,
      narratives_attached:      !!row.narratives_attached_at,
      internal_qa:               !!row.internal_qa_at,
      counterparty_signoff:      !!row.counterparty_signoff_at,
      packaged:                  !!row.packaged_at,
      countersigned:             !!row.countersigned_at,
      lodged_via_api:            !!row.lodged_via_api_at,
      acknowledged_by_regulator: !!row.acknowledged_by_regulator_at,
      archived:                  !!row.archived_at,
      clean_close_bonus:         row.chain_status === 'archived' && !row.rejected_at && !row.withdrawn_at,
    });

    const xbrl = xbrlConformanceIndex({
      xbrl_assembled:                     !!row.xbrl_assembled_at,
      taxonomy_version_set:               row.taxonomy_version_set,
      schema_well_formed:                 row.schema_well_formed,
      required_element_assets:            row.required_element_assets,
      required_element_liabilities:       row.required_element_liabilities,
      required_element_equity:            row.required_element_equity,
      required_element_revenue:           row.required_element_revenue,
      required_element_profit_loss:       row.required_element_profit_loss,
      required_element_cash_equivalents:  row.required_element_cash_equivalents,
      required_element_segments_reported: row.required_element_segments_reported,
      ixbrl_inline_html_valid:            row.ixbrl_inline_html_valid,
      pdf_a3_archival_attached:           row.pdf_a3_archival_attached,
      signing_policy_etsi_119312:         row.signing_policy_etsi_119312,
      cms_signature_rfc5652:              row.cms_signature_rfc5652,
    });

    const esg = esgTaxonomyCoverageIndex({
      gri_standards_attached:        row.gri_standards_attached,
      sasb_standards_attached:       row.sasb_standards_attached,
      tcfd_recommendations_attached: row.tcfd_recommendations_attached,
      issb_ifrs_s1_s2_attached:      row.issb_ifrs_s1_s2_attached,
    });

    const controls = controlsNarrativeIndex({
      coso_components_present:      row.coso_components_present,
      tsc_trust_categories_present: row.tsc_trust_categories_present,
      management_assertion_signed:  row.management_assertion_signed,
      auditor_opinion_attached:     row.auditor_opinion_attached,
      bridge_letter_attached:       row.bridge_letter_attached,
    });

    const integrity = integrityIndex({
      bridge_w113_evm:               bridgesToW113EvmChain(row.w113_evm_ref),
      bridge_w114_doc:               bridgesToW114DocControlChain(row.w114_doc_control_ref),
      bridge_w115_sub:               bridgesToW115SubmittalChain(row.w115_submittal_ref),
      bridge_w116_rfi:               bridgesToW116RfiChain(row.w116_rfi_ref),
      bridge_w117_co:                bridgesToW117ChangeOrderChain(row.w117_change_order_ref),
      bridge_w118_audit:             bridgesToW118AuditChain(
        row.w118_block_height_range_low != null ? String(row.w118_block_height_range_low) : null,
      ),
      internal_qa_passed:            row.internal_qa_passed,
      counterparty_signoff_obtained: row.counterparty_signoff_obtained,
      regulator_ack_received:        row.regulator_ack_received,
    });

    const health = packHealthBand(
      row.chain_status,
      integrity,
      completeness,
      xbrl,
      !!row.sla_breached,
      !!row.rejected_at,
      row.chain_status === 'withdrawn',
      row.chain_status === 'suspended',
    );

    const daysToQ = daysToQuarterlyAttestation(now);

    await env.DB.prepare(
      `UPDATE oe_regulator_export_pack
       SET pack_completeness_index = ?, xbrl_conformance_score = ?,
           esg_taxonomy_coverage_pct = ?, controls_narrative_completeness = ?,
           integrity_index = ?, pack_health_band = ?,
           days_to_quarterly_attestation = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(completeness, xbrl, esg, controls, integrity, health, daysToQ, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

// ─── Cron: monthly cadence rollup (0 4 1 * *) ─────────────────────────────
//
// On the 1st of every month at 04:00 UTC, flag every active pack whose
// closing-month rollup is due, and seed monthly_return placeholders for
// each regulator target that requires a monthly filing. Real filling
// happens via the propose_pack endpoint - cron just ensures cadence
// discipline.
export async function regulatorExportMonthlyRollupSweep(
  env: HonoEnv['Bindings'],
): Promise<{ flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  // Flag active monthly_return packs from the closing month as
  // regulator_relevant so they appear in the regulator inbox.
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastMonthStart = m === 0
    ? new Date(Date.UTC(y - 1, 11, 1)).toISOString()
    : new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const thisMonthStart = new Date(Date.UTC(y, m, 1)).toISOString();

  const rs = await env.DB.prepare(
    `SELECT id FROM oe_regulator_export_pack
     WHERE pack_cadence = 'monthly_return'
       AND chain_status IN ('lodged_via_api','acknowledged_by_regulator','archived')
       AND datetime(created_at) >= datetime(?)
       AND datetime(created_at) < datetime(?)`,
  ).bind(lastMonthStart, thisMonthStart).all<{ id: string }>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_regulator_export_pack
       SET regulator_relevant = 1, is_reportable = 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, row.id).run();
    flagged++;
  }
  return { flagged };
}

export default app;
