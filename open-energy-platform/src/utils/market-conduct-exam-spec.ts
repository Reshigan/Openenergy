// ═══════════════════════════════════════════════════════════════════════════════
// W220 — Regulator Market Conduct Examination
// NERSA ERA §34 + FSCA Conduct Standard 1/2020 — proactive conduct examination
// Distinct from W40 (grid code technical conformance), W52 (market abuse)
// ═══════════════════════════════════════════════════════════════════════════════

export type MceStatus =
  | 'examination_scheduled'   // regulator schedules conduct examination
  | 'notice_issued'           // formal Section 34 examination notice served
  | 'document_request'        // regulator requests documents & data
  | 'documents_submitted'     // subject submits documentation
  | 'on_site_review'          // on-site examination underway
  | 'preliminary_findings'    // draft findings issued for comment
  | 'subject_response'        // subject files response to preliminary findings
  | 'final_report_draft'      // regulator drafts final examination report
  | 'report_issued'           // final report issued; terminal if clean
  | 'remedial_action_required' // regulator orders remedial action
  | 'enforcement_action'      // formal enforcement proceeding commenced; terminal
  | 'closed_satisfactory'     // examination closed — no adverse findings; terminal
  | 'withdrawn';              // examination withdrawn; terminal

export type MceAction =
  | 'issue_notice'
  | 'request_documents'
  | 'documents_received'
  | 'commence_on_site'
  | 'issue_preliminary_findings'
  | 'file_subject_response'
  | 'draft_final_report'
  | 'issue_final_report'
  | 'order_remedial_action'
  | 'commence_enforcement'
  | 'close_satisfactory'
  | 'withdraw'
  | 'sla_breach';

export type MceTier =
  | 'routine'            // scheduled routine conduct check; 30d
  | 'thematic'           // industry-wide thematic review (pricing, transparency); 45d
  | 'targeted'           // targeted follow-up on complaints or referrals; 60d
  | 'major_systemic';    // systemic market-wide concern; full investigation; 90d

// INVERTED SLA: more complex investigations get more time
export function deriveMceSla(tier: MceTier): number {
  const DAYS: Record<MceTier, number> = {
    routine:        30,
    thematic:       45,
    targeted:       60,
    major_systemic: 90,
  };
  return DAYS[tier] ?? 45;
}

export const MCE_HARD_TERMINALS = new Set<MceStatus>([
  'enforcement_action', 'closed_satisfactory', 'withdrawn',
]);

export const MCE_VALID_TRANSITIONS: Record<MceStatus, MceAction[]> = {
  examination_scheduled:    ['issue_notice', 'withdraw', 'sla_breach'],
  notice_issued:            ['request_documents', 'sla_breach'],
  document_request:         ['documents_received', 'sla_breach'],
  documents_submitted:      ['commence_on_site', 'issue_preliminary_findings', 'sla_breach'],
  on_site_review:           ['issue_preliminary_findings', 'sla_breach'],
  preliminary_findings:     ['file_subject_response', 'draft_final_report', 'sla_breach'],
  subject_response:         ['draft_final_report', 'sla_breach'],
  final_report_draft:       ['issue_final_report', 'sla_breach'],
  report_issued:            ['order_remedial_action', 'close_satisfactory', 'sla_breach'],
  remedial_action_required: ['close_satisfactory', 'commence_enforcement', 'sla_breach'],
  enforcement_action:       [],
  closed_satisfactory:      [],
  withdrawn:                [],
};

export const MCE_STATE_TRANSITIONS: Record<MceAction, MceStatus> = {
  issue_notice:               'notice_issued',
  request_documents:          'document_request',
  documents_received:         'documents_submitted',
  commence_on_site:           'on_site_review',
  issue_preliminary_findings: 'preliminary_findings',
  file_subject_response:      'subject_response',
  draft_final_report:         'final_report_draft',
  issue_final_report:         'report_issued',
  order_remedial_action:      'remedial_action_required',
  commence_enforcement:       'enforcement_action',
  close_satisfactory:         'closed_satisfactory',
  withdraw:                   'withdrawn',
  sla_breach:                 'examination_scheduled',
};

// Regulator crossings (these ARE the regulator, so crossings = reportable to FSCA/NT)
export function mceCrossesIntoRegulator(action: MceAction, tier: MceTier): boolean {
  // Enforcement action always crosses to FSCA/NT (systemic risk reporting)
  if (action === 'commence_enforcement') return true;
  // Remedial orders for major systemic and targeted cross NT
  if (action === 'order_remedial_action') return tier === 'major_systemic' || tier === 'targeted';
  // Final report issuance for major_systemic crosses NT
  if (action === 'issue_final_report') return tier === 'major_systemic';
  return false;
}

export function mceSlaBreachCrossesIntoRegulator(tier: MceTier): boolean {
  return tier === 'major_systemic' || tier === 'targeted';
}
