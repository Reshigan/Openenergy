// ════════════════════════════════════════════════════════════════════════
// Esums Projects — portfolio-level grouping of om_sites.
//
// A project is the unit of isolation for per-project D1 sharding.
// Set shard_key on the project row + add ESUMS_DB_<SHARD_KEY> binding
// in wrangler.toml to route that project's telemetry to its own D1.
//
// Endpoints:
//   GET    /                  — list caller's projects
//   POST   /                  — create project
//   GET    /:id               — project detail + site list
//   PUT    /:id               — update name/description/shard_key
//   DELETE /:id               — only if project has no sites
//   GET    /:id/sites         — list sites in project (with telemetry summary)
//   POST   /:id/sites/:site_id/assign   — assign existing site to project
//   DELETE /:id/sites/:site_id/assign   — unassign site from project
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { randomId } from '../utils/auth-tokens';
import { AppError, ErrorCode } from '../utils/types';

const ep = new Hono<HonoEnv>();
ep.use('*', authMiddleware);

const SHARD_KEY_RE = /^[a-z0-9_]{1,32}$/;

// ─── GET / — list ─────────────────────────────────────────────────────────────

ep.get('/', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB
    .prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM om_sites WHERE project_id = p.id) AS site_count_live
      FROM esums_projects p
      WHERE p.participant_id = ?
      ORDER BY p.created_at DESC
    `)
    .bind(user.id)
    .all();
  return c.json({ data: rows.results });
});

// ─── POST / — create ──────────────────────────────────────────────────────────

ep.post('/', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json<Record<string, unknown>>();

  if (!b.name || typeof b.name !== 'string' || !b.name.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'name is required', 400);
  }
  if (b.shard_key !== undefined && b.shard_key !== null) {
    if (typeof b.shard_key !== 'string' || !SHARD_KEY_RE.test(b.shard_key)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'shard_key must be lowercase alphanumeric + underscore, max 32 chars',
        400,
      );
    }
  }

  const id = randomId('epr_');
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`
      INSERT INTO esums_projects
        (id, participant_id, name, description, shard_key, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      id, user.id,
      b.name as string,
      (b.description as string) || null,
      (b.shard_key as string) || null,
      now, now,
    ).run();
  } catch (e: unknown) {
    const msg = String((e as { message?: string }).message ?? '');
    if (msg.includes('UNIQUE') && msg.includes('shard_key')) {
      throw new AppError(ErrorCode.CONFLICT, 'shard_key already in use by another project', 409);
    }
    throw e;
  }

  const row = await c.env.DB.prepare('SELECT * FROM esums_projects WHERE id = ?').bind(id).first();
  return c.json({ data: row }, 201);
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

ep.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB
    .prepare('SELECT * FROM esums_projects WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!project) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);

  const sites = await c.env.DB
    .prepare(`
      SELECT s.id, s.name, s.site_type, s.installed_capacity_kw,
             s.location_province, s.status, s.last_seen_at,
             (SELECT COUNT(*) FROM om_devices WHERE site_id = s.id) AS device_count
      FROM om_sites s
      WHERE s.project_id = ?
      ORDER BY s.created_at DESC
    `)
    .bind(id).all();

  return c.json({ data: { ...project, sites: sites.results } });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

ep.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json<Record<string, unknown>>();

  const existing = await c.env.DB
    .prepare('SELECT * FROM esums_projects WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first<Record<string, unknown>>();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);

  if (b.shard_key !== undefined && b.shard_key !== null) {
    if (typeof b.shard_key !== 'string' || !SHARD_KEY_RE.test(b.shard_key as string)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'shard_key must be lowercase alphanumeric + underscore, max 32 chars',
        400,
      );
    }
  }

  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`
      UPDATE esums_projects
      SET name = ?, description = ?, shard_key = ?, status = ?, updated_at = ?
      WHERE id = ? AND participant_id = ?
    `).bind(
      b.name ?? existing.name,
      b.description !== undefined ? b.description : existing.description,
      b.shard_key !== undefined ? b.shard_key : existing.shard_key,
      b.status ?? existing.status,
      now, id, user.id,
    ).run();
  } catch (e: unknown) {
    const msg = String((e as { message?: string }).message ?? '');
    if (msg.includes('UNIQUE') && msg.includes('shard_key')) {
      throw new AppError(ErrorCode.CONFLICT, 'shard_key already in use by another project', 409);
    }
    throw e;
  }

  const updated = await c.env.DB
    .prepare('SELECT * FROM esums_projects WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

ep.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const existing = await c.env.DB
    .prepare('SELECT id FROM esums_projects WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);

  const siteCount = await c.env.DB
    .prepare('SELECT COUNT(*) AS n FROM om_sites WHERE project_id = ?')
    .bind(id).first<{ n: number }>();
  if ((siteCount?.n ?? 0) > 0) {
    throw new AppError(
      ErrorCode.CONFLICT,
      'Cannot delete a project with sites. Unassign all sites first.',
      409,
    );
  }

  await c.env.DB.prepare('DELETE FROM esums_projects WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ─── GET /:id/sites ───────────────────────────────────────────────────────────

ep.get('/:id/sites', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB
    .prepare('SELECT id FROM esums_projects WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!project) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);

  const rows = await c.env.DB.prepare(`
    SELECT
      s.id, s.name, s.site_type, s.installed_capacity_kw,
      s.location_province, s.status, s.last_seen_at,
      (SELECT COUNT(*) FROM om_devices   WHERE site_id = s.id) AS device_count,
      (SELECT COUNT(*) FROM om_faults    WHERE site_id = s.id AND status NOT IN ('resolved','closed')) AS open_faults,
      (SELECT COUNT(*) FROM om_work_orders WHERE site_id = s.id AND status NOT IN ('closed','cancelled')) AS open_wos
    FROM om_sites s
    WHERE s.project_id = ?
    ORDER BY s.name ASC
  `).bind(id).all();

  return c.json({ data: rows.results });
});

// ─── POST /:id/sites/:site_id/assign ─────────────────────────────────────────

ep.post('/:id/sites/:site_id/assign', async (c) => {
  const user = getCurrentUser(c);
  const { id, site_id } = c.req.param();

  const [project, site] = await Promise.all([
    c.env.DB.prepare('SELECT id FROM esums_projects WHERE id = ? AND participant_id = ?')
      .bind(id, user.id).first(),
    c.env.DB.prepare('SELECT id FROM om_sites WHERE id = ? AND participant_id = ?')
      .bind(site_id, user.id).first(),
  ]);

  if (!project) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);
  if (!site) throw new AppError(ErrorCode.NOT_FOUND, 'Site not found', 404);

  await c.env.DB.prepare(
    `UPDATE om_sites SET project_id = ? WHERE id = ?`,
  ).bind(id, site_id).run();

  // Keep site_count denormalised counter fresh
  await c.env.DB.prepare(
    `UPDATE esums_projects SET site_count = (
       SELECT COUNT(*) FROM om_sites WHERE project_id = ?
     ), updated_at = ? WHERE id = ?`,
  ).bind(id, new Date().toISOString(), id).run();

  return c.json({ ok: true });
});

// ─── DELETE /:id/sites/:site_id/assign ───────────────────────────────────────

ep.delete('/:id/sites/:site_id/assign', async (c) => {
  const user = getCurrentUser(c);
  const { id, site_id } = c.req.param();

  const project = await c.env.DB
    .prepare('SELECT id FROM esums_projects WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!project) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);

  await c.env.DB.prepare(
    `UPDATE om_sites SET project_id = NULL WHERE id = ? AND participant_id = ?`,
  ).bind(site_id, user.id).run();

  await c.env.DB.prepare(
    `UPDATE esums_projects SET site_count = (
       SELECT COUNT(*) FROM om_sites WHERE project_id = ?
     ), updated_at = ? WHERE id = ?`,
  ).bind(id, new Date().toISOString(), id).run();

  return c.json({ ok: true });
});

export default ep;
