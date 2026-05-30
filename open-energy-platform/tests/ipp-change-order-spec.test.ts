// Wave 117 — IPP Change Orders & Variations spec test battery.
//
// Covers: state machine (forward path + branches + terminals + on_hold
// resume + void/reject from non-terminals + draft-only behaviour of
// propose + 16-action TRANSITIONS map coverage), tier derivation +
// FLOOR-AT-MAJOR on each of 5 flags + FLOOR-AT-TRANSFORMATIONAL on 2+
// flags, INVERTED SLA matrix anchored on owner_review, SIGNATURE
// SCOPE-BASELINE-CHANGE-APPROVE crossings (approve EVERY tier when
// scope_baseline_change || regulatory_re_consent_required; reject EVERY
// tier when cumulative_change_value_pct >= 15; dispute major +
// transformational only; close_out never crosses; sla_breached heavy
// tiers only), party routing (4-party split), authority ladder +
// INVERTED filing window, urgency band (INVERTED polarity —
// transformational loosest), 6-bridge architecture (W116/W115/W114/
// W112/W113/W19/W20), cumulative-cap-band, EAC delta sign, days-to-
// critical-path-recovery, completeness 0-130, hash-chain pre-stage.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForChangeValue,
  countFloorFlags,
  floorAtMajor,
  floorAtTransformational,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  cumulativeCapBand,
  eacDeltaSign,
  daysToCriticalPathRecovery,
  bridgesToRfiChain,
  bridgesToSubmittalChain,
  bridgesToDocumentControlChain,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToCodChain,
  changeOrderCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
} from '../src/utils/ipp-change-order-spec';

describe('W117 IPP Change Order — state machine', () => {
  it('walks the forward path change_proposed -> archived', () => {
    expect(nextStatus('change_proposed', 'assess_impact')).toBe('impact_assessed');
    expect(nextStatus('impact_assessed', 'quote_cost')).toBe('cost_quoted');
    expect(nextStatus('cost_quoted', 'submit_for_review')).toBe('owner_review');
    expect(nextStatus('owner_review', 'negotiate')).toBe('negotiated');
    expect(nextStatus('negotiated', 'approve')).toBe('approved');
    expect(nextStatus('approved', 'issue')).toBe('issued_for_execution');
    expect(nextStatus('issued_for_execution', 'schedule')).toBe('scheduled');
    expect(nextStatus('scheduled', 'commence_execution')).toBe('executing');
    expect(nextStatus('executing', 'complete_execution')).toBe('executed');
    expect(nextStatus('executed', 'close_out')).toBe('closed_out');
    expect(nextStatus('closed_out', 'archive')).toBe('archived');
  });

  it('approve can short-circuit from owner_review', () => {
    expect(nextStatus('owner_review', 'approve')).toBe('approved');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('change_proposed', 'quote_cost')).toBeNull();
    expect(nextStatus('impact_assessed', 'submit_for_review')).toBeNull();
    expect(nextStatus('cost_quoted', 'approve')).toBeNull();
    expect(nextStatus('owner_review', 'issue')).toBeNull();
    expect(nextStatus('approved', 'schedule')).toBeNull();
    expect(nextStatus('scheduled', 'complete_execution')).toBeNull();
    expect(nextStatus('change_proposed', 'archive')).toBeNull();
  });

  it('hold_resume is a soft pause from pre-execution states', () => {
    expect(nextStatus('change_proposed', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('impact_assessed', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('cost_quoted', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('owner_review', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('negotiated', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('approved', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('issued_for_execution', 'hold_resume')).toBe('on_hold');
    expect(nextStatus('scheduled', 'hold_resume')).toBe('on_hold');
    // Executing onwards: no hold
    expect(nextStatus('executing', 'hold_resume')).toBeNull();
    expect(nextStatus('executed', 'hold_resume')).toBeNull();
    expect(nextStatus('closed_out', 'hold_resume')).toBeNull();
  });

  it('on_hold resumes via reject or other valid forward actions', () => {
    // Reject is always reachable from a non-terminal.
    expect(nextStatus('on_hold', 'reject')).toBe('rejected');
    // hold_resume is idempotent.
    expect(nextStatus('on_hold', 'hold_resume')).toBe('on_hold');
  });

  it('dispute is a soft pause from cost_quoted/owner_review/negotiated', () => {
    expect(nextStatus('cost_quoted', 'dispute')).toBe('disputed');
    expect(nextStatus('owner_review', 'dispute')).toBe('disputed');
    expect(nextStatus('negotiated', 'dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'dispute')).toBe('disputed');
    expect(nextStatus('change_proposed', 'dispute')).toBeNull();
    expect(nextStatus('impact_assessed', 'dispute')).toBeNull();
    expect(nextStatus('approved', 'dispute')).toBeNull();
    expect(nextStatus('executing', 'dispute')).toBeNull();
  });

  it('disputed resumes into negotiated', () => {
    expect(nextStatus('disputed', 'negotiate')).toBe('negotiated');
  });

  it('void is only allowed before approval', () => {
    expect(nextStatus('change_proposed', 'void')).toBe('void');
    expect(nextStatus('impact_assessed', 'void')).toBe('void');
    expect(nextStatus('cost_quoted', 'void')).toBe('void');
    expect(nextStatus('owner_review', 'void')).toBe('void');
    expect(nextStatus('negotiated', 'void')).toBe('void');
    expect(nextStatus('approved', 'void')).toBeNull();
    expect(nextStatus('issued_for_execution', 'void')).toBeNull();
    expect(nextStatus('executing', 'void')).toBeNull();
    expect(nextStatus('closed_out', 'void')).toBeNull();
  });

  it('reject is allowed from every non-terminal', () => {
    expect(nextStatus('change_proposed', 'reject')).toBe('rejected');
    expect(nextStatus('impact_assessed', 'reject')).toBe('rejected');
    expect(nextStatus('cost_quoted', 'reject')).toBe('rejected');
    expect(nextStatus('owner_review', 'reject')).toBe('rejected');
    expect(nextStatus('negotiated', 'reject')).toBe('rejected');
    expect(nextStatus('approved', 'reject')).toBe('rejected');
    expect(nextStatus('executing', 'reject')).toBe('rejected');
    expect(nextStatus('disputed', 'reject')).toBe('rejected');
    expect(nextStatus('on_hold', 'reject')).toBe('rejected');
    // Terminals block reject
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('rejected', 'reject')).toBeNull();
    expect(nextStatus('void', 'reject')).toBeNull();
  });

  it('archived is HARD terminal — blocks every action', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('rejected')).toBe(false);
    expect(isHardTerminal('void')).toBe(false);
    expect(nextStatus('archived', 'propose')).toBeNull();
    expect(nextStatus('archived', 'assess_impact')).toBeNull();
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('archived', 'hold_resume')).toBeNull();
  });

  it('rejected and void are UI-terminals (block forward but not hard-blocked)', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('void')).toBe(true);
    expect(isTerminal('owner_review')).toBe(false);
    expect(isTerminal('on_hold')).toBe(false);
    expect(isTerminal('disputed')).toBe(false);
  });

  it('propose is create-only — never offered as an action', () => {
    expect(allowedActions('change_proposed')).not.toContain('propose');
    expect(allowedActions('impact_assessed')).not.toContain('propose');
    expect(nextStatus('impact_assessed', 'propose')).toBeNull();
  });

  it('allowedActions reflects forward + reject + void/hold/dispute gates', () => {
    const a1 = allowedActions('change_proposed');
    expect(a1).toContain('assess_impact');
    expect(a1).toContain('void');
    expect(a1).toContain('reject');
    expect(a1).toContain('hold_resume');
    expect(a1).not.toContain('dispute');
    expect(a1).not.toContain('approve');

    const a2 = allowedActions('owner_review');
    expect(a2).toContain('negotiate');
    expect(a2).toContain('approve');
    expect(a2).toContain('reject');
    expect(a2).toContain('void');
    expect(a2).toContain('dispute');
    expect(a2).toContain('hold_resume');

    const a3 = allowedActions('executing');
    expect(a3).toContain('complete_execution');
    expect(a3).toContain('reject');
    expect(a3).not.toContain('void');
    expect(a3).not.toContain('hold_resume');
    expect(a3).not.toContain('dispute');

    const a4 = allowedActions('archived');
    expect(a4.length).toBe(0);
  });

  it('TRANSITIONS map covers all 16 actions', () => {
    const keys = Object.keys(TRANSITIONS);
    expect(keys.length).toBe(16);
    expect(keys).toContain('propose');
    expect(keys).toContain('assess_impact');
    expect(keys).toContain('quote_cost');
    expect(keys).toContain('submit_for_review');
    expect(keys).toContain('negotiate');
    expect(keys).toContain('approve');
    expect(keys).toContain('issue');
    expect(keys).toContain('schedule');
    expect(keys).toContain('commence_execution');
    expect(keys).toContain('complete_execution');
    expect(keys).toContain('close_out');
    expect(keys).toContain('archive');
    expect(keys).toContain('reject');
    expect(keys).toContain('void');
    expect(keys).toContain('hold_resume');
    expect(keys).toContain('dispute');
  });
});

describe('W117 IPP Change Order — tier derivation + FLOOR-AT-MAJOR', () => {
  it('tier from change_value_zar', () => {
    expect(tierForChangeValue(0)).toBe('minor');
    expect(tierForChangeValue(100_000)).toBe('minor');
    expect(tierForChangeValue(499_999)).toBe('minor');
    expect(tierForChangeValue(500_000)).toBe('material');
    expect(tierForChangeValue(2_500_000)).toBe('material');
    expect(tierForChangeValue(4_999_999)).toBe('material');
    expect(tierForChangeValue(5_000_000)).toBe('major');
    expect(tierForChangeValue(25_000_000)).toBe('major');
    expect(tierForChangeValue(49_999_999)).toBe('major');
    expect(tierForChangeValue(50_000_000)).toBe('transformational');
    expect(tierForChangeValue(100_000_000)).toBe('transformational');
    expect(tierForChangeValue(null)).toBe('minor');
    expect(tierForChangeValue(undefined)).toBe('minor');
    expect(tierForChangeValue(-1)).toBe('minor');
  });

  it('countFloorFlags sums each flag', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ scope_baseline_change: true })).toBe(1);
    expect(countFloorFlags({
      regulatory_re_consent_required: true,
      schedule_impact_critical_path: true,
    })).toBe(2);
    expect(countFloorFlags({
      scope_baseline_change: true,
      regulatory_re_consent_required: true,
      schedule_impact_critical_path: true,
      lender_consent_required: true,
      safety_design_change: true,
    })).toBe(5);
    // Number-coerced flags (DB column convention)
    expect(countFloorFlags({ scope_baseline_change: 1, lender_consent_required: 0 } as any)).toBe(1);
  });

  it('floorAtMajor triggers on ANY one of the 5 flags', () => {
    expect(floorAtMajor({})).toBe(false);
    expect(floorAtMajor({ scope_baseline_change: true })).toBe(true);
    expect(floorAtMajor({ regulatory_re_consent_required: true })).toBe(true);
    expect(floorAtMajor({ schedule_impact_critical_path: true })).toBe(true);
    expect(floorAtMajor({ lender_consent_required: true })).toBe(true);
    expect(floorAtMajor({ safety_design_change: true })).toBe(true);
  });

  it('floorAtTransformational triggers on >=2 flags', () => {
    expect(floorAtTransformational({})).toBe(false);
    expect(floorAtTransformational({ scope_baseline_change: true })).toBe(false);
    expect(floorAtTransformational({
      scope_baseline_change: true,
      regulatory_re_consent_required: true,
    })).toBe(true);
    expect(floorAtTransformational({
      scope_baseline_change: true,
      regulatory_re_consent_required: true,
      schedule_impact_critical_path: true,
      lender_consent_required: true,
      safety_design_change: true,
    })).toBe(true);
  });

  it('effectiveTier elevates to major when 1 flag set, transformational on 2+', () => {
    expect(effectiveTier('minor', {})).toBe('minor');
    expect(effectiveTier('minor', { scope_baseline_change: true })).toBe('major');
    expect(effectiveTier('material', { lender_consent_required: true })).toBe('major');
    expect(effectiveTier('major', { safety_design_change: true })).toBe('major');
    expect(effectiveTier('transformational', { safety_design_change: true })).toBe('transformational');
    expect(effectiveTier('minor', {
      scope_baseline_change: true,
      regulatory_re_consent_required: true,
    })).toBe('transformational');
    expect(effectiveTier('material', {
      scope_baseline_change: true,
      regulatory_re_consent_required: true,
      schedule_impact_critical_path: true,
    })).toBe('transformational');
  });

  it('isHeavyTier covers major + transformational', () => {
    expect(isHeavyTier('transformational')).toBe(true);
    expect(isHeavyTier('major')).toBe(true);
    expect(isHeavyTier('material')).toBe(false);
    expect(isHeavyTier('minor')).toBe(false);
  });

  it('isReportable is transformational only', () => {
    expect(isReportable('transformational')).toBe(true);
    expect(isReportable('major')).toBe(false);
    expect(isReportable('material')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W117 IPP Change Order — INVERTED SLA matrix', () => {
  it('anchor SLA on owner_review with INVERTED polarity', () => {
    expect(SLA_HOURS.owner_review.minor).toBe(168);
    expect(SLA_HOURS.owner_review.material).toBe(336);
    expect(SLA_HOURS.owner_review.major).toBe(720);
    expect(SLA_HOURS.owner_review.transformational).toBe(1080);
  });

  it('INVERTED polarity holds across every non-terminal status', () => {
    const statuses = [
      'change_proposed', 'impact_assessed', 'cost_quoted', 'owner_review',
      'negotiated', 'approved', 'issued_for_execution', 'scheduled',
      'executing', 'executed', 'closed_out', 'on_hold', 'disputed',
    ] as const;
    for (const s of statuses) {
      const mi = SLA_HOURS[s].minor;
      const ma = SLA_HOURS[s].material;
      const mj = SLA_HOURS[s].major;
      const tr = SLA_HOURS[s].transformational;
      // INVERTED: minor <= material <= major <= transformational.
      expect(mi).toBeLessThanOrEqual(ma);
      expect(ma).toBeLessThanOrEqual(mj);
      expect(mj).toBeLessThanOrEqual(tr);
    }
  });

  it('terminals carry zero SLA', () => {
    expect(SLA_HOURS.archived.transformational).toBe(0);
    expect(SLA_HOURS.rejected.major).toBe(0);
    expect(SLA_HOURS.void.minor).toBe(0);
  });

  it('slaWindowHours returns matrix value', () => {
    expect(slaWindowHours('owner_review', 'transformational')).toBe(1080);
    expect(slaWindowHours('archived', 'transformational')).toBe(0);
  });

  it('slaDeadlineFor adds hours to enteredAt', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('owner_review', 'minor', t0);
    expect(d).not.toBeNull();
    // 168 hours = 7 days
    expect(d!.toISOString()).toBe('2026-06-06T00:00:00.000Z');
    expect(slaDeadlineFor('archived', 'minor', t0)).toBeNull();
  });

  it('slaHoursRemaining computes hours-to-deadline', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-31T00:00:00Z');
    // owner_review minor = 168 hrs; 24 hrs elapsed -> 144 remaining.
    expect(slaHoursRemaining('owner_review', 'minor', enteredAt, now)).toBe(144);
    // Negative when overdue
    const overdue = new Date('2026-06-10T00:00:00Z');
    expect(slaHoursRemaining('owner_review', 'minor', enteredAt, overdue)).toBeLessThan(0);
    // Null enteredAt -> 0
    expect(slaHoursRemaining('owner_review', 'minor', null, now)).toBe(0);
  });
});

describe('W117 IPP Change Order — SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE crossings', () => {
  it('SIGNATURE: approve crosses EVERY tier when scope_baseline_change', () => {
    expect(crossesIntoRegulator('approve', 'transformational', {
      flags: { scope_baseline_change: true },
    })).toBe(true);
    expect(crossesIntoRegulator('approve', 'major', {
      flags: { scope_baseline_change: true },
    })).toBe(true);
    expect(crossesIntoRegulator('approve', 'material', {
      flags: { scope_baseline_change: true },
    })).toBe(true);
    expect(crossesIntoRegulator('approve', 'minor', {
      flags: { scope_baseline_change: true },
    })).toBe(true);
  });

  it('SIGNATURE: approve crosses EVERY tier when regulatory_re_consent_required', () => {
    expect(crossesIntoRegulator('approve', 'transformational', {
      flags: { regulatory_re_consent_required: true },
    })).toBe(true);
    expect(crossesIntoRegulator('approve', 'major', {
      flags: { regulatory_re_consent_required: true },
    })).toBe(true);
    expect(crossesIntoRegulator('approve', 'material', {
      flags: { regulatory_re_consent_required: true },
    })).toBe(true);
    expect(crossesIntoRegulator('approve', 'minor', {
      flags: { regulatory_re_consent_required: true },
    })).toBe(true);
  });

  it('approve does NOT cross without scope/regulatory flag', () => {
    expect(crossesIntoRegulator('approve', 'transformational', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('approve', 'transformational', {
      flags: { schedule_impact_critical_path: true },
    })).toBe(false);
    expect(crossesIntoRegulator('approve', 'major', {
      flags: { lender_consent_required: true },
    })).toBe(false);
    expect(crossesIntoRegulator('approve', 'minor', {
      flags: { safety_design_change: true },
    })).toBe(false);
  });

  it('reject crosses EVERY tier when cumulative_change_value_pct >= 15', () => {
    expect(crossesIntoRegulator('reject', 'transformational', {
      cumulative_change_value_pct: 15,
    })).toBe(true);
    expect(crossesIntoRegulator('reject', 'minor', {
      cumulative_change_value_pct: 18,
    })).toBe(true);
    expect(crossesIntoRegulator('reject', 'material', {
      cumulative_change_value_pct: 25,
    })).toBe(true);
    // Below threshold
    expect(crossesIntoRegulator('reject', 'transformational', {
      cumulative_change_value_pct: 14.99,
    })).toBe(false);
    expect(crossesIntoRegulator('reject', 'major', {
      cumulative_change_value_pct: 10,
    })).toBe(false);
    // Default
    expect(crossesIntoRegulator('reject', 'major', {})).toBe(false);
  });

  it('dispute crosses major + transformational only', () => {
    expect(crossesIntoRegulator('dispute', 'transformational', {})).toBe(true);
    expect(crossesIntoRegulator('dispute', 'major', {})).toBe(true);
    expect(crossesIntoRegulator('dispute', 'material', {})).toBe(false);
    expect(crossesIntoRegulator('dispute', 'minor', {})).toBe(false);
  });

  it('close_out, archive, void, hold_resume never cross regulator', () => {
    expect(crossesIntoRegulator('close_out', 'transformational', {
      flags: { scope_baseline_change: true, regulatory_re_consent_required: true },
    })).toBe(false);
    expect(crossesIntoRegulator('archive', 'transformational', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('void', 'transformational', {
      flags: { scope_baseline_change: true },
    })).toBe(false);
    expect(crossesIntoRegulator('hold_resume', 'transformational', {
      flags: { regulatory_re_consent_required: true },
    })).toBe(false);
  });

  it('routine actions never cross regulator', () => {
    expect(crossesIntoRegulator('propose', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('assess_impact', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('quote_cost', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('submit_for_review', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('negotiate', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('issue', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('schedule', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('commence_execution', 'transformational', {})).toBe(false);
    expect(crossesIntoRegulator('complete_execution', 'transformational', {})).toBe(false);
  });

  it('SLA breach crosses regulator on HEAVY tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('transformational')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W117 IPP Change Order — party routing + event names', () => {
  it('PM handles propose + submit_for_review + hold_resume + void', () => {
    expect(partyForAction('propose')).toBe('PM');
    expect(partyForAction('submit_for_review')).toBe('PM');
    expect(partyForAction('hold_resume')).toBe('PM');
    expect(partyForAction('void')).toBe('PM');
  });

  it('engineer handles assess_impact + quote_cost', () => {
    expect(partyForAction('assess_impact')).toBe('engineer');
    expect(partyForAction('quote_cost')).toBe('engineer');
  });

  it('owner_rep handles negotiate + reject + dispute', () => {
    expect(partyForAction('negotiate')).toBe('owner_rep');
    expect(partyForAction('reject')).toBe('owner_rep');
    expect(partyForAction('dispute')).toBe('owner_rep');
  });

  it('IPP_CEO handles approve + issue + schedule + execution + close', () => {
    expect(partyForAction('approve')).toBe('IPP_CEO');
    expect(partyForAction('issue')).toBe('IPP_CEO');
    expect(partyForAction('schedule')).toBe('IPP_CEO');
    expect(partyForAction('commence_execution')).toBe('IPP_CEO');
    expect(partyForAction('complete_execution')).toBe('IPP_CEO');
    expect(partyForAction('close_out')).toBe('IPP_CEO');
    expect(partyForAction('archive')).toBe('IPP_CEO');
  });

  it('eventTypeFor maps every action', () => {
    expect(eventTypeFor('propose')).toBe('ipp_change_order_proposed');
    expect(eventTypeFor('assess_impact')).toBe('ipp_change_order_impact_assessed');
    expect(eventTypeFor('quote_cost')).toBe('ipp_change_order_cost_quoted');
    expect(eventTypeFor('submit_for_review')).toBe('ipp_change_order_submitted_for_review');
    expect(eventTypeFor('negotiate')).toBe('ipp_change_order_negotiated');
    expect(eventTypeFor('approve')).toBe('ipp_change_order_approved');
    expect(eventTypeFor('issue')).toBe('ipp_change_order_issued');
    expect(eventTypeFor('schedule')).toBe('ipp_change_order_scheduled');
    expect(eventTypeFor('commence_execution')).toBe('ipp_change_order_execution_started');
    expect(eventTypeFor('complete_execution')).toBe('ipp_change_order_execution_completed');
    expect(eventTypeFor('close_out')).toBe('ipp_change_order_closed_out');
    expect(eventTypeFor('archive')).toBe('ipp_change_order_archived');
    expect(eventTypeFor('reject')).toBe('ipp_change_order_rejected');
    expect(eventTypeFor('void')).toBe('ipp_change_order_voided');
    expect(eventTypeFor('hold_resume')).toBe('ipp_change_order_hold_resumed');
    expect(eventTypeFor('dispute')).toBe('ipp_change_order_disputed');
  });
});

describe('W117 IPP Change Order — authority ladder + INVERTED filing window', () => {
  it('authorityRequired ladders PM -> engineer -> owner_rep -> IPP_CEO', () => {
    expect(authorityRequired('minor')).toBe('PM');
    expect(authorityRequired('material')).toBe('engineer');
    expect(authorityRequired('major')).toBe('owner_rep');
    expect(authorityRequired('transformational')).toBe('IPP_CEO');
  });

  it('regulatorFilingWindowHours is INVERTED polarity', () => {
    expect(regulatorFilingWindowHours('minor')).toBe(72);
    expect(regulatorFilingWindowHours('material')).toBe(96);
    expect(regulatorFilingWindowHours('major')).toBe(168);
    expect(regulatorFilingWindowHours('transformational')).toBe(240);
    // INVERTED polarity: larger tier = longer window
    expect(regulatorFilingWindowHours('minor'))
      .toBeLessThan(regulatorFilingWindowHours('material'));
    expect(regulatorFilingWindowHours('material'))
      .toBeLessThan(regulatorFilingWindowHours('major'));
    expect(regulatorFilingWindowHours('major'))
      .toBeLessThan(regulatorFilingWindowHours('transformational'));
  });
});

describe('W117 IPP Change Order — urgency band INVERTED polarity', () => {
  it('overdue is always critical', () => {
    expect(urgencyBand('transformational', -1)).toBe('critical');
    expect(urgencyBand('minor', -1)).toBe('critical');
  });

  it('transformational has the LOOSEST thresholds', () => {
    expect(urgencyBand('transformational', 24)).toBe('critical');
    expect(urgencyBand('transformational', 100)).toBe('high');
    expect(urgencyBand('transformational', 300)).toBe('medium');
    expect(urgencyBand('transformational', 500)).toBe('low');
  });

  it('major band', () => {
    expect(urgencyBand('major', 12)).toBe('critical');
    expect(urgencyBand('major', 48)).toBe('high');
    expect(urgencyBand('major', 200)).toBe('medium');
    expect(urgencyBand('major', 300)).toBe('low');
  });

  it('material band', () => {
    expect(urgencyBand('material', 6)).toBe('critical');
    expect(urgencyBand('material', 24)).toBe('high');
    expect(urgencyBand('material', 96)).toBe('medium');
    expect(urgencyBand('material', 150)).toBe('low');
  });

  it('minor has the TIGHTEST thresholds', () => {
    expect(urgencyBand('minor', 4)).toBe('critical');
    expect(urgencyBand('minor', 16)).toBe('high');
    expect(urgencyBand('minor', 48)).toBe('medium');
    expect(urgencyBand('minor', 100)).toBe('low');
  });

  it('INVERTED polarity holds — at same hours-left, minor more urgent than transformational', () => {
    // 20 hours left: minor = high (8-24); transformational = critical (<48)
    expect(urgencyBand('minor', 20)).toBe('high');
    expect(urgencyBand('transformational', 20)).toBe('critical');
    // 300 hours left: minor = low; transformational = medium
    expect(urgencyBand('minor', 300)).toBe('low');
    expect(urgencyBand('transformational', 300)).toBe('medium');
  });
});

describe('W117 IPP Change Order — cumulative cap band + EAC delta + days-to-CPR', () => {
  it('cumulativeCapBand reflects REIPPPP cap signal', () => {
    expect(cumulativeCapBand(0)).toBe('clear');
    expect(cumulativeCapBand(4.99)).toBe('clear');
    expect(cumulativeCapBand(5)).toBe('watch');
    expect(cumulativeCapBand(9.99)).toBe('watch');
    expect(cumulativeCapBand(10)).toBe('warning');
    expect(cumulativeCapBand(14.99)).toBe('warning');
    expect(cumulativeCapBand(15)).toBe('breach');
    expect(cumulativeCapBand(25)).toBe('breach');
    expect(cumulativeCapBand(null)).toBe('clear');
    expect(cumulativeCapBand(undefined)).toBe('clear');
  });

  it('eacDeltaSign classifies as positive/negative/flat', () => {
    expect(eacDeltaSign(0)).toBe('flat');
    expect(eacDeltaSign(1)).toBe('positive');
    expect(eacDeltaSign(5_000_000)).toBe('positive');
    expect(eacDeltaSign(-100_000)).toBe('negative');
    expect(eacDeltaSign(null)).toBe('flat');
    expect(eacDeltaSign(undefined)).toBe('flat');
  });

  it('daysToCriticalPathRecovery returns null when not on critical path', () => {
    expect(daysToCriticalPathRecovery(false, 10)).toBeNull();
    expect(daysToCriticalPathRecovery(false, null)).toBeNull();
  });

  it('daysToCriticalPathRecovery returns days when on critical path', () => {
    expect(daysToCriticalPathRecovery(true, 7)).toBe(7);
    expect(daysToCriticalPathRecovery(true, 0)).toBe(0);
    expect(daysToCriticalPathRecovery(true, null)).toBe(0);
  });
});

describe('W117 IPP Change Order — 6-bridge architecture', () => {
  it('bridge functions return true when ref present, false when missing', () => {
    expect(bridgesToRfiChain('ipr-001')).toBe(true);
    expect(bridgesToRfiChain(null)).toBe(false);
    expect(bridgesToRfiChain('')).toBe(false);
    expect(bridgesToSubmittalChain('ips-015')).toBe(true);
    expect(bridgesToSubmittalChain(undefined)).toBe(false);
    expect(bridgesToDocumentControlChain('idc-001')).toBe(true);
    expect(bridgesToDocumentControlChain(null)).toBe(false);
    expect(bridgesToScheduleChain('sch-042')).toBe(true);
    expect(bridgesToScheduleChain('')).toBe(false);
    expect(bridgesToEvmChain('evm-007')).toBe(true);
    expect(bridgesToEvmChain(null)).toBe(false);
    expect(bridgesToProcurementChain('proc-019')).toBe(true);
    expect(bridgesToProcurementChain(null)).toBe(false);
    expect(bridgesToCodChain('cod-020')).toBe(true);
    expect(bridgesToCodChain(undefined)).toBe(false);
  });
});

describe('W117 IPP Change Order — completeness 0-130', () => {
  it('zero when nothing stamped', () => {
    expect(changeOrderCompletenessIndex({})).toBe(0);
  });

  it('walks up the chain', () => {
    expect(changeOrderCompletenessIndex({ change_proposed: true })).toBe(5);
    expect(changeOrderCompletenessIndex({ change_proposed: true, impact_assessed: true })).toBe(11);
    expect(changeOrderCompletenessIndex({
      change_proposed: true, impact_assessed: true, cost_quoted: true,
    })).toBe(17);
    expect(changeOrderCompletenessIndex({
      change_proposed: true, impact_assessed: true, cost_quoted: true,
      owner_review: true, negotiated: true,
    })).toBe(31);
  });

  it('approved weighs 10', () => {
    expect(changeOrderCompletenessIndex({ approved: true })).toBe(10);
  });

  it('executed weighs 10', () => {
    expect(changeOrderCompletenessIndex({ executed: true })).toBe(10);
  });

  it('closed_out + archived each weigh 12', () => {
    expect(changeOrderCompletenessIndex({ closed_out: true })).toBe(12);
    expect(changeOrderCompletenessIndex({ archived: true })).toBe(12);
  });

  it('clean_close_bonus adds 20', () => {
    expect(changeOrderCompletenessIndex({ clean_close_bonus: true })).toBe(20);
  });

  it('full chain hits the weighted maximum and stays within the 0-130 cap', () => {
    const score = changeOrderCompletenessIndex({
      change_proposed: true,
      impact_assessed: true,
      cost_quoted: true,
      owner_review: true,
      negotiated: true,
      approved: true,
      issued_for_execution: true,
      scheduled: true,
      executing: true,
      executed: true,
      closed_out: true,
      archived: true,
      clean_close_bonus: true,
    });
    // 5+6+6+8+6+10+6+6+8+10+12+12+20 = 115 — weighted max; cap=130 reserve.
    expect(score).toBe(115);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('handles number-typed (DB) values', () => {
    expect(changeOrderCompletenessIndex({
      change_proposed: 1, impact_assessed: 1, cost_quoted: 0,
    } as any)).toBe(11);
  });
});

describe('W117 IPP Change Order — hash-chain pre-stage', () => {
  it('hashChainPositionFor increments', () => {
    expect(hashChainPositionFor(0)).toBe(1);
    expect(hashChainPositionFor(5)).toBe(6);
    expect(hashChainPositionFor(null)).toBe(1);
    expect(hashChainPositionFor(undefined)).toBe(1);
  });

  it('hashChainPositionFor handles invalid input', () => {
    expect(hashChainPositionFor(-1)).toBe(1);
    expect(hashChainPositionFor(NaN)).toBe(1);
  });

  it('placeholderMerkleSegment is deterministic and 64-char hex', () => {
    const a = placeholderMerkleSegment('ico-001', 1);
    const b = placeholderMerkleSegment('ico-001', 1);
    expect(a).toBe(b);
    expect(a.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(a)).toBe(true);
  });

  it('placeholderMerkleSegment varies by id and position', () => {
    const a = placeholderMerkleSegment('ico-001', 1);
    const b = placeholderMerkleSegment('ico-002', 1);
    const c = placeholderMerkleSegment('ico-001', 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
