// ─────────────────────────────────────────────────────────────────────────
// Wave 75 — Grid Connection Energization & Commissioning Hold-Point Gate (P6)
//
// Once a generator has won scarce capacity ([[project-wave58-grid-capacity-allocation-chain]])
// and signed its Grid Connection Agreement ([[project-wave28-gca-chain]]), it must
// be physically COMMISSIONED and ENERGIZED onto the network before it can sell a
// single MWh. The SA Grid Code (the Network Code + the Grid Connection Code for
// Renewable Power Plants) and the NTCSA / System Operator commissioning procedures
// run this as a sequence of witnessed HOLD-POINTS: a commissioning programme is
// agreed, a pre-energization safety inspection is passed, the connection assets are
// energized, cold (de-energized→energized, no-generation) commissioning proves the
// protection / SCADA / telemetry, the plant is first SYNCHRONIZED to the grid, a
// trial-operation (hot commissioning) run is completed under load, the grid-code
// COMPLIANCE TESTS (fault ride-through, reactive capability, frequency response)
// are witnessed, and finally a Commercial Operation Date (COD) certificate is
// issued. Each hold-point is a gate the System Operator must clear before the next
// stage may begin; a failed hold-point SUSPENDS commissioning until remediated.
//
// This is the PHYSICAL GO-LIVE gate — distinct from the rest of the grid lifecycle:
//   - [[project-wave58-grid-capacity-allocation-chain]] queues WHO may connect
//   - [[project-wave28-gca-chain]] negotiates the connection AGREEMENT (the terms)
//   - W75 physically ENERGIZES and commissions the connection (turns it on)
//   - [[project-wave67-grid-code-compliance-chain]] monitors ONGOING conformance
//     once energised; W75 hands a live, COD-certified connection across to it
//   - [[project-wave18-planned-outage-chain]] / [[project-wave13-dispatch-nominations]]
//     / [[project-wave50-reserve-activation-chain]] / [[project-wave34-load-curtailment-chain]]
//     operate the connection day-to-day
//   - [[project-wave8-grid-wheeling]] bills its transmission use-of-system
//
// Forward path (happy):
//   connection_ready → program_review → program_approved
//     → pre_energization_inspection → energization_authorized → cold_commissioning
//     → synchronized → trial_operation → compliance_testing → commercial_operation
//
// Hold-point suspension (failed inspection / sync / test / safety stop), re-entrant:
//   {pre_energization_inspection, energization_authorized, cold_commissioning,
//    synchronized, trial_operation, compliance_testing}
//      → commissioning_suspended → (resume_commissioning) → program_approved
//   resume restarts the witnessed hold-point sequence from the inspection gate —
//   the conservative, safety-first re-entry (you do not skip a witnessed gate).
//
// Withdrawal (project abandoned / connection cancelled), from any non-terminal:
//   * → connection_withdrawn
//
// Tiers (5) by CONNECTION CAPACITY (MW) / voltage class — the bigger and higher-
// voltage the connection, the longer and more complex the witnessed test campaign:
//   embedded <1MW (LV) / distribution <10MW (MV) / sub_transmission <50MW /
//   transmission <200MW / bulk >=200MW
//
// SLA matrix is INVERTED — the LARGER the connection, the LONGER every hold-point
// window. A 300 MW bulk-transmission plant's reactive-capability and FRT test
// campaign genuinely takes weeks; a 500 kW rooftop embedded generator is energized
// and signed off in days. Same flavour as the connection-front-end
// [[project-wave58-grid-capacity-allocation-chain]] and the regulator's
// size-graded [[project-wave49-licence-application-chain]].
//
// Reportability — the W75 SIGNATURE is COD-DRIVEN and POSITIVE. Bringing new
// generation capacity to commercial operation is ALWAYS a notifiable regulatory
// event (NERSA generation register / national energy balance):
//   issue_cod crosses for EVERY tier — the distinctive "the SUCCESS terminal is
//          always reportable" crossing (the mirror image of W67's
//          escalate_disconnection, where the FAILURE terminal always reports).
//   authorize_energization crosses for the large tiers (transmission + bulk) —
//          first energization of a system-significant connection onto the live grid.
//   suspend_commissioning crosses for the large tiers — a system-significant
//          connection's commissioning halted on a hold-point failure.
//   sla_breached crosses for the large tiers.
//
// Split write: the connected FACILITY (IPP developer) submits the commissioning
// programme, performs cold commissioning and the trial-operation run, and may
// withdraw; the System Operator (operator) approves the programme, witnesses and
// clears each hold-point (inspection, energization, synchronization, compliance
// tests), issues the COD, and suspends / resumes commissioning. actor_party tags
// which side performed each step; the route enforces the write-role gate.
// ─────────────────────────────────────────────────────────────────────────

export type EnergizationStatus =
  | 'connection_ready'
  | 'program_review'
  | 'program_approved'
  | 'pre_energization_inspection'
  | 'energization_authorized'
  | 'cold_commissioning'
  | 'synchronized'
  | 'trial_operation'
  | 'compliance_testing'
  | 'commercial_operation'
  | 'commissioning_suspended'
  | 'connection_withdrawn';

export type EnergizationAction =
  | 'submit_program'
  | 'approve_program'
  | 'conduct_inspection'
  | 'authorize_energization'
  | 'begin_cold_commissioning'
  | 'authorize_synchronization'
  | 'begin_trial_operation'
  | 'begin_compliance_testing'
  | 'issue_cod'
  | 'suspend_commissioning'
  | 'resume_commissioning'
  | 'withdraw_connection';

export type EnergizationTier =
  | 'embedded'
  | 'distribution'
  | 'sub_transmission'
  | 'transmission'
  | 'bulk';

export type EnergizationParty = 'operator' | 'facility';

export type EnergizationEvent =
  | 'connection_energization.program_review'
  | 'connection_energization.program_approved'
  | 'connection_energization.pre_energization_inspection'
  | 'connection_energization.energization_authorized'
  | 'connection_energization.cold_commissioning'
  | 'connection_energization.synchronized'
  | 'connection_energization.trial_operation'
  | 'connection_energization.compliance_testing'
  | 'connection_energization.commercial_operation'
  | 'connection_energization.commissioning_suspended'
  | 'connection_energization.connection_withdrawn'
  | 'connection_energization.sla_breached';

const TERMINALS = new Set<EnergizationStatus>(['commercial_operation', 'connection_withdrawn']);

// All non-terminal states may be withdrawn (project abandoned / connection cancelled).
const WITHDRAWABLE = new Set<EnergizationStatus>([
  'connection_ready',
  'program_review',
  'program_approved',
  'pre_energization_inspection',
  'energization_authorized',
  'cold_commissioning',
  'synchronized',
  'trial_operation',
  'compliance_testing',
  'commissioning_suspended',
]);

export function isTerminal(s: EnergizationStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: EnergizationStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const SUSPENDABLE: EnergizationStatus[] = [
  'pre_energization_inspection',
  'energization_authorized',
  'cold_commissioning',
  'synchronized',
  'trial_operation',
  'compliance_testing',
];

export const TRANSITIONS: Record<EnergizationAction, { from: EnergizationStatus[]; to: EnergizationStatus }> = {
  submit_program:            { from: ['connection_ready'],                  to: 'program_review' },
  approve_program:           { from: ['program_review'],                    to: 'program_approved' },
  conduct_inspection:        { from: ['program_approved'],                  to: 'pre_energization_inspection' },
  authorize_energization:    { from: ['pre_energization_inspection'],       to: 'energization_authorized' },
  begin_cold_commissioning:  { from: ['energization_authorized'],           to: 'cold_commissioning' },
  authorize_synchronization: { from: ['cold_commissioning'],               to: 'synchronized' },
  begin_trial_operation:     { from: ['synchronized'],                      to: 'trial_operation' },
  begin_compliance_testing:  { from: ['trial_operation'],                   to: 'compliance_testing' },
  issue_cod:                 { from: ['compliance_testing'],                to: 'commercial_operation' },
  suspend_commissioning:     { from: SUSPENDABLE,                           to: 'commissioning_suspended' },
  resume_commissioning:      { from: ['commissioning_suspended'],           to: 'program_approved' },
  withdraw_connection:       { from: Array.from(WITHDRAWABLE),              to: 'connection_withdrawn' },
};

export function nextStatus(current: EnergizationStatus, action: EnergizationAction): EnergizationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: EnergizationStatus): EnergizationAction[] {
  const acts: EnergizationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [EnergizationAction, typeof TRANSITIONS[EnergizationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the LARGER the connection, the LONGER every window. Strictly
// increasing embedded → bulk per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<EnergizationStatus, Record<EnergizationTier, number>> = {
  connection_ready: {
    embedded: 30 * DAY, distribution: 45 * DAY, sub_transmission: 60 * DAY, transmission: 90 * DAY, bulk: 120 * DAY,
  },
  program_review: {
    embedded: 5 * DAY, distribution: 7 * DAY, sub_transmission: 10 * DAY, transmission: 14 * DAY, bulk: 21 * DAY,
  },
  program_approved: {
    embedded: 7 * DAY, distribution: 10 * DAY, sub_transmission: 14 * DAY, transmission: 21 * DAY, bulk: 30 * DAY,
  },
  pre_energization_inspection: {
    embedded: 3 * DAY, distribution: 5 * DAY, sub_transmission: 7 * DAY, transmission: 10 * DAY, bulk: 14 * DAY,
  },
  energization_authorized: {
    embedded: 2 * DAY, distribution: 3 * DAY, sub_transmission: 5 * DAY, transmission: 7 * DAY, bulk: 10 * DAY,
  },
  cold_commissioning: {
    embedded: 7 * DAY, distribution: 10 * DAY, sub_transmission: 14 * DAY, transmission: 21 * DAY, bulk: 30 * DAY,
  },
  synchronized: {
    embedded: 2 * DAY, distribution: 3 * DAY, sub_transmission: 5 * DAY, transmission: 7 * DAY, bulk: 10 * DAY,
  },
  trial_operation: {
    embedded: 7 * DAY, distribution: 10 * DAY, sub_transmission: 14 * DAY, transmission: 21 * DAY, bulk: 30 * DAY,
  },
  compliance_testing: {
    embedded: 10 * DAY, distribution: 14 * DAY, sub_transmission: 21 * DAY, transmission: 30 * DAY, bulk: 45 * DAY,
  },
  commissioning_suspended: {
    embedded: 5 * DAY, distribution: 7 * DAY, sub_transmission: 10 * DAY, transmission: 14 * DAY, bulk: 21 * DAY,
  },
  commercial_operation:  { embedded: 0, distribution: 0, sub_transmission: 0, transmission: 0, bulk: 0 },
  connection_withdrawn:  { embedded: 0, distribution: 0, sub_transmission: 0, transmission: 0, bulk: 0 },
};

export function slaWindowMinutes(status: EnergizationStatus, tier: EnergizationTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: EnergizationStatus, tier: EnergizationTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Base tier from the connection capacity (MW) at the connection point.
export function tierForConnectionCapacity(mw: number): EnergizationTier {
  if (mw < 1) return 'embedded';
  if (mw < 10) return 'distribution';
  if (mw < 50) return 'sub_transmission';
  if (mw < 200) return 'transmission';
  return 'bulk';
}

// The large tiers — system-significant connections. Reportability for energization,
// suspension and SLA breaches attaches here.
const LARGE_TIERS = new Set<EnergizationTier>(['transmission', 'bulk']);

export function isLargeTier(tier: EnergizationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W75 signature, COD-driven and POSITIVE):
//   - issue_cod crosses for EVERY tier — bringing new generation to commercial
//     operation is always a notifiable regulatory (generation-register) event.
//   - authorize_energization crosses for the large tiers (transmission + bulk).
//   - suspend_commissioning crosses for the large tiers.
export function crossesIntoRegulator(action: EnergizationAction, tier: EnergizationTier): boolean {
  if (action === 'issue_cod') return true;
  if (action === 'authorize_energization') return LARGE_TIERS.has(tier);
  if (action === 'suspend_commissioning')  return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: EnergizationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// large tiers (transmission + bulk).
export function isReportable(tier: EnergizationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party each action represents. The connected FACILITY (IPP) submits the programme,
// performs cold commissioning and the trial-operation run, and may withdraw; the
// System Operator drives the witnessed hold-points, issues the COD and suspends /
// resumes commissioning. Audit attribution — the route enforces the split write gate.
const ACTION_PARTY: Record<EnergizationAction, EnergizationParty> = {
  submit_program:            'facility',
  approve_program:           'operator',
  conduct_inspection:        'operator',
  authorize_energization:    'operator',
  begin_cold_commissioning:  'facility',
  authorize_synchronization: 'operator',
  begin_trial_operation:     'facility',
  begin_compliance_testing:  'operator',
  issue_cod:                 'operator',
  suspend_commissioning:     'operator',
  resume_commissioning:      'operator',
  withdraw_connection:       'facility',
};

export function partyForAction(action: EnergizationAction): EnergizationParty {
  return ACTION_PARTY[action];
}

// Facility-side actions — the connected plant performs these; the route gates them
// to the facility write-role set, every other action to the operator set.
const FACILITY_ACTIONS = new Set<EnergizationAction>([
  'submit_program',
  'begin_cold_commissioning',
  'begin_trial_operation',
  'withdraw_connection',
]);

export function isFacilityAction(action: EnergizationAction): boolean {
  return FACILITY_ACTIONS.has(action);
}

// Action → cascade event. resume_commissioning lands back in program_approved →
// shares that event.
export const EVENT_FOR_ACTION: Record<EnergizationAction, EnergizationEvent> = {
  submit_program:            'connection_energization.program_review',
  approve_program:           'connection_energization.program_approved',
  conduct_inspection:        'connection_energization.pre_energization_inspection',
  authorize_energization:    'connection_energization.energization_authorized',
  begin_cold_commissioning:  'connection_energization.cold_commissioning',
  authorize_synchronization: 'connection_energization.synchronized',
  begin_trial_operation:     'connection_energization.trial_operation',
  begin_compliance_testing:  'connection_energization.compliance_testing',
  issue_cod:                 'connection_energization.commercial_operation',
  suspend_commissioning:     'connection_energization.commissioning_suspended',
  resume_commissioning:      'connection_energization.program_approved',
  withdraw_connection:       'connection_energization.connection_withdrawn',
};

export function eventForAction(action: EnergizationAction): EnergizationEvent {
  return EVENT_FOR_ACTION[action];
}
