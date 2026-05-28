import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, isPenaltyDecision, partyForAction, isRespondentAction,
  type ComplianceInspectionStatus, type ComplianceInspectionTier,
} from '../src/utils/compliance-inspection-spec';

describe('W40 compliance-inspection chain — state machine', () => {
  it('happy path: scheduled→in_progress→drafted→issued→directive→remediation→verified→compliant', () => {
    let s: ComplianceInspectionStatus = 'inspection_scheduled';
    s = nextStatus(s, 'begin_inspection')!;   expect(s).toBe('inspection_in_progress');
    s = nextStatus(s, 'draft_findings')!;      expect(s).toBe('findings_drafted');
    s = nextStatus(s, 'issue_findings')!;      expect(s).toBe('findings_issued');
    s = nextStatus(s, 'issue_directive')!;     expect(s).toBe('directive_issued');
    s = nextStatus(s, 'begin_remediation')!;   expect(s).toBe('remediation_underway');
    s = nextStatus(s, 'verify_remediation')!;  expect(s).toBe('remediation_verified');
    s = nextStatus(s, 'close_compliant')!;     expect(s).toBe('compliant_closed');
    expect(isTerminal('compliant_closed')).toBe(true);
  });

  it('clean-inspection short-circuit: in_progress|drafted → compliant_closed', () => {
    expect(nextStatus('inspection_in_progress', 'close_no_findings')).toBe('compliant_closed');
    expect(nextStatus('findings_drafted', 'close_no_findings')).toBe('compliant_closed');
  });

  it('enforcement branch: penalty reachable from issued / directive / remediation', () => {
    expect(nextStatus('findings_issued', 'impose_penalty')).toBe('penalty_imposed');
    expect(nextStatus('directive_issued', 'impose_penalty')).toBe('penalty_imposed');
    expect(nextStatus('remediation_underway', 'impose_penalty')).toBe('penalty_imposed');
  });

  it('penalty closes via close_enforcement', () => {
    expect(nextStatus('penalty_imposed', 'close_enforcement')).toBe('enforcement_closed');
    expect(isTerminal('enforcement_closed')).toBe(true);
  });

  it('appeal branch: reachable from penalty_imposed and directive_issued, resolves to enforcement_closed', () => {
    expect(nextStatus('penalty_imposed', 'lodge_appeal')).toBe('appealed');
    expect(nextStatus('directive_issued', 'lodge_appeal')).toBe('appealed');
    expect(nextStatus('appealed', 'resolve_appeal')).toBe('enforcement_closed');
  });

  it('withdraw reachable only from early states', () => {
    const froms: ComplianceInspectionStatus[] = [
      'inspection_scheduled', 'inspection_in_progress', 'findings_drafted',
    ];
    for (const f of froms) {
      expect(nextStatus(f, 'withdraw')).toBe('withdrawn');
    }
    expect(nextStatus('findings_issued', 'withdraw')).toBeNull();
    expect(nextStatus('directive_issued', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('compliant_closed')).toEqual([]);
    expect(allowedActions('enforcement_closed')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('inspection_scheduled', 'draft_findings')).toBeNull();
    expect(nextStatus('findings_drafted', 'issue_directive')).toBeNull();
    expect(nextStatus('findings_issued', 'begin_remediation')).toBeNull();
    expect(nextStatus('remediation_verified', 'impose_penalty')).toBeNull();
    expect(nextStatus('appealed', 'close_enforcement')).toBeNull();
    expect(nextStatus('compliant_closed', 'withdraw')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'begin_inspection', 'draft_findings', 'close_no_findings', 'issue_findings',
      'issue_directive', 'begin_remediation', 'verify_remediation', 'close_compliant',
      'impose_penalty', 'lodge_appeal', 'resolve_appeal', 'close_enforcement', 'withdraw',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for findings_issued offers directive / penalty', () => {
    const actions = allowedActions('findings_issued');
    expect(actions).toContain('issue_directive');
    expect(actions).toContain('impose_penalty');
  });

  it('allowedActions for directive_issued offers remediation / penalty / appeal', () => {
    const actions = allowedActions('directive_issued');
    expect(actions).toContain('begin_remediation');
    expect(actions).toContain('impose_penalty');
    expect(actions).toContain('lodge_appeal');
  });
});

describe('W40 compliance-inspection chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('critical is the tightest window at every active stage', () => {
    const active: ComplianceInspectionStatus[] = [
      'inspection_scheduled', 'inspection_in_progress', 'findings_drafted',
      'findings_issued', 'directive_issued', 'remediation_underway',
      'remediation_verified', 'penalty_imposed', 'appealed',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].critical).toBeLessThan(SLA_MINUTES[st].serious);
      expect(SLA_MINUTES[st].serious).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('inspection_scheduled: critical 2d, minor 10d', () => {
    expect(SLA_MINUTES.inspection_scheduled.critical).toBe(2 * DAY);
    expect(SLA_MINUTES.inspection_scheduled.minor).toBe(10 * DAY);
  });

  it('remediation_underway: critical 30d, minor 90d', () => {
    expect(SLA_MINUTES.remediation_underway.critical).toBe(30 * DAY);
    expect(SLA_MINUTES.remediation_underway.minor).toBe(90 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('inspection_scheduled', 'critical', base);
    expect(d!.getTime() - base.getTime()).toBe(2 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('compliant_closed', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('enforcement_closed', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'critical', base)).toBeNull();
  });
});

describe('W40 compliance-inspection chain — reportability / regulator crossings', () => {
  const tiers: ComplianceInspectionTier[] = ['critical', 'serious', 'minor'];

  it('lodge_appeal crosses for EVERY tier (Tribunal docket — universal)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('lodge_appeal', t)).toBe(true);
    }
  });

  it('impose_penalty crosses for critical + serious only', () => {
    expect(crossesIntoRegulator('impose_penalty', 'critical')).toBe(true);
    expect(crossesIntoRegulator('impose_penalty', 'serious')).toBe(true);
    expect(crossesIntoRegulator('impose_penalty', 'minor')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('begin_inspection', t)).toBe(false);
      expect(crossesIntoRegulator('draft_findings', t)).toBe(false);
      expect(crossesIntoRegulator('close_no_findings', t)).toBe(false);
      expect(crossesIntoRegulator('issue_findings', t)).toBe(false);
      expect(crossesIntoRegulator('issue_directive', t)).toBe(false);
      expect(crossesIntoRegulator('begin_remediation', t)).toBe(false);
      expect(crossesIntoRegulator('verify_remediation', t)).toBe(false);
      expect(crossesIntoRegulator('close_compliant', t)).toBe(false);
      expect(crossesIntoRegulator('resolve_appeal', t)).toBe(false);
      expect(crossesIntoRegulator('close_enforcement', t)).toBe(false);
      expect(crossesIntoRegulator('withdraw', t)).toBe(false);
    }
  });

  it('sla_breach crosses critical + serious only', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('serious')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });

  it('isReportableTier + isPenaltyDecision helpers', () => {
    expect(isReportableTier('critical')).toBe(true);
    expect(isReportableTier('serious')).toBe(true);
    expect(isReportableTier('minor')).toBe(false);
    expect(isPenaltyDecision('impose_penalty')).toBe(true);
    expect(isPenaltyDecision('lodge_appeal')).toBe(false);
    expect(isPenaltyDecision('issue_directive')).toBe(false);
  });
});

describe('W40 compliance-inspection chain — party attribution + respondent split', () => {
  it('officer drives the inspection + enforcement machinery', () => {
    expect(partyForAction('begin_inspection')).toBe('officer');
    expect(partyForAction('draft_findings')).toBe('officer');
    expect(partyForAction('close_no_findings')).toBe('officer');
    expect(partyForAction('issue_findings')).toBe('officer');
    expect(partyForAction('issue_directive')).toBe('officer');
    expect(partyForAction('verify_remediation')).toBe('officer');
    expect(partyForAction('close_compliant')).toBe('officer');
    expect(partyForAction('impose_penalty')).toBe('officer');
    expect(partyForAction('resolve_appeal')).toBe('officer');
    expect(partyForAction('close_enforcement')).toBe('officer');
    expect(partyForAction('withdraw')).toBe('officer');
  });

  it('respondent begins remediation and lodges any appeal', () => {
    expect(partyForAction('begin_remediation')).toBe('respondent');
    expect(partyForAction('lodge_appeal')).toBe('respondent');
  });

  it('respondent-write set is exactly begin_remediation / lodge_appeal', () => {
    expect(isRespondentAction('begin_remediation')).toBe(true);
    expect(isRespondentAction('lodge_appeal')).toBe(true);
    expect(isRespondentAction('begin_inspection')).toBe(false);
    expect(isRespondentAction('impose_penalty')).toBe(false);
    expect(isRespondentAction('verify_remediation')).toBe(false);
  });
});
