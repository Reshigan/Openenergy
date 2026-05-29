// ═══════════════════════════════════════════════════════════════════════════
// Wave 72 — OEM-Support Spare-Parts Provisioning & Replenishment chain
// (pure spec).
//
// The SERVICE-PARTS-PLANNING brain of the OEM-Support profile: the chain that
// puts the right spare in the right warehouse BEFORE the asset needs it, then
// runs the requisition → purchase → receive → stock → issue lifecycle for a
// single provisioning line. It is the materials backbone underneath every other
// support chain — a work order (W16) consumes a part, an RMA (W15) returns one,
// a warranty-recovery (W63) chases the cost of one — but NONE of those plan or
// replenish inventory. W72 is that missing layer.
//
// The DISTINCTIVE move (and the "beat best-in-class" target): demand is
// PREDICTIVE. The W71 predictive-asset-health engine produces remaining-useful-
// life (RUL) and ranked failure modes per asset; a provisioning line can be
// raised PRE-FAILURE off that signal (demand_source = 'predictive_rul') so the
// part is pre-positioned before the breakdown — beating the reactive
// reorder-point planning of Syncron / Baxter Planning / SAP SPP / Servigistics,
// which mostly forecast off historical consumption. Criticality-tiered fill-rate
// SLAs with auto-expedite on backorder, a reverse-logistics incoming-QA gate
// (received → inspect → stock OR reject), and a quantified stockout-avoidance /
// working-capital ledger complete the differentiation.
//
// Standards / contractual framing:
//   - SANS / IEC 62402 obsolescence management + service-parts criticality
//     (VED — vital / essential / desirable — classification).
//   - OEM service-level / spares-availability contract (guaranteed fill rate and
//     lead time per criticality band).
//   - NERSA Grid Code / security-of-supply: a backorder on a VITAL part for
//     grid-connected generation is a reliability / security-of-supply concern,
//     reportable when the stockout impact is catastrophic or a vital part on a
//     high-impact line cannot be sourced.
//
// Forward path:
//   demand_identified → requisition_raised → requisition_approved → po_issued →
//     in_transit → received → stocked → reserved → issued
//
// Backorder loop: po_issued → backordered (supplier cannot ship within lead
//   time); expedite_backorder → in_transit (alternate source / air-freight) or
//   the line is cancelled.
// QA gate: received → stocked (pass_inspection) OR received → returned
//   (reject_inspection — incoming-QA failure, reverse logistics, TERMINAL).
// Cancel: any pre-receipt planning/ordering state → cancelled.
//
// Tiers — by stockout impact rand (stockout_impact_zar = downtime cost rate ×
//   expected outage hours waiting for the part), with a VITAL-part floor:
//   routine      < 50k
//   standard     < 250k
//   important    < 1m
//   critical     < 5m
//   catastrophic >= 5m
// HIGH = {critical, catastrophic}. vitalFloor → at least 'critical' when the
//   part is VITAL (a vital part can never be planned below critical urgency).
//
// URGENT SLA — a more critical line gets a TIGHTER provisioning window at every
//   active state (same family as W64/W67/W68/W69/W71). The higher the stockout
//   impact, the faster the desk must move the line forward. Terminals 0.
//
// Reportability (regulator inbox crossings) — the W72 SIGNATURE is AVAILABILITY-
// RISK-driven (a stockout that threatens security of supply), distinct from
// W63's defect-class crossing and W71's safety crossing:
//   - flag_backorder crosses when (vital part AND HIGH tier) OR catastrophic —
//     a backorder on a vital high-impact line, or any catastrophic stockout, is
//     a notifiable security-of-supply event.
//   - cancel_provisioning crosses when (vital part AND HIGH tier) — abandoning a
//     vital high-impact provisioning line is notifiable.
//   - sla_breached crosses for HIGH tiers only.
//   isReportable(tier, vital) = catastrophic OR (vital AND HIGH).
//
// Write model — SINGLE-PARTY {admin, support} (same as W41/W47/W55/W63). READ
// all nine personas (the fleet provisioning register is platform-wide). Each
// event is tagged with the functional party that owns the action (planner /
// buyer / warehouse / supplier) for audit attribution — NOT an access-control
// split.
// ═══════════════════════════════════════════════════════════════════════════

export type ProvisioningStatus =
  | 'demand_identified'
  | 'requisition_raised'
  | 'requisition_approved'
  | 'po_issued'
  | 'backordered'
  | 'in_transit'
  | 'received'
  | 'stocked'
  | 'reserved'
  | 'issued'
  | 'returned'
  | 'cancelled';

export type ProvisioningAction =
  | 'raise_requisition'
  | 'approve_requisition'
  | 'issue_po'
  | 'flag_backorder'
  | 'expedite_backorder'
  | 'confirm_shipment'
  | 'receive_goods'
  | 'pass_inspection'
  | 'reject_inspection'
  | 'reserve_stock'
  | 'issue_part'
  | 'cancel_provisioning';

export type ProvisioningTier =
  | 'routine'
  | 'standard'
  | 'important'
  | 'critical'
  | 'catastrophic';

// VED service-parts criticality classification.
export type Criticality =
  | 'vital'
  | 'essential'
  | 'desirable';

// Where the provisioning demand originated. predictive_rul is the W71-fed,
// best-in-class-beating pre-failure signal.
export type DemandSource =
  | 'predictive_rul'
  | 'work_order'
  | 'reorder_point'
  | 'manual'
  | 'rma_replacement';

// Functional party that owns each action (recorded as actor_party — functional
// attribution for audit, NOT a write-access split).
export type ProvisioningParty =
  | 'planner'
  | 'buyer'
  | 'warehouse'
  | 'supplier';

interface TransitionRule {
  next: ProvisioningStatus;
}

export const TRANSITIONS: Record<
  ProvisioningStatus,
  Partial<Record<ProvisioningAction, TransitionRule>>
> = {
  demand_identified: {
    raise_requisition:   { next: 'requisition_raised' },
    cancel_provisioning: { next: 'cancelled' },
  },
  requisition_raised: {
    approve_requisition: { next: 'requisition_approved' },
    cancel_provisioning: { next: 'cancelled' },
  },
  requisition_approved: {
    issue_po:            { next: 'po_issued' },
    cancel_provisioning: { next: 'cancelled' },
  },
  po_issued: {
    confirm_shipment:    { next: 'in_transit' },
    flag_backorder:      { next: 'backordered' },
    cancel_provisioning: { next: 'cancelled' },
  },
  backordered: {
    expedite_backorder:  { next: 'in_transit' },
    cancel_provisioning: { next: 'cancelled' },
  },
  in_transit: {
    receive_goods: { next: 'received' },
  },
  received: {
    pass_inspection:   { next: 'stocked' },
    reject_inspection: { next: 'returned' },
  },
  stocked: {
    reserve_stock: { next: 'reserved' },
  },
  reserved: {
    issue_part: { next: 'issued' },
  },
  issued:    {},
  returned:  {},
  cancelled: {},
};

const TERMINALS = new Set<ProvisioningStatus>([
  'issued', 'returned', 'cancelled',
]);

export function isTerminal(s: ProvisioningStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: ProvisioningStatus,
  action: ProvisioningAction,
): ProvisioningStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: ProvisioningStatus): ProvisioningAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as ProvisioningAction[];
}

// URGENT SLA windows in minutes, keyed by the deadline to take the NEXT action
// out of each state. The more critical the line (higher stockout impact), the
// TIGHTER the window. Terminals 0.
export const SLA_MINUTES: Record<ProvisioningStatus, Record<ProvisioningTier, number>> = {
  // demand_identified → raise_requisition
  demand_identified: {
    routine: 10080, standard: 4320, important: 1440, critical: 480, catastrophic: 120,
  },
  // requisition_raised → approve_requisition
  requisition_raised: {
    routine: 7200, standard: 2880, important: 1440, critical: 480, catastrophic: 120,
  },
  // requisition_approved → issue_po
  requisition_approved: {
    routine: 7200, standard: 2880, important: 1440, critical: 480, catastrophic: 120,
  },
  // po_issued → confirm_shipment / flag_backorder
  po_issued: {
    routine: 20160, standard: 10080, important: 4320, critical: 1440, catastrophic: 480,
  },
  // backordered → expedite_backorder (tightest — vital line stuck out of stock)
  backordered: {
    routine: 14400, standard: 7200, important: 2880, critical: 720, catastrophic: 240,
  },
  // in_transit → receive_goods
  in_transit: {
    routine: 28800, standard: 14400, important: 7200, critical: 2880, catastrophic: 1440,
  },
  // received → pass_inspection / reject_inspection (incoming-QA gate)
  received: {
    routine: 4320, standard: 2880, important: 1440, critical: 720, catastrophic: 360,
  },
  // stocked → reserve_stock
  stocked: {
    routine: 20160, standard: 10080, important: 4320, critical: 1440, catastrophic: 720,
  },
  // reserved → issue_part
  reserved: {
    routine: 10080, standard: 4320, important: 1440, critical: 480, catastrophic: 240,
  },
  issued:    { routine: 0, standard: 0, important: 0, critical: 0, catastrophic: 0 },
  returned:  { routine: 0, standard: 0, important: 0, critical: 0, catastrophic: 0 },
  cancelled: { routine: 0, standard: 0, important: 0, critical: 0, catastrophic: 0 },
};

export function slaDeadlineFor(
  state: ProvisioningStatus,
  tier: ProvisioningTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Stockout-impact rand tiers (ZAR absolute).
export function tierForStockoutImpactZar(zar: number): ProvisioningTier {
  if (zar >= 5_000_000) return 'catastrophic';
  if (zar >= 1_000_000) return 'critical';
  if (zar >= 250_000)   return 'important';
  if (zar >= 50_000)    return 'standard';
  return 'routine';
}

const TIER_RANK: Record<ProvisioningTier, number> = {
  routine: 0, standard: 1, important: 2, critical: 3, catastrophic: 4,
};

const HIGH_TIERS = new Set<ProvisioningTier>(['critical', 'catastrophic']);

export function isHighTier(tier: ProvisioningTier): boolean {
  return HIGH_TIERS.has(tier);
}

export function isVital(criticality: Criticality): boolean {
  return criticality === 'vital';
}

// A vital part can never be planned below 'critical' urgency, regardless of the
// rand-impact figure — its unavailability is intrinsically a critical risk.
export function vitalFloor(criticality: Criticality): ProvisioningTier | null {
  return isVital(criticality) ? 'critical' : null;
}

// Effective tier = max rank of the rand-impact tier and the vital floor.
export function provisioningTier(
  stockoutImpactZar: number,
  criticality: Criticality,
): ProvisioningTier {
  const base = tierForStockoutImpactZar(stockoutImpactZar);
  const floor = vitalFloor(criticality);
  if (!floor) return base;
  return TIER_RANK[base] >= TIER_RANK[floor] ? base : floor;
}

// Reportability — a catastrophic stockout, or a vital part on a HIGH-impact
// line, is a security-of-supply concern.
export function isReportable(tier: ProvisioningTier, criticality: Criticality): boolean {
  if (tier === 'catastrophic') return true;
  return isVital(criticality) && isHighTier(tier);
}

// Regulator inbox crossings — the W72 SIGNATURE is AVAILABILITY-RISK-driven.
//   flag_backorder crosses when (vital AND HIGH) OR catastrophic;
//   cancel_provisioning crosses when (vital AND HIGH).
export function crossesIntoRegulator(
  action: ProvisioningAction,
  tier: ProvisioningTier,
  criticality: Criticality,
): boolean {
  if (action === 'flag_backorder') {
    return tier === 'catastrophic' || (isVital(criticality) && isHighTier(tier));
  }
  if (action === 'cancel_provisioning') {
    return isVital(criticality) && isHighTier(tier);
  }
  return false;
}

// sla_breached crosses for HIGH tiers only.
export function slaBreachCrossesIntoRegulator(tier: ProvisioningTier): boolean {
  return isHighTier(tier);
}

// ── Demand & inventory economics ────────────────────────────────────────────

// Reorder point = expected demand over the lead time + safety stock. Classic
// (d × L) + ss service-parts formula. Returns whole units (ceil).
export function reorderPoint(
  dailyDemand: number,
  leadTimeDays: number,
  safetyStock: number,
): number {
  const rp = dailyDemand * leadTimeDays + safetyStock;
  return Math.max(0, Math.ceil(rp));
}

// Safety stock from a service-level z-factor and demand variability over the
// lead time: z × σ_d × √L. Returns whole units (ceil).
export function safetyStock(
  zFactor: number,
  demandStdDev: number,
  leadTimeDays: number,
): number {
  if (leadTimeDays <= 0) return 0;
  const ss = zFactor * demandStdDev * Math.sqrt(leadTimeDays);
  return Math.max(0, Math.ceil(ss));
}

// Fill rate = fraction of demand satisfied immediately from stock. Clamped 0..1.
export function fillRate(unitsFilledFromStock: number, unitsDemanded: number): number {
  if (unitsDemanded <= 0) return 1;
  return Math.min(1, Math.max(0, unitsFilledFromStock / unitsDemanded));
}

// Predictive lead-time horizon: days the W71 RUL gives us to provision before
// the failure. positive = slack (RUL longer than lead time → pre-position in
// time); negative = we are already behind (RUL shorter than supplier lead time).
export function predictiveLeadDays(rulDays: number, leadTimeDays: number): number {
  return Math.round(rulDays - leadTimeDays);
}

// Stockout-avoidance value: downtime ZAR averted by having the part staged when
// the failure lands. = downtime cost rate × outage hours that WOULD have been
// incurred waiting for the part (i.e. the lead-time gap). Never negative.
export function stockoutAvoidanceZar(
  downtimeCostPerHourZar: number,
  leadTimeDays: number,
): number {
  return Math.max(0, downtimeCostPerHourZar * leadTimeDays * 24);
}

// Working-capital efficiency: how much tied-up inventory rand each rand of
// stockout exposure averted is "buying". Higher = leaner provisioning. Returns
// the ratio of averted-exposure to carried-inventory value.
export function workingCapitalEfficiency(
  stockoutAvoidanceZarVal: number,
  carriedInventoryZar: number,
): number {
  if (carriedInventoryZar <= 0) return 0;
  return stockoutAvoidanceZarVal / carriedInventoryZar;
}

// Functional party that owns each action.
const ACTION_PARTY: Record<ProvisioningAction, ProvisioningParty> = {
  raise_requisition:   'planner',
  approve_requisition: 'planner',
  issue_po:            'buyer',
  flag_backorder:      'supplier',
  expedite_backorder:  'buyer',
  confirm_shipment:    'supplier',
  receive_goods:       'warehouse',
  pass_inspection:     'warehouse',
  reject_inspection:   'warehouse',
  reserve_stock:       'warehouse',
  issue_part:          'warehouse',
  cancel_provisioning: 'planner',
};

export function partyForAction(action: ProvisioningAction): ProvisioningParty {
  return ACTION_PARTY[action];
}
