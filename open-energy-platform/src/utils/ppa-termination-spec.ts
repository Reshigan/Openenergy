// ─────────────────────────────────────────────────────────────────────────
// Wave 62 — Offtaker PPA Termination & Early-Termination Amount (Buy-Out) chain
//
// The EXIT of the offtake relationship. Every prior Offtaker chain operates on a
// LIVE PPA — [[project-wave22-ppa-contract-chain]] executes it,
// [[project-wave39-tariff-indexation-chain]] reprices it,
// [[project-wave7-offtaker-portal]] reconciles delivery,
// [[project-wave32-take-or-pay-chain]] enforces minimum offtake,
// [[project-wave46-curtailment-claim-chain]] compensates curtailed energy and
// [[project-wave54-payment-security-chain]] backstops payment. W62 is how the
// PPA ENDS before its natural term: a termination event arises, notice is
// served, a cure window runs, and — if uncured — the PPA terminates and an
// early-termination amount (the buy-out) is calculated, agreed and settled.
//
// The buy-out is the single most consequential number in a PPA. Its basis turns
// on the termination CAUSE (the W62 signature):
//   - seller_default          — the IPP is in default (abandonment, prolonged
//                               non-delivery, insolvency). Buy-out = DEBT ONLY:
//                               the lenders are covered, the defaulting seller
//                               keeps no equity make-whole.
//   - buyer_default           — the offtaker is in default (persistent
//                               non-payment surfaced by W32 / W54, repudiation).
//                               Buy-out = DEBT + EQUITY: the seller is made whole
//                               at the buyer's cost.
//   - change_in_law           — a discriminatory change in law makes performance
//                               unlawful / uneconomic. Buy-out = DEBT + EQUITY
//                               (typically a government / buyer obligation).
//   - prolonged_force_majeure — an FM event persists beyond the long-stop.
//                               Buy-out = DEBT ONLY (shared risk; no equity gain).
//   - no_fault                — mutual / voluntary termination. Buy-out =
//                               NEGOTIATED between the parties.
//
// 12-state P6 lifecycle:
//   termination_triggered → notice_served → cure_period
//     → termination_review → termination_confirmed → eta_assessment
//     → eta_agreed → settlement_pending → closed              (full buy-out path)
//   cure path:     cure_period → reinstated                   (counterparty cured)
//   no-cure path:  notice_served → termination_review         (no_fault — no cure)
//   dispute path:  eta_assessment / eta_agreed → disputed → eta_agreed
//   withdraw:      any pre-confirmation operative state → withdrawn
//
// Tiers (5) by the early-termination amount (buy-out) in ZAR millions:
//   minor <50 / moderate <250 / material <1000 / major <5000 / critical >=5000
//
// SLA matrix is MIXED — the realistic shape of a termination. Notice / review
// windows are roughly fixed (contractual); cure + ETA-assessment + dispute
// windows are INVERTED (a bigger buy-out needs longer cure and a deeper,
// debt-schedule + equity-IRR computation); the settlement window is URGENT (once
// agreed, a larger buy-out is paid FASTER for security of supply). Terminals 0.
//
// Reportability (the W62 signature is CAUSE-driven, not size-driven):
//   - confirm_termination crosses the regulator for EVERY tier when the cause is
//     INVOLUNTARY (seller_default / buyer_default / change_in_law /
//     prolonged_force_majeure) — terminating a licensed generator's offtake for
//     fault, illegality or prolonged FM is always a NERSA security-of-supply
//     event; a no_fault (mutual) termination crosses only for the large tiers.
//   - confirm_settlement crosses for the large tiers (major + critical) only — a
//     large buy-out has fiscal / market implications (esp. change_in_law).
//   - SLA breaches cross for major + critical only.
//
// Two-party split write: the OFFTAKER side drives the termination machinery; the
// SELLER / counterparty (IPP) can dispute the calculated buy-out (dispute_eta is
// the sole counterparty write). actor_party (offtaker / counterparty /
// independent) records the contractual function per step, not the JWT role.
// ─────────────────────────────────────────────────────────────────────────

export type PpaTerminationStatus =
  | 'termination_triggered'
  | 'notice_served'
  | 'cure_period'
  | 'termination_review'
  | 'termination_confirmed'
  | 'eta_assessment'
  | 'eta_agreed'
  | 'disputed'
  | 'settlement_pending'
  | 'closed'
  | 'reinstated'
  | 'withdrawn';

export type PpaTerminationAction =
  | 'serve_notice'
  | 'open_cure'
  | 'confirm_cure'
  | 'escalate_review'
  | 'confirm_termination'
  | 'open_eta_assessment'
  | 'agree_eta'
  | 'dispute_eta'
  | 'resolve_dispute'
  | 'initiate_settlement'
  | 'confirm_settlement'
  | 'withdraw';

export type PpaTerminationTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

export type TerminationCause =
  | 'seller_default'
  | 'buyer_default'
  | 'no_fault'
  | 'change_in_law'
  | 'prolonged_force_majeure';

// The buy-out basis each cause produces.
export type EtaBasis = 'debt_only' | 'debt_plus_equity' | 'negotiated';

export type PpaTerminationEvent =
  | 'ppa_termination.notice_served'
  | 'ppa_termination.cure_period'
  | 'ppa_termination.reinstated'
  | 'ppa_termination.termination_review'
  | 'ppa_termination.termination_confirmed'
  | 'ppa_termination.eta_assessment'
  | 'ppa_termination.eta_agreed'
  | 'ppa_termination.disputed'
  | 'ppa_termination.settlement_pending'
  | 'ppa_termination.closed'
  | 'ppa_termination.withdrawn'
  | 'ppa_termination.sla_breached';

const TERMINALS = new Set<PpaTerminationStatus>([
  'closed', 'reinstated', 'withdrawn',
]);

export function isTerminal(s: PpaTerminationStatus): boolean {
  return TERMINALS.has(s);
}

// withdraw is available from every pre-confirmation operative state (once a
// termination is CONFIRMED it proceeds to buy-out — it can no longer be pulled).
const WITHDRAW_FROM = new Set<PpaTerminationStatus>([
  'termination_triggered', 'notice_served', 'cure_period', 'termination_review',
]);

export const TRANSITIONS: Record<PpaTerminationAction, { from: PpaTerminationStatus[]; to: PpaTerminationStatus }> = {
  serve_notice:        { from: ['termination_triggered'],                  to: 'notice_served' },
  open_cure:           { from: ['notice_served'],                          to: 'cure_period' },
  confirm_cure:        { from: ['cure_period'],                            to: 'reinstated' },
  escalate_review:     { from: ['notice_served', 'cure_period'],           to: 'termination_review' },
  confirm_termination: { from: ['termination_review'],                     to: 'termination_confirmed' },
  open_eta_assessment: { from: ['termination_confirmed'],                  to: 'eta_assessment' },
  agree_eta:           { from: ['eta_assessment'],                         to: 'eta_agreed' },
  dispute_eta:         { from: ['eta_assessment', 'eta_agreed'],           to: 'disputed' },
  resolve_dispute:     { from: ['disputed'],                               to: 'eta_agreed' },
  initiate_settlement: { from: ['eta_agreed'],                             to: 'settlement_pending' },
  confirm_settlement:  { from: ['settlement_pending'],                     to: 'closed' },
  withdraw:            { from: [...WITHDRAW_FROM],                         to: 'withdrawn' },
};

export function nextStatus(current: PpaTerminationStatus, action: PpaTerminationAction): PpaTerminationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PpaTerminationStatus): PpaTerminationAction[] {
  const acts: PpaTerminationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PpaTerminationAction, typeof TRANSITIONS[PpaTerminationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// MIXED matrix. notice / review are roughly fixed; cure + eta_assessment +
// dispute are INVERTED (bigger buy-out = longer); settlement_pending is URGENT
// (bigger = paid faster once agreed). Terminals carry no deadline.
export const SLA_MINUTES: Record<PpaTerminationStatus, Record<PpaTerminationTier, number>> = {
  termination_triggered: {
    minor: 5 * DAY, moderate: 5 * DAY, material: 7 * DAY, major: 7 * DAY, critical: 10 * DAY,
  },
  notice_served: {
    minor: 7 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 10 * DAY, critical: 14 * DAY,
  },
  cure_period: {
    minor: 14 * DAY, moderate: 20 * DAY, material: 30 * DAY, major: 45 * DAY, critical: 60 * DAY,
  },
  termination_review: {
    minor: 7 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 14 * DAY, critical: 14 * DAY,
  },
  termination_confirmed: {
    minor: 5 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 14 * DAY, critical: 21 * DAY,
  },
  eta_assessment: {
    minor: 10 * DAY, moderate: 15 * DAY, material: 21 * DAY, major: 30 * DAY, critical: 45 * DAY,
  },
  eta_agreed: {
    minor: 7 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 10 * DAY, critical: 14 * DAY,
  },
  disputed: {
    minor: 15 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, critical: 60 * DAY,
  },
  settlement_pending: {
    minor: 30 * DAY, moderate: 21 * DAY, material: 14 * DAY, major: 10 * DAY, critical: 7 * DAY,
  },
  closed:      { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  reinstated:  { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  withdrawn:   { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: PpaTerminationStatus, tier: PpaTerminationTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PpaTerminationStatus, tier: PpaTerminationTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// 5 tiers by the early-termination amount (buy-out) in ZAR millions.
export function tierForBuyoutZarM(amountZarM: number): PpaTerminationTier {
  if (amountZarM < 50) return 'minor';
  if (amountZarM < 250) return 'moderate';
  if (amountZarM < 1000) return 'material';
  if (amountZarM < 5000) return 'major';
  return 'critical';
}

const LARGE_TIERS = new Set<PpaTerminationTier>(['major', 'critical']);

export function isLargeTier(tier: PpaTerminationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Every cause except a mutual / voluntary no_fault termination is involuntary.
const INVOLUNTARY_CAUSES = new Set<TerminationCause>([
  'seller_default', 'buyer_default', 'change_in_law', 'prolonged_force_majeure',
]);

export function isInvoluntaryCause(cause: TerminationCause): boolean {
  return INVOLUNTARY_CAUSES.has(cause);
}

// The buy-out basis each cause produces — drives the ETA computation and the UI.
const ETA_BASIS: Record<TerminationCause, EtaBasis> = {
  seller_default:          'debt_only',
  buyer_default:           'debt_plus_equity',
  change_in_law:           'debt_plus_equity',
  prolonged_force_majeure: 'debt_only',
  no_fault:                'negotiated',
};

export function etaBasisForCause(cause: TerminationCause): EtaBasis {
  return ETA_BASIS[cause];
}

// Reportability matrix (the W62 signature is CAUSE-driven):
//   - confirm_termination crosses for EVERY tier when the cause is involuntary
//     (fault / illegality / prolonged FM); a no_fault mutual termination crosses
//     only for the large tiers.
//   - confirm_settlement (paying the buy-out) crosses for the large tiers only.
export function crossesIntoRegulator(
  action: PpaTerminationAction,
  tier: PpaTerminationTier,
  cause: TerminationCause,
): boolean {
  if (action === 'confirm_termination') {
    return isInvoluntaryCause(cause) || LARGE_TIERS.has(tier);
  }
  if (action === 'confirm_settlement') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PpaTerminationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// A case NERSA tracks: an involuntary-cause termination, or a large-tier buy-out.
export function isReportable(tier: PpaTerminationTier, cause: TerminationCause): boolean {
  return isInvoluntaryCause(cause) || LARGE_TIERS.has(tier);
}

// Party each action represents (contractual function), not the login role. The
// OFFTAKER side drives the termination machinery; the SELLER / counterparty (IPP)
// can dispute the calculated buy-out; resolve_dispute records an INDEPENDENT
// expert determination.
const ACTION_PARTY: Record<PpaTerminationAction, 'offtaker' | 'counterparty' | 'independent'> = {
  serve_notice:        'offtaker',
  open_cure:           'offtaker',
  confirm_cure:        'offtaker',
  escalate_review:     'offtaker',
  confirm_termination: 'offtaker',
  open_eta_assessment: 'offtaker',
  agree_eta:           'offtaker',
  dispute_eta:         'counterparty',
  resolve_dispute:     'independent',
  initiate_settlement: 'offtaker',
  confirm_settlement:  'offtaker',
  withdraw:            'offtaker',
};

export function partyForAction(action: PpaTerminationAction): 'offtaker' | 'counterparty' | 'independent' {
  return ACTION_PARTY[action];
}

// Counterparty-side write set (guarded server-side via the two-party split). The
// seller / counterparty's sole write is to dispute the calculated buy-out;
// everything else is driven by the offtaker side.
const COUNTERPARTY_ACTIONS = new Set<PpaTerminationAction>(['dispute_eta']);

export function isCounterpartyAction(action: PpaTerminationAction): boolean {
  return COUNTERPARTY_ACTIONS.has(action);
}
