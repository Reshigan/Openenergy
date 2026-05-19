// ════════════════════════════════════════════════════════════════════════
// Esums O&M — Asset Intelligence & Operations module.
//
// Mounts under /api/esums-om/*. Spec:
//   Open-Energy-Ops-Asset-Intelligence-Specification.md
//
// Endpoints in this file (core CRUD):
//   GET  /sites                           — list sites + KPI roll-ups
//   GET  /sites/:id                       — site detail
//   POST /sites                           — create
//   PUT  /sites/:id                       — update
//   GET  /devices                         — list devices (filterable by site)
//   POST /devices                         — register device
//   PUT  /devices/:id                     — update
//   POST /telemetry                       — ingest reading(s) — bulk OK
//   GET  /telemetry/:device_id            — recent telemetry window
//   GET  /faults                          — fault register w/ revenue impact
//   POST /faults                          — log a fault (manual / engine)
//   POST /faults/:id/acknowledge          — state machine
//   POST /faults/:id/resolve              — closes fault, computes total loss
//   GET  /work-orders                     — list with filters
//   POST /work-orders                     — create (often from a fault)
//   POST /work-orders/:id/transition      — state machine
//   POST /work-orders/:id/photo           — record a photo upload
//   POST /work-orders/:id/part            — record a part used
//   GET  /technicians                     — team
//   POST /technicians                     — create
//   PUT  /technicians/:id                 — update (status, location)
//   GET  /parts                           — parts catalogue
//   POST /parts                           — create
//   POST /parts/:id/adjust                — stock adjustment
//   GET  /maintenance                     — schedules
//   POST /maintenance                     — create
//   POST /maintenance/:id/complete        — mark done, roll next_due_at
//   GET  /fleet-kpis                      — portfolio aggregate
//
// Auth: every route runs through authMiddleware. Read access for any
// signed-in user; mutations require admin / support / asset_owner / om_contractor.
// Revenue-impact computations consult om_sites.ppa_tariff_zar_mwh — falls back
// to 1500 R/MWh average when missing.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { cached, invalidatePrefix, shouldBypass } from '../utils/kv-cache';

const om = new Hono<HonoEnv>();
om.use('*', authMiddleware);

// ─── Helpers ─────────────────────────────────────────────────────────────
function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function canMutate(role: string) {
  return ['admin', 'support', 'asset_owner', 'ipp', 'om_contractor', 'trader'].includes(role);
}

const TARIFF_FALLBACK = 1500; // R/MWh — used when PPA tariff is unknown

// ─── Sites ───────────────────────────────────────────────────────────────
// Cached 90s. The sub-selects (device_count, open_faults, ...) are
// expensive on large fleets; we trade ≤90s freshness for ~10× fewer
// D1 row-reads under normal use.
om.get('/sites', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support', 'regulator'].includes(user.role);
  const key = `om:sites:${isOfficer ? 'all' : user.id}`;
  const data = await cached(c.env, key, 90, async () => {
    const rows = await c.env.DB.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM om_devices d WHERE d.site_id = s.id) AS device_count,
        (SELECT COUNT(*) FROM om_faults f WHERE f.site_id = s.id
           AND f.status IN ('open','acknowledged','in_progress')) AS open_faults,
        (SELECT COALESCE(SUM(f.total_loss_zar), 0) FROM om_faults f
           WHERE f.site_id = s.id
           AND date(f.detected_at) >= date('now','start of month')) AS revenue_lost_mtd_zar,
        (SELECT COUNT(*) FROM om_work_orders w
           WHERE w.site_id = s.id
           AND w.status NOT IN ('completed','verified','closed','cancelled')) AS open_wos
      FROM om_sites s
      WHERE (? OR s.participant_id = ? OR s.om_contractor_id = ?)
      ORDER BY s.name
      LIMIT 500
    `).bind(isOfficer ? 1 : 0, user.id, user.id).all();
    return rows.results || [];
  }, { bypass: shouldBypass(c.req.raw) });
  return c.json({ success: true, data });
});

om.get('/sites/:id', async (c) => {
  const id = c.req.param('id');
  const site = await c.env.DB.prepare('SELECT * FROM om_sites WHERE id = ?').bind(id).first();
  if (!site) return c.json({ success: false, error: 'not found' }, 404);
  const devices = await c.env.DB.prepare('SELECT * FROM om_devices WHERE site_id = ? ORDER BY device_type, location_in_plant').bind(id).all();
  const recentFaults = await c.env.DB.prepare(
    `SELECT * FROM om_faults WHERE site_id = ? ORDER BY detected_at DESC LIMIT 20`,
  ).bind(id).all();
  const openWos = await c.env.DB.prepare(
    `SELECT * FROM om_work_orders WHERE site_id = ?
       AND status NOT IN ('completed','verified','closed','cancelled')
       ORDER BY created_at DESC LIMIT 20`,
  ).bind(id).all();
  // Today's revenue based on yield × tariff
  const today = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(interval_kwh),0) AS today_kwh
       FROM om_telemetry
       WHERE site_id = ? AND ts >= date('now')`,
  ).bind(id).first<{ today_kwh: number }>();
  const tariff = Number((site as any).ppa_tariff_zar_mwh || TARIFF_FALLBACK);
  const todayKwh = Number(today?.today_kwh || 0);
  const todayRevenue = (todayKwh / 1000) * tariff;
  return c.json({
    success: true,
    data: {
      site,
      devices: devices.results || [],
      recent_faults: recentFaults.results || [],
      open_work_orders: openWos.results || [],
      today_kwh: todayKwh,
      today_revenue_zar: todayRevenue,
    },
  });
});

om.post('/sites', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.name || !b.capacity_mw) return c.json({ success: false, error: 'name + capacity_mw required' }, 400);
  const id = genId('omsite');
  await c.env.DB.prepare(`
    INSERT INTO om_sites (id, name, participant_id, project_id, technology, capacity_mw, capacity_kwp,
      province, latitude, longitude, commissioning_date, ppa_id, ppa_tariff_zar_mwh,
      om_contractor_id, lender_id, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.name, b.participant_id || user.id, b.project_id || null,
    b.technology || 'solar', Number(b.capacity_mw), b.capacity_kwp ? Number(b.capacity_kwp) : null,
    b.province || null, b.latitude ? Number(b.latitude) : null, b.longitude ? Number(b.longitude) : null,
    b.commissioning_date || null, b.ppa_id || null, b.ppa_tariff_zar_mwh ? Number(b.ppa_tariff_zar_mwh) : null,
    b.om_contractor_id || null, b.lender_id || null, b.status || 'operational',
  ).run();
  await fireCascade({
    event: 'om.site_created', actor_id: user.id,
    entity_type: 'om_sites', entity_id: id,
    data: { name: b.name, capacity_mw: b.capacity_mw }, env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

om.put('/sites/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const fields = ['name', 'technology', 'capacity_mw', 'province', 'ppa_tariff_zar_mwh', 'status'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]); }
  if (!sets.length) return c.json({ success: false, error: 'nothing to update' }, 400);
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await c.env.DB.prepare(`UPDATE om_sites SET ${sets.join(',')} WHERE id = ?`).bind(...vals).run();
  return c.json({ success: true });
});

// ─── Devices ─────────────────────────────────────────────────────────────
om.get('/devices', async (c) => {
  const siteId = c.req.query('site_id');
  const status = c.req.query('status');
  const where: string[] = [];
  const binds: any[] = [];
  if (siteId) { where.push('site_id = ?'); binds.push(siteId); }
  if (status) { where.push('status = ?'); binds.push(status); }
  const sql = `SELECT * FROM om_devices ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY site_id, device_type LIMIT 500`;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

om.post('/devices', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_id || !b.device_type) return c.json({ success: false, error: 'site_id + device_type required' }, 400);
  const id = genId('omdev');
  await c.env.DB.prepare(`
    INSERT INTO om_devices (id, site_id, device_type, manufacturer, model, serial_number,
      firmware_version, installed_at, warranty_expiry, rated_kw, parent_device_id,
      status, location_in_plant)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.site_id, b.device_type, b.manufacturer || null, b.model || null,
    b.serial_number || null, b.firmware_version || null, b.installed_at || null,
    b.warranty_expiry || null, b.rated_kw ? Number(b.rated_kw) : null,
    b.parent_device_id || null, b.status || 'online', b.location_in_plant || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

om.put('/devices/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const fields = ['device_type', 'manufacturer', 'model', 'firmware_version',
                  'status', 'rated_kw', 'location_in_plant', 'last_seen_at'];
  const sets: string[] = []; const vals: any[] = [];
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]); }
  if (!sets.length) return c.json({ success: false, error: 'nothing to update' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE om_devices SET ${sets.join(',')} WHERE id = ?`).bind(...vals).run();
  return c.json({ success: true });
});

// ─── Telemetry ───────────────────────────────────────────────────────────
om.post('/telemetry', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({} as any));
  // Accept either single point or { readings: [...] }
  const readings = Array.isArray(body?.readings) ? body.readings : [body];
  let written = 0;
  for (const r of readings) {
    if (!r.device_id || !r.ts) continue;
    const dev = await c.env.DB.prepare('SELECT site_id FROM om_devices WHERE id = ?').bind(r.device_id).first<{ site_id: string }>();
    if (!dev) continue;
    const id = genId('omt');
    await c.env.DB.prepare(`
      INSERT INTO om_telemetry
        (id, device_id, site_id, ts, ac_kw, dc_kw, yield_kwh, interval_kwh,
         voltage_v, current_a, frequency_hz, temperature_c, irradiance_w_m2,
         status_code, quality)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, r.device_id, dev.site_id, r.ts,
      num(r.ac_kw), num(r.dc_kw), num(r.yield_kwh), num(r.interval_kwh),
      num(r.voltage_v), num(r.current_a), num(r.frequency_hz),
      num(r.temperature_c), num(r.irradiance_w_m2),
      r.status_code || null, r.quality || 'valid',
    ).run();
    // Keep last_seen_at fresh
    await c.env.DB.prepare(`UPDATE om_devices SET last_seen_at = ? WHERE id = ?`).bind(r.ts, r.device_id).run();
    written += 1;
  }
  return c.json({ success: true, data: { written } });
});

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

om.get('/telemetry/:device_id', async (c) => {
  const deviceId = c.req.param('device_id');
  const hours = Math.min(168, Math.max(1, Number(c.req.query('hours') || 24)));
  const rows = await c.env.DB.prepare(`
    SELECT ts, ac_kw, dc_kw, interval_kwh, temperature_c, irradiance_w_m2, status_code, quality
    FROM om_telemetry
    WHERE device_id = ?
      AND ts >= datetime('now', ? || ' hours')
    ORDER BY ts ASC
    LIMIT 5000
  `).bind(deviceId, `-${hours}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Faults — Revenue Impact Engine baked in ─────────────────────────────
om.get('/faults', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support', 'regulator'].includes(user.role);
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const siteId = c.req.query('site_id');
  const where: string[] = [];
  const binds: any[] = [];
  if (status)   { where.push('f.status = ?');   binds.push(status); }
  if (severity) { where.push('f.severity = ?'); binds.push(severity); }
  if (siteId)   { where.push('f.site_id = ?');  binds.push(siteId); }
  if (!isOfficer) {
    where.push('(s.participant_id = ? OR s.om_contractor_id = ?)');
    binds.push(user.id, user.id);
  }
  const sql = `
    SELECT f.*, s.name AS site_name, s.ppa_tariff_zar_mwh, s.capacity_mw,
           d.manufacturer AS device_manufacturer, d.model AS device_model
    FROM om_faults f
    LEFT JOIN om_sites s   ON s.id = f.site_id
    LEFT JOIN om_devices d ON d.id = f.device_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE f.severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'minor' THEN 3 ELSE 4 END,
      f.detected_at DESC
    LIMIT 500
  `;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  // Run revenue impact calculation on each open fault — live ticker
  const enriched = (rows.results || []).map((r: any) => {
    if (r.status === 'open' || r.status === 'acknowledged' || r.status === 'in_progress') {
      const elapsedH = (Date.now() - new Date(r.detected_at).getTime()) / 3_600_000;
      const computedTotal = Math.max(Number(r.total_loss_zar || 0), Number(r.hourly_loss_zar || 0) * elapsedH);
      r.total_loss_zar = Math.round(computedTotal);
      r.elapsed_hours = Math.round(elapsedH * 10) / 10;
    }
    return r;
  });
  return c.json({ success: true, data: enriched });
});

om.post('/faults', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_id || !b.category || !b.severity) return c.json({ success: false, error: 'site_id + category + severity required' }, 400);
  const id = genId('omflt');
  // Compute initial hourly loss rate from device capacity × tariff
  let hourlyLoss = Number(b.hourly_loss_zar || 0);
  if (!hourlyLoss && b.device_id) {
    const dev = await c.env.DB.prepare(
      `SELECT d.rated_kw, s.ppa_tariff_zar_mwh
         FROM om_devices d JOIN om_sites s ON s.id = d.site_id
         WHERE d.id = ?`,
    ).bind(b.device_id).first<{ rated_kw: number; ppa_tariff_zar_mwh: number }>();
    const tariff = Number(dev?.ppa_tariff_zar_mwh || TARIFF_FALLBACK);
    const kw = Number(dev?.rated_kw || 100);
    // Conservative: assume 50% capacity factor lost when faulted
    hourlyLoss = (kw / 1000) * tariff * 0.5;
  }
  // Prior occurrences
  let priorCount = 0;
  if (b.device_id && b.fault_code) {
    const prior = await c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM om_faults WHERE device_id = ? AND fault_code = ? AND id != ?`,
    ).bind(b.device_id, b.fault_code, id).first<{ c: number }>();
    priorCount = Number(prior?.c || 0);
  }
  // Warranty check
  let warranty = 0;
  if (b.device_id) {
    const dev2 = await c.env.DB.prepare(`SELECT warranty_expiry FROM om_devices WHERE id = ?`).bind(b.device_id).first<{ warranty_expiry: string }>();
    if (dev2?.warranty_expiry && new Date(dev2.warranty_expiry).getTime() > Date.now()) warranty = 1;
  }
  await c.env.DB.prepare(`
    INSERT INTO om_faults
      (id, site_id, device_id, category, severity, fault_code, description,
       detected_at, status, hourly_loss_zar, fault_history_count, warranty_covered,
       weather_correlated, grid_correlated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.site_id, b.device_id || null, b.category, b.severity,
    b.fault_code || null, b.description || null,
    b.detected_at || new Date().toISOString(),
    'open', hourlyLoss, priorCount, warranty,
    b.weather_correlated ? 1 : 0, b.grid_correlated ? 1 : 0,
  ).run();
  await fireCascade({
    event: 'om.fault_detected', actor_id: user.id,
    entity_type: 'om_faults', entity_id: id,
    data: { site_id: b.site_id, severity: b.severity, hourly_loss_zar: hourlyLoss }, env: c.env,
  });
  // Bust caches that depend on fault state
  await invalidatePrefix(c.env, 'om:fleet-kpis:');
  await invalidatePrefix(c.env, 'om:sites:');
  await invalidatePrefix(c.env, 'om:briefing:');
  await invalidatePrefix(c.env, 'om:opportunities:');
  return c.json({ success: true, data: { id, hourly_loss_zar: hourlyLoss, fault_history_count: priorCount, warranty_covered: warranty } }, 201);
});

om.post('/faults/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE om_faults SET status = 'acknowledged', updated_at = datetime('now') WHERE id = ? AND status = 'open'`).bind(id).run();
  return c.json({ success: true });
});

om.post('/faults/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const row = await c.env.DB.prepare(`SELECT * FROM om_faults WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  const elapsedH = (Date.now() - new Date(row.detected_at).getTime()) / 3_600_000;
  const computedTotal = Math.round(Math.max(Number(row.total_loss_zar || 0), Number(row.hourly_loss_zar || 0) * elapsedH));
  await c.env.DB.prepare(`
    UPDATE om_faults SET status = 'resolved', resolved_at = datetime('now'),
      total_loss_zar = ?, root_cause = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(computedTotal, b.root_cause || null, id).run();
  await fireCascade({
    event: 'om.fault_resolved', actor_id: user.id,
    entity_type: 'om_faults', entity_id: id,
    data: { total_loss_zar: computedTotal }, env: c.env,
  });
  await invalidatePrefix(c.env, 'om:fleet-kpis:');
  await invalidatePrefix(c.env, 'om:sites:');
  await invalidatePrefix(c.env, 'om:briefing:');
  await invalidatePrefix(c.env, 'om:opportunities:');
  return c.json({ success: true, data: { total_loss_zar: computedTotal, hours_open: Math.round(elapsedH * 10) / 10 } });
});

// ─── Work Orders ─────────────────────────────────────────────────────────
om.get('/work-orders', async (c) => {
  const status = c.req.query('status');
  const siteId = c.req.query('site_id');
  const assigned = c.req.query('assigned_to');
  const where: string[] = []; const binds: any[] = [];
  if (status) { where.push('w.status = ?'); binds.push(status); }
  if (siteId) { where.push('w.site_id = ?'); binds.push(siteId); }
  if (assigned) { where.push('w.assigned_to = ?'); binds.push(assigned); }
  const rows = await c.env.DB.prepare(`
    SELECT w.*, s.name AS site_name, t.name AS technician_name, f.severity AS fault_severity
    FROM om_work_orders w
    LEFT JOIN om_sites s       ON s.id = w.site_id
    LEFT JOIN om_technicians t ON t.id = w.assigned_to
    LEFT JOIN om_faults f      ON f.id = w.fault_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE w.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      w.created_at DESC
    LIMIT 300
  `).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

om.post('/work-orders', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_id || !b.category || !b.priority || !b.title) {
    return c.json({ success: false, error: 'site_id + category + priority + title required' }, 400);
  }
  const id = genId('omwo');
  const woNumber = b.wo_number || `WO-${new Date().getFullYear()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  // SLA defaults by priority
  const slaResponseMins = b.sla_response_minutes ||
    (b.priority === 'critical' ? 30 : b.priority === 'high' ? 60 : b.priority === 'medium' ? 240 : 1440);
  const slaResolveH = b.sla_resolve_hours ||
    (b.priority === 'critical' ? 4 : b.priority === 'high' ? 24 : b.priority === 'medium' ? 72 : 168);
  const sla_deadline = new Date(Date.now() + slaResolveH * 3_600_000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO om_work_orders
      (id, wo_number, site_id, fault_id, category, priority, status,
       assigned_to, title, description,
       sla_response_minutes, sla_resolve_hours, sla_deadline)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, woNumber, b.site_id, b.fault_id || null, b.category, b.priority,
    b.assigned_to ? 'assigned' : 'created',
    b.assigned_to || null, b.title, b.description || null,
    slaResponseMins, slaResolveH, sla_deadline,
  ).run();
  await c.env.DB.prepare(`INSERT INTO om_wo_events (id, wo_id, event_type, actor_id) VALUES (?,?,?,?)`)
    .bind(genId('omev'), id, 'created', user.id).run();
  if (b.assigned_to) {
    await c.env.DB.prepare(`INSERT INTO om_wo_events (id, wo_id, event_type, actor_id, payload) VALUES (?,?,?,?,?)`)
      .bind(genId('omev'), id, 'assigned', user.id, JSON.stringify({ to: b.assigned_to })).run();
  }
  if (b.fault_id) {
    await c.env.DB.prepare(`UPDATE om_faults SET work_order_id = ? WHERE id = ?`).bind(id, b.fault_id).run();
  }
  await fireCascade({
    event: 'om.work_order_created', actor_id: user.id,
    entity_type: 'om_work_orders', entity_id: id,
    data: { wo_number: woNumber, priority: b.priority }, env: c.env,
  });
  return c.json({ success: true, data: { id, wo_number: woNumber, sla_deadline } }, 201);
});

const WO_TRANSITIONS: Record<string, string[]> = {
  created:      ['assigned', 'cancelled'],
  assigned:     ['acknowledged', 'cancelled'],
  acknowledged: ['en_route', 'cancelled'],
  en_route:     ['on_site', 'cancelled'],
  on_site:      ['diagnosing', 'cancelled'],
  diagnosing:   ['repairing', 'completed', 'cancelled'],
  repairing:    ['testing', 'completed', 'cancelled'],
  testing:      ['completed', 'repairing'],
  completed:    ['verified', 'reopened'],
  verified:     ['closed', 'reopened'],
  reopened:     ['assigned'],
  closed:       [],
  cancelled:    [],
};

om.post('/work-orders/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const to = String(b.to || '');
  const row = await c.env.DB.prepare(`SELECT * FROM om_work_orders WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  const allowed = WO_TRANSITIONS[row.status] || [];
  if (!allowed.includes(to)) {
    return c.json({ success: false, error: `cannot transition from ${row.status} to ${to}` }, 400);
  }
  const tsField =
    to === 'assigned'     ? 'assigned_at' :
    to === 'acknowledged' ? 'acknowledged_at' :
    to === 'en_route'     ? 'en_route_at' :
    to === 'on_site'      ? 'on_site_at' :
    to === 'completed'    ? 'completed_at' :
    to === 'verified'     ? 'verified_at' :
    to === 'closed'       ? 'closed_at' : null;
  const sets: string[] = ['status = ?', "updated_at = datetime('now')"];
  const binds: any[] = [to];
  if (tsField) sets.push(`${tsField} = datetime('now')`);
  if (b.assigned_to) { sets.push('assigned_to = ?'); binds.push(b.assigned_to); }
  if (b.resolution_notes) { sets.push('resolution_notes = ?'); binds.push(b.resolution_notes); }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE om_work_orders SET ${sets.join(',')} WHERE id = ?`).bind(...binds).run();
  await c.env.DB.prepare(
    `INSERT INTO om_wo_events (id, wo_id, event_type, actor_id, payload) VALUES (?,?,?,?,?)`,
  ).bind(genId('omev'), id, to, user.id, JSON.stringify(b)).run();
  // If completed and there's a fault, auto-resolve it
  if (to === 'completed' && row.fault_id) {
    await c.env.DB.prepare(`UPDATE om_faults SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`)
      .bind(row.fault_id).run();
  }
  await fireCascade({
    event: `om.work_order_${to}` as any, actor_id: user.id,
    entity_type: 'om_work_orders', entity_id: id,
    data: { from: row.status, to }, env: c.env,
  });
  await invalidatePrefix(c.env, 'om:fleet-kpis:');
  await invalidatePrefix(c.env, 'om:sites:');
  return c.json({ success: true });
});

om.post('/work-orders/:id/photo', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.r2_key) return c.json({ success: false, error: 'r2_key required' }, 400);
  const row = await c.env.DB.prepare(`SELECT photos FROM om_work_orders WHERE id = ?`).bind(id).first<{ photos: string }>();
  const list = row?.photos ? JSON.parse(row.photos) : [];
  list.push({ r2_key: b.r2_key, label: b.label || null, by: user.id, at: new Date().toISOString() });
  await c.env.DB.prepare(`UPDATE om_work_orders SET photos = ? WHERE id = ?`).bind(JSON.stringify(list), id).run();
  await c.env.DB.prepare(`INSERT INTO om_wo_events (id, wo_id, event_type, actor_id, payload) VALUES (?,?,?,?,?)`)
    .bind(genId('omev'), id, 'photo', user.id, JSON.stringify({ r2_key: b.r2_key })).run();
  return c.json({ success: true });
});

om.post('/work-orders/:id/part', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.part_id || !b.qty) return c.json({ success: false, error: 'part_id + qty required' }, 400);
  const part = await c.env.DB.prepare(`SELECT * FROM om_parts WHERE id = ?`).bind(b.part_id).first<any>();
  if (!part) return c.json({ success: false, error: 'part not found' }, 404);
  const qty = Number(b.qty);
  const cost = qty * Number(part.unit_cost_zar || 0);
  // Deduct stock
  await c.env.DB.prepare(`UPDATE om_parts SET current_stock = MAX(0, current_stock - ?) WHERE id = ?`)
    .bind(qty, b.part_id).run();
  // Record movement
  await c.env.DB.prepare(`
    INSERT INTO om_part_movements (id, part_id, movement, qty, wo_id, technician_id, reason)
    VALUES (?,?,?,?,?,?,?)
  `).bind(genId('omov'), b.part_id, 'issued', qty, id, b.technician_id || null, b.reason || 'WO consumption').run();
  // Append to WO parts list + bump parts_cost_zar
  const row = await c.env.DB.prepare(`SELECT parts_used, parts_cost_zar FROM om_work_orders WHERE id = ?`).bind(id).first<{ parts_used: string; parts_cost_zar: number }>();
  const list = row?.parts_used ? JSON.parse(row.parts_used) : [];
  list.push({ part_id: b.part_id, part_number: part.part_number, qty, unit_cost: part.unit_cost_zar, total_cost: cost, at: new Date().toISOString() });
  await c.env.DB.prepare(`UPDATE om_work_orders SET parts_used = ?, parts_cost_zar = COALESCE(parts_cost_zar,0) + ? WHERE id = ?`)
    .bind(JSON.stringify(list), cost, id).run();
  await c.env.DB.prepare(`INSERT INTO om_wo_events (id, wo_id, event_type, actor_id, payload) VALUES (?,?,?,?,?)`)
    .bind(genId('omev'), id, 'part_used', user.id, JSON.stringify({ part_id: b.part_id, qty, cost })).run();
  return c.json({ success: true, data: { cost, remaining_stock: Math.max(0, Number(part.current_stock || 0) - qty) } });
});

// ─── Technicians ─────────────────────────────────────────────────────────
om.get('/technicians', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM om_technicians WHERE active = 1 ORDER BY name`).all();
  return c.json({ success: true, data: rows.results || [] });
});

om.post('/technicians', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.name) return c.json({ success: false, error: 'name required' }, 400);
  const id = genId('omtech');
  await c.env.DB.prepare(`
    INSERT INTO om_technicians (id, name, phone, email, skills, certifications, home_base_lat, home_base_lon, contractor_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.name, b.phone || null, b.email || null,
    b.skills ? JSON.stringify(b.skills) : null,
    b.certifications ? JSON.stringify(b.certifications) : null,
    b.home_base_lat || null, b.home_base_lon || null, b.contractor_id || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

om.put('/technicians/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const fields = ['name','phone','email','status','active','current_lat','current_lon'];
  const sets: string[] = []; const vals: any[] = [];
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]); }
  if (!sets.length) return c.json({ success: false, error: 'nothing to update' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE om_technicians SET ${sets.join(',')} WHERE id = ?`).bind(...vals).run();
  return c.json({ success: true });
});

// ─── Parts ───────────────────────────────────────────────────────────────
om.get('/parts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM om_parts ORDER BY name LIMIT 500`).all();
  return c.json({ success: true, data: rows.results || [] });
});

om.post('/parts', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.part_number || !b.name) return c.json({ success: false, error: 'part_number + name required' }, 400);
  const id = genId('ompart');
  await c.env.DB.prepare(`
    INSERT INTO om_parts (id, part_number, name, manufacturer, unit_cost_zar, current_stock, min_stock_qty, preferred_supplier, lead_time_days)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.part_number, b.name, b.manufacturer || null,
    Number(b.unit_cost_zar || 0), Number(b.current_stock || 0), Number(b.min_stock_qty || 0),
    b.preferred_supplier || null, b.lead_time_days || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

om.post('/parts/:id/adjust', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (b.delta === undefined) return c.json({ success: false, error: 'delta required' }, 400);
  const delta = Number(b.delta);
  await c.env.DB.prepare(`UPDATE om_parts SET current_stock = MAX(0, current_stock + ?) WHERE id = ?`)
    .bind(delta, id).run();
  await c.env.DB.prepare(`
    INSERT INTO om_part_movements (id, part_id, movement, qty, reason)
    VALUES (?,?,?,?,?)
  `).bind(genId('omov'), id, delta >= 0 ? 'received' : 'adjusted', Math.abs(delta), b.reason || 'manual adjust').run();
  return c.json({ success: true });
});

// ─── Maintenance ─────────────────────────────────────────────────────────
om.get('/maintenance', async (c) => {
  const status = c.req.query('status');
  const siteId = c.req.query('site_id');
  const where: string[] = []; const binds: any[] = [];
  if (status) { where.push('status = ?'); binds.push(status); }
  if (siteId) { where.push('site_id = ?'); binds.push(siteId); }
  const rows = await c.env.DB.prepare(`
    SELECT m.*, s.name AS site_name
    FROM om_maintenance m
    LEFT JOIN om_sites s ON s.id = m.site_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY m.next_due_at ASC
    LIMIT 500
  `).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

om.post('/maintenance', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_id || !b.task_type || !b.next_due_at) return c.json({ success: false, error: 'site_id + task_type + next_due_at required' }, 400);
  const id = genId('ommnt');
  await c.env.DB.prepare(`
    INSERT INTO om_maintenance
      (id, site_id, device_id, task_type, frequency_days, next_due_at, status,
       estimated_duration_minutes, required_skill, auto_create_wo_days)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.site_id, b.device_id || null, b.task_type,
    b.frequency_days ? Number(b.frequency_days) : null,
    b.next_due_at, b.status || 'scheduled',
    b.estimated_duration_minutes ? Number(b.estimated_duration_minutes) : null,
    b.required_skill || null, b.auto_create_wo_days ? Number(b.auto_create_wo_days) : 7,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

om.post('/maintenance/:id/complete', async (c) => {
  const user = getCurrentUser(c);
  if (!canMutate(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM om_maintenance WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  // Roll next_due forward by frequency_days (if set)
  const nextDue = row.frequency_days
    ? new Date(Date.now() + Number(row.frequency_days) * 86_400_000).toISOString().slice(0, 10)
    : row.next_due_at;
  await c.env.DB.prepare(`
    UPDATE om_maintenance SET status = 'scheduled',
      last_done_at = datetime('now'), next_due_at = ?
    WHERE id = ?
  `).bind(nextDue, id).run();
  return c.json({ success: true, data: { next_due_at: nextDue } });
});

// ─── Fleet KPIs ──────────────────────────────────────────────────────────
// Cached 60s in KV so cockpit polling (every 60s) reads at most ~1× per
// minute per scope, not 5–6 D1 queries per call.
om.get('/fleet-kpis', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support', 'regulator'].includes(user.role);
  const cacheKey = `om:fleet-kpis:${isOfficer ? 'all' : user.id}`;
  const data = await cached(c.env, cacheKey, 60, async () => fleetKpisCompute(c, user, isOfficer), {
    bypass: shouldBypass(c.req.raw),
  });
  return c.json({ success: true, data });
});

async function fleetKpisCompute(c: { env: HonoEnv['Bindings'] }, user: { id: string }, isOfficer: boolean) {
  // Resolve site IDs in scope up front, then bind into each query.
  const scopedSites = isOfficer
    ? await c.env.DB.prepare(`SELECT id, capacity_mw, ppa_tariff_zar_mwh FROM om_sites`).all<any>()
    : await c.env.DB.prepare(
        `SELECT id, capacity_mw, ppa_tariff_zar_mwh FROM om_sites
         WHERE participant_id = ? OR om_contractor_id = ?`,
      ).bind(user.id, user.id).all<any>();
  const siteIds = ((scopedSites.results || []) as Array<{ id: string }>).map((s) => s.id);
  const siteCount = siteIds.length;
  const totalMw = ((scopedSites.results || []) as Array<{ capacity_mw: number }>).reduce((s, r) => s + Number(r.capacity_mw || 0), 0);

  if (!siteIds.length) {
    return {
      total_sites: 0, total_mw: 0, today_kwh: 0, today_revenue_zar: 0,
      blended_tariff_zar_mwh: TARIFF_FALLBACK, availability_pct: 100,
      open_faults: 0, critical_faults: 0, major_faults: 0,
      bleed_rate_zar_hour: 0, lost_so_far_zar: 0,
      open_work_orders: 0, sla_breached_open: 0,
    };
  }
  const placeholders = siteIds.map(() => '?').join(',');

  const today = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(t.interval_kwh), 0) AS today_kwh
    FROM om_telemetry t
    WHERE t.site_id IN (${placeholders}) AND t.ts >= date('now')
  `).bind(...siteIds).first<any>();

  const faults = await c.env.DB.prepare(`
    SELECT
      COUNT(*) AS open_count,
      COALESCE(SUM(hourly_loss_zar), 0) AS bleed_rate,
      COALESCE(SUM(total_loss_zar), 0)  AS lost_so_far,
      SUM(CASE severity WHEN 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE severity WHEN 'major'    THEN 1 ELSE 0 END) AS major_count
    FROM om_faults
    WHERE site_id IN (${placeholders})
      AND status IN ('open','acknowledged','in_progress')
  `).bind(...siteIds).first<any>();

  const wos = await c.env.DB.prepare(`
    SELECT
      COUNT(*) AS open_wos,
      SUM(CASE WHEN sla_deadline < datetime('now')
                AND status NOT IN ('completed','verified','closed','cancelled')
               THEN 1 ELSE 0 END) AS sla_breached_open
    FROM om_work_orders
    WHERE site_id IN (${placeholders})
      AND status NOT IN ('completed','verified','closed','cancelled')
  `).bind(...siteIds).first<any>();

  const onlineRatio = await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online_devices,
      COUNT(*) AS total_devices
    FROM om_devices
    WHERE site_id IN (${placeholders})
  `).bind(...siteIds).first<any>();
  const availability = Number(onlineRatio?.total_devices || 0) > 0
    ? Number(onlineRatio?.online_devices || 0) / Number(onlineRatio?.total_devices || 1)
    : 1;

  const todayKwh = Number(today?.today_kwh || 0);
  // Weighted tariff from in-scope sites
  let num = 0, den = 0;
  for (const r of (scopedSites.results || []) as Array<{ capacity_mw: number; ppa_tariff_zar_mwh: number }>) {
    if (!r.ppa_tariff_zar_mwh) continue;
    num += Number(r.ppa_tariff_zar_mwh) * Number(r.capacity_mw || 0);
    den += Number(r.capacity_mw || 0);
  }
  const wt = { num, den };
  const blendedTariff = Number(wt?.den || 0) > 0
    ? Number(wt?.num || 0) / Number(wt?.den || 1)
    : TARIFF_FALLBACK;
  const todayRevenue = (todayKwh / 1000) * blendedTariff;

  return {
    total_sites: siteCount,
    total_mw: totalMw,
    today_kwh: todayKwh,
    today_revenue_zar: todayRevenue,
    blended_tariff_zar_mwh: Math.round(blendedTariff),
    availability_pct: Math.round(availability * 1000) / 10,
    open_faults: Number(faults?.open_count || 0),
    critical_faults: Number(faults?.critical_count || 0),
    major_faults: Number(faults?.major_count || 0),
    bleed_rate_zar_hour: Math.round(Number(faults?.bleed_rate || 0)),
    lost_so_far_zar: Math.round(Number(faults?.lost_so_far || 0)),
    open_work_orders: Number(wos?.open_wos || 0),
    sla_breached_open: Number(wos?.sla_breached_open || 0),
  };
}

export default om;
