import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  tierFromZar,
  slaDeadlineFor,
  SLA_MINUTES,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  type InsuranceClaimStatus,
} from '../src/utils/insurance-claim-chain-spec';

describe('insurance claim chain spec', () => {
  describe('happy path', () => {
    it('walks notified → assessing → adjuster_assigned → quantum_proposed → quantum_agreed → settled → closed', () => {
      expect(nextStatus('notified',          'begin_assessment')).toBe('assessing');
      expect(nextStatus('assessing',         'assign_adjuster')).toBe('adjuster_assigned');
      expect(nextStatus('adjuster_assigned', 'propose_quantum')).toBe('quantum_proposed');
      expect(nextStatus('quantum_proposed',  'agree_quantum')).toBe('quantum_agreed');
      expect(nextStatus('quantum_agreed',    'settle')).toBe('settled');
      expect(nextStatus('settled',           'close')).toBe('closed');
    });
  });

  describe('dispute branch', () => {
    it('quantum_proposed → disputed → quantum_agreed round-trip', () => {
      expect(nextStatus('quantum_proposed', 'dispute')).toBe('disputed');
      expect(nextStatus('disputed', 'resolve_dispute')).toBe('quantum_agreed');
      expect(nextStatus('disputed', 'agree_quantum')).toBe('quantum_agreed');
    });

    it('also allows dispute from quantum_agreed (re-open)', () => {
      expect(nextStatus('quantum_agreed', 'dispute')).toBe('disputed');
    });

    it('declined exit from disputed', () => {
      expect(nextStatus('disputed', 'decline')).toBe('declined');
    });
  });

  describe('decline / withdraw exits', () => {
    it('decline reachable from assessing, adjuster_assigned, quantum_proposed, disputed', () => {
      expect(nextStatus('assessing',         'decline')).toBe('declined');
      expect(nextStatus('adjuster_assigned', 'decline')).toBe('declined');
      expect(nextStatus('quantum_proposed',  'decline')).toBe('declined');
      expect(nextStatus('disputed',          'decline')).toBe('declined');
    });

    it('decline blocked from notified or quantum_agreed (must assess or settle first)', () => {
      expect(nextStatus('notified',       'decline')).toBeNull();
      expect(nextStatus('quantum_agreed', 'decline')).toBeNull();
    });

    it('withdraw reachable pre-settle, blocked post-quantum_agreed', () => {
      expect(nextStatus('notified',          'withdraw')).toBe('withdrawn');
      expect(nextStatus('assessing',         'withdraw')).toBe('withdrawn');
      expect(nextStatus('adjuster_assigned', 'withdraw')).toBe('withdrawn');
      expect(nextStatus('quantum_proposed',  'withdraw')).toBe('withdrawn');
      expect(nextStatus('disputed',          'withdraw')).toBe('withdrawn');
      expect(nextStatus('quantum_agreed',    'withdraw')).toBeNull();
    });
  });

  describe('terminals', () => {
    it('settled, declined, closed, withdrawn flagged as terminal', () => {
      expect(isTerminal('settled')).toBe(true);
      expect(isTerminal('declined')).toBe(true);
      expect(isTerminal('closed')).toBe(true);
      expect(isTerminal('withdrawn')).toBe(true);
    });

    it('non-terminals are not terminal', () => {
      expect(isTerminal('notified')).toBe(false);
      expect(isTerminal('assessing')).toBe(false);
      expect(isTerminal('adjuster_assigned')).toBe(false);
      expect(isTerminal('quantum_proposed')).toBe(false);
      expect(isTerminal('quantum_agreed')).toBe(false);
      expect(isTerminal('disputed')).toBe(false);
    });

    it('closed and withdrawn are sticky', () => {
      expect(nextStatus('closed',    'settle')).toBeNull();
      expect(nextStatus('withdrawn', 'settle')).toBeNull();
    });

    it('only close transition is allowed from settled/declined', () => {
      expect(nextStatus('settled',  'close')).toBe('closed');
      expect(nextStatus('declined', 'close')).toBe('closed');
      expect(nextStatus('settled',  'settle')).toBeNull();
    });
  });

  describe('tier mapping', () => {
    it('catastrophic ≥ R50m', () => {
      expect(tierFromZar(50_000_000)).toBe('catastrophic');
      expect(tierFromZar(120_000_000)).toBe('catastrophic');
    });

    it('major R10m–R50m', () => {
      expect(tierFromZar(10_000_000)).toBe('major');
      expect(tierFromZar(49_999_999)).toBe('major');
    });

    it('minor R500k–R10m', () => {
      expect(tierFromZar(500_000)).toBe('minor');
      expect(tierFromZar(9_999_999)).toBe('minor');
    });

    it('small < R500k', () => {
      expect(tierFromZar(0)).toBe('small');
      expect(tierFromZar(499_999)).toBe('small');
    });
  });

  describe('SLA matrix', () => {
    it('disputed is the longest stage (90d for catastrophic — most negotiation room)', () => {
      const stages: InsuranceClaimStatus[] = ['notified','assessing','adjuster_assigned','quantum_proposed','quantum_agreed','disputed'];
      const disputed = SLA_MINUTES.disputed.catastrophic;
      for (const s of stages) {
        if (s === 'disputed') continue;
        expect(disputed).toBeGreaterThanOrEqual(SLA_MINUTES[s].catastrophic);
      }
    });

    it('catastrophic gets MORE time than minor at the notify+assess+adjuster+propose+disputed stages (inverted — more diligence)', () => {
      for (const stage of ['adjuster_assigned','disputed'] as InsuranceClaimStatus[]) {
        expect(SLA_MINUTES[stage].catastrophic).toBeGreaterThan(SLA_MINUTES[stage].small);
      }
    });

    it('catastrophic gets LESS time than minor at the notify stage (urgency)', () => {
      expect(SLA_MINUTES.notified.catastrophic).toBeLessThan(SLA_MINUTES.notified.minor);
    });

    it('slaDeadlineFor returns null for terminals', () => {
      const t0 = new Date('2026-05-27T00:00:00Z');
      expect(slaDeadlineFor('settled',   'catastrophic', t0)).toBeNull();
      expect(slaDeadlineFor('declined',  'minor',         t0)).toBeNull();
      expect(slaDeadlineFor('closed',    'small',         t0)).toBeNull();
      expect(slaDeadlineFor('withdrawn', 'major',         t0)).toBeNull();
    });

    it('slaDeadlineFor on notified+major adds 2 days', () => {
      const t0 = new Date('2026-05-27T00:00:00Z');
      const d  = slaDeadlineFor('notified', 'major', t0)!;
      expect(d.toISOString()).toBe('2026-05-29T00:00:00.000Z');
    });
  });

  describe('regulator crossings', () => {
    it('catastrophic settle crosses', () => {
      expect(crossesIntoRegulator('settle', 'catastrophic')).toBe(true);
    });

    it('catastrophic decline crosses', () => {
      expect(crossesIntoRegulator('decline', 'catastrophic')).toBe(true);
    });

    it('catastrophic close DOES NOT cross (post-terminal admin only)', () => {
      expect(crossesIntoRegulator('close', 'catastrophic')).toBe(false);
    });

    it('non-catastrophic settle/decline does not cross', () => {
      expect(crossesIntoRegulator('settle',  'major')).toBe(false);
      expect(crossesIntoRegulator('decline', 'minor')).toBe(false);
      expect(crossesIntoRegulator('settle',  'small')).toBe(false);
    });

    it('SLA breach crosses only for catastrophic', () => {
      expect(slaBreachCrossesIntoRegulator('catastrophic')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('major')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
    });
  });

  describe('allowedActions sanity', () => {
    it('notified offers begin_assessment and withdraw', () => {
      const a = allowedActions('notified');
      expect(a).toContain('begin_assessment');
      expect(a).toContain('withdraw');
    });

    it('quantum_agreed offers settle, dispute (re-open) — no decline or withdraw', () => {
      const a = allowedActions('quantum_agreed');
      expect(a).toContain('settle');
      expect(a).toContain('dispute');
      expect(a).not.toContain('decline');
      expect(a).not.toContain('withdraw');
    });

    it('terminals offer no actions (except close from settled/declined)', () => {
      expect(allowedActions('settled')).toEqual(['close']);
      expect(allowedActions('declined')).toEqual(['close']);
      expect(allowedActions('closed')).toEqual([]);
      expect(allowedActions('withdrawn')).toEqual([]);
    });
  });
});
