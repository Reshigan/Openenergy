// ═══════════════════════════════════════════════════════════════════════════
// Wave 159 — IPP Annual Regulatory Compliance Report spec
//
// ERA 2006 §43 + NERSA Annual Returns Guidelines + Electricity Regulation
// Act 4/2006 §13 (compliance obligations). Every licensed IPP must file
// annual returns with NERSA. Non-filing or rejection triggers W40 (NERSA
// Compliance Inspection & Enforcement).
//
// INVERTED SLA: larger installed capacity → more complex reporting obligation
// → MORE time per state.
//
// 12-state chain:
//   report_due → report_drafting → data_collection → internal_review
//   → submitted → under_review → queries_raised → responses_submitted
//   → accepted (terminal)
//   → rejected (terminal)               ← rejection triggers W40
//   → appeal_lodged → appeal_determined (terminal)
//
// Signature reportability:
//   reject_report     → EVERY tier (market-entry compliance denial)
//   lodge_appeal      → EVERY tier
//   determine_appeal  → EVERY tier
//   accept_report     → large + utility + strategic
// ═══════════════════════════════════════════════════════════════════════════

export type AnnualReportStatus =
  | 'report_due'
  | 'report_drafting'
  | 'data_collection'
  | 'internal_review'
  | 'submitted'
  | 'under_review'
  | 'queries_raised'
  | 'responses_submitted'
  | 'accepted'
  | 'rejected'
  | 'appeal_lodged'
  | 'appeal_determined';

export type AnnualReportAction =
  | 'start_drafting'
  | 'begin_data_collection'
  | 'complete_data_collection'
  | 'submit_for_internal_review'
  | 'approve_internally'
  | 'submit_report'
  | 'commence_review'
  | 'raise_queries'
  | 'submit_responses'
  | 'accept_report'
  | 'reject_report'
  | 'lodge_appeal'
  | 'determine_appeal';

export type CapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type ReportCategory =
  | 'annual_returns'
  | 'licence_conditions'
  | 'technical_compliance'
  | 'financial_compliance';

// ─── Tier derivation ────────────────────────────────────────────────────────

export function deriveCapacityTier(capacity_mw: number): CapacityTier {
  if (capacity_mw < 10) return 'small';
  if (capacity_mw < 50) return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger capacity → more time) ───────────────────────────
// Days allocated per state per tier. Larger plants have more complex reporting,
// NERSA allows more time for review, and appeals have more at stake.

export const SLA_DAYS: Record<CapacityTier, number> = {
  small:     30,
  medium:    45,
  large:     60,
  utility:   75,
  strategic: 90,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<AnnualReportStatus>([
  'accepted',
  'rejected',
  'appeal_determined',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  AnnualReportAction,
  { from: AnnualReportStatus[] }
> = {
  start_drafting:           { from: ['report_due'] },
  begin_data_collection:    { from: ['report_drafting'] },
  complete_data_collection: { from: ['data_collection'] },
  submit_for_internal_review: { from: ['data_collection', 'report_drafting'] },
  approve_internally:       { from: ['internal_review'] },
  submit_report:            { from: ['internal_review', 'report_drafting'] },
  commence_review:          { from: ['submitted'] },
  raise_queries:            { from: ['under_review'] },
  submit_responses:         { from: ['queries_raised'] },
  accept_report:            { from: ['under_review', 'responses_submitted'] },
  reject_report:            { from: ['under_review', 'responses_submitted'] },
  lodge_appeal:             { from: ['rejected'] },
  determine_appeal:         { from: ['appeal_lodged'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const TIERS: CapacityTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];

export function crossesIntoRegulator(
  action: AnnualReportAction,
  tier: CapacityTier,
): boolean {
  const ALL: CapacityTier[] = TIERS;
  const LARGE_PLUS: CapacityTier[] = ['large', 'utility', 'strategic'];

  switch (action) {
    case 'reject_report':    return ALL.includes(tier);
    case 'lodge_appeal':     return ALL.includes(tier);
    case 'determine_appeal': return ALL.includes(tier);
    case 'accept_report':    return LARGE_PLUS.includes(tier);
    default:                 return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: CapacityTier): boolean {
  return (['utility', 'strategic'] as CapacityTier[]).includes(tier);
}
