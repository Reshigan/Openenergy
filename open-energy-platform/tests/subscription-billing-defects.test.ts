// ═══════════════════════════════════════════════════════════════════════════
// subscription-billing — two governed-chain defects (defect-hunt TDD).
//
// 1. sla_breach REWIND: INVOICE_STATE_TRANSITIONS maps sla_breach → 'dunning_1'.
//    The action is documented as an "SLA escalation marker" (a flag), and the
//    real dunning escalation runs through the dedicated send_dunning_1/2 actions
//    in the cron sweep. Firing sla_breach via the action route REWINDS dunning_2
//    back to dunning_1 (and jumps draft/issued forward). It must hold position
//    and only raise sla_breached — same invariant as every other chain.
//
// 2. SUSPENDED dead-end: 'suspended' was listed in INVOICE_HARD_TERMINALS, so the
//    terminal guard rejected every action from it — yet the spec defines
//    reactivate/write_off transitions out of suspended. A suspended account could
//    never be reinstated or written off. suspended is a recoverable hold state,
//    not a terminal.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import billing from '../src/routes/subscription-billing-chain';

let db: Database.Database;
let env: Record<string, unknown>;

function seedInvoice(id: string, chain_status: string, extra = '') {
  db.prepare(`INSERT INTO oe_subscription_invoices
    (id, participant_id, billing_period, subscription_tier,
     amount_zar, vat_zar, total_zar, net_payable_zar, line_items,
     chain_status, sla_deadline, sla_breached, dunning_notices_sent, created_at, updated_at)
    VALUES (?, 'acme', '2026-06', 'professional',
     1000, 150, 1150, 1150, '[]',
     ?, '2099-01-01T00:00:00Z', 0, ${extra || '0'}, datetime('now'), datetime('now'))`)
    .run(id, chain_status);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('subscription-billing — sla_breach holds position, never rewinds dunning', () => {
  it('keeps chain_status at dunning_2 and sets sla_breached on sla_breach', async () => {
    seedInvoice('inv1', 'dunning_2', '2');
    const token = await testJwtFor(db, 'admin', { role: 'admin' });
    const r = await call(billing, env, 'POST', '/inv1/action', { token, body: { action: 'sla_breach' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status, sla_breached FROM oe_subscription_invoices WHERE id='inv1'`).get() as any;
    expect(row.chain_status).toBe('dunning_2'); // NOT rewound to dunning_1
    expect(row.sla_breached).toBe(1);
  });

  it('still escalates dunning through the dedicated send_dunning_2 action', async () => {
    seedInvoice('inv2', 'dunning_1', '1');
    const token = await testJwtFor(db, 'admin', { role: 'admin' });
    const r = await call(billing, env, 'POST', '/inv2/action', { token, body: { action: 'send_dunning_2' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_subscription_invoices WHERE id='inv2'`).get() as any;
    expect(row.chain_status).toBe('dunning_2');
  });
});

describe('subscription-billing — suspended is recoverable, not terminal', () => {
  it('reactivate from suspended returns the invoice to issued', async () => {
    seedInvoice('inv3', 'suspended');
    const token = await testJwtFor(db, 'admin', { role: 'admin' });
    const r = await call(billing, env, 'POST', '/inv3/action', { token, body: { action: 'reactivate' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_subscription_invoices WHERE id='inv3'`).get() as any;
    expect(row.chain_status).toBe('issued');
  });

  it('write_off from suspended marks the invoice written_off', async () => {
    seedInvoice('inv4', 'suspended');
    const token = await testJwtFor(db, 'admin', { role: 'admin' });
    const r = await call(billing, env, 'POST', '/inv4/action', { token, body: { action: 'write_off' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_subscription_invoices WHERE id='inv4'`).get() as any;
    expect(row.chain_status).toBe('written_off');
  });
});
