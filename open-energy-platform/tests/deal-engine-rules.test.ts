// Layer-A deal-engine cascade rules (src/cascade-rules/deal-engine.ts).
// Strict TDD — written first, watched fail, then implemented.
//
// Each rule is invoked directly via rule.run(ctx) against a real SQLite
// (migrations applied incl. 506) and the resulting oe_role_action_queue row(s)
// are asserted. No HTTP layer — these test the Layer-A push behaviour in
// isolation, the way the registry calls run(ctx).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { __dealEngineRulesForTest } from '../src/cascade-rules/deal-engine';

let db: Database.Database;
let env: any;

const rules = __dealEngineRulesForTest();
function ruleById(id: string) {
  const r = rules.find((x) => x.id === id);
  if (!r) throw new Error(`rule not found: ${id} (have: ${rules.map((x) => x.id).join(', ')})`);
  return r;
}

function ctx(partial: Partial<CascadeContext> & Pick<CascadeContext, 'event' | 'entity_id'>): CascadeContext {
  return {
    actor_id: 'par_actor',
    entity_type: partial.entity_type ?? 'deal_offer',
    data: partial.data ?? {},
    env,
    ...partial,
  } as CascadeContext;
}

function queueRows() {
  return db.prepare('SELECT * FROM oe_role_action_queue ORDER BY created_at, id').all() as any[];
}

function seedOffer(o: Partial<Record<string, unknown>> & { id: string }) {
  db.prepare(
    `INSERT INTO oe_deal_offers (id, deal_type, provider_id, provider_role, tenant_id, title, term_sheet, request_id, committed_amount_zar, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
  ).run(
    o.id,
    (o.deal_type as string) ?? 'energy_supply',
    (o.provider_id as string) ?? 'par_provider',
    (o.provider_role as string) ?? 'ipp_developer',
    (o.tenant_id as string) ?? 'T_PROVIDER',
    (o.title as string) ?? 'Offer',
    (o.term_sheet as string) ?? '{}',
    (o.request_id as string) ?? null,
    (o.committed_amount_zar as number) ?? null,
  );
}

function seedRequest(r: Partial<Record<string, unknown>> & { id: string }) {
  db.prepare(
    `INSERT INTO oe_deal_requests (id, deal_type, demand_id, demand_role, tenant_id, need, objective_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
  ).run(
    r.id,
    (r.deal_type as string) ?? 'energy_supply',
    (r.demand_id as string) ?? 'par_demand',
    (r.demand_role as string) ?? 'offtaker',
    (r.tenant_id as string) ?? 'T_DEMAND',
    (r.need as string) ?? '{}',
    (r.objective_id as string) ?? null,
  );
}

function seedObjective(o: Partial<Record<string, unknown>> & { id: string }) {
  db.prepare(
    `INSERT INTO oe_deal_objectives (id, owner_id, owner_role, tenant_id, title, funding_target_zar, committed_zar, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    o.id,
    (o.owner_id as string) ?? 'par_owner',
    (o.owner_role as string) ?? 'ipp_developer',
    (o.tenant_id as string) ?? 'T_DEMAND',
    (o.title as string) ?? 'Objective',
    (o.funding_target_zar as number) ?? 100,
    (o.committed_zar as number) ?? 0,
    (o.status as string) ?? 'forming',
  );
}

function seedLink(l: Partial<Record<string, unknown>> & { id: string; from_id: string; to_id: string }) {
  db.prepare(
    `INSERT INTO oe_deal_links (id, tenant_id, link_kind, from_kind, from_id, to_kind, to_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    l.id,
    (l.tenant_id as string) ?? 'T_DEMAND',
    (l.link_kind as string) ?? 'condition_precedent',
    (l.from_kind as string) ?? 'offer',
    l.from_id,
    (l.to_kind as string) ?? 'offer',
    l.to_id,
    (l.status as string) ?? 'pending',
  );
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('deal_engine.offer_to_demand', () => {
  const rule = () => ruleById('deal_engine.offer_to_demand');

  it('pushes to the demand party when the offer carries a request_id', async () => {
    seedRequest({ id: 'req1', demand_id: 'par_demand', demand_role: 'offtaker', tenant_id: 'T_DEMAND' });
    seedOffer({ id: 'off1', deal_type: 'energy_supply', request_id: 'req1' });
    await rule().run(ctx({ event: 'deal.offer.published', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } }));
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('offtaker');
    expect(rows[0].target_participant_id).toBe('par_demand');
    expect(rows[0].source_entity_id).toBe('off1');
    expect(rows[0].source_event).toBe('deal.offer.published');
    const co = JSON.parse(rows[0].cross_option_json);
    expect(co.target_route).toBe('/deals/energy_supply/req1/options');
    const body = JSON.parse(rows[0].body_json);
    expect(body.offer_id).toBe('off1');
  });

  it('does NOT push for an open-marketplace offer with no request_id', async () => {
    seedOffer({ id: 'off2', deal_type: 'energy_supply', request_id: null });
    await rule().run(ctx({ event: 'deal.offer.published', entity_id: 'off2', data: { deal_type: 'energy_supply', request_id: null } }));
    expect(queueRows()).toHaveLength(0);
  });

  it('dedup: running twice writes exactly one row', async () => {
    seedRequest({ id: 'req1', demand_id: 'par_demand', demand_role: 'offtaker' });
    seedOffer({ id: 'off1', deal_type: 'energy_supply', request_id: 'req1' });
    const c = ctx({ event: 'deal.offer.published', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } });
    await rule().run(c);
    await rule().run(c);
    expect(queueRows()).toHaveLength(1);
  });
});

describe('deal_engine.accept_to_provider', () => {
  const rule = () => ruleById('deal_engine.accept_to_provider');

  it('pushes to the provider with a Track delivery cross_option (dispatched live)', async () => {
    seedOffer({ id: 'off1', deal_type: 'energy_supply', provider_id: 'par_ipp', provider_role: 'ipp_developer', tenant_id: 'T_PROVIDER' });
    await rule().run(ctx({
      event: 'deal.accepted', entity_id: 'off1',
      data: { deal_type: 'energy_supply', request_id: 'req1', chain_key: 'ppa_contract', dispatched_case_id: 'deal_case_9' },
    }));
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target_role).toBe('ipp_developer');
    expect(rows[0].target_participant_id).toBe('par_ipp');
    const co = JSON.parse(rows[0].cross_option_json);
    expect(co.action_label).toBe('Track delivery');
    expect(co.target_route).toBe('/threads/ppa_contract/deal_case_9');
  });

  it('pushes to the provider with a View LOI cross_option (upcoming → loi)', async () => {
    seedOffer({ id: 'off2', deal_type: 'energy_supply', provider_id: 'par_ipp', provider_role: 'ipp_developer' });
    await rule().run(ctx({
      event: 'deal.accepted', entity_id: 'off2',
      data: { deal_type: 'energy_supply', request_id: 'req1', loi_id: 'loi_7' },
    }));
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    const co = JSON.parse(rows[0].cross_option_json);
    expect(co.action_label).toBe('View LOI');
    expect(co.target_route).toBe('/lois/loi_7');
  });

  it('returns when the offer is missing', async () => {
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'nope', data: {} }));
    expect(queueRows()).toHaveLength(0);
  });
});

describe('deal_engine.leg_to_objective (progress)', () => {
  const rule = () => ruleById('deal_engine.leg_to_objective_progress');

  it('pushes a progress action to the objective owner on deal.accepted', async () => {
    seedObjective({ id: 'obj1', owner_id: 'par_owner', owner_role: 'ipp_developer', funding_target_zar: 1000, committed_zar: 300 });
    seedRequest({ id: 'req1', objective_id: 'obj1' });
    seedOffer({ id: 'off1', request_id: 'req1' });
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } }));
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target_participant_id).toBe('par_owner');
    expect(rows[0].title).toBe('Capital-stack leg committed');
    const body = JSON.parse(rows[0].body_json);
    expect(body.objective_id).toBe('obj1');
  });

  it('pushes a progress action to the objective owner on deal.subscribed (entity_id IS the request)', async () => {
    seedObjective({ id: 'obj1', owner_id: 'par_owner', owner_role: 'ipp_developer', funding_target_zar: 1000, committed_zar: 600 });
    seedRequest({ id: 'req_sub', objective_id: 'obj1' });
    await rule().run(ctx({ event: 'deal.subscribed', entity_type: 'deal_request', entity_id: 'req_sub', data: {} }));
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target_participant_id).toBe('par_owner');
    expect(rows[0].title).toBe('Capital-stack leg committed');
    expect(rows[0].source_event).toBe('deal.subscribed');
    const body = JSON.parse(rows[0].body_json);
    expect(body.objective_id).toBe('obj1');
  });

  it('does nothing when the request has no objective_id', async () => {
    seedRequest({ id: 'req2', objective_id: null });
    seedOffer({ id: 'off2', request_id: 'req2' });
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'off2', data: { deal_type: 'energy_supply', request_id: 'req2' } }));
    expect(queueRows()).toHaveLength(0);
  });
});

describe('deal_engine.leg_to_objective (close prompt)', () => {
  const rule = () => ruleById('deal_engine.objective_close_prompt');

  it('pushes a close prompt to the owner on objective.subscribed', async () => {
    seedObjective({ id: 'obj1', owner_id: 'par_owner', owner_role: 'ipp_developer', funding_target_zar: 1000, committed_zar: 1000, status: 'subscribed' });
    await rule().run(ctx({ event: 'objective.subscribed', entity_type: 'deal_objective', entity_id: 'obj1', data: { committed_zar: 1000, funding_target_zar: 1000 } }));
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target_participant_id).toBe('par_owner');
    expect(rows[0].title).toBe('Capital stack fully subscribed');
    const co = JSON.parse(rows[0].cross_option_json);
    expect(co.action_label).toBe('Initiate close');
    expect(co.target_route).toBe('/objectives/obj1');
  });
});

describe('deal_engine.link_resolver', () => {
  const rule = () => ruleById('deal_engine.link_resolver');

  it('marks a condition_precedent link met when its from offer is accepted', async () => {
    seedOffer({ id: 'off1', request_id: 'req1' });
    // Link FROM the accepted offer (off1) TO a dependent deal (off2).
    seedLink({ id: 'lnk1', link_kind: 'condition_precedent', from_kind: 'offer', from_id: 'off1', to_kind: 'offer', to_id: 'off2', status: 'pending' });
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } }));
    const link = db.prepare('SELECT * FROM oe_deal_links WHERE id = ?').get('lnk1') as any;
    expect(link.status).toBe('met');
    expect(link.condition_state).toBe('met');
  });

  it('prompts the dependent deal owner once ALL its CP links are met', async () => {
    seedOffer({ id: 'off1', request_id: 'req1' });
    // off2 is the dependent deal; its provider is the owner who gets prompted.
    seedOffer({ id: 'off2', provider_id: 'par_dep', provider_role: 'ipp_developer', tenant_id: 'T_DEP' });
    seedLink({ id: 'lnk1', link_kind: 'condition_precedent', from_kind: 'offer', from_id: 'off1', to_kind: 'offer', to_id: 'off2', status: 'pending' });
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } }));
    const link = db.prepare('SELECT * FROM oe_deal_links WHERE id = ?').get('lnk1') as any;
    expect(link.status).toBe('met');
    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].target_participant_id).toBe('par_dep');
    expect(rows[0].tenant_id).toBe('T_DEP');
    expect(rows[0].source_entity_id).toBe('off2');
    const co = JSON.parse(rows[0].cross_option_json);
    expect(co.target_route).toBe('/deals/energy_supply/off2');
  });

  it('does NOT prompt the dependent owner while it still has an unmet CP link', async () => {
    seedOffer({ id: 'off1', request_id: 'req1' });
    seedOffer({ id: 'off2', provider_id: 'par_dep', provider_role: 'ipp_developer' });
    seedOffer({ id: 'off3' });
    // off2 depends on BOTH off1 (now accepted) and off3 (still pending).
    seedLink({ id: 'lnk1', from_id: 'off1', to_id: 'off2', status: 'pending' });
    seedLink({ id: 'lnk2', from_id: 'off3', to_id: 'off2', status: 'pending' });
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } }));
    expect((db.prepare('SELECT status FROM oe_deal_links WHERE id = ?').get('lnk1') as any).status).toBe('met');
    expect((db.prepare('SELECT status FROM oe_deal_links WHERE id = ?').get('lnk2') as any).status).toBe('pending');
    expect(queueRows()).toHaveLength(0);
  });

  it('is a no-op when no links exist (common case)', async () => {
    seedOffer({ id: 'off1', request_id: 'req1' });
    await rule().run(ctx({ event: 'deal.accepted', entity_id: 'off1', data: { deal_type: 'energy_supply', request_id: 'req1' } }));
    expect(queueRows()).toHaveLength(0);
  });
});
