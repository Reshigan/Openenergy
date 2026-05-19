// ════════════════════════════════════════════════════════════════════════
// audit-l5 — Merkle batching + per-event inclusion proofs + third-party
// attestor co-signing.
//
//   POST /merkle/build   — daily cron emits a Merkle root over yesterday's
//                          audit_events per entity_type; signs with platform
//                          Ed25519 key (PLATFORM_ATTEST_KEY env)
//   GET  /merkle/roots   — list published roots (open data — anyone can
//                          verify if they have an event)
//   GET  /merkle/roots/:day/:entity_type — single root + signature
//   POST /proof/:event_id — generate the Merkle inclusion proof
//   POST /verify         — verify an event hash + proof against published
//                          root, returning matches: true/false
//   GET  /attestors      — registered attestor public keys
//   POST /attestors/:id/cosign — accept an attestor's signature on a root
//
// Mounted at /api/audit-l5 (admin endpoints) + /api/public/audit (open data).
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';

export const admin = new Hono<HonoEnv>(); admin.use('*', authMiddleware);
export const pub   = new Hono<HonoEnv>();

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compute Merkle root from a list of hashes. Uses SHA-256 with the
// duplicate-last-leaf rule for odd levels (Bitcoin-style).
async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return '';
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : a;
      next.push(await sha256(a + b));
    }
    level = next;
  }
  return level[0];
}

// Merkle proof = list of sibling hashes from leaf up to root with
// position (left/right). Verifier recomputes by hashing pair-wise.
async function merklePath(leaves: string[], index: number): Promise<Array<{ hash: string; side: 'L' | 'R' }>> {
  const path: Array<{ hash: string; side: 'L' | 'R' }> = [];
  let level = leaves.slice();
  let idx = index;
  while (level.length > 1) {
    const sibling = idx % 2 === 0
      ? (idx + 1 < level.length ? level[idx + 1] : level[idx])
      : level[idx - 1];
    path.push({ hash: sibling, side: idx % 2 === 0 ? 'R' : 'L' });
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : a;
      next.push(await sha256(a + b));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return path;
}

async function verifyMerkle(leafHash: string, path: Array<{ hash: string; side: 'L' | 'R' }>, root: string): Promise<boolean> {
  let cur = leafHash;
  for (const step of path) {
    cur = step.side === 'R'
      ? await sha256(cur + step.hash)
      : await sha256(step.hash + cur);
  }
  return cur === root;
}

// Ed25519 sign / verify using Web Crypto (subtle Ed25519 supported in
// modern Workers runtime). Key is base64 raw bytes.
async function signEd25519(privateKeyB64: string, message: string): Promise<string> {
  const raw = Uint8Array.from(atob(privateKeyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', raw, { name: 'Ed25519' } as any, false, ['sign']).catch(() => null);
  if (!key) return '';
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519' as any, key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...sig));
}

async function verifyEd25519(publicKeyB64: string, message: string, signatureB64: string): Promise<boolean> {
  try {
    const raw = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' } as any, false, ['verify']);
    const sig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('Ed25519' as any, key, sig, new TextEncoder().encode(message));
  } catch { return false; }
}

// ─── Build daily Merkle root ─────────────────────────────────────────
admin.post('/merkle/build', requireStepUp('audit.merkle_build'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const day = String(b.day || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  const entityType = String(b.entity_type || '');
  if (!entityType) return c.json({ success: false, error: 'entity_type required' }, 400);
  const rows = await c.env.DB.prepare(`
    SELECT id, content_hash, sequence_no FROM audit_events
    WHERE entity_type = ? AND date(created_at) = ?
    ORDER BY sequence_no ASC
  `).bind(entityType, day).all<{ id: string; content_hash: string; sequence_no: number }>();
  const events = (rows.results || []) as Array<{ id: string; content_hash: string; sequence_no: number }>;
  if (!events.length) return c.json({ success: false, error: 'no events for day/entity' }, 404);
  const leaves = events.map((e) => e.content_hash);
  const root = await merkleRoot(leaves);
  // Sign root with platform key if available
  const pkey = (c.env as any).PLATFORM_ATTEST_KEY as string | undefined;
  const sig = pkey ? await signEd25519(pkey, root) : null;
  const id = genId('mr');
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_audit_merkle_roots
      (id, entity_type, day, event_count, first_sequence_no, last_sequence_no,
       merkle_root, platform_signature)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, entityType, day, events.length, events[0].sequence_no, events[events.length - 1].sequence_no, root, sig).run();
  return c.json({ success: true, data: { id, day, entity_type: entityType, root, event_count: events.length, signed: !!sig } });
});

// Public — list roots
pub.get('/merkle/roots', async (c) => {
  const days = Math.min(90, Math.max(1, Number(c.req.query('days') || 30)));
  const entityType = c.req.query('entity_type');
  const sql = entityType
    ? `SELECT entity_type, day, event_count, merkle_root, platform_signature, attestor_id, attestor_signature
         FROM oe_audit_merkle_roots WHERE entity_type = ? AND day >= date('now', ? || ' days') ORDER BY day DESC`
    : `SELECT entity_type, day, event_count, merkle_root, platform_signature, attestor_id, attestor_signature
         FROM oe_audit_merkle_roots WHERE day >= date('now', ? || ' days') ORDER BY day DESC LIMIT 200`;
  const rows = entityType
    ? await c.env.DB.prepare(sql).bind(entityType, `-${days}`).all()
    : await c.env.DB.prepare(sql).bind(`-${days}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

pub.get('/merkle/roots/:day/:entity_type', async (c) => {
  const day = c.req.param('day');
  const et  = c.req.param('entity_type');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_audit_merkle_roots WHERE day = ? AND entity_type = ?`).bind(day, et).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  return c.json({ success: true, data: row });
});

// Public — proof for a single event
pub.post('/proof/:event_id', async (c) => {
  const evtId = c.req.param('event_id');
  const evt = await c.env.DB.prepare(`SELECT id, entity_type, content_hash, sequence_no, created_at FROM audit_events WHERE id = ?`).bind(evtId).first<any>();
  if (!evt) return c.json({ success: false, error: 'event not found' }, 404);
  const day = String(evt.created_at).slice(0, 10);
  const rows = await c.env.DB.prepare(`
    SELECT id, content_hash, sequence_no FROM audit_events
    WHERE entity_type = ? AND date(created_at) = ?
    ORDER BY sequence_no ASC
  `).bind(evt.entity_type, day).all<{ id: string; content_hash: string; sequence_no: number }>();
  const events = (rows.results || []) as Array<{ id: string; content_hash: string; sequence_no: number }>;
  const idx = events.findIndex((e) => e.id === evtId);
  if (idx < 0) return c.json({ success: false, error: 'event not in chain' }, 500);
  const path = await merklePath(events.map((e) => e.content_hash), idx);
  const root = await merkleRoot(events.map((e) => e.content_hash));
  const rootRow = await c.env.DB.prepare(`SELECT merkle_root, platform_signature FROM oe_audit_merkle_roots WHERE day = ? AND entity_type = ?`).bind(day, evt.entity_type).first<any>();
  const matches = !!rootRow && rootRow.merkle_root === root;
  const reqId = genId('apr');
  await c.env.DB.prepare(`
    INSERT INTO oe_audit_proof_requests (id, event_id, requester_email, requester_role, proof_path, computed_root, matches_root)
    VALUES (?,?,?,?,?,?,?)
  `).bind(reqId, evtId, null, 'public', JSON.stringify(path), root, matches ? 1 : 0).run();
  return c.json({
    success: true,
    data: {
      event: { id: evt.id, entity_type: evt.entity_type, sequence_no: evt.sequence_no, day, content_hash: evt.content_hash },
      proof_path: path,
      computed_root: root,
      published_root: rootRow?.merkle_root || null,
      platform_signature: rootRow?.platform_signature || null,
      matches: matches,
    },
  });
});

// Public — verify a hash + proof against a published root (for clients
// that don't trust our compute path)
pub.post('/verify', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.leaf_hash || !Array.isArray(b.proof_path) || !b.expected_root) {
    return c.json({ success: false, error: 'leaf_hash + proof_path + expected_root required' }, 400);
  }
  const ok = await verifyMerkle(String(b.leaf_hash), b.proof_path, String(b.expected_root));
  let signatureOk: boolean | null = null;
  if (b.platform_signature && b.platform_public_key) {
    signatureOk = await verifyEd25519(String(b.platform_public_key), String(b.expected_root), String(b.platform_signature));
  }
  return c.json({ success: true, data: { matches: ok, signature_valid: signatureOk } });
});

// Attestor registry
admin.get('/attestors', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_audit_attestors ORDER BY added_at DESC`).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/attestors', requireStepUp('audit.attestor_add.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.name || !b.public_key_b64) return c.json({ success: false, error: 'name + public_key_b64 required' }, 400);
  const id = genId('att');
  await c.env.DB.prepare(`
    INSERT INTO oe_audit_attestors (id, name, organisation, public_key_b64, contact_email, scope_entity_types)
    VALUES (?,?,?,?,?,?)
  `).bind(
    id, b.name, b.organisation || null, b.public_key_b64,
    b.contact_email || null,
    b.scope_entity_types ? JSON.stringify(b.scope_entity_types) : null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

// Co-sign a published root with an external attestor's signature
admin.post('/merkle/:root_id/cosign', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rootId = c.req.param('root_id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.attestor_id || !b.signature_b64) return c.json({ success: false, error: 'attestor_id + signature_b64 required' }, 400);
  const att = await c.env.DB.prepare(`SELECT public_key_b64 FROM oe_audit_attestors WHERE id = ? AND active = 1`).bind(b.attestor_id).first<any>();
  if (!att) return c.json({ success: false, error: 'attestor not registered' }, 404);
  const root = await c.env.DB.prepare(`SELECT merkle_root FROM oe_audit_merkle_roots WHERE id = ?`).bind(rootId).first<any>();
  if (!root) return c.json({ success: false, error: 'root not found' }, 404);
  // Verify the signature with the attestor's public key
  const valid = await verifyEd25519(att.public_key_b64, root.merkle_root, b.signature_b64);
  if (!valid) return c.json({ success: false, error: 'signature_invalid' }, 400);
  await c.env.DB.prepare(`
    UPDATE oe_audit_merkle_roots SET attestor_id = ?, attestor_signature = ?, attestor_received_at = datetime('now')
    WHERE id = ?
  `).bind(b.attestor_id, b.signature_b64, rootId).run();
  return c.json({ success: true });
});

export default admin;
