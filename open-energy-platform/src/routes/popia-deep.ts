// ════════════════════════════════════════════════════════════════════════
// popia-deep — Information Officer dashboard + SAR tracking + retention
// policy management. Goes beyond the user-facing self-service in 060
// to the operator-side compliance surface.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function adminOnly(role: string) { return ['admin', 'support'].includes(role); }

// ─── Info Officer dashboard ─────────────────────────────────────────────
r.get('/dashboard', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  // SAR pipeline
  const sars = await c.env.DB.prepare(`
    SELECT status, COUNT(*) AS c,
           SUM(CASE WHEN due_at < datetime('now') AND status NOT IN ('fulfilled','rejected') THEN 1 ELSE 0 END) AS overdue
    FROM oe_popia_sar_requests
    WHERE received_at >= date('now','-180 days')
    GROUP BY status
  `).all<any>();
  // Erasure pipeline
  const erasures = await c.env.DB.prepare(`SELECT status, COUNT(*) AS c FROM oe_deletion_requests GROUP BY status`).all<any>();
  // Exports
  const exports_ = await c.env.DB.prepare(`SELECT status, COUNT(*) AS c FROM oe_data_export_requests WHERE requested_at >= date('now','-30 days') GROUP BY status`).all<any>();
  // PII access events (last 30d)
  const piiAccess = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM pii_access_log WHERE accessed_at >= date('now','-30 days')`).first<any>().catch(() => ({ c: 0 }));
  // Consent withdrawals (last 30d)
  const withdrawals = await c.env.DB.prepare(`
    SELECT COUNT(*) AS c FROM oe_consent_records
    WHERE consent_type LIKE 'cookies_%' AND accepted = 0 AND created_at >= date('now','-30 days')
  `).first<any>().catch(() => ({ c: 0 }));
  // Retention violations — find rows older than policy
  const policies = await c.env.DB.prepare(`SELECT * FROM oe_popia_retention_policies`).all<any>();

  return c.json({
    success: true,
    data: {
      generated_at: new Date().toISOString(),
      sar_pipeline: sars.results || [],
      erasure_pipeline: erasures.results || [],
      export_pipeline: exports_.results || [],
      pii_access_30d: Number(piiAccess?.c || 0),
      consent_withdrawals_30d: Number(withdrawals?.c || 0),
      retention_policies: policies.results || [],
    },
  });
});

// ─── SAR requests ───────────────────────────────────────────────────────
r.get('/sar', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const status = c.req.query('status');
  const sql = status
    ? `SELECT * FROM oe_popia_sar_requests WHERE status = ? ORDER BY received_at DESC LIMIT 200`
    : `SELECT * FROM oe_popia_sar_requests ORDER BY received_at DESC LIMIT 200`;
  const rows = status
    ? await c.env.DB.prepare(sql).bind(status).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/sar', async (c) => {
  // Public-ish — any auth'd user can file a SAR for themselves (or admin
  // logs one on behalf of an external requester via subject_email)
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.subject_email || !b.request_type) return c.json({ success: false, error: 'subject_email + request_type required' }, 400);
  if (!['access', 'rectification', 'erasure', 'portability', 'objection', 'restriction'].includes(b.request_type)) {
    return c.json({ success: false, error: 'invalid request_type' }, 400);
  }
  const id = genId('sar');
  const dueAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO oe_popia_sar_requests
      (id, subject_email, subject_name, participant_id, request_type, request_body, due_at, ip)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, b.subject_email, b.subject_name || null,
    b.participant_id || user.id || null,
    b.request_type, b.request_body || null, dueAt,
    c.req.header('cf-connecting-ip') || null,
  ).run();
  await fireCascade({
    event: 'popia.sar_received',
    actor_id: user.id,
    entity_type: 'popia_sar',
    entity_id: id,
    data: {
      id, subject_email: b.subject_email, subject_name: b.subject_name || null,
      participant_id: b.participant_id || user.id || null,
      request_type: b.request_type, due_at: dueAt,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, due_at: dueAt } }, 201);
});

r.post('/sar/:id/assign', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_popia_sar_requests SET assigned_to = ?, status = 'in_progress', acknowledged_at = COALESCE(acknowledged_at, datetime('now')) WHERE id = ?
  `).bind(b.assigned_to || user.id, id).run();
  await fireCascade({
    event: 'popia.sar_assigned',
    actor_id: user.id,
    entity_type: 'popia_sar',
    entity_id: String(id),
    data: { id, assigned_to: b.assigned_to || user.id, assigned_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/sar/:id/respond', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const outcome = String(b.outcome || '');
  if (!['fulfilled', 'rejected'].includes(outcome)) return c.json({ success: false, error: 'outcome must be fulfilled|rejected' }, 400);
  await c.env.DB.prepare(`
    UPDATE oe_popia_sar_requests
    SET status = ?, responded_at = datetime('now'),
        response_summary = ?, rejection_reason = ?
    WHERE id = ?
  `).bind(outcome, b.response_summary || null, outcome === 'rejected' ? (b.rejection_reason || 'declined') : null, id).run();
  await fireCascade({
    event: 'popia.sar_responded',
    actor_id: user.id,
    entity_type: 'popia_sar',
    entity_id: String(id),
    data: {
      id, outcome,
      response_summary: b.response_summary || null,
      rejection_reason: outcome === 'rejected' ? (b.rejection_reason || 'declined') : null,
      responded_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Retention policies ─────────────────────────────────────────────────
r.get('/retention', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_popia_retention_policies ORDER BY data_type`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.put('/retention/:data_type', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'forbidden' }, 403);
  const dataType = c.req.param('data_type');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.retention_days || !b.lawful_basis) return c.json({ success: false, error: 'retention_days + lawful_basis required' }, 400);
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_popia_retention_policies
      (data_type, retention_days, lawful_basis, legal_reference, notes, updated_at)
    VALUES (?,?,?,?,?,datetime('now'))
  `).bind(dataType, Number(b.retention_days), b.lawful_basis, b.legal_reference || null, b.notes || null).run();
  await fireCascade({
    event: 'popia.retention_policy_updated',
    actor_id: user.id,
    entity_type: 'popia_retention_policy',
    entity_id: String(dataType),
    data: {
      data_type: dataType,
      retention_days: Number(b.retention_days),
      lawful_basis: b.lawful_basis,
      legal_reference: b.legal_reference || null,
      updated_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── PAIA manual generator ──────────────────────────────────────────────
// Section 14 of PAIA requires a published manual describing data held +
// the contact for requests. Generate from current state.
r.get('/paia-manual', async (c) => {
  const policies = await c.env.DB.prepare(`SELECT * FROM oe_popia_retention_policies ORDER BY data_type`).all<any>();
  return c.json({
    success: true,
    data: {
      title: 'PAIA Section 14 Manual — GONXT Technology (Pty) Ltd',
      generated_at: new Date().toISOString(),
      information_officer: {
        name: 'GONXT Information Officer',
        email: 'privacy@gonxt.tech',
      },
      records_held: (policies.results || []).map((p: any) => ({
        record_type: p.data_type,
        purpose: p.notes || 'Platform operation',
        retention_days: p.retention_days,
        lawful_basis: p.lawful_basis,
        legal_reference: p.legal_reference,
      })),
      sar_process: {
        request_url: 'https://oe.vantax.co.za/legal/popia',
        statutory_deadline_days: 30,
        fee: 'No fee for first request per calendar year',
      },
    },
  });
});

// ─── PII access log (POPIA s.14(2)(c)) ─────────────────────────────────
r.get('/pii-access', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const days = Math.min(90, Math.max(1, Number(c.req.query('days') || 30)));
  const rows = await c.env.DB.prepare(`
    SELECT * FROM pii_access_log WHERE accessed_at >= date('now', ? || ' days') ORDER BY accessed_at DESC LIMIT 500
  `).bind(`-${days}`).all().catch(() => ({ results: [] }));
  return c.json({ success: true, data: rows.results || [] });
});

export default r;
