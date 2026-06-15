// ─────────────────────────────────────────────────────────────────────────
// Wave 122 - SCADA / IEC 61850 Substation Connector.
//
// PHASE C OPENER. Closes the audit-namespace family at W121 and opens
// the external-system connector family (W122-W126). Real-time
// bidirectional protocol bridge between the Open Energy Platform and
// IPP / grid SCADA systems (Schneider EcoStruxure / Siemens Spectrum /
// ABB Network Manager / GE iFIX / Honeywell Experion / Yokogawa Centum /
// Rockwell FactoryTalk).
//
// Standards covered:
//   - IEC 61850 (substation automation MMS + GOOSE + SV)
//   - IEC 60870-5-104 (RTU telemetry)
//   - IEC 62351 (cyber-security)
//   - DNP3 over TCP, Modbus TCP/RTU
//   - IEEE C37.118 (synchrophasor PMU streaming)
//   - OPC UA (OT-IT bridge)
//   - NERSA Grid Code C-3 (substation telemetry) + SANS 27001 cyber
//   - SARB BA 700 (cyber-incident notification)
//
// Beats: Triangle MicroWorks SCADA Data Gateway + Kalkitech SYNC 4000 +
// NovaTech Orion LX + SEL RTAC + GE iFIX historian + OSIsoft PI System +
// AVEVA System Platform.
//
// 12-state forward path + 4 branch states:
//   connector_proposed -> endpoints_discovered -> tls_configured ->
//     handshake_completed -> telemetry_streaming -> quality_validated ->
//     alarms_subscribed -> control_commands_authorized ->
//     live_operations -> reconciliation_active -> archived (HARD)
//   any non-terminal -> disconnect -> disconnected (HARD - peer-side
//     hard fail)
//   any non-terminal -> revoke -> revoked (HARD - cert/credential
//     revoked by counterparty)
//   any active -> suspend -> suspended (SOFT - maintenance window)
//   any live -> activate_failover -> failover_active (SOFT - primary
//     to secondary peer cutover)
//
// Tier RE-DERIVED on every transition from substation_capacity_mva
// with FLOOR-AT-LARGE-SUBSTATION on >=1 of 5 contextual flags:
//   - peak_demand_window           (load-shed risk window open)
//   - black_start_path_required    (substation is in black-start path)
//   - cross_border_link            (international transmission link)
//   - nersa_grid_code_compliance   (NERSA Grid Code C-3 compliance)
//   - critical_substation_n_minus_1 (N-1 critical substation)
//
// 5 tiers (INVERTED polarity - LARGER substation = MORE commissioning
// time):
//   pilot                   : 168h    (lab/pilot deployment)
//   small_substation        : 240h    (<=22 kV distribution)
//   medium_substation       : 360h    (33-66 kV distribution)
//   large_substation        : 480h    (132-220 kV transmission)
//   national_grid_backbone  : 720h    (275-765 kV national backbone)
//
// FLOOR-AT-LARGE-SUBSTATION on >=1 flag. FLOOR-AT-NATIONAL-GRID-BACKBONE
// on >=3 flags. National backbone is the apex tier.
//
// SIGNATURE Phase-C regulator crossings (NERSA Grid Code C-3 + IEC
// 62351 + SANS 27001 + SARB BA 700):
//   revoke -> EVERY tier (W122 SIGNATURE SCADA-CONNECTOR-REVOKE hard
//     line - counterparty cert revocation mid-stream = mandatory NERSA
//     + SARB BA 700 cyber notice + SOC report; sister of every L5
//     wave's signature hard line W104-W121.)
//   activate_failover -> large_substation + national_grid_backbone only
//     (FOL cutover at transmission level = grid-reliability event.)
//   disconnect -> EVERY tier WHEN critical_substation_n_minus_1
//     (N-1 substation disconnect = automatic grid-reliability notice.)
//   authorize_control_commands -> national_grid_backbone only
//     (Control authority at national-backbone level = NERSA Grid Code
//     C-3 + SARB BA 700 mandatory disclosure.)
//   sla_breached -> large_substation + national_grid_backbone only
//     (Commissioning slippage on the heavy connectors = grid-readiness
//     reportable event.)
//
// Write {admin, grid_operator, ipp_developer}. READ all 9 personas +
// EXTERNAL `scada_counterparty` pseudo-persona via mTLS-gated PUBLIC
// /api/scada-connector/peer/:peer_id (same mTLS pattern as W119; peer
// returns handshake snapshot + endpoint metadata + last-seen telemetry
// summary, no Bearer auth).
//
// actor_party split (4-step authority):
//   connector_engineer  : propose_connector / discover_endpoints /
//                         configure_tls / complete_handshake /
//                         start_telemetry / validate_quality /
//                         subscribe_alarms
//   ot_security_manager : authorize_control_commands /
//                         activate_failover / suspend / resume
//   CISO                : go_live / activate_reconciliation /
//                         disconnect / revoke
//   SO_CEO_or_IPP_CEO   : archive
//
// Event prefix: `scada_connector_evt_`. AUDIT_PREFIX_MAP entry:
//   scada_connector: 'grid'  (Phase C connectors do NOT join the
//   'audit' namespace - that family closed at W121. SCADA connector
//   joins the 'grid' chain because every IEC 61850 telemetry batch
//   reads as a grid-domain mutation.)
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared 15-min cron)
//   - 45 0 * * *          nightly telemetry-quality recompute
//   - 0 7 * * 1           weekly cert-expiry scan (Monday 09:00 SAST)
//
// Five bridges (W118 MANDATORY tamper-evidence):
//   W110 transmission outage + W50 reserve activation + W67 grid code
//   compliance + W26 cyber incident + W118 audit chain
//   (W118 MANDATORY - every telemetry batch hashed into W118 spine.
//   Other bridges activate when the connector witnesses an event that
//   crosses into another chain.)
// ─────────────────────────────────────────────────────────────────────────

export type SccStatus =
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
  | 'revoked'
  | 'suspended'
  | 'failover_active';

export type SccAction =
  | 'propose_connector'
  | 'discover_endpoints'
  | 'configure_tls'
  | 'complete_handshake'
  | 'start_telemetry'
  | 'validate_quality'
  | 'subscribe_alarms'
  | 'authorize_control_commands'
  | 'go_live'
  | 'activate_reconciliation'
  | 'archive'
  | 'disconnect'
  | 'suspend'
  | 'resume'
  | 'revoke'
  | 'activate_failover';

export type SccTier =
  | 'pilot'
  | 'small_substation'
  | 'medium_substation'
  | 'large_substation'
  | 'national_grid_backbone';

export type SccParty =
  | 'connector_engineer'
  | 'ot_security_manager'
  | 'CISO'
  | 'SO_CEO_or_IPP_CEO';

export type SccEvent =
  | 'scada_connector_proposed'
  | 'scada_connector_endpoints_discovered'
  | 'scada_connector_tls_configured'
  | 'scada_connector_handshake_completed'
  | 'scada_connector_telemetry_streaming'
  | 'scada_connector_quality_validated'
  | 'scada_connector_alarms_subscribed'
  | 'scada_connector_control_commands_authorized'
  | 'scada_connector_live_operations'
  | 'scada_connector_reconciliation_active'
  | 'scada_connector_archived'
  | 'scada_connector_disconnected'
  | 'scada_connector_suspended'
  | 'scada_connector_resumed'
  | 'scada_connector_revoked'
  | 'scada_connector_failover_activated'
  | 'scada_connector_sla_breached';

// HARD terminals: archived (clean close), disconnected (peer hard fail),
// revoked (cert revocation). suspended and failover_active are SOFT
// pauses that can resume back into live operations.
const HARD_TERMINALS = new Set<SccStatus>([
  'archived',
  'disconnected',
  'revoked',
]);

export function isTerminal(s: SccStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: SccStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: SccStatus[] = [
  'connector_proposed',
  'endpoints_discovered',
  'tls_configured',
  'handshake_completed',
  'telemetry_streaming',
  'quality_validated',
  'alarms_subscribed',
  'control_commands_authorized',
  'live_operations',
  'reconciliation_active',
  'suspended',
  'failover_active',
];

// suspend can be entered from any active state up to
// reconciliation_active.
const SUSPEND_FROM: SccStatus[] = [
  'endpoints_discovered',
  'tls_configured',
  'handshake_completed',
  'telemetry_streaming',
  'quality_validated',
  'alarms_subscribed',
  'control_commands_authorized',
  'live_operations',
  'reconciliation_active',
];

// activate_failover only applies to live or reconciliation_active.
const FAILOVER_FROM: SccStatus[] = [
  'live_operations',
  'reconciliation_active',
];

export const TRANSITIONS: Record<SccAction, { from: SccStatus[]; to: SccStatus }> = {
  propose_connector:          { from: ['connector_proposed'],                                                       to: 'connector_proposed' },
  discover_endpoints:         { from: ['connector_proposed', 'endpoints_discovered'],                               to: 'endpoints_discovered' },
  configure_tls:              { from: ['endpoints_discovered', 'tls_configured'],                                   to: 'tls_configured' },
  complete_handshake:         { from: ['tls_configured', 'handshake_completed'],                                    to: 'handshake_completed' },
  start_telemetry:            { from: ['handshake_completed', 'telemetry_streaming'],                               to: 'telemetry_streaming' },
  validate_quality:           { from: ['telemetry_streaming', 'quality_validated'],                                 to: 'quality_validated' },
  subscribe_alarms:           { from: ['quality_validated', 'alarms_subscribed'],                                   to: 'alarms_subscribed' },
  authorize_control_commands: { from: ['alarms_subscribed', 'control_commands_authorized'],                         to: 'control_commands_authorized' },
  go_live:                    { from: ['control_commands_authorized', 'live_operations', 'suspended', 'failover_active'], to: 'live_operations' },
  activate_reconciliation:    { from: ['live_operations', 'reconciliation_active'],                                 to: 'reconciliation_active' },
  archive:                    { from: ['reconciliation_active'],                                                    to: 'archived' },
  disconnect:                 { from: ALL_NON_TERMINAL,                                                             to: 'disconnected' },
  suspend:                    { from: SUSPEND_FROM,                                                                 to: 'suspended' },
  resume:                     { from: ['suspended'],                                                                to: 'live_operations' },
  revoke:                     { from: ALL_NON_TERMINAL,                                                             to: 'revoked' },
  activate_failover:          { from: FAILOVER_FROM,                                                                to: 'failover_active' },
};

export function nextStatus(current: SccStatus, action: SccAction): SccStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_connector' && current !== 'connector_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SccStatus): SccAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: SccAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SccAction, typeof TRANSITIONS[SccAction]][]) {
    if (a === 'propose_connector') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger
// substation_scope = LONGER commissioning runway. National-grid-
// backbone requires the most prep (cert chain depth + SO change-board
// + 24/7 ops handover).
export const SLA_HOURS: Record<SccStatus, Record<SccTier, number>> = {
  // ANCHOR: connector_proposed - the proposal window.
  connector_proposed:           { pilot: 168, small_substation: 240, medium_substation: 360, large_substation: 480, national_grid_backbone: 720 },
  endpoints_discovered:         { pilot: 96,  small_substation: 144, medium_substation: 192, large_substation: 264, national_grid_backbone: 360 },
  tls_configured:               { pilot: 72,  small_substation: 96,  medium_substation: 144, large_substation: 192, national_grid_backbone: 240 },
  handshake_completed:          { pilot: 48,  small_substation: 72,  medium_substation: 96,  large_substation: 144, national_grid_backbone: 192 },
  telemetry_streaming:          { pilot: 72,  small_substation: 96,  medium_substation: 144, large_substation: 192, national_grid_backbone: 240 },
  quality_validated:            { pilot: 96,  small_substation: 144, medium_substation: 192, large_substation: 240, national_grid_backbone: 360 },
  alarms_subscribed:            { pilot: 48,  small_substation: 72,  medium_substation: 96,  large_substation: 144, national_grid_backbone: 192 },
  control_commands_authorized:  { pilot: 72,  small_substation: 96,  medium_substation: 144, large_substation: 192, national_grid_backbone: 240 },
  live_operations:              { pilot: 168, small_substation: 240, medium_substation: 360, large_substation: 480, national_grid_backbone: 720 },
  reconciliation_active:        { pilot: 168, small_substation: 240, medium_substation: 360, large_substation: 480, national_grid_backbone: 720 },
  suspended:                    { pilot: 72,  small_substation: 96,  medium_substation: 144, large_substation: 192, national_grid_backbone: 240 },
  failover_active:              { pilot: 24,  small_substation: 48,  medium_substation: 72,  large_substation: 96,  national_grid_backbone: 144 },
  archived:                     { pilot: 0,   small_substation: 0,   medium_substation: 0,   large_substation: 0,   national_grid_backbone: 0 },
  disconnected:                 { pilot: 0,   small_substation: 0,   medium_substation: 0,   large_substation: 0,   national_grid_backbone: 0 },
  revoked:                      { pilot: 0,   small_substation: 0,   medium_substation: 0,   large_substation: 0,   national_grid_backbone: 0 },
};

export function slaWindowHours(status: SccStatus, tier: SccTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SccStatus, tier: SccTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from substation_capacity_mva.
// kV equivalents:
//   <22 kV / <50 MVA           -> small_substation (distribution)
//   22-66 kV / 50-150 MVA      -> medium_substation
//   132-220 kV / 150-500 MVA   -> large_substation (transmission)
//   275-765 kV / >500 MVA      -> national_grid_backbone (national)
// pilot is anything explicitly seeded as pilot.
export function tierForCapacity(capacityMva: number | null | undefined): SccTier {
  const c = Number(capacityMva || 0);
  if (!Number.isFinite(c) || c <= 0) return 'pilot';
  if (c < 50)  return 'small_substation';
  if (c < 150) return 'medium_substation';
  if (c < 500) return 'large_substation';
  return 'national_grid_backbone';
}

export interface SccFloorFlags {
  peak_demand_window?: boolean | number | null;
  black_start_path_required?: boolean | number | null;
  cross_border_link?: boolean | number | null;
  nersa_grid_code_compliance?: boolean | number | null;
  critical_substation_n_minus_1?: boolean | number | null;
}

export function countFloorFlags(args: SccFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.peak_demand_window) +
    t(args.black_start_path_required) +
    t(args.cross_border_link) +
    t(args.nersa_grid_code_compliance) +
    t(args.critical_substation_n_minus_1)
  );
}

// FLOOR-AT-LARGE-SUBSTATION on >=1 flag.
export function floorAtLargeSubstation(args: SccFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-NATIONAL-GRID-BACKBONE on >=3 flags.
export function floorAtNationalGridBackbone(args: SccFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<SccTier, number> = {
  pilot: 0,
  small_substation: 1,
  medium_substation: 2,
  large_substation: 3,
  national_grid_backbone: 4,
};

export function effectiveTier(
  rawTier: SccTier,
  flags: SccFloorFlags,
): SccTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'national_grid_backbone';
  if (flagCount >= 1) {
    // Lift to at least large_substation.
    if (TIER_RANK[rawTier] >= TIER_RANK['large_substation']) return rawTier;
    return 'large_substation';
  }
  return rawTier;
}

// Heavy tiers - large_substation + national_grid_backbone.
// SLA-breach reportability + activate_failover crossings attach here.
const HEAVY_TIERS = new Set<SccTier>(['large_substation', 'national_grid_backbone']);

export function isHeavyTier(tier: SccTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: SccTier): boolean {
  return tier === 'large_substation' || tier === 'national_grid_backbone';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W122 SIGNATURE: revoke crosses regulator EVERY tier - the SCADA-
// CONNECTOR-REVOKE hard line. Counterparty cert revocation mid-stream
// is always reportable. NERSA Grid Code C-3 + IEC 62351 + SANS 27001 +
// SARB BA 700 cyber-incident notice all require disclosure.
//
// Additional:
//   activate_failover -> large_substation + national_grid_backbone only
//   disconnect -> EVERY tier WHEN critical_substation_n_minus_1
//   authorize_control_commands -> national_grid_backbone only
//   sla_breached -> large_substation + national_grid_backbone only
export function crossesIntoRegulator(
  action: SccAction,
  tier: SccTier,
  args: {
    flags?: SccFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W122 SIGNATURE SCADA-CONNECTOR-REVOKE: revoke EVERY tier.
  if (action === 'revoke') {
    return true;
  }

  // activate_failover -> large_substation + national_grid_backbone only.
  if (action === 'activate_failover') {
    return tier === 'large_substation' || tier === 'national_grid_backbone';
  }

  // disconnect -> EVERY tier WHEN critical_substation_n_minus_1.
  if (action === 'disconnect') {
    return !!flags.critical_substation_n_minus_1;
  }

  // authorize_control_commands -> national_grid_backbone only.
  if (action === 'authorize_control_commands') {
    return tier === 'national_grid_backbone';
  }

  // go_live / archive / start_telemetry never cross on their own.
  // suspend / resume never cross.

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SccTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<SccAction, SccParty> = {
  propose_connector:           'connector_engineer',
  discover_endpoints:          'connector_engineer',
  configure_tls:               'connector_engineer',
  complete_handshake:          'connector_engineer',
  start_telemetry:             'connector_engineer',
  validate_quality:            'connector_engineer',
  subscribe_alarms:            'connector_engineer',
  authorize_control_commands:  'ot_security_manager',
  go_live:                     'CISO',
  activate_reconciliation:     'CISO',
  archive:                     'SO_CEO_or_IPP_CEO',
  disconnect:                  'CISO',
  suspend:                     'ot_security_manager',
  resume:                      'ot_security_manager',
  revoke:                      'CISO',
  activate_failover:           'ot_security_manager',
};

export function partyForAction(action: SccAction): SccParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: SccAction): SccEvent | null {
  switch (action) {
    case 'propose_connector':           return 'scada_connector_proposed';
    case 'discover_endpoints':          return 'scada_connector_endpoints_discovered';
    case 'configure_tls':               return 'scada_connector_tls_configured';
    case 'complete_handshake':          return 'scada_connector_handshake_completed';
    case 'start_telemetry':             return 'scada_connector_telemetry_streaming';
    case 'validate_quality':            return 'scada_connector_quality_validated';
    case 'subscribe_alarms':            return 'scada_connector_alarms_subscribed';
    case 'authorize_control_commands':  return 'scada_connector_control_commands_authorized';
    case 'go_live':                     return 'scada_connector_live_operations';
    case 'activate_reconciliation':     return 'scada_connector_reconciliation_active';
    case 'archive':                     return 'scada_connector_archived';
    case 'disconnect':                  return 'scada_connector_disconnected';
    case 'suspend':                     return 'scada_connector_suspended';
    case 'resume':                      return 'scada_connector_resumed';
    case 'revoke':                      return 'scada_connector_revoked';
    case 'activate_failover':           return 'scada_connector_failover_activated';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: SccStatus,
  tier: SccTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type SccUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: national_grid_backbone has the LOOSEST urgency
// thresholds. pilot has TIGHTEST.
export function urgencyBand(
  tier: SccTier,
  slaHoursLeft: number,
): SccUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'national_grid_backbone') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'large_substation') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'medium_substation') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'small_substation') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // pilot - TIGHTEST INVERTED-polarity thresholds.
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder.
export type SccAuthority =
  | 'connector_engineer'
  | 'ot_security_manager'
  | 'CISO'
  | 'SO_CEO'
  | 'IPP_CEO';

export function authorityRequired(tier: SccTier, isGridSide: boolean = true): SccAuthority {
  if (tier === 'national_grid_backbone') return isGridSide ? 'SO_CEO' : 'IPP_CEO';
  if (tier === 'large_substation')       return 'CISO';
  if (tier === 'medium_substation')      return 'CISO';
  if (tier === 'small_substation')       return 'ot_security_manager';
  return 'connector_engineer';
}

// Days until next NERSA cert renewal window (90-day rolling).
export function daysToCertRenewal(certExpiryAt: string | null | undefined, now: Date): number {
  if (!certExpiryAt) return 9999;
  const expiry = new Date(certExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W110 + W50 + W67 + W26 + W118) ──────────────
//
// W118 is MANDATORY tamper-evidence. The other bridges activate when
// the connector observes a related event in another chain (transmission
// outage / reserve activation / grid-code compliance issue / cyber
// incident).
export function bridgesToW110TransmissionOutage(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW50ReserveActivation(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW67GridCodeCompliance(ref: string | null | undefined): boolean {
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
// Scores the LIVE feed health.  IEC 61850 logical-node depth + IEC
// 60870-5-104 packet integrity + IEC 62351 cipher suite + DNP3 unsolicited
// vs polled + OPC UA endpoint coverage.
export function telemetryQualityIndex(args: {
  logical_node_count?: number | null;
  data_object_count?: number | null;
  messages_per_minute?: number | null;
  signal_to_noise_db?: number | null;
  latency_p50_ms?: number | null;
  latency_p99_ms?: number | null;
  jitter_ms?: number | null;
  packet_loss_pct?: number | null;
  tls_cert_valid?: boolean | number | null;
  iec_62351_cipher_ok?: boolean | number | null;
  protocol_compliant?: boolean | number | null;
}): number {
  const n = (v: number | null | undefined, min: number, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(min, Math.min(max, x));
  };
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // Logical-node and data-object depth (IEC 61850 model richness).
  const ln  = n(args.logical_node_count, 0, 2000);
  const dos = n(args.data_object_count, 0, 10000);
  score += Math.round((ln / 2000) * 15);
  score += Math.round((dos / 10000) * 15);
  // Throughput (messages/min).
  const mpm = n(args.messages_per_minute, 0, 6000);
  score += Math.round((mpm / 6000) * 15);
  // SNR (>=30 dB ideal).
  const snr = n(args.signal_to_noise_db, 0, 50);
  score += Math.round((snr / 50) * 10);
  // Latency p50 (lower is better, <=20ms ideal, >=200ms is 0).
  const p50 = n(args.latency_p50_ms, 0, 200);
  score += Math.round((1 - p50 / 200) * 10);
  // Latency p99 (lower is better, <=80ms ideal, >=500ms is 0).
  const p99 = n(args.latency_p99_ms, 0, 500);
  score += Math.round((1 - p99 / 500) * 10);
  // Jitter (lower is better).
  const jit = n(args.jitter_ms, 0, 100);
  score += Math.round((1 - jit / 100) * 8);
  // Packet loss (lower is better).
  const loss = n(args.packet_loss_pct, 0, 10);
  score += Math.round((1 - loss / 10) * 12);
  // Binary signals.
  score += t(args.tls_cert_valid)        * 15;
  score += t(args.iec_62351_cipher_ok)   * 10;
  score += t(args.protocol_compliant)    * 10;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Connector health band - composite ──────────────────────────────────
export type SccHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function connectorHealthBand(
  status: SccStatus,
  telemetryQuality: number,
  slaBreached: boolean,
  certExpiryDays: number,
  flags: SccFloorFlags,
  packetLossPct: number,
): SccHealthBand {
  if (status === 'revoked') return 'critical';
  if (status === 'disconnected') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (packetLossPct > 5) return 'red';
  if (certExpiryDays < 14) return 'red';
  if (status === 'failover_active') return 'amber';
  if (status === 'suspended') return 'amber';
  if (countFloorFlags(flags) >= 3 && telemetryQuality < 90) return 'amber';
  if (telemetryQuality < 60) return 'red';
  if (certExpiryDays < 60) return 'amber';
  if (telemetryQuality < 90) return 'amber';
  if (packetLossPct > 1) return 'amber';
  return 'green';
}

// Known protocol universe.
export const SCADA_PROTOCOLS = [
  'iec_61850_mms',
  'iec_61850_goose',
  'iec_61850_sv',
  'iec_60870_5_104',
  'dnp3_tcp',
  'modbus_tcp',
  'modbus_rtu',
  'ieee_c37_118',
  'opc_ua',
] as const;

export type ScadaProtocol = typeof SCADA_PROTOCOLS[number];

export function isKnownScadaProtocol(s: string | null | undefined): s is ScadaProtocol {
  if (!s) return false;
  return (SCADA_PROTOCOLS as readonly string[]).includes(s);
}

// ─── mTLS validator for /peer/:peer_id (PUBLIC endpoint) ────────────────
//
// PUBLIC `/api/scada-connector/peer/:peer_id` is mounted BEFORE the
// authMiddleware. Cloudflare edge sets `cf-client-cert-sha256` with the
// SHA-256 fingerprint of the verified client cert. We validate format
// and look up the connector by peer_id.
export function isValidMtlsFingerprint(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  // 64 hex chars (SHA-256) with optional colons/dashes/spaces.
  const normalized = s.replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized);
}

// Stub allow-list of trusted SCADA-counterparty fingerprints. Real
// rollout pulls from KV. 5+ entries cover the SA grid majors.
const PEER_FINGERPRINT_ALLOWLIST = new Set<string>([
  // NTCSA national transmission SO.
  '0000000000000000000000000000000000000000000000000000000000ca0001',
  // Eskom Distribution.
  '0000000000000000000000000000000000000000000000000000000000ca0002',
  // City of Cape Town distribution.
  '0000000000000000000000000000000000000000000000000000000000ca0003',
  // City of Joburg / Joburg City Power.
  '0000000000000000000000000000000000000000000000000000000000ca0004',
  // eThekwini / Durban distribution.
  '0000000000000000000000000000000000000000000000000000000000ca0005',
  // IPP-side trusted plant ICS roots (Kakamas / De Aar / Loeriesfontein).
  '0000000000000000000000000000000000000000000000000000000000ca0006',
  '0000000000000000000000000000000000000000000000000000000000ca0007',
  '0000000000000000000000000000000000000000000000000000000000ca0008',
]);

export function isAllowedPeerFingerprint(fp: string): boolean {
  if (!isValidMtlsFingerprint(fp)) return false;
  const norm = fp.replace(/[:\s-]/g, '').toLowerCase();
  // Production resolves trusted peer roots from KV; this allow-list is the
  // seed set. A well-formed fingerprint is trusted only if it is enrolled.
  return PEER_FINGERPRINT_ALLOWLIST.has(norm);
}
