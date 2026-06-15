// ─────────────────────────────────────────────────────────────────────────
// Wave 123 - MQTT / OPC-UA Edge-Device IIoT Connector.
//
// PHASE C WAVE 2 OF 5. Sister-wave to W122 substation-grade IEC 61850
// bridge - this is the EDGE-DEVICE / IIoT BROKER tier connecting
// inverters, BESS controllers, RTUs, weather stations, met masts,
// substation gateways, SCADA RTUs, and Sparkplug-B fleets.
//
// Standards covered:
//   - MQTT v5 + MQTT-SN (constrained-device broker)
//   - OPC UA 1.05 + OPC UA Pub/Sub (OT-IT bridge)
//   - Sparkplug B (Eclipse Tahu)
//   - IEC 61400-25 (wind turbine SCADA)
//   - IEEE 2030.5 (CSIP / smart-inverter Common Smart Inverter Profile)
//   - SunSpec Modbus + Modbus TCP (PV inverter)
//   - NERSA Grid Code C-3 + DOE-IPP DA-1 (DA inverter authority)
//   - POPIA s19 (cross-border IoT data flows)
//   - IEC 62443 (OT cybersecurity)
//   - SARB BA 700 (cyber-incident notification)
//
// Beats: AWS IoT Core + Azure IoT Hub + HiveMQ Enterprise + EMQX +
// VerneMQ + Kepware KEPServerEX + Matrikon OPC UA Server + Prosys
// OPC UA Server + Unified Automation UaGateway + Cogent DataHub +
// Inductive Automation Ignition Edge.
//
// 11-state forward path + 4 branch states:
//   connector_proposed -> broker_provisioned -> topics_mapped ->
//     tls_mutual_configured -> client_registered -> publishing_active ->
//     subscription_validated -> companion_spec_bound ->
//     live_streaming -> reconciliation_active -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD - peer-side
//     hard fail)
//   any non-terminal -> revoke_credential -> credential_revoked
//     (HARD - cert/credential revoked by counterparty)
//   any active -> suspend -> suspended (SOFT - maintenance window)
//   any live -> activate_failover -> failover_active (SOFT - primary
//     to secondary broker cutover)
//
// Tier RE-DERIVED on every transition from endpoint_count
// with FLOOR-AT-LARGE-FLEET on >=1 of 5 contextual flags:
//   - critical_safety_payload                 (safety-critical telemetry)
//   - cross_border_iot_traffic                (POPIA s19 cross-border)
//   - sparkplug_b_required                    (Sparkplug B fleet)
//   - ieee_2030_5_csip_inverter_control       (CSIP inverter control)
//   - aggregated_demand_response_above_50mw   (aggregated DR above 50MW)
//
// 5 tiers (INVERTED polarity - LARGER fleet = MORE provisioning time):
//   edge_device              : 168h    (1-9 endpoints lab/pilot)
//   small_fleet              : 240h    (10-49 endpoints)
//   medium_fleet             : 360h    (50-199 endpoints)
//   large_fleet              : 480h    (200-999 endpoints)
//   national_iot_backbone    : 720h    (>=1000 endpoints national hub)
//
// FLOOR-AT-LARGE-FLEET on >=1 flag. FLOOR-AT-NATIONAL-IOT-BACKBONE on
// >=3 flags. National IoT backbone is the apex tier.
//
// SIGNATURE Phase-C regulator crossings (NERSA Grid Code C-3 + IEC
// 62443 + POPIA s19 + SARB BA 700):
//   revoke_credential -> EVERY tier (W123 SIGNATURE MQTT-OPCUA-REVOKE
//     hard line - counterparty cert revocation mid-stream = mandatory
//     NERSA + SARB BA 700 cyber notice + IEC 62443 SOC; sister of W122
//     SCADA-CONNECTOR-REVOKE.)
//   activate_failover -> large_fleet + national_iot_backbone only
//     (Broker cutover at fleet level = grid-reliability event.)
//   disconnect -> EVERY tier WHEN critical_safety_payload
//     (Safety-payload disconnect = automatic POPIA + IEC 62443
//     reportable.)
//   bind_companion_spec -> national_iot_backbone WHEN
//     ieee_2030_5_csip_inverter_control
//     (CSIP DA inverter control authority at national-backbone =
//     NERSA C-3 + SARB BA 700 mandatory disclosure.)
//   sla_breached -> large_fleet + national_iot_backbone only.
//
// Write {admin, grid_operator, ipp_developer, support}. READ all 9
// personas + EXTERNAL `iot_peer` pseudo-persona via mTLS-gated PUBLIC
// /api/mqtt-opcua-connector/peer/:peer_id (same mTLS pattern as W122;
// uses `x-mtls-cert-fingerprint` header, NOT `cf-client-cert-sha256`).
//
// actor_party split (4-step authority):
//   iot_engineer        : propose_connector / provision_broker /
//                         map_topics / configure_mutual_tls /
//                         register_client / start_publishing /
//                         validate_subscription
//   ot_security_manager : bind_companion_spec / activate_failover /
//                         suspend / resume
//   CISO                : go_live / activate_reconciliation /
//                         disconnect / revoke_credential
//   SO_CEO_or_IPP_CEO   : archive
//
// Event prefix: `mqtt_opcua_connector_evt_`. AUDIT_PREFIX_MAP entry:
//   mqtt_opcua_connector: 'grid'  (Phase C connectors do NOT join
//   the 'audit' namespace - that family closed at W121. MQTT/OPC-UA
//   connector joins the 'grid' chain because IoT telemetry reads as
//   a grid-domain mutation; sister of W122.)
//
// Three crons (SHARED with W122 - DO NOT duplicate triggers):
//   - */15 * * * *        SLA sweep (shared 15-min cron)
//   - 45 0 * * *          nightly telemetry-quality recompute
//   - 0 7 * * 1           weekly cert-expiry scan (Monday 09:00 SAST)
//
// Five bridges (W118 MANDATORY tamper-evidence):
//   W122 SCADA connector + W71 asset prognostics + W50 reserve
//   activation + W26 cyber incident + W118 audit chain
//   (W118 MANDATORY. W122 cross-references the substation-tier
//   connector when the IoT fleet is upstream of a substation
//   gateway. W71 hooks into predictive-asset-health upstream feeds.)
// ─────────────────────────────────────────────────────────────────────────

export type MocStatus =
  | 'connector_proposed'
  | 'broker_provisioned'
  | 'topics_mapped'
  | 'tls_mutual_configured'
  | 'client_registered'
  | 'publishing_active'
  | 'subscription_validated'
  | 'companion_spec_bound'
  | 'live_streaming'
  | 'reconciliation_active'
  | 'archived'
  | 'disconnected'
  | 'credential_revoked'
  | 'suspended'
  | 'failover_active';

export type MocAction =
  | 'propose_connector'
  | 'provision_broker'
  | 'map_topics'
  | 'configure_mutual_tls'
  | 'register_client'
  | 'start_publishing'
  | 'validate_subscription'
  | 'bind_companion_spec'
  | 'go_live'
  | 'activate_reconciliation'
  | 'archive'
  | 'disconnect'
  | 'suspend'
  | 'resume'
  | 'revoke_credential'
  | 'activate_failover';

export type MocTier =
  | 'edge_device'
  | 'small_fleet'
  | 'medium_fleet'
  | 'large_fleet'
  | 'national_iot_backbone';

export type MocParty =
  | 'iot_engineer'
  | 'ot_security_manager'
  | 'CISO'
  | 'SO_CEO_or_IPP_CEO';

export type MocEvent =
  | 'mqtt_opcua_connector_proposed'
  | 'mqtt_opcua_connector_broker_provisioned'
  | 'mqtt_opcua_connector_topics_mapped'
  | 'mqtt_opcua_connector_tls_mutual_configured'
  | 'mqtt_opcua_connector_client_registered'
  | 'mqtt_opcua_connector_publishing_active'
  | 'mqtt_opcua_connector_subscription_validated'
  | 'mqtt_opcua_connector_companion_spec_bound'
  | 'mqtt_opcua_connector_live_streaming'
  | 'mqtt_opcua_connector_reconciliation_active'
  | 'mqtt_opcua_connector_archived'
  | 'mqtt_opcua_connector_disconnected'
  | 'mqtt_opcua_connector_suspended'
  | 'mqtt_opcua_connector_resumed'
  | 'mqtt_opcua_connector_credential_revoked'
  | 'mqtt_opcua_connector_failover_activated'
  | 'mqtt_opcua_connector_sla_breached';

// HARD terminals: archived (clean close), disconnected (peer hard fail),
// credential_revoked (cert revocation). suspended and failover_active
// are SOFT pauses that can resume back into live streaming.
const HARD_TERMINALS = new Set<MocStatus>([
  'archived',
  'disconnected',
  'credential_revoked',
]);

export function isTerminal(s: MocStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: MocStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: MocStatus[] = [
  'connector_proposed',
  'broker_provisioned',
  'topics_mapped',
  'tls_mutual_configured',
  'client_registered',
  'publishing_active',
  'subscription_validated',
  'companion_spec_bound',
  'live_streaming',
  'reconciliation_active',
  'suspended',
  'failover_active',
];

// suspend can be entered from any active state up to
// reconciliation_active.
const SUSPEND_FROM: MocStatus[] = [
  'broker_provisioned',
  'topics_mapped',
  'tls_mutual_configured',
  'client_registered',
  'publishing_active',
  'subscription_validated',
  'companion_spec_bound',
  'live_streaming',
  'reconciliation_active',
];

// activate_failover only applies to live or reconciliation_active.
const FAILOVER_FROM: MocStatus[] = [
  'live_streaming',
  'reconciliation_active',
];

export const TRANSITIONS: Record<MocAction, { from: MocStatus[]; to: MocStatus }> = {
  propose_connector:      { from: ['connector_proposed'],                                                          to: 'connector_proposed' },
  provision_broker:       { from: ['connector_proposed', 'broker_provisioned'],                                    to: 'broker_provisioned' },
  map_topics:             { from: ['broker_provisioned', 'topics_mapped'],                                         to: 'topics_mapped' },
  configure_mutual_tls:   { from: ['topics_mapped', 'tls_mutual_configured'],                                      to: 'tls_mutual_configured' },
  register_client:        { from: ['tls_mutual_configured', 'client_registered'],                                  to: 'client_registered' },
  start_publishing:       { from: ['client_registered', 'publishing_active'],                                      to: 'publishing_active' },
  validate_subscription:  { from: ['publishing_active', 'subscription_validated'],                                 to: 'subscription_validated' },
  bind_companion_spec:    { from: ['subscription_validated', 'companion_spec_bound'],                              to: 'companion_spec_bound' },
  go_live:                { from: ['companion_spec_bound', 'live_streaming', 'suspended', 'failover_active'],      to: 'live_streaming' },
  activate_reconciliation:{ from: ['live_streaming', 'reconciliation_active'],                                     to: 'reconciliation_active' },
  archive:                { from: ['reconciliation_active'],                                                       to: 'archived' },
  disconnect:             { from: ALL_NON_TERMINAL,                                                                to: 'disconnected' },
  suspend:                { from: SUSPEND_FROM,                                                                    to: 'suspended' },
  resume:                 { from: ['suspended'],                                                                   to: 'live_streaming' },
  revoke_credential:      { from: ALL_NON_TERMINAL,                                                                to: 'credential_revoked' },
  activate_failover:      { from: FAILOVER_FROM,                                                                   to: 'failover_active' },
};

export function nextStatus(current: MocStatus, action: MocAction): MocStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_connector' && current !== 'connector_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: MocStatus): MocAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: MocAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [MocAction, typeof TRANSITIONS[MocAction]][]) {
    if (a === 'propose_connector') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger fleet =
// LONGER provisioning runway. National IoT backbone requires the most
// prep (cert chain depth + change-board + 24/7 ops handover).
export const SLA_HOURS: Record<MocStatus, Record<MocTier, number>> = {
  // ANCHOR: connector_proposed - the proposal window.
  connector_proposed:           { edge_device: 168, small_fleet: 240, medium_fleet: 360, large_fleet: 480, national_iot_backbone: 720 },
  broker_provisioned:           { edge_device: 120, small_fleet: 168, medium_fleet: 240, large_fleet: 320, national_iot_backbone: 480 },
  topics_mapped:                { edge_device: 96,  small_fleet: 144, medium_fleet: 192, large_fleet: 240, national_iot_backbone: 360 },
  tls_mutual_configured:        { edge_device: 72,  small_fleet: 96,  medium_fleet: 144, large_fleet: 192, national_iot_backbone: 240 },
  client_registered:            { edge_device: 48,  small_fleet: 72,  medium_fleet: 96,  large_fleet: 144, national_iot_backbone: 192 },
  publishing_active:            { edge_device: 72,  small_fleet: 96,  medium_fleet: 144, large_fleet: 192, national_iot_backbone: 240 },
  subscription_validated:       { edge_device: 96,  small_fleet: 120, medium_fleet: 168, large_fleet: 240, national_iot_backbone: 360 },
  companion_spec_bound:         { edge_device: 72,  small_fleet: 96,  medium_fleet: 144, large_fleet: 240, national_iot_backbone: 360 },
  live_streaming:               { edge_device: 168, small_fleet: 240, medium_fleet: 360, large_fleet: 480, national_iot_backbone: 720 },
  reconciliation_active:        { edge_device: 168, small_fleet: 240, medium_fleet: 360, large_fleet: 480, national_iot_backbone: 720 },
  suspended:                    { edge_device: 72,  small_fleet: 96,  medium_fleet: 144, large_fleet: 192, national_iot_backbone: 240 },
  failover_active:              { edge_device: 24,  small_fleet: 48,  medium_fleet: 72,  large_fleet: 120, national_iot_backbone: 168 },
  archived:                     { edge_device: 0,   small_fleet: 0,   medium_fleet: 0,   large_fleet: 0,   national_iot_backbone: 0 },
  disconnected:                 { edge_device: 0,   small_fleet: 0,   medium_fleet: 0,   large_fleet: 0,   national_iot_backbone: 0 },
  credential_revoked:           { edge_device: 0,   small_fleet: 0,   medium_fleet: 0,   large_fleet: 0,   national_iot_backbone: 0 },
};

export function slaWindowHours(status: MocStatus, tier: MocTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: MocStatus, tier: MocTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from endpoint_count.
//   <10                  -> edge_device     (lab/pilot or single inverter)
//   10-49                -> small_fleet     (rooftop / community PV)
//   50-199               -> medium_fleet    (commercial wind/PV)
//   200-999              -> large_fleet     (utility-scale fleet)
//   >=1000               -> national_iot_backbone (national hub)
export function tierForEndpointCount(endpointCount: number | null | undefined): MocTier {
  const c = Number(endpointCount || 0);
  if (!Number.isFinite(c) || c < 10)  return 'edge_device';
  if (c < 50)  return 'small_fleet';
  if (c < 200) return 'medium_fleet';
  if (c < 1000) return 'large_fleet';
  return 'national_iot_backbone';
}

export interface MocFloorFlags {
  critical_safety_payload?: boolean | number | null;
  cross_border_iot_traffic?: boolean | number | null;
  sparkplug_b_required?: boolean | number | null;
  ieee_2030_5_csip_inverter_control?: boolean | number | null;
  aggregated_demand_response_above_50mw?: boolean | number | null;
}

export function countFloorFlags(args: MocFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.critical_safety_payload) +
    t(args.cross_border_iot_traffic) +
    t(args.sparkplug_b_required) +
    t(args.ieee_2030_5_csip_inverter_control) +
    t(args.aggregated_demand_response_above_50mw)
  );
}

// FLOOR-AT-LARGE-FLEET on >=1 flag.
export function floorAtLargeFleet(args: MocFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-NATIONAL-IOT-BACKBONE on >=3 flags.
export function floorAtNationalIotBackbone(args: MocFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<MocTier, number> = {
  edge_device: 0,
  small_fleet: 1,
  medium_fleet: 2,
  large_fleet: 3,
  national_iot_backbone: 4,
};

export function effectiveTier(
  rawTier: MocTier,
  flags: MocFloorFlags,
): MocTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'national_iot_backbone';
  if (flagCount >= 1) {
    // Lift to at least large_fleet.
    if (TIER_RANK[rawTier] >= TIER_RANK['large_fleet']) return rawTier;
    return 'large_fleet';
  }
  return rawTier;
}

// Heavy tiers - large_fleet + national_iot_backbone.
// SLA-breach reportability + activate_failover crossings attach here.
const HEAVY_TIERS = new Set<MocTier>(['large_fleet', 'national_iot_backbone']);

export function isHeavyTier(tier: MocTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: MocTier): boolean {
  return tier === 'large_fleet' || tier === 'national_iot_backbone';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W123 SIGNATURE: revoke_credential crosses regulator EVERY tier - the
// MQTT-OPCUA-REVOKE hard line. Counterparty cert revocation mid-stream
// is always reportable. NERSA Grid Code C-3 + IEC 62443 + POPIA s19 +
// SARB BA 700 cyber-incident notice all require disclosure.
//
// Additional:
//   activate_failover -> large_fleet + national_iot_backbone only
//   disconnect -> EVERY tier WHEN critical_safety_payload
//   bind_companion_spec -> national_iot_backbone WHEN
//     ieee_2030_5_csip_inverter_control
//   sla_breached -> large_fleet + national_iot_backbone only
export function crossesIntoRegulator(
  action: MocAction,
  tier: MocTier,
  args: {
    flags?: MocFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W123 SIGNATURE MQTT-OPCUA-REVOKE: revoke_credential EVERY tier.
  if (action === 'revoke_credential') {
    return true;
  }

  // activate_failover -> large_fleet + national_iot_backbone only.
  if (action === 'activate_failover') {
    return tier === 'large_fleet' || tier === 'national_iot_backbone';
  }

  // disconnect -> EVERY tier WHEN critical_safety_payload.
  if (action === 'disconnect') {
    return !!flags.critical_safety_payload;
  }

  // bind_companion_spec -> national_iot_backbone WHEN
  // ieee_2030_5_csip_inverter_control.
  if (action === 'bind_companion_spec') {
    return tier === 'national_iot_backbone' && !!flags.ieee_2030_5_csip_inverter_control;
  }

  // go_live / archive / start_publishing never cross on their own.
  // suspend / resume never cross.

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: MocTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<MocAction, MocParty> = {
  propose_connector:       'iot_engineer',
  provision_broker:        'iot_engineer',
  map_topics:              'iot_engineer',
  configure_mutual_tls:    'iot_engineer',
  register_client:         'iot_engineer',
  start_publishing:        'iot_engineer',
  validate_subscription:   'iot_engineer',
  bind_companion_spec:     'ot_security_manager',
  go_live:                 'CISO',
  activate_reconciliation: 'CISO',
  archive:                 'SO_CEO_or_IPP_CEO',
  disconnect:              'CISO',
  suspend:                 'ot_security_manager',
  resume:                  'ot_security_manager',
  revoke_credential:       'CISO',
  activate_failover:       'ot_security_manager',
};

export function partyForAction(action: MocAction): MocParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: MocAction): MocEvent | null {
  switch (action) {
    case 'propose_connector':       return 'mqtt_opcua_connector_proposed';
    case 'provision_broker':        return 'mqtt_opcua_connector_broker_provisioned';
    case 'map_topics':               return 'mqtt_opcua_connector_topics_mapped';
    case 'configure_mutual_tls':    return 'mqtt_opcua_connector_tls_mutual_configured';
    case 'register_client':         return 'mqtt_opcua_connector_client_registered';
    case 'start_publishing':        return 'mqtt_opcua_connector_publishing_active';
    case 'validate_subscription':   return 'mqtt_opcua_connector_subscription_validated';
    case 'bind_companion_spec':     return 'mqtt_opcua_connector_companion_spec_bound';
    case 'go_live':                 return 'mqtt_opcua_connector_live_streaming';
    case 'activate_reconciliation': return 'mqtt_opcua_connector_reconciliation_active';
    case 'archive':                 return 'mqtt_opcua_connector_archived';
    case 'disconnect':              return 'mqtt_opcua_connector_disconnected';
    case 'suspend':                 return 'mqtt_opcua_connector_suspended';
    case 'resume':                  return 'mqtt_opcua_connector_resumed';
    case 'revoke_credential':       return 'mqtt_opcua_connector_credential_revoked';
    case 'activate_failover':       return 'mqtt_opcua_connector_failover_activated';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: MocStatus,
  tier: MocTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type MocUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: national_iot_backbone has the LOOSEST urgency
// thresholds. edge_device has TIGHTEST.
export function urgencyBand(
  tier: MocTier,
  slaHoursLeft: number,
): MocUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'national_iot_backbone') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'large_fleet') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'medium_fleet') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'small_fleet') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // edge_device - TIGHTEST INVERTED-polarity thresholds.
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder.
export type MocAuthority =
  | 'iot_engineer'
  | 'ot_security_manager'
  | 'CISO'
  | 'SO_CEO'
  | 'IPP_CEO';

export function authorityRequired(tier: MocTier, isGridSide: boolean = true): MocAuthority {
  if (tier === 'national_iot_backbone') return isGridSide ? 'SO_CEO' : 'IPP_CEO';
  if (tier === 'large_fleet')           return 'CISO';
  if (tier === 'medium_fleet')          return 'CISO';
  if (tier === 'small_fleet')           return 'ot_security_manager';
  return 'iot_engineer';
}

// Days until next cert renewal window (90-day rolling).
export function daysToCertRenewal(certExpiryAt: string | null | undefined, now: Date): number {
  if (!certExpiryAt) return 9999;
  const expiry = new Date(certExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W122 + W71 + W50 + W26 + W118) ──────────────
//
// W118 is MANDATORY tamper-evidence. The other bridges activate when
// the connector observes a related event in another chain (W122
// substation-grade SCADA / W71 predictive asset prognostics / W50
// reserve activation / W26 cyber incident).
export function bridgesToW122ScadaConnector(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW71AssetPrognostics(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW50ReserveActivation(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW26CyberIncident(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── Telemetry quality index 0-130 ──────────────────────────────────────
//
// Scores the LIVE IoT broker feed health. MQTT topic depth + OPC UA
// node coverage + IEC 62443 cipher + Sparkplug birth/death lifecycle +
// retained message count + QoS p99 + CSIP DA inverter command latency.
export function telemetryQualityIndex(args: {
  active_publishers?: number | null;
  active_subscribers?: number | null;
  subscription_topic_count?: number | null;
  retained_message_count?: number | null;
  messages_per_second?: number | null;
  qos_p99_ms?: number | null;
  payload_quality_index?: number | null;
  control_commands_authorized_count?: number | null;
  control_commands_executed_24h?: number | null;
  tls_cert_valid?: boolean | number | null;
  iec_62443_cipher_ok?: boolean | number | null;
  protocol_compliant?: boolean | number | null;
}): number {
  const n = (v: number | null | undefined, min: number, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(min, Math.min(max, x));
  };
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // Active publishers (IoT fleet liveness).
  const pubs = n(args.active_publishers, 0, 2000);
  score += Math.round((pubs / 2000) * 15);
  // Active subscribers (consumer ecosystem depth).
  const subs = n(args.active_subscribers, 0, 500);
  score += Math.round((subs / 500) * 10);
  // Subscription topic coverage.
  const topics = n(args.subscription_topic_count, 0, 5000);
  score += Math.round((topics / 5000) * 10);
  // Retained message count.
  const ret = n(args.retained_message_count, 0, 2000);
  score += Math.round((ret / 2000) * 8);
  // Throughput (messages/second).
  const mps = n(args.messages_per_second, 0, 6000);
  score += Math.round((mps / 6000) * 15);
  // QoS p99 latency (lower is better, <=20ms ideal, >=200ms is 0).
  const p99 = n(args.qos_p99_ms, 0, 200);
  score += Math.round((1 - p99 / 200) * 12);
  // Payload quality (0-130 normalized to 0-15).
  const pq = n(args.payload_quality_index, 0, 130);
  score += Math.round((pq / 130) * 15);
  // CSIP DA inverter command execution ratio.
  const auth = n(args.control_commands_authorized_count, 0, 1000);
  const exec = n(args.control_commands_executed_24h, 0, 1000);
  if (auth > 0) {
    score += Math.round(Math.min(1, exec / auth) * 5);
  }
  // Binary signals.
  score += t(args.tls_cert_valid)        * 15;
  score += t(args.iec_62443_cipher_ok)   * 10;
  score += t(args.protocol_compliant)    * 10;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Connector health band - composite ──────────────────────────────────
export type MocHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function connectorHealthBand(
  status: MocStatus,
  telemetryQuality: number,
  slaBreached: boolean,
  certExpiryDays: number,
  flags: MocFloorFlags,
  qosP99Ms: number,
): MocHealthBand {
  if (status === 'credential_revoked') return 'critical';
  if (status === 'disconnected') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (qosP99Ms > 150) return 'red';
  if (certExpiryDays < 14) return 'red';
  if (status === 'failover_active') return 'amber';
  if (status === 'suspended') return 'amber';
  if (countFloorFlags(flags) >= 3 && telemetryQuality < 90) return 'amber';
  if (telemetryQuality < 60) return 'red';
  if (certExpiryDays < 60) return 'amber';
  if (telemetryQuality < 90) return 'amber';
  if (qosP99Ms > 80) return 'amber';
  return 'green';
}

// Known protocol universe.
export const MQTT_OPCUA_PROTOCOLS = [
  'mqtt_v5',
  'mqtt_sn',
  'opc_ua_1_05',
  'opc_ua_pubsub',
  'sparkplug_b',
  'iec_61400_25',
  'ieee_2030_5',
  'sunspec_modbus',
] as const;

export type MqttOpcuaProtocol = typeof MQTT_OPCUA_PROTOCOLS[number];

export function isKnownMqttOpcuaProtocol(s: string | null | undefined): s is MqttOpcuaProtocol {
  if (!s) return false;
  return (MQTT_OPCUA_PROTOCOLS as readonly string[]).includes(s);
}

// Known companion-spec universe.
export const COMPANION_SPECS = [
  'pv_industry',
  'energy',
  'battery',
  'inverter',
  'wind',
] as const;

export type CompanionSpec = typeof COMPANION_SPECS[number];

export function isKnownCompanionSpec(s: string | null | undefined): s is CompanionSpec {
  if (!s) return false;
  return (COMPANION_SPECS as readonly string[]).includes(s);
}

// ─── mTLS validator for /peer/:peer_id (PUBLIC endpoint) ────────────────
//
// PUBLIC `/api/mqtt-opcua-connector/peer/:peer_id` is mounted BEFORE the
// authMiddleware. Phase-C uses the `x-mtls-cert-fingerprint` header
// (NOT `cf-client-cert-sha256`) to keep W122 + W123 + future Phase-C
// waves consistent. We validate format and look up the connector by
// peer_id.
export function isValidMtlsFingerprint(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  // 64 hex chars (SHA-256) with optional colons/dashes/spaces.
  const normalized = s.replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized);
}

// Stub allow-list of trusted IoT-peer fingerprints. Real rollout pulls
// from KV. 8 entries cover the SA grid majors + IPP/EPC IoT roots.
const PEER_FINGERPRINT_ALLOWLIST = new Set<string>([
  // NTCSA national IoT roots.
  '0000000000000000000000000000000000000000000000000000000010770001',
  // Eskom Distribution IoT.
  '0000000000000000000000000000000000000000000000000000000010770002',
  // City of Cape Town IoT broker.
  '0000000000000000000000000000000000000000000000000000000010770003',
  // City of Joburg IoT broker.
  '0000000000000000000000000000000000000000000000000000000010770004',
  // eThekwini IoT broker.
  '0000000000000000000000000000000000000000000000000000000010770005',
  // IPP plant IoT roots.
  '0000000000000000000000000000000000000000000000000000000010770006',
  '0000000000000000000000000000000000000000000000000000000010770007',
  '0000000000000000000000000000000000000000000000000000000010770008',
]);

export function isAllowedPeerFingerprint(fp: string): boolean {
  if (!isValidMtlsFingerprint(fp)) return false;
  const norm = fp.replace(/[:\s-]/g, '').toLowerCase();
  // Production resolves trusted peer roots from KV; this allow-list is the
  // seed set. A well-formed fingerprint is trusted only if it is enrolled.
  return PEER_FINGERPRINT_ALLOWLIST.has(norm);
}
