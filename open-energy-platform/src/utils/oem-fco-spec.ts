// ─────────────────────────────────────────────────────────────────────────
// Wave 89 — OEM-Support Field Change Order / Engineering Change Notice
//           Campaign Management (P6)
//
// Every renewable-energy fleet eventually receives a stream of OEM-pushed
// retrofit campaigns: Tesla Megapack module replacement notices, Vestas
// gearbox upgrade campaigns, GE wind blade-bond inspection bulletins,
// Sungrow inverter capacitor replacements, SolarEdge optimizer recalls,
// SMA firmware-coupled hardware revisions. These are not single-unit
// repairs (those are W15 RMA) or customer-initiated changes (W47 RFC);
// they are STRUCTURED, FLEET-WIDE, OEM-INITIATED campaigns that propagate
// a design change across every affected serial in the installed base on
// a deadline, often with regulator-reportable safety implications.
//
// W89 is the OEM FCO/ECN campaign lifecycle:
//   • Draft campaign opened by OEM engineering
//   • ECRB / safety review → approval (or withdraw)
//   • Affected population enumerated by serial
//   • Notification dispatched to fleet operators
//   • Operator acknowledgement + slot scheduling
//   • Field implementation rolling out per serial
//   • Partial completion → full completion (terminal)
//   • Suspend/resume branch for safety holds or supply stops
//   • Cancel branch for withdrawn campaigns after rollout started
//
// Distinct from the rest of the OEM-Support book:
//   - [[project_wave14_support_ticket_chain]]   reactive ticket P6
//   - [[project_wave15_warranty_claim_chain]]   single-unit OEM RMA
//   - [[project_wave16_wo_dispatch_chain]]      tactical WO dispatch
//   - [[project_wave41_problem_management_chain]] ITIL problem RCA
//   - [[project_wave47_change_enablement_chain]] customer-initiated RFC
//   - [[project_wave55_security_remediation_chain]] firmware/security patches
//   - [[project_wave63_warranty_recovery_chain]] commercial recovery from OEM
//   - [[project_wave72_spare_parts_provisioning_chain]] consumable inventory
//   - [[project_wave80_service_contract_chain]] AMC / entitlement gate
//
// W47 is CUSTOMER-INITIATED (operator wants a change) — W89 is OEM-PUSHED
// (manufacturer pushes a mandatory campaign). W55 is FIRMWARE-only — W89
// includes PHYSICAL hardware changes. W15 is SINGLE-UNIT reactive — W89
// is FLEET-WIDE proactive. W63 chases MONEY — W89 propagates a CHANGE.
//
// Beats PTC Windchill ECM / Siemens Teamcenter Change Manager / Oracle
// Agile PLM / Arena PLM / Aras Innovator / Dassault Enovia / SAP PLM
// field-action management / Tesla Megapack service campaigns / Vestas
// Online Service Bulletins / GE Vernova fleet upgrade campaigns. Every
// PLM tool treats an ECN as a DOCUMENT; we treat it as a LIVE
// FLEET-OPERATIONAL CAMPAIGN with per-serial completion ledger, RE-DERIVED
// safety tier, fleet-coverage % battery, NERSA / NRCS / SANS regulator
// signature, and SLA-driven completion gating.
//
// Forward path (clean lifecycle):
//   draft → under_review → approved → population_identified
//   → notification_sent → acknowledged → scheduling → in_progress
//   → completed (terminal — full fleet retrofitted)
//
// Suspend branch (safety hold, parts shortage, audit):
//   in_progress → suspend_campaign → suspended
//   suspended → resume_campaign → in_progress
//
// Withdraw branch (pre-approval rollback):
//   draft / under_review → withdraw_campaign → withdrawn (terminal)
//
// Cancel branch (post-approval cancellation — campaign called off after
// fleet was notified; always regulator-reportable):
//   approved / population_identified / notification_sent / acknowledged
//   / scheduling / in_progress / suspended
//   → cancel_campaign → cancelled (terminal)
//
// Tiers (4) RE-DERIVED on every transition from change_class — the row
// can be re-classified during review (e.g. an optional FCO escalates to
// mandatory_safety once a field incident is reported). Every cascade /
// regulator / SLA decision keys off whatever change_class the row carries
// now.
//   mandatory_safety       : safety-of-life or regulator-driven recall
//   mandatory_performance  : warranty / contractual performance breach
//   recommended            : performance / reliability uplift, optional
//   optional               : informational only
//
// SLA polarity URGENT — mandatory_safety gets the tightest windows. Same
// family as W34/W50/W51/W64/W67/W75/W84/W85/W86/W87/W88. Terminals
// (completed, cancelled, withdrawn) carry no deadline.
//
// FLEET-PROPAGATION SIGNATURE (the W89 hard line) — campaigns that move
// through the fleet either are safety-critical or affect grid capacity at
// scale. Two independent triggers:
//   approve_campaign  → regulator EVERY tier when change_class is
//                       mandatory_safety (NRCS + SANS + NERSA Grid Code
//                       — every safety campaign must be lodged on
//                       approval, no exceptions)
//   send_notification → regulator EVERY tier when affected_capacity_mw
//                       >= 50 (grid-significant fleet rollout; NERSA Grid
//                       Code security-of-supply); mandatory tiers
//                       otherwise
//   complete_campaign → regulator EVERY tier when change_class is
//                       mandatory_safety (closure of safety campaign is
//                       always reportable)
//   suspend_campaign  → regulator EVERY tier when mandatory_safety
//                       (halting a safety rollout is always reportable)
//   cancel_campaign   → regulator EVERY tier (post-approval cancellation
//                       always reportable, irrespective of class)
//   withdraw_campaign → regulator EVERY tier when mandatory_safety
//                       (withdrawing a safety review crosses NRCS hard
//                       line); other classes silent
//   sla_breached      → mandatory_safety + mandatory_performance
//
// Write roles: {admin, support}. The OEM authors campaigns; fleet
// operators acknowledge and execute through the support team. actor_party
// tags whether the step represents the oem (manufacturer engineering),
// the operator (Esums/fleet O&M team), the owner (asset owner / IPP), or
// the regulator (NRCS, NERSA, DMRE, FSCA — when a safety lodgement or
// recall notice is required).
// ─────────────────────────────────────────────────────────────────────────

export type FcoStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'population_identified'
  | 'notification_sent'
  | 'acknowledged'
  | 'scheduling'
  | 'in_progress'
  | 'completed'
  | 'suspended'
  | 'cancelled'
  | 'withdrawn';

export type FcoAction =
  | 'submit_for_review'
  | 'approve_campaign'
  | 'identify_population'
  | 'send_notification'
  | 'acknowledge_receipt'
  | 'schedule_rollout'
  | 'start_implementation'
  | 'complete_campaign'
  | 'suspend_campaign'
  | 'resume_campaign'
  | 'cancel_campaign'
  | 'withdraw_campaign';

export type FcoChangeClass =
  | 'mandatory_safety'
  | 'mandatory_performance'
  | 'recommended'
  | 'optional';

export type FcoActorParty = 'oem' | 'operator' | 'owner' | 'regulator';

export const TRANSITIONS: Record<FcoStatus, Partial<Record<FcoAction, FcoStatus>>> = {
  draft: {
    submit_for_review: 'under_review',
    withdraw_campaign: 'withdrawn',
  },
  under_review: {
    approve_campaign: 'approved',
    withdraw_campaign: 'withdrawn',
  },
  approved: {
    identify_population: 'population_identified',
    cancel_campaign: 'cancelled',
  },
  population_identified: {
    send_notification: 'notification_sent',
    cancel_campaign: 'cancelled',
  },
  notification_sent: {
    acknowledge_receipt: 'acknowledged',
    cancel_campaign: 'cancelled',
  },
  acknowledged: {
    schedule_rollout: 'scheduling',
    cancel_campaign: 'cancelled',
  },
  scheduling: {
    start_implementation: 'in_progress',
    cancel_campaign: 'cancelled',
  },
  in_progress: {
    complete_campaign: 'completed',
    suspend_campaign: 'suspended',
    cancel_campaign: 'cancelled',
  },
  suspended: {
    resume_campaign: 'in_progress',
    cancel_campaign: 'cancelled',
  },
  completed: {},
  cancelled: {},
  withdrawn: {},
};

export function nextStatus(from: FcoStatus, action: FcoAction): FcoStatus | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function isTerminal(status: FcoStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}

export function allowedActions(from: FcoStatus): FcoAction[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as FcoAction[];
}

// URGENT SLA — mandatory_safety = tightest. Times in minutes.
//
// Stage windows reflect SA OEM service-bulletin practice:
//   - under_review  : ECRB / safety review window
//   - approved      : population enumeration window
//   - population_identified: notification dispatch window
//   - notification_sent: operator-acknowledgement window
//   - acknowledged  : slot-scheduling window
//   - scheduling    : kick-off rollout
//   - in_progress   : execution window per fleet (mandatory tighter)
//   - suspended     : maximum hold window before forced cancel
export const SLA_MINUTES: Record<FcoStatus, Record<FcoChangeClass, number | null>> = {
  draft: {
    mandatory_safety:      60 * 24,         //  1 d
    mandatory_performance: 60 * 24 * 3,     //  3 d
    recommended:           60 * 24 * 7,     //  7 d
    optional:              60 * 24 * 14,    // 14 d
  },
  under_review: {
    mandatory_safety:      60 * 8,          //   8 h
    mandatory_performance: 60 * 24 * 2,     //  2 d
    recommended:           60 * 24 * 5,     //  5 d
    optional:              60 * 24 * 10,    // 10 d
  },
  approved: {
    mandatory_safety:      60 * 24,         //  1 d
    mandatory_performance: 60 * 24 * 3,     //  3 d
    recommended:           60 * 24 * 7,     //  7 d
    optional:              60 * 24 * 14,    // 14 d
  },
  population_identified: {
    mandatory_safety:      60 * 24,         //  1 d
    mandatory_performance: 60 * 24 * 2,     //  2 d
    recommended:           60 * 24 * 5,     //  5 d
    optional:              60 * 24 * 10,    // 10 d
  },
  notification_sent: {
    mandatory_safety:      60 * 24 * 3,     //  3 d operator ack
    mandatory_performance: 60 * 24 * 7,     //  7 d
    recommended:           60 * 24 * 14,    // 14 d
    optional:              60 * 24 * 30,    // 30 d
  },
  acknowledged: {
    mandatory_safety:      60 * 24 * 5,     //  5 d
    mandatory_performance: 60 * 24 * 14,    // 14 d
    recommended:           60 * 24 * 30,    // 30 d
    optional:              60 * 24 * 60,    // 60 d
  },
  scheduling: {
    mandatory_safety:      60 * 24 * 7,     //  7 d
    mandatory_performance: 60 * 24 * 21,    // 21 d
    recommended:           60 * 24 * 60,    // 60 d
    optional:              60 * 24 * 90,    // 90 d
  },
  in_progress: {
    mandatory_safety:      60 * 24 * 30,    //  30 d execution
    mandatory_performance: 60 * 24 * 90,    //  90 d
    recommended:           60 * 24 * 180,   // 180 d
    optional:              60 * 24 * 365,   // 365 d
  },
  suspended: {
    mandatory_safety:      60 * 24 * 14,    // 14 d max hold
    mandatory_performance: 60 * 24 * 30,    // 30 d
    recommended:           60 * 24 * 90,    // 90 d
    optional:              60 * 24 * 180,   // 180 d
  },
  completed: {
    mandatory_safety: null, mandatory_performance: null, recommended: null, optional: null,
  },
  cancelled: {
    mandatory_safety: null, mandatory_performance: null, recommended: null, optional: null,
  },
  withdrawn: {
    mandatory_safety: null, mandatory_performance: null, recommended: null, optional: null,
  },
};

export function slaMinutesFor(status: FcoStatus, changeClass: FcoChangeClass): number | null {
  return SLA_MINUTES[status]?.[changeClass] ?? null;
}

export const slaWindowMinutes = slaMinutesFor;

export function slaDeadlineFor(
  status: FcoStatus,
  changeClass: FcoChangeClass,
  fromMs: number,
): number | null {
  const mins = slaMinutesFor(status, changeClass);
  if (mins === null) return null;
  return fromMs + mins * 60 * 1000;
}

export function slaDaysRemaining(deadlineMs: number | null, nowMs: number = Date.now()): number | null {
  if (deadlineMs === null) return null;
  return Math.round(((deadlineMs - nowMs) / (1000 * 60 * 60 * 24)) * 100) / 100;
}

// Class RE-DERIVED on every transition — a draft campaign can be re-tiered
// from optional to mandatory_safety once the safety review uncovers a
// hazard. The route normalises stored change_class against the value
// passed in the request before computing the next tier.
export function normaliseChangeClass(value: unknown, fallback: FcoChangeClass = 'recommended'): FcoChangeClass {
  if (value === 'mandatory_safety' || value === 'mandatory_performance' || value === 'recommended' || value === 'optional') {
    return value;
  }
  return fallback;
}

// FLEET-PROPAGATION SIGNATURE — the W89 hard line.
//
// Triggers:
//   approve_campaign  : EVERY tier when mandatory_safety (NRCS+SANS)
//   send_notification : EVERY tier when affected_capacity_mw >= 50 (NERSA
//                       Grid Code grid-significant); mandatory tiers otherwise
//   complete_campaign : EVERY tier when mandatory_safety
//   suspend_campaign  : EVERY tier when mandatory_safety
//   cancel_campaign   : EVERY tier always (post-approval cancellation is
//                       always reportable)
//   withdraw_campaign : EVERY tier when mandatory_safety
//   sla_breached      : mandatory_safety + mandatory_performance only
//   others (submit/identify/acknowledge/schedule/start/resume): silent
export function crossesIntoRegulator(
  action: FcoAction,
  changeClass: FcoChangeClass,
  affectedCapacityMw: number,
): boolean {
  switch (action) {
    case 'approve_campaign':
      return changeClass === 'mandatory_safety';
    case 'send_notification':
      if (affectedCapacityMw >= 50) return true;
      return changeClass === 'mandatory_safety' || changeClass === 'mandatory_performance';
    case 'complete_campaign':
      return changeClass === 'mandatory_safety';
    case 'suspend_campaign':
      return changeClass === 'mandatory_safety';
    case 'cancel_campaign':
      return true;
    case 'withdraw_campaign':
      return changeClass === 'mandatory_safety';
    default:
      return false;
  }
}

export function slaBreachCrossesIntoRegulator(changeClass: FcoChangeClass): boolean {
  return changeClass === 'mandatory_safety' || changeClass === 'mandatory_performance';
}

export function isReportable(
  action: FcoAction,
  changeClass: FcoChangeClass,
  affectedCapacityMw: number,
): boolean {
  return crossesIntoRegulator(action, changeClass, affectedCapacityMw);
}

// actor_party derived from the action. The OEM authors and approves; the
// operator (Esums/fleet) acknowledges, schedules and executes; the owner
// (asset owner / IPP) appears via downstream cascade (notification copy);
// the regulator appears on safety lodgement only.
export function partyForAction(action: FcoAction): FcoActorParty {
  switch (action) {
    case 'submit_for_review':
    case 'approve_campaign':
    case 'withdraw_campaign':
    case 'identify_population':
    case 'send_notification':
      return 'oem';
    case 'acknowledge_receipt':
    case 'schedule_rollout':
    case 'start_implementation':
    case 'complete_campaign':
    case 'suspend_campaign':
    case 'resume_campaign':
    case 'cancel_campaign':
      return 'operator';
    default:
      return 'oem';
  }
}

export function isMandatoryClass(c: FcoChangeClass): boolean {
  return c === 'mandatory_safety' || c === 'mandatory_performance';
}

// Live battery helpers — re-derived on every transition.

export function completionPct(completedUnits: number, affectedUnits: number): number {
  if (affectedUnits <= 0) return 0;
  return Math.round((completedUnits / affectedUnits) * 10000) / 100;
}

export function meanTimeToRetrofitHours(
  startedAtMs: number | null,
  completedUnits: number,
): number {
  if (!startedAtMs || completedUnits <= 0) return 0;
  const elapsedHours = (Date.now() - startedAtMs) / (1000 * 60 * 60);
  return Math.round((elapsedHours / completedUnits) * 100) / 100;
}

export function predictedFullCoverageDays(
  completedUnits: number,
  affectedUnits: number,
  startedAtMs: number | null,
): number | null {
  if (!startedAtMs || completedUnits <= 0) return null;
  const remaining = affectedUnits - completedUnits;
  if (remaining <= 0) return 0;
  const elapsedHours = (Date.now() - startedAtMs) / (1000 * 60 * 60);
  const ratePerHour = completedUnits / elapsedHours;
  if (ratePerHour <= 0) return null;
  const remainingHours = remaining / ratePerHour;
  return Math.round((remainingHours / 24) * 100) / 100;
}

export function totalCampaignCapexZar(retrofitCostPerUnitZar: number, affectedUnits: number): number {
  return Math.round(retrofitCostPerUnitZar * affectedUnits);
}

export function warrantyCoveragePct(warrantyCoveredUnits: number, affectedUnits: number): number {
  if (affectedUnits <= 0) return 0;
  return Math.round((warrantyCoveredUnits / affectedUnits) * 10000) / 100;
}

export function fleetEnergyAtRiskMw(
  affectedCapacityMw: number,
  completedUnits: number,
  affectedUnits: number,
): number {
  if (affectedUnits <= 0) return 0;
  const remaining = Math.max(0, affectedUnits - completedUnits);
  return Math.round(((remaining / affectedUnits) * affectedCapacityMw) * 100) / 100;
}

export function urgencyBand(slaDaysRemaining: number | null, changeClass: FcoChangeClass): 'urgent' | 'due_soon' | 'on_track' | 'over_due' {
  if (slaDaysRemaining === null) return 'on_track';
  if (slaDaysRemaining < 0) return 'over_due';
  const isMand = isMandatoryClass(changeClass);
  if (slaDaysRemaining < (isMand ? 1 : 3)) return 'urgent';
  if (slaDaysRemaining < (isMand ? 5 : 14)) return 'due_soon';
  return 'on_track';
}

export function judicialReviewRisk(
  changeClass: FcoChangeClass,
  acknowledgementPct: number,
  inSuspension: boolean,
): number {
  let r = 0;
  if (changeClass === 'mandatory_safety') r += 50;
  else if (changeClass === 'mandatory_performance') r += 30;
  else if (changeClass === 'recommended') r += 10;
  if (acknowledgementPct < 50) r += 30;
  else if (acknowledgementPct < 80) r += 15;
  if (inSuspension) r += 20;
  return Math.min(100, r);
}
