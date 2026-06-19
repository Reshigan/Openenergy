// Fix C regression: POST /api/onboarding/complete must provision the seed +
// getting-started manifest SYNCHRONOUSLY in the request path, not solely via the
// async onboarding.completed cascade rule. In production env.QUEUE is provisioned
// and cascade rules run after the HTTP response, so a manifest produced only by
// the rule would leave GET /state empty until the queue drained. These tests run
// with NO queue and NO cascade-rule registration, proving the handler itself
// writes the provisioning row before it returns.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import onboarding from '../src/routes/onboarding';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

function setOnboardingData(participantId: string, data: Record<string, unknown>) {
  db.prepare(`UPDATE participants SET onboarding_data = ? WHERE id = ?`)
    .run(JSON.stringify(data), participantId);
}

function provisioningRowCount(participantId: string): number {
  const r = db.prepare(
    `SELECT COUNT(*) AS n FROM oe_onboarding_provisioning_log WHERE participant_id = ?`,
  ).get(participantId) as { n: number };
  return r.n;
}

describe('POST /api/onboarding/complete - synchronous provisioning', () => {
  it('seeds the trader desk + manifest before responding (no queue, no cascade rule)', async () => {
    const token = await testJwtFor(db, 'par_trader_c', { role: 'trader' });
    setOnboardingData('par_trader_c', { max_open_position_mwh: '500', daily_var_limit_zar: '250000' });

    const done = await call(onboarding, env, 'POST', '/complete', { token });
    expect(done.status).toBe(200);

    // GET /state immediately after must already carry a manifest + provisioned entity.
    const state = await call(onboarding, env, 'GET', '/state', { token });
    expect(state.status).toBe(200);
    const data = (state.json as any).data;
    expect(data.completed).toBe(true);
    expect(data.manifest).toBeTruthy();
    expect(data.provisioned.kind).toBe('position_limit');

    // The real config row the desk reads from must exist.
    const limit = db.prepare(
      `SELECT net_long_limit_mwh, daily_pnl_floor_zar FROM oe_position_limits
        WHERE participant_id = ? AND energy_type = 'electricity'`,
    ).get('par_trader_c') as { net_long_limit_mwh: number; daily_pnl_floor_zar: number } | undefined;
    expect(limit).toBeTruthy();
    expect(limit!.net_long_limit_mwh).toBe(500);
    // VaR limit stored as a negative daily P&L floor.
    expect(limit!.daily_pnl_floor_zar).toBe(-250000);
  });

  it('provisions a manifest-only role with no business entity', async () => {
    const token = await testJwtFor(db, 'par_reg_c', { role: 'regulator' });

    const done = await call(onboarding, env, 'POST', '/complete', { token });
    expect(done.status).toBe(200);

    const state = await call(onboarding, env, 'GET', '/state', { token });
    const data = (state.json as any).data;
    expect(data.manifest).toBeTruthy();
    // Oversight role: manifest only, no seeded operating entity.
    expect(data.provisioned.kind).toBe('manifest');
    expect(provisioningRowCount('par_reg_c')).toBe(1);
  });

  it('is idempotent across repeated completes (exactly one provisioning row)', async () => {
    const token = await testJwtFor(db, 'par_trader_d', { role: 'trader' });
    setOnboardingData('par_trader_d', { max_open_position_mwh: '100' });

    await call(onboarding, env, 'POST', '/complete', { token });
    await call(onboarding, env, 'POST', '/complete', { token });

    expect(provisioningRowCount('par_trader_d')).toBe(1);
  });
});
