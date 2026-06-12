// Wave 122 - SCADA / IEC 61850 Substation Connector.
//
// Phase C opener. Closes the audit-namespace family at W121 and opens
// the external-system connector family (W122-W126). Real-time
// bidirectional protocol bridge between the Consolidated Energy Cockpit and
// IPP / grid SCADA systems.
//
// Mounted at /grid-ops/workstation?tab=scada-connectors for grid write,
// and /ipp-developer/workstation?tab=scada-connectors for IPP write.
//
// Beats: Triangle MicroWorks SCADA Data Gateway + Kalkitech SYNC 4000
// + NovaTech Orion LX + SEL RTAC + GE iFIX historian + OSIsoft PI System
// + AVEVA System Platform.
//
// 12-state forward + 4 branch lifecycle:
//   connector_proposed -> endpoints_discovered -> tls_configured ->
//     handshake_completed -> telemetry_streaming -> quality_validated ->
//     alarms_subscribed -> control_commands_authorized ->
//     live_operations -> reconciliation_active -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD - peer-side)
//   any non-terminal -> revoke -> revoked (HARD - cert revoked)
//   active states -> suspend -> suspended (SOFT - maintenance)
//   live -> activate_failover -> failover_active (SOFT - cutover)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger substation = MORE time:
//   pilot 168h / small 240h / medium 360h / large 480h / national 720h.
// FLOOR-AT-LARGE-SUBSTATION on >=1 of 5 flags; FLOOR-AT-NATIONAL >=3.
// Flags: peak_demand_window / black_start_path_required /
// cross_border_link / nersa_grid_code_compliance /
// critical_substation_n_minus_1.
//
// SIGNATURE Phase-C regulator crossings:
//   * revoke crosses EVERY tier (W122 SIGNATURE SCADA-CONNECTOR-REVOKE -
//     NERSA + SARB BA 700 cyber notice + SOC report)
//   * activate_failover crosses large_substation + national_grid_backbone
//   * disconnect crosses EVERY tier when critical_substation_n_minus_1
//   * authorize_control_commands national_grid_backbone only (NERSA C-3
//     + SARB BA 700 mandatory)
//   * sla_breached large_substation + national_grid_backbone only
//
// Write {admin, grid_operator, ipp_developer}. READ all 9 personas.
// EXTERNAL scada_counterparty via mTLS-gated PUBLIC peer endpoint.
//
// 5 bridges (W118 MANDATORY): W110 transmission outage + W50 reserve
// activation + W67 grid code compliance + W26 cyber incident + W118
// block ref.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type SccStatus =
  | 'connector_proposed' | 'endpoints_discovered' | 'tls_configured'
  | 'handshake_completed' | 'telemetry_streaming' | 'quality_validated'
  | 'alarms_subscribed' | 'control_commands_authorized'
  | 'live_operations' | 'reconciliation_active' | 'archived'
  | 'disconnected' | 'revoked' | 'suspended' | 'failover_active';

type SccTier = 'pilot' | 'small_substation' | 'medium_substation' | 'large_substation' | 'national_grid_backbone';
type SccUrgency = 'low' | 'medium' | 'high' | 'critical';
type SccAuthority = 'NOC_engineer' | 'grid_engineer' | 'SO_supervisor' | 'SO_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type ScadaProtocol =
  | 'iec_61850_mms' | 'iec_61850_goose' | 'iec_61850_sv'
  | 'iec_60870_5_104' | 'dnp3_tcp' | 'modbus_tcp' | 'modbus_rtu'
  | 'ieee_c37_118' | 'opc_ua';

interface SccRow {
  [key: string]: unknown;
  id: string;
  connector_number: string;
  peer_id: string;
  substation_name: string | null;
  substation_capacity_mva: number | null;
  protocol: ScadaProtocol;
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
  authority_required: SccAuthority | null;
  urgency_band: SccUrgency | null;
  connector_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
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
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: SccUrgency;
  authority_required_live?: SccAuthority;
  days_to_cert_renewal_live?: number;
  floor_flag_count_live?: number;
  floor_at_large_substation_live?: boolean;
  floor_at_national_grid_backbone_live?: boolean;
  telemetry_quality_index_live?: number;
  connector_health_band_live?: HealthBand;
  bridges_to_w110_transmission_outage_live?: boolean;
  bridges_to_w50_reserve_activation_live?: boolean;
  bridges_to_w67_grid_code_compliance_live?: boolean;
  bridges_to_w26_cyber_incident_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface SccEvent {
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

const STATE_TONE: Record<SccStatus, { bg: string; fg: string; label: string }> = {
  connector_proposed:           { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  endpoints_discovered:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Endpoints discovered' },
  tls_configured:               { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'TLS configured' },
  handshake_completed:          { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Handshake' },
  telemetry_streaming:          { bg: '#fff4d6', fg: '#a06200', label: 'Streaming' },
  quality_validated:            { bg: '#fff4d6', fg: '#a06200', label: 'Quality validated' },
  alarms_subscribed:            { bg: '#fff4d6', fg: '#a06200', label: 'Alarms subscribed' },
  control_commands_authorized:  { bg: '#fff4d6', fg: '#a06200', label: 'Control authorized' },
  live_operations:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live operations' },
  reconciliation_active:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reconciliation' },
  archived:                     { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  disconnected:                 { bg: '#7a0e0e', fg: '#fff',    label: 'Disconnected' },
  revoked:                      { bg: '#7a0e0e', fg: '#fff',    label: 'Revoked' },
  suspended:                    { bg: '#e3e7ec', fg: '#445',    label: 'Suspended' },
  failover_active:              { bg: '#fff4d6', fg: '#a06200', label: 'Failover active' },
};

const TIER_TONE: Record<SccTier, { bg: string; fg: string; label: string }> = {
  pilot:                    { bg: '#e3e7ec', fg: '#557',    label: 'Pilot' },
  small_substation:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Small substation' },
  medium_substation:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium substation' },
  large_substation:         { bg: '#fff4d6', fg: '#a06200', label: 'Large substation' },
  national_grid_backbone:   { bg: '#7a0e0e', fg: '#fff',    label: 'National grid backbone' },
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
  { key: 'revoked',         label: 'Revoked' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'connector_proposed',          label: 'Proposed' },
  { key: 'endpoints_discovered',        label: 'Discovered' },
  { key: 'tls_configured',              label: 'TLS' },
  { key: 'handshake_completed',         label: 'Handshake' },
  { key: 'telemetry_streaming',         label: 'Streaming' },
  { key: 'quality_validated',           label: 'Validated' },
  { key: 'alarms_subscribed',           label: 'Alarms' },
  { key: 'control_commands_authorized', label: 'Control' },
  { key: 'live_operations',             label: 'Live' },
  { key: 'reconciliation_active',       label: 'Recon' },
  { key: 'archived',                    label: 'Archived' },
  { key: 'disconnected',                label: 'Disconnected' },
  { key: 'revoked',                     label: 'Revoked' },
  { key: 'suspended',                   label: 'Suspended' },
  { key: 'failover_active',             label: 'Failover' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:pilot',                  label: 'Pilot (168h)' },
  { key: 'tier:small_substation',       label: 'Small (240h)' },
  { key: 'tier:medium_substation',      label: 'Medium (360h)' },
  { key: 'tier:large_substation',       label: 'Large (480h)' },
  { key: 'tier:national_grid_backbone', label: 'National (720h)' },
];

const FILTERS_PROTOCOL: Array<{ key: string; label: string }> = [
  { key: 'proto:iec_61850_mms',   label: 'IEC 61850 MMS' },
  { key: 'proto:iec_61850_goose', label: 'IEC 61850 GOOSE' },
  { key: 'proto:iec_61850_sv',    label: 'IEC 61850 SV' },
  { key: 'proto:iec_60870_5_104', label: 'IEC 60870-5-104' },
  { key: 'proto:dnp3_tcp',        label: 'DNP3 TCP' },
  { key: 'proto:modbus_tcp',      label: 'Modbus TCP' },
  { key: 'proto:modbus_rtu',      label: 'Modbus RTU' },
  { key: 'proto:ieee_c37_118',    label: 'IEEE C37.118' },
  { key: 'proto:opc_ua',          label: 'OPC UA' },
];

type ActionKind =
  | 'discover-endpoints' | 'configure-tls' | 'complete-handshake'
  | 'start-telemetry' | 'validate-quality' | 'subscribe-alarms'
  | 'authorize-control-commands' | 'go-live' | 'activate-reconciliation'
  | 'archive' | 'disconnect' | 'suspend' | 'resume' | 'revoke'
  | 'activate-failover';

const ACTION_FOR_STATE: Partial<Record<SccStatus, ActionKind>> = {
  connector_proposed:           'discover-endpoints',
  endpoints_discovered:         'configure-tls',
  tls_configured:               'complete-handshake',
  handshake_completed:          'start-telemetry',
  telemetry_streaming:          'validate-quality',
  quality_validated:            'subscribe-alarms',
  alarms_subscribed:            'authorize-control-commands',
  control_commands_authorized:  'go-live',
  live_operations:              'activate-reconciliation',
  reconciliation_active:        'archive',
  suspended:                    'resume',
  failover_active:              'go-live',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'discover-endpoints':         'Discover endpoints (NOC engineer - logical-node + data-object scan)',
  'configure-tls':              'Configure TLS (grid engineer - IEC 62351 cipher + cert pinning)',
  'complete-handshake':         'Complete handshake (grid engineer - protocol-bind ACK)',
  'start-telemetry':            'Start telemetry (NOC engineer - subscribe to publish stream)',
  'validate-quality':           'Validate quality (NOC engineer - SNR + latency + jitter + loss)',
  'subscribe-alarms':           'Subscribe alarms (SO supervisor - condition-monitoring topics)',
  'authorize-control-commands': 'AUTHORIZE CONTROL (SO CEO - NERSA C-3 + SARB BA 700 at national)',
  'go-live':                    'Go live (SO supervisor - production telemetry + control plane)',
  'activate-reconciliation':    'Activate reconciliation (NOC engineer - meter-vs-SCADA tie-out)',
  'archive':                    'Archive (SO supervisor - HARD terminal, retire connector)',
  'disconnect':                 'DISCONNECT (peer-side hard fail - crosses EVERY tier when N-1)',
  'suspend':                    'Suspend (NOC engineer - maintenance window, SOFT)',
  'resume':                     'Resume (NOC engineer - exit maintenance)',
  'revoke':                     'REVOKE (SIGNATURE - cert/cred revoked by counterparty, crosses EVERY tier)',
  'activate-failover':          'Activate failover (cutover to secondary peer, large/national cross)',
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

function fmtProto(p: ScadaProtocol | string | null | undefined): string {
  if (!p) return '-';
  return String(p).replace(/_/g, ' ').toUpperCase();
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  discovered_count: number;
  tls_count: number;
  handshake_count: number;
  streaming_count: number;
  validated_count: number;
  alarms_count: number;
  authorized_count: number;
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
  w110_bridged_count: number;
  w50_bridged_count: number;
  w67_bridged_count: number;
  w26_bridged_count: number;
  w118_bridged_count: number;
  telemetry_quality_avg: number;
  certs_expiring_within_60d: number;
  certs_expiring_within_14d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, discovered_count: 0, tls_count: 0, handshake_count: 0,
  streaming_count: 0, validated_count: 0, alarms_count: 0, authorized_count: 0,
  live_count: 0, reconciliation_count: 0, archived_count: 0,
  disconnected_count: 0, revoked_count: 0, suspended_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w110_bridged_count: 0, w50_bridged_count: 0, w67_bridged_count: 0,
  w26_bridged_count: 0, w118_bridged_count: 0,
  telemetry_quality_avg: 0,
  certs_expiring_within_60d: 0, certs_expiring_within_14d: 0,
};

interface Props {
  // External / regulator-view: shows disconnected + revoked + reportable
  // rows only, read-only. Used to inspect SCADA-CONNECTOR-REVOKE
  // signature lines under NERSA Grid Code C-3 + SARB BA 700.
  regulatorView?: boolean;
}

export function ScadaConnectorTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<SccRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'revoked' : 'active');
  const [selected, setSelected] = useState<SccRow | null>(null);
  const [events, setEvents] = useState<SccEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SccRow[] } & KpiSummary }>('/scada-connector');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          discovered_count: data.discovered_count || 0,
          tls_count: data.tls_count || 0,
          handshake_count: data.handshake_count || 0,
          streaming_count: data.streaming_count || 0,
          validated_count: data.validated_count || 0,
          alarms_count: data.alarms_count || 0,
          authorized_count: data.authorized_count || 0,
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
          w110_bridged_count: data.w110_bridged_count || 0,
          w50_bridged_count: data.w50_bridged_count || 0,
          w67_bridged_count: data.w67_bridged_count || 0,
          w26_bridged_count: data.w26_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          telemetry_quality_avg: data.telemetry_quality_avg || 0,
          certs_expiring_within_60d: data.certs_expiring_within_60d || 0,
          certs_expiring_within_14d: data.certs_expiring_within_14d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load SCADA connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { connector: SccRow; events: SccEvent[] } }>(`/scada-connector/${id}`);
      if (res.data?.data?.connector) setSelected(res.data.data.connector);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load connector history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return !!r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'cert_60d')        return (r.days_to_cert_renewal_live ?? 9999) < 60;
      if (filter === 'cert_14d')        return (r.days_to_cert_renewal_live ?? 9999) < 14;
      if (filter === 'health_red')      return r.connector_health_band_live === 'red';
      if (filter === 'health_critical') return r.connector_health_band_live === 'critical';
      if (filter === 'national_floor')  return !!r.floor_at_national_grid_backbone_live;
      if (filter === 'large_floor')     return !!r.floor_at_large_substation_live;
      if (filter.startsWith('tier:'))   return r.current_tier === filter.slice(5);
      if (filter.startsWith('proto:'))  return r.protocol === filter.slice(6);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: SccRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'discover-endpoints') {
        const lnc = window.prompt('Logical node count (IEC 61850 LN):', String(row.logical_node_count ?? 25));
        if (lnc !== null) body.logical_node_count = Number(lnc);
        const doc = window.prompt('Data object count:', String(row.data_object_count ?? 240));
        if (doc !== null) body.data_object_count = Number(doc);
      } else if (action === 'configure-tls') {
        const fp = window.prompt('TLS cert fingerprint (SHA-256, lowercase hex):', row.tls_cert_fingerprint ?? '');
        if (fp !== null) body.tls_cert_fingerprint = fp;
        const exp = window.prompt('Cert expiry ISO date (e.g. 2027-05-31T00:00:00Z):', row.tls_cert_expiry_at ?? '');
        if (exp !== null) body.tls_cert_expiry_at = exp;
        body.tls_cert_valid = window.confirm('TLS cert validated against trust list?') ? 1 : 0;
        body.iec_62351_cipher_ok = window.confirm('IEC 62351 cipher suite negotiated?') ? 1 : 0;
      } else if (action === 'complete-handshake') {
        body.protocol_compliant = window.confirm('Protocol binding compliant on ACK?') ? 1 : 0;
      } else if (action === 'start-telemetry') {
        const mpm = window.prompt('Messages per minute (steady-state):', String(row.messages_per_minute ?? 1200));
        if (mpm !== null) body.messages_per_minute = Number(mpm);
      } else if (action === 'validate-quality') {
        const snr = window.prompt('Signal-to-noise (dB):', String(row.signal_to_noise_db ?? 35));
        if (snr !== null) body.signal_to_noise_db = Number(snr);
        const p50 = window.prompt('Latency p50 (ms):', String(row.latency_p50_ms ?? 12));
        if (p50 !== null) body.latency_p50_ms = Number(p50);
        const p99 = window.prompt('Latency p99 (ms):', String(row.latency_p99_ms ?? 45));
        if (p99 !== null) body.latency_p99_ms = Number(p99);
        const jt = window.prompt('Jitter (ms):', String(row.jitter_ms ?? 3));
        if (jt !== null) body.jitter_ms = Number(jt);
        const pl = window.prompt('Packet loss (%):', String(row.packet_loss_pct ?? 0.1));
        if (pl !== null) body.packet_loss_pct = Number(pl);
      } else if (action === 'authorize-control-commands') {
        const ok = window.confirm(
          'AUTHORIZE control-plane commands?\n\nNOTE: SIGNATURE - crosses regulator (NERSA C-3 + SARB BA 700) at national_grid_backbone tier ONLY.',
        );
        if (!ok) return;
        const note = window.prompt('Authorization notes (SO CEO sign-off):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (SO supervisor - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'disconnect') {
        const reason = window.prompt(
          'Disconnect reason. NOTE: HARD terminal - crosses regulator EVERY tier when critical_substation_n_minus_1.',
          row.reason_code ?? 'peer_hard_fail',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'suspend') {
        const reason = window.prompt('Suspend reason (maintenance window?):', row.reason_code ?? 'maintenance_window');
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'revoke') {
        const reason = window.prompt(
          'Revoke reason. NOTE: SIGNATURE - W122 SCADA-CONNECTOR-REVOKE crosses regulator EVERY tier (NERSA + SARB BA 700 cyber notice + SOC report).',
          row.reason_code ?? 'cert_revoked_by_counterparty',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover') {
        const note = window.prompt(
          'Failover notes. NOTE: crosses regulator at large + national tiers (grid-reliability event).',
          '',
        );
        if (note !== null) body.notes = note;
      }
      await api.post(`/scada-connector/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/scada-connector', body);
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
          <h2 className="text-base font-semibold text-[#0c2a4d]">SCADA / IEC 61850 connector (W122)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state forward + 4 branch protocol bridge - IEC 61850 MMS/GOOSE/SV + 60870-5-104 + DNP3 + Modbus + IEEE C37.118 + OPC UA.
            Beats Triangle MicroWorks + Kalkitech SYNC 4000 + NovaTech Orion LX + SEL RTAC + OSIsoft PI + AVEVA.
            INVERTED SLA HOURS (pilot 168 / small 240 / medium 360 / large 480 / national 720).
            FLOOR-AT-LARGE {'≥'}1 flag / FLOOR-AT-NATIONAL {'≥'}3 flags. Mandatory W118 audit bridge.
            SIGNATURE: revoke crosses EVERY tier (NERSA + SARB BA 700 cyber notice).
            External SCADA counterparty reads via mTLS-gated /api/scada-connector/peer/:peer_id.
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
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Active"           value={kpis.active_count} />
        <Kpi label="Live"             value={kpis.live_count} tone="ok" />
        <Kpi label="Revoked"          value={kpis.revoked_count} tone={kpis.revoked_count > 0 ? 'bad' : undefined} />
        <Kpi label="Disconnected"     value={kpis.disconnected_count} tone={kpis.disconnected_count > 0 ? 'bad' : undefined} />
        <Kpi label="Failover"         value={kpis.failover_count} tone={kpis.failover_count > 0 ? 'warn' : undefined} />
        <Kpi label="SLA breached"     value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Telemetry avg"    value={`${kpis.telemetry_quality_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.proposed_count}</span></span>
        <span>Discovered: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.discovered_count}</span></span>
        <span>TLS: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.tls_count}</span></span>
        <span>Handshake: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.handshake_count}</span></span>
        <span>Streaming: <span className="font-semibold text-[#a06200]">{kpis.streaming_count}</span></span>
        <span>Validated: <span className="font-semibold text-[#a06200]">{kpis.validated_count}</span></span>
        <span>Alarms: <span className="font-semibold text-[#a06200]">{kpis.alarms_count}</span></span>
        <span>Control: <span className="font-semibold text-[#a06200]">{kpis.authorized_count}</span></span>
        <span>Reconciliation: <span className="font-semibold text-[#1f6b3a]">{kpis.reconciliation_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Suspended: <span className="font-semibold text-[#6b7685]">{kpis.suspended_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Cert {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.certs_expiring_within_60d}</span></span>
        <span>Cert {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.certs_expiring_within_14d}</span></span>
        <span>W118: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w118_bridged_count}</span></span>
        <span>W110: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w110_bridged_count}</span></span>
        <span>W50: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w50_bridged_count}</span></span>
        <span>W67: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w67_bridged_count}</span></span>
        <span>W26: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w26_bridged_count}</span></span>
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
      <div className="mb-3 flex flex-wrap gap-1.5">
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Substation</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Protocol</th>
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
                      {r.floor_at_national_grid_backbone_live ? <span className="ml-1 text-[9px] font-semibold text-[#7a0e0e]">NAT</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.substation_name ?? '-'}
                      {r.substation_capacity_mva != null ? <div className="text-[10px] text-[#6b7685] font-mono">{r.substation_capacity_mva} MVA</div> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {fmtProto(r.protocol)}
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
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No connectors match.</td></tr>
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
  row: SccRow;
  events: SccEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SccRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const telemetry = row.telemetry_quality_index_live ?? row.telemetry_quality_index ?? 0;
  const certDays  = row.days_to_cert_renewal_live ?? row.days_to_cert_renewal ?? null;
  const flags     = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: SccStatus[] = [
    'connector_proposed', 'endpoints_discovered', 'tls_configured',
    'handshake_completed', 'telemetry_streaming', 'quality_validated',
    'alarms_subscribed', 'control_commands_authorized',
    'live_operations', 'reconciliation_active',
    'suspended', 'failover_active',
  ];
  const SUSPEND_FROM: SccStatus[] = [
    'telemetry_streaming', 'quality_validated', 'alarms_subscribed',
    'control_commands_authorized', 'live_operations', 'reconciliation_active',
  ];
  const FAILOVER_FROM: SccStatus[] = ['live_operations', 'reconciliation_active'];
  const DISCONNECT_FROM = ACTIVE_NON_TERMINAL;
  const REVOKE_FROM = ACTIVE_NON_TERMINAL;

  const canSuspend     = SUSPEND_FROM.includes(row.chain_status);
  const canFailover    = FAILOVER_FROM.includes(row.chain_status);
  const canDisconnect  = DISCONNECT_FROM.includes(row.chain_status);
  const canRevoke      = REVOKE_FROM.includes(row.chain_status);

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
              {row.substation_capacity_mva != null ? <> {'•'} {row.substation_capacity_mva} MVA</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.connector_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'SCADA connector'} {'•'} peer <span className="font-mono">{row.peer_id}</span>
              {row.substation_name ? <> {'•'} {row.substation_name}</> : null}
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

        {/* Quality battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Logical nodes</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.logical_node_count ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Data objects</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.data_object_count ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Msgs/min</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.messages_per_minute ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">SNR (dB)</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.signal_to_noise_db ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Latency p50</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.latency_p50_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Latency p99</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.latency_p99_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Jitter</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.jitter_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Packet loss</div>
            <div className={`font-mono text-[12px] ${(row.packet_loss_pct ?? 0) > 1 ? 'text-[#9b1f1f] font-semibold' : 'text-[#0c2a4d]'}`}>{row.packet_loss_pct ?? '-'} %</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">TLS cert</div>
            <div className={`font-mono text-[12px] ${row.tls_cert_valid ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}`}>{row.tls_cert_valid ? 'VALID' : 'INVALID'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">IEC 62351</div>
            <div className={`font-mono text-[12px] ${row.iec_62351_cipher_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.iec_62351_cipher_ok ? 'OK' : 'NO'}</div>
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
            Floor flags ({flags}/5) - FLOOR-AT-LARGE {'≥'}1, FLOOR-AT-NATIONAL {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.peak_demand_window} label="Peak demand" />
            <FlagPill on={!!row.black_start_path_required} label="Black start" />
            <FlagPill on={!!row.cross_border_link} label="Cross border" />
            <FlagPill on={!!row.nersa_grid_code_compliance} label="NERSA C-3" />
            <FlagPill on={!!row.critical_substation_n_minus_1} label="N-1 critical" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (W118 mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="W118 audit" />
            <BridgePill on={!!row.bridges_to_w110_transmission_outage_live} label="W110 outage" />
            <BridgePill on={!!row.bridges_to_w50_reserve_activation_live} label="W50 reserve" />
            <BridgePill on={!!row.bridges_to_w67_grid_code_compliance_live} label="W67 grid code" />
            <BridgePill on={!!row.bridges_to_w26_cyber_incident_live} label="W26 cyber" />
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
            {canRevoke && renderAct('revoke', 'REVOKE (SIGNATURE)', 'danger')}
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
                {e.notes && <div className="mt-1 text-[oklch(0.46_0.16_55)]">{e.notes}</div>}
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

const PROTOCOL_OPTIONS: Array<{ key: ScadaProtocol; label: string }> = [
  { key: 'iec_61850_mms',   label: 'IEC 61850 MMS' },
  { key: 'iec_61850_goose', label: 'IEC 61850 GOOSE' },
  { key: 'iec_61850_sv',    label: 'IEC 61850 SV' },
  { key: 'iec_60870_5_104', label: 'IEC 60870-5-104' },
  { key: 'dnp3_tcp',        label: 'DNP3 TCP' },
  { key: 'modbus_tcp',      label: 'Modbus TCP' },
  { key: 'modbus_rtu',      label: 'Modbus RTU' },
  { key: 'ieee_c37_118',    label: 'IEEE C37.118' },
  { key: 'opc_ua',          label: 'OPC UA' },
];

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [peerId, setPeerId] = useState('');
  const [substation, setSubstation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [protocol, setProtocol] = useState<ScadaProtocol>('iec_61850_mms');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w110, setW110] = useState('');
  const [w50, setW50]   = useState('');
  const [w67, setW67]   = useState('');
  const [w26, setW26]   = useState('');
  const [peakDemand, setPeakDemand] = useState(false);
  const [blackStart, setBlackStart] = useState(false);
  const [crossBorder, setCrossBorder] = useState(false);
  const [nersaCompliance, setNersaCompliance] = useState(false);
  const [nMinus1, setNMinus1] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      protocol,
      peer_id: peerId || undefined,
      substation_name: substation || undefined,
      substation_capacity_mva: capacity ? Number(capacity) : undefined,
      endpoint_url: endpointUrl || undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w110_transmission_outage_ref: w110 || undefined,
      w50_reserve_activation_ref: w50 || undefined,
      w67_grid_code_compliance_ref: w67 || undefined,
      w26_cyber_incident_ref: w26 || undefined,
      peak_demand_window: peakDemand ? 1 : 0,
      black_start_path_required: blackStart ? 1 : 0,
      cross_border_link: crossBorder ? 1 : 0,
      nersa_grid_code_compliance: nersaCompliance ? 1 : 0,
      critical_substation_n_minus_1: nMinus1 ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px] text-[oklch(0.46_0.16_55)]">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose SCADA connector (W122)</h3>
            <p className="text-[11px] text-[#4a5568]">
              W118 audit-chain bridge mandatory. Tier auto-derived from substation_capacity_mva with FLOOR-AT-LARGE {'≥'}1 flag and FLOOR-AT-NATIONAL {'≥'}3 flags.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peer id (SCADA counterparty)">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ntcsa-koeberg-220kv" />
          </Field>
          <Field label="Substation name">
            <input value={substation} onChange={(e) => setSubstation(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Koeberg 400kV" />
          </Field>
          <Field label="Capacity (MVA)">
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="500" />
          </Field>
          <Field label="Protocol">
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as ScadaProtocol)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {PROTOCOL_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Endpoint URL">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="iec61850://10.20.30.40:102" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Koeberg 400kV IEC 61850 MMS connector" />
          </Field>
          <Field label="W118 block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="W110 transmission outage ref">
            <input value={w110} onChange={(e) => setW110(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="outage-tx-2026-0042" />
          </Field>
          <Field label="W50 reserve activation ref">
            <input value={w50} onChange={(e) => setW50(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="rsv-act-2026-0021" />
          </Field>
          <Field label="W67 grid code compliance ref">
            <input value={w67} onChange={(e) => setW67(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="gcc-2026-0011" />
          </Field>
          <Field label="W26 cyber incident ref">
            <input value={w26} onChange={(e) => setW26(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="cyber-2026-0005" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-LARGE {'≥'}1, FLOOR-AT-NATIONAL {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={peakDemand} onChange={setPeakDemand} label="Peak demand window" />
            <Checkbox checked={blackStart} onChange={setBlackStart} label="Black start path required" />
            <Checkbox checked={crossBorder} onChange={setCrossBorder} label="Cross-border link" />
            <Checkbox checked={nersaCompliance} onChange={setNersaCompliance} label="NERSA Grid Code C-3" />
            <Checkbox checked={nMinus1} onChange={setNMinus1} label="N-1 critical substation" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] text-[oklch(0.46_0.16_55)] hover:bg-[#f3f5f9]">Cancel</button>
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
    <label className="flex items-center gap-2 text-[11px] text-[oklch(0.46_0.16_55)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default ScadaConnectorTab;
