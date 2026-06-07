import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerUnderservedInboxRules } from '../src/cascade-rules/underserved-inboxes';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerUnderservedInboxRules();
});
afterEach(() => db.close());

function ctx(event: string, entity_type: string, entity_id: string, data: Record<string, unknown>): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}
function row(id: string) {
  return db.prepare(`SELECT target_role, target_participant_id, title, priority,
    source_event, source_chain_key, cross_option_json, sla_due_at
    FROM oe_role_action_queue WHERE source_entity_id = ?`).get(id) as any;
}
function seedAgreement(id: string, offtaker_id: string) {
  db.prepare(
    `INSERT INTO oe_wheeling_agreements
       (id, generator_id, offtaker_id, injection_point, withdrawal_point,
        contracted_mw, loss_factor_pct, wheeling_tariff_zar_per_mwh, status)
     VALUES (?, 'gen1', ?, 'inj', 'wd', 10, 3.5, 120, 'active')`,
  ).run(id, offtaker_id);
}

describe('underserved-inbox cascade rules', () => {
  it('grid.wheeling_charge_disputed pushes a role-wide resolve action to grid_operator', async () => {
    await runCascadeRegistry(ctx('grid.wheeling_charge_disputed', 'oe_grid_wheeling_charges', 'chg1',
      { agreement_id: 'wa1', period_month: '2026-05', dispute_id: 'dsp1', claimed_amount_zar: 125000 }));
    const r = row('chg1');
    expect(r.target_role).toBe('grid_operator');
    expect(r.target_participant_id).toBeNull();
    expect(r.priority).toBe('high');
    expect(r.source_chain_key).toBe('underserved_inboxes');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/grid-operator/workstation?tab=wheeling_charges');
  });

  it('grid.wheeling_charge_issued resolves offtaker_id from the agreement and pushes to that offtaker', async () => {
    seedAgreement('wa2', 'off42');
    await runCascadeRegistry(ctx('grid.wheeling_charge_issued', 'oe_grid_wheeling_charges', 'chg2',
      { agreement_id: 'wa2', period_month: '2026-05', total_zar: 88000, dispute_deadline_at: '2026-06-20T00:00:00.000Z' }));
    const r = row('chg2');
    expect(r.target_role).toBe('offtaker');
    expect(r.target_participant_id).toBe('off42');
    expect(r.priority).toBe('normal');
    expect(r.sla_due_at).toBe('2026-06-20T00:00:00.000Z');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/offtaker-suite/workstation?tab=wheeling_charges');
  });

  it('grid.wheeling_charge_issued does not push when the agreement (offtaker) cannot be resolved', async () => {
    await runCascadeRegistry(ctx('grid.wheeling_charge_issued', 'oe_grid_wheeling_charges', 'chg3',
      { agreement_id: 'ghost', period_month: '2026-05', total_zar: 1, dispute_deadline_at: null }));
    expect(db.prepare(`SELECT id FROM oe_role_action_queue WHERE source_entity_id='chg3'`).get()).toBeUndefined();
  });

  it('support.ticket_opened pushes a role-wide action to support with the mapped priority', async () => {
    await runCascadeRegistry(ctx('support.ticket_opened', 'support_tickets', 'tkt1',
      { id: 'tkt1', ticket_number: 'OE-2026-ABC', reporter_id: 'rep1', subject: 'Inverter offline', category: 'technical', priority: 'urgent' }));
    const r = row('tkt1');
    expect(r.target_role).toBe('support');
    expect(r.target_participant_id).toBeNull();
    expect(r.priority).toBe('urgent');
    expect(r.title).toContain('Inverter offline');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/support/tickets/tkt1');
  });

  it('support.ticket_opened maps an unknown ticket priority to normal', async () => {
    await runCascadeRegistry(ctx('support.ticket_opened', 'support_tickets', 'tkt2',
      { id: 'tkt2', ticket_number: 'OE-2026-XYZ', reporter_id: 'rep1', subject: 'Question', category: 'billing', priority: 'P3' }));
    expect(row('tkt2').priority).toBe('normal');
  });

  it('does not double-push for the same (entity, event)', async () => {
    const c = ctx('support.ticket_opened', 'support_tickets', 'tkt3',
      { id: 'tkt3', ticket_number: 'OE-2026-DUP', reporter_id: 'rep1', subject: 'X', category: 'technical', priority: 'high' });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = db.prepare(`SELECT COUNT(*) n FROM oe_role_action_queue WHERE source_entity_id='tkt3'`).get() as any;
    expect(n.n).toBe(1);
  });
});
