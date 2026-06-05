// ═══════════════════════════════════════════════════════════════════════════
// Wave 188 — IPP Annual Grid Code Compliance Self-Assessment
//
// Generation licensees must submit an Annual Self-Assessment of Grid Code
// compliance to the System Operator (NTCSA/Eskom SO) under:
//   - NERSA Grid Code Section C-7: Annual Generator Compliance Reporting
//   - NRS 097-2-1: Grid interconnection of embedded generation
//   - REIPPPP Schedule 6 Appendix B: annual technical compliance declaration
//
// The self-assessment covers six technical domains:
//   1. Protection systems — relay settings, coordination, fault-clearance times
//   2. Metering & SCADA — telemetry accuracy, communication link availability
//   3. Reactive power / voltage control — VAR capability curve, voltage steps
//   4. Frequency response — governor deadband, response-rate, LFSM settings
//   5. Fault Ride-Through (FRT) + power quality — FRT curves, harmonics,
//      flicker, voltage unbalance per NRS 048-2
//   6. Overall connection compliance — SLD updates, protection settings docs
//
// The System Operator reviews the submission and may:
//   - Accept: issue a Certificate of Grid Code Compliance for the year
//   - Issue deficiency notice: IPP must remedy within 60 days (feeds W67
//     Grid Code Compliance chain for ongoing monitoring)
//   - Lapse: if IPP fails to submit within the SLA window
//
// Non-compliance consequences:
//   - NERSA may impose an administrative penalty under ERA §35
//   - Grid operator may curtail output until deficiencies are remediated
//   - PPA at risk if non-compliance persists for > 90 days (offtaker trigger)
//
// Mounted at /api/ipp-annual-compliance-assessments.
//
// INVERTED SLA: larger plant = more technical systems = more measurement
// data = more time required for rigorous documentation and SO review.
// Flagship plants (> 200 MW) receive 90 days from the annual trigger date.
//
// 12-state chain:
//   assessment_triggered → protection_systems_audit → metering_scada_audit
//   → reactive_power_audit → frequency_response_audit → frt_pq_audit
//   → internal_technical_review → so_submission → so_review_in_progress
//   → assessment_accepted     (terminal — positive)
//   → assessment_deficient    (terminal — deficiency notice issued)
//   → assessment_lapsed       (terminal — time-lapsed)
//
// Signature reportability:
//   issue_deficiency_notice → ALL tiers (NERSA must be notified of all
//                              grid code deficiencies; feeds W31 Regulator
//                              Disposition and W67 Grid Code Compliance)
//   declare_lapsed           → major + flagship (large plant missed annual
//                              grid compliance = systemic; DMRE + NERSA
//                              public disclosure required)
//   accept_assessment        → major + flagship (large-plant compliance
//                              certificates reportable to NERSA capacity
//                              planning registry; feeds W33 licence renewal)
// ═══════════════════════════════════════════════════════════════════════════

export type AcsStatus =
  | 'assessment_triggered'
  | 'protection_systems_audit'
  | 'metering_scada_audit'
  | 'reactive_power_audit'
  | 'frequency_response_audit'
  | 'frt_pq_audit'
  | 'internal_technical_review'
  | 'so_submission'
  | 'so_review_in_progress'
  | 'assessment_accepted'    // TERMINAL
  | 'assessment_deficient'   // TERMINAL
  | 'assessment_lapsed';     // TERMINAL

export type AcsAction =
  | 'commence_protection_audit'
  | 'commence_metering_scada_audit'
  | 'commence_reactive_power_audit'
  | 'commence_frequency_response_audit'
  | 'commence_frt_pq_audit'
  | 'conduct_internal_technical_review'
  | 'submit_to_so'
  | 'commence_so_review'
  | 'accept_assessment'
  | 'issue_deficiency_notice'
  | 'declare_lapsed';

// INVERTED SLA — project capacity tier (larger plant = MORE time)
export type AcsCapacityTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// ─── Tier derivation (keyed on plant_mw) ─────────────────────────────────────

export function deriveAcsCapacityTier(plant_mw: number): AcsCapacityTier {
  if (plant_mw < 10)   return 'small';
  if (plant_mw < 50)   return 'medium';
  if (plant_mw < 100)  return 'large';
  if (plant_mw <= 200) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger MW → more time) ────────────────────────────────────

export const SLA_DAYS: Record<AcsCapacityTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  major:    75,
  flagship: 90,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<AcsStatus>([
  'assessment_accepted',
  'assessment_deficient',
  'assessment_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<AcsAction, { from: AcsStatus[] }> = {
  commence_protection_audit:          { from: ['assessment_triggered'] },
  commence_metering_scada_audit:      { from: ['protection_systems_audit'] },
  commence_reactive_power_audit:      { from: ['metering_scada_audit'] },
  commence_frequency_response_audit:  { from: ['reactive_power_audit'] },
  commence_frt_pq_audit:              { from: ['frequency_response_audit'] },
  conduct_internal_technical_review:  { from: ['frt_pq_audit'] },
  submit_to_so:                       { from: ['internal_technical_review'] },
  commence_so_review:                 { from: ['so_submission'] },
  accept_assessment:                  { from: ['so_review_in_progress'] },
  issue_deficiency_notice:            { from: ['so_review_in_progress'] },
  declare_lapsed:                     {
    from: [
      'assessment_triggered', 'protection_systems_audit', 'metering_scada_audit',
      'reactive_power_audit', 'frequency_response_audit', 'frt_pq_audit',
      'internal_technical_review', 'so_submission', 'so_review_in_progress',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<AcsAction, AcsStatus> = {
  commence_protection_audit:          'protection_systems_audit',
  commence_metering_scada_audit:      'metering_scada_audit',
  commence_reactive_power_audit:      'reactive_power_audit',
  commence_frequency_response_audit:  'frequency_response_audit',
  commence_frt_pq_audit:              'frt_pq_audit',
  conduct_internal_technical_review:  'internal_technical_review',
  submit_to_so:                       'so_submission',
  commence_so_review:                 'so_review_in_progress',
  accept_assessment:                  'assessment_accepted',
  issue_deficiency_notice:            'assessment_deficient',
  declare_lapsed:                     'assessment_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: AcsCapacityTier[]   = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: AcsCapacityTier[]  = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: AcsAction,
  tier: AcsCapacityTier,
): boolean {
  switch (action) {
    case 'issue_deficiency_notice': return ALL_TIERS.includes(tier);
    case 'declare_lapsed':          return MAJOR_PLUS.includes(tier);
    case 'accept_assessment':       return MAJOR_PLUS.includes(tier);
    default:                        return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: AcsCapacityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
