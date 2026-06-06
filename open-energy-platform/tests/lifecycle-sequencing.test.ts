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
  it('registers exactly one rule after Task 2 (no duplicates on re-call)', () => {
    registerLifecycleSequencingRules();
    registerLifecycleSequencingRules(); // second call must not duplicate
    expect(__lifecycleRulesForTest().length).toBe(1);
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
