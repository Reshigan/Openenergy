// ═══════════════════════════════════════════════════════════════════════════
// Offtaker suite — site groupings, tariff comparison, consumption profiles,
// budgets, REC retirements, Scope 2 disclosures. Mounted at /api/offtaker-suite.
// Sits beside the existing /api/offtaker (delivery-point CRUD).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { dayCost, rankTariffs, scope2, SimpleTariff } from '../utils/tariff-compare';

const off = new Hono<HonoEnv>();
off.use('*', authMiddleware);

function canWrite(role: string): boolean {
  return role === 'offtaker' || role === 'admin';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── Site groups ───────────────────────────────────────────────────────────
off.post('/groups', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.group_name) return c.json({ success: false, error: 'group_name required' }, 400);
  const id = genId('osg');
  await c.env.DB.prepare(
    `INSERT INTO offtaker_site_groups
       (id, participant_id, group_name, group_type, billing_entity, vat_number,
        consolidated_invoice, cost_centre)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, user.id, b.group_name, b.group_type || null, b.billing_entity || null,
    b.vat_number || null, b.consolidated_invoice === false ? 0 : 1, b.cost_centre || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM offtaker_site_groups WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

off.post('/groups/:id/members', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const groupId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.delivery_point_id) return c.json({ success: false, error: 'delivery_point_id required' }, 400);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO offtaker_site_group_members
       (id, group_id, delivery_point_id, allocation_percentage)
     VALUES (?, ?, ?, ?)`,
  ).bind(
    genId('osgm'), groupId, b.delivery_point_id,
    b.allocation_percentage == null ? 100 : Number(b.allocation_percentage),
  ).run();
  return c.json({ success: true });
});

off.get('/groups', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT g.*,
            (SELECT COUNT(*) FROM offtaker_site_group_members m WHERE m.group_id = g.id) AS member_count
       FROM offtaker_site_groups g
      WHERE g.participant_id = ? ORDER BY g.created_at DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Tariff products ───────────────────────────────────────────────────────
off.get('/tariffs', async (c) => {
  const utility = c.req.query('utility');
  const rs = utility
    ? await c.env.DB.prepare(
        `SELECT * FROM tariff_products
          WHERE utility = ? AND (effective_to IS NULL OR effective_to >= date('now'))
          ORDER BY tariff_name`,
      ).bind(utility).all()
    : await c.env.DB.prepare(
        `SELECT * FROM tariff_products
          WHERE (effective_to IS NULL OR effective_to >= date('now'))
          ORDER BY utility, tariff_name`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

off.post('/tariffs', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['tariff_code', 'tariff_name', 'utility', 'category', 'structure_type', 'effective_from']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('tar');
  await c.env.DB.prepare(
    `INSERT INTO tariff_products
       (id, tariff_code, tariff_name, utility, category, structure_type, tou_schedule_json,
        effective_from, effective_to, source_doc_r2_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.tariff_code, b.tariff_name, b.utility, b.category, b.structure_type,
    typeof b.tou_schedule === 'object' ? JSON.stringify(b.tou_schedule) : null,
    b.effective_from, b.effective_to || null, b.source_doc_r2_key || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─── Tariff comparison ─────────────────────────────────────────────────────
off.post('/tariff-compare', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!Array.isArray(b.half_hour_kwh) || (b.half_hour_kwh as unknown[]).length !== 48) {
    return c.json({ success: false, error: 'half_hour_kwh (48-element array) is required' }, 400);
  }
  const tariffCodes = Array.isArray(b.tariff_codes) ? (b.tariff_codes as string[]) : [];
  if (tariffCodes.length === 0) {
    return c.json({ success: false, error: 'tariff_codes (array) is required' }, 400);
  }
  const placeholders = tariffCodes.map(() => '?').join(',');
  const rs = await c.env.DB.prepare(
    `SELECT id, tariff_code, tariff_name, structure_type, tou_schedule_json
       FROM tariff_products WHERE tariff_code IN (${placeholders})`,
  ).bind(...tariffCodes).all<{
    id: string; tariff_code: string; tariff_name: string;
    structure_type: string; tou_schedule_json: string | null;
  }>();

  const profile = { half_hour_kwh: (b.half_hour_kwh as number[]).map(Number) };
  const candidates: Array<{ id: string; name: string; tariff: SimpleTariff }> = [];
  for (const r of rs.results || []) {
    const tariff: SimpleTariff = r.structure_type === 'tou' && r.tou_schedule_json
      ? { type: 'tou', schedule: safeParseSchedule(r.tou_schedule_json) }
      : { type: 'flat', cents_per_kwh: 120 };  // flat fallback — callers should prefer TOU
    candidates.push({ id: r.tariff_code, name: r.tariff_name, tariff });
  }
  if (candidates.length === 0) {
    return c.json({ success: true, data: [] });
  }
  const ranked = rankTariffs(profile, candidates);
  return c.json({ success: true, data: ranked });
});

function safeParseSchedule(json: string): Record<string, { cents_per_kwh: number; hours: Array<[number, number]> }> {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* */ }
  return {};
}

// ─── Consumption profiles ──────────────────────────────────────────────────
off.post('/profiles', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.delivery_point_id || !b.profile_date || !Array.isArray(b.half_hour_kwh)) {
    return c.json({ success: false, error: 'delivery_point_id, profile_date, half_hour_kwh required' }, 400);
  }
  const arr = b.half_hour_kwh as number[];
  if (arr.length !== 48) return c.json({ success: false, error: 'half_hour_kwh must have 48 elements' }, 400);
  const total = arr.reduce((s, v) => s + Number(v), 0);
  const peakKw = Math.max(...arr.map((v) => Number(v) * 2)); // kWh / 0.5h = kW
  const peakIdx = arr.indexOf(Math.max(...arr));
  const peakTime = `${String(Math.floor(peakIdx / 2)).padStart(2, '0')}:${peakIdx % 2 ? '30' : '00'}`;
  const avgKw = total * 2 / 48;
  const loadFactor = peakKw > 0 ? avgKw / peakKw : 0;
  const id = genId('cp');
  await c.env.DB.prepare(
    `INSERT INTO consumption_profiles
       (id, delivery_point_id, profile_date, half_hour_kwh_json, total_kwh,
        peak_kw, peak_time, load_factor, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'meter'))`,
  ).bind(
    id, b.delivery_point_id, b.profile_date, JSON.stringify(arr),
    total, peakKw, peakTime, loadFactor, b.source || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM consumption_profiles WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

off.get('/profiles/:delivery_point_id', async (c) => {
  const dpid = c.req.param('delivery_point_id');
  const rs = await c.env.DB.prepare(
    `SELECT * FROM consumption_profiles WHERE delivery_point_id = ?
      ORDER BY profile_date DESC LIMIT 90`,
  ).bind(dpid).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Budgets ───────────────────────────────────────────────────────────────
off.post('/budgets', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.period) return c.json({ success: false, error: 'period is required' }, 400);
  const id = genId('ob');
  await c.env.DB.prepare(
    `INSERT INTO offtaker_budgets
       (id, participant_id, site_group_id, delivery_point_id, period,
        budgeted_kwh, budgeted_zar, cost_centre)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, user.id, b.site_group_id || null, b.delivery_point_id || null, b.period,
    b.budgeted_kwh == null ? null : Number(b.budgeted_kwh),
    b.budgeted_zar == null ? null : Number(b.budgeted_zar),
    b.cost_centre || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

off.get('/budget-vs-actual', async (c) => {
  const user = getCurrentUser(c);
  const period = c.req.query('period');
  if (!period) return c.json({ success: false, error: 'period query param required' }, 400);

  const budgets = await c.env.DB.prepare(
    `SELECT site_group_id, delivery_point_id, budgeted_kwh, budgeted_zar, cost_centre
       FROM offtaker_budgets WHERE participant_id = ? AND period = ?`,
  ).bind(user.id, period).all<{ site_group_id: string | null; delivery_point_id: string | null; budgeted_kwh: number | null; budgeted_zar: number | null; cost_centre: string | null }>();

  // Actuals from metering_readings where the delivery point belongs to this
  // participant or to a group the participant owns.
  const actuals = await c.env.DB.prepare(
    `SELECT dp.id AS delivery_point_id,
            COALESCE(SUM(mr.import_kwh - mr.export_kwh), 0) AS net_kwh
       FROM offtaker_delivery_points dp
       LEFT JOIN metering_readings mr ON mr.connection_id = dp.meter_id
      WHERE dp.participant_id = ?
        AND (mr.reading_date IS NULL OR mr.reading_date LIKE ? || '%')
      GROUP BY dp.id`,
  ).bind(user.id, period.slice(0, 7)).all<{ delivery_point_id: string; net_kwh: number }>();

  const actualByDp: Record<string, number> = {};
  for (const a of actuals.results || []) actualByDp[a.delivery_point_id] = a.net_kwh;

  const lines = (budgets.results || []).map((row) => ({
    site_group_id: row.site_group_id,
    delivery_point_id: row.delivery_point_id,
    cost_centre: row.cost_centre,
    budgeted_kwh: row.budgeted_kwh,
    budgeted_zar: row.budgeted_zar,
    actual_kwh: row.delivery_point_id ? actualByDp[row.delivery_point_id] ?? 0 : null,
    variance_pct: row.budgeted_kwh && row.delivery_point_id
      ? ((actualByDp[row.delivery_point_id] ?? 0) - row.budgeted_kwh) / row.budgeted_kwh * 100
      : null,
  }));
  return c.json({ success: true, data: lines });
});

// ─── REC issuance / transfer / retirement ──────────────────────────────────
off.post('/recs/certificates', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'ipp_developer') {
    return c.json({ success: false, error: 'Not authorised (admin/ipp_developer)' }, 403);
  }
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['certificate_serial', 'generation_period_start', 'generation_period_end', 'mwh_represented', 'issuance_date']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('rec');
  await c.env.DB.prepare(
    `INSERT INTO rec_certificates
       (id, certificate_serial, generator_participant_id, project_id, generation_period_start,
        generation_period_end, mwh_represented, technology, registry, issuance_date,
        status, owner_participant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
  ).bind(
    id, b.certificate_serial, b.generator_participant_id || user.id,
    b.project_id || null, b.generation_period_start, b.generation_period_end,
    Number(b.mwh_represented), b.technology || null, b.registry || 'I-REC',
    b.issuance_date,
    b.owner_participant_id || b.generator_participant_id || user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM rec_certificates WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

off.post('/recs/certificates/:id/transfer', async (c) => {
  const user = getCurrentUser(c);
  const certId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.to_participant_id) return c.json({ success: false, error: 'to_participant_id required' }, 400);
  const cert = await c.env.DB.prepare(
    'SELECT owner_participant_id, status FROM rec_certificates WHERE id = ?',
  ).bind(certId).first<{ owner_participant_id: string; status: string }>();
  if (!cert) return c.json({ success: false, error: 'Certificate not found' }, 404);
  if (cert.status !== 'issued' && cert.status !== 'transferred') {
    return c.json({ success: false, error: `Cannot transfer (status: ${cert.status})` }, 400);
  }
  if (user.role !== 'admin' && cert.owner_participant_id !== user.id) {
    return c.json({ success: false, error: 'Only current owner may transfer' }, 403);
  }
  await c.env.DB.prepare(
    `UPDATE rec_certificates SET owner_participant_id = ?, status = 'transferred' WHERE id = ?`,
  ).bind(b.to_participant_id, certId).run();
  const row = await c.env.DB.prepare('SELECT * FROM rec_certificates WHERE id = ?').bind(certId).first();
  return c.json({ success: true, data: row });
});

off.post('/recs/certificates/:id/retire', async (c) => {
  const user = getCurrentUser(c);
  const certId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['retirement_purpose', 'retirement_certificate_number']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const cert = await c.env.DB.prepare(
    'SELECT owner_participant_id, status FROM rec_certificates WHERE id = ?',
  ).bind(certId).first<{ owner_participant_id: string; status: string }>();
  if (!cert) return c.json({ success: false, error: 'Certificate not found' }, 404);
  if (cert.status === 'retired') return c.json({ success: false, error: 'Already retired' }, 400);
  if (user.role !== 'admin' && cert.owner_participant_id !== user.id) {
    return c.json({ success: false, error: 'Only current owner may retire' }, 403);
  }
  const id = genId('rret');
  await c.env.DB.prepare(
    `INSERT INTO rec_retirements
       (id, rec_certificate_id, retiring_participant_id, retirement_purpose,
        consumption_period_start, consumption_period_end, consumption_site_group_id,
        consumption_mwh, beneficiary_name, beneficiary_statement,
        retirement_certificate_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, certId, user.id, b.retirement_purpose,
    b.consumption_period_start || null, b.consumption_period_end || null,
    b.consumption_site_group_id || null,
    b.consumption_mwh == null ? null : Number(b.consumption_mwh),
    b.beneficiary_name || null, b.beneficiary_statement || null,
    b.retirement_certificate_number, user.id,
  ).run();
  await c.env.DB.prepare(
    `UPDATE rec_certificates SET status = 'retired' WHERE id = ?`,
  ).bind(certId).run();
  const row = await c.env.DB.prepare('SELECT * FROM rec_retirements WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

off.get('/recs/portfolio', async (c) => {
  const user = getCurrentUser(c);
  const pid = c.req.query('participant_id') && user.role === 'admin'
    ? c.req.query('participant_id')!
    : user.id;
  const [issued, retired] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(mwh_represented), 0) AS mwh
         FROM rec_certificates WHERE owner_participant_id = ? AND status IN ('issued','transferred')`,
    ).bind(pid).first<{ n: number; mwh: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(r.consumption_mwh), 0) AS mwh
         FROM rec_retirements r WHERE retiring_participant_id = ?`,
    ).bind(pid).first<{ n: number; mwh: number }>(),
  ]);
  return c.json({
    success: true,
    data: {
      participant_id: pid,
      active_certificates: issued?.n || 0,
      active_mwh: issued?.mwh || 0,
      retirements: retired?.n || 0,
      retired_mwh: retired?.mwh || 0,
    },
  });
});

// ─── Scope 2 disclosures ───────────────────────────────────────────────────
off.post('/scope2', async (c) => {
  const user = getCurrentUser(c);
  if (!canWrite(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['reporting_year', 'total_consumption_mwh', 'grid_factor_tco2e_per_mwh']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }

  const recsMwh = Number(b.renewable_mwh_claimed || 0);
  const computed = scope2({
    total_consumption_mwh: Number(b.total_consumption_mwh),
    renewable_claimed_mwh: recsMwh,
    grid_factor_tco2e_per_mwh: Number(b.grid_factor_tco2e_per_mwh),
  });

  const id = genId('s2');
  await c.env.DB.prepare(
    `INSERT INTO scope2_disclosures
       (id, participant_id, reporting_year, total_consumption_mwh,
        location_based_emissions_tco2e, market_based_emissions_tco2e,
        renewable_mwh_claimed, renewable_percentage, grid_factor_tco2e_per_mwh,
        audit_reference, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
  ).bind(
    id, user.id, Number(b.reporting_year), Number(b.total_consumption_mwh),
    computed.location_based_tco2e, computed.market_based_tco2e,
    recsMwh, computed.renewable_percentage, Number(b.grid_factor_tco2e_per_mwh),
    b.audit_reference || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM scope2_disclosures WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

off.get('/scope2', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM scope2_disclosures WHERE participant_id = ? ORDER BY reporting_year DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Expose dayCost so other modules can reuse without duplicating the math.
export { dayCost };

export default off;
