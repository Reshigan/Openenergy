import { describe, it, expect } from 'vitest';
import {
  insertMeteringReading,
  readDbFor,
  writeDbFor,
  cachedMonthlyTotals,
  invalidateMonthlyAggregate,
} from '../src/utils/metering-router';

function stubD1(label: string) {
  const runs: Array<{ sql: string; bindings: unknown[]; label: string }> = [];
  const rows: Record<string, unknown>[] = [];
  const db = {
    label,
    runs,
    rows,
    prepare(sql: string) {
      const bindings: unknown[] = [];
      return {
        bind(...args: unknown[]) { bindings.push(...args); return this; },
        async run() { runs.push({ sql, bindings, label }); return { meta: { changes: 1 } }; },
        async first<T>(): Promise<T | null> { return (rows[0] as T) ?? null; },
        async all<T>() { return { results: rows as T[] }; },
      };
    },
  };
  return db;
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
    async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      store.set(key, value);
    },
    async delete(key: string) { store.delete(key); },
  };
}

const row = {
  id: 'mr_1',
  connection_id: 'conn_a',
  reading_date: new Date().toISOString(),
  export_kwh: 10.5,
  import_kwh: 0.2,
  peak_demand_kw: 42.1,
  power_factor: 0.98,
  reading_type: 'actual' as const,
  source: 'mic_1',
};

describe('writeDbFor', () => {
  it('returns METERING_DB_CURRENT when bound', () => {
    const main = stubD1('DB');
    const current = stubD1('CURRENT');
    const db = writeDbFor({ DB: main as never, KV: stubKV() as never, METERING_DB_CURRENT: current as never });
    expect((db as unknown as { label: string }).label).toBe('CURRENT');
  });
  it('falls back to DB when no current shard is bound', () => {
    const main = stubD1('DB');
    const db = writeDbFor({ DB: main as never, KV: stubKV() as never });
    expect((db as unknown as { label: string }).label).toBe('DB');
  });
});

describe('readDbFor', () => {
  it('routes recent dates (< 31 days) to the current shard', () => {
    const main = stubD1('DB');
    const current = stubD1('CURRENT');
    const db = readDbFor(
      { DB: main as never, KV: stubKV() as never, METERING_DB_CURRENT: current as never },
      new Date(),
    );
    expect((db as unknown as { label: string }).label).toBe('CURRENT');
  });

  it('routes old dates to the matching archive binding when present', () => {
    const main = stubD1('DB');
    const current = stubD1('CURRENT');
    const archive = stubD1('ARCHIVE_2024_01');
    const db = readDbFor(
      {
        DB: main as never,
        KV: stubKV() as never,
        METERING_DB_CURRENT: current as never,
        METERING_DB_ARCHIVE_2024_01: archive as never,
      } as never,
      new Date('2024-01-15T00:00:00Z'),
    );
    expect((db as unknown as { label: string }).label).toBe('ARCHIVE_2024_01');
  });

  it('falls back to current/DB when the archive binding is missing', () => {
    const main = stubD1('DB');
    const current = stubD1('CURRENT');
    const db = readDbFor(
      { DB: main as never, KV: stubKV() as never, METERING_DB_CURRENT: current as never },
      new Date('2020-01-15T00:00:00Z'),
    );
    expect((db as unknown as { label: string }).label).toBe('CURRENT');
  });

  it('falls back to DB when nothing is bound', () => {
    const main = stubD1('DB');
    const db = readDbFor({ DB: main as never, KV: stubKV() as never }, new Date());
    expect((db as unknown as { label: string }).label).toBe('DB');
  });

  it('handles an invalid date string safely', () => {
    const main = stubD1('DB');
    const db = readDbFor({ DB: main as never, KV: stubKV() as never }, 'not-a-date');
    expect((db as unknown as { label: string }).label).toBe('DB');
  });
});

describe('insertMeteringReading', () => {
  it('writes a single INSERT to the current shard when bound', async () => {
    const main = stubD1('DB');
    const current = stubD1('CURRENT');
    const kv = stubKV();
    const r = await insertMeteringReading(
      { DB: main as never, KV: kv as never, METERING_DB_CURRENT: current as never },
      row,
    );
    expect(r.target).toBe('current');
    expect(current.runs.length).toBe(1);
    expect(main.runs.length).toBe(0);
    expect(current.runs[0].sql).toMatch(/INSERT OR IGNORE INTO metering_readings/);
  });

  it('writes to DB when the current shard is not bound', async () => {
    const main = stubD1('DB');
    const r = await insertMeteringReading(
      { DB: main as never, KV: stubKV() as never },
      row,
    );
    expect(r.target).toBe('fallback_db');
    expect(main.runs.length).toBe(1);
  });
});

describe('cachedMonthlyTotals', () => {
  it('returns the cached value on hit, no DB call', async () => {
    const main = stubD1('DB');
    const kv = stubKV();
    kv.store.set('metering:agg:conn_a:2025-03', JSON.stringify({
      total_export_kwh: 1000, total_import_kwh: 50, reading_days: 30,
    }));
    const out = await cachedMonthlyTotals({ DB: main as never, KV: kv as never }, 'conn_a', '2025-03');
    expect(out.total_export_kwh).toBe(1000);
    expect(main.runs.length).toBe(0);
  });

  it('populates the cache on miss and writes to KV', async () => {
    const main = stubD1('DB');
    main.rows.push({ total_export_kwh: 55, total_import_kwh: 2, reading_days: 1 });
    const kv = stubKV();
    const out = await cachedMonthlyTotals({ DB: main as never, KV: kv as never }, 'conn_a', '2025-03');
    expect(out.total_export_kwh).toBe(55);
    expect(kv.store.has('metering:agg:conn_a:2025-03')).toBe(true);
  });
});

describe('invalidateMonthlyAggregate', () => {
  it('deletes the matching KV key', async () => {
    const kv = stubKV();
    kv.store.set('metering:agg:conn_a:2026-04', 'cached');
    await invalidateMonthlyAggregate(
      { DB: stubD1('DB') as never, KV: kv as never },
      'conn_a',
      '2026-04-15T12:00:00Z',
    );
    expect(kv.store.has('metering:agg:conn_a:2026-04')).toBe(false);
  });
});
