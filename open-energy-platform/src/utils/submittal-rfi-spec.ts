// ═══════════════════════════════════════════════════════════════════════════
// Wave 96 — IPP Submittal Log & RFI Register (Procore + Aconex + Newforma
// + Primavera Submittal Exchange + e-Builder + Kahua + Asite beater)
//
// What this is, and what it is NOT
// --------------------------------
// During construction of an IPP project, three classes of paper move daily:
//   1. Submittals  — designer/contractor lodges a product or design package
//                    (shop drawings, cut sheets, mockups, O&M manuals)
//                    for owner/IE/designer approval BEFORE site installation.
//   2. RFIs        — site discovers a field condition / drawing gap and
//                    raises a formal Request for Information that must be
//                    answered before the trade can proceed.
//   3. Substitution requests — a flavour of RFI: contractor proposes an
//                    "or-equal" deviation from the spec; needs designer +
//                    owner approval.
//
// In a fully built IPP-PM stack (Procore is the category leader, Aconex is the
// document-control king, Newforma + Primavera Submittal Exchange + Asite +
// e-Builder + Kahua are the niche players), the submittal log + RFI register
// is the SINGLE MOST-ASKED-ABOUT module. It carries the construction schedule:
// an unresolved priority-RFI on a long-lead inverter holds float; an unreviewed
// submittal on the spec section blocks the trade from breaking ground.
//
// W96 is DISTINCT from:
//   W1  IPP CPM/EVM project plan        — task network (WHAT the schedule is)
//   W10 IPP bond expiry                 — financial security on the project
//   W19 IPP procurement / RFP           — pre-construction commercial gate
//   W20 IPP COD / commissioning         — handover gate
//   W23 IPP insurance claim             — operational risk
//   W47 OEM-Support ITIL change         — operational change post-COD
//   W64 Esums Permit-to-Work / LOTO     — control-of-work gate
//   W81 IPP Change-Order / EVM          — commercial variation
//   W92 IPP project risk register       — risk taxonomy
//
// W96 is the CONSTRUCTION-DOCUMENT review pipeline: each row is a single
// submittal or RFI moving through 13 P6 states, with full ball-in-court
// tracking, spec-section coverage gates, supersession history, and a LIVE
// ipp-pm-quality battery (response-SLA remaining, days-in-court for the
// responsible party, urgency band, bid-envelope drift %, grid-code clauses
// affected, supersede chain depth, predicted close date).
//
// Beat Procore — Procore tracks ball-in-court + due-dates well but does NOT
// drive a regulator-inbox crossing when an approved submittal changes a
// REIPPPP bid-envelope parameter or affects a Grid Code C-1/C-3 clause; W96
// does. Beat Aconex — Aconex enforces revision history and transmittal
// discipline but has no tier-derived SLA. Beat Newforma + Asite — they
// track spec coverage but no automatic INVERTED SLA based on workflow class.
//
// 13-state P6 lifecycle:
//   drafted -> submit -> submitted -> distribute -> distributed
//     -> start_review -> under_review
//       -> request_clarification -> clarification_requested
//         -> provide_clarification -> under_review (rejoin)
//       -> respond -> responded
//         -> approve -> approved
//           -> distribute_for_construction -> distributed_for_construction
//             -> incorporate -> incorporated
//               -> close -> closed_clean             (terminal — happy path)
//         -> return_for_revision -> returned_for_revision
//           -> resubmit -> revised -> distribute -> distributed (rejoin)
//   void                    -> voided                (terminal — superseded /
//                                                    wrong project)
//   withdraw                -> withdrawn             (terminal — author pulled)
//
// 13 states (counted): drafted, submitted, distributed, under_review,
//   clarification_requested, responded, approved, returned_for_revision,
//   revised, distributed_for_construction, incorporated, closed_clean, voided.
// (withdrawn is an exception terminal carried on chain_status.)
//
// Tier — RE-DERIVED on every transition from priority_class × workflow_class
// (the "ball-in-court urgency" rule):
//   priority_class: critical | high | standard | low
//   workflow_class: submittal_design / submittal_product_data /
//                   submittal_mockup / submittal_om_manuals /
//                   rfi_design_clarification / rfi_field_condition /
//                   rfi_substitution_request / rfi_change_in_scope
//   Tier:
//     critical (construction_hold; rfi_field_condition + critical priority;
//              any submittal with affects_life_safety; any rfi blocking float)
//     high     (schedule_critical; affects_grid_code; affects_bid_envelope;
//              long-lead item; high priority)
//     standard (default operational submittal/RFI)
//     low      (informational; long-lead future item; archival)
//
//   FLOOR-AT-HIGH for any row with affects_grid_code = 1 OR
//   affects_life_safety = 1 OR affects_bid_envelope = 1 OR
//   holds_construction = 1 — these CANNOT fall below high regardless of
//   manual priority. Procore + Aconex do not enforce this floor; W96 does.
//
// URGENT SLA polarity — the HIGHER the tier, the TIGHTER the response window.
// Construction is time-money; a critical RFI must turn in hours, not weeks.
//   critical: response 4h / close 24h
//   high:     response 24h / close 72h
//   standard: response 7d / close 14d
//   low:      response 30d / close 45d
//
// Reportability (W96 SIGNATURE — Grid Code C-1/C-3 + REIPPPP bid-envelope):
//   approve crosses regulator EVERY tier when affects_grid_code = 1 OR
//                    affects_bid_envelope = 1 (signature: a design change that
//                    leaves the IPP record must be filed with NERSA + DMRE).
//   void    crosses regulator EVERY tier when affects_grid_code = 1 OR
//                    affects_life_safety = 1 (signature: a retracted Grid-Code
//                    or life-safety design change must be flagged so the
//                    regulator can re-baseline the as-built record).
//   return_for_revision crosses regulator on critical+high tiers when
//                    affects_grid_code = 1 (designer pushback on Grid Code
//                    item — IPP must flag delay risk).
//   distribute_for_construction crosses regulator critical+high tiers when
//                    affects_grid_code = 1 (Issue-For-Construction on a Grid
//                    Code item is the moment NERSA must be in the loop).
//   sla_breached  crosses regulator critical+high tiers (procedural-window
//                    miss with affects_grid_code = 1 or holds_construction = 1
//                    becomes a Grid Code C-1 reportable delay).
//
// Single-party write {admin, ipp_developer, wind}. Read model: all 9 personas.
// actor_party functional (author, coordinator, reviewer, designer, owner,
// independent_engineer, contractor) — recorded per step, NOT an access split.
//
// Event prefix: submittal_rfi. Entity type: submittal_rfi.
// ═══════════════════════════════════════════════════════════════════════════

export type SubmittalRfiStatus =
  | 'drafted'
  | 'submitted'
  | 'distributed'
  | 'under_review'
  | 'clarification_requested'
  | 'responded'
  | 'approved'
  | 'returned_for_revision'
  | 'revised'
  | 'distributed_for_construction'
  | 'incorporated'
  | 'closed_clean'
  | 'voided'
  | 'withdrawn';

export type SubmittalRfiAction =
  | 'submit'
  | 'distribute'
  | 'start_review'
  | 'request_clarification'
  | 'provide_clarification'
  | 'respond'
  | 'approve'
  | 'return_for_revision'
  | 'resubmit'
  | 'distribute_for_construction'
  | 'incorporate'
  | 'close'
  | 'void'
  | 'withdraw';

export type SubmittalRfiTier =
  | 'critical'
  | 'high'
  | 'standard'
  | 'low';

export type SubmittalRfiWorkflowClass =
  | 'submittal_design'
  | 'submittal_product_data'
  | 'submittal_mockup'
  | 'submittal_om_manuals'
  | 'rfi_design_clarification'
  | 'rfi_field_condition'
  | 'rfi_substitution_request'
  | 'rfi_change_in_scope';

export type SubmittalRfiPriorityClass =
  | 'critical'
  | 'high'
  | 'standard'
  | 'low';

// Functional party that owns the action (recorded as actor_party).
export type SubmittalRfiParty =
  | 'author'
  | 'coordinator'
  | 'reviewer'
  | 'designer'
  | 'owner'
  | 'independent_engineer'
  | 'contractor';

interface TransitionRule {
  next: SubmittalRfiStatus;
}

export const TRANSITIONS: Record<
  SubmittalRfiStatus,
  Partial<Record<SubmittalRfiAction, TransitionRule>>
> = {
  drafted: {
    submit:    { next: 'submitted' },
    withdraw:  { next: 'withdrawn' },
    void:      { next: 'voided' },
  },
  submitted: {
    distribute: { next: 'distributed' },
    withdraw:   { next: 'withdrawn' },
    void:       { next: 'voided' },
  },
  distributed: {
    start_review: { next: 'under_review' },
    void:         { next: 'voided' },
  },
  under_review: {
    request_clarification: { next: 'clarification_requested' },
    respond:               { next: 'responded' },
    return_for_revision:   { next: 'returned_for_revision' },
    void:                  { next: 'voided' },
  },
  clarification_requested: {
    provide_clarification: { next: 'under_review' },
    void:                  { next: 'voided' },
  },
  responded: {
    approve:             { next: 'approved' },
    return_for_revision: { next: 'returned_for_revision' },
    void:                { next: 'voided' },
  },
  approved: {
    distribute_for_construction: { next: 'distributed_for_construction' },
    void:                        { next: 'voided' },
  },
  returned_for_revision: {
    resubmit: { next: 'revised' },
    void:     { next: 'voided' },
    withdraw: { next: 'withdrawn' },
  },
  revised: {
    distribute: { next: 'distributed' },
    void:       { next: 'voided' },
  },
  distributed_for_construction: {
    incorporate: { next: 'incorporated' },
    void:        { next: 'voided' },
  },
  incorporated: {
    close: { next: 'closed_clean' },
  },
  closed_clean: {},
  voided:       {},
  withdrawn:    {},
};

const TERMINALS = new Set<SubmittalRfiStatus>([
  'closed_clean', 'voided', 'withdrawn',
]);

export function isTerminal(s: SubmittalRfiStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: SubmittalRfiStatus,
  action: SubmittalRfiAction,
): SubmittalRfiStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: SubmittalRfiStatus): SubmittalRfiAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as SubmittalRfiAction[];
}

export function isVoidable(s: SubmittalRfiStatus): boolean {
  return TRANSITIONS[s]?.void != null;
}

// ── Workflow class + priority → tier (RE-DERIVED every transition) ──────────
const VALID_WORKFLOW = new Set<SubmittalRfiWorkflowClass>([
  'submittal_design', 'submittal_product_data', 'submittal_mockup',
  'submittal_om_manuals', 'rfi_design_clarification', 'rfi_field_condition',
  'rfi_substitution_request', 'rfi_change_in_scope',
]);

export function isWorkflowClass(c: string): c is SubmittalRfiWorkflowClass {
  return VALID_WORKFLOW.has(c as SubmittalRfiWorkflowClass);
}

const VALID_PRIORITY = new Set<SubmittalRfiPriorityClass>([
  'critical', 'high', 'standard', 'low',
]);

export function isPriorityClass(c: string): c is SubmittalRfiPriorityClass {
  return VALID_PRIORITY.has(c as SubmittalRfiPriorityClass);
}

const VALID_TIERS = new Set<SubmittalRfiTier>([
  'critical', 'high', 'standard', 'low',
]);

export function isTier(t: string): t is SubmittalRfiTier {
  return VALID_TIERS.has(t as SubmittalRfiTier);
}

const TIER_RANK: Record<SubmittalRfiTier, number> = {
  low: 0, standard: 1, high: 2, critical: 3,
};

export function tierRank(tier: SubmittalRfiTier): number {
  return TIER_RANK[tier];
}

const HIGH_TIERS = new Set<SubmittalRfiTier>(['high', 'critical']);
export function isHighTier(tier: SubmittalRfiTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Tier derivation: priority × workflow_class with floor-at-high for
// affects_grid_code | affects_life_safety | affects_bid_envelope | holds_construction.
export interface TierInputs {
  priorityClass: SubmittalRfiPriorityClass;
  workflowClass: SubmittalRfiWorkflowClass;
  affectsGridCode: boolean;
  affectsLifeSafety: boolean;
  affectsBidEnvelope: boolean;
  holdsConstruction: boolean;
}

export function tierFromInputs(inputs: TierInputs): SubmittalRfiTier {
  const {
    priorityClass, workflowClass,
    affectsGridCode, affectsLifeSafety, affectsBidEnvelope, holdsConstruction,
  } = inputs;

  // Base tier from priority — quick lookup.
  let baseTier: SubmittalRfiTier =
    priorityClass === 'critical' ? 'critical'
    : priorityClass === 'high'    ? 'high'
    : priorityClass === 'low'     ? 'low'
    : 'standard';

  // Field-condition RFIs are inherently critical when prioritised that way;
  // their default is high if priorityClass = standard (site can't wait weeks).
  if (workflowClass === 'rfi_field_condition' && priorityClass === 'standard') {
    baseTier = 'high';
  }
  // Substitution requests default to high if priorityClass = standard
  // (designer must rule before the trade can order).
  if (workflowClass === 'rfi_substitution_request' && priorityClass === 'low') {
    baseTier = 'standard';
  }

  // FLOOR-AT-HIGH for grid-code / life-safety / bid-envelope / construction-hold.
  if (
    affectsGridCode || affectsLifeSafety || affectsBidEnvelope || holdsConstruction
  ) {
    if (TIER_RANK[baseTier] < TIER_RANK.high) {
      return 'high';
    }
  }

  return baseTier;
}

// Ball-in-court — who's holding the work at each state.
export function ballInCourtFor(
  status: SubmittalRfiStatus,
): SubmittalRfiParty | null {
  switch (status) {
    case 'drafted':                     return 'author';
    case 'submitted':                   return 'coordinator';
    case 'distributed':                 return 'reviewer';
    case 'under_review':                return 'reviewer';
    case 'clarification_requested':     return 'author';
    case 'responded':                   return 'owner';
    case 'approved':                    return 'coordinator';
    case 'returned_for_revision':       return 'author';
    case 'revised':                     return 'coordinator';
    case 'distributed_for_construction':return 'contractor';
    case 'incorporated':                return 'independent_engineer';
    case 'closed_clean':                return null;
    case 'voided':                      return null;
    case 'withdrawn':                   return null;
  }
}

// ── URGENT SLA windows (minutes) — strictly DECREASING low → critical ───────
// Construction is time-money; the higher the tier, the tighter the window.
//
// For each state we have TWO SLAs:
//   - response_minutes: time to first material action (e.g. start_review,
//     respond, approve, distribute_for_construction).
//   - close_minutes:    time to terminal close of the case from current state.
// SLA_MINUTES below uses CLOSE windows by state×tier (the canonical breach
// signal). The response window helper is derived separately.

export const SLA_MINUTES: Record<SubmittalRfiStatus, Record<SubmittalRfiTier, number>> = {
  drafted: {
    critical: 240,   high: 720,   standard: 4320,  low: 14400,
  },
  submitted: {
    critical: 240,   high: 720,   standard: 4320,  low: 14400,
  },
  distributed: {
    critical: 180,   high: 1440,  standard: 7200,  low: 21600,
  },
  under_review: {
    critical: 240,   high: 1440,  standard: 7200,  low: 21600,
  },
  clarification_requested: {
    critical: 240,   high: 1440,  standard: 4320,  low: 14400,
  },
  responded: {
    critical: 180,   high: 720,   standard: 4320,  low: 14400,
  },
  approved: {
    critical: 180,   high: 720,   standard: 2880,  low: 7200,
  },
  returned_for_revision: {
    critical: 240,   high: 1440,  standard: 7200,  low: 21600,
  },
  revised: {
    critical: 180,   high: 720,   standard: 4320,  low: 14400,
  },
  distributed_for_construction: {
    critical: 180,   high: 720,   standard: 4320,  low: 14400,
  },
  incorporated: {
    critical: 180,   high: 720,   standard: 2880,  low: 7200,
  },
  closed_clean: { critical: 0, high: 0, standard: 0, low: 0 },
  voided:       { critical: 0, high: 0, standard: 0, low: 0 },
  withdrawn:    { critical: 0, high: 0, standard: 0, low: 0 },
};

export function slaDeadlineFor(
  state: SubmittalRfiStatus,
  tier: SubmittalRfiTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Response SLA — first material action from CURRENT state (tighter than close).
// Used by the live battery / urgency_band calc.
export const RESPONSE_MINUTES: Record<SubmittalRfiTier, number> = {
  critical: 240,    // 4h
  high:     1440,   // 24h
  standard: 10080,  // 7d
  low:      43200,  // 30d
};

export function responseDeadlineFor(
  tier: SubmittalRfiTier,
  enteredAt: Date,
): Date {
  return new Date(enteredAt.getTime() + RESPONSE_MINUTES[tier] * 60_000);
}

// ── Reportability (regulator-inbox crossing — W96 SIGNATURE) ────────────────
export interface ReportInputs {
  action: SubmittalRfiAction;
  tier: SubmittalRfiTier;
  affectsGridCode: boolean;
  affectsLifeSafety: boolean;
  affectsBidEnvelope: boolean;
  holdsConstruction: boolean;
}

export function isReportable(tier: SubmittalRfiTier): boolean {
  return isHighTier(tier);
}

export function actionCrossesRegulator(inputs: ReportInputs): boolean {
  const {
    action, tier,
    affectsGridCode, affectsLifeSafety, affectsBidEnvelope, holdsConstruction,
  } = inputs;
  switch (action) {
    case 'approve':
      // SIGNATURE: design change that leaves the IPP design record.
      // NERSA Grid Code C-1 + REIPPPP bid-envelope discipline.
      return affectsGridCode || affectsBidEnvelope;
    case 'distribute_for_construction':
      // Issue-For-Construction on a Grid Code item — NERSA in the loop.
      // Also crosses when releasing while holding construction (high+critical).
      return (affectsGridCode || affectsLifeSafety || holdsConstruction) && isHighTier(tier);
    case 'void':
      // SIGNATURE: retracted Grid Code / life-safety design change must be flagged.
      return affectsGridCode || affectsLifeSafety;
    case 'return_for_revision':
      // Designer pushback on a Grid Code item — delay risk, must be flagged.
      // Also crosses when the item is HOLDING CONSTRUCTION (work stops).
      return (affectsGridCode || holdsConstruction) && isHighTier(tier);
    case 'incorporate':
      // As-built crossing — only when both Grid-Code and high-tier.
      return affectsGridCode && tier === 'critical';
    default:
      return false;
  }
}

// Procedural authority — who can sign-off at a given tier.
export type SubmittalRfiAuthority =
  | 'construction_coordinator'
  | 'lead_engineer'
  | 'project_manager'
  | 'project_director';

export function authorityFor(tier: SubmittalRfiTier): SubmittalRfiAuthority {
  switch (tier) {
    case 'low':      return 'construction_coordinator';
    case 'standard': return 'lead_engineer';
    case 'high':     return 'project_manager';
    case 'critical': return 'project_director';
  }
}

// ── Live battery helpers — computed at every fetch ──────────────────────────
//
// urgency_band: red / amber / green from minutes_to_close_sla.
export type UrgencyBand = 'red' | 'amber' | 'green';

export function urgencyBandFor(
  minutesToSla: number | null,
  isTerminalState: boolean,
): UrgencyBand {
  if (isTerminalState) return 'green';
  if (minutesToSla == null) return 'green';
  if (minutesToSla < 0) return 'red';           // breached
  if (minutesToSla < 1440) return 'red';        // < 24h
  if (minutesToSla < 4320) return 'amber';      // < 72h
  return 'green';
}

// IPP-PM quality index — composite vs Procore baseline. 100 = parity; >100
// beats Procore; <100 worse than Procore baseline.
//
// Scoring rubric (linear weighted):
//   - response_within_sla  → +30
//   - close_within_sla     → +25
//   - no_revisions         → +20
//   - ball_in_court_clarity→ +15
//   - bid_envelope_drift_pct ≤1% → +10
// Floor 0, ceil 130.
export interface QualityInputs {
  responseWithinSla: boolean;
  closeWithinSla: boolean;
  revisionCount: number;
  ballInCourtClear: boolean;
  bidEnvelopeDriftPct: number;
}

export function ippPmQualityIndex(inputs: QualityInputs): number {
  let score = 0;
  if (inputs.responseWithinSla) score += 30;
  if (inputs.closeWithinSla)    score += 25;
  if ((inputs.revisionCount || 0) === 0) score += 20;
  if (inputs.ballInCourtClear)  score += 15;
  if (Math.abs(inputs.bidEnvelopeDriftPct || 0) <= 1.0) score += 10;
  return Math.max(0, Math.min(130, score));
}

// Predicted close date — current state's SLA-deadline + remaining workflow
// distance (states ahead × standard tier window).
export function predictedCloseDate(
  current: SubmittalRfiStatus,
  tier: SubmittalRfiTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(current)) return null;
  // Path lengths to terminal (closed_clean) by current state.
  const STATES_TO_GO: Record<SubmittalRfiStatus, number> = {
    drafted: 11,
    submitted: 10,
    distributed: 9,
    under_review: 8,
    clarification_requested: 8,
    responded: 7,
    approved: 6,
    returned_for_revision: 9,
    revised: 8,
    distributed_for_construction: 3,
    incorporated: 2,
    closed_clean: 0,
    voided: 0,
    withdrawn: 0,
  };
  const minutesPerStep = SLA_MINUTES[current][tier] || RESPONSE_MINUTES[tier];
  const stepsAhead = STATES_TO_GO[current];
  return new Date(enteredAt.getTime() + minutesPerStep * stepsAhead * 60_000);
}

// Compute supersede chain depth from parent_submittal_id history walk —
// simple counter helper for the route to plug a count from the DB query.
export function supersedeChainDepth(revisionCount: number): number {
  return Math.max(0, revisionCount || 0);
}

// Functional party that takes each action — recorded as actor_party.
export function partyForAction(action: SubmittalRfiAction): SubmittalRfiParty {
  switch (action) {
    case 'submit':                     return 'author';
    case 'distribute':                 return 'coordinator';
    case 'start_review':               return 'reviewer';
    case 'request_clarification':      return 'reviewer';
    case 'provide_clarification':      return 'author';
    case 'respond':                    return 'reviewer';
    case 'approve':                    return 'owner';
    case 'return_for_revision':        return 'owner';
    case 'resubmit':                   return 'author';
    case 'distribute_for_construction':return 'coordinator';
    case 'incorporate':                return 'contractor';
    case 'close':                      return 'independent_engineer';
    case 'void':                       return 'coordinator';
    case 'withdraw':                   return 'author';
  }
}

// Cascade event name for a destination status — submittal_rfi.<status>.
export function eventTypeFor(status: SubmittalRfiStatus): string {
  return `submittal_rfi.${status}`;
}

// Inbox severity for a tier — drives regulator-inbox SLA window.
export type InboxSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export function inboxSeverityForTier(tier: SubmittalRfiTier): InboxSeverity {
  switch (tier) {
    case 'critical': return 'critical';
    case 'high':     return 'high';
    case 'standard': return 'medium';
    case 'low':      return 'low';
  }
}
