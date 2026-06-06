// W2 — trading-safety cascade rules. A kill-switch (algo cert suspended) or a
// STOR filing writes an active block; reinstatement / clearance lifts it; a
// role-action is pushed to the affected trader. The block row + rule audit are
// always written so a party-id↔participant mapping gap is observable.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { fireCascade } from '../src/utils/cascade';
import { _resetRegistryForTests } from '../src/utils/cascade-registry';
import { registerTradingSafetyRules } from '../src/cascade-rules/trading-safety';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerTradingSafetyRules();
});
afterEach(() => { db.close(); });

function activeBlocks(party: string, reason: string): number {
  const r = db.prepare(
    `SELECT COUNT(*) AS n FROM oe_algo_trading_blocks WHERE participant_id = ? AND block_reason = ? AND is_active = 1`,
  ).get(party, reason) as { n: number };
  return r.n;
}

describe('algo kill-switch block', () => {
  it('writes an active block + trader role-action on algo_certification.suspended', async () => {
    await fireCascade({
      event: 'algo_certification.suspended' as any,
      actor_id: 'usr_compliance', entity_type: 'algo_certification', entity_id: 'cert_1', env,
      data: { firm_party_id: 'firm_vantage' },
    });
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(1);
    const raq = db.prepare(
      `SELECT target_role, priority FROM oe_role_action_queue WHERE source_entity_id = 'cert_1'`,
    ).get() as { target_role: string; priority: string };
    expect(raq.target_role).toBe('trader');
    expect(raq.priority).toBe('urgent');
  });

  it('is idempotent — firing suspended twice leaves one active block', async () => {
    const evt = { event: 'algo_certification.suspended' as any, entity_type: 'algo_certification', entity_id: 'cert_1', env, data: { firm_party_id: 'firm_vantage' } };
    await fireCascade(evt);
    await fireCascade(evt);
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(1);
  });

  it('lifts the block on algo_certification.deployed', async () => {
    await fireCascade({ event: 'algo_certification.suspended' as any, entity_type: 'algo_certification', entity_id: 'cert_1', env, data: { firm_party_id: 'firm_vantage' } });
    await fireCascade({ event: 'algo_certification.deployed' as any, entity_type: 'algo_certification', entity_id: 'cert_1', env, data: { firm_party_id: 'firm_vantage' } });
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(0);
  });

  it('records a rule-audit row even when firm_party_id is missing (observable no-op)', async () => {
    await fireCascade({ event: 'algo_certification.suspended' as any, entity_type: 'algo_certification', entity_id: 'cert_2', env, data: {} });
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(0);
    const audit = db.prepare(
      `SELECT outcome FROM oe_cascade_rule_audit WHERE rule_id = 'safety.algo_kill_switch_block' AND source_entity_id = 'cert_2'`,
    ).get() as { outcome: string } | undefined;
    expect(audit?.outcome).toBe('ran');
  });
});

describe('market-abuse STOR freeze', () => {
  it('writes an active freeze on market_abuse.stor_filed and lifts on cleared', async () => {
    await fireCascade({ event: 'market_abuse.stor_filed' as any, entity_type: 'market_abuse_case', entity_id: 'mac_1', env, data: { subject_party_id: 'mbr_desk_07' } });
    expect(activeBlocks('mbr_desk_07', 'market_abuse_stor')).toBe(1);
    await fireCascade({ event: 'market_abuse.cleared' as any, entity_type: 'market_abuse_case', entity_id: 'mac_1', env, data: { subject_party_id: 'mbr_desk_07' } });
    expect(activeBlocks('mbr_desk_07', 'market_abuse_stor')).toBe(0);
  });
});
