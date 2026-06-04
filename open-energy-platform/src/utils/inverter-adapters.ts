// ════════════════════════════════════════════════════════════════════════
// Inverter manufacturer API adapters — normalise each vendor's auth +
// realtime data into a common shape.
//
// Supported manufacturers:
//   solax       — OAuth2 client_credentials, EU/CN endpoints
//   solaredge   — API key in query string
//   huawei      — OAuth2 + station/device hierarchy
//   fronius     — REST API key or basic auth
//   sungrow     — iSolarCloud API key
//   sungrow     — iSolarCloud REST (appKey + userKey)
//   victron     — VRM API token
//   growatt     — API key + account pairing
//   sma         — Sunny Portal token
//
// All adapters return InverterReading — the normalised realtime shape.
// Historical data uses InverterHistoryPoint[].
// ════════════════════════════════════════════════════════════════════════

export type Manufacturer =
  | 'solax'
  | 'solaredge'
  | 'huawei'
  | 'fronius'
  | 'sungrow'
  | 'victron'
  | 'growatt'
  | 'sma';

export interface ManufacturerCredentials {
  manufacturer: Manufacturer;
  auth_type: 'oauth2_client_creds' | 'api_key' | 'basic' | 'token';
  client_id?: string | null;
  client_secret?: string | null;
  api_key?: string | null;
  token?: string | null;
  username?: string | null;
  password?: string | null;
  base_url?: string | null;
  site_id?: string | null;
  extra_config?: string | null; // JSON string
}

export interface InverterReading {
  device_sn: string;
  ts: string;                // ISO8601 UTC
  ac_kw: number | null;      // AC output, kW
  dc_kw: number | null;      // DC input (PV), kW
  daily_kwh: number | null;  // Daily yield, kWh
  total_kwh: number | null;  // Lifetime yield, kWh
  battery_soc: number | null;// % or null
  temperature_c: number | null;
  online: boolean;
  raw: unknown;              // full vendor response for debugging
}

export interface InverterHistoryPoint {
  ts: string;
  ac_kw: number | null;
  dc_kw: number | null;
  interval_kwh: number | null;
  temperature_c: number | null;
}

export class AdapterError extends Error {
  constructor(
    public readonly manufacturer: Manufacturer,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${manufacturer}] ${message}`);
    this.name = 'AdapterError';
  }
}

// ─── Token cache (per-isolate) ────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();

function getCachedToken(key: string): string | null {
  const entry = tokenCache.get(key);
  if (entry && entry.expiresAt > Date.now() + 60_000) return entry.token;
  return null;
}

function setCachedToken(key: string, token: string, expiresIn: number): void {
  tokenCache.set(key, { token, expiresAt: Date.now() + (expiresIn - 300) * 1000 });
}

// ─── SolaX ───────────────────────────────────────────────────────────────────

const SOLAX_BASE = 'https://openapi-eu.solaxcloud.com';
const SOLAX_BTYPE = 4; // C&I

async function solaxToken(creds: ManufacturerCredentials): Promise<string> {
  const cacheKey = `solax:${creds.client_id}`;
  const cached = getCachedToken(cacheKey);
  if (cached) return cached;

  const base = creds.base_url ?? SOLAX_BASE;
  const res = await fetch(`${base}/openapi/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id!,
      client_secret: creds.client_secret!,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new AdapterError('solax', `Auth HTTP ${res.status}`, res.status);
  const j = await res.json<{ code: number; result?: { access_token: string; expires_in: number } }>();
  if (j.code !== 0 || !j.result?.access_token) {
    throw new AdapterError('solax', `Auth code ${j.code}`);
  }
  setCachedToken(cacheKey, j.result.access_token, j.result.expires_in);
  return j.result.access_token;
}

async function solaxRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const token = await solaxToken(creds);
  const base = creds.base_url ?? SOLAX_BASE;
  const params = new URLSearchParams({ snList: deviceSn, deviceType: '1', businessType: String(SOLAX_BTYPE) });
  const res = await fetch(`${base}/openapi/v2/device/realtime_data?${params}`, {
    headers: { Authorization: `bearer ${token}`, Accept: '*/*' },
  });
  const j = await res.json<{ code: number; result?: Array<Record<string, unknown>> }>();
  const d = j.result?.[0] ?? {};
  return {
    device_sn: deviceSn,
    ts: (d.dataTime as string) ?? new Date().toISOString(),
    ac_kw: toNum(d.totalActivePower),
    dc_kw: toNum(d.MPPTTotalInputPower),
    daily_kwh: toNum(d.dailyYield),
    total_kwh: toNum(d.totalYield),
    battery_soc: null,
    temperature_c: toNum(d.inverterTemperature),
    online: (d.deviceStatus as number) === 1,
    raw: d,
  };
}

async function solaxHistory(
  creds: ManufacturerCredentials,
  deviceSn: string,
  startMs: number,
  endMs: number,
  intervalMin = 60,
): Promise<InverterHistoryPoint[]> {
  const token = await solaxToken(creds);
  const base = creds.base_url ?? SOLAX_BASE;
  const params = new URLSearchParams({
    snList: deviceSn, deviceType: '1',
    startTime: String(startMs), endTime: String(endMs),
    timeInterval: String(intervalMin),
    businessType: String(SOLAX_BTYPE),
  });
  const res = await fetch(`${base}/openapi/v2/device/history_data?${params}`, {
    headers: { Authorization: `bearer ${token}`, Accept: '*/*' },
  });
  const j = await res.json<{ code: number; result?: Array<Record<string, unknown>> }>();
  return (j.result ?? []).map((d) => ({
    ts: (d.dataTime as string) ?? '',
    ac_kw: toNum(d.totalActivePower),
    dc_kw: toNum(d.MPPTTotalInputPower),
    interval_kwh: toNum(d.dailyYield), // cumulative per interval
    temperature_c: toNum(d.inverterTemperature),
  }));
}

// ─── SolarEdge ───────────────────────────────────────────────────────────────
// Docs: https://developers.solaredge.com/
// Auth: api_key query parameter
// Site ID is the plant_id stored in solax_stations.plant_id

const SE_BASE = 'https://monitoringapi.solaredge.com';

async function solarEdgeRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const base = creds.base_url ?? SE_BASE;
  const siteId = creds.site_id;
  if (!siteId) throw new AdapterError('solaredge', 'site_id required');
  const url = `${base}/site/${siteId}/overview?api_key=${creds.api_key}`;
  const res = await fetch(url);
  if (!res.ok) throw new AdapterError('solaredge', `HTTP ${res.status}`, res.status);
  type SEOverview = { lastUpdateTime: string; currentPower?: { power: number }; lifeTimeData?: { energy: number }; lastDayData?: { energy: number } };
  const j = await res.json<{ overview?: SEOverview }>();
  const ov: SEOverview | undefined = j.overview;
  return {
    device_sn: deviceSn,
    ts: ov?.lastUpdateTime ?? new Date().toISOString(),
    ac_kw: ov?.currentPower?.power != null ? (ov.currentPower.power / 1000) : null,
    dc_kw: null,
    daily_kwh: ov?.lastDayData?.energy != null ? (ov.lastDayData.energy / 1000) : null,
    total_kwh: ov?.lifeTimeData?.energy != null ? (ov.lifeTimeData.energy / 1000) : null,
    battery_soc: null,
    temperature_c: null,
    online: !!ov?.lastUpdateTime,
    raw: j,
  };
}

// ─── Huawei FusionSolar ───────────────────────────────────────────────────────
// Docs: https://support.huawei.com/enterprise/en/doc/EDOC1100261860
// Auth: OAuth2 with username/password → token
// Note: Huawei uses HTTPS with client cert in enterprise; this is the
//       simplified iMaster NetEco REST variant for C&I.

const HUAWEI_BASE = 'https://eu5.fusionsolar.huawei.com/thirdData';

async function huaweiToken(creds: ManufacturerCredentials): Promise<string> {
  const cacheKey = `huawei:${creds.username}`;
  const cached = getCachedToken(cacheKey);
  if (cached) return cached;

  const base = creds.base_url ?? HUAWEI_BASE;
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: creds.username, systemCode: creds.password }),
  });
  if (!res.ok) throw new AdapterError('huawei', `Auth HTTP ${res.status}`, res.status);
  const token = res.headers.get('xsrf-token') ?? '';
  if (!token) throw new AdapterError('huawei', 'No xsrf-token in login response');
  setCachedToken(cacheKey, token, 1800); // 30-min session
  return token;
}

async function huaweiRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const token = await huaweiToken(creds);
  const base = creds.base_url ?? HUAWEI_BASE;
  const res = await fetch(`${base}/getDevRealKpi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xsrf-token': token },
    body: JSON.stringify({ devTypeId: '1', sns: [{ sn: deviceSn }] }),
  });
  if (!res.ok) throw new AdapterError('huawei', `HTTP ${res.status}`, res.status);
  const j = await res.json<{ data?: Array<{ sn: string; dataItemMap: Record<string, number> }> }>();
  const d = j.data?.[0]?.dataItemMap ?? {};
  return {
    device_sn: deviceSn,
    ts: new Date().toISOString(),
    ac_kw: toNum(d.active_power),
    dc_kw: toNum(d.mppt_power),
    daily_kwh: toNum(d.day_cap),
    total_kwh: toNum(d.total_cap),
    battery_soc: null,
    temperature_c: toNum(d.temperature),
    online: (d.run_state ?? 0) === 1,
    raw: d,
  };
}

// ─── Fronius ─────────────────────────────────────────────────────────────────
// Docs: https://www.fronius.com/en/solar-energy/installers-partners/technical-data/all-products/system-monitoring/open-interfaces/fronius-solar-api-json-
// Auth: Basic auth or API key in header; local + Solarweb cloud
// base_url should point to the local IP or Solarweb cloud endpoint.

async function froniusRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const base = creds.base_url ?? 'http://fronius-local'; // local IP typically
  const authHeader: Record<string, string> = creds.api_key
    ? { Authorization: `Bearer ${creds.api_key}` }
    : creds.username
    ? { Authorization: `Basic ${btoa(`${creds.username}:${creds.password ?? ''}`)}` }
    : {};
  const res = await fetch(`${base}/solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData`, {
    headers: authHeader,
  });
  if (!res.ok) throw new AdapterError('fronius', `HTTP ${res.status}`, res.status);
  const j = await res.json<{ Body?: { Data?: Record<string, { Value: number; Unit: string }> } }>();
  const d = j.Body?.Data ?? {};
  return {
    device_sn: deviceSn,
    ts: new Date().toISOString(),
    ac_kw: toNum(d.PAC?.Value) != null ? (d.PAC!.Value / 1000) : null,
    dc_kw: toNum(d.IDC?.Value) != null ? ((d.IDC!.Value * (d.UDC?.Value ?? 0)) / 1000) : null,
    daily_kwh: toNum(d.DAY_ENERGY?.Value) != null ? (d.DAY_ENERGY!.Value / 1000) : null,
    total_kwh: toNum(d.TOTAL_ENERGY?.Value) != null ? (d.TOTAL_ENERGY!.Value / 1000) : null,
    battery_soc: null,
    temperature_c: toNum(d.TEMP?.Value),
    online: !!d.PAC,
    raw: j,
  };
}

// ─── Sungrow (iSolarCloud) ────────────────────────────────────────────────────
// Docs: https://isolarcloud.com.au/
// Auth: appKey + userKey
// Similar to SolarEdge — site-level plant data

const SG_BASE = 'https://gateway.isolarcloud.eu';

async function sungrowToken(creds: ManufacturerCredentials): Promise<string> {
  const cacheKey = `sungrow:${creds.username}`;
  const cached = getCachedToken(cacheKey);
  if (cached) return cached;

  const base = creds.base_url ?? SG_BASE;
  const res = await fetch(`${base}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': creds.api_key! },
    body: JSON.stringify({ user_account: creds.username, user_password: creds.password, appkey: creds.client_id }),
  });
  if (!res.ok) throw new AdapterError('sungrow', `Auth HTTP ${res.status}`, res.status);
  const j = await res.json<{ result_data?: { token?: string } }>();
  const token = j.result_data?.token ?? '';
  if (!token) throw new AdapterError('sungrow', 'No token in login response');
  setCachedToken(cacheKey, token, 7200);
  return token;
}

async function sungrowRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const token = await sungrowToken(creds);
  const base = creds.base_url ?? SG_BASE;
  const siteId = creds.site_id;
  if (!siteId) throw new AdapterError('sungrow', 'site_id required');
  const res = await fetch(`${base}/openapi/getPsDetailWithPsType?ps_id=${siteId}`, {
    headers: { Token: token, 'x-access-key': creds.api_key! },
  });
  if (!res.ok) throw new AdapterError('sungrow', `HTTP ${res.status}`, res.status);
  const j = await res.json<{ result_data?: Record<string, unknown> }>();
  const d = j.result_data ?? {};
  return {
    device_sn: deviceSn,
    ts: new Date().toISOString(),
    ac_kw: toNum(d.p_ac_output_total_active),
    dc_kw: toNum(d.p_pv_input_total),
    daily_kwh: toNum(d.p_generation_today_kwh),
    total_kwh: toNum(d.p_total_generation_kwh),
    battery_soc: toNum(d.bat_soc),
    temperature_c: null,
    online: (d.device_status as number) === 1,
    raw: d,
  };
}

// ─── Victron (VRM API) ───────────────────────────────────────────────────────
// Docs: https://vrm-api-docs.victronenergy.com/
// Auth: Bearer token (VRM API token)
// site_id = VRM installation ID

const VICTRON_BASE = 'https://vrmapi.victronenergy.com/v2';

async function victronRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const base = creds.base_url ?? VICTRON_BASE;
  const siteId = creds.site_id;
  if (!siteId) throw new AdapterError('victron', 'site_id (VRM installation ID) required');
  const token = creds.token ?? creds.api_key;
  if (!token) throw new AdapterError('victron', 'token required');
  const res = await fetch(`${base}/installations/${siteId}/overview`, {
    headers: { 'X-Authorization': `Token ${token}` },
  });
  if (!res.ok) throw new AdapterError('victron', `HTTP ${res.status}`, res.status);
  const j = await res.json<{ records?: { solar?: { current?: number; power?: number; totalToday?: number }; soc?: number } }>();
  const r = j.records ?? {};
  const solar = r.solar ?? {};
  return {
    device_sn: deviceSn,
    ts: new Date().toISOString(),
    ac_kw: toNum(solar.power) != null ? (solar.power! / 1000) : null,
    dc_kw: null,
    daily_kwh: toNum(solar.totalToday),
    total_kwh: null, // VRM doesn't expose in overview
    battery_soc: toNum(r.soc),
    temperature_c: null,
    online: !!r.solar,
    raw: j,
  };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export async function getRealtimeReading(
  creds: ManufacturerCredentials,
  deviceSn: string,
): Promise<InverterReading> {
  switch (creds.manufacturer) {
    case 'solax':      return solaxRealtime(creds, deviceSn);
    case 'solaredge':  return solarEdgeRealtime(creds, deviceSn);
    case 'huawei':     return huaweiRealtime(creds, deviceSn);
    case 'fronius':    return froniusRealtime(creds, deviceSn);
    case 'sungrow':    return sungrowRealtime(creds, deviceSn);
    case 'victron':    return victronRealtime(creds, deviceSn);
    default:
      throw new AdapterError(creds.manufacturer as Manufacturer, 'Adapter not yet implemented');
  }
}

export async function getHistoricalData(
  creds: ManufacturerCredentials,
  deviceSn: string,
  startMs: number,
  endMs: number,
  intervalMin?: number,
): Promise<InverterHistoryPoint[]> {
  switch (creds.manufacturer) {
    case 'solax': return solaxHistory(creds, deviceSn, startMs, endMs, intervalMin);
    default:
      throw new AdapterError(creds.manufacturer as Manufacturer, 'Historical data adapter not yet implemented');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export const SUPPORTED_MANUFACTURERS: Manufacturer[] = [
  'solax', 'solaredge', 'huawei', 'fronius', 'sungrow', 'victron',
];
