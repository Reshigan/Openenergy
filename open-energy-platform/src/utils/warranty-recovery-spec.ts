// ═══════════════════════════════════════════════════════════════════════════
// Wave 63 — OEM-Support Warranty-Recovery / Supplier-Recovery Claim chain
// (pure spec).
//
// The COMMERCIAL cost-recovery counterpart to W15 (warranty / RMA). When a
// deployed-asset component fails within the OEM supply warranty:
//   - W15 warranty/RMA    : the FIELD-side return — receive the faulty unit,
//                           process repair/replace for the asset.
//   - W63 warranty-recovery: the UPSTREAM commercial claim — recover OUR cost
//                           (repair / replacement / lost-generation pass-through)
//                           from the OEM/supplier under the supply-agreement
//                           warranty (THIS chain). W15 processes the RMA;
//                           W63 recovers the money from the manufacturer.
//
// It is also the supplier-recovery sibling of the support profile's other
// claim-style chains and completes the asset-warranty lifecycle: a field RMA
// (W15) and/or a work-order repair (W16) generates a cost; that cost is then
// pursued against the OEM here.
//
// Standards / contractual framing:
//   - OEM supply-agreement warranty terms + serial-defect / epidemic-failure
//     clauses (a systemic batch/design defect across a product line).
//   - NRCS (National Regulator for Compulsory Specifications) compulsory-
//     specification SAFETY recall regime for safety-hazard defects.
//   - CPA 68/2008 s55/s56 (implied warranty of quality) + s61 (product
//     liability) for the commercial recovery.
//   - NERSA Grid Code / security-of-supply: a SERIAL defect derating a fleet of
//     grid-connected generation is a reliability concern, reportable regardless
//     of the rand value of any single recovery.
//
// Forward path:
//   claim_drafted → submitted_to_oem → oem_acknowledged → under_assessment →
//     assessment_complete → approved → recovery_pending → recovered
//
// Rejection: assessment_complete → rejected (OEM denies — out of warranty / not
//   a covered defect — and we do not contest).
// Dispute loop: assessment_complete | recovery_pending → disputed; then either
//   resolve_dispute → approved (resolved in the claimant's favour) or
//   write_off → written_off (recovery abandoned / deemed unrecoverable).
// Withdraw: any pre-approval state → withdrawn.
//
// Tiers — by recovery rand amount (recovery_zar_m, ZAR millions):
//   minor    < 1
//   moderate < 10
//   material < 50
//   major    < 250
//   critical >= 250
// LARGE = {major, critical}.
//
// Defect classification — the DISTINCTIVE W63 dimension (drives the crossing):
//   isolated  — single-unit random failure.
//   batch     — confined to a manufacturing batch / lot.
//   serial    — systemic design/manufacturing defect across a product line
//               (epidemic failure) — the reportable fleet-reliability concern.
//   safety    — a defect with a safety / fire / structural hazard (NRCS recall).
//   wear_out  — end-of-life wear (frequently out of warranty).
// SYSTEMIC = {serial, safety}.
//
// MIXED SLA:
//   claim_drafted / under_assessment / disputed — INVERTED (bigger recovery =
//     MORE time: deeper evidence, RCA, legal/joint-assessment review).
//   recovery_pending — URGENT (bigger APPROVED recovery chased FASTER for
//     working capital; critical settled in 5 days).
//   submitted_to_oem / oem_acknowledged / assessment_complete / approved —
//     roughly fixed. Terminals 0.
//
// Reportability (regulator inbox crossings) — the W63 SIGNATURE is DEFECT-CLASS-
// driven, not size-driven (distinct from W55's tier-driven accept_risk/roll_back
// and W62's cause-driven termination):
//   - complete_assessment crosses for EVERY tier when the classified defect is
//     SYSTEMIC {serial, safety} (a serial/epidemic or safety defect on the
//     regulated generation estate is notifiable regardless of recovery value);
//     an isolated/batch/wear_out defect crosses only for LARGE tiers.
//   - write_off crosses for LARGE tiers only (a material unrecovered warranty
//     loss).
//   - sla_breached crosses for LARGE tiers only.
//   isReportable(tier, defectClass) = systemic OR large.
//
// Write model — SINGLE-PARTY {admin, support} (same as W41/W47/W55). No OEM
// login role; the support desk records every party's action. Each event is
// tagged with the functional party that owns the action (claimant /
// oem_supplier / assessor) for audit attribution — NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type RecoveryStatus =
  | 'claim_drafted'
  | 'submitted_to_oem'
  | 'oem_acknowledged'
  | 'under_assessment'
  | 'assessment_complete'
  | 'approved'
  | 'disputed'
  | 'recovery_pending'
  | 'recovered'
  | 'rejected'
  | 'withdrawn'
  | 'written_off';

export type RecoveryAction =
  | 'submit_claim'
  | 'acknowledge'
  | 'begin_assessment'
  | 'complete_assessment'
  | 'approve_recovery'
  | 'reject_claim'
  | 'dispute'
  | 'resolve_dispute'
  | 'initiate_recovery'
  | 'confirm_recovery'
  | 'write_off'
  | 'withdraw';

export type RecoveryTier =
  | 'minor'
  | 'moderate'
  | 'material'
  | 'major'
  | 'critical';

export type DefectClass =
  | 'isolated'
  | 'batch'
  | 'serial'
  | 'safety'
  | 'wear_out';

// Functional party that owns each action (recorded as actor_party — functional
// attribution for audit, NOT a write-access split).
export type RecoveryParty =
  | 'claimant'
  | 'oem_supplier'
  | 'assessor';

interface TransitionRule {
  next: RecoveryStatus;
}

export const TRANSITIONS: Record<
  RecoveryStatus,
  Partial<Record<RecoveryAction, TransitionRule>>
> = {
  claim_drafted: {
    submit_claim: { next: 'submitted_to_oem' },
    withdraw:     { next: 'withdrawn' },
  },
  submitted_to_oem: {
    acknowledge: { next: 'oem_acknowledged' },
    withdraw:    { next: 'withdrawn' },
  },
  oem_acknowledged: {
    begin_assessment: { next: 'under_assessment' },
    withdraw:         { next: 'withdrawn' },
  },
  under_assessment: {
    complete_assessment: { next: 'assessment_complete' },
    withdraw:            { next: 'withdrawn' },
  },
  assessment_complete: {
    approve_recovery: { next: 'approved' },
    reject_claim:     { next: 'rejected' },
    dispute:          { next: 'disputed' },
    withdraw:         { next: 'withdrawn' },
  },
  approved: {
    initiate_recovery: { next: 'recovery_pending' },
  },
  disputed: {
    resolve_dispute: { next: 'approved' },
    write_off:       { next: 'written_off' },
  },
  recovery_pending: {
    confirm_recovery: { next: 'recovered' },
    dispute:          { next: 'disputed' },
  },
  recovered:   {},
  rejected:    {},
  withdrawn:   {},
  written_off: {},
};

const TERMINALS = new Set<RecoveryStatus>([
  'recovered', 'rejected', 'withdrawn', 'written_off',
]);

export function isTerminal(s: RecoveryStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: RecoveryStatus,
  action: RecoveryAction,
): RecoveryStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: RecoveryStatus): RecoveryAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as RecoveryAction[];
}

// MIXED SLA windows in minutes, keyed by the deadline to take the NEXT action
// out of each state.
//   claim_drafted / under_assessment / disputed — INVERTED (increasing).
//   recovery_pending — URGENT (decreasing).
//   submitted_to_oem / oem_acknowledged / assessment_complete / approved — fixed.
export const SLA_MINUTES: Record<RecoveryStatus, Record<RecoveryTier, number>> = {
  // claim_drafted → submit_claim (INVERTED — bigger recovery, more prep)
  claim_drafted: {
    minor: 2880, moderate: 4320, material: 7200, major: 10080, critical: 20160,
  },
  // submitted_to_oem → acknowledge (fixed — OEM ack window)
  submitted_to_oem: {
    minor: 4320, moderate: 4320, material: 4320, major: 4320, critical: 4320,
  },
  // oem_acknowledged → begin_assessment (fixed)
  oem_acknowledged: {
    minor: 7200, moderate: 7200, material: 7200, major: 7200, critical: 7200,
  },
  // under_assessment → complete_assessment (INVERTED — deeper RCA on bigger)
  under_assessment: {
    minor: 10080, moderate: 20160, material: 43200, major: 86400, critical: 129600,
  },
  // assessment_complete → approve / reject / dispute (fixed)
  assessment_complete: {
    minor: 14400, moderate: 14400, material: 14400, major: 14400, critical: 14400,
  },
  // approved → initiate_recovery (fixed)
  approved: {
    minor: 7200, moderate: 7200, material: 7200, major: 7200, critical: 7200,
  },
  // disputed → resolve_dispute / write_off (INVERTED — bigger dispute, more time)
  disputed: {
    minor: 20160, moderate: 43200, material: 86400, major: 172800, critical: 259200,
  },
  // recovery_pending → confirm_recovery (URGENT — bigger recovery chased faster)
  recovery_pending: {
    minor: 43200, moderate: 28800, material: 20160, major: 10080, critical: 7200,
  },
  recovered:   { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  rejected:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  withdrawn:   { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  written_off: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaDeadlineFor(
  state: RecoveryStatus,
  tier: RecoveryTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Recovery rand-amount tiers (ZAR millions).
export function tierForRecoveryZarM(zarM: number): RecoveryTier {
  if (zarM >= 250) return 'critical';
  if (zarM >= 50)  return 'major';
  if (zarM >= 10)  return 'material';
  if (zarM >= 1)   return 'moderate';
  return 'minor';
}

const LARGE_TIERS = new Set<RecoveryTier>(['major', 'critical']);

export function isLargeTier(tier: RecoveryTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Systemic defect classes — a serial/epidemic defect or a safety-hazard defect
// on the regulated generation estate is notifiable regardless of recovery value.
const SYSTEMIC_DEFECTS = new Set<DefectClass>(['serial', 'safety']);

export function isSystemicDefect(defectClass: DefectClass): boolean {
  return SYSTEMIC_DEFECTS.has(defectClass);
}

// Reportability — systemic defect OR large recovery tier.
export function isReportable(tier: RecoveryTier, defectClass: DefectClass): boolean {
  return isSystemicDefect(defectClass) || isLargeTier(tier);
}

// Regulator inbox crossings — the W63 SIGNATURE is DEFECT-CLASS-driven.
//   complete_assessment crosses for EVERY tier when the defect is systemic;
//     otherwise (isolated/batch/wear_out) only for large tiers.
//   write_off crosses for large tiers only.
export function crossesIntoRegulator(
  action: RecoveryAction,
  tier: RecoveryTier,
  defectClass: DefectClass,
): boolean {
  if (action === 'complete_assessment') {
    return isSystemicDefect(defectClass) || isLargeTier(tier);
  }
  if (action === 'write_off') {
    return isLargeTier(tier);
  }
  return false;
}

// sla_breached crosses for large tiers only.
export function slaBreachCrossesIntoRegulator(tier: RecoveryTier): boolean {
  return isLargeTier(tier);
}

// Functional party that owns each action.
const ACTION_PARTY: Record<RecoveryAction, RecoveryParty> = {
  submit_claim:        'claimant',
  acknowledge:         'oem_supplier',
  begin_assessment:    'assessor',
  complete_assessment: 'assessor',
  approve_recovery:    'oem_supplier',
  reject_claim:        'oem_supplier',
  dispute:             'claimant',
  resolve_dispute:     'assessor',
  initiate_recovery:   'oem_supplier',
  confirm_recovery:    'claimant',
  write_off:           'claimant',
  withdraw:            'claimant',
};

export function partyForAction(action: RecoveryAction): RecoveryParty {
  return ACTION_PARTY[action];
}
