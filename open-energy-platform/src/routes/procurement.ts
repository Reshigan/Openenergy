// ═══════════════════════════════════════════════════════════════════════════
// Procurement — RFP Creation, Bidding, Award, and LOI Auto-creation
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const procurement = new Hono<HonoEnv>();

// All procurement endpoints require auth. authMiddleware is a middleware
// function (not a factory) — applying it once at the sub-app level avoids
// the per-route `authMiddleware()` invocation pattern that previously
// produced "handler is not a function" 500s on every endpoint here.
procurement.use('*', authMiddleware);

// GET /procurement/rfps — List all RFPs
procurement.get('/rfps', async (c) => {
  const participant = c.get('participant');
  const { status, search } = c.req.query();
  
  let query = `
    SELECT r.*, p.name as creator_name, p.company_name as creator_company,
           (SELECT COUNT(*) FROM rfp_bids WHERE rfp_id = r.id) as bid_count
    FROM rfp_requests r
    JOIN participants p ON r.creator_id = p.id
    WHERE 1=1
  `;
  const bindings: any[] = [];
  
  if (participant.role !== 'admin' && participant.role !== 'grid_operator' && participant.role !== 'regulator') {
    query += ` AND (r.visibility = 'public' OR r.creator_id = ?)`;
    bindings.push(participant.id);
  }
  
  if (status) {
    query += ` AND r.status = ?`;
    bindings.push(status);
  }
  
  if (search) {
    query += ` AND (r.title LIKE ? OR r.description LIKE ?)`;
    bindings.push(`%${search}%`, `%${search}%`);
  }
  
  query += ` ORDER BY r.created_at DESC`;
  
  const rfps = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: rfps.results || [] });
});

// POST /procurement/rfps — Create new RFP
procurement.post('/rfps', async (c) => {
  const participant = c.get('participant');
  const body = await c.req.json();
  const { title, description, requirements, budget_min, budget_max, deadline, project_type, visibility } = body;
  
  if (!title || !description || !deadline) {
    return c.json({ success: false, error: 'Title, description, and deadline required' }, 400);
  }
  
  const rfpId = 'rfp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO rfp_requests (id, title, description, requirements, budget_min, budget_max, deadline, project_type, visibility, status, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).bind(rfpId, title, description, requirements || '', budget_min || null, budget_max || null, deadline, project_type || 'ppa', visibility || 'public', participant.id).run();
  
  await fireCascade({
    event: 'marketplace.bid',
    actor_id: participant.id,
    entity_type: 'rfp_requests',
    entity_id: rfpId,
    data: { title, deadline },
    env: c.env,
  });
  
  return c.json({ success: true, data: { rfp_id: rfpId } });
});

// GET /procurement/rfps/:id — Get RFP details
procurement.get('/rfps/:id', async (c) => {
  const { id } = c.req.param();
  
  const rfp = await c.env.DB.prepare(`
    SELECT r.*, p.name as creator_name, p.company_name as creator_company
    FROM rfp_requests r
    JOIN participants p ON r.creator_id = p.id
    WHERE r.id = ?
  `).bind(id).first();
  
  if (!rfp) {
    return c.json({ success: false, error: 'RFP not found' }, 404);
  }
  
  const bids = await c.env.DB.prepare(`
    SELECT b.*, p.name as bidder_name, p.company_name as bidder_company, p.bbbee_level
    FROM rfp_bids b
    JOIN participants p ON b.bidder_id = p.id
    WHERE b.rfp_id = ?
    ORDER BY b.created_at DESC
  `).bind(id).all();
  
  return c.json({ success: true, data: { ...rfp, bids: bids.results || [] } });
});

// POST /procurement/rfps/:id/bid — Submit bid
procurement.post('/rfps/:id/bid', async (c) => {
  const participant = c.get('participant');
  const { id } = c.req.param();
  const body = await c.req.json();
  const { proposed_price, proposed_terms, timeline, experience } = body;
  
  if (!proposed_price) {
    return c.json({ success: false, error: 'Proposed price required' }, 400);
  }
  
  const rfp = await c.env.DB.prepare('SELECT * FROM rfp_requests WHERE id = ?').bind(id).first();
  if (!rfp) {
    return c.json({ success: false, error: 'RFP not found' }, 404);
  }
  
  if (rfp.status !== 'open') {
    return c.json({ success: false, error: 'RFP is not accepting bids' }, 400);
  }
  
  const bidId = 'bid_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO rfp_bids (id, rfp_id, bidder_id, proposed_price, proposed_terms, timeline, experience)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(bidId, id, participant.id, proposed_price, proposed_terms || '', timeline || '', experience || '').run();
  
  await fireCascade({
    event: 'marketplace.bid',
    actor_id: participant.id,
    entity_type: 'rfp_bids',
    entity_id: bidId,
    data: { rfp_id: id, proposed_price },
    env: c.env,
  });
  
  return c.json({ success: true, data: { bid_id: bidId } });
});

// POST /procurement/rfps/:id/award — Award RFP to bidder (creates LOI)
procurement.post('/rfps/:id/award', async (c) => {
  const participant = c.get('participant');
  const { id } = c.req.param();
  const body = await c.req.json();
  const { bid_id } = body;
  
  if (!bid_id) {
    return c.json({ success: false, error: 'Bid ID required' }, 400);
  }
  
  const rfp = await c.env.DB.prepare('SELECT * FROM rfp_requests WHERE id = ?').bind(id).first();
  if (!rfp) {
    return c.json({ success: false, error: 'RFP not found' }, 404);
  }
  
  if (participant.role !== 'admin' && rfp.creator_id !== participant.id) {
    return c.json({ success: false, error: 'Not authorized to award this RFP' }, 403);
  }
  
  const bid = await c.env.DB.prepare('SELECT * FROM rfp_bids WHERE id = ? AND rfp_id = ?').bind(bid_id, id).first();
  if (!bid) {
    return c.json({ success: false, error: 'Bid not found' }, 404);
  }
  
  // Update RFP status
  await c.env.DB.prepare('UPDATE rfp_requests SET status = ?, awarded_to = ?, awarded_at = ? WHERE id = ?')
    .bind('awarded', bid_id, new Date().toISOString(), id).run();
  
  // Create LOI automatically
  const loiId = 'loi_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO contract_documents (id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms)
    VALUES (?, ?, 'loi', 'loi', ?, ?, ?, ?)
  `).bind(
    loiId, 
    `LOI: ${rfp.title}`,
    rfp.creator_id,
    bid.bidder_id,
    rfp.project_id || null,
    JSON.stringify({ rfp_id: id, bid_id: bid_id, awarded_price: bid.proposed_price, terms: bid.proposed_terms })
  ).run();
  
  await fireCascade({
    event: 'contract.created',
    actor_id: participant.id,
    entity_type: 'contract_documents',
    entity_id: loiId,
    data: { type: 'loi', rfp_id: id, bid_id: bid_id },
    env: c.env,
  });
  
  return c.json({ success: true, data: { loi_id: loiId, message: 'RFP awarded and LOI created' } });
});

// GET /procurement/bids — List my bids
procurement.get('/bids', async (c) => {
  const participant = c.get('participant');
  
  const bids = await c.env.DB.prepare(`
    SELECT b.*, r.title as rfp_title, r.status as rfp_status
    FROM rfp_bids b
    JOIN rfp_requests r ON b.rfp_id = r.id
    WHERE b.bidder_id = ?
    ORDER BY b.created_at DESC
  `).bind(participant.id).all();
  
  return c.json({ success: true, data: bids.results || [] });
});

// POST /procurement/rfps/:id/evaluate — persist multi-criteria scores against
// each bid. Accepts { scoring: { [bid_id]: { technical, sustainability, delivery } } }.
// Stores the scores back on rfp_bids; the platform combines them with a 40%
// price-weighted overall score on the UI.
//
// Idempotent — re-posting overwrites prior scores. Only the issuing offtaker
// (or admin) can evaluate.
procurement.post('/rfps/:id/evaluate', async (c) => {
  const id = c.req.param('id');
  const participant = c.get('participant') as { id?: string; role?: string } | undefined;
  if (!participant?.id) return c.json({ success: false, error: 'unauthorized' }, 401);

  // The schema uses `creator_id` for the RFP issuer.
  const rfp = await c.env.DB.prepare(
    `SELECT id, creator_id, status FROM rfp_requests WHERE id = ?`,
  ).bind(id).first();
  if (!rfp) return c.json({ success: false, error: 'rfp_not_found' }, 404);
  if ((rfp as { creator_id?: string }).creator_id !== participant.id && participant.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    scoring?: Record<string, { technical?: number; sustainability?: number; delivery?: number }>;
  };
  if (!body.scoring) return c.json({ success: false, error: 'scoring_required' }, 400);

  // Ensure score columns exist (some seeds predate them).
  for (const col of ['technical_score', 'sustainability_score', 'delivery_score', 'overall_score']) {
    await c.env.DB.prepare(`ALTER TABLE rfp_bids ADD COLUMN ${col} REAL`).run().catch(() => undefined);
  }

  // Compute overall using the same weights as the UI for consistency
  // (40% price, 25% technical, 20% sustainability, 15% delivery).
  const allBids = await c.env.DB.prepare(
    `SELECT id, proposed_price FROM rfp_bids WHERE rfp_id = ?`,
  ).bind(id).all();
  const list = (allBids.results || []) as Array<{ id: string; proposed_price: number }>;
  const minPrice = list.reduce((m, b) => Math.min(m, b.proposed_price || Infinity), Infinity);

  let updated = 0;
  for (const [bidId, s] of Object.entries(body.scoring)) {
    const bid = list.find((b) => b.id === bidId);
    if (!bid) continue;
    const tech = Number(s?.technical ?? 70);
    const sus  = Number(s?.sustainability ?? 70);
    const del  = Number(s?.delivery ?? 70);
    const priceScore = bid.proposed_price ? (minPrice / bid.proposed_price) * 100 : 0;
    const overall = (priceScore * 0.40) + (tech * 0.25) + (sus * 0.20) + (del * 0.15);
    await c.env.DB.prepare(
      `UPDATE rfp_bids SET technical_score = ?, sustainability_score = ?, delivery_score = ?, overall_score = ? WHERE id = ?`,
    ).bind(tech, sus, del, overall, bidId).run();
    updated++;
  }

  // Move the RFP into 'evaluation' state so the issuer's dashboard reflects
  // the new phase (closed-but-being-scored, distinct from 'open').
  if ((rfp as { status?: string }).status === 'open') {
    await c.env.DB.prepare(`UPDATE rfp_requests SET status = 'evaluation' WHERE id = ?`).bind(id).run();
  }

  return c.json({ success: true, data: { updated } });
});

export default procurement;
