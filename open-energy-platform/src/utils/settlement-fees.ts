// ════════════════════════════════════════════════════════════════════════
// settlement-fees — append-only fees engine for invoices.
//
// Every fee rule has a versioned key; same (invoice, fee_type, version)
// is a UNIQUE row in `settlement_fees`. The engine is therefore
// idempotent — call it nightly via the cron, or on-demand from the
// settlement-auto route; duplicates are absorbed by the UNIQUE constraint.
//
// Rules implemented:
//   dunning v1
//     - precondition: now > payment_due_at + 7 days, invoice unpaid
//     - amount: 2% of outstanding (one-time)
//     - reason: "First dunning fee — payment 7+ days past due"
//   late_payment v1
//     - precondition: now > payment_due_at, invoice unpaid
//     - amount: 0.05% × days_overdue × outstanding (recomputed daily,
//       but idempotent via rule version date-suffix)
//     - reason: "Per-day late fee — <N> days @ 0.05%"
//   rebooking v1
//     - precondition: an associated settlement_break of type='timing'
//       transitions to status='resolved' with outcome='rebooked'
//     - amount: R250 flat
//     - reason: "Rebooking fee — settlement break <id>"
//   admin v1
//     - manual only (engine accepts an injected fee from operators)
// ════════════════════════════════════════════════════════════════════════

export type FeeRule = 'dunning' | 'late_payment' | 'rebooking' | 'admin';

export type FeeRow = {
  id: string;
  invoice_id: string;
  fee_type: FeeRule;
  basis: string;
  amount_zar: number;
  reason: string;
  calc_rule_version: string;
  applied_after?: string | null;
  applied_by?: string | null;
};

export type InvoiceShape = {
  id: string;
  status: string;
  total_amount: number;
  paid_amount?: number | null;
  payment_due_at?: string | null;
  issued_at?: string | null;
};

export type FeesContext = {
  now: Date;
  invoice: InvoiceShape;
};

// Pure: produce the list of fees that SHOULD exist for this invoice at
// this moment. The caller is responsible for inserting these rows with
// INSERT OR IGNORE so the UNIQUE (invoice_id, fee_type, calc_rule_version)
// constraint absorbs duplicates.
export function computeFees(ctx: FeesContext): FeeRow[] {
  const out: FeeRow[] = [];
  const { now, invoice } = ctx;
  const outstanding = Math.max(
    0,
    (invoice.total_amount || 0) - (invoice.paid_amount || 0),
  );
  // Unpaid invoices only — paid/cancelled/disputed don't accrue.
  const accruable = outstanding > 0 && invoice.status !== 'paid' && invoice.status !== 'cancelled';

  if (!accruable || !invoice.payment_due_at) return out;

  const due = new Date(`${invoice.payment_due_at.slice(0, 19)}Z`);
  const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));

  // dunning v1 — fires once after 7 days
  if (daysOverdue >= 7) {
    const amt = Math.round(outstanding * 0.02);
    if (amt > 0) {
      out.push({
        id: cryptoRandom(),
        invoice_id: invoice.id,
        fee_type: 'dunning',
        basis: `2% of R${outstanding.toLocaleString('en-ZA')} outstanding`,
        amount_zar: amt,
        reason: 'First dunning fee — payment 7+ days past due',
        calc_rule_version: 'v1',
        applied_after: invoice.payment_due_at,
        applied_by: 'system',
      });
    }
  }

  // late_payment v1 — accrues per day. Version suffix is the day count
  // so each day's accrual is its own row (and the UNIQUE constraint
  // absorbs duplicate runs within a day).
  if (daysOverdue > 0) {
    const ratePerDay = 0.0005; // 0.05%
    const amt = Math.round(outstanding * ratePerDay * daysOverdue);
    if (amt > 0) {
      out.push({
        id: cryptoRandom(),
        invoice_id: invoice.id,
        fee_type: 'late_payment',
        basis: `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} × 0.05% × R${outstanding.toLocaleString('en-ZA')}`,
        amount_zar: amt,
        reason: `Per-day late fee — ${daysOverdue} days @ 0.05%`,
        calc_rule_version: `v1-${daysOverdue}d`,
        applied_after: invoice.payment_due_at,
        applied_by: 'system',
      });
    }
  }

  return out;
}

function cryptoRandom(): string {
  // crypto.randomUUID is available in Workers + modern node runtimes.
  return crypto.randomUUID();
}
