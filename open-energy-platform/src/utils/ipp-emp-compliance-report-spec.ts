// ═══════════════════════════════════════════════════════════════════════════
// Wave 190 — IPP Environmental Management Plan (EMP) Annual Compliance Report
//
// Every generation facility operating under an Environmental Authorisation (EA)
// granted under the National Environmental Management Act (NEMA) §24 and the
// EIA Regulations (GN R. 326/327/325 of 2014, as amended) must compile and
// submit an Annual Environmental Compliance Report (AECR) to the competent
// authority demonstrating adherence to the conditions of the EA and the
// approved Environmental Management Plan (EMP).
//
// For REIPPPP projects, the competent authority is typically the Department
// of Forestry, Fisheries and the Environment (DFFE) for national activities,
// with provincial authorities handling smaller embedded generation. The report
// is also a condition precedent for:
//   - DMRE REIPPPP Programme Office annual compliance review
//   - Lender Environmental and Social Action Plan (ESAP) monitoring under
//     Equator Principles and IFC Performance Standards (feeds W21 drawdown
//     and W38 covenant certificate)
//   - NERSA licence renewal under ERA §33 (feeds W33 licence renewal)
//   - Carbon project monitoring under Gold Standard / Verra MRV (feeds W11
//     and W56 crediting-period renewal)
//
// The AECR covers:
//   1. ECO fieldwork: Environmental Control Officer inspects all EA conditions
//   2. Monitoring results: water, air quality, noise, visual, biodiversity
//   3. Incident review: all environmental incidents logged, corrective actions
//   4. Draft report: ECO compiles findings into AECR draft
//   5. Internal review: project environmental manager + legal sign-off
//   6. ECO sign-off: independent ECO certifies the report
//   7. Submission: lodged via DFFE eDAS portal or provincial equivalent
//   8. Competent authority review: CA accepts or rejects
//
// Non-compliance consequences:
//   - DFFE may issue a directive under NEMA §31L to cease operations
//   - Criminal liability under NEMA §34: up to R10M fine or 10 years
//   - PPA at risk if non-compliance persists > 90 days (offtaker notice)
//   - DFI lenders may trigger covenant default under W38
//
// Mounted at /api/ipp-emp-compliance-reports.
//
// INVERTED SLA: larger plant = more environmental footprint = more monitoring
// data points = more time needed for rigorous AECR compilation and CA review.
// Flagship plants (>200 MW) receive 120 days from the annual trigger date.
//
// 12-state chain:
//   report_period_opened → eco_data_collection → monitoring_results_compilation
//   → incident_review → draft_report_preparation → internal_review
//   → eco_sign_off → competent_authority_submission → ca_review_in_progress
//   → report_accepted      (terminal — positive: EA conditions met)
//   → report_rejected      (terminal — CA identifies non-compliance)
//   → report_lapsed        (terminal — time-lapsed / missed submission window)
//
// Signature reportability:
//   reject_report   → ALL tiers (NEMA non-compliance is always publicly
//                      reportable; feeds W31 Regulator Disposition, W40
//                      Compliance Inspection, DFFE)
//   declare_lapsed  → major + flagship (large-plant missed AECR is a systemic
//                      environmental compliance failure; DFI default trigger)
//   accept_report   → major + flagship (large-plant positive compliance
//                      certificates feed NERSA capacity planning and DFI ESAP)
// ═══════════════════════════════════════════════════════════════════════════

export type EmpReportStatus =
  | 'report_period_opened'
  | 'eco_data_collection'
  | 'monitoring_results_compilation'
  | 'incident_review'
  | 'draft_report_preparation'
  | 'internal_review'
  | 'eco_sign_off'
  | 'competent_authority_submission'
  | 'ca_review_in_progress'
  | 'report_accepted'   // TERMINAL
  | 'report_rejected'   // TERMINAL
  | 'report_lapsed';    // TERMINAL

export type EmpReportAction =
  | 'commence_eco_data_collection'
  | 'compile_monitoring_results'
  | 'conduct_incident_review'
  | 'prepare_draft_report'
  | 'complete_internal_review'
  | 'obtain_eco_sign_off'
  | 'submit_to_competent_authority'
  | 'commence_ca_review'
  | 'accept_report'
  | 'reject_report'
  | 'declare_lapsed';

// INVERTED SLA — plant capacity tier (larger plant = MORE time)
export type EmpCapacityTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// EMP mitigation implementation status
export type EmpMitigationStatus =
  | 'on_track'
  | 'delayed'
  | 'remediated'
  | 'escalated';

// ─── Tier derivation (keyed on plant_mw) ─────────────────────────────────────

export function deriveEmpCapacityTier(plant_mw: number): EmpCapacityTier {
  if (plant_mw < 10)   return 'small';
  if (plant_mw < 50)   return 'medium';
  if (plant_mw < 100)  return 'large';
  if (plant_mw <= 200) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger MW → more time; days from annual trigger) ───────────

export const SLA_DAYS: Record<EmpCapacityTier, number> = {
  small:    45,
  medium:   60,
  large:    75,
  major:    90,
  flagship: 120,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<EmpReportStatus>([
  'report_accepted',
  'report_rejected',
  'report_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<EmpReportAction, { from: EmpReportStatus[] }> = {
  commence_eco_data_collection:    { from: ['report_period_opened'] },
  compile_monitoring_results:      { from: ['eco_data_collection'] },
  conduct_incident_review:         { from: ['monitoring_results_compilation'] },
  prepare_draft_report:            { from: ['incident_review'] },
  complete_internal_review:        { from: ['draft_report_preparation'] },
  obtain_eco_sign_off:             { from: ['internal_review'] },
  submit_to_competent_authority:   { from: ['eco_sign_off'] },
  commence_ca_review:              { from: ['competent_authority_submission'] },
  accept_report:                   { from: ['ca_review_in_progress'] },
  reject_report:                   { from: ['ca_review_in_progress'] },
  declare_lapsed:                  {
    from: [
      'report_period_opened', 'eco_data_collection', 'monitoring_results_compilation',
      'incident_review', 'draft_report_preparation', 'internal_review',
      'eco_sign_off', 'competent_authority_submission', 'ca_review_in_progress',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<EmpReportAction, EmpReportStatus> = {
  commence_eco_data_collection:    'eco_data_collection',
  compile_monitoring_results:      'monitoring_results_compilation',
  conduct_incident_review:         'incident_review',
  prepare_draft_report:            'draft_report_preparation',
  complete_internal_review:        'internal_review',
  obtain_eco_sign_off:             'eco_sign_off',
  submit_to_competent_authority:   'competent_authority_submission',
  commence_ca_review:              'ca_review_in_progress',
  accept_report:                   'report_accepted',
  reject_report:                   'report_rejected',
  declare_lapsed:                  'report_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: EmpCapacityTier[]   = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: EmpCapacityTier[]  = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: EmpReportAction,
  tier: EmpCapacityTier,
): boolean {
  switch (action) {
    case 'reject_report':   return ALL_TIERS.includes(tier);
    case 'declare_lapsed':  return MAJOR_PLUS.includes(tier);
    case 'accept_report':   return MAJOR_PLUS.includes(tier);
    default:                return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: EmpCapacityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
