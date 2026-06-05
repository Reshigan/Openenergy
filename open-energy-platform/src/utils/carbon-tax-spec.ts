// ═══════════════════════════════════════════════════════════════════════════
// Wave 200 — Carbon Tax Quarterly Return & SARS Filing
//
// Tracks a taxpayer's carbon tax return from period opening through SARS
// assessment and payment.  Integrates with W48 (offset claim allowances)
// and W4 (Article 6 ITMO accounting) for allowance deductions.
//
// Regulatory basis:
//   Carbon Tax Act 15/2019 §16 (quarterly returns, payment schedule),
//   SARS Notice 1541 (environmental levies; electronic filing),
//   National Treasury Carbon Tax Rate Schedule (R190/tCO2e for 2025),
//   Carbon Offsets Administration System (COAS) — for allowance validation.
//
// Tax classes and SLA polarity — INVERTED (larger emitter gets more time)
//   micro     14d  — < 25,000 tCO2e/yr; below general threshold; low risk
//   standard  30d  — general taxpayer; < 100,000 tCO2e/yr
//   large     60d  — 100,000–499,999 tCO2e/yr; SARS priority review
//   major     90d  — ≥ 500,000 tCO2e/yr; major industrial emitter; deep SARS audit
//
// 12-state chain:
//   period_open       — reporting period opened; data collection may begin
//   data_collection   — facility-level emissions data being gathered
//   emissions_calc    — total tCO2e calculated across all scopes
//   allowances_applied — basic + offset allowances deducted; net liability set
//   return_prepared   — return form drafted; supporting schedules attached
//   internal_approved — internal tax team sign-off obtained
//   submitted         — TERMINAL-exit+ — filed with SARS via eFiling
//   acknowledged      — SARS issued receipt / tracking number
//   under_sars_review — SARS reviewing; may request additional information
//   assessment_issued — SARS issued tax assessment (may differ from self-assessed)
//   payment_made      — TERMINAL+ — tax paid; return closed compliant
//   disputed          — formal dispute raised against SARS assessment (→ W48 offset)
//
// Regulator crossing rules (SARS / National Treasury):
//   submit     → EVERY tax class  (all taxpayers file with SARS; mandatory)
//   overdue    → EVERY tax class  (non-compliance; SARS automated penalty)
//   dispute    → large + major    (only material disputes get SARS fast-track)
//   sla_breach → EVERY tax class  (missed filing window = SARS reportable)
//
// Write roles: admin, carbon_fund
// Entity prefix: ctr
// Event prefix:  ctr_evt_
// Mounted at /api/carbon-tax-returns
// ═══════════════════════════════════════════════════════════════════════════

export type CtrStatus =
  | 'period_open'
  | 'data_collection'
  | 'emissions_calc'
  | 'allowances_applied'
  | 'return_prepared'
  | 'internal_approved'
  | 'submitted'          // TERMINAL-exit+
  | 'acknowledged'
  | 'under_sars_review'
  | 'assessment_issued'
  | 'payment_made'       // TERMINAL+
  | 'disputed';

export type CtrAction =
  | 'open_data_collection'
  | 'calculate_emissions'
  | 'apply_allowances'
  | 'prepare_return'
  | 'approve_internally'
  | 'submit_to_sars'
  | 'acknowledge_receipt'
  | 'commence_review'
  | 'issue_assessment'
  | 'record_payment'
  | 'raise_dispute';

export type TaxClass = 'micro' | 'standard' | 'large' | 'major';

// INVERTED SLA — larger emitter gets MORE time (deeper return preparation)
export const CTR_SLA_DAYS: Record<TaxClass, number> = {
  micro:    14,
  standard: 30,
  large:    60,
  major:    90,
};

export function deriveCtrSla(taxClass: TaxClass): number {
  return CTR_SLA_DAYS[taxClass] ?? 30;
}

export const CTR_HARD_TERMINALS = new Set<CtrStatus>([
  'payment_made',
  'disputed',    // terminal for this chain — dispute spawns separate W48 process
]);

export const CTR_VALID_TRANSITIONS: Record<CtrAction, { from: CtrStatus[] }> = {
  open_data_collection: { from: ['period_open'] },
  calculate_emissions:  { from: ['data_collection'] },
  apply_allowances:     { from: ['emissions_calc'] },
  prepare_return:       { from: ['allowances_applied'] },
  approve_internally:   { from: ['return_prepared'] },
  submit_to_sars:       { from: ['internal_approved'] },
  acknowledge_receipt:  { from: ['submitted'] },
  commence_review:      { from: ['acknowledged'] },
  issue_assessment:     { from: ['under_sars_review', 'acknowledged'] },
  record_payment:       { from: ['assessment_issued', 'acknowledged', 'under_sars_review'] },
  raise_dispute:        { from: ['assessment_issued'] },
};

export const CTR_STATE_TRANSITIONS: Record<CtrAction, CtrStatus> = {
  open_data_collection: 'data_collection',
  calculate_emissions:  'emissions_calc',
  apply_allowances:     'allowances_applied',
  prepare_return:       'return_prepared',
  approve_internally:   'internal_approved',
  submit_to_sars:       'submitted',
  acknowledge_receipt:  'acknowledged',
  commence_review:      'under_sars_review',
  issue_assessment:     'assessment_issued',
  record_payment:       'payment_made',
  raise_dispute:        'disputed',
};

const ALL_CLASSES: TaxClass[] = ['micro', 'standard', 'large', 'major'];
const MATERIAL_CLASSES: TaxClass[] = ['large', 'major'];

export function ctrCrossesIntoRegulator(action: CtrAction, taxClass: TaxClass): boolean {
  switch (action) {
    case 'submit_to_sars': return ALL_CLASSES.includes(taxClass);
    case 'raise_dispute':  return MATERIAL_CLASSES.includes(taxClass);
    default:               return false;
  }
}

export function ctrSlaBreachCrossesIntoRegulator(_taxClass: TaxClass): boolean {
  return true; // every missed filing window is SARS-reportable
}
