// Wave 98 — IPP Punch List / COD Snag Handover spec.
//
// The construction-completion deficiency lifecycle for a best-in-class
// IPP-PM stack. Beats Procore Punch List, BIM 360 Field, PlanGrid Punch
// List, Fieldwire snag, Autodesk Construction Cloud Punch List, Bluebeam
// Revu Snag, Aconex Defects.
//
// 11-state P6 lifecycle:
//   identified -> assess -> assessed
//     -> assign -> assigned
//       -> begin_remediation -> in_remediation
//         -> request_reinspection -> reinspect_requested
//           -> reinspect -> reinspected
//             -> accept -> accepted -> close -> closed (terminal clean)
//             -> reject_reinspection -> assigned (rejoin)
//           -> park -> on_hold -> resume -> in_remediation (rejoin)
//   void     -> voided    (terminal)
//   withdraw -> withdrawn (terminal)
//
// Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
// for blocks_commercial_operation | blocks_handover | life_safety_critical
// | warranty_critical.
//
// URGENT SLA polarity (critical = tightest — punch blocking COD is
// hours-money, not days-money).
//
// SIGNATURE (W98 — NERSA §C-5 + REIPPPP COD):
//   close                -> regulator EVERY tier when
//                           blocks_commercial_operation
//                           OR life_safety_critical
//   accept               -> regulator high+critical when life_safety_critical
//   reject_reinspection  -> regulator high+critical when
//                           blocks_commercial_operation
//   void                 -> regulator EVERY tier when blocks_handover
//                                                  OR life_safety_critical
//   sla_breached         -> regulator high+critical when
//                           blocks_commercial_operation
//                           OR life_safety_critical

export type PunchStatus =
  | 'identified' | 'assessed' | 'assigned'
  | 'in_remediation' | 'reinspect_requested' | 'reinspected'
  | 'accepted' | 'closed' | 'on_hold'
  | 'voided' | 'withdrawn';

export type PunchAction =
  | 'assess' | 'assign' | 'begin_remediation' | 'request_reinspection'
  | 'reinspect' | 'accept' | 'reject_reinspection' | 'close'
  | 'park' | 'resume' | 'void' | 'withdraw';

export type PunchWorkflowClass =
  | 'punch_safety_critical' | 'punch_functional_performance'
  | 'punch_cosmetic' | 'punch_documentation'
  | 'punch_commissioning' | 'punch_handover_blocker'
  | 'punch_warranty_carryover' | 'snag_post_handover';

export type PunchPriorityClass = 'critical' | 'high' | 'standard' | 'low';
export type PunchTier = 'critical' | 'high' | 'standard' | 'low';

export type PunchUrgencyBand = 'red' | 'amber' | 'yellow' | 'green' | 'terminal';

export type PunchAuthority =
  | 'site_supervisor' | 'quality_engineer'
  | 'project_manager' | 'project_director';

export type PunchParty =
  | 'site_supervisor' | 'quality_engineer' | 'contractor' | 'subcontractor'
  | 'reviewer' | 'independent_engineer' | 'project_manager' | 'owner'
  | 'commissioning_engineer';

interface TierInputs {
  priorityClass: PunchPriorityClass;
  workflowClass: PunchWorkflowClass;
  blocksCommercialOperation: boolean;
  blocksHandover: boolean;
  lifeSafetyCritical: boolean;
  warrantyCritical: boolean;
}

const TRANSITIONS: Record<PunchStatus, Partial<Record<PunchAction, PunchStatus>>> = {
  identified:          { assess: 'assessed',                 withdraw: 'withdrawn', void: 'voided' },
  assessed:            { assign: 'assigned',                 withdraw: 'withdrawn', void: 'voided' },
  assigned:            { begin_remediation: 'in_remediation', withdraw: 'withdrawn', void: 'voided' },
  in_remediation:      { request_reinspection: 'reinspect_requested', park: 'on_hold', void: 'voided' },
  reinspect_requested: { reinspect: 'reinspected',           void: 'voided' },
  reinspected:         { accept: 'accepted',                 reject_reinspection: 'assigned', void: 'voided' },
  accepted:            { close: 'closed',                    void: 'voided' },
  closed:              {},
  on_hold:             { resume: 'in_remediation',           void: 'voided', withdraw: 'withdrawn' },
  voided:              {},
  withdrawn:           {},
};

export function nextStatus(from: PunchStatus, action: PunchAction): PunchStatus | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function isTerminal(status: PunchStatus): boolean {
  return status === 'closed' || status === 'voided' || status === 'withdrawn';
}

export function isHighTier(tier: PunchTier): boolean {
  return tier === 'critical' || tier === 'high';
}

// Base tier from priority × workflow, FLOOR-AT-HIGH for impact flags.
export function tierFromInputs(inputs: TierInputs): PunchTier {
  const {
    priorityClass, workflowClass,
    blocksCommercialOperation, blocksHandover,
    lifeSafetyCritical, warrantyCritical,
  } = inputs;

  // Workflow-class floor.
  let baseFromWorkflow: PunchTier = 'low';
  switch (workflowClass) {
    case 'punch_safety_critical':       baseFromWorkflow = 'critical'; break;
    case 'punch_handover_blocker':      baseFromWorkflow = 'high';     break;
    case 'punch_commissioning':         baseFromWorkflow = 'high';     break;
    case 'punch_functional_performance': baseFromWorkflow = 'standard'; break;
    case 'punch_warranty_carryover':    baseFromWorkflow = 'standard'; break;
    case 'punch_documentation':         baseFromWorkflow = 'standard'; break;
    case 'snag_post_handover':          baseFromWorkflow = 'low';      break;
    case 'punch_cosmetic':              baseFromWorkflow = 'low';      break;
  }

  // Take MAX of priority and workflow base.
  const order: PunchTier[] = ['low', 'standard', 'high', 'critical'];
  const idxFromPriority = order.indexOf(priorityClass);
  const idxFromWorkflow = order.indexOf(baseFromWorkflow);
  let tier = order[Math.max(idxFromPriority, idxFromWorkflow)];

  // FLOOR-AT-HIGH for COD-blocking / safety / warranty flags.
  const anyFloorFlag =
    blocksCommercialOperation || blocksHandover ||
    lifeSafetyCritical || warrantyCritical;
  if (anyFloorFlag) {
    const idxTier = order.indexOf(tier);
    const idxHigh = order.indexOf('high');
    if (idxTier < idxHigh) tier = 'high';
  }
  return tier;
}

// URGENT SLA — critical = tightest. Punch list blocking COD is hours-money.
// Time-in-state minutes. Terminal states have null windows.
export const SLA_MINUTES: Partial<Record<PunchStatus, Record<PunchTier, number>>> = {
  identified:          { critical: 60,   high: 240,  standard: 1440, low: 4320 },
  assessed:            { critical: 120,  high: 480,  standard: 1440, low: 4320 },
  assigned:            { critical: 240,  high: 720,  standard: 2880, low: 7200 },
  in_remediation:      { critical: 720,  high: 1440, standard: 4320, low: 10080 },
  reinspect_requested: { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  reinspected:         { critical: 240,  high: 720,  standard: 1440, low: 4320 },
  accepted:            { critical: 480,  high: 1440, standard: 2880, low: 7200 },
  on_hold:             { critical: 4320, high: 7200, standard: 10080, low: 20160 },
};

export function slaMinutesFor(status: PunchStatus, tier: PunchTier): number | null {
  return SLA_MINUTES[status]?.[tier] ?? null;
}

export function authorityFor(tier: PunchTier): PunchAuthority {
  switch (tier) {
    case 'low':      return 'site_supervisor';
    case 'standard': return 'quality_engineer';
    case 'high':     return 'project_manager';
    case 'critical': return 'project_director';
  }
}

export function ballInCourtFor(status: PunchStatus): PunchParty | null {
  switch (status) {
    case 'identified':          return 'quality_engineer';
    case 'assessed':            return 'project_manager';
    case 'assigned':            return 'contractor';
    case 'in_remediation':      return 'contractor';
    case 'reinspect_requested': return 'quality_engineer';
    case 'reinspected':         return 'reviewer';
    case 'accepted':            return 'project_manager';
    case 'on_hold':             return 'project_manager';
    default:                    return null;
  }
}

interface ReportInputs {
  action: PunchAction;
  tier: PunchTier;
  blocksCommercialOperation: boolean;
  blocksHandover: boolean;
  lifeSafetyCritical: boolean;
  warrantyCritical: boolean;
}

export function isReportable(tier: PunchTier): boolean {
  return isHighTier(tier);
}

export function actionCrossesRegulator(inputs: ReportInputs): boolean {
  const {
    action, tier,
    blocksCommercialOperation, blocksHandover,
    lifeSafetyCritical, warrantyCritical,
  } = inputs;
  void warrantyCritical;
  switch (action) {
    case 'close':
      // SIGNATURE: closing a punch blocking COD or life-safety = NERSA
      // C-5 notification regardless of tier.
      return blocksCommercialOperation || lifeSafetyCritical;
    case 'accept':
      // SIGNATURE: accepting a remediated life-safety punch crosses
      // regulator at high+critical (independent-engineer sign-off).
      return lifeSafetyCritical && isHighTier(tier);
    case 'reject_reinspection':
      // SIGNATURE: reinspection failure on a COD blocker = NERSA notice.
      return blocksCommercialOperation && isHighTier(tier);
    case 'void':
      // Voiding a handover-blocking or life-safety punch crosses
      // regulator EVERY tier.
      return blocksHandover || lifeSafetyCritical;
    default:
      return false;
  }
}

export function urgencyBandFor(minutesUntilSla: number | null, terminal: boolean): PunchUrgencyBand {
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
  rejectionCount: number;
  reinspectionCount: number;
  ballInCourtClear: boolean;
  photoEvidenceCount: number;
  rootCauseDocumented: boolean;
  commissioningEvidence: boolean;
}

// 0-130 composite vs Procore Punch List = 100 baseline.
export function ippPmQualityIndex(inputs: QualityInputs): number {
  let score = 100;
  if (!inputs.withinSla) score -= 25;
  score -= 15 * inputs.rejectionCount;
  // First reinspection is expected; only penalise beyond first.
  if (inputs.reinspectionCount > 1) score -= 10 * (inputs.reinspectionCount - 1);
  if (!inputs.ballInCourtClear) score -= 5;
  if (inputs.photoEvidenceCount >= 4) score += 10;
  else if (inputs.photoEvidenceCount >= 1) score += 5;
  if (inputs.rootCauseDocumented) score += 5;
  if (inputs.commissioningEvidence) score += 5;
  return Math.max(0, Math.min(130, score));
}

export function predictedCloseDate(
  status: PunchStatus,
  tier: PunchTier,
  stateEnteredAt: Date,
): Date | null {
  if (isTerminal(status)) return null;
  // Sum SLA from current state forward through expected happy path to
  // accepted -> close.
  const path: PunchStatus[] = (() => {
    switch (status) {
      case 'identified':          return ['identified', 'assessed', 'assigned', 'in_remediation', 'reinspect_requested', 'reinspected', 'accepted'];
      case 'assessed':            return ['assessed', 'assigned', 'in_remediation', 'reinspect_requested', 'reinspected', 'accepted'];
      case 'assigned':            return ['assigned', 'in_remediation', 'reinspect_requested', 'reinspected', 'accepted'];
      case 'in_remediation':      return ['in_remediation', 'reinspect_requested', 'reinspected', 'accepted'];
      case 'reinspect_requested': return ['reinspect_requested', 'reinspected', 'accepted'];
      case 'reinspected':         return ['reinspected', 'accepted'];
      case 'accepted':            return ['accepted'];
      case 'on_hold':             return ['on_hold', 'in_remediation', 'reinspect_requested', 'reinspected', 'accepted'];
      default:                    return [];
    }
  })();
  const totalMin = path.reduce((s, st) => s + (SLA_MINUTES[st]?.[tier] ?? 0), 0);
  return new Date(stateEnteredAt.getTime() + totalMin * 60_000);
}

export function partyForAction(action: PunchAction): PunchParty {
  switch (action) {
    case 'assess':                return 'quality_engineer';
    case 'assign':                return 'project_manager';
    case 'begin_remediation':     return 'contractor';
    case 'request_reinspection':  return 'contractor';
    case 'reinspect':             return 'quality_engineer';
    case 'accept':                return 'reviewer';
    case 'reject_reinspection':   return 'reviewer';
    case 'close':                 return 'project_manager';
    case 'park':                  return 'project_manager';
    case 'resume':                return 'project_manager';
    case 'void':                  return 'owner';
    case 'withdraw':              return 'site_supervisor';
  }
}

export function eventTypeFor(action: PunchAction): string {
  return `punch_list.${action}`;
}

export function inboxSeverityForTier(tier: PunchTier): 'high' | 'medium' | 'low' {
  if (tier === 'critical') return 'high';
  if (tier === 'high') return 'medium';
  return 'low';
}
