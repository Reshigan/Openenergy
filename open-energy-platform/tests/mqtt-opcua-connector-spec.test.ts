// Wave 123 - MQTT / OPC UA Connector spec battery.
//
// Covers: state machine (forward path connector_proposed -> archived
// through 10 forward states + 4 branches: suspend/resume/failover/
// disconnect/revoke_credential, HARD terminals: archived/disconnected/
// credential_revoked, SOFT pauses: suspended/failover_active),
// 16-action TRANSITIONS coverage, INVERTED SLA polarity anchored on
// connector_proposed (168/240/360/480/720h), tier derivation from
// endpoint_count, FLOOR-AT-LARGE-FLEET on >=1 of 5 flags + FLOOR-AT-
// NATIONAL-IOT-BACKBONE on >=3 flags, effectiveTier with FLOOR lifting,
// heavy tier helpers, SIGNATURE MQTT-OPCUA-REVOKE crossings (
// revoke_credential EVERY tier; activate_failover heavy only;
// disconnect EVERY tier WHEN critical_safety_payload;
// bind_companion_spec national_iot_backbone only WHEN
// ieee_2030_5_csip_inverter_control; sla_breached HEAVY tiers only),
// party + event routing (4-step: iot_engineer/ot_security_manager/
// CISO/SO_CEO_or_IPP_CEO), authority ladder, urgency band INVERTED
// (edge_device tightest), daysToCertRenewal, 5-bridge architecture
// (W122/W71/W50/W26/W118; W118 mandatory), telemetry quality 0-130,
// connector health band composite, protocol taxonomy (8-protocol
// universe), companion-spec taxonomy, mTLS fingerprint validator +
// peer allow-list.

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
  tierForEndpointCount,
  countFloorFlags,
  floorAtLargeFleet,
  floorAtNationalIotBackbone,
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
  bridgesToW122ScadaConnector,
  bridgesToW71AssetPrognostics,
  bridgesToW50ReserveActivation,
  bridgesToW26CyberIncident,
  bridgesToW118AuditChain,
  telemetryQualityIndex,
  connectorHealthBand,
  isKnownMqttOpcuaProtocol,
  MQTT_OPCUA_PROTOCOLS,
  isKnownCompanionSpec,
  COMPANION_SPECS,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
} from '../src/utils/mqtt-opcua-connector-spec';

describe('W123 MQTT/OPC-UA connector - state machine forward path', () => {
  it('walks connector_proposed -> archived through all 10 forward states', () => {
    expect(nextStatus('connector_proposed', 'provision_broker')).toBe('broker_provisioned');
    expect(nextStatus('broker_provisioned', 'map_topics')).toBe('topics_mapped');
    expect(nextStatus('topics_mapped', 'configure_mutual_tls')).toBe('tls_mutual_configured');
    expect(nextStatus('tls_mutual_configured', 'register_client')).toBe('client_registered');
    expect(nextStatus('client_registered', 'start_publishing')).toBe('publishing_active');
    expect(nextStatus('publishing_active', 'validate_subscription')).toBe('subscription_validated');
    expect(nextStatus('subscription_validated', 'bind_companion_spec')).toBe('companion_spec_bound');
    expect(nextStatus('companion_spec_bound', 'go_live')).toBe('live_streaming');
    expect(nextStatus('live_streaming', 'activate_reconciliation')).toBe('reconciliation_active');
    expect(nextStatus('reconciliation_active', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('connector_proposed', 'map_topics')).toBeNull();
    expect(nextStatus('broker_provisioned', 'configure_mutual_tls')).toBeNull();
    expect(nextStatus('topics_mapped', 'register_client')).toBeNull();
    expect(nextStatus('tls_mutual_configured', 'start_publishing')).toBeNull();
    expect(nextStatus('client_registered', 'validate_subscription')).toBeNull();
    expect(nextStatus('publishing_active', 'bind_companion_spec')).toBeNull();
    expect(nextStatus('subscription_validated', 'go_live')).toBeNull();
    expect(nextStatus('companion_spec_bound', 'activate_reconciliation')).toBeNull();
    expect(nextStatus('live_streaming', 'archive')).toBeNull();
  });
});

describe('W123 - branch states (suspend / resume / failover / disconnect / revoke_credential)', () => {
  it('suspend can be entered from any active state up to reconciliation_active', () => {
    expect(nextStatus('broker_provisioned', 'suspend')).toBe('suspended');
    expect(nextStatus('tls_mutual_configured', 'suspend')).toBe('suspended');
    expect(nextStatus('publishing_active', 'suspend')).toBe('suspended');
    expect(nextStatus('live_streaming', 'suspend')).toBe('suspended');
    expect(nextStatus('reconciliation_active', 'suspend')).toBe('suspended');
  });

  it('suspend cannot be entered from connector_proposed', () => {
    expect(nextStatus('connector_proposed', 'suspend')).toBeNull();
  });

  it('resume returns to live_streaming', () => {
    expect(nextStatus('suspended', 'resume')).toBe('live_streaming');
  });

  it('activate_failover only from live_streaming or reconciliation_active', () => {
    expect(nextStatus('live_streaming', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('reconciliation_active', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('publishing_active', 'activate_failover')).toBeNull();
    expect(nextStatus('tls_mutual_configured', 'activate_failover')).toBeNull();
  });

  it('go_live can re-enter from failover_active or suspended', () => {
    expect(nextStatus('failover_active', 'go_live')).toBe('live_streaming');
    expect(nextStatus('suspended', 'go_live')).toBe('live_streaming');
  });

  it('disconnect from any non-terminal goes to disconnected', () => {
    expect(nextStatus('connector_proposed', 'disconnect')).toBe('disconnected');
    expect(nextStatus('topics_mapped', 'disconnect')).toBe('disconnected');
    expect(nextStatus('live_streaming', 'disconnect')).toBe('disconnected');
    expect(nextStatus('failover_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('suspended', 'disconnect')).toBe('disconnected');
  });

  it('revoke_credential from any non-terminal goes to credential_revoked', () => {
    expect(nextStatus('connector_proposed', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('live_streaming', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('reconciliation_active', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('suspended', 'revoke_credential')).toBe('credential_revoked');
  });
});

describe('W123 - HARD terminals block further transitions', () => {
  it('archived/disconnected/credential_revoked accept no further actions', () => {
    expect(nextStatus('archived', 'go_live')).toBeNull();
    expect(nextStatus('archived', 'suspend')).toBeNull();
    expect(nextStatus('disconnected', 'resume')).toBeNull();
    expect(nextStatus('disconnected', 'go_live')).toBeNull();
    expect(nextStatus('credential_revoked', 'configure_mutual_tls')).toBeNull();
    expect(nextStatus('credential_revoked', 'go_live')).toBeNull();
  });

  it('isTerminal + isHardTerminal flag the 3 hard terminals', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('disconnected')).toBe(true);
    expect(isTerminal('credential_revoked')).toBe(true);
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('disconnected')).toBe(true);
    expect(isHardTerminal('credential_revoked')).toBe(true);
  });

  it('SOFT pauses (suspended/failover_active) are NOT terminal', () => {
    expect(isTerminal('suspended')).toBe(false);
    expect(isTerminal('failover_active')).toBe(false);
    expect(isHardTerminal('suspended')).toBe(false);
    expect(isHardTerminal('failover_active')).toBe(false);
  });

  it('non-terminal active states are not terminal', () => {
    expect(isTerminal('connector_proposed')).toBe(false);
    expect(isTerminal('live_streaming')).toBe(false);
    expect(isTerminal('reconciliation_active')).toBe(false);
  });
});

describe('W123 - allowedActions surface', () => {
  it('connector_proposed surfaces provision_broker + disconnect + revoke_credential, NOT suspend', () => {
    const acts = allowedActions('connector_proposed');
    expect(acts).toContain('provision_broker');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke_credential');
    expect(acts).not.toContain('suspend'); // SUSPEND_FROM excludes connector_proposed
    expect(acts).not.toContain('propose_connector'); // create-only
  });

  it('live_streaming surfaces activate_reconciliation + activate_failover + suspend + revoke_credential', () => {
    const acts = allowedActions('live_streaming');
    expect(acts).toContain('activate_reconciliation');
    expect(acts).toContain('activate_failover');
    expect(acts).toContain('suspend');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke_credential');
  });

  it('archived surfaces no actions', () => {
    expect(allowedActions('archived')).toEqual([]);
  });

  it('disconnected surfaces no actions', () => {
    expect(allowedActions('disconnected')).toEqual([]);
  });

  it('credential_revoked surfaces no actions', () => {
    expect(allowedActions('credential_revoked')).toEqual([]);
  });
});

describe('W123 - 16-action TRANSITIONS coverage', () => {
  it('TRANSITIONS map contains all 16 actions', () => {
    const expected = [
      'propose_connector', 'provision_broker', 'map_topics',
      'configure_mutual_tls', 'register_client', 'start_publishing',
      'validate_subscription', 'bind_companion_spec', 'go_live',
      'activate_reconciliation', 'archive', 'disconnect', 'suspend',
      'resume', 'revoke_credential', 'activate_failover',
    ];
    for (const a of expected) expect(TRANSITIONS).toHaveProperty(a);
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });
});

describe('W123 - INVERTED SLA polarity', () => {
  it('connector_proposed anchor hours: edge 168 / small 240 / medium 360 / large 480 / national 720', () => {
    expect(SLA_HOURS['connector_proposed']['edge_device']).toBe(168);
    expect(SLA_HOURS['connector_proposed']['small_fleet']).toBe(240);
    expect(SLA_HOURS['connector_proposed']['medium_fleet']).toBe(360);
    expect(SLA_HOURS['connector_proposed']['large_fleet']).toBe(480);
    expect(SLA_HOURS['connector_proposed']['national_iot_backbone']).toBe(720);
  });

  it('national_iot_backbone always >= large_fleet across non-terminal states', () => {
    const states = [
      'connector_proposed', 'broker_provisioned', 'topics_mapped',
      'tls_mutual_configured', 'client_registered', 'publishing_active',
      'subscription_validated', 'companion_spec_bound', 'live_streaming',
      'reconciliation_active', 'suspended', 'failover_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['national_iot_backbone']).toBeGreaterThanOrEqual(SLA_HOURS[s]['large_fleet']);
    }
  });

  it('large_fleet always >= medium_fleet across active states', () => {
    const states = [
      'connector_proposed', 'tls_mutual_configured', 'publishing_active',
      'live_streaming', 'reconciliation_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['large_fleet']).toBeGreaterThanOrEqual(SLA_HOURS[s]['medium_fleet']);
    }
  });

  it('medium_fleet always >= small_fleet always >= edge_device across active states', () => {
    const states = [
      'connector_proposed', 'tls_mutual_configured', 'publishing_active',
      'live_streaming', 'reconciliation_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['medium_fleet']).toBeGreaterThanOrEqual(SLA_HOURS[s]['small_fleet']);
      expect(SLA_HOURS[s]['small_fleet']).toBeGreaterThanOrEqual(SLA_HOURS[s]['edge_device']);
    }
  });

  it('HARD terminals have zero SLA for every tier', () => {
    for (const tier of ['edge_device','small_fleet','medium_fleet','large_fleet','national_iot_backbone'] as const) {
      expect(SLA_HOURS['archived'][tier]).toBe(0);
      expect(SLA_HOURS['disconnected'][tier]).toBe(0);
      expect(SLA_HOURS['credential_revoked'][tier]).toBe(0);
    }
  });

  it('failover_active is tighter than live_streaming (faster recovery)', () => {
    for (const tier of ['edge_device','small_fleet','medium_fleet','large_fleet','national_iot_backbone'] as const) {
      expect(SLA_HOURS['failover_active'][tier]).toBeLessThan(SLA_HOURS['live_streaming'][tier]);
    }
  });

  it('slaWindowHours returns the expected matrix lookup', () => {
    expect(slaWindowHours('connector_proposed', 'national_iot_backbone')).toBe(720);
    expect(slaWindowHours('archived', 'edge_device')).toBe(0);
  });

  it('slaDeadlineFor offsets correctly and returns null for terminal', () => {
    const t = new Date('2026-05-31T00:00:00Z');
    const d = slaDeadlineFor('connector_proposed', 'edge_device', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(168 * 3600 * 1000);
    expect(slaDeadlineFor('archived', 'edge_device', t)).toBeNull();
  });

  it('slaHoursRemaining computes the delta', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-31T00:00:00Z'); // 24h later
    expect(slaHoursRemaining('connector_proposed', 'edge_device', enteredAt, now)).toBe(168 - 24);
  });

  it('slaHoursRemaining returns 0 when enteredAt is null', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(slaHoursRemaining('connector_proposed', 'edge_device', null, now)).toBe(0);
  });
});

describe('W123 - tier derivation from endpoint_count', () => {
  it('null / zero / negative -> edge_device', () => {
    expect(tierForEndpointCount(null)).toBe('edge_device');
    expect(tierForEndpointCount(0)).toBe('edge_device');
    expect(tierForEndpointCount(undefined)).toBe('edge_device');
    expect(tierForEndpointCount(-1)).toBe('edge_device');
  });

  it('<10 endpoints -> edge_device', () => {
    expect(tierForEndpointCount(1)).toBe('edge_device');
    expect(tierForEndpointCount(9)).toBe('edge_device');
  });

  it('10-49 endpoints -> small_fleet', () => {
    expect(tierForEndpointCount(10)).toBe('small_fleet');
    expect(tierForEndpointCount(49)).toBe('small_fleet');
  });

  it('50-199 endpoints -> medium_fleet', () => {
    expect(tierForEndpointCount(50)).toBe('medium_fleet');
    expect(tierForEndpointCount(199)).toBe('medium_fleet');
  });

  it('200-999 endpoints -> large_fleet', () => {
    expect(tierForEndpointCount(200)).toBe('large_fleet');
    expect(tierForEndpointCount(999)).toBe('large_fleet');
  });

  it('>=1000 endpoints -> national_iot_backbone', () => {
    expect(tierForEndpointCount(1000)).toBe('national_iot_backbone');
    expect(tierForEndpointCount(50000)).toBe('national_iot_backbone');
  });
});

describe('W123 - FLOOR flag counting + thresholds', () => {
  it('countFloorFlags counts each truthy flag once', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ critical_safety_payload: true })).toBe(1);
    expect(countFloorFlags({ critical_safety_payload: true, cross_border_iot_traffic: true })).toBe(2);
    expect(countFloorFlags({
      critical_safety_payload: true,
      cross_border_iot_traffic: true,
      sparkplug_b_required: true,
    })).toBe(3);
    expect(countFloorFlags({
      critical_safety_payload: true,
      cross_border_iot_traffic: true,
      sparkplug_b_required: true,
      ieee_2030_5_csip_inverter_control: true,
      aggregated_demand_response_above_50mw: true,
    })).toBe(5);
  });

  it('countFloorFlags treats 0/false/null as not-set', () => {
    expect(countFloorFlags({ critical_safety_payload: false, cross_border_iot_traffic: 0 })).toBe(0);
    expect(countFloorFlags({ sparkplug_b_required: null })).toBe(0);
  });

  it('floorAtLargeFleet triggers on >=1 flag', () => {
    expect(floorAtLargeFleet({})).toBe(false);
    expect(floorAtLargeFleet({ critical_safety_payload: true })).toBe(true);
    expect(floorAtLargeFleet({ aggregated_demand_response_above_50mw: true })).toBe(true);
  });

  it('floorAtNationalIotBackbone triggers on >=3 flags', () => {
    expect(floorAtNationalIotBackbone({ critical_safety_payload: true })).toBe(false);
    expect(floorAtNationalIotBackbone({
      critical_safety_payload: true,
      cross_border_iot_traffic: true,
    })).toBe(false);
    expect(floorAtNationalIotBackbone({
      critical_safety_payload: true,
      cross_border_iot_traffic: true,
      sparkplug_b_required: true,
    })).toBe(true);
    expect(floorAtNationalIotBackbone({
      critical_safety_payload: true,
      cross_border_iot_traffic: true,
      sparkplug_b_required: true,
      ieee_2030_5_csip_inverter_control: true,
      aggregated_demand_response_above_50mw: true,
    })).toBe(true);
  });
});

describe('W123 - effectiveTier with FLOOR lifting', () => {
  it('no flags -> raw tier preserved', () => {
    expect(effectiveTier('edge_device', {})).toBe('edge_device');
    expect(effectiveTier('small_fleet', {})).toBe('small_fleet');
    expect(effectiveTier('medium_fleet', {})).toBe('medium_fleet');
    expect(effectiveTier('large_fleet', {})).toBe('large_fleet');
    expect(effectiveTier('national_iot_backbone', {})).toBe('national_iot_backbone');
  });

  it('1 flag lifts edge/small/medium to large_fleet', () => {
    expect(effectiveTier('edge_device', { critical_safety_payload: true })).toBe('large_fleet');
    expect(effectiveTier('small_fleet', { critical_safety_payload: true })).toBe('large_fleet');
    expect(effectiveTier('medium_fleet', { critical_safety_payload: true })).toBe('large_fleet');
  });

  it('1 flag does not demote already-large or national', () => {
    expect(effectiveTier('large_fleet', { critical_safety_payload: true })).toBe('large_fleet');
    expect(effectiveTier('national_iot_backbone', { critical_safety_payload: true })).toBe('national_iot_backbone');
  });

  it('3+ flags lift any tier to national_iot_backbone', () => {
    const three = { critical_safety_payload: true, cross_border_iot_traffic: true, sparkplug_b_required: true };
    expect(effectiveTier('edge_device', three)).toBe('national_iot_backbone');
    expect(effectiveTier('small_fleet', three)).toBe('national_iot_backbone');
    expect(effectiveTier('large_fleet', three)).toBe('national_iot_backbone');
  });
});

describe('W123 - heavy tier helpers', () => {
  it('isHeavyTier flags large + national', () => {
    expect(isHeavyTier('large_fleet')).toBe(true);
    expect(isHeavyTier('national_iot_backbone')).toBe(true);
    expect(isHeavyTier('medium_fleet')).toBe(false);
    expect(isHeavyTier('small_fleet')).toBe(false);
    expect(isHeavyTier('edge_device')).toBe(false);
  });

  it('isReportable flags large + national', () => {
    expect(isReportable('large_fleet')).toBe(true);
    expect(isReportable('national_iot_backbone')).toBe(true);
    expect(isReportable('medium_fleet')).toBe(false);
    expect(isReportable('edge_device')).toBe(false);
  });
});

describe('W123 - SIGNATURE regulator crossings', () => {
  // SIGNATURE #1 - MQTT-OPCUA-REVOKE: revoke_credential EVERY tier.
  it('SIGNATURE: revoke_credential crosses EVERY tier', () => {
    expect(crossesIntoRegulator('revoke_credential', 'edge_device', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'small_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'medium_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'large_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'national_iot_backbone', {})).toBe(true);
  });

  // SIGNATURE #2 - activate_failover: large+national only.
  it('SIGNATURE: activate_failover crosses large + national only', () => {
    expect(crossesIntoRegulator('activate_failover', 'edge_device', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'small_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'medium_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'large_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'national_iot_backbone', {})).toBe(true);
  });

  // SIGNATURE #3 - disconnect: EVERY tier WHEN critical_safety_payload.
  it('SIGNATURE: disconnect crosses EVERY tier WHEN critical_safety_payload', () => {
    const flags = { flags: { critical_safety_payload: true } };
    expect(crossesIntoRegulator('disconnect', 'edge_device', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'small_fleet', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'medium_fleet', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'large_fleet', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'national_iot_backbone', flags)).toBe(true);
  });

  it('disconnect does NOT cross when critical_safety_payload is absent', () => {
    expect(crossesIntoRegulator('disconnect', 'edge_device', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'national_iot_backbone', {})).toBe(false);
  });

  // SIGNATURE #4 - bind_companion_spec: national_iot_backbone WHEN ieee_2030_5_csip_inverter_control.
  it('SIGNATURE: bind_companion_spec crosses national only WHEN ieee_2030_5_csip_inverter_control', () => {
    const flags = { flags: { ieee_2030_5_csip_inverter_control: true } };
    expect(crossesIntoRegulator('bind_companion_spec', 'edge_device', flags)).toBe(false);
    expect(crossesIntoRegulator('bind_companion_spec', 'small_fleet', flags)).toBe(false);
    expect(crossesIntoRegulator('bind_companion_spec', 'medium_fleet', flags)).toBe(false);
    expect(crossesIntoRegulator('bind_companion_spec', 'large_fleet', flags)).toBe(false);
    expect(crossesIntoRegulator('bind_companion_spec', 'national_iot_backbone', flags)).toBe(true);
  });

  it('bind_companion_spec does NOT cross when CSIP flag absent (even at national)', () => {
    expect(crossesIntoRegulator('bind_companion_spec', 'national_iot_backbone', {})).toBe(false);
  });

  // SIGNATURE #5 - sla_breached: large+national only.
  it('SIGNATURE: slaBreachCrossesIntoRegulator returns large+national only', () => {
    expect(slaBreachCrossesIntoRegulator('edge_device')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small_fleet')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium_fleet')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large_fleet')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('national_iot_backbone')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('go_live', 'national_iot_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('archive', 'national_iot_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('suspend', 'national_iot_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('resume', 'national_iot_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('start_publishing', 'national_iot_backbone', {})).toBe(false);
    expect(crossesIntoRegulator('configure_mutual_tls', 'national_iot_backbone', {})).toBe(false);
  });
});

describe('W123 - party + event routing', () => {
  it('party split assigns iot_engineer / OT / CISO / CEO correctly', () => {
    expect(partyForAction('propose_connector')).toBe('iot_engineer');
    expect(partyForAction('provision_broker')).toBe('iot_engineer');
    expect(partyForAction('map_topics')).toBe('iot_engineer');
    expect(partyForAction('configure_mutual_tls')).toBe('iot_engineer');
    expect(partyForAction('register_client')).toBe('iot_engineer');
    expect(partyForAction('start_publishing')).toBe('iot_engineer');
    expect(partyForAction('validate_subscription')).toBe('iot_engineer');
    expect(partyForAction('bind_companion_spec')).toBe('ot_security_manager');
    expect(partyForAction('activate_failover')).toBe('ot_security_manager');
    expect(partyForAction('suspend')).toBe('ot_security_manager');
    expect(partyForAction('resume')).toBe('ot_security_manager');
    expect(partyForAction('go_live')).toBe('CISO');
    expect(partyForAction('activate_reconciliation')).toBe('CISO');
    expect(partyForAction('disconnect')).toBe('CISO');
    expect(partyForAction('revoke_credential')).toBe('CISO');
    expect(partyForAction('archive')).toBe('SO_CEO_or_IPP_CEO');
  });

  it('eventTypeFor returns the mqtt_opcua_connector_* prefix event for every action', () => {
    expect(eventTypeFor('propose_connector')).toBe('mqtt_opcua_connector_proposed');
    expect(eventTypeFor('provision_broker')).toBe('mqtt_opcua_connector_broker_provisioned');
    expect(eventTypeFor('map_topics')).toBe('mqtt_opcua_connector_topics_mapped');
    expect(eventTypeFor('configure_mutual_tls')).toBe('mqtt_opcua_connector_tls_mutual_configured');
    expect(eventTypeFor('register_client')).toBe('mqtt_opcua_connector_client_registered');
    expect(eventTypeFor('start_publishing')).toBe('mqtt_opcua_connector_publishing_active');
    expect(eventTypeFor('validate_subscription')).toBe('mqtt_opcua_connector_subscription_validated');
    expect(eventTypeFor('bind_companion_spec')).toBe('mqtt_opcua_connector_companion_spec_bound');
    expect(eventTypeFor('go_live')).toBe('mqtt_opcua_connector_live_streaming');
    expect(eventTypeFor('activate_reconciliation')).toBe('mqtt_opcua_connector_reconciliation_active');
    expect(eventTypeFor('archive')).toBe('mqtt_opcua_connector_archived');
    expect(eventTypeFor('disconnect')).toBe('mqtt_opcua_connector_disconnected');
    expect(eventTypeFor('suspend')).toBe('mqtt_opcua_connector_suspended');
    expect(eventTypeFor('resume')).toBe('mqtt_opcua_connector_resumed');
    expect(eventTypeFor('revoke_credential')).toBe('mqtt_opcua_connector_credential_revoked');
    expect(eventTypeFor('activate_failover')).toBe('mqtt_opcua_connector_failover_activated');
  });
});

describe('W123 - urgencyBand INVERTED polarity (national loosest)', () => {
  it('negative slaHoursLeft -> critical for any tier', () => {
    expect(urgencyBand('edge_device', -1)).toBe('critical');
    expect(urgencyBand('national_iot_backbone', -1)).toBe('critical');
  });

  it('edge_device has tightest thresholds', () => {
    expect(urgencyBand('edge_device', 2)).toBe('critical');
    expect(urgencyBand('edge_device', 8)).toBe('high');
    expect(urgencyBand('edge_device', 20)).toBe('medium');
    expect(urgencyBand('edge_device', 100)).toBe('low');
  });

  it('national_iot_backbone has loosest thresholds (INVERTED)', () => {
    expect(urgencyBand('national_iot_backbone', 12)).toBe('critical');
    expect(urgencyBand('national_iot_backbone', 50)).toBe('high');
    expect(urgencyBand('national_iot_backbone', 150)).toBe('medium');
    expect(urgencyBand('national_iot_backbone', 400)).toBe('low');
  });

  it('large_fleet band ordering', () => {
    expect(urgencyBand('large_fleet', 10)).toBe('critical');
    expect(urgencyBand('large_fleet', 40)).toBe('high');
    expect(urgencyBand('large_fleet', 100)).toBe('medium');
    expect(urgencyBand('large_fleet', 300)).toBe('low');
  });

  it('medium_fleet band ordering', () => {
    expect(urgencyBand('medium_fleet', 6)).toBe('critical');
    expect(urgencyBand('medium_fleet', 30)).toBe('high');
    expect(urgencyBand('medium_fleet', 60)).toBe('medium');
    expect(urgencyBand('medium_fleet', 200)).toBe('low');
  });

  it('small_fleet band ordering', () => {
    expect(urgencyBand('small_fleet', 4)).toBe('critical');
    expect(urgencyBand('small_fleet', 16)).toBe('high');
    expect(urgencyBand('small_fleet', 36)).toBe('medium');
    expect(urgencyBand('small_fleet', 100)).toBe('low');
  });
});

describe('W123 - authority ladder', () => {
  it('national_iot_backbone -> SO_CEO (grid) or IPP_CEO (IPP)', () => {
    expect(authorityRequired('national_iot_backbone', true)).toBe('SO_CEO');
    expect(authorityRequired('national_iot_backbone', false)).toBe('IPP_CEO');
  });

  it('large + medium -> CISO', () => {
    expect(authorityRequired('large_fleet')).toBe('CISO');
    expect(authorityRequired('medium_fleet')).toBe('CISO');
  });

  it('small -> ot_security_manager', () => {
    expect(authorityRequired('small_fleet')).toBe('ot_security_manager');
  });

  it('edge_device -> iot_engineer', () => {
    expect(authorityRequired('edge_device')).toBe('iot_engineer');
  });
});

describe('W123 - daysToCertRenewal', () => {
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

describe('W123 - bridges (5-bridge architecture)', () => {
  it('W122 SCADA connector bridge triggers on truthy ref', () => {
    expect(bridgesToW122ScadaConnector('scc-001')).toBe(true);
    expect(bridgesToW122ScadaConnector(null)).toBe(false);
    expect(bridgesToW122ScadaConnector('')).toBe(false);
  });

  it('W71 asset prognostics bridge', () => {
    expect(bridgesToW71AssetPrognostics('aprog-001')).toBe(true);
    expect(bridgesToW71AssetPrognostics(null)).toBe(false);
  });

  it('W50 reserve activation bridge', () => {
    expect(bridgesToW50ReserveActivation('rsv-act-001')).toBe(true);
    expect(bridgesToW50ReserveActivation(null)).toBe(false);
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

describe('W123 - telemetry quality 0-130 index', () => {
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
      active_publishers: 2000,
      active_subscribers: 500,
      subscription_topic_count: 5000,
      retained_message_count: 2000,
      messages_per_second: 6000,
      qos_p99_ms: 0,
      payload_quality_index: 130,
      control_commands_authorized_count: 1000,
      control_commands_executed_24h: 1000,
      tls_cert_valid: true,
      iec_62443_cipher_ok: true,
      protocol_compliant: true,
    });
    expect(score).toBeGreaterThanOrEqual(125);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('high QoS p99 latency penalises score', () => {
    const good = telemetryQualityIndex({
      tls_cert_valid: true, iec_62443_cipher_ok: true, protocol_compliant: true,
      qos_p99_ms: 0,
    });
    const bad = telemetryQualityIndex({
      tls_cert_valid: true, iec_62443_cipher_ok: true, protocol_compliant: true,
      qos_p99_ms: 200,
    });
    expect(bad).toBeLessThan(good);
  });

  it('low publishers penalises score', () => {
    const good = telemetryQualityIndex({ tls_cert_valid: true, active_publishers: 2000 });
    const bad = telemetryQualityIndex({ tls_cert_valid: true, active_publishers: 0 });
    expect(bad).toBeLessThan(good);
  });

  it('low throughput penalises score', () => {
    const good = telemetryQualityIndex({ tls_cert_valid: true, messages_per_second: 6000 });
    const bad = telemetryQualityIndex({ tls_cert_valid: true, messages_per_second: 0 });
    expect(bad).toBeLessThan(good);
  });

  it('score is clamped to 0..130', () => {
    const score = telemetryQualityIndex({
      active_publishers: 999999,
      active_subscribers: 999999,
      subscription_topic_count: 999999,
      retained_message_count: 999999,
      messages_per_second: 999999,
      qos_p99_ms: -50,
      payload_quality_index: 999,
      control_commands_authorized_count: 999999,
      control_commands_executed_24h: 999999,
      tls_cert_valid: true,
      iec_62443_cipher_ok: true,
      protocol_compliant: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(130);
  });
});

describe('W123 - connector health band composite', () => {
  it('credential_revoked -> critical', () => {
    expect(connectorHealthBand('credential_revoked', 100, false, 100, {}, 0)).toBe('critical');
  });

  it('disconnected -> critical', () => {
    expect(connectorHealthBand('disconnected', 100, false, 100, {}, 0)).toBe('critical');
  });

  it('archived -> green', () => {
    expect(connectorHealthBand('archived', 100, false, 100, {}, 0)).toBe('green');
  });

  it('slaBreached -> red', () => {
    expect(connectorHealthBand('live_streaming', 100, true, 100, {}, 0)).toBe('red');
  });

  it('QoS p99 > 150ms -> red', () => {
    expect(connectorHealthBand('live_streaming', 100, false, 100, {}, 160)).toBe('red');
  });

  it('cert expiring within 14 days -> red', () => {
    expect(connectorHealthBand('live_streaming', 100, false, 10, {}, 0)).toBe('red');
  });

  it('failover_active -> amber', () => {
    expect(connectorHealthBand('failover_active', 100, false, 100, {}, 0)).toBe('amber');
  });

  it('suspended -> amber', () => {
    expect(connectorHealthBand('suspended', 100, false, 100, {}, 0)).toBe('amber');
  });

  it('telemetry < 60 -> red', () => {
    expect(connectorHealthBand('live_streaming', 55, false, 100, {}, 0)).toBe('red');
  });

  it('cert expiring within 60 days -> amber', () => {
    expect(connectorHealthBand('live_streaming', 100, false, 40, {}, 0)).toBe('amber');
  });

  it('telemetry 60..89 -> amber', () => {
    expect(connectorHealthBand('live_streaming', 80, false, 100, {}, 0)).toBe('amber');
  });

  it('full-green case', () => {
    expect(connectorHealthBand('live_streaming', 100, false, 100, {}, 0)).toBe('green');
  });

  it('reconciliation_active full-green', () => {
    expect(connectorHealthBand('reconciliation_active', 95, false, 90, {}, 20)).toBe('green');
  });
});

describe('W123 - protocol taxonomy', () => {
  it('MQTT_OPCUA_PROTOCOLS contains the 8-protocol universe', () => {
    expect(MQTT_OPCUA_PROTOCOLS).toContain('mqtt_v5');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('mqtt_sn');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('opc_ua_1_05');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('opc_ua_pubsub');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('sparkplug_b');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('iec_61400_25');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('ieee_2030_5');
    expect(MQTT_OPCUA_PROTOCOLS).toContain('sunspec_modbus');
    expect(MQTT_OPCUA_PROTOCOLS.length).toBe(8);
  });

  it('isKnownMqttOpcuaProtocol guards against typos', () => {
    expect(isKnownMqttOpcuaProtocol('mqtt_v5')).toBe(true);
    expect(isKnownMqttOpcuaProtocol('opc_ua_1_05')).toBe(true);
    expect(isKnownMqttOpcuaProtocol('opc_ua')).toBe(false);
    expect(isKnownMqttOpcuaProtocol(null)).toBe(false);
    expect(isKnownMqttOpcuaProtocol('')).toBe(false);
  });
});

describe('W123 - companion-spec taxonomy', () => {
  it('COMPANION_SPECS contains the 5-spec universe', () => {
    expect(COMPANION_SPECS).toContain('pv_industry');
    expect(COMPANION_SPECS).toContain('energy');
    expect(COMPANION_SPECS).toContain('battery');
    expect(COMPANION_SPECS).toContain('inverter');
    expect(COMPANION_SPECS).toContain('wind');
    expect(COMPANION_SPECS.length).toBe(5);
  });

  it('isKnownCompanionSpec guards against typos', () => {
    expect(isKnownCompanionSpec('pv_industry')).toBe(true);
    expect(isKnownCompanionSpec('inverter')).toBe(true);
    expect(isKnownCompanionSpec('photovoltaic')).toBe(false);
    expect(isKnownCompanionSpec(null)).toBe(false);
    expect(isKnownCompanionSpec('')).toBe(false);
  });
});

describe('W123 - mTLS fingerprint validation', () => {
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
