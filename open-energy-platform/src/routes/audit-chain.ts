// ═══════════════════════════════════════════════════════════════════════════
// Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger.
//
// FIRST Phase-B wave - opens the L5 regulator-grade hardening series.
// W118 is the platform-wide tamper-evident cross-chain audit tree -
// NOT another IPP chain. Cryptographic spine that ACTIVATES the
// hash_chain_position + merkle_root_segment pre-stages embedded in
// W113 EVM / W114 Document Control / W115 Submittals / W116 RFIs /
// W117 Change Orders LIVE batteries.
//
// Sister of cascade.ts. Mounted at /api/audit-chain (NOT /api/ipp).
//
// Write {admin} ONLY (audit chain admin-write to prevent privilege
// creep). READ all 9 personas. PUBLIC /verify/:block_height endpoint
// requires NO auth (third-party Merkle-proof verification).
//
// 16 actions: propose_block / collect_segments / build_merkle /
//   verify_integrity / sign_block / anchor_block / publish_block /
//   open_independent_verify / reconcile / archive / reject / suspend /
//   resume / restate / fork / emergency_seal.
//
// SIGNATURE Phase-B crossings:
//   emergency_seal -> EVERY tier (W118 SIGNATURE
//     SIGNATURE-CHAIN-BREAK-SEAL hard line)
//   reject -> EVERY tier when signature_chain_break_detected ||
//     hash_collision_suspected
//   restate -> monthly + quarterly only
//   sla_breached -> monthly + quarterly only
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
  blockCompletenessIndex,
  integrityIndex,
  hashCollisionRiskScore,
  independentVerifierQuorumMet,
  buildMerkleRoot,
  buildMerkleProof,
  verifyMerkleProof,
  blockSelfHash,
  verifyChainLink,
  type AcbStatus,
  type AcbAction,
  type AcbTier,
  type AcbCadence,
} from '../utils/audit-chain-block-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W118 = admin-write ONLY (audit-chain integrity gate).
const WRITE_ROLES = new Set(['admin']);

interface AcbRow {
  id: string;
  block_height: number;
  block_number: string;
  block_cadence: AcbCadence;

  w113_evm_ref: string | null;
  w114_doc_control_ref: string | null;
  w115_submittal_ref: string | null;
  w116_rfi_ref: string | null;
  w117_change_order_ref: string | null;

  signature_chain_break_detected: number;
  hash_collision_suspected: number;
  regulator_audit_active: number;
  cross_border_witness_required: number;
  sox_404_attestation_pending: number;

  source_chain_count: number;
  segment_count: number;
  merkle_root: string | null;
  parent_block_hash: string | null;
  block_self_hash: string | null;
  signing_pubkey_fingerprint: string | null;
  signature_bytes: string | null;
  anchor_method: string | null;
  anchor_uri: string | null;

  independent_verifier_count: number;
  independent_verifier_quorum_met: number;

  reconciliation_status_w113_evm: number;
  reconciliation_status_w114_doc: number;
  reconciliation_status_w115_sub: number;
  reconciliation_status_w116_rfi: number;
  reconciliation_status_w117_co: number;
  cross_chain_break_count: number;

  current_tier: AcbTier;
  authority_required: string | null;
  urgency_band: string | null;
  block_health_band: string | null;
  block_completeness_index: number;
  integrity_index: number;
  hash_collision_risk_score: number;
  block_age_hours: number;
  regulator_export_window_hours: number;
  days_to_quarterly_attestation: number;

  title: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  suspend_reason: string | null;
  restate_reason: string | null;
  fork_reason: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: AcbStatus;
  block_proposed_at: string | null;
  segments_collected_at: string | null;
  merkle_built_at: string | null;
  integrity_verified_at: string | null;
  block_signed_at: string | null;
  anchored_at: string | null;
  published_at: string | null;
  independently_verifiable_at: string | null;
  reconciled_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  suspended_at: string | null;
  restated_at: string | null;
  forked_at: string | null;

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

interface AcbEventRow {
  id: string;
  block_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

// Map status -> primary timestamp column.
const TIMESTAMP_COLUMN: Record<AcbStatus, keyof AcbRow | null> = {
  block_proposed:           'block_proposed_at',
  segments_collected:       'segments_collected_at',
  merkle_built:             'merkle_built_at',
  integrity_verified:       'integrity_verified_at',
  block_signed:             'block_signed_at',
  anchored:                 'anchored_at',
  published:                'published_at',
  independently_verifiable: 'independently_verifiable_at',
  reconciled:               'reconciled_at',
  archived:                 'archived_at',
  rejected:                 'rejected_at',
  suspended:                'suspended_at',
  restated:                 'restated_at',
  forked:                   'forked_at',
};

function statusEnteredAt(row: AcbRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.block_proposed_at ? new Date(row.block_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.block_proposed_at ? new Date(row.block_proposed_at) : null);
}

// Block health band - green/amber/red/critical from integrity +
// reconciliation + emergency_seal + SLA.
function blockHealthBand(
  status: AcbStatus,
  integrity: number,
  completeness: number,
  slaBreached: boolean,
  crossChainBreakCount: number,
  rejected: boolean,
  forked: boolean,
  suspended: boolean,
): 'green' | 'amber' | 'red' | 'critical' {
  if (rejected) return 'critical';
  if (forked) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (crossChainBreakCount > 0) return 'red';
  if (suspended) return 'amber';
  if (integrity < 60) return 'red';
  if (integrity < 100) return 'amber';
  if (completeness < 30) return 'amber';
  if (completeness < 80) return 'amber';
  return 'green';
}

function decorate(row: AcbRow, now: Date) {
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

  const floorFlags = countFloorFlags({
    signature_chain_break_detected: row.signature_chain_break_detected,
    hash_collision_suspected:       row.hash_collision_suspected,
    regulator_audit_active:         row.regulator_audit_active,
    cross_border_witness_required:  row.cross_border_witness_required,
    sox_404_attestation_pending:    row.sox_404_attestation_pending,
  });

  const completenessLive = blockCompletenessIndex({
    block_proposed:           !!row.block_proposed_at,
    segments_collected:       !!row.segments_collected_at,
    merkle_built:             !!row.merkle_built_at,
    integrity_verified:       !!row.integrity_verified_at,
    block_signed:             !!row.block_signed_at,
    anchored:                 !!row.anchored_at,
    published:                !!row.published_at,
    independently_verifiable: !!row.independently_verifiable_at,
    reconciled:               !!row.reconciled_at,
    archived:                 !!row.archived_at,
    clean_close_bonus:        status === 'archived' && !row.rejected_at && !row.forked_at,
  });

  const integrityLive = integrityIndex({
    reconciliation_status_w113_evm: row.reconciliation_status_w113_evm,
    reconciliation_status_w114_doc: row.reconciliation_status_w114_doc,
    reconciliation_status_w115_sub: row.reconciliation_status_w115_sub,
    reconciliation_status_w116_rfi: row.reconciliation_status_w116_rfi,
    reconciliation_status_w117_co:  row.reconciliation_status_w117_co,
    cross_chain_break_count:        row.cross_chain_break_count,
  });

  const collisionRisk = hashCollisionRiskScore(row.segment_count);
  const quorumMet = independentVerifierQuorumMet(row.independent_verifier_count);

  const proposedAt = row.block_proposed_at ? new Date(row.block_proposed_at) : null;
  const ageHours = proposedAt
    ? Math.floor((now.getTime() - proposedAt.getTime()) / (3600 * 1000))
    : 0;

  const healthBand = row.block_health_band
    ? row.block_health_band
    : blockHealthBand(
        status,
        integrityLive,
        completenessLive,
        minutesUntilSla != null && minutesUntilSla < 0,
        row.cross_chain_break_count,
        !!row.rejected_at,
        status === 'forked',
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
    block_completeness_index_live: completenessLive,
    integrity_index_live: integrityLive,
    hash_collision_risk_score_live: collisionRisk,
    independent_verifier_quorum_met_live: quorumMet,
    block_health_band_live: healthBand,
    block_age_hours_live: ageHours,
    bridges_to_w113_evm_chain_live: bridgesToW113EvmChain(row.w113_evm_ref),
    bridges_to_w114_doc_control_chain_live: bridgesToW114DocControlChain(row.w114_doc_control_ref),
    bridges_to_w115_submittal_chain_live: bridgesToW115SubmittalChain(row.w115_submittal_ref),
    bridges_to_w116_rfi_chain_live: bridgesToW116RfiChain(row.w116_rfi_ref),
    bridges_to_w117_change_order_chain_live: bridgesToW117ChangeOrderChain(row.w117_change_order_ref),
  };
}

const app = new Hono<HonoEnv>();

// PUBLIC verify endpoint must be mounted BEFORE auth middleware. We
// split the app: public sub-app for /verify/* and inspect, main app
// uses auth.
const publicApp = new Hono<HonoEnv>();

// ─── PUBLIC Merkle-proof verify endpoint (NO AUTH) ──────────────────────
//
// Third-party verifier hits GET /api/audit-chain/verify/:block_height
// to retrieve the signed Merkle root + signature + anchor URI for a
// block. Combined with a leaf hash + proof path they can independently
// confirm a row's inclusion - SOC 2 CC7.2 / RFC 6962 / Certificate
// Transparency style.
publicApp.get('/verify/:block_height', async (c) => {
  const height = Number(c.req.param('block_height'));
  if (!Number.isFinite(height) || height < 0) {
    return c.json({ success: false, error: 'Invalid block_height' }, 400);
  }
  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_audit_chain_block WHERE block_height = ? LIMIT 1',
  ).bind(height).first<AcbRow>();
  if (!row) return c.json({ success: false, error: 'Block not found' }, 404);

  // Only published / independently_verifiable / reconciled / archived
  // blocks are externally verifiable - earlier states are still in
  // construction.
  const verifiableStates: AcbStatus[] = [
    'published', 'independently_verifiable', 'reconciled', 'archived',
    'restated', 'forked',
  ];
  const externally_verifiable = verifiableStates.includes(row.chain_status);

  return c.json({
    success: true,
    data: {
      block_height: row.block_height,
      block_number: row.block_number,
      block_cadence: row.block_cadence,
      chain_status: row.chain_status,
      externally_verifiable,
      merkle_root: row.merkle_root,
      parent_block_hash: row.parent_block_hash,
      block_self_hash: row.block_self_hash,
      signing_pubkey_fingerprint: row.signing_pubkey_fingerprint,
      signature_bytes: row.signature_bytes,
      anchor_method: row.anchor_method,
      anchor_uri: row.anchor_uri,
      segment_count: row.segment_count,
      source_chain_count: row.source_chain_count,
      independent_verifier_count: row.independent_verifier_count,
      independent_verifier_quorum_met: !!row.independent_verifier_quorum_met,
      reconciliation_status: {
        w113_evm: !!row.reconciliation_status_w113_evm,
        w114_doc: !!row.reconciliation_status_w114_doc,
        w115_sub: !!row.reconciliation_status_w115_sub,
        w116_rfi: !!row.reconciliation_status_w116_rfi,
        w117_co:  !!row.reconciliation_status_w117_co,
      },
      cross_chain_break_count: row.cross_chain_break_count,
      published_at: row.published_at,
      archived_at: row.archived_at,
      regulator_ref: row.regulator_ref,
    },
  });
});

// PUBLIC POST /verify-proof - replay a Merkle proof for a leaf.
// Body: { leaf, path: [{sibling, position}], expected_root }
publicApp.post('/verify-proof', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    leaf?: string;
    path?: { sibling?: string; position?: 'left' | 'right' }[];
    expected_root?: string;
  };
  const leaf = typeof body.leaf === 'string' ? body.leaf : '';
  const expectedRoot = typeof body.expected_root === 'string' ? body.expected_root : '';
  const path = Array.isArray(body.path)
    ? body.path
        .filter((p): p is { sibling: string; position: 'left' | 'right' } =>
          typeof p?.sibling === 'string' && (p?.position === 'left' || p?.position === 'right'),
        )
        .map((p) => ({ sibling: p.sibling, position: p.position }))
    : [];
  if (!leaf || !expectedRoot) {
    return c.json({ success: false, error: 'leaf + expected_root required' }, 400);
  }
  const ok = await verifyMerkleProof(leaf, path, expectedRoot);
  return c.json({ success: true, data: { verified: ok, leaf, expected_root: expectedRoot, path_depth: path.length } });
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
  const health     = c.req.query('block_health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_audit_chain_block WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)    { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)  { sql += ' AND chain_status = ?'; binds.push(status); }
  if (cadence) { sql += ' AND block_cadence = ?'; binds.push(cadence); }
  if (health)  { sql += ' AND block_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY block_height DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<AcbRow>();
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
    by_cadence[i.block_cadence] = (by_cadence[i.block_cadence] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.block_health_band_live] = (by_health[i.block_health_band_live] || 0) + 1;
  }

  const active_count          = items.filter((i) => !i.is_terminal).length;
  const proposed_count        = items.filter((i) => i.chain_status === 'block_proposed').length;
  const collected_count       = items.filter((i) => i.chain_status === 'segments_collected').length;
  const merkle_count          = items.filter((i) => i.chain_status === 'merkle_built').length;
  const verified_count        = items.filter((i) => i.chain_status === 'integrity_verified').length;
  const signed_count          = items.filter((i) => i.chain_status === 'block_signed').length;
  const anchored_count        = items.filter((i) => i.chain_status === 'anchored').length;
  const published_count       = items.filter((i) => i.chain_status === 'published').length;
  const ind_verifiable_count  = items.filter((i) => i.chain_status === 'independently_verifiable').length;
  const reconciled_count      = items.filter((i) => i.chain_status === 'reconciled').length;
  const archived_count        = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count        = items.filter((i) => i.chain_status === 'rejected').length;
  const suspended_count       = items.filter((i) => i.chain_status === 'suspended').length;
  const restated_count        = items.filter((i) => i.chain_status === 'restated').length;
  const forked_count          = items.filter((i) => i.chain_status === 'forked').length;
  const quarterly_count       = items.filter((i) => i.current_tier === 'quarterly').length;
  const monthly_count         = items.filter((i) => i.current_tier === 'monthly').length;
  const breached_count        = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const sig_break_count       = items.filter((i) => i.signature_chain_break_detected).length;
  const hash_collision_count  = items.filter((i) => i.hash_collision_suspected).length;
  const reg_audit_active      = items.filter((i) => i.regulator_audit_active).length;
  const cross_border_count    = items.filter((i) => i.cross_border_witness_required).length;
  const sox_pending_count     = items.filter((i) => i.sox_404_attestation_pending).length;
  const emergency_seal_count  = items.filter((i) => i.chain_status === 'forked' && (i.signature_chain_break_detected || i.hash_collision_suspected)).length;
  const w113_bridged          = items.filter((i) => i.bridges_to_w113_evm_chain_live).length;
  const w114_bridged          = items.filter((i) => i.bridges_to_w114_doc_control_chain_live).length;
  const w115_bridged          = items.filter((i) => i.bridges_to_w115_submittal_chain_live).length;
  const w116_bridged          = items.filter((i) => i.bridges_to_w116_rfi_chain_live).length;
  const w117_bridged          = items.filter((i) => i.bridges_to_w117_change_order_chain_live).length;
  const completeness_avg      = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.block_completeness_index_live || 0), 0) / items.length)
    : 0;
  const integrity_avg         = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.integrity_index_live || 0), 0) / items.length)
    : 0;
  const segment_count_total   = items.reduce((s, i) => s + (i.segment_count || 0), 0);
  const cross_chain_break_total = items.reduce((s, i) => s + (i.cross_chain_break_count || 0), 0);
  const max_block_height      = items.length > 0
    ? Math.max(...items.map((i) => i.block_height))
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
      collected_count,
      merkle_count,
      verified_count,
      signed_count,
      anchored_count,
      published_count,
      ind_verifiable_count,
      reconciled_count,
      archived_count,
      rejected_count,
      suspended_count,
      restated_count,
      forked_count,
      quarterly_count,
      monthly_count,
      breached: breached_count,
      reportable_total,
      signature_chain_break_count: sig_break_count,
      hash_collision_suspected_count: hash_collision_count,
      regulator_audit_active_count: reg_audit_active,
      cross_border_witness_count: cross_border_count,
      sox_404_pending_count: sox_pending_count,
      emergency_seal_count,
      w113_bridged_count: w113_bridged,
      w114_bridged_count: w114_bridged,
      w115_bridged_count: w115_bridged,
      w116_bridged_count: w116_bridged,
      w117_bridged_count: w117_bridged,
      completeness_avg,
      integrity_avg,
      segment_count_total,
      cross_chain_break_total,
      max_block_height,
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
    `SELECT chain_status, current_tier, block_health_band, block_cadence, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_audit_chain_block GROUP BY chain_status, current_tier, block_health_band, block_cadence, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; block_health_band: string | null;
    block_cadence: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
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
    if (r.block_health_band) by_health[r.block_health_band] = (by_health[r.block_health_band] || 0) + r.n;
    if (r.block_cadence) by_cadence[r.block_cadence] = (by_cadence[r.block_cadence] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_health, by_cadence, by_regulator_relevant, by_sla_breached } });
});

// ─── Get one ─────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_audit_chain_block WHERE id = ?').bind(id).first<AcbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_audit_chain_block_events WHERE block_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<AcbEventRow>();

  return c.json({
    success: true,
    data: {
      block: decorate(row, new Date()),
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
  block_cadence?: AcbCadence;
  w113_evm_ref?: string;
  w114_doc_control_ref?: string;
  w115_submittal_ref?: string;
  w116_rfi_ref?: string;
  w117_change_order_ref?: string;
  signature_chain_break_detected?: boolean | number;
  hash_collision_suspected?: boolean | number;
  regulator_audit_active?: boolean | number;
  cross_border_witness_required?: boolean | number;
  sox_404_attestation_pending?: boolean | number;
  source_chain_count?: number;
  segment_count?: number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface CollectSegmentsBody extends CommonBody {
  source_chain_count?: number;
  segment_count?: number;
  w113_evm_ref?: string;
  w114_doc_control_ref?: string;
  w115_submittal_ref?: string;
  w116_rfi_ref?: string;
  w117_change_order_ref?: string;
}

interface BuildMerkleBody extends CommonBody {
  merkle_root?: string;
  segment_count?: number;
}

interface VerifyIntegrityBody extends CommonBody {
  reconciliation_status_w113_evm?: boolean | number;
  reconciliation_status_w114_doc?: boolean | number;
  reconciliation_status_w115_sub?: boolean | number;
  reconciliation_status_w116_rfi?: boolean | number;
  reconciliation_status_w117_co?: boolean | number;
  cross_chain_break_count?: number;
}

interface SignBlockBody extends CommonBody {
  signing_pubkey_fingerprint?: string;
  signature_bytes?: string;
  parent_block_hash?: string;
}

interface AnchorBlockBody extends CommonBody {
  anchor_method?: string;
  anchor_uri?: string;
}

interface PublishBlockBody extends CommonBody {
  // no extras
}

interface OpenIndependentVerifyBody extends CommonBody {
  independent_verifier_count?: number;
}

interface ReconcileBody extends CommonBody {
  cross_chain_break_count?: number;
}

interface ArchiveBody extends CommonBody {
  // no extras
}

interface RejectBody extends CommonBody {
  reject_reason?: string;
}

interface SuspendBody extends CommonBody {
  suspend_reason?: string;
}

interface ResumeBody extends CommonBody {
  // no extras
}

interface RestateBody extends CommonBody {
  restate_reason?: string;
}

interface ForkBody extends CommonBody {
  fork_reason?: string;
}

interface EmergencySealBody extends CommonBody {
  fork_reason?: string;
  signature_chain_break_detected?: boolean | number;
  hash_collision_suspected?: boolean | number;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<AcbRow>): Partial<AcbRow> {
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

// ─── Create endpoint (propose_block) ──────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `acb-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  // Next block height = max+1.
  const maxRs = await c.env.DB.prepare(
    'SELECT MAX(block_height) AS max_h FROM oe_audit_chain_block',
  ).first<{ max_h: number | null }>();
  const nextHeight = (maxRs?.max_h ?? 0) + 1;
  const blockNum = `ACB-${new Date().getUTCFullYear()}-${String(nextHeight).padStart(4, '0')}`;
  const cadence: AcbCadence = (body.block_cadence as AcbCadence | undefined) ?? 'daily';

  const flags = {
    signature_chain_break_detected: toFlag(body.signature_chain_break_detected) ?? 0,
    hash_collision_suspected:       toFlag(body.hash_collision_suspected) ?? 0,
    regulator_audit_active:         toFlag(body.regulator_audit_active) ?? 0,
    cross_border_witness_required:  toFlag(body.cross_border_witness_required) ?? 0,
    sox_404_attestation_pending:    toFlag(body.sox_404_attestation_pending) ?? 0,
  };
  const rawTier = tierForCadence(cadence);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('block_proposed', tier, now);
  const slaHrs = slaWindowHours('block_proposed', tier);
  const regExportWindow = regulatorExportWindowHours(tier);
  const daysToQ = daysToQuarterlyAttestation(now);
  const sourceChainCount = Number(body.source_chain_count ?? 0);
  const segCount = Number(body.segment_count ?? 0);

  await c.env.DB.prepare(
    `INSERT INTO oe_audit_chain_block (
      id, block_height, block_number, block_cadence,
      w113_evm_ref, w114_doc_control_ref, w115_submittal_ref,
      w116_rfi_ref, w117_change_order_ref,
      signature_chain_break_detected, hash_collision_suspected,
      regulator_audit_active, cross_border_witness_required,
      sox_404_attestation_pending,
      source_chain_count, segment_count,
      independent_verifier_count, independent_verifier_quorum_met,
      reconciliation_status_w113_evm, reconciliation_status_w114_doc,
      reconciliation_status_w115_sub, reconciliation_status_w116_rfi,
      reconciliation_status_w117_co, cross_chain_break_count,
      current_tier, authority_required, urgency_band,
      block_completeness_index, integrity_index, hash_collision_risk_score,
      block_age_hours, regulator_export_window_hours,
      days_to_quarterly_attestation,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, block_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, nextHeight, blockNum, cadence,
    body.w113_evm_ref ?? null, body.w114_doc_control_ref ?? null, body.w115_submittal_ref ?? null,
    body.w116_rfi_ref ?? null, body.w117_change_order_ref ?? null,
    flags.signature_chain_break_detected, flags.hash_collision_suspected,
    flags.regulator_audit_active, flags.cross_border_witness_required,
    flags.sox_404_attestation_pending,
    sourceChainCount, segCount,
    0, 0,
    0, 0, 0, 0, 0, 0,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    5, 0, hashCollisionRiskScore(segCount),
    0, regExportWindow,
    daysToQ,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'block_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `audit_chain_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_audit_chain_block_events (id, block_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'audit_chain_block_proposed',
    null, 'block_proposed',
    user.id, partyForAction('propose_block'),
    null, JSON.stringify({ tier, block_height: nextHeight, cadence }), nowIso,
  ).run();

  await fireCascade({
    event: 'audit_chain_block_proposed',
    actor_id: user.id,
    entity_type: 'audit_chain_block',
    entity_id: id,
    data: {
      tier, block_height: nextHeight, block_cadence: cadence,
      chain_status: 'block_proposed',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_audit_chain_block WHERE id = ?').bind(id).first<AcbRow>();
  return c.json({ success: true, data: { block: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: AcbAction,
  bodyHandler?: (row: AcbRow, body: Record<string, unknown>) => Partial<AcbRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_audit_chain_block WHERE id = ?').bind(id).first<AcbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from cadence + 5 floor flags.
  const cadence = (overrides.block_cadence as AcbCadence | undefined) ?? row.block_cadence;
  const rawTier = tierForCadence(cadence);
  const floorFlags = {
    signature_chain_break_detected:
      (overrides.signature_chain_break_detected as number | undefined) ?? row.signature_chain_break_detected,
    hash_collision_suspected:
      (overrides.hash_collision_suspected as number | undefined) ?? row.hash_collision_suspected,
    regulator_audit_active:
      (overrides.regulator_audit_active as number | undefined) ?? row.regulator_audit_active,
    cross_border_witness_required:
      (overrides.cross_border_witness_required as number | undefined) ?? row.cross_border_witness_required,
    sox_404_attestation_pending:
      (overrides.sox_404_attestation_pending as number | undefined) ?? row.sox_404_attestation_pending,
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

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof AcbRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = blockCompletenessIndex({
    block_proposed:           willSetTs('block_proposed_at'),
    segments_collected:       willSetTs('segments_collected_at'),
    merkle_built:             willSetTs('merkle_built_at'),
    integrity_verified:       willSetTs('integrity_verified_at'),
    block_signed:             willSetTs('block_signed_at'),
    anchored:                 willSetTs('anchored_at'),
    published:                willSetTs('published_at'),
    independently_verifiable: willSetTs('independently_verifiable_at'),
    reconciled:               willSetTs('reconciled_at'),
    archived:                 willSetTs('archived_at'),
    clean_close_bonus:        to === 'archived' && !row.rejected_at && !row.forked_at,
  });
  overrides.block_completeness_index = completeness;

  // Re-derive integrity index from latest reconciliation flags.
  const integrity = integrityIndex({
    reconciliation_status_w113_evm:
      (overrides.reconciliation_status_w113_evm as number | undefined) ?? row.reconciliation_status_w113_evm,
    reconciliation_status_w114_doc:
      (overrides.reconciliation_status_w114_doc as number | undefined) ?? row.reconciliation_status_w114_doc,
    reconciliation_status_w115_sub:
      (overrides.reconciliation_status_w115_sub as number | undefined) ?? row.reconciliation_status_w115_sub,
    reconciliation_status_w116_rfi:
      (overrides.reconciliation_status_w116_rfi as number | undefined) ?? row.reconciliation_status_w116_rfi,
    reconciliation_status_w117_co:
      (overrides.reconciliation_status_w117_co as number | undefined) ?? row.reconciliation_status_w117_co,
    cross_chain_break_count:
      (overrides.cross_chain_break_count as number | undefined) ?? row.cross_chain_break_count,
  });
  overrides.integrity_index = integrity;

  // Re-derive block_health_band.
  const rejectedNow = to === 'rejected' || !!row.rejected_at;
  const forkedNow = to === 'forked';
  const suspendedNow = to === 'suspended';
  overrides.block_health_band = blockHealthBand(
    to,
    integrity,
    completeness,
    !!row.sla_breached,
    Number((overrides.cross_chain_break_count as number | undefined) ?? row.cross_chain_break_count ?? 0),
    rejectedNow,
    forkedNow,
    suspendedNow,
  );

  // SIGNATURE crossings — emergency_seal crosses EVERY tier; reject
  // crosses EVERY tier when chain-break || collision; restate monthly+
  // quarterly only.
  const crosses = crossesIntoRegulator(action, tier, { flags: floorFlags });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Independent-verifier quorum (Byzantine 2-of-3).
  const verifierCount =
    (overrides.independent_verifier_count as number | undefined) ?? row.independent_verifier_count;
  overrides.independent_verifier_quorum_met = independentVerifierQuorumMet(verifierCount) ? 1 : 0;

  // Hash collision risk re-derived from segment_count.
  const segCount = (overrides.segment_count as number | undefined) ?? row.segment_count;
  overrides.hash_collision_risk_score = hashCollisionRiskScore(segCount);

  // On sign_block, compute block_self_hash if signing fields available.
  if (action === 'sign_block') {
    const merkleRoot = (overrides.merkle_root as string | undefined) ?? row.merkle_root ?? '';
    const parentHash =
      (overrides.parent_block_hash as string | undefined) ?? row.parent_block_hash ?? null;
    const sigBytes = (overrides.signature_bytes as string | undefined) ?? row.signature_bytes ?? null;
    if (merkleRoot) {
      const selfHash = await blockSelfHash({
        block_height: row.block_height,
        parent_block_hash: parentHash,
        merkle_root: merkleRoot,
        signature_bytes: sigBytes,
      });
      overrides.block_self_hash = selfHash;
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
    `UPDATE oe_audit_chain_block SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `audit_chain_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_audit_chain_block_events (id, block_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'audit_chain_block',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_audit_chain_block WHERE id = ?').bind(id).first<AcbRow>();
  return c.json({ success: true, data: { block: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/collect-segments', async (c) => transition(c, 'collect_segments', (_row, body) => {
  const b = body as Partial<CollectSegmentsBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.source_chain_count === 'number') out.source_chain_count = b.source_chain_count;
  if (typeof b.segment_count === 'number') out.segment_count = b.segment_count;
  if (typeof b.w113_evm_ref === 'string') out.w113_evm_ref = b.w113_evm_ref;
  if (typeof b.w114_doc_control_ref === 'string') out.w114_doc_control_ref = b.w114_doc_control_ref;
  if (typeof b.w115_submittal_ref === 'string') out.w115_submittal_ref = b.w115_submittal_ref;
  if (typeof b.w116_rfi_ref === 'string') out.w116_rfi_ref = b.w116_rfi_ref;
  if (typeof b.w117_change_order_ref === 'string') out.w117_change_order_ref = b.w117_change_order_ref;
  return applyCommon(b, out);
}));

app.post('/:id/build-merkle', async (c) => transition(c, 'build_merkle', (_row, body) => {
  const b = body as Partial<BuildMerkleBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.merkle_root === 'string') out.merkle_root = b.merkle_root;
  if (typeof b.segment_count === 'number') out.segment_count = b.segment_count;
  return applyCommon(b, out);
}));

app.post('/:id/verify-integrity', async (c) => transition(c, 'verify_integrity', (_row, body) => {
  const b = body as Partial<VerifyIntegrityBody>;
  const out: Partial<AcbRow> = {};
  const f = toFlag(b.reconciliation_status_w113_evm); if (f !== undefined) out.reconciliation_status_w113_evm = f;
  const g = toFlag(b.reconciliation_status_w114_doc); if (g !== undefined) out.reconciliation_status_w114_doc = g;
  const h = toFlag(b.reconciliation_status_w115_sub); if (h !== undefined) out.reconciliation_status_w115_sub = h;
  const i = toFlag(b.reconciliation_status_w116_rfi); if (i !== undefined) out.reconciliation_status_w116_rfi = i;
  const j = toFlag(b.reconciliation_status_w117_co);  if (j !== undefined) out.reconciliation_status_w117_co = j;
  if (typeof b.cross_chain_break_count === 'number') out.cross_chain_break_count = b.cross_chain_break_count;
  return applyCommon(b, out);
}));

app.post('/:id/sign-block', async (c) => transition(c, 'sign_block', (_row, body) => {
  const b = body as Partial<SignBlockBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.signing_pubkey_fingerprint === 'string') out.signing_pubkey_fingerprint = b.signing_pubkey_fingerprint;
  if (typeof b.signature_bytes === 'string') out.signature_bytes = b.signature_bytes;
  if (typeof b.parent_block_hash === 'string') out.parent_block_hash = b.parent_block_hash;
  return applyCommon(b, out);
}));

app.post('/:id/anchor-block', async (c) => transition(c, 'anchor_block', (_row, body) => {
  const b = body as Partial<AnchorBlockBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.anchor_method === 'string') out.anchor_method = b.anchor_method;
  if (typeof b.anchor_uri === 'string') out.anchor_uri = b.anchor_uri;
  return applyCommon(b, out);
}));

app.post('/:id/publish-block', async (c) => transition(c, 'publish_block', (_row, body) =>
  applyCommon(body as Partial<PublishBlockBody>, {}),
));

app.post('/:id/open-independent-verify', async (c) => transition(c, 'open_independent_verify', (_row, body) => {
  const b = body as Partial<OpenIndependentVerifyBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.independent_verifier_count === 'number') out.independent_verifier_count = b.independent_verifier_count;
  return applyCommon(b, out);
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.cross_chain_break_count === 'number') out.cross_chain_break_count = b.cross_chain_break_count;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) => {
  const b = body as Partial<SuspendBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.suspend_reason === 'string') out.suspend_reason = b.suspend_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<ResumeBody>, {}),
));

app.post('/:id/restate', async (c) => transition(c, 'restate', (_row, body) => {
  const b = body as Partial<RestateBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.restate_reason === 'string') out.restate_reason = b.restate_reason;
  return applyCommon(b, out);
}));

app.post('/:id/fork', async (c) => transition(c, 'fork', (_row, body) => {
  const b = body as Partial<ForkBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.fork_reason === 'string') out.fork_reason = b.fork_reason;
  return applyCommon(b, out);
}));

app.post('/:id/emergency-seal', async (c) => transition(c, 'emergency_seal', (_row, body) => {
  const b = body as Partial<EmergencySealBody>;
  const out: Partial<AcbRow> = {};
  if (typeof b.fork_reason === 'string') out.fork_reason = b.fork_reason;
  const f = toFlag(b.signature_chain_break_detected);
  if (f !== undefined) out.signature_chain_break_detected = f;
  const g = toFlag(b.hash_collision_suspected);
  if (g !== undefined) out.hash_collision_suspected = g;
  return applyCommon(b, out);
}));

// ─── GET /:id/merkle-proof?leaf_index=N - generate proof for a leaf ──────
//
// Generates a Merkle proof for the leaf at the given index. The caller
// must provide the original ordered segment hash list - this endpoint
// expects them as comma-separated `segments` query param OR retrieves
// from the events log if present.
app.get('/:id/merkle-proof', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_audit_chain_block WHERE id = ?').bind(id).first<AcbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const leafIndexRaw = c.req.query('leaf_index');
  const leafIndex = Number(leafIndexRaw ?? 0);
  const segmentsRaw = c.req.query('segments') ?? '';
  const segments = segmentsRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

  if (segments.length === 0) {
    return c.json({
      success: false,
      error: 'Provide ?segments=hash1,hash2,... (the ordered leaf hashes) and ?leaf_index=N',
    }, 400);
  }
  if (!Number.isFinite(leafIndex) || leafIndex < 0 || leafIndex >= segments.length) {
    return c.json({ success: false, error: 'leaf_index out of range' }, 400);
  }

  const proof = await buildMerkleProof(segments, leafIndex);
  const root = await buildMerkleRoot(segments);

  return c.json({
    success: true,
    data: {
      block_height: row.block_height,
      block_number: row.block_number,
      leaf: segments[leafIndex],
      leaf_index: leafIndex,
      segment_count: segments.length,
      computed_root: root,
      stored_root: row.merkle_root,
      stored_matches_computed: row.merkle_root === root,
      proof_path: proof.path,
    },
  });
});

// ─── GET /chain/verify-link - verify Bitcoin-style parent_block_hash chain
app.get('/chain/verify-link', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT block_height, parent_block_hash, merkle_root, signature_bytes
     FROM oe_audit_chain_block
     WHERE chain_status IN ('published','independently_verifiable','reconciled','archived','restated','forked')
       AND merkle_root IS NOT NULL
     ORDER BY block_height ASC`,
  ).all<{
    block_height: number;
    parent_block_hash: string | null;
    merkle_root: string;
    signature_bytes: string | null;
  }>();

  const nodes = rs.results || [];
  const result = await verifyChainLink(nodes);
  return c.json({
    success: true,
    data: {
      checked_block_count: nodes.length,
      chain_ok: result.ok,
      break_at_height: result.break_at ?? null,
    },
  });
});

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active block past sla_deadline_at, flips sla_breached=1,
// bumps escalation_level, fires audit_chain_sla_breached. Breach
// crosses regulator on monthly + quarterly tiers.
export async function auditChainSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_audit_chain_block
     WHERE chain_status NOT IN ('archived', 'rejected')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<AcbRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_audit_chain_block
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `audit_chain_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_audit_chain_block_events (id, block_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'audit_chain_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'auditor',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'audit_chain_sla_breached',
        actor_id: 'system',
        entity_type: 'audit_chain_block',
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

// ─── Cron: hourly block proposal (5 * * * *) ──────────────────────────────
//
// Auto-proposes the next hourly block if one has not already been
// proposed for the current UTC hour. Keeps the platform-wide audit
// chain ticking even when no admin manually triggers it.
export async function auditChainHourlyProposeSweep(
  env: HonoEnv['Bindings'],
): Promise<{ proposed: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const hourStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0, 0, 0,
  )).toISOString();

  // Already proposed this hour?
  const existing = await env.DB.prepare(
    `SELECT id FROM oe_audit_chain_block
     WHERE block_cadence = 'hourly'
       AND datetime(block_proposed_at) >= datetime(?)
     LIMIT 1`,
  ).bind(hourStart).first<{ id: string }>();
  if (existing) return { proposed: 0 };

  const maxRs = await env.DB.prepare(
    'SELECT MAX(block_height) AS max_h FROM oe_audit_chain_block',
  ).first<{ max_h: number | null }>();
  const nextHeight = (maxRs?.max_h ?? 0) + 1;
  const blockNum = `ACB-${new Date().getUTCFullYear()}-${String(nextHeight).padStart(4, '0')}`;
  const id = `acb-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const tier: AcbTier = 'hourly';
  const slaHrs = slaWindowHours('block_proposed', tier);
  const sla = slaDeadlineFor('block_proposed', tier, now);
  const regExportWindow = regulatorExportWindowHours(tier);
  const daysToQ = daysToQuarterlyAttestation(now);

  await env.DB.prepare(
    `INSERT INTO oe_audit_chain_block (
      id, block_height, block_number, block_cadence,
      signature_chain_break_detected, hash_collision_suspected,
      regulator_audit_active, cross_border_witness_required,
      sox_404_attestation_pending,
      source_chain_count, segment_count,
      independent_verifier_count, independent_verifier_quorum_met,
      reconciliation_status_w113_evm, reconciliation_status_w114_doc,
      reconciliation_status_w115_sub, reconciliation_status_w116_rfi,
      reconciliation_status_w117_co, cross_chain_break_count,
      current_tier, authority_required, urgency_band,
      block_completeness_index, integrity_index, hash_collision_risk_score,
      block_age_hours, regulator_export_window_hours,
      days_to_quarterly_attestation,
      title,
      is_reportable, regulator_relevant,
      chain_status, block_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'hourly', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, 5, 30, 0, 0, ?, ?, ?, 0, 0, 'block_proposed', ?, ?, ?, 0, 0, 'system', ?, ?)`,
  ).bind(
    id, nextHeight, blockNum,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs),
    regExportWindow, daysToQ,
    'Auto-proposed hourly platform audit block',
    nowIso, slaHrs, sla ? sla.toISOString() : null,
    nowIso, nowIso,
  ).run();

  const evtId = `audit_chain_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await env.DB.prepare(
    'INSERT INTO oe_audit_chain_block_events (id, block_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'audit_chain_block_proposed',
    null, 'block_proposed',
    'system', 'auditor',
    'Auto-proposed by hourly cron', JSON.stringify({ tier, cadence: 'hourly', block_height: nextHeight }), nowIso,
  ).run();

  await fireCascade({
    event: 'audit_chain_block_proposed',
    actor_id: 'system',
    entity_type: 'audit_chain_block',
    entity_id: id,
    data: { tier, block_cadence: 'hourly', block_height: nextHeight, chain_status: 'block_proposed' },
    env,
  });

  return { proposed: 1 };
}

// ─── Cron: daily attestation reconciliation (45 0 * * *) ──────────────────
//
// Refreshes LIVE fields (block_age_hours + integrity_index +
// block_completeness_index + block_health_band + days_to_quarterly_
// attestation) for every active block. Also re-verifies chain link
// continuity and flags any broken parent_block_hash linkage with
// cross_chain_break_count++.
export async function auditChainDailyReconcileSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number; chain_breaks: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_audit_chain_block
     WHERE chain_status NOT IN ('archived', 'rejected')`,
  ).all<AcbRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const proposedAt = row.block_proposed_at ? new Date(row.block_proposed_at) : null;
    const ageHours = proposedAt
      ? Math.floor((now.getTime() - proposedAt.getTime()) / (3600 * 1000))
      : 0;

    const completeness = blockCompletenessIndex({
      block_proposed:           !!row.block_proposed_at,
      segments_collected:       !!row.segments_collected_at,
      merkle_built:             !!row.merkle_built_at,
      integrity_verified:       !!row.integrity_verified_at,
      block_signed:             !!row.block_signed_at,
      anchored:                 !!row.anchored_at,
      published:                !!row.published_at,
      independently_verifiable: !!row.independently_verifiable_at,
      reconciled:               !!row.reconciled_at,
      archived:                 !!row.archived_at,
      clean_close_bonus:        row.chain_status === 'archived' && !row.rejected_at && !row.forked_at,
    });

    const integrity = integrityIndex({
      reconciliation_status_w113_evm: row.reconciliation_status_w113_evm,
      reconciliation_status_w114_doc: row.reconciliation_status_w114_doc,
      reconciliation_status_w115_sub: row.reconciliation_status_w115_sub,
      reconciliation_status_w116_rfi: row.reconciliation_status_w116_rfi,
      reconciliation_status_w117_co:  row.reconciliation_status_w117_co,
      cross_chain_break_count:        row.cross_chain_break_count,
    });

    const health = blockHealthBand(
      row.chain_status,
      integrity,
      completeness,
      !!row.sla_breached,
      row.cross_chain_break_count,
      !!row.rejected_at,
      row.chain_status === 'forked',
      row.chain_status === 'suspended',
    );

    const daysToQ = daysToQuarterlyAttestation(now);
    const collisionRisk = hashCollisionRiskScore(row.segment_count);

    await env.DB.prepare(
      `UPDATE oe_audit_chain_block
       SET block_age_hours = ?, block_completeness_index = ?,
           integrity_index = ?, block_health_band = ?,
           days_to_quarterly_attestation = ?,
           hash_collision_risk_score = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(ageHours, completeness, integrity, health, daysToQ, collisionRisk, nowIso, row.id).run();
    updated++;
  }

  // Verify chain-link continuity for published+ blocks.
  const linkRs = await env.DB.prepare(
    `SELECT block_height, parent_block_hash, merkle_root, signature_bytes
     FROM oe_audit_chain_block
     WHERE chain_status IN ('published','independently_verifiable','reconciled','archived','restated','forked')
       AND merkle_root IS NOT NULL
     ORDER BY block_height ASC`,
  ).all<{
    block_height: number;
    parent_block_hash: string | null;
    merkle_root: string;
    signature_bytes: string | null;
  }>();
  const linkNodes = linkRs.results || [];
  const linkResult = await verifyChainLink(linkNodes);
  let chainBreaks = 0;
  if (!linkResult.ok && typeof linkResult.break_at === 'number') {
    chainBreaks = 1;
    await env.DB.prepare(
      `UPDATE oe_audit_chain_block
       SET cross_chain_break_count = cross_chain_break_count + 1,
           signature_chain_break_detected = 1,
           updated_at = ?
       WHERE block_height = ?`,
    ).bind(nowIso, linkResult.break_at).run();
  }

  return { scanned: rows.length, updated, chain_breaks: chainBreaks };
}

// ─── Cron: quarterly NERSA/IPPO/SARB export (0 3 1 1,4,7,10 *) ────────────
//
// At each quarter start, marks all published+reconciled blocks from
// the closing quarter is_reportable=1 + regulator_relevant=1, and
// fires audit_chain_quarterly_export_ready cascade events. Real
// export bundle gen happens in W119 (next wave).
export async function auditChainQuarterlyExportSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  // Quarter that just closed = current month - 1.
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // Start of current quarter (0,3,6,9).
  const currentQStartMonth = Math.floor(m / 3) * 3;
  const currentQStart = new Date(Date.UTC(y, currentQStartMonth, 1)).toISOString();
  // Closing quarter start (3 months earlier).
  const closingQStartMonth = currentQStartMonth - 3;
  const closingQStart = closingQStartMonth < 0
    ? new Date(Date.UTC(y - 1, closingQStartMonth + 12, 1)).toISOString()
    : new Date(Date.UTC(y, closingQStartMonth, 1)).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_audit_chain_block
     WHERE chain_status IN ('published','independently_verifiable','reconciled','archived')
       AND datetime(block_proposed_at) >= datetime(?)
       AND datetime(block_proposed_at) < datetime(?)`,
  ).bind(closingQStart, currentQStart).all<AcbRow>();

  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_audit_chain_block
       SET is_reportable = 1, regulator_relevant = 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, row.id).run();

    await fireCascade({
      event: 'audit_chain_quarterly_export_ready',
      actor_id: 'system',
      entity_type: 'audit_chain_block',
      entity_id: row.id,
      data: {
        block_height: row.block_height,
        block_number: row.block_number,
        block_cadence: row.block_cadence,
        chain_status: row.chain_status,
        closing_quarter_start: closingQStart,
        current_quarter_start: currentQStart,
      },
      env,
    });
    flagged++;
  }
  return { scanned: rows.length, flagged };
}

export default app;
