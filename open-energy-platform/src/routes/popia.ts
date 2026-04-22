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

  // Section 19 audit — record who accessed this subject's personal info.
  await c.env.DB.prepare(`
    INSERT INTO popia_pii_access_log (id, actor_id, subject_id, access_type, justification, created_at)
    VALUES (?, ?, ?, 'dsar_export', ?, ?)
  `).bind(
    'pii_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    user.id,
    subjectId,
    `DSAR export ${id}`,
    now,
  ).run();

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
    // Section 24 — full scrub. Anonymise the profile, delete notifications
    // (which may contain PII in title/body), and redact audit-log changes
    // where the subject is the actor. We keep the audit-log row IDs so the
    // audit trail stays intact, but strip personal data from the `changes`
    // column and keep actor_id so referential integrity holds.
    const redactedEmail = `erased-${id}@popia.internal`;
    await c.env.DB.prepare(`
      UPDATE participants
         SET status = 'suspended', name = 'Erased subject', email = ?, company_name = NULL,
             password_hash = NULL
       WHERE id = ?
    `).bind(redactedEmail, req.participant_id).run();
    // Drop auth material stored in separate tables.
    await c.env.DB.prepare('DELETE FROM mfa_totp_secrets WHERE participant_id = ?').bind(req.participant_id).run();
    await c.env.DB.prepare('DELETE FROM notifications WHERE participant_id = ?').bind(req.participant_id).run();
    await c.env.DB.prepare(`
      UPDATE audit_logs SET changes = '{"redacted":"POPIA erasure"}'
       WHERE actor_id = ? AND changes IS NOT NULL AND changes <> ''
    `).bind(req.participant_id).run();
  }
  return c.json({ success: true });
});

// ---------- OBJECTION (Section 11(3) — Right to Object to Processing) ----------

popia.post('/objection', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { processing_purpose, grounds } = body as { processing_purpose?: string; grounds?: string };
  if (!processing_purpose || typeof processing_purpose !== 'string' || processing_purpose.trim().length === 0) {
    return c.json({ success: false, error: 'processing_purpose is required' }, 400);
  }
  const id = 'obj_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO popia_objections (id, participant_id, processing_purpose, grounds, status, requested_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).bind(id, user.id, processing_purpose.trim(), grounds || null, now).run();
  return c.json({ success: true, data: { id, status: 'pending', message: 'Objection submitted for DPO review under POPIA 4 of 2013 Section 11(3).' } }, 201);
});

popia.get('/objection', async (c) => {
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
    SELECT * FROM popia_objections ${where} ORDER BY requested_at DESC LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

popia.post('/objection/:id/process', async (c) => {
  const user = getCurrentUser(c);
  if (!isPrivilegedRole(user.role)) return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { outcome, resolution_notes } = body as { outcome?: string; resolution_notes?: string };
  if (!['upheld', 'rejected', 'withdrawn'].includes(outcome || '')) {
    return c.json({ success: false, error: 'outcome must be upheld, rejected, or withdrawn' }, 400);
  }
  const req = await c.env.DB.prepare('SELECT status FROM popia_objections WHERE id = ?').bind(id).first() as { status: string } | null;
  if (!req) return c.json({ success: false, error: 'Objection not found' }, 404);
  if (req.status !== 'pending') return c.json({ success: false, error: `Already ${req.status}` }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE popia_objections SET status = ?, processed_by = ?, processed_at = ?, resolution_notes = ? WHERE id = ?
  `).bind(outcome, user.id, now, resolution_notes || null, id).run();
  return c.json({ success: true });
});

// ---------- CORRECTION (Section 24 — Right to Correction) ----------

// Subject can request correction of name, company_name, or email on their profile.
// Editing these directly is also possible via /settings; the correction flow
// exists for subjects who want a DPO-reviewed audit trail.
const CORRECTABLE_FIELDS = new Set(['name', 'company_name', 'email']);

popia.post('/correction', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { field_name, requested_value, reason } = body as { field_name?: string; requested_value?: string; reason?: string };
  if (!field_name || !CORRECTABLE_FIELDS.has(field_name)) {
    return c.json({ success: false, error: `field_name must be one of: ${[...CORRECTABLE_FIELDS].join(', ')}` }, 400);
  }
  if (!requested_value || typeof requested_value !== 'string' || requested_value.trim().length === 0) {
    return c.json({ success: false, error: 'requested_value is required' }, 400);
  }
  const profile = await c.env.DB.prepare('SELECT name, company_name, email FROM participants WHERE id = ?').bind(user.id).first() as { name: string; company_name: string | null; email: string } | null;
  const current = profile ? (profile as unknown as Record<string, string | null>)[field_name] ?? null : null;
  const id = 'cor_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO popia_corrections (id, participant_id, field_name, current_value, requested_value, reason, status, requested_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(id, user.id, field_name, current, requested_value.trim(), reason || null, now).run();
  return c.json({ success: true, data: { id, status: 'pending', message: 'Correction request submitted for DPO review under POPIA 4 of 2013 Section 24.' } }, 201);
});

popia.get('/correction', async (c) => {
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
    SELECT * FROM popia_corrections ${where} ORDER BY requested_at DESC LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

popia.post('/correction/:id/process', async (c) => {
  const user = getCurrentUser(c);
  if (!isPrivilegedRole(user.role)) return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { outcome, resolution_notes } = body as { outcome?: string; resolution_notes?: string };
  if (!['applied', 'rejected', 'withdrawn'].includes(outcome || '')) {
    return c.json({ success: false, error: 'outcome must be applied, rejected, or withdrawn' }, 400);
  }
  const req = await c.env.DB.prepare('SELECT participant_id, field_name, requested_value, status FROM popia_corrections WHERE id = ?').bind(id).first() as { participant_id: string; field_name: string; requested_value: string; status: string } | null;
  if (!req) return c.json({ success: false, error: 'Correction request not found' }, 404);
  if (req.status !== 'pending') return c.json({ success: false, error: `Already ${req.status}` }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE popia_corrections SET status = ?, processed_by = ?, processed_at = ?, resolution_notes = ? WHERE id = ?
  `).bind(outcome, user.id, now, resolution_notes || null, id).run();
  if (outcome === 'applied' && CORRECTABLE_FIELDS.has(req.field_name)) {
    // Whitelist-bound column name prevents injection — CORRECTABLE_FIELDS is hardcoded.
    await c.env.DB.prepare(`UPDATE participants SET ${req.field_name} = ? WHERE id = ?`)
      .bind(req.requested_value, req.participant_id).run();
  }
  return c.json({ success: true });
});

// ---------- BREACH REGISTER (Section 22 — Security Compromise Notification) ----------

popia.post('/breach', async (c) => {
  const user = getCurrentUser(c);
  if (!isPrivilegedRole(user.role) && user.role !== 'support') {
    return c.json({ success: false, error: 'Admin, regulator, or support only' }, 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { discovered_at, severity, category, description, affected_subjects_count, affected_data_categories, containment_actions } = body as {
    discovered_at?: string;
    severity?: string;
    category?: string;
    description?: string;
    affected_subjects_count?: number;
    affected_data_categories?: string[];
    containment_actions?: string;
  };
  if (!discovered_at || !category || !description) {
    return c.json({ success: false, error: 'discovered_at, category, and description are required' }, 400);
  }
  const validSeverities = ['low', 'medium', 'high', 'critical'];
  const sev = validSeverities.includes(severity || '') ? severity : 'low';
  const id = 'brch_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO popia_breaches (id, discovered_at, reported_by, severity, category, description, affected_subjects_count, affected_data_categories, containment_actions, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).bind(
    id,
    discovered_at,
    user.id,
    sev!,
    category,
    description,
    typeof affected_subjects_count === 'number' ? affected_subjects_count : 0,
    affected_data_categories ? JSON.stringify(affected_data_categories) : null,
    containment_actions || null,
    now,
  ).run();
  return c.json({ success: true, data: { id, status: 'open', severity: sev } }, 201);
});

popia.get('/breach', async (c) => {
  const user = getCurrentUser(c);
  if (!isPrivilegedRole(user.role) && user.role !== 'support') {
    return c.json({ success: false, error: 'Admin, regulator, or support only' }, 403);
  }
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (status) { filters.push('status = ?'); bindings.push(status); }
  if (severity) { filters.push('severity = ?'); bindings.push(severity); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`
    SELECT * FROM popia_breaches ${where} ORDER BY discovered_at DESC LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

popia.put('/breach/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!isPrivilegedRole(user.role)) {
    return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  }
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM popia_breaches WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: 'Breach not found' }, 404);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const editable = ['severity', 'status', 'containment_actions', 'regulator_notified_at', 'subjects_notified_at', 'root_cause', 'lessons_learned', 'affected_subjects_count'] as const;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const k of editable) {
    if (k in body) {
      const v = (body as Record<string, unknown>)[k];
      sets.push(`${k} = ?`);
      binds.push(v == null ? null : (typeof v === 'number' ? v : String(v)));
    }
  }
  if (sets.length === 0) return c.json({ success: false, error: 'No editable fields provided' }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE popia_breaches SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  // Audit trail.
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, 'popia.breach_updated', 'popia_breaches', ?, ?, ?)
  `).bind(
    'al_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    user.id,
    id,
    JSON.stringify(body),
    new Date().toISOString(),
  ).run();
  return c.json({ success: true });
});

// ---------- PII ACCESS LOG (Section 19 audit) ----------

popia.get('/pii-access', async (c) => {
  const user = getCurrentUser(c);
  const subjectId = c.req.query('subject_id');
  if (!isPrivilegedRole(user.role) && subjectId !== user.id) {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (subjectId) { filters.push('subject_id = ?'); bindings.push(subjectId); }
  else if (!isPrivilegedRole(user.role)) { filters.push('subject_id = ?'); bindings.push(user.id); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`
    SELECT * FROM popia_pii_access_log ${where} ORDER BY created_at DESC LIMIT 500
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ---------- REFERENCE ----------

popia.get('/rights', async (c) => {
  return c.json({
    success: true,
    data: {
      statute: 'POPIA 4 of 2013',
      rights: [
        { id: 1, section: 'Section 23', name: 'Right of Access', description: 'Request access to your personal information', endpoint: 'POST /popia/dsar' },
        { id: 2, section: 'Section 24', name: 'Right to Correction', description: 'Request correction of inaccurate personal information', endpoint: 'POST /popia/correction' },
        { id: 3, section: 'Section 24', name: 'Right to Deletion', description: 'Request deletion of your personal information', endpoint: 'POST /popia/erasure' },
        { id: 4, section: 'Section 11(3)', name: 'Right to Object', description: 'Object to processing of your personal information', endpoint: 'POST /popia/objection' },
        { id: 5, section: 'Section 69', name: 'Right to Opt Out of Direct Marketing', description: 'Manage marketing consent', endpoint: 'POST /popia/consent' },
        { id: 6, section: 'Section 72', name: 'Right to Lodge Complaint', description: 'Lodge a complaint with the Information Regulator' },
      ],
      contact: 'privacy@vantax.co.za',
      response_time_days: 30,
      information_regulator: 'https://inforegulator.org.za',
    },
  });
});

export default popia;
