// ─────────────────────────────────────────────────────────────────────────
// Wave 30 — Lender Disbursement UoP Reconciliation chain (P6)
//
// 10-state lifecycle every disbursement tranche goes through AFTER the
// drawdown is funded (W21). Project-finance banks are legally bound by:
//   • SARB Banking Act + Exchange Control reporting (for any cross-border
//     drawdown), and
//   • Equator Principles (every signatory SA bank for >USD10m project loans)
// to reconcile actual use-of-proceeds (UoP) against the approved facility
// agreement. The Independent Engineer (IE) signs off that the spend matches
// the construction milestones.
//
// Forward path:
//   tranche_released → invoices_pending → invoices_submitted →
//   bank_validating → ie_certifying → uop_certified → reconciled
//
// Terminals: reconciled (good — UoP matched, tranche closed),
//            clawback_executed (bad — UoP failure, lender claws back),
//            waived (special — board exception, written into facility).
//
// Tiers (tranche size — drives SLA matrix + reportability):
//   senior_a   — R500m+ tranche (REIPPPP big-five seniors)
//   senior_b   — R100–R500m tranche (utility-scale mid)
//   mezzanine  — R20–R100m mezz
//   bridge     — <R20m short-dated bridge
//
// SLA matrix is INVERTED across tiers — bigger tranche gets more documentation
// time (auditor logistics + multi-contractor invoice flow take longer).
//
// Reportability (SARB Exchange Control + Equator Principles secretariat):
//   - clawback_executed crosses for ALL tiers (universal hard line)
//   - sla_breached crosses for senior_a + senior_b only
//   - reconciled / uop_certified never cross (happy paths)
// ─────────────────────────────────────────────────────────────────────────

export type DisbursementStatus =
  | 'tranche_released'
  | 'invoices_pending'
  | 'invoices_submitted'
  | 'bank_validating'
  | 'ie_certifying'
  | 'uop_certified'
  | 'reconciled'
  | 'clawback_executed'
  | 'waived';

export type DisbursementAction =
  | 'request_invoices'
  | 'submit_invoices'
  | 'begin_validation'
  | 'request_ie'
  | 'accept_ie'
  | 'close_reconciliation'
  | 'demand_clawback'
  | 'waive';

export type DisbursementTier = 'senior_a' | 'senior_b' | 'mezzanine' | 'bridge';

export type DisbursementEvent =
  | 'disbursement.invoices_pending'
  | 'disbursement.invoices_submitted'
  | 'disbursement.bank_validating'
  | 'disbursement.ie_certifying'
  | 'disbursement.uop_certified'
  | 'disbursement.reconciled'
  | 'disbursement.clawback_executed'
  | 'disbursement.waived'
  | 'disbursement.sla_breached';

const TERMINALS = new Set<DisbursementStatus>(['reconciled', 'clawback_executed', 'waived']);

export function isTerminal(s: DisbursementStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<DisbursementAction, { from: DisbursementStatus[]; to: DisbursementStatus }> = {
  request_invoices:     { from: ['tranche_released'],    to: 'invoices_pending' },
  submit_invoices:      { from: ['invoices_pending'],    to: 'invoices_submitted' },
  begin_validation:     { from: ['invoices_submitted'],  to: 'bank_validating' },
  request_ie:           { from: ['bank_validating'],     to: 'ie_certifying' },
  accept_ie:            { from: ['ie_certifying'],       to: 'uop_certified' },
  close_reconciliation: { from: ['uop_certified'],       to: 'reconciled' },
  demand_clawback: {
    from: ['invoices_submitted', 'bank_validating', 'ie_certifying', 'uop_certified'],
    to: 'clawback_executed',
  },
  waive: { from: ['invoices_pending'], to: 'waived' },
};

export function nextStatus(current: DisbursementStatus, action: DisbursementAction): DisbursementStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: DisbursementStatus): DisbursementAction[] {
  const acts: DisbursementAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [DisbursementAction, typeof TRANSITIONS[DisbursementAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED tier SLAs — bigger tranche gets MORE time for UoP documentation.
export const SLA_MINUTES: Record<DisbursementStatus, Record<DisbursementTier, number>> = {
  tranche_released: {
    senior_a:  3 * DAY,    // bank front-office must issue invoice request
    senior_b:  3 * DAY,
    mezzanine: 2 * DAY,
    bridge:    1 * DAY,
  },
  invoices_pending: {
    senior_a:  60 * DAY,   // big multi-contractor flow
    senior_b:  45 * DAY,
    mezzanine: 30 * DAY,
    bridge:    14 * DAY,
  },
  invoices_submitted: {
    senior_a:  5 * DAY,    // bank ack window
    senior_b:  5 * DAY,
    mezzanine: 3 * DAY,
    bridge:    2 * DAY,
  },
  bank_validating: {
    senior_a:  14 * DAY,   // front-office line-by-line check
    senior_b:  10 * DAY,
    mezzanine: 7 * DAY,
    bridge:    5 * DAY,
  },
  ie_certifying: {
    senior_a:  30 * DAY,   // Independent Engineer site visits
    senior_b:  21 * DAY,
    mezzanine: 14 * DAY,
    bridge:    7 * DAY,
  },
  uop_certified: {
    senior_a:  7 * DAY,    // bank reconciliation sign-off
    senior_b:  5 * DAY,
    mezzanine: 5 * DAY,
    bridge:    3 * DAY,
  },
  reconciled:        { senior_a: 0, senior_b: 0, mezzanine: 0, bridge: 0 },
  clawback_executed: { senior_a: 0, senior_b: 0, mezzanine: 0, bridge: 0 },
  waived:            { senior_a: 0, senior_b: 0, mezzanine: 0, bridge: 0 },
};

export function slaDeadlineFor(status: DisbursementStatus, tier: DisbursementTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// SARB Exchange Control + Equator Principles secretariat reportability.
// Clawback is the universal hard line (any tier). SLA breaches cross only
// for senior tranches (small bridges are aggregated in monthly Banking
// Sector Conduct Standards returns).
const CLAWBACK_REPORTABLE = new Set<DisbursementTier>(['senior_a', 'senior_b', 'mezzanine', 'bridge']);
const SLA_REPORTABLE = new Set<DisbursementTier>(['senior_a', 'senior_b']);

export function isReportable(tier: DisbursementTier): boolean {
  return SLA_REPORTABLE.has(tier);
}

export function crossesIntoRegulator(action: DisbursementAction, tier: DisbursementTier): boolean {
  if (action === 'demand_clawback') return CLAWBACK_REPORTABLE.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: DisbursementTier): boolean {
  return SLA_REPORTABLE.has(tier);
}
