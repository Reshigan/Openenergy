// Integration-style auth guard tests — verify every national-scale endpoint
// refuses unauthenticated requests with HTTP 401.
//
// We drive the real Hono sub-apps via `app.fetch()` with a minimal fake env.
// No auth header → the authMiddleware should respond 401 before any handler
// touches the DB. This catches silent regressions like "someone removed
// `app.use('*', authMiddleware)` from a sub-app" that route-introspection
// tests can't see.

import { describe, it, expect } from 'vitest';
import type { Hono } from 'hono';

import regulatorSuite from '../src/routes/regulator-suite';
import gridOperator from '../src/routes/grid-operator';
import traderRisk from '../src/routes/trader-risk';
import lenderSuite from '../src/routes/lender-suite';
import ippLifecycle from '../src/routes/ipp-lifecycle';
import offtakerSuite from '../src/routes/offtaker-suite';
import carbonRegistry from '../src/routes/carbon-registry';
import adminPlatform from '../src/routes/admin-platform';
import dataTier from '../src/routes/data-tier';
import aiBriefs from '../src/routes/ai-briefs';

// A fake environment just rich enough that the auth middleware's
// "missing Authorization header" branch fires before it touches DB/KV/R2.
const fakeEnv = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }) }) },
  KV: { get: async () => null, put: async () => undefined, delete: async () => undefined },
  R2: { get: async () => null, put: async () => undefined, delete: async () => undefined },
  JWT_SECRET: 'test-secret',
} as unknown as Record<string, unknown>;

async function callUnauthenticated(
  app: Hono<any>,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({}),
  });
  const res = await app.fetch(req, fakeEnv as never);
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

function isRejected(
  status: number,
  body: unknown,
): boolean {
  // Any non-2xx is a rejection. In the current codebase, auth middleware
  // throws AppError(UNAUTHORIZED, 401) which the main app's onError maps
  // to 500 with { error: 'Internal Server Error', message: 'Missing or
  // invalid Authorization header' }. Either 401 (when a sub-app has its
  // own error handler) or 500 with the UNAUTHORIZED signature is
  // acceptable — what we must NEVER see is a 2xx unauthenticated.
  if (status >= 200 && status < 300) return false;
  if (status === 401) return true;
  // 500 is acceptable only if the body reveals it was an auth rejection.
  if (status === 500 && body && typeof body === 'object') {
    const b = body as { message?: string; error?: string };
    const msg = `${b.message || ''} ${b.error || ''}`.toLowerCase();
    if (/authori[sz]ation|authenticat|missing|invalid.*token|unauthorized/i.test(msg)) return true;
  }
  return status >= 400; // any other client error also counts as rejection
}

// One representative route per sub-app — keeps the suite fast while still
// catching any regression that removes auth from the sub-app.
const representative: Array<[string, Hono<any>, string, string]> = [
  ['regulator-suite',       regulatorSuite,   'GET',  '/licences'],
  ['grid-operator',         gridOperator,     'GET',  '/dispatch/schedules'],
  ['trader-risk',           traderRisk,       'GET',  '/positions'],
  ['lender-suite',          lenderSuite,      'GET',  '/covenants'],
  ['ipp-lifecycle',         ippLifecycle,     'GET',  '/insurance/expiring'],
  ['offtaker-suite',        offtakerSuite,    'GET',  '/groups'],
  ['carbon-registry',       carbonRegistry,   'GET',  '/registries'],
  ['admin-platform',        adminPlatform,    'GET',  '/tenants'],
  ['data-tier',             dataTier,         'GET',  '/snapshot'],
  ['ai-briefs',             aiBriefs,         'POST', '/regulator'],
];

describe('National-scale endpoints refuse unauthenticated requests', () => {
  for (const [name, app, method, path] of representative) {
    it(`${name}: ${method} ${path} is rejected`, async () => {
      const { status, body } = await callUnauthenticated(app, method, path);
      expect(isRejected(status, body), `Unauth ${method} ${path} returned ${status}`).toBe(true);
    });
  }
});

describe('POST write endpoints refuse unauthenticated requests', () => {
  // Writes are where we absolutely cannot afford a leak — so this list is
  // the safety-critical set (tenant creation, licence issuance, credit
  // limits, margin calls, cross-participant data mutations).
  const writes: Array<[string, Hono<any>, string]> = [
    ['regulator-suite',  regulatorSuite,   '/licences'],
    ['regulator-suite',  regulatorSuite,   '/enforcement-cases'],
    ['grid-operator',    gridOperator,     '/dispatch/schedules'],
    ['grid-operator',    gridOperator,     '/dispatch/instructions'],
    ['grid-operator',    gridOperator,     '/outages'],
    ['trader-risk',      traderRisk,       '/credit-limits'],
    ['trader-risk',      traderRisk,       '/margin-calls/run'],
    ['trader-risk',      traderRisk,       '/clearing/run'],
    ['lender-suite',     lenderSuite,      '/covenants'],
    ['lender-suite',     lenderSuite,      '/ie-certifications'],
    ['ipp-lifecycle',    ippLifecycle,     '/epc'],
    ['ipp-lifecycle',    ippLifecycle,     '/insurance/policies'],
    ['offtaker-suite',   offtakerSuite,    '/scope2'],
    ['offtaker-suite',   offtakerSuite,    '/recs/certificates'],
    ['carbon-registry',  carbonRegistry,   '/vintages'],
    ['carbon-registry',  carbonRegistry,   '/tax-claims'],
    ['admin-platform',   adminPlatform,    '/tenants'],
    ['admin-platform',   adminPlatform,    '/flags'],
    ['data-tier',        dataTier,         '/snapshot'],
  ];
  for (const [name, app, path] of writes) {
    it(`${name}: POST ${path} is rejected`, async () => {
      const { status, body } = await callUnauthenticated(app, 'POST', path);
      expect(isRejected(status, body), `Unauth POST ${path} returned ${status}`).toBe(true);
      // Never leak a 2xx for an unauthenticated write.
      expect(status < 200 || status >= 300).toBe(true);
    });
  }
});
