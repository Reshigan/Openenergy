// ═══════════════════════════════════════════════════════════════════════════
// Task 3.2 - KYC self-service submission + R2 evidence upload.
//
// The caller uploads one document per POST /evidence (a row in the EXISTING
// per-document oe_kyc_submissions table + an R2 object), then POST /submit
// flips their participants.kyc_status to 'in_review'. Everything acts on the
// CALLER only: there is no targetParticipantId in any request body, which is
// what fences ownership + tenancy. file_name is stored AEAD-encrypted
// (dark-by-default plaintext when KYC_ENC_KEY is unset).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken, authMiddleware } from '../src/middleware/auth';
import onboardingKycRoutes from '../src/routes/onboarding-kyc';
import { mountRoutes } from '../src/routes/mount-routes';

// Mount the real sub-app under a parent that applies authMiddleware, the same
// shape production uses to gate nested onboarding paths. The per-module
// r.use('*', authMiddleware) does not reliably match nested paths under this
// Hono version, so the parent gate is what the test relies on (same pattern as
// rbac-invitations.test.ts).
const app = new Hono();
app.use('*', authMiddleware);
app.route('/api/onboarding/kyc', onboardingKycRoutes);

let db: Database.Database;
let env: Record<string, unknown>;

function seedParticipant(id: string, role: string, tenant: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'pending', ?, '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role, tenant);
}

async function tokenFor(id: string, role: string) {
  return signToken({ sub: id, role, email: `${id}@openenergy.co.za` } as any, 'test-secret');
}

async function call(token: string, method: string, path: string, body?: unknown, theEnv = env) {
  const res = await app.request(
    path,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    },
    theEnv,
  );
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

// "hello kyc" as base64 - a tiny payload to stand in for an uploaded document.
const SAMPLE_B64 = Buffer.from('hello kyc').toString('base64');

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});

afterEach(() => {
  db.close();
});

describe('POST /api/onboarding/kyc/evidence', () => {
  it('writes an R2 object and exactly one caller-scoped oe_kyc_submissions row (file_name plaintext when key unset)', async () => {
    seedParticipant('p_a', 'ipp_developer', 'tenant_a');
    const token = await tokenFor('p_a', 'ipp_developer');

    const res = await call(token, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'id_document',
      file_name: 'passport.pdf',
      mime_type: 'application/pdf',
      content_base64: SAMPLE_B64,
    });

    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.json?.data?.document_type).toBe('id_document');
    expect(res.json?.data?.status).toBe('pending');
    const id = res.json?.data?.id;
    expect(id).toBeTruthy();

    // Exactly one row, scoped to caller participant + tenant.
    const rows = db
      .prepare('SELECT * FROM oe_kyc_submissions WHERE participant_id = ?')
      .all('p_a') as any[];
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.id).toBe(id);
    expect(row.participant_id).toBe('p_a');
    expect(row.tenant_id).toBe('tenant_a');
    expect(row.document_type).toBe('id_document');
    expect(row.status).toBe('pending');
    expect(row.r2_key).toBe(`kyc/tenant_a/p_a/${id}`);
    // file_name stored as plaintext (KYC_ENC_KEY unset = dark by default).
    expect(row.file_name).toBe('passport.pdf');
    expect(row.mime_type).toBe('application/pdf');
    expect(row.size_bytes).toBe(Buffer.from('hello kyc').byteLength);

    // The R2 object exists at the derived key.
    const obj = await (env.R2 as any).get(`kyc/tenant_a/p_a/${id}`);
    expect(obj).not.toBeNull();
  });

  it('stores file_name as a v1: AEAD blob when KYC_ENC_KEY is set', async () => {
    seedParticipant('p_enc', 'offtaker', 'tenant_enc');
    const token = await tokenFor('p_enc', 'offtaker');
    // 32-byte key, base64 - turns the encryption gate on for this env only.
    (env as any).KYC_ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

    const res = await call(token, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'proof_of_address',
      file_name: 'utility-bill.pdf',
      mime_type: 'application/pdf',
      content_base64: SAMPLE_B64,
    });

    expect(res.status).toBe(200);
    const row = db
      .prepare('SELECT file_name FROM oe_kyc_submissions WHERE participant_id = ?')
      .get('p_enc') as any;
    expect(row).toBeTruthy();
    expect(String(row.file_name).startsWith('v1:')).toBe(true);
    expect(row.file_name).not.toBe('utility-bill.pdf');
  });

  it('rejects an invalid document_type with 400 and writes NO R2 object and NO DB row', async () => {
    seedParticipant('p_bad', 'trader', 'tenant_bad');
    const token = await tokenFor('p_bad', 'trader');

    const res = await call(token, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'not_a_real_type',
      file_name: 'x.pdf',
      mime_type: 'application/pdf',
      content_base64: SAMPLE_B64,
    });

    expect(res.status).toBe(400);
    expect(res.json?.success).toBe(false);

    const rows = db.prepare('SELECT * FROM oe_kyc_submissions').all() as any[];
    expect(rows.length).toBe(0);
    // No R2 object should have been written - the allow-list reject is before
    // any side effect, so the bucket stays empty.
    expect((env.R2 as any)._keys()).toEqual([]);
  });

  it('rejects malformed base64 with 400, after the allow-list check, before any side effect', async () => {
    seedParticipant('p_b64', 'trader', 'tenant_b64');
    const token = await tokenFor('p_b64', 'trader');

    const res = await call(token, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'id_document',
      file_name: 'x.pdf',
      mime_type: 'application/pdf',
      content_base64: 'not!valid!base64!!!',
    });

    expect(res.status).toBe(400);
    expect(res.json?.success).toBe(false);
    const rows = db.prepare('SELECT * FROM oe_kyc_submissions').all() as any[];
    expect(rows.length).toBe(0);
    expect((env.R2 as any)._keys()).toEqual([]);
  });

  it('rejects a missing/empty content_base64 with 400 before any side effect', async () => {
    seedParticipant('p_empty', 'lender', 'tenant_empty');
    const token = await tokenFor('p_empty', 'lender');

    const res = await call(token, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'bank_confirmation',
      file_name: 'x.pdf',
      mime_type: 'application/pdf',
      content_base64: '',
    });

    expect(res.status).toBe(400);
    const rows = db.prepare('SELECT * FROM oe_kyc_submissions').all() as any[];
    expect(rows.length).toBe(0);
  });
});

describe('POST /api/onboarding/kyc/submit', () => {
  it("flips the caller's participants.kyc_status to 'in_review'", async () => {
    seedParticipant('p_sub', 'carbon_fund', 'tenant_sub');
    const token = await tokenFor('p_sub', 'carbon_fund');

    const res = await call(token, 'POST', '/api/onboarding/kyc/submit', {});
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.json?.data?.kyc_status).toBe('in_review');

    const row = db.prepare('SELECT kyc_status FROM participants WHERE id = ?').get('p_sub') as any;
    expect(row.kyc_status).toBe('in_review');
  });
});

describe('GET /api/onboarding/kyc - owner/tenant fence', () => {
  it('returns only the caller own documents grouped by type, decrypted, never another tenant rows', async () => {
    // ponytail: decrypt is fail-closed by design (prod MUST set KYC_ENC_KEY — a go-live
    // gate). Exercise the real encrypted round-trip, not the no-key plaintext fallback.
    (env as any).KYC_ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
    seedParticipant('owner_a', 'ipp_developer', 'tenant_a');
    seedParticipant('owner_b', 'offtaker', 'tenant_b');

    const tokenA = await tokenFor('owner_a', 'ipp_developer');
    const tokenB = await tokenFor('owner_b', 'offtaker');

    // A uploads two documents.
    await call(tokenA, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'id_document',
      file_name: 'a-id.pdf',
      mime_type: 'application/pdf',
      content_base64: SAMPLE_B64,
    });
    await call(tokenA, 'POST', '/api/onboarding/kyc/evidence', {
      document_type: 'tax_clearance',
      file_name: 'a-tax.pdf',
      mime_type: 'application/pdf',
      content_base64: SAMPLE_B64,
    });

    // A sees its own two documents grouped by type.
    const aGet = await call(tokenA, 'GET', '/api/onboarding/kyc');
    expect(aGet.status).toBe(200);
    expect(aGet.json?.success).toBe(true);
    expect(aGet.json?.data?.kyc_status).toBe('pending');
    const aDocs = aGet.json?.data?.documents || {};
    expect(Object.keys(aDocs).sort()).toEqual(['id_document', 'tax_clearance']);
    expect(aDocs.id_document.length).toBe(1);
    expect(aDocs.id_document[0].file_name).toBe('a-id.pdf'); // decrypted (plaintext here)
    // Internal columns must not leak to the client.
    expect(aDocs.id_document[0].r2_key).toBeUndefined();

    // B (different tenant) sees zero documents.
    const bGet = await call(tokenB, 'GET', '/api/onboarding/kyc');
    expect(bGet.status).toBe(200);
    expect(Object.keys(bGet.json?.data?.documents || {}).length).toBe(0);
  });

  it('fails soft on an undecryptable row: status + list still render, bad file_name is null', async () => {
    seedParticipant('p_corrupt', 'ipp_developer', 'tenant_corrupt');
    const token = await tokenFor('p_corrupt', 'ipp_developer');
    // Gate on, then plant a row whose v1: file_name will not decrypt (bad tag).
    (env as any).KYC_ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
    db.prepare(
      `INSERT INTO oe_kyc_submissions
         (id, participant_id, document_type, r2_key, file_name, mime_type, size_bytes, status, tenant_id, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run('sub_corrupt', 'p_corrupt', 'id_document', 'kyc/tenant_corrupt/p_corrupt/sub_corrupt', 'v1:bad:bad', 'application/pdf', 9, 'tenant_corrupt', '2026-06-06T00:00:00Z');

    const res = await call(token, 'GET', '/api/onboarding/kyc');
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.json?.data?.kyc_status).toBe('pending');
    const docs = res.json?.data?.documents || {};
    expect(docs.id_document?.length).toBe(1);
    expect(docs.id_document[0].file_name).toBeNull();
  });
});

describe('mount collision guard', () => {
  it('the full app routes /api/onboarding/kyc to this router (siblings do NOT shadow it)', async () => {
    seedParticipant('p_mount', 'grid_operator', 'tenant_mount');
    const token = await tokenFor('p_mount', 'grid_operator');

    // Build the full production wiring; the static /api/onboarding/kyc segment
    // must win over any /:param route in the sibling onboarding routers.
    const full = new Hono<any>();
    mountRoutes(full as any);

    const res = await full.request(
      '/api/onboarding/kyc',
      { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      env,
    );
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }

    expect(res.status).toBe(200);
    expect(json?.success).toBe(true);
    expect(json?.data?.kyc_status).toBe('pending');
  });
});
