// ════════════════════════════════════════════════════════════════════════
// Wave 13 — Grid operator dispatch nomination chain spec tests.
// Pure utility, fixed clock. Validates state machine + SLA arithmetic.
// ════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  advance,
  slaDueAt,
  minutesUntilDeadline,
  isSlaBreached,
  isTerminal,
  hasSlaWindow,
  crossesIntoRegulator,
  STATUS_LABEL,
  SLA_MINUTES,
  type NominationStatus,
} from '../src/utils/dispatch-nomination-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('dispatch-nomination-spec', () => {
  describe('linear happy path', () => {
    it('nominated → accepted via accept', () => {
      const r = advance('nominated', 'accept');
      expect(r.next).toBe('accepted');
      expect(r.setNextSla).toBe(true);
    });

    it('accepted → activated via activate', () => {
      expect(advance('accepted', 'activate').next).toBe('activated');
    });

    it('activated → performance_recorded via record_performance', () => {
      expect(advance('activated', 'record_performance').next).toBe('performance_recorded');
    });

    it('performance_recorded → settled via settle', () => {
      expect(advance('performance_recorded', 'settle').next).toBe('settled');
    });

    it('settled → closed via close (terminal)', () => {
      const r = advance('settled', 'close');
      expect(r.next).toBe('closed');
      expect(r.clearNextSla).toBe(true);
    });
  });

  describe('rejection branch', () => {
    it('nominated → nomination_rejected via reject', () => {
      const r = advance('nominated', 'reject');
      expect(r.next).toBe('nomination_rejected');
      expect(r.clearNextSla).toBe(true);
    });

    it('rejection crosses into regulator inbox', () => {
      expect(crossesIntoRegulator('reject')).toBe(true);
    });
  });

  describe('dispute branch', () => {
    it('performance_recorded → disputed via raise_dispute', () => {
      expect(advance('performance_recorded', 'raise_dispute').next).toBe('disputed');
    });

    it('settled → disputed via raise_dispute (post-settlement claim)', () => {
      expect(advance('settled', 'raise_dispute').next).toBe('disputed');
    });

    it('disputed → dispute_resolved via resolve_dispute', () => {
      expect(advance('disputed', 'resolve_dispute').next).toBe('dispute_resolved');
    });

    it('dispute_resolved → closed_disputed via close_disputed (terminal)', () => {
      expect(advance('dispute_resolved', 'close_disputed').next).toBe('closed_disputed');
    });

    it('raising a dispute crosses into regulator inbox', () => {
      expect(crossesIntoRegulator('raise_dispute')).toBe(true);
    });
  });

  describe('illegal transitions throw', () => {
    it('cannot accept from accepted', () => {
      expect(() => advance('accepted', 'accept')).toThrow(/illegal transition/);
    });

    it('cannot activate before accept', () => {
      expect(() => advance('nominated', 'activate')).toThrow(/illegal transition/);
    });

    it('cannot close from nominated', () => {
      expect(() => advance('nominated', 'close')).toThrow(/illegal transition/);
    });

    it('terminal states accept no actions', () => {
      expect(() => advance('closed', 'close')).toThrow(/illegal transition/);
      expect(() => advance('nomination_rejected', 'accept')).toThrow(/illegal transition/);
    });
  });

  describe('terminality + SLA window predicates', () => {
    it('closed, nomination_rejected, closed_disputed are terminal', () => {
      expect(isTerminal('closed')).toBe(true);
      expect(isTerminal('nomination_rejected')).toBe(true);
      expect(isTerminal('closed_disputed')).toBe(true);
    });

    it('non-terminal states report not terminal', () => {
      const live: NominationStatus[] = [
        'nominated', 'accepted', 'activated',
        'performance_recorded', 'settled', 'disputed', 'dispute_resolved',
      ];
      for (const s of live) expect(isTerminal(s)).toBe(false);
    });

    it('SLA window only set on chained pre-terminal states', () => {
      expect(hasSlaWindow('nominated')).toBe(true);
      expect(hasSlaWindow('accepted')).toBe(true);
      expect(hasSlaWindow('activated')).toBe(true);
      expect(hasSlaWindow('performance_recorded')).toBe(true);
      expect(hasSlaWindow('settled')).toBe(true);
      expect(hasSlaWindow('disputed')).toBe(true);
      expect(hasSlaWindow('closed')).toBe(false);
      expect(hasSlaWindow('nomination_rejected')).toBe(false);
      expect(hasSlaWindow('dispute_resolved')).toBe(false);
      expect(hasSlaWindow('closed_disputed')).toBe(false);
    });
  });

  describe('SLA arithmetic', () => {
    it('nominated has a 15-minute SLA window', () => {
      expect(SLA_MINUTES.nominated).toBe(15);
      const enteredAt = new Date('2026-06-01T11:50:00.000Z');
      const due = slaDueAt('nominated', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-01T12:05:00.000Z');
      expect(minutesUntilDeadline(due, NOW)).toBe(5);
      expect(isSlaBreached(due, NOW)).toBe(false);
    });

    it('accepted state past its 30m window is breached', () => {
      const enteredAt = new Date('2026-06-01T11:00:00.000Z');
      const due = slaDueAt('accepted', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-01T11:30:00.000Z');
      expect(isSlaBreached(due, NOW)).toBe(true);
      expect(minutesUntilDeadline(due, NOW)).toBe(-30);
    });

    it('dispute window is 10 days', () => {
      expect(SLA_MINUTES.disputed).toBe(10 * 24 * 60);
      const enteredAt = new Date('2026-06-01T00:00:00.000Z');
      const due = slaDueAt('disputed', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-11T00:00:00.000Z');
    });

    it('terminal states return null deadline', () => {
      expect(slaDueAt('closed', NOW)).toBeNull();
      expect(slaDueAt('nomination_rejected', NOW)).toBeNull();
    });

    it('null deadline is never breached', () => {
      expect(isSlaBreached(null, NOW)).toBe(false);
    });
  });

  describe('regulator crossings (fire-once on entry)', () => {
    it('only reject and raise_dispute cross', () => {
      expect(crossesIntoRegulator('accept')).toBe(false);
      expect(crossesIntoRegulator('activate')).toBe(false);
      expect(crossesIntoRegulator('record_performance')).toBe(false);
      expect(crossesIntoRegulator('settle')).toBe(false);
      expect(crossesIntoRegulator('close')).toBe(false);
      expect(crossesIntoRegulator('resolve_dispute')).toBe(false);
      expect(crossesIntoRegulator('close_disputed')).toBe(false);
      expect(crossesIntoRegulator('reject')).toBe(true);
      expect(crossesIntoRegulator('raise_dispute')).toBe(true);
    });
  });

  describe('status labels exist for every state', () => {
    it('label table is exhaustive', () => {
      const all: NominationStatus[] = [
        'nominated', 'accepted', 'activated',
        'performance_recorded', 'settled', 'closed',
        'nomination_rejected', 'disputed', 'dispute_resolved', 'closed_disputed',
      ];
      for (const s of all) {
        expect(STATUS_LABEL[s]).toBeTruthy();
        expect(typeof STATUS_LABEL[s]).toBe('string');
      }
    });
  });
});
