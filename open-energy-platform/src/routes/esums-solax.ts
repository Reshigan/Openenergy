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
import type { Context } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { randomId } from '../utils/auth-tokens';
import { AppError, ErrorCode } from '../utils/types';

type HonoContext = Context<HonoEnv>;

const sr = new Hono<HonoEnv>();
sr.use('*', authMiddleware);

const BTYPE = 4; // C&I throughout

// ─── OAuth token cache (per-isolate, keyed by client_id so tenants never
//     share a token; re-fetched on cold start or expiry) ──────────────────

type SolaxCreds = { clientId: string; clientSecret: string; base: string };
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

// Resolve the logged-in participant's SolaX credentials from their
// manufacturer_credentials row, falling back to the worker env vars.
// This is what lets a user enter their own keys in the CEC UI and have the
// proxy + /sync use them, instead of a single platform-wide key.
async function resolveCreds(c: HonoContext): Promise<SolaxCreds> {
  const user = getCurrentUser(c);
  const e = c.env as unknown as Record<string, string>;
  const row = await c.env.DB
    .prepare(`SELECT client_id, client_secret, base_url FROM manufacturer_credentials
              WHERE participant_id = ? AND manufacturer = 'solax' AND status = 'active'`)
    .bind(user.id).first<{ client_id: string | null; client_secret: string | null; base_url: string | null }>();

  const clientId     = row?.client_id     ?? e.SOLAX_CLIENT_ID;
  const clientSecret = row?.client_secret ?? e.SOLAX_CLIENT_SECRET;
  const base         = row?.base_url       ?? e.SOLAX_BASE_URL ?? 'https://openapi-eu.solaxcloud.com';
  if (!clientId || !clientSecret) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'SolaX credentials not configured — add them under Integrations', 503);
  }
  return { clientId, clientSecret, base };
}

async function getToken(creds: SolaxCreds): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(creds.clientId);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const res = await fetch(`${creds.base}/openapi/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `SolaX auth HTTP ${res.status}`, 502);
  }

  const j = await res.json<{ code: number; result?: { access_token: string; expires_in: number } }>();
  if (j.code !== 0 || !j.result?.access_token) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `SolaX auth code ${j.code}`, 502);
  }

  tokenCache.set(creds.clientId, { token: j.result.access_token, expiresAt: now + (j.result.expires_in - 300) * 1000 });
  return j.result.access_token;
}

function hdr(token: string): Record<string, string> {
  return { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', Accept: '*/*' };
}

async function solaxGet(c: HonoContext, path: string): Promise<unknown> {
  const creds = await resolveCreds(c);
  const token = await getToken(creds);
  const res = await fetch(`${creds.base}${path}`, { headers: hdr(token) });
  return res.json();
}

async function solaxPost(c: HonoContext, path: string, body: unknown): Promise<unknown> {
  const creds = await resolveCreds(c);
  const token = await getToken(creds);
  const res = await fetch(`${creds.base}${path}`, {
    method: 'POST',
    headers: hdr(token),
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── GET /plants ─────────────────────────────────────────────────────────────

sr.get('/plants', async (c) => {
  getCurrentUser(c);
  const json = await solaxGet(c, `/openapi/v2/plant/page_plant_info?businessType=${BTYPE}`);
  return c.json(json);
});

// ─── GET /devices ─────────────────────────────────────────────────────────────

sr.get('/devices', async (c) => {
  getCurrentUser(c);
  const plantId    = c.req.query('plant_id') ?? '';
  const deviceType = c.req.query('device_type') ?? '1';
  const params = new URLSearchParams({ businessType: String(BTYPE), deviceType });
  if (plantId) params.set('plantId', plantId);
  const json = await solaxGet(c, `/openapi/v2/device/page_device_info?${params}`);
  return c.json(json);
});

// ─── GET /realtime ────────────────────────────────────────────────────────────

sr.get('/realtime', async (c) => {
  getCurrentUser(c);
  const sn = c.req.query('sn');
  if (!sn) throw new AppError(ErrorCode.VALIDATION_ERROR, 'sn is required (comma-separated)', 400);
  const deviceType = c.req.query('device_type') ?? '1';
  const params = new URLSearchParams({ snList: sn, deviceType, businessType: String(BTYPE) });
  const json = await solaxGet(c, `/openapi/v2/device/realtime_data?${params}`);
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
  const json = await solaxGet(c, `/openapi/v2/device/history_data?${params}`);
  return c.json(json);
});

// ─── GET /plant-summary ───────────────────────────────────────────────────────

sr.get('/plant-summary', async (c) => {
  getCurrentUser(c);
  const plantId = c.req.query('plant_id');
  if (!plantId) throw new AppError(ErrorCode.VALIDATION_ERROR, 'plant_id is required', 400);
  const params = new URLSearchParams({ plantId, businessType: String(BTYPE) });
  const json = await solaxGet(c, `/openapi/v2/plant/realtime_data?${params}`);
  return c.json(json);
});

// ─── POST /plant-stats ────────────────────────────────────────────────────────

sr.post('/plant-stats', async (c) => {
  getCurrentUser(c);
  const b = await c.req.json<{ plant_id: string; date_type?: number; date: string }>();
  if (!b.plant_id || !b.date) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'plant_id and date are required', 400);
  }
  const json = await solaxPost(c, '/openapi/v2/plant/energy/get_stat_data', {
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
  // Optional manufacturer slug — defaults to 'solax' (the column default). Lets a
  // non-solax device (e.g. sungrow) be registered so the forward hourly recorder
  // picks it up. Same slug rule as manufacturer_credentials; identifier is bound.
  const manufacturer = String(b.manufacturer ?? 'solax').toLowerCase().trim();
  if (!/^[a-z0-9_-]{1,64}$/.test(manufacturer)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'manufacturer must be a lowercase slug (a-z 0-9 _ -)', 400);
  }

  const id  = randomId('ssx_');
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`
      INSERT INTO solax_stations
        (id, participant_id, site_id, plant_id, plant_name, device_sn,
         device_type, business_type, manufacturer, rated_power_kw, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, user.id,
      (b.site_id as string) || null,
      b.plant_id as string,
      (b.plant_name as string) || null,
      b.device_sn as string,
      Number(b.device_type ?? 1),
      BTYPE,
      manufacturer,
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

  if (b.status !== undefined && !['active', 'inactive', 'error'].includes(b.status as string)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid status', 400);
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
// Discovers all plants + inverters from SolaX. Each SolaX plant maps to one
// om_sites row (created if absent, matched by participant_id + name); every
// inverter upserts a solax_stations row linked to that site. A site can hold
// many stations of mixed make = "many integrations per site". Manual site
// reassignment (PUT /stations/:id) is preserved — sync never clobbers a
// non-null site_id. Optionally rolls sites under ?project_id=<esums_projects.id>.

sr.post('/sync', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.query('project_id') || null;

  // Guard: project_id, if supplied, must belong to this participant.
  if (projectId) {
    const owns = await c.env.DB
      .prepare('SELECT id FROM esums_projects WHERE id = ? AND participant_id = ?')
      .bind(projectId, user.id).first<{ id: string }>();
    if (!owns) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unknown project_id', 400);
  }

  type PlantRecord  = { plantId: string; plantName: string };
  type DeviceRecord = { deviceSn: string; ratedPower: number; onlineStatus: number };

  const plantsJson = await solaxGet(c, `/openapi/v2/plant/page_plant_info?businessType=${BTYPE}`) as {
    code: number; result?: { records: PlantRecord[] };
  };
  const plants: PlantRecord[] = plantsJson.result?.records ?? [];

  let upserted = 0;
  let sitesCreated = 0;
  const errors: string[] = [];

  // Find-or-create the om_sites row for a SolaX plant. Match by (participant, name).
  async function resolveSite(plantName: string): Promise<string> {
    const now = new Date().toISOString();
    const found = await c.env.DB
      .prepare('SELECT id FROM om_sites WHERE participant_id = ? AND name = ?')
      .bind(user.id, plantName).first<{ id: string }>();
    if (found) {
      if (projectId) {
        await c.env.DB.prepare('UPDATE om_sites SET project_id = ?, updated_at = ? WHERE id = ?')
          .bind(projectId, now, found.id).run();
      }
      return found.id;
    }
    const id = randomId('site_');
    await c.env.DB.prepare(`
      INSERT INTO om_sites
        (id, name, participant_id, project_id, technology, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(id, plantName, user.id, projectId, 'solar', 'operational', now, now).run();
    sitesCreated++;
    return id;
  }

  for (const plant of plants) {
    try {
      const siteId = await resolveSite(plant.plantName);

      const devJson = await solaxGet(
        c,
        `/openapi/v2/device/page_device_info?businessType=${BTYPE}&deviceType=1&plantId=${plant.plantId}`,
      ) as { code: number; result?: { records: DeviceRecord[] } };
      const devices: DeviceRecord[] = devJson.result?.records ?? [];

      for (const dev of devices) {
        const now = new Date().toISOString();
        const existing = await c.env.DB
          .prepare('SELECT id FROM solax_stations WHERE participant_id = ? AND device_sn = ?')
          .bind(user.id, dev.deviceSn).first<{ id: string }>();

        if (existing) {
          // COALESCE keeps any manual site reassignment; only fills if null.
          await c.env.DB.prepare(`
            UPDATE solax_stations
            SET plant_id = ?, plant_name = ?, rated_power_kw = ?, online_status = ?,
                site_id = COALESCE(site_id, ?), last_sync_at = ?, updated_at = ?
            WHERE id = ?
          `).bind(plant.plantId, plant.plantName, dev.ratedPower || null, dev.onlineStatus ?? 0, siteId, now, now, existing.id).run();
        } else {
          const id = randomId('ssx_');
          await c.env.DB.prepare(`
            INSERT INTO solax_stations
              (id, participant_id, site_id, plant_id, plant_name, device_sn,
               device_type, business_type, rated_power_kw, online_status,
               last_sync_at, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(
            id, user.id, siteId,
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

  return c.json({ ok: true, plants: plants.length, sites_created: sitesCreated, upserted, errors: errors.length ? errors : undefined });
});

export default sr;
