// ═══════════════════════════════════════════════════════════════════════════
// Wave 47 — OEM-Support ITIL Change Enablement chain (pure spec).
//
// The RFC (Request for Change) lifecycle — the third member of the ITIL service
// management family on the support profile, alongside:
//   - W14 support-ticket    : restore service for ONE incident (incident mgmt).
//   - W41 problem-management : root-cause of recurring incidents (problem mgmt).
//   - W47 change-enablement  : authorise, schedule, deploy and review a CHANGE
//                              to a service / configuration item (THIS chain).
// W41 literally hands off here: its raise_change action raises an RFC that this
// chain governs. The unit of work is a proposed CHANGE — assess its risk, take
// it through Change Advisory Board (CAB) authorisation (or the emergency ECAB
// fast-path), schedule it in the forward schedule of change, implement it in a
// change window, run a post-implementation review (PIR), and close it — OR back
// it out if it fails (a change-induced incident).
//
// Standards framing:
//   - ITIL 4 Change Enablement practice (assess → authorise → schedule →
//     implement → review).
//   - ISO/IEC 20000-1 §8.5.1 (change management) — record, assess, authorise,
//     schedule, implement and review changes; maintain a backout plan.
//
// Forward path:
//   change_requested → assessment → cab_review → approved → scheduled →
//     implementing → implemented → pir → closed
//
// Emergency fast-path (ECAB): assessment → approved (emergency_approve) — an
//   emergency change bypasses the full CAB; ECAB authorises out-of-band.
// Rejection branch: cab_review → rejected (CAB declines authorisation).
// Backout branch: implementing | implemented → rolled_back (the change failed
//   or its PIR is unacceptable; execute the documented backout plan).
// Early cancel: change_requested | assessment | cab_review | approved |
//   scheduled → cancelled (withdrawn before it goes live).
//
// Change classes (ITIL change types — drive SLA windows + reportability):
//   emergency_change — restore/repair a degraded or critical service; ECAB
//                      fast-path; TIGHTEST windows.
//   normal_change    — full CAB-assessed and scheduled change; moderate windows.
//   standard_change  — pre-authorised, low-risk, routine change; LOOSEST windows.
//
// URGENT SLA — the more urgent the change class, the TIGHTER every window.
//
// Reportability (regulator inbox crossings) — change management is internal
// IT/OT operations; only the highest-impact events touching a regulated platform
// service are notifiable:
//   - roll_back        — a backed-out change is a change-induced failure on a
//                        service: crosses for emergency_change + normal_change
//                        (governed services); standard_change stays internal.
//   - emergency_approve — the ECAB fast-path BYPASSES normal CAB governance: a
//                        control exception worth notifying for emergency_change.
//   - close            — post-implementation closure of an emergency change is a
//                        post-change report: crosses for emergency_change.
//   - sla_breached     — crosses for emergency_change only.
//
// Write model — SINGLE-PARTY {admin, support} (same as W41). There is no access
// split. We still tag each event with the ITIL functional party that owns the
// action (change_requester / change_authority / implementer) for audit
// attribution — functional tagging, NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type ChangeStatus =
  | 'change_requested'
  | 'assessment'
  | 'cab_review'
  | 'approved'
  | 'scheduled'
  | 'implementing'
  | 'implemented'
  | 'pir'
  | 'closed'
  | 'rejected'
  | 'rolled_back'
  | 'cancelled';

export type ChangeAction =
  | 'assess'
  | 'submit_to_cab'
  | 'approve'
  | 'reject'
  | 'emergency_approve'
  | 'schedule'
  | 'begin_implementation'
  | 'complete_implementation'
  | 'initiate_pir'
  | 'close'
  | 'roll_back'
  | 'cancel';

export type ChangeTier =
  | 'emergency_change'
  | 'normal_change'
  | 'standard_change';

// ITIL functional party that owns each action (recorded as actor_party — this is
// functional attribution for audit, NOT a write-access split).
export type ChangeParty = 'change_requester' | 'change_authority' | 'implementer';

interface TransitionRule {
  next: ChangeStatus;
}

export const TRANSITIONS: Record<
  ChangeStatus,
  Partial<Record<ChangeAction, TransitionRule>>
> = {
  change_requested: {
    assess: { next: 'assessment' },
    cancel: { next: 'cancelled' },
  },
  assessment: {
    submit_to_cab:     { next: 'cab_review' },
    emergency_approve: { next: 'approved' },
    cancel:            { next: 'cancelled' },
  },
  cab_review: {
    approve: { next: 'approved' },
    reject:  { next: 'rejected' },
    cancel:  { next: 'cancelled' },
  },
  approved: {
    schedule: { next: 'scheduled' },
    cancel:   { next: 'cancelled' },
  },
  scheduled: {
    begin_implementation: { next: 'implementing' },
    cancel:               { next: 'cancelled' },
  },
  implementing: {
    complete_implementation: { next: 'implemented' },
    roll_back:               { next: 'rolled_back' },
  },
  implemented: {
    initiate_pir: { next: 'pir' },
    roll_back:    { next: 'rolled_back' },
  },
  pir: {
    close: { next: 'closed' },
  },
  closed:      {},
  rejected:    {},
  rolled_back: {},
  cancelled:   {},
};

const TERMINALS = new Set<ChangeStatus>([
  'closed', 'rejected', 'rolled_back', 'cancelled',
]);

// States from which a change can still be withdrawn (cancel).
const WITHDRAWABLE = new Set<ChangeStatus>([
  'change_requested', 'assessment', 'cab_review', 'approved', 'scheduled',
]);

export function isTerminal(s: ChangeStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: ChangeStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export function nextStatus(
  current: ChangeStatus,
  action: ChangeAction,
): ChangeStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: ChangeStatus): ChangeAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as ChangeAction[];
}

// URGENT SLA windows in minutes — the more urgent the change class, the TIGHTER.
// Keyed by the deadline to take the NEXT action out of each state.
export const SLA_MINUTES: Record<ChangeStatus, Record<ChangeTier, number>> = {
  // change_requested → assess
  change_requested: {
    emergency_change: 60, normal_change: 480, standard_change: 1440,
  },
  // assessment → submit_to_cab / emergency_approve
  assessment: {
    emergency_change: 120, normal_change: 720, standard_change: 2880,
  },
  // cab_review → approve / reject
  cab_review: {
    emergency_change: 240, normal_change: 1440, standard_change: 4320,
  },
  // approved → schedule
  approved: {
    emergency_change: 120, normal_change: 1440, standard_change: 4320,
  },
  // scheduled → begin_implementation
  scheduled: {
    emergency_change: 240, normal_change: 4320, standard_change: 10080,
  },
  // implementing → complete_implementation
  implementing: {
    emergency_change: 240, normal_change: 720, standard_change: 1440,
  },
  // implemented → initiate_pir
  implemented: {
    emergency_change: 480, normal_change: 2880, standard_change: 7200,
  },
  // pir → close
  pir: {
    emergency_change: 1440, normal_change: 4320, standard_change: 10080,
  },
  closed:      { emergency_change: 0, normal_change: 0, standard_change: 0 },
  rejected:    { emergency_change: 0, normal_change: 0, standard_change: 0 },
  rolled_back: { emergency_change: 0, normal_change: 0, standard_change: 0 },
  cancelled:   { emergency_change: 0, normal_change: 0, standard_change: 0 },
};

export function slaDeadlineFor(
  state: ChangeStatus,
  tier: ChangeTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Tiers that surface to the regulator on a backed-out (change-induced failure)
// change — emergency + normal are governed services; standard is routine.
const REPORTABLE_TIERS = new Set<ChangeTier>(['emergency_change', 'normal_change']);

export function isReportableTier(tier: ChangeTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Regulator inbox crossings.
//   roll_back         crosses for emergency_change + normal_change.
//   emergency_approve crosses for emergency_change (ECAB governance bypass).
//   close             crosses for emergency_change (post-emergency-change report).
export function crossesIntoRegulator(
  action: ChangeAction,
  tier: ChangeTier,
): boolean {
  if (action === 'roll_back') return REPORTABLE_TIERS.has(tier);
  if (action === 'emergency_approve') return tier === 'emergency_change';
  if (action === 'close') return tier === 'emergency_change';
  return false;
}

// sla_breached crosses for emergency_change only.
export function slaBreachCrossesIntoRegulator(tier: ChangeTier): boolean {
  return tier === 'emergency_change';
}

// ITIL functional party that owns each action.
const ACTION_PARTY: Record<ChangeAction, ChangeParty> = {
  assess:                  'change_requester',
  submit_to_cab:           'change_requester',
  approve:                 'change_authority',
  reject:                  'change_authority',
  emergency_approve:       'change_authority',
  schedule:                'implementer',
  begin_implementation:    'implementer',
  complete_implementation: 'implementer',
  initiate_pir:            'change_authority',
  close:                   'change_authority',
  roll_back:               'implementer',
  cancel:                  'change_requester',
};

export function partyForAction(action: ChangeAction): ChangeParty {
  return ACTION_PARTY[action];
}
