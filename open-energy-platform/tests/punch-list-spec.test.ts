// Wave 98 — IPP Punch List / COD Snag Handover spec tests.
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
  ippPmQualityIndex,
  predictedCloseDate,
  partyForAction,
  eventTypeFor,
  inboxSeverityForTier,
} from '../src/utils/punch-list-spec';

describe('W98 Punch List — state machine', () => {
  it('clean forward path identified -> assessed -> assigned -> in_remediation -> reinspect_requested -> reinspected -> accepted -> closed', () => {
    expect(nextStatus('identified', 'assess')).toBe('assessed');
    expect(nextStatus('assessed', 'assign')).toBe('assigned');
    expect(nextStatus('assigned', 'begin_remediation')).toBe('in_remediation');
    expect(nextStatus('in_remediation', 'request_reinspection')).toBe('reinspect_requested');
    expect(nextStatus('reinspect_requested', 'reinspect')).toBe('reinspected');
    expect(nextStatus('reinspected', 'accept')).toBe('accepted');
    expect(nextStatus('accepted', 'close')).toBe('closed');
  });

  it('reject_reinspection rejoins assigned (rework loop)', () => {
    expect(nextStatus('reinspected', 'reject_reinspection')).toBe('assigned');
  });

  it('park / resume loop through on_hold', () => {
    expect(nextStatus('in_remediation', 'park')).toBe('on_hold');
    expect(nextStatus('on_hold', 'resume')).toBe('in_remediation');
  });

  it('void terminal reachable from active states', () => {
    expect(nextStatus('identified', 'void')).toBe('voided');
    expect(nextStatus('assessed', 'void')).toBe('voided');
    expect(nextStatus('assigned', 'void')).toBe('voided');
    expect(nextStatus('in_remediation', 'void')).toBe('voided');
    expect(nextStatus('reinspect_requested', 'void')).toBe('voided');
    expect(nextStatus('reinspected', 'void')).toBe('voided');
    expect(nextStatus('accepted', 'void')).toBe('voided');
    expect(nextStatus('on_hold', 'void')).toBe('voided');
  });

  it('withdraw reachable from author-court states only', () => {
    expect(nextStatus('identified', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('assessed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('assigned', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('on_hold', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('in_remediation', 'withdraw')).toBe(null);
    expect(nextStatus('reinspected', 'withdraw')).toBe(null);
    expect(nextStatus('accepted', 'withdraw')).toBe(null);
  });

  it('terminals stop the machine', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('voided')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('identified')).toBe(false);
    expect(isTerminal('accepted')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('identified', 'accept')).toBe(null);
    expect(nextStatus('assigned', 'close')).toBe(null);
    expect(nextStatus('closed', 'assess')).toBe(null);
  });
});

describe('W98 Punch List — tier derivation with FLOOR-AT-HIGH', () => {
  const baseFlags = {
    blocksCommercialOperation: false,
    blocksHandover: false,
    lifeSafetyCritical: false,
    warrantyCritical: false,
  };

  it('cosmetic + low priority + no flags = low tier', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_cosmetic',
      ...baseFlags,
    })).toBe('low');
  });

  it('punch_safety_critical floors at critical regardless of priority', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_safety_critical',
      ...baseFlags,
    })).toBe('critical');
  });

  it('punch_handover_blocker floors at high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_handover_blocker',
      ...baseFlags,
    })).toBe('high');
  });

  it('punch_commissioning floors at high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_commissioning',
      ...baseFlags,
    })).toBe('high');
  });

  it('punch_functional_performance base is standard', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_functional_performance',
      ...baseFlags,
    })).toBe('standard');
  });

  it('snag_post_handover base is low', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'snag_post_handover',
      ...baseFlags,
    })).toBe('low');
  });

  it('FLOOR-AT-HIGH: blocksCommercialOperation floors low cosmetic to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_cosmetic',
      ...baseFlags, blocksCommercialOperation: true,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH: blocksHandover floors low cosmetic to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_cosmetic',
      ...baseFlags, blocksHandover: true,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH: lifeSafetyCritical floors low cosmetic to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_cosmetic',
      ...baseFlags, lifeSafetyCritical: true,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH: warrantyCritical floors low cosmetic to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'punch_cosmetic',
      ...baseFlags, warrantyCritical: true,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH does NOT downgrade critical punch_safety_critical', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'punch_safety_critical',
      blocksCommercialOperation: true, blocksHandover: true,
      lifeSafetyCritical: true, warrantyCritical: true,
    })).toBe('critical');
  });

  it('priority critical takes precedence over cosmetic base low', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'punch_cosmetic',
      ...baseFlags,
    })).toBe('critical');
  });
});

describe('W98 Punch List — URGENT SLA polarity', () => {
  it('critical tier has tighter SLA than low tier on identified', () => {
    const c = slaMinutesFor('identified', 'critical')!;
    const l = slaMinutesFor('identified', 'low')!;
    expect(c).toBeLessThan(l);
    expect(c).toBe(60);
    expect(l).toBe(4320);
  });

  it('SLA increases monotonically from critical -> high -> standard -> low', () => {
    for (const s of ['identified', 'assigned', 'in_remediation', 'reinspect_requested'] as const) {
      const c = slaMinutesFor(s, 'critical')!;
      const h = slaMinutesFor(s, 'high')!;
      const st = slaMinutesFor(s, 'standard')!;
      const l = slaMinutesFor(s, 'low')!;
      expect(c).toBeLessThanOrEqual(h);
      expect(h).toBeLessThanOrEqual(st);
      expect(st).toBeLessThanOrEqual(l);
    }
  });

  it('terminal states have null SLA', () => {
    expect(slaMinutesFor('closed', 'critical')).toBe(null);
    expect(slaMinutesFor('voided', 'high')).toBe(null);
    expect(slaMinutesFor('withdrawn', 'low')).toBe(null);
  });
});

describe('W98 Punch List — authority + ball in court', () => {
  it('authorityFor escalates with tier', () => {
    expect(authorityFor('low')).toBe('site_supervisor');
    expect(authorityFor('standard')).toBe('quality_engineer');
    expect(authorityFor('high')).toBe('project_manager');
    expect(authorityFor('critical')).toBe('project_director');
  });

  it('ballInCourtFor returns party for each active state', () => {
    expect(ballInCourtFor('identified')).toBe('quality_engineer');
    expect(ballInCourtFor('assessed')).toBe('project_manager');
    expect(ballInCourtFor('assigned')).toBe('contractor');
    expect(ballInCourtFor('in_remediation')).toBe('contractor');
    expect(ballInCourtFor('reinspect_requested')).toBe('quality_engineer');
    expect(ballInCourtFor('reinspected')).toBe('reviewer');
    expect(ballInCourtFor('accepted')).toBe('project_manager');
    expect(ballInCourtFor('on_hold')).toBe('project_manager');
  });

  it('ballInCourtFor returns null for terminal states', () => {
    expect(ballInCourtFor('closed')).toBe(null);
    expect(ballInCourtFor('voided')).toBe(null);
    expect(ballInCourtFor('withdrawn')).toBe(null);
  });
});

describe('W98 Punch List — reportability + SIGNATURE crossings', () => {
  const noFlags = {
    blocksCommercialOperation: false,
    blocksHandover: false,
    lifeSafetyCritical: false,
    warrantyCritical: false,
  };

  it('isHighTier covers critical+high only', () => {
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('high')).toBe(true);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('low')).toBe(false);
  });

  it('isReportable covers critical+high', () => {
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('high')).toBe(true);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('low')).toBe(false);
  });

  it('SIGNATURE close crosses EVERY tier when blocks_commercial_operation', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'close', tier, ...noFlags, blocksCommercialOperation: true,
      })).toBe(true);
    }
  });

  it('SIGNATURE close crosses EVERY tier when life_safety_critical', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'close', tier, ...noFlags, lifeSafetyCritical: true,
      })).toBe(true);
    }
  });

  it('SIGNATURE accept on life_safety_critical at high+critical only', () => {
    expect(actionCrossesRegulator({
      action: 'accept', tier: 'high', ...noFlags, lifeSafetyCritical: true,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'accept', tier: 'critical', ...noFlags, lifeSafetyCritical: true,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'accept', tier: 'standard', ...noFlags, lifeSafetyCritical: true,
    })).toBe(false);
    expect(actionCrossesRegulator({
      action: 'accept', tier: 'low', ...noFlags, lifeSafetyCritical: true,
    })).toBe(false);
  });

  it('SIGNATURE reject_reinspection on blocks_commercial_operation at high+critical only', () => {
    expect(actionCrossesRegulator({
      action: 'reject_reinspection', tier: 'high', ...noFlags, blocksCommercialOperation: true,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'reject_reinspection', tier: 'standard', ...noFlags, blocksCommercialOperation: true,
    })).toBe(false);
  });

  it('SIGNATURE void crosses EVERY tier on blocks_handover or life_safety_critical', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'void', tier, ...noFlags, blocksHandover: true,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'void', tier, ...noFlags, lifeSafetyCritical: true,
      })).toBe(true);
    }
  });

  it('no crossings without trigger flags', () => {
    for (const action of ['close', 'accept', 'reject_reinspection', 'void'] as const) {
      expect(actionCrossesRegulator({
        action, tier: 'critical', ...noFlags,
      })).toBe(false);
    }
  });

  it('assess / assign / begin_remediation / request_reinspection / reinspect / park / resume / withdraw never cross', () => {
    for (const action of ['assess', 'assign', 'begin_remediation', 'request_reinspection', 'reinspect', 'park', 'resume', 'withdraw'] as const) {
      expect(actionCrossesRegulator({
        action, tier: 'critical',
        blocksCommercialOperation: true, blocksHandover: true,
        lifeSafetyCritical: true, warrantyCritical: true,
      })).toBe(false);
    }
  });
});

describe('W98 Punch List — urgency band', () => {
  it('terminal returns terminal', () => {
    expect(urgencyBandFor(100, true)).toBe('terminal');
  });
  it('null SLA returns green', () => {
    expect(urgencyBandFor(null, false)).toBe('green');
  });
  it('overdue returns red', () => {
    expect(urgencyBandFor(-10, false)).toBe('red');
  });
  it('< 4h returns red', () => {
    expect(urgencyBandFor(120, false)).toBe('red');
  });
  it('< 24h returns amber', () => {
    expect(urgencyBandFor(360, false)).toBe('amber');
  });
  it('< 72h returns yellow', () => {
    expect(urgencyBandFor(2880, false)).toBe('yellow');
  });
  it('>= 72h returns green', () => {
    expect(urgencyBandFor(5000, false)).toBe('green');
  });
});

describe('W98 Punch List — ipp-pm quality index', () => {
  const base = {
    withinSla: true, rejectionCount: 0, reinspectionCount: 0,
    ballInCourtClear: true, photoEvidenceCount: 0,
    rootCauseDocumented: false, commissioningEvidence: false,
  };

  it('clean baseline = 100', () => {
    expect(ippPmQualityIndex(base)).toBe(100);
  });

  it('SLA breach docks 25', () => {
    expect(ippPmQualityIndex({ ...base, withinSla: false })).toBe(75);
  });

  it('rejections dock 15 each', () => {
    expect(ippPmQualityIndex({ ...base, rejectionCount: 2 })).toBe(70);
  });

  it('reinspection beyond first docks 10 each', () => {
    expect(ippPmQualityIndex({ ...base, reinspectionCount: 1 })).toBe(100);
    expect(ippPmQualityIndex({ ...base, reinspectionCount: 2 })).toBe(90);
    expect(ippPmQualityIndex({ ...base, reinspectionCount: 3 })).toBe(80);
  });

  it('ball-in-court not clear docks 5', () => {
    expect(ippPmQualityIndex({ ...base, ballInCourtClear: false })).toBe(95);
  });

  it('4+ photos give +10', () => {
    expect(ippPmQualityIndex({ ...base, photoEvidenceCount: 4 })).toBe(110);
  });

  it('1-3 photos give +5', () => {
    expect(ippPmQualityIndex({ ...base, photoEvidenceCount: 2 })).toBe(105);
  });

  it('root cause documented gives +5', () => {
    expect(ippPmQualityIndex({ ...base, rootCauseDocumented: true })).toBe(105);
  });

  it('commissioning evidence gives +5', () => {
    expect(ippPmQualityIndex({ ...base, commissioningEvidence: true })).toBe(105);
  });

  it('clamps at 0', () => {
    expect(ippPmQualityIndex({
      ...base, withinSla: false, rejectionCount: 100, reinspectionCount: 100,
    })).toBe(0);
  });

  it('clamps at 130', () => {
    expect(ippPmQualityIndex({
      ...base, photoEvidenceCount: 50, rootCauseDocumented: true, commissioningEvidence: true,
    })).toBeLessThanOrEqual(130);
  });

  it('best clean score = 100 + 10 photos + 5 root + 5 commissioning = 120', () => {
    expect(ippPmQualityIndex({
      ...base, photoEvidenceCount: 8, rootCauseDocumented: true, commissioningEvidence: true,
    })).toBe(120);
  });
});

describe('W98 Punch List — predicted close date', () => {
  it('returns null for terminal', () => {
    expect(predictedCloseDate('closed', 'critical', new Date())).toBe(null);
  });

  it('sums remaining SLA forward for low tier', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = predictedCloseDate('identified', 'low', t0)!;
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBeGreaterThan(t0.getTime());
  });

  it('critical tier predicted close is sooner than low tier', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const dc = predictedCloseDate('identified', 'critical', t0)!;
    const dl = predictedCloseDate('identified', 'low', t0)!;
    expect(dc.getTime()).toBeLessThan(dl.getTime());
  });

  it('further-along state has nearer predicted close', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const dIdent = predictedCloseDate('identified', 'standard', t0)!;
    const dAccept = predictedCloseDate('accepted', 'standard', t0)!;
    expect(dAccept.getTime()).toBeLessThan(dIdent.getTime());
  });
});

describe('W98 Punch List — party for action', () => {
  it('assess / reinspect -> quality_engineer', () => {
    expect(partyForAction('assess')).toBe('quality_engineer');
    expect(partyForAction('reinspect')).toBe('quality_engineer');
  });

  it('assign / close / park / resume -> project_manager', () => {
    expect(partyForAction('assign')).toBe('project_manager');
    expect(partyForAction('close')).toBe('project_manager');
    expect(partyForAction('park')).toBe('project_manager');
    expect(partyForAction('resume')).toBe('project_manager');
  });

  it('begin_remediation / request_reinspection -> contractor', () => {
    expect(partyForAction('begin_remediation')).toBe('contractor');
    expect(partyForAction('request_reinspection')).toBe('contractor');
  });

  it('accept / reject_reinspection -> reviewer', () => {
    expect(partyForAction('accept')).toBe('reviewer');
    expect(partyForAction('reject_reinspection')).toBe('reviewer');
  });

  it('void -> owner', () => {
    expect(partyForAction('void')).toBe('owner');
  });

  it('withdraw -> site_supervisor', () => {
    expect(partyForAction('withdraw')).toBe('site_supervisor');
  });
});

describe('W98 Punch List — event type + inbox severity', () => {
  it('eventTypeFor prefixes punch_list.', () => {
    expect(eventTypeFor('close')).toBe('punch_list.close');
    expect(eventTypeFor('accept')).toBe('punch_list.accept');
    expect(eventTypeFor('void')).toBe('punch_list.void');
  });

  it('inbox severity maps from tier', () => {
    expect(inboxSeverityForTier('critical')).toBe('high');
    expect(inboxSeverityForTier('high')).toBe('medium');
    expect(inboxSeverityForTier('standard')).toBe('low');
    expect(inboxSeverityForTier('low')).toBe('low');
  });
});
