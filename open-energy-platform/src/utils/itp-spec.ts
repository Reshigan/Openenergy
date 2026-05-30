// Wave 99 — IPP Quality / Inspection & Test Plan (ITP) spec.
//
// The forward-looking quality register a best-in-class IPP-PM stack drives at
// every construction stage. Beats Procore Quality + Aconex ITR + Bentley
// AssetWise + e-Builder ITR + Autodesk Construction Cloud Quality + Bluebeam
// Studio Quality by chaining hold-points + safety-critical-test + COD-blocker
// into a regulator inbox with floor-at-high tier override and a 0-130 quality
// index with witness-bonus, photo-bonus and first-time-pass bonuses.
//
// 12-state P6 lifecycle:
//   itp_drafted -> submit -> submitted
//     -> open_review -> under_review
//       -> approve -> approved -> release -> released_to_site
//         -> schedule_inspection -> inspection_scheduled
//           -> begin_inspection -> in_inspection
//             -> attend_witness -> witness_attended
//               -> record_result -> result_recorded
//                 -> pass        -> passed -> release_for_use ->
//                                  released_for_use -> archive -> archived
//                 -> fail        -> failed -> raise_corrective_action ->
//                                  corrective_action -> re_inspect ->
//                                  in_inspection (rejoin)
//   reject       -> rejected   (terminal)
//   withdraw     -> withdrawn  (terminal)
//   void         -> voided     (terminal)
//
// Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
// for any of the 4 coverage flags:
//   blocks_handover_milestone    (mechanical / practical completion blocker)
//   blocks_commercial_operation  (NERSA §C-5 COD-blocker; same flag W98 uses)
//   safety_critical_test         (OHSA s24 — earth-fault, insulation, pressure)
//   regulator_hold_point         (IE / NERSA witness-required hold-point)
//
// URGENT SLA polarity (safety / COD blocker = tightest — ITPs gate handover).
//
// SIGNATURE (W99 — NERSA §C-5 + REIPPPP + OHSA s24 + IEC 61508):
//   submit                 -> regulator EVERY tier when safety_critical_test
//   approve                -> regulator EVERY tier when blocks_commercial_operation
//   record_result (failed) -> regulator EVERY tier when safety_critical_test
//                             OR blocks_commercial_operation
//   void                   -> regulator EVERY tier when blocks_commercial_operation
//                             OR safety_critical_test
//   sla_breached           -> regulator EVERY tier when safety_critical_test;
//                             high+critical when blocks_commercial_operation

export type ItpStatus =
  | 'itp_drafted' | 'submitted' | 'under_review' | 'approved'
  | 'released_to_site' | 'inspection_scheduled' | 'in_inspection'
  | 'witness_attended' | 'result_recorded' | 'passed' | 'failed'
  | 'corrective_action' | 'released_for_use' | 'archived'
  | 'rejected' | 'withdrawn' | 'voided';

export type ItpAction =
  | 'submit' | 'open_review' | 'approve' | 'release'
  | 'schedule_inspection' | 'begin_inspection' | 'attend_witness'
  | 'record_result' | 'pass' | 'fail' | 'raise_corrective_action'
  | 're_inspect' | 'release_for_use' | 'archive'
  | 'reject' | 'withdraw' | 'void';

export type ItpWorkflowClass =
  | 'itp_civil_foundation' | 'itp_mechanical_assembly'
  | 'itp_electrical_lv' | 'itp_electrical_mv_hv'
  | 'itp_instrumentation_scada' | 'itp_pressure_vessel'
  | 'itp_protection_relay' | 'itp_grid_synchronisation'
  | 'itp_commissioning_test' | 'itp_handover_doc_pack';

export type ItpPriorityClass = 'critical' | 'high' | 'standard' | 'low';
export type ItpTier = 'critical' | 'high' | 'standard' | 'low';

export type ItpUrgencyBand = 'red' | 'amber' | 'yellow' | 'green' | 'terminal';

export type ItpAuthority =
  | 'site_supervisor' | 'quality_engineer'
  | 'project_manager' | 'project_director';

export type ItpParty =
  | 'site_supervisor' | 'quality_engineer' | 'contractor'
  | 'independent_engineer' | 'witness' | 'owner'
  | 'commissioning_engineer' | 'project_manager';

interface TierInputs {
  priorityClass: ItpPriorityClass;
  workflowClass: ItpWorkflowClass;
  blocksHandoverMilestone: boolean;
  blocksCommercialOperation: boolean;
  safetyCriticalTest: boolean;
  regulatorHoldPoint: boolean;
}

const TRANSITIONS: Record<ItpStatus, Partial<Record<ItpAction, ItpStatus>>> = {
  itp_drafted:           { submit: 'submitted',                      withdraw: 'withdrawn', void: 'voided' },
  submitted:             { open_review: 'under_review',              reject: 'rejected', withdraw: 'withdrawn', void: 'voided' },
  under_review:          { approve: 'approved',                      reject: 'rejected', void: 'voided' },
  approved:              { release: 'released_to_site',              void: 'voided' },
  released_to_site:      { schedule_inspection: 'inspection_scheduled', void: 'voided' },
  inspection_scheduled:  { begin_inspection: 'in_inspection',        void: 'voided' },
  in_inspection:         { attend_witness: 'witness_attended',       void: 'voided' },
  witness_attended:      { record_result: 'result_recorded',         void: 'voided' },
  result_recorded:       { pass: 'passed', fail: 'failed',           void: 'voided' },
  passed:                { release_for_use: 'released_for_use',      void: 'voided' },
  failed:                { raise_corrective_action: 'corrective_action', void: 'voided' },
  corrective_action:     { re_inspect: 'in_inspection',              void: 'voided' },
  released_for_use:      { archive: 'archived',                      void: 'voided' },
  archived:              {},
  rejected:              {},
  withdrawn:             {},
  voided:                {},
};

export function nextStatus(from: ItpStatus, action: ItpAction): ItpStatus | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function isTerminal(status: ItpStatus): boolean {
  return status === 'archived' || status === 'rejected'
      || status === 'withdrawn' || status === 'voided';
}

export function isHighTier(tier: ItpTier): boolean {
  return tier === 'critical' || tier === 'high';
}

// Base tier from priority × workflow, FLOOR-AT-HIGH for any coverage flag.
export function tierFromInputs(inputs: TierInputs): ItpTier {
  const {
    priorityClass, workflowClass,
    blocksHandoverMilestone, blocksCommercialOperation,
    safetyCriticalTest, regulatorHoldPoint,
  } = inputs;

  let baseFromWorkflow: ItpTier = 'low';
  switch (workflowClass) {
    case 'itp_grid_synchronisation':  baseFromWorkflow = 'critical'; break;
    case 'itp_protection_relay':      baseFromWorkflow = 'critical'; break;
    case 'itp_pressure_vessel':       baseFromWorkflow = 'critical'; break;
    case 'itp_electrical_mv_hv':      baseFromWorkflow = 'high';     break;
    case 'itp_commissioning_test':    baseFromWorkflow = 'high';     break;
    case 'itp_instrumentation_scada': baseFromWorkflow = 'standard'; break;
    case 'itp_mechanical_assembly':   baseFromWorkflow = 'standard'; break;
    case 'itp_electrical_lv':         baseFromWorkflow = 'standard'; break;
    case 'itp_civil_foundation':      baseFromWorkflow = 'standard'; break;
    case 'itp_handover_doc_pack':     baseFromWorkflow = 'low';      break;
  }

  const order: ItpTier[] = ['low', 'standard', 'high', 'critical'];
  const idxFromPriority = order.indexOf(priorityClass);
  const idxFromWorkflow = order.indexOf(baseFromWorkflow);
  let tier = order[Math.max(idxFromPriority, idxFromWorkflow)];

  // FLOOR-AT-HIGH for any of the 4 coverage flags.
  const anyFloorFlag =
    blocksHandoverMilestone || blocksCommercialOperation
    || safetyCriticalTest || regulatorHoldPoint;
  if (anyFloorFlag) {
    const idxTier = order.indexOf(tier);
    const idxHigh = order.indexOf('high');
    if (idxTier < idxHigh) tier = 'high';
  }
  return tier;
}

// URGENT SLA — safety / COD blocker = tightest. ITPs gate handover, so the
// non-terminal active states get aggressive windows at critical tier.
// Terminal states have null windows.
export const SLA_MINUTES: Partial<Record<ItpStatus, Record<ItpTier, number>>> = {
  itp_drafted:           { critical: 240,  high: 720,  standard: 2880, low: 7200 },
  submitted:             { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  under_review:          { critical: 480,  high: 1440, standard: 2880, low: 7200 },
  approved:              { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  released_to_site:      { critical: 480,  high: 1440, standard: 2880, low: 7200 },
  inspection_scheduled:  { critical: 360,  high: 1440, standard: 2880, low: 7200 },
  in_inspection:         { critical: 240,  high: 720,  standard: 2880, low: 7200 },
  witness_attended:      { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  result_recorded:       { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  passed:                { critical: 480,  high: 1440, standard: 2880, low: 7200 },
  failed:                { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  corrective_action:     { critical: 720,  high: 1440, standard: 4320, low: 10080 },
  released_for_use:      { critical: 1440, high: 4320, standard: 7200, low: 14400 },
};

export function slaMinutesFor(status: ItpStatus, tier: ItpTier): number | null {
  return SLA_MINUTES[status]?.[tier] ?? null;
}

export function authorityFor(tier: ItpTier): ItpAuthority {
  switch (tier) {
    case 'low':      return 'site_supervisor';
    case 'standard': return 'quality_engineer';
    case 'high':     return 'project_manager';
    case 'critical': return 'project_director';
  }
}

export function ballInCourtFor(status: ItpStatus): ItpParty | null {
  switch (status) {
    case 'itp_drafted':          return 'quality_engineer';
    case 'submitted':            return 'project_manager';
    case 'under_review':         return 'project_manager';
    case 'approved':             return 'quality_engineer';
    case 'released_to_site':    return 'site_supervisor';
    case 'inspection_scheduled': return 'site_supervisor';
    case 'in_inspection':        return 'quality_engineer';
    case 'witness_attended':     return 'independent_engineer';
    case 'result_recorded':      return 'independent_engineer';
    case 'passed':               return 'project_manager';
    case 'failed':               return 'contractor';
    case 'corrective_action':    return 'contractor';
    case 'released_for_use':     return 'commissioning_engineer';
    default:                     return null;
  }
}

interface ReportInputs {
  action: ItpAction;
  tier: ItpTier;
  blocksHandoverMilestone: boolean;
  blocksCommercialOperation: boolean;
  safetyCriticalTest: boolean;
  regulatorHoldPoint: boolean;
  resultFailed?: boolean;
}

export function isReportable(tier: ItpTier): boolean {
  return isHighTier(tier);
}

export function actionCrossesRegulator(inputs: ReportInputs): boolean {
  const {
    action, tier,
    blocksHandoverMilestone, blocksCommercialOperation,
    safetyCriticalTest, regulatorHoldPoint,
    resultFailed,
  } = inputs;
  void blocksHandoverMilestone;
  void regulatorHoldPoint;
  switch (action) {
    case 'submit':
      // SIGNATURE: submitting a safety-critical-test ITP = OHSA s24 notice.
      return safetyCriticalTest;
    case 'approve':
      // SIGNATURE: approving a COD-blocker ITP = NERSA §C-5 notice.
      return blocksCommercialOperation;
    case 'record_result':
      // SIGNATURE: recording a FAILED result on safety-critical OR COD-blocker
      // crosses regulator at EVERY tier (IEC 61508 / NERSA §C-5).
      return !!resultFailed && (safetyCriticalTest || blocksCommercialOperation);
    case 'fail':
      return safetyCriticalTest || blocksCommercialOperation;
    case 'void':
      // Voiding an active COD-blocker or safety-critical ITP crosses regulator.
      return blocksCommercialOperation || safetyCriticalTest;
    case 'pass':
      // Passing a hold-point with a regulator witness requirement at high+critical.
      return regulatorHoldPoint && isHighTier(tier);
    default:
      return false;
  }
}

export function urgencyBandFor(minutesUntilSla: number | null, terminal: boolean): ItpUrgencyBand {
  if (terminal) return 'terminal';
  if (minutesUntilSla == null) return 'green';
  if (minutesUntilSla < 0) return 'red';
  if (minutesUntilSla < 240) return 'red';
  if (minutesUntilSla < 1440) return 'amber';
  if (minutesUntilSla < 4320) return 'yellow';
  return 'green';
}

interface QualityInputs {
  withinSla: boolean;
  reinspectionCount: number;
  ballInCourtClear: boolean;
  photoEvidenceCount: number;
  witnessAttended: boolean;
  firstTimePass: boolean;
  rootCauseDocumented: boolean;
}

// 0-130 composite vs Procore Quality = 100 baseline.
// Witness bonus, photo bonus, first-time-pass bonus.
export function ippQualityIndex(inputs: QualityInputs): number {
  let score = 100;
  if (!inputs.withinSla) score -= 25;
  // First reinspection is expected; only penalise beyond first.
  if (inputs.reinspectionCount > 1) score -= 10 * (inputs.reinspectionCount - 1);
  if (!inputs.ballInCourtClear) score -= 5;
  if (inputs.photoEvidenceCount >= 4) score += 10;
  else if (inputs.photoEvidenceCount >= 1) score += 5;
  if (inputs.witnessAttended) score += 10;
  if (inputs.firstTimePass) score += 10;
  if (inputs.rootCauseDocumented) score += 5;
  return Math.max(0, Math.min(130, score));
}

export function predictedCloseDate(
  status: ItpStatus,
  tier: ItpTier,
  stateEnteredAt: Date,
): Date | null {
  if (isTerminal(status)) return null;
  const path: ItpStatus[] = (() => {
    switch (status) {
      case 'itp_drafted':          return ['itp_drafted', 'submitted', 'under_review', 'approved', 'released_to_site', 'inspection_scheduled', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'submitted':            return ['submitted', 'under_review', 'approved', 'released_to_site', 'inspection_scheduled', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'under_review':         return ['under_review', 'approved', 'released_to_site', 'inspection_scheduled', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'approved':             return ['approved', 'released_to_site', 'inspection_scheduled', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'released_to_site':     return ['released_to_site', 'inspection_scheduled', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'inspection_scheduled': return ['inspection_scheduled', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'in_inspection':        return ['in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'witness_attended':     return ['witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'result_recorded':      return ['result_recorded', 'passed', 'released_for_use'];
      case 'passed':               return ['passed', 'released_for_use'];
      case 'failed':               return ['failed', 'corrective_action', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'corrective_action':    return ['corrective_action', 'in_inspection', 'witness_attended', 'result_recorded', 'passed', 'released_for_use'];
      case 'released_for_use':     return ['released_for_use'];
      default:                     return [];
    }
  })();
  const totalMin = path.reduce((s, st) => s + (SLA_MINUTES[st]?.[tier] ?? 0), 0);
  return new Date(stateEnteredAt.getTime() + totalMin * 60_000);
}

export function partyForAction(action: ItpAction): ItpParty {
  switch (action) {
    case 'submit':                  return 'quality_engineer';
    case 'open_review':             return 'project_manager';
    case 'approve':                 return 'project_manager';
    case 'release':                 return 'quality_engineer';
    case 'schedule_inspection':     return 'site_supervisor';
    case 'begin_inspection':        return 'quality_engineer';
    case 'attend_witness':          return 'witness';
    case 'record_result':           return 'independent_engineer';
    case 'pass':                    return 'independent_engineer';
    case 'fail':                    return 'independent_engineer';
    case 'raise_corrective_action': return 'contractor';
    case 're_inspect':              return 'quality_engineer';
    case 'release_for_use':         return 'commissioning_engineer';
    case 'archive':                 return 'project_manager';
    case 'reject':                  return 'project_manager';
    case 'withdraw':                return 'quality_engineer';
    case 'void':                    return 'owner';
  }
}

export function eventTypeFor(action: ItpAction): string {
  return `itp.${action}`;
}

export function inboxSeverityForTier(tier: ItpTier): 'high' | 'medium' | 'low' {
  if (tier === 'critical') return 'high';
  if (tier === 'high') return 'medium';
  return 'low';
}
