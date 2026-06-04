// ═══════════════════════════════════════════════════════════════════════════
// Wave 185 — IPP REIPPPP Annual Progress & Compliance Report
//
// The Renewable Energy Independent Power Producer Procurement Programme
// (REIPPPP) requires all awarded IPPs to submit Annual Progress Reports
// to the IPP Office (DMRE) covering:
//   - Construction milestones vs. approved programme (pre-COD)
//   - Commercial operation date (COD) achievement and grid connection status
//   - Local Content % achieved vs. REIPPPP Schedule 5 commitments
//   - Economic Development (ED) spend vs. approved ED plan (links W27 chain)
//   - Social Economic Development (SED) spend vs. commitments (links W181)
//   - Job creation statistics (direct and indirect employment)
//   - B-BBEE status and score (links W182 chain)
//   - Community ownership and equity participation (links W180 CEP chain)
//   - Lender compliance status (draws from W183 lender reporting chain)
//   - Environmental compliance summary (draws from EIA monitoring records)
//
// The IPP Office reviews the report, may request clarification, and either
// accepts it (issuing a compliance certificate) or rejects it (triggering:
//   (1) cure notice with a 30-day remediation window
//   (2) breach flag in the REIPPPP compliance registry
//   (3) referral to DMRE and NERSA for enforcement if not remedied)
//
// Failure to submit or a rejected report can result in:
//   - PPA payment suspension under REIPPPP Schedule 3
//   - Clawback of Development Finance Institution (DFI) guarantees
//   - Public reporting of non-compliance on DMRE website
//
// Mounted at /api/ipp-reipppp-reports.
//
// INVERTED SLA: larger project (MW) = more complex REIPPPP obligations
// = more stakeholders to consult = MORE time granted by the IPP Office.
// Flagship plants (> 200 MW) have the highest complexity across all
// reporting dimensions and receive 90 days from the annual cycle trigger.
//
// 12-state chain:
//   report_cycle_opened → data_collection → local_content_verification
//   → ed_spend_reconciliation → job_creation_tabulation → internal_review
//   → board_approval → ipp_office_submission → acknowledgement_pending
//   → report_accepted    (terminal — positive)
//   → report_rejected    (terminal — negative)
//   → report_lapsed      (terminal — time-lapsed)
//
// Signature reportability:
//   reject_report        → ALL tiers (REIPPPP breach = mandatory notification
//                           to DMRE + NERSA; feeds W31 Regulator Disposition)
//   declare_lapsed       → major + flagship (large plant missed annual REIPPPP
//                           report = systemic programme breach; DMRE public
//                           disclosure required)
//   confirm_acknowledgement → major + flagship (large-project filings feed
//                           DoE energy statistics desk and NERSA capacity
//                           planning registry; SARB monitors DFI exposure)
// ═══════════════════════════════════════════════════════════════════════════

export type RprStatus =
  | 'report_cycle_opened'
  | 'data_collection'
  | 'local_content_verification'
  | 'ed_spend_reconciliation'
  | 'job_creation_tabulation'
  | 'internal_review'
  | 'board_approval'
  | 'ipp_office_submission'
  | 'acknowledgement_pending'
  | 'report_accepted'    // TERMINAL
  | 'report_rejected'    // TERMINAL
  | 'report_lapsed';     // TERMINAL

export type RprAction =
  | 'commence_data_collection'
  | 'verify_local_content'
  | 'reconcile_ed_spend'
  | 'tabulate_jobs'
  | 'conduct_internal_review'
  | 'obtain_board_approval'
  | 'submit_to_ipp_office'
  | 'confirm_acknowledgement'
  | 'accept_report'
  | 'reject_report'
  | 'declare_lapsed';

// INVERTED SLA — project capacity tier (larger plant = MORE time)
export type RprProjectTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Report coverage period
export type RprReportType =
  | 'annual_operational'       // standard post-COD annual progress report
  | 'annual_construction'      // construction-phase report (pre-COD)
  | 'final_construction'       // final construction completion report
  | 'remediation_report';      // remediation report after prior rejection

// ─── Tier derivation (keyed on project_mw) ───────────────────────────────────

export function deriveRprProjectTier(project_mw: number): RprProjectTier {
  if (project_mw < 10)   return 'small';
  if (project_mw < 50)   return 'medium';
  if (project_mw < 100)  return 'large';
  if (project_mw <= 200) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger MW → more time) ────────────────────────────────────

export const SLA_DAYS: Record<RprProjectTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  major:    75,
  flagship: 90,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<RprStatus>([
  'report_accepted',
  'report_rejected',
  'report_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<RprAction, { from: RprStatus[] }> = {
  commence_data_collection:  { from: ['report_cycle_opened'] },
  verify_local_content:      { from: ['data_collection'] },
  reconcile_ed_spend:        { from: ['local_content_verification'] },
  tabulate_jobs:             { from: ['ed_spend_reconciliation'] },
  conduct_internal_review:   { from: ['job_creation_tabulation'] },
  obtain_board_approval:     { from: ['internal_review'] },
  submit_to_ipp_office:      { from: ['board_approval'] },
  confirm_acknowledgement:   { from: ['ipp_office_submission'] },
  accept_report:             { from: ['acknowledgement_pending'] },
  reject_report:             { from: ['acknowledgement_pending'] },
  declare_lapsed:            {
    from: [
      'report_cycle_opened', 'data_collection', 'local_content_verification',
      'ed_spend_reconciliation', 'job_creation_tabulation', 'internal_review',
      'board_approval', 'ipp_office_submission', 'acknowledgement_pending',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<RprAction, RprStatus> = {
  commence_data_collection:  'data_collection',
  verify_local_content:      'local_content_verification',
  reconcile_ed_spend:        'ed_spend_reconciliation',
  tabulate_jobs:             'job_creation_tabulation',
  conduct_internal_review:   'internal_review',
  obtain_board_approval:     'board_approval',
  submit_to_ipp_office:      'ipp_office_submission',
  confirm_acknowledgement:   'acknowledgement_pending',
  accept_report:             'report_accepted',
  reject_report:             'report_rejected',
  declare_lapsed:            'report_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: RprProjectTier[]   = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: RprProjectTier[]  = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: RprAction,
  tier: RprProjectTier,
): boolean {
  switch (action) {
    case 'reject_report':            return ALL_TIERS.includes(tier);
    case 'declare_lapsed':           return MAJOR_PLUS.includes(tier);
    case 'confirm_acknowledgement':  return MAJOR_PLUS.includes(tier);
    default:                         return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: RprProjectTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
