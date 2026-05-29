import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isCancellable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForNotionalZar,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, isReportable, partyForAction,
  type AllocationStatus, type AllocationTier, type AllocationAction,
} from '../src/utils/trade-allocation-spec';

describe('W76 trade allocation, give-up & confirmation/affirmation chain — state machine', () => {
  it('full institutional path: executed→…→settled (with give-up leg)', () => {
    let s: AllocationStatus = 'executed';
    s = nextStatus(s, 'prepare_allocation')!;  expect(s).toBe('allocation_pending');
    s = nextStatus(s, 'allocate_block')!;       expect(s).toBe('allocated');
    s = nextStatus(s, 'designate_give_up')!;    expect(s).toBe('give_up_pending');
    s = nextStatus(s, 'accept_give_up')!;       expect(s).toBe('give_up_accepted');
    s = nextStatus(s, 'issue_confirmation')!;   expect(s).toBe('confirmation_issued');
    s = nextStatus(s, 'affirm_confirmation')!;  expect(s).toBe('affirmed');
    s = nextStatus(s, 'match_trade')!;          expect(s).toBe('matched');
    s = nextStatus(s, 'instruct_settlement')!;  expect(s).toBe('settlement_instructed');
    s = nextStatus(s, 'settle_trade')!;         expect(s).toBe('settled');
    expect(isTerminal('settled')).toBe(true);
  });

  it('self-cleared trade skips the give-up leg: allocated→confirmation_issued', () => {
    expect(nextStatus('allocated', 'issue_confirmation')).toBe('confirmation_issued');
    expect(nextStatus('give_up_accepted', 'issue_confirmation')).toBe('confirmation_issued');
  });

  it('break can be flagged from any processing step and resolves back to confirmation', () => {
    const breakable: AllocationStatus[] = [
      'allocated', 'give_up_pending', 'give_up_accepted', 'confirmation_issued',
      'affirmed', 'matched', 'settlement_instructed',
    ];
    for (const st of breakable) {
      expect(nextStatus(st, 'flag_break')).toBe('break_review');
    }
    expect(nextStatus('break_review', 'resolve_break')).toBe('confirmation_issued');
    expect(nextStatus('break_review', 'issue_confirmation')).toBe('confirmation_issued');
  });

  it('break cannot be flagged from pre-allocation or terminal states', () => {
    expect(nextStatus('executed', 'flag_break')).toBeNull();
    expect(nextStatus('allocation_pending', 'flag_break')).toBeNull();
    expect(nextStatus('settled', 'flag_break')).toBeNull();
    expect(nextStatus('cancelled', 'flag_break')).toBeNull();
  });

  it('cancel reachable from pre-affirmation states and break_review; NOT after affirmed', () => {
    expect(nextStatus('executed', 'cancel_trade')).toBe('cancelled');
    expect(nextStatus('allocated', 'cancel_trade')).toBe('cancelled');
    expect(nextStatus('confirmation_issued', 'cancel_trade')).toBe('cancelled');
    expect(nextStatus('break_review', 'cancel_trade')).toBe('cancelled');
    expect(nextStatus('affirmed', 'cancel_trade')).toBeNull();
    expect(nextStatus('matched', 'cancel_trade')).toBeNull();
    expect(nextStatus('settlement_instructed', 'cancel_trade')).toBeNull();
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('isCancellable matches the cancellable set', () => {
    expect(isCancellable('executed')).toBe(true);
    expect(isCancellable('confirmation_issued')).toBe(true);
    expect(isCancellable('break_review')).toBe(true);
    expect(isCancellable('affirmed')).toBe(false);
    expect(isCancellable('matched')).toBe(false);
    expect(isCancellable('settled')).toBe(false);
    expect(isCancellable('cancelled')).toBe(false);
  });

  it('both terminals accept no further transitions', () => {
    expect(allowedActions('settled')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('allocated fans out to give-up, direct confirmation, break and cancel', () => {
    const acts = allowedActions('allocated');
    expect(acts).toContain('designate_give_up');
    expect(acts).toContain('issue_confirmation');
    expect(acts).toContain('flag_break');
    expect(acts).toContain('cancel_trade');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('executed', 'allocate_block')).toBeNull();
    expect(nextStatus('allocation_pending', 'issue_confirmation')).toBeNull();
    expect(nextStatus('confirmation_issued', 'match_trade')).toBeNull();
    expect(nextStatus('affirmed', 'instruct_settlement')).toBeNull();
    expect(nextStatus('matched', 'settle_trade')).toBeNull();
    expect(nextStatus('settled', 'settle_trade')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: AllocationAction[] = [
      'prepare_allocation', 'allocate_block', 'designate_give_up', 'accept_give_up',
      'issue_confirmation', 'affirm_confirmation', 'match_trade', 'instruct_settlement',
      'settle_trade', 'flag_break', 'resolve_break', 'cancel_trade',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W76 trade allocation chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('block is the TIGHTEST window at every graded stage; micro the longest', () => {
    const graded: AllocationStatus[] = [
      'executed', 'allocation_pending', 'allocated', 'give_up_pending', 'give_up_accepted',
      'confirmation_issued', 'affirmed', 'matched', 'settlement_instructed', 'break_review',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].block).toBeLessThan(SLA_MINUTES[st].large);
      expect(SLA_MINUTES[st].large).toBeLessThan(SLA_MINUTES[st].medium);
      expect(SLA_MINUTES[st].medium).toBeLessThan(SLA_MINUTES[st].small);
      expect(SLA_MINUTES[st].small).toBeLessThan(SLA_MINUTES[st].micro);
    }
  });

  it('affirmed is the tightest match window: micro 12h, block 45m', () => {
    expect(SLA_MINUTES.affirmed.micro).toBe(12 * HOUR);
    expect(SLA_MINUTES.affirmed.block).toBe(45);
  });

  it('confirmation_issued: micro 24h, block 60m (same-day-affirmation discipline)', () => {
    expect(SLA_MINUTES.confirmation_issued.micro).toBe(24 * HOUR);
    expect(SLA_MINUTES.confirmation_issued.block).toBe(60);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('executed', 'micro', base);
    expect(d!.getTime() - base.getTime()).toBe(3 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('allocated', 'micro')).toBe(2 * DAY);
    expect(slaWindowMinutes('settled', 'block')).toBe(0);
  });

  it('both terminals return null deadline', () => {
    expect(slaDeadlineFor('settled', 'block', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'block', base)).toBeNull();
  });
});

describe('W76 trade allocation chain — notional tiering', () => {
  it('tierForNotionalZar boundaries', () => {
    expect(tierForNotionalZar(0)).toBe('micro');
    expect(tierForNotionalZar(999999)).toBe('micro');
    expect(tierForNotionalZar(1000000)).toBe('small');
    expect(tierForNotionalZar(9999999)).toBe('small');
    expect(tierForNotionalZar(10000000)).toBe('medium');
    expect(tierForNotionalZar(49999999)).toBe('medium');
    expect(tierForNotionalZar(50000000)).toBe('large');
    expect(tierForNotionalZar(249999999)).toBe('large');
    expect(tierForNotionalZar(250000000)).toBe('block');
    expect(tierForNotionalZar(5000000000)).toBe('block');
  });

  it('isLargeTier — large + block only', () => {
    expect(isLargeTier('block')).toBe(true);
    expect(isLargeTier('large')).toBe(true);
    expect(isLargeTier('medium')).toBe(false);
    expect(isLargeTier('small')).toBe(false);
    expect(isLargeTier('micro')).toBe(false);
  });

  it('isReportable — large + block only', () => {
    expect(isReportable('block')).toBe(true);
    expect(isReportable('large')).toBe(true);
    expect(isReportable('medium')).toBe(false);
    expect(isReportable('micro')).toBe(false);
  });
});

describe('W76 trade allocation chain — reportability (the signature)', () => {
  const tiers: AllocationTier[] = ['micro', 'small', 'medium', 'large', 'block'];

  it('flag_break crosses for EVERY tier (the signature — every break is notifiable)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('flag_break', t)).toBe(true);
    }
  });

  it('cancel_trade crosses for the LARGE tiers only (large + block)', () => {
    expect(crossesIntoRegulator('cancel_trade', 'block')).toBe(true);
    expect(crossesIntoRegulator('cancel_trade', 'large')).toBe(true);
    expect(crossesIntoRegulator('cancel_trade', 'medium')).toBe(false);
    expect(crossesIntoRegulator('cancel_trade', 'small')).toBe(false);
    expect(crossesIntoRegulator('cancel_trade', 'micro')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: AllocationAction[] = [
      'prepare_allocation', 'allocate_block', 'designate_give_up', 'accept_give_up',
      'issue_confirmation', 'affirm_confirmation', 'match_trade', 'instruct_settlement',
      'settle_trade', 'resolve_break',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the LARGE tiers only (large + block)', () => {
    expect(slaBreachCrossesIntoRegulator('block')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('micro')).toBe(false);
  });
});

describe('W76 trade allocation chain — party attribution', () => {
  it('the trade-processing desk drives the machinery (middle office)', () => {
    expect(partyForAction('prepare_allocation')).toBe('middle_office');
    expect(partyForAction('allocate_block')).toBe('middle_office');
    expect(partyForAction('designate_give_up')).toBe('middle_office');
    expect(partyForAction('issue_confirmation')).toBe('middle_office');
    expect(partyForAction('match_trade')).toBe('middle_office');
    expect(partyForAction('instruct_settlement')).toBe('middle_office');
    expect(partyForAction('settle_trade')).toBe('middle_office');
    expect(partyForAction('flag_break')).toBe('middle_office');
    expect(partyForAction('resolve_break')).toBe('middle_office');
  });

  it('counterparty affirms the confirmation and accepts the give-up', () => {
    expect(partyForAction('affirm_confirmation')).toBe('counterparty');
    expect(partyForAction('accept_give_up')).toBe('counterparty');
  });

  it('cancel is a front-office action', () => {
    expect(partyForAction('cancel_trade')).toBe('front_office');
  });
});
