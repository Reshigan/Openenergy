// ═══════════════════════════════════════════════════════════════════════════
// capital-adequacy — orphaned `withdraw` action (defect-hunt TDD).
//
// CAP_STATE_TRANSITIONS maps withdraw → 'withdrawn' and 'withdrawn' is a
// declared terminal, but `withdraw` appeared in NO CAP_VALID_TRANSITIONS row,
// so it could never be dispatched and 'withdrawn' was unreachable. A bank must
// be able to withdraw a filing before it is submitted to SARB, i.e. from the
// pre-submission stages (data_gathering..board_review). It is NOT allowed once
// the report is with SARB (submitted_sarb / queries / remediation).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import cap from '../src/routes/capital-adequacy-chain';

let db: Database.Database;
let env: Record<string, unknown>;

function seed(id: string, chain_status: string) {
  db.prepare(`INSERT INTO oe_capital_adequacy_reports
    (id, participant_id, bank_tier, report_period, reporting_date,
     chain_status, sla_deadline, sla_breached, regulator_notified, actor_id,
     created_at, updated_at)
    VALUES (?, 'alice', 'large', '2026-Q2', '2026-06-30',
     ?, '2099-01-01T00:00:00Z', 0, 0, 'alice', datetime('now'), datetime('now'))`)
    .run(id, chain_status);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('capital-adequacy — withdraw reaches withdrawn from pre-submission stages', () => {
  it('withdraw from data_gathering transitions to withdrawn', async () => {
    seed('c1', 'data_gathering');
    const token = await testJwtFor(db, 'alice', { role: 'lender' });
    const r = await call(cap, env, 'POST', '/c1/action', { token, body: { action: 'withdraw' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_capital_adequacy_reports WHERE id='c1'`).get() as any;
    expect(row.chain_status).toBe('withdrawn');
  });

  it('withdraw is rejected once the report is with SARB (submitted_sarb)', async () => {
    seed('c2', 'submitted_sarb');
    const token = await testJwtFor(db, 'alice', { role: 'lender' });
    const r = await call(cap, env, 'POST', '/c2/action', { token, body: { action: 'withdraw' } });
    expect(r.status).toBe(422);
  });
});
