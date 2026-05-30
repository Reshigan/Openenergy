// Wave 99 — IPP Quality / ITP spec tests.
import { describe, expect, it } from 'vitest';
import {
  nextStatus,
  isTerminal,
  isHighTier,
  tierFromInputs,
  slaMinutesFor,
  authorityFor,
  ballInCourtFor,
  isReportable,
  actionCrossesRegulator,
  urgencyBandFor,
  ippQualityIndex,
  predictedCloseDate,
  partyForAction,
  eventTypeFor,
  inboxSeverityForTier,
} from '../src/utils/itp-spec';

describe('W99 ITP — state machine', () => {
  it('clean forward path drafted -> submitted -> under_review -> approved -> released_to_site', () => {
    expect(nextStatus('itp_drafted', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'open_review')).toBe('under_review');
    expect(nextStatus('under_review', 'approve')).toBe('approved');
    expect(nextStatus('approved', 'release')).toBe('released_to_site');
  });

  it('inspection block scheduled -> in_inspection -> witness_attended -> result_recorded', () => {
    expect(nextStatus('released_to_site', 'schedule_inspection')).toBe('inspection_scheduled');
    expect(nextStatus('inspection_scheduled', 'begin_inspection')).toBe('in_inspection');
    expect(nextStatus('in_inspection', 'attend_witness')).toBe('witness_attended');
    expect(nextStatus('witness_attended', 'record_result')).toBe('result_recorded');
  });

  it('pass terminal closes the happy path', () => {
    expect(nextStatus('result_recorded', 'pass')).toBe('passed');
    expect(nextStatus('passed', 'release_for_use')).toBe('released_for_use');
    expect(nextStatus('released_for_use', 'archive')).toBe('archived');
  });

  it('fail loop: result_recorded -> failed -> corrective_action -> in_inspection (rejoin)', () => {
    expect(nextStatus('result_recorded', 'fail')).toBe('failed');
    expect(nextStatus('failed', 'raise_corrective_action')).toBe('corrective_action');
    expect(nextStatus('corrective_action', 're_inspect')).toBe('in_inspection');
  });

  it('reject reachable from submitted / under_review only', () => {
    expect(nextStatus('submitted', 'reject')).toBe('rejected');
    expect(nextStatus('under_review', 'reject')).toBe('rejected');
    expect(nextStatus('approved', 'reject')).toBe(null);
    expect(nextStatus('in_inspection', 'reject')).toBe(null);
  });

  it('withdraw reachable from drafted / submitted only', () => {
    expect(nextStatus('itp_drafted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('under_review', 'withdraw')).toBe(null);
    expect(nextStatus('approved', 'withdraw')).toBe(null);
  });

  it('void reachable from every non-terminal state', () => {
    for (const s of [
      'itp_drafted', 'submitted', 'under_review', 'approved',
      'released_to_site', 'inspection_scheduled', 'in_inspection',
      'witness_attended', 'result_recorded', 'passed', 'failed',
      'corrective_action', 'released_for_use',
    ] as const) {
      expect(nextStatus(s, 'void')).toBe('voided');
    }
  });

  it('terminals stop the machine', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('voided')).toBe(true);
    expect(isTerminal('itp_drafted')).toBe(false);
    expect(isTerminal('released_for_use')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('itp_drafted', 'approve')).toBe(null);
    expect(nextStatus('approved', 'record_result')).toBe(null);
    expect(nextStatus('archived', 'submit')).toBe(null);
  });
});

describe('W99 ITP — tier derivation with FLOOR-AT-HIGH', () => {
  const baseFlags = {
    blocksHandoverMilestone: false,
    blocksCommercialOperation: false,
    safetyCriticalTest: false,
    regulatorHoldPoint: false,
  };

  it('handover_doc_pack + low priority + no flags = low tier', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_handover_doc_pack',
      ...baseFlags,
    })).toBe('low');
  });

  it('itp_grid_synchronisation floors at critical regardless of priority', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_grid_synchronisation',
      ...baseFlags,
    })).toBe('critical');
  });

  it('itp_protection_relay floors at critical', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_protection_relay',
      ...baseFlags,
    })).toBe('critical');
  });

  it('itp_pressure_vessel floors at critical', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_pressure_vessel',
      ...baseFlags,
    })).toBe('critical');
  });

  it('blocks_handover_milestone flag floors low -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_handover_doc_pack',
      ...baseFlags, blocksHandoverMilestone: true,
    })).toBe('high');
  });

  it('blocks_commercial_operation flag floors low -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_handover_doc_pack',
      ...baseFlags, blocksCommercialOperation: true,
    })).toBe('high');
  });

  it('safety_critical_test flag floors standard -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'standard', workflowClass: 'itp_civil_foundation',
      ...baseFlags, safetyCriticalTest: true,
    })).toBe('high');
  });

  it('regulator_hold_point flag floors low -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'itp_electrical_lv',
      ...baseFlags, regulatorHoldPoint: true,
    })).toBe('high');
  });

  it('priority outranks workflow when higher', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'itp_handover_doc_pack',
      ...baseFlags,
    })).toBe('critical');
  });

  it('floor does not downgrade an already-critical tier', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'itp_handover_doc_pack',
      ...baseFlags, safetyCriticalTest: true,
    })).toBe('critical');
  });
});

describe('W99 ITP — URGENT SLA polarity', () => {
  it('critical tier tighter than low tier on submitted', () => {
    const c = slaMinutesFor('submitted', 'critical')!;
    const l = slaMinutesFor('submitted', 'low')!;
    expect(c).toBeLessThan(l);
  });

  it('safety/COD blocker = hours-money at critical (<=240 min on most active states)', () => {
    expect(slaMinutesFor('in_inspection', 'critical')).toBeLessThanOrEqual(240);
    expect(slaMinutesFor('witness_attended', 'critical')).toBeLessThanOrEqual(240);
    expect(slaMinutesFor('result_recorded', 'critical')).toBeLessThanOrEqual(240);
    expect(slaMinutesFor('failed', 'critical')).toBeLessThanOrEqual(240);
  });

  it('terminal states have null SLA windows', () => {
    expect(slaMinutesFor('archived', 'critical')).toBe(null);
    expect(slaMinutesFor('rejected', 'high')).toBe(null);
    expect(slaMinutesFor('withdrawn', 'standard')).toBe(null);
    expect(slaMinutesFor('voided', 'low')).toBe(null);
  });
});

describe('W99 ITP — authority + ball-in-court', () => {
  it('authority ladder ascends with tier', () => {
    expect(authorityFor('low')).toBe('site_supervisor');
    expect(authorityFor('standard')).toBe('quality_engineer');
    expect(authorityFor('high')).toBe('project_manager');
    expect(authorityFor('critical')).toBe('project_director');
  });

  it('ball-in-court reflects party doing the next move', () => {
    expect(ballInCourtFor('itp_drafted')).toBe('quality_engineer');
    expect(ballInCourtFor('submitted')).toBe('project_manager');
    expect(ballInCourtFor('in_inspection')).toBe('quality_engineer');
    expect(ballInCourtFor('witness_attended')).toBe('independent_engineer');
    expect(ballInCourtFor('failed')).toBe('contractor');
    expect(ballInCourtFor('corrective_action')).toBe('contractor');
    expect(ballInCourtFor('released_for_use')).toBe('commissioning_engineer');
  });

  it('terminal states have no ball-in-court', () => {
    expect(ballInCourtFor('archived')).toBe(null);
    expect(ballInCourtFor('rejected')).toBe(null);
    expect(ballInCourtFor('withdrawn')).toBe(null);
    expect(ballInCourtFor('voided')).toBe(null);
  });
});

describe('W99 ITP — SIGNATURE regulator crossings', () => {
  const flagsBase = {
    blocksHandoverMilestone: false,
    blocksCommercialOperation: false,
    safetyCriticalTest: false,
    regulatorHoldPoint: false,
  };

  it('SIGNATURE submit -> regulator EVERY tier when safety_critical_test', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'submit', tier, ...flagsBase, safetyCriticalTest: true,
      })).toBe(true);
    }
  });

  it('SIGNATURE submit does NOT cross without safety_critical_test', () => {
    expect(actionCrossesRegulator({
      action: 'submit', tier: 'critical', ...flagsBase,
    })).toBe(false);
  });

  it('SIGNATURE approve -> regulator EVERY tier when blocks_commercial_operation', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'approve', tier, ...flagsBase, blocksCommercialOperation: true,
      })).toBe(true);
    }
  });

  it('SIGNATURE record_result(failed) crosses on safety OR COD-blocker EVERY tier', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'record_result', tier, ...flagsBase,
        safetyCriticalTest: true, resultFailed: true,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'record_result', tier, ...flagsBase,
        blocksCommercialOperation: true, resultFailed: true,
      })).toBe(true);
    }
  });

  it('record_result(passed) does NOT trigger regulator under safety_critical_test alone', () => {
    expect(actionCrossesRegulator({
      action: 'record_result', tier: 'critical', ...flagsBase,
      safetyCriticalTest: true, resultFailed: false,
    })).toBe(false);
  });

  it('SIGNATURE void crosses regulator EVERY tier on COD-blocker OR safety_critical_test', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'void', tier, ...flagsBase, blocksCommercialOperation: true,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'void', tier, ...flagsBase, safetyCriticalTest: true,
      })).toBe(true);
    }
  });

  it('pass crosses regulator on regulator_hold_point at high+critical only', () => {
    expect(actionCrossesRegulator({
      action: 'pass', tier: 'high', ...flagsBase, regulatorHoldPoint: true,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'pass', tier: 'critical', ...flagsBase, regulatorHoldPoint: true,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'pass', tier: 'standard', ...flagsBase, regulatorHoldPoint: true,
    })).toBe(false);
  });

  it('routine actions do not cross', () => {
    for (const action of ['open_review', 'release', 'schedule_inspection',
      'begin_inspection', 'attend_witness', 'raise_corrective_action',
      're_inspect', 'release_for_use', 'archive'] as const) {
      expect(actionCrossesRegulator({
        action, tier: 'critical', ...flagsBase,
        blocksCommercialOperation: true, safetyCriticalTest: true,
      })).toBe(false);
    }
  });
});

describe('W99 ITP — urgency band, reportable, severity', () => {
  it('terminal == terminal band', () => {
    expect(urgencyBandFor(120, true)).toBe('terminal');
    expect(urgencyBandFor(null, true)).toBe('terminal');
  });

  it('breached SLA = red', () => {
    expect(urgencyBandFor(-15, false)).toBe('red');
  });

  it('amber zone 240..1440 min', () => {
    expect(urgencyBandFor(300, false)).toBe('amber');
    expect(urgencyBandFor(1000, false)).toBe('amber');
  });

  it('yellow zone 1440..4320 min', () => {
    expect(urgencyBandFor(1500, false)).toBe('yellow');
    expect(urgencyBandFor(4000, false)).toBe('yellow');
  });

  it('green zone beyond 4320 min', () => {
    expect(urgencyBandFor(5000, false)).toBe('green');
    expect(urgencyBandFor(null, false)).toBe('green');
  });

  it('isReportable mirrors high tier flag', () => {
    expect(isReportable('low')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('high')).toBe(true);
    expect(isReportable('critical')).toBe(true);
  });

  it('inbox severity ladder', () => {
    expect(inboxSeverityForTier('critical')).toBe('high');
    expect(inboxSeverityForTier('high')).toBe('medium');
    expect(inboxSeverityForTier('standard')).toBe('low');
    expect(inboxSeverityForTier('low')).toBe('low');
  });
});

describe('W99 ITP — 0-130 ippQualityIndex with witness/first-time-pass/photo bonuses', () => {
  const base = {
    withinSla: true, reinspectionCount: 1, ballInCourtClear: true,
    photoEvidenceCount: 0, witnessAttended: false, firstTimePass: false,
    rootCauseDocumented: false,
  };

  it('baseline 100 with single-shot reinspection, no bonuses', () => {
    expect(ippQualityIndex(base)).toBe(100);
  });

  it('SLA miss penalty -25', () => {
    expect(ippQualityIndex({ ...base, withinSla: false })).toBe(75);
  });

  it('rework penalty kicks in only past 1st reinspection', () => {
    expect(ippQualityIndex({ ...base, reinspectionCount: 1 })).toBe(100);
    expect(ippQualityIndex({ ...base, reinspectionCount: 2 })).toBe(90);
    expect(ippQualityIndex({ ...base, reinspectionCount: 3 })).toBe(80);
  });

  it('witness bonus +10', () => {
    expect(ippQualityIndex({ ...base, witnessAttended: true })).toBe(110);
  });

  it('first-time pass bonus +10 (stackable with witness)', () => {
    expect(ippQualityIndex({
      ...base, witnessAttended: true, firstTimePass: true,
    })).toBe(120);
  });

  it('photo bonus: 4+ photos = +10, 1..3 = +5', () => {
    expect(ippQualityIndex({ ...base, photoEvidenceCount: 4 })).toBe(110);
    expect(ippQualityIndex({ ...base, photoEvidenceCount: 1 })).toBe(105);
    expect(ippQualityIndex({ ...base, photoEvidenceCount: 0 })).toBe(100);
  });

  it('caps at 130 with all bonuses stacked', () => {
    expect(ippQualityIndex({
      withinSla: true, reinspectionCount: 0, ballInCourtClear: true,
      photoEvidenceCount: 8, witnessAttended: true, firstTimePass: true,
      rootCauseDocumented: true,
    })).toBe(130);
  });

  it('floors at 0 under maximum penalty stack', () => {
    expect(ippQualityIndex({
      withinSla: false, reinspectionCount: 20, ballInCourtClear: false,
      photoEvidenceCount: 0, witnessAttended: false, firstTimePass: false,
      rootCauseDocumented: false,
    })).toBe(0);
  });
});

describe('W99 ITP — predicted close date sums forward path', () => {
  it('produces a positive duration on early state', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const eta = predictedCloseDate('itp_drafted', 'critical', now);
    expect(eta).not.toBe(null);
    expect(eta!.getTime() - now.getTime()).toBeGreaterThan(0);
  });

  it('failed path takes longer than passed path at same tier', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const etaFailed = predictedCloseDate('failed', 'high', now);
    const etaPassed = predictedCloseDate('passed', 'high', now);
    expect(etaFailed!.getTime()).toBeGreaterThan(etaPassed!.getTime());
  });

  it('terminal status returns null', () => {
    const now = new Date();
    expect(predictedCloseDate('archived', 'critical', now)).toBe(null);
    expect(predictedCloseDate('voided', 'low', now)).toBe(null);
  });
});

describe('W99 ITP — party-from-action mapping', () => {
  it('witness party handles attend_witness', () => {
    expect(partyForAction('attend_witness')).toBe('witness');
  });

  it('contractor handles corrective action raise', () => {
    expect(partyForAction('raise_corrective_action')).toBe('contractor');
  });

  it('independent_engineer drives results', () => {
    expect(partyForAction('record_result')).toBe('independent_engineer');
    expect(partyForAction('pass')).toBe('independent_engineer');
    expect(partyForAction('fail')).toBe('independent_engineer');
  });

  it('commissioning_engineer releases for use', () => {
    expect(partyForAction('release_for_use')).toBe('commissioning_engineer');
  });

  it('owner voids', () => {
    expect(partyForAction('void')).toBe('owner');
  });
});

describe('W99 ITP — event type encoding', () => {
  it('eventTypeFor prefixes with itp.', () => {
    expect(eventTypeFor('submit')).toBe('itp.submit');
    expect(eventTypeFor('record_result')).toBe('itp.record_result');
    expect(eventTypeFor('archive')).toBe('itp.archive');
  });
});
