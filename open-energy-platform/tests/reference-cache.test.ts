import { describe, it, expect } from 'vitest';
import { cachedAll, cachedFirst, invalidateReference } from '../src/utils/reference-cache';

function stubD1() {
  const prepares: string[] = [];
  return {
    prepares,
    prepare(sql: string) {
      prepares.push(sql);
      const binds: unknown[] = [];
      return {
        bind(...args: unknown[]) { binds.push(...args); return this; },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: [{ id: 'x', value: 'y' } as unknown as T] };
        },
        async first<T>(): Promise<T | null> {
          return { id: 'x', value: 'y' } as unknown as T;
        },
      };
    },
  };
}

function stubKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: 'json') {
      const v = store.get(key);
      if (v == null) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string, _opts?: unknown) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
  };
}

describe('cachedAll', () => {
  it('first call hits D1; second call is served from KV', async () => {
    const db = stubD1();
    const kv = stubKV();
    const env = { DB: db as never, KV: kv as never };
    await cachedAll(env, 'test_products', 'SELECT id, value FROM products WHERE enabled = 1');
    expect(db.prepares.length).toBe(1);
    // Cache populated.
    expect(kv.store.has('ref:test_products')).toBe(true);
    // Second call — no new prepare.
    await cachedAll(env, 'test_products', 'SELECT id, value FROM products WHERE enabled = 1');
    expect(db.prepares.length).toBe(1);
  });

  it('invalidateReference drops the cache so the next call re-hits D1', async () => {
    const db = stubD1();
    const kv = stubKV();
    const env = { DB: db as never, KV: kv as never };
    await cachedAll(env, 'test_products', 'SELECT ...');
    await cachedAll(env, 'test_products', 'SELECT ...');
    expect(db.prepares.length).toBe(1);
    await invalidateReference(env, 'test_products');
    await cachedAll(env, 'test_products', 'SELECT ...');
    expect(db.prepares.length).toBe(2);
  });
});

describe('cachedFirst', () => {
  it('caches a single row response', async () => {
    const db = stubD1();
    const kv = stubKV();
    const env = { DB: db as never, KV: kv as never };
    const row1 = await cachedFirst(env, 'test_row:1', 'SELECT id FROM products WHERE id = ?', ['1']);
    const row2 = await cachedFirst(env, 'test_row:1', 'SELECT id FROM products WHERE id = ?', ['1']);
    expect(row1).toEqual(row2);
    expect(db.prepares.length).toBe(1);
  });
});
