// Wave 100 — IPP Handover Dossier spec tests.
import { describe, expect, it } from 'vitest';
import {
  nextStatus,
  isTerminal,
  isHighTier,
  tierFromInputs,
  slaMinutesFor,
  authorityFor,
  ballInCourtFor,
  isReportable,
  actionCrossesRegulator,
  urgencyBandFor,
  handoverCompletenessIndex,
  predictedCloseDate,
  partyForAction,
  eventTypeFor,
  inboxSeverityForTier,
} from '../src/utils/handover-dossier-spec';

describe('W100 Handover Dossier — state machine', () => {
  it('clean forward path dossier_compiled -> submitted -> under_review -> approved', () => {
    expect(nextStatus('dossier_compiled', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'open_review')).toBe('under_review');
    expect(nextStatus('under_review', 'approve')).toBe('approved');
  });

  it('acceptance block approved -> witnessed_acceptance_scheduled -> witnessed_acceptance', () => {
    expect(nextStatus('approved', 'schedule_witnessed_acceptance')).toBe('witnessed_acceptance_scheduled');
    expect(nextStatus('witnessed_acceptance_scheduled', 'complete_witnessed_acceptance')).toBe('witnessed_acceptance');
  });

  it('turnover block witnessed_acceptance -> punch_remediated -> training_transferred -> warranty_activated -> operations_owned -> archived', () => {
    expect(nextStatus('witnessed_acceptance', 'remediate_punch')).toBe('punch_remediated');
    expect(nextStatus('punch_remediated', 'transfer_training')).toBe('training_transferred');
    expect(nextStatus('training_transferred', 'activate_warranty')).toBe('warranty_activated');
    expect(nextStatus('warranty_activated', 'transfer_to_operations')).toBe('operations_owned');
    expect(nextStatus('operations_owned', 'archive')).toBe('archived');
  });

  it('revision loop under_review -> revision_required -> submitted (rejoin)', () => {
    expect(nextStatus('under_review', 'require_revision')).toBe('revision_required');
    expect(nextStatus('revision_required', 'revise_and_resubmit')).toBe('submitted');
  });

  it('reject reachable from submitted / under_review only', () => {
    expect(nextStatus('submitted', 'reject')).toBe('rejected');
    expect(nextStatus('under_review', 'reject')).toBe('rejected');
    expect(nextStatus('approved', 'reject')).toBe(null);
    expect(nextStatus('warranty_activated', 'reject')).toBe(null);
  });

  it('withdraw reachable from dossier_compiled / submitted only', () => {
    expect(nextStatus('dossier_compiled', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('under_review', 'withdraw')).toBe(null);
    expect(nextStatus('approved', 'withdraw')).toBe(null);
  });

  it('void reachable from every non-terminal state', () => {
    for (const s of [
      'dossier_compiled', 'submitted', 'under_review', 'revision_required',
      'approved', 'witnessed_acceptance_scheduled', 'witnessed_acceptance',
      'punch_remediated', 'training_transferred', 'warranty_activated',
      'operations_owned',
    ] as const) {
      expect(nextStatus(s, 'void')).toBe('voided');
    }
  });

  it('terminals stop the machine', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('voided')).toBe(true);
    expect(isTerminal('dossier_compiled')).toBe(false);
    expect(isTerminal('operations_owned')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('dossier_compiled', 'approve')).toBe(null);
    expect(nextStatus('approved', 'transfer_to_operations')).toBe(null);
    expect(nextStatus('archived', 'submit')).toBe(null);
  });
});

describe('W100 Handover Dossier — tier derivation with FLOOR-AT-HIGH', () => {
  const baseFlags = {
    blocksWarrantyStart: false,
    blocksOmHandover: false,
    incompleteAsBuilt: false,
    untransferredSpares: false,
  };

  it('training_documentation_pack + low priority + no flags = low tier', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'training_documentation_pack',
      ...baseFlags,
    })).toBe('low');
  });

  it('protection_relay_package floors at critical regardless of priority', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'protection_relay_package',
      ...baseFlags,
    })).toBe('critical');
  });

  it('transformer_bay floors at critical', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'transformer_bay',
      ...baseFlags,
    })).toBe('critical');
  });

  it('blocks_warranty_start flag floors low -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'training_documentation_pack',
      ...baseFlags, blocksWarrantyStart: true,
    })).toBe('high');
  });

  it('blocks_om_handover flag floors low -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'training_documentation_pack',
      ...baseFlags, blocksOmHandover: true,
    })).toBe('high');
  });

  it('incomplete_as_built flag floors standard -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'standard', workflowClass: 'civil_structural',
      ...baseFlags, incompleteAsBuilt: true,
    })).toBe('high');
  });

  it('untransferred_spares flag floors low -> high', () => {
    expect(tierFromInputs({
      priorityClass: 'low', workflowClass: 'spare_parts_kit',
      ...baseFlags, untransferredSpares: true,
    })).toBe('high');
  });

  it('priority outranks workflow when higher', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'training_documentation_pack',
      ...baseFlags,
    })).toBe('critical');
  });

  it('floor does not downgrade an already-critical tier', () => {
    expect(tierFromInputs({
      priorityClass: 'critical', workflowClass: 'training_documentation_pack',
      ...baseFlags, blocksWarrantyStart: true,
    })).toBe('critical');
  });
});

describe('W100 Handover Dossier — URGENT SLA polarity (warranty-clock-running = tightest)', () => {
  it('critical tier tighter than low tier on submitted', () => {
    const c = slaMinutesFor('submitted', 'critical')!;
    const l = slaMinutesFor('submitted', 'low')!;
    expect(c).toBeLessThan(l);
  });

  it('warranty_activated tightest at critical (warranty clock running)', () => {
    // warranty_activated must be tighter than any other active state at critical
    const warranty = slaMinutesFor('warranty_activated', 'critical')!;
    const submitted = slaMinutesFor('submitted', 'critical')!;
    const approved = slaMinutesFor('approved', 'critical')!;
    expect(warranty).toBeLessThan(submitted);
    expect(warranty).toBeLessThan(approved);
  });

  it('post-acceptance active states <=240 min at critical', () => {
    expect(slaMinutesFor('witnessed_acceptance', 'critical')).toBeLessThanOrEqual(240);
    expect(slaMinutesFor('punch_remediated', 'critical')).toBeLessThanOrEqual(240);
    expect(slaMinutesFor('training_transferred', 'critical')).toBeLessThanOrEqual(240);
  });

  it('terminal states have null SLA windows', () => {
    expect(slaMinutesFor('archived', 'critical')).toBe(null);
    expect(slaMinutesFor('rejected', 'high')).toBe(null);
    expect(slaMinutesFor('withdrawn', 'standard')).toBe(null);
    expect(slaMinutesFor('voided', 'low')).toBe(null);
  });
});

describe('W100 Handover Dossier — authority + ball-in-court', () => {
  it('authority ladder ascends with tier', () => {
    expect(authorityFor('low')).toBe('project_engineer');
    expect(authorityFor('standard')).toBe('commissioning_engineer');
    expect(authorityFor('high')).toBe('operations_manager');
    expect(authorityFor('critical')).toBe('handover_director');
  });

  it('ball-in-court reflects party doing the next move', () => {
    expect(ballInCourtFor('dossier_compiled')).toBe('handover_coordinator');
    expect(ballInCourtFor('submitted')).toBe('independent_engineer');
    expect(ballInCourtFor('revision_required')).toBe('contractor');
    expect(ballInCourtFor('witnessed_acceptance')).toBe('contractor');
    expect(ballInCourtFor('training_transferred')).toBe('warranty_administrator');
    expect(ballInCourtFor('warranty_activated')).toBe('operations_manager');
    expect(ballInCourtFor('operations_owned')).toBe('operations_manager');
  });

  it('terminal states have no ball-in-court', () => {
    expect(ballInCourtFor('archived')).toBe(null);
    expect(ballInCourtFor('rejected')).toBe(null);
    expect(ballInCourtFor('withdrawn')).toBe(null);
    expect(ballInCourtFor('voided')).toBe(null);
  });
});

describe('W100 Handover Dossier — SIGNATURE regulator crossings', () => {
  const flagsBase = {
    blocksWarrantyStart: false,
    blocksOmHandover: false,
    incompleteAsBuilt: false,
    untransferredSpares: false,
  };

  it('SIGNATURE approve -> regulator EVERY tier when blocks_warranty_start', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'approve', tier, ...flagsBase, blocksWarrantyStart: true,
      })).toBe(true);
    }
  });

  it('approve does NOT cross without blocks_warranty_start', () => {
    expect(actionCrossesRegulator({
      action: 'approve', tier: 'critical', ...flagsBase,
    })).toBe(false);
  });

  it('SIGNATURE transfer_to_operations crosses EVERY tier on warranty OR om_handover', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'transfer_to_operations', tier, ...flagsBase, blocksWarrantyStart: true,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'transfer_to_operations', tier, ...flagsBase, blocksOmHandover: true,
      })).toBe(true);
    }
  });

  it('SIGNATURE void crosses EVERY tier on incomplete_as_built OR untransferred_spares', () => {
    for (const tier of ['low', 'standard', 'high', 'critical'] as const) {
      expect(actionCrossesRegulator({
        action: 'void', tier, ...flagsBase, incompleteAsBuilt: true,
      })).toBe(true);
      expect(actionCrossesRegulator({
        action: 'void', tier, ...flagsBase, untransferredSpares: true,
      })).toBe(true);
    }
  });

  it('void without material gaps does NOT cross', () => {
    expect(actionCrossesRegulator({
      action: 'void', tier: 'critical', ...flagsBase,
    })).toBe(false);
  });

  it('routine actions do not cross', () => {
    for (const action of ['open_review', 'require_revision', 'revise_and_resubmit',
      'schedule_witnessed_acceptance', 'complete_witnessed_acceptance',
      'remediate_punch', 'transfer_training', 'activate_warranty',
      'archive', 'submit'] as const) {
      expect(actionCrossesRegulator({
        action, tier: 'critical', ...flagsBase,
        blocksWarrantyStart: true, blocksOmHandover: true,
        incompleteAsBuilt: true, untransferredSpares: true,
      })).toBe(false);
    }
  });
});

describe('W100 Handover Dossier — urgency band, reportable, severity', () => {
  it('terminal == terminal band', () => {
    expect(urgencyBandFor(120, true)).toBe('terminal');
    expect(urgencyBandFor(null, true)).toBe('terminal');
  });

  it('breached SLA = red', () => {
    expect(urgencyBandFor(-15, false)).toBe('red');
  });

  it('amber zone 240..1440 min', () => {
    expect(urgencyBandFor(300, false)).toBe('amber');
    expect(urgencyBandFor(1000, false)).toBe('amber');
  });

  it('yellow zone 1440..4320 min', () => {
    expect(urgencyBandFor(1500, false)).toBe('yellow');
    expect(urgencyBandFor(4000, false)).toBe('yellow');
  });

  it('green zone beyond 4320 min', () => {
    expect(urgencyBandFor(5000, false)).toBe('green');
    expect(urgencyBandFor(null, false)).toBe('green');
  });

  it('isReportable mirrors high tier flag', () => {
    expect(isReportable('low')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('high')).toBe(true);
    expect(isReportable('critical')).toBe(true);
  });

  it('inbox severity ladder', () => {
    expect(inboxSeverityForTier('critical')).toBe('high');
    expect(inboxSeverityForTier('high')).toBe('medium');
    expect(inboxSeverityForTier('standard')).toBe('low');
    expect(inboxSeverityForTier('low')).toBe('low');
  });
});

describe('W100 Handover Dossier — 0-130 handoverCompletenessIndex', () => {
  const base = {
    withinSla: true, revisionCount: 0, ballInCourtClear: true,
    asBuiltCompletenessPct: 85, sparePartsCompletenessPct: 85,
    trainingCompletionPct: 85, witnessedAcceptanceClear: false,
    warrantyActivated: false,
  };

  it('baseline 100 with mid-band completeness and no bonuses', () => {
    expect(handoverCompletenessIndex(base)).toBe(100);
  });

  it('SLA miss penalty -25', () => {
    expect(handoverCompletenessIndex({ ...base, withinSla: false })).toBe(75);
  });

  it('revision penalty -10 per revision', () => {
    expect(handoverCompletenessIndex({ ...base, revisionCount: 1 })).toBe(90);
    expect(handoverCompletenessIndex({ ...base, revisionCount: 2 })).toBe(80);
  });

  it('as-built >=95 = +10 bonus; <80 = -10 penalty', () => {
    expect(handoverCompletenessIndex({ ...base, asBuiltCompletenessPct: 96 })).toBe(110);
    expect(handoverCompletenessIndex({ ...base, asBuiltCompletenessPct: 70 })).toBe(90);
  });

  it('spare parts >=90 = +10; <70 = -10', () => {
    expect(handoverCompletenessIndex({ ...base, sparePartsCompletenessPct: 95 })).toBe(110);
    expect(handoverCompletenessIndex({ ...base, sparePartsCompletenessPct: 60 })).toBe(90);
  });

  it('training >=90 = +10; <70 = -5', () => {
    expect(handoverCompletenessIndex({ ...base, trainingCompletionPct: 95 })).toBe(110);
    expect(handoverCompletenessIndex({ ...base, trainingCompletionPct: 60 })).toBe(95);
  });

  it('witnessed_acceptance_clear bonus +10', () => {
    expect(handoverCompletenessIndex({ ...base, witnessedAcceptanceClear: true })).toBe(110);
  });

  it('warranty_activated bonus +5', () => {
    expect(handoverCompletenessIndex({ ...base, warrantyActivated: true })).toBe(105);
  });

  it('caps at 130 with all bonuses stacked', () => {
    expect(handoverCompletenessIndex({
      withinSla: true, revisionCount: 0, ballInCourtClear: true,
      asBuiltCompletenessPct: 100, sparePartsCompletenessPct: 100,
      trainingCompletionPct: 100, witnessedAcceptanceClear: true,
      warrantyActivated: true,
    })).toBe(130);
  });

  it('floors at 0 under maximum penalty stack', () => {
    expect(handoverCompletenessIndex({
      withinSla: false, revisionCount: 20, ballInCourtClear: false,
      asBuiltCompletenessPct: 0, sparePartsCompletenessPct: 0,
      trainingCompletionPct: 0, witnessedAcceptanceClear: false,
      warrantyActivated: false,
    })).toBe(0);
  });
});

describe('W100 Handover Dossier — predicted close date sums forward path', () => {
  it('produces a positive duration on early state', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const eta = predictedCloseDate('dossier_compiled', 'critical', now);
    expect(eta).not.toBe(null);
    expect(eta!.getTime() - now.getTime()).toBeGreaterThan(0);
  });

  it('revision_required path takes longer than approved path at same tier', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const etaRevision = predictedCloseDate('revision_required', 'high', now);
    const etaApproved = predictedCloseDate('approved', 'high', now);
    expect(etaRevision!.getTime()).toBeGreaterThan(etaApproved!.getTime());
  });

  it('terminal status returns null', () => {
    const now = new Date();
    expect(predictedCloseDate('archived', 'critical', now)).toBe(null);
    expect(predictedCloseDate('voided', 'low', now)).toBe(null);
  });
});

describe('W100 Handover Dossier — party-from-action mapping', () => {
  it('handover_coordinator submits and withdraws', () => {
    expect(partyForAction('submit')).toBe('handover_coordinator');
    expect(partyForAction('withdraw')).toBe('handover_coordinator');
  });

  it('independent_engineer reviews and approves', () => {
    expect(partyForAction('open_review')).toBe('independent_engineer');
    expect(partyForAction('approve')).toBe('independent_engineer');
    expect(partyForAction('reject')).toBe('independent_engineer');
  });

  it('contractor remediates punch and revises', () => {
    expect(partyForAction('remediate_punch')).toBe('contractor');
    expect(partyForAction('revise_and_resubmit')).toBe('contractor');
  });

  it('warranty_administrator activates warranty', () => {
    expect(partyForAction('activate_warranty')).toBe('warranty_administrator');
  });

  it('operations_manager owns turnover and archive', () => {
    expect(partyForAction('transfer_to_operations')).toBe('operations_manager');
    expect(partyForAction('archive')).toBe('operations_manager');
  });

  it('owner voids', () => {
    expect(partyForAction('void')).toBe('owner');
  });
});

describe('W100 Handover Dossier — event type encoding', () => {
  it('eventTypeFor prefixes with handover_dossier.', () => {
    expect(eventTypeFor('submit')).toBe('handover_dossier.submit');
    expect(eventTypeFor('activate_warranty')).toBe('handover_dossier.activate_warranty');
    expect(eventTypeFor('transfer_to_operations')).toBe('handover_dossier.transfer_to_operations');
    expect(eventTypeFor('archive')).toBe('handover_dossier.archive');
  });
});

describe('W100 Handover Dossier — isHighTier predicate', () => {
  it('critical and high are high-tier; standard and low are not', () => {
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('high')).toBe(true);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('low')).toBe(false);
  });
});
