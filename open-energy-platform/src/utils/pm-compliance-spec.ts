// ═══════════════════════════════════════════════════════════════════════════
// Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral (spec).
//
// IEC 62446 (PV inspection / maintenance) + IEC 61724 + standard REIPPPP O&M
// service-agreement preventive-maintenance (PM) program discipline. 12-state P6
// lifecycle for a SINGLE scheduled PM task instance on the maintenance calendar:
// the PM is scheduled with a planned due window, assigned to a field crew,
// executed, verified against the PM checklist, and closed — or it is deferred to
// a later period, skipped (the window lapsed unexecuted — a compliance failure),
// or cancelled (the task is no longer applicable).
//
// This is the PROACTIVE maintenance-program counterpart UPSTREAM of W51
// (availability guarantee — the per-period uptime reconciliation) and W24 (PR
// underperformance — energy yield): keeping PMs on schedule is what KEEPS
// availability and PR within guarantee. A skipped safety-critical PM is the
// leading indicator of the availability shortfall W51 later books.
//
// Forward (happy / executed) path:
//   pm_scheduled → work_assigned → in_progress → completed →
//   verification_pending → closed
//
// Rework loop (verification found deficiencies):
//   require_rework (from verification_pending) → rework_required →
//   start_work → in_progress → ...
//
// On-hold (parts / access pending) loop:
//   place_on_hold (from in_progress) → on_hold → start_work → in_progress
//
// Deferral branch:
//   request_deferral (from pm_scheduled | work_assigned | on_hold) →
//   deferral_requested → approve_deferral → deferred (rescheduled to a new
//   period — this instance closes deferred), OR reject_deferral → work_assigned
//   (deferral denied — go do the work now).
//
// Skip (non-compliance) — the window lapsed unexecuted, or a deferral was
//   refused into a miss:
//   skip_pm (from pm_scheduled | work_assigned | on_hold | deferral_requested)
//   → skipped
//
// Cancel (no longer applicable — asset decommissioned / schedule revision):
//   cancel_pm (from pm_scheduled | work_assigned) → cancelled
//
// Terminals: closed, deferred, skipped, cancelled
//
// Maintenance-criticality tiers (RCM-style equipment criticality index 0..100),
// least → most critical:
//   routine         — < 20  (visual inspection, cleaning, vegetation)
//   standard        — < 40  (scheduled servicing, torque checks)
//   significant     — < 60  (major component servicing — tracker drives, combiners)
//   critical        — < 80  (critical-path plant — inverters, MV transformers)
//   safety_critical — >= 80 (protection / earthing / fire / arc-flash systems)
//
// URGENT SLA matrix — the MORE critical the PM, the TIGHTER the response window
// (a lapsing safety-critical PM is a protection-system hazard). The deferral
// review phase is flat across tiers (back-office decision).
//
// Reportability (NERSA Grid Code / O&M-obligation regulator-inbox crossings):
//   - skip_pm crosses for CRITICAL tiers {critical, safety_critical} — skipping
//     a critical / safety-critical PM is a reportable maintenance-compliance
//     failure (the W59 SIGNATURE: a missed safety PM cannot be quietly dropped).
//   - approve_deferral crosses for safety_critical ONLY — deferring a safety PM
//     is materially reportable even when approved ("a deferral approval of a
//     safety item is itself reportable").
//   - sla_breached crosses for CRITICAL tiers — a missed response deadline on a
//     critical / safety-critical PM is itself reportable.
//
// Single-party write: there is no O&M-contractor login — the Esums O&M operators
// record every party's action; the contractual party is captured separately via
// actor_party (asset_owner vs om_contractor), derived from the action.
// admin / support / ipp_developer write.
// ═══════════════════════════════════════════════════════════════════════════

export type PmComplianceStatus =
  | 'pm_scheduled'
  | 'work_assigned'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'verification_pending'
  | 'rework_required'
  | 'deferral_requested'
  | 'closed'
  | 'deferred'
  | 'skipped'
  | 'cancelled';

export type PmComplianceAction =
  | 'assign_work'
  | 'start_work'
  | 'place_on_hold'
  | 'complete_work'
  | 'open_verification'
  | 'require_rework'
  | 'close_pm'
  | 'request_deferral'
  | 'approve_deferral'
  | 'reject_deferral'
  | 'skip_pm'
  | 'cancel_pm';

export type PmCriticalityTier =
  | 'routine'
  | 'standard'
  | 'significant'
  | 'critical'
  | 'safety_critical';

export type PmComplianceParty = 'asset_owner' | 'om_contractor';

interface TransitionRule {
  from: PmComplianceStatus[];
  to: PmComplianceStatus;
}

export const TRANSITIONS: Record<PmComplianceAction, TransitionRule> = {
  assign_work:      { from: ['pm_scheduled'], to: 'work_assigned' },
  start_work:       { from: ['work_assigned', 'on_hold', 'rework_required'], to: 'in_progress' },
  place_on_hold:    { from: ['in_progress'], to: 'on_hold' },
  complete_work:    { from: ['in_progress'], to: 'completed' },
  open_verification:{ from: ['completed'], to: 'verification_pending' },
  require_rework:   { from: ['verification_pending'], to: 'rework_required' },
  close_pm:         { from: ['verification_pending'], to: 'closed' },
  request_deferral: { from: ['pm_scheduled', 'work_assigned', 'on_hold'], to: 'deferral_requested' },
  approve_deferral: { from: ['deferral_requested'], to: 'deferred' },
  reject_deferral:  { from: ['deferral_requested'], to: 'work_assigned' },
  skip_pm:          { from: ['pm_scheduled', 'work_assigned', 'on_hold', 'deferral_requested'], to: 'skipped' },
  cancel_pm:        { from: ['pm_scheduled', 'work_assigned'], to: 'cancelled' },
};

const TERMINALS = new Set<PmComplianceStatus>(['closed', 'deferred', 'skipped', 'cancelled']);

// States from which the PM can still be skipped/cancelled/deferred before any
// execution evidence exists.
const WITHDRAWABLE = new Set<PmComplianceStatus>([
  'pm_scheduled', 'work_assigned', 'on_hold', 'deferral_requested',
]);

export function isTerminal(s: PmComplianceStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: PmComplianceStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export function nextStatus(
  current: PmComplianceStatus,
  action: PmComplianceAction,
): PmComplianceStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(current: PmComplianceStatus): PmComplianceAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as PmComplianceAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// URGENT SLA windows in minutes. The more critical the PM, the tighter the
// window. The deferral-review phase is flat across tiers (back-office decision).
export const SLA_MINUTES: Record<PmComplianceStatus, Record<PmCriticalityTier, number>> = {
  pm_scheduled: {
    routine: 20160, standard: 14400, significant: 10080,
    critical: 5760, safety_critical: 2880,
  },
  work_assigned: {
    routine: 10080, standard: 7200, significant: 4320,
    critical: 2880, safety_critical: 1440,
  },
  in_progress: {
    routine: 7200, standard: 5760, significant: 4320,
    critical: 2880, safety_critical: 1440,
  },
  on_hold: {
    routine: 10080, standard: 7200, significant: 5760,
    critical: 2880, safety_critical: 1440,
  },
  completed: {
    routine: 4320, standard: 2880, significant: 2880,
    critical: 1440, safety_critical: 720,
  },
  verification_pending: {
    routine: 4320, standard: 2880, significant: 1440,
    critical: 720, safety_critical: 360,
  },
  rework_required: {
    routine: 7200, standard: 5760, significant: 4320,
    critical: 2880, safety_critical: 1440,
  },
  deferral_requested: {
    routine: 4320, standard: 4320, significant: 4320,
    critical: 4320, safety_critical: 4320,
  },
  closed:    { routine: 0, standard: 0, significant: 0, critical: 0, safety_critical: 0 },
  deferred:  { routine: 0, standard: 0, significant: 0, critical: 0, safety_critical: 0 },
  skipped:   { routine: 0, standard: 0, significant: 0, critical: 0, safety_critical: 0 },
  cancelled: { routine: 0, standard: 0, significant: 0, critical: 0, safety_critical: 0 },
};

export function slaWindowMinutes(
  state: PmComplianceStatus,
  tier: PmCriticalityTier,
): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: PmComplianceStatus,
  tier: PmCriticalityTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Critical tiers: a critical / safety-critical PM lapsing is a protection-system
// or critical-plant hazard.
const CRITICAL_TIERS = new Set<PmCriticalityTier>(['critical', 'safety_critical']);

export function isCriticalTier(tier: PmCriticalityTier): boolean {
  return CRITICAL_TIERS.has(tier);
}

// skip_pm crosses for critical tiers (a missed critical / safety PM is a
// reportable compliance failure — the W59 signature). approve_deferral crosses
// for safety_critical only (deferring a safety PM is materially reportable even
// when granted).
export function crossesIntoRegulator(
  action: PmComplianceAction,
  tier: PmCriticalityTier,
): boolean {
  if (action === 'skip_pm') return isCriticalTier(tier);
  if (action === 'approve_deferral') return tier === 'safety_critical';
  return false;
}

// sla_breached crosses for critical tiers only — a missed deadline on a
// critical / safety-critical PM is itself reportable.
export function slaBreachCrossesIntoRegulator(tier: PmCriticalityTier): boolean {
  return isCriticalTier(tier);
}

// Row-level "reportable" flag (drives the reportable dot).
export function isReportable(tier: PmCriticalityTier): boolean {
  return isCriticalTier(tier);
}

export const ACTION_PARTY: Record<PmComplianceAction, PmComplianceParty> = {
  start_work:        'om_contractor',
  place_on_hold:     'om_contractor',
  complete_work:     'om_contractor',
  request_deferral:  'om_contractor',
  assign_work:       'asset_owner',
  open_verification: 'asset_owner',
  require_rework:    'asset_owner',
  close_pm:          'asset_owner',
  approve_deferral:  'asset_owner',
  reject_deferral:   'asset_owner',
  skip_pm:           'asset_owner',
  cancel_pm:         'asset_owner',
};

export function partyForAction(action: PmComplianceAction): PmComplianceParty {
  return ACTION_PARTY[action];
}

export function isContractorAction(action: PmComplianceAction): boolean {
  return ACTION_PARTY[action] === 'om_contractor';
}

// Classify a PM task by its RCM-style equipment criticality index (0..100).
export function tierForCriticalityScore(score: number): PmCriticalityTier {
  if (score < 20) return 'routine';
  if (score < 40) return 'standard';
  if (score < 60) return 'significant';
  if (score < 80) return 'critical';
  return 'safety_critical';
}
