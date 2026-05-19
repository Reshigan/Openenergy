// ════════════════════════════════════════════════════════════════════════
// regulator-l5 — full NERSA-grade regulator workflow.
//
// Split into two routers:
//   admin (auth-protected) — operator views + decisions + audits
//   pub   (public)         — open-data tariff applications + comment submission
//
// Mounted at /api/regulator-l5 (admin) and /api/public/regulator (pub).
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';

export const admin = new Hono<HonoEnv>(); admin.use('*', authMiddleware);
export const pub   = new Hono<HonoEnv>();

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isRegulator = (role: string) => ['admin', 'support', 'regulator'].includes(role);

// ─── Public — tariff applications + comment submission ────────────────
pub.get('/applications', async (c) => {
  const status = c.req.query('status');
  const sql = status
    ? `SELECT id, application_ref, application_type, applicant_id, filing_date,
              comment_period_ends, hearing_scheduled_at, status, requested_revenue_zar, pct_change
         FROM oe_tariff_applications WHERE status = ? ORDER BY filing_date DESC LIMIT 100`
    : `SELECT id, application_ref, application_type, applicant_id, filing_date,
              comment_period_ends, hearing_scheduled_at, status, requested_revenue_zar, pct_change
         FROM oe_tariff_applications ORDER BY filing_date DESC LIMIT 100`;
  const rows = status
    ? await c.env.DB.prepare(sql).bind(status).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

pub.get('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const app = await c.env.DB.prepare(`SELECT * FROM oe_tariff_applications WHERE id = ?`).bind(id).first<any>();
  if (!app) return c.json({ success: false, error: 'not found' }, 404);
  const comments = await c.env.DB.prepare(`
    SELECT id, commenter_name, commenter_org, comment_body, position, submitted_at
    FROM oe_public_comments WHERE application_id = ? AND status = 'published'
    ORDER BY submitted_at ASC LIMIT 500
  `).bind(id).all();
  const mypd = await c.env.DB.prepare(`SELECT * FROM oe_mypd_methodology WHERE application_id = ?`).bind(id).first().catch(() => null);
  const decision = await c.env.DB.prepare(`SELECT * FROM oe_regulator_decisions WHERE application_id = ? AND published_at IS NOT NULL`).bind(id).first().catch(() => null);
  return c.json({
    success: true,
    data: { application: app, comments: comments.results || [], mypd_methodology: mypd, decision },
  });
});

pub.post('/applications/:id/comments', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.commenter_email || !b.comment_body || !b.position) return c.json({ success: false, error: 'commenter_email + comment_body + position required' }, 400);
  if (!['support', 'oppose', 'qualified', 'neutral'].includes(b.position)) return c.json({ success: false, error: 'invalid position' }, 400);
  // Check comment period
  const app = await c.env.DB.prepare(`SELECT comment_period_ends FROM oe_tariff_applications WHERE id = ?`).bind(id).first<any>();
  if (!app) return c.json({ success: false, error: 'not found' }, 404);
  if (new Date(app.comment_period_ends).getTime() < Date.now()) return c.json({ success: false, error: 'comment period closed' }, 410);
  const commentId = genId('cmt');
  await c.env.DB.prepare(`
    INSERT INTO oe_public_comments
      (id, application_id, commenter_email, commenter_name, commenter_org, comment_body, position, ip, attachment_r2_key)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    commentId, id, b.commenter_email, b.commenter_name || null, b.commenter_org || null,
    b.comment_body, b.position,
    c.req.header('cf-connecting-ip') || null,
    b.attachment_r2_key || null,
  ).run();
  return c.json({ success: true, data: { id: commentId, status: 'submitted', message: 'Comment received; pending review for publication' } }, 201);
});

pub.get('/decisions', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, decision_ref, decision_type, application_id, approved_revenue_zar,
           approved_tariff_zar_kwh, effective_from, decided_at, published_at
    FROM oe_regulator_decisions WHERE published_at IS NOT NULL
    ORDER BY decided_at DESC LIMIT 100
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

pub.get('/decisions/:id', async (c) => {
  const id = c.req.param('id');
  const dec = await c.env.DB.prepare(`SELECT * FROM oe_regulator_decisions WHERE id = ? AND published_at IS NOT NULL`).bind(id).first<any>();
  if (!dec) return c.json({ success: false, error: 'not found' }, 404);
  const appeals = await c.env.DB.prepare(`SELECT id, forum, status, filed_at, outcome_at FROM oe_appeals WHERE decision_id = ? ORDER BY filed_at DESC`).bind(id).all();
  return c.json({ success: true, data: { decision: dec, appeals: appeals.results || [] } });
});

pub.get('/state-of-energy', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_state_of_energy_reports WHERE status = 'published' ORDER BY year DESC LIMIT 10`).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Admin — applications + MYPD + hearings + decisions + audits ──────
admin.get('/applications', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_tariff_applications ORDER BY filing_date DESC LIMIT 200`).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/applications', async (c) => {
  void getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.applicant_id || !b.application_type) return c.json({ success: false, error: 'applicant_id + application_type required' }, 400);
  const id = genId('app');
  const ref = b.application_ref || `NERSA/${new Date().getFullYear()}/${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const filing = b.filing_date || new Date().toISOString().slice(0, 10);
  const commentPeriodEnds = b.comment_period_ends || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await c.env.DB.prepare(`
    INSERT INTO oe_tariff_applications
      (id, applicant_id, application_ref, application_type, filing_date, comment_period_ends,
       status, requested_revenue_zar, current_revenue_zar, pct_change, documents_r2_prefix)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.applicant_id, ref, b.application_type, filing, commentPeriodEnds,
    'in_comment_period',
    b.requested_revenue_zar || null,
    b.current_revenue_zar || null,
    b.pct_change || null,
    b.documents_r2_prefix || null,
  ).run();
  return c.json({ success: true, data: { id, application_ref: ref } }, 201);
});

admin.get('/applications/:id/comments', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_public_comments WHERE application_id = ? ORDER BY submitted_at DESC`).bind(id).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/comments/:id/decide', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const decision = String(b.decision || '');
  if (!['published', 'rejected', 'spam'].includes(decision)) return c.json({ success: false, error: 'invalid decision' }, 400);
  await c.env.DB.prepare(`UPDATE oe_public_comments SET status = ?, reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?`).bind(decision, user.id, id).run();
  return c.json({ success: true });
});

// MYPD methodology calculator + recorder
admin.post('/applications/:id/mypd', requireStepUp('regulator.mypd_compute'), async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['rab_zar_m', 'opex_zar_m', 'depreciation_zar_m', 'wacc_pre_tax', 'sales_gwh'];
  for (const f of required) if (b[f] == null) return c.json({ success: false, error: `${f} required` }, 400);
  const rab = Number(b.rab_zar_m); const opex = Number(b.opex_zar_m);
  const dep = Number(b.depreciation_zar_m); const wacc = Number(b.wacc_pre_tax);
  const sales = Number(b.sales_gwh);
  const allowedRevenue = opex + dep + (rab * wacc);
  const allowedTariff = sales > 0 ? (allowedRevenue * 1_000_000) / (sales * 1000) / 1000 : 0;
  const myId = genId('mypd');
  await c.env.DB.prepare(`
    INSERT INTO oe_mypd_methodology
      (id, application_id, rab_zar_m, opex_zar_m, depreciation_zar_m, wacc_pre_tax,
       wacc_post_tax, sales_gwh, allowed_revenue_zar_m, allowed_tariff_zar_kwh,
       rate_of_return_pct, efficiency_factor, computed_by, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    myId, id, rab, opex, dep, wacc,
    b.wacc_post_tax ? Number(b.wacc_post_tax) : null,
    sales, allowedRevenue, allowedTariff,
    b.rate_of_return_pct ? Number(b.rate_of_return_pct) : null,
    b.efficiency_factor ? Number(b.efficiency_factor) : null,
    user.id, b.notes || null,
  ).run();
  return c.json({ success: true, data: { id: myId, allowed_revenue_zar_m: allowedRevenue, allowed_tariff_zar_kwh: allowedTariff } });
});

admin.post('/mypd/:id/approve', requireStepUp('regulator.mypd_approve.high'), async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_mypd_methodology SET approved_by = ?, approved_at = datetime('now') WHERE id = ?`).bind(user.id, id).run();
  return c.json({ success: true });
});

// Hearings
admin.post('/applications/:id/hearings', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.scheduled_at) return c.json({ success: false, error: 'scheduled_at required' }, 400);
  const hId = genId('hr');
  await c.env.DB.prepare(`
    INSERT INTO oe_hearings (id, application_id, scheduled_at, venue, panel_members, agenda)
    VALUES (?,?,?,?,?,?)
  `).bind(
    hId, id, b.scheduled_at, b.venue || null,
    b.panel_members ? JSON.stringify(b.panel_members) : null,
    b.agenda || null,
  ).run();
  await c.env.DB.prepare(`UPDATE oe_tariff_applications SET hearing_scheduled_at = ?, status = 'scheduled_for_hearing' WHERE id = ?`).bind(b.scheduled_at, id).run();
  return c.json({ success: true, data: { id: hId } }, 201);
});

admin.post('/hearings/:id/conclude', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_hearings SET status = 'concluded', transcript_r2_key = ?, recording_r2_key = ?, attendee_count = ?
    WHERE id = ?
  `).bind(b.transcript_r2_key || null, b.recording_r2_key || null, b.attendee_count || null, id).run();
  return c.json({ success: true });
});

// Decisions
admin.post('/applications/:id/decision', requireStepUp('regulator.decision.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.decision_type || !b.reasons_body) return c.json({ success: false, error: 'decision_type + reasons_body required' }, 400);
  if (!['granted', 'refused', 'modified', 'deferred'].includes(b.decision_type)) return c.json({ success: false, error: 'invalid decision_type' }, 400);
  const decId = genId('dec');
  const decRef = `NERSA-DEC/${new Date().getFullYear()}/${Date.now().toString(36).slice(-4).toUpperCase()}`;
  await c.env.DB.prepare(`
    INSERT INTO oe_regulator_decisions
      (id, application_id, decision_ref, decision_type, approved_revenue_zar,
       approved_tariff_zar_kwh, effective_from, effective_to, reasons_body,
       decision_doc_r2_key, decided_by, panel_signatories)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    decId, id, decRef, b.decision_type,
    b.approved_revenue_zar || null, b.approved_tariff_zar_kwh || null,
    b.effective_from || null, b.effective_to || null,
    b.reasons_body, b.decision_doc_r2_key || null,
    user.id,
    b.panel_signatories ? JSON.stringify(b.panel_signatories) : null,
  ).run();
  await c.env.DB.prepare(`UPDATE oe_tariff_applications SET status = 'decided', decision_id = ? WHERE id = ?`).bind(decId, id).run();
  return c.json({ success: true, data: { id: decId, decision_ref: decRef } }, 201);
});

admin.post('/decisions/:id/publish', requireStepUp('regulator.decision_publish.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_regulator_decisions SET published_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// Appeals
admin.get('/appeals', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_appeals ORDER BY filed_at DESC LIMIT 100`).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/appeals', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.decision_id || !b.forum || !b.grounds) return c.json({ success: false, error: 'decision_id + forum + grounds required' }, 400);
  const id = genId('apl');
  await c.env.DB.prepare(`
    INSERT INTO oe_appeals (id, decision_id, appellant_id, forum, grounds, matter_number)
    VALUES (?,?,?,?,?,?)
  `).bind(id, b.decision_id, user.id, b.forum, b.grounds, b.matter_number || null).run();
  await c.env.DB.prepare(`UPDATE oe_tariff_applications SET status = 'on_appeal' WHERE decision_id = ?`).bind(b.decision_id).run();
  return c.json({ success: true, data: { id } }, 201);
});

admin.post('/appeals/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const status = String(b.status || '');
  if (!['dismissed', 'upheld', 'remitted_for_reconsideration', 'settled'].includes(status)) {
    return c.json({ success: false, error: 'invalid status' }, 400);
  }
  await c.env.DB.prepare(`UPDATE oe_appeals SET status = ?, outcome_body = ?, outcome_at = datetime('now') WHERE id = ?`).bind(status, b.outcome_body || null, id).run();
  return c.json({ success: true });
});

// Compliance audits
admin.post('/audits', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.licensee_id || !b.audit_type) return c.json({ success: false, error: 'licensee_id + audit_type required' }, 400);
  const id = genId('aud');
  await c.env.DB.prepare(`
    INSERT INTO oe_compliance_audits (id, licensee_id, audit_type, scope, lead_auditor)
    VALUES (?,?,?,?,?)
  `).bind(id, b.licensee_id, b.audit_type, b.scope || null, user.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

admin.post('/audits/:id/findings', async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['severity', 'category', 'description'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  const fId = genId('fnd');
  const refSeq = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM oe_audit_findings WHERE audit_id = ?`).bind(id).first<any>();
  const ref = `F${String(Number(refSeq?.c || 0) + 1).padStart(3, '0')}`;
  const deadline = b.remediation_deadline || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await c.env.DB.prepare(`
    INSERT INTO oe_audit_findings
      (id, audit_id, finding_ref, severity, category, description, remediation_required, remediation_deadline)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(fId, id, ref, b.severity, b.category, b.description, b.remediation_required || null, deadline).run();
  await c.env.DB.prepare(`UPDATE oe_compliance_audits SET findings_count = findings_count + 1 WHERE id = ?`).bind(id).run();
  return c.json({ success: true, data: { id: fId, ref } }, 201);
});

admin.post('/findings/:id/remediate', async (c) => {
  void getCurrentUser(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_audit_findings SET status = 'remediated', remediated_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// State of Energy report
admin.post('/state-of-energy', requireStepUp('regulator.publish_soe.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const year = Number(b.year || new Date().getFullYear());
  const id = genId('soe');
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_state_of_energy_reports
      (id, year, total_generation_twh, peak_demand_mw, renewable_pct,
       load_shedding_hours, customer_count, active_licences, active_tariffs,
       generated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, year, b.total_generation_twh || null,
    b.peak_demand_mw || null, b.renewable_pct || null,
    b.load_shedding_hours || null, b.customer_count || null,
    b.active_licences || null, b.active_tariffs || null, user.id,
  ).run();
  return c.json({ success: true, data: { id, year } }, 201);
});

admin.post('/state-of-energy/:id/publish', requireStepUp('regulator.publish_soe.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!isRegulator(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_state_of_energy_reports SET status = 'published', published_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

export default admin;
