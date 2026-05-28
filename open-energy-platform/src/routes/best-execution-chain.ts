// ═══════════════════════════════════════════════════════════════════════════
// Wave 36 — Trader Best-Execution / RFQ Compliance chain
//
// Mounted at /api/best-execution/chain.
//
// 11-state lifecycle for every client / counterparty RFQ on the exchange. The
// desk must take all sufficient steps to obtain the best possible result (total
// consideration = price + cost + speed + likelihood) for the client. Operational
// complement to W2 VaR (quality), W9 MM compliance (consistency), W29 position
// limits (quantity): this enforces best EXECUTION on each order.
//
// Forward path:
//   rfq_received → quotes_solicited → quotes_received → best_ex_evaluated →
//   execution_approved → executed → tca_reviewed → closed
//
// Branch states:
//   override_executed   — desk executed away from the best quote with a
//                        documented justification (size/likelihood); routes
//                        through TCA → closed
//   exception_escalated — best-ex policy breach escalated to compliance / FSCA
//   rfq_expired         — RFQ window lapsed before execution
//
// Tiers (FSCA client classification): retail / professional / eligible_counterparty.
//
// Standards: FSCA Conduct Standard 1 of 2020 (General Code of Conduct for
// Authorised FSPs) best-execution duty + FAIS Act 2002 + JSE best-execution rules.
//
// Reportability (regulator / FSCA inbox):
//   - exception_escalated crosses for EVERY tier (deliberate breach escalation)
//   - override_executed crosses for retail + professional (ECP waived best-ex)
//   - sla_breached crosses for retail + professional
//
// Write is open to admin / trader / support. One operator set records the
// workflow; each transition is tagged with the contractual party
// (desk / compliance / system) via actor_party derived from the action.
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
  isReportable,
  partyForAction,
  SLA_MINUTES,
  type BestExStatus,
  type BestExAction,
  type BestExTier,
} from '../utils/best-execution-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'trader',
  'regulator',
]);

// No dedicated compliance login — the desk / admin / support users record every
// party's action; the contractual party is captured separately via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'trader']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface BestExRow {
  id: string;
  rfq_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  desk_party_id: string;
  desk_party_name: string;
  client_party_id: string;
  client_party_name: string;
  client_tier: BestExTier;
  instrument: string;
  energy_type: string | null;
  side: string | null;
  quantity_mwh: number | null;
  delivery_day: string | null;
  quotes_count: number;
  best_quote_price_zar: number | null;
  best_quote_counterparty: string | null;
  executed_price_zar: number | null;
  executed_counterparty: string | null;
  total_consideration_zar: number | null;
  notional_zar: number | null;
  price_improvement_bps: number | null;
  slippage_bps: number | null;
  rfq_ref: string | null;
  evaluation_ref: string | null;
  approval_ref: string | null;
  execution_ref: string | null;
  override_ref: string | null;
  tca_ref: string | null;
  exception_ref: string | null;
  best_ex_basis: string | null;
  approval_basis: string | null;
  override_basis: string | null;
  tca_findings: string | null;
  exception_basis: string | null;
  expiry_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: BestExStatus;
  rfq_received_at: string;
  quotes_solicited_at: string | null;
  quotes_received_at: string | null;
  best_ex_evaluated_at: string | null;
  execution_approved_at: string | null;
  executed_at: string | null;
  override_executed_at: string | null;
  tca_reviewed_at: string | null;
  closed_at: string | null;
  exception_escalated_at: string | null;
  rfq_expired_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface BestExEventRow {
  id: string;
  rfq_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<BestExStatus, keyof BestExRow | null> = {
  rfq_received:        null,
  quotes_solicited:    'quotes_solicited_at',
  quotes_received:     'quotes_received_at',
  best_ex_evaluated:   'best_ex_evaluated_at',
  execution_approved:  'execution_approved_at',
  executed:            'executed_at',
  override_executed:   'override_executed_at',
  tca_reviewed:        'tca_reviewed_at',
  closed:              'closed_at',
  exception_escalated: 'exception_escalated_at',
  rfq_expired:         'rfq_expired_at',
};

function decorate(row: BestExRow, now: Date) {
  const tier = row.client_tier;
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
    is_reportable: isReportable(tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: BestExAction): string {
  switch (action) {
    case 'solicit_quotes':     return 'best_execution.quotes_solicited';
    case 'record_quotes':      return 'best_execution.quotes_received';
    case 'evaluate_best_ex':   return 'best_execution.best_ex_evaluated';
    case 'approve_execution':  return 'best_execution.execution_approved';
    case 'execute':            return 'best_execution.executed';
    case 'execute_override':   return 'best_execution.override_executed';
    case 'review_tca':         return 'best_execution.tca_reviewed';
    case 'close':              return 'best_execution.closed';
    case 'escalate_exception': return 'best_execution.exception_escalated';
    case 'expire':             return 'best_execution.rfq_expired';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const client_tier     = c.req.query('client_tier');
  const status          = c.req.query('status');
  const breached        = c.req.query('breached');
  const client_party_id = c.req.query('client_party_id');
  const desk_party_id   = c.req.query('desk_party_id');

  let sql = 'SELECT * FROM oe_best_execution WHERE 1=1';
  const binds: unknown[] = [];
  if (client_tier)     { sql += ' AND client_tier = ?';     binds.push(client_tier); }
  if (status)          { sql += ' AND chain_status = ?';    binds.push(status); }
  if (client_party_id) { sql += ' AND client_party_id = ?'; binds.push(client_party_id); }
  if (desk_party_id)   { sql += ' AND desk_party_id = ?';   binds.push(desk_party_id); }

  sql += ' ORDER BY datetime(rfq_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<BestExRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.client_tier]    = (by_tier[i.client_tier] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const closed_count      = items.filter((i) => i.chain_status === 'closed').length;
  const override_count    = items.filter((i) => i.chain_status === 'override_executed').length;
  const exception_count   = items.filter((i) => i.chain_status === 'exception_escalated').length;
  const expired_count     = items.filter((i) => i.chain_status === 'rfq_expired').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const retail_open       = items.filter((i) => !i.is_terminal && i.client_tier === 'retail').length;
  const exception_open    = items.filter((i) => i.chain_status === 'exception_escalated').length;
  const total_notional_zar = items.reduce((sum, i) => sum + (i.notional_zar || 0), 0);
  const total_executed_zar = items.reduce(
    (sum, i) => sum + (i.executed_price_zar && i.quantity_mwh ? i.executed_price_zar * i.quantity_mwh : 0),
    0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      closed_count,
      override_count,
      exception_count,
      expired_count,
      breached: breached_count,
      reportable_total,
      retail_open,
      exception_open,
      total_notional_zar,
      total_executed_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_best_execution WHERE id = ?').bind(id).first<BestExRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_best_execution_events WHERE rfq_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<BestExEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface RecordQuotesBody {
  quotes_count?: number;
  best_quote_price_zar?: number;
  best_quote_counterparty?: string;
  notes?: string;
}

interface EvaluateBody {
  total_consideration_zar?: number;
  evaluation_ref?: string;
  best_ex_basis?: string;
  notes?: string;
}

interface ApproveBody {
  approval_ref?: string;
  approval_basis?: string;
  notes?: string;
}

interface ExecuteBody {
  executed_price_zar?: number;
  executed_counterparty?: string;
  execution_ref?: string;
  price_improvement_bps?: number;
  slippage_bps?: number;
  notes?: string;
}

interface OverrideBody {
  executed_price_zar?: number;
  executed_counterparty?: string;
  override_ref?: string;
  override_basis?: string;
  slippage_bps?: number;
  reason_code?: string;
  notes?: string;
}

interface TcaBody {
  tca_ref?: string;
  tca_findings?: string;
  price_improvement_bps?: number;
  slippage_bps?: number;
  notes?: string;
}

interface CloseBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface ExceptionBody {
  exception_ref?: string;
  exception_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface ExpireBody {
  expiry_basis?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: BestExAction,
  bodyHandler?: (row: BestExRow, body: Record<string, unknown>) => Partial<BestExRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_best_execution WHERE id = ?').bind(id).first<BestExRow>();
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
  const sla = slaDeadlineFor(to, row.client_tier, now);
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
    `UPDATE oe_best_execution SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `bex_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'best_execution',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.client_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_best_execution WHERE id = ?').bind(id).first<BestExRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/solicit-quotes', async (c) => transition(c, 'solicit_quotes', (_row, _body) => {
  return {};
}));

app.post('/:id/record-quotes', async (c) => transition(c, 'record_quotes', (_row, body) => {
  const b = body as Partial<RecordQuotesBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.quotes_count === 'number')             out.quotes_count = b.quotes_count;
  if (typeof b.best_quote_price_zar === 'number')     out.best_quote_price_zar = b.best_quote_price_zar;
  if (typeof b.best_quote_counterparty === 'string')  out.best_quote_counterparty = b.best_quote_counterparty;
  return out;
}));

app.post('/:id/evaluate', async (c) => transition(c, 'evaluate_best_ex', (_row, body) => {
  const b = body as Partial<EvaluateBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.total_consideration_zar === 'number') out.total_consideration_zar = b.total_consideration_zar;
  if (typeof b.evaluation_ref === 'string')          out.evaluation_ref = b.evaluation_ref;
  if (typeof b.best_ex_basis === 'string')           out.best_ex_basis = b.best_ex_basis;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve_execution', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.approval_ref === 'string')   out.approval_ref = b.approval_ref;
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  return out;
}));

app.post('/:id/execute', async (c) => transition(c, 'execute', (_row, body) => {
  const b = body as Partial<ExecuteBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.executed_price_zar === 'number')    out.executed_price_zar = b.executed_price_zar;
  if (typeof b.executed_counterparty === 'string') out.executed_counterparty = b.executed_counterparty;
  if (typeof b.execution_ref === 'string')         out.execution_ref = b.execution_ref;
  if (typeof b.price_improvement_bps === 'number') out.price_improvement_bps = b.price_improvement_bps;
  if (typeof b.slippage_bps === 'number')          out.slippage_bps = b.slippage_bps;
  return out;
}));

app.post('/:id/execute-override', async (c) => transition(c, 'execute_override', (_row, body) => {
  const b = body as Partial<OverrideBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.executed_price_zar === 'number')    out.executed_price_zar = b.executed_price_zar;
  if (typeof b.executed_counterparty === 'string') out.executed_counterparty = b.executed_counterparty;
  if (typeof b.override_ref === 'string')          out.override_ref = b.override_ref;
  if (typeof b.override_basis === 'string')        out.override_basis = b.override_basis;
  if (typeof b.slippage_bps === 'number')          out.slippage_bps = b.slippage_bps;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/review-tca', async (c) => transition(c, 'review_tca', (_row, body) => {
  const b = body as Partial<TcaBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.tca_ref === 'string')               out.tca_ref = b.tca_ref;
  if (typeof b.tca_findings === 'string')          out.tca_findings = b.tca_findings;
  if (typeof b.price_improvement_bps === 'number') out.price_improvement_bps = b.price_improvement_bps;
  if (typeof b.slippage_bps === 'number')          out.slippage_bps = b.slippage_bps;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/escalate-exception', async (c) => transition(c, 'escalate_exception', (_row, body) => {
  const b = body as Partial<ExceptionBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.exception_ref === 'string')   out.exception_ref = b.exception_ref;
  if (typeof b.exception_basis === 'string') out.exception_basis = b.exception_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')       out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/expire', async (c) => transition(c, 'expire', (_row, body) => {
  const b = body as Partial<ExpireBody>;
  const out: Partial<BestExRow> = {};
  if (typeof b.expiry_basis === 'string') out.expiry_basis = b.expiry_basis;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

export async function bestExecutionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_best_execution
     WHERE chain_status NOT IN ('closed','exception_escalated','rfq_expired')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<BestExRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_best_execution
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `bex_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'best_execution.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.client_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.client_tier)) {
      await fireCascade({
        event: 'best_execution.sla_breached',
        actor_id: 'system',
        entity_type: 'best_execution',
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
