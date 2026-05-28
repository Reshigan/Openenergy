import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, bestExObligationApplies, partyForAction,
  type BestExStatus, type BestExTier,
} from '../src/utils/best-execution-spec';

describe('W36 best-execution chain — state machine', () => {
  it('happy path: rfq→solicit→record→evaluate→approve→execute→tca→closed', () => {
    let s: BestExStatus = 'rfq_received';
    s = nextStatus(s, 'solicit_quotes')!;    expect(s).toBe('quotes_solicited');
    s = nextStatus(s, 'record_quotes')!;      expect(s).toBe('quotes_received');
    s = nextStatus(s, 'evaluate_best_ex')!;   expect(s).toBe('best_ex_evaluated');
    s = nextStatus(s, 'approve_execution')!;  expect(s).toBe('execution_approved');
    s = nextStatus(s, 'execute')!;            expect(s).toBe('executed');
    s = nextStatus(s, 'review_tca')!;         expect(s).toBe('tca_reviewed');
    s = nextStatus(s, 'close')!;              expect(s).toBe('closed');
  });

  it('documented override routes from best_ex_evaluated through TCA to closed', () => {
    let s: BestExStatus = 'best_ex_evaluated';
    s = nextStatus(s, 'execute_override')!;   expect(s).toBe('override_executed');
    s = nextStatus(s, 'review_tca')!;         expect(s).toBe('tca_reviewed');
    s = nextStatus(s, 'close')!;              expect(s).toBe('closed');
  });

  it('review_tca reachable from both executed and override_executed', () => {
    expect(nextStatus('executed', 'review_tca')).toBe('tca_reviewed');
    expect(nextStatus('override_executed', 'review_tca')).toBe('tca_reviewed');
  });

  it('exception escalation reachable from best_ex_evaluated and tca_reviewed', () => {
    expect(nextStatus('best_ex_evaluated', 'escalate_exception')).toBe('exception_escalated');
    expect(nextStatus('tca_reviewed', 'escalate_exception')).toBe('exception_escalated');
    expect(isTerminal('exception_escalated')).toBe(true);
    expect(allowedActions('exception_escalated')).toEqual([]);
  });

  it('expire accessible from pre-execution states only', () => {
    expect(nextStatus('rfq_received', 'expire')).toBe('rfq_expired');
    expect(nextStatus('quotes_solicited', 'expire')).toBe('rfq_expired');
    expect(nextStatus('quotes_received', 'expire')).toBe('rfq_expired');
    expect(nextStatus('best_ex_evaluated', 'expire')).toBeNull();
    expect(nextStatus('execution_approved', 'expire')).toBeNull();
    expect(isTerminal('rfq_expired')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('exception_escalated')).toEqual([]);
    expect(allowedActions('rfq_expired')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('rfq_received', 'execute')).toBeNull();
    expect(nextStatus('quotes_solicited', 'approve_execution')).toBeNull();
    expect(nextStatus('execution_approved', 'execute_override')).toBeNull();
    expect(nextStatus('executed', 'close')).toBeNull();
    expect(nextStatus('rfq_received', 'execute_override')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'solicit_quotes', 'record_quotes', 'evaluate_best_ex', 'approve_execution',
      'execute', 'execute_override', 'review_tca', 'close', 'escalate_exception', 'expire',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for best_ex_evaluated offers approve / override / escalate', () => {
    const actions = allowedActions('best_ex_evaluated');
    expect(actions).toContain('approve_execution');
    expect(actions).toContain('execute_override');
    expect(actions).toContain('escalate_exception');
  });

  it('allowedActions for tca_reviewed offers close / escalate', () => {
    const actions = allowedActions('tca_reviewed');
    expect(actions).toContain('close');
    expect(actions).toContain('escalate_exception');
  });
});

describe('W36 best-execution chain — MIXED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');

  it('quote-solicit window is a hard market window — same across all tiers', () => {
    const r = slaDeadlineFor('quotes_solicited', 'retail', base);
    const p = slaDeadlineFor('quotes_solicited', 'professional', base);
    const e = slaDeadlineFor('quotes_solicited', 'eligible_counterparty', base);
    expect(r!.getTime()).toBe(p!.getTime());
    expect(p!.getTime()).toBe(e!.getTime());
    expect(r!.getTime() - base.getTime()).toBe(15 * 60_000);
  });

  it('approval + execution windows are hard windows — same across all tiers', () => {
    expect(SLA_MINUTES.best_ex_evaluated.retail).toBe(SLA_MINUTES.best_ex_evaluated.eligible_counterparty);
    expect(SLA_MINUTES.execution_approved.retail).toBe(SLA_MINUTES.execution_approved.eligible_counterparty);
  });

  it('TCA review window is protection-graded — retail tightest, ECP loosest', () => {
    const r = SLA_MINUTES.executed.retail;
    const p = SLA_MINUTES.executed.professional;
    const e = SLA_MINUTES.executed.eligible_counterparty;
    expect(r).toBeLessThan(p);
    expect(p).toBeLessThan(e);
    expect(r).toBe(24 * 60);
  });

  it('override TCA scrutiny is tighter than ordinary executed TCA per tier', () => {
    expect(SLA_MINUTES.override_executed.retail).toBeLessThan(SLA_MINUTES.executed.retail);
    expect(SLA_MINUTES.override_executed.professional).toBeLessThan(SLA_MINUTES.executed.professional);
    expect(SLA_MINUTES.override_executed.retail).toBe(4 * 60);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('closed', 'retail', base)).toBeNull();
    expect(slaDeadlineFor('exception_escalated', 'retail', base)).toBeNull();
    expect(slaDeadlineFor('rfq_expired', 'retail', base)).toBeNull();
  });
});

describe('W36 best-execution chain — FSCA reportability / regulator crossings', () => {
  const tiers: BestExTier[] = ['retail', 'professional', 'eligible_counterparty'];

  it('escalate_exception crosses for EVERY tier (deliberate compliance escalation)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('escalate_exception', t)).toBe(true);
    }
  });

  it('execute_override crosses for retail + professional only (ECP waived best-ex)', () => {
    expect(crossesIntoRegulator('execute_override', 'retail')).toBe(true);
    expect(crossesIntoRegulator('execute_override', 'professional')).toBe(true);
    expect(crossesIntoRegulator('execute_override', 'eligible_counterparty')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('solicit_quotes', t)).toBe(false);
      expect(crossesIntoRegulator('record_quotes', t)).toBe(false);
      expect(crossesIntoRegulator('evaluate_best_ex', t)).toBe(false);
      expect(crossesIntoRegulator('approve_execution', t)).toBe(false);
      expect(crossesIntoRegulator('execute', t)).toBe(false);
      expect(crossesIntoRegulator('review_tca', t)).toBe(false);
      expect(crossesIntoRegulator('close', t)).toBe(false);
    }
  });

  it('sla_breach crosses retail + professional only', () => {
    expect(slaBreachCrossesIntoRegulator('retail')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('professional')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('eligible_counterparty')).toBe(false);
  });

  it('isReportable + bestExObligationApplies: retail + professional, not ECP', () => {
    expect(isReportable('retail')).toBe(true);
    expect(isReportable('professional')).toBe(true);
    expect(isReportable('eligible_counterparty')).toBe(false);
    expect(bestExObligationApplies('retail')).toBe(true);
    expect(bestExObligationApplies('professional')).toBe(true);
    expect(bestExObligationApplies('eligible_counterparty')).toBe(false);
  });
});

describe('W36 best-execution chain — party attribution', () => {
  it('desk owns the front-office actions', () => {
    expect(partyForAction('solicit_quotes')).toBe('desk');
    expect(partyForAction('record_quotes')).toBe('desk');
    expect(partyForAction('evaluate_best_ex')).toBe('desk');
    expect(partyForAction('execute')).toBe('desk');
    expect(partyForAction('execute_override')).toBe('desk');
  });

  it('compliance owns approval, TCA review, close, escalation', () => {
    expect(partyForAction('approve_execution')).toBe('compliance');
    expect(partyForAction('review_tca')).toBe('compliance');
    expect(partyForAction('close')).toBe('compliance');
    expect(partyForAction('escalate_exception')).toBe('compliance');
  });

  it('expire is a system action', () => {
    expect(partyForAction('expire')).toBe('system');
  });
});
