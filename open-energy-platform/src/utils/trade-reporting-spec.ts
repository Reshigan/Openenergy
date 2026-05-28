// ─────────────────────────────────────────────────────────────────────────
// Wave 44 — Trader OTC Transaction / Trade-Repository Reporting & Reconciliation chain (P6)
//
// Financial Markets Act 19 of 2012 (FMA) + the FSCA OTC Derivatives Reporting
// regulations — South Africa's analogue of EMIR (EU) / Dodd-Frank (US) trade
// reporting. Every reportable transaction a trading desk executes must be
// reported to a licensed Trade Repository (TR) by a hard regulatory deadline
// (T+1), acknowledged by the TR, and then RECONCILED against the
// counterparty's dual-sided submission. This is the desk's post-trade
// regulatory-reporting obligation — distinct from the chains the Trader profile
// already runs:
//   - daily VaR / risk limits (Wave 2),
//   - market-maker quoting obligations ([[project-wave9-trader-mm]]),
//   - position-limit compliance ([[project-wave29-poslimit-chain]]),
//   - best-execution / RFQ quality ([[project-wave36-best-execution-chain]]).
// Position limits cap WHAT you may hold; best-ex governs HOW you fill; this
// governs whether the trade is correctly REPORTED to the supervisor afterward —
// the single most L5 surface for the desk (reconciliation against an external
// system, the L5-rubric bar).
//
//   report_due → report_generated → submitted_to_tr → tr_acknowledged
//     → reconciled → confirmed_complete
//
// Rejection branch (TR NACKs the submission):
//   submitted_to_tr → tr_rejected → corrected → submitted_to_tr (re-report loop)
// Reconciliation-break branch (dual-sided mismatch with the counterparty):
//   tr_acknowledged|reconciled → break_identified → break_resolved → reconciled
//   (or break_identified → corrected → submitted_to_tr if the break needs a
//    fresh submission)
// Exemption (intragroup / de-minimis — no report required):
//   report_due|report_generated → exempted
// Error cancellation (trade busted / errored — report withdrawn):
//   any active state → cancelled
//
// Classes (reportable product — drive recon SLA windows + reportability):
//   otc_derivative  — OTC power/carbon forward, swap, option; fully reportable,
//                     dual-sided reconciliation, TIGHTEST recon windows
//   physical_forward — physical-delivery forward; reportable, mid
//   spot_physical   — spot / block physical; lightest, often de-minimis
//
// SLA matrix is MIXED — the regulatory SUBMISSION windows (generate / submit /
// acknowledge / reject-correct) are UNIFORM hard deadlines (T+1 applies to every
// product equally — the EMIR-style hard line), while the RECONCILIATION + break
// windows are materiality-graded (an unreconciled break on a large OTC
// derivative book carries systemic risk, so otc_derivative is tightest). Same
// MIXED flavour as best-execution/tariff-indexation; contrast the URGENT
// compliance-inspection and the INVERTED tariff-determination SLAs.
//
// Reportability — this chain crosses to the FSCA (the reporting supervisor) via
// the same regulator-inbox mechanism. THEMATIC INVERSION: for a reporting chain
// the SLA BREACH itself is the regulatory violation (a late / missing
// transaction report is directly sanctionable under the FMA), so sla_breach
// crosses for EVERY class — the universal hard line. A TR rejection crosses for
// material classes (otc_derivative + physical_forward); a reconciliation break
// crosses for otc_derivative only (the systemic-risk product).
//
// actor_party (desk / reporting_ops / trade_repository) is derived from the
// ACTION, not the JWT role — the desk sources the trade, middle-office reporting
// ops drives the submission + reconciliation, and TR responses (ack / reject /
// break) are recorded as they arrive. Single-party write {admin, support,
// trader}: a transaction-reporting obligation is the firm's own — there is no
// counterparty login. partyForAction() is audit attribution only, not access
// control (same model as the trader best-execution chain + Waves 41/42).
// ─────────────────────────────────────────────────────────────────────────

export type TradeReportStatus =
  | 'report_due'
  | 'report_generated'
  | 'submitted_to_tr'
  | 'tr_acknowledged'
  | 'reconciled'
  | 'break_identified'
  | 'break_resolved'
  | 'confirmed_complete'
  | 'tr_rejected'
  | 'corrected'
  | 'exempted'
  | 'cancelled';

export type TradeReportAction =
  | 'generate_report'
  | 'submit'
  | 'acknowledge'
  | 'reconcile'
  | 'flag_break'
  | 'resolve_break'
  | 'correct'
  | 'confirm_complete'
  | 'reject'
  | 'exempt'
  | 'cancel';

export type TradeReportClass = 'otc_derivative' | 'physical_forward' | 'spot_physical';

export type TradeReportEvent =
  | 'trade_report.report_generated'
  | 'trade_report.submitted_to_tr'
  | 'trade_report.tr_acknowledged'
  | 'trade_report.reconciled'
  | 'trade_report.break_identified'
  | 'trade_report.break_resolved'
  | 'trade_report.confirmed_complete'
  | 'trade_report.tr_rejected'
  | 'trade_report.corrected'
  | 'trade_report.exempted'
  | 'trade_report.cancelled'
  | 'trade_report.sla_breached';

const TERMINALS = new Set<TradeReportStatus>(['confirmed_complete', 'exempted', 'cancelled']);

export function isTerminal(s: TradeReportStatus): boolean {
  return TERMINALS.has(s);
}

const ACTIVE_STATES: TradeReportStatus[] = [
  'report_due',
  'report_generated',
  'submitted_to_tr',
  'tr_acknowledged',
  'reconciled',
  'break_identified',
  'break_resolved',
  'tr_rejected',
  'corrected',
];

export const TRANSITIONS: Record<TradeReportAction, { from: TradeReportStatus[]; to: TradeReportStatus }> = {
  generate_report:  { from: ['report_due'],                              to: 'report_generated' },
  submit:           { from: ['report_generated', 'corrected'],          to: 'submitted_to_tr' },
  acknowledge:      { from: ['submitted_to_tr'],                         to: 'tr_acknowledged' },
  reject:           { from: ['submitted_to_tr'],                         to: 'tr_rejected' },
  reconcile:        { from: ['tr_acknowledged', 'break_resolved'],      to: 'reconciled' },
  flag_break:       { from: ['tr_acknowledged', 'reconciled'],          to: 'break_identified' },
  resolve_break:    { from: ['break_identified'],                       to: 'break_resolved' },
  correct:          { from: ['tr_rejected', 'break_identified'],        to: 'corrected' },
  confirm_complete: { from: ['reconciled'],                             to: 'confirmed_complete' },
  exempt:           { from: ['report_due', 'report_generated'],         to: 'exempted' },
  cancel:           { from: ACTIVE_STATES,                              to: 'cancelled' },
};

export function nextStatus(current: TradeReportStatus, action: TradeReportAction): TradeReportStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: TradeReportStatus): TradeReportAction[] {
  const acts: TradeReportAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [TradeReportAction, typeof TRANSITIONS[TradeReportAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;

// MIXED matrix — regulatory SUBMISSION windows are UNIFORM hard deadlines (the
// EMIR-style T+1 line applies to every product equally); RECONCILIATION + break
// windows are materiality-graded (otc_derivative tightest — systemic risk).
export const SLA_MINUTES: Record<TradeReportStatus, Record<TradeReportClass, number>> = {
  report_due: {            // generate the report — uniform T+0.5
    otc_derivative: 12 * HOUR,
    physical_forward: 12 * HOUR,
    spot_physical: 12 * HOUR,
  },
  report_generated: {      // submit to the TR — uniform T+1 hard regulatory deadline
    otc_derivative: 24 * HOUR,
    physical_forward: 24 * HOUR,
    spot_physical: 24 * HOUR,
  },
  submitted_to_tr: {       // TR acknowledgement window — uniform
    otc_derivative: 4 * HOUR,
    physical_forward: 4 * HOUR,
    spot_physical: 4 * HOUR,
  },
  tr_acknowledged: {       // reconcile against the counterparty — GRADED
    otc_derivative: 24 * HOUR,
    physical_forward: 48 * HOUR,
    spot_physical: 72 * HOUR,
  },
  reconciled: {            // confirm complete — GRADED
    otc_derivative: 12 * HOUR,
    physical_forward: 24 * HOUR,
    spot_physical: 48 * HOUR,
  },
  break_identified: {      // resolve a reconciliation break — GRADED (OTC urgent)
    otc_derivative: 8 * HOUR,
    physical_forward: 24 * HOUR,
    spot_physical: 48 * HOUR,
  },
  break_resolved: {        // re-reconcile — GRADED
    otc_derivative: 12 * HOUR,
    physical_forward: 24 * HOUR,
    spot_physical: 48 * HOUR,
  },
  tr_rejected: {           // correct + re-report — uniform hard deadline
    otc_derivative: 24 * HOUR,
    physical_forward: 24 * HOUR,
    spot_physical: 24 * HOUR,
  },
  corrected: {             // re-submit the correction — uniform
    otc_derivative: 12 * HOUR,
    physical_forward: 12 * HOUR,
    spot_physical: 12 * HOUR,
  },
  confirmed_complete: { otc_derivative: 0, physical_forward: 0, spot_physical: 0 },
  exempted:           { otc_derivative: 0, physical_forward: 0, spot_physical: 0 },
  cancelled:          { otc_derivative: 0, physical_forward: 0, spot_physical: 0 },
};

export function slaDeadlineFor(status: TradeReportStatus, klass: TradeReportClass, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[klass];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Material classes whose TR rejections + SLA breaches reach the FSCA supervisor
// queue. spot_physical is administrative (de-minimis self-correction).
const REPORTABLE_CLASSES = new Set<TradeReportClass>(['otc_derivative', 'physical_forward']);

export function isReportableClass(klass: TradeReportClass): boolean {
  return REPORTABLE_CLASSES.has(klass);
}

// Reportability matrix:
//   - flag_break crosses for otc_derivative only (the systemic-risk product —
//     an unreconciled OTC derivative is the EMIR-style supervisory concern)
//   - reject crosses for material classes (otc_derivative + physical_forward)
export function crossesIntoRegulator(action: TradeReportAction, klass: TradeReportClass): boolean {
  if (action === 'flag_break') return klass === 'otc_derivative';
  if (action === 'reject') return REPORTABLE_CLASSES.has(klass);
  return false;
}

// THEMATIC INVERSION — for a reporting chain the SLA breach IS the violation:
// a late / missing transaction report is directly sanctionable under the FMA,
// so a breach crosses to the supervisor for EVERY class (the universal hard
// line — cf. forced-liquidation in the position-limit chain).
export function slaBreachCrossesIntoRegulator(_klass: TradeReportClass): boolean {
  return true;
}

// Party each action represents (post-trade reporting function), not the login
// role. The desk sources / exempts / busts the trade; middle-office reporting
// ops drives submission + reconciliation + corrections; the Trade Repository
// acknowledges / rejects / flags breaks.
const ACTION_PARTY: Record<TradeReportAction, 'desk' | 'reporting_ops' | 'trade_repository'> = {
  generate_report:  'reporting_ops',
  submit:           'reporting_ops',
  acknowledge:      'trade_repository',
  reject:           'trade_repository',
  reconcile:        'reporting_ops',
  flag_break:       'trade_repository',
  resolve_break:    'reporting_ops',
  correct:          'reporting_ops',
  confirm_complete: 'reporting_ops',
  exempt:           'desk',
  cancel:           'desk',
};

export function partyForAction(action: TradeReportAction): 'desk' | 'reporting_ops' | 'trade_repository' {
  return ACTION_PARTY[action];
}
