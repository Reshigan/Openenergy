import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForContractedVolume, requiresCorrespondingAdjustment,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, isReportable, partyForAction,
  type ErpaStatus, type ErpaTier, type ErpaAction,
} from '../src/utils/carbon-erpa-spec';

describe('W65 carbon ERPA forward-delivery chain — state machine', () => {
  it('happy path: drafted→executed→scheduled→initiated→verified→settled→completed', () => {
    let s: ErpaStatus = 'erpa_drafted';
    s = nextStatus(s, 'execute_erpa')!;      expect(s).toBe('erpa_executed');
    s = nextStatus(s, 'schedule_delivery')!; expect(s).toBe('delivery_scheduled');
    s = nextStatus(s, 'initiate_delivery')!; expect(s).toBe('delivery_initiated');
    s = nextStatus(s, 'verify_delivery')!;   expect(s).toBe('delivery_verified');
    s = nextStatus(s, 'settle')!;            expect(s).toBe('settled');
    s = nextStatus(s, 'complete')!;          expect(s).toBe('completed');
    expect(isTerminal('completed')).toBe(true);
  });

  it('shortfall / make-good branch: initiated→shortfall→make_good→(re-deliver)→initiated', () => {
    expect(nextStatus('delivery_initiated', 'flag_shortfall')).toBe('shortfall_flagged');
    expect(nextStatus('shortfall_flagged', 'initiate_make_good')).toBe('make_good_pending');
    expect(nextStatus('make_good_pending', 'initiate_delivery')).toBe('delivery_initiated');
  });

  it('initiate_delivery re-enters from both delivery_scheduled and make_good_pending', () => {
    expect(nextStatus('delivery_scheduled', 'initiate_delivery')).toBe('delivery_initiated');
    expect(nextStatus('make_good_pending', 'initiate_delivery')).toBe('delivery_initiated');
  });

  it('settle reachable from verified, shortfall and make_good_pending', () => {
    expect(nextStatus('delivery_verified', 'settle')).toBe('settled');
    expect(nextStatus('shortfall_flagged', 'settle')).toBe('settled');
    expect(nextStatus('make_good_pending', 'settle')).toBe('settled');
    expect(nextStatus('delivery_scheduled', 'settle')).toBeNull();
  });

  it('dispute branch: verified|settled→disputed→(resolve)→settled', () => {
    expect(nextStatus('delivery_verified', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('settled', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('settled');
  });

  it('resolve_dispute lands back in settled (shared .settled event downstream)', () => {
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('settled');
  });

  it('complete reachable only from settled', () => {
    expect(nextStatus('settled', 'complete')).toBe('completed');
    expect(nextStatus('delivery_verified', 'complete')).toBeNull();
    expect(nextStatus('disputed', 'complete')).toBeNull();
    expect(isTerminal('completed')).toBe(true);
  });

  it('terminate reachable from every executed/active state, not from drafted', () => {
    const terminable: ErpaStatus[] = [
      'erpa_executed', 'delivery_scheduled', 'delivery_initiated', 'delivery_verified',
      'shortfall_flagged', 'make_good_pending', 'disputed',
    ];
    for (const st of terminable) {
      expect(nextStatus(st, 'terminate')).toBe('terminated');
    }
    expect(nextStatus('erpa_drafted', 'terminate')).toBeNull();
    expect(nextStatus('settled', 'terminate')).toBeNull();
    expect(isTerminal('terminated')).toBe(true);
  });

  it('withdraw reachable only from pre-performance states (drafted, executed)', () => {
    expect(nextStatus('erpa_drafted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('erpa_executed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('delivery_scheduled', 'withdraw')).toBeNull();
    expect(nextStatus('delivery_initiated', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the pre-performance set', () => {
    expect(isWithdrawable('erpa_drafted')).toBe(true);
    expect(isWithdrawable('erpa_executed')).toBe(true);
    expect(isWithdrawable('delivery_scheduled')).toBe(false);
    expect(isWithdrawable('settled')).toBe(false);
    expect(isWithdrawable('completed')).toBe(false);
  });

  it('all three terminals accept no further transitions', () => {
    expect(allowedActions('completed')).toEqual([]);
    expect(allowedActions('terminated')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('delivery_initiated fans out to verify / flag_shortfall / terminate', () => {
    const acts = allowedActions('delivery_initiated');
    expect(acts).toContain('verify_delivery');
    expect(acts).toContain('flag_shortfall');
    expect(acts).toContain('terminate');
    expect(acts).not.toContain('settle');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('erpa_drafted', 'schedule_delivery')).toBeNull();
    expect(nextStatus('erpa_executed', 'initiate_delivery')).toBeNull();
    expect(nextStatus('delivery_scheduled', 'verify_delivery')).toBeNull();
    expect(nextStatus('delivery_initiated', 'settle')).toBeNull();
    expect(nextStatus('completed', 'complete')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: ErpaAction[] = [
      'execute_erpa', 'schedule_delivery', 'initiate_delivery', 'verify_delivery',
      'flag_shortfall', 'initiate_make_good', 'settle', 'complete',
      'raise_dispute', 'resolve_dispute', 'terminate', 'withdraw',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W65 carbon ERPA forward-delivery chain — INVERTED SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const DAY = 24 * 60;

  it('mega is the LONGEST window at every active stage; minor the shortest', () => {
    const active: ErpaStatus[] = [
      'erpa_drafted', 'erpa_executed', 'delivery_scheduled', 'delivery_initiated',
      'delivery_verified', 'shortfall_flagged', 'make_good_pending', 'settled', 'disputed',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].mega).toBeGreaterThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeGreaterThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeGreaterThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeGreaterThan(SLA_MINUTES[st].minor);
    }
  });

  it('delivery_scheduled: mega 120d, minor 30d', () => {
    expect(SLA_MINUTES.delivery_scheduled.mega).toBe(120 * DAY);
    expect(SLA_MINUTES.delivery_scheduled.minor).toBe(30 * DAY);
  });

  it('delivery_initiated: mega 30d, minor 7d', () => {
    expect(SLA_MINUTES.delivery_initiated.mega).toBe(30 * DAY);
    expect(SLA_MINUTES.delivery_initiated.minor).toBe(7 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('make_good_pending', 'mega', base);
    expect(d!.getTime() - base.getTime()).toBe(120 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('delivery_initiated', 'minor')).toBe(7 * DAY);
    expect(slaWindowMinutes('completed', 'mega')).toBe(0);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('completed', 'mega', base)).toBeNull();
    expect(slaDeadlineFor('terminated', 'mega', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'mega', base)).toBeNull();
  });
});

describe('W65 carbon ERPA forward-delivery chain — contracted-volume tiering', () => {
  it('tierForContractedVolume boundaries', () => {
    expect(tierForContractedVolume(0)).toBe('minor');
    expect(tierForContractedVolume(9999)).toBe('minor');
    expect(tierForContractedVolume(10000)).toBe('moderate');
    expect(tierForContractedVolume(99999)).toBe('moderate');
    expect(tierForContractedVolume(100000)).toBe('material');
    expect(tierForContractedVolume(499999)).toBe('material');
    expect(tierForContractedVolume(500000)).toBe('major');
    expect(tierForContractedVolume(1999999)).toBe('major');
    expect(tierForContractedVolume(2000000)).toBe('mega');
    expect(tierForContractedVolume(5000000)).toBe('mega');
  });

  it('isLargeTier — major + mega only', () => {
    expect(isLargeTier('mega')).toBe(true);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W65 carbon ERPA forward-delivery chain — corresponding adjustment', () => {
  it('only article6 transfers require a corresponding adjustment', () => {
    expect(requiresCorrespondingAdjustment('article6')).toBe(true);
    expect(requiresCorrespondingAdjustment('voluntary')).toBe(false);
    expect(requiresCorrespondingAdjustment('compliance')).toBe(false);
  });
});

describe('W65 carbon ERPA forward-delivery chain — reportability (the signature)', () => {
  const tiers: ErpaTier[] = ['minor', 'moderate', 'material', 'major', 'mega'];

  it('verify_delivery crosses for EVERY tier when the transfer requires a corresponding adjustment (the signature)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('verify_delivery', t, true)).toBe(true);
    }
  });

  it('verify_delivery crosses only for large tiers when no corresponding adjustment', () => {
    expect(crossesIntoRegulator('verify_delivery', 'mega', false)).toBe(true);
    expect(crossesIntoRegulator('verify_delivery', 'major', false)).toBe(true);
    expect(crossesIntoRegulator('verify_delivery', 'material', false)).toBe(false);
    expect(crossesIntoRegulator('verify_delivery', 'moderate', false)).toBe(false);
    expect(crossesIntoRegulator('verify_delivery', 'minor', false)).toBe(false);
  });

  it('terminate crosses for the large tiers only (major + mega)', () => {
    expect(crossesIntoRegulator('terminate', 'mega')).toBe(true);
    expect(crossesIntoRegulator('terminate', 'major')).toBe(true);
    expect(crossesIntoRegulator('terminate', 'material')).toBe(false);
    expect(crossesIntoRegulator('terminate', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('terminate', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: ErpaAction[] = [
      'execute_erpa', 'schedule_delivery', 'initiate_delivery', 'flag_shortfall',
      'initiate_make_good', 'settle', 'complete', 'raise_dispute', 'resolve_dispute', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t, true)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the large tiers only (major + mega)', () => {
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });

  it('isReportable — true when corresponding adjustment OR large tier', () => {
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('mega', false)).toBe(true);
    expect(isReportable('major', false)).toBe(true);
    expect(isReportable('material', false)).toBe(false);
    expect(isReportable('minor', false)).toBe(false);
  });
});

describe('W65 carbon ERPA forward-delivery chain — party attribution', () => {
  it('seller owns drafting / scheduling / delivery / make-good / termination / withdrawal', () => {
    expect(partyForAction('execute_erpa')).toBe('seller');
    expect(partyForAction('schedule_delivery')).toBe('seller');
    expect(partyForAction('initiate_delivery')).toBe('seller');
    expect(partyForAction('initiate_make_good')).toBe('seller');
    expect(partyForAction('terminate')).toBe('seller');
    expect(partyForAction('withdraw')).toBe('seller');
  });

  it('buyer owns verification / shortfall flag / settlement / dispute', () => {
    expect(partyForAction('verify_delivery')).toBe('buyer');
    expect(partyForAction('flag_shortfall')).toBe('buyer');
    expect(partyForAction('settle')).toBe('buyer');
    expect(partyForAction('raise_dispute')).toBe('buyer');
  });

  it('registry owns dispute resolution and closing a fully-performed ERPA', () => {
    expect(partyForAction('resolve_dispute')).toBe('registry');
    expect(partyForAction('complete')).toBe('registry');
  });
});
