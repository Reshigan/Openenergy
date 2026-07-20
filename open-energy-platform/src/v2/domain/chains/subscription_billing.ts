// subscription_billing — the monthly platform-subscription invoice lifecycle as
// data.
//
// A billing operator raises a draft invoice against a subscriber for one billing
// period, issues it, and either records payment or — after the invoice has gone
// overdue — writes it off. The dunning gate is structural, not a guard: write_off
// leaves ONLY `overdue`, and the ONLY path into `overdue` is mark_overdue from
// `issued`. So a fresh (issued, not-yet-overdue) invoice can NEVER be written off
// — dunning must physically have happened first. No guard needed; the state graph
// enforces it. void_invoice / write_off are destructive and carry structured
// reason codes.
//
// settles:false — the chain is the record of the billing obligation and its
// resolution, not a payment rail. No custody, no money movement (R-S5-1); a
// recorded payment is an evidence event, not a settlement.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const VAT_RATE = 0.15; // SA standard-rated VAT.
const cents = (n: number): number => Math.round(n * 100) / 100; // deterministic, no clock/random.

// pure: VAT + gross off the ex-VAT amount. Non-numeric input yields zeros so an
// incomplete draft still coerces cleanly (the required-field engine step gates it).
const totals = (amount: Json | undefined): { vat_zar: number; total_zar: number } => {
  const a = typeof amount === 'number' ? amount : 0;
  const vat = cents(a * VAT_RATE);
  return { vat_zar: vat, total_zar: cents(a + vat) };
};

export const subscriptionBilling: ChainDecl = {
  key: 'subscription_billing',
  noun: 'Subscription invoice',
  refPrefix: 'SB',
  title: (f) =>
    `Subscription invoice ${(f.billing_period as string) ?? '????-??'} — ${(f.plan_name as string) ?? 'unnamed plan'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Value-Added Tax Act 1991', provision: 's7 standard-rated supply', effect: 'requires' },
  ],
  roles: ['operator', 'subscriber'],

  fields: {
    invoice_number: { type: 'string', label: 'Invoice number' },
    subscriber_party: { type: 'party', role: 'subscriber', label: 'Subscriber' },
    plan_name: { type: 'string', required: true, label: 'Plan' },
    billing_period: { type: 'string', required: true, label: 'Billing period (YYYY-MM)' },
    amount_zar: { type: 'number', min: 0, required: true, label: 'Amount ex-VAT (ZAR)' },
    vat_zar: { type: 'number', label: 'VAT (ZAR)' },
    total_zar: { type: 'number', label: 'Total incl. VAT (ZAR)' },
    payment_ref: { type: 'string', label: 'Payment reference' },
    dunning_count: { type: 'number', label: 'Times marked overdue' },
    // written by derive, never by the client
    issued_at: { type: 'string', label: 'Issued at' },
    paid_at: { type: 'string', label: 'Paid at' },
    written_off_at: { type: 'string', label: 'Written off at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'operator', sla: { hours: 24 } },
    issued: { label: 'Issued', terminal: false, holder: 'subscriber', sla: { days: 30 } },
    overdue: { label: 'Overdue', terminal: false, holder: 'subscriber', sla: { days: 7 } },
    paid: { label: 'Paid', terminal: true, holder: 'none' },
    written_off: { label: 'Written off', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['operator'],
      actorBecomes: 'operator',
      label: 'Raise invoice',
      intent: 'primary',
      input: {
        subscriber_party: { type: 'party', role: 'subscriber' },
        plan_name: { type: 'string', required: true },
        billing_period: { type: 'string', required: true },
        amount_zar: { type: 'number', min: 0, required: true },
      },
      guards: [],
      derive: (f, _at: Instant) => totals(f.amount_zar),
    },
    {
      id: 'issue_invoice',
      from: 'draft',
      to: 'issued',
      by: ['operator'],
      label: 'Issue invoice',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },
    {
      // structural dunning gate: the ONLY edge into overdue, from issued only.
      // An invoice therefore cannot be written off until it has gone overdue.
      id: 'mark_overdue',
      from: 'issued',
      to: 'overdue',
      by: ['operator', 'system'],
      label: 'Mark overdue',
      intent: 'secondary',
      guards: [],
      derive: (f, _at: Instant) => ({
        dunning_count: (typeof f.dunning_count === 'number' ? f.dunning_count : 0) + 1,
      }),
    },
    {
      id: 'record_payment',
      from: ['issued', 'overdue'],
      to: 'paid',
      by: ['operator', 'subscriber'],
      label: 'Record payment',
      intent: 'primary',
      input: { payment_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ paid_at: isoUtc(at) }),
    },

    // --- destructive exits ----------------------------------------------------
    {
      // only from overdue — dunning must have run (structural gate above).
      id: 'write_off',
      from: 'overdue',
      to: 'written_off',
      by: ['operator'],
      label: 'Write off',
      intent: 'destructive',
      requiresReason: ['uncollectable', 'subscriber_insolvent', 'disputed_withdrawn', 'goodwill'],
      guards: [],
      derive: (_f, at: Instant) => ({ written_off_at: isoUtc(at) }),
    },
    {
      id: 'void_invoice',
      from: ['draft', 'issued'],
      to: 'voided',
      by: ['operator'],
      label: 'Void invoice',
      intent: 'destructive',
      requiresReason: ['billing_error', 'duplicate', 'plan_cancelled', 'credit_note_issued'],
      guards: [],
    },
  ],

  // payment-due time bar: an issued invoice left unpaid crosses into overdue.
  // record-only stub — the sweep computes the real bar off the issued-state sla.
  timers: [{ onState: 'issued', after: { days: 30 }, fire: 'mark_overdue', kind: 'time_bar' }],
};
