// W3 — lifecycle sequencing drive rules. Each rule reads ctx.data (the source
// chain spreads its full row in) and writes downstream tables + role-action
// prompts as the system:cascade actor. Tests exercise rule.run() directly.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import {
  registerLifecycleSequencingRules,
  __lifecycleRulesForTest,
} from '../src/cascade-rules/lifecycle-sequencing';

function ruleById(id: string) {
  const r = __lifecycleRulesForTest().find((x) => x.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return r;
}

function ctxFor(
  env: any,
  event: string,
  entity_type: string,
  entity_id: string,
  data: Record<string, unknown>,
): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}

describe('registerLifecycleSequencingRules — registration', () => {
  it('registers exactly four rules after Task 5 (no duplicates on re-call)', () => {
    registerLifecycleSequencingRules();
    registerLifecycleSequencingRules(); // second call must not duplicate
    expect(__lifecycleRulesForTest().length).toBe(4);
  });
});

describe('#4 reserve_account.breached → loan default', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  const data = {
    borrower_name: 'Aurora Solar SPV', lender_name: 'Standard Bank',
    project_id: 'proj_aurora', facility_ref: 'FAC-AURORA-SNR',
    loan_agreement_ref: 'LA-2024-AUR', reserve_number: 'RSA-AURORA-1', reserve_tier: 'large',
  };

  it('creates a default_flagged loan-default row + an urgent lender prompt', async () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_1', data));

    const def = db.prepare(
      `SELECT * FROM oe_loan_defaults WHERE source_entity_type='reserve_account' AND source_entity_id='rsa_1'`,
    ).get() as any;
    expect(def).toBeTruthy();
    expect(def.chain_status).toBe('default_flagged');
    expect(def.borrower_party_name).toBe('Aurora Solar SPV');
    expect(def.facility_tier).toBe('senior_secured');
    expect(def.created_by).toBe('system:cascade');

    const action = db.prepare(
      `SELECT * FROM oe_role_action_queue WHERE target_role='lender' AND source_entity_id=?`,
    ).get(def.id) as any;
    expect(action).toBeTruthy();
    expect(action.priority).toBe('urgent');
  });

  it('is idempotent — a second fire creates no second row', async () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_1', data));
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_1', data));
    const n = db.prepare(
      `SELECT COUNT(*) c FROM oe_loan_defaults WHERE source_entity_id='rsa_1'`,
    ).get() as any;
    expect(n.c).toBe(1);
  });

  it('no-ops when borrower_name is missing', async () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_2', { lender_name: 'x' }));
    const n = db.prepare(`SELECT COUNT(*) c FROM oe_loan_defaults`).get() as any;
    expect(n.c).toBe(0);
  });
});

describe('#7 licence_application.licence_issued → levy + renewal', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  function genData(over: Record<string, unknown> = {}) {
    return {
      applicant_party_id: 'party_kuyasa', applicant_party_name: 'Kuyasa Energy (Pty) Ltd',
      licence_type: 'generation', licence_class: 'standard_licence',
      licence_ref: 'NERSA-GEN-2026-014', licence_issued_at: '2026-06-06T00:00:00.000Z',
      facility_name: 'Kuyasa Wind 1', capacity_mw: 140, ...over,
    };
  }

  it('creates a placeholder levy AND a renewal for a generation licence + a regulator prompt', async () => {
    const r = ruleById('lifecycle.licence_issued_to_levy_and_renewal');
    await r.run(ctxFor(env, 'licence_application.licence_issued', 'licence_application', 'lic_1', genData()));

    const levy = db.prepare(`SELECT * FROM oe_regulator_levies WHERE source_entity_id='lic_1'`).get() as any;
    expect(levy).toBeTruthy();
    expect(levy.sector).toBe('electricity');
    expect(levy.levy_basis).toBe('turnover_based');
    expect(levy.levy_tier).toBe('micro');
    expect(levy.assessed_amount).toBe(0);
    expect(levy.chain_status).toBe('levy_assessed');
    expect(levy.licensee_name).toBe('Kuyasa Energy (Pty) Ltd');

    const ren = db.prepare(`SELECT * FROM oe_licence_renewals WHERE source_entity_id='lic_1'`).get() as any;
    expect(ren).toBeTruthy();
    expect(ren.licence_type).toBe('generation');
    expect(ren.licence_class).toBe('generation_utility');
    expect(ren.chain_status).toBe('renewal_initiated');
    expect(ren.current_expiry_date.startsWith('2051-')).toBe(true); // issued 2026 + 25y

    const action = db.prepare(`SELECT * FROM oe_role_action_queue WHERE target_role='regulator' AND source_entity_id='lic_1'`).get() as any;
    expect(action).toBeTruthy();
  });

  it('skips the renewal for a transmission licence but still creates the levy', async () => {
    const r = ruleById('lifecycle.licence_issued_to_levy_and_renewal');
    await r.run(ctxFor(env, 'licence_application.licence_issued', 'licence_application', 'lic_2', genData({ licence_type: 'transmission' })));
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_regulator_levies WHERE source_entity_id='lic_2'`).get() as any).toMatchObject({ c: 1 });
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_licence_renewals WHERE source_entity_id='lic_2'`).get() as any).toMatchObject({ c: 0 });
  });

  it('is idempotent across both tables', async () => {
    const r = ruleById('lifecycle.licence_issued_to_levy_and_renewal');
    const ctx = ctxFor(env, 'licence_application.licence_issued', 'licence_application', 'lic_3', genData());
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_regulator_levies WHERE source_entity_id='lic_3'`).get() as any).toMatchObject({ c: 1 });
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_licence_renewals WHERE source_entity_id='lic_3'`).get() as any).toMatchObject({ c: 1 });
  });
});

describe('#3 covenant_certificate.breach_identified → reserve cure + lender prompt', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  function seedReserve(status: string) {
    db.prepare(
      `INSERT INTO oe_reserve_account_chain
         (id, reserve_number, lender_name, borrower_name, target_amount_zar, reserve_tier,
          chain_status, reserve_required_at, created_by, created_at, updated_at)
       VALUES ('rsa_x','RSA-X','Standard Bank','Aurora Solar SPV', 50000000, 'large',
               ?, '2026-01-01', 'seed', '2026-01-01','2026-01-01')`,
    ).run(status);
  }
  const data = { borrower_party_name: 'Aurora Solar SPV', facility_name: 'Aurora Senior Facility', facility_tier: 'senior_secured', breached_covenants: 'DSCR' };

  it('moves a funded reserve to cure_pending + prompts the lender', async () => {
    seedReserve('funded');
    const r = ruleById('lifecycle.covenant_breach_to_reserve_cure');
    await r.run(ctxFor(env, 'covenant_certificate.breach_identified', 'covenant_certificate', 'cov_1', data));
    expect((db.prepare(`SELECT chain_status FROM oe_reserve_account_chain WHERE id='rsa_x'`).get() as any).chain_status).toBe('cure_pending');
    const evt = db.prepare(`SELECT * FROM oe_reserve_account_chain_events WHERE reserve_account_id='rsa_x' AND to_status='cure_pending'`).get() as any;
    expect(evt.actor_id).toBe('system:cascade');
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE target_role='lender' AND source_entity_id='cov_1'`).get() as any).toMatchObject({ c: 1 });
  });

  it('prompts the lender even when no matching reserve account exists', async () => {
    const r = ruleById('lifecycle.covenant_breach_to_reserve_cure');
    await r.run(ctxFor(env, 'covenant_certificate.breach_identified', 'covenant_certificate', 'cov_2', data));
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cov_2'`).get() as any).toMatchObject({ c: 1 });
  });

  it('is idempotent', async () => {
    seedReserve('funded');
    const r = ruleById('lifecycle.covenant_breach_to_reserve_cure');
    const ctx = ctxFor(env, 'covenant_certificate.breach_identified', 'covenant_certificate', 'cov_3', data);
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cov_3'`).get() as any).toMatchObject({ c: 1 });
  });
});

describe('#1 cod.cod_certified → PPA activate + lender drawdown prompt', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  function seedPpa(status: string) {
    db.prepare(
      `INSERT INTO oe_ppa_contract_chain
         (id, ppa_number, project_id, participant_id, offtaker_id, project_name, offtaker_name,
          capacity_mw, capacity_tier, chain_status, executed_at, created_by, created_at, updated_at)
       VALUES ('ppa_1','PPA-1','proj_x','party_ipp','party_off','Project X','Eskom',
               140,'medium',?, '2026-01-01', 'seed', '2026-01-01','2026-01-01')`,
    ).run(status);
  }
  const data = { participant_id: 'party_ipp', project_id: 'proj_x', project_name: 'Project X', capacity_mw: 140, capacity_tier: 'medium' };

  it('advances an executed PPA to in_force, writes an event row, and prompts the lender', async () => {
    seedPpa('executed');
    const r = ruleById('lifecycle.cod_certified_to_ppa_and_drawdown');
    await r.run(ctxFor(env, 'cod.cod_certified', 'cod_chain', 'cod_1', data));

    const ppa = db.prepare(`SELECT * FROM oe_ppa_contract_chain WHERE id='ppa_1'`).get() as any;
    expect(ppa.chain_status).toBe('in_force');
    expect(ppa.in_force_at).toBeTruthy();
    const evt = db.prepare(`SELECT * FROM oe_ppa_contract_chain_events WHERE ppa_id='ppa_1' AND to_status='in_force'`).get() as any;
    expect(evt.actor_id).toBe('system:cascade');

    const action = db.prepare(`SELECT * FROM oe_role_action_queue WHERE target_role='lender' AND source_entity_id='cod_1'`).get() as any;
    expect(action).toBeTruthy();
  });

  it('does not force a non-executed PPA but still prompts the lender', async () => {
    seedPpa('draft');
    const r = ruleById('lifecycle.cod_certified_to_ppa_and_drawdown');
    await r.run(ctxFor(env, 'cod.cod_certified', 'cod_chain', 'cod_2', data));
    expect((db.prepare(`SELECT chain_status FROM oe_ppa_contract_chain WHERE id='ppa_1'`).get() as any).chain_status).toBe('draft');
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cod_2'`).get() as any).toMatchObject({ c: 1 });
  });

  it('is idempotent on the lender prompt', async () => {
    seedPpa('executed');
    const r = ruleById('lifecycle.cod_certified_to_ppa_and_drawdown');
    const ctx = ctxFor(env, 'cod.cod_certified', 'cod_chain', 'cod_3', data);
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cod_3'`).get() as any).toMatchObject({ c: 1 });
  });
});
