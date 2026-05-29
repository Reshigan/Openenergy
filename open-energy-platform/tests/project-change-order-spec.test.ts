import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  nextStatus,
  allowedActions,
  isCancellable,
  tierFromCostImpact,
  isTier,
  tierRank,
  isHighTier,
  SLA_MINUTES,
  slaDeadlineFor,
  approvalAuthorityFor,
  costVarianceZar,
  scheduleVarianceZar,
  cpi,
  spi,
  estimateAtCompletionZar,
  varianceAtCompletionZar,
  toCompletePerformanceIndex,
  contingencyRemainingZar,
  isWithinContingency,
  revisedBaselineCostZar,
  cumulativeOverrunPct,
  breachesBidEnvelope,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  type ChangeOrderStatus,
  type ChangeOrderAction,
  type VariationTier,
} from '../src/utils/project-change-order-spec';

describe('W81 change-order state machine', () => {
  it('forward happy path draft → incorporated', () => {
    expect(nextStatus('draft', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'begin_screening')).toBe('screening');
    expect(nextStatus('screening', 'assess_impact')).toBe('impact_assessment');
    expect(nextStatus('impact_assessment', 'submit_for_approval')).toBe('pending_approval');
    expect(nextStatus('pending_approval', 'approve')).toBe('approved');
    expect(nextStatus('approved', 'incorporate')).toBe('incorporated');
  });

  it('terminals are terminal and have no outgoing transitions', () => {
    for (const t of ['incorporated', 'rejected', 'withdrawn', 'cancelled'] as ChangeOrderStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toHaveLength(0);
    }
  });

  it('non-terminals are not terminal', () => {
    for (const s of ['draft', 'submitted', 'screening', 'impact_assessment', 'pending_approval', 'approved', 'deferred', 'disputed'] as ChangeOrderStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });

  it('defer → resubmit round-trip', () => {
    expect(nextStatus('screening', 'defer')).toBe('deferred');
    expect(nextStatus('deferred', 'resubmit')).toBe('submitted');
  });

  it('dispute loop: pending_approval → disputed → impact_assessment', () => {
    expect(nextStatus('pending_approval', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('impact_assessment');
  });

  it('reject is reachable from screening, impact_assessment, pending_approval, disputed, deferred', () => {
    for (const s of ['screening', 'impact_assessment', 'pending_approval', 'disputed', 'deferred'] as ChangeOrderStatus[]) {
      expect(nextStatus(s, 'reject')).toBe('rejected');
    }
  });

  it('withdraw reachable from all pre-approved planning states', () => {
    for (const s of ['draft', 'submitted', 'screening', 'impact_assessment', 'pending_approval'] as ChangeOrderStatus[]) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    }
  });

  it('approved cannot be withdrawn (only cancel/incorporate)', () => {
    expect(nextStatus('approved', 'withdraw')).toBeNull();
    expect(isCancellable('approved')).toBe(true);
  });

  it('cancel reachable from every non-terminal', () => {
    for (const s of Object.keys(TRANSITIONS) as ChangeOrderStatus[]) {
      if (isTerminal(s)) continue;
      expect(isCancellable(s)).toBe(true);
    }
  });

  it('illegal transitions return null', () => {
    expect(nextStatus('draft', 'approve')).toBeNull();
    expect(nextStatus('screening', 'incorporate')).toBeNull();
    expect(nextStatus('approved', 'submit')).toBeNull();
  });
});

describe('W81 variation tier (derived from |cost_impact_zar|)', () => {
  it('thresholds', () => {
    expect(tierFromCostImpact(500_000)).toBe('minor');
    expect(tierFromCostImpact(999_999)).toBe('minor');
    expect(tierFromCostImpact(1_000_000)).toBe('moderate');
    expect(tierFromCostImpact(9_999_999)).toBe('moderate');
    expect(tierFromCostImpact(10_000_000)).toBe('major');
    expect(tierFromCostImpact(49_999_999)).toBe('major');
    expect(tierFromCostImpact(50_000_000)).toBe('critical');
    expect(tierFromCostImpact(120_000_000)).toBe('critical');
  });

  it('uses magnitude (cost reductions tier by absolute value)', () => {
    expect(tierFromCostImpact(-25_000_000)).toBe('major');
    expect(tierFromCostImpact(0)).toBe('minor');
  });

  it('isTier guards', () => {
    expect(isTier('critical')).toBe(true);
    expect(isTier('nonsense')).toBe(false);
  });

  it('tierRank orders minor < moderate < major < critical', () => {
    expect(tierRank('minor')).toBeLessThan(tierRank('moderate'));
    expect(tierRank('moderate')).toBeLessThan(tierRank('major'));
    expect(tierRank('major')).toBeLessThan(tierRank('critical'));
  });

  it('isHighTier = major | critical', () => {
    expect(isHighTier('minor')).toBe(false);
    expect(isHighTier('moderate')).toBe(false);
    expect(isHighTier('major')).toBe(true);
    expect(isHighTier('critical')).toBe(true);
  });
});

describe('W81 INVERTED SLA', () => {
  it('every graded state is strictly increasing minor → critical', () => {
    for (const [state, windows] of Object.entries(SLA_MINUTES)) {
      if (isTerminal(state as ChangeOrderStatus)) {
        expect(windows.minor).toBe(0);
        continue;
      }
      expect(windows.minor).toBeLessThan(windows.moderate);
      expect(windows.moderate).toBeLessThan(windows.major);
      expect(windows.major).toBeLessThan(windows.critical);
    }
  });

  it('terminals have no SLA deadline', () => {
    expect(slaDeadlineFor('incorporated', 'critical', new Date())).toBeNull();
    expect(slaDeadlineFor('rejected', 'major', new Date())).toBeNull();
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const t0 = new Date('2026-05-29T00:00:00.000Z');
    const due = slaDeadlineFor('impact_assessment', 'critical', t0);
    expect(due).not.toBeNull();
    // critical impact_assessment = 28800m
    expect((due!.getTime() - t0.getTime()) / 60000).toBe(28800);
  });
});

describe('W81 approval authority', () => {
  it('escalates with tier', () => {
    expect(approvalAuthorityFor('minor')).toBe('project_manager');
    expect(approvalAuthorityFor('moderate')).toBe('sponsor');
    expect(approvalAuthorityFor('major')).toBe('board');
    expect(approvalAuthorityFor('critical')).toBe('dmre_notify');
  });
});

describe('W81 earned-value battery', () => {
  it('CV and SV', () => {
    expect(costVarianceZar(80, 100)).toBe(-20);   // over cost
    expect(scheduleVarianceZar(80, 100)).toBe(-20); // behind schedule
  });

  it('CPI and SPI', () => {
    expect(cpi(80, 100)).toBeCloseTo(0.8);
    expect(spi(120, 100)).toBeCloseTo(1.2);
    expect(cpi(50, 0)).toBe(0);  // undefined-safe
    expect(spi(50, 0)).toBe(0);
  });

  it('EAC = BAC / CPI', () => {
    expect(estimateAtCompletionZar(1_000_000, 800, 1000)).toBe(1_250_000); // CPI 0.8
    expect(estimateAtCompletionZar(1_000_000, 0, 0)).toBe(1_000_000);      // no signal
  });

  it('VAC = BAC − EAC (negative = overrun)', () => {
    expect(varianceAtCompletionZar(1_000_000, 800, 1000)).toBe(-250_000);
  });

  it('TCPI = (BAC − EV) / (BAC − AC)', () => {
    expect(toCompletePerformanceIndex(1000, 400, 500)).toBeCloseTo(1.2);
    expect(toCompletePerformanceIndex(1000, 400, 1000)).toBe(0); // denom ≤ 0
  });
});

describe('W81 contingency', () => {
  it('remaining clamps at 0', () => {
    expect(contingencyRemainingZar(10_000_000, 3_000_000)).toBe(7_000_000);
    expect(contingencyRemainingZar(10_000_000, 12_000_000)).toBe(0);
  });

  it('isWithinContingency', () => {
    expect(isWithinContingency(5_000_000, 10_000_000, 3_000_000)).toBe(true);  // 5m <= 7m
    expect(isWithinContingency(8_000_000, 10_000_000, 3_000_000)).toBe(false); // 8m > 7m
    expect(isWithinContingency(-2_000_000, 0, 0)).toBe(true);                  // cost reduction
  });
});

describe('W81 re-baseline & bid envelope', () => {
  it('revised baseline sums baseline + cumulative + this', () => {
    expect(revisedBaselineCostZar(100_000_000, 5_000_000, 8_000_000)).toBe(113_000_000);
  });

  it('cumulative overrun pct', () => {
    expect(cumulativeOverrunPct(100_000_000, 5_000_000, 5_000_000)).toBeCloseTo(10);
  });

  it('breachesBidEnvelope on cost overrun', () => {
    expect(breachesBidEnvelope({
      baselineCostZar: 100_000_000,
      cumulativeApprovedZar: 8_000_000,
      costImpactZar: 5_000_000,        // 13% > 10%
      bidEnvelopeCostPct: 10,
      scheduleImpactDays: 0,
      cumulativeApprovedDays: 0,
      bidEnvelopeScheduleDays: 90,
    })).toBe(true);
  });

  it('breachesBidEnvelope on schedule slip', () => {
    expect(breachesBidEnvelope({
      baselineCostZar: 100_000_000,
      cumulativeApprovedZar: 0,
      costImpactZar: 1_000_000,         // 1% < 10%
      bidEnvelopeCostPct: 10,
      scheduleImpactDays: 60,
      cumulativeApprovedDays: 45,        // 105 > 90
      bidEnvelopeScheduleDays: 90,
    })).toBe(true);
  });

  it('within both envelopes does not breach', () => {
    expect(breachesBidEnvelope({
      baselineCostZar: 100_000_000,
      cumulativeApprovedZar: 2_000_000,
      costImpactZar: 1_000_000,         // 3%
      bidEnvelopeCostPct: 10,
      scheduleImpactDays: 10,
      cumulativeApprovedDays: 20,        // 30 < 90
      bidEnvelopeScheduleDays: 90,
    })).toBe(false);
  });
});

describe('W81 reportability (re-baseline signature)', () => {
  it('incorporate crosses for HIGH tiers only', () => {
    expect(crossesIntoRegulator('incorporate', 'minor')).toBe(false);
    expect(crossesIntoRegulator('incorporate', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('incorporate', 'major')).toBe(true);
    expect(crossesIntoRegulator('incorporate', 'critical')).toBe(true);
  });

  it('approve and reject cross for critical only', () => {
    expect(crossesIntoRegulator('approve', 'major')).toBe(false);
    expect(crossesIntoRegulator('approve', 'critical')).toBe(true);
    expect(crossesIntoRegulator('reject', 'major')).toBe(false);
    expect(crossesIntoRegulator('reject', 'critical')).toBe(true);
  });

  it('other actions never cross', () => {
    for (const a of ['submit', 'begin_screening', 'assess_impact', 'defer', 'withdraw', 'cancel'] as ChangeOrderAction[]) {
      for (const t of ['minor', 'moderate', 'major', 'critical'] as VariationTier[]) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla breach + isReportable = HIGH tiers', () => {
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('critical')).toBe(true);
  });
});

describe('W81 party attribution', () => {
  it('sponsor owns approve / incorporate / reject', () => {
    expect(partyForAction('approve')).toBe('sponsor');
    expect(partyForAction('incorporate')).toBe('sponsor');
    expect(partyForAction('reject')).toBe('sponsor');
  });

  it('project_controls owns screening / assessment / dispute', () => {
    expect(partyForAction('begin_screening')).toBe('project_controls');
    expect(partyForAction('assess_impact')).toBe('project_controls');
    expect(partyForAction('raise_dispute')).toBe('project_controls');
  });

  it('project_manager owns submit / resubmit / withdraw / cancel', () => {
    expect(partyForAction('submit')).toBe('project_manager');
    expect(partyForAction('resubmit')).toBe('project_manager');
    expect(partyForAction('withdraw')).toBe('project_manager');
    expect(partyForAction('cancel')).toBe('project_manager');
  });
});
