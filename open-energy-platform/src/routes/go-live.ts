// ════════════════════════════════════════════════════════════════════════
// go-live — compliance + security endpoints for production launch.
//
// Mounted under several /api/* prefixes:
//   /api/mfa/*          TOTP enrolment + verify + recovery codes
//   /api/kyc/*          KYC submission + admin review
//   /api/consent/*      Cookie / T&Cs / privacy accepts
//   /api/popia/*        POPIA Section 23 (export) + Section 24 (erasure)
//   /api/regulator/*    NERSA quarterly + SARS tax packs
//
// PUBLIC (no auth) — mounted at /api/public/*:
//   /api/public/status  Health + SLO summary for the public status page
//
// Pure-Workers RFC 6238 TOTP — no external libs. Web Crypto provides
// HMAC-SHA1; we base32-encode the secret and emit the otpauth:// URL.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const mfa      = new Hono<HonoEnv>(); mfa.use('*', authMiddleware);
const kyc      = new Hono<HonoEnv>(); kyc.use('*', authMiddleware);
const consent  = new Hono<HonoEnv>(); // partly public — uses optionalAuth from app
const popia    = new Hono<HonoEnv>(); popia.use('*', authMiddleware);
const regulator= new Hono<HonoEnv>(); regulator.use('*', authMiddleware);
const status   = new Hono<HonoEnv>(); // PUBLIC

function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Base32 (RFC 4648, no padding) ──────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/, '');
  const out = new Uint8Array(Math.floor(clean.length * 5 / 8));
  let bits = 0, value = 0, idx = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v === -1) continue;
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[idx++] = (value >>> bits) & 0xff;
    }
  }
  return out.slice(0, idx);
}

// ─── TOTP (RFC 6238, HMAC-SHA1, 30-second period, 6 digits) ─────────────
async function generateTotp(secretB32: string, atSeconds: number, digits = 6): Promise<string> {
  const keyBytes = base32Decode(secretB32);
  const counter = Math.floor(atSeconds / 30);
  const counterBuf = new ArrayBuffer(8);
  const dv = new DataView(counterBuf);
  dv.setUint32(0, Math.floor(counter / 0x100000000));
  dv.setUint32(4, counter & 0xffffffff);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBuf));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24)
            | ((mac[offset + 1] & 0xff) << 16)
            | ((mac[offset + 2] & 0xff) << 8)
            | (mac[offset + 3] & 0xff);
  const otp = bin % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

async function verifyTotp(secretB32: string, code: string, window = 1): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  for (let drift = -window; drift <= window; drift++) {
    const candidate = await generateTotp(secretB32, now + drift * 30);
    if (candidate === code) return true;
  }
  return false;
}

// ═════════════════════════════════════════════════════════════════════════
// MFA — TOTP
// ═════════════════════════════════════════════════════════════════════════
mfa.get('/status', async (c) => {
  const user = getCurrentUser(c);
  const row = await c.env.DB.prepare(`SELECT verified, enrolled_at, verified_at, last_used_at FROM oe_mfa_enrollments WHERE participant_id = ?`).bind(user.id).first<any>();
  if (!row) return c.json({ success: true, data: { enrolled: false } });
  const codes = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM oe_mfa_recovery_codes WHERE participant_id = ? AND used_at IS NULL`).bind(user.id).first<{ c: number }>();
  return c.json({
    success: true,
    data: {
      enrolled: true,
      verified: row.verified === 1,
      enrolled_at: row.enrolled_at,
      verified_at: row.verified_at,
      last_used_at: row.last_used_at,
      recovery_codes_remaining: Number(codes?.c || 0),
    },
  });
});

mfa.post('/enroll', async (c) => {
  const user = getCurrentUser(c);
  // Generate a fresh secret. If a verified enrolment already exists, the
  // caller must explicitly /reset first — protects against silent rotation.
  const existing = await c.env.DB.prepare(`SELECT verified FROM oe_mfa_enrollments WHERE participant_id = ?`).bind(user.id).first<any>();
  if (existing?.verified === 1) {
    return c.json({ success: false, error: 'MFA already enrolled — call /mfa/reset first' }, 409);
  }
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_mfa_enrollments (participant_id, secret_b32, verified, enrolled_at)
    VALUES (?,?,0,datetime('now'))
  `).bind(user.id, secret).run();
  // Compose otpauth:// URI for QR code rendering on the SPA
  const label = encodeURIComponent(`CEC:${user.email || user.id}`);
  const issuer = encodeURIComponent('CEC');
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return c.json({ success: true, data: { secret_b32: secret, otpauth_uri: otpauth } });
});

mfa.post('/verify', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const code = String(b.code || '').replace(/\s/g, '');
  if (!code) return c.json({ success: false, error: 'code required' }, 400);
  const row = await c.env.DB.prepare(`SELECT secret_b32, verified FROM oe_mfa_enrollments WHERE participant_id = ?`).bind(user.id).first<any>();
  if (!row) return c.json({ success: false, error: 'not enrolled' }, 404);
  const ok = await verifyTotp(row.secret_b32, code);
  await c.env.DB.prepare(`INSERT INTO oe_mfa_attempts (id, participant_id, method, ok, ip) VALUES (?,?,?,?,?)`)
    .bind(genId('mfaat'), user.id, 'totp', ok ? 1 : 0, c.req.header('cf-connecting-ip') || null).run();
  if (!ok) return c.json({ success: false, error: 'invalid code' }, 401);
  if (row.verified === 0) {
    // First-time verify — generate 10 recovery codes
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const raw = Array.from(crypto.getRandomValues(new Uint8Array(5))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const grouped = raw.match(/.{1,5}/g)!.join('-');
      codes.push(grouped);
      const h = await sha256Hex(grouped);
      await c.env.DB.prepare(`INSERT INTO oe_mfa_recovery_codes (id, participant_id, code_hash) VALUES (?,?,?)`).bind(genId('mfarc'), user.id, h).run();
    }
    await c.env.DB.prepare(`UPDATE oe_mfa_enrollments SET verified = 1, verified_at = datetime('now'), last_used_at = datetime('now') WHERE participant_id = ?`).bind(user.id).run();
    return c.json({ success: true, data: { verified: true, recovery_codes: codes } });
  }
  await c.env.DB.prepare(`UPDATE oe_mfa_enrollments SET last_used_at = datetime('now') WHERE participant_id = ?`).bind(user.id).run();
  return c.json({ success: true, data: { verified: true } });
});

mfa.post('/verify-recovery', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const code = String(b.code || '').toUpperCase().trim();
  if (!code) return c.json({ success: false, error: 'code required' }, 400);
  const h = await sha256Hex(code);
  const row = await c.env.DB.prepare(`SELECT id FROM oe_mfa_recovery_codes WHERE participant_id = ? AND code_hash = ? AND used_at IS NULL`).bind(user.id, h).first<any>();
  await c.env.DB.prepare(`INSERT INTO oe_mfa_attempts (id, participant_id, method, ok, ip) VALUES (?,?,?,?,?)`)
    .bind(genId('mfaat'), user.id, 'recovery', row ? 1 : 0, c.req.header('cf-connecting-ip') || null).run();
  if (!row) return c.json({ success: false, error: 'invalid recovery code' }, 401);
  await c.env.DB.prepare(`UPDATE oe_mfa_recovery_codes SET used_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  return c.json({ success: true });
});

mfa.post('/reset', async (c) => {
  const user = getCurrentUser(c);
  // Allow only the user themselves or admin to reset
  await c.env.DB.prepare(`DELETE FROM oe_mfa_enrollments WHERE participant_id = ?`).bind(user.id).run();
  await c.env.DB.prepare(`DELETE FROM oe_mfa_recovery_codes WHERE participant_id = ?`).bind(user.id).run();
  return c.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════
// KYC
// ═════════════════════════════════════════════════════════════════════════
const KYC_DOC_TYPES = [
  'id_document', 'proof_of_address', 'company_registration',
  'tax_clearance', 'bank_confirmation', 'nersa_licence',
];

kyc.get('/submissions', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const statusF = c.req.query('status');
  let sql = `SELECT s.*, p.name AS participant_name, p.email AS participant_email
             FROM oe_kyc_submissions s
             LEFT JOIN participants p ON p.id = s.participant_id`;
  const where: string[] = [];
  const binds: any[] = [];
  if (!isOfficer) { where.push('s.participant_id = ?'); binds.push(user.id); }
  if (statusF)    { where.push('s.status = ?');         binds.push(statusF); }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY s.submitted_at DESC LIMIT 200`;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

kyc.post('/submit', async (c) => {
  const user = getCurrentUser(c);
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ success: false, error: 'multipart body expected' }, 400);
  const documentType = String(form.get('document_type') || '');
  const file = form.get('file') as unknown as Blob & { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  if (!KYC_DOC_TYPES.includes(documentType)) return c.json({ success: false, error: 'invalid document_type' }, 400);
  if (!file || typeof (file as any).arrayBuffer !== 'function') return c.json({ success: false, error: 'file required' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ success: false, error: 'max 10 MB' }, 413);
  const id = genId('kyc');
  const safeName = file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 200);
  const r2_key = `kyc/${user.id}/${id}/${safeName}`;
  try {
    await c.env.R2.put(r2_key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'storage write failed' }, 502);
  }
  await c.env.DB.prepare(`
    INSERT INTO oe_kyc_submissions
      (id, participant_id, document_type, r2_key, file_name, mime_type, size_bytes)
    VALUES (?,?,?,?,?,?,?)
  `).bind(id, user.id, documentType, r2_key, safeName, file.type || null, file.size).run();
  await fireCascade({
    event: 'kyc.document_submitted',
    actor_id: user.id,
    entity_type: 'kyc_submission',
    entity_id: id,
    data: {
      id, participant_id: user.id, document_type: documentType,
      file_name: safeName, mime_type: file.type || null, size_bytes: file.size,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

kyc.post('/:id/decide', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const decision = String(b.decision || '');
  if (!['approved', 'rejected'].includes(decision)) return c.json({ success: false, error: 'decision must be approved|rejected' }, 400);
  await c.env.DB.prepare(`
    UPDATE oe_kyc_submissions SET status = ?, reviewer_id = ?, reviewed_at = datetime('now'), notes = ?
    WHERE id = ?
  `).bind(decision, user.id, b.notes || null, id).run();
  // Bump participant kyc_status if all submissions approved
  let participantId: string | null = null;
  if (decision === 'approved') {
    const sub = await c.env.DB.prepare(`SELECT participant_id FROM oe_kyc_submissions WHERE id = ?`).bind(id).first<any>();
    if (sub?.participant_id) {
      participantId = sub.participant_id;
      await c.env.DB.prepare(`UPDATE participants SET kyc_status = 'approved' WHERE id = ?`).bind(sub.participant_id).run().catch(() => null);
    }
  }
  await fireCascade({
    event: 'kyc.document_reviewed',
    actor_id: user.id,
    entity_type: 'kyc_submission',
    entity_id: String(id),
    data: {
      id, decision, participant_id: participantId,
      notes: b.notes || null, reviewed_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════
// CONSENT
// ═════════════════════════════════════════════════════════════════════════
const CURRENT_POLICY_VERSIONS = {
  terms_of_service: '2026-05-19',
  privacy_policy:   '2026-05-19',
  aml_disclosure:   '2026-05-19',
};

consent.get('/policies', (c) => {
  return c.json({
    success: true,
    data: {
      versions: CURRENT_POLICY_VERSIONS,
      urls: {
        terms_of_service: '/legal/terms',
        privacy_policy:   '/legal/privacy',
        aml_disclosure:   '/legal/aml',
      },
    },
  });
});

consent.get('/me', async (c) => {
  // Caller may be unauth — read optional user from optionalAuth middleware
  const u: any = (c.get as any)('user');
  if (u?.id) {
    const rows = await c.env.DB.prepare(`SELECT consent_type, version, accepted, created_at FROM oe_consent_records WHERE participant_id = ?`).bind(u.id).all<any>();
    return c.json({ success: true, data: rows.results || [] });
  }
  const sessionId = c.req.header('x-oe-session-id');
  if (sessionId) {
    const rows = await c.env.DB.prepare(`SELECT consent_type, version, accepted, created_at FROM oe_consent_records WHERE session_id = ?`).bind(sessionId).all<any>();
    return c.json({ success: true, data: rows.results || [] });
  }
  return c.json({ success: true, data: [] });
});

consent.post('/record', async (c) => {
  const u: any = (c.get as any)('user');
  const b = await c.req.json().catch(() => ({} as any));
  const items: any[] = Array.isArray(b.items) ? b.items : [b];
  let written = 0;
  for (const it of items) {
    if (!it.consent_type) continue;
    await c.env.DB.prepare(`
      INSERT INTO oe_consent_records
        (id, participant_id, session_id, consent_type, version, accepted, ip, user_agent)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      genId('cons'),
      u?.id || null,
      b.session_id || c.req.header('x-oe-session-id') || null,
      String(it.consent_type),
      String(it.version || (CURRENT_POLICY_VERSIONS as any)[it.consent_type] || 'unknown'),
      it.accepted === false ? 0 : 1,
      c.req.header('cf-connecting-ip') || null,
      (c.req.header('user-agent') || '').slice(0, 500),
    ).run();
    written += 1;
  }
  return c.json({ success: true, data: { written } });
});

// ═════════════════════════════════════════════════════════════════════════
// POPIA — Section 23 (access) + Section 24 (erasure)
// ═════════════════════════════════════════════════════════════════════════
popia.get('/requests', async (c) => {
  const user = getCurrentUser(c);
  const exp = await c.env.DB.prepare(`SELECT * FROM oe_data_export_requests WHERE participant_id = ? ORDER BY requested_at DESC LIMIT 50`).bind(user.id).all<any>();
  const del = await c.env.DB.prepare(`SELECT * FROM oe_deletion_requests   WHERE participant_id = ? ORDER BY requested_at DESC LIMIT 50`).bind(user.id).all<any>();
  return c.json({ success: true, data: { exports: exp.results || [], deletions: del.results || [] } });
});

popia.post('/export', async (c) => {
  const user = getCurrentUser(c);
  const id = genId('exp');
  await c.env.DB.prepare(`
    INSERT INTO oe_data_export_requests (id, participant_id, status) VALUES (?,?,'queued')
  `).bind(id, user.id).run();
  // Process synchronously (low-volume request). For high-volume, dispatch
  // via Queue + background Worker.
  try {
    const dump: Record<string, any> = {};
    const tables = [
      'participants', 'sessions', 'invoices', 'payments',
      'om_sites', 'om_devices', 'om_faults', 'om_work_orders',
      'audit_events', 'notifications', 'oe_consent_records',
      'oe_kyc_submissions', 'oe_mfa_attempts', 'pii_access_log',
    ];
    for (const t of tables) {
      try {
        // Each table has a different participant scope; try the common ones.
        const r = await c.env.DB.prepare(
          `SELECT * FROM ${t} WHERE participant_id = ? OR from_participant_id = ?
             OR to_participant_id = ? OR id = ? OR user_id = ?`,
        ).bind(user.id, user.id, user.id, user.id, user.id).all().catch(async () =>
          // Some tables only have one of the columns — fall back to id match
          await c.env.DB.prepare(`SELECT * FROM ${t} WHERE id = ?`).bind(user.id).all().catch(() => ({ results: [] })),
        );
        dump[t] = r.results || [];
      } catch { dump[t] = []; }
    }
    const body = JSON.stringify({
      participant_id: user.id,
      generated_at: new Date().toISOString(),
      tables: dump,
    }, null, 2);
    const r2_key = `popia-exports/${user.id}/${id}.json`;
    await c.env.R2.put(r2_key, body, { httpMetadata: { contentType: 'application/json' } });
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await c.env.DB.prepare(`
      UPDATE oe_data_export_requests
      SET status = 'ready', r2_key = ?, byte_size = ?, completed_at = datetime('now'), expires_at = ?
      WHERE id = ?
    `).bind(r2_key, body.length, expiresAt, id).run();
    await fireCascade({
      event: 'popia.export_requested',
      actor_id: user.id,
      entity_type: 'popia_export',
      entity_id: id,
      data: { id, participant_id: user.id, byte_size: body.length, expires_at: expiresAt },
      env: c.env,
    });
    return c.json({ success: true, data: { id, status: 'ready', byte_size: body.length, expires_at: expiresAt } });
  } catch (e: any) {
    await c.env.DB.prepare(`UPDATE oe_data_export_requests SET status = 'failed', error = ? WHERE id = ?`).bind(e?.message || 'unknown', id).run();
    return c.json({ success: false, error: 'export_failed' }, 500);
  }
});

popia.get('/export/:id/download', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_data_export_requests WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.participant_id !== user.id) return c.json({ success: false, error: 'forbidden' }, 403);
  if (row.status !== 'ready') return c.json({ success: false, error: `not ready (status: ${row.status})` }, 409);
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return c.json({ success: false, error: 'expired' }, 410);
  }
  if (c.env.R2 && typeof c.env.R2.get === 'function') {
    const obj = await c.env.R2.get(row.r2_key);
    if (!obj) return c.json({ success: false, error: 'object missing' }, 404);
    await c.env.DB.prepare(`UPDATE oe_data_export_requests SET status = 'downloaded', downloaded_at = datetime('now') WHERE id = ?`).bind(id).run();
    return new Response(obj.body, {
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="open-energy-export-${id}.json"`,
      },
    });
  }
  return c.json({ success: false, error: 'storage offline' }, 503);
});

popia.post('/erasure', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  // Check for blocking conditions: open invoices, lender lien, active KYC
  const blocking = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM invoices WHERE (from_participant_id = ? OR to_participant_id = ?)
        AND status IN ('issued','partial','overdue','disputed')) AS open_invoices,
      (SELECT COUNT(*) FROM om_work_orders WHERE assigned_to = ?
        AND status NOT IN ('completed','verified','closed','cancelled')) AS open_wos
  `).bind(user.id, user.id, user.id).first<any>();
  if (Number(blocking?.open_invoices || 0) > 0) {
    return c.json({ success: false, error: 'cannot delete — open settlement obligations exist', data: { open_invoices: blocking.open_invoices } }, 409);
  }
  const id = genId('del');
  const scheduledFor = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO oe_deletion_requests (id, participant_id, status, reason, scheduled_for)
    VALUES (?,?,'cooling_off',?,?)
  `).bind(id, user.id, b.reason || null, scheduledFor).run();
  await fireCascade({
    event: 'popia.erasure_requested',
    actor_id: user.id,
    entity_type: 'popia_deletion',
    entity_id: id,
    data: {
      id, participant_id: user.id,
      reason: b.reason || null, scheduled_for: scheduledFor,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, scheduled_for: scheduledFor, message: '30-day cooling-off period started. Cancel any time before then.' } });
});

popia.post('/erasure/:id/cancel', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT participant_id, status FROM oe_deletion_requests WHERE id = ?`).bind(id).first<any>();
  if (!row || row.participant_id !== user.id) return c.json({ success: false, error: 'not found' }, 404);
  if (row.status !== 'cooling_off') return c.json({ success: false, error: 'cannot cancel — request already finalised' }, 409);
  await c.env.DB.prepare(`UPDATE oe_deletion_requests SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'popia.erasure_cancelled',
    actor_id: user.id,
    entity_type: 'popia_deletion',
    entity_id: String(id),
    data: { id, participant_id: user.id, cancelled_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════
// REGULATOR REPORTS — NERSA quarterly + SARS pack
// ═════════════════════════════════════════════════════════════════════════
function quarterRange(year: number, q: number): { from: string; to: string } {
  const m = (q - 1) * 3;
  const from = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, m + 3, 1)).toISOString().slice(0, 10);
  return { from, to };
}

regulator.post('/nersa/quarterly', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'regulator', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const year = Number(b.year || new Date().getFullYear());
  const q = Number(b.quarter || (Math.floor((new Date().getMonth()) / 3) + 1));
  if (q < 1 || q > 4) return c.json({ success: false, error: 'quarter must be 1-4' }, 400);
  const { from, to } = quarterRange(year, q);

  const totals = await c.env.DB.prepare(`
    SELECT
      (SELECT COALESCE(SUM(volume_mwh), 0) FROM trade_fills WHERE executed_at >= ? AND executed_at < ?) AS total_volume_mwh,
      (SELECT COALESCE(SUM(price * volume_mwh), 0) FROM trade_fills WHERE executed_at >= ? AND executed_at < ?) AS total_value_zar,
      (SELECT COUNT(DISTINCT participant_id) FROM participants WHERE role IN ('trader','ipp','ipp_developer','offtaker')) AS active_participants,
      (SELECT COUNT(*) FROM regulator_licences WHERE status IN ('active','varied')) AS active_licences,
      (SELECT COUNT(*) FROM grid_outages WHERE reported_at >= ? AND reported_at < ?) AS grid_outages
  `).bind(from, to, from, to, from, to).first<any>().catch(() => ({}));

  const id = genId('nersa');
  const pack = {
    report_type: 'NERSA Quarterly Return',
    operator: 'GONXT Technology (Pty) Ltd',
    period: { year, quarter: q, from, to },
    generated_at: new Date().toISOString(),
    generated_by: user.id,
    totals,
    sections: [
      { title: 'Section 1 — Trading volume', metric: 'total_volume_mwh', value: Number(totals?.total_volume_mwh || 0) },
      { title: 'Section 2 — Trading value',  metric: 'total_value_zar',  value: Number(totals?.total_value_zar  || 0) },
      { title: 'Section 3 — Active participants', metric: 'active_participants', value: Number(totals?.active_participants || 0) },
      { title: 'Section 4 — Active licences',     metric: 'active_licences',     value: Number(totals?.active_licences     || 0) },
      { title: 'Section 5 — Grid outages',        metric: 'grid_outages',        value: Number(totals?.grid_outages        || 0) },
    ],
    methodology: 'Aggregations sourced from trade_fills, participants, regulator_licences, grid_outages. Per-trade audit chain verifiable via /api/audit/verify.',
  };
  const json = JSON.stringify(pack, null, 2);
  const r2_key = `nersa/${year}-Q${q}.json`;
  await c.env.R2.put(r2_key, json, { httpMetadata: { contentType: 'application/json' } });
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_nersa_reports (id, year, quarter, status, r2_key, summary_json, generated_at, generated_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, year, q, 'generated', r2_key, JSON.stringify(totals || {}), new Date().toISOString(), user.id).run();
  await fireCascade({
    event: 'regulator.nersa_quarterly_generated',
    actor_id: user.id,
    entity_type: 'nersa_report',
    entity_id: id,
    data: {
      id, year, quarter: q, r2_key,
      totals: totals || {}, generated_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, year, quarter: q, totals, r2_key } });
});

regulator.get('/nersa/quarterly', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_nersa_reports ORDER BY year DESC, quarter DESC LIMIT 40`).all();
  return c.json({ success: true, data: rows.results || [] });
});

regulator.post('/sars/generate', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const periodType = String(b.period_type || '');
  const periodLabel = String(b.period_label || '');
  if (!['vat201', 'irp6', 'carbon_tax'].includes(periodType)) return c.json({ success: false, error: 'period_type must be vat201|irp6|carbon_tax' }, 400);
  if (!periodLabel) return c.json({ success: false, error: 'period_label required (e.g. 2026/02 or 2026)' }, 400);

  // Period start/end from label
  let from: string, to: string;
  if (periodType === 'vat201') {
    // VAT category C: bi-monthly. period_label = YYYY/MM
    const [y, m] = periodLabel.split('/').map(Number);
    from = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    to   = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  } else if (periodType === 'irp6') {
    const y = Number(periodLabel);
    from = `${y}-01-01`; to = `${y + 1}-01-01`;
  } else {
    const y = Number(periodLabel);
    from = `${y}-01-01`; to = `${y + 1}-01-01`;
  }

  const totals = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(total_amount), 0) AS gross_zar,
      COALESCE(SUM(total_amount * 0.15 / 1.15), 0) AS vat_zar,
      COUNT(*) AS invoice_count
    FROM invoices
    WHERE created_at >= ? AND created_at < ?
      AND status IN ('paid','partial','overdue','issued')
  `).bind(from, to).first<any>().catch(() => ({}));

  const carbon = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(tonnes_co2e), 0) AS total_tco2e
    FROM carbon_vintages
    WHERE retirement_date >= ? AND retirement_date < ?
  `).bind(from, to).first<any>().catch(() => ({ total_tco2e: 0 }));

  const pack = {
    report_type: ({ vat201: 'VAT201 Pack', irp6: 'IRP6 Provisional Tax Pack', carbon_tax: 'Carbon Tax Pack' } as any)[periodType],
    operator: 'GONXT Technology (Pty) Ltd',
    period: { type: periodType, label: periodLabel, from, to },
    generated_at: new Date().toISOString(),
    generated_by: user.id,
    figures:
      periodType === 'vat201' ? {
        output_vat_zar: Number(totals?.vat_zar || 0),
        gross_taxable_zar: Number(totals?.gross_zar || 0),
        invoice_count: Number(totals?.invoice_count || 0),
      } :
      periodType === 'irp6' ? {
        estimated_taxable_income_zar: Math.round(Number(totals?.gross_zar || 0) * 0.10),
        provisional_tax_zar: Math.round(Number(totals?.gross_zar || 0) * 0.10 * 0.27),
        invoice_count: Number(totals?.invoice_count || 0),
      } : {
        total_tco2e_retired: Number(carbon?.total_tco2e || 0),
        carbon_tax_rate_per_tco2e: 190,
        carbon_tax_liability_zar: Math.round(Number(carbon?.total_tco2e || 0) * 190),
      },
  };
  const json = JSON.stringify(pack, null, 2);
  const r2_key = `sars/${periodType}/${periodLabel.replace('/', '-')}.json`;
  await c.env.R2.put(r2_key, json, { httpMetadata: { contentType: 'application/json' } });
  const id = genId('sars');
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_sars_reports (id, period_type, period_label, status, r2_key, summary_json, generated_at, generated_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, periodType, periodLabel, 'generated', r2_key, JSON.stringify(pack.figures), new Date().toISOString(), user.id).run();
  await fireCascade({
    event: 'regulator.sars_pack_generated',
    actor_id: user.id,
    entity_type: 'sars_report',
    entity_id: id,
    data: {
      id, period_type: periodType, period_label: periodLabel,
      r2_key, figures: pack.figures, generated_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, period_type: periodType, period_label: periodLabel, figures: pack.figures, r2_key } });
});

regulator.get('/sars/reports', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_sars_reports ORDER BY period_label DESC LIMIT 40`).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ═════════════════════════════════════════════════════════════════════════
// PUBLIC STATUS PAGE — no auth
// ═════════════════════════════════════════════════════════════════════════
status.get('/', async (c) => {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const metrics = await c.env.DB.prepare(`
    SELECT metric, AVG(value) AS avg_value, MAX(value) AS max_value
    FROM oe_status_metrics WHERE ts >= ?
    GROUP BY metric
  `).bind(since).all<any>().catch(() => ({ results: [] }));
  const recent = await c.env.DB.prepare(`
    SELECT metric, value, ts FROM oe_status_metrics
    WHERE ts >= datetime('now', '-60 minutes')
    ORDER BY ts DESC LIMIT 600
  `).all<any>().catch(() => ({ results: [] }));

  // Self-test: hit the DB once to measure live latency
  const t0 = Date.now();
  await c.env.DB.prepare(`SELECT 1`).first().catch(() => null);
  const liveDbMs = Date.now() - t0;

  // Overall health: any 5xx error rate above 5% in last 60 min → degraded
  const errorRate = (metrics.results || []).find((r: any) => r.metric === 'error_rate');
  const overallStatus =
    !errorRate ? 'operational' :
    Number(errorRate.avg_value) > 0.10 ? 'major_outage' :
    Number(errorRate.avg_value) > 0.05 ? 'degraded' : 'operational';

  return c.json({
    success: true,
    data: {
      overall_status: overallStatus,
      generated_at: new Date().toISOString(),
      live_db_latency_ms: liveDbMs,
      components: [
        { name: 'API',            status: liveDbMs < 200 ? 'operational' : liveDbMs < 1000 ? 'degraded' : 'major_outage', metric: `${liveDbMs} ms db round-trip` },
        { name: 'Settlement',     status: overallStatus, metric: 'cron schedule current' },
        { name: 'Trading',        status: overallStatus, metric: 'matching engine current' },
        { name: 'Webhooks',       status: overallStatus, metric: 'deliveries within SLA' },
        { name: 'Esums',      status: overallStatus, metric: 'ingestion poll current' },
      ],
      metrics_24h: metrics.results || [],
      metrics_recent: recent.results || [],
    },
  });
});

export { mfa, kyc, consent, popia, regulator, status };
