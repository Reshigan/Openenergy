// ═══════════════════════════════════════════════════════════════════════════════
// W226 — VCM Voluntary Carbon Market Spot Order Book
// Bilateral price-time-priority matching for carbon credits (tCO2e)
// Routes: GET /market-data, POST /market-data/refresh,
//         GET /orders, POST /orders, POST /orders/:id/cancel,
//         GET /trades, GET /depth
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund', 'offtaker', 'ipp_developer', 'support'];

// ─── GET /market-data ─────────────────────────────────────────────────────────
// Public endpoint (no role check) — returns latest VCM market data rows.
// Supports optional ?methodology and ?registry_standard filters.
app.get('/market-data', async (c) => {
  const methodology      = c.req.query('methodology');
  const registryStandard = c.req.query('registry_standard');

  let sql    = 'SELECT * FROM oe_vcm_market_data WHERE 1=1';
  const bind: unknown[] = [];

  if (methodology) {
    sql += ' AND methodology = ?';
    bind.push(methodology);
  }
  if (registryStandard) {
    sql += ' AND registry_standard = ?';
    bind.push(registryStandard);
  }

  sql += ' ORDER BY methodology, registry_standard, vintage_year DESC';

  const rows = await c.env.DB.prepare(sql).bind(...bind).all<Record<string, unknown>>();
  return c.json({ success: true, data: rows.results ?? [] });
});

// ─── POST /market-data/refresh ────────────────────────────────────────────────
// Admin only. Computes 30-day rolling VWAP from settled trades and upserts
// oe_vcm_market_data with updated prices and volume statistics.
app.post('/market-data/refresh', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Admin only' }, 403);
  }

  const now = new Date().toISOString();

  const vwapRows = await c.env.DB
    .prepare(`
      SELECT
        methodology,
        registry_standard,
        vintage_year,
        SUM(quantity_tco2e * price_zar_per_tco2e) / SUM(quantity_tco2e) AS vwap_price,
        SUM(quantity_tco2e) AS total_volume_tco2e,
        COUNT(*)            AS trade_count,
        MAX(price_zar_per_tco2e) AS high_price,
        MIN(price_zar_per_tco2e) AS low_price
      FROM oe_vcm_trades
      WHERE status = 'settled'
        AND created_at > datetime('now', '-30 days')
      GROUP BY methodology, registry_standard, vintage_year
    `)
    .all<Record<string, unknown>>();

  const results = vwapRows.results ?? [];

  for (const row of results) {
    await c.env.DB
      .prepare(`
        INSERT OR REPLACE INTO oe_vcm_market_data
          (id, methodology, registry_standard, vintage_year,
           vwap_price_zar_per_tco2e, total_volume_tco2e, trade_count,
           high_price_zar, low_price_zar, updated_at)
        VALUES
          (COALESCE(
            (SELECT id FROM oe_vcm_market_data
             WHERE methodology = ? AND registry_standard = ? AND vintage_year = ?),
            ?
          ), ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        row.methodology, row.registry_standard, row.vintage_year,
        crypto.randomUUID(),
        row.methodology, row.registry_standard, row.vintage_year,
        row.vwap_price, row.total_volume_tco2e, row.trade_count,
        row.high_price, row.low_price,
        now,
      )
      .run();
  }

  return c.json({ success: true, data: { updated: results.length } });
});

// ─── GET /orders ──────────────────────────────────────────────────────────────
// Auth required. Tenant-isolated unless admin or carbon_fund.
// Filters: ?status, ?methodology, ?registry_standard, ?vintage_year, ?side.
// Returns rows + order-book KPIs.
app.get('/orders', async (c) => {
  const user      = getCurrentUser(c);
  const isPriv    = ['admin', 'carbon_fund'].includes(user.role);

  const status           = c.req.query('status');
  const methodology      = c.req.query('methodology');
  const registryStandard = c.req.query('registry_standard');
  const vintageYear      = c.req.query('vintage_year');
  const side             = c.req.query('side');

  let sql    = 'SELECT * FROM oe_vcm_orders WHERE 1=1';
  const bind: unknown[] = [];

  if (!isPriv) {
    sql += ' AND participant_id = ?';
    bind.push(user.id);
  }
  if (status) {
    sql += ' AND status = ?';
    bind.push(status);
  }
  if (methodology) {
    sql += ' AND methodology = ?';
    bind.push(methodology);
  }
  if (registryStandard) {
    sql += ' AND registry_standard = ?';
    bind.push(registryStandard);
  }
  if (vintageYear) {
    sql += ' AND vintage_year = ?';
    bind.push(parseInt(vintageYear, 10));
  }
  if (side) {
    sql += ' AND side = ?';
    bind.push(side);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...bind).all<Record<string, unknown>>();
  const all  = rows.results ?? [];

  const openBids   = all.filter(r => r.side === 'bid'   && ['open', 'partially_filled'].includes(r.status as string));
  const openOffers = all.filter(r => r.side === 'offer' && ['open', 'partially_filled'].includes(r.status as string));

  const kpis = {
    total_bids:          all.filter(r => r.side === 'bid').length,
    total_offers:        all.filter(r => r.side === 'offer').length,
    open_tco2e_bids:     openBids.reduce((s, r) => s + ((r.quantity_tco2e as number) - (r.filled_quantity_tco2e as number ?? 0)), 0),
    open_tco2e_offers:   openOffers.reduce((s, r) => s + ((r.quantity_tco2e as number) - (r.filled_quantity_tco2e as number ?? 0)), 0),
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── POST /orders ─────────────────────────────────────────────────────────────
// Auth required + WRITE_ROLES. Validates and inserts an order, then runs
// price-time-priority matching against up to 5 resting opposite orders.
app.post('/orders', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Insufficient role' }, 403);
  }

  const body = await c.req.json<Record<string, unknown>>();

  // ── Validation ──────────────────────────────────────────────────────────────
  const side                = body.side as string;
  const methodology         = body.methodology as string;
  const registryStandard    = body.registry_standard as string;
  const vintageYear         = typeof body.vintage_year === 'number' ? body.vintage_year : parseInt(String(body.vintage_year), 10);
  const quantityTco2e       = parseFloat(String(body.quantity_tco2e));
  const minLotTco2e         = body.min_lot_tco2e !== undefined ? parseFloat(String(body.min_lot_tco2e)) : 1.0;
  const priceZarPerTco2e    = parseFloat(String(body.price_zar_per_tco2e));
  const carbonTaxEligible   = body.carbon_tax_eligible !== undefined ? (body.carbon_tax_eligible ? 1 : 0) : 0;
  const expiry              = body.expiry as string | undefined;

  if (!side || !['bid', 'offer'].includes(side)) {
    return c.json({ success: false, error: 'side must be bid or offer' }, 400);
  }
  if (!methodology) {
    return c.json({ success: false, error: 'methodology is required' }, 400);
  }
  if (!registryStandard) {
    return c.json({ success: false, error: 'registry_standard is required' }, 400);
  }
  if (!vintageYear || isNaN(vintageYear) || vintageYear < 2015) {
    return c.json({ success: false, error: 'vintage_year must be an integer >= 2015' }, 400);
  }
  if (!quantityTco2e || isNaN(quantityTco2e) || quantityTco2e <= 0) {
    return c.json({ success: false, error: 'quantity_tco2e must be a positive number' }, 400);
  }
  if (!priceZarPerTco2e || isNaN(priceZarPerTco2e) || priceZarPerTco2e <= 0) {
    return c.json({ success: false, error: 'price_zar_per_tco2e must be a positive number' }, 400);
  }

  // ── Open order count guard (max 50 per participant) ─────────────────────────
  const countRow = await c.env.DB
    .prepare(`SELECT COUNT(*) AS cnt FROM oe_vcm_orders WHERE participant_id = ? AND status IN ('open','partially_filled')`)
    .bind(user.id)
    .first<{ cnt: number }>();

  if ((countRow?.cnt ?? 0) >= 50) {
    return c.json({ success: false, error: 'Open order limit reached (50). Cancel existing orders first.' }, 429);
  }

  // ── Insert order ─────────────────────────────────────────────────────────────
  const now     = new Date().toISOString();
  const orderId = crypto.randomUUID();

  await c.env.DB
    .prepare(`
      INSERT INTO oe_vcm_orders
        (id, participant_id, side, methodology, registry_standard, vintage_year,
         quantity_tco2e, filled_quantity_tco2e, min_lot_tco2e, price_zar_per_tco2e,
         carbon_tax_eligible, status, expiry, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?, ?, ?)
    `)
    .bind(
      orderId, user.id, side, methodology, registryStandard, vintageYear,
      quantityTco2e, minLotTco2e, priceZarPerTco2e,
      carbonTaxEligible, expiry ?? null, now, now,
    )
    .run();

  // ── Matching engine ──────────────────────────────────────────────────────────
  let tradesCreated = 0;

  // Fetch up to 5 resting compatible opposite orders
  let matchSql: string;
  if (side === 'bid') {
    // New bid — match against offers with price <= bid price (best offer first = lowest price)
    matchSql = `
      SELECT * FROM oe_vcm_orders
      WHERE side = 'offer'
        AND status IN ('open','partially_filled')
        AND methodology = ?
        AND registry_standard = ?
        AND vintage_year = ?
        AND price_zar_per_tco2e <= ?
      ORDER BY price_zar_per_tco2e ASC, created_at ASC
      LIMIT 5
    `;
  } else {
    // New offer — match against bids with price >= offer price (best bid first = highest price)
    matchSql = `
      SELECT * FROM oe_vcm_orders
      WHERE side = 'bid'
        AND status IN ('open','partially_filled')
        AND methodology = ?
        AND registry_standard = ?
        AND vintage_year = ?
        AND price_zar_per_tco2e >= ?
      ORDER BY price_zar_per_tco2e DESC, created_at ASC
      LIMIT 5
    `;
  }

  const matchingOrders = await c.env.DB
    .prepare(matchSql)
    .bind(methodology, registryStandard, vintageYear, priceZarPerTco2e)
    .all<Record<string, unknown>>();

  // Settle-date: T+2 calendar days
  const settleDateObj = new Date();
  settleDateObj.setDate(settleDateObj.getDate() + 2);
  const settlementDate = settleDateObj.toISOString().slice(0, 10); // yyyy-mm-dd

  // Track remaining unfilled quantity on the new order
  let newOrderRemaining = quantityTco2e;

  for (const matchedOrder of (matchingOrders.results ?? [])) {
    if (newOrderRemaining <= 0) break;

    const matchedRemaining =
      (matchedOrder.quantity_tco2e as number) - ((matchedOrder.filled_quantity_tco2e as number) ?? 0);

    if (matchedRemaining <= 0) continue;

    const tradeQty  = Math.min(newOrderRemaining, matchedRemaining);
    const tradePrice = matchedOrder.price_zar_per_tco2e as number; // matched order sets the price
    const totalZar  = tradeQty * tradePrice;
    const platformFeeZar = totalZar * 0.01;

    const buyerId  = side === 'bid' ? user.id : (matchedOrder.participant_id as string);
    const sellerId = side === 'offer' ? user.id : (matchedOrder.participant_id as string);
    const bidOrderId   = side === 'bid'   ? orderId : (matchedOrder.id as string);
    const offerOrderId = side === 'offer' ? orderId : (matchedOrder.id as string);

    const tradeId = crypto.randomUUID();
    const tradeNow = new Date().toISOString();

    await c.env.DB
      .prepare(`
        INSERT INTO oe_vcm_trades
          (id, bid_order_id, offer_order_id, buyer_id, seller_id,
           methodology, registry_standard, vintage_year,
           quantity_tco2e, price_zar_per_tco2e, total_zar,
           platform_fee_zar, settlement_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_settlement', ?, ?)
      `)
      .bind(
        tradeId, bidOrderId, offerOrderId, buyerId, sellerId,
        methodology, registryStandard, vintageYear,
        tradeQty, tradePrice, totalZar,
        platformFeeZar, settlementDate, tradeNow, tradeNow,
      )
      .run();

    tradesCreated++;

    // Update matched (resting) order
    const matchedNewFilled = ((matchedOrder.filled_quantity_tco2e as number) ?? 0) + tradeQty;
    const matchedStatus =
      matchedNewFilled >= (matchedOrder.quantity_tco2e as number) ? 'filled' : 'partially_filled';

    await c.env.DB
      .prepare(`UPDATE oe_vcm_orders SET filled_quantity_tco2e = ?, status = ?, updated_at = ? WHERE id = ?`)
      .bind(matchedNewFilled, matchedStatus, tradeNow, matchedOrder.id)
      .run();

    // Update new order running fill
    newOrderRemaining -= tradeQty;
  }

  // Persist the new order's fill state
  const newOrderFilled = quantityTco2e - newOrderRemaining;
  const newOrderStatus =
    newOrderFilled >= quantityTco2e ? 'filled' :
    newOrderFilled > 0 ? 'partially_filled' : 'open';

  if (newOrderFilled > 0) {
    await c.env.DB
      .prepare(`UPDATE oe_vcm_orders SET filled_quantity_tco2e = ?, status = ?, updated_at = ? WHERE id = ?`)
      .bind(newOrderFilled, newOrderStatus, new Date().toISOString(), orderId)
      .run();
  }

  // Fire cascade if any trades were created
  if (tradesCreated > 0) {
    await fireCascade({
      event: 'vcm_order_matched' as EventType,
      actor_id: user.id,
      entity_type: 'vcm_order',
      entity_id: orderId,
      data: {
        side,
        methodology,
        registry_standard: registryStandard,
        vintage_year: vintageYear,
        trades_created: tradesCreated,
      },
      env: c.env as any,
    }).catch(() => {});
  }

  // Fetch the inserted order for the response
  const inserted = await c.env.DB
    .prepare('SELECT * FROM oe_vcm_orders WHERE id = ?')
    .bind(orderId)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: { order: inserted, trades_created: tradesCreated } }, 201);
});

// ─── POST /orders/:id/cancel ──────────────────────────────────────────────────
// Auth required. Owner or admin may cancel an open/partially_filled order.
app.post('/orders/:id/cancel', async (c) => {
  const user    = getCurrentUser(c);
  const isAdmin = user.role === 'admin';
  const id      = c.req.param('id');

  const order = await c.env.DB
    .prepare('SELECT * FROM oe_vcm_orders WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();

  if (!order) {
    return c.json({ success: false, error: 'Order not found' }, 404);
  }

  if (!isAdmin && order.participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised to cancel this order' }, 403);
  }

  if (!['open', 'partially_filled'].includes(order.status as string)) {
    return c.json({ success: false, error: `Cannot cancel order in status '${order.status as string}'` }, 409);
  }

  const now = new Date().toISOString();
  await c.env.DB
    .prepare(`UPDATE oe_vcm_orders SET status = 'cancelled', updated_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();

  const updated = await c.env.DB
    .prepare('SELECT * FROM oe_vcm_orders WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: updated });
});

// ─── GET /trades ──────────────────────────────────────────────────────────────
// Auth required. Tenant-isolated unless admin or carbon_fund.
// Filters: ?date_from, ?date_to, ?status.
// Returns rows + trade KPIs.
app.get('/trades', async (c) => {
  const user   = getCurrentUser(c);
  const isPriv = ['admin', 'carbon_fund'].includes(user.role);

  const dateFrom = c.req.query('date_from');
  const dateTo   = c.req.query('date_to');
  const status   = c.req.query('status');

  let sql    = 'SELECT * FROM oe_vcm_trades WHERE 1=1';
  const bind: unknown[] = [];

  if (!isPriv) {
    sql += ' AND (buyer_id = ? OR seller_id = ?)';
    bind.push(user.id, user.id);
  }
  if (dateFrom) {
    sql += ' AND created_at >= ?';
    bind.push(dateFrom);
  }
  if (dateTo) {
    sql += ' AND created_at <= ?';
    bind.push(dateTo);
  }
  if (status) {
    sql += ' AND status = ?';
    bind.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  const rows  = await c.env.DB.prepare(sql).bind(...bind).all<Record<string, unknown>>();
  const trades = rows.results ?? [];

  const kpis = {
    total_trades:     trades.length,
    total_zar:        trades.reduce((s, r) => s + ((r.total_zar as number) ?? 0), 0),
    total_tco2e:      trades.reduce((s, r) => s + ((r.quantity_tco2e as number) ?? 0), 0),
    platform_fees_zar: trades.reduce((s, r) => s + ((r.platform_fee_zar as number) ?? 0), 0),
  };

  return c.json({ success: true, data: trades, kpis });
});

// ─── GET /depth ───────────────────────────────────────────────────────────────
// Public endpoint. Requires ?methodology, ?registry_standard, ?vintage_year.
// Returns aggregated bid/offer depth (price levels with quantity and count).
app.get('/depth', async (c) => {
  const methodology      = c.req.query('methodology');
  const registryStandard = c.req.query('registry_standard');
  const vintageYear      = c.req.query('vintage_year');

  if (!methodology || !registryStandard || !vintageYear) {
    return c.json(
      { success: false, error: 'methodology, registry_standard, and vintage_year are required' },
      400,
    );
  }

  const vintageYearInt = parseInt(vintageYear, 10);

  const bids = await c.env.DB
    .prepare(`
      SELECT
        price_zar_per_tco2e AS price,
        SUM(quantity_tco2e - filled_quantity_tco2e) AS quantity,
        COUNT(*) AS count
      FROM oe_vcm_orders
      WHERE status = 'open'
        AND side = 'bid'
        AND methodology = ?
        AND registry_standard = ?
        AND vintage_year = ?
      GROUP BY price_zar_per_tco2e
      ORDER BY price_zar_per_tco2e DESC
    `)
    .bind(methodology, registryStandard, vintageYearInt)
    .all<{ price: number; quantity: number; count: number }>();

  const offers = await c.env.DB
    .prepare(`
      SELECT
        price_zar_per_tco2e AS price,
        SUM(quantity_tco2e - filled_quantity_tco2e) AS quantity,
        COUNT(*) AS count
      FROM oe_vcm_orders
      WHERE status = 'open'
        AND side = 'offer'
        AND methodology = ?
        AND registry_standard = ?
        AND vintage_year = ?
      GROUP BY price_zar_per_tco2e
      ORDER BY price_zar_per_tco2e ASC
    `)
    .bind(methodology, registryStandard, vintageYearInt)
    .all<{ price: number; quantity: number; count: number }>();

  return c.json({
    success: true,
    data: {
      bids:   bids.results   ?? [],
      offers: offers.results ?? [],
    },
  });
});

export default app;
