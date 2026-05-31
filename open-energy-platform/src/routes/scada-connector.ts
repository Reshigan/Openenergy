// ═══════════════════════════════════════════════════════════════════════════
// Wave 122 - SCADA / IEC 61850 Substation Connector.
//
// PHASE C OPENER. Closes the audit-namespace family at W121 and opens
// the external-system connector family (W122-W126). Real-time
// bidirectional protocol bridge between the Open Energy Platform and
// IPP / grid SCADA systems.
//
// Standards: IEC 61850 (MMS/GOOSE/SV), IEC 60870-5-104, IEC 62351,
// DNP3 over TCP, Modbus TCP/RTU, IEEE C37.118, OPC UA, NERSA Grid
// Code C-3, SANS 27001, SARB BA 700 (cyber-incident notification).
//
// 16 actions: propose_connector / discover_endpoints / configure_tls /
//   complete_handshake / start_telemetry / validate_quality /
//   subscribe_alarms / authorize_control_commands / go_live /
//   activate_reconciliation / archive / disconnect / suspend / resume /
//   revoke / activate_failover.
//
// SIGNATURE Phase-C regulator crossings:
//   revoke -> EVERY tier (W122 SIGNATURE SCADA-CONNECTOR-REVOKE hard
//     line)
//   activate_failover -> large_substation + national_grid_backbone
//   disconnect -> EVERY tier WHEN critical_substation_n_minus_1
//   authorize_control_commands -> national_grid_backbone only
//   sla_breached -> large_substation + national_grid_backbone
//
// Write {admin, grid_operator, ipp_developer}. PUBLIC mTLS-gated peer
// endpoint at /api/scada-connector/peer/:peer_id (BEFORE
// authMiddleware) returns a handshake snapshot for trusted SCADA
// counterparties.
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
  tierForCapacity,
  effectiveTier,
  countFloorFlags,
  floorAtLargeSubstation,
  floorAtNationalGridBackbone,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  daysToCertRenewal,
  bridgesToW110TransmissionOutage,
  bridgesToW50ReserveActivation,
  bridgesToW67GridCodeCompliance,
  bridgesToW26CyberIncident,
  bridgesToW118AuditChain,
  telemetryQualityIndex,
  connectorHealthBand,
  isKnownScadaProtocol,
  SCADA_PROTOCOLS,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
  type SccStatus,
  type SccAction,
  type SccTier,
  type ScadaProtocol,
} from '../utils/scada-connector-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W122 = admin + grid_operator + ipp_developer write.
const WRITE_ROLES = new Set(['admin', 'grid_operator', 'ipp_developer']);

// ─── Row + event interfaces ───────────────────────────────────────────────
interface SccRow {
  id: string;
  connector_number: string;
  peer_id: string;
  substation_name: string;
  substation_capacity_mva: number | null;
  protocol: ScadaProtocol | string;
  endpoint_url: string | null;
  tls_cert_fingerprint: string | null;
  tls_cert_expiry_at: string | null;

  w110_transmission_outage_ref: string | null;
  w50_reserve_activation_ref: string | null;
  w67_grid_code_compliance_ref: string | null;
  w26_cyber_incident_ref: string | null;
  w118_block_ref: string | null;

  peak_demand_window: number;
  black_start_path_required: number;
  cross_border_link: number;
  nersa_grid_code_compliance: number;
  critical_substation_n_minus_1: number;

  // Telemetry quality components.
  logical_node_count: number | null;
  data_object_count: number | null;
  messages_per_minute: number | null;
  signal_to_noise_db: number | null;
  latency_p50_ms: number | null;
  latency_p99_ms: number | null;
  jitter_ms: number | null;
  packet_loss_pct: number | null;
  tls_cert_valid: number;
  iec_62351_cipher_ok: number;
  protocol_compliant: number;
  telemetry_quality_index: number | null;

  current_tier: SccTier;
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

  chain_status: SccStatus;
  connector_proposed_at: string | null;
  endpoints_discovered_at: string | null;
  tls_configured_at: string | null;
  handshake_completed_at: string | null;
  telemetry_streaming_at: string | null;
  quality_validated_at: string | null;
  alarms_subscribed_at: string | null;
  control_commands_authorized_at: string | null;
  live_operations_at: string | null;
  reconciliation_active_at: string | null;
  archived_at: string | null;
  disconnected_at: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
  failover_activated_at: string | null;
  regulator_crossed_at: string | null;

  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_cert_renewal: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SccEventRow {
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

const TIMESTAMP_COLUMN: Record<SccStatus, keyof SccRow | null> = {
  connector_proposed:           'connector_proposed_at',
  endpoints_discovered:         'endpoints_discovered_at',
  tls_configured:               'tls_configured_at',
  handshake_completed:          'handshake_completed_at',
  telemetry_streaming:          'telemetry_streaming_at',
  quality_validated:            'quality_validated_at',
  alarms_subscribed:            'alarms_subscribed_at',
  control_commands_authorized:  'control_commands_authorized_at',
  live_operations:              'live_operations_at',
  reconciliation_active:        'reconciliation_active_at',
  archived:                     'archived_at',
  disconnected:                 'disconnected_at',
  suspended:                    'suspended_at',
  failover_active:              'failover_activated_at',
  revoked:                      'revoked_at',
};

function statusEnteredAt(row: SccRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.connector_proposed_at ? new Date(row.connector_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.connector_proposed_at ? new Date(row.connector_proposed_at) : null);
}

function rowFloorFlags(row: SccRow) {
  return {
    peak_demand_window:             row.peak_demand_window,
    black_start_path_required:      row.black_start_path_required,
    cross_border_link:              row.cross_border_link,
    nersa_grid_code_compliance:     row.nersa_grid_code_compliance,
    critical_substation_n_minus_1:  row.critical_substation_n_minus_1,
  };
}

function decorate(row: SccRow, now: Date) {
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
  const certDays = daysToCertRenewal(row.tls_cert_expiry_at, now);

  const flags = rowFloorFlags(row);
  const floorFlags = countFloorFlags(flags);
  const floorLarge = floorAtLargeSubstation(flags);
  const floorNational = floorAtNationalGridBackbone(flags);

  const telemetryLive = telemetryQualityIndex({
    logical_node_count:     row.logical_node_count,
    data_object_count:      row.data_object_count,
    messages_per_minute:    row.messages_per_minute,
    signal_to_noise_db:     row.signal_to_noise_db,
    latency_p50_ms:         row.latency_p50_ms,
    latency_p99_ms:         row.latency_p99_ms,
    jitter_ms:              row.jitter_ms,
    packet_loss_pct:        row.packet_loss_pct,
    tls_cert_valid:         row.tls_cert_valid,
    iec_62351_cipher_ok:    row.iec_62351_cipher_ok,
    protocol_compliant:     row.protocol_compliant,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = connectorHealthBand(
    status,
    telemetryLive,
    !!row.sla_breached || slaBreachedLive,
    certDays,
    flags,
    row.packet_loss_pct ?? 0,
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
    days_to_cert_renewal_live: certDays,
    floor_flag_count_live: floorFlags,
    floor_at_large_substation_live: floorLarge,
    floor_at_national_grid_backbone_live: floorNational,
    telemetry_quality_index_live: telemetryLive,
    connector_health_band_live: healthLive,
    bridges_to_w110_transmission_outage_live: bridgesToW110TransmissionOutage(row.w110_transmission_outage_ref),
    bridges_to_w50_reserve_activation_live: bridgesToW50ReserveActivation(row.w50_reserve_activation_ref),
    bridges_to_w67_grid_code_compliance_live: bridgesToW67GridCodeCompliance(row.w67_grid_code_compliance_ref),
    bridges_to_w26_cyber_incident_live: bridgesToW26CyberIncident(row.w26_cyber_incident_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// ─── PUBLIC mTLS peer endpoint (NO Bearer auth) ─────────────────────────
//
// GET /api/scada-connector/peer/:peer_id with header
// `cf-client-cert-sha256` (or `x-mtls-cert-fingerprint`) set by the
// Cloudflare edge after mTLS handshake. Returns a handshake snapshot
// for the trusted SCADA counterparty (no Bearer-JWT auth).
const publicApp = new Hono<HonoEnv>();

publicApp.get('/peer/:peer_id', async (c) => {
  const peerId = c.req.param('peer_id');
  const fingerprint =
    c.req.header('cf-client-cert-sha256') ||
    c.req.header('x-mtls-cert-fingerprint') ||
    '';
  if (!isValidMtlsFingerprint(fingerprint)) {
    return c.json({ success: false, error: 'mTLS fingerprint missing or malformed' }, 401);
  }
  if (!isAllowedPeerFingerprint(fingerprint)) {
    return c.json({ success: false, error: 'mTLS fingerprint not in trust list' }, 403);
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_scada_connector WHERE peer_id = ?',
  ).bind(peerId).first<SccRow>();
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
        substation_name: row.substation_name,
        protocol: row.protocol,
        endpoint_url: row.endpoint_url,
        chain_status: row.chain_status,
        current_tier: row.current_tier,
        connector_health_band_live: decorated.connector_health_band_live,
        telemetry_quality_index_live: decorated.telemetry_quality_index_live,
        sla_breached_live: decorated.sla_breached_live,
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
  const health     = c.req.query('health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_scada_connector WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)     { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)   { sql += ' AND chain_status = ?'; binds.push(status); }
  if (protocol) { sql += ' AND protocol = ?'; binds.push(protocol); }
  if (health)   { sql += ' AND connector_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SccRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_protocol[i.protocol as string] = (by_protocol[i.protocol as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.connector_health_band_live] = (by_health[i.connector_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'connector_proposed').length;
  const discovered_count    = items.filter((i) => i.chain_status === 'endpoints_discovered').length;
  const tls_count           = items.filter((i) => i.chain_status === 'tls_configured').length;
  const handshake_count     = items.filter((i) => i.chain_status === 'handshake_completed').length;
  const streaming_count     = items.filter((i) => i.chain_status === 'telemetry_streaming').length;
  const validated_count     = items.filter((i) => i.chain_status === 'quality_validated').length;
  const alarms_count        = items.filter((i) => i.chain_status === 'alarms_subscribed').length;
  const authorized_count    = items.filter((i) => i.chain_status === 'control_commands_authorized').length;
  const live_count          = items.filter((i) => i.chain_status === 'live_operations').length;
  const reconciliation_cnt  = items.filter((i) => i.chain_status === 'reconciliation_active').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const disconnected_count  = items.filter((i) => i.chain_status === 'disconnected').length;
  const revoked_count       = items.filter((i) => i.chain_status === 'revoked').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const failover_count      = items.filter((i) => i.chain_status === 'failover_active').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w110_bridged        = items.filter((i) => i.bridges_to_w110_transmission_outage_live).length;
  const w50_bridged         = items.filter((i) => i.bridges_to_w50_reserve_activation_live).length;
  const w67_bridged         = items.filter((i) => i.bridges_to_w67_grid_code_compliance_live).length;
  const w26_bridged         = items.filter((i) => i.bridges_to_w26_cyber_incident_live).length;
  const telemetry_avg       = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.telemetry_quality_index_live || 0), 0) / items.length)
    : 0;
  const certs_expiring_60d  = items.filter((i) => (i.days_to_cert_renewal_live ?? 9999) < 60).length;
  const certs_expiring_14d  = items.filter((i) => (i.days_to_cert_renewal_live ?? 9999) < 14).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_protocol,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      discovered_count,
      tls_count,
      handshake_count,
      streaming_count,
      validated_count,
      alarms_count,
      authorized_count,
      live_count,
      reconciliation_count: reconciliation_cnt,
      archived_count,
      disconnected_count,
      revoked_count,
      suspended_count,
      failover_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w110_bridged_count: w110_bridged,
      w50_bridged_count: w50_bridged,
      w67_bridged_count: w67_bridged,
      w26_bridged_count: w26_bridged,
      w118_bridged_count: w118_bridged,
      telemetry_quality_avg: telemetry_avg,
      certs_expiring_within_60d: certs_expiring_60d,
      certs_expiring_within_14d: certs_expiring_14d,
      scada_protocols: SCADA_PROTOCOLS,
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
            regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_scada_connector
     GROUP BY chain_status, current_tier, connector_health_band, protocol,
              regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; connector_health_band: string | null;
    protocol: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.connector_health_band) by_health[r.connector_health_band] = (by_health[r.connector_health_band] || 0) + r.n;
    if (r.protocol) by_protocol[r.protocol] = (by_protocol[r.protocol] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_protocol,
      by_regulator_relevant, by_sla_breached,
      scada_protocols: SCADA_PROTOCOLS,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_scada_connector WHERE id = ?').bind(id).first<SccRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_scada_connector_events WHERE connector_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SccEventRow>();

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
  substation_name?: string;
  substation_capacity_mva?: number;
  protocol?: ScadaProtocol;
  endpoint_url?: string;
  tls_cert_fingerprint?: string;
  tls_cert_expiry_at?: string;

  w110_transmission_outage_ref?: string;
  w50_reserve_activation_ref?: string;
  w67_grid_code_compliance_ref?: string;
  w26_cyber_incident_ref?: string;
  w118_block_ref?: string;

  peak_demand_window?: boolean | number;
  black_start_path_required?: boolean | number;
  cross_border_link?: boolean | number;
  nersa_grid_code_compliance?: boolean | number;
  critical_substation_n_minus_1?: boolean | number;

  logical_node_count?: number;
  data_object_count?: number;
  messages_per_minute?: number;
  signal_to_noise_db?: number;
  latency_p50_ms?: number;
  latency_p99_ms?: number;
  jitter_ms?: number;
  packet_loss_pct?: number;
  tls_cert_valid?: boolean | number;
  iec_62351_cipher_ok?: boolean | number;
  protocol_compliant?: boolean | number;

  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<SccRow>): Partial<SccRow> {
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
  const id = `scc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const protocol = isKnownScadaProtocol(body.protocol)
    ? body.protocol
    : 'iec_61850_mms';

  const flags = {
    peak_demand_window:             toFlag(body.peak_demand_window) ?? 0,
    black_start_path_required:      toFlag(body.black_start_path_required) ?? 0,
    cross_border_link:              toFlag(body.cross_border_link) ?? 0,
    nersa_grid_code_compliance:     toFlag(body.nersa_grid_code_compliance) ?? 0,
    critical_substation_n_minus_1:  toFlag(body.critical_substation_n_minus_1) ?? 0,
  };
  const rawTier = tierForCapacity(body.substation_capacity_mva);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('connector_proposed', tier, now);
  const slaHrs = slaWindowHours('connector_proposed', tier);
  const certDays = daysToCertRenewal(body.tls_cert_expiry_at ?? null, now);

  // Connector number = SCC-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_scada_connector`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const ccNum = `SCC-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const peerId = body.peer_id ?? `peer-${id.slice(4)}`;

  // Compute initial telemetry score (most fields 0/null on create).
  const telemetryInit = telemetryQualityIndex({
    tls_cert_valid:        toFlag(body.tls_cert_valid),
    iec_62351_cipher_ok:   toFlag(body.iec_62351_cipher_ok),
    protocol_compliant:    toFlag(body.protocol_compliant),
  });

  const healthInit = connectorHealthBand(
    'connector_proposed',
    telemetryInit,
    false,
    certDays,
    flags,
    body.packet_loss_pct ?? 0,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_scada_connector (
      id, connector_number, peer_id, substation_name, substation_capacity_mva,
      protocol, endpoint_url, tls_cert_fingerprint, tls_cert_expiry_at,
      w110_transmission_outage_ref, w50_reserve_activation_ref,
      w67_grid_code_compliance_ref, w26_cyber_incident_ref, w118_block_ref,
      peak_demand_window, black_start_path_required, cross_border_link,
      nersa_grid_code_compliance, critical_substation_n_minus_1,
      logical_node_count, data_object_count, messages_per_minute,
      signal_to_noise_db, latency_p50_ms, latency_p99_ms, jitter_ms,
      packet_loss_pct, tls_cert_valid, iec_62351_cipher_ok, protocol_compliant,
      telemetry_quality_index,
      current_tier, authority_required, urgency_band, connector_health_band,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, connector_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_cert_renewal,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ccNum, peerId, body.substation_name ?? null, body.substation_capacity_mva ?? null,
    protocol, body.endpoint_url ?? null,
    body.tls_cert_fingerprint ? body.tls_cert_fingerprint.replace(/[:\s-]/g, '').toLowerCase() : null,
    body.tls_cert_expiry_at ?? null,
    body.w110_transmission_outage_ref ?? null, body.w50_reserve_activation_ref ?? null,
    body.w67_grid_code_compliance_ref ?? null, body.w26_cyber_incident_ref ?? null,
    body.w118_block_ref ?? null,
    flags.peak_demand_window, flags.black_start_path_required, flags.cross_border_link,
    flags.nersa_grid_code_compliance, flags.critical_substation_n_minus_1,
    body.logical_node_count ?? null, body.data_object_count ?? null,
    body.messages_per_minute ?? null, body.signal_to_noise_db ?? null,
    body.latency_p50_ms ?? null, body.latency_p99_ms ?? null, body.jitter_ms ?? null,
    body.packet_loss_pct ?? null,
    toFlag(body.tls_cert_valid) ?? 0, toFlag(body.iec_62351_cipher_ok) ?? 0,
    toFlag(body.protocol_compliant) ?? 0,
    telemetryInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), healthInit,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'connector_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    certDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `scada_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_scada_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'scada_connector_proposed',
    null, 'connector_proposed', null, tier,
    user.id, partyForAction('propose_connector'),
    null, JSON.stringify({ tier, protocol, peer_id: peerId, substation_name: body.substation_name }), nowIso,
  ).run();

  await fireCascade({
    event: 'scada_connector_proposed',
    actor_id: user.id,
    entity_type: 'scada_connector',
    entity_id: id,
    data: { tier, protocol, peer_id: peerId, chain_status: 'connector_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_scada_connector WHERE id = ?').bind(id).first<SccRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: SccAction,
  bodyHandler?: (row: SccRow, body: Record<string, unknown>) => Partial<SccRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_scada_connector WHERE id = ?').bind(id).first<SccRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from capacity + 5 floor flags (every transition).
  const capacity = (overrides.substation_capacity_mva as number | undefined) ?? row.substation_capacity_mva;
  const rawTier = tierForCapacity(capacity);
  const floorFlags = {
    peak_demand_window:
      (overrides.peak_demand_window as number | undefined) ?? row.peak_demand_window,
    black_start_path_required:
      (overrides.black_start_path_required as number | undefined) ?? row.black_start_path_required,
    cross_border_link:
      (overrides.cross_border_link as number | undefined) ?? row.cross_border_link,
    nersa_grid_code_compliance:
      (overrides.nersa_grid_code_compliance as number | undefined) ?? row.nersa_grid_code_compliance,
    critical_substation_n_minus_1:
      (overrides.critical_substation_n_minus_1 as number | undefined) ?? row.critical_substation_n_minus_1,
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
  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Re-derive telemetry quality + days_to_cert_renewal.
  const certExpiry = (overrides.tls_cert_expiry_at as string | undefined) ?? row.tls_cert_expiry_at;
  const certDays = daysToCertRenewal(certExpiry, now);
  overrides.days_to_cert_renewal = certDays;

  const telemetry = telemetryQualityIndex({
    logical_node_count:
      (overrides.logical_node_count as number | undefined) ?? row.logical_node_count,
    data_object_count:
      (overrides.data_object_count as number | undefined) ?? row.data_object_count,
    messages_per_minute:
      (overrides.messages_per_minute as number | undefined) ?? row.messages_per_minute,
    signal_to_noise_db:
      (overrides.signal_to_noise_db as number | undefined) ?? row.signal_to_noise_db,
    latency_p50_ms:
      (overrides.latency_p50_ms as number | undefined) ?? row.latency_p50_ms,
    latency_p99_ms:
      (overrides.latency_p99_ms as number | undefined) ?? row.latency_p99_ms,
    jitter_ms:
      (overrides.jitter_ms as number | undefined) ?? row.jitter_ms,
    packet_loss_pct:
      (overrides.packet_loss_pct as number | undefined) ?? row.packet_loss_pct,
    tls_cert_valid:
      (overrides.tls_cert_valid as number | undefined) ?? row.tls_cert_valid,
    iec_62351_cipher_ok:
      (overrides.iec_62351_cipher_ok as number | undefined) ?? row.iec_62351_cipher_ok,
    protocol_compliant:
      (overrides.protocol_compliant as number | undefined) ?? row.protocol_compliant,
  });
  overrides.telemetry_quality_index = telemetry;

  // Health band composite.
  const packetLossEff = (overrides.packet_loss_pct as number | undefined) ?? row.packet_loss_pct ?? 0;
  overrides.connector_health_band = connectorHealthBand(
    to,
    telemetry,
    !!row.sla_breached,
    certDays,
    floorFlags,
    packetLossEff,
  );

  // SIGNATURE crossings - revoke EVERY tier; activate_failover heavy
  // only; disconnect EVERY tier when critical_substation_n_minus_1;
  // authorize_control_commands national only.
  const crosses = crossesIntoRegulator(action, tier, { flags: floorFlags });
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
    `UPDATE oe_scada_connector SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `scada_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_scada_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `scada_connector_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'scada_connector',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_scada_connector WHERE id = ?').bind(id).first<SccRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/discover-endpoints', async (c) => transition(c, 'discover_endpoints', (_row, body) => {
  const b = body as Partial<CommonBody & {
    endpoint_url?: string;
    logical_node_count?: number;
    data_object_count?: number;
  }>;
  const out: Partial<SccRow> = {};
  if (typeof b.endpoint_url === 'string')        out.endpoint_url = b.endpoint_url;
  if (typeof b.logical_node_count === 'number')  out.logical_node_count = b.logical_node_count;
  if (typeof b.data_object_count === 'number')   out.data_object_count = b.data_object_count;
  return applyCommon(b, out);
}));

app.post('/:id/configure-tls', async (c) => transition(c, 'configure_tls', (_row, body) => {
  const b = body as Partial<CommonBody & {
    tls_cert_fingerprint?: string;
    tls_cert_expiry_at?: string;
    tls_cert_valid?: boolean | number;
    iec_62351_cipher_ok?: boolean | number;
  }>;
  const out: Partial<SccRow> = {};
  if (typeof b.tls_cert_fingerprint === 'string') {
    out.tls_cert_fingerprint = b.tls_cert_fingerprint.replace(/[:\s-]/g, '').toLowerCase();
  }
  if (typeof b.tls_cert_expiry_at === 'string')   out.tls_cert_expiry_at = b.tls_cert_expiry_at;
  const f1 = toFlag(b.tls_cert_valid); if (f1 !== undefined) out.tls_cert_valid = f1;
  const f2 = toFlag(b.iec_62351_cipher_ok); if (f2 !== undefined) out.iec_62351_cipher_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/complete-handshake', async (c) => transition(c, 'complete_handshake', (_row, body) => {
  const b = body as Partial<CommonBody & { protocol_compliant?: boolean | number }>;
  const out: Partial<SccRow> = {};
  const f = toFlag(b.protocol_compliant); if (f !== undefined) out.protocol_compliant = f;
  return applyCommon(b, out);
}));

app.post('/:id/start-telemetry', async (c) => transition(c, 'start_telemetry', (_row, body) => {
  const b = body as Partial<CommonBody & {
    messages_per_minute?: number;
    signal_to_noise_db?: number;
  }>;
  const out: Partial<SccRow> = {};
  if (typeof b.messages_per_minute === 'number')  out.messages_per_minute = b.messages_per_minute;
  if (typeof b.signal_to_noise_db === 'number')   out.signal_to_noise_db = b.signal_to_noise_db;
  return applyCommon(b, out);
}));

app.post('/:id/validate-quality', async (c) => transition(c, 'validate_quality', (_row, body) => {
  const b = body as Partial<CommonBody & {
    latency_p50_ms?: number;
    latency_p99_ms?: number;
    jitter_ms?: number;
    packet_loss_pct?: number;
  }>;
  const out: Partial<SccRow> = {};
  if (typeof b.latency_p50_ms === 'number')  out.latency_p50_ms = b.latency_p50_ms;
  if (typeof b.latency_p99_ms === 'number')  out.latency_p99_ms = b.latency_p99_ms;
  if (typeof b.jitter_ms === 'number')       out.jitter_ms = b.jitter_ms;
  if (typeof b.packet_loss_pct === 'number') out.packet_loss_pct = b.packet_loss_pct;
  return applyCommon(b, out);
}));

app.post('/:id/subscribe-alarms', async (c) => transition(c, 'subscribe_alarms', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/authorize-control-commands', async (c) => transition(c, 'authorize_control_commands', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/go-live', async (c) => transition(c, 'go_live', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/activate-reconciliation', async (c) => transition(c, 'activate_reconciliation', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/disconnect', async (c) => transition(c, 'disconnect', (_row, body) => {
  const b = body as Partial<CommonBody & {
    w110_transmission_outage_ref?: string;
    w26_cyber_incident_ref?: string;
  }>;
  const out: Partial<SccRow> = {};
  if (typeof b.w110_transmission_outage_ref === 'string') out.w110_transmission_outage_ref = b.w110_transmission_outage_ref;
  if (typeof b.w26_cyber_incident_ref === 'string')       out.w26_cyber_incident_ref = b.w26_cyber_incident_ref;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/revoke', async (c) => transition(c, 'revoke', (_row, body) => {
  const b = body as Partial<CommonBody & { w26_cyber_incident_ref?: string }>;
  const out: Partial<SccRow> = {};
  if (typeof b.w26_cyber_incident_ref === 'string') out.w26_cyber_incident_ref = b.w26_cyber_incident_ref;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) => {
  const b = body as Partial<CommonBody & { w50_reserve_activation_ref?: string }>;
  const out: Partial<SccRow> = {};
  if (typeof b.w50_reserve_activation_ref === 'string') out.w50_reserve_activation_ref = b.w50_reserve_activation_ref;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal connector past sla_deadline_at, flips
// sla_breached = 1, bumps escalation_level. Breach crosses regulator
// on large_substation + national_grid_backbone tiers.
export async function scadaConnectorSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_scada_connector
     WHERE chain_status NOT IN ('archived','disconnected','revoked')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SccRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_scada_connector
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `scada_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_scada_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'scada_connector_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'connector_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as SccTier)) {
      await fireCascade({
        event: 'scada_connector_sla_breached',
        actor_id: 'system',
        entity_type: 'scada_connector',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: nightly telemetry quality recompute (45 0 * * *) ───────────────
//
// Refreshes LIVE-derived persisted fields for every active connector:
// telemetry_quality_index, connector_health_band, days_to_cert_renewal.
export async function scadaConnectorTelemetryRefreshSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_scada_connector
     WHERE chain_status NOT IN ('archived','disconnected','revoked')`,
  ).all<SccRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const telemetry = telemetryQualityIndex({
      logical_node_count:  row.logical_node_count,
      data_object_count:   row.data_object_count,
      messages_per_minute: row.messages_per_minute,
      signal_to_noise_db:  row.signal_to_noise_db,
      latency_p50_ms:      row.latency_p50_ms,
      latency_p99_ms:      row.latency_p99_ms,
      jitter_ms:           row.jitter_ms,
      packet_loss_pct:     row.packet_loss_pct,
      tls_cert_valid:      row.tls_cert_valid,
      iec_62351_cipher_ok: row.iec_62351_cipher_ok,
      protocol_compliant:  row.protocol_compliant,
    });

    const certDays = daysToCertRenewal(row.tls_cert_expiry_at, now);
    const flags = rowFloorFlags(row);

    const health = connectorHealthBand(
      row.chain_status,
      telemetry,
      !!row.sla_breached,
      certDays,
      flags,
      row.packet_loss_pct ?? 0,
    );

    await env.DB.prepare(
      `UPDATE oe_scada_connector
       SET telemetry_quality_index = ?,
           connector_health_band = ?,
           days_to_cert_renewal = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(telemetry, health, certDays, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

// ─── Cron: weekly cert-expiry scan (0 7 * * 1) ────────────────────────────
//
// Monday 09:00 SAST (07:00 UTC). Flags any connector whose TLS cert
// expires within 14 days as regulator_relevant so it surfaces in the
// regulator inbox. NERSA Grid Code C-3 requires 14-day cert-renewal
// pre-notification.
export async function scadaConnectorCertExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_scada_connector
     WHERE chain_status NOT IN ('archived','disconnected','revoked')
       AND tls_cert_expiry_at IS NOT NULL`,
  ).all<SccRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const certDays = daysToCertRenewal(row.tls_cert_expiry_at, now);
    if (certDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_scada_connector
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_cert_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(certDays, nowIso, row.id).run();
      flagged++;
    } else {
      // Just refresh days_to_cert_renewal.
      await env.DB.prepare(
        `UPDATE oe_scada_connector
         SET days_to_cert_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(certDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
