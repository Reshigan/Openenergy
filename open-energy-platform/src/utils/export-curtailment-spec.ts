// ═══════════════════════════════════════════════════════════════════════════════
// W221 — Esums Grid Export Curtailment & Compensation Claim
// IEC 61724 / NERSA Grid Code §CSC-2 — plant-side curtailment compensation
// Asset-side complement to W46 (Offtaker curtailment/deemed-energy)
// ═══════════════════════════════════════════════════════════════════════════════

export type EcStatus =
  | 'curtailment_detected'    // monitoring detects export constraint
  | 'notification_logged'     // curtailment notification logged from SO
  | 'energy_calculation'      // lost generation (MWh) + deemed-energy calculated
  | 'claim_prepared'          // compensation claim document prepared
  | 'claim_submitted'         // claim submitted to grid operator / offtaker
  | 'under_review'            // counterparty reviewing claim
  | 'disputed'                // counterparty disputes quantum or eligibility
  | 'arbitration'             // dispute referred to NERSA / arbitration
  | 'settled'                 // compensation agreed and paid; terminal +
  | 'rejected'                // claim rejected — no eligible curtailment; terminal
  | 'withdrawn'               // claim withdrawn by plant operator; terminal
  | 'cancelled';              // cancelled — duplicate / admin error; terminal

export type EcAction =
  | 'log_notification'
  | 'calculate_energy'
  | 'prepare_claim'
  | 'submit_claim'
  | 'acknowledge_review'
  | 'raise_dispute'
  | 'refer_to_arbitration'
  | 'settle'
  | 'reject'
  | 'withdraw'
  | 'cancel'
  | 'sla_breach';

export type EcTier =
  | 'minor'        // <500 MWh lost; <24h curtailment; standard claim; 14d
  | 'moderate'     // 500–2000 MWh; 24–72h; enhanced; 21d
  | 'significant'  // 2000–10000 MWh; multi-day; major; 30d
  | 'systemic';    // >10000 MWh; prolonged; network-wide; NERSA flag; 45d

// URGENT SLA: higher curtailment impact = tighter resolution window (in days)
export function deriveEcSla(tier: EcTier): number {
  const DAYS: Record<EcTier, number> = {
    minor:       14,
    moderate:    21,
    significant: 30,
    systemic:    45,
  };
  return DAYS[tier] ?? 21;
}

export const EC_HARD_TERMINALS = new Set<EcStatus>([
  'settled', 'rejected', 'withdrawn', 'cancelled',
]);

export const EC_VALID_TRANSITIONS: Record<EcStatus, EcAction[]> = {
  curtailment_detected: ['log_notification', 'cancel', 'sla_breach'],
  notification_logged:  ['calculate_energy', 'cancel', 'sla_breach'],
  energy_calculation:   ['prepare_claim', 'cancel', 'sla_breach'],
  claim_prepared:       ['submit_claim', 'withdraw', 'sla_breach'],
  claim_submitted:      ['acknowledge_review', 'reject', 'sla_breach'],
  under_review:         ['settle', 'raise_dispute', 'sla_breach'],
  disputed:             ['settle', 'refer_to_arbitration', 'withdraw', 'sla_breach'],
  arbitration:          ['settle', 'reject', 'sla_breach'],
  settled:              [],
  rejected:             [],
  withdrawn:            [],
  cancelled:            [],
};

export const EC_STATE_TRANSITIONS: Record<EcAction, EcStatus> = {
  log_notification:      'notification_logged',
  calculate_energy:      'energy_calculation',
  prepare_claim:         'claim_prepared',
  submit_claim:          'claim_submitted',
  acknowledge_review:    'under_review',
  raise_dispute:         'disputed',
  refer_to_arbitration:  'arbitration',
  settle:                'settled',
  reject:                'rejected',
  withdraw:              'withdrawn',
  cancel:                'cancelled',
  sla_breach:            'curtailment_detected',
};

// Regulator crossings
export function ecCrossesIntoRegulator(action: EcAction, tier: EcTier): boolean {
  // Arbitration referral always crosses NERSA
  if (action === 'refer_to_arbitration') return true;
  // Settlement of systemic/significant curtailment is NERSA reportable
  if (action === 'settle') return tier === 'systemic' || tier === 'significant';
  // Rejection of significant/systemic claim crosses NERSA
  if (action === 'reject') return tier === 'systemic';
  return false;
}

export function ecSlaBreachCrossesIntoRegulator(tier: EcTier): boolean {
  return tier === 'systemic' || tier === 'significant';
}
