// ════════════════════════════════════════════════════════════════════════
// Esums Data Sources — sensor/IP/API connection registry.
//
// Each row represents one data source: a Modbus TCP inverter bank,
// a SunSpec device, an MQTT broker subscription, a REST API endpoint,
// or an OPC-UA server. Credentials live in config_json.
//
// Endpoints:
//   GET    /                  — list data sources for caller
//   POST   /                  — create
//   GET    /:id               — detail
//   PUT    /:id               — update
//   DELETE /:id               — delete
//   POST   /:id/test          — test connectivity (REST API: live fetch;
//                               TCP-based: validate config + simulate)
//   POST   /:id/activate      — set status active
//   POST   /:id/deactivate    — set status inactive
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { randomId } from '../utils/auth-tokens';
import { AppError, ErrorCode } from '../utils/types';
import { assertSafeWebhookUrl } from '../utils/url-safety';

const ds = new Hono<HonoEnv>();
ds.use('*', authMiddleware);

const VALID_SOURCE_TYPES = [
  'modbus_tcp', 'sunspec', 'modbus_rtu_ip',
  'mqtt', 'rest_api', 'opc_ua', 'push_ingest',
] as const;
type SourceType = typeof VALID_SOURCE_TYPES[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateSourceType(t: unknown): SourceType {
  if (!VALID_SOURCE_TYPES.includes(t as SourceType)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR,
      `source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}`, 400);
  }
  return t as SourceType;
}

function validatePort(p: unknown): number | null {
  if (p === null || p === undefined || p === '') return null;
  const n = Number(p);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'port must be 1–65535', 400);
  }
  return n;
}

function validateUnitId(u: unknown): number | null {
  if (u === null || u === undefined || u === '') return null;
  const n = Number(u);
  if (!Number.isInteger(n) || n < 1 || n > 247) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'unit_id must be 1–247', 400);
  }
  return n;
}

// ─── GET / — list ─────────────────────────────────────────────────────────────

ds.get('/', async (c) => {
  const user = getCurrentUser(c);
  const siteId = c.req.query('site_id');
  const DB = c.env.DB;

  let query = 'SELECT * FROM esums_data_sources WHERE participant_id = ?';
  const params: unknown[] = [user.id];
  if (siteId) { query += ' AND site_id = ?'; params.push(siteId); }
  query += ' ORDER BY created_at DESC';

  const rows = await DB.prepare(query).bind(...params).all();
  return c.json({ data: rows.results });
});

// ─── POST / — create ──────────────────────────────────────────────────────────

ds.post('/', async (c) => {
  const user = getCurrentUser(c);
  const DB = c.env.DB;
  const b = await c.req.json<Record<string, unknown>>();

  if (!b.label || typeof b.label !== 'string' || !b.label.trim()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'label is required', 400);
  }
  const sourceType = validateSourceType(b.source_type);
  const port = validatePort(b.port);
  const unitId = validateUnitId(b.unit_id);

  // SSRF guard for REST API URLs
  if (sourceType === 'rest_api' && b.api_url) {
    try { assertSafeWebhookUrl(b.api_url as string); } catch {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'api_url targets a private/reserved address', 400);
    }
  }

  const interval = b.polling_interval_sec ? Math.max(5, Number(b.polling_interval_sec)) : 60;
  const id = randomId('eds_');
  const now = new Date().toISOString();

  await DB.prepare(`
    INSERT INTO esums_data_sources
      (id, participant_id, site_id, label, source_type,
       host, port, unit_id, topic_prefix,
       api_url, api_method, api_auth_type, api_json_path,
       polling_interval_sec, config_json, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, user.id,
    (b.site_id as string) || null,
    b.label as string,
    sourceType,
    (b.host as string) || null,
    port,
    unitId,
    (b.topic_prefix as string) || null,
    (b.api_url as string) || null,
    (b.api_method as string) || 'GET',
    (b.api_auth_type as string) || 'none',
    (b.api_json_path as string) || null,
    interval,
    JSON.stringify(b.config_json || {}),
    now, now,
  ).run();

  const row = await DB.prepare('SELECT * FROM esums_data_sources WHERE id = ?').bind(id).first();

  await fireCascade({
    event: 'esums.data_source.created',
    actor_id: user.id,
    entity_type: 'esums_data_source',
    entity_id: id,
    data: { label: b.label, source_type: sourceType },
    env: c.env,
  });

  return c.json({ data: row }, 201);
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

ds.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const row = await c.env.DB
    .prepare('SELECT * FROM esums_data_sources WHERE id = ? AND participant_id = ?')
    .bind(c.req.param('id'), user.id)
    .first();
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'Data source not found', 404);
  return c.json({ data: row });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

ds.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const DB = c.env.DB;
  const id = c.req.param('id');
  const b = await c.req.json<Record<string, unknown>>();

  const existing = await DB
    .prepare('SELECT * FROM esums_data_sources WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Data source not found', 404);

  const sourceType = b.source_type ? validateSourceType(b.source_type) : (existing as any).source_type;
  const port = b.port !== undefined ? validatePort(b.port) : (existing as any).port;
  const unitId = b.unit_id !== undefined ? validateUnitId(b.unit_id) : (existing as any).unit_id;

  if (sourceType === 'rest_api' && b.api_url) {
    try { assertSafeWebhookUrl(b.api_url as string); } catch {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'api_url targets a private/reserved address', 400);
    }
  }

  const now = new Date().toISOString();
  await DB.prepare(`
    UPDATE esums_data_sources SET
      label = ?, source_type = ?, host = ?, port = ?, unit_id = ?,
      topic_prefix = ?, api_url = ?, api_method = ?, api_auth_type = ?,
      api_json_path = ?, polling_interval_sec = ?, site_id = ?,
      config_json = ?, updated_at = ?
    WHERE id = ? AND participant_id = ?
  `).bind(
    b.label ?? (existing as any).label,
    sourceType,
    b.host ?? (existing as any).host,
    port,
    unitId,
    b.topic_prefix ?? (existing as any).topic_prefix,
    b.api_url ?? (existing as any).api_url,
    b.api_method ?? (existing as any).api_method,
    b.api_auth_type ?? (existing as any).api_auth_type,
    b.api_json_path ?? (existing as any).api_json_path,
    b.polling_interval_sec ? Math.max(5, Number(b.polling_interval_sec)) : (existing as any).polling_interval_sec,
    b.site_id ?? (existing as any).site_id,
    JSON.stringify(b.config_json || JSON.parse((existing as any).config_json || '{}')),
    now,
    id, user.id,
  ).run();

  const updated = await DB
    .prepare('SELECT * FROM esums_data_sources WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

ds.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT id FROM esums_data_sources WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Data source not found', 404);
  await c.env.DB.prepare('DELETE FROM esums_data_sources WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ─── POST /:id/test — connectivity test ───────────────────────────────────────

ds.post('/:id/test', async (c) => {
  const user = getCurrentUser(c);
  const DB = c.env.DB;
  const id = c.req.param('id');

  const row = await DB
    .prepare('SELECT * FROM esums_data_sources WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first<Record<string, unknown>>();
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'Data source not found', 404);

  await DB.prepare(
    `UPDATE esums_data_sources SET status = 'testing', updated_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), id).run();

  const sourceType = row.source_type as SourceType;
  let result: Record<string, unknown>;

  if (sourceType === 'rest_api' && row.api_url) {
    // Live HTTP probe for REST sources
    try {
      assertSafeWebhookUrl(row.api_url as string);
      const t0 = Date.now();
      const authType = row.api_auth_type as string;
      const cfg = JSON.parse(row.config_json as string || '{}');
      const headers: Record<string, string> = { 'User-Agent': 'OpenEnergy-Esums/1.0' };
      if (authType === 'bearer' && cfg.bearer_token) {
        headers['Authorization'] = `Bearer ${cfg.bearer_token}`;
      } else if (authType === 'api_key' && cfg.api_key_header && cfg.api_key_value) {
        headers[cfg.api_key_header] = cfg.api_key_value;
      } else if (authType === 'basic' && cfg.basic_user && cfg.basic_pass) {
        headers['Authorization'] = `Basic ${btoa(`${cfg.basic_user}:${cfg.basic_pass}`)}`;
      }
      const resp = await fetch(row.api_url as string, {
        method: (row.api_method as string) || 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      const latency = Date.now() - t0;
      if (resp.status >= 300 && resp.status < 400) {
        result = { status: 'error', error: 'Redirect blocked (SSRF guard)', latency_ms: latency };
      } else {
        result = { status: resp.ok ? 'ok' : 'error', http_status: resp.status, latency_ms: latency };
      }
    } catch (e: unknown) {
      result = { status: 'error', error: (e as Error).message || 'fetch_failed' };
    }
  } else if (['modbus_tcp', 'sunspec', 'modbus_rtu_ip', 'opc_ua'].includes(sourceType)) {
    // TCP-based: config validation only (Workers can't open raw TCP sockets)
    const host = row.host as string;
    const port = row.port as number;
    if (!host) {
      result = { status: 'error', error: 'host not configured' };
    } else if (!port) {
      result = { status: 'error', error: 'port not configured' };
    } else {
      result = {
        status: 'registered',
        note: 'TCP connectivity confirmed by edge agent on next polling cycle',
        host,
        port,
        unit_id: row.unit_id,
      };
    }
  } else if (sourceType === 'mqtt') {
    const cfg = JSON.parse(row.config_json as string || '{}');
    const brokerUrl = cfg.broker_url as string;
    if (!brokerUrl) {
      result = { status: 'error', error: 'broker_url not configured in config_json' };
    } else {
      result = {
        status: 'registered',
        note: 'MQTT subscription confirmed by edge agent on next connect',
        broker_url: brokerUrl,
        topic_prefix: row.topic_prefix,
      };
    }
  } else {
    result = { status: 'ok', note: 'Push ingest endpoint is always active' };
  }

  const finalStatus = result.status === 'ok' || result.status === 'registered' ? 'active' : 'error';
  const now = new Date().toISOString();
  await DB.prepare(
    `UPDATE esums_data_sources SET status = ?, last_read_at = ?,
     last_error = ?, updated_at = ? WHERE id = ?`,
  ).bind(
    finalStatus,
    finalStatus === 'active' ? now : null,
    finalStatus === 'error' ? String(result.error || 'unknown') : null,
    now, id,
  ).run();

  return c.json({ data: result });
});

// ─── POST /:id/activate & /deactivate ────────────────────────────────────────

ds.post('/:id/activate', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT id FROM esums_data_sources WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Data source not found', 404);
  await c.env.DB.prepare(
    `UPDATE esums_data_sources SET status = 'active', updated_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), id).run();
  return c.json({ ok: true });
});

ds.post('/:id/deactivate', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT id FROM esums_data_sources WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Data source not found', 404);
  await c.env.DB.prepare(
    `UPDATE esums_data_sources SET status = 'inactive', updated_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), id).run();
  return c.json({ ok: true });
});

export default ds;
