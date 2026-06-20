import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { buildPrefill } from '../src/utils/autofill';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, company_name, role, status, kyc_status, bbbee_level, tenant_id, created_at, updated_at)
     VALUES ('par_ipp', 'autofill-test-ipp@example.test', 'x', 'Thabo M', 'Karoo Solar (Pty) Ltd', 'ipp_developer', 'active', 'approved', '2', 'default', '2026-01-01', '2026-01-01')`,
  ).run();
  db.prepare(
    `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, grid_connection_point, commercial_operation_date, status, created_at)
     VALUES ('proj_1', 'Karoo Solar One', 'par_ipp', 'build_own_operate', 'solar_pv', 75, 'Northern Cape', 'Aggeneis 132kV', '2027-06-01', 'development', '2026-02-01')`,
  ).run();
});
afterEach(() => { db.close(); });

describe('buildPrefill', () => {
  it('fills participant identity + flagship project under canonical field keys', async () => {
    const p = await buildPrefill(env, { id: 'par_ipp', role: 'ipp_developer', name: 'Thabo M' });
    // identity aliases
    expect(p.participant_id).toBe('par_ipp');
    expect(p.developer_id).toBe('par_ipp');
    expect(p.company_name).toBe('Karoo Solar (Pty) Ltd');
    expect(p.bbbee_level).toBe(2);
    // project aliases
    expect(p.project_id).toBe('proj_1');
    expect(p.project_name).toBe('Karoo Solar One');
    expect(p.capacity_mw).toBe(75);
    expect(p.technology).toBe('solar_pv');
    expect(p.grid_connection_point).toBe('Aggeneis 132kV');
    expect(p.commercial_operation_date).toBe('2027-06-01'); // sliced to YYYY-MM-DD
    // constants
    expect(p.currency).toBe('ZAR');
    expect(p.reporting_year).toBe(new Date().getFullYear());
    // ambiguous counterparty fields stay unset
    expect(p.counterparty_name).toBeUndefined();
    expect(p.borrower_name).toBeUndefined();
  });

  it('returns empty for an unknown actor', async () => {
    const p = await buildPrefill(env, { id: 'nope' });
    expect(p.participant_id).toBeUndefined();
    // constants still seed (no DB dependency)
    expect(p.currency).toBe('ZAR');
  });
});
