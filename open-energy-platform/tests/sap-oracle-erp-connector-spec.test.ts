// Wave 125 - SAP / Oracle ERP Connector spec battery.
//
// Covers: 12-state machine (forward path connector_proposed ->
// period_close_reconciled -> archived through 10 forward states + 4
// branches: suspend/resume/failover/disconnect/revoke_credential, HARD
// terminals: archived/disconnected/credential_revoked, SOFT pauses:
// suspended/failover_active), 16-action TRANSITIONS coverage, INVERTED
// SLA polarity anchored on connector_proposed (168/240/360/480/720h),
// tier derivation from (module_count, company_code_count,
// jurisdiction_count), FLOOR-AT-ENTERPRISE-WIDE on >=1 of 5 flags +
// FLOOR-AT-MULTI-COUNTRY on >=3 flags, effectiveTier with FLOOR
// lifting, heavy tier helpers, SIGNATURE SAP-ORACLE-ERP-CONNECTOR-
// REVOKE crossings (revoke_credential EVERY tier; activate_failover
// heavy only; disconnect EVERY tier WHEN sox_404 OR sars_efiling;
// reconcile_period_close multi_country only; sla_breached HEAVY only),
// party + event routing (4-step: finance_engineer/financial_controller/
// CFO/CEO), authority ladder, urgency band INVERTED (single_module
// tightest, sox_404 systemic short-circuit), daysToCredentialRenewal,
// daysToPeriodClose, 5-bridge architecture (W124/W3/W68/W21/W118; W118
// MANDATORY), control effectiveness 0-130, connector health band
// composite, ERP system taxonomy (10-system universe), mTLS fingerprint
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
  floorAtEnterpriseWide,
  floorAtMultiCountry,
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
  daysToPeriodClose,
  bridgesToW124SettlementConnector,
  bridgesToW3SettlementP6,
  bridgesToW68CounterpartyMargin,
  bridgesToW21Drawdown,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  connectorHealthBand,
  isKnownErpSystem,
  SAP_ORACLE_ERP_SYSTEMS,
  isValidMtlsFingerprint,
  isAllowedPeerFingerprint,
} from '../src/utils/sap-oracle-erp-connector-spec';

describe('W125 SAP/Oracle ERP connector - state machine forward path', () => {
  it('walks connector_proposed -> archived through all 10 forward states', () => {
    expect(nextStatus('connector_proposed', 'validate_erp_endpoint')).toBe('erp_endpoint_validated');
    expect(nextStatus('erp_endpoint_validated', 'map_company_code')).toBe('company_code_mapped');
    expect(nextStatus('company_code_mapped', 'bind_chart_of_accounts')).toBe('chart_of_accounts_bound');
    expect(nextStatus('chart_of_accounts_bound', 'load_schemas')).toBe('schemas_loaded');
    expect(nextStatus('schemas_loaded', 'establish_idoc_session')).toBe('idoc_session_established');
    expect(nextStatus('idoc_session_established', 'validate_test_postings')).toBe('test_postings_validated');
    expect(nextStatus('test_postings_validated', 'bind_reconciliation_period')).toBe('reconciliation_period_bound');
    expect(nextStatus('reconciliation_period_bound', 'activate_live_posting')).toBe('live_posting_active');
    expect(nextStatus('live_posting_active', 'reconcile_period_close')).toBe('period_close_reconciled');
    expect(nextStatus('period_close_reconciled', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('connector_proposed', 'map_company_code')).toBeNull();
    expect(nextStatus('erp_endpoint_validated', 'bind_chart_of_accounts')).toBeNull();
    expect(nextStatus('company_code_mapped', 'load_schemas')).toBeNull();
    expect(nextStatus('chart_of_accounts_bound', 'establish_idoc_session')).toBeNull();
    expect(nextStatus('schemas_loaded', 'validate_test_postings')).toBeNull();
    expect(nextStatus('idoc_session_established', 'bind_reconciliation_period')).toBeNull();
    expect(nextStatus('test_postings_validated', 'activate_live_posting')).toBeNull();
    expect(nextStatus('reconciliation_period_bound', 'reconcile_period_close')).toBeNull();
    expect(nextStatus('live_posting_active', 'archive')).toBeNull();
  });
});

describe('W125 - branch states (suspend / resume / failover / disconnect / revoke_credential)', () => {
  it('suspend can be entered from any active state from erp_endpoint_validated up', () => {
    expect(nextStatus('erp_endpoint_validated', 'suspend')).toBe('suspended');
    expect(nextStatus('schemas_loaded', 'suspend')).toBe('suspended');
    expect(nextStatus('idoc_session_established', 'suspend')).toBe('suspended');
    expect(nextStatus('live_posting_active', 'suspend')).toBe('suspended');
    expect(nextStatus('period_close_reconciled', 'suspend')).toBe('suspended');
  });

  it('suspend cannot be entered from connector_proposed', () => {
    expect(nextStatus('connector_proposed', 'suspend')).toBeNull();
  });

  it('resume returns to live_posting_active', () => {
    expect(nextStatus('suspended', 'resume')).toBe('live_posting_active');
  });

  it('activate_failover only from live_posting_active or period_close_reconciled', () => {
    expect(nextStatus('live_posting_active', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('period_close_reconciled', 'activate_failover')).toBe('failover_active');
    expect(nextStatus('reconciliation_period_bound', 'activate_failover')).toBeNull();
    expect(nextStatus('idoc_session_established', 'activate_failover')).toBeNull();
  });

  it('activate_live_posting can re-enter from failover_active or suspended', () => {
    expect(nextStatus('failover_active', 'activate_live_posting')).toBe('live_posting_active');
    expect(nextStatus('suspended', 'activate_live_posting')).toBe('live_posting_active');
  });

  it('disconnect from any non-terminal goes to disconnected', () => {
    expect(nextStatus('connector_proposed', 'disconnect')).toBe('disconnected');
    expect(nextStatus('erp_endpoint_validated', 'disconnect')).toBe('disconnected');
    expect(nextStatus('live_posting_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('period_close_reconciled', 'disconnect')).toBe('disconnected');
    expect(nextStatus('failover_active', 'disconnect')).toBe('disconnected');
    expect(nextStatus('suspended', 'disconnect')).toBe('disconnected');
  });

  it('revoke_credential from any non-terminal goes to credential_revoked', () => {
    expect(nextStatus('connector_proposed', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('live_posting_active', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('period_close_reconciled', 'revoke_credential')).toBe('credential_revoked');
    expect(nextStatus('suspended', 'revoke_credential')).toBe('credential_revoked');
  });

  it('reconcile_period_close re-enters period_close_reconciled from live_posting_active', () => {
    expect(nextStatus('live_posting_active', 'reconcile_period_close')).toBe('period_close_reconciled');
    expect(nextStatus('period_close_reconciled', 'reconcile_period_close')).toBe('period_close_reconciled');
  });
});

describe('W125 - HARD terminals block further transitions', () => {
  it('archived/disconnected/credential_revoked accept no further actions', () => {
    expect(nextStatus('archived', 'activate_live_posting')).toBeNull();
    expect(nextStatus('archived', 'suspend')).toBeNull();
    expect(nextStatus('disconnected', 'resume')).toBeNull();
    expect(nextStatus('disconnected', 'activate_live_posting')).toBeNull();
    expect(nextStatus('credential_revoked', 'map_company_code')).toBeNull();
    expect(nextStatus('credential_revoked', 'activate_live_posting')).toBeNull();
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
    expect(isTerminal('live_posting_active')).toBe(false);
    expect(isTerminal('period_close_reconciled')).toBe(false);
  });
});

describe('W125 - allowedActions surface', () => {
  it('connector_proposed surfaces validate_erp_endpoint + disconnect + revoke_credential, NOT suspend', () => {
    const acts = allowedActions('connector_proposed');
    expect(acts).toContain('validate_erp_endpoint');
    expect(acts).toContain('disconnect');
    expect(acts).toContain('revoke_credential');
    expect(acts).not.toContain('suspend');
    expect(acts).not.toContain('propose_connector'); // create-only
  });

  it('live_posting_active surfaces reconcile_period_close + activate_failover + suspend + revoke_credential', () => {
    const acts = allowedActions('live_posting_active');
    expect(acts).toContain('reconcile_period_close');
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

describe('W125 - 16-action TRANSITIONS coverage', () => {
  it('TRANSITIONS map contains all 16 actions', () => {
    const expected = [
      'propose_connector', 'validate_erp_endpoint', 'map_company_code',
      'bind_chart_of_accounts', 'load_schemas', 'establish_idoc_session',
      'validate_test_postings', 'bind_reconciliation_period',
      'activate_live_posting', 'reconcile_period_close',
      'archive', 'disconnect', 'suspend', 'resume',
      'revoke_credential', 'activate_failover',
    ];
    for (const a of expected) expect(TRANSITIONS).toHaveProperty(a);
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });
});

describe('W125 - INVERTED SLA polarity', () => {
  it('connector_proposed anchor: single 168 / multi_module 240 / enterprise 360 / group 480 / multi_country 720', () => {
    expect(SLA_HOURS['connector_proposed']['single_module']).toBe(168);
    expect(SLA_HOURS['connector_proposed']['multi_module']).toBe(240);
    expect(SLA_HOURS['connector_proposed']['enterprise_wide']).toBe(360);
    expect(SLA_HOURS['connector_proposed']['group_consolidation']).toBe(480);
    expect(SLA_HOURS['connector_proposed']['multi_country']).toBe(720);
  });

  it('multi_country always >= group_consolidation across non-terminal states', () => {
    const states = [
      'connector_proposed', 'erp_endpoint_validated', 'company_code_mapped',
      'chart_of_accounts_bound', 'schemas_loaded', 'idoc_session_established',
      'test_postings_validated', 'reconciliation_period_bound',
      'live_posting_active', 'period_close_reconciled', 'suspended',
      'failover_active',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['multi_country']).toBeGreaterThanOrEqual(SLA_HOURS[s]['group_consolidation']);
    }
  });

  it('group_consolidation always >= enterprise_wide across active states', () => {
    const states = [
      'connector_proposed', 'company_code_mapped', 'live_posting_active',
      'period_close_reconciled',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['group_consolidation']).toBeGreaterThanOrEqual(SLA_HOURS[s]['enterprise_wide']);
    }
  });

  it('enterprise_wide >= multi_module >= single_module across active states', () => {
    const states = [
      'connector_proposed', 'live_posting_active', 'period_close_reconciled',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s]['enterprise_wide']).toBeGreaterThanOrEqual(SLA_HOURS[s]['multi_module']);
      expect(SLA_HOURS[s]['multi_module']).toBeGreaterThanOrEqual(SLA_HOURS[s]['single_module']);
    }
  });

  it('HARD terminals have zero SLA for every tier', () => {
    for (const tier of ['single_module','multi_module','enterprise_wide','group_consolidation','multi_country'] as const) {
      expect(SLA_HOURS['archived'][tier]).toBe(0);
      expect(SLA_HOURS['disconnected'][tier]).toBe(0);
      expect(SLA_HOURS['credential_revoked'][tier]).toBe(0);
    }
  });

  it('failover_active is tighter than live_posting_active (faster DR cutover recovery)', () => {
    for (const tier of ['single_module','multi_module','enterprise_wide','group_consolidation','multi_country'] as const) {
      expect(SLA_HOURS['failover_active'][tier]).toBeLessThan(SLA_HOURS['live_posting_active'][tier]);
    }
  });

  it('slaWindowHours returns the expected matrix lookup', () => {
    expect(slaWindowHours('connector_proposed', 'multi_country')).toBe(720);
    expect(slaWindowHours('archived', 'single_module')).toBe(0);
  });

  it('slaDeadlineFor offsets correctly and returns null for terminal', () => {
    const t = new Date('2026-05-31T00:00:00Z');
    const d = slaDeadlineFor('connector_proposed', 'single_module', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(168 * 3600 * 1000);
    expect(slaDeadlineFor('archived', 'single_module', t)).toBeNull();
  });

  it('slaHoursRemaining computes the delta', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-31T00:00:00Z'); // 24h later
    expect(slaHoursRemaining('connector_proposed', 'single_module', enteredAt, now)).toBe(168 - 24);
  });

  it('slaHoursRemaining returns 0 when enteredAt is null', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(slaHoursRemaining('connector_proposed', 'single_module', null, now)).toBe(0);
  });
});

describe('W125 - tier derivation from scope (module_count, company_code_count, jurisdiction_count)', () => {
  it('null / zero / unset -> single_module', () => {
    expect(tierForScope({})).toBe('single_module');
    expect(tierForScope({ module_count: 0, company_code_count: 0, jurisdiction_count: 0 })).toBe('single_module');
    expect(tierForScope({ module_count: null, company_code_count: null, jurisdiction_count: null })).toBe('single_module');
    expect(tierForScope({ module_count: 1, company_code_count: 1, jurisdiction_count: 1 })).toBe('single_module');
  });

  it('2-4 modules with 1 CC + 1 jurisdiction -> multi_module', () => {
    expect(tierForScope({ module_count: 2, company_code_count: 1, jurisdiction_count: 1 })).toBe('multi_module');
    expect(tierForScope({ module_count: 4, company_code_count: 1, jurisdiction_count: 1 })).toBe('multi_module');
  });

  it('5+ modules -> enterprise_wide', () => {
    expect(tierForScope({ module_count: 5, company_code_count: 1, jurisdiction_count: 1 })).toBe('enterprise_wide');
    expect(tierForScope({ module_count: 12, company_code_count: 1, jurisdiction_count: 1 })).toBe('enterprise_wide');
  });

  it('2+ CCs -> group_consolidation', () => {
    expect(tierForScope({ module_count: 3, company_code_count: 2, jurisdiction_count: 1 })).toBe('group_consolidation');
    expect(tierForScope({ module_count: 8, company_code_count: 5, jurisdiction_count: 1 })).toBe('group_consolidation');
  });

  it('2+ jurisdictions -> multi_country (always wins)', () => {
    expect(tierForScope({ module_count: 1, company_code_count: 1, jurisdiction_count: 2 })).toBe('multi_country');
    expect(tierForScope({ module_count: 15, company_code_count: 8, jurisdiction_count: 5 })).toBe('multi_country');
  });
});

describe('W125 - FLOOR flag counting + thresholds', () => {
  it('countFloorFlags counts each truthy flag once', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ sox_404_in_scope: true })).toBe(1);
    expect(countFloorFlags({ sox_404_in_scope: true, ifrs_consolidation_required: true })).toBe(2);
    expect(countFloorFlags({
      sox_404_in_scope: true,
      ifrs_consolidation_required: true,
      cross_border_transfer_pricing: true,
    })).toBe(3);
    expect(countFloorFlags({
      sox_404_in_scope: true,
      ifrs_consolidation_required: true,
      cross_border_transfer_pricing: true,
      sars_efiling_critical_path: true,
      cipc_annual_filing_gate: true,
    })).toBe(5);
  });

  it('countFloorFlags treats 0/false/null as not-set', () => {
    expect(countFloorFlags({ sox_404_in_scope: false, ifrs_consolidation_required: 0 })).toBe(0);
    expect(countFloorFlags({ cross_border_transfer_pricing: null })).toBe(0);
  });

  it('floorAtEnterpriseWide triggers on >=1 flag', () => {
    expect(floorAtEnterpriseWide({})).toBe(false);
    expect(floorAtEnterpriseWide({ sox_404_in_scope: true })).toBe(true);
    expect(floorAtEnterpriseWide({ cipc_annual_filing_gate: true })).toBe(true);
  });

  it('floorAtMultiCountry triggers on >=3 flags', () => {
    expect(floorAtMultiCountry({ sox_404_in_scope: true })).toBe(false);
    expect(floorAtMultiCountry({
      sox_404_in_scope: true,
      ifrs_consolidation_required: true,
    })).toBe(false);
    expect(floorAtMultiCountry({
      sox_404_in_scope: true,
      ifrs_consolidation_required: true,
      cross_border_transfer_pricing: true,
    })).toBe(true);
    expect(floorAtMultiCountry({
      sox_404_in_scope: true,
      ifrs_consolidation_required: true,
      cross_border_transfer_pricing: true,
      sars_efiling_critical_path: true,
      cipc_annual_filing_gate: true,
    })).toBe(true);
  });
});

describe('W125 - effectiveTier with FLOOR lifting', () => {
  it('no flags -> raw tier preserved', () => {
    expect(effectiveTier('single_module', {})).toBe('single_module');
    expect(effectiveTier('multi_module', {})).toBe('multi_module');
    expect(effectiveTier('enterprise_wide', {})).toBe('enterprise_wide');
    expect(effectiveTier('group_consolidation', {})).toBe('group_consolidation');
    expect(effectiveTier('multi_country', {})).toBe('multi_country');
  });

  it('1 flag lifts single/multi_module to enterprise_wide', () => {
    expect(effectiveTier('single_module', { sox_404_in_scope: true })).toBe('enterprise_wide');
    expect(effectiveTier('multi_module', { sox_404_in_scope: true })).toBe('enterprise_wide');
  });

  it('1 flag does not demote already enterprise+ tiers', () => {
    expect(effectiveTier('enterprise_wide', { sox_404_in_scope: true })).toBe('enterprise_wide');
    expect(effectiveTier('group_consolidation', { sox_404_in_scope: true })).toBe('group_consolidation');
    expect(effectiveTier('multi_country', { sox_404_in_scope: true })).toBe('multi_country');
  });

  it('3+ flags lift any tier to multi_country', () => {
    const three = { sox_404_in_scope: true, ifrs_consolidation_required: true, cross_border_transfer_pricing: true };
    expect(effectiveTier('single_module', three)).toBe('multi_country');
    expect(effectiveTier('multi_module', three)).toBe('multi_country');
    expect(effectiveTier('enterprise_wide', three)).toBe('multi_country');
    expect(effectiveTier('group_consolidation', three)).toBe('multi_country');
  });
});

describe('W125 - heavy tier helpers', () => {
  it('isHeavyTier flags enterprise_wide + group_consolidation + multi_country', () => {
    expect(isHeavyTier('enterprise_wide')).toBe(true);
    expect(isHeavyTier('group_consolidation')).toBe(true);
    expect(isHeavyTier('multi_country')).toBe(true);
    expect(isHeavyTier('multi_module')).toBe(false);
    expect(isHeavyTier('single_module')).toBe(false);
  });

  it('isReportable flags enterprise_wide + group_consolidation + multi_country', () => {
    expect(isReportable('enterprise_wide')).toBe(true);
    expect(isReportable('group_consolidation')).toBe(true);
    expect(isReportable('multi_country')).toBe(true);
    expect(isReportable('multi_module')).toBe(false);
    expect(isReportable('single_module')).toBe(false);
  });
});

describe('W125 - SIGNATURE regulator crossings', () => {
  // SIGNATURE #1 - SAP-ORACLE-ERP-CONNECTOR-REVOKE: revoke_credential EVERY tier.
  it('SIGNATURE: revoke_credential crosses EVERY tier', () => {
    expect(crossesIntoRegulator('revoke_credential', 'single_module', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'multi_module', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'enterprise_wide', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'group_consolidation', {})).toBe(true);
    expect(crossesIntoRegulator('revoke_credential', 'multi_country', {})).toBe(true);
  });

  // SIGNATURE #2 - activate_failover: heavy tiers only.
  it('SIGNATURE: activate_failover crosses enterprise+group+multi_country only', () => {
    expect(crossesIntoRegulator('activate_failover', 'single_module', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'multi_module', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'enterprise_wide', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'group_consolidation', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'multi_country', {})).toBe(true);
  });

  // SIGNATURE #3 - disconnect: EVERY tier WHEN sox_404 OR sars_efiling.
  it('SIGNATURE: disconnect crosses EVERY tier WHEN sox_404_in_scope', () => {
    const flags = { flags: { sox_404_in_scope: true } };
    expect(crossesIntoRegulator('disconnect', 'single_module', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'multi_module', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'enterprise_wide', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'group_consolidation', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'multi_country', flags)).toBe(true);
  });

  it('SIGNATURE: disconnect crosses EVERY tier WHEN sars_efiling_critical_path', () => {
    const flags = { flags: { sars_efiling_critical_path: true } };
    expect(crossesIntoRegulator('disconnect', 'single_module', flags)).toBe(true);
    expect(crossesIntoRegulator('disconnect', 'multi_country', flags)).toBe(true);
  });

  it('disconnect does NOT cross when sox_404 and sars_efiling are absent', () => {
    expect(crossesIntoRegulator('disconnect', 'single_module', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'enterprise_wide', {})).toBe(false);
    expect(crossesIntoRegulator('disconnect', 'multi_country', {})).toBe(false);
  });

  // SIGNATURE #4 - reconcile_period_close: multi_country only.
  it('SIGNATURE: reconcile_period_close crosses multi_country only', () => {
    expect(crossesIntoRegulator('reconcile_period_close', 'single_module', {})).toBe(false);
    expect(crossesIntoRegulator('reconcile_period_close', 'multi_module', {})).toBe(false);
    expect(crossesIntoRegulator('reconcile_period_close', 'enterprise_wide', {})).toBe(false);
    expect(crossesIntoRegulator('reconcile_period_close', 'group_consolidation', {})).toBe(false);
    expect(crossesIntoRegulator('reconcile_period_close', 'multi_country', {})).toBe(true);
  });

  // SIGNATURE #5 - sla_breached: heavy tiers only.
  it('SIGNATURE: slaBreachCrossesIntoRegulator returns heavy tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('single_module')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('multi_module')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('enterprise_wide')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('group_consolidation')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('multi_country')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('archive', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('suspend', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('resume', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('validate_erp_endpoint', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('map_company_code', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('bind_chart_of_accounts', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('load_schemas', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('establish_idoc_session', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('validate_test_postings', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('bind_reconciliation_period', 'multi_country', {})).toBe(false);
    expect(crossesIntoRegulator('activate_live_posting', 'multi_country', {})).toBe(false);
  });
});

describe('W125 - party + event routing', () => {
  it('party split assigns finance_engineer / financial_controller / CFO / CEO correctly', () => {
    expect(partyForAction('propose_connector')).toBe('finance_engineer');
    expect(partyForAction('validate_erp_endpoint')).toBe('finance_engineer');
    expect(partyForAction('map_company_code')).toBe('finance_engineer');
    expect(partyForAction('bind_chart_of_accounts')).toBe('finance_engineer');
    expect(partyForAction('load_schemas')).toBe('finance_engineer');
    expect(partyForAction('establish_idoc_session')).toBe('finance_engineer');
    expect(partyForAction('validate_test_postings')).toBe('finance_engineer');
    expect(partyForAction('bind_reconciliation_period')).toBe('financial_controller');
    expect(partyForAction('suspend')).toBe('financial_controller');
    expect(partyForAction('resume')).toBe('financial_controller');
    expect(partyForAction('activate_failover')).toBe('financial_controller');
    expect(partyForAction('activate_live_posting')).toBe('CFO');
    expect(partyForAction('reconcile_period_close')).toBe('CFO');
    expect(partyForAction('disconnect')).toBe('CFO');
    expect(partyForAction('revoke_credential')).toBe('CFO');
    expect(partyForAction('archive')).toBe('CEO');
  });

  it('eventTypeFor returns the sap_oracle_erp_connector_* prefix event for every action', () => {
    expect(eventTypeFor('propose_connector')).toBe('sap_oracle_erp_connector_proposed');
    expect(eventTypeFor('validate_erp_endpoint')).toBe('sap_oracle_erp_connector_endpoint_validated');
    expect(eventTypeFor('map_company_code')).toBe('sap_oracle_erp_connector_company_code_mapped');
    expect(eventTypeFor('bind_chart_of_accounts')).toBe('sap_oracle_erp_connector_chart_of_accounts_bound');
    expect(eventTypeFor('load_schemas')).toBe('sap_oracle_erp_connector_schemas_loaded');
    expect(eventTypeFor('establish_idoc_session')).toBe('sap_oracle_erp_connector_idoc_session_established');
    expect(eventTypeFor('validate_test_postings')).toBe('sap_oracle_erp_connector_test_postings_validated');
    expect(eventTypeFor('bind_reconciliation_period')).toBe('sap_oracle_erp_connector_reconciliation_period_bound');
    expect(eventTypeFor('activate_live_posting')).toBe('sap_oracle_erp_connector_live_posting_active');
    expect(eventTypeFor('reconcile_period_close')).toBe('sap_oracle_erp_connector_period_close_reconciled');
    expect(eventTypeFor('archive')).toBe('sap_oracle_erp_connector_archived');
    expect(eventTypeFor('disconnect')).toBe('sap_oracle_erp_connector_disconnected');
    expect(eventTypeFor('suspend')).toBe('sap_oracle_erp_connector_suspended');
    expect(eventTypeFor('resume')).toBe('sap_oracle_erp_connector_resumed');
    expect(eventTypeFor('revoke_credential')).toBe('sap_oracle_erp_connector_credential_revoked');
    expect(eventTypeFor('activate_failover')).toBe('sap_oracle_erp_connector_failover_activated');
  });
});

describe('W125 - urgencyBand INVERTED polarity (multi_country loosest)', () => {
  it('sox_404 flag short-circuits to systemic urgency', () => {
    expect(urgencyBand('single_module', 999, { sox_404_in_scope: true })).toBe('systemic');
    expect(urgencyBand('multi_country', 999, { sox_404_in_scope: true })).toBe('systemic');
  });

  it('negative slaHoursLeft -> critical for any tier', () => {
    expect(urgencyBand('single_module', -1)).toBe('critical');
    expect(urgencyBand('multi_country', -1)).toBe('critical');
  });

  it('single_module has tightest thresholds', () => {
    expect(urgencyBand('single_module', 2)).toBe('critical');
    expect(urgencyBand('single_module', 8)).toBe('high');
    expect(urgencyBand('single_module', 20)).toBe('medium');
    expect(urgencyBand('single_module', 100)).toBe('low');
  });

  it('multi_country has loosest thresholds (INVERTED)', () => {
    expect(urgencyBand('multi_country', 12)).toBe('critical');
    expect(urgencyBand('multi_country', 50)).toBe('high');
    expect(urgencyBand('multi_country', 150)).toBe('medium');
    expect(urgencyBand('multi_country', 400)).toBe('low');
  });

  it('group_consolidation band ordering', () => {
    expect(urgencyBand('group_consolidation', 10)).toBe('critical');
    expect(urgencyBand('group_consolidation', 40)).toBe('high');
    expect(urgencyBand('group_consolidation', 100)).toBe('medium');
    expect(urgencyBand('group_consolidation', 300)).toBe('low');
  });

  it('enterprise_wide band ordering', () => {
    expect(urgencyBand('enterprise_wide', 6)).toBe('critical');
    expect(urgencyBand('enterprise_wide', 30)).toBe('high');
    expect(urgencyBand('enterprise_wide', 60)).toBe('medium');
    expect(urgencyBand('enterprise_wide', 200)).toBe('low');
  });

  it('multi_module band ordering', () => {
    expect(urgencyBand('multi_module', 4)).toBe('critical');
    expect(urgencyBand('multi_module', 16)).toBe('high');
    expect(urgencyBand('multi_module', 36)).toBe('medium');
    expect(urgencyBand('multi_module', 100)).toBe('low');
  });
});

describe('W125 - authority ladder', () => {
  it('multi_country -> CEO', () => {
    expect(authorityRequired('multi_country')).toBe('CEO');
  });

  it('group_consolidation -> CFO', () => {
    expect(authorityRequired('group_consolidation')).toBe('CFO');
  });

  it('enterprise_wide -> financial_controller', () => {
    expect(authorityRequired('enterprise_wide')).toBe('financial_controller');
  });

  it('multi_module -> finance_engineer', () => {
    expect(authorityRequired('multi_module')).toBe('finance_engineer');
  });

  it('single_module -> finance_engineer', () => {
    expect(authorityRequired('single_module')).toBe('finance_engineer');
  });
});

describe('W125 - daysToCredentialRenewal', () => {
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

describe('W125 - daysToPeriodClose', () => {
  it('null period end returns 9999', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToPeriodClose(null, now)).toBe(9999);
    expect(daysToPeriodClose(undefined, now)).toBe(9999);
  });

  it('future period end returns positive days', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    const days = daysToPeriodClose('2026-06-30T00:00:00Z', now); // ~30 days
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('past period end returns 0', () => {
    const now = new Date('2026-05-31T00:00:00Z');
    expect(daysToPeriodClose('2026-01-01T00:00:00Z', now)).toBe(0);
  });
});

describe('W125 - bridges (5-bridge architecture)', () => {
  it('W124 settlement connector bridge', () => {
    expect(bridgesToW124SettlementConnector('soec-w124-001')).toBe(true);
    expect(bridgesToW124SettlementConnector(null)).toBe(false);
    expect(bridgesToW124SettlementConnector('')).toBe(false);
  });

  it('W3 settlement P6 bridge', () => {
    expect(bridgesToW3SettlementP6('stl-001')).toBe(true);
    expect(bridgesToW3SettlementP6(null)).toBe(false);
  });

  it('W68 counterparty margin bridge', () => {
    expect(bridgesToW68CounterpartyMargin('ccm-001')).toBe(true);
    expect(bridgesToW68CounterpartyMargin(null)).toBe(false);
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

describe('W125 - control effectiveness 0-130 index', () => {
  it('empty input has no binary trust signals and finite floor score', () => {
    const s = controlEffectivenessIndex({});
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(130);
    // No binary signals -> below the trust threshold of ~45.
    expect(s).toBeLessThan(80);
  });

  it('all-max binary signals + perfect posting metrics returns ~130', () => {
    const score = controlEffectivenessIndex({
      posting_volume_per_hour: 1000,
      successful_posting_count_24h: 20000,
      failed_posting_count_24h: 0,
      failure_rate_pct: 0,
      average_posting_latency_ms: 0,
      reconciliation_break_count: 0,
      ifrs_15_revenue_contribution_pct: 25,
      ifrs_9_financial_instrument_contribution_pct: 18,
      sars_efiling_status: 'current',
      cipc_annual_filing_status: 'current',
      schemas_compliant: true,
      iso27001_controls_ok: true,
      soc1_type2_audit_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(125);
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

  it('overdue SARS e-filing penalises score vs current', () => {
    const good = controlEffectivenessIndex({ sars_efiling_status: 'current' });
    const bad = controlEffectivenessIndex({ sars_efiling_status: 'overdue' });
    expect(bad).toBeLessThan(good);
  });

  it('overdue CIPC annual filing penalises score vs current', () => {
    const good = controlEffectivenessIndex({ cipc_annual_filing_status: 'current' });
    const bad = controlEffectivenessIndex({ cipc_annual_filing_status: 'overdue' });
    expect(bad).toBeLessThan(good);
  });

  it('high latency penalises score', () => {
    const good = controlEffectivenessIndex({ schemas_compliant: true, average_posting_latency_ms: 0 });
    const bad = controlEffectivenessIndex({ schemas_compliant: true, average_posting_latency_ms: 500 });
    expect(bad).toBeLessThan(good);
  });

  it('score is clamped to 0..130', () => {
    const score = controlEffectivenessIndex({
      posting_volume_per_hour: 999999,
      successful_posting_count_24h: 999999,
      failed_posting_count_24h: 999999,
      failure_rate_pct: -10,
      average_posting_latency_ms: -100,
      reconciliation_break_count: 999999,
      ifrs_15_revenue_contribution_pct: 999,
      ifrs_9_financial_instrument_contribution_pct: 999,
      sars_efiling_status: 'current',
      cipc_annual_filing_status: 'current',
      schemas_compliant: true,
      iso27001_controls_ok: true,
      soc1_type2_audit_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(130);
  });
});

describe('W125 - connector health band composite', () => {
  it('credential_revoked -> critical', () => {
    expect(connectorHealthBand('credential_revoked', 100, false, 100, {}, 0, 'current')).toBe('critical');
  });

  it('disconnected -> critical', () => {
    expect(connectorHealthBand('disconnected', 100, false, 100, {}, 0, 'current')).toBe('critical');
  });

  it('archived -> green', () => {
    expect(connectorHealthBand('archived', 100, false, 100, {}, 0, 'current')).toBe('green');
  });

  it('slaBreached -> red', () => {
    expect(connectorHealthBand('live_posting_active', 100, true, 100, {}, 0, 'current')).toBe('red');
  });

  it('overdue SARS when sars_efiling_critical_path flag is set -> red', () => {
    expect(connectorHealthBand(
      'live_posting_active', 100, false, 100,
      { sars_efiling_critical_path: true }, 0, 'overdue',
    )).toBe('red');
  });

  it('failure_rate_pct > 2 -> red', () => {
    expect(connectorHealthBand('live_posting_active', 100, false, 100, {}, 3, 'current')).toBe('red');
  });

  it('credential expiring within 14 days -> red', () => {
    expect(connectorHealthBand('live_posting_active', 100, false, 10, {}, 0, 'current')).toBe('red');
  });

  it('failover_active -> amber', () => {
    expect(connectorHealthBand('failover_active', 100, false, 100, {}, 0, 'current')).toBe('amber');
  });

  it('suspended -> amber', () => {
    expect(connectorHealthBand('suspended', 100, false, 100, {}, 0, 'current')).toBe('amber');
  });

  it('control score < 60 -> red', () => {
    expect(connectorHealthBand('live_posting_active', 55, false, 100, {}, 0, 'current')).toBe('red');
  });

  it('credential expiring within 60 days -> amber', () => {
    expect(connectorHealthBand('live_posting_active', 100, false, 40, {}, 0, 'current')).toBe('amber');
  });

  it('control score 60..89 -> amber', () => {
    expect(connectorHealthBand('live_posting_active', 80, false, 100, {}, 0, 'current')).toBe('amber');
  });

  it('full-green case', () => {
    expect(connectorHealthBand('live_posting_active', 100, false, 100, {}, 0, 'current')).toBe('green');
  });

  it('period_close_reconciled full-green', () => {
    expect(connectorHealthBand('period_close_reconciled', 95, false, 90, {}, 0.5, 'current')).toBe('green');
  });
});

describe('W125 - ERP system taxonomy', () => {
  it('SAP_ORACLE_ERP_SYSTEMS contains the 10-system universe', () => {
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('sap_s4hana');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('sap_ecc');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('oracle_ebs');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('oracle_fusion');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('workday');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('sage_300');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('dynamics_365');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('netsuite');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('epicor');
    expect(SAP_ORACLE_ERP_SYSTEMS).toContain('ifs');
    expect(SAP_ORACLE_ERP_SYSTEMS.length).toBe(10);
  });

  it('isKnownErpSystem guards against typos', () => {
    expect(isKnownErpSystem('sap_s4hana')).toBe(true);
    expect(isKnownErpSystem('oracle_fusion')).toBe(true);
    expect(isKnownErpSystem('sap')).toBe(false);
    expect(isKnownErpSystem(null)).toBe(false);
    expect(isKnownErpSystem('')).toBe(false);
  });
});

describe('W125 - mTLS fingerprint validation', () => {
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
