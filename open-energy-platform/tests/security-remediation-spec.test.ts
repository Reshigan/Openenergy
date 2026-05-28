import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, tierForCvss,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, partyForAction,
  type RemediationStatus, type RemediationTier, type RemediationAction,
} from '../src/utils/security-remediation-spec';

describe('W55 security-remediation chain — state machine', () => {
  it('happy path: advisory_received→triaged→impact_assessment→fleet_scoped→remediation_approved→rollout_in_progress→verification→resolved', () => {
    let s: RemediationStatus = 'advisory_received';
    s = nextStatus(s, 'triage')!;              expect(s).toBe('triaged');
    s = nextStatus(s, 'assess_impact')!;       expect(s).toBe('impact_assessment');
    s = nextStatus(s, 'scope_fleet')!;         expect(s).toBe('fleet_scoped');
    s = nextStatus(s, 'approve_remediation')!; expect(s).toBe('remediation_approved');
    s = nextStatus(s, 'begin_rollout')!;       expect(s).toBe('rollout_in_progress');
    s = nextStatus(s, 'complete_rollout')!;    expect(s).toBe('verification');
    s = nextStatus(s, 'verify')!;              expect(s).toBe('resolved');
    expect(isTerminal('resolved')).toBe(true);
  });

  it('emergency fast-path: triaged → remediation_approved via emergency_authorize (skip impact/scope)', () => {
    expect(nextStatus('triaged', 'emergency_authorize')).toBe('remediation_approved');
    // emergency_authorize is only available at triaged — not before, not after
    expect(nextStatus('advisory_received', 'emergency_authorize')).toBeNull();
    expect(nextStatus('impact_assessment', 'emergency_authorize')).toBeNull();
    expect(nextStatus('fleet_scoped', 'emergency_authorize')).toBeNull();
  });

  it('not_affected early exit: triaged → not_affected', () => {
    expect(nextStatus('triaged', 'mark_not_affected')).toBe('not_affected');
    expect(isTerminal('not_affected')).toBe(true);
    // mark_not_affected only at triaged
    expect(nextStatus('advisory_received', 'mark_not_affected')).toBeNull();
    expect(nextStatus('impact_assessment', 'mark_not_affected')).toBeNull();
  });

  it('mitigation/containment branch: impact_assessment → mitigation_applied → fleet_scoped', () => {
    expect(nextStatus('impact_assessment', 'apply_mitigation')).toBe('mitigation_applied');
    expect(nextStatus('mitigation_applied', 'scope_fleet')).toBe('fleet_scoped');
    // mitigation is a containment state, not a terminal
    expect(isTerminal('mitigation_applied')).toBe(false);
    // apply_mitigation only from impact_assessment
    expect(nextStatus('fleet_scoped', 'apply_mitigation')).toBeNull();
    expect(nextStatus('triaged', 'apply_mitigation')).toBeNull();
  });

  it('risk_accepted branch reachable from impact_assessment / mitigation_applied / fleet_scoped', () => {
    const froms: RemediationStatus[] = ['impact_assessment', 'mitigation_applied', 'fleet_scoped'];
    for (const f of froms) {
      expect(nextStatus(f, 'accept_risk')).toBe('risk_accepted');
    }
    expect(isTerminal('risk_accepted')).toBe(true);
    // accept_risk not available before assessment or after approval
    expect(nextStatus('triaged', 'accept_risk')).toBeNull();
    expect(nextStatus('remediation_approved', 'accept_risk')).toBeNull();
    expect(nextStatus('rollout_in_progress', 'accept_risk')).toBeNull();
  });

  it('backout branch: roll_back reachable from rollout_in_progress / verification only', () => {
    expect(nextStatus('rollout_in_progress', 'roll_back')).toBe('rolled_back');
    expect(nextStatus('verification', 'roll_back')).toBe('rolled_back');
    expect(isTerminal('rolled_back')).toBe(true);
    expect(nextStatus('remediation_approved', 'roll_back')).toBeNull();
    expect(nextStatus('fleet_scoped', 'roll_back')).toBeNull();
    expect(nextStatus('impact_assessment', 'roll_back')).toBeNull();
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('resolved')).toEqual([]);
    expect(allowedActions('not_affected')).toEqual([]);
    expect(allowedActions('risk_accepted')).toEqual([]);
    expect(allowedActions('rolled_back')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('advisory_received', 'assess_impact')).toBeNull();
    expect(nextStatus('triaged', 'scope_fleet')).toBeNull();
    expect(nextStatus('impact_assessment', 'approve_remediation')).toBeNull();
    expect(nextStatus('remediation_approved', 'complete_rollout')).toBeNull();
    expect(nextStatus('rollout_in_progress', 'verify')).toBeNull();
    expect(nextStatus('resolved', 'verify')).toBeNull();
  });

  it('TRANSITIONS dict covers every state', () => {
    const states: RemediationStatus[] = [
      'advisory_received', 'triaged', 'impact_assessment', 'mitigation_applied',
      'fleet_scoped', 'remediation_approved', 'rollout_in_progress', 'verification',
      'resolved', 'not_affected', 'risk_accepted', 'rolled_back',
    ];
    for (const s of states) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('triaged fans out to assess_impact / emergency_authorize / mark_not_affected', () => {
    const actions = allowedActions('triaged');
    expect(actions).toContain('assess_impact');
    expect(actions).toContain('emergency_authorize');
    expect(actions).toContain('mark_not_affected');
  });

  it('impact_assessment fans out to scope_fleet / apply_mitigation / accept_risk', () => {
    const actions = allowedActions('impact_assessment');
    expect(actions).toContain('scope_fleet');
    expect(actions).toContain('apply_mitigation');
    expect(actions).toContain('accept_risk');
  });
});

describe('W55 security-remediation chain — CVSS tiering', () => {
  it('maps CVSS v3.1 base scores to severity buckets at the boundaries', () => {
    expect(tierForCvss(10.0)).toBe('critical');
    expect(tierForCvss(9.0)).toBe('critical');
    expect(tierForCvss(8.9)).toBe('high');
    expect(tierForCvss(7.0)).toBe('high');
    expect(tierForCvss(6.9)).toBe('medium');
    expect(tierForCvss(4.0)).toBe('medium');
    expect(tierForCvss(3.9)).toBe('low');
    expect(tierForCvss(0.1)).toBe('low');
    expect(tierForCvss(0.0)).toBe('informational');
  });
});

describe('W55 security-remediation chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const HOUR = 60;

  it('the higher the CVSS severity, the TIGHTER the window at every active stage', () => {
    const active: RemediationStatus[] = [
      'advisory_received', 'triaged', 'impact_assessment', 'mitigation_applied',
      'fleet_scoped', 'remediation_approved', 'rollout_in_progress', 'verification',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].critical).toBeLessThan(SLA_MINUTES[st].high);
      expect(SLA_MINUTES[st].high).toBeLessThan(SLA_MINUTES[st].medium);
      expect(SLA_MINUTES[st].medium).toBeLessThan(SLA_MINUTES[st].low);
      expect(SLA_MINUTES[st].low).toBeLessThan(SLA_MINUTES[st].informational);
    }
  });

  it('advisory_received: critical 1h, informational 7d', () => {
    expect(SLA_MINUTES.advisory_received.critical).toBe(1 * HOUR);
    expect(SLA_MINUTES.advisory_received.informational).toBe(7 * 24 * HOUR);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('advisory_received', 'critical', base);
    expect(d!.getTime() - base.getTime()).toBe(1 * HOUR * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('resolved', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('not_affected', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('risk_accepted', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('rolled_back', 'critical', base)).toBeNull();
  });
});

describe('W55 security-remediation chain — reportability', () => {
  const tiers: RemediationTier[] = ['critical', 'high', 'medium', 'low', 'informational'];

  it('accept_risk crosses for critical + high only (the W55 signature)', () => {
    expect(crossesIntoRegulator('accept_risk', 'critical')).toBe(true);
    expect(crossesIntoRegulator('accept_risk', 'high')).toBe(true);
    expect(crossesIntoRegulator('accept_risk', 'medium')).toBe(false);
    expect(crossesIntoRegulator('accept_risk', 'low')).toBe(false);
    expect(crossesIntoRegulator('accept_risk', 'informational')).toBe(false);
  });

  it('roll_back crosses for critical + high only', () => {
    expect(crossesIntoRegulator('roll_back', 'critical')).toBe(true);
    expect(crossesIntoRegulator('roll_back', 'high')).toBe(true);
    expect(crossesIntoRegulator('roll_back', 'medium')).toBe(false);
    expect(crossesIntoRegulator('roll_back', 'low')).toBe(false);
    expect(crossesIntoRegulator('roll_back', 'informational')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    const routine: RemediationAction[] = [
      'triage', 'assess_impact', 'apply_mitigation', 'mark_not_affected',
      'emergency_authorize', 'scope_fleet', 'approve_remediation',
      'begin_rollout', 'complete_rollout', 'verify',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for critical only', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('high')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('low')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('informational')).toBe(false);
  });

  it('isReportableTier — critical + high', () => {
    expect(isReportableTier('critical')).toBe(true);
    expect(isReportableTier('high')).toBe(true);
    expect(isReportableTier('medium')).toBe(false);
    expect(isReportableTier('low')).toBe(false);
    expect(isReportableTier('informational')).toBe(false);
  });
});

describe('W55 security-remediation chain — security functional party attribution', () => {
  it('security_analyst owns triage + impact assessment', () => {
    expect(partyForAction('triage')).toBe('security_analyst');
    expect(partyForAction('assess_impact')).toBe('security_analyst');
  });

  it('security_authority owns authorisation + verification + risk acceptance', () => {
    expect(partyForAction('mark_not_affected')).toBe('security_authority');
    expect(partyForAction('emergency_authorize')).toBe('security_authority');
    expect(partyForAction('approve_remediation')).toBe('security_authority');
    expect(partyForAction('verify')).toBe('security_authority');
    expect(partyForAction('accept_risk')).toBe('security_authority');
  });

  it('remediation_engineer owns hands-on mitigation + scoping + rollout + backout', () => {
    expect(partyForAction('apply_mitigation')).toBe('remediation_engineer');
    expect(partyForAction('scope_fleet')).toBe('remediation_engineer');
    expect(partyForAction('begin_rollout')).toBe('remediation_engineer');
    expect(partyForAction('complete_rollout')).toBe('remediation_engineer');
    expect(partyForAction('roll_back')).toBe('remediation_engineer');
  });
});
