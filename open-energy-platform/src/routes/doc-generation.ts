// Paid doc-generation feature (migration 515). A carbon fund / lender / IPP
// subscribes (oe_feature_entitlements), then 1-click generates standard
// submission documents from existing project data and walks each through a
// review → submit → accept/reject lifecycle.
//
// Security: subject_type NEVER reaches SQL as an identifier. It indexes a
// static SUBJECT_TABLE record to pick the table name; subject_id binds to ?.

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { generateDoc, DOC_TYPES, DOC_TYPE_SUBJECT, type DocType } from '../utils/doc-generators';

const FEATURE = 'doc_generation';

// subject_type → real source table. Static allow-list; no request value is ever
// concatenated into SQL. The doc-generators module owns the doc→subject mapping.
const SUBJECT_TABLE: Record<string, string> = {
  ipp_projects: 'ipp_projects',
  carbon_projects: 'carbon_projects',
  mrv_submissions: 'mrv_submissions',
};

// generated → in_review → submitted → accepted | rejected
const NEXT_STATUS: Record<string, string[]> = {
  generated: ['in_review'],
  in_review: ['submitted'],
  submitted: ['accepted', 'rejected'],
  accepted: [],
  rejected: ['in_review'],
};

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

// ── entitlement (subscription) ──
r.get('/entitlement', async (c) => {
  const u = getCurrentUser(c);
  const row = await c.env.DB.prepare(
    `SELECT status, tier, activated_at FROM oe_feature_entitlements
       WHERE participant_id = ? AND feature = ?`,
  ).bind(u.id, FEATURE).first();
  return c.json({ feature: FEATURE, active: !!row && row.status === 'active', entitlement: row ?? null });
});

r.post('/enable', async (c) => {
  const u = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({}));
  const tier = typeof body.tier === 'string' ? body.tier : 'professional';
  await c.env.DB.prepare(
    `INSERT INTO oe_feature_entitlements (participant_id, feature, status, tier)
       VALUES (?, ?, 'active', ?)
     ON CONFLICT(participant_id, feature)
       DO UPDATE SET status = 'active', tier = excluded.tier`,
  ).bind(u.id, FEATURE, tier).run();
  return c.json({ ok: true, feature: FEATURE, status: 'active', tier });
});

async function isEntitled(c: any, ownerId: string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM oe_feature_entitlements WHERE participant_id = ? AND feature = ? AND status = 'active'`,
  ).bind(ownerId, FEATURE).first();
  return !!row;
}

// ── jobs ──
r.get('/jobs', async (c) => {
  const u = getCurrentUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT id, doc_type, registry_standard, subject_type, subject_id, subject_label,
            status, title, created_at, updated_at
       FROM oe_doc_jobs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200`,
  ).bind(u.id).all();
  return c.json({ jobs: results ?? [] });
});

r.get('/jobs/:id', async (c) => {
  const u = getCurrentUser(c);
  const job = await c.env.DB.prepare(
    `SELECT * FROM oe_doc_jobs WHERE id = ? AND owner_id = ?`,
  ).bind(c.req.param('id'), u.id).first();
  if (!job) return c.json({ error: 'not_found' }, 404);
  return c.json({ job });
});

r.post('/generate', async (c) => {
  const u = getCurrentUser(c);
  if (!(await isEntitled(c, u.id))) {
    return c.json({ error: 'subscription_required', feature: FEATURE }, 402);
  }
  const body = await c.req.json().catch(() => ({}));
  const docType = body.doc_type as DocType;
  const subjectId = String(body.subject_id ?? '');
  const registryStandard = body.registry_standard ? String(body.registry_standard) : null;
  if (!DOC_TYPES.includes(docType)) return c.json({ error: 'bad_doc_type' }, 400);
  if (!subjectId) return c.json({ error: 'subject_id_required' }, 400);

  const subjectType = DOC_TYPE_SUBJECT[docType];
  const table = SUBJECT_TABLE[subjectType]; // static — safe to interpolate
  const subject = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE id = ?`,
  ).bind(subjectId).first();
  if (!subject) return c.json({ error: 'subject_not_found' }, 404);

  const out = generateDoc({ docType, registryStandard, subject: subject as Record<string, unknown> });
  const id = `docjob_${docType}_${subjectId}_${Date.now()}`;
  const label = String((subject as any).project_name ?? subjectId);
  await c.env.DB.prepare(
    `INSERT INTO oe_doc_jobs
       (id, owner_id, owner_role, subject_type, subject_id, subject_label,
        doc_type, registry_standard, status, title, content_md, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?)`,
  ).bind(
    id, u.id, u.role, subjectType, subjectId, label,
    docType, registryStandard, out.title, out.contentMd, JSON.stringify(out.meta),
  ).run();
  return c.json({ ok: true, job: { id, status: 'generated', title: out.title, content_md: out.contentMd, meta: out.meta } });
});

r.post('/jobs/:id/transition', async (c) => {
  const u = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({}));
  const to = String(body.to ?? '');
  const job = await c.env.DB.prepare(
    `SELECT status FROM oe_doc_jobs WHERE id = ? AND owner_id = ?`,
  ).bind(c.req.param('id'), u.id).first();
  if (!job) return c.json({ error: 'not_found' }, 404);
  const allowed = NEXT_STATUS[String(job.status)] ?? [];
  if (!allowed.includes(to)) {
    return c.json({ error: 'illegal_transition', from: job.status, to, allowed }, 409);
  }
  await c.env.DB.prepare(
    `UPDATE oe_doc_jobs SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?`,
  ).bind(to, c.req.param('id'), u.id).run();
  return c.json({ ok: true, status: to });
});

export default r;
