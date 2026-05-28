import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, enhancedDueDiligenceApplies, partyForAction,
  type RegStatus, type RegTier,
} from '../src/utils/carbon-registration-spec';

describe('W37 carbon registration chain — state machine', () => {
  it('happy path: pin→pdd→validation→consultation→dna→request→registered→crediting', () => {
    let s: RegStatus = 'pin_submitted';
    s = nextStatus(s, 'draft_pdd')!;            expect(s).toBe('pdd_drafted');
    s = nextStatus(s, 'submit_validation')!;    expect(s).toBe('validation_underway');
    s = nextStatus(s, 'open_consultation')!;    expect(s).toBe('public_consultation');
    s = nextStatus(s, 'authorize_dna')!;        expect(s).toBe('dna_authorization');
    s = nextStatus(s, 'request_registration')!; expect(s).toBe('registration_requested');
    s = nextStatus(s, 'register')!;             expect(s).toBe('registered');
    s = nextStatus(s, 'activate_crediting')!;   expect(s).toBe('crediting_active');
  });

  it('CAR loop: validation→corrections→resubmit→validation', () => {
    let s: RegStatus = 'validation_underway';
    s = nextStatus(s, 'request_corrections')!;  expect(s).toBe('corrections_required');
    s = nextStatus(s, 'resubmit')!;             expect(s).toBe('validation_underway');
    s = nextStatus(s, 'open_consultation')!;    expect(s).toBe('public_consultation');
  });

  it('reject reachable from validation, corrections, and registration_requested', () => {
    expect(nextStatus('validation_underway', 'reject')).toBe('rejected');
    expect(nextStatus('corrections_required', 'reject')).toBe('rejected');
    expect(nextStatus('registration_requested', 'reject')).toBe('rejected');
    expect(isTerminal('rejected')).toBe(true);
    expect(allowedActions('rejected')).toEqual([]);
  });

  it('withdraw accessible from any pre-registered state, not after registered', () => {
    expect(nextStatus('pin_submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('public_consultation', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('registration_requested', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('registered', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('crediting_active is a terminal success state', () => {
    expect(isTerminal('crediting_active')).toBe(true);
    expect(allowedActions('crediting_active')).toEqual([]);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('crediting_active')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('pin_submitted', 'register')).toBeNull();
    expect(nextStatus('pdd_drafted', 'authorize_dna')).toBeNull();
    expect(nextStatus('dna_authorization', 'register')).toBeNull();
    expect(nextStatus('registered', 'request_registration')).toBeNull();
    expect(nextStatus('pin_submitted', 'reject')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'draft_pdd', 'submit_validation', 'request_corrections', 'resubmit',
      'open_consultation', 'authorize_dna', 'request_registration', 'register',
      'activate_crediting', 'reject', 'withdraw',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for validation_underway offers corrections / consultation / reject / withdraw', () => {
    const actions = allowedActions('validation_underway');
    expect(actions).toContain('request_corrections');
    expect(actions).toContain('open_consultation');
    expect(actions).toContain('reject');
    expect(actions).toContain('withdraw');
  });

  it('allowedActions for registration_requested offers register / reject / withdraw', () => {
    const actions = allowedActions('registration_requested');
    expect(actions).toContain('register');
    expect(actions).toContain('reject');
    expect(actions).toContain('withdraw');
  });
});

describe('W37 carbon registration chain — INVERTED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');

  it('validation window is INVERTED — afolu_redd longest, small_scale shortest', () => {
    const a = SLA_MINUTES.validation_underway.afolu_redd;
    const l = SLA_MINUTES.validation_underway.large_scale;
    const s = SLA_MINUTES.validation_underway.small_scale;
    expect(a).toBeGreaterThan(l);
    expect(l).toBeGreaterThan(s);
    expect(a).toBe(180 * 24 * 60);
  });

  it('every non-terminal state is INVERTED (afolu ≥ large ≥ small)', () => {
    const states: RegStatus[] = [
      'pin_submitted', 'pdd_drafted', 'validation_underway', 'corrections_required',
      'public_consultation', 'dna_authorization', 'registration_requested', 'registered',
    ];
    for (const st of states) {
      expect(SLA_MINUTES[st].afolu_redd).toBeGreaterThanOrEqual(SLA_MINUTES[st].large_scale);
      expect(SLA_MINUTES[st].large_scale).toBeGreaterThanOrEqual(SLA_MINUTES[st].small_scale);
    }
  });

  it('slaDeadlineFor adds the correct window from entry', () => {
    const d = slaDeadlineFor('public_consultation', 'small_scale', base);
    expect(d!.getTime() - base.getTime()).toBe(30 * 24 * 60 * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('crediting_active', 'afolu_redd', base)).toBeNull();
    expect(slaDeadlineFor('rejected', 'afolu_redd', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'afolu_redd', base)).toBeNull();
  });
});

describe('W37 carbon registration chain — regulator crossings', () => {
  const tiers: RegTier[] = ['afolu_redd', 'large_scale', 'small_scale'];

  it('reject crosses for EVERY tier (stopping a bad project is always notifiable)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('reject', t)).toBe(true);
    }
  });

  it('register crosses for high-integrity tiers only (afolu_redd + large_scale)', () => {
    expect(crossesIntoRegulator('register', 'afolu_redd')).toBe(true);
    expect(crossesIntoRegulator('register', 'large_scale')).toBe(true);
    expect(crossesIntoRegulator('register', 'small_scale')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('draft_pdd', t)).toBe(false);
      expect(crossesIntoRegulator('submit_validation', t)).toBe(false);
      expect(crossesIntoRegulator('request_corrections', t)).toBe(false);
      expect(crossesIntoRegulator('open_consultation', t)).toBe(false);
      expect(crossesIntoRegulator('authorize_dna', t)).toBe(false);
      expect(crossesIntoRegulator('activate_crediting', t)).toBe(false);
      expect(crossesIntoRegulator('withdraw', t)).toBe(false);
    }
  });

  it('sla_breach crosses high-integrity tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('afolu_redd')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('large_scale')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('small_scale')).toBe(false);
  });

  it('isReportable + enhancedDueDiligenceApplies: high-integrity tiers, not small_scale', () => {
    expect(isReportable('afolu_redd')).toBe(true);
    expect(isReportable('large_scale')).toBe(true);
    expect(isReportable('small_scale')).toBe(false);
    expect(enhancedDueDiligenceApplies('afolu_redd')).toBe(true);
    expect(enhancedDueDiligenceApplies('large_scale')).toBe(true);
    expect(enhancedDueDiligenceApplies('small_scale')).toBe(false);
  });
});

describe('W37 carbon registration chain — party attribution', () => {
  it('developer owns drafting, submission, resubmission, consultation, withdrawal', () => {
    expect(partyForAction('draft_pdd')).toBe('developer');
    expect(partyForAction('submit_validation')).toBe('developer');
    expect(partyForAction('resubmit')).toBe('developer');
    expect(partyForAction('open_consultation')).toBe('developer');
    expect(partyForAction('request_registration')).toBe('developer');
    expect(partyForAction('withdraw')).toBe('developer');
  });

  it('VVB owns corrections and rejection', () => {
    expect(partyForAction('request_corrections')).toBe('vvb');
    expect(partyForAction('reject')).toBe('vvb');
  });

  it('registry owns registration + crediting activation; authority owns DNA', () => {
    expect(partyForAction('register')).toBe('registry');
    expect(partyForAction('activate_crediting')).toBe('registry');
    expect(partyForAction('authorize_dna')).toBe('authority');
  });
});
