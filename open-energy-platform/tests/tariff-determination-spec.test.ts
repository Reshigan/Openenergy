import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableClass, isJudicialRemit, partyForAction, isApplicantAction,
  type TariffDeterminationStatus, type TariffDeterminationClass,
} from '../src/utils/tariff-determination-spec';

describe('W43 tariff-determination chain — state machine', () => {
  it('happy path: received→completeness→consultation→analysis→draft→council→issued→implemented', () => {
    let s: TariffDeterminationStatus = 'application_received';
    s = nextStatus(s, 'begin_review')!;        expect(s).toBe('completeness_review');
    s = nextStatus(s, 'open_consultation')!;   expect(s).toBe('public_consultation');
    s = nextStatus(s, 'begin_analysis')!;      expect(s).toBe('revenue_analysis');
    s = nextStatus(s, 'prepare_draft')!;       expect(s).toBe('draft_determination');
    s = nextStatus(s, 'table_for_council')!;   expect(s).toBe('council_deliberation');
    s = nextStatus(s, 'issue_determination')!; expect(s).toBe('determination_issued');
    s = nextStatus(s, 'implement')!;           expect(s).toBe('implemented');
    expect(isTerminal('implemented')).toBe(true);
  });

  it('reconsideration branch: issued → reconsideration_requested → implemented|remitted', () => {
    expect(nextStatus('determination_issued', 'request_reconsideration')).toBe('reconsideration_requested');
    expect(nextStatus('reconsideration_requested', 'implement')).toBe('implemented');
    expect(nextStatus('reconsideration_requested', 'remit')).toBe('remitted');
  });

  it('judicial remit reachable from determination_issued and reconsideration_requested', () => {
    expect(nextStatus('determination_issued', 'remit')).toBe('remitted');
    expect(nextStatus('reconsideration_requested', 'remit')).toBe('remitted');
    expect(isTerminal('remitted')).toBe(true);
  });

  it('reject reachable only from completeness_review and revenue_analysis', () => {
    expect(nextStatus('completeness_review', 'reject')).toBe('rejected');
    expect(nextStatus('revenue_analysis', 'reject')).toBe('rejected');
    expect(nextStatus('public_consultation', 'reject')).toBeNull();
    expect(nextStatus('determination_issued', 'reject')).toBeNull();
    expect(isTerminal('rejected')).toBe(true);
  });

  it('withdraw reachable only from early states', () => {
    const froms: TariffDeterminationStatus[] = ['application_received', 'completeness_review', 'public_consultation'];
    for (const f of froms) {
      expect(nextStatus(f, 'withdraw')).toBe('withdrawn');
    }
    expect(nextStatus('revenue_analysis', 'withdraw')).toBeNull();
    expect(nextStatus('council_deliberation', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('implemented')).toEqual([]);
    expect(allowedActions('remitted')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('application_received', 'open_consultation')).toBeNull();
    expect(nextStatus('completeness_review', 'begin_analysis')).toBeNull();
    expect(nextStatus('public_consultation', 'prepare_draft')).toBeNull();
    expect(nextStatus('council_deliberation', 'implement')).toBeNull();
    expect(nextStatus('implemented', 'request_reconsideration')).toBeNull();
    expect(nextStatus('rejected', 'withdraw')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'begin_review', 'open_consultation', 'begin_analysis', 'prepare_draft',
      'table_for_council', 'issue_determination', 'request_reconsideration',
      'implement', 'remit', 'reject', 'withdraw',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for determination_issued offers implement / remit / reconsideration', () => {
    const actions = allowedActions('determination_issued');
    expect(actions).toContain('implement');
    expect(actions).toContain('remit');
    expect(actions).toContain('request_reconsideration');
  });

  it('allowedActions for reconsideration_requested offers implement / remit', () => {
    const actions = allowedActions('reconsideration_requested');
    expect(actions).toContain('implement');
    expect(actions).toContain('remit');
    expect(actions).not.toContain('request_reconsideration');
  });
});

describe('W43 tariff-determination chain — INVERTED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('multi_year is the most generous window at every active stage', () => {
    const active: TariffDeterminationStatus[] = [
      'application_received', 'completeness_review', 'public_consultation',
      'revenue_analysis', 'draft_determination', 'council_deliberation',
      'determination_issued', 'reconsideration_requested',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].multi_year).toBeGreaterThan(SLA_MINUTES[st].annual_tariff);
      expect(SLA_MINUTES[st].annual_tariff).toBeGreaterThan(SLA_MINUTES[st].sseg_feedin);
    }
  });

  it('revenue_analysis: multi_year 90d, sseg 21d', () => {
    expect(SLA_MINUTES.revenue_analysis.multi_year).toBe(90 * DAY);
    expect(SLA_MINUTES.revenue_analysis.sseg_feedin).toBe(21 * DAY);
  });

  it('public_consultation: multi_year 60d, annual 30d', () => {
    expect(SLA_MINUTES.public_consultation.multi_year).toBe(60 * DAY);
    expect(SLA_MINUTES.public_consultation.annual_tariff).toBe(30 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('revenue_analysis', 'multi_year', base);
    expect(d!.getTime() - base.getTime()).toBe(90 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('implemented', 'multi_year', base)).toBeNull();
    expect(slaDeadlineFor('remitted', 'multi_year', base)).toBeNull();
    expect(slaDeadlineFor('rejected', 'multi_year', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'multi_year', base)).toBeNull();
  });
});

describe('W43 tariff-determination chain — reportability / regulator crossings', () => {
  const classes: TariffDeterminationClass[] = ['multi_year', 'annual_tariff', 'sseg_feedin'];

  it('remit crosses for EVERY class (court set-aside — universal)', () => {
    for (const k of classes) {
      expect(crossesIntoRegulator('remit', k)).toBe(true);
    }
  });

  it('issue_determination crosses for material classes only', () => {
    expect(crossesIntoRegulator('issue_determination', 'multi_year')).toBe(true);
    expect(crossesIntoRegulator('issue_determination', 'annual_tariff')).toBe(true);
    expect(crossesIntoRegulator('issue_determination', 'sseg_feedin')).toBe(false);
  });

  it('reject crosses for material classes only', () => {
    expect(crossesIntoRegulator('reject', 'multi_year')).toBe(true);
    expect(crossesIntoRegulator('reject', 'annual_tariff')).toBe(true);
    expect(crossesIntoRegulator('reject', 'sseg_feedin')).toBe(false);
  });

  it('routine actions never cross for any class', () => {
    for (const k of classes) {
      expect(crossesIntoRegulator('begin_review', k)).toBe(false);
      expect(crossesIntoRegulator('open_consultation', k)).toBe(false);
      expect(crossesIntoRegulator('begin_analysis', k)).toBe(false);
      expect(crossesIntoRegulator('prepare_draft', k)).toBe(false);
      expect(crossesIntoRegulator('table_for_council', k)).toBe(false);
      expect(crossesIntoRegulator('request_reconsideration', k)).toBe(false);
      expect(crossesIntoRegulator('implement', k)).toBe(false);
      expect(crossesIntoRegulator('withdraw', k)).toBe(false);
    }
  });

  it('sla_breach crosses material classes only', () => {
    expect(slaBreachCrossesIntoRegulator('multi_year')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('annual_tariff')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('sseg_feedin')).toBe(false);
  });

  it('isReportableClass + isJudicialRemit helpers', () => {
    expect(isReportableClass('multi_year')).toBe(true);
    expect(isReportableClass('annual_tariff')).toBe(true);
    expect(isReportableClass('sseg_feedin')).toBe(false);
    expect(isJudicialRemit('remit')).toBe(true);
    expect(isJudicialRemit('reject')).toBe(false);
    expect(isJudicialRemit('issue_determination')).toBe(false);
  });
});

describe('W43 tariff-determination chain — party attribution + applicant split', () => {
  it('registry / analyst / council drive the regulator machinery', () => {
    expect(partyForAction('begin_review')).toBe('registry');
    expect(partyForAction('open_consultation')).toBe('registry');
    expect(partyForAction('implement')).toBe('registry');
    expect(partyForAction('begin_analysis')).toBe('analyst');
    expect(partyForAction('prepare_draft')).toBe('analyst');
    expect(partyForAction('table_for_council')).toBe('analyst');
    expect(partyForAction('issue_determination')).toBe('council');
    expect(partyForAction('reject')).toBe('council');
  });

  it('applicant files reconsideration / withdraws; court remits', () => {
    expect(partyForAction('request_reconsideration')).toBe('applicant');
    expect(partyForAction('withdraw')).toBe('applicant');
    expect(partyForAction('remit')).toBe('court');
  });

  it('applicant-write set is exactly request_reconsideration / withdraw', () => {
    expect(isApplicantAction('request_reconsideration')).toBe(true);
    expect(isApplicantAction('withdraw')).toBe(true);
    expect(isApplicantAction('begin_review')).toBe(false);
    expect(isApplicantAction('issue_determination')).toBe(false);
    expect(isApplicantAction('remit')).toBe(false);
  });
});
