import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { computeFees, loadSettlementFeeRates, type InvoiceShape } from '../src/utils/settlement-fees';
import { createTestDb, envFor } from './helpers/d1-sqlite';

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

// ═══════════════════════════════════════════════════════════════════════════
// P1 unification — hardcoded v1 rates are now the SAFETY FALLBACK. The caller
// can resolve operator-configurable overrides from oe_fee_schedule via
// loadSettlementFeeRates and pass them via opts.rates. Absent/disabled rows
// fall back to the hardcoded v1 values (2% dunning, 0.05%/day late).
// ═══════════════════════════════════════════════════════════════════════════
describe('settlement-fees — configurable rate overrides with v1 fallback', () => {
  it('uses the v1 hardcoded fallback when no opts.rates given (backwards compatible)', () => {
    // 10 days overdue: dunning 2% × 100 000 = 2 000; late 0.05% × 10 × 100 000 = 500.
    const fees = computeFees({ now: new Date('2026-05-11T17:00:00Z'), invoice: baseInvoice() });
    const dunning = fees.find((f) => f.fee_type === 'dunning');
    const late = fees.find((f) => f.fee_type === 'late_payment');
    expect(dunning?.amount_zar).toBe(2000);
    expect(late?.amount_zar).toBe(500);
  });

  it('applies an operator-configurable dunning override', () => {
    // 3% dunning on 100 000 = 3 000 (7+ days overdue).
    const fees = computeFees(
      { now: new Date('2026-05-11T17:00:00Z'), invoice: baseInvoice() },
      { rates: { dunningPct: 0.03 } },
    );
    expect(fees.find((f) => f.fee_type === 'dunning')?.amount_zar).toBe(3000);
    // late still uses fallback 0.05%
    expect(fees.find((f) => f.fee_type === 'late_payment')?.amount_zar).toBe(500);
  });

  it('applies an operator-configurable late-rate override', () => {
    // 0.1%/day × 10 × 100 000 = 1 000; dunning falls back to 2% = 2 000.
    const fees = computeFees(
      { now: new Date('2026-05-11T17:00:00Z'), invoice: baseInvoice() },
      { rates: { lateRatePerDay: 0.001 } },
    );
    expect(fees.find((f) => f.fee_type === 'late_payment')?.amount_zar).toBe(1000);
    expect(fees.find((f) => f.fee_type === 'dunning')?.amount_zar).toBe(2000);
  });

  it('label reflects the configured rate, not the hardcoded 2%/0.05%', () => {
    const fees = computeFees(
      { now: new Date('2026-05-11T17:00:00Z'), invoice: baseInvoice() },
      { rates: { dunningPct: 0.03, lateRatePerDay: 0.001 } },
    );
    const dunning = fees.find((f) => f.fee_type === 'dunning');
    const late = fees.find((f) => f.fee_type === 'late_payment');
    expect(dunning?.basis).toMatch(/^3% of/);
    expect(late?.reason).toMatch(/@ 0\.1%$/);
  });
});

describe('loadSettlementFeeRates — oe_fee_schedule lookup', () => {
  let db: Database.Database;
  let d1: Record<string, unknown>;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); d1 = envFor(db).DB; });
  afterEach(() => { db.close(); });

  it('returns empty overrides when no settlement.dunning / settlement.late_payment rows exist (v1 fallback)', async () => {
    const rates = await loadSettlementFeeRates(d1 as any);
    expect(rates.dunningPct).toBeUndefined();
    expect(rates.lateRatePerDay).toBeUndefined();
  });

  it('picks up an enabled pct row for settlement.dunning', async () => {
    db.prepare(
      `INSERT INTO oe_fee_schedule (id, trigger_event, fee_type, rate, is_enabled, payer_resolution)
       VALUES (?, ?, 'pct', ?, 1, 'initiator')`,
    ).run('f_sd', 'settlement.dunning', 0.025);
    const rates = await loadSettlementFeeRates(d1 as any);
    expect(rates.dunningPct).toBe(0.025);
  });

  it('ignores a disabled row (falls back to hardcoded)', async () => {
    db.prepare(
      `INSERT INTO oe_fee_schedule (id, trigger_event, fee_type, rate, is_enabled, payer_resolution)
       VALUES (?, ?, 'pct', ?, 0, 'initiator')`,
    ).run('f_sd', 'settlement.dunning', 0.09);
    const rates = await loadSettlementFeeRates(d1 as any);
    expect(rates.dunningPct).toBeUndefined();
  });

  it('ignores a non-pct row (dunning/late are fractions, not bps/flat)', async () => {
    db.prepare(
      `INSERT INTO oe_fee_schedule (id, trigger_event, fee_type, rate, is_enabled, payer_resolution)
       VALUES (?, ?, 'flat_zar', ?, 1, 'initiator')`,
    ).run('f_sd', 'settlement.dunning', 999);
    const rates = await loadSettlementFeeRates(d1 as any);
    expect(rates.dunningPct).toBeUndefined();
  });
});
