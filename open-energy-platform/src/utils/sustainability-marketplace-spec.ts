// ═══════════════════════════════════════════════════════════════════════════════
// W227 — Sustainability Marketplace Specification
// Unified cross-role marketplace: RECs, VCM credits, brokered CoA retirements
//
// Legal framework:
//  RECs:         I-REC Standard / GCC — secondary trading permitted
//  VCM credits:  Verra VCS v4.5 / GS4GG — free secondary market
//  Brokered CoA: Carbon Tax Act §13 — retirement on buyer's behalf, not resale
//  FSCA:         FMA 2012 — spot carbon credit transactions exempt from FSP
// ═══════════════════════════════════════════════════════════════════════════════

// ── Listing state machine ──────────────────────────────────────────────────────

export type ListingStatus =
  | 'draft'           // created, not yet publicly visible
  | 'active'          // publicly visible and purchaseable
  | 'partially_sold'  // some quantity sold, still available
  | 'sold_out'        // all quantity purchased; terminal
  | 'cancelled'       // seller withdrew; terminal
  | 'expired';        // passed listing_expiry; terminal

export type ListingAction =
  | 'activate'         // seller publishes the listing
  | 'mark_partial'     // system marks after a partial purchase
  | 'mark_sold_out'    // system marks when quantity exhausted
  | 'cancel'           // seller withdraws
  | 'expire'           // cron auto-expires after listing_expiry
  | 'sla_breach';

export type MarketplaceTier =
  | 'retail'       // < R100,000 listing value
  | 'commercial'   // R100,000 – R1,000,000
  | 'institutional';// > R1,000,000

export function deriveListingSla(tier: MarketplaceTier): number {
  // SLA on active listings = time window before escalation to platform review
  const DAYS: Record<MarketplaceTier, number> = {
    retail: 90, commercial: 60, institutional: 30,
  };
  return DAYS[tier] ?? 60;
}

export function deriveListingTier(totalValueZar: number): MarketplaceTier {
  if (totalValueZar >= 1_000_000) return 'institutional';
  if (totalValueZar >= 100_000)  return 'commercial';
  return 'retail';
}

export const LISTING_HARD_TERMINALS = new Set<ListingStatus>([
  'sold_out', 'cancelled', 'expired',
]);

export const LISTING_VALID_TRANSITIONS: Record<ListingStatus, ListingAction[]> = {
  draft:          ['activate', 'cancel', 'sla_breach'],
  active:         ['mark_partial', 'mark_sold_out', 'cancel', 'expire', 'sla_breach'],
  partially_sold: ['mark_sold_out', 'cancel', 'expire', 'sla_breach'],
  sold_out:       [],
  cancelled:      [],
  expired:        [],
};

export const LISTING_STATE_TRANSITIONS: Record<ListingAction, ListingStatus> = {
  activate:      'active',
  mark_partial:  'partially_sold',
  mark_sold_out: 'sold_out',
  cancel:        'cancelled',
  expire:        'expired',
  sla_breach:    'expired',
};

export function listingCrossesIntoRegulator(
  action: ListingAction,
  tier: MarketplaceTier,
): boolean {
  // Institutional listings that are cancelled or auto-expired surface for oversight
  if (action === 'cancel' || action === 'sla_breach') {
    return tier === 'institutional';
  }
  return false;
}

// ── Transaction state machine ──────────────────────────────────────────────────

export type TransactionStatus =
  | 'pending'             // buyer initiated, awaiting payment
  | 'payment_processing'  // payment instruction sent
  | 'payment_confirmed'   // payment received
  | 'settlement_pending'  // transferring holdings / executing retirement
  | 'settled'             // complete; terminal
  | 'failed'              // settlement failed; terminal
  | 'refunded'            // payment reversed; terminal
  | 'cancelled';          // cancelled before payment; terminal

export type TransactionAction =
  | 'initiate_payment'
  | 'confirm_payment'
  | 'begin_settlement'
  | 'complete_settlement'
  | 'fail_settlement'
  | 'refund'
  | 'cancel'
  | 'sla_breach';

export type TransactionUrgencyTier =
  | 'standard'    // portfolio_hold, < R500k
  | 'premium'     // portfolio_hold, >= R500k
  | 'retirement'; // brokered_retirement (any value — must be processed fast)

// URGENT SLA — retirement transactions tightest (chain of custody)
export function deriveTransactionSla(tier: TransactionUrgencyTier): number {
  const HOURS: Record<TransactionUrgencyTier, number> = {
    standard: 72, premium: 48, retirement: 24,
  };
  return HOURS[tier] ?? 48;
}

export function deriveTransactionTier(
  totalZar: number,
  disposition: 'portfolio_hold' | 'brokered_retirement',
): TransactionUrgencyTier {
  if (disposition === 'brokered_retirement') return 'retirement';
  if (totalZar >= 500_000) return 'premium';
  return 'standard';
}

export const TRANSACTION_HARD_TERMINALS = new Set<TransactionStatus>([
  'settled', 'failed', 'refunded', 'cancelled',
]);

export const TRANSACTION_VALID_TRANSITIONS: Record<TransactionStatus, TransactionAction[]> = {
  pending:             ['initiate_payment', 'cancel', 'sla_breach'],
  payment_processing:  ['confirm_payment', 'refund', 'sla_breach'],
  payment_confirmed:   ['begin_settlement', 'refund', 'sla_breach'],
  settlement_pending:  ['complete_settlement', 'fail_settlement', 'sla_breach'],
  settled:             [],
  failed:              [],
  refunded:            [],
  cancelled:           [],
};

export const TRANSACTION_STATE_TRANSITIONS: Record<TransactionAction, TransactionStatus> = {
  initiate_payment:    'payment_processing',
  confirm_payment:     'payment_confirmed',
  begin_settlement:    'settlement_pending',
  complete_settlement: 'settled',
  fail_settlement:     'failed',
  refund:              'refunded',
  cancel:              'cancelled',
  sla_breach:          'failed',
};

export function transactionCrossesIntoRegulator(
  action: TransactionAction,
  tier: TransactionUrgencyTier,
): boolean {
  // Failed settlements and SLA breaches surface for platform oversight
  if (action === 'fail_settlement') return true;
  if (action === 'sla_breach') return true;
  // Large completed brokered retirements for audit trail (UNFCCC Article 6 / SARS CoA)
  if (action === 'complete_settlement') return tier === 'retirement';
  return false;
}

export function transactionSlaBreachCrossesIntoRegulator(_tier: TransactionUrgencyTier): boolean {
  return true; // All marketplace settlement breaches are platform-reportable
}

// ── Platform fee schedule ──────────────────────────────────────────────────────

export const PLATFORM_FEE_PCT = 0.015; // 1.5% of transaction value

export function computePlatformFee(totalZar: number): number {
  return Math.round(totalZar * PLATFORM_FEE_PCT * 100) / 100;
}
