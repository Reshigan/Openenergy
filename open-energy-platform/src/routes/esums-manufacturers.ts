// ════════════════════════════════════════════════════════════════════════
// Esums Inverter Manufacturer Integration — credentials + realtime polling
// for all non-SolaX brands (SolarEdge, Huawei, Fronius, Sungrow, Victron).
//
// Auth model: each participant stores one ManufacturerCredentials row per
// manufacturer they have.  The platform reads those credentials at query time
// and dispatches to the matching adapter in utils/inverter-adapters.ts.
//
// Endpoints:
//   GET  /credentials               — list all manufacturer integrations
//   POST /credentials               — add / upsert a manufacturer integration
//   PUT  /credentials/:id           — update credentials / config
//   DELETE /credentials/:id         — remove integration
//   POST /credentials/:id/test      — test connectivity (dry-run getToken)
//   GET  /stations                  — all non-solax stations (solax_stations rows)
//   GET  /snapshot/:station_id      — last known telemetry snapshot
//   POST /poll                      — poll realtime for all stations of a given mfr
//   POST /poll-all                  — poll every configured manufacturer
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { randomId } from '../utils/auth-tokens';
import { AppError, ErrorCode } from '../utils/types';
import {
  getRealtimeReading,
  validateBaseUrl,
  SUPPORTED_MANUFACTURERS,
  type Manufacturer,
  type ManufacturerCredentials,
} from '../utils/inverter-adapters';

const mr = new Hono<HonoEnv>();
mr.use('*', authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

type CredRow = {
  id: string;
  participant_id: string;
  manufacturer: string;
  auth_type: string;
  client_id: string | null;
  client_secret: string | null;
  api_key: string | null;
  token: string | null;
  username: string | null;
  password: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  base_url: string | null;
  site_id: string | null;
  extra_config: string | null;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function credRowToAdapter(row: CredRow): ManufacturerCredentials {
  return {
    manufacturer: row.manufacturer as Manufacturer,
    auth_type: row.auth_type as ManufacturerCredentials['auth_type'],
    client_id: row.client_id,
    client_secret: row.client_secret,
    api_key: row.api_key,
    token: row.token,
    username: row.username,
    password: row.password,
    base_url: row.base_url,
    site_id: row.site_id,
    extra_config: row.extra_config,
  };
}

// Redact secrets from API responses
function redactCred(row: CredRow): Omit<CredRow, 'client_secret' | 'password' | 'token' | 'access_token'> & {
  has_secret: boolean;
  has_password: boolean;
  has_token: boolean;
} {
  const { client_secret, password, token, access_token, ...rest } = row;
  return {
    ...rest,
    has_secret: !!client_secret,
    has_password: !!password,
    has_token: !!token || !!access_token,
  };
}

// ─── GET /credentials ─────────────────────────────────────────────────────────

mr.get('/credentials', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM manufacturer_credentials WHERE participant_id = ? ORDER BY manufacturer ASC',
  ).bind(user.id).all<CredRow>();
  return c.json({ data: rows.results.map(redactCred), supported: SUPPORTED_MANUFACTURERS });
});

// ─── POST /credentials ────────────────────────────────────────────────────────

mr.post('/credentials', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json<Record<string, unknown>>();

  const manufacturer = String(b.manufacturer ?? '').toLowerCase() as Manufacturer;
  if (!SUPPORTED_MANUFACTURERS.includes(manufacturer)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `manufacturer must be one of: ${SUPPORTED_MANUFACTURERS.join(', ')}`,
      400,
    );
  }

  const authType = String(b.auth_type ?? '');
  if (!['oauth2_client_creds', 'api_key', 'basic', 'token'].includes(authType)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'auth_type must be oauth2_client_creds | api_key | basic | token', 400);
  }

  // Validate base_url against per-manufacturer allowlist (SSRF prevention)
  if (b.base_url) {
    try {
      validateBaseUrl(manufacturer, String(b.base_url));
    } catch (e: unknown) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, String((e as Error).message), 400);
    }
  }

  const now = nowIso();
  const id = randomId('mfrc_');

  try {
    await c.env.DB.prepare(`
      INSERT INTO manufacturer_credentials
        (id, participant_id, manufacturer, auth_type,
         client_id, client_secret, api_key, token, username, password,
         base_url, site_id, extra_config, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(participant_id, manufacturer) DO UPDATE SET
        auth_type = excluded.auth_type,
        client_id = excluded.client_id,
        client_secret = COALESCE(excluded.client_secret, client_secret),
        api_key = COALESCE(excluded.api_key, api_key),
        token = COALESCE(excluded.token, token),
        username = excluded.username,
        password = COALESCE(excluded.password, password),
        base_url = excluded.base_url,
        site_id = excluded.site_id,
        extra_config = excluded.extra_config,
        status = 'active',
        updated_at = excluded.updated_at
    `).bind(
      id, user.id, manufacturer, authType,
      (b.client_id as string) || null,
      (b.client_secret as string) || null,
      (b.api_key as string) || null,
      (b.token as string) || null,
      (b.username as string) || null,
      (b.password as string) || null,
      (b.base_url as string) || null,
      (b.site_id as string) || null,
      (b.extra_config as string) || null,
      'active', now, now,
    ).run();
  } catch (e: unknown) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, String((e as Error).message), 500);
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM manufacturer_credentials WHERE participant_id = ? AND manufacturer = ?',
  ).bind(user.id, manufacturer).first<CredRow>();

  return c.json({ data: redactCred(row!) }, 201);
});

// ─── PUT /credentials/:id ─────────────────────────────────────────────────────

mr.put('/credentials/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b  = await c.req.json<Record<string, unknown>>();

  const existing = await c.env.DB
    .prepare('SELECT * FROM manufacturer_credentials WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first<CredRow>();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Credential not found', 404);

  // Validate updated base_url against allowlist (SSRF prevention)
  if (b.base_url) {
    try {
      validateBaseUrl(existing.manufacturer as Manufacturer, String(b.base_url));
    } catch (e: unknown) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, String((e as Error).message), 400);
    }
  }

  const now = nowIso();
  await c.env.DB.prepare(`
    UPDATE manufacturer_credentials SET
      client_id = ?, client_secret = ?,
      api_key = ?, token = ?,
      username = ?, password = ?,
      base_url = ?, site_id = ?,
      extra_config = ?, status = ?, updated_at = ?
    WHERE id = ? AND participant_id = ?
  `).bind(
    b.client_id !== undefined ? b.client_id : existing.client_id,
    b.client_secret !== undefined ? (b.client_secret as string | null) : existing.client_secret,
    b.api_key !== undefined ? b.api_key : existing.api_key,
    b.token !== undefined ? (b.token as string | null) : existing.token,
    b.username !== undefined ? b.username : existing.username,
    b.password !== undefined ? (b.password as string | null) : existing.password,
    b.base_url !== undefined ? b.base_url : existing.base_url,
    b.site_id !== undefined ? b.site_id : existing.site_id,
    b.extra_config !== undefined ? b.extra_config : existing.extra_config,
    b.status !== undefined ? b.status : existing.status,
    now, id, user.id,
  ).run();

  const row = await c.env.DB.prepare(
    'SELECT * FROM manufacturer_credentials WHERE id = ?',
  ).bind(id).first<CredRow>();
  return c.json({ data: redactCred(row!) });
});

// ─── DELETE /credentials/:id ──────────────────────────────────────────────────

mr.delete('/credentials/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT id FROM manufacturer_credentials WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Credential not found', 404);
  await c.env.DB.prepare('DELETE FROM manufacturer_credentials WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ─── POST /credentials/:id/test ───────────────────────────────────────────────

mr.post('/credentials/:id/test', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare('SELECT * FROM manufacturer_credentials WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first<CredRow>();
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'Credential not found', 404);

  const creds = credRowToAdapter(row);
  const now = nowIso();

  try {
    // Attempt a minimal API call — for most adapters getRealtimeReading with a
    // dummy SN will at least validate auth.  We catch "not found" style errors
    // (which imply auth succeeded) vs real auth failures.
    const testSn = (row.site_id ?? 'TEST_SN_0000');
    await getRealtimeReading(creds, testSn);
    await c.env.DB.prepare(
      'UPDATE manufacturer_credentials SET status = ?, last_tested_at = ?, last_error = NULL, updated_at = ? WHERE id = ?',
    ).bind('active', now, now, id).run();
    return c.json({ ok: true, manufacturer: row.manufacturer, tested_at: now });
  } catch (e: unknown) {
    const msg = String((e as Error).message ?? 'Unknown error');
    await c.env.DB.prepare(
      'UPDATE manufacturer_credentials SET status = ?, last_error = ?, last_tested_at = ?, updated_at = ? WHERE id = ?',
    ).bind('error', msg, now, now, id).run();
    return c.json({ ok: false, manufacturer: row.manufacturer, error: msg, tested_at: now }, 200);
  }
});

// ─── GET /stations ────────────────────────────────────────────────────────────

mr.get('/stations', async (c) => {
  const user = getCurrentUser(c);
  const manufacturer = c.req.query('manufacturer');

  let sql = `
    SELECT ss.*, s.name AS site_name, s.installed_capacity_kw,
           snap.ac_kw, snap.dc_kw, snap.daily_kwh, snap.total_kwh,
           snap.battery_soc, snap.temperature_c, snap.online AS snapshot_online,
           snap.ts AS snapshot_ts
    FROM solax_stations ss
    LEFT JOIN om_sites s ON s.id = ss.site_id
    LEFT JOIN station_telemetry_snapshot snap ON snap.station_id = ss.id
    WHERE ss.participant_id = ?
  `;
  const binds: unknown[] = [user.id];
  if (manufacturer) {
    sql += ' AND ss.manufacturer = ?';
    binds.push(manufacturer);
  }
  sql += ' ORDER BY ss.manufacturer ASC, ss.plant_name ASC, ss.device_sn ASC';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ data: rows.results });
});

// ─── GET /snapshot/:station_id ────────────────────────────────────────────────

mr.get('/snapshot/:station_id', async (c) => {
  const user = getCurrentUser(c);
  const stationId = c.req.param('station_id');

  // Verify ownership
  const station = await c.env.DB
    .prepare('SELECT * FROM solax_stations WHERE id = ? AND participant_id = ?')
    .bind(stationId, user.id).first();
  if (!station) throw new AppError(ErrorCode.NOT_FOUND, 'Station not found', 404);

  const snap = await c.env.DB
    .prepare('SELECT * FROM station_telemetry_snapshot WHERE station_id = ?')
    .bind(stationId).first();

  return c.json({ data: snap ?? null, station });
});

// ─── POST /poll ───────────────────────────────────────────────────────────────
// Fetch realtime data for all stations of a specific manufacturer for this
// participant.  Upserts station_telemetry_snapshot per station.

mr.post('/poll', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json<{ manufacturer: string }>();
  if (!b.manufacturer) throw new AppError(ErrorCode.VALIDATION_ERROR, 'manufacturer is required', 400);

  const manufacturer = b.manufacturer.toLowerCase() as Manufacturer;

  // Get credentials
  const credRow = await c.env.DB
    .prepare('SELECT * FROM manufacturer_credentials WHERE participant_id = ? AND manufacturer = ? AND status = ?')
    .bind(user.id, manufacturer, 'active').first<CredRow>();
  if (!credRow) {
    throw new AppError(ErrorCode.NOT_FOUND, `No active credentials for manufacturer: ${manufacturer}`, 404);
  }

  const creds = credRowToAdapter(credRow);

  // Get all stations for this manufacturer and participant
  const stationsResult = await c.env.DB
    .prepare('SELECT * FROM solax_stations WHERE participant_id = ? AND manufacturer = ? AND status = ?')
    .bind(user.id, manufacturer, 'active').all<{ id: string; device_sn: string; plant_id: string; plant_name: string }>();

  const stations = stationsResult.results;
  const polled: string[] = [];
  const errors: Array<{ sn: string; error: string }> = [];

  for (const station of stations) {
    try {
      const reading = await getRealtimeReading(creds, station.device_sn);
      const now = nowIso();

      await c.env.DB.prepare(`
        INSERT INTO station_telemetry_snapshot
          (station_id, ts, ac_kw, dc_kw, daily_kwh, total_kwh,
           battery_soc, temperature_c, online, raw_json, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(station_id) DO UPDATE SET
          ts = excluded.ts,
          ac_kw = excluded.ac_kw,
          dc_kw = excluded.dc_kw,
          daily_kwh = excluded.daily_kwh,
          total_kwh = excluded.total_kwh,
          battery_soc = excluded.battery_soc,
          temperature_c = excluded.temperature_c,
          online = excluded.online,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `).bind(
        station.id,
        reading.ts,
        reading.ac_kw,
        reading.dc_kw,
        reading.daily_kwh,
        reading.total_kwh,
        reading.battery_soc,
        reading.temperature_c,
        reading.online ? 1 : 0,
        JSON.stringify(reading.raw),
        now,
      ).run();

      // Update online status on the station row
      await c.env.DB.prepare(
        'UPDATE solax_stations SET online_status = ?, last_sync_at = ?, updated_at = ? WHERE id = ?',
      ).bind(reading.online ? 1 : 0, now, now, station.id).run();

      polled.push(station.device_sn);
    } catch (e: unknown) {
      const msg = String((e as Error).message ?? 'Unknown error');
      errors.push({ sn: station.device_sn, error: msg });
      await c.env.DB.prepare(
        'UPDATE solax_stations SET last_error = ?, updated_at = ? WHERE id = ?',
      ).bind(msg, nowIso(), station.id).run();
    }
  }

  return c.json({
    ok: true,
    manufacturer,
    stations_total: stations.length,
    polled: polled.length,
    errors: errors.length ? errors : undefined,
  });
});

// ─── POST /poll-all ───────────────────────────────────────────────────────────
// Poll every configured manufacturer for this participant.

mr.post('/poll-all', async (c) => {
  const user = getCurrentUser(c);

  const credsResult = await c.env.DB
    .prepare('SELECT * FROM manufacturer_credentials WHERE participant_id = ? AND status = ?')
    .bind(user.id, 'active').all<CredRow>();

  const summary: Array<{ manufacturer: string; polled: number; errors: number }> = [];

  for (const credRow of credsResult.results) {
    const creds = credRowToAdapter(credRow);
    const stations = await c.env.DB
      .prepare('SELECT * FROM solax_stations WHERE participant_id = ? AND manufacturer = ? AND status = ?')
      .bind(user.id, credRow.manufacturer, 'active')
      .all<{ id: string; device_sn: string }>();

    let polled = 0;
    let errors = 0;

    for (const station of stations.results) {
      try {
        const reading = await getRealtimeReading(creds, station.device_sn);
        const now = nowIso();
        await c.env.DB.prepare(`
          INSERT INTO station_telemetry_snapshot
            (station_id, ts, ac_kw, dc_kw, daily_kwh, total_kwh,
             battery_soc, temperature_c, online, raw_json, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(station_id) DO UPDATE SET
            ts = excluded.ts, ac_kw = excluded.ac_kw, dc_kw = excluded.dc_kw,
            daily_kwh = excluded.daily_kwh, total_kwh = excluded.total_kwh,
            battery_soc = excluded.battery_soc, temperature_c = excluded.temperature_c,
            online = excluded.online, raw_json = excluded.raw_json, updated_at = excluded.updated_at
        `).bind(
          station.id, reading.ts, reading.ac_kw, reading.dc_kw,
          reading.daily_kwh, reading.total_kwh, reading.battery_soc,
          reading.temperature_c, reading.online ? 1 : 0,
          JSON.stringify(reading.raw), now,
        ).run();
        await c.env.DB.prepare(
          'UPDATE solax_stations SET online_status = ?, last_sync_at = ?, updated_at = ? WHERE id = ?',
        ).bind(reading.online ? 1 : 0, now, now, station.id).run();
        polled++;
      } catch {
        errors++;
      }
    }

    summary.push({ manufacturer: credRow.manufacturer, polled, errors });
  }

  return c.json({ ok: true, summary });
});

export default mr;
