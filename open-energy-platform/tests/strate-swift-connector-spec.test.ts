// Wave 124 - STRATE / SWIFT Settlement Connector spec battery.
//
// Covers: 12-state machine (forward path connector_proposed ->
// cycle_reconciled -> archived through 9 forward states + 4 branches:
// suspend/resume/failover/disconnect/revoke_credential, HARD terminals:
// archived/disconnected/credential_revoked, SOFT pauses: suspended/
// failover_active), 16-action TRANSITIONS coverage, INVERTED SLA
// polarity anchored on connector_proposed (168/240/360/480/720h),
// tier derivation from settlement_value_zar_per_cycle, FLOOR-AT-SAMOS-
// RTGS on >=1 of 5 flags + FLOOR-AT-SWIFT-GLOBAL on >=3 flags,
// effectiveTier with FLOOR lifting, heavy tier helpers, SIGNATURE
// STRATE-SWIFT-CONNECTOR-REVOKE crossings (revoke_credential EVERY
// tier; activate_failover heavy only; disconnect EVERY tier WHEN
// cpmi_iosco_pfmi_principle9_systemic; authorize_live_settlement
// swift_global only; settle_cycle EVERY tier WHEN
// sarb_excon_authorization_required AND excon=expired; sla_breached
// HEAVY tiers only), party + event routing (4-step: settlements_clerk/
// settlements_manager/CFO/CEO), authority ladder, urgency band
// INVERTED (domestic_eft tightest, systemic short-circuit),
// daysToKeyRenewal, 5-bridge architecture (W120/W68/W3/W21/W118;
// W118+W120 MANDATORY), settlement quality 0-130, connector health
// band composite, protocol taxonomy (8-protocol universe), BIC
// validator (ISO 9362), mTLS fingerprint validator + peer allow-list.

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
  tierForSettlementValue,
  countFloorFlags,
  floorAtSamosRtgs,
  floorAtSwiftGlobal,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  daysToKeyRenewal,
  bridgesToW120ReconciliationAttestation,
  bridgesToW68CounterpartyMargin,
  bridgesToW3SettlementP6,
  bridgesToW21Drawdown,
  bridgesToW118AuditChain,
  settlementQualityIndex,
  connectorHealthBand,
  isKnownStrateSwiftProtocol,
  STRATE_SWIFT_PROTOCOLS,
  isValidBic,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
} from '../src/utils/strate-swift-connector-spec';

describe('W124 STRATE/SWIFT connector - state machine forward path', () => {
  it('walks connector_proposed -> archived through all 9 forward states', () => {
    expect(nextStatus('connector_proposed', 'validate_bic')).toBe('bic_validated');
    expect(nextStatus('bic_validated', 'complete_bank_handshake')).toBe('bank_handshake_completed');
    expect(nextStatus('bank_handshake_completed', 'load_iso20022_schemas')).toBe('iso20022_schemas_loaded');
    expect(nextStatus('iso20022_schemas_loaded', 'establish_messaging_session')).toBe('messaging_session_established');
    expect(nextStatus('messaging_session_established', 'validate_test_messages')).toBe('test_messages_validated');
    expect(nextStatus('test_messages_validated', 'bind_reconciliation_account')).toBe('reconciliation_account_bound');
    expect(nextStatus('reconciliation_account_bound', 'authorize_live_settlement')).toBe('live_settlement_active');
    expect(nextStatus('live_settlement_active', 'activate_reconciliation')).toBe('cycle_reconciled');
    expect(nextStatus('cycle_reconciled', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('connector_proposed', 'complete_bank_handshake')).toBeNull();
    expect(nextStatus('bic_validated', 'load_iso20022_schemas')).toBeNull();
    expect(nextStatus('bank_handshake_completed', 'establish_messaging_session')).toBeNull();
    expect(nextStatus('iso20022_schemas_loaded', 'validate_test_messages')).toBeNull();
    expect(nextStatus('messaging_session_established', 'bind_reconciliation_account')).toBeNull();
    expect(nextStatus('test_messages_validated', 'authorize_live_settlement')).toBeNull();
    expect(nextStatus('reconciliation_account_bound', 'activate_reconciliation')).toBeNull();
    expect(nextStatus('live_settlement_active', 'archive')).toBeNull();
  });
});

describe('W124 - branch states (suspend / resume / failover / disconnect / revoke_credential)', () => {
  it('suspend can be entered from any active state from bic_validated up', () => {
    expect(nextStatus('bic_validated', 'suspend')).toBe('suspended');
    expect(nextStatus('iso20022_schemas_loaded', 'suspend')).toBe('suspended');
    expect(nextStatus('messaging_session_established', 'suspend')).toBe('suspended');
    expect(nextStatus('live_settlement_active', 'suspend')).toBe('suspended');
    expect(nextStatus('cycle_reconciled', 'suspend')).toBe('suspended');
  });

  it('suspend cannot be entered from connector_proposed', () => {
    expect(nextStatus('connector_proposed', 'suspend')).toBeNull();
  });

  it('resume returns to live_settlement_active', () => {
    expect(nextStatus('suspended', 'resume')).toBe('live_settlement_active');
  });

  it('activate_failover only from live_settlement_active or cycle_reconciled', () => {
    expect(nextStatus('live_settlement_active', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('cycle_reconciled', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('reconciliation_account_bound', 'activate_failover')).toBeNull();
    expect(nextStatus('messaging_session_established', 'activate_failover')).toBeNull();
  });

  it('authorize_live_settlement can re-enter from failover_active or suspended', () => {
    expect(nextStatus('failover_active', 'authorize_live_settlement')).toBe('live_settlement_active');
    expect(nextStatus('suspended', 'authorize_live_settlement')).toBe('live_settlement_active');
  });

  it('disconnect from any non-terminal goes to disconnected', () => {
    expect(nextStatus('connector_proposed', 'disconnect')).toBe('disconnected');
    expect(nextStatus('bic_validated', 'disconnect')).toBe('disconnected');
    expect(nextStatus('live_settlement_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('cycle_reconciled', 'disconnect')).toBe('disconnected');
    expect(nextStatus('failover_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('suspended', 'disconnect')).toBe('disconnected');
  });

  it('revoke_credential from any non-terminal goes to credential_revoked', () => {
    expect(nextStatus('connector_proposed', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('live_settlement_active', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('cycle_reconciled', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('suspended', 'revoke_credential')).toBe('credential_revoked');
  });

  it('settle_cycle re-enters cycle_reconciled from live_settlement_active', () => {
    expect(nextStatus('live_settlement_active', 'settle_cycle')).toBe('cycle_reconciled');
    expect(nextStatus('cycle_reconciled', 'settle_cycle')).toBe('cycle_reconciled');
  });
});

describe('W124 - HARD terminals block further transitions', () => {
  it('archived/disconnected/credential_revoked accept no further actions', () => {
    expect(nextStatus('archived', 'authorize_live_settlement')).toBeNull();
    expect(nextStatus('archived', 'suspend')).toBeNull();
    expect(nextStatus('disconnected', 'resume')).toBeNull();
    expect(nextStatus('disconnected', 'authorize_live_settlement')).toBeNull();
    expect(nextStatus('credential_revoked', 'complete_bank_handshake')).toBeNull();
    expect(nextStatus('credential_revoked', 'authorize_live_settlement')).toBeNull();
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
    expect(isTerminal('live_settlement_active')).toBe(false);
    expect(isTerminal('cycle_reconciled')).toBe(false);
  });
});

describe('W124 - allowedActions surface', () => {
  it('connector_proposed surfaces validate_bic + disconnect + revoke_credential, NOT suspend', () => {
    const acts = allowedActions('connector_proposed');
    expect(acts).toContain('validate_bic');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke_credential');
    expect(acts).not.toContain('suspend');
    expect(acts).not.toContain('propose_connector'); // create-only
  });

  it('live_settlement_active surfaces activate_reconciliation + activate_failover + settle_cycle + suspend + revoke_credential', () => {
    const acts = allowedActions('live_settlement_active');
    expect(acts).toContain('activate_reconciliation');
    expect(acts).toContain('activate_failover');
    expect(acts).toContain('settle_cycle');
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

describe('W124 - 16-action TRANSITIONS coverage', () => {
  it('TRANSITIONS map contains all 16 actions', () => {
    const expected = [
      'propose_connector', 'validate_bic', 'complete_bank_handshake',
      'load_iso20022_schemas', 'establish_messaging_session',
      'validate_test_messages', 'bind_reconciliation_account',
      'authorize_live_settlement', 'activate_reconciliation',
      'archive', 'disconnect', 'suspend', 'resume',
      'revoke_credential', 'activate_failover', 'settle_cycle',
    ];
    for (const a of expected) expect(TRANSITIONS).toHaveProperty(a);
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });
});

describe('W124 - INVERTED SLA polarity', () => {
  it('connector_proposed anchor: domestic 168 / multi_bank 240 / strate 360 / samos 480 / swift 720', () => {
    expect(SLA_HOURS['connector_proposed']['domestic_eft']).toBe(168);
    expect(SLA_HOURS['connector_proposed']['multi_bank_eft']).toBe(240);
    expect(SLA_HOURS['connector_proposed']['strate_csd']).toBe(360);
    expect(SLA_HOURS['connector_proposed']['samos_rtgs']).toBe(480);
    expect(SLA_HOURS['connector_proposed']['swift_global']).toBe(720);
  });

  it('swift_global always >= samos_rtgs across non-terminal states', () => {
    const states = [
      'connector_proposed', 'bic_validated', 'bank_handshake_completed',
      'iso20022_schemas_loaded', 'messaging_session_established',
      'test_messages_validated', 'reconciliation_account_bound',
      'live_settlement_active', 'cycle_reconciled', 'suspended',
      'failover_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['swift_global']).toBeGreaterThanOrEqual(SLA_HOURS[s]['samos_rtgs']);
    }
  });

  it('samos_rtgs always >= strate_csd across active states', () => {
    const states = [
      'connector_proposed', 'bank_handshake_completed', 'live_settlement_active',
      'cycle_reconciled',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['samos_rtgs']).toBeGreaterThanOrEqual(SLA_HOURS[s]['strate_csd']);
    }
  });

  it('strate_csd >= multi_bank_eft >= domestic_eft across active states', () => {
    const states = [
      'connector_proposed', 'live_settlement_active', 'cycle_reconciled',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['strate_csd']).toBeGreaterThanOrEqual(SLA_HOURS[s]['multi_bank_eft']);
      expect(SLA_HOURS[s]['multi_bank_eft']).toBeGreaterThanOrEqual(SLA_HOURS[s]['domestic_eft']);
    }
  });

  it('HARD terminals have zero SLA for every tier', () => {
    for (const tier of ['domestic_eft','multi_bank_eft','strate_csd','samos_rtgs','swift_global'] as const) {
      expect(SLA_HOURS['archived'][tier]).toBe(0);
      expect(SLA_HOURS['disconnected'][tier]).toBe(0);
      expect(SLA_HOURS['credential_revoked'][tier]).toBe(0);
    }
  });

  it('failover_active is tighter than live_settlement_active (faster cutover recovery)', () => {
    for (const tier of ['domestic_eft','multi_bank_eft','strate_csd','samos_rtgs','swift_global'] as const) {
      expect(SLA_HOURS['failover_active'][tier]).toBeLessThan(SLA_HOURS['live_settlement_active'][tier]);
    }
  });

  it('slaWindowHours returns the expected matrix lookup', () => {
    expect(slaWindowHours('connector_proposed', 'swift_global')).toBe(720);
    expect(slaWindowHours('archived', 'domestic_eft')).toBe(0);
  });

  it('slaDeadlineFor offsets correctly and returns null for terminal', () => {
    const t = new Date('2026-05-31T00:00:00Z');
    const d = slaDeadlineFor('connector_proposed', 'domestic_eft', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(168 * 3600 * 1000);
    expect(slaDeadlineFor('archived', 'domestic_eft', t)).toBeNull();
  });

  it('slaHoursRemaining computes the delta', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-31T00:00:00Z'); // 24h later
    expect(slaHoursRemaining('connector_proposed', 'domestic_eft', enteredAt, now)).toBe(168 - 24);
  });

  it('slaHoursRemaining returns 0 when enteredAt is null', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(slaHoursRemaining('connector_proposed', 'domestic_eft', null, now)).toBe(0);
  });
});

describe('W124 - tier derivation from settlement_value_zar_per_cycle', () => {
  it('null / zero / negative -> domestic_eft', () => {
    expect(tierForSettlementValue(null)).toBe('domestic_eft');
    expect(tierForSettlementValue(0)).toBe('domestic_eft');
    expect(tierForSettlementValue(undefined)).toBe('domestic_eft');
    expect(tierForSettlementValue(-1)).toBe('domestic_eft');
  });

  it('<R500k -> domestic_eft', () => {
    expect(tierForSettlementValue(1)).toBe('domestic_eft');
    expect(tierForSettlementValue(499_999)).toBe('domestic_eft');
  });

  it('R500k-R5m -> multi_bank_eft', () => {
    expect(tierForSettlementValue(500_000)).toBe('multi_bank_eft');
    expect(tierForSettlementValue(4_999_999)).toBe('multi_bank_eft');
  });

  it('R5m-R15m -> strate_csd', () => {
    expect(tierForSettlementValue(5_000_000)).toBe('strate_csd');
    expect(tierForSettlementValue(14_999_999)).toBe('strate_csd');
  });

  it('R15m-R50m -> samos_rtgs', () => {
    expect(tierForSettlementValue(15_000_000)).toBe('samos_rtgs');
    expect(tierForSettlementValue(49_999_999)).toBe('samos_rtgs');
  });

  it('>=R50m -> swift_global', () => {
    expect(tierForSettlementValue(50_000_000)).toBe('swift_global');
    expect(tierForSettlementValue(500_000_000)).toBe('swift_global');
  });
});

describe('W124 - FLOOR flag counting + thresholds', () => {
  it('countFloorFlags counts each truthy flag once', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ cross_border_payment: true })).toBe(1);
    expect(countFloorFlags({ cross_border_payment: true, sarb_excon_authorization_required: true })).toBe(2);
    expect(countFloorFlags({
      cross_border_payment: true,
      sarb_excon_authorization_required: true,
      fic_act_high_risk_jurisdiction: true,
    })).toBe(3);
    expect(countFloorFlags({
      cross_border_payment: true,
      sarb_excon_authorization_required: true,
      fic_act_high_risk_jurisdiction: true,
      basel_lcr_tier1_collateral: true,
      cpmi_iosco_pfmi_principle9_systemic: true,
    })).toBe(5);
  });

  it('countFloorFlags treats 0/false/null as not-set', () => {
    expect(countFloorFlags({ cross_border_payment: false, sarb_excon_authorization_required: 0 })).toBe(0);
    expect(countFloorFlags({ fic_act_high_risk_jurisdiction: null })).toBe(0);
  });

  it('floorAtSamosRtgs triggers on >=1 flag', () => {
    expect(floorAtSamosRtgs({})).toBe(false);
    expect(floorAtSamosRtgs({ cross_border_payment: true })).toBe(true);
    expect(floorAtSamosRtgs({ cpmi_iosco_pfmi_principle9_systemic: true })).toBe(true);
  });

  it('floorAtSwiftGlobal triggers on >=3 flags', () => {
    expect(floorAtSwiftGlobal({ cross_border_payment: true })).toBe(false);
    expect(floorAtSwiftGlobal({
      cross_border_payment: true,
      sarb_excon_authorization_required: true,
    })).toBe(false);
    expect(floorAtSwiftGlobal({
      cross_border_payment: true,
      sarb_excon_authorization_required: true,
      fic_act_high_risk_jurisdiction: true,
    })).toBe(true);
    expect(floorAtSwiftGlobal({
      cross_border_payment: true,
      sarb_excon_authorization_required: true,
      fic_act_high_risk_jurisdiction: true,
      basel_lcr_tier1_collateral: true,
      cpmi_iosco_pfmi_principle9_systemic: true,
    })).toBe(true);
  });
});

describe('W124 - effectiveTier with FLOOR lifting', () => {
  it('no flags -> raw tier preserved', () => {
    expect(effectiveTier('domestic_eft', {})).toBe('domestic_eft');
    expect(effectiveTier('multi_bank_eft', {})).toBe('multi_bank_eft');
    expect(effectiveTier('strate_csd', {})).toBe('strate_csd');
    expect(effectiveTier('samos_rtgs', {})).toBe('samos_rtgs');
    expect(effectiveTier('swift_global', {})).toBe('swift_global');
  });

  it('1 flag lifts domestic/multi_bank/strate to samos_rtgs', () => {
    expect(effectiveTier('domestic_eft', { cross_border_payment: true })).toBe('samos_rtgs');
    expect(effectiveTier('multi_bank_eft', { cross_border_payment: true })).toBe('samos_rtgs');
    expect(effectiveTier('strate_csd', { cross_border_payment: true })).toBe('samos_rtgs');
  });

  it('1 flag does not demote already-samos or swift', () => {
    expect(effectiveTier('samos_rtgs', { cross_border_payment: true })).toBe('samos_rtgs');
    expect(effectiveTier('swift_global', { cross_border_payment: true })).toBe('swift_global');
  });

  it('3+ flags lift any tier to swift_global', () => {
    const three = { cross_border_payment: true, sarb_excon_authorization_required: true, fic_act_high_risk_jurisdiction: true };
    expect(effectiveTier('domestic_eft', three)).toBe('swift_global');
    expect(effectiveTier('multi_bank_eft', three)).toBe('swift_global');
    expect(effectiveTier('samos_rtgs', three)).toBe('swift_global');
  });
});

describe('W124 - heavy tier helpers', () => {
  it('isHeavyTier flags samos_rtgs + swift_global', () => {
    expect(isHeavyTier('samos_rtgs')).toBe(true);
    expect(isHeavyTier('swift_global')).toBe(true);
    expect(isHeavyTier('strate_csd')).toBe(false);
    expect(isHeavyTier('multi_bank_eft')).toBe(false);
    expect(isHeavyTier('domestic_eft')).toBe(false);
  });

  it('isReportable flags samos_rtgs + swift_global', () => {
    expect(isReportable('samos_rtgs')).toBe(true);
    expect(isReportable('swift_global')).toBe(true);
    expect(isReportable('strate_csd')).toBe(false);
    expect(isReportable('domestic_eft')).toBe(false);
  });
});

describe('W124 - SIGNATURE regulator crossings', () => {
  // SIGNATURE #1 - STRATE-SWIFT-CONNECTOR-REVOKE: revoke_credential EVERY tier.
  it('SIGNATURE: revoke_credential crosses EVERY tier', () => {
    expect(crossesIntoRegulator('revoke_credential', 'domestic_eft', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'multi_bank_eft', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'strate_csd', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'samos_rtgs', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'swift_global', {})).toBe(true);
  });

  // SIGNATURE #2 - activate_failover: samos+swift only.
  it('SIGNATURE: activate_failover crosses samos_rtgs + swift_global only', () => {
    expect(crossesIntoRegulator('activate_failover', 'domestic_eft', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'multi_bank_eft', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'strate_csd', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'samos_rtgs', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'swift_global', {})).toBe(true);
  });

  // SIGNATURE #3 - disconnect: EVERY tier WHEN cpmi_systemic.
  it('SIGNATURE: disconnect crosses EVERY tier WHEN cpmi_iosco_pfmi_principle9_systemic', () => {
    const flags = { flags: { cpmi_iosco_pfmi_principle9_systemic: true } };
    expect(crossesIntoRegulator('disconnect', 'domestic_eft', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'multi_bank_eft', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'strate_csd', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'samos_rtgs', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'swift_global', flags)).toBe(true);
  });

  it('disconnect does NOT cross when cpmi_systemic is absent', () => {
    expect(crossesIntoRegulator('disconnect', 'domestic_eft', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'samos_rtgs', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'swift_global', {})).toBe(false);
  });

  // SIGNATURE #4 - authorize_live_settlement: swift_global only.
  it('SIGNATURE: authorize_live_settlement crosses swift_global only', () => {
    expect(crossesIntoRegulator('authorize_live_settlement', 'domestic_eft', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_live_settlement', 'multi_bank_eft', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_live_settlement', 'strate_csd', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_live_settlement', 'samos_rtgs', {})).toBe(false);
    expect(crossesIntoRegulator('authorize_live_settlement', 'swift_global', {})).toBe(true);
  });

  // SIGNATURE #5 - settle_cycle: EVERY tier WHEN sarb_excon AND excon=expired.
  it('SIGNATURE: settle_cycle crosses EVERY tier WHEN sarb_excon_authorization_required AND excon=expired', () => {
    const args = {
      flags: { sarb_excon_authorization_required: true },
      excon_authorization_status: 'expired' as const,
    };
    expect(crossesIntoRegulator('settle_cycle', 'domestic_eft', args)).toBe(true);
    expect(crossesIntoRegulator('settle_cycle', 'multi_bank_eft', args)).toBe(true);
    expect(crossesIntoRegulator('settle_cycle', 'strate_csd', args)).toBe(true);
    expect(crossesIntoRegulator('settle_cycle', 'samos_rtgs', args)).toBe(true);
    expect(crossesIntoRegulator('settle_cycle', 'swift_global', args)).toBe(true);
  });

  it('settle_cycle does NOT cross when ExCon authorized', () => {
    const args = {
      flags: { sarb_excon_authorization_required: true },
      excon_authorization_status: 'authorized' as const,
    };
    expect(crossesIntoRegulator('settle_cycle', 'samos_rtgs', args)).toBe(false);
    expect(crossesIntoRegulator('settle_cycle', 'swift_global', args)).toBe(false);
  });

  it('settle_cycle does NOT cross when excon flag absent', () => {
    const args = { excon_authorization_status: 'expired' as const };
    expect(crossesIntoRegulator('settle_cycle', 'swift_global', args)).toBe(false);
  });

  // SIGNATURE #6 - sla_breached: samos+swift only.
  it('SIGNATURE: slaBreachCrossesIntoRegulator returns samos+swift only', () => {
    expect(slaBreachCrossesIntoRegulator('domestic_eft')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('multi_bank_eft')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('strate_csd')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('samos_rtgs')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('swift_global')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('authorize_live_settlement', 'domestic_eft', {})).toBe(false);
    expect(crossesIntoRegulator('archive', 'swift_global', {})).toBe(false);
    expect(crossesIntoRegulator('suspend', 'swift_global', {})).toBe(false);
    expect(crossesIntoRegulator('resume', 'swift_global', {})).toBe(false);
    expect(crossesIntoRegulator('validate_bic', 'swift_global', {})).toBe(false);
    expect(crossesIntoRegulator('complete_bank_handshake', 'swift_global', {})).toBe(false);
    expect(crossesIntoRegulator('load_iso20022_schemas', 'swift_global', {})).toBe(false);
  });
});

describe('W124 - party + event routing', () => {
  it('party split assigns settlements_clerk / settlements_manager / CFO / CEO correctly', () => {
    expect(partyForAction('propose_connector')).toBe('settlements_clerk');
    expect(partyForAction('validate_bic')).toBe('settlements_clerk');
    expect(partyForAction('complete_bank_handshake')).toBe('settlements_clerk');
    expect(partyForAction('load_iso20022_schemas')).toBe('settlements_clerk');
    expect(partyForAction('establish_messaging_session')).toBe('settlements_clerk');
    expect(partyForAction('validate_test_messages')).toBe('settlements_clerk');
    expect(partyForAction('bind_reconciliation_account')).toBe('settlements_clerk');
    expect(partyForAction('authorize_live_settlement')).toBe('settlements_manager');
    expect(partyForAction('activate_failover')).toBe('settlements_manager');
    expect(partyForAction('suspend')).toBe('settlements_manager');
    expect(partyForAction('resume')).toBe('settlements_manager');
    expect(partyForAction('settle_cycle')).toBe('settlements_manager');
    expect(partyForAction('activate_reconciliation')).toBe('CFO');
    expect(partyForAction('disconnect')).toBe('CFO');
    expect(partyForAction('revoke_credential')).toBe('CFO');
    expect(partyForAction('archive')).toBe('CEO');
  });

  it('eventTypeFor returns the strate_swift_connector_* prefix event for every action', () => {
    expect(eventTypeFor('propose_connector')).toBe('strate_swift_connector_proposed');
    expect(eventTypeFor('validate_bic')).toBe('strate_swift_connector_bic_validated');
    expect(eventTypeFor('complete_bank_handshake')).toBe('strate_swift_connector_bank_handshake_completed');
    expect(eventTypeFor('load_iso20022_schemas')).toBe('strate_swift_connector_iso20022_schemas_loaded');
    expect(eventTypeFor('establish_messaging_session')).toBe('strate_swift_connector_messaging_session_established');
    expect(eventTypeFor('validate_test_messages')).toBe('strate_swift_connector_test_messages_validated');
    expect(eventTypeFor('bind_reconciliation_account')).toBe('strate_swift_connector_reconciliation_account_bound');
    expect(eventTypeFor('authorize_live_settlement')).toBe('strate_swift_connector_live_settlement_active');
    expect(eventTypeFor('activate_reconciliation')).toBe('strate_swift_connector_cycle_reconciled');
    expect(eventTypeFor('archive')).toBe('strate_swift_connector_archived');
    expect(eventTypeFor('disconnect')).toBe('strate_swift_connector_disconnected');
    expect(eventTypeFor('suspend')).toBe('strate_swift_connector_suspended');
    expect(eventTypeFor('resume')).toBe('strate_swift_connector_resumed');
    expect(eventTypeFor('revoke_credential')).toBe('strate_swift_connector_credential_revoked');
    expect(eventTypeFor('activate_failover')).toBe('strate_swift_connector_failover_activated');
    expect(eventTypeFor('settle_cycle')).toBe('strate_swift_connector_cycle_settled');
  });
});

describe('W124 - urgencyBand INVERTED polarity (swift_global loosest)', () => {
  it('cpmi_systemic flag short-circuits to systemic urgency', () => {
    expect(urgencyBand('domestic_eft', 999, { cpmi_iosco_pfmi_principle9_systemic: true })).toBe('systemic');
    expect(urgencyBand('swift_global', 999, { cpmi_iosco_pfmi_principle9_systemic: true })).toBe('systemic');
  });

  it('negative slaHoursLeft -> critical for any tier', () => {
    expect(urgencyBand('domestic_eft', -1)).toBe('critical');
    expect(urgencyBand('swift_global', -1)).toBe('critical');
  });

  it('domestic_eft has tightest thresholds', () => {
    expect(urgencyBand('domestic_eft', 2)).toBe('critical');
    expect(urgencyBand('domestic_eft', 8)).toBe('high');
    expect(urgencyBand('domestic_eft', 20)).toBe('medium');
    expect(urgencyBand('domestic_eft', 100)).toBe('low');
  });

  it('swift_global has loosest thresholds (INVERTED)', () => {
    expect(urgencyBand('swift_global', 12)).toBe('critical');
    expect(urgencyBand('swift_global', 50)).toBe('high');
    expect(urgencyBand('swift_global', 150)).toBe('medium');
    expect(urgencyBand('swift_global', 400)).toBe('low');
  });

  it('samos_rtgs band ordering', () => {
    expect(urgencyBand('samos_rtgs', 10)).toBe('critical');
    expect(urgencyBand('samos_rtgs', 40)).toBe('high');
    expect(urgencyBand('samos_rtgs', 100)).toBe('medium');
    expect(urgencyBand('samos_rtgs', 300)).toBe('low');
  });

  it('strate_csd band ordering', () => {
    expect(urgencyBand('strate_csd', 6)).toBe('critical');
    expect(urgencyBand('strate_csd', 30)).toBe('high');
    expect(urgencyBand('strate_csd', 60)).toBe('medium');
    expect(urgencyBand('strate_csd', 200)).toBe('low');
  });

  it('multi_bank_eft band ordering', () => {
    expect(urgencyBand('multi_bank_eft', 4)).toBe('critical');
    expect(urgencyBand('multi_bank_eft', 16)).toBe('high');
    expect(urgencyBand('multi_bank_eft', 36)).toBe('medium');
    expect(urgencyBand('multi_bank_eft', 100)).toBe('low');
  });
});

describe('W124 - authority ladder', () => {
  it('swift_global -> CEO', () => {
    expect(authorityRequired('swift_global')).toBe('CEO');
  });

  it('samos_rtgs -> CFO', () => {
    expect(authorityRequired('samos_rtgs')).toBe('CFO');
  });

  it('strate_csd -> settlements_manager', () => {
    expect(authorityRequired('strate_csd')).toBe('settlements_manager');
  });

  it('multi_bank_eft -> settlements_clerk', () => {
    expect(authorityRequired('multi_bank_eft')).toBe('settlements_clerk');
  });

  it('domestic_eft -> settlements_clerk', () => {
    expect(authorityRequired('domestic_eft')).toBe('settlements_clerk');
  });
});

describe('W124 - daysToKeyRenewal', () => {
  it('null key returns 9999', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToKeyRenewal(null, now)).toBe(9999);
    expect(daysToKeyRenewal(undefined, now)).toBe(9999);
  });

  it('future key returns positive days', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    const days = daysToKeyRenewal('2026-08-29T00:00:00Z', now); // ~90 days
    expect(days).toBeGreaterThanOrEqual(89);
    expect(days).toBeLessThanOrEqual(91);
  });

  it('past key returns 0', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToKeyRenewal('2026-01-01T00:00:00Z', now)).toBe(0);
  });
});

describe('W124 - bridges (5-bridge architecture)', () => {
  it('W120 reconciliation attestation bridge triggers on truthy ref (MANDATORY)', () => {
    expect(bridgesToW120ReconciliationAttestation('ratt-001')).toBe(true);
    expect(bridgesToW120ReconciliationAttestation(null)).toBe(false);
    expect(bridgesToW120ReconciliationAttestation('')).toBe(false);
  });

  it('W68 counterparty margin bridge', () => {
    expect(bridgesToW68CounterpartyMargin('ccm-001')).toBe(true);
    expect(bridgesToW68CounterpartyMargin(null)).toBe(false);
  });

  it('W3 settlement P6 bridge', () => {
    expect(bridgesToW3SettlementP6('stl-001')).toBe(true);
    expect(bridgesToW3SettlementP6(null)).toBe(false);
  });

  it('W21 drawdown bridge', () => {
    expect(bridgesToW21Drawdown('dd-001')).toBe(true);
    expect(bridgesToW21Drawdown(undefined)).toBe(false);
  });

  it('W118 audit chain bridge (MANDATORY)', () => {
    expect(bridgesToW118AuditChain('block-12345')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W124 - settlement quality 0-130 index', () => {
  it('empty input has no binary trust signals and finite floor score', () => {
    const s = settlementQualityIndex({});
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(130);
    // No binary signals -> below the trust threshold of ~45.
    expect(s).toBeLessThan(80);
  });

  it('all-max binary signals + perfect settlement metrics returns ~130', () => {
    const score = settlementQualityIndex({
      settlement_messages_per_minute: 400,
      successful_settlement_count_24h: 6000,
      failed_settlement_count_24h: 0,
      failure_rate_pct: 0,
      average_settlement_latency_ms: 0,
      reconciliation_break_count: 0,
      lcr_contribution_pct: 25,
      nsfr_contribution_pct: 18,
      excon_authorization_status: 'authorized',
      fic_act_kyc_status: 'clean',
      protocol_compliant: true,
      iso27001_controls_ok: true,
      pci_dss_segmentation_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(125);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('high failure_rate_pct penalises score', () => {
    const good = settlementQualityIndex({
      protocol_compliant: true, iso27001_controls_ok: true, pci_dss_segmentation_ok: true,
      failure_rate_pct: 0,
    });
    const bad = settlementQualityIndex({
      protocol_compliant: true, iso27001_controls_ok: true, pci_dss_segmentation_ok: true,
      failure_rate_pct: 5,
    });
    expect(bad).toBeLessThan(good);
  });

  it('expired excon_authorization penalises score vs authorized', () => {
    const good = settlementQualityIndex({ excon_authorization_status: 'authorized' });
    const bad = settlementQualityIndex({ excon_authorization_status: 'expired' });
    expect(bad).toBeLessThan(good);
  });

  it('flagged FIC Act KYC penalises score vs clean', () => {
    const good = settlementQualityIndex({ fic_act_kyc_status: 'clean' });
    const bad = settlementQualityIndex({ fic_act_kyc_status: 'flagged' });
    expect(bad).toBeLessThan(good);
  });

  it('high latency penalises score', () => {
    const good = settlementQualityIndex({ protocol_compliant: true, average_settlement_latency_ms: 0 });
    const bad = settlementQualityIndex({ protocol_compliant: true, average_settlement_latency_ms: 500 });
    expect(bad).toBeLessThan(good);
  });

  it('score is clamped to 0..130', () => {
    const score = settlementQualityIndex({
      settlement_messages_per_minute: 999999,
      successful_settlement_count_24h: 999999,
      failed_settlement_count_24h: 999999,
      failure_rate_pct: -10,
      average_settlement_latency_ms: -100,
      reconciliation_break_count: 999999,
      lcr_contribution_pct: 999,
      nsfr_contribution_pct: 999,
      excon_authorization_status: 'authorized',
      fic_act_kyc_status: 'clean',
      protocol_compliant: true,
      iso27001_controls_ok: true,
      pci_dss_segmentation_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(130);
  });
});

describe('W124 - connector health band composite', () => {
  it('credential_revoked -> critical', () => {
    expect(connectorHealthBand('credential_revoked', 100, false, 100, {}, 0, 'authorized')).toBe('critical');
  });

  it('disconnected -> critical', () => {
    expect(connectorHealthBand('disconnected', 100, false, 100, {}, 0, 'authorized')).toBe('critical');
  });

  it('archived -> green', () => {
    expect(connectorHealthBand('archived', 100, false, 100, {}, 0, 'authorized')).toBe('green');
  });

  it('slaBreached -> red', () => {
    expect(connectorHealthBand('live_settlement_active', 100, true, 100, {}, 0, 'authorized')).toBe('red');
  });

  it('expired ExCon when sarb_excon flag is set -> red', () => {
    expect(connectorHealthBand(
      'live_settlement_active', 100, false, 100,
      { sarb_excon_authorization_required: true }, 0, 'expired',
    )).toBe('red');
  });

  it('failure_rate_pct > 2 -> red', () => {
    expect(connectorHealthBand('live_settlement_active', 100, false, 100, {}, 3, 'authorized')).toBe('red');
  });

  it('key expiring within 14 days -> red', () => {
    expect(connectorHealthBand('live_settlement_active', 100, false, 10, {}, 0, 'authorized')).toBe('red');
  });

  it('failover_active -> amber', () => {
    expect(connectorHealthBand('failover_active', 100, false, 100, {}, 0, 'authorized')).toBe('amber');
  });

  it('suspended -> amber', () => {
    expect(connectorHealthBand('suspended', 100, false, 100, {}, 0, 'authorized')).toBe('amber');
  });

  it('settlement_quality < 60 -> red', () => {
    expect(connectorHealthBand('live_settlement_active', 55, false, 100, {}, 0, 'authorized')).toBe('red');
  });

  it('key expiring within 60 days -> amber', () => {
    expect(connectorHealthBand('live_settlement_active', 100, false, 40, {}, 0, 'authorized')).toBe('amber');
  });

  it('settlement_quality 60..89 -> amber', () => {
    expect(connectorHealthBand('live_settlement_active', 80, false, 100, {}, 0, 'authorized')).toBe('amber');
  });

  it('full-green case', () => {
    expect(connectorHealthBand('live_settlement_active', 100, false, 100, {}, 0, 'authorized')).toBe('green');
  });

  it('cycle_reconciled full-green', () => {
    expect(connectorHealthBand('cycle_reconciled', 95, false, 90, {}, 0.5, 'authorized')).toBe('green');
  });
});

describe('W124 - protocol taxonomy', () => {
  it('STRATE_SWIFT_PROTOCOLS contains the 8-protocol universe', () => {
    expect(STRATE_SWIFT_PROTOCOLS).toContain('iso_20022_xml');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('swift_mt');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('swift_mx');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('strate_proprietary');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('samos_rtgs');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('sadc_rtgs');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('eft_ach');
    expect(STRATE_SWIFT_PROTOCOLS).toContain('pcc_eb');
    expect(STRATE_SWIFT_PROTOCOLS.length).toBe(8);
  });

  it('isKnownStrateSwiftProtocol guards against typos', () => {
    expect(isKnownStrateSwiftProtocol('iso_20022_xml')).toBe(true);
    expect(isKnownStrateSwiftProtocol('swift_mt')).toBe(true);
    expect(isKnownStrateSwiftProtocol('swift')).toBe(false);
    expect(isKnownStrateSwiftProtocol(null)).toBe(false);
    expect(isKnownStrateSwiftProtocol('')).toBe(false);
  });
});

describe('W124 - BIC validator (ISO 9362)', () => {
  it('valid 8-char BIC passes (bank+country+location, no branch)', () => {
    expect(isValidBic('FIRNZAJJ')).toBe(true); // FNB Johannesburg
    expect(isValidBic('ABSAZAJJ')).toBe(true); // ABSA Johannesburg
    expect(isValidBic('CHASUS33')).toBe(true); // JPMorgan Chase NY
  });

  it('valid 11-char BIC passes (8 + 3 branch)', () => {
    expect(isValidBic('FIRNZAJJXXX')).toBe(true);
    expect(isValidBic('CHASUS33XXX')).toBe(true);
    expect(isValidBic('HSBCGB2LXXX')).toBe(true);
  });

  it('rejects lowercase / wrong length / non-alpha country', () => {
    expect(isValidBic('firnzajj')).toBe(false);
    expect(isValidBic('FIRN')).toBe(false);
    expect(isValidBic('FIRNZAJJXX')).toBe(false); // 10 chars
    expect(isValidBic('FIRNZ1JJ')).toBe(false); // country must be alpha (digit at pos 6)
    expect(isValidBic('1IRNZAJJ')).toBe(false); // bank must be alpha (digit at pos 1)
  });

  it('rejects empty / null / non-string', () => {
    expect(isValidBic('')).toBe(false);
    expect(isValidBic(null)).toBe(false);
    expect(isValidBic(undefined)).toBe(false);
  });
});

describe('W124 - mTLS fingerprint validation', () => {
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

  it('isAllowedPeerFingerprint trusts only enrolled peer roots', () => {
    // Enrolled SA-major seed root → trusted.
    expect(isAllowedPeerFingerprint('000000000000000000000000000000000000000000000000000000005774a001')).toBe(true);
    // Well-formed but un-enrolled fingerprints → rejected.
    expect(isAllowedPeerFingerprint('0'.repeat(64))).toBe(false);
    expect(isAllowedPeerFingerprint('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789')).toBe(false);
  });

  it('isAllowedPeerFingerprint rejects malformed inputs', () => {
    expect(isAllowedPeerFingerprint('')).toBe(false);
    expect(isAllowedPeerFingerprint('not-hex')).toBe(false);
    expect(isAllowedPeerFingerprint('a'.repeat(60))).toBe(false);
  });
});
