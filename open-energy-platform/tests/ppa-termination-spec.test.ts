import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  isLargeTier,
  isInvoluntaryCause,
  etaBasisForCause,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isCounterpartyAction,
  tierForBuyoutZarM,
  type PpaTerminationStatus,
  type PpaTerminationAction,
  type PpaTerminationTier,
  type TerminationCause,
} from '../src/utils/ppa-termination-spec';

const ALL_TIERS: PpaTerminationTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];
const ALL_CAUSES: TerminationCause[] = [
  'seller_default', 'buyer_default', 'no_fault', 'change_in_law', 'prolonged_force_majeure',
];

describe('W62 PPA termination & buy-out state machine', () => {
  it('walks the clean buy-out path termination_triggered → closed', () => {
    let s: PpaTerminationStatus = 'termination_triggered';
    const path: PpaTerminationAction[] = [
      'serve_notice', 'open_cure', 'escalate_review', 'confirm_termination',
      'open_eta_assessment', 'agree_eta', 'initiate_settlement', 'confirm_settlement',
    ];
    const expected: PpaTerminationStatus[] = [
      'notice_served', 'cure_period', 'termination_review', 'termination_confirmed',
      'eta_assessment', 'eta_agreed', 'settlement_pending', 'closed',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('confirm_cure reinstates the PPA from cure_period (counterparty cured)', () => {
    expect(nextStatus('cure_period', 'confirm_cure')).toBe('reinstated');
    expect(isTerminal('reinstated')).toBe(true);
  });

  it('escalate_review reaches the decision from notice_served (no-cure) and cure_period (uncured)', () => {
    expect(nextStatus('notice_served', 'escalate_review')).toBe('termination_review');
    expect(nextStatus('cure_period', 'escalate_review')).toBe('termination_review');
  });

  it('dispute loops eta_assessment / eta_agreed → disputed → eta_agreed', () => {
    expect(nextStatus('eta_assessment', 'dispute_eta')).toBe('disputed');
    expect(nextStatus('eta_agreed', 'dispute_eta')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('eta_agreed');
  });

  it('withdraw terminates from any pre-confirmation operative state', () => {
    (['termination_triggered', 'notice_served', 'cure_period', 'termination_review'] as PpaTerminationStatus[]).forEach((s) => {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    });
    // not available once a termination is CONFIRMED — it proceeds to buy-out
    expect(nextStatus('termination_confirmed', 'withdraw')).toBeNull();
    expect(nextStatus('eta_assessment', 'withdraw')).toBeNull();
    expect(nextStatus('settlement_pending', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('termination_triggered', 'confirm_termination')).toBeNull();
    expect(nextStatus('notice_served', 'agree_eta')).toBeNull();
    expect(nextStatus('eta_assessment', 'initiate_settlement')).toBeNull();
    expect(nextStatus('termination_confirmed', 'agree_eta')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['closed', 'reinstated', 'withdrawn'] as PpaTerminationStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as PpaTerminationAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('notice_served').sort()).toEqual(
      ['open_cure', 'escalate_review', 'withdraw'].sort(),
    );
    expect(allowedActions('cure_period').sort()).toEqual(
      ['confirm_cure', 'escalate_review', 'withdraw'].sort(),
    );
    expect(allowedActions('eta_assessment').sort()).toEqual(
      ['agree_eta', 'dispute_eta'].sort(),
    );
    expect(allowedActions('eta_agreed').sort()).toEqual(
      ['dispute_eta', 'initiate_settlement'].sort(),
    );
    expect(allowedActions('settlement_pending')).toEqual(['confirm_settlement']);
  });
});

describe('W62 MIXED SLA matrix', () => {
  it('cure / eta_assessment / dispute windows are INVERTED (bigger buy-out = longer)', () => {
    (['cure_period', 'eta_assessment', 'disputed', 'termination_confirmed'] as PpaTerminationStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeGreaterThanOrEqual(mins[i - 1]);
      }
      // strictly increasing somewhere across the range
      expect(mins[mins.length - 1]).toBeGreaterThan(mins[0]);
    });
  });

  it('settlement_pending is URGENT (bigger buy-out = tighter, paid faster)', () => {
    const mins = ALL_TIERS.map((t) => slaWindowMinutes('settlement_pending', t));
    for (let i = 1; i < mins.length; i++) {
      expect(mins[i]).toBeLessThan(mins[i - 1]);
    }
  });

  it('terminals carry no SLA deadline', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    (['closed', 'reinstated', 'withdrawn'] as PpaTerminationStatus[]).forEach((t) => {
      ALL_TIERS.forEach((tier) => expect(slaWindowMinutes(t, tier)).toBe(0));
      expect(slaDeadlineFor(t, 'critical', now)).toBeNull();
    });
  });

  it('slaDeadlineFor computes the deadline for operative states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    // settlement_pending / critical = 7 days
    expect(slaDeadlineFor('settlement_pending', 'critical', now))
      .toEqual(new Date('2026-06-04T00:00:00Z'));
  });
});

describe('W62 reportability crossings (cause-driven signature)', () => {
  it('confirm_termination crosses for EVERY tier when the cause is involuntary', () => {
    (['seller_default', 'buyer_default', 'change_in_law', 'prolonged_force_majeure'] as TerminationCause[]).forEach((cause) => {
      ALL_TIERS.forEach((t) => {
        expect(crossesIntoRegulator('confirm_termination', t, cause)).toBe(true);
      });
    });
  });

  it('confirm_termination for a no_fault mutual termination crosses only for large tiers', () => {
    expect(crossesIntoRegulator('confirm_termination', 'minor', 'no_fault')).toBe(false);
    expect(crossesIntoRegulator('confirm_termination', 'moderate', 'no_fault')).toBe(false);
    expect(crossesIntoRegulator('confirm_termination', 'material', 'no_fault')).toBe(false);
    expect(crossesIntoRegulator('confirm_termination', 'major', 'no_fault')).toBe(true);
    expect(crossesIntoRegulator('confirm_termination', 'critical', 'no_fault')).toBe(true);
  });

  it('confirm_settlement crosses for large tiers only (regardless of cause)', () => {
    ALL_CAUSES.forEach((cause) => {
      expect(crossesIntoRegulator('confirm_settlement', 'critical', cause)).toBe(true);
      expect(crossesIntoRegulator('confirm_settlement', 'major', cause)).toBe(true);
      expect(crossesIntoRegulator('confirm_settlement', 'material', cause)).toBe(false);
      expect(crossesIntoRegulator('confirm_settlement', 'minor', cause)).toBe(false);
    });
  });

  it('routine actions never cross', () => {
    (['serve_notice', 'open_cure', 'confirm_cure', 'escalate_review', 'open_eta_assessment', 'agree_eta', 'dispute_eta', 'resolve_dispute', 'initiate_settlement', 'withdraw'] as PpaTerminationAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => {
        ALL_CAUSES.forEach((cause) => {
          expect(crossesIntoRegulator(a, t, cause)).toBe(false);
        });
      });
    });
  });

  it('sla_breach crosses for large tiers; isReportable tracks cause OR large tier', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    // reportable on involuntary cause alone, even for a small buy-out
    expect(isReportable('minor', 'seller_default')).toBe(true);
    expect(isReportable('minor', 'change_in_law')).toBe(true);
    // reportable on size alone, even for a no_fault mutual termination
    expect(isReportable('major', 'no_fault')).toBe(true);
    // small no_fault termination is not reportable
    expect(isReportable('minor', 'no_fault')).toBe(false);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
  });
});

describe('W62 cause classification and ETA basis', () => {
  it('classifies involuntary vs voluntary causes', () => {
    expect(isInvoluntaryCause('seller_default')).toBe(true);
    expect(isInvoluntaryCause('buyer_default')).toBe(true);
    expect(isInvoluntaryCause('change_in_law')).toBe(true);
    expect(isInvoluntaryCause('prolonged_force_majeure')).toBe(true);
    expect(isInvoluntaryCause('no_fault')).toBe(false);
  });

  it('maps each cause to its buy-out basis', () => {
    expect(etaBasisForCause('seller_default')).toBe('debt_only');
    expect(etaBasisForCause('prolonged_force_majeure')).toBe('debt_only');
    expect(etaBasisForCause('buyer_default')).toBe('debt_plus_equity');
    expect(etaBasisForCause('change_in_law')).toBe('debt_plus_equity');
    expect(etaBasisForCause('no_fault')).toBe('negotiated');
  });
});

describe('W62 two-party split-write attribution', () => {
  it('the counterparty (seller / IPP) can only dispute the calculated buy-out', () => {
    expect(partyForAction('dispute_eta')).toBe('counterparty');
    expect(isCounterpartyAction('dispute_eta')).toBe(true);
    expect(isCounterpartyAction('serve_notice')).toBe(false);
    expect(isCounterpartyAction('confirm_settlement')).toBe(false);
  });

  it('the offtaker side drives the termination machinery', () => {
    (['serve_notice', 'open_cure', 'confirm_cure', 'escalate_review', 'confirm_termination', 'open_eta_assessment', 'agree_eta', 'initiate_settlement', 'confirm_settlement', 'withdraw'] as PpaTerminationAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('offtaker');
    });
  });

  it('resolve_dispute records an independent expert determination', () => {
    expect(partyForAction('resolve_dispute')).toBe('independent');
  });

  it('every action has a party', () => {
    (Object.keys(TRANSITIONS) as PpaTerminationAction[]).forEach((a) => {
      expect(partyForAction(a)).toBeDefined();
    });
  });
});

describe('W62 tier classification by buy-out size', () => {
  it('buckets the early-termination amount (ZAR m) into the right tier', () => {
    expect(tierForBuyoutZarM(0)).toBe('minor');
    expect(tierForBuyoutZarM(49.99)).toBe('minor');
    expect(tierForBuyoutZarM(50)).toBe('moderate');
    expect(tierForBuyoutZarM(250)).toBe('material');
    expect(tierForBuyoutZarM(1000)).toBe('major');
    expect(tierForBuyoutZarM(5000)).toBe('critical');
    expect(tierForBuyoutZarM(20000)).toBe('critical');
  });
});
