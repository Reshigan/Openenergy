// Mount-check tests for /api/projects/:projectId/schedule routes.
// Verifies every Wave-1 IPP schedule endpoint is wired up on the sub-app.

import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import projectSchedule from '../src/routes/project-schedule';

type RouteEntry = { method: string; path: string };

function routesOf(app: Hono<any>): RouteEntry[] {
  const rs = (app as unknown as { routes: Array<{ method: string; path: string }> }).routes;
  return rs.map((r) => ({ method: r.method.toUpperCase(), path: r.path }));
}

function has(app: Hono<any>, method: string, path: string): boolean {
  return routesOf(app).some((r) => r.method === method.toUpperCase() && r.path === path);
}

describe('Project schedule routes', () => {
  const expected: Array<[string, string]> = [
    // activities
    ['GET',    '/activities'],
    ['POST',   '/activities'],
    ['PUT',    '/activities/:id'],
    ['DELETE', '/activities/:id'],
    // dependencies
    ['GET',    '/dependencies'],
    ['POST',   '/dependencies'],
    ['DELETE', '/dependencies/:id'],
    // calendars + exceptions
    ['GET',    '/calendars'],
    ['POST',   '/calendars'],
    ['POST',   '/calendars/:calendarId/exceptions'],
    // resources + assignments
    ['GET',    '/resources'],
    ['POST',   '/resources'],
    ['POST',   '/assignments'],
    ['DELETE', '/assignments/:id'],
    // compute
    ['POST',   '/recompute'],
    ['GET',    '/critical-path'],
    ['GET',    '/look-ahead'],
    ['GET',    '/over-allocations'],
    ['POST',   '/level'],
    // baselines
    ['GET',    '/baselines'],
    ['POST',   '/baselines'],
    ['GET',    '/baselines/:id/variance'],
    // state
    ['GET',    '/state'],
  ];

  for (const [method, path] of expected) {
    it(`${method} ${path} is mounted`, () => {
      expect(has(projectSchedule, method, path)).toBe(true);
    });
  }
});
