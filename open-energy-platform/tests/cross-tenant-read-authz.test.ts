// ═══════════════════════════════════════════════════════════════════════════
// Cross-tenant access-control invariants (defect-hunt TDD).
//
// Several read/write routes loaded a row by id and returned (or mutated) it
// with NO party check, while a SIBLING route in the same file enforced
// party-or-admin. A non-party authed user could read/write another tenant's
// deal terms, settlement breaks, fees, and confirmations. These tests drive
// the real Hono routes against an in-memory migrated D1 and assert that a
// third party (neither side of the transaction, not admin) is refused.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import dealroom from '../src/routes/dealroom';
import settlement from '../src/routes/settlement';
import funder from '../src/routes/funder';
import documents from '../src/routes/documents';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  try { db.exec(`ALTER TABLE invoices ADD COLUMN tenant_id TEXT DEFAULT 'default'`); } catch { /* present */ }
  // deal_proposals / deal_messages are force-applied out-of-band on prod (the
  // 019–048 band — see CLAUDE.md); no in-band migration creates them, so the
  // clean-room DB must carry them for the dealroom routes to run.
  db.exec(`CREATE TABLE IF NOT EXISTS deal_proposals (
    id TEXT PRIMARY KEY, contract_id TEXT, proposer_id TEXT, terms TEXT,
    commentary TEXT, version INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE IF NOT EXISTS deal_messages (
    id TEXT PRIMARY KEY, contract_id TEXT, sender_id TEXT, content TEXT,
    message_type TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  env = envFor(db);
});
afterEach(() => { db.close(); });

function seedInvoice(o: { id: string; from: string; to: string }): void {
  db.prepare(`
    INSERT INTO invoices
      (id, invoice_number, from_participant_id, to_participant_id, invoice_type,
       period_start, period_end, line_items, subtotal, vat_amount, total_amount,
       status, due_date, paid_amount, created_at)
    VALUES (?, ?, ?, ?, 'energy', '2026-01-01', '2026-01-31', '[]', 1000, 150, 1150,
            'issued', '2026-02-15', 0, datetime('now'))
  `).run(o.id, `INV-${o.id}`, o.from, o.to);
}

describe('dealroom — non-party cannot read or mutate a deal', () => {
  beforeEach(() => {
    db.prepare(`INSERT INTO contract_documents
      (id, title, document_type, phase, creator_id, counterparty_id)
      VALUES ('c1','Deal','ppa_wheeling','draft','alice','bob')`).run();
    db.prepare(`INSERT INTO deal_proposals (id, contract_id, proposer_id, terms, version)
      VALUES ('p1','c1','alice','{"price":100}',1)`).run();
  });

  it('refuses a third party proposing terms', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(dealroom, env, 'POST', '/c1/propose', { token, body: { terms: { price: 1 } } });
    expect(r.status).toBe(403);
  });

  it('refuses a third party accepting the latest proposal', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(dealroom, env, 'POST', '/c1/accept', { token });
    expect(r.status).toBe(403);
    // and the contract phase must NOT have advanced
    const row = db.prepare(`SELECT phase, commercial_terms FROM contract_documents WHERE id='c1'`).get() as any;
    expect(row.phase).toBe('draft');
    expect(row.commercial_terms).toBeNull();
  });

  it('refuses a third party messaging the deal room', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(dealroom, env, 'POST', '/c1/message', { token, body: { content: 'hi' } });
    expect(r.status).toBe(403);
  });

  it('still allows the counterparty to propose', async () => {
    const token = await testJwtFor(db, 'bob', { role: 'offtaker' });
    const r = await call(dealroom, env, 'POST', '/c1/propose', { token, body: { terms: { price: 1 } } });
    expect(r.status).toBe(200);
  });
});

describe('settlement — non-party cannot read invoice child rows', () => {
  beforeEach(() => {
    seedInvoice({ id: 'inv1', from: 'alice', to: 'bob' });
    db.prepare(`INSERT INTO settlement_breaks (id, invoice_id, break_type, severity, reported_by, reason)
      VALUES ('b1','inv1','price','medium','alice','mismatch')`).run();
  });

  it('refuses a third party reading breaks', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(settlement, env, 'GET', '/invoices/inv1/breaks', { token });
    expect(r.status).toBe(403);
  });

  it('refuses a third party reading confirmations', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(settlement, env, 'GET', '/invoices/inv1/confirmations', { token });
    expect(r.status).toBe(403);
  });

  it('refuses a third party reading fees', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(settlement, env, 'GET', '/invoices/inv1/fees', { token });
    expect(r.status).toBe(403);
  });

  it('still allows a party to read breaks', async () => {
    const token = await testJwtFor(db, 'bob', { role: 'offtaker' });
    const r = await call(settlement, env, 'GET', '/invoices/inv1/breaks', { token });
    expect(r.status).toBe(200);
    expect((r.json as any).data).toHaveLength(1);
  });
});

describe('funder — non-party cannot run facility analytics', () => {
  // The gate must fire BEFORE the AI call (ask()), so a refused request never
  // reaches the unbound AI binding. We only assert the negative (403) cases;
  // the positive path would invoke Workers AI, which the harness can't bind.
  beforeEach(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS loan_facilities (
      id TEXT PRIMARY KEY, facility_name TEXT NOT NULL, project_id TEXT,
      lender_participant_id TEXT NOT NULL, borrower_participant_id TEXT,
      facility_type TEXT, committed_amount REAL, drawn_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'ZAR', interest_rate_pct REAL, tenor_months INTEGER,
      dscr_covenant REAL DEFAULT 1.20, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')))`);
    db.exec(`CREATE TABLE IF NOT EXISTS loan_covenants (
      id TEXT PRIMARY KEY, facility_id TEXT NOT NULL, covenant_type TEXT NOT NULL,
      threshold REAL, last_value REAL, last_checked_at TEXT, status TEXT DEFAULT 'clean',
      notes TEXT, created_at TEXT DEFAULT (datetime('now')))`);
    db.prepare(`INSERT INTO loan_facilities
      (id, facility_name, lender_participant_id, borrower_participant_id, committed_amount)
      VALUES ('f1','Senior Debt','alice','bob',500000000)`).run();
    db.prepare(`INSERT INTO loan_covenants (id, facility_id, covenant_type, threshold)
      VALUES ('cov1','f1','dscr',1.2)`).run();
  });

  it('refuses a third party requesting a cashflow forecast', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(funder, env, 'POST', '/facilities/f1/cashflow', { token, body: {} });
    expect(r.status).toBe(403);
  });

  it('refuses a third party running a sensitivity matrix', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(funder, env, 'POST', '/facilities/f1/sensitivity', { token, body: {} });
    expect(r.status).toBe(403);
  });

  it('refuses a third party triaging a covenant', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(funder, env, 'POST', '/covenants/cov1/check', { token, body: {} });
    expect(r.status).toBe(403);
  });
});

describe('documents — non-party cannot read a signing envelope', () => {
  // A signing envelope is private to the raiser, its signatories, and admin.
  // GET /envelopes (list) already gates on raised_by OR signatory; the
  // single-envelope GET loaded by id alone — a cross-tenant leak exposing the
  // rendered contract body, variables, and the document hash to any authed user.
  beforeEach(() => {
    db.prepare(`INSERT INTO oe_document_envelopes
      (id, template_id, raised_by, variables_json, body_rendered, signatories_json, status)
      VALUES ('e1','tpl1','alice','{}','SECRET BODY',
        '[{"participant_id":"bob","role":"offtaker","label":"Buyer","signed_at":null}]','sent')`).run();
  });

  it('refuses a third party reading the envelope', async () => {
    const token = await testJwtFor(db, 'mallory', { role: 'trader' });
    const r = await call(documents, env, 'GET', '/envelopes/e1', { token });
    expect(r.status).toBe(403);
  });

  it('still allows a signatory to read the envelope', async () => {
    const token = await testJwtFor(db, 'bob', { role: 'offtaker' });
    const r = await call(documents, env, 'GET', '/envelopes/e1', { token });
    expect(r.status).toBe(200);
  });

  it('still allows the raiser to read the envelope', async () => {
    const token = await testJwtFor(db, 'alice', { role: 'ipp_developer' });
    const r = await call(documents, env, 'GET', '/envelopes/e1', { token });
    expect(r.status).toBe(200);
  });
});
