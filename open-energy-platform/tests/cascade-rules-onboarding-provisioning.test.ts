import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerOnboardingProvisioningRules } from '../src/cascade-rules/onboarding-provisioning';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerOnboardingProvisioningRules();
});
afterEach(() => { db.close(); });

function seedParticipant(id: string, role: string, data: Record<string, unknown>) {
  // The participants table CHECK only allows core roles; 'esums_owner' is
  // an app-level role not in the DB CHECK constraint.  We store 'support' in
  // the DB (matching production behaviour) and pass the logical role via the
  // cascade context data field (same as fireCascade does via the JWT role).
  const dbRole = role === 'esums_owner' ? 'support' : role;
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, onboarding_step, onboarding_data, onboarding_completed)
     VALUES (?, ?, 'x', ?, ?, 'complete', ?, 1)`,
  ).run(id, `${id}@example.com`, id, dbRole, JSON.stringify(data));
}

function ctx(participantId: string, role: string) {
  return {
    event: 'onboarding.completed',
    entity_type: 'participant',
    entity_id: participantId,
    data: { role },
    actor_id: participantId,
    env,
  } as any;
}

describe('onboarding-provisioning rule', () => {
  it('esums_owner with a site name provisions a planned om_sites row owned by the participant', async () => {
    seedParticipant('p_esums', 'esums_owner', { site_name: 'Rooftop A', installed_capacity_kw: '250' });
    await runCascadeRegistry(ctx('p_esums', 'esums_owner'));

    const site = db.prepare(
      `SELECT name, participant_id, commissioning_status, capacity_mw FROM om_sites WHERE participant_id = 'p_esums'`,
    ).get() as any;
    expect(site).toMatchObject({ name: 'Rooftop A', participant_id: 'p_esums', commissioning_status: 'planned' });
    expect(site.capacity_mw).toBeCloseTo(0.25);

    const log = db.prepare(
      `SELECT kind, entity_type FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_esums' AND kind = 'om_site'`,
    ).get() as any;
    expect(log).toMatchObject({ kind: 'om_site', entity_type: 'om_sites' });
  });

  it('ipp_developer with capacity provisions a development ipp_projects row', async () => {
    seedParticipant('p_ipp', 'ipp_developer', { company_reg_no: '2010/012345/07', installed_capacity_mw: '100', technology: ['solar_pv'] });
    await runCascadeRegistry(ctx('p_ipp', 'ipp_developer'));

    const proj = db.prepare(
      `SELECT developer_id, status, capacity_mw FROM ipp_projects WHERE developer_id = 'p_ipp'`,
    ).get() as any;
    expect(proj).toMatchObject({ developer_id: 'p_ipp', status: 'development' });
    expect(proj.capacity_mw).toBeCloseTo(100);
  });

  it('is idempotent — firing twice does not double-provision', async () => {
    seedParticipant('p_dup', 'esums_owner', { site_name: 'Once Only', installed_capacity_kw: '10' });
    await runCascadeRegistry(ctx('p_dup', 'esums_owner'));
    await runCascadeRegistry(ctx('p_dup', 'esums_owner'));

    const count = db.prepare(
      `SELECT COUNT(*) AS n FROM om_sites WHERE participant_id = 'p_dup'`,
    ).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('a role with no provisionable data writes a none log row and creates no entities', async () => {
    seedParticipant('p_trader', 'trader', { entity_name: 'Acme Trading' });
    await runCascadeRegistry(ctx('p_trader', 'trader'));

    const log = db.prepare(
      `SELECT kind FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_trader'`,
    ).get() as { kind: string };
    expect(log.kind).toBe('none');
  });
});
