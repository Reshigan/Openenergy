// ═══════════════════════════════════════════════════════════════════════════
// SSO Routes — Microsoft Entra ID (Azure AD) OpenID Connect authorization-code flow.
//
// Flow:
//   1. GET  /auth/sso/config           -> { enabled, providers:['microsoft'] }
//   2. POST /auth/sso/microsoft/start  -> { redirect_url } (contains state+nonce)
//   3. GET  /auth/sso/microsoft/callback?code&state
//        -> exchange code for tokens, validate id_token signature + claims,
//           find/create participant by email, issue OE JWT + session + refresh,
//           redirect browser to /sso-landing#token=…&refresh_token=…
//
// Secrets:
//   - AZURE_AD_CLIENT_ID / AZURE_AD_TENANT_ID / AZURE_AD_REDIRECT_URI — public, in wrangler.toml [vars]
//   - AZURE_AD_CLIENT_SECRET — set via `wrangler secret put AZURE_AD_CLIENT_SECRET`
//
// State/nonce:
//   - state stored in KV under sso:state:<random> with 10-minute TTL
//   - nonce embedded in state envelope and validated against id_token.nonce
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { signToken } from '../middleware/auth';
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  createSession,
  randomId,
  randomOpaqueToken,
} from '../utils/auth-tokens';
import { fireCascade } from '../utils/cascade';

const sso = new Hono<HonoEnv>();

const STATE_TTL_SECONDS = 600; // 10 minutes
const SCOPES = 'openid profile email offline_access User.Read';

function ssoEnabled(env: HonoEnv): boolean {
  return Boolean(env.AZURE_AD_CLIENT_ID && env.AZURE_AD_TENANT_ID && env.AZURE_AD_CLIENT_SECRET);
}

function authorizeUrl(env: HonoEnv): string {
  return `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/authorize`;
}

function tokenUrl(env: HonoEnv): string {
  return `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;
}

function jwksUrl(env: HonoEnv): string {
  return `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/discovery/v2.0/keys`;
}

function appBaseUrl(env: HonoEnv, fallback: string): string {
  return env.APP_BASE_URL || fallback;
}

// Allow-list of email domains that map to an admin role on first SSO provisioning.
// Other domains provision as 'offtaker' by default (safe, least-privileged for
// external users). Adjust as business rules evolve.
const ADMIN_EMAIL_DOMAINS = ['vantax.co.za'];

function provisionRoleForEmail(email: string): 'admin' | 'offtaker' {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return ADMIN_EMAIL_DOMAINS.includes(domain) ? 'admin' : 'offtaker';
}

// ─── GET /config — is SSO enabled on this environment? ─────────────────────
sso.get('/config', (c) => {
  return c.json({
    success: true,
    data: {
      enabled: ssoEnabled(c.env),
      providers: ssoEnabled(c.env) ? ['microsoft'] : [],
    },
  });
});

// ─── POST /microsoft/start — returns an authorization redirect URL ─────────
sso.post('/microsoft/start', async (c) => {
  if (!ssoEnabled(c.env)) {
    return c.json({ success: false, error: 'SSO is not configured on this environment' }, 503);
  }
  const body = await c.req.json().catch(() => ({} as { return_to?: string }));
  const returnTo = typeof body?.return_to === 'string' && body.return_to.startsWith('/') ? body.return_to : '/cockpit';

  const stateKey = randomOpaqueToken(24);
  const nonce = randomOpaqueToken(24);
  const statePayload = { nonce, return_to: returnTo, created_at: Date.now() };
  await c.env.KV.put(`sso:state:${stateKey}`, JSON.stringify(statePayload), { expirationTtl: STATE_TTL_SECONDS });

  const params = new URLSearchParams({
    client_id: c.env.AZURE_AD_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: c.env.AZURE_AD_REDIRECT_URI || `${appBaseUrl(c.env, new URL(c.req.url).origin)}/api/auth/sso/microsoft/callback`,
    response_mode: 'query',
    scope: SCOPES,
    state: stateKey,
    nonce,
    prompt: 'select_account',
  });
  const url = `${authorizeUrl(c.env)}?${params.toString()}`;
  return c.json({ success: true, data: { redirect_url: url } });
});

// ─── GET /microsoft/callback — exchange code, validate id_token, issue session ─
sso.get('/microsoft/callback', async (c) => {
  if (!ssoEnabled(c.env)) {
    return c.json({ success: false, error: 'SSO is not configured on this environment' }, 503);
  }
  const code = c.req.query('code');
  const stateKey = c.req.query('state');
  const errParam = c.req.query('error');
  if (errParam) {
    return c.redirect(`/login?sso_error=${encodeURIComponent(errParam)}`);
  }
  if (!code || !stateKey) {
    return c.redirect('/login?sso_error=missing_code');
  }

  const stateRaw = await c.env.KV.get(`sso:state:${stateKey}`);
  if (!stateRaw) {
    return c.redirect('/login?sso_error=expired_state');
  }
  await c.env.KV.delete(`sso:state:${stateKey}`); // single-use
  const state = JSON.parse(stateRaw) as { nonce: string; return_to: string };

  const redirectUri = c.env.AZURE_AD_REDIRECT_URI || `${appBaseUrl(c.env, new URL(c.req.url).origin)}/api/auth/sso/microsoft/callback`;
  const tokenResp = await fetch(tokenUrl(c.env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.AZURE_AD_CLIENT_ID!,
      client_secret: c.env.AZURE_AD_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      scope: SCOPES,
    }),
  });
  if (!tokenResp.ok) {
    const errText = await tokenResp.text().catch(() => '');
    console.error('[sso] token exchange failed', tokenResp.status, errText);
    return c.redirect('/login?sso_error=token_exchange');
  }
  const tokenJson = await tokenResp.json() as { id_token?: string; access_token?: string };
  if (!tokenJson.id_token) {
    return c.redirect('/login?sso_error=no_id_token');
  }

  // Decode the id_token (header.payload.signature) — we validate issuer + audience
  // + nonce + expiry. Full JWKS signature verification requires importing the RSA
  // public key from `jwksUrl` and calling crypto.subtle.verify. We do that below
  // to prevent token forgery.
  const parts = tokenJson.id_token.split('.');
  if (parts.length !== 3) return c.redirect('/login?sso_error=bad_id_token');

  let header: any, payload: any;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return c.redirect('/login?sso_error=bad_id_token_json');
  }

  const expectedIss = `https://login.microsoftonline.com/${c.env.AZURE_AD_TENANT_ID}/v2.0`;
  if (payload.iss !== expectedIss) return c.redirect('/login?sso_error=bad_issuer');
  if (payload.aud !== c.env.AZURE_AD_CLIENT_ID) return c.redirect('/login?sso_error=bad_audience');
  if (payload.nonce !== state.nonce) return c.redirect('/login?sso_error=nonce_mismatch');
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return c.redirect('/login?sso_error=expired_id_token');

  // Signature verification against Entra JWKS
  const signatureOk = await verifyIdTokenSignature(tokenJson.id_token, header.kid, jwksUrl(c.env), c.env.KV);
  if (!signatureOk) return c.redirect('/login?sso_error=bad_signature');

  const email = String(payload.email || payload.preferred_username || payload.upn || '').toLowerCase();
  if (!email) return c.redirect('/login?sso_error=no_email');
  const name = String(payload.name || email.split('@')[0]);

  // Find existing participant by email; if missing, provision with default role.
  let participant = await c.env.DB.prepare(
    `SELECT id, email, role, name, status, kyc_status, email_verified FROM participants WHERE email = ?`
  ).bind(email).first<any>();

  if (!participant) {
    const newId = randomId('id_');
    const role = provisionRoleForEmail(email);
    await c.env.DB.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status, email_verified, created_at)
       VALUES (?, ?, '', ?, ?, 'active', 1, ?)`
    ).bind(newId, email, name, role, new Date().toISOString()).run();
    participant = { id: newId, email, role, name, status: 'active', kyc_status: null, email_verified: 1 };
    await fireCascade({
      event: 'auth.registered',
      actor_id: newId,
      entity_type: 'participants',
      entity_id: newId,
      data: { email, name, role, via: 'microsoft_sso' },
      env: c.env,
    });
  } else if (participant.status === 'suspended') {
    return c.redirect('/login?sso_error=account_suspended');
  } else if (participant.status === 'rejected') {
    // Match regular email+password login guard in auth.ts: rejected accounts
    // must not be able to authenticate via SSO either (Devin Review finding).
    return c.redirect('/login?sso_error=account_rejected');
  } else if (!participant.email_verified) {
    // A verified SSO login proves email ownership — flip email_verified AND
    // transition status 'pending' -> 'active' to mirror auth.ts:228. Without
    // the status flip, SSO-verified users stay stuck in 'pending' forever
    // (no automatic process can resolve it), which also skews regulator /
    // admin analytics that filter on status='active' (Devin Review finding).
    await c.env.DB.prepare(
      `UPDATE participants
         SET email_verified = 1,
             status = CASE WHEN status = 'pending' THEN 'active' ELSE status END
       WHERE id = ?`
    ).bind(participant.id).run();
    // Fire the same cascade as the regular /auth/verify-email endpoint so the
    // audit log + webhook subscribers see SSO-driven verifications. `via`
    // distinguishes this path from the click-the-link path (Devin Review
    // finding on PR #44).
    await fireCascade({
      event: 'auth.email_verified',
      actor_id: participant.id,
      entity_type: 'participants',
      entity_id: participant.id,
      data: { via: 'microsoft_sso' },
      env: c.env,
    });
  }

  // Issue OE access + refresh tokens and create a session row.
  const accessJti = randomId('jti_');
  const token = await signToken(
    { sub: participant.id, email: participant.email, role: participant.role, name: participant.name, jti: accessJti },
    c.env.JWT_SECRET,
    { expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS }
  );
  const session = await createSession({
    db: c.env.DB,
    participantId: participant.id,
    accessJti,
    userAgent: c.req.header('user-agent') || null,
    ip: c.req.header('cf-connecting-ip') || null,
  });

  await c.env.DB.prepare('UPDATE participants SET last_login = ? WHERE id = ?')
    .bind(new Date().toISOString(), participant.id).run();

  await fireCascade({
    event: 'auth.login',
    actor_id: participant.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email: participant.email, role: participant.role, via: 'microsoft_sso' },
    env: c.env,
  });

  // Redirect to a frontend landing page that reads the tokens from the URL fragment
  // and stashes them in localStorage exactly like /login does. Using a fragment
  // keeps the tokens out of server logs.
  const returnTo = state.return_to || '/cockpit';
  const fragment = new URLSearchParams({
    token,
    refresh_token: session.refreshToken,
    expires_in: String(ACCESS_TOKEN_EXPIRY_SECONDS),
    return_to: returnTo,
  }).toString();
  return c.redirect(`/sso-landing#${fragment}`);
});

// ─── helpers ───────────────────────────────────────────────────────────────

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 2 ? '==' : input.length % 4 === 3 ? '=' : '';
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface JwksKey {
  kty: string;
  kid: string;
  use?: string;
  n: string;
  e: string;
  alg?: string;
}

async function verifyIdTokenSignature(
  idToken: string,
  kid: string | undefined,
  jwksUrlStr: string,
  kv: KVNamespace
): Promise<boolean> {
  if (!kid) return false;

  // Cache JWKS in KV for 1 hour to avoid hammering Entra on every login.
  const cacheKey = `sso:jwks:${jwksUrlStr}`;
  let jwksJson: { keys: JwksKey[] } | null = null;
  const cached = await kv.get(cacheKey);
  if (cached) {
    try { jwksJson = JSON.parse(cached); } catch { jwksJson = null; }
  }
  if (!jwksJson) {
    const resp = await fetch(jwksUrlStr);
    if (!resp.ok) return false;
    jwksJson = await resp.json() as { keys: JwksKey[] };
    await kv.put(cacheKey, JSON.stringify(jwksJson), { expirationTtl: 3600 });
  }

  let jwk = jwksJson.keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Re-fetch once in case the signing key rotated after the cache was written.
    const resp = await fetch(jwksUrlStr);
    if (!resp.ok) return false;
    jwksJson = await resp.json() as { keys: JwksKey[] };
    await kv.put(cacheKey, JSON.stringify(jwksJson), { expirationTtl: 3600 });
    jwk = jwksJson.keys.find((k) => k.kid === kid);
    if (!jwk) return false;
  }

  const [h, p, s] = idToken.split('.');
  const data = new TextEncoder().encode(`${h}.${p}`);
  const signature = base64UrlDecode(s);

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
}

export default sso;
