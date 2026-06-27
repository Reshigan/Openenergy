// ═══════════════════════════════════════════════════════════════════════════════
// W228 — Platform Subscription Billing & Invoice Lifecycle Specification
//
// Legal: CPA §16-17, ECT Act §46-50, IFRS 15, POPIA §19
// SLA: INVERTED — enterprise longest window (biggest clients, most scrutiny)
// ═══════════════════════════════════════════════════════════════════════════════

export type InvoiceStatus =
  | 'draft'           // generated, not yet sent to participant
  | 'issued'          // sent, awaiting acknowledgement
  | 'payment_pending' // acknowledged, payment expected by sla_deadline
  | 'paid'            // payment confirmed; terminal
  | 'overdue'         // sla_deadline passed, no payment
  | 'dunning_1'       // first formal notice sent
  | 'dunning_2'       // final notice sent before suspension
  | 'suspended'       // account suspended; terminal
  | 'cancelled'       // voided before payment; terminal
  | 'waived'          // debt forgiven; terminal
  | 'written_off';    // uncollectible; terminal

export type InvoiceAction =
  | 'issue'           // send draft → issued
  | 'acknowledge'     // participant confirms receipt → payment_pending
  | 'record_payment'  // payment confirmed → paid
  | 'mark_overdue'    // cron: deadline passed → overdue
  | 'send_dunning_1'  // cron: first dunning → dunning_1
  | 'send_dunning_2'  // cron: final dunning → dunning_2
  | 'suspend_account' // cron/admin: non-payment → suspended
  | 'reactivate'      // admin: reinstate after payment arrangement
  | 'waive'           // admin: forgive debt
  | 'write_off'       // admin: uncollectible declaration
  | 'cancel'          // admin: void invoice
  | 'sla_breach';     // cron: SLA escalation marker

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

// Monthly subscription amounts (ZAR excl. VAT)
export const SUBSCRIPTION_AMOUNTS_ZAR: Record<SubscriptionTier, number> = {
  starter:      12_500,
  professional: 45_000,
  enterprise:  150_000,
};

export const VAT_RATE = 0.15;

export function computeInvoiceAmounts(tier: SubscriptionTier, discount_zar = 0) {
  const amount = SUBSCRIPTION_AMOUNTS_ZAR[tier];
  const vat = Math.round(amount * VAT_RATE * 100) / 100;
  const total = amount + vat;
  const net_payable = Math.max(0, total - discount_zar);
  return { amount_zar: amount, vat_zar: vat, total_zar: total, net_payable_zar: net_payable };
}

// INVERTED SLA: enterprise gets longest window (more scrutiny before suspension)
export function deriveSlaWindowDays(tier: SubscriptionTier): number {
  const DAYS: Record<SubscriptionTier, number> = {
    starter:      7,
    professional: 14,
    enterprise:   21,
  };
  return DAYS[tier];
}

// 'suspended' is a recoverable hold state (reactivate / write_off lead out of
// it), NOT a terminal — listing it here dead-ends those transitions.
export const INVOICE_HARD_TERMINALS = new Set<InvoiceStatus>([
  'paid', 'cancelled', 'waived', 'written_off',
]);

export const INVOICE_VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceAction[]> = {
  draft:           ['issue', 'cancel', 'sla_breach'],
  issued:          ['acknowledge', 'cancel', 'sla_breach'],
  payment_pending: ['record_payment', 'mark_overdue', 'waive', 'cancel', 'sla_breach'],
  paid:            [],
  overdue:         ['record_payment', 'send_dunning_1', 'waive', 'write_off', 'sla_breach'],
  dunning_1:       ['record_payment', 'send_dunning_2', 'waive', 'write_off', 'sla_breach'],
  dunning_2:       ['record_payment', 'suspend_account', 'waive', 'write_off', 'sla_breach'],
  suspended:       ['reactivate', 'write_off'],
  cancelled:       [],
  waived:          [],
  written_off:     [],
};

export const INVOICE_STATE_TRANSITIONS: Record<InvoiceAction, InvoiceStatus> = {
  issue:           'issued',
  acknowledge:     'payment_pending',
  record_payment:  'paid',
  mark_overdue:    'overdue',
  send_dunning_1:  'dunning_1',
  send_dunning_2:  'dunning_2',
  suspend_account: 'suspended',
  reactivate:      'issued',
  waive:           'waived',
  write_off:       'written_off',
  cancel:          'cancelled',
  sla_breach:      'dunning_1',
};

// Admin-only actions — participants cannot self-approve these
export const ADMIN_ONLY_ACTIONS = new Set<InvoiceAction>([
  'suspend_account', 'reactivate', 'waive', 'write_off',
]);

// INVERTED SLA: enterprise gets longest window before escalation
export function slaDeadlineFor(tier: SubscriptionTier, issuedAt: string): string {
  const days = deriveSlaWindowDays(tier);
  const d = new Date(issuedAt);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function crossesIntoRegulator(
  action: InvoiceAction,
  tier: SubscriptionTier,
): boolean {
  // Suspension and write-off always surface for platform oversight
  if (action === 'suspend_account') return true;
  if (action === 'write_off') return true;
  // Reactivation of enterprise accounts needs admin visibility
  if (action === 'reactivate') return tier === 'enterprise';
  // Large enterprise invoices going overdue surface early
  if (action === 'mark_overdue') return tier === 'enterprise';
  return false;
}

export function slaBreachCrossesIntoRegulator(_tier: SubscriptionTier): boolean {
  return true; // All billing SLA breaches surface for revenue ops visibility
}

export type InvoiceEvent =
  | 'billing_evt_generated'
  | 'billing_evt_issued'
  | 'billing_evt_acknowledged'
  | 'billing_evt_paid'
  | 'billing_evt_overdue'
  | 'billing_evt_dunning_1'
  | 'billing_evt_dunning_2'
  | 'billing_evt_suspended'
  | 'billing_evt_reactivated'
  | 'billing_evt_waived'
  | 'billing_evt_written_off'
  | 'billing_evt_cancelled'
  | 'billing_evt_sla_breach';
