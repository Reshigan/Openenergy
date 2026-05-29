import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isCancellable,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForQuantumZarM,
  isLargeTier,
  isGovernmentalChange,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  type ChangeInLawStatus,
  type ChangeInLawAction,
  type ChangeInLawTier,
  type ChangeType,
} from '../src/utils/ppa-change-in-law-spec';

describe('W78 PPA change-in-law — happy path (negotiated relief)', () => {
  it('walks event_logged → … → implemented', () => {
    let s: ChangeInLawStatus = 'event_logged';
    const path: [ChangeInLawAction, ChangeInLawStatus][] = [
      ['open_eligibility_review', 'eligibility_review'],
      ['confirm_eligible', 'impact_assessment'],
      ['submit_claim', 'claim_submitted'],
      ['acknowledge_claim', 'counterparty_review'],
      ['enter_negotiation', 'negotiation'],
      ['reach_agreement', 'determination_pending'],
      ['issue_determination', 'relief_granted'],
      ['implement_relief', 'implemented'],
    ];
    for (const [a, expected] of path) {
      const n = nextStatus(s, a);
      expect(n, `${s} --${a}-->`).toBe(expected);
      s = n!;
    }
    expect(isTerminal(s)).toBe(true);
  });
});

describe('W78 — branch paths', () => {
  it('ineligible: eligibility_review → rejected', () => {
    expect(nextStatus('eligibility_review', 'reject_ineligible')).toBe('rejected');
  });
  it('counterparty disputes: counterparty_review → rejected', () => {
    expect(nextStatus('counterparty_review', 'dispute_claim')).toBe('rejected');
  });
  it('no relief on determination: determination_pending → rejected', () => {
    expect(nextStatus('determination_pending', 'determine_no_relief')).toBe('rejected');
  });
  it('arbitration from counterparty_review and negotiation', () => {
    expect(nextStatus('counterparty_review', 'refer_to_arbitration')).toBe('in_arbitration');
    expect(nextStatus('negotiation', 'refer_to_arbitration')).toBe('in_arbitration');
  });
  it('arbitration awards relief or no relief', () => {
    expect(nextStatus('in_arbitration', 'award_relief')).toBe('relief_granted');
    expect(nextStatus('in_arbitration', 'award_no_relief')).toBe('rejected');
  });
  it('relief_granted always proceeds to implemented (no withdraw)', () => {
    expect(nextStatus('relief_granted', 'implement_relief')).toBe('implemented');
    expect(nextStatus('relief_granted', 'withdraw_claim')).toBeNull();
  });
});

describe('W78 — guards & terminals', () => {
  it('terminals accept nothing', () => {
    for (const t of ['implemented', 'rejected', 'withdrawn'] as ChangeInLawStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      expect(nextStatus(t, 'open_eligibility_review')).toBeNull();
    }
  });
  it('withdraw available from every pre-relief operative state, not arbitration/relief', () => {
    const cancellable: ChangeInLawStatus[] = [
      'event_logged', 'eligibility_review', 'impact_assessment', 'claim_submitted',
      'counterparty_review', 'negotiation', 'determination_pending',
    ];
    for (const s of cancellable) {
      expect(isCancellable(s), s).toBe(true);
      expect(nextStatus(s, 'withdraw_claim'), s).toBe('withdrawn');
    }
    expect(isCancellable('in_arbitration')).toBe(false);
    expect(isCancellable('relief_granted')).toBe(false);
    expect(nextStatus('in_arbitration', 'withdraw_claim')).toBeNull();
  });
  it('wrong-state transitions are rejected', () => {
    expect(nextStatus('event_logged', 'issue_determination')).toBeNull();
    expect(nextStatus('impact_assessment', 'implement_relief')).toBeNull();
    expect(nextStatus('negotiation', 'confirm_eligible')).toBeNull();
  });
  it('every action has a transition entry', () => {
    const actions = Object.keys(TRANSITIONS) as ChangeInLawAction[];
    expect(actions).toHaveLength(15);
  });
});

describe('W78 — tiers by relief quantum (ZAR millions)', () => {
  it('boundary cases', () => {
    expect(tierForQuantumZarM(0)).toBe('minor');
    expect(tierForQuantumZarM(4.9)).toBe('minor');
    expect(tierForQuantumZarM(5)).toBe('moderate');
    expect(tierForQuantumZarM(24.9)).toBe('moderate');
    expect(tierForQuantumZarM(25)).toBe('material');
    expect(tierForQuantumZarM(99.9)).toBe('material');
    expect(tierForQuantumZarM(100)).toBe('major');
    expect(tierForQuantumZarM(499.9)).toBe('major');
    expect(tierForQuantumZarM(500)).toBe('critical');
    expect(tierForQuantumZarM(5000)).toBe('critical');
  });
  it('large-tier set', () => {
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('critical')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W78 — INVERTED SLA (larger quantum = longer windows)', () => {
  const graded: ChangeInLawStatus[] = [
    'event_logged', 'eligibility_review', 'impact_assessment', 'counterparty_review',
    'negotiation', 'determination_pending', 'in_arbitration', 'relief_granted',
  ];
  it('windows strictly increase minor→critical for each graded state', () => {
    const order: ChangeInLawTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
    for (const st of graded) {
      for (let i = 1; i < order.length; i++) {
        const prev = slaWindowMinutes(st, order[i - 1]);
        const cur = slaWindowMinutes(st, order[i]);
        expect(cur >= prev, `${st}: ${order[i]} (${cur}) >= ${order[i - 1]} (${prev})`).toBe(true);
      }
      // strict increase between the extremes
      expect(slaWindowMinutes(st, 'critical')).toBeGreaterThan(slaWindowMinutes(st, 'minor'));
    }
  });
  it('terminals carry no deadline', () => {
    for (const t of ['implemented', 'rejected', 'withdrawn'] as ChangeInLawStatus[]) {
      for (const tier of ['minor', 'moderate', 'material', 'major', 'critical'] as ChangeInLawTier[]) {
        expect(slaWindowMinutes(t, tier)).toBe(0);
        expect(slaDeadlineFor(t, tier, new Date())).toBeNull();
      }
    }
  });
  it('slaDeadlineFor offsets from entry', () => {
    const entered = new Date('2026-05-29T00:00:00Z');
    const d = slaDeadlineFor('eligibility_review', 'minor', entered);
    expect(d).not.toBeNull();
    expect(d!.getTime() - entered.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe('W78 — governmental-origin classification', () => {
  it('tax / regulatory / statutory / discriminatory are governmental; other is not', () => {
    expect(isGovernmentalChange('tax_change')).toBe(true);
    expect(isGovernmentalChange('regulatory_change')).toBe(true);
    expect(isGovernmentalChange('statutory_change')).toBe(true);
    expect(isGovernmentalChange('discriminatory_change')).toBe(true);
    expect(isGovernmentalChange('other_change')).toBe(false);
  });
});

describe('W78 — reportability signature', () => {
  it('refer_to_arbitration crosses for EVERY tier regardless of change type', () => {
    const tiers: ChangeInLawTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
    const types: ChangeType[] = ['tax_change', 'regulatory_change', 'statutory_change', 'discriminatory_change', 'other_change'];
    for (const t of tiers) {
      for (const ct of types) {
        expect(crossesIntoRegulator('refer_to_arbitration', t, ct), `${t}/${ct}`).toBe(true);
      }
    }
  });
  it('issue_determination / award_relief cross only for governmental + material+', () => {
    expect(crossesIntoRegulator('issue_determination', 'material', 'tax_change')).toBe(true);
    expect(crossesIntoRegulator('award_relief', 'critical', 'regulatory_change')).toBe(true);
    // material+ but not governmental → no cross
    expect(crossesIntoRegulator('issue_determination', 'critical', 'other_change')).toBe(false);
    // governmental but below material → no cross
    expect(crossesIntoRegulator('issue_determination', 'moderate', 'tax_change')).toBe(false);
    expect(crossesIntoRegulator('award_relief', 'minor', 'statutory_change')).toBe(false);
  });
  it('routine actions never cross', () => {
    expect(crossesIntoRegulator('confirm_eligible', 'critical', 'tax_change')).toBe(false);
    expect(crossesIntoRegulator('implement_relief', 'critical', 'tax_change')).toBe(false);
    expect(crossesIntoRegulator('determine_no_relief', 'critical', 'regulatory_change')).toBe(false);
  });
  it('SLA breach crosses for major + critical only', () => {
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
  it('isReportable: governmental + material+ only', () => {
    expect(isReportable('material', 'tax_change')).toBe(true);
    expect(isReportable('critical', 'discriminatory_change')).toBe(true);
    expect(isReportable('moderate', 'tax_change')).toBe(false);
    expect(isReportable('critical', 'other_change')).toBe(false);
  });
});

describe('W78 — party attribution', () => {
  it('claimant raises/prosecutes/withdraws; counterparty reviews/determines; arbitrator awards', () => {
    expect(partyForAction('submit_claim')).toBe('claimant');
    expect(partyForAction('reach_agreement')).toBe('claimant');
    expect(partyForAction('refer_to_arbitration')).toBe('claimant');
    expect(partyForAction('withdraw_claim')).toBe('claimant');
    expect(partyForAction('open_eligibility_review')).toBe('counterparty');
    expect(partyForAction('issue_determination')).toBe('counterparty');
    expect(partyForAction('implement_relief')).toBe('counterparty');
    expect(partyForAction('award_relief')).toBe('arbitrator');
    expect(partyForAction('award_no_relief')).toBe('arbitrator');
  });
});
