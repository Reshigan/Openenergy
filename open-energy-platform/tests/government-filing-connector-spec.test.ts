// Wave 126 - CIPC/SARS/NERSA Government Filing APIs Connector spec battery.
//
// Covers: 12-state machine (forward path connector_proposed ->
// filing_acknowledged -> archived through 10 forward states + 4
// branches: suspend/resume/failover/disconnect/revoke_credential, HARD
// terminals: archived/disconnected/credential_revoked, SOFT pauses:
// suspended/failover_active), 16-action TRANSITIONS coverage, INVERTED
// SLA polarity anchored on connector_proposed (168/240/360/480/720h),
// tier derivation from (filing_count, jurisdiction_count,
// national_statutory), FLOOR-AT-MULTI-JURISDICTION on >=1 of 5 flags +
// FLOOR-AT-SYSTEMIC-CRITICAL on >=3 flags, effectiveTier with FLOOR
// lifting, heavy tier helpers, SIGNATURE GOVERNMENT-FILING-CONNECTOR-
// REVOKE crossings (revoke_credential EVERY tier; activate_failover
// heavy only; disconnect EVERY tier WHEN companies_act_lateness OR
// sars_admin_penalty; acknowledge_filing systemic_critical only;
// sla_breached HEAVY only), party + event routing (4-step:
// compliance_engineer / company_secretary / financial_director / CEO),
// authority ladder, urgency band INVERTED (single_filing tightest,
// companies_act_lateness / sars_admin_penalty short-circuit to systemic),
// daysToCredentialRenewal, daysToNextFilingDeadline, 5-bridge
// architecture (W125/W124/W74/W48/W118; W118 MANDATORY), control
// effectiveness 0-130 composite (CIPC + SARS + NERSA components),
// connector health band composite, filing-authority taxonomy (10-authority
// universe), filing-type taxonomy (10-type universe), mTLS fingerprint
// validator + peer allow-list.

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
  tierForScope,
  countFloorFlags,
  floorAtMultiJurisdiction,
  floorAtSystemicCritical,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  daysToCredentialRenewal,
  daysToNextFilingDeadline,
  bridgesToW125ErpConnector,
  bridgesToW124SettlementConnector,
  bridgesToW74NersaLevy,
  bridgesToW48CarbonTax,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  connectorHealthBand,
  isKnownFilingAuthority,
  GOVERNMENT_FILING_AUTHORITIES,
  isKnownFilingType,
  GOVERNMENT_FILING_TYPES,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
} from '../src/utils/government-filing-connector-spec';

describe('W126 government-filing connector - state machine forward path', () => {
  it('walks connector_proposed -> archived through all 10 forward states', () => {
    expect(nextStatus('connector_proposed', 'validate_filing_authority')).toBe('filing_authority_validated');
    expect(nextStatus('filing_authority_validated', 'bind_tax_registration')).toBe('tax_registration_bound');
    expect(nextStatus('tax_registration_bound', 'map_filing_template')).toBe('filing_template_mapped');
    expect(nextStatus('filing_template_mapped', 'load_schemas')).toBe('schemas_loaded');
    expect(nextStatus('schemas_loaded', 'establish_e_filing_session')).toBe('e_filing_session_established');
    expect(nextStatus('e_filing_session_established', 'validate_test_submission')).toBe('test_submission_validated');
    expect(nextStatus('test_submission_validated', 'bind_reconciliation_period')).toBe('reconciliation_period_bound');
    expect(nextStatus('reconciliation_period_bound', 'activate_live_filing')).toBe('live_filing_active');
    expect(nextStatus('live_filing_active', 'acknowledge_filing')).toBe('filing_acknowledged');
    expect(nextStatus('filing_acknowledged', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('connector_proposed', 'bind_tax_registration')).toBeNull();
    expect(nextStatus('filing_authority_validated', 'map_filing_template')).toBeNull();
    expect(nextStatus('tax_registration_bound', 'load_schemas')).toBeNull();
    expect(nextStatus('filing_template_mapped', 'establish_e_filing_session')).toBeNull();
    expect(nextStatus('schemas_loaded', 'validate_test_submission')).toBeNull();
    expect(nextStatus('e_filing_session_established', 'bind_reconciliation_period')).toBeNull();
    expect(nextStatus('test_submission_validated', 'activate_live_filing')).toBeNull();
    expect(nextStatus('reconciliation_period_bound', 'acknowledge_filing')).toBeNull();
    expect(nextStatus('live_filing_active', 'archive')).toBeNull();
  });
});

describe('W126 - branch states (suspend / resume / failover / disconnect / revoke_credential)', () => {
  it('suspend can be entered from any active state from filing_authority_validated up', () => {
    expect(nextStatus('filing_authority_validated', 'suspend')).toBe('suspended');
    expect(nextStatus('schemas_loaded', 'suspend')).toBe('suspended');
    expect(nextStatus('e_filing_session_established', 'suspend')).toBe('suspended');
    expect(nextStatus('live_filing_active', 'suspend')).toBe('suspended');
    expect(nextStatus('filing_acknowledged', 'suspend')).toBe('suspended');
  });

  it('suspend cannot be entered from connector_proposed', () => {
    expect(nextStatus('connector_proposed', 'suspend')).toBeNull();
  });

  it('resume returns to live_filing_active', () => {
    expect(nextStatus('suspended', 'resume')).toBe('live_filing_active');
  });

  it('activate_failover only from live_filing_active or filing_acknowledged', () => {
    expect(nextStatus('live_filing_active', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('filing_acknowledged', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('reconciliation_period_bound', 'activate_failover')).toBeNull();
    expect(nextStatus('e_filing_session_established', 'activate_failover')).toBeNull();
  });

  it('activate_live_filing can re-enter from failover_active or suspended', () => {
    expect(nextStatus('failover_active', 'activate_live_filing')).toBe('live_filing_active');
    expect(nextStatus('suspended', 'activate_live_filing')).toBe('live_filing_active');
  });

  it('disconnect from any non-terminal goes to disconnected', () => {
    expect(nextStatus('connector_proposed', 'disconnect')).toBe('disconnected');
    expect(nextStatus('filing_authority_validated', 'disconnect')).toBe('disconnected');
    expect(nextStatus('live_filing_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('filing_acknowledged', 'disconnect')).toBe('disconnected');
    expect(nextStatus('failover_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('suspended', 'disconnect')).toBe('disconnected');
  });

  it('revoke_credential from any non-terminal goes to credential_revoked', () => {
    expect(nextStatus('connector_proposed', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('live_filing_active', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('filing_acknowledged', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('suspended', 'revoke_credential')).toBe('credential_revoked');
  });

  it('acknowledge_filing re-enters filing_acknowledged from live_filing_active', () => {
    expect(nextStatus('live_filing_active', 'acknowledge_filing')).toBe('filing_acknowledged');
    expect(nextStatus('filing_acknowledged', 'acknowledge_filing')).toBe('filing_acknowledged');
  });
});

describe('W126 - HARD terminals block further transitions', () => {
  it('archived/disconnected/credential_revoked accept no further actions', () => {
    expect(nextStatus('archived', 'activate_live_filing')).toBeNull();
    expect(nextStatus('archived', 'suspend')).toBeNull();
    expect(nextStatus('disconnected', 'resume')).toBeNull();
    expect(nextStatus('disconnected', 'activate_live_filing')).toBeNull();
    expect(nextStatus('credential_revoked', 'bind_tax_registration')).toBeNull();
    expect(nextStatus('credential_revoked', 'activate_live_filing')).toBeNull();
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
    expect(isTerminal('live_filing_active')).toBe(false);
    expect(isTerminal('filing_acknowledged')).toBe(false);
  });
});

describe('W126 - allowedActions surface', () => {
  it('connector_proposed surfaces validate_filing_authority + disconnect + revoke_credential, NOT suspend', () => {
    const acts = allowedActions('connector_proposed');
    expect(acts).toContain('validate_filing_authority');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke_credential');
    expect(acts).not.toContain('suspend');
    expect(acts).not.toContain('propose_connector'); // create-only
  });

  it('live_filing_active surfaces acknowledge_filing + activate_failover + suspend + revoke_credential', () => {
    const acts = allowedActions('live_filing_active');
    expect(acts).toContain('acknowledge_filing');
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

describe('W126 - 16-action TRANSITIONS coverage', () => {
  it('TRANSITIONS map contains all 16 actions', () => {
    const expected = [
      'propose_connector', 'validate_filing_authority', 'bind_tax_registration',
      'map_filing_template', 'load_schemas', 'establish_e_filing_session',
      'validate_test_submission', 'bind_reconciliation_period',
      'activate_live_filing', 'acknowledge_filing',
      'archive', 'disconnect', 'suspend', 'resume',
      'revoke_credential', 'activate_failover',
    ];
    for (const a of expected) expect(TRANSITIONS).toHaveProperty(a);
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });
});

describe('W126 - INVERTED SLA polarity', () => {
  it('connector_proposed anchor: single 168 / quarterly 240 / annual 360 / multi 480 / systemic 720', () => {
    expect(SLA_HOURS['connector_proposed']['single_filing']).toBe(168);
    expect(SLA_HOURS['connector_proposed']['quarterly_returns']).toBe(240);
    expect(SLA_HOURS['connector_proposed']['annual_returns']).toBe(360);
    expect(SLA_HOURS['connector_proposed']['multi_jurisdiction']).toBe(480);
    expect(SLA_HOURS['connector_proposed']['systemic_critical']).toBe(720);
  });

  it('systemic_critical always >= multi_jurisdiction across non-terminal states', () => {
    const states = [
      'connector_proposed', 'filing_authority_validated', 'tax_registration_bound',
      'filing_template_mapped', 'schemas_loaded', 'e_filing_session_established',
      'test_submission_validated', 'reconciliation_period_bound',
      'live_filing_active', 'filing_acknowledged', 'suspended',
      'failover_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['systemic_critical']).toBeGreaterThanOrEqual(SLA_HOURS[s]['multi_jurisdiction']);
    }
  });

  it('multi_jurisdiction always >= annual_returns across active states', () => {
    const states = [
      'connector_proposed', 'tax_registration_bound', 'live_filing_active',
      'filing_acknowledged',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['multi_jurisdiction']).toBeGreaterThanOrEqual(SLA_HOURS[s]['annual_returns']);
    }
  });

  it('annual_returns >= quarterly_returns >= single_filing across active states', () => {
    const states = [
      'connector_proposed', 'live_filing_active', 'filing_acknowledged',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['annual_returns']).toBeGreaterThanOrEqual(SLA_HOURS[s]['quarterly_returns']);
      expect(SLA_HOURS[s]['quarterly_returns']).toBeGreaterThanOrEqual(SLA_HOURS[s]['single_filing']);
    }
  });

  it('HARD terminals have zero SLA for every tier', () => {
    for (const tier of ['single_filing','quarterly_returns','annual_returns','multi_jurisdiction','systemic_critical'] as const) {
      expect(SLA_HOURS['archived'][tier]).toBe(0);
      expect(SLA_HOURS['disconnected'][tier]).toBe(0);
      expect(SLA_HOURS['credential_revoked'][tier]).toBe(0);
    }
  });

  it('failover_active is tighter than live_filing_active (faster DR cutover recovery)', () => {
    for (const tier of ['single_filing','quarterly_returns','annual_returns','multi_jurisdiction','systemic_critical'] as const) {
      expect(SLA_HOURS['failover_active'][tier]).toBeLessThan(SLA_HOURS['live_filing_active'][tier]);
    }
  });

  it('slaWindowHours returns the expected matrix lookup', () => {
    expect(slaWindowHours('connector_proposed', 'systemic_critical')).toBe(720);
    expect(slaWindowHours('archived', 'single_filing')).toBe(0);
  });

  it('slaDeadlineFor offsets correctly and returns null for terminal', () => {
    const t = new Date('2026-05-31T00:00:00Z');
    const d = slaDeadlineFor('connector_proposed', 'single_filing', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(168 * 3600 * 1000);
    expect(slaDeadlineFor('archived', 'single_filing', t)).toBeNull();
  });

  it('slaHoursRemaining computes the delta', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-31T00:00:00Z'); // 24h later
    expect(slaHoursRemaining('connector_proposed', 'single_filing', enteredAt, now)).toBe(168 - 24);
  });

  it('slaHoursRemaining returns 0 when enteredAt is null', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(slaHoursRemaining('connector_proposed', 'single_filing', null, now)).toBe(0);
  });
});

describe('W126 - tier derivation from scope (filing_count, jurisdiction_count, national_statutory)', () => {
  it('null / zero / unset -> single_filing', () => {
    expect(tierForScope({})).toBe('single_filing');
    expect(tierForScope({ filing_count: 0, jurisdiction_count: 0 })).toBe('single_filing');
    expect(tierForScope({ filing_count: null, jurisdiction_count: null })).toBe('single_filing');
    expect(tierForScope({ filing_count: 1, jurisdiction_count: 1 })).toBe('single_filing');
  });

  it('2-4 filings with 1 jurisdiction -> quarterly_returns', () => {
    expect(tierForScope({ filing_count: 2, jurisdiction_count: 1 })).toBe('quarterly_returns');
    expect(tierForScope({ filing_count: 4, jurisdiction_count: 1 })).toBe('quarterly_returns');
  });

  it('5+ filings with 1 jurisdiction -> annual_returns', () => {
    expect(tierForScope({ filing_count: 5, jurisdiction_count: 1 })).toBe('annual_returns');
    expect(tierForScope({ filing_count: 12, jurisdiction_count: 1 })).toBe('annual_returns');
  });

  it('2 jurisdictions -> multi_jurisdiction', () => {
    expect(tierForScope({ filing_count: 1, jurisdiction_count: 2 })).toBe('multi_jurisdiction');
    expect(tierForScope({ filing_count: 8, jurisdiction_count: 2 })).toBe('multi_jurisdiction');
  });

  it('3+ jurisdictions -> systemic_critical', () => {
    expect(tierForScope({ filing_count: 1, jurisdiction_count: 3 })).toBe('systemic_critical');
    expect(tierForScope({ filing_count: 15, jurisdiction_count: 5 })).toBe('systemic_critical');
  });

  it('national_statutory short-circuits to systemic_critical', () => {
    expect(tierForScope({ filing_count: 1, jurisdiction_count: 1, national_statutory: true })).toBe('systemic_critical');
    expect(tierForScope({ filing_count: 0, jurisdiction_count: 0, national_statutory: true })).toBe('systemic_critical');
  });
});

describe('W126 - FLOOR flag counting + thresholds', () => {
  it('countFloorFlags counts each truthy flag once', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ companies_act_lateness_penalty_active: true })).toBe(1);
    expect(countFloorFlags({
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
    })).toBe(2);
    expect(countFloorFlags({
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
      nersa_levy_arrears: true,
    })).toBe(3);
    expect(countFloorFlags({
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
      nersa_levy_arrears: true,
      dffe_ghg_threshold_exceeded: true,
      paia_subject_access_request_open: true,
    })).toBe(5);
  });

  it('countFloorFlags treats 0/false/null as not-set', () => {
    expect(countFloorFlags({ companies_act_lateness_penalty_active: false, sars_admin_penalty_active: 0 })).toBe(0);
    expect(countFloorFlags({ nersa_levy_arrears: null })).toBe(0);
  });

  it('floorAtMultiJurisdiction triggers on >=1 flag', () => {
    expect(floorAtMultiJurisdiction({})).toBe(false);
    expect(floorAtMultiJurisdiction({ companies_act_lateness_penalty_active: true })).toBe(true);
    expect(floorAtMultiJurisdiction({ paia_subject_access_request_open: true })).toBe(true);
  });

  it('floorAtSystemicCritical triggers on >=3 flags', () => {
    expect(floorAtSystemicCritical({ companies_act_lateness_penalty_active: true })).toBe(false);
    expect(floorAtSystemicCritical({
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
    })).toBe(false);
    expect(floorAtSystemicCritical({
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
      nersa_levy_arrears: true,
    })).toBe(true);
    expect(floorAtSystemicCritical({
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
      nersa_levy_arrears: true,
      dffe_ghg_threshold_exceeded: true,
      paia_subject_access_request_open: true,
    })).toBe(true);
  });
});

describe('W126 - effectiveTier with FLOOR lifting', () => {
  it('no flags -> raw tier preserved', () => {
    expect(effectiveTier('single_filing', {})).toBe('single_filing');
    expect(effectiveTier('quarterly_returns', {})).toBe('quarterly_returns');
    expect(effectiveTier('annual_returns', {})).toBe('annual_returns');
    expect(effectiveTier('multi_jurisdiction', {})).toBe('multi_jurisdiction');
    expect(effectiveTier('systemic_critical', {})).toBe('systemic_critical');
  });

  it('1 flag lifts single/quarterly/annual to multi_jurisdiction', () => {
    expect(effectiveTier('single_filing', { companies_act_lateness_penalty_active: true })).toBe('multi_jurisdiction');
    expect(effectiveTier('quarterly_returns', { companies_act_lateness_penalty_active: true })).toBe('multi_jurisdiction');
    expect(effectiveTier('annual_returns', { companies_act_lateness_penalty_active: true })).toBe('multi_jurisdiction');
  });

  it('1 flag does not demote already multi_jurisdiction+ tiers', () => {
    expect(effectiveTier('multi_jurisdiction', { companies_act_lateness_penalty_active: true })).toBe('multi_jurisdiction');
    expect(effectiveTier('systemic_critical', { companies_act_lateness_penalty_active: true })).toBe('systemic_critical');
  });

  it('3+ flags lift any tier to systemic_critical', () => {
    const three = {
      companies_act_lateness_penalty_active: true,
      sars_admin_penalty_active: true,
      nersa_levy_arrears: true,
    };
    expect(effectiveTier('single_filing', three)).toBe('systemic_critical');
    expect(effectiveTier('quarterly_returns', three)).toBe('systemic_critical');
    expect(effectiveTier('annual_returns', three)).toBe('systemic_critical');
    expect(effectiveTier('multi_jurisdiction', three)).toBe('systemic_critical');
  });
});

describe('W126 - heavy tier helpers', () => {
  it('isHeavyTier flags multi_jurisdiction + systemic_critical', () => {
    expect(isHeavyTier('multi_jurisdiction')).toBe(true);
    expect(isHeavyTier('systemic_critical')).toBe(true);
    expect(isHeavyTier('annual_returns')).toBe(false);
    expect(isHeavyTier('quarterly_returns')).toBe(false);
    expect(isHeavyTier('single_filing')).toBe(false);
  });

  it('isReportable flags multi_jurisdiction + systemic_critical', () => {
    expect(isReportable('multi_jurisdiction')).toBe(true);
    expect(isReportable('systemic_critical')).toBe(true);
    expect(isReportable('annual_returns')).toBe(false);
    expect(isReportable('quarterly_returns')).toBe(false);
    expect(isReportable('single_filing')).toBe(false);
  });
});

describe('W126 - SIGNATURE regulator crossings', () => {
  // SIGNATURE #1 - GOVERNMENT-FILING-CONNECTOR-REVOKE: revoke_credential EVERY tier.
  it('SIGNATURE: revoke_credential crosses EVERY tier', () => {
    expect(crossesIntoRegulator('revoke_credential', 'single_filing', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'quarterly_returns', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'annual_returns', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'multi_jurisdiction', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'systemic_critical', {})).toBe(true);
  });

  // SIGNATURE #2 - activate_failover: heavy tiers only.
  it('SIGNATURE: activate_failover crosses multi_jurisdiction + systemic_critical only', () => {
    expect(crossesIntoRegulator('activate_failover', 'single_filing', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'quarterly_returns', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'annual_returns', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'multi_jurisdiction', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'systemic_critical', {})).toBe(true);
  });

  // SIGNATURE #3 - disconnect: EVERY tier WHEN companies_act_lateness OR sars_admin_penalty.
  it('SIGNATURE: disconnect crosses EVERY tier WHEN companies_act_lateness_penalty_active', () => {
    const flags = { flags: { companies_act_lateness_penalty_active: true } };
    expect(crossesIntoRegulator('disconnect', 'single_filing', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'quarterly_returns', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'annual_returns', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'multi_jurisdiction', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'systemic_critical', flags)).toBe(true);
  });

  it('SIGNATURE: disconnect crosses EVERY tier WHEN sars_admin_penalty_active', () => {
    const flags = { flags: { sars_admin_penalty_active: true } };
    expect(crossesIntoRegulator('disconnect', 'single_filing', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'systemic_critical', flags)).toBe(true);
  });

  it('disconnect does NOT cross when companies_act_lateness and sars_admin_penalty are absent', () => {
    expect(crossesIntoRegulator('disconnect', 'single_filing', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'annual_returns', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'systemic_critical', {})).toBe(false);
  });

  // SIGNATURE #4 - acknowledge_filing: systemic_critical only.
  it('SIGNATURE: acknowledge_filing crosses systemic_critical only', () => {
    expect(crossesIntoRegulator('acknowledge_filing', 'single_filing', {})).toBe(false);
    expect(crossesIntoRegulator('acknowledge_filing', 'quarterly_returns', {})).toBe(false);
    expect(crossesIntoRegulator('acknowledge_filing', 'annual_returns', {})).toBe(false);
    expect(crossesIntoRegulator('acknowledge_filing', 'multi_jurisdiction', {})).toBe(false);
    expect(crossesIntoRegulator('acknowledge_filing', 'systemic_critical', {})).toBe(true);
  });

  // SIGNATURE #5 - sla_breached: heavy tiers only.
  it('SIGNATURE: slaBreachCrossesIntoRegulator returns heavy tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('single_filing')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('quarterly_returns')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('annual_returns')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('multi_jurisdiction')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic_critical')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('archive', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('suspend', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('resume', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('validate_filing_authority', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('bind_tax_registration', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('map_filing_template', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('load_schemas', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('establish_e_filing_session', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('validate_test_submission', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('bind_reconciliation_period', 'systemic_critical', {})).toBe(false);
    expect(crossesIntoRegulator('activate_live_filing', 'systemic_critical', {})).toBe(false);
  });
});

describe('W126 - party + event routing', () => {
  it('party split assigns compliance_engineer / company_secretary / financial_director / CEO correctly', () => {
    expect(partyForAction('propose_connector')).toBe('compliance_engineer');
    expect(partyForAction('validate_filing_authority')).toBe('compliance_engineer');
    expect(partyForAction('bind_tax_registration')).toBe('compliance_engineer');
    expect(partyForAction('map_filing_template')).toBe('compliance_engineer');
    expect(partyForAction('load_schemas')).toBe('compliance_engineer');
    expect(partyForAction('establish_e_filing_session')).toBe('compliance_engineer');
    expect(partyForAction('validate_test_submission')).toBe('compliance_engineer');
    expect(partyForAction('bind_reconciliation_period')).toBe('company_secretary');
    expect(partyForAction('suspend')).toBe('company_secretary');
    expect(partyForAction('resume')).toBe('company_secretary');
    expect(partyForAction('activate_failover')).toBe('company_secretary');
    expect(partyForAction('activate_live_filing')).toBe('financial_director');
    expect(partyForAction('acknowledge_filing')).toBe('financial_director');
    expect(partyForAction('disconnect')).toBe('financial_director');
    expect(partyForAction('revoke_credential')).toBe('financial_director');
    expect(partyForAction('archive')).toBe('CEO');
  });

  it('eventTypeFor returns the government_filing_connector_* prefix event for every action', () => {
    expect(eventTypeFor('propose_connector')).toBe('government_filing_connector_proposed');
    expect(eventTypeFor('validate_filing_authority')).toBe('government_filing_connector_authority_validated');
    expect(eventTypeFor('bind_tax_registration')).toBe('government_filing_connector_tax_registration_bound');
    expect(eventTypeFor('map_filing_template')).toBe('government_filing_connector_template_mapped');
    expect(eventTypeFor('load_schemas')).toBe('government_filing_connector_schemas_loaded');
    expect(eventTypeFor('establish_e_filing_session')).toBe('government_filing_connector_e_filing_session_established');
    expect(eventTypeFor('validate_test_submission')).toBe('government_filing_connector_test_submission_validated');
    expect(eventTypeFor('bind_reconciliation_period')).toBe('government_filing_connector_reconciliation_period_bound');
    expect(eventTypeFor('activate_live_filing')).toBe('government_filing_connector_live_filing_active');
    expect(eventTypeFor('acknowledge_filing')).toBe('government_filing_connector_filing_acknowledged');
    expect(eventTypeFor('archive')).toBe('government_filing_connector_archived');
    expect(eventTypeFor('disconnect')).toBe('government_filing_connector_disconnected');
    expect(eventTypeFor('suspend')).toBe('government_filing_connector_suspended');
    expect(eventTypeFor('resume')).toBe('government_filing_connector_resumed');
    expect(eventTypeFor('revoke_credential')).toBe('government_filing_connector_credential_revoked');
    expect(eventTypeFor('activate_failover')).toBe('government_filing_connector_failover_activated');
  });
});

describe('W126 - urgencyBand INVERTED polarity (systemic_critical loosest)', () => {
  it('companies_act_lateness_penalty_active short-circuits to systemic urgency', () => {
    expect(urgencyBand('single_filing', 999, { companies_act_lateness_penalty_active: true })).toBe('systemic');
    expect(urgencyBand('systemic_critical', 999, { companies_act_lateness_penalty_active: true })).toBe('systemic');
  });

  it('sars_admin_penalty_active short-circuits to systemic urgency', () => {
    expect(urgencyBand('single_filing', 999, { sars_admin_penalty_active: true })).toBe('systemic');
    expect(urgencyBand('systemic_critical', 999, { sars_admin_penalty_active: true })).toBe('systemic');
  });

  it('negative slaHoursLeft -> critical for any tier', () => {
    expect(urgencyBand('single_filing', -1)).toBe('critical');
    expect(urgencyBand('systemic_critical', -1)).toBe('critical');
  });

  it('single_filing has tightest thresholds', () => {
    expect(urgencyBand('single_filing', 2)).toBe('critical');
    expect(urgencyBand('single_filing', 8)).toBe('high');
    expect(urgencyBand('single_filing', 20)).toBe('medium');
    expect(urgencyBand('single_filing', 100)).toBe('low');
  });

  it('systemic_critical has loosest thresholds (INVERTED)', () => {
    expect(urgencyBand('systemic_critical', 12)).toBe('critical');
    expect(urgencyBand('systemic_critical', 50)).toBe('high');
    expect(urgencyBand('systemic_critical', 150)).toBe('medium');
    expect(urgencyBand('systemic_critical', 400)).toBe('low');
  });

  it('multi_jurisdiction band ordering', () => {
    expect(urgencyBand('multi_jurisdiction', 10)).toBe('critical');
    expect(urgencyBand('multi_jurisdiction', 40)).toBe('high');
    expect(urgencyBand('multi_jurisdiction', 100)).toBe('medium');
    expect(urgencyBand('multi_jurisdiction', 300)).toBe('low');
  });

  it('annual_returns band ordering', () => {
    expect(urgencyBand('annual_returns', 6)).toBe('critical');
    expect(urgencyBand('annual_returns', 30)).toBe('high');
    expect(urgencyBand('annual_returns', 60)).toBe('medium');
    expect(urgencyBand('annual_returns', 200)).toBe('low');
  });

  it('quarterly_returns band ordering', () => {
    expect(urgencyBand('quarterly_returns', 4)).toBe('critical');
    expect(urgencyBand('quarterly_returns', 16)).toBe('high');
    expect(urgencyBand('quarterly_returns', 36)).toBe('medium');
    expect(urgencyBand('quarterly_returns', 100)).toBe('low');
  });
});

describe('W126 - authority ladder', () => {
  it('systemic_critical -> CEO', () => {
    expect(authorityRequired('systemic_critical')).toBe('CEO');
  });

  it('multi_jurisdiction -> financial_director', () => {
    expect(authorityRequired('multi_jurisdiction')).toBe('financial_director');
  });

  it('annual_returns -> company_secretary', () => {
    expect(authorityRequired('annual_returns')).toBe('company_secretary');
  });

  it('quarterly_returns -> compliance_engineer', () => {
    expect(authorityRequired('quarterly_returns')).toBe('compliance_engineer');
  });

  it('single_filing -> compliance_engineer', () => {
    expect(authorityRequired('single_filing')).toBe('compliance_engineer');
  });
});

describe('W126 - daysToCredentialRenewal', () => {
  it('null credential returns 9999', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToCredentialRenewal(null, now)).toBe(9999);
    expect(daysToCredentialRenewal(undefined, now)).toBe(9999);
  });

  it('future credential returns positive days', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    const days = daysToCredentialRenewal('2026-08-29T00:00:00Z', now); // ~90 days
    expect(days).toBeGreaterThanOrEqual(89);
    expect(days).toBeLessThanOrEqual(91);
  });

  it('past credential returns 0', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToCredentialRenewal('2026-01-01T00:00:00Z', now)).toBe(0);
  });
});

describe('W126 - daysToNextFilingDeadline', () => {
  it('null deadline returns 9999', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToNextFilingDeadline(null, now)).toBe(9999);
    expect(daysToNextFilingDeadline(undefined, now)).toBe(9999);
  });

  it('future deadline returns positive days', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    const days = daysToNextFilingDeadline('2026-06-30T00:00:00Z', now); // ~30 days
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('past deadline returns 0', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToNextFilingDeadline('2026-01-01T00:00:00Z', now)).toBe(0);
  });
});

describe('W126 - bridges (5-bridge architecture)', () => {
  it('W125 ERP connector bridge', () => {
    expect(bridgesToW125ErpConnector('soec-w125-001')).toBe(true);
    expect(bridgesToW125ErpConnector(null)).toBe(false);
    expect(bridgesToW125ErpConnector('')).toBe(false);
  });

  it('W124 STRATE/SWIFT settlement connector bridge', () => {
    expect(bridgesToW124SettlementConnector('ssc-001')).toBe(true);
    expect(bridgesToW124SettlementConnector(null)).toBe(false);
  });

  it('W74 NERSA levy bridge', () => {
    expect(bridgesToW74NersaLevy('regulator-levy-2026-001')).toBe(true);
    expect(bridgesToW74NersaLevy(null)).toBe(false);
  });

  it('W48 carbon tax offset claim bridge', () => {
    expect(bridgesToW48CarbonTax('cot-2026-001')).toBe(true);
    expect(bridgesToW48CarbonTax(undefined)).toBe(false);
  });

  it('W118 audit chain bridge (MANDATORY)', () => {
    expect(bridgesToW118AuditChain('audit-block-12345')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W126 - control effectiveness 0-130 index', () => {
  it('empty input has no binary trust signals and finite floor score', () => {
    const s = controlEffectivenessIndex({});
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(130);
    // No binary signals -> below the trust threshold of ~45.
    expect(s).toBeLessThan(80);
  });

  it('all-max binary signals + perfect filing metrics returns a high trust score', () => {
    const score = controlEffectivenessIndex({
      filings_per_quarter: 60,
      successful_filing_count_quarter: 60,
      failed_filing_count_quarter: 0,
      failure_rate_pct: 0,
      average_filing_latency_ms: 0,
      reconciliation_break_count: 0,
      cipc_compliance_score: 130,
      sars_compliance_score: 130,
      nersa_compliance_score: 130,
      companies_act_filing_status: 'current',
      sars_tax_clearance_status: 'active',
      nersa_levy_status: 'current',
      dffe_ghg_threshold_status: 'under',
      schemas_compliant: true,
      iso27001_controls_ok: true,
      soc1_type2_audit_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(110);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('high failure_rate_pct penalises score', () => {
    const good = controlEffectivenessIndex({
      schemas_compliant: true, iso27001_controls_ok: true, soc1_type2_audit_ok: true,
      failure_rate_pct: 0,
    });
    const bad = controlEffectivenessIndex({
      schemas_compliant: true, iso27001_controls_ok: true, soc1_type2_audit_ok: true,
      failure_rate_pct: 5,
    });
    expect(bad).toBeLessThan(good);
  });

  it('overdue companies_act filing penalises score vs current', () => {
    const good = controlEffectivenessIndex({ companies_act_filing_status: 'current' });
    const bad = controlEffectivenessIndex({ companies_act_filing_status: 'overdue' });
    expect(bad).toBeLessThan(good);
  });

  it('revoked SARS tax clearance penalises score vs active', () => {
    const good = controlEffectivenessIndex({ sars_tax_clearance_status: 'active' });
    const bad = controlEffectivenessIndex({ sars_tax_clearance_status: 'pending' });
    expect(bad).toBeLessThan(good);
  });

  it('NERSA levy arrears penalises score vs current', () => {
    const good = controlEffectivenessIndex({ nersa_levy_status: 'current' });
    const bad = controlEffectivenessIndex({ nersa_levy_status: 'arrears' });
    expect(bad).toBeLessThan(good);
  });

  it('high latency penalises score', () => {
    const good = controlEffectivenessIndex({ schemas_compliant: true, average_filing_latency_ms: 0 });
    const bad = controlEffectivenessIndex({ schemas_compliant: true, average_filing_latency_ms: 500 });
    expect(bad).toBeLessThan(good);
  });

  it('score is clamped to 0..130', () => {
    const score = controlEffectivenessIndex({
      filings_per_quarter: 999999,
      successful_filing_count_quarter: 999999,
      failed_filing_count_quarter: 999999,
      failure_rate_pct: -10,
      average_filing_latency_ms: -100,
      reconciliation_break_count: 999999,
      cipc_compliance_score: 999,
      sars_compliance_score: 999,
      nersa_compliance_score: 999,
      companies_act_filing_status: 'current',
      sars_tax_clearance_status: 'active',
      nersa_levy_status: 'current',
      dffe_ghg_threshold_status: 'under',
      schemas_compliant: true,
      iso27001_controls_ok: true,
      soc1_type2_audit_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(130);
  });
});

describe('W126 - connector health band composite', () => {
  it('credential_revoked -> critical', () => {
    expect(connectorHealthBand('credential_revoked', 100, false, 100, {}, 0, 'current', 'active')).toBe('critical');
  });

  it('disconnected -> critical', () => {
    expect(connectorHealthBand('disconnected', 100, false, 100, {}, 0, 'current', 'active')).toBe('critical');
  });

  it('archived -> green', () => {
    expect(connectorHealthBand('archived', 100, false, 100, {}, 0, 'current', 'active')).toBe('green');
  });

  it('slaBreached -> red', () => {
    expect(connectorHealthBand('live_filing_active', 100, true, 100, {}, 0, 'current', 'active')).toBe('red');
  });

  it('overdue companies_act when companies_act_lateness_penalty_active flag is set -> red', () => {
    expect(connectorHealthBand(
      'live_filing_active', 100, false, 100,
      { companies_act_lateness_penalty_active: true }, 0, 'overdue', 'active',
    )).toBe('red');
  });

  it('revoked SARS tax clearance -> red', () => {
    expect(connectorHealthBand(
      'live_filing_active', 100, false, 100, {}, 0, 'current', 'revoked',
    )).toBe('red');
  });

  it('failure_rate_pct > 2 -> red', () => {
    expect(connectorHealthBand('live_filing_active', 100, false, 100, {}, 3, 'current', 'active')).toBe('red');
  });

  it('credential expiring within 14 days -> red', () => {
    expect(connectorHealthBand('live_filing_active', 100, false, 10, {}, 0, 'current', 'active')).toBe('red');
  });

  it('failover_active -> amber', () => {
    expect(connectorHealthBand('failover_active', 100, false, 100, {}, 0, 'current', 'active')).toBe('amber');
  });

  it('suspended -> amber', () => {
    expect(connectorHealthBand('suspended', 100, false, 100, {}, 0, 'current', 'active')).toBe('amber');
  });

  it('control score < 60 -> red', () => {
    expect(connectorHealthBand('live_filing_active', 55, false, 100, {}, 0, 'current', 'active')).toBe('red');
  });

  it('credential expiring within 60 days -> amber', () => {
    expect(connectorHealthBand('live_filing_active', 100, false, 40, {}, 0, 'current', 'active')).toBe('amber');
  });

  it('control score 60..89 -> amber', () => {
    expect(connectorHealthBand('live_filing_active', 80, false, 100, {}, 0, 'current', 'active')).toBe('amber');
  });

  it('full-green case', () => {
    expect(connectorHealthBand('live_filing_active', 100, false, 100, {}, 0, 'current', 'active')).toBe('green');
  });

  it('filing_acknowledged full-green', () => {
    expect(connectorHealthBand('filing_acknowledged', 95, false, 90, {}, 0.5, 'current', 'active')).toBe('green');
  });
});

describe('W126 - filing authority taxonomy', () => {
  it('GOVERNMENT_FILING_AUTHORITIES contains the 10-authority universe', () => {
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('cipc');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('sars');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('nersa');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('dmre');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('dffe');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('sarb');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('fic');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('fsca');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('treasury');
    expect(GOVERNMENT_FILING_AUTHORITIES).toContain('municipal');
    expect(GOVERNMENT_FILING_AUTHORITIES.length).toBe(10);
  });

  it('isKnownFilingAuthority guards against typos', () => {
    expect(isKnownFilingAuthority('cipc')).toBe(true);
    expect(isKnownFilingAuthority('sars')).toBe(true);
    expect(isKnownFilingAuthority('SARS')).toBe(false);
    expect(isKnownFilingAuthority('unknown')).toBe(false);
    expect(isKnownFilingAuthority(null)).toBe(false);
    expect(isKnownFilingAuthority('')).toBe(false);
  });
});

describe('W126 - filing type taxonomy', () => {
  it('GOVERNMENT_FILING_TYPES contains the 10-type universe', () => {
    expect(GOVERNMENT_FILING_TYPES).toContain('annual_return');
    expect(GOVERNMENT_FILING_TYPES).toContain('vat201');
    expect(GOVERNMENT_FILING_TYPES).toContain('emp201');
    expect(GOVERNMENT_FILING_TYPES).toContain('it14');
    expect(GOVERNMENT_FILING_TYPES).toContain('nersa_quarterly_electricity');
    expect(GOVERNMENT_FILING_TYPES).toContain('nersa_quarterly_gas');
    expect(GOVERNMENT_FILING_TYPES).toContain('dmre_quarterly_reippppp');
    expect(GOVERNMENT_FILING_TYPES).toContain('dffe_ghg');
    expect(GOVERNMENT_FILING_TYPES).toContain('carbon_tax');
    expect(GOVERNMENT_FILING_TYPES).toContain('paia_response');
    expect(GOVERNMENT_FILING_TYPES.length).toBe(10);
  });

  it('isKnownFilingType guards against typos', () => {
    expect(isKnownFilingType('it14')).toBe(true);
    expect(isKnownFilingType('vat201')).toBe(true);
    expect(isKnownFilingType('IT14')).toBe(false);
    expect(isKnownFilingType('unknown')).toBe(false);
    expect(isKnownFilingType(null)).toBe(false);
    expect(isKnownFilingType('')).toBe(false);
  });
});

describe('W126 - mTLS fingerprint validation', () => {
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
    // Enrolled CIPC seed root → trusted.
    expect(isAllowedPeerFingerprint('0000000000000000000000000000000000000000000000000000000090f00001')).toBe(true);
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
