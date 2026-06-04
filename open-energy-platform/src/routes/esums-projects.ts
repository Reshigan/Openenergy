// ════════════════════════════════════════════════════════════════════════
// Esums Projects — portfolio-level grouping of om_sites.
//
// project_type:
//   'ipp'        — linked to an ipp_projects row (ipp_project_id required).
//                  Use when the participant already has a tracked IPP project
//                  and wants Esums O&M as the operational layer on top of it.
//   'standalone' — no IPP project link.
//                  Use for asset-owner-only deployments, community solar,
//                  behind-the-meter BESS, or any site not in an IPP lifecycle.
//
// Auto-create:
//   GET / checks if the caller has any projects. If not, it creates one
//   standalone project named "<participant_name> — Default Project" so the
//   user can immediately proceed without a separate setup step.
//
// Endpoints:
//   GET    /                  — list (auto-creates standalone on first visit)
//   POST   /                  — create (ipp or standalone)
//   GET    /:id               — project detail + site list
//   PUT    /:id               — update name/description/shard_key/status
//   DELETE /:id               — only if project has no sites
//   GET    /:id/sites         — list sites in project (with telemetry summary)
//   GET    /ipp-projects      — list caller's ipp_projects (to link when creating)
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

// ─── GET /ipp-projects — callable before POST / to populate the picker ────────

ep.get('/ipp-projects', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`
    SELECT id, project_name, technology, capacity_mw, status, location
    FROM ipp_projects
    WHERE developer_id = ?
    ORDER BY created_at DESC
  `).bind(user.id).all();
  return c.json({ data: rows.results });
});

// ─── GET / — list (auto-creates standalone on first visit) ───────────────────

ep.get('/', async (c) => {
  const user = getCurrentUser(c);

  const existing = await c.env.DB.prepare(`
    SELECT ep.*,
      ip.project_name AS ipp_project_name,
      ip.technology   AS ipp_technology,
      ip.capacity_mw  AS ipp_capacity_mw,
      ip.status       AS ipp_status
    FROM esums_projects ep
    LEFT JOIN ipp_projects ip ON ip.id = ep.ipp_project_id
    WHERE ep.participant_id = ?
    ORDER BY ep.created_at ASC
  `).bind(user.id).all();

  if ((existing.results ?? []).length > 0) {
    return c.json({ data: existing.results });
  }

  // First visit — auto-create a standalone default project
  const participantRow = await c.env.DB
    .prepare('SELECT name FROM participants WHERE id = ?')
    .bind(user.id).first<{ name: string }>();
  const participantName = participantRow?.name ?? 'My';

  const id = randomId('epr_');
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO esums_projects
      (id, participant_id, name, description, project_type, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, user.id,
    `${participantName} — Default Project`,
    'Auto-created standalone project. Rename or link to an IPP project in Settings.',
    'standalone',
    now, now,
  ).run();

  const created = await c.env.DB.prepare(`
    SELECT ep.*, NULL AS ipp_project_name, NULL AS ipp_technology,
           NULL AS ipp_capacity_mw, NULL AS ipp_status
    FROM esums_projects ep
    WHERE ep.id = ?
  `).bind(id).first();

  return c.json({ data: [created], auto_created: true });
});

// ─── POST / — create ──────────────────────────────────────────────────────────

ep.post('/', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json<Record<string, unknown>>();

  if (!b.name || typeof b.name !== 'string' || !b.name.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'name is required', 400);
  }

  const projectType = (b.project_type as string) ?? 'standalone';
  if (!['ipp', 'standalone'].includes(projectType)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "project_type must be 'ipp' or 'standalone'", 400);
  }

  // If ipp, ipp_project_id is required and must belong to this participant
  let ippProjectId: string | null = null;
  if (projectType === 'ipp') {
    if (!b.ipp_project_id || typeof b.ipp_project_id !== 'string') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'ipp_project_id is required when project_type is ipp', 400);
    }
    const ipp = await c.env.DB
      .prepare('SELECT id FROM ipp_projects WHERE id = ? AND developer_id = ?')
      .bind(b.ipp_project_id, user.id).first();
    if (!ipp) {
      throw new AppError(ErrorCode.NOT_FOUND, 'IPP project not found or not owned by this participant', 404);
    }
    ippProjectId = b.ipp_project_id as string;
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
        (id, participant_id, name, description, project_type, ipp_project_id, shard_key, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      id, user.id,
      b.name as string,
      (b.description as string) || null,
      projectType,
      ippProjectId,
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

  const row = await c.env.DB.prepare(`
    SELECT ep.*, ip.project_name AS ipp_project_name
    FROM esums_projects ep
    LEFT JOIN ipp_projects ip ON ip.id = ep.ipp_project_id
    WHERE ep.id = ?
  `).bind(id).first();
  return c.json({ data: row }, 201);
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

ep.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB.prepare(`
    SELECT ep.*, ip.project_name AS ipp_project_name,
           ip.technology AS ipp_technology, ip.capacity_mw AS ipp_capacity_mw,
           ip.status AS ipp_status, ip.location AS ipp_location
    FROM esums_projects ep
    LEFT JOIN ipp_projects ip ON ip.id = ep.ipp_project_id
    WHERE ep.id = ? AND ep.participant_id = ?
  `).bind(id, user.id).first();
  if (!project) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);

  const sites = await c.env.DB.prepare(`
    SELECT s.id, s.name, s.site_type, s.installed_capacity_kw,
           s.location_province, s.status, s.last_seen_at,
           (SELECT COUNT(*) FROM om_devices WHERE site_id = s.id) AS device_count
    FROM om_sites s
    WHERE s.project_id = ?
    ORDER BY s.created_at DESC
  `).bind(id).all();

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

  // Allow changing project_type; validate ipp_project_id when switching to ipp
  const newType = (b.project_type as string) ?? existing.project_type;
  if (!['ipp', 'standalone'].includes(newType)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "project_type must be 'ipp' or 'standalone'", 400);
  }

  let ippProjectId = b.ipp_project_id !== undefined ? b.ipp_project_id : existing.ipp_project_id;
  if (newType === 'ipp' && !ippProjectId) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'ipp_project_id is required when project_type is ipp', 400);
  }
  if (newType === 'standalone') ippProjectId = null;

  if (ippProjectId) {
    const ipp = await c.env.DB
      .prepare('SELECT id FROM ipp_projects WHERE id = ? AND developer_id = ?')
      .bind(ippProjectId, user.id).first();
    if (!ipp) throw new AppError(ErrorCode.NOT_FOUND, 'IPP project not found or not owned by this participant', 404);
  }

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
      SET name = ?, description = ?, project_type = ?, ipp_project_id = ?,
          shard_key = ?, status = ?, updated_at = ?
      WHERE id = ? AND participant_id = ?
    `).bind(
      b.name ?? existing.name,
      b.description !== undefined ? b.description : existing.description,
      newType,
      ippProjectId ?? null,
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

  const updated = await c.env.DB.prepare(`
    SELECT ep.*, ip.project_name AS ipp_project_name
    FROM esums_projects ep
    LEFT JOIN ipp_projects ip ON ip.id = ep.ipp_project_id
    WHERE ep.id = ?
  `).bind(id).first();
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
