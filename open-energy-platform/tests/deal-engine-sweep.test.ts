// Task 2c — deals.sweep cron. Strict TDD: written first, watched fail, then implemented.
//
// runDealSweep(env) does two timer-driven jobs the */15 cron calls:
//   1. Expire stale offers (status published/open, expiry <= now → 'expired').
//   2. Auto-clear timer auctions whose bid window has closed (pay_as_bid),
//      firing deal.cleared exactly as the live accept handler does.
// Guards: only descriptors with kind='auction' AND clearing.window_close='timer'
// are swept; marketplace / manual-close / unknown deal_types are left alone.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { runDealSweep } from '../src/routes/deals';
import {
  registerDeal,
  registerDealDescriptors,
  _resetDealRegistryForTests,
  type DealDescriptor,
} from '../src/utils/deal-registry';

let db: Database.Database;
let env: any;

// Minimal auction descriptor — timer close, pay_as_bid. (No real matcher needed:
// the sweep clears by bid_amount_zar ASC, it never calls matcher/scorer.)
function auction(deal_type: string, window_close: 'timer' | 'manual'): DealDescriptor {
  return {
    deal_type, kind: 'auction', initiator: 'demand',
    provider_roles: ['trader'], demand_roles: ['offtaker'],
    event_prefix: `deal_${deal_type}`, price_basis: 'listed',
    term_sheet_schema: [], need_schema: [],
    matcher: async (_n, o) => o,
    scorer: () => ({ option_id: '', title: '', primary_metric: null, est_value_zar: 0, sweetener_value_zar: 0, secondary: {}, price_basis: 'listed', rationale: [] }),
    clearing: { rule: 'pay_as_bid', window_close },
    accept_dispatch: { live: { chain_key: 'x', endpoint: () => '/x' }, upcoming: null },
  } as DealDescriptor;
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetDealRegistryForTests();
  registerDealDescriptors();                       // energy_supply (marketplace)
  registerDeal(auction('test_auction', 'timer'));  // swept
  registerDeal(auction('test_manual', 'manual'));  // not swept (manual close)
});
afterEach(() => { db.close(); _resetDealRegistryForTests(); });

function seedOffer(o: { id: string; deal_type?: string; request_id?: string | null; status?: string; expiry?: string | null; bid_amount_zar?: number | null }) {
  db.prepare(
    `INSERT INTO oe_deal_offers (id, deal_type, provider_id, provider_role, tenant_id, title, term_sheet, request_id, bid_amount_zar, bid_quantity, status, expiry)
     VALUES (?, ?, 'par_p', 'trader', 't1', 'offer', '{}', ?, ?, 1, ?, ?)`,
  ).run(o.id, o.deal_type ?? 'test_auction', o.request_id ?? null, o.bid_amount_zar ?? null, o.status ?? 'published', o.expiry ?? null);
}

function seedRequest(r: { id: string; deal_type?: string; status?: string; bid_window_close?: string | null; target_amount_zar?: number | null }) {
  db.prepare(
    `INSERT INTO oe_deal_requests (id, deal_type, demand_id, demand_role, tenant_id, need, bid_window_close, target_amount_zar, status)
     VALUES (?, ?, 'par_d', 'offtaker', 't1', '{}', ?, ?, ?)`,
  ).run(r.id, r.deal_type ?? 'test_auction', r.bid_window_close ?? null, r.target_amount_zar ?? null, r.status ?? 'open');
}

const offer = (id: string) => db.prepare('SELECT * FROM oe_deal_offers WHERE id = ?').get(id) as any;
const request = (id: string) => db.prepare('SELECT * FROM oe_deal_requests WHERE id = ?').get(id) as any;

describe('runDealSweep — offer expiry', () => {
  it('expires published/open offers whose expiry has passed', async () => {
    seedOffer({ id: 'o_past', status: 'published', expiry: '2000-01-01 00:00:00' });
    seedOffer({ id: 'o_open', status: 'open', expiry: '2000-01-01 00:00:00' });
    const res = await runDealSweep(env);
    expect(res.offersExpired).toBe(2);
    expect(offer('o_past').status).toBe('expired');
    expect(offer('o_open').status).toBe('expired');
  });

  it('leaves future-dated, null-expiry, and already-accepted offers untouched', async () => {
    seedOffer({ id: 'o_future', status: 'published', expiry: '2999-01-01 00:00:00' });
    seedOffer({ id: 'o_null', status: 'published', expiry: null });
    seedOffer({ id: 'o_accepted', status: 'accepted', expiry: '2000-01-01 00:00:00' });
    const res = await runDealSweep(env);
    expect(res.offersExpired).toBe(0);
    expect(offer('o_future').status).toBe('published');
    expect(offer('o_null').status).toBe('published');
    expect(offer('o_accepted').status).toBe('accepted');
  });
});

describe('runDealSweep — timer auction auto-clear', () => {
  it('clears a timer auction whose window has closed, pay_as_bid up to target', async () => {
    seedRequest({ id: 'r1', deal_type: 'test_auction', bid_window_close: '2000-01-01 00:00:00', target_amount_zar: 100 });
    seedOffer({ id: 'b_cheap', request_id: 'r1', status: 'published', bid_amount_zar: 40 });
    seedOffer({ id: 'b_mid', request_id: 'r1', status: 'open', bid_amount_zar: 50 });
    seedOffer({ id: 'b_over', request_id: 'r1', status: 'published', bid_amount_zar: 80 }); // 40+50+80 > 100 → excluded

    const res = await runDealSweep(env);
    expect(res.auctionsCleared).toBe(1);
    expect(request('r1').status).toBe('cleared');
    expect(request('r1').clearing_price_zar).toBe(90); // 40 + 50
    expect(offer('b_cheap').status).toBe('accepted');
    expect(offer('b_cheap').clearing_status).toBe('cleared');
    expect(offer('b_mid').status).toBe('accepted');
    expect(offer('b_over').status).toBe('published'); // not cleared
  });

  it('fires deal.cleared so the fee engine records a (waived) revenue row from the sweep path', async () => {
    seedRequest({ id: 'r1', deal_type: 'test_auction', bid_window_close: '2000-01-01 00:00:00', target_amount_zar: null });
    seedOffer({ id: 'b1', request_id: 'r1', status: 'published', bid_amount_zar: 25 });
    await runDealSweep(env);
    const rev = db.prepare(`SELECT * FROM oe_platform_revenue WHERE trigger_event = 'deal.cleared'`).get() as any;
    expect(rev).toBeTruthy();
    expect(rev.entity_value).toBe(25);
    expect(rev.status).toBe('waived');
  });

  it('does NOT clear a future-window auction', async () => {
    seedRequest({ id: 'r1', deal_type: 'test_auction', bid_window_close: '2999-01-01 00:00:00', target_amount_zar: null });
    seedOffer({ id: 'b1', request_id: 'r1', status: 'published', bid_amount_zar: 25 });
    const res = await runDealSweep(env);
    expect(res.auctionsCleared).toBe(0);
    expect(request('r1').status).toBe('open');
  });

  it('does NOT clear manual-close auctions even when the window has passed', async () => {
    seedRequest({ id: 'r1', deal_type: 'test_manual', bid_window_close: '2000-01-01 00:00:00', target_amount_zar: null });
    seedOffer({ id: 'b1', deal_type: 'test_manual', request_id: 'r1', status: 'published', bid_amount_zar: 25 });
    const res = await runDealSweep(env);
    expect(res.auctionsCleared).toBe(0);
    expect(request('r1').status).toBe('open');
  });

  it('does NOT clear marketplace deal_types or unknown deal_types', async () => {
    seedRequest({ id: 'r_mkt', deal_type: 'energy_supply', bid_window_close: '2000-01-01 00:00:00' });
    seedRequest({ id: 'r_unknown', deal_type: 'no_such_type', bid_window_close: '2000-01-01 00:00:00' });
    const res = await runDealSweep(env);
    expect(res.auctionsCleared).toBe(0);
    expect(request('r_mkt').status).toBe('open');
    expect(request('r_unknown').status).toBe('open');
  });
});
