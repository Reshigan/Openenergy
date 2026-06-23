// ═══════════════════════════════════════════════════════════════════════════
// Onboarding edge case guard: materializeFinancials must self-provision the
// carbon_projects row that carbon_holdings.project_id references. On a fresh
// takeon that parent row does not exist, so on real D1 (foreign_keys ON) the
// holdings INSERT FK-explodes. The fix provisions it idempotently inside
// materializeFinancials. This test proves the provisioning runs (the harness
// keeps foreign_keys OFF, matching D1's default, so we assert the row is
// created rather than catching the violation directly).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { materializeFinancials } from '../src/routes/esums-accruals';

const IPP = 'p_test_gonxt';
const CARBON = 'p_test_envera';
const OFFTAKER = 'p_test_goldrush';
const STATION = 'solax_test_001';

let db: Database.Database;
let env: ReturnType<typeof envFor>;

// Columns force-applied out-of-band on prod that a clean-room migration replay
// lacks (see d1-sqlite.ts comment on the 019–050 irregular band). Add them so
// the harness matches prod's actual solax_stations / site_accruals shape.
function ensureCol(table: string, col: string, type: string) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* already present */ }
}

function seed() {
  for (const c of ['offtaker_participant_id', 'carbon_participant_id']) ensureCol('solax_stations', c, 'TEXT');
  for (const c of ['kwh_delta', 'revenue_zar', 'tariff_rate_used', 'carbon_tco2e', 'carbon_intensity_used'])
    ensureCol('site_accruals', c, 'REAL');

  // Some non-seed migration may pre-create the fleet project; remove it so the
  // test exercises the fresh-onboarding path where the FK target is absent.
  try { db.exec(`DELETE FROM carbon_projects WHERE id='cp_goldrush_fleet'`); } catch { /* table may be empty */ }

  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status)
     VALUES (?, ?, 'x', ?, ?, 'active')`,
  ).run(CARBON, `${CARBON}@t`, 'Envera', 'carbon_fund');

  db.prepare(
    `INSERT INTO solax_stations
       (id, participant_id, offtaker_participant_id, carbon_participant_id,
        plant_id, device_sn, manufacturer, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PLANT1', 'SN1', 'solax', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  ).run(STATION, IPP, OFFTAKER, CARBON);

  // One accrual hour with kwh + carbon so invoices/credits/holdings all populate.
  db.prepare(
    `INSERT INTO site_accruals
       (station_id, participant_id, period_hour, kwh_delta, revenue_zar,
        tariff_rate_used, carbon_tco2e, carbon_intensity_used, created_at, updated_at)
     VALUES (?, ?, '2026-01-15T10:00:00Z', 100.0, 123.0, 1.23, 0.095, 950.0, '2026-01-15T11:00:00Z', '2026-01-15T11:00:00Z')`,
  ).run(STATION, IPP);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  seed();
});

afterEach(() => db.close());

describe('materializeFinancials carbon-project FK provisioning', () => {
  it('creates the cp_goldrush_fleet parent row before inserting holdings', async () => {
    // Precondition: the FK target does NOT exist (this is the onboarding gap).
    const before = db.prepare(`SELECT COUNT(*) n FROM carbon_projects WHERE id='cp_goldrush_fleet'`).get() as { n: number };
    expect(before.n).toBe(0);

    const result = await materializeFinancials(IPP, env as never);

    // Holdings materialized, and their FK parent now exists.
    expect(result.holdings).toBeGreaterThan(0);
    const proj = db.prepare(`SELECT developer_id, status FROM carbon_projects WHERE id='cp_goldrush_fleet'`).get() as
      | { developer_id: string; status: string }
      | undefined;
    expect(proj).toBeDefined();
    expect(proj!.developer_id).toBe(CARBON);
    expect(proj!.status).toBe('active');

    const held = db.prepare(`SELECT project_id FROM carbon_holdings WHERE participant_id=?`).get(CARBON) as
      | { project_id: string }
      | undefined;
    expect(held!.project_id).toBe('cp_goldrush_fleet');
  });

  it('is idempotent — a second run does not duplicate the project', async () => {
    await materializeFinancials(IPP, env as never);
    await materializeFinancials(IPP, env as never);
    const cnt = db.prepare(`SELECT COUNT(*) n FROM carbon_projects WHERE id='cp_goldrush_fleet'`).get() as { n: number };
    expect(cnt.n).toBe(1);
  });
});
