// ═══════════════════════════════════════════════════════════════════════════
// Data tier management routes:
//   • POST /metering/rollup-day      — maintain metering_readings_daily
//   • POST /metering/archive-month   — push a month of readings to R2
//   • POST /audit/archive-day        — push a day of audit_logs to R2
//   • POST /ona/rollup-day           — maintain ona_forecast_summary
//   • GET  /snapshot                 — latest data-tier size metrics
//   • POST /snapshot                 — capture a new snapshot
//
// All admin-only. Intended to be called by a scheduled cron worker.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { auditArchiveKey, dayBucket, meteringArchiveKey, monthBucket } from '../utils/data-tier';
import { invalidateTenantRules } from '../middleware/tenant-quota';

const dt = new Hono<HonoEnv>();
dt.use('*', authMiddleware);

function requireAdmin(role: string): boolean { return role === 'admin'; }
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── metering_readings → metering_readings_daily ───────────────────────────
dt.post('/metering/rollup-day', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const day = (b.day as string) || new Date().toISOString().slice(0, 10);

  const rs = await c.env.DB.prepare(
    `SELECT connection_id,
            SUM(export_kwh) AS exp_kwh,
            SUM(import_kwh) AS imp_kwh,
            MAX(peak_demand_kw) AS pk,
            AVG(power_factor) AS pf,
            COUNT(*) AS n,
            SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) AS v
       FROM metering_readings
      WHERE reading_date LIKE ? || '%'
      GROUP BY connection_id`,
  ).bind(day).all<{
    connection_id: string; exp_kwh: number; imp_kwh: number;
    pk: number | null; pf: number | null; n: number; v: number;
  }>();

  let rolled = 0;
  for (const r of rs.results || []) {
    const id = genId('mrd');
    const mb = monthBucket(day);
    await c.env.DB.prepare(
      `INSERT INTO metering_readings_daily
         (id, connection_id, reading_day, month_bucket, total_export_kwh, total_import_kwh,
          max_peak_demand_kw, avg_power_factor, reading_count, validated_count, last_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(connection_id, reading_day) DO UPDATE SET
         total_export_kwh = excluded.total_export_kwh,
         total_import_kwh = excluded.total_import_kwh,
         max_peak_demand_kw = excluded.max_peak_demand_kw,
         avg_power_factor = excluded.avg_power_factor,
         reading_count = excluded.reading_count,
         validated_count = excluded.validated_count,
         last_updated_at = datetime('now')`,
    ).bind(
      id, r.connection_id, day, mb, r.exp_kwh, r.imp_kwh,
      r.pk, r.pf, r.n, r.v,
    ).run();
    rolled++;
  }
  return c.json({ success: true, data: { day, connections_rolled: rolled } });
});

dt.post('/metering/archive-month', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const month = (b.month as string) || new Date().toISOString().slice(0, 7);
  const connectionId = b.connection_id as string | undefined;
  const dry = b.dry_run === true;

  const where = connectionId
    ? `reading_date LIKE ? || '%' AND connection_id = ?`
    : `reading_date LIKE ? || '%'`;
  const binds: unknown[] = connectionId ? [month, connectionId] : [month];

  // Fetch the raw data for the month. If too large, caller must chunk by
  // connection_id. Workers will time out on very large pulls.
  const raw = await c.env.DB.prepare(
    `SELECT * FROM metering_readings WHERE ${where} LIMIT 50000`,
  ).bind(...binds).all();
  const rows = raw.results || [];
  if (rows.length === 0) {
    return c.json({ success: true, data: { month, archived_rows: 0 } });
  }

  const key = meteringArchiveKey(connectionId || 'all', month);
  const payload = JSON.stringify({ month, connection_id: connectionId || null, rows });
  const bytes = new TextEncoder().encode(payload).byteLength;

  if (!dry) {
    if (c.env.R2?.put) {
      await c.env.R2.put(key, payload);
    }
    await c.env.DB.prepare(
      `INSERT INTO metering_readings_archives
         (id, connection_id, month_bucket, r2_key, row_count, bytes_compressed)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(genId('mra'), connectionId || 'all', month, key, rows.length, bytes).run();
    // Delete archived rows — safe because we just wrote to R2.
    await c.env.DB.prepare(
      `DELETE FROM metering_readings WHERE ${where}`,
    ).bind(...binds).run();
  }

  return c.json({
    success: true,
    data: { month, connection_id: connectionId || null, archived_rows: rows.length, r2_key: key, dry_run: dry },
  });
});

// ─── audit_logs → R2 ───────────────────────────────────────────────────────
dt.post('/audit/archive-day', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const day = (b.day as string) || '';
  if (!day) return c.json({ success: false, error: 'day (YYYY-MM-DD) is required' }, 400);

  const rs = await c.env.DB.prepare(
    `SELECT * FROM audit_logs WHERE created_at LIKE ? || '%' ORDER BY created_at ASC LIMIT 50000`,
  ).bind(day).all();
  const rows = rs.results || [];
  if (rows.length === 0) {
    return c.json({ success: true, data: { day, archived_rows: 0 } });
  }

  const key = auditArchiveKey(dayBucket(day));
  const payload = JSON.stringify({ day, rows });
  const bytes = new TextEncoder().encode(payload).byteLength;

  if (c.env.R2?.put) {
    await c.env.R2.put(key, payload);
  }
  const earliest = (rows[0] as Record<string, unknown>).created_at as string | undefined;
  const latest = (rows[rows.length - 1] as Record<string, unknown>).created_at as string | undefined;
  await c.env.DB.prepare(
    `INSERT INTO audit_log_archives
       (id, day_bucket, r2_key, row_count, bytes_compressed, earliest_created_at, latest_created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId('ala'), day, key, rows.length, bytes,
    earliest || null, latest || null,
  ).run();
  await c.env.DB.prepare(
    `DELETE FROM audit_logs WHERE created_at LIKE ? || '%'`,
  ).bind(day).run();

  return c.json({ success: true, data: { day, archived_rows: rows.length, r2_key: key } });
});

// ─── ONA forecasts → summary ───────────────────────────────────────────────
dt.post('/ona/rollup-day', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const day = (b.day as string) || new Date().toISOString().slice(0, 10);

  const rs = await c.env.DB.prepare(
    `SELECT site_id,
            MAX(CASE WHEN forecast_type = 'day_ahead' THEN generation_mwh END) AS da,
            MAX(CASE WHEN forecast_type = 'intra_day' THEN generation_mwh END) AS id,
            MAX(CASE WHEN forecast_type = 'weekly'    THEN generation_mwh END) AS wk
       FROM ona_forecasts
      WHERE forecast_date = ?
      GROUP BY site_id`,
  ).bind(day).all<{ site_id: string; da: number | null; id: number | null; wk: number | null }>();

  let updated = 0;
  for (const r of rs.results || []) {
    const actualRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(actual_mwh), 0) AS actual_mwh
         FROM ona_nominations WHERE site_id = ? AND nomination_date = ?`,
    ).bind(r.site_id, day).first<{ actual_mwh: number }>();
    const actual = actualRow?.actual_mwh || 0;
    const da = r.da || 0;
    const variance = da ? ((actual - da) / da) * 100 : null;
    await c.env.DB.prepare(
      `INSERT INTO ona_forecast_summary
         (id, site_id, forecast_day, day_ahead_mwh, intra_day_mwh, weekly_mwh, actual_mwh, variance_pct, last_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, forecast_day) DO UPDATE SET
         day_ahead_mwh = excluded.day_ahead_mwh,
         intra_day_mwh = excluded.intra_day_mwh,
         weekly_mwh = excluded.weekly_mwh,
         actual_mwh = excluded.actual_mwh,
         variance_pct = excluded.variance_pct,
         last_updated_at = datetime('now')`,
    ).bind(genId('ofs'), r.site_id, day, r.da, r.id, r.wk, actual, variance).run();
    updated++;
  }
  return c.json({ success: true, data: { day, sites_updated: updated } });
});

// ─── Snapshots ─────────────────────────────────────────────────────────────
dt.post('/snapshot', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const [mrCount, alCount, ofCount, arRows, arBytes] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM metering_readings').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM audit_logs').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM ona_forecasts').first<{ n: number }>(),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM metering_readings_archives',
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      'SELECT COALESCE(SUM(bytes_compressed), 0) AS b FROM metering_readings_archives',
    ).first<{ b: number }>(),
  ]);
  const id = genId('dts');
  await c.env.DB.prepare(
    `INSERT INTO data_tier_snapshots
       (id, metering_rows, audit_log_rows, ona_forecast_rows, archives_rows, archives_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, mrCount?.n || 0, alCount?.n || 0, ofCount?.n || 0,
    arRows?.n || 0, arBytes?.b || 0,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM data_tier_snapshots WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

dt.get('/snapshot', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const row = await c.env.DB.prepare(
    'SELECT * FROM data_tier_snapshots ORDER BY snapshot_at DESC LIMIT 1',
  ).first();
  return c.json({ success: true, data: row });
});

// ─── Tenant quotas ─────────────────────────────────────────────────────────
dt.post('/tenant-quotas', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['tenant_id', 'route_prefix', 'window_seconds', 'max_requests']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO tenant_rate_limits
       (tenant_id, route_prefix, window_seconds, max_requests, burst_capacity, updated_at)
     VALUES (?, ?, ?, ?, COALESCE(?, 0), datetime('now'))`,
  ).bind(
    b.tenant_id, b.route_prefix, Number(b.window_seconds), Number(b.max_requests),
    b.burst_capacity == null ? null : Number(b.burst_capacity),
  ).run();
  // Bust the cache so the new rule applies on the next request.
  c.executionCtx?.waitUntil?.(invalidateTenantRules(c.env, String(b.tenant_id)));
  return c.json({ success: true });
});

dt.get('/tenant-quotas', async (c) => {
  const tenantId = c.req.query('tenant_id');
  const rs = tenantId
    ? await c.env.DB.prepare(
        `SELECT * FROM tenant_rate_limits WHERE tenant_id = ? ORDER BY route_prefix`,
      ).bind(tenantId).all()
    : await c.env.DB.prepare(
        `SELECT * FROM tenant_rate_limits ORDER BY tenant_id, route_prefix LIMIT 500`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

export default dt;
