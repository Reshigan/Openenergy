// Wave 139 — IPP Material Inspection Record spec tests
// ISO 9001:2015 §8.6 + REIPPPP quality specs + Equator Principles EP4
// URGENT SLA: critical_structural 24h (tightest) → general 168h (loosest)
// SIGNATURE: reject_material EVERY tier when IE witnessed;
//            quarantine_material EVERY tier when floor_critical_safety.
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
  MATERIAL_TIER_LABELS,
  MATERIAL_CATEGORY_LABELS,
  type MirStatus,
  type MirAction,
  type MaterialTier,
} from '../src/utils/ipp-mir-spec';

// ─── Forward path ─────────────────────────────────────────────────────────────
describe('forward path', () => {
  const forwardPath: Array<[MirStatus, MirAction, MirStatus]> = [
    ['delivery_notified',   'record_delivery',          'delivered'],
    ['delivered',           'start_initial_inspection', 'initial_inspection'],
    ['initial_inspection',  'proceed_to_detailed',      'detailed_inspection'],
    ['detailed_inspection', 'approve_material',         'approved'],
    ['approved',            'incorporate_material',     'incorporated'],
  ];

  it.each(forwardPath)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('short path: detailed_inspection → approved → incorporated (skipping test sampling)', () => {
    expect(nextStatus('detailed_inspection', 'approve_material')).toBe('approved');
    expect(nextStatus('approved', 'incorporate_material')).toBe('incorporated');
  });
});

// ─── Test sampling path ───────────────────────────────────────────────────────
describe('test sampling path', () => {
  it('detailed_inspection + take_test_samples => test_sampling', () => {
    expect(nextStatus('detailed_inspection', 'take_test_samples')).toBe('test_sampling');
  });

  it('test_sampling + await_results => results_pending', () => {
    expect(nextStatus('test_sampling', 'await_results')).toBe('results_pending');
  });

  it('results_pending + approve_material => approved', () => {
    expect(nextStatus('results_pending', 'approve_material')).toBe('approved');
  });

  it('full test path: detailed_inspection → test_sampling → results_pending → approved → incorporated', () => {
    let s: MirStatus = 'detailed_inspection';
    s = nextStatus(s, 'take_test_samples')!;  expect(s).toBe('test_sampling');
    s = nextStatus(s, 'await_results')!;       expect(s).toBe('results_pending');
    s = nextStatus(s, 'approve_material')!;    expect(s).toBe('approved');
    s = nextStatus(s, 'incorporate_material')!; expect(s).toBe('incorporated');
  });
});

// ─── Conditional approval branch ─────────────────────────────────────────────
describe('conditional_approval branch', () => {
  it('detailed_inspection + approve_conditional => conditional_approval', () => {
    expect(nextStatus('detailed_inspection', 'approve_conditional')).toBe('conditional_approval');
  });

  it('results_pending + approve_conditional => conditional_approval', () => {
    expect(nextStatus('results_pending', 'approve_conditional')).toBe('conditional_approval');
  });

  it('conditional_approval + incorporate_material => incorporated', () => {
    expect(nextStatus('conditional_approval', 'incorporate_material')).toBe('incorporated');
  });

  it('conditional_approval cannot approve_material (already approved conditionally)', () => {
    expect(nextStatus('conditional_approval', 'approve_material')).toBeNull();
  });
});

// ─── Reject path ──────────────────────────────────────────────────────────────
describe('reject_material path', () => {
  const rejectableStates: MirStatus[] = [
    'delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection', 'results_pending',
  ];

  it.each(rejectableStates)('%s + reject_material => rejected_on_site', (from) => {
    expect(nextStatus(from, 'reject_material')).toBe('rejected_on_site');
  });

  it('rejected_on_site + return_to_supplier => returned_to_supplier', () => {
    expect(nextStatus('rejected_on_site', 'return_to_supplier')).toBe('returned_to_supplier');
  });

  it('approved cannot be rejected (past inspection gate)', () => {
    expect(nextStatus('approved', 'reject_material')).toBeNull();
  });

  it('conditional_approval cannot be rejected', () => {
    expect(nextStatus('conditional_approval', 'reject_material')).toBeNull();
  });

  it('test_sampling cannot be rejected directly', () => {
    // test_sampling is not in the reject from-list
    expect(nextStatus('test_sampling', 'reject_material')).toBeNull();
  });
});

// ─── Quarantine path ──────────────────────────────────────────────────────────
describe('quarantine_material path', () => {
  const quarantinableStates: MirStatus[] = [
    'delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection', 'results_pending',
  ];

  it.each(quarantinableStates)('%s + quarantine_material => quarantined', (from) => {
    expect(nextStatus(from, 'quarantine_material')).toBe('quarantined');
  });

  it('quarantined + return_to_supplier => returned_to_supplier', () => {
    expect(nextStatus('quarantined', 'return_to_supplier')).toBe('returned_to_supplier');
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('incorporated is a hard terminal', () => {
    expect(isHardTerminal('incorporated')).toBe(true);
  });

  it('returned_to_supplier is a hard terminal', () => {
    expect(isHardTerminal('returned_to_supplier')).toBe(true);
  });

  it('HARD_TERMINALS array has 2 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(2);
  });

  it('delivery_notified is NOT a hard terminal', () => {
    expect(isHardTerminal('delivery_notified')).toBe(false);
  });

  it('approved is NOT a hard terminal', () => {
    expect(isHardTerminal('approved')).toBe(false);
  });

  it('rejected_on_site is NOT a hard terminal', () => {
    expect(isHardTerminal('rejected_on_site')).toBe(false);
  });

  it('quarantined is NOT a hard terminal', () => {
    expect(isHardTerminal('quarantined')).toBe(false);
  });

  it('incorporated blocks all transitions', () => {
    expect(nextStatus('incorporated', 'incorporate_material')).toBeNull();
    expect(nextStatus('incorporated', 'reject_material')).toBeNull();
    expect(nextStatus('incorporated', 'flag_overdue')).toBeNull();
  });

  it('returned_to_supplier blocks all transitions', () => {
    expect(nextStatus('returned_to_supplier', 'record_delivery')).toBeNull();
    expect(nextStatus('returned_to_supplier', 'reject_material')).toBeNull();
    expect(nextStatus('returned_to_supplier', 'return_to_supplier')).toBeNull();
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('critical_structural = 24h (URGENT — tightest)', () => {
    expect(SLA_HOURS['critical_structural']).toBe(24);
  });

  it('electrical_mechanical = 48h', () => {
    expect(SLA_HOURS['electrical_mechanical']).toBe(48);
  });

  it('civil = 96h', () => {
    expect(SLA_HOURS['civil']).toBe(96);
  });

  it('general = 168h (loosest)', () => {
    expect(SLA_HOURS['general']).toBe(168);
  });

  it('URGENT polarity: critical_structural < electrical_mechanical < civil < general', () => {
    const tiers: MaterialTier[] = ['critical_structural', 'electrical_mechanical', 'civil', 'general'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(SLA_HOURS[tiers[i]]).toBeLessThan(SLA_HOURS[tiers[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 material tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });

  it('slaDeadlineFor critical_structural = 24h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('critical_structural', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });

  it('slaDeadlineFor general = 168h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('general', from);
    expect(deadline.getTime()).toBe(from.getTime() + 168 * 3600 * 1000);
  });

  it('slaDeadlineFor electrical_mechanical = 48h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('electrical_mechanical', from);
    expect(deadline.getTime()).toBe(from.getTime() + 48 * 3600 * 1000);
  });

  it('slaDeadlineFor civil = 96h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('civil', from);
    expect(deadline.getTime()).toBe(from.getTime() + 96 * 3600 * 1000);
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

// ─── W139 SIGNATURE: crossesIntoRegulator ────────────────────────────────────
describe('W139 SIGNATURE: crossesIntoRegulator', () => {
  // reject_material with floor_ie_witnessed
  it('reject_material + floor_ie_witnessed=1 ALWAYS crosses (EVERY tier)', () => {
    expect(crossesIntoRegulator('reject_material', { floor_ie_witnessed: 1 })).toBe(true);
  });

  it('reject_material + floor_ie_witnessed=true crosses', () => {
    expect(crossesIntoRegulator('reject_material', { floor_ie_witnessed: true })).toBe(true);
  });

  it('reject_material WITHOUT floor_ie_witnessed does NOT cross', () => {
    expect(crossesIntoRegulator('reject_material', { floor_ie_witnessed: 0 })).toBe(false);
  });

  it('reject_material with undefined floor_ie_witnessed does NOT cross', () => {
    expect(crossesIntoRegulator('reject_material', {})).toBe(false);
  });

  // quarantine_material with floor_critical_safety
  it('quarantine_material + floor_critical_safety=1 crosses (EVERY tier)', () => {
    expect(crossesIntoRegulator('quarantine_material', { floor_critical_safety: 1 })).toBe(true);
  });

  it('quarantine_material + floor_critical_safety=true crosses', () => {
    expect(crossesIntoRegulator('quarantine_material', { floor_critical_safety: true })).toBe(true);
  });

  it('quarantine_material WITHOUT floor_critical_safety does NOT cross', () => {
    expect(crossesIntoRegulator('quarantine_material', { floor_critical_safety: 0 })).toBe(false);
  });

  it('quarantine_material with undefined floor_critical_safety does NOT cross', () => {
    expect(crossesIntoRegulator('quarantine_material', {})).toBe(false);
  });

  // approve_conditional with floor_lender_hold_point
  it('approve_conditional + floor_lender_hold_point=1 crosses', () => {
    expect(crossesIntoRegulator('approve_conditional', { floor_lender_hold_point: 1 })).toBe(true);
  });

  it('approve_conditional + floor_lender_hold_point=true crosses', () => {
    expect(crossesIntoRegulator('approve_conditional', { floor_lender_hold_point: true })).toBe(true);
  });

  it('approve_conditional WITHOUT floor_lender_hold_point does NOT cross', () => {
    expect(crossesIntoRegulator('approve_conditional', { floor_lender_hold_point: 0 })).toBe(false);
  });

  // Other actions never cross
  it('record_delivery never crosses even with all flags', () => {
    expect(crossesIntoRegulator('record_delivery', {
      floor_ie_witnessed: 1, floor_critical_safety: 1,
      floor_nersa_material: 1, floor_lender_hold_point: 1,
    })).toBe(false);
  });

  it('start_initial_inspection never crosses', () => {
    expect(crossesIntoRegulator('start_initial_inspection', { floor_ie_witnessed: 1 })).toBe(false);
  });

  it('proceed_to_detailed never crosses', () => {
    expect(crossesIntoRegulator('proceed_to_detailed', { floor_critical_safety: 1 })).toBe(false);
  });

  it('approve_material never crosses even with all flags', () => {
    expect(crossesIntoRegulator('approve_material', {
      floor_ie_witnessed: 1, floor_critical_safety: 1, floor_lender_hold_point: 1,
    })).toBe(false);
  });

  it('incorporate_material never crosses', () => {
    expect(crossesIntoRegulator('incorporate_material', { floor_ie_witnessed: 1 })).toBe(false);
  });

  it('return_to_supplier never crosses', () => {
    expect(crossesIntoRegulator('return_to_supplier', { floor_critical_safety: 1 })).toBe(false);
  });

  it('take_test_samples never crosses', () => {
    expect(crossesIntoRegulator('take_test_samples', { floor_ie_witnessed: 1 })).toBe(false);
  });

  it('await_results never crosses', () => {
    expect(crossesIntoRegulator('await_results', { floor_nersa_material: 1 })).toBe(false);
  });

  it('flag_overdue never crosses even with all flags', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ie_witnessed: 1, floor_critical_safety: 1,
      floor_nersa_material: 1, floor_lender_hold_point: 1,
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('critical_structural + floor_ie_witnessed=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_structural', { floor_ie_witnessed: 1 })).toBe(true);
  });

  it('critical_structural + floor_ie_witnessed=true crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_structural', { floor_ie_witnessed: true })).toBe(true);
  });

  it('critical_structural + floor_nersa_material=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_structural', { floor_nersa_material: 1 })).toBe(true);
  });

  it('electrical_mechanical + floor_nersa_material=1 crosses (NERSA equipment at any tier)', () => {
    expect(slaBreachCrossesIntoRegulator('electrical_mechanical', { floor_nersa_material: 1 })).toBe(true);
  });

  it('civil + floor_nersa_material does NOT cross (not critical_structural or electrical_mechanical)', () => {
    expect(slaBreachCrossesIntoRegulator('civil', { floor_nersa_material: 1 })).toBe(false);
  });

  it('general + floor_nersa_material does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('general', { floor_nersa_material: 1 })).toBe(false);
  });

  it('electrical_mechanical + floor_ie_witnessed does NOT cross (only critical_structural triggers ie_witnessed sla crossing)', () => {
    expect(slaBreachCrossesIntoRegulator('electrical_mechanical', { floor_ie_witnessed: 1 })).toBe(false);
  });

  it('civil + floor_ie_witnessed does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('civil', { floor_ie_witnessed: 1 })).toBe(false);
  });

  it('general + floor_ie_witnessed does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('general', { floor_ie_witnessed: 1 })).toBe(false);
  });

  it('critical_structural with NO flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_structural', {
      floor_ie_witnessed: 0, floor_nersa_material: 0,
    })).toBe(false);
  });

  it('critical_structural with undefined flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_structural', {})).toBe(false);
  });

  it('general with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('general', {})).toBe(false);
  });

  it('critical_structural + ie_witnessed + nersa_material crosses (multiple flags)', () => {
    expect(slaBreachCrossesIntoRegulator('critical_structural', {
      floor_ie_witnessed: 1, floor_nersa_material: 1,
    })).toBe(true);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[MirStatus, string]> = [
    ['delivery_notified',    'delivery_notified_at'],
    ['delivered',            'delivered_at'],
    ['initial_inspection',   'initial_inspection_at'],
    ['detailed_inspection',  'detailed_inspection_at'],
    ['test_sampling',        'test_sampling_at'],
    ['results_pending',      'results_pending_at'],
    ['approved',             'approved_at'],
    ['conditional_approval', 'conditional_approval_at'],
    ['incorporated',         'incorporated_at'],
    ['rejected_on_site',     'rejected_on_site_at'],
    ['quarantined',          'quarantined_at'],
    ['returned_to_supplier', 'returned_to_supplier_at'],
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
  const cases: Array<[MirAction, string]> = [
    ['record_delivery',          'ipp_mir.record_delivery'],
    ['start_initial_inspection', 'ipp_mir.start_initial_inspection'],
    ['proceed_to_detailed',      'ipp_mir.proceed_to_detailed'],
    ['take_test_samples',        'ipp_mir.take_test_samples'],
    ['await_results',            'ipp_mir.await_results'],
    ['approve_material',         'ipp_mir.approve_material'],
    ['approve_conditional',      'ipp_mir.approve_conditional'],
    ['incorporate_material',     'ipp_mir.incorporate_material'],
    ['reject_material',          'ipp_mir.reject_material'],
    ['quarantine_material',      'ipp_mir.quarantine_material'],
    ['return_to_supplier',       'ipp_mir.return_to_supplier'],
    ['flag_overdue',             'ipp_mir.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 12 actions are mapped', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── MATERIAL_TIER_LABELS ─────────────────────────────────────────────────────
describe('MATERIAL_TIER_LABELS', () => {
  it('has 4 material tier labels', () => {
    expect(Object.keys(MATERIAL_TIER_LABELS)).toHaveLength(4);
  });

  it('critical_structural = Critical structural', () => {
    expect(MATERIAL_TIER_LABELS['critical_structural']).toBe('Critical structural');
  });

  it('electrical_mechanical = Electrical / mechanical', () => {
    expect(MATERIAL_TIER_LABELS['electrical_mechanical']).toBe('Electrical / mechanical');
  });

  it('civil = Civil', () => {
    expect(MATERIAL_TIER_LABELS['civil']).toBe('Civil');
  });

  it('general = General', () => {
    expect(MATERIAL_TIER_LABELS['general']).toBe('General');
  });
});

// ─── MATERIAL_CATEGORY_LABELS ─────────────────────────────────────────────────
describe('MATERIAL_CATEGORY_LABELS', () => {
  it('has 10 material category labels', () => {
    expect(Object.keys(MATERIAL_CATEGORY_LABELS)).toHaveLength(10);
  });

  it('structural_steel = Structural steel', () => {
    expect(MATERIAL_CATEGORY_LABELS['structural_steel']).toBe('Structural steel');
  });

  it('concrete = Concrete', () => {
    expect(MATERIAL_CATEGORY_LABELS['concrete']).toBe('Concrete');
  });

  it('electrical_cable = Electrical cable', () => {
    expect(MATERIAL_CATEGORY_LABELS['electrical_cable']).toBe('Electrical cable');
  });

  it('transformer = Transformer', () => {
    expect(MATERIAL_CATEGORY_LABELS['transformer']).toBe('Transformer');
  });

  it('inverter = Inverter', () => {
    expect(MATERIAL_CATEGORY_LABELS['inverter']).toBe('Inverter');
  });

  it('solar_panel = Solar panel', () => {
    expect(MATERIAL_CATEGORY_LABELS['solar_panel']).toBe('Solar panel');
  });

  it('civil_materials = Civil materials', () => {
    expect(MATERIAL_CATEGORY_LABELS['civil_materials']).toBe('Civil materials');
  });

  it('mechanical = Mechanical', () => {
    expect(MATERIAL_CATEGORY_LABELS['mechanical']).toBe('Mechanical');
  });

  it('instruments = Instruments', () => {
    expect(MATERIAL_CATEGORY_LABELS['instruments']).toBe('Instruments');
  });

  it('general = General', () => {
    expect(MATERIAL_CATEGORY_LABELS['general']).toBe('General');
  });
});

// ─── TRANSITIONS record completeness ─────────────────────────────────────────
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

  it('approve_material has two valid from-states (detailed_inspection + results_pending)', () => {
    const t = TRANSITIONS['approve_material'];
    expect(t.from).toContain('detailed_inspection');
    expect(t.from).toContain('results_pending');
  });

  it('approve_conditional has two valid from-states', () => {
    const t = TRANSITIONS['approve_conditional'];
    expect(t.from).toContain('detailed_inspection');
    expect(t.from).toContain('results_pending');
  });

  it('incorporate_material has two valid from-states (approved + conditional_approval)', () => {
    const t = TRANSITIONS['incorporate_material'];
    expect(t.from).toContain('approved');
    expect(t.from).toContain('conditional_approval');
  });

  it('return_to_supplier has two valid from-states (rejected_on_site + quarantined)', () => {
    const t = TRANSITIONS['return_to_supplier'];
    expect(t.from).toContain('rejected_on_site');
    expect(t.from).toContain('quarantined');
  });

  it('reject_material has 5 valid from-states', () => {
    const t = TRANSITIONS['reject_material'];
    expect(t.from).toHaveLength(5);
    expect(t.from).toContain('delivery_notified');
    expect(t.from).toContain('results_pending');
  });
});

// ─── flag_overdue cron action ─────────────────────────────────────────────────
describe('flag_overdue cron action', () => {
  const openStates: MirStatus[] = [
    'delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection',
    'test_sampling', 'results_pending', 'conditional_approval',
  ];

  it.each(openStates)('%s + flag_overdue returns current state unchanged', (status) => {
    expect(nextStatus(status, 'flag_overdue')).toBe(status);
  });

  it('flag_overdue from incorporated (terminal) returns null', () => {
    expect(nextStatus('incorporated', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from returned_to_supplier (terminal) returns null', () => {
    expect(nextStatus('returned_to_supplier', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue does not cross into regulator', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ie_witnessed: 1, floor_critical_safety: 1,
      floor_nersa_material: 1, floor_lender_hold_point: 1,
    })).toBe(false);
  });

  it('7 open states covered by flag_overdue', () => {
    expect(openStates).toHaveLength(7);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('delivery_notified', 'invalid_action' as MirAction)).toBeNull();
  });

  it('step-skip enforced: delivery_notified cannot jump to initial_inspection', () => {
    expect(nextStatus('delivery_notified', 'start_initial_inspection')).toBeNull();
  });

  it('step-skip enforced: delivered cannot jump to detailed_inspection', () => {
    expect(nextStatus('delivered', 'proceed_to_detailed')).toBeNull();
  });

  it('step-skip enforced: delivery_notified cannot approve', () => {
    expect(nextStatus('delivery_notified', 'approve_material')).toBeNull();
  });

  it('two branches from detailed_inspection: approve OR test samples', () => {
    expect(nextStatus('detailed_inspection', 'approve_material')).toBe('approved');
    expect(nextStatus('detailed_inspection', 'take_test_samples')).toBe('test_sampling');
  });

  it('two branches from results_pending: approve OR conditional', () => {
    expect(nextStatus('results_pending', 'approve_material')).toBe('approved');
    expect(nextStatus('results_pending', 'approve_conditional')).toBe('conditional_approval');
  });

  it('URGENT polarity consistency: critical_structural 24h strictly less than electrical_mechanical 48h', () => {
    expect(SLA_HOURS.critical_structural).toBeLessThan(SLA_HOURS.electrical_mechanical);
    expect(SLA_HOURS.electrical_mechanical).toBeLessThan(SLA_HOURS.civil);
    expect(SLA_HOURS.civil).toBeLessThan(SLA_HOURS.general);
  });

  it('crossesIntoRegulator: reject with ie_witnessed=0 does not cross', () => {
    expect(crossesIntoRegulator('reject_material', {
      floor_ie_witnessed: 0, floor_critical_safety: 1,
    })).toBe(false);
  });

  it('slaBreachCrossesIntoRegulator: civil is NOT an URGENT tier for ie_witnessed', () => {
    expect(slaBreachCrossesIntoRegulator('civil', {
      floor_ie_witnessed: 1, floor_nersa_material: 0,
    })).toBe(false);
  });
});
