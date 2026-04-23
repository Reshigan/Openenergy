// ═══════════════════════════════════════════════════════════════════════════
// SIEM forwarder — ships audit / PII-access / DLQ events to an external
// logging endpoint on a cursor so operators keep security logs in their
// SIEM of choice.
//
// Endpoints (admin-only):
//   GET    /api/siem/forwarders                — list configured forwarders
//   POST   /api/siem/forwarders                — register a new forwarder
//   PUT    /api/siem/forwarders/:id            — update (subscription / enabled)
//   POST   /api/siem/forwarders/:id/test       — send a single canary event
//   POST   /api/siem/forwarders/:id/dispatch   — drain the pending queue now
//   GET    /api/siem/forwarders/:id/deliveries — last 100 delivery-log rows
//
// dispatchAllForwarders() is exported for the cron handler to call every
// 15 minutes.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const siem = new Hono<HonoEnv>();
siem.use('*', authMiddleware);
siem.use('*', async (c, next) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  await next();
});

type Stream = 'audit' | 'pii' | 'cascade_dlq' | 'cron_failure';

interface ForwarderRow {
  id: string;
  name: string;
  vendor: 'splunk_hec' | 'elastic' | 'datadog' | 'sumo' | 'generic_https';
  endpoint_url: string;
  secret_kv_key: string | null;
  subscribe_json: string | null;
  enabled: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  rows_forwarded_total: number;
}

function genId(p: string) {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

siem.get('/forwarders', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, name, vendor, endpoint_url, enabled, last_attempt_at,
            last_success_at, last_error, rows_forwarded_total, subscribe_json
       FROM siem_forwarders ORDER BY created_at DESC LIMIT 200`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

siem.post('/forwarders', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['name', 'vendor', 'endpoint_url', 'subscribe']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('siem');
  await c.env.DB.prepare(
    `INSERT INTO siem_forwarders
       (id, name, vendor, endpoint_url, secret_kv_key, subscribe_json, enabled, created_by)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 1), ?)`,
  ).bind(
    id, b.name, b.vendor, b.endpoint_url,
    (b.secret_kv_key as string) || null,
    typeof b.subscribe === 'object' ? JSON.stringify(b.subscribe) : String(b.subscribe),
    b.enabled === false ? 0 : null,
    user.id,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

siem.put('/forwarders/:id', async (c) => {
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const binds: unknown[] = [];
  for (const k of ['name', 'endpoint_url', 'secret_kv_key'] as const) {
    if (k in b) { sets.push(`${k} = ?`); binds.push(b[k] == null ? null : String(b[k])); }
  }
  if ('subscribe' in b) {
    sets.push('subscribe_json = ?');
    binds.push(typeof b.subscribe === 'object' ? JSON.stringify(b.subscribe) : String(b.subscribe));
  }
  if ('enabled' in b) { sets.push('enabled = ?'); binds.push(b.enabled ? 1 : 0); }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE siem_forwarders SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

siem.post('/forwarders/:id/test', async (c) => {
  const id = c.req.param('id');
  const fw = await c.env.DB.prepare('SELECT * FROM siem_forwarders WHERE id = ?').bind(id).first<ForwarderRow>();
  if (!fw) return c.json({ success: false, error: 'Not found' }, 404);
  const result = await deliverBatch(c.env, fw, 'audit', [
    {
      id: 'canary',
      action: 'siem.canary',
      entity_type: 'siem_forwarder',
      entity_id: id,
      created_at: new Date().toISOString(),
    },
  ]);
  return c.json({ success: result.http_status < 400, data: result });
});

siem.post('/forwarders/:id/dispatch', async (c) => {
  const id = c.req.param('id');
  const fw = await c.env.DB.prepare('SELECT * FROM siem_forwarders WHERE id = ?').bind(id).first<ForwarderRow>();
  if (!fw) return c.json({ success: false, error: 'Not found' }, 404);
  if (!fw.enabled) return c.json({ success: false, error: 'Forwarder disabled' }, 400);
  const out = await dispatchForwarder(c.env, fw);
  return c.json({ success: true, data: out });
});

siem.get('/forwarders/:id/deliveries', async (c) => {
  const id = c.req.param('id');
  const rs = await c.env.DB.prepare(
    `SELECT id, stream, batch_size, http_status, response_body_snippet, attempted_at, duration_ms
       FROM siem_delivery_log WHERE forwarder_id = ?
      ORDER BY attempted_at DESC LIMIT 100`,
  ).bind(id).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ───────────────────────────────────────────────────────────────────────────
// Core dispatch — walks every enabled forwarder, for each subscribed stream,
// reads new rows since its cursor, delivers, advances the cursor.
//
// Export so src/index.ts cron handler can call it without HTTP auth.
// ───────────────────────────────────────────────────────────────────────────
export async function dispatchAllForwarders(env: HonoEnv['Bindings']): Promise<{
  forwarders: number; rows_sent: number; failures: number;
}> {
  const fws = await env.DB.prepare(
    `SELECT * FROM siem_forwarders WHERE enabled = 1`,
  ).all<ForwarderRow>();
  let rowsSent = 0;
  let failures = 0;
  for (const fw of fws.results || []) {
    const out = await dispatchForwarder(env, fw);
    rowsSent += out.rows_sent;
    failures += out.failures;
  }
  return { forwarders: (fws.results || []).length, rows_sent: rowsSent, failures };
}

async function dispatchForwarder(
  env: HonoEnv['Bindings'],
  fw: ForwarderRow,
): Promise<{ rows_sent: number; failures: number; by_stream: Record<string, number> }> {
  const subs = safeParseSubscribe(fw.subscribe_json) || { events: ['audit'] };
  const streams: Stream[] = (subs.events || ['audit']) as Stream[];
  let rowsSent = 0;
  let failures = 0;
  const byStream: Record<string, number> = {};

  for (const stream of streams) {
    const cursorRow = await env.DB.prepare(
      `SELECT last_cursor FROM siem_forwarder_cursors WHERE forwarder_id = ? AND stream = ?`,
    ).bind(fw.id, stream).first<{ last_cursor: string | null }>();
    const cursor = cursorRow?.last_cursor ||
      new Date(Date.now() - 15 * 60_000).toISOString(); // fresh installs pick up the last 15 min

    const rows = await fetchStreamRows(env, stream, cursor);
    if (rows.length === 0) { byStream[stream] = 0; continue; }

    const result = await deliverBatch(env, fw, stream, rows);
    if (result.http_status < 400) {
      const newCursor = String(rows[rows.length - 1].created_at || new Date().toISOString());
      await env.DB.prepare(
        `INSERT INTO siem_forwarder_cursors (forwarder_id, stream, last_cursor, last_forwarded_count, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(forwarder_id, stream) DO UPDATE SET
           last_cursor = excluded.last_cursor,
           last_forwarded_count = excluded.last_forwarded_count,
           updated_at = datetime('now')`,
      ).bind(fw.id, stream, newCursor, rows.length).run();
      await env.DB.prepare(
        `UPDATE siem_forwarders
           SET last_attempt_at = datetime('now'), last_success_at = datetime('now'),
               last_error = NULL, rows_forwarded_total = rows_forwarded_total + ?
         WHERE id = ?`,
      ).bind(rows.length, fw.id).run();
      rowsSent += rows.length;
    } else {
      await env.DB.prepare(
        `UPDATE siem_forwarders
           SET last_attempt_at = datetime('now'), last_error = ?
         WHERE id = ?`,
      ).bind(`HTTP ${result.http_status}: ${result.response_body_snippet}`, fw.id).run();
      failures++;
    }
    byStream[stream] = rows.length;
  }
  return { rows_sent: rowsSent, failures, by_stream: byStream };
}

async function fetchStreamRows(
  env: HonoEnv['Bindings'],
  stream: Stream,
  cursor: string,
): Promise<Array<Record<string, unknown>>> {
  const limit = 500;
  switch (stream) {
    case 'audit': {
      const rs = await env.DB.prepare(
        `SELECT id, actor_id, action, entity_type, entity_id, changes, created_at
           FROM audit_logs WHERE created_at > ? ORDER BY created_at ASC LIMIT ?`,
      ).bind(cursor, limit).all<Record<string, unknown>>();
      return rs.results || [];
    }
    case 'pii': {
      const rs = await env.DB.prepare(
        `SELECT id, actor_id, subject_id, access_type, justification, created_at
           FROM popia_pii_access_log WHERE created_at > ? ORDER BY created_at ASC LIMIT ?`,
      ).bind(cursor, limit).all<Record<string, unknown>>();
      return rs.results || [];
    }
    case 'cascade_dlq': {
      const rs = await env.DB.prepare(
        `SELECT id, event, entity_type, entity_id, stage, error_message, created_at
           FROM cascade_dlq WHERE created_at > ? AND status = 'pending'
          ORDER BY created_at ASC LIMIT ?`,
      ).bind(cursor, limit).all<Record<string, unknown>>();
      return rs.results || [];
    }
    case 'cron_failure': {
      const rs = await env.DB.prepare(
        `SELECT id, route, method, status, error_name, error_message, created_at
           FROM error_log WHERE created_at > ? AND status >= 500
          ORDER BY created_at ASC LIMIT ?`,
      ).bind(cursor, limit).all<Record<string, unknown>>();
      return rs.results || [];
    }
  }
}

async function deliverBatch(
  env: HonoEnv['Bindings'],
  fw: ForwarderRow,
  stream: Stream,
  rows: Array<Record<string, unknown>>,
): Promise<{ http_status: number; response_body_snippet: string; duration_ms: number }> {
  const start = Date.now();
  const secret = fw.secret_kv_key ? await env.KV.get(fw.secret_kv_key) : null;
  const payload = formatPayload(fw.vendor, stream, rows);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  switch (fw.vendor) {
    case 'splunk_hec':     if (secret) headers['authorization'] = `Splunk ${secret}`; break;
    case 'elastic':        if (secret) headers['authorization'] = `ApiKey ${secret}`; break;
    case 'datadog':        if (secret) headers['DD-API-KEY'] = secret; break;
    case 'sumo':           /* sumo signs URL with token, no header */ break;
    case 'generic_https':  if (secret) headers['authorization'] = `Bearer ${secret}`; break;
  }

  let status = 0;
  let bodySnippet = '';
  try {
    const resp = await fetch(fw.endpoint_url, {
      method: 'POST',
      headers,
      body: payload,
    });
    status = resp.status;
    bodySnippet = (await resp.text()).slice(0, 500);
  } catch (err) {
    status = 599; // network / DNS error
    bodySnippet = (err as Error).message.slice(0, 500);
  }
  const duration = Date.now() - start;

  await env.DB.prepare(
    `INSERT INTO siem_delivery_log
       (id, forwarder_id, stream, batch_size, http_status, response_body_snippet, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId('sdl'), fw.id, stream, rows.length, status, bodySnippet, duration,
  ).run();

  return { http_status: status, response_body_snippet: bodySnippet, duration_ms: duration };
}

// Vendor-specific payload formatting. We try to respect each vendor's
// preferred envelope so receivers don't need a custom parser.
function formatPayload(
  vendor: ForwarderRow['vendor'],
  stream: Stream,
  rows: Array<Record<string, unknown>>,
): string {
  switch (vendor) {
    case 'splunk_hec':
      return rows.map((r) => JSON.stringify({
        event: r,
        sourcetype: `openenergy:${stream}`,
        source: 'open-energy',
      })).join('\n');
    case 'datadog':
      return JSON.stringify(rows.map((r) => ({
        ddsource: 'open-energy',
        ddtags: `stream:${stream}`,
        service: 'open-energy',
        message: JSON.stringify(r),
      })));
    case 'elastic':
      // _bulk API NDJSON
      return rows.map((r) =>
        `${JSON.stringify({ index: { _index: `openenergy-${stream}` } })}\n${JSON.stringify(r)}`,
      ).join('\n') + '\n';
    case 'sumo':
    case 'generic_https':
    default:
      return JSON.stringify({ stream, rows });
  }
}

function safeParseSubscribe(json: string | null): { events?: string[] } | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

export default siem;
