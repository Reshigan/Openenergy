// Wave 137 — IPP Method Statement (SWMS) Management spec tests
// OHSA Construction Regulations 2014 Reg.7 + Equator Principles EP4 + REIPPPP site safety
// URGENT SLA: high_risk 24h (tightest) → routine 336h (loosest)
// SIGNATURE: approve_ms EVERY tier on critical_lift/confined_space/live_electrical;
//            suspend_work crosses when floor_regulatory_notification.
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
  RISK_TIER_LABELS,
  WORK_TYPE_LABELS,
  type MsStatus,
  type MsAction,
  type RiskTier,
} from '../src/utils/ipp-method-statement-spec';

// ─── Forward path (8 steps) ───────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[MsStatus, MsAction, MsStatus]> = [
    ['drafted',          'submit_for_review',        'reviewed'],
    ['reviewed',         'complete_risk_assessment',  'risk_assessed'],
    ['risk_assessed',    'approve_ms',                'approved'],
    ['approved',         'conduct_toolbox_talk',      'toolbox_briefed'],
    ['toolbox_briefed',  'commence_work',             'active'],
    ['active',           'complete_work',             'work_completed'],
    ['work_completed',   'close_ms',                  'closed'],
    ['closed',           'archive_ms',                'archived'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('forward path has 8 steps (7 pre-archive + archive)', () => {
    expect(path).toHaveLength(8);
  });

  it('rejects wrong from-state: drafted + complete_risk_assessment => null', () => {
    expect(nextStatus('drafted', 'complete_risk_assessment')).toBeNull();
  });

  it('rejects wrong from-state: reviewed + approve_ms => null', () => {
    expect(nextStatus('reviewed', 'approve_ms')).toBeNull();
  });

  it('rejects wrong from-state: drafted + close_ms => null', () => {
    expect(nextStatus('drafted', 'close_ms')).toBeNull();
  });

  it('rejects wrong from-state: active + close_ms => null (must complete_work first)', () => {
    expect(nextStatus('active', 'close_ms')).toBeNull();
  });
});

// ─── reject_ms branch ─────────────────────────────────────────────────────────
describe('reject_ms branch', () => {
  it('reviewed + reject_ms => rejected', () => {
    expect(nextStatus('reviewed', 'reject_ms')).toBe('rejected');
  });

  it('risk_assessed + reject_ms => rejected', () => {
    expect(nextStatus('risk_assessed', 'reject_ms')).toBe('rejected');
  });

  it('drafted cannot reject_ms', () => {
    expect(nextStatus('drafted', 'reject_ms')).toBeNull();
  });

  it('approved cannot reject_ms', () => {
    expect(nextStatus('approved', 'reject_ms')).toBeNull();
  });

  it('active cannot reject_ms', () => {
    expect(nextStatus('active', 'reject_ms')).toBeNull();
  });

  it('rejected is a hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(true);
  });
});

// ─── supersede_ms branch ──────────────────────────────────────────────────────
describe('supersede_ms branch', () => {
  it('approved + supersede_ms => superseded', () => {
    expect(nextStatus('approved', 'supersede_ms')).toBe('superseded');
  });

  it('active + supersede_ms => superseded', () => {
    expect(nextStatus('active', 'supersede_ms')).toBe('superseded');
  });

  it('reviewed cannot supersede_ms', () => {
    expect(nextStatus('reviewed', 'supersede_ms')).toBeNull();
  });

  it('drafted cannot supersede_ms', () => {
    expect(nextStatus('drafted', 'supersede_ms')).toBeNull();
  });

  it('superseded is a hard terminal', () => {
    expect(isHardTerminal('superseded')).toBe(true);
  });
});

// ─── suspend_work / resume_work cycle ─────────────────────────────────────────
describe('suspend_work / resume_work cycle', () => {
  it('active + suspend_work => suspended', () => {
    expect(nextStatus('active', 'suspend_work')).toBe('suspended');
  });

  it('suspended + resume_work => active', () => {
    expect(nextStatus('suspended', 'resume_work')).toBe('active');
  });

  it('drafted cannot suspend_work', () => {
    expect(nextStatus('drafted', 'suspend_work')).toBeNull();
  });

  it('approved cannot suspend_work (must be active)', () => {
    expect(nextStatus('approved', 'suspend_work')).toBeNull();
  });

  it('active cannot resume_work (must be suspended)', () => {
    expect(nextStatus('active', 'resume_work')).toBeNull();
  });

  it('suspended is NOT a hard terminal', () => {
    expect(isHardTerminal('suspended')).toBe(false);
  });
});

// ─── Hard terminals block all ─────────────────────────────────────────────────
describe('hard terminals', () => {
  // closed is NOT a hard terminal — archive_ms is allowed from closed
  it('closed is NOT a hard terminal (archive_ms is allowed)', () => {
    expect(isHardTerminal('closed')).toBe(false);
  });

  it('rejected is a hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(true);
  });

  it('superseded is a hard terminal', () => {
    expect(isHardTerminal('superseded')).toBe(true);
  });

  it('archived is a hard terminal', () => {
    expect(isHardTerminal('archived')).toBe(true);
  });

  it('HARD_TERMINALS array has 3 entries (closed is NOT hard — archive_ms allowed)', () => {
    expect(HARD_TERMINALS).toHaveLength(3);
  });

  it('drafted is NOT a hard terminal', () => {
    expect(isHardTerminal('drafted')).toBe(false);
  });

  it('active is NOT a hard terminal', () => {
    expect(isHardTerminal('active')).toBe(false);
  });

  it('suspended is NOT a hard terminal', () => {
    expect(isHardTerminal('suspended')).toBe(false);
  });

  it('closed only allows archive_ms (blocks all other transitions)', () => {
    expect(nextStatus('closed', 'submit_for_review')).toBeNull();
    expect(nextStatus('closed', 'approve_ms')).toBeNull();
    expect(nextStatus('closed', 'close_ms')).toBeNull();
    expect(nextStatus('closed', 'suspend_work')).toBeNull();
    expect(nextStatus('closed', 'archive_ms')).toBe('archived');
  });

  it('rejected blocks all transitions', () => {
    expect(nextStatus('rejected', 'submit_for_review')).toBeNull();
    expect(nextStatus('rejected', 'approve_ms')).toBeNull();
    expect(nextStatus('rejected', 'reject_ms')).toBeNull();
  });

  it('superseded blocks all transitions', () => {
    expect(nextStatus('superseded', 'submit_for_review')).toBeNull();
    expect(nextStatus('superseded', 'approve_ms')).toBeNull();
    expect(nextStatus('superseded', 'supersede_ms')).toBeNull();
  });

  it('archived blocks all transitions', () => {
    expect(nextStatus('archived', 'submit_for_review')).toBeNull();
    expect(nextStatus('archived', 'archive_ms')).toBeNull();
    expect(nextStatus('archived', 'close_ms')).toBeNull();
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('high_risk = 24h (URGENT — tightest)', () => {
    expect(SLA_HOURS['high_risk']).toBe(24);
  });

  it('medium_risk = 72h', () => {
    expect(SLA_HOURS['medium_risk']).toBe(72);
  });

  it('low_risk = 168h', () => {
    expect(SLA_HOURS['low_risk']).toBe(168);
  });

  it('routine = 336h (loosest)', () => {
    expect(SLA_HOURS['routine']).toBe(336);
  });

  it('URGENT polarity: high_risk < medium_risk < low_risk < routine', () => {
    const tiers: RiskTier[] = ['high_risk', 'medium_risk', 'low_risk', 'routine'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(SLA_HOURS[tiers[i]]).toBeLessThan(SLA_HOURS[tiers[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 risk tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });

  it('slaDeadlineFor high_risk = 24h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('high_risk', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });

  it('slaDeadlineFor routine = 336h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('routine', from);
    expect(deadline.getTime()).toBe(from.getTime() + 336 * 3600 * 1000);
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

// ─── W137 SIGNATURE: crossesIntoRegulator ────────────────────────────────────
describe('W137 SIGNATURE: crossesIntoRegulator', () => {
  // approve_ms with critical_lift
  it('approve_ms + is_critical_lift=1 ALWAYS crosses (EVERY tier)', () => {
    expect(crossesIntoRegulator('approve_ms', { is_critical_lift: 1 })).toBe(true);
  });

  it('approve_ms + is_critical_lift=true crosses', () => {
    expect(crossesIntoRegulator('approve_ms', { is_critical_lift: true })).toBe(true);
  });

  // approve_ms with confined_space
  it('approve_ms + is_confined_space=1 crosses', () => {
    expect(crossesIntoRegulator('approve_ms', { is_confined_space: 1 })).toBe(true);
  });

  it('approve_ms + is_confined_space=true crosses', () => {
    expect(crossesIntoRegulator('approve_ms', { is_confined_space: true })).toBe(true);
  });

  // approve_ms with live_electrical
  it('approve_ms + is_live_electrical=1 crosses', () => {
    expect(crossesIntoRegulator('approve_ms', { is_live_electrical: 1 })).toBe(true);
  });

  it('approve_ms + is_live_electrical=true crosses', () => {
    expect(crossesIntoRegulator('approve_ms', { is_live_electrical: true })).toBe(true);
  });

  // approve_ms with multiple flags
  it('approve_ms + critical_lift + confined_space crosses', () => {
    expect(crossesIntoRegulator('approve_ms', { is_critical_lift: 1, is_confined_space: 1 })).toBe(true);
  });

  it('approve_ms + all three flags crosses', () => {
    expect(crossesIntoRegulator('approve_ms', {
      is_critical_lift: 1, is_confined_space: 1, is_live_electrical: 1,
    })).toBe(true);
  });

  // approve_ms with NO critical flags
  it('approve_ms with NO critical flags does NOT cross', () => {
    expect(crossesIntoRegulator('approve_ms', {
      is_critical_lift: 0, is_confined_space: 0, is_live_electrical: 0,
    })).toBe(false);
  });

  it('approve_ms with undefined args does NOT cross', () => {
    expect(crossesIntoRegulator('approve_ms', {})).toBe(false);
  });

  // suspend_work
  it('suspend_work + floor_regulatory_notification=1 crosses', () => {
    expect(crossesIntoRegulator('suspend_work', { floor_regulatory_notification: 1 })).toBe(true);
  });

  it('suspend_work + floor_regulatory_notification=true crosses', () => {
    expect(crossesIntoRegulator('suspend_work', { floor_regulatory_notification: true })).toBe(true);
  });

  it('suspend_work WITHOUT floor_regulatory_notification does NOT cross', () => {
    expect(crossesIntoRegulator('suspend_work', { floor_regulatory_notification: 0 })).toBe(false);
  });

  it('suspend_work with undefined floor_regulatory_notification does NOT cross', () => {
    expect(crossesIntoRegulator('suspend_work', {})).toBe(false);
  });

  // other actions never cross
  it('submit_for_review never crosses', () => {
    expect(crossesIntoRegulator('submit_for_review', { is_critical_lift: 1 })).toBe(false);
  });

  it('complete_risk_assessment never crosses even with flags', () => {
    expect(crossesIntoRegulator('complete_risk_assessment', {
      is_critical_lift: 1, is_confined_space: 1, is_live_electrical: 1,
    })).toBe(false);
  });

  it('conduct_toolbox_talk never crosses', () => {
    expect(crossesIntoRegulator('conduct_toolbox_talk', { is_critical_lift: 1 })).toBe(false);
  });

  it('commence_work never crosses', () => {
    expect(crossesIntoRegulator('commence_work', { is_live_electrical: 1 })).toBe(false);
  });

  it('complete_work never crosses', () => {
    expect(crossesIntoRegulator('complete_work', { is_confined_space: 1 })).toBe(false);
  });

  it('close_ms never crosses even with all flags', () => {
    expect(crossesIntoRegulator('close_ms', {
      is_critical_lift: 1, is_confined_space: 1, is_live_electrical: 1,
      floor_regulatory_notification: 1,
    })).toBe(false);
  });

  it('reject_ms never crosses', () => {
    expect(crossesIntoRegulator('reject_ms', { is_live_electrical: 1 })).toBe(false);
  });

  it('resume_work never crosses', () => {
    expect(crossesIntoRegulator('resume_work', { floor_regulatory_notification: 1 })).toBe(false);
  });

  it('flag_overdue never crosses', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      is_critical_lift: 1, is_confined_space: 1, is_live_electrical: 1,
      floor_regulatory_notification: 1,
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('high_risk + is_critical_lift=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', { is_critical_lift: 1 })).toBe(true);
  });

  it('high_risk + is_confined_space=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', { is_confined_space: 1 })).toBe(true);
  });

  it('high_risk + is_live_electrical=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', { is_live_electrical: 1 })).toBe(true);
  });

  it('high_risk + is_critical_lift=true crosses', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', { is_critical_lift: true })).toBe(true);
  });

  it('medium_risk + is_critical_lift=1 does NOT cross (only high_risk)', () => {
    expect(slaBreachCrossesIntoRegulator('medium_risk', { is_critical_lift: 1 })).toBe(false);
  });

  it('low_risk + is_confined_space=1 does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('low_risk', { is_confined_space: 1 })).toBe(false);
  });

  it('routine + is_live_electrical=1 does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('routine', { is_live_electrical: 1 })).toBe(false);
  });

  it('high_risk with NO flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', {
      is_critical_lift: 0, is_confined_space: 0, is_live_electrical: 0,
    })).toBe(false);
  });

  it('high_risk with undefined flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', {})).toBe(false);
  });

  it('routine with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('routine', {})).toBe(false);
  });

  it('high_risk + all three flags crosses', () => {
    expect(slaBreachCrossesIntoRegulator('high_risk', {
      is_critical_lift: 1, is_confined_space: 1, is_live_electrical: 1,
    })).toBe(true);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[MsStatus, string]> = [
    ['drafted',        'drafted_at'],
    ['reviewed',       'reviewed_at'],
    ['risk_assessed',  'risk_assessed_at'],
    ['approved',       'approved_at'],
    ['toolbox_briefed','toolbox_briefed_at'],
    ['active',         'active_at'],
    ['work_completed', 'work_completed_at'],
    ['closed',         'closed_at'],
    ['rejected',       'rejected_at'],
    ['superseded',     'superseded_at'],
    ['suspended',      'suspended_at'],
    ['archived',       'archived_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor: all 13 actions ────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[MsAction, string]> = [
    ['submit_for_review',        'ipp_method_statement.submit_for_review'],
    ['complete_risk_assessment', 'ipp_method_statement.complete_risk_assessment'],
    ['approve_ms',               'ipp_method_statement.approve_ms'],
    ['conduct_toolbox_talk',     'ipp_method_statement.conduct_toolbox_talk'],
    ['commence_work',            'ipp_method_statement.commence_work'],
    ['complete_work',            'ipp_method_statement.complete_work'],
    ['close_ms',                 'ipp_method_statement.close_ms'],
    ['archive_ms',               'ipp_method_statement.archive_ms'],
    ['reject_ms',                'ipp_method_statement.reject_ms'],
    ['supersede_ms',             'ipp_method_statement.supersede_ms'],
    ['suspend_work',             'ipp_method_statement.suspend_work'],
    ['resume_work',              'ipp_method_statement.resume_work'],
    ['flag_overdue',             'ipp_method_statement.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 13 actions are mapped', () => {
    expect(cases).toHaveLength(13);
  });
});

// ─── RISK_TIER_LABELS ─────────────────────────────────────────────────────────
describe('RISK_TIER_LABELS', () => {
  it('has 4 risk tier labels', () => {
    expect(Object.keys(RISK_TIER_LABELS)).toHaveLength(4);
  });

  it('high_risk = High risk', () => {
    expect(RISK_TIER_LABELS['high_risk']).toBe('High risk');
  });

  it('medium_risk = Medium risk', () => {
    expect(RISK_TIER_LABELS['medium_risk']).toBe('Medium risk');
  });

  it('low_risk = Low risk', () => {
    expect(RISK_TIER_LABELS['low_risk']).toBe('Low risk');
  });

  it('routine = Routine', () => {
    expect(RISK_TIER_LABELS['routine']).toBe('Routine');
  });
});

// ─── WORK_TYPE_LABELS ─────────────────────────────────────────────────────────
describe('WORK_TYPE_LABELS', () => {
  it('has 10 work type labels', () => {
    expect(Object.keys(WORK_TYPE_LABELS)).toHaveLength(10);
  });

  it('civil = Civil', () => {
    expect(WORK_TYPE_LABELS['civil']).toBe('Civil');
  });

  it('structural = Structural', () => {
    expect(WORK_TYPE_LABELS['structural']).toBe('Structural');
  });

  it('electrical = Electrical', () => {
    expect(WORK_TYPE_LABELS['electrical']).toBe('Electrical');
  });

  it('mechanical = Mechanical', () => {
    expect(WORK_TYPE_LABELS['mechanical']).toBe('Mechanical');
  });

  it('instrumentation = Instrumentation', () => {
    expect(WORK_TYPE_LABELS['instrumentation']).toBe('Instrumentation');
  });

  it('scaffolding = Scaffolding', () => {
    expect(WORK_TYPE_LABELS['scaffolding']).toBe('Scaffolding');
  });

  it('demolition = Demolition', () => {
    expect(WORK_TYPE_LABELS['demolition']).toBe('Demolition');
  });

  it('excavation = Excavation', () => {
    expect(WORK_TYPE_LABELS['excavation']).toBe('Excavation');
  });

  it('commissioning = Commissioning', () => {
    expect(WORK_TYPE_LABELS['commissioning']).toBe('Commissioning');
  });

  it('general = General', () => {
    expect(WORK_TYPE_LABELS['general']).toBe('General');
  });
});

// ─── TRANSITIONS record completeness ──────────────────────────────────────────
describe('TRANSITIONS record', () => {
  it('has 13 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(13);
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
  const openStates: MsStatus[] = [
    'drafted', 'reviewed', 'risk_assessed', 'approved',
    'toolbox_briefed', 'active', 'work_completed',
  ];

  it.each(openStates)('%s + flag_overdue returns current state unchanged', (status) => {
    expect(nextStatus(status, 'flag_overdue')).toBe(status);
  });

  it('flag_overdue from closed returns closed (closed is NOT a hard terminal — archive_ms is still allowed)', () => {
    expect(nextStatus('closed', 'flag_overdue')).toBe('closed');
  });

  it('flag_overdue from rejected (terminal) returns null', () => {
    expect(nextStatus('rejected', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from superseded (terminal) returns null', () => {
    expect(nextStatus('superseded', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from archived (terminal) returns null', () => {
    expect(nextStatus('archived', 'flag_overdue')).toBeNull();
  });

  it('suspended + flag_overdue returns suspended (suspended is NOT a hard terminal)', () => {
    expect(nextStatus('suspended', 'flag_overdue')).toBe('suspended');
  });
});

// ─── resume_work from suspended ──────────────────────────────────────────────
describe('resume_work from suspended', () => {
  it('suspended + resume_work => active', () => {
    expect(nextStatus('suspended', 'resume_work')).toBe('active');
  });

  it('active cannot resume_work', () => {
    expect(nextStatus('active', 'resume_work')).toBeNull();
  });

  it('drafted cannot resume_work', () => {
    expect(nextStatus('drafted', 'resume_work')).toBeNull();
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('drafted', 'invalid_action' as MsAction)).toBeNull();
  });

  it('step-skip enforced: drafted cannot jump to approved', () => {
    expect(nextStatus('drafted', 'approve_ms')).toBeNull();
  });

  it('step-skip enforced: reviewed cannot jump to toolbox_briefed', () => {
    expect(nextStatus('reviewed', 'conduct_toolbox_talk')).toBeNull();
  });

  it('both branches from risk_assessed are valid: approve or reject', () => {
    expect(nextStatus('risk_assessed', 'approve_ms')).toBe('approved');
    expect(nextStatus('risk_assessed', 'reject_ms')).toBe('rejected');
  });

  it('two branches from approved: toolbox_talk or supersede', () => {
    expect(nextStatus('approved', 'conduct_toolbox_talk')).toBe('toolbox_briefed');
    expect(nextStatus('approved', 'supersede_ms')).toBe('superseded');
  });

  it('three branches from active: complete, suspend, supersede', () => {
    expect(nextStatus('active', 'complete_work')).toBe('work_completed');
    expect(nextStatus('active', 'suspend_work')).toBe('suspended');
    expect(nextStatus('active', 'supersede_ms')).toBe('superseded');
  });

  it('crossesIntoRegulator: critical_lift + confined_space both set => crosses once (boolean)', () => {
    expect(crossesIntoRegulator('approve_ms', {
      is_critical_lift: 1, is_confined_space: 1,
    })).toBe(true);
  });

  it('slaBreachCrossesIntoRegulator: medium_risk is NOT tightest tier', () => {
    expect(slaBreachCrossesIntoRegulator('medium_risk', {
      is_critical_lift: 1, is_confined_space: 1, is_live_electrical: 1,
    })).toBe(false);
  });
});
