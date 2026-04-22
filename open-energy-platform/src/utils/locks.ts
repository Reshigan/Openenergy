// ═══════════════════════════════════════════════════════════════════════════
// Advisory locks — lightweight first-writer-wins named locks with TTL
// ═══════════════════════════════════════════════════════════════════════════
// D1 does not expose row-level pessimistic locks, so we simulate short-lived
// serialisation using a table with a UNIQUE PRIMARY KEY on the lock name.
//
//   acquireLock  — INSERT OR IGNORE, then verify we inserted. If a stale
//                  lock exists (expires_at < now) we steal it in a second
//                  attempt. Returns true if this caller holds the lock.
//   releaseLock  — DELETE WHERE holder matches. Safe to call from `finally`.
//   withLock     — try/acquire/run/release wrapper; throws a well-known
//                  error class if the lock cannot be acquired.
//
// This is NOT a distributed mutex. Two callers who both race past a stale
// TTL will both steal. Keep `ttlSeconds` tight (5-30s) for the operation.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoEnv } from './types';

export class LockBusyError extends Error {
  constructor(public readonly key: string) {
    super(`lock busy: ${key}`);
    this.name = 'LockBusyError';
  }
}

export async function acquireLock(
  env: HonoEnv,
  key: string,
  holderId: string,
  ttlSeconds: number = 15,
  context?: Record<string, unknown>,
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const contextJson = context ? JSON.stringify(context) : null;

  try {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO advisory_locks (lock_key, holder_id, expires_at, context)
         VALUES (?, ?, ?, ?)`,
    )
      .bind(key, holderId, expiresAt, contextJson)
      .run();

    if (res?.meta?.changes && res.meta.changes > 0) return true;
  } catch (err) {
    console.error('acquireLock insert failed', err);
    return false;
  }

  // Steal if stale.
  try {
    const stolen = await env.DB.prepare(
      `UPDATE advisory_locks
          SET holder_id = ?, acquired_at = datetime('now'), expires_at = ?, context = ?
        WHERE lock_key = ? AND expires_at < datetime('now')`,
    )
      .bind(holderId, expiresAt, contextJson, key)
      .run();

    return !!(stolen?.meta?.changes && stolen.meta.changes > 0);
  } catch (err) {
    console.error('acquireLock steal failed', err);
    return false;
  }
}

export async function releaseLock(env: HonoEnv, key: string, holderId: string): Promise<void> {
  try {
    await env.DB.prepare(`DELETE FROM advisory_locks WHERE lock_key = ? AND holder_id = ?`)
      .bind(key, holderId)
      .run();
  } catch (err) {
    console.error('releaseLock failed (safe to ignore — TTL will reap):', err);
  }
}

export async function withLock<T>(
  env: HonoEnv,
  key: string,
  holderId: string,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number; context?: Record<string, unknown> } = {},
): Promise<T> {
  const ok = await acquireLock(env, key, holderId, opts.ttlSeconds ?? 15, opts.context);
  if (!ok) throw new LockBusyError(key);
  try {
    return await fn();
  } finally {
    await releaseLock(env, key, holderId);
  }
}
