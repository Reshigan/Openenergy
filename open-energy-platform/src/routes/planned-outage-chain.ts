// ═══════════════════════════════════════════════════════════════════════════
// Wave 18 — Planned outage / maintenance submission chain (NERSA Grid Code).
//
// Mounted at /api/grid/planned-outages.
//
// 12-state machine — submitter is the IPP, approver is the Grid Operator.
//   draft → submitted → under_review → approved → notified → in_progress
//     → restoring → restored → closed
//   reject (under_review only) → rejected
//   reschedule (under_review|approved) → rescheduled → submit → submitted (loop)
//   cancel — pre-restoring non-terminals only (operator commit point)
//
// Severity (auto from affected_mw if unset):
//   critical ≥ 500MW | high ≥ 50MW | medium ≥ 1MW | low < 1MW
//
// Per-severity SLA windows enforced by the 15-minute cron sweep.
//
// Regulator inbox crossings:
//   • commence  for critical/high  — NERSA Grid Code §C-1.3 emergency visibility
//   • rejected  for critical/high  — IPP cure window tracking
//   • sla_breached for critical/high
//
// Role split:
//   READ:    admin, grid, ipp, regulator, support, lender
//   IPP-WRITE (submitter): admin, grid, ipp, wind   → submit, reschedule (after fix), cancel
//   GRID-WRITE (approver): admin, grid              → begin_review, approve, reject,
//                                                    notify, commence, begin_restore,
//                                                    mark_restored, close
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  isTerminal,
  isSeverity,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  severityFromMw,
  SLA_MINUTES,
  type OutageStatus,
  type OutageAction,
  type OutageSeverity,
} from '../utils/planned-outage-chain-spec';

const READ_ROLES      = new Set(['admin', 'grid', 'ipp', 'wind', 'regulator', 'support', 'lender']);
const IPP_WRITE_ROLES = new Set(['admin', 'grid', 'ipp', 'wind']);
const GRID_WRITE_ROLES = new Set(['admin', 'grid']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface OutageRow {
  id: string;
  outage_number: string;
  participant_id: string;
  asset_id: string | null;
  asset_name: string | null;
  category: string;
  severity: OutageSeverity;
  chain_status: OutageStatus;
  affected_mw: number | null;
  affected_zone: string | null;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | null;
  reason: string | null;
  contingency_notes: string | null;
  rejection_reason: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  approved_by: string | null;
  approved_at: string | null;
  notified_at: string | null;
  commenced_at: string | null;
  restored_at: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  outage_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function minutesUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.round((new Date(deadline).getTime() - now.getTime()) / 60000);
}

function decorate(row: OutageRow, now: Date) {
  const breach = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline_at, now),
    sla_breached: !isTerminal(row.chain_status) && breach,
  };
}

// ─── List outages (+ filters) ──────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const sv = c.req.query('severity');
  const cat = c.req.query('category');
  const part = c.req.query('participant_id');

  let sql = 'SELECT * FROM oe_planned_outages WHERE 1=1';
  const params: unknown[] = [];
  if (cs)   { sql += ' AND chain_status = ?';   params.push(cs); }
  if (sv)   { sql += ' AND severity = ?';        params.push(sv); }
  if (cat)  { sql += ' AND category = ?';        params.push(cat); }
  if (part) { sql += ' AND participant_id = ?';  params.push(part); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<OutageRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_severity: Record<string, number> = {};
  let breached = 0;
  let critical_open = 0;
  let escalated = 0;
  let in_progress_count = 0;
  let post_mortem_due = 0;
  let total_mw_offline = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_severity[r.severity]   = (by_severity[r.severity]   ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.severity === 'critical' && !isTerminal(r.chain_status)) critical_open++;
    if (r.escalation_level > 0) escalated++;
    if (r.chain_status === 'in_progress' || r.chain_status === 'restoring') {
      in_progress_count++;
      total_mw_offline += r.affected_mw || 0;
    }
    if (r.chain_status === 'restored') post_mortem_due++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_severity,
      breached,
      critical_open,
      escalated,
      in_progress: in_progress_count,
      post_mortem_due,
      total_mw_offline,
    },
  });
});

// ─── Drill: outage + audit chain ───────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM oe_planned_outages WHERE id = ?').bind(id).first<OutageRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_planned_outage_events WHERE outage_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      outage: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: OutageAction,
  eventType: string,
  allowedRoles: Set<string>,
  notes?: string,
  rejectionReason?: string,
): Promise<Response> {
  const user = getCurrentUser(c);
  if (!user || !allowedRoles.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM oe_planned_outages WHERE id = ?').bind(id).first<OutageRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const severity: OutageSeverity = isSeverity(row.severity)
    ? row.severity
    : severityFromMw(row.affected_mw ?? 0);

  let next: OutageStatus;
  try { next = advance(row.chain_status, action); }
  catch (err) { return c.json({ success: false, error: (err as Error).message }, 409); }

  const now = new Date();
  const sla = slaDueAt(next, severity, now);

  const updates: string[] = ['chain_status = ?', 'sla_deadline_at = ?', 'updated_at = ?'];
  const bindings: unknown[] = [next, sla || null, now.toISOString()];

  if (action === 'approve') {
    updates.push('approved_by = ?', 'approved_at = ?');
    bindings.push(user.id, now.toISOString());
  }
  if (action === 'notify')        { updates.push('notified_at = ?');  bindings.push(now.toISOString()); }
  if (action === 'commence')      { updates.push('commenced_at = ?'); bindings.push(now.toISOString()); }
  if (action === 'mark_restored') { updates.push('restored_at = ?');  bindings.push(now.toISOString()); }
  if (action === 'close')         { updates.push('closed_at = ?');    bindings.push(now.toISOString()); }
  if (action === 'reject' && rejectionReason) {
    updates.push('rejection_reason = ?');
    bindings.push(rejectionReason);
  }
  if (notes) {
    updates.push('contingency_notes = COALESCE(contingency_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${notes}`);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_planned_outages SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const evtId = newId('pln_evt');
  await c.env.DB.prepare(
    'INSERT INTO oe_planned_outage_events (id, outage_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, '{}', now.toISOString()).run();

  await fireCascade({
    event: `outage.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'planned_outage',
    entity_id: id,
    data: {
      outage_number: row.outage_number,
      asset_name: row.asset_name,
      severity,
      affected_mw: row.affected_mw,
      affected_zone: row.affected_zone,
      participant_id: row.participant_id,
      rejection_reason: rejectionReason ?? row.rejection_reason ?? null,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, severity),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline_at: sla } });
}

// ─── IPP-side transitions (submit / reschedule / cancel) ───────────────────
app.post('/:id/submit', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'submit', 'submitted', IPP_WRITE_ROLES, body.notes);
});
app.post('/:id/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'cancel', 'cancelled', IPP_WRITE_ROLES, body.notes);
});

// ─── Grid-side transitions (review → approve / reject / notify / commence → close) ─
app.post('/:id/begin-review', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'begin_review', 'review_started', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/approve', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'approve', 'approved', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/reject', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'reject', 'rejected', GRID_WRITE_ROLES, body.notes, body.reason);
});
app.post('/:id/reschedule', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'reschedule', 'rescheduled', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/notify', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'notify', 'notified', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/commence', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'commence', 'commenced', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/begin-restore', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'begin_restore', 'restore_started', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/mark-restored', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'mark_restored', 'restored', GRID_WRITE_ROLES, body.notes);
});
app.post('/:id/close', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'close', 'closed', GRID_WRITE_ROLES, body.notes);
});

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function plannedOutageSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_planned_outages
       WHERE chain_status NOT IN ('rejected', 'closed', 'cancelled')
         AND sla_deadline_at IS NOT NULL
         AND datetime(sla_deadline_at) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<OutageRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    const severity: OutageSeverity = isSeverity(row.severity)
      ? row.severity
      : severityFromMw(row.affected_mw ?? 0);

    await env.DB.prepare(
      'UPDATE oe_planned_outages SET last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const slaMins = SLA_MINUTES[row.chain_status]?.[severity] ?? 0;
    const evtId = newId('pln_evt');
    await env.DB.prepare(
      'INSERT INTO oe_planned_outage_events (id, outage_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'outage.sla_breached',
      actor_id: 'system',
      entity_type: 'planned_outage',
      entity_id: row.id,
      data: {
        outage_number: row.outage_number,
        asset_name: row.asset_name,
        severity,
        affected_mw: row.affected_mw,
        chain_status: row.chain_status,
        sla_window: `${slaMins}m`,
        crosses_to_regulator: slaBreachCrossesIntoRegulator(severity),
      },
      env,
    });
    breached++;
  }

  return { scanned: (rs.results || []).length, breached };
}

export default app;
