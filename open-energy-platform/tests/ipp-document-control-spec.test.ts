// Wave 114 — IPP Document Control & Drawing Register spec test battery.
//
// Covers: state machine (forward path + branches + terminals + hold-resume +
// revision-open from IFC/as-built), tier derivation + FLOOR-AT-SAFETY-
// CRITICAL on every flag combination, URGENT SLA matrix anchored on
// transmitted, SIGNATURE DOCUMENT-REJECT-CRITICAL crossings (reject EVERY
// tier when safety_critical OR ifc_blocking; withdraw EVERY tier when
// reached_ifc; approve safety_critical only when hv_electrical OR
// commissioning_critical_path; archive no regulator; sla_breached
// safety_critical + electrical only), party routing (3 parties),
// authority ladder + URGENT filing window, urgency band (URGENT
// polarity — safety_critical tightest), 5-bridge architecture
// (W112/W113/W19/W20/W18), IDC matrix status, document completeness
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
  tierForDocumentClass,
  countFloorFlags,
  floorAtSafetyCritical,
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
  idcStatusFor,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToCodChain,
  bridgesToPlannedOutageChain,
  documentCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
} from '../src/utils/ipp-document-control-spec';

describe('W114 IPP Document Control — state machine', () => {
  it('walks the forward path draft_uploaded → archived', () => {
    expect(nextStatus('draft_uploaded', 'index_metadata')).toBe('metadata_indexed');
    expect(nextStatus('metadata_indexed', 'assign_IDC')).toBe('IDC_assigned');
    expect(nextStatus('IDC_assigned', 'transmit')).toBe('transmitted');
    expect(nextStatus('transmitted', 'start_review')).toBe('reviewed');
    expect(nextStatus('reviewed', 'comment')).toBe('commented');
    expect(nextStatus('commented', 'revise')).toBe('revised');
    expect(nextStatus('revised', 'approve')).toBe('approved');
    expect(nextStatus('approved', 'issue_for_construction')).toBe('issued_for_construction');
    expect(nextStatus('issued_for_construction', 'finalise_as_built')).toBe('as_built_finalised');
    expect(nextStatus('as_built_finalised', 'archive')).toBe('archived');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('draft_uploaded', 'assign_IDC')).toBeNull();
    expect(nextStatus('metadata_indexed', 'transmit')).toBeNull();
    expect(nextStatus('IDC_assigned', 'start_review')).toBeNull();
    expect(nextStatus('transmitted', 'approve')).toBeNull();
    expect(nextStatus('approved', 'finalise_as_built')).toBeNull();
    expect(nextStatus('archived', 'index_metadata')).toBeNull();
  });

  it('supports open_revision from metadata_indexed / IFC / as-built', () => {
    expect(nextStatus('metadata_indexed', 'open_revision')).toBe('revision_open');
    expect(nextStatus('issued_for_construction', 'open_revision')).toBe('revision_open');
    expect(nextStatus('as_built_finalised', 'open_revision')).toBe('revision_open');
    // Not available from draft_uploaded / IDC_assigned / transmitted
    expect(nextStatus('draft_uploaded', 'open_revision')).toBeNull();
    expect(nextStatus('IDC_assigned', 'open_revision')).toBeNull();
    expect(nextStatus('transmitted', 'open_revision')).toBeNull();
  });

  it('revision_open can assign_IDC and skip back into the IDC loop', () => {
    expect(nextStatus('revision_open', 'assign_IDC')).toBe('IDC_assigned');
  });

  it('approve is reachable from reviewed/commented/revised', () => {
    expect(nextStatus('reviewed', 'approve')).toBe('approved');
    expect(nextStatus('commented', 'approve')).toBe('approved');
    expect(nextStatus('revised', 'approve')).toBe('approved');
  });

  it('hold is a soft pause from review-touch states only', () => {
    expect(nextStatus('transmitted', 'hold')).toBe('hold');
    expect(nextStatus('reviewed', 'hold')).toBe('hold');
    expect(nextStatus('commented', 'hold')).toBe('hold');
    expect(nextStatus('revised', 'hold')).toBe('hold');
    // Not available from draft / metadata / IDC_assigned / approved / IFC
    expect(nextStatus('draft_uploaded', 'hold')).toBeNull();
    expect(nextStatus('metadata_indexed', 'hold')).toBeNull();
    expect(nextStatus('IDC_assigned', 'hold')).toBeNull();
    expect(nextStatus('approved', 'hold')).toBeNull();
    expect(nextStatus('issued_for_construction', 'hold')).toBeNull();
  });

  it('resume goes from hold back to reviewed', () => {
    expect(nextStatus('hold', 'resume')).toBe('reviewed');
    expect(nextStatus('reviewed', 'resume')).toBeNull();
  });

  it('allows reject from any non-terminal state', () => {
    expect(nextStatus('draft_uploaded', 'reject')).toBe('rejected');
    expect(nextStatus('metadata_indexed', 'reject')).toBe('rejected');
    expect(nextStatus('revision_open', 'reject')).toBe('rejected');
    expect(nextStatus('IDC_assigned', 'reject')).toBe('rejected');
    expect(nextStatus('transmitted', 'reject')).toBe('rejected');
    expect(nextStatus('reviewed', 'reject')).toBe('rejected');
    expect(nextStatus('commented', 'reject')).toBe('rejected');
    expect(nextStatus('revised', 'reject')).toBe('rejected');
    expect(nextStatus('approved', 'reject')).toBe('rejected');
    expect(nextStatus('issued_for_construction', 'reject')).toBe('rejected');
    expect(nextStatus('as_built_finalised', 'reject')).toBe('rejected');
    expect(nextStatus('hold', 'reject')).toBe('rejected');
    // hard terminal rejects reject
    expect(nextStatus('archived', 'reject')).toBeNull();
  });

  it('allows withdraw from any non-terminal state', () => {
    expect(nextStatus('draft_uploaded', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('metadata_indexed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('IDC_assigned', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('transmitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('approved', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('issued_for_construction', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('as_built_finalised', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('hold', 'withdraw')).toBe('withdrawn');
    // hard terminal rejects withdraw
    expect(nextStatus('archived', 'withdraw')).toBeNull();
  });

  it('upload_drawing is idempotent on draft_uploaded only', () => {
    expect(nextStatus('draft_uploaded', 'upload_drawing')).toBe('draft_uploaded');
    expect(nextStatus('metadata_indexed', 'upload_drawing')).toBeNull();
    expect(nextStatus('IDC_assigned', 'upload_drawing')).toBeNull();
  });

  it('index_metadata is idempotent from metadata_indexed', () => {
    expect(nextStatus('metadata_indexed', 'index_metadata')).toBe('metadata_indexed');
  });

  it('transmit is idempotent from transmitted', () => {
    expect(nextStatus('transmitted', 'transmit')).toBe('transmitted');
  });

  it('start_review is idempotent from reviewed', () => {
    expect(nextStatus('reviewed', 'start_review')).toBe('reviewed');
  });

  it('identifies hard terminals correctly', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('rejected')).toBe(false);
    expect(isHardTerminal('withdrawn')).toBe(false);
    expect(isHardTerminal('hold')).toBe(false);
    expect(isHardTerminal('issued_for_construction')).toBe(false);
  });

  it('identifies UI terminals correctly', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('hold')).toBe(false);
    expect(isTerminal('approved')).toBe(false);
  });

  it('allowedActions covers expected transitions from transmitted', () => {
    const a = allowedActions('transmitted');
    expect(a).toContain('transmit');
    expect(a).toContain('start_review');
    expect(a).toContain('hold');
    expect(a).toContain('reject');
    expect(a).toContain('withdraw');
    expect(a).not.toContain('upload_drawing');
    expect(a).not.toContain('archive');
  });

  it('allowedActions returns empty for hard terminal', () => {
    expect(allowedActions('archived')).toEqual([]);
  });

  it('TRANSITIONS table covers all 16 actions', () => {
    const actions = Object.keys(TRANSITIONS);
    expect(actions).toHaveLength(16);
  });
});

describe('W114 IPP Document Control — tier derivation + FLOOR overlays', () => {
  it('derives tier from document_class', () => {
    expect(tierForDocumentClass('safety_critical')).toBe('safety_critical');
    expect(tierForDocumentClass('hv_electrical')).toBe('safety_critical');
    expect(tierForDocumentClass('protection')).toBe('safety_critical');
    expect(tierForDocumentClass('electrical')).toBe('electrical');
    expect(tierForDocumentClass('lv_electrical')).toBe('electrical');
    expect(tierForDocumentClass('controls')).toBe('electrical');
    expect(tierForDocumentClass('instrumentation')).toBe('electrical');
    expect(tierForDocumentClass('mechanical')).toBe('mechanical');
    expect(tierForDocumentClass('bop')).toBe('mechanical');
    expect(tierForDocumentClass('piping')).toBe('mechanical');
    expect(tierForDocumentClass('civil')).toBe('civil');
  });

  it('defaults unknown / null document_class to civil', () => {
    expect(tierForDocumentClass('unknown')).toBe('civil');
    expect(tierForDocumentClass('')).toBe('civil');
    expect(tierForDocumentClass(null)).toBe('civil');
    expect(tierForDocumentClass(undefined)).toBe('civil');
  });

  it('tier derivation is case-insensitive', () => {
    expect(tierForDocumentClass('HV_ELECTRICAL')).toBe('safety_critical');
    expect(tierForDocumentClass('Mechanical')).toBe('mechanical');
    expect(tierForDocumentClass('Electrical')).toBe('electrical');
  });

  it('counts floor flags accurately', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ hv_electrical: true })).toBe(1);
    expect(countFloorFlags({
      hv_electrical: true,
      commissioning_critical_path: true,
    })).toBe(2);
    expect(countFloorFlags({
      hv_electrical: 1,
      commissioning_critical_path: 1,
      safety_signoff_required: 1,
      ifc_blocking: 1,
      regulatory_submittal: 1,
    })).toBe(5);
  });

  it('FLOOR-AT-SAFETY-CRITICAL on any one flag', () => {
    expect(floorAtSafetyCritical({})).toBe(false);
    expect(floorAtSafetyCritical({ hv_electrical: true })).toBe(true);
    expect(floorAtSafetyCritical({ commissioning_critical_path: true })).toBe(true);
    expect(floorAtSafetyCritical({ safety_signoff_required: true })).toBe(true);
    expect(floorAtSafetyCritical({ ifc_blocking: true })).toBe(true);
    expect(floorAtSafetyCritical({ regulatory_submittal: true })).toBe(true);
  });

  it('effectiveTier elevates civil/mechanical/electrical to safety_critical on 1 flag', () => {
    expect(effectiveTier('civil', { hv_electrical: true })).toBe('safety_critical');
    expect(effectiveTier('mechanical', { commissioning_critical_path: true })).toBe('safety_critical');
    expect(effectiveTier('electrical', { safety_signoff_required: true })).toBe('safety_critical');
    expect(effectiveTier('civil', { ifc_blocking: true })).toBe('safety_critical');
    expect(effectiveTier('mechanical', { regulatory_submittal: true })).toBe('safety_critical');
  });

  it('effectiveTier is identity with zero flags', () => {
    expect(effectiveTier('civil', {})).toBe('civil');
    expect(effectiveTier('mechanical', {})).toBe('mechanical');
    expect(effectiveTier('electrical', {})).toBe('electrical');
    expect(effectiveTier('safety_critical', {})).toBe('safety_critical');
  });

  it('safety_critical stays safety_critical on flags', () => {
    expect(effectiveTier('safety_critical', { hv_electrical: true })).toBe('safety_critical');
    expect(effectiveTier('safety_critical', {
      hv_electrical: true,
      ifc_blocking: true,
    })).toBe('safety_critical');
  });

  it('isHeavyTier / isReportable narrow correctly', () => {
    expect(isHeavyTier('civil')).toBe(false);
    expect(isHeavyTier('mechanical')).toBe(false);
    expect(isHeavyTier('electrical')).toBe(true);
    expect(isHeavyTier('safety_critical')).toBe(true);
    expect(isReportable('civil')).toBe(false);
    expect(isReportable('mechanical')).toBe(false);
    expect(isReportable('electrical')).toBe(false);
    expect(isReportable('safety_critical')).toBe(true);
  });
});

describe('W114 IPP Document Control — URGENT SLA matrix', () => {
  it('anchor SLA on transmitted is URGENT (safety_critical tightest)', () => {
    expect(slaWindowHours('transmitted', 'safety_critical')).toBe(24);
    expect(slaWindowHours('transmitted', 'electrical')).toBe(72);
    expect(slaWindowHours('transmitted', 'mechanical')).toBe(120);
    expect(slaWindowHours('transmitted', 'civil')).toBe(168);
  });

  it('all non-terminal states have URGENT windows (safety_critical <= civil)', () => {
    for (const status of Object.keys(SLA_HOURS)) {
      const matrix = SLA_HOURS[status as keyof typeof SLA_HOURS];
      if (matrix.civil === 0 && matrix.mechanical === 0 && matrix.electrical === 0 && matrix.safety_critical === 0) continue;
      expect(matrix.safety_critical).toBeLessThanOrEqual(matrix.electrical);
      expect(matrix.electrical).toBeLessThanOrEqual(matrix.mechanical);
      expect(matrix.mechanical).toBeLessThanOrEqual(matrix.civil);
    }
  });

  it('terminal states have zero SLA', () => {
    expect(slaWindowHours('archived', 'safety_critical')).toBe(0);
    expect(slaWindowHours('rejected', 'civil')).toBe(0);
    expect(slaWindowHours('withdrawn', 'electrical')).toBe(0);
  });

  it('slaDeadlineFor computes correct deadline', () => {
    const t0 = new Date('2026-05-30T10:00:00Z');
    const deadline = slaDeadlineFor('transmitted', 'safety_critical', t0);
    expect(deadline).not.toBeNull();
    // 24 hours
    expect(deadline!.getTime() - t0.getTime()).toBe(24 * 3600 * 1000);
  });

  it('slaDeadlineFor returns null for terminal status', () => {
    const t0 = new Date('2026-05-30T10:00:00Z');
    expect(slaDeadlineFor('archived', 'safety_critical', t0)).toBeNull();
    expect(slaDeadlineFor('rejected', 'civil', t0)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'electrical', t0)).toBeNull();
  });

  it('slaHoursRemaining returns 0 for null entry', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    expect(slaHoursRemaining('transmitted', 'safety_critical', null, now)).toBe(0);
  });

  it('slaHoursRemaining counts correctly', () => {
    const enteredAt = new Date('2026-05-30T10:00:00Z');
    const now = new Date('2026-05-30T16:00:00Z'); // 6h elapsed
    const remaining = slaHoursRemaining('transmitted', 'safety_critical', enteredAt, now);
    // 24 - 6 = 18
    expect(remaining).toBe(18);
  });

  it('slaHoursRemaining returns negative when past deadline', () => {
    const enteredAt = new Date('2026-05-29T10:00:00Z');
    const now = new Date('2026-05-30T16:00:00Z'); // 30h elapsed, SLA was 24
    const remaining = slaHoursRemaining('transmitted', 'safety_critical', enteredAt, now);
    expect(remaining).toBeLessThan(0);
  });
});

describe('W114 IPP Document Control — SIGNATURE regulator crossings', () => {
  it('W114 SIGNATURE: reject crosses EVERY tier when safety_critical', () => {
    for (const tier of ['civil', 'mechanical', 'electrical', 'safety_critical'] as const) {
      // safety_critical tier always crosses on reject
      expect(crossesIntoRegulator('reject', 'safety_critical', {
        flags: {},
      })).toBe(true);
      // any tier crosses when ifc_blocking is set
      expect(crossesIntoRegulator('reject', tier, {
        flags: { ifc_blocking: true },
      })).toBe(true);
    }
  });

  it('W114 SIGNATURE: reject crosses EVERY tier when ifc_blocking flag set', () => {
    expect(crossesIntoRegulator('reject', 'civil', { flags: { ifc_blocking: true } })).toBe(true);
    expect(crossesIntoRegulator('reject', 'mechanical', { flags: { ifc_blocking: true } })).toBe(true);
    expect(crossesIntoRegulator('reject', 'electrical', { flags: { ifc_blocking: true } })).toBe(true);
    expect(crossesIntoRegulator('reject', 'safety_critical', { flags: { ifc_blocking: true } })).toBe(true);
  });

  it('reject does NOT cross civil/mechanical/electrical when no flags + non-safety tier', () => {
    expect(crossesIntoRegulator('reject', 'civil', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('reject', 'mechanical', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('reject', 'electrical', { flags: {} })).toBe(false);
  });

  it('withdraw crosses EVERY tier when reached_ifc is true', () => {
    for (const tier of ['civil', 'mechanical', 'electrical', 'safety_critical'] as const) {
      expect(crossesIntoRegulator('withdraw', tier, { reached_ifc: true })).toBe(true);
    }
  });

  it('withdraw does NOT cross when reached_ifc is false', () => {
    expect(crossesIntoRegulator('withdraw', 'safety_critical', { reached_ifc: false })).toBe(false);
    expect(crossesIntoRegulator('withdraw', 'civil', { reached_ifc: false })).toBe(false);
    expect(crossesIntoRegulator('withdraw', 'electrical', {})).toBe(false);
  });

  it('approve crosses safety_critical when hv_electrical', () => {
    expect(crossesIntoRegulator('approve', 'safety_critical', {
      flags: { hv_electrical: true },
    })).toBe(true);
  });

  it('approve crosses safety_critical when commissioning_critical_path', () => {
    expect(crossesIntoRegulator('approve', 'safety_critical', {
      flags: { commissioning_critical_path: true },
    })).toBe(true);
  });

  it('approve does NOT cross safety_critical when neither hv_electrical nor commissioning_critical_path', () => {
    expect(crossesIntoRegulator('approve', 'safety_critical', {
      flags: { ifc_blocking: true },
    })).toBe(false);
    expect(crossesIntoRegulator('approve', 'safety_critical', {
      flags: { regulatory_submittal: true },
    })).toBe(false);
  });

  it('approve does NOT cross non-safety_critical tiers regardless of flags', () => {
    expect(crossesIntoRegulator('approve', 'electrical', {
      flags: { hv_electrical: true, commissioning_critical_path: true },
    })).toBe(false);
    expect(crossesIntoRegulator('approve', 'mechanical', {
      flags: { hv_electrical: true },
    })).toBe(false);
    expect(crossesIntoRegulator('approve', 'civil', {
      flags: { commissioning_critical_path: true },
    })).toBe(false);
  });

  it('archive never crosses regulator', () => {
    for (const tier of ['civil', 'mechanical', 'electrical', 'safety_critical'] as const) {
      expect(crossesIntoRegulator('archive', tier, {
        flags: {
          hv_electrical: true,
          commissioning_critical_path: true,
          ifc_blocking: true,
        },
        reached_ifc: true,
      })).toBe(false);
    }
  });

  it('routine transitions do not cross regulator', () => {
    for (const tier of ['civil', 'mechanical', 'electrical', 'safety_critical'] as const) {
      expect(crossesIntoRegulator('upload_drawing', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('index_metadata', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('assign_IDC', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('transmit', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('start_review', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('comment', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('revise', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('issue_for_construction', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('finalise_as_built', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('hold', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('resume', tier, { flags: {} })).toBe(false);
      expect(crossesIntoRegulator('open_revision', tier, { flags: {} })).toBe(false);
    }
  });

  it('slaBreachCrossesIntoRegulator covers safety_critical + electrical only', () => {
    expect(slaBreachCrossesIntoRegulator('civil')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('mechanical')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('electrical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('safety_critical')).toBe(true);
  });
});

describe('W114 IPP Document Control — party routing + event names', () => {
  it('routes doc_controller actions correctly', () => {
    expect(partyForAction('upload_drawing')).toBe('doc_controller');
    expect(partyForAction('index_metadata')).toBe('doc_controller');
    expect(partyForAction('open_revision')).toBe('doc_controller');
    expect(partyForAction('assign_IDC')).toBe('doc_controller');
    expect(partyForAction('transmit')).toBe('doc_controller');
    expect(partyForAction('hold')).toBe('doc_controller');
    expect(partyForAction('resume')).toBe('doc_controller');
    expect(partyForAction('archive')).toBe('doc_controller');
  });

  it('routes engineer_of_record actions correctly', () => {
    expect(partyForAction('start_review')).toBe('engineer_of_record');
    expect(partyForAction('comment')).toBe('engineer_of_record');
    expect(partyForAction('revise')).toBe('engineer_of_record');
    expect(partyForAction('approve')).toBe('engineer_of_record');
    expect(partyForAction('issue_for_construction')).toBe('engineer_of_record');
    expect(partyForAction('finalise_as_built')).toBe('engineer_of_record');
    expect(partyForAction('reject')).toBe('engineer_of_record');
  });

  it('routes IPP_CEO actions correctly', () => {
    expect(partyForAction('withdraw')).toBe('IPP_CEO');
  });

  it('event types match action names with ipp_doc_control_ prefix', () => {
    expect(eventTypeFor('upload_drawing')).toBe('ipp_doc_control_uploaded');
    expect(eventTypeFor('index_metadata')).toBe('ipp_doc_control_indexed');
    expect(eventTypeFor('open_revision')).toBe('ipp_doc_control_revision_open');
    expect(eventTypeFor('assign_IDC')).toBe('ipp_doc_control_idc_assigned');
    expect(eventTypeFor('transmit')).toBe('ipp_doc_control_transmitted');
    expect(eventTypeFor('start_review')).toBe('ipp_doc_control_review_started');
    expect(eventTypeFor('comment')).toBe('ipp_doc_control_commented');
    expect(eventTypeFor('revise')).toBe('ipp_doc_control_revised');
    expect(eventTypeFor('approve')).toBe('ipp_doc_control_approved');
    expect(eventTypeFor('issue_for_construction')).toBe('ipp_doc_control_issued_for_construction');
    expect(eventTypeFor('finalise_as_built')).toBe('ipp_doc_control_as_built_finalised');
    expect(eventTypeFor('archive')).toBe('ipp_doc_control_archived');
    expect(eventTypeFor('reject')).toBe('ipp_doc_control_rejected');
    expect(eventTypeFor('withdraw')).toBe('ipp_doc_control_withdrawn');
    expect(eventTypeFor('hold')).toBe('ipp_doc_control_held');
    expect(eventTypeFor('resume')).toBe('ipp_doc_control_resumed');
  });
});

describe('W114 IPP Document Control — authority ladder + URGENT filing window', () => {
  it('authorityRequired ladder is 3-step', () => {
    expect(authorityRequired('civil')).toBe('doc_controller');
    expect(authorityRequired('mechanical')).toBe('engineer_of_record');
    expect(authorityRequired('electrical')).toBe('engineer_of_record');
    expect(authorityRequired('safety_critical')).toBe('IPP_CEO');
  });

  it('regulator filing window is URGENT (safety_critical tightest)', () => {
    expect(regulatorFilingWindowHours('safety_critical')).toBe(24);
    expect(regulatorFilingWindowHours('electrical')).toBe(48);
    expect(regulatorFilingWindowHours('mechanical')).toBe(72);
    expect(regulatorFilingWindowHours('civil')).toBe(168);
  });
});

describe('W114 IPP Document Control — urgency band URGENT polarity', () => {
  it('negative hours always critical', () => {
    expect(urgencyBand('safety_critical', -1)).toBe('critical');
    expect(urgencyBand('civil', -100)).toBe('critical');
  });

  it('safety_critical tier has TIGHTEST urgency thresholds', () => {
    expect(urgencyBand('safety_critical', 3)).toBe('critical');
    expect(urgencyBand('safety_critical', 6)).toBe('high');
    expect(urgencyBand('safety_critical', 12)).toBe('medium');
    expect(urgencyBand('safety_critical', 24)).toBe('low');
  });

  it('civil tier has LOOSEST urgency thresholds', () => {
    expect(urgencyBand('civil', 12)).toBe('critical');
    expect(urgencyBand('civil', 48)).toBe('high');
    expect(urgencyBand('civil', 96)).toBe('medium');
    expect(urgencyBand('civil', 168)).toBe('low');
  });

  it('thresholds shrink across tiers (URGENT)', () => {
    // 24 hours across tiers:
    // safety_critical (thresholds 4/8/16) → low; electrical (8/24/48) → high (just under boundary);
    // mechanical (12/36/72) → medium; civil (24/72/120) → critical at boundary.
    expect(urgencyBand('safety_critical', 24)).toBe('low');
    expect(urgencyBand('electrical', 23)).toBe('high');
    expect(urgencyBand('mechanical', 40)).toBe('medium');
    expect(urgencyBand('civil', 23)).toBe('critical');
  });

  it('electrical tier sits between safety_critical and mechanical', () => {
    expect(urgencyBand('electrical', 4)).toBe('critical');
    expect(urgencyBand('electrical', 16)).toBe('high');
    expect(urgencyBand('electrical', 32)).toBe('medium');
    expect(urgencyBand('electrical', 60)).toBe('low');
  });
});

describe('W114 IPP Document Control — 5-bridge architecture', () => {
  it('bridges to W112 schedule chain when ref present', () => {
    expect(bridgesToScheduleChain('ips-001')).toBe(true);
    expect(bridgesToScheduleChain(null)).toBe(false);
    expect(bridgesToScheduleChain('')).toBe(false);
    expect(bridgesToScheduleChain(undefined)).toBe(false);
  });

  it('bridges to W113 EVM chain when ref present', () => {
    expect(bridgesToEvmChain('ipe-001')).toBe(true);
    expect(bridgesToEvmChain(undefined)).toBe(false);
  });

  it('bridges to W19 procurement chain when ref present', () => {
    expect(bridgesToProcurementChain('proc-001')).toBe(true);
    expect(bridgesToProcurementChain(null)).toBe(false);
  });

  it('bridges to W20 COD chain when ref present', () => {
    expect(bridgesToCodChain('cod-001')).toBe(true);
    expect(bridgesToCodChain(null)).toBe(false);
  });

  it('bridges to W18 planned outage chain when ref present', () => {
    expect(bridgesToPlannedOutageChain('po-001')).toBe(true);
    expect(bridgesToPlannedOutageChain(null)).toBe(false);
  });
});

describe('W114 IPP Document Control — IDC matrix status', () => {
  it('returns open for pre-IDC states', () => {
    expect(idcStatusFor('draft_uploaded')).toBe('open');
    expect(idcStatusFor('metadata_indexed')).toBe('open');
    expect(idcStatusFor('revision_open')).toBe('open');
    expect(idcStatusFor('IDC_assigned')).toBe('open');
  });

  it('returns review for review-touch states + hold', () => {
    expect(idcStatusFor('transmitted')).toBe('review');
    expect(idcStatusFor('reviewed')).toBe('review');
    expect(idcStatusFor('commented')).toBe('review');
    expect(idcStatusFor('revised')).toBe('review');
    expect(idcStatusFor('hold')).toBe('review');
  });

  it('returns approved for approved + IFC states', () => {
    expect(idcStatusFor('approved')).toBe('approved');
    expect(idcStatusFor('issued_for_construction')).toBe('approved');
  });

  it('returns closed for as_built_finalised + archived', () => {
    expect(idcStatusFor('as_built_finalised')).toBe('closed');
    expect(idcStatusFor('archived')).toBe('closed');
  });

  it('rejected + withdrawn fall back to open (revision lifecycle ends)', () => {
    expect(idcStatusFor('rejected')).toBe('open');
    expect(idcStatusFor('withdrawn')).toBe('open');
  });
});

describe('W114 IPP Document Control — completeness 0-130', () => {
  it('zero when nothing stamped', () => {
    expect(documentCompletenessIndex({})).toBe(0);
  });

  it('clean run with all milestones + bonus caps at 130', () => {
    const score = documentCompletenessIndex({
      draft_uploaded: true,
      metadata_indexed: true,
      revision_open: true,
      IDC_assigned: true,
      transmitted: true,
      reviewed: true,
      commented: true,
      revised: true,
      approved: true,
      issued_for_construction: true,
      as_built_finalised: true,
      archived: true,
      clean_archive_bonus: true,
    });
    // 8*8 + 10 + 12 + 12 + 12 + 20 = 64 + 10 + 12 + 12 + 12 + 20 = 130
    expect(score).toBe(130);
  });

  it('partial uploads + indexing give partial credit', () => {
    const score = documentCompletenessIndex({
      draft_uploaded: true,
      metadata_indexed: true,
    });
    // 8 + 8 = 16
    expect(score).toBe(16);
  });

  it('clean_archive_bonus weights 20', () => {
    const score = documentCompletenessIndex({
      archived: true,
      clean_archive_bonus: true,
    });
    // 12 + 20 = 32
    expect(score).toBe(32);
  });

  it('caps total at 130 even with all milestones', () => {
    const score = documentCompletenessIndex({
      draft_uploaded: true,
      metadata_indexed: true,
      revision_open: true,
      IDC_assigned: true,
      transmitted: true,
      reviewed: true,
      commented: true,
      revised: true,
      approved: true,
      issued_for_construction: true,
      as_built_finalised: true,
      archived: true,
      clean_archive_bonus: true,
    });
    expect(score).toBeLessThanOrEqual(130);
  });

  it('approve + IFC + as_built ladder weights as configured', () => {
    const score = documentCompletenessIndex({
      approved: true,
      issued_for_construction: true,
      as_built_finalised: true,
    });
    // 10 + 12 + 12 = 34
    expect(score).toBe(34);
  });
});

describe('W114 IPP Document Control — hash-chain pre-stage for W118', () => {
  it('starts at position 1 when no prior position', () => {
    expect(hashChainPositionFor(null)).toBe(1);
    expect(hashChainPositionFor(undefined)).toBe(1);
    expect(hashChainPositionFor(0)).toBe(1);
  });

  it('increments existing position monotonically', () => {
    expect(hashChainPositionFor(1)).toBe(2);
    expect(hashChainPositionFor(10)).toBe(11);
    expect(hashChainPositionFor(99)).toBe(100);
  });

  it('handles invalid input defensively', () => {
    expect(hashChainPositionFor(-1)).toBe(1);
    expect(hashChainPositionFor(NaN)).toBe(1);
  });

  it('placeholder merkle segment is 64-char hex', () => {
    const seg = placeholderMerkleSegment('idc-001', 1);
    expect(seg).toMatch(/^[0-9a-f]{64}$/);
  });

  it('placeholder merkle segment is deterministic per (doc, position)', () => {
    const a = placeholderMerkleSegment('idc-001', 1);
    const b = placeholderMerkleSegment('idc-001', 1);
    expect(a).toBe(b);
  });

  it('placeholder merkle segment differs per position', () => {
    const a = placeholderMerkleSegment('idc-001', 1);
    const b = placeholderMerkleSegment('idc-001', 2);
    expect(a).not.toBe(b);
  });

  it('placeholder merkle segment differs per document id', () => {
    const a = placeholderMerkleSegment('idc-001', 1);
    const b = placeholderMerkleSegment('idc-002', 1);
    expect(a).not.toBe(b);
  });
});
