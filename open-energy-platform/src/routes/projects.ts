// ═══════════════════════════════════════════════════════════════════════════
// Projects Routes — IPP Project CRUD operations
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const projects = new Hono<HonoEnv>();

// Apply auth middleware to all routes
projects.use('*', authMiddleware);

// GET /projects — List projects for user
projects.get('/', async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT p.*, dev.name as developer_name
    FROM ipp_projects p
    LEFT JOIN participants dev ON p.developer_id = dev.id
    WHERE p.developer_id = ?
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `;
  const params = [user.id, pageSize, offset];

  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results || [],
    pagination: {
      page,
      pageSize,
      total: result.results?.length || 0,
      totalPages: 1,
    },
  });
});

// GET /projects/:id — Get single project
projects.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB.prepare(`
    SELECT p.*, dev.name as developer_name
    FROM ipp_projects p
    LEFT JOIN participants dev ON p.developer_id = dev.id
    WHERE p.id = ? AND p.developer_id = ?
  `).bind(id, user.id).first();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  return c.json({ success: true, data: project });
});

// POST /projects — Create new project
projects.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const { project_name, structure_type, technology, capacity_mw, location, grid_connection_point, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years, construction_start_date, commercial_operation_date } = body;

  if (!project_name || !structure_type || !technology || !capacity_mw || !location) {
    return c.json({ success: false, error: 'Missing required fields: project_name, structure_type, technology, capacity_mw, location' }, 400);
  }

  const projectId = 'ip_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  await c.env.DB.prepare(`
    INSERT INTO ipp_projects (
      id, project_name, developer_id, structure_type, technology, capacity_mw, location,
      grid_connection_point, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years,
      construction_start_date, commercial_operation_date, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'development', ?)
  `).bind(
    projectId, project_name, user.id, structure_type, technology, capacity_mw, location,
    grid_connection_point || null, ppa_volume_mwh || null, ppa_price_per_mwh || null, ppa_duration_years || null,
    construction_start_date || null, commercial_operation_date || null, new Date().toISOString()
  ).run();

  const project = await c.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(projectId).first();
  return c.json({ success: true, data: project }, 201);
});

// PUT /projects/:id — Update project
projects.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }
  if (existing.developer_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to update this project' }, 403);
  }

  const { project_name, structure_type, technology, capacity_mw, status, location } = body;

  await c.env.DB.prepare(`
    UPDATE ipp_projects SET
      project_name = COALESCE(?, project_name),
      structure_type = COALESCE(?, structure_type),
      technology = COALESCE(?, technology),
      capacity_mw = COALESCE(?, capacity_mw),
      status = COALESCE(?, status),
      location = COALESCE(?, location),
      updated_at = ?
    WHERE id = ?
  `).bind(project_name, structure_type, technology, capacity_mw, status, location, new Date().toISOString(), id).run();

  const project = await c.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: project });
});

// DELETE /projects/:id — Delete project
projects.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }
  if (existing.developer_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to delete this project' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM ipp_projects WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { message: 'Project deleted' } });
});

export default projects;
