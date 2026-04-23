// ═══════════════════════════════════════════════════════════════════════════
// Settlement automation + meter ingest routes. Mounted at /api/settlement-auto.
//
// Settlement:
//   POST /runs                 — launch an idempotent settlement run
//   GET  /runs                 — recent runs
//   GET  /runs/:id             — run detail + events
//   POST /runs/:id/retry       — retry a failed run
//   GET  /dlq                  — dead-letter queue
//   POST /dlq/:id/resolve      — manual resolution
//
// Meter ingest:
//   GET/POST /ingest/channels  — configure ingest channels per connection
//   POST /ingest/push          — HTTPS push endpoint (HMAC-authed)
//   GET  /ingest/health        — channel health overview
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { computeSettlementRun, PpaContract, PeriodReading } from '../utils/settlement-engine';

const sa = new Hono<HonoEnv>();

function requireAdminOrGrid(role: string): boolean {
  return role === 'admin' || role === 'grid_operator';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── Settlement runs ───────────────────────────────────────────────────────
// All settlement endpoints require auth.
sa.use('/runs*', authMiddleware);
sa.use('/dlq*', authMiddleware);

sa.post('/runs', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdminOrGrid(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['run_type', 'period_start', 'period_end']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const idempotencyKey = (b.idempotency_key as string) ||
    `${b.run_type}:${b.period_start}:${b.period_end}`;

  // Idempotency check.
  const existing = await c.env.DB.prepare(
    `SELECT id, status FROM settlement_runs WHERE idempotency_key = ?`,
  ).bind(idempotencyKey).first<{ id: string; status: string }>();
  if (existing) {
    return c.json({
      success: true,
      data: { id: existing.id, status: existing.status },
      idempotent: true,
    });
  }

  const runId = genId('sr');
  await c.env.DB.prepare(
    `INSERT INTO settlement_runs
       (id, run_type, period_start, period_end, initiated_by, status, idempotency_key)
     VALUES (?, ?, ?, ?, ?, 'running', ?)`,
  ).bind(runId, b.run_type, b.period_start, b.period_end, user.id, idempotencyKey).run();

  const result = await executeSettlementRun(
    c.env, runId,
    b.run_type as string, b.period_start as string, b.period_end as string,
  );
  return c.json({ success: true, data: result });
});

sa.get('/runs', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT * FROM settlement_runs ORDER BY started_at DESC LIMIT 100`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

sa.get('/runs/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM settlement_runs WHERE id = ?').bind(id).first();
  if (!row) return c.json({ success: false, error: 'Run not found' }, 404);
  const events = await c.env.DB.prepare(
    'SELECT * FROM settlement_run_events WHERE run_id = ? ORDER BY created_at DESC LIMIT 500',
  ).bind(id).all();
  return c.json({ success: true, data: { ...row, events: events.results || [] } });
});

sa.post('/runs/:id/retry', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdminOrGrid(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT run_type, period_start, period_end, status FROM settlement_runs WHERE id = ?`,
  ).bind(id).first<{ run_type: string; period_start: string; period_end: string; status: string }>();
  if (!row) return c.json({ success: false, error: 'Run not found' }, 404);
  if (row.status !== 'failed' && row.status !== 'partial') {
    return c.json({ success: false, error: `Cannot retry run in status ${row.status}` }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE settlement_runs SET status = 'running', error_message = NULL WHERE id = ?`,
  ).bind(id).run();
  const result = await executeSettlementRun(c.env, id, row.run_type, row.period_start, row.period_end);
  return c.json({ success: true, data: result });
});

sa.get('/dlq', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdminOrGrid(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const status = c.req.query('status') || 'open';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM settlement_dlq WHERE status = ? ORDER BY created_at DESC LIMIT 200`,
  ).bind(status).all();
  return c.json({ success: true, data: rs.results || [] });
});

sa.post('/dlq/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdminOrGrid(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = b.status === 'abandoned' ? 'abandoned' : 'resolved';
  await c.env.DB.prepare(
    `UPDATE settlement_dlq SET status = ?, resolved_at = datetime('now'), resolved_by = ?, resolution_notes = ?
      WHERE id = ? AND status = 'open'`,
  ).bind(status, user.id, (b.resolution_notes as string) || null, id).run();
  return c.json({ success: true });
});

// ─── Meter ingest ──────────────────────────────────────────────────────────
// Channel config requires auth; the /push endpoint uses HMAC-only auth.
sa.use('/ingest/channels*', authMiddleware);
sa.use('/ingest/health*', authMiddleware);

sa.post('/ingest/channels', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdminOrGrid(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['connection_id', 'channel_type']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('mic');
  await c.env.DB.prepare(
    `INSERT INTO meter_ingest_channels
       (id, connection_id, channel_type, endpoint_url, auth_method, auth_ref_kv_key,
        protocol_version, sampling_interval_seconds, expected_points_per_day, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 60), ?, COALESCE(?, 1))`,
  ).bind(
    id, b.connection_id, b.channel_type,
    b.endpoint_url || null, b.auth_method || null, b.auth_ref_kv_key || null,
    b.protocol_version || null,
    b.sampling_interval_seconds == null ? null : Number(b.sampling_interval_seconds),
    b.expected_points_per_day == null ? null : Number(b.expected_points_per_day),
    b.enabled === false ? 0 : null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM meter_ingest_channels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

sa.get('/ingest/channels', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, connection_id, channel_type, endpoint_url, sampling_interval_seconds,
            health_status, last_received_at, last_error_at, last_error_message, enabled
       FROM meter_ingest_channels ORDER BY connection_id LIMIT 500`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

sa.get('/ingest/health', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT health_status, COUNT(*) AS n FROM meter_ingest_channels
      WHERE enabled = 1 GROUP BY health_status`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// HTTPS push — accepts HMAC-signed payloads from SCADA / gateway clients.
// No JWT; authorised via the channel's KV-stored secret.
sa.post('/ingest/push', async (c) => {
  const channelId = c.req.header('X-Channel-Id');
  const sigHeader = c.req.header('X-Signature');
  if (!channelId || !sigHeader) {
    return c.json({ success: false, error: 'X-Channel-Id and X-Signature required' }, 401);
  }
  const channel = await c.env.DB.prepare(
    `SELECT id, auth_method, auth_ref_kv_key, enabled FROM meter_ingest_channels WHERE id = ?`,
  ).bind(channelId).first<{ id: string; auth_method: string | null; auth_ref_kv_key: string | null; enabled: number }>();
  if (!channel || !channel.enabled) {
    return c.json({ success: false, error: 'Channel not found or disabled' }, 404);
  }
  if (!channel.auth_ref_kv_key) {
    return c.json({ success: false, error: 'Channel not configured with HMAC secret' }, 401);
  }
  const secret = await c.env.KV.get(channel.auth_ref_kv_key);
  if (!secret) {
    return c.json({ success: false, error: 'HMAC secret not resolvable' }, 401);
  }

  const bodyText = await c.req.text();
  const ok = await verifyHmac(bodyText, secret, sigHeader);
  if (!ok) {
    await c.env.DB.prepare(
      `UPDATE meter_ingest_channels SET last_error_at = datetime('now'),
              last_error_message = 'HMAC signature mismatch', health_status = 'degraded'
        WHERE id = ?`,
    ).bind(channelId).run();
    return c.json({ success: false, error: 'HMAC signature mismatch' }, 401);
  }

  const hash = await sha256Hex(bodyText);
  // Dedupe.
  const dup = await c.env.DB.prepare(
    `SELECT id FROM meter_ingest_raw WHERE channel_id = ? AND hash_sha256 = ?`,
  ).bind(channelId, hash).first();
  if (dup) {
    return c.json({ success: true, data: { deduped: true } });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(bodyText); }
  catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const rawId = genId('mir');
  await c.env.DB.prepare(
    `INSERT INTO meter_ingest_raw
       (id, channel_id, timestamp_utc, raw_payload, hash_sha256, normalised)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).bind(rawId, channelId, (payload.timestamp_utc as string) || null, bodyText, hash).run();

  // Normalise if the payload matches the expected shape.
  // Expected: { timestamp_utc, export_kwh, import_kwh, peak_demand_kw?, power_factor? }
  const connection = await c.env.DB.prepare(
    `SELECT connection_id FROM meter_ingest_channels WHERE id = ?`,
  ).bind(channelId).first<{ connection_id: string }>();
  let readingId: string | null = null;
  if (connection?.connection_id && typeof payload.export_kwh === 'number' && typeof payload.import_kwh === 'number') {
    readingId = genId('mr');
    await c.env.DB.prepare(
      `INSERT INTO metering_readings
         (id, connection_id, reading_date, export_kwh, import_kwh, peak_demand_kw, power_factor, reading_type, validated, ona_ingested)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'actual', 0, 0)`,
    ).bind(
      readingId, connection.connection_id,
      (payload.timestamp_utc as string) || new Date().toISOString(),
      Number(payload.export_kwh), Number(payload.import_kwh),
      payload.peak_demand_kw == null ? null : Number(payload.peak_demand_kw),
      payload.power_factor == null ? null : Number(payload.power_factor),
    ).run();
    await c.env.DB.prepare(
      `UPDATE meter_ingest_raw SET normalised = 1, normalised_reading_id = ? WHERE id = ?`,
    ).bind(readingId, rawId).run();
  }

  await c.env.DB.prepare(
    `UPDATE meter_ingest_channels
        SET last_received_at = datetime('now'), health_status = 'healthy',
            last_error_at = NULL, last_error_message = NULL
      WHERE id = ?`,
  ).bind(channelId).run();

  return c.json({ success: true, data: { raw_id: rawId, reading_id: readingId } }, 202);
});

async function verifyHmac(body: string, secret: string, providedSig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  // Constant-time comparison
  if (hex.length !== providedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ providedSig.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Settlement run executor (exported for cron) ───────────────────────────
export async function executeSettlementRun(
  env: HonoEnv['Bindings'],
  runId: string,
  runType: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ run_id: string; status: string; invoices_generated: number; total_value_zar: number }> {
  try {
    // Pull active PPAs (contract_documents where doctype is a PPA variant and phase='active').
    const contracts = await env.DB.prepare(
      `SELECT cd.id, cd.creator_id AS from_participant_id, cd.counterparty_id AS to_participant_id,
              COALESCE(ip.ppa_volume_mwh, 0) AS ppa_volume_mwh,
              COALESCE(ip.ppa_price_per_mwh, 0) AS ppa_price_per_mwh
         FROM contract_documents cd
         LEFT JOIN ipp_projects ip ON ip.developer_id = cd.creator_id
        WHERE cd.phase = 'active'
          AND cd.document_type IN ('ppa_wheeling','ppa_btm','wheeling_agreement','offtake_agreement')`,
    ).all<{
      id: string; from_participant_id: string; to_participant_id: string;
      ppa_volume_mwh: number; ppa_price_per_mwh: number;
    }>();

    const contractRows = (contracts.results || []).filter((c) => c.from_participant_id && c.to_participant_id);
    const ppas: PpaContract[] = contractRows.map((c) => ({
      id: c.id,
      from_participant_id: c.from_participant_id,
      to_participant_id: c.to_participant_id,
      ppa_volume_mwh_per_period: c.ppa_volume_mwh ? c.ppa_volume_mwh / 12 : null, // assume monthly spread
      ppa_price_per_mwh: c.ppa_price_per_mwh,
      floor_price_per_mwh: null,
      ceiling_price_per_mwh: null,
      take_or_pay_percentage: 90, // default; would be read from contract terms in prod
      vat_rate: 0.15,
    }));

    // Aggregate metering readings by from_participant_id (generator) — simplification.
    // In a real run we'd match contracts to specific delivery points.
    const readings = await env.DB.prepare(
      `SELECT gc.project_id, ip.developer_id AS participant_id,
              COALESCE(SUM(mr.export_kwh), 0) / 1000.0 AS delivered_mwh
         FROM metering_readings mr
         JOIN grid_connections gc ON gc.id = mr.connection_id
         JOIN ipp_projects ip ON ip.id = gc.project_id
        WHERE mr.reading_date >= ? AND mr.reading_date < ?
          AND mr.validated = 1
        GROUP BY gc.project_id, ip.developer_id`,
    ).bind(periodStart, periodEnd).all<{ project_id: string; participant_id: string; delivered_mwh: number }>();

    const deliveryByParticipant = new Map<string, number>();
    for (const r of readings.results || []) {
      deliveryByParticipant.set(r.participant_id, (deliveryByParticipant.get(r.participant_id) || 0) + r.delivered_mwh);
    }

    const periodReadings: PeriodReading[] = ppas.map((p) => ({
      contract_id: p.id,
      delivered_mwh: deliveryByParticipant.get(p.from_participant_id) || 0,
    }));

    const computed = computeSettlementRun(ppas, periodReadings);
    let generated = 0;
    let totalValue = 0;
    for (const inv of computed) {
      if (inv.total_zar <= 0) continue;
      const invId = genId('inv');
      const invNum = `OE-PPA-${new Date().getFullYear()}-${invId.slice(-8).toUpperCase()}`;
      try {
        await env.DB.prepare(
          `INSERT INTO invoices
             (id, invoice_number, from_participant_id, to_participant_id, invoice_type,
              period_start, period_end, subtotal, vat_rate, vat_amount, total_amount, status, due_date)
           VALUES (?, ?, ?, ?, 'energy', ?, ?, ?, 0.15, ?, ?, 'issued', date(?, '+30 days'))`,
        ).bind(
          invId, invNum, inv.from_participant_id, inv.to_participant_id,
          periodStart, periodEnd, inv.subtotal_zar, inv.vat_zar, inv.total_zar,
          periodEnd,
        ).run();
        generated++;
        totalValue += inv.total_zar;
        await env.DB.prepare(
          `INSERT INTO settlement_run_events (id, run_id, event_type, entity_type, entity_id, message)
           VALUES (?, ?, 'invoice_created', 'invoices', ?, ?)`,
        ).bind(genId('sre'), runId, invId, `Invoice for contract ${inv.contract_id} (${inv.applied_rule})`).run();
      } catch (err) {
        await env.DB.prepare(
          `INSERT INTO settlement_dlq (id, run_id, contract_id, period_start, period_end, error_message, error_context_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          genId('sdlq'), runId, inv.contract_id, periodStart, periodEnd,
          (err as Error).message, JSON.stringify({ invoice: inv }),
        ).run();
      }
    }

    await env.DB.prepare(
      `UPDATE settlement_runs
          SET status = 'completed', completed_at = datetime('now'),
              contracts_considered = ?, invoices_generated = ?, total_value_zar = ?
        WHERE id = ?`,
    ).bind(ppas.length, generated, totalValue, runId).run();

    return { run_id: runId, status: 'completed', invoices_generated: generated, total_value_zar: totalValue };
  } catch (err) {
    await env.DB.prepare(
      `UPDATE settlement_runs
          SET status = 'failed', completed_at = datetime('now'), error_message = ?
        WHERE id = ?`,
    ).bind(((err as Error).message || '').slice(0, 2000), runId).run();
    return { run_id: runId, status: 'failed', invoices_generated: 0, total_value_zar: 0 };
  }
}

export default sa;
