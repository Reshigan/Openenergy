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
    seedParticipant('p_esums', 'esums_owner', { site_name: 'Rooftop A', site_type: 'rooftop_pv', installed_capacity_kw: '250', location_province: 'Gauteng' });
    await runCascadeRegistry(ctx('p_esums', 'esums_owner'));

    const site = db.prepare(
      `SELECT name, participant_id, commissioning_status, capacity_mw FROM om_sites WHERE participant_id = 'p_esums'`,
    ).get() as any;
    expect(site).toMatchObject({ name: 'Rooftop A', participant_id: 'p_esums', commissioning_status: 'planned' });
    expect(site.capacity_mw).toBeCloseTo(0.25);

    const log = db.prepare(
      `SELECT kind, entity_type, manifest FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_esums' AND kind = 'om_site'`,
    ).get() as any;
    expect(log).toMatchObject({ kind: 'om_site', entity_type: 'om_sites' });

    // Every provisioning run — seed roles included — writes a getting-started manifest.
    const manifest = JSON.parse(log.manifest);
    expect(typeof manifest.headline).toBe('string');
    expect(manifest.headline.length).toBeGreaterThan(0);
    expect(manifest.profile_summary.site_name).toBe('Rooftop A');
    expect(manifest.next_actions.map((a: any) => a.route)).toEqual(
      expect.arrayContaining(['/horizon', '/new', '/atlas']),
    );
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

  it('trader seeds an electricity position-limit config row from the risk-limits step', async () => {
    seedParticipant('p_trader', 'trader', {
      trading_desk_name: 'Acme Trading', fsp_number: 'FSP-12345',
      daily_var_limit_zar: '5000000', max_open_position_mwh: '250',
    });
    await runCascadeRegistry(ctx('p_trader', 'trader'));

    const limit = db.prepare(
      `SELECT participant_id, energy_type, net_long_limit_mwh, net_short_limit_mwh, daily_pnl_floor_zar
         FROM oe_position_limits WHERE participant_id = 'p_trader'`,
    ).get() as any;
    expect(limit).toMatchObject({ participant_id: 'p_trader', energy_type: 'electricity' });
    expect(limit.net_long_limit_mwh).toBeCloseTo(250);
    expect(limit.net_short_limit_mwh).toBeCloseTo(250);
    expect(limit.daily_pnl_floor_zar).toBeCloseTo(-5000000); // VaR limit becomes a P&L loss floor

    const log = db.prepare(
      `SELECT kind, entity_type, manifest FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_trader'`,
    ).get() as any;
    expect(log).toMatchObject({ kind: 'position_limit', entity_type: 'oe_position_limits' });
    expect(JSON.parse(log.manifest).profile_summary.trading_desk_name).toBe('Acme Trading');
  });

  it('a role with no seedable entity (lender) writes a manifest log row and creates no business entity', async () => {
    seedParticipant('p_lender', 'lender', {
      fund_name: 'Helios Infra Fund', aum_zar_m: '4200', target_irr_pct: '15', fund_strategy: 'greenfield',
    });
    await runCascadeRegistry(ctx('p_lender', 'lender'));

    const log = db.prepare(
      `SELECT kind, entity_type, entity_id, manifest FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_lender'`,
    ).get() as any;
    expect(log.kind).toBe('manifest');
    expect(log.entity_type).toBeNull();
    expect(log.entity_id).toBeNull();

    const manifest = JSON.parse(log.manifest);
    expect(manifest.headline.length).toBeGreaterThan(0);
    expect(manifest.profile_summary.fund_name).toBe('Helios Infra Fund');
    expect(manifest.next_actions.length).toBeGreaterThanOrEqual(3);
  });
});
