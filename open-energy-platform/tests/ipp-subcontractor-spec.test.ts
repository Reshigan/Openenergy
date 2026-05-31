// Wave 140 — IPP Subcontractor Management spec tests
// OHSA SA Construction Regs 2014 Reg.6 + ISO 45001:2018 + REIPPPP ED + Equator EP4
// URGENT SLA: critical_trade 24h (tightest) → labor_only 168h (loosest)
// SIGNATURE: terminate_subcontractor EVERY tier on safety_violation;
//            suspend_subcontractor when floor_ohsa_notification;
//            close_subcontract when floor_lender_escrow_release.
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
  SUBCONTRACTOR_TIER_LABELS,
  TRADE_CATEGORY_LABELS,
  TERMINATION_CAUSE_LABELS,
  type SubcontractorStatus,
  type SubcontractorAction,
  type SubcontractorTier,
} from '../src/utils/ipp-subcontractor-spec';

// ─── Forward path ─────────────────────────────────────────────────────────────
describe('forward path', () => {
  const forwardPath: Array<[SubcontractorStatus, SubcontractorAction, SubcontractorStatus]> = [
    ['registered',       'start_prequalification', 'pre_qualification'],
    ['pre_qualification','complete_induction',      'inducted'],
    ['inducted',         'mobilize',                'mobilized'],
    ['mobilized',        'commence_work',           'performing'],
    ['performing',       'trigger_review',          'under_review'],
    ['under_review',     'confirm_good_standing',   'good_standing'],
    ['good_standing',    'complete_work',           'work_complete'],
    ['work_complete',    'demobilize',              'demobilized'],
    ['demobilized',      'close_subcontract',       'closed'],
  ];

  it.each(forwardPath)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('full 9-step forward path from registered to closed', () => {
    let s: SubcontractorStatus = 'registered';
    s = nextStatus(s, 'start_prequalification')!; expect(s).toBe('pre_qualification');
    s = nextStatus(s, 'complete_induction')!;     expect(s).toBe('inducted');
    s = nextStatus(s, 'mobilize')!;               expect(s).toBe('mobilized');
    s = nextStatus(s, 'commence_work')!;          expect(s).toBe('performing');
    s = nextStatus(s, 'trigger_review')!;         expect(s).toBe('under_review');
    s = nextStatus(s, 'confirm_good_standing')!;  expect(s).toBe('good_standing');
    s = nextStatus(s, 'complete_work')!;          expect(s).toBe('work_complete');
    s = nextStatus(s, 'demobilize')!;             expect(s).toBe('demobilized');
    s = nextStatus(s, 'close_subcontract')!;      expect(s).toBe('closed');
  });

  it('covers 9 forward steps', () => {
    expect(forwardPath).toHaveLength(9);
  });
});

// ─── Review cycle loop ────────────────────────────────────────────────────────
describe('review cycle loop', () => {
  it('good_standing + return_to_performing => performing', () => {
    expect(nextStatus('good_standing', 'return_to_performing')).toBe('performing');
  });

  it('performing + complete_work => work_complete (skip review)', () => {
    expect(nextStatus('performing', 'complete_work')).toBe('work_complete');
  });

  it('performing → under_review → good_standing → performing (review loop)', () => {
    let s: SubcontractorStatus = 'performing';
    s = nextStatus(s, 'trigger_review')!;         expect(s).toBe('under_review');
    s = nextStatus(s, 'confirm_good_standing')!;  expect(s).toBe('good_standing');
    s = nextStatus(s, 'return_to_performing')!;   expect(s).toBe('performing');
  });
});

// ─── Suspension branch ────────────────────────────────────────────────────────
describe('suspension branch', () => {
  const suspendableStates: SubcontractorStatus[] = [
    'registered', 'pre_qualification', 'inducted', 'mobilized',
    'performing', 'under_review', 'good_standing',
  ];

  it.each(suspendableStates)('%s + suspend_subcontractor => suspended', (from) => {
    expect(nextStatus(from, 'suspend_subcontractor')).toBe('suspended');
  });

  it('7 states can be suspended', () => {
    expect(suspendableStates).toHaveLength(7);
  });

  it('suspended + reinstate_subcontractor => mobilized', () => {
    expect(nextStatus('suspended', 'reinstate_subcontractor')).toBe('mobilized');
  });

  it('suspended + terminate_subcontractor => terminated', () => {
    expect(nextStatus('suspended', 'terminate_subcontractor')).toBe('terminated');
  });

  it('work_complete cannot be suspended (not in suspend from-list)', () => {
    expect(nextStatus('work_complete', 'suspend_subcontractor')).toBeNull();
  });

  it('demobilized cannot be suspended', () => {
    expect(nextStatus('demobilized', 'suspend_subcontractor')).toBeNull();
  });
});

// ─── Terminate branch ─────────────────────────────────────────────────────────
describe('terminate branch', () => {
  const terminatableFromSuspension: SubcontractorStatus[] = ['suspended', 'performing', 'under_review', 'good_standing'];

  it.each(terminatableFromSuspension)('%s + terminate_subcontractor => terminated', (from) => {
    expect(nextStatus(from, 'terminate_subcontractor')).toBe('terminated');
  });

  it('registered cannot be directly terminated', () => {
    expect(nextStatus('registered', 'terminate_subcontractor')).toBeNull();
  });

  it('inducted cannot be directly terminated', () => {
    expect(nextStatus('inducted', 'terminate_subcontractor')).toBeNull();
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('closed is a hard terminal', () => {
    expect(isHardTerminal('closed')).toBe(true);
  });

  it('terminated is a hard terminal', () => {
    expect(isHardTerminal('terminated')).toBe(true);
  });

  it('HARD_TERMINALS array has 2 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(2);
  });

  it('registered is NOT a hard terminal', () => {
    expect(isHardTerminal('registered')).toBe(false);
  });

  it('performing is NOT a hard terminal', () => {
    expect(isHardTerminal('performing')).toBe(false);
  });

  it('suspended is NOT a hard terminal', () => {
    expect(isHardTerminal('suspended')).toBe(false);
  });

  it('closed blocks all transitions', () => {
    expect(nextStatus('closed', 'start_prequalification')).toBeNull();
    expect(nextStatus('closed', 'terminate_subcontractor')).toBeNull();
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('terminated blocks all transitions', () => {
    expect(nextStatus('terminated', 'reinstate_subcontractor')).toBeNull();
    expect(nextStatus('terminated', 'terminate_subcontractor')).toBeNull();
    expect(nextStatus('terminated', 'close_subcontract')).toBeNull();
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('critical_trade = 24h (URGENT — tightest)', () => {
    expect(SLA_HOURS['critical_trade']).toBe(24);
  });

  it('specialist = 48h', () => {
    expect(SLA_HOURS['specialist']).toBe(48);
  });

  it('general_trade = 96h', () => {
    expect(SLA_HOURS['general_trade']).toBe(96);
  });

  it('labor_only = 168h (loosest)', () => {
    expect(SLA_HOURS['labor_only']).toBe(168);
  });

  it('URGENT polarity: critical_trade < specialist < general_trade < labor_only', () => {
    const tiers: SubcontractorTier[] = ['critical_trade', 'specialist', 'general_trade', 'labor_only'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(SLA_HOURS[tiers[i]]).toBeLessThan(SLA_HOURS[tiers[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 subcontractor tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });

  it('slaDeadlineFor critical_trade = 24h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('critical_trade', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });

  it('slaDeadlineFor specialist = 48h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('specialist', from);
    expect(deadline.getTime()).toBe(from.getTime() + 48 * 3600 * 1000);
  });

  it('slaDeadlineFor general_trade = 96h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('general_trade', from);
    expect(deadline.getTime()).toBe(from.getTime() + 96 * 3600 * 1000);
  });

  it('slaDeadlineFor labor_only = 168h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('labor_only', from);
    expect(deadline.getTime()).toBe(from.getTime() + 168 * 3600 * 1000);
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

// ─── W140 SIGNATURE: crossesIntoRegulator ────────────────────────────────────
describe('W140 SIGNATURE: crossesIntoRegulator', () => {
  // terminate_subcontractor with safety_violation — EVERY tier
  it('terminate_subcontractor + safety_violation crosses EVERY tier', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', { termination_cause: 'safety_violation' })).toBe(true);
  });

  it('terminate_subcontractor + safety_violation crosses regardless of other flags', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', {
      termination_cause: 'safety_violation',
      floor_ohsa_notification: 0,
      floor_lender_escrow_release: 0,
    })).toBe(true);
  });

  it('terminate_subcontractor + performance cause does NOT cross', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', { termination_cause: 'performance' })).toBe(false);
  });

  it('terminate_subcontractor + insolvency cause does NOT cross', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', { termination_cause: 'insolvency' })).toBe(false);
  });

  it('terminate_subcontractor + mutual_agreement does NOT cross', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', { termination_cause: 'mutual_agreement' })).toBe(false);
  });

  it('terminate_subcontractor + force_majeure does NOT cross', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', { termination_cause: 'force_majeure' })).toBe(false);
  });

  it('terminate_subcontractor with no termination_cause does NOT cross', () => {
    expect(crossesIntoRegulator('terminate_subcontractor', {})).toBe(false);
  });

  // suspend_subcontractor with floor_ohsa_notification
  it('suspend_subcontractor + floor_ohsa_notification=1 crosses', () => {
    expect(crossesIntoRegulator('suspend_subcontractor', { floor_ohsa_notification: 1 })).toBe(true);
  });

  it('suspend_subcontractor + floor_ohsa_notification=true crosses', () => {
    expect(crossesIntoRegulator('suspend_subcontractor', { floor_ohsa_notification: true })).toBe(true);
  });

  it('suspend_subcontractor WITHOUT floor_ohsa_notification does NOT cross', () => {
    expect(crossesIntoRegulator('suspend_subcontractor', { floor_ohsa_notification: 0 })).toBe(false);
  });

  it('suspend_subcontractor with undefined floor_ohsa_notification does NOT cross', () => {
    expect(crossesIntoRegulator('suspend_subcontractor', {})).toBe(false);
  });

  // close_subcontract with floor_lender_escrow_release
  it('close_subcontract + floor_lender_escrow_release=1 crosses', () => {
    expect(crossesIntoRegulator('close_subcontract', { floor_lender_escrow_release: 1 })).toBe(true);
  });

  it('close_subcontract + floor_lender_escrow_release=true crosses', () => {
    expect(crossesIntoRegulator('close_subcontract', { floor_lender_escrow_release: true })).toBe(true);
  });

  it('close_subcontract WITHOUT floor_lender_escrow_release does NOT cross', () => {
    expect(crossesIntoRegulator('close_subcontract', { floor_lender_escrow_release: 0 })).toBe(false);
  });

  it('close_subcontract with undefined flag does NOT cross', () => {
    expect(crossesIntoRegulator('close_subcontract', {})).toBe(false);
  });

  // Other actions never cross
  it('start_prequalification never crosses even with all flags', () => {
    expect(crossesIntoRegulator('start_prequalification', {
      floor_ohsa_notification: 1, floor_lender_escrow_release: 1,
      termination_cause: 'safety_violation',
    })).toBe(false);
  });

  it('complete_induction never crosses', () => {
    expect(crossesIntoRegulator('complete_induction', { floor_ohsa_notification: 1 })).toBe(false);
  });

  it('mobilize never crosses', () => {
    expect(crossesIntoRegulator('mobilize', { floor_ohsa_notification: 1 })).toBe(false);
  });

  it('commence_work never crosses', () => {
    expect(crossesIntoRegulator('commence_work', { floor_ohsa_notification: 1 })).toBe(false);
  });

  it('trigger_review never crosses', () => {
    expect(crossesIntoRegulator('trigger_review', { floor_ohsa_notification: 1 })).toBe(false);
  });

  it('confirm_good_standing never crosses', () => {
    expect(crossesIntoRegulator('confirm_good_standing', { floor_lender_escrow_release: 1 })).toBe(false);
  });

  it('return_to_performing never crosses', () => {
    expect(crossesIntoRegulator('return_to_performing', { floor_ohsa_notification: 1 })).toBe(false);
  });

  it('complete_work never crosses even with all flags', () => {
    expect(crossesIntoRegulator('complete_work', {
      floor_ohsa_notification: 1, floor_lender_escrow_release: 1,
      termination_cause: 'safety_violation',
    })).toBe(false);
  });

  it('demobilize never crosses', () => {
    expect(crossesIntoRegulator('demobilize', { floor_lender_escrow_release: 1 })).toBe(false);
  });

  it('reinstate_subcontractor never crosses', () => {
    expect(crossesIntoRegulator('reinstate_subcontractor', { floor_ohsa_notification: 1 })).toBe(false);
  });

  it('flag_overdue never crosses even with all flags', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ohsa_notification: 1, floor_lender_escrow_release: 1,
      termination_cause: 'safety_violation',
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('critical_trade + floor_ie_oversight=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_trade', { floor_ie_oversight: 1 })).toBe(true);
  });

  it('critical_trade + floor_ie_oversight=true crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_trade', { floor_ie_oversight: true })).toBe(true);
  });

  it('critical_trade + floor_ohsa_notification=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_trade', { floor_ohsa_notification: 1 })).toBe(true);
  });

  it('specialist + floor_ohsa_notification=1 crosses (OHSA crosses any tier)', () => {
    expect(slaBreachCrossesIntoRegulator('specialist', { floor_ohsa_notification: 1 })).toBe(true);
  });

  it('general_trade + floor_ohsa_notification=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('general_trade', { floor_ohsa_notification: 1 })).toBe(true);
  });

  it('labor_only + floor_ohsa_notification=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('labor_only', { floor_ohsa_notification: 1 })).toBe(true);
  });

  it('specialist + floor_ie_oversight=1 does NOT cross (only critical_trade triggers ie_oversight)', () => {
    expect(slaBreachCrossesIntoRegulator('specialist', { floor_ie_oversight: 1 })).toBe(false);
  });

  it('general_trade + floor_ie_oversight=1 does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('general_trade', { floor_ie_oversight: 1 })).toBe(false);
  });

  it('labor_only + floor_ie_oversight=1 does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('labor_only', { floor_ie_oversight: 1 })).toBe(false);
  });

  it('critical_trade with NO flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_trade', {
      floor_ie_oversight: 0, floor_ohsa_notification: 0,
    })).toBe(false);
  });

  it('critical_trade with undefined flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_trade', {})).toBe(false);
  });

  it('general_trade with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('general_trade', {})).toBe(false);
  });

  it('critical_trade + both flags crosses (multiple flags)', () => {
    expect(slaBreachCrossesIntoRegulator('critical_trade', {
      floor_ie_oversight: 1, floor_ohsa_notification: 1,
    })).toBe(true);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[SubcontractorStatus, string]> = [
    ['registered',       'registered_at'],
    ['pre_qualification','pre_qualification_at'],
    ['inducted',         'inducted_at'],
    ['mobilized',        'mobilized_at'],
    ['performing',       'performing_at'],
    ['under_review',     'under_review_at'],
    ['good_standing',    'good_standing_at'],
    ['work_complete',    'work_complete_at'],
    ['demobilized',      'demobilized_at'],
    ['closed',           'closed_at'],
    ['suspended',        'suspended_at'],
    ['terminated',       'terminated_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor: all 14 actions ────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[SubcontractorAction, string]> = [
    ['start_prequalification',  'ipp_subcontractor.start_prequalification'],
    ['complete_induction',      'ipp_subcontractor.complete_induction'],
    ['mobilize',                'ipp_subcontractor.mobilize'],
    ['commence_work',           'ipp_subcontractor.commence_work'],
    ['trigger_review',          'ipp_subcontractor.trigger_review'],
    ['confirm_good_standing',   'ipp_subcontractor.confirm_good_standing'],
    ['return_to_performing',    'ipp_subcontractor.return_to_performing'],
    ['complete_work',           'ipp_subcontractor.complete_work'],
    ['demobilize',              'ipp_subcontractor.demobilize'],
    ['close_subcontract',       'ipp_subcontractor.close_subcontract'],
    ['suspend_subcontractor',   'ipp_subcontractor.suspend_subcontractor'],
    ['terminate_subcontractor', 'ipp_subcontractor.terminate_subcontractor'],
    ['reinstate_subcontractor', 'ipp_subcontractor.reinstate_subcontractor'],
    ['flag_overdue',            'ipp_subcontractor.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 14 actions are mapped', () => {
    expect(cases).toHaveLength(14);
  });
});

// ─── SUBCONTRACTOR_TIER_LABELS ────────────────────────────────────────────────
describe('SUBCONTRACTOR_TIER_LABELS', () => {
  it('has 4 tier labels', () => {
    expect(Object.keys(SUBCONTRACTOR_TIER_LABELS)).toHaveLength(4);
  });

  it('critical_trade = Critical trade', () => {
    expect(SUBCONTRACTOR_TIER_LABELS['critical_trade']).toBe('Critical trade');
  });

  it('specialist = Specialist', () => {
    expect(SUBCONTRACTOR_TIER_LABELS['specialist']).toBe('Specialist');
  });

  it('general_trade = General trade', () => {
    expect(SUBCONTRACTOR_TIER_LABELS['general_trade']).toBe('General trade');
  });

  it('labor_only = Labour supply', () => {
    expect(SUBCONTRACTOR_TIER_LABELS['labor_only']).toBe('Labour supply');
  });
});

// ─── TRADE_CATEGORY_LABELS ────────────────────────────────────────────────────
describe('TRADE_CATEGORY_LABELS', () => {
  it('has 12 trade category labels', () => {
    expect(Object.keys(TRADE_CATEGORY_LABELS)).toHaveLength(12);
  });

  it('structural = Structural', () => {
    expect(TRADE_CATEGORY_LABELS['structural']).toBe('Structural');
  });

  it('electrical_hv = Electrical (HV)', () => {
    expect(TRADE_CATEGORY_LABELS['electrical_hv']).toBe('Electrical (HV)');
  });

  it('electrical_lv = Electrical (LV)', () => {
    expect(TRADE_CATEGORY_LABELS['electrical_lv']).toBe('Electrical (LV)');
  });

  it('mechanical = Mechanical', () => {
    expect(TRADE_CATEGORY_LABELS['mechanical']).toBe('Mechanical');
  });

  it('civil = Civil', () => {
    expect(TRADE_CATEGORY_LABELS['civil']).toBe('Civil');
  });

  it('instrumentation = Instrumentation', () => {
    expect(TRADE_CATEGORY_LABELS['instrumentation']).toBe('Instrumentation');
  });

  it('scaffolding = Scaffolding', () => {
    expect(TRADE_CATEGORY_LABELS['scaffolding']).toBe('Scaffolding');
  });

  it('demolition = Demolition', () => {
    expect(TRADE_CATEGORY_LABELS['demolition']).toBe('Demolition');
  });

  it('commissioning_specialist = Commissioning specialist', () => {
    expect(TRADE_CATEGORY_LABELS['commissioning_specialist']).toBe('Commissioning specialist');
  });

  it('labor_supply = Labour supply', () => {
    expect(TRADE_CATEGORY_LABELS['labor_supply']).toBe('Labour supply');
  });

  it('cleaning = Cleaning', () => {
    expect(TRADE_CATEGORY_LABELS['cleaning']).toBe('Cleaning');
  });

  it('general = General', () => {
    expect(TRADE_CATEGORY_LABELS['general']).toBe('General');
  });
});

// ─── TERMINATION_CAUSE_LABELS ─────────────────────────────────────────────────
describe('TERMINATION_CAUSE_LABELS', () => {
  it('has 5 termination cause labels', () => {
    expect(Object.keys(TERMINATION_CAUSE_LABELS)).toHaveLength(5);
  });

  it('safety_violation = Safety violation (OHSA)', () => {
    expect(TERMINATION_CAUSE_LABELS['safety_violation']).toBe('Safety violation (OHSA)');
  });

  it('performance = Performance failure', () => {
    expect(TERMINATION_CAUSE_LABELS['performance']).toBe('Performance failure');
  });

  it('insolvency = Insolvency', () => {
    expect(TERMINATION_CAUSE_LABELS['insolvency']).toBe('Insolvency');
  });

  it('mutual_agreement = Mutual agreement', () => {
    expect(TERMINATION_CAUSE_LABELS['mutual_agreement']).toBe('Mutual agreement');
  });

  it('force_majeure = Force majeure', () => {
    expect(TERMINATION_CAUSE_LABELS['force_majeure']).toBe('Force majeure');
  });
});

// ─── TRANSITIONS record completeness ─────────────────────────────────────────
describe('TRANSITIONS record', () => {
  it('has 14 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(14);
  });

  it('all actions have from (array) and to (string)', () => {
    for (const [, t] of Object.entries(TRANSITIONS)) {
      expect(Array.isArray(t.from)).toBe(true);
      expect(typeof t.to).toBe('string');
    }
  });

  it('complete_work has two valid from-states (performing + good_standing)', () => {
    const t = TRANSITIONS['complete_work'];
    expect(t.from).toContain('performing');
    expect(t.from).toContain('good_standing');
  });

  it('terminate_subcontractor has 4 valid from-states', () => {
    const t = TRANSITIONS['terminate_subcontractor'];
    expect(t.from).toHaveLength(4);
    expect(t.from).toContain('suspended');
    expect(t.from).toContain('performing');
    expect(t.from).toContain('under_review');
    expect(t.from).toContain('good_standing');
  });

  it('suspend_subcontractor has 7 valid from-states', () => {
    const t = TRANSITIONS['suspend_subcontractor'];
    expect(t.from).toHaveLength(7);
    expect(t.from).toContain('registered');
    expect(t.from).toContain('good_standing');
  });

  it('reinstate_subcontractor has 1 from-state (suspended only)', () => {
    const t = TRANSITIONS['reinstate_subcontractor'];
    expect(t.from).toHaveLength(1);
    expect(t.from).toContain('suspended');
  });
});

// ─── flag_overdue cron action ─────────────────────────────────────────────────
describe('flag_overdue cron action', () => {
  const openStates: SubcontractorStatus[] = [
    'registered', 'pre_qualification', 'inducted', 'mobilized',
    'performing', 'under_review', 'work_complete', 'demobilized',
  ];

  it.each(openStates)('%s + flag_overdue returns current state unchanged', (status) => {
    expect(nextStatus(status, 'flag_overdue')).toBe(status);
  });

  it('flag_overdue from closed (terminal) returns null', () => {
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from terminated (terminal) returns null', () => {
    expect(nextStatus('terminated', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue does not cross into regulator', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ohsa_notification: 1, floor_lender_escrow_release: 1,
      termination_cause: 'safety_violation',
    })).toBe(false);
  });

  it('8 open states covered by flag_overdue', () => {
    expect(openStates).toHaveLength(8);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('registered', 'invalid_action' as SubcontractorAction)).toBeNull();
  });

  it('step-skip enforced: registered cannot jump to inducted', () => {
    expect(nextStatus('registered', 'complete_induction')).toBeNull();
  });

  it('step-skip enforced: pre_qualification cannot jump to mobilized', () => {
    expect(nextStatus('pre_qualification', 'mobilize')).toBeNull();
  });

  it('step-skip enforced: inducted cannot commence_work directly', () => {
    expect(nextStatus('inducted', 'commence_work')).toBeNull();
  });

  it('two paths from performing: trigger_review OR complete_work', () => {
    expect(nextStatus('performing', 'trigger_review')).toBe('under_review');
    expect(nextStatus('performing', 'complete_work')).toBe('work_complete');
  });

  it('two paths from good_standing: return_to_performing OR complete_work', () => {
    expect(nextStatus('good_standing', 'return_to_performing')).toBe('performing');
    expect(nextStatus('good_standing', 'complete_work')).toBe('work_complete');
  });

  it('URGENT polarity consistency: critical_trade 24h strictly less than specialist 48h', () => {
    expect(SLA_HOURS.critical_trade).toBeLessThan(SLA_HOURS.specialist);
    expect(SLA_HOURS.specialist).toBeLessThan(SLA_HOURS.general_trade);
    expect(SLA_HOURS.general_trade).toBeLessThan(SLA_HOURS.labor_only);
  });

  it('crossesIntoRegulator: terminate with safety_violation=0 flag does NOT override', () => {
    // Only the cause string 'safety_violation' matters, not flags
    expect(crossesIntoRegulator('terminate_subcontractor', {
      termination_cause: 'performance',
      floor_ohsa_notification: 1,
    })).toBe(false);
  });

  it('slaBreachCrossesIntoRegulator: labor_only is NOT an URGENT tier for ie_oversight', () => {
    expect(slaBreachCrossesIntoRegulator('labor_only', {
      floor_ie_oversight: 1, floor_ohsa_notification: 0,
    })).toBe(false);
  });

  it('work_complete cannot proceed directly to performing', () => {
    expect(nextStatus('work_complete', 'commence_work')).toBeNull();
  });

  it('good_standing cannot close directly (must go through work_complete + demobilize)', () => {
    expect(nextStatus('good_standing', 'close_subcontract')).toBeNull();
  });
});
