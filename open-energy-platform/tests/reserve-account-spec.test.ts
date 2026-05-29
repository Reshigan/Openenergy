import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isCancellable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForTargetZar,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, isReportable, partyForAction,
  type ReserveStatus, type ReserveTier, type ReserveAction,
} from '../src/utils/reserve-account-spec';

describe('W77 reserve-account funding/cure/release chain — state machine', () => {
  it('healthy life: reserve_required→…→funded→release_requested→released', () => {
    let s: ReserveStatus = 'reserve_required';
    s = nextStatus(s, 'schedule_funding')!;  expect(s).toBe('funding_scheduled');
    s = nextStatus(s, 'commence_funding')!;   expect(s).toBe('funding_in_progress');
    s = nextStatus(s, 'confirm_funding')!;    expect(s).toBe('funded');
    s = nextStatus(s, 'request_release')!;    expect(s).toBe('release_requested');
    s = nextStatus(s, 'release_reserve')!;    expect(s).toBe('released');
    expect(isTerminal('released')).toBe(true);
  });

  it('shortfall branch: funded→shortfall_flagged→cure_pending→(replenish) funded', () => {
    expect(nextStatus('funded', 'flag_shortfall')).toBe('shortfall_flagged');
    expect(nextStatus('shortfall_flagged', 'open_cure')).toBe('cure_pending');
    expect(nextStatus('cure_pending', 'replenish_reserve')).toBe('funded');
  });

  it('cure period can be waived or breached', () => {
    expect(nextStatus('cure_pending', 'waive_requirement')).toBe('funded');
    expect(nextStatus('cure_pending', 'declare_breach')).toBe('breached');
    expect(isTerminal('breached')).toBe(true);
  });

  it('authorised-draw branch: funded→drawdown_authorized→drawn→(replenish) funded', () => {
    expect(nextStatus('funded', 'authorize_drawdown')).toBe('drawdown_authorized');
    expect(nextStatus('drawdown_authorized', 'execute_drawdown')).toBe('drawn');
    expect(nextStatus('drawn', 'replenish_reserve')).toBe('funded');
  });

  it('a draw may be authorised straight out of a flagged shortfall', () => {
    expect(nextStatus('shortfall_flagged', 'authorize_drawdown')).toBe('drawdown_authorized');
  });

  it('drawn can be waived or breached (replenishment failure is a default)', () => {
    expect(nextStatus('drawn', 'waive_requirement')).toBe('funded');
    expect(nextStatus('drawn', 'declare_breach')).toBe('breached');
  });

  it('cancel reachable only before funding', () => {
    expect(nextStatus('reserve_required', 'cancel_reserve')).toBe('cancelled');
    expect(nextStatus('funding_scheduled', 'cancel_reserve')).toBe('cancelled');
    expect(nextStatus('funding_in_progress', 'cancel_reserve')).toBe('cancelled');
    expect(nextStatus('funded', 'cancel_reserve')).toBeNull();
    expect(nextStatus('drawn', 'cancel_reserve')).toBeNull();
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('isCancellable matches the cancellable set', () => {
    expect(isCancellable('reserve_required')).toBe(true);
    expect(isCancellable('funding_scheduled')).toBe(true);
    expect(isCancellable('funding_in_progress')).toBe(true);
    expect(isCancellable('funded')).toBe(false);
    expect(isCancellable('cure_pending')).toBe(false);
    expect(isCancellable('released')).toBe(false);
  });

  it('all three terminals accept no further transitions', () => {
    expect(allowedActions('released')).toEqual([]);
    expect(allowedActions('breached')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('funded fans out to shortfall, draw, release', () => {
    const acts = allowedActions('funded');
    expect(acts).toContain('flag_shortfall');
    expect(acts).toContain('authorize_drawdown');
    expect(acts).toContain('request_release');
  });

  it('cure_pending and drawn share the same three outcomes', () => {
    for (const st of ['cure_pending', 'drawn'] as ReserveStatus[]) {
      const acts = allowedActions(st);
      expect(acts).toContain('replenish_reserve');
      expect(acts).toContain('waive_requirement');
      expect(acts).toContain('declare_breach');
    }
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('reserve_required', 'confirm_funding')).toBeNull();
    expect(nextStatus('funding_scheduled', 'flag_shortfall')).toBeNull();
    expect(nextStatus('funded', 'execute_drawdown')).toBeNull();
    expect(nextStatus('shortfall_flagged', 'replenish_reserve')).toBeNull();
    expect(nextStatus('release_requested', 'replenish_reserve')).toBeNull();
    expect(nextStatus('released', 'request_release')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: ReserveAction[] = [
      'schedule_funding', 'commence_funding', 'confirm_funding', 'flag_shortfall',
      'open_cure', 'authorize_drawdown', 'execute_drawdown', 'replenish_reserve',
      'waive_requirement', 'declare_breach', 'request_release', 'release_reserve',
      'cancel_reserve',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W77 reserve-account chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('systemic is the TIGHTEST window at every graded stage; small the longest', () => {
    const graded: ReserveStatus[] = [
      'reserve_required', 'funding_scheduled', 'funding_in_progress',
      'shortfall_flagged', 'cure_pending', 'drawdown_authorized', 'drawn',
      'release_requested',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].systemic).toBeLessThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeLessThan(SLA_MINUTES[st].large);
      expect(SLA_MINUTES[st].large).toBeLessThan(SLA_MINUTES[st].medium);
      expect(SLA_MINUTES[st].medium).toBeLessThan(SLA_MINUTES[st].small);
    }
  });

  it('the healthy steady state funded carries no deadline (not swept)', () => {
    expect(SLA_MINUTES.funded.small).toBe(0);
    expect(SLA_MINUTES.funded.systemic).toBe(0);
    expect(slaDeadlineFor('funded', 'systemic', base)).toBeNull();
  });

  it('shortfall is the tightest cure-entry window: small 7d, systemic 24h', () => {
    expect(SLA_MINUTES.shortfall_flagged.small).toBe(7 * DAY);
    expect(SLA_MINUTES.shortfall_flagged.systemic).toBe(24 * HOUR);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('reserve_required', 'small', base);
    expect(d!.getTime() - base.getTime()).toBe(30 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('cure_pending', 'small')).toBe(30 * DAY);
    expect(slaWindowMinutes('released', 'systemic')).toBe(0);
  });

  it('all three terminals return null deadline', () => {
    expect(slaDeadlineFor('released', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('breached', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'systemic', base)).toBeNull();
  });
});

describe('W77 reserve-account chain — target-amount tiering', () => {
  it('tierForTargetZar boundaries', () => {
    expect(tierForTargetZar(0)).toBe('small');
    expect(tierForTargetZar(9999999)).toBe('small');
    expect(tierForTargetZar(10000000)).toBe('medium');
    expect(tierForTargetZar(49999999)).toBe('medium');
    expect(tierForTargetZar(50000000)).toBe('large');
    expect(tierForTargetZar(249999999)).toBe('large');
    expect(tierForTargetZar(250000000)).toBe('major');
    expect(tierForTargetZar(999999999)).toBe('major');
    expect(tierForTargetZar(1000000000)).toBe('systemic');
    expect(tierForTargetZar(5000000000)).toBe('systemic');
  });

  it('isLargeTier — major + systemic only', () => {
    expect(isLargeTier('systemic')).toBe(true);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('large')).toBe(false);
    expect(isLargeTier('medium')).toBe(false);
    expect(isLargeTier('small')).toBe(false);
  });

  it('isReportable — major + systemic only', () => {
    expect(isReportable('systemic')).toBe(true);
    expect(isReportable('major')).toBe(true);
    expect(isReportable('large')).toBe(false);
    expect(isReportable('small')).toBe(false);
  });
});

describe('W77 reserve-account chain — reportability (the signature)', () => {
  const tiers: ReserveTier[] = ['small', 'medium', 'large', 'major', 'systemic'];

  it('declare_breach crosses for EVERY tier (the signature — a reserve breach is always an EoD)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('declare_breach', t)).toBe(true);
    }
  });

  it('waive_requirement crosses for the LARGE tiers only (major + systemic)', () => {
    expect(crossesIntoRegulator('waive_requirement', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('waive_requirement', 'major')).toBe(true);
    expect(crossesIntoRegulator('waive_requirement', 'large')).toBe(false);
    expect(crossesIntoRegulator('waive_requirement', 'medium')).toBe(false);
    expect(crossesIntoRegulator('waive_requirement', 'small')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: ReserveAction[] = [
      'schedule_funding', 'commence_funding', 'confirm_funding', 'flag_shortfall',
      'open_cure', 'authorize_drawdown', 'execute_drawdown', 'replenish_reserve',
      'request_release', 'release_reserve', 'cancel_reserve',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the LARGE tiers only (major + systemic)', () => {
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
  });
});

describe('W77 reserve-account chain — party attribution', () => {
  it('the agent / lender drives the machinery', () => {
    expect(partyForAction('schedule_funding')).toBe('lender');
    expect(partyForAction('flag_shortfall')).toBe('lender');
    expect(partyForAction('open_cure')).toBe('lender');
    expect(partyForAction('authorize_drawdown')).toBe('lender');
    expect(partyForAction('waive_requirement')).toBe('lender');
    expect(partyForAction('declare_breach')).toBe('lender');
    expect(partyForAction('cancel_reserve')).toBe('lender');
  });

  it('the borrower funds, replenishes and requests release', () => {
    expect(partyForAction('commence_funding')).toBe('borrower');
    expect(partyForAction('replenish_reserve')).toBe('borrower');
    expect(partyForAction('request_release')).toBe('borrower');
  });

  it('the account bank confirms balances and moves cash on draw / release', () => {
    expect(partyForAction('confirm_funding')).toBe('account_bank');
    expect(partyForAction('execute_drawdown')).toBe('account_bank');
    expect(partyForAction('release_reserve')).toBe('account_bank');
  });
});
