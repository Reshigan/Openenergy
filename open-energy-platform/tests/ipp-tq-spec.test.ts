// Wave 142 — IPP Technical Query (TQ) Log spec tests
// ISO 9001:2015 design communication + FIDIC EPC + CIDB best practice
// URGENT SLA: safety_critical 24h (tightest) / construction_blocking 48h / standard 168h / information_only 336h
// SIGNATURE: flag_design_change EVERY tier when floor_structural_safety;
//            escalate_tq when floor_ie_notification_required;
//            issue_response when floor_nersa_impact.
import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isHardTerminal,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  eventTypeFor,
  statusTsCol,
  SLA_HOURS,
  TRANSITIONS,
  HARD_TERMINALS,
  QUERY_URGENCY_LABELS,
  DISCIPLINE_LABELS,
  RESPONSE_TYPE_LABELS,
  type TqStatus,
  type TqAction,
  type QueryUrgency,
} from '../src/utils/ipp-tq-spec';

// ─── Forward path ─────────────────────────────────────────────────────────────
describe('forward path', () => {
  const forwardPath: Array<[TqStatus, TqAction, TqStatus]> = [
    ['raised',             'log_tq',               'logged'],
    ['logged',             'allocate_to_designer',  'allocated'],
    ['allocated',          'commence_review',       'under_review'],
    ['under_review',       'draft_response',        'response_drafted'],
    ['response_drafted',   'approve_response',      'response_approved'],
    ['response_approved',  'issue_response',        'response_issued'],
    ['response_issued',    'acknowledge_response',  'acknowledged'],
    ['acknowledged',       'close_tq',              'closed'],
  ];

  it.each(forwardPath)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('full 8-step forward path from raised to closed', () => {
    let s: TqStatus = 'raised';
    s = nextStatus(s, 'log_tq')!;               expect(s).toBe('logged');
    s = nextStatus(s, 'allocate_to_designer')!;  expect(s).toBe('allocated');
    s = nextStatus(s, 'commence_review')!;       expect(s).toBe('under_review');
    s = nextStatus(s, 'draft_response')!;        expect(s).toBe('response_drafted');
    s = nextStatus(s, 'approve_response')!;      expect(s).toBe('response_approved');
    s = nextStatus(s, 'issue_response')!;        expect(s).toBe('response_issued');
    s = nextStatus(s, 'acknowledge_response')!;  expect(s).toBe('acknowledged');
    s = nextStatus(s, 'close_tq')!;             expect(s).toBe('closed');
  });

  it('covers 8 forward steps', () => {
    expect(forwardPath).toHaveLength(8);
  });
});

// ─── reject_tq branch ─────────────────────────────────────────────────────────
describe('reject_tq branch', () => {
  it('logged + reject_tq => rejected', () => {
    expect(nextStatus('logged', 'reject_tq')).toBe('rejected');
  });

  it('allocated + reject_tq => rejected', () => {
    expect(nextStatus('allocated', 'reject_tq')).toBe('rejected');
  });

  it('under_review + reject_tq => rejected', () => {
    expect(nextStatus('under_review', 'reject_tq')).toBe('rejected');
  });

  it('raised cannot reject directly', () => {
    expect(nextStatus('raised', 'reject_tq')).toBeNull();
  });

  it('response_drafted cannot reject', () => {
    expect(nextStatus('response_drafted', 'reject_tq')).toBeNull();
  });

  it('response_approved cannot reject', () => {
    expect(nextStatus('response_approved', 'reject_tq')).toBeNull();
  });
});

// ─── flag_design_change branch ────────────────────────────────────────────────
describe('flag_design_change branch', () => {
  it('response_drafted + flag_design_change => design_change_required', () => {
    expect(nextStatus('response_drafted', 'flag_design_change')).toBe('design_change_required');
  });

  it('response_approved + flag_design_change => design_change_required', () => {
    expect(nextStatus('response_approved', 'flag_design_change')).toBe('design_change_required');
  });

  it('under_review cannot flag_design_change directly', () => {
    expect(nextStatus('under_review', 'flag_design_change')).toBeNull();
  });

  it('allocated cannot flag_design_change', () => {
    expect(nextStatus('allocated', 'flag_design_change')).toBeNull();
  });

  it('response_issued cannot flag_design_change', () => {
    expect(nextStatus('response_issued', 'flag_design_change')).toBeNull();
  });
});

// ─── escalate_tq + resolve_escalation branch ─────────────────────────────────
describe('escalate_tq + resolve_escalation branch', () => {
  it('under_review + escalate_tq => escalated', () => {
    expect(nextStatus('under_review', 'escalate_tq')).toBe('escalated');
  });

  it('response_drafted + escalate_tq => escalated', () => {
    expect(nextStatus('response_drafted', 'escalate_tq')).toBe('escalated');
  });

  it('escalated + resolve_escalation => allocated', () => {
    expect(nextStatus('escalated', 'resolve_escalation')).toBe('allocated');
  });

  it('allocated cannot escalate', () => {
    expect(nextStatus('allocated', 'escalate_tq')).toBeNull();
  });

  it('response_approved cannot escalate', () => {
    expect(nextStatus('response_approved', 'escalate_tq')).toBeNull();
  });

  it('escalate → resolve → allocated → commence_review (re-entry)', () => {
    let s: TqStatus = 'under_review';
    s = nextStatus(s, 'escalate_tq')!;       expect(s).toBe('escalated');
    s = nextStatus(s, 'resolve_escalation')!; expect(s).toBe('allocated');
    s = nextStatus(s, 'commence_review')!;    expect(s).toBe('under_review');
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('closed is a hard terminal', () => {
    expect(isHardTerminal('closed')).toBe(true);
  });

  it('rejected is a hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(true);
  });

  it('HARD_TERMINALS array has 2 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(2);
  });

  it('raised is NOT a hard terminal', () => {
    expect(isHardTerminal('raised')).toBe(false);
  });

  it('design_change_required is NOT a hard terminal', () => {
    expect(isHardTerminal('design_change_required')).toBe(false);
  });

  it('escalated is NOT a hard terminal', () => {
    expect(isHardTerminal('escalated')).toBe(false);
  });

  it('closed blocks all transitions', () => {
    expect(nextStatus('closed', 'log_tq')).toBeNull();
    expect(nextStatus('closed', 'close_tq')).toBeNull();
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('rejected blocks all transitions', () => {
    expect(nextStatus('rejected', 'log_tq')).toBeNull();
    expect(nextStatus('rejected', 'reject_tq')).toBeNull();
    expect(nextStatus('rejected', 'flag_overdue')).toBeNull();
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('safety_critical = 24h (URGENT tightest)', () => {
    expect(SLA_HOURS['safety_critical']).toBe(24);
  });

  it('construction_blocking = 48h', () => {
    expect(SLA_HOURS['construction_blocking']).toBe(48);
  });

  it('standard = 168h', () => {
    expect(SLA_HOURS['standard']).toBe(168);
  });

  it('information_only = 336h (loosest)', () => {
    expect(SLA_HOURS['information_only']).toBe(336);
  });

  it('URGENT polarity: safety_critical < construction_blocking < standard < information_only', () => {
    const urgencies: QueryUrgency[] = ['safety_critical', 'construction_blocking', 'standard', 'information_only'];
    for (let i = 0; i < urgencies.length - 1; i++) {
      expect(SLA_HOURS[urgencies[i]]).toBeLessThan(SLA_HOURS[urgencies[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 urgency levels', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });
});

// ─── W142 SIGNATURE: crossesIntoRegulator ─────────────────────────────────────
describe('W142 SIGNATURE: crossesIntoRegulator', () => {
  // flag_design_change with floor_structural_safety — EVERY tier
  it('flag_design_change + floor_structural_safety=1 crosses', () => {
    expect(crossesIntoRegulator('flag_design_change', { floor_structural_safety: 1 })).toBe(true);
  });

  it('flag_design_change + floor_structural_safety=true crosses', () => {
    expect(crossesIntoRegulator('flag_design_change', { floor_structural_safety: true })).toBe(true);
  });

  it('flag_design_change WITHOUT floor_structural_safety does NOT cross', () => {
    expect(crossesIntoRegulator('flag_design_change', { floor_structural_safety: 0 })).toBe(false);
  });

  it('flag_design_change with undefined floor_structural_safety does NOT cross', () => {
    expect(crossesIntoRegulator('flag_design_change', {})).toBe(false);
  });

  // escalate_tq with floor_ie_notification_required
  it('escalate_tq + floor_ie_notification_required=1 crosses', () => {
    expect(crossesIntoRegulator('escalate_tq', { floor_ie_notification_required: 1 })).toBe(true);
  });

  it('escalate_tq + floor_ie_notification_required=true crosses', () => {
    expect(crossesIntoRegulator('escalate_tq', { floor_ie_notification_required: true })).toBe(true);
  });

  it('escalate_tq WITHOUT floor_ie_notification_required does NOT cross', () => {
    expect(crossesIntoRegulator('escalate_tq', { floor_ie_notification_required: 0 })).toBe(false);
  });

  it('escalate_tq with undefined ie_notification does NOT cross', () => {
    expect(crossesIntoRegulator('escalate_tq', {})).toBe(false);
  });

  // issue_response with floor_nersa_impact
  it('issue_response + floor_nersa_impact=1 crosses', () => {
    expect(crossesIntoRegulator('issue_response', { floor_nersa_impact: 1 })).toBe(true);
  });

  it('issue_response + floor_nersa_impact=true crosses', () => {
    expect(crossesIntoRegulator('issue_response', { floor_nersa_impact: true })).toBe(true);
  });

  it('issue_response WITHOUT floor_nersa_impact does NOT cross', () => {
    expect(crossesIntoRegulator('issue_response', { floor_nersa_impact: 0 })).toBe(false);
  });

  it('issue_response with undefined nersa_impact does NOT cross', () => {
    expect(crossesIntoRegulator('issue_response', {})).toBe(false);
  });

  // Other actions never cross
  it('log_tq never crosses even with all flags', () => {
    expect(crossesIntoRegulator('log_tq', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('allocate_to_designer never crosses', () => {
    expect(crossesIntoRegulator('allocate_to_designer', { floor_structural_safety: 1 })).toBe(false);
  });

  it('commence_review never crosses', () => {
    expect(crossesIntoRegulator('commence_review', { floor_structural_safety: 1 })).toBe(false);
  });

  it('draft_response never crosses even with all flags', () => {
    expect(crossesIntoRegulator('draft_response', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('approve_response never crosses', () => {
    expect(crossesIntoRegulator('approve_response', { floor_structural_safety: 1 })).toBe(false);
  });

  it('acknowledge_response never crosses even with all flags', () => {
    expect(crossesIntoRegulator('acknowledge_response', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('close_tq never crosses', () => {
    expect(crossesIntoRegulator('close_tq', { floor_structural_safety: 1 })).toBe(false);
  });

  it('reject_tq never crosses even with all flags', () => {
    expect(crossesIntoRegulator('reject_tq', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('resolve_escalation never crosses', () => {
    expect(crossesIntoRegulator('resolve_escalation', { floor_ie_notification_required: 1 })).toBe(false);
  });

  it('flag_overdue never crosses even with all flags', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('flag_design_change with only ie_notification (no structural) does NOT cross', () => {
    expect(crossesIntoRegulator('flag_design_change', {
      floor_structural_safety: 0,
      floor_ie_notification_required: 1,
    })).toBe(false);
  });

  it('escalate_tq with only structural (no ie_notification) does NOT cross', () => {
    expect(crossesIntoRegulator('escalate_tq', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 0,
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('safety_critical + floor_structural_safety=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', { floor_structural_safety: 1 })).toBe(true);
  });

  it('safety_critical + floor_structural_safety=true crosses', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', { floor_structural_safety: true })).toBe(true);
  });

  it('construction_blocking + floor_ie_notification_required=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('construction_blocking', { floor_ie_notification_required: 1 })).toBe(true);
  });

  it('standard + floor_ie_notification_required=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('standard', { floor_ie_notification_required: 1 })).toBe(true);
  });

  it('information_only + floor_ie_notification_required does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('information_only', { floor_ie_notification_required: 1 })).toBe(false);
  });

  it('safety_critical with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('safety_critical', {
      floor_structural_safety: 0,
      floor_ie_notification_required: 0,
    })).toBe(false);
  });

  it('construction_blocking + floor_structural_safety only does NOT cross (structural_safety only crosses on safety_critical)', () => {
    expect(slaBreachCrossesIntoRegulator('construction_blocking', { floor_structural_safety: 1 })).toBe(false);
  });

  it('information_only with all flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('information_only', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
    })).toBe(false);
  });

  it('standard with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('standard', {})).toBe(false);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[TqStatus, string]> = [
    ['raised',                  'raised_at'],
    ['logged',                  'logged_at'],
    ['allocated',               'allocated_at'],
    ['under_review',            'under_review_at'],
    ['response_drafted',        'response_drafted_at'],
    ['response_approved',       'response_approved_at'],
    ['response_issued',         'response_issued_at'],
    ['acknowledged',            'acknowledged_at'],
    ['closed',                  'closed_at'],
    ['rejected',                'rejected_at'],
    ['design_change_required',  'design_change_required_at'],
    ['escalated',               'escalated_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor: all 13 actions ─────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[TqAction, string]> = [
    ['log_tq',               'ipp_tq.log_tq'],
    ['allocate_to_designer', 'ipp_tq.allocate_to_designer'],
    ['commence_review',      'ipp_tq.commence_review'],
    ['draft_response',       'ipp_tq.draft_response'],
    ['approve_response',     'ipp_tq.approve_response'],
    ['issue_response',       'ipp_tq.issue_response'],
    ['acknowledge_response', 'ipp_tq.acknowledge_response'],
    ['close_tq',             'ipp_tq.close_tq'],
    ['reject_tq',            'ipp_tq.reject_tq'],
    ['flag_design_change',   'ipp_tq.flag_design_change'],
    ['escalate_tq',          'ipp_tq.escalate_tq'],
    ['resolve_escalation',   'ipp_tq.resolve_escalation'],
    ['flag_overdue',         'ipp_tq.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 13 actions are mapped', () => {
    expect(cases).toHaveLength(13);
  });
});

// ─── Label maps ───────────────────────────────────────────────────────────────
describe('QUERY_URGENCY_LABELS', () => {
  it('has 4 urgency labels', () => {
    expect(Object.keys(QUERY_URGENCY_LABELS)).toHaveLength(4);
  });

  it('safety_critical = Safety critical', () => {
    expect(QUERY_URGENCY_LABELS['safety_critical']).toBe('Safety critical');
  });

  it('construction_blocking = Construction blocking', () => {
    expect(QUERY_URGENCY_LABELS['construction_blocking']).toBe('Construction blocking');
  });

  it('standard = Standard', () => {
    expect(QUERY_URGENCY_LABELS['standard']).toBe('Standard');
  });

  it('information_only = Information only', () => {
    expect(QUERY_URGENCY_LABELS['information_only']).toBe('Information only');
  });
});

describe('DISCIPLINE_LABELS', () => {
  it('has 9 discipline labels', () => {
    expect(Object.keys(DISCIPLINE_LABELS)).toHaveLength(9);
  });

  it('structural = Structural', () => {
    expect(DISCIPLINE_LABELS['structural']).toBe('Structural');
  });

  it('electrical = Electrical', () => {
    expect(DISCIPLINE_LABELS['electrical']).toBe('Electrical');
  });

  it('fire_protection = Fire protection', () => {
    expect(DISCIPLINE_LABELS['fire_protection']).toBe('Fire protection');
  });
});

describe('RESPONSE_TYPE_LABELS', () => {
  it('has 5 response type labels', () => {
    expect(Object.keys(RESPONSE_TYPE_LABELS)).toHaveLength(5);
  });

  it('clarification = Clarification', () => {
    expect(RESPONSE_TYPE_LABELS['clarification']).toBe('Clarification');
  });

  it('accept_proposed = Accept proposed solution', () => {
    expect(RESPONSE_TYPE_LABELS['accept_proposed']).toBe('Accept proposed solution');
  });

  it('design_change_required = Design change required', () => {
    expect(RESPONSE_TYPE_LABELS['design_change_required']).toBe('Design change required');
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

  it('reject_tq has 3 from-states (logged + allocated + under_review)', () => {
    expect(TRANSITIONS['reject_tq'].from).toContain('logged');
    expect(TRANSITIONS['reject_tq'].from).toContain('allocated');
    expect(TRANSITIONS['reject_tq'].from).toContain('under_review');
    expect(TRANSITIONS['reject_tq'].from).toHaveLength(3);
  });

  it('flag_design_change has 2 from-states (response_drafted + response_approved)', () => {
    expect(TRANSITIONS['flag_design_change'].from).toContain('response_drafted');
    expect(TRANSITIONS['flag_design_change'].from).toContain('response_approved');
    expect(TRANSITIONS['flag_design_change'].from).toHaveLength(2);
  });

  it('escalate_tq has 2 from-states (under_review + response_drafted)', () => {
    expect(TRANSITIONS['escalate_tq'].from).toContain('under_review');
    expect(TRANSITIONS['escalate_tq'].from).toContain('response_drafted');
    expect(TRANSITIONS['escalate_tq'].from).toHaveLength(2);
  });

  it('resolve_escalation has 1 from-state (escalated only)', () => {
    expect(TRANSITIONS['resolve_escalation'].from).toHaveLength(1);
    expect(TRANSITIONS['resolve_escalation'].from).toContain('escalated');
  });

  it('close_tq has 1 from-state (acknowledged only)', () => {
    expect(TRANSITIONS['close_tq'].from).toHaveLength(1);
    expect(TRANSITIONS['close_tq'].from).toContain('acknowledged');
  });
});

// ─── flag_overdue cron action ──────────────────────────────────────────────────
describe('flag_overdue cron action', () => {
  const openStates: TqStatus[] = [
    'raised', 'logged', 'allocated', 'under_review', 'response_drafted',
    'response_approved', 'response_issued', 'design_change_required', 'escalated',
  ];

  it.each(openStates)('%s + flag_overdue returns current state unchanged', (status) => {
    expect(nextStatus(status, 'flag_overdue')).toBe(status);
  });

  it('flag_overdue from closed (terminal) returns null', () => {
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue from rejected (terminal) returns null', () => {
    expect(nextStatus('rejected', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue does not cross into regulator', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_structural_safety: 1,
      floor_ie_notification_required: 1,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('9 open states covered by flag_overdue', () => {
    expect(openStates).toHaveLength(9);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('raised', 'invalid_action' as TqAction)).toBeNull();
  });

  it('step-skip enforced: raised cannot jump to allocated', () => {
    expect(nextStatus('raised', 'allocate_to_designer')).toBeNull();
  });

  it('step-skip enforced: raised cannot commence_review', () => {
    expect(nextStatus('raised', 'commence_review')).toBeNull();
  });

  it('step-skip enforced: logged cannot commence_review directly', () => {
    expect(nextStatus('logged', 'commence_review')).toBeNull();
  });

  it('URGENT polarity consistency: safety_critical strictly less than information_only', () => {
    expect(SLA_HOURS.safety_critical).toBeLessThan(SLA_HOURS.construction_blocking);
    expect(SLA_HOURS.construction_blocking).toBeLessThan(SLA_HOURS.standard);
    expect(SLA_HOURS.standard).toBeLessThan(SLA_HOURS.information_only);
  });

  it('response_issued cannot escalate', () => {
    expect(nextStatus('response_issued', 'escalate_tq')).toBeNull();
  });

  it('acknowledged cannot escalate', () => {
    expect(nextStatus('acknowledged', 'escalate_tq')).toBeNull();
  });

  it('response_drafted has two paths: approve_response OR flag_design_change OR escalate_tq', () => {
    expect(nextStatus('response_drafted', 'approve_response')).toBe('response_approved');
    expect(nextStatus('response_drafted', 'flag_design_change')).toBe('design_change_required');
    expect(nextStatus('response_drafted', 'escalate_tq')).toBe('escalated');
  });

  it('response_approved has two paths: issue_response OR flag_design_change', () => {
    expect(nextStatus('response_approved', 'issue_response')).toBe('response_issued');
    expect(nextStatus('response_approved', 'flag_design_change')).toBe('design_change_required');
  });

  it('under_review has multiple paths: draft_response / reject_tq / escalate_tq', () => {
    expect(nextStatus('under_review', 'draft_response')).toBe('response_drafted');
    expect(nextStatus('under_review', 'reject_tq')).toBe('rejected');
    expect(nextStatus('under_review', 'escalate_tq')).toBe('escalated');
  });

  it('flag_design_change with only nersa_impact (no structural) does NOT cross', () => {
    expect(crossesIntoRegulator('flag_design_change', {
      floor_structural_safety: 0,
      floor_nersa_impact: 1,
    })).toBe(false);
  });

  it('issue_response without nersa_impact does NOT cross even with structural flag', () => {
    expect(crossesIntoRegulator('issue_response', {
      floor_structural_safety: 1,
      floor_nersa_impact: 0,
    })).toBe(false);
  });

  it('design_change_required state is not a hard terminal', () => {
    expect(isHardTerminal('design_change_required')).toBe(false);
  });
});
