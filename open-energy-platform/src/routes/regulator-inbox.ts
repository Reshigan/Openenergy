// ═══════════════════════════════════════════════════════════════════════════
// Regulator Inbox + Compliance Notices — Wave 5 P6-grade regulator portal.
//
// Mounted at /api/regulator/inbox (flat — avoids the basePath param-collision
// lesson saved in [[feedback_route_mount_collision]]).
//
// The inbox materialises a curated set of regulator-relevant cascade events
// (clearing.disclosure.published, carbon.article6.unfccc_posted, surveillance
// alerts at severity ≥ medium, licence vary/suspend/revoke, enforcement open)
// into a single triage surface with ack lifecycle, SLA timer, and outbound
// compliance-notice tracking.
//
// Endpoints (READ):
//   GET    /                                list inbox rows (filterable)
//   GET    /:id                             one inbox row
//   GET    /escalation-rules                list SLA escalation rules
//   GET    /compliance-notices              list outbound notices
//   GET    /compliance-notices/:id          one notice
//
// Endpoints (WRITE):
//   POST   /:id/ack                         pending  → acknowledged
//   POST   /:id/escalate                    pending  → escalated  (opens case)
//   POST   /:id/dismiss                     pending  → dismissed
//   PUT    /:id/assign                      set assigned_to
//   PUT    /escalation-rules/:code          upsert SLA rule
//   POST   /compliance-notices              issue new outbound notice
//   POST   /compliance-notices/:id/ack      issued  → acknowledged
//   POST   /compliance-notices/:id/satisfy  acked   → satisfied
//   POST   /compliance-notices/:id/withdraw any     → withdrawn
//
// All write paths are regulator-only (plus admin/support for the safety
// valve). Reads are regulator + admin + support + carbon_fund + audit.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const inbox = new Hono<HonoEnv>();
inbox.use('*', authMiddleware);

const READ_ROLES = new Set(['admin', 'support', 'regulator', 'carbon_fund']);
const WRITE_ROLES = new Set(['admin', 'regulator']);
// Licensees who can ack their own compliance notices (i.e. the people
// regulator-side action queues are aimed at).
const LICENSEE_ACK_ROLES = new Set(['ipp_developer', 'offtaker', 'trader', 'carbon_fund', 'lender']);

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function now() {
  return new Date().toISOString();
}

// ── GET / : list inbox rows ────────────────────────────────────────────────
inbox.get('/', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const status = c.req.query('ack_status');
  const event = c.req.query('source_event');
  const severity = c.req.query('severity');
  const assignee = c.req.query('assigned_to');
  const limit = Math.min(Number(c.req.query('limit') || 200), 500);

  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push('ack_status = ?'); params.push(status); }
  if (event) { where.push('source_event = ?'); params.push(event); }
  if (severity) { where.push('severity = ?'); params.push(severity); }
  if (assignee) { where.push('assigned_to = ?'); params.push(assignee); }
  const sql = `
    SELECT id, source_event, source_entity_type, source_entity_id, severity,
           title, body_json, ack_status, assigned_to, ack_by, ack_at,
           ack_note, escalated_at, escalated_to_case, sla_due_at,
           created_at, updated_at
      FROM oe_regulator_inbox
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY datetime(created_at) DESC
     LIMIT ?
  `;
  const rows = await c.env.DB.prepare(sql).bind(...params, limit).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ── GET /escalation-rules ──────────────────────────────────────────────────
inbox.get('/escalation-rules', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT id, rule_code, description, event_pattern, severity_min, sla_minutes,
            on_breach, enabled, created_at, updated_at
       FROM oe_regulator_escalation_rules
       ORDER BY rule_code ASC`,
  ).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ── GET /compliance-notices ────────────────────────────────────────────────
inbox.get('/compliance-notices', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const status = c.req.query('status');
  const licensee = c.req.query('licensee_user_id');
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (licensee) { where.push('licensee_user_id = ?'); params.push(licensee); }
  const sql = `
    SELECT id, licensee_user_id, source_case_id, source_inbox_id, notice_type,
           title, body, remedy_deadline_at, status, acknowledged_at,
           satisfied_at, satisfied_evidence, overdue_flagged_at, issued_by,
           created_at, updated_at
      FROM oe_compliance_notices
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY datetime(created_at) DESC
     LIMIT 500
  `;
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: rows.results || [] });
});

inbox.get('/compliance-notices/:id', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_compliance_notices WHERE id = ?`,
  ).bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  return c.json({ success: true, data: row });
});

// ── GET /:id (must come AFTER /escalation-rules + /compliance-notices) ────
inbox.get('/:id', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_regulator_inbox WHERE id = ?`,
  ).bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  return c.json({ success: true, data: row });
});

// ── POST /:id/ack ──────────────────────────────────────────────────────────
inbox.post('/:id/ack', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note : null;

  const row = await c.env.DB.prepare(
    `SELECT id, ack_status FROM oe_regulator_inbox WHERE id = ?`,
  ).bind(id).first<{ id: string; ack_status: string }>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.ack_status !== 'pending' && row.ack_status !== 'escalated') {
    return c.json({ success: false, error: 'invalid_transition', from: row.ack_status }, 409);
  }

  const ts = now();
  await c.env.DB.prepare(
    `UPDATE oe_regulator_inbox
        SET ack_status = 'acknowledged', ack_by = ?, ack_at = ?, ack_note = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(u.id, ts, note, ts, id).run();

  await fireCascade({
    event: 'regulator.surveillance_alert_resolved',
    actor_id: u.id,
    entity_type: 'oe_regulator_inbox',
    entity_id: id,
    data: { ack_status: 'acknowledged', note },
    env: c.env,
  });

  return c.json({ success: true, data: { id, ack_status: 'acknowledged', ack_at: ts } });
});

// ── POST /:id/escalate ─────────────────────────────────────────────────────
inbox.post('/:id/escalate', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason : 'manual';
  const openCase = body?.open_case === true;

  const row = await c.env.DB.prepare(
    `SELECT id, ack_status, source_event, source_entity_id, severity, title
       FROM oe_regulator_inbox WHERE id = ?`,
  ).bind(id).first<{
    id: string; ack_status: string; source_event: string;
    source_entity_id: string; severity: string; title: string;
  }>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.ack_status !== 'pending') {
    return c.json({ success: false, error: 'invalid_transition', from: row.ack_status }, 409);
  }

  const ts = now();
  let caseId: string | null = null;
  if (openCase) {
    caseId = newId('rec');
    // regulator_enforcement_cases is provided by an earlier migration; we
    // best-effort link the case but do not fail the escalation if the
    // table is unavailable in a particular environment.
    try {
      await c.env.DB.prepare(
        `INSERT INTO regulator_enforcement_cases
           (id, subject_user_id, case_type, severity, opened_by, opened_at,
            status, source_alert_id, summary, created_at, updated_at)
         VALUES (?, ?, 'surveillance_escalation', ?, ?, ?, 'open', ?, ?, ?, ?)`,
      ).bind(
        caseId, '', row.severity, u.id, ts,
        row.source_entity_id, row.title, ts, ts,
      ).run();
    } catch {
      caseId = null;
    }
  }

  await c.env.DB.prepare(
    `UPDATE oe_regulator_inbox
        SET ack_status = 'escalated', ack_by = ?, ack_at = ?, ack_note = ?,
            escalated_at = ?, escalated_to_case = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(u.id, ts, reason, ts, caseId, ts, id).run();

  await fireCascade({
    event: 'regulator.surveillance_escalated',
    actor_id: u.id,
    entity_type: 'oe_regulator_inbox',
    entity_id: id,
    data: { case_id: caseId, reason, severity: row.severity, source_event: row.source_event },
    env: c.env,
  });

  return c.json({ success: true, data: { id, ack_status: 'escalated', case_id: caseId } });
});

// ── POST /:id/dismiss ──────────────────────────────────────────────────────
inbox.post('/:id/dismiss', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note : null;

  const row = await c.env.DB.prepare(
    `SELECT id, ack_status FROM oe_regulator_inbox WHERE id = ?`,
  ).bind(id).first<{ id: string; ack_status: string }>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.ack_status !== 'pending') {
    return c.json({ success: false, error: 'invalid_transition', from: row.ack_status }, 409);
  }

  const ts = now();
  await c.env.DB.prepare(
    `UPDATE oe_regulator_inbox
        SET ack_status = 'dismissed', ack_by = ?, ack_at = ?, ack_note = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(u.id, ts, note, ts, id).run();

  return c.json({ success: true, data: { id, ack_status: 'dismissed' } });
});

// ── PUT /:id/assign ────────────────────────────────────────────────────────
inbox.put('/:id/assign', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const assignee = typeof body?.assigned_to === 'string' ? body.assigned_to : null;
  await c.env.DB.prepare(
    `UPDATE oe_regulator_inbox SET assigned_to = ?, updated_at = ? WHERE id = ?`,
  ).bind(assignee, now(), id).run();
  return c.json({ success: true, data: { id, assigned_to: assignee } });
});

// ── PUT /escalation-rules/:code ────────────────────────────────────────────
inbox.put('/escalation-rules/:code', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const code = c.req.param('code');
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  const description = typeof body.description === 'string' ? body.description : code;
  const eventPattern = typeof body.event_pattern === 'string' ? body.event_pattern : '*';
  const severityMin = typeof body.severity_min === 'string' ? body.severity_min : 'medium';
  const slaMinutes = Number(body.sla_minutes || 60);
  const onBreach = typeof body.on_breach === 'string' ? body.on_breach : 'escalate';
  const enabled = body.enabled === false ? 0 : 1;

  const existing = await c.env.DB.prepare(
    `SELECT id FROM oe_regulator_escalation_rules WHERE rule_code = ?`,
  ).bind(code).first<{ id: string }>();
  const ts = now();
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE oe_regulator_escalation_rules
          SET description = ?, event_pattern = ?, severity_min = ?,
              sla_minutes = ?, on_breach = ?, enabled = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(description, eventPattern, severityMin, slaMinutes, onBreach, enabled, ts, existing.id).run();
    return c.json({ success: true, data: { id: existing.id, rule_code: code } });
  }
  const id = newId('rer');
  await c.env.DB.prepare(
    `INSERT INTO oe_regulator_escalation_rules
       (id, rule_code, description, event_pattern, severity_min, sla_minutes,
        on_breach, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, code, description, eventPattern, severityMin, slaMinutes, onBreach, enabled, ts, ts).run();
  return c.json({ success: true, data: { id, rule_code: code } });
});

// ── POST /compliance-notices : issue ───────────────────────────────────────
inbox.post('/compliance-notices', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  const licensee = typeof body.licensee_user_id === 'string' ? body.licensee_user_id : '';
  const noticeType = typeof body.notice_type === 'string' ? body.notice_type : '';
  const title = typeof body.title === 'string' ? body.title : '';
  const text = typeof body.body === 'string' ? body.body : '';
  if (!licensee || !noticeType || !title || !text) {
    return c.json({ success: false, error: 'missing_fields' }, 400);
  }
  const deadline = typeof body.remedy_deadline_at === 'string' ? body.remedy_deadline_at : null;
  const sourceCase = typeof body.source_case_id === 'string' ? body.source_case_id : null;
  const sourceInbox = typeof body.source_inbox_id === 'string' ? body.source_inbox_id : null;

  const id = newId('cn');
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO oe_compliance_notices
       (id, licensee_user_id, source_case_id, source_inbox_id, notice_type,
        title, body, remedy_deadline_at, status, issued_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)`,
  ).bind(id, licensee, sourceCase, sourceInbox, noticeType, title, text, deadline, u.id, ts, ts).run();

  await fireCascade({
    event: 'regulator.enforcement_event_logged',
    actor_id: u.id,
    entity_type: 'oe_compliance_notices',
    entity_id: id,
    data: { licensee_user_id: licensee, notice_type: noticeType, remedy_deadline_at: deadline },
    env: c.env,
  });

  return c.json({ success: true, data: { id } });
});

inbox.post('/compliance-notices/:id/ack', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role) && !LICENSEE_ACK_ROLES.has(u.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, status FROM oe_compliance_notices WHERE id = ?`,
  ).bind(id).first<{ id: string; status: string }>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.status !== 'issued' && row.status !== 'overdue') {
    return c.json({ success: false, error: 'invalid_transition', from: row.status }, 409);
  }
  const ts = now();
  await c.env.DB.prepare(
    `UPDATE oe_compliance_notices
        SET status = 'acknowledged', acknowledged_at = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(ts, ts, id).run();
  return c.json({ success: true, data: { id, status: 'acknowledged' } });
});

inbox.post('/compliance-notices/:id/satisfy', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const evidence = typeof body?.satisfied_evidence === 'string' ? body.satisfied_evidence : null;

  const row = await c.env.DB.prepare(
    `SELECT id, status FROM oe_compliance_notices WHERE id = ?`,
  ).bind(id).first<{ id: string; status: string }>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.status === 'satisfied' || row.status === 'withdrawn') {
    return c.json({ success: false, error: 'invalid_transition', from: row.status }, 409);
  }
  const ts = now();
  await c.env.DB.prepare(
    `UPDATE oe_compliance_notices
        SET status = 'satisfied', satisfied_at = ?, satisfied_evidence = ?, updated_at = ?
      WHERE id = ?`,
  ).bind(ts, evidence, ts, id).run();
  return c.json({ success: true, data: { id, status: 'satisfied' } });
});

inbox.post('/compliance-notices/:id/withdraw', async (c) => {
  const u = getCurrentUser(c);
  if (!WRITE_ROLES.has(u.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const ts = now();
  await c.env.DB.prepare(
    `UPDATE oe_compliance_notices SET status = 'withdrawn', updated_at = ? WHERE id = ?`,
  ).bind(ts, id).run();
  return c.json({ success: true, data: { id, status: 'withdrawn' } });
});

export default inbox;
