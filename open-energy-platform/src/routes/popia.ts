// ═══════════════════════════════════════════════════════════════════════════
// POPIA — Protection of Personal Information Act 4 of 2013.
// Endpoints: consent ledger, DSAR (Section 23), Right-to-Erasure (Section 24),
// rights reference. Schema lives in migrations/008_platform_admin.sql.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const popia = new Hono<HonoEnv>();
popia.use('*', authMiddleware);

function isPrivilegedRole(role: string) {
  return role === 'admin' || role === 'regulator';
}

// GET /popia/consent — caller's current consent flags.
popia.get('/consent', async (c) => {
  const user = getCurrentUser(c);
  const consent = await c.env.DB.prepare(
    'SELECT marketing, data_sharing, third_party, analytics, updated_at FROM popia_consents WHERE participant_id = ?',
  ).bind(user.id).first() as { marketing: number; data_sharing: number; third_party: number; analytics: number; updated_at: string } | null;
  return c.json({
    success: true,
    data: {
      marketing: consent ? !!consent.marketing : false,
      data_sharing: consent ? !!consent.data_sharing : false,
      third_party: consent ? !!consent.third_party : false,
      analytics: consent ? !!consent.analytics : true,
      updated_at: consent?.updated_at || null,
    },
  });
});

// POST /popia/consent — upsert consent flags with audit trail of prior values.
popia.post('/consent', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { marketing, data_sharing, third_party, analytics } = body as Record<string, boolean | undefined>;
  const now = new Date().toISOString();

  const prior = await c.env.DB.prepare(
    'SELECT marketing, data_sharing, third_party, analytics FROM popia_consents WHERE participant_id = ?',
  ).bind(user.id).first();

  await c.env.DB.prepare(`
    INSERT INTO popia_consents (participant_id, marketing, data_sharing, third_party, analytics, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(participant_id) DO UPDATE SET
      marketing = excluded.marketing,
      data_sharing = excluded.data_sharing,
      third_party = excluded.third_party,
      analytics = excluded.analytics,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    marketing ? 1 : 0,
    data_sharing ? 1 : 0,
    third_party ? 1 : 0,
    analytics === false ? 0 : 1,
    now,
  ).run();

  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, 'popia.consent_updated', 'popia_consents', ?, ?, ?)
  `).bind(
    'al_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    user.id,
    user.id,
    JSON.stringify({ prior, next: { marketing: !!marketing, data_sharing: !!data_sharing, third_party: !!third_party, analytics: analytics !== false } }),
    now,
  ).run();

  return c.json({ success: true, data: { message: 'Consent updated', updated_at: now } });
});

// ---------- DSAR (Section 23 — Data Subject Access Request) ----------

// POST /popia/dsar — request a copy of all data held on the caller. For
// privileged roles, optionally request another participant's data.
popia.post('/dsar', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { scope, target_participant_id } = body as { scope?: string; target_participant_id?: string };
  const subject = target_participant_id && isPrivilegedRole(user.role) ? target_participant_id : user.id;
  const id = 'dsar_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO popia_dsar_requests (id, participant_id, scope, status, requested_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).bind(id, subject, scope || 'all', now).run();
  return c.json({ success: true, data: { id, status: 'pending', subject } }, 201);
});

// GET /popia/dsar — list DSARs. Caller sees their own unless they're admin/regulator.
popia.get('/dsar', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (!isPrivilegedRole(user.role)) {
    filters.push('participant_id = ?');
    bindings.push(user.id);
  }
  if (status) {
    filters.push('status = ?');
    bindings.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`
    SELECT * FROM popia_dsar_requests ${where} ORDER BY requested_at DESC LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

// GET /popia/dsar/:id/export — inline export of caller's data (or any subject
// for privileged roles). Pulls profile + contracts + invoices + notifications.
popia.get('/dsar/:id/export', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const req = await c.env.DB.prepare('SELECT * FROM popia_dsar_requests WHERE id = ?').bind(id).first() as { participant_id: string } | null;
  if (!req) return c.json({ success: false, error: 'DSAR not found' }, 404);
  if (req.participant_id !== user.id && !isPrivilegedRole(user.role)) {
    return c.json({ success: false, error: 'Not authorized for this DSAR' }, 403);
  }
  const subjectId = req.participant_id;
  const [profile, contracts, invoices, notifications, auditLogs, consents] = await Promise.all([
    c.env.DB.prepare('SELECT id, email, name, company_name, role, status, kyc_status, subscription_tier, bbbee_level, tenant_id, created_at FROM participants WHERE id = ?').bind(subjectId).first(),
    c.env.DB.prepare('SELECT * FROM contract_documents WHERE creator_id = ? OR counterparty_id = ? ORDER BY created_at DESC LIMIT 500').bind(subjectId, subjectId).all(),
    c.env.DB.prepare('SELECT * FROM invoices WHERE from_participant_id = ? OR to_participant_id = ? ORDER BY created_at DESC LIMIT 500').bind(subjectId, subjectId).all(),
    c.env.DB.prepare('SELECT id, type, title, body, read, created_at FROM notifications WHERE participant_id = ? ORDER BY created_at DESC LIMIT 500').bind(subjectId).all(),
    c.env.DB.prepare('SELECT id, action, entity_type, entity_id, created_at FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT 500').bind(subjectId).all(),
    c.env.DB.prepare('SELECT marketing, data_sharing, third_party, analytics, updated_at FROM popia_consents WHERE participant_id = ?').bind(subjectId).first(),
  ]);

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE popia_dsar_requests SET status = 'completed', processed_by = ?, processed_at = ? WHERE id = ?
  `).bind(user.id, now, id).run();

  return c.json({
    success: true,
    data: {
      dsar_id: id,
      subject_id: subjectId,
      export_date: now,
      pursuant_to: 'POPIA 4 of 2013 Section 23 (Right of Access)',
      profile: profile || null,
      consents: consents || null,
      contracts: contracts.results || [],
      invoices: invoices.results || [],
      notifications: notifications.results || [],
      audit_logs: auditLogs.results || [],
    },
  });
});

// Legacy shorthand retained for UI compatibility.
popia.get('/data-export', async (c) => {
  const user = getCurrentUser(c);
  const profile = await c.env.DB.prepare('SELECT id, email, name, company_name, role FROM participants WHERE id = ?').bind(user.id).first();
  return c.json({ success: true, data: { participant: profile, export_date: new Date().toISOString(), pursuant_to: 'POPIA 4 of 2013 Section 23' } });
});

// ---------- ERASURE (Section 24 — Right to Deletion) ----------

popia.post('/erasure', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { reason, confirmation } = body as { reason?: string; confirmation?: boolean };
  if (!confirmation) return c.json({ success: false, error: 'Please confirm the erasure request' }, 400);
  const id = 'era_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO popia_erasure_requests (id, participant_id, reason, status, requested_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).bind(id, user.id, reason || 'User requested', now).run();
  return c.json({ success: true, data: { erasure_id: id, status: 'pending', message: 'Erasure request submitted for DPO review under POPIA 4 of 2013 Section 24.' } }, 201);
});

popia.get('/erasure', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (!isPrivilegedRole(user.role)) {
    filters.push('participant_id = ?');
    bindings.push(user.id);
  }
  if (status) {
    filters.push('status = ?');
    bindings.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`
    SELECT * FROM popia_erasure_requests ${where} ORDER BY requested_at DESC LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /popia/erasure/:id/process — admin/DPO marks an erasure request as
// completed or rejected. Actual row-level scrubbing is out of scope for now;
// we anonymise the profile on completion.
popia.post('/erasure/:id/process', async (c) => {
  const user = getCurrentUser(c);
  if (!isPrivilegedRole(user.role)) return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { outcome, resolution_notes } = body as { outcome?: string; resolution_notes?: string };
  if (!['completed', 'rejected'].includes(outcome || '')) {
    return c.json({ success: false, error: 'outcome must be completed or rejected' }, 400);
  }
  const req = await c.env.DB.prepare('SELECT participant_id, status FROM popia_erasure_requests WHERE id = ?').bind(id).first() as { participant_id: string; status: string } | null;
  if (!req) return c.json({ success: false, error: 'Erasure request not found' }, 404);
  if (req.status !== 'pending' && req.status !== 'in_review') {
    return c.json({ success: false, error: `Already ${req.status}` }, 400);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE popia_erasure_requests SET status = ?, processed_by = ?, processed_at = ?, resolution_notes = ? WHERE id = ?
  `).bind(outcome, user.id, now, resolution_notes || null, id).run();
  if (outcome === 'completed') {
    await c.env.DB.prepare(`
      UPDATE participants SET status = 'suspended', name = 'Erased subject', email = ?, company_name = NULL WHERE id = ?
    `).bind(`erased-${id}@popia.internal`, req.participant_id).run();
  }
  return c.json({ success: true });
});

// ---------- REFERENCE ----------

popia.get('/rights', async (c) => {
  return c.json({
    success: true,
    data: {
      statute: 'POPIA 4 of 2013',
      rights: [
        { id: 1, section: 'Section 23', name: 'Right of Access', description: 'Request access to your personal information', endpoint: 'POST /popia/dsar' },
        { id: 2, section: 'Section 24', name: 'Right to Correction / Deletion', description: 'Request correction or deletion of your personal information', endpoint: 'POST /popia/erasure' },
        { id: 3, section: 'Section 11(3)', name: 'Right to Object', description: 'Object to processing of your information' },
        { id: 4, section: 'Section 69', name: 'Right to Opt Out of Direct Marketing', description: 'Manage marketing consent', endpoint: 'POST /popia/consent' },
        { id: 5, section: 'Section 72', name: 'Right to Lodge Complaint', description: 'Lodge a complaint with the Information Regulator' },
      ],
      contact: 'privacy@vantax.co.za',
      response_time_days: 30,
      information_regulator: 'https://inforegulator.org.za',
    },
  });
});

export default popia;
