import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerTradeSettlementRules } from '../src/cascade-rules/trade-settlement';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  // `invoices.tenant_id` is a force-applied out-of-band column on prod (the
  // 019–048 band, see CLAUDE.md migration discipline) that no in-band migration
  // creates. The legacy handler's trade.matched INSERT references it verbatim,
  // so the clean-room test DB must carry it too — otherwise the byte-identical
  // migrated SQL would throw "no such column" here while working in prod.
  db.exec(`ALTER TABLE invoices ADD COLUMN tenant_id TEXT DEFAULT 'default'`);
  env = envFor(db);
  _resetRegistryForTests();
  registerTradeSettlementRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'x', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('trade-settlement rules', () => {
  it('trade.matched creates exactly one escrow + one invoice + two action_queue rows', async () => {
    await runCascadeRegistry(ctx('trade.matched', 'm1', {
      match_id: 'm1', buyer_id: 'b1', seller_id: 's1', total_value: 1150,
      volume_mwh: 10, price_per_mwh: 115, delivery_date: '2026-07-01',
    }));
    const escrow = db.prepare(`SELECT COUNT(*) n FROM escrow_accounts WHERE match_id = 'm1'`).get() as { n: number };
    expect(escrow.n).toBe(1);
    const inv = db.prepare(`SELECT COUNT(*) n FROM invoices WHERE match_id = 'm1'`).get() as { n: number };
    expect(inv.n).toBe(1);
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'm1' OR entity_type = 'invoices'`).get() as { n: number };
    expect(aq.n).toBe(2);
  });

  it('invoice.paid releases held escrow and settles the match', async () => {
    db.prepare(`INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at) VALUES ('e1','m2',100,'ZAR','held','2026-01-01')`).run();
    db.prepare(`INSERT INTO trade_matches (id, buy_order_id, sell_order_id, matched_volume_mwh, matched_price, status) VALUES ('m2','bo2','so2',10,100,'pending')`).run();
    db.prepare(`INSERT INTO invoices (id, invoice_number, match_id, from_participant_id, to_participant_id, invoice_type, period_start, period_end, line_items, subtotal, vat_amount, total_amount, due_date, status, tenant_id) VALUES ('inv2','INV-2','m2','s1','b1','energy','2026-01-01','2026-01-31','[]',100,15,115,'2026-02-01','paid','default')`).run();
    await runCascadeRegistry(ctx('invoice.paid', 'inv2', {}));
    const esc = db.prepare(`SELECT status FROM escrow_accounts WHERE id = 'e1'`).get() as { status: string };
    expect(esc.status).toBe('released');
    const tm = db.prepare(`SELECT status FROM trade_matches WHERE id = 'm2'`).get() as { status: string };
    expect(tm.status).toBe('settled');
  });

  it('dispute.filed marks escrow disputed and queues an admin review', async () => {
    db.prepare(`INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at) VALUES ('e3','m3',100,'ZAR','held','2026-01-01')`).run();
    db.prepare(`INSERT INTO participants (id, email, password_hash, name, role) VALUES ('admin1','admin1@test','x','Admin One','admin')`).run();
    await runCascadeRegistry(ctx('dispute.filed', 'inv3', { match_id: 'm3', reason: 'short delivery' }));
    const esc = db.prepare(`SELECT status FROM escrow_accounts WHERE id = 'e3'`).get() as { status: string };
    expect(esc.status).toBe('disputed');
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'dispute_review' AND assignee_id = 'admin1'`).get() as { n: number };
    expect(aq.n).toBe(1);
  });

  it('invoice.issued queues a payment action for the payee', async () => {
    db.prepare(`INSERT INTO invoices (id, invoice_number, match_id, from_participant_id, to_participant_id, invoice_type, period_start, period_end, line_items, subtotal, vat_amount, total_amount, due_date, status, tenant_id) VALUES ('inv4','INV-4',NULL,'s1','b1','energy','2026-07-01','2026-07-31','[]',434.78,65.22,500,'2026-07-01','issued','default')`).run();
    await runCascadeRegistry(ctx('invoice.issued', 'inv4', {}));
    const aq = db.prepare(`SELECT assignee_id, type FROM action_queue WHERE entity_id = 'inv4'`).get() as any;
    expect(aq).toMatchObject({ assignee_id: 'b1', type: 'invoice_payment' });
  });
});
