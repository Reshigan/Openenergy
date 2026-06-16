// ════════════════════════════════════════════════════════════════════════
// polish — e-signing + feature flags + RUM ingest + accessibility.
//
//   /api/polish/signatures          create / verify Ed25519 doc signatures
//   /api/polish/feature-flags       read + admin update; client evaluates locally
//   /api/polish/rum                 RUM event ingest (client-fired)
//   /api/polish/accessibility       audit results store
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signEd25519(privateKeyB64: string, msg: string): Promise<string> {
  try {
    const raw = Uint8Array.from(atob(privateKeyB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', raw, { name: 'Ed25519' } as any, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('Ed25519' as any, key, new TextEncoder().encode(msg)));
    return btoa(String.fromCharCode(...sig));
  } catch { return ''; }
}

async function verifyEd25519(publicKeyB64: string, msg: string, sigB64: string): Promise<boolean> {
  try {
    const raw = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' } as any, false, ['verify']);
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('Ed25519' as any, key, sig, new TextEncoder().encode(msg));
  } catch { return false; }
}

// ─── Signatures ─────────────────────────────────────────────────────────
r.post('/signatures', requireStepUp('document.sign'), async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['document_kind', 'document_ref', 'document_hash'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  let sig = b.signature_b64;
  let publicKey = b.public_key_b64;
  // If signing client-side, expect signature + key in body. Otherwise sign
  // server-side using the platform key (PLATFORM_ATTEST_KEY).
  if (!sig) {
    const pkey = (c.env as any).PLATFORM_ATTEST_KEY;
    if (!pkey) return c.json({ success: false, error: 'no_signing_key' }, 503);
    sig = await signEd25519(pkey, String(b.document_hash));
    publicKey = (c.env as any).PLATFORM_ATTEST_PUBLIC_KEY || 'platform';
  }
  const id = genId('sig');
  await c.env.DB.prepare(`
    INSERT INTO oe_signatures
      (id, document_kind, document_ref, document_hash, signer_id, signer_role,
       signature_b64, public_key_b64, ip, user_agent, signing_method)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.document_kind, b.document_ref, b.document_hash, user.id,
    b.signer_role || null, sig, publicKey,
    c.req.header('cf-connecting-ip') || null,
    (c.req.header('user-agent') || '').slice(0, 300),
    b.signing_method || 'platform_key',
  ).run();
  await fireCascade({
    event: 'document.signature_created',
    actor_id: user.id,
    entity_type: 'signature',
    entity_id: id,
    data: {
      id, document_kind: b.document_kind, document_ref: b.document_ref,
      document_hash: b.document_hash, signer_id: user.id,
      signer_role: b.signer_role || null,
      signing_method: b.signing_method || 'platform_key',
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, signature_b64: sig } }, 201);
});

r.post('/signatures/verify', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.document_hash || !b.signature_b64 || !b.public_key_b64) {
    return c.json({ success: false, error: 'document_hash + signature_b64 + public_key_b64 required' }, 400);
  }
  const ok = await verifyEd25519(b.public_key_b64, b.document_hash, b.signature_b64);
  return c.json({ success: true, data: { valid: ok } });
});

r.get('/signatures', async (c) => {
  const docKind = c.req.query('document_kind');
  const docRef  = c.req.query('document_ref');
  if (!docKind || !docRef) return c.json({ success: false, error: 'document_kind + document_ref required' }, 400);
  const rows = await c.env.DB.prepare(`
    SELECT id, document_kind, document_ref, document_hash, signer_id, signer_role,
           signature_b64, public_key_b64, signed_at, signing_method
    FROM oe_signatures WHERE document_kind = ? AND document_ref = ?
    ORDER BY signed_at ASC
  `).bind(docKind, docRef).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Feature flags ──────────────────────────────────────────────────────
r.get('/feature-flags', async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_feature_flags WHERE killed = 0`).all<any>();
  // Evaluate per-caller
  const evaluated: Record<string, boolean> = {};
  for (const f of (rows.results || []) as any[]) {
    const allowlist = f.participant_allowlist ? JSON.parse(f.participant_allowlist) : null;
    const blocklist = f.participant_blocklist ? JSON.parse(f.participant_blocklist) : null;
    const roleOverrides = f.role_overrides ? JSON.parse(f.role_overrides) : {};
    let enabled: boolean;
    if (blocklist?.includes(user.id)) enabled = false;
    else if (allowlist?.includes(user.id)) enabled = true;
    else {
      const rolePct = Number(roleOverrides[user.role] ?? f.rollout_pct);
      // Deterministic bucketing by hash(participant_id + key) % 100
      const bucket = hashBucket(`${user.id}:${f.key}`);
      enabled = bucket < rolePct || (rolePct === 100 || (Number(f.default_enabled) === 1 && f.rollout_pct === 100));
    }
    evaluated[f.key] = enabled;
  }
  return c.json({ success: true, data: { flags: evaluated, raw: rows.results } });
});

function hashBucket(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100;
}

r.put('/feature-flags/:key', requireStepUp('platform.feature_flag.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const key = c.req.param('key');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_feature_flags
      (key, description, default_enabled, rollout_pct, role_overrides,
       participant_allowlist, participant_blocklist, killed, updated_at, updated_by)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),?)
  `).bind(
    key, b.description || null,
    b.default_enabled ? 1 : 0,
    Number(b.rollout_pct || 0),
    b.role_overrides ? JSON.stringify(b.role_overrides) : null,
    b.participant_allowlist ? JSON.stringify(b.participant_allowlist) : null,
    b.participant_blocklist ? JSON.stringify(b.participant_blocklist) : null,
    b.killed ? 1 : 0,
    user.id,
  ).run();
  await fireCascade({
    event: 'flag.changed',
    actor_id: user.id,
    entity_type: 'feature_flag',
    entity_id: String(key),
    data: {
      key, description: b.description || null,
      default_enabled: b.default_enabled ? 1 : 0,
      rollout_pct: Number(b.rollout_pct || 0),
      killed: b.killed ? 1 : 0,
      role_overrides: b.role_overrides || null,
      updated_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── RUM ────────────────────────────────────────────────────────────────
r.post('/rum', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const events: any[] = Array.isArray(b.events) ? b.events : [b];
  const ua = (c.req.header('user-agent') || '').slice(0, 300);
  const rumStmts: D1PreparedStatement[] = [];
  for (const e of events) {
    if (!e.metric || !e.page_path) continue;
    rumStmts.push(c.env.DB.prepare(`
      INSERT INTO oe_rum_events
        (id, participant_id, session_id, page_path, metric, value,
         user_agent, network_type, device_category)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      genId('rum'), user.id, e.session_id || null,
      String(e.page_path).slice(0, 200), String(e.metric),
      e.value != null ? Number(e.value) : null,
      ua, e.network_type || null, e.device_category || null,
    ));
  }
  for (let i = 0; i < rumStmts.length; i += 100) await c.env.DB.batch(rumStmts.slice(i, i + 100));
  return c.json({ success: true, data: { written: rumStmts.length } });
});

r.get('/rum/summary', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`
    SELECT metric, page_path, COUNT(*) AS n, AVG(value) AS avg_v,
           MIN(value) AS min_v, MAX(value) AS max_v
    FROM oe_rum_events WHERE recorded_at >= datetime('now','-7 days')
    GROUP BY metric, page_path ORDER BY n DESC LIMIT 200
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Accessibility ──────────────────────────────────────────────────────
r.post('/accessibility', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.page_path || !b.audit_tool) return c.json({ success: false, error: 'page_path + audit_tool required' }, 400);
  const id = genId('a11y');
  await c.env.DB.prepare(`
    INSERT INTO oe_accessibility_audits
      (id, page_path, audit_tool, wcag_level, passes, violations, incomplete, details_r2_key, audited_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.page_path, b.audit_tool, b.wcag_level || 'AA',
    Number(b.passes || 0), Number(b.violations || 0), Number(b.incomplete || 0),
    b.details_r2_key || null, user.id,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

r.get('/accessibility', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_accessibility_audits ORDER BY audited_at DESC LIMIT 100`).all();
  return c.json({ success: true, data: rows.results || [] });
});

export default r;
