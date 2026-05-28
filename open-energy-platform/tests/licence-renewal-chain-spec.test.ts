import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  SLA_MINUTES,
  slaDeadlineFor,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  classForCapacityMw,
  LicenceRenewalStatus,
  LicenceRenewalAction,
  LicenceClass,
} from '../src/utils/licence-renewal-chain-spec';

describe('licence renewal chain — happy path', () => {
  it('walks renewal_initiated → application_filed → completeness_check → public_consultation → evaluation → decision_drafted → council_voted → granted', () => {
    let s: LicenceRenewalStatus = 'renewal_initiated';
    const path: [LicenceRenewalAction, LicenceRenewalStatus][] = [
      ['file_application', 'application_filed'],
      ['check_completeness', 'completeness_check'],
      ['open_consultation', 'public_consultation'],
      ['start_evaluation', 'evaluation'],
      ['draft_decision', 'decision_drafted'],
      ['council_vote', 'council_voted'],
      ['grant', 'granted'],
    ];
    for (const [a, expected] of path) {
      const n = nextStatus(s, a);
      expect(n, `nextStatus(${s}, ${a})`).toBe(expected);
      s = expected;
    }
    expect(isTerminal(s)).toBe(true);
  });

  it('council_voted can branch to amended', () => {
    expect(nextStatus('council_voted', 'amend')).toBe('amended');
    expect(isTerminal('amended')).toBe(true);
  });

  it('council_voted can branch to refused', () => {
    expect(nextStatus('council_voted', 'refuse')).toBe('refused');
    expect(isTerminal('refused')).toBe(true);
  });
});

describe('licence renewal chain — withdraw branch', () => {
  const sources: LicenceRenewalStatus[] = [
    'renewal_initiated',
    'application_filed',
    'completeness_check',
    'public_consultation',
    'evaluation',
    'decision_drafted',
  ];
  for (const src of sources) {
    it(`can withdraw from ${src}`, () => {
      expect(nextStatus(src, 'withdraw')).toBe('withdrawn');
    });
  }

  it('cannot withdraw from council_voted (must take Council decision)', () => {
    expect(nextStatus('council_voted', 'withdraw')).toBeNull();
  });

  it('withdrawn is terminal', () => {
    expect(isTerminal('withdrawn')).toBe(true);
  });
});

describe('licence renewal chain — terminals reject all actions', () => {
  const terminals: LicenceRenewalStatus[] = ['granted', 'amended', 'refused', 'withdrawn'];
  const actions: LicenceRenewalAction[] = [
    'file_application',
    'check_completeness',
    'open_consultation',
    'start_evaluation',
    'draft_decision',
    'council_vote',
    'grant',
    'amend',
    'refuse',
    'withdraw',
  ];
  for (const t of terminals) {
    for (const a of actions) {
      it(`${t} rejects ${a}`, () => {
        expect(nextStatus(t, a)).toBeNull();
      });
    }
    it(`${t} allowedActions is empty`, () => {
      expect(allowedActions(t)).toEqual([]);
    });
  }
});

describe('licence renewal chain — allowedActions sanity', () => {
  it('renewal_initiated allows file_application + withdraw', () => {
    expect(allowedActions('renewal_initiated').sort()).toEqual(['file_application', 'withdraw'].sort());
  });

  it('council_voted allows grant + amend + refuse only', () => {
    expect(allowedActions('council_voted').sort()).toEqual(['amend', 'grant', 'refuse'].sort());
  });

  it('evaluation allows draft_decision + withdraw', () => {
    expect(allowedActions('evaluation').sort()).toEqual(['draft_decision', 'withdraw'].sort());
  });
});

describe('licence renewal chain — INVERTED SLA matrix', () => {
  it('evaluation SLA: utility > distribution > embedded > sseg > trading', () => {
    const e = SLA_MINUTES.evaluation;
    expect(e.generation_utility).toBeGreaterThan(e.distribution);
    expect(e.distribution).toBeGreaterThan(e.generation_embedded);
    expect(e.generation_embedded).toBeGreaterThan(e.generation_sseg);
    expect(e.generation_sseg).toBeGreaterThan(e.trading);
  });

  it('evaluation utility anchors at 180 days (s14 6-month statutory window)', () => {
    expect(SLA_MINUTES.evaluation.generation_utility).toBe(180 * 24 * 60);
  });

  it('public_consultation utility ≥ 90d (s10 30d minimum extended for utility)', () => {
    expect(SLA_MINUTES.public_consultation.generation_utility).toBeGreaterThanOrEqual(90 * 24 * 60);
  });

  it('council_voted is fixed 14d regardless of tier (Council cycle)', () => {
    const c = SLA_MINUTES.council_voted;
    expect(c.generation_utility).toBe(c.distribution);
    expect(c.distribution).toBe(c.trading);
    expect(c.trading).toBe(14 * 24 * 60);
  });

  it('terminal states have 0 SLA minutes', () => {
    for (const t of ['granted', 'amended', 'refused', 'withdrawn'] as const) {
      const row = SLA_MINUTES[t];
      for (const k of ['generation_utility', 'generation_embedded', 'generation_sseg', 'distribution', 'trading'] as const) {
        expect(row[k]).toBe(0);
      }
    }
  });

  it('slaDeadlineFor returns null for terminal states (0-minute SLA)', () => {
    for (const t of ['granted', 'amended', 'refused', 'withdrawn'] as const) {
      expect(slaDeadlineFor(t, 'generation_utility', new Date())).toBeNull();
    }
  });

  it('slaDeadlineFor returns deadline for non-terminal states', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    const deadline = slaDeadlineFor('evaluation', 'generation_utility', enteredAt);
    expect(deadline).not.toBeNull();
    // 180 days from 2026-01-01
    expect(deadline?.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });
});

describe('licence renewal chain — regulator crossings', () => {
  it('refused crosses for ALL tiers', () => {
    expect(crossesIntoRegulator('refuse', 'generation_utility')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'generation_embedded')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'generation_sseg')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'distribution')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'trading')).toBe(true);
  });

  it('grant/amend cross for generation_utility ONLY', () => {
    expect(crossesIntoRegulator('grant', 'generation_utility')).toBe(true);
    expect(crossesIntoRegulator('amend', 'generation_utility')).toBe(true);
    expect(crossesIntoRegulator('grant', 'generation_embedded')).toBe(false);
    expect(crossesIntoRegulator('amend', 'distribution')).toBe(false);
    expect(crossesIntoRegulator('grant', 'trading')).toBe(false);
  });

  it('withdraw never crosses', () => {
    for (const k of ['generation_utility', 'generation_embedded', 'distribution', 'trading'] as const) {
      expect(crossesIntoRegulator('withdraw', k)).toBe(false);
    }
  });

  it('sla_breached crosses for ALL tiers (s14(2)(b) statutory)', () => {
    for (const k of ['generation_utility', 'generation_embedded', 'generation_sseg', 'distribution', 'trading'] as const) {
      expect(slaBreachCrossesIntoRegulator(k)).toBe(true);
    }
  });

  it('isReportable utility tier only', () => {
    expect(isReportable('generation_utility')).toBe(true);
    expect(isReportable('generation_embedded')).toBe(false);
    expect(isReportable('distribution')).toBe(false);
    expect(isReportable('trading')).toBe(false);
  });
});

describe('licence renewal chain — class classification', () => {
  it('classForCapacityMw distribution → distribution (mw ignored)', () => {
    expect(classForCapacityMw('distribution', 0)).toBe('distribution');
    expect(classForCapacityMw('distribution', 500)).toBe('distribution');
  });

  it('classForCapacityMw trading → trading (mw ignored)', () => {
    expect(classForCapacityMw('trading', 0)).toBe('trading');
  });

  it('classForCapacityMw generation: ≥100MW utility, 1-100MW embedded, <1MW sseg', () => {
    expect(classForCapacityMw('generation', 250)).toBe('generation_utility');
    expect(classForCapacityMw('generation', 100)).toBe('generation_utility');
    expect(classForCapacityMw('generation', 99.9)).toBe('generation_embedded');
    expect(classForCapacityMw('generation', 1)).toBe('generation_embedded');
    expect(classForCapacityMw('generation', 0.99)).toBe('generation_sseg');
    expect(classForCapacityMw('generation', 0.001)).toBe('generation_sseg');
  });
});
