// ═══════════════════════════════════════════════════════════════════════════
// Wave 123 - MQTT / OPC-UA Edge-Device IIoT Connector.
//
// PHASE C WAVE 2 OF 5. Sister-wave to W122 substation-grade IEC 61850
// bridge - this is the EDGE-DEVICE / IIoT BROKER tier connecting
// inverters, BESS controllers, RTUs, weather stations, met masts,
// substation gateways, SCADA RTUs, and Sparkplug-B fleets.
//
// Standards: MQTT v5 / MQTT-SN, OPC UA 1.05 / OPC UA Pub/Sub,
// Sparkplug B (Eclipse Tahu), IEC 61400-25 (wind), IEEE 2030.5 (CSIP /
// smart-inverter), SunSpec Modbus, NERSA Grid Code C-3, POPIA s19,
// IEC 62443 (OT cybersecurity), SARB BA 700 (cyber-incident notice).
//
// 16 actions: propose_connector / provision_broker / map_topics /
//   configure_mutual_tls / register_client / start_publishing /
//   validate_subscription / bind_companion_spec / go_live /
//   activate_reconciliation / archive / disconnect / suspend / resume /
//   revoke_credential / activate_failover.
//
// SIGNATURE Phase-C regulator crossings:
//   revoke_credential -> EVERY tier (W123 SIGNATURE MQTT-OPCUA-REVOKE
//     hard line)
//   activate_failover -> large_fleet + national_iot_backbone
//   disconnect -> EVERY tier WHEN critical_safety_payload
//   bind_companion_spec -> national_iot_backbone WHEN
//     ieee_2030_5_csip_inverter_control
//   sla_breached -> large_fleet + national_iot_backbone
//
// Write {admin, grid_operator, ipp_developer, support}. PUBLIC mTLS-
// gated peer endpoint at /api/mqtt-opcua-connector/peer/:peer_id
// (BEFORE authMiddleware) returns a handshake snapshot for trusted
// IoT counterparties using `x-mtls-cert-fingerprint` header
// (W122/W123 Phase-C consistency, NOT cf-client-cert-sha256).
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
  tierForEndpointCount,
  effectiveTier,
  countFloorFlags,
  floorAtLargeFleet,
  floorAtNationalIotBackbone,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  daysToCertRenewal,
  bridgesToW122ScadaConnector,
  bridgesToW71AssetPrognostics,
  bridgesToW50ReserveActivation,
  bridgesToW26CyberIncident,
  bridgesToW118AuditChain,
  telemetryQualityIndex,
  connectorHealthBand,
  isKnownMqttOpcuaProtocol,
  isKnownCompanionSpec,
  MQTT_OPCUA_PROTOCOLS,
  COMPANION_SPECS,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
  type MocStatus,
  type MocAction,
  type MocTier,
  type MqttOpcuaProtocol,
  type CompanionSpec,
} from '../utils/mqtt-opcua-connector-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W123 = admin + grid_operator + ipp_developer + support write.
const WRITE_ROLES = new Set(['admin', 'grid_operator', 'ipp_developer', 'support']);

// ─── Row + event interfaces ───────────────────────────────────────────────
interface MocRow {
  id: string;
  connector_number: string;
  peer_id: string;
  broker_name: string;
  endpoint_count: number | null;
  protocol: MqttOpcuaProtocol | string;
  companion_spec: CompanionSpec | string | null;
  companion_spec_version: string | null;
  endpoint_url: string | null;
  tls_cert_fingerprint: string | null;
  tls_cert_expiry_at: string | null;

  w122_scada_connector_ref: string | null;
  w71_asset_prognostics_ref: string | null;
  w50_reserve_activation_ref: string | null;
  w26_cyber_incident_ref: string | null;
  w118_block_ref: string | null;

  critical_safety_payload: number;
  cross_border_iot_traffic: number;
  sparkplug_b_required: number;
  ieee_2030_5_csip_inverter_control: number;
  aggregated_demand_response_above_50mw: number;

  // Telemetry quality components.
  active_publishers: number | null;
  active_subscribers: number | null;
  subscription_topic_count: number | null;
  retained_message_count: number | null;
  messages_per_second: number | null;
  qos_p99_ms: number | null;
  payload_quality_index: number | null;
  control_commands_authorized_count: number | null;
  control_commands_executed_24h: number | null;
  tls_cert_valid: number;
  iec_62443_cipher_ok: number;
  protocol_compliant: number;
  telemetry_quality_index: number | null;

  current_tier: MocTier;
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

  chain_status: MocStatus;
  connector_proposed_at: string | null;
  broker_provisioned_at: string | null;
  topics_mapped_at: string | null;
  tls_mutual_configured_at: string | null;
  client_registered_at: string | null;
  publishing_active_at: string | null;
  subscription_validated_at: string | null;
  companion_spec_bound_at: string | null;
  live_streaming_at: string | null;
  reconciliation_active_at: string | null;
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
  days_to_cert_renewal: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MocEventRow {
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

const TIMESTAMP_COLUMN: Record<MocStatus, keyof MocRow | null> = {
  connector_proposed:     'connector_proposed_at',
  broker_provisioned:     'broker_provisioned_at',
  topics_mapped:          'topics_mapped_at',
  tls_mutual_configured:  'tls_mutual_configured_at',
  client_registered:      'client_registered_at',
  publishing_active:      'publishing_active_at',
  subscription_validated: 'subscription_validated_at',
  companion_spec_bound:   'companion_spec_bound_at',
  live_streaming:         'live_streaming_at',
  reconciliation_active:  'reconciliation_active_at',
  archived:               'archived_at',
  disconnected:           'disconnected_at',
  suspended:              'suspended_at',
  failover_active:        'failover_activated_at',
  credential_revoked:     'credential_revoked_at',
};

function statusEnteredAt(row: MocRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.connector_proposed_at ? new Date(row.connector_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.connector_proposed_at ? new Date(row.connector_proposed_at) : null);
}

function rowFloorFlags(row: MocRow) {
  return {
    critical_safety_payload:               row.critical_safety_payload,
    cross_border_iot_traffic:              row.cross_border_iot_traffic,
    sparkplug_b_required:                  row.sparkplug_b_required,
    ieee_2030_5_csip_inverter_control:     row.ieee_2030_5_csip_inverter_control,
    aggregated_demand_response_above_50mw: row.aggregated_demand_response_above_50mw,
  };
}

function decorate(row: MocRow, now: Date) {
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
  const floorLarge = floorAtLargeFleet(flags);
  const floorNational = floorAtNationalIotBackbone(flags);

  const telemetryLive = telemetryQualityIndex({
    active_publishers:                  row.active_publishers,
    active_subscribers:                 row.active_subscribers,
    subscription_topic_count:           row.subscription_topic_count,
    retained_message_count:             row.retained_message_count,
    messages_per_second:                row.messages_per_second,
    qos_p99_ms:                         row.qos_p99_ms,
    payload_quality_index:              row.payload_quality_index,
    control_commands_authorized_count:  row.control_commands_authorized_count,
    control_commands_executed_24h:      row.control_commands_executed_24h,
    tls_cert_valid:                     row.tls_cert_valid,
    iec_62443_cipher_ok:                row.iec_62443_cipher_ok,
    protocol_compliant:                 row.protocol_compliant,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = connectorHealthBand(
    status,
    telemetryLive,
    !!row.sla_breached || slaBreachedLive,
    certDays,
    flags,
    row.qos_p99_ms ?? 0,
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
    floor_at_large_fleet_live: floorLarge,
    floor_at_national_iot_backbone_live: floorNational,
    telemetry_quality_index_live: telemetryLive,
    connector_health_band_live: healthLive,
    bridges_to_w122_scada_connector_live: bridgesToW122ScadaConnector(row.w122_scada_connector_ref),
    bridges_to_w71_asset_prognostics_live: bridgesToW71AssetPrognostics(row.w71_asset_prognostics_ref),
    bridges_to_w50_reserve_activation_live: bridgesToW50ReserveActivation(row.w50_reserve_activation_ref),
    bridges_to_w26_cyber_incident_live: bridgesToW26CyberIncident(row.w26_cyber_incident_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// ─── PUBLIC mTLS peer endpoint (NO Bearer auth) ─────────────────────────
//
// GET /api/mqtt-opcua-connector/peer/:peer_id with header
// `x-mtls-cert-fingerprint` (W122/W123 Phase-C consistency, NOT
// cf-client-cert-sha256). Returns a handshake snapshot for the trusted
// IoT counterparty (no Bearer-JWT auth).
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
    'SELECT * FROM oe_mqtt_opcua_connector WHERE peer_id = ?',
  ).bind(peerId).first<MocRow>();
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
        broker_name: row.broker_name,
        protocol: row.protocol,
        companion_spec: row.companion_spec,
        companion_spec_version: row.companion_spec_version,
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
  const companion  = c.req.query('companion_spec');
  const health     = c.req.query('health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_mqtt_opcua_connector WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?'; binds.push(status); }
  if (protocol)  { sql += ' AND protocol = ?'; binds.push(protocol); }
  if (companion) { sql += ' AND companion_spec = ?'; binds.push(companion); }
  if (health)    { sql += ' AND connector_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<MocRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_companion_spec: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_protocol[i.protocol as string] = (by_protocol[i.protocol as string] || 0) + 1;
    if (i.companion_spec) by_companion_spec[i.companion_spec as string] = (by_companion_spec[i.companion_spec as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.connector_health_band_live] = (by_health[i.connector_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'connector_proposed').length;
  const provisioned_count   = items.filter((i) => i.chain_status === 'broker_provisioned').length;
  const topics_count        = items.filter((i) => i.chain_status === 'topics_mapped').length;
  const tls_count           = items.filter((i) => i.chain_status === 'tls_mutual_configured').length;
  const client_count        = items.filter((i) => i.chain_status === 'client_registered').length;
  const publishing_count    = items.filter((i) => i.chain_status === 'publishing_active').length;
  const validated_count     = items.filter((i) => i.chain_status === 'subscription_validated').length;
  const companion_count     = items.filter((i) => i.chain_status === 'companion_spec_bound').length;
  const live_count          = items.filter((i) => i.chain_status === 'live_streaming').length;
  const reconciliation_cnt  = items.filter((i) => i.chain_status === 'reconciliation_active').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const disconnected_count  = items.filter((i) => i.chain_status === 'disconnected').length;
  const revoked_count       = items.filter((i) => i.chain_status === 'credential_revoked').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const failover_count      = items.filter((i) => i.chain_status === 'failover_active').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w122_bridged        = items.filter((i) => i.bridges_to_w122_scada_connector_live).length;
  const w71_bridged         = items.filter((i) => i.bridges_to_w71_asset_prognostics_live).length;
  const w50_bridged         = items.filter((i) => i.bridges_to_w50_reserve_activation_live).length;
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
      by_companion_spec,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      provisioned_count,
      topics_count,
      tls_count,
      client_count,
      publishing_count,
      validated_count,
      companion_count,
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
      w122_bridged_count: w122_bridged,
      w71_bridged_count: w71_bridged,
      w50_bridged_count: w50_bridged,
      w26_bridged_count: w26_bridged,
      w118_bridged_count: w118_bridged,
      telemetry_quality_avg: telemetry_avg,
      certs_expiring_within_60d: certs_expiring_60d,
      certs_expiring_within_14d: certs_expiring_14d,
      mqtt_opcua_protocols: MQTT_OPCUA_PROTOCOLS,
      companion_specs: COMPANION_SPECS,
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
    `SELECT chain_status, current_tier, connector_health_band, protocol, companion_spec,
            regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_mqtt_opcua_connector
     GROUP BY chain_status, current_tier, connector_health_band, protocol, companion_spec,
              regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; connector_health_band: string | null;
    protocol: string | null; companion_spec: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_protocol: Record<string, number> = {};
  const by_companion_spec: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.connector_health_band) by_health[r.connector_health_band] = (by_health[r.connector_health_band] || 0) + r.n;
    if (r.protocol) by_protocol[r.protocol] = (by_protocol[r.protocol] || 0) + r.n;
    if (r.companion_spec) by_companion_spec[r.companion_spec] = (by_companion_spec[r.companion_spec] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_protocol, by_companion_spec,
      by_regulator_relevant, by_sla_breached,
      mqtt_opcua_protocols: MQTT_OPCUA_PROTOCOLS,
      companion_specs: COMPANION_SPECS,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_mqtt_opcua_connector WHERE id = ?').bind(id).first<MocRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_mqtt_opcua_connector_events WHERE connector_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<MocEventRow>();

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
  broker_name?: string;
  endpoint_count?: number;
  protocol?: MqttOpcuaProtocol;
  companion_spec?: CompanionSpec;
  companion_spec_version?: string;
  endpoint_url?: string;
  tls_cert_fingerprint?: string;
  tls_cert_expiry_at?: string;

  w122_scada_connector_ref?: string;
  w71_asset_prognostics_ref?: string;
  w50_reserve_activation_ref?: string;
  w26_cyber_incident_ref?: string;
  w118_block_ref?: string;

  critical_safety_payload?: boolean | number;
  cross_border_iot_traffic?: boolean | number;
  sparkplug_b_required?: boolean | number;
  ieee_2030_5_csip_inverter_control?: boolean | number;
  aggregated_demand_response_above_50mw?: boolean | number;

  active_publishers?: number;
  active_subscribers?: number;
  subscription_topic_count?: number;
  retained_message_count?: number;
  messages_per_second?: number;
  qos_p99_ms?: number;
  payload_quality_index?: number;
  control_commands_authorized_count?: number;
  control_commands_executed_24h?: number;
  tls_cert_valid?: boolean | number;
  iec_62443_cipher_ok?: boolean | number;
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

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<MocRow>): Partial<MocRow> {
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

  const id = `moc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const protocol = isKnownMqttOpcuaProtocol(body.protocol)
    ? body.protocol
    : 'mqtt_v5';
  const companionSpec = isKnownCompanionSpec(body.companion_spec)
    ? body.companion_spec
    : null;

  const flags = {
    critical_safety_payload:               toFlag(body.critical_safety_payload) ?? 0,
    cross_border_iot_traffic:              toFlag(body.cross_border_iot_traffic) ?? 0,
    sparkplug_b_required:                  toFlag(body.sparkplug_b_required) ?? 0,
    ieee_2030_5_csip_inverter_control:     toFlag(body.ieee_2030_5_csip_inverter_control) ?? 0,
    aggregated_demand_response_above_50mw: toFlag(body.aggregated_demand_response_above_50mw) ?? 0,
  };
  const rawTier = tierForEndpointCount(body.endpoint_count);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('connector_proposed', tier, now);
  const slaHrs = slaWindowHours('connector_proposed', tier);
  const certDays = daysToCertRenewal(body.tls_cert_expiry_at ?? null, now);

  // Connector number = MOC-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_mqtt_opcua_connector`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const ccNum = `MOC-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const peerId = body.peer_id ?? `iot-peer-${id.slice(4)}`;

  // Compute initial telemetry score (most fields 0/null on create).
  const telemetryInit = telemetryQualityIndex({
    tls_cert_valid:        toFlag(body.tls_cert_valid),
    iec_62443_cipher_ok:   toFlag(body.iec_62443_cipher_ok),
    protocol_compliant:    toFlag(body.protocol_compliant),
  });

  const healthInit = connectorHealthBand(
    'connector_proposed',
    telemetryInit,
    false,
    certDays,
    flags,
    body.qos_p99_ms ?? 0,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_mqtt_opcua_connector (
      id, connector_number, peer_id, broker_name, endpoint_count,
      protocol, companion_spec, companion_spec_version,
      endpoint_url, tls_cert_fingerprint, tls_cert_expiry_at,
      w122_scada_connector_ref, w71_asset_prognostics_ref,
      w50_reserve_activation_ref, w26_cyber_incident_ref, w118_block_ref,
      critical_safety_payload, cross_border_iot_traffic, sparkplug_b_required,
      ieee_2030_5_csip_inverter_control, aggregated_demand_response_above_50mw,
      active_publishers, active_subscribers, subscription_topic_count,
      retained_message_count, messages_per_second, qos_p99_ms,
      payload_quality_index, control_commands_authorized_count,
      control_commands_executed_24h, tls_cert_valid, iec_62443_cipher_ok,
      protocol_compliant, telemetry_quality_index,
      current_tier, authority_required, urgency_band, connector_health_band,
      title,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, connector_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_cert_renewal,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ccNum, peerId, body.broker_name ?? null, body.endpoint_count ?? null,
    protocol, companionSpec, body.companion_spec_version ?? null,
    body.endpoint_url ?? null,
    body.tls_cert_fingerprint ? body.tls_cert_fingerprint.replace(/[:\s-]/g, '').toLowerCase() : null,
    body.tls_cert_expiry_at ?? null,
    body.w122_scada_connector_ref ?? null, body.w71_asset_prognostics_ref ?? null,
    body.w50_reserve_activation_ref ?? null, body.w26_cyber_incident_ref ?? null,
    body.w118_block_ref ?? null,
    flags.critical_safety_payload, flags.cross_border_iot_traffic, flags.sparkplug_b_required,
    flags.ieee_2030_5_csip_inverter_control, flags.aggregated_demand_response_above_50mw,
    body.active_publishers ?? null, body.active_subscribers ?? null,
    body.subscription_topic_count ?? null, body.retained_message_count ?? null,
    body.messages_per_second ?? null, body.qos_p99_ms ?? null,
    body.payload_quality_index ?? null, body.control_commands_authorized_count ?? null,
    body.control_commands_executed_24h ?? null,
    toFlag(body.tls_cert_valid) ?? 0, toFlag(body.iec_62443_cipher_ok) ?? 0,
    toFlag(body.protocol_compliant) ?? 0, telemetryInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), healthInit,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'connector_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    certDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `mqtt_opcua_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_mqtt_opcua_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'mqtt_opcua_connector_proposed',
    null, 'connector_proposed', null, tier,
    user.id, partyForAction('propose_connector'),
    null, JSON.stringify({ tier, protocol, peer_id: peerId, broker_name: body.broker_name }), nowIso,
  ).run();

  await fireCascade({
    event: 'mqtt_opcua_connector_proposed',
    actor_id: user.id,
    entity_type: 'mqtt_opcua_connector',
    entity_id: id,
    data: { tier, protocol, peer_id: peerId, chain_status: 'connector_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_mqtt_opcua_connector WHERE id = ?').bind(id).first<MocRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: MocAction,
  bodyHandler?: (row: MocRow, body: Record<string, unknown>) => Partial<MocRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_mqtt_opcua_connector WHERE id = ?').bind(id).first<MocRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  let overrides: Partial<MocRow>;
  try {
    overrides = bodyHandler ? bodyHandler(row, body) : {};
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'invalid request body' }, 400);
  }

  // Re-derive tier from endpoint_count + 5 floor flags (every transition).
  const endpointCount = (overrides.endpoint_count as number | undefined) ?? row.endpoint_count;
  const rawTier = tierForEndpointCount(endpointCount);
  const floorFlags = {
    critical_safety_payload:
      (overrides.critical_safety_payload as number | undefined) ?? row.critical_safety_payload,
    cross_border_iot_traffic:
      (overrides.cross_border_iot_traffic as number | undefined) ?? row.cross_border_iot_traffic,
    sparkplug_b_required:
      (overrides.sparkplug_b_required as number | undefined) ?? row.sparkplug_b_required,
    ieee_2030_5_csip_inverter_control:
      (overrides.ieee_2030_5_csip_inverter_control as number | undefined) ?? row.ieee_2030_5_csip_inverter_control,
    aggregated_demand_response_above_50mw:
      (overrides.aggregated_demand_response_above_50mw as number | undefined) ?? row.aggregated_demand_response_above_50mw,
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
    active_publishers:
      (overrides.active_publishers as number | undefined) ?? row.active_publishers,
    active_subscribers:
      (overrides.active_subscribers as number | undefined) ?? row.active_subscribers,
    subscription_topic_count:
      (overrides.subscription_topic_count as number | undefined) ?? row.subscription_topic_count,
    retained_message_count:
      (overrides.retained_message_count as number | undefined) ?? row.retained_message_count,
    messages_per_second:
      (overrides.messages_per_second as number | undefined) ?? row.messages_per_second,
    qos_p99_ms:
      (overrides.qos_p99_ms as number | undefined) ?? row.qos_p99_ms,
    payload_quality_index:
      (overrides.payload_quality_index as number | undefined) ?? row.payload_quality_index,
    control_commands_authorized_count:
      (overrides.control_commands_authorized_count as number | undefined) ?? row.control_commands_authorized_count,
    control_commands_executed_24h:
      (overrides.control_commands_executed_24h as number | undefined) ?? row.control_commands_executed_24h,
    tls_cert_valid:
      (overrides.tls_cert_valid as number | undefined) ?? row.tls_cert_valid,
    iec_62443_cipher_ok:
      (overrides.iec_62443_cipher_ok as number | undefined) ?? row.iec_62443_cipher_ok,
    protocol_compliant:
      (overrides.protocol_compliant as number | undefined) ?? row.protocol_compliant,
  });
  overrides.telemetry_quality_index = telemetry;

  // Health band composite.
  const qosEff = (overrides.qos_p99_ms as number | undefined) ?? row.qos_p99_ms ?? 0;
  overrides.connector_health_band = connectorHealthBand(
    to,
    telemetry,
    !!row.sla_breached,
    certDays,
    floorFlags,
    qosEff,
  );

  // SIGNATURE crossings - revoke_credential EVERY tier; activate_failover
  // heavy only; disconnect EVERY tier when critical_safety_payload;
  // bind_companion_spec national + CSIP.
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
    `UPDATE oe_mqtt_opcua_connector SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `mqtt_opcua_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_mqtt_opcua_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `mqtt_opcua_connector_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'mqtt_opcua_connector',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_mqtt_opcua_connector WHERE id = ?').bind(id).first<MocRow>();
  return c.json({ success: true, data: { connector: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/provision-broker', async (c) => transition(c, 'provision_broker', (_row, body) => {
  const b = body as Partial<CommonBody & {
    broker_name?: string;
    endpoint_url?: string;
    active_publishers?: number;
    active_subscribers?: number;
  }>;
  const out: Partial<MocRow> = {};
  if (typeof b.broker_name === 'string')         out.broker_name = b.broker_name;
  if (typeof b.endpoint_url === 'string') {
    assertSafeWebhookUrl(b.endpoint_url); // throws → transition() try/catch returns 400
    out.endpoint_url = b.endpoint_url;
  }
  if (typeof b.active_publishers === 'number')   out.active_publishers = b.active_publishers;
  if (typeof b.active_subscribers === 'number')  out.active_subscribers = b.active_subscribers;
  return applyCommon(b, out);
}));

app.post('/:id/map-topics', async (c) => transition(c, 'map_topics', (_row, body) => {
  const b = body as Partial<CommonBody & {
    subscription_topic_count?: number;
    retained_message_count?: number;
  }>;
  const out: Partial<MocRow> = {};
  if (typeof b.subscription_topic_count === 'number') out.subscription_topic_count = b.subscription_topic_count;
  if (typeof b.retained_message_count === 'number')   out.retained_message_count = b.retained_message_count;
  return applyCommon(b, out);
}));

app.post('/:id/configure-mutual-tls', async (c) => transition(c, 'configure_mutual_tls', (_row, body) => {
  const b = body as Partial<CommonBody & {
    tls_cert_fingerprint?: string;
    tls_cert_expiry_at?: string;
    tls_cert_valid?: boolean | number;
    iec_62443_cipher_ok?: boolean | number;
  }>;
  const out: Partial<MocRow> = {};
  if (typeof b.tls_cert_fingerprint === 'string') {
    out.tls_cert_fingerprint = b.tls_cert_fingerprint.replace(/[:\s-]/g, '').toLowerCase();
  }
  if (typeof b.tls_cert_expiry_at === 'string')   out.tls_cert_expiry_at = b.tls_cert_expiry_at;
  const f1 = toFlag(b.tls_cert_valid); if (f1 !== undefined) out.tls_cert_valid = f1;
  const f2 = toFlag(b.iec_62443_cipher_ok); if (f2 !== undefined) out.iec_62443_cipher_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/register-client', async (c) => transition(c, 'register_client', (_row, body) => {
  const b = body as Partial<CommonBody & { protocol_compliant?: boolean | number }>;
  const out: Partial<MocRow> = {};
  const f = toFlag(b.protocol_compliant); if (f !== undefined) out.protocol_compliant = f;
  return applyCommon(b, out);
}));

app.post('/:id/start-publishing', async (c) => transition(c, 'start_publishing', (_row, body) => {
  const b = body as Partial<CommonBody & {
    messages_per_second?: number;
    qos_p99_ms?: number;
  }>;
  const out: Partial<MocRow> = {};
  if (typeof b.messages_per_second === 'number') out.messages_per_second = b.messages_per_second;
  if (typeof b.qos_p99_ms === 'number')          out.qos_p99_ms = b.qos_p99_ms;
  return applyCommon(b, out);
}));

app.post('/:id/validate-subscription', async (c) => transition(c, 'validate_subscription', (_row, body) => {
  const b = body as Partial<CommonBody & {
    payload_quality_index?: number;
  }>;
  const out: Partial<MocRow> = {};
  if (typeof b.payload_quality_index === 'number') out.payload_quality_index = b.payload_quality_index;
  return applyCommon(b, out);
}));

app.post('/:id/bind-companion-spec', async (c) => transition(c, 'bind_companion_spec', (_row, body) => {
  const b = body as Partial<CommonBody & {
    companion_spec?: CompanionSpec;
    companion_spec_version?: string;
    control_commands_authorized_count?: number;
  }>;
  const out: Partial<MocRow> = {};
  if (isKnownCompanionSpec(b.companion_spec))         out.companion_spec = b.companion_spec;
  if (typeof b.companion_spec_version === 'string')   out.companion_spec_version = b.companion_spec_version;
  if (typeof b.control_commands_authorized_count === 'number') {
    out.control_commands_authorized_count = b.control_commands_authorized_count;
  }
  return applyCommon(b, out);
}));

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
    w122_scada_connector_ref?: string;
    w26_cyber_incident_ref?: string;
  }>;
  const out: Partial<MocRow> = {};
  if (typeof b.w122_scada_connector_ref === 'string') out.w122_scada_connector_ref = b.w122_scada_connector_ref;
  if (typeof b.w26_cyber_incident_ref === 'string')   out.w26_cyber_incident_ref = b.w26_cyber_incident_ref;
  return applyCommon(b, out);
}));

app.post('/:id/suspend', async (c) => transition(c, 'suspend', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/revoke-credential', async (c) => transition(c, 'revoke_credential', (_row, body) => {
  const b = body as Partial<CommonBody & { w26_cyber_incident_ref?: string }>;
  const out: Partial<MocRow> = {};
  if (typeof b.w26_cyber_incident_ref === 'string') out.w26_cyber_incident_ref = b.w26_cyber_incident_ref;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) => {
  const b = body as Partial<CommonBody & { w50_reserve_activation_ref?: string }>;
  const out: Partial<MocRow> = {};
  if (typeof b.w50_reserve_activation_ref === 'string') out.w50_reserve_activation_ref = b.w50_reserve_activation_ref;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal connector past sla_deadline_at, flips
// sla_breached = 1, bumps escalation_level. Breach crosses regulator
// on large_fleet + national_iot_backbone tiers.
export async function mqttOpcuaConnectorSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_mqtt_opcua_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<MocRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_mqtt_opcua_connector
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `mqtt_opcua_connector_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_mqtt_opcua_connector_events (id, connector_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'mqtt_opcua_connector_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'iot_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as MocTier)) {
      await fireCascade({
        event: 'mqtt_opcua_connector_sla_breached',
        actor_id: 'system',
        entity_type: 'mqtt_opcua_connector',
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
export async function mqttOpcuaConnectorTelemetryRefreshSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_mqtt_opcua_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')`,
  ).all<MocRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const telemetry = telemetryQualityIndex({
      active_publishers:                 row.active_publishers,
      active_subscribers:                row.active_subscribers,
      subscription_topic_count:          row.subscription_topic_count,
      retained_message_count:            row.retained_message_count,
      messages_per_second:               row.messages_per_second,
      qos_p99_ms:                        row.qos_p99_ms,
      payload_quality_index:             row.payload_quality_index,
      control_commands_authorized_count: row.control_commands_authorized_count,
      control_commands_executed_24h:     row.control_commands_executed_24h,
      tls_cert_valid:                    row.tls_cert_valid,
      iec_62443_cipher_ok:               row.iec_62443_cipher_ok,
      protocol_compliant:                row.protocol_compliant,
    });

    const certDays = daysToCertRenewal(row.tls_cert_expiry_at, now);
    const flags = rowFloorFlags(row);

    const health = connectorHealthBand(
      row.chain_status,
      telemetry,
      !!row.sla_breached,
      certDays,
      flags,
      row.qos_p99_ms ?? 0,
    );

    await env.DB.prepare(
      `UPDATE oe_mqtt_opcua_connector
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
// regulator inbox. NERSA Grid Code C-3 + IEC 62443 require 14-day
// cert-renewal pre-notification.
export async function mqttOpcuaConnectorCertExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_mqtt_opcua_connector
     WHERE chain_status NOT IN ('archived','disconnected','credential_revoked')
       AND tls_cert_expiry_at IS NOT NULL`,
  ).all<MocRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const certDays = daysToCertRenewal(row.tls_cert_expiry_at, now);
    if (certDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_mqtt_opcua_connector
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_cert_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(certDays, nowIso, row.id).run();
      flagged++;
    } else {
      // Just refresh days_to_cert_renewal.
      await env.DB.prepare(
        `UPDATE oe_mqtt_opcua_connector
         SET days_to_cert_renewal = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(certDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
