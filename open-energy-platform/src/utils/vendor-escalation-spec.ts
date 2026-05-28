// ═══════════════════════════════════════════════════════════════════════════
// Wave 35 — Esums O&M Warranty Vendor-Side Escalation (pure spec).
//
// Supplier-defect escalation lifecycle. When an Esums O&M operator detects a
// recurring component defect across the fleet that is covered by a supplier /
// OEM warranty, they file a vendor-defect escalation. Distinct from:
//   - W15 warranty/RMA  — single-claim, customer→supplier return-merchandise
//   - W24 PR chain       — fleet-side sustained-performance underperformance
// This is the SUPPLIER-DEFECT side: systemic component failures, batch defects,
// and potential safety recalls escalated up to the manufacturer.
//
// Standards framing:
//   - Consumer Protection Act 2008 §56 (implied warranty of quality) + §61
//     (product liability) — supplier/producer liable for systemic defects.
//   - NRCS (National Regulator for Compulsory Specifications) recall powers
//     under the NRCS Act 2008 for safety-critical product defects.
//
// Forward path:
//   filed → vendor_triage → vendor_decision → escalated_to_oem →
//   oem_field_investigation → oem_decision → remediation → closed
//
// Branch terminals:
//   recall_issued  — NRCS / manufacturer recall flagged (safety + systemic)
//   arbitration    — warranty-liability dispute escalated to arbitration
//   withdrawn      — operator withdrew before OEM stage (false alarm / resolved)
//
// Defect classes (severity tiers):
//   safety_recall  — safety-critical defect (fire / electrocution risk) — tightest
//   fleet_systemic — systemic across the fleet (>fleet-defect threshold)
//   batch_defect   — confined to a manufacturing batch / serial range
//   single_unit    — isolated single-unit defect — loosest
//
// URGENT SLA matrix — more severe class gets TIGHTER deadlines (safety first).
// safety_recall: triage in 4h. single_unit: triage in 7 days.
//
// Reportability (NRCS / regulator inbox crossings):
//   - issue_recall crosses for ALL classes (NRCS recall is always notifiable)
//   - oem_decision crosses for safety_recall only (CPA §61 product-liability)
//   - escalate_to_arbitration crosses for safety_recall + fleet_systemic
//   - close crosses for safety_recall + fleet_systemic (reportable-defect closure)
//   - sla_breached crosses for safety_recall + fleet_systemic
//
// Split-write (recorded via actor_party derived from the action's owning party):
//   operator: file / escalate_to_oem / escalate_to_arbitration / close / withdraw
//   vendor:   triage / vendor_decide
//   oem:      oem_investigate / oem_decide / start_remediation / issue_recall
//   Write is open to admin / support / ipp_developer (the Esums O&M operators);
//   there is no dedicated vendor/OEM login, so the platform records every
//   party's action and tags it with the contractual party it represents.
// ═══════════════════════════════════════════════════════════════════════════

export type VendorEscalationStatus =
  | 'filed'
  | 'vendor_triage'
  | 'vendor_decision'
  | 'escalated_to_oem'
  | 'oem_field_investigation'
  | 'oem_decision'
  | 'remediation'
  | 'closed'
  | 'recall_issued'
  | 'arbitration'
  | 'withdrawn';

export type VendorEscalationAction =
  | 'triage'
  | 'vendor_decide'
  | 'escalate_to_oem'
  | 'oem_investigate'
  | 'oem_decide'
  | 'start_remediation'
  | 'close'
  | 'issue_recall'
  | 'escalate_to_arbitration'
  | 'withdraw';

export type DefectClass =
  | 'safety_recall'
  | 'fleet_systemic'
  | 'batch_defect'
  | 'single_unit';

export type EscalationParty = 'operator' | 'vendor' | 'oem';

interface TransitionRule {
  next: VendorEscalationStatus;
}

export const TRANSITIONS: Record<
  VendorEscalationStatus,
  Partial<Record<VendorEscalationAction, TransitionRule>>
> = {
  filed: {
    triage:   { next: 'vendor_triage' },
    withdraw: { next: 'withdrawn' },
  },
  vendor_triage: {
    vendor_decide: { next: 'vendor_decision' },
    withdraw:      { next: 'withdrawn' },
  },
  vendor_decision: {
    escalate_to_oem:         { next: 'escalated_to_oem' },
    escalate_to_arbitration: { next: 'arbitration' },
    close:                   { next: 'closed' },
    withdraw:                { next: 'withdrawn' },
  },
  escalated_to_oem: {
    oem_investigate: { next: 'oem_field_investigation' },
  },
  oem_field_investigation: {
    oem_decide: { next: 'oem_decision' },
  },
  oem_decision: {
    start_remediation:       { next: 'remediation' },
    issue_recall:            { next: 'recall_issued' },
    escalate_to_arbitration: { next: 'arbitration' },
    close:                   { next: 'closed' },
  },
  remediation: {
    close:        { next: 'closed' },
    issue_recall: { next: 'recall_issued' },
  },
  closed:        {},
  recall_issued: {},
  arbitration:   {},
  withdrawn:     {},
};

const TERMINALS = new Set<VendorEscalationStatus>([
  'closed',
  'recall_issued',
  'arbitration',
  'withdrawn',
]);

export function isTerminal(s: VendorEscalationStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: VendorEscalationStatus,
  action: VendorEscalationAction,
): VendorEscalationStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(
  current: VendorEscalationStatus,
): VendorEscalationAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as VendorEscalationAction[];
}

// URGENT SLA windows in minutes — more severe class = TIGHTER (safety first).
// Keyed by the deadline to take the NEXT action out of each state.
export const SLA_MINUTES: Record<VendorEscalationStatus, Record<DefectClass, number>> = {
  // file → triage
  filed: {
    safety_recall: 240, fleet_systemic: 1440, batch_defect: 4320, single_unit: 10080,
  },
  // triage → vendor_decide
  vendor_triage: {
    safety_recall: 480, fleet_systemic: 2880, batch_defect: 7200, single_unit: 20160,
  },
  // vendor_decision → escalate/close
  vendor_decision: {
    safety_recall: 480, fleet_systemic: 2880, batch_defect: 7200, single_unit: 20160,
  },
  // escalated_to_oem → oem_investigate
  escalated_to_oem: {
    safety_recall: 1440, fleet_systemic: 4320, batch_defect: 10080, single_unit: 20160,
  },
  // oem_field_investigation → oem_decide
  oem_field_investigation: {
    safety_recall: 4320, fleet_systemic: 10080, batch_defect: 20160, single_unit: 43200,
  },
  // oem_decision → remediation/recall/close
  oem_decision: {
    safety_recall: 1440, fleet_systemic: 4320, batch_defect: 10080, single_unit: 20160,
  },
  // remediation → close
  remediation: {
    safety_recall: 10080, fleet_systemic: 43200, batch_defect: 86400, single_unit: 129600,
  },
  closed:        { safety_recall: 0, fleet_systemic: 0, batch_defect: 0, single_unit: 0 },
  recall_issued: { safety_recall: 0, fleet_systemic: 0, batch_defect: 0, single_unit: 0 },
  arbitration:   { safety_recall: 0, fleet_systemic: 0, batch_defect: 0, single_unit: 0 },
  withdrawn:     { safety_recall: 0, fleet_systemic: 0, batch_defect: 0, single_unit: 0 },
};

export function slaDeadlineFor(
  state: VendorEscalationStatus,
  defectClass: DefectClass,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[defectClass];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// issue_recall crosses for ALL classes (NRCS recall always notifiable).
// oem_decision crosses for safety_recall only (CPA §61 product-liability).
// escalate_to_arbitration + close cross for safety_recall + fleet_systemic.
export function crossesIntoRegulator(
  action: VendorEscalationAction,
  defectClass: DefectClass,
): boolean {
  if (action === 'issue_recall') return true;
  if (action === 'oem_decide') return defectClass === 'safety_recall';
  if (action === 'escalate_to_arbitration' || action === 'close') {
    return defectClass === 'safety_recall' || defectClass === 'fleet_systemic';
  }
  return false;
}

// sla_breached crosses for safety_recall + fleet_systemic only.
export function slaBreachCrossesIntoRegulator(defectClass: DefectClass): boolean {
  return defectClass === 'safety_recall' || defectClass === 'fleet_systemic';
}

export function isReportable(defectClass: DefectClass): boolean {
  return defectClass === 'safety_recall' || defectClass === 'fleet_systemic';
}

// The contractual party that owns each action (recorded as actor_party).
const ACTION_PARTY: Record<VendorEscalationAction, EscalationParty> = {
  triage:                  'vendor',
  vendor_decide:           'vendor',
  escalate_to_oem:         'operator',
  oem_investigate:         'oem',
  oem_decide:              'oem',
  start_remediation:       'oem',
  issue_recall:            'oem',
  escalate_to_arbitration: 'operator',
  close:                   'operator',
  withdraw:                'operator',
};

export function partyForAction(action: VendorEscalationAction): EscalationParty {
  return ACTION_PARTY[action];
}

// Map a fleet-defect rate (fraction of fleet affected) + safety flag to a class.
export function classForDefect(fleetFraction: number, safetyCritical: boolean): DefectClass {
  if (safetyCritical) return 'safety_recall';
  if (fleetFraction >= 0.1) return 'fleet_systemic';
  if (fleetFraction > 0) return 'batch_defect';
  return 'single_unit';
}
