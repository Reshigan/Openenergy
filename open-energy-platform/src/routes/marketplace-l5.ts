// ════════════════════════════════════════════════════════════════════════
// marketplace-l5 — RFQ workflow, multi-party negotiation, auctions.
//
// Mounted at /api/marketplace-l5.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── RFQs ───────────────────────────────────────────────────────────────
r.get('/rfqs', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const status = c.req.query('status');
  let sql = isOfficer
    ? `SELECT * FROM oe_rfqs`
    : `SELECT * FROM oe_rfqs WHERE buyer_id = ? OR status = 'published' OR invitations_json LIKE ?`;
  const binds: any[] = isOfficer ? [] : [user.id, `%${user.id}%`];
  if (status) { sql += isOfficer ? ` WHERE status = ?` : ` AND status = ?`; binds.push(status); }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/rfqs', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['product_type', 'quote_deadline'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('rfq');
  const num = `RFQ-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await c.env.DB.prepare(`
    INSERT INTO oe_rfqs
      (id, rfq_number, buyer_id, product_type, description, volume_mwh,
       delivery_start, delivery_end, target_price_zar, max_price_zar,
       invitation_mode, invitations_json, quote_deadline, evaluation_deadline,
       award_deadline, scoring_method, scoring_weights_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, num, user.id, b.product_type, b.description || null,
    b.volume_mwh ? Number(b.volume_mwh) : null,
    b.delivery_start || null, b.delivery_end || null,
    b.target_price_zar ? Number(b.target_price_zar) : null,
    b.max_price_zar ? Number(b.max_price_zar) : null,
    b.invitation_mode || 'open',
    b.invitations ? JSON.stringify(b.invitations) : null,
    b.quote_deadline,
    b.evaluation_deadline || null,
    b.award_deadline || null,
    b.scoring_method || 'price_only',
    b.scoring_weights ? JSON.stringify(b.scoring_weights) : null,
  ).run();
  return c.json({ success: true, data: { id, rfq_number: num } }, 201);
});

r.post('/rfqs/:id/publish', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT buyer_id, status FROM oe_rfqs WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.buyer_id !== user.id && !['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  if (row.status !== 'draft') return c.json({ success: false, error: 'must be draft' }, 409);
  await c.env.DB.prepare(`UPDATE oe_rfqs SET status = 'published', updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

r.get('/rfqs/:id', async (c) => {
  const id = c.req.param('id');
  const rfq = await c.env.DB.prepare(`SELECT * FROM oe_rfqs WHERE id = ?`).bind(id).first<any>();
  if (!rfq) return c.json({ success: false, error: 'not found' }, 404);
  const quotes = await c.env.DB.prepare(`SELECT * FROM oe_rfq_quotes WHERE rfq_id = ? ORDER BY price_zar ASC`).bind(id).all();
  const rounds = await c.env.DB.prepare(`SELECT * FROM oe_negotiation_rounds WHERE rfq_id = ? ORDER BY round_number ASC, created_at ASC`).bind(id).all();
  return c.json({ success: true, data: { rfq, quotes: quotes.results || [], negotiation: rounds.results || [] } });
});

r.post('/rfqs/:id/quotes', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const rfq = await c.env.DB.prepare(`SELECT * FROM oe_rfqs WHERE id = ?`).bind(id).first<any>();
  if (!rfq) return c.json({ success: false, error: 'not found' }, 404);
  if (rfq.status !== 'published') return c.json({ success: false, error: 'RFQ not open for quotes' }, 409);
  if (new Date(rfq.quote_deadline).getTime() < Date.now()) return c.json({ success: false, error: 'quote_deadline_passed' }, 410);
  if (rfq.invitation_mode === 'closed' && !(rfq.invitations_json || '').includes(user.id)) {
    return c.json({ success: false, error: 'not invited to this RFQ' }, 403);
  }
  const b = await c.req.json().catch(() => ({} as any));
  if (b.price_zar == null) return c.json({ success: false, error: 'price_zar required' }, 400);
  const quoteId = genId('q');
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_rfq_quotes
      (id, rfq_id, seller_id, price_zar, volume_offered_mwh, delivery_start, delivery_end,
       bbbee_level, carbon_intensity_g_co2_kwh, terms_text, attachments_r2_prefix, expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    quoteId, id, user.id, Number(b.price_zar),
    b.volume_offered_mwh ? Number(b.volume_offered_mwh) : null,
    b.delivery_start || null, b.delivery_end || null,
    b.bbbee_level || null, b.carbon_intensity_g_co2_kwh || null,
    b.terms_text || null, b.attachments_r2_prefix || null,
    b.expires_at || null,
  ).run();
  return c.json({ success: true, data: { id: quoteId } }, 201);
});

r.post('/rfqs/:id/close-quotes', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT buyer_id, scoring_method, scoring_weights_json FROM oe_rfqs WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.buyer_id !== user.id && !['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  // Score quotes
  const quotes = await c.env.DB.prepare(`SELECT * FROM oe_rfq_quotes WHERE rfq_id = ? AND status = 'submitted'`).bind(id).all<any>();
  const weights = row.scoring_weights_json ? JSON.parse(row.scoring_weights_json) : { price: 1.0 };
  for (const q of (quotes.results || []) as any[]) {
    let score = 0;
    if (row.scoring_method === 'price_only') {
      score = 1 / Number(q.price_zar);  // lower price = higher score
    } else {
      score = (weights.price || 0.6) * (1 / Math.max(1, Number(q.price_zar)))
            + (weights.bbbee || 0.2) * (Number(q.bbbee_level || 8) <= 4 ? 1 : 0.5)
            + (weights.carbon || 0.2) * (Number(q.carbon_intensity_g_co2_kwh || 1000) < 200 ? 1 : 0.5);
    }
    await c.env.DB.prepare(`UPDATE oe_rfq_quotes SET score = ?, status = 'shortlisted' WHERE id = ?`).bind(score, q.id).run();
  }
  await c.env.DB.prepare(`UPDATE oe_rfqs SET status = 'evaluation' WHERE id = ?`).bind(id).run();
  return c.json({ success: true, data: { scored_count: (quotes.results || []).length } });
});

r.post('/rfqs/:id/award', requireStepUp('marketplace.rfq_award.high'), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.quote_id) return c.json({ success: false, error: 'quote_id required' }, 400);
  const row = await c.env.DB.prepare(`SELECT buyer_id FROM oe_rfqs WHERE id = ?`).bind(id).first<any>();
  if (!row || (row.buyer_id !== user.id && !['admin', 'support'].includes(user.role))) return c.json({ success: false, error: 'forbidden' }, 403);
  await c.env.DB.prepare(`UPDATE oe_rfq_quotes SET status = 'awarded' WHERE id = ?`).bind(b.quote_id).run();
  await c.env.DB.prepare(`UPDATE oe_rfq_quotes SET status = 'declined' WHERE rfq_id = ? AND id != ? AND status NOT IN ('awarded','withdrawn')`).bind(id, b.quote_id).run();
  await c.env.DB.prepare(`UPDATE oe_rfqs SET status = 'awarded', awarded_quote_id = ?, awarded_at = datetime('now') WHERE id = ?`).bind(b.quote_id, id).run();
  return c.json({ success: true });
});

// Negotiation rounds
r.post('/rfqs/:id/quotes/:quote_id/counter', async (c) => {
  const user = getCurrentUser(c);
  const rfqId = c.req.param('id');
  const quoteId = c.req.param('quote_id');
  const b = await c.req.json().catch(() => ({} as any));
  const rfq = await c.env.DB.prepare(`SELECT buyer_id FROM oe_rfqs WHERE id = ?`).bind(rfqId).first<any>();
  const q = await c.env.DB.prepare(`SELECT seller_id FROM oe_rfq_quotes WHERE id = ?`).bind(quoteId).first<any>();
  if (!rfq || !q) return c.json({ success: false, error: 'not found' }, 404);
  const isBuyer = user.id === rfq.buyer_id;
  const isSeller = user.id === q.seller_id;
  if (!isBuyer && !isSeller) return c.json({ success: false, error: 'forbidden' }, 403);
  const lastRound = await c.env.DB.prepare(`SELECT MAX(round_number) AS m FROM oe_negotiation_rounds WHERE quote_id = ?`).bind(quoteId).first<any>();
  const roundNum = Number(lastRound?.m || 0) + 1;
  const id = genId('nr');
  await c.env.DB.prepare(`
    INSERT INTO oe_negotiation_rounds
      (id, rfq_id, quote_id, round_number, initiated_by, proposer_id,
       proposed_price_zar, proposed_volume_mwh, proposed_terms, message)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, rfqId, quoteId, roundNum,
    isBuyer ? 'buyer' : 'seller', user.id,
    b.proposed_price_zar ? Number(b.proposed_price_zar) : null,
    b.proposed_volume_mwh ? Number(b.proposed_volume_mwh) : null,
    b.proposed_terms || null, b.message || null,
  ).run();
  await c.env.DB.prepare(`UPDATE oe_rfq_quotes SET status = 'counter_offered' WHERE id = ?`).bind(quoteId).run();
  return c.json({ success: true, data: { id, round_number: roundNum } }, 201);
});

r.post('/negotiation/:id/decide', async (c) => {
  void getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!['accepted', 'counter', 'rejected'].includes(b.decision)) return c.json({ success: false, error: 'invalid decision' }, 400);
  await c.env.DB.prepare(`UPDATE oe_negotiation_rounds SET decision = ?, decided_at = datetime('now') WHERE id = ?`).bind(b.decision, id).run();
  return c.json({ success: true });
});

// ─── Auctions ───────────────────────────────────────────────────────────
r.get('/auctions', async (c) => {
  const status = c.req.query('status');
  const sql = status
    ? `SELECT * FROM oe_auctions WHERE status = ? ORDER BY starts_at DESC LIMIT 200`
    : `SELECT * FROM oe_auctions ORDER BY starts_at DESC LIMIT 200`;
  const rows = status
    ? await c.env.DB.prepare(sql).bind(status).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/auctions', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['auction_type', 'product_type', 'volume_mwh', 'starts_at', 'ends_at'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  if (!['sealed_bid', 'open_ascending', 'open_descending', 'reverse_sealed', 'reverse_open'].includes(b.auction_type)) {
    return c.json({ success: false, error: 'invalid auction_type' }, 400);
  }
  const id = genId('auct');
  const num = `AUC-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await c.env.DB.prepare(`
    INSERT INTO oe_auctions
      (id, auction_number, initiator_id, auction_type, product_type, description,
       reserve_price_zar, bid_increment_zar, volume_mwh, starts_at, ends_at,
       extends_on_late_bid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, num, user.id, b.auction_type, b.product_type, b.description || null,
    b.reserve_price_zar ? Number(b.reserve_price_zar) : null,
    b.bid_increment_zar ? Number(b.bid_increment_zar) : null,
    Number(b.volume_mwh), b.starts_at, b.ends_at,
    b.extends_on_late_bid ? 1 : 0,
  ).run();
  return c.json({ success: true, data: { id, auction_number: num } }, 201);
});

r.post('/auctions/:id/bids', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (b.bid_amount_zar == null) return c.json({ success: false, error: 'bid_amount_zar required' }, 400);
  const auc = await c.env.DB.prepare(`SELECT * FROM oe_auctions WHERE id = ?`).bind(id).first<any>();
  if (!auc) return c.json({ success: false, error: 'not found' }, 404);
  const now = Date.now();
  if (now < new Date(auc.starts_at).getTime()) return c.json({ success: false, error: 'not started' }, 425);
  if (now > new Date(auc.ends_at).getTime())   return c.json({ success: false, error: 'closed' }, 410);
  if (auc.status !== 'live' && auc.status !== 'scheduled') return c.json({ success: false, error: 'not accepting bids' }, 409);
  // Reverse auctions = lowest wins; forward = highest wins. Validate
  // increment + reserve.
  const isReverse = auc.auction_type.startsWith('reverse_');
  const isSealed = auc.auction_type.includes('sealed');
  const bidId = genId('bid');
  const currentBest = isReverse
    ? await c.env.DB.prepare(`SELECT MIN(bid_amount_zar) AS p FROM oe_auction_bids WHERE auction_id = ? AND withdrawn_at IS NULL`).bind(id).first<any>()
    : await c.env.DB.prepare(`SELECT MAX(bid_amount_zar) AS p FROM oe_auction_bids WHERE auction_id = ? AND withdrawn_at IS NULL`).bind(id).first<any>();
  if (!isSealed && currentBest?.p != null) {
    const cur = Number(currentBest.p);
    const incr = Number(auc.bid_increment_zar || 1);
    if (isReverse && Number(b.bid_amount_zar) > cur - incr) return c.json({ success: false, error: 'bid_not_lower_by_increment', data: { current_best: cur, increment: incr } }, 400);
    if (!isReverse && Number(b.bid_amount_zar) < cur + incr) return c.json({ success: false, error: 'bid_not_higher_by_increment', data: { current_best: cur, increment: incr } }, 400);
  }
  if (auc.reserve_price_zar != null) {
    const r = Number(auc.reserve_price_zar);
    if (isReverse && Number(b.bid_amount_zar) > r) return c.json({ success: false, error: 'above_reserve' }, 400);
    if (!isReverse && Number(b.bid_amount_zar) < r) return c.json({ success: false, error: 'below_reserve' }, 400);
  }
  await c.env.DB.prepare(`
    INSERT INTO oe_auction_bids (id, auction_id, bidder_id, bid_amount_zar, volume_mwh, visible)
    VALUES (?,?,?,?,?,?)
  `).bind(bidId, id, user.id, Number(b.bid_amount_zar), b.volume_mwh ? Number(b.volume_mwh) : null, isSealed ? 0 : 1).run();
  await c.env.DB.prepare(`UPDATE oe_auctions SET status = 'live', total_bids = total_bids + 1 WHERE id = ?`).bind(id).run();
  // Anti-sniping: extend by 2 min if bid is in last 2 min
  if (auc.extends_on_late_bid === 1) {
    const remaining = new Date(auc.ends_at).getTime() - now;
    if (remaining < 2 * 60_000) {
      await c.env.DB.prepare(`UPDATE oe_auctions SET ends_at = datetime(ends_at, '+2 minutes') WHERE id = ?`).bind(id).run();
    }
  }
  return c.json({ success: true, data: { id: bidId } }, 201);
});

r.post('/auctions/:id/close', requireStepUp('marketplace.auction_close.high'), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const auc = await c.env.DB.prepare(`SELECT * FROM oe_auctions WHERE id = ?`).bind(id).first<any>();
  if (!auc) return c.json({ success: false, error: 'not found' }, 404);
  if (auc.initiator_id !== user.id && !['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const isReverse = auc.auction_type.startsWith('reverse_');
  const winningSql = isReverse
    ? `SELECT id FROM oe_auction_bids WHERE auction_id = ? AND withdrawn_at IS NULL ORDER BY bid_amount_zar ASC, submitted_at ASC LIMIT 1`
    : `SELECT id FROM oe_auction_bids WHERE auction_id = ? AND withdrawn_at IS NULL ORDER BY bid_amount_zar DESC, submitted_at ASC LIMIT 1`;
  const winning = await c.env.DB.prepare(winningSql).bind(id).first<any>();
  if (!winning) {
    await c.env.DB.prepare(`UPDATE oe_auctions SET status = 'failed' WHERE id = ?`).bind(id).run();
    return c.json({ success: false, error: 'no_bids' }, 410);
  }
  await c.env.DB.prepare(`UPDATE oe_auction_bids SET visible = 1 WHERE auction_id = ?`).bind(id).run();
  await c.env.DB.prepare(`UPDATE oe_auction_bids SET is_winning = 1 WHERE id = ?`).bind(winning.id).run();
  await c.env.DB.prepare(`UPDATE oe_auctions SET status = 'awarded', awarded_bid_id = ?, awarded_at = datetime('now') WHERE id = ?`).bind(winning.id, id).run();
  return c.json({ success: true, data: { winning_bid_id: winning.id } });
});

r.get('/auctions/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const auc = await c.env.DB.prepare(`SELECT * FROM oe_auctions WHERE id = ?`).bind(id).first<any>();
  if (!auc) return c.json({ success: false, error: 'not found' }, 404);
  // Only show bids the caller is allowed to see (sealed auctions hide
  // others' bids until close)
  const own = await c.env.DB.prepare(`SELECT * FROM oe_auction_bids WHERE auction_id = ? AND bidder_id = ? ORDER BY submitted_at DESC`).bind(id, user.id).all();
  const visible = await c.env.DB.prepare(`SELECT * FROM oe_auction_bids WHERE auction_id = ? AND (visible = 1 OR bidder_id = ?) ORDER BY submitted_at DESC LIMIT 100`).bind(id, user.id).all();
  return c.json({ success: true, data: { auction: auc, my_bids: own.results || [], visible_bids: visible.results || [] } });
});

export default r;
