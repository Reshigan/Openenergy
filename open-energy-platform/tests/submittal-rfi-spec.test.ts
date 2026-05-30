// Wave 96 — IPP Submittal & RFI register spec tests.
import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  RESPONSE_MINUTES,
  nextStatus,
  allowedActions,
  isTerminal,
  isVoidable,
  isWorkflowClass,
  isPriorityClass,
  isTier,
  tierRank,
  isHighTier,
  tierFromInputs,
  ballInCourtFor,
  slaDeadlineFor,
  responseDeadlineFor,
  isReportable,
  actionCrossesRegulator,
  authorityFor,
  urgencyBandFor,
  ippPmQualityIndex,
  predictedCloseDate,
  supersedeChainDepth,
} from '../src/utils/submittal-rfi-spec';

describe('W96 Submittal+RFI — state machine', () => {
  it('clean forward path drafted → submitted → distributed → under_review → responded → approved → distributed_for_construction → incorporated → closed_clean', () => {
    expect(nextStatus('drafted', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'distribute')).toBe('distributed');
    expect(nextStatus('distributed', 'start_review')).toBe('under_review');
    expect(nextStatus('under_review', 'respond')).toBe('responded');
    expect(nextStatus('responded', 'approve')).toBe('approved');
    expect(nextStatus('approved', 'distribute_for_construction')).toBe('distributed_for_construction');
    expect(nextStatus('distributed_for_construction', 'incorporate')).toBe('incorporated');
    expect(nextStatus('incorporated', 'close')).toBe('closed_clean');
  });

  it('clarification branch loops back to under_review', () => {
    expect(nextStatus('under_review', 'request_clarification')).toBe('clarification_requested');
    expect(nextStatus('clarification_requested', 'provide_clarification')).toBe('under_review');
  });

  it('return_for_revision branch rejoins via revised → distributed', () => {
    expect(nextStatus('under_review', 'return_for_revision')).toBe('returned_for_revision');
    expect(nextStatus('responded', 'return_for_revision')).toBe('returned_for_revision');
    expect(nextStatus('returned_for_revision', 'resubmit')).toBe('revised');
    expect(nextStatus('revised', 'distribute')).toBe('distributed');
  });

  it('void terminal reachable from active states', () => {
    expect(nextStatus('drafted', 'void')).toBe('voided');
    expect(nextStatus('under_review', 'void')).toBe('voided');
    expect(nextStatus('approved', 'void')).toBe('voided');
    expect(nextStatus('distributed_for_construction', 'void')).toBe('voided');
  });

  it('withdraw terminal reachable only from author-court states', () => {
    expect(nextStatus('drafted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('returned_for_revision', 'withdraw')).toBe('withdrawn');
    // Withdraw should not be possible from review-side states.
    expect(nextStatus('under_review', 'withdraw')).toBe(null);
    expect(nextStatus('approved', 'withdraw')).toBe(null);
  });

  it('terminals stop the machine', () => {
    expect(isTerminal('closed_clean')).toBe(true);
    expect(isTerminal('voided')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(allowedActions('closed_clean')).toEqual([]);
    expect(allowedActions('voided')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('all non-terminal states allow void EXCEPT incorporated (locked in for IE handover)', () => {
    expect(isVoidable('drafted')).toBe(true);
    expect(isVoidable('approved')).toBe(true);
    expect(isVoidable('distributed_for_construction')).toBe(true);
    expect(isVoidable('incorporated')).toBe(false);
  });
});

describe('W96 Submittal+RFI — workflow class / priority / tier', () => {
  it('valid workflow classes', () => {
    expect(isWorkflowClass('submittal_design')).toBe(true);
    expect(isWorkflowClass('rfi_field_condition')).toBe(true);
    expect(isWorkflowClass('rfi_substitution_request')).toBe(true);
    expect(isWorkflowClass('something_else')).toBe(false);
  });

  it('valid priority classes', () => {
    expect(isPriorityClass('critical')).toBe(true);
    expect(isPriorityClass('low')).toBe(true);
    expect(isPriorityClass('nuke')).toBe(false);
  });

  it('tier order low < standard < high < critical', () => {
    expect(tierRank('low')).toBeLessThan(tierRank('standard'));
    expect(tierRank('standard')).toBeLessThan(tierRank('high'));
    expect(tierRank('high')).toBeLessThan(tierRank('critical'));
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('high')).toBe(true);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('low')).toBe(false);
  });

  it('priority drives tier when no special flags', () => {
    expect(tierFromInputs({
      priorityClass: 'critical',
      workflowClass: 'submittal_design',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('critical');
    expect(tierFromInputs({
      priorityClass: 'low',
      workflowClass: 'submittal_product_data',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('low');
  });

  it('rfi_field_condition with standard priority gets bumped to high', () => {
    expect(tierFromInputs({
      priorityClass: 'standard',
      workflowClass: 'rfi_field_condition',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('high');
  });

  it('substitution_request with low priority gets bumped to standard', () => {
    expect(tierFromInputs({
      priorityClass: 'low',
      workflowClass: 'rfi_substitution_request',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('standard');
  });

  it('FLOOR-AT-HIGH for affects_grid_code', () => {
    expect(tierFromInputs({
      priorityClass: 'low',
      workflowClass: 'submittal_product_data',
      affectsGridCode: true, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH for affects_life_safety', () => {
    expect(tierFromInputs({
      priorityClass: 'standard',
      workflowClass: 'submittal_design',
      affectsGridCode: false, affectsLifeSafety: true,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH for affects_bid_envelope', () => {
    expect(tierFromInputs({
      priorityClass: 'low',
      workflowClass: 'submittal_design',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: true, holdsConstruction: false,
    })).toBe('high');
  });

  it('FLOOR-AT-HIGH for holds_construction', () => {
    expect(tierFromInputs({
      priorityClass: 'low',
      workflowClass: 'submittal_design',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: true,
    })).toBe('high');
  });

  it('critical priority stays critical even without floor flags', () => {
    expect(tierFromInputs({
      priorityClass: 'critical',
      workflowClass: 'submittal_product_data',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe('critical');
  });
});

describe('W96 Submittal+RFI — ball-in-court tracking', () => {
  it('drafted: author', () => {
    expect(ballInCourtFor('drafted')).toBe('author');
  });
  it('submitted: coordinator', () => {
    expect(ballInCourtFor('submitted')).toBe('coordinator');
  });
  it('under_review: reviewer', () => {
    expect(ballInCourtFor('under_review')).toBe('reviewer');
  });
  it('clarification_requested: author (ball back)', () => {
    expect(ballInCourtFor('clarification_requested')).toBe('author');
  });
  it('responded: owner (final approval gate)', () => {
    expect(ballInCourtFor('responded')).toBe('owner');
  });
  it('returned_for_revision: author (ball back)', () => {
    expect(ballInCourtFor('returned_for_revision')).toBe('author');
  });
  it('distributed_for_construction: contractor', () => {
    expect(ballInCourtFor('distributed_for_construction')).toBe('contractor');
  });
  it('incorporated: independent_engineer (IE close-out witness)', () => {
    expect(ballInCourtFor('incorporated')).toBe('independent_engineer');
  });
  it('terminals: no ball-in-court', () => {
    expect(ballInCourtFor('closed_clean')).toBe(null);
    expect(ballInCourtFor('voided')).toBe(null);
    expect(ballInCourtFor('withdrawn')).toBe(null);
  });
});

describe('W96 Submittal+RFI — URGENT SLA polarity (tighter at higher tier)', () => {
  it('every active state: critical < high < standard < low (strict monotone)', () => {
    const ACTIVE_STATES = [
      'drafted', 'submitted', 'distributed', 'under_review',
      'clarification_requested', 'responded', 'approved',
      'returned_for_revision', 'revised',
      'distributed_for_construction', 'incorporated',
    ] as const;
    for (const s of ACTIVE_STATES) {
      const row = SLA_MINUTES[s];
      expect(row.critical).toBeLessThanOrEqual(row.high);
      expect(row.high).toBeLessThanOrEqual(row.standard);
      expect(row.standard).toBeLessThanOrEqual(row.low);
    }
  });

  it('response window decreases monotonically with tier', () => {
    expect(RESPONSE_MINUTES.critical).toBeLessThan(RESPONSE_MINUTES.high);
    expect(RESPONSE_MINUTES.high).toBeLessThan(RESPONSE_MINUTES.standard);
    expect(RESPONSE_MINUTES.standard).toBeLessThan(RESPONSE_MINUTES.low);
  });

  it('terminals carry 0 SLA', () => {
    expect(SLA_MINUTES.closed_clean.critical).toBe(0);
    expect(SLA_MINUTES.voided.high).toBe(0);
    expect(SLA_MINUTES.withdrawn.low).toBe(0);
    expect(slaDeadlineFor('closed_clean', 'critical', new Date())).toBe(null);
  });

  it('slaDeadlineFor returns a future Date for active states', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    const d = slaDeadlineFor('under_review', 'critical', now);
    expect(d).not.toBe(null);
    expect(d!.getTime() - now.getTime()).toBe(SLA_MINUTES.under_review.critical * 60_000);
  });

  it('responseDeadlineFor critical = +4h', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    const d = responseDeadlineFor('critical', now);
    expect(d.getTime() - now.getTime()).toBe(4 * 60 * 60_000);
  });
});

describe('W96 Submittal+RFI — reportability (W96 SIGNATURE)', () => {
  it('SIGNATURE: approve crosses regulator EVERY tier when affects_grid_code', () => {
    for (const t of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'approve', tier: t,
        affectsGridCode: true, affectsLifeSafety: false,
        affectsBidEnvelope: false, holdsConstruction: false,
      })).toBe(true);
    }
  });

  it('SIGNATURE: approve crosses regulator EVERY tier when affects_bid_envelope', () => {
    for (const t of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'approve', tier: t,
        affectsGridCode: false, affectsLifeSafety: false,
        affectsBidEnvelope: true, holdsConstruction: false,
      })).toBe(true);
    }
  });

  it('SIGNATURE: void crosses regulator EVERY tier when affects_grid_code OR affects_life_safety', () => {
    for (const t of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'void', tier: t,
        affectsGridCode: true, affectsLifeSafety: false,
        affectsBidEnvelope: false, holdsConstruction: false,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'void', tier: t,
        affectsGridCode: false, affectsLifeSafety: true,
        affectsBidEnvelope: false, holdsConstruction: false,
      })).toBe(true);
    }
  });

  it('approve without flags does NOT cross regulator', () => {
    expect(actionCrossesRegulator({
      action: 'approve', tier: 'critical',
      affectsGridCode: false, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe(false);
  });

  it('distribute_for_construction crosses regulator on high+critical with grid_code', () => {
    expect(actionCrossesRegulator({
      action: 'distribute_for_construction', tier: 'critical',
      affectsGridCode: true, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'distribute_for_construction', tier: 'low',
      affectsGridCode: true, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe(false);
  });

  it('return_for_revision: critical+grid_code crosses, standard does not', () => {
    expect(actionCrossesRegulator({
      action: 'return_for_revision', tier: 'critical',
      affectsGridCode: true, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe(true);
    expect(actionCrossesRegulator({
      action: 'return_for_revision', tier: 'standard',
      affectsGridCode: true, affectsLifeSafety: false,
      affectsBidEnvelope: false, holdsConstruction: false,
    })).toBe(false);
  });

  it('isReportable: high + critical only', () => {
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('high')).toBe(true);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('low')).toBe(false);
  });

  it('non-crossing actions stay quiet', () => {
    expect(actionCrossesRegulator({
      action: 'start_review', tier: 'critical',
      affectsGridCode: true, affectsLifeSafety: true,
      affectsBidEnvelope: true, holdsConstruction: true,
    })).toBe(false);
    expect(actionCrossesRegulator({
      action: 'submit', tier: 'critical',
      affectsGridCode: true, affectsLifeSafety: true,
      affectsBidEnvelope: true, holdsConstruction: true,
    })).toBe(false);
  });
});

describe('W96 Submittal+RFI — authority ladder', () => {
  it('authority ladder rises with tier', () => {
    expect(authorityFor('low')).toBe('construction_coordinator');
    expect(authorityFor('standard')).toBe('lead_engineer');
    expect(authorityFor('high')).toBe('project_manager');
    expect(authorityFor('critical')).toBe('project_director');
  });
});

describe('W96 Submittal+RFI — live battery helpers', () => {
  it('urgencyBandFor: terminal → green', () => {
    expect(urgencyBandFor(null, true)).toBe('green');
    expect(urgencyBandFor(99999, true)).toBe('green');
  });
  it('urgencyBandFor: breached → red', () => {
    expect(urgencyBandFor(-5, false)).toBe('red');
  });
  it('urgencyBandFor: < 24h → red; 24-72h → amber; > 72h → green', () => {
    expect(urgencyBandFor(60, false)).toBe('red');     // 1h
    expect(urgencyBandFor(1400, false)).toBe('red');   // 23h
    expect(urgencyBandFor(2000, false)).toBe('amber'); // 33h
    expect(urgencyBandFor(5000, false)).toBe('green'); // 83h
  });

  it('ippPmQualityIndex: parity case = 100', () => {
    expect(ippPmQualityIndex({
      responseWithinSla: true, closeWithinSla: true,
      revisionCount: 0, ballInCourtClear: true, bidEnvelopeDriftPct: 0.5,
    })).toBe(100);
  });

  it('ippPmQualityIndex: worst case = 0', () => {
    expect(ippPmQualityIndex({
      responseWithinSla: false, closeWithinSla: false,
      revisionCount: 5, ballInCourtClear: false, bidEnvelopeDriftPct: 8,
    })).toBe(0);
  });

  it('ippPmQualityIndex: bid_envelope drift below 1% boosts +10', () => {
    const a = ippPmQualityIndex({
      responseWithinSla: true, closeWithinSla: true,
      revisionCount: 0, ballInCourtClear: true, bidEnvelopeDriftPct: 0.5,
    });
    const b = ippPmQualityIndex({
      responseWithinSla: true, closeWithinSla: true,
      revisionCount: 0, ballInCourtClear: true, bidEnvelopeDriftPct: 5.0,
    });
    expect(a - b).toBe(10);
  });

  it('predictedCloseDate: returns a future date for active state', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    const d = predictedCloseDate('drafted', 'standard', now);
    expect(d).not.toBe(null);
    expect(d!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('predictedCloseDate: null for terminal', () => {
    expect(predictedCloseDate('closed_clean', 'critical', new Date())).toBe(null);
  });

  it('supersedeChainDepth: clamps to >=0', () => {
    expect(supersedeChainDepth(0)).toBe(0);
    expect(supersedeChainDepth(3)).toBe(3);
    expect(supersedeChainDepth(-2)).toBe(0);
  });
});

describe('W96 Submittal+RFI — TRANSITIONS export shape', () => {
  it('exposes a transition map for every status', () => {
    const expected = [
      'drafted', 'submitted', 'distributed', 'under_review',
      'clarification_requested', 'responded', 'approved',
      'returned_for_revision', 'revised',
      'distributed_for_construction', 'incorporated',
      'closed_clean', 'voided', 'withdrawn',
    ] as const;
    for (const s of expected) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('isTier validator', () => {
    expect(isTier('critical')).toBe(true);
    expect(isTier('low')).toBe(true);
    expect(isTier('nuke')).toBe(false);
  });
});
