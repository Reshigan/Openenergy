// Playwright global setup — logs in as all 9 demo roles once and stores tokens
// in process.env.PLAYWRIGHT_{ROLE}_TOKEN. Specs read these env vars instead of
// calling /api/auth/login independently, which would exhaust the 10/5min/IP
// rate limit well before the full suite completes.
//
// DISK TOKEN CACHE (this is load-bearing for iteration + CI flake avoidance):
// the sensitive-route limiter is 10 / 5 min / IP on /api/auth/login. A single
// run logs in 9 roles — fine once, but running the suite twice inside the
// window (re-run after a fix, or two spec files in quick succession) tips over
// the limit and every later login 429s, which is THE most common CI flake.
//
// So we persist the 9 tokens to a tmp file keyed by base origin and reuse them
// across invocations while they're fresh (< 45 min, comfortably inside the 1h
// JWT TTL). A re-run inside the window does ZERO logins. Only roles still
// missing from a valid cache are logged in, and the cache is rewritten with
// whatever we end up holding.

import { request as pwRequest } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const BASE_URL = process.env.BASE || 'https://oe.vantax.co.za';

// Refresh tokens older than this; safely under the 1h access-token TTL so a
// cached token never expires mid-suite.
const CACHE_TTL_MS = 45 * 60 * 1000;

const ROLES: Array<{ email: string; envKey: string }> = [
  { email: 'admin@openenergy.co.za',     envKey: 'PLAYWRIGHT_ADMIN_TOKEN' },
  { email: 'trader@openenergy.co.za',    envKey: 'PLAYWRIGHT_TRADER_TOKEN' },
  { email: 'ipp@openenergy.co.za',       envKey: 'PLAYWRIGHT_IPP_TOKEN' },
  { email: 'offtaker@openenergy.co.za',  envKey: 'PLAYWRIGHT_OFFTAKER_TOKEN' },
  { email: 'carbon@openenergy.co.za',    envKey: 'PLAYWRIGHT_CARBON_TOKEN' },
  { email: 'lender@openenergy.co.za',    envKey: 'PLAYWRIGHT_LENDER_TOKEN' },
  { email: 'regulator@openenergy.co.za', envKey: 'PLAYWRIGHT_REGULATOR_TOKEN' },
  { email: 'grid@openenergy.co.za',      envKey: 'PLAYWRIGHT_GRID_TOKEN' },
  { email: 'support@openenergy.co.za',   envKey: 'PLAYWRIGHT_SUPPORT_TOKEN' },
];

interface TokenCache {
  base: string;
  savedAt: number;
  tokens: Record<string, string>;
  // Per-role /auth/me body, captured once here (serially, off the hot path) so
  // specs can MOCK /auth/me instead of forcing a real round-trip on every full
  // page navigation. Under concurrent-user load (9 browsers) a real /auth/me per
  // remount overwhelms the single dev worker and bounces sessions to /login;
  // a logged-in user really only fetches /auth/me once per session anyway.
  users?: Record<string, unknown>;
}

function cachePath(base: string): string {
  const hash = crypto.createHash('sha1').update(base).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `oe-pw-tokens-${hash}.json`);
}

function loadCache(base: string): { tokens: Record<string, string>; users: Record<string, unknown> } {
  try {
    const raw = fs.readFileSync(cachePath(base), 'utf8');
    const c = JSON.parse(raw) as TokenCache;
    if (c.base !== base) return { tokens: {}, users: {} };
    if (Date.now() - c.savedAt > CACHE_TTL_MS) return { tokens: {}, users: {} };
    return { tokens: c.tokens || {}, users: c.users || {} };
  } catch {
    return { tokens: {}, users: {} };
  }
}

function saveCache(base: string, tokens: Record<string, string>, users: Record<string, unknown>): void {
  try {
    const c: TokenCache = { base, savedAt: Date.now(), tokens, users };
    fs.writeFileSync(cachePath(base), JSON.stringify(c), { mode: 0o600 });
  } catch {
    // Non-fatal — caching is an optimisation, not a correctness requirement.
  }
}

export default async function globalSetup(): Promise<void> {
  // 1. Seed env from a fresh cache — these roles need no login this run. Both
  //    the token AND the captured /auth/me body come from cache when present.
  const { tokens: cachedTokens, users: cachedUsers } = loadCache(BASE_URL);
  const users: Record<string, unknown> = {};
  let fromCache = 0;
  for (const { envKey } of ROLES) {
    if (cachedTokens[envKey]) {
      process.env[envKey] = cachedTokens[envKey];
      fromCache++;
    }
    if (cachedUsers[envKey]) users[envKey] = cachedUsers[envKey];
  }

  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
  try {
    // 2. Log in only the roles still missing a token.
    const missingToken = ROLES.filter((r) => !process.env[r.envKey]);
    for (const { email, envKey } of missingToken) {
      try {
        const r = await ctx.post('/api/auth/login', {
          data: { email, password: PASSWORD },
          failOnStatusCode: false,
        });
        if (r.ok()) {
          const tok = (await r.json())?.data?.token;
          if (tok) process.env[envKey] = tok;
        }
        // Non-ok (rate-limit, 500) — spec falls back to fake token for that role.
      } catch {
        // Network error — spec falls back to fake token for that role.
      }
    }

    // 3. Capture /auth/me once per role that has a token but no cached user.
    //    Specs MOCK /auth/me with this body so the auth bootstrap never makes a
    //    real round-trip per navigation — under 9-way concurrent load a real
    //    /auth/me per remount swamps the single dev worker and bounces to /login.
    //    (/auth/me is NOT rate-limited, so this is safe to do every cold run.)
    for (const { envKey } of ROLES) {
      const token = process.env[envKey];
      if (!token || users[envKey]) continue;
      try {
        const r = await ctx.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        });
        if (r.ok()) {
          const body = (await r.json())?.data;
          if (body) {
            users[envKey] = body;
            process.env[`${envKey}_USER`] = JSON.stringify(body);
          }
        }
      } catch {
        // Network error — spec falls back to a synthetic user for that role.
      }
    }
  } finally {
    await ctx.dispose();
  }

  // Re-export cached users into env (cold-cache roles set it above already).
  for (const { envKey } of ROLES) {
    if (users[envKey] && !process.env[`${envKey}_USER`]) {
      process.env[`${envKey}_USER`] = JSON.stringify(users[envKey]);
    }
  }

  // 4. Persist whatever we now hold (cached + freshly fetched) for re-runs.
  const tokens: Record<string, string> = {};
  for (const { envKey } of ROLES) {
    if (process.env[envKey]) tokens[envKey] = process.env[envKey] as string;
  }
  saveCache(BASE_URL, tokens, users);
  const loggedIn = Object.keys(tokens).length - fromCache;
  console.log(
    `[global-setup] ${Object.keys(tokens).length}/${ROLES.length} tokens ` +
    `(${fromCache} cached, ${loggedIn} fresh), ${Object.keys(users).length} /auth/me bodies for ${BASE_URL}`,
  );
}
