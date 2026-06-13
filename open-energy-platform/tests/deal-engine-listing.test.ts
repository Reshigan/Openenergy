// Deal Desk listing endpoints — GET /mine (my authored requests + offers) and
// GET /types (deal types my role can transact). Strict TDD — written first,
// watched fail, then implemented.
//
// SECURITY SPINE: /mine is identity- AND tenant-fenced (demand_id+tenant for
// requests, provider_id+tenant for offers) — NOT the cross-tenant marketplace
// seam. /mine and /types are literal segments registered BEFORE the /:type/*
// param routes so they can never be shadowed by unknown_deal_type matching.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import dealsRoutes from '../src/routes/deals';
import { getDealDescriptor, registerDeal, type DealDescriptor } from '../src/utils/deal-registry';

let db: Database.Database;
let env: any;
let offtakerToken: string;     // demand (energy_supply) in T_DEMAND
let ippToken: string;          // provider (energy_supply) in T_PROVIDER
let adminToken: string;

function setTenant(pid: string, tenant: string) {
  db.prepare('UPDATE participants SET tenant_id = ? WHERE id = ?').run(tenant, pid);
}

// Register a lender-only synthetic so we can prove role filtering excludes a
// deal type whose roles the caller is in neither side of.
function registerSynthetics() {
  const base = getDealDescriptor('energy_supply') as DealDescriptor;
  registerDeal({
    ...base,
    deal_type: 'debt_syndication',
    kind: 'syndication',
    initiator: 'demand',
    provider_roles: ['lender'],
    demand_roles: ['ipp_developer'],
  });
}

// Seed an authored request directly (bypasses the role/validation gates so the
// listing read is tested in isolation).
function seedRequest(r: {
  id: string; demand_id: string; tenant: string; deal_type?: string; status?: string;
  need?: string; target_amount_zar?: number | null;
}) {
  db.prepare(
    `INSERT INTO oe_deal_requests (id, deal_type, demand_id, demand_role, tenant_id, need, target_amount_zar, status)
     VALUES (?, ?, ?, 'offtaker', ?, ?, ?, ?)`,
  ).run(
    r.id, r.deal_type ?? 'energy_supply', r.demand_id, r.tenant,
    r.need ?? '{"annual_kwh":4000000}', r.target_amount_zar ?? null, r.status ?? 'open',
  );
}

function seedOffer(o: {
  id: string; provider_id: string; tenant: string; deal_type?: string; request_id?: string | null;
  status?: string; term_sheet?: string; bid_amount_zar?: number | null;
}) {
  db.prepare(
    `INSERT INTO oe_deal_offers (id, deal_type, provider_id, provider_role, tenant_id, title, term_sheet, request_id, bid_amount_zar, status)
     VALUES (?, ?, ?, 'ipp_developer', ?, 'offer', ?, ?, ?, ?)`,
  ).run(
    o.id, o.deal_type ?? 'energy_supply', o.provider_id, o.tenant,
    o.term_sheet ?? '{"blended_price_zar_per_mwh":900}', o.request_id ?? null,
    o.bid_amount_zar ?? null, o.status ?? 'published',
  );
}

beforeEach(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  offtakerToken = await testJwtFor(db, 'par_offtaker', { role: 'offtaker' });
  setTenant('par_offtaker', 'T_DEMAND');
  ippToken = await testJwtFor(db, 'par_ipp', { role: 'ipp_developer' });
  setTenant('par_ipp', 'T_PROVIDER');
  adminToken = await testJwtFor(db, 'par_admin', { role: 'admin' });
  setTenant('par_admin', 'T_DEMAND');
  registerSynthetics();
});
afterEach(() => { db.close(); });

describe('deals — GET /mine', () => {
  it('returns ONLY my requests (demand_id + tenant) with a correct offer_count', async () => {
    // Mine, in my tenant.
    seedRequest({ id: 'r_mine', demand_id: 'par_offtaker', tenant: 'T_DEMAND', need: '{"annual_kwh":1}' });
    // Another user's request.
    seedRequest({ id: 'r_other_user', demand_id: 'par_someone', tenant: 'T_DEMAND' });
    // My id but a DIFFERENT tenant (must be excluded by the tenant fence).
    seedRequest({ id: 'r_other_tenant', demand_id: 'par_offtaker', tenant: 'T_OTHER' });

    // Two offers reference r_mine → offer_count == 2; one references r_other_user.
    seedOffer({ id: 'o_a', provider_id: 'par_ipp', tenant: 'T_PROVIDER', request_id: 'r_mine' });
    seedOffer({ id: 'o_b', provider_id: 'par_ipp', tenant: 'T_PROVIDER', request_id: 'r_mine' });
    seedOffer({ id: 'o_c', provider_id: 'par_ipp', tenant: 'T_PROVIDER', request_id: 'r_other_user' });

    const res = await call(dealsRoutes, env, 'GET', '/mine', { token: offtakerToken });
    expect(res.status).toBe(200);
    const body = res.json as any;
    const ids = (body.requests as any[]).map((r) => r.id);
    expect(ids).toEqual(['r_mine']);                 // only mine, only my tenant
    expect(body.requests[0].offer_count).toBe(2);    // correlated count
    expect(body.requests[0].need).toEqual({ annual_kwh: 1 });   // parsed to object
  });

  it('returns ONLY my offers (provider_id + tenant) with term_sheet parsed', async () => {
    seedOffer({ id: 'o_mine', provider_id: 'par_ipp', tenant: 'T_PROVIDER', term_sheet: '{"blended_price_zar_per_mwh":750}' });
    seedOffer({ id: 'o_other_user', provider_id: 'par_someone', tenant: 'T_PROVIDER' });
    seedOffer({ id: 'o_other_tenant', provider_id: 'par_ipp', tenant: 'T_OTHER' });

    const res = await call(dealsRoutes, env, 'GET', '/mine', { token: ippToken });
    expect(res.status).toBe(200);
    const body = res.json as any;
    const ids = (body.offers as any[]).map((o) => o.id);
    expect(ids).toEqual(['o_mine']);
    expect(body.offers[0].term_sheet).toEqual({ blended_price_zar_per_mwh: 750 });
  });

  it('parses a malformed need / term_sheet defensively to {}', async () => {
    seedRequest({ id: 'r_bad', demand_id: 'par_offtaker', tenant: 'T_DEMAND', need: 'not json' });
    seedOffer({ id: 'o_bad', provider_id: 'par_offtaker', tenant: 'T_DEMAND', term_sheet: 'not json' });
    const res = await call(dealsRoutes, env, 'GET', '/mine', { token: offtakerToken });
    expect(res.status).toBe(200);
    const body = res.json as any;
    expect(body.requests.find((r: any) => r.id === 'r_bad').need).toEqual({});
    expect(body.offers.find((o: any) => o.id === 'o_bad').term_sheet).toEqual({});
  });

  it('is NOT shadowed by the /:type param route (does not 404 unknown_deal_type)', async () => {
    const res = await call(dealsRoutes, env, 'GET', '/mine', { token: offtakerToken });
    expect(res.status).toBe(200);
    expect((res.json as any).error).toBeUndefined();
    expect((res.json as any)).toHaveProperty('requests');
    expect((res.json as any)).toHaveProperty('offers');
  });
});

describe('deals — GET /types', () => {
  it('filters descriptors by role: offtaker can_request energy_supply, cannot see lender-only', async () => {
    const res = await call(dealsRoutes, env, 'GET', '/types', { token: offtakerToken });
    expect(res.status).toBe(200);
    const types = (res.json as any).types as any[];
    const es = types.find((t) => t.deal_type === 'energy_supply');
    expect(es).toBeDefined();
    expect(es.can_request).toBe(true);               // offtaker is a demand_role
    expect(es.can_offer).toBe(false);                // offtaker is not a provider_role
    // debt_syndication is provider lender / demand ipp_developer → offtaker in neither
    expect(types.find((t) => t.deal_type === 'debt_syndication')).toBeUndefined();
  });

  it('admin sees every type with can_offer && can_request both true', async () => {
    const res = await call(dealsRoutes, env, 'GET', '/types', { token: adminToken });
    expect(res.status).toBe(200);
    const types = (res.json as any).types as any[];
    expect(types.length).toBeGreaterThanOrEqual(2);
    for (const t of types) {
      expect(t.can_offer).toBe(true);
      expect(t.can_request).toBe(true);
    }
  });

  it('each entry carries term_sheet_schema and need_schema arrays plus role lists', async () => {
    const res = await call(dealsRoutes, env, 'GET', '/types', { token: ippToken });
    expect(res.status).toBe(200);
    const es = (res.json as any).types.find((t: any) => t.deal_type === 'energy_supply');
    expect(es).toBeDefined();
    expect(Array.isArray(es.term_sheet_schema)).toBe(true);
    expect(Array.isArray(es.need_schema)).toBe(true);
    expect(es.provider_roles).toContain('ipp_developer');
    expect(es.demand_roles).toContain('offtaker');
    expect(es.kind).toBe('marketplace');
    expect(es.event_prefix).toBe('deal_energy');
  });
});
