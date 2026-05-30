// Wave 100 — IPP Mechanical / Electrical Handover Dossier + Turnover-to-
// Operations spec.
//
// The construction-to-O&M turnover package a best-in-class IPP-PM stack ships
// at practical completion. Beats Procore Handover + Aconex Handover + BIM 360
// Handover + Bentley ProjectWise/AssetWise + e-Builder Closeout + ServiceNow
// Handover + SAP S/4HANA Asset Handover + IBM Maximo Asset Handover by chaining
// witnessed acceptance + as-built + spare-parts + training + warranty
// activation + ownership-of-operations into a regulator inbox with floor-at-
// high tier override and a 0-130 handover completeness index gated on the four
// "package-clear" sub-indices (as-built %, spare-parts %, training %,
// witnessed-acceptance-clear).
//
// 12-state P6 lifecycle:
//   dossier_compiled -> submit -> submitted
//     -> open_review -> under_review
//       -> require_revision -> revision_required (loop)
//          -> revise_and_resubmit -> submitted (rejoin)
//       -> approve -> approved
//         -> schedule_witnessed_acceptance ->
//            witnessed_acceptance_scheduled
//           -> complete_witnessed_acceptance -> witnessed_acceptance
//             -> remediate_punch -> punch_remediated
//               -> transfer_training -> training_transferred
//                 -> activate_warranty -> warranty_activated
//                   -> transfer_to_operations -> operations_owned
//                     -> archive -> archived
//   reject       -> rejected   (terminal — submitted / under_review only)
//   withdraw     -> withdrawn  (terminal — dossier / submitted only)
//   void         -> voided     (terminal — any non-terminal)
//
// Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
// for any of the 4 coverage flags:
//   blocks_warranty_start    (warranty-clock-running — every day of slippage
//                             cuts OEM coverage)
//   blocks_om_handover       (REIPPPP O&M handover gate)
//   incomplete_as_built      (as-built drawings/manuals not at 95%+)
//   untransferred_spares     (mandatory critical spares not delivered)
//
// URGENT SLA polarity (warranty-clock-running = tightest — warranty cost meter
// is live and a single day's delay materially erodes OEM coverage).
//
// SIGNATURE (W100 — REIPPPP O&M handover + NERSA §C-5 + OHSA s24):
//   approve              -> regulator EVERY tier when blocks_warranty_start
//   operations_owned     -> regulator EVERY tier when blocks_warranty_start
//                           OR blocks_om_handover (turnover-to-operations
//                           closure event)
//   void                 -> regulator EVERY tier when incomplete_as_built
//                           OR untransferred_spares (asset transfer cannot
//                           silently lapse without a regulator-visible record)
//   sla_breached         -> regulator EVERY tier when blocks_warranty_start;
//                           high+critical when blocks_om_handover

export type HandoverStatus =
  | 'dossier_compiled' | 'submitted' | 'under_review' | 'revision_required'
  | 'approved' | 'witnessed_acceptance_scheduled' | 'witnessed_acceptance'
  | 'punch_remediated' | 'training_transferred' | 'warranty_activated'
  | 'operations_owned' | 'archived'
  | 'rejected' | 'withdrawn' | 'voided';

export type HandoverAction =
  | 'submit' | 'open_review' | 'require_revision' | 'revise_and_resubmit'
  | 'approve' | 'schedule_witnessed_acceptance'
  | 'complete_witnessed_acceptance' | 'remediate_punch'
  | 'transfer_training' | 'activate_warranty'
  | 'transfer_to_operations' | 'archive'
  | 'reject' | 'withdraw' | 'void';

export type HandoverWorkflowClass =
  | 'mechanical_drivetrain' | 'electrical_balance_of_plant'
  | 'inverter_skid' | 'transformer_bay' | 'battery_storage_skid'
  | 'scada_dms_integration' | 'civil_structural'
  | 'protection_relay_package' | 'spare_parts_kit'
  | 'training_documentation_pack';

export type HandoverPriorityClass = 'critical' | 'high' | 'standard' | 'low';
export type HandoverTier = 'critical' | 'high' | 'standard' | 'low';

export type HandoverUrgencyBand =
  | 'red' | 'amber' | 'yellow' | 'green' | 'terminal';

export type HandoverAuthority =
  | 'project_engineer' | 'commissioning_engineer'
  | 'operations_manager' | 'handover_director';

export type HandoverParty =
  | 'commissioning_engineer' | 'operations_manager' | 'contractor'
  | 'independent_engineer' | 'owner' | 'warranty_administrator'
  | 'handover_coordinator' | 'training_lead';

interface TierInputs {
  priorityClass: HandoverPriorityClass;
  workflowClass: HandoverWorkflowClass;
  blocksWarrantyStart: boolean;
  blocksOmHandover: boolean;
  incompleteAsBuilt: boolean;
  untransferredSpares: boolean;
}

const TRANSITIONS: Record<HandoverStatus, Partial<Record<HandoverAction, HandoverStatus>>> = {
  dossier_compiled:               { submit: 'submitted', withdraw: 'withdrawn', void: 'voided' },
  submitted:                      { open_review: 'under_review', reject: 'rejected', withdraw: 'withdrawn', void: 'voided' },
  under_review:                   { approve: 'approved', require_revision: 'revision_required', reject: 'rejected', void: 'voided' },
  revision_required:              { revise_and_resubmit: 'submitted', void: 'voided' },
  approved:                       { schedule_witnessed_acceptance: 'witnessed_acceptance_scheduled', void: 'voided' },
  witnessed_acceptance_scheduled: { complete_witnessed_acceptance: 'witnessed_acceptance', void: 'voided' },
  witnessed_acceptance:           { remediate_punch: 'punch_remediated', void: 'voided' },
  punch_remediated:               { transfer_training: 'training_transferred', void: 'voided' },
  training_transferred:           { activate_warranty: 'warranty_activated', void: 'voided' },
  warranty_activated:             { transfer_to_operations: 'operations_owned', void: 'voided' },
  operations_owned:               { archive: 'archived', void: 'voided' },
  archived:                       {},
  rejected:                       {},
  withdrawn:                      {},
  voided:                         {},
};

export function nextStatus(from: HandoverStatus, action: HandoverAction): HandoverStatus | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function isTerminal(status: HandoverStatus): boolean {
  return status === 'archived' || status === 'rejected'
      || status === 'withdrawn' || status === 'voided';
}

export function isHighTier(tier: HandoverTier): boolean {
  return tier === 'critical' || tier === 'high';
}

// Base tier from priority × workflow, FLOOR-AT-HIGH for any coverage flag.
export function tierFromInputs(inputs: TierInputs): HandoverTier {
  const {
    priorityClass, workflowClass,
    blocksWarrantyStart, blocksOmHandover,
    incompleteAsBuilt, untransferredSpares,
  } = inputs;

  let baseFromWorkflow: HandoverTier = 'low';
  switch (workflowClass) {
    case 'protection_relay_package':      baseFromWorkflow = 'critical'; break;
    case 'transformer_bay':               baseFromWorkflow = 'critical'; break;
    case 'electrical_balance_of_plant':   baseFromWorkflow = 'high';     break;
    case 'battery_storage_skid':          baseFromWorkflow = 'high';     break;
    case 'mechanical_drivetrain':         baseFromWorkflow = 'high';     break;
    case 'inverter_skid':                 baseFromWorkflow = 'high';     break;
    case 'scada_dms_integration':         baseFromWorkflow = 'standard'; break;
    case 'civil_structural':              baseFromWorkflow = 'standard'; break;
    case 'spare_parts_kit':               baseFromWorkflow = 'standard'; break;
    case 'training_documentation_pack':   baseFromWorkflow = 'low';      break;
  }

  const order: HandoverTier[] = ['low', 'standard', 'high', 'critical'];
  const idxFromPriority = order.indexOf(priorityClass);
  const idxFromWorkflow = order.indexOf(baseFromWorkflow);
  let tier = order[Math.max(idxFromPriority, idxFromWorkflow)];

  // FLOOR-AT-HIGH for any of the 4 coverage flags.
  const anyFloorFlag =
    blocksWarrantyStart || blocksOmHandover
    || incompleteAsBuilt || untransferredSpares;
  if (anyFloorFlag) {
    const idxTier = order.indexOf(tier);
    const idxHigh = order.indexOf('high');
    if (idxTier < idxHigh) tier = 'high';
  }
  return tier;
}

// URGENT SLA — warranty-clock-running = tightest. The closer to warranty
// activation the dossier sits, the tighter the active-state SLA at the
// critical tier (every day delay erodes OEM coverage). Terminal states have
// null windows.
export const SLA_MINUTES: Partial<Record<HandoverStatus, Record<HandoverTier, number>>> = {
  dossier_compiled:               { critical: 720,  high: 1440, standard: 4320, low: 10080 },
  submitted:                      { critical: 480,  high: 1440, standard: 2880, low: 7200 },
  under_review:                   { critical: 720,  high: 1440, standard: 2880, low: 7200 },
  revision_required:              { critical: 480,  high: 1440, standard: 4320, low: 10080 },
  approved:                       { critical: 360,  high: 1440, standard: 2880, low: 7200 },
  witnessed_acceptance_scheduled: { critical: 480,  high: 1440, standard: 2880, low: 7200 },
  witnessed_acceptance:           { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  punch_remediated:               { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  training_transferred:           { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  // Warranty activated = warranty clock IS NOW RUNNING — tightest window.
  warranty_activated:             { critical: 120,  high: 360,  standard: 720,  low: 2880 },
  operations_owned:               { critical: 1440, high: 4320, standard: 7200, low: 14400 },
};

export function slaMinutesFor(status: HandoverStatus, tier: HandoverTier): number | null {
  return SLA_MINUTES[status]?.[tier] ?? null;
}

export function authorityFor(tier: HandoverTier): HandoverAuthority {
  switch (tier) {
    case 'low':      return 'project_engineer';
    case 'standard': return 'commissioning_engineer';
    case 'high':     return 'operations_manager';
    case 'critical': return 'handover_director';
  }
}

export function ballInCourtFor(status: HandoverStatus): HandoverParty | null {
  switch (status) {
    case 'dossier_compiled':              return 'handover_coordinator';
    case 'submitted':                     return 'independent_engineer';
    case 'under_review':                  return 'independent_engineer';
    case 'revision_required':             return 'contractor';
    case 'approved':                      return 'commissioning_engineer';
    case 'witnessed_acceptance_scheduled': return 'commissioning_engineer';
    case 'witnessed_acceptance':          return 'contractor';
    case 'punch_remediated':              return 'training_lead';
    case 'training_transferred':          return 'warranty_administrator';
    case 'warranty_activated':            return 'operations_manager';
    case 'operations_owned':              return 'operations_manager';
    default:                              return null;
  }
}

interface ReportInputs {
  action: HandoverAction;
  tier: HandoverTier;
  blocksWarrantyStart: boolean;
  blocksOmHandover: boolean;
  incompleteAsBuilt: boolean;
  untransferredSpares: boolean;
}

export function isReportable(tier: HandoverTier): boolean {
  return isHighTier(tier);
}

export function actionCrossesRegulator(inputs: ReportInputs): boolean {
  const {
    action, tier,
    blocksWarrantyStart, blocksOmHandover,
    incompleteAsBuilt, untransferredSpares,
  } = inputs;
  void tier;
  switch (action) {
    case 'approve':
      // SIGNATURE: approving a warranty-clock-blocker dossier crosses regulator
      // every tier (OEM coverage commencement is a NERSA-visible event).
      return blocksWarrantyStart;
    case 'transfer_to_operations':
      // SIGNATURE: turnover-to-operations is the REIPPPP O&M handover signal
      // when either flag is live.
      return blocksWarrantyStart || blocksOmHandover;
    case 'void':
      // Voiding an active dossier with material gaps (as-built or critical
      // spares) crosses regulator at EVERY tier — asset transfer can't lapse
      // silently.
      return incompleteAsBuilt || untransferredSpares;
    default:
      return false;
  }
}

export function urgencyBandFor(minutesUntilSla: number | null, terminal: boolean): HandoverUrgencyBand {
  if (terminal) return 'terminal';
  if (minutesUntilSla == null) return 'green';
  if (minutesUntilSla < 0) return 'red';
  if (minutesUntilSla < 240) return 'red';
  if (minutesUntilSla < 1440) return 'amber';
  if (minutesUntilSla < 4320) return 'yellow';
  return 'green';
}

interface CompletenessInputs {
  withinSla: boolean;
  revisionCount: number;
  ballInCourtClear: boolean;
  asBuiltCompletenessPct: number;       // 0-100
  sparePartsCompletenessPct: number;    // 0-100
  trainingCompletionPct: number;        // 0-100
  witnessedAcceptanceClear: boolean;    // true = zero punch items at witness
  warrantyActivated: boolean;
}

// 0-130 composite vs Procore Handover = 100 baseline.
// Witness-clear bonus, as-built bonus, spares bonus, training bonus.
export function handoverCompletenessIndex(inputs: CompletenessInputs): number {
  let score = 100;
  if (!inputs.withinSla) score -= 25;
  if (inputs.revisionCount > 0) score -= 10 * inputs.revisionCount;
  if (!inputs.ballInCourtClear) score -= 5;
  if (inputs.asBuiltCompletenessPct >= 95) score += 10;
  else if (inputs.asBuiltCompletenessPct < 80) score -= 10;
  if (inputs.sparePartsCompletenessPct >= 90) score += 10;
  else if (inputs.sparePartsCompletenessPct < 70) score -= 10;
  if (inputs.trainingCompletionPct >= 90) score += 10;
  else if (inputs.trainingCompletionPct < 70) score -= 5;
  if (inputs.witnessedAcceptanceClear) score += 10;
  if (inputs.warrantyActivated) score += 5;
  return Math.max(0, Math.min(130, score));
}

export function predictedCloseDate(
  status: HandoverStatus,
  tier: HandoverTier,
  stateEnteredAt: Date,
): Date | null {
  if (isTerminal(status)) return null;
  const path: HandoverStatus[] = (() => {
    switch (status) {
      case 'dossier_compiled':               return ['dossier_compiled', 'submitted', 'under_review', 'approved', 'witnessed_acceptance_scheduled', 'witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'submitted':                      return ['submitted', 'under_review', 'approved', 'witnessed_acceptance_scheduled', 'witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'under_review':                   return ['under_review', 'approved', 'witnessed_acceptance_scheduled', 'witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'revision_required':              return ['revision_required', 'submitted', 'under_review', 'approved', 'witnessed_acceptance_scheduled', 'witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'approved':                       return ['approved', 'witnessed_acceptance_scheduled', 'witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'witnessed_acceptance_scheduled': return ['witnessed_acceptance_scheduled', 'witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'witnessed_acceptance':           return ['witnessed_acceptance', 'punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'punch_remediated':               return ['punch_remediated', 'training_transferred', 'warranty_activated', 'operations_owned'];
      case 'training_transferred':           return ['training_transferred', 'warranty_activated', 'operations_owned'];
      case 'warranty_activated':             return ['warranty_activated', 'operations_owned'];
      case 'operations_owned':               return ['operations_owned'];
      default:                               return [];
    }
  })();
  const totalMin = path.reduce((s, st) => s + (SLA_MINUTES[st]?.[tier] ?? 0), 0);
  return new Date(stateEnteredAt.getTime() + totalMin * 60_000);
}

export function partyForAction(action: HandoverAction): HandoverParty {
  switch (action) {
    case 'submit':                         return 'handover_coordinator';
    case 'open_review':                    return 'independent_engineer';
    case 'require_revision':               return 'independent_engineer';
    case 'revise_and_resubmit':            return 'contractor';
    case 'approve':                        return 'independent_engineer';
    case 'schedule_witnessed_acceptance':  return 'commissioning_engineer';
    case 'complete_witnessed_acceptance':  return 'independent_engineer';
    case 'remediate_punch':                return 'contractor';
    case 'transfer_training':              return 'training_lead';
    case 'activate_warranty':              return 'warranty_administrator';
    case 'transfer_to_operations':         return 'operations_manager';
    case 'archive':                        return 'operations_manager';
    case 'reject':                         return 'independent_engineer';
    case 'withdraw':                       return 'handover_coordinator';
    case 'void':                           return 'owner';
  }
}

export function eventTypeFor(action: HandoverAction): string {
  return `handover_dossier.${action}`;
}

export function inboxSeverityForTier(tier: HandoverTier): 'high' | 'medium' | 'low' {
  if (tier === 'critical') return 'high';
  if (tier === 'high') return 'medium';
  return 'low';
}
