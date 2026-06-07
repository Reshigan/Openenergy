// POST /sites attributes the new site's owner. A non-officer must not be able to
// plant a site into another participant's namespace by passing a foreign
// participant_id in the body; only platform officers (admin/support) may set an
// owner other than themselves (on-behalf onboarding). Mirrors OM_OFFICER_ROLES.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import om from '../src/routes/esums-om';

let db: Database.Database;
let env: any;

beforeEach(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => db.close());

describe('POST /sites owner attribution', () => {
  it('forces a non-officer site owner to the caller, ignoring a foreign participant_id', async () => {
    const token = await testJwtFor(db, 'par_ipp', { role: 'ipp_developer' });
    const res = await call(om, env, 'POST', '/sites', {
      token, body: { name: 'S1', capacity_mw: 5, participant_id: 'par_victim' },
    });
    expect(res.status).toBe(201);
    const id = (res.json as any).data.id;
    const row = db.prepare('SELECT participant_id FROM om_sites WHERE id=?').get(id) as any;
    expect(row.participant_id).toBe('par_ipp');
  });

  it('lets an officer set a foreign owner (on-behalf onboarding)', async () => {
    const token = await testJwtFor(db, 'par_admin', { role: 'admin' });
    const res = await call(om, env, 'POST', '/sites', {
      token, body: { name: 'S2', capacity_mw: 5, participant_id: 'par_owner' },
    });
    expect(res.status).toBe(201);
    const id = (res.json as any).data.id;
    const row = db.prepare('SELECT participant_id FROM om_sites WHERE id=?').get(id) as any;
    expect(row.participant_id).toBe('par_owner');
  });

  it('defaults a non-officer site owner to the caller when no participant_id is given', async () => {
    const token = await testJwtFor(db, 'par_solo', { role: 'ipp_developer' });
    const res = await call(om, env, 'POST', '/sites', {
      token, body: { name: 'S3', capacity_mw: 5 },
    });
    expect(res.status).toBe(201);
    const id = (res.json as any).data.id;
    const row = db.prepare('SELECT participant_id FROM om_sites WHERE id=?').get(id) as any;
    expect(row.participant_id).toBe('par_solo');
  });
});
