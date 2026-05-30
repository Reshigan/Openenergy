import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  nextStatus,
  allowedActions,
  isCancellable,
  isFloorAtHighClass,
  isSignatureCrossingClass,
  isRiskClass,
  emvZar,
  tierFromEmv,
  isTier,
  tierRank,
  isHighTier,
  SLA_MINUTES,
  slaDeadlineFor,
  isReportable,
  actionCrossesRegulator,
  authorityFor,
  triangularMean,
  triangularVariance,
  pPercentileCostZar,
  p50CostZar,
  p80CostZar,
  p50ScheduleDays,
  p80ScheduleDays,
  residualEmvZar,
  contingencyDrawdownRatio,
  bidEnvelopeRiskPct,
  urgencyBand,
  partyForAction,
  eventTypeFor,
  reasonCodeFor,
  type ProjectRiskStatus,
  type ProjectRiskTier,
  type ProjectRiskClass,
} from '../src/utils/project-risk-spec';

describe('W92 project-risk state machine', () => {
  it('forward happy path identified → closed', () => {
    expect(nextStatus('identified', 'assess')).toBe('assessed');
    expect(nextStatus('assessed', 'quantify')).toBe('quantified');
    expect(nextStatus('quantified', 'plan_response')).toBe('response_planned');
    expect(nextStatus('response_planned', 'execute_response')).toBe('response_active');
    expect(nextStatus('response_active', 'begin_monitoring')).toBe('monitoring');
    expect(nextStatus('monitoring', 'close_risk')).toBe('closed');
  });

  it('realize branch: response_active / monitoring → realized → closed', () => {
    expect(nextStatus('response_active', 'realize_risk')).toBe('realized');
    expect(nextStatus('monitoring', 'realize_risk')).toBe('realized');
    expect(nextStatus('realized', 'close_risk')).toBe('closed');
  });

  it('accept branch: assessed / quantified → accepted', () => {
    expect(nextStatus('assessed', 'accept_risk')).toBe('accepted');
    expect(nextStatus('quantified', 'accept_risk')).toBe('accepted');
  });

  it('escalate loop: many states → escalated → reanalyze → quantified', () => {
    for (const s of ['quantified', 'response_planned', 'response_active', 'monitoring', 'realized'] as ProjectRiskStatus[]) {
      expect(nextStatus(s, 'escalate')).toBe('escalated');
    }
    expect(nextStatus('escalated', 'reanalyze')).toBe('quantified');
  });

  it('terminals are terminal and have no outgoing transitions', () => {
    for (const t of ['closed', 'accepted', 'withdrawn', 'cancelled'] as ProjectRiskStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toHaveLength(0);
    }
  });

  it('non-terminals are not terminal', () => {
    for (const s of ['identified', 'assessed', 'quantified', 'response_planned', 'response_active', 'monitoring', 'realized', 'escalated'] as ProjectRiskStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });

  it('withdraw reachable from identified / assessed only', () => {
    expect(nextStatus('identified', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('assessed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('quantified', 'withdraw')).toBeNull();
    expect(nextStatus('response_active', 'withdraw')).toBeNull();
  });

  it('cancel reachable from every non-terminal', () => {
    for (const s of Object.keys(TRANSITIONS) as ProjectRiskStatus[]) {
      if (isTerminal(s)) continue;
      expect(isCancellable(s)).toBe(true);
    }
  });

  it('illegal transitions return null', () => {
    expect(nextStatus('identified', 'close_risk')).toBeNull();
    expect(nextStatus('assessed', 'realize_risk')).toBeNull();
    expect(nextStatus('quantified', 'execute_response')).toBeNull();
    expect(nextStatus('closed', 'reanalyze')).toBeNull();
  });
});

describe('W92 EMV tier (derived from probability × |impact|, with class floor)', () => {
  it('low / moderate / high / critical bands', () => {
    expect(tierFromEmv(100_000, 'cost_overrun')).toBe('low');
    expect(tierFromEmv(1_000_000, 'cost_overrun')).toBe('moderate');
    expect(tierFromEmv(10_000_000, 'cost_overrun')).toBe('high');
    expect(tierFromEmv(75_000_000, 'cost_overrun')).toBe('critical');
  });

  it('boundary values exact', () => {
    expect(tierFromEmv(499_999, 'cost_overrun')).toBe('low');
    expect(tierFromEmv(500_000, 'cost_overrun')).toBe('moderate');
    expect(tierFromEmv(4_999_999, 'cost_overrun')).toBe('moderate');
    expect(tierFromEmv(5_000_000, 'cost_overrun')).toBe('high');
    expect(tierFromEmv(49_999_999, 'cost_overrun')).toBe('high');
    expect(tierFromEmv(50_000_000, 'cost_overrun')).toBe('critical');
  });

  it('force_majeure / regulatory_change / strategic floor at high', () => {
    expect(tierFromEmv(100_000, 'force_majeure')).toBe('high');
    expect(tierFromEmv(100_000, 'regulatory_change')).toBe('high');
    expect(tierFromEmv(100_000, 'strategic')).toBe('high');
    // floor does not LOWER a critical
    expect(tierFromEmv(75_000_000, 'regulatory_change')).toBe('critical');
    expect(tierFromEmv(75_000_000, 'force_majeure')).toBe('critical');
  });

  it('isFloorAtHighClass identifies the three classes', () => {
    expect(isFloorAtHighClass('force_majeure')).toBe(true);
    expect(isFloorAtHighClass('regulatory_change')).toBe(true);
    expect(isFloorAtHighClass('strategic')).toBe(true);
    expect(isFloorAtHighClass('cost_overrun')).toBe(false);
    expect(isFloorAtHighClass('schedule_slip')).toBe(false);
  });

  it('isSignatureCrossingClass identifies force_majeure + regulatory_change only', () => {
    expect(isSignatureCrossingClass('force_majeure')).toBe(true);
    expect(isSignatureCrossingClass('regulatory_change')).toBe(true);
    expect(isSignatureCrossingClass('strategic')).toBe(false);
    expect(isSignatureCrossingClass('safety')).toBe(false);
  });

  it('isTier and tierRank', () => {
    for (const t of ['low', 'moderate', 'high', 'critical']) {
      expect(isTier(t)).toBe(true);
    }
    expect(isTier('mega')).toBe(false);
    expect(tierRank('low')).toBe(0);
    expect(tierRank('critical')).toBe(3);
    expect(tierRank('high')).toBeGreaterThan(tierRank('moderate'));
  });

  it('isHighTier', () => {
    expect(isHighTier('high')).toBe(true);
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('low')).toBe(false);
    expect(isHighTier('moderate')).toBe(false);
  });

  it('isRiskClass', () => {
    expect(isRiskClass('cost_overrun')).toBe(true);
    expect(isRiskClass('regulatory_change')).toBe(true);
    expect(isRiskClass('not_a_class')).toBe(false);
  });
});

describe('W92 EMV calc', () => {
  it('emvZar = (p/100) × |impact|', () => {
    expect(emvZar(50, 10_000_000)).toBe(5_000_000);
    expect(emvZar(100, 10_000_000)).toBe(10_000_000);
    expect(emvZar(0, 10_000_000)).toBe(0);
    expect(emvZar(25, -8_000_000)).toBe(2_000_000); // abs impact
  });

  it('emvZar clamps probability to [0, 100]', () => {
    expect(emvZar(150, 10_000_000)).toBe(10_000_000);
    expect(emvZar(-10, 10_000_000)).toBe(0);
  });
});

describe('W92 INVERTED SLA matrix', () => {
  it('strictly INCREASING low → critical at every graded state', () => {
    const tiers: ProjectRiskTier[] = ['low', 'moderate', 'high', 'critical'];
    for (const state of Object.keys(SLA_MINUTES) as ProjectRiskStatus[]) {
      if (isTerminal(state)) continue;
      let prev = -1;
      for (const t of tiers) {
        const cur = SLA_MINUTES[state][t];
        expect(cur).toBeGreaterThan(prev);
        prev = cur;
      }
    }
  });

  it('terminals all 0', () => {
    for (const t of ['closed', 'accepted', 'withdrawn', 'cancelled'] as ProjectRiskStatus[]) {
      for (const tier of ['low', 'moderate', 'high', 'critical'] as ProjectRiskTier[]) {
        expect(SLA_MINUTES[t][tier]).toBe(0);
      }
    }
  });

  it('realized is the URGENT state (low<<all others)', () => {
    expect(SLA_MINUTES.realized.low).toBeLessThan(SLA_MINUTES.identified.low);
    expect(SLA_MINUTES.realized.critical).toBeLessThan(SLA_MINUTES.monitoring.critical);
  });

  it('monitoring is the LONGEST park (high values)', () => {
    expect(SLA_MINUTES.monitoring.low).toBeGreaterThan(SLA_MINUTES.identified.low);
    expect(SLA_MINUTES.monitoring.critical).toBeGreaterThan(SLA_MINUTES.response_active.critical);
  });

  it('slaDeadlineFor adds minutes to enteredAt', () => {
    const base = new Date('2026-06-01T00:00:00Z');
    const due = slaDeadlineFor('identified', 'moderate', base);
    expect(due).not.toBeNull();
    expect(due!.getTime() - base.getTime()).toBe(SLA_MINUTES.identified.moderate * 60_000);
  });

  it('slaDeadlineFor null for terminal', () => {
    expect(slaDeadlineFor('closed', 'critical', new Date())).toBeNull();
    expect(slaDeadlineFor('accepted', 'low', new Date())).toBeNull();
  });
});

describe('W92 reportability + W92 SIGNATURE realize_risk crossing', () => {
  it('isReportable = isHighTier', () => {
    expect(isReportable('low')).toBe(false);
    expect(isReportable('moderate')).toBe(false);
    expect(isReportable('high')).toBe(true);
    expect(isReportable('critical')).toBe(true);
  });

  it('W92 SIGNATURE: realize_risk crosses regulator EVERY tier on force_majeure', () => {
    for (const tier of ['low', 'moderate', 'high', 'critical'] as ProjectRiskTier[]) {
      expect(actionCrossesRegulator('realize_risk', tier, 'force_majeure', true)).toBe(true);
    }
  });

  it('W92 SIGNATURE: realize_risk crosses regulator EVERY tier on regulatory_change', () => {
    for (const tier of ['low', 'moderate', 'high', 'critical'] as ProjectRiskTier[]) {
      expect(actionCrossesRegulator('realize_risk', tier, 'regulatory_change', true)).toBe(true);
    }
  });

  it('realize_risk on non-signature class crosses HIGH tiers only', () => {
    for (const cls of ['cost_overrun', 'schedule_slip', 'design_change', 'safety'] as ProjectRiskClass[]) {
      expect(actionCrossesRegulator('realize_risk', 'low', cls, true)).toBe(false);
      expect(actionCrossesRegulator('realize_risk', 'moderate', cls, true)).toBe(false);
      expect(actionCrossesRegulator('realize_risk', 'high', cls, true)).toBe(true);
      expect(actionCrossesRegulator('realize_risk', 'critical', cls, true)).toBe(true);
    }
  });

  it('escalate crosses HIGH tiers regardless of class', () => {
    expect(actionCrossesRegulator('escalate', 'low', 'cost_overrun', false)).toBe(false);
    expect(actionCrossesRegulator('escalate', 'moderate', 'cost_overrun', false)).toBe(false);
    expect(actionCrossesRegulator('escalate', 'high', 'cost_overrun', false)).toBe(true);
    expect(actionCrossesRegulator('escalate', 'critical', 'cost_overrun', false)).toBe(true);
  });

  it('accept_risk crosses regulator critical ONLY', () => {
    expect(actionCrossesRegulator('accept_risk', 'low', 'cost_overrun', false)).toBe(false);
    expect(actionCrossesRegulator('accept_risk', 'high', 'cost_overrun', false)).toBe(false);
    expect(actionCrossesRegulator('accept_risk', 'critical', 'cost_overrun', false)).toBe(true);
  });

  it('close_risk crosses regulator critical+realized ONLY', () => {
    expect(actionCrossesRegulator('close_risk', 'critical', 'cost_overrun', false)).toBe(false);
    expect(actionCrossesRegulator('close_risk', 'critical', 'cost_overrun', true)).toBe(true);
    expect(actionCrossesRegulator('close_risk', 'high', 'cost_overrun', true)).toBe(false);
  });

  it('non-reportable actions never cross', () => {
    for (const a of ['assess', 'quantify', 'plan_response', 'execute_response', 'begin_monitoring', 'reanalyze', 'withdraw', 'cancel'] as const) {
      for (const tier of ['low', 'moderate', 'high', 'critical'] as ProjectRiskTier[]) {
        expect(actionCrossesRegulator(a, tier, 'force_majeure', true)).toBe(false);
      }
    }
  });
});

describe('W92 authority derivation', () => {
  it('low → PM, moderate → risk_owner, high → sponsor, critical → board', () => {
    expect(authorityFor('low')).toBe('project_manager');
    expect(authorityFor('moderate')).toBe('risk_owner');
    expect(authorityFor('high')).toBe('sponsor');
    expect(authorityFor('critical')).toBe('board');
  });
});

describe('W92 Monte-Carlo / SRA math', () => {
  it('triangularMean = (a+m+b)/3', () => {
    expect(triangularMean(1_000_000, 5_000_000, 12_000_000)).toBe(6_000_000);
  });

  it('triangularVariance positive', () => {
    const v = triangularVariance(1_000_000, 5_000_000, 12_000_000);
    expect(v).toBeGreaterThan(0);
  });

  it('p50CostZar < p80CostZar at probability 100% with non-zero variance', () => {
    const p50 = p50CostZar(1_000_000, 5_000_000, 12_000_000, 100);
    const p80 = p80CostZar(1_000_000, 5_000_000, 12_000_000, 100);
    expect(p80).toBeGreaterThan(p50);
  });

  it('p50CostZar at probability 100% ≈ triangularMean', () => {
    const p50 = p50CostZar(1_000_000, 5_000_000, 12_000_000, 100);
    expect(Math.round(p50)).toBe(6_000_000);
  });

  it('p50CostZar at probability 0% is 0', () => {
    expect(p50CostZar(1_000_000, 5_000_000, 12_000_000, 0)).toBe(0);
  });

  it('p50CostZar at probability 50% is half of p50CostZar at 100%', () => {
    const at100 = p50CostZar(1_000_000, 5_000_000, 12_000_000, 100);
    const at50  = p50CostZar(1_000_000, 5_000_000, 12_000_000, 50);
    expect(Math.round(at50)).toBe(Math.round(at100 * 0.5));
  });

  it('p50ScheduleDays + p80ScheduleDays same triangular-lognormal', () => {
    const p50 = p50ScheduleDays(10, 30, 90, 100);
    const p80 = p80ScheduleDays(10, 30, 90, 100);
    expect(p80).toBeGreaterThan(p50);
    expect(Math.round(p50)).toBeCloseTo((10 + 30 + 90) / 3, 0);
  });

  it('residualEmvZar reduces base by effectiveness%', () => {
    expect(residualEmvZar(10_000_000, 0)).toBe(10_000_000);
    expect(residualEmvZar(10_000_000, 50)).toBe(5_000_000);
    expect(residualEmvZar(10_000_000, 100)).toBe(0);
    expect(residualEmvZar(10_000_000, 80)).toBeCloseTo(2_000_000, 6);
  });

  it('residualEmvZar clamps effectiveness to [0, 100]', () => {
    expect(residualEmvZar(10_000_000, 150)).toBe(0);
    expect(residualEmvZar(10_000_000, -10)).toBe(10_000_000);
  });

  it('contingencyDrawdownRatio = drawn/total clamped', () => {
    expect(contingencyDrawdownRatio(5_000_000, 20_000_000)).toBe(0.25);
    expect(contingencyDrawdownRatio(0, 20_000_000)).toBe(0);
    expect(contingencyDrawdownRatio(25_000_000, 20_000_000)).toBe(1.25); // over
    expect(contingencyDrawdownRatio(5_000_000, 0)).toBe(0); // no envelope
  });

  it('bidEnvelopeRiskPct = (worst_case / envelope) × 100', () => {
    expect(bidEnvelopeRiskPct(10_000_000, 100_000_000)).toBe(10);
    expect(bidEnvelopeRiskPct(50_000_000, 100_000_000)).toBe(50);
    expect(bidEnvelopeRiskPct(120_000_000, 100_000_000)).toBe(120);
    expect(bidEnvelopeRiskPct(10_000_000, 0)).toBe(0);
  });
});

describe('W92 urgencyBand', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('terminal → closed', () => {
    expect(urgencyBand('closed', null, now)).toBe('closed');
    expect(urgencyBand('accepted', null, now)).toBe('closed');
  });

  it('no SLA due → on_track', () => {
    expect(urgencyBand('identified', null, now)).toBe('on_track');
  });

  it('overdue if past', () => {
    const past = new Date(now.getTime() - 60_000);
    expect(urgencyBand('identified', past, now)).toBe('overdue');
  });

  it('urgent if ≤24h remaining', () => {
    const due = new Date(now.getTime() + 12 * 3600_000);
    expect(urgencyBand('identified', due, now)).toBe('urgent');
  });

  it('due_soon if ≤72h remaining', () => {
    const due = new Date(now.getTime() + 48 * 3600_000);
    expect(urgencyBand('identified', due, now)).toBe('due_soon');
  });

  it('on_track if >72h remaining', () => {
    const due = new Date(now.getTime() + 96 * 3600_000);
    expect(urgencyBand('identified', due, now)).toBe('on_track');
  });
});

describe('W92 actor-party + event-type derivation', () => {
  it('partyForAction', () => {
    expect(partyForAction('assess')).toBe('risk_owner');
    expect(partyForAction('quantify')).toBe('project_controls');
    expect(partyForAction('plan_response')).toBe('risk_owner');
    expect(partyForAction('execute_response')).toBe('project_manager');
    expect(partyForAction('realize_risk')).toBe('project_manager');
    expect(partyForAction('accept_risk')).toBe('sponsor');
    expect(partyForAction('escalate')).toBe('sponsor');
    expect(partyForAction('reanalyze')).toBe('project_controls');
  });

  it('eventTypeFor adds project_risk. prefix', () => {
    expect(eventTypeFor('identified')).toBe('project_risk.identified');
    expect(eventTypeFor('realized')).toBe('project_risk.realized');
    expect(eventTypeFor('closed')).toBe('project_risk.closed');
  });

  it('reasonCodeFor realize_risk on signature class tags class', () => {
    expect(reasonCodeFor('realize_risk', 'force_majeure', 'low')).toBe('realized_force_majeure_low');
    expect(reasonCodeFor('realize_risk', 'regulatory_change', 'critical')).toBe('realized_regulatory_change_critical');
  });

  it('reasonCodeFor realize_risk on other class uses tier only', () => {
    expect(reasonCodeFor('realize_risk', 'cost_overrun', 'high')).toBe('realized_high');
  });

  it('reasonCodeFor escalate / accept / close', () => {
    expect(reasonCodeFor('escalate', 'cost_overrun', 'critical')).toBe('escalated_critical');
    expect(reasonCodeFor('accept_risk', 'cost_overrun', 'critical')).toBe('accepted_critical');
    expect(reasonCodeFor('close_risk', 'cost_overrun', 'critical')).toBe('closed_critical');
  });
});
