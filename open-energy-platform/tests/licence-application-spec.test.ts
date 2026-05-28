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
  isMaterialClass,
  mandatoryPublicParticipation,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  isApplicantAction,
  type LicenceApplicationStatus,
  type LicenceApplicationAction,
  type LicenceApplicationClass,
} from '../src/utils/licence-application-spec';

const ALL_STATUSES: LicenceApplicationStatus[] = [
  'application_received', 'completeness_review', 'additional_info_requested', 'accepted',
  'public_participation', 'technical_evaluation', 'council_decision', 'licence_granted',
  'licence_issued', 'refused', 'withdrawn', 'lapsed',
];
const CLASSES: LicenceApplicationClass[] = ['major_licence', 'standard_licence', 'minor_licence'];

describe('W49 licence-application — terminals', () => {
  it('exactly four terminal states', () => {
    const terminals = ALL_STATUSES.filter(isTerminal);
    expect(terminals.sort()).toEqual(['lapsed', 'licence_issued', 'refused', 'withdrawn']);
  });

  it('no action escapes a terminal', () => {
    for (const t of ['licence_issued', 'refused', 'withdrawn', 'lapsed'] as LicenceApplicationStatus[]) {
      for (const a of Object.keys(TRANSITIONS) as LicenceApplicationAction[]) {
        expect(nextStatus(t, a)).toBeNull();
      }
    }
  });
});

describe('W49 licence-application — happy path', () => {
  it('walks received → issued through every gate', () => {
    let s: LicenceApplicationStatus = 'application_received';
    const path: [LicenceApplicationAction, LicenceApplicationStatus][] = [
      ['begin_review', 'completeness_review'],
      ['accept_application', 'accepted'],
      ['open_participation', 'public_participation'],
      ['begin_evaluation', 'technical_evaluation'],
      ['refer_to_council', 'council_decision'],
      ['grant_licence', 'licence_granted'],
      ['issue_licence', 'licence_issued'],
    ];
    for (const [a, expected] of path) {
      const to = nextStatus(s, a);
      expect(to).toBe(expected);
      s = to!;
    }
    expect(isTerminal(s)).toBe(true);
  });
});

describe('W49 licence-application — information-gap loop', () => {
  it('request_info then submit_info round-trips back to completeness_review', () => {
    expect(nextStatus('completeness_review', 'request_info')).toBe('additional_info_requested');
    expect(nextStatus('additional_info_requested', 'submit_info')).toBe('completeness_review');
  });

  it('a non-responsive info request can lapse', () => {
    expect(nextStatus('additional_info_requested', 'lapse')).toBe('lapsed');
  });

  it('lapse is only reachable from additional_info_requested', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'lapse');
      if (s === 'additional_info_requested') expect(r).toBe('lapsed');
      else expect(r).toBeNull();
    }
  });
});

describe('W49 licence-application — refusal + withdraw', () => {
  it('refuse only from council_decision', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'refuse_licence');
      if (s === 'council_decision') expect(r).toBe('refused');
      else expect(r).toBeNull();
    }
  });

  it('withdraw allowed from the five pre-evaluation states only', () => {
    const allowed = new Set<LicenceApplicationStatus>([
      'application_received', 'completeness_review', 'additional_info_requested', 'accepted', 'public_participation',
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

  it('cannot withdraw once technical evaluation has begun', () => {
    expect(nextStatus('technical_evaluation', 'withdraw')).toBeNull();
    expect(nextStatus('council_decision', 'withdraw')).toBeNull();
  });
});

describe('W49 licence-application — allowedActions', () => {
  it('council_decision offers grant + refuse only', () => {
    expect(allowedActions('council_decision').sort()).toEqual(['grant_licence', 'refuse_licence']);
  });

  it('completeness_review offers request_info, accept, withdraw', () => {
    expect(allowedActions('completeness_review').sort()).toEqual(['accept_application', 'request_info', 'withdraw']);
  });

  it('terminals offer nothing', () => {
    for (const t of ['licence_issued', 'refused', 'withdrawn', 'lapsed'] as LicenceApplicationStatus[]) {
      expect(allowedActions(t)).toEqual([]);
    }
  });
});

describe('W49 licence-application — INVERTED SLA', () => {
  it('major ≥ standard ≥ minor for every non-terminal active window', () => {
    for (const s of ALL_STATUSES) {
      if (isTerminal(s)) continue;
      const maj = SLA_MINUTES[s].major_licence;
      const std = SLA_MINUTES[s].standard_licence;
      const min = SLA_MINUTES[s].minor_licence;
      expect(maj).toBeGreaterThanOrEqual(std);
      expect(std).toBeGreaterThanOrEqual(min);
      expect(min).toBeGreaterThan(0);
    }
  });

  it('terminal windows are zero', () => {
    for (const t of ['licence_issued', 'refused', 'withdrawn', 'lapsed'] as LicenceApplicationStatus[]) {
      for (const k of CLASSES) expect(slaWindowMinutes(t, k)).toBe(0);
    }
  });

  it('slaDeadlineFor adds the window minutes; null for terminals', () => {
    const base = new Date('2026-05-01T00:00:00Z');
    const d = slaDeadlineFor('technical_evaluation', 'major_licence', base);
    expect(d!.getTime() - base.getTime()).toBe(90 * 24 * 60 * 60000);
    expect(slaDeadlineFor('licence_issued', 'major_licence', base)).toBeNull();
  });
});

describe('W49 licence-application — reportability', () => {
  it('refuse crosses for EVERY class (universal — the W49 signature)', () => {
    for (const k of CLASSES) expect(crossesIntoRegulator('refuse_licence', k)).toBe(true);
  });

  it('grant crosses for major only', () => {
    expect(crossesIntoRegulator('grant_licence', 'major_licence')).toBe(true);
    expect(crossesIntoRegulator('grant_licence', 'standard_licence')).toBe(false);
    expect(crossesIntoRegulator('grant_licence', 'minor_licence')).toBe(false);
  });

  it('routine actions never cross', () => {
    for (const a of ['begin_review', 'accept_application', 'open_participation', 'begin_evaluation', 'issue_licence', 'withdraw', 'lapse'] as LicenceApplicationAction[]) {
      for (const k of CLASSES) expect(crossesIntoRegulator(a, k)).toBe(false);
    }
  });

  it('SLA breach crosses for material classes only', () => {
    expect(slaBreachCrossesIntoRegulator('major_licence')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('standard_licence')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('minor_licence')).toBe(false);
  });

  it('isMaterialClass = major or standard', () => {
    expect(isMaterialClass('major_licence')).toBe(true);
    expect(isMaterialClass('standard_licence')).toBe(true);
    expect(isMaterialClass('minor_licence')).toBe(false);
  });
});

describe('W49 licence-application — public participation', () => {
  it('mandatory for material classes, light path for minor', () => {
    expect(mandatoryPublicParticipation('major_licence')).toBe(true);
    expect(mandatoryPublicParticipation('standard_licence')).toBe(true);
    expect(mandatoryPublicParticipation('minor_licence')).toBe(false);
  });
});

describe('W49 licence-application — actor party + write split', () => {
  it('council decides grant + refuse', () => {
    expect(partyForAction('grant_licence')).toBe('council');
    expect(partyForAction('refuse_licence')).toBe('council');
  });

  it('evaluator runs evaluation + referral', () => {
    expect(partyForAction('begin_evaluation')).toBe('evaluator');
    expect(partyForAction('refer_to_council')).toBe('evaluator');
  });

  it('registry handles intake, logistics, issuance, lapse', () => {
    for (const a of ['begin_review', 'request_info', 'accept_application', 'open_participation', 'issue_licence', 'lapse'] as LicenceApplicationAction[]) {
      expect(partyForAction(a)).toBe('registry');
    }
  });

  it('applicant supplies info + withdraws', () => {
    expect(partyForAction('submit_info')).toBe('applicant');
    expect(partyForAction('withdraw')).toBe('applicant');
  });

  it('isApplicantAction marks exactly submit_info + withdraw', () => {
    for (const a of Object.keys(TRANSITIONS) as LicenceApplicationAction[]) {
      const expected = a === 'submit_info' || a === 'withdraw';
      expect(isApplicantAction(a)).toBe(expected);
    }
  });
});
