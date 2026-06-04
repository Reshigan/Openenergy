// W147 — IPP Payment Certificates
// JBCC 6.2 Cl.40-43 (Payment of the contract sum) + NEC4 Cl.51 (Payment)
// CIDB Standard for Uniformity + REIPPPP Construction Finance requirements

export type PaymentCertStatus =
  | 'draft'             // contractor preparing claim
  | 'submitted'         // claim submitted to IE / Principal Agent
  | 'assessed'          // IE has assessed and recommended
  | 'certified'         // PA/Employer certifies payment
  | 'disputed'          // contractor or employer disputes certificate
  | 'revised'           // certificate revised after resolution
  | 'paid'              // payment confirmed received
  | 'final_payment'     // final account payment certified
  | 'adjudicated'       // referred to adjudicator
  | 'withdrawn'         // claim withdrawn before certification
  | 'lapsed'            // certified but not paid within payment period
  | 'rejected';         // certificate rejected (no value payable)

export type ClaimType =
  | 'progress'          // monthly progress payment claim
  | 'retention_release' // release of retention monies
  | 'final_account'     // final account settlement
  | 'variation'         // variation order payment
  | 'dayworks'          // dayworks claim
  | 'loss_and_expense'  // loss & expense / prolongation
  | 'advance_payment';  // advance payment (REIPPPP mobilisation)

export type CertTier =
  | 'minor'       // < R500 000 — 14 days SLA
  | 'moderate'    // R500k – R2M — 21 days
  | 'significant' // R2M – R10M — 30 days
  | 'major'       // R10M – R50M — 45 days
  | 'material';   // > R50M — 60 days

// INVERTED SLA polarity — larger claim = more review time
export const SLA_DAYS: Record<CertTier, number> = {
  minor:        14,
  moderate:     21,
  significant:  30,
  major:        45,
  material:     60,
};

export const CERT_TIER_THRESHOLDS: Array<[CertTier, number]> = [
  ['material',    50_000_000],
  ['major',       10_000_000],
  ['significant',  2_000_000],
  ['moderate',       500_000],
  ['minor',               0],
];

export function deriveCertTier(valueZar: number | null): CertTier {
  if (valueZar === null || valueZar < 0) return 'minor';
  for (const [tier, threshold] of CERT_TIER_THRESHOLDS) {
    if (valueZar >= threshold) return tier;
  }
  return 'minor';
}

export const HARD_TERMINALS: PaymentCertStatus[] = [
  'paid', 'final_payment', 'adjudicated', 'withdrawn', 'rejected',
];

export const VALID_TRANSITIONS: Record<PaymentCertStatus, PaymentCertStatus[]> = {
  draft:         ['submitted', 'withdrawn'],
  submitted:     ['assessed', 'rejected', 'disputed'],
  assessed:      ['certified', 'disputed', 'rejected'],
  certified:     ['paid', 'disputed', 'lapsed'],
  disputed:      ['revised', 'adjudicated', 'withdrawn'],
  revised:       ['certified', 'paid'],
  paid:          [],
  final_payment: [],
  adjudicated:   [],
  withdrawn:     [],
  lapsed:        ['paid', 'adjudicated'],
  rejected:      [],
};

export type PaymentCertAction =
  | 'submit_claim'         // draft → submitted
  | 'assess_claim'         // submitted → assessed
  | 'certify_payment'      // assessed → certified
  | 'confirm_payment'      // certified → paid (or revised → paid)
  | 'certify_final'        // assessed → final_payment
  | 'dispute_certificate'  // various → disputed
  | 'revise_certificate'   // disputed → revised
  | 'refer_adjudication'   // disputed/lapsed → adjudicated
  | 'reject_claim'         // submitted/assessed → rejected
  | 'withdraw_claim'       // draft/disputed → withdrawn
  | 'mark_lapsed'          // certified → lapsed (cron: payment overdue)
  | 'flag_sla_breach';     // admin sweep

export function crossesIntoRegulator(
  action: PaymentCertAction,
  tier: CertTier,
): boolean {
  // SIGNATURE: adjudication is always reportable
  if (action === 'refer_adjudication') return true;
  // Final account payments on major/material projects notify funders + NERSA
  if (action === 'certify_final' && (tier === 'major' || tier === 'material')) return true;
  return false;
}
