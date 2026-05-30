// Wave 97 — IPP Daily Field Report / Progress Diary spec.
//
// The construction-day record for a best-in-class IPP-PM stack. Beats
// Procore Daily Log, Aconex Daily Site Diary, Buildertrend, Fieldwire,
// Raken, PlanGrid Daily Field Report, e-Builder daily logs.
//
// 12-state P6 lifecycle:
//   drafted -> open -> entries_open -> close_entries -> entries_closed
//     -> submit -> submitted -> start_review -> under_review
//       -> return_for_correction -> returned_for_correction
//         -> correct -> corrected -> submit -> submitted (rejoin)
//       -> approve -> approved
//         -> distribute -> distributed -> archive -> archived (terminal)
//   void     -> voided    (terminal)
//   withdraw -> withdrawn (terminal)
//
// Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
// for triggers_hse_incident | triggers_change_order |
// triggers_warranty_claim | contributes_to_evm.
//
// URGENT SLA polarity (safety = tightest — construction is hours-money).
//
// SIGNATURE (W97):
//   submit         -> regulator EVERY tier when triggers_hse_incident
//   approve        -> regulator EVERY tier when triggers_hse_incident
//                                              OR triggers_change_order
//                                                 with high|critical tier
//   void           -> regulator EVERY tier when triggers_hse_incident
//                                              OR triggers_change_order
//   distribute     -> regulator high+critical with triggers_change_order
//   sla_breached   -> regulator high+critical when triggers_hse_incident
//                                              OR triggers_change_order

export type DfrStatus =
  | 'drafted' | 'entries_open' | 'entries_closed' | 'submitted'
  | 'under_review' | 'returned_for_correction' | 'corrected'
  | 'approved' | 'distributed' | 'archived'
  | 'voided' | 'withdrawn';

export type DfrAction =
  | 'open' | 'close_entries' | 'submit' | 'start_review'
  | 'return_for_correction' | 'correct' | 'approve'
  | 'distribute' | 'archive' | 'void' | 'withdraw';

export type DfrWorkflowClass =
  | 'routine_daily' | 'weather_delay' | 'safety_incident'
  | 'milestone_handover' | 'equipment_breakdown' | 'low_productivity'
  | 'executive_visit' | 'near_miss';

export type DfrPriorityClass = 'critical' | 'high' | 'standard' | 'low';
export type DfrTier = 'critical' | 'high' | 'standard' | 'low';

export type DfrUrgencyBand = 'red' | 'amber' | 'yellow' | 'green' | 'terminal';

export type DfrAuthority =
  | 'site_supervisor' | 'project_engineer'
  | 'project_manager' | 'project_director';

export type DfrParty =
  | 'site_supervisor' | 'foreman' | 'coordinator' | 'reviewer'
  | 'project_manager' | 'owner' | 'independent_engineer' | 'contractor'
  | 'safety_officer';

interface TierInputs {
  priorityClass: DfrPriorityClass;
  workflowClass: DfrWorkflowClass;
  triggersHseIncident: boolean;
  triggersChangeOrder: boolean;
  triggersWarrantyClaim: boolean;
  contributesToEvm: boolean;
}

const TRANSITIONS: Record<DfrStatus, Partial<Record<DfrAction, DfrStatus>>> = {
  drafted:                 { open: 'entries_open', withdraw: 'withdrawn', void: 'voided' },
  entries_open:            { close_entries: 'entries_closed', withdraw: 'withdrawn', void: 'voided' },
  entries_closed:          { submit: 'submitted', withdraw: 'withdrawn', void: 'voided' },
  submitted:               { start_review: 'under_review', withdraw: 'withdrawn', void: 'voided' },
  under_review:            { approve: 'approved', return_for_correction: 'returned_for_correction', void: 'voided' },
  returned_for_correction: { correct: 'corrected', withdraw: 'withdrawn', void: 'voided' },
  corrected:               { submit: 'submitted', withdraw: 'withdrawn', void: 'voided' },
  approved:                { distribute: 'distributed', void: 'voided' },
  distributed:             { archive: 'archived', void: 'voided' },
  archived:                {},
  voided:                  {},
  withdrawn:               {},
};

export function nextStatus(from: DfrStatus, action: DfrAction): DfrStatus | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function isTerminal(status: DfrStatus): boolean {
  return status === 'archived' || status === 'voided' || status === 'withdrawn';
}

export function isHighTier(tier: DfrTier): boolean {
  return tier === 'critical' || tier === 'high';
}

// Base tier from priority × workflow, FLOOR-AT-HIGH for impact flags.
export function tierFromInputs(inputs: TierInputs): DfrTier {
  const {
    priorityClass, workflowClass,
    triggersHseIncident, triggersChangeOrder,
    triggersWarrantyClaim, contributesToEvm,
  } = inputs;

  // Workflow-class floor: safety_incident / near_miss start at high.
  let baseFromWorkflow: DfrTier = 'low';
  switch (workflowClass) {
    case 'safety_incident':     baseFromWorkflow = 'critical'; break;
    case 'near_miss':           baseFromWorkflow = 'high'; break;
    case 'equipment_breakdown': baseFromWorkflow = 'high'; break;
    case 'milestone_handover':  baseFromWorkflow = 'high'; break;
    case 'weather_delay':       baseFromWorkflow = 'standard'; break;
    case 'low_productivity':    baseFromWorkflow = 'standard'; break;
    case 'executive_visit':     baseFromWorkflow = 'standard'; break;
    case 'routine_daily':       baseFromWorkflow = 'low'; break;
  }

  // Take MAX of priority and workflow base.
  const order: DfrTier[] = ['low', 'standard', 'high', 'critical'];
  const idxFromPriority = order.indexOf(priorityClass);
  const idxFromWorkflow = order.indexOf(baseFromWorkflow);
  let tier = order[Math.max(idxFromPriority, idxFromWorkflow)];

  // FLOOR-AT-HIGH for impact flags.
  const anyFloorFlag =
    triggersHseIncident || triggersChangeOrder ||
    triggersWarrantyClaim || contributesToEvm;
  if (anyFloorFlag) {
    const idxTier = order.indexOf(tier);
    const idxHigh = order.indexOf('high');
    if (idxTier < idxHigh) tier = 'high';
  }
  return tier;
}

// URGENT SLA — critical = tightest. Construction is hours-money.
// Time-in-state minutes. Terminal states have null windows.
export const SLA_MINUTES: Partial<Record<DfrStatus, Record<DfrTier, number>>> = {
  drafted:                 { critical: 60,   high: 240,  standard: 720,  low: 1440 },
  entries_open:            { critical: 720,  high: 1440, standard: 2880, low: 4320 },
  entries_closed:          { critical: 120,  high: 360,  standard: 720,  low: 1440 },
  submitted:               { critical: 240,  high: 720,  standard: 1440, low: 2880 },
  under_review:            { critical: 480,  high: 1440, standard: 2880, low: 4320 },
  returned_for_correction: { critical: 240,  high: 720,  standard: 1440, low: 2880 },
  corrected:               { critical: 240,  high: 720,  standard: 1440, low: 2880 },
  approved:                { critical: 720,  high: 1440, standard: 2880, low: 4320 },
  distributed:             { critical: 1440, high: 2880, standard: 4320, low: 7200 },
};

export function slaMinutesFor(status: DfrStatus, tier: DfrTier): number | null {
  return SLA_MINUTES[status]?.[tier] ?? null;
}

export function authorityFor(tier: DfrTier): DfrAuthority {
  switch (tier) {
    case 'low':      return 'site_supervisor';
    case 'standard': return 'project_engineer';
    case 'high':     return 'project_manager';
    case 'critical': return 'project_director';
  }
}

export function ballInCourtFor(status: DfrStatus): DfrParty | null {
  switch (status) {
    case 'drafted':                 return 'site_supervisor';
    case 'entries_open':            return 'foreman';
    case 'entries_closed':          return 'site_supervisor';
    case 'submitted':               return 'coordinator';
    case 'under_review':            return 'reviewer';
    case 'returned_for_correction': return 'site_supervisor';
    case 'corrected':               return 'coordinator';
    case 'approved':                return 'coordinator';
    case 'distributed':             return 'project_manager';
    default:                        return null;
  }
}

interface ReportInputs {
  action: DfrAction;
  tier: DfrTier;
  triggersHseIncident: boolean;
  triggersChangeOrder: boolean;
  triggersWarrantyClaim: boolean;
  contributesToEvm: boolean;
}

export function isReportable(tier: DfrTier): boolean {
  return isHighTier(tier);
}

export function actionCrossesRegulator(inputs: ReportInputs): boolean {
  const {
    action, tier,
    triggersHseIncident, triggersChangeOrder,
    triggersWarrantyClaim, contributesToEvm,
  } = inputs;
  void triggersWarrantyClaim;
  void contributesToEvm;
  switch (action) {
    case 'submit':
      // SIGNATURE: HSE-triggering report is notifiable on submission.
      return triggersHseIncident;
    case 'approve':
      // SIGNATURE: HSE crosses every tier; change-order high+critical.
      return triggersHseIncident || (triggersChangeOrder && isHighTier(tier));
    case 'void':
      // Retracted HSE/change report must be flagged.
      return triggersHseIncident || triggersChangeOrder;
    case 'distribute':
      // Wide distribution of change-order-triggering report = NERSA notice.
      return triggersChangeOrder && isHighTier(tier);
    default:
      return false;
  }
}

export function urgencyBandFor(minutesUntilSla: number | null, terminal: boolean): DfrUrgencyBand {
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
  correctionCount: number;
  rejectionCount: number;
  ballInCourtClear: boolean;
  photoCount: number;
  weatherLogPresent: boolean;
  safetyLogPresent: boolean;
}

// 0-130 composite vs Procore Daily Log = 100 baseline.
export function ippPmQualityIndex(inputs: QualityInputs): number {
  let score = 100;
  if (!inputs.withinSla) score -= 25;
  score -= 5 * inputs.correctionCount;
  score -= 10 * inputs.rejectionCount;
  if (!inputs.ballInCourtClear) score -= 5;
  if (inputs.photoCount >= 5) score += 10;
  else if (inputs.photoCount >= 1) score += 5;
  if (inputs.weatherLogPresent) score += 5;
  if (inputs.safetyLogPresent) score += 5;
  return Math.max(0, Math.min(130, score));
}

export function predictedCloseDate(
  status: DfrStatus,
  tier: DfrTier,
  stateEnteredAt: Date,
): Date | null {
  if (isTerminal(status)) return null;
  // Sum SLA from current state forward through expected path until distributed.
  const path: DfrStatus[] = (() => {
    switch (status) {
      case 'drafted': return ['drafted', 'entries_open', 'entries_closed', 'submitted', 'under_review', 'approved', 'distributed'];
      case 'entries_open': return ['entries_open', 'entries_closed', 'submitted', 'under_review', 'approved', 'distributed'];
      case 'entries_closed': return ['entries_closed', 'submitted', 'under_review', 'approved', 'distributed'];
      case 'submitted': return ['submitted', 'under_review', 'approved', 'distributed'];
      case 'under_review': return ['under_review', 'approved', 'distributed'];
      case 'returned_for_correction': return ['returned_for_correction', 'corrected', 'submitted', 'under_review', 'approved', 'distributed'];
      case 'corrected': return ['corrected', 'submitted', 'under_review', 'approved', 'distributed'];
      case 'approved': return ['approved', 'distributed'];
      case 'distributed': return ['distributed'];
      default: return [];
    }
  })();
  const totalMin = path.reduce((s, st) => s + (SLA_MINUTES[st]?.[tier] ?? 0), 0);
  return new Date(stateEnteredAt.getTime() + totalMin * 60_000);
}

export function partyForAction(action: DfrAction): DfrParty {
  switch (action) {
    case 'open': return 'site_supervisor';
    case 'close_entries': return 'site_supervisor';
    case 'submit': return 'coordinator';
    case 'start_review': return 'reviewer';
    case 'return_for_correction': return 'reviewer';
    case 'correct': return 'site_supervisor';
    case 'approve': return 'reviewer';
    case 'distribute': return 'coordinator';
    case 'archive': return 'coordinator';
    case 'void': return 'owner';
    case 'withdraw': return 'site_supervisor';
  }
}

export function eventTypeFor(action: DfrAction): string {
  return `dfr.${action}`;
}

export function inboxSeverityForTier(tier: DfrTier): 'high' | 'medium' | 'low' {
  if (tier === 'critical') return 'high';
  if (tier === 'high') return 'medium';
  return 'low';
}
