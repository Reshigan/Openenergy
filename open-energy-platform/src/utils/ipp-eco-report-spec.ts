// ═══════════════════════════════════════════════════════════════════════════
// Wave 161 — IPP Environmental Compliance Audit (ECO Annual Report) spec
//
// NEMA §43(3) — every IPP holding an Environmental Authorisation must appoint
// an Environmental Control Officer (ECO) and submit an annual compliance
// report to DFFE/DLME. Non-compliance feeds DFFE enforcement (separate from
// NERSA W40 compliance inspections). EA conditions differ per plant.
//
// INVERTED SLA: larger installed capacity → more EA conditions → MORE time.
//
// 12-state chain:
//   audit_due → eco_appointed → site_inspection_in_progress → report_drafting
//   → submitted_to_dffe → under_review → queries_raised → responses_submitted
//   → compliant (terminal)                ← DFFE accepted: no issues
//   → non_compliance_identified           ← DFFE found breach
//   → corrective_action_in_progress       ← IPP remedying
//   → enforcement_referral (terminal)     ← DFFE referred for prosecution
//
// Additional terminal: withdrawn (rare; audit withdrawn by DFFE consent)
//
// Signature reportability:
//   identify_non_compliance  → EVERY tier (NEMA §24N breach is always reportable)
//   refer_to_enforcement     → EVERY tier
//   certify_compliant        → large + utility + strategic
// ═══════════════════════════════════════════════════════════════════════════

export type EcoReportStatus =
  | 'audit_due'
  | 'eco_appointed'
  | 'site_inspection_in_progress'
  | 'report_drafting'
  | 'submitted_to_dffe'
  | 'under_review'
  | 'queries_raised'
  | 'responses_submitted'
  | 'compliant'
  | 'non_compliance_identified'
  | 'corrective_action_in_progress'
  | 'enforcement_referral';

export type EcoReportAction =
  | 'appoint_eco'
  | 'commence_site_inspection'
  | 'complete_site_inspection'
  | 'submit_for_review'
  | 'submit_report'
  | 'commence_dffe_review'
  | 'raise_queries'
  | 'submit_responses'
  | 'certify_compliant'
  | 'identify_non_compliance'
  | 'commence_corrective_action'
  | 'refer_to_enforcement';

export type EcoCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type EcoViolationCategory =
  | 'none'
  | 'water_management'
  | 'waste_management'
  | 'vegetation_clearing'
  | 'noise_dust'
  | 'heritage_resources'
  | 'biodiversity'
  | 'rehabilitation';

// ─── Tier derivation ─────────────────────────────────────────────────────────

export function deriveEcoCapacityTier(capacity_mw: number): EcoCapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger plant = more EA conditions = more time) ──────────

export const SLA_DAYS: Record<EcoCapacityTier, number> = {
  small:     30,
  medium:    45,
  large:     60,
  utility:   75,
  strategic: 90,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<EcoReportStatus>([
  'compliant',
  'enforcement_referral',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  EcoReportAction,
  { from: EcoReportStatus[] }
> = {
  appoint_eco:                { from: ['audit_due'] },
  commence_site_inspection:   { from: ['eco_appointed'] },
  complete_site_inspection:   { from: ['site_inspection_in_progress'] },
  submit_for_review:          { from: ['report_drafting'] },
  submit_report:              { from: ['report_drafting', 'eco_appointed'] },
  commence_dffe_review:       { from: ['submitted_to_dffe'] },
  raise_queries:              { from: ['under_review'] },
  submit_responses:           { from: ['queries_raised'] },
  certify_compliant:          { from: ['under_review', 'responses_submitted'] },
  identify_non_compliance:    { from: ['under_review', 'responses_submitted'] },
  commence_corrective_action: { from: ['non_compliance_identified'] },
  refer_to_enforcement:       { from: [
    'non_compliance_identified',
    'corrective_action_in_progress',
  ]},
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: EcoCapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const LARGE_PLUS: EcoCapacityTier[] = ['large', 'utility', 'strategic'];

export function crossesIntoRegulator(
  action: EcoReportAction,
  tier: EcoCapacityTier,
): boolean {
  switch (action) {
    case 'identify_non_compliance': return ALL_TIERS.includes(tier);
    case 'refer_to_enforcement':    return ALL_TIERS.includes(tier);
    case 'certify_compliant':       return LARGE_PLUS.includes(tier);
    default:                        return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: EcoCapacityTier): boolean {
  return LARGE_PLUS.includes(tier);
}
