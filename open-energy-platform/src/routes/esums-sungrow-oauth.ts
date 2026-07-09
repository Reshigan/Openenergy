// ════════════════════════════════════════════════════════════════════════
// Sungrow iSolarCloud — OAuth 2.0 authorized-app flow.
//
// iSolarCloud's "authorized-app" flow lets a platform pull a customer's plant
// data without holding their iSolarCloud password: the customer clicks through
// a browser consent page, iSolarCloud redirects back with a ?code, and we
// exchange that for a long-lived access_token scoped to the plants they own.
//
//   GET /authorize   (AUTH)   -> 302 to the iSolarCloud consent page.
//                               KV state binds the flow to the logged-in
//                               participant so the callback knows whose row
//                               to write. Optional ?site_id=<ps_id> is carried
//                               through so realtime polling knows the plant.
//   GET /callback    (PUBLIC) -> exchange ?code for an access_token and upsert
//                               a manufacturer_credentials row (auth_type=token)
//                               for the participant the state points at.
//
// Registered redirect URL (hardcoded on the iSolarCloud app, cloudId=2,
// applicationId=3271):
//   https://oe.vantax.co.za/api/esums/manufacturers/sungrow/oauth/callback
//
// The token column stores the access_token; the Sungrow adapter's token branch
// (auth_type==='token') uses it directly against gateway.isolarcloud.com.hk,
// skipping /openapi/login. The x-access-key rides in api_key; appkey in client_id.
//
// ponytail: the exact iSolarCloud OAuth token-exchange endpoint + response shape
// are region/version specific and can't be verified from here. Both the URL and
// the app credentials are env-overridable (SUNGROW_TOKEN_URL / SUNGROW_APPKEY /
// SUNGROW_ACCESS_KEY); the callback parses the two response shapes iSolarCloud
// is documented to return (result_data.access_token | result_data.token). If a
// deployment sees a different field, extend parseAccessToken() — the one knob.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { randomId, randomOpaqueToken } from '../utils/auth-tokens';

const oauth = new Hono<HonoEnv>();

const STATE_TTL_SECONDS = 600; // 10 minutes, matches the SSO flow
const CLOUD_ID = '2';
const APPLICATION_ID = '3271';

// Registered app defaults — overridable via Worker secrets. The appkey is a
// semi-public client identifier; the access-key is sensitive, so prefer
// `wrangler secret put SUNGROW_ACCESS_KEY` and rotate the value baked in here.
const DEFAULT_APPKEY = '7273470DE56B1D395483BBBC7B204846';
const DEFAULT_ACCESS_KEY = 'h4vars78ez4p010x1i13k7bbem3mzsb6';
const DEFAULT_AUTHORIZE_URL = 'https://web3.isolarcloud.com.hk/#/authorized-app';
const DEFAULT_TOKEN_URL = 'https://gateway.isolarcloud.com.hk/openapi/apiManage/token';
const DEFAULT_GATEWAY_URL = 'https://gateway.isolarcloud.com.hk';

type Env = HonoEnv['Bindings'];
const appkey = (e: Env) => e.SUNGROW_APPKEY || DEFAULT_APPKEY;
const accessKey = (e: Env) => e.SUNGROW_ACCESS_KEY || DEFAULT_ACCESS_KEY;
const authorizeBase = (e: Env) => e.SUNGROW_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL;
const tokenUrl = (e: Env) => e.SUNGROW_TOKEN_URL || DEFAULT_TOKEN_URL;
const gatewayUrl = (e: Env) => e.SUNGROW_GATEWAY_URL || DEFAULT_GATEWAY_URL;

function redirectUri(e: Env, origin: string): string {
  const base = e.APP_BASE_URL || origin;
  return `${base}/api/esums/manufacturers/sungrow/oauth/callback`;
}

// Pull an access token out of whichever shape iSolarCloud returns. ponytail:
// the two documented shapes; add a case here if a region returns another field.
export function parseAccessToken(j: unknown): string | null {
  const r = (j as { result_data?: Record<string, unknown> })?.result_data ?? {};
  const t = r.access_token ?? r.token ?? r.accessToken;
  return typeof t === 'string' && t ? t : null;
}

// ─── GET /authorize — AUTH: start the consent flow for the current user ──────
oauth.get('/authorize', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const siteId = c.req.query('site_id') ?? null; // iSolarCloud ps_id, if known

  const stateKey = randomOpaqueToken(24);
  await c.env.KV.put(
    `sungrow:oauth:${stateKey}`,
    JSON.stringify({ participant_id: user.id, site_id: siteId, created_at: Date.now() }),
    { expirationTtl: STATE_TTL_SECONDS },
  );

  // The authorized-app page is a hash route on the iSolarCloud web console, so
  // the query lives after the fragment (?...) — mirror the exact form the app
  // was registered with.
  const params = new URLSearchParams({
    cloudId: CLOUD_ID,
    applicationId: APPLICATION_ID,
    appkey: appkey(c.env),
    redirectUrl: redirectUri(c.env, new URL(c.req.url).origin),
    state: stateKey,
  });
  return c.redirect(`${authorizeBase(c.env)}?${params.toString()}`);
});

// ─── GET /callback — PUBLIC: exchange code, upsert credentials ───────────────
oauth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const stateKey = c.req.query('state');
  const errParam = c.req.query('error');
  if (errParam) return c.redirect(`/surface/esums_owner:integrations?sungrow=${encodeURIComponent(errParam)}`);
  if (!code || !stateKey) return c.redirect('/surface/esums_owner:integrations?sungrow=missing_code');

  const stateRaw = await c.env.KV.get(`sungrow:oauth:${stateKey}`);
  if (!stateRaw) return c.redirect('/surface/esums_owner:integrations?sungrow=expired_state');
  await c.env.KV.delete(`sungrow:oauth:${stateKey}`); // single-use
  const state = JSON.parse(stateRaw) as { participant_id: string; site_id: string | null };

  // Exchange the authorization code for an access token.
  let accessToken: string | null = null;
  try {
    const resp = await fetch(tokenUrl(c.env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-key': accessKey(c.env) },
      body: JSON.stringify({
        appkey: appkey(c.env),
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(c.env, new URL(c.req.url).origin),
      }),
    });
    if (!resp.ok) {
      console.error('[sungrow-oauth] token exchange HTTP', resp.status, await resp.text().catch(() => ''));
      return c.redirect('/surface/esums_owner:integrations?sungrow=token_exchange');
    }
    accessToken = parseAccessToken(await resp.json());
  } catch (e) {
    console.error('[sungrow-oauth] token exchange error', (e as Error).message);
    return c.redirect('/surface/esums_owner:integrations?sungrow=token_error');
  }
  if (!accessToken) return c.redirect('/surface/esums_owner:integrations?sungrow=no_token');

  // Upsert a credentials row bound to the participant that started the flow.
  // auth_type='token' → the Sungrow adapter uses this token directly. Secrets
  // (client_id=appkey, api_key=x-access-key, token=access_token) come from
  // trusted config/exchange, never request input.
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO manufacturer_credentials
      (id, participant_id, manufacturer, auth_type,
       client_id, api_key, token, base_url, site_id,
       carbon_intensity_gco2_per_kwh, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(participant_id, manufacturer) DO UPDATE SET
      auth_type = excluded.auth_type,
      client_id = excluded.client_id,
      api_key = COALESCE(excluded.api_key, api_key),
      token = excluded.token,
      base_url = excluded.base_url,
      site_id = COALESCE(excluded.site_id, site_id),
      status = 'active',
      updated_at = excluded.updated_at
  `).bind(
    randomId('mfrc_'), state.participant_id, 'sungrow', 'token',
    appkey(c.env), accessKey(c.env), accessToken, gatewayUrl(c.env), state.site_id,
    950, 'active', now, now,
  ).run();

  return c.redirect('/surface/esums_owner:integrations?sungrow=connected');
});

export default oauth;
