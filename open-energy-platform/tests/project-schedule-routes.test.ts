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
    ['GET',    '/:projectId/activities'],
    ['POST',   '/:projectId/activities'],
    ['PUT',    '/:projectId/activities/:id'],
    ['DELETE', '/:projectId/activities/:id'],
    // dependencies
    ['GET',    '/:projectId/dependencies'],
    ['POST',   '/:projectId/dependencies'],
    ['DELETE', '/:projectId/dependencies/:id'],
    // calendars + exceptions
    ['GET',    '/:projectId/calendars'],
    ['POST',   '/:projectId/calendars'],
    ['POST',   '/:projectId/calendars/:calendarId/exceptions'],
    // resources + assignments
    ['GET',    '/:projectId/resources'],
    ['POST',   '/:projectId/resources'],
    ['POST',   '/:projectId/assignments'],
    ['DELETE', '/:projectId/assignments/:id'],
    // compute
    ['POST',   '/:projectId/recompute'],
    ['GET',    '/:projectId/critical-path'],
    ['GET',    '/:projectId/look-ahead'],
    ['GET',    '/:projectId/over-allocations'],
    ['POST',   '/:projectId/level'],
    // baselines
    ['GET',    '/:projectId/baselines'],
    ['POST',   '/:projectId/baselines'],
    ['GET',    '/:projectId/baselines/:id/variance'],
    // state
    ['GET',    '/:projectId/state'],
  ];

  for (const [method, path] of expected) {
    it(`${method} ${path} is mounted`, () => {
      expect(has(projectSchedule, method, path)).toBe(true);
    });
  }
});
