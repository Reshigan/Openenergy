// ═══════════════════════════════════════════════════════════════════════════
// Monitoring Routes — admin + support view of error_log and request_stats.
// ═══════════════════════════════════════════════════════════════════════════
// Surfaces the structured telemetry written by the request logger +
// /api/telemetry/error to the /admin/monitoring UI. Read-only: nothing
// here mutates error_log or request_stats.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const monitoring = new Hono<HonoEnv>();

monitoring.use('*', authMiddleware);
monitoring.use('*', async (c, next) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Admin or support access required' }, 403);
  }
  await next();
});

// Recent error log entries — default last 100, newest first.
monitoring.get('/errors', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);
  const source = c.req.query('source'); // 'server' | 'client' | undefined
  const since = c.req.query('since');   // ISO timestamp, optional

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (source && (source === 'server' || source === 'client')) {
    clauses.push('source = ?');
    binds.push(source);
  }
  if (since) {
    clauses.push('created_at >= ?');
    binds.push(since);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  binds.push(limit);

  const rows = await c.env.DB.prepare(
    `SELECT id, req_id, source, severity, route, method, status,
            participant_id, tenant_id, error_name, error_message,
            user_agent, ip, url, created_at
       FROM error_log
       ${where}
   ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(...binds)
    .all();

  return c.json({ success: true, items: rows.results || [] });
});

// Per-error details — includes stack trace (separate from list for payload size).
monitoring.get('/errors/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT * FROM error_log WHERE id = ? LIMIT 1`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({ success: true, item: row });
});

// Rolled-up request stats for the latest N hours, aggregated per route+status_class.
monitoring.get('/stats', async (c) => {
  const hours = Math.min(parseInt(c.req.query('hours') || '24', 10) || 24, 168);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const byRoute = await c.env.DB.prepare(
    `SELECT route,
            SUM(count)          AS total,
            SUM(latency_ms_sum) AS latency_sum,
            MAX(latency_ms_max) AS latency_max,
            SUM(slow_count)     AS slow,
            SUM(CASE WHEN status_class = '5xx' THEN count ELSE 0 END) AS errors
       FROM request_stats
      WHERE bucket_start >= ?
   GROUP BY route
   ORDER BY total DESC
      LIMIT 100`,
  )
    .bind(since)
    .all();

  const byClass = await c.env.DB.prepare(
    `SELECT status_class,
            SUM(count) AS total,
            SUM(slow_count) AS slow
       FROM request_stats
      WHERE bucket_start >= ?
   GROUP BY status_class`,
  )
    .bind(since)
    .all();

  const totalsRow = await c.env.DB.prepare(
    `SELECT SUM(count) AS total,
            SUM(latency_ms_sum) AS latency_sum,
            SUM(slow_count) AS slow,
            SUM(CASE WHEN status_class = '5xx' THEN count ELSE 0 END) AS errors
       FROM request_stats
      WHERE bucket_start >= ?`,
  )
    .bind(since)
    .first<{ total: number; latency_sum: number; slow: number; errors: number }>();

  return c.json({
    success: true,
    since,
    hours,
    totals: totalsRow || { total: 0, latency_sum: 0, slow: 0, errors: 0 },
    by_route: byRoute.results || [],
    by_status_class: byClass.results || [],
  });
});

// Time-series view — request count + 5xx count per 15-minute bucket.
monitoring.get('/timeseries', async (c) => {
  const hours = Math.min(parseInt(c.req.query('hours') || '24', 10) || 24, 168);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const rows = await c.env.DB.prepare(
    `SELECT bucket_start,
            SUM(count) AS total,
            SUM(CASE WHEN status_class = '5xx' THEN count ELSE 0 END) AS errors,
            SUM(latency_ms_sum) AS latency_sum,
            SUM(slow_count) AS slow
       FROM request_stats
      WHERE bucket_start >= ?
   GROUP BY bucket_start
   ORDER BY bucket_start ASC`,
  )
    .bind(since)
    .all();

  return c.json({ success: true, buckets: rows.results || [] });
});

export default monitoring;
