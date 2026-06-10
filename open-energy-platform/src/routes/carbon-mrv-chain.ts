// ═══════════════════════════════════════════════════════════════════════════
// Wave 11 — Carbon Article 6 / UNFCCC MRV verification-chain routes.
//
// Flat-mounted at /api/carbon/mrv-chain.
//
// Deepens the L2 mrv_submissions / mrv_verifications schema (migration 026)
// into a regulator-grade UNFCCC verification chain (migration 112):
//
//   draft → submitted → doe_assigned → doe_review →
//     doe_opinion_{positive|qualified|adverse|disclaimer}
//   → cra_review → cra_approved | cra_rejected
//   → issuance_authorized → issued
//
// Per-state SLAs: DOE 90d (CDM rules), CRA 30d (Article 6.4 supervisory body).
// SLA breaches + adverse opinions + CRA rejections cross into regulator inbox.
//
// Roles (per [[feedback_role_ux_depth]]):
//   • READ_ROLES: admin/support/carbon/regulator/ipp
//   • PARTICIPANT writes: ipp + carbon developers can submit / submit_cra / withdraw
//   • REGULATOR writes: regulator (DOE assign, review, opinions, CRA decisions, authorize, issue)
//   • ADMIN writes: admin / support (any transition)
//
// Every state-changing mutation fires the matching carbon.mrv_* cascade.
// Daily 05:00 UTC cron sweep (wired in src/index.ts) breaches SLAs.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  daysUntilDeadline,
  isSlaBreached,
  isTerminal,
  crossesIntoRegulator,
  STATUS_LABEL,
  type ChainStatus,
  type DoeOpinion,
} from '../utils/mrv-chain-spec';

const REGULATOR_WRITE   = new Set(['admin', 'support', 'regulator']);
const PARTICIPANT_WRITE = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'carbon', 'carbon_fund']);
const READ_ROLES        = new Set(['admin', 'support', 'carbon', 'carbon_fund', 'regulator', 'ipp', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface SubmissionRow {
  id: string;
  project_id: string;
  reporting_period_start: string;
  reporting_period_end: string;
  claimed_reductions_tco2e: number;
  monitoring_methodology: string | null;
  status: string;
  chain_status: ChainStatus;
  submitted_at: string | null;
  doe_assignee_id: string | null;
  doe_assigned_at: string | null;
  doe_due_at: string | null;
  doe_opinion: string | null;
  doe_opinion_at: string | null;
  cra_submitted_at: string | null;
  cra_due_at: string | null;
  cra_decision: string | null;
  cra_decision_at: string | null;
  cra_decision_by: string | null;
  cra_rejection_reason: string | null;
  issuance_authorized_at: string | null;
  issuance_authorized_by: string | null;
  last_sla_breach_at: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  submission_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  notes: string | null;
  evidence_r2_key: string | null;
  body_json: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function deadlineFor(chainStatus: ChainStatus, row: SubmissionRow): string | null {
  if (chainStatus === 'doe_assigned' || chainStatus === 'doe_review') return row.doe_due_at;
  if (chainStatus === 'cra_review') return row.cra_due_at;
  return null;
}

function decorate(row: SubmissionRow, now: Date) {
  const cs = row.chain_status;
  const deadline = deadlineFor(cs, row);
  return {
    ...row,
    chain_status_label: STATUS_LABEL[cs] ?? cs,
    is_terminal: isTerminal(cs),
    sla_deadline_at: deadline,
    days_until_sla: daysUntilDeadline(deadline, now),
    sla_breached: isSlaBreached(deadline, now),
  };
}

// ─── List submissions (+ filter by chain_status, project_id) ────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const proj = c.req.query('project_id');
  let sql = 'SELECT * FROM mrv_submissions WHERE 1=1';
  const params: unknown[] = [];

  if (cs)   { sql += ' AND chain_status = ?'; params.push(cs); }
  if (proj) { sql += ' AND project_id = ?'; params.push(proj); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<SubmissionRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  let breached = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    if (r.sla_breached) breached++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      breached,
    },
  });
});

// ─── Drill-down: submission + event history ─────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const sub = await c.env.DB
    .prepare('SELECT * FROM mrv_submissions WHERE id = ?')
    .bind(id)
    .first<SubmissionRow>();
  if (!sub) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB
    .prepare('SELECT * FROM oe_mrv_chain_events WHERE submission_id = ? ORDER BY datetime(created_at) DESC LIMIT 200')
    .bind(id)
    .all<EventRow>();

  return c.json({
    success: true,
    data: {
      submission: decorate(sub, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Helpers: load + record + fire cascade for a transition ─────────────────
async function loadSubmission(env: HonoEnv['Bindings'], id: string): Promise<SubmissionRow | null> {
  const row = await env.DB
    .prepare('SELECT * FROM mrv_submissions WHERE id = ?')
    .bind(id)
    .first<SubmissionRow>();
  return row ?? null;
}

async function parseBody<T extends object>(req: { json: <U>() => Promise<U> }): Promise<Partial<T>> {
  return req.json<Partial<T>>().catch(() => ({} as Partial<T>));
}

interface RecordOpts {
  env: HonoEnv['Bindings'];
  submissionId: string;
  fromStatus: ChainStatus | null;
  toStatus: ChainStatus;
  eventType: string;
  actorId: string;
  notes?: string | null;
  bodyJson?: Record<string, unknown> | null;
  cascadeEvent: string;
  cascadeData: Record<string, unknown>;
}

async function recordTransition(opts: RecordOpts): Promise<void> {
  const id = newId('mrv_evt');
  await opts.env.DB.prepare(`
    INSERT INTO oe_mrv_chain_events (
      id, submission_id, event_type, from_status, to_status,
      actor_id, notes, body_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, opts.submissionId, opts.eventType, opts.fromStatus, opts.toStatus,
    opts.actorId, opts.notes ?? null,
    opts.bodyJson ? JSON.stringify(opts.bodyJson) : null,
  ).run();

  await fireCascade({
    event: opts.cascadeEvent as never,
    actor_id: opts.actorId,
    entity_type: 'mrv_submissions',
    entity_id: opts.submissionId,
    data: opts.cascadeData,
    env: opts.env as never,
  });
}

// ─── POST /:id/submit (draft → submitted) ───────────────────────────────────
app.post('/:id/submit', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'submit' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`UPDATE mrv_submissions SET chain_status = ?, status = 'submitted', submitted_at = ? WHERE id = ?`)
    .bind(r.next, nowIso, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'submitted', actorId: user.id,
    cascadeEvent: 'carbon.mrv_chain_submitted',
    cascadeData: { project_id: row.project_id, claimed_reductions_tco2e: row.claimed_reductions_tco2e },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── POST /:id/assign-doe { doe_assignee_id } ──────────────────────────────
app.post('/:id/assign-doe', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ doe_assignee_id?: string; notes?: string }>(c.req);
  const assignee = body.doe_assignee_id || user.id;

  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'assign_doe' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const now = new Date();
  const nowIso = now.toISOString();
  const due = slaDueAt(r.next, now);

  await c.env.DB.prepare(`
    UPDATE mrv_submissions
       SET chain_status = ?, doe_assignee_id = ?, doe_assigned_at = ?, doe_due_at = ?
     WHERE id = ?
  `).bind(r.next, assignee, nowIso, due, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'doe_assigned', actorId: user.id, notes: body.notes ?? null,
    bodyJson: { doe_assignee_id: assignee, doe_due_at: due },
    cascadeEvent: 'carbon.mrv_doe_assigned',
    cascadeData: { project_id: row.project_id, doe_assignee_id: assignee, doe_due_at: due },
  });

  return c.json({ success: true, data: { id, chain_status: r.next, doe_due_at: due } });
});

// ─── POST /:id/start-review ────────────────────────────────────────────────
app.post('/:id/start-review', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'start_review' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  await c.env.DB.prepare(`UPDATE mrv_submissions SET chain_status = ? WHERE id = ?`)
    .bind(r.next, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'doe_review_started', actorId: user.id, notes: body.notes ?? null,
    cascadeEvent: 'carbon.mrv_doe_review_started',
    cascadeData: { project_id: row.project_id },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── POST /:id/record-opinion { doe_opinion, notes? } ──────────────────────
app.post('/:id/record-opinion', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ doe_opinion?: DoeOpinion; notes?: string; evidence_r2_key?: string }>(c.req);
  if (!body.doe_opinion) return c.json({ success: false, error: 'doe_opinion required' }, 400);

  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'record_opinion', doeOpinion: body.doe_opinion });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE mrv_submissions
       SET chain_status = ?, doe_opinion = ?, doe_opinion_at = ?,
           status = CASE WHEN ? IN ('doe_opinion_adverse','doe_opinion_disclaimer') THEN 'rejected' ELSE status END
     WHERE id = ?
  `).bind(r.next, body.doe_opinion, nowIso, r.next, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'doe_opinion_recorded', actorId: user.id, notes: body.notes ?? null,
    bodyJson: { doe_opinion: body.doe_opinion, evidence_r2_key: body.evidence_r2_key ?? null },
    cascadeEvent: 'carbon.mrv_doe_opinion_recorded',
    cascadeData: {
      project_id: row.project_id,
      doe_opinion: body.doe_opinion,
      crossed_into_regulator: crossesIntoRegulator(row.chain_status, r.next),
    },
  });

  return c.json({ success: true, data: { id, chain_status: r.next, doe_opinion: body.doe_opinion } });
});

// ─── POST /:id/submit-cra ──────────────────────────────────────────────────
app.post('/:id/submit-cra', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'submit_cra' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const now = new Date();
  const nowIso = now.toISOString();
  const craDue = slaDueAt(r.next, now);

  await c.env.DB.prepare(`
    UPDATE mrv_submissions
       SET chain_status = ?, cra_submitted_at = ?, cra_due_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, craDue, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'cra_submitted', actorId: user.id, notes: body.notes ?? null,
    bodyJson: { cra_due_at: craDue },
    cascadeEvent: 'carbon.mrv_cra_submitted',
    cascadeData: { project_id: row.project_id, cra_due_at: craDue },
  });

  return c.json({ success: true, data: { id, chain_status: r.next, cra_due_at: craDue } });
});

// ─── POST /:id/approve-cra ─────────────────────────────────────────────────
app.post('/:id/approve-cra', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'cra_approve' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE mrv_submissions
       SET chain_status = ?, cra_decision = 'approved', cra_decision_at = ?, cra_decision_by = ?,
           status = 'verified'
     WHERE id = ?
  `).bind(r.next, nowIso, user.id, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'cra_approved', actorId: user.id, notes: body.notes ?? null,
    cascadeEvent: 'carbon.mrv_cra_approved',
    cascadeData: { project_id: row.project_id },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── POST /:id/reject-cra { rejection_reason } ─────────────────────────────
app.post('/:id/reject-cra', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ rejection_reason?: string; notes?: string }>(c.req);
  if (!body.rejection_reason) return c.json({ success: false, error: 'rejection_reason required' }, 400);

  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'cra_reject' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE mrv_submissions
       SET chain_status = ?, cra_decision = 'rejected', cra_decision_at = ?, cra_decision_by = ?,
           cra_rejection_reason = ?, status = 'rejected'
     WHERE id = ?
  `).bind(r.next, nowIso, user.id, body.rejection_reason, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'cra_rejected', actorId: user.id, notes: body.notes ?? null,
    bodyJson: { rejection_reason: body.rejection_reason },
    cascadeEvent: 'carbon.mrv_cra_rejected',
    cascadeData: { project_id: row.project_id, rejection_reason: body.rejection_reason },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── POST /:id/authorize-issuance ──────────────────────────────────────────
app.post('/:id/authorize-issuance', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'authorize' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE mrv_submissions
       SET chain_status = ?, issuance_authorized_at = ?, issuance_authorized_by = ?
     WHERE id = ?
  `).bind(r.next, nowIso, user.id, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'issuance_authorized', actorId: user.id, notes: body.notes ?? null,
    cascadeEvent: 'carbon.mrv_issuance_authorized',
    cascadeData: { project_id: row.project_id, claimed_reductions_tco2e: row.claimed_reductions_tco2e },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── POST /:id/issue ───────────────────────────────────────────────────────
app.post('/:id/issue', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !REGULATOR_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'issue' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  await c.env.DB.prepare(`UPDATE mrv_submissions SET chain_status = ?, status = 'issued' WHERE id = ?`)
    .bind(r.next, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'issuance_authorized', actorId: user.id, notes: body.notes ?? null,
    cascadeEvent: 'carbon.mrv_issued',
    cascadeData: { project_id: row.project_id, claimed_reductions_tco2e: row.claimed_reductions_tco2e },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── POST /:id/withdraw ────────────────────────────────────────────────────
app.post('/:id/withdraw', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !PARTICIPANT_WRITE.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadSubmission(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const r = advance({ current: row.chain_status, action: 'withdraw' });
  if (!r.ok) return c.json({ success: false, error: r.error ?? 'Invalid transition' }, 409);

  await c.env.DB.prepare(`UPDATE mrv_submissions SET chain_status = ? WHERE id = ?`)
    .bind(r.next, id).run();

  await recordTransition({
    env: c.env, submissionId: id, fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'withdrawn', actorId: user.id, notes: body.notes ?? null,
    cascadeEvent: 'carbon.mrv_withdrawn',
    cascadeData: { project_id: row.project_id },
  });

  return c.json({ success: true, data: { id, chain_status: r.next } });
});

// ─── Daily cron: SLA breach sweep across non-terminal submissions ──────────
export async function mrvChainSlaSweep(env: HonoEnv['Bindings']): Promise<{
  evaluated: number; breached: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  let breached = 0;

  // Only sweep states that carry an SLA AND have not breached on this cycle.
  const rs = await env.DB.prepare(`
    SELECT * FROM mrv_submissions
     WHERE chain_status IN ('doe_assigned','doe_review','cra_review')
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?, '-1 day'))
  `).bind(nowIso).all<SubmissionRow>();
  const rows = rs.results || [];

  for (const r of rows) {
    const deadline = deadlineFor(r.chain_status, r);
    if (!isSlaBreached(deadline, now)) continue;

    await env.DB.prepare(`UPDATE mrv_submissions SET last_sla_breach_at = ? WHERE id = ?`)
      .bind(nowIso, r.id).run();

    const evId = newId('mrv_evt');
    await env.DB.prepare(`
      INSERT INTO oe_mrv_chain_events (
        id, submission_id, event_type, from_status, to_status, actor_id, notes, body_json
      ) VALUES (?, ?, 'sla_breached', ?, ?, 'system', ?, ?)
    `).bind(
      evId, r.id, r.chain_status, r.chain_status,
      `SLA breached in ${r.chain_status} (deadline ${deadline ?? '?'})`,
      JSON.stringify({ deadline, days_overdue: -(daysUntilDeadline(deadline, now) ?? 0) }),
    ).run();

    await fireCascade({
      event: 'carbon.mrv_sla_breached' as never,
      actor_id: 'system',
      entity_type: 'mrv_submissions',
      entity_id: r.id,
      data: {
        project_id: r.project_id,
        chain_status: r.chain_status,
        deadline,
        days_overdue: -(daysUntilDeadline(deadline, now) ?? 0),
      },
      env: env as never,
    });
    breached++;
  }

  return { evaluated: rows.length, breached };
}

export default app;
