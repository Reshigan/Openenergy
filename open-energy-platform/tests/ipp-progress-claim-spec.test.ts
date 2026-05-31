// Wave 141 — IPP Progress Claims & Payment Certificates spec tests
// JBCC + NEC4 + REIPPPP milestones + Equator Principles EP4
// INVERTED SLA: major 720h (most time) → minor 72h (least time)
// SIGNATURE: certify_by_engineer EVERY tier on floor_ie_milestone_payment;
//            record_final_account EVERY tier;
//            approve_payment when floor_lender_certification_required.
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
  formatZar,
  SLA_HOURS,
  TRANSITIONS,
  HARD_TERMINALS,
  CLAIM_TIER_LABELS,
  CLAIM_TYPE_LABELS,
  type ClaimStatus,
  type ClaimAction,
  type ClaimTier,
} from '../src/utils/ipp-progress-claim-spec';

// ─── Forward path ─────────────────────────────────────────────────────────────
describe('forward path', () => {
  const forwardPath: Array<[ClaimStatus, ClaimAction, ClaimStatus]> = [
    ['submitted',               'commence_qs_review',  'quantity_survey_review'],
    ['quantity_survey_review',  'complete_qs_review',  'pm_review'],
    ['pm_review',               'certify_by_engineer', 'engineer_certified'],
    ['engineer_certified',      'approve_payment',     'approved'],
    ['approved',                'process_payment',     'payment_processed'],
    ['payment_processed',       'close_claim',         'closed'],
  ];

  it.each(forwardPath)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('full 6-step forward path from submitted to closed', () => {
    let s: ClaimStatus = 'submitted';
    s = nextStatus(s, 'commence_qs_review')!;  expect(s).toBe('quantity_survey_review');
    s = nextStatus(s, 'complete_qs_review')!;   expect(s).toBe('pm_review');
    s = nextStatus(s, 'certify_by_engineer')!;  expect(s).toBe('engineer_certified');
    s = nextStatus(s, 'approve_payment')!;      expect(s).toBe('approved');
    s = nextStatus(s, 'process_payment')!;      expect(s).toBe('payment_processed');
    s = nextStatus(s, 'close_claim')!;          expect(s).toBe('closed');
  });

  it('covers 6 forward steps', () => {
    expect(forwardPath).toHaveLength(6);
  });
});

// ─── record_final_account from closed ─────────────────────────────────────────
describe('record_final_account branch', () => {
  it('closed + record_final_account => final_account', () => {
    expect(nextStatus('closed', 'record_final_account')).toBe('final_account');
  });

  it('record_final_account only allowed from closed', () => {
    const nonClosed: ClaimStatus[] = [
      'submitted', 'quantity_survey_review', 'pm_review', 'engineer_certified',
      'approved', 'payment_processed', 'disputed', 'suspended', 'partial_payment',
    ];
    for (const s of nonClosed) {
      expect(nextStatus(s, 'record_final_account')).toBeNull();
    }
  });
});

// ─── Dispute branch ───────────────────────────────────────────────────────────
describe('dispute branch', () => {
  it('pm_review + dispute_claim => disputed', () => {
    expect(nextStatus('pm_review', 'dispute_claim')).toBe('disputed');
  });

  it('engineer_certified + dispute_claim => disputed', () => {
    expect(nextStatus('engineer_certified', 'dispute_claim')).toBe('disputed');
  });

  it('disputed + resolve_dispute => pm_review', () => {
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('pm_review');
  });

  it('submitted cannot dispute', () => {
    expect(nextStatus('submitted', 'dispute_claim')).toBeNull();
  });

  it('approved cannot dispute', () => {
    expect(nextStatus('approved', 'dispute_claim')).toBeNull();
  });

  it('dispute → resolve → pm_review → certify → engineer_certified (full re-assess)', () => {
    let s: ClaimStatus = 'pm_review';
    s = nextStatus(s, 'dispute_claim')!;      expect(s).toBe('disputed');
    s = nextStatus(s, 'resolve_dispute')!;    expect(s).toBe('pm_review');
    s = nextStatus(s, 'certify_by_engineer')!; expect(s).toBe('engineer_certified');
  });
});

// ─── Partial payment branch ───────────────────────────────────────────────────
describe('partial payment branch', () => {
  it('engineer_certified + approve_partial => partial_payment', () => {
    expect(nextStatus('engineer_certified', 'approve_partial')).toBe('partial_payment');
  });

  it('pm_review + approve_partial => partial_payment', () => {
    expect(nextStatus('pm_review', 'approve_partial')).toBe('partial_payment');
  });

  it('partial_payment + close_claim => closed', () => {
    expect(nextStatus('partial_payment', 'close_claim')).toBe('closed');
  });

  it('submitted cannot approve_partial', () => {
    expect(nextStatus('submitted', 'approve_partial')).toBeNull();
  });
});

// ─── Suspend and reinstate branch ─────────────────────────────────────────────
describe('suspend and reinstate branch', () => {
  it('approved + suspend_payment => suspended', () => {
    expect(nextStatus('approved', 'suspend_payment')).toBe('suspended');
  });

  it('pm_review + suspend_payment => suspended', () => {
    expect(nextStatus('pm_review', 'suspend_payment')).toBe('suspended');
  });

  it('suspended + reinstate_payment => pm_review', () => {
    expect(nextStatus('suspended', 'reinstate_payment')).toBe('pm_review');
  });

  it('submitted cannot be suspended', () => {
    expect(nextStatus('submitted', 'suspend_payment')).toBeNull();
  });

  it('quantity_survey_review cannot be suspended', () => {
    expect(nextStatus('quantity_survey_review', 'suspend_payment')).toBeNull();
  });
});

// ─── Reject branch ────────────────────────────────────────────────────────────
describe('reject branch', () => {
  it('quantity_survey_review + reject_claim => rejected', () => {
    expect(nextStatus('quantity_survey_review', 'reject_claim')).toBe('rejected');
  });

  it('pm_review + reject_claim => rejected', () => {
    expect(nextStatus('pm_review', 'reject_claim')).toBe('rejected');
  });

  it('submitted cannot be rejected', () => {
    expect(nextStatus('submitted', 'reject_claim')).toBeNull();
  });

  it('engineer_certified cannot be rejected directly', () => {
    expect(nextStatus('engineer_certified', 'reject_claim')).toBeNull();
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

  it('final_account is a hard terminal', () => {
    expect(isHardTerminal('final_account')).toBe(true);
  });

  it('HARD_TERMINALS array has 3 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(3);
  });

  it('submitted is NOT a hard terminal', () => {
    expect(isHardTerminal('submitted')).toBe(false);
  });

  it('disputed is NOT a hard terminal', () => {
    expect(isHardTerminal('disputed')).toBe(false);
  });

  it('partial_payment is NOT a hard terminal', () => {
    expect(isHardTerminal('partial_payment')).toBe(false);
  });

  it('closed blocks all transitions', () => {
    expect(nextStatus('closed', 'commence_qs_review')).toBeNull();
    expect(nextStatus('closed', 'certify_by_engineer')).toBeNull();
    expect(nextStatus('closed', 'flag_overdue')).toBeNull();
  });

  it('rejected blocks all transitions', () => {
    expect(nextStatus('rejected', 'commence_qs_review')).toBeNull();
    expect(nextStatus('rejected', 'reject_claim')).toBeNull();
    expect(nextStatus('rejected', 'record_final_account')).toBeNull();
  });

  it('final_account blocks all transitions', () => {
    expect(nextStatus('final_account', 'record_final_account')).toBeNull();
    expect(nextStatus('final_account', 'close_claim')).toBeNull();
    expect(nextStatus('final_account', 'flag_overdue')).toBeNull();
  });
});

// ─── INVERTED SLA polarity ────────────────────────────────────────────────────
describe('INVERTED SLA polarity', () => {
  it('major = 720h (INVERTED — most time)', () => {
    expect(SLA_HOURS['major']).toBe(720);
  });

  it('significant = 336h', () => {
    expect(SLA_HOURS['significant']).toBe(336);
  });

  it('standard = 168h', () => {
    expect(SLA_HOURS['standard']).toBe(168);
  });

  it('minor = 72h (INVERTED — least time)', () => {
    expect(SLA_HOURS['minor']).toBe(72);
  });

  it('INVERTED polarity: major > significant > standard > minor', () => {
    const tiers: ClaimTier[] = ['major', 'significant', 'standard', 'minor'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(SLA_HOURS[tiers[i]]).toBeGreaterThan(SLA_HOURS[tiers[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 claim tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });

  it('slaDeadlineFor major = 720h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('major', from);
    expect(deadline.getTime()).toBe(from.getTime() + 720 * 3600 * 1000);
  });

  it('slaDeadlineFor significant = 336h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('significant', from);
    expect(deadline.getTime()).toBe(from.getTime() + 336 * 3600 * 1000);
  });

  it('slaDeadlineFor standard = 168h from now', () => {
    const from = new Date('2026-05-31T00:00:00Z');
    const deadline = slaDeadlineFor('standard', from);
    expect(deadline.getTime()).toBe(from.getTime() + 168 * 3600 * 1000);
  });

  it('slaDeadlineFor minor = 72h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('minor', from);
    expect(deadline.getTime()).toBe(from.getTime() + 72 * 3600 * 1000);
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

// ─── W141 SIGNATURE: crossesIntoRegulator ─────────────────────────────────────
describe('W141 SIGNATURE: crossesIntoRegulator', () => {
  // certify_by_engineer with floor_ie_milestone_payment — EVERY tier
  it('certify_by_engineer + floor_ie_milestone_payment=1 crosses', () => {
    expect(crossesIntoRegulator('certify_by_engineer', { floor_ie_milestone_payment: 1 })).toBe(true);
  });

  it('certify_by_engineer + floor_ie_milestone_payment=true crosses', () => {
    expect(crossesIntoRegulator('certify_by_engineer', { floor_ie_milestone_payment: true })).toBe(true);
  });

  it('certify_by_engineer WITHOUT floor_ie_milestone_payment does NOT cross', () => {
    expect(crossesIntoRegulator('certify_by_engineer', { floor_ie_milestone_payment: 0 })).toBe(false);
  });

  it('certify_by_engineer with undefined floor_ie_milestone_payment does NOT cross', () => {
    expect(crossesIntoRegulator('certify_by_engineer', {})).toBe(false);
  });

  // record_final_account — EVERY tier, always
  it('record_final_account always crosses (EVERY tier)', () => {
    expect(crossesIntoRegulator('record_final_account', {})).toBe(true);
  });

  it('record_final_account crosses even with no flags set', () => {
    expect(crossesIntoRegulator('record_final_account', {
      floor_ie_milestone_payment: 0,
      floor_lender_certification_required: 0,
    })).toBe(true);
  });

  it('record_final_account crosses regardless of other flags', () => {
    expect(crossesIntoRegulator('record_final_account', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(true);
  });

  // approve_payment with floor_lender_certification_required
  it('approve_payment + floor_lender_certification_required=1 crosses', () => {
    expect(crossesIntoRegulator('approve_payment', { floor_lender_certification_required: 1 })).toBe(true);
  });

  it('approve_payment + floor_lender_certification_required=true crosses', () => {
    expect(crossesIntoRegulator('approve_payment', { floor_lender_certification_required: true })).toBe(true);
  });

  it('approve_payment WITHOUT floor_lender_certification_required does NOT cross', () => {
    expect(crossesIntoRegulator('approve_payment', { floor_lender_certification_required: 0 })).toBe(false);
  });

  it('approve_payment with undefined flag does NOT cross', () => {
    expect(crossesIntoRegulator('approve_payment', {})).toBe(false);
  });

  // Other actions never cross
  it('commence_qs_review never crosses even with all flags', () => {
    expect(crossesIntoRegulator('commence_qs_review', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('complete_qs_review never crosses', () => {
    expect(crossesIntoRegulator('complete_qs_review', { floor_ie_milestone_payment: 1 })).toBe(false);
  });

  it('process_payment never crosses', () => {
    expect(crossesIntoRegulator('process_payment', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('close_claim never crosses even with all flags', () => {
    expect(crossesIntoRegulator('close_claim', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('dispute_claim never crosses', () => {
    expect(crossesIntoRegulator('dispute_claim', { floor_ie_milestone_payment: 1 })).toBe(false);
  });

  it('resolve_dispute never crosses', () => {
    expect(crossesIntoRegulator('resolve_dispute', { floor_lender_certification_required: 1 })).toBe(false);
  });

  it('suspend_payment never crosses', () => {
    expect(crossesIntoRegulator('suspend_payment', { floor_ie_milestone_payment: 1 })).toBe(false);
  });

  it('reinstate_payment never crosses', () => {
    expect(crossesIntoRegulator('reinstate_payment', { floor_lender_certification_required: 1 })).toBe(false);
  });

  it('reject_claim never crosses even with all flags', () => {
    expect(crossesIntoRegulator('reject_claim', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('approve_partial never crosses', () => {
    expect(crossesIntoRegulator('approve_partial', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('flag_overdue never crosses even with all flags', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('major + floor_ie_milestone_payment=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('major', { floor_ie_milestone_payment: 1 })).toBe(true);
  });

  it('significant + floor_ie_milestone_payment=1 crosses', () => {
    expect(slaBreachCrossesIntoRegulator('significant', { floor_ie_milestone_payment: 1 })).toBe(true);
  });

  it('standard + floor_ie_milestone_payment=1 does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('standard', { floor_ie_milestone_payment: 1 })).toBe(false);
  });

  it('minor + floor_ie_milestone_payment=1 does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('minor', { floor_ie_milestone_payment: 1 })).toBe(false);
  });

  it('major with no flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('major', {
      floor_ie_milestone_payment: 0,
      floor_lender_certification_required: 0,
    })).toBe(false);
  });

  it('significant + floor_lender_certification_required only does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('significant', { floor_lender_certification_required: 1 })).toBe(false);
  });

  it('major + undefined flags does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('major', {})).toBe(false);
  });

  it('minor with all flags does NOT cross (neither flag covers minor)', () => {
    expect(slaBreachCrossesIntoRegulator('minor', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });
});

// ─── statusTsCol: all 12 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[ClaimStatus, string]> = [
    ['submitted',              'submitted_at'],
    ['quantity_survey_review', 'quantity_survey_review_at'],
    ['pm_review',              'pm_review_at'],
    ['engineer_certified',     'engineer_certified_at'],
    ['approved',               'approved_at'],
    ['payment_processed',      'payment_processed_at'],
    ['closed',                 'closed_at'],
    ['disputed',               'disputed_at'],
    ['suspended',              'suspended_at'],
    ['rejected',               'rejected_at'],
    ['partial_payment',        'partial_payment_at'],
    ['final_account',          'final_account_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor: all 14 actions ─────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[ClaimAction, string]> = [
    ['commence_qs_review',    'ipp_progress_claim.commence_qs_review'],
    ['complete_qs_review',    'ipp_progress_claim.complete_qs_review'],
    ['certify_by_engineer',   'ipp_progress_claim.certify_by_engineer'],
    ['approve_payment',       'ipp_progress_claim.approve_payment'],
    ['process_payment',       'ipp_progress_claim.process_payment'],
    ['close_claim',           'ipp_progress_claim.close_claim'],
    ['dispute_claim',         'ipp_progress_claim.dispute_claim'],
    ['resolve_dispute',       'ipp_progress_claim.resolve_dispute'],
    ['suspend_payment',       'ipp_progress_claim.suspend_payment'],
    ['reinstate_payment',     'ipp_progress_claim.reinstate_payment'],
    ['reject_claim',          'ipp_progress_claim.reject_claim'],
    ['approve_partial',       'ipp_progress_claim.approve_partial'],
    ['record_final_account',  'ipp_progress_claim.record_final_account'],
    ['flag_overdue',          'ipp_progress_claim.flag_overdue'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 14 actions are mapped', () => {
    expect(cases).toHaveLength(14);
  });
});

// ─── formatZar ────────────────────────────────────────────────────────────────
describe('formatZar', () => {
  it('formats a large number correctly', () => {
    // en-ZA locale uses narrow no-break space (U+202F) as thousands separator in some
    // Node versions; strip all whitespace variants before asserting content.
    const result = formatZar(4500000).replace(/\s/g, ' ');
    expect(result).toBe('R 4 500 000');
  });

  it('formats zero', () => {
    expect(formatZar(0)).toBe('R 0');
  });

  it('returns — for null', () => {
    expect(formatZar(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatZar(undefined)).toBe('—');
  });
});

// ─── CLAIM_TIER_LABELS ────────────────────────────────────────────────────────
describe('CLAIM_TIER_LABELS', () => {
  it('has 4 tier labels', () => {
    expect(Object.keys(CLAIM_TIER_LABELS)).toHaveLength(4);
  });

  it('major = Major (>R10m)', () => {
    expect(CLAIM_TIER_LABELS['major']).toBe('Major (>R10m)');
  });

  it('significant = Significant (R1m–R10m)', () => {
    expect(CLAIM_TIER_LABELS['significant']).toBe('Significant (R1m–R10m)');
  });

  it('standard = Standard (R100k–R1m)', () => {
    expect(CLAIM_TIER_LABELS['standard']).toBe('Standard (R100k–R1m)');
  });

  it('minor = Minor (<R100k)', () => {
    expect(CLAIM_TIER_LABELS['minor']).toBe('Minor (<R100k)');
  });
});

// ─── CLAIM_TYPE_LABELS ────────────────────────────────────────────────────────
describe('CLAIM_TYPE_LABELS', () => {
  it('has 5 type labels', () => {
    expect(Object.keys(CLAIM_TYPE_LABELS)).toHaveLength(5);
  });

  it('interim = Interim payment', () => {
    expect(CLAIM_TYPE_LABELS['interim']).toBe('Interim payment');
  });

  it('milestone = Milestone payment', () => {
    expect(CLAIM_TYPE_LABELS['milestone']).toBe('Milestone payment');
  });

  it('final = Final account', () => {
    expect(CLAIM_TYPE_LABELS['final']).toBe('Final account');
  });

  it('variation = Variation order', () => {
    expect(CLAIM_TYPE_LABELS['variation']).toBe('Variation order');
  });

  it('daywork = Daywork', () => {
    expect(CLAIM_TYPE_LABELS['daywork']).toBe('Daywork');
  });
});

// ─── TRANSITIONS record completeness ──────────────────────────────────────────
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

  it('close_claim has 2 from-states (payment_processed + partial_payment)', () => {
    expect(TRANSITIONS['close_claim'].from).toContain('payment_processed');
    expect(TRANSITIONS['close_claim'].from).toContain('partial_payment');
    expect(TRANSITIONS['close_claim'].from).toHaveLength(2);
  });

  it('dispute_claim has 2 from-states (pm_review + engineer_certified)', () => {
    expect(TRANSITIONS['dispute_claim'].from).toContain('pm_review');
    expect(TRANSITIONS['dispute_claim'].from).toContain('engineer_certified');
    expect(TRANSITIONS['dispute_claim'].from).toHaveLength(2);
  });

  it('approve_partial has 2 from-states (engineer_certified + pm_review)', () => {
    expect(TRANSITIONS['approve_partial'].from).toContain('engineer_certified');
    expect(TRANSITIONS['approve_partial'].from).toContain('pm_review');
  });

  it('suspend_payment has 2 from-states (approved + pm_review)', () => {
    expect(TRANSITIONS['suspend_payment'].from).toContain('approved');
    expect(TRANSITIONS['suspend_payment'].from).toContain('pm_review');
  });

  it('reject_claim has 2 from-states (quantity_survey_review + pm_review)', () => {
    expect(TRANSITIONS['reject_claim'].from).toContain('quantity_survey_review');
    expect(TRANSITIONS['reject_claim'].from).toContain('pm_review');
  });

  it('record_final_account has 1 from-state (closed only)', () => {
    expect(TRANSITIONS['record_final_account'].from).toHaveLength(1);
    expect(TRANSITIONS['record_final_account'].from).toContain('closed');
  });

  it('reinstate_payment has 1 from-state (suspended only)', () => {
    expect(TRANSITIONS['reinstate_payment'].from).toHaveLength(1);
    expect(TRANSITIONS['reinstate_payment'].from).toContain('suspended');
  });
});

// ─── flag_overdue cron action ──────────────────────────────────────────────────
describe('flag_overdue cron action', () => {
  const openStates: ClaimStatus[] = [
    'submitted', 'quantity_survey_review', 'pm_review', 'engineer_certified',
    'approved', 'disputed', 'suspended',
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

  it('flag_overdue from final_account (terminal) returns null', () => {
    expect(nextStatus('final_account', 'flag_overdue')).toBeNull();
  });

  it('flag_overdue does not cross into regulator', () => {
    expect(crossesIntoRegulator('flag_overdue', {
      floor_ie_milestone_payment: 1,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('7 open states covered by flag_overdue', () => {
    expect(openStates).toHaveLength(7);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('submitted', 'invalid_action' as ClaimAction)).toBeNull();
  });

  it('step-skip enforced: submitted cannot jump to pm_review', () => {
    expect(nextStatus('submitted', 'complete_qs_review')).toBeNull();
  });

  it('step-skip enforced: submitted cannot certify', () => {
    expect(nextStatus('submitted', 'certify_by_engineer')).toBeNull();
  });

  it('step-skip enforced: quantity_survey_review cannot certify directly', () => {
    expect(nextStatus('quantity_survey_review', 'certify_by_engineer')).toBeNull();
  });

  it('INVERTED polarity consistency: major has strictly more hours than minor', () => {
    expect(SLA_HOURS.major).toBeGreaterThan(SLA_HOURS.significant);
    expect(SLA_HOURS.significant).toBeGreaterThan(SLA_HOURS.standard);
    expect(SLA_HOURS.standard).toBeGreaterThan(SLA_HOURS.minor);
  });

  it('payment_processed cannot be disputed', () => {
    expect(nextStatus('payment_processed', 'dispute_claim')).toBeNull();
  });

  it('engineer_certified has two paths: approve_payment OR dispute OR partial', () => {
    expect(nextStatus('engineer_certified', 'approve_payment')).toBe('approved');
    expect(nextStatus('engineer_certified', 'dispute_claim')).toBe('disputed');
    expect(nextStatus('engineer_certified', 'approve_partial')).toBe('partial_payment');
  });

  it('pm_review has multiple paths', () => {
    expect(nextStatus('pm_review', 'certify_by_engineer')).toBe('engineer_certified');
    expect(nextStatus('pm_review', 'dispute_claim')).toBe('disputed');
    expect(nextStatus('pm_review', 'reject_claim')).toBe('rejected');
    expect(nextStatus('pm_review', 'approve_partial')).toBe('partial_payment');
    expect(nextStatus('pm_review', 'suspend_payment')).toBe('suspended');
  });

  it('certify_by_engineer without ie_milestone does NOT cross even with lender_cert', () => {
    expect(crossesIntoRegulator('certify_by_engineer', {
      floor_ie_milestone_payment: 0,
      floor_lender_certification_required: 1,
    })).toBe(false);
  });

  it('slaBreachCrossesIntoRegulator: standard + ie_milestone does NOT cross (only major+significant)', () => {
    expect(slaBreachCrossesIntoRegulator('standard', { floor_ie_milestone_payment: 1 })).toBe(false);
  });

  it('partial_payment cannot be suspended', () => {
    expect(nextStatus('partial_payment', 'suspend_payment')).toBeNull();
  });
});
