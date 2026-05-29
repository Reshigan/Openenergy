// ═══════════════════════════════════════════════════════════════════════════
// Wave 81 — IPP Project Change-Order / Variation Control & Earned-Value
// Management (pure spec).
//
// The PROJECT-CONTROLS core of a best-in-class projects system. W1 gave the IPP
// the schedule (CPM / Gantt / resource-leveling); W19/W20 gave it the
// procurement and the construction-to-COD lifecycle. But none of them manage
// what every real capital project lives or dies by: the CHANGE. A site
// condition, a design change, a regulatory shift, or a client request lands a
// variation against the approved baseline — and the discipline of project
// controls is to quantify its cost / schedule / earned-value impact, draw it
// against the project contingency, gate its approval on an authority tiered by
// magnitude, and only then RE-BASELINE the plan. W81 is that missing layer.
//
// The DISTINCTIVE move (the "beat best-in-class" target — Primavera P6 EVM,
// Procore Change Management, MS Project baselines, Oracle Aconex): every change
// order is scored LIVE against the project's earned-value metrics (CV/SV/CPI/SPI/
// EAC/VAC/TCPI) and its contingency reserve, the approval authority is derived
// from the variation magnitude, and a variation that pushes the project past its
// REIPPPP BID ENVELOPE (cost-overrun % or COD-slip tolerance) crosses to the
// regulator (DMRE / IPPO) as a project-viability signal. Best-in-class systems
// treat change management as document-routing disconnected from EVM and from the
// bid commitment; W81 does not.
//
// Standards / framing:
//   - PMBOK Integrated Change Control + Earned Value Management (EVM) — the
//     CV/SV/CPI/SPI/EAC/VAC/TCPI battery.
//   - FIDIC variation clauses (Yellow/Silver Book) — the EPC variation order.
//   - REIPPPP bid commitment — a material cost overrun or COD slip beyond the
//     bid envelope is a viability concern reportable to DMRE / the IPP Office.
//
// Forward path:
//   draft → submitted → screening → impact_assessment → pending_approval
//     → approved → incorporated (success terminal — baseline re-issued)
//
// Branches:
//   screening → deferred (parked) → submitted (resubmit)
//   screening / impact_assessment / pending_approval / disputed → rejected
//   pending_approval → disputed (contractor disputes the assessed quantum)
//     → impact_assessment (resolve_dispute, re-assess)
//   any pre-approved non-terminal → withdrawn (raiser pulls it)
//   any pre-incorporated non-terminal → cancelled
//
// Tier — VARIATION MAGNITUDE, DERIVED from |cost_impact_zar| (NOT an explicit
// column — the magnitude IS the cost; contrast W80 where coverage tier is an
// explicit attribute):
//   minor < R1m | moderate R1m–R10m | major R10m–R50m | critical ≥ R50m.
//   HIGH = {major, critical}.
//
// INVERTED SLA — a LARGER variation gets MORE time at every state (same family
// as W19/W20/W43/W49/W56/W70): a critical R50m+ variation needs deeper impact
// assessment, EVM re-forecasting, and a higher approval authority, so it is
// allowed more time. Strictly INCREASING minor → critical at every graded state.
// Terminals 0.
//
// Reportability (regulator inbox crossings) — the W81 SIGNATURE is RE-BASELINE-
// driven:
//   - incorporate crosses for HIGH tiers (major / critical) — re-issuing the
//     baseline for a material variation is the notifiable act (bid-envelope move).
//   - approve crosses for critical only.
//   - reject  crosses for critical only (a rejected critical variation can signal
//     project distress / unrecoverable schedule risk).
//   - sla_breached crosses for HIGH tiers only.
//   isReportable(tier) = isHighTier(tier).
//
// Write model — SINGLE-PARTY {admin, ipp, ipp_developer, wind} (the project-owner
// side, same persona set as W20 COD). READ is platform-wide. Each event is tagged
// with the functional party that owns the action (project_manager /
// project_controls / sponsor) for audit attribution — NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type ChangeOrderStatus =
  | 'draft'
  | 'submitted'
  | 'screening'
  | 'impact_assessment'
  | 'pending_approval'
  | 'approved'
  | 'incorporated'
  | 'deferred'
  | 'disputed'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled';

export type ChangeOrderAction =
  | 'submit'
  | 'begin_screening'
  | 'assess_impact'
  | 'submit_for_approval'
  | 'approve'
  | 'incorporate'
  | 'defer'
  | 'resubmit'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'reject'
  | 'withdraw'
  | 'cancel';

// Variation magnitude — DERIVED from |cost_impact_zar|.
export type VariationTier =
  | 'minor'
  | 'moderate'
  | 'major'
  | 'critical';

// Functional party that owns each action (recorded as actor_party — functional
// attribution for audit, NOT a write-access split).
export type ChangeOrderParty =
  | 'project_manager'
  | 'project_controls'
  | 'sponsor';

interface TransitionRule {
  next: ChangeOrderStatus;
}

export const TRANSITIONS: Record<
  ChangeOrderStatus,
  Partial<Record<ChangeOrderAction, TransitionRule>>
> = {
  draft: {
    submit:   { next: 'submitted' },
    withdraw: { next: 'withdrawn' },
    cancel:   { next: 'cancelled' },
  },
  submitted: {
    begin_screening: { next: 'screening' },
    withdraw:        { next: 'withdrawn' },
    cancel:          { next: 'cancelled' },
  },
  screening: {
    assess_impact: { next: 'impact_assessment' },
    defer:         { next: 'deferred' },
    reject:        { next: 'rejected' },
    withdraw:      { next: 'withdrawn' },
    cancel:        { next: 'cancelled' },
  },
  impact_assessment: {
    submit_for_approval: { next: 'pending_approval' },
    reject:              { next: 'rejected' },
    withdraw:            { next: 'withdrawn' },
    cancel:              { next: 'cancelled' },
  },
  pending_approval: {
    approve:       { next: 'approved' },
    raise_dispute: { next: 'disputed' },
    reject:        { next: 'rejected' },
    withdraw:      { next: 'withdrawn' },
    cancel:        { next: 'cancelled' },
  },
  approved: {
    incorporate: { next: 'incorporated' },
    cancel:      { next: 'cancelled' },
  },
  deferred: {
    resubmit: { next: 'submitted' },
    reject:   { next: 'rejected' },
    cancel:   { next: 'cancelled' },
  },
  disputed: {
    resolve_dispute: { next: 'impact_assessment' },
    reject:          { next: 'rejected' },
    cancel:          { next: 'cancelled' },
  },
  incorporated: {},
  rejected:     {},
  withdrawn:    {},
  cancelled:    {},
};

const TERMINALS = new Set<ChangeOrderStatus>([
  'incorporated', 'rejected', 'withdrawn', 'cancelled',
]);

export function isTerminal(s: ChangeOrderStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: ChangeOrderStatus,
  action: ChangeOrderAction,
): ChangeOrderStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: ChangeOrderStatus): ChangeOrderAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as ChangeOrderAction[];
}

export function isCancellable(s: ChangeOrderStatus): boolean {
  return TRANSITIONS[s]?.cancel != null;
}

// ── Variation tier (DERIVED from |cost_impact_zar|) ──────────────────────────
const TIER_MINOR_CEIL    = 1_000_000;   // < R1m
const TIER_MODERATE_CEIL = 10_000_000;  // R1m – R10m
const TIER_MAJOR_CEIL    = 50_000_000;  // R10m – R50m  (≥ R50m → critical)

export function tierFromCostImpact(costImpactZar: number): VariationTier {
  const mag = Math.abs(costImpactZar || 0);
  if (mag >= TIER_MAJOR_CEIL)    return 'critical';
  if (mag >= TIER_MODERATE_CEIL) return 'major';
  if (mag >= TIER_MINOR_CEIL)    return 'moderate';
  return 'minor';
}

const VALID_TIERS = new Set<VariationTier>(['minor', 'moderate', 'major', 'critical']);
export function isTier(t: string): t is VariationTier {
  return VALID_TIERS.has(t as VariationTier);
}

const TIER_RANK: Record<VariationTier, number> = {
  minor: 0, moderate: 1, major: 2, critical: 3,
};
export function tierRank(tier: VariationTier): number {
  return TIER_RANK[tier];
}

const HIGH_TIERS = new Set<VariationTier>(['major', 'critical']);
export function isHighTier(tier: VariationTier): boolean {
  return HIGH_TIERS.has(tier);
}

// ── INVERTED SLA windows (minutes) — strictly INCREASING minor → critical ────
// The deadline to take the NEXT action out of each state. The larger the
// variation, the MORE time it is allowed (deeper assessment, higher authority).
// Terminals 0.
export const SLA_MINUTES: Record<ChangeOrderStatus, Record<VariationTier, number>> = {
  // draft → submit
  draft: {
    minor: 2880, moderate: 5760, major: 10080, critical: 20160,
  },
  // submitted → begin_screening
  submitted: {
    minor: 1440, moderate: 2880, major: 5760, critical: 10080,
  },
  // screening → assess_impact / defer / reject
  screening: {
    minor: 1440, moderate: 2880, major: 4320, critical: 7200,
  },
  // impact_assessment → submit_for_approval (deepest for critical)
  impact_assessment: {
    minor: 2880, moderate: 7200, major: 14400, critical: 28800,
  },
  // pending_approval → approve (board / DMRE takes longer for big ones)
  pending_approval: {
    minor: 2880, moderate: 5760, major: 10080, critical: 20160,
  },
  // approved → incorporate (re-baseline window)
  approved: {
    minor: 1440, moderate: 2880, major: 5760, critical: 10080,
  },
  // deferred → resubmit / reject (parked — long)
  deferred: {
    minor: 20160, moderate: 28800, major: 43200, critical: 86400,
  },
  // disputed → resolve_dispute / reject
  disputed: {
    minor: 4320, moderate: 7200, major: 14400, critical: 28800,
  },
  incorporated: { minor: 0, moderate: 0, major: 0, critical: 0 },
  rejected:     { minor: 0, moderate: 0, major: 0, critical: 0 },
  withdrawn:    { minor: 0, moderate: 0, major: 0, critical: 0 },
  cancelled:    { minor: 0, moderate: 0, major: 0, critical: 0 },
};

export function slaDeadlineFor(
  state: ChangeOrderStatus,
  tier: VariationTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// ── Approval authority (derived from variation magnitude) ────────────────────
export type ApprovalAuthority =
  | 'project_manager'
  | 'sponsor'
  | 'board'
  | 'dmre_notify';

export function approvalAuthorityFor(tier: VariationTier): ApprovalAuthority {
  switch (tier) {
    case 'minor':    return 'project_manager';
    case 'moderate': return 'sponsor';
    case 'major':    return 'board';
    case 'critical': return 'dmre_notify';
  }
}

// ── Earned-Value Management battery (the distinctive layer) ──────────────────
// All ZAR. EV = earned value, PV = planned value, AC = actual cost,
// BAC = budget at completion.

export function costVarianceZar(ev: number, ac: number): number {
  return ev - ac;
}

export function scheduleVarianceZar(ev: number, pv: number): number {
  return ev - pv;
}

// Cost Performance Index (EV / AC). 0 AC → 0 (undefined-safe).
export function cpi(ev: number, ac: number): number {
  if (ac <= 0) return 0;
  return ev / ac;
}

// Schedule Performance Index (EV / PV).
export function spi(ev: number, pv: number): number {
  if (pv <= 0) return 0;
  return ev / pv;
}

// Estimate At Completion = BAC / CPI. CPI 0 → BAC (no signal yet).
export function estimateAtCompletionZar(bac: number, ev: number, ac: number): number {
  const c = cpi(ev, ac);
  if (c <= 0) return bac;
  return Math.round(bac / c);
}

// Variance At Completion = BAC − EAC (negative = projected overrun).
export function varianceAtCompletionZar(bac: number, ev: number, ac: number): number {
  return bac - estimateAtCompletionZar(bac, ev, ac);
}

// To-Complete Performance Index = (BAC − EV) / (BAC − AC). The cost efficiency
// the remaining work must hit to land on budget. Denominator ≤ 0 → 0.
export function toCompletePerformanceIndex(bac: number, ev: number, ac: number): number {
  const denom = bac - ac;
  if (denom <= 0) return 0;
  return (bac - ev) / denom;
}

// ── Contingency reserve ──────────────────────────────────────────────────────
export function contingencyRemainingZar(contingencyZar: number, drawnZar: number): number {
  return Math.max(0, (contingencyZar || 0) - (drawnZar || 0));
}

// Can this variation's cost be absorbed by the remaining contingency?
export function isWithinContingency(
  costImpactZar: number,
  contingencyZar: number,
  drawnZar: number,
): boolean {
  if (costImpactZar <= 0) return true; // cost reduction / no draw
  return costImpactZar <= contingencyRemainingZar(contingencyZar, drawnZar);
}

// ── Re-baseline & bid-envelope ───────────────────────────────────────────────

// Revised baseline cost = baseline + cumulative approved variations + this one.
export function revisedBaselineCostZar(
  baselineCostZar: number,
  cumulativeApprovedZar: number,
  thisCostImpactZar: number,
): number {
  return (baselineCostZar || 0) + (cumulativeApprovedZar || 0) + (thisCostImpactZar || 0);
}

// Cumulative cost overrun as a percentage of the original baseline.
export function cumulativeOverrunPct(
  baselineCostZar: number,
  cumulativeApprovedZar: number,
  thisCostImpactZar: number,
): number {
  if (!baselineCostZar || baselineCostZar <= 0) return 0;
  return ((cumulativeApprovedZar + thisCostImpactZar) / baselineCostZar) * 100;
}

// Does incorporating this variation push the project past its REIPPPP bid
// envelope — either the cost-overrun tolerance OR the COD-slip tolerance?
export function breachesBidEnvelope(opts: {
  baselineCostZar: number;
  cumulativeApprovedZar: number;
  costImpactZar: number;
  bidEnvelopeCostPct: number;
  scheduleImpactDays: number;
  cumulativeApprovedDays: number;
  bidEnvelopeScheduleDays: number;
}): boolean {
  const overrun = cumulativeOverrunPct(
    opts.baselineCostZar, opts.cumulativeApprovedZar, opts.costImpactZar,
  );
  if (overrun > (opts.bidEnvelopeCostPct || 0)) return true;
  const slip = (opts.cumulativeApprovedDays || 0) + (opts.scheduleImpactDays || 0);
  if (slip > (opts.bidEnvelopeScheduleDays || 0)) return true;
  return false;
}

// ── Reportability (the W81 SIGNATURE is RE-BASELINE-driven) ──────────────────
//   incorporate → crosses for HIGH tiers (re-issuing the baseline for a material
//     variation — the notifiable bid-envelope move);
//   approve     → crosses for critical only;
//   reject      → crosses for critical only.
export function crossesIntoRegulator(action: ChangeOrderAction, tier: VariationTier): boolean {
  if (action === 'incorporate') return isHighTier(tier);
  if (action === 'approve')     return tier === 'critical';
  if (action === 'reject')      return tier === 'critical';
  return false;
}

// sla_breached crosses for HIGH tiers only.
export function slaBreachCrossesIntoRegulator(tier: VariationTier): boolean {
  return isHighTier(tier);
}

// A major / critical variation is bid-envelope-relevant: its baseline move
// matters to REIPPPP project viability.
export function isReportable(tier: VariationTier): boolean {
  return isHighTier(tier);
}

// Functional party that owns each action.
const ACTION_PARTY: Record<ChangeOrderAction, ChangeOrderParty> = {
  submit:              'project_manager',
  begin_screening:     'project_controls',
  assess_impact:       'project_controls',
  submit_for_approval: 'project_controls',
  approve:             'sponsor',
  incorporate:         'sponsor',
  defer:               'project_controls',
  resubmit:            'project_manager',
  raise_dispute:       'project_controls',
  resolve_dispute:     'project_controls',
  reject:              'sponsor',
  withdraw:            'project_manager',
  cancel:              'project_manager',
};

export function partyForAction(action: ChangeOrderAction): ChangeOrderParty {
  return ACTION_PARTY[action];
}
