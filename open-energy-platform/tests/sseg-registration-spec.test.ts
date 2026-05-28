import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  isWithdrawable,
  nextStatus,
  allowedActions,
  slaDeadlineFor,
  slaWindowMinutes,
  SLA_MINUTES,
  tierForCapacityKw,
  isLargeTier,
  mandatoryGridStudy,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  isApplicantAction,
  type SsegRegistrationStatus,
  type SsegRegistrationAction,
  type SsegRegistrationTier,
} from '../src/utils/sseg-registration-spec';

const ALL_STATUSES: SsegRegistrationStatus[] = [
  'registration_received', 'eligibility_screening', 'information_requested',
  'technical_verification', 'exemption_determination', 'conditions_pending',
  'registration_approved', 'registered', 'referred_to_licensing', 'refused',
  'withdrawn', 'lapsed',
];
const TIERS: SsegRegistrationTier[] = ['micro', 'small', 'medium', 'large', 'utility'];

describe('W57 sseg-registration — terminals', () => {
  it('exactly five terminal states', () => {
    const terminals = ALL_STATUSES.filter(isTerminal);
    expect(terminals.sort()).toEqual(['lapsed', 'referred_to_licensing', 'refused', 'registered', 'withdrawn'].sort());
  });

  it('no action escapes a terminal', () => {
    for (const t of ['registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed'] as SsegRegistrationStatus[]) {
      for (const a of Object.keys(TRANSITIONS) as SsegRegistrationAction[]) {
        expect(nextStatus(t, a)).toBeNull();
      }
    }
  });
});

describe('W57 sseg-registration — happy path', () => {
  it('walks received → registered through every gate', () => {
    let s: SsegRegistrationStatus = 'registration_received';
    const path: [SsegRegistrationAction, SsegRegistrationStatus][] = [
      ['begin_screening', 'eligibility_screening'],
      ['begin_verification', 'technical_verification'],
      ['determine_exemption', 'exemption_determination'],
      ['approve_registration', 'registration_approved'],
      ['issue_certificate', 'registered'],
    ];
    for (const [a, expected] of path) {
      const to = nextStatus(s, a);
      expect(to).toBe(expected);
      s = to!;
    }
    expect(isTerminal(s)).toBe(true);
  });
});

describe('W57 sseg-registration — conditional-approval loop', () => {
  it('approve_with_conditions then satisfy_conditions reaches registration_approved', () => {
    expect(nextStatus('exemption_determination', 'approve_with_conditions')).toBe('conditions_pending');
    expect(nextStatus('conditions_pending', 'satisfy_conditions')).toBe('registration_approved');
  });

  it('approve_registration is reachable both directly and after conditions', () => {
    expect(nextStatus('exemption_determination', 'approve_registration')).toBe('registration_approved');
    expect(nextStatus('conditions_pending', 'approve_registration')).toBe('registration_approved');
  });
});

describe('W57 sseg-registration — information-gap loop', () => {
  it('request_info then submit_info round-trips back to eligibility_screening', () => {
    expect(nextStatus('eligibility_screening', 'request_info')).toBe('information_requested');
    expect(nextStatus('information_requested', 'submit_info')).toBe('eligibility_screening');
  });

  it('a non-responsive info request can lapse', () => {
    expect(nextStatus('information_requested', 'lapse')).toBe('lapsed');
  });

  it('lapse is only reachable from information_requested', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'lapse');
      if (s === 'information_requested') expect(r).toBe('lapsed');
      else expect(r).toBeNull();
    }
  });
});

describe('W57 sseg-registration — referral / refusal / withdraw', () => {
  it('refer_to_licensing only from exemption_determination (the W57 signature handoff)', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'refer_to_licensing');
      if (s === 'exemption_determination') expect(r).toBe('referred_to_licensing');
      else expect(r).toBeNull();
    }
  });

  it('refuse only from exemption_determination', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'refuse_registration');
      if (s === 'exemption_determination') expect(r).toBe('refused');
      else expect(r).toBeNull();
    }
  });

  it('withdraw allowed from the six pre-decision states only', () => {
    const allowed = new Set<SsegRegistrationStatus>([
      'registration_received', 'eligibility_screening', 'information_requested',
      'technical_verification', 'exemption_determination', 'conditions_pending',
    ]);
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'withdraw');
      if (allowed.has(s)) expect(r).toBe('withdrawn');
      else expect(r).toBeNull();
    }
  });

  it('isWithdrawable matches the withdraw transition set', () => {
    for (const s of ALL_STATUSES) {
      expect(isWithdrawable(s)).toBe(nextStatus(s, 'withdraw') === 'withdrawn');
    }
  });

  it('cannot withdraw once registration is approved or issued', () => {
    expect(nextStatus('registration_approved', 'withdraw')).toBeNull();
    expect(nextStatus('registered', 'withdraw')).toBeNull();
  });
});

describe('W57 sseg-registration — allowedActions', () => {
  it('exemption_determination offers approve / approve_with_conditions / refer / refuse', () => {
    expect(allowedActions('exemption_determination').sort()).toEqual(
      ['approve_registration', 'approve_with_conditions', 'refer_to_licensing', 'refuse_registration', 'withdraw'].sort(),
    );
  });

  it('eligibility_screening offers request_info, begin_verification, withdraw', () => {
    expect(allowedActions('eligibility_screening').sort()).toEqual(
      ['begin_verification', 'request_info', 'withdraw'].sort(),
    );
  });

  it('terminals offer nothing', () => {
    for (const t of ['registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed'] as SsegRegistrationStatus[]) {
      expect(allowedActions(t)).toEqual([]);
    }
  });
});

describe('W57 sseg-registration — capacity tiers', () => {
  it('classifies by kW thresholds', () => {
    expect(tierForCapacityKw(50)).toBe('micro');
    expect(tierForCapacityKw(99.9)).toBe('micro');
    expect(tierForCapacityKw(100)).toBe('small');
    expect(tierForCapacityKw(999)).toBe('small');
    expect(tierForCapacityKw(1000)).toBe('medium');
    expect(tierForCapacityKw(9999)).toBe('medium');
    expect(tierForCapacityKw(10000)).toBe('large');
    expect(tierForCapacityKw(99999)).toBe('large');
    expect(tierForCapacityKw(100000)).toBe('utility');
    expect(tierForCapacityKw(500000)).toBe('utility');
  });
});

describe('W57 sseg-registration — INVERTED SLA', () => {
  it('utility ≥ large ≥ medium ≥ small ≥ micro for every non-terminal window', () => {
    for (const s of ALL_STATUSES) {
      if (isTerminal(s)) continue;
      const u = SLA_MINUTES[s].utility;
      const l = SLA_MINUTES[s].large;
      const m = SLA_MINUTES[s].medium;
      const sm = SLA_MINUTES[s].small;
      const mi = SLA_MINUTES[s].micro;
      expect(u).toBeGreaterThanOrEqual(l);
      expect(l).toBeGreaterThanOrEqual(m);
      expect(m).toBeGreaterThanOrEqual(sm);
      expect(sm).toBeGreaterThanOrEqual(mi);
      expect(mi).toBeGreaterThan(0);
    }
  });

  it('terminal windows are zero', () => {
    for (const t of ['registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed'] as SsegRegistrationStatus[]) {
      for (const k of TIERS) expect(slaWindowMinutes(t, k)).toBe(0);
    }
  });

  it('slaDeadlineFor adds the window minutes; null for terminals', () => {
    const base = new Date('2026-05-01T00:00:00Z');
    const d = slaDeadlineFor('technical_verification', 'utility', base);
    expect(d!.getTime() - base.getTime()).toBe(30 * 24 * 60 * 60000);
    expect(slaDeadlineFor('registered', 'utility', base)).toBeNull();
  });
});

describe('W57 sseg-registration — reportability', () => {
  it('refer_to_licensing crosses for EVERY tier (universal — the W57 signature)', () => {
    for (const k of TIERS) expect(crossesIntoRegulator('refer_to_licensing', k)).toBe(true);
  });

  it('refuse crosses for large + utility only', () => {
    expect(crossesIntoRegulator('refuse_registration', 'micro')).toBe(false);
    expect(crossesIntoRegulator('refuse_registration', 'small')).toBe(false);
    expect(crossesIntoRegulator('refuse_registration', 'medium')).toBe(false);
    expect(crossesIntoRegulator('refuse_registration', 'large')).toBe(true);
    expect(crossesIntoRegulator('refuse_registration', 'utility')).toBe(true);
  });

  it('routine actions never cross', () => {
    for (const a of ['begin_screening', 'request_info', 'begin_verification', 'determine_exemption', 'approve_registration', 'approve_with_conditions', 'satisfy_conditions', 'issue_certificate', 'withdraw', 'lapse'] as SsegRegistrationAction[]) {
      for (const k of TIERS) expect(crossesIntoRegulator(a, k)).toBe(false);
    }
  });

  it('SLA breach crosses for large + utility only', () => {
    expect(slaBreachCrossesIntoRegulator('micro')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('utility')).toBe(true);
  });

  it('isLargeTier = large or utility', () => {
    expect(isLargeTier('large')).toBe(true);
    expect(isLargeTier('utility')).toBe(true);
    expect(isLargeTier('medium')).toBe(false);
  });
});

describe('W57 sseg-registration — grid-impact study', () => {
  it('mandatory for large + utility, light check below', () => {
    expect(mandatoryGridStudy('utility')).toBe(true);
    expect(mandatoryGridStudy('large')).toBe(true);
    expect(mandatoryGridStudy('medium')).toBe(false);
    expect(mandatoryGridStudy('small')).toBe(false);
    expect(mandatoryGridStudy('micro')).toBe(false);
  });
});

describe('W57 sseg-registration — actor party + write split', () => {
  it('committee makes the exemption determination decisions', () => {
    expect(partyForAction('approve_registration')).toBe('committee');
    expect(partyForAction('approve_with_conditions')).toBe('committee');
    expect(partyForAction('refer_to_licensing')).toBe('committee');
    expect(partyForAction('refuse_registration')).toBe('committee');
  });

  it('verifier runs verification + determination opening', () => {
    expect(partyForAction('begin_verification')).toBe('verifier');
    expect(partyForAction('determine_exemption')).toBe('verifier');
  });

  it('registry handles intake, info requests, issuance, lapse', () => {
    for (const a of ['begin_screening', 'request_info', 'issue_certificate', 'lapse'] as SsegRegistrationAction[]) {
      expect(partyForAction(a)).toBe('registry');
    }
  });

  it('applicant supplies info, satisfies conditions, withdraws', () => {
    expect(partyForAction('submit_info')).toBe('applicant');
    expect(partyForAction('satisfy_conditions')).toBe('applicant');
    expect(partyForAction('withdraw')).toBe('applicant');
  });

  it('isApplicantAction marks exactly submit_info + satisfy_conditions + withdraw', () => {
    for (const a of Object.keys(TRANSITIONS) as SsegRegistrationAction[]) {
      const expected = a === 'submit_info' || a === 'satisfy_conditions' || a === 'withdraw';
      expect(isApplicantAction(a)).toBe(expected);
    }
  });
});
