// SampleChainData.ts
//
// Frozen subset of the 16 SCC rows from migration 335_scada_connector_seed.sql.
// Hand-derived — no API call. This is design exploration only.
//
// Shape stays close to the SQL row but we add a handful of computed/derived
// fields the UX directions need (sla_pct_remaining, urgency_rank, etc.)
// rather than re-deriving them in every direction.

export type ChainStatus =
  | 'connector_proposed'
  | 'endpoints_discovered'
  | 'tls_configured'
  | 'handshake_completed'
  | 'telemetry_streaming'
  | 'quality_validated'
  | 'alarms_subscribed'
  | 'control_commands_authorized'
  | 'live_operations'
  | 'reconciliation_active'
  | 'archived'
  | 'disconnected'
  | 'suspended'
  | 'revoked'
  | 'failover_active';

export type Tier =
  | 'pilot'
  | 'small_substation'
  | 'medium_substation'
  | 'large_substation'
  | 'national_grid_backbone';

export type UrgencyBand = 'low' | 'medium' | 'high' | 'critical';
export type HealthBand = 'green' | 'amber' | 'red' | 'critical';

export interface ChainRow {
  id: string;
  number: string;
  substation: string;
  capacity_mva: number;
  protocol: string;
  endpoint: string;
  tier: Tier;
  authority: string;
  urgency: UrgencyBand;
  health: HealthBand;
  status: ChainStatus;
  title: string;
  reason_code: string;
  is_reportable: boolean;
  regulator_relevant: boolean;
  regulator_ref: string | null;
  sla_target_hours: number;        // 0 == terminal / not applicable
  sla_deadline_at: string | null;  // ISO; null when terminal
  sla_breached: boolean;
  escalation_level: number;
  days_to_cert_renewal: number;
  // computed
  sla_pct_remaining: number;       // 100=full window remaining, 0=at deadline, <0=overrun
  urgency_rank: number;            // 0..3 (low..critical)
  telemetry_quality_index: number | null;
  latency_p99_ms: number | null;
  messages_per_minute: number | null;
  // bridge refs
  w110_outage_ref: string | null;
  w50_reserve_ref: string | null;
  w67_grid_code_ref: string | null;
  w26_cyber_ref: string | null;
  w118_block_ref: string | null;
  updated_at: string;
}

const NOW = new Date('2026-05-31T14:30:00Z').getTime();

function pctRemaining(deadlineIso: string | null, slaHours: number): number {
  if (!deadlineIso || slaHours <= 0) return 0;
  const deadline = new Date(deadlineIso).getTime();
  const windowMs = slaHours * 3600 * 1000;
  const remainingMs = deadline - NOW;
  return Math.max(-100, Math.min(100, Math.round((remainingMs / windowMs) * 100)));
}

const URGENCY_RANK: Record<UrgencyBand, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

interface RawRow {
  id: string;
  number: string;
  substation: string;
  capacity_mva: number;
  protocol: string;
  endpoint: string;
  tier: Tier;
  authority: string;
  urgency: UrgencyBand;
  health: HealthBand;
  status: ChainStatus;
  title: string;
  reason_code: string;
  is_reportable: boolean;
  regulator_relevant: boolean;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: boolean;
  escalation_level: number;
  days_to_cert_renewal: number;
  telemetry_quality_index: number | null;
  latency_p99_ms: number | null;
  messages_per_minute: number | null;
  w110_outage_ref?: string | null;
  w50_reserve_ref?: string | null;
  w67_grid_code_ref?: string | null;
  w26_cyber_ref?: string | null;
  w118_block_ref?: string | null;
  updated_at: string;
}

const RAW: RawRow[] = [
  { id: 'scc-001', number: 'SCC-2026-0001', substation: 'Lab RTDS Pilot Bench', capacity_mva: 10, protocol: 'iec_61850_mms', endpoint: 'tcp://10.0.10.5:102', tier: 'pilot', authority: 'connector_engineer', urgency: 'medium', health: 'amber', status: 'connector_proposed', title: 'RTDS pilot bench - IEC 61850 MMS', reason_code: 'pilot_setup', is_reportable: false, regulator_relevant: false, regulator_ref: null, sla_target_hours: 168, sla_deadline_at: '2026-06-07T08:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 365, telemetry_quality_index: null, latency_p99_ms: null, messages_per_minute: null, updated_at: '2026-05-31T08:00:00Z' },
  { id: 'scc-002', number: 'SCC-2026-0002', substation: 'Lab PMU Pilot', capacity_mva: 5, protocol: 'ieee_c37_118', endpoint: 'tcp://10.0.10.6:4712', tier: 'pilot', authority: 'connector_engineer', urgency: 'low', health: 'amber', status: 'endpoints_discovered', title: 'PMU synchrophasor pilot bench', reason_code: 'pilot_setup', is_reportable: false, regulator_relevant: false, regulator_ref: null, sla_target_hours: 96, sla_deadline_at: '2026-06-03T10:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 365, telemetry_quality_index: 9, latency_p99_ms: 500, messages_per_minute: 120, updated_at: '2026-05-30T10:00:00Z' },
  { id: 'scc-003', number: 'SCC-2026-0003', substation: 'Lab OPC UA Pilot', capacity_mva: 8, protocol: 'opc_ua', endpoint: 'opc.tcp://10.0.10.7:4840', tier: 'pilot', authority: 'connector_engineer', urgency: 'medium', health: 'amber', status: 'suspended', title: 'OPC UA pilot - maintenance window', reason_code: 'maintenance', is_reportable: false, regulator_relevant: false, regulator_ref: null, sla_target_hours: 72, sla_deadline_at: '2026-06-02T08:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 365, telemetry_quality_index: 81, latency_p99_ms: 18, messages_per_minute: 300, updated_at: '2026-05-30T08:00:00Z' },
  { id: 'scc-004', number: 'SCC-2026-0004', substation: 'Cape Town Hout Bay 11kV', capacity_mva: 25, protocol: 'iec_60870_5_104', endpoint: 'tcp://10.20.4.5:2404', tier: 'large_substation', authority: 'CISO', urgency: 'medium', health: 'amber', status: 'tls_configured', title: 'Hout Bay 11kV distribution RTU', reason_code: 'distribution_rollout', is_reportable: true, regulator_relevant: false, regulator_ref: null, sla_target_hours: 192, sla_deadline_at: '2026-06-07T11:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 320, telemetry_quality_index: 40, latency_p99_ms: 700, messages_per_minute: 150, w26_cyber_ref: 'cyber-2026-04', updated_at: '2026-05-30T11:00:00Z' },
  { id: 'scc-005', number: 'SCC-2026-0005', substation: 'Joburg Sandton 22kV', capacity_mva: 35, protocol: 'dnp3_tcp', endpoint: 'tcp://10.30.5.5:20000', tier: 'small_substation', authority: 'ot_security_manager', urgency: 'high', health: 'amber', status: 'handshake_completed', title: 'Sandton 22kV bulk feeder', reason_code: 'distribution_rollout', is_reportable: false, regulator_relevant: false, regulator_ref: null, sla_target_hours: 72, sla_deadline_at: '2026-05-31T12:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 294, telemetry_quality_index: 56, latency_p99_ms: 850, messages_per_minute: 180, updated_at: '2026-05-28T12:00:00Z' },
  { id: 'scc-006', number: 'SCC-2026-0006', substation: 'Durban Pinetown 11kV', capacity_mva: 22, protocol: 'modbus_tcp', endpoint: 'tcp://10.40.6.5:502', tier: 'small_substation', authority: 'ot_security_manager', urgency: 'medium', health: 'amber', status: 'telemetry_streaming', title: 'Pinetown 11kV legacy Modbus bridge', reason_code: 'distribution_rollout', is_reportable: false, regulator_relevant: false, regulator_ref: null, sla_target_hours: 96, sla_deadline_at: '2026-05-30T13:00:00Z', sla_breached: true, escalation_level: 1, days_to_cert_renewal: 261, telemetry_quality_index: 80, latency_p99_ms: 35, messages_per_minute: 140, updated_at: '2026-05-30T13:00:00Z' },
  { id: 'scc-007', number: 'SCC-2026-0007', substation: 'Eskom Vereeniging 66kV', capacity_mva: 80, protocol: 'iec_61850_mms', endpoint: 'tcp://10.50.7.5:102', tier: 'large_substation', authority: 'CISO', urgency: 'medium', health: 'green', status: 'quality_validated', title: 'Vereeniging 66kV regional substation', reason_code: 'transmission_rollout', is_reportable: true, regulator_relevant: false, regulator_ref: null, sla_target_hours: 240, sla_deadline_at: '2026-06-01T14:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 225, telemetry_quality_index: 110, latency_p99_ms: 22, messages_per_minute: 300, w26_cyber_ref: 'cyber-2026-07', updated_at: '2026-05-22T14:00:00Z' },
  { id: 'scc-008', number: 'SCC-2026-0008', substation: 'Eskom Klerksdorp 66kV', capacity_mva: 120, protocol: 'iec_61850_goose', endpoint: 'tcp://10.60.8.5:102', tier: 'medium_substation', authority: 'CISO', urgency: 'medium', health: 'green', status: 'alarms_subscribed', title: 'Klerksdorp 66kV GOOSE protection', reason_code: 'transmission_rollout', is_reportable: false, regulator_relevant: false, regulator_ref: null, sla_target_hours: 96, sla_deadline_at: '2026-05-24T15:00:00Z', sla_breached: true, escalation_level: 1, days_to_cert_renewal: 189, telemetry_quality_index: 121, latency_p99_ms: 18, messages_per_minute: 400, updated_at: '2026-05-24T15:00:00Z' },
  { id: 'scc-009', number: 'SCC-2026-0009', substation: 'Eskom Bellville 132kV', capacity_mva: 110, protocol: 'iec_61850_sv', endpoint: 'tcp://10.70.9.5:102', tier: 'large_substation', authority: 'CISO', urgency: 'high', health: 'amber', status: 'failover_active', title: 'Bellville 132kV - SO failover cutover', reason_code: 'failover_event', is_reportable: true, regulator_relevant: true, regulator_ref: 'NERSA-SCADA-2026-0009', sla_target_hours: 96, sla_deadline_at: '2026-06-02T08:00:00Z', sla_breached: false, escalation_level: 0, days_to_cert_renewal: 169, telemetry_quality_index: 125, latency_p99_ms: 15, messages_per_minute: 500, w50_reserve_ref: 'rsv-act-2026-09', w118_block_ref: 'audit-block-2026-09', updated_at: '2026-05-29T08:00:00Z' },
  { id: 'scc-010', number: 'SCC-2026-0010', substation: 'NTCSA Apollo 400kV', capacity_mva: 350, protocol: 'iec_61850_mms', endpoint: 'tcp://10.80.10.5:102', tier: 'large_substation', authority: 'CISO', urgency: 'medium', health: 'green', status: 'control_commands_authorized', title: 'Apollo 400kV transmission substation', reason_code: 'transmission_rollout', is_reportable: true, regulator_relevant: false, regulator_ref: null, sla_target_hours: 192, sla_deadline_at: '2026-04-23T16:00:00Z', sla_breached: true, escalation_level: 2, days_to_cert_renewal: 142, telemetry_quality_index: 130, latency_p99_ms: 12, messages_per_minute: 600, w26_cyber_ref: 'cyber-2026-10', w118_block_ref: 'audit-block-2026-10', updated_at: '2026-04-23T16:00:00Z' },
  { id: 'scc-011', number: 'SCC-2026-0011', substation: 'NTCSA Aurora 220kV', capacity_mva: 250, protocol: 'iec_61850_mms', endpoint: 'tcp://10.90.11.5:102', tier: 'large_substation', authority: 'CISO', urgency: 'low', health: 'green', status: 'live_operations', title: 'Aurora 220kV transmission substation', reason_code: 'transmission_rollout', is_reportable: true, regulator_relevant: false, regulator_ref: null, sla_target_hours: 480, sla_deadline_at: '2026-04-25T17:00:00Z', sla_breached: true, escalation_level: 2, days_to_cert_renewal: 117, telemetry_quality_index: 130, latency_p99_ms: 10, messages_per_minute: 650, w67_grid_code_ref: 'gcc-2026-11', w26_cyber_ref: 'cyber-2026-11', w118_block_ref: 'audit-block-2026-11', updated_at: '2026-04-25T17:00:00Z' },
  { id: 'scc-012', number: 'SCC-2026-0012', substation: 'NTCSA Tutuka 400kV', capacity_mva: 400, protocol: 'iec_61850_sv', endpoint: 'tcp://10.100.12.5:102', tier: 'large_substation', authority: 'CISO', urgency: 'low', health: 'green', status: 'reconciliation_active', title: 'Tutuka 400kV transmission with reserve activation', reason_code: 'transmission_rollout', is_reportable: true, regulator_relevant: true, regulator_ref: 'NERSA-SCADA-2026-0012', sla_target_hours: 480, sla_deadline_at: '2026-04-08T18:00:00Z', sla_breached: true, escalation_level: 3, days_to_cert_renewal: 91, telemetry_quality_index: 130, latency_p99_ms: 9, messages_per_minute: 700, w110_outage_ref: 'outage-tx-2026-12', w26_cyber_ref: 'cyber-2026-12', w118_block_ref: 'audit-block-2026-12', updated_at: '2026-04-08T18:00:00Z' },
  { id: 'scc-013', number: 'SCC-2026-0013', substation: 'NTCSA Hydra 275kV', capacity_mva: 280, protocol: 'iec_61850_mms', endpoint: 'tcp://10.110.13.5:102', tier: 'large_substation', authority: 'CISO', urgency: 'low', health: 'green', status: 'archived', title: 'Hydra 275kV transmission - archived (replaced by next-gen)', reason_code: 'archive', is_reportable: true, regulator_relevant: false, regulator_ref: null, sla_target_hours: 0, sla_deadline_at: null, sla_breached: false, escalation_level: 0, days_to_cert_renewal: 71, telemetry_quality_index: 130, latency_p99_ms: 11, messages_per_minute: 680, w26_cyber_ref: 'cyber-2026-13', w118_block_ref: 'audit-block-2026-13', updated_at: '2026-05-30T08:00:00Z' },
  { id: 'scc-014', number: 'SCC-2026-0014', substation: 'NTCSA Matimba 765kV', capacity_mva: 1200, protocol: 'iec_61850_sv', endpoint: 'tcp://10.120.14.5:102', tier: 'national_grid_backbone', authority: 'SO_CEO', urgency: 'low', health: 'green', status: 'live_operations', title: 'Matimba 765kV national backbone PMU', reason_code: 'national_backbone_rollout', is_reportable: true, regulator_relevant: true, regulator_ref: 'NERSA-SCADA-2026-0014', sla_target_hours: 720, sla_deadline_at: '2026-04-04T17:00:00Z', sla_breached: true, escalation_level: 4, days_to_cert_renewal: 214, telemetry_quality_index: 130, latency_p99_ms: 7, messages_per_minute: 800, w26_cyber_ref: 'cyber-2026-14', w118_block_ref: 'audit-block-2026-14', updated_at: '2026-04-04T17:00:00Z' },
  { id: 'scc-015', number: 'SCC-2026-0015', substation: 'NTCSA Drakensberg PS 400kV', capacity_mva: 1000, protocol: 'iec_61850_mms', endpoint: 'tcp://10.130.15.5:102', tier: 'national_grid_backbone', authority: 'SO_CEO', urgency: 'critical', health: 'critical', status: 'disconnected', title: 'Drakensberg PS 400kV N-1 disconnect - cyber incident', reason_code: 'cyber_disconnect', is_reportable: true, regulator_relevant: true, regulator_ref: 'NERSA-SCADA-2026-0015', sla_target_hours: 0, sla_deadline_at: null, sla_breached: false, escalation_level: 0, days_to_cert_renewal: 183, telemetry_quality_index: 41, latency_p99_ms: null, messages_per_minute: 750, w110_outage_ref: 'outage-tx-2026-15', w67_grid_code_ref: 'gcc-2026-15', w26_cyber_ref: 'cyber-2026-15', w118_block_ref: 'audit-block-2026-15', updated_at: '2026-05-29T11:00:00Z' },
  { id: 'scc-016', number: 'SCC-2026-0016', substation: 'Kakamas 500MW 400kV Backbone', capacity_mva: 1500, protocol: 'iec_61850_mms', endpoint: 'tcp://10.140.16.5:102', tier: 'national_grid_backbone', authority: 'SO_CEO', urgency: 'critical', health: 'critical', status: 'revoked', title: 'Kakamas 500MW Backbone - SCADA-CONNECTOR-REVOKE SIGNATURE', reason_code: 'cert_revocation_signature', is_reportable: true, regulator_relevant: true, regulator_ref: 'NERSA-SCADA-2026-0016', sla_target_hours: 0, sla_deadline_at: null, sla_breached: false, escalation_level: 0, days_to_cert_renewal: 15, telemetry_quality_index: 36, latency_p99_ms: null, messages_per_minute: 900, w110_outage_ref: 'outage-tx-2026-16', w50_reserve_ref: 'rsv-act-2026-16', w67_grid_code_ref: 'gcc-2026-16', w26_cyber_ref: 'cyber-2026-16', w118_block_ref: 'audit-block-2026-16', updated_at: '2026-05-30T11:00:00Z' },
];

export const SAMPLE_CHAIN_DATA: ChainRow[] = RAW.map((r) => ({
  id: r.id,
  number: r.number,
  substation: r.substation,
  capacity_mva: r.capacity_mva,
  protocol: r.protocol,
  endpoint: r.endpoint,
  tier: r.tier,
  authority: r.authority,
  urgency: r.urgency,
  health: r.health,
  status: r.status,
  title: r.title,
  reason_code: r.reason_code,
  is_reportable: r.is_reportable,
  regulator_relevant: r.regulator_relevant,
  regulator_ref: r.regulator_ref,
  sla_target_hours: r.sla_target_hours,
  sla_deadline_at: r.sla_deadline_at,
  sla_breached: r.sla_breached,
  escalation_level: r.escalation_level,
  days_to_cert_renewal: r.days_to_cert_renewal,
  sla_pct_remaining: pctRemaining(r.sla_deadline_at, r.sla_target_hours),
  urgency_rank: URGENCY_RANK[r.urgency],
  telemetry_quality_index: r.telemetry_quality_index,
  latency_p99_ms: r.latency_p99_ms,
  messages_per_minute: r.messages_per_minute,
  w110_outage_ref: r.w110_outage_ref ?? null,
  w50_reserve_ref: r.w50_reserve_ref ?? null,
  w67_grid_code_ref: r.w67_grid_code_ref ?? null,
  w26_cyber_ref: r.w26_cyber_ref ?? null,
  w118_block_ref: r.w118_block_ref ?? null,
  updated_at: r.updated_at,
}));

export const STATUS_LABEL: Record<ChainStatus, string> = {
  connector_proposed: 'Proposed',
  endpoints_discovered: 'Endpoints',
  tls_configured: 'TLS',
  handshake_completed: 'Handshake',
  telemetry_streaming: 'Streaming',
  quality_validated: 'Validated',
  alarms_subscribed: 'Alarms',
  control_commands_authorized: 'Control',
  live_operations: 'Live',
  reconciliation_active: 'Recon',
  archived: 'Archived',
  disconnected: 'Disconnected',
  suspended: 'Suspended',
  revoked: 'Revoked',
  failover_active: 'Failover',
};

export const TIER_LABEL: Record<Tier, string> = {
  pilot: 'Pilot',
  small_substation: 'Small',
  medium_substation: 'Medium',
  large_substation: 'Large',
  national_grid_backbone: 'Backbone',
};

// SLA-pct → semantic colour. Anchored to the project's threshold rubric:
// red <60, amber 60-85, green >85, deep-red for breach (<0).
export function slaColor(pct: number): string {
  if (pct < 0) return '#5a0e08';   // deep red — breached
  if (pct < 25) return '#c0392b';  // red — imminent
  if (pct < 60) return '#d97706';  // amber — at risk
  return '#0e6d68';                // teal-green — healthy
}

export function healthColor(h: HealthBand): string {
  switch (h) {
    case 'green':    return '#0e6d68';
    case 'amber':    return '#c97a14';
    case 'red':      return '#c0392b';
    case 'critical': return '#5a0e08';
  }
}

export function urgencyColor(u: UrgencyBand): string {
  switch (u) {
    case 'low':      return '#3b82c4';
    case 'medium':   return '#c97a14';
    case 'high':     return '#a8385c';
    case 'critical': return '#5a0e08';
  }
}

// Aggregate "state of the world" — the strip every direction shows top-bar.
export interface StateOfWorld {
  total: number;
  breached: number;
  imminent: number;       // pct_remaining < 25 and !breached
  in_flight: number;      // forward states only (not terminal/branch)
  regulator_flagged: number;
  worst_health_count: number;
  worst_health: HealthBand;
}

export function computeStateOfWorld(rows: ChainRow[]): StateOfWorld {
  const TERMINAL_OR_BRANCH: ChainStatus[] = ['archived', 'disconnected', 'suspended', 'revoked', 'failover_active'];
  const breached = rows.filter((r) => r.sla_breached).length;
  const imminent = rows.filter((r) => !r.sla_breached && r.sla_pct_remaining < 25 && r.sla_pct_remaining >= 0 && r.sla_deadline_at).length;
  const in_flight = rows.filter((r) => !TERMINAL_OR_BRANCH.includes(r.status)).length;
  const regulator_flagged = rows.filter((r) => r.regulator_relevant).length;
  const worst: HealthBand = rows.some((r) => r.health === 'critical')
    ? 'critical'
    : rows.some((r) => r.health === 'red')
      ? 'red'
      : rows.some((r) => r.health === 'amber')
        ? 'amber'
        : 'green';
  const worst_health_count = rows.filter((r) => r.health === worst).length;
  return {
    total: rows.length,
    breached,
    imminent,
    in_flight,
    regulator_flagged,
    worst_health: worst,
    worst_health_count,
  };
}
