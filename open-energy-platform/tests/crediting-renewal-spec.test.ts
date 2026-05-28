import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES, MATERIAL_DOWNGRADE_PCT,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForAnnualIssuance, baselineReductionPct,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, partyForAction,
  type RenewalStatus, type RenewalTier, type RenewalAction,
} from '../src/utils/crediting-renewal-spec';

describe('W56 crediting-period renewal chain — state machine', () => {
  it('happy path: due→submitted→completeness→baseline→additionality→vvb→review→renewed', () => {
    let s: RenewalStatus = 'renewal_due';
    s = nextStatus(s, 'submit_application')!;          expect(s).toBe('application_submitted');
    s = nextStatus(s, 'check_completeness')!;          expect(s).toBe('completeness_check');
    s = nextStatus(s, 'begin_baseline_reassessment')!; expect(s).toBe('baseline_reassessment');
    s = nextStatus(s, 'complete_baseline')!;           expect(s).toBe('additionality_retest');
    s = nextStatus(s, 'complete_additionality')!;      expect(s).toBe('vvb_validation');
    s = nextStatus(s, 'validate')!;                    expect(s).toBe('standard_review');
    s = nextStatus(s, 'renew')!;                       expect(s).toBe('renewed');
    expect(isTerminal('renewed')).toBe(true);
  });

  it('revision loop: completeness→revision_requested→(resubmit)→completeness', () => {
    expect(nextStatus('completeness_check', 'request_revision')).toBe('revision_requested');
    expect(nextStatus('revision_requested', 'resubmit')).toBe('completeness_check');
  });

  it('check_completeness and resubmit both land in completeness_check', () => {
    expect(nextStatus('application_submitted', 'check_completeness')).toBe('completeness_check');
    expect(nextStatus('revision_requested', 'resubmit')).toBe('completeness_check');
  });

  it('refused reachable only from standard_review', () => {
    expect(nextStatus('standard_review', 'refuse')).toBe('refused');
    expect(nextStatus('vvb_validation', 'refuse')).toBeNull();
    expect(nextStatus('baseline_reassessment', 'refuse')).toBeNull();
    expect(isTerminal('refused')).toBe(true);
  });

  it('renew reachable only from standard_review', () => {
    expect(nextStatus('standard_review', 'renew')).toBe('renewed');
    expect(nextStatus('vvb_validation', 'renew')).toBeNull();
    expect(nextStatus('renewal_due', 'renew')).toBeNull();
  });

  it('lapse (time-driven) reachable only from renewal_due', () => {
    expect(nextStatus('renewal_due', 'lapse')).toBe('lapsed');
    expect(nextStatus('application_submitted', 'lapse')).toBeNull();
    expect(nextStatus('completeness_check', 'lapse')).toBeNull();
    expect(isTerminal('lapsed')).toBe(true);
  });

  it('withdraw reachable only from pre-decision states', () => {
    expect(nextStatus('renewal_due', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('application_submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('completeness_check', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('revision_requested', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('baseline_reassessment', 'withdraw')).toBeNull();
    expect(nextStatus('standard_review', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the pre-decision set', () => {
    expect(isWithdrawable('renewal_due')).toBe(true);
    expect(isWithdrawable('application_submitted')).toBe(true);
    expect(isWithdrawable('completeness_check')).toBe(true);
    expect(isWithdrawable('revision_requested')).toBe(true);
    expect(isWithdrawable('baseline_reassessment')).toBe(false);
    expect(isWithdrawable('standard_review')).toBe(false);
    expect(isWithdrawable('renewed')).toBe(false);
  });

  it('all four terminals accept no further transitions', () => {
    expect(allowedActions('renewed')).toEqual([]);
    expect(allowedActions('refused')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
    expect(allowedActions('lapsed')).toEqual([]);
  });

  it('standard_review fans out to renew / refuse', () => {
    const acts = allowedActions('standard_review');
    expect(acts).toContain('renew');
    expect(acts).toContain('refuse');
    expect(acts).not.toContain('validate');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('renewal_due', 'check_completeness')).toBeNull();
    expect(nextStatus('application_submitted', 'complete_baseline')).toBeNull();
    expect(nextStatus('completeness_check', 'validate')).toBeNull();
    expect(nextStatus('baseline_reassessment', 'complete_additionality')).toBeNull();
    expect(nextStatus('renewed', 'renew')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: RenewalAction[] = [
      'submit_application', 'check_completeness', 'request_revision', 'resubmit',
      'begin_baseline_reassessment', 'complete_baseline', 'complete_additionality',
      'validate', 'renew', 'refuse', 'withdraw', 'lapse',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W56 crediting-period renewal chain — INVERTED SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const DAY = 24 * 60;

  it('mega is the LONGEST window at every active stage; minor the shortest', () => {
    const active: RenewalStatus[] = [
      'renewal_due', 'application_submitted', 'completeness_check', 'revision_requested',
      'baseline_reassessment', 'additionality_retest', 'vvb_validation', 'standard_review',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].mega).toBeGreaterThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeGreaterThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeGreaterThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeGreaterThan(SLA_MINUTES[st].minor);
    }
  });

  it('renewal_due: mega 120d, minor 30d', () => {
    expect(SLA_MINUTES.renewal_due.mega).toBe(120 * DAY);
    expect(SLA_MINUTES.renewal_due.minor).toBe(30 * DAY);
  });

  it('standard_review: mega 60d, minor 14d', () => {
    expect(SLA_MINUTES.standard_review.mega).toBe(60 * DAY);
    expect(SLA_MINUTES.standard_review.minor).toBe(14 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('baseline_reassessment', 'mega', base);
    expect(d!.getTime() - base.getTime()).toBe(60 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('standard_review', 'minor')).toBe(14 * DAY);
    expect(slaWindowMinutes('renewed', 'mega')).toBe(0);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('renewed', 'mega', base)).toBeNull();
    expect(slaDeadlineFor('refused', 'mega', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'mega', base)).toBeNull();
    expect(slaDeadlineFor('lapsed', 'mega', base)).toBeNull();
  });
});

describe('W56 crediting-period renewal chain — issuance tiering', () => {
  it('tierForAnnualIssuance boundaries', () => {
    expect(tierForAnnualIssuance(0)).toBe('minor');
    expect(tierForAnnualIssuance(9999)).toBe('minor');
    expect(tierForAnnualIssuance(10000)).toBe('moderate');
    expect(tierForAnnualIssuance(99999)).toBe('moderate');
    expect(tierForAnnualIssuance(100000)).toBe('material');
    expect(tierForAnnualIssuance(499999)).toBe('material');
    expect(tierForAnnualIssuance(500000)).toBe('major');
    expect(tierForAnnualIssuance(1999999)).toBe('major');
    expect(tierForAnnualIssuance(2000000)).toBe('mega');
    expect(tierForAnnualIssuance(5000000)).toBe('mega');
  });

  it('isLargeTier — major + mega only', () => {
    expect(isLargeTier('mega')).toBe(true);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('W56 crediting-period renewal chain — baseline reassessment', () => {
  it('baselineReductionPct = (original - revised) / original * 100', () => {
    expect(baselineReductionPct(100000, 70000)).toBeCloseTo(30, 6);
    expect(baselineReductionPct(200000, 100000)).toBeCloseTo(50, 6);
    expect(baselineReductionPct(100000, 100000)).toBe(0);
  });

  it('a baseline INCREASE (or zero original) clamps to 0% reduction', () => {
    expect(baselineReductionPct(100000, 120000)).toBe(0);
    expect(baselineReductionPct(0, 50000)).toBe(0);
    expect(baselineReductionPct(-5, 50000)).toBe(0);
  });

  it('MATERIAL_DOWNGRADE_PCT threshold is 30', () => {
    expect(MATERIAL_DOWNGRADE_PCT).toBe(30);
  });
});

describe('W56 crediting-period renewal chain — reportability (the signature)', () => {
  const tiers: RenewalTier[] = ['minor', 'moderate', 'material', 'major', 'mega'];

  it('renew crosses for EVERY tier when baseline downgrade ≥30% (the signature)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('renew', t, 30)).toBe(true);
      expect(crossesIntoRegulator('renew', t, 55)).toBe(true);
    }
  });

  it('renew does NOT cross when the downgrade is below threshold', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('renew', t, 29.9)).toBe(false);
      expect(crossesIntoRegulator('renew', t, 0)).toBe(false);
      expect(crossesIntoRegulator('renew', t)).toBe(false);
    }
  });

  it('refuse crosses for the large tiers only (major + mega)', () => {
    expect(crossesIntoRegulator('refuse', 'mega')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'major')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'material')).toBe(false);
    expect(crossesIntoRegulator('refuse', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('refuse', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: RenewalAction[] = [
      'submit_application', 'check_completeness', 'request_revision', 'resubmit',
      'begin_baseline_reassessment', 'complete_baseline', 'complete_additionality',
      'validate', 'withdraw', 'lapse',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t, 99)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the large tiers only (major + mega)', () => {
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W56 crediting-period renewal chain — party attribution', () => {
  it('proponent owns submission / resubmission / withdrawal', () => {
    expect(partyForAction('submit_application')).toBe('proponent');
    expect(partyForAction('resubmit')).toBe('proponent');
    expect(partyForAction('withdraw')).toBe('proponent');
  });

  it('registry owns completeness / baseline / additionality / decision / lapse', () => {
    expect(partyForAction('check_completeness')).toBe('registry');
    expect(partyForAction('request_revision')).toBe('registry');
    expect(partyForAction('begin_baseline_reassessment')).toBe('registry');
    expect(partyForAction('complete_baseline')).toBe('registry');
    expect(partyForAction('complete_additionality')).toBe('registry');
    expect(partyForAction('renew')).toBe('registry');
    expect(partyForAction('refuse')).toBe('registry');
    expect(partyForAction('lapse')).toBe('registry');
  });

  it('vvb owns the independent validation of the renewed baseline', () => {
    expect(partyForAction('validate')).toBe('vvb');
  });
});
