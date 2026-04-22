// Grid Routes — connections, wheeling, constraints, imbalance.
// Schema reference (001_core.sql + 002_domain.sql):
//   grid_connections(id, project_id, connection_point, voltage_kv, export_capacity_mw, ...)
//   grid_wheeling_agreements(id, host_participant_id, wheeling_participant_id, ...)
//   grid_constraints(id, constraint_type, location, severity, ...)
//   grid_imbalance(id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh, ...)
// Original stub joined on non-existent columns (generator_id/offtaker_id,
// project_id on metering_readings) — rewritten against real schema.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const grid = new Hono<HonoEnv>();
grid.use('*', authMiddleware);

function isOperator(role: string) {
  return role === 'admin' || role === 'grid_operator' || role === 'regulator';
}

// ---------- CONNECTIONS ----------
grid.get('/connections', async (c) => {
  const user = getCurrentUser(c);
  const rows = isOperator(user.role)
    ? await c.env.DB.prepare(`
        SELECT gc.*, ip.project_name, ip.developer_id
        FROM grid_connections gc
        LEFT JOIN ipp_projects ip ON gc.project_id = ip.id
        ORDER BY gc.created_at DESC LIMIT 200
      `).all()
    : await c.env.DB.prepare(`
        SELECT gc.*, ip.project_name, ip.developer_id
        FROM grid_connections gc
        JOIN ipp_projects ip ON gc.project_id = ip.id
        WHERE ip.developer_id = ?
        ORDER BY gc.created_at DESC LIMIT 200
      `).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

grid.post('/connections', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { project_id, connection_point, voltage_kv, export_capacity_mw, import_capacity_mw, meter_id } = body as Record<string, any>;
  if (!project_id || !connection_point) {
    return c.json({ success: false, error: 'project_id and connection_point are required' }, 400);
  }
  const project = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(project_id).first() as { developer_id?: string } | null;
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);
  if (!isOperator(user.role) && project.developer_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized for this project' }, 403);
  }
  const id = 'gc_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO grid_connections (id, project_id, connection_point, voltage_kv, export_capacity_mw, import_capacity_mw, meter_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(id, project_id, connection_point, Number(voltage_kv || 0), Number(export_capacity_mw || 0), Number(import_capacity_mw || 0), meter_id || null, new Date().toISOString()).run();

  await fireCascade({
    event: 'grid.connection_created',
    actor_id: user.id,
    entity_type: 'grid_connections',
    entity_id: id,
    data: { project_id, connection_point },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

grid.post('/connections/:id/commission', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators or admins may commission connections' }, 403);
  }
  const row = await c.env.DB.prepare('SELECT id, status FROM grid_connections WHERE id = ?').bind(id).first() as { id?: string; status?: string } | null;
  if (!row) return c.json({ success: false, error: 'Connection not found' }, 404);
  await c.env.DB.prepare('UPDATE grid_connections SET status = \'active\', connected_date = ? WHERE id = ?').bind(new Date().toISOString().split('T')[0], id).run();
  return c.json({ success: true, data: { id, status: 'active' } });
});

// ---------- WHEELING AGREEMENTS ----------
grid.get('/wheeling', async (c) => {
  const user = getCurrentUser(c);
  const rows = isOperator(user.role)
    ? await c.env.DB.prepare('SELECT * FROM grid_wheeling_agreements ORDER BY created_at DESC LIMIT 200').all()
    : await c.env.DB.prepare(`
        SELECT * FROM grid_wheeling_agreements
        WHERE host_participant_id = ? OR wheeling_participant_id = ?
        ORDER BY created_at DESC LIMIT 200
      `).bind(user.id, user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

grid.post('/wheeling', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { host_participant_id, wheeling_participant_id, injection_point, offtake_point, capacity_mw, energy_kwh, wheeling_rate_per_kwh, start_date, end_date } = body as Record<string, any>;
  if (!host_participant_id || !wheeling_participant_id || !injection_point || !offtake_point || !start_date || !end_date) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }
  // Caller must be a party or a grid operator/admin
  if (!isOperator(user.role) && user.id !== host_participant_id && user.id !== wheeling_participant_id) {
    return c.json({ success: false, error: 'Must be a party to the wheeling agreement' }, 403);
  }
  const id = 'wa_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO grid_wheeling_agreements (id, host_participant_id, wheeling_participant_id, injection_point, offtake_point, capacity_mw, energy_kwh, wheeling_rate_per_kwh, start_date, end_date, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    id, host_participant_id, wheeling_participant_id, injection_point, offtake_point,
    Number(capacity_mw || 0), Number(energy_kwh || 0), Number(wheeling_rate_per_kwh || 0),
    start_date, end_date, new Date().toISOString(),
  ).run();

  await fireCascade({
    event: 'grid.wheeling_started',
    actor_id: user.id,
    entity_type: 'grid_wheeling_agreements',
    entity_id: id,
    data: { host_participant_id, wheeling_participant_id, capacity_mw },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

grid.post('/wheeling/:id/activate', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators or admins may activate wheeling' }, 403);
  }
  await c.env.DB.prepare('UPDATE grid_wheeling_agreements SET status = \'active\' WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ---------- CONSTRAINTS ----------
grid.get('/constraints', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM grid_constraints
    WHERE status IN ('active','forecast')
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
             created_at DESC
    LIMIT 100
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

grid.post('/constraints', async (c) => {
  const user = getCurrentUser(c);
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators may publish constraints' }, 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { constraint_type, location, severity, available_capacity_mw, start_date, end_date, description } = body as Record<string, any>;
  if (!constraint_type || !location) {
    return c.json({ success: false, error: 'constraint_type and location are required' }, 400);
  }
  if (!['transmission', 'distribution', 'generation', 'demand'].includes(constraint_type)) {
    return c.json({ success: false, error: 'Invalid constraint_type' }, 400);
  }
  const sev = severity && ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium';
  const id = 'gct_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO grid_constraints (id, constraint_type, location, severity, available_capacity_mw, start_date, end_date, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, constraint_type, location, sev, available_capacity_mw != null ? Number(available_capacity_mw) : null, start_date || null, end_date || null, description || null, new Date().toISOString()).run();

  await fireCascade({
    event: 'grid.constraint_active',
    actor_id: user.id,
    entity_type: 'grid_constraints',
    entity_id: id,
    data: { constraint_type, location, severity: sev, description },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

grid.post('/constraints/:id/clear', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators may clear constraints' }, 403);
  }
  await c.env.DB.prepare('UPDATE grid_constraints SET status = \'resolved\', end_date = ? WHERE id = ?').bind(new Date().toISOString().split('T')[0], id).run();
  return c.json({ success: true });
});

// ---------- IMBALANCE ----------
grid.get('/imbalance', async (c) => {
  const user = getCurrentUser(c);
  const rows = isOperator(user.role)
    ? await c.env.DB.prepare(`
        SELECT gi.*, p.name AS participant_name
        FROM grid_imbalance gi LEFT JOIN participants p ON gi.participant_id = p.id
        ORDER BY gi.period_start DESC LIMIT 200
      `).all()
    : await c.env.DB.prepare(`
        SELECT gi.*, p.name AS participant_name
        FROM grid_imbalance gi LEFT JOIN participants p ON gi.participant_id = p.id
        WHERE gi.participant_id = ?
        ORDER BY gi.period_start DESC LIMIT 200
      `).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /grid/imbalance/calculate — grid operator triggers settlement calc for
// a period. Uses a simple tolerance (±3%) * imbalance_rate.
grid.post('/imbalance/calculate', async (c) => {
  const user = getCurrentUser(c);
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators may run imbalance settlement' }, 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { period_start, period_end, participant_id, scheduled_kwh, actual_kwh, imbalance_rate } = body as Record<string, any>;
  if (!period_start || !period_end || !participant_id) {
    return c.json({ success: false, error: 'period_start, period_end, participant_id are required' }, 400);
  }
  const scheduled = Number(scheduled_kwh || 0);
  const actual = Number(actual_kwh || 0);
  const delta = actual - scheduled;
  const rate = Number(imbalance_rate || 0.45);
  const withinTolerance = scheduled > 0 ? Math.abs(delta) / scheduled <= 0.03 : Math.abs(delta) < 10;
  const charge = withinTolerance ? 0 : Math.round(Math.abs(delta) * rate * 100) / 100;
  const id = 'gi_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO grid_imbalance (id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh, imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance, settled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).bind(id, period_start, period_end, participant_id, scheduled, actual, delta, rate, charge, withinTolerance ? 1 : 0, new Date().toISOString()).run();

  await fireCascade({
    event: 'grid.imbalance_calculated',
    actor_id: user.id,
    entity_type: 'grid_imbalance',
    entity_id: id,
    data: { participant_id, imbalance_kwh: delta, imbalance_charge: charge, within_tolerance: withinTolerance },
    env: c.env,
  });
  return c.json({ success: true, data: { id, imbalance_kwh: delta, imbalance_charge: charge, within_tolerance: withinTolerance } }, 201);
});

// PUT /grid/imbalance/:id — grid operator edits a persisted imbalance row.
// Recomputes imbalance_kwh / charge / within_tolerance whenever scheduled /
// actual / rate change so downstream dashboards stay consistent.
grid.put('/imbalance/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators may edit imbalance rows' }, 403);
  }
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT * FROM grid_imbalance WHERE id = ?')
    .bind(id).first() as Record<string, unknown> | null;
  if (!existing) return c.json({ success: false, error: 'Imbalance period not found' }, 404);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const period_start = (body.period_start as string | undefined) ?? (existing.period_start as string);
  const period_end = (body.period_end as string | undefined) ?? (existing.period_end as string);
  const scheduled_kwh = body.scheduled_kwh != null ? Number(body.scheduled_kwh) : Number(existing.scheduled_kwh);
  const actual_kwh = body.actual_kwh != null ? Number(body.actual_kwh) : Number(existing.actual_kwh);
  const imbalance_rate = body.imbalance_rate != null ? Number(body.imbalance_rate) : Number(existing.imbalance_rate);
  const delta = actual_kwh - scheduled_kwh;
  const withinTolerance = Math.abs(delta) / Math.max(1, scheduled_kwh) <= 0.03 ? 1 : 0;
  const charge = withinTolerance ? 0 : Math.abs(delta) * imbalance_rate;
  await c.env.DB.prepare(`
    UPDATE grid_imbalance
       SET period_start = ?, period_end = ?, scheduled_kwh = ?, actual_kwh = ?,
           imbalance_kwh = ?, imbalance_rate = ?, imbalance_charge = ?, within_tolerance = ?
     WHERE id = ?
  `).bind(period_start, period_end, scheduled_kwh, actual_kwh, delta, imbalance_rate, charge, withinTolerance, id).run();
  const out = await c.env.DB.prepare('SELECT * FROM grid_imbalance WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: out });
});

grid.post('/imbalance/:id/settle', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Only grid operators may mark imbalance settled' }, 403);
  }
  await c.env.DB.prepare('UPDATE grid_imbalance SET settled = 1, settled_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return c.json({ success: true });
});

// GET /grid/overview — single dashboard payload for grid operator cockpit.
grid.get('/overview', async (c) => {
  const user = getCurrentUser(c);
  if (!isOperator(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const [connections, constraints, imbalance, wheeling] = await Promise.all([
    c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM grid_connections GROUP BY status').all(),
    c.env.DB.prepare('SELECT severity, COUNT(*) AS n FROM grid_constraints WHERE status = \'active\' GROUP BY severity').all(),
    c.env.DB.prepare(`
      SELECT COUNT(*) AS periods,
             SUM(CASE WHEN within_tolerance = 0 THEN 1 ELSE 0 END) AS out_of_tolerance,
             COALESCE(SUM(imbalance_charge), 0) AS total_charges,
             SUM(CASE WHEN settled = 0 THEN 1 ELSE 0 END) AS unsettled
      FROM grid_imbalance WHERE period_start >= date('now', '-30 days')
    `).first(),
    c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM grid_wheeling_agreements GROUP BY status').all(),
  ]);
  return c.json({
    success: true,
    data: {
      connections_by_status: connections.results || [],
      active_constraints_by_severity: constraints.results || [],
      imbalance_30d: imbalance || { periods: 0, out_of_tolerance: 0, total_charges: 0, unsettled: 0 },
      wheeling_by_status: wheeling.results || [],
    },
  });
});

export default grid;
