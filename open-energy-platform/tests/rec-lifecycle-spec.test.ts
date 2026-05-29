import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForMwh, complianceFloor, tierForCertificate,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isHighTier, isReportable, isHolderAction, partyForAction,
  type RecStatus, type RecTier, type RecAction,
} from '../src/utils/rec-lifecycle-spec';

describe('W70 REC / guarantee-of-origin lifecycle — state machine', () => {
  it('happy path: requested→review→issued→listed→transferred→allocated→retired', () => {
    let s: RecStatus = 'issuance_requested';
    s = nextStatus(s, 'begin_eligibility_review')!; expect(s).toBe('eligibility_review');
    s = nextStatus(s, 'approve_issuance')!;          expect(s).toBe('issued');
    s = nextStatus(s, 'list_for_transfer')!;         expect(s).toBe('listed_for_transfer');
    s = nextStatus(s, 'transfer_certificate')!;      expect(s).toBe('transferred');
    s = nextStatus(s, 'allocate_consumption')!;      expect(s).toBe('allocated');
    s = nextStatus(s, 'retire_certificate')!;        expect(s).toBe('retired');
    expect(isTerminal('retired')).toBe(true);
  });

  it('eligibility review can reject a certificate', () => {
    expect(nextStatus('eligibility_review', 'reject_issuance')).toBe('rejected');
    expect(isTerminal('rejected')).toBe(true);
  });

  it('integrity dispute reachable from transferred or allocated', () => {
    expect(nextStatus('transferred', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('allocated', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('issued', 'raise_dispute')).toBeNull();
    expect(nextStatus('retired', 'raise_dispute')).toBeNull();
  });

  it('a dispute either restores to allocated (dismissed) or claws back (upheld)', () => {
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('allocated');
    expect(nextStatus('disputed', 'claw_back')).toBe('clawed_back');
    expect(isTerminal('clawed_back')).toBe(true);
  });

  it('cancellation reachable only from the pre-transfer states', () => {
    expect(nextStatus('issuance_requested', 'cancel_certificate')).toBe('cancelled');
    expect(nextStatus('issued', 'cancel_certificate')).toBe('cancelled');
    expect(nextStatus('listed_for_transfer', 'cancel_certificate')).toBe('cancelled');
    expect(nextStatus('transferred', 'cancel_certificate')).toBeNull();
    expect(nextStatus('allocated', 'cancel_certificate')).toBeNull();
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('expiry (vintage lapse) reachable from the held states', () => {
    expect(nextStatus('issued', 'expire_certificate')).toBe('expired');
    expect(nextStatus('listed_for_transfer', 'expire_certificate')).toBe('expired');
    expect(nextStatus('transferred', 'expire_certificate')).toBe('expired');
    expect(nextStatus('allocated', 'expire_certificate')).toBe('expired');
    expect(nextStatus('issuance_requested', 'expire_certificate')).toBeNull();
    expect(isTerminal('expired')).toBe(true);
  });

  it('isWithdrawable matches the pre-transfer set', () => {
    expect(isWithdrawable('issuance_requested')).toBe(true);
    expect(isWithdrawable('issued')).toBe(true);
    expect(isWithdrawable('listed_for_transfer')).toBe(true);
    expect(isWithdrawable('transferred')).toBe(false);
    expect(isWithdrawable('allocated')).toBe(false);
  });

  it('all five terminals accept no further transitions', () => {
    expect(allowedActions('retired')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
    expect(allowedActions('clawed_back')).toEqual([]);
    expect(allowedActions('expired')).toEqual([]);
  });

  it('allocated fans out to retire / dispute / expire', () => {
    const acts = allowedActions('allocated');
    expect(acts).toContain('retire_certificate');
    expect(acts).toContain('raise_dispute');
    expect(acts).toContain('expire_certificate');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('issuance_requested', 'approve_issuance')).toBeNull();
    expect(nextStatus('eligibility_review', 'list_for_transfer')).toBeNull();
    expect(nextStatus('issued', 'transfer_certificate')).toBeNull();
    expect(nextStatus('transferred', 'retire_certificate')).toBeNull();
    expect(nextStatus('retired', 'retire_certificate')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: RecAction[] = [
      'begin_eligibility_review', 'approve_issuance', 'reject_issuance', 'list_for_transfer',
      'transfer_certificate', 'allocate_consumption', 'retire_certificate', 'raise_dispute',
      'resolve_dispute', 'claw_back', 'cancel_certificate', 'expire_certificate',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W70 REC lifecycle — INVERTED SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('critical is the LONGEST window at every graded stage; minor the tightest', () => {
    const graded: RecStatus[] = [
      'issuance_requested', 'eligibility_review', 'issued', 'listed_for_transfer',
      'transferred', 'allocated', 'disputed',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].critical).toBeGreaterThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeGreaterThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeGreaterThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeGreaterThan(SLA_MINUTES[st].minor);
    }
  });

  it('eligibility review window: minor 5d, critical 30d', () => {
    expect(SLA_MINUTES.eligibility_review.minor).toBe(5 * DAY);
    expect(SLA_MINUTES.eligibility_review.critical).toBe(30 * DAY);
  });

  it('disputed window: minor 7d, critical 30d', () => {
    expect(SLA_MINUTES.disputed.minor).toBe(7 * DAY);
    expect(SLA_MINUTES.disputed.critical).toBe(30 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('eligibility_review', 'minor', base);
    expect(d!.getTime() - base.getTime()).toBe(5 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('allocated', 'minor')).toBe(30 * DAY);
    expect(slaWindowMinutes('retired', 'critical')).toBe(0);
    expect(slaWindowMinutes('clawed_back', 'critical')).toBe(0);
  });

  it('all five terminals return null deadline', () => {
    expect(slaDeadlineFor('retired', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('rejected', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('clawed_back', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('expired', 'critical', base)).toBeNull();
  });
});

describe('W70 REC lifecycle — MWh-volume tiering', () => {
  it('tierForMwh boundaries', () => {
    expect(tierForMwh(500)).toBe('minor');
    expect(tierForMwh(999)).toBe('minor');
    expect(tierForMwh(1000)).toBe('moderate');
    expect(tierForMwh(9999)).toBe('moderate');
    expect(tierForMwh(10000)).toBe('material');
    expect(tierForMwh(49999)).toBe('material');
    expect(tierForMwh(50000)).toBe('major');
    expect(tierForMwh(199999)).toBe('major');
    expect(tierForMwh(200000)).toBe('critical');
    expect(tierForMwh(900000)).toBe('critical');
  });

  it('complianceFloor lifts a compliance-bound certificate to at least major', () => {
    expect(complianceFloor(true)).toBe('major');
    expect(complianceFloor(false)).toBe('minor');
  });

  it('tierForCertificate takes the higher of volume-tier and compliance floor', () => {
    // small volume, compliance-bound → floored to major
    expect(tierForCertificate(500, true)).toBe('major');
    // small volume, ordinary → stays minor
    expect(tierForCertificate(500, false)).toBe('minor');
    // huge volume beats the floor → critical
    expect(tierForCertificate(300000, true)).toBe('critical');
    // mid volume, ordinary → material
    expect(tierForCertificate(20000, false)).toBe('material');
  });

  it('isHighTier — major + critical only', () => {
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('major')).toBe(true);
    expect(isHighTier('material')).toBe(false);
    expect(isHighTier('moderate')).toBe(false);
    expect(isHighTier('minor')).toBe(false);
  });

  it('isReportable — major + critical only', () => {
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('major')).toBe(true);
    expect(isReportable('material')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W70 REC lifecycle — reportability (the signature)', () => {
  const tiers: RecTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

  it('claw_back crosses for EVERY tier (the signature — a revocation is always notifiable)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('claw_back', t)).toBe(true);
    }
  });

  it('reject_issuance crosses for the high tiers only (major + critical)', () => {
    expect(crossesIntoRegulator('reject_issuance', 'critical')).toBe(true);
    expect(crossesIntoRegulator('reject_issuance', 'major')).toBe(true);
    expect(crossesIntoRegulator('reject_issuance', 'material')).toBe(false);
    expect(crossesIntoRegulator('reject_issuance', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('reject_issuance', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: RecAction[] = [
      'begin_eligibility_review', 'approve_issuance', 'list_for_transfer', 'transfer_certificate',
      'allocate_consumption', 'retire_certificate', 'raise_dispute', 'resolve_dispute',
      'cancel_certificate', 'expire_certificate',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the high tiers only (major + critical)', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W70 REC lifecycle — party attribution (two-party write)', () => {
  it('the holder (offtaker) allocates, retires and raises disputes', () => {
    expect(partyForAction('allocate_consumption')).toBe('holder');
    expect(partyForAction('retire_certificate')).toBe('holder');
    expect(partyForAction('raise_dispute')).toBe('holder');
    expect(isHolderAction('retire_certificate')).toBe(true);
    expect(isHolderAction('approve_issuance')).toBe(false);
  });

  it('the issuer / registry drives every other step', () => {
    expect(partyForAction('begin_eligibility_review')).toBe('issuer');
    expect(partyForAction('approve_issuance')).toBe('issuer');
    expect(partyForAction('reject_issuance')).toBe('issuer');
    expect(partyForAction('list_for_transfer')).toBe('issuer');
    expect(partyForAction('transfer_certificate')).toBe('issuer');
    expect(partyForAction('resolve_dispute')).toBe('issuer');
    expect(partyForAction('claw_back')).toBe('issuer');
    expect(partyForAction('cancel_certificate')).toBe('issuer');
    expect(partyForAction('expire_certificate')).toBe('issuer');
  });
});
