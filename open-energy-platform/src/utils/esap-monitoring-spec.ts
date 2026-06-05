// ═══════════════════════════════════════════════════════════════════════════════
// W214 — Lender E&S Action Plan (ESAP) Monitoring
// Equator Principles IV + IFC Performance Standards (PS1–PS8)
// ═══════════════════════════════════════════════════════════════════════════════

export type EsapStatus =
  | 'esap_issued'             // ESAP conditions defined in loan agreement
  | 'site_visit_scheduled'    // monitoring visit booked
  | 'site_visit_completed'    // auditor on-site visit done; findings drafted
  | 'action_identified'       // findings require corrective action
  | 'corrective_action_plan'  // borrower CAP submitted
  | 'remediation_in_progress' // active remediation underway
  | 'third_party_review'      // independent environmental auditor reviewing
  | 'partial_close'           // some but not all actions resolved
  | 'closed_satisfactory'     // all findings resolved; E&S compliant; terminal +
  | 'closed_escalated'        // escalated to regulator / lenders committee; terminal
  | 'non_compliant'           // formal non-compliance notice; terminal
  | 'withdrawn';              // project decommissioned / loan repaid; terminal

export type EsapAction =
  | 'schedule_visit'
  | 'complete_visit'
  | 'raise_action'
  | 'submit_cap'
  | 'start_remediation'
  | 'request_tpa'
  | 'record_partial_close'
  | 'close_satisfactory'
  | 'escalate'
  | 'issue_non_compliance'
  | 'withdraw'
  | 'sla_breach';

export type EsapTier =
  | 'category_c'      // minimal/no impact; light monitoring
  | 'category_b'      // limited impact; partial assessment
  | 'category_a'      // significant impact; full ESAP; highest scrutiny
  | 'critical_ps';    // high social/biodiversity risk; PS6/PS7 triggered

// INVERTED SLA: higher risk category = more time for thorough remediation
export function deriveEsapSla(tier: EsapTier): number {
  const DAYS: Record<EsapTier, number> = {
    category_c:   21,
    category_b:   45,
    category_a:   90,
    critical_ps: 180,
  };
  return DAYS[tier] ?? 45;
}

export const ESAP_HARD_TERMINALS = new Set<EsapStatus>([
  'closed_satisfactory', 'closed_escalated', 'non_compliant', 'withdrawn',
]);

export const ESAP_VALID_TRANSITIONS: Record<EsapStatus, EsapAction[]> = {
  esap_issued:             ['schedule_visit', 'withdraw', 'sla_breach'],
  site_visit_scheduled:    ['complete_visit', 'sla_breach'],
  site_visit_completed:    ['raise_action', 'close_satisfactory', 'sla_breach'],
  action_identified:       ['submit_cap', 'escalate', 'sla_breach'],
  corrective_action_plan:  ['start_remediation', 'escalate', 'sla_breach'],
  remediation_in_progress: ['request_tpa', 'record_partial_close', 'close_satisfactory', 'sla_breach'],
  third_party_review:      ['record_partial_close', 'close_satisfactory', 'escalate', 'sla_breach'],
  partial_close:           ['start_remediation', 'close_satisfactory', 'escalate', 'issue_non_compliance', 'sla_breach'],
  closed_satisfactory:     [],
  closed_escalated:        [],
  non_compliant:           [],
  withdrawn:               [],
};

export const ESAP_STATE_TRANSITIONS: Record<EsapAction, EsapStatus> = {
  schedule_visit:       'site_visit_scheduled',
  complete_visit:       'site_visit_completed',
  raise_action:         'action_identified',
  submit_cap:           'corrective_action_plan',
  start_remediation:    'remediation_in_progress',
  request_tpa:          'third_party_review',
  record_partial_close: 'partial_close',
  close_satisfactory:   'closed_satisfactory',
  escalate:             'closed_escalated',
  issue_non_compliance: 'non_compliant',
  withdraw:             'withdrawn',
  sla_breach:           'esap_issued',
};

// Regulator crossings
export function esapCrossesIntoRegulator(action: EsapAction, tier: EsapTier): boolean {
  // Non-compliance always crosses — lenders committee + NERSA/DFFE notified
  if (action === 'issue_non_compliance') return true;
  // Escalation always crosses
  if (action === 'escalate') return true;
  // Closing for category_a / critical crosses (EP-IV requires disclosure)
  if (action === 'close_satisfactory') return tier === 'category_a' || tier === 'critical_ps';
  return false;
}

export function esapSlaBreachCrossesIntoRegulator(tier: EsapTier): boolean {
  return tier === 'category_a' || tier === 'critical_ps';
}
