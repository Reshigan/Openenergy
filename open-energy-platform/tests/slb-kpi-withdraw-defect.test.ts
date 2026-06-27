// ═══════════════════════════════════════════════════════════════════════════
// slb-kpi — orphaned `withdraw` action (defect-hunt TDD).
//
// SLB_STATE_TRANSITIONS maps withdraw → 'withdrawn' and 'withdrawn' is a
// declared terminal, but `withdraw` appeared in NO SLB_VALID_TRANSITIONS row,
// so it could never be dispatched and 'withdrawn' was unreachable. An issuer
// must be able to withdraw a KPI scheme before the ratchet quantum is in play,
// i.e. from the pre-negotiation stages (kpi_pending..kpi_certified). It is NOT
// allowed once a binding ratchet is being negotiated (ratchet_* / arbitration).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import slbKpi from '../src/routes/slb-kpi-chain';

let db: Database.Database;
let env: Record<string, unknown>;

function seed(id: string, chain_status: string) {
  db.prepare(`INSERT INTO oe_slb_kpi_ratchets
    (id, participant_id, slb_tier, kpi_period, period_start, period_end,
     chain_status, sla_deadline, sla_breached, regulator_notified, created_at, updated_at)
    VALUES (?, 'alice', 'listed', '2026-Q2', '2026-04-01', '2026-06-30',
     ?, '2099-01-01T00:00:00Z', 0, 0, datetime('now'), datetime('now'))`)
    .run(id, chain_status);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('slb-kpi — withdraw reaches withdrawn from pre-ratchet stages', () => {
  it('withdraw from kpi_pending transitions to withdrawn', async () => {
    seed('r1', 'kpi_pending');
    const token = await testJwtFor(db, 'alice', { role: 'offtaker' });
    const r = await call(slbKpi, env, 'POST', '/r1/action', { token, body: { action: 'withdraw' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_slb_kpi_ratchets WHERE id='r1'`).get() as any;
    expect(row.chain_status).toBe('withdrawn');
  });

  it('withdraw is rejected once a ratchet is being negotiated (arbitration)', async () => {
    seed('r2', 'arbitration');
    const token = await testJwtFor(db, 'alice', { role: 'offtaker' });
    const r = await call(slbKpi, env, 'POST', '/r2/action', { token, body: { action: 'withdraw' } });
    expect(r.status).toBe(422);
  });
});
