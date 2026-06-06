import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { rollupMetrics } from '../src/utils/metrics-rollup';

let db: Database.Database;
let env: any;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function seedEvent(row: Record<string, unknown>) {
  const base = { id: `pev_${Math.random().toString(36).slice(2)}`, event: 'x', chain_key: 'demo',
    entity_type: 'demo', entity_id: 'e1', actor_id: 'a', source_chain_status: null,
    affected_roles: '[]', entity_value: 0, data_json: '{}', occurred_at: '2026-06-05T10:00:00.000Z' };
  const r = { ...base, ...row };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO oe_platform_events (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => (r as any)[c]));
}

describe('metrics-rollup', () => {
  it('aggregates a day into oe_metrics_daily per chain', async () => {
    seedEvent({ chain_key: 'ppa', entity_value: 100, occurred_at: '2026-06-05T08:00:00.000Z' });
    seedEvent({ chain_key: 'ppa', entity_value: 50,  occurred_at: '2026-06-05T09:00:00.000Z' });
    seedEvent({ chain_key: 'levy', entity_value: 10, occurred_at: '2026-06-05T09:00:00.000Z', event: 'levy.sla_breached' });
    seedEvent({ chain_key: 'levy', entity_value: 0,  occurred_at: '2026-06-05T11:00:00.000Z', affected_roles: '["regulator","lender"]' });

    await rollupMetrics(env, '2026-06-05');

    const ppa = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='ppa'`).get() as any;
    expect(ppa.events_count).toBe(2);
    expect(ppa.value_total_zar).toBeCloseTo(150, 6);

    const levy = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='levy'`).get() as any;
    expect(levy.events_count).toBe(2);
    expect(levy.sla_breaches).toBe(1);          // event LIKE %sla_breach%
    expect(levy.regulator_crossings).toBe(1);   // affected_roles contains regulator
  });

  it('refreshes oe_chain_metrics cumulative snapshot', async () => {
    seedEvent({ chain_key: 'ppa', entity_value: 100, occurred_at: '2026-06-05T08:00:00.000Z' });
    await rollupMetrics(env, '2026-06-05');
    const snap = db.prepare(`SELECT * FROM oe_chain_metrics WHERE chain_key='ppa'`).get() as any;
    expect(snap.value_total_zar).toBeCloseTo(100, 6);
    expect(snap.last_event_at).toBe('2026-06-05T08:00:00.000Z');
  });

  it('is idempotent — re-running the same date does not double-count', async () => {
    seedEvent({ chain_key: 'ppa', entity_value: 100, occurred_at: '2026-06-05T08:00:00.000Z' });
    await rollupMetrics(env, '2026-06-05');
    await rollupMetrics(env, '2026-06-05');
    const ppa = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='ppa'`).get() as any;
    expect(ppa.events_count).toBe(1);
    expect(ppa.value_total_zar).toBeCloseTo(100, 6);
    const cnt = db.prepare(`SELECT COUNT(*) n FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='ppa'`).get() as any;
    expect(cnt.n).toBe(1); // UNIQUE(metric_date, chain_key) upsert
  });

  it('buckets NULL/empty chain_key as unattributed', async () => {
    seedEvent({ chain_key: null, entity_value: 7, occurred_at: '2026-06-05T08:00:00.000Z' });
    await rollupMetrics(env, '2026-06-05');
    const row = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='unattributed'`).get() as any;
    expect(row.value_total_zar).toBeCloseTo(7, 6);
  });
});
