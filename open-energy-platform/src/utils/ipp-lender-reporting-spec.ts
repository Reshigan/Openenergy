// ═══════════════════════════════════════════════════════════════════════════
// Wave 183 — IPP Lender Information Covenant & Reporting Package
//
// Project Finance Documentation (Common Terms Agreement / CTA, Senior Facility
// Agreement) requires IPPs to deliver periodic information packages to lenders
// via the Agent Bank. Reporting packages include:
//   Quarterly: financial model actuals vs. base case, technical reports,
//              insurance certificates, covenant compliance certificate
//   Semi-annual: full technical report, O&M performance report
//   Annual: audited financial statements, BBBEE certificates, IE annual review,
//           independent technical report, ESG report, updated base case model
//   Special: drawdown reports, event of default notices, material change notices
//
// Failure to deliver on time constitutes an Information Covenant Breach, which
// triggers: (1) lender cure notice, (2) potential draw-stop, (3) escalation to
// acceleration if unremedied within the cure period. The Agent Bank coordinates
// distribution to all lenders in the syndicate.
//
// Mounted at /api/ipp-lender-reporting.
//
// URGENT SLA: more lenders = more complex coordination through the Agent Bank
// = more potential for a single lender objection = TIGHTER deadline.
// Consortium deals (>10 lenders) must deliver within 7 days of trigger.
//
// 12-state chain:
//   reporting_triggered → data_collection → financial_model_update
//   → technical_review → document_compilation → ipp_sign_off
//   → agent_bank_submission → lender_distribution → acknowledgement_pending
//   → package_acknowledged (terminal)
//   → package_disputed     (terminal)
//   → covenant_breach      (terminal)
//
// Signature reportability:
//   declare_covenant_breach → ALL tiers (information covenant breach =
//                              SARB reportable under PFMA s.34 for public
//                              sector lenders; systemic risk for DFI lenders)
//   raise_dispute           → syndicated + consortium (large syndicate disputes
//                              are systemic risk events)
//   confirm_acknowledged    → syndicated + consortium (feeds SARB large-exposure
//                              monitoring registry)
// ═══════════════════════════════════════════════════════════════════════════

export type LrepStatus =
  | 'reporting_triggered'
  | 'data_collection'
  | 'financial_model_update'
  | 'technical_review'
  | 'document_compilation'
  | 'ipp_sign_off'
  | 'agent_bank_submission'
  | 'lender_distribution'
  | 'acknowledgement_pending'
  | 'package_acknowledged'  // TERMINAL
  | 'package_disputed'      // TERMINAL
  | 'covenant_breach';      // TERMINAL

export type LrepAction =
  | 'commence_data_collection'
  | 'update_financial_model'
  | 'conduct_technical_review'
  | 'compile_documents'
  | 'obtain_ipp_sign_off'
  | 'submit_to_agent_bank'
  | 'distribute_to_lenders'
  | 'request_acknowledgement'
  | 'confirm_acknowledged'
  | 'raise_dispute'
  | 'declare_covenant_breach';

// URGENT SLA — lender count tier (more lenders = tighter deadline)
export type LrepLenderTier = 'sole' | 'bilateral' | 'club' | 'syndicated' | 'consortium';

// Reporting package type
export type LrepReportType =
  | 'quarterly_report'       // quarterly covenant compliance + model update
  | 'semi_annual_report'     // semi-annual technical + financial
  | 'annual_report'          // full annual package (audited financials + IE + BBBEE)
  | 'special_purpose_report' // material change notice, event of default notice
  | 'drawdown_report';       // drawdown utilisation and conditions precedent

// ─── Tier derivation (keyed on lender_count) ────────────────────────────────

export function deriveLrepLenderTier(lender_count: number): LrepLenderTier {
  if (lender_count <= 1)  return 'sole';
  if (lender_count <= 2)  return 'bilateral';
  if (lender_count <= 5)  return 'club';
  if (lender_count <= 10) return 'syndicated';
  return 'consortium';
}

// ─── URGENT SLA (more lenders → tighter deadline) ────────────────────────────

export const SLA_DAYS: Record<LrepLenderTier, number> = {
  sole:       30,
  bilateral:  21,
  club:       14,
  syndicated: 10,
  consortium:  7,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<LrepStatus>([
  'package_acknowledged',
  'package_disputed',
  'covenant_breach',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<LrepAction, { from: LrepStatus[] }> = {
  commence_data_collection:  { from: ['reporting_triggered'] },
  update_financial_model:    { from: ['data_collection'] },
  conduct_technical_review:  { from: ['financial_model_update'] },
  compile_documents:         { from: ['technical_review'] },
  obtain_ipp_sign_off:       { from: ['document_compilation'] },
  submit_to_agent_bank:      { from: ['ipp_sign_off'] },
  distribute_to_lenders:     { from: ['agent_bank_submission'] },
  request_acknowledgement:   { from: ['lender_distribution'] },
  confirm_acknowledged:      { from: ['acknowledgement_pending'] },
  raise_dispute:             { from: ['acknowledgement_pending'] },
  declare_covenant_breach:   {
    from: [
      'reporting_triggered', 'data_collection', 'financial_model_update',
      'technical_review', 'document_compilation', 'ipp_sign_off',
      'agent_bank_submission', 'lender_distribution', 'acknowledgement_pending',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<LrepAction, LrepStatus> = {
  commence_data_collection:  'data_collection',
  update_financial_model:    'financial_model_update',
  conduct_technical_review:  'technical_review',
  compile_documents:         'document_compilation',
  obtain_ipp_sign_off:       'ipp_sign_off',
  submit_to_agent_bank:      'agent_bank_submission',
  distribute_to_lenders:     'lender_distribution',
  request_acknowledgement:   'acknowledgement_pending',
  confirm_acknowledged:      'package_acknowledged',
  raise_dispute:             'package_disputed',
  declare_covenant_breach:   'covenant_breach',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: LrepLenderTier[] = ['sole', 'bilateral', 'club', 'syndicated', 'consortium'];
const SYNDICATED_PLUS: LrepLenderTier[] = ['syndicated', 'consortium'];

export function crossesIntoRegulator(
  action: LrepAction,
  tier: LrepLenderTier,
): boolean {
  switch (action) {
    case 'declare_covenant_breach': return ALL_TIERS.includes(tier);
    case 'raise_dispute':           return SYNDICATED_PLUS.includes(tier);
    case 'confirm_acknowledged':    return SYNDICATED_PLUS.includes(tier);
    default:                        return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: LrepLenderTier): boolean {
  return SYNDICATED_PLUS.includes(tier);
}
