import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, isMaterial, partyForAction,
  type ReversalStatus, type ReversalTier, type ReversalAction,
} from '../src/utils/carbon-reversal-spec';

describe('W42 carbon-reversal chain — state machine', () => {
  it('buffer path: reported→assessment→quantified→proposed→cancelled→remediation→closed', () => {
    let s: ReversalStatus = 'reversal_reported';
    s = nextStatus(s, 'begin_assessment')!;            expect(s).toBe('under_assessment');
    s = nextStatus(s, 'quantify_loss')!;               expect(s).toBe('loss_quantified');
    s = nextStatus(s, 'propose_buffer_cancellation')!; expect(s).toBe('buffer_cancellation_proposed');
    s = nextStatus(s, 'cancel_buffer')!;               expect(s).toBe('buffer_cancelled');
    s = nextStatus(s, 'verify_remediation')!;          expect(s).toBe('remediation_verified');
    s = nextStatus(s, 'close')!;                       expect(s).toBe('closed');
    expect(isTerminal('closed')).toBe(true);
  });

  it('replacement path: quantified→required→submitted→verified→closed', () => {
    let s: ReversalStatus = 'loss_quantified';
    s = nextStatus(s, 'require_replacement')!; expect(s).toBe('replacement_required');
    s = nextStatus(s, 'submit_replacement')!;  expect(s).toBe('replacement_submitted');
    s = nextStatus(s, 'verify_replacement')!;  expect(s).toBe('replacement_verified');
    s = nextStatus(s, 'close')!;               expect(s).toBe('closed');
  });

  it('loss_quantified branches into BOTH buffer and replacement resolution', () => {
    const acts = allowedActions('loss_quantified');
    expect(acts).toContain('propose_buffer_cancellation');
    expect(acts).toContain('require_replacement');
    expect(acts).toContain('escalate');
  });

  it('escalation branch: escalate reachable from assessment / quantified / replacement_required', () => {
    expect(nextStatus('under_assessment', 'escalate')).toBe('escalated');
    expect(nextStatus('loss_quantified', 'escalate')).toBe('escalated');
    expect(nextStatus('replacement_required', 'escalate')).toBe('escalated');
    expect(isTerminal('escalated')).toBe(true);
  });

  it('escalate NOT reachable from buffer-side or late states', () => {
    expect(nextStatus('reversal_reported', 'escalate')).toBeNull();
    expect(nextStatus('buffer_cancellation_proposed', 'escalate')).toBeNull();
    expect(nextStatus('buffer_cancelled', 'escalate')).toBeNull();
    expect(nextStatus('replacement_submitted', 'escalate')).toBeNull();
    expect(nextStatus('remediation_verified', 'escalate')).toBeNull();
  });

  it('false_alarm reachable only from reported / under_assessment', () => {
    expect(nextStatus('reversal_reported', 'dismiss_false_alarm')).toBe('false_alarm');
    expect(nextStatus('under_assessment', 'dismiss_false_alarm')).toBe('false_alarm');
    expect(nextStatus('loss_quantified', 'dismiss_false_alarm')).toBeNull();
    expect(nextStatus('buffer_cancelled', 'dismiss_false_alarm')).toBeNull();
    expect(isTerminal('false_alarm')).toBe(true);
  });

  it('close reachable from BOTH verified states only', () => {
    expect(nextStatus('remediation_verified', 'close')).toBe('closed');
    expect(nextStatus('replacement_verified', 'close')).toBe('closed');
    expect(nextStatus('buffer_cancelled', 'close')).toBeNull();
    expect(nextStatus('loss_quantified', 'close')).toBeNull();
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('escalated')).toEqual([]);
    expect(allowedActions('false_alarm')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('reversal_reported', 'quantify_loss')).toBeNull();
    expect(nextStatus('under_assessment', 'cancel_buffer')).toBeNull();
    expect(nextStatus('loss_quantified', 'submit_replacement')).toBeNull();
    expect(nextStatus('buffer_cancellation_proposed', 'verify_remediation')).toBeNull();
    expect(nextStatus('replacement_required', 'verify_replacement')).toBeNull();
    expect(nextStatus('closed', 'close')).toBeNull();
  });

  it('buffer and replacement paths cannot cross-contaminate', () => {
    expect(nextStatus('buffer_cancellation_proposed', 'submit_replacement')).toBeNull();
    expect(nextStatus('replacement_required', 'cancel_buffer')).toBeNull();
    expect(nextStatus('replacement_submitted', 'verify_remediation')).toBeNull();
    expect(nextStatus('buffer_cancelled', 'verify_replacement')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: ReversalAction[] = [
      'begin_assessment', 'quantify_loss', 'propose_buffer_cancellation', 'cancel_buffer',
      'verify_remediation', 'require_replacement', 'submit_replacement', 'verify_replacement',
      'close', 'escalate', 'dismiss_false_alarm',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W42 carbon-reversal chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('catastrophic is the tightest window at every active stage', () => {
    const active: ReversalStatus[] = [
      'reversal_reported', 'under_assessment', 'loss_quantified',
      'buffer_cancellation_proposed', 'buffer_cancelled', 'remediation_verified',
      'replacement_required', 'replacement_submitted', 'replacement_verified',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].catastrophic).toBeLessThan(SLA_MINUTES[st].significant);
      expect(SLA_MINUTES[st].significant).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('reversal_reported: catastrophic 1d, minor 7d', () => {
    expect(SLA_MINUTES.reversal_reported.catastrophic).toBe(1 * DAY);
    expect(SLA_MINUTES.reversal_reported.minor).toBe(7 * DAY);
  });

  it('loss_quantified: catastrophic 7d, minor 30d', () => {
    expect(SLA_MINUTES.loss_quantified.catastrophic).toBe(7 * DAY);
    expect(SLA_MINUTES.loss_quantified.minor).toBe(30 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('reversal_reported', 'catastrophic', base);
    expect(d!.getTime() - base.getTime()).toBe(1 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('closed', 'catastrophic', base)).toBeNull();
    expect(slaDeadlineFor('escalated', 'catastrophic', base)).toBeNull();
    expect(slaDeadlineFor('false_alarm', 'catastrophic', base)).toBeNull();
  });
});

describe('W42 carbon-reversal chain — reportability matrix', () => {
  const tiers: ReversalTier[] = ['catastrophic', 'significant', 'minor'];

  it('escalate crosses for EVERY tier (total reversal / fraud / termination)', () => {
    expect(crossesIntoRegulator('escalate', 'catastrophic')).toBe(true);
    expect(crossesIntoRegulator('escalate', 'significant')).toBe(true);
    expect(crossesIntoRegulator('escalate', 'minor')).toBe(true);
  });

  it('require_replacement crosses for EVERY tier (intentional = integrity breach)', () => {
    expect(crossesIntoRegulator('require_replacement', 'catastrophic')).toBe(true);
    expect(crossesIntoRegulator('require_replacement', 'significant')).toBe(true);
    expect(crossesIntoRegulator('require_replacement', 'minor')).toBe(true);
  });

  it('close crosses for material tiers only (catastrophic + significant)', () => {
    expect(crossesIntoRegulator('close', 'catastrophic')).toBe(true);
    expect(crossesIntoRegulator('close', 'significant')).toBe(true);
    expect(crossesIntoRegulator('close', 'minor')).toBe(false);
  });

  it('routine buffer-accounting actions never cross for any tier', () => {
    const routine: ReversalAction[] = [
      'begin_assessment', 'quantify_loss', 'propose_buffer_cancellation', 'cancel_buffer',
      'verify_remediation', 'submit_replacement', 'verify_replacement', 'dismiss_false_alarm',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for material tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('catastrophic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('significant')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });

  it('isReportable / isMaterial — material tiers only', () => {
    expect(isReportable('catastrophic')).toBe(true);
    expect(isReportable('significant')).toBe(true);
    expect(isReportable('minor')).toBe(false);
    expect(isMaterial('catastrophic')).toBe(true);
    expect(isMaterial('minor')).toBe(false);
  });
});

describe('W42 carbon-reversal chain — contractual party attribution', () => {
  it('registry owns intake + buffer + replacement-trigger + close + dismiss', () => {
    expect(partyForAction('begin_assessment')).toBe('registry');
    expect(partyForAction('propose_buffer_cancellation')).toBe('registry');
    expect(partyForAction('cancel_buffer')).toBe('registry');
    expect(partyForAction('require_replacement')).toBe('registry');
    expect(partyForAction('close')).toBe('registry');
    expect(partyForAction('dismiss_false_alarm')).toBe('registry');
  });

  it('vvb owns quantification + both verifications', () => {
    expect(partyForAction('quantify_loss')).toBe('vvb');
    expect(partyForAction('verify_remediation')).toBe('vvb');
    expect(partyForAction('verify_replacement')).toBe('vvb');
  });

  it('proponent owns replacement submission; authority owns escalation', () => {
    expect(partyForAction('submit_replacement')).toBe('proponent');
    expect(partyForAction('escalate')).toBe('authority');
  });
});
