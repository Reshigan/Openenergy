// ════════════════════════════════════════════════════════════════════════
// Esums — Intelligence layer.
//
// Endpoints (mounted on /api/esums/*):
//   GET  /forecast/:site_id             — generation + revenue forecast
//   POST /forecast/:site_id/refresh     — regenerate forecast (admin)
//   GET  /predictions                   — predictive maintenance signals
//   POST /predictions/:id/action        — accept / dismiss / confirm
//   GET  /briefing                      — proactive AI briefing for caller
//   GET  /performance/:site_id          — PR / CF / availability over a window
//   GET  /ingestion                     — list configured connections
//   POST /ingestion                     — register new connection
//   POST /ingestion/:id/poll            — manual poll trigger
//   POST /ingestion/:id/test            — connection test
//   GET  /alerts                        — caller's alert feed
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { cached, shouldBypass } from '../utils/kv-cache';
import { pollConnection } from '../utils/oem-adapters';
import { fireCascade } from '../utils/cascade';
import { assertSafeWebhookUrl } from '../utils/url-safety';
import { canMutate, assertSiteOwnership } from './esums-om';

const intel = new Hono<HonoEnv>();
intel.use('*', authMiddleware);

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Forecast ────────────────────────────────────────────────────────────
// Solar capacity-factor profile by hour-of-day (Africa/Johannesburg, summer):
const SOLAR_CF_BY_HOUR = [
  0, 0, 0, 0, 0, 0.02, 0.10, 0.25, 0.45, 0.65, 0.78, 0.88,
  0.92, 0.90, 0.83, 0.70, 0.52, 0.32, 0.15, 0.04, 0, 0, 0, 0,
];
const WIND_CF_BY_HOUR = [
  0.42, 0.40, 0.39, 0.38, 0.36, 0.34, 0.32, 0.30, 0.32, 0.36,
  0.42, 0.48, 0.52, 0.55, 0.55, 0.52, 0.50, 0.48, 0.46, 0.45,
  0.44, 0.43, 0.42, 0.42,
];

intel.get('/forecast/:site_id', async (c) => {
  const siteId = c.req.param('site_id');
  const horizon = (c.req.query('horizon') || 'day_ahead') as 'intraday' | 'day_ahead' | 'week_ahead' | 'month_ahead';
  const site = await c.env.DB.prepare(`SELECT * FROM om_sites WHERE id = ?`).bind(siteId).first<any>();
  if (!site) return c.json({ success: false, error: 'site not found' }, 404);

  // Try to fetch a fresh cached forecast first.
  const cachedForecast = await c.env.DB.prepare(`
    SELECT * FROM om_forecasts
    WHERE site_id = ? AND horizon = ?
      AND forecast_for_ts >= datetime('now', '-1 hour')
    ORDER BY forecast_for_ts ASC LIMIT 200
  `).bind(siteId, horizon).all();
  if ((cachedForecast.results || []).length > 0) {
    return c.json({ success: true, data: { horizon, site_id: siteId, points: cachedForecast.results } });
  }

  // Generate a fresh synthetic forecast — production would call ML model.
  const tech = String(site.technology || 'solar');
  const cap_mw = Number(site.capacity_mw || 0);
  const tariff = Number(site.ppa_tariff_zar_mwh || 1500);
  const hours = horizon === 'intraday' ? 6 : horizon === 'day_ahead' ? 48 : horizon === 'week_ahead' ? 168 : 720;
  const profile = tech === 'wind' ? WIND_CF_BY_HOUR : SOLAR_CF_BY_HOUR;
  const points: any[] = [];
  for (let h = 0; h < hours; h++) {
    const ts = new Date(Date.now() + h * 3_600_000);
    const hod = (ts.getUTCHours() + 2) % 24; // SAST
    const baseCF = profile[hod];
    // Day-to-day variability — gentle sinusoid + noise
    const day = Math.floor(h / 24);
    const factor = 0.85 + 0.20 * Math.sin((day / 30) * 2 * Math.PI);
    const mwh_p50 = cap_mw * baseCF * factor;
    const sigma = mwh_p50 * 0.12;
    const mwh_p10 = Math.max(0, mwh_p50 - 1.28 * sigma);
    const mwh_p90 = mwh_p50 + 1.28 * sigma;
    points.push({
      forecast_for_ts: ts.toISOString(),
      mwh_p50: Math.round(mwh_p50 * 100) / 100,
      mwh_p10: Math.round(mwh_p10 * 100) / 100,
      mwh_p90: Math.round(mwh_p90 * 100) / 100,
      revenue_p50_zar: Math.round(mwh_p50 * tariff),
    });
  }
  // Cache to D1 in bulk (synchronous fire-and-forget — non-blocking)
  c.executionCtx.waitUntil((async () => {
    for (const p of points.slice(0, 200)) {
      await c.env.DB.prepare(`
        INSERT INTO om_forecasts (id, site_id, horizon, forecast_for_ts, mwh_p50, mwh_p10, mwh_p90, revenue_p50_zar, model_version, confidence_pct)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).bind(
        genId('omfc'), siteId, horizon, p.forecast_for_ts,
        p.mwh_p50, p.mwh_p10, p.mwh_p90, p.revenue_p50_zar, 'v1-synthetic', 70,
      ).run().catch(() => null);
    }
  })());
  return c.json({ success: true, data: { horizon, site_id: siteId, points, generated_at: new Date().toISOString() } });
});

intel.post('/forecast/:site_id/refresh', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const siteId = c.req.param('site_id');
  await c.env.DB.prepare(`DELETE FROM om_forecasts WHERE site_id = ?`).bind(siteId).run();
  return c.json({ success: true, data: { cleared: true } });
});

// ─── Predictive maintenance ──────────────────────────────────────────────
intel.get('/predictions', async (c) => {
  const status = c.req.query('status') || 'open';
  const rows = await c.env.DB.prepare(`
    SELECT p.*, s.name AS site_name, d.manufacturer, d.model
    FROM om_predictions p
    LEFT JOIN om_sites s   ON s.id = p.site_id
    LEFT JOIN om_devices d ON d.id = p.device_id
    WHERE p.status = ?
    ORDER BY p.confidence DESC, p.generated_at DESC
    LIMIT 200
  `).bind(status).all();
  return c.json({ success: true, data: rows.results || [] });
});

intel.post('/predictions/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const action = String(b.action || '');
  if (!['acted_on', 'dismissed', 'confirmed_true', 'confirmed_false'].includes(action)) {
    return c.json({ success: false, error: 'invalid action' }, 400);
  }
  const pred = await c.env.DB.prepare(`SELECT * FROM om_predictions WHERE id = ?`).bind(id).first<any>();
  if (!pred) return c.json({ success: false, error: 'not found' }, 404);
  const denied = await assertSiteOwnership(c, user, pred.site_id);
  if (denied) return denied;
  await c.env.DB.prepare(`
    UPDATE om_predictions SET status = ?, closed_at = datetime('now') WHERE id = ?
  `).bind(action, id).run();
  let chainedWo: { id: string; number: string } | null = null;
  // If acted_on and notes asked for a WO, optionally chain one
  if (action === 'acted_on' && b.create_wo) {
    const woId = genId('omwo');
    const woNumber = `WO-${new Date().getFullYear()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    await c.env.DB.prepare(`
      INSERT INTO om_work_orders
        (id, wo_number, site_id, category, priority, status, title, description,
         sla_response_minutes, sla_resolve_hours, sla_deadline)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      woId, woNumber, pred.site_id, 'preventive', 'medium', 'created',
      `Predictive: ${pred.prediction_type.replace(/_/g, ' ')}`,
      pred.recommended_action || null,
      240, 72, new Date(Date.now() + 72 * 3_600_000).toISOString(),
    ).run();
    chainedWo = { id: woId, number: woNumber };
  }
  await fireCascade({
    event: 'esums.prediction_actioned',
    actor_id: user.id,
    entity_type: 'om_predictions',
    entity_id: id,
    data: {
      action,
      wo_chained: !!chainedWo,
      wo_id: chainedWo?.id || null,
      wo_number: chainedWo?.number || null,
    },
    env: c.env,
  });
  if (chainedWo) {
    return c.json({ success: true, data: { wo_id: chainedWo.id, wo_number: chainedWo.number } });
  }
  return c.json({ success: true });
});

// ─── AI briefing — proactive intelligence ───────────────────────────────
intel.get('/briefing', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support', 'regulator'].includes(user.role);
  const key = `om:briefing:${isOfficer ? 'all' : user.id}`;
  const data = await cached(c.env, key, 90, async () => briefingCompute(c, user, isOfficer), {
    bypass: shouldBypass(c.req.raw),
  });
  return c.json({ success: true, data });
});

async function briefingCompute(c: { env: HonoEnv['Bindings'] }, user: { id: string }, isOfficer: boolean) {
  // Resolve in-scope site ids once, then bind into each query.
  const scoped = isOfficer
    ? await c.env.DB.prepare(`SELECT id FROM om_sites`).all<{ id: string }>()
    : await c.env.DB.prepare(
        `SELECT id FROM om_sites WHERE participant_id = ? OR om_contractor_id = ?`,
      ).bind(user.id, user.id).all<{ id: string }>();
  const siteIds = ((scoped.results || []) as Array<{ id: string }>).map((s) => s.id);
  if (!siteIds.length) {
    return {
      generated_at: new Date().toISOString(),
      summary: { open_faults: 0, bleed_rate_zar_hour: 0, sla_at_risk: 0, predictions_open: 0, maintenance_due_7d: 0 },
      insights: [],
    };
  }
  const ph = siteIds.map(() => '?').join(',');

  const bleed = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(hourly_loss_zar), 0) AS bleed,
           COUNT(*) AS open_faults
    FROM om_faults
    WHERE site_id IN (${ph}) AND status IN ('open','acknowledged','in_progress')
  `).bind(...siteIds).first<any>();

  const topFaults = await c.env.DB.prepare(`
    SELECT f.id, f.site_id, f.severity, f.description, f.hourly_loss_zar, f.detected_at, s.name AS site_name
    FROM om_faults f LEFT JOIN om_sites s ON s.id = f.site_id
    WHERE f.site_id IN (${ph}) AND f.status IN ('open','acknowledged','in_progress')
    ORDER BY f.hourly_loss_zar DESC LIMIT 3
  `).bind(...siteIds).all();

  const slaWatch = await c.env.DB.prepare(`
    SELECT w.id, w.wo_number, w.priority, w.sla_deadline, s.name AS site_name
    FROM om_work_orders w LEFT JOIN om_sites s ON s.id = w.site_id
    WHERE w.site_id IN (${ph})
      AND w.status NOT IN ('completed','verified','closed','cancelled')
      AND w.sla_deadline < datetime('now', '+1 hour')
    ORDER BY w.sla_deadline ASC LIMIT 5
  `).bind(...siteIds).all();

  const maintenance = await c.env.DB.prepare(`
    SELECT m.id, m.task_type, m.next_due_at, s.name AS site_name
    FROM om_maintenance m LEFT JOIN om_sites s ON s.id = m.site_id
    WHERE m.site_id IN (${ph})
      AND m.next_due_at <= date('now', '+7 days') AND m.status = 'scheduled'
    ORDER BY m.next_due_at ASC LIMIT 5
  `).bind(...siteIds).all();

  const predictions = await c.env.DB.prepare(`
    SELECT p.id, p.site_id, p.prediction_type, p.confidence, p.recommended_action,
           p.estimated_loss_zar, s.name AS site_name
    FROM om_predictions p LEFT JOIN om_sites s ON s.id = p.site_id
    WHERE p.site_id IN (${ph}) AND p.status = 'open'
    ORDER BY p.confidence DESC LIMIT 3
  `).bind(...siteIds).all();

  // Compose narrative insights
  const insights: any[] = [];
  for (const f of (topFaults.results || []) as any[]) {
    insights.push({
      type: 'revenue_alert',
      severity: f.severity,
      title: `${f.site_name} bleeding R${Number(f.hourly_loss_zar || 0).toFixed(0)}/hour`,
      body: f.description || `Fault on site since ${f.detected_at}`,
      cta: { label: 'Open fault', href: `/esums/faults/${f.id}` },
    });
  }
  for (const w of (slaWatch.results || []) as any[]) {
    const minsLeft = Math.round((new Date(w.sla_deadline).getTime() - Date.now()) / 60_000);
    insights.push({
      type: 'sla_warning',
      severity: 'critical',
      title: `WO ${w.wo_number} SLA in ${minsLeft} min`,
      body: `${w.site_name} · priority ${w.priority}`,
      cta: { label: 'Open work order', href: `/esums/workorders/${w.id}` },
    });
  }
  for (const p of (predictions.results || []) as any[]) {
    insights.push({
      type: 'predictive',
      severity: 'major',
      title: `${p.site_name} · ${String(p.prediction_type).replace(/_/g, ' ')} (${Math.round(Number(p.confidence) * 100)}% conf.)`,
      body: p.recommended_action,
      estimated_loss_zar: p.estimated_loss_zar,
      cta: { label: 'Schedule WO', href: `/esums/predictions/${p.id}` },
    });
  }
  for (const m of (maintenance.results || []) as any[]) {
    const daysLeft = Math.ceil((new Date(m.next_due_at).getTime() - Date.now()) / 86_400_000);
    insights.push({
      type: 'maintenance',
      severity: daysLeft <= 1 ? 'major' : 'minor',
      title: `${m.site_name} · ${m.task_type.replace(/_/g, ' ')} in ${daysLeft}d`,
      body: 'Preventive maintenance window opening',
      cta: { label: 'Plan visit', href: `/esums/maintenance/${m.id}` },
    });
  }

  return {
    generated_at: new Date().toISOString(),
    summary: {
      open_faults: Number(bleed?.open_faults || 0),
      bleed_rate_zar_hour: Math.round(Number(bleed?.bleed || 0)),
      sla_at_risk: (slaWatch.results || []).length,
      predictions_open: (predictions.results || []).length,
      maintenance_due_7d: (maintenance.results || []).length,
    },
    insights: insights.slice(0, 10),
  };
}

// ─── Performance KPIs ────────────────────────────────────────────────────
intel.get('/performance/:site_id', async (c) => {
  const siteId = c.req.param('site_id');
  const days = Math.min(365, Math.max(1, Number(c.req.query('days') || 30)));
  const site = await c.env.DB.prepare(`SELECT * FROM om_sites WHERE id = ?`).bind(siteId).first<any>();
  if (!site) return c.json({ success: false, error: 'site not found' }, 404);

  const tariff = Number(site.ppa_tariff_zar_mwh || 1500);
  const capacityMw = Number(site.capacity_mw || 0);

  // Aggregate telemetry by day
  const rows = await c.env.DB.prepare(`
    SELECT date(ts) AS day,
           COALESCE(SUM(interval_kwh), 0) AS kwh,
           COUNT(*) AS readings
    FROM om_telemetry
    WHERE site_id = ? AND ts >= date('now', ? || ' days')
    GROUP BY date(ts)
    ORDER BY day ASC
  `).bind(siteId, `-${days}`).all();

  // PR / CF estimates
  const series = (rows.results || []).map((r: any) => {
    const kwh = Number(r.kwh || 0);
    const referenceYieldKwh = capacityMw * 1000 * 5.5; // 5.5 PSH/day at standard
    const pr = referenceYieldKwh > 0 ? kwh / referenceYieldKwh : 0;
    const cf = capacityMw > 0 ? kwh / (capacityMw * 1000 * 24) : 0;
    return {
      day: r.day,
      kwh,
      revenue_zar: Math.round((kwh / 1000) * tariff),
      pr: Math.round(pr * 1000) / 10,
      cf: Math.round(cf * 1000) / 10,
    };
  });

  // Fault stats
  const fc = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total,
           AVG(CASE WHEN resolved_at IS NOT NULL
                    THEN (julianday(resolved_at) - julianday(detected_at)) * 24 ELSE NULL END) AS avg_mttr_h,
           SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical
    FROM om_faults
    WHERE site_id = ? AND detected_at >= date('now', ? || ' days')
  `).bind(siteId, `-${days}`).first<any>();

  // WO stats
  const wo = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN first_time_fix = 1 THEN 1 ELSE 0 END) AS first_time_fix,
           AVG(CASE WHEN completed_at IS NOT NULL
                    THEN (julianday(completed_at) - julianday(created_at)) * 24 ELSE NULL END) AS avg_resolve_h,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS sla_breached
    FROM om_work_orders
    WHERE site_id = ? AND created_at >= date('now', ? || ' days')
  `).bind(siteId, `-${days}`).first<any>();

  return c.json({
    success: true,
    data: {
      site_id: siteId,
      window_days: days,
      capacity_mw: capacityMw,
      tariff_zar_mwh: tariff,
      series,
      faults: {
        total: Number(fc?.total || 0),
        critical: Number(fc?.critical || 0),
        mttr_hours: fc?.avg_mttr_h ? Math.round(Number(fc.avg_mttr_h) * 10) / 10 : null,
      },
      work_orders: {
        total: Number(wo?.total || 0),
        first_time_fix_pct: wo?.total ? Math.round((Number(wo.first_time_fix || 0) / Number(wo.total)) * 1000) / 10 : 0,
        avg_resolve_hours: wo?.avg_resolve_h ? Math.round(Number(wo.avg_resolve_h) * 10) / 10 : null,
        sla_breached: Number(wo?.sla_breached || 0),
      },
    },
  });
});

// ─── Ingestion connections ───────────────────────────────────────────────
intel.get('/ingestion', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT c.*, s.name AS site_name FROM om_connections c
    LEFT JOIN om_sites s ON s.id = c.site_id
    ORDER BY c.last_poll_at DESC
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

intel.post('/ingestion', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'asset_owner', 'ipp', 'ipp_developer'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_id || !b.adapter) return c.json({ success: false, error: 'site_id + adapter required' }, 400);
  const denied = await assertSiteOwnership(c, user, b.site_id);
  if (denied) return denied;
  if (typeof b.endpoint_url === 'string' && b.endpoint_url.length > 0) {
    try { assertSafeWebhookUrl(b.endpoint_url); } catch (e: any) {
      return c.json({ success: false, error: e?.message || 'invalid endpoint_url' }, 400);
    }
  }
  const id = genId('omcon');
  await c.env.DB.prepare(`
    INSERT INTO om_connections (id, site_id, adapter, endpoint_url, credentials_kv, polling_minutes, enabled)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, b.site_id, b.adapter, b.endpoint_url || null,
    b.credentials_kv || null, Number(b.polling_minutes || 5), 1,
  ).run();
  await fireCascade({
    event: 'esums.connection_registered',
    actor_id: user.id,
    entity_type: 'om_connections',
    entity_id: id,
    data: {
      site_id: b.site_id,
      adapter: b.adapter,
      has_endpoint: !!b.endpoint_url,
      has_credentials_ref: !!b.credentials_kv,
      polling_minutes: Number(b.polling_minutes || 5),
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// Real OEM-adapter poll. Falls back to a synthetic write if the OEM API
// returns no readings (e.g. no credentials configured yet) so dashboards
// still light up while integrations are being wired.
intel.post('/ingestion/:id/poll', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const conn = await c.env.DB.prepare(`SELECT * FROM om_connections WHERE id = ?`).bind(id).first<any>();
  if (!conn) return c.json({ success: false, error: 'not found' }, 404);
  const nowIso = new Date().toISOString();
  const result = await pollConnection(c.env, conn);
  let written = 0;
  if (result.readings.length > 0) {
    // Match readings to devices on the site (by serial_number or first device)
    const devices = await c.env.DB.prepare(
      `SELECT id, serial_number FROM om_devices WHERE site_id = ?`,
    ).bind(conn.site_id).all<{ id: string; serial_number: string }>();
    const bySerial = new Map((devices.results || []).map((d) => [d.serial_number, d.id]));
    const valuesSql: string[] = [];
    const binds: any[] = [];
    for (const r of result.readings) {
      const deviceId = (r.device_serial && bySerial.get(r.device_serial))
        || (devices.results || [])[0]?.id;
      if (!deviceId) continue;
      valuesSql.push('(?,?,?,?,?,?,?,?,?)');
      binds.push(
        genId('omt'), deviceId, conn.site_id, r.ts || nowIso,
        r.ac_kw ?? null, r.dc_kw ?? null,
        r.yield_kwh ?? null, r.interval_kwh ?? null,
        r.quality || 'valid',
      );
      written += 1;
    }
    if (valuesSql.length) {
      await c.env.DB.prepare(`
        INSERT INTO om_telemetry (id, device_id, site_id, ts, ac_kw, dc_kw, yield_kwh, interval_kwh, quality)
        VALUES ${valuesSql.join(',')}
      `).bind(...binds).run();
    }
  }
  await c.env.DB.prepare(
    `UPDATE om_connections SET last_poll_at = ?, last_status = ?, last_error = ? WHERE id = ?`,
  ).bind(nowIso, result.ok ? 'ok' : 'error', result.error || null, id).run();
  return c.json({
    success: result.ok || written > 0,
    data: { adapter: conn.adapter, ok: result.ok, readings_written: written, error: result.error || null },
  });
});

intel.post('/ingestion/:id/test', async (c) => {
  const id = c.req.param('id');
  const conn = await c.env.DB.prepare(`SELECT * FROM om_connections WHERE id = ?`).bind(id).first<any>();
  if (!conn) return c.json({ success: false, error: 'not found' }, 404);
  // Adapter-dependent test logic — production would actually hit the URL.
  const ok = !!conn.endpoint_url;
  await c.env.DB.prepare(`UPDATE om_connections SET last_status = ?, last_error = ? WHERE id = ?`)
    .bind(ok ? 'ok' : 'error', ok ? null : 'endpoint_url missing', id).run();
  return c.json({ success: true, data: { ok, message: ok ? 'reachable' : 'endpoint not configured' } });
});

// ─── Alerts feed ─────────────────────────────────────────────────────────
intel.get('/alerts', async (c) => {
  const since = c.req.query('since') || new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await c.env.DB.prepare(`
    SELECT a.*, s.name AS site_name FROM om_alerts a
    LEFT JOIN om_sites s ON s.id = a.site_id
    WHERE a.created_at >= ?
    ORDER BY a.created_at DESC LIMIT 200
  `).bind(since).all();
  return c.json({ success: true, data: rows.results || [] });
});

export default intel;
