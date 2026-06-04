// W146 — IPP Variation Order Management
// JBCC 6.2 Cl.38 (Variation Orders) + Cl.39 (Valuation)
// NEC4 Cl.60 (Compensation Events) + Cl.61 (Notification) + Cl.62 (Quotations)
// REIPPPP Construction Contract requirements + Lender IM conditions

export type VariationOrderStatus =
  | 'instructed'               // PA issues variation instruction to contractor
  | 'acknowledged'             // contractor acknowledges receipt
  | 'quotation_submitted'      // contractor submits price quotation
  | 'quotation_reviewed'       // IE reviews and recommends pricing
  | 'approved'                 // PA approves variation + agreed price
  | 'rejected'                 // PA rejects variation instruction
  | 'in_progress'              // approved variation work underway
  | 'completed_pending_payment'// work done, awaiting payment certification
  | 'paid'                     // variation certified and paid
  | 'disputed_pricing'         // contractor disputes the assessed price
  | 'adjudicated'              // referred to adjudicator / DRC
  | 'cancelled';               // variation withdrawn before implementation

export type VariationType =
  | 'scope_change'      // addition/omission to scope of works
  | 'time_extension'    // EOT — time only, no cost
  | 'cost_adjustment'   // price adjustment (provisional sum, PC sum)
  | 'design_change'     // change to approved design / drawings
  | 'statutory_change'  // forced by change in law/regulation
  | 'provisional_sum';  // instruction to expend a provisional sum

export type ValueTier =
  | 'minor'       // < R100 000 — 7 days SLA
  | 'moderate'    // R100k – R500k — 14 days
  | 'significant' // R500k – R2M — 21 days
  | 'major'       // R2M – R10M — 30 days
  | 'material';   // > R10M — 45 days

// INVERTED SLA polarity — larger value = more review time (financial scrutiny)
export const SLA_DAYS: Record<ValueTier, number> = {
  minor:       7,
  moderate:   14,
  significant: 21,
  major:       30,
  material:    45,
};

export const VALUE_TIER_THRESHOLDS: Array<[ValueTier, number]> = [
  ['material',    10_000_000],
  ['major',        2_000_000],
  ['significant',    500_000],
  ['moderate',       100_000],
  ['minor',               0],
];

export function deriveValueTier(valueZar: number | null): ValueTier {
  if (valueZar === null || valueZar < 0) return 'minor';
  for (const [tier, threshold] of VALUE_TIER_THRESHOLDS) {
    if (valueZar >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: VariationOrderStatus[] = [
  'paid', 'rejected', 'adjudicated', 'cancelled',
];

export const VALID_TRANSITIONS: Record<VariationOrderStatus, VariationOrderStatus[]> = {
  instructed:                ['acknowledged', 'cancelled'],
  acknowledged:              ['quotation_submitted', 'cancelled'],
  quotation_submitted:       ['quotation_reviewed', 'disputed_pricing'],
  quotation_reviewed:        ['approved', 'rejected', 'disputed_pricing'],
  approved:                  ['in_progress', 'cancelled'],
  rejected:                  ['cancelled', 'adjudicated'],
  in_progress:               ['completed_pending_payment', 'disputed_pricing'],
  completed_pending_payment: ['paid', 'disputed_pricing'],
  paid:                      [],
  disputed_pricing:          ['quotation_reviewed', 'adjudicated', 'cancelled'],
  adjudicated:               [],
  cancelled:                 [],
};

export type VariationOrderAction =
  | 'acknowledge_instruction'  // instructed → acknowledged
  | 'submit_quotation'         // acknowledged → quotation_submitted
  | 'review_quotation'         // quotation_submitted → quotation_reviewed
  | 'approve_variation'        // quotation_reviewed → approved
  | 'reject_variation'         // quotation_reviewed / rejected_state → rejected
  | 'commence_work'            // approved → in_progress
  | 'complete_work'            // in_progress → completed_pending_payment
  | 'certify_payment'          // completed_pending_payment → paid
  | 'dispute_pricing'          // various → disputed_pricing
  | 'resolve_dispute'          // disputed_pricing → quotation_reviewed
  | 'refer_adjudication'       // disputed_pricing / rejected → adjudicated
  | 'cancel_instruction'       // pre-implementation → cancelled
  | 'flag_sla_breach';         // admin sweep — marks SLA missed

export function crossesIntoRegulator(
  action: VariationOrderAction,
  tier: ValueTier,
): boolean {
  // SIGNATURE: adjudicated crosses EVERY tier — construction dispute always reportable
  if (action === 'refer_adjudication') return true;
  // Large approvals notify funders via cascade
  if (action === 'approve_variation' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
