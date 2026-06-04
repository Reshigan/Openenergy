// ═══════════════════════════════════════════════════════════════════════════
// Wave 174 — IPP REIPPPP Local Content & SED Quarterly Compliance
//
// REIPPPP Bid Specifications Schedule 4 (Local Content) and Schedule 5
// (Socio-Economic Development) impose quarterly reporting obligations on all
// REIPPPP projects. The IPP must demonstrate that its supply chain meets the
// committed LC percentage and SED spending targets through certified reports
// submitted to the DMRE IPP Office. Failure triggers a contractual default
// notice and potential penalty deduction from monthly energy payments.
//
// Mounted at /api/ipp-lc-reports.
//
// URGENT SLA: higher LC commitment percentage = tighter quarterly review
// window. Premium bidders (>65% local content) face maximum scrutiny and
// have the least time to resolve queries. Low-commitment projects get more
// time but still face hard quarterly submission deadlines.
//
// 12-state chain:
//   period_open → data_collection → internal_verification
//   → report_preparation → report_submitted → completeness_check
//   → clarification_requested → clarification_submitted
//   → technical_assessment
//   → compliant (terminal)
//   → non_compliant (terminal)
//   → conditional_compliance (terminal)
//
// Signature reportability:
//   confirm_non_compliance    → ALL tiers (contractual default notification)
//   grant_conditional_compliance → medium+ (public compliance status)
//   confirm_compliant         → high+ (high-LC acknowledgments go to DMRE)
// ═══════════════════════════════════════════════════════════════════════════

export type LcStatus =
  | 'period_open'
  | 'data_collection'
  | 'internal_verification'
  | 'report_preparation'
  | 'report_submitted'
  | 'completeness_check'
  | 'clarification_requested'
  | 'clarification_submitted'
  | 'technical_assessment'
  | 'compliant'                  // TERMINAL
  | 'non_compliant'              // TERMINAL
  | 'conditional_compliance';    // TERMINAL

export type LcAction =
  | 'commence_collection'
  | 'submit_for_verification'
  | 'prepare_report'
  | 'submit_report'
  | 'accept_for_review'
  | 'request_clarification'
  | 'submit_clarification'
  | 'commence_technical_assessment'
  | 'confirm_compliant'
  | 'confirm_non_compliance'
  | 'grant_conditional_compliance';

// LC commitment tier (derived from lc_commitment_pct bid target)
export type LcTier = 'low' | 'medium' | 'high' | 'premium';

// Reporting quarter type
export type LcQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

// LC content type
export type LcContentType =
  | 'goods'           // locally manufactured goods
  | 'services'        // locally delivered services
  | 'labour'          // local labour employment
  | 'sed'             // socio-economic development spending
  | 'enterprise_dev'  // enterprise & supplier development
  | 'ownership';      // local ownership / BBBEE compliance

// ─── Tier derivation (keyed on lc_commitment_pct) ───────────────────────────

export function deriveLcTier(lc_commitment_pct: number): LcTier {
  if (lc_commitment_pct < 40) return 'low';
  if (lc_commitment_pct < 55) return 'medium';
  if (lc_commitment_pct < 65) return 'high';
  return 'premium';
}

// ─── URGENT SLA (higher LC commitment → faster review cycle) ────────────────

export const SLA_DAYS: Record<LcTier, number> = {
  low:     90,
  medium:  60,
  high:    45,
  premium: 30,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<LcStatus>([
  'compliant',
  'non_compliant',
  'conditional_compliance',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<LcAction, { from: LcStatus[] }> = {
  commence_collection:              { from: ['period_open'] },
  submit_for_verification:          { from: ['data_collection'] },
  prepare_report:                   { from: ['internal_verification'] },
  submit_report:                    { from: ['report_preparation'] },
  accept_for_review:                { from: ['report_submitted'] },
  request_clarification:            { from: ['completeness_check'] },
  submit_clarification:             { from: ['clarification_requested'] },
  commence_technical_assessment:    { from: ['completeness_check', 'clarification_submitted'] },
  confirm_compliant:                { from: ['technical_assessment'] },
  confirm_non_compliance:           { from: ['technical_assessment'] },
  grant_conditional_compliance:     { from: ['technical_assessment'] },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<LcAction, LcStatus> = {
  commence_collection:              'data_collection',
  submit_for_verification:          'internal_verification',
  prepare_report:                   'report_preparation',
  submit_report:                    'report_submitted',
  accept_for_review:                'completeness_check',
  request_clarification:            'clarification_requested',
  submit_clarification:             'clarification_submitted',
  commence_technical_assessment:    'technical_assessment',
  confirm_compliant:                'compliant',
  confirm_non_compliance:           'non_compliant',
  grant_conditional_compliance:     'conditional_compliance',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: LcTier[] = ['low', 'medium', 'high', 'premium'];
const MEDIUM_PLUS: LcTier[] = ['medium', 'high', 'premium'];
const HIGH_PLUS: LcTier[] = ['high', 'premium'];

export function crossesIntoRegulator(
  action: LcAction,
  tier: LcTier,
): boolean {
  switch (action) {
    case 'confirm_non_compliance':         return ALL_TIERS.includes(tier);
    case 'grant_conditional_compliance':   return MEDIUM_PLUS.includes(tier);
    case 'confirm_compliant':              return HIGH_PLUS.includes(tier);
    default:                               return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: LcTier): boolean {
  return MEDIUM_PLUS.includes(tier);
}
