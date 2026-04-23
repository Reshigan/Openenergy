import { describe, it, expect, vi } from 'vitest';
import { insertMeteringReading, readFromHyperdrive } from '../src/utils/hyperdrive';

function stubD1() {
  const runs: Array<{ sql: string; bindings: unknown[] }> = [];
  return {
    runs,
    prepare(sql: string) {
      const bindings: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bindings.push(...args);
          return this;
        },
        async run() {
          runs.push({ sql, bindings });
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

function stubHyperdrive(ok = true) {
  const queries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  return {
    queries,
    async connect() {
      if (!ok) throw new Error('connect failed');
      return {
        async query(sql: string, params?: unknown[]) {
          queries.push({ sql, params });
          return { rows: [] };
        },
        release() { /* noop */ },
      };
    },
  };
}

const row = {
  id: 'mr_test',
  connection_id: 'conn_a',
  reading_date: '2026-04-23T10:30:00Z',
  export_kwh: 10.5,
  import_kwh: 0.2,
  peak_demand_kw: 42.1,
  power_factor: 0.98,
  reading_type: 'actual' as const,
  source: 'mic_scada_1',
};

describe('insertMeteringReading', () => {
  it('writes to D1 only when Hyperdrive binding is absent', async () => {
    const db = stubD1();
    const r = await insertMeteringReading({ DB: db as never }, row);
    expect(r.target).toBe('d1');
    expect(r.dualWrote).toBe(false);
    expect(db.runs.length).toBe(1);
    expect(db.runs[0].sql).toMatch(/INSERT INTO metering_readings/);
  });

  it('writes to Hyperdrive (primary) + D1 (dual-write) when binding present', async () => {
    const db = stubD1();
    const hd = stubHyperdrive();
    const r = await insertMeteringReading({ DB: db as never, HYPERDRIVE_DB: hd as never }, row);
    expect(r.target).toBe('hyperdrive');
    expect(r.dualWrote).toBe(true);
    expect(hd.queries.length).toBe(1);
    expect(hd.queries[0].sql).toMatch(/INSERT INTO metering_readings/);
    expect(db.runs.length).toBe(1);
  });

  it('skips the D1 dual-write when explicitly disabled', async () => {
    const db = stubD1();
    const hd = stubHyperdrive();
    const r = await insertMeteringReading(
      { DB: db as never, HYPERDRIVE_DB: hd as never },
      row,
      { dualWrite: false },
    );
    expect(r.target).toBe('hyperdrive');
    expect(r.dualWrote).toBe(false);
    expect(hd.queries.length).toBe(1);
    expect(db.runs.length).toBe(0);
  });

  it('falls back to D1 when Hyperdrive connect() throws', async () => {
    const db = stubD1();
    const hd = stubHyperdrive(false);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
    const r = await insertMeteringReading({ DB: db as never, HYPERDRIVE_DB: hd as never }, row);
    expect(r.target).toBe('d1');
    expect(db.runs.length).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      'hyperdrive_insert_failed',
      expect.stringMatching(/connect failed/),
    );
    spy.mockRestore();
  });

  it('passes all columns to Postgres in the expected order', async () => {
    const db = stubD1();
    const hd = stubHyperdrive();
    await insertMeteringReading({ DB: db as never, HYPERDRIVE_DB: hd as never }, row);
    const q = hd.queries[0];
    expect(q.params).toEqual([
      'mr_test', 'conn_a', '2026-04-23T10:30:00Z',
      10.5, 0.2, 42.1, 0.98, 'actual', 'mic_scada_1', null,
    ]);
  });
});

describe('readFromHyperdrive', () => {
  it('is false when the binding is absent', () => {
    expect(readFromHyperdrive({})).toBe(false);
  });
  it('is false when the binding is present but flag is not set to hyperdrive', () => {
    expect(readFromHyperdrive({ HYPERDRIVE_DB: {} as never })).toBe(false);
    expect(readFromHyperdrive({ HYPERDRIVE_DB: {} as never, METERING_READ_SOURCE: 'd1' })).toBe(false);
  });
  it('is true when binding is present AND flag is hyperdrive', () => {
    expect(readFromHyperdrive({ HYPERDRIVE_DB: {} as never, METERING_READ_SOURCE: 'hyperdrive' })).toBe(true);
  });
});
