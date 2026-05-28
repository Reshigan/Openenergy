// ─────────────────────────────────────────────────────────────────────────
// Wave 58 — Grid Connection Capacity Allocation & Queue Management chain (P6)
//
// NERSA Grid Code + the National Transmission Company SA (NTCSA) Interim Grid
// Capacity Allocation and Curtailment Rules (2024). Transmission and distribution
// headroom is the binding constraint on South Africa's energy transition: far
// more generation wants to connect than the network can host. Before a generator
// can sign a Grid Connection Agreement, it must SECURE an allocation of scarce
// grid capacity at a supply point. A developer applies for capacity at a chosen
// connection point; the network operator screens completeness, may request more
// information, runs a network/capacity assessment (load-flow, fault-level,
// stability, available headroom), assigns a QUEUE POSITION (priority date /
// ranking), then a capacity-allocation committee ISSUES AN OFFER, the applicant
// ACCEPTS (reserving the capacity pending milestones), and the operator finally
// ALLOCATES the capacity firmly — which feeds the W28 Grid Connection Agreement.
//
// This is the capacity-rights QUEUE that sits UPSTREAM of the grid lifecycle —
// the front-end gate to physical connection, the way W57 SSEG registration /
// W49 licensing are front-ends to the regulated market. It pairs with the grid
// operator's existing chains:
//   - [[project-wave28-gca-chain]] negotiates the Grid Connection Agreement for
//     capacity that W58 has ALLOCATED (W58 → W28 is the handoff)
//   - [[project-wave18-planned-outage-chain]] coordinates connected-plant outages
//   - [[project-wave34-load-curtailment-chain]] curtails when the network is stressed
//   - [[project-wave50-reserve-activation-chain]] activates ancillary reserves
//   - [[project-wave13-dispatch-nominations]] schedules dispatch of connected plant
//   - [[project-wave8-grid-wheeling]] bills transmission use-of-system
// Capacity allocation decides WHO may connect and in what ORDER; the GCA decides
// the technical-commercial terms of HOW they connect.
//
// Forward path (happy):
//   application_received → completeness_screening → capacity_assessment
//     → queue_positioned → offer_issued → capacity_reserved → capacity_allocated
//
// Information-gap loop:
//   completeness_screening → information_requested → completeness_screening
// Rejection (no headroom / fails network assessment / displaced in the queue):
//   capacity_assessment|queue_positioned → rejected
// Lapse (offer expires unaccepted / reservation milestones missed):
//   offer_issued|capacity_reserved → lapsed
// Relinquishment (applicant hands reserved capacity back to the pool before it
// is firmly allocated — returns headroom to the next applicant in the queue):
//   capacity_reserved → relinquished
// Early withdraw (applicant pulls out before reserving):
//   application_received|completeness_screening|information_requested
//     |capacity_assessment|queue_positioned|offer_issued → withdrawn
//
// Tiers (by requested capacity MW — drive SLA windows + reportability):
//   minor     — < 10 MW   (small embedded / distribution-level connection)
//   small     — < 50 MW   (medium distribution / sub-transmission)
//   medium    — < 100 MW  (large distribution / sub-transmission)
//   large     — < 250 MW  (transmission-level — deeper network study)
//   strategic — ≥ 250 MW  (bulk transmission — full system-impact study)
//
// SLA matrix is INVERTED — the bigger the requested connection, the MORE time
// every window allows (a 300 MW transmission connection needs a far deeper
// load-flow / fault-level / stability study than a 5 MW distribution tie-in).
// Same flavour as the INVERTED W57 registration / W49 licensing SLAs; the
// opposite of the URGENT load-curtailment / reserve-activation SLAs.
//
// Reportability (a grid-operator chain that surfaces its material capacity
// decisions onto the NERSA grid-access oversight queue — same mechanism the
// other grid chains use to report material events):
//   - reject_application crosses for EVERY tier (denying grid access is ALWAYS
//     material in a capacity-constrained grid — NERSA monitors grid-access
//     fairness and the interim allocation rules; this universal crossing is the
//     W58 signature, mirroring how W49's refuse / W57's refer are universal)
//   - relinquish crosses for the large + strategic tiers only (a major generator
//     handing back scarce reserved/allocated headroom is material to the queue)
//   - SLA breaches cross for the large + strategic tiers (material capacity)
//
// actor_party (applicant / network / committee) is derived from the ACTION, not
// the JWT role — same audit-attribution model as W50/W57. The write split is
// two-party: the applicant files / supplies info / accepts offers / relinquishes
// / withdraws; the network operator drives screening / assessment / queueing /
// lapse, and the allocation committee issues offers / allocates / rejects.
// isApplicantAction guards the applicant-write set server-side.
// ─────────────────────────────────────────────────────────────────────────

export type GridCapacityStatus =
  | 'application_received'
  | 'completeness_screening'
  | 'information_requested'
  | 'capacity_assessment'
  | 'queue_positioned'
  | 'offer_issued'
  | 'capacity_reserved'
  | 'capacity_allocated'
  | 'rejected'
  | 'lapsed'
  | 'relinquished'
  | 'withdrawn';

export type GridCapacityAction =
  | 'begin_screening'
  | 'request_info'
  | 'submit_info'
  | 'begin_assessment'
  | 'assign_queue_position'
  | 'issue_offer'
  | 'accept_offer'
  | 'allocate_capacity'
  | 'reject_application'
  | 'lapse'
  | 'relinquish'
  | 'withdraw';

export type GridCapacityTier = 'minor' | 'small' | 'medium' | 'large' | 'strategic';

export type GridCapacityEvent =
  | 'grid_capacity.completeness_screening'
  | 'grid_capacity.information_requested'
  | 'grid_capacity.capacity_assessment'
  | 'grid_capacity.queue_positioned'
  | 'grid_capacity.offer_issued'
  | 'grid_capacity.capacity_reserved'
  | 'grid_capacity.capacity_allocated'
  | 'grid_capacity.rejected'
  | 'grid_capacity.lapsed'
  | 'grid_capacity.relinquished'
  | 'grid_capacity.withdrawn'
  | 'grid_capacity.sla_breached';

const TERMINALS = new Set<GridCapacityStatus>([
  'capacity_allocated', 'rejected', 'lapsed', 'relinquished', 'withdrawn',
]);

export function isTerminal(s: GridCapacityStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<GridCapacityAction, { from: GridCapacityStatus[]; to: GridCapacityStatus }> = {
  begin_screening:       { from: ['application_received'],                              to: 'completeness_screening' },
  request_info:          { from: ['completeness_screening'],                            to: 'information_requested' },
  submit_info:           { from: ['information_requested'],                             to: 'completeness_screening' },
  begin_assessment:      { from: ['completeness_screening'],                            to: 'capacity_assessment' },
  assign_queue_position: { from: ['capacity_assessment'],                              to: 'queue_positioned' },
  issue_offer:           { from: ['queue_positioned'],                                 to: 'offer_issued' },
  accept_offer:          { from: ['offer_issued'],                                     to: 'capacity_reserved' },
  allocate_capacity:     { from: ['capacity_reserved'],                                to: 'capacity_allocated' },
  reject_application:    { from: ['capacity_assessment', 'queue_positioned'],          to: 'rejected' },
  lapse:                 { from: ['offer_issued', 'capacity_reserved'],                to: 'lapsed' },
  relinquish:            { from: ['capacity_reserved'],                                to: 'relinquished' },
  withdraw:              { from: ['application_received', 'completeness_screening', 'information_requested', 'capacity_assessment', 'queue_positioned', 'offer_issued'], to: 'withdrawn' },
};

export function nextStatus(current: GridCapacityStatus, action: GridCapacityAction): GridCapacityStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: GridCapacityStatus): GridCapacityAction[] {
  const acts: GridCapacityAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [GridCapacityAction, typeof TRANSITIONS[GridCapacityAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const WITHDRAWABLE = new Set<GridCapacityStatus>([
  'application_received', 'completeness_screening', 'information_requested',
  'capacity_assessment', 'queue_positioned', 'offer_issued',
]);

export function isWithdrawable(s: GridCapacityStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the bigger the requested connection, the MORE time every
// window allows (a transmission-level connection needs a far deeper network /
// system-impact study than a small distribution tie-in).
export const SLA_MINUTES: Record<GridCapacityStatus, Record<GridCapacityTier, number>> = {
  application_received: {
    minor:     2 * DAY,    // begin completeness screening
    small:     3 * DAY,
    medium:    5 * DAY,
    large:     7 * DAY,
    strategic:10 * DAY,
  },
  completeness_screening: {
    minor:     5 * DAY,    // screen / request info / proceed to assessment
    small:     7 * DAY,
    medium:   10 * DAY,
    large:    14 * DAY,
    strategic:21 * DAY,
  },
  information_requested: {
    minor:    14 * DAY,    // applicant response window (else lapse-via-reject)
    small:    21 * DAY,
    medium:   30 * DAY,
    large:    45 * DAY,
    strategic:60 * DAY,
  },
  capacity_assessment: {
    minor:    10 * DAY,    // network study: load-flow / fault-level / headroom
    small:    21 * DAY,
    medium:   30 * DAY,
    large:    45 * DAY,
    strategic:75 * DAY,
  },
  queue_positioned: {
    minor:     7 * DAY,    // hold in queue pending an offer
    small:    14 * DAY,
    medium:   21 * DAY,
    large:    30 * DAY,
    strategic:45 * DAY,
  },
  offer_issued: {
    minor:    14 * DAY,    // applicant acceptance window (else lapse)
    small:    21 * DAY,
    medium:   30 * DAY,
    large:    45 * DAY,
    strategic:60 * DAY,
  },
  capacity_reserved: {
    minor:    30 * DAY,    // reservation milestone window before firm allocation
    small:    45 * DAY,
    medium:   60 * DAY,
    large:    90 * DAY,
    strategic:120 * DAY,
  },
  capacity_allocated: { minor: 0, small: 0, medium: 0, large: 0, strategic: 0 },
  rejected:           { minor: 0, small: 0, medium: 0, large: 0, strategic: 0 },
  lapsed:             { minor: 0, small: 0, medium: 0, large: 0, strategic: 0 },
  relinquished:       { minor: 0, small: 0, medium: 0, large: 0, strategic: 0 },
  withdrawn:          { minor: 0, small: 0, medium: 0, large: 0, strategic: 0 },
};

export function slaDeadlineFor(status: GridCapacityStatus, tier: GridCapacityTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaWindowMinutes(status: GridCapacityStatus, tier: GridCapacityTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

// Capacity-based tier. MW thresholds: <10 minor / <50 small / <100 medium /
// <250 large / ≥250 strategic.
export function tierForCapacityMw(mw: number): GridCapacityTier {
  if (mw < 10) return 'minor';
  if (mw < 50) return 'small';
  if (mw < 100) return 'medium';
  if (mw < 250) return 'large';
  return 'strategic';
}

// Material tiers for NERSA grid-access oversight reportability + deeper study.
const LARGE_TIERS = new Set<GridCapacityTier>(['large', 'strategic']);

export function isLargeTier(tier: GridCapacityTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Transmission-level (large + strategic) connections require a full system-impact
// study at the capacity-assessment step; minor/small/medium follow a network
// headroom check at distribution / sub-transmission level.
export function mandatorySystemImpactStudy(tier: GridCapacityTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix:
//   - reject_application crosses for EVERY tier (denying grid access is always
//     material — universal, the W58 signature)
//   - relinquish crosses for the large + strategic tiers only
export function crossesIntoRegulator(action: GridCapacityAction, tier: GridCapacityTier): boolean {
  if (action === 'reject_application') return true;
  if (action === 'relinquish') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: GridCapacityTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party that each action represents (grid function), not the login role. The
// applicant files / supplies information / accepts offers / relinquishes /
// withdraws; the network operator screens completeness, requests info, assesses
// network capacity, assigns the queue position, and lapses stale offers /
// reservations; the capacity-allocation committee issues offers, allocates
// firmly, and rejects.
const ACTION_PARTY: Record<GridCapacityAction, 'applicant' | 'network' | 'committee'> = {
  begin_screening:       'network',
  request_info:          'network',
  submit_info:           'applicant',
  begin_assessment:      'network',
  assign_queue_position: 'network',
  issue_offer:           'committee',
  accept_offer:          'applicant',
  allocate_capacity:     'committee',
  reject_application:    'committee',
  lapse:                 'network',
  relinquish:            'applicant',
  withdraw:              'applicant',
};

export function partyForAction(action: GridCapacityAction): 'applicant' | 'network' | 'committee' {
  return ACTION_PARTY[action];
}

// Applicant-side write set (guarded server-side via the applicant-write split).
const APPLICANT_ACTIONS = new Set<GridCapacityAction>(['submit_info', 'accept_offer', 'relinquish', 'withdraw']);

export function isApplicantAction(action: GridCapacityAction): boolean {
  return APPLICANT_ACTIONS.has(action);
}
