// Wave 123 - MQTT / OPC UA Connector.
//
// Phase C wave 2. Edge-device / IIoT broker bridge complementing W122
// substation-grade SCADA. MQTT v5 / MQTT-SN / OPC UA 1.05 / Pub/Sub /
// Sparkplug B / IEC 61400-25 / IEEE 2030.5 CSIP / SunSpec Modbus.
//
// Mounted at /grid-operator/workstation?tab=mqtt-opcua-connectors for
// grid write, /ipp-lifecycle/workstation?tab=mqtt-opcua-connectors for
// IPP write, and /support/workstation?tab=mqtt-opcua-connectors for
// support write.
//
// Beats: AWS IoT Core + Azure IoT Hub + HiveMQ Enterprise + EMQX +
// VerneMQ + Kepware KEPServerEX + Matrikon OPC UA Server + Prosys +
// Unified Automation + Cogent DataHub.
//
// 11-state forward + 4 branch lifecycle:
//   connector_proposed -> broker_provisioned -> topics_mapped ->
//     tls_mutual_configured -> client_registered -> publishing_active ->
//     subscription_validated -> companion_spec_bound -> live_streaming ->
//     reconciliation_active -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD)
//   any non-terminal -> revoke_credential -> credential_revoked (HARD)
//   active states -> suspend -> suspended (SOFT)
//   live -> activate_failover -> failover_active (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger fleet = MORE time:
//   edge 168h / small 240h / medium 360h / large 480h / national 720h.
// FLOOR-AT-LARGE-FLEET on >=1 of 5 flags; FLOOR-AT-NATIONAL >=3.
// Flags: critical_safety_payload / cross_border_iot_traffic /
// sparkplug_b_required / ieee_2030_5_csip_inverter_control /
// aggregated_demand_response_above_50mw.
//
// SIGNATURE Phase-C regulator crossings:
//   * revoke_credential crosses EVERY tier (W123 SIGNATURE MQTT-OPCUA-
//     REVOKE - NERSA Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700)
//   * activate_failover crosses large_fleet + national_iot_backbone
//   * disconnect crosses EVERY tier when critical_safety_payload
//   * bind_companion_spec national_iot_backbone only WHEN
//     ieee_2030_5_csip_inverter_control
//   * sla_breached large_fleet + national_iot_backbone only
//
// Write {admin, grid_operator, ipp_developer, support}. READ all 9.
// EXTERNAL IoT peer via mTLS-gated PUBLIC peer endpoint (x-mtls-cert-
// fingerprint header).
//
// 5 bridges (W118 MANDATORY): W122 SCADA + W71 asset prognostics + W50
// reserve activation + W26 cyber incident + W118 audit block ref.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type MocStatus =
  | 'connector_proposed' | 'broker_provisioned' | 'topics_mapped'
  | 'tls_mutual_configured' | 'client_registered' | 'publishing_active'
  | 'subscription_validated' | 'companion_spec_bound'
  | 'live_streaming' | 'reconciliation_active' | 'archived'
  | 'disconnected' | 'credential_revoked' | 'suspended' | 'failover_active';

type MocTier = 'edge_device' | 'small_fleet' | 'medium_fleet' | 'large_fleet' | 'national_iot_backbone';
type MocUrgency = 'low' | 'medium' | 'high' | 'critical';
type MocAuthority = 'iot_engineer' | 'ot_security_manager' | 'CISO' | 'SO_CEO' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type MqttOpcuaProtocol =
  | 'mqtt_v5' | 'mqtt_sn' | 'opc_ua_1_05' | 'opc_ua_pubsub'
  | 'sparkplug_b' | 'iec_61400_25' | 'ieee_2030_5' | 'sunspec_modbus';
type CompanionSpec = 'pv_industry' | 'energy' | 'battery' | 'inverter' | 'wind';

interface MocRow {
  [key: string]: unknown;
  id: string;
  connector_number: string;
  peer_id: string;
  broker_name: string | null;
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
  authority_required: MocAuthority | null;
  urgency_band: MocUrgency | null;
  connector_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
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
  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_cert_renewal: number | null;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // LIVE 28-field decoration battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: MocUrgency;
  authority_required_live?: MocAuthority;
  days_to_cert_renewal_live?: number;
  floor_flag_count_live?: number;
  floor_at_large_fleet_live?: boolean;
  floor_at_national_iot_backbone_live?: boolean;
  telemetry_quality_index_live?: number;
  connector_health_band_live?: HealthBand;
  bridges_to_w122_scada_connector_live?: boolean;
  bridges_to_w71_asset_prognostics_live?: boolean;
  bridges_to_w50_reserve_activation_live?: boolean;
  bridges_to_w26_cyber_incident_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface MocEvent {
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

const STATE_TONE: Record<MocStatus, { bg: string; fg: string; label: string }> = {
  connector_proposed:    { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  broker_provisioned:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Broker' },
  topics_mapped:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Topics' },
  tls_mutual_configured: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'mTLS' },
  client_registered:     { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Client' },
  publishing_active:     { bg: '#fff4d6', fg: '#a06200', label: 'Publishing' },
  subscription_validated:{ bg: '#fff4d6', fg: '#a06200', label: 'Subscribed' },
  companion_spec_bound:  { bg: '#fff4d6', fg: '#a06200', label: 'Companion' },
  live_streaming:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live streaming' },
  reconciliation_active: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reconciliation' },
  archived:              { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  disconnected:          { bg: '#7a0e0e', fg: '#fff',    label: 'Disconnected' },
  credential_revoked:    { bg: '#7a0e0e', fg: '#fff',    label: 'Cred revoked' },
  suspended:             { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  failover_active:       { bg: '#fff4d6', fg: '#a06200', label: 'Failover' },
};

const TIER_TONE: Record<MocTier, { bg: string; fg: string; label: string }> = {
  edge_device:           { bg: '#e3e7ec', fg: '#557',    label: 'Edge device' },
  small_fleet:           { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Small fleet' },
  medium_fleet:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium fleet' },
  large_fleet:           { bg: '#fff4d6', fg: '#a06200', label: 'Large fleet' },
  national_iot_backbone: { bg: '#7a0e0e', fg: '#fff',    label: 'National IoT backbone' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',          label: 'Active' },
  { key: 'all',             label: 'All' },
  { key: 'reportable',      label: 'Reportable' },
  { key: 'breached',        label: 'SLA breached' },
  { key: 'cert_60d',        label: 'Cert exp. 60d' },
  { key: 'cert_14d',        label: 'Cert exp. 14d' },
  { key: 'health_red',      label: 'Health red' },
  { key: 'health_critical', label: 'Health critical' },
  { key: 'national_floor',  label: 'National-floor' },
  { key: 'large_floor',     label: 'Large-floor' },
  { key: 'disconnected',    label: 'Disconnected' },
  { key: 'credential_revoked', label: 'Revoked' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'connector_proposed',     label: 'Proposed' },
  { key: 'broker_provisioned',     label: 'Broker' },
  { key: 'topics_mapped',          label: 'Topics' },
  { key: 'tls_mutual_configured',  label: 'mTLS' },
  { key: 'client_registered',      label: 'Client' },
  { key: 'publishing_active',      label: 'Publishing' },
  { key: 'subscription_validated', label: 'Subscribed' },
  { key: 'companion_spec_bound',   label: 'Companion' },
  { key: 'live_streaming',         label: 'Live' },
  { key: 'reconciliation_active',  label: 'Recon' },
  { key: 'archived',               label: 'Archived' },
  { key: 'disconnected',           label: 'Disconnected' },
  { key: 'credential_revoked',     label: 'Revoked' },
  { key: 'suspended',              label: 'Suspended' },
  { key: 'failover_active',        label: 'Failover' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:edge_device',           label: 'Edge (168h)' },
  { key: 'tier:small_fleet',           label: 'Small (240h)' },
  { key: 'tier:medium_fleet',          label: 'Medium (360h)' },
  { key: 'tier:large_fleet',           label: 'Large (480h)' },
  { key: 'tier:national_iot_backbone', label: 'National (720h)' },
];

const FILTERS_PROTOCOL: Array<{ key: string; label: string }> = [
  { key: 'proto:mqtt_v5',        label: 'MQTT v5' },
  { key: 'proto:mqtt_sn',        label: 'MQTT-SN' },
  { key: 'proto:opc_ua_1_05',    label: 'OPC UA 1.05' },
  { key: 'proto:opc_ua_pubsub',  label: 'OPC UA Pub/Sub' },
  { key: 'proto:sparkplug_b',    label: 'Sparkplug B' },
  { key: 'proto:iec_61400_25',   label: 'IEC 61400-25' },
  { key: 'proto:ieee_2030_5',    label: 'IEEE 2030.5' },
  { key: 'proto:sunspec_modbus', label: 'SunSpec Modbus' },
];

const FILTERS_COMPANION: Array<{ key: string; label: string }> = [
  { key: 'companion:pv_industry', label: 'PV industry' },
  { key: 'companion:energy',      label: 'Energy' },
  { key: 'companion:battery',     label: 'Battery' },
  { key: 'companion:inverter',    label: 'Inverter' },
  { key: 'companion:wind',        label: 'Wind' },
];

type ActionKind =
  | 'provision-broker' | 'map-topics' | 'configure-mutual-tls'
  | 'register-client' | 'start-publishing' | 'validate-subscription'
  | 'bind-companion-spec' | 'go-live' | 'activate-reconciliation'
  | 'archive' | 'disconnect' | 'suspend' | 'resume'
  | 'revoke-credential' | 'activate-failover';

const ACTION_FOR_STATE: Partial<Record<MocStatus, ActionKind>> = {
  connector_proposed:     'provision-broker',
  broker_provisioned:     'map-topics',
  topics_mapped:          'configure-mutual-tls',
  tls_mutual_configured:  'register-client',
  client_registered:      'start-publishing',
  publishing_active:      'validate-subscription',
  subscription_validated: 'bind-companion-spec',
  companion_spec_bound:   'go-live',
  live_streaming:         'activate-reconciliation',
  reconciliation_active:  'archive',
  suspended:              'resume',
  failover_active:        'go-live',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'provision-broker':      'Provision broker (IoT engineer - broker spin-up + ACL)',
  'map-topics':            'Map topics (IoT engineer - publish/subscribe topic tree)',
  'configure-mutual-tls':  'Configure mTLS (IoT engineer - dual-pinned client/server cert)',
  'register-client':       'Register client (IoT engineer - client_id + LWT)',
  'start-publishing':      'Start publishing (IoT engineer - device-to-broker flow)',
  'validate-subscription': 'Validate subscription (IoT engineer - end-to-end QoS check)',
  'bind-companion-spec':   'BIND COMPANION (OT security mgr - crosses NERSA at national WHEN CSIP)',
  'go-live':               'Go live (CISO - production streaming + control plane)',
  'activate-reconciliation': 'Activate reconciliation (CISO - broker-vs-platform tie-out)',
  'archive':               'Archive (CEO - HARD terminal, retire connector)',
  'disconnect':            'DISCONNECT (CISO - HARD; crosses EVERY tier WHEN critical_safety_payload)',
  'suspend':               'Suspend (OT security mgr - maintenance window, SOFT)',
  'resume':                'Resume (OT security mgr - exit maintenance)',
  'revoke-credential':     'REVOKE CREDENTIAL (SIGNATURE - crosses EVERY tier; NERSA + IEC 62443 + POPIA + SARB BA 700)',
  'activate-failover':     'Activate failover (OT security mgr - cutover to secondary peer; large/national cross)',
};

function fmtHoursSla(h: number | null | undefined): string {
  if (h === null || h === undefined) return '-';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  if (abs >= 24) return `${sign}${(abs / 24).toFixed(1)}d`;
  if (abs >= 1)  return `${sign}${abs.toFixed(1)}h`;
  return `${sign}${Math.round(abs * 60)}m`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtProto(p: MqttOpcuaProtocol | string | null | undefined): string {
  if (!p) return '-';
  return String(p).replace(/_/g, ' ').toUpperCase();
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  provisioned_count: number;
  topics_count: number;
  tls_count: number;
  client_count: number;
  publishing_count: number;
  validated_count: number;
  companion_count: number;
  live_count: number;
  reconciliation_count: number;
  archived_count: number;
  disconnected_count: number;
  revoked_count: number;
  suspended_count: number;
  failover_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w122_bridged_count: number;
  w71_bridged_count: number;
  w50_bridged_count: number;
  w26_bridged_count: number;
  w118_bridged_count: number;
  telemetry_quality_avg: number;
  certs_expiring_within_60d: number;
  certs_expiring_within_14d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, provisioned_count: 0, topics_count: 0, tls_count: 0,
  client_count: 0, publishing_count: 0, validated_count: 0, companion_count: 0,
  live_count: 0, reconciliation_count: 0, archived_count: 0,
  disconnected_count: 0, revoked_count: 0, suspended_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w122_bridged_count: 0, w71_bridged_count: 0, w50_bridged_count: 0,
  w26_bridged_count: 0, w118_bridged_count: 0,
  telemetry_quality_avg: 0,
  certs_expiring_within_60d: 0, certs_expiring_within_14d: 0,
};

interface Props {
  // External / regulator-view: shows disconnected + revoked + reportable
  // rows only, read-only. Used to inspect MQTT-OPCUA-REVOKE signature
  // lines under NERSA Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700.
  regulatorView?: boolean;
}

export function MqttOpcuaConnectorTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<MocRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'credential_revoked' : 'active');
  const [selected, setSelected] = useState<MocRow | null>(null);
  const [events, setEvents] = useState<MocEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: MocRow[] } & KpiSummary }>('/mqtt-opcua-connector');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          provisioned_count: data.provisioned_count || 0,
          topics_count: data.topics_count || 0,
          tls_count: data.tls_count || 0,
          client_count: data.client_count || 0,
          publishing_count: data.publishing_count || 0,
          validated_count: data.validated_count || 0,
          companion_count: data.companion_count || 0,
          live_count: data.live_count || 0,
          reconciliation_count: data.reconciliation_count || 0,
          archived_count: data.archived_count || 0,
          disconnected_count: data.disconnected_count || 0,
          revoked_count: data.revoked_count || 0,
          suspended_count: data.suspended_count || 0,
          failover_count: data.failover_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w122_bridged_count: data.w122_bridged_count || 0,
          w71_bridged_count: data.w71_bridged_count || 0,
          w50_bridged_count: data.w50_bridged_count || 0,
          w26_bridged_count: data.w26_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          telemetry_quality_avg: data.telemetry_quality_avg || 0,
          certs_expiring_within_60d: data.certs_expiring_within_60d || 0,
          certs_expiring_within_14d: data.certs_expiring_within_14d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load MQTT/OPC-UA connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { connector: MocRow; events: MocEvent[] } }>(`/mqtt-opcua-connector/${id}`);
      if (res.data?.data?.connector) setSelected(res.data.data.connector);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load connector history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'reportable')       return !!r.is_reportable_flag;
      if (filter === 'breached')         return r.sla_breached_live;
      if (filter === 'cert_60d')         return (r.days_to_cert_renewal_live ?? 9999) < 60;
      if (filter === 'cert_14d')         return (r.days_to_cert_renewal_live ?? 9999) < 14;
      if (filter === 'health_red')       return r.connector_health_band_live === 'red';
      if (filter === 'health_critical')  return r.connector_health_band_live === 'critical';
      if (filter === 'national_floor')   return !!r.floor_at_national_iot_backbone_live;
      if (filter === 'large_floor')      return !!r.floor_at_large_fleet_live;
      if (filter.startsWith('tier:'))    return r.current_tier === filter.slice(5);
      if (filter.startsWith('proto:'))   return r.protocol === filter.slice(6);
      if (filter.startsWith('companion:')) return r.companion_spec === filter.slice(10);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: MocRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'provision-broker') {
        const ec = window.prompt('Endpoint count (devices/inverters/meters):', String(row.endpoint_count ?? 50));
        if (ec !== null) body.endpoint_count = Number(ec);
        const nm = window.prompt('Broker name:', row.broker_name ?? '');
        if (nm !== null) body.broker_name = nm;
      } else if (action === 'map-topics') {
        const tc = window.prompt('Subscription topic count:', String(row.subscription_topic_count ?? 32));
        if (tc !== null) body.subscription_topic_count = Number(tc);
        const rc = window.prompt('Retained message count:', String(row.retained_message_count ?? 16));
        if (rc !== null) body.retained_message_count = Number(rc);
      } else if (action === 'configure-mutual-tls') {
        const fp = window.prompt('mTLS cert fingerprint (SHA-256, lowercase hex):', row.tls_cert_fingerprint ?? '');
        if (fp !== null) body.tls_cert_fingerprint = fp;
        const exp = window.prompt('Cert expiry ISO date (e.g. 2027-05-31T00:00:00Z):', row.tls_cert_expiry_at ?? '');
        if (exp !== null) body.tls_cert_expiry_at = exp;
        body.tls_cert_valid = window.confirm('mTLS cert validated against trust list?') ? 1 : 0;
        body.iec_62443_cipher_ok = window.confirm('IEC 62443 cipher suite negotiated?') ? 1 : 0;
      } else if (action === 'register-client') {
        body.protocol_compliant = window.confirm('Protocol binding compliant on registration?') ? 1 : 0;
      } else if (action === 'start-publishing') {
        const mps = window.prompt('Messages per second (steady-state):', String(row.messages_per_second ?? 250));
        if (mps !== null) body.messages_per_second = Number(mps);
        const pub = window.prompt('Active publishers (devices):', String(row.active_publishers ?? row.endpoint_count ?? 50));
        if (pub !== null) body.active_publishers = Number(pub);
      } else if (action === 'validate-subscription') {
        const sub = window.prompt('Active subscribers:', String(row.active_subscribers ?? 5));
        if (sub !== null) body.active_subscribers = Number(sub);
        const p99 = window.prompt('QoS p99 (ms):', String(row.qos_p99_ms ?? 35));
        if (p99 !== null) body.qos_p99_ms = Number(p99);
        const pq = window.prompt('Payload quality (0-130):', String(row.payload_quality_index ?? 95));
        if (pq !== null) body.payload_quality_index = Number(pq);
      } else if (action === 'bind-companion-spec') {
        const cs = window.prompt(
          'Companion spec (pv_industry / energy / battery / inverter / wind):',
          row.companion_spec ?? 'pv_industry',
        );
        if (cs === null) return;
        body.companion_spec = cs;
        const ver = window.prompt('Companion spec version:', row.companion_spec_version ?? '1.0.0');
        if (ver !== null) body.companion_spec_version = ver;
        const note = window.prompt(
          'Bind notes. NOTE: SIGNATURE - crosses NERSA at national_iot_backbone WHEN IEEE 2030.5 CSIP inverter control flag is set.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'go-live') {
        const note = window.prompt('Go-live notes (CISO sign-off):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'disconnect') {
        const reason = window.prompt(
          'Disconnect reason. NOTE: HARD terminal - crosses regulator EVERY tier WHEN critical_safety_payload.',
          row.reason_code ?? 'peer_hard_fail',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (maintenance window?):', row.reason_code ?? 'maintenance_window');
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'revoke-credential') {
        const reason = window.prompt(
          'Revoke credential reason. NOTE: SIGNATURE - MQTT-OPCUA-REVOKE crosses regulator EVERY tier (NERSA Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700 cyber notice).',
          row.reason_code ?? 'credential_compromised',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover') {
        const note = window.prompt(
          'Failover notes. NOTE: crosses regulator at large + national tiers (IoT-availability event).',
          '',
        );
        if (note !== null) body.notes = note;
      }
      await api.post(`/mqtt-opcua-connector/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/mqtt-opcua-connector', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">MQTT / OPC UA connector</h2>
          <p className="text-[11px] text-[#4a5568]">
            11-state forward + 4 branch IoT broker bridge - MQTT v5 / MQTT-SN / OPC UA 1.05 / Pub/Sub / Sparkplug B / IEC 61400-25 / IEEE 2030.5 CSIP / SunSpec Modbus
            across PV-industry / energy / battery / inverter / wind companion specs.
            Beats AWS IoT Core + Azure IoT Hub + HiveMQ Enterprise + EMQX + VerneMQ + Kepware KEPServerEX + Matrikon OPC UA Server.
            INVERTED SLA HOURS (edge 168 / small 240 / medium 360 / large 480 / national 720).
            FLOOR-AT-LARGE-FLEET {'≥'}1 flag / FLOOR-AT-NATIONAL-IOT-BACKBONE {'≥'}3 flags. Mandatory audit-chain bridge.
            SIGNATURE: revoke_credential crosses EVERY tier (NERSA Grid Code C-3 + IEC 62443 + POPIA s19 + SARB BA 700 cyber notice).
            External IoT peer reads via mTLS-gated /api/mqtt-opcua-connector/peer/:peer_id with x-mtls-cert-fingerprint header.
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]"
          >
            + Propose connector
          </button>
        )}
      </div>

      {/* 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label="Total"             value={kpis.total} />
        <Kpi label="Active"            value={kpis.active_count} />
        <Kpi label="Live"              value={kpis.live_count} tone="ok" />
        <Kpi label="Revoked"           value={kpis.revoked_count} tone={kpis.revoked_count > 0 ? 'bad' : undefined} />
        <Kpi label="Disconnected"      value={kpis.disconnected_count} tone={kpis.disconnected_count > 0 ? 'bad' : undefined} />
        <Kpi label="Failover"          value={kpis.failover_count} tone={kpis.failover_count > 0 ? 'warn' : undefined} />
        <Kpi label="SLA breached"      value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Telemetry avg"     value={`${kpis.telemetry_quality_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.proposed_count}</span></span>
        <span>Provisioned: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.provisioned_count}</span></span>
        <span>Topics: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.topics_count}</span></span>
        <span>mTLS: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.tls_count}</span></span>
        <span>Client: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.client_count}</span></span>
        <span>Publishing: <span className="font-semibold text-[#a06200]">{kpis.publishing_count}</span></span>
        <span>Validated: <span className="font-semibold text-[#a06200]">{kpis.validated_count}</span></span>
        <span>Companion: <span className="font-semibold text-[#a06200]">{kpis.companion_count}</span></span>
        <span>Reconciliation: <span className="font-semibold text-[#1f6b3a]">{kpis.reconciliation_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Cert {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.certs_expiring_within_60d}</span></span>
        <span>Cert {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.certs_expiring_within_14d}</span></span>
        <span>Audit chain: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w118_bridged_count}</span></span>
        <span>SCADA: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w122_bridged_count}</span></span>
        <span>Prognostics: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w71_bridged_count}</span></span>
        <span>Reserve: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w50_bridged_count}</span></span>
        <span>Cyber: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w26_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 3: tier */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_TIER.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#7a0e0e] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 4: protocols */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_PROTOCOL.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 5: companion specs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_COMPANION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#1f6b3a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Connector #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Broker</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Protocol</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Companion</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Health</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Telemetry</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Cert</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Flags</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.connector_health_band_live ?? r.connector_health_band ?? 'green'];
                const telemetry = r.telemetry_quality_index_live ?? r.telemetry_quality_index ?? 0;
                const certDays = r.days_to_cert_renewal_live ?? r.days_to_cert_renewal ?? null;
                const flags = r.floor_flag_count_live ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.connector_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.peer_id}</div>
                      {r.is_reportable_flag ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                      {r.regulator_ref ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">FILED</span> : null}
                      {r.floor_at_national_iot_backbone_live ? <span className="ml-1 text-[9px] font-semibold text-[#7a0e0e]">NAT</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.broker_name ?? '-'}
                      {r.endpoint_count != null ? <div className="text-[10px] text-[#6b7685] font-mono">{r.endpoint_count} endpoints</div> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {fmtProto(r.protocol)}
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.companion_spec ? <span className="font-mono">{r.companion_spec}</span> : '-'}
                      {r.companion_spec_version ? <div className="text-[10px] text-[#6b7685] font-mono">{r.companion_spec_version}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: health.bg, color: health.fg }}>
                        {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${telemetry >= 100 ? 'text-[#1f5b3a]' : telemetry >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {telemetry}/130
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${certDays != null && certDays < 14 ? 'text-[#9b1f1f] font-semibold' : certDays != null && certDays < 60 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {certDays != null ? `${certDays}d` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${flags >= 3 ? 'text-[#7a0e0e] font-semibold' : flags >= 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>
                      {flags}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No connectors match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} regulatorView={!!regulatorView} />
      )}

      {showPropose && (
        <ProposeModal onClose={() => setShowPropose(false)} onSubmit={propose} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct, regulatorView,
}: {
  row: MocRow;
  events: MocEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: MocRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const telemetry = row.telemetry_quality_index_live ?? row.telemetry_quality_index ?? 0;
  const certDays  = row.days_to_cert_renewal_live ?? row.days_to_cert_renewal ?? null;
  const flags     = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: MocStatus[] = [
    'connector_proposed', 'broker_provisioned', 'topics_mapped',
    'tls_mutual_configured', 'client_registered', 'publishing_active',
    'subscription_validated', 'companion_spec_bound',
    'live_streaming', 'reconciliation_active',
    'suspended', 'failover_active',
  ];
  const SUSPEND_FROM: MocStatus[] = [
    'broker_provisioned', 'topics_mapped', 'tls_mutual_configured',
    'client_registered', 'publishing_active', 'subscription_validated',
    'companion_spec_bound', 'live_streaming', 'reconciliation_active',
  ];
  const FAILOVER_FROM: MocStatus[] = ['live_streaming', 'reconciliation_active'];
  const DISCONNECT_FROM = ACTIVE_NON_TERMINAL;
  const REVOKE_FROM = ACTIVE_NON_TERMINAL;

  const canSuspend    = SUSPEND_FROM.includes(row.chain_status);
  const canFailover   = FAILOVER_FROM.includes(row.chain_status);
  const canDisconnect = DISCONNECT_FROM.includes(row.chain_status);
  const canRevoke     = REVOKE_FROM.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#c2873a] text-white hover:bg-[#c2873a]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] hover:bg-[#f3f5f9]';
    return (
      <button type="button"
        key={action}
        onClick={() => onAct(action, row)}
        className={`rounded px-3 py-1.5 text-[11px] font-semibold ${cls}`}
        style={tone === 'plain' ? { color: 'oklch(0.46 0.16 55)' } : undefined}
        title={ACTION_LABEL[action]}
      >
        {label}
      </button>
    );
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[#f3f5f9] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">
              {fmtProto(row.protocol)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.endpoint_count != null ? <> {'•'} {row.endpoint_count} endpoints</> : null}
              {row.companion_spec ? <> {'•'} {row.companion_spec}</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.connector_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'MQTT/OPC-UA connector'} {'•'} peer <span className="font-mono">{row.peer_id}</span>
              {row.broker_name ? <> {'•'} {row.broker_name}</> : null}
              {row.endpoint_url ? <> {'•'} <span className="font-mono text-[10px]">{row.endpoint_url}</span></> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Telemetry" value={`${telemetry}/130`} tone={telemetry >= 100 ? 'ok' : telemetry >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Cert days" value={certDays != null ? `${certDays}d` : '-'} tone={certDays != null && certDays < 14 ? 'bad' : certDays != null && certDays < 60 ? 'warn' : 'ok'} />
          <Kpi label="Floor flags" value={flags} tone={flags >= 3 ? 'bad' : flags >= 1 ? 'warn' : 'ok'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours}h`} />
        </div>

        {/* Telemetry battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Publishers</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.active_publishers ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Subscribers</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.active_subscribers ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Topics</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.subscription_topic_count ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Retained</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.retained_message_count ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Msgs/sec</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.messages_per_second ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">QoS p99</div>
            <div className={`font-mono text-[12px] ${(row.qos_p99_ms ?? 0) > 150 ? 'text-[#9b1f1f] font-semibold' : (row.qos_p99_ms ?? 0) > 80 ? 'text-[#a06200]' : 'text-[#0c2a4d]'}`}>{row.qos_p99_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Payload quality</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.payload_quality_index ?? '-'}/130</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Ctrl auth/exec</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.control_commands_authorized_count ?? 0} / {row.control_commands_executed_24h ?? 0}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">mTLS cert</div>
            <div className={`font-mono text-[12px] ${row.tls_cert_valid ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}`}>{row.tls_cert_valid ? 'VALID' : 'INVALID'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">IEC 62443</div>
            <div className={`font-mono text-[12px] ${row.iec_62443_cipher_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.iec_62443_cipher_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Protocol</div>
            <div className={`font-mono text-[12px] ${row.protocol_compliant ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.protocol_compliant ? 'COMPLIANT' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Cert expiry</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtDate(row.tls_cert_expiry_at)}</div>
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-NATIONAL-IOT-BACKBONE {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.critical_safety_payload} label="Safety payload" />
            <FlagPill on={!!row.cross_border_iot_traffic} label="Cross-border IoT" />
            <FlagPill on={!!row.sparkplug_b_required} label="Sparkplug B" />
            <FlagPill on={!!row.ieee_2030_5_csip_inverter_control} label="IEEE 2030.5 CSIP" />
            <FlagPill on={!!row.aggregated_demand_response_above_50mw} label="DR >50 MW" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (audit-chain mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="Audit chain" />
            <BridgePill on={!!row.bridges_to_w122_scada_connector_live} label="SCADA" />
            <BridgePill on={!!row.bridges_to_w71_asset_prognostics_live} label="Prognostics" />
            <BridgePill on={!!row.bridges_to_w50_reserve_activation_live} label="Reserve" />
            <BridgePill on={!!row.bridges_to_w26_cyber_incident_live} label="Cyber" />
          </div>
        </div>

        {/* Regulator + reason */}
        {(row.is_reportable_flag || row.regulator_ref || row.regulator_inbox_ref || row.reason_code) && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-[11px] text-[#7a1f1f]">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#9b1f1f]">Regulator crossing</div>
            {row.reason_code && <div>Reason: <span className="font-mono">{row.reason_code}</span></div>}
            {row.regulator_reason_text && <div>Detail: {row.regulator_reason_text}</div>}
            {row.regulator_ref && <div>Filed ref: <span className="font-mono">{row.regulator_ref}</span></div>}
            {row.regulator_inbox_ref && <div>Inbox: <span className="font-mono">{row.regulator_inbox_ref}</span></div>}
            {row.regulator_crossed_at && <div>Crossed at: {fmtDate(row.regulator_crossed_at)}</div>}
          </div>
        )}

        {/* Action bar */}
        {!regulatorView && !row.is_hard_terminal && (
          <div className="mb-4 flex flex-wrap gap-2 rounded border border-[#d8dde6] bg-white p-3">
            {nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split('(')[0].trim(), 'primary')}
            {canSuspend && row.chain_status !== 'suspended' && renderAct('suspend', 'Suspend', 'amber')}
            {row.chain_status === 'suspended' && renderAct('resume', 'Resume', 'primary')}
            {canFailover && renderAct('activate-failover', 'Failover', 'amber')}
            {canDisconnect && renderAct('disconnect', 'Disconnect (HARD)', 'danger')}
            {canRevoke && renderAct('revoke-credential', 'REVOKE CREDENTIAL (SIGNATURE)', 'danger')}
          </div>
        )}

        {/* Timeline */}
        <div className="rounded border border-[#d8dde6] bg-white">
          <div className="border-b border-[#e3e7ec] px-3 py-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Timeline</div>
          <ol className="divide-y divide-[#e3e7ec]">
            {events.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[#6b7685]">No events.</li>
            )}
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2 text-[11px]">
                <div className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.event_type}</div>
                <div className="text-[10px] text-[#4a5568]">
                  {e.from_status || '-'} {'→'} {e.to_status || '-'}
                  {e.actor_party ? <> {'•'} {e.actor_party}</> : null}
                  {' '}{'•'} {fmtDate(e.created_at)}
                </div>
                {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#7a0e0e] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

function BridgePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#c2873a] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

const PROTOCOL_OPTIONS: Array<{ key: MqttOpcuaProtocol; label: string }> = [
  { key: 'mqtt_v5',        label: 'MQTT v5' },
  { key: 'mqtt_sn',        label: 'MQTT-SN' },
  { key: 'opc_ua_1_05',    label: 'OPC UA 1.05' },
  { key: 'opc_ua_pubsub',  label: 'OPC UA Pub/Sub' },
  { key: 'sparkplug_b',    label: 'Sparkplug B' },
  { key: 'iec_61400_25',   label: 'IEC 61400-25' },
  { key: 'ieee_2030_5',    label: 'IEEE 2030.5 CSIP' },
  { key: 'sunspec_modbus', label: 'SunSpec Modbus' },
];

const COMPANION_OPTIONS: Array<{ key: CompanionSpec; label: string }> = [
  { key: 'pv_industry', label: 'PV industry' },
  { key: 'energy',      label: 'Energy' },
  { key: 'battery',     label: 'Battery' },
  { key: 'inverter',    label: 'Inverter' },
  { key: 'wind',        label: 'Wind' },
];

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [peerId, setPeerId] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [endpointCount, setEndpointCount] = useState('');
  const [protocol, setProtocol] = useState<MqttOpcuaProtocol>('mqtt_v5');
  const [companionSpec, setCompanionSpec] = useState<CompanionSpec | ''>('');
  const [companionVersion, setCompanionVersion] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w122, setW122] = useState('');
  const [w71, setW71]   = useState('');
  const [w50, setW50]   = useState('');
  const [w26, setW26]   = useState('');
  const [safetyPayload, setSafetyPayload] = useState(false);
  const [crossBorder, setCrossBorder] = useState(false);
  const [sparkplug, setSparkplug] = useState(false);
  const [csip, setCsip] = useState(false);
  const [drAbove50mw, setDrAbove50mw] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      protocol,
      peer_id: peerId || undefined,
      broker_name: brokerName || undefined,
      endpoint_count: endpointCount ? Number(endpointCount) : undefined,
      companion_spec: companionSpec || undefined,
      companion_spec_version: companionVersion || undefined,
      endpoint_url: endpointUrl || undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w122_scada_connector_ref: w122 || undefined,
      w71_asset_prognostics_ref: w71 || undefined,
      w50_reserve_activation_ref: w50 || undefined,
      w26_cyber_incident_ref: w26 || undefined,
      critical_safety_payload: safetyPayload ? 1 : 0,
      cross_border_iot_traffic: crossBorder ? 1 : 0,
      sparkplug_b_required: sparkplug ? 1 : 0,
      ieee_2030_5_csip_inverter_control: csip ? 1 : 0,
      aggregated_demand_response_above_50mw: drAbove50mw ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose MQTT / OPC UA connector</h3>
            <p className="text-[11px] text-[#4a5568]">
              Audit-chain bridge mandatory. Tier auto-derived from endpoint_count with FLOOR-AT-LARGE-FLEET {'≥'}1 flag and FLOOR-AT-NATIONAL-IOT-BACKBONE {'≥'}3 flags.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peer id (IoT counterparty)">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="kakamas-iot-hub" />
          </Field>
          <Field label="Broker name">
            <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Kakamas IoT broker" />
          </Field>
          <Field label="Endpoint count (devices/inverters)">
            <input value={endpointCount} onChange={(e) => setEndpointCount(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="50" />
          </Field>
          <Field label="Protocol">
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as MqttOpcuaProtocol)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {PROTOCOL_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Companion spec">
            <select value={companionSpec} onChange={(e) => setCompanionSpec(e.target.value as CompanionSpec)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              <option value="">-- none --</option>
              {COMPANION_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Companion spec version">
            <input value={companionVersion} onChange={(e) => setCompanionVersion(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1.0.0" />
          </Field>
          <Field label="Endpoint URL">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="mqtts://broker.example.za:8883" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Kakamas inverter fleet MQTT v5 connector" />
          </Field>
          <Field label="Audit-chain block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="SCADA connector ref">
            <input value={w122} onChange={(e) => setW122(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="scc-2026-0042" />
          </Field>
          <Field label="Asset prognostics ref">
            <input value={w71} onChange={(e) => setW71(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="aprog-2026-0021" />
          </Field>
          <Field label="Reserve activation ref">
            <input value={w50} onChange={(e) => setW50(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="rsv-act-2026-0011" />
          </Field>
          <Field label="Cyber incident ref">
            <input value={w26} onChange={(e) => setW26(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="cyber-2026-0005" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-NATIONAL-IOT-BACKBONE {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={safetyPayload} onChange={setSafetyPayload} label="Critical safety payload" />
            <Checkbox checked={crossBorder} onChange={setCrossBorder} label="Cross-border IoT traffic" />
            <Checkbox checked={sparkplug} onChange={setSparkplug} label="Sparkplug B required" />
            <Checkbox checked={csip} onChange={setCsip} label="IEEE 2030.5 CSIP inverter control" />
            <Checkbox checked={drAbove50mw} onChange={setDrAbove50mw} label="Aggregated DR > 50 MW" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose connector</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-[#4a5568]">
      <div className="mb-1 text-[10px] uppercase tracking-wider">{label}</div>
      {children}
    </label>
  );
}

function Checkbox({
  checked, onChange, label,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default MqttOpcuaConnectorTab;
