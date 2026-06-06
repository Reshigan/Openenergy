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
  it('registers exactly two rules after Task 3 (no duplicates on re-call)', () => {
    registerLifecycleSequencingRules();
    registerLifecycleSequencingRules(); // second call must not duplicate
    expect(__lifecycleRulesForTest().length).toBe(2);
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
