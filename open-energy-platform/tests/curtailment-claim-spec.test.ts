import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, isResolutionAction, partyForAction, isSellerAction,
  type CurtailmentStatus, type CurtailmentTier,
} from '../src/utils/curtailment-claim-spec';

describe('W46 curtailment / deemed-energy chain — state machine', () => {
  it('happy path: logged→classify→prepared→submitted→validation→quantum→agreed→settled', () => {
    let s: CurtailmentStatus = 'curtailment_logged';
    s = nextStatus(s, 'begin_classification')!; expect(s).toBe('classification_review');
    s = nextStatus(s, 'confirm_compensable')!;   expect(s).toBe('claim_prepared');
    s = nextStatus(s, 'submit_claim')!;          expect(s).toBe('claim_submitted');
    s = nextStatus(s, 'begin_validation')!;      expect(s).toBe('validation_underway');
    s = nextStatus(s, 'propose_quantum')!;       expect(s).toBe('quantum_proposed');
    s = nextStatus(s, 'agree_quantum')!;         expect(s).toBe('quantum_agreed');
    s = nextStatus(s, 'settle_compensation')!;   expect(s).toBe('compensation_settled');
    expect(isTerminal('compensation_settled')).toBe(true);
  });

  it('classification gate: non_compensable reachable from classification_review', () => {
    expect(nextStatus('classification_review', 'reject_non_compensable')).toBe('non_compensable');
    expect(isTerminal('non_compensable')).toBe(true);
  });

  it('dispute reachable from quantum_proposed and quantum_agreed', () => {
    expect(nextStatus('quantum_proposed', 'dispute')).toBe('disputed');
    expect(nextStatus('quantum_agreed', 'dispute')).toBe('disputed');
    expect(isTerminal('disputed')).toBe(false);
  });

  it('dispute resolves by recalculate (re-loop) or arbitration referral', () => {
    expect(nextStatus('disputed', 'recalculate')).toBe('quantum_proposed');
    expect(nextStatus('disputed', 'refer_arbitration')).toBe('arbitrated');
    expect(isTerminal('arbitrated')).toBe(true);
  });

  it('seller can withdraw from any active state', () => {
    for (const s of [
      'curtailment_logged', 'classification_review', 'claim_prepared', 'claim_submitted',
      'validation_underway', 'quantum_proposed', 'quantum_agreed', 'disputed',
    ] as CurtailmentStatus[]) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    }
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('compensation_settled')).toEqual([]);
    expect(allowedActions('arbitrated')).toEqual([]);
    expect(allowedActions('non_compensable')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('curtailment_logged', 'propose_quantum')).toBeNull();
    expect(nextStatus('classification_review', 'submit_claim')).toBeNull();
    expect(nextStatus('claim_prepared', 'begin_validation')).toBeNull();
    expect(nextStatus('validation_underway', 'agree_quantum')).toBeNull();
    expect(nextStatus('quantum_proposed', 'settle_compensation')).toBeNull();
    expect(nextStatus('compensation_settled', 'dispute')).toBeNull();
    expect(nextStatus('claim_submitted', 'recalculate')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'begin_classification', 'confirm_compensable', 'reject_non_compensable', 'submit_claim',
      'begin_validation', 'propose_quantum', 'agree_quantum', 'settle_compensation',
      'dispute', 'recalculate', 'refer_arbitration', 'withdraw',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('every non-terminal state is reachable as a transition target (except entry)', () => {
    const targets = new Set(Object.values(TRANSITIONS).map((t) => t.to));
    for (const s of [
      'classification_review', 'claim_prepared', 'claim_submitted', 'validation_underway',
      'quantum_proposed', 'quantum_agreed', 'disputed',
    ] as CurtailmentStatus[]) {
      expect(targets.has(s)).toBe(true);
    }
  });

  it('allowedActions for quantum_proposed offers agree / dispute', () => {
    const actions = allowedActions('quantum_proposed');
    expect(actions).toContain('agree_quantum');
    expect(actions).toContain('dispute');
    expect(actions).toContain('withdraw');
  });
});

describe('W46 curtailment / deemed-energy chain — URGENT SLA matrix', () => {
  const base = new Date('2026-03-10T09:00:00Z');
  const DAY = 24 * 60;

  it('utility_scale is tightest across every active state', () => {
    const states: CurtailmentStatus[] = [
      'curtailment_logged', 'classification_review', 'claim_prepared', 'claim_submitted',
      'validation_underway', 'quantum_proposed', 'quantum_agreed', 'disputed',
    ];
    for (const st of states) {
      expect(SLA_MINUTES[st].utility_scale).toBeLessThan(SLA_MINUTES[st].commercial);
      expect(SLA_MINUTES[st].commercial).toBeLessThan(SLA_MINUTES[st].embedded);
    }
  });

  it('validation window: utility 10d, embedded 20d', () => {
    expect(SLA_MINUTES.validation_underway.utility_scale).toBe(10 * DAY);
    expect(SLA_MINUTES.validation_underway.embedded).toBe(20 * DAY);
  });

  it('dispute window: utility 15d, embedded 30d', () => {
    expect(SLA_MINUTES.disputed.utility_scale).toBe(15 * DAY);
    expect(SLA_MINUTES.disputed.embedded).toBe(30 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('validation_underway', 'utility_scale', base);
    expect(d!.getTime() - base.getTime()).toBe(10 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('compensation_settled', 'utility_scale', base)).toBeNull();
    expect(slaDeadlineFor('arbitrated', 'utility_scale', base)).toBeNull();
    expect(slaDeadlineFor('non_compensable', 'utility_scale', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'utility_scale', base)).toBeNull();
  });
});

describe('W46 curtailment / deemed-energy chain — reportability / regulator crossings', () => {
  const tiers: CurtailmentTier[] = ['utility_scale', 'commercial', 'embedded'];

  it('refer_arbitration crosses for EVERY tier (universal hard line)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('refer_arbitration', t)).toBe(true);
    }
  });

  it('reject_non_compensable + settle_compensation cross for utility + commercial only', () => {
    expect(crossesIntoRegulator('reject_non_compensable', 'utility_scale')).toBe(true);
    expect(crossesIntoRegulator('reject_non_compensable', 'commercial')).toBe(true);
    expect(crossesIntoRegulator('reject_non_compensable', 'embedded')).toBe(false);
    expect(crossesIntoRegulator('settle_compensation', 'utility_scale')).toBe(true);
    expect(crossesIntoRegulator('settle_compensation', 'commercial')).toBe(true);
    expect(crossesIntoRegulator('settle_compensation', 'embedded')).toBe(false);
  });

  it('routine processing actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('begin_classification', t)).toBe(false);
      expect(crossesIntoRegulator('confirm_compensable', t)).toBe(false);
      expect(crossesIntoRegulator('submit_claim', t)).toBe(false);
      expect(crossesIntoRegulator('begin_validation', t)).toBe(false);
      expect(crossesIntoRegulator('propose_quantum', t)).toBe(false);
      expect(crossesIntoRegulator('agree_quantum', t)).toBe(false);
      expect(crossesIntoRegulator('dispute', t)).toBe(false);
      expect(crossesIntoRegulator('recalculate', t)).toBe(false);
      expect(crossesIntoRegulator('withdraw', t)).toBe(false);
    }
  });

  it('sla_breach crosses utility + commercial only', () => {
    expect(slaBreachCrossesIntoRegulator('utility_scale')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('commercial')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('embedded')).toBe(false);
  });

  it('isReportableTier + isResolutionAction helpers', () => {
    expect(isReportableTier('utility_scale')).toBe(true);
    expect(isReportableTier('embedded')).toBe(false);
    expect(isResolutionAction('reject_non_compensable')).toBe(true);
    expect(isResolutionAction('settle_compensation')).toBe(true);
    expect(isResolutionAction('refer_arbitration')).toBe(true);
    expect(isResolutionAction('begin_classification')).toBe(false);
  });
});

describe('W46 curtailment / deemed-energy chain — party attribution + seller split', () => {
  it('seller submits / disputes / withdraws', () => {
    expect(partyForAction('submit_claim')).toBe('seller');
    expect(partyForAction('dispute')).toBe('seller');
    expect(partyForAction('withdraw')).toBe('seller');
  });

  it('buyer runs classification / validation / quantum / settlement', () => {
    expect(partyForAction('begin_classification')).toBe('buyer');
    expect(partyForAction('confirm_compensable')).toBe('buyer');
    expect(partyForAction('reject_non_compensable')).toBe('buyer');
    expect(partyForAction('begin_validation')).toBe('buyer');
    expect(partyForAction('propose_quantum')).toBe('buyer');
    expect(partyForAction('recalculate')).toBe('buyer');
    expect(partyForAction('agree_quantum')).toBe('buyer');
    expect(partyForAction('settle_compensation')).toBe('buyer');
  });

  it('arbitration referral is attributed to the arbiter', () => {
    expect(partyForAction('refer_arbitration')).toBe('arbiter');
  });

  it('seller-write set is exactly submit_claim / dispute / withdraw', () => {
    expect(isSellerAction('submit_claim')).toBe(true);
    expect(isSellerAction('dispute')).toBe(true);
    expect(isSellerAction('withdraw')).toBe(true);
    expect(isSellerAction('begin_classification')).toBe(false);
    expect(isSellerAction('settle_compensation')).toBe(false);
  });
});
