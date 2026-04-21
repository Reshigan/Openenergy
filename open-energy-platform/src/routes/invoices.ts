// Invoices Routes - Create, Read, Update, Delete invoices

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const invoices = new Hono<HonoEnv>();

// Apply auth middleware to all routes
invoices.use('*', authMiddleware);

// GET /invoices - List invoices for user
invoices.get('/', async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const offset = (page - 1) * pageSize;

  const query = `SELECT i.*, fp.name as from_name, tp.name as to_name FROM invoices i LEFT JOIN participants fp ON i.from_participant_id = fp.id LEFT JOIN participants tp ON i.to_participant_id = tp.id WHERE (i.from_participant_id = ? OR i.to_participant_id = ?) ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
  const params = [user.id, user.id, pageSize, offset];
  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results || [],
    pagination: { page, pageSize, total: result.results?.length || 0, totalPages: 1 },
  });
});

// GET /invoices/:id - Get single invoice
invoices.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const invoice = await c.env.DB.prepare(`SELECT i.*, fp.name as from_name, tp.name as to_name FROM invoices i LEFT JOIN participants fp ON i.from_participant_id = fp.id LEFT JOIN participants tp ON i.to_participant_id = tp.id WHERE i.id = ? AND (i.from_participant_id = ? OR i.to_participant_id = ?)`).bind(id, user.id, user.id).first();

  if (!invoice) {
    return c.json({ success: false, error: 'Invoice not found' }, 404);
  }
  return c.json({ success: true, data: invoice });
});

// POST /invoices - Create new invoice
invoices.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const { invoice_number, invoice_type, period_start, period_end, line_items, subtotal, vat_rate, total_amount, currency, due_date, to_participant_id, project_id, notes } = body;

  // Validation
  if (!invoice_number) {
    return c.json({ success: false, error: 'invoice_number is required' }, 400);
  }
  if (!invoice_type) {
    return c.json({ success: false, error: 'invoice_type is required' }, 400);
  }
  if (!period_start) {
    return c.json({ success: false, error: 'period_start is required' }, 400);
  }
  if (!period_end) {
    return c.json({ success: false, error: 'period_end is required' }, 400);
  }
  if (subtotal === undefined || subtotal === null) {
    return c.json({ success: false, error: 'subtotal is required' }, 400);
  }
  if (total_amount === undefined || total_amount === null) {
    return c.json({ success: false, error: 'total_amount is required' }, 400);
  }

  const invoiceId = 'inv_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const lineItemsJson = typeof line_items === 'string' ? line_items : (Array.isArray(line_items) ? JSON.stringify(line_items) : '[]');
  const vatAmount = subtotal * (vat_rate || 0.15);
  const effectiveDueDate = due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  await c.env.DB.prepare(`INSERT INTO invoices (id, invoice_number, invoice_type, from_participant_id, to_participant_id, project_id, period_start, period_end, line_items, subtotal, vat_rate, vat_amount, total_amount, currency, due_date, status, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'default', ?, ?)`).bind(
    invoiceId, invoice_number, invoice_type, user.id, to_participant_id || user.id, project_id || null,
    period_start, period_end, lineItemsJson, subtotal, vat_rate || 0.15, vatAmount, total_amount,
    currency || 'ZAR', effectiveDueDate, new Date().toISOString(), new Date().toISOString()
  ).run();

  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(invoiceId).first();
  return c.json({ success: true, data: invoice }, 201);
});

// PUT /invoices/:id - Update invoice
invoices.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT from_participant_id FROM invoices WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Invoice not found' }, 404);
  }
  if (existing.from_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }

  const { status, total_amount, due_date } = body;

  await c.env.DB.prepare('UPDATE invoices SET status = COALESCE(?, status), total_amount = COALESCE(?, total_amount), due_date = COALESCE(?, due_date), updated_at = ? WHERE id = ?').bind(status, total_amount, due_date, new Date().toISOString(), id).run();

  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: invoice });
});

// DELETE /invoices/:id - Delete invoice
invoices.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT from_participant_id FROM invoices WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Invoice not found' }, 404);
  }
  if (existing.from_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { message: 'Invoice deleted' } });
});

export default invoices;
