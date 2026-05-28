import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  isWithdrawable,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForFacilityZarM,
  isLargeExposureTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  isApplicantAction,
  type CreditFacilityStatus,
  type CreditFacilityAction,
  type CreditFacilityTier,
} from '../src/utils/credit-origination-spec';

const ALL_TIERS: CreditFacilityTier[] = ['small', 'medium', 'large', 'major', 'systemic'];

describe('W53 credit-origination state machine', () => {
  it('walks the clean path application → facility_available', () => {
    let s: CreditFacilityStatus = 'application_received';
    const path: CreditFacilityAction[] = [
      'screen', 'assess', 'refer_committee', 'approve', 'issue_agreement', 'satisfy_cp', 'activate',
    ];
    const expected: CreditFacilityStatus[] = [
      'screening', 'credit_assessment', 'committee_review', 'approved', 'agreement_issued', 'cp_satisfied', 'facility_available',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('conditional-approval loop: committee → conditions_pending → approved', () => {
    expect(nextStatus('committee_review', 'approve_with_conditions')).toBe('conditions_pending');
    expect(nextStatus('conditions_pending', 'satisfy_conditions')).toBe('approved');
    // approve and satisfy_conditions both land on approved
    expect(nextStatus('committee_review', 'approve')).toBe('approved');
  });

  it('referral loop: committee → referred_back → credit_assessment', () => {
    expect(nextStatus('committee_review', 'refer_back')).toBe('referred_back');
    expect(nextStatus('referred_back', 'assess')).toBe('credit_assessment');
  });

  it('decline is a terminal from any pre-approval review state', () => {
    (['screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending'] as CreditFacilityStatus[]).forEach((s) => {
      expect(nextStatus(s, 'decline')).toBe('declined');
    });
    expect(nextStatus('application_received', 'decline')).toBeNull();
    expect(nextStatus('approved', 'decline')).toBeNull();
    expect(isTerminal('declined')).toBe(true);
  });

  it('withdraw is available from every non-terminal pre-activation state', () => {
    (['application_received', 'screening', 'credit_assessment', 'committee_review', 'referred_back',
      'conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied'] as CreditFacilityStatus[]).forEach((s) => {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
      expect(isWithdrawable(s)).toBe(true);
    });
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('application_received', 'approve')).toBeNull();
    expect(nextStatus('screening', 'activate')).toBeNull();
    expect(nextStatus('approved', 'activate')).toBeNull();
    expect(nextStatus('credit_assessment', 'satisfy_conditions')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['facility_available', 'declined', 'withdrawn'] as CreditFacilityStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as CreditFacilityAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out at committee_review', () => {
    expect(allowedActions('committee_review').sort()).toEqual(
      ['approve', 'approve_with_conditions', 'decline', 'refer_back', 'withdraw'].sort(),
    );
    expect(allowedActions('conditions_pending').sort()).toEqual(
      ['decline', 'satisfy_conditions', 'withdraw'].sort(),
    );
  });
});

describe('W53 INVERTED SLA by facility tier', () => {
  it('bigger facility = MORE time (strictly increasing)', () => {
    ([
      'application_received', 'screening', 'credit_assessment', 'committee_review',
      'referred_back', 'conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied',
    ] as CreditFacilityStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeGreaterThan(mins[i - 1]);
      }
    });
  });

  it('systemic credit assessment gets the longest window', () => {
    expect(slaWindowMinutes('credit_assessment', 'systemic')).toBe(45 * 24 * 60);
    expect(slaWindowMinutes('credit_assessment', 'small')).toBe(10 * 24 * 60);
  });

  it('slaDeadlineFor is null for terminals and offsets for graded states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('facility_available', 'systemic', now)).toBeNull();
    expect(slaDeadlineFor('application_received', 'small', now))
      .toEqual(new Date('2026-05-30T00:00:00Z'));
  });
});

describe('W53 tier classification by facility size', () => {
  it('buckets facility limits (ZAR millions) into the right tier', () => {
    expect(tierForFacilityZarM(30)).toBe('small');
    expect(tierForFacilityZarM(49.9)).toBe('small');
    expect(tierForFacilityZarM(50)).toBe('medium');
    expect(tierForFacilityZarM(249)).toBe('medium');
    expect(tierForFacilityZarM(250)).toBe('large');
    expect(tierForFacilityZarM(999)).toBe('large');
    expect(tierForFacilityZarM(1000)).toBe('major');
    expect(tierForFacilityZarM(4999)).toBe('major');
    expect(tierForFacilityZarM(5000)).toBe('systemic');
    expect(tierForFacilityZarM(12000)).toBe('systemic');
  });
});

describe('W53 large-exposure reportability crossings', () => {
  it('activate crosses for large-exposure tiers only (the W53 signature)', () => {
    expect(crossesIntoRegulator('activate', 'major')).toBe(true);
    expect(crossesIntoRegulator('activate', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('activate', 'large')).toBe(false);
    expect(crossesIntoRegulator('activate', 'medium')).toBe(false);
    expect(crossesIntoRegulator('activate', 'small')).toBe(false);
  });

  it('decline crosses for systemic only', () => {
    expect(crossesIntoRegulator('decline', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('decline', 'major')).toBe(false);
    expect(crossesIntoRegulator('decline', 'large')).toBe(false);
  });

  it('routine origination actions never cross', () => {
    (['screen', 'assess', 'refer_committee', 'refer_back', 'approve', 'approve_with_conditions',
      'satisfy_conditions', 'issue_agreement', 'satisfy_cp', 'withdraw'] as CreditFacilityAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla_breach + large-exposure tiers track major + systemic', () => {
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(false);
    expect(isLargeExposureTier('major')).toBe(true);
    expect(isLargeExposureTier('small')).toBe(false);
  });
});

describe('W53 two-party write attribution', () => {
  it('applicant satisfies conditions / CPs and may withdraw', () => {
    (['satisfy_conditions', 'satisfy_cp', 'withdraw'] as CreditFacilityAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('applicant');
      expect(isApplicantAction(a)).toBe(true);
    });
  });

  it('lender drives screening / assessment / committee / issuance / activation / decline', () => {
    (['screen', 'assess', 'refer_committee', 'refer_back', 'approve', 'approve_with_conditions',
      'issue_agreement', 'activate', 'decline'] as CreditFacilityAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('lender');
      expect(isApplicantAction(a)).toBe(false);
    });
  });

  it('every action has a party', () => {
    (Object.keys(TRANSITIONS) as CreditFacilityAction[]).forEach((a) => {
      expect(partyForAction(a)).toBeDefined();
    });
  });
});
