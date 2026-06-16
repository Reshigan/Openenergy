// ═══════════════════════════════════════════════════════════════════════════
// Wave 47 — OEM-Support ITIL Change Enablement chain (RFC lifecycle)
//
// Mounted at /api/change-enablement/chain.
//
// The third member of the ITIL service-management family on the support profile:
//   - W14 support-ticket    : restore service for ONE incident (incident mgmt).
//   - W41 problem-management : root-cause of recurring incidents (problem mgmt).
//   - W47 change-enablement  : authorise, schedule, deploy and review a CHANGE
//                              to a service / configuration item (THIS chain).
// W41 hands off here: its raise_change action raises an RFC that this chain
// governs (provenance source_wave = W41). The unit of work is a proposed CHANGE
// — assess its risk, authorise it through the Change Advisory Board (CAB) or the
// emergency ECAB fast-path, schedule it, implement it in a change window, run a
// post-implementation review (PIR), and close it — OR back it out if it fails.
//
// Forward path:
//   change_requested → assessment → cab_review → approved → scheduled →
//     implementing → implemented → pir → closed
//   emergency fast-path (ECAB): assessment → approved (emergency_approve)
//   rejection branch: cab_review → rejected
//   backout branch: implementing|implemented → rolled_back
//   early cancel: change_requested|assessment|cab_review|approved|scheduled → cancelled
//
// Tiers: emergency_change / normal_change / standard_change. URGENT SLA
// (emergency_change tightest at every active stage).
//
// Write model — SINGLE-PARTY {admin, support} (same as W41). No access split;
// actor_party records the ITIL functional party (change_requester /
// change_authority / implementer) for audit attribution only.
//
// Reportability: change management is internal IT/OT ops; only the highest-impact
// events touching a regulated platform service are notifiable —
//   roll_back         crosses for emergency_change + normal_change,
//   emergency_approve crosses for emergency_change (ECAB governance bypass),
//   close             crosses for emergency_change (post-emergency-change report),
//   sla_breached      crosses for emergency_change.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  SLA_MINUTES,
  type ChangeStatus,
  type ChangeAction,
  type ChangeTier,
} from '../utils/change-enablement-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// SINGLE-PARTY write — the support / change-management function owns the whole
// record. There is no access split (contrast the W37–W40 two-party chains).
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ChangeRow {
  id: string;
  change_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  service_name: string;
  affected_tenant: string | null;
  change_category: string | null;
  change_class: ChangeTier;
  affected_ci_count: number;
  problem_ref: string | null;
  cab_ref: string | null;
  release_ref: string | null;
  rollback_ref: string | null;
  regulator_ref: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  change_summary: string | null;
  assessment_basis: string | null;
  cab_basis: string | null;
  approval_basis: string | null;
  schedule_basis: string | null;
  implementation_basis: string | null;
  verification_basis: string | null;
  rollback_basis: string | null;
  backout_plan: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ChangeStatus;
  change_requested_at: string;
  assessment_at: string | null;
  cab_review_at: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  implementing_at: string | null;
  implemented_at: string | null;
  pir_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  rolled_back_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ChangeEventRow {
  id: string;
  change_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ChangeStatus, keyof ChangeRow | null> = {
  change_requested: null,
  assessment:       'assessment_at',
  cab_review:       'cab_review_at',
  approved:         'approved_at',
  scheduled:        'scheduled_at',
  implementing:     'implementing_at',
  implemented:      'implemented_at',
  pir:              'pir_at',
  closed:           'closed_at',
  rejected:         'rejected_at',
  rolled_back:      'rolled_back_at',
  cancelled:        'cancelled_at',
};

function decorate(row: ChangeRow, now: Date) {
  const tier = row.change_class;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// emergency_approve and approve both land in the 'approved' state, so they share
// the 'change_enablement.approved' event name; the inbox case gates on
// change_class to capture only the ECAB-bypass crossing.
function eventTypeFor(action: ChangeAction): string {
  switch (action) {
    case 'assess':                  return 'change_enablement.assessment';
    case 'submit_to_cab':           return 'change_enablement.cab_review';
    case 'approve':                 return 'change_enablement.approved';
    case 'emergency_approve':       return 'change_enablement.approved';
    case 'reject':                  return 'change_enablement.rejected';
    case 'schedule':                return 'change_enablement.scheduled';
    case 'begin_implementation':    return 'change_enablement.implementing';
    case 'complete_implementation': return 'change_enablement.implemented';
    case 'initiate_pir':            return 'change_enablement.pir';
    case 'close':                   return 'change_enablement.closed';
    case 'roll_back':               return 'change_enablement.rolled_back';
    case 'cancel':                  return 'change_enablement.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const change_class = c.req.query('change_class');
  const status       = c.req.query('status');
  const breached     = c.req.query('breached');
  const service_name = c.req.query('service_name');
  const reportable   = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_change_requests WHERE 1=1';
  const binds: unknown[] = [];
  if (change_class) { sql += ' AND change_class = ?'; binds.push(change_class); }
  if (status)       { sql += ' AND chain_status = ?'; binds.push(status); }
  if (service_name) { sql += ' AND service_name = ?'; binds.push(service_name); }

  sql += ' ORDER BY datetime(change_requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ChangeRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_class[i.change_class] = (by_class[i.change_class] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const closed_count          = items.filter((i) => i.chain_status === 'closed').length;
  const rejected_count        = items.filter((i) => i.chain_status === 'rejected').length;
  const rolled_back_count     = items.filter((i) => i.chain_status === 'rolled_back').length;
  const cancelled_count       = items.filter((i) => i.chain_status === 'cancelled').length;
  const awaiting_cab_count    = items.filter((i) => i.chain_status === 'cab_review').length;
  const in_implementation_count = items.filter((i) => i.chain_status === 'implementing').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable).length;
  const emergency_open        = items.filter((i) => !i.is_terminal && i.change_class === 'emergency_change').length;
  const total_affected_ci     = items.reduce((sum, i) => sum + (i.affected_ci_count || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_class,
      open_count,
      closed_count,
      rejected_count,
      rolled_back_count,
      cancelled_count,
      awaiting_cab_count,
      in_implementation_count,
      breached: breached_count,
      reportable_total,
      emergency_open,
      total_affected_ci,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_change_requests WHERE id = ?').bind(id).first<ChangeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_change_requests_events WHERE change_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ChangeEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AssessBody {
  assessment_basis?: string;
  change_category?: string;
  change_summary?: string;
  affected_ci_count?: number;
  notes?: string;
}
interface CabBody {
  cab_basis?: string;
  cab_ref?: string;
  notes?: string;
}
interface ApproveBody {
  approval_basis?: string;
  cab_ref?: string;
  notes?: string;
}
interface EmergencyApproveBody {
  approval_basis?: string;
  cab_ref?: string;
  regulator_ref?: string;
  notes?: string;
}
interface RejectBody {
  reason_code?: string;
  cab_basis?: string;
  closure_notes?: string;
  notes?: string;
}
interface ScheduleBody {
  schedule_basis?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  backout_plan?: string;
  notes?: string;
}
interface ImplementBody {
  implementation_basis?: string;
  release_ref?: string;
  notes?: string;
}
interface PirBody {
  verification_basis?: string;
  notes?: string;
}
interface CloseBody {
  reason_code?: string;
  verification_basis?: string;
  regulator_ref?: string;
  closure_notes?: string;
  notes?: string;
}
interface RollBackBody {
  reason_code?: string;
  rollback_basis?: string;
  rollback_ref?: string;
  regulator_ref?: string;
  closure_notes?: string;
  notes?: string;
}
interface CancelBody {
  reason_code?: string;
  closure_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ChangeAction,
  bodyHandler?: (row: ChangeRow, body: Record<string, unknown>) => Partial<ChangeRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_change_requests WHERE id = ?').bind(id).first<ChangeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, row.change_class, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.change_class);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  if (crosses) overrides.is_reportable = 1;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_change_requests SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `chg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'change_request',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_change_requests WHERE id = ?').bind(id).first<ChangeRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/assess', async (c) => transition(c, 'assess', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  if (typeof b.change_category === 'string')  out.change_category = b.change_category;
  if (typeof b.change_summary === 'string')   out.change_summary = b.change_summary;
  if (typeof b.affected_ci_count === 'number') out.affected_ci_count = b.affected_ci_count;
  return out;
}));

app.post('/:id/submit-to-cab', async (c) => transition(c, 'submit_to_cab', (_row, body) => {
  const b = body as Partial<CabBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.cab_basis === 'string') out.cab_basis = b.cab_basis;
  if (typeof b.cab_ref === 'string')   out.cab_ref = b.cab_ref;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  if (typeof b.cab_ref === 'string')        out.cab_ref = b.cab_ref;
  return out;
}));

app.post('/:id/emergency-approve', async (c) => transition(c, 'emergency_approve', (_row, body) => {
  const b = body as Partial<EmergencyApproveBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  if (typeof b.cab_ref === 'string')        out.cab_ref = b.cab_ref;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.cab_basis === 'string')      out.cab_basis = b.cab_basis;
  if (typeof b.closure_notes === 'string')  out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/schedule', async (c) => transition(c, 'schedule', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.schedule_basis === 'string')     out.schedule_basis = b.schedule_basis;
  if (typeof b.scheduled_start_at === 'string') out.scheduled_start_at = b.scheduled_start_at;
  if (typeof b.scheduled_end_at === 'string')   out.scheduled_end_at = b.scheduled_end_at;
  if (typeof b.backout_plan === 'string')       out.backout_plan = b.backout_plan;
  return out;
}));

app.post('/:id/begin-implementation', async (c) => transition(c, 'begin_implementation', (_row, body) => {
  const b = body as Partial<ImplementBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.implementation_basis === 'string') out.implementation_basis = b.implementation_basis;
  if (typeof b.release_ref === 'string')          out.release_ref = b.release_ref;
  return out;
}));

app.post('/:id/complete-implementation', async (c) => transition(c, 'complete_implementation', (_row, body) => {
  const b = body as Partial<ImplementBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.implementation_basis === 'string') out.implementation_basis = b.implementation_basis;
  if (typeof b.release_ref === 'string')          out.release_ref = b.release_ref;
  return out;
}));

app.post('/:id/initiate-pir', async (c) => transition(c, 'initiate_pir', (_row, body) => {
  const b = body as Partial<PirBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  if (typeof b.closure_notes === 'string')      out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/roll-back', async (c) => transition(c, 'roll_back', (_row, body) => {
  const b = body as Partial<RollBackBody>;
  const out: Partial<ChangeRow> = { escalation_level: 1 };
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.rollback_basis === 'string')  out.rollback_basis = b.rollback_basis;
  if (typeof b.rollback_ref === 'string')    out.rollback_ref = b.rollback_ref;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  if (typeof b.closure_notes === 'string')   out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<ChangeRow> = {};
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

export async function changeEnablementSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_change_requests
     WHERE chain_status NOT IN ('closed','rejected','rolled_back','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ChangeRow>();

  const rows = rs.results || [];
  // Batch per-row UPDATE + event INSERT atomically; fireCascade stays in a separate
  // post-batch loop (multi-stage fan-out, not a D1 statement).
  const stmts: D1PreparedStatement[] = [];
  const toCascade: ChangeRow[] = [];
  for (const row of rows) {
    stmts.push(env.DB.prepare(
      `UPDATE oe_change_requests
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id));

    const evtId = `chg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    stmts.push(env.DB.prepare(
      'INSERT INTO oe_change_requests_events (id, change_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'change_enablement.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (class ${row.change_class})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ));

    if (slaBreachCrossesIntoRegulator(row.change_class)) toCascade.push(row);
  }

  if (stmts.length) await env.DB.batch(stmts);

  for (const row of toCascade) {
    await fireCascade({
      event: 'change_enablement.sla_breached',
      actor_id: 'system',
      entity_type: 'change_request',
      entity_id: row.id,
      data: {
        ...row,
        crosses_into_regulator: true,
      },
      env,
    });
  }

  return { scanned: rows.length, breached: rows.length };
}

export default app;
