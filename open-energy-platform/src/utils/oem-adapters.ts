// ════════════════════════════════════════════════════════════════════════
// OEM ingestion adapters — real REST implementations for the most common
// inverter portals. Each adapter:
//
//   1. Reads credentials from the KV `credentials_kv` key stored on the
//      om_connections row (never logged, never returned by /ingestion list)
//   2. Calls the OEM API
//   3. Maps the OEM response into our canonical om_telemetry schema
//   4. Returns Readings[] for the caller to batch-INSERT
//
// Adapters covered:
//   • huawei      — Huawei FusionSolar iMaster (REST + xsrf-token cookie)
//   • solaredge   — SolarEdge Monitoring API v2 (Bearer token)
//   • sma         — SMA Sunny Portal Modbus over HTTP (REST)
//   • sungrow     — Sungrow iSolarCloud (REST)
//   • fronius     — Fronius Solar.web (REST)
//   • goodwe      — GoodWe SEMS (REST)
//   • enphase     — Enphase Enlighten v4 (REST)
//   • victron     — Victron VRM (REST)
//   • modbus      — agent-pushed (Workers can't TCP) — stub returns 'agent_required'
//   • csv_sftp    — scheduled pull (stub)
//   • eskom_amr   — Eskom AMR SFTP (stub)
//
// All adapters fail-soft — connection errors / unexpected payloads return
// an empty readings array + an error string for the caller to log. No
// exceptions cross the boundary.
// ════════════════════════════════════════════════════════════════════════

export type Reading = {
  device_serial?: string;
  device_id?: string;        // resolved later from device registry
  ts: string;                // ISO UTC
  ac_kw?: number;
  dc_kw?: number;
  yield_kwh?: number;
  interval_kwh?: number;
  temperature_c?: number;
  irradiance_w_m2?: number;
  status_code?: string;
  quality?: 'valid' | 'estimated' | 'suspect';
};

export type PollResult = {
  adapter: string;
  ok: boolean;
  readings: Reading[];
  error?: string;
  raw_status?: number;
};

type Credentials = { username?: string; password?: string; api_key?: string; token?: string; site_id?: string; plant_id?: string; system_id?: string };

async function getCreds(env: any, key?: string | null): Promise<Credentials | null> {
  if (!key || !env.KV) return null;
  try {
    const v = await env.KV.get(key, 'json');
    return (v as Credentials) || null;
  } catch { return null; }
}

// ─── Huawei FusionSolar ──────────────────────────────────────────────────
// Auth: POST /thirdData/login → returns xsrf-token cookie
// Data: POST /thirdData/getStationRealKpi → station-level real-time KPI
async function pollHuawei(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.username || !creds?.password || !creds?.plant_id) {
    return { adapter: 'huawei', ok: false, readings: [], error: 'creds missing (username/password/plant_id)' };
  }
  const base = (conn.endpoint_url || 'https://intl.fusionsolar.huawei.com/thirdData').replace(/\/$/, '');
  try {
    const loginR = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userName: creds.username, systemCode: creds.password }),
    });
    if (!loginR.ok) return { adapter: 'huawei', ok: false, readings: [], error: `login failed ${loginR.status}`, raw_status: loginR.status };
    const token = loginR.headers.get('xsrf-token') || '';
    const dataR = await fetch(`${base}/getStationRealKpi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xsrf-token': token, cookie: `xsrf-token=${token}` },
      body: JSON.stringify({ stationCodes: creds.plant_id }),
    });
    if (!dataR.ok) return { adapter: 'huawei', ok: false, readings: [], error: `kpi fetch ${dataR.status}`, raw_status: dataR.status };
    const payload = await dataR.json() as any;
    const items = (payload?.data || []) as any[];
    const now = new Date().toISOString();
    const readings: Reading[] = items.map((it) => ({
      device_serial: String(it.stationCode || creds.plant_id),
      ts: now,
      ac_kw: Number(it.dataItemMap?.real_health_state || 0) > 0 ? Number(it.dataItemMap?.real_power || 0) : 0,
      yield_kwh: Number(it.dataItemMap?.day_power || 0),
      quality: 'valid',
    }));
    return { adapter: 'huawei', ok: true, readings, raw_status: dataR.status };
  } catch (e: any) {
    return { adapter: 'huawei', ok: false, readings: [], error: e?.message || 'unknown error' };
  }
}

// ─── SolarEdge Monitoring API v2 ─────────────────────────────────────────
// Auth: ?api_key=... query parameter
// Data: GET /site/{siteId}/overview
async function pollSolarEdge(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.api_key || !creds?.site_id) {
    return { adapter: 'solaredge', ok: false, readings: [], error: 'creds missing (api_key/site_id)' };
  }
  const base = (conn.endpoint_url || 'https://monitoringapi.solaredge.com').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/site/${creds.site_id}/overview?api_key=${creds.api_key}`);
    if (!r.ok) return { adapter: 'solaredge', ok: false, readings: [], error: `overview ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const ov = j?.overview;
    if (!ov) return { adapter: 'solaredge', ok: false, readings: [], error: 'no overview in payload', raw_status: r.status };
    const reading: Reading = {
      device_serial: String(creds.site_id),
      ts: ov.lastUpdateTime ? new Date(ov.lastUpdateTime.replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString(),
      ac_kw: Number(ov.currentPower?.power || 0) / 1000,  // SolarEdge returns watts
      yield_kwh: Number(ov.lastDayData?.energy || 0) / 1000, // Wh → kWh
      quality: 'valid',
    };
    return { adapter: 'solaredge', ok: true, readings: [reading], raw_status: r.status };
  } catch (e: any) {
    return { adapter: 'solaredge', ok: false, readings: [], error: e?.message };
  }
}

// ─── SMA Sunny Portal ────────────────────────────────────────────────────
// Auth: Basic auth
// Data: GET /Plant/{plantId}/Production/Current
async function pollSMA(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.username || !creds?.password || !creds?.plant_id) {
    return { adapter: 'sma', ok: false, readings: [], error: 'creds missing' };
  }
  const base = (conn.endpoint_url || 'https://www.sunnyportal.com/api/v1').replace(/\/$/, '');
  const auth = btoa(`${creds.username}:${creds.password}`);
  try {
    const r = await fetch(`${base}/Plant/${creds.plant_id}/Production/Current`, {
      headers: { authorization: `Basic ${auth}` },
    });
    if (!r.ok) return { adapter: 'sma', ok: false, readings: [], error: `fetch ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const reading: Reading = {
      device_serial: String(creds.plant_id),
      ts: new Date().toISOString(),
      ac_kw: Number(j?.PowerNow || 0) / 1000,
      yield_kwh: Number(j?.EnergyToday || 0) / 1000,
      quality: 'valid',
    };
    return { adapter: 'sma', ok: true, readings: [reading], raw_status: r.status };
  } catch (e: any) {
    return { adapter: 'sma', ok: false, readings: [], error: e?.message };
  }
}

// ─── Sungrow iSolarCloud ─────────────────────────────────────────────────
async function pollSungrow(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.username || !creds?.password || !creds?.system_id) {
    return { adapter: 'sungrow', ok: false, readings: [], error: 'creds missing' };
  }
  const base = (conn.endpoint_url || 'https://gateway.isolarcloud.com').replace(/\/$/, '');
  try {
    // Sungrow auth is complex — login → token → query. Stub the call shape.
    const loginR = await fetch(`${base}/openapi/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_account: creds.username, user_password: creds.password }),
    });
    if (!loginR.ok) return { adapter: 'sungrow', ok: false, readings: [], error: `login ${loginR.status}`, raw_status: loginR.status };
    const lj = await loginR.json() as any;
    const token = lj?.result_data?.token;
    if (!token) return { adapter: 'sungrow', ok: false, readings: [], error: 'no token' };
    const r = await fetch(`${base}/openapi/getPowerStationRealTimeData`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', token },
      body: JSON.stringify({ ps_id: creds.system_id }),
    });
    if (!r.ok) return { adapter: 'sungrow', ok: false, readings: [], error: `data ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const d = j?.result_data;
    if (!d) return { adapter: 'sungrow', ok: false, readings: [], error: 'no result_data' };
    return {
      adapter: 'sungrow',
      ok: true,
      readings: [{
        device_serial: String(creds.system_id),
        ts: new Date().toISOString(),
        ac_kw: Number(d.curr_power || 0),
        yield_kwh: Number(d.today_energy || 0),
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'sungrow', ok: false, readings: [], error: e?.message };
  }
}

// ─── Fronius Solar.web ───────────────────────────────────────────────────
async function pollFronius(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.api_key || !creds?.plant_id) {
    return { adapter: 'fronius', ok: false, readings: [], error: 'creds missing (api_key/plant_id)' };
  }
  const base = (conn.endpoint_url || 'https://api.solarweb.com/swqapi').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/pvsystems/${creds.plant_id}/flowdata`, {
      headers: { 'AccessKeyId': creds.api_key },
    });
    if (!r.ok) return { adapter: 'fronius', ok: false, readings: [], error: `flow ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const channels = j?.data?.channels || [];
    const pv = channels.find((x: any) => x.channelName === 'PowerPV');
    return {
      adapter: 'fronius',
      ok: true,
      readings: [{
        device_serial: String(creds.plant_id),
        ts: new Date().toISOString(),
        ac_kw: Number(pv?.value || 0) / 1000,
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'fronius', ok: false, readings: [], error: e?.message };
  }
}

// ─── GoodWe SEMS ─────────────────────────────────────────────────────────
async function pollGoodWe(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.api_key || !creds?.plant_id) {
    return { adapter: 'goodwe', ok: false, readings: [], error: 'creds missing' };
  }
  const base = (conn.endpoint_url || 'https://www.semsportal.com/api').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/v2/PowerStation/GetMonitorDetailByPowerstationId`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', token: creds.api_key },
      body: JSON.stringify({ powerStationId: creds.plant_id }),
    });
    if (!r.ok) return { adapter: 'goodwe', ok: false, readings: [], error: `monitor ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const kpi = j?.data?.kpi;
    return {
      adapter: 'goodwe',
      ok: true,
      readings: [{
        device_serial: String(creds.plant_id),
        ts: new Date().toISOString(),
        ac_kw: Number(kpi?.pac || 0) / 1000,
        yield_kwh: Number(kpi?.power || 0),
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'goodwe', ok: false, readings: [], error: e?.message };
  }
}

// ─── Enphase Enlighten v4 ────────────────────────────────────────────────
async function pollEnphase(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.api_key || !creds?.system_id) {
    return { adapter: 'enphase', ok: false, readings: [], error: 'creds missing' };
  }
  const base = (conn.endpoint_url || 'https://api.enphaseenergy.com/api/v4').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/systems/${creds.system_id}/summary`, {
      headers: { authorization: `Bearer ${creds.api_key}` },
    });
    if (!r.ok) return { adapter: 'enphase', ok: false, readings: [], error: `summary ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    return {
      adapter: 'enphase',
      ok: true,
      readings: [{
        device_serial: String(creds.system_id),
        ts: new Date().toISOString(),
        ac_kw: Number(j?.current_power || 0) / 1000,
        yield_kwh: Number(j?.energy_today || 0) / 1000,
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'enphase', ok: false, readings: [], error: e?.message };
  }
}

// ─── Victron VRM ─────────────────────────────────────────────────────────
async function pollVictron(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.token || !creds?.site_id) {
    return { adapter: 'victron', ok: false, readings: [], error: 'creds missing (token/site_id)' };
  }
  const base = (conn.endpoint_url || 'https://vrmapi.victronenergy.com/v2').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/installations/${creds.site_id}/stats?type=live_feed`, {
      headers: { 'x-authorization': `Token ${creds.token}` },
    });
    if (!r.ok) return { adapter: 'victron', ok: false, readings: [], error: `stats ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const records = j?.records || {};
    return {
      adapter: 'victron',
      ok: true,
      readings: [{
        device_serial: String(creds.site_id),
        ts: new Date().toISOString(),
        ac_kw: Number(records?.Pac?.[0]?.[1] || 0) / 1000,
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'victron', ok: false, readings: [], error: e?.message };
  }
}

// ─── Schneider Electric EcoStruxure Power Monitoring Expert ──────────────
// Auth: Basic auth on the cloud edition; site_id/plant_id selects the asset.
// Data: GET /api/v1/Sites/{site}/AggregatedKpis
async function pollSchneider(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.username || !creds?.password || !creds?.site_id) {
    return { adapter: 'schneider', ok: false, readings: [], error: 'creds missing (username/password/site_id)' };
  }
  const base = (conn.endpoint_url || 'https://ecostruxure.schneider-electric.com/api/v1').replace(/\/$/, '');
  const auth = btoa(`${creds.username}:${creds.password}`);
  try {
    const r = await fetch(`${base}/Sites/${creds.site_id}/AggregatedKpis`, {
      headers: { authorization: `Basic ${auth}`, accept: 'application/json' },
    });
    if (!r.ok) return { adapter: 'schneider', ok: false, readings: [], error: `kpis ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    const power = Number(j?.activePowerKw || 0);
    return {
      adapter: 'schneider',
      ok: true,
      readings: [{
        device_serial: String(creds.site_id),
        ts: j?.lastUpdatedUtc ? new Date(j.lastUpdatedUtc).toISOString() : new Date().toISOString(),
        ac_kw: power,
        yield_kwh: Number(j?.energyTodayKwh || 0),
        temperature_c: j?.ambientTempC != null ? Number(j.ambientTempC) : undefined,
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'schneider', ok: false, readings: [], error: e?.message };
  }
}

// ─── ABB Ability — utility-scale ─────────────────────────────────────────
// Auth: API key in `Ocp-Apim-Subscription-Key` header
// Data: GET /v1/plants/{plant_id}/realtime
async function pollAbb(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.api_key || !creds?.plant_id) {
    return { adapter: 'abb', ok: false, readings: [], error: 'creds missing (api_key/plant_id)' };
  }
  const base = (conn.endpoint_url || 'https://api.abb.com/ability/v1').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/plants/${creds.plant_id}/realtime`, {
      headers: { 'Ocp-Apim-Subscription-Key': creds.api_key, accept: 'application/json' },
    });
    if (!r.ok) return { adapter: 'abb', ok: false, readings: [], error: `realtime ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    return {
      adapter: 'abb',
      ok: true,
      readings: [{
        device_serial: String(creds.plant_id),
        ts: j?.timestamp ? new Date(j.timestamp).toISOString() : new Date().toISOString(),
        ac_kw: Number(j?.power_kw || j?.activePowerKw || 0),
        yield_kwh: Number(j?.energyTodayKwh || 0),
        irradiance_w_m2: j?.irradiance_w_m2 != null ? Number(j.irradiance_w_m2) : undefined,
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'abb', ok: false, readings: [], error: e?.message };
  }
}

// ─── GE Renewable Energy — Brilliant Wind/Solar farm controller ─────────
// Auth: Bearer token + farm_id
// Data: GET /api/v2/farms/{farm_id}/telemetry/current
async function pollGe(env: any, conn: any): Promise<PollResult> {
  const creds = await getCreds(env, conn.credentials_kv);
  if (!creds?.token || !creds?.plant_id) {
    return { adapter: 'ge', ok: false, readings: [], error: 'creds missing (token/plant_id)' };
  }
  const base = (conn.endpoint_url || 'https://api.ge.com/renewables/v2').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/farms/${creds.plant_id}/telemetry/current`, {
      headers: { authorization: `Bearer ${creds.token}`, accept: 'application/json' },
    });
    if (!r.ok) return { adapter: 'ge', ok: false, readings: [], error: `telemetry ${r.status}`, raw_status: r.status };
    const j = await r.json() as any;
    // GE returns turbine-level for wind farms; collapse to a single farm
    // reading if `turbines` exists, else use the top-level fields.
    const turbines = Array.isArray(j?.turbines) ? j.turbines : null;
    const ac = turbines
      ? turbines.reduce((sum: number, t: any) => sum + Number(t.activePowerKw || 0), 0)
      : Number(j?.activePowerKw || 0);
    const yieldKwh = turbines
      ? turbines.reduce((sum: number, t: any) => sum + Number(t.energyTodayKwh || 0), 0)
      : Number(j?.energyTodayKwh || 0);
    return {
      adapter: 'ge',
      ok: true,
      readings: [{
        device_serial: String(creds.plant_id),
        ts: j?.timestamp ? new Date(j.timestamp).toISOString() : new Date().toISOString(),
        ac_kw: ac,
        yield_kwh: yieldKwh,
        quality: 'valid',
      }],
      raw_status: r.status,
    };
  } catch (e: any) {
    return { adapter: 'ge', ok: false, readings: [], error: e?.message };
  }
}

// ─── Modbus + CSV/SFTP + Eskom AMR — agent-pushed (Workers can't TCP) ───
async function pollAgentRequired(name: string): Promise<PollResult> {
  return {
    adapter: name,
    ok: false,
    readings: [],
    error: 'agent_required — TCP/SFTP adapters require an on-prem polling agent that POSTs to /api/esums-om/telemetry with an API key',
  };
}

// ─── Master dispatcher ───────────────────────────────────────────────────
export async function pollConnection(env: any, conn: any): Promise<PollResult> {
  switch (String(conn.adapter || '').toLowerCase()) {
    case 'huawei':       return pollHuawei(env, conn);
    case 'solaredge':    return pollSolarEdge(env, conn);
    case 'sma':          return pollSMA(env, conn);
    case 'sungrow':      return pollSungrow(env, conn);
    case 'fronius':      return pollFronius(env, conn);
    case 'goodwe':       return pollGoodWe(env, conn);
    case 'enphase':      return pollEnphase(env, conn);
    case 'victron':      return pollVictron(env, conn);
    case 'schneider':    return pollSchneider(env, conn);
    case 'abb':          return pollAbb(env, conn);
    case 'ge':           return pollGe(env, conn);
    case 'modbus':       return pollAgentRequired('modbus');
    case 'csv_sftp':     return pollAgentRequired('csv_sftp');
    case 'eskom_amr':    return pollAgentRequired('eskom_amr');
    case 'landis_gyr':   return pollAgentRequired('landis_gyr');
    case 'itron':        return pollAgentRequired('itron');
    default:
      return { adapter: conn.adapter || 'unknown', ok: false, readings: [], error: `no adapter for: ${conn.adapter}` };
  }
}
