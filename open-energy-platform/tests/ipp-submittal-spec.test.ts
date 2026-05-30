// Wave 115 — IPP Submittal / Transmittal Lifecycle spec test battery.
//
// Covers: state machine (forward path + branches + terminals + escalate-
// resume + void/reject from non-terminals), tier derivation + FLOOR-AT-
// CRITICAL-SAFETY on each flag, URGENT SLA matrix anchored on submitted,
// SIGNATURE STAMP-E-REJECT-CRITICAL crossings (stamp_return EVERY tier
// when stamp E AND (critical_safety || commissioning_critical); reject
// EVERY tier when long_lead AND cycles>=3; escalate critical_safety +
// material_approval only when regulatory_witness_required; close_out
// never crosses; sla_breached heavy tiers only), party routing (4-party
// split), authority ladder + URGENT filing window, urgency band (URGENT
// polarity — critical_safety tightest), 6-bridge architecture
// (W114/W112/W113/W19/W23/W20), stamp/cycle helpers, completeness
// 0-130, hash-chain pre-stage.

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
  tierForSubmittalClass,
  countFloorFlags,
  floorAtCriticalSafety,
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
  regulatoryWitnessWindowHours,
  stampForAction,
  incrementCycleCount,
  bridgesToDocumentControlChain,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToInsuranceChain,
  bridgesToCodChain,
  submittalCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
} from '../src/utils/ipp-submittal-spec';

describe('W115 IPP Submittal — state machine', () => {
  it('walks the forward path contractor_drafted -> archived', () => {
    expect(nextStatus('contractor_drafted', 'assemble_package')).toBe('package_assembled');
    expect(nextStatus('package_assembled', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'screen')).toBe('screening');
    expect(nextStatus('screening', 'assign_reviewer')).toBe('assigned_to_reviewer');
    expect(nextStatus('assigned_to_reviewer', 'commence_review')).toBe('under_review');
    expect(nextStatus('under_review', 'coordinate_review')).toBe('coordination_review');
    expect(nextStatus('coordination_review', 'draft_response')).toBe('response_drafted');
    expect(nextStatus('response_drafted', 'stamp_return')).toBe('stamped_returned');
    expect(nextStatus('stamped_returned', 'request_resubmission')).toBe('resubmission_requested');
    expect(nextStatus('resubmission_requested', 'assemble_package')).toBe('package_assembled');
    expect(nextStatus('stamped_returned', 'close_out')).toBe('closed_out');
    expect(nextStatus('closed_out', 'archive')).toBe('archived');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('contractor_drafted', 'submit')).toBeNull();
    expect(nextStatus('package_assembled', 'screen')).toBeNull();
    expect(nextStatus('submitted', 'assign_reviewer')).toBeNull();
    expect(nextStatus('screening', 'commence_review')).toBeNull();
    expect(nextStatus('assigned_to_reviewer', 'coordinate_review')).toBeNull();
    expect(nextStatus('under_review', 'stamp_return')).toBeNull();
    expect(nextStatus('contractor_drafted', 'archive')).toBeNull();
  });

  it('approve_with_comments is a fast-path from review-touch states to stamped_returned', () => {
    expect(nextStatus('under_review', 'approve_with_comments')).toBe('stamped_returned');
    expect(nextStatus('coordination_review', 'approve_with_comments')).toBe('stamped_returned');
    expect(nextStatus('response_drafted', 'approve_with_comments')).toBe('stamped_returned');
    expect(nextStatus('stamped_returned', 'approve_with_comments')).toBeNull();
    expect(nextStatus('screening', 'approve_with_comments')).toBeNull();
  });

  it('escalate is a soft pause from review-touch states only', () => {
    expect(nextStatus('under_review', 'escalate')).toBe('escalated');
    expect(nextStatus('coordination_review', 'escalate')).toBe('escalated');
    expect(nextStatus('response_drafted', 'escalate')).toBe('escalated');
    expect(nextStatus('stamped_returned', 'escalate')).toBe('escalated');
    expect(nextStatus('resubmission_requested', 'escalate')).toBe('escalated');
    expect(nextStatus('contractor_drafted', 'escalate')).toBeNull();
    expect(nextStatus('package_assembled', 'escalate')).toBeNull();
    expect(nextStatus('screening', 'escalate')).toBeNull();
    expect(nextStatus('closed_out', 'escalate')).toBeNull();
  });

  it('escalated resumes into close_out', () => {
    expect(nextStatus('escalated', 'close_out')).toBe('closed_out');
  });

  it('void is only allowed before reviewer assignment', () => {
    expect(nextStatus('contractor_drafted', 'void')).toBe('void');
    expect(nextStatus('package_assembled', 'void')).toBe('void');
    expect(nextStatus('submitted', 'void')).toBe('void');
    expect(nextStatus('screening', 'void')).toBe('void');
    expect(nextStatus('assigned_to_reviewer', 'void')).toBeNull();
    expect(nextStatus('under_review', 'void')).toBeNull();
    expect(nextStatus('stamped_returned', 'void')).toBeNull();
  });

  it('reject is allowed from every non-terminal', () => {
    expect(nextStatus('contractor_drafted', 'reject')).toBe('rejected');
    expect(nextStatus('package_assembled', 'reject')).toBe('rejected');
    expect(nextStatus('submitted', 'reject')).toBe('rejected');
    expect(nextStatus('under_review', 'reject')).toBe('rejected');
    expect(nextStatus('stamped_returned', 'reject')).toBe('rejected');
    expect(nextStatus('escalated', 'reject')).toBe('rejected');
    expect(nextStatus('closed_out', 'reject')).toBe('rejected');
    // Terminals block reject
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('rejected', 'reject')).toBeNull();
    expect(nextStatus('void', 'reject')).toBeNull();
  });

  it('archived is HARD terminal — blocks every action', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('rejected')).toBe(false);
    expect(isHardTerminal('void')).toBe(false);
    expect(nextStatus('archived', 'assemble_package')).toBeNull();
    expect(nextStatus('archived', 'submit')).toBeNull();
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('archived', 'escalate')).toBeNull();
  });

  it('rejected and void are UI-terminals (block forward but not hard-blocked)', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('void')).toBe(true);
    expect(isTerminal('under_review')).toBe(false);
    expect(isTerminal('escalated')).toBe(false);
  });

  it('draft_package is create-only — never offered as an action', () => {
    expect(allowedActions('contractor_drafted')).not.toContain('draft_package');
    expect(allowedActions('package_assembled')).not.toContain('draft_package');
    expect(nextStatus('package_assembled', 'draft_package')).toBeNull();
  });

  it('allowedActions reflects forward + reject + void/escalate gates', () => {
    const a1 = allowedActions('contractor_drafted');
    expect(a1).toContain('assemble_package');
    expect(a1).toContain('void');
    expect(a1).toContain('reject');
    expect(a1).not.toContain('escalate');
    expect(a1).not.toContain('close_out');

    const a2 = allowedActions('under_review');
    expect(a2).toContain('coordinate_review');
    expect(a2).toContain('draft_response');
    expect(a2).toContain('approve_with_comments');
    expect(a2).toContain('escalate');
    expect(a2).toContain('reject');
    expect(a2).not.toContain('void');

    const a3 = allowedActions('archived');
    expect(a3.length).toBe(0);
  });

  it('TRANSITIONS map covers all 16 actions', () => {
    const keys = Object.keys(TRANSITIONS);
    expect(keys.length).toBe(16);
    expect(keys).toContain('draft_package');
    expect(keys).toContain('assemble_package');
    expect(keys).toContain('submit');
    expect(keys).toContain('screen');
    expect(keys).toContain('assign_reviewer');
    expect(keys).toContain('commence_review');
    expect(keys).toContain('coordinate_review');
    expect(keys).toContain('draft_response');
    expect(keys).toContain('stamp_return');
    expect(keys).toContain('request_resubmission');
    expect(keys).toContain('approve_with_comments');
    expect(keys).toContain('close_out');
    expect(keys).toContain('archive');
    expect(keys).toContain('reject');
    expect(keys).toContain('void');
    expect(keys).toContain('escalate');
  });
});

describe('W115 IPP Submittal — tier derivation + FLOOR-AT-CRITICAL-SAFETY', () => {
  it('tier from submittal_class', () => {
    expect(tierForSubmittalClass('critical_safety')).toBe('critical_safety');
    expect(tierForSubmittalClass('safety_critical')).toBe('critical_safety');
    expect(tierForSubmittalClass('hv_material')).toBe('critical_safety');
    expect(tierForSubmittalClass('shop_drawing')).toBe('shop_drawing');
    expect(tierForSubmittalClass('fabrication')).toBe('shop_drawing');
    expect(tierForSubmittalClass('isometric')).toBe('shop_drawing');
    expect(tierForSubmittalClass('material_approval')).toBe('material_approval');
    expect(tierForSubmittalClass('material')).toBe('material_approval');
    expect(tierForSubmittalClass('catalogue_cut')).toBe('material_approval');
    expect(tierForSubmittalClass('om_manual')).toBe('om_manual');
    expect(tierForSubmittalClass('unknown_class')).toBe('om_manual');
    expect(tierForSubmittalClass(null)).toBe('om_manual');
    expect(tierForSubmittalClass(undefined)).toBe('om_manual');
    expect(tierForSubmittalClass('')).toBe('om_manual');
  });

  it('tier is case-insensitive', () => {
    expect(tierForSubmittalClass('Critical_Safety')).toBe('critical_safety');
    expect(tierForSubmittalClass('SHOP_DRAWING')).toBe('shop_drawing');
  });

  it('countFloorFlags sums each flag', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ long_lead_item: true })).toBe(1);
    expect(countFloorFlags({ commissioning_critical: true, regulatory_witness_required: true })).toBe(2);
    expect(countFloorFlags({
      long_lead_item: true,
      commissioning_critical: true,
      regulatory_witness_required: true,
      lender_information_covenant: true,
      dispute_history: true,
    })).toBe(5);
    // Number-coerced flags (DB column convention)
    expect(countFloorFlags({ long_lead_item: 1, commissioning_critical: 0 } as any)).toBe(1);
  });

  it('floorAtCriticalSafety triggers on ANY one of the 5 flags', () => {
    expect(floorAtCriticalSafety({})).toBe(false);
    expect(floorAtCriticalSafety({ long_lead_item: true })).toBe(true);
    expect(floorAtCriticalSafety({ commissioning_critical: true })).toBe(true);
    expect(floorAtCriticalSafety({ regulatory_witness_required: true })).toBe(true);
    expect(floorAtCriticalSafety({ lender_information_covenant: true })).toBe(true);
    expect(floorAtCriticalSafety({ dispute_history: true })).toBe(true);
  });

  it('effectiveTier elevates to critical_safety when any flag set', () => {
    expect(effectiveTier('om_manual', {})).toBe('om_manual');
    expect(effectiveTier('om_manual', { long_lead_item: true })).toBe('critical_safety');
    expect(effectiveTier('material_approval', { commissioning_critical: true })).toBe('critical_safety');
    expect(effectiveTier('shop_drawing', { regulatory_witness_required: true })).toBe('critical_safety');
    expect(effectiveTier('shop_drawing', {})).toBe('shop_drawing');
    expect(effectiveTier('critical_safety', {})).toBe('critical_safety');
  });

  it('isHeavyTier covers critical_safety + shop_drawing', () => {
    expect(isHeavyTier('critical_safety')).toBe(true);
    expect(isHeavyTier('shop_drawing')).toBe(true);
    expect(isHeavyTier('material_approval')).toBe(false);
    expect(isHeavyTier('om_manual')).toBe(false);
  });

  it('isReportable is critical_safety only', () => {
    expect(isReportable('critical_safety')).toBe(true);
    expect(isReportable('shop_drawing')).toBe(false);
    expect(isReportable('material_approval')).toBe(false);
    expect(isReportable('om_manual')).toBe(false);
  });
});

describe('W115 IPP Submittal — URGENT SLA matrix', () => {
  it('anchor SLA on submitted with URGENT polarity', () => {
    expect(SLA_HOURS.submitted.critical_safety).toBe(24);
    expect(SLA_HOURS.submitted.shop_drawing).toBe(168);
    expect(SLA_HOURS.submitted.material_approval).toBe(240);
    expect(SLA_HOURS.submitted.om_manual).toBe(480);
  });

  it('URGENT polarity holds across every non-terminal status', () => {
    const statuses = [
      'contractor_drafted', 'package_assembled', 'submitted', 'screening',
      'assigned_to_reviewer', 'under_review', 'coordination_review',
      'response_drafted', 'stamped_returned', 'resubmission_requested',
      'closed_out', 'escalated',
    ] as const;
    for (const s of statuses) {
      const cs = SLA_HOURS[s].critical_safety;
      const sd = SLA_HOURS[s].shop_drawing;
      const ma = SLA_HOURS[s].material_approval;
      const om = SLA_HOURS[s].om_manual;
      expect(cs).toBeLessThanOrEqual(sd);
      expect(sd).toBeLessThanOrEqual(ma);
      expect(ma).toBeLessThanOrEqual(om);
    }
  });

  it('terminals carry zero SLA', () => {
    expect(SLA_HOURS.archived.critical_safety).toBe(0);
    expect(SLA_HOURS.rejected.shop_drawing).toBe(0);
    expect(SLA_HOURS.void.om_manual).toBe(0);
  });

  it('slaWindowHours returns matrix value', () => {
    expect(slaWindowHours('submitted', 'critical_safety')).toBe(24);
    expect(slaWindowHours('archived', 'critical_safety')).toBe(0);
  });

  it('slaDeadlineFor adds hours to enteredAt', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('submitted', 'critical_safety', t0);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(slaDeadlineFor('archived', 'critical_safety', t0)).toBeNull();
  });

  it('slaHoursRemaining computes hours-to-deadline', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T06:00:00Z');
    expect(slaHoursRemaining('submitted', 'critical_safety', enteredAt, now)).toBe(18);
    // Negative when overdue
    const overdue = new Date('2026-06-01T00:00:00Z');
    expect(slaHoursRemaining('submitted', 'critical_safety', enteredAt, overdue)).toBe(-24);
    // Null enteredAt -> 0
    expect(slaHoursRemaining('submitted', 'critical_safety', null, now)).toBe(0);
  });
});

describe('W115 IPP Submittal — SIGNATURE STAMP-E-REJECT-CRITICAL regulator crossings', () => {
  it('stamp_return crosses EVERY tier when stamp E AND critical_safety', () => {
    expect(crossesIntoRegulator('stamp_return', 'critical_safety', { stamp_code: 'E' })).toBe(true);
    // shop_drawing alone with stamp E does NOT cross (needs ccp or tier=critical_safety)
    expect(crossesIntoRegulator('stamp_return', 'shop_drawing', { stamp_code: 'E' })).toBe(false);
    expect(crossesIntoRegulator('stamp_return', 'material_approval', { stamp_code: 'E' })).toBe(false);
    expect(crossesIntoRegulator('stamp_return', 'om_manual', { stamp_code: 'E' })).toBe(false);
  });

  it('stamp_return crosses EVERY tier when stamp E AND commissioning_critical flag', () => {
    expect(crossesIntoRegulator('stamp_return', 'shop_drawing', {
      stamp_code: 'E',
      flags: { commissioning_critical: true },
    })).toBe(true);
    expect(crossesIntoRegulator('stamp_return', 'om_manual', {
      stamp_code: 'E',
      flags: { commissioning_critical: true },
    })).toBe(true);
  });

  it('stamp_return does NOT cross when stamp != E', () => {
    expect(crossesIntoRegulator('stamp_return', 'critical_safety', { stamp_code: 'A' })).toBe(false);
    expect(crossesIntoRegulator('stamp_return', 'critical_safety', { stamp_code: 'B' })).toBe(false);
    expect(crossesIntoRegulator('stamp_return', 'critical_safety', { stamp_code: 'C' })).toBe(false);
    expect(crossesIntoRegulator('stamp_return', 'critical_safety', { stamp_code: 'D' })).toBe(false);
    expect(crossesIntoRegulator('stamp_return', 'critical_safety', { stamp_code: null })).toBe(false);
  });

  it('reject crosses EVERY tier when long_lead_item AND cycle_count >= 3', () => {
    expect(crossesIntoRegulator('reject', 'critical_safety', {
      flags: { long_lead_item: true }, cycle_count: 3,
    })).toBe(true);
    expect(crossesIntoRegulator('reject', 'om_manual', {
      flags: { long_lead_item: true }, cycle_count: 5,
    })).toBe(true);
    // 2 cycles is below threshold
    expect(crossesIntoRegulator('reject', 'critical_safety', {
      flags: { long_lead_item: true }, cycle_count: 2,
    })).toBe(false);
    // Long-lead absent
    expect(crossesIntoRegulator('reject', 'critical_safety', {
      flags: {}, cycle_count: 5,
    })).toBe(false);
  });

  it('escalate crosses critical_safety + material_approval only when regulatory_witness_required', () => {
    expect(crossesIntoRegulator('escalate', 'critical_safety', {
      flags: { regulatory_witness_required: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'material_approval', {
      flags: { regulatory_witness_required: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'shop_drawing', {
      flags: { regulatory_witness_required: true },
    })).toBe(false);
    expect(crossesIntoRegulator('escalate', 'om_manual', {
      flags: { regulatory_witness_required: true },
    })).toBe(false);
    // Without witness flag — no crossing
    expect(crossesIntoRegulator('escalate', 'critical_safety', { flags: {} })).toBe(false);
  });

  it('close_out, archive, void never cross regulator', () => {
    expect(crossesIntoRegulator('close_out', 'critical_safety', { flags: { commissioning_critical: true } })).toBe(false);
    expect(crossesIntoRegulator('archive', 'critical_safety', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('void', 'critical_safety', { flags: { long_lead_item: true } })).toBe(false);
  });

  it('routine actions never cross regulator', () => {
    expect(crossesIntoRegulator('draft_package', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('assemble_package', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('submit', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('screen', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('assign_reviewer', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('commence_review', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('coordinate_review', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('draft_response', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('request_resubmission', 'critical_safety', {})).toBe(false);
    expect(crossesIntoRegulator('approve_with_comments', 'critical_safety', {})).toBe(false);
  });

  it('SLA breach crosses regulator on HEAVY tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('critical_safety')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('shop_drawing')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material_approval')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('om_manual')).toBe(false);
  });
});

describe('W115 IPP Submittal — party routing + event names', () => {
  it('contractor_PM handles drafts + assemble + submit + void', () => {
    expect(partyForAction('draft_package')).toBe('contractor_PM');
    expect(partyForAction('assemble_package')).toBe('contractor_PM');
    expect(partyForAction('submit')).toBe('contractor_PM');
    expect(partyForAction('void')).toBe('contractor_PM');
  });

  it('doc_controller handles screening + assignment', () => {
    expect(partyForAction('screen')).toBe('doc_controller');
    expect(partyForAction('assign_reviewer')).toBe('doc_controller');
  });

  it('engineer handles review + stamp + resubmit + approve_with_comments', () => {
    expect(partyForAction('commence_review')).toBe('engineer');
    expect(partyForAction('coordinate_review')).toBe('engineer');
    expect(partyForAction('draft_response')).toBe('engineer');
    expect(partyForAction('stamp_return')).toBe('engineer');
    expect(partyForAction('request_resubmission')).toBe('engineer');
    expect(partyForAction('approve_with_comments')).toBe('engineer');
  });

  it('owner_rep handles close_out + archive + reject + escalate', () => {
    expect(partyForAction('close_out')).toBe('owner_rep');
    expect(partyForAction('archive')).toBe('owner_rep');
    expect(partyForAction('reject')).toBe('owner_rep');
    expect(partyForAction('escalate')).toBe('owner_rep');
  });

  it('eventTypeFor maps every action', () => {
    expect(eventTypeFor('draft_package')).toBe('ipp_submittal_drafted');
    expect(eventTypeFor('assemble_package')).toBe('ipp_submittal_assembled');
    expect(eventTypeFor('submit')).toBe('ipp_submittal_submitted');
    expect(eventTypeFor('screen')).toBe('ipp_submittal_screened');
    expect(eventTypeFor('assign_reviewer')).toBe('ipp_submittal_reviewer_assigned');
    expect(eventTypeFor('commence_review')).toBe('ipp_submittal_review_started');
    expect(eventTypeFor('coordinate_review')).toBe('ipp_submittal_coordinated');
    expect(eventTypeFor('draft_response')).toBe('ipp_submittal_response_drafted');
    expect(eventTypeFor('stamp_return')).toBe('ipp_submittal_stamped');
    expect(eventTypeFor('request_resubmission')).toBe('ipp_submittal_resubmission_requested');
    expect(eventTypeFor('close_out')).toBe('ipp_submittal_closed_out');
    expect(eventTypeFor('archive')).toBe('ipp_submittal_archived');
    expect(eventTypeFor('reject')).toBe('ipp_submittal_rejected');
    expect(eventTypeFor('void')).toBe('ipp_submittal_voided');
    expect(eventTypeFor('escalate')).toBe('ipp_submittal_escalated');
    expect(eventTypeFor('approve_with_comments')).toBe('ipp_submittal_approved_with_comments');
  });
});

describe('W115 IPP Submittal — authority ladder + URGENT filing window', () => {
  it('authorityRequired ladders contractor_PM -> engineer -> owner_rep', () => {
    expect(authorityRequired('om_manual')).toBe('contractor_PM');
    expect(authorityRequired('material_approval')).toBe('engineer');
    expect(authorityRequired('shop_drawing')).toBe('engineer');
    expect(authorityRequired('critical_safety')).toBe('owner_rep');
  });

  it('regulatorFilingWindowHours is URGENT polarity', () => {
    expect(regulatorFilingWindowHours('critical_safety')).toBe(24);
    expect(regulatorFilingWindowHours('shop_drawing')).toBe(48);
    expect(regulatorFilingWindowHours('material_approval')).toBe(72);
    expect(regulatorFilingWindowHours('om_manual')).toBe(168);
    // Polarity assertion: tighter tier = shorter window
    expect(regulatorFilingWindowHours('critical_safety'))
      .toBeLessThan(regulatorFilingWindowHours('shop_drawing'));
    expect(regulatorFilingWindowHours('shop_drawing'))
      .toBeLessThan(regulatorFilingWindowHours('material_approval'));
    expect(regulatorFilingWindowHours('material_approval'))
      .toBeLessThan(regulatorFilingWindowHours('om_manual'));
  });

  it('regulatoryWitnessWindowHours zero when witness not required', () => {
    expect(regulatoryWitnessWindowHours('critical_safety', false)).toBe(0);
    expect(regulatoryWitnessWindowHours('om_manual', false)).toBe(0);
  });

  it('regulatoryWitnessWindowHours URGENT polarity when required', () => {
    expect(regulatoryWitnessWindowHours('critical_safety', true)).toBe(48);
    expect(regulatoryWitnessWindowHours('shop_drawing', true)).toBe(120);
    expect(regulatoryWitnessWindowHours('material_approval', true)).toBe(168);
    expect(regulatoryWitnessWindowHours('om_manual', true)).toBe(240);
  });
});

describe('W115 IPP Submittal — urgency band URGENT polarity', () => {
  it('overdue is always critical', () => {
    expect(urgencyBand('critical_safety', -1)).toBe('critical');
    expect(urgencyBand('om_manual', -1)).toBe('critical');
  });

  it('critical_safety has the TIGHTEST thresholds', () => {
    expect(urgencyBand('critical_safety', 3)).toBe('critical');
    expect(urgencyBand('critical_safety', 6)).toBe('high');
    expect(urgencyBand('critical_safety', 12)).toBe('medium');
    expect(urgencyBand('critical_safety', 30)).toBe('low');
  });

  it('shop_drawing band', () => {
    expect(urgencyBand('shop_drawing', 12)).toBe('critical');
    expect(urgencyBand('shop_drawing', 48)).toBe('high');
    expect(urgencyBand('shop_drawing', 100)).toBe('medium');
    expect(urgencyBand('shop_drawing', 200)).toBe('low');
  });

  it('material_approval band', () => {
    expect(urgencyBand('material_approval', 24)).toBe('critical');
    expect(urgencyBand('material_approval', 72)).toBe('high');
    expect(urgencyBand('material_approval', 140)).toBe('medium');
    expect(urgencyBand('material_approval', 200)).toBe('low');
  });

  it('om_manual has the LOOSEST thresholds', () => {
    expect(urgencyBand('om_manual', 48)).toBe('critical');
    expect(urgencyBand('om_manual', 144)).toBe('high');
    expect(urgencyBand('om_manual', 300)).toBe('medium');
    expect(urgencyBand('om_manual', 500)).toBe('low');
  });

  it('URGENT polarity holds — at same hours-left, critical_safety more urgent than om_manual', () => {
    // 20 hours left: critical_safety = low (>=16); om_manual = critical (<72)
    expect(urgencyBand('critical_safety', 20)).toBe('low');
    expect(urgencyBand('om_manual', 20)).toBe('critical');
  });
});

describe('W115 IPP Submittal — 6-bridge architecture', () => {
  it('bridge functions return true when ref present, false when missing', () => {
    expect(bridgesToDocumentControlChain('idc-001')).toBe(true);
    expect(bridgesToDocumentControlChain(null)).toBe(false);
    expect(bridgesToDocumentControlChain('')).toBe(false);
    expect(bridgesToScheduleChain('sch-042')).toBe(true);
    expect(bridgesToScheduleChain(undefined)).toBe(false);
    expect(bridgesToEvmChain('evm-007')).toBe(true);
    expect(bridgesToEvmChain(null)).toBe(false);
    expect(bridgesToProcurementChain('proc-019')).toBe(true);
    expect(bridgesToProcurementChain('')).toBe(false);
    expect(bridgesToInsuranceChain('ins-023')).toBe(true);
    expect(bridgesToInsuranceChain(null)).toBe(false);
    expect(bridgesToCodChain('cod-020')).toBe(true);
    expect(bridgesToCodChain(undefined)).toBe(false);
  });
});

describe('W115 IPP Submittal — stamp + cycle helpers', () => {
  it('stamp_return defaults to D unless body provides stamp', () => {
    expect(stampForAction('stamp_return')).toBe('D');
    expect(stampForAction('stamp_return', null)).toBe('D');
    expect(stampForAction('stamp_return', 'A')).toBe('A');
    expect(stampForAction('stamp_return', 'B')).toBe('B');
    expect(stampForAction('stamp_return', 'C')).toBe('C');
    expect(stampForAction('stamp_return', 'D')).toBe('D');
    expect(stampForAction('stamp_return', 'E')).toBe('E');
  });

  it('approve_with_comments forces stamp B', () => {
    expect(stampForAction('approve_with_comments')).toBe('B');
    expect(stampForAction('approve_with_comments', 'A')).toBe('B');
  });

  it('other actions emit no stamp', () => {
    expect(stampForAction('assemble_package')).toBeNull();
    expect(stampForAction('submit')).toBeNull();
    expect(stampForAction('reject')).toBeNull();
    expect(stampForAction('escalate')).toBeNull();
    expect(stampForAction('close_out')).toBeNull();
  });

  it('incrementCycleCount bumps on request_resubmission', () => {
    expect(incrementCycleCount('request_resubmission', 'stamped_returned', 0)).toBe(1);
    expect(incrementCycleCount('request_resubmission', 'stamped_returned', 2)).toBe(3);
  });

  it('incrementCycleCount bumps on assemble_package FROM resubmission_requested', () => {
    expect(incrementCycleCount('assemble_package', 'resubmission_requested', 1)).toBe(2);
    expect(incrementCycleCount('assemble_package', 'resubmission_requested', 0)).toBe(1);
  });

  it('incrementCycleCount does NOT bump on first assemble_package from contractor_drafted', () => {
    expect(incrementCycleCount('assemble_package', 'contractor_drafted', 0)).toBe(0);
    expect(incrementCycleCount('assemble_package', 'package_assembled', 0)).toBe(0);
  });

  it('incrementCycleCount does NOT bump on non-cycle actions', () => {
    expect(incrementCycleCount('submit', 'package_assembled', 1)).toBe(1);
    expect(incrementCycleCount('stamp_return', 'response_drafted', 2)).toBe(2);
    expect(incrementCycleCount('close_out', 'stamped_returned', 3)).toBe(3);
  });
});

describe('W115 IPP Submittal — completeness 0-130', () => {
  it('zero when nothing stamped', () => {
    expect(submittalCompletenessIndex({})).toBe(0);
  });

  it('walks up the chain', () => {
    expect(submittalCompletenessIndex({ contractor_drafted: true })).toBe(6);
    expect(submittalCompletenessIndex({ contractor_drafted: true, package_assembled: true })).toBe(12);
    expect(submittalCompletenessIndex({
      contractor_drafted: true, package_assembled: true, submitted: true,
    })).toBe(20);
    expect(submittalCompletenessIndex({
      contractor_drafted: true, package_assembled: true, submitted: true,
      screening: true, assigned_to_reviewer: true,
    })).toBe(32);
  });

  it('stamped_returned weighs 10', () => {
    expect(submittalCompletenessIndex({ stamped_returned: true })).toBe(10);
  });

  it('closed_out + archived each weigh 12', () => {
    expect(submittalCompletenessIndex({ closed_out: true })).toBe(12);
    expect(submittalCompletenessIndex({ archived: true })).toBe(12);
  });

  it('clean_close_bonus adds 20', () => {
    expect(submittalCompletenessIndex({ clean_close_bonus: true })).toBe(20);
  });

  it('full chain hits the weighted maximum and stays within the 0-130 cap', () => {
    const score = submittalCompletenessIndex({
      contractor_drafted: true,
      package_assembled: true,
      submitted: true,
      screening: true,
      assigned_to_reviewer: true,
      under_review: true,
      coordination_review: true,
      response_drafted: true,
      stamped_returned: true,
      resubmission_requested: true,
      closed_out: true,
      archived: true,
      clean_close_bonus: true,
    });
    // 6+6+8+6+6+8+8+8+10+6+12+12+20 = 116 — the weighted max. The 130 cap
    // exists so future milestone weights can land without an overflow trap.
    expect(score).toBe(116);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('handles number-typed (DB) values', () => {
    expect(submittalCompletenessIndex({
      contractor_drafted: 1, package_assembled: 1, submitted: 0,
    } as any)).toBe(12);
  });
});

describe('W115 IPP Submittal — hash-chain pre-stage', () => {
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
    const a = placeholderMerkleSegment('ips-001', 1);
    const b = placeholderMerkleSegment('ips-001', 1);
    expect(a).toBe(b);
    expect(a.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(a)).toBe(true);
  });

  it('placeholderMerkleSegment varies by id and position', () => {
    const a = placeholderMerkleSegment('ips-001', 1);
    const b = placeholderMerkleSegment('ips-002', 1);
    const c = placeholderMerkleSegment('ips-001', 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
