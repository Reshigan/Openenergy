// ═══════════════════════════════════════════════════════════════════════════
// Participants Routes — CRUD, Search, Export
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { logPiiAccess, inferAccessType } from '../utils/popia-access';
import { fireCascade } from '../utils/cascade';

const participants = new Hono<HonoEnv>();

// All routes require authentication
participants.use('*', authMiddleware);

// GET /api/participants — List with pagination and filtering
participants.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const offset = (page - 1) * pageSize;
  const role = c.req.query('role');
  const status = c.req.query('status');
  const search = c.req.query('search');

  let where = '1=1';
  const bindings: any[] = [];

  if (role) {
    where += ' AND role = ?';
    bindings.push(role);
  }
  if (status) {
    where += ' AND status = ?';
    bindings.push(status);
  }
  if (search) {
    where += ' AND (name LIKE ? OR email LIKE ? OR company_name LIKE ?)';
    const s = `%${search}%`;
    bindings.push(s, s, s);
  }

  const totalResult = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM participants WHERE ${where}`).bind(...bindings).first();
  const total = Number(totalResult?.count ?? 0);

  const rows = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, status, kyc_status, bbbee_level,
           subscription_tier, email_verified, last_login, created_at
    FROM participants WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all();

  return c.json({
    success: true,
    data: rows.results || [],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// GET /api/participants/:id — Get single participant
participants.get('/:id', async (c) => {
  const id = c.req.param('id');
  const requestingUser = getCurrentUser(c);
  if (!['admin', 'support'].includes(requestingUser.role) && requestingUser.id !== id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const participant = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, status, kyc_status, bbbee_level,
           subscription_tier, email_verified, last_login, onboarding_completed, created_at
    FROM participants WHERE id = ?
  `).bind(id).first();

  if (!participant) {
    return c.json({ success: false, error: 'Participant not found' }, 404);
  }

  // POPIA s.19 accountability — record when a privileged actor views another
  // participant's profile. logPiiAccess is a no-op when actor_id === subject_id.
  if (['admin', 'support', 'regulator'].includes(requestingUser.role)) {
    await logPiiAccess(c.env, {
      actor_id: requestingUser.id,
      subject_id: id,
      access_type: inferAccessType(requestingUser.role),
      justification: 'Participant profile view',
    });
  }

  return c.json({ success: true, data: participant });
});

// POST /api/participants/:id/verify — Verify participant KYC
participants.post('/:id/verify', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const id = c.req.param('id');
  const prior = await c.env.DB.prepare('SELECT kyc_status FROM participants WHERE id = ?').bind(id).first<{ kyc_status: string }>();
  await c.env.DB.prepare('UPDATE participants SET kyc_status = ? WHERE id = ?').bind('verified', id).run();
  await fireCascade({
    event: 'participant.kyc_verified',
    actor_id: user.id,
    entity_type: 'participants',
    entity_id: id,
    data: { prior_status: prior?.kyc_status || null, new_status: 'verified' },
    env: c.env,
  });
  return c.json({ success: true, data: { message: 'Participant verified' } });
});

// PUT /api/participants/:id/status — Update participant status
participants.put('/:id/status', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const id = c.req.param('id');
  const { status } = await c.req.json();

  if (!['active', 'suspended', 'rejected'].includes(status)) {
    return c.json({ success: false, error: 'Invalid status' }, 400);
  }

  const prior = await c.env.DB.prepare('SELECT status FROM participants WHERE id = ?').bind(id).first<{ status: string }>();
  await c.env.DB.prepare('UPDATE participants SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), id).run();
  await fireCascade({
    event: 'participant.status_changed',
    actor_id: user.id,
    entity_type: 'participants',
    entity_id: id,
    data: { prior_status: prior?.status || null, new_status: status },
    env: c.env,
  });

  return c.json({ success: true, data: { message: 'Status updated' } });
});

export default participants;