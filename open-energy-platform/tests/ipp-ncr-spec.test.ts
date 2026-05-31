// Wave 136 — IPP Non-Conformance Report (NCR) Management spec tests
// ISO 9001:2015 §8.7 + Equator Principles IV QA + REIPPPP quality requirements
// URGENT SLA: safety_critical 24h (tightest) → cosmetic 720h (loosest)
// SIGNATURE: reject_escalate EVERY tier; accept_as_is crosses when IE/NERSA flag.
import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isHardTerminal,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  slaDeadlineFor,
  slaHoursRemaining,
  eventTypeFor,
  statusTsCol,
  SLA_HOURS,
  TRANSITIONS,
  HARD_TERMINALS,
  SEVERITY_LABELS,
  NCR_CATEGORY_LABELS,
  DISPOSITION_LABELS,
  DISCIPLINE_LABELS,
  DETECTION_METHOD_LABELS,
  RCA_METHOD_LABELS,
  type NcrStatus,
  type NcrAction,
  type NcrSeverity,
} from '../src/utils/ipp-ncr-spec';

// ─── Forward path ─────────────────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[NcrStatus, NcrAction, NcrStatus]> = [
    ['raised',                   'acknowledge_ncr',        'acknowledged'],
    ['acknowledged',             'start_investigation',    'under_investigation'],
    ['under_investigation',      'propose_disposition',    'disposition_proposed'],
    ['disposition_proposed',     'review_disposition',     'disposition_reviewed'],
    ['disposition_reviewed',     'start_rework',           'rework_in_progress'],
    ['rework_in_progress',       'submit_reinspection',    'reinspection'],
    ['reinspection',             'plan_corrective_action', 'corrective_action_planned'],
    ['corrective_action_planned','close_ncr',              'closed'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('forward path has 8 steps', () => {
    expect(path).toHaveLength(8);
  });

  it('rejects wrong from-state: raised + start_investigation => null', () => {
    expect(nextStatus('raised', 'start_investigation')).toBeNull();
  });

  it('rejects wrong from-state: raised + close_ncr => null', () => {
    expect(nextStatus('raised', 'close_ncr')).toBeNull();
  });

  it('rejects wrong from-state: under_investigation + close_ncr => null', () => {
    expect(nextStatus('under_investigation', 'close_ncr')).toBeNull();
  });
});

// ─── accept_as_is branch ──────────────────────────────────────────────────────
describe('accept_as_is branch', () => {
  it('disposition_reviewed + accept_as_is => accepted_as_is', () => {
    expect(nextStatus('disposition_reviewed', 'accept_as_is')).toBe('accepted_as_is');
  });

  it('raised cannot accept_as_is', () => {
    expect(nextStatus('raised', 'accept_as_is')).toBeNull();
  });

  it('corrective_action_planned cannot accept_as_is', () => {
    expect(nextStatus('corrective_action_planned', 'accept_as_is')).toBeNull();
  });

  it('accepted_as_is is a hard terminal', () => {
    expect(isHardTerminal('accepted_as_is')).toBe(true);
  });
});

// ─── reject_escalate branch (SIGNATURE) ───────────────────────────────────────
describe('reject_escalate branch (SIGNATURE)', () => {
  it('disposition_reviewed + reject_escalate => rejected_escalated', () => {
    expect(nextStatus('disposition_reviewed', 'reject_escalate')).toBe('rejected_escalated');
  });

  it('raised cannot reject_escalate', () => {
    expect(nextStatus('raised', 'reject_escalate')).toBeNull();
  });

  it('acknowledged cannot reject_escalate', () => {
    expect(nextStatus('acknowledged', 'reject_escalate')).toBeNull();
  });

  it('rejected_escalated is a hard terminal', () => {
    expect(isHardTerminal('rejected_escalated')).toBe(true);
  });
});

// ─── void_ncr ─────────────────────────────────────────────────────────────────
describe('void_ncr', () => {
  it('raised + void_ncr => voided', () => {
    expect(nextStatus('raised', 'void_ncr')).toBe('voided');
  });

  it('acknowledged + void_ncr => voided', () => {
    expect(nextStatus('acknowledged', 'void_ncr')).toBe('voided');
  });

  it('under_investigation cannot void_ncr', () => {
    expect(nextStatus('under_investigation', 'void_ncr')).toBeNull();
  });

  it('disposition_reviewed cannot void_ncr', () => {
    expect(nextStatus('disposition_reviewed', 'void_ncr')).toBeNull();
  });

  it('voided is a hard terminal', () => {
    expect(isHardTerminal('voided')).toBe(true);
  });
});

// ─── Hard terminals block all ─────────────────────────────────────────────────
describe('hard terminals', () => {
  it('closed is a hard terminal', () => {
    expect(isHardTerminal('closed')).toBe(true);
  });

  it('accepted_as_is is a hard terminal', () => {
    expect(isHardTerminal('accepted_as_is')).toBe(true);
  });

  it('rejected_escalated is a hard terminal', () => {
    expect(isHardTerminal('rejected_escalated')).toBe(true);
  });

  it('voided is a hard terminal', () => {
    expect(isHardTerminal('voided')).toBe(true);
  });

  it('HARD_TERMINALS array has 4 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(4);
  });

  it('raised is NOT a hard terminal', () => {
    expect(isHardTerminal('raised')).toBe(false);
  });

  it('disposition_reviewed is NOT a hard terminal', () => {
    expect(isHardTerminal('disposition_reviewed')).toBe(false);
  });

  it('closed blocks all transitions', () => {
    expect(nextStatus('closed', 'acknowledge_ncr')).toBeNull();
    expect(nextStatus('closed', 'close_ncr')).toBeNull();
    expect(nextStatus('closed', 'void_ncr')).toBeNull();
    expect(nextStatus('closed', 'reject_escalate')).toBeNull();
  });

  it('accepted_as_is blocks all transitions', () => {
    expect(nextStatus('accepted_as_is', 'acknowledge_ncr')).toBeNull();
    expect(nextStatus('accepted_as_is', 'accept_as_is')).toBeNull();
    expect(nextStatus('accepted_as_is', 'close_ncr')).toBeNull();
    expect(nextStatus('accepted_as_is', 'void_ncr')).toBeNull();
  });

  it('rejected_escalated blocks all transitions', () => {
    expect(nextStatus('rejected_escalated', 'acknowledge_ncr')).toBeNull();
    expect(nextStatus('rejected_escalated', 'reject_escalate')).toBeNull();
    expect(nextStatus('rejected_escalated', 'close_ncr')).toBeNull();
  });

  it('voided blocks all transitions', () => {
    expect(nextStatus('voided', 'acknowledge_ncr')).toBeNull();
    expect(nextStatus('voided', 'void_ncr')).toBeNull();
    expect(nextStatus('voided', 'close_ncr')).toBeNull();
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('safety_critical = 24h (tightest — URGENT)', () => {
    expect(SLA_HOURS['safety_critical']).toBe(24);
  });

  it('structural = 48h', () => {
    expect(SLA_HOURS['structural']).toBe(48);
  });

  it('functional = 120h', () => {
    expect(SLA_HOURS['functional']).toBe(120);
  });

  it('minor = 336h', () => {
    expect(SLA_HOURS['minor']).toBe(336);
  });

  it('cosmetic = 720h (loosest)', () => {
    expect(SLA_HOURS['cosmetic']).toBe(720);
  });

  it('URGENT polarity: safety_critical < structural < functional < minor < cosmetic', () => {
    const severities: NcrSeverity[] = ['safety_critical', 'structural', 'functional', 'minor', 'cosmetic'];
    for (let i = 0; i < severities.length - 1; i++) {
      expect(SLA_HOURS[severities[i]]).toBeLessThan(SLA_HOURS[severities[i + 1]]);
    }
  });

  it('SLA_HOURS has all 5 severity tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(5);
  });

  it('slaDeadlineFor safety_critical = 24h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('safety_critical', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });

  it('slaDeadlineFor cosmetic = 720h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('cosmetic', from);
    expect(deadline.getTime()).toBe(from.getTime() + 720 * 3600 * 1000);
  });

  it('slaHoursRemaining positive when not breached', () => {
    const future = new Date(Date.now() + 100 * 3600 * 1000);
    expect(slaHoursRemaining(future.toISOString(), new Date())).toBeGreaterThan(0);
  });

  it('slaHoursRemaining negative when breached', () => {
    const past = new Date(Date.now() - 10 * 3600 * 1000);
    expect(slaHoursRemaining(past.toISOString(), new Date())).toBeLessThan(0);
  });

  it('slaHoursRemaining null when no deadline', () => {
    expect(slaHoursRemaining(null, new Date())).toBeNull();
  });

  it('slaHoursRemaining exact boundary (0h) returns 0', () => {
    const now = new Date();
    expect(slaHoursRemaining(now.toISOString(), now)).toBe(0);
  });
});

// ─── W136 SIGNATURE: crossesIntoRegulator ────────────────────────────────────
describe('W136 SIGNATURE: crossesIntoRegulator', () => {
  it('reject_escalate ALWAYS crosses (EVERY tier — W136 SIGNATURE)', () => {
    expect(crossesIntoRegulator('reject_escalate', {})).toBe(true);
  });

  it('reject_escalate crosses even without flags', () => {
    expect(crossesIntoRegulator('reject_escalate', {
      floor_ie_notification_required: 0,
      floor_nersa_reportable: 0,
    })).toBe(true);
  });

  it('accept_as_is with floor_ie_notification_required=1 crosses', () => {
    expect(crossesIntoRegulator('accept_as_is', { floor_ie_notification_required: 1 })).toBe(true);
  });

  it('accept_as_is with floor_ie_notification_required=true crosses', () => {
    expect(crossesIntoRegulator('accept_as_is', { floor_ie_notification_required: true })).toBe(true);
  });

  it('accept_as_is with floor_nersa_reportable=1 crosses', () => {
    expect(crossesIntoRegulator('accept_as_is', { floor_nersa_reportable: 1 })).toBe(true);
  });

  it('accept_as_is with floor_nersa_reportable=true crosses', () => {
    expect(crossesIntoRegulator('accept_as_is', { floor_nersa_reportable: true })).toBe(true);
  });

  it('accept_as_is with BOTH flags crosses', () => {
    expect(crossesIntoRegulator('accept_as_is', {
      floor_ie_notification_required: 1,
      floor_nersa_reportable: 1,
    })).toBe(true);
  });

  it('accept_as_is with NO flags does NOT cross', () => {
    expect(crossesIntoRegulator('accept_as_is', {
      floor_ie_notification_required: 0,
      floor_nersa_reportable: 0,
    })).toBe(false);
  });

  it('accept_as_is with undefined args does NOT cross', () => {
    expect(crossesIntoRegulator('accept_as_is', {})).toBe(false);
  });

  it('acknowledge_ncr never crosses', () => {
    expect(crossesIntoRegulator('acknowledge_ncr', { floor_ie_notification_required: 1 })).toBe(false);
  });

  it('close_ncr never crosses even with flags', () => {
    expect(crossesIntoRegulator('close_ncr', {
      floor_ie_notification_required: 1,
      floor_nersa_reportable: 1,
    })).toBe(false);
  });

  it('start_rework never crosses', () => {
    expect(crossesIntoRegulator('start_rework', { floor_nersa_reportable: 1 })).toBe(false);
  });

  it('void_ncr never crosses', () => {
    expect(crossesIntoRegulator('void_ncr', { floor_ie_notification_required: 1 })).toBe(false);
  });

  it('flag_overdue never crosses', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ie_notification_required: 1,
      floor_nersa_reportable: 1,
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('floor_safety_stop_work ALWAYS crosses regardless of severity', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', { floor_safety_stop_work: 1 })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('structural',      { floor_safety_stop_work: 1 })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('functional',      { floor_safety_stop_work: 1 })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('minor',           { floor_safety_stop_work: 1 })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('cosmetic',        { floor_safety_stop_work: 1 })).toBe(true);
  });

  it('floor_safety_stop_work=true crosses', () => {
    expect(slaBreachCrossesIntoRegulator('minor', { floor_safety_stop_work: true })).toBe(true);
  });

  it('hold_point + safety_critical crosses', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', { floor_hold_point_triggered: 1 })).toBe(true);
  });

  it('hold_point + structural crosses', () => {
    expect(slaBreachCrossesIntoRegulator('structural', { floor_hold_point_triggered: 1 })).toBe(true);
  });

  it('hold_point + functional does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('functional', { floor_hold_point_triggered: 1 })).toBe(false);
  });

  it('hold_point + minor does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('minor', { floor_hold_point_triggered: 1 })).toBe(false);
  });

  it('hold_point + cosmetic does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('cosmetic', { floor_hold_point_triggered: 1 })).toBe(false);
  });

  it('cosmetic + no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('cosmetic', {
      floor_hold_point_triggered: 0,
      floor_safety_stop_work: 0,
    })).toBe(false);
  });

  it('safety_critical with undefined floor flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', {})).toBe(false);
  });

  it('safety_critical + hold_point + safety_stop_work: safety_stop_work takes precedence', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', {
      floor_hold_point_triggered: 1,
      floor_safety_stop_work: 1,
    })).toBe(true);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[NcrStatus, string]> = [
    ['raised',                   'raised_at'],
    ['acknowledged',             'acknowledged_at'],
    ['under_investigation',      'under_investigation_at'],
    ['disposition_proposed',     'disposition_proposed_at'],
    ['disposition_reviewed',     'disposition_reviewed_at'],
    ['rework_in_progress',       'rework_in_progress_at'],
    ['reinspection',             'reinspection_at'],
    ['corrective_action_planned','corrective_action_planned_at'],
    ['closed',                   'closed_at'],
    ['accepted_as_is',           'accepted_as_is_at'],
    ['rejected_escalated',       'rejected_escalated_at'],
    ['voided',                   'voided_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor: all 12 actions ────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[NcrAction, string]> = [
    ['acknowledge_ncr',        'ipp_ncr.acknowledge_ncr'],
    ['start_investigation',    'ipp_ncr.start_investigation'],
    ['propose_disposition',    'ipp_ncr.propose_disposition'],
    ['review_disposition',     'ipp_ncr.review_disposition'],
    ['start_rework',           'ipp_ncr.start_rework'],
    ['submit_reinspection',    'ipp_ncr.submit_reinspection'],
    ['plan_corrective_action', 'ipp_ncr.plan_corrective_action'],
    ['close_ncr',              'ipp_ncr.close_ncr'],
    ['accept_as_is',           'ipp_ncr.accept_as_is'],
    ['reject_escalate',        'ipp_ncr.reject_escalate'],
    ['void_ncr',               'ipp_ncr.void_ncr'],
    ['flag_overdue',           'ipp_ncr.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 12 actions are mapped', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── SEVERITY_LABELS ──────────────────────────────────────────────────────────
describe('SEVERITY_LABELS', () => {
  it('has 5 severity labels', () => {
    expect(Object.keys(SEVERITY_LABELS)).toHaveLength(5);
  });

  it('safety_critical = Safety critical', () => {
    expect(SEVERITY_LABELS['safety_critical']).toBe('Safety critical');
  });

  it('structural = Structural', () => {
    expect(SEVERITY_LABELS['structural']).toBe('Structural');
  });

  it('functional = Functional', () => {
    expect(SEVERITY_LABELS['functional']).toBe('Functional');
  });

  it('minor = Minor', () => {
    expect(SEVERITY_LABELS['minor']).toBe('Minor');
  });

  it('cosmetic = Cosmetic', () => {
    expect(SEVERITY_LABELS['cosmetic']).toBe('Cosmetic');
  });
});

// ─── NCR_CATEGORY_LABELS ──────────────────────────────────────────────────────
describe('NCR_CATEGORY_LABELS', () => {
  it('has 8 category labels', () => {
    expect(Object.keys(NCR_CATEGORY_LABELS)).toHaveLength(8);
  });

  it('workmanship = Workmanship', () => {
    expect(NCR_CATEGORY_LABELS['workmanship']).toBe('Workmanship');
  });

  it('materials = Materials', () => {
    expect(NCR_CATEGORY_LABELS['materials']).toBe('Materials');
  });

  it('design = Design', () => {
    expect(NCR_CATEGORY_LABELS['design']).toBe('Design');
  });

  it('documentation = Documentation', () => {
    expect(NCR_CATEGORY_LABELS['documentation']).toBe('Documentation');
  });

  it('safety = Safety', () => {
    expect(NCR_CATEGORY_LABELS['safety']).toBe('Safety');
  });

  it('environmental = Environmental', () => {
    expect(NCR_CATEGORY_LABELS['environmental']).toBe('Environmental');
  });

  it('commissioning = Commissioning', () => {
    expect(NCR_CATEGORY_LABELS['commissioning']).toBe('Commissioning');
  });

  it('testing = Testing', () => {
    expect(NCR_CATEGORY_LABELS['testing']).toBe('Testing');
  });
});

// ─── DISPOSITION_LABELS ───────────────────────────────────────────────────────
describe('DISPOSITION_LABELS', () => {
  it('has 5 disposition labels', () => {
    expect(Object.keys(DISPOSITION_LABELS)).toHaveLength(5);
  });

  it('accept_as_is = Accept as-is (concession)', () => {
    expect(DISPOSITION_LABELS['accept_as_is']).toBe('Accept as-is (concession)');
  });

  it('rework = Rework', () => {
    expect(DISPOSITION_LABELS['rework']).toBe('Rework');
  });

  it('repair = Repair', () => {
    expect(DISPOSITION_LABELS['repair']).toBe('Repair');
  });

  it('replace = Replace', () => {
    expect(DISPOSITION_LABELS['replace']).toBe('Replace');
  });

  it('scrap = Scrap', () => {
    expect(DISPOSITION_LABELS['scrap']).toBe('Scrap');
  });
});

// ─── DISCIPLINE_LABELS ────────────────────────────────────────────────────────
describe('DISCIPLINE_LABELS', () => {
  it('has 7 discipline labels', () => {
    expect(Object.keys(DISCIPLINE_LABELS)).toHaveLength(7);
  });

  it('civil = Civil', () => {
    expect(DISCIPLINE_LABELS['civil']).toBe('Civil');
  });

  it('electrical = Electrical', () => {
    expect(DISCIPLINE_LABELS['electrical']).toBe('Electrical');
  });
});

// ─── DETECTION_METHOD_LABELS ──────────────────────────────────────────────────
describe('DETECTION_METHOD_LABELS', () => {
  it('has 4 detection method labels', () => {
    expect(Object.keys(DETECTION_METHOD_LABELS)).toHaveLength(4);
  });

  it('inspection = Inspection', () => {
    expect(DETECTION_METHOD_LABELS['inspection']).toBe('Inspection');
  });

  it('audit = Audit', () => {
    expect(DETECTION_METHOD_LABELS['audit']).toBe('Audit');
  });

  it('testing = Testing', () => {
    expect(DETECTION_METHOD_LABELS['testing']).toBe('Testing');
  });

  it('observation = Observation', () => {
    expect(DETECTION_METHOD_LABELS['observation']).toBe('Observation');
  });
});

// ─── RCA_METHOD_LABELS ────────────────────────────────────────────────────────
describe('RCA_METHOD_LABELS', () => {
  it('has 4 RCA method labels', () => {
    expect(Object.keys(RCA_METHOD_LABELS)).toHaveLength(4);
  });

  it('five_whys = 5 Whys', () => {
    expect(RCA_METHOD_LABELS['five_whys']).toBe('5 Whys');
  });

  it('fishbone = Fishbone diagram', () => {
    expect(RCA_METHOD_LABELS['fishbone']).toBe('Fishbone diagram');
  });

  it('fmea = FMEA', () => {
    expect(RCA_METHOD_LABELS['fmea']).toBe('FMEA');
  });

  it('none = Not yet performed', () => {
    expect(RCA_METHOD_LABELS['none']).toBe('Not yet performed');
  });
});

// ─── TRANSITIONS record completeness ──────────────────────────────────────────
describe('TRANSITIONS record', () => {
  it('has 12 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(12);
  });

  it('all actions have from (array) and to (string)', () => {
    for (const [, t] of Object.entries(TRANSITIONS)) {
      expect(Array.isArray(t.from)).toBe(true);
      expect(typeof t.to).toBe('string');
    }
  });
});

// ─── flag_overdue cron action ─────────────────────────────────────────────────
describe('flag_overdue cron action', () => {
  const openStates: NcrStatus[] = [
    'raised', 'acknowledged', 'under_investigation', 'disposition_proposed',
    'disposition_reviewed', 'rework_in_progress', 'reinspection', 'corrective_action_planned',
  ];

  it.each(openStates)('%s + flag_overdue returns current state unchanged', (status) => {
    expect(nextStatus(status, 'flag_overdue')).toBe(status);
  });

  it('flag_overdue from closed (terminal) returns null', () => {
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from voided (terminal) returns null', () => {
    expect(nextStatus('voided', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from accepted_as_is (terminal) returns null', () => {
    expect(nextStatus('accepted_as_is', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from rejected_escalated (terminal) returns null', () => {
    expect(nextStatus('rejected_escalated', 'flag_overdue')).toBeNull();
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('raised', 'invalid_action' as NcrAction)).toBeNull();
  });

  it('step-skip enforced: raised cannot jump to disposition_proposed', () => {
    expect(nextStatus('raised', 'propose_disposition')).toBeNull();
  });

  it('step-skip enforced: raised cannot jump to close_ncr', () => {
    expect(nextStatus('raised', 'close_ncr')).toBeNull();
  });

  it('step-skip enforced: acknowledged cannot go to disposition_proposed', () => {
    expect(nextStatus('acknowledged', 'propose_disposition')).toBeNull();
  });

  it('both branches from disposition_reviewed are valid', () => {
    expect(nextStatus('disposition_reviewed', 'start_rework')).toBe('rework_in_progress');
    expect(nextStatus('disposition_reviewed', 'accept_as_is')).toBe('accepted_as_is');
    expect(nextStatus('disposition_reviewed', 'reject_escalate')).toBe('rejected_escalated');
  });

  it('crossesIntoRegulator: both IE and NERSA flags set => crosses once', () => {
    expect(crossesIntoRegulator('accept_as_is', {
      floor_ie_notification_required: 1,
      floor_nersa_reportable: 1,
    })).toBe(true);
  });

  it('slaBreachCrossesIntoRegulator: safety_stop_work=true crosses regardless of hold_point', () => {
    expect(slaBreachCrossesIntoRegulator('cosmetic', {
      floor_safety_stop_work: 1,
      floor_hold_point_triggered: 0,
    })).toBe(true);
  });
});
