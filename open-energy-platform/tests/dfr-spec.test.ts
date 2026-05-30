// Wave 97 — IPP Daily Field Report / Progress Diary spec tests.
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
} from '../src/utils/dfr-spec';

describe('W97 DFR — state machine', () => {
  it('clean forward path drafted -> entries_open -> entries_closed -> submitted -> under_review -> approved -> distributed -> archived', () => {
    expect(nextStatus('drafted', 'open')).toBe('entries_open');
    expect(nextStatus('entries_open', 'close_entries')).toBe('entries_closed');
    expect(nextStatus('entries_closed', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'start_review')).toBe('under_review');
    expect(nextStatus('under_review', 'approve')).toBe('approved');
    expect(nextStatus('approved', 'distribute')).toBe('distributed');
    expect(nextStatus('distributed', 'archive')).toBe('archived');
  });

  it('return-for-correction branch loops back to submitted', () => {
    expect(nextStatus('under_review', 'return_for_correction')).toBe('returned_for_correction');
    expect(nextStatus('returned_for_correction', 'correct')).toBe('corrected');
    expect(nextStatus('corrected', 'submit')).toBe('submitted');
  });

  it('void terminal reachable from active states', () => {
    expect(nextStatus('drafted', 'void')).toBe('voided');
    expect(nextStatus('entries_open', 'void')).toBe('voided');
    expect(nextStatus('under_review', 'void')).toBe('voided');
    expect(nextStatus('approved', 'void')).toBe('voided');
    expect(nextStatus('distributed', 'void')).toBe('voided');
  });

  it('withdraw reachable from author-court states only', () => {
    expect(nextStatus('drafted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('entries_open', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('returned_for_correction', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('under_review', 'withdraw')).toBe(null);
    expect(nextStatus('approved', 'withdraw')).toBe(null);
  });

  it('terminals stop the machine', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('voided')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('drafted')).toBe(false);
    expect(isTerminal('approved')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('drafted', 'approve')).toBe(null);
    expect(nextStatus('entries_open', 'distribute')).toBe(null);
    expect(nextStatus('archived', 'open')).toBe(null);
  });
});

describe('W97 DFR — tier derivation with FLOOR-AT-HIGH', () => {
  it('routine_daily + low priority + no flags = low tier', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'routine_daily',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('low');
  });

  it('safety_incident floors at critical regardless of priority', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'safety_incident',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('critical');
  });

  it('near_miss floors at high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'near_miss',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('high');
  });

  it('equipment_breakdown floors at high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'equipment_breakdown',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('high');
  });

  it('milestone_handover floors at high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'milestone_handover',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('high');
  });

  it('weather_delay base is standard', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'weather_delay',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('standard');
  });

  it('FLOOR-AT-HIGH: triggersHseIncident floors low routine to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'routine_daily',
      triggersHseIncident: true, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH: triggersChangeOrder floors low routine to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'routine_daily',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH: triggersWarrantyClaim floors low routine to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'routine_daily',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: true, contributesToEvm: false,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH: contributesToEvm floors low routine to high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'routine_daily',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: true,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH does NOT downgrade critical safety_incident', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'safety_incident',
      triggersHseIncident: true, triggersChangeOrder: true,
      triggersWarrantyClaim: true, contributesToEvm: true,
    })).toBe('critical');
  });

  it('priority critical takes precedence over weather_delay base standard', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'weather_delay',
      triggersHseIncident: false, triggersChangeOrder: false,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe('critical');
  });
});

describe('W97 DFR — URGENT SLA polarity', () => {
  it('critical tier has tighter SLA than low tier on drafted', () => {
    const c = slaMinutesFor('drafted', 'critical')!;
    const l = slaMinutesFor('drafted', 'low')!;
    expect(c).toBeLessThan(l);
    expect(c).toBe(60);
    expect(l).toBe(1440);
  });

  it('SLA increases monotonically from critical -> high -> standard -> low', () => {
    for (const s of ['drafted', 'submitted', 'under_review', 'approved'] as const) {
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
    expect(slaMinutesFor('archived', 'critical')).toBe(null);
    expect(slaMinutesFor('voided', 'high')).toBe(null);
    expect(slaMinutesFor('withdrawn', 'low')).toBe(null);
  });
});

describe('W97 DFR — authority + ball in court', () => {
  it('authorityFor escalates with tier', () => {
    expect(authorityFor('low')).toBe('site_supervisor');
    expect(authorityFor('standard')).toBe('project_engineer');
    expect(authorityFor('high')).toBe('project_manager');
    expect(authorityFor('critical')).toBe('project_director');
  });

  it('ballInCourtFor returns party for each active state', () => {
    expect(ballInCourtFor('drafted')).toBe('site_supervisor');
    expect(ballInCourtFor('entries_open')).toBe('foreman');
    expect(ballInCourtFor('entries_closed')).toBe('site_supervisor');
    expect(ballInCourtFor('submitted')).toBe('coordinator');
    expect(ballInCourtFor('under_review')).toBe('reviewer');
    expect(ballInCourtFor('returned_for_correction')).toBe('site_supervisor');
    expect(ballInCourtFor('corrected')).toBe('coordinator');
    expect(ballInCourtFor('approved')).toBe('coordinator');
    expect(ballInCourtFor('distributed')).toBe('project_manager');
  });

  it('ballInCourtFor returns null for terminal states', () => {
    expect(ballInCourtFor('archived')).toBe(null);
    expect(ballInCourtFor('voided')).toBe(null);
    expect(ballInCourtFor('withdrawn')).toBe(null);
  });
});

describe('W97 DFR — reportability + SIGNATURE crossings', () => {
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

  it('SIGNATURE submit crosses EVERY tier on HSE-trigger', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'submit', tier,
        triggersHseIncident: true, triggersChangeOrder: false,
        triggersWarrantyClaim: false, contributesToEvm: false,
      })).toBe(true);
    }
  });

  it('SIGNATURE approve crosses EVERY tier on HSE-trigger', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'approve', tier,
        triggersHseIncident: true, triggersChangeOrder: false,
        triggersWarrantyClaim: false, contributesToEvm: false,
      })).toBe(true);
    }
  });

  it('SIGNATURE approve on change-order high/critical only', () => {
    expect(actionCrossesRegulator({
      action: 'approve', tier: 'high',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'approve', tier: 'critical',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'approve', tier: 'standard',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe(false);
    expect(actionCrossesRegulator({
      action: 'approve', tier: 'low',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe(false);
  });

  it('SIGNATURE void crosses EVERY tier on HSE or change-order', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'void', tier,
        triggersHseIncident: true, triggersChangeOrder: false,
        triggersWarrantyClaim: false, contributesToEvm: false,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'void', tier,
        triggersHseIncident: false, triggersChangeOrder: true,
        triggersWarrantyClaim: false, contributesToEvm: false,
      })).toBe(true);
    }
  });

  it('SIGNATURE distribute crosses high/critical on change-order', () => {
    expect(actionCrossesRegulator({
      action: 'distribute', tier: 'high',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'distribute', tier: 'standard',
      triggersHseIncident: false, triggersChangeOrder: true,
      triggersWarrantyClaim: false, contributesToEvm: false,
    })).toBe(false);
  });

  it('no crossings without trigger flags', () => {
    for (const action of ['submit', 'approve', 'void', 'distribute'] as const) {
      expect(actionCrossesRegulator({
        action, tier: 'critical',
        triggersHseIncident: false, triggersChangeOrder: false,
        triggersWarrantyClaim: false, contributesToEvm: false,
      })).toBe(false);
    }
  });

  it('open / start_review / archive / withdraw never cross', () => {
    for (const action of ['open', 'start_review', 'archive', 'withdraw'] as const) {
      expect(actionCrossesRegulator({
        action, tier: 'critical',
        triggersHseIncident: true, triggersChangeOrder: true,
        triggersWarrantyClaim: true, contributesToEvm: true,
      })).toBe(false);
    }
  });
});

describe('W97 DFR — urgency band', () => {
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

describe('W97 DFR — ipp-pm quality index', () => {
  const base = {
    withinSla: true, correctionCount: 0, rejectionCount: 0,
    ballInCourtClear: true, photoCount: 0,
    weatherLogPresent: false, safetyLogPresent: false,
  };

  it('clean baseline = 100', () => {
    expect(ippPmQualityIndex(base)).toBe(100);
  });

  it('SLA breach docks 25', () => {
    expect(ippPmQualityIndex({ ...base, withinSla: false })).toBe(75);
  });

  it('corrections dock 5 each', () => {
    expect(ippPmQualityIndex({ ...base, correctionCount: 2 })).toBe(90);
  });

  it('rejections dock 10 each', () => {
    expect(ippPmQualityIndex({ ...base, rejectionCount: 2 })).toBe(80);
  });

  it('ball-in-court not clear docks 5', () => {
    expect(ippPmQualityIndex({ ...base, ballInCourtClear: false })).toBe(95);
  });

  it('5+ photos give +10', () => {
    expect(ippPmQualityIndex({ ...base, photoCount: 5 })).toBe(110);
  });

  it('1-4 photos give +5', () => {
    expect(ippPmQualityIndex({ ...base, photoCount: 3 })).toBe(105);
  });

  it('weather + safety logs give +5 each', () => {
    expect(ippPmQualityIndex({
      ...base, weatherLogPresent: true, safetyLogPresent: true,
    })).toBe(110);
  });

  it('clamps at 0', () => {
    expect(ippPmQualityIndex({
      ...base, withinSla: false, correctionCount: 100, rejectionCount: 100,
    })).toBe(0);
  });

  it('clamps at 130', () => {
    expect(ippPmQualityIndex({
      ...base, photoCount: 50, weatherLogPresent: true, safetyLogPresent: true,
    })).toBeLessThanOrEqual(130);
  });

  it('best score = 100 + 10 photos + 5 weather + 5 safety = 120', () => {
    expect(ippPmQualityIndex({
      ...base, photoCount: 8, weatherLogPresent: true, safetyLogPresent: true,
    })).toBe(120);
  });
});

describe('W97 DFR — predicted close date', () => {
  it('returns null for terminal', () => {
    expect(predictedCloseDate('archived', 'critical', new Date())).toBe(null);
  });

  it('sums remaining SLA forward for low tier', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = predictedCloseDate('drafted', 'low', t0)!;
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBeGreaterThan(t0.getTime());
  });

  it('critical tier predicted close is sooner than low tier', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const dc = predictedCloseDate('drafted', 'critical', t0)!;
    const dl = predictedCloseDate('drafted', 'low', t0)!;
    expect(dc.getTime()).toBeLessThan(dl.getTime());
  });

  it('further-along state has nearer predicted close', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const dDraft = predictedCloseDate('drafted', 'standard', t0)!;
    const dApprov = predictedCloseDate('approved', 'standard', t0)!;
    expect(dApprov.getTime()).toBeLessThan(dDraft.getTime());
  });
});

describe('W97 DFR — party for action', () => {
  it('open / close_entries / withdraw -> site_supervisor', () => {
    expect(partyForAction('open')).toBe('site_supervisor');
    expect(partyForAction('close_entries')).toBe('site_supervisor');
    expect(partyForAction('withdraw')).toBe('site_supervisor');
  });

  it('submit / distribute / archive -> coordinator', () => {
    expect(partyForAction('submit')).toBe('coordinator');
    expect(partyForAction('distribute')).toBe('coordinator');
    expect(partyForAction('archive')).toBe('coordinator');
  });

  it('start_review / return_for_correction / approve -> reviewer', () => {
    expect(partyForAction('start_review')).toBe('reviewer');
    expect(partyForAction('return_for_correction')).toBe('reviewer');
    expect(partyForAction('approve')).toBe('reviewer');
  });

  it('correct -> site_supervisor', () => {
    expect(partyForAction('correct')).toBe('site_supervisor');
  });

  it('void -> owner', () => {
    expect(partyForAction('void')).toBe('owner');
  });
});

describe('W97 DFR — event type + inbox severity', () => {
  it('eventTypeFor prefixes dfr.', () => {
    expect(eventTypeFor('submit')).toBe('dfr.submit');
    expect(eventTypeFor('approve')).toBe('dfr.approve');
    expect(eventTypeFor('void')).toBe('dfr.void');
  });

  it('inbox severity maps from tier', () => {
    expect(inboxSeverityForTier('critical')).toBe('high');
    expect(inboxSeverityForTier('high')).toBe('medium');
    expect(inboxSeverityForTier('standard')).toBe('low');
    expect(inboxSeverityForTier('low')).toBe('low');
  });
});
