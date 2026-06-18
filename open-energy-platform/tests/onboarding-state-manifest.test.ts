import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import onboarding from '../src/routes/onboarding';

let db: Database.Database;
let env: any;
let token: string;

beforeEach(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  token = await testJwtFor(db, 'par_trader', { role: 'trader' });
});
afterEach(() => { db.close(); });

function seedManifest(participantId: string, role: string, manifest: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO oe_onboarding_provisioning_log
       (id, participant_id, role, kind, entity_type, entity_id, detail_json, manifest, created_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))`,
  ).run(`prov_${participantId}`, participantId, role, 'manifest', null, null, '{}', JSON.stringify(manifest));
}

describe('GET /api/onboarding/state — manifest exposure', () => {
  it('returns the getting-started manifest from the provisioning log', async () => {
    const manifest = {
      headline: 'Acme Trading is live with electricity position limits.',
      profile_summary: { trading_desk_name: 'Acme Trading' },
      next_actions: [
        { key: 'horizon', label: 'Open your workspace', route: '/horizon', description: 'Live cases.' },
        { key: 'new', label: 'Start a transaction', route: '/new', description: 'Pick a workflow.' },
        { key: 'atlas', label: 'Browse all functions', route: '/atlas', description: 'Function library.' },
      ],
    };
    seedManifest('par_trader', 'trader', manifest);

    const res = await call(onboarding, env, 'GET', '/state', { token });
    expect(res.status).toBe(200);
    const data = (res.json as any).data;
    expect(data.manifest).toBeTruthy();
    expect(data.manifest.headline).toBe(manifest.headline);
    expect(data.manifest.profile_summary.trading_desk_name).toBe('Acme Trading');
    expect(data.manifest.next_actions.map((a: any) => a.route)).toEqual(
      expect.arrayContaining(['/horizon', '/new', '/atlas']),
    );
  });

  it('returns manifest:null when no provisioning row exists yet', async () => {
    const res = await call(onboarding, env, 'GET', '/state', { token });
    expect(res.status).toBe(200);
    expect((res.json as any).data.manifest).toBeNull();
  });
});
