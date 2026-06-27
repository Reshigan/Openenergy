// ═══════════════════════════════════════════════════════════════════════════
// sla_breach must HOLD the chain in place — end-to-end through the real route.
//
// Many chains map `sla_breach` to a fixed state in their flat STATE_TRANSITIONS
// table (often the start state). Firing the action would rewind an in-flight
// chain. This drives the real Hono action route against a migrated in-memory D1
// and proves the chain holds its current status and raises the sla_breached
// flag instead. slb-kpi is the canonical case; the helper resolveNextStatus is
// unit-tested in chain-sla.test.ts and reused across every such handler.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import slbKpi from '../src/routes/slb-kpi-chain';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // A ratchet deep in the chain (arbitration), SLA not yet past, flag clear.
  db.prepare(`INSERT INTO oe_slb_kpi_ratchets
    (id, participant_id, slb_tier, kpi_period, period_start, period_end,
     chain_status, sla_deadline, sla_breached, regulator_notified, created_at, updated_at)
    VALUES ('r1','alice','listed','2026-Q2','2026-04-01','2026-06-30',
     'arbitration','2099-01-01T00:00:00Z',0,0,datetime('now'),datetime('now'))`).run();
});
afterEach(() => { db.close(); });

describe('slb-kpi — sla_breach holds position, never rewinds', () => {
  it('keeps chain_status at arbitration and sets sla_breached on sla_breach', async () => {
    const token = await testJwtFor(db, 'alice', { role: 'offtaker' });
    const r = await call(slbKpi, env, 'POST', '/r1/action', { token, body: { action: 'sla_breach' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status, sla_breached FROM oe_slb_kpi_ratchets WHERE id='r1'`).get() as any;
    expect(row.chain_status).toBe('arbitration'); // NOT rewound to kpi_pending
    expect(row.sla_breached).toBe(1);
  });

  it('still advances normally on a real transition action', async () => {
    const token = await testJwtFor(db, 'alice', { role: 'offtaker' });
    const r = await call(slbKpi, env, 'POST', '/r1/action', { token, body: { action: 'resolve_arbitration' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_slb_kpi_ratchets WHERE id='r1'`).get() as any;
    expect(row.chain_status).toBe('ratchet_agreed');
  });
});
