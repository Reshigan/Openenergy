// Regression: the wind@openenergy.co.za persona is an asset-owning IPP whose
// JWT role claim is the *suffixed* 'ipp_developer' (ipp→ipp_developer). The
// esums-om module gated every mutation through canMutate(), whose allow-list
// held 'ipp' but NOT 'ipp_developer', so wind 403'd on every fault / WO /
// telemetry write while its sites listed fine.
//
// These cases lock in the fix AND the tenancy invariant that lets us widen the
// role safely: an asset owner may log a fault on a site they own, but NOT on a
// site owned by someone else (ownership-scoped write — 403/404, not a 200).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import om from '../src/routes/esums-om';

let db: Database.Database;
let env: any;

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}

function seedSite(id: string, participantId: string) {
  db.prepare(
    `INSERT INTO om_sites (id, name, participant_id, technology, capacity_mw, status)
     VALUES (?, ?, ?, 'wind', 100, 'operational')`,
  ).run(id, `Site ${id}`, participantId);
}

async function tokenFor(id: string, role: string): Promise<string> {
  return signToken({ sub: id, role, email: `${id}@openenergy.co.za` } as any, 'test-secret');
}

function logFault(siteId: string, token: string) {
  return om.request(
    '/faults',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, category: 'inverter', severity: 'major', description: 'overtemp trip' }),
    },
    env,
  );
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // Two asset-owning IPPs, each owning one site.
  seedParticipant('par_wind', 'ipp_developer');
  seedParticipant('par_other', 'ipp_developer');
  seedSite('omsite_wind', 'par_wind');
  seedSite('omsite_other', 'par_other');
});
afterEach(() => { db.close(); });

describe('esums-om — asset-owner (ipp_developer) fault mutations', () => {
  it('lets an ipp_developer log a fault on a site it OWNS', async () => {
    const token = await tokenFor('par_wind', 'ipp_developer');
    const res = await logFault('omsite_wind', token);
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    const row = db.prepare(`SELECT site_id FROM om_faults WHERE id = ?`).get(body.data.id) as { site_id: string };
    expect(row.site_id).toBe('omsite_wind');
  });

  it('blocks an ipp_developer from logging a fault on a site it does NOT own', async () => {
    const token = await tokenFor('par_wind', 'ipp_developer');
    const res = await logFault('omsite_other', token);
    expect([403, 404]).toContain(res.status);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM om_faults WHERE site_id = 'omsite_other'`).get() as { c: number };
    expect(count.c).toBe(0);
  });
});
