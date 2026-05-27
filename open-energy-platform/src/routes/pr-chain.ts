// ═══════════════════════════════════════════════════════════════════════════
// Wave 24 — Esums PR sustained-underperformance chain.
//
// Mounted at /api/esums/pr-chain.
//
// 9-state machine — Esums O&M detects sustained PR shortfall; engineer
// walks it through RCA → intervention → recovery → close, with escalation
// to W15 warranty when OEM-defect root cause is found, and a false-alarm
// branch for weather/grid attribution. Cron sweep auto-breaches stale rows
// and (for utility-tier sites only) raises a regulator inbox row.
//
// State machine + tier classification live in utils/pr-chain-spec.ts;
// this file is the route + persistence + cron sweep.
//
// Roles:
//   READ:  admin, support, esums, ipp, ipp_developer, wind, regulator
//   WRITE: admin, support, esums, ipp, ipp_developer, wind
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
  SLA_MINUTES,
  type PrStatus,
  type PrAction,
  type PrTier,
} from '../utils/pr-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'esums', 'esums_om',
  'ipp', 'ipp_developer', 'wind',
  'regulator',
]);
const WRITE_ROLES = new Set([
  'admin', 'support',
  'esums', 'esums_om',
  'ipp', 'ipp_developer', 'wind',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PrRow {
  id: string;
  case_number: string;
  site_id: string;
  site_name: string;
  technology: string;
  capacity_mw: number;
  capacity_tier: PrTier;
  baseline_pr: number;
  observed_pr: number;
  pr_shortfall: number;
  window_days: number;
  detected_at: string;
  primary_cause: string | null;
  rca_summary: string | null;
  action_plan: string | null;
  linked_wo_id: string | null;
  linked_warranty_claim_id: string | null;
  revenue_loss_zar: number | null;
  chain_status: PrStatus;
  warning_at: string | null;
  investigating_at: string | null;
  intervention_planned_at: string | null;
  intervention_executing_at: string | null;
  verified_at: string | null;
  escalated_at: string | null;
  closed_at: string | null;
  false_alarm_at: string | null;
  closure_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  case_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PrStatus, keyof PrRow | null> = {
  monitoring:             null,
  warning:                'warning_at',
  investigating:          'investigating_at',
  intervention_planned:   'intervention_planned_at',
  intervention_executing: 'intervention_executing_at',
  verified:               'verified_at',
  escalated:              'escalated_at',
  closed:                 'closed_at',
  false_alarm:            'false_alarm_at',
};

function decorate(row: PrRow, now: Date) {
  const tier = row.capacity_tier;
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
  };
}

function eventTypeFor(action: PrAction): string {
  switch (action) {
    case 'start_warning':         return 'warning_raised';
    case 'begin_investigation':   return 'investigation_started';
    case 'complete_rca':          return 'rca_completed';
    case 'dispatch_intervention': return 'intervention_dispatched';
    case 'verify_recovery':       return 'recovery_verified';
    case 'close':                 return 'closed';
    case 'escalate':              return 'escalated';
    case 'close_escalated':       return 'closed_escalated';
    case 'mark_false_alarm':      return 'false_alarm';
    case 'close_false_alarm':     return 'closed_false_alarm';
  }
}

function cascadeEventFor(action: PrAction): string {
  switch (action) {
    case 'start_warning':         return 'pr_chain.warning';
    case 'begin_investigation':   return 'pr_chain.investigating';
    case 'complete_rca':          return 'pr_chain.intervention_planned';
    case 'dispatch_intervention': return 'pr_chain.intervention_executing';
    case 'verify_recovery':       return 'pr_chain.verified';
    case 'close':                 return 'pr_chain.closed';
    case 'escalate':              return 'pr_chain.escalated';
    case 'close_escalated':       return 'pr_chain.closed';
    case 'mark_false_alarm':      return 'pr_chain.false_alarm';
    case 'close_false_alarm':     return 'pr_chain.closed';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier = c.req.query('tier');
  const status = c.req.query('status');
  const breached = c.req.query('breached');
  const site_id = c.req.query('site_id');

  let sql = 'SELECT * FROM oe_pr_chain WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)    { sql += ' AND capacity_tier = ?'; binds.push(tier); }
  if (status)  { sql += ' AND chain_status = ?';  binds.push(status); }
  if (site_id) { sql += ' AND site_id = ?';       binds.push(site_id); }

  sql += ' ORDER BY datetime(detected_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PrRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.capacity_tier] = (by_tier[i.capacity_tier] || 0) + 1;
  }

  const utility_open = items.filter(
    (i) => i.capacity_tier === 'utility' && !i.is_terminal,
  ).length;
  const intervention_executing = items.filter(
    (i) => i.chain_status === 'intervention_executing',
  ).length;
  const escalated_open = items.filter(
    (i) => i.chain_status === 'escalated',
  ).length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const total_revenue_loss_zar = items.reduce(
    (s, i) => s + (i.revenue_loss_zar || 0), 0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      utility_open,
      intervention_executing,
      escalated_open,
      open_count,
      breached: breached_count,
      total_revenue_loss_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_pr_chain WHERE id = ?').bind(id).first<PrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_pr_chain_events WHERE case_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CompleteRcaBody {
  primary_cause?: string;
  rca_summary?: string;
  action_plan?: string;
  notes?: string;
}

interface DispatchInterventionBody {
  linked_wo_id?: string;
  notes?: string;
}

interface VerifyRecoveryBody {
  observed_pr?: number;
  notes?: string;
}

interface EscalateBody {
  linked_warranty_claim_id?: string;
  notes?: string;
}

interface FalseAlarmBody {
  closure_notes?: string;
  notes?: string;
}

interface CloseBody {
  closure_notes?: string;
  revenue_loss_zar?: number;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PrAction,
  bodyHandler?: (row: PrRow, body: Record<string, unknown>) => Partial<PrRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_pr_chain WHERE id = ?').bind(id).first<PrRow>();
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
  const sla = slaDeadlineFor(to, row.capacity_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
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
    `UPDATE oe_pr_chain SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `pr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_pr_chain_events (id, case_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = cascadeEventFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'pr_chain',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.capacity_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_pr_chain WHERE id = ?').bind(id).first<PrRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/start-warning', async (c) => transition(c, 'start_warning'));

app.post('/:id/begin-investigation', async (c) => transition(c, 'begin_investigation'));

app.post('/:id/complete-rca', async (c) => transition(c, 'complete_rca', (_row, body) => {
  const b = body as Partial<CompleteRcaBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.primary_cause === 'string') out.primary_cause = b.primary_cause;
  if (typeof b.rca_summary === 'string') out.rca_summary = b.rca_summary;
  if (typeof b.action_plan === 'string') out.action_plan = b.action_plan;
  return out;
}));

app.post('/:id/dispatch-intervention', async (c) => transition(c, 'dispatch_intervention', (_row, body) => {
  const b = body as Partial<DispatchInterventionBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.linked_wo_id === 'string') out.linked_wo_id = b.linked_wo_id;
  return out;
}));

app.post('/:id/verify-recovery', async (c) => transition(c, 'verify_recovery', (_row, body) => {
  const b = body as Partial<VerifyRecoveryBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.observed_pr === 'number') {
    out.observed_pr = b.observed_pr;
  }
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  if (typeof b.revenue_loss_zar === 'number') out.revenue_loss_zar = b.revenue_loss_zar;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.linked_warranty_claim_id === 'string') {
    out.linked_warranty_claim_id = b.linked_warranty_claim_id;
  }
  return out;
}));

app.post('/:id/close-escalated', async (c) => transition(c, 'close_escalated', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  if (typeof b.revenue_loss_zar === 'number') out.revenue_loss_zar = b.revenue_loss_zar;
  return out;
}));

app.post('/:id/mark-false-alarm', async (c) => transition(c, 'mark_false_alarm', (_row, body) => {
  const b = body as Partial<FalseAlarmBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/close-false-alarm', async (c) => transition(c, 'close_false_alarm', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<PrRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

export async function prSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_pr_chain
     WHERE chain_status NOT IN ('closed','false_alarm','monitoring')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PrRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_pr_chain
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `pr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_pr_chain_events (id, case_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.capacity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.capacity_tier)) {
      await fireCascade({
        event: 'pr_chain.sla_breached',
        actor_id: 'system',
        entity_type: 'pr_chain',
        entity_id: row.id,
        data: { ...row, sla_window: row.chain_status },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
