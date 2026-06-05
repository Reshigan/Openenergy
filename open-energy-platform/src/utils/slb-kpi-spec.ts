// ═══════════════════════════════════════════════════════════════════════════════
// W204 — Offtaker SLB KPI & Sustainability-Linked PPA Ratchet
// ICMA SLB Principles 2023 + JSE Sustainability Rules + NERSA ERA §4
// ═══════════════════════════════════════════════════════════════════════════════

export type SlbStatus =
  | 'kpi_pending'          // period open; KPI measurement not yet started
  | 'kpi_measurement'      // collecting meter / Solax data
  | 'kpi_verification'     // independent verifier reviewing
  | 'kpi_certified'        // verifier sign-off
  | 'ratchet_calculation'  // coupon step / tariff ratchet being computed
  | 'ratchet_agreed'       // counterparties agree to ratchet amount
  | 'ratchet_disputed'     // dispute raised on ratchet quantum
  | 'arbitration'          // external arbitration
  | 'ratchet_applied'      // ratchet posted to PPA; terminal +
  | 'ratchet_waived'       // mutually waived; terminal +
  | 'kpi_missed'           // KPI missed; step-up applied; terminal —
  | 'withdrawn';           // withdrawn; terminal

export type SlbAction =
  | 'start_measurement'
  | 'submit_kpi_data'
  | 'request_verification'
  | 'certify_kpi'
  | 'calculate_ratchet'
  | 'agree_ratchet'
  | 'raise_dispute'
  | 'refer_to_arbitration'
  | 'resolve_arbitration'
  | 'apply_ratchet'
  | 'waive_ratchet'
  | 'record_kpi_miss'
  | 'withdraw'
  | 'sla_breach';

export type SlbTier = 'voluntary' | 'green_finance' | 'listed' | 'regulatory';

// INVERTED SLA: larger / regulatory-grade KPI schemes get more time
export function deriveSlbSla(tier: SlbTier): number {
  const DAYS: Record<SlbTier, number> = {
    voluntary:    30,
    green_finance: 45,
    listed:       60,
    regulatory:   90,
  };
  return DAYS[tier] ?? 45;
}

export const SLB_HARD_TERMINALS = new Set<SlbStatus>([
  'ratchet_applied', 'ratchet_waived', 'kpi_missed', 'withdrawn',
]);

export const SLB_VALID_TRANSITIONS: Record<SlbStatus, SlbAction[]> = {
  kpi_pending:         ['start_measurement', 'sla_breach'],
  kpi_measurement:     ['submit_kpi_data', 'record_kpi_miss', 'sla_breach'],
  kpi_verification:    ['request_verification', 'certify_kpi', 'record_kpi_miss', 'sla_breach'],
  kpi_certified:       ['calculate_ratchet', 'sla_breach'],
  ratchet_calculation: ['agree_ratchet', 'raise_dispute', 'sla_breach'],
  ratchet_agreed:      ['apply_ratchet', 'waive_ratchet', 'sla_breach'],
  ratchet_disputed:    ['refer_to_arbitration', 'agree_ratchet', 'sla_breach'],
  arbitration:         ['resolve_arbitration', 'sla_breach'],
  ratchet_applied:     [],
  ratchet_waived:      [],
  kpi_missed:          [],
  withdrawn:           [],
};

export const SLB_STATE_TRANSITIONS: Record<SlbAction, SlbStatus> = {
  start_measurement:      'kpi_measurement',
  submit_kpi_data:        'kpi_verification',
  request_verification:   'kpi_verification',
  certify_kpi:            'kpi_certified',
  calculate_ratchet:      'ratchet_calculation',
  agree_ratchet:          'ratchet_agreed',
  raise_dispute:          'ratchet_disputed',
  refer_to_arbitration:   'arbitration',
  resolve_arbitration:    'ratchet_agreed',
  apply_ratchet:          'ratchet_applied',
  waive_ratchet:          'ratchet_waived',
  record_kpi_miss:        'kpi_missed',
  withdraw:               'withdrawn',
  sla_breach:             'kpi_pending',
};

// Regulator crossing (JSE + NERSA)
export function slbCrossesIntoRegulator(action: SlbAction, tier: SlbTier): boolean {
  // arbitration always crosses regulator for all tiers (signature)
  if (action === 'refer_to_arbitration') return true;
  // kpi_missed, apply_ratchet, waive_ratchet → listed + regulatory only
  if (['record_kpi_miss', 'apply_ratchet', 'waive_ratchet'].includes(action)) {
    return tier === 'listed' || tier === 'regulatory';
  }
  return false;
}

export function slbSlaBreachCrossesIntoRegulator(tier: SlbTier): boolean {
  return tier === 'listed' || tier === 'regulatory';
}
