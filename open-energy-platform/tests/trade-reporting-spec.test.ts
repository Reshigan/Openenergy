import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableClass, partyForAction,
  type TradeReportStatus, type TradeReportClass,
} from '../src/utils/trade-reporting-spec';

describe('W44 trade-reporting chain — state machine', () => {
  it('happy path: due→generated→submitted→acknowledged→reconciled→confirmed_complete', () => {
    let s: TradeReportStatus = 'report_due';
    s = nextStatus(s, 'generate_report')!;  expect(s).toBe('report_generated');
    s = nextStatus(s, 'submit')!;           expect(s).toBe('submitted_to_tr');
    s = nextStatus(s, 'acknowledge')!;      expect(s).toBe('tr_acknowledged');
    s = nextStatus(s, 'reconcile')!;        expect(s).toBe('reconciled');
    s = nextStatus(s, 'confirm_complete')!; expect(s).toBe('confirmed_complete');
    expect(isTerminal('confirmed_complete')).toBe(true);
  });

  it('rejection branch: submitted → tr_rejected → corrected → submitted (re-report loop)', () => {
    expect(nextStatus('submitted_to_tr', 'reject')).toBe('tr_rejected');
    expect(nextStatus('tr_rejected', 'correct')).toBe('corrected');
    expect(nextStatus('corrected', 'submit')).toBe('submitted_to_tr');
  });

  it('reconciliation-break branch: acknowledged|reconciled → break → resolve → reconcile', () => {
    expect(nextStatus('tr_acknowledged', 'flag_break')).toBe('break_identified');
    expect(nextStatus('reconciled', 'flag_break')).toBe('break_identified');
    expect(nextStatus('break_identified', 'resolve_break')).toBe('break_resolved');
    expect(nextStatus('break_resolved', 'reconcile')).toBe('reconciled');
  });

  it('break can also route to a fresh correction + re-submission', () => {
    expect(nextStatus('break_identified', 'correct')).toBe('corrected');
    expect(nextStatus('corrected', 'submit')).toBe('submitted_to_tr');
  });

  it('exempt reachable only from report_due and report_generated', () => {
    expect(nextStatus('report_due', 'exempt')).toBe('exempted');
    expect(nextStatus('report_generated', 'exempt')).toBe('exempted');
    expect(nextStatus('submitted_to_tr', 'exempt')).toBeNull();
    expect(nextStatus('reconciled', 'exempt')).toBeNull();
    expect(isTerminal('exempted')).toBe(true);
  });

  it('cancel reachable from every active state but no terminal', () => {
    const active: TradeReportStatus[] = [
      'report_due', 'report_generated', 'submitted_to_tr', 'tr_acknowledged',
      'reconciled', 'break_identified', 'break_resolved', 'tr_rejected', 'corrected',
    ];
    for (const st of active) {
      expect(nextStatus(st, 'cancel')).toBe('cancelled');
    }
    expect(nextStatus('confirmed_complete', 'cancel')).toBeNull();
    expect(nextStatus('exempted', 'cancel')).toBeNull();
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('confirmed_complete')).toEqual([]);
    expect(allowedActions('exempted')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('report_due', 'submit')).toBeNull();
    expect(nextStatus('report_generated', 'acknowledge')).toBeNull();
    expect(nextStatus('submitted_to_tr', 'reconcile')).toBeNull();
    expect(nextStatus('tr_acknowledged', 'confirm_complete')).toBeNull();
    expect(nextStatus('report_due', 'reconcile')).toBeNull();
    expect(nextStatus('confirmed_complete', 'submit')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'generate_report', 'submit', 'acknowledge', 'reconcile', 'flag_break',
      'resolve_break', 'correct', 'confirm_complete', 'reject', 'exempt', 'cancel',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for tr_acknowledged offers reconcile / flag_break / cancel', () => {
    const actions = allowedActions('tr_acknowledged');
    expect(actions).toContain('reconcile');
    expect(actions).toContain('flag_break');
    expect(actions).toContain('cancel');
    expect(actions).not.toContain('confirm_complete');
  });

  it('allowedActions for submitted_to_tr offers acknowledge / reject / cancel', () => {
    const actions = allowedActions('submitted_to_tr');
    expect(actions).toContain('acknowledge');
    expect(actions).toContain('reject');
    expect(actions).toContain('cancel');
  });
});

describe('W44 trade-reporting chain — MIXED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const HOUR = 60;

  it('submission windows are UNIFORM across classes (EMIR-style hard T+1)', () => {
    const uniform: TradeReportStatus[] = ['report_due', 'report_generated', 'submitted_to_tr', 'tr_rejected', 'corrected'];
    for (const st of uniform) {
      expect(SLA_MINUTES[st].otc_derivative).toBe(SLA_MINUTES[st].physical_forward);
      expect(SLA_MINUTES[st].physical_forward).toBe(SLA_MINUTES[st].spot_physical);
    }
  });

  it('report_generated submission deadline is 24h (T+1) for every class', () => {
    expect(SLA_MINUTES.report_generated.otc_derivative).toBe(24 * HOUR);
    expect(SLA_MINUTES.report_generated.physical_forward).toBe(24 * HOUR);
    expect(SLA_MINUTES.report_generated.spot_physical).toBe(24 * HOUR);
  });

  it('reconciliation + break windows are graded — otc_derivative tightest', () => {
    const graded: TradeReportStatus[] = ['tr_acknowledged', 'reconciled', 'break_identified', 'break_resolved'];
    for (const st of graded) {
      expect(SLA_MINUTES[st].otc_derivative).toBeLessThan(SLA_MINUTES[st].physical_forward);
      expect(SLA_MINUTES[st].physical_forward).toBeLessThan(SLA_MINUTES[st].spot_physical);
    }
  });

  it('break_identified: otc 8h tightest, spot 48h', () => {
    expect(SLA_MINUTES.break_identified.otc_derivative).toBe(8 * HOUR);
    expect(SLA_MINUTES.break_identified.spot_physical).toBe(48 * HOUR);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('break_identified', 'otc_derivative', base);
    expect(d!.getTime() - base.getTime()).toBe(8 * HOUR * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('confirmed_complete', 'otc_derivative', base)).toBeNull();
    expect(slaDeadlineFor('exempted', 'otc_derivative', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'otc_derivative', base)).toBeNull();
  });
});

describe('W44 trade-reporting chain — reportability / FSCA crossings', () => {
  const classes: TradeReportClass[] = ['otc_derivative', 'physical_forward', 'spot_physical'];

  it('sla_breach crosses for EVERY class (a missed report IS the violation — universal)', () => {
    for (const k of classes) {
      expect(slaBreachCrossesIntoRegulator(k)).toBe(true);
    }
  });

  it('reject crosses for material classes only', () => {
    expect(crossesIntoRegulator('reject', 'otc_derivative')).toBe(true);
    expect(crossesIntoRegulator('reject', 'physical_forward')).toBe(true);
    expect(crossesIntoRegulator('reject', 'spot_physical')).toBe(false);
  });

  it('flag_break crosses for otc_derivative only (systemic-risk product)', () => {
    expect(crossesIntoRegulator('flag_break', 'otc_derivative')).toBe(true);
    expect(crossesIntoRegulator('flag_break', 'physical_forward')).toBe(false);
    expect(crossesIntoRegulator('flag_break', 'spot_physical')).toBe(false);
  });

  it('routine actions never cross for any class', () => {
    for (const k of classes) {
      expect(crossesIntoRegulator('generate_report', k)).toBe(false);
      expect(crossesIntoRegulator('submit', k)).toBe(false);
      expect(crossesIntoRegulator('acknowledge', k)).toBe(false);
      expect(crossesIntoRegulator('reconcile', k)).toBe(false);
      expect(crossesIntoRegulator('resolve_break', k)).toBe(false);
      expect(crossesIntoRegulator('correct', k)).toBe(false);
      expect(crossesIntoRegulator('confirm_complete', k)).toBe(false);
      expect(crossesIntoRegulator('exempt', k)).toBe(false);
      expect(crossesIntoRegulator('cancel', k)).toBe(false);
    }
  });

  it('isReportableClass helper', () => {
    expect(isReportableClass('otc_derivative')).toBe(true);
    expect(isReportableClass('physical_forward')).toBe(true);
    expect(isReportableClass('spot_physical')).toBe(false);
  });
});

describe('W44 trade-reporting chain — party attribution', () => {
  it('reporting_ops drives submission + reconciliation + corrections', () => {
    expect(partyForAction('generate_report')).toBe('reporting_ops');
    expect(partyForAction('submit')).toBe('reporting_ops');
    expect(partyForAction('reconcile')).toBe('reporting_ops');
    expect(partyForAction('resolve_break')).toBe('reporting_ops');
    expect(partyForAction('correct')).toBe('reporting_ops');
    expect(partyForAction('confirm_complete')).toBe('reporting_ops');
  });

  it('trade_repository acknowledges / rejects / flags breaks', () => {
    expect(partyForAction('acknowledge')).toBe('trade_repository');
    expect(partyForAction('reject')).toBe('trade_repository');
    expect(partyForAction('flag_break')).toBe('trade_repository');
  });

  it('desk exempts / busts the trade', () => {
    expect(partyForAction('exempt')).toBe('desk');
    expect(partyForAction('cancel')).toBe('desk');
  });
});
