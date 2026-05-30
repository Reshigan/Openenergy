// ═══════════════════════════════════════════════════════════════════════════
// Wave 92 — IPP Project Risk Register & Quantitative Schedule-Risk Analysis
// (Monte-Carlo) — pure spec.
//
// The PROJECT-RISK-MANAGEMENT core of a best-in-class projects system. W1 gave
// the IPP the schedule baseline (CPM / Gantt / resource-leveling); W19/W20 gave
// it procurement and construction-to-COD; W81 gave it change-control + EVM.
// What every real capital project relies on next — and what most platforms do
// badly — is QUANTIFYING risk: probability × impact, expected-monetary-value
// (EMV), Monte-Carlo cost / schedule risk analysis (SRA), and contingency
// drawdown traceability. W92 is that missing layer.
//
// The DISTINCTIVE move (the "beat best-in-class" target — Acumen Fuse Risk /
// Primavera Risk Analysis (PRA) / Safran Risk / Palisade @Risk / Crystal Ball /
// Deltek Acumen Risk / Riskonnect / Predict! / Synergi Life / Active Risk
// Manager): every risk record is scored LIVE against a P50/P80 EMV battery,
// the residual EMV after the planned response is tracked, the contingency
// drawdown is reconciled against project_reserve, and a risk REALIZATION on
// a force-majeure / regulatory-change / strategic class is treated as a
// notifiable event to the DMRE / IPP Office. Best-in-class platforms treat
// risk registers as static spreadsheets disconnected from EVM and from the
// REIPPPP bid envelope; W92 does not.
//
// Standards / framing:
//   - PMBOK 7 / ISO 31000 risk-management process (identify → analyze →
//     respond → monitor → close).
//   - PMI Practice Standard for Project Risk Management — qualitative P×I,
//     quantitative SRA (Monte-Carlo cost & schedule), EMV.
//   - AACE Recommended Practice 57R-09 (Integrated Cost & Schedule Risk
//     Analysis) — P50 / P80 forecasts off Monte-Carlo on schedule + cost.
//   - REIPPPP bid envelope — a risk that, IF REALIZED, would push the project
//     past the bid envelope (cost overrun % or COD slip tolerance) is a
//     viability concern reportable to DMRE / the IPP Office.
//
// Forward path (clean):
//   identified → assessed (qualitative P×I) → quantified (SRA / EMV)
//     → response_planned → response_active → monitoring → closed (terminal)
//
// Branches:
//   assessed / quantified → accepted (terminal — sponsor accepts as-is)
//   response_active / monitoring → realized (risk event has occurred)
//     → closed (incident closed) OR → escalated (material impact remains)
//   quantified / response_planned / response_active / monitoring / realized
//     → escalated (escalated to sponsor / PMO / regulator)
//     → quantified (re-analyze, loop back into SRA)
//   identified / assessed → withdrawn (raiser pulls it, no longer applicable)
//   any pre-closed non-terminal → cancelled
//
// Tier — EXPECTED-MONETARY-VALUE, RE-DERIVED on every transition from EMV =
// probability_pct × |worst_case_cost_impact_zar| / 100 (NOT a static column —
// the EMV IS the magnitude; contrast W80 explicit-col, similar to W81 derived):
//   low      EMV < R500k
//   moderate R500k – R5m
//   high     R5m  – R50m
//   critical EMV ≥ R50m
//   FLOOR-AT-HIGH when risk_class IN (force_majeure, regulatory_change,
//   strategic) — these classes cannot be lower than 'high' regardless of EMV
//   (the realization of a regulatory-change risk is reportable regardless of
//   quantum). HIGH = {high, critical}.
//
// INVERTED SLA — a LARGER EMV gets MORE time at every state (same family as
// W19/W20/W43/W49/W56/W70/W81/W82/W91): a critical risk needs deeper Monte-Carlo
// runs, sponsor-board review, and external advisor consultation, so it is
// allowed more time. Strictly INCREASING low → critical at every graded state.
// Terminals 0.
//
// Reportability (regulator inbox crossings) — the W92 SIGNATURE is REALIZATION-
// driven (the classic risk hard line — a realized force-majeure / regulatory-
// change risk on a generation facility is a DMRE notifiable event):
//   - realize_risk crosses regulator EVERY tier when risk_class IN
//     (force_majeure, regulatory_change) — the W92 SIGNATURE hard line
//     (sister of W45 write_off / W77 declare_breach / W68 declare_default /
//     W86 declare_acceleration / W89 cancel_campaign / W90 terminate_legacy).
//   - realize_risk on other classes crosses HIGH tiers (high / critical).
//   - escalate crosses HIGH tiers (high / critical) — bringing it to the PMO /
//     sponsor / regulator is itself the reportable signal.
//   - accept_risk crosses critical only — accepting a critical risk without
//     response is itself a reportable governance decision.
//   - close on critical (with realized=1) crosses regulator only — post-event
//     close-out report.
//   - sla_breached crosses HIGH tiers only.
//   isReportable(tier) = isHighTier(tier).
//
// Write model — SINGLE-PARTY {admin, ipp, ipp_developer, wind} (the project-
// owner side, same persona set as W20 COD / W81 change-order). READ is
// platform-wide. Each event is tagged with the functional party that owns the
// action (project_manager / risk_owner / project_controls / sponsor) for audit
// attribution — NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type ProjectRiskStatus =
  | 'identified'
  | 'assessed'
  | 'quantified'
  | 'response_planned'
  | 'response_active'
  | 'monitoring'
  | 'realized'
  | 'closed'
  | 'accepted'
  | 'escalated'
  | 'withdrawn'
  | 'cancelled';

export type ProjectRiskAction =
  | 'assess'
  | 'quantify'
  | 'plan_response'
  | 'execute_response'
  | 'begin_monitoring'
  | 'realize_risk'
  | 'close_risk'
  | 'accept_risk'
  | 'escalate'
  | 'reanalyze'
  | 'withdraw'
  | 'cancel';

// EMV tier — DERIVED from probability × impact.
export type ProjectRiskTier =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

// Functional party that owns each action (recorded as actor_party — functional
// attribution for audit, NOT a write-access split).
export type ProjectRiskParty =
  | 'project_manager'
  | 'risk_owner'
  | 'project_controls'
  | 'sponsor';

// Risk class — for floor-at-high rule + signature regulator crossing.
export type ProjectRiskClass =
  | 'cost_overrun'
  | 'schedule_slip'
  | 'resource_constraint'
  | 'design_change'
  | 'procurement_lead_time'
  | 'site_conditions'
  | 'subcontractor_default'
  | 'safety'
  | 'environmental'
  | 'force_majeure'
  | 'regulatory_change'
  | 'strategic'
  | 'financial_market'
  | 'technology';

interface TransitionRule {
  next: ProjectRiskStatus;
}

export const TRANSITIONS: Record<
  ProjectRiskStatus,
  Partial<Record<ProjectRiskAction, TransitionRule>>
> = {
  identified: {
    assess:   { next: 'assessed' },
    withdraw: { next: 'withdrawn' },
    cancel:   { next: 'cancelled' },
  },
  assessed: {
    quantify:    { next: 'quantified' },
    accept_risk: { next: 'accepted' },
    withdraw:    { next: 'withdrawn' },
    cancel:      { next: 'cancelled' },
  },
  quantified: {
    plan_response: { next: 'response_planned' },
    accept_risk:   { next: 'accepted' },
    escalate:      { next: 'escalated' },
    cancel:        { next: 'cancelled' },
  },
  response_planned: {
    execute_response: { next: 'response_active' },
    escalate:         { next: 'escalated' },
    cancel:           { next: 'cancelled' },
  },
  response_active: {
    begin_monitoring: { next: 'monitoring' },
    realize_risk:     { next: 'realized' },
    escalate:         { next: 'escalated' },
    cancel:           { next: 'cancelled' },
  },
  monitoring: {
    realize_risk: { next: 'realized' },
    close_risk:   { next: 'closed' },
    escalate:     { next: 'escalated' },
    cancel:       { next: 'cancelled' },
  },
  realized: {
    close_risk: { next: 'closed' },
    escalate:   { next: 'escalated' },
    cancel:     { next: 'cancelled' },
  },
  escalated: {
    reanalyze: { next: 'quantified' },
    cancel:    { next: 'cancelled' },
  },
  closed:    {},
  accepted:  {},
  withdrawn: {},
  cancelled: {},
};

const TERMINALS = new Set<ProjectRiskStatus>([
  'closed', 'accepted', 'withdrawn', 'cancelled',
]);

export function isTerminal(s: ProjectRiskStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: ProjectRiskStatus,
  action: ProjectRiskAction,
): ProjectRiskStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: ProjectRiskStatus): ProjectRiskAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as ProjectRiskAction[];
}

export function isCancellable(s: ProjectRiskStatus): boolean {
  return TRANSITIONS[s]?.cancel != null;
}

// ── Risk class + floor-at-high rule ──────────────────────────────────────────
const FLOOR_AT_HIGH_CLASSES = new Set<ProjectRiskClass>([
  'force_majeure', 'regulatory_change', 'strategic',
]);

export function isFloorAtHighClass(cls: ProjectRiskClass): boolean {
  return FLOOR_AT_HIGH_CLASSES.has(cls);
}

const SIGNATURE_CROSSING_CLASSES = new Set<ProjectRiskClass>([
  'force_majeure', 'regulatory_change',
]);

export function isSignatureCrossingClass(cls: ProjectRiskClass): boolean {
  return SIGNATURE_CROSSING_CLASSES.has(cls);
}

const VALID_CLASSES = new Set<ProjectRiskClass>([
  'cost_overrun', 'schedule_slip', 'resource_constraint', 'design_change',
  'procurement_lead_time', 'site_conditions', 'subcontractor_default',
  'safety', 'environmental', 'force_majeure', 'regulatory_change',
  'strategic', 'financial_market', 'technology',
]);

export function isRiskClass(c: string): c is ProjectRiskClass {
  return VALID_CLASSES.has(c as ProjectRiskClass);
}

// ── EMV tier (DERIVED from probability × |impact|), with class floor ─────────
const TIER_LOW_CEIL      = 500_000;     // < R500k
const TIER_MODERATE_CEIL = 5_000_000;   // R500k – R5m
const TIER_HIGH_CEIL     = 50_000_000;  // R5m   – R50m  (≥ R50m → critical)

// EMV = (probability_pct / 100) × |worst_case_cost_impact_zar|.
export function emvZar(probabilityPct: number, worstCaseCostImpactZar: number): number {
  const p = Math.max(0, Math.min(100, probabilityPct || 0));
  const i = Math.abs(worstCaseCostImpactZar || 0);
  return (p / 100) * i;
}

export function tierFromEmv(emv: number, riskClass: ProjectRiskClass): ProjectRiskTier {
  const baseTier: ProjectRiskTier =
    emv >= TIER_HIGH_CEIL     ? 'critical'
    : emv >= TIER_MODERATE_CEIL ? 'high'
    : emv >= TIER_LOW_CEIL      ? 'moderate'
    : 'low';
  // Floor-at-high rule for force_majeure / regulatory_change / strategic.
  if (isFloorAtHighClass(riskClass) && (baseTier === 'low' || baseTier === 'moderate')) {
    return 'high';
  }
  return baseTier;
}

const VALID_TIERS = new Set<ProjectRiskTier>(['low', 'moderate', 'high', 'critical']);
export function isTier(t: string): t is ProjectRiskTier {
  return VALID_TIERS.has(t as ProjectRiskTier);
}

const TIER_RANK: Record<ProjectRiskTier, number> = {
  low: 0, moderate: 1, high: 2, critical: 3,
};
export function tierRank(tier: ProjectRiskTier): number {
  return TIER_RANK[tier];
}

const HIGH_TIERS = new Set<ProjectRiskTier>(['high', 'critical']);
export function isHighTier(tier: ProjectRiskTier): boolean {
  return HIGH_TIERS.has(tier);
}

// ── INVERTED SLA windows (minutes) — strictly INCREASING low → critical ──────
// The deadline to take the NEXT action out of each state. The larger the EMV,
// the MORE time it is allowed (deeper Monte-Carlo, board review, external
// advisor). Terminals 0.
export const SLA_MINUTES: Record<ProjectRiskStatus, Record<ProjectRiskTier, number>> = {
  // identified → assess
  identified: {
    low: 1440, moderate: 2880, high: 5760, critical: 10080,
  },
  // assessed → quantify / accept_risk
  assessed: {
    low: 2880, moderate: 5760, high: 10080, critical: 20160,
  },
  // quantified → plan_response / accept_risk / escalate (deepest for critical)
  quantified: {
    low: 2880, moderate: 7200, high: 14400, critical: 28800,
  },
  // response_planned → execute_response (execution-prep window)
  response_planned: {
    low: 2880, moderate: 5760, high: 10080, critical: 20160,
  },
  // response_active → begin_monitoring / realize_risk / escalate
  response_active: {
    low: 4320, moderate: 7200, high: 14400, critical: 28800,
  },
  // monitoring → close_risk / realize_risk / escalate (long park)
  monitoring: {
    low: 20160, moderate: 28800, high: 43200, critical: 86400,
  },
  // realized → close_risk / escalate (urgent post-event)
  realized: {
    low: 720, moderate: 1440, high: 2880, critical: 5760,
  },
  // escalated → reanalyze (board / sponsor cycle)
  escalated: {
    low: 2880, moderate: 5760, high: 10080, critical: 20160,
  },
  closed:    { low: 0, moderate: 0, high: 0, critical: 0 },
  accepted:  { low: 0, moderate: 0, high: 0, critical: 0 },
  withdrawn: { low: 0, moderate: 0, high: 0, critical: 0 },
  cancelled: { low: 0, moderate: 0, high: 0, critical: 0 },
};

export function slaDeadlineFor(
  state: ProjectRiskStatus,
  tier: ProjectRiskTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// ── Reportability (regulator-inbox-crossing) ─────────────────────────────────
export function isReportable(tier: ProjectRiskTier): boolean {
  return isHighTier(tier);
}

// Per-action crossing — the W92 SIGNATURE: realize_risk on force_majeure /
// regulatory_change crosses EVERY tier (the IPP-PM signature hard line).
export function actionCrossesRegulator(
  action: ProjectRiskAction,
  tier: ProjectRiskTier,
  riskClass: ProjectRiskClass,
  realized: boolean,
): boolean {
  switch (action) {
    case 'realize_risk':
      // SIGNATURE: realized force-majeure / regulatory-change always crosses.
      if (isSignatureCrossingClass(riskClass)) return true;
      return isHighTier(tier);
    case 'escalate':
      return isHighTier(tier);
    case 'accept_risk':
      // Accepting a critical risk without response is a governance decision.
      return tier === 'critical';
    case 'close_risk':
      // Post-event close-out for realized critical risks.
      return tier === 'critical' && realized;
    default:
      return false;
  }
}

// ── Approval / governance authority (derived from EMV tier) ──────────────────
export type ProjectRiskAuthority =
  | 'project_manager'
  | 'risk_owner'
  | 'sponsor'
  | 'board'
  | 'dmre_notify';

export function authorityFor(tier: ProjectRiskTier): ProjectRiskAuthority {
  switch (tier) {
    case 'low':      return 'project_manager';
    case 'moderate': return 'risk_owner';
    case 'high':     return 'sponsor';
    case 'critical': return 'board';
  }
}

// ── Monte-Carlo / Schedule-Risk-Analysis battery (the distinctive layer) ─────
// All ZAR / days. Inputs are the per-risk PERT triangular params
// (optimistic / most-likely / pessimistic) plus a probability of occurrence.
// We expose closed-form approximations for the P50/P80 lognormal point on cost
// and schedule, plus expected residual after response.

// Triangular-distribution expected value: E = (a + m + b) / 3.
export function triangularMean(a: number, m: number, b: number): number {
  return (a + m + b) / 3;
}

// Triangular-distribution variance: Var = (a^2 + m^2 + b^2 - am - ab - mb) / 18.
export function triangularVariance(a: number, m: number, b: number): number {
  return (a * a + m * m + b * b - a * m - a * b - m * b) / 18;
}

// Closed-form lognormal approximation for P-percentile of a probability-weighted
// triangular impact. probabilityPct=100 means certain impact; <100 mixes in 0.
// Returns the P-th percentile cost ZAR.
export function pPercentileCostZar(
  optimisticZar: number,
  mostLikelyZar: number,
  pessimisticZar: number,
  probabilityPct: number,
  pPercentile: number, // e.g. 50, 80
): number {
  const a = Math.max(0, optimisticZar || 0);
  const m = Math.max(a, mostLikelyZar || a);
  const b = Math.max(m, pessimisticZar || m);
  const p = Math.max(0, Math.min(100, probabilityPct || 0)) / 100;
  if (p <= 0) return 0;

  const mean = triangularMean(a, m, b);
  const variance = triangularVariance(a, m, b);
  const stdev = Math.sqrt(Math.max(0, variance));

  // z-score for percentile (normal approx — adequate for closed-form SRA).
  const zMap: Record<number, number> = {
    50: 0, 80: 0.8416, 90: 1.2816, 95: 1.6449, 99: 2.3263,
  };
  const z = zMap[pPercentile] ?? 0;
  const pointEstimate = mean + z * stdev;
  // Probability-weight: certain-event = full point; weighted EMV otherwise.
  return p * pointEstimate;
}

// P50 cost — median outcome.
export function p50CostZar(
  optimistic: number, mostLikely: number, pessimistic: number, probabilityPct: number,
): number {
  return pPercentileCostZar(optimistic, mostLikely, pessimistic, probabilityPct, 50);
}

// P80 cost — typical contingency-funding percentile (AACE 57R-09).
export function p80CostZar(
  optimistic: number, mostLikely: number, pessimistic: number, probabilityPct: number,
): number {
  return pPercentileCostZar(optimistic, mostLikely, pessimistic, probabilityPct, 80);
}

// Schedule SRA — same triangular-lognormal approach for days slip.
export function p50ScheduleDays(
  optimisticDays: number, mostLikelyDays: number, pessimisticDays: number, probabilityPct: number,
): number {
  return pPercentileCostZar(optimisticDays, mostLikelyDays, pessimisticDays, probabilityPct, 50);
}

export function p80ScheduleDays(
  optimisticDays: number, mostLikelyDays: number, pessimisticDays: number, probabilityPct: number,
): number {
  return pPercentileCostZar(optimisticDays, mostLikelyDays, pessimisticDays, probabilityPct, 80);
}

// Residual EMV after planned response — response_effectiveness_pct is the
// percentage by which the response reduces the EMV (0-100).
export function residualEmvZar(
  baseEmv: number, responseEffectivenessPct: number,
): number {
  const eff = Math.max(0, Math.min(100, responseEffectivenessPct || 0));
  return baseEmv * (1 - eff / 100);
}

// Contingency drawdown coverage — what fraction of the project's contingency
// reserve is this risk's response consuming (0-1; >1 means contingency exceeded).
export function contingencyDrawdownRatio(
  drawnContingencyZar: number, totalContingencyZar: number,
): number {
  if (totalContingencyZar <= 0) return 0;
  return Math.max(0, drawnContingencyZar) / totalContingencyZar;
}

// Bid-envelope risk pct — does the worst-case impact, if realized, exceed the
// REIPPPP bid envelope (a configured bid_envelope_zar)? Returns 0 if no envelope
// configured, else (worst_case / envelope) * 100.
export function bidEnvelopeRiskPct(
  worstCaseImpactZar: number, bidEnvelopeZar: number,
): number {
  if (bidEnvelopeZar <= 0) return 0;
  return Math.max(0, worstCaseImpactZar) / bidEnvelopeZar * 100;
}

// Urgency band (rendering hint) keyed to SLA deadline distance + tier.
export type UrgencyBand =
  | 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';

export function urgencyBand(
  state: ProjectRiskStatus, slaDueAt: Date | null, now: Date,
): UrgencyBand {
  if (isTerminal(state)) return 'closed';
  if (!slaDueAt) return 'on_track';
  const msRemaining = slaDueAt.getTime() - now.getTime();
  if (msRemaining <= 0) return 'overdue';
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  if (hoursRemaining <= 24) return 'urgent';
  if (hoursRemaining <= 72) return 'due_soon';
  return 'on_track';
}

// ── Actor-party derivation from action ───────────────────────────────────────
const ACTION_PARTY: Record<ProjectRiskAction, ProjectRiskParty> = {
  assess:           'risk_owner',
  quantify:         'project_controls',
  plan_response:    'risk_owner',
  execute_response: 'project_manager',
  begin_monitoring: 'project_manager',
  realize_risk:     'project_manager',
  close_risk:       'project_controls',
  accept_risk:      'sponsor',
  escalate:         'sponsor',
  reanalyze:        'project_controls',
  withdraw:         'risk_owner',
  cancel:           'project_manager',
};

export function partyForAction(action: ProjectRiskAction): ProjectRiskParty {
  return ACTION_PARTY[action];
}

// ── Event-type / regulator-inbox reason-code derivation ──────────────────────
export function eventTypeFor(toStatus: ProjectRiskStatus): string {
  return `project_risk.${toStatus}`;
}

export function reasonCodeFor(
  action: ProjectRiskAction,
  riskClass: ProjectRiskClass,
  tier: ProjectRiskTier,
): string {
  switch (action) {
    case 'realize_risk':
      return isSignatureCrossingClass(riskClass)
        ? `realized_${riskClass}_${tier}`
        : `realized_${tier}`;
    case 'escalate':
      return `escalated_${tier}`;
    case 'accept_risk':
      return `accepted_${tier}`;
    case 'close_risk':
      return `closed_${tier}`;
    default:
      return `${action}_${tier}`;
  }
}
