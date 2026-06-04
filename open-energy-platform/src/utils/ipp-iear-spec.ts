// ═══════════════════════════════════════════════════════════════════════════
// Wave 177 — IPP Independent Engineer Annual Performance Review
//
// REIPPPP Finance Documents and Equator Principles require an annual
// Independent Engineer (IE) review of the project's technical performance,
// financial model accuracy, O&M contract compliance, and grid code adherence.
// The IE provides an independent assessment to both the IPP and lenders.
// Material findings trigger a remediation plan; serious findings escalate
// directly to lender action and regulatory notification under NERSA s.34.
//
// Mounted at /api/ipp-ie-annual-reviews.
//
// INVERTED SLA: larger projects require more comprehensive IE review scope
// (more equipment, more monitoring points, more financial model complexity),
// warranting longer review windows. Strategic (>500MW) reviews may involve
// multiple IE firms and subcontractor audits.
//
// 12-state chain:
//   review_triggered → scope_definition → data_submission → ie_field_inspection
//   → ie_analysis → draft_report_issued → ipp_response → ie_final_review
//   → report_issued
//   → review_closed (terminal)
//   → remediation_required (terminal)
//   → escalated_to_lenders (terminal)
//
// Signature reportability:
//   escalate_to_lenders → ALL tiers (lender action is NERSA s.34 reportable
//                          at any project scale)
//   require_remediation → large + utility + strategic (material findings in
//                          significant projects require DMRE notification)
//   close_review        → utility + strategic (positive IE reviews on large
//                          projects feed the national project performance register)
// ═══════════════════════════════════════════════════════════════════════════

export type IearStatus =
  | 'review_triggered'
  | 'scope_definition'
  | 'data_submission'
  | 'ie_field_inspection'
  | 'ie_analysis'
  | 'draft_report_issued'
  | 'ipp_response'
  | 'ie_final_review'
  | 'report_issued'
  | 'review_closed'         // TERMINAL
  | 'remediation_required'  // TERMINAL
  | 'escalated_to_lenders'; // TERMINAL

export type IearAction =
  | 'define_scope'
  | 'submit_data'
  | 'commence_field_inspection'
  | 'commence_analysis'
  | 'issue_draft_report'
  | 'submit_ipp_response'
  | 'commence_final_review'
  | 'issue_report'
  | 'close_review'
  | 'require_remediation'
  | 'escalate_to_lenders';

// INVERTED SLA — project capacity tier
export type IearProjectTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

// Review focus area classification
export type IearFocusArea =
  | 'technical_performance'  // energy yield, PR, availability vs. PPA targets
  | 'financial_model'        // base case vs. actuals, DSCR, LLCR
  | 'om_compliance'          // O&M contract deliverables
  | 'grid_code'              // NERSA Grid Code compliance
  | 'insurance_bonds'        // insurance adequacy, performance bonds
  | 'comprehensive';         // full annual review (all areas)

// Material finding severity
export type IearFindingSeverity =
  | 'none'      // no material findings
  | 'minor'     // informational, no action required
  | 'moderate'  // corrective action recommended
  | 'material'  // formal remediation plan required
  | 'critical'; // lender escalation required

// ─── Tier derivation (keyed on project_mw capacity) ─────────────────────────

export function deriveIearProjectTier(project_mw: number): IearProjectTier {
  if (project_mw < 50)   return 'small';
  if (project_mw < 100)  return 'medium';
  if (project_mw < 200)  return 'large';
  if (project_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger project → more complex IE scope → more time) ───────

export const SLA_DAYS: Record<IearProjectTier, number> = {
  small:     45,
  medium:    60,
  large:     90,
  utility:   120,
  strategic: 150,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<IearStatus>([
  'review_closed',
  'remediation_required',
  'escalated_to_lenders',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<IearAction, { from: IearStatus[] }> = {
  define_scope:               { from: ['review_triggered'] },
  submit_data:                { from: ['scope_definition'] },
  commence_field_inspection:  { from: ['data_submission'] },
  commence_analysis:          { from: ['ie_field_inspection'] },
  issue_draft_report:         { from: ['ie_analysis'] },
  submit_ipp_response:        { from: ['draft_report_issued'] },
  commence_final_review:      { from: ['ipp_response'] },
  issue_report:               { from: ['ie_final_review'] },
  close_review:               { from: ['report_issued'] },
  require_remediation:        { from: ['report_issued'] },
  escalate_to_lenders:        { from: ['report_issued', 'remediation_required'] },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<IearAction, IearStatus> = {
  define_scope:               'scope_definition',
  submit_data:                'data_submission',
  commence_field_inspection:  'ie_field_inspection',
  commence_analysis:          'ie_analysis',
  issue_draft_report:         'draft_report_issued',
  submit_ipp_response:        'ipp_response',
  commence_final_review:      'ie_final_review',
  issue_report:               'report_issued',
  close_review:               'review_closed',
  require_remediation:        'remediation_required',
  escalate_to_lenders:        'escalated_to_lenders',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: IearProjectTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const LARGE_PLUS: IearProjectTier[] = ['large', 'utility', 'strategic'];
const UTILITY_PLUS: IearProjectTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: IearAction,
  tier: IearProjectTier,
): boolean {
  switch (action) {
    case 'escalate_to_lenders': return ALL_TIERS.includes(tier);
    case 'require_remediation': return LARGE_PLUS.includes(tier);
    case 'close_review':        return UTILITY_PLUS.includes(tier);
    default:                    return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: IearProjectTier): boolean {
  return UTILITY_PLUS.includes(tier);
}
