// Layer-C: when an offtaker under-delivers against a PPA (offtaker-obligations.ts
// fires offtaker.obligation_shortfall / offtaker.obligation_take_or_pay), push the
// crystallized claim and the earlier shortfall heads-up to the generator's (IPP)
// workstation IncomingPanel. The generator is the obligation row's counterparty_id,
// which the event payload does NOT carry, so the rule resolves it from the row.
// Mirrors underserved-inboxes-rules.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerPpaDeliveryShortfallRules } from '../src/cascade-rules/ppa-delivery-shortfall';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerPpaDeliveryShortfallRules();
});
afterEach(() => db.close());

function ctx(event: string, entity_type: string, entity_id: string, data: Record<string, unknown>): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}
function row(id: string) {
  return db.prepare(`SELECT target_role, target_participant_id, title, body_json, priority,
    source_event, source_chain_key, cross_option_json, sla_due_at
    FROM oe_role_action_queue WHERE source_entity_id = ?`).get(id) as any;
}
function seedObligation(id: string, counterparty_id: string | null) {
  db.prepare(
    `INSERT INTO oe_offtaker_ppa_obligations
       (id, ppa_id, participant_id, counterparty_id, period_month)
     VALUES (?, 'ppa1', 'off1', ?, '2026-05')`,
  ).run(id, counterparty_id);
}

describe('ppa-delivery-shortfall cascade rules', () => {
  it('offtaker.obligation_take_or_pay pushes the crystallized claim to the generator', async () => {
    seedObligation('obl1', 'ipp77');
    await runCascadeRegistry(ctx('offtaker.obligation_take_or_pay', 'offtaker_ppa_obligation', 'obl1',
      { ppa_id: 'ppa1', period_month: '2026-05', take_or_pay_amount_zar: 250000 }));
    const r = row('obl1');
    expect(r.target_role).toBe('ipp_developer');
    expect(r.target_participant_id).toBe('ipp77');
    expect(r.priority).toBe('high');
    expect(r.source_chain_key).toBe('ppa_delivery_shortfall');
    expect(r.title).toContain('250,000');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/ipp-lifecycle/workstation?tab=take-or-pay-claims');
    expect(JSON.parse(r.body_json).take_or_pay_amount_zar).toBe(250000);
  });

  it('offtaker.obligation_shortfall pushes a normal-priority heads-up with the cure deadline as SLA', async () => {
    seedObligation('obl2', 'ipp77');
    await runCascadeRegistry(ctx('offtaker.obligation_shortfall', 'offtaker_ppa_obligation', 'obl2',
      { ppa_id: 'ppa1', period_month: '2026-05', shortfall_mwh: 40, cure_deadline_at: '2026-07-01T00:00:00.000Z' }));
    const r = row('obl2');
    expect(r.target_role).toBe('ipp_developer');
    expect(r.target_participant_id).toBe('ipp77');
    expect(r.priority).toBe('normal');
    expect(r.sla_due_at).toBe('2026-07-01T00:00:00.000Z');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/ipp-lifecycle/workstation?tab=take-or-pay-claims');
    expect(JSON.parse(r.body_json).shortfall_mwh).toBe(40);
  });

  it('does not push when the obligation has no counterparty (generator unknown)', async () => {
    seedObligation('obl3', null);
    await runCascadeRegistry(ctx('offtaker.obligation_take_or_pay', 'offtaker_ppa_obligation', 'obl3',
      { ppa_id: 'ppa1', period_month: '2026-05', take_or_pay_amount_zar: 1 }));
    expect(db.prepare(`SELECT id FROM oe_role_action_queue WHERE source_entity_id='obl3'`).get()).toBeUndefined();
  });

  it('does not push when the obligation row cannot be found', async () => {
    await runCascadeRegistry(ctx('offtaker.obligation_take_or_pay', 'offtaker_ppa_obligation', 'ghost',
      { ppa_id: 'ppa1', period_month: '2026-05', take_or_pay_amount_zar: 1 }));
    expect(db.prepare(`SELECT id FROM oe_role_action_queue WHERE source_entity_id='ghost'`).get()).toBeUndefined();
  });

  it('does not double-push for the same (entity, event)', async () => {
    seedObligation('obl4', 'ipp77');
    const c = ctx('offtaker.obligation_take_or_pay', 'offtaker_ppa_obligation', 'obl4',
      { ppa_id: 'ppa1', period_month: '2026-05', take_or_pay_amount_zar: 5000 });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = db.prepare(`SELECT COUNT(*) n FROM oe_role_action_queue WHERE source_entity_id='obl4'`).get() as any;
    expect(n.n).toBe(1);
  });
});
