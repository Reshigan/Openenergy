// ═══════════════════════════════════════════════════════════════════════════
// Wave 157 — IPP Project Refinancing & Debt Restructuring chain (pure spec).
//
// An operating IPP SPV (post-COD) seeks to refinance its senior debt facility —
// replacing the original construction/mini-perm loan with lower-margin long-term
// project finance bonds or term loans. This is a post-financial-close refinancing
// event that touches three regulatory authorities simultaneously:
//
//   1. NERSA §35 approval — required when the refinancing materially changes
//      PPA credit-support obligations (NERSA Licence Amendment Guidelines §4.3,
//      change of financing).
//   2. SARB Exchange Control (Circular 6/2010) — required for any non-resident
//      lender involvement or offshore credit facility drawdown.
//   3. LMA-standard borrower consent and conditions precedent — the facility
//      agreement change provisions govern assignment, transfer, and substitution
//      of the senior secured debt package.
//
// Additionally, the Offtaker and DoE are notified under REIPPPP Project
// Agreement §24 (financing change notification) at the `term_sheet_signed` stage.
//
// Upstream context:
//   - [[project-wave75-connection-energization]] issued the COD that the
//     refinancing SPV is now monetising.
//   - [[project-wave22-ppa-contract-chain]] is the PPA whose credit-support
//     obligations may change; NERSA clearance here is a §35 gate on that chain.
//   - [[project-wave21-drawdown-chain]] and [[project-wave30-disbursement-chain]]
//     govern the ORIGINAL loan; this chain governs the REFINANCING event that
//     replaces it.
//   - [[project-wave53-credit-origination-chain]] is the upstream gate for the
//     INCOMING lender's new facility; W157 sits beside it (same lender lifecycle
//     but on the borrower-initiated replacement side).
//   - [[project-wave69-security-perfection-chain]] will re-perfect security
//     for the new lender after financial_close here.
//
// Forward (happy / completed) path:
//   refinancing_mandated → term_sheet_signed → credit_approval →
//   conditions_precedent → sarb_exchange_control → nersa_clearance →
//   legal_documentation → financial_close
//
// Lender-default branch (rare but modelled; force majeure potential):
//   any pre-financial_close state → lender_default → recovery_in_progress
//
// Hard terminals:
//   financial_close      — Refinancing complete; new facility live.
//   abandoned            — Borrower abandons the refinancing process.
//   rejected             — NERSA or SARB rejects the application.
//   recovery_in_progress — New lender default scenario under active resolution.
//
// RefinancingTier: the INVERTED-SLA mechanism — the larger the debt quantum
// (ZAR), the MORE SARB/NERSA scrutiny is warranted, so more calendar time is
// allowed for each state window.
//
// Reportability (regulatory inbox crossings):
//   - achieve_financial_close → EVERY tier (major financing transaction; all
//     classes of refinancing are notifiable on completion — the W157 signature).
//   - reject_refinancing → significant + major + material (smaller minor /
//     moderate rejections do not rise to the level of notifiable market events).
//   - declare_lender_default → EVERY tier (potential force majeure trigger on
//     the underlying PPA + REIPPPP Project Agreement; always notifiable).
//
// Two-party split write: the IPP borrower drives mandate initiation, CP
// satisfaction, and abandonment; the lender/arranger drives term sheet,
// credit approval, documentation, financial close, and default declarations.
// actor_party (borrower | arranger | regulator) is derived from the ACTION.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Status types ────────────────────────────────────────────────────────────

export type RefinancingStatus =
  | 'refinancing_mandated'
  | 'term_sheet_signed'
  | 'credit_approval'
  | 'conditions_precedent'
  | 'sarb_exchange_control'
  | 'nersa_clearance'
  | 'legal_documentation'
  | 'financial_close'
  | 'abandoned'
  | 'rejected'
  | 'lender_default'
  | 'recovery_in_progress';

// ─── Action types ────────────────────────────────────────────────────────────

export type RefinancingAction =
  | 'sign_term_sheet'
  | 'submit_credit'
  | 'satisfy_conditions'
  | 'apply_sarb'
  | 'obtain_sarb_approval'
  | 'apply_nersa_clearance'
  | 'obtain_nersa_clearance'
  | 'finalise_documentation'
  | 'achieve_financial_close'
  | 'reject_refinancing'
  | 'abandon'
  | 'declare_lender_default'
  | 'resolve_lender_default';

// ─── Tier ────────────────────────────────────────────────────────────────────

/**
 * RefinancingTier — derived from the total debt quantum (ZAR, raw integer).
 *
 *   minor      — < R50 000 000     (< R50M)
 *   moderate   — < R250 000 000    (< R250M)
 *   significant — < R1 000 000 000 (< R1B)
 *   major      — < R5 000 000 000  (< R5B)
 *   material   — >= R5 000 000 000 (>= R5B)
 *
 * INVERTED SLA: the larger the quantum, the MORE time is allowed at each state
 * (deeper SARB/NERSA scrutiny for larger refinancings).
 */
export type RefinancingTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export function deriveRefinancingTier(debt_quantum_zar: number): RefinancingTier {
  if (debt_quantum_zar < 50_000_000)    return 'minor';
  if (debt_quantum_zar < 250_000_000)   return 'moderate';
  if (debt_quantum_zar < 1_000_000_000) return 'significant';
  if (debt_quantum_zar < 5_000_000_000) return 'major';
  return 'material';
}

// ─── Refinancing type ─────────────────────────────────────────────────────────

/**
 * RefinancingType — the structural nature of the replacement debt instrument.
 *
 *   term_loan_refinancing       — Like-for-like term loan, same asset base.
 *   bond_issuance               — Borrower issues project finance bonds via
 *                                 capital markets (JSE Debt Listings Requirements).
 *   green_bond                  — Climate-labelled bond (ICMA Green Bond Principles);
 *                                 triggers additional DoE / DFI sign-off.
 *   refinancing_with_equity_release — Refinancing that unlocks equity trapped in
 *                                 the SPV (NERSA §35 + SARB ExCon mandatory).
 *   debt_restructuring          — Covenant reset / maturity extension / term
 *                                 rescheduling (W45 sibling; not a full replacement).
 *   lender_substitution         — One or more existing lenders are replaced by
 *                                 incoming lenders (LMA transfer provisions).
 */
export type RefinancingType =
  | 'term_loan_refinancing'
  | 'bond_issuance'
  | 'green_bond'
  | 'refinancing_with_equity_release'
  | 'debt_restructuring'
  | 'lender_substitution';

// ─── SARB approval flag ───────────────────────────────────────────────────────

/**
 * SarbApprovalRequired: true when any non-resident lender is involved OR the
 * credit facility is being drawn offshore (SARB ExCon Circular 6/2010).
 */
export type SarbApprovalRequired = boolean;

// ─── Actor party ─────────────────────────────────────────────────────────────

export type RefinancingActorParty = 'borrower' | 'arranger' | 'regulator';

// ─── Transition table ─────────────────────────────────────────────────────────

interface TransitionRule {
  from: RefinancingStatus[];
  to:   RefinancingStatus;
}

/**
 * VALID_TRANSITIONS — the authoritative state machine.
 *
 * Forward path:
 *   refinancing_mandated → term_sheet_signed → credit_approval →
 *   conditions_precedent → sarb_exchange_control → nersa_clearance →
 *   legal_documentation → financial_close
 *
 * Abandonment: borrower may pull out at refinancing_mandated or
 * legal_documentation (before financial close; after CP work has been done).
 *
 * Rejection: NERSA or SARB may reject at credit_approval, conditions_precedent,
 * sarb_exchange_control, or nersa_clearance.
 *
 * Lender-default branch: any active pre-close state may tip into lender_default
 * if the incoming arranger/lender withdraws or becomes insolvent; resolved to
 * recovery_in_progress.
 */
export const VALID_TRANSITIONS: Record<RefinancingAction, TransitionRule> = {
  sign_term_sheet: {
    from: ['refinancing_mandated'],
    to:   'term_sheet_signed',
  },
  submit_credit: {
    from: ['term_sheet_signed'],
    to:   'credit_approval',
  },
  satisfy_conditions: {
    from: ['credit_approval'],
    to:   'conditions_precedent',
  },
  apply_sarb: {
    from: ['conditions_precedent'],
    to:   'sarb_exchange_control',
  },
  obtain_sarb_approval: {
    from: ['sarb_exchange_control'],
    to:   'nersa_clearance',
  },
  apply_nersa_clearance: {
    from: ['nersa_clearance'],
    to:   'nersa_clearance',  // idempotent re-submission within the same state
  },
  obtain_nersa_clearance: {
    from: ['nersa_clearance'],
    to:   'legal_documentation',
  },
  finalise_documentation: {
    from: ['legal_documentation'],
    to:   'financial_close',
  },
  achieve_financial_close: {
    from: ['legal_documentation'],
    to:   'financial_close',
  },
  reject_refinancing: {
    from: [
      'credit_approval',
      'conditions_precedent',
      'sarb_exchange_control',
      'nersa_clearance',
    ],
    to: 'rejected',
  },
  abandon: {
    from: ['refinancing_mandated', 'legal_documentation'],
    to:   'abandoned',
  },
  declare_lender_default: {
    from: [
      'term_sheet_signed',
      'credit_approval',
      'conditions_precedent',
      'sarb_exchange_control',
      'nersa_clearance',
      'legal_documentation',
    ],
    to: 'lender_default',
  },
  resolve_lender_default: {
    from: ['lender_default'],
    to:   'recovery_in_progress',
  },
};

// ─── Terminal states ──────────────────────────────────────────────────────────

export const HARD_TERMINALS: ReadonlySet<RefinancingStatus> = new Set<RefinancingStatus>([
  'financial_close',
  'abandoned',
  'rejected',
  'recovery_in_progress',
]);

export function isTerminal(status: RefinancingStatus): boolean {
  return HARD_TERMINALS.has(status);
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

/**
 * nextStatus — return the target state for `action` from `current`, or null if
 * the transition is invalid (terminal state or wrong `from` set).
 *
 * Note: `apply_nersa_clearance` is deliberately idempotent (from: nersa_clearance →
 * to: nersa_clearance) to model a resubmission within the same state; nextStatus
 * returns 'nersa_clearance' for that action.
 */
export function nextStatus(
  current: RefinancingStatus,
  action:  RefinancingAction,
): RefinancingStatus | null {
  if (isTerminal(current)) return null;
  const rule = VALID_TRANSITIONS[action];
  if (!rule) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(current: RefinancingStatus): RefinancingAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(VALID_TRANSITIONS) as RefinancingAction[]).filter((a) =>
    VALID_TRANSITIONS[a].from.includes(current),
  );
}

// ─── INVERTED SLA windows ─────────────────────────────────────────────────────

const DAY_MINUTES = 24 * 60;

/**
 * SLA_DAYS — per-state, per-tier window in calendar days.
 *
 * Top-level INVERTED envelope (total process duration budget):
 *   minor 30d / moderate 60d / significant 90d / major 150d / material 210d
 *
 * Individual state windows are proportioned from the envelope; the terminal
 * states carry no deadline (0).
 */
export const SLA_DAYS: Record<RefinancingStatus, Record<RefinancingTier, number>> = {
  // Mandate initiation → term sheet: negotiate with arranger banks
  refinancing_mandated: {
    minor: 5, moderate: 10, significant: 15, major: 25, material: 35,
  },
  // Term sheet → credit approval: full credit underwriting package
  term_sheet_signed: {
    minor: 7, moderate: 14, significant: 21, major: 35, material: 50,
  },
  // Credit approval → CPs: detailed conditions precedent satisfaction
  credit_approval: {
    minor: 5, moderate: 10, significant: 15, major: 25, material: 35,
  },
  // Conditions precedent → SARB application: CP doc assembly + submission
  conditions_precedent: {
    minor: 5, moderate: 10, significant: 14, major: 20, material: 30,
  },
  // SARB exchange-control review window (ExCon Circular 6/2010)
  sarb_exchange_control: {
    minor: 7, moderate: 14, significant: 21, major: 35, material: 50,
  },
  // NERSA §35 clearance review window (Licence Amendment Guidelines §4.3)
  nersa_clearance: {
    minor: 7, moderate: 14, significant: 21, major: 35, material: 50,
  },
  // Legal documentation drafting, execution, and conditions-satisfaction
  legal_documentation: {
    minor: 7, moderate: 14, significant: 21, major: 35, material: 50,
  },
  // Hard terminals — no SLA deadline
  financial_close:       { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
  abandoned:             { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
  rejected:              { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
  lender_default:        { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
  recovery_in_progress:  { minor: 0, moderate: 0, significant: 0, major: 0, material: 0 },
};

export function slaWindowMinutes(
  status: RefinancingStatus,
  tier:   RefinancingTier,
): number {
  return (SLA_DAYS[status]?.[tier] ?? 0) * DAY_MINUTES;
}

export function slaWindowDays(
  status: RefinancingStatus,
  tier:   RefinancingTier,
): number {
  return SLA_DAYS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  status:    RefinancingStatus,
  tier:      RefinancingTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(status)) return null;
  const minutes = slaWindowMinutes(status, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// ─── Reportability ────────────────────────────────────────────────────────────

/**
 * Tiers at or above `significant` for the reject_refinancing crossing.
 * A minor or moderate rejection is an administrative outcome; a significant+
 * rejection (≥ R1B) is a material market event.
 */
const REJECT_REPORTABLE_TIERS: ReadonlySet<RefinancingTier> = new Set<RefinancingTier>([
  'significant',
  'major',
  'material',
]);

/**
 * crossesIntoRegulator — determines whether a given (action, tier) combination
 * must trigger a crossing into the regulator inbox.
 *
 *   achieve_financial_close  → EVERY tier (W157 signature: all completed
 *                              refinancings of operating IPP SPVs are notifiable
 *                              under NERSA Licence Amendment Guidelines §4.3
 *                              and SARB prudential reporting).
 *
 *   reject_refinancing       → significant + major + material (≥ R1B quantum;
 *                              smaller rejections are administrative outcomes not
 *                              requiring regulator notification).
 *
 *   declare_lender_default   → EVERY tier (potential force majeure trigger on
 *                              the underlying PPA and REIPPPP Project Agreement;
 *                              always reportable regardless of quantum).
 */
export function crossesIntoRegulator(
  action: RefinancingAction,
  tier:   RefinancingTier,
): boolean {
  if (action === 'achieve_financial_close') return true;
  if (action === 'reject_refinancing')      return REJECT_REPORTABLE_TIERS.has(tier);
  if (action === 'declare_lender_default')  return true;
  return false;
}

/**
 * slaBreachCrossesIntoRegulator — an overdue process window on a significant+
 * refinancing is a prudential concern for both SARB (ExCon exposure) and NERSA
 * (licence condition). Minor/moderate SLA overruns are administrative.
 */
export function slaBreachCrossesIntoRegulator(tier: RefinancingTier): boolean {
  return REJECT_REPORTABLE_TIERS.has(tier);
}

/**
 * isReportable — row-level flag (drives the reportable dot on listing views).
 * A refinancing row is reportable if it will require a regulator crossing at
 * any point: every significant+ quantum, plus any refinancing with a non-resident
 * lender (SARB ExCon involvement regardless of size).
 */
export function isReportable(
  tier:                 RefinancingTier,
  sarb_approval_required: SarbApprovalRequired,
): boolean {
  return sarb_approval_required || REJECT_REPORTABLE_TIERS.has(tier);
}

// ─── Actor party derivation ───────────────────────────────────────────────────

/**
 * ACTION_PARTY — the functional party that performs each action, used for
 * audit-trail attribution (not the login role — party-from-action pattern).
 *
 *   borrower  — the IPP SPV / borrower entity (mandate initiation, CP
 *               satisfaction, abandonment)
 *   arranger  — the arranger bank / incoming lender (term sheet, credit
 *               approval, documentation, financial close, default declaration)
 *   regulator — SARB / NERSA (approval and clearance decisions, rejection)
 */
export const ACTION_PARTY: Record<RefinancingAction, RefinancingActorParty> = {
  sign_term_sheet:        'arranger',
  submit_credit:          'arranger',
  satisfy_conditions:     'borrower',
  apply_sarb:             'borrower',
  obtain_sarb_approval:   'regulator',
  apply_nersa_clearance:  'borrower',
  obtain_nersa_clearance: 'regulator',
  finalise_documentation: 'arranger',
  achieve_financial_close:'arranger',
  reject_refinancing:     'regulator',
  abandon:                'borrower',
  declare_lender_default: 'arranger',
  resolve_lender_default: 'arranger',
};

export function partyForAction(action: RefinancingAction): RefinancingActorParty {
  return ACTION_PARTY[action];
}

/**
 * isBorrowerAction — guards the borrower-side write set server-side.
 * Only the borrower (IPP SPV) may mandate, satisfy CPs, apply to SARB/NERSA,
 * and abandon.
 */
const BORROWER_ACTIONS: ReadonlySet<RefinancingAction> = new Set<RefinancingAction>([
  'satisfy_conditions',
  'apply_sarb',
  'apply_nersa_clearance',
  'abandon',
]);

export function isBorrowerAction(action: RefinancingAction): boolean {
  return BORROWER_ACTIONS.has(action);
}

/**
 * isRegulatorAction — guards the regulator-side write set server-side.
 * Only SARB/NERSA officers may approve/clear or reject.
 */
const REGULATOR_ACTIONS: ReadonlySet<RefinancingAction> = new Set<RefinancingAction>([
  'obtain_sarb_approval',
  'obtain_nersa_clearance',
  'reject_refinancing',
]);

export function isRegulatorAction(action: RefinancingAction): boolean {
  return REGULATOR_ACTIONS.has(action);
}

// ─── Event prefix ─────────────────────────────────────────────────────────────

/**
 * EVENT_PREFIX — used to namespace cascade events and audit log entries for
 * this chain. All events emitted by the refinancing state machine carry this
 * prefix (e.g. `refi_evt_financial_close`, `refi_evt_lender_default`).
 */
export const EVENT_PREFIX = 'refi_evt_' as const;

export type RefinancingEventName =
  | `${typeof EVENT_PREFIX}${RefinancingStatus}`
  | `${typeof EVENT_PREFIX}sla_breached`;

export function eventNameForStatus(status: RefinancingStatus): RefinancingEventName {
  return `${EVENT_PREFIX}${status}`;
}

export function slaBreachEventName(): RefinancingEventName {
  return `${EVENT_PREFIX}sla_breached`;
}

// ─── Convenience predicates ───────────────────────────────────────────────────

/**
 * requiresSarbExchangeControl — the sarb_exchange_control state is always
 * present in the forward path, but SARB approval is only strictly MANDATORY
 * (ExCon Circular 6/2010) when non-resident lenders are involved or when
 * the credit facility is offshore. For resident-only refinancings the SARB
 * state is still traversed for SARB prudential notification (not approval).
 */
export function requiresSarbExchangeControl(
  sarb_approval_required: SarbApprovalRequired,
  refinancing_type: RefinancingType,
): boolean {
  if (sarb_approval_required) return true;
  // equity-release refinancings always require ExCon clearance regardless of
  // lender residency (capital repatriation risk)
  if (refinancing_type === 'refinancing_with_equity_release') return true;
  return false;
}

/**
 * requiresNersaClearance — NERSA §35 clearance is required when the refinancing
 * materially changes the PPA credit-support obligations. All refinancing_types
 * except a pure lender_substitution (same terms, different lender) require
 * NERSA clearance. The state is always modelled in the chain regardless; this
 * helper gates whether the `apply_nersa_clearance` action is mandatory.
 */
export function requiresNersaClearance(refinancing_type: RefinancingType): boolean {
  return refinancing_type !== 'lender_substitution';
}

/**
 * legalBasisForType — human-readable legal authority description for a given
 * refinancing type, used in audit-chain briefings and cascade notifications.
 */
export function legalBasisForType(refinancing_type: RefinancingType): string {
  switch (refinancing_type) {
    case 'term_loan_refinancing':
      return 'NERSA Licence Amendment Guidelines §4.3 + LMA Senior Facility Agreement change provisions + SARB ExCon Circular 6/2010';
    case 'bond_issuance':
      return 'JSE Debt Listings Requirements + NERSA §35 + SARB ExCon Circular 6/2010 + LMA';
    case 'green_bond':
      return 'ICMA Green Bond Principles + JSE Debt Listings Requirements + NERSA §35 + DoE Green Economy Strategy + SARB ExCon Circular 6/2010';
    case 'refinancing_with_equity_release':
      return 'NERSA §35 (mandatory) + SARB ExCon Circular 6/2010 (mandatory — capital repatriation) + LMA SFA change provisions + REIPPPP Project Agreement §24';
    case 'debt_restructuring':
      return 'LMA Senior Facility Agreement amendment provisions + NERSA §35 + SARB ExCon Circular 6/2010 + REIPPPP Project Agreement §24';
    case 'lender_substitution':
      return 'LMA Transfer Certificate + SARB ExCon Circular 6/2010 (if non-resident incoming lender) + REIPPPP Project Agreement §24';
  }
}
