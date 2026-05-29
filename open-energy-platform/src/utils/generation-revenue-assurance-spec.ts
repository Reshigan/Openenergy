// ─────────────────────────────────────────────────────────────────────────
// Wave 79 — Esums Generation Revenue Assurance & Meter Reconciliation
//
// Every MWh a plant generates is supposed to turn into cash. Between the
// inverter and the bank account sit four numbers that should agree but rarely
// do: the EXPECTED generation (what the plant should have produced, from the
// W71 prognostics / W24 PR model), the REVENUE METER (the SAPP/NRS-revenue-grade
// meter reading), the SETTLEMENT statement (what the DSO / market operator
// actually settled) and the PPA INVOICE (what the offtaker was billed). Where
// they diverge, money leaks — a drifting meter, a comms gap back-filled with an
// under-estimate, a settlement error, un-credited curtailment compensation,
// mis-accounted inverter clipping, or outright meter tampering.
//
// Best-in-class O&M suites (Power Factors, AlsoEnergy, also utility
// revenue-assurance tooling) reconcile the meter against the settlement
// REACTIVELY and stop at a flagged variance. W79 beats them by (1) using the
// EXPECTED-generation model as the recon baseline — so leakage is caught even
// when the meter "agrees with itself" — (2) auto-classifying the leakage
// signature, and (3) closing the loop to an SLA-driven recovery action with a
// NERSA-visible settlement-dispute branch and a quantified recovered-ZAR ledger.
//
// 12-state P6 lifecycle (8 operative + 4 terminal):
//   period_open → data_ingested → reconciled → variance_flagged
//     → investigating → classified → recovery_pending → recovered     (recovery path)
//   clean:        reconciled → closed_clean                            (within tolerance)
//   dispute:      recovery_pending → in_dispute
//                   → recovered (resolve_dispute_recovered)
//                   | written_off (resolve_dispute_writeoff)
//   write-off:    {classified, recovery_pending} → written_off         (unrecoverable)
//   cancel:       {period_open … classified} → cancelled               (recon opened in error / superseded)
//
// Tiers (5) by the absolute revenue variance in ZAR:
//   minor <50k / moderate <250k / material <1m / major <5m / critical >=5m
//
// SLA matrix is URGENT — a larger revenue variance is chased HARDER: the windows
// strictly DECREASE minor→critical for every graded state (the inverse of an
// inverted-quantum chain). Leaking real money fast is the whole point. Terminals
// carry no deadline.
//
// Reportability (the W79 signature):
//   - raise_dispute crosses the regulator for EVERY tier — escalating a
//     settlement / metering dispute to the DSO / market operator is a NERSA
//     metering-code matter and is always reportable (the hard line).
//   - classify_leakage crosses for EVERY tier when the category is
//     meter_tampering — tamper / fraud is always reportable regardless of size.
//   - write-offs (write_off, resolve_dispute_writeoff) cross for the material+
//     tiers — accepting unrecoverable revenue above materiality is auditable.
//   - SLA breaches cross for major + critical only.
//
// Single-party write {admin, support}: the Esums revenue-assurance desk operates
// the chain. actor_party (analyst / counterparty / reviewer) records the function
// per step for audit texture, not the JWT role.
// ─────────────────────────────────────────────────────────────────────────

export type RevenueAssuranceStatus =
  | 'period_open'
  | 'data_ingested'
  | 'reconciled'
  | 'variance_flagged'
  | 'investigating'
  | 'classified'
  | 'recovery_pending'
  | 'in_dispute'
  | 'recovered'
  | 'closed_clean'
  | 'written_off'
  | 'cancelled';

export type RevenueAssuranceAction =
  | 'ingest_data'
  | 'run_reconciliation'
  | 'close_clean'
  | 'flag_variance'
  | 'open_investigation'
  | 'classify_leakage'
  | 'issue_recovery_claim'
  | 'confirm_recovery'
  | 'raise_dispute'
  | 'resolve_dispute_recovered'
  | 'resolve_dispute_writeoff'
  | 'write_off'
  | 'cancel_reconciliation';

export type RevenueAssuranceTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

// The leakage signature a reconciliation surfaces. meter_tampering is the
// fraud / tamper category and is always regulator-visible.
export type LeakageCategory =
  | 'meter_drift'
  | 'comms_gap'
  | 'settlement_error'
  | 'curtailment_shortfall'
  | 'clipping_loss'
  | 'meter_tampering';

// The mechanism a recovery produces.
export type RecoveryMethod =
  | 'meter_recalibration'
  | 'settlement_resubmission'
  | 'dso_credit_note'
  | 'ppa_true_up'
  | 'none';

export type RevenueAssuranceParty = 'analyst' | 'counterparty' | 'reviewer';

export type RevenueAssuranceEvent =
  | 'generation_revenue_assurance.data_ingested'
  | 'generation_revenue_assurance.reconciled'
  | 'generation_revenue_assurance.variance_flagged'
  | 'generation_revenue_assurance.investigating'
  | 'generation_revenue_assurance.classified'
  | 'generation_revenue_assurance.recovery_pending'
  | 'generation_revenue_assurance.in_dispute'
  | 'generation_revenue_assurance.recovered'
  | 'generation_revenue_assurance.closed_clean'
  | 'generation_revenue_assurance.written_off'
  | 'generation_revenue_assurance.cancelled'
  | 'generation_revenue_assurance.sla_breached';

const TERMINALS = new Set<RevenueAssuranceStatus>([
  'recovered', 'closed_clean', 'written_off', 'cancelled',
]);

export function isTerminal(s: RevenueAssuranceStatus): boolean {
  return TERMINALS.has(s);
}

// cancel is available while the recon is still being worked up — before a
// recovery claim is issued. Once a claim is out (recovery_pending) or a dispute
// is live (in_dispute) the matter is resolved, not cancelled.
const CANCEL_FROM = new Set<RevenueAssuranceStatus>([
  'period_open', 'data_ingested', 'reconciled', 'variance_flagged',
  'investigating', 'classified',
]);

export function isCancellable(s: RevenueAssuranceStatus): boolean {
  return CANCEL_FROM.has(s);
}

export const TRANSITIONS: Record<RevenueAssuranceAction, { from: RevenueAssuranceStatus[]; to: RevenueAssuranceStatus }> = {
  ingest_data:               { from: ['period_open'],                        to: 'data_ingested' },
  run_reconciliation:        { from: ['data_ingested'],                      to: 'reconciled' },
  close_clean:               { from: ['reconciled'],                         to: 'closed_clean' },
  flag_variance:             { from: ['reconciled'],                         to: 'variance_flagged' },
  open_investigation:        { from: ['variance_flagged'],                   to: 'investigating' },
  classify_leakage:          { from: ['investigating'],                      to: 'classified' },
  issue_recovery_claim:      { from: ['classified'],                         to: 'recovery_pending' },
  confirm_recovery:          { from: ['recovery_pending'],                   to: 'recovered' },
  raise_dispute:             { from: ['recovery_pending'],                   to: 'in_dispute' },
  resolve_dispute_recovered: { from: ['in_dispute'],                         to: 'recovered' },
  resolve_dispute_writeoff:  { from: ['in_dispute'],                         to: 'written_off' },
  write_off:                 { from: ['classified', 'recovery_pending'],     to: 'written_off' },
  cancel_reconciliation:     { from: [...CANCEL_FROM],                       to: 'cancelled' },
};

export function nextStatus(current: RevenueAssuranceStatus, action: RevenueAssuranceAction): RevenueAssuranceStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RevenueAssuranceStatus): RevenueAssuranceAction[] {
  const acts: RevenueAssuranceAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RevenueAssuranceAction, typeof TRANSITIONS[RevenueAssuranceAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — a bigger revenue variance is chased HARDER. Windows strictly
// DECREASE minor→critical for every graded state. Terminals 0.
export const SLA_MINUTES: Record<RevenueAssuranceStatus, Record<RevenueAssuranceTier, number>> = {
  period_open: {
    minor: 5 * DAY, moderate: 4 * DAY, material: 3 * DAY, major: 2 * DAY, critical: 1 * DAY,
  },
  data_ingested: {
    minor: 3 * DAY, moderate: 2 * DAY, material: 1 * DAY, major: 12 * HOUR, critical: 6 * HOUR,
  },
  reconciled: {
    minor: 3 * DAY, moderate: 2 * DAY, material: 1 * DAY, major: 12 * HOUR, critical: 6 * HOUR,
  },
  variance_flagged: {
    minor: 5 * DAY, moderate: 4 * DAY, material: 3 * DAY, major: 2 * DAY, critical: 1 * DAY,
  },
  investigating: {
    minor: 7 * DAY, moderate: 5 * DAY, material: 4 * DAY, major: 3 * DAY, critical: 2 * DAY,
  },
  classified: {
    minor: 7 * DAY, moderate: 5 * DAY, material: 4 * DAY, major: 3 * DAY, critical: 2 * DAY,
  },
  recovery_pending: {
    minor: 14 * DAY, moderate: 10 * DAY, material: 7 * DAY, major: 5 * DAY, critical: 3 * DAY,
  },
  in_dispute: {
    minor: 30 * DAY, moderate: 21 * DAY, material: 14 * DAY, major: 10 * DAY, critical: 7 * DAY,
  },
  recovered:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  closed_clean: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  written_off:  { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  cancelled:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: RevenueAssuranceStatus, tier: RevenueAssuranceTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: RevenueAssuranceStatus, tier: RevenueAssuranceTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// 5 tiers by the absolute revenue variance in ZAR.
export function tierForVarianceZar(varianceZar: number): RevenueAssuranceTier {
  const v = Math.abs(varianceZar);
  if (v < 50000) return 'minor';
  if (v < 250000) return 'moderate';
  if (v < 1000000) return 'material';
  if (v < 5000000) return 'major';
  return 'critical';
}

const LARGE_TIERS = new Set<RevenueAssuranceTier>(['major', 'critical']);
const MATERIAL_PLUS = new Set<RevenueAssuranceTier>(['material', 'major', 'critical']);

export function isLargeTier(tier: RevenueAssuranceTier): boolean {
  return LARGE_TIERS.has(tier);
}

export function isTampering(category: LeakageCategory): boolean {
  return category === 'meter_tampering';
}

// Reportability matrix (the W79 signature):
//   - raise_dispute crosses for EVERY tier (settlement / metering dispute = hard line).
//   - classify_leakage crosses for EVERY tier when category is meter_tampering.
//   - write-offs cross for the material+ tiers.
export function crossesIntoRegulator(
  action: RevenueAssuranceAction,
  tier: RevenueAssuranceTier,
  category: LeakageCategory | null,
): boolean {
  if (action === 'raise_dispute') return true;
  if (action === 'classify_leakage') return category === 'meter_tampering';
  if (action === 'write_off' || action === 'resolve_dispute_writeoff') {
    return MATERIAL_PLUS.has(tier);
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RevenueAssuranceTier): boolean {
  return LARGE_TIERS.has(tier);
}

// A case NERSA tracks: any tamper finding, or a material+ revenue variance.
export function isReportable(tier: RevenueAssuranceTier, category: LeakageCategory | null): boolean {
  if (category === 'meter_tampering') return true;
  return MATERIAL_PLUS.has(tier);
}

// Party each action represents (revenue-assurance function), not the login role.
// The ANALYST ingests, reconciles, investigates, classifies and prosecutes the
// recovery; the COUNTERPARTY (DSO / market operator / offtaker) credits or
// contests it; a REVIEWER signs off clean closes, write-offs and dispute
// resolutions.
const ACTION_PARTY: Record<RevenueAssuranceAction, RevenueAssuranceParty> = {
  ingest_data:               'analyst',
  run_reconciliation:        'analyst',
  close_clean:               'reviewer',
  flag_variance:             'analyst',
  open_investigation:        'analyst',
  classify_leakage:          'analyst',
  issue_recovery_claim:      'analyst',
  confirm_recovery:          'counterparty',
  raise_dispute:             'analyst',
  resolve_dispute_recovered: 'reviewer',
  resolve_dispute_writeoff:  'reviewer',
  write_off:                 'reviewer',
  cancel_reconciliation:     'reviewer',
};

export function partyForAction(action: RevenueAssuranceAction): RevenueAssuranceParty {
  return ACTION_PARTY[action];
}
