// Metering Routes — meter readings against grid_connections.
// Schema (001_core.sql): metering_readings(id, connection_id, reading_date,
// export_kwh, import_kwh, peak_demand_kw, power_factor, reading_type,
// validated, validated_by, validated_at, ona_ingested, notes).
// Original stub joined on `project_id` which does not exist — this route
// scopes by connection → project ownership instead.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const metering = new Hono<HonoEnv>();
metering.use('*', authMiddleware);

// GET /metering/readings — readings visible to caller.
// IPP developer: only readings for connections on projects they own.
// Grid operator / admin / regulator: all readings.
metering.get('/readings', async (c) => {
  const user = getCurrentUser(c);
  const connectionId = c.req.query('connection_id');
  const validated = c.req.query('validated');
  const limit = Math.min(Number(c.req.query('limit') || '100'), 500);
  const privileged = user.role === 'admin' || user.role === 'regulator' || user.role === 'grid_operator';

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (!privileged) {
    filters.push('ip.developer_id = ?');
    bindings.push(user.id);
  }
  if (connectionId) {
    filters.push('mr.connection_id = ?');
    bindings.push(connectionId);
  }
  if (validated === '0' || validated === '1') {
    filters.push('mr.validated = ?');
    bindings.push(Number(validated));
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  bindings.push(limit);

  const readings = await c.env.DB.prepare(`
    SELECT mr.*, gc.connection_point, gc.voltage_kv, ip.project_name, ip.id AS project_id
    FROM metering_readings mr
    JOIN grid_connections gc ON mr.connection_id = gc.id
    LEFT JOIN ipp_projects ip ON gc.project_id = ip.id
    ${whereClause}
    ORDER BY mr.reading_date DESC LIMIT ?
  `).bind(...bindings).all();
  return c.json({ success: true, data: readings.results || [] });
});

// POST /metering/readings — record a meter reading (IPP-owned connection or
// grid operator). Fires meter.ingested cascade.
metering.post('/readings', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { connection_id, reading_date, export_kwh, import_kwh, peak_demand_kw, power_factor, reading_type, notes } = body as {
    connection_id?: string;
    reading_date?: string;
    export_kwh?: number;
    import_kwh?: number;
    peak_demand_kw?: number;
    power_factor?: number;
    reading_type?: string;
    notes?: string;
  };
  if (!connection_id || !reading_date) {
    return c.json({ success: false, error: 'connection_id and reading_date are required' }, 400);
  }
  const type = reading_type && ['actual', 'estimated', 'adjusted'].includes(reading_type) ? reading_type : 'actual';

  const conn = await c.env.DB.prepare(
    'SELECT gc.id, gc.project_id, ip.developer_id, ip.project_name FROM grid_connections gc LEFT JOIN ipp_projects ip ON gc.project_id = ip.id WHERE gc.id = ?'
  ).bind(connection_id).first() as { id?: string; project_id?: string; developer_id?: string; project_name?: string } | null;
  if (!conn) return c.json({ success: false, error: 'Connection not found' }, 404);
  const privileged = user.role === 'admin' || user.role === 'grid_operator';
  if (!privileged && conn.developer_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized for this connection' }, 403);
  }

  const id = 'mr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO metering_readings (id, connection_id, reading_date, export_kwh, import_kwh, peak_demand_kw, power_factor, reading_type, validated, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(
    id,
    connection_id,
    reading_date,
    Number(export_kwh || 0),
    Number(import_kwh || 0),
    peak_demand_kw != null ? Number(peak_demand_kw) : null,
    power_factor != null ? Number(power_factor) : null,
    type,
    notes || null,
    new Date().toISOString(),
  ).run();

  await fireCascade({
    event: 'meter.ingested',
    actor_id: user.id,
    entity_type: 'metering_readings',
    entity_id: id,
    data: { connection_id, project_id: conn.project_id, reading_date, export_kwh: Number(export_kwh || 0) },
    env: c.env,
  });

  return c.json({ success: true, data: { id, validated: false } }, 201);
});

// POST /metering/readings/:id/validate — grid operator marks a reading
// validated. Tolerates missing values (IPP SCADA may push incomplete rows).
metering.post('/readings/:id/validate', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  if (user.role !== 'grid_operator' && user.role !== 'admin') {
    return c.json({ success: false, error: 'Only grid operators may validate readings' }, 403);
  }
  const row = await c.env.DB.prepare('SELECT id, validated FROM metering_readings WHERE id = ?').bind(id).first() as { id?: string; validated?: number } | null;
  if (!row) return c.json({ success: false, error: 'Reading not found' }, 404);
  if (row.validated === 1) return c.json({ success: false, error: 'Reading already validated' }, 400);
  await c.env.DB.prepare('UPDATE metering_readings SET validated = 1, validated_by = ?, validated_at = ? WHERE id = ?').bind(user.id, new Date().toISOString(), id).run();
  return c.json({ success: true, data: { id, validated: true } });
});

// GET /metering/summary — aggregates export / import by connection for the
// caller over a period (default 30 days).
metering.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  const days = Math.min(Math.max(Number(c.req.query('days') || '30'), 1), 365);
  const privileged = user.role === 'admin' || user.role === 'regulator' || user.role === 'grid_operator';
  const scopeFilter = privileged ? '' : 'AND ip.developer_id = ?';
  const bindings = privileged ? [days] : [days, user.id];

  const rows = await c.env.DB.prepare(`
    SELECT ip.project_name, ip.id AS project_id, gc.id AS connection_id, gc.connection_point,
           COUNT(*) AS readings,
           COALESCE(SUM(mr.export_kwh), 0) AS export_kwh_sum,
           COALESCE(SUM(mr.import_kwh), 0) AS import_kwh_sum,
           COALESCE(MAX(mr.peak_demand_kw), 0) AS peak_demand_kw
    FROM metering_readings mr
    JOIN grid_connections gc ON mr.connection_id = gc.id
    LEFT JOIN ipp_projects ip ON gc.project_id = ip.id
    WHERE julianday('now') - julianday(mr.reading_date) <= ? ${scopeFilter}
    GROUP BY gc.id ORDER BY export_kwh_sum DESC LIMIT 50
  `).bind(...bindings).all();
  return c.json({ success: true, data: { days, connections: rows.results || [] } });
});

export default metering;
