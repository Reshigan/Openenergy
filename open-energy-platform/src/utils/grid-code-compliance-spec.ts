// ─────────────────────────────────────────────────────────────────────────
// Wave 67 — Grid Code Compliance Monitoring & Non-Conformance chain (P6)
//
// South African Grid Code (the Network Code + the Grid Connection Code for
// Renewable Power Plants / RPPs) and NRS 048-2/4 power-quality limits set the
// TECHNICAL conditions a connected facility must meet for the life of its
// connection: reactive-power capability, voltage and frequency ride-through,
// frequency response, power quality (flicker, harmonics, unbalance), protection
// coordination and SCADA/telemetry signalling. The System Operator / Transmission
// System Operator (NTCSA) MONITORS each connected facility's ongoing conformance
// and, when a parameter drifts out of limit, manages a NON-CONFORMANCE through a
// formal remediation lifecycle: raise → assess → require a corrective-action plan
// (CAP) → approve the plan → remediate → re-test → close as compliant, with an
// interim OPERATING RESTRICTION branch and a DISCONNECTION escalation when a
// facility cannot or will not return to conformance.
//
// This is ONGOING TECHNICAL CONFORMANCE — distinct from the rest of the grid
// lifecycle:
//   - [[project-wave28-gca-chain]] negotiates the one-time Grid Connection
//     Agreement (the terms of HOW a plant connects)
//   - [[project-wave58-grid-capacity-allocation-chain]] queues scarce capacity
//     (WHO may connect and in what order)
//   - [[project-wave18-planned-outage-chain]] coordinates connected-plant outages
//   - [[project-wave34-load-curtailment-chain]] curtails under system stress
//   - [[project-wave50-reserve-activation-chain]] activates ancillary reserves
//   - [[project-wave13-dispatch-nominations]] schedules dispatch
//   - [[project-wave8-grid-wheeling]] bills transmission use-of-system
// W67 governs whether an already-connected plant KEEPS MEETING the technical code
// once energised, and what happens when it does not. It is the SO/TSO technical
// counterpart to the regulator's own-initiative [[project-wave40-compliance-inspection-chain]]
// (NERSA enforcement) and reactive [[project-wave66-complaint-resolution-chain]].
//
// Forward path (happy):
//   monitoring → non_conformance_raised → under_assessment
//     → corrective_action_required → cap_submitted → cap_approved
//     → remediation_in_progress → compliance_retest → compliant_closed
//
// CAP revise loop (plan rejected, facility must resubmit):
//   cap_submitted → (reject_cap) → corrective_action_required
// Operating-restriction branch (severe deviation pending fix, or a failed retest):
//   {under_assessment, remediation_in_progress, compliance_retest}
//     → operating_restriction → (begin_remediation) → remediation_in_progress
// Disconnection escalation (no CAP, or restriction unresolved):
//   {corrective_action_required, operating_restriction} → disconnection_issued
// Withdrawal (false positive / resolved on assessment):
//   {non_conformance_raised, under_assessment} → withdrawn
//
// Tiers (5) by SYSTEM RISK — base tier from non-compliant CAPACITY (MW), with a
// floor escalation for stability-critical breach classes (a fault-ride-through or
// frequency-response failure threatens system security regardless of plant size):
//   minor <1MW / moderate <10MW / material <50MW / serious <200MW / critical >=200MW
//
// SLA matrix is URGENT — the MORE SEVERE the tier, the TIGHTER every window. A
// critical stability breach must be assessed and remediated in hours; a minor
// power-quality drift has weeks. Same flavour as the grid family's
// [[project-wave34-load-curtailment-chain]] and [[project-wave50-reserve-activation-chain]].
//
// Reportability — the W67 SIGNATURE is DISCONNECTION-DRIVEN. Disconnecting a
// connected (and licensed) facility is always a notifiable regulatory act:
//   escalate_disconnection crosses for EVERY tier — the distinctive
//          "the terminal escalation is always reportable" crossing (cf. W64
//          revoke_permit, W57 refer_to_licensing).
//   impose_restriction crosses for the large tiers (serious + critical) — a
//          restriction on a system-significant plant is notifiable.
//   sla_breached crosses for the large tiers (serious + critical).
//
// Split write: the SO/TSO (operator) drives the machinery — raise, assess, require,
// approve/reject, retest, restrict, disconnect; the connected FACILITY submits the
// CAP and performs the remediation. actor_party tags which side performs each step.
// ─────────────────────────────────────────────────────────────────────────

export type ComplianceStatus =
  | 'monitoring'
  | 'non_conformance_raised'
  | 'under_assessment'
  | 'corrective_action_required'
  | 'cap_submitted'
  | 'cap_approved'
  | 'remediation_in_progress'
  | 'compliance_retest'
  | 'operating_restriction'
  | 'compliant_closed'
  | 'disconnection_issued'
  | 'withdrawn';

export type ComplianceAction =
  | 'raise_non_conformance'
  | 'begin_assessment'
  | 'require_corrective_action'
  | 'submit_cap'
  | 'approve_cap'
  | 'reject_cap'
  | 'begin_remediation'
  | 'initiate_retest'
  | 'confirm_compliance'
  | 'impose_restriction'
  | 'escalate_disconnection'
  | 'withdraw';

export type ComplianceTier = 'minor' | 'moderate' | 'material' | 'serious' | 'critical';

export type ComplianceParty = 'operator' | 'facility';

export type BreachClass =
  | 'power_quality'
  | 'telemetry'
  | 'metering'
  | 'reactive_power'
  | 'voltage_regulation'
  | 'frequency_response'
  | 'fault_ride_through'
  | 'protection_coordination';

export type ComplianceEvent =
  | 'grid_code_compliance.non_conformance_raised'
  | 'grid_code_compliance.under_assessment'
  | 'grid_code_compliance.corrective_action_required'
  | 'grid_code_compliance.cap_submitted'
  | 'grid_code_compliance.cap_approved'
  | 'grid_code_compliance.remediation_in_progress'
  | 'grid_code_compliance.compliance_retest'
  | 'grid_code_compliance.compliant_closed'
  | 'grid_code_compliance.operating_restriction'
  | 'grid_code_compliance.disconnection_issued'
  | 'grid_code_compliance.withdrawn'
  | 'grid_code_compliance.sla_breached';

const TERMINALS = new Set<ComplianceStatus>(['compliant_closed', 'disconnection_issued', 'withdrawn']);

const WITHDRAWABLE = new Set<ComplianceStatus>(['non_conformance_raised', 'under_assessment']);

export function isTerminal(s: ComplianceStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: ComplianceStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<ComplianceAction, { from: ComplianceStatus[]; to: ComplianceStatus }> = {
  raise_non_conformance:     { from: ['monitoring'],                                                          to: 'non_conformance_raised' },
  begin_assessment:          { from: ['non_conformance_raised'],                                              to: 'under_assessment' },
  require_corrective_action: { from: ['under_assessment'],                                                    to: 'corrective_action_required' },
  submit_cap:                { from: ['corrective_action_required'],                                          to: 'cap_submitted' },
  approve_cap:               { from: ['cap_submitted'],                                                       to: 'cap_approved' },
  reject_cap:                { from: ['cap_submitted'],                                                       to: 'corrective_action_required' },
  begin_remediation:         { from: ['cap_approved', 'operating_restriction'],                               to: 'remediation_in_progress' },
  initiate_retest:           { from: ['remediation_in_progress'],                                             to: 'compliance_retest' },
  confirm_compliance:        { from: ['compliance_retest'],                                                   to: 'compliant_closed' },
  impose_restriction:        { from: ['under_assessment', 'remediation_in_progress', 'compliance_retest'],    to: 'operating_restriction' },
  escalate_disconnection:    { from: ['corrective_action_required', 'operating_restriction'],                 to: 'disconnection_issued' },
  withdraw:                  { from: ['non_conformance_raised', 'under_assessment'],                          to: 'withdrawn' },
};

export function nextStatus(current: ComplianceStatus, action: ComplianceAction): ComplianceStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ComplianceStatus): ComplianceAction[] {
  const acts: ComplianceAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ComplianceAction, typeof TRANSITIONS[ComplianceAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the MORE SEVERE the tier, the TIGHTER every window. Strictly
// decreasing minor → critical per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<ComplianceStatus, Record<ComplianceTier, number>> = {
  monitoring: {
    minor: 180 * DAY, moderate: 120 * DAY, material: 90 * DAY, serious: 60 * DAY, critical: 30 * DAY,
  },
  non_conformance_raised: {
    minor: 14 * DAY, moderate: 7 * DAY, material: 3 * DAY, serious: 24 * HOUR, critical: 12 * HOUR,
  },
  under_assessment: {
    minor: 10 * DAY, moderate: 5 * DAY, material: 2 * DAY, serious: 24 * HOUR, critical: 12 * HOUR,
  },
  corrective_action_required: {
    minor: 21 * DAY, moderate: 14 * DAY, material: 7 * DAY, serious: 3 * DAY, critical: 24 * HOUR,
  },
  cap_submitted: {
    minor: 10 * DAY, moderate: 7 * DAY, material: 5 * DAY, serious: 2 * DAY, critical: 24 * HOUR,
  },
  cap_approved: {
    minor: 14 * DAY, moderate: 10 * DAY, material: 5 * DAY, serious: 2 * DAY, critical: 24 * HOUR,
  },
  remediation_in_progress: {
    minor: 30 * DAY, moderate: 21 * DAY, material: 14 * DAY, serious: 7 * DAY, critical: 48 * HOUR,
  },
  compliance_retest: {
    minor: 10 * DAY, moderate: 7 * DAY, material: 5 * DAY, serious: 2 * DAY, critical: 24 * HOUR,
  },
  operating_restriction: {
    minor: 14 * DAY, moderate: 10 * DAY, material: 7 * DAY, serious: 3 * DAY, critical: 24 * HOUR,
  },
  compliant_closed:     { minor: 0, moderate: 0, material: 0, serious: 0, critical: 0 },
  disconnection_issued: { minor: 0, moderate: 0, material: 0, serious: 0, critical: 0 },
  withdrawn:            { minor: 0, moderate: 0, material: 0, serious: 0, critical: 0 },
};

export function slaWindowMinutes(status: ComplianceStatus, tier: ComplianceTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ComplianceStatus, tier: ComplianceTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<ComplianceTier, number> = {
  minor: 0, moderate: 1, material: 2, serious: 3, critical: 4,
};

const RANK_TIER: ComplianceTier[] = ['minor', 'moderate', 'material', 'serious', 'critical'];

// Base tier from the non-compliant capacity (MW) at the connection point.
export function tierForCapacityMw(mw: number): ComplianceTier {
  if (mw < 1) return 'minor';
  if (mw < 10) return 'moderate';
  if (mw < 50) return 'material';
  if (mw < 200) return 'serious';
  return 'critical';
}

// Stability-critical breach classes threaten system security regardless of plant
// size — fault ride-through, frequency response and protection coordination floor
// at 'serious'. The wider system breaches (reactive power, voltage regulation)
// floor at 'material'. Power quality / telemetry / metering carry no floor bump.
const STABILITY_CRITICAL_BREACHES = new Set<BreachClass>([
  'fault_ride_through', 'frequency_response', 'protection_coordination',
]);
const SYSTEM_BREACHES = new Set<BreachClass>(['reactive_power', 'voltage_regulation']);

export function breachClassFloor(breachClass: BreachClass): ComplianceTier {
  if (STABILITY_CRITICAL_BREACHES.has(breachClass)) return 'serious';
  if (SYSTEM_BREACHES.has(breachClass)) return 'material';
  return 'minor';
}

// Effective tier = the higher of the size-based tier and the breach-class floor.
export function tierForNonConformance(mw: number, breachClass: BreachClass): ComplianceTier {
  const base = tierForCapacityMw(mw);
  const floor = breachClassFloor(breachClass);
  const rank = Math.max(TIER_RANK[base], TIER_RANK[floor]);
  return RANK_TIER[rank];
}

// The large tiers — reportability for restrictions and SLA breaches attaches here.
const LARGE_TIERS = new Set<ComplianceTier>(['serious', 'critical']);

export function isLargeTier(tier: ComplianceTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W67 signature):
//   - escalate_disconnection crosses for EVERY tier — disconnecting a connected
//     facility is always a notifiable regulatory act.
//   - impose_restriction crosses for the large tiers (serious + critical).
export function crossesIntoRegulator(action: ComplianceAction, tier: ComplianceTier): boolean {
  if (action === 'escalate_disconnection') return true;
  if (action === 'impose_restriction')     return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ComplianceTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// large tiers (serious + critical).
export function isReportable(tier: ComplianceTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party each action represents. The SO/TSO (operator) drives the machinery; the
// connected FACILITY submits the corrective-action plan and performs remediation.
// Audit attribution — the route enforces a split write-role gate separately.
const ACTION_PARTY: Record<ComplianceAction, ComplianceParty> = {
  raise_non_conformance:     'operator',
  begin_assessment:          'operator',
  require_corrective_action: 'operator',
  submit_cap:                'facility',
  approve_cap:               'operator',
  reject_cap:                'operator',
  begin_remediation:         'facility',
  initiate_retest:           'operator',
  confirm_compliance:        'operator',
  impose_restriction:        'operator',
  escalate_disconnection:    'operator',
  withdraw:                  'operator',
};

export function partyForAction(action: ComplianceAction): ComplianceParty {
  return ACTION_PARTY[action];
}

// Facility-side actions — the connected plant performs these; the route gates them
// to the facility write-role set, every other action to the operator set.
const FACILITY_ACTIONS = new Set<ComplianceAction>(['submit_cap', 'begin_remediation']);

export function isFacilityAction(action: ComplianceAction): boolean {
  return FACILITY_ACTIONS.has(action);
}
