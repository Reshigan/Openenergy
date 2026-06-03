// ═══════════════════════════════════════════════════════════════════════════
// Wave 125 - SAP / Oracle ERP Connector.
//
// PHASE C WAVE 4 OF 5. The ENTERPRISE BACK-OFFICE financial-integration
// spine. Where W124 = interbank rails (between banks), W125 = ERP GL/AP/AR
// integration between platform and customer back-office (SAP S/4HANA,
// SAP ECC, Oracle EBS/Fusion, Workday, SAGE 300, Dynamics 365, NetSuite,
// Epicor, IFS).
//
// Standards: SAP S/4HANA OData v4, SAP ECC IDoc FIDCC1/FIDCC2/REMADV/
// INVOIC, Oracle Fusion SOAP, Workday SOAP/REST, NetSuite SuiteTalk,
// IFRS 15/9/16/17, SARS e-Filing, CIPC AFS + XBRL, SOC 1 Type II SSAE 18,
// ISO 27001, PCAOB AS 5.
//
// 16 actions: propose_connector / validate_erp_endpoint /
//   map_company_code / bind_chart_of_accounts / load_schemas /
//   establish_idoc_session / validate_test_postings /
//   bind_reconciliation_period / activate_live_posting /
//   reconcile_period_close / archive / disconnect / suspend / resume /
//   revoke_credential / activate_failover.
//
// SIGNATURE Phase-C regulator crossings:
//   revoke_credential -> EVERY tier (W125 SIGNATURE SAP-ORACLE-ERP-
//     CONNECTOR-REVOKE hard line)
//   activate_failover -> enterprise_wide + group_consolidation +
//     multi_country
//   disconnect -> EVERY tier WHEN sox_404_in_scope OR
//     sars_efiling_critical_path
//   reconcile_period_close -> multi_country
//   sla_breached -> enterprise_wide + group_consolidation +
//     multi_country
//
// Write {admin, trader, lender, offtaker} (4 financial writers same
// as W124). PUBLIC mTLS-gated peer endpoint at
// /api/sap-oracle-erp-connector/peer/:peer_id (BEFORE authMiddleware)
// returns a handshake snapshot for trusted erp_counterparty peers
// using `x-mtls-cert-fingerprint` header.
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
  tierForScope,
  effectiveTier,
  countFloorFlags,
  floorAtEnterpriseWide,
  floorAtMultiCountry,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  daysToCredentialRenewal,
  daysToPeriodClose,
  bridgesToW124SettlementConnector,
  bridgesToW3SettlementP6,
  bridgesToW68CounterpartyMargin,
  bridgesToW21Drawdown,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  connectorHealthBand,
  isKnownErpSystem,
  SAP_ORACLE_ERP_SYSTEMS,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
  type SoecStatus,
  type SoecAction,
  type SoecTier,
  type SapOracleErpSystem,
} from '../utils/sap-oracle-erp-connector-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W125 = admin + trader + lender + offtaker write (4 financial personas
// SAME AS W124).
const WRITE_ROLES = new Set(['admin', 'trader', 'lender', 'offtaker']);

type SarsStatus = 'current' | 'pending' | 'overdue';
type CipcStatus = 'current' | 'pending' | 'overdue';
type ErpProtocol = 'odata_v4' | 'soap' | 'rest' | 'idoc' | 'suitetalk' | 'dataverse' | 'proprietary';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface SoecRow {
  id: string;
  connector_number: string;
  peer_id: string;
  counterparty_name: string | null;
  erp_system: SapOracleErpSystem | string;
  protocol: ErpProtocol | string;
  schema_version: string | null;
  service_account_credential_fingerprint: string | null;
  credential_expiry_at: string | null;
  endpoint_url: string | null;
  module_count: number | null;
  company_code_count: number | null;
  chart_of_accounts_node_count: number | null;
  jurisdiction_count: number | null;
  idoc_session_id: string | null;
  period_end_at: string | null;

  w124_settlement_connector_ref: string | null;
  w3_settlement_p6_ref: string | null;
  w68_counterparty_margin_ref: string | null;
  w21_drawdown_ref: string | null;
  w118_block_ref: string | null;

  sox_404_in_scope: number;
  ifrs_consolidation_required: number;
  cross_border_transfer_pricing: number;
  sars_efiling_critical_path: number;
  cipc_annual_filing_gate: number;

  posting_volume_per_hour: number | null;
  successful_posting_count_24h: number | null;
  failed_posting_count_24h: number | null;
  failure_rate_pct: number | null;
  average_posting_latency_ms: number | null;
  reconciliation_break_count: number | null;
  ifrs_15_revenue_contribution_pct: number | null;
  ifrs_9_financial_instrument_contribution_pct: number | null;
  sars_efiling_status: SarsStatus | null;
  cipc_annual_filing_status: CipcStatus | null;
  schemas_compliant: number;
  iso27001_controls_ok: number;
  soc1_type2_audit_ok: number;
  control_effectiveness_index: number | null;

  current_tier: SoecTier;
  authority_required: string | null;
  urgency_band: string | null;
  connector_health_band: string | null;

  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;

  chain_status: SoecStatus;
  connector_proposed_at: string | null;
  erp_endpoint_validated_at: string | null;
  company_code_mapped_at: string | null;
  chart_of_accounts_bound_at: string | null;
  schemas_loaded_at: string | null;
  idoc_session_established_at: string | null;
  test_postings_validated_at: string | null;
  reconciliation_period_bound_at: string | null;
  live_posting_active_at: string | null;
  period_close_reconciled_at: string | null;
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
  days_to_credential_renewal: number | null;
  days_to_period_close: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SoecEventRow {
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

const TIMESTAMP_COLUMN: Record<SoecStatus, keyof SoecRow | null> = {
  connector_proposed:           'connector_proposed_at',
  erp_endpoint_validated:       'erp_endpoint_validated_at',
  company_code_mapped:          'company_code_mapped_at',
  chart_of_accounts_bound:      'chart_of_accounts_bound_at',
  schemas_loaded:               'schemas_loaded_at',
  idoc_session_established:     'idoc_session_established_at',
  test_postings_validated:      'test_postings_validated_at',
  reconciliation_period_bound:  'reconciliation_period_bound_at',
  live_posting_active:          'live_posting_active_at',
  period_close_reconciled:      'period_close_reconciled_at',
  archived:                     'archived_at',
  disconnected:                 'disconnected_at',
  suspended:                    'suspended_at',
  failover_active:              'failover_activated_at',
  credential_revoked:           'credential_revoked_at',
};

function statusEnteredAt(row: SoecRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.connector_proposed_at ? new Date(row.connector_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.connector_proposed_at ? new Date(row.connector_proposed_at) : null);
}

function rowFloorFlags(row: SoecRow) {
  return {
    sox_404_in_scope:               row.sox_404_in_scope,
    ifrs_consolidation_required:    row.ifrs_consolidation_required,
    cross_border_transfer_pricing:  row.cross_border_transfer_pricing,
    sars_efiling_critical_path:     row.sars_efiling_critical_path,
    cipc_annual_filing_gate:        row.cipc_annual_filing_gate,
  };
}

function decorate(row: SoecRow, now: Date) {
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
  const credDays = daysToCredentialRenewal(row.credential_expiry_at, now);
  const periodDays = daysToPeriodClose(row.period_end_at, now);

  const floorFlags = countFloorFlags(flags);
  const floorEnterprise = floorAtEnterpriseWide(flags);
  const floorMultiCountry = floorAtMultiCountry(flags);

  const controlLive = controlEffectivenessIndex({
    posting_volume_per_hour:                       row.posting_volume_per_hour,
    successful_posting_count_24h:                  row.successful_posting_count_24h,
    failed_posting_count_24h:                      row.failed_posting_count_24h,
    failure_rate_pct:                              row.failure_rate_pct,
    average_posting_latency_ms:                    row.average_posting_latency_ms,
    reconciliation_break_count:                    row.reconciliation_break_count,
    ifrs_15_revenue_contribution_pct:              row.ifrs_15_revenue_contribution_pct,
    ifrs_9_financial_instrument_contribution_pct:  row.ifrs_9_financial_instrument_contribution_pct,
    sars_efiling_status:                           row.sars_efiling_status,
    cipc_annual_filing_status:                     row.cipc_annual_filing_status,
    schemas_compliant:                             row.schemas_compliant,
    iso27001_controls_ok:                          row.iso27001_controls_ok,
    soc1_type2_audit_ok:                           row.soc1_type2_audit_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = connectorHealthBand(
    status,
    controlLive,
    !!row.sla_breached || slaBreachedLive,
    credDays,
    flags,
    row.failure_rate_pct ?? 0,
    row.sars_efiling_status,
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
    days_to_credential_renewal_live: credDays,
    days_to_period_close_live: periodDays,
    floor_flag_count_live: floorFlags,
    floor_at_enterprise_wide_live: floorEnterprise,
    floor_at_multi_country_live: floorMultiCountry,
    control_effectiveness_index_live: controlLive,
    connector_health_band_live: healthLive,
    bridges_to_w124_settlement_connector_live: bridgesToW124SettlementConnector(row.w124_settlement_connector_ref),
    bridges_to_w3_settlement_p6_live: bridgesToW3SettlementP6(row.w3_settlement_p6_ref),
    bridges_to_w68_counterparty_margin_live: bridgesToW68CounterpartyMargin(row.w68_counterparty_margin_ref),
    bridges_to_w21_drawdown_live: bridgesToW21Drawdown(row.w21_drawdown_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// ─── PUBLIC mTLS peer endpoint (NO Bearer auth) ─────────────────────────
//
// GET /api/sap-oracle-erp-connector/peer/:peer_id with header
// `x-mtls-cert-fingerprint` (W122/W123/W124/W125 Phase-C consistency).
// Returns a handshake snapshot for the trusted erp_counterparty.
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
    'SELECT * FROM oe_sap_oracle_erp_connector WHERE peer_id = ?',
  ).bind(peerId).first<SoecRow>();
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
        erp_system: row.erp_system,
        protocol: row.protocol,
        schema_version: row.schema_version,
        endpoint_url: row.endpoint_url,
        chain_status: row.chain_status,
        current_tier: row.current_tier,
        connector_health_band_live: decorated.connector_health_band_live,
        control_effectiveness_index_live: decorated.control_effectiveness_index_live,
        sla_breached_live: decorated.sla_breached_live,
        sars_efiling_status: row.sars_efiling_status,
        cipc_annual_filing_status: row.cipc_annual_filing_status,
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
  const erp_system = c.req.query('erp_system');
  const protocol   = c.req.query('protocol');
  const sars       = c.req.query('sars');
  const health     = c.req.query('health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_sap_oracle_erp_connector WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)       { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)     { sql += ' AND chain_status = ?'; binds.push(status); }
  if (erp_system) { sql += ' AND erp_system = ?';   binds.push(erp_system); }
  if (protocol)   { sql += ' AND protocol = ?';     binds.push(protocol); }
  if (sars)       { sql += ' AND sars_efiling_status = ?'; binds.push(sars); }
  if (health)     { sql += ' AND connector_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SoecRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_erp_system: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_sars: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_erp_system[i.erp_system as string] = (by_erp_system[i.erp_system as string] || 0) + 1;
    by_protocol[i.protocol as string] = (by_protocol[i.protocol as string] || 0) + 1;
    if (i.sars_efiling_status) by_sars[i.sars_efiling_status as string] = (by_sars[i.sars_efiling_status as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.connector_health_band_live] = (by_health[i.connector_health_band_live] || 0) + 1;
  }

  const active_count       = items.filter((i) => !i.is_terminal).length;
  const proposed_count     = items.filter((i) => i.chain_status === 'connector_proposed').length;
  const endpoint_v_count   = items.filter((i) => i.chain_status === 'erp_endpoint_validated').length;
  const cc_mapped_count    = items.filter((i) => i.chain_status === 'company_code_mapped').length;
  const coa_bound_count    = items.filter((i) => i.chain_status === 'chart_of_accounts_bound').length;
  const schemas_count      = items.filter((i) => i.chain_status === 'schemas_loaded').length;
  const idoc_count         = items.filter((i) => i.chain_status === 'idoc_session_established').length;
  const tests_count        = items.filter((i) => i.chain_status === 'test_postings_validated').length;
  const recon_bound_count  = items.filter((i) => i.chain_status === 'reconciliation_period_bound').length;
  const live_count         = items.filter((i) => i.chain_status === 'live_posting_active').length;
  const reconciled_count   = items.filter((i) => i.chain_status === 'period_close_reconciled').length;
  const archived_count     = items.filter((i) => i.chain_status === 'archived').length;
  const disconnected_count = items.filter((i) => i.chain_status === 'disconnected').length;
  const revoked_count      = items.filter((i) => i.chain_status === 'credential_revoked').length;
  const suspended_count    = items.filter((i) => i.chain_status === 'suspended').length;
  const failover_count     = items.filter((i) => i.chain_status === 'failover_active').length;
  const breached_count     = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total   = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged       = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w124_bridged       = items.filter((i) => i.bridges_to_w124_settlement_connector_live).length;
  const w3_bridged         = items.filter((i) => i.bridges_to_w3_settlement_p6_live).length;
  const w68_bridged        = items.filter((i) => i.bridges_to_w68_counterparty_margin_live).length;
  const w21_bridged        = items.filter((i) => i.bridges_to_w21_drawdown_live).length;
  const control_avg        = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.control_effectiveness_index_live || 0), 0) / items.length)
    : 0;
  const creds_expiring_60d = items.filter((i) => (i.days_to_credential_renewal_live ?? 9999) < 60).length;
  const creds_expiring_14d = items.filter((i) => (i.days_to_credential_renewal_live ?? 9999) < 14).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_erp_system,
      by_protocol,
      by_sars,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      endpoint_v_count,
      cc_mapped_count,
      coa_bound_count,
      schemas_count,
      idoc_count,
      tests_count,
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
      w124_bridged_count: w124_bridged,
      w3_bridged_count: w3_bridged,
      w68_bridged_count: w68_bridged,
      w21_bridged_count: w21_bridged,
      w118_bridged_count: w118_bridged,
      control_effectiveness_avg: control_avg,
      creds_expiring_within_60d: creds_expiring_60d,
      creds_expiring_within_14d: creds_expiring_14d,
      sap_oracle_erp_systems: SAP_ORACLE_ERP_SYSTEMS,
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
    `SELECT chain_status, current_tier, connector_health_band, erp_system, protocol,
            sars_efiling_status, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_sap_oracle_erp_connector
     GROUP BY chain_status, current_tier, connector_health_band, erp_system, protocol,
              sars_efiling_status, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; connector_health_band: string | null;
    erp_system: string | null; protocol: string | null;
    sars_efiling_status: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_erp_system: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_sars: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.connector_health_band) by_health[r.connector_health_band] = (by_health[r.connector_health_band] || 0) + r.n;
    if (r.erp_system) by_erp_system[r.erp_system] = (by_erp_system[r.erp_system] || 0) + r.n;
    if (r.protocol) by_protocol[r.protocol] = (by_protocol[r.protocol] || 0) + r.n;
    if (r.sars_efiling_status) by_sars[r.sars_efiling_status] = (by_sars[r.sars_efiling_status] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_erp_system, by_protocol, by_sars,
      by_regulator_relevant, by_sla_breached,
      sap_oracle_erp_systems: SAP_ORACLE_ERP_SYSTEMS,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_sap_oracle_erp_connector WHERE id = ?').bind(id).first<SoecRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_sap_oracle_erp_connector_events WHERE connector_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SoecEventRow>();

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
  erp_system?: SapOracleErpSystem;
  protocol?: ErpProtocol;
  schema_version?: string;
  service_account_credential_fingerprint?: string;
  credential_expiry_at?: string;
  endpoint_url?: string;
  module_count?: number;
  company_code_count?: number;
  chart_of_accounts_node_count?: number;
  jurisdiction_count?: number;
  idoc_session_id?: string;
  period_end_at?: string;

  w124_settlement_connector_ref?: string;
  w3_settlement_p6_ref?: string;
  w68_counterparty_margin_ref?: string;
  w21_drawdown_ref?: string;
  w118_block_ref?: string;

  sox_404_in_scope?: boolean | number;
  ifrs_consolidation_required?: boolean | number;
  cross_border_transfer_pricing?: boolean | number;
  sars_efiling_critical_path?: boolean | number;
  cipc_annual_filing_gate?: boolean | number;

  posting_volume_per_hour?: number;
  successful_posting_count_24h?: number;
  failed_posting_count_24h?: number;
  failure_rate_pct?: number;
  average_posting_latency_ms?: number;
  reconciliation_break_count?: number;
  ifrs_15_revenue_contribution_pct?: number;
  ifrs_9_financial_instrument_contribution_pct?: number;
  sars_efiling_status?: SarsStatus;
  cipc_annual_filing_status?: CipcStatus;
  schemas_compliant?: boolean | number;
  iso27001_controls_ok?: boolean | number;
  soc1_type2_audit_ok?: boolean | number;

  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<SoecRow>): Partial<SoecRow> {
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

  const id = `soec-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const erpSystem = isKnownErpSystem(body.erp_system)
    ? body.erp_system
    : 'sap_s4hana';
  const protocol: ErpProtocol = body.protocol ?? 'odata_v4';

  const flags = {
    sox_404_in_scope:              toFlag(body.sox_404_in_scope) ?? 0,
    ifrs_consolidation_required:   toFlag(body.ifrs_consolidation_required) ?? 0,
    cross_border_transfer_pricing: toFlag(body.cross_border_transfer_pricing) ?? 0,
    sars_efiling_critical_path:    toFlag(body.sars_efiling_critical_path) ?? 0,
    cipc_annual_filing_gate:       toFlag(body.cipc_annual_filing_gate) ?? 0,
  };
  const rawTier = tierForScope({
    module_count: body.module_count,
    company_code_count: body.company_code_count,
    jurisdiction_count: body.jurisdiction_count,
  });
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('connector_proposed', tier, now);
  const slaHrs = slaWindowHours('connector_proposed', tier);
  const credDays = daysToCredentialRenewal(body.credential_expiry_at ?? null, now);
  const periodDays = daysToPeriodClose(body.period_end_at ?? null, now);

  // Connector number = SOEC-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_sap_oracle_erp_connector`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const ccNum = `SOEC-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const peerId = body.peer_id ?? `erp-peer-${id.slice(5)}`;

  // Compute initial control effectiveness (most fields 0/null on create).
  const controlInit = controlEffectivenessIndex({
    sars_efiling_status:        body.sars_efiling_status ?? null,
    cipc_annual_filing_status:  body.cipc_annual_filing_status ?? null,
    schemas_compliant:          toFlag(body.schemas_compliant),
    iso27001_controls_ok:       toFlag(body.iso27001_controls_ok),
    soc1_type2_audit_ok:        toFlag(body.soc1_type2_audit_ok),
  });

  const healthInit = connectorHealthBand(
    'connector_proposed',
    controlInit,
    false,
    credDays,
    flags,
    body.failure_rate_pct ?? 0,
    body.sars_efiling_status ?? null,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_sap_oracle_erp_connector (
      id, connector_number, peer_id, counterparty_name, erp_system, protocol,
      schema_version, service_account_credential_fingerprint, credential_expiry_at,
      endpoint_url, module_count, company_code_count, chart_of_accounts_node_count,
      jurisdiction_count, idoc_session_id, period_end_at,
      w124_settlement_connector_ref, w3_settlement_p6_ref, w68_counterparty_margin_ref,
      w21_drawdown_ref, w118_block_ref,
      sox_404_in_scope, ifrs_consolidation_required, cross_border_transfer_pricing,
      sars_efiling_critical_path, cipc_annual_filing_gate,
      posting_volume_per_hour, successful_posting_count_24h, failed_posting_count_24h,
      failure_rate_pct, average_posting_latency_ms, reconciliation_break_count,
      ifrs_15_revenue_contribution_pct, ifrs_9_financial_instrument_contribution_pct,
      sars_efiling_status, cipc_annual_filing_status,
      schemas_compliant, iso27001_controls_ok, soc1_type2_audit_ok,
      control_effectiveness_index,
      current_tier, authority_required, urgency_band, connector_health_band,
      title, is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, connector_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_credential_renewal, days_to_period_close,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ccNum, peerId, body.counterparty_name ?? null, erpSystem, protocol,
    body.schema_version ?? null,
    body.service_account_credential_fingerprint
      ? body.service_account_credential_fingerprint.replace(/[:\s-]/g, '').toLowerCase()
      : null,
    body.credential_expiry_at ?? null,
    body.endpoint_url ?? null,
    body.module_count ?? null, body.company_code_count ?? null,
    body.chart_of_accounts_node_count ?? null, body.jurisdiction_count ?? null,
    body.idoc_session_id ?? null, body.period_end_at ?? null,
    body.w124_settlement_connector_ref ?? null, body.w3_settlement_p6_ref ?? null,
    body.w68_counterparty_margin_ref ?? null, body.w21_drawdown_ref ?? null,
    body.w118_block_ref ?? null,
    flags.sox_404_in_scope, flags.ifrs_consolidation_required,
    flags.cross_border_transfer_pricing, flags.sars_efiling_critical_path,
    flags.cipc_annual_filing_gate,
    body.posting_volume_per_hour ?? null, body.successful_posting_count_24h ?? null,
    body.failed_posting_count_24h ?? null, body.failure_rate_pct ?? null,
    body.average_posting_latency_ms ?? null, body.reconciliation_break_count ?? null,
    body.ifrs_15_revenue_contribution_pct ?? null,
    body.ifrs_9_financial_instrument_contribution_pct ?? null,
    body.sars_efiling_status ?? null, body.cipc_annual_filing_status ?? null,
    toFlag(body.schemas_compliant) ?? 0, toFlag(body.iso27001_controls_ok) ?? 0,
    toFlag(body.soc1_type2_audit_ok) ?? 0, controlInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs, flags), healthInit,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'connector_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    credDays, periodDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `sap_oracle_erp_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_sap_oracle_erp_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'sap_oracle_erp_connector_proposed',
    null, 'connector_proposed', null, tier,
    user.id, partyForAction('propose_connector'),
    null, JSON.stringify({ tier, erp_system: erpSystem, protocol, peer_id: peerId, counterparty_name: body.counterparty_name }), nowIso,
  ).run();

  await fireCascade({
    event: 'sap_oracle_erp_connector_proposed',
    actor_id: user.id,
    entity_type: 'sap_oracle_erp_connector',
    entity_id: id,
    data: { tier, erp_system: erpSystem, protocol, peer_id: peerId, chain_status: 'connector_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_sap_oracle_erp_connector WHERE id = ?').bind(id).first<SoecRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: SoecAction,
  bodyHandler?: (row: SoecRow, body: Record<string, unknown>) => Partial<SoecRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_sap_oracle_erp_connector WHERE id = ?').bind(id).first<SoecRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  let overrides: Partial<SoecRow>;
  try {
    overrides = bodyHandler ? bodyHandler(row, body) : {};
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'invalid request body' }, 400);
  }

  // Re-derive tier from (module_count, company_code_count, jurisdiction_count) + 5 floor flags.
  const moduleCount =
    (overrides.module_count as number | undefined) ?? row.module_count;
  const ccCount =
    (overrides.company_code_count as number | undefined) ?? row.company_code_count;
  const jurisCount =
    (overrides.jurisdiction_count as number | undefined) ?? row.jurisdiction_count;
  const rawTier = tierForScope({
    module_count: moduleCount,
    company_code_count: ccCount,
    jurisdiction_count: jurisCount,
  });
  const floorFlags = {
    sox_404_in_scope:
      (overrides.sox_404_in_scope as number | undefined) ?? row.sox_404_in_scope,
    ifrs_consolidation_required:
      (overrides.ifrs_consolidation_required as number | undefined) ?? row.ifrs_consolidation_required,
    cross_border_transfer_pricing:
      (overrides.cross_border_transfer_pricing as number | undefined) ?? row.cross_border_transfer_pricing,
    sars_efiling_critical_path:
      (overrides.sars_efiling_critical_path as number | undefined) ?? row.sars_efiling_critical_path,
    cipc_annual_filing_gate:
      (overrides.cipc_annual_filing_gate as number | undefined) ?? row.cipc_annual_filing_gate,
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

  // Re-derive control effectiveness + days_to_credential_renewal + days_to_period_close.
  const credExpiry = (overrides.credential_expiry_at as string | undefined) ?? row.credential_expiry_at;
  const credDays = daysToCredentialRenewal(credExpiry, now);
  overrides.days_to_credential_renewal = credDays;
  const periodEnd = (overrides.period_end_at as string | undefined) ?? row.period_end_at;
  const periodDays = daysToPeriodClose(periodEnd, now);
  overrides.days_to_period_close = periodDays;

  const sarsEff =
    (overrides.sars_efiling_status as SarsStatus | undefined) ?? row.sars_efiling_status;
  const cipcEff =
    (overrides.cipc_annual_filing_status as CipcStatus | undefined) ?? row.cipc_annual_filing_status;

  const controlScore = controlEffectivenessIndex({
    posting_volume_per_hour:
      (overrides.posting_volume_per_hour as number | undefined) ?? row.posting_volume_per_hour,
    successful_posting_count_24h:
      (overrides.successful_posting_count_24h as number | undefined) ?? row.successful_posting_count_24h,
    failed_posting_count_24h:
      (overrides.failed_posting_count_24h as number | undefined) ?? row.failed_posting_count_24h,
    failure_rate_pct:
      (overrides.failure_rate_pct as number | undefined) ?? row.failure_rate_pct,
    average_posting_latency_ms:
      (overrides.average_posting_latency_ms as number | undefined) ?? row.average_posting_latency_ms,
    reconciliation_break_count:
      (overrides.reconciliation_break_count as number | undefined) ?? row.reconciliation_break_count,
    ifrs_15_revenue_contribution_pct:
      (overrides.ifrs_15_revenue_contribution_pct as number | undefined) ?? row.ifrs_15_revenue_contribution_pct,
    ifrs_9_financial_instrument_contribution_pct:
      (overrides.ifrs_9_financial_instrument_contribution_pct as number | undefined)
        ?? row.ifrs_9_financial_instrument_contribution_pct,
    sars_efiling_status: sarsEff,
    cipc_annual_filing_status: cipcEff,
    schemas_compliant:
      (overrides.schemas_compliant as number | undefined) ?? row.schemas_compliant,
    iso27001_controls_ok:
      (overrides.iso27001_controls_ok as number | undefined) ?? row.iso27001_controls_ok,
    soc1_type2_audit_ok:
      (overrides.soc1_type2_audit_ok as number | undefined) ?? row.soc1_type2_audit_ok,
  });
  overrides.control_effectiveness_index = controlScore;

  // Health band composite.
  const failureEff = (overrides.failure_rate_pct as number | undefined) ?? row.failure_rate_pct ?? 0;
  overrides.connector_health_band = connectorHealthBand(
    to,
    controlScore,
    !!row.sla_breached,
    credDays,
    floorFlags,
    failureEff,
    sarsEff,
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
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
    `UPDATE oe_sap_oracle_erp_connector SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `sap_oracle_erp_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_sap_oracle_erp_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `sap_oracle_erp_connector_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'sap_oracle_erp_connector',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_sap_oracle_erp_connector WHERE id = ?').bind(id).first<SoecRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/validate-erp-endpoint', async (c) => transition(c, 'validate_erp_endpoint', (_row, body) => {
  const b = body as Partial<CommonBody & {
    endpoint_url?: string;
    counterparty_name?: string;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.endpoint_url === 'string') {
    assertSafeWebhookUrl(b.endpoint_url); // throws → transition() try/catch returns 400
    out.endpoint_url = b.endpoint_url;
  }
  if (typeof b.counterparty_name === 'string') out.counterparty_name = b.counterparty_name;
  return applyCommon(b, out);
}));

app.post('/:id/map-company-code', async (c) => transition(c, 'map_company_code', (_row, body) => {
  const b = body as Partial<CommonBody & {
    module_count?: number;
    company_code_count?: number;
    jurisdiction_count?: number;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.module_count === 'number') out.module_count = b.module_count;
  if (typeof b.company_code_count === 'number') out.company_code_count = b.company_code_count;
  if (typeof b.jurisdiction_count === 'number') out.jurisdiction_count = b.jurisdiction_count;
  return applyCommon(b, out);
}));

app.post('/:id/bind-chart-of-accounts', async (c) => transition(c, 'bind_chart_of_accounts', (_row, body) => {
  const b = body as Partial<CommonBody & {
    chart_of_accounts_node_count?: number;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.chart_of_accounts_node_count === 'number') out.chart_of_accounts_node_count = b.chart_of_accounts_node_count;
  return applyCommon(b, out);
}));

app.post('/:id/load-schemas', async (c) => transition(c, 'load_schemas', (_row, body) => {
  const b = body as Partial<CommonBody & {
    schema_version?: string;
    schemas_compliant?: boolean | number;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.schema_version === 'string') out.schema_version = b.schema_version;
  const f = toFlag(b.schemas_compliant); if (f !== undefined) out.schemas_compliant = f;
  return applyCommon(b, out);
}));

app.post('/:id/establish-idoc-session', async (c) => transition(c, 'establish_idoc_session', (_row, body) => {
  const b = body as Partial<CommonBody & {
    idoc_session_id?: string;
    service_account_credential_fingerprint?: string;
    credential_expiry_at?: string;
    iso27001_controls_ok?: boolean | number;
    soc1_type2_audit_ok?: boolean | number;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.idoc_session_id === 'string') out.idoc_session_id = b.idoc_session_id;
  if (typeof b.service_account_credential_fingerprint === 'string') {
    out.service_account_credential_fingerprint = b.service_account_credential_fingerprint.replace(/[:\s-]/g, '').toLowerCase();
  }
  if (typeof b.credential_expiry_at === 'string') out.credential_expiry_at = b.credential_expiry_at;
  const f1 = toFlag(b.iso27001_controls_ok); if (f1 !== undefined) out.iso27001_controls_ok = f1;
  const f2 = toFlag(b.soc1_type2_audit_ok); if (f2 !== undefined) out.soc1_type2_audit_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/validate-test-postings', async (c) => transition(c, 'validate_test_postings', (_row, body) => {
  const b = body as Partial<CommonBody & {
    average_posting_latency_ms?: number;
    posting_volume_per_hour?: number;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.average_posting_latency_ms === 'number') out.average_posting_latency_ms = b.average_posting_latency_ms;
  if (typeof b.posting_volume_per_hour === 'number') out.posting_volume_per_hour = b.posting_volume_per_hour;
  return applyCommon(b, out);
}));

app.post('/:id/bind-reconciliation-period', async (c) => transition(c, 'bind_reconciliation_period', (_row, body) => {
  const b = body as Partial<CommonBody & {
    period_end_at?: string;
    w124_settlement_connector_ref?: string;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.period_end_at === 'string') out.period_end_at = b.period_end_at;
  if (typeof b.w124_settlement_connector_ref === 'string') out.w124_settlement_connector_ref = b.w124_settlement_connector_ref;
  return applyCommon(b, out);
}));

app.post('/:id/activate-live-posting', async (c) => transition(c, 'activate_live_posting', (_row, body) => {
  const b = body as Partial<CommonBody & {
    sars_efiling_status?: SarsStatus;
    cipc_annual_filing_status?: CipcStatus;
  }>;
  const out: Partial<SoecRow> = {};
  if (b.sars_efiling_status) out.sars_efiling_status = b.sars_efiling_status;
  if (b.cipc_annual_filing_status) out.cipc_annual_filing_status = b.cipc_annual_filing_status;
  return applyCommon(b, out);
}));

app.post('/:id/reconcile-period-close', async (c) => transition(c, 'reconcile_period_close', (_row, body) => {
  const b = body as Partial<CommonBody & {
    successful_posting_count_24h?: number;
    failed_posting_count_24h?: number;
    failure_rate_pct?: number;
    reconciliation_break_count?: number;
    ifrs_15_revenue_contribution_pct?: number;
    ifrs_9_financial_instrument_contribution_pct?: number;
    w124_settlement_connector_ref?: string;
    w3_settlement_p6_ref?: string;
    w68_counterparty_margin_ref?: string;
    w21_drawdown_ref?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.successful_posting_count_24h === 'number') out.successful_posting_count_24h = b.successful_posting_count_24h;
  if (typeof b.failed_posting_count_24h === 'number')    out.failed_posting_count_24h = b.failed_posting_count_24h;
  if (typeof b.failure_rate_pct === 'number')            out.failure_rate_pct = b.failure_rate_pct;
  if (typeof b.reconciliation_break_count === 'number')  out.reconciliation_break_count = b.reconciliation_break_count;
  if (typeof b.ifrs_15_revenue_contribution_pct === 'number') out.ifrs_15_revenue_contribution_pct = b.ifrs_15_revenue_contribution_pct;
  if (typeof b.ifrs_9_financial_instrument_contribution_pct === 'number') {
    out.ifrs_9_financial_instrument_contribution_pct = b.ifrs_9_financial_instrument_contribution_pct;
  }
  if (typeof b.w124_settlement_connector_ref === 'string') out.w124_settlement_connector_ref = b.w124_settlement_connector_ref;
  if (typeof b.w3_settlement_p6_ref === 'string')        out.w3_settlement_p6_ref = b.w3_settlement_p6_ref;
  if (typeof b.w68_counterparty_margin_ref === 'string') out.w68_counterparty_margin_ref = b.w68_counterparty_margin_ref;
  if (typeof b.w21_drawdown_ref === 'string')            out.w21_drawdown_ref = b.w21_drawdown_ref;
  if (typeof b.w118_block_ref === 'string')              out.w118_block_ref = b.w118_block_ref;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/disconnect', async (c) => transition(c, 'disconnect', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w68_counterparty_margin_ref?: string;
  }>;
  const out: Partial<SoecRow> = {};
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
  const out: Partial<SoecRow> = {};
  if (typeof b.w68_counterparty_margin_ref === 'string') out.w68_counterparty_margin_ref = b.w68_counterparty_margin_ref;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w3_settlement_p6_ref?: string;
  }>;
  const out: Partial<SoecRow> = {};
  if (typeof b.w3_settlement_p6_ref === 'string') out.w3_settlement_p6_ref = b.w3_settlement_p6_ref;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal connector past sla_deadline_at, flips
// sla_breached = 1, bumps escalation_level. Breach crosses regulator
// on enterprise_wide + group_consolidation + multi_country tiers.
export async function sapOracleErpConnectorSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_sap_oracle_erp_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SoecRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_sap_oracle_erp_connector
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `sap_oracle_erp_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_sap_oracle_erp_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'sap_oracle_erp_connector_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'finance_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as SoecTier)) {
      await fireCascade({
        event: 'sap_oracle_erp_connector_sla_breached',
        actor_id: 'system',
        entity_type: 'sap_oracle_erp_connector',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily period-close reconciliation (45 1 * * *) ─────────────────
//
// 01:45 UTC = 03:45 SAST, 15 min after W124 settlement reconciliation.
// Refreshes LIVE-derived persisted fields for every active connector:
// control_effectiveness_index, connector_health_band,
// days_to_credential_renewal, days_to_period_close.
export async function sapOracleErpConnectorReconciliationSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_sap_oracle_erp_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')`,
  ).all<SoecRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const control = controlEffectivenessIndex({
      posting_volume_per_hour:                       row.posting_volume_per_hour,
      successful_posting_count_24h:                  row.successful_posting_count_24h,
      failed_posting_count_24h:                      row.failed_posting_count_24h,
      failure_rate_pct:                              row.failure_rate_pct,
      average_posting_latency_ms:                    row.average_posting_latency_ms,
      reconciliation_break_count:                    row.reconciliation_break_count,
      ifrs_15_revenue_contribution_pct:              row.ifrs_15_revenue_contribution_pct,
      ifrs_9_financial_instrument_contribution_pct:  row.ifrs_9_financial_instrument_contribution_pct,
      sars_efiling_status:                           row.sars_efiling_status,
      cipc_annual_filing_status:                     row.cipc_annual_filing_status,
      schemas_compliant:                             row.schemas_compliant,
      iso27001_controls_ok:                          row.iso27001_controls_ok,
      soc1_type2_audit_ok:                           row.soc1_type2_audit_ok,
    });

    const credDays = daysToCredentialRenewal(row.credential_expiry_at, now);
    const periodDays = daysToPeriodClose(row.period_end_at, now);
    const flags = rowFloorFlags(row);

    const health = connectorHealthBand(
      row.chain_status,
      control,
      !!row.sla_breached,
      credDays,
      flags,
      row.failure_rate_pct ?? 0,
      row.sars_efiling_status,
    );

    await env.DB.prepare(
      `UPDATE oe_sap_oracle_erp_connector
       SET control_effectiveness_index = ?,
           connector_health_band = ?,
           days_to_credential_renewal = ?,
           days_to_period_close = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(control, health, credDays, periodDays, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

// ─── Cron: weekly service-account credential expiry scan (0 7 * * 1) ─────
//
// Monday 09:00 SAST (07:00 UTC). Flags any connector whose service-
// account credential expires within 14 days as regulator_relevant so
// it surfaces in the regulator inbox. SOC 1 Type II + ISO 27001 require
// pre-renewal notification.
export async function sapOracleErpConnectorCredentialExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_sap_oracle_erp_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND credential_expiry_at IS NOT NULL`,
  ).all<SoecRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const credDays = daysToCredentialRenewal(row.credential_expiry_at, now);
    if (credDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_sap_oracle_erp_connector
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_credential_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(credDays, nowIso, row.id).run();
      flagged++;
    } else {
      // Just refresh days_to_credential_renewal.
      await env.DB.prepare(
        `UPDATE oe_sap_oracle_erp_connector
         SET days_to_credential_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(credDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
