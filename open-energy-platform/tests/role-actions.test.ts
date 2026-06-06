import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { pushRoleAction, pendingCountForRole } from '../src/utils/role-actions';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

describe('role-actions', () => {
  it('pushRoleAction writes a pending row for the target role', async () => {
    await pushRoleAction(env, {
      target_role: 'lender',
      source_event: 'cod_evt_certified',
      source_chain_key: 'cod',
      source_entity_type: 'cod',
      source_entity_id: 'cod_1',
      title: 'Drawdown ready — authorize?',
      priority: 'high',
    });
    const row = db.prepare(
      `SELECT target_role, status, priority, title FROM oe_role_action_queue LIMIT 1`,
    ).get() as any;
    expect(row.target_role).toBe('lender');
    expect(row.status).toBe('pending');
    expect(row.priority).toBe('high');
    expect(row.title).toContain('Drawdown ready');
  });

  it('pendingCountForRole counts only pending rows for that role', async () => {
    await pushRoleAction(env, { target_role: 'lender', source_event: 'e', source_entity_type: 't', source_entity_id: 'a', title: 'A' });
    await pushRoleAction(env, { target_role: 'lender', source_event: 'e', source_entity_type: 't', source_entity_id: 'b', title: 'B' });
    await pushRoleAction(env, { target_role: 'offtaker', source_event: 'e', source_entity_type: 't', source_entity_id: 'c', title: 'C' });
    expect(await pendingCountForRole(env, 'lender')).toBe(2);
    expect(await pendingCountForRole(env, 'offtaker')).toBe(1);
    expect(await pendingCountForRole(env, 'trader')).toBe(0);
  });

  it('defaults priority to normal and status to pending', async () => {
    await pushRoleAction(env, { target_role: 'trader', source_event: 'e', source_entity_type: 't', source_entity_id: 'x', title: 'T' });
    const row = db.prepare(`SELECT priority, status FROM oe_role_action_queue LIMIT 1`).get() as any;
    expect(row.priority).toBe('normal');
    expect(row.status).toBe('pending');
  });

  it('pendingCountForRole scopes by participantId when provided (backward-compat kept)', async () => {
    // role-wide row (visible to all participants of role trader)
    await pushRoleAction(env, { target_role: 'trader', source_event: 'e', source_entity_type: 't', source_entity_id: 'w1', title: 'Wide' });
    // row targeted to par_alice only
    await pushRoleAction(env, { target_role: 'trader', target_participant_id: 'par_alice', source_event: 'e', source_entity_type: 't', source_entity_id: 'a1', title: 'Alice' });
    // row targeted to par_bob only
    await pushRoleAction(env, { target_role: 'trader', target_participant_id: 'par_bob', source_event: 'e', source_entity_type: 't', source_entity_id: 'b1', title: 'Bob' });

    // alice sees: role-wide + her own = 2 (not bob's)
    expect(await pendingCountForRole(env, 'trader', 'par_alice')).toBe(2);
    // bob sees: role-wide + his own = 2 (not alice's)
    expect(await pendingCountForRole(env, 'trader', 'par_bob')).toBe(2);
    // role-only global (backward-compat): all three rows
    expect(await pendingCountForRole(env, 'trader')).toBe(3);
  });
});
