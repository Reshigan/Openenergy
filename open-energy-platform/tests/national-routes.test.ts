// Route introspection tests — verifies every national-scale endpoint added
// in PRs National-1..N is actually mounted on its sub-app. A single missing
// route (typo in path, deleted by accident) fails this suite.
//
// We import each sub-app directly rather than the top-level app because:
//   1. Sub-app imports are side-effect free.
//   2. The top-level `export default app` also declares the OrderBook DO
//      which requires `DurableObjectState` — fine in a Worker, noise here.
//
// Route data is read from Hono's `app.routes` — stable shape in Hono ≥ 4.

import { describe, expect, it } from 'vitest';
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
import settlementAutomation from '../src/routes/settlement-automation';

type RouteEntry = { method: string; path: string };

function routesOf(app: Hono<any>): RouteEntry[] {
  const rs = (app as unknown as { routes: Array<{ method: string; path: string }> }).routes;
  return rs.map((r) => ({ method: r.method.toUpperCase(), path: r.path }));
}

function has(app: Hono<any>, method: string, path: string): boolean {
  return routesOf(app).some((r) => r.method === method.toUpperCase() && r.path === path);
}

describe('Regulator suite routes', () => {
  const expected: Array<[string, string]> = [
    ['GET',    '/licences'],
    ['GET',    '/licences/:id'],
    ['POST',   '/licences'],
    ['POST',   '/licences/:id/vary'],
    ['POST',   '/licences/:id/suspend'],
    ['POST',   '/licences/:id/revoke'],
    ['POST',   '/licences/:id/reinstate'],
    ['POST',   '/licences/:id/conditions'],
    ['GET',    '/tariff-submissions'],
    ['POST',   '/tariff-submissions'],
    ['POST',   '/tariff-submissions/:id/hearing'],
    ['POST',   '/tariff-submissions/:id/determine'],
    ['GET',    '/determinations'],
    ['POST',   '/determinations'],
    ['GET',    '/enforcement-cases'],
    ['GET',    '/enforcement-cases/:id'],
    ['POST',   '/enforcement-cases'],
    ['POST',   '/enforcement-cases/:id/events'],
    ['POST',   '/enforcement-cases/:id/finding'],
    ['POST',   '/enforcement-cases/:id/appeal'],
    ['GET',    '/surveillance/rules'],
    ['PUT',    '/surveillance/rules/:id'],
    ['GET',    '/surveillance/alerts'],
    ['POST',   '/surveillance/alerts/:id/resolve'],
    ['POST',   '/surveillance/alerts/:id/escalate'],
    ['POST',   '/surveillance/scan'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path} is mounted`, () => {
      expect(has(regulatorSuite, method, path)).toBe(true);
    });
  }
});

describe('Grid operator routes', () => {
  const expected: Array<[string, string]> = [
    ['GET',  '/connection-applications'],
    ['POST', '/connection-applications'],
    ['POST', '/connection-applications/:id/advance'],
    ['POST', '/dispatch/schedules'],
    ['POST', '/dispatch/schedules/:id/periods'],
    ['POST', '/dispatch/schedules/:id/publish'],
    ['GET',  '/dispatch/schedules'],
    ['GET',  '/dispatch/schedules/:id'],
    ['POST', '/dispatch/instructions'],
    ['POST', '/dispatch/instructions/:id/acknowledge'],
    ['POST', '/dispatch/instructions/:id/compliance'],
    ['GET',  '/dispatch/instructions'],
    ['POST', '/curtailment-notices'],
    ['POST', '/curtailment-notices/:id/lift'],
    ['GET',  '/curtailment-notices'],
    ['GET',  '/ancillary/products'],
    ['POST', '/ancillary/tenders'],
    ['GET',  '/ancillary/tenders'],
    ['POST', '/ancillary/tenders/:id/bids'],
    ['POST', '/ancillary/tenders/:id/clear'],
    ['POST', '/outages'],
    ['POST', '/outages/:id/updates'],
    ['GET',  '/outages'],
    ['GET',  '/zones'],
    ['POST', '/zones'],
    ['POST', '/zones/:code/loss-factor'],
    ['GET',  '/zones/:code/loss-factors'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(gridOperator, method, path)).toBe(true));
  }
});

describe('Trader risk routes', () => {
  const expected: Array<[string, string]> = [
    ['GET',  '/positions'],
    ['POST', '/positions/rebuild'],
    ['POST', '/mark-prices'],
    ['POST', '/mark-prices/vwap-run'],
    ['GET',  '/mark-prices'],
    ['POST', '/credit-limits'],
    ['GET',  '/credit-limits/:participant_id'],
    ['GET',  '/credit-check'],
    ['POST', '/collateral/accounts'],
    ['POST', '/collateral/accounts/:id/movement'],
    ['GET',  '/collateral/accounts'],
    ['POST', '/margin-calls/run'],
    ['GET',  '/margin-calls'],
    ['POST', '/clearing/run'],
    ['GET',  '/clearing/runs'],
    ['GET',  '/clearing/runs/:id/obligations'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(traderRisk, method, path)).toBe(true));
  }
});

describe('Lender suite routes', () => {
  const expected: Array<[string, string]> = [
    ['POST', '/covenants'],
    ['GET',  '/covenants'],
    ['POST', '/covenants/:id/test'],
    ['GET',  '/covenants/:id/tests'],
    ['POST', '/covenants/:id/waive'],
    ['POST', '/waivers/:id/decide'],
    ['POST', '/ie-certifications'],
    ['POST', '/ie-certifications/:id/decide'],
    ['GET',  '/ie-certifications'],
    ['POST', '/waterfalls'],
    ['POST', '/waterfalls/:id/run'],
    ['POST', '/reserves'],
    ['POST', '/reserves/:id/movement'],
    ['GET',  '/reserves'],
    ['GET',  '/stress/scenarios'],
    ['POST', '/stress/scenarios'],
    ['POST', '/stress/run'],
    ['GET',  '/stress/results/:project_id'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(lenderSuite, method, path)).toBe(true));
  }
});

describe('IPP lifecycle routes', () => {
  const expected: Array<[string, string]> = [
    ['POST', '/epc'],
    ['POST', '/epc/:id/variations'],
    ['POST', '/epc/:id/lds'],
    ['GET',  '/epc/:id'],
    ['POST', '/environmental/authorisations'],
    ['POST', '/environmental/authorisations/:id/conditions'],
    ['GET',  '/environmental/authorisations/:project_id'],
    ['POST', '/land/parcels'],
    ['GET',  '/land/parcels/:project_id'],
    ['POST', '/land/servitudes'],
    ['POST', '/insurance/policies'],
    ['POST', '/insurance/policies/:id/claim'],
    ['GET',  '/insurance/expiring'],
    ['POST', '/community/stakeholders'],
    ['POST', '/community/engagements'],
    ['POST', '/community/ed-sed'],
    ['GET',  '/community/ed-sed/:project_id/summary'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(ippLifecycle, method, path)).toBe(true));
  }
});

describe('Offtaker suite routes', () => {
  const expected: Array<[string, string]> = [
    ['POST', '/groups'],
    ['POST', '/groups/:id/members'],
    ['GET',  '/groups'],
    ['GET',  '/tariffs'],
    ['POST', '/tariffs'],
    ['POST', '/tariff-compare'],
    ['POST', '/profiles'],
    ['GET',  '/profiles/:delivery_point_id'],
    ['POST', '/budgets'],
    ['GET',  '/budget-vs-actual'],
    ['POST', '/recs/certificates'],
    ['POST', '/recs/certificates/:id/transfer'],
    ['POST', '/recs/certificates/:id/retire'],
    ['GET',  '/recs/portfolio'],
    ['POST', '/scope2'],
    ['GET',  '/scope2'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(offtakerSuite, method, path)).toBe(true));
  }
});

describe('Carbon registry routes', () => {
  const expected: Array<[string, string]> = [
    ['GET',  '/registries'],
    ['POST', '/registries/sync'],
    ['POST', '/vintages'],
    ['GET',  '/vintages/:project_id'],
    ['POST', '/serials/transfer'],
    ['POST', '/serials/retire'],
    ['POST', '/mrv/submissions'],
    ['POST', '/mrv/submissions/:id/verify'],
    ['GET',  '/mrv/submissions'],
    ['POST', '/tax-claims'],
    ['POST', '/tax-claims/:id/attach-retirement'],
    ['POST', '/tax-claims/:id/submit'],
    ['GET',  '/tax-claims'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(carbonRegistry, method, path)).toBe(true));
  }
});

describe('Admin platform routes', () => {
  const expected: Array<[string, string]> = [
    ['GET',  '/tenants'],
    ['POST', '/tenants'],
    ['POST', '/tenants/:id/suspend'],
    ['POST', '/tenants/:id/reactivate'],
    ['POST', '/provisioning-requests'],
    ['GET',  '/provisioning-requests'],
    ['POST', '/provisioning-requests/:id/approve'],
    ['POST', '/provisioning-requests/:id/reject'],
    ['GET',  '/plans'],
    ['POST', '/subscriptions'],
    ['POST', '/invoices/run'],
    ['GET',  '/invoices'],
    ['GET',  '/flags'],
    ['POST', '/flags'],
    ['PUT',  '/flags/:id'],
    ['POST', '/flags/:id/overrides'],
    ['GET',  '/flags/evaluate/:flag_key'],
    ['POST', '/tenants/:id/sso'],
    ['GET',  '/tenants/:id/sso'],
    ['POST', '/usage/snapshot'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(adminPlatform, method, path)).toBe(true));
  }
});

describe('Data tier routes', () => {
  const expected: Array<[string, string]> = [
    ['POST', '/metering/rollup-day'],
    ['POST', '/metering/archive-month'],
    ['POST', '/audit/archive-day'],
    ['POST', '/ona/rollup-day'],
    ['POST', '/snapshot'],
    ['GET',  '/snapshot'],
    ['POST', '/tenant-quotas'],
    ['GET',  '/tenant-quotas'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(dataTier, method, path)).toBe(true));
  }
});

describe('Settlement automation routes', () => {
  const expected: Array<[string, string]> = [
    ['POST', '/runs'],
    ['GET',  '/runs'],
    ['GET',  '/runs/:id'],
    ['POST', '/runs/:id/retry'],
    ['GET',  '/dlq'],
    ['POST', '/dlq/:id/resolve'],
    ['POST', '/ingest/channels'],
    ['GET',  '/ingest/channels'],
    ['GET',  '/ingest/health'],
    ['POST', '/ingest/push'],
  ];
  for (const [method, path] of expected) {
    it(`${method} ${path}`, () => expect(has(settlementAutomation, method, path)).toBe(true));
  }
});

describe('Route totals (regression guard)', () => {
  it('each suite exposes at least the count we expect', () => {
    const counts: Array<[string, Hono<any>, number]> = [
      ['regulator-suite',      regulatorSuite,     20],
      ['grid-operator',        gridOperator,       25],
      ['trader-risk',          traderRisk,         15],
      ['lender-suite',         lenderSuite,        15],
      ['ipp-lifecycle',        ippLifecycle,       15],
      ['offtaker-suite',       offtakerSuite,      15],
      ['carbon-registry',      carbonRegistry,     10],
      ['admin-platform',       adminPlatform,      18],
      ['data-tier',            dataTier,            8],
      ['settlement-automation',settlementAutomation,10],
    ];
    for (const [name, app, minRoutes] of counts) {
      expect(routesOf(app).length, `${name} route count dropped below ${minRoutes}`).toBeGreaterThanOrEqual(minRoutes);
    }
  });
});
