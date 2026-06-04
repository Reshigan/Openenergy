// ════════════════════════════════════════════════════════════════════════
// Esums SolaX Integration — proxy + station management for C&I sites.
//
// Auth:   OAuth2 client_credentials → access_token (30-day TTL).
//         Credentials: SOLAX_CLIENT_ID / SOLAX_CLIENT_SECRET worker vars.
//         Token cached per-isolate; re-fetched on cold start or expiry.
//
// businessType=4 throughout (Commercial & Industrial).
//
// Endpoints:
//   GET  /plants                 — list SolaX plants (proxied)
//   GET  /devices                — list inverters (?plant_id=)
//   GET  /realtime               — live data (?sn=X1,X2&device_type=1)
//   GET  /history                — interval history (?sn=&start=&end=&interval=)
//   GET  /plant-summary          — plant realtime totals (?plant_id=)
//   POST /plant-stats            — monthly/annual stats {plant_id,date_type,date}
//   GET  /stations               — our mapped stations (with site names)
//   POST /stations               — link a SolaX device to an om_site
//   PUT  /stations/:id           — update site_id or status
//   DELETE /stations/:id         — remove mapping
//   POST /sync                   — discover all plants+devices, upsert stations
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { randomId } from '../utils/auth-tokens';
import { AppError, ErrorCode } from '../utils/types';

const sr = new Hono<HonoEnv>();
sr.use('*', authMiddleware);

const BTYPE = 4; // C&I throughout

// ─── OAuth token cache (per-isolate, re-fetched on cold start or expiry) ────

type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

function solaxBase(env: HonoEnv['Bindings']): string {
  return (env as unknown as Record<string, string>).SOLAX_BASE_URL
    ?? 'https://openapi-eu.solaxcloud.com';
}

async function getToken(env: HonoEnv['Bindings']): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const e = env as unknown as Record<string, string>;
  const clientId     = e.SOLAX_CLIENT_ID;
  const clientSecret = e.SOLAX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'SolaX credentials not configured (SOLAX_CLIENT_ID / SOLAX_CLIENT_SECRET)', 503);
  }

  const res = await fetch(`${solaxBase(env)}/openapi/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `SolaX auth HTTP ${res.status}`, 502);
  }

  const j = await res.json<{ code: number; result?: { access_token: string; expires_in: number } }>();
  if (j.code !== 0 || !j.result?.access_token) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `SolaX auth code ${j.code}`, 502);
  }

  tokenCache = { token: j.result.access_token, expiresAt: now + (j.result.expires_in - 300) * 1000 };
  return tokenCache.token;
}

function hdr(token: string): Record<string, string> {
  return { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', Accept: '*/*' };
}

async function solaxGet(env: HonoEnv['Bindings'], path: string): Promise<unknown> {
  const token = await getToken(env);
  const res = await fetch(`${solaxBase(env)}${path}`, { headers: hdr(token) });
  return res.json();
}

async function solaxPost(env: HonoEnv['Bindings'], path: string, body: unknown): Promise<unknown> {
  const token = await getToken(env);
  const res = await fetch(`${solaxBase(env)}${path}`, {
    method: 'POST',
    headers: hdr(token),
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── GET /plants ─────────────────────────────────────────────────────────────

sr.get('/plants', async (c) => {
  getCurrentUser(c);
  const json = await solaxGet(c.env, `/openapi/v2/plant/page_plant_info?businessType=${BTYPE}`);
  return c.json(json);
});

// ─── GET /devices ─────────────────────────────────────────────────────────────

sr.get('/devices', async (c) => {
  getCurrentUser(c);
  const plantId    = c.req.query('plant_id') ?? '';
  const deviceType = c.req.query('device_type') ?? '1';
  const params = new URLSearchParams({ businessType: String(BTYPE), deviceType });
  if (plantId) params.set('plantId', plantId);
  const json = await solaxGet(c.env, `/openapi/v2/device/page_device_info?${params}`);
  return c.json(json);
});

// ─── GET /realtime ────────────────────────────────────────────────────────────

sr.get('/realtime', async (c) => {
  getCurrentUser(c);
  const sn = c.req.query('sn');
  if (!sn) throw new AppError(ErrorCode.VALIDATION_ERROR, 'sn is required (comma-separated)', 400);
  const deviceType = c.req.query('device_type') ?? '1';
  const params = new URLSearchParams({ snList: sn, deviceType, businessType: String(BTYPE) });
  const json = await solaxGet(c.env, `/openapi/v2/device/realtime_data?${params}`);
  return c.json(json);
});

// ─── GET /history ─────────────────────────────────────────────────────────────

sr.get('/history', async (c) => {
  getCurrentUser(c);
  const sn    = c.req.query('sn');
  const start = c.req.query('start'); // 13-digit unix ms
  const end   = c.req.query('end');
  if (!sn || !start || !end) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'sn, start and end (unix ms) are required', 400);
  }
  const deviceType   = c.req.query('device_type') ?? '1';
  const timeInterval = c.req.query('interval') ?? '60'; // minutes
  const params = new URLSearchParams({ snList: sn, deviceType, startTime: start, endTime: end, timeInterval, businessType: String(BTYPE) });
  const json = await solaxGet(c.env, `/openapi/v2/device/history_data?${params}`);
  return c.json(json);
});

// ─── GET /plant-summary ───────────────────────────────────────────────────────

sr.get('/plant-summary', async (c) => {
  getCurrentUser(c);
  const plantId = c.req.query('plant_id');
  if (!plantId) throw new AppError(ErrorCode.VALIDATION_ERROR, 'plant_id is required', 400);
  const params = new URLSearchParams({ plantId, businessType: String(BTYPE) });
  const json = await solaxGet(c.env, `/openapi/v2/plant/realtime_data?${params}`);
  return c.json(json);
});

// ─── POST /plant-stats ────────────────────────────────────────────────────────

sr.post('/plant-stats', async (c) => {
  getCurrentUser(c);
  const b = await c.req.json<{ plant_id: string; date_type?: number; date: string }>();
  if (!b.plant_id || !b.date) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'plant_id and date are required', 400);
  }
  const json = await solaxPost(c.env, '/openapi/v2/plant/energy/get_stat_data', {
    plantId: b.plant_id,
    dateType: b.date_type ?? 2, // 2=Monthly
    date: b.date,
    businessType: BTYPE,
  });
  return c.json(json);
});

// ─── GET /stations ────────────────────────────────────────────────────────────

sr.get('/stations', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`
    SELECT ss.*, s.name AS site_name, s.installed_capacity_kw
    FROM solax_stations ss
    LEFT JOIN om_sites s ON s.id = ss.site_id
    WHERE ss.participant_id = ?
    ORDER BY ss.plant_name ASC, ss.device_sn ASC
  `).bind(user.id).all();
  return c.json({ data: rows.results });
});

// ─── POST /stations ───────────────────────────────────────────────────────────

sr.post('/stations', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json<Record<string, unknown>>();
  if (!b.plant_id || !b.device_sn) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'plant_id and device_sn are required', 400);
  }

  const id  = randomId('ssx_');
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`
      INSERT INTO solax_stations
        (id, participant_id, site_id, plant_id, plant_name, device_sn,
         device_type, business_type, rated_power_kw, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, user.id,
      (b.site_id as string) || null,
      b.plant_id as string,
      (b.plant_name as string) || null,
      b.device_sn as string,
      Number(b.device_type ?? 1),
      BTYPE,
      (b.rated_power_kw as number) || null,
      'active', now, now,
    ).run();
  } catch (e: unknown) {
    const msg = String((e as { message?: string }).message ?? '');
    if (msg.includes('UNIQUE')) {
      throw new AppError(ErrorCode.CONFLICT, 'A station with that device_sn already exists for this account', 409);
    }
    throw e;
  }

  const row = await c.env.DB.prepare(
    'SELECT ss.*, s.name AS site_name FROM solax_stations ss LEFT JOIN om_sites s ON s.id = ss.site_id WHERE ss.id = ?',
  ).bind(id).first();
  return c.json({ data: row }, 201);
});

// ─── PUT /stations/:id ────────────────────────────────────────────────────────

sr.put('/stations/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b  = await c.req.json<Record<string, unknown>>();

  const existing = await c.env.DB
    .prepare('SELECT * FROM solax_stations WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first<Record<string, unknown>>();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Station not found', 404);

  // If linking a site, verify it belongs to this participant
  if (b.site_id && b.site_id !== existing.site_id) {
    const site = await c.env.DB
      .prepare('SELECT id FROM om_sites WHERE id = ? AND participant_id = ?')
      .bind(b.site_id, user.id).first();
    if (!site) throw new AppError(ErrorCode.NOT_FOUND, 'Site not found', 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE solax_stations
    SET site_id = ?, plant_name = ?, rated_power_kw = ?, status = ?, updated_at = ?
    WHERE id = ? AND participant_id = ?
  `).bind(
    b.site_id !== undefined ? (b.site_id as string | null) : existing.site_id,
    b.plant_name !== undefined ? b.plant_name : existing.plant_name,
    b.rated_power_kw !== undefined ? b.rated_power_kw : existing.rated_power_kw,
    b.status !== undefined ? b.status : existing.status,
    now, id, user.id,
  ).run();

  const row = await c.env.DB.prepare(
    'SELECT ss.*, s.name AS site_name FROM solax_stations ss LEFT JOIN om_sites s ON s.id = ss.site_id WHERE ss.id = ?',
  ).bind(id).first();
  return c.json({ data: row });
});

// ─── DELETE /stations/:id ─────────────────────────────────────────────────────

sr.delete('/stations/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT id FROM solax_stations WHERE id = ? AND participant_id = ?')
    .bind(id, user.id).first();
  if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'Station not found', 404);
  await c.env.DB.prepare('DELETE FROM solax_stations WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ─── POST /sync ───────────────────────────────────────────────────────────────
// Discovers all plants + inverters from SolaX, upserts solax_stations rows.
// Does NOT auto-create om_sites — link those manually after sync.

sr.post('/sync', async (c) => {
  const user = getCurrentUser(c);

  type PlantRecord  = { plantId: string; plantName: string };
  type DeviceRecord = { deviceSn: string; ratedPower: number; onlineStatus: number };

  const plantsJson = await solaxGet(c.env, `/openapi/v2/plant/page_plant_info?businessType=${BTYPE}`) as {
    code: number; result?: { records: PlantRecord[] };
  };
  const plants: PlantRecord[] = plantsJson.result?.records ?? [];

  let upserted = 0;
  const errors: string[] = [];

  for (const plant of plants) {
    try {
      const devJson = await solaxGet(
        c.env,
        `/openapi/v2/device/page_device_info?businessType=${BTYPE}&deviceType=1&plantId=${plant.plantId}`,
      ) as { code: number; result?: { records: DeviceRecord[] } };
      const devices: DeviceRecord[] = devJson.result?.records ?? [];

      for (const dev of devices) {
        const now = new Date().toISOString();
        const existing = await c.env.DB
          .prepare('SELECT id FROM solax_stations WHERE participant_id = ? AND device_sn = ?')
          .bind(user.id, dev.deviceSn).first<{ id: string }>();

        if (existing) {
          await c.env.DB.prepare(`
            UPDATE solax_stations
            SET plant_id = ?, plant_name = ?, rated_power_kw = ?, online_status = ?,
                last_sync_at = ?, updated_at = ?
            WHERE id = ?
          `).bind(plant.plantId, plant.plantName, dev.ratedPower || null, dev.onlineStatus ?? 0, now, now, existing.id).run();
        } else {
          const id = randomId('ssx_');
          await c.env.DB.prepare(`
            INSERT INTO solax_stations
              (id, participant_id, site_id, plant_id, plant_name, device_sn,
               device_type, business_type, rated_power_kw, online_status,
               last_sync_at, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(
            id, user.id, null,
            plant.plantId, plant.plantName, dev.deviceSn,
            1, BTYPE,
            dev.ratedPower || null, dev.onlineStatus ?? 0,
            now, 'active', now, now,
          ).run();
        }
        upserted++;
      }
    } catch (e: unknown) {
      errors.push(`${plant.plantName}: ${(e as Error).message}`);
    }
  }

  return c.json({ ok: true, plants: plants.length, upserted, errors: errors.length ? errors : undefined });
});

export default sr;
