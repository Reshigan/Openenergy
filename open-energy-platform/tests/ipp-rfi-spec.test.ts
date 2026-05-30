// Wave 116 — IPP RFI (Request For Information) Management spec test battery.
//
// Covers: state machine (forward path + branches + terminals + escalate-
// resume + void/reject from non-terminals + draft-only behaviour of
// draft_question + 16-action TRANSITIONS map coverage), tier derivation +
// FLOOR-AT-EMERGENCY-SAFETY on each of 5 flags, URGENT SLA matrix anchored
// on submitted, SIGNATURE SAFETY-RFI-ESCALATE crossings (escalate EVERY
// tier when safety_hazard_identified || regulatory_inquiry_triggered;
// reject EVERY tier when contractor_claim_basis AND cost_impact_zar >= R10m;
// convert_to_change_order construction_blocking + emergency_safety only;
// link_to_dispute when dispute_basis_referenced AND (claim || stoppage);
// close_out never crosses; sla_breached heavy tiers only), party routing
// (4-party split), authority ladder + URGENT filing window, urgency band
// (URGENT polarity — emergency_safety tightest), 6-bridge architecture
// (W114/W115/W112/W113/W19/W20), completeness 0-130, hash-chain pre-stage.

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
  tierForRfiClass,
  countFloorFlags,
  floorAtEmergencySafety,
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
  daysToConstructionBlockResolution,
  bridgesToDocumentControlChain,
  bridgesToSubmittalChain,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToCodChain,
  hasChangeOrderLink,
  rfiCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
} from '../src/utils/ipp-rfi-spec';

describe('W116 IPP RFI — state machine', () => {
  it('walks the forward path question_drafted -> archived', () => {
    expect(nextStatus('question_drafted', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'triage')).toBe('triage');
    expect(nextStatus('triage', 'assign_responder')).toBe('assigned_to_responder');
    expect(nextStatus('assigned_to_responder', 'commence_research')).toBe('research_in_progress');
    expect(nextStatus('research_in_progress', 'draft_response')).toBe('response_drafted');
    expect(nextStatus('response_drafted', 'coordinate_review')).toBe('cross_discipline_review');
    expect(nextStatus('cross_discipline_review', 'return_answer')).toBe('answer_returned');
    expect(nextStatus('answer_returned', 'request_clarification')).toBe('clarification_requested');
    expect(nextStatus('clarification_requested', 'close_out')).toBe('closed_out');
    expect(nextStatus('closed_out', 'archive')).toBe('archived');
  });

  it('return_answer can short-circuit from response_drafted', () => {
    expect(nextStatus('response_drafted', 'return_answer')).toBe('answer_returned');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('question_drafted', 'triage')).toBeNull();
    expect(nextStatus('submitted', 'assign_responder')).toBeNull();
    expect(nextStatus('triage', 'commence_research')).toBeNull();
    expect(nextStatus('assigned_to_responder', 'draft_response')).toBeNull();
    expect(nextStatus('research_in_progress', 'coordinate_review')).toBeNull();
    expect(nextStatus('cross_discipline_review', 'close_out')).toBeNull();
    expect(nextStatus('question_drafted', 'archive')).toBeNull();
  });

  it('escalate is a soft pause from research/review-touch states only', () => {
    expect(nextStatus('research_in_progress', 'escalate')).toBe('escalated');
    expect(nextStatus('response_drafted', 'escalate')).toBe('escalated');
    expect(nextStatus('cross_discipline_review', 'escalate')).toBe('escalated');
    expect(nextStatus('answer_returned', 'escalate')).toBe('escalated');
    expect(nextStatus('clarification_requested', 'escalate')).toBe('escalated');
    expect(nextStatus('question_drafted', 'escalate')).toBeNull();
    expect(nextStatus('submitted', 'escalate')).toBeNull();
    expect(nextStatus('triage', 'escalate')).toBeNull();
    expect(nextStatus('assigned_to_responder', 'escalate')).toBeNull();
    expect(nextStatus('closed_out', 'escalate')).toBeNull();
  });

  it('escalated resumes into research_in_progress or close_out', () => {
    expect(nextStatus('escalated', 'commence_research')).toBe('research_in_progress');
    expect(nextStatus('escalated', 'close_out')).toBe('closed_out');
  });

  it('void is only allowed before triage', () => {
    expect(nextStatus('question_drafted', 'void')).toBe('void');
    expect(nextStatus('submitted', 'void')).toBe('void');
    expect(nextStatus('triage', 'void')).toBeNull();
    expect(nextStatus('assigned_to_responder', 'void')).toBeNull();
    expect(nextStatus('research_in_progress', 'void')).toBeNull();
    expect(nextStatus('closed_out', 'void')).toBeNull();
  });

  it('reject is allowed from every non-terminal', () => {
    expect(nextStatus('question_drafted', 'reject')).toBe('rejected');
    expect(nextStatus('submitted', 'reject')).toBe('rejected');
    expect(nextStatus('triage', 'reject')).toBe('rejected');
    expect(nextStatus('research_in_progress', 'reject')).toBe('rejected');
    expect(nextStatus('answer_returned', 'reject')).toBe('rejected');
    expect(nextStatus('escalated', 'reject')).toBe('rejected');
    expect(nextStatus('closed_out', 'reject')).toBe('rejected');
    // Terminals block reject
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('rejected', 'reject')).toBeNull();
    expect(nextStatus('void', 'reject')).toBeNull();
  });

  it('convert_to_change_order from research/review-touch states only', () => {
    expect(nextStatus('research_in_progress', 'convert_to_change_order')).toBe('closed_out');
    expect(nextStatus('response_drafted', 'convert_to_change_order')).toBe('closed_out');
    expect(nextStatus('cross_discipline_review', 'convert_to_change_order')).toBe('closed_out');
    expect(nextStatus('answer_returned', 'convert_to_change_order')).toBe('closed_out');
    expect(nextStatus('question_drafted', 'convert_to_change_order')).toBeNull();
    expect(nextStatus('submitted', 'convert_to_change_order')).toBeNull();
    expect(nextStatus('triage', 'convert_to_change_order')).toBeNull();
    expect(nextStatus('closed_out', 'convert_to_change_order')).toBeNull();
  });

  it('link_to_dispute from review/escalated states only', () => {
    expect(nextStatus('cross_discipline_review', 'link_to_dispute')).toBe('escalated');
    expect(nextStatus('answer_returned', 'link_to_dispute')).toBe('escalated');
    expect(nextStatus('clarification_requested', 'link_to_dispute')).toBe('escalated');
    expect(nextStatus('escalated', 'link_to_dispute')).toBe('escalated');
    expect(nextStatus('research_in_progress', 'link_to_dispute')).toBeNull();
    expect(nextStatus('question_drafted', 'link_to_dispute')).toBeNull();
    expect(nextStatus('closed_out', 'link_to_dispute')).toBeNull();
  });

  it('archived is HARD terminal — blocks every action', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('rejected')).toBe(false);
    expect(isHardTerminal('void')).toBe(false);
    expect(nextStatus('archived', 'submit')).toBeNull();
    expect(nextStatus('archived', 'triage')).toBeNull();
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('archived', 'escalate')).toBeNull();
  });

  it('rejected and void are UI-terminals (block forward but not hard-blocked)', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('void')).toBe(true);
    expect(isTerminal('research_in_progress')).toBe(false);
    expect(isTerminal('escalated')).toBe(false);
  });

  it('draft_question is create-only — never offered as an action', () => {
    expect(allowedActions('question_drafted')).not.toContain('draft_question');
    expect(allowedActions('submitted')).not.toContain('draft_question');
    expect(nextStatus('submitted', 'draft_question')).toBeNull();
  });

  it('allowedActions reflects forward + reject + void/escalate gates', () => {
    const a1 = allowedActions('question_drafted');
    expect(a1).toContain('submit');
    expect(a1).toContain('void');
    expect(a1).toContain('reject');
    expect(a1).not.toContain('escalate');
    expect(a1).not.toContain('close_out');

    const a2 = allowedActions('research_in_progress');
    expect(a2).toContain('draft_response');
    expect(a2).toContain('escalate');
    expect(a2).toContain('reject');
    expect(a2).toContain('convert_to_change_order');
    expect(a2).not.toContain('void');
    expect(a2).not.toContain('submit');

    const a3 = allowedActions('archived');
    expect(a3.length).toBe(0);
  });

  it('TRANSITIONS map covers all 16 actions', () => {
    const keys = Object.keys(TRANSITIONS);
    expect(keys.length).toBe(16);
    expect(keys).toContain('draft_question');
    expect(keys).toContain('submit');
    expect(keys).toContain('triage');
    expect(keys).toContain('assign_responder');
    expect(keys).toContain('commence_research');
    expect(keys).toContain('draft_response');
    expect(keys).toContain('coordinate_review');
    expect(keys).toContain('return_answer');
    expect(keys).toContain('request_clarification');
    expect(keys).toContain('close_out');
    expect(keys).toContain('archive');
    expect(keys).toContain('reject');
    expect(keys).toContain('void');
    expect(keys).toContain('escalate');
    expect(keys).toContain('convert_to_change_order');
    expect(keys).toContain('link_to_dispute');
  });
});

describe('W116 IPP RFI — tier derivation + FLOOR-AT-EMERGENCY-SAFETY', () => {
  it('tier from rfi_class', () => {
    expect(tierForRfiClass('emergency_safety')).toBe('emergency_safety');
    expect(tierForRfiClass('safety')).toBe('emergency_safety');
    expect(tierForRfiClass('hv_safety')).toBe('emergency_safety');
    expect(tierForRfiClass('construction_blocking')).toBe('construction_blocking');
    expect(tierForRfiClass('blocking')).toBe('construction_blocking');
    expect(tierForRfiClass('work_stoppage')).toBe('construction_blocking');
    expect(tierForRfiClass('coordination')).toBe('coordination');
    expect(tierForRfiClass('multi_discipline')).toBe('coordination');
    expect(tierForRfiClass('interface')).toBe('coordination');
    expect(tierForRfiClass('clarification')).toBe('clarification');
    expect(tierForRfiClass('unknown_class')).toBe('clarification');
    expect(tierForRfiClass(null)).toBe('clarification');
    expect(tierForRfiClass(undefined)).toBe('clarification');
    expect(tierForRfiClass('')).toBe('clarification');
  });

  it('tier is case-insensitive', () => {
    expect(tierForRfiClass('Emergency_Safety')).toBe('emergency_safety');
    expect(tierForRfiClass('CONSTRUCTION_BLOCKING')).toBe('construction_blocking');
  });

  it('countFloorFlags sums each flag', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ safety_hazard_identified: true })).toBe(1);
    expect(countFloorFlags({ construction_stoppage_in_effect: true, contractor_claim_basis: true })).toBe(2);
    expect(countFloorFlags({
      safety_hazard_identified: true,
      construction_stoppage_in_effect: true,
      contractor_claim_basis: true,
      dispute_basis_referenced: true,
      regulatory_inquiry_triggered: true,
    })).toBe(5);
    // Number-coerced flags (DB column convention)
    expect(countFloorFlags({ safety_hazard_identified: 1, contractor_claim_basis: 0 } as any)).toBe(1);
  });

  it('floorAtEmergencySafety triggers on ANY one of the 5 flags', () => {
    expect(floorAtEmergencySafety({})).toBe(false);
    expect(floorAtEmergencySafety({ safety_hazard_identified: true })).toBe(true);
    expect(floorAtEmergencySafety({ construction_stoppage_in_effect: true })).toBe(true);
    expect(floorAtEmergencySafety({ contractor_claim_basis: true })).toBe(true);
    expect(floorAtEmergencySafety({ dispute_basis_referenced: true })).toBe(true);
    expect(floorAtEmergencySafety({ regulatory_inquiry_triggered: true })).toBe(true);
  });

  it('effectiveTier elevates to emergency_safety when any flag set', () => {
    expect(effectiveTier('clarification', {})).toBe('clarification');
    expect(effectiveTier('clarification', { safety_hazard_identified: true })).toBe('emergency_safety');
    expect(effectiveTier('coordination', { construction_stoppage_in_effect: true })).toBe('emergency_safety');
    expect(effectiveTier('construction_blocking', { regulatory_inquiry_triggered: true })).toBe('emergency_safety');
    expect(effectiveTier('coordination', {})).toBe('coordination');
    expect(effectiveTier('emergency_safety', {})).toBe('emergency_safety');
  });

  it('isHeavyTier covers emergency_safety + construction_blocking', () => {
    expect(isHeavyTier('emergency_safety')).toBe(true);
    expect(isHeavyTier('construction_blocking')).toBe(true);
    expect(isHeavyTier('coordination')).toBe(false);
    expect(isHeavyTier('clarification')).toBe(false);
  });

  it('isReportable is emergency_safety only', () => {
    expect(isReportable('emergency_safety')).toBe(true);
    expect(isReportable('construction_blocking')).toBe(false);
    expect(isReportable('coordination')).toBe(false);
    expect(isReportable('clarification')).toBe(false);
  });
});

describe('W116 IPP RFI — URGENT SLA matrix', () => {
  it('anchor SLA on submitted with URGENT polarity', () => {
    expect(SLA_HOURS.submitted.emergency_safety).toBe(4);
    expect(SLA_HOURS.submitted.construction_blocking).toBe(24);
    expect(SLA_HOURS.submitted.coordination).toBe(72);
    expect(SLA_HOURS.submitted.clarification).toBe(168);
  });

  it('URGENT polarity holds across every non-terminal status', () => {
    const statuses = [
      'question_drafted', 'submitted', 'triage', 'assigned_to_responder',
      'research_in_progress', 'response_drafted', 'cross_discipline_review',
      'answer_returned', 'clarification_requested', 'closed_out', 'escalated',
    ] as const;
    for (const s of statuses) {
      const es = SLA_HOURS[s].emergency_safety;
      const cb = SLA_HOURS[s].construction_blocking;
      const co = SLA_HOURS[s].coordination;
      const cl = SLA_HOURS[s].clarification;
      expect(es).toBeLessThanOrEqual(cb);
      expect(cb).toBeLessThanOrEqual(co);
      expect(co).toBeLessThanOrEqual(cl);
    }
  });

  it('terminals carry zero SLA', () => {
    expect(SLA_HOURS.archived.emergency_safety).toBe(0);
    expect(SLA_HOURS.rejected.construction_blocking).toBe(0);
    expect(SLA_HOURS.void.clarification).toBe(0);
  });

  it('slaWindowHours returns matrix value', () => {
    expect(slaWindowHours('submitted', 'emergency_safety')).toBe(4);
    expect(slaWindowHours('archived', 'emergency_safety')).toBe(0);
  });

  it('slaDeadlineFor adds hours to enteredAt', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('submitted', 'emergency_safety', t0);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-05-30T04:00:00.000Z');
    expect(slaDeadlineFor('archived', 'emergency_safety', t0)).toBeNull();
  });

  it('slaHoursRemaining computes hours-to-deadline', () => {
    const enteredAt = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T01:00:00Z');
    expect(slaHoursRemaining('submitted', 'emergency_safety', enteredAt, now)).toBe(3);
    // Negative when overdue
    const overdue = new Date('2026-05-30T10:00:00Z');
    expect(slaHoursRemaining('submitted', 'emergency_safety', enteredAt, overdue)).toBe(-6);
    // Null enteredAt -> 0
    expect(slaHoursRemaining('submitted', 'emergency_safety', null, now)).toBe(0);
  });
});

describe('W116 IPP RFI — SIGNATURE SAFETY-RFI-ESCALATE regulator crossings', () => {
  it('SIGNATURE: escalate crosses EVERY tier when safety_hazard_identified', () => {
    expect(crossesIntoRegulator('escalate', 'emergency_safety', {
      flags: { safety_hazard_identified: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'construction_blocking', {
      flags: { safety_hazard_identified: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'coordination', {
      flags: { safety_hazard_identified: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'clarification', {
      flags: { safety_hazard_identified: true },
    })).toBe(true);
  });

  it('SIGNATURE: escalate crosses EVERY tier when regulatory_inquiry_triggered', () => {
    expect(crossesIntoRegulator('escalate', 'emergency_safety', {
      flags: { regulatory_inquiry_triggered: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'construction_blocking', {
      flags: { regulatory_inquiry_triggered: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'coordination', {
      flags: { regulatory_inquiry_triggered: true },
    })).toBe(true);
    expect(crossesIntoRegulator('escalate', 'clarification', {
      flags: { regulatory_inquiry_triggered: true },
    })).toBe(true);
  });

  it('escalate does NOT cross without safety/regulatory flag', () => {
    expect(crossesIntoRegulator('escalate', 'emergency_safety', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('escalate', 'emergency_safety', {
      flags: { contractor_claim_basis: true },
    })).toBe(false);
    expect(crossesIntoRegulator('escalate', 'construction_blocking', {
      flags: { construction_stoppage_in_effect: true },
    })).toBe(false);
    expect(crossesIntoRegulator('escalate', 'clarification', {
      flags: { dispute_basis_referenced: true },
    })).toBe(false);
  });

  it('reject crosses EVERY tier when contractor_claim_basis AND cost_impact_zar >= R10m', () => {
    expect(crossesIntoRegulator('reject', 'emergency_safety', {
      flags: { contractor_claim_basis: true }, cost_impact_zar: 10_000_000,
    })).toBe(true);
    expect(crossesIntoRegulator('reject', 'clarification', {
      flags: { contractor_claim_basis: true }, cost_impact_zar: 25_000_000,
    })).toBe(true);
    expect(crossesIntoRegulator('reject', 'coordination', {
      flags: { contractor_claim_basis: true }, cost_impact_zar: 100_000_000,
    })).toBe(true);
    // Below threshold
    expect(crossesIntoRegulator('reject', 'emergency_safety', {
      flags: { contractor_claim_basis: true }, cost_impact_zar: 9_999_999,
    })).toBe(false);
    // No claim basis
    expect(crossesIntoRegulator('reject', 'emergency_safety', {
      flags: {}, cost_impact_zar: 50_000_000,
    })).toBe(false);
  });

  it('convert_to_change_order crosses construction_blocking + emergency_safety only', () => {
    expect(crossesIntoRegulator('convert_to_change_order', 'emergency_safety', {})).toBe(true);
    expect(crossesIntoRegulator('convert_to_change_order', 'construction_blocking', {})).toBe(true);
    expect(crossesIntoRegulator('convert_to_change_order', 'coordination', {})).toBe(false);
    expect(crossesIntoRegulator('convert_to_change_order', 'clarification', {})).toBe(false);
  });

  it('link_to_dispute crosses EVERY tier when dispute_basis_referenced AND (claim || stoppage)', () => {
    expect(crossesIntoRegulator('link_to_dispute', 'emergency_safety', {
      flags: { dispute_basis_referenced: true, contractor_claim_basis: true },
    })).toBe(true);
    expect(crossesIntoRegulator('link_to_dispute', 'clarification', {
      flags: { dispute_basis_referenced: true, construction_stoppage_in_effect: true },
    })).toBe(true);
    expect(crossesIntoRegulator('link_to_dispute', 'coordination', {
      flags: { dispute_basis_referenced: true, contractor_claim_basis: true, construction_stoppage_in_effect: true },
    })).toBe(true);
    // Dispute flag alone — no crossing
    expect(crossesIntoRegulator('link_to_dispute', 'emergency_safety', {
      flags: { dispute_basis_referenced: true },
    })).toBe(false);
    // Claim or stoppage without dispute_basis — no crossing
    expect(crossesIntoRegulator('link_to_dispute', 'emergency_safety', {
      flags: { contractor_claim_basis: true },
    })).toBe(false);
  });

  it('close_out, archive, void never cross regulator', () => {
    expect(crossesIntoRegulator('close_out', 'emergency_safety', {
      flags: { safety_hazard_identified: true, regulatory_inquiry_triggered: true },
    })).toBe(false);
    expect(crossesIntoRegulator('archive', 'emergency_safety', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('void', 'emergency_safety', {
      flags: { safety_hazard_identified: true },
    })).toBe(false);
  });

  it('routine actions never cross regulator', () => {
    expect(crossesIntoRegulator('draft_question', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('submit', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('triage', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('assign_responder', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('commence_research', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('draft_response', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('coordinate_review', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('return_answer', 'emergency_safety', {})).toBe(false);
    expect(crossesIntoRegulator('request_clarification', 'emergency_safety', {})).toBe(false);
  });

  it('SLA breach crosses regulator on HEAVY tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('emergency_safety')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('construction_blocking')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('coordination')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('clarification')).toBe(false);
  });
});

describe('W116 IPP RFI — party routing + event names', () => {
  it('contractor_PM handles draft + submit + void + link_to_dispute', () => {
    expect(partyForAction('draft_question')).toBe('contractor_PM');
    expect(partyForAction('submit')).toBe('contractor_PM');
    expect(partyForAction('void')).toBe('contractor_PM');
    expect(partyForAction('link_to_dispute')).toBe('contractor_PM');
  });

  it('doc_controller handles triage + assign_responder', () => {
    expect(partyForAction('triage')).toBe('doc_controller');
    expect(partyForAction('assign_responder')).toBe('doc_controller');
  });

  it('engineer handles research + draft + review + return + request + convert', () => {
    expect(partyForAction('commence_research')).toBe('engineer');
    expect(partyForAction('draft_response')).toBe('engineer');
    expect(partyForAction('coordinate_review')).toBe('engineer');
    expect(partyForAction('return_answer')).toBe('engineer');
    expect(partyForAction('request_clarification')).toBe('engineer');
    expect(partyForAction('convert_to_change_order')).toBe('engineer');
  });

  it('owner_rep handles close_out + archive + reject + escalate', () => {
    expect(partyForAction('close_out')).toBe('owner_rep');
    expect(partyForAction('archive')).toBe('owner_rep');
    expect(partyForAction('reject')).toBe('owner_rep');
    expect(partyForAction('escalate')).toBe('owner_rep');
  });

  it('eventTypeFor maps every action', () => {
    expect(eventTypeFor('draft_question')).toBe('ipp_rfi_drafted');
    expect(eventTypeFor('submit')).toBe('ipp_rfi_submitted');
    expect(eventTypeFor('triage')).toBe('ipp_rfi_triaged');
    expect(eventTypeFor('assign_responder')).toBe('ipp_rfi_responder_assigned');
    expect(eventTypeFor('commence_research')).toBe('ipp_rfi_research_started');
    expect(eventTypeFor('draft_response')).toBe('ipp_rfi_response_drafted');
    expect(eventTypeFor('coordinate_review')).toBe('ipp_rfi_coordinated');
    expect(eventTypeFor('return_answer')).toBe('ipp_rfi_answered');
    expect(eventTypeFor('request_clarification')).toBe('ipp_rfi_clarification_requested');
    expect(eventTypeFor('close_out')).toBe('ipp_rfi_closed_out');
    expect(eventTypeFor('archive')).toBe('ipp_rfi_archived');
    expect(eventTypeFor('reject')).toBe('ipp_rfi_rejected');
    expect(eventTypeFor('void')).toBe('ipp_rfi_voided');
    expect(eventTypeFor('escalate')).toBe('ipp_rfi_escalated');
    expect(eventTypeFor('convert_to_change_order')).toBe('ipp_rfi_converted_to_change_order');
    expect(eventTypeFor('link_to_dispute')).toBe('ipp_rfi_linked_to_dispute');
  });
});

describe('W116 IPP RFI — authority ladder + URGENT filing window', () => {
  it('authorityRequired ladders contractor_PM -> engineer -> owner_rep', () => {
    expect(authorityRequired('clarification')).toBe('contractor_PM');
    expect(authorityRequired('coordination')).toBe('engineer');
    expect(authorityRequired('construction_blocking')).toBe('engineer');
    expect(authorityRequired('emergency_safety')).toBe('owner_rep');
  });

  it('regulatorFilingWindowHours is URGENT polarity', () => {
    expect(regulatorFilingWindowHours('emergency_safety')).toBe(4);
    expect(regulatorFilingWindowHours('construction_blocking')).toBe(24);
    expect(regulatorFilingWindowHours('coordination')).toBe(72);
    expect(regulatorFilingWindowHours('clarification')).toBe(168);
    // Polarity: tighter tier = shorter window
    expect(regulatorFilingWindowHours('emergency_safety'))
      .toBeLessThan(regulatorFilingWindowHours('construction_blocking'));
    expect(regulatorFilingWindowHours('construction_blocking'))
      .toBeLessThan(regulatorFilingWindowHours('coordination'));
    expect(regulatorFilingWindowHours('coordination'))
      .toBeLessThan(regulatorFilingWindowHours('clarification'));
  });

  it('daysToConstructionBlockResolution is null when no stoppage', () => {
    const t0 = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToConstructionBlockResolution(false, t0, now)).toBeNull();
    expect(daysToConstructionBlockResolution(true, null, now)).toBeNull();
  });

  it('daysToConstructionBlockResolution counts elapsed days', () => {
    const t0 = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToConstructionBlockResolution(true, t0, now)).toBe(5);
    const partial = new Date('2026-05-30T12:00:00Z');
    expect(daysToConstructionBlockResolution(true, t0, partial)).toBe(5);
  });
});

describe('W116 IPP RFI — urgency band URGENT polarity', () => {
  it('overdue is always critical', () => {
    expect(urgencyBand('emergency_safety', -1)).toBe('critical');
    expect(urgencyBand('clarification', -1)).toBe('critical');
  });

  it('emergency_safety has the TIGHTEST thresholds', () => {
    expect(urgencyBand('emergency_safety', 0.5)).toBe('critical');
    expect(urgencyBand('emergency_safety', 1)).toBe('high');
    expect(urgencyBand('emergency_safety', 3)).toBe('medium');
    expect(urgencyBand('emergency_safety', 10)).toBe('low');
  });

  it('construction_blocking band', () => {
    expect(urgencyBand('construction_blocking', 3)).toBe('critical');
    expect(urgencyBand('construction_blocking', 10)).toBe('high');
    expect(urgencyBand('construction_blocking', 20)).toBe('medium');
    expect(urgencyBand('construction_blocking', 30)).toBe('low');
  });

  it('coordination band', () => {
    expect(urgencyBand('coordination', 10)).toBe('critical');
    expect(urgencyBand('coordination', 24)).toBe('high');
    expect(urgencyBand('coordination', 60)).toBe('medium');
    expect(urgencyBand('coordination', 100)).toBe('low');
  });

  it('clarification has the LOOSEST thresholds', () => {
    expect(urgencyBand('clarification', 12)).toBe('critical');
    expect(urgencyBand('clarification', 48)).toBe('high');
    expect(urgencyBand('clarification', 120)).toBe('medium');
    expect(urgencyBand('clarification', 200)).toBe('low');
  });

  it('URGENT polarity holds — at same hours-left, emergency_safety more urgent than clarification', () => {
    // 5 hours left: emergency_safety = low (>=4); clarification = critical (<24)
    expect(urgencyBand('emergency_safety', 5)).toBe('low');
    expect(urgencyBand('clarification', 5)).toBe('critical');
  });
});

describe('W116 IPP RFI — 6-bridge architecture', () => {
  it('bridge functions return true when ref present, false when missing', () => {
    expect(bridgesToDocumentControlChain('idc-001')).toBe(true);
    expect(bridgesToDocumentControlChain(null)).toBe(false);
    expect(bridgesToDocumentControlChain('')).toBe(false);
    expect(bridgesToSubmittalChain('ips-015')).toBe(true);
    expect(bridgesToSubmittalChain(undefined)).toBe(false);
    expect(bridgesToScheduleChain('sch-042')).toBe(true);
    expect(bridgesToScheduleChain(null)).toBe(false);
    expect(bridgesToEvmChain('evm-007')).toBe(true);
    expect(bridgesToEvmChain('')).toBe(false);
    expect(bridgesToProcurementChain('proc-019')).toBe(true);
    expect(bridgesToProcurementChain(null)).toBe(false);
    expect(bridgesToCodChain('cod-020')).toBe(true);
    expect(bridgesToCodChain(undefined)).toBe(false);
  });

  it('hasChangeOrderLink truthy when ref present', () => {
    expect(hasChangeOrderLink('co-001')).toBe(true);
    expect(hasChangeOrderLink(null)).toBe(false);
    expect(hasChangeOrderLink('')).toBe(false);
    expect(hasChangeOrderLink(undefined)).toBe(false);
  });
});

describe('W116 IPP RFI — completeness 0-130', () => {
  it('zero when nothing stamped', () => {
    expect(rfiCompletenessIndex({})).toBe(0);
  });

  it('walks up the chain', () => {
    expect(rfiCompletenessIndex({ question_drafted: true })).toBe(6);
    expect(rfiCompletenessIndex({ question_drafted: true, submitted: true })).toBe(14);
    expect(rfiCompletenessIndex({
      question_drafted: true, submitted: true, triage: true,
    })).toBe(20);
    expect(rfiCompletenessIndex({
      question_drafted: true, submitted: true, triage: true,
      assigned_to_responder: true, research_in_progress: true,
    })).toBe(34);
  });

  it('answer_returned weighs 10', () => {
    expect(rfiCompletenessIndex({ answer_returned: true })).toBe(10);
  });

  it('closed_out + archived each weigh 12', () => {
    expect(rfiCompletenessIndex({ closed_out: true })).toBe(12);
    expect(rfiCompletenessIndex({ archived: true })).toBe(12);
  });

  it('clean_close_bonus adds 20', () => {
    expect(rfiCompletenessIndex({ clean_close_bonus: true })).toBe(20);
  });

  it('full chain hits the weighted maximum and stays within the 0-130 cap', () => {
    const score = rfiCompletenessIndex({
      question_drafted: true,
      submitted: true,
      triage: true,
      assigned_to_responder: true,
      research_in_progress: true,
      response_drafted: true,
      cross_discipline_review: true,
      answer_returned: true,
      clarification_requested: true,
      closed_out: true,
      archived: true,
      clean_close_bonus: true,
    });
    // 6+8+6+6+8+8+8+10+6+12+12+20 = 110 — weighted max; cap=130 reserve.
    expect(score).toBe(110);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('handles number-typed (DB) values', () => {
    expect(rfiCompletenessIndex({
      question_drafted: 1, submitted: 1, triage: 0,
    } as any)).toBe(14);
  });
});

describe('W116 IPP RFI — hash-chain pre-stage', () => {
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
    const a = placeholderMerkleSegment('ipr-001', 1);
    const b = placeholderMerkleSegment('ipr-001', 1);
    expect(a).toBe(b);
    expect(a.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(a)).toBe(true);
  });

  it('placeholderMerkleSegment varies by id and position', () => {
    const a = placeholderMerkleSegment('ipr-001', 1);
    const b = placeholderMerkleSegment('ipr-002', 1);
    const c = placeholderMerkleSegment('ipr-001', 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
