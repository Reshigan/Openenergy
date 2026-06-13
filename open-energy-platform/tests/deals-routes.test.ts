// Integration tests for the generalized cross-role deal engine (Phase 1).
// Drives the generic /api/deals router end-to-end against a real SQLite
// (migrations applied, incl. 506). Strict TDD — these are written first.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import dealsRoutes from '../src/routes/deals';
import { getDealDescriptor, registerDeal, type DealDescriptor } from '../src/utils/deal-registry';

let db: Database.Database;
let env: any;
let offtakerToken: string;     // demand
let ippToken: string;          // provider (tenant T_PROVIDER)
let traderToken: string;       // provider in own tenant
let lenderToken: string;

// Helper: force a participant into a named tenant (auth middleware reads
// participants.tenant_id). Test KV is fresh per-env so no stale cache.
function setTenant(pid: string, tenant: string) {
  db.prepare('UPDATE participants SET tenant_id = ? WHERE id = ?').run(tenant, pid);
}

beforeEach(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // demand party (offtaker) in tenant T_DEMAND
  offtakerToken = await testJwtFor(db, 'par_offtaker', { role: 'offtaker' });
  setTenant('par_offtaker', 'T_DEMAND');
  // provider (ipp) in a DIFFERENT tenant — drives cross-tenant banding
  ippToken = await testJwtFor(db, 'par_ipp', { role: 'ipp_developer' });
  setTenant('par_ipp', 'T_PROVIDER');
  // provider (trader) in the SAME tenant as the demand party — verbatim price
  traderToken = await testJwtFor(db, 'par_trader', { role: 'trader' });
  setTenant('par_trader', 'T_DEMAND');
  // lender — used for wrong-role + objectives
  lenderToken = await testJwtFor(db, 'par_lender', { role: 'lender' });
  setTenant('par_lender', 'T_DEMAND');
});
afterEach(() => { db.close(); });

// ── Synthetic descriptors for non-marketplace kinds ──────────────────────────
// Register once per file import (registry is process-global + idempotent-by-key).
function registerSynthetics() {
  const base = getDealDescriptor('energy_supply') as DealDescriptor;
  // Auction
  registerDeal({
    ...base,
    deal_type: 'capacity_auction',
    kind: 'auction',
    initiator: 'demand',
    provider_roles: ['trader', 'ipp_developer'],
    demand_roles: ['grid_operator', 'offtaker'],
    clearing: { rule: 'pay_as_bid', window_close: 'manual' },
    dispatch_is_trade: false,
  });
  // Syndication
  registerDeal({
    ...base,
    deal_type: 'debt_syndication',
    kind: 'syndication',
    initiator: 'demand',
    provider_roles: ['lender'],
    demand_roles: ['ipp_developer'],
    allocation: { basis: 'pro_rata', min_tranche_pct: 5 },
    dispatch_is_trade: false,
  });
  // Marketplace WITHOUT a trade guard (so guard logic only fires for energy_supply)
  registerDeal({
    ...base,
    deal_type: 'service_marketplace',
    kind: 'marketplace',
    initiator: 'provider',
    provider_roles: ['support'],
    demand_roles: ['offtaker'],
    dispatch_is_trade: false,
    accept_dispatch: { live: { chain_key: 'service_contract', endpoint: () => '/x' }, upcoming: { loi: true } },
  });
}
registerSynthetics();

// ── Test fixtures ────────────────────────────────────────────────────────────
function energyOffer(extra: Record<string, unknown> = {}) {
  return {
    title: 'Solar PPA',
    term_sheet: {
      offered_annual_mwh: 5000,
      blended_price_zar_per_mwh: 900,
      availability: 'now',
      ...extra,
    },
  };
}
function energyNeed() {
  return { need: { annual_kwh: 4_000_000, avg_tariff_zar_per_kwh: 2.1 } };
}

async function makeRequest(token = offtakerToken) {
  const res = await call(dealsRoutes, env, 'POST', '/energy_supply/request', { token, body: energyNeed() });
  return (res.json as any).request_id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('deals — offer intake', () => {
  it('publishes an offer (happy path) and persists it', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer() });
    expect(res.status).toBe(200);
    const offerId = (res.json as any).offer_id as string;
    expect(offerId).toBeTruthy();
    const row = db.prepare('SELECT * FROM oe_deal_offers WHERE id = ?').get(offerId) as any;
    expect(row).toBeTruthy();
    expect(row.deal_type).toBe('energy_supply');
    expect(row.provider_role).toBe('ipp_developer');
    expect(row.tenant_id).toBe('T_PROVIDER');
    expect(row.status).toBe('published');
  });

  it('rejects a wrong provider role with 403', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: lenderToken, body: energyOffer() });
    expect(res.status).toBe(403);
  });

  it('rejects an offer missing a required term-sheet field with 400', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', {
      token: ippToken, body: { title: 'X', term_sheet: { blended_price_zar_per_mwh: 900 } },
    });
    expect(res.status).toBe(400);
  });
});

describe('deals — request intake', () => {
  it('publishes a need (happy path)', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/request', { token: offtakerToken, body: energyNeed() });
    expect(res.status).toBe(200);
    expect((res.json as any).request_id).toBeTruthy();
  });

  it('rejects a need missing required fields with 400', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/request', {
      token: offtakerToken, body: { need: { annual_kwh: 1000 } },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a wrong demand role with 403', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/request', { token: lenderToken, body: energyNeed() });
    expect(res.status).toBe(403);
  });
});

describe('deals — options (marketplace seam + POPIA banding)', () => {
  it('returns scored, ranked options and bands cross-tenant indicative prices', async () => {
    // Cross-tenant offer (ipp, T_PROVIDER) and own-tenant offer (trader, T_DEMAND)
    // with the SAME term sheet → only the cross-tenant one is banded.
    await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer() });
    await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: traderToken, body: energyOffer() });
    const requestId = await makeRequest();

    const res = await call(dealsRoutes, env, 'GET', `/energy_supply/options?request_id=${requestId}`, { token: offtakerToken });
    expect(res.status).toBe(200);
    const options = (res.json as any).options as any[];
    expect(options.length).toBe(2);

    // Sorted by est_value_zar desc.
    const vals = options.map((o) => o.est_value_zar ?? -Infinity);
    expect(vals[0]).toBeGreaterThanOrEqual(vals[1]);

    // Find own-tenant (trader) vs cross-tenant (ipp) by option_id → provider lookup.
    const byProvider = new Map<string, any>();
    for (const o of options) {
      const off = db.prepare('SELECT provider_id FROM oe_deal_offers WHERE id = ?').get(o.option_id) as any;
      byProvider.set(off.provider_id, o);
    }
    const own = byProvider.get('par_trader');
    const cross = byProvider.get('par_ipp');
    expect(own).toBeDefined();                       // guard against vacuous pass
    expect(cross).toBeDefined();
    expect(own.primary_metric).toBe(900);            // verbatim
    expect(cross.primary_metric).not.toBe(900);      // banded → differs
  });
});

describe('deals — options cross-tenant request fence', () => {
  it('a caller in tenant A cannot read a request owned by tenant B → 404 request_not_found', async () => {
    // request seeded in tenant T_DEMAND (offtaker). The trader is in T_DEMAND too,
    // so use the ipp (T_PROVIDER) as the cross-tenant caller. But ipp is not a
    // demand role for options — options has no role gate, only the tenant fence
    // on the request. So a T_PROVIDER caller reading a T_DEMAND request → 404.
    const requestId = await makeRequest(offtakerToken);  // T_DEMAND
    const res = await call(dealsRoutes, env, 'GET', `/energy_supply/options?request_id=${requestId}`, { token: ippToken });
    expect(res.status).toBe(404);
    expect((res.json as any).error).toBe('request_not_found');

    // own-tenant caller still gets 200
    const ok = await call(dealsRoutes, env, 'GET', `/energy_supply/options?request_id=${requestId}`, { token: offtakerToken });
    expect(ok.status).toBe(200);
  });
});

describe('deals — accept authorization', () => {
  it('a non-demand-role caller (trader) → 403 forbidden; valid offtaker succeeds', async () => {
    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer({ availability: 'now' }) });
    const offerId = (offer.json as any).offer_id;
    const requestId = await makeRequest();

    // trader is not in energy_supply demand_roles (['offtaker'])
    const bad = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', {
      token: traderToken, body: { request_id: requestId, offer_id: offerId },
    });
    expect(bad.status).toBe(403);
    expect((bad.json as any).error).toBe('forbidden');

    // valid offtaker demand party succeeds
    const ok = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', {
      token: offtakerToken, body: { request_id: requestId, offer_id: offerId },
    });
    expect(ok.status).toBe(200);
    expect((ok.json as any).status).toBe('dispatched');
  });

  it('a demand-role caller passing a request_id owned by another tenant → 403 forbidden', async () => {
    // Seed a request owned by a DIFFERENT tenant's offtaker.
    const otherOfftaker = await testJwtFor(db, 'par_offtaker2', { role: 'offtaker' });
    setTenant('par_offtaker2', 'T_OTHER');
    const requestId = await makeRequest(otherOfftaker);  // owned by T_OTHER

    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer({ availability: 'now' }) });
    const offerId = (offer.json as any).offer_id;

    // par_offtaker (T_DEMAND) is a valid demand role but the request is T_OTHER's
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', {
      token: offtakerToken, body: { request_id: requestId, offer_id: offerId },
    });
    expect(res.status).toBe(403);
    expect((res.json as any).error).toBe('forbidden');
  });
});

describe('deals — accept (marketplace)', () => {
  it('live availability → dispatched with ppa_contract chain key', async () => {
    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer({ availability: 'now' }) });
    const offerId = (offer.json as any).offer_id;
    const requestId = await makeRequest();

    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', {
      token: offtakerToken, body: { request_id: requestId, offer_id: offerId },
    });
    expect(res.status).toBe(200);
    const body = res.json as any;
    expect(body.status).toBe('dispatched');
    expect(body.dispatched_chain_key).toBe('ppa_contract');
    expect(body.dispatched_case_id).toBeTruthy();

    const reqRow = db.prepare('SELECT * FROM oe_deal_requests WHERE id = ?').get(requestId) as any;
    expect(reqRow.status).toBe('dispatched');
    expect(reqRow.dispatched_chain_key).toBe('ppa_contract');
    expect(reqRow.selected_offer_id).toBe(offerId);
    const offRow = db.prepare('SELECT status FROM oe_deal_offers WHERE id = ?').get(offerId) as any;
    expect(offRow.status).toBe('accepted');
  });

  it('upcoming availability → loi_drafted with a loi_drafts row', async () => {
    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', {
      token: ippToken, body: energyOffer({ availability: 'upcoming', cod_estimate: '2027-01-01' }),
    });
    const offerId = (offer.json as any).offer_id;
    const requestId = await makeRequest();

    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', {
      token: offtakerToken, body: { request_id: requestId, offer_id: offerId },
    });
    expect(res.status).toBe(200);
    const body = res.json as any;
    expect(body.status).toBe('loi_drafted');
    expect(body.loi_id).toBeTruthy();
    const loi = db.prepare('SELECT * FROM loi_drafts WHERE id = ?').get(body.loi_id) as any;
    expect(loi).toBeTruthy();
    expect(loi.from_participant_id).toBe('par_offtaker');
    expect(loi.to_participant_id).toBe('par_ipp');
  });

  it('double-accept the same offer → second is 409 offer_unavailable', async () => {
    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer() });
    const offerId = (offer.json as any).offer_id;
    const requestId = await makeRequest();
    const r1 = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', { token: offtakerToken, body: { request_id: requestId, offer_id: offerId } });
    expect(r1.status).toBe(200);
    const requestId2 = await makeRequest();
    const r2 = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', { token: offtakerToken, body: { request_id: requestId2, offer_id: offerId } });
    expect(r2.status).toBe(409);
    expect((r2.json as any).error).toBe('offer_unavailable');
  });
});

describe('deals — guard rejection (dispatch_is_trade)', () => {
  it('a suspended accepting party → 409 guard_rejected, no dispatch', async () => {
    // Suspend the offtaker so evaluateOrder returns COUNTERPARTY_SUSPENDED.
    db.prepare("UPDATE participants SET status = 'suspended' WHERE id = ?").run('par_offtaker');
    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer() });
    const offerId = (offer.json as any).offer_id;
    const requestId = await makeRequest();
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/accept', { token: offtakerToken, body: { request_id: requestId, offer_id: offerId } });
    expect(res.status).toBe(409);
    expect((res.json as any).error).toBe('guard_rejected');
    expect((res.json as any).reason_code).toBeTruthy();
    const reqRow = db.prepare('SELECT status FROM oe_deal_requests WHERE id = ?').get(requestId) as any;
    expect(reqRow.status).toBe('open');   // unchanged — no dispatch
    const offRow = db.prepare('SELECT status FROM oe_deal_offers WHERE id = ?').get(offerId) as any;
    expect(offRow.status).toBe('published');
  });
});

describe('deals — decline', () => {
  it('declines an offer with a structured reason', async () => {
    const offer = await call(dealsRoutes, env, 'POST', '/energy_supply/offer', { token: ippToken, body: energyOffer() });
    const offerId = (offer.json as any).offer_id;
    const res = await call(dealsRoutes, env, 'POST', '/energy_supply/decline', { token: offtakerToken, body: { offer_id: offerId, reason: 'too expensive' } });
    expect(res.status).toBe(200);
    expect((res.json as any).status).toBe('declined');
    const off = db.prepare('SELECT status, decline_reason FROM oe_deal_offers WHERE id = ?').get(offerId) as any;
    expect(off.status).toBe('declined');
    expect(off.decline_reason).toContain('too expensive');
  });
});

describe('deals — auction clearing (pay_as_bid)', () => {
  it('clears submitted bids against the request', async () => {
    // demand opens the auction (initiator demand → demand_role grid_operator/offtaker)
    const reqRes = await call(dealsRoutes, env, 'POST', '/capacity_auction/request', {
      token: offtakerToken, body: { need: { annual_kwh: 1, avg_tariff_zar_per_kwh: 1 }, target_amount_zar: 1000 },
    });
    expect(reqRes.status).toBe(200);
    const requestId = (reqRes.json as any).request_id;
    // two providers bid
    await call(dealsRoutes, env, 'POST', '/capacity_auction/offer', { token: ippToken, body: { title: 'bid A', term_sheet: { offered_annual_mwh: 1, availability: 'now' }, request_id: requestId, bid_amount_zar: 800, bid_quantity: 1 } });
    await call(dealsRoutes, env, 'POST', '/capacity_auction/offer', { token: traderToken, body: { title: 'bid B', term_sheet: { offered_annual_mwh: 1, availability: 'now' }, request_id: requestId, bid_amount_zar: 700, bid_quantity: 1 } });

    const res = await call(dealsRoutes, env, 'POST', '/capacity_auction/accept', { token: offtakerToken, body: { request_id: requestId } });
    expect(res.status).toBe(200);
    expect((res.json as any).status).toBe('cleared');
    const cleared = db.prepare("SELECT COUNT(*) AS n FROM oe_deal_offers WHERE request_id = ? AND clearing_status = 'cleared'").get(requestId) as any;
    expect(cleared.n).toBeGreaterThanOrEqual(1);
  });
});

describe('deals — syndication fill-to-target', () => {
  it('rejects an overfilling commit with 409 oversubscribed and tracks filled_amount', async () => {
    const reqRes = await call(dealsRoutes, env, 'POST', '/debt_syndication/request', {
      token: ippToken, body: { need: { annual_kwh: 1, avg_tariff_zar_per_kwh: 1 }, target_amount_zar: 1000 },
    });
    expect(reqRes.status).toBe(200);
    const requestId = (reqRes.json as any).request_id;

    // first lender commits 600 → ok, filled 600
    const c1 = await call(dealsRoutes, env, 'POST', '/debt_syndication/offer', { token: lenderToken, body: { title: 'tranche A', term_sheet: { offered_annual_mwh: 1, availability: 'now' }, request_id: requestId, committed_amount_zar: 600 } });
    const offer1 = (c1.json as any).offer_id;
    const a1 = await call(dealsRoutes, env, 'POST', '/debt_syndication/accept', { token: lenderToken, body: { request_id: requestId, offer_id: offer1 } });
    expect(a1.status).toBe(200);
    let reqRow = db.prepare('SELECT filled_amount_zar FROM oe_deal_requests WHERE id = ?').get(requestId) as any;
    expect(reqRow.filled_amount_zar).toBe(600);

    // second lender tries to commit 600 → would overfill 1200 > 1000 → 409
    const c2 = await call(dealsRoutes, env, 'POST', '/debt_syndication/offer', { token: lenderToken, body: { title: 'tranche B', term_sheet: { offered_annual_mwh: 1, availability: 'now' }, request_id: requestId, committed_amount_zar: 600 } });
    const offer2 = (c2.json as any).offer_id;
    const a2 = await call(dealsRoutes, env, 'POST', '/debt_syndication/accept', { token: lenderToken, body: { request_id: requestId, offer_id: offer2 } });
    expect(a2.status).toBe(409);
    expect((a2.json as any).error).toBe('oversubscribed');
    reqRow = db.prepare('SELECT filled_amount_zar FROM oe_deal_requests WHERE id = ?').get(requestId) as any;
    expect(reqRow.filled_amount_zar).toBe(600);  // unchanged
  });
});

describe('deals — condition_precedent link gating', () => {
  it('blocks accept while a CP link is unmet, then succeeds once met', async () => {
    const offer = await call(dealsRoutes, env, 'POST', '/service_marketplace/offer', {
      token: await testJwtFor(db, 'par_support', { role: 'support' }), body: energyOffer({ availability: 'now' }),
    });
    const offerId = (offer.json as any).offer_id;
    const reqRes = await call(dealsRoutes, env, 'POST', '/service_marketplace/request', { token: offtakerToken, body: energyNeed() });
    const requestId = (reqRes.json as any).request_id;

    // create a condition_precedent link targeting the offer, unmet
    const link = await call(dealsRoutes, env, 'POST', '/link', {
      token: offtakerToken,
      body: { link_kind: 'condition_precedent', from_kind: 'request', from_id: requestId, to_kind: 'offer', to_id: offerId, condition_state: 'awaiting_board' },
    });
    expect(link.status).toBe(200);
    const linkId = (link.json as any).link_id;

    const blocked = await call(dealsRoutes, env, 'POST', '/service_marketplace/accept', { token: offtakerToken, body: { request_id: requestId, offer_id: offerId } });
    expect(blocked.status).toBe(409);
    expect((blocked.json as any).error).toBe('condition_precedent_unmet');

    // satisfy the link
    db.prepare("UPDATE oe_deal_links SET status = 'met' WHERE id = ?").run(linkId);
    const ok = await call(dealsRoutes, env, 'POST', '/service_marketplace/accept', { token: offtakerToken, body: { request_id: requestId, offer_id: offerId } });
    expect(ok.status).toBe(200);
    expect((ok.json as any).status).toBe('dispatched');
  });
});

describe('deals — capital stack objectives', () => {
  it('creates an objective and reads it back with legs, tenant-fenced', async () => {
    const obj = await call(dealsRoutes, env, 'POST', '/objective', {
      token: ippToken, body: { title: 'Plant funding', funding_target_zar: 1_000_000, project_ref: 'PRJ1' },
    });
    expect(obj.status).toBe(200);
    const oid = (obj.json as any).objective_id;
    const requestId = await makeRequest(offtakerToken);
    const leg = await call(dealsRoutes, env, 'POST', `/objective/${oid}/leg`, { token: ippToken, body: { request_id: requestId } });
    expect(leg.status).toBe(200);
    const get = await call(dealsRoutes, env, 'GET', `/objective/${oid}`, { token: ippToken });
    expect(get.status).toBe(200);
    const body = get.json as any;
    expect(body.objective.id).toBe(oid);
    expect(Array.isArray(body.legs)).toBe(true);
  });
});

describe('deals — links query', () => {
  it('creates and queries links', async () => {
    const link = await call(dealsRoutes, env, 'POST', '/link', {
      token: offtakerToken, body: { link_kind: 'bundle', from_kind: 'offer', from_id: 'o1', to_kind: 'offer', to_id: 'o2', link_group_id: 'g1' },
    });
    expect(link.status).toBe(200);
    const q = await call(dealsRoutes, env, 'GET', '/link?group=g1', { token: offtakerToken });
    expect(q.status).toBe(200);
    expect((q.json as any).links.length).toBe(1);
  });
});

describe('deals — unknown deal type', () => {
  it('returns 404 unknown_deal_type for a missing type', async () => {
    const res = await call(dealsRoutes, env, 'POST', '/no_such_type/offer', { token: ippToken, body: energyOffer() });
    expect(res.status).toBe(404);
    expect((res.json as any).error).toBe('unknown_deal_type');
  });

  it('returns 404 (not 500) for a SQL-injection-shaped type', async () => {
    const evil = encodeURIComponent("energy_supply'; DROP TABLE oe_deal_offers;--");
    const res = await call(dealsRoutes, env, 'POST', `/${evil}/offer`, { token: ippToken, body: energyOffer() });
    expect(res.status).toBe(404);
    expect((res.json as any).error).toBe('unknown_deal_type');
    // table still exists
    const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oe_deal_offers'").get();
    expect(t).toBeTruthy();
  });
});
