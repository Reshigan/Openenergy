// Shared login helper for k6 scenarios. Each VU calls login() once in setup
// or VU iteration 0; the token is then reused across iterations.
//
// Demo personas (created by seed migrations 003 + 030):
//   admin / trader / ipp / offtaker / lender / carbon / regulator / grid / wind
// All share the password Demo@2024! (or whatever DEMO_PASSWORD env var sets).
//
// Rate-limit awareness: the production rate limiter caps sensitive auth at
// 10 attempts per 5-min window per IP. With a 100-VU run, do NOT log every
// VU in afresh on every iteration; cache the token in VU-local scope.

import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE = __ENV.BASE || 'https://oe.vantax.co.za';
const PASSWORD = __ENV.DEMO_PASSWORD || 'Demo@2024!';

export function login(email) {
  const r = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth_login' } },
  );
  const ok = check(r, {
    'login 200': (resp) => resp.status === 200,
    'login returns token': (resp) => {
      try { return !!resp.json('data.token'); } catch { return false; }
    },
  });
  if (!ok) fail(`login failed for ${email}: HTTP ${r.status} body=${r.body && r.body.slice(0, 200)}`);
  return r.json('data.token');
}

// Cheap auth header builder.
export function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Pick one of the 9 demo personas. Used by mixed-load scenarios to spread
// requests across roles instead of hammering everything as admin.
export const PERSONAS = [
  'trader@openenergy.co.za',
  'ipp@openenergy.co.za',
  'offtaker@openenergy.co.za',
  'lender@openenergy.co.za',
  'carbon@openenergy.co.za',
  'regulator@openenergy.co.za',
  'grid@openenergy.co.za',
];
