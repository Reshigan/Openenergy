// ═══════════════════════════════════════════════════════════════════════════
// Wave 11 — UNFCCC MRV verification-chain state machine.
//
// Pure helpers — no DB, no env, no I/O. Routes + cron sweep call into these
// to figure out:
//   • Given a current state + action, what's the next state?
//   • What's the SLA deadline for the new state?
//   • Has the SLA breached?
//   • Does this transition cross into regulator scope?
//
// State machine (P6 UNFCCC verification chain):
//
//   draft
//     → submit          → submitted
//   submitted
//     → assign_doe      → doe_assigned         (90-day SLA per CDM rules)
//   doe_assigned
//     → start_review    → doe_review
//   doe_review
//     → record_opinion(positive)   → doe_opinion_positive    → ready for CRA
//     → record_opinion(qualified)  → doe_opinion_qualified   → ready for CRA
//     → record_opinion(adverse)    → doe_opinion_adverse     → terminal (escalate)
//     → record_opinion(disclaimer) → doe_opinion_disclaimer  → terminal
//   doe_opinion_positive | doe_opinion_qualified
//     → submit_cra      → cra_review           (30-day SLA)
//   cra_review
//     → cra_approve     → cra_approved
//     → cra_reject      → cra_rejected         (regulator-inbox high)
//   cra_approved
//     → authorize       → issuance_authorized
//   issuance_authorized
//     → issue           → issued               (terminal)
//
// SLA breach raises 'sla_breached' from any non-terminal state.
// ═══════════════════════════════════════════════════════════════════════════

export type ChainStatus =
  | 'draft'
  | 'submitted'
  | 'doe_assigned'
  | 'doe_review'
  | 'doe_opinion_positive'
  | 'doe_opinion_qualified'
  | 'doe_opinion_adverse'
  | 'doe_opinion_disclaimer'
  | 'cra_review'
  | 'cra_approved'
  | 'cra_rejected'
  | 'issuance_authorized'
  | 'issued'
  | 'withdrawn';

export type DoeOpinion = 'positive' | 'qualified' | 'adverse' | 'disclaimer';
export type CraDecision = 'approved' | 'rejected';

// Per-CDM-rules and Article-6.4 supervisory-body guidance.
export const DOE_SLA_DAYS = 90;
export const CRA_SLA_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATES: ReadonlySet<ChainStatus> = new Set<ChainStatus>([
  'doe_opinion_adverse',
  'doe_opinion_disclaimer',
  'cra_rejected',
  'issued',
  'withdrawn',
]);

/**
 * Whether the chain has reached a terminal state — no further auto-advance.
 */
export function isTerminal(s: ChainStatus): boolean {
  return TERMINAL_STATES.has(s);
}

/**
 * Whether transitioning into `next` crosses into regulator-inbox scope.
 * Currently DOE adverse + CRA rejected + SLA breach all cross.
 */
export function crossesIntoRegulator(prev: ChainStatus | null | undefined, next: ChainStatus): boolean {
  if (prev === next) return false;
  return next === 'doe_opinion_adverse' || next === 'cra_rejected';
}

/**
 * Compute SLA due time for the freshly-entered state. Returns null for
 * states without an explicit SLA (e.g. draft, terminal states).
 */
export function slaDueAt(state: ChainStatus, now: Date = new Date()): string | null {
  if (state === 'doe_assigned' || state === 'doe_review') {
    return new Date(now.getTime() + DOE_SLA_DAYS * DAY_MS).toISOString();
  }
  if (state === 'cra_review') {
    return new Date(now.getTime() + CRA_SLA_DAYS * DAY_MS).toISOString();
  }
  return null;
}

/**
 * Days remaining until a deadline. Negative if already breached.
 */
export function daysUntilDeadline(deadline: string | null | undefined, now: Date = new Date()): number | null {
  if (!deadline) return null;
  return Math.floor((new Date(deadline).getTime() - now.getTime()) / DAY_MS);
}

export interface AdvanceInput {
  current: ChainStatus;
  action: 'submit' | 'assign_doe' | 'start_review' | 'record_opinion' | 'submit_cra'
        | 'cra_approve' | 'cra_reject' | 'authorize' | 'issue' | 'withdraw';
  doeOpinion?: DoeOpinion;
}

export interface AdvanceResult {
  next: ChainStatus;
  ok: boolean;
  error?: string;
}

const TRANSITIONS: Record<ChainStatus, Partial<Record<AdvanceInput['action'], ChainStatus | ((opinion?: DoeOpinion) => ChainStatus)>>> = {
  draft:               { submit: 'submitted', withdraw: 'withdrawn' },
  submitted:           { assign_doe: 'doe_assigned', withdraw: 'withdrawn' },
  doe_assigned:        { start_review: 'doe_review', withdraw: 'withdrawn' },
  doe_review:          { record_opinion: (op) =>
                          op === 'positive'   ? 'doe_opinion_positive'   :
                          op === 'qualified'  ? 'doe_opinion_qualified'  :
                          op === 'adverse'    ? 'doe_opinion_adverse'    :
                          op === 'disclaimer' ? 'doe_opinion_disclaimer' : 'doe_review' },
  doe_opinion_positive:  { submit_cra: 'cra_review' },
  doe_opinion_qualified: { submit_cra: 'cra_review' },
  doe_opinion_adverse:   {},
  doe_opinion_disclaimer: {},
  cra_review:           { cra_approve: 'cra_approved', cra_reject: 'cra_rejected' },
  cra_approved:         { authorize: 'issuance_authorized' },
  cra_rejected:         {},
  issuance_authorized:  { issue: 'issued' },
  issued:               {},
  withdrawn:            {},
};

/**
 * Apply an action to the current state, returning the next state or an
 * error if the transition is invalid. Pure — does not write to DB.
 */
export function advance(input: AdvanceInput): AdvanceResult {
  const rule = TRANSITIONS[input.current]?.[input.action];
  if (rule == null) {
    return { next: input.current, ok: false, error: `Cannot ${input.action} from ${input.current}` };
  }
  if (input.action === 'record_opinion') {
    if (!input.doeOpinion) {
      return { next: input.current, ok: false, error: 'doeOpinion required to record opinion' };
    }
    const next = typeof rule === 'function' ? rule(input.doeOpinion) : rule;
    return { next: next as ChainStatus, ok: true };
  }
  const next = typeof rule === 'function' ? rule(input.doeOpinion) : rule;
  return { next: next as ChainStatus, ok: true };
}

/**
 * Whether `deadline` has been breached at `now`. Null deadline → never breaches.
 */
export function isSlaBreached(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() < now.getTime();
}

/**
 * Human-readable label per state (used by UI + audit chain).
 */
export const STATUS_LABEL: Record<ChainStatus, string> = {
  draft:                   'Draft',
  submitted:               'Submitted',
  doe_assigned:            'DOE assigned',
  doe_review:              'DOE review in progress',
  doe_opinion_positive:    'DOE opinion: positive',
  doe_opinion_qualified:   'DOE opinion: qualified',
  doe_opinion_adverse:     'DOE opinion: adverse',
  doe_opinion_disclaimer:  'DOE opinion: disclaimer',
  cra_review:              'CRA review in progress',
  cra_approved:            'CRA approved',
  cra_rejected:            'CRA rejected',
  issuance_authorized:     'Issuance authorized',
  issued:                  'Issued',
  withdrawn:               'Withdrawn',
};
