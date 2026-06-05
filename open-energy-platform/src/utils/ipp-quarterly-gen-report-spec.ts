// ═══════════════════════════════════════════════════════════════════════════
// Wave 187 — IPP DMRE Quarterly Generation & Operations Report
//
// Every REIPPPP project must submit a Quarterly Generation & Operations
// Report to the IPP Office (DMRE) under REIPPPP Schedule 3 §4.2 covering:
//   - Actual vs contracted MWh generation (links W175 metering chain)
//   - Plant availability and capacity factor (links W51 availability guarantee)
//   - Grid code compliance status (links W67 grid code compliance chain)
//   - O&M activities and incidents during the quarter (links W16 WO dispatch)
//   - Environmental compliance quarterly summary (links W174 env monitoring)
//   - Community development: ED & SED quarterly spend (links W181 + W27)
//   - Financial indicators: revenue, capex, opex (ZAR quarterly)
//
// The IPP Office may:
//   - Accept the report (issuing a quarterly compliance certificate)
//   - Request clarification (pausing the SLA clock)
//   - Reject the report (triggering a 15-day remediation + resubmission)
//
// Failure to submit or a rejected report can result in:
//   - PPA payment withholding under REIPPPP Schedule 3 §5
//   - Written warning in the compliance registry
//   - Escalation to NERSA for licence conditions review on repeat breach
//
// Mounted at /api/ipp-quarterly-gen-reports.
//
// INVERTED SLA: larger project (MW) = more data to compile + more
// stakeholders to consult + more complex O&M and environmental records =
// MORE time granted by the IPP Office. Flagship plants (> 200 MW) receive
// 49 days from the quarter-end trigger.
//
// 12-state chain:
//   report_quarter_opened → operations_data_collection
//   → environmental_data_compilation → financial_data_compilation
//   → social_indicators_tabulation → internal_review → board_approval
//   → ipp_office_submission → acknowledgement_pending
//   → report_accepted       (terminal — positive)
//   → report_rejected       (terminal — negative)
//   → report_lapsed         (terminal — time-lapsed)
//
// Signature reportability:
//   reject_report        → ALL tiers (REIPPPP quarterly breach = mandatory
//                           notification to DMRE + NERSA; feeds W31 Regulator)
//   declare_lapsed       → major + flagship (large plant missed quarterly
//                           report = systemic programme breach; DMRE public
//                           disclosure required)
//   confirm_acknowledgement → major + flagship (large-project quarterly
//                           filings feed DoE energy statistics and NERSA
//                           capacity planning registry)
// ═══════════════════════════════════════════════════════════════════════════

export type QgrStatus =
  | 'report_quarter_opened'
  | 'operations_data_collection'
  | 'environmental_data_compilation'
  | 'financial_data_compilation'
  | 'social_indicators_tabulation'
  | 'internal_review'
  | 'board_approval'
  | 'ipp_office_submission'
  | 'acknowledgement_pending'
  | 'report_accepted'    // TERMINAL
  | 'report_rejected'    // TERMINAL
  | 'report_lapsed';     // TERMINAL

export type QgrAction =
  | 'commence_operations_collection'
  | 'compile_environmental_data'
  | 'compile_financial_data'
  | 'tabulate_social_indicators'
  | 'conduct_internal_review'
  | 'obtain_board_approval'
  | 'submit_to_ipp_office'
  | 'confirm_acknowledgement'
  | 'accept_report'
  | 'reject_report'
  | 'declare_lapsed';

// INVERTED SLA — project capacity tier (larger plant = MORE time)
export type QgrProjectTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Report quarter label
export type QgrQuarterLabel = 'Q1' | 'Q2' | 'Q3' | 'Q4';

// ─── Tier derivation (keyed on project_mw) ───────────────────────────────────

export function deriveQgrProjectTier(project_mw: number): QgrProjectTier {
  if (project_mw < 10)   return 'small';
  if (project_mw < 50)   return 'medium';
  if (project_mw < 100)  return 'large';
  if (project_mw <= 200) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger MW → more time) ────────────────────────────────────

export const SLA_DAYS: Record<QgrProjectTier, number> = {
  small:    21,
  medium:   28,
  large:    35,
  major:    42,
  flagship: 49,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<QgrStatus>([
  'report_accepted',
  'report_rejected',
  'report_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<QgrAction, { from: QgrStatus[] }> = {
  commence_operations_collection:  { from: ['report_quarter_opened'] },
  compile_environmental_data:      { from: ['operations_data_collection'] },
  compile_financial_data:          { from: ['environmental_data_compilation'] },
  tabulate_social_indicators:      { from: ['financial_data_compilation'] },
  conduct_internal_review:         { from: ['social_indicators_tabulation'] },
  obtain_board_approval:           { from: ['internal_review'] },
  submit_to_ipp_office:            { from: ['board_approval'] },
  confirm_acknowledgement:         { from: ['ipp_office_submission'] },
  accept_report:                   { from: ['acknowledgement_pending'] },
  reject_report:                   { from: ['acknowledgement_pending'] },
  declare_lapsed:                  {
    from: [
      'report_quarter_opened', 'operations_data_collection',
      'environmental_data_compilation', 'financial_data_compilation',
      'social_indicators_tabulation', 'internal_review',
      'board_approval', 'ipp_office_submission', 'acknowledgement_pending',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<QgrAction, QgrStatus> = {
  commence_operations_collection:  'operations_data_collection',
  compile_environmental_data:      'environmental_data_compilation',
  compile_financial_data:          'financial_data_compilation',
  tabulate_social_indicators:      'social_indicators_tabulation',
  conduct_internal_review:         'internal_review',
  obtain_board_approval:           'board_approval',
  submit_to_ipp_office:            'ipp_office_submission',
  confirm_acknowledgement:         'acknowledgement_pending',
  accept_report:                   'report_accepted',
  reject_report:                   'report_rejected',
  declare_lapsed:                  'report_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: QgrProjectTier[]   = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: QgrProjectTier[]  = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: QgrAction,
  tier: QgrProjectTier,
): boolean {
  switch (action) {
    case 'reject_report':           return ALL_TIERS.includes(tier);
    case 'declare_lapsed':          return MAJOR_PLUS.includes(tier);
    case 'confirm_acknowledgement': return MAJOR_PLUS.includes(tier);
    default:                        return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: QgrProjectTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
