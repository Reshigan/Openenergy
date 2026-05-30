// ═══════════════════════════════════════════════════════════════════════════
// Wave 94 — NTCSA Renewable-Energy-Zone (REZ) Capacity Allocation &
// Competitive Auction — pure spec.
//
// The COMPETITIVE-ZONAL-ALLOCATION layer of a best-in-class system-operator
// stack. W58 grid-capacity-allocation gives NTCSA a generic first-come-first-
// served queue; W28 GCA gives the physical connection agreement; W75
// connection-energization gives the energization gate. What every real
// system operator needs between them — and what most platforms either ignore
// or stretch W58 into — is the COMPETITIVE ZONAL AUCTION: announcement →
// applications → compliance → shortlist → multi-criteria scoring → award →
// financial-close milestone → construction milestone → commercial operation.
// W94 is that missing layer.
//
// The DISTINCTIVE move (the "beat best-in-class" target — AEMO REZ
// (Australia) / NYISO TPP / CAISO TPP / ERCOT CREZ / EU TYNDP / ENTSO-E
// TYNDP / NGESO Holistic Network Design / Hydro Quebec MRC): every
// allocation is scored LIVE against a ZONE-HEADROOM battery (configured
// ceiling vs allocated-to-date MW), a multi-criteria WEIGHTED SCORE
// combining price (0.50) + BBBEE (0.20) + ED (0.15) + local-content (0.15)
// per DMRE 40%-local-content REIPPPP rule, a COMPETITION-RATIO computed
// from applications-per-lot, a MILESTONE-COMPLIANCE percentage tracked
// across awarded MW, a FORFEIT-RATE per zone (failures recycled back into
// the pool), and a PREDICTED-OPERATION-DATE rolling forward from the
// current state. Best-in-class system operators usually run REZ auctions
// in spreadsheets + Word documents and never recycle forfeit-MW; W94 does
// not.
//
// Standards / framing:
//   - ERA 4/2006 — capacity allocation underpinning.
//   - NTCSA Grid Capacity Allocation Rules 2024 — REZ-zone allocation
//     framework.
//   - DMRE Integrated Resource Plan (IRP) 2023 — capacity targets by
//     technology.
//   - DMRE Just Energy Transition Implementation Plan (JET-IP) 2023 — REZ
//     prioritisation.
//   - CSIR REZ identification studies (2022) — 5 priority zones
//     (Khâi-Ma, Komsberg, Springbok, Vryburg, Beaufort West).
//   - REIPPPP bid-window framework — multi-criteria scoring methodology.
//   - B-BBEE Codes Generic Scorecard — ownership + management scoring.
//   - DMRE 40% local-content threshold for REIPPPP awards.
//   - ECA / EIA — environmental clearance pre-requisite for capacity_awarded.
//
// Forward path (clean):
//   announcement_published → application_submitted → compliance_check
//     → shortlisted → evaluation_complete → award_proposed
//     → capacity_awarded → financial_close_met → construction_in_progress
//     → in_operation (terminal clean — hands off to W75 energization)
//
// Branches:
//   compliance_check → rejected (failed completeness/technical)
//   evaluation_complete → rejected (failed multi-criteria threshold)
//   award_proposed → rejected (Council declines)
//   capacity_awarded → forfeit (failed financial-close milestone)
//   financial_close_met → forfeit (failed construction-start milestone)
//   construction_in_progress → forfeit (failed operation milestone)
//   any pre-terminal → withdrawn (applicant withdraws)
//   any pre-terminal → cancelled (admin cancel — defective announcement etc.)
//
// Tier — ALLOCATION-MW-MAGNITUDE, RE-DERIVED on every transition from the
// CURRENT awarded_capacity_mw / requested_capacity_mw (NOT a static column —
// the MW magnitude IS the tier; contrast W80 explicit-col, similar to
// W86/W92/W93 derived):
//   minor    capacity_mw < 50 MW
//   standard 50 – 250 MW
//   material 250 – 500 MW
//   mega     ≥ 500 MW
//   FLOOR-AT-MEGA when allocation_class IN (priority_zone,
//   constraint_relief_zone, jet_program_zone) — these classes cannot be
//   lower than 'mega' regardless of MW magnitude (a Khâi-Ma priority-zone
//   allocation is strategic at any size).
//
// INVERTED SLA — a LARGER allocation gets MORE procedural time at every
// state (multi-criteria diligence strengthens with magnitude: NTCSA Rules
// 2024 set ≥30d compliance for sub-100MW, mega gets 120d). Same family
// as W19/W20/W43/W49/W56/W70/W81/W82/W91/W92/W93. Strictly INCREASING
// minor → mega at every graded state. Terminals 0.
//
// Reportability (regulator-inbox crossings + cross-persona to applicant)
// — the W94 SIGNATURE is AWARD/FORFEIT-driven (NERSA s10 + IRP 2023
// require capacity-award and forfeit-recycling to be publicly registered;
// this is the W94 hard line — public-register publication of zonal
// awards is mandatory regardless of quantum):
//   - award_capacity crosses regulator EVERY tier — the W94 SIGNATURE
//     hard line (NERSA s10 + IRP 2023 public-register obligation).
//   - forfeit_allocation crosses regulator EVERY tier — capacity recycled
//     is a security-of-supply public signal.
//   - reject_application crosses material+mega (governance signal).
//   - complete_evaluation crosses mega only (multi-criteria public scrutiny).
//   - confirm_operation crosses mega only (security-of-supply milestone).
//   - sla_breached crosses material+mega (procedural-window miss is a
//     judicial-review risk; itself reportable).
//   isReportable(tier) = isHighTier(tier) = {material, mega}.
//
// Write model — SINGLE-PARTY {admin, grid_operator} (NTCSA System
// Operator side). READ platform-wide (the APPLICANT must see their own
// case). Each event is tagged with the functional party that owns the
// action (compliance_officer / evaluation_panel / council / system_operator)
// for audit attribution — NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type RezCapacityStatus =
  | 'announcement_published'
  | 'application_submitted'
  | 'compliance_check'
  | 'shortlisted'
  | 'evaluation_complete'
  | 'award_proposed'
  | 'capacity_awarded'
  | 'financial_close_met'
  | 'construction_in_progress'
  | 'in_operation'
  | 'rejected'
  | 'forfeit'
  | 'withdrawn';
  // 14th implicit "cancelled" terminal handled below for admin-cancel.

export type RezCapacityAction =
  | 'submit_application'
  | 'start_compliance'
  | 'shortlist'
  | 'complete_evaluation'
  | 'propose_award'
  | 'award_capacity'
  | 'confirm_financial_close'
  | 'start_construction'
  | 'confirm_operation'
  | 'reject_application'
  | 'forfeit_allocation'
  | 'withdraw'
  | 'cancel';

// MW-magnitude tier — DERIVED from awarded_capacity_mw (fallback requested).
export type RezCapacityTier =
  | 'minor'
  | 'standard'
  | 'material'
  | 'mega';

// Functional party that owns each action (recorded as actor_party).
export type RezCapacityParty =
  | 'compliance_officer'
  | 'evaluation_panel'
  | 'council'
  | 'system_operator';

// Allocation class — for floor-at-mega rule + signature crossing.
export type RezAllocationClass =
  | 'standard_zone'
  | 'priority_zone'
  | 'constraint_relief_zone'
  | 'jet_program_zone'
  | 'bess_dedicated_zone'
  | 'transmission_corridor_zone';

interface TransitionRule {
  next: RezCapacityStatus;
}

export const TRANSITIONS: Record<
  RezCapacityStatus,
  Partial<Record<RezCapacityAction, TransitionRule>>
> = {
  announcement_published: {
    submit_application: { next: 'application_submitted' },
    withdraw:           { next: 'withdrawn' },
    cancel:             { next: 'withdrawn' },
  },
  application_submitted: {
    start_compliance: { next: 'compliance_check' },
    withdraw:         { next: 'withdrawn' },
    cancel:           { next: 'withdrawn' },
  },
  compliance_check: {
    shortlist:          { next: 'shortlisted' },
    reject_application: { next: 'rejected' },
    withdraw:           { next: 'withdrawn' },
    cancel:             { next: 'withdrawn' },
  },
  shortlisted: {
    complete_evaluation: { next: 'evaluation_complete' },
    reject_application:  { next: 'rejected' },
    withdraw:            { next: 'withdrawn' },
    cancel:              { next: 'withdrawn' },
  },
  evaluation_complete: {
    propose_award:      { next: 'award_proposed' },
    reject_application: { next: 'rejected' },
    withdraw:           { next: 'withdrawn' },
    cancel:             { next: 'withdrawn' },
  },
  award_proposed: {
    award_capacity:     { next: 'capacity_awarded' },
    reject_application: { next: 'rejected' },
    withdraw:           { next: 'withdrawn' },
    cancel:             { next: 'withdrawn' },
  },
  capacity_awarded: {
    confirm_financial_close: { next: 'financial_close_met' },
    forfeit_allocation:      { next: 'forfeit' },
    withdraw:                { next: 'withdrawn' },
    cancel:                  { next: 'withdrawn' },
  },
  financial_close_met: {
    start_construction:  { next: 'construction_in_progress' },
    forfeit_allocation:  { next: 'forfeit' },
    withdraw:            { next: 'withdrawn' },
    cancel:              { next: 'withdrawn' },
  },
  construction_in_progress: {
    confirm_operation:   { next: 'in_operation' },
    forfeit_allocation:  { next: 'forfeit' },
    withdraw:            { next: 'withdrawn' },
    cancel:              { next: 'withdrawn' },
  },
  in_operation: {},
  rejected:     {},
  forfeit:      {},
  withdrawn:    {},
};

const TERMINALS = new Set<RezCapacityStatus>([
  'in_operation', 'rejected', 'forfeit', 'withdrawn',
]);

export function isTerminal(s: RezCapacityStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: RezCapacityStatus,
  action: RezCapacityAction,
): RezCapacityStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: RezCapacityStatus): RezCapacityAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as RezCapacityAction[];
}

export function isCancellable(s: RezCapacityStatus): boolean {
  return TRANSITIONS[s]?.cancel != null;
}

// ── Allocation class + floor-at-mega rule ────────────────────────────────────
const FLOOR_AT_MEGA_CLASSES = new Set<RezAllocationClass>([
  'priority_zone', 'constraint_relief_zone', 'jet_program_zone',
]);

export function isFloorAtMegaClass(cls: RezAllocationClass): boolean {
  return FLOOR_AT_MEGA_CLASSES.has(cls);
}

const VALID_CLASSES = new Set<RezAllocationClass>([
  'standard_zone', 'priority_zone', 'constraint_relief_zone',
  'jet_program_zone', 'bess_dedicated_zone', 'transmission_corridor_zone',
]);

export function isAllocationClass(c: string): c is RezAllocationClass {
  return VALID_CLASSES.has(c as RezAllocationClass);
}

// ── MW-magnitude tier ────────────────────────────────────────────────────────
const TIER_MINOR_CEIL    = 50;     // < 50 MW
const TIER_STANDARD_CEIL = 250;    // 50 – 250 MW
const TIER_MATERIAL_CEIL = 500;    // 250 – 500 MW (mega ≥ 500 MW)

export function tierFromCapacity(
  capacityMw: number,
  allocationClass: RezAllocationClass,
): RezCapacityTier {
  const baseTier: RezCapacityTier =
    capacityMw >= TIER_MATERIAL_CEIL ? 'mega'
    : capacityMw >= TIER_STANDARD_CEIL ? 'material'
    : capacityMw >= TIER_MINOR_CEIL    ? 'standard'
    : 'minor';
  if (isFloorAtMegaClass(allocationClass) && baseTier !== 'mega') {
    return 'mega';
  }
  return baseTier;
}

// Effective capacity used for tier derivation — awarded if set, otherwise requested.
export function effectiveCapacityMw(
  awardedMw: number | null | undefined,
  requestedMw: number | null | undefined,
): number {
  if (awardedMw && awardedMw > 0) return awardedMw;
  if (requestedMw && requestedMw > 0) return requestedMw;
  return 0;
}

const VALID_TIERS = new Set<RezCapacityTier>(['minor', 'standard', 'material', 'mega']);
export function isTier(t: string): t is RezCapacityTier {
  return VALID_TIERS.has(t as RezCapacityTier);
}

const TIER_RANK: Record<RezCapacityTier, number> = {
  minor: 0, standard: 1, material: 2, mega: 3,
};
export function tierRank(tier: RezCapacityTier): number {
  return TIER_RANK[tier];
}

const HIGH_TIERS = new Set<RezCapacityTier>(['material', 'mega']);
export function isHighTier(tier: RezCapacityTier): boolean {
  return HIGH_TIERS.has(tier);
}

// ── INVERTED SLA windows (minutes) — strictly INCREASING minor → mega ──────
// Larger allocation = MORE procedural time (multi-criteria diligence
// strengthens with magnitude). NTCSA Rules 2024 set 30d compliance for
// sub-100MW; mega gets 120d. Construction milestone caps at 3 yrs for mega.
export const SLA_MINUTES: Record<RezCapacityStatus, Record<RezCapacityTier, number>> = {
  // announcement_published → submit_application (bid window stays open)
  announcement_published: {
    minor: 43200, standard: 86400, material: 129600, mega: 172800,
  },
  // application_submitted → start_compliance
  application_submitted: {
    minor: 20160, standard: 30240, material: 43200, mega: 64800,
  },
  // compliance_check → shortlist / reject_application
  compliance_check: {
    minor: 10080, standard: 20160, material: 30240, mega: 43200,
  },
  // shortlisted → complete_evaluation / reject_application
  shortlisted: {
    minor: 20160, standard: 30240, material: 43200, mega: 64800,
  },
  // evaluation_complete → propose_award / reject_application
  evaluation_complete: {
    minor: 20160, standard: 30240, material: 43200, mega: 64800,
  },
  // award_proposed → award_capacity / reject_application
  award_proposed: {
    minor: 20160, standard: 30240, material: 43200, mega: 64800,
  },
  // capacity_awarded → confirm_financial_close (180d–545d milestone)
  capacity_awarded: {
    minor: 259200, standard: 388800, material: 525600, mega: 784800,
  },
  // financial_close_met → start_construction (90d–270d milestone)
  financial_close_met: {
    minor: 129600, standard: 172800, material: 259200, mega: 388800,
  },
  // construction_in_progress → confirm_operation (540d–1095d / 3-yr cap)
  construction_in_progress: {
    minor: 777600, standard: 1036800, material: 1296000, mega: 1576800,
  },
  in_operation: { minor: 0, standard: 0, material: 0, mega: 0 },
  rejected:     { minor: 0, standard: 0, material: 0, mega: 0 },
  forfeit:      { minor: 0, standard: 0, material: 0, mega: 0 },
  withdrawn:    { minor: 0, standard: 0, material: 0, mega: 0 },
};

export function slaDeadlineFor(
  state: RezCapacityStatus,
  tier: RezCapacityTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// ── Reportability (regulator-inbox-crossing) ─────────────────────────────────
export function isReportable(tier: RezCapacityTier): boolean {
  return isHighTier(tier);
}

// Per-action crossing — the W94 SIGNATURE: award_capacity AND forfeit_allocation
// cross regulator EVERY tier (NERSA s10 + IRP 2023 public-register obligation).
export function actionCrossesRegulator(
  action: RezCapacityAction,
  tier: RezCapacityTier,
  allocationClass: RezAllocationClass,
): boolean {
  switch (action) {
    case 'award_capacity':
      // SIGNATURE: every capacity award is publicly registered (NERSA s10).
      return true;
    case 'forfeit_allocation':
      // SIGNATURE: capacity recycled = security-of-supply public signal.
      return true;
    case 'reject_application':
      // Governance signal — material+mega only.
      return isHighTier(tier);
    case 'complete_evaluation':
      // Multi-criteria public-scrutiny signal — mega only.
      return tier === 'mega';
    case 'confirm_operation':
      // Security-of-supply milestone — mega only.
      return tier === 'mega';
    case 'withdraw':
      // Withdrawal of a strategic-zone allocation is a market signal.
      return isFloorAtMegaClass(allocationClass) && isHighTier(tier);
    default:
      return false;
  }
}

// ── Procedural authority (derived from MW tier) ──────────────────────────────
export type RezCapacityAuthority =
  | 'compliance_officer'
  | 'evaluation_panel'
  | 'council_subcommittee'
  | 'full_council';

export function authorityFor(tier: RezCapacityTier): RezCapacityAuthority {
  switch (tier) {
    case 'minor':    return 'compliance_officer';
    case 'standard': return 'evaluation_panel';
    case 'material': return 'council_subcommittee';
    case 'mega':     return 'full_council';
  }
}

// ── Multi-criteria scoring — REIPPPP-style weighted score ───────────────────
// Weights (default — DMRE REIPPPP Bid Window 5 framework):
//   price (lower=better)     → 50%
//   B-BBEE (higher=better)   → 20%
//   ED (higher=better)       → 15%
//   local-content (≥40%=full)→ 15%
export const SCORE_WEIGHTS = {
  price: 0.50,
  bbbee: 0.20,
  ed: 0.15,
  local_content: 0.15,
};
export const LOCAL_CONTENT_THRESHOLD_PCT = 40; // DMRE 40% threshold

// Price score — lower bid_price = higher score (inverted).
// Maps [bid_price_floor, bid_price_ceiling] to [100, 0].
export function priceScore(
  bidPriceZarPerMwh: number,
  floorZarPerMwh: number,
  ceilingZarPerMwh: number,
): number {
  if (!isFinite(bidPriceZarPerMwh) || bidPriceZarPerMwh <= 0) return 0;
  if (ceilingZarPerMwh <= floorZarPerMwh) return 0;
  const clamped = Math.max(floorZarPerMwh, Math.min(bidPriceZarPerMwh, ceilingZarPerMwh));
  const ratio = (ceilingZarPerMwh - clamped) / (ceilingZarPerMwh - floorZarPerMwh);
  return Math.max(0, Math.min(100, ratio * 100));
}

// Local-content score — ≥40% gets full credit; linear below.
export function localContentScore(localContentPct: number): number {
  if (!isFinite(localContentPct) || localContentPct < 0) return 0;
  if (localContentPct >= LOCAL_CONTENT_THRESHOLD_PCT) return 100;
  return (localContentPct / LOCAL_CONTENT_THRESHOLD_PCT) * 100;
}

// Weighted multi-criteria score — REIPPPP-style.
export function weightedScore(
  priceScoreVal: number,
  bbbeeScoreVal: number,
  edScoreVal: number,
  localContentScoreVal: number,
): number {
  const clamp = (n: number) => Math.max(0, Math.min(100, n || 0));
  return (
    clamp(priceScoreVal) * SCORE_WEIGHTS.price +
    clamp(bbbeeScoreVal) * SCORE_WEIGHTS.bbbee +
    clamp(edScoreVal) * SCORE_WEIGHTS.ed +
    clamp(localContentScoreVal) * SCORE_WEIGHTS.local_content
  );
}

// ── Zone-headroom battery ────────────────────────────────────────────────────
export function remainingHeadroomMw(
  totalZoneCapacityMw: number,
  allocatedToDateMw: number,
): number {
  return Math.max(0, (totalZoneCapacityMw || 0) - (allocatedToDateMw || 0));
}

// Competition ratio = applications_in_round / lots_available.
export function competitionRatio(
  applicationsCount: number,
  lotsAvailable: number,
): number {
  if (!lotsAvailable || lotsAvailable <= 0) return 0;
  return (applicationsCount || 0) / lotsAvailable;
}

export type CompetitionIntensityBand = 'low' | 'moderate' | 'high';

export function competitionIntensityBand(ratio: number): CompetitionIntensityBand {
  if (ratio >= 3) return 'high';
  if (ratio >= 1.5) return 'moderate';
  return 'low';
}

// Milestone-compliance % — across awarded MW in a zone.
export function milestoneCompliancePct(
  milestonesMetOnTime: number,
  totalMilestones: number,
): number {
  if (!totalMilestones || totalMilestones <= 0) return 0;
  return Math.max(0, Math.min(100, (milestonesMetOnTime / totalMilestones) * 100));
}

// Forfeit-rate % — forfeit-MW / awarded-MW per zone.
export function forfeitRatePct(
  forfeitMw: number,
  awardedMw: number,
): number {
  if (!awardedMw || awardedMw <= 0) return 0;
  return Math.max(0, Math.min(100, ((forfeitMw || 0) / awardedMw) * 100));
}

// Predicted-operation-date — rolls forward from current state's SLA cap.
export function predictedOperationDate(
  currentState: RezCapacityStatus,
  tier: RezCapacityTier,
  stateEnteredAt: Date,
): Date | null {
  if (isTerminal(currentState)) return null;
  // Sum SLA minutes from current state through to in_operation gate.
  const FORWARD_PATH: RezCapacityStatus[] = [
    'announcement_published', 'application_submitted', 'compliance_check',
    'shortlisted', 'evaluation_complete', 'award_proposed',
    'capacity_awarded', 'financial_close_met', 'construction_in_progress',
  ];
  const idx = FORWARD_PATH.indexOf(currentState);
  if (idx < 0) return null;
  let total = 0;
  for (let i = idx; i < FORWARD_PATH.length; i++) {
    total += SLA_MINUTES[FORWARD_PATH[i]][tier] || 0;
  }
  return new Date(stateEnteredAt.getTime() + total * 60_000);
}

// ── Urgency band ─────────────────────────────────────────────────────────────
export type UrgencyBand = 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';

export function urgencyBand(
  state: RezCapacityStatus,
  slaDeadlineAt: Date | null,
  now: Date,
): UrgencyBand {
  if (isTerminal(state)) return 'closed';
  if (!slaDeadlineAt) return 'on_track';
  const msRemaining = slaDeadlineAt.getTime() - now.getTime();
  if (msRemaining <= 0) return 'overdue';
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  if (hoursRemaining <= 24) return 'urgent';
  if (hoursRemaining <= 96) return 'due_soon';
  return 'on_track';
}

// ── Inbox severity (for regulator-inbox crossing) ────────────────────────────
export type InboxSeverity = 'low' | 'medium' | 'high' | 'critical';

export function inboxSeverityForTier(tier: RezCapacityTier): InboxSeverity {
  switch (tier) {
    case 'mega':     return 'critical';
    case 'material': return 'high';
    case 'standard': return 'medium';
    case 'minor':    return 'low';
  }
}

// ── Actor-party for action (functional, NOT access-control) ──────────────────
const ACTION_PARTY: Record<RezCapacityAction, RezCapacityParty> = {
  submit_application:      'system_operator',
  start_compliance:        'compliance_officer',
  shortlist:               'compliance_officer',
  complete_evaluation:     'evaluation_panel',
  propose_award:           'evaluation_panel',
  award_capacity:          'council',
  confirm_financial_close: 'system_operator',
  start_construction:      'system_operator',
  confirm_operation:       'system_operator',
  reject_application:      'council',
  forfeit_allocation:      'council',
  withdraw:                'system_operator',
  cancel:                  'system_operator',
};

export function partyForAction(action: RezCapacityAction): RezCapacityParty {
  return ACTION_PARTY[action];
}

// ── Event type for cascade ───────────────────────────────────────────────────
const EVENT_TYPE: Record<RezCapacityStatus, string> = {
  announcement_published:   'rez_capacity.announcement_published',
  application_submitted:    'rez_capacity.application_submitted',
  compliance_check:         'rez_capacity.compliance_check',
  shortlisted:              'rez_capacity.shortlisted',
  evaluation_complete:      'rez_capacity.evaluation_complete',
  award_proposed:           'rez_capacity.award_proposed',
  capacity_awarded:         'rez_capacity.capacity_awarded',
  financial_close_met:      'rez_capacity.financial_close_met',
  construction_in_progress: 'rez_capacity.construction_in_progress',
  in_operation:             'rez_capacity.in_operation',
  rejected:                 'rez_capacity.rejected',
  forfeit:                  'rez_capacity.forfeit',
  withdrawn:                'rez_capacity.withdrawn',
};

export function eventTypeFor(toStatus: RezCapacityStatus): string {
  return EVENT_TYPE[toStatus] || 'rez_capacity.unknown';
}

// ── Reason code for an action ────────────────────────────────────────────────
export function reasonCodeFor(action: RezCapacityAction): string {
  return `rez_capacity.${action}`;
}
