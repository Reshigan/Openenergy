// P1: dedupe assertion for route-shadowing hazard. Hono app.route() is
// additive; two modules under the same prefix silently merge and the first
// registered handler wins any true (method, path) collision. assertNoRouteShadow
// fails fast at boot for cross-module concrete-method collisions.
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../../src/utils/types';
import { assertNoRouteShadow, mountRoutes } from '../../src/routes/mount-routes';

describe('assertNoRouteShadow', () => {
  it('throws when two distinct modules register the same concrete (method, path)', () => {
    const a = new Hono<HonoEnv>().post('/dup', (c) => c.json({ a: 1 }));
    const b = new Hono<HonoEnv>().post('/dup', (c) => c.json({ b: 2 }));
    expect(() => assertNoRouteShadow([['/api/x', a], ['/api/x', b]])).toThrowError(
      /route shadowing detected.*POST \/api\/x\/dup/s,
    );
  });

  it('does NOT throw when two modules register disjoint sub-paths under the same prefix', () => {
    const a = new Hono<HonoEnv>().get('/filings', (c) => c.json({}));
    const b = new Hono<HonoEnv>().get('/licences', (c) => c.json({}));
    expect(() => assertNoRouteShadow([['/api/regulator', a], ['/api/regulator', b]])).not.toThrow();
  });

  it('WARNs (does not throw) on cross-module ALL middleware overlap', () => {
    const a = new Hono<HonoEnv>();
    a.use('*', async (_c, next) => next());
    a.get('/x', (c) => c.json({}));
    const b = new Hono<HonoEnv>();
    b.use('*', async (_c, next) => next());
    b.get('/y', (c) => c.json({}));
    expect(() => assertNoRouteShadow([['/api/esums', a], ['/api/esums', b]])).not.toThrow();
  });

  it('does not throw on within-module duplicate (same module registers the same path twice)', () => {
    // A single module registering the same path twice is a module-internal
    // bug, not the cross-mount shadow class — assertion skips it.
    const a = new Hono<HonoEnv>();
    a.get('/dup', (c) => c.json({ first: 1 }));
    a.get('/dup', (c) => c.json({ second: 2 }));
    expect(() => assertNoRouteShadow([['/api/cockpit', a]])).not.toThrow();
  });

  it('treats the documented popia/erasure overlap as known-intentional (WARN, no throw)', () => {
    const base = new Hono<HonoEnv>().post('/erasure', (c) => c.json({ base: 1 }));
    const feature = new Hono<HonoEnv>();
    feature.post('/erasure', (c) => c.json({ feature: 2 }));
    feature.post('/export', (c) => c.json({}));
    expect(() =>
      assertNoRouteShadow([['/api/popia', base], ['/api/popia', feature]]),
    ).not.toThrow();
  });
});

// Regression guard: the live mount table must boot without throwing. If a
// future PR introduces a new cross-module (method, path) collision, this test
// (and Worker boot) fails fast instead of silently shadowing a handler.
describe('mountRoutes boot guard', () => {
  it('constructs the full route tree without a cross-module shadow failure', () => {
    const app = new Hono<HonoEnv>();
    expect(() => mountRoutes(app)).not.toThrow();
  });
});