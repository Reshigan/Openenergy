import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForCapacityMw, breachClassFloor, tierForNonConformance,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isLargeTier, isReportable, partyForAction, isFacilityAction,
  type ComplianceStatus, type ComplianceTier, type ComplianceAction,
} from '../src/utils/grid-code-compliance-spec';

describe('W67 grid-code compliance & non-conformance chain — state machine', () => {
  it('happy path: monitoring→raised→assessment→CAR→submitted→approved→remediation→retest→closed', () => {
    let s: ComplianceStatus = 'monitoring';
    s = nextStatus(s, 'raise_non_conformance')!;     expect(s).toBe('non_conformance_raised');
    s = nextStatus(s, 'begin_assessment')!;          expect(s).toBe('under_assessment');
    s = nextStatus(s, 'require_corrective_action')!; expect(s).toBe('corrective_action_required');
    s = nextStatus(s, 'submit_cap')!;                expect(s).toBe('cap_submitted');
    s = nextStatus(s, 'approve_cap')!;               expect(s).toBe('cap_approved');
    s = nextStatus(s, 'begin_remediation')!;         expect(s).toBe('remediation_in_progress');
    s = nextStatus(s, 'initiate_retest')!;           expect(s).toBe('compliance_retest');
    s = nextStatus(s, 'confirm_compliance')!;        expect(s).toBe('compliant_closed');
    expect(isTerminal('compliant_closed')).toBe(true);
  });

  it('CAP revise loop: cap_submitted→corrective_action_required (reject_cap)', () => {
    expect(nextStatus('cap_submitted', 'reject_cap')).toBe('corrective_action_required');
    expect(nextStatus('corrective_action_required', 'submit_cap')).toBe('cap_submitted');
  });

  it('operating-restriction branch reachable from assessment / remediation / retest', () => {
    expect(nextStatus('under_assessment', 'impose_restriction')).toBe('operating_restriction');
    expect(nextStatus('remediation_in_progress', 'impose_restriction')).toBe('operating_restriction');
    expect(nextStatus('compliance_retest', 'impose_restriction')).toBe('operating_restriction');
    expect(nextStatus('cap_approved', 'impose_restriction')).toBeNull();
  });

  it('restriction resumes remediation: operating_restriction→remediation_in_progress', () => {
    expect(nextStatus('operating_restriction', 'begin_remediation')).toBe('remediation_in_progress');
  });

  it('disconnection escalation from corrective_action_required or operating_restriction', () => {
    expect(nextStatus('corrective_action_required', 'escalate_disconnection')).toBe('disconnection_issued');
    expect(nextStatus('operating_restriction', 'escalate_disconnection')).toBe('disconnection_issued');
    expect(nextStatus('monitoring', 'escalate_disconnection')).toBeNull();
    expect(isTerminal('disconnection_issued')).toBe(true);
  });

  it('withdraw reachable only from the two early states', () => {
    expect(nextStatus('non_conformance_raised', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('under_assessment', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('corrective_action_required', 'withdraw')).toBeNull();
    expect(nextStatus('remediation_in_progress', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the early-state set', () => {
    expect(isWithdrawable('non_conformance_raised')).toBe(true);
    expect(isWithdrawable('under_assessment')).toBe(true);
    expect(isWithdrawable('corrective_action_required')).toBe(false);
    expect(isWithdrawable('monitoring')).toBe(false);
    expect(isWithdrawable('compliant_closed')).toBe(false);
  });

  it('all three terminals accept no further transitions', () => {
    expect(allowedActions('compliant_closed')).toEqual([]);
    expect(allowedActions('disconnection_issued')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('cap_submitted fans out to approve / reject', () => {
    const acts = allowedActions('cap_submitted');
    expect(acts).toContain('approve_cap');
    expect(acts).toContain('reject_cap');
    expect(acts).not.toContain('begin_remediation');
  });

  it('operating_restriction fans out to resume remediation or disconnect', () => {
    const acts = allowedActions('operating_restriction');
    expect(acts).toContain('begin_remediation');
    expect(acts).toContain('escalate_disconnection');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('monitoring', 'begin_assessment')).toBeNull();
    expect(nextStatus('non_conformance_raised', 'require_corrective_action')).toBeNull();
    expect(nextStatus('corrective_action_required', 'approve_cap')).toBeNull();
    expect(nextStatus('cap_approved', 'initiate_retest')).toBeNull();
    expect(nextStatus('remediation_in_progress', 'confirm_compliance')).toBeNull();
    expect(nextStatus('compliant_closed', 'confirm_compliance')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: ComplianceAction[] = [
      'raise_non_conformance', 'begin_assessment', 'require_corrective_action', 'submit_cap',
      'approve_cap', 'reject_cap', 'begin_remediation', 'initiate_retest',
      'confirm_compliance', 'impose_restriction', 'escalate_disconnection', 'withdraw',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W67 grid-code compliance chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('critical is the TIGHTEST window at every graded stage; minor the longest', () => {
    const graded: ComplianceStatus[] = [
      'monitoring', 'non_conformance_raised', 'under_assessment', 'corrective_action_required',
      'cap_submitted', 'cap_approved', 'remediation_in_progress', 'compliance_retest',
      'operating_restriction',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].critical).toBeLessThan(SLA_MINUTES[st].serious);
      expect(SLA_MINUTES[st].serious).toBeLessThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeLessThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('non_conformance_raised: minor 14d, critical 12h', () => {
    expect(SLA_MINUTES.non_conformance_raised.minor).toBe(14 * DAY);
    expect(SLA_MINUTES.non_conformance_raised.critical).toBe(12 * HOUR);
  });

  it('remediation_in_progress: minor 30d, critical 48h', () => {
    expect(SLA_MINUTES.remediation_in_progress.minor).toBe(30 * DAY);
    expect(SLA_MINUTES.remediation_in_progress.critical).toBe(48 * HOUR);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('non_conformance_raised', 'minor', base);
    expect(d!.getTime() - base.getTime()).toBe(14 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('under_assessment', 'minor')).toBe(10 * DAY);
    expect(slaWindowMinutes('compliant_closed', 'critical')).toBe(0);
  });

  it('all three terminals return null deadline', () => {
    expect(slaDeadlineFor('compliant_closed', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('disconnection_issued', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'critical', base)).toBeNull();
  });
});

describe('W67 grid-code compliance chain — system-risk tiering', () => {
  it('tierForCapacityMw boundaries', () => {
    expect(tierForCapacityMw(0.5)).toBe('minor');
    expect(tierForCapacityMw(0.99)).toBe('minor');
    expect(tierForCapacityMw(1)).toBe('moderate');
    expect(tierForCapacityMw(9.9)).toBe('moderate');
    expect(tierForCapacityMw(10)).toBe('material');
    expect(tierForCapacityMw(49)).toBe('material');
    expect(tierForCapacityMw(50)).toBe('serious');
    expect(tierForCapacityMw(199)).toBe('serious');
    expect(tierForCapacityMw(200)).toBe('critical');
    expect(tierForCapacityMw(600)).toBe('critical');
  });

  it('breachClassFloor — stability-critical breaches floor at serious; system breaches at material', () => {
    expect(breachClassFloor('fault_ride_through')).toBe('serious');
    expect(breachClassFloor('frequency_response')).toBe('serious');
    expect(breachClassFloor('protection_coordination')).toBe('serious');
    expect(breachClassFloor('reactive_power')).toBe('material');
    expect(breachClassFloor('voltage_regulation')).toBe('material');
    expect(breachClassFloor('power_quality')).toBe('minor');
    expect(breachClassFloor('telemetry')).toBe('minor');
    expect(breachClassFloor('metering')).toBe('minor');
  });

  it('tierForNonConformance takes the higher of size-tier and breach-floor', () => {
    // tiny plant, fault-ride-through breach → escalated to serious by the floor
    expect(tierForNonConformance(0.5, 'fault_ride_through')).toBe('serious');
    // tiny plant, power-quality breach → stays minor
    expect(tierForNonConformance(0.5, 'power_quality')).toBe('minor');
    // big plant, telemetry breach → size wins (critical)
    expect(tierForNonConformance(600, 'telemetry')).toBe('critical');
    // mid plant, reactive-power breach → material floor vs material size → material
    expect(tierForNonConformance(20, 'reactive_power')).toBe('material');
    // small plant, reactive-power breach → floor (material) beats size (moderate)
    expect(tierForNonConformance(5, 'reactive_power')).toBe('material');
  });

  it('isLargeTier — serious + critical only', () => {
    expect(isLargeTier('critical')).toBe(true);
    expect(isLargeTier('serious')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });

  it('isReportable — serious + critical only', () => {
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('serious')).toBe(true);
    expect(isReportable('material')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W67 grid-code compliance chain — reportability (the signature)', () => {
  const tiers: ComplianceTier[] = ['minor', 'moderate', 'material', 'serious', 'critical'];

  it('escalate_disconnection crosses for EVERY tier (the signature — disconnection is always notifiable)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('escalate_disconnection', t)).toBe(true);
    }
  });

  it('impose_restriction crosses for the large tiers only (serious + critical)', () => {
    expect(crossesIntoRegulator('impose_restriction', 'critical')).toBe(true);
    expect(crossesIntoRegulator('impose_restriction', 'serious')).toBe(true);
    expect(crossesIntoRegulator('impose_restriction', 'material')).toBe(false);
    expect(crossesIntoRegulator('impose_restriction', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('impose_restriction', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: ComplianceAction[] = [
      'raise_non_conformance', 'begin_assessment', 'require_corrective_action', 'submit_cap',
      'approve_cap', 'reject_cap', 'begin_remediation', 'initiate_retest', 'confirm_compliance', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the large tiers only (serious + critical)', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('serious')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W67 grid-code compliance chain — party attribution + write split', () => {
  it('operator (SO/TSO) drives raise / assess / require / approve / reject / retest / confirm / restrict / disconnect / withdraw', () => {
    expect(partyForAction('raise_non_conformance')).toBe('operator');
    expect(partyForAction('begin_assessment')).toBe('operator');
    expect(partyForAction('require_corrective_action')).toBe('operator');
    expect(partyForAction('approve_cap')).toBe('operator');
    expect(partyForAction('reject_cap')).toBe('operator');
    expect(partyForAction('initiate_retest')).toBe('operator');
    expect(partyForAction('confirm_compliance')).toBe('operator');
    expect(partyForAction('impose_restriction')).toBe('operator');
    expect(partyForAction('escalate_disconnection')).toBe('operator');
    expect(partyForAction('withdraw')).toBe('operator');
  });

  it('connected facility submits the CAP and performs remediation', () => {
    expect(partyForAction('submit_cap')).toBe('facility');
    expect(partyForAction('begin_remediation')).toBe('facility');
  });

  it('isFacilityAction matches the facility-side action set', () => {
    expect(isFacilityAction('submit_cap')).toBe(true);
    expect(isFacilityAction('begin_remediation')).toBe(true);
    expect(isFacilityAction('approve_cap')).toBe(false);
    expect(isFacilityAction('escalate_disconnection')).toBe(false);
  });
});
