import { describe, expect, it } from 'vitest';
import {
  advance,
  crossesIntoRegulator,
  daysUntilDeadline,
  isSlaBreached,
  isTerminal,
  slaDueAt,
  STATUS_LABEL,
  DOE_SLA_DAYS,
  CRA_SLA_DAYS,
} from '../src/utils/mrv-chain-spec';

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('isTerminal', () => {
  it('returns true for terminal states', () => {
    expect(isTerminal('doe_opinion_adverse')).toBe(true);
    expect(isTerminal('doe_opinion_disclaimer')).toBe(true);
    expect(isTerminal('cra_rejected')).toBe(true);
    expect(isTerminal('issued')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('returns false for in-flight states', () => {
    expect(isTerminal('draft')).toBe(false);
    expect(isTerminal('submitted')).toBe(false);
    expect(isTerminal('doe_review')).toBe(false);
    expect(isTerminal('cra_review')).toBe(false);
    expect(isTerminal('issuance_authorized')).toBe(false);
  });
});

describe('advance', () => {
  it('walks the happy path end-to-end', () => {
    expect(advance({ current: 'draft', action: 'submit' })).toEqual({ next: 'submitted', ok: true });
    expect(advance({ current: 'submitted', action: 'assign_doe' })).toEqual({ next: 'doe_assigned', ok: true });
    expect(advance({ current: 'doe_assigned', action: 'start_review' })).toEqual({ next: 'doe_review', ok: true });
    expect(advance({ current: 'doe_review', action: 'record_opinion', doeOpinion: 'positive' })).toEqual({ next: 'doe_opinion_positive', ok: true });
    expect(advance({ current: 'doe_opinion_positive', action: 'submit_cra' })).toEqual({ next: 'cra_review', ok: true });
    expect(advance({ current: 'cra_review', action: 'cra_approve' })).toEqual({ next: 'cra_approved', ok: true });
    expect(advance({ current: 'cra_approved', action: 'authorize' })).toEqual({ next: 'issuance_authorized', ok: true });
    expect(advance({ current: 'issuance_authorized', action: 'issue' })).toEqual({ next: 'issued', ok: true });
  });

  it('routes each DOE opinion to the correct state', () => {
    expect(advance({ current: 'doe_review', action: 'record_opinion', doeOpinion: 'positive' }).next).toBe('doe_opinion_positive');
    expect(advance({ current: 'doe_review', action: 'record_opinion', doeOpinion: 'qualified' }).next).toBe('doe_opinion_qualified');
    expect(advance({ current: 'doe_review', action: 'record_opinion', doeOpinion: 'adverse' }).next).toBe('doe_opinion_adverse');
    expect(advance({ current: 'doe_review', action: 'record_opinion', doeOpinion: 'disclaimer' }).next).toBe('doe_opinion_disclaimer');
  });

  it('rejects record_opinion without an opinion', () => {
    const r = advance({ current: 'doe_review', action: 'record_opinion' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/doeOpinion required/);
  });

  it('blocks invalid transitions', () => {
    expect(advance({ current: 'draft', action: 'authorize' }).ok).toBe(false);
    expect(advance({ current: 'cra_review', action: 'submit' }).ok).toBe(false);
    expect(advance({ current: 'issued', action: 'cra_approve' }).ok).toBe(false);
    expect(advance({ current: 'doe_opinion_adverse', action: 'submit_cra' }).ok).toBe(false);
  });

  it('cra_reject is a single-step transition', () => {
    const r = advance({ current: 'cra_review', action: 'cra_reject' });
    expect(r).toEqual({ next: 'cra_rejected', ok: true });
  });

  it('withdraw is available from in-flight states', () => {
    expect(advance({ current: 'draft', action: 'withdraw' }).next).toBe('withdrawn');
    expect(advance({ current: 'submitted', action: 'withdraw' }).next).toBe('withdrawn');
    expect(advance({ current: 'doe_assigned', action: 'withdraw' }).next).toBe('withdrawn');
  });

  it('withdraw blocked from terminal states', () => {
    expect(advance({ current: 'issued', action: 'withdraw' }).ok).toBe(false);
    expect(advance({ current: 'cra_rejected', action: 'withdraw' }).ok).toBe(false);
  });
});

describe('slaDueAt', () => {
  it('DOE states get 90-day SLA', () => {
    const due = slaDueAt('doe_assigned', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + DOE_SLA_DAYS * 24 * 60 * 60 * 1000);
  });

  it('doe_review reuses the DOE 90-day SLA', () => {
    const due = slaDueAt('doe_review', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + DOE_SLA_DAYS * 24 * 60 * 60 * 1000);
  });

  it('cra_review gets 30-day SLA', () => {
    const due = slaDueAt('cra_review', NOW);
    expect(new Date(due!).getTime()).toBe(NOW.getTime() + CRA_SLA_DAYS * 24 * 60 * 60 * 1000);
  });

  it('non-SLA states return null', () => {
    expect(slaDueAt('draft', NOW)).toBeNull();
    expect(slaDueAt('issued', NOW)).toBeNull();
    expect(slaDueAt('doe_opinion_positive', NOW)).toBeNull();
  });
});

describe('daysUntilDeadline + isSlaBreached', () => {
  it('positive days when deadline in future', () => {
    const future = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntilDeadline(future, NOW)).toBe(10);
    expect(isSlaBreached(future, NOW)).toBe(false);
  });

  it('negative + breached when deadline in past', () => {
    const past = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntilDeadline(past, NOW)).toBe(-5);
    expect(isSlaBreached(past, NOW)).toBe(true);
  });

  it('null deadline is neither breached nor counted', () => {
    expect(daysUntilDeadline(null, NOW)).toBeNull();
    expect(daysUntilDeadline(undefined, NOW)).toBeNull();
    expect(isSlaBreached(null, NOW)).toBe(false);
    expect(isSlaBreached(undefined, NOW)).toBe(false);
  });
});

describe('crossesIntoRegulator', () => {
  it('fires on entry into doe_opinion_adverse', () => {
    expect(crossesIntoRegulator('doe_review', 'doe_opinion_adverse')).toBe(true);
  });

  it('fires on entry into cra_rejected', () => {
    expect(crossesIntoRegulator('cra_review', 'cra_rejected')).toBe(true);
  });

  it('does not fire on idempotent ticks', () => {
    expect(crossesIntoRegulator('cra_rejected', 'cra_rejected')).toBe(false);
    expect(crossesIntoRegulator('doe_opinion_adverse', 'doe_opinion_adverse')).toBe(false);
  });

  it('does not fire on benign transitions', () => {
    expect(crossesIntoRegulator('cra_review', 'cra_approved')).toBe(false);
    expect(crossesIntoRegulator('doe_review', 'doe_opinion_positive')).toBe(false);
  });
});

describe('STATUS_LABEL', () => {
  it('has a human label for every state', () => {
    expect(STATUS_LABEL.draft).toBeTruthy();
    expect(STATUS_LABEL.doe_review).toBeTruthy();
    expect(STATUS_LABEL.cra_approved).toBeTruthy();
    expect(STATUS_LABEL.issued).toBeTruthy();
    expect(STATUS_LABEL.withdrawn).toBeTruthy();
  });
});
