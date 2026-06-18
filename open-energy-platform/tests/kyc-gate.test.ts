// ═══════════════════════════════════════════════════════════════════════════
// Task 3.3 - Admin KYC decision: market-access write + reason codes + decision
// cascade + admin-inbox fan-out.
//
// Two halves:
//   (1) the cascade-rule lifecycle (kyc-gate.ts) - kyc.submitted opens exactly
//       one pending admin role-action (idempotent on re-fire); kyc.decided
//       closes the open admin action.
//   (2) the admin PUT /kyc/:id handler - it is the AUTHORITATIVE, synchronous
//       writer of participant_market_access (approved → full_trading,
//       rejected → read_only) and enforces the reason_code rules.
//
// NOTE on the close-out status: oe_role_action_queue.status has a CHECK
// constraint of ('pending','acknowledged','actioned','dismissed','expired')
// and has NO resolved_at column (migrations 476/482/504). The canonical
// close-out in this codebase (src/routes/feed.ts) is status='actioned' with
// actioned_at. The rule file follows that schema-valid convention; this test
// asserts the closed row as status='actioned'.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { createTestDb, envFor, testJwtFor } from './helpers/d1-sqlite';
import { authMiddleware } from '../src/middleware/auth';
import adminRoutes from '../src/routes/admin';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerKycGateRules } from '../src/cascade-rules/kyc-gate';

let db: Database.Database;
let env: Record<string, unknown>;

// Mount the real admin sub-app under a parent that applies authMiddleware - the
// per-module r.use('*', authMiddleware) does not reliably match nested paths in
// this Hono version (same pattern as onboarding-kyc.test.ts).
const app = new Hono();
app.use('*', authMiddleware);
app.route('/api/admin', adminRoutes);

function seedParticipant(id: string, opts: { role?: string; kyc_status?: string; status?: string; tenant?: string } = {}) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, participant_market_access, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?, 'full_trading', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(
    id,
    `${id}@openenergy.co.za`,
    id,
    opts.role || 'ipp_developer',
    opts.status || 'pending',
    opts.kyc_status || 'in_review',
    opts.tenant || 'default',
  );
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await app.request(
    path,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    },
    env,
  );
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

function pendingAdminRows(participantId: string): any[] {
  return db
    .prepare(
      `SELECT * FROM oe_role_action_queue
       WHERE target_role = 'admin' AND source_event = 'kyc.submitted'
         AND source_entity_id = ? AND status = 'pending'`,
    )
    .all(participantId) as any[];
}

function actionedAdminRows(participantId: string): any[] {
  return db
    .prepare(
      `SELECT * FROM oe_role_action_queue
       WHERE target_role = 'admin' AND source_event = 'kyc.submitted'
         AND source_entity_id = ? AND status = 'actioned'`,
    )
    .all(participantId) as any[];
}

describe('kyc-gate cascade rules', () => {
  beforeEach(() => {
    db = createTestDb({ applyMigrations: true });
    env = envFor(db);
    _resetRegistryForTests();
    registerKycGateRules();
  });

  afterEach(() => {
    db.close();
  });

  function ctxFor(event: string, entityId: string) {
    return {
      event,
      actor_id: 'admin-1',
      entity_type: 'participant',
      entity_id: entityId,
      data: {},
      env,
    } as any;
  }

  it('kyc.submitted inserts exactly one pending admin role-action for the participant', async () => {
    seedParticipant('p_sub');
    await runCascadeRegistry(ctxFor('kyc.submitted', 'p_sub'));

    const rows = pendingAdminRows('p_sub');
    expect(rows.length).toBe(1);
    expect(rows[0].target_role).toBe('admin');
    expect(rows[0].source_event).toBe('kyc.submitted');
    expect(rows[0].status).toBe('pending');
  });

  it('firing kyc.submitted twice yields only ONE pending row (idempotency guard)', async () => {
    seedParticipant('p_dup');
    await runCascadeRegistry(ctxFor('kyc.submitted', 'p_dup'));
    await runCascadeRegistry(ctxFor('kyc.submitted', 'p_dup'));

    const rows = pendingAdminRows('p_dup');
    expect(rows.length).toBe(1);
  });

  it('kyc.decided closes the open admin action (pending 0, actioned 1)', async () => {
    seedParticipant('p_dec');
    await runCascadeRegistry(ctxFor('kyc.submitted', 'p_dec'));
    expect(pendingAdminRows('p_dec').length).toBe(1);

    // A terminal decision carries kyc_status approved/rejected in its data.
    await runCascadeRegistry({ ...ctxFor('kyc.decided', 'p_dec'), data: { kyc_status: 'approved' } } as any);

    expect(pendingAdminRows('p_dec').length).toBe(0);
    expect(actionedAdminRows('p_dec').length).toBe(1);
  });

  it('kyc.decided with a non-terminal status does NOT close the pending admin action', async () => {
    seedParticipant('p_reopen');
    await runCascadeRegistry(ctxFor('kyc.submitted', 'p_reopen'));
    expect(pendingAdminRows('p_reopen').length).toBe(1);

    // Defence in depth: setting a case back to in_review is not a decision and
    // must leave the open review action untouched.
    await runCascadeRegistry({ ...ctxFor('kyc.decided', 'p_reopen'), data: { kyc_status: 'in_review' } } as any);

    expect(pendingAdminRows('p_reopen').length).toBe(1);
    expect(actionedAdminRows('p_reopen').length).toBe(0);
  });
});

describe('admin PUT /api/admin/kyc/:id - decision, market access, reason codes', () => {
  beforeEach(() => {
    db = createTestDb({ applyMigrations: true });
    env = envFor(db);
    _resetRegistryForTests();
    registerKycGateRules();
  });

  afterEach(() => {
    db.close();
  });

  async function adminToken() {
    return testJwtFor(db, 'admin-1', { role: 'admin' });
  }

  it('approve → 200, kyc_status=approved, market_access=full_trading, status=active', async () => {
    seedParticipant('p_app', { kyc_status: 'in_review', status: 'pending' });
    const token = await adminToken();

    const res = await call(token, 'PUT', '/api/admin/kyc/p_app', { kyc_status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);

    const row = db.prepare('SELECT kyc_status, participant_market_access, status FROM participants WHERE id = ?').get('p_app') as any;
    expect(row.kyc_status).toBe('approved');
    expect(row.participant_market_access).toBe('full_trading');
    expect(row.status).toBe('active');
  });

  it('reject with NO reason_code → 400, participant unchanged', async () => {
    seedParticipant('p_norc', { kyc_status: 'in_review', status: 'pending' });
    const token = await adminToken();

    const res = await call(token, 'PUT', '/api/admin/kyc/p_norc', { kyc_status: 'rejected' });
    expect(res.status).toBe(400);
    expect(res.json?.error).toBe('reason_code is required when rejecting');

    const row = db.prepare('SELECT kyc_status, participant_market_access FROM participants WHERE id = ?').get('p_norc') as any;
    expect(row.kyc_status).toBe('in_review');
    expect(row.participant_market_access).toBe('full_trading');
  });

  it('reject with reason_code → 200, kyc_status=rejected, market_access=read_only', async () => {
    seedParticipant('p_rej', { kyc_status: 'in_review', status: 'pending' });
    const token = await adminToken();

    const res = await call(token, 'PUT', '/api/admin/kyc/p_rej', { kyc_status: 'rejected', reason_code: 'sanctions_hit' });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);

    const row = db.prepare('SELECT kyc_status, participant_market_access FROM participants WHERE id = ?').get('p_rej') as any;
    expect(row.kyc_status).toBe('rejected');
    expect(row.participant_market_access).toBe('read_only');
  });

  it('approve with invalid reason_code → 400 Invalid reason_code', async () => {
    seedParticipant('p_badrc', { kyc_status: 'in_review', status: 'pending' });
    const token = await adminToken();

    const res = await call(token, 'PUT', '/api/admin/kyc/p_badrc', { kyc_status: 'approved', reason_code: 'not_a_real_code' });
    expect(res.status).toBe(400);
    expect(res.json?.error).toBe('Invalid reason_code');

    const row = db.prepare('SELECT kyc_status FROM participants WHERE id = ?').get('p_badrc') as any;
    expect(row.kyc_status).toBe('in_review');
  });

  it('setting status back to in_review does NOT fire the decision cascade or close the admin review action', async () => {
    seedParticipant('p_back', { kyc_status: 'in_review', status: 'pending' });
    const token = await adminToken();
    // Open the admin review action first (registry runs inline, no QUEUE).
    await runCascadeRegistry({
      event: 'kyc.submitted', actor_id: 'p_back', entity_type: 'participant',
      entity_id: 'p_back', data: {}, env,
    } as any);
    expect(pendingAdminRows('p_back').length).toBe(1);

    const res = await call(token, 'PUT', '/api/admin/kyc/p_back', { kyc_status: 'in_review' });
    expect(res.status).toBe(200);

    // Non-terminal status: market access untouched, review action still open.
    const row = db.prepare('SELECT participant_market_access FROM participants WHERE id = ?').get('p_back') as any;
    expect(row.participant_market_access).toBe('full_trading');
    expect(pendingAdminRows('p_back').length).toBe(1);
    expect(actionedAdminRows('p_back').length).toBe(0);
  });

  it('approve writes an audit_logs row whose changes JSON contains market_access', async () => {
    seedParticipant('p_audit', { kyc_status: 'in_review', status: 'pending' });
    const token = await adminToken();

    const res = await call(token, 'PUT', '/api/admin/kyc/p_audit', { kyc_status: 'approved' });
    expect(res.status).toBe(200);

    const row = db
      .prepare(`SELECT changes FROM audit_logs WHERE action = 'admin.kyc_decision' AND entity_id = ?`)
      .get('p_audit') as any;
    expect(row).toBeTruthy();
    const changes = JSON.parse(row.changes);
    expect(changes.market_access).toBe('full_trading');
    expect('reason_code' in changes).toBe(true);
  });
});
