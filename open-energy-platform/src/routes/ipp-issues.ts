// Wave 132 - IPP Issues Log & Resolution Chain
// PMBOK 7 issue register with URGENT SLA + regulator crossings.
// SIGNATURE: escalate_to_regulator EVERY tier when safety OR regulatory.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  slaHoursFor,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  eventTypeFor,
  statusTsCol,
  timeInStateHours,
  urgencyBand,
  type IssueStatus,
  type IssueAction,
  type IssuePriority,
  type IssueCrossArgs,
} from '../utils/ipp-issues-spec';
import { badEnum } from '../utils/validation';

// Migration 354 CHECKs — reject before D1 500s.
const ISSUE_CATEGORIES = ['safety', 'regulatory', 'technical', 'commercial', 'environmental', 'stakeholder', 'legal', 'financial', 'general'];
const ISSUE_PRIORITIES = ['p1_critical', 'p2_high', 'p3_medium', 'p4_low', 'p5_informational'];

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IssueRow {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: IssuePriority;
  chain_status: IssueStatus;
  raised_by: string | null;
  assigned_to: string | null;
  owner_name: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  is_safety: number;
  is_regulatory: number;
  is_commercial: number;
  is_lender_notifiable: number;
  is_nersa_notifiable: number;
  rfi_ref: string | null;
  change_order_ref: string | null;
  stage_gate_ref: string | null;
  hse_incident_ref: string | null;
  w118_block_ref: string | null;
  bridges_to_rfi_live: number;
  bridges_to_co_live: number;
  bridges_to_sg_live: number;
  bridges_to_hse_live: number;
  bridges_to_w118_live: number;
  resolution_summary: string | null;
  root_cause: string | null;
  preventive_action: string | null;
  lessons_learned: string | null;
  evidence_ref: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_ref: string | null;
  regulator_crossed_at: string | null;
  raised_at: string | null;
  triaged_at: string | null;
  assigned_at: string | null;
  acknowledged_at: string | null;
  in_progress_at: string | null;
  blocked_at: string | null;
  under_review_at: string | null;
  resolved_at: string | null;
  verified_at: string | null;
  evidence_filed_at: string | null;
  closed_at: string | null;
  archived_at: string | null;
  escalated_at: string | null;
  deferred_at: string | null;
  cancelled_at: string | null;
  overdue_flagged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function decorateLiveFields(row: IssueRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  return {
    ...row,
    time_in_state_hours_live: timeInStateHours(stateAt, now),
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    urgency_band_live: urgencyBand(row.priority),
    is_safety_or_regulatory_live: !!(row.is_safety || row.is_regulatory),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-issues ──────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_issues ORDER BY created_at DESC'
  ).all<IssueRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const dashboard = {
    issues: {
      open_count:     data.filter(r => !isHardTerminal(r.chain_status) && r.chain_status !== 'closed').length,
      p1_count:       data.filter(r => r.priority === 'p1_critical' && !isHardTerminal(r.chain_status)).length,
      sla_breached_count: data.filter(r => r.sla_breached).length,
      escalated_count: data.filter(r => r.chain_status === 'escalated').length,
      safety_open:    data.filter(r => r.is_safety && !isHardTerminal(r.chain_status)).length,
      total_count:    data.length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-issues/:id ──────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_issues WHERE id = ?'
  ).bind(c.req.param('id')).first<IssueRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_issue_events WHERE issue_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({ data: { issue: decorateLiveFields(row, new Date()), events: events.results ?? [] } });
});

// ─── POST /api/ipp-issues ─────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    title?: string;
    description?: string;
    category?: string;
    priority?: IssuePriority;
    raised_by?: string;
    assigned_to?: string;
    rfi_ref?: string;
    change_order_ref?: string;
    stage_gate_ref?: string;
    hse_incident_ref?: string;
    is_safety?: number;
    is_regulatory?: number;
    is_commercial?: number;
    is_lender_notifiable?: number;
    is_nersa_notifiable?: number;
    [k: string]: unknown;
  };

  if (!body.project_id || !body.title) {
    return c.json({ error: 'project_id and title required' }, 400);
  }

  const enumErr =
    badEnum('category', body.category, ISSUE_CATEGORIES) ??
    badEnum('priority', body.priority, ISSUE_PRIORITIES);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const priority = (body.priority as IssuePriority) ?? 'p3_medium';
  const now = new Date();
  const slaHrs = slaHoursFor(priority);
  const slaDeadline = slaDeadlineFor(priority, now);
  const id = `iss-${Date.now().toString(36)}`;

  const isSafety   = Number(body.is_safety ?? (body.category === 'safety' ? 1 : 0));
  const isRegulatory = Number(body.is_regulatory ?? (body.category === 'regulatory' ? 1 : 0));

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_issues (
      id, project_id, project_name, title, description, category, priority,
      chain_status, raised_by, assigned_to,
      is_safety, is_regulatory, is_commercial, is_lender_notifiable, is_nersa_notifiable,
      rfi_ref, change_order_ref, stage_gate_ref, hse_incident_ref,
      bridges_to_rfi_live, bridges_to_co_live, bridges_to_sg_live, bridges_to_hse_live,
      sla_target_hours, sla_deadline_at, sla_breached,
      is_reportable, regulator_relevant,
      raised_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      'raised', ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, 0,
      0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.title, body.description ?? null,
    body.category ?? 'general', priority,
    body.raised_by ?? user.id, body.assigned_to ?? null,
    isSafety, isRegulatory,
    Number(body.is_commercial ?? 0), Number(body.is_lender_notifiable ?? 0), Number(body.is_nersa_notifiable ?? 0),
    body.rfi_ref ?? null, body.change_order_ref ?? null, body.stage_gate_ref ?? null, body.hse_incident_ref ?? null,
    body.rfi_ref ? 1 : 0, body.change_order_ref ? 1 : 0, body.stage_gate_ref ? 1 : 0, body.hse_incident_ref ? 1 : 0,
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_issues WHERE id = ?'
  ).bind(id).first<IssueRow>();

  await fireCascade({
    event: 'ipp_issue.raised',
    actor_id: user.id,
    entity_type: 'ipp_issue',
    entity_id: id,
    data: { action: 'raise_issue', priority, category: body.category ?? 'general' },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-issues/:id/:action ────────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    resolution_summary?: string;
    root_cause?: string;
    preventive_action?: string;
    lessons_learned?: string;
    evidence_ref?: string;
    assigned_to?: string;
    reason_code?: string;
    w118_block_ref?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_issues WHERE id = ?'
  ).bind(id).first<IssueRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Issue is in terminal state: ${row.chain_status}` }, 409);
  }

  const issueAction = action as IssueAction;
  const toStatus = nextStatus(row.chain_status, issueAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();
  const crossArgs: IssueCrossArgs = {
    category: row.category,
    is_safety: row.is_safety,
    is_regulatory: row.is_regulatory,
    is_nersa_notifiable: row.is_nersa_notifiable,
    priority: row.priority,
  };

  const regulatorCrossed = crossesIntoRegulator(issueAction, crossArgs);
  const isRep = isReportable(issueAction, crossArgs);

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  // Record state timestamp
  if (toStatus !== row.chain_status) {
    const tsCol = statusTsCol(toStatus);
    updates.push(`${tsCol} = ?`);
    vals.push(now.toISOString());
  }

  if (regulatorCrossed) {
    updates.push('is_reportable = 1', 'regulator_relevant = 1', 'regulator_crossed_at = ?');
    vals.push(now.toISOString());
    if (!row.regulator_ref) {
      const ref = `W132-ISS-${row.category.toUpperCase()}-${now.getFullYear()}-${id.replace('iss-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }
  if (isRep) updates.push('is_reportable = 1');

  if (body.resolution_summary) { updates.push('resolution_summary = ?'); vals.push(body.resolution_summary); }
  if (body.root_cause)         { updates.push('root_cause = ?');         vals.push(body.root_cause); }
  if (body.preventive_action)  { updates.push('preventive_action = ?');  vals.push(body.preventive_action); }
  if (body.lessons_learned)    { updates.push('lessons_learned = ?');     vals.push(body.lessons_learned); }
  if (body.evidence_ref)       { updates.push('evidence_ref = ?');        vals.push(body.evidence_ref); }
  if (body.assigned_to)        { updates.push('assigned_to = ?');         vals.push(body.assigned_to); }
  if (body.w118_block_ref) {
    updates.push('w118_block_ref = ?', 'bridges_to_w118_live = 1');
    vals.push(body.w118_block_ref);
  }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_issues SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `ievt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(issueAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_issue_events
      (id, issue_id, event_type, actor_id, from_status, to_status, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, eventType, user.id,
    row.chain_status, toStatus,
    JSON.stringify({ action: issueAction, priority: row.priority, category: row.category, regulator_crossed: regulatorCrossed, ...(body.reason_code ? { reason_code: body.reason_code } : {}) }),
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType,
    actor_id: user.id,
    entity_type: 'ipp_issue',
    entity_id: id,
    data: {
      action: issueAction,
      from_status: row.chain_status,
      to_status: toStatus,
      priority: row.priority,
      category: row.category,
      regulator_crossed: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_issues WHERE id = ?'
  ).bind(id).first<IssueRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────
export async function ippIssueSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_issues
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('archived','cancelled','closed')
  `).all<IssueRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const crossArgs: IssueCrossArgs = {
        category: row.category,
        is_safety: row.is_safety,
        is_regulatory: row.is_regulatory,
        priority: row.priority,
      };
      const reg = slaBreachCrossesIntoRegulator(row.priority, crossArgs);
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_issues
        SET sla_breached = 1,
            last_sla_breach_at = ?,
            escalation_level = escalation_level + 1,
            ${reg ? 'regulator_relevant = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_issue.sla_breached',
        actor_id: 'cron',
        entity_type: 'ipp_issue',
        entity_id: row.id,
        data: { priority: row.priority, category: row.category, regulator_crossed: reg },
        env,
      });
    }
  }
  return { swept, crossed };
}
