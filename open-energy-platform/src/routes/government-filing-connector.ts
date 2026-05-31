// ═══════════════════════════════════════════════════════════════════════════
// Wave 126 - CIPC / SARS / NERSA Government Filing APIs Connector.
//
// PHASE C WAVE 5 OF 5 - FINAL Phase-C connector wave. The EXTERNAL
// GOVERNMENT FILING spine - bidirectional integration between platform
// and SA regulators: CIPC + SARS + NERSA + DMRE + DFFE + SARB + FIC +
// FSCA + Treasury + Municipal. Real filing types: CIPC Annual Return
// XML, SARS e-Filing (IT14 / VAT201 / EMP201 / IRP5 / PAYE), NERSA
// quarterly (electricity / gas / petroleum), DMRE REIPPPP quarterly,
// DFFE GHG emissions.
//
// Standards: Companies Act 71/2008 s.33, Income Tax Act 58/1962, VAT
// Act 89/1991, ERA 4/2006, Gas Act 48/2001, Petroleum Pipelines Act
// 60/2003, NERSA Levies Act 21/2002, Carbon Tax Act 15/2019, NGER 2017,
// PAIA (Act 2/2000), SARB Exchange Control, FIC Act 38/2001, FSCA
// Conduct Standards, SOC 1 Type II SSAE 18, ISO 27001.
//
// 16 actions: propose_connector / validate_filing_authority /
//   bind_tax_registration / map_filing_template / load_schemas /
//   establish_e_filing_session / validate_test_submission /
//   bind_reconciliation_period / activate_live_filing /
//   acknowledge_filing / archive / disconnect / suspend / resume /
//   revoke_credential / activate_failover.
//
// SIGNATURE Phase-C regulator crossings:
//   revoke_credential -> EVERY tier (W126 SIGNATURE GOVERNMENT-FILING-
//     CONNECTOR-REVOKE hard line)
//   activate_failover -> multi_jurisdiction + systemic_critical
//   disconnect -> EVERY tier WHEN companies_act_lateness_penalty_active
//     OR sars_admin_penalty_active
//   acknowledge_filing -> systemic_critical only
//   sla_breached -> multi_jurisdiction + systemic_critical
//
// Write {admin, regulator, trader, lender, offtaker} (5 writers - KEY
// DIFF from W124/W125 4-writer pattern; regulator JOINS because this
// connector PUSHES TO regulators, so regulator persona has write
// authority over the connector's own state). PUBLIC mTLS-gated peer
// endpoint at /api/government-filing-connector/peer/:peer_id (BEFORE
// authMiddleware) returns a handshake snapshot for trusted
// government_authority_counterparty peers using `x-mtls-cert-fingerprint`
// header.
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
  tierForScope,
  effectiveTier,
  countFloorFlags,
  floorAtMultiJurisdiction,
  floorAtSystemicCritical,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  daysToCredentialRenewal,
  daysToNextFilingDeadline,
  bridgesToW125ErpConnector,
  bridgesToW124SettlementConnector,
  bridgesToW74NersaLevy,
  bridgesToW48CarbonTax,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  connectorHealthBand,
  isKnownFilingAuthority,
  isKnownFilingType,
  GOVERNMENT_FILING_AUTHORITIES,
  GOVERNMENT_FILING_TYPES,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
  type GfcStatus,
  type GfcAction,
  type GfcTier,
  type GovernmentFilingAuthority,
  type GovernmentFilingType,
} from '../utils/government-filing-connector-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W126 = admin + regulator + trader + lender + offtaker write (5 writers).
// KEY DIFF from W124/W125 4-writer pattern: regulator persona JOINS
// because this connector PUSHES TO regulators.
const WRITE_ROLES = new Set(['admin', 'regulator', 'trader', 'lender', 'offtaker']);

type CompaniesActStatus = 'current' | 'pending' | 'overdue';
type SarsClearanceStatus = 'active' | 'pending' | 'revoked';
type NersaLevyStatus = 'current' | 'arrears';
type DffeGhgStatus = 'under' | 'over';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface GfcRow {
  id: string;
  connector_number: string;
  peer_id: string;
  counterparty_name: string | null;
  filing_authority: GovernmentFilingAuthority | string;
  filing_type: GovernmentFilingType | string;
  schema_version: string | null;
  efiling_credential_fingerprint: string | null;
  credential_expiry_at: string | null;
  endpoint_url: string | null;
  tax_registration_number: string | null;
  filing_period: string | null;
  filing_count: number | null;
  jurisdiction_count: number | null;
  national_statutory: number;
  next_filing_deadline_at: string | null;

  w125_erp_connector_ref: string | null;
  w124_settlement_connector_ref: string | null;
  w74_nersa_levy_ref: string | null;
  w48_carbon_tax_ref: string | null;
  w118_block_ref: string | null;

  companies_act_lateness_penalty_active: number;
  sars_admin_penalty_active: number;
  nersa_levy_arrears: number;
  dffe_ghg_threshold_exceeded: number;
  paia_subject_access_request_open: number;

  filings_per_quarter: number | null;
  successful_filing_count_quarter: number | null;
  failed_filing_count_quarter: number | null;
  failure_rate_pct: number | null;
  average_filing_latency_ms: number | null;
  reconciliation_break_count: number | null;
  cipc_compliance_score: number | null;
  sars_compliance_score: number | null;
  nersa_compliance_score: number | null;
  companies_act_filing_status: CompaniesActStatus | null;
  sars_tax_clearance_status: SarsClearanceStatus | null;
  nersa_levy_status: NersaLevyStatus | null;
  dffe_ghg_threshold_status: DffeGhgStatus | null;
  schemas_compliant: number;
  iso27001_controls_ok: number;
  soc1_type2_audit_ok: number;
  control_effectiveness_index: number | null;

  current_tier: GfcTier;
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

  chain_status: GfcStatus;
  connector_proposed_at: string | null;
  filing_authority_validated_at: string | null;
  tax_registration_bound_at: string | null;
  filing_template_mapped_at: string | null;
  schemas_loaded_at: string | null;
  e_filing_session_established_at: string | null;
  test_submission_validated_at: string | null;
  reconciliation_period_bound_at: string | null;
  live_filing_active_at: string | null;
  filing_acknowledged_at: string | null;
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
  days_to_next_filing_deadline: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface GfcEventRow {
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

const TIMESTAMP_COLUMN: Record<GfcStatus, keyof GfcRow | null> = {
  connector_proposed:           'connector_proposed_at',
  filing_authority_validated:   'filing_authority_validated_at',
  tax_registration_bound:       'tax_registration_bound_at',
  filing_template_mapped:       'filing_template_mapped_at',
  schemas_loaded:               'schemas_loaded_at',
  e_filing_session_established: 'e_filing_session_established_at',
  test_submission_validated:    'test_submission_validated_at',
  reconciliation_period_bound:  'reconciliation_period_bound_at',
  live_filing_active:           'live_filing_active_at',
  filing_acknowledged:          'filing_acknowledged_at',
  archived:                     'archived_at',
  disconnected:                 'disconnected_at',
  suspended:                    'suspended_at',
  failover_active:              'failover_activated_at',
  credential_revoked:           'credential_revoked_at',
};

function statusEnteredAt(row: GfcRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.connector_proposed_at ? new Date(row.connector_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.connector_proposed_at ? new Date(row.connector_proposed_at) : null);
}

function rowFloorFlags(row: GfcRow) {
  return {
    companies_act_lateness_penalty_active: row.companies_act_lateness_penalty_active,
    sars_admin_penalty_active:             row.sars_admin_penalty_active,
    nersa_levy_arrears:                    row.nersa_levy_arrears,
    dffe_ghg_threshold_exceeded:           row.dffe_ghg_threshold_exceeded,
    paia_subject_access_request_open:      row.paia_subject_access_request_open,
  };
}

function decorate(row: GfcRow, now: Date) {
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
  const deadlineDays = daysToNextFilingDeadline(row.next_filing_deadline_at, now);

  const floorFlags = countFloorFlags(flags);
  const floorMultiJuris = floorAtMultiJurisdiction(flags);
  const floorSystemic = floorAtSystemicCritical(flags);

  const controlLive = controlEffectivenessIndex({
    filings_per_quarter:             row.filings_per_quarter,
    successful_filing_count_quarter: row.successful_filing_count_quarter,
    failed_filing_count_quarter:     row.failed_filing_count_quarter,
    failure_rate_pct:                row.failure_rate_pct,
    average_filing_latency_ms:       row.average_filing_latency_ms,
    reconciliation_break_count:      row.reconciliation_break_count,
    cipc_compliance_score:           row.cipc_compliance_score,
    sars_compliance_score:           row.sars_compliance_score,
    nersa_compliance_score:          row.nersa_compliance_score,
    companies_act_filing_status:     row.companies_act_filing_status,
    sars_tax_clearance_status:       row.sars_tax_clearance_status,
    nersa_levy_status:               row.nersa_levy_status,
    dffe_ghg_threshold_status:       row.dffe_ghg_threshold_status,
    schemas_compliant:               row.schemas_compliant,
    iso27001_controls_ok:            row.iso27001_controls_ok,
    soc1_type2_audit_ok:             row.soc1_type2_audit_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = connectorHealthBand(
    status,
    controlLive,
    !!row.sla_breached || slaBreachedLive,
    credDays,
    flags,
    row.failure_rate_pct ?? 0,
    row.companies_act_filing_status,
    row.sars_tax_clearance_status,
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
    days_to_next_filing_deadline_live: deadlineDays,
    floor_flag_count_live: floorFlags,
    floor_at_multi_jurisdiction_live: floorMultiJuris,
    floor_at_systemic_critical_live: floorSystemic,
    control_effectiveness_index_live: controlLive,
    connector_health_band_live: healthLive,
    bridges_to_w125_erp_connector_live: bridgesToW125ErpConnector(row.w125_erp_connector_ref),
    bridges_to_w124_settlement_connector_live: bridgesToW124SettlementConnector(row.w124_settlement_connector_ref),
    bridges_to_w74_nersa_levy_live: bridgesToW74NersaLevy(row.w74_nersa_levy_ref),
    bridges_to_w48_carbon_tax_live: bridgesToW48CarbonTax(row.w48_carbon_tax_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// ─── PUBLIC mTLS peer endpoint (NO Bearer auth) ─────────────────────────
//
// GET /api/government-filing-connector/peer/:peer_id with header
// `x-mtls-cert-fingerprint` (W122/W123/W124/W125/W126 Phase-C consistency).
// Returns a handshake snapshot for the trusted government_authority_
// counterparty.
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
    'SELECT * FROM oe_government_filing_connector WHERE peer_id = ?',
  ).bind(peerId).first<GfcRow>();
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
        filing_authority: row.filing_authority,
        filing_type: row.filing_type,
        schema_version: row.schema_version,
        endpoint_url: row.endpoint_url,
        chain_status: row.chain_status,
        current_tier: row.current_tier,
        connector_health_band_live: decorated.connector_health_band_live,
        control_effectiveness_index_live: decorated.control_effectiveness_index_live,
        sla_breached_live: decorated.sla_breached_live,
        companies_act_filing_status: row.companies_act_filing_status,
        sars_tax_clearance_status: row.sars_tax_clearance_status,
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

  const tier             = c.req.query('tier');
  const status           = c.req.query('status');
  const filing_authority = c.req.query('filing_authority');
  const filing_type      = c.req.query('filing_type');
  const cipc             = c.req.query('cipc');
  const health           = c.req.query('health_band');
  const breached         = c.req.query('breached');
  const reportable       = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_government_filing_connector WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)             { sql += ' AND current_tier = ?';     binds.push(tier); }
  if (status)           { sql += ' AND chain_status = ?';     binds.push(status); }
  if (filing_authority) { sql += ' AND filing_authority = ?'; binds.push(filing_authority); }
  if (filing_type)      { sql += ' AND filing_type = ?';      binds.push(filing_type); }
  if (cipc)             { sql += ' AND companies_act_filing_status = ?'; binds.push(cipc); }
  if (health)           { sql += ' AND connector_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<GfcRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_filing_authority: Record<string, number> = {};
  const by_filing_type: Record<string, number> = {};
  const by_cipc: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_filing_authority[i.filing_authority as string] = (by_filing_authority[i.filing_authority as string] || 0) + 1;
    by_filing_type[i.filing_type as string] = (by_filing_type[i.filing_type as string] || 0) + 1;
    if (i.companies_act_filing_status) by_cipc[i.companies_act_filing_status as string] = (by_cipc[i.companies_act_filing_status as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.connector_health_band_live] = (by_health[i.connector_health_band_live] || 0) + 1;
  }

  const active_count       = items.filter((i) => !i.is_terminal).length;
  const proposed_count     = items.filter((i) => i.chain_status === 'connector_proposed').length;
  const authority_v_count  = items.filter((i) => i.chain_status === 'filing_authority_validated').length;
  const tax_bound_count    = items.filter((i) => i.chain_status === 'tax_registration_bound').length;
  const template_count     = items.filter((i) => i.chain_status === 'filing_template_mapped').length;
  const schemas_count      = items.filter((i) => i.chain_status === 'schemas_loaded').length;
  const session_count      = items.filter((i) => i.chain_status === 'e_filing_session_established').length;
  const test_count         = items.filter((i) => i.chain_status === 'test_submission_validated').length;
  const recon_bound_count  = items.filter((i) => i.chain_status === 'reconciliation_period_bound').length;
  const live_count         = items.filter((i) => i.chain_status === 'live_filing_active').length;
  const ack_count          = items.filter((i) => i.chain_status === 'filing_acknowledged').length;
  const archived_count     = items.filter((i) => i.chain_status === 'archived').length;
  const disconnected_count = items.filter((i) => i.chain_status === 'disconnected').length;
  const revoked_count      = items.filter((i) => i.chain_status === 'credential_revoked').length;
  const suspended_count    = items.filter((i) => i.chain_status === 'suspended').length;
  const failover_count     = items.filter((i) => i.chain_status === 'failover_active').length;
  const breached_count     = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total   = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged       = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w125_bridged       = items.filter((i) => i.bridges_to_w125_erp_connector_live).length;
  const w124_bridged       = items.filter((i) => i.bridges_to_w124_settlement_connector_live).length;
  const w74_bridged        = items.filter((i) => i.bridges_to_w74_nersa_levy_live).length;
  const w48_bridged        = items.filter((i) => i.bridges_to_w48_carbon_tax_live).length;
  const control_avg        = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.control_effectiveness_index_live || 0), 0) / items.length)
    : 0;
  const creds_expiring_60d = items.filter((i) => (i.days_to_credential_renewal_live ?? 9999) < 60).length;
  const creds_expiring_14d = items.filter((i) => (i.days_to_credential_renewal_live ?? 9999) < 14).length;
  const deadlines_within_30d = items.filter((i) => (i.days_to_next_filing_deadline_live ?? 9999) < 30).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_filing_authority,
      by_filing_type,
      by_cipc,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      authority_v_count,
      tax_bound_count,
      template_count,
      schemas_count,
      session_count,
      test_count,
      recon_bound_count,
      live_count,
      ack_count,
      archived_count,
      disconnected_count,
      revoked_count,
      suspended_count,
      failover_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w125_bridged_count: w125_bridged,
      w124_bridged_count: w124_bridged,
      w74_bridged_count: w74_bridged,
      w48_bridged_count: w48_bridged,
      w118_bridged_count: w118_bridged,
      control_effectiveness_avg: control_avg,
      creds_expiring_within_60d: creds_expiring_60d,
      creds_expiring_within_14d: creds_expiring_14d,
      deadlines_within_30d,
      government_filing_authorities: GOVERNMENT_FILING_AUTHORITIES,
      government_filing_types: GOVERNMENT_FILING_TYPES,
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
    `SELECT chain_status, current_tier, connector_health_band, filing_authority, filing_type,
            companies_act_filing_status, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_government_filing_connector
     GROUP BY chain_status, current_tier, connector_health_band, filing_authority, filing_type,
              companies_act_filing_status, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; connector_health_band: string | null;
    filing_authority: string | null; filing_type: string | null;
    companies_act_filing_status: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_filing_authority: Record<string, number> = {};
  const by_filing_type: Record<string, number> = {};
  const by_cipc: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.connector_health_band) by_health[r.connector_health_band] = (by_health[r.connector_health_band] || 0) + r.n;
    if (r.filing_authority) by_filing_authority[r.filing_authority] = (by_filing_authority[r.filing_authority] || 0) + r.n;
    if (r.filing_type) by_filing_type[r.filing_type] = (by_filing_type[r.filing_type] || 0) + r.n;
    if (r.companies_act_filing_status) by_cipc[r.companies_act_filing_status] = (by_cipc[r.companies_act_filing_status] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_filing_authority, by_filing_type, by_cipc,
      by_regulator_relevant, by_sla_breached,
      government_filing_authorities: GOVERNMENT_FILING_AUTHORITIES,
      government_filing_types: GOVERNMENT_FILING_TYPES,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_government_filing_connector WHERE id = ?').bind(id).first<GfcRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_government_filing_connector_events WHERE connector_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<GfcEventRow>();

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
  filing_authority?: GovernmentFilingAuthority;
  filing_type?: GovernmentFilingType;
  schema_version?: string;
  efiling_credential_fingerprint?: string;
  credential_expiry_at?: string;
  endpoint_url?: string;
  tax_registration_number?: string;
  filing_period?: string;
  filing_count?: number;
  jurisdiction_count?: number;
  national_statutory?: boolean | number;
  next_filing_deadline_at?: string;

  w125_erp_connector_ref?: string;
  w124_settlement_connector_ref?: string;
  w74_nersa_levy_ref?: string;
  w48_carbon_tax_ref?: string;
  w118_block_ref?: string;

  companies_act_lateness_penalty_active?: boolean | number;
  sars_admin_penalty_active?: boolean | number;
  nersa_levy_arrears?: boolean | number;
  dffe_ghg_threshold_exceeded?: boolean | number;
  paia_subject_access_request_open?: boolean | number;

  filings_per_quarter?: number;
  successful_filing_count_quarter?: number;
  failed_filing_count_quarter?: number;
  failure_rate_pct?: number;
  average_filing_latency_ms?: number;
  reconciliation_break_count?: number;
  cipc_compliance_score?: number;
  sars_compliance_score?: number;
  nersa_compliance_score?: number;
  companies_act_filing_status?: CompaniesActStatus;
  sars_tax_clearance_status?: SarsClearanceStatus;
  nersa_levy_status?: NersaLevyStatus;
  dffe_ghg_threshold_status?: DffeGhgStatus;
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

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<GfcRow>): Partial<GfcRow> {
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
  const id = `gfc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const filingAuthority = isKnownFilingAuthority(body.filing_authority)
    ? body.filing_authority
    : 'sars';
  const filingType = isKnownFilingType(body.filing_type)
    ? body.filing_type
    : 'vat201';

  const flags = {
    companies_act_lateness_penalty_active: toFlag(body.companies_act_lateness_penalty_active) ?? 0,
    sars_admin_penalty_active:             toFlag(body.sars_admin_penalty_active) ?? 0,
    nersa_levy_arrears:                    toFlag(body.nersa_levy_arrears) ?? 0,
    dffe_ghg_threshold_exceeded:           toFlag(body.dffe_ghg_threshold_exceeded) ?? 0,
    paia_subject_access_request_open:      toFlag(body.paia_subject_access_request_open) ?? 0,
  };
  const rawTier = tierForScope({
    filing_count: body.filing_count,
    jurisdiction_count: body.jurisdiction_count,
    national_statutory: body.national_statutory,
  });
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('connector_proposed', tier, now);
  const slaHrs = slaWindowHours('connector_proposed', tier);
  const credDays = daysToCredentialRenewal(body.credential_expiry_at ?? null, now);
  const deadlineDays = daysToNextFilingDeadline(body.next_filing_deadline_at ?? null, now);

  // Connector number = GFC-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_government_filing_connector`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const ccNum = `GFC-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const peerId = body.peer_id ?? `auth-peer-${id.slice(4)}`;

  const controlInit = controlEffectivenessIndex({
    companies_act_filing_status: body.companies_act_filing_status ?? null,
    sars_tax_clearance_status:   body.sars_tax_clearance_status ?? null,
    nersa_levy_status:           body.nersa_levy_status ?? null,
    dffe_ghg_threshold_status:   body.dffe_ghg_threshold_status ?? null,
    schemas_compliant:           toFlag(body.schemas_compliant),
    iso27001_controls_ok:        toFlag(body.iso27001_controls_ok),
    soc1_type2_audit_ok:         toFlag(body.soc1_type2_audit_ok),
  });

  const healthInit = connectorHealthBand(
    'connector_proposed',
    controlInit,
    false,
    credDays,
    flags,
    body.failure_rate_pct ?? 0,
    body.companies_act_filing_status ?? null,
    body.sars_tax_clearance_status ?? null,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_government_filing_connector (
      id, connector_number, peer_id, counterparty_name, filing_authority, filing_type,
      schema_version, efiling_credential_fingerprint, credential_expiry_at,
      endpoint_url, tax_registration_number, filing_period, filing_count,
      jurisdiction_count, national_statutory, next_filing_deadline_at,
      w125_erp_connector_ref, w124_settlement_connector_ref, w74_nersa_levy_ref,
      w48_carbon_tax_ref, w118_block_ref,
      companies_act_lateness_penalty_active, sars_admin_penalty_active, nersa_levy_arrears,
      dffe_ghg_threshold_exceeded, paia_subject_access_request_open,
      filings_per_quarter, successful_filing_count_quarter, failed_filing_count_quarter,
      failure_rate_pct, average_filing_latency_ms, reconciliation_break_count,
      cipc_compliance_score, sars_compliance_score, nersa_compliance_score,
      companies_act_filing_status, sars_tax_clearance_status,
      nersa_levy_status, dffe_ghg_threshold_status,
      schemas_compliant, iso27001_controls_ok, soc1_type2_audit_ok,
      control_effectiveness_index,
      current_tier, authority_required, urgency_band, connector_health_band,
      title, is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, connector_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_credential_renewal, days_to_next_filing_deadline,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ccNum, peerId, body.counterparty_name ?? null, filingAuthority, filingType,
    body.schema_version ?? null,
    body.efiling_credential_fingerprint
      ? body.efiling_credential_fingerprint.replace(/[:\s-]/g, '').toLowerCase()
      : null,
    body.credential_expiry_at ?? null,
    body.endpoint_url ?? null,
    body.tax_registration_number ?? null,
    body.filing_period ?? null,
    body.filing_count ?? null, body.jurisdiction_count ?? null,
    toFlag(body.national_statutory) ?? 0,
    body.next_filing_deadline_at ?? null,
    body.w125_erp_connector_ref ?? null, body.w124_settlement_connector_ref ?? null,
    body.w74_nersa_levy_ref ?? null, body.w48_carbon_tax_ref ?? null,
    body.w118_block_ref ?? null,
    flags.companies_act_lateness_penalty_active, flags.sars_admin_penalty_active,
    flags.nersa_levy_arrears, flags.dffe_ghg_threshold_exceeded,
    flags.paia_subject_access_request_open,
    body.filings_per_quarter ?? null, body.successful_filing_count_quarter ?? null,
    body.failed_filing_count_quarter ?? null, body.failure_rate_pct ?? null,
    body.average_filing_latency_ms ?? null, body.reconciliation_break_count ?? null,
    body.cipc_compliance_score ?? null, body.sars_compliance_score ?? null,
    body.nersa_compliance_score ?? null,
    body.companies_act_filing_status ?? null, body.sars_tax_clearance_status ?? null,
    body.nersa_levy_status ?? null, body.dffe_ghg_threshold_status ?? null,
    toFlag(body.schemas_compliant) ?? 0, toFlag(body.iso27001_controls_ok) ?? 0,
    toFlag(body.soc1_type2_audit_ok) ?? 0, controlInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs, flags), healthInit,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'connector_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    credDays, deadlineDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `government_filing_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_government_filing_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'government_filing_connector_proposed',
    null, 'connector_proposed', null, tier,
    user.id, partyForAction('propose_connector'),
    null, JSON.stringify({ tier, filing_authority: filingAuthority, filing_type: filingType, peer_id: peerId, counterparty_name: body.counterparty_name }), nowIso,
  ).run();

  await fireCascade({
    event: 'government_filing_connector_proposed',
    actor_id: user.id,
    entity_type: 'government_filing_connector',
    entity_id: id,
    data: { tier, filing_authority: filingAuthority, filing_type: filingType, peer_id: peerId, chain_status: 'connector_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_government_filing_connector WHERE id = ?').bind(id).first<GfcRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: GfcAction,
  bodyHandler?: (row: GfcRow, body: Record<string, unknown>) => Partial<GfcRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_government_filing_connector WHERE id = ?').bind(id).first<GfcRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from (filing_count, jurisdiction_count, national_statutory) + 5 floor flags.
  const filingCount =
    (overrides.filing_count as number | undefined) ?? row.filing_count;
  const jurisCount =
    (overrides.jurisdiction_count as number | undefined) ?? row.jurisdiction_count;
  const nationalStatutory =
    (overrides.national_statutory as number | undefined) ?? row.national_statutory;
  const rawTier = tierForScope({
    filing_count: filingCount,
    jurisdiction_count: jurisCount,
    national_statutory: nationalStatutory,
  });
  const floorFlags = {
    companies_act_lateness_penalty_active:
      (overrides.companies_act_lateness_penalty_active as number | undefined)
        ?? row.companies_act_lateness_penalty_active,
    sars_admin_penalty_active:
      (overrides.sars_admin_penalty_active as number | undefined)
        ?? row.sars_admin_penalty_active,
    nersa_levy_arrears:
      (overrides.nersa_levy_arrears as number | undefined) ?? row.nersa_levy_arrears,
    dffe_ghg_threshold_exceeded:
      (overrides.dffe_ghg_threshold_exceeded as number | undefined)
        ?? row.dffe_ghg_threshold_exceeded,
    paia_subject_access_request_open:
      (overrides.paia_subject_access_request_open as number | undefined)
        ?? row.paia_subject_access_request_open,
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

  // Re-derive control effectiveness + days_to_credential_renewal + days_to_next_filing_deadline.
  const credExpiry = (overrides.credential_expiry_at as string | undefined) ?? row.credential_expiry_at;
  const credDays = daysToCredentialRenewal(credExpiry, now);
  overrides.days_to_credential_renewal = credDays;
  const deadlineAt = (overrides.next_filing_deadline_at as string | undefined) ?? row.next_filing_deadline_at;
  const deadlineDays = daysToNextFilingDeadline(deadlineAt, now);
  overrides.days_to_next_filing_deadline = deadlineDays;

  const cipcEff =
    (overrides.companies_act_filing_status as CompaniesActStatus | undefined) ?? row.companies_act_filing_status;
  const sarsEff =
    (overrides.sars_tax_clearance_status as SarsClearanceStatus | undefined) ?? row.sars_tax_clearance_status;
  const nersaEff =
    (overrides.nersa_levy_status as NersaLevyStatus | undefined) ?? row.nersa_levy_status;
  const dffeEff =
    (overrides.dffe_ghg_threshold_status as DffeGhgStatus | undefined) ?? row.dffe_ghg_threshold_status;

  const controlScore = controlEffectivenessIndex({
    filings_per_quarter:
      (overrides.filings_per_quarter as number | undefined) ?? row.filings_per_quarter,
    successful_filing_count_quarter:
      (overrides.successful_filing_count_quarter as number | undefined) ?? row.successful_filing_count_quarter,
    failed_filing_count_quarter:
      (overrides.failed_filing_count_quarter as number | undefined) ?? row.failed_filing_count_quarter,
    failure_rate_pct:
      (overrides.failure_rate_pct as number | undefined) ?? row.failure_rate_pct,
    average_filing_latency_ms:
      (overrides.average_filing_latency_ms as number | undefined) ?? row.average_filing_latency_ms,
    reconciliation_break_count:
      (overrides.reconciliation_break_count as number | undefined) ?? row.reconciliation_break_count,
    cipc_compliance_score:
      (overrides.cipc_compliance_score as number | undefined) ?? row.cipc_compliance_score,
    sars_compliance_score:
      (overrides.sars_compliance_score as number | undefined) ?? row.sars_compliance_score,
    nersa_compliance_score:
      (overrides.nersa_compliance_score as number | undefined) ?? row.nersa_compliance_score,
    companies_act_filing_status: cipcEff,
    sars_tax_clearance_status:   sarsEff,
    nersa_levy_status:           nersaEff,
    dffe_ghg_threshold_status:   dffeEff,
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
    cipcEff,
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
    `UPDATE oe_government_filing_connector SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `government_filing_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_government_filing_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `government_filing_connector_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'government_filing_connector',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_government_filing_connector WHERE id = ?').bind(id).first<GfcRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/validate-filing-authority', async (c) => transition(c, 'validate_filing_authority', (_row, body) => {
  const b = body as Partial<CommonBody & {
    endpoint_url?: string;
    counterparty_name?: string;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.endpoint_url === 'string') out.endpoint_url = b.endpoint_url;
  if (typeof b.counterparty_name === 'string') out.counterparty_name = b.counterparty_name;
  return applyCommon(b, out);
}));

app.post('/:id/bind-tax-registration', async (c) => transition(c, 'bind_tax_registration', (_row, body) => {
  const b = body as Partial<CommonBody & {
    tax_registration_number?: string;
    filing_count?: number;
    jurisdiction_count?: number;
    national_statutory?: boolean | number;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.tax_registration_number === 'string') out.tax_registration_number = b.tax_registration_number;
  if (typeof b.filing_count === 'number') out.filing_count = b.filing_count;
  if (typeof b.jurisdiction_count === 'number') out.jurisdiction_count = b.jurisdiction_count;
  const f = toFlag(b.national_statutory); if (f !== undefined) out.national_statutory = f;
  return applyCommon(b, out);
}));

app.post('/:id/map-filing-template', async (c) => transition(c, 'map_filing_template', (_row, body) => {
  const b = body as Partial<CommonBody & {
    filing_period?: string;
    next_filing_deadline_at?: string;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.filing_period === 'string') out.filing_period = b.filing_period;
  if (typeof b.next_filing_deadline_at === 'string') out.next_filing_deadline_at = b.next_filing_deadline_at;
  return applyCommon(b, out);
}));

app.post('/:id/load-schemas', async (c) => transition(c, 'load_schemas', (_row, body) => {
  const b = body as Partial<CommonBody & {
    schema_version?: string;
    schemas_compliant?: boolean | number;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.schema_version === 'string') out.schema_version = b.schema_version;
  const f = toFlag(b.schemas_compliant); if (f !== undefined) out.schemas_compliant = f;
  return applyCommon(b, out);
}));

app.post('/:id/establish-e-filing-session', async (c) => transition(c, 'establish_e_filing_session', (_row, body) => {
  const b = body as Partial<CommonBody & {
    efiling_credential_fingerprint?: string;
    credential_expiry_at?: string;
    iso27001_controls_ok?: boolean | number;
    soc1_type2_audit_ok?: boolean | number;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.efiling_credential_fingerprint === 'string') {
    out.efiling_credential_fingerprint = b.efiling_credential_fingerprint.replace(/[:\s-]/g, '').toLowerCase();
  }
  if (typeof b.credential_expiry_at === 'string') out.credential_expiry_at = b.credential_expiry_at;
  const f1 = toFlag(b.iso27001_controls_ok); if (f1 !== undefined) out.iso27001_controls_ok = f1;
  const f2 = toFlag(b.soc1_type2_audit_ok); if (f2 !== undefined) out.soc1_type2_audit_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/validate-test-submission', async (c) => transition(c, 'validate_test_submission', (_row, body) => {
  const b = body as Partial<CommonBody & {
    average_filing_latency_ms?: number;
    filings_per_quarter?: number;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.average_filing_latency_ms === 'number') out.average_filing_latency_ms = b.average_filing_latency_ms;
  if (typeof b.filings_per_quarter === 'number') out.filings_per_quarter = b.filings_per_quarter;
  return applyCommon(b, out);
}));

app.post('/:id/bind-reconciliation-period', async (c) => transition(c, 'bind_reconciliation_period', (_row, body) => {
  const b = body as Partial<CommonBody & {
    filing_period?: string;
    w125_erp_connector_ref?: string;
    w124_settlement_connector_ref?: string;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.filing_period === 'string') out.filing_period = b.filing_period;
  if (typeof b.w125_erp_connector_ref === 'string') out.w125_erp_connector_ref = b.w125_erp_connector_ref;
  if (typeof b.w124_settlement_connector_ref === 'string') out.w124_settlement_connector_ref = b.w124_settlement_connector_ref;
  return applyCommon(b, out);
}));

app.post('/:id/activate-live-filing', async (c) => transition(c, 'activate_live_filing', (_row, body) => {
  const b = body as Partial<CommonBody & {
    companies_act_filing_status?: CompaniesActStatus;
    sars_tax_clearance_status?: SarsClearanceStatus;
    nersa_levy_status?: NersaLevyStatus;
    dffe_ghg_threshold_status?: DffeGhgStatus;
  }>;
  const out: Partial<GfcRow> = {};
  if (b.companies_act_filing_status) out.companies_act_filing_status = b.companies_act_filing_status;
  if (b.sars_tax_clearance_status) out.sars_tax_clearance_status = b.sars_tax_clearance_status;
  if (b.nersa_levy_status) out.nersa_levy_status = b.nersa_levy_status;
  if (b.dffe_ghg_threshold_status) out.dffe_ghg_threshold_status = b.dffe_ghg_threshold_status;
  return applyCommon(b, out);
}));

app.post('/:id/acknowledge-filing', async (c) => transition(c, 'acknowledge_filing', (_row, body) => {
  const b = body as Partial<CommonBody & {
    successful_filing_count_quarter?: number;
    failed_filing_count_quarter?: number;
    failure_rate_pct?: number;
    reconciliation_break_count?: number;
    cipc_compliance_score?: number;
    sars_compliance_score?: number;
    nersa_compliance_score?: number;
    w125_erp_connector_ref?: string;
    w124_settlement_connector_ref?: string;
    w74_nersa_levy_ref?: string;
    w48_carbon_tax_ref?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.successful_filing_count_quarter === 'number') out.successful_filing_count_quarter = b.successful_filing_count_quarter;
  if (typeof b.failed_filing_count_quarter === 'number')     out.failed_filing_count_quarter = b.failed_filing_count_quarter;
  if (typeof b.failure_rate_pct === 'number')                out.failure_rate_pct = b.failure_rate_pct;
  if (typeof b.reconciliation_break_count === 'number')      out.reconciliation_break_count = b.reconciliation_break_count;
  if (typeof b.cipc_compliance_score === 'number')           out.cipc_compliance_score = b.cipc_compliance_score;
  if (typeof b.sars_compliance_score === 'number')           out.sars_compliance_score = b.sars_compliance_score;
  if (typeof b.nersa_compliance_score === 'number')          out.nersa_compliance_score = b.nersa_compliance_score;
  if (typeof b.w125_erp_connector_ref === 'string')          out.w125_erp_connector_ref = b.w125_erp_connector_ref;
  if (typeof b.w124_settlement_connector_ref === 'string')   out.w124_settlement_connector_ref = b.w124_settlement_connector_ref;
  if (typeof b.w74_nersa_levy_ref === 'string')              out.w74_nersa_levy_ref = b.w74_nersa_levy_ref;
  if (typeof b.w48_carbon_tax_ref === 'string')              out.w48_carbon_tax_ref = b.w48_carbon_tax_ref;
  if (typeof b.w118_block_ref === 'string')                  out.w118_block_ref = b.w118_block_ref;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/disconnect', async (c) => transition(c, 'disconnect', (_row, body) => {
  const b = body as Partial<CommonBody & {
    companies_act_lateness_penalty_active?: boolean | number;
    sars_admin_penalty_active?: boolean | number;
  }>;
  const out: Partial<GfcRow> = {};
  const f1 = toFlag(b.companies_act_lateness_penalty_active); if (f1 !== undefined) out.companies_act_lateness_penalty_active = f1;
  const f2 = toFlag(b.sars_admin_penalty_active); if (f2 !== undefined) out.sars_admin_penalty_active = f2;
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
    paia_subject_access_request_open?: boolean | number;
  }>;
  const out: Partial<GfcRow> = {};
  const f = toFlag(b.paia_subject_access_request_open); if (f !== undefined) out.paia_subject_access_request_open = f;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) => {
  const b = body as Partial<CommonBody & {
    endpoint_url?: string;
  }>;
  const out: Partial<GfcRow> = {};
  if (typeof b.endpoint_url === 'string') out.endpoint_url = b.endpoint_url;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal connector past sla_deadline_at, flips
// sla_breached = 1, bumps escalation_level. Breach crosses regulator
// on multi_jurisdiction + systemic_critical tiers.
export async function governmentFilingConnectorSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_government_filing_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<GfcRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_government_filing_connector
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `government_filing_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_government_filing_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'government_filing_connector_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'compliance_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as GfcTier)) {
      await fireCascade({
        event: 'government_filing_connector_sla_breached',
        actor_id: 'system',
        entity_type: 'government_filing_connector',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily filing-deadline sweep (0 2 * * *) ────────────────────────
//
// 02:00 UTC = 04:00 SAST, ahead of SA business hours. Refreshes LIVE-
// derived persisted fields for every active connector
// (control_effectiveness_index, connector_health_band,
// days_to_credential_renewal, days_to_next_filing_deadline) and flags
// connectors whose next_filing_deadline_at is within 7 days as
// regulator_relevant so financial directors see the day's pending
// deadlines on their morning briefing.
export async function governmentFilingConnectorFilingDeadlineSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged_within_7d: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_government_filing_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')`,
  ).all<GfcRow>();

  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const control = controlEffectivenessIndex({
      filings_per_quarter:             row.filings_per_quarter,
      successful_filing_count_quarter: row.successful_filing_count_quarter,
      failed_filing_count_quarter:     row.failed_filing_count_quarter,
      failure_rate_pct:                row.failure_rate_pct,
      average_filing_latency_ms:       row.average_filing_latency_ms,
      reconciliation_break_count:      row.reconciliation_break_count,
      cipc_compliance_score:           row.cipc_compliance_score,
      sars_compliance_score:           row.sars_compliance_score,
      nersa_compliance_score:          row.nersa_compliance_score,
      companies_act_filing_status:     row.companies_act_filing_status,
      sars_tax_clearance_status:       row.sars_tax_clearance_status,
      nersa_levy_status:               row.nersa_levy_status,
      dffe_ghg_threshold_status:       row.dffe_ghg_threshold_status,
      schemas_compliant:               row.schemas_compliant,
      iso27001_controls_ok:            row.iso27001_controls_ok,
      soc1_type2_audit_ok:             row.soc1_type2_audit_ok,
    });

    const credDays = daysToCredentialRenewal(row.credential_expiry_at, now);
    const deadlineDays = daysToNextFilingDeadline(row.next_filing_deadline_at, now);
    const flags = rowFloorFlags(row);

    const health = connectorHealthBand(
      row.chain_status,
      control,
      !!row.sla_breached,
      credDays,
      flags,
      row.failure_rate_pct ?? 0,
      row.companies_act_filing_status,
      row.sars_tax_clearance_status,
    );

    const regulatorRelevantBump = deadlineDays < 7 ? 1 : row.regulator_relevant;
    const isReportableBump = deadlineDays < 7 ? 1 : row.is_reportable;
    if (deadlineDays < 7) flagged++;

    await env.DB.prepare(
      `UPDATE oe_government_filing_connector
       SET control_effectiveness_index = ?,
           connector_health_band = ?,
           days_to_credential_renewal = ?,
           days_to_next_filing_deadline = ?,
           regulator_relevant = ?,
           is_reportable = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(control, health, credDays, deadlineDays, regulatorRelevantBump, isReportableBump, nowIso, row.id).run();
  }
  return { scanned: rows.length, flagged_within_7d: flagged };
}

// ─── Cron: weekly efiling cert expiry scan (0 7 * * 1) ───────────────────
//
// Monday 09:00 SAST (07:00 UTC). Flags any connector whose efiling
// credential expires within 14 days as regulator_relevant so it surfaces
// in the regulator inbox. SOC 1 Type II + ISO 27001 require pre-renewal
// notification.
export async function governmentFilingConnectorCredentialExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_government_filing_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND credential_expiry_at IS NOT NULL`,
  ).all<GfcRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const credDays = daysToCredentialRenewal(row.credential_expiry_at, now);
    if (credDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_government_filing_connector
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_credential_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(credDays, nowIso, row.id).run();
      flagged++;
    } else {
      await env.DB.prepare(
        `UPDATE oe_government_filing_connector
         SET days_to_credential_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(credDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
