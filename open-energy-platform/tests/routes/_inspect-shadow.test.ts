// Temporary inspection — report route shadowing in current mount table.
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../../src/utils/types';
import { mountRoutes } from '../../src/routes/mount-routes';

describe('inspect route shadow', () => {
  it('reports collisions', () => {
    const app = new Hono<HonoEnv>();
    mountRoutes(app);
    const routes = (app as unknown as { routes: Array<{ method: string; path: string; basePath: string }> }).routes;
    const seen = new Map<string, { method: string; path: string; basePath: string }>();
    const collisions: string[] = [];
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      const prev = seen.get(key);
      if (prev) {
        collisions.push(`DUP ${key}  first.basePath=${prev.basePath}  second.basePath=${r.basePath}`);
      } else {
        seen.set(key, r);
      }
    }
    // eslint-disable-next-line no-console
    console.log('TOTAL_ROUTES=' + routes.length);
    // eslint-disable-next-line no-console
    console.log('COLLISIONS=' + collisions.length);
    for (const c of collisions) console.log(c);
    // Prefix duplicate counts
    const prefixes = new Map<string, number>();
    for (const r of routes) {
      const bp = r.basePath || '';
      prefixes.set(bp, (prefixes.get(bp) ?? 0) + 1);
    }
    const dupPrefixes = [...prefixes.entries()].filter(([, n]) => n > 1).map(([p, n]) => `${p} x${n}`);
    // eslint-disable-next-line no-console
    console.log('DUP_BASEPATHS=' + dupPrefixes.length);
    for (const d of dupPrefixes) console.log(d);
    expect(true).toBe(true);
  });
});