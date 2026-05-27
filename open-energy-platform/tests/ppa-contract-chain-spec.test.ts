// Wave 22 — PPA contract execution lifecycle spec tests.

import { describe, it, expect } from 'vitest';
import {
  advance,
  slaDueAt,
  isTerminal,
  isTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  tierFromMw,
  SLA_MINUTES,
  type PpaStatus,
  type PpaAction,
  type PpaTier,
} from '../src/utils/ppa-contract-chain-spec';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('PPA contract chain — state machine', () => {
  it('happy path: draft → in_negotiation → terms_locked → legal_signed → executed → in_force', () => {
    let s: PpaStatus = 'draft';
    s = advance(s, 'begin_negotiation'); expect(s).toBe('in_negotiation');
    s = advance(s, 'lock_terms');        expect(s).toBe('terms_locked');
    s = advance(s, 'legal_sign');        expect(s).toBe('legal_signed');
    s = advance(s, 'execute');           expect(s).toBe('executed');
    s = advance(s, 'commence');          expect(s).toBe('in_force');
  });

  it('dispute branch: in_force → in_dispute → in_force', () => {
    let s: PpaStatus = 'in_force';
    s = advance(s, 'dispute');           expect(s).toBe('in_dispute');
    s = advance(s, 'resolve');           expect(s).toBe('in_force');
  });

  it('terminate is reachable from executed, in_force, and in_dispute', () => {
    expect(advance('executed',   'terminate')).toBe('terminated');
    expect(advance('in_force',   'terminate')).toBe('terminated');
    expect(advance('in_dispute', 'terminate')).toBe('terminated');
  });

  it('terminate from pre-executed states throws (use cancel)', () => {
    expect(() => advance('draft', 'terminate')).toThrow(/Cannot terminate from state draft/);
    expect(() => advance('in_negotiation', 'terminate')).toThrow();
  });

  it('cancel is reachable from any pre-executed non-terminal', () => {
    for (const s of ['draft','in_negotiation','terms_locked','legal_signed'] as PpaStatus[]) {
      expect(advance(s, 'cancel')).toBe('cancelled');
    }
  });

  it('cancel from executed/in_force/in_dispute throws (use terminate)', () => {
    expect(() => advance('executed', 'cancel')).toThrow();
    expect(() => advance('in_force', 'cancel')).toThrow();
    expect(() => advance('in_dispute', 'cancel')).toThrow();
  });

  it('expire only from in_force', () => {
    expect(advance('in_force', 'expire')).toBe('expired');
    expect(() => advance('executed', 'expire')).toThrow();
    expect(() => advance('in_dispute', 'expire')).toThrow();
  });

  it('terminals are sticky — no action advances from them', () => {
    for (const s of ['terminated','expired','cancelled'] as PpaStatus[]) {
      expect(isTerminal(s)).toBe(true);
      for (const a of ['begin_negotiation','lock_terms','legal_sign','execute','commence','dispute','resolve','terminate','expire','cancel'] as PpaAction[]) {
        expect(() => advance(s, a)).toThrow();
      }
    }
  });

  it('non-terminals are non-terminal', () => {
    for (const s of ['draft','in_negotiation','terms_locked','legal_signed','executed','in_force','in_dispute'] as PpaStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });

  it('isTier accepts only strategic | medium | small', () => {
    expect(isTier('strategic')).toBe(true);
    expect(isTier('medium')).toBe(true);
    expect(isTier('small')).toBe(true);
    expect(isTier('large')).toBe(false);
    expect(isTier('')).toBe(false);
  });
});

describe('PPA contract chain — SLAs', () => {
  it('SLAs are monotone: strategic ≥ medium ≥ small for every active stage', () => {
    const stages: PpaStatus[] = ['draft','in_negotiation','terms_locked','legal_signed','executed','in_dispute'];
    for (const s of stages) {
      expect(SLA_MINUTES[s].strategic).toBeGreaterThanOrEqual(SLA_MINUTES[s].medium);
      expect(SLA_MINUTES[s].medium).toBeGreaterThanOrEqual(SLA_MINUTES[s].small);
      expect(SLA_MINUTES[s].small).toBeGreaterThan(0);
    }
  });

  it('executed → in_force is the longest stage (waits for construction/COD)', () => {
    for (const tier of ['strategic','medium','small'] as PpaTier[]) {
      const exec = SLA_MINUTES.executed[tier];
      for (const s of ['draft','in_negotiation','terms_locked','legal_signed','in_dispute'] as PpaStatus[]) {
        expect(exec).toBeGreaterThanOrEqual(SLA_MINUTES[s][tier]);
      }
    }
  });

  it('terminals have zero SLA', () => {
    for (const s of ['terminated','expired','cancelled','in_force'] as PpaStatus[]) {
      expect(SLA_MINUTES[s].strategic).toBe(0);
      expect(SLA_MINUTES[s].medium).toBe(0);
      expect(SLA_MINUTES[s].small).toBe(0);
    }
  });

  it('slaDueAt returns null for terminals and in_force', () => {
    for (const s of ['terminated','expired','cancelled','in_force'] as PpaStatus[]) {
      expect(slaDueAt(NOW, s, 'strategic')).toBeNull();
    }
  });

  it('slaDueAt computes correctly for strategic draft (90d)', () => {
    const due = slaDueAt(NOW, 'draft', 'strategic');
    expect(due).not.toBeNull();
    const delta = (new Date(due!).getTime() - NOW.getTime()) / 86_400_000;
    expect(delta).toBeCloseTo(90, 5);
  });

  it('slaDueAt for executed → in_force is 18mo (strategic), 12mo (medium), 6mo (small)', () => {
    const days = (tier: PpaTier) => (new Date(slaDueAt(NOW, 'executed', tier)!).getTime() - NOW.getTime()) / 86_400_000;
    expect(days('strategic')).toBeCloseTo(540, 5);
    expect(days('medium')).toBeCloseTo(365, 5);
    expect(days('small')).toBeCloseTo(180, 5);
  });
});

describe('PPA contract chain — tier classification', () => {
  it('tierFromMw boundaries', () => {
    expect(tierFromMw(150)).toBe('strategic');
    expect(tierFromMw(100)).toBe('strategic');
    expect(tierFromMw(99.9)).toBe('medium');
    expect(tierFromMw(10)).toBe('medium');
    expect(tierFromMw(9.9)).toBe('small');
    expect(tierFromMw(0)).toBe('small');
    expect(tierFromMw(null)).toBe('small');
    expect(tierFromMw(undefined)).toBe('small');
  });
});

describe('PPA contract chain — regulator inbox crossings', () => {
  it('only strategic execute and terminate cross', () => {
    expect(crossesIntoRegulator('execute',   'strategic')).toBe(true);
    expect(crossesIntoRegulator('terminate', 'strategic')).toBe(true);
    expect(crossesIntoRegulator('execute',   'medium')).toBe(false);
    expect(crossesIntoRegulator('execute',   'small')).toBe(false);
    expect(crossesIntoRegulator('terminate', 'medium')).toBe(false);
  });

  it('non-strategic + non-execute/terminate actions never cross', () => {
    for (const a of ['begin_negotiation','lock_terms','legal_sign','commence','dispute','resolve','expire','cancel'] as PpaAction[]) {
      for (const tier of ['strategic','medium','small'] as PpaTier[]) {
        expect(crossesIntoRegulator(a, tier)).toBe(false);
      }
    }
  });

  it('SLA breach crossings are strategic only', () => {
    expect(slaBreachCrossesIntoRegulator('strategic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
  });
});
