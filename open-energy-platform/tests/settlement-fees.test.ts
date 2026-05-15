import { describe, it, expect } from 'vitest';
import { computeFees, type InvoiceShape } from '../src/utils/settlement-fees';

const baseInvoice = (overrides: Partial<InvoiceShape> = {}): InvoiceShape => ({
  id: 'inv_1',
  status: 'issued',
  total_amount: 100000,
  paid_amount: 0,
  payment_due_at: '2026-05-01T17:00:00Z',
  issued_at: '2026-04-20T12:00:00Z',
  ...overrides,
});

describe('settlement-fees engine', () => {
  it('returns no fees when not yet overdue', () => {
    const fees = computeFees({ now: new Date('2026-04-30T12:00:00Z'), invoice: baseInvoice() });
    expect(fees).toHaveLength(0);
  });

  it('emits a dunning fee at 7+ days past due', () => {
    const fees = computeFees({ now: new Date('2026-05-08T18:00:00Z'), invoice: baseInvoice() });
    const dunning = fees.find((f) => f.fee_type === 'dunning');
    expect(dunning).toBeDefined();
    expect(dunning?.amount_zar).toBe(2000); // 2% of 100 000
    expect(dunning?.calc_rule_version).toBe('v1');
  });

  it('does not emit a dunning fee at exactly 6 days past due', () => {
    const fees = computeFees({ now: new Date('2026-05-07T12:00:00Z'), invoice: baseInvoice() });
    expect(fees.find((f) => f.fee_type === 'dunning')).toBeUndefined();
  });

  it('emits a per-day late fee for every day past due', () => {
    // 10 days overdue: 0.05% × 10 × 100 000 = 500
    const fees = computeFees({ now: new Date('2026-05-11T17:00:00Z'), invoice: baseInvoice() });
    const late = fees.find((f) => f.fee_type === 'late_payment');
    expect(late).toBeDefined();
    expect(late?.amount_zar).toBe(500);
    expect(late?.calc_rule_version).toBe('v1-10d');
  });

  it('rule version differs by day so each day produces a fresh idempotent row', () => {
    const day8 = computeFees({ now: new Date('2026-05-09T17:00:00Z'), invoice: baseInvoice() });
    const day9 = computeFees({ now: new Date('2026-05-10T17:00:00Z'), invoice: baseInvoice() });
    const lateDay8 = day8.find((f) => f.fee_type === 'late_payment');
    const lateDay9 = day9.find((f) => f.fee_type === 'late_payment');
    expect(lateDay8?.calc_rule_version).not.toBe(lateDay9?.calc_rule_version);
  });

  it('skips fees on paid invoices', () => {
    const fees = computeFees({
      now: new Date('2026-05-15T17:00:00Z'),
      invoice: baseInvoice({ status: 'paid', paid_amount: 100000 }),
    });
    expect(fees).toHaveLength(0);
  });

  it('skips fees when invoice is fully paid even if status still says issued', () => {
    const fees = computeFees({
      now: new Date('2026-05-15T17:00:00Z'),
      invoice: baseInvoice({ paid_amount: 100000 }),
    });
    expect(fees).toHaveLength(0);
  });

  it('emits fees only on the unpaid portion of a partially-paid invoice', () => {
    // 100 000 total, 30 000 paid → outstanding 70 000; 10 days overdue
    // late fee = 0.05% × 10 × 70 000 = 350; dunning = 2% × 70 000 = 1 400.
    const fees = computeFees({
      now: new Date('2026-05-11T17:00:00Z'),
      invoice: baseInvoice({ paid_amount: 30000 }),
    });
    const dunning = fees.find((f) => f.fee_type === 'dunning');
    const late = fees.find((f) => f.fee_type === 'late_payment');
    expect(dunning?.amount_zar).toBe(1400);
    expect(late?.amount_zar).toBe(350);
  });

  it('does not emit fees on cancelled invoices', () => {
    const fees = computeFees({
      now: new Date('2026-05-15T17:00:00Z'),
      invoice: baseInvoice({ status: 'cancelled' }),
    });
    expect(fees).toHaveLength(0);
  });
});
