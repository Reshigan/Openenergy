// ═══════════════════════════════════════════════════════════════════════════
// Procurement — RFP creation, bidding, multi-criteria evaluation, award.
//
// Backed by `procurement_rfps` + `procurement_bids` (the names the schema
// settled on after the v2 refactor; older code referred to `rfp_requests` /
// `rfp_bids` which no longer exist).
//
// All endpoints use the platform's standard auth context: `c.get('auth').user`
// (NOT `c.get('participant')` — that key was never set by authMiddleware).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const procurement = new Hono<HonoEnv>();

procurement.use('*', authMiddleware);

function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// Ensure evaluation columns exist; safe to run on every cold start.
async function ensureEvaluationColumns(env: HonoEnv['Bindings']) {
  for (const col of ['technical_score', 'sustainability_score', 'delivery_score', 'overall_score']) {
    await env.DB.prepare(`ALTER TABLE procurement_bids ADD COLUMN ${col} REAL`).run().catch(() => undefined);
  }
}

// ─── List RFPs ─────────────────────────────────────────────────────────────
//
// GET /procurement/rfps?status=&search=
//
// Returns RFPs the caller can see — admins/regulators/grid_operators see all,
// everyone else sees published RFPs + their own drafts.
procurement.get('/rfps', async (c) => {
  const user = getCurrentUser(c);
  const { status, search } = c.req.query();

  let query = `
    SELECT r.*, p.name AS creator_name, p.company_name AS creator_company,
           (SELECT COUNT(*) FROM procurement_bids WHERE rfp_id = r.id) AS bid_count
      FROM procurement_rfps r
      JOIN participants p ON p.id = r.created_by
     WHERE 1=1
  `;
  const bind: unknown[] = [];

  if (user.role !== 'admin' && user.role !== 'grid_operator' && user.role !== 'regulator') {
    query += ` AND (r.status != 'draft' OR r.created_by = ?)`;
    bind.push(user.id);
  }
  if (status)  { query += ` AND r.status = ?`; bind.push(status); }
  if (search)  { query += ` AND (r.title LIKE ? OR r.description LIKE ?)`; bind.push(`%${search}%`, `%${search}%`); }
  query += ` ORDER BY r.created_at DESC`;

  const rfps = await c.env.DB.prepare(query).bind(...bind).all();
  return c.json({ success: true, data: rfps.results || [] });
});

// ─── Create RFP ────────────────────────────────────────────────────────────
//
// POST /procurement/rfps
// body: { title, description, deadline, budget_min, budget_max, project_type, requirements }
//
// `deadline` maps onto `procurement_rfps.closing_date` and `budget_max` onto
// `procurement_rfps.budget` so the existing UI doesn't need to know the
// schema renames.
procurement.post('/rfps', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string; description?: string; deadline?: string;
    budget_min?: number; budget_max?: number;
    project_type?: string; requirements?: string;
  };
  if (!body.title || !body.description || !body.deadline) {
    return c.json({ success: false, error: 'title, description and deadline required' }, 400);
  }
  const id = genId('rfp');
  await c.env.DB.prepare(`
    INSERT INTO procurement_rfps (id, title, description, rfp_reference, created_by, closing_date, budget, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
  `).bind(
    id, body.title, body.description,
    `RFP-${id.slice(-8).toUpperCase()}`,
    user.id, body.deadline,
    body.budget_max ?? body.budget_min ?? null,
  ).run();

  await fireCascade({
    event: 'marketplace.bid', actor_id: user.id,
    entity_type: 'procurement_rfps', entity_id: id,
    data: { title: body.title, deadline: body.deadline },
    env: c.env,
  });
  return c.json({ success: true, data: { rfp_id: id } });
});

// ─── RFP detail (with bids) ────────────────────────────────────────────────
procurement.get('/rfps/:id', async (c) => {
  await ensureEvaluationColumns(c.env);
  const id = c.req.param('id');
  const rfp = await c.env.DB.prepare(`
    SELECT r.*, p.name AS creator_name, p.company_name AS creator_company
      FROM procurement_rfps r
      JOIN participants p ON p.id = r.created_by
     WHERE r.id = ?
  `).bind(id).first();
  if (!rfp) return c.json({ success: false, error: 'rfp_not_found' }, 404);

  const bids = await c.env.DB.prepare(`
    SELECT b.*, p.name AS bidder_name, p.company_name AS bidder_company, p.bbbee_level
      FROM procurement_bids b
      JOIN participants p ON p.id = b.participant_id
     WHERE b.rfp_id = ?
     ORDER BY b.created_at DESC
  `).bind(id).all();
  return c.json({ success: true, data: { ...rfp, bids: bids.results || [] } });
});

// ─── Submit a bid ──────────────────────────────────────────────────────────
//
// POST /procurement/rfps/:id/bid
// body: { proposed_price, proposed_terms, technical_proposal_key }
procurement.post('/rfps/:id/bid', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    proposed_price?: number; bid_amount?: number;
    proposed_terms?: string; technical_proposal_key?: string;
    commercial_proposal_key?: string;
  };
  const amount = body.proposed_price ?? body.bid_amount;
  if (!amount) return c.json({ success: false, error: 'proposed_price required' }, 400);

  const rfp = await c.env.DB.prepare(`SELECT id, status FROM procurement_rfps WHERE id = ?`).bind(id).first();
  if (!rfp) return c.json({ success: false, error: 'rfp_not_found' }, 404);
  if ((rfp as { status?: string }).status !== 'published' && (rfp as { status?: string }).status !== 'evaluation') {
    return c.json({ success: false, error: 'rfp_closed_to_bids' }, 400);
  }

  const bidId = genId('bid');
  await c.env.DB.prepare(`
    INSERT INTO procurement_bids (id, rfp_id, participant_id, technical_proposal_key, commercial_proposal_key, bid_amount, status, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))
  `).bind(
    bidId, id, user.id,
    body.technical_proposal_key || body.proposed_terms || null,
    body.commercial_proposal_key || null,
    amount,
  ).run();

  await fireCascade({
    event: 'marketplace.bid', actor_id: user.id,
    entity_type: 'procurement_bids', entity_id: bidId,
    data: { rfp_id: id, bid_amount: amount },
    env: c.env,
  });
  return c.json({ success: true, data: { bid_id: bidId } });
});

// ─── Award ─────────────────────────────────────────────────────────────────
procurement.post('/rfps/:id/award', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { bid_id?: string };
  if (!body.bid_id) return c.json({ success: false, error: 'bid_id required' }, 400);

  const rfp = await c.env.DB.prepare(`SELECT id, created_by, title FROM procurement_rfps WHERE id = ?`).bind(id).first();
  if (!rfp) return c.json({ success: false, error: 'rfp_not_found' }, 404);
  if ((rfp as { created_by?: string }).created_by !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const bid = await c.env.DB.prepare(
    `SELECT id, participant_id, bid_amount, technical_proposal_key FROM procurement_bids WHERE id = ? AND rfp_id = ?`,
  ).bind(body.bid_id, id).first();
  if (!bid) return c.json({ success: false, error: 'bid_not_found' }, 404);

  await c.env.DB.prepare(`UPDATE procurement_rfps SET status = 'awarded', updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`UPDATE procurement_bids SET status = 'awarded' WHERE id = ?`).bind(body.bid_id).run();
  await c.env.DB.prepare(`UPDATE procurement_bids SET status = 'rejected' WHERE rfp_id = ? AND id != ? AND status NOT IN ('rejected')`).bind(id, body.bid_id).run();

  // Auto-create LOI document
  const loiId = genId('loi');
  await c.env.DB.prepare(`
    INSERT INTO contract_documents (id, title, document_type, phase, creator_id, counterparty_id, commercial_terms)
    VALUES (?, ?, 'loi', 'loi', ?, ?, ?)
  `).bind(
    loiId,
    `LOI: ${(rfp as { title?: string }).title || id}`,
    user.id,
    (bid as { participant_id?: string }).participant_id || null,
    JSON.stringify({
      rfp_id: id, bid_id: body.bid_id,
      awarded_amount: (bid as { bid_amount?: number }).bid_amount,
      terms: (bid as { technical_proposal_key?: string }).technical_proposal_key,
    }),
  ).run().catch(() => undefined); // contract_documents schema variant — degrade gracefully.

  await fireCascade({
    event: 'contract.created', actor_id: user.id,
    entity_type: 'contract_documents', entity_id: loiId,
    data: { type: 'loi', rfp_id: id, bid_id: body.bid_id },
    env: c.env,
  });
  return c.json({ success: true, data: { loi_id: loiId, message: 'Awarded and LOI drafted' } });
});

// ─── My bids ───────────────────────────────────────────────────────────────
procurement.get('/bids', async (c) => {
  await ensureEvaluationColumns(c.env);
  const user = getCurrentUser(c);
  const bids = await c.env.DB.prepare(`
    SELECT b.*, r.title AS rfp_title, r.status AS rfp_status, r.closing_date AS rfp_deadline
      FROM procurement_bids b
      JOIN procurement_rfps r ON r.id = b.rfp_id
     WHERE b.participant_id = ?
     ORDER BY b.created_at DESC LIMIT 200
  `).bind(user.id).all();
  return c.json({ success: true, data: bids.results || [] });
});

// ─── Multi-criteria evaluation ─────────────────────────────────────────────
//
// POST /procurement/rfps/:id/evaluate
// body: { scoring: { [bid_id]: { technical, sustainability, delivery } } }
//
// Persists per-criterion scores plus a 40% price-weighted overall score
// (matches the UI's live ranker so the persisted result stays consistent).
procurement.post('/rfps/:id/evaluate', async (c) => {
  await ensureEvaluationColumns(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const rfp = await c.env.DB.prepare(
    `SELECT id, created_by, status FROM procurement_rfps WHERE id = ?`,
  ).bind(id).first();
  if (!rfp) return c.json({ success: false, error: 'rfp_not_found' }, 404);
  if ((rfp as { created_by?: string }).created_by !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    scoring?: Record<string, { technical?: number; sustainability?: number; delivery?: number }>;
  };
  if (!body.scoring) return c.json({ success: false, error: 'scoring_required' }, 400);

  const allBids = await c.env.DB.prepare(
    `SELECT id, bid_amount FROM procurement_bids WHERE rfp_id = ?`,
  ).bind(id).all();
  const list = (allBids.results || []) as Array<{ id: string; bid_amount: number }>;
  const minPrice = list.reduce((m, b) => Math.min(m, b.bid_amount || Infinity), Infinity);

  let updated = 0;
  for (const [bidId, s] of Object.entries(body.scoring)) {
    const bid = list.find((b) => b.id === bidId);
    if (!bid) continue;
    const tech = Number(s?.technical ?? 70);
    const sus  = Number(s?.sustainability ?? 70);
    const del  = Number(s?.delivery ?? 70);
    const priceScore = bid.bid_amount ? (minPrice / bid.bid_amount) * 100 : 0;
    const overall = (priceScore * 0.40) + (tech * 0.25) + (sus * 0.20) + (del * 0.15);
    await c.env.DB.prepare(
      `UPDATE procurement_bids SET technical_score = ?, sustainability_score = ?, delivery_score = ?, overall_score = ?, score = ? WHERE id = ?`,
    ).bind(tech, sus, del, overall, overall, bidId).run();
    updated++;
  }
  if ((rfp as { status?: string }).status === 'published') {
    await c.env.DB.prepare(`UPDATE procurement_rfps SET status = 'evaluation' WHERE id = ?`).bind(id).run();
  }
  return c.json({ success: true, data: { updated } });
});

// ─── RFP file (Esums-equivalent depth for procurement) ──────────────────────
//
// GET /procurement/rfps/:id/file
//
// One payload that holds the whole RFP lifecycle: spec, bidders, scoring,
// award, resulting contract / LOI, and the audit chain. Drives the
// EntityFileShell-backed RFP detail page so the surface mirrors how
// projects and contracts are presented.
procurement.get('/rfps/:id/file', async (c) => {
  await ensureEvaluationColumns(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const rfp = await c.env.DB.prepare(`
    SELECT r.*, p.name AS creator_name, p.company_name AS creator_company
      FROM procurement_rfps r
      JOIN participants p ON p.id = r.created_by
     WHERE r.id = ?
  `).bind(id).first<any>();
  if (!rfp) return c.json({ success: false, error: 'rfp_not_found' }, 404);

  // Visibility — admins / regulators / grid see everything; everyone else
  // sees the RFP only if it's published OR they created it OR they bid on it.
  const isPrivileged = ['admin', 'regulator', 'grid_operator'].includes(user.role);
  if (!isPrivileged && rfp.status === 'draft' && rfp.created_by !== user.id) {
    const ownBid = await c.env.DB.prepare(
      `SELECT id FROM procurement_bids WHERE rfp_id = ? AND participant_id = ? LIMIT 1`,
    ).bind(id, user.id).first();
    if (!ownBid) return c.json({ success: false, error: 'forbidden' }, 403);
  }

  const safeAll = async <T = any>(sql: string, params: unknown[]): Promise<T[]> =>
    c.env.DB.prepare(sql).bind(...params).all<T>().then(r => (r.results || []) as T[]).catch(() => [] as T[]);
  const safeFirst = async <T = any>(sql: string, params: unknown[]): Promise<T | null> =>
    c.env.DB.prepare(sql).bind(...params).first<T>().catch(() => null);

  const [
    bids, award, evaluatedBids, auditEvents, auditLogs,
  ] = await Promise.all([
    safeAll(
      `SELECT b.*, p.name AS bidder_name, p.company_name AS bidder_company, p.bbbee_level
         FROM procurement_bids b
         JOIN participants p ON p.id = b.participant_id
        WHERE b.rfp_id = ?
        ORDER BY COALESCE(b.overall_score, b.score, 0) DESC, b.bid_amount ASC LIMIT 50`,
      [id],
    ),
    safeFirst(
      `SELECT a.*, p.name AS awarded_by_name
         FROM procurement_awards a
         LEFT JOIN participants p ON p.id = a.awarded_by
        WHERE a.rfp_id = ?
        ORDER BY a.awarded_at DESC LIMIT 1`,
      [id],
    ),
    safeAll(
      `SELECT b.id, b.bidder_company, b.technical_score, b.sustainability_score,
              b.delivery_score, b.overall_score, b.bid_amount, b.rank, b.status,
              p.name AS bidder_name, p.company_name AS bidder_company
         FROM procurement_bids b
         JOIN participants p ON p.id = b.participant_id
        WHERE b.rfp_id = ? AND b.overall_score IS NOT NULL
        ORDER BY b.overall_score DESC LIMIT 50`,
      [id],
    ),
    safeAll(
      `SELECT * FROM audit_events WHERE entity_type = 'procurement_rfps' AND entity_id = ? ORDER BY sequence_no DESC LIMIT 50`,
      [id],
    ),
    safeAll(
      `SELECT al.*, p.name AS actor_name
         FROM audit_logs al
         LEFT JOIN participants p ON p.id = al.actor_id
        WHERE al.entity_type = 'procurement_rfps' AND al.entity_id = ?
        ORDER BY al.created_at DESC LIMIT 50`,
      [id],
    ),
  ]);

  // Resulting contract document — if the award has linked a contract, or we
  // can find one created off this RFP via commercial_terms.rfp_id.
  const linkedContractId = (award as { contract_id?: string } | null)?.contract_id || null;
  const linkedContract = linkedContractId
    ? await safeFirst<Record<string, unknown>>(
        `SELECT id, title, document_type, phase, created_at FROM contract_documents WHERE id = ?`,
        [linkedContractId],
      )
    : await safeFirst<Record<string, unknown>>(
        `SELECT id, title, document_type, phase, created_at FROM contract_documents
          WHERE json_extract(commercial_terms, '$.rfp_id') = ?
          ORDER BY created_at DESC LIMIT 1`,
        [id],
      );

  // ── Summary counts ───────────────────────────────────────────────────
  const bidsSubmitted = (bids as Array<{ status?: string }>).filter((b) => b.status === 'submitted').length;
  const bidsShortlisted = (bids as Array<{ status?: string }>).filter((b) => b.status === 'shortlisted').length;
  const bidsAwarded = (bids as Array<{ status?: string }>).filter((b) => b.status === 'awarded').length;
  const bidsRejected = (bids as Array<{ status?: string }>).filter((b) => b.status === 'rejected').length;
  const totalBidValue = (bids as Array<{ bid_amount?: number }>).reduce(
    (s, b) => s + (Number(b.bid_amount) || 0),
    0,
  );
  const lowestBid = bids.length > 0
    ? Math.min(...(bids as Array<{ bid_amount?: number }>).map((b) => Number(b.bid_amount) || Infinity))
    : 0;
  const closingDate = rfp.closing_date as string | null;
  const daysToClose = closingDate
    ? Math.ceil((new Date(closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // ── AI inline assists ────────────────────────────────────────────────
  type Suggest = { key: string; tab: string; title: string; why: string; confidence?: number; accept?: { label: string; href: string } };
  const suggestions: Suggest[] = [];
  if (rfp.status === 'published' && bids.length === 0 && daysToClose !== null && daysToClose < 14) {
    suggestions.push({
      key: 'no_bids_closing_soon',
      tab: 'bidders',
      title: `No bids and RFP closes in ${daysToClose} day${Math.abs(daysToClose) === 1 ? '' : 's'}`,
      why: 'Low bidder interest typically signals scope or commercial-terms drift. Consider an extension or a clarifying briefing session.',
      confidence: 0.85,
      accept: { label: 'Open bidders tab', href: `/rfps/${id}?tab=bidders` },
    });
  }
  if (rfp.status === 'evaluation' && evaluatedBids.length < bids.length) {
    suggestions.push({
      key: 'unscored_bids',
      tab: 'evaluation',
      title: `${bids.length - evaluatedBids.length} bid${bids.length - evaluatedBids.length === 1 ? '' : 's'} not yet scored`,
      why: 'Evaluation cannot complete until every bid has technical, sustainability, and delivery scores. The weighted formula needs all three.',
      confidence: 0.92,
      accept: { label: 'Open evaluation tab', href: `/rfps/${id}?tab=evaluation` },
    });
  }
  if (rfp.status === 'awarded' && !linkedContract) {
    suggestions.push({
      key: 'no_award_contract',
      tab: 'award',
      title: 'Award has no linked contract document',
      why: 'A signed LOI or term sheet should follow within 14 days of the award notification per PFMA s.51.',
      confidence: 0.78,
      accept: { label: 'Open award tab', href: `/rfps/${id}?tab=award` },
    });
  }

  return c.json({
    success: true,
    data: {
      rfp,
      phase: rfp.status || 'draft',
      summary: {
        bids_total: bids.length,
        bids_submitted: bidsSubmitted,
        bids_shortlisted: bidsShortlisted,
        bids_awarded: bidsAwarded,
        bids_rejected: bidsRejected,
        bids_evaluated: evaluatedBids.length,
        lowest_bid_zar: Number.isFinite(lowestBid) ? lowestBid : 0,
        total_bid_value_zar: totalBidValue,
        budget_zar: Number(rfp.budget) || 0,
        days_to_close: daysToClose,
        audit_events: auditEvents.length,
        linked_contract: linkedContract ? 1 : 0,
      },
      specification: {
        description: rfp.description,
        rfp_reference: rfp.rfp_reference,
        closing_date: rfp.closing_date,
        evaluation_date: rfp.evaluation_date,
        budget: rfp.budget,
        currency: rfp.currency,
        creator_name: rfp.creator_name,
        creator_company: rfp.creator_company,
      },
      bidders: { bids },
      evaluation: { scored_bids: evaluatedBids },
      award: {
        record: award,
        linked_contract: linkedContract,
      },
      audit: { events: auditEvents, logs: auditLogs },
      ai_suggestions: suggestions,
    },
  });
});

export default procurement;
