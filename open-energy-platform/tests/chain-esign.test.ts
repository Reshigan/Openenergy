import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { listSignatories, addSignatory, recordSignature } from '../src/utils/chain-esign';
import { LockBusyError } from '../src/utils/locks';

let db: Database.Database;
let env: any;

function seedParticipant(id: string, tenant = 'default') {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 'offtaker', 'active', 'approved', ?, '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, tenant);
}

const ENTITY = 'ppa_contract_chain';
const ROW = 'ppa_row_1';

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  seedParticipant('par_a');
  seedParticipant('par_b');
  seedParticipant('par_other', 'tenant_x');
});
afterEach(() => { db.close(); });

describe('chain-esign ceremony', () => {
  it('all-signed gate flips only on the last signatory', async () => {
    expect((await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'par_a', tenantId: 'default' })).added).toBe(true);
    expect((await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'par_b', tenantId: 'default' })).added).toBe(true);

    const first = await recordSignature(env, { entityType: ENTITY, entityId: ROW, userId: 'par_a' });
    expect(first.all_signed).toBe(false);

    const second = await recordSignature(env, { entityType: ENTITY, entityId: ROW, userId: 'par_b' });
    expect(second.all_signed).toBe(true);

    const sigs = await listSignatories(env, ENTITY, ROW);
    expect(sigs.every((s) => s.signed === 1)).toBe(true);
  });

  it('rejects a cross-tenant signatory', async () => {
    const res = await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'par_other', tenantId: 'default' });
    expect(res.added).toBe(false);
    expect(res.reason).toBe('cross_tenant');
  });

  it('rejects an unknown participant', async () => {
    const res = await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'nope', tenantId: 'default' });
    expect(res.added).toBe(false);
    expect(res.reason).toBe('unknown_participant');
  });

  it('rejects a non-signatory and a double-sign', async () => {
    await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'par_a', tenantId: 'default' });

    await expect(recordSignature(env, { entityType: ENTITY, entityId: ROW, userId: 'par_b' }))
      .rejects.toMatchObject({ key: '__not_signatory__' });

    await recordSignature(env, { entityType: ENTITY, entityId: ROW, userId: 'par_a' });
    await expect(recordSignature(env, { entityType: ENTITY, entityId: ROW, userId: 'par_a' }))
      .rejects.toBeInstanceOf(LockBusyError);
  });

  it('add is idempotent on (entity, participant)', async () => {
    await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'par_a', tenantId: 'default' });
    await addSignatory(env, { entityType: ENTITY, entityId: ROW, participantId: 'par_a', tenantId: 'default' });
    const sigs = await listSignatories(env, ENTITY, ROW);
    expect(sigs.length).toBe(1);
  });
});
