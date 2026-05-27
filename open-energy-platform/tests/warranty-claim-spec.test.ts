// ════════════════════════════════════════════════════════════════════════
// Wave 15 — OEM warranty/RMA claim chain spec tests.
// Pure utility, fixed clock.
// ════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  advance,
  slaDueAt,
  slaWindowFor,
  minutesUntilDeadline,
  isSlaBreached,
  isTerminal,
  hasSlaWindow,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  STATUS_LABEL,
  SEVERITY_LABEL,
  SLA_MINUTES,
  type ClaimStatus,
  type ClaimSeverity,
} from '../src/utils/warranty-claim-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('warranty-claim-spec', () => {
  describe('linear happy path', () => {
    it('opened → triaged arms submit SLA', () => {
      const r = advance('opened', 'triage');
      expect(r.next).toBe('triaged');
      expect(r.setNextSla).toBe('submit');
    });

    it('triaged → submitted arms ack SLA', () => {
      const r = advance('triaged', 'submit');
      expect(r.next).toBe('submitted');
      expect(r.setNextSla).toBe('ack');
    });

    it('submitted → acknowledged arms review SLA', () => {
      const r = advance('submitted', 'acknowledge');
      expect(r.next).toBe('acknowledged');
      expect(r.setNextSla).toBe('review');
    });

    it('acknowledged → under_review arms approve SLA', () => {
      const r = advance('acknowledged', 'begin_review');
      expect(r.next).toBe('under_review');
      expect(r.setNextSla).toBe('approve');
    });

    it('under_review → approved arms fulfill SLA', () => {
      const r = advance('under_review', 'approve');
      expect(r.next).toBe('approved');
      expect(r.setNextSla).toBe('fulfill');
    });

    it('approved → fulfilled clears SLA', () => {
      const r = advance('approved', 'fulfill');
      expect(r.next).toBe('fulfilled');
      expect(r.clearNextSla).toBe(true);
    });

    it('fulfilled → closed clears SLA', () => {
      const r = advance('fulfilled', 'close');
      expect(r.next).toBe('closed');
      expect(r.clearNextSla).toBe(true);
    });
  });

  describe('denial + dispute branches', () => {
    it('under_review → denied clears SLA', () => {
      const r = advance('under_review', 'deny');
      expect(r.next).toBe('denied');
      expect(r.clearNextSla).toBe(true);
    });

    it('denied → disputed arms review SLA', () => {
      const r = advance('denied', 'dispute');
      expect(r.next).toBe('disputed');
      expect(r.setNextSla).toBe('review');
    });

    it('denied → closed (accept denial) clears SLA', () => {
      const r = advance('denied', 'close');
      expect(r.next).toBe('closed');
      expect(r.clearNextSla).toBe(true);
    });

    it('disputed → approved (OEM reverses) arms fulfill SLA', () => {
      const r = advance('disputed', 'approve');
      expect(r.next).toBe('approved');
      expect(r.setNextSla).toBe('fulfill');
    });

    it('disputed → closed via uphold_denial clears SLA', () => {
      const r = advance('disputed', 'uphold_denial');
      expect(r.next).toBe('closed');
      expect(r.clearNextSla).toBe(true);
    });
  });

  describe('early-close branches', () => {
    it('can close from opened without claiming', () => {
      expect(advance('opened', 'close').next).toBe('closed');
    });

    it('can close from triaged without submitting', () => {
      expect(advance('triaged', 'close').next).toBe('closed');
    });
  });

  describe('illegal transitions throw', () => {
    it('cannot submit before triage', () => {
      expect(() => advance('opened', 'submit')).toThrow(/illegal transition/);
    });

    it('cannot acknowledge before submission', () => {
      expect(() => advance('triaged', 'acknowledge')).toThrow(/illegal transition/);
    });

    it('cannot approve from submitted', () => {
      expect(() => advance('submitted', 'approve')).toThrow(/illegal transition/);
    });

    it('cannot fulfill from under_review (must approve first)', () => {
      expect(() => advance('under_review', 'fulfill')).toThrow(/illegal transition/);
    });

    it('closed is terminal', () => {
      expect(() => advance('closed', 'fulfill')).toThrow(/illegal transition/);
      expect(() => advance('closed', 'submit')).toThrow(/illegal transition/);
    });

    it('cannot dispute before denial', () => {
      expect(() => advance('opened', 'dispute')).toThrow(/illegal transition/);
      expect(() => advance('under_review', 'dispute')).toThrow(/illegal transition/);
    });
  });

  describe('terminality + SLA window predicates', () => {
    it('only closed is terminal', () => {
      expect(isTerminal('closed')).toBe(true);
      for (const s of [
        'opened','triaged','submitted','acknowledged','under_review',
        'approved','denied','disputed','fulfilled',
      ] as ClaimStatus[]) {
        expect(isTerminal(s)).toBe(false);
      }
    });

    it('SLA window armed on active states only', () => {
      expect(hasSlaWindow('opened')).toBe(true);
      expect(hasSlaWindow('triaged')).toBe(true);
      expect(hasSlaWindow('submitted')).toBe(true);
      expect(hasSlaWindow('acknowledged')).toBe(true);
      expect(hasSlaWindow('under_review')).toBe(true);
      expect(hasSlaWindow('approved')).toBe(true);
      expect(hasSlaWindow('disputed')).toBe(true);
      expect(hasSlaWindow('denied')).toBe(false);
      expect(hasSlaWindow('fulfilled')).toBe(false);
      expect(hasSlaWindow('closed')).toBe(false);
    });

    it('slaWindowFor reports correct kinds', () => {
      expect(slaWindowFor('opened')).toBe('triage');
      expect(slaWindowFor('triaged')).toBe('submit');
      expect(slaWindowFor('submitted')).toBe('ack');
      expect(slaWindowFor('acknowledged')).toBe('review');
      expect(slaWindowFor('under_review')).toBe('approve');
      expect(slaWindowFor('approved')).toBe('fulfill');
      expect(slaWindowFor('disputed')).toBe('review');
      expect(slaWindowFor('denied')).toBeNull();
      expect(slaWindowFor('closed')).toBeNull();
    });
  });

  describe('SLA arithmetic', () => {
    it('safety triage SLA is 4h', () => {
      expect(SLA_MINUTES.safety.triage).toBe(240);
      const enteredAt = new Date('2026-06-01T09:00:00.000Z');
      const due = slaDueAt('opened', 'safety', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-01T13:00:00.000Z');
      expect(minutesUntilDeadline(due, NOW)).toBe(60);
      expect(isSlaBreached(due, NOW)).toBe(false);
    });

    it('cosmetic approve SLA is 90d', () => {
      expect(SLA_MINUTES.cosmetic.approve).toBe(129600);
      const enteredAt = new Date('2026-03-01T00:00:00.000Z');
      const due = slaDueAt('under_review', 'cosmetic', enteredAt)!;
      expect(due.toISOString()).toBe('2026-05-30T00:00:00.000Z');
    });

    it('past-deadline safety ack is breached', () => {
      const enteredAt = new Date('2026-06-01T07:00:00.000Z');
      const due = slaDueAt('submitted', 'safety', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-01T11:00:00.000Z');
      expect(isSlaBreached(due, NOW)).toBe(true);
      expect(minutesUntilDeadline(due, NOW)).toBe(-60);
    });

    it('terminal states have null deadline', () => {
      expect(slaDueAt('closed', 'safety', NOW)).toBeNull();
      expect(slaDueAt('denied', 'safety', NOW)).toBeNull();
      expect(slaDueAt('fulfilled', 'safety', NOW)).toBeNull();
    });

    it('null deadline is never breached', () => {
      expect(isSlaBreached(null, NOW)).toBe(false);
    });
  });

  describe('regulator crossings', () => {
    it('safety dispute/deny crosses; non-safety never', () => {
      expect(crossesIntoRegulator('dispute', 'safety')).toBe(true);
      expect(crossesIntoRegulator('deny', 'safety')).toBe(true);
      expect(crossesIntoRegulator('dispute', 'performance')).toBe(false);
      expect(crossesIntoRegulator('deny', 'cosmetic')).toBe(false);
    });

    it('non-deny/dispute actions never cross', () => {
      for (const a of ['triage','submit','acknowledge','approve','fulfill','close'] as const) {
        expect(crossesIntoRegulator(a, 'safety')).toBe(false);
      }
    });

    it('SLA breach crossings: safety only', () => {
      expect(slaBreachCrossesIntoRegulator('safety')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('performance')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('cosmetic')).toBe(false);
    });
  });

  describe('label tables are exhaustive', () => {
    it('every status has a label', () => {
      const all: ClaimStatus[] = [
        'opened','triaged','submitted','acknowledged','under_review',
        'approved','denied','disputed','fulfilled','closed',
      ];
      for (const s of all) expect(STATUS_LABEL[s]).toBeTruthy();
    });

    it('every severity has a label', () => {
      for (const s of ['safety','performance','cosmetic'] as ClaimSeverity[]) {
        expect(SEVERITY_LABEL[s]).toBeTruthy();
      }
    });
  });
});
