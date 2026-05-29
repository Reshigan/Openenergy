// ═══════════════════════════════════════════════════════════════════════════
// Wave 76 — Trade Allocation, Give-Up & Confirmation/Affirmation chain (P6)
//
// Mounted at /api/trade-allocation/chain.
//
// The post-execution institutional trade-processing lifecycle. When a block trade
// executes on the venue it is the START of a chain: the block is ALLOCATED across
// client sub-accounts, optionally GIVEN UP to a clearing broker who ACCEPTS it, a
// CONFIRMATION is issued, the counterparty AFFIRMS it, central matching reconciles
// both sides, settlement is instructed against SSI and the trade SETTLES at the CSD.
// Any discrepancy is a BREAK; under settlement discipline every break is reportable.
// See src/utils/trade-allocation-spec.ts for the full state-machine, URGENT tiering
// and reportability rationale.
//
//   executed → allocation_pending → allocated → give_up_pending → give_up_accepted
//     → confirmation_issued → affirmed → matched → settlement_instructed → settled
//   self-cleared: allocated → confirmation_issued
//   break: {allocated…settlement_instructed} → break_review → confirmation_issued
//   cancel: {executed…confirmation_issued, break_review} → cancelled
//
// Single write — the trading desk / trade-processing ops drives every step; the
// route gates every action to the trader write set {admin, trader}. actor_party
// records whether a step represents front office, middle office or the counterparty.
//
// Reportability (the W76 signature, BREAK-driven): flag_break crosses for EVERY tier
// (every break / settlement fail is notifiable); cancel_trade + SLA breaches cross for
// the LARGE tiers (large + block).
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
  tierForNotionalZar,
  isLargeTier,
  SLA_MINUTES,
  type AllocationStatus,
  type AllocationAction,
  type AllocationTier,
} from '../utils/trade-allocation-spec';

// All nine personas may read the trade-allocation register.
const READ_ROLES = new Set([
  'admin',
  'trader', 'regulator', 'grid_operator', 'ipp_developer', 'carbon_fund', 'offtaker', 'lender', 'support',
]);

// Single write: the trading desk / trade-processing ops drives every step.
const WRITE_ROLES = new Set(['admin', 'trader']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface AllocationRow {
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trade_ref: string | null;
  order_ref: string | null;
  executing_party: string;
  clearing_party: string | null;
  counterparty_name: string;
  block_account: string | null;
  instrument: string | null;
  energy_type: string | null;
  side: string | null;
  quantity: number | null;
  price: number | null;
  notional_zar: number;
  allocation_legs: number | null;
  notional_tier: AllocationTier;
  settlement_date: string | null;
  ssi_ref: string | null;
  csd_ref: string | null;
  break_reason_code: string | null;
  allocation_ref: string | null;
  give_up_ref: string | null;
  confirmation_ref: string | null;
  affirmation_ref: string | null;
  match_ref: string | null;
  settlement_instruction_ref: string | null;
  break_ref: string | null;
  cancel_ref: string | null;
  allocation_basis: string | null;
  give_up_basis: string | null;
  confirmation_basis: string | null;
  affirmation_basis: string | null;
  match_basis: string | null;
  settlement_basis: string | null;
  break_basis: string | null;
  resolution_basis: string | null;
  cancel_basis: string | null;
  reason_code: string | null;
  chain_status: AllocationStatus;
  executed_at: string;
  allocation_pending_at: string | null;
  allocated_at: string | null;
  give_up_pending_at: string | null;
  give_up_accepted_at: string | null;
  confirmation_issued_at: string | null;
  affirmed_at: string | null;
  matched_at: string | null;
  settlement_instructed_at: string | null;
  settled_at: string | null;
  break_review_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AllocationEventRow {
  id: string;
  allocation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<AllocationStatus, keyof AllocationRow | null> = {
  executed:              null,
  allocation_pending:    'allocation_pending_at',
  allocated:             'allocated_at',
  give_up_pending:       'give_up_pending_at',
  give_up_accepted:      'give_up_accepted_at',
  confirmation_issued:   'confirmation_issued_at',
  affirmed:              'affirmed_at',
  matched:               'matched_at',
  settlement_instructed: 'settlement_instructed_at',
  settled:               'settled_at',
  break_review:          'break_review_at',
  cancelled:             'cancelled_at',
};

function decorate(row: AllocationRow, now: Date) {
  const tier = row.notional_tier;
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

function eventTypeFor(action: AllocationAction): string {
  switch (action) {
    case 'prepare_allocation':  return 'trade_allocation.allocation_pending';
    case 'allocate_block':      return 'trade_allocation.allocated';
    case 'designate_give_up':   return 'trade_allocation.give_up_pending';
    case 'accept_give_up':      return 'trade_allocation.give_up_accepted';
    case 'issue_confirmation':  return 'trade_allocation.confirmation_issued';
    case 'affirm_confirmation': return 'trade_allocation.affirmed';
    case 'match_trade':         return 'trade_allocation.matched';
    case 'instruct_settlement': return 'trade_allocation.settlement_instructed';
    case 'settle_trade':        return 'trade_allocation.settled';
    case 'flag_break':          return 'trade_allocation.break_review';
    case 'resolve_break':       return 'trade_allocation.confirmation_issued';
    case 'cancel_trade':        return 'trade_allocation.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const notional_tier = c.req.query('notional_tier');
  const instrument    = c.req.query('instrument');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_trade_allocations WHERE 1=1';
  const binds: unknown[] = [];
  if (notional_tier) { sql += ' AND notional_tier = ?'; binds.push(notional_tier); }
  if (instrument)    { sql += ' AND instrument = ?';    binds.push(instrument); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }

  sql += ' ORDER BY datetime(executed_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<AllocationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_instrument: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.notional_tier] = (by_tier[i.notional_tier] || 0) + 1;
    if (i.instrument) by_instrument[i.instrument] = (by_instrument[i.instrument] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const settled_count     = items.filter((i) => i.chain_status === 'settled').length;
  const break_count       = items.filter((i) => i.chain_status === 'break_review').length;
  const cancelled_count   = items.filter((i) => i.chain_status === 'cancelled').length;
  const affirmed_count    = items.filter((i) => i.chain_status === 'affirmed').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) => !i.is_terminal && isLargeTier(i.notional_tier)).length;
  const total_notional_zar   = items.reduce((sum, i) => sum + (i.notional_zar || 0), 0);
  const settled_notional_zar = items
    .filter((i) => i.chain_status === 'settled')
    .reduce((sum, i) => sum + (i.notional_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_instrument,
      open_count,
      settled_count,
      break_count,
      cancelled_count,
      affirmed_count,
      breached: breached_count,
      reportable_total,
      large_open,
      total_notional_zar,
      settled_notional_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_trade_allocations WHERE id = ?').bind(id).first<AllocationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_trade_allocation_events WHERE allocation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<AllocationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface PrepareBody {
  allocation_basis?: string;
  allocation_ref?: string;
  block_account?: string;
  notional_zar?: number;
  notes?: string;
}
interface AllocateBody {
  allocation_basis?: string;
  allocation_ref?: string;
  allocation_legs?: number;
  notional_zar?: number;
  notes?: string;
}
interface GiveUpBody {
  give_up_basis?: string;
  give_up_ref?: string;
  clearing_party?: string;
  notes?: string;
}
interface AcceptGiveUpBody {
  give_up_basis?: string;
  notes?: string;
}
interface ConfirmationBody {
  confirmation_basis?: string;
  confirmation_ref?: string;
  notes?: string;
}
interface AffirmBody {
  affirmation_basis?: string;
  affirmation_ref?: string;
  notes?: string;
}
interface MatchBody {
  match_basis?: string;
  match_ref?: string;
  notes?: string;
}
interface SettlementBody {
  settlement_basis?: string;
  settlement_instruction_ref?: string;
  ssi_ref?: string;
  settlement_date?: string;
  notes?: string;
}
interface SettleBody {
  settlement_basis?: string;
  csd_ref?: string;
  notes?: string;
}
interface BreakBody {
  break_basis?: string;
  break_ref?: string;
  break_reason_code?: string;
  reason_code?: string;
  notes?: string;
}
interface ResolveBody {
  resolution_basis?: string;
  confirmation_ref?: string;
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
  action: AllocationAction,
  bodyHandler?: (row: AllocationRow, body: Record<string, unknown>) => Partial<AllocationRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_trade_allocations WHERE id = ?').bind(id).first<AllocationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is re-derived live from the trade notional (the allocation may restate it);
  // otherwise the row's recorded tier stands.
  const effectiveNotional = (overrides.notional_zar ?? row.notional_zar);
  let effectiveTier: AllocationTier = row.notional_tier;
  if (overrides.notional_zar != null) {
    effectiveTier = tierForNotionalZar(effectiveNotional || 0);
    overrides.notional_tier = effectiveTier;
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
    `UPDATE oe_trade_allocations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `alloc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_trade_allocation_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'trade_allocation',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      notional_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_trade_allocations WHERE id = ?').bind(id).first<AllocationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/prepare-allocation', async (c) => transition(c, 'prepare_allocation', (_row, body) => {
  const b = body as Partial<PrepareBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.allocation_basis === 'string') out.allocation_basis = b.allocation_basis;
  if (typeof b.allocation_ref === 'string')   out.allocation_ref = b.allocation_ref;
  if (typeof b.block_account === 'string')    out.block_account = b.block_account;
  if (typeof b.notional_zar === 'number')     out.notional_zar = b.notional_zar;
  return out;
}));

app.post('/:id/allocate-block', async (c) => transition(c, 'allocate_block', (_row, body) => {
  const b = body as Partial<AllocateBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.allocation_basis === 'string') out.allocation_basis = b.allocation_basis;
  if (typeof b.allocation_ref === 'string')   out.allocation_ref = b.allocation_ref;
  if (typeof b.allocation_legs === 'number')  out.allocation_legs = b.allocation_legs;
  if (typeof b.notional_zar === 'number')     out.notional_zar = b.notional_zar;
  return out;
}));

app.post('/:id/designate-give-up', async (c) => transition(c, 'designate_give_up', (_row, body) => {
  const b = body as Partial<GiveUpBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.give_up_basis === 'string')  out.give_up_basis = b.give_up_basis;
  if (typeof b.give_up_ref === 'string')    out.give_up_ref = b.give_up_ref;
  if (typeof b.clearing_party === 'string') out.clearing_party = b.clearing_party;
  return out;
}));

app.post('/:id/accept-give-up', async (c) => transition(c, 'accept_give_up', (_row, body) => {
  const b = body as Partial<AcceptGiveUpBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.give_up_basis === 'string') out.give_up_basis = b.give_up_basis;
  return out;
}));

app.post('/:id/issue-confirmation', async (c) => transition(c, 'issue_confirmation', (_row, body) => {
  const b = body as Partial<ConfirmationBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.confirmation_basis === 'string') out.confirmation_basis = b.confirmation_basis;
  if (typeof b.confirmation_ref === 'string')   out.confirmation_ref = b.confirmation_ref;
  return out;
}));

app.post('/:id/affirm-confirmation', async (c) => transition(c, 'affirm_confirmation', (_row, body) => {
  const b = body as Partial<AffirmBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.affirmation_basis === 'string') out.affirmation_basis = b.affirmation_basis;
  if (typeof b.affirmation_ref === 'string')   out.affirmation_ref = b.affirmation_ref;
  return out;
}));

app.post('/:id/match-trade', async (c) => transition(c, 'match_trade', (_row, body) => {
  const b = body as Partial<MatchBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.match_basis === 'string') out.match_basis = b.match_basis;
  if (typeof b.match_ref === 'string')   out.match_ref = b.match_ref;
  return out;
}));

app.post('/:id/instruct-settlement', async (c) => transition(c, 'instruct_settlement', (_row, body) => {
  const b = body as Partial<SettlementBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.settlement_basis === 'string')           out.settlement_basis = b.settlement_basis;
  if (typeof b.settlement_instruction_ref === 'string') out.settlement_instruction_ref = b.settlement_instruction_ref;
  if (typeof b.ssi_ref === 'string')                    out.ssi_ref = b.ssi_ref;
  if (typeof b.settlement_date === 'string')            out.settlement_date = b.settlement_date;
  return out;
}));

app.post('/:id/settle-trade', async (c) => transition(c, 'settle_trade', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.csd_ref === 'string')          out.csd_ref = b.csd_ref;
  return out;
}));

app.post('/:id/flag-break', async (c) => transition(c, 'flag_break', (_row, body) => {
  const b = body as Partial<BreakBody>;
  const out: Partial<AllocationRow> = { escalation_level: 1 };
  if (typeof b.break_basis === 'string')       out.break_basis = b.break_basis;
  if (typeof b.break_ref === 'string')         out.break_ref = b.break_ref;
  if (typeof b.break_reason_code === 'string') out.break_reason_code = b.break_reason_code;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-break', async (c) => transition(c, 'resolve_break', (_row, body) => {
  const b = body as Partial<ResolveBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.resolution_basis === 'string') out.resolution_basis = b.resolution_basis;
  if (typeof b.confirmation_ref === 'string') out.confirmation_ref = b.confirmation_ref;
  return out;
}));

app.post('/:id/cancel-trade', async (c) => transition(c, 'cancel_trade', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.cancel_basis === 'string') out.cancel_basis = b.cancel_basis;
  if (typeof b.cancel_ref === 'string')   out.cancel_ref = b.cancel_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the large tiers (large + block).
export async function tradeAllocationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_trade_allocations
     WHERE chain_status NOT IN ('settled','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<AllocationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_trade_allocations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `alloc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_trade_allocation_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'trade_allocation.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.notional_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.notional_tier)) {
      await fireCascade({
        event: 'trade_allocation.sla_breached',
        actor_id: 'system',
        entity_type: 'trade_allocation',
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
