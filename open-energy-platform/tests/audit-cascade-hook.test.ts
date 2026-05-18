// ════════════════════════════════════════════════════════════════════════
// audit-cascade-hook.test.ts — proves the L5 auto-audit hook fires on
// every cascade event and routes to the correct per-feature chain.
//
// Covers:
//   1. firing a `trade.*` cascade advances the 'trading' chain by 1
//   2. firing an `invoice.*` cascade advances the 'settlement' chain by 1
//   3. firing a `popia.*` cascade advances the 'admin' chain by 1
//   4. cascades fired with skipAudit: true do NOT touch the chain
//   5. the `audit.event_appended` event does NOT recurse
//      (would otherwise blow up with unbounded recursion)
// ════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { fireCascade } from '../src/utils/cascade';
import { getChainHead } from '../src/utils/audit-chain';

let envObj: any;

beforeEach(() => {
  const db = createTestDb({ applyMigrations: true });
  envObj = envFor(db);
});

describe('cascade auto-audit hook', () => {
  it('routes trade.* events to the trading chain', async () => {
    await fireCascade({
      event: 'trade.order_placed',
      actor_id: 'u1', entity_type: 'trade_orders', entity_id: 'o1',
      data: { side: 'buy', vol: 1 }, env: envObj,
    });
    const head = await getChainHead(envObj, 'trading');
    expect(head?.head_sequence).toBe(1);
    expect(head?.head_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('routes invoice.* + dispute.* events to the settlement chain', async () => {
    await fireCascade({
      event: 'invoice.paid',
      actor_id: 'u1', entity_type: 'invoices', entity_id: 'inv1',
      data: { amount: 100 }, env: envObj,
    });
    await fireCascade({
      event: 'dispute.filed',
      actor_id: 'u2', entity_type: 'settlement_disputes', entity_id: 'd1',
      data: { reason: 'mismatch' }, env: envObj,
    });
    const head = await getChainHead(envObj, 'settlement');
    expect(head?.head_sequence).toBe(2);
  });

  it('routes popia.* events to the admin chain', async () => {
    await fireCascade({
      event: 'popia.consent_changed',
      actor_id: 'u1', entity_type: 'popia_consents', entity_id: 'u1',
      data: { marketing: true }, env: envObj,
    });
    const adminHead = await getChainHead(envObj, 'admin');
    expect(adminHead?.head_sequence).toBe(1);
  });

  it('skipAudit:true does NOT advance the chain', async () => {
    await fireCascade({
      event: 'trade.order_placed',
      actor_id: 'u1', entity_type: 'trade_orders', entity_id: 'o1',
      data: { side: 'buy' }, env: envObj,
      skipAudit: true,
    });
    const head = await getChainHead(envObj, 'trading');
    expect(head).toBeNull();
  });

  it('audit.event_appended events do not recurse', async () => {
    // appendAudit (called by the hook) fires audit.event_appended cascades.
    // If we didn't filter those, every cascade would spawn another cascade
    // → unbounded recursion. Direct firing of audit.event_appended should
    // be a no-op for the audit chain.
    await fireCascade({
      event: 'audit.event_appended',
      actor_id: 'system', entity_type: 'audit_events', entity_id: 'aud1',
      data: { event_type: 'fake', sequence_no: 99 }, env: envObj,
    });
    const head = await getChainHead(envObj, 'platform');
    expect(head).toBeNull();
  });

  it('unknown event prefix falls into the platform chain', async () => {
    await fireCascade({
      event: 'ai.classification_logged',
      actor_id: 'u1', entity_type: 'ai_decisions', entity_id: 'ai1',
      data: { intent: 'test' }, env: envObj,
    });
    const head = await getChainHead(envObj, 'platform');
    expect(head?.head_sequence).toBe(1);
  });
});
