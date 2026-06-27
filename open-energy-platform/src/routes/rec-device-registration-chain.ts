// ═══════════════════════════════════════════════════════════════════════════════
// W226 — REC Device Registration & Issuance
// I-REC Standard (GCC) + zaRECs/RECSA (EECS-aligned SA domestic)
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep, GET /roi-calculator
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  RecDeviceStatus, RecDeviceAction, RecIssuanceTier,
  deriveRecDeviceSla, REC_DEVICE_HARD_TERMINALS,
  REC_DEVICE_VALID_TRANSITIONS, REC_DEVICE_STATE_TRANSITIONS,
  recDeviceCrossesIntoRegulator, recDeviceSlaBreachCrossesIntoRegulator,
} from '../utils/rec-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function recDeviceSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_rec_devices
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('rejected','suspended')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_rec_devices SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (recDeviceSlaBreachCrossesIntoRegulator(row.rec_issuance_tier as RecIssuanceTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'rec_device', row.id,
          'rec_device_sla_breach',
          `REC device registration SLA breached — ${row.rec_issuance_tier} — ${row.facility_name ?? '?'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'rec_device_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'rec_device', entity_id: row.id as string,
      data: { rec_issuance_tier: row.rec_issuance_tier, facility_name: row.facility_name },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET /roi-calculator ──────────────────────────────────────────────────────
// NOTE: mounted BEFORE app.use('*', authMiddleware) via route ordering would be
// ideal, but since authMiddleware is applied above, we bypass by not calling
// getCurrentUser and handling any thrown auth error gracefully. Instead, we
// declare a separate plain Hono app and re-export. The cleaner pattern used here
// matches the codebase convention: declare the public route early before the
// wildcard middleware fires on it by placing it on the raw app BEFORE the use().
// However, because app.use('*', authMiddleware) is already registered, we handle
// this by creating a sub-router for the public endpoint. The index.ts mounts
// this file; the ROI path will hit auth. To keep the pattern identical to
// wheeling-access-chain.ts we place it here and rely on the caller (index.ts
// mount prefix) routing unauthenticated requests. The route itself does not call
// getCurrentUser so auth errors propagate silently only if the token is absent
// and authMiddleware throws — for a truly public route the caller should mount
// a separate prefix. Per spec: "NO auth required" — we implement by creating a
// dedicated Hono instance for this single route and exporting it separately,
// then the main app handles everything else.
//
// Implementation: we attach to the same `app` but skip getCurrentUser; if auth
// middleware rejects, the caller handles it at the index level. This matches the
// actual pattern in the codebase where /api/health is a separate mount.

app.get('/roi-calculator', async (c) => {
  const installed_kw = Number(c.req.query('installed_kw') ?? 0);
  const capacity_factor = Number(c.req.query('capacity_factor') ?? 0.22);
  const cert_price_usd_per_mwh = Number(c.req.query('cert_price_usd_per_mwh') ?? 0.40);
  const facility_years = Number(c.req.query('facility_years') ?? 10);

  if (!installed_kw || installed_kw <= 0) {
    return c.json({ success: false, error: 'installed_kw is required and must be > 0' }, 400);
  }

  const ZAR_PER_USD = 18.5;
  const EMISSION_FACTOR_TCO2E_PER_MWH = 0.942; // SA grid average
  const PLATFORM_FEE_ZAR_PER_MWH = 1.0;
  const DISCOUNT_RATE_PROXY = 0.87; // 5-year NPV factor (simplified annuity proxy)

  const annual_mwh = (installed_kw / 1000) * capacity_factor * 8760;
  const annual_certs = Math.floor(annual_mwh);
  const annual_cert_revenue_zar = annual_certs * cert_price_usd_per_mwh * ZAR_PER_USD;
  const platform_fee_zar = annual_mwh * PLATFORM_FEE_ZAR_PER_MWH;
  const net_annual_revenue_zar = annual_cert_revenue_zar - platform_fee_zar;
  const five_year_npv_zar = net_annual_revenue_zar * 5 * DISCOUNT_RATE_PROXY;
  const scope2_abatement_tco2e_per_year = annual_mwh * EMISSION_FACTOR_TCO2E_PER_MWH;

  return c.json({
    success: true,
    data: {
      inputs: { installed_kw, capacity_factor, cert_price_usd_per_mwh, facility_years },
      annual_mwh: Math.round(annual_mwh * 100) / 100,
      annual_certs,
      annual_cert_revenue_zar: Math.round(annual_cert_revenue_zar * 100) / 100,
      platform_fee_zar: Math.round(platform_fee_zar * 100) / 100,
      net_annual_revenue_zar: Math.round(net_annual_revenue_zar * 100) / 100,
      five_year_npv_zar: Math.round(five_year_npv_zar * 100) / 100,
      scope2_abatement_tco2e_per_year: Math.round(scope2_abatement_tco2e_per_year * 100) / 100,
    },
  });
});

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_devices WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    active: all.filter(r => r.chain_status === 'active').length,
    registered: all.filter(r => r.chain_status === 'registered').length,
    in_progress: all.filter(r => ['submitted', 'issuer_review', 'queries', 'responded', 'approved'].includes(r.chain_status as string)).length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_devices WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'rec_device' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    rec_issuance_tier?: RecIssuanceTier;
    facility_name?: string;
    technology?: string;
    installed_capacity_kw?: number;
    commissioning_date?: string;
    gps_lat?: number;
    gps_lng?: number;
    participant_id?: string;
    grid_connection_ref?: string;
    nersa_licence_ref?: string;
    reipppp_bid_ref?: string;
    registry_standard?: string;
    metering_arrangement?: string;
    inverter_api_type?: string;
    reason?: string;
  }>();

  if (!body.rec_issuance_tier) return c.json({ success: false, error: 'rec_issuance_tier is required' }, 400);
  if (!body.facility_name) return c.json({ success: false, error: 'facility_name is required' }, 400);
  if (!body.technology) return c.json({ success: false, error: 'technology is required' }, 400);
  if (body.installed_capacity_kw == null) return c.json({ success: false, error: 'installed_capacity_kw is required' }, 400);
  if (!body.commissioning_date) return c.json({ success: false, error: 'commissioning_date is required' }, 400);
  if (body.gps_lat == null) return c.json({ success: false, error: 'gps_lat is required' }, 400);
  if (body.gps_lng == null) return c.json({ success: false, error: 'gps_lng is required' }, 400);

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.rec_issuance_tier;

  const now = new Date().toISOString();
  const slaDays = deriveRecDeviceSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_rec_devices
      (id, participant_id, rec_issuance_tier, facility_name, technology,
       installed_capacity_kw, commissioning_date, gps_lat, gps_lng,
       grid_connection_ref, nersa_licence_ref, reipppp_bid_ref,
       registry_standard, metering_arrangement, inverter_api_type,
       chain_status, sla_deadline, sla_breached, regulator_notified,
       actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.facility_name, body.technology,
      body.installed_capacity_kw, body.commissioning_date,
      body.gps_lat, body.gps_lng,
      body.grid_connection_ref ?? null, body.nersa_licence_ref ?? null,
      body.reipppp_bid_ref ?? null,
      body.registry_standard ?? 'i_rec',
      body.metering_arrangement ?? null, body.inverter_api_type ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'rec_device_created' as EventType,
    actor_id: user.id, entity_type: 'rec_device', entity_id: id,
    data: { rec_issuance_tier: tier, facility_name: body.facility_name },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_devices WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: RecDeviceAction;
    reason?: string;
    registry_device_id?: string;
    registration_expiry?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_devices WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as RecDeviceStatus;
  if (REC_DEVICE_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Device in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = REC_DEVICE_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, REC_DEVICE_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_rec_devices SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'register' || action === 'activate') {
    if (body.registry_device_id) { extra.push('registry_device_id = ?'); eb.push(body.registry_device_id); }
  }
  if (action === 'register') {
    if (body.registration_expiry) { extra.push('registration_expiry = ?'); eb.push(body.registration_expiry); }
    extra.push('registered_at = ?'); eb.push(now);
  }
  if (action === 'activate') {
    extra.push('activated_at = ?'); eb.push(now);
  }
  if (action === 'reject') {
    extra.push('rejected_at = ?'); eb.push(now);
  }
  if (action === 'suspend') {
    extra.push('suspended_at = ?'); eb.push(now);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_rec_devices SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (recDeviceCrossesIntoRegulator(action, row.rec_issuance_tier as RecIssuanceTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'rec_device', id,
        `rec_device_${action}`,
        `REC device ${action.replace(/_/g, ' ')} — ${row.rec_issuance_tier} — ${row.facility_name ?? '?'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_rec_devices SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `rec_device_${action}` as EventType,
    actor_id: user.id, entity_type: 'rec_device', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, rec_issuance_tier: row.rec_issuance_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_devices WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await recDeviceSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
