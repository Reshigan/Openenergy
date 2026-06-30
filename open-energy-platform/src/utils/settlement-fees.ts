// ════════════════════════════════════════════════════════════════════════
// settlement-fees — append-only fees engine for invoices.
//
// Every fee rule has a versioned key; same (invoice, fee_type, version)
// is a UNIQUE row in `settlement_fees`. The engine is therefore
// idempotent — call it nightly via the cron, or on-demand from the
// settlement-auto route; duplicates are absorbed by the UNIQUE constraint.
//
// Rates: the hardcoded v1 values below are the SAFETY FALLBACK. The caller
// can resolve overrides from oe_fee_schedule (see loadSettlementFeeRates)
// and pass them via opts.rates — when a row is absent or disabled, the
// fallback applies. One source of truth: oe_fee_schedule wins when live.
//
// Rules implemented:
//   dunning v1
//     - precondition: now > payment_due_at + 7 days, invoice unpaid
//     - amount: 2% of outstanding (one-time) [dunningPct, fallback 0.02]
//     - reason: "First dunning fee — payment 7+ days past due"
//   late_payment v1
//     - precondition: now > payment_due_at, invoice unpaid
//     - amount: 0.05% × days_overdue × outstanding (recomputed daily,
//       but idempotent via rule version date-suffix) [lateRatePerDay, 0.0005]
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

// Operator-configurable overrides resolved from oe_fee_schedule (see
// loadSettlementFeeRates). Absent/disabled rows fall back to the hardcoded
// v1 defaults below — safety net so the engine always bills something sane.
export interface SettlementFeeRates {
  dunningPct?: number;     // fraction of outstanding, default 0.02
  lateRatePerDay?: number; // fraction per day, default 0.0005
}

export interface FeesOptions {
  rates?: SettlementFeeRates;
}

interface FeeScheduleLookup {
  prepare: (q: string) => { bind: (...a: unknown[]) => { first: () => Promise<unknown> } };
}

// Read the configurable rates from oe_fee_schedule. Looks up the
// settlement.dunning + settlement.late_payment trigger_events. Returns only
// the rates whose row is is_enabled=1; the caller merges with hardcoded
// fallbacks. No rows → empty object → pure v1 fallback behaviour.
export async function loadSettlementFeeRates(db: FeeScheduleLookup): Promise<SettlementFeeRates> {
  const out: SettlementFeeRates = {};
  const dunning = await db.prepare(`SELECT rate, is_enabled, fee_type FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind('settlement.dunning').first() as { rate: number; is_enabled: number; fee_type: string } | null;
  if (dunning && dunning.is_enabled === 1 && dunning.fee_type === 'pct') {
    out.dunningPct = dunning.rate;
  }
  const late = await db.prepare(`SELECT rate, is_enabled, fee_type FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind('settlement.late_payment').first() as { rate: number; is_enabled: number; fee_type: string } | null;
  if (late && late.is_enabled === 1 && late.fee_type === 'pct') {
    out.lateRatePerDay = late.rate;
  }
  return out;
}

// Pure: produce the list of fees that SHOULD exist for this invoice at
// this moment. The caller is responsible for inserting these rows with
// INSERT OR IGNORE so the UNIQUE (invoice_id, fee_type, calc_rule_version)
// constraint absorbs duplicates.
export function computeFees(ctx: FeesContext, opts: FeesOptions = {}): FeeRow[] {
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

  // v1 hardcoded fallbacks — used when oe_fee_schedule has no enabled row.
  const dunningPct = opts.rates?.dunningPct ?? 0.02;
  const lateRatePerDay = opts.rates?.lateRatePerDay ?? 0.0005;
  const dunningPctBps = Math.round(dunningPct * 10000) / 100; // for the basis label, 2% → "2%"

  // dunning v1 — fires once after 7 days
  if (daysOverdue >= 7) {
    const amt = Math.round(outstanding * dunningPct);
    if (amt > 0) {
      out.push({
        id: cryptoRandom(),
        invoice_id: invoice.id,
        fee_type: 'dunning',
        basis: `${dunningPctBps}% of R${outstanding.toLocaleString('en-ZA')} outstanding`,
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
    const amt = Math.round(outstanding * lateRatePerDay * daysOverdue);
    if (amt > 0) {
      const latePctBps = Math.round(lateRatePerDay * 10000) / 100; // 0.05%
      out.push({
        id: cryptoRandom(),
        invoice_id: invoice.id,
        fee_type: 'late_payment',
        basis: `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} × ${latePctBps}% × R${outstanding.toLocaleString('en-ZA')}`,
        amount_zar: amt,
        reason: `Per-day late fee — ${daysOverdue} days @ ${latePctBps}%`,
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
