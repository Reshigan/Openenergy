// ═══════════════════════════════════════════════════════════════════════════════
// W227 — Sustainability Marketplace Listings
// Unified cross-role marketplace: RECs, VCM credits, brokered CoA retirements
//
// Legal framework:
//  RECs:         I-REC Standard / GCC — secondary trading permitted
//  VCM credits:  Verra VCS v4.5 / GS4GG — free secondary market
//  Brokered CoA: Carbon Tax Act §13 — retirement on buyer's behalf, not resale
//  FSCA:         FMA 2012 — spot carbon credit transactions exempt from FSP
//
// Routes:
//   GET  /browse                — public marketplace browse (no auth)
//   GET  /my-listings           — auth: own listings with KPIs
//   GET  /listings/:id          — public single listing
//   POST /listings              — auth: create new listing
//   POST /listings/:id/action   — auth: state-machine transition
//   POST /sla-sweep             — admin/support: cron SLA sweep
//   GET  /portfolio             — auth: buyer's consolidated portfolio
//   GET  /market-stats          — public: live market statistics
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  ListingStatus,
  ListingAction,
  MarketplaceTier,
  deriveListingSla,
  deriveListingTier,
  LISTING_HARD_TERMINALS,
  LISTING_VALID_TRANSITIONS,
  LISTING_STATE_TRANSITIONS,
  listingCrossesIntoRegulator,
  computePlatformFee,
} from '../utils/sustainability-marketplace-spec';

const app = new Hono<HonoEnv>();

const WRITE_ROLES = ['admin', 'ipp_developer', 'carbon_fund', 'offtaker', 'lender', 'support'];

// ─── SLA sweep (exported for cron / scheduled handler) ────────────────────────
export async function listingSlaSweep(env: any) {
  const now = new Date().toISOString();

  // 1. Expire listings whose listing_expiry has passed and are still live
  const expirable = await (env.DB as D1Database)
    .prepare(
      `SELECT * FROM oe_sustainability_listings
       WHERE listing_expiry < ? AND chain_status NOT IN ('sold_out','cancelled','expired')`,
    )
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of expirable.results ?? []) {
    await (env.DB as D1Database)
      .prepare(
        `UPDATE oe_sustainability_listings
         SET chain_status = 'expired', updated_at = ? WHERE id = ?`,
      )
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'marketplace_listing_expire' as EventType,
      actor_id: 'system',
      entity_type: 'sustainability_listing',
      entity_id: row.id as string,
      data: { listing_type: row.listing_type, tier: row.listing_tier },
      env: env as any,
    }).catch(() => {});
  }

  // 2. SLA breach — active/partially_sold listings past sla_deadline
  const overdue = await (env.DB as D1Database)
    .prepare(
      `SELECT * FROM oe_sustainability_listings
       WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('sold_out','cancelled','expired')`,
    )
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(
        `UPDATE oe_sustainability_listings SET sla_breached = 1, updated_at = ? WHERE id = ?`,
      )
      .bind(now, row.id)
      .run();

    if (listingCrossesIntoRegulator('sla_breach', row.listing_tier as MarketplaceTier)) {
      await (env.DB as D1Database)
        .prepare(
          `INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          'sustainability_listing',
          row.id,
          'listing_sla_breach',
          `Sustainability listing SLA breached — ${row.listing_tier} — ${row.listing_type} — ${row.title ?? '?'}`,
          row.participant_id,
          now,
        )
        .run()
        .catch(() => {});
    }

    await fireCascade({
      event: 'marketplace_listing_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'sustainability_listing',
      entity_id: row.id as string,
      data: { listing_type: row.listing_type, tier: row.listing_tier },
      env: env as any,
    }).catch(() => {});
  }

  return {
    expired: expirable.results?.length ?? 0,
    sla_breached: overdue.results?.length ?? 0,
  };
}

// ─── GET /browse ─ public, no auth ────────────────────────────────────────────
app.get('/browse', async (c) => {
  const listingType     = c.req.query('listing_type');
  const technology      = c.req.query('technology');
  const registryStd     = c.req.query('registry_standard');
  const vintageYear     = c.req.query('vintage_year');
  const carbonTaxEl     = c.req.query('carbon_tax_eligible');
  const maxPriceZar     = c.req.query('max_price_zar');
  const minQty          = c.req.query('min_qty');
  const framework       = c.req.query('framework');
  const sort            = c.req.query('sort') ?? 'newest';

  let sql = `SELECT * FROM oe_sustainability_listings WHERE chain_status IN ('active','partially_sold')`;
  const bind: unknown[] = [];

  if (listingType) { sql += ' AND listing_type = ?'; bind.push(listingType); }
  if (technology)  { sql += ' AND technology = ?';   bind.push(technology); }
  if (registryStd) { sql += ' AND registry_standard = ?'; bind.push(registryStd); }
  if (vintageYear) { sql += ' AND vintage_year = ?'; bind.push(parseInt(vintageYear, 10)); }
  if (carbonTaxEl !== undefined) {
    sql += ' AND carbon_tax_eligible = ?';
    bind.push(carbonTaxEl === '1' ? 1 : 0);
  }
  if (maxPriceZar) { sql += ' AND price_zar_per_unit <= ?'; bind.push(parseFloat(maxPriceZar)); }
  if (minQty)      {
    sql += ' AND (quantity_listed - COALESCE(quantity_reserved,0) - COALESCE(quantity_sold,0)) >= ?';
    bind.push(parseFloat(minQty));
  }
  if (framework)   { sql += ' AND sustainability_framework = ?'; bind.push(framework); }

  const orderClause =
    sort === 'price_asc'      ? 'price_zar_per_unit ASC'  :
    sort === 'price_desc'     ? 'price_zar_per_unit DESC' :
    sort === 'quantity_desc'  ? '(quantity_listed - COALESCE(quantity_reserved,0) - COALESCE(quantity_sold,0)) DESC' :
    /* newest */                'created_at DESC';

  sql += ` ORDER BY ${orderClause} LIMIT 500`;

  const rows = await c.env.DB.prepare(sql).bind(...bind).all<Record<string, unknown>>();
  const listings = rows.results ?? [];

  // Market stats for this filtered view
  const statsRow = await c.env.DB
    .prepare(
      `SELECT
         COUNT(*) AS total_active,
         SUM(quantity_listed - COALESCE(quantity_reserved,0) - COALESCE(quantity_sold,0)) AS total_volume_available,
         AVG(price_zar_per_unit) AS avg_price_zar
       FROM oe_sustainability_listings
       WHERE chain_status IN ('active','partially_sold')`,
    )
    .first<{ total_active: number; total_volume_available: number; avg_price_zar: number }>();

  return c.json({
    success: true,
    data: listings,
    total: listings.length,
    market_stats: {
      total_active:           statsRow?.total_active ?? 0,
      total_volume_available: statsRow?.total_volume_available ?? 0,
      avg_price_zar:          statsRow?.avg_price_zar ?? 0,
    },
  });
});

// ─── GET /my-listings ─ auth required ─────────────────────────────────────────
app.get('/my-listings', authMiddleware, async (c) => {
  const user    = getCurrentUser(c);
  const isAdmin = ['admin', 'support'].includes(user.role);

  const statusFilter    = c.req.query('chain_status');
  const participantId   = c.req.query('participant_id');
  const resolved        = isAdmin && participantId ? participantId : user.id;

  let sql = `SELECT * FROM oe_sustainability_listings WHERE participant_id = ?`;
  const bind: unknown[] = [resolved];

  if (statusFilter) { sql += ' AND chain_status = ?'; bind.push(statusFilter); }
  sql += ' ORDER BY created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...bind).all<Record<string, unknown>>();
  const all  = rows.results ?? [];

  const kpis = {
    total:         all.length,
    active:        all.filter(r => r.chain_status === 'active').length,
    partially_sold: all.filter(r => r.chain_status === 'partially_sold').length,
    sold_out:      all.filter(r => r.chain_status === 'sold_out').length,
    cancelled:     all.filter(r => r.chain_status === 'cancelled').length,
    expired:       all.filter(r => r.chain_status === 'expired').length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /listings/:id ─ public ───────────────────────────────────────────────
app.get('/listings/:id', async (c) => {
  const id  = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_listings WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return c.json({ success: false, error: 'Listing not found' }, 404);

  const quantityAvailable =
    (row.quantity_listed as number)
    - ((row.quantity_reserved as number) ?? 0)
    - ((row.quantity_sold    as number) ?? 0);

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'sustainability_listing' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, quantity_available: quantityAvailable },
    timeline: timeline.results ?? [],
  });
});

// ─── POST /listings ─ auth + WRITE_ROLES ──────────────────────────────────────
app.post('/listings', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    listing_type: 'rec' | 'vcm' | 'brokered_coa';
    title: string;
    quantity_listed: number;
    unit: 'mwh' | 'tco2e';
    price_zar_per_unit: number;
    rec_holding_id?: string;
    vcm_holding_id?: string;
    description?: string;
    technology?: string;
    vintage_year?: number;
    registry_standard?: string;
    methodology?: string;
    carbon_tax_eligible?: number;
    sustainability_framework?: string;
    allows_portfolio_hold?: number;
    allows_brokered_retirement?: number;
    min_purchase_qty?: number;
    listing_expiry?: string;
    reason?: string;
    participant_id?: string;
  }>();

  // ── Required field validation ────────────────────────────────────────────────
  if (!body.listing_type || !['rec', 'vcm', 'brokered_coa'].includes(body.listing_type)) {
    return c.json({ success: false, error: 'listing_type must be rec, vcm, or brokered_coa' }, 400);
  }
  if (!body.title?.trim()) {
    return c.json({ success: false, error: 'title is required' }, 400);
  }
  if (!body.unit || !['mwh', 'tco2e'].includes(body.unit)) {
    return c.json({ success: false, error: 'unit must be mwh or tco2e' }, 400);
  }
  const quantityListed    = parseFloat(String(body.quantity_listed ?? 0));
  const priceZarPerUnit   = parseFloat(String(body.price_zar_per_unit ?? 0));
  if (!quantityListed || isNaN(quantityListed) || quantityListed <= 0) {
    return c.json({ success: false, error: 'quantity_listed must be a positive number' }, 400);
  }
  if (!priceZarPerUnit || isNaN(priceZarPerUnit) || priceZarPerUnit <= 0) {
    return c.json({ success: false, error: 'price_zar_per_unit must be a positive number' }, 400);
  }

  const isAdmin     = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;

  // ── Holding verification ─────────────────────────────────────────────────────
  if (body.listing_type === 'rec') {
    if (!body.rec_holding_id) {
      return c.json({ success: false, error: 'rec_holding_id is required for REC listings' }, 422);
    }
    const holding = await c.env.DB
      .prepare(
        `SELECT id FROM oe_rec_holdings
         WHERE id = ? AND participant_id = ? AND status = 'active'`,
      )
      .bind(body.rec_holding_id, participantId)
      .first<{ id: string }>();
    if (!holding) {
      return c.json({ success: false, error: 'REC holding not found or not active' }, 422);
    }
  }

  if (body.listing_type === 'vcm' || body.listing_type === 'brokered_coa') {
    if (!body.vcm_holding_id) {
      return c.json(
        { success: false, error: 'vcm_holding_id is required for VCM and brokered CoA listings' },
        422,
      );
    }
    const holding = await c.env.DB
      .prepare(
        `SELECT id, quantity_tco2e FROM oe_vcm_holdings
         WHERE id = ? AND participant_id = ? AND status = 'active'`,
      )
      .bind(body.vcm_holding_id, participantId)
      .first<{ id: string; quantity_tco2e: number }>();
    if (!holding) {
      return c.json({ success: false, error: 'VCM holding not found or not active' }, 422);
    }
    if (holding.quantity_tco2e < quantityListed) {
      return c.json(
        { success: false, error: 'Holding quantity_tco2e insufficient for the requested listing quantity' },
        422,
      );
    }
  }

  // ── Tier, SLA, defaults ──────────────────────────────────────────────────────
  const totalValueZar  = quantityListed * priceZarPerUnit;
  const tier           = deriveListingTier(totalValueZar);
  const slaDays        = deriveListingSla(tier);
  const now            = new Date().toISOString();
  const slaDeadline    = new Date(Date.now() + slaDays * 86_400_000).toISOString();

  // listing_expiry: caller-supplied or 90 days from now
  const listingExpiry  = body.listing_expiry
    ? body.listing_expiry
    : new Date(Date.now() + 90 * 86_400_000).toISOString();

  const platformFeeZar = computePlatformFee(totalValueZar);
  const carbonTaxEl    = body.carbon_tax_eligible ?? 0;

  // allows_brokered_retirement: default 1 for vcm/brokered_coa, 0 for rec
  const allowsBrokered =
    body.allows_brokered_retirement !== undefined
      ? body.allows_brokered_retirement
      : body.listing_type !== 'rec' ? 1 : 0;

  const allowsPortfolio = body.allows_portfolio_hold ?? 1;
  const minPurchaseQty  = body.min_purchase_qty ?? 1.0;
  const id              = crypto.randomUUID();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_sustainability_listings
         (id, participant_id, listing_type, title, description, quantity_listed,
          quantity_reserved, quantity_sold, unit, price_zar_per_unit, rec_holding_id,
          vcm_holding_id, technology, vintage_year, registry_standard, methodology,
          carbon_tax_eligible, sustainability_framework, allows_portfolio_hold,
          allows_brokered_retirement, min_purchase_qty, listing_tier, total_value_zar,
          platform_fee_zar, sla_deadline, sla_breached, listing_expiry, chain_status,
          regulator_notified, actor_id, reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,'draft',0,?,?,?,?)`,
    )
    .bind(
      id, participantId, body.listing_type, body.title.trim(),
      body.description ?? null,
      quantityListed, body.unit, priceZarPerUnit,
      body.rec_holding_id ?? null, body.vcm_holding_id ?? null,
      body.technology ?? null,
      body.vintage_year ?? null,
      body.registry_standard ?? null,
      body.methodology ?? null,
      carbonTaxEl,
      body.sustainability_framework ?? null,
      allowsPortfolio, allowsBrokered, minPurchaseQty,
      tier, totalValueZar, platformFeeZar,
      slaDeadline, listingExpiry,
      user.id, body.reason ?? null, now, now,
    )
    .run();

  await fireCascade({
    event: 'marketplace_listing_created' as EventType,
    actor_id: user.id,
    entity_type: 'sustainability_listing',
    entity_id: id,
    data: {
      listing_type: body.listing_type,
      listing_tier: tier,
      quantity_listed: quantityListed,
      price_zar_per_unit: priceZarPerUnit,
      total_value_zar: totalValueZar,
    },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_listings WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: row }, 201);
});

// ─── POST /listings/:id/action ─ auth + WRITE_ROLES ───────────────────────────
app.post('/listings/:id/action', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id   = c.req.param('id') as string;
  const body = await c.req.json<{ action: ListingAction; reason?: string }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_listings WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return c.json({ success: false, error: 'Listing not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as ListingStatus;

  if (LISTING_HARD_TERMINALS.has(currentStatus)) {
    return c.json(
      { success: false, error: `Listing is in terminal state '${currentStatus}'` },
      422,
    );
  }

  const allowed = LISTING_VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(action)) {
    return c.json(
      { success: false, error: `Action '${action}' is not valid from state '${currentStatus}'` },
      422,
    );
  }

  const nextStatus = LISTING_STATE_TRANSITIONS[action];
  const now        = new Date().toISOString();

  // Mark SLA breached if overdue
  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB
      .prepare(`UPDATE oe_sustainability_listings SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();
  }

  await c.env.DB
    .prepare(
      `UPDATE oe_sustainability_listings
       SET chain_status = ?, actor_id = ?, reason = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(nextStatus, user.id, reason ?? null, now, id)
    .run();

  // Regulator notification
  if (listingCrossesIntoRegulator(action, row.listing_tier as MarketplaceTier)) {
    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        'sustainability_listing',
        id,
        `listing_${action}`,
        `Sustainability listing ${action.replace(/_/g, ' ')} — ${row.listing_tier} — ${row.listing_type} — ${row.title ?? '?'}`,
        row.participant_id,
        now,
      )
      .run()
      .catch(() => {});

    await c.env.DB
      .prepare(
        `UPDATE oe_sustainability_listings SET regulator_notified = 1, updated_at = ? WHERE id = ?`,
      )
      .bind(now, id)
      .run();
  }

  await fireCascade({
    event: `marketplace_listing_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'sustainability_listing',
    entity_id: id,
    data: {
      action,
      from_status: currentStatus,
      to_status: nextStatus,
      listing_tier: row.listing_tier,
      listing_type: row.listing_type,
    },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_listings WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ─ admin/support only ─────────────────────────────────────
app.post('/sla-sweep', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await listingSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

// ─── GET /portfolio ─ auth required ───────────────────────────────────────────
app.get('/portfolio', authMiddleware, async (c) => {
  const user          = getCurrentUser(c);
  const isAdmin           = ['admin', 'support'].includes(user.role);
  const qParticipantId    = c.req.query('participant_id');
  const participantId     = isAdmin && qParticipantId ? qParticipantId : user.id;

  const [recHoldings, vcmHoldings, recentRetirements, recentTransactions] = await Promise.all([
    c.env.DB
      .prepare(`SELECT * FROM oe_rec_holdings WHERE participant_id = ? AND status = 'active'`)
      .bind(participantId)
      .all<Record<string, unknown>>(),

    c.env.DB
      .prepare(`SELECT * FROM oe_vcm_holdings WHERE participant_id = ? AND status = 'active'`)
      .bind(participantId)
      .all<Record<string, unknown>>(),

    c.env.DB
      .prepare(
        `SELECT * FROM oe_rec_retirements WHERE participant_id = ? ORDER BY created_at DESC LIMIT 10`,
      )
      .bind(participantId)
      .all<Record<string, unknown>>(),

    c.env.DB
      .prepare(
        `SELECT * FROM oe_sustainability_transactions
         WHERE buyer_id = ? AND chain_status = 'settled'
         ORDER BY created_at DESC LIMIT 10`,
      )
      .bind(participantId)
      .all<Record<string, unknown>>(),
  ]);

  const recRows   = recHoldings.results   ?? [];
  const vcmRows   = vcmHoldings.results   ?? [];
  const txRows    = recentTransactions.results ?? [];

  const totalRecMwh   = recRows.reduce((s, r) => s + ((r.quantity_mwh     as number) ?? 0), 0);
  const totalVcmTco2e = vcmRows.reduce((s, r) => s + ((r.quantity_tco2e   as number) ?? 0), 0);
  const totalSpentZar = txRows.reduce((s, r)  => s + ((r.total_zar        as number) ?? 0), 0);

  return c.json({
    success: true,
    data: {
      rec_holdings:          recRows,
      vcm_holdings:          vcmRows,
      recent_retirements:    recentRetirements.results ?? [],
      recent_transactions:   txRows,
      summary: {
        total_rec_mwh:     totalRecMwh,
        total_vcm_tco2e:   totalVcmTco2e,
        total_spent_zar:   totalSpentZar,
      },
    },
  });
});

// ─── GET /market-stats ─ public, no auth ──────────────────────────────────────
app.get('/market-stats', async (c) => {
  const [listingStats, recStats, vcmStats, txStats] = await Promise.all([
    // Total active listings
    c.env.DB
      .prepare(
        `SELECT COUNT(*) AS total_active_listings
         FROM oe_sustainability_listings
         WHERE chain_status IN ('active','partially_sold')`,
      )
      .first<{ total_active_listings: number }>(),

    // REC volume available
    c.env.DB
      .prepare(
        `SELECT
           SUM(quantity_listed - COALESCE(quantity_reserved,0) - COALESCE(quantity_sold,0)) AS total_rec_mwh_available,
           AVG(price_zar_per_unit) AS avg_rec_price_zar
         FROM oe_sustainability_listings
         WHERE chain_status IN ('active','partially_sold') AND listing_type = 'rec'`,
      )
      .first<{ total_rec_mwh_available: number; avg_rec_price_zar: number }>(),

    // VCM volume available (vcm + brokered_coa)
    c.env.DB
      .prepare(
        `SELECT
           SUM(quantity_listed - COALESCE(quantity_reserved,0) - COALESCE(quantity_sold,0)) AS total_vcm_tco2e_available,
           AVG(price_zar_per_unit) AS avg_vcm_price_zar
         FROM oe_sustainability_listings
         WHERE chain_status IN ('active','partially_sold') AND listing_type IN ('vcm','brokered_coa')`,
      )
      .first<{ total_vcm_tco2e_available: number; avg_vcm_price_zar: number }>(),

    // Transaction volume last 7 days
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) AS recent_transactions_count_7d,
           SUM(total_zar) AS recent_volume_zar_7d
         FROM oe_sustainability_transactions
         WHERE chain_status = 'settled'
           AND created_at > datetime('now', '-7 days')`,
      )
      .first<{ recent_transactions_count_7d: number; recent_volume_zar_7d: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      total_active_listings:          listingStats?.total_active_listings          ?? 0,
      total_rec_mwh_available:        recStats?.total_rec_mwh_available            ?? 0,
      total_vcm_tco2e_available:      vcmStats?.total_vcm_tco2e_available          ?? 0,
      avg_rec_price_zar:              recStats?.avg_rec_price_zar                  ?? 0,
      avg_vcm_price_zar:              vcmStats?.avg_vcm_price_zar                  ?? 0,
      recent_transactions_count_7d:   txStats?.recent_transactions_count_7d        ?? 0,
      recent_volume_zar_7d:           txStats?.recent_volume_zar_7d                ?? 0,
    },
  });
});

export default app;
