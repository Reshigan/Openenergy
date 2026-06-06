// Week-1 foundation — schema presence + shape tests. Proves migrations
// 475–479 apply cleanly via the real SQLite façade and expose the columns
// the Layer A/B/C/D utils depend on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';

let db: Database.Database;

beforeAll(() => { db = createTestDb({ applyMigrations: true }); });
afterAll(() => { db.close(); });

function columns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(r => r.name);
}

describe('migration 475 — Layer B revenue', () => {
  it('oe_fee_schedule exists with required columns', () => {
    const cols = columns('oe_fee_schedule');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'trigger_event', 'fee_type', 'rate', 'min_fee_zar', 'max_fee_zar',
      'applicable_tiers', 'payer_role', 'payer_resolution', 'is_enabled', 'description',
    ]));
  });

  it('oe_platform_revenue exists with required columns', () => {
    const cols = columns('oe_platform_revenue');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'trigger_event', 'entity_id', 'entity_type', 'participant_id', 'payer_role',
      'entity_value', 'fee_zar', 'fee_schedule_id', 'billing_period', 'invoice_id', 'status', 'recorded_at',
    ]));
  });

  it('oe_revenue_splits exists with required columns', () => {
    const cols = columns('oe_revenue_splits');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'revenue_id', 'party_role', 'party_id', 'share_pct', 'amount_zar',
    ]));
  });
});

describe('migration 476 — Layer C role queue', () => {
  it('oe_role_action_queue exists with required columns', () => {
    const cols = columns('oe_role_action_queue');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'target_role', 'target_participant_id', 'source_event', 'source_chain_key',
      'source_entity_type', 'source_entity_id', 'title', 'body_json', 'cross_option_json',
      'priority', 'status', 'sla_due_at', 'actioned_by', 'actioned_at',
    ]));
  });
});

describe('migration 477 — Layer A cascade audit', () => {
  it('oe_cascade_rule_audit exists with required columns', () => {
    const cols = columns('oe_cascade_rule_audit');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'rule_id', 'source_event', 'source_entity_type', 'source_entity_id', 'mode', 'outcome', 'detail',
    ]));
  });
  it('oe_algo_trading_blocks exists with required columns', () => {
    const cols = columns('oe_algo_trading_blocks');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'participant_id', 'algo_cert_id', 'block_reason', 'source_event', 'is_active', 'lifted_at', 'lifted_by',
    ]));
  });
});

describe('migration 478 — Layer D event sink', () => {
  it('oe_platform_events exists with required columns', () => {
    const cols = columns('oe_platform_events');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'event', 'chain_key', 'entity_type', 'entity_id', 'actor_id',
      'source_chain_status', 'affected_roles', 'entity_value', 'data_json', 'occurred_at',
    ]));
  });
});

describe('migration 479 — Layer D rollups', () => {
  it('oe_metrics_daily exists with required columns', () => {
    const cols = columns('oe_metrics_daily');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'metric_date', 'chain_key', 'events_count', 'value_total_zar', 'sla_breaches', 'regulator_crossings',
    ]));
  });
  it('oe_chain_metrics exists with required columns', () => {
    const cols = columns('oe_chain_metrics');
    expect(cols).toEqual(expect.arrayContaining([
      'chain_key', 'open_count', 'terminal_count', 'breach_count', 'value_total_zar', 'last_event_at',
    ]));
  });
});
