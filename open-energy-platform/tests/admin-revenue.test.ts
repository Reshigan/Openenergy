import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import adminRevenueRoutes from '../src/routes/admin-revenue';

let db: Database.Database;
let env: any;

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}
async function tokenFor(id: string, role: string): Promise<string> {
  return signToken({ sub: id, role, email: `${id}@openenergy.co.za` } as any, 'test-secret');
}
function call(path: string, token: string, init: RequestInit = {}) {
  return adminRevenueRoutes.request(
    path,
    { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } },
    env,
  );
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  seedParticipant('par_admin', 'admin');
  seedParticipant('par_trader', 'trader');
  // a paid + a waived revenue row in period 2026-06
  db.exec(`INSERT INTO oe_platform_revenue (id, trigger_event, entity_id, entity_type, participant_id, payer_role, entity_value, fee_zar, fee_schedule_id, billing_period, status)
           VALUES ('r1','trade.matched','e1','demo','par_1','trader',1000000,1500,'fee_trade_matched','2026-06','pending'),
                  ('r2','contract.signed','e2','demo','par_2','offtaker',500000,0,NULL,'2026-06','waived')`);
});
afterEach(() => { db.close(); });

describe('admin-revenue — auth', () => {
  it('rejects a non-admin with 403', async () => {
    const res = await call('/schedule', await tokenFor('par_trader', 'trader'));
    expect(res.status).toBe(403);
  });
  it('allows admin to list the schedule', async () => {
    const res = await call('/schedule', await tokenFor('par_admin', 'admin'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(20);
  });
});

describe('admin-revenue — analytics', () => {
  it('summary reports free-vs-paid mix for the period', async () => {
    const res = await call('/summary?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    expect(body.data.total_fee_zar).toBeCloseTo(1500, 6);
    expect(body.data.events).toBe(2);
    expect(body.data.paid_events).toBe(1);   // status != waived
    expect(body.data.free_events).toBe(1);   // status = waived
  });
  it('by-event groups fee totals', async () => {
    const res = await call('/by-event?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    const trade = body.data.find((r: any) => r.trigger_event === 'trade.matched');
    expect(trade.fee_zar).toBeCloseTo(1500, 6);
  });
  it('leakage lists billable events that fired R0 against real value', async () => {
    const res = await call('/leakage?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    const leaked = body.data.find((r: any) => r.trigger_event === 'contract.signed');
    expect(leaked.forgone_value_zar).toBeCloseTo(500000, 6);
  });
  it('top-events ranks by fee', async () => {
    const res = await call('/top-events?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    expect(body.data[0].trigger_event).toBe('trade.matched');
  });
});

describe('admin-revenue — schedule control', () => {
  it('patches a schedule row to enable a fee', async () => {
    const res = await call('/schedule/fee_trade_matched', await tokenFor('par_admin', 'admin'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_enabled: 1, rate: 15 }),
    });
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT is_enabled, rate FROM oe_fee_schedule WHERE id='fee_trade_matched'`).get() as any;
    expect(row.is_enabled).toBe(1);
    expect(row.rate).toBe(15);
  });
});
