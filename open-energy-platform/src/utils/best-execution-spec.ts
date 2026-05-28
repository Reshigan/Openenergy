// ─────────────────────────────────────────────────────────────────────────
// Wave 36 — Trader Best-Execution / RFQ Compliance chain (P6)
//
// FSCA Conduct Standard 1 of 2020 (General Code of Conduct for Authorised
// FSPs) best-execution duty + FAIS Act 2002 + JSE Equities/Derivatives best-
// execution rules. Every client/counterparty RFQ on the exchange must take all
// sufficient steps to obtain the best possible result (total consideration =
// price + cost + speed + likelihood) for the client. This chain governs the
// RFQ → quotes → best-ex evaluation → execution → TCA review lifecycle and the
// documented-override / exception-escalation branches.
//
// Operational complement to W2 VaR (quality), W9 MM compliance (consistency),
// W29 position limits (quantity): this enforces best EXECUTION on each order.
//
//   rfq_received → quotes_solicited → quotes_received → best_ex_evaluated →
//   execution_approved → executed → tca_reviewed → closed
//
// Branches:
//   override_executed   — desk executed away from the best quote with a
//                         documented justification (size/likelihood); still
//                         routes through TCA → closed
//   exception_escalated — best-ex policy breach escalated to compliance/FSCA
//   rfq_expired         — RFQ window lapsed before execution
//
// Tiers (FSCA client classification — drive SLA + reportability):
//   retail               — strongest best-ex protection (total consideration)
//   professional         — best-ex applies, lighter
//   eligible_counterparty— largely waived best-ex (ECP)
//
// SLA matrix is MIXED — quote/approval steps use hard market windows (same
// across tiers), but evaluation + TCA review are protection-graded (retail
// tightest). Reportability: exception escalation crosses for EVERY tier
// (deliberate compliance escalation is always notifiable); documented overrides
// and SLA breaches cross for retail + professional only (ECP waived best-ex).
// ─────────────────────────────────────────────────────────────────────────

export type BestExStatus =
  | 'rfq_received'
  | 'quotes_solicited'
  | 'quotes_received'
  | 'best_ex_evaluated'
  | 'execution_approved'
  | 'executed'
  | 'override_executed'
  | 'tca_reviewed'
  | 'closed'
  | 'exception_escalated'
  | 'rfq_expired';

export type BestExAction =
  | 'solicit_quotes'
  | 'record_quotes'
  | 'evaluate_best_ex'
  | 'approve_execution'
  | 'execute'
  | 'execute_override'
  | 'review_tca'
  | 'close'
  | 'escalate_exception'
  | 'expire';

export type BestExTier = 'retail' | 'professional' | 'eligible_counterparty';

export type BestExEvent =
  | 'best_execution.quotes_solicited'
  | 'best_execution.quotes_received'
  | 'best_execution.best_ex_evaluated'
  | 'best_execution.execution_approved'
  | 'best_execution.executed'
  | 'best_execution.override_executed'
  | 'best_execution.tca_reviewed'
  | 'best_execution.closed'
  | 'best_execution.exception_escalated'
  | 'best_execution.rfq_expired'
  | 'best_execution.sla_breached';

const TERMINALS = new Set<BestExStatus>(['closed', 'exception_escalated', 'rfq_expired']);

export function isTerminal(s: BestExStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<BestExAction, { from: BestExStatus[]; to: BestExStatus }> = {
  solicit_quotes:     { from: ['rfq_received'],                          to: 'quotes_solicited' },
  record_quotes:      { from: ['quotes_solicited'],                      to: 'quotes_received' },
  evaluate_best_ex:   { from: ['quotes_received'],                       to: 'best_ex_evaluated' },
  approve_execution:  { from: ['best_ex_evaluated'],                     to: 'execution_approved' },
  execute:            { from: ['execution_approved'],                    to: 'executed' },
  execute_override:   { from: ['best_ex_evaluated'],                     to: 'override_executed' },
  review_tca:         { from: ['executed', 'override_executed'],         to: 'tca_reviewed' },
  close:              { from: ['tca_reviewed'],                          to: 'closed' },
  escalate_exception: { from: ['best_ex_evaluated', 'tca_reviewed'],     to: 'exception_escalated' },
  expire:             { from: ['rfq_received', 'quotes_solicited', 'quotes_received'], to: 'rfq_expired' },
};

export function nextStatus(current: BestExStatus, action: BestExAction): BestExStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: BestExStatus): BestExAction[] {
  const acts: BestExAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [BestExAction, typeof TRANSITIONS[BestExAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;

// MIXED matrix — hard market windows on quote/approval steps (same across
// tiers), protection-graded windows on evaluation + TCA (retail tightest).
export const SLA_MINUTES: Record<BestExStatus, Record<BestExTier, number>> = {
  rfq_received: {
    retail:                30 * MIN,
    professional:          60 * MIN,
    eligible_counterparty: 120 * MIN,
  },
  quotes_solicited: {
    retail:                15 * MIN,   // hard market window — same all tiers
    professional:          15 * MIN,
    eligible_counterparty: 15 * MIN,
  },
  quotes_received: {
    retail:                30 * MIN,
    professional:          60 * MIN,
    eligible_counterparty: 120 * MIN,
  },
  best_ex_evaluated: {
    retail:                60 * MIN,   // hard approval window — same all tiers
    professional:          60 * MIN,
    eligible_counterparty: 60 * MIN,
  },
  execution_approved: {
    retail:                30 * MIN,   // hard execution window — same all tiers
    professional:          30 * MIN,
    eligible_counterparty: 30 * MIN,
  },
  executed: {
    retail:                24 * HOUR,  // protection-graded TCA review
    professional:          72 * HOUR,
    eligible_counterparty: 168 * HOUR,
  },
  override_executed: {
    retail:                4 * HOUR,   // override = tighter TCA scrutiny
    professional:          24 * HOUR,
    eligible_counterparty: 72 * HOUR,
  },
  tca_reviewed: {
    retail:                24 * HOUR,
    professional:          48 * HOUR,
    eligible_counterparty: 72 * HOUR,
  },
  closed:              { retail: 0, professional: 0, eligible_counterparty: 0 },
  exception_escalated: { retail: 0, professional: 0, eligible_counterparty: 0 },
  rfq_expired:         { retail: 0, professional: 0, eligible_counterparty: 0 },
};

export function slaDeadlineFor(status: BestExStatus, tier: BestExTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// FSCA best-ex obligation applies in full to retail + professional clients;
// eligible counterparties have largely waived it.
const BESTEX_TIERS = new Set<BestExTier>(['retail', 'professional']);

export function bestExObligationApplies(tier: BestExTier): boolean {
  return BESTEX_TIERS.has(tier);
}

export function isReportable(tier: BestExTier): boolean {
  return BESTEX_TIERS.has(tier);
}

// Reportability matrix:
//   - escalate_exception crosses for EVERY tier (a deliberate compliance
//     escalation is always notifiable, even for an ECP)
//   - execute_override crosses for retail + professional (ECP overrides are
//     routine — they waived best-ex)
export function crossesIntoRegulator(action: BestExAction, tier: BestExTier): boolean {
  if (action === 'escalate_exception') return true;
  if (action === 'execute_override')   return BESTEX_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: BestExTier): boolean {
  return BESTEX_TIERS.has(tier);
}

// Party that each action represents (front office vs compliance vs client).
// One desk records the workflow; this tags the contractual function.
const ACTION_PARTY: Record<BestExAction, 'desk' | 'compliance' | 'system'> = {
  solicit_quotes:     'desk',
  record_quotes:      'desk',
  evaluate_best_ex:   'desk',
  approve_execution:  'compliance',
  execute:            'desk',
  execute_override:   'desk',
  review_tca:         'compliance',
  close:              'compliance',
  escalate_exception: 'compliance',
  expire:             'system',
};

export function partyForAction(action: BestExAction): 'desk' | 'compliance' | 'system' {
  return ACTION_PARTY[action];
}
