// ═══════════════════════════════════════════════════════════════════════════════
// W229 — Virtual/Financial PPA Contract-for-Differences (CfD) Settlement
// Reconciliation Specification
//
// Legal: FMA 19/2012 Ch.IV (OTC derivative reporting), FSCA Conduct Standard
// 1/2020, IFRS 9 hedge accounting, ISDA Master Agreement determination protocol
// SLA: INVERTED — bigger differential = longer verification window (more
// scrutiny before a large sum changes hands)
// ═══════════════════════════════════════════════════════════════════════════════

export type SettlementStatus =
  | 'reference_price_pending' // period opened; awaiting floating reference index publication
  | 'calculated'              // differential computed (strike vs reference x notional)
  | 'statement_issued'        // settlement statement issued to both counterparties
  | 'payment_pending'         // acknowledged; payment due by sla_deadline
  | 'disputed'                // a counterparty disputes the calculated differential
  | 'recalculating'           // recalculation under way following dispute
  | 'isda_determination'      // escalated to ISDA Calculation Agent for binding determination
  | 'partially_settled'       // partial payment received; balance outstanding
  | 'overdue'                 // sla_deadline passed without full settlement
  | 'settled'                 // payment completed and confirmed; terminal
  | 'written_off'             // uncollectible balance written off; terminal
  | 'cancelled';              // statement voided before settlement; terminal

export type SettlementAction =
  | 'publish_reference_price'  // system/admin publishes the period's floating index → calculated
  | 'issue_statement'          // admin issues the settlement statement
  | 'acknowledge'              // counterparty acknowledges the calculated amount
  | 'dispute'                  // counterparty disputes the calculation
  | 'begin_recalculation'      // admin opens a recalculation against the dispute
  | 'escalate_to_isda'         // admin escalates an unresolved dispute to ISDA determination
  | 'confirm_recalculation'    // admin confirms the recalculated figure → reissues statement
  | 'record_payment'           // full payment confirmed
  | 'record_partial_payment'   // partial payment confirmed
  | 'mark_overdue'             // cron: sla_deadline passed → overdue
  | 'write_off'                // admin: uncollectible declaration
  | 'cancel'                   // admin: void statement before settlement
  | 'sla_breach';              // cron: SLA escalation marker

export type ReferenceIndex =
  | 'day_ahead_market'
  | 'eskom_megaflex'
  | 'ifrt_reference'
  | 'wholesale_pool';

export type PayingParty = 'generator' | 'offtaker';

export type SettlementTier = 'minor' | 'material' | 'large' | 'systemic';

// ── Differential calculation ────────────────────────────────────────────────
// Reference > strike  → the offtaker is "in the money": the generator (which
//   sold into the pool at the floating price) owes the offtaker the uplift.
// Strike > reference  → the generator is "in the money": the offtaker
//   (which is protected by the fixed strike) owes the generator the shortfall.
export function computeDifferential(
  notional_mwh: number,
  strike_price_zar_per_mwh: number,
  reference_price_zar_per_mwh: number,
) {
  const differential_zar_per_mwh = Math.round((reference_price_zar_per_mwh - strike_price_zar_per_mwh) * 100) / 100;
  const raw_amount_zar = Math.round(differential_zar_per_mwh * notional_mwh * 100) / 100;
  const paying_party: PayingParty = raw_amount_zar >= 0 ? 'generator' : 'offtaker';
  return {
    differential_zar_per_mwh,
    settlement_amount_zar: Math.abs(raw_amount_zar),
    paying_party,
  };
}

// Tier graduates by the absolute size of the period's differential — the
// figure that actually drives how much scrutiny THAT settlement needs,
// independent of the underlying contract's overall notional capacity.
export function deriveSettlementTier(settlement_amount_zar: number): SettlementTier {
  const abs = Math.abs(settlement_amount_zar);
  if (abs >= 50_000_000) return 'systemic';
  if (abs >= 10_000_000) return 'large';
  if (abs >= 1_000_000) return 'material';
  return 'minor';
}

// INVERTED SLA: larger differentials get the longest verification window —
// more money at stake means more time for both sides to check the math
// before it's due, not less.
export function deriveSlaWindowDays(tier: SettlementTier): number {
  const DAYS: Record<SettlementTier, number> = {
    minor: 5,
    material: 10,
    large: 15,
    systemic: 21,
  };
  return DAYS[tier];
}

export function slaDeadlineFor(tier: SettlementTier, fromIso: string): string {
  const days = deriveSlaWindowDays(tier);
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const SETTLEMENT_HARD_TERMINALS = new Set<SettlementStatus>([
  'settled', 'written_off', 'cancelled',
]);

export const SETTLEMENT_VALID_TRANSITIONS: Record<SettlementStatus, SettlementAction[]> = {
  reference_price_pending: ['publish_reference_price', 'cancel', 'sla_breach'],
  calculated:              ['issue_statement', 'cancel', 'sla_breach'],
  statement_issued:        ['acknowledge', 'dispute', 'cancel', 'sla_breach'],
  payment_pending:         ['record_payment', 'record_partial_payment', 'dispute', 'mark_overdue', 'sla_breach'],
  disputed:                ['begin_recalculation', 'escalate_to_isda', 'sla_breach'],
  recalculating:           ['confirm_recalculation', 'escalate_to_isda', 'sla_breach'],
  isda_determination:      ['confirm_recalculation', 'sla_breach'],
  partially_settled:       ['record_payment', 'mark_overdue', 'write_off', 'sla_breach'],
  overdue:                 ['record_payment', 'record_partial_payment', 'write_off', 'sla_breach'],
  settled:                 [],
  written_off:             [],
  cancelled:               [],
};

export const SETTLEMENT_STATE_TRANSITIONS: Record<SettlementAction, SettlementStatus> = {
  publish_reference_price: 'calculated',
  issue_statement:         'statement_issued',
  acknowledge:             'payment_pending',
  dispute:                 'disputed',
  begin_recalculation:     'recalculating',
  escalate_to_isda:        'isda_determination',
  confirm_recalculation:   'statement_issued',
  record_payment:          'settled',
  record_partial_payment:  'partially_settled',
  mark_overdue:            'overdue',
  write_off:               'written_off',
  cancel:                  'cancelled',
  sla_breach:              'overdue',
};

// Admin-only actions — counterparties cannot self-approve these
export const ADMIN_ONLY_ACTIONS = new Set<SettlementAction>([
  'publish_reference_price', 'issue_statement', 'begin_recalculation',
  'escalate_to_isda', 'confirm_recalculation', 'write_off', 'cancel',
]);

export function crossesIntoRegulator(action: SettlementAction, tier: SettlementTier): boolean {
  // Binding ISDA determination and write-offs always need FSCA/FMA-grade visibility
  if (action === 'escalate_to_isda') return true;
  if (action === 'write_off') return true;
  // Disputes over material sums surface early
  if (action === 'dispute') return tier === 'large' || tier === 'systemic';
  // Voiding a systemic-scale statement needs an audit trail
  if (action === 'cancel') return tier === 'systemic';
  // Systemic settlements clearing is itself a reportable event
  if (action === 'record_payment') return tier === 'systemic';
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SettlementTier): boolean {
  return tier === 'large' || tier === 'systemic';
}

export type SettlementEvent =
  | 'vppa_evt_opened'
  | 'vppa_evt_publish_reference_price'
  | 'vppa_evt_issue_statement'
  | 'vppa_evt_acknowledge'
  | 'vppa_evt_dispute'
  | 'vppa_evt_begin_recalculation'
  | 'vppa_evt_escalate_to_isda'
  | 'vppa_evt_confirm_recalculation'
  | 'vppa_evt_record_payment'
  | 'vppa_evt_record_partial_payment'
  | 'vppa_evt_mark_overdue'
  | 'vppa_evt_write_off'
  | 'vppa_evt_cancel'
  | 'vppa_evt_sla_breach';
