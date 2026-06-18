// Settlement-correctness invariants (go-live blocker #6).
//
// These tests assert the *money-safety* properties of the settlement engine that
// unit-of-work tests elsewhere don't cover: no double-settle of a run, no
// double-payment of an invoice, delivery-versus-payment (DvP) leg atomicity, and
// conservation of value through multilateral netting. They drive the real Hono
// routes against an in-memory migrated D1 so the request/response and SQL paths
// are byte-identical to prod.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import { recordStepUpAuth } from '../src/middleware/step-up';
import { acquireLock, releaseLock } from '../src/utils/locks';
import sa from '../src/routes/settlement-automation';
import settlement from '../src/routes/settlement';
import dvp from '../src/routes/settlement-dvp';
import deep from '../src/routes/settlement-deep';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  // `invoices.tenant_id` is a force-applied out-of-band column on prod (the
  // 019–048 band, see CLAUDE.md migration discipline) that no in-band migration
  // creates. fireCascade's invoice handlers reference it, so the clean-room DB
  // must carry it too. Idempotent: ignore if a migration already added it.
  try { db.exec(`ALTER TABLE invoices ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch { /* already present */ }
  env = envFor(db);
});
afterEach(() => { db.close(); });

/** Seed a participant row (auth + FK targets) and return its id. */
async function participant(id: string, role = 'admin'): Promise<string> {
  await testJwtFor(db, id, { role, email: `${id}@test` });
  return id;
}

/** Insert a fully-formed invoice row. `line_items` is NOT NULL with no default. */
function seedInvoice(o: {
  id: string; from: string; to: string; total: number;
  status?: string; createdAt?: string;
}): void {
  const vat = Math.round(o.total - o.total / 1.15);
  const subtotal = o.total - vat;
  db.prepare(`
    INSERT INTO invoices
      (id, invoice_number, from_participant_id, to_participant_id, invoice_type,
       period_start, period_end, line_items, subtotal, vat_amount, total_amount,
       status, due_date, paid_amount, created_at)
    VALUES (?, ?, ?, ?, 'energy', '2026-06-01', '2026-06-30', '[]', ?, ?, ?, ?,
            '2026-07-15', 0, ?)
  `).run(
    o.id, `INV-${o.id}`, o.from, o.to, subtotal, vat, o.total,
    o.status || 'issued', o.createdAt || '2026-06-01 12:00:00',
  );
}

describe('settlement correctness — money-safety invariants', () => {
  // ── (a) double-settle guard ────────────────────────────────────────────
  it('a run is idempotent: same idempotency key never creates a second run', async () => {
    const token = await testJwtFor(db, 'u-admin', { role: 'admin' });
    const body = {
      run_type: 'ppa_energy',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      idempotency_key: 'period-2026-06',
    };

    const first = await call(sa, env, 'POST', '/runs', { token, body });
    expect(first.status).toBe(200);
    const firstData = (first.json as any).data;
    const firstRunId = firstData.run_id;
    expect(firstRunId).toBeTruthy();

    const second = await call(sa, env, 'POST', '/runs', { token, body });
    expect(second.status).toBe(200);
    expect((second.json as any).idempotent).toBe(true);
    expect((second.json as any).data.id).toBe(firstRunId);

    const rows = db.prepare(
      `SELECT COUNT(*) n FROM settlement_runs WHERE idempotency_key = ?`,
    ).get('period-2026-06') as { n: number };
    expect(rows.n).toBe(1);
  });

  it('concurrent runs with the same key still produce exactly one run row', async () => {
    const token = await testJwtFor(db, 'u-admin', { role: 'admin' });
    const body = {
      run_type: 'wheeling',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      idempotency_key: 'race-2026-06',
    };
    // Fire both before awaiting either — the advisory lock around the
    // SELECT+INSERT is the only thing standing between them and a double row.
    const [r1, r2] = await Promise.all([
      call(sa, env, 'POST', '/runs', { token, body }),
      call(sa, env, 'POST', '/runs', { token, body }),
    ]);
    // The loser is either deduped (idempotent:true) or rejected (409 in-progress);
    // it must never be a second successful fresh insert.
    expect([200, 409]).toContain(r1.status);
    expect([200, 409]).toContain(r2.status);
    const rows = db.prepare(
      `SELECT COUNT(*) n FROM settlement_runs WHERE idempotency_key = ?`,
    ).get('race-2026-06') as { n: number };
    expect(rows.n).toBe(1);
  });

  // ── (b) double-pay guard ───────────────────────────────────────────────
  it('an invoice paid in full rejects a second payment', async () => {
    const issuer = await participant('u-issuer');
    const payerToken = await testJwtFor(db, 'u-payer', { role: 'admin' });
    seedInvoice({ id: 'inv-pay', from: issuer, to: 'u-payer', total: 1000, status: 'issued' });

    const pay1 = await call(settlement, env, 'POST', '/payments', {
      token: payerToken,
      body: { invoice_id: 'inv-pay', amount: 1000, payment_method: 'eft' },
    });
    expect(pay1.status).toBe(201);
    expect((pay1.json as any).data.invoice_status).toBe('paid');

    const pay2 = await call(settlement, env, 'POST', '/payments', {
      token: payerToken,
      body: { invoice_id: 'inv-pay', amount: 100, payment_method: 'eft' },
    });
    expect(pay2.status).toBe(400);

    const row = db.prepare(`SELECT paid_amount, status FROM invoices WHERE id = 'inv-pay'`).get() as any;
    expect(row.status).toBe('paid');
    expect(row.paid_amount).toBeCloseTo(1000, 2);
  });

  // ── (c) DvP leg atomicity ──────────────────────────────────────────────
  it('once both DvP legs are locked, neither leg can be unwound, and release is terminal', async () => {
    const token = await testJwtFor(db, 'u-admin', { role: 'admin' });
    const cyc = 'cyc-dvp-1';

    const cash = await call(dvp, env, 'POST', `/cycle/${cyc}/cash`, { token, body: { cash_ref: 'PAY-1' } });
    expect(cash.status).toBe(200);
    expect((cash.json as any).data.lock_status).toBe('cash_in');

    const energy = await call(dvp, env, 'POST', `/cycle/${cyc}/energy`, { token, body: { energy_ref: 'DEL-1' } });
    expect(energy.status).toBe(200);
    expect((energy.json as any).data.lock_status).toBe('locked');

    // Cannot re-confirm a leg after lock — both settle together or not at all.
    const reCash = await call(dvp, env, 'POST', `/cycle/${cyc}/cash`, { token, body: { cash_ref: 'PAY-2' } });
    expect(reCash.status).toBe(409);
    expect((reCash.json as any).error).toBe('cannot_modify_locked');

    const release = await call(dvp, env, 'POST', `/cycle/${cyc}/release`, { token, body: { reason: 'settled' } });
    expect(release.status).toBe(200);
    expect((release.json as any).data.lock_status).toBe('released');

    // Released is terminal: no further leg edits, no double-release.
    const afterRelease = await call(dvp, env, 'POST', `/cycle/${cyc}/cash`, { token, body: {} });
    expect(afterRelease.status).toBe(409);
    expect((afterRelease.json as any).error).toBe('cannot_modify_released');

    const reRelease = await call(dvp, env, 'POST', `/cycle/${cyc}/release`, { token, body: {} });
    expect(reRelease.status).toBe(409);
    expect((reRelease.json as any).error).toBe('already_released');
  });

  // ── (d) netting conserves value ────────────────────────────────────────
  it('multilateral netting preserves every participant’s signed net position', async () => {
    const token = await testJwtFor(db, 'u-admin', { role: 'admin' });
    const A = await participant('p-A');
    const B = await participant('p-B');
    const C = await participant('p-C');

    // Gross obligations, all dated on the cycle trade date.
    const gross = [
      { id: 'g1', from: A, to: B, total: 100 },
      { id: 'g2', from: B, to: A, total: 30 },
      { id: 'g3', from: B, to: C, total: 50 },
      { id: 'g4', from: A, to: C, total: 20 },
    ];
    for (const g of gross) seedInvoice(g);

    // Cycle keyed to the same trade date the netting route filters invoices by.
    db.prepare(`
      INSERT INTO oe_settlement_cycles (id, trade_date, value_date, status)
      VALUES ('cyc-net', '2026-06-01', '2026-06-02', 'open')
    `).run();

    // settlement.net is a non-high-risk step-up op: seed a fresh session so the
    // grace window check passes.
    await recordStepUpAuth(env as any, 'u-admin', 'settlement.net', 'totp', 900);

    const res = await call(deep, env, 'POST', '/cycles/cyc-net/net', { token, body: {} });
    expect(res.status).toBe(200);

    // Signed net per participant = received − paid.
    const signedNet = (rows: Array<{ from: string; to: string; v: number }>) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        m.set(r.to, (m.get(r.to) || 0) + r.v);
        m.set(r.from, (m.get(r.from) || 0) - r.v);
      }
      return m;
    };

    const grossNet = signedNet(gross.map((g) => ({ from: g.from, to: g.to, v: g.total })));

    const legs = db.prepare(
      `SELECT from_participant_id AS f, to_participant_id AS t, net_value_zar AS v
         FROM oe_settlement_net_legs WHERE cycle_id = 'cyc-net'`,
    ).all() as Array<{ f: string; t: string; v: number }>;
    expect(legs.length).toBeGreaterThan(0);
    const legNet = signedNet(legs.map((l) => ({ from: l.f, to: l.t, v: l.v })));

    for (const p of [A, B, C]) {
      expect(legNet.get(p) || 0).toBeCloseTo(grossNet.get(p) || 0, 2);
    }
    // Closed system: nets sum to zero (no value leaks in or out).
    const sum = [...legNet.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(0, 2);
  });

  // ── (e) netting-race guard ─────────────────────────────────────────────
  // In production two concurrent isolates can both read a cycle's status as
  // 'open' before either UPDATEs it, both pass the in-handler gate, and both
  // write a full set of net legs — doubling the settlement obligations. The
  // advisory lock around the whole read-check-write is what prevents that.
  //
  // The unit harness wraps synchronous better-sqlite3, so a Promise.all of two
  // POSTs does NOT interleave at the DB layer — the first handler runs to
  // completion (status → 'net_calculated') before the second reads, so the
  // bare status gate alone already yields 200/409 there. That makes a
  // fire-both race assertion pass with OR without the lock — it proves nothing.
  //
  // So instead we exercise the lock branch deterministically: hold the exact
  // lock key the handler uses (`settlement:netting:<id>`) as a different
  // holder, then drive the route. A contended lock MUST reject with 409 and
  // write nothing; once released the same call MUST succeed. This goes red if
  // the withLock wrapper is ever removed (an unguarded handler ignores the
  // held lock and nets straight through).
  it('rejects netting while the cycle lock is held, and succeeds once released', async () => {
    const token = await testJwtFor(db, 'u-admin', { role: 'admin' });
    const X = await participant('p-X');
    const Y = await participant('p-Y');
    const Z = await participant('p-Z');

    // Three distinct directed obligations on the cycle trade date — no reversal
    // cancels, so a single run writes a deterministic, non-zero leg set.
    const gross = [
      { id: 'r1', from: X, to: Y, total: 100, createdAt: '2026-06-05 12:00:00' },
      { id: 'r2', from: Y, to: Z, total: 60, createdAt: '2026-06-05 12:00:00' },
      { id: 'r3', from: X, to: Z, total: 25, createdAt: '2026-06-05 12:00:00' },
    ];
    for (const g of gross) seedInvoice(g);

    db.prepare(`
      INSERT INTO oe_settlement_cycles (id, trade_date, value_date, status)
      VALUES ('cyc-race', '2026-06-05', '2026-06-06', 'open')
    `).run();

    await recordStepUpAuth(env as any, 'u-admin', 'settlement.net', 'totp', 900);

    // Another worker already holds the cycle's netting lock (non-stale TTL).
    const lockKey = 'settlement:netting:cyc-race';
    const held = await acquireLock(env as any, lockKey, 'other-worker', 60);
    expect(held).toBe(true);

    // Contended: the route cannot acquire the lock → 409, and writes nothing.
    const blocked = await call(deep, env, 'POST', '/cycles/cyc-race/net', { token, body: {} });
    expect(blocked.status).toBe(409);
    expect((blocked.json as any).error).toBe('netting already in progress for this cycle');

    const duringHold = db.prepare(
      `SELECT COUNT(*) n FROM oe_settlement_net_legs WHERE cycle_id = 'cyc-race'`,
    ).get() as { n: number };
    expect(duringHold.n).toBe(0);
    const stillOpen = db.prepare(`SELECT status FROM oe_settlement_cycles WHERE id = 'cyc-race'`).get() as any;
    expect(stillOpen.status).toBe('open');

    // Lock released → the same call now wins and nets the cycle exactly once.
    await releaseLock(env as any, lockKey, 'other-worker');
    const ok = await call(deep, env, 'POST', '/cycles/cyc-race/net', { token, body: {} });
    expect(ok.status).toBe(200);
    const legs = (ok.json as any).data.net_legs as number;
    expect(legs).toBeGreaterThan(0);

    const after = db.prepare(
      `SELECT COUNT(*) n FROM oe_settlement_net_legs WHERE cycle_id = 'cyc-race'`,
    ).get() as { n: number };
    expect(after.n).toBe(legs);
    const cyc = db.prepare(`SELECT status FROM oe_settlement_cycles WHERE id = 'cyc-race'`).get() as any;
    expect(cyc.status).toBe('net_calculated');
  });
});
