import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isCancellable,
  slaDeadlineFor,
  SLA_MINUTES,
  isHighTier,
  tierRank,
  entitlementResponseSlaMinutes,
  isCoverageLive,
  isCoverageGap,
  isEventCovered,
  visitsRemaining,
  partsAllowanceRemainingZar,
  coverageUtilization,
  isEntitlementExhausted,
  daysToExpiry,
  isWithinRenewalWindow,
  renewalUpliftZar,
  proratedRefundZar,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  type ContractStatus,
  type ContractAction,
  type CoverageTier,
} from '../src/utils/service-contract-spec';

const TIERS: CoverageTier[] = ['basic', 'standard', 'premium', 'mission_critical'];
const ALL_ACTIONS: ContractAction[] = [
  'issue_quote', 'accept_quote', 'activate_coverage', 'open_renewal',
  'issue_renewal_quote', 'begin_negotiation', 'confirm_renewal', 'enter_grace',
  'suspend_coverage', 'reinstate_coverage', 'expire_coverage', 'cancel_contract',
];
const GRADED: ContractStatus[] = [
  'draft', 'quoted', 'pending_activation', 'active', 'renewal_due',
  'renewal_quoted', 'negotiating', 'in_grace', 'suspended',
];

describe('W80 service-contract — state machine', () => {
  it('defines exactly 12 statuses and 12 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(12);
    expect(new Set(ALL_ACTIONS).size).toBe(12);
  });

  it('walks the happy path draft → renewed', () => {
    expect(nextStatus('draft', 'issue_quote')).toBe('quoted');
    expect(nextStatus('quoted', 'accept_quote')).toBe('pending_activation');
    expect(nextStatus('pending_activation', 'activate_coverage')).toBe('active');
    expect(nextStatus('active', 'open_renewal')).toBe('renewal_due');
    expect(nextStatus('renewal_due', 'issue_renewal_quote')).toBe('renewal_quoted');
    expect(nextStatus('renewal_quoted', 'begin_negotiation')).toBe('negotiating');
    expect(nextStatus('negotiating', 'confirm_renewal')).toBe('renewed');
  });

  it('confirm_renewal closes from every renewal state and grace', () => {
    expect(nextStatus('renewal_due', 'confirm_renewal')).toBe('renewed');
    expect(nextStatus('renewal_quoted', 'confirm_renewal')).toBe('renewed');
    expect(nextStatus('negotiating', 'confirm_renewal')).toBe('renewed');
    expect(nextStatus('in_grace', 'confirm_renewal')).toBe('renewed');
  });

  it('grace + expiry: renewal states → in_grace → expired', () => {
    expect(nextStatus('renewal_due', 'enter_grace')).toBe('in_grace');
    expect(nextStatus('renewal_quoted', 'enter_grace')).toBe('in_grace');
    expect(nextStatus('negotiating', 'enter_grace')).toBe('in_grace');
    expect(nextStatus('in_grace', 'expire_coverage')).toBe('expired');
  });

  it('suspension cycle: active → suspended → active / expired / cancelled', () => {
    expect(nextStatus('active', 'suspend_coverage')).toBe('suspended');
    expect(nextStatus('suspended', 'reinstate_coverage')).toBe('active');
    expect(nextStatus('suspended', 'expire_coverage')).toBe('expired');
    expect(nextStatus('suspended', 'cancel_contract')).toBe('cancelled');
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('draft', 'confirm_renewal')).toBeNull();
    expect(nextStatus('active', 'expire_coverage')).toBeNull();
    expect(nextStatus('renewed', 'cancel_contract')).toBeNull();
  });

  it('marks renewed / expired / cancelled terminal with no actions', () => {
    for (const t of ['renewed', 'expired', 'cancelled'] as ContractStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toHaveLength(0);
    }
    expect(isTerminal('active')).toBe(false);
  });

  it('is cancellable from in-force / planning states but not grace or terminals', () => {
    expect(isCancellable('draft')).toBe(true);
    expect(isCancellable('active')).toBe(true);
    expect(isCancellable('suspended')).toBe(true);
    expect(isCancellable('in_grace')).toBe(false);
    expect(isCancellable('renewed')).toBe(false);
  });
});

describe('W80 service-contract — URGENT SLA', () => {
  it('windows strictly DECREASE basic → mission_critical at every graded state', () => {
    for (const s of GRADED) {
      const w = SLA_MINUTES[s];
      expect(w.basic).toBeGreaterThan(w.standard);
      expect(w.standard).toBeGreaterThan(w.premium);
      expect(w.premium).toBeGreaterThan(w.mission_critical);
      expect(w.mission_critical).toBeGreaterThan(0);
    }
  });

  it('terminal states carry a zero SLA and a null deadline', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    for (const t of ['renewed', 'expired', 'cancelled'] as ContractStatus[]) {
      for (const tier of TIERS) expect(SLA_MINUTES[t][tier]).toBe(0);
      expect(slaDeadlineFor(t, 'mission_critical', now)).toBeNull();
    }
  });

  it('computes the deadline as entry + window minutes', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const dl = slaDeadlineFor('in_grace', 'mission_critical', now);
    expect(dl).not.toBeNull();
    expect(dl!.getTime() - now.getTime()).toBe(480 * 60_000);
  });
});

describe('W80 service-contract — coverage tier', () => {
  it('classifies premium + mission_critical as HIGH', () => {
    expect(isHighTier('premium')).toBe(true);
    expect(isHighTier('mission_critical')).toBe(true);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('basic')).toBe(false);
  });

  it('ranks tiers in ascending order', () => {
    expect(tierRank('basic')).toBeLessThan(tierRank('standard'));
    expect(tierRank('standard')).toBeLessThan(tierRank('premium'));
    expect(tierRank('premium')).toBeLessThan(tierRank('mission_critical'));
  });

  it('entitlement response SLA tightens with the tier', () => {
    expect(entitlementResponseSlaMinutes('basic')).toBe(4320);
    expect(entitlementResponseSlaMinutes('standard')).toBe(1440);
    expect(entitlementResponseSlaMinutes('premium')).toBe(480);
    expect(entitlementResponseSlaMinutes('mission_critical')).toBe(240);
  });
});

describe('W80 service-contract — entitlement & coverage gate', () => {
  it('treats in-force / renewal / grace as live coverage; suspended / expired as a gap', () => {
    for (const s of ['active', 'renewal_due', 'renewal_quoted', 'negotiating', 'in_grace'] as ContractStatus[]) {
      expect(isCoverageLive(s)).toBe(true);
      expect(isCoverageGap(s)).toBe(false);
    }
    for (const s of ['suspended', 'expired'] as ContractStatus[]) {
      expect(isCoverageGap(s)).toBe(true);
      expect(isCoverageLive(s)).toBe(false);
    }
    expect(isCoverageLive('draft')).toBe(false);
  });

  it('covers an event only when live + fault covered + asset covered', () => {
    expect(isEventCovered({
      status: 'active', coveredFaultClasses: ['inverter', 'transformer'], faultClass: 'inverter',
      coveredAssets: ['ast_1'], assetId: 'ast_1',
    })).toBe(true);
    // Not live → no coverage.
    expect(isEventCovered({
      status: 'suspended', coveredFaultClasses: ['all'], faultClass: 'inverter', coveredAssets: ['all'],
    })).toBe(false);
    // Fault class not covered.
    expect(isEventCovered({
      status: 'active', coveredFaultClasses: ['inverter'], faultClass: 'transformer',
    })).toBe(false);
    // Asset not covered.
    expect(isEventCovered({
      status: 'active', coveredFaultClasses: ['all'], faultClass: 'inverter',
      coveredAssets: ['ast_1'], assetId: 'ast_99',
    })).toBe(false);
  });

  it('honours all / empty wildcards', () => {
    expect(isEventCovered({
      status: 'in_grace', coveredFaultClasses: ['all'], faultClass: 'anything', coveredAssets: [],
    })).toBe(true);
  });

  it('tracks entitlement consumption', () => {
    expect(visitsRemaining(4, 1)).toBe(3);
    expect(visitsRemaining(4, 6)).toBe(0);
    expect(partsAllowanceRemainingZar(500_000, 120_000)).toBe(380_000);
    expect(partsAllowanceRemainingZar(500_000, 600_000)).toBe(0);
    expect(coverageUtilization(3, 4)).toBeCloseTo(0.75);
    expect(coverageUtilization(9, 4)).toBe(1);
    expect(coverageUtilization(1, 0)).toBe(0);
    expect(isEntitlementExhausted(4, 4)).toBe(true);
    expect(isEntitlementExhausted(4, 2)).toBe(false);
    expect(isEntitlementExhausted(0, 5)).toBe(false);
  });
});

describe('W80 service-contract — renewal economics', () => {
  it('computes days to expiry and renewal-window membership', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(daysToExpiry(new Date('2026-07-01T00:00:00Z'), now)).toBe(30);
    expect(isWithinRenewalWindow(new Date('2026-07-15T00:00:00Z'), now, 90)).toBe(true);
    expect(isWithinRenewalWindow(new Date('2026-12-01T00:00:00Z'), now, 90)).toBe(false);
    // Already past term end → not in window.
    expect(isWithinRenewalWindow(new Date('2026-05-01T00:00:00Z'), now, 90)).toBe(false);
  });

  it('applies a CPI uplift and a pro-rated cancellation refund', () => {
    expect(renewalUpliftZar(1_000_000, 8)).toBe(1_080_000);
    expect(proratedRefundZar(1_200_000, 90, 360)).toBe(300_000);
    expect(proratedRefundZar(1_200_000, 0, 360)).toBe(0);
    expect(proratedRefundZar(1_200_000, 400, 360)).toBe(1_200_000);
  });
});

describe('W80 service-contract — reportability (COVERAGE-GAP signature)', () => {
  it('expire_coverage crosses for HIGH tiers only', () => {
    expect(crossesIntoRegulator('expire_coverage', 'mission_critical')).toBe(true);
    expect(crossesIntoRegulator('expire_coverage', 'premium')).toBe(true);
    expect(crossesIntoRegulator('expire_coverage', 'standard')).toBe(false);
    expect(crossesIntoRegulator('expire_coverage', 'basic')).toBe(false);
  });

  it('suspend_coverage + cancel_contract cross for mission_critical only', () => {
    expect(crossesIntoRegulator('suspend_coverage', 'mission_critical')).toBe(true);
    expect(crossesIntoRegulator('suspend_coverage', 'premium')).toBe(false);
    expect(crossesIntoRegulator('cancel_contract', 'mission_critical')).toBe(true);
    expect(crossesIntoRegulator('cancel_contract', 'premium')).toBe(false);
  });

  it('non-signature actions never cross', () => {
    expect(crossesIntoRegulator('confirm_renewal', 'mission_critical')).toBe(false);
    expect(crossesIntoRegulator('activate_coverage', 'mission_critical')).toBe(false);
  });

  it('sla_breached + isReportable track HIGH tiers', () => {
    expect(slaBreachCrossesIntoRegulator('premium')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mission_critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(isReportable('premium')).toBe(true);
    expect(isReportable('basic')).toBe(false);
  });
});

describe('W80 service-contract — party attribution', () => {
  it('maps each action to its functional owner', () => {
    expect(partyForAction('suspend_coverage')).toBe('finance');
    expect(partyForAction('reinstate_coverage')).toBe('finance');
    expect(partyForAction('activate_coverage')).toBe('service_desk');
    expect(partyForAction('open_renewal')).toBe('service_desk');
    expect(partyForAction('enter_grace')).toBe('service_desk');
    expect(partyForAction('expire_coverage')).toBe('service_desk');
    expect(partyForAction('issue_quote')).toBe('account_manager');
    expect(partyForAction('confirm_renewal')).toBe('account_manager');
    expect(partyForAction('cancel_contract')).toBe('account_manager');
  });
});
