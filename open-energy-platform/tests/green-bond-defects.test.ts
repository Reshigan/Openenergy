// ═══════════════════════════════════════════════════════════════════════════
// green-bond — dead-end terminal defect (defect-hunt TDD).
//
// 'approved' was listed in GBR_HARD_TERMINALS, so the route's terminal guard
// rejected every action from it — yet the spec defines publish: approved →
// published. An approved green-bond report could never be published, making
// 'published' (the real disclosure terminal) unreachable. 'approved' is an
// intermediate JSE-cleared state, not a terminal.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, call, testJwtFor } from './helpers/d1-sqlite';
import gbr from '../src/routes/green-bond-chain';

let db: Database.Database;
let env: Record<string, unknown>;

function seed(id: string, chain_status: string) {
  db.prepare(`INSERT INTO oe_green_bond_reports
    (id, participant_id, bond_class, report_year, issuance_size_zar,
     reporting_period_start, reporting_period_end, chain_status,
     sla_deadline, sla_breached, actor_id, created_at, updated_at)
    VALUES (?, 'acme', 'project', 2026, 500000000,
     '2026-01-01', '2026-12-31', ?,
     '2099-01-01T00:00:00Z', 0, 'acme', datetime('now'), datetime('now'))`)
    .run(id, chain_status);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('green-bond — approved is intermediate, publish reaches published', () => {
  it('publish from approved transitions to published', async () => {
    seed('gb1', 'approved');
    const token = await testJwtFor(db, 'acme', { role: 'ipp_developer' });
    const r = await call(gbr, env, 'POST', '/gb1/action', { token, body: { action: 'publish' } });
    expect(r.status).toBe(200);
    const row = db.prepare(`SELECT chain_status FROM oe_green_bond_reports WHERE id='gb1'`).get() as any;
    expect(row.chain_status).toBe('published');
  });

  it('published remains a real terminal (no actions out)', async () => {
    seed('gb2', 'published');
    const token = await testJwtFor(db, 'acme', { role: 'ipp_developer' });
    const r = await call(gbr, env, 'POST', '/gb2/action', { token, body: { action: 'publish' } });
    expect(r.status).toBe(422); // terminal guard rejects
  });
});
