// Wave 122 - SCADA / IEC 61850 Substation Connector spec battery.
//
// Covers: state machine (forward path connector_proposed -> archived +
// 4 branches + HARD terminals: archived/disconnected/revoked +
// SOFT pauses: suspended/failover_active +
// 16-action TRANSITIONS map coverage), tier derivation from
// substation_capacity_mva + FLOOR-AT-LARGE-SUBSTATION on >=1 of 5
// flags + FLOOR-AT-NATIONAL-GRID-BACKBONE on >=3 flags, INVERTED SLA
// matrix anchored on connector_proposed (168/240/360/480/720h),
// SIGNATURE SCADA-CONNECTOR-REVOKE crossings (revoke EVERY tier;
// activate_failover large+national; disconnect EVERY tier WHEN
// critical_substation_n_minus_1; authorize_control_commands national
// only; sla_breached HEAVY tiers only), party routing (4-step:
// connector_engineer/ot_security_manager/CISO/SO_CEO_or_IPP_CEO),
// authority ladder, urgency band (INVERTED - national loosest),
// 5-bridge architecture (W110/W50/W67/W26/W118; W118 mandatory),
// telemetry quality 0-130, connector health band composite, mTLS
// fingerprint validator, protocol taxonomy, cert renewal days.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForCapacity,
  countFloorFlags,
  floorAtLargeSubstation,
  floorAtNationalGridBackbone,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
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
} from '../src/utils/scada-connector-spec';

describe('W122 SCADA connector - state machine forward path', () => {
  it('walks connector_proposed -> archived through all 11 states', () => {
    expect(nextStatus('connector_proposed', 'discover_endpoints')).toBe('endpoints_discovered');
    expect(nextStatus('endpoints_discovered', 'configure_tls')).toBe('tls_configured');
    expect(nextStatus('tls_configured', 'complete_handshake')).toBe('handshake_completed');
    expect(nextStatus('handshake_completed', 'start_telemetry')).toBe('telemetry_streaming');
    expect(nextStatus('telemetry_streaming', 'validate_quality')).toBe('quality_validated');
    expect(nextStatus('quality_validated', 'subscribe_alarms')).toBe('alarms_subscribed');
    expect(nextStatus('alarms_subscribed', 'authorize_control_commands')).toBe('control_commands_authorized');
    expect(nextStatus('control_commands_authorized', 'go_live')).toBe('live_operations');
    expect(nextStatus('live_operations', 'activate_reconciliation')).toBe('reconciliation_active');
    expect(nextStatus('reconciliation_active', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('connector_proposed', 'configure_tls')).toBeNull();
    expect(nextStatus('endpoints_discovered', 'complete_handshake')).toBeNull();
    expect(nextStatus('tls_configured', 'start_telemetry')).toBeNull();
    expect(nextStatus('handshake_completed', 'validate_quality')).toBeNull();
    expect(nextStatus('telemetry_streaming', 'subscribe_alarms')).toBeNull();
    expect(nextStatus('quality_validated', 'authorize_control_commands')).toBeNull();
    expect(nextStatus('alarms_subscribed', 'go_live')).toBeNull();
    expect(nextStatus('live_operations', 'archive')).toBeNull();
  });
});

describe('W122 - branch states (suspend / resume / failover / disconnect / revoke)', () => {
  it('suspend can be entered from any active state up to reconciliation_active', () => {
    expect(nextStatus('endpoints_discovered', 'suspend')).toBe('suspended');
    expect(nextStatus('handshake_completed', 'suspend')).toBe('suspended');
    expect(nextStatus('telemetry_streaming', 'suspend')).toBe('suspended');
    expect(nextStatus('live_operations', 'suspend')).toBe('suspended');
    expect(nextStatus('reconciliation_active', 'suspend')).toBe('suspended');
  });

  it('suspend cannot be entered from connector_proposed', () => {
    expect(nextStatus('connector_proposed', 'suspend')).toBeNull();
  });

  it('resume returns to live_operations', () => {
    expect(nextStatus('suspended', 'resume')).toBe('live_operations');
  });

  it('activate_failover only from live_operations or reconciliation_active', () => {
    expect(nextStatus('live_operations', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('reconciliation_active', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('telemetry_streaming', 'activate_failover')).toBeNull();
    expect(nextStatus('handshake_completed', 'activate_failover')).toBeNull();
  });

  it('go_live can re-enter from failover_active or suspended', () => {
    expect(nextStatus('failover_active', 'go_live')).toBe('live_operations');
    expect(nextStatus('suspended', 'go_live')).toBe('live_operations');
  });

  it('disconnect from any non-terminal goes to disconnected', () => {
    expect(nextStatus('connector_proposed', 'disconnect')).toBe('disconnected');
    expect(nextStatus('tls_configured', 'disconnect')).toBe('disconnected');
    expect(nextStatus('live_operations', 'disconnect')).toBe('disconnected');
    expect(nextStatus('failover_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('suspended', 'disconnect')).toBe('disconnected');
  });

  it('revoke from any non-terminal goes to revoked', () => {
    expect(nextStatus('connector_proposed', 'revoke')).toBe('revoked');
    expect(nextStatus('live_operations', 'revoke')).toBe('revoked');
    expect(nextStatus('reconciliation_active', 'revoke')).toBe('revoked');
    expect(nextStatus('suspended', 'revoke')).toBe('revoked');
  });
});

describe('W122 - HARD terminals block further transitions', () => {
  it('archived/disconnected/revoked accept no further actions', () => {
    expect(nextStatus('archived', 'go_live')).toBeNull();
    expect(nextStatus('archived', 'suspend')).toBeNull();
    expect(nextStatus('disconnected', 'resume')).toBeNull();
    expect(nextStatus('disconnected', 'go_live')).toBeNull();
    expect(nextStatus('revoked', 'configure_tls')).toBeNull();
    expect(nextStatus('revoked', 'go_live')).toBeNull();
  });

  it('isTerminal + isHardTerminal flag the 3 hard terminals', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('disconnected')).toBe(true);
    expect(isTerminal('revoked')).toBe(true);
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('disconnected')).toBe(true);
    expect(isHardTerminal('revoked')).toBe(true);
  });

  it('SOFT pauses (suspended/failover_active) are NOT terminal', () => {
    expect(isTerminal('suspended')).toBe(false);
    expect(isTerminal('failover_active')).toBe(false);
    expect(isHardTerminal('suspended')).toBe(false);
    expect(isHardTerminal('failover_active')).toBe(false);
  });

  it('non-terminal active states are not terminal', () => {
    expect(isTerminal('connector_proposed')).toBe(false);
    expect(isTerminal('live_operations')).toBe(false);
    expect(isTerminal('reconciliation_active')).toBe(false);
  });
});

describe('W122 - allowedActions surface', () => {
  it('connector_proposed surfaces discover_endpoints + suspend-NOT + disconnect + revoke', () => {
    const acts = allowedActions('connector_proposed');
    expect(acts).toContain('discover_endpoints');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke');
    expect(acts).not.toContain('suspend'); // SUSPEND_FROM excludes connector_proposed
    expect(acts).not.toContain('propose_connector'); // create-only
  });

  it('live_operations surfaces activate_reconciliation + activate_failover + suspend + revoke', () => {
    const acts = allowedActions('live_operations');
    expect(acts).toContain('activate_reconciliation');
    expect(acts).toContain('activate_failover');
    expect(acts).toContain('suspend');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke');
  });

  it('archived surfaces no actions', () => {
    expect(allowedActions('archived')).toEqual([]);
  });

  it('disconnected surfaces no actions', () => {
    expect(allowedActions('disconnected')).toEqual([]);
  });

  it('revoked surfaces no actions', () => {
    expect(allowedActions('revoked')).toEqual([]);
  });
});

describe('W122 - 16-action TRANSITIONS coverage', () => {
  it('TRANSITIONS map contains all 16 actions', () => {
    const expected = [
      'propose_connector', 'discover_endpoints', 'configure_tls',
      'complete_handshake', 'start_telemetry', 'validate_quality',
      'subscribe_alarms', 'authorize_control_commands', 'go_live',
      'activate_reconciliation', 'archive', 'disconnect', 'suspend',
      'resume', 'revoke', 'activate_failover',
    ];
    for (const a of expected) expect(TRANSITIONS).toHaveProperty(a);
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });
});

describe('W122 - INVERTED SLA polarity', () => {
  it('connector_proposed anchor hours: pilot 168 / small 240 / medium 360 / large 480 / national 720', () => {
    expect(SLA_HOURS['connector_proposed']['pilot']).toBe(168);
    expect(SLA_HOURS['connector_proposed']['small_substation']).toBe(240);
    expect(SLA_HOURS['connector_proposed']['medium_substation']).toBe(360);
    expect(SLA_HOURS['connector_proposed']['large_substation']).toBe(480);
    expect(SLA_HOURS['connector_proposed']['national_grid_backbone']).toBe(720);
  });

  it('national_grid_backbone always >= large_substation across non-terminal states', () => {
    const states = [
      'connector_proposed', 'endpoints_discovered', 'tls_configured',
      'handshake_completed', 'telemetry_streaming', 'quality_validated',
      'alarms_subscribed', 'control_commands_authorized', 'live_operations',
      'reconciliation_active', 'suspended', 'failover_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['national_grid_backbone']).toBeGreaterThanOrEqual(SLA_HOURS[s]['large_substation']);
    }
  });

  it('large_substation always >= medium_substation across active states', () => {
    const states = [
      'connector_proposed', 'tls_configured', 'telemetry_streaming',
      'live_operations', 'reconciliation_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['large_substation']).toBeGreaterThanOrEqual(SLA_HOURS[s]['medium_substation']);
    }
  });

  it('medium_substation always >= small_substation always >= pilot across active states', () => {
    const states = [
      'connector_proposed', 'tls_configured', 'telemetry_streaming',
      'live_operations', 'reconciliation_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['medium_substation']).toBeGreaterThanOrEqual(SLA_HOURS[s]['small_substation']);
      expect(SLA_HOURS[s]['small_substation']).toBeGreaterThanOrEqual(SLA_HOURS[s]['pilot']);
    }
  });

  it('HARD terminals have zero SLA for every tier', () => {
    for (const tier of ['pilot','small_substation','medium_substation','large_substation','national_grid_backbone'] as const) {
      expect(SLA_HOURS['archived'][tier]).toBe(0);
      expect(SLA_HOURS['disconnected'][tier]).toBe(0);
      expect(SLA_HOURS['revoked'][tier]).toBe(0);
    }
  });

  it('failover_active is tighter than live_operations (faster recovery)', () => {
    for (const tier of ['pilot','small_substation','medium_substation','large_substation','national_grid_backbone'] as const) {
      expect(SLA_HOURS['failover_active'][tier]).toBeLessThan(SLA_HOURS['live_operations'][tier]);
    }
  });

  it('slaWindowHours returns the expected matrix lookup', () => {
    expect(slaWindowHours('connector_proposed', 'national_grid_backbone')).toBe(720);
    expect(slaWindowHours('archived', 'pilot')).toBe(0);
  });

  it('slaDeadlineFor offsets correctly and returns null for terminal', () => {
    const t = new Date('2026-05-31T00:00:00Z');
    const d = slaDeadlineFor('connector_proposed', 'pilot', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(168 * 3600 * 1000);
    expect(slaDeadlineFor('archived', 'pilot', t)).toBeNull();
  });

  it('slaHoursRemaining computes the delta', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-31T00:00:00Z'); // 24h later
    expect(slaHoursRemaining('connector_proposed', 'pilot', enteredAt, now)).toBe(168 - 24);
  });
});

describe('W122 - tier derivation from substation_capacity_mva', () => {
  it('null / zero / negative -> pilot', () => {
    expect(tierForCapacity(null)).toBe('pilot');
    expect(tierForCapacity(0)).toBe('pilot');
    expect(tierForCapacity(undefined)).toBe('pilot');
    expect(tierForCapacity(-1)).toBe('pilot');
  });

  it('<50 MVA -> small_substation', () => {
    expect(tierForCapacity(10)).toBe('small_substation');
    expect(tierForCapacity(49.9)).toBe('small_substation');
  });

  it('50-149.9 MVA -> medium_substation', () => {
    expect(tierForCapacity(50)).toBe('medium_substation');
    expect(tierForCapacity(149)).toBe('medium_substation');
  });

  it('150-499.9 MVA -> large_substation', () => {
    expect(tierForCapacity(150)).toBe('large_substation');
    expect(tierForCapacity(499)).toBe('large_substation');
  });

  it('>=500 MVA -> national_grid_backbone', () => {
    expect(tierForCapacity(500)).toBe('national_grid_backbone');
    expect(tierForCapacity(1500)).toBe('national_grid_backbone');
  });
});

describe('W122 - FLOOR flag counting + thresholds', () => {
  it('countFloorFlags counts each truthy flag once', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ peak_demand_window: true })).toBe(1);
    expect(countFloorFlags({ peak_demand_window: true, black_start_path_required: true })).toBe(2);
    expect(countFloorFlags({
      peak_demand_window: true,
      black_start_path_required: true,
      cross_border_link: true,
    })).toBe(3);
    expect(countFloorFlags({
      peak_demand_window: true,
      black_start_path_required: true,
      cross_border_link: true,
      nersa_grid_code_compliance: true,
      critical_substation_n_minus_1: true,
    })).toBe(5);
  });

  it('countFloorFlags treats 0/false/null as not-set', () => {
    expect(countFloorFlags({ peak_demand_window: false, black_start_path_required: 0 })).toBe(0);
    expect(countFloorFlags({ cross_border_link: null })).toBe(0);
  });

  it('floorAtLargeSubstation triggers on >=1 flag', () => {
    expect(floorAtLargeSubstation({})).toBe(false);
    expect(floorAtLargeSubstation({ peak_demand_window: true })).toBe(true);
    expect(floorAtLargeSubstation({ critical_substation_n_minus_1: true })).toBe(true);
  });

  it('floorAtNationalGridBackbone triggers on >=3 flags', () => {
    expect(floorAtNationalGridBackbone({ peak_demand_window: true })).toBe(false);
    expect(floorAtNationalGridBackbone({
      peak_demand_window: true,
      black_start_path_required: true,
    })).toBe(false);
    expect(floorAtNationalGridBackbone({
      peak_demand_window: true,
      black_start_path_required: true,
      cross_border_link: true,
    })).toBe(true);
    expect(floorAtNationalGridBackbone({
      peak_demand_window: true,
      black_start_path_required: true,
      cross_border_link: true,
      nersa_grid_code_compliance: true,
      critical_substation_n_minus_1: true,
    })).toBe(true);
  });
});

describe('W122 - effectiveTier with FLOOR lifting', () => {
  it('no flags -> raw tier preserved', () => {
    expect(effectiveTier('pilot', {})).toBe('pilot');
    expect(effectiveTier('small_substation', {})).toBe('small_substation');
    expect(effectiveTier('medium_substation', {})).toBe('medium_substation');
    expect(effectiveTier('large_substation', {})).toBe('large_substation');
    expect(effectiveTier('national_grid_backbone', {})).toBe('national_grid_backbone');
  });

  it('1 flag lifts pilot/small/medium to large_substation', () => {
    expect(effectiveTier('pilot', { peak_demand_window: true })).toBe('large_substation');
    expect(effectiveTier('small_substation', { peak_demand_window: true })).toBe('large_substation');
    expect(effectiveTier('medium_substation', { peak_demand_window: true })).toBe('large_substation');
  });

  it('1 flag does not demote already-large or national', () => {
    expect(effectiveTier('large_substation', { peak_demand_window: true })).toBe('large_substation');
    expect(effectiveTier('national_grid_backbone', { peak_demand_window: true })).toBe('national_grid_backbone');
  });

  it('3+ flags lift any tier to national_grid_backbone', () => {
    const three = { peak_demand_window: true, black_start_path_required: true, cross_border_link: true };
    expect(effectiveTier('pilot', three)).toBe('national_grid_backbone');
    expect(effectiveTier('small_substation', three)).toBe('national_grid_backbone');
    expect(effectiveTier('large_substation', three)).toBe('national_grid_backbone');
  });
});

describe('W122 - heavy tier helpers', () => {
  it('isHeavyTier flags large + national', () => {
    expect(isHeavyTier('large_substation')).toBe(true);
    expect(isHeavyTier('national_grid_backbone')).toBe(true);
    expect(isHeavyTier('medium_substation')).toBe(false);
    expect(isHeavyTier('small_substation')).toBe(false);
    expect(isHeavyTier('pilot')).toBe(false);
  });

  it('isReportable flags large + national', () => {
    expect(isReportable('large_substation')).toBe(true);
    expect(isReportable('national_grid_backbone')).toBe(true);
    expect(isReportable('medium_substation')).toBe(false);
    expect(isReportable('pilot')).toBe(false);
  });
});

describe('W122 - SIGNATURE regulator crossings', () => {
  // SIGNATURE #1 - SCADA-CONNECTOR-REVOKE: revoke EVERY tier.
  it('SIGNATURE: revoke crosses EVERY tier', () => {
    expect(crossesIntoRegulator('revoke', 'pilot', {})).toBe(true);
    expect(crossesIntoRegulator('revoke', 'small_substation', {})).toBe(true);
    expect(crossesIntoRegulator('revoke', 'medium_substation', {})).toBe(true);
    expect(crossesIntoRegulator('revoke', 'large_substation', {})).toBe(true);
    expect(crossesIntoRegulator('revoke', 'national_grid_backbone', {})).toBe(true);
  });

  // SIGNATURE #2 - activate_failover: large+national only.
  it('SIGNATURE: activate_failover crosses large + national only', () => {
    expect(crossesIntoRegulator('activate_failover', 'pilot', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'small_substation', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'medium_substation', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'large_substation', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'national_grid_backbone', {})).toBe(true);
  });

  // SIGNATURE #3 - disconnect: EVERY tier WHEN critical_substation_n_minus_1.
  it('SIGNATURE: disconnect crosses EVERY tier WHEN critical_substation_n_minus_1', () => {
    const flags = { flags: { critical_substation_n_minus_1: true } };
    expect(crossesIntoRegulator('disconnect', 'pilot', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'small_substation', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'medium_substation', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'large_substation', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'national_grid_backbone', flags)).toBe(true);
  });

  it('disconnect does NOT cross when critical_substation_n_minus_1 is absent', () => {
    expect(crossesIntoRegulator('disconnect', 'pilot', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'large_substation', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'national_grid_backbone', {})).toBe(false);
  });

  // SIGNATURE #4 - authorize_control_commands: national only.
  it('SIGNATURE: authorize_control_commands crosses national only', () => {
    expect(crossesIntoRegulator('authorize_control_commands', 'pilot', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_control_commands', 'small_substation', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_control_commands', 'medium_substation', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_control_commands', 'large_substation', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_control_commands', 'national_grid_backbone', {})).toBe(true);
  });

  // SIGNATURE #5 - sla_breached: large+national only.
  it('SIGNATURE: slaBreachCrossesIntoRegulator returns large+national only', () => {
    expect(slaBreachCrossesIntoRegulator('pilot')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small_substation')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium_substation')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large_substation')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('national_grid_backbone')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('go_live', 'national_grid_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('archive', 'national_grid_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('suspend', 'national_grid_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('resume', 'national_grid_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('start_telemetry', 'national_grid_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('configure_tls', 'national_grid_backbone', {})).toBe(false);
  });
});

describe('W122 - party + event routing', () => {
  it('party split assigns engineering / OT / CISO / CEO correctly', () => {
    expect(partyForAction('propose_connector')).toBe('connector_engineer');
    expect(partyForAction('discover_endpoints')).toBe('connector_engineer');
    expect(partyForAction('configure_tls')).toBe('connector_engineer');
    expect(partyForAction('complete_handshake')).toBe('connector_engineer');
    expect(partyForAction('start_telemetry')).toBe('connector_engineer');
    expect(partyForAction('validate_quality')).toBe('connector_engineer');
    expect(partyForAction('subscribe_alarms')).toBe('connector_engineer');
    expect(partyForAction('authorize_control_commands')).toBe('ot_security_manager');
    expect(partyForAction('activate_failover')).toBe('ot_security_manager');
    expect(partyForAction('suspend')).toBe('ot_security_manager');
    expect(partyForAction('resume')).toBe('ot_security_manager');
    expect(partyForAction('go_live')).toBe('CISO');
    expect(partyForAction('activate_reconciliation')).toBe('CISO');
    expect(partyForAction('disconnect')).toBe('CISO');
    expect(partyForAction('revoke')).toBe('CISO');
    expect(partyForAction('archive')).toBe('SO_CEO_or_IPP_CEO');
  });

  it('eventTypeFor returns the scada_connector_* prefix event for every action', () => {
    expect(eventTypeFor('propose_connector')).toBe('scada_connector_proposed');
    expect(eventTypeFor('discover_endpoints')).toBe('scada_connector_endpoints_discovered');
    expect(eventTypeFor('configure_tls')).toBe('scada_connector_tls_configured');
    expect(eventTypeFor('complete_handshake')).toBe('scada_connector_handshake_completed');
    expect(eventTypeFor('start_telemetry')).toBe('scada_connector_telemetry_streaming');
    expect(eventTypeFor('validate_quality')).toBe('scada_connector_quality_validated');
    expect(eventTypeFor('subscribe_alarms')).toBe('scada_connector_alarms_subscribed');
    expect(eventTypeFor('authorize_control_commands')).toBe('scada_connector_control_commands_authorized');
    expect(eventTypeFor('go_live')).toBe('scada_connector_live_operations');
    expect(eventTypeFor('activate_reconciliation')).toBe('scada_connector_reconciliation_active');
    expect(eventTypeFor('archive')).toBe('scada_connector_archived');
    expect(eventTypeFor('disconnect')).toBe('scada_connector_disconnected');
    expect(eventTypeFor('suspend')).toBe('scada_connector_suspended');
    expect(eventTypeFor('resume')).toBe('scada_connector_resumed');
    expect(eventTypeFor('revoke')).toBe('scada_connector_revoked');
    expect(eventTypeFor('activate_failover')).toBe('scada_connector_failover_activated');
  });
});

describe('W122 - urgencyBand INVERTED polarity (national loosest)', () => {
  it('negative slaHoursLeft -> critical for any tier', () => {
    expect(urgencyBand('pilot', -1)).toBe('critical');
    expect(urgencyBand('national_grid_backbone', -1)).toBe('critical');
  });

  it('pilot has tightest thresholds', () => {
    expect(urgencyBand('pilot', 2)).toBe('critical');
    expect(urgencyBand('pilot', 8)).toBe('high');
    expect(urgencyBand('pilot', 20)).toBe('medium');
    expect(urgencyBand('pilot', 100)).toBe('low');
  });

  it('national_grid_backbone has loosest thresholds (INVERTED)', () => {
    expect(urgencyBand('national_grid_backbone', 12)).toBe('critical');
    expect(urgencyBand('national_grid_backbone', 50)).toBe('high');
    expect(urgencyBand('national_grid_backbone', 150)).toBe('medium');
    expect(urgencyBand('national_grid_backbone', 400)).toBe('low');
  });

  it('large_substation band ordering', () => {
    expect(urgencyBand('large_substation', 10)).toBe('critical');
    expect(urgencyBand('large_substation', 40)).toBe('high');
    expect(urgencyBand('large_substation', 100)).toBe('medium');
    expect(urgencyBand('large_substation', 300)).toBe('low');
  });

  it('medium_substation band ordering', () => {
    expect(urgencyBand('medium_substation', 6)).toBe('critical');
    expect(urgencyBand('medium_substation', 30)).toBe('high');
    expect(urgencyBand('medium_substation', 60)).toBe('medium');
    expect(urgencyBand('medium_substation', 200)).toBe('low');
  });

  it('small_substation band ordering', () => {
    expect(urgencyBand('small_substation', 4)).toBe('critical');
    expect(urgencyBand('small_substation', 16)).toBe('high');
    expect(urgencyBand('small_substation', 36)).toBe('medium');
    expect(urgencyBand('small_substation', 100)).toBe('low');
  });
});

describe('W122 - authority ladder', () => {
  it('national_grid_backbone -> SO_CEO (grid) or IPP_CEO (IPP)', () => {
    expect(authorityRequired('national_grid_backbone', true)).toBe('SO_CEO');
    expect(authorityRequired('national_grid_backbone', false)).toBe('IPP_CEO');
  });

  it('large + medium -> CISO', () => {
    expect(authorityRequired('large_substation')).toBe('CISO');
    expect(authorityRequired('medium_substation')).toBe('CISO');
  });

  it('small -> ot_security_manager', () => {
    expect(authorityRequired('small_substation')).toBe('ot_security_manager');
  });

  it('pilot -> connector_engineer', () => {
    expect(authorityRequired('pilot')).toBe('connector_engineer');
  });
});

describe('W122 - daysToCertRenewal', () => {
  it('null cert returns 9999', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToCertRenewal(null, now)).toBe(9999);
    expect(daysToCertRenewal(undefined, now)).toBe(9999);
  });

  it('future cert returns positive days', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    const days = daysToCertRenewal('2026-08-29T00:00:00Z', now); // ~90 days
    expect(days).toBeGreaterThanOrEqual(89);
    expect(days).toBeLessThanOrEqual(91);
  });

  it('past cert returns 0', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToCertRenewal('2026-01-01T00:00:00Z', now)).toBe(0);
  });
});

describe('W122 - bridges (5-bridge architecture)', () => {
  it('W110 transmission outage bridge triggers on truthy ref', () => {
    expect(bridgesToW110TransmissionOutage('outage-001')).toBe(true);
    expect(bridgesToW110TransmissionOutage(null)).toBe(false);
    expect(bridgesToW110TransmissionOutage('')).toBe(false);
  });

  it('W50 reserve activation bridge', () => {
    expect(bridgesToW50ReserveActivation('rsv-act-001')).toBe(true);
    expect(bridgesToW50ReserveActivation(null)).toBe(false);
  });

  it('W67 grid code compliance bridge', () => {
    expect(bridgesToW67GridCodeCompliance('gcc-001')).toBe(true);
    expect(bridgesToW67GridCodeCompliance(null)).toBe(false);
  });

  it('W26 cyber incident bridge', () => {
    expect(bridgesToW26CyberIncident('cyber-001')).toBe(true);
    expect(bridgesToW26CyberIncident(undefined)).toBe(false);
  });

  it('W118 audit chain bridge (MANDATORY)', () => {
    expect(bridgesToW118AuditChain('block-12345')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W122 - telemetry quality 0-130 index', () => {
  it('empty input has no binary trust signals and finite floor score', () => {
    // Empty inputs treat latency/jitter/loss as 0 (perfect) so they contribute
    // their full bands, but binary signals (tls/cipher/protocol) are 0 -> no
    // trust component. Expect a low-to-mid score with no clamp violation.
    const s = telemetryQualityIndex({});
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(130);
    // No binary signals -> below the trust threshold of 35 (15+10+10).
    expect(s).toBeLessThan(80);
  });

  it('all-max binary signals + perfect telemetry returns ~130', () => {
    const score = telemetryQualityIndex({
      logical_node_count: 2000,
      data_object_count: 10000,
      messages_per_minute: 6000,
      signal_to_noise_db: 50,
      latency_p50_ms: 0,
      latency_p99_ms: 0,
      jitter_ms: 0,
      packet_loss_pct: 0,
      tls_cert_valid: true,
      iec_62351_cipher_ok: true,
      protocol_compliant: true,
    });
    expect(score).toBeGreaterThanOrEqual(125);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('high packet loss penalises score', () => {
    const good = telemetryQualityIndex({
      tls_cert_valid: true, iec_62351_cipher_ok: true, protocol_compliant: true,
      packet_loss_pct: 0,
    });
    const bad = telemetryQualityIndex({
      tls_cert_valid: true, iec_62351_cipher_ok: true, protocol_compliant: true,
      packet_loss_pct: 10,
    });
    expect(bad).toBeLessThan(good);
  });

  it('high latency penalises score', () => {
    const good = telemetryQualityIndex({ tls_cert_valid: true, latency_p50_ms: 0, latency_p99_ms: 0 });
    const bad = telemetryQualityIndex({ tls_cert_valid: true, latency_p50_ms: 200, latency_p99_ms: 500 });
    expect(bad).toBeLessThan(good);
  });

  it('high jitter penalises score', () => {
    const good = telemetryQualityIndex({ tls_cert_valid: true, jitter_ms: 0 });
    const bad = telemetryQualityIndex({ tls_cert_valid: true, jitter_ms: 100 });
    expect(bad).toBeLessThan(good);
  });

  it('score is clamped to 0..130', () => {
    const score = telemetryQualityIndex({
      logical_node_count: 999999,
      data_object_count: 999999,
      messages_per_minute: 999999,
      signal_to_noise_db: 999,
      latency_p50_ms: -50,
      latency_p99_ms: -50,
      jitter_ms: -10,
      packet_loss_pct: -5,
      tls_cert_valid: true,
      iec_62351_cipher_ok: true,
      protocol_compliant: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(130);
  });
});

describe('W122 - connector health band composite', () => {
  it('revoked -> critical', () => {
    expect(connectorHealthBand('revoked', 100, false, 100, {}, 0)).toBe('critical');
  });

  it('disconnected -> critical', () => {
    expect(connectorHealthBand('disconnected', 100, false, 100, {}, 0)).toBe('critical');
  });

  it('archived -> green', () => {
    expect(connectorHealthBand('archived', 100, false, 100, {}, 0)).toBe('green');
  });

  it('slaBreached -> red', () => {
    expect(connectorHealthBand('live_operations', 100, true, 100, {}, 0)).toBe('red');
  });

  it('packet_loss > 5% -> red', () => {
    expect(connectorHealthBand('live_operations', 100, false, 100, {}, 6)).toBe('red');
  });

  it('cert expiring within 14 days -> red', () => {
    expect(connectorHealthBand('live_operations', 100, false, 10, {}, 0)).toBe('red');
  });

  it('failover_active -> amber', () => {
    expect(connectorHealthBand('failover_active', 100, false, 100, {}, 0)).toBe('amber');
  });

  it('suspended -> amber', () => {
    expect(connectorHealthBand('suspended', 100, false, 100, {}, 0)).toBe('amber');
  });

  it('telemetry < 60 -> red', () => {
    expect(connectorHealthBand('live_operations', 55, false, 100, {}, 0)).toBe('red');
  });

  it('cert expiring within 60 days -> amber', () => {
    expect(connectorHealthBand('live_operations', 100, false, 40, {}, 0)).toBe('amber');
  });

  it('telemetry 60..89 -> amber', () => {
    expect(connectorHealthBand('live_operations', 80, false, 100, {}, 0)).toBe('amber');
  });

  it('full-green case', () => {
    expect(connectorHealthBand('live_operations', 100, false, 100, {}, 0)).toBe('green');
  });

  it('reconciliation_active full-green', () => {
    expect(connectorHealthBand('reconciliation_active', 95, false, 90, {}, 0.5)).toBe('green');
  });
});

describe('W122 - protocol taxonomy', () => {
  it('SCADA_PROTOCOLS contains the 9-protocol universe', () => {
    expect(SCADA_PROTOCOLS).toContain('iec_61850_mms');
    expect(SCADA_PROTOCOLS).toContain('iec_61850_goose');
    expect(SCADA_PROTOCOLS).toContain('iec_61850_sv');
    expect(SCADA_PROTOCOLS).toContain('iec_60870_5_104');
    expect(SCADA_PROTOCOLS).toContain('dnp3_tcp');
    expect(SCADA_PROTOCOLS).toContain('modbus_tcp');
    expect(SCADA_PROTOCOLS).toContain('modbus_rtu');
    expect(SCADA_PROTOCOLS).toContain('ieee_c37_118');
    expect(SCADA_PROTOCOLS).toContain('opc_ua');
    expect(SCADA_PROTOCOLS.length).toBe(9);
  });

  it('isKnownScadaProtocol guards against typos', () => {
    expect(isKnownScadaProtocol('iec_61850_mms')).toBe(true);
    expect(isKnownScadaProtocol('opc_ua')).toBe(true);
    expect(isKnownScadaProtocol('iec_61850')).toBe(false);
    expect(isKnownScadaProtocol(null)).toBe(false);
    expect(isKnownScadaProtocol('')).toBe(false);
  });
});

describe('W122 - mTLS fingerprint validation', () => {
  it('valid 64-hex fingerprint passes', () => {
    expect(isValidMtlsFingerprint('0'.repeat(64))).toBe(true);
    expect(isValidMtlsFingerprint('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789')).toBe(true);
  });

  it('accepts colon / dash / space separators', () => {
    expect(isValidMtlsFingerprint('aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99')).toBe(true);
    expect(isValidMtlsFingerprint('aa-bb-cc-dd-ee-ff-00-11-22-33-44-55-66-77-88-99-aa-bb-cc-dd-ee-ff-00-11-22-33-44-55-66-77-88-99')).toBe(true);
  });

  it('rejects empty / null / non-hex / wrong length', () => {
    expect(isValidMtlsFingerprint('')).toBe(false);
    expect(isValidMtlsFingerprint(null)).toBe(false);
    expect(isValidMtlsFingerprint(undefined)).toBe(false);
    expect(isValidMtlsFingerprint('not-hex-data')).toBe(false);
    expect(isValidMtlsFingerprint('a'.repeat(63))).toBe(false);
    expect(isValidMtlsFingerprint('a'.repeat(65))).toBe(false);
  });

  it('isAllowedPeerFingerprint passes any well-formed hex (stub)', () => {
    expect(isAllowedPeerFingerprint('0'.repeat(64))).toBe(true);
    expect(isAllowedPeerFingerprint('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789')).toBe(true);
  });

  it('isAllowedPeerFingerprint rejects malformed inputs', () => {
    expect(isAllowedPeerFingerprint('')).toBe(false);
    expect(isAllowedPeerFingerprint('not-hex')).toBe(false);
    expect(isAllowedPeerFingerprint('a'.repeat(60))).toBe(false);
  });
});
