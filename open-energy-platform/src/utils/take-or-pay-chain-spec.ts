// ─────────────────────────────────────────────────────────────────────────
// Wave 32 — Offtaker Take-or-Pay Annual Reconciliation chain (P6)
//
// 10-state lifecycle for every calendar-year roll-up of monthly delivery
// shortfalls against a PPA's contracted volume. Under the DMRE REIPPPP PPA
// template + standard utility PPAs, the offtaker is obligated to PAY for
// the contracted MWh even if the IPP didn't DELIVER them ("take-or-pay"),
// minus credits for force-majeure, scheduled outages, and curtailment
// instructions. Accounted for under IFRS 16 (PPA leases) + IFRS 15 (revenue
// recognition); reportable to NERSA via the annual TOP return.
//
// Forward path (the cure flow):
//   accrual_open → year_end → statement_issued → evidence_required →
//   evidence_submitted → quantum_proposed → quantum_agreed → settled
//
// Branch terminals:
//   disputed   — quantum dispute escalated to PPA arbitration (Section 34)
//   waived     — board exception (force-majeure, regulator-directed curtailment)
//
// Severity tiers (shortfall % of annual contracted MWh — drives INVERTED SLA):
//   catastrophic — >50% shortfall  (existential — PPA termination risk)
//   major        — 20-50% shortfall (material — regulator-reported)
//   moderate     — 5-20% shortfall  (routine TOP demand)
//   minor        — <5% shortfall    (de-minimis — handled in monthly true-up)
//
// SLA matrix is INVERTED — catastrophic gets the SHORTEST cure window
// (existential threat compresses every step); minor gets the longest
// (de-minimis treated as housekeeping). The Section 34 statutory window
// is anchored at major (90d quantum dispute window).
//
// Reportability (NERSA TOP annual return + Section 34 dispute filings):
//   - settled + disputed + waived cross for catastrophic + major
//   - sla_breached crosses for ALL tiers (annual return hard line)
//   - moderate/minor settled handled in routine annual roll-up
// ─────────────────────────────────────────────────────────────────────────

export type TopStatus =
  | 'accrual_open'
  | 'year_end'
  | 'statement_issued'
  | 'evidence_required'
  | 'evidence_submitted'
  | 'quantum_proposed'
  | 'quantum_agreed'
  | 'settled'
  | 'disputed'
  | 'waived';

export type TopAction =
  | 'close_year'
  | 'issue_statement'
  | 'request_evidence'
  | 'submit_evidence'
  | 'propose_quantum'
  | 'accept_quantum'
  | 'settle'
  | 'dispute'
  | 'waive';

export type TopTier = 'catastrophic' | 'major' | 'moderate' | 'minor';

export type TopEvent =
  | 'top.year_end'
  | 'top.statement_issued'
  | 'top.evidence_required'
  | 'top.evidence_submitted'
  | 'top.quantum_proposed'
  | 'top.quantum_agreed'
  | 'top.settled'
  | 'top.disputed'
  | 'top.waived'
  | 'top.sla_breached';

const TERMINALS = new Set<TopStatus>(['settled', 'disputed', 'waived']);

export function isTerminal(s: TopStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<TopAction, { from: TopStatus[]; to: TopStatus }> = {
  close_year:       { from: ['accrual_open'],                          to: 'year_end' },
  issue_statement:  { from: ['year_end'],                              to: 'statement_issued' },
  request_evidence: { from: ['statement_issued'],                      to: 'evidence_required' },
  submit_evidence:  { from: ['evidence_required'],                     to: 'evidence_submitted' },
  propose_quantum:  { from: ['evidence_submitted', 'statement_issued'], to: 'quantum_proposed' },
  accept_quantum:   { from: ['quantum_proposed'],                      to: 'quantum_agreed' },
  settle:           { from: ['quantum_agreed'],                        to: 'settled' },
  dispute: {
    from: ['quantum_proposed', 'quantum_agreed', 'evidence_submitted'],
    to: 'disputed',
  },
  waive: {
    from: ['year_end', 'statement_issued', 'evidence_required', 'evidence_submitted', 'quantum_proposed'],
    to: 'waived',
  },
};

export function nextStatus(current: TopStatus, action: TopAction): TopStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: TopStatus): TopAction[] {
  const acts: TopAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [TopAction, typeof TRANSITIONS[TopAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED tier SLAs — catastrophic compressed (PPA termination risk),
// minor extended (de-minimis housekeeping).
export const SLA_MINUTES: Record<TopStatus, Record<TopTier, number>> = {
  accrual_open: {
    // accrual_open lasts the full calendar year — SLA expressed as the
    // year-end close window once the period rolls (1 Jan)
    catastrophic: 14 * DAY,
    major:        21 * DAY,
    moderate:     30 * DAY,
    minor:        45 * DAY,
  },
  year_end: {
    catastrophic: 7 * DAY,
    major:        14 * DAY,
    moderate:     21 * DAY,
    minor:        30 * DAY,
  },
  statement_issued: {
    catastrophic: 14 * DAY,
    major:        30 * DAY,
    moderate:     45 * DAY,
    minor:        60 * DAY,
  },
  evidence_required: {
    catastrophic: 14 * DAY,
    major:        21 * DAY,
    moderate:     30 * DAY,
    minor:        45 * DAY,
  },
  evidence_submitted: {
    catastrophic: 14 * DAY,
    major:        30 * DAY,
    moderate:     45 * DAY,
    minor:        60 * DAY,
  },
  quantum_proposed: {
    // Section 34 90d statutory window anchors at major tier
    catastrophic: 30 * DAY,
    major:        90 * DAY,
    moderate:     120 * DAY,
    minor:        180 * DAY,
  },
  quantum_agreed: {
    catastrophic: 14 * DAY,
    major:        30 * DAY,
    moderate:     45 * DAY,
    minor:        60 * DAY,
  },
  settled:  { catastrophic: 0, major: 0, moderate: 0, minor: 0 },
  disputed: { catastrophic: 0, major: 0, moderate: 0, minor: 0 },
  waived:   { catastrophic: 0, major: 0, moderate: 0, minor: 0 },
};

export function slaDeadlineFor(status: TopStatus, tier: TopTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// NERSA TOP annual return + Section 34 dispute filing reportability.
// settled + disputed + waived cross for catastrophic + major;
// sla_breached crosses for ALL tiers (annual return hard line).
const TERMINAL_REPORTABLE = new Set<TopTier>(['catastrophic', 'major']);
const SLA_REPORTABLE = new Set<TopTier>(['catastrophic', 'major', 'moderate', 'minor']);

export function isReportable(tier: TopTier): boolean {
  return TERMINAL_REPORTABLE.has(tier);
}

export function crossesIntoRegulator(action: TopAction, tier: TopTier): boolean {
  if (action === 'settle' || action === 'dispute' || action === 'waive') {
    return TERMINAL_REPORTABLE.has(tier);
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: TopTier): boolean {
  return SLA_REPORTABLE.has(tier);
}

export function tierForShortfallPct(pct: number): TopTier {
  if (pct >= 50) return 'catastrophic';
  if (pct >= 20) return 'major';
  if (pct >= 5)  return 'moderate';
  return 'minor';
}
