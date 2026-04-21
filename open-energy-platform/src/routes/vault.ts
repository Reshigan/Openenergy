// Vault Routes - R2 Storage
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const vault = new Hono<HonoEnv>();
vault.use('*', authMiddleware);

// GET /vault/files
vault.get('/files', async (c) => {
  const user = getCurrentUser(c);
  const files = await c.env.DB.prepare('SELECT * FROM vault_files WHERE owner_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return c.json({ success: true, data: files.results || [] });
});

// POST /vault/upload
vault.post('/upload', async (c) => {
  const user = getCurrentUser(c);
  const { file_name, file_type, r2_key, size_bytes } = await c.req.json();
  const id = 'vf_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO vault_files (id, owner_id, file_name, file_type, r2_key, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, file_name, file_type, r2_key, size_bytes, new Date().toISOString()).run();
  return c.json({ success: true, data: { id, r2_key } }, 201);
});

// DELETE /vault/files/:id
vault.delete('/files/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const file = await c.env.DB.prepare('SELECT * FROM vault_files WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
  if (!file) return c.json({ success: false, error: 'Not found' }, 404);
  await c.env.DB.prepare('DELETE FROM vault_files WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default vault;
