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

// ─── National-scale operational snapshots ─────────────────────────────────

// Cascade DLQ — how many items, grouped by stage + event, newest on top.
monitoring.get('/cascade-dlq', async (c) => {
  const status = c.req.query('status') || 'pending';
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);
  const rs = await c.env.DB.prepare(
    `SELECT id, event, entity_type, entity_id, actor_id, stage, error_message,
            attempt_count, status, created_at, last_attempt_at
       FROM cascade_dlq WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
  ).bind(status, limit).all();
  const byStageQ = await c.env.DB.prepare(
    `SELECT stage, COUNT(*) AS n FROM cascade_dlq WHERE status = 'pending' GROUP BY stage`,
  ).all();
  const byEventQ = await c.env.DB.prepare(
    `SELECT event, COUNT(*) AS n FROM cascade_dlq WHERE status = 'pending' GROUP BY event ORDER BY n DESC LIMIT 10`,
  ).all();
  return c.json({
    success: true,
    data: rs.results || [],
    by_stage: byStageQ.results || [],
    by_event_top10: byEventQ.results || [],
  });
});

// Settlement runs — last 20 runs with outcome counts, for operator review.
monitoring.get('/settlement-runs', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, run_type, period_start, period_end, started_at, completed_at,
            status, contracts_considered, invoices_generated, total_value_zar, error_message
       FROM settlement_runs ORDER BY started_at DESC LIMIT 20`,
  ).all();
  const counts = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM settlement_runs
      WHERE started_at >= datetime('now','-30 days') GROUP BY status`,
  ).all();
  const dlq = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM settlement_dlq WHERE status = 'open'`,
  ).first<{ n: number }>();
  return c.json({
    success: true,
    data: rs.results || [],
    status_counts_30d: counts.results || [],
    open_dlq_count: dlq?.n || 0,
  });
});

// Cron-job health — derived from the telemetry the scheduled() handler writes
// via the existing log helper (see src/utils/logger.ts). We surface a
// conservative proxy using the most recent rollup/archive activity in D1.
monitoring.get('/cron-health', async (c) => {
  const mr = await c.env.DB.prepare(
    `SELECT MAX(last_updated_at) AS last_run FROM metering_readings_daily`,
  ).first<{ last_run: string | null }>();
  const ofs = await c.env.DB.prepare(
    `SELECT MAX(last_updated_at) AS last_run FROM ona_forecast_summary`,
  ).first<{ last_run: string | null }>();
  const sr = await c.env.DB.prepare(
    `SELECT MAX(started_at) AS last_run FROM settlement_runs WHERE run_type = 'ppa_energy'`,
  ).first<{ last_run: string | null }>();
  const mc = await c.env.DB.prepare(
    `SELECT MAX(as_of) AS last_run FROM margin_calls`,
  ).first<{ last_run: string | null }>();
  const mp = await c.env.DB.prepare(
    `SELECT MAX(created_at) AS last_run FROM mark_prices WHERE source = 'vwap'`,
  ).first<{ last_run: string | null }>();
  const ti = await c.env.DB.prepare(
    `SELECT MAX(issued_at) AS last_run FROM tenant_invoices`,
  ).first<{ last_run: string | null }>();
  const us = await c.env.DB.prepare(
    `SELECT MAX(snapshot_date) AS last_run FROM tenant_usage_snapshots`,
  ).first<{ last_run: string | null }>();
  const rsa = await c.env.DB.prepare(
    `SELECT MAX(raised_at) AS last_run FROM regulator_surveillance_alerts`,
  ).first<{ last_run: string | null }>();

  return c.json({
    success: true,
    data: [
      { cron: '5 0 * * *',   job: 'metering_daily_rollup', last_run: mr?.last_run },
      { cron: '5 0 * * *',   job: 'ona_daily_rollup',       last_run: ofs?.last_run },
      { cron: '10 0 * * *',  job: 'daily_settlement',       last_run: sr?.last_run },
      { cron: '30 0 * * *',  job: 'margin_call_run',        last_run: mc?.last_run },
      { cron: '0 * * * *',   job: 'mark_price_vwap',        last_run: mp?.last_run },
      { cron: '0 2 1 * *',   job: 'platform_invoice_run',   last_run: ti?.last_run },
      { cron: '30 0 * * *',  job: 'usage_snapshot',         last_run: us?.last_run },
      { cron: '*/15 * * * *',job: 'surveillance_scan',      last_run: rsa?.last_run },
    ],
  });
});

// POPIA PII access log tail — last 50 accesses by role.
monitoring.get('/pii-access', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 500);
  const rs = await c.env.DB.prepare(
    `SELECT l.id, l.actor_id, l.subject_id, l.access_type, l.justification, l.created_at,
            a.email AS actor_email, a.role AS actor_role,
            s.email AS subject_email, s.role AS subject_role
       FROM popia_pii_access_log l
       LEFT JOIN participants a ON a.id = l.actor_id
       LEFT JOIN participants s ON s.id = l.subject_id
      ORDER BY l.created_at DESC LIMIT ?`,
  ).bind(limit).all();
  const byType = await c.env.DB.prepare(
    `SELECT access_type, COUNT(*) AS n FROM popia_pii_access_log
      WHERE created_at >= datetime('now','-7 days') GROUP BY access_type`,
  ).all();
  return c.json({
    success: true,
    data: rs.results || [],
    by_type_7d: byType.results || [],
  });
});

export default monitoring;
