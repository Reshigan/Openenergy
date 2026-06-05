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
  // ── Solar inverters ──────────────────────────────────────────────────────
  | 'solax'
  | 'solaredge'
  | 'huawei'
  | 'fronius'
  | 'sungrow'
  | 'victron'
  | 'growatt'
  | 'sma'
  // ── Wind turbines (SCADA / API — adapters stub until OEM endpoint confirmed)
  | 'vestas'
  | 'siemens_gamesa'
  | 'goldwind'
  | 'envision'
  // ── Hydro & run-of-river (OPC-UA SCADA — adapter stub)
  | 'andritz'
  | 'voith'
  | 'hydro_scada'
  // ── Waste-to-energy & biomass (DCS SCADA — adapter stub)
  | 'babcock'
  | 'covanta'
  | 'waste_scada';

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
  interval_kwh: number | null;  // daily yield up to this snapshot (resets at midnight)
  total_kwh: number | null;     // lifetime cumulative yield (monotonically increasing)
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

// ─── Base-URL SSRF allowlist ──────────────────────────────────────────────────
// Each manufacturer may only use its own cloud endpoint.
// base_url is optional; when null the hardcoded default is used (safe).
// When a participant supplies base_url, it must match this list exactly.
//
// Rules enforced by validateBaseUrl() and validateOpenBaseUrl():
//   1. Must parse as a valid URL.
//   2. Scheme must be https: — no plaintext transport.
//   3. Hostname must not be an IPv4/v6 literal (blocks metadata/internal IPs).
//   4. Hostname must not be in the metadata/internal blocklist (cloud IMDs, mDNS, etc.).
//   5. For known manufacturers: hostname must end with one of the per-manufacturer
//      allowed suffixes.  For custom/open use: suffix check is skipped but rules
//      1–4 still apply unconditionally.
//
// NOTE: hydro_scada and waste_scada still have an empty suffix list because their
// customer-supplied SCADA endpoints vary by site.  Rules 1–4 are enforced for
// these types as they are for all others — the empty list only skips rule 5.

const BASE_URL_ALLOWLIST: Record<Manufacturer, string[]> = {
  // Solar
  solax:         ['solaxcloud.com'],
  solaredge:     ['solaredge.com'],
  huawei:        ['fusionsolar.huawei.com', 'huawei.com'],
  fronius:       ['solarweb.com', 'fronius.com'],
  sungrow:       ['isolarcloud.eu', 'isolarcloud.com.au', 'isolarcloud.com'],
  victron:       ['victronenergy.com'],
  growatt:       ['growatt.com'],
  sma:           ['sunnyportal.com', 'sma.de'],
  // Wind
  vestas:        ['vestas.com', 'rdsims.vestas.com'],
  siemens_gamesa:['siemensgamesa.com', 'siemens-gamesa.com'],
  goldwind:      ['goldwindscada.com', 'goldwind.com'],
  envision:      ['envisioniot.com', 'envision-group.com'],
  // Hydro / run-of-river — hostname varies by site; suffix check skipped (rules 1–4 still apply)
  andritz:       ['andritz.com'],
  voith:         ['voith.com'],
  hydro_scada:   [],
  // Waste-to-energy / biomass — hostname varies by site; suffix check skipped (rules 1–4 still apply)
  babcock:       ['babcock.com'],
  covanta:       ['covanta.com'],
  waste_scada:   [],
};

// IPv4 + IPv6 literal patterns (covers RFC1918, loopback, link-local, ::1, etc.)
const IP_LITERAL_RE = /^(?:\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

// Cloud instance-metadata hostnames and private DNS zone suffixes that must
// never be reachable from the platform, regardless of allowlist entries.
// Applied unconditionally by both validateBaseUrl and validateOpenBaseUrl.
const METADATA_HOSTNAME_BLOCKLIST = new Set([
  'metadata.google.internal',   // GCP IMDS
  'metadata.google',
  'metadata.internal',          // common internal DNS alias
  'instance-data',              // common SCADA internal alias
  'instance-data.ec2.internal', // AWS EC2 internal
  'ecs.internal',
]);

// Hostname suffix patterns that indicate non-public resolver zones.
// mDNS (.local), private DNS (.internal), Windows domain (.localdomain) etc.
const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost', '.localdomain'];

function assertNotMetadata(hostname: string, label: string): void {
  if (METADATA_HOSTNAME_BLOCKLIST.has(hostname)) {
    throw new Error(`${label}: hostname '${hostname}' is not permitted`);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`${label}: hostname suffix '${suffix}' is not permitted`);
    }
  }
}

export function validateBaseUrl(manufacturer: Manufacturer, rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AdapterError(manufacturer, 'base_url is not a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new AdapterError(manufacturer, 'base_url must use https:');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (IP_LITERAL_RE.test(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new AdapterError(manufacturer, 'base_url must be a domain name, not an IP address or localhost');
  }

  try {
    assertNotMetadata(hostname, 'base_url');
  } catch (e) {
    throw new AdapterError(manufacturer, (e as Error).message);
  }

  const allowed = BASE_URL_ALLOWLIST[manufacturer] ?? [];
  if (allowed.length > 0) {
    const permitted = allowed.some(s => hostname === s || hostname.endsWith(`.${s}`));
    if (!permitted) {
      throw new AdapterError(
        manufacturer,
        `base_url hostname '${hostname}' is not in the allowed list for ${manufacturer} (allowed: ${allowed.join(', ')})`,
      );
    }
  }
}

// validateOpenBaseUrl — for custom/user-defined manufacturer slugs that are not
// in SUPPORTED_MANUFACTURERS.  Enforces rules 1–4 (scheme, IP, metadata blocklist)
// but skips the per-manufacturer hostname suffix check (rule 5) since the OEM
// endpoint is not known in advance.  Do NOT use this as a general bypass.
export function validateOpenBaseUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('base_url is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('base_url must use https:');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (IP_LITERAL_RE.test(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('base_url must be a domain name, not an IP address or localhost');
  }
  assertNotMetadata(hostname, 'base_url');
}

// Checked fetch: when a user-supplied base URL is provided, validates it and
// blocks redirects (redirect: 'manual') so a malicious upstream redirect can't
// pivot to an internal service.  For hardcoded default bases (base === undefined)
// redirects are followed normally — Solax EU→global fallback requires this.
function safeFetch(manufacturer: Manufacturer, base: string | undefined, defaultBase: string, path: string, init?: RequestInit): Promise<Response> {
  const resolvedBase = base ?? defaultBase;
  if (base) {
    validateBaseUrl(manufacturer, base);
    return fetch(`${resolvedBase}${path}`, { ...init, redirect: 'manual' });
  }
  return fetch(`${resolvedBase}${path}`, init);
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
const SOLAX_BASE_GLOBAL = 'https://openapi.solaxcloud.com';
const SOLAX_BTYPE = 4; // C&I

async function solaxToken(creds: ManufacturerCredentials): Promise<string> {
  const cacheKey = `solax:${creds.client_id}`;
  const cached = getCachedToken(cacheKey);
  if (cached) return cached;

  const res = await safeFetch('solax', creds.base_url ?? undefined, SOLAX_BASE, '/openapi/auth/oauth/token', {
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
  const params = new URLSearchParams({ snList: deviceSn, deviceType: '1', businessType: String(SOLAX_BTYPE) });
  const res = await safeFetch('solax', creds.base_url ?? undefined, SOLAX_BASE, `/openapi/v2/device/realtime_data?${params}`, {
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
  const params = new URLSearchParams({
    snList: deviceSn, deviceType: '1',
    startTime: String(startMs), endTime: String(endMs),
    timeInterval: String(intervalMin),
    businessType: String(SOLAX_BTYPE),
  });
  const path = `/openapi/v2/device/history_data?${params}`;
  const headers = { Authorization: `bearer ${token}`, Accept: '*/*' };

  // Try configured/EU endpoint first, then fall back to global if empty result.
  // SA inverters registered before 2026 may live on the global server.
  const parsePoints = (j: { code: number; result?: Array<Record<string, unknown>> }) =>
    (j.result ?? []).map((d) => ({
      ts: (d.dataTime as string) ?? '',
      ac_kw: toNum(d.totalActivePower),
      dc_kw: toNum(d.MPPTTotalInputPower),
      interval_kwh: toNum(d.dailyYield),
      total_kwh: toNum(d.totalYield),
      temperature_c: toNum(d.inverterTemperature),
    }));

  const res1 = await safeFetch('solax', creds.base_url ?? undefined, SOLAX_BASE, path, { headers });
  const j1 = await res1.json<{ code: number; result?: Array<Record<string, unknown>> }>();
  const pts1 = parsePoints(j1);
  if (pts1.length > 0) return pts1;

  // EU returned empty — try global endpoint as fallback for pre-2026 data
  try {
    const res2 = await safeFetch('solax', undefined, SOLAX_BASE_GLOBAL, path, { headers });
    const j2 = await res2.json<{ code: number; result?: Array<Record<string, unknown>> }>();
    return parsePoints(j2);
  } catch {
    return pts1; // EU empty is the best we have
  }
}

// ─── SolarEdge ───────────────────────────────────────────────────────────────
// Docs: https://developers.solaredge.com/
// Auth: api_key query parameter
// Site ID is the plant_id stored in solax_stations.plant_id

const SE_BASE = 'https://monitoringapi.solaredge.com';

async function solarEdgeRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  const siteId = creds.site_id;
  if (!siteId) throw new AdapterError('solaredge', 'site_id required');
  const res = await safeFetch('solaredge', creds.base_url ?? undefined, SE_BASE, `/site/${siteId}/overview?api_key=${creds.api_key}`);
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

  const res = await safeFetch('huawei', creds.base_url ?? undefined, HUAWEI_BASE, '/login', {
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
  const res = await safeFetch('huawei', creds.base_url ?? undefined, HUAWEI_BASE, '/getDevRealKpi', {
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
// Auth: API key or basic auth via Fronius Solarweb cloud (https://solarweb.com).
// base_url is required — no insecure default so credentials are never sent
// over plaintext transport.

async function froniusRealtime(creds: ManufacturerCredentials, deviceSn: string): Promise<InverterReading> {
  if (!creds.base_url) {
    throw new AdapterError('fronius', 'base_url is required for Fronius (use https://www.solarweb.com or a secure Fronius endpoint)');
  }
  const authHeader: Record<string, string> = creds.api_key
    ? { Authorization: `Bearer ${creds.api_key}` }
    : creds.username
    ? { Authorization: `Basic ${btoa(`${creds.username}:${creds.password ?? ''}`)}` }
    : {};
  const res = await safeFetch('fronius', creds.base_url, '', '/solar_api/v1/GetInverterRealtimeData.cgi?Scope=Device&DeviceId=1&DataCollection=CommonInverterData', {
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

  const res = await safeFetch('sungrow', creds.base_url ?? undefined, SG_BASE, '/openapi/login', {
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
  const siteId = creds.site_id;
  if (!siteId) throw new AdapterError('sungrow', 'site_id required');
  const res = await safeFetch('sungrow', creds.base_url ?? undefined, SG_BASE, `/openapi/getPsDetailWithPsType?ps_id=${siteId}`, {
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
  const siteId = creds.site_id;
  if (!siteId) throw new AdapterError('victron', 'site_id (VRM installation ID) required');
  const token = creds.token ?? creds.api_key;
  if (!token) throw new AdapterError('victron', 'token required');
  const res = await safeFetch('victron', creds.base_url ?? undefined, VICTRON_BASE, `/installations/${siteId}/overview`, {
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
    // Solar
    case 'solax':      return solaxRealtime(creds, deviceSn);
    case 'solaredge':  return solarEdgeRealtime(creds, deviceSn);
    case 'huawei':     return huaweiRealtime(creds, deviceSn);
    case 'fronius':    return froniusRealtime(creds, deviceSn);
    case 'sungrow':    return sungrowRealtime(creds, deviceSn);
    case 'victron':    return victronRealtime(creds, deviceSn);
    // Stubs — wind / hydro / waste SCADA adapters not yet implemented
    case 'vestas':
    case 'siemens_gamesa':
    case 'goldwind':
    case 'envision':
      throw new AdapterError(creds.manufacturer, 'Wind SCADA adapter not yet implemented — credentials stored, awaiting OEM SCADA endpoint');
    case 'andritz':
    case 'voith':
    case 'hydro_scada':
      throw new AdapterError(creds.manufacturer, 'Hydro SCADA adapter not yet implemented — credentials stored, awaiting OPC-UA endpoint');
    case 'babcock':
    case 'covanta':
    case 'waste_scada':
      throw new AdapterError(creds.manufacturer, 'Waste-to-energy SCADA adapter not yet implemented — credentials stored, awaiting DCS endpoint');
    default:
      throw new AdapterError(creds.manufacturer as Manufacturer, 'Unknown manufacturer');
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

export const SOLAR_MANUFACTURERS: Manufacturer[] = ['solax', 'solaredge', 'huawei', 'fronius', 'sungrow', 'victron', 'growatt', 'sma'];
export const WIND_MANUFACTURERS: Manufacturer[] = ['vestas', 'siemens_gamesa', 'goldwind', 'envision'];
export const HYDRO_MANUFACTURERS: Manufacturer[] = ['andritz', 'voith', 'hydro_scada'];
export const WASTE_MANUFACTURERS: Manufacturer[] = ['babcock', 'covanta', 'waste_scada'];

export const SUPPORTED_MANUFACTURERS: Manufacturer[] = [
  ...SOLAR_MANUFACTURERS, ...WIND_MANUFACTURERS, ...HYDRO_MANUFACTURERS, ...WASTE_MANUFACTURERS,
];

export const MANUFACTURER_TECH: Record<Manufacturer, 'solar' | 'wind' | 'hydro' | 'waste'> = {
  solax: 'solar', solaredge: 'solar', huawei: 'solar', fronius: 'solar',
  sungrow: 'solar', victron: 'solar', growatt: 'solar', sma: 'solar',
  vestas: 'wind', siemens_gamesa: 'wind', goldwind: 'wind', envision: 'wind',
  andritz: 'hydro', voith: 'hydro', hydro_scada: 'hydro',
  babcock: 'waste', covanta: 'waste', waste_scada: 'waste',
};

// Whether a live adapter exists (false = credentials stored but polling will error)
export const ADAPTER_LIVE: Record<Manufacturer, boolean> = {
  solax: true, solaredge: true, huawei: true, fronius: true,
  sungrow: true, victron: true, growatt: false, sma: false,
  vestas: false, siemens_gamesa: false, goldwind: false, envision: false,
  andritz: false, voith: false, hydro_scada: false,
  babcock: false, covanta: false, waste_scada: false,
};
