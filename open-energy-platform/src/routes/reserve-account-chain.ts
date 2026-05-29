// ═══════════════════════════════════════════════════════════════════════════
// Wave 77 — Reserve-Account (DSRA / MRA) Funding, Drawdown, Cure & Release (P6)
//
// Mounted at /api/reserve-account/chain.
//
// A project-finance facility requires the borrower to fund and MAINTAIN controlled
// reserve accounts — the Debt Service Reserve Account (DSRA) and the Maintenance
// Reserve Account (MRA). The agent bank monitors the target balance on every test
// date; a shortfall must be CURED inside a contractual window and a legitimate DRAW
// must be REPLENISHED inside a top-up window. At final maturity / step-down the
// reserve is RELEASED. A failure to cure or replenish is an EVENT OF DEFAULT.
// See src/utils/reserve-account-spec.ts for the full state-machine, URGENT tiering
// and reportability rationale.
//
//   reserve_required → funding_scheduled → funding_in_progress → funded
//     → (monitored) → release_requested → released
//   shortfall: funded → shortfall_flagged → cure_pending → (replenish|waive) funded
//                                                        → (declare_breach) breached
//   draw:      funded → drawdown_authorized → drawn → (replenish|waive) funded
//                                                   → (declare_breach) breached
//   cancel:    {reserve_required, funding_scheduled, funding_in_progress} → cancelled
//
// Single write — the agent / lender drives every step; the route gates every action
// to the lender write set {admin, lender}. actor_party records whether a step
// represents the lender (agent), the borrower or the account bank.
//
// Reportability (the W77 signature, BREACH-driven): declare_breach crosses for EVERY
// tier (a reserve breach is always an event of default); waive_requirement + SLA
// breaches cross for the LARGE tiers (major + systemic).
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
  tierForTargetZar,
  isLargeTier,
  SLA_MINUTES,
  type ReserveStatus,
  type ReserveAction,
  type ReserveTier,
} from '../utils/reserve-account-spec';

// All nine personas may read the reserve-account register.
const READ_ROLES = new Set([
  'admin',
  'lender', 'regulator', 'grid_operator', 'ipp_developer', 'carbon_fund', 'offtaker', 'trader', 'support',
]);

// Single write: the agent / lender drives every step of the reserve lifecycle.
const WRITE_ROLES = new Set(['admin', 'lender']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ReserveRow {
  id: string;
  reserve_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_ref: string | null;
  project_id: string | null;
  loan_agreement_ref: string | null;
  lender_name: string;
  borrower_name: string;
  account_bank: string | null;
  reserve_type: string | null;
  funding_mode: string | null;
  target_basis: string | null;
  account_number: string | null;
  currency: string | null;
  target_amount_zar: number;
  current_balance_zar: number | null;
  drawn_amount_zar: number | null;
  shortfall_amount_zar: number | null;
  reserve_tier: ReserveTier;
  next_test_date: string | null;
  cure_deadline: string | null;
  release_due_date: string | null;
  shortfall_reason_code: string | null;
  funding_ref: string | null;
  shortfall_ref: string | null;
  cure_ref: string | null;
  drawdown_ref: string | null;
  replenishment_ref: string | null;
  waiver_ref: string | null;
  release_ref: string | null;
  breach_ref: string | null;
  cancel_ref: string | null;
  funding_basis: string | null;
  shortfall_basis: string | null;
  cure_basis: string | null;
  drawdown_basis: string | null;
  replenishment_basis: string | null;
  waiver_basis: string | null;
  release_basis: string | null;
  breach_basis: string | null;
  cancel_basis: string | null;
  reason_code: string | null;
  chain_status: ReserveStatus;
  reserve_required_at: string;
  funding_scheduled_at: string | null;
  funding_in_progress_at: string | null;
  funded_at: string | null;
  shortfall_flagged_at: string | null;
  cure_pending_at: string | null;
  drawdown_authorized_at: string | null;
  drawn_at: string | null;
  release_requested_at: string | null;
  released_at: string | null;
  breached_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ReserveEventRow {
  id: string;
  reserve_account_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ReserveStatus, keyof ReserveRow | null> = {
  reserve_required:    null,
  funding_scheduled:   'funding_scheduled_at',
  funding_in_progress: 'funding_in_progress_at',
  funded:              'funded_at',
  shortfall_flagged:   'shortfall_flagged_at',
  cure_pending:        'cure_pending_at',
  drawdown_authorized: 'drawdown_authorized_at',
  drawn:               'drawn_at',
  release_requested:   'release_requested_at',
  released:            'released_at',
  breached:            'breached_at',
  cancelled:           'cancelled_at',
};

function decorate(row: ReserveRow, now: Date) {
  const tier = row.reserve_tier;
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

function eventTypeFor(action: ReserveAction): string {
  switch (action) {
    case 'schedule_funding':   return 'reserve_account.funding_scheduled';
    case 'commence_funding':   return 'reserve_account.funding_in_progress';
    case 'confirm_funding':    return 'reserve_account.funded';
    case 'flag_shortfall':     return 'reserve_account.shortfall_flagged';
    case 'open_cure':          return 'reserve_account.cure_pending';
    case 'authorize_drawdown': return 'reserve_account.drawdown_authorized';
    case 'execute_drawdown':   return 'reserve_account.drawn';
    case 'replenish_reserve':  return 'reserve_account.funded';
    case 'waive_requirement':  return 'reserve_account.funded';
    case 'declare_breach':     return 'reserve_account.breached';
    case 'request_release':    return 'reserve_account.release_requested';
    case 'release_reserve':    return 'reserve_account.released';
    case 'cancel_reserve':     return 'reserve_account.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const reserve_tier = c.req.query('reserve_tier');
  const reserve_type = c.req.query('reserve_type');
  const status       = c.req.query('status');
  const breached     = c.req.query('breached');
  const reportable   = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_reserve_account_chain WHERE 1=1';
  const binds: unknown[] = [];
  if (reserve_tier) { sql += ' AND reserve_tier = ?'; binds.push(reserve_tier); }
  if (reserve_type) { sql += ' AND reserve_type = ?'; binds.push(reserve_type); }
  if (status)       { sql += ' AND chain_status = ?'; binds.push(status); }

  sql += ' ORDER BY datetime(reserve_required_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ReserveRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.reserve_tier] = (by_tier[i.reserve_tier] || 0) + 1;
    if (i.reserve_type) by_type[i.reserve_type] = (by_type[i.reserve_type] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const funded_count      = items.filter((i) => i.chain_status === 'funded').length;
  const shortfall_count   = items.filter((i) => i.chain_status === 'shortfall_flagged' || i.chain_status === 'cure_pending').length;
  const drawn_count       = items.filter((i) => i.chain_status === 'drawn' || i.chain_status === 'drawdown_authorized').length;
  const release_count     = items.filter((i) => i.chain_status === 'release_requested' || i.chain_status === 'released').length;
  const breach_count      = items.filter((i) => i.chain_status === 'breached').length;
  const cancelled_count   = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_sla      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) => !i.is_terminal && isLargeTier(i.reserve_tier)).length;
  const total_target_zar  = items.reduce((sum, i) => sum + (i.target_amount_zar || 0), 0);
  const funded_target_zar = items
    .filter((i) => i.chain_status === 'funded')
    .reduce((sum, i) => sum + (i.target_amount_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_type,
      open_count,
      funded_count,
      shortfall_count,
      drawn_count,
      release_count,
      breach_count,
      cancelled_count,
      breached: breached_sla,
      reportable_total,
      large_open,
      total_target_zar,
      funded_target_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_reserve_account_chain WHERE id = ?').bind(id).first<ReserveRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_reserve_account_chain_events WHERE reserve_account_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ReserveEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScheduleBody {
  funding_basis?: string;
  funding_ref?: string;
  funding_mode?: string;
  account_bank?: string;
  next_test_date?: string;
  target_amount_zar?: number;
  notes?: string;
}
interface CommenceBody {
  funding_basis?: string;
  funding_ref?: string;
  account_number?: string;
  notes?: string;
}
interface ConfirmBody {
  funding_basis?: string;
  current_balance_zar?: number;
  next_test_date?: string;
  notes?: string;
}
interface ShortfallBody {
  shortfall_basis?: string;
  shortfall_ref?: string;
  shortfall_reason_code?: string;
  shortfall_amount_zar?: number;
  current_balance_zar?: number;
  notes?: string;
}
interface OpenCureBody {
  cure_basis?: string;
  cure_ref?: string;
  cure_deadline?: string;
  notes?: string;
}
interface AuthorizeDrawBody {
  drawdown_basis?: string;
  drawdown_ref?: string;
  notes?: string;
}
interface ExecuteDrawBody {
  drawdown_basis?: string;
  drawn_amount_zar?: number;
  current_balance_zar?: number;
  notes?: string;
}
interface ReplenishBody {
  replenishment_basis?: string;
  replenishment_ref?: string;
  current_balance_zar?: number;
  notes?: string;
}
interface WaiveBody {
  waiver_basis?: string;
  waiver_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface BreachBody {
  breach_basis?: string;
  breach_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ReleaseRequestBody {
  release_basis?: string;
  release_ref?: string;
  release_due_date?: string;
  notes?: string;
}
interface ReleaseBody {
  release_basis?: string;
  release_ref?: string;
  notes?: string;
}
interface CancelBody {
  cancel_basis?: string;
  cancel_ref?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ReserveAction,
  bodyHandler?: (row: ReserveRow, body: Record<string, unknown>) => Partial<ReserveRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_reserve_account_chain WHERE id = ?').bind(id).first<ReserveRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is re-derived live from the reserve target (a schedule/confirm may restate
  // it); otherwise the row's recorded tier stands.
  let effectiveTier: ReserveTier = row.reserve_tier;
  if (overrides.target_amount_zar != null) {
    effectiveTier = tierForTargetZar(overrides.target_amount_zar || 0);
    overrides.reserve_tier = effectiveTier;
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier);
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
    `UPDATE oe_reserve_account_chain SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `rac_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_reserve_account_chain_events (id, reserve_account_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'reserve_account',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      reserve_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_reserve_account_chain WHERE id = ?').bind(id).first<ReserveRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/schedule-funding', async (c) => transition(c, 'schedule_funding', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.funding_basis === 'string')     out.funding_basis = b.funding_basis;
  if (typeof b.funding_ref === 'string')       out.funding_ref = b.funding_ref;
  if (typeof b.funding_mode === 'string')      out.funding_mode = b.funding_mode;
  if (typeof b.account_bank === 'string')      out.account_bank = b.account_bank;
  if (typeof b.next_test_date === 'string')    out.next_test_date = b.next_test_date;
  if (typeof b.target_amount_zar === 'number') out.target_amount_zar = b.target_amount_zar;
  return out;
}));

app.post('/:id/commence-funding', async (c) => transition(c, 'commence_funding', (_row, body) => {
  const b = body as Partial<CommenceBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.funding_basis === 'string')  out.funding_basis = b.funding_basis;
  if (typeof b.funding_ref === 'string')    out.funding_ref = b.funding_ref;
  if (typeof b.account_number === 'string') out.account_number = b.account_number;
  return out;
}));

app.post('/:id/confirm-funding', async (c) => transition(c, 'confirm_funding', (_row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.funding_basis === 'string')       out.funding_basis = b.funding_basis;
  if (typeof b.current_balance_zar === 'number') out.current_balance_zar = b.current_balance_zar;
  if (typeof b.next_test_date === 'string')      out.next_test_date = b.next_test_date;
  return out;
}));

app.post('/:id/flag-shortfall', async (c) => transition(c, 'flag_shortfall', (_row, body) => {
  const b = body as Partial<ShortfallBody>;
  const out: Partial<ReserveRow> = { escalation_level: 1 };
  if (typeof b.shortfall_basis === 'string')        out.shortfall_basis = b.shortfall_basis;
  if (typeof b.shortfall_ref === 'string')          out.shortfall_ref = b.shortfall_ref;
  if (typeof b.shortfall_reason_code === 'string')  out.shortfall_reason_code = b.shortfall_reason_code;
  if (typeof b.shortfall_amount_zar === 'number')   out.shortfall_amount_zar = b.shortfall_amount_zar;
  if (typeof b.current_balance_zar === 'number')    out.current_balance_zar = b.current_balance_zar;
  return out;
}));

app.post('/:id/open-cure', async (c) => transition(c, 'open_cure', (_row, body) => {
  const b = body as Partial<OpenCureBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.cure_basis === 'string')    out.cure_basis = b.cure_basis;
  if (typeof b.cure_ref === 'string')      out.cure_ref = b.cure_ref;
  if (typeof b.cure_deadline === 'string') out.cure_deadline = b.cure_deadline;
  return out;
}));

app.post('/:id/authorize-drawdown', async (c) => transition(c, 'authorize_drawdown', (_row, body) => {
  const b = body as Partial<AuthorizeDrawBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.drawdown_basis === 'string') out.drawdown_basis = b.drawdown_basis;
  if (typeof b.drawdown_ref === 'string')   out.drawdown_ref = b.drawdown_ref;
  return out;
}));

app.post('/:id/execute-drawdown', async (c) => transition(c, 'execute_drawdown', (_row, body) => {
  const b = body as Partial<ExecuteDrawBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.drawdown_basis === 'string')      out.drawdown_basis = b.drawdown_basis;
  if (typeof b.drawn_amount_zar === 'number')    out.drawn_amount_zar = b.drawn_amount_zar;
  if (typeof b.current_balance_zar === 'number') out.current_balance_zar = b.current_balance_zar;
  return out;
}));

app.post('/:id/replenish-reserve', async (c) => transition(c, 'replenish_reserve', (_row, body) => {
  const b = body as Partial<ReplenishBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.replenishment_basis === 'string') out.replenishment_basis = b.replenishment_basis;
  if (typeof b.replenishment_ref === 'string')   out.replenishment_ref = b.replenishment_ref;
  if (typeof b.current_balance_zar === 'number') out.current_balance_zar = b.current_balance_zar;
  return out;
}));

app.post('/:id/waive-requirement', async (c) => transition(c, 'waive_requirement', (_row, body) => {
  const b = body as Partial<WaiveBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.waiver_basis === 'string') out.waiver_basis = b.waiver_basis;
  if (typeof b.waiver_ref === 'string')   out.waiver_ref = b.waiver_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/declare-breach', async (c) => transition(c, 'declare_breach', (_row, body) => {
  const b = body as Partial<BreachBody>;
  const out: Partial<ReserveRow> = { escalation_level: 2 };
  if (typeof b.breach_basis === 'string') out.breach_basis = b.breach_basis;
  if (typeof b.breach_ref === 'string')   out.breach_ref = b.breach_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/request-release', async (c) => transition(c, 'request_release', (_row, body) => {
  const b = body as Partial<ReleaseRequestBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.release_basis === 'string')    out.release_basis = b.release_basis;
  if (typeof b.release_ref === 'string')      out.release_ref = b.release_ref;
  if (typeof b.release_due_date === 'string') out.release_due_date = b.release_due_date;
  return out;
}));

app.post('/:id/release-reserve', async (c) => transition(c, 'release_reserve', (_row, body) => {
  const b = body as Partial<ReleaseBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.release_basis === 'string') out.release_basis = b.release_basis;
  if (typeof b.release_ref === 'string')   out.release_ref = b.release_ref;
  return out;
}));

app.post('/:id/cancel-reserve', async (c) => transition(c, 'cancel_reserve', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<ReserveRow> = {};
  if (typeof b.cancel_basis === 'string') out.cancel_basis = b.cancel_basis;
  if (typeof b.cancel_ref === 'string')   out.cancel_ref = b.cancel_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the large tiers (major + systemic).
export async function reserveAccountSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_reserve_account_chain
     WHERE chain_status NOT IN ('released','breached','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ReserveRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_reserve_account_chain
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `rac_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_reserve_account_chain_events (id, reserve_account_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'reserve_account.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.reserve_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.reserve_tier)) {
      await fireCascade({
        event: 'reserve_account.sla_breached',
        actor_id: 'system',
        entity_type: 'reserve_account',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
