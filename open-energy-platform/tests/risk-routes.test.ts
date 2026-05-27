// Mount-check tests for /api/risk routes.
// Verifies every Wave-2 trading-risk endpoint is wired up.

import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import risk from '../src/routes/risk';

type RouteEntry = { method: string; path: string };

function routesOf(app: Hono<any>): RouteEntry[] {
  const rs = (app as unknown as { routes: Array<{ method: string; path: string }> }).routes;
  return rs.map((r) => ({ method: r.method.toUpperCase(), path: r.path }));
}

function has(app: Hono<any>, method: string, path: string): boolean {
  return routesOf(app).some((r) => r.method === method.toUpperCase() && r.path === path);
}

describe('Risk routes', () => {
  const expected: Array<[string, string]> = [
    // portfolios
    ['GET',    '/portfolios'],
    ['POST',   '/portfolios'],
    ['PUT',    '/portfolios/:id'],
    ['DELETE', '/portfolios/:id'],
    // var
    ['GET',    '/portfolios/:id/var'],
    ['GET',    '/portfolios/:id/var/history'],
    ['POST',   '/portfolios/:id/var/recompute'],
    ['GET',    '/portfolios/:id/exposure'],
    // scenarios
    ['GET',    '/scenarios'],
    ['POST',   '/scenarios'],
    ['PUT',    '/scenarios/:id'],
    ['DELETE', '/scenarios/:id'],
    ['GET',    '/scenarios/:id/results'],
    ['POST',   '/scenarios/:id/run'],
    // factors
    ['GET',    '/factors'],
    ['GET',    '/factors/:id/history'],
  ];

  for (const [method, path] of expected) {
    it(`${method} ${path} is mounted`, () => {
      expect(has(risk, method, path)).toBe(true);
    });
  }
});
