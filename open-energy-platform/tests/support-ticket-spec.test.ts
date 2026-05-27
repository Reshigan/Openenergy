// ════════════════════════════════════════════════════════════════════════
// Wave 14 — Support ticket P6 chain spec tests.
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
  PRIORITY_LABEL,
  SLA_MINUTES,
  type TicketStatus,
  type TicketPriority,
} from '../src/utils/support-ticket-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('support-ticket-spec', () => {
  describe('linear happy path', () => {
    it('open → triaged arms first_response SLA', () => {
      const r = advance('open', 'triage');
      expect(r.next).toBe('triaged');
      expect(r.setNextSla).toBe('first_response');
    });

    it('triaged → in_progress arms resolution SLA', () => {
      const r = advance('triaged', 'pick_up');
      expect(r.next).toBe('in_progress');
      expect(r.setNextSla).toBe('resolution');
    });

    it('in_progress → resolved clears SLA', () => {
      const r = advance('in_progress', 'resolve');
      expect(r.next).toBe('resolved');
      expect(r.clearNextSla).toBe(true);
    });

    it('resolved → closed (terminal-leaning) clears SLA', () => {
      const r = advance('resolved', 'close');
      expect(r.next).toBe('closed');
      expect(r.clearNextSla).toBe(true);
    });
  });

  describe('awaiting_user branch', () => {
    it('in_progress → awaiting_user clears SLA (clock pauses)', () => {
      const r = advance('in_progress', 'wait_for_user');
      expect(r.next).toBe('awaiting_user');
      expect(r.clearNextSla).toBe(true);
    });

    it('awaiting_user → in_progress re-arms resolution SLA', () => {
      const r = advance('awaiting_user', 'user_responded');
      expect(r.next).toBe('in_progress');
      expect(r.setNextSla).toBe('resolution');
    });

    it('awaiting_user → resolved skips the back-and-forth', () => {
      expect(advance('awaiting_user', 'resolve').next).toBe('resolved');
    });
  });

  describe('reopen branch', () => {
    it('resolved → in_progress on reopen re-arms resolution SLA', () => {
      const r = advance('resolved', 'reopen');
      expect(r.next).toBe('in_progress');
      expect(r.setNextSla).toBe('resolution');
    });

    it('closed → in_progress on reopen re-arms resolution SLA', () => {
      const r = advance('closed', 'reopen');
      expect(r.next).toBe('in_progress');
      expect(r.setNextSla).toBe('resolution');
    });
  });

  describe('escalation branch', () => {
    it('escalation is allowed from open / triaged / in_progress / awaiting_user', () => {
      for (const s of ['open', 'triaged', 'in_progress', 'awaiting_user'] as const) {
        const r = advance(s, 'escalate');
        expect(r.next).toBe('escalated');
        expect(r.clearNextSla).toBe(true);
      }
    });

    it('cannot escalate from resolved / closed', () => {
      expect(() => advance('resolved', 'escalate')).toThrow(/illegal transition/);
      expect(() => advance('closed', 'escalate')).toThrow(/illegal transition/);
    });
  });

  describe('illegal transitions throw', () => {
    it('cannot pick_up before triage', () => {
      expect(() => advance('open', 'pick_up')).toThrow(/illegal transition/);
    });

    it('cannot wait_for_user from triaged', () => {
      expect(() => advance('triaged', 'wait_for_user')).toThrow(/illegal transition/);
    });

    it('escalated is terminal', () => {
      expect(() => advance('escalated', 'pick_up')).toThrow(/illegal transition/);
      expect(() => advance('escalated', 'resolve')).toThrow(/illegal transition/);
    });
  });

  describe('terminality + SLA window predicates', () => {
    it('closed + escalated are terminal', () => {
      expect(isTerminal('closed')).toBe(true);
      expect(isTerminal('escalated')).toBe(true);
    });

    it('non-terminal states are not terminal', () => {
      for (const s of ['open', 'triaged', 'in_progress', 'awaiting_user', 'resolved'] as TicketStatus[]) {
        expect(isTerminal(s)).toBe(false);
      }
    });

    it('SLA window only set on chained pre-terminal states', () => {
      expect(hasSlaWindow('open')).toBe(true);
      expect(hasSlaWindow('triaged')).toBe(true);
      expect(hasSlaWindow('in_progress')).toBe(true);
      expect(hasSlaWindow('awaiting_user')).toBe(false);
      expect(hasSlaWindow('resolved')).toBe(false);
      expect(hasSlaWindow('closed')).toBe(false);
      expect(hasSlaWindow('escalated')).toBe(false);
    });

    it('slaWindowFor reports the correct kind', () => {
      expect(slaWindowFor('open')).toBe('triage');
      expect(slaWindowFor('triaged')).toBe('first_response');
      expect(slaWindowFor('in_progress')).toBe('resolution');
      expect(slaWindowFor('awaiting_user')).toBeNull();
      expect(slaWindowFor('resolved')).toBeNull();
    });
  });

  describe('SLA arithmetic', () => {
    it('P1 triage SLA is 1h', () => {
      expect(SLA_MINUTES.urgent.triage).toBe(60);
      const enteredAt = new Date('2026-06-01T11:30:00.000Z');
      const due = slaDueAt('open', 'urgent', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-01T12:30:00.000Z');
      expect(minutesUntilDeadline(due, NOW)).toBe(30);
      expect(isSlaBreached(due, NOW)).toBe(false);
    });

    it('P4 resolution SLA is 15d', () => {
      expect(SLA_MINUTES.low.resolution).toBe(21600);
      const enteredAt = new Date('2026-05-15T00:00:00.000Z');
      const due = slaDueAt('in_progress', 'low', enteredAt)!;
      expect(due.toISOString()).toBe('2026-05-30T00:00:00.000Z');
    });

    it('past-deadline P1 first_response is breached', () => {
      const enteredAt = new Date('2026-06-01T09:00:00.000Z');
      const due = slaDueAt('triaged', 'urgent', enteredAt)!;
      expect(due.toISOString()).toBe('2026-06-01T11:00:00.000Z');
      expect(isSlaBreached(due, NOW)).toBe(true);
      expect(minutesUntilDeadline(due, NOW)).toBe(-60);
    });

    it('terminal + paused states return null deadline', () => {
      expect(slaDueAt('closed', 'urgent', NOW)).toBeNull();
      expect(slaDueAt('escalated', 'urgent', NOW)).toBeNull();
      expect(slaDueAt('awaiting_user', 'urgent', NOW)).toBeNull();
      expect(slaDueAt('resolved', 'urgent', NOW)).toBeNull();
    });

    it('null deadline is never breached', () => {
      expect(isSlaBreached(null, NOW)).toBe(false);
    });
  });

  describe('regulator crossings', () => {
    it('only P1 + compliance escalations cross', () => {
      expect(crossesIntoRegulator('escalate', 'urgent', 'bug')).toBe(true);
      expect(crossesIntoRegulator('escalate', 'normal', 'compliance')).toBe(true);
      expect(crossesIntoRegulator('escalate', 'high', 'bug')).toBe(false);
      expect(crossesIntoRegulator('escalate', 'low', 'billing')).toBe(false);
    });

    it('non-escalate actions never cross', () => {
      for (const a of ['triage', 'pick_up', 'resolve', 'close', 'reopen'] as const) {
        expect(crossesIntoRegulator(a, 'urgent', 'compliance')).toBe(false);
      }
    });

    it('SLA breach crossings: P1 always, P2-P4 only if compliance', () => {
      expect(slaBreachCrossesIntoRegulator('urgent', 'bug')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('high', 'compliance')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('high', 'bug')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('low', 'billing')).toBe(false);
    });
  });

  describe('label tables are exhaustive', () => {
    it('every status has a label', () => {
      const all: TicketStatus[] = [
        'open', 'triaged', 'in_progress', 'awaiting_user',
        'resolved', 'closed', 'escalated',
      ];
      for (const s of all) expect(STATUS_LABEL[s]).toBeTruthy();
    });

    it('every priority has a label', () => {
      const all: TicketPriority[] = ['urgent', 'high', 'normal', 'low'];
      for (const p of all) expect(PRIORITY_LABEL[p]).toBeTruthy();
    });
  });
});
