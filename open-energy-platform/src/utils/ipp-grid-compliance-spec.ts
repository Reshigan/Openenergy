// ═══════════════════════════════════════════════════════════════════════════
// Wave 165 — IPP Grid Code Technical Compliance Self-Assessment spec
//
// NERSA Grid Code §B4 (Connection Requirements) + NRS 097-2-1 (Power Quality
// for Grid-Connected Renewable Energy) + SANS 10142-1 (Wiring Code).
// Every REIPPPP generator must annually self-assess and submit compliance
// evidence for: power quality parameters (voltage/frequency/harmonics),
// protection relay settings, fault ride-through capability, and reactive power
// capability. This is the IPP-side assessment; W67 covers the Grid Operator
// (SO) monitoring counterpart.
//
// Mounted at /api/ipp-grid-compliance.
//
// INVERTED SLA: larger installed capacity → more parameters → MORE time.
//
// 12-state chain:
//   assessment_due → test_preparation → testing_in_progress → test_completed
//   → report_drafted → submitted_to_nersa → nersa_review → deficiency_noted
//   → corrective_action → verification_pending → compliant (terminal)
//   → non_compliant_notice (terminal — feeds enforcement)
//   → (no appeal in grid code — escalates to W67 SO chain)
//
// NOTE: 12 states achieved with a re-assessment path:
//   deficiency_noted → corrective_action → verification_pending
//   → compliant (terminal) OR non_compliant_notice (terminal)
//
// Signature reportability:
//   issue_non_compliance  → EVERY tier (grid code breach always reportable)
//   certify_compliant     → major + strategic (large plants NERSA disclosure)
//   flag_sla_breach       → major + strategic
// ═══════════════════════════════════════════════════════════════════════════

export type GridComplianceStatus =
  | 'assessment_due'
  | 'test_preparation'
  | 'testing_in_progress'
  | 'test_completed'
  | 'report_drafted'
  | 'submitted_to_nersa'
  | 'nersa_review'
  | 'deficiency_noted'
  | 'corrective_action'
  | 'verification_pending'
  | 'compliant'            // TERMINAL
  | 'non_compliant_notice'; // TERMINAL

export type GridComplianceAction =
  | 'commence_preparation'
  | 'commence_testing'
  | 'complete_testing'
  | 'draft_report'
  | 'submit_to_nersa'
  | 'commence_nersa_review'
  | 'note_deficiency'
  | 'commence_corrective_action'
  | 'submit_for_verification'
  | 'certify_compliant'
  | 'issue_non_compliance';

export type CapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type ComplianceCategory =
  | 'power_quality'
  | 'protection_relay'
  | 'fault_ride_through'
  | 'reactive_power'
  | 'frequency_response'
  | 'earthing_bonding';

// ─── Tier derivation (keyed on capacity_mw) ─────────────────────────────────

export function deriveCapacityTier(capacity_mw: number): CapacityTier {
  if (capacity_mw < 10)   return 'small';
  if (capacity_mw < 50)   return 'medium';
  if (capacity_mw < 200)  return 'large';
  if (capacity_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger capacity → more test parameters → more time) ───────

export const SLA_DAYS: Record<CapacityTier, number> = {
  small:     21,
  medium:    30,
  large:     45,
  utility:   60,
  strategic: 90,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<GridComplianceStatus>([
  'compliant',
  'non_compliant_notice',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  GridComplianceAction,
  { from: GridComplianceStatus[] }
> = {
  commence_preparation:        { from: ['assessment_due'] },
  commence_testing:            { from: ['test_preparation'] },
  complete_testing:            { from: ['testing_in_progress'] },
  draft_report:                { from: ['test_completed'] },
  submit_to_nersa:             { from: ['report_drafted'] },
  commence_nersa_review:       { from: ['submitted_to_nersa'] },
  note_deficiency:             { from: ['nersa_review'] },
  commence_corrective_action:  { from: ['deficiency_noted'] },
  submit_for_verification:     { from: ['corrective_action'] },
  certify_compliant:           { from: ['nersa_review', 'verification_pending'] },
  issue_non_compliance:        { from: ['nersa_review', 'verification_pending'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: CapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const MAJOR_PLUS: CapacityTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: GridComplianceAction,
  tier: CapacityTier,
): boolean {
  switch (action) {
    case 'issue_non_compliance': return ALL_TIERS.includes(tier);
    case 'certify_compliant':    return MAJOR_PLUS.includes(tier);
    default:                     return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: CapacityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
