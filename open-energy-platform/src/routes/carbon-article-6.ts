// ═══════════════════════════════════════════════════════════════════════════
// Carbon Article 6 — Wave 4 UNFCCC Paris Agreement ITMO corresponding-
// adjustment ledger.
//
// Mounted at /api/carbon/article-6 (flat — avoids the basePath param-collision
// lesson saved in [[feedback_route_mount_collision]]).
//
// Endpoints (READ):
//   GET    /                            list adjustments, filterable
//   GET    /:id                         one adjustment + risk assessment
//   GET    /country-routing             list country routing rules
//   GET    /serial-uri/:certificate_id  registry URIs for a certificate
//
// Endpoints (WRITE):
//   POST   /                            create new adjustment
//   POST   /:id/submit-dffe             advance draft → dffe_pending
//   POST   /:id/clear-dffe              advance dffe_pending → dffe_cleared
//   POST   /:id/post-unfccc             advance dffe_cleared → unfccc_ledger
//   POST   /:id/block                   block from any state
//   POST   /:id/unblock                 unblock → draft
//   PUT    /country-routing/:iso        upsert country routing rule
//
// Read roles:  admin, support, regulator, carbon, lender, trader
// Write roles: admin, regulator, carbon (the DFFE-clearance + UNFCCC-post
//              transitions are regulator-only to mirror the real-world
//              authority chain)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  CountryRouting,
  computeRegistryUri,
  classifyArticle6Track,
  assessDoubleCountingRisk,
  nextArticle6Status,
} from '../utils/article6';

const a6 = new Hono<HonoEnv>();
a6.use('*', authMiddleware);

const READ_ROLES = new Set(['admin', 'support', 'regulator', 'carbon', 'carbon_fund', 'lender', 'trader']);
const CREATE_ROLES = new Set(['admin', 'carbon', 'carbon_fund']);
const SUBMIT_ROLES = new Set(['admin', 'carbon', 'carbon_fund']);
// DFFE clearance + UNFCCC posting are restricted to regulator (mirrors the
// real-world authority — DFFE is the SA NDC authority for Article 6).
const CLEAR_ROLES = new Set(['admin', 'regulator']);
const POST_ROLES = new Set(['admin', 'regulator']);
const BLOCK_ROLES = new Set(['admin', 'regulator', 'support']);
const ROUTING_WRITE_ROLES = new Set(['admin', 'regulator']);

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

async function loadRouting(db: D1Database, iso: string): Promise<CountryRouting | null> {
  const row = await db.prepare(
    `SELECT country_iso, country_name, article_6_track, registry_url_pattern, active
       FROM oe_country_routing WHERE country_iso = ?`,
  ).bind(iso).first<CountryRouting>();
  return row || null;
}

// ── GET / — list adjustments ────────────────────────────────────────────────
a6.get('/', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);

  const host = c.req.query('host_country_iso');
  const ben = c.req.query('beneficiary_country_iso');
  const status = c.req.query('ca_status');

  const where: string[] = [];
  const params: any[] = [];
  if (host) { where.push('host_country_iso = ?'); params.push(host); }
  if (ben) { where.push('beneficiary_country_iso = ?'); params.push(ben); }
  if (status) { where.push('ca_status = ?'); params.push(status); }

  const sql = `
    SELECT id, retirement_id, certificate_id, host_country_iso, beneficiary_country_iso,
           tco2e, vintage_year, registry, serial_range, registry_uri, article_6_track,
           ca_status, dffe_submitted_at, dffe_clearance_at, unfccc_posted_at,
           blocked_reason, created_at, updated_at
      FROM oe_article6_adjustments
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC
     LIMIT 200
  `;
  const rows = await (c.env.DB as D1Database).prepare(sql).bind(...params).all<any>();
  return c.json({ data: rows.results || [] });
});

// ── GET /country-routing — list routing rules ──────────────────────────────
// (Declared before /:id to avoid Hono treating "country-routing" as an :id.)
a6.get('/country-routing', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const rows = await (c.env.DB as D1Database).prepare(`
    SELECT country_iso, country_name, ndc_authority, ndc_authority_email,
           article_6_track, registry_url_pattern, active, notes, updated_at
      FROM oe_country_routing
     WHERE active = 1
     ORDER BY country_name
  `).all<any>();
  return c.json({ data: rows.results || [] });
});

// ── GET /serial-uri/:certificate_id — registry anchors for a certificate ──
a6.get('/serial-uri/:certificate_id', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const certId = c.req.param('certificate_id');
  const rows = await (c.env.DB as D1Database).prepare(`
    SELECT id, retirement_id, registry, serial_range, registry_uri,
           resolved_at, resolved_status, resolved_sha256, created_at
      FROM oe_serial_registry_uri
     WHERE certificate_id = ?
     ORDER BY created_at DESC
  `).bind(certId).all<any>();
  return c.json({ data: rows.results || [] });
});

// ── GET /:id — one adjustment + risk assessment ────────────────────────────
a6.get('/:id', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await (c.env.DB as D1Database).prepare(
    `SELECT * FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const risk = assessDoubleCountingRisk({
    host_iso: row.host_country_iso,
    beneficiary_iso: row.beneficiary_country_iso,
    article_6_track: row.article_6_track,
    ca_status: row.ca_status,
  });

  return c.json({ data: { ...row, risk_assessment: risk } });
});

// ── POST / — create new adjustment ─────────────────────────────────────────
a6.post('/', async (c) => {
  const u = getCurrentUser(c);
  if (!CREATE_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({})) as any;

  for (const k of ['retirement_id', 'host_country_iso', 'beneficiary_country_iso', 'tco2e', 'registry']) {
    if (!b[k] && b[k] !== 0) return c.json({ error: `${k}_required` }, 400);
  }
  if (Number(b.tco2e) <= 0) return c.json({ error: 'tco2e_must_be_positive' }, 400);

  const db = c.env.DB as D1Database;
  const hostRouting = await loadRouting(db, b.host_country_iso);
  const benRouting = await loadRouting(db, b.beneficiary_country_iso);
  const track = classifyArticle6Track(hostRouting, benRouting, b.registry);
  const uri = computeRegistryUri(
    hostRouting, b.registry,
    b.project_id || 'unknown',
    Number(b.vintage_year) || new Date().getFullYear(),
    b.serial_range || 'unspecified',
  );

  const id = newId('a6');
  await db.prepare(`
    INSERT INTO oe_article6_adjustments (
      id, retirement_id, certificate_id, host_country_iso, beneficiary_country_iso,
      tco2e, vintage_year, registry, serial_range, registry_uri,
      article_6_track, ca_status, created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',?)
  `).bind(
    id, b.retirement_id, b.certificate_id || null,
    b.host_country_iso, b.beneficiary_country_iso,
    Number(b.tco2e), b.vintage_year ? Number(b.vintage_year) : null,
    b.registry, b.serial_range || null, uri, track, u.id,
  ).run();

  // Anchor serial URI so an auditor can dereference the retirement.
  if (b.certificate_id && b.serial_range) {
    await db.prepare(`
      INSERT INTO oe_serial_registry_uri (id, certificate_id, retirement_id, registry, serial_range, registry_uri)
      VALUES (?,?,?,?,?,?)
    `).bind(
      newId('uri'), b.certificate_id, b.retirement_id, b.registry, b.serial_range, uri,
    ).run();
  }

  await fireCascade({
    event: 'carbon.article6.adjustment_created',
    actor_id: u.id,
    entity_type: 'article6_adjustment',
    entity_id: id,
    data: { host: b.host_country_iso, beneficiary: b.beneficiary_country_iso, tco2e: Number(b.tco2e), track },
    env: c.env,
  });

  return c.json({ data: { id, ca_status: 'draft', article_6_track: track, registry_uri: uri } }, 201);
});

// ── POST /:id/submit-dffe — draft → dffe_pending ───────────────────────────
a6.post('/:id/submit-dffe', async (c) => {
  const u = getCurrentUser(c);
  if (!SUBMIT_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const db = c.env.DB as D1Database;
  const row = await db.prepare(
    `SELECT id, ca_status FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const next = nextArticle6Status(row.ca_status, 'submit_dffe');
  if (!next) return c.json({ error: 'invalid_transition', from: row.ca_status }, 409);

  await db.prepare(`
    UPDATE oe_article6_adjustments
       SET ca_status = ?, dffe_submitted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?
  `).bind(next, id).run();

  await fireCascade({
    event: 'carbon.article6.dffe_submitted',
    actor_id: u.id,
    entity_type: 'article6_adjustment',
    entity_id: id,
    data: {},
    env: c.env,
  });
  return c.json({ data: { id, ca_status: next } });
});

// ── POST /:id/clear-dffe — dffe_pending → dffe_cleared ────────────────────
a6.post('/:id/clear-dffe', async (c) => {
  const u = getCurrentUser(c);
  if (!CLEAR_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({})) as any;
  if (!b.clearance_ref) return c.json({ error: 'clearance_ref_required' }, 400);

  const db = c.env.DB as D1Database;
  const row = await db.prepare(
    `SELECT id, ca_status FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const next = nextArticle6Status(row.ca_status, 'clear_dffe');
  if (!next) return c.json({ error: 'invalid_transition', from: row.ca_status }, 409);

  await db.prepare(`
    UPDATE oe_article6_adjustments
       SET ca_status = ?, dffe_clearance_ref = ?, dffe_clearance_at = datetime('now'),
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(next, String(b.clearance_ref), id).run();

  await fireCascade({
    event: 'carbon.article6.dffe_cleared',
    actor_id: u.id,
    entity_type: 'article6_adjustment',
    entity_id: id,
    data: { clearance_ref: b.clearance_ref },
    env: c.env,
  });
  return c.json({ data: { id, ca_status: next } });
});

// ── POST /:id/post-unfccc — dffe_cleared → unfccc_ledger ──────────────────
a6.post('/:id/post-unfccc', async (c) => {
  const u = getCurrentUser(c);
  if (!POST_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({})) as any;
  if (!b.ledger_ref) return c.json({ error: 'ledger_ref_required' }, 400);

  const db = c.env.DB as D1Database;
  const row = await db.prepare(
    `SELECT id, ca_status FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const next = nextArticle6Status(row.ca_status, 'post_unfccc');
  if (!next) return c.json({ error: 'invalid_transition', from: row.ca_status }, 409);

  await db.prepare(`
    UPDATE oe_article6_adjustments
       SET ca_status = ?, unfccc_ledger_ref = ?, unfccc_posted_at = datetime('now'),
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(next, String(b.ledger_ref), id).run();

  await fireCascade({
    event: 'carbon.article6.unfccc_posted',
    actor_id: u.id,
    entity_type: 'article6_adjustment',
    entity_id: id,
    data: { ledger_ref: b.ledger_ref },
    env: c.env,
  });
  return c.json({ data: { id, ca_status: next } });
});

// ── POST /:id/block ────────────────────────────────────────────────────────
a6.post('/:id/block', async (c) => {
  const u = getCurrentUser(c);
  if (!BLOCK_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({})) as any;
  const reason = String(b.reason || '').trim();
  if (reason.length < 3) return c.json({ error: 'reason_required' }, 400);

  const db = c.env.DB as D1Database;
  const row = await db.prepare(
    `SELECT id, ca_status FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.ca_status === 'blocked') return c.json({ error: 'already_blocked' }, 409);

  await db.prepare(`
    UPDATE oe_article6_adjustments
       SET ca_status = 'blocked', blocked_reason = ?, updated_at = datetime('now')
     WHERE id = ?
  `).bind(reason, id).run();

  await fireCascade({
    event: 'carbon.article6.blocked',
    actor_id: u.id,
    entity_type: 'article6_adjustment',
    entity_id: id,
    data: { reason },
    env: c.env,
  });
  return c.json({ data: { id, ca_status: 'blocked' } });
});

// ── POST /:id/unblock — blocked → draft ────────────────────────────────────
a6.post('/:id/unblock', async (c) => {
  const u = getCurrentUser(c);
  if (!BLOCK_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const db = c.env.DB as D1Database;
  const row = await db.prepare(
    `SELECT id, ca_status FROM oe_article6_adjustments WHERE id = ?`,
  ).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.ca_status !== 'blocked') return c.json({ error: 'not_blocked' }, 409);

  await db.prepare(`
    UPDATE oe_article6_adjustments
       SET ca_status = 'draft', blocked_reason = NULL, updated_at = datetime('now')
     WHERE id = ?
  `).bind(id).run();
  return c.json({ data: { id, ca_status: 'draft' } });
});

// ── PUT /country-routing/:iso — upsert routing rule ────────────────────────
a6.put('/country-routing/:iso', async (c) => {
  const u = getCurrentUser(c);
  if (!ROUTING_WRITE_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const iso = c.req.param('iso').toUpperCase();
  const b = await c.req.json().catch(() => ({})) as any;
  if (!b.country_name) return c.json({ error: 'country_name_required' }, 400);

  const validTracks = new Set(['6.2', '6.4', 'paris_only', 'non_party', 'unknown']);
  const track = validTracks.has(b.article_6_track) ? b.article_6_track : 'unknown';

  await (c.env.DB as D1Database).prepare(`
    INSERT INTO oe_country_routing (
      country_iso, country_name, ndc_authority, ndc_authority_email,
      article_6_track, registry_url_pattern, active, notes, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(country_iso) DO UPDATE SET
      country_name = excluded.country_name,
      ndc_authority = excluded.ndc_authority,
      ndc_authority_email = excluded.ndc_authority_email,
      article_6_track = excluded.article_6_track,
      registry_url_pattern = excluded.registry_url_pattern,
      active = excluded.active,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).bind(
    iso, b.country_name, b.ndc_authority || null, b.ndc_authority_email || null,
    track, b.registry_url_pattern || null,
    b.active === 0 ? 0 : 1, b.notes || null,
  ).run();

  await fireCascade({
    event: 'carbon.country_routing.updated',
    actor_id: u.id,
    entity_type: 'country_routing',
    entity_id: iso,
    data: { article_6_track: track },
    env: c.env,
  });
  return c.json({ data: { country_iso: iso, article_6_track: track } });
});

export default a6;
