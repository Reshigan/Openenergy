// ═══════════════════════════════════════════════════════════════════════════
// Marketplace — classifieds-style surface for energy, capacity, carbon,
// equipment and services. Listings live in marketplace_listings; buyer
// expressions of interest in marketplace_inquiries (schema in 002_domain.sql).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { assertSameTenantParticipant } from '../utils/tenant';

const marketplace = new Hono<HonoEnv>();
marketplace.use('*', authMiddleware);

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
}

const LISTING_TYPES = ['energy', 'capacity', 'carbon', 'equipment', 'service'] as const;
const LISTING_STATUSES = ['active', 'pending', 'sold', 'withdrawn'] as const;
const INQUIRY_STATUSES = ['pending', 'responded', 'accepted', 'rejected'] as const;

// ---------------- Listings ----------------

// GET /api/marketplace/listings?type=&status=&mine=&q=
marketplace.get('/listings', async (c) => {
  const user = getCurrentUser(c);
  const type = c.req.query('type');
  const status = c.req.query('status');
  const mine = c.req.query('mine');
  const q = c.req.query('q');

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (type) { filters.push('ml.listing_type = ?'); bindings.push(type); }
  if (status) { filters.push('ml.status = ?'); bindings.push(status); }
  else if (!mine) { filters.push("ml.status = 'active'"); }
  if (mine) { filters.push('ml.seller_id = ?'); bindings.push(user.id); }
  if (q) {
    filters.push('(LOWER(ml.title) LIKE ? OR LOWER(ml.description) LIKE ?)');
    bindings.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`
    SELECT ml.*, p.name AS seller_name, p.company_name AS seller_company
    FROM marketplace_listings ml
    LEFT JOIN participants p ON p.id = ml.seller_id
    ${where}
    ORDER BY ml.created_at DESC LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

// GET /api/marketplace/listings/:id — detail with inquiries (if caller is seller).
marketplace.get('/listings/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const listing = await c.env.DB.prepare(`
    SELECT ml.*, p.name AS seller_name, p.company_name AS seller_company
    FROM marketplace_listings ml
    LEFT JOIN participants p ON p.id = ml.seller_id
    WHERE ml.id = ?
  `).bind(id).first();
  if (!listing) return c.json({ success: false, error: 'listing_not_found' }, 404);
  const isSeller = (listing as { seller_id: string }).seller_id === user.id;
  const inquiries = isSeller || user.role === 'admin'
    ? await c.env.DB.prepare(`
        SELECT mi.*, b.name AS buyer_name, b.company_name AS buyer_company
        FROM marketplace_inquiries mi
        LEFT JOIN participants b ON b.id = mi.buyer_id
        WHERE mi.listing_id = ?
        ORDER BY mi.created_at DESC
      `).bind(id).all()
    : { results: [] };
  return c.json({ success: true, data: { listing, inquiries: inquiries.results || [] } });
});

// POST /api/marketplace/listings — seller creates.
marketplace.post('/listings', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { listing_type, title, description, price, price_unit, currency, volume_available, volume_unit, delivery_start, delivery_end } = body as Record<string, string | number | undefined>;
  if (!listing_type || !LISTING_TYPES.includes(listing_type as typeof LISTING_TYPES[number])) {
    return c.json({ success: false, error: 'invalid_listing_type' }, 400);
  }
  if (!title) return c.json({ success: false, error: 'title_required' }, 400);
  const id = genId('ml');
  await c.env.DB.prepare(`
    INSERT INTO marketplace_listings
      (id, seller_id, listing_type, title, description, price, price_unit, currency, volume_available, volume_unit, delivery_start, delivery_end, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(
    id,
    user.id,
    listing_type,
    title,
    description || null,
    price ?? null,
    price_unit || null,
    currency || 'ZAR',
    volume_available ?? null,
    volume_unit || null,
    delivery_start || null,
    delivery_end || null,
    new Date().toISOString(),
  ).run();
  await fireCascade({
    event: 'marketplace.listed',
    actor_id: user.id,
    entity_type: 'marketplace_listings',
    entity_id: id,
    data: { listing_type },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// PUT /api/marketplace/listings/:id — seller or admin updates.
marketplace.put('/listings/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const listing = await c.env.DB.prepare('SELECT seller_id FROM marketplace_listings WHERE id = ?').bind(id).first() as { seller_id: string } | null;
  if (!listing) return c.json({ success: false, error: 'listing_not_found' }, 404);
  if (listing.seller_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const allowed = ['title', 'description', 'price', 'price_unit', 'currency', 'volume_available', 'volume_unit', 'delivery_start', 'delivery_end', 'status'] as const;
  const sets: string[] = [];
  const bindings: unknown[] = [];
  for (const key of allowed) {
    if (key in body) {
      if (key === 'status' && !LISTING_STATUSES.includes(body.status as typeof LISTING_STATUSES[number])) {
        return c.json({ success: false, error: 'invalid_status' }, 400);
      }
      sets.push(`${key} = ?`);
      bindings.push((body as Record<string, unknown>)[key]);
    }
  }
  if (!sets.length) return c.json({ success: false, error: 'no_updatable_fields' }, 400);
  sets.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(id);
  await c.env.DB.prepare(`UPDATE marketplace_listings SET ${sets.join(', ')} WHERE id = ?`).bind(...bindings).run();
  return c.json({ success: true });
});

// POST /api/marketplace/listings/:id/withdraw — seller withdraws.
marketplace.post('/listings/:id/withdraw', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const listing = await c.env.DB.prepare('SELECT seller_id FROM marketplace_listings WHERE id = ?').bind(id).first() as { seller_id: string } | null;
  if (!listing) return c.json({ success: false, error: 'listing_not_found' }, 404);
  if (listing.seller_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare("UPDATE marketplace_listings SET status = 'withdrawn', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  return c.json({ success: true });
});

// ---------------- Inquiries ----------------

// POST /api/marketplace/listings/:id/inquire — buyer expresses interest.
marketplace.post('/listings/:id/inquire', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as { message?: string }));
  const listing = await c.env.DB.prepare('SELECT seller_id, status, title FROM marketplace_listings WHERE id = ?').bind(id).first() as { seller_id: string; status: string; title: string } | null;
  if (!listing) return c.json({ success: false, error: 'listing_not_found' }, 404);
  if (listing.status !== 'active') return c.json({ success: false, error: 'listing_not_active' }, 400);
  if (listing.seller_id === user.id) return c.json({ success: false, error: 'cannot_inquire_on_own_listing' }, 400);

  // Tenant isolation: buyer and seller must be in the same tenant (or caller is admin).
  await assertSameTenantParticipant(c, listing.seller_id);

  const inquiryId = genId('mi');
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO marketplace_inquiries (id, listing_id, buyer_id, message, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).bind(inquiryId, id, user.id, body.message || null, now).run();

  // Notify seller inline. Email delivery wired separately.
  await c.env.DB.prepare(`
    INSERT INTO notifications (id, participant_id, type, title, body, read, email_sent, created_at)
    VALUES (?, ?, 'marketplace_inquiry', ?, ?, 0, 0, ?)
  `).bind(
    genId('ntf'),
    listing.seller_id,
    `New inquiry: ${listing.title}`,
    body.message ? String(body.message).slice(0, 500) : 'Buyer expressed interest in your listing.',
    now,
  ).run();

  await fireCascade({
    event: 'marketplace.inquired',
    actor_id: user.id,
    entity_type: 'marketplace_inquiries',
    entity_id: inquiryId,
    data: { listing_id: id, seller_id: listing.seller_id },
    env: c.env,
  });
  return c.json({ success: true, data: { id: inquiryId } }, 201);
});

// GET /api/marketplace/inquiries/mine — buyer sees their own inquiries.
marketplace.get('/inquiries/mine', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`
    SELECT mi.*, ml.title AS listing_title, ml.listing_type, ml.seller_id,
           p.name AS seller_name, p.company_name AS seller_company
    FROM marketplace_inquiries mi
    JOIN marketplace_listings ml ON ml.id = mi.listing_id
    LEFT JOIN participants p ON p.id = ml.seller_id
    WHERE mi.buyer_id = ? ORDER BY mi.created_at DESC LIMIT 200
  `).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /api/marketplace/inquiries/:id/respond — seller updates inquiry status.
marketplace.post('/inquiries/:id/respond', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as { status?: string; message?: string }));
  if (!body.status || !INQUIRY_STATUSES.includes(body.status as typeof INQUIRY_STATUSES[number])) {
    return c.json({ success: false, error: 'invalid_status' }, 400);
  }
  const inquiry = await c.env.DB.prepare(`
    SELECT mi.buyer_id, mi.listing_id, ml.seller_id, ml.title
    FROM marketplace_inquiries mi
    JOIN marketplace_listings ml ON ml.id = mi.listing_id
    WHERE mi.id = ?
  `).bind(id).first() as { buyer_id: string; listing_id: string; seller_id: string; title: string } | null;
  if (!inquiry) return c.json({ success: false, error: 'inquiry_not_found' }, 404);
  if (inquiry.seller_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare('UPDATE marketplace_inquiries SET status = ? WHERE id = ?').bind(body.status, id).run();

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO notifications (id, participant_id, type, title, body, read, email_sent, created_at)
    VALUES (?, ?, 'marketplace_inquiry_response', ?, ?, 0, 0, ?)
  `).bind(
    genId('ntf'),
    inquiry.buyer_id,
    `Seller responded: ${inquiry.title}`,
    body.message || `Status: ${body.status}`,
    now,
  ).run();

  if (body.status === 'accepted') {
    await c.env.DB.prepare("UPDATE marketplace_listings SET status = 'pending', updated_at = ? WHERE id = ?").bind(now, inquiry.listing_id).run();
    await fireCascade({
      event: 'marketplace.accepted',
      actor_id: user.id,
      entity_type: 'marketplace_inquiries',
      entity_id: id,
      data: { listing_id: inquiry.listing_id, buyer_id: inquiry.buyer_id },
      env: c.env,
    });
  }
  return c.json({ success: true });
});

// ---------------- Summary ----------------

marketplace.get('/summary', async (c) => {
  const [active, byType, myListings, myInquiries] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'active'").first(),
    c.env.DB.prepare("SELECT listing_type, COUNT(*) AS c FROM marketplace_listings WHERE status = 'active' GROUP BY listing_type").all(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM marketplace_listings WHERE seller_id = ?').bind(getCurrentUser(c).id).first(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM marketplace_inquiries WHERE buyer_id = ?').bind(getCurrentUser(c).id).first(),
  ]);
  return c.json({
    success: true,
    data: {
      active_listings: Number((active as { c?: number } | null)?.c || 0),
      by_type: byType.results || [],
      my_listings: Number((myListings as { c?: number } | null)?.c || 0),
      my_inquiries: Number((myInquiries as { c?: number } | null)?.c || 0),
    },
  });
});

export default marketplace;
