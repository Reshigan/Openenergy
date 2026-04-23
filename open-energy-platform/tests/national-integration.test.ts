// Integration tests — actually run each route against an in-memory SQLite
// loaded with the real migrations. Verifies full happy paths end-to-end:
//   - auth middleware accepts a signed JWT
//   - request body validates
//   - SQL writes succeed against the real schema
//   - response contains the expected fields
//
// Unlike the earlier pattern-matched MockD1, this uses better-sqlite3 which
// speaks the real SQL dialect. Migrations are applied in order at setup.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';

import regulatorSuite from '../src/routes/regulator-suite';
import gridOperator from '../src/routes/grid-operator';
import lenderSuite from '../src/routes/lender-suite';
import adminPlatform from '../src/routes/admin-platform';
import dataTier from '../src/routes/data-tier';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';

let db: Database.Database;
let env: Record<string, unknown>;
let adminToken: string;

beforeAll(async () => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  adminToken = await testJwtFor(db, 'admin_int', { role: 'admin' });
});

afterAll(() => { db.close(); });

describe('Regulator: licence grant → suspend → reinstate roundtrip', () => {
  let licenceId: string;

  it('grants a licence', async () => {
    const res = await call(regulatorSuite, env, 'POST', '/licences', {
      token: adminToken,
      body: {
        licence_number: 'GEN-INT-001',
        licensee_name: 'Integration Test IPP (Pty) Ltd',
        licence_type: 'generation',
        technology: 'solar_pv',
        capacity_mw: 50,
        issue_date: '2026-01-01',
      },
    });
    expect(res.status).toBe(201);
    const data = (res.json as { data: { id: string; status: string } }).data;
    expect(data.status).toBe('active');
    licenceId = data.id;
  });

  it('suspends the licence', async () => {
    const res = await call(regulatorSuite, env, 'POST', `/licences/${licenceId}/suspend`, {
      token: adminToken,
      body: { details: 'Integration test suspension' },
    });
    expect(res.status).toBe(200);
    expect((res.json as { data: { status: string } }).data.status).toBe('suspended');
  });

  it('records the suspend event in regulator_licence_events', () => {
    // ORDER BY rowid for deterministic ordering; both events share a
    // sub-second timestamp so ORDER BY created_at is not a tie-breaker.
    const rows = db.prepare('SELECT event_type FROM regulator_licence_events WHERE licence_id = ? ORDER BY rowid').all(licenceId) as Array<{ event_type: string }>;
    expect(rows.map((r) => r.event_type)).toEqual(['granted', 'suspended']);
  });

  it('reinstates the licence', async () => {
    const res = await call(regulatorSuite, env, 'POST', `/licences/${licenceId}/reinstate`, {
      token: adminToken,
      body: { details: 'Remediation verified' },
    });
    expect(res.status).toBe(200);
    expect((res.json as { data: { status: string } }).data.status).toBe('active');
  });
});

describe('Regulator enforcement case — open → finding → appeal', () => {
  let caseId: string;

  it('opens a case', async () => {
    const res = await call(regulatorSuite, env, 'POST', '/enforcement-cases', {
      token: adminToken,
      body: {
        case_number: 'CASE-INT-001',
        respondent_name: 'Integration Test Respondent',
        alleged_contravention: 'Failure to submit quarterly report.',
        severity: 'medium',
      },
    });
    expect(res.status).toBe(201);
    caseId = (res.json as { data: { id: string } }).data.id;
  });

  it('records a finding', async () => {
    const res = await call(regulatorSuite, env, 'POST', `/enforcement-cases/${caseId}/finding`, {
      token: adminToken,
      body: {
        finding: 'Respondent conceded; remedial plan accepted.',
        finding_date: '2026-03-15',
        penalty_amount_zar: 100000,
        penalty_description: 'Administrative penalty per NERSA Rules.',
      },
    });
    expect(res.status).toBe(200);
    expect((res.json as { data: { status: string; penalty_amount_zar: number } }).data).toMatchObject({
      status: 'penalty_imposed',
      penalty_amount_zar: 100000,
    });
  });

  it('records an appeal', async () => {
    const res = await call(regulatorSuite, env, 'POST', `/enforcement-cases/${caseId}/appeal`, {
      token: adminToken,
      body: { grounds: 'Administrative error.' },
    });
    expect(res.status).toBe(200);
    expect((res.json as { data: { status: string } }).data.status).toBe('appealed');
  });
});

describe('Lender covenant — test warn + breach triggers cascade', () => {
  let covenantId: string;

  it('registers a covenant', async () => {
    const res = await call(lenderSuite, env, 'POST', '/covenants', {
      token: adminToken,
      body: {
        covenant_code: 'DSCR_12M_INT',
        covenant_name: 'DSCR 12m (integration)',
        covenant_type: 'financial',
        operator: 'gte',
        threshold: 1.2,
        measurement_frequency: 'quarterly',
      },
    });
    expect(res.status).toBe(201);
    covenantId = (res.json as { data: { id: string } }).data.id;
  });

  it('records a passing test', async () => {
    const res = await call(lenderSuite, env, 'POST', `/covenants/${covenantId}/test`, {
      token: adminToken,
      body: {
        test_period: 'Q1-2026',
        test_date: '2026-03-31',
        measured_value: 1.5,
      },
    });
    expect(res.status).toBe(201);
    expect((res.json as { data: { result: string } }).data.result).toBe('pass');
  });

  it('records a warn test that writes a covenant_tests row', async () => {
    const res = await call(lenderSuite, env, 'POST', `/covenants/${covenantId}/test`, {
      token: adminToken,
      body: {
        test_period: 'Q2-2026',
        test_date: '2026-06-30',
        measured_value: 1.22, // inside 5% warn band
      },
    });
    expect(res.status).toBe(201);
    expect((res.json as { data: { result: string } }).data.result).toBe('warn');
    // Ensure the cascade's audit_logs row exists.
    const audits = db.prepare(
      `SELECT action FROM audit_logs WHERE entity_type = 'covenant_tests' AND action LIKE 'lender.covenant_%'`,
    ).all() as Array<{ action: string }>;
    expect(audits.some((r) => r.action === 'lender.covenant_warn')).toBe(true);
  });

  it('records a breach test', async () => {
    const res = await call(lenderSuite, env, 'POST', `/covenants/${covenantId}/test`, {
      token: adminToken,
      body: {
        test_period: 'Q3-2026',
        test_date: '2026-09-30',
        measured_value: 1.0,
      },
    });
    expect(res.status).toBe(201);
    expect((res.json as { data: { result: string } }).data.result).toBe('breach');
  });
});

describe('Grid operator: ancillary tender clearing produces awards', () => {
  let tenderId: string;

  it('publishes a tender', async () => {
    const res = await call(gridOperator, env, 'POST', '/ancillary/tenders', {
      token: adminToken,
      body: {
        tender_number: 'TND-INT-001',
        product_id: 'asp_fcr',
        delivery_window_start: '2026-05-01',
        delivery_window_end: '2026-05-31',
        capacity_required_mw: 100,
        ceiling_price_zar_mw_h: 500,
        gate_closure_at: new Date(Date.now() + 86400_000).toISOString(),
      },
    });
    expect(res.status).toBe(201);
    tenderId = (res.json as { data: { id: string } }).data.id;
  });

  it('accepts two bids', async () => {
    const a = await call(gridOperator, env, 'POST', `/ancillary/tenders/${tenderId}/bids`, {
      token: adminToken,
      body: { capacity_offered_mw: 60, price_zar_mw_h: 400 },
    });
    const b = await call(gridOperator, env, 'POST', `/ancillary/tenders/${tenderId}/bids`, {
      token: adminToken,
      body: { capacity_offered_mw: 80, price_zar_mw_h: 450 },
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  it('clears pay-as-cleared at the marginal price', async () => {
    const res = await call(gridOperator, env, 'POST', `/ancillary/tenders/${tenderId}/clear`, {
      token: adminToken,
      body: {},
    });
    expect(res.status).toBe(200);
    const data = (res.json as { data: { awarded: Array<{ awarded_capacity: number }>; clearing_price_zar_mw_h: number } }).data;
    // Needed 100 MW: cheaper bid (60 @ 400) fully awarded, more-expensive bid (80 @ 450) partially awarded for 40 MW.
    expect(data.awarded.length).toBe(2);
    expect(data.clearing_price_zar_mw_h).toBe(450);
    const totalAwarded = data.awarded.reduce((s, a) => s + a.awarded_capacity, 0);
    expect(totalAwarded).toBe(100);
  });
});

describe('Admin platform: tenant provisioning approve path', () => {
  let requestId: string;

  it('accepts a provisioning request', async () => {
    const res = await call(adminPlatform, env, 'POST', '/provisioning-requests', {
      token: adminToken,
      body: {
        requested_name: 'Integration Tenant',
        admin_email: 'int@tenant.test',
        requested_tier: 'trial',
        expected_participants: 10,
      },
    });
    expect(res.status).toBe(201);
    requestId = (res.json as { data: { id: string } }).data.id;
  });

  it('approves it and provisions a new tenant + trial subscription', async () => {
    const res = await call(adminPlatform, env, 'POST', `/provisioning-requests/${requestId}/approve`, {
      token: adminToken,
      body: {},
    });
    expect(res.status).toBe(200);
    const tenantId = (res.json as { data: { tenant_id: string } }).data.tenant_id;
    const tenant = db.prepare('SELECT id, status, tier FROM tenants WHERE id = ?').get(tenantId) as { status: string; tier: string } | undefined;
    expect(tenant?.status).toBe('active');
    expect(tenant?.tier).toBe('trial');
    const sub = db.prepare("SELECT status FROM tenant_subscriptions WHERE tenant_id = ?").get(tenantId) as { status: string } | undefined;
    expect(sub?.status).toBe('trialing');
  });
});

describe('Data tier: snapshot captures current row counts', () => {
  it('writes a snapshot row', async () => {
    const res = await call(dataTier, env, 'POST', '/snapshot', { token: adminToken, body: {} });
    expect(res.status).toBe(201);
    const data = (res.json as { data: Record<string, unknown> }).data;
    // Counts exist and are numeric.
    expect(data).toMatchObject({
      metering_rows: expect.any(Number),
      audit_log_rows: expect.any(Number),
      ona_forecast_rows: expect.any(Number),
    });
  });

  it('returns the latest snapshot on GET', async () => {
    const res = await call(dataTier, env, 'GET', '/snapshot', { token: adminToken });
    expect(res.status).toBe(200);
    expect((res.json as { data: unknown }).data).toBeTruthy();
  });
});
