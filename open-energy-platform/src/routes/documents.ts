// ════════════════════════════════════════════════════════════════════════
// documents — template library + envelope-based signing workflow.
//
// Templates: parameterised markdown with {{handlebar}} placeholders +
// declared variables and required signatory roles. Versioned per
// template_key — publish creates a new version, deprecate retires.
//
// Envelopes: a concrete instance — variables filled, body snapshotted,
// signatory list materialised. Each signatory countersigns through the
// existing /api/polish/signatures endpoint with document_hash = the
// envelope's snapshot hash. Once every required signatory has signed,
// the envelope flips to 'completed'.
//
// Mounted at /api/documents.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isAdmin = (role: string) => ['admin', 'support'].includes(role);

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v != null ? String(v) : `{{${key}}}`;
  });
}

// ─── Templates ─────────────────────────────────────────────────────────
r.get('/templates', async (c) => {
  const status = c.req.query('status') || 'published';
  const category = c.req.query('category');
  const sql = `SELECT id, template_key, display_name, category, jurisdiction, version,
                      status, variables_json, required_signatories_json, created_at, published_at
               FROM oe_document_templates
               WHERE status = ? ${category ? 'AND category = ?' : ''}
               ORDER BY display_name`;
  const binds = category ? [status, category] : [status];
  const rows = await c.env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: rows.results || [] });
});

r.get('/templates/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_document_templates WHERE id = ?`
  ).bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  return c.json({ success: true, data: row });
});

r.post('/templates', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['template_key', 'display_name', 'category', 'body_md', 'variables', 'required_signatories'];
  for (const f of required) if (b[f] == null) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('tpl');
  await c.env.DB.prepare(`
    INSERT INTO oe_document_templates
      (id, template_key, display_name, category, body_md, variables_json,
       required_signatories_json, jurisdiction, version, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.template_key, b.display_name, b.category, b.body_md,
    JSON.stringify(b.variables), JSON.stringify(b.required_signatories),
    b.jurisdiction || null, Number(b.version || 1), 'draft', user.id,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/templates/:id/publish', requireStepUp('documents.template_publish.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  await c.env.DB.prepare(
    `UPDATE oe_document_templates
     SET status = 'published', published_at = datetime('now')
     WHERE id = ? AND status = 'draft'`
  ).bind(c.req.param('id')).run();
  return c.json({ success: true });
});

r.post('/templates/:id/deprecate', async (c) => {
  const user = getCurrentUser(c);
  if (!isAdmin(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  await c.env.DB.prepare(
    `UPDATE oe_document_templates
     SET status = 'deprecated', deprecated_at = datetime('now')
     WHERE id = ? AND status = 'published'`
  ).bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ─── Envelopes ─────────────────────────────────────────────────────────
r.get('/envelopes', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  // Show envelopes I raised OR I'm a signatory on. Admins see all.
  const sql = isAdmin(user.role)
    ? `SELECT * FROM oe_document_envelopes ${status ? 'WHERE status = ?' : ''} ORDER BY raised_at DESC LIMIT 200`
    : `SELECT * FROM oe_document_envelopes
         WHERE (raised_by = ? OR signatories_json LIKE ?) ${status ? 'AND status = ?' : ''}
         ORDER BY raised_at DESC LIMIT 200`;
  const binds = isAdmin(user.role)
    ? (status ? [status] : [])
    : (status ? [user.id, `%${user.id}%`, status] : [user.id, `%${user.id}%`]);
  const rows = await c.env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: rows.results || [] });
});

r.get('/envelopes/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_document_envelopes WHERE id = ?`
  ).bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  // Also pull signatures so far
  const sigs = await c.env.DB.prepare(
    `SELECT id, signer_id, signer_role, signed_at, signing_method
     FROM oe_signatures WHERE document_kind = 'envelope' AND document_ref = ?
     ORDER BY signed_at`
  ).bind(c.req.param('id')).all().catch(() => ({ results: [] as any[] }));
  return c.json({ success: true, data: { envelope: row, signatures: sigs.results || [] } });
});

r.post('/envelopes', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.template_id || !b.variables || !Array.isArray(b.signatories)) {
    return c.json({ success: false, error: 'template_id + variables + signatories required' }, 400);
  }
  const tpl = await c.env.DB.prepare(
    `SELECT body_md, variables_json, required_signatories_json, status
     FROM oe_document_templates WHERE id = ?`
  ).bind(b.template_id).first<any>();
  if (!tpl) return c.json({ success: false, error: 'template not found' }, 404);
  if (tpl.status !== 'published') return c.json({ success: false, error: 'template not published' }, 400);
  // Validate variable coverage
  const declared = JSON.parse(tpl.variables_json) as Array<{ key: string }>;
  for (const v of declared) {
    if (!Object.prototype.hasOwnProperty.call(b.variables, v.key)) {
      return c.json({ success: false, error: `missing variable: ${v.key}` }, 400);
    }
  }
  // Validate signatory count vs template
  const requiredSigs = JSON.parse(tpl.required_signatories_json) as Array<{ role: string; label: string }>;
  if (b.signatories.length !== requiredSigs.length) {
    return c.json({ success: false, error: `expected ${requiredSigs.length} signatories, got ${b.signatories.length}` }, 400);
  }
  const body = renderTemplate(String(tpl.body_md), b.variables);
  const hash = await sha256Hex(body);
  const id = genId('env');
  const sigs = requiredSigs.map((req, i) => ({
    label: req.label,
    role: req.role,
    participant_id: String(b.signatories[i]?.participant_id || ''),
    signed_at: null as string | null,
  }));
  await c.env.DB.prepare(`
    INSERT INTO oe_document_envelopes
      (id, template_id, raised_by, variables_json, body_rendered, signatories_json,
       document_hash, status)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, b.template_id, user.id,
    JSON.stringify(b.variables), body, JSON.stringify(sigs),
    hash, 'sent',
  ).run();
  return c.json({ success: true, data: { id, document_hash: hash } }, 201);
});

// Mark a signatory complete — typically called by the SPA right after it
// POSTs the matching signature to /api/polish/signatures. Idempotent.
r.post('/envelopes/:id/mark-signed', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const env = await c.env.DB.prepare(`SELECT * FROM oe_document_envelopes WHERE id = ?`).bind(id).first<any>();
  if (!env) return c.json({ success: false, error: 'not found' }, 404);
  if (['completed', 'cancelled', 'expired'].includes(env.status)) return c.json({ success: false, error: `envelope ${env.status}` }, 400);
  const sigs = JSON.parse(env.signatories_json) as Array<{ participant_id: string; signed_at: string | null }>;
  const idx = sigs.findIndex((s) => s.participant_id === user.id);
  if (idx < 0) return c.json({ success: false, error: 'not a signatory' }, 403);
  if (!sigs[idx].signed_at) sigs[idx].signed_at = new Date().toISOString();
  const allSigned = sigs.every((s) => !!s.signed_at);
  await c.env.DB.prepare(`
    UPDATE oe_document_envelopes
    SET signatories_json = ?,
        status = ?,
        completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE completed_at END
    WHERE id = ?
  `).bind(JSON.stringify(sigs), allSigned ? 'completed' : 'in_progress', allSigned ? 1 : 0, id).run();
  return c.json({ success: true, data: { all_signed: allSigned } });
});

r.post('/envelopes/:id/cancel', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const env = await c.env.DB.prepare(`SELECT raised_by, status FROM oe_document_envelopes WHERE id = ?`).bind(id).first<any>();
  if (!env) return c.json({ success: false, error: 'not found' }, 404);
  if (env.raised_by !== user.id && !isAdmin(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  if (['completed', 'cancelled', 'expired'].includes(env.status)) return c.json({ success: false, error: `envelope ${env.status}` }, 400);
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_document_envelopes
    SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?
    WHERE id = ?
  `).bind(b.reason || null, id).run();
  return c.json({ success: true });
});

export default r;
