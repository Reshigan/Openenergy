// ═══════════════════════════════════════════════════════════════════════════
// subscription-billing — monthly sweep (runMonthlySubscriptionBilling).
//
// P0 defect: the `0 2 1 * *` cron ran regulator exports + audit cycle openers
// only and never generated monthly subscription invoices, so they had to be
// created one-at-a-time via admin POST /api/subscription/billing/generate.
// runMonthlySubscriptionBilling is the cron-callable helper that closes that
// gap. These tests pin its contract: enumerates active billable participants,
// is idempotent on (participant_id, billing_period), excludes free / suspended
// / rejected, and computes 15% VAT.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { runMonthlySubscriptionBilling } from '../src/routes/subscription-billing-chain';

let db: Database.Database;
let env: any;

function seedParticipant(id: string, tier: string, status: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, subscription_tier)
     VALUES (?, ?, 'pbkdf2$sha256$100000$c2FsdA==$ZXhwZWN0ZWQ=', ?, 'trader', ?, 'approved', ?)`,
  ).run(id, `${id}@test`, id, status, tier);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // The migration-replay seeds 10 demo participants with billable tiers; clear
  // them so each test controls exactly which participants are billable.
  db.prepare('DELETE FROM oe_subscription_invoices').run();
  db.prepare('DELETE FROM participants').run();
});
afterEach(() => { db.close(); });

describe('runMonthlySubscriptionBilling — generation', () => {
  it('generates one draft invoice per active billable participant', async () => {
    seedParticipant('p1', 'starter', 'active');
    seedParticipant('p2', 'professional', 'active');
    seedParticipant('p3', 'enterprise', 'active');
    const r = await runMonthlySubscriptionBilling(env, '2026-06');
    expect(r.generated).toBe(3);
    expect(r.skipped).toBe(0);

    const rows = db.prepare(
      `SELECT participant_id, billing_period, chain_status, subscription_tier
       FROM oe_subscription_invoices ORDER BY participant_id`,
    ).all() as any[];
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.chain_status === 'draft')).toBe(true);
    expect(rows.every((r) => r.billing_period === '2026-06')).toBe(true);
    expect(rows.map((r) => r.subscription_tier).sort()).toEqual(['enterprise', 'professional', 'starter']);
  });

  it('skips free, suspended, rejected and pending participants', async () => {
    seedParticipant('p_free', 'free', 'active');
    seedParticipant('p_susp', 'professional', 'suspended');
    seedParticipant('p_rej', 'enterprise', 'rejected');
    seedParticipant('p_pend', 'starter', 'pending');
    seedParticipant('p_ok', 'starter', 'active');
    const r = await runMonthlySubscriptionBilling(env, '2026-06');
    expect(r.generated).toBe(1);
    expect(r.skipped).toBe(0); // excluded tiers never reach the duplicate check
    const rows = db.prepare(`SELECT participant_id FROM oe_subscription_invoices`).all() as any[];
    expect(rows.map((r) => r.participant_id)).toEqual(['p_ok']);
  });

  it('defaults period to the current YYYY-MM when omitted', async () => {
    seedParticipant('p1', 'starter', 'active');
    const r = await runMonthlySubscriptionBilling(env);
    expect(r.generated).toBe(1);
    const expected = new Date().toISOString().slice(0, 7);
    const row = db.prepare(`SELECT billing_period FROM oe_subscription_invoices WHERE participant_id = 'p1'`).get() as any;
    expect(row.billing_period).toBe(expected);
  });

  it('computes amounts with 15% VAT per tier', async () => {
    seedParticipant('p_st', 'starter', 'active');
    seedParticipant('p_pr', 'professional', 'active');
    seedParticipant('p_en', 'enterprise', 'active');
    await runMonthlySubscriptionBilling(env, '2026-06');
    const rows = db.prepare(
      `SELECT subscription_tier, amount_zar, vat_zar, total_zar, net_payable_zar
       FROM oe_subscription_invoices ORDER BY subscription_tier`,
    ).all() as any[];
    const byTier = Object.fromEntries(rows.map((r) => [r.subscription_tier, r]));
    expect(byTier.starter.amount_zar).toBe(12_500);
    expect(byTier.starter.vat_zar).toBeCloseTo(1_875, 2);
    expect(byTier.starter.net_payable_zar).toBeCloseTo(14_375, 2);
    expect(byTier.professional.amount_zar).toBe(45_000);
    expect(byTier.professional.vat_zar).toBeCloseTo(6_750, 2);
    expect(byTier.professional.net_payable_zar).toBeCloseTo(51_750, 2);
    expect(byTier.enterprise.amount_zar).toBe(150_000);
    expect(byTier.enterprise.vat_zar).toBeCloseTo(22_500, 2);
    expect(byTier.enterprise.net_payable_zar).toBeCloseTo(172_500, 2);
  });
});

describe('runMonthlySubscriptionBilling — idempotency', () => {
  it('second run for the same period generates nothing and skips everyone', async () => {
    seedParticipant('p1', 'starter', 'active');
    seedParticipant('p2', 'professional', 'active');
    const r1 = await runMonthlySubscriptionBilling(env, '2026-06');
    expect(r1.generated).toBe(2);
    expect(r1.skipped).toBe(0);

    const r2 = await runMonthlySubscriptionBilling(env, '2026-06');
    expect(r2.generated).toBe(0);
    expect(r2.skipped).toBe(2);

    const count = db.prepare(`SELECT COUNT(*) AS n FROM oe_subscription_invoices`).get() as any;
    expect(count.n).toBe(2); // no new rows
  });

  it('a cancelled invoice for the period does NOT block regeneration', async () => {
    seedParticipant('p1', 'starter', 'active');
    // Pre-existing cancelled invoice — matches /generate semantics: cancelled
    // does not count as a duplicate, so the sweep should still generate.
    db.prepare(
      `INSERT INTO oe_subscription_invoices
       (id, participant_id, billing_period, subscription_tier, amount_zar, vat_zar, total_zar,
        net_payable_zar, line_items, chain_status, created_at, updated_at)
       VALUES ('sinv_pre', 'p1', '2026-06', 'starter', 0, 0, 0, 0, '[]', 'cancelled',
        datetime('now'), datetime('now'))`,
    ).run();
    const r = await runMonthlySubscriptionBilling(env, '2026-06');
    expect(r.generated).toBe(1);
    expect(r.skipped).toBe(0);
    const rows = db.prepare(
      `SELECT chain_status FROM oe_subscription_invoices WHERE participant_id = 'p1' ORDER BY created_at`,
    ).all() as any[];
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.chain_status).sort()).toEqual(['cancelled', 'draft']);
  });

  it('different periods generate independently', async () => {
    seedParticipant('p1', 'starter', 'active');
    const r1 = await runMonthlySubscriptionBilling(env, '2026-06');
    const r2 = await runMonthlySubscriptionBilling(env, '2026-07');
    expect(r1.generated).toBe(1);
    expect(r2.generated).toBe(1);
    const periods = db.prepare(
      `SELECT billing_period FROM oe_subscription_invoices WHERE participant_id = 'p1' ORDER BY billing_period`,
    ).all() as any[];
    expect(periods.map((r) => r.billing_period)).toEqual(['2026-06', '2026-07']);
  });
});

describe('runMonthlySubscriptionBilling — migration 520 fee_schedule row', () => {
  it('seeds the subscription invoice fee_schedule row idempotently', () => {
    const row = db.prepare(
      `SELECT id, fee_type, description FROM fee_schedule WHERE id = 'fee_sub_invoice'`,
    ).get() as any;
    expect(row).toBeTruthy();
    expect(row.fee_type).toBe('platform');
    expect(row.description).toMatch(/subscription/i);
  });
});