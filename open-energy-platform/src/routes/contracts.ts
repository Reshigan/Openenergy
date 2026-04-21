// ═══════════════════════════════════════════════════════════════════════════
// Contracts Routes — Create, Read, Update, Delete contract documents
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const contracts = new Hono<HonoEnv>();

// Apply auth middleware to all routes
contracts.use('*', authMiddleware);

// GET /contracts — List contracts for user
contracts.get('/', async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT cd.*,
           creator.name as creator_name,
           counterparty.name as counterparty_name
    FROM contract_documents cd
    LEFT JOIN participants creator ON cd.creator_id = creator.id
    LEFT JOIN participants counterparty ON cd.counterparty_id = counterparty.id
    WHERE (cd.creator_id = ? OR cd.counterparty_id = ?)
    ORDER BY cd.created_at DESC LIMIT ? OFFSET ?
  `;
  const params = [user.id, user.id, pageSize, offset];

  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results || [],
    pagination: {
      page,
      pageSize,
      total: result.results?.length || 0,
      totalPages: 1,
    },
  });
});

// GET /contracts/:id — Get single contract
contracts.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const contract = await c.env.DB.prepare(`
    SELECT cd.*,
           creator.name as creator_name,
           counterparty.name as counterparty_name
    FROM contract_documents cd
    LEFT JOIN participants creator ON cd.creator_id = creator.id
    LEFT JOIN participants counterparty ON cd.counterparty_id = counterparty.id
    WHERE cd.id = ?
    AND (cd.creator_id = ? OR cd.counterparty_id = ?)
  `).bind(id, user.id, user.id).first();

  if (!contract) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }

  return c.json({ success: true, data: contract });
});

// POST /contracts — Create new contract
contracts.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const {
    title, description, phase, contract_type,
    counterparty_id, project_id, commercial_terms
  } = body;

  if (!title || !phase || !contract_type) {
    return c.json({ success: false, error: 'Title, phase, and contract_type are required' }, 400);
  }

  const contractId = 'ct_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const termsJson = commercial_terms ? JSON.stringify(commercial_terms) : null;

  await c.env.DB.prepare(`
    INSERT INTO contract_documents (
      id, title, document_type, phase, creator_id, counterparty_id, project_id, commercial_terms, tenant_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'default', ?, ?)
  `).bind(
    contractId, title, contract_type, phase, user.id, counterparty_id || user.id, project_id || null, termsJson, new Date().toISOString(), new Date().toISOString()
  ).run();

  const contract = await c.env.DB.prepare('SELECT * FROM contract_documents WHERE id = ?').bind(contractId).first();

  return c.json({ success: true, data: contract }, 201);
});

// PUT /contracts/:id — Update contract
contracts.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT creator_id FROM contract_documents WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }
  if (existing.creator_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to update this contract' }, 403);
  }

  const { title, description, phase, contract_type, status, commercial_terms } = body;
  const termsJson = commercial_terms ? JSON.stringify(commercial_terms) : null;

  await c.env.DB.prepare(`
    UPDATE contract_documents SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      phase = COALESCE(?, phase),
      document_type = COALESCE(?, document_type),
      status = COALESCE(?, status),
      commercial_terms = COALESCE(?, commercial_terms),
      updated_at = ?
    WHERE id = ?
  `).bind(title, description, phase, contract_type, status, termsJson, new Date().toISOString(), id).run();

  const contract = await c.env.DB.prepare('SELECT * FROM contract_documents WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: contract });
});

// DELETE /contracts/:id — Delete contract
contracts.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT creator_id FROM contract_documents WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }
  if (existing.creator_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to delete this contract' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM contract_documents WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { message: 'Contract deleted' } });
});

export default contracts;
