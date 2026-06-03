// ═══════════════════════════════════════════════════════════════════════════
// Wave 124 - STRATE / SWIFT Settlement Connector.
//
// PHASE C WAVE 3 OF 5. The MONEY-IN/MONEY-OUT financial settlement
// spine. Where W122 = substation-grade SCADA bridge and W123 = IIoT
// broker fleet (both 'grid' namespace), W124 = real bidirectional
// integration to STRATE (SA CSD), SWIFT MT/MX, SARB SAMOS RTGS, and
// commercial bank EFT/ACH gateways.
//
// Standards: ISO 20022 XML financial messages, SWIFT MT/MX, STRATE
// T+3/T+1, SARB SAMOS RTGS, SADC RTGS, SARB ExCon, FIC Act, Basel III
// LCR/NSFR, ISO 27001, PCI-DSS, SARB BA 700, EMIR EU equivalence,
// CPMI-IOSCO PFMI Principle 9.
//
// 16 actions: propose_connector / validate_bic / complete_bank_handshake
//   / load_iso20022_schemas / establish_messaging_session /
//   validate_test_messages / bind_reconciliation_account /
//   authorize_live_settlement / activate_reconciliation / archive /
//   disconnect / suspend / resume / revoke_credential /
//   activate_failover / settle_cycle.
//
// SIGNATURE Phase-C regulator crossings:
//   revoke_credential -> EVERY tier (W124 SIGNATURE STRATE-SWIFT-
//     CONNECTOR-REVOKE hard line)
//   activate_failover -> samos_rtgs + swift_global
//   disconnect -> EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic
//   authorize_live_settlement -> swift_global
//   settle_cycle -> EVERY tier WHEN sarb_excon_authorization_required
//                   AND excon_authorization_status=expired
//   sla_breached -> samos_rtgs + swift_global
//
// Write {admin, trader, lender, offtaker}. PUBLIC mTLS-gated peer
// endpoint at /api/strate-swift-connector/peer/:peer_id (BEFORE
// authMiddleware) returns a handshake snapshot for trusted bank
// counterparties using `x-mtls-cert-fingerprint` header.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { assertSafeWebhookUrl } from '../utils/url-safety';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  slaWindowHours,
  tierForSettlementValue,
  effectiveTier,
  countFloorFlags,
  floorAtSamosRtgs,
  floorAtSwiftGlobal,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  daysToKeyRenewal,
  bridgesToW120ReconciliationAttestation,
  bridgesToW68CounterpartyMargin,
  bridgesToW3SettlementP6,
  bridgesToW21Drawdown,
  bridgesToW118AuditChain,
  settlementQualityIndex,
  connectorHealthBand,
  isKnownStrateSwiftProtocol,
  isValidBic,
  STRATE_SWIFT_PROTOCOLS,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
  type SscStatus,
  type SscAction,
  type SscTier,
  type StrateSwiftProtocol,
} from '../utils/strate-swift-connector-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W124 = admin + trader + lender + offtaker write (financial personas).
const WRITE_ROLES = new Set(['admin', 'trader', 'lender', 'offtaker']);

type ExconStatus = 'none' | 'pending' | 'authorized' | 'expired';
type FicKycStatus = 'clean' | 'refresh_due' | 'flagged';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface SscRow {
  id: string;
  connector_number: string;
  peer_id: string;
  counterparty_name: string | null;
  bic: string | null;
  protocol: StrateSwiftProtocol | string;
  iso20022_schema_version: string | null;
  swift_user_key_fingerprint: string | null;
  swift_user_key_expiry_at: string | null;
  reconciliation_account_id: string | null;
  endpoint_url: string | null;
  settlement_value_zar_per_cycle: number | null;

  w120_reconciliation_attestation_ref: string | null;
  w68_counterparty_margin_ref: string | null;
  w3_settlement_p6_ref: string | null;
  w21_drawdown_ref: string | null;
  w118_block_ref: string | null;

  cross_border_payment: number;
  sarb_excon_authorization_required: number;
  fic_act_high_risk_jurisdiction: number;
  basel_lcr_tier1_collateral: number;
  cpmi_iosco_pfmi_principle9_systemic: number;

  // Settlement quality components.
  settlement_messages_per_minute: number | null;
  successful_settlement_count_24h: number | null;
  failed_settlement_count_24h: number | null;
  failure_rate_pct: number | null;
  settlement_value_zar_last_24h: number | null;
  average_settlement_latency_ms: number | null;
  reconciliation_break_count: number | null;
  reconciliation_break_zar: number | null;
  lcr_contribution_pct: number | null;
  nsfr_contribution_pct: number | null;
  excon_authorization_status: ExconStatus | null;
  fic_act_kyc_status: FicKycStatus | null;
  protocol_compliant: number;
  iso27001_controls_ok: number;
  pci_dss_segmentation_ok: number;
  settlement_quality_index: number | null;

  current_tier: SscTier;
  authority_required: string | null;
  urgency_band: string | null;
  connector_health_band: string | null;

  title: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  reason_code: string | null;

  chain_status: SscStatus;
  connector_proposed_at: string | null;
  bic_validated_at: string | null;
  bank_handshake_completed_at: string | null;
  iso20022_schemas_loaded_at: string | null;
  messaging_session_established_at: string | null;
  test_messages_validated_at: string | null;
  reconciliation_account_bound_at: string | null;
  live_settlement_active_at: string | null;
  cycle_reconciled_at: string | null;
  archived_at: string | null;
  disconnected_at: string | null;
  suspended_at: string | null;
  credential_revoked_at: string | null;
  failover_activated_at: string | null;
  regulator_crossed_at: string | null;

  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_key_renewal: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SscEventRow {
  id: string;
  connector_id: string;
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

const TIMESTAMP_COLUMN: Record<SscStatus, keyof SscRow | null> = {
  connector_proposed:            'connector_proposed_at',
  bic_validated:                 'bic_validated_at',
  bank_handshake_completed:      'bank_handshake_completed_at',
  iso20022_schemas_loaded:       'iso20022_schemas_loaded_at',
  messaging_session_established: 'messaging_session_established_at',
  test_messages_validated:       'test_messages_validated_at',
  reconciliation_account_bound:  'reconciliation_account_bound_at',
  live_settlement_active:        'live_settlement_active_at',
  cycle_reconciled:              'cycle_reconciled_at',
  archived:                      'archived_at',
  disconnected:                  'disconnected_at',
  suspended:                     'suspended_at',
  failover_active:               'failover_activated_at',
  credential_revoked:            'credential_revoked_at',
};

function statusEnteredAt(row: SscRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.connector_proposed_at ? new Date(row.connector_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.connector_proposed_at ? new Date(row.connector_proposed_at) : null);
}

function rowFloorFlags(row: SscRow) {
  return {
    cross_border_payment:                row.cross_border_payment,
    sarb_excon_authorization_required:   row.sarb_excon_authorization_required,
    fic_act_high_risk_jurisdiction:      row.fic_act_high_risk_jurisdiction,
    basel_lcr_tier1_collateral:          row.basel_lcr_tier1_collateral,
    cpmi_iosco_pfmi_principle9_systemic: row.cpmi_iosco_pfmi_principle9_systemic,
  };
}

function decorate(row: SscRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaHrs = slaHoursRemaining(status, tier, entered, now);
  const flags = rowFloorFlags(row);
  const urgency = urgencyBand(tier, slaHrs, flags);
  const authority = authorityRequired(tier);
  const keyDays = daysToKeyRenewal(row.swift_user_key_expiry_at, now);

  const floorFlags = countFloorFlags(flags);
  const floorSamos = floorAtSamosRtgs(flags);
  const floorSwift = floorAtSwiftGlobal(flags);

  const settlementLive = settlementQualityIndex({
    settlement_messages_per_minute:  row.settlement_messages_per_minute,
    successful_settlement_count_24h: row.successful_settlement_count_24h,
    failed_settlement_count_24h:     row.failed_settlement_count_24h,
    failure_rate_pct:                row.failure_rate_pct,
    average_settlement_latency_ms:   row.average_settlement_latency_ms,
    reconciliation_break_count:      row.reconciliation_break_count,
    lcr_contribution_pct:            row.lcr_contribution_pct,
    nsfr_contribution_pct:           row.nsfr_contribution_pct,
    excon_authorization_status:      row.excon_authorization_status,
    fic_act_kyc_status:              row.fic_act_kyc_status,
    protocol_compliant:              row.protocol_compliant,
    iso27001_controls_ok:            row.iso27001_controls_ok,
    pci_dss_segmentation_ok:         row.pci_dss_segmentation_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = connectorHealthBand(
    status,
    settlementLive,
    !!row.sla_breached || slaBreachedLive,
    keyDays,
    flags,
    row.failure_rate_pct ?? 0,
    row.excon_authorization_status,
  );

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: slaBreachedLive,
    sla_window_hours: slaWindowHours(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    days_to_key_renewal_live: keyDays,
    floor_flag_count_live: floorFlags,
    floor_at_samos_rtgs_live: floorSamos,
    floor_at_swift_global_live: floorSwift,
    settlement_quality_index_live: settlementLive,
    connector_health_band_live: healthLive,
    bridges_to_w120_reconciliation_attestation_live: bridgesToW120ReconciliationAttestation(row.w120_reconciliation_attestation_ref),
    bridges_to_w68_counterparty_margin_live: bridgesToW68CounterpartyMargin(row.w68_counterparty_margin_ref),
    bridges_to_w3_settlement_p6_live: bridgesToW3SettlementP6(row.w3_settlement_p6_ref),
    bridges_to_w21_drawdown_live: bridgesToW21Drawdown(row.w21_drawdown_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// ─── PUBLIC mTLS peer endpoint (NO Bearer auth) ─────────────────────────
//
// GET /api/strate-swift-connector/peer/:peer_id with header
// `x-mtls-cert-fingerprint` (W122/W123/W124 Phase-C consistency).
// Returns a handshake snapshot for the trusted bank counterparty.
const publicApp = new Hono<HonoEnv>();

publicApp.get('/peer/:peer_id', async (c) => {
  const peerId = c.req.param('peer_id');
  const fingerprint =
    c.req.header('x-mtls-cert-fingerprint') ||
    c.req.header('cf-client-cert-sha256') ||
    '';
  if (!isValidMtlsFingerprint(fingerprint)) {
    return c.json({ success: false, error: 'mTLS fingerprint missing or malformed' }, 401);
  }
  if (!isAllowedPeerFingerprint(fingerprint)) {
    return c.json({ success: false, error: 'mTLS fingerprint not in trust list' }, 403);
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_strate_swift_connector WHERE peer_id = ?',
  ).bind(peerId).first<SscRow>();
  if (!row) {
    return c.json({ success: false, error: 'Peer connector not found' }, 404);
  }

  const now = new Date();
  const decorated = decorate(row, now);
  return c.json({
    success: true,
    data: {
      peer_snapshot: {
        peer_id: row.peer_id,
        counterparty_name: row.counterparty_name,
        bic: row.bic,
        protocol: row.protocol,
        iso20022_schema_version: row.iso20022_schema_version,
        endpoint_url: row.endpoint_url,
        chain_status: row.chain_status,
        current_tier: row.current_tier,
        connector_health_band_live: decorated.connector_health_band_live,
        settlement_quality_index_live: decorated.settlement_quality_index_live,
        sla_breached_live: decorated.sla_breached_live,
        excon_authorization_status: row.excon_authorization_status,
        last_seen_at: row.updated_at,
        cert_fingerprint_seen: fingerprint.replace(/[:\s-]/g, '').toLowerCase().slice(0, 16) + '...',
      },
    },
  });
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
  const protocol   = c.req.query('protocol');
  const excon      = c.req.query('excon');
  const health     = c.req.query('health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_strate_swift_connector WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?'; binds.push(status); }
  if (protocol)  { sql += ' AND protocol = ?'; binds.push(protocol); }
  if (excon)     { sql += ' AND excon_authorization_status = ?'; binds.push(excon); }
  if (health)    { sql += ' AND connector_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SscRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_excon: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_protocol[i.protocol as string] = (by_protocol[i.protocol as string] || 0) + 1;
    if (i.excon_authorization_status) by_excon[i.excon_authorization_status as string] = (by_excon[i.excon_authorization_status as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.connector_health_band_live] = (by_health[i.connector_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'connector_proposed').length;
  const bic_validated_count = items.filter((i) => i.chain_status === 'bic_validated').length;
  const handshake_count     = items.filter((i) => i.chain_status === 'bank_handshake_completed').length;
  const schemas_count       = items.filter((i) => i.chain_status === 'iso20022_schemas_loaded').length;
  const session_count       = items.filter((i) => i.chain_status === 'messaging_session_established').length;
  const test_msg_count      = items.filter((i) => i.chain_status === 'test_messages_validated').length;
  const recon_bound_count   = items.filter((i) => i.chain_status === 'reconciliation_account_bound').length;
  const live_count          = items.filter((i) => i.chain_status === 'live_settlement_active').length;
  const reconciled_count    = items.filter((i) => i.chain_status === 'cycle_reconciled').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const disconnected_count  = items.filter((i) => i.chain_status === 'disconnected').length;
  const revoked_count       = items.filter((i) => i.chain_status === 'credential_revoked').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const failover_count      = items.filter((i) => i.chain_status === 'failover_active').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w120_bridged        = items.filter((i) => i.bridges_to_w120_reconciliation_attestation_live).length;
  const w68_bridged         = items.filter((i) => i.bridges_to_w68_counterparty_margin_live).length;
  const w3_bridged          = items.filter((i) => i.bridges_to_w3_settlement_p6_live).length;
  const w21_bridged         = items.filter((i) => i.bridges_to_w21_drawdown_live).length;
  const settlement_avg      = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.settlement_quality_index_live || 0), 0) / items.length)
    : 0;
  const keys_expiring_60d   = items.filter((i) => (i.days_to_key_renewal_live ?? 9999) < 60).length;
  const keys_expiring_14d   = items.filter((i) => (i.days_to_key_renewal_live ?? 9999) < 14).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_protocol,
      by_excon,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      bic_validated_count,
      handshake_count,
      schemas_count,
      session_count,
      test_msg_count,
      recon_bound_count,
      live_count,
      reconciled_count,
      archived_count,
      disconnected_count,
      revoked_count,
      suspended_count,
      failover_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w120_bridged_count: w120_bridged,
      w68_bridged_count: w68_bridged,
      w3_bridged_count: w3_bridged,
      w21_bridged_count: w21_bridged,
      w118_bridged_count: w118_bridged,
      settlement_quality_avg: settlement_avg,
      keys_expiring_within_60d: keys_expiring_60d,
      keys_expiring_within_14d: keys_expiring_14d,
      strate_swift_protocols: STRATE_SWIFT_PROTOCOLS,
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
    `SELECT chain_status, current_tier, connector_health_band, protocol,
            excon_authorization_status, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_strate_swift_connector
     GROUP BY chain_status, current_tier, connector_health_band, protocol,
              excon_authorization_status, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; connector_health_band: string | null;
    protocol: string | null; excon_authorization_status: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_excon: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.connector_health_band) by_health[r.connector_health_band] = (by_health[r.connector_health_band] || 0) + r.n;
    if (r.protocol) by_protocol[r.protocol] = (by_protocol[r.protocol] || 0) + r.n;
    if (r.excon_authorization_status) by_excon[r.excon_authorization_status] = (by_excon[r.excon_authorization_status] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_protocol, by_excon,
      by_regulator_relevant, by_sla_breached,
      strate_swift_protocols: STRATE_SWIFT_PROTOCOLS,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_strate_swift_connector WHERE id = ?').bind(id).first<SscRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_strate_swift_connector_events WHERE connector_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SscEventRow>();

  return c.json({
    success: true,
    data: {
      connector: decorate(row, new Date()),
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
  peer_id?: string;
  counterparty_name?: string;
  bic?: string;
  protocol?: StrateSwiftProtocol;
  iso20022_schema_version?: string;
  swift_user_key_fingerprint?: string;
  swift_user_key_expiry_at?: string;
  reconciliation_account_id?: string;
  endpoint_url?: string;
  settlement_value_zar_per_cycle?: number;

  w120_reconciliation_attestation_ref?: string;
  w68_counterparty_margin_ref?: string;
  w3_settlement_p6_ref?: string;
  w21_drawdown_ref?: string;
  w118_block_ref?: string;

  cross_border_payment?: boolean | number;
  sarb_excon_authorization_required?: boolean | number;
  fic_act_high_risk_jurisdiction?: boolean | number;
  basel_lcr_tier1_collateral?: boolean | number;
  cpmi_iosco_pfmi_principle9_systemic?: boolean | number;

  settlement_messages_per_minute?: number;
  successful_settlement_count_24h?: number;
  failed_settlement_count_24h?: number;
  failure_rate_pct?: number;
  settlement_value_zar_last_24h?: number;
  average_settlement_latency_ms?: number;
  reconciliation_break_count?: number;
  reconciliation_break_zar?: number;
  lcr_contribution_pct?: number;
  nsfr_contribution_pct?: number;
  excon_authorization_status?: ExconStatus;
  fic_act_kyc_status?: FicKycStatus;
  protocol_compliant?: boolean | number;
  iso27001_controls_ok?: boolean | number;
  pci_dss_segmentation_ok?: boolean | number;

  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<SscRow>): Partial<SscRow> {
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  if (typeof b.regulator_inbox_ref === 'string') out.regulator_inbox_ref = b.regulator_inbox_ref;
  if (typeof b.title === 'string')               out.title = b.title;
  return out;
}

// ─── Create endpoint (propose_connector) ──────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;

  if (typeof body.endpoint_url === 'string' && body.endpoint_url.length > 0) {
    try { assertSafeWebhookUrl(body.endpoint_url); } catch (e: any) {
      return c.json({ success: false, error: e?.message || 'invalid endpoint_url' }, 400);
    }
  }

  const id = `ssc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const protocol = isKnownStrateSwiftProtocol(body.protocol)
    ? body.protocol
    : 'eft_ach';

  const flags = {
    cross_border_payment:                toFlag(body.cross_border_payment) ?? 0,
    sarb_excon_authorization_required:   toFlag(body.sarb_excon_authorization_required) ?? 0,
    fic_act_high_risk_jurisdiction:      toFlag(body.fic_act_high_risk_jurisdiction) ?? 0,
    basel_lcr_tier1_collateral:          toFlag(body.basel_lcr_tier1_collateral) ?? 0,
    cpmi_iosco_pfmi_principle9_systemic: toFlag(body.cpmi_iosco_pfmi_principle9_systemic) ?? 0,
  };
  const rawTier = tierForSettlementValue(body.settlement_value_zar_per_cycle);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('connector_proposed', tier, now);
  const slaHrs = slaWindowHours('connector_proposed', tier);
  const keyDays = daysToKeyRenewal(body.swift_user_key_expiry_at ?? null, now);

  // Connector number = SSC-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_strate_swift_connector`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const ccNum = `SSC-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const peerId = body.peer_id ?? `bank-peer-${id.slice(4)}`;
  const bic = body.bic && isValidBic(body.bic) ? body.bic : null;

  // Compute initial settlement score (most fields 0/null on create).
  const settlementInit = settlementQualityIndex({
    excon_authorization_status: body.excon_authorization_status ?? null,
    fic_act_kyc_status:         body.fic_act_kyc_status ?? null,
    protocol_compliant:         toFlag(body.protocol_compliant),
    iso27001_controls_ok:       toFlag(body.iso27001_controls_ok),
    pci_dss_segmentation_ok:    toFlag(body.pci_dss_segmentation_ok),
  });

  const healthInit = connectorHealthBand(
    'connector_proposed',
    settlementInit,
    false,
    keyDays,
    flags,
    body.failure_rate_pct ?? 0,
    body.excon_authorization_status ?? null,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_strate_swift_connector (
      id, connector_number, peer_id, counterparty_name, bic,
      protocol, iso20022_schema_version,
      swift_user_key_fingerprint, swift_user_key_expiry_at,
      reconciliation_account_id, endpoint_url, settlement_value_zar_per_cycle,
      w120_reconciliation_attestation_ref, w68_counterparty_margin_ref,
      w3_settlement_p6_ref, w21_drawdown_ref, w118_block_ref,
      cross_border_payment, sarb_excon_authorization_required,
      fic_act_high_risk_jurisdiction, basel_lcr_tier1_collateral,
      cpmi_iosco_pfmi_principle9_systemic,
      settlement_messages_per_minute, successful_settlement_count_24h,
      failed_settlement_count_24h, failure_rate_pct,
      settlement_value_zar_last_24h, average_settlement_latency_ms,
      reconciliation_break_count, reconciliation_break_zar,
      lcr_contribution_pct, nsfr_contribution_pct,
      excon_authorization_status, fic_act_kyc_status,
      protocol_compliant, iso27001_controls_ok, pci_dss_segmentation_ok,
      settlement_quality_index,
      current_tier, authority_required, urgency_band, connector_health_band,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, connector_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_key_renewal,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ccNum, peerId, body.counterparty_name ?? null, bic,
    protocol, body.iso20022_schema_version ?? null,
    body.swift_user_key_fingerprint ? body.swift_user_key_fingerprint.replace(/[:\s-]/g, '').toLowerCase() : null,
    body.swift_user_key_expiry_at ?? null,
    body.reconciliation_account_id ?? null, body.endpoint_url ?? null,
    body.settlement_value_zar_per_cycle ?? null,
    body.w120_reconciliation_attestation_ref ?? null, body.w68_counterparty_margin_ref ?? null,
    body.w3_settlement_p6_ref ?? null, body.w21_drawdown_ref ?? null,
    body.w118_block_ref ?? null,
    flags.cross_border_payment, flags.sarb_excon_authorization_required,
    flags.fic_act_high_risk_jurisdiction, flags.basel_lcr_tier1_collateral,
    flags.cpmi_iosco_pfmi_principle9_systemic,
    body.settlement_messages_per_minute ?? null, body.successful_settlement_count_24h ?? null,
    body.failed_settlement_count_24h ?? null, body.failure_rate_pct ?? null,
    body.settlement_value_zar_last_24h ?? null, body.average_settlement_latency_ms ?? null,
    body.reconciliation_break_count ?? null, body.reconciliation_break_zar ?? null,
    body.lcr_contribution_pct ?? null, body.nsfr_contribution_pct ?? null,
    body.excon_authorization_status ?? null, body.fic_act_kyc_status ?? null,
    toFlag(body.protocol_compliant) ?? 0, toFlag(body.iso27001_controls_ok) ?? 0,
    toFlag(body.pci_dss_segmentation_ok) ?? 0, settlementInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs, flags), healthInit,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'connector_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    keyDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `strate_swift_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_strate_swift_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'strate_swift_connector_proposed',
    null, 'connector_proposed', null, tier,
    user.id, partyForAction('propose_connector'),
    null, JSON.stringify({ tier, protocol, peer_id: peerId, counterparty_name: body.counterparty_name }), nowIso,
  ).run();

  await fireCascade({
    event: 'strate_swift_connector_proposed',
    actor_id: user.id,
    entity_type: 'strate_swift_connector',
    entity_id: id,
    data: { tier, protocol, peer_id: peerId, chain_status: 'connector_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_strate_swift_connector WHERE id = ?').bind(id).first<SscRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: SscAction,
  bodyHandler?: (row: SscRow, body: Record<string, unknown>) => Partial<SscRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_strate_swift_connector WHERE id = ?').bind(id).first<SscRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  let overrides: Partial<SscRow>;
  try {
    overrides = bodyHandler ? bodyHandler(row, body) : {};
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'invalid request body' }, 400);
  }

  // Re-derive tier from settlement_value + 5 floor flags (every transition).
  const settlementValue =
    (overrides.settlement_value_zar_per_cycle as number | undefined) ?? row.settlement_value_zar_per_cycle;
  const rawTier = tierForSettlementValue(settlementValue);
  const floorFlags = {
    cross_border_payment:
      (overrides.cross_border_payment as number | undefined) ?? row.cross_border_payment,
    sarb_excon_authorization_required:
      (overrides.sarb_excon_authorization_required as number | undefined) ?? row.sarb_excon_authorization_required,
    fic_act_high_risk_jurisdiction:
      (overrides.fic_act_high_risk_jurisdiction as number | undefined) ?? row.fic_act_high_risk_jurisdiction,
    basel_lcr_tier1_collateral:
      (overrides.basel_lcr_tier1_collateral as number | undefined) ?? row.basel_lcr_tier1_collateral,
    cpmi_iosco_pfmi_principle9_systemic:
      (overrides.cpmi_iosco_pfmi_principle9_systemic as number | undefined) ?? row.cpmi_iosco_pfmi_principle9_systemic,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;
  overrides.urgency_band = urgencyBand(tier, slaHrs, floorFlags);

  // Re-derive settlement quality + days_to_key_renewal.
  const keyExpiry = (overrides.swift_user_key_expiry_at as string | undefined) ?? row.swift_user_key_expiry_at;
  const keyDays = daysToKeyRenewal(keyExpiry, now);
  overrides.days_to_key_renewal = keyDays;

  const exconEff =
    (overrides.excon_authorization_status as ExconStatus | undefined) ?? row.excon_authorization_status;
  const ficEff =
    (overrides.fic_act_kyc_status as FicKycStatus | undefined) ?? row.fic_act_kyc_status;

  const settlement = settlementQualityIndex({
    settlement_messages_per_minute:
      (overrides.settlement_messages_per_minute as number | undefined) ?? row.settlement_messages_per_minute,
    successful_settlement_count_24h:
      (overrides.successful_settlement_count_24h as number | undefined) ?? row.successful_settlement_count_24h,
    failed_settlement_count_24h:
      (overrides.failed_settlement_count_24h as number | undefined) ?? row.failed_settlement_count_24h,
    failure_rate_pct:
      (overrides.failure_rate_pct as number | undefined) ?? row.failure_rate_pct,
    average_settlement_latency_ms:
      (overrides.average_settlement_latency_ms as number | undefined) ?? row.average_settlement_latency_ms,
    reconciliation_break_count:
      (overrides.reconciliation_break_count as number | undefined) ?? row.reconciliation_break_count,
    lcr_contribution_pct:
      (overrides.lcr_contribution_pct as number | undefined) ?? row.lcr_contribution_pct,
    nsfr_contribution_pct:
      (overrides.nsfr_contribution_pct as number | undefined) ?? row.nsfr_contribution_pct,
    excon_authorization_status: exconEff,
    fic_act_kyc_status: ficEff,
    protocol_compliant:
      (overrides.protocol_compliant as number | undefined) ?? row.protocol_compliant,
    iso27001_controls_ok:
      (overrides.iso27001_controls_ok as number | undefined) ?? row.iso27001_controls_ok,
    pci_dss_segmentation_ok:
      (overrides.pci_dss_segmentation_ok as number | undefined) ?? row.pci_dss_segmentation_ok,
  });
  overrides.settlement_quality_index = settlement;

  // Health band composite.
  const failureEff = (overrides.failure_rate_pct as number | undefined) ?? row.failure_rate_pct ?? 0;
  overrides.connector_health_band = connectorHealthBand(
    to,
    settlement,
    !!row.sla_breached,
    keyDays,
    floorFlags,
    failureEff,
    exconEff,
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    excon_authorization_status: exconEff,
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
    `UPDATE oe_strate_swift_connector SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `strate_swift_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_strate_swift_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `strate_swift_connector_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'strate_swift_connector',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_strate_swift_connector WHERE id = ?').bind(id).first<SscRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/validate-bic', async (c) => transition(c, 'validate_bic', (_row, body) => {
  const b = body as Partial<CommonBody & {
    bic?: string;
    counterparty_name?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.bic === 'string' && isValidBic(b.bic)) out.bic = b.bic;
  if (typeof b.counterparty_name === 'string') out.counterparty_name = b.counterparty_name;
  return applyCommon(b, out);
}));

app.post('/:id/complete-bank-handshake', async (c) => transition(c, 'complete_bank_handshake', (_row, body) => {
  const b = body as Partial<CommonBody & {
    endpoint_url?: string;
    reconciliation_account_id?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.endpoint_url === 'string') {
    assertSafeWebhookUrl(b.endpoint_url); // throws → transition() try/catch returns 400
    out.endpoint_url = b.endpoint_url;
  }
  if (typeof b.reconciliation_account_id === 'string') out.reconciliation_account_id = b.reconciliation_account_id;
  return applyCommon(b, out);
}));

app.post('/:id/load-iso20022-schemas', async (c) => transition(c, 'load_iso20022_schemas', (_row, body) => {
  const b = body as Partial<CommonBody & {
    iso20022_schema_version?: string;
    protocol_compliant?: boolean | number;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.iso20022_schema_version === 'string') out.iso20022_schema_version = b.iso20022_schema_version;
  const f = toFlag(b.protocol_compliant); if (f !== undefined) out.protocol_compliant = f;
  return applyCommon(b, out);
}));

app.post('/:id/establish-messaging-session', async (c) => transition(c, 'establish_messaging_session', (_row, body) => {
  const b = body as Partial<CommonBody & {
    swift_user_key_fingerprint?: string;
    swift_user_key_expiry_at?: string;
    iso27001_controls_ok?: boolean | number;
    pci_dss_segmentation_ok?: boolean | number;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.swift_user_key_fingerprint === 'string') {
    out.swift_user_key_fingerprint = b.swift_user_key_fingerprint.replace(/[:\s-]/g, '').toLowerCase();
  }
  if (typeof b.swift_user_key_expiry_at === 'string') out.swift_user_key_expiry_at = b.swift_user_key_expiry_at;
  const f1 = toFlag(b.iso27001_controls_ok); if (f1 !== undefined) out.iso27001_controls_ok = f1;
  const f2 = toFlag(b.pci_dss_segmentation_ok); if (f2 !== undefined) out.pci_dss_segmentation_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/validate-test-messages', async (c) => transition(c, 'validate_test_messages', (_row, body) => {
  const b = body as Partial<CommonBody & {
    average_settlement_latency_ms?: number;
    settlement_messages_per_minute?: number;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.average_settlement_latency_ms === 'number') out.average_settlement_latency_ms = b.average_settlement_latency_ms;
  if (typeof b.settlement_messages_per_minute === 'number') out.settlement_messages_per_minute = b.settlement_messages_per_minute;
  return applyCommon(b, out);
}));

app.post('/:id/bind-reconciliation-account', async (c) => transition(c, 'bind_reconciliation_account', (_row, body) => {
  const b = body as Partial<CommonBody & {
    reconciliation_account_id?: string;
    w120_reconciliation_attestation_ref?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.reconciliation_account_id === 'string') out.reconciliation_account_id = b.reconciliation_account_id;
  if (typeof b.w120_reconciliation_attestation_ref === 'string') out.w120_reconciliation_attestation_ref = b.w120_reconciliation_attestation_ref;
  return applyCommon(b, out);
}));

app.post('/:id/authorize-live-settlement', async (c) => transition(c, 'authorize_live_settlement', (_row, body) => {
  const b = body as Partial<CommonBody & {
    excon_authorization_status?: ExconStatus;
    fic_act_kyc_status?: FicKycStatus;
  }>;
  const out: Partial<SscRow> = {};
  if (b.excon_authorization_status) out.excon_authorization_status = b.excon_authorization_status;
  if (b.fic_act_kyc_status) out.fic_act_kyc_status = b.fic_act_kyc_status;
  return applyCommon(b, out);
}));

app.post('/:id/activate-reconciliation', async (c) => transition(c, 'activate_reconciliation', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/disconnect', async (c) => transition(c, 'disconnect', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w68_counterparty_margin_ref?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.w68_counterparty_margin_ref === 'string') out.w68_counterparty_margin_ref = b.w68_counterparty_margin_ref;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/revoke-credential', async (c) => transition(c, 'revoke_credential', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w68_counterparty_margin_ref?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.w68_counterparty_margin_ref === 'string') out.w68_counterparty_margin_ref = b.w68_counterparty_margin_ref;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w3_settlement_p6_ref?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.w3_settlement_p6_ref === 'string') out.w3_settlement_p6_ref = b.w3_settlement_p6_ref;
  return applyCommon(b, out);
}));

app.post('/:id/settle-cycle', async (c) => transition(c, 'settle_cycle', (_row, body) => {
  const b = body as Partial<CommonBody & {
    settlement_value_zar_last_24h?: number;
    successful_settlement_count_24h?: number;
    failed_settlement_count_24h?: number;
    failure_rate_pct?: number;
    reconciliation_break_count?: number;
    reconciliation_break_zar?: number;
    lcr_contribution_pct?: number;
    nsfr_contribution_pct?: number;
    w120_reconciliation_attestation_ref?: string;
    w3_settlement_p6_ref?: string;
    w21_drawdown_ref?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<SscRow> = {};
  if (typeof b.settlement_value_zar_last_24h === 'number')   out.settlement_value_zar_last_24h = b.settlement_value_zar_last_24h;
  if (typeof b.successful_settlement_count_24h === 'number') out.successful_settlement_count_24h = b.successful_settlement_count_24h;
  if (typeof b.failed_settlement_count_24h === 'number')     out.failed_settlement_count_24h = b.failed_settlement_count_24h;
  if (typeof b.failure_rate_pct === 'number')                out.failure_rate_pct = b.failure_rate_pct;
  if (typeof b.reconciliation_break_count === 'number')      out.reconciliation_break_count = b.reconciliation_break_count;
  if (typeof b.reconciliation_break_zar === 'number')        out.reconciliation_break_zar = b.reconciliation_break_zar;
  if (typeof b.lcr_contribution_pct === 'number')            out.lcr_contribution_pct = b.lcr_contribution_pct;
  if (typeof b.nsfr_contribution_pct === 'number')           out.nsfr_contribution_pct = b.nsfr_contribution_pct;
  if (typeof b.w120_reconciliation_attestation_ref === 'string') out.w120_reconciliation_attestation_ref = b.w120_reconciliation_attestation_ref;
  if (typeof b.w3_settlement_p6_ref === 'string')            out.w3_settlement_p6_ref = b.w3_settlement_p6_ref;
  if (typeof b.w21_drawdown_ref === 'string')                out.w21_drawdown_ref = b.w21_drawdown_ref;
  if (typeof b.w118_block_ref === 'string')                  out.w118_block_ref = b.w118_block_ref;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal connector past sla_deadline_at, flips
// sla_breached = 1, bumps escalation_level. Breach crosses regulator
// on samos_rtgs + swift_global tiers.
export async function strateSwiftConnectorSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_strate_swift_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SscRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_strate_swift_connector
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `strate_swift_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_strate_swift_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'strate_swift_connector_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'settlements_clerk',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as SscTier)) {
      await fireCascade({
        event: 'strate_swift_connector_sla_breached',
        actor_id: 'system',
        entity_type: 'strate_swift_connector',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily settlement reconciliation (30 1 * * *) ──────────────────
//
// 01:30 UTC = 03:30 SAST after SARB SAMOS end-of-day. Refreshes LIVE-
// derived persisted fields for every active connector: settlement_
// quality_index, connector_health_band, days_to_key_renewal.
export async function strateSwiftConnectorReconciliationSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_strate_swift_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')`,
  ).all<SscRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const settlement = settlementQualityIndex({
      settlement_messages_per_minute:  row.settlement_messages_per_minute,
      successful_settlement_count_24h: row.successful_settlement_count_24h,
      failed_settlement_count_24h:     row.failed_settlement_count_24h,
      failure_rate_pct:                row.failure_rate_pct,
      average_settlement_latency_ms:   row.average_settlement_latency_ms,
      reconciliation_break_count:      row.reconciliation_break_count,
      lcr_contribution_pct:            row.lcr_contribution_pct,
      nsfr_contribution_pct:           row.nsfr_contribution_pct,
      excon_authorization_status:      row.excon_authorization_status,
      fic_act_kyc_status:              row.fic_act_kyc_status,
      protocol_compliant:              row.protocol_compliant,
      iso27001_controls_ok:            row.iso27001_controls_ok,
      pci_dss_segmentation_ok:         row.pci_dss_segmentation_ok,
    });

    const keyDays = daysToKeyRenewal(row.swift_user_key_expiry_at, now);
    const flags = rowFloorFlags(row);

    const health = connectorHealthBand(
      row.chain_status,
      settlement,
      !!row.sla_breached,
      keyDays,
      flags,
      row.failure_rate_pct ?? 0,
      row.excon_authorization_status,
    );

    await env.DB.prepare(
      `UPDATE oe_strate_swift_connector
       SET settlement_quality_index = ?,
           connector_health_band = ?,
           days_to_key_renewal = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(settlement, health, keyDays, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

// ─── Cron: weekly SWIFT user-key expiry scan (0 7 * * 1) ─────────────────
//
// Monday 09:00 SAST (07:00 UTC). Flags any connector whose SWIFT
// user-key expires within 14 days as regulator_relevant so it surfaces
// in the regulator inbox. SARB BA 700 + FIC Act require pre-renewal
// notification.
export async function strateSwiftConnectorKeyExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_strate_swift_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND swift_user_key_expiry_at IS NOT NULL`,
  ).all<SscRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const keyDays = daysToKeyRenewal(row.swift_user_key_expiry_at, now);
    if (keyDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_strate_swift_connector
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_key_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(keyDays, nowIso, row.id).run();
      flagged++;
    } else {
      // Just refresh days_to_key_renewal.
      await env.DB.prepare(
        `UPDATE oe_strate_swift_connector
         SET days_to_key_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(keyDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
