// Regression guard for a systemic copy-paste defect: in several domain
// modules the GET /audit/exports/:id/manifest (or /audit/exports) handler was
// missing its closing `});`, which nested the /audit/exports/:id/csv handler
// as dead code AFTER a `return` — so the CSV evidence-download route was never
// mounted (404) while the file still compiled (a stray `});` balanced braces).
//
// This asserts the three audit-export GET routes are top-level registrations
// on each module as it gets fixed. Add a module here when its `});` is
// repaired so the dead-code nesting can't silently recur.
import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import adminPlatform from '../src/routes/admin-platform';
import trading from '../src/routes/trading';
import settlement from '../src/routes/settlement';
import funder from '../src/routes/funder';
import gridOperator from '../src/routes/grid-operator';
import carbonRegistry from '../src/routes/carbon-registry';
import regulatorSuite from '../src/routes/regulator-suite';
import support from '../src/routes/support';
import offtakerSuite from '../src/routes/offtaker-suite';
import ippLifecycle from '../src/routes/ipp-lifecycle';

function has(app: Hono<any>, method: string, path: string): boolean {
  const rs = (app as unknown as { routes: Array<{ method: string; path: string }> }).routes;
  return rs.some((r) => r.method.toUpperCase() === method && r.path === path);
}

const MODULES: Array<[string, Hono<any>]> = [
  ['admin-platform', adminPlatform],
  ['trading', trading],
  ['settlement', settlement],
  ['funder', funder],
  ['grid-operator', gridOperator],
  ['carbon-registry', carbonRegistry],
  ['regulator-suite', regulatorSuite],
  ['support', support],
  ['offtaker-suite', offtakerSuite],
  ['ipp-lifecycle', ippLifecycle],
];

const ROUTES = [
  '/audit/exports',
  '/audit/exports/:id/manifest',
  '/audit/exports/:id/csv',
];

describe('audit-export routes are mounted (dead-code nesting regression)', () => {
  for (const [name, app] of MODULES) {
    for (const path of ROUTES) {
      it(`${name}: GET ${path}`, () => expect(has(app, 'GET', path)).toBe(true));
    }
  }
});
