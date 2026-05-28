import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, isBreachDeclaration, partyForAction, isBorrowerAction,
  type CovCertStatus, type CovCertTier,
} from '../src/utils/covenant-certificate-spec';

describe('W38 covenant-certificate chain — state machine', () => {
  it('happy path: due→submitted→review→verified→compliant', () => {
    let s: CovCertStatus = 'certificate_due';
    s = nextStatus(s, 'submit_certificate')!; expect(s).toBe('certificate_submitted');
    s = nextStatus(s, 'begin_review')!;        expect(s).toBe('under_review');
    s = nextStatus(s, 'verify_ratios')!;       expect(s).toBe('ratios_verified');
    s = nextStatus(s, 'confirm_compliant')!;   expect(s).toBe('compliant');
    expect(isTerminal('compliant')).toBe(true);
  });

  it('breach → waiver branch: breach→waiver_requested→waiver_granted', () => {
    let s: CovCertStatus = 'breach_identified';
    s = nextStatus(s, 'request_waiver')!; expect(s).toBe('waiver_requested');
    s = nextStatus(s, 'grant_waiver')!;   expect(s).toBe('waiver_granted');
    expect(isTerminal('waiver_granted')).toBe(true);
  });

  it('breach → cure branch: breach→cure_period→cured', () => {
    let s: CovCertStatus = 'breach_identified';
    s = nextStatus(s, 'require_cure')!;  expect(s).toBe('cure_period');
    s = nextStatus(s, 'confirm_cured')!; expect(s).toBe('cured');
    expect(isTerminal('cured')).toBe(true);
  });

  it('require_cure also reachable from waiver_requested (waiver denied → cure)', () => {
    expect(nextStatus('waiver_requested', 'require_cure')).toBe('cure_period');
  });

  it('breach reachable from under_review and ratios_verified', () => {
    expect(nextStatus('under_review', 'flag_breach')).toBe('breach_identified');
    expect(nextStatus('ratios_verified', 'flag_breach')).toBe('breach_identified');
  });

  it('information-covenant breach: non-submission from certificate_due', () => {
    expect(nextStatus('certificate_due', 'flag_non_submission')).toBe('breach_identified');
  });

  it('acceleration reachable from breach, waiver_requested, and cure_period', () => {
    expect(nextStatus('breach_identified', 'accelerate')).toBe('accelerated');
    expect(nextStatus('waiver_requested', 'accelerate')).toBe('accelerated');
    expect(nextStatus('cure_period', 'accelerate')).toBe('accelerated');
    expect(isTerminal('accelerated')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('compliant')).toEqual([]);
    expect(allowedActions('waiver_granted')).toEqual([]);
    expect(allowedActions('cured')).toEqual([]);
    expect(allowedActions('accelerated')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('certificate_due', 'verify_ratios')).toBeNull();
    expect(nextStatus('certificate_submitted', 'confirm_compliant')).toBeNull();
    expect(nextStatus('ratios_verified', 'request_waiver')).toBeNull();
    expect(nextStatus('compliant', 'flag_breach')).toBeNull();
    expect(nextStatus('certificate_due', 'accelerate')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'submit_certificate', 'begin_review', 'verify_ratios', 'confirm_compliant',
      'flag_breach', 'flag_non_submission', 'request_waiver', 'grant_waiver',
      'require_cure', 'confirm_cured', 'accelerate',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for breach_identified offers waiver / cure / accelerate', () => {
    const actions = allowedActions('breach_identified');
    expect(actions).toContain('request_waiver');
    expect(actions).toContain('require_cure');
    expect(actions).toContain('accelerate');
  });

  it('allowedActions for certificate_due offers submit / non-submission', () => {
    const actions = allowedActions('certificate_due');
    expect(actions).toContain('submit_certificate');
    expect(actions).toContain('flag_non_submission');
  });
});

describe('W38 covenant-certificate chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('senior secured is tightest across every active state', () => {
    const states: CovCertStatus[] = [
      'certificate_due', 'certificate_submitted', 'under_review',
      'ratios_verified', 'breach_identified', 'waiver_requested', 'cure_period',
    ];
    for (const st of states) {
      expect(SLA_MINUTES[st].senior_secured).toBeLessThan(SLA_MINUTES[st].mezzanine);
      expect(SLA_MINUTES[st].mezzanine).toBeLessThan(SLA_MINUTES[st].subordinated);
    }
  });

  it('certificate delivery window: senior 30d, sub 60d', () => {
    expect(SLA_MINUTES.certificate_due.senior_secured).toBe(30 * DAY);
    expect(SLA_MINUTES.certificate_due.subordinated).toBe(60 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('breach_identified', 'senior_secured', base);
    expect(d!.getTime() - base.getTime()).toBe(5 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('compliant', 'senior_secured', base)).toBeNull();
    expect(slaDeadlineFor('waiver_granted', 'senior_secured', base)).toBeNull();
    expect(slaDeadlineFor('cured', 'senior_secured', base)).toBeNull();
    expect(slaDeadlineFor('accelerated', 'senior_secured', base)).toBeNull();
  });
});

describe('W38 covenant-certificate chain — reportability / regulator crossings', () => {
  const tiers: CovCertTier[] = ['senior_secured', 'mezzanine', 'subordinated'];

  it('accelerate (event of default) crosses for EVERY tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('accelerate', t)).toBe(true);
    }
  });

  it('breach declarations cross for senior + mezzanine only', () => {
    expect(crossesIntoRegulator('flag_breach', 'senior_secured')).toBe(true);
    expect(crossesIntoRegulator('flag_breach', 'mezzanine')).toBe(true);
    expect(crossesIntoRegulator('flag_breach', 'subordinated')).toBe(false);
    expect(crossesIntoRegulator('flag_non_submission', 'senior_secured')).toBe(true);
    expect(crossesIntoRegulator('flag_non_submission', 'subordinated')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('submit_certificate', t)).toBe(false);
      expect(crossesIntoRegulator('begin_review', t)).toBe(false);
      expect(crossesIntoRegulator('verify_ratios', t)).toBe(false);
      expect(crossesIntoRegulator('confirm_compliant', t)).toBe(false);
      expect(crossesIntoRegulator('request_waiver', t)).toBe(false);
      expect(crossesIntoRegulator('grant_waiver', t)).toBe(false);
      expect(crossesIntoRegulator('require_cure', t)).toBe(false);
      expect(crossesIntoRegulator('confirm_cured', t)).toBe(false);
    }
  });

  it('sla_breach crosses senior + mezzanine only', () => {
    expect(slaBreachCrossesIntoRegulator('senior_secured')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mezzanine')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('subordinated')).toBe(false);
  });

  it('isReportableTier + isBreachDeclaration helpers', () => {
    expect(isReportableTier('senior_secured')).toBe(true);
    expect(isReportableTier('subordinated')).toBe(false);
    expect(isBreachDeclaration('flag_breach')).toBe(true);
    expect(isBreachDeclaration('flag_non_submission')).toBe(true);
    expect(isBreachDeclaration('confirm_compliant')).toBe(false);
  });
});

describe('W38 covenant-certificate chain — party attribution + borrower split', () => {
  it('borrower delivers certificates + requests waivers', () => {
    expect(partyForAction('submit_certificate')).toBe('borrower');
    expect(partyForAction('request_waiver')).toBe('borrower');
  });

  it('agent reviews / verifies / requires cure', () => {
    expect(partyForAction('begin_review')).toBe('agent');
    expect(partyForAction('verify_ratios')).toBe('agent');
    expect(partyForAction('confirm_compliant')).toBe('agent');
    expect(partyForAction('flag_breach')).toBe('agent');
    expect(partyForAction('flag_non_submission')).toBe('agent');
    expect(partyForAction('require_cure')).toBe('agent');
    expect(partyForAction('confirm_cured')).toBe('agent');
  });

  it('lenders grant waivers + accelerate', () => {
    expect(partyForAction('grant_waiver')).toBe('lender');
    expect(partyForAction('accelerate')).toBe('lender');
  });

  it('borrower-write set is exactly submit_certificate + request_waiver', () => {
    expect(isBorrowerAction('submit_certificate')).toBe(true);
    expect(isBorrowerAction('request_waiver')).toBe(true);
    expect(isBorrowerAction('begin_review')).toBe(false);
    expect(isBorrowerAction('accelerate')).toBe(false);
  });
});
