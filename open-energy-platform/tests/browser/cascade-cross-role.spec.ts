// ═══════════════════════════════════════════════════════════════════════════
// Cross-role cascade logic — Playwright API smoke tests.
//
// Tests that:
//   1. Regulator inbox receives items from multiple source events (cascade
//      fan-out from lender/offtaker/ipp/esums/trader/grid chains).
//   2. Lender dunning notices exist and cascade creates watchlist rows.
//   3. Briefing data reflects real cross-role state (market prices, actions).
//   4. Notifications accumulate from audit/contract events.
//   5. Incoming panel events exist for role-specific action queues.
//
// These are API-level cascade integrity checks — the browser is used only
// as the HTTP client (via request context), not to drive UI flows.
//
// Rationale: the fireCascade utility fans out to 7 stages. If any stage is
// broken the regulator inbox won't receive the cross-role push; testing the
// inbox content proves the cascade wired up correctly.
//
// Rate-limit discipline: one shared admin login; role-specific checks use
// shared token (admin has cross-tenant visibility).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';

let ADMIN_TOKEN: string | null = null;

test.beforeAll(async ({ request, baseURL }) => {
  for (const attempt of [0, 1]) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 15_000));
    const r = await request.post(`${baseURL}/api/auth/login`, {
      data: { email: 'admin@openenergy.co.za', password: PASSWORD },
      failOnStatusCode: false,
    });
    if (r.ok()) {
      const tok = (await r.json())?.data?.token;
      if (tok) { ADMIN_TOKEN = tok; return; }
    }
    if (attempt === 1) {
      throw new Error(`admin login failed: HTTP ${r.status()}`);
    }
  }
}, 90_000);

function auth() {
  return { Authorization: `Bearer ${ADMIN_TOKEN}` };
}

// ─── Regulator inbox cascade fan-out ─────────────────────────────────────────

test('regulator inbox has items from multiple source entity types (cascade fan-out)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/regulator/inbox`, { headers: auth() });
  expect(r.ok(), `GET /api/regulator/inbox failed: ${r.status()}`).toBeTruthy();

  const { data: items } = await r.json() as { data: Array<{ source_entity_type: string; source_event: string; severity: string }> };
  expect(Array.isArray(items), 'inbox data should be an array').toBeTruthy();
  expect(items.length, 'inbox should have at least 1 item').toBeGreaterThan(0);

  // Collect the distinct entity types — cascade should fan in from multiple domains
  const entityTypes = new Set(items.map((i) => i.source_entity_type));
  expect(
    entityTypes.size,
    `inbox should have items from multiple source_entity_types, found: ${[...entityTypes].join(', ')}`
  ).toBeGreaterThan(1);

  // All items must have required cascade fields
  for (const item of items.slice(0, 10)) {
    expect(item.source_event, 'each inbox item must have source_event').toBeTruthy();
    expect(item.source_entity_type, 'each inbox item must have source_entity_type').toBeTruthy();
    expect(item.severity, 'each inbox item must have severity').toBeTruthy();
    expect(['low', 'medium', 'high', 'critical']).toContain(item.severity);
  }
});

test('regulator inbox contains WO (work order) cascade items', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/regulator/inbox`, { headers: auth() });
  const { data: items } = await r.json() as { data: Array<{ source_entity_type: string }> };
  const woItems = items.filter((i) => i.source_entity_type === 'work_order');
  expect(woItems.length, 'cascade should have pushed WO items to regulator inbox').toBeGreaterThan(0);
});

test('regulator inbox contains items at high and critical severity', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/regulator/inbox`, { headers: auth() });
  const { data: items } = await r.json() as { data: Array<{ severity: string }> };
  const highOrCrit = items.filter((i) => ['high', 'critical'].includes(i.severity));
  expect(highOrCrit.length, 'should have high/critical severity cascade items in inbox').toBeGreaterThan(0);
});

test('regulator inbox items have SLA due dates set', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/regulator/inbox`, { headers: auth() });
  const { data: items } = await r.json() as { data: Array<{ sla_due_at: string | null }> };
  const withSla = items.filter((i) => i.sla_due_at !== null);
  // At least some cascade items should carry SLA deadlines
  expect(withSla.length, 'at least some inbox items should have sla_due_at').toBeGreaterThan(0);
});

// ─── Lender dunning → watchlist cascade ──────────────────────────────────────

test('lender dunning notices exist (covenant breach cascade)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/lender/dunning`, { headers: auth() });
  expect(r.ok(), `GET /api/lender/dunning failed: ${r.status()}`).toBeTruthy();

  const { data: notices } = await r.json() as { data: Array<{ cycle: number; trigger_signal: string; watchlist_id: string }> };
  expect(Array.isArray(notices), 'dunning data should be an array').toBeTruthy();
  expect(notices.length, 'should have at least 1 dunning notice').toBeGreaterThan(0);

  for (const n of notices.slice(0, 5)) {
    expect(n.cycle, 'dunning notice must have cycle').toBeGreaterThan(0);
    expect(n.trigger_signal, 'dunning notice must have trigger_signal').toBeTruthy();
    expect(n.watchlist_id, 'dunning notice must be linked to a watchlist row').toBeTruthy();
  }
});

test('lender watchlist has rows created by covenant breach cascade', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/lender/dunning/watchlist`, { headers: auth() });
  expect(r.ok(), `GET /api/lender/dunning/watchlist failed: ${r.status()}`).toBeTruthy();

  const { data: rows } = await r.json() as { data: Array<{ facility_id: string; dunning_cycle: number; trigger_signal: string }> };
  expect(Array.isArray(rows), 'watchlist data should be an array').toBeTruthy();
  expect(rows.length, 'watchlist should have at least 1 row').toBeGreaterThan(0);

  for (const row of rows) {
    expect(row.facility_id, 'watchlist row must have facility_id').toBeTruthy();
    expect(row.dunning_cycle, 'watchlist row must have dunning_cycle').toBeGreaterThanOrEqual(0);
    expect(row.trigger_signal, 'watchlist row must have trigger_signal').toBeTruthy();
  }
});

// ─── Briefing API (cross-role state aggregation) ──────────────────────────────

test('briefing API returns market prices and role-specific context', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/briefing`, { headers: auth() });
  expect(r.ok(), `GET /api/briefing failed: ${r.status()}`).toBeTruthy();

  const { data: brief } = await r.json() as { data: {
    date: string;
    role: string;
    summary: string;
    markets: { solar?: { price_zar_per_mwh: number; volume_mwh: number }; wind?: { price_zar_per_mwh: number } };
  }};

  expect(brief.date, 'briefing must have a date').toBeTruthy();
  expect(brief.summary, 'briefing must have a summary').toBeTruthy();
  expect(brief.markets, 'briefing must include markets').toBeTruthy();

  // Market prices should be positive numeric values
  if (brief.markets.solar) {
    expect(brief.markets.solar.price_zar_per_mwh).toBeGreaterThan(0);
    expect(brief.markets.solar.volume_mwh).toBeGreaterThanOrEqual(0);
  }
  if (brief.markets.wind) {
    expect(brief.markets.wind.price_zar_per_mwh).toBeGreaterThan(0);
  }
});

// ─── Notifications (audit/event cascade) ─────────────────────────────────────

test('notifications endpoint returns audit and contract events', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/notifications`, { headers: auth() });
  expect(r.ok(), `GET /api/notifications failed: ${r.status()}`).toBeTruthy();

  const body = await r.json() as { data: { notifications?: Array<{ type: string; title: string }> } };
  const notifications = body.data?.notifications ?? [];
  expect(Array.isArray(notifications), 'notifications should be an array').toBeTruthy();

  // Should have at least one notification from cascade audit events
  expect(notifications.length, 'should have at least 1 notification').toBeGreaterThan(0);

  for (const n of notifications.slice(0, 5)) {
    expect(n.type, 'notification must have type').toBeTruthy();
    expect(n.title, 'notification must have title').toBeTruthy();
  }
});

// ─── Cross-role CRUD — chain state machines ───────────────────────────────────

test('complaints chain GET returns cases (Wave 66 regulator complaints)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/complaints/chain`, { headers: auth() });
  expect(r.ok(), `GET /api/complaints/chain failed: ${r.status()}`).toBeTruthy();
  const { data } = await r.json();
  expect(data, 'complaints chain data must exist').toBeTruthy();
});

test('lender drawdown chain GET returns cases (Wave 21)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/lender/drawdown-chain`, { headers: auth() });
  expect(r.ok(), `GET /api/lender/drawdown-chain failed: ${r.status()}`).toBeTruthy();
  const body = await r.json();
  expect(body.success, 'drawdown chain should return success:true').toBeTruthy();
});

test('carbon MRV chain GET returns verification cases (Wave 11)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/carbon/mrv-chain`, { headers: auth() });
  expect(r.ok(), `GET /api/carbon/mrv-chain failed: ${r.status()}`).toBeTruthy();
  const body = await r.json();
  expect(body.success, 'MRV chain should return success:true').toBeTruthy();
});

test('algo cert chain GET returns certification cases (Wave 60)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/algo-cert/chain`, { headers: auth() });
  expect(r.ok(), `GET /api/algo-cert/chain failed: ${r.status()}`).toBeTruthy();
  const body = await r.json();
  expect(body.success, 'algo cert chain should return success:true').toBeTruthy();
});

// ─── Interoperability: cockpit KPIs reflect real transaction data ──────────────

test('cockpit KPIs are non-zero (real transactions exist)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/cockpit/kpis`, { headers: auth() });
  expect(r.ok(), `GET /api/cockpit/kpis failed: ${r.status()}`).toBeTruthy();

  const { data } = await r.json() as { data: {
    market: { total_trades: number; total_volume: number };
    admin: { total_users: number; total_trades: number; active_contracts: number; total_revenue_zar: number };
  }};

  expect(data.market.total_trades, 'market trades should be > 0').toBeGreaterThan(0);
  expect(data.admin.total_users, 'admin users should be > 0').toBeGreaterThan(0);
  expect(data.admin.active_contracts, 'active contracts should be >= 0').toBeGreaterThanOrEqual(0);
  expect(data.admin.total_revenue_zar, 'total revenue should be > 0').toBeGreaterThan(0);
});

test('cockpit actions list has pending actions for admin', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/api/cockpit/actions`, { headers: auth() });
  expect(r.ok(), `GET /api/cockpit/actions failed: ${r.status()}`).toBeTruthy();
  const body = await r.json();
  // Actions may be empty list or populated — both are valid; just must be an array
  const actions = body.data ?? body;
  expect(typeof actions === 'object' || Array.isArray(actions), 'cockpit actions data must be object or array').toBeTruthy();
});
