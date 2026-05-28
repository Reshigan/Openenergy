// ═══════════════════════════════════════════════════════════════════════════
// Wave 41 — OEM-Support ITIL Problem Management chain
//
// Mounted at /api/problem-management/chain.
//
// Root-cause management of recurring / systemic incidents — the proactive,
// structural complement to the reactive per-ticket W14 incident management
// (and distinct from W15 RMA + W35 vendor-escalation). The unit of work is the
// underlying CAUSE: take a pattern of recurring incidents, find and document
// the root cause, register a Known Error with a workaround, drive a permanent
// fix through change management, deploy it, and verify the incidents stop.
//
// Forward path:
//   problem_logged → categorized → investigating → rca_identified →
//     known_error → fix_proposed → change_raised → fix_deployed →
//     resolution_verified → closed
//   workaround short-circuit: known_error → closed (accept_workaround)
//   escalation branch: investigating|rca_identified|known_error → escalated
//   early cancel: problem_logged|categorized|investigating → cancelled
//
// Tiers: major_problem / significant / minor. URGENT SLA (major tightest).
//
// Write model — SINGLE-PARTY {admin, support}. No access split; actor_party
// records the ITIL functional party (problem_manager / resolver / change_mgmt)
// for audit attribution only.
//
// Reportability: MAJOR PROBLEMS ONLY cross into the regulator inbox
// (escalate + close + sla_breached for major_problem).
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
  type ProblemStatus,
  type ProblemAction,
  type ProblemTier,
} from '../utils/problem-management-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// SINGLE-PARTY write — the support / problem-management function owns the whole
// record. There is no access split (contrast the W37–W40 two-party chains).
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ProblemRow {
  id: string;
  problem_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  service_name: string;
  affected_tenant: string | null;
  problem_category: string | null;
  problem_priority: ProblemTier;
  recurring_incident_count: number;
  known_error_ref: string | null;
  change_request_ref: string | null;
  major_problem_ref: string | null;
  regulator_ref: string | null;
  problem_summary: string | null;
  investigation_basis: string | null;
  rca_basis: string | null;
  known_error_basis: string | null;
  fix_basis: string | null;
  change_basis: string | null;
  verification_basis: string | null;
  workaround: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ProblemStatus;
  problem_logged_at: string;
  categorized_at: string | null;
  investigating_at: string | null;
  rca_identified_at: string | null;
  known_error_at: string | null;
  fix_proposed_at: string | null;
  change_raised_at: string | null;
  fix_deployed_at: string | null;
  resolution_verified_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProblemEventRow {
  id: string;
  problem_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ProblemStatus, keyof ProblemRow | null> = {
  problem_logged:      null,
  categorized:         'categorized_at',
  investigating:       'investigating_at',
  rca_identified:      'rca_identified_at',
  known_error:         'known_error_at',
  fix_proposed:        'fix_proposed_at',
  change_raised:       'change_raised_at',
  fix_deployed:        'fix_deployed_at',
  resolution_verified: 'resolution_verified_at',
  closed:              'closed_at',
  escalated:           'escalated_at',
  cancelled:           'cancelled_at',
};

function decorate(row: ProblemRow, now: Date) {
  const tier = row.problem_priority;
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

function eventTypeFor(action: ProblemAction): string {
  switch (action) {
    case 'categorize':          return 'problem_management.categorized';
    case 'begin_investigation': return 'problem_management.investigating';
    case 'identify_rca':        return 'problem_management.rca_identified';
    case 'log_known_error':     return 'problem_management.known_error';
    case 'propose_fix':         return 'problem_management.fix_proposed';
    case 'accept_workaround':   return 'problem_management.closed';
    case 'raise_change':        return 'problem_management.change_raised';
    case 'deploy_fix':          return 'problem_management.fix_deployed';
    case 'verify_resolution':   return 'problem_management.resolution_verified';
    case 'close':               return 'problem_management.closed';
    case 'escalate':            return 'problem_management.escalated';
    case 'cancel':              return 'problem_management.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const problem_priority = c.req.query('problem_priority');
  const status           = c.req.query('status');
  const breached         = c.req.query('breached');
  const service_name     = c.req.query('service_name');
  const reportable       = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_problem_records WHERE 1=1';
  const binds: unknown[] = [];
  if (problem_priority) { sql += ' AND problem_priority = ?'; binds.push(problem_priority); }
  if (status)           { sql += ' AND chain_status = ?';     binds.push(status); }
  if (service_name)     { sql += ' AND service_name = ?';     binds.push(service_name); }

  sql += ' ORDER BY datetime(problem_logged_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ProblemRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.problem_priority] = (by_tier[i.problem_priority] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const closed_count     = items.filter((i) => i.chain_status === 'closed').length;
  const escalated_count  = items.filter((i) => i.chain_status === 'escalated').length;
  const cancelled_count  = items.filter((i) => i.chain_status === 'cancelled').length;
  const known_error_count = items.filter((i) => i.chain_status === 'known_error').length;
  const in_change_count  = items.filter((i) => i.chain_status === 'change_raised' || i.chain_status === 'fix_deployed').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const major_open       = items.filter((i) => !i.is_terminal && i.problem_priority === 'major_problem').length;
  const total_recurring  = items.reduce((sum, i) => sum + (i.recurring_incident_count || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      closed_count,
      escalated_count,
      cancelled_count,
      known_error_count,
      in_change_count,
      breached: breached_count,
      reportable_total,
      major_open,
      total_recurring,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_problem_records WHERE id = ?').bind(id).first<ProblemRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_problem_records_events WHERE problem_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ProblemEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CategorizeBody {
  problem_category?: string;
  problem_summary?: string;
  notes?: string;
}
interface InvestigationBody {
  investigation_basis?: string;
  notes?: string;
}
interface RcaBody {
  rca_basis?: string;
  notes?: string;
}
interface KnownErrorBody {
  known_error_basis?: string;
  known_error_ref?: string;
  workaround?: string;
  notes?: string;
}
interface FixBody {
  fix_basis?: string;
  notes?: string;
}
interface ChangeBody {
  change_basis?: string;
  change_request_ref?: string;
  notes?: string;
}
interface VerifyBody {
  verification_basis?: string;
  notes?: string;
}
interface CloseBody {
  reason_code?: string;
  closure_notes?: string;
  notes?: string;
}
interface WorkaroundCloseBody {
  reason_code?: string;
  workaround?: string;
  closure_notes?: string;
  notes?: string;
}
interface EscalateBody {
  reason_code?: string;
  major_problem_ref?: string;
  regulator_ref?: string;
  closure_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ProblemAction,
  bodyHandler?: (row: ProblemRow, body: Record<string, unknown>) => Partial<ProblemRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_problem_records WHERE id = ?').bind(id).first<ProblemRow>();
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
  const sla = slaDeadlineFor(to, row.problem_priority, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.problem_priority);
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
    `UPDATE oe_problem_records SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `prob_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'problem_record',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_problem_records WHERE id = ?').bind(id).first<ProblemRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/categorize', async (c) => transition(c, 'categorize', (_row, body) => {
  const b = body as Partial<CategorizeBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.problem_category === 'string') out.problem_category = b.problem_category;
  if (typeof b.problem_summary === 'string')  out.problem_summary = b.problem_summary;
  return out;
}));

app.post('/:id/begin-investigation', async (c) => transition(c, 'begin_investigation', (_row, body) => {
  const b = body as Partial<InvestigationBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.investigation_basis === 'string') out.investigation_basis = b.investigation_basis;
  return out;
}));

app.post('/:id/identify-rca', async (c) => transition(c, 'identify_rca', (_row, body) => {
  const b = body as Partial<RcaBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.rca_basis === 'string') out.rca_basis = b.rca_basis;
  return out;
}));

app.post('/:id/log-known-error', async (c) => transition(c, 'log_known_error', (_row, body) => {
  const b = body as Partial<KnownErrorBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.known_error_basis === 'string') out.known_error_basis = b.known_error_basis;
  if (typeof b.known_error_ref === 'string')   out.known_error_ref = b.known_error_ref;
  if (typeof b.workaround === 'string')        out.workaround = b.workaround;
  return out;
}));

app.post('/:id/propose-fix', async (c) => transition(c, 'propose_fix', (_row, body) => {
  const b = body as Partial<FixBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.fix_basis === 'string') out.fix_basis = b.fix_basis;
  return out;
}));

app.post('/:id/accept-workaround', async (c) => transition(c, 'accept_workaround', (_row, body) => {
  const b = body as Partial<WorkaroundCloseBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.workaround === 'string')     out.workaround = b.workaround;
  if (typeof b.closure_notes === 'string')  out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/raise-change', async (c) => transition(c, 'raise_change', (_row, body) => {
  const b = body as Partial<ChangeBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.change_basis === 'string')       out.change_basis = b.change_basis;
  if (typeof b.change_request_ref === 'string') out.change_request_ref = b.change_request_ref;
  return out;
}));

app.post('/:id/deploy-fix', async (c) => transition(c, 'deploy_fix', (_row, body) => {
  const b = body as Partial<ChangeBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.change_basis === 'string') out.change_basis = b.change_basis;
  return out;
}));

app.post('/:id/verify-resolution', async (c) => transition(c, 'verify_resolution', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<ProblemRow> = { escalation_level: 1 };
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.major_problem_ref === 'string') out.major_problem_ref = b.major_problem_ref;
  if (typeof b.regulator_ref === 'string')     out.regulator_ref = b.regulator_ref;
  if (typeof b.closure_notes === 'string')     out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<ProblemRow> = {};
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

export async function problemManagementSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_problem_records
     WHERE chain_status NOT IN ('closed','escalated','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ProblemRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_problem_records
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `prob_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_problem_records_events (id, problem_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'problem_management.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (priority ${row.problem_priority})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.problem_priority)) {
      await fireCascade({
        event: 'problem_management.sla_breached',
        actor_id: 'system',
        entity_type: 'problem_record',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
