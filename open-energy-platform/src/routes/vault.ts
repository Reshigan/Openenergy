// Vault Routes — generic document storage on R2.
// Schema (002_domain.sql): vault_files(id, entity_type, entity_id, file_name,
// r2_key, mime_type, size_bytes, uploaded_by). Original stub used
// owner_id + file_type which do not exist — rewritten against real schema
// with per-entity scoping.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const vault = new Hono<HonoEnv>();
vault.use('*', authMiddleware);

type VaultRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  r2_key: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_by: string;
  created_at: string;
};

function canAccessEntity(role: string) {
  // Admin / regulator see everything; others must be involved with the entity.
  return role === 'admin' || role === 'regulator';
}

async function isPartyToEntity(db: any, userId: string, entityType: string, entityId: string) {
  // Conservative visibility: creator/counterparty on a contract, owner on an
  // ipp_project, payer/payee on an invoice, etc. Fall back to uploader match
  // when the entity type is unknown.
  switch (entityType) {
    case 'contract_documents': {
      const row = await db.prepare('SELECT creator_id, counterparty_id FROM contract_documents WHERE id = ?').bind(entityId).first();
      return row && (row.creator_id === userId || row.counterparty_id === userId);
    }
    case 'ipp_projects': {
      const row = await db.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(entityId).first();
      return row && row.developer_id === userId;
    }
    case 'invoices': {
      const row = await db.prepare('SELECT from_participant_id, to_participant_id FROM invoices WHERE id = ?').bind(entityId).first();
      return row && (row.from_participant_id === userId || row.to_participant_id === userId);
    }
    default: {
      const row = await db.prepare('SELECT uploaded_by FROM vault_files WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC LIMIT 1').bind(entityType, entityId).first();
      return row && row.uploaded_by === userId;
    }
  }
}

// GET /vault/files — list files by (entity_type, entity_id). Also supports
// ?mine=1 to list everything the caller uploaded.
vault.get('/files', async (c) => {
  const user = getCurrentUser(c);
  const entityType = c.req.query('entity_type');
  const entityId = c.req.query('entity_id');
  const mine = c.req.query('mine');

  if (entityType && entityId) {
    if (!canAccessEntity(user.role)) {
      const ok = await isPartyToEntity(c.env.DB, user.id, entityType, entityId);
      if (!ok) return c.json({ success: false, error: 'Not authorized for this entity' }, 403);
    }
    const rows = await c.env.DB.prepare(`
      SELECT vf.*, p.name AS uploaded_by_name
      FROM vault_files vf LEFT JOIN participants p ON vf.uploaded_by = p.id
      WHERE vf.entity_type = ? AND vf.entity_id = ?
      ORDER BY vf.created_at DESC
    `).bind(entityType, entityId).all();
    return c.json({ success: true, data: rows.results || [] });
  }

  if (mine === '1' || canAccessEntity(user.role) === false) {
    const rows = await c.env.DB.prepare(`
      SELECT * FROM vault_files WHERE uploaded_by = ? ORDER BY created_at DESC LIMIT 200
    `).bind(user.id).all();
    return c.json({ success: true, data: rows.results || [] });
  }

  const rows = await c.env.DB.prepare(`
    SELECT vf.*, p.name AS uploaded_by_name
    FROM vault_files vf LEFT JOIN participants p ON vf.uploaded_by = p.id
    ORDER BY vf.created_at DESC LIMIT 200
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /vault/upload — records a file that has already been uploaded directly
// to R2 (e.g. via a pre-signed URL or the contracts PDF generator).
vault.post('/upload', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { entity_type, entity_id, file_name, r2_key, mime_type, size_bytes } = body as Record<string, any>;
  if (!entity_type || !entity_id || !file_name || !r2_key) {
    return c.json({ success: false, error: 'entity_type, entity_id, file_name, r2_key are required' }, 400);
  }
  if (!canAccessEntity(user.role)) {
    const ok = await isPartyToEntity(c.env.DB, user.id, entity_type, entity_id);
    if (!ok) return c.json({ success: false, error: 'Not authorized for this entity' }, 403);
  }
  const id = 'vf_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  await c.env.DB.prepare(`
    INSERT INTO vault_files (id, entity_type, entity_id, file_name, r2_key, mime_type, size_bytes, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, entity_type, entity_id, file_name, r2_key, mime_type || null, size_bytes != null ? Number(size_bytes) : null, user.id, new Date().toISOString()).run();
  return c.json({ success: true, data: { id, r2_key } }, 201);
});

// POST /vault/upload-direct — accepts multipart/form-data with the file
// inline. Stores the bytes in R2, then writes a vault_files row. Used by
// the SPA's FileUploadModal — no presigned-URL choreography needed. 20 MB
// cap (configurable via VAULT_MAX_BYTES env var) so the Worker doesn't
// hold a huge buffer in memory.
vault.post('/upload-direct', async (c) => {
  const user = getCurrentUser(c);
  const formData = await c.req.formData().catch(() => null);
  if (!formData) return c.json({ success: false, error: 'multipart body expected' }, 400);
  const file = formData.get('file') as unknown as
    | (Blob & { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> })
    | null;
  const entity_type = formData.get('entity_type');
  const entity_id = formData.get('entity_id');
  if (!file || typeof file === 'string' || typeof (file as any).arrayBuffer !== 'function') {
    return c.json({ success: false, error: 'file field is required' }, 400);
  }
  if (typeof entity_type !== 'string' || typeof entity_id !== 'string') {
    return c.json({ success: false, error: 'entity_type + entity_id required' }, 400);
  }
  const maxBytes = Number((c.env as any).VAULT_MAX_BYTES || 20 * 1024 * 1024);
  if (file.size > maxBytes) {
    return c.json({ success: false, error: `File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` }, 413);
  }
  if (!canAccessEntity(user.role)) {
    const ok = await isPartyToEntity(c.env.DB, user.id, entity_type, entity_id);
    if (!ok) return c.json({ success: false, error: 'Not authorized for this entity' }, 403);
  }
  const id = 'vf_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const safeName = file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 200);
  const r2_key = `vault/${entity_type}/${entity_id}/${id}/${safeName}`;
  try {
    await c.env.R2.put(r2_key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
  } catch (e) {
    return c.json({ success: false, error: 'R2 write failed', data: { detail: (e as Error).message } }, 502);
  }
  await c.env.DB.prepare(`
    INSERT INTO vault_files (id, entity_type, entity_id, file_name, r2_key, mime_type, size_bytes, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, entity_type, entity_id, safeName, r2_key,
          file.type || null, file.size, user.id, new Date().toISOString()).run();
  return c.json({ success: true, data: { id, r2_key, file_name: safeName, size_bytes: file.size } }, 201);
});

// GET /vault/files/:id/download — proxies R2 bytes when the binding is
// present. Returns a redirect/stub URL in local dev.
vault.get('/files/:id/download', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM vault_files WHERE id = ?').bind(id).first() as VaultRow | null;
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (!canAccessEntity(user.role)) {
    const ok = await isPartyToEntity(c.env.DB, user.id, row.entity_type, row.entity_id);
    if (!ok) return c.json({ success: false, error: 'Not authorized for this file' }, 403);
  }
  if (c.env.R2 && typeof c.env.R2.get === 'function') {
    const obj = await c.env.R2.get(row.r2_key);
    if (!obj) return c.json({ success: false, error: 'Missing R2 object' }, 404);
    return new Response(obj.body, {
      headers: {
        'content-type': row.mime_type || 'application/octet-stream',
        'content-disposition': `attachment; filename="${row.file_name.replace(/["\\]/g, '_')}"`,
      },
    });
  }
  return c.json({ success: true, data: { r2_key: row.r2_key, file_name: row.file_name } });
});

vault.delete('/files/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM vault_files WHERE id = ?').bind(id).first() as VaultRow | null;
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (row.uploaded_by !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Only the uploader or an admin may delete this file' }, 403);
  }
  if (c.env.R2 && typeof c.env.R2.delete === 'function') {
    try { await c.env.R2.delete(row.r2_key); } catch { /* best-effort */ }
  }
  await c.env.DB.prepare('DELETE FROM vault_files WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default vault;
