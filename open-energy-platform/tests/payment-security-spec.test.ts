import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForSecurityZarM,
  isLargeTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  isOfftakerAction,
  type PaymentSecurityStatus,
  type PaymentSecurityAction,
  type PaymentSecurityTier,
} from '../src/utils/payment-security-spec';

const ALL_TIERS: PaymentSecurityTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

describe('W54 payment-security state machine', () => {
  it('walks the clean path security_required → active → released', () => {
    let s: PaymentSecurityStatus = 'security_required';
    const path: PaymentSecurityAction[] = [
      'submit_instrument', 'begin_verification', 'activate', 'release',
    ];
    const expected: PaymentSecurityStatus[] = [
      'instrument_submitted', 'under_verification', 'active', 'released',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('periodic adequacy loop returns to active', () => {
    expect(nextStatus('active', 'open_adequacy_review')).toBe('adequacy_review');
    expect(nextStatus('adequacy_review', 'confirm_adequate')).toBe('active');
  });

  it('drawdown branch: active → drawdown_initiated → replenishment_pending → (re-submit) active', () => {
    expect(nextStatus('active', 'initiate_drawdown')).toBe('drawdown_initiated');
    expect(nextStatus('drawdown_initiated', 'open_replenishment')).toBe('replenishment_pending');
    expect(nextStatus('replenishment_pending', 'submit_instrument')).toBe('instrument_submitted');
    // un-replenished → forfeited
    expect(nextStatus('replenishment_pending', 'forfeit')).toBe('forfeited');
  });

  it('expiry branch: active → expiry_pending → (renew re-submit) or forfeit', () => {
    expect(nextStatus('active', 'flag_expiry')).toBe('expiry_pending');
    expect(nextStatus('expiry_pending', 'submit_instrument')).toBe('instrument_submitted');
    expect(nextStatus('expiry_pending', 'forfeit')).toBe('forfeited');
  });

  it('substitution branch: adequacy_review → require_increase → substitution_pending → (re-submit) or forfeit', () => {
    expect(nextStatus('adequacy_review', 'require_increase')).toBe('substitution_pending');
    expect(nextStatus('substitution_pending', 'submit_instrument')).toBe('instrument_submitted');
    expect(nextStatus('substitution_pending', 'forfeit')).toBe('forfeited');
  });

  it('submit_instrument is the universal re-post action from all four source states', () => {
    (['security_required', 'replenishment_pending', 'expiry_pending', 'substitution_pending'] as PaymentSecurityStatus[]).forEach((s) => {
      expect(nextStatus(s, 'submit_instrument')).toBe('instrument_submitted');
    });
    expect(nextStatus('active', 'submit_instrument')).toBeNull();
    expect(nextStatus('under_verification', 'submit_instrument')).toBeNull();
  });

  it('reject_instrument is a terminal from under_verification only', () => {
    expect(nextStatus('under_verification', 'reject_instrument')).toBe('rejected');
    expect(nextStatus('instrument_submitted', 'reject_instrument')).toBeNull();
    expect(isTerminal('rejected')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('security_required', 'activate')).toBeNull();
    expect(nextStatus('active', 'open_replenishment')).toBeNull();
    expect(nextStatus('drawdown_initiated', 'forfeit')).toBeNull();
    expect(nextStatus('instrument_submitted', 'release')).toBeNull();
    expect(nextStatus('adequacy_review', 'initiate_drawdown')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['released', 'forfeited', 'rejected'] as PaymentSecurityStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as PaymentSecurityAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out at active and adequacy_review', () => {
    expect(allowedActions('active').sort()).toEqual(
      ['open_adequacy_review', 'initiate_drawdown', 'flag_expiry', 'release'].sort(),
    );
    expect(allowedActions('adequacy_review').sort()).toEqual(
      ['confirm_adequate', 'require_increase'].sort(),
    );
    expect(allowedActions('under_verification').sort()).toEqual(
      ['activate', 'reject_instrument'].sort(),
    );
  });
});

describe('W54 URGENT SLA by secured-amount tier', () => {
  it('larger exposure = LESS time (strictly decreasing) on every graded state', () => {
    ([
      'security_required', 'instrument_submitted', 'under_verification', 'adequacy_review',
      'drawdown_initiated', 'replenishment_pending', 'expiry_pending', 'substitution_pending',
    ] as PaymentSecurityStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeLessThan(mins[i - 1]);
      }
    });
  });

  it('critical replenishment gets the tightest window; minor the loosest', () => {
    expect(slaWindowMinutes('replenishment_pending', 'critical')).toBe(2 * 24 * 60);
    expect(slaWindowMinutes('replenishment_pending', 'minor')).toBe(10 * 24 * 60);
  });

  it('active is a healthy steady state with no countdown', () => {
    ALL_TIERS.forEach((t) => expect(slaWindowMinutes('active', t)).toBe(0));
  });

  it('slaDeadlineFor is null for terminals/steady and offsets for graded states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('released', 'critical', now)).toBeNull();
    expect(slaDeadlineFor('active', 'critical', now)).toBeNull();
    expect(slaDeadlineFor('drawdown_initiated', 'critical', now))
      .toEqual(new Date('2026-05-29T00:00:00Z'));
  });
});

describe('W54 tier classification by secured amount', () => {
  it('buckets secured amounts (ZAR millions) into the right tier', () => {
    expect(tierForSecurityZarM(5)).toBe('minor');
    expect(tierForSecurityZarM(9.9)).toBe('minor');
    expect(tierForSecurityZarM(10)).toBe('moderate');
    expect(tierForSecurityZarM(49.9)).toBe('moderate');
    expect(tierForSecurityZarM(50)).toBe('material');
    expect(tierForSecurityZarM(199)).toBe('material');
    expect(tierForSecurityZarM(200)).toBe('major');
    expect(tierForSecurityZarM(999)).toBe('major');
    expect(tierForSecurityZarM(1000)).toBe('critical');
    expect(tierForSecurityZarM(5000)).toBe('critical');
  });
});

describe('W54 reportability crossings', () => {
  it('forfeit crosses for EVERY tier (the W54 signature)', () => {
    ALL_TIERS.forEach((t) => expect(crossesIntoRegulator('forfeit', t)).toBe(true));
  });

  it('initiate_drawdown + reject_instrument cross for the large tiers only', () => {
    (['initiate_drawdown', 'reject_instrument'] as PaymentSecurityAction[]).forEach((a) => {
      expect(crossesIntoRegulator(a, 'major')).toBe(true);
      expect(crossesIntoRegulator(a, 'critical')).toBe(true);
      expect(crossesIntoRegulator(a, 'material')).toBe(false);
      expect(crossesIntoRegulator(a, 'moderate')).toBe(false);
      expect(crossesIntoRegulator(a, 'minor')).toBe(false);
    });
  });

  it('routine lifecycle actions never cross', () => {
    (['submit_instrument', 'begin_verification', 'activate', 'open_adequacy_review',
      'confirm_adequate', 'require_increase', 'open_replenishment', 'flag_expiry', 'release'] as PaymentSecurityAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla breach + isLargeTier track major + critical', () => {
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W54 two-party write attribution', () => {
  it('offtaker posts / re-posts the instrument', () => {
    expect(partyForAction('submit_instrument')).toBe('offtaker');
    expect(isOfftakerAction('submit_instrument')).toBe(true);
  });

  it('seller administers verification / adequacy / drawdown / forfeit / release', () => {
    (['begin_verification', 'activate', 'reject_instrument', 'open_adequacy_review',
      'confirm_adequate', 'require_increase', 'initiate_drawdown', 'open_replenishment',
      'flag_expiry', 'forfeit', 'release'] as PaymentSecurityAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('seller');
      expect(isOfftakerAction(a)).toBe(false);
    });
  });

  it('every action has a party', () => {
    (Object.keys(TRANSITIONS) as PaymentSecurityAction[]).forEach((a) => {
      expect(partyForAction(a)).toBeDefined();
    });
  });
});
