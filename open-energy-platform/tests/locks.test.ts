import { describe, it, expect, beforeEach } from 'vitest';
import { acquireLock, releaseLock, withLock, LockBusyError } from '../src/utils/locks';
import { MockD1, mockEnv } from './helpers/d1-mock';

describe('LockBusyError', () => {
  it('stores the key on err.key (switchable without regex)', () => {
    const err = new LockBusyError('contract:ct_123:sign');
    expect(err.key).toBe('contract:ct_123:sign');
  });

  it('prepends "lock busy: " to err.message (so err.message !== err.key)', () => {
    const err = new LockBusyError('x');
    expect(err.message).toBe('lock busy: x');
    expect(err.key).not.toBe(err.message);
  });

  it('is an instanceof Error', () => {
    expect(new LockBusyError('k')).toBeInstanceOf(Error);
  });
});

describe('acquireLock — happy path', () => {
  let db: MockD1;
  beforeEach(() => { db = new MockD1(); });

  it('grants the lock when no row exists', async () => {
    const ok = await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    expect(ok).toBe(true);
    expect(db.tables['advisory_locks']).toHaveLength(1);
    expect(db.tables['advisory_locks'][0]).toMatchObject({ lock_key: 'ct:1', holder_id: 'p_alice' });
  });

  it('rejects a second holder while the first is fresh', async () => {
    expect(await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15)).toBe(true);
    expect(await acquireLock(mockEnv(db) as any, 'ct:1', 'p_bob', 15)).toBe(false);
  });
});

describe('acquireLock — stale-lock stealing', () => {
  it('steals a lock that has expired', async () => {
    // Pretend "now" is fixed so the expiry calculation is deterministic.
    const db = new MockD1({ nowIso: () => '2026-01-01T00:00:30.000Z' });
    // Seed a stale lock from 2024 directly.
    db.tables['advisory_locks'] = [{
      lock_key: 'ct:1',
      holder_id: 'p_ghost',
      acquired_at: '2024-01-01T00:00:00Z',
      expires_at: '2024-01-01T00:00:15Z',
      context: null,
    }];
    const ok = await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    expect(ok).toBe(true);
    expect(db.tables['advisory_locks'][0].holder_id).toBe('p_alice');
  });

  it('does NOT steal a lock that is still within TTL', async () => {
    const db = new MockD1({ nowIso: () => '2026-01-01T00:00:00.000Z' });
    db.tables['advisory_locks'] = [{
      lock_key: 'ct:1',
      holder_id: 'p_ghost',
      acquired_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-01-01T00:01:00Z',
      context: null,
    }];
    const ok = await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    expect(ok).toBe(false);
    expect(db.tables['advisory_locks'][0].holder_id).toBe('p_ghost');
  });
});

describe('releaseLock', () => {
  it('removes only the row matching (key, holder_id)', async () => {
    const db = new MockD1();
    await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    await releaseLock(mockEnv(db) as any, 'ct:1', 'p_alice');
    expect(db.tables['advisory_locks']).toHaveLength(0);
  });

  it('is a no-op when called by a non-holder (avoids accidental release)', async () => {
    const db = new MockD1();
    await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    await releaseLock(mockEnv(db) as any, 'ct:1', 'p_mallory');
    expect(db.tables['advisory_locks']).toHaveLength(1);
  });
});

describe('withLock', () => {
  it('runs the body and releases after success', async () => {
    const db = new MockD1();
    const result = await withLock(mockEnv(db) as any, 'ct:1', 'p_alice', async () => 42);
    expect(result).toBe(42);
    expect(db.tables['advisory_locks']).toHaveLength(0);
  });

  it('releases the lock even if the body throws', async () => {
    const db = new MockD1();
    await expect(
      withLock(mockEnv(db) as any, 'ct:1', 'p_alice', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.tables['advisory_locks']).toHaveLength(0);
  });

  it('throws LockBusyError (not swallowed) when the lock is taken', async () => {
    const db = new MockD1();
    await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    await expect(
      withLock(mockEnv(db) as any, 'ct:1', 'p_bob', async () => 1),
    ).rejects.toBeInstanceOf(LockBusyError);
  });

  it('rethrown LockBusyError carries the raw key for .key-based switches', async () => {
    const db = new MockD1();
    await acquireLock(mockEnv(db) as any, 'ct:1', 'p_alice', 15);
    try {
      await withLock(mockEnv(db) as any, 'ct:1', 'p_bob', async () => 1);
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(LockBusyError);
      expect((err as LockBusyError).key).toBe('ct:1');
      // This is the regression fired by PR #51: contracts.ts:394 and
      // trading.ts:182 used to switch on err.message, which is prefixed.
      expect((err as LockBusyError).message).not.toBe('ct:1');
    }
  });
});
