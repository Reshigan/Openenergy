// ═══════════════════════════════════════════════════════════════════════════
// Wave 50 — Grid Ancillary Services Reserve Activation & Settlement chain
//
// Mounted at /api/reserve-activation/chain.
//
// NERSA SA Grid Code, System Operation Code (ancillary services + reserves) and
// Network Code. 12-state P6 lifecycle for every formal reserve ACTIVATION the
// System Operator (SO) dispatches during a frequency / contingency event: the
// SO instructs a contracted reserve provider, the provider responds, the SO
// measures delivered response against the instruction, and the event is settled
// (utilisation + availability payment, or a non-performance penalty).
//
// The third Grid real-time-operations chain — it pairs with W13 dispatch
// nominations (scheduled energy) and W34 load curtailment (emergency demand
// reduction); W50 is the supply-side reserve-response counterpart.
//
// Forward path:
//   activation_issued → acknowledged → ramping → sustaining → released →
//   performance_review → verified → settled
// Non-performance: flag_non_performance (ramping|sustaining|performance_review)
//   → non_performance → settle_penalty → settled
// Dispute:    raise_dispute (performance_review|verified|non_performance)
//   → disputed → resolve_dispute → dispute_resolved
// Early exit: withdraw_instruction (activation_issued|acknowledged|ramping)
//   → withdrawn
//
// URGENT SLA — the FASTER the reserve product, the TIGHTER the response window.
// Reportability:
//   - flag_non_performance crosses for SECURITY tiers (instantaneous /
//     regulating / ten_minute).
//   - resolve_dispute crosses for CRITICAL tiers (instantaneous / regulating).
//   - sla_breached crosses for CRITICAL tiers only.
//
// Two-party split write: the provider acknowledges / ramps / sustains / disputes;
// the SO drives release / review / verify / settle / penalty / withdraw.
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
  isProviderAction,
  partyForAction,
  SLA_MINUTES,
  type ReserveActivationStatus,
  type ReserveActivationAction,
  type ReserveTier,
} from '../utils/reserve-activation-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'grid_operator', 'regulator',
  'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// Two-party split write. The System Operator drives the dispatch / measurement /
// settlement machinery; the contracted reserve provider acknowledges, ramps,
// sustains and disputes. A reserve provider can be a generator, pumped-storage
// plant, battery, interconnector or demand-response aggregator, so the provider
// write-set spans the market-side operating roles.
const SO_WRITE_ROLES = new Set(['admin', 'support', 'grid_operator']);
const PROVIDER_WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ActivationRow {
  id: string;
  activation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  so_party_id: string;
  so_party_name: string;
  provider_party_id: string;
  provider_party_name: string;
  reserve_tier: ReserveTier;
  provider_type: string;
  service_name: string;
  contract_ref: string | null;
  trigger_type: string | null;
  instructed_mw: number | null;
  delivered_mw: number | null;
  response_time_seconds: number | null;
  actual_response_seconds: number | null;
  frequency_hz_at_event: number | null;
  availability_payment_zar: number | null;
  utilisation_payment_zar: number | null;
  penalty_zar: number | null;
  instruction_ref: string | null;
  acknowledgement_ref: string | null;
  ramp_ref: string | null;
  delivery_ref: string | null;
  release_ref: string | null;
  review_ref: string | null;
  verification_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  instruction_basis: string | null;
  response_basis: string | null;
  performance_basis: string | null;
  settlement_basis: string | null;
  non_performance_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: ReserveActivationStatus;
  activation_issued_at: string;
  acknowledged_at: string | null;
  ramping_at: string | null;
  sustaining_at: string | null;
  released_at: string | null;
  performance_review_at: string | null;
  verified_at: string | null;
  settled_at: string | null;
  non_performance_at: string | null;
  disputed_at: string | null;
  dispute_resolved_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ActivationEventRow {
  id: string;
  activation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ReserveActivationStatus, keyof ActivationRow | null> = {
  activation_issued:  null,
  acknowledged:       'acknowledged_at',
  ramping:            'ramping_at',
  sustaining:         'sustaining_at',
  released:           'released_at',
  performance_review: 'performance_review_at',
  verified:           'verified_at',
  settled:            'settled_at',
  non_performance:    'non_performance_at',
  disputed:           'disputed_at',
  dispute_resolved:   'dispute_resolved_at',
  withdrawn:          'withdrawn_at',
};

function decorate(row: ActivationRow, now: Date) {
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

// settle and settle_penalty BOTH terminate at 'settled', so they SHARE the
// 'reserve_activation.settled' event type — the to_status (and penalty_zar)
// distinguishes a clean settlement from a non-performance penalty settlement.
function eventTypeFor(action: ReserveActivationAction): string {
  switch (action) {
    case 'acknowledge':          return 'reserve_activation.acknowledged';
    case 'begin_ramp':           return 'reserve_activation.ramping';
    case 'confirm_sustaining':   return 'reserve_activation.sustaining';
    case 'release_instruction':  return 'reserve_activation.released';
    case 'open_review':          return 'reserve_activation.performance_review';
    case 'verify_performance':   return 'reserve_activation.verified';
    case 'settle':               return 'reserve_activation.settled';
    case 'settle_penalty':       return 'reserve_activation.settled';
    case 'flag_non_performance': return 'reserve_activation.non_performance';
    case 'raise_dispute':        return 'reserve_activation.disputed';
    case 'resolve_dispute':      return 'reserve_activation.dispute_resolved';
    case 'withdraw_instruction': return 'reserve_activation.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const reserve_tier      = c.req.query('reserve_tier');
  const provider_type     = c.req.query('provider_type');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const provider_party_id = c.req.query('provider_party_id');
  const reportable        = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_reserve_activations WHERE 1=1';
  const binds: unknown[] = [];
  if (reserve_tier)      { sql += ' AND reserve_tier = ?';      binds.push(reserve_tier); }
  if (provider_type)     { sql += ' AND provider_type = ?';     binds.push(provider_type); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (provider_party_id) { sql += ' AND provider_party_id = ?'; binds.push(provider_party_id); }

  sql += ' ORDER BY datetime(activation_issued_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ActivationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_provider_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.reserve_tier] = (by_tier[i.reserve_tier] || 0) + 1;
    by_provider_type[i.provider_type] = (by_provider_type[i.provider_type] || 0) + 1;
  }

  const CRITICAL = new Set<ReserveTier>(['instantaneous_reserve', 'regulating_reserve']);
  const open_count             = items.filter((i) => !i.is_terminal).length;
  const settled_count          = items.filter((i) => i.chain_status === 'settled').length;
  const non_performance_count  = items.filter((i) => i.chain_status === 'non_performance').length;
  const disputed_count         = items.filter((i) => i.chain_status === 'disputed').length;
  const dispute_resolved_count = items.filter((i) => i.chain_status === 'dispute_resolved').length;
  const withdrawn_count        = items.filter((i) => i.chain_status === 'withdrawn').length;
  const verified_count         = items.filter((i) => i.chain_status === 'verified').length;
  const in_review              = items.filter((i) => i.chain_status === 'performance_review').length;
  const breached_count         = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total       = items.filter((i) => i.is_reportable).length;
  const critical_open          = items.filter((i) => !i.is_terminal && CRITICAL.has(i.reserve_tier)).length;
  const total_instructed_mw            = items.reduce((s, i) => s + (i.instructed_mw || 0), 0);
  const total_delivered_mw             = items.reduce((s, i) => s + (i.delivered_mw || 0), 0);
  const total_availability_payment_zar = items.reduce((s, i) => s + (i.availability_payment_zar || 0), 0);
  const total_utilisation_payment_zar  = items.reduce((s, i) => s + (i.utilisation_payment_zar || 0), 0);
  const total_penalty_zar              = items.reduce((s, i) => s + (i.penalty_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_provider_type,
      open_count,
      settled_count,
      non_performance_count,
      disputed_count,
      dispute_resolved_count,
      withdrawn_count,
      verified_count,
      in_review,
      breached: breached_count,
      reportable_total,
      critical_open,
      total_instructed_mw,
      total_delivered_mw,
      total_availability_payment_zar,
      total_utilisation_payment_zar,
      total_penalty_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_reserve_activations WHERE id = ?').bind(id).first<ActivationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_reserve_activations_events WHERE activation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ActivationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AcknowledgeBody {
  acknowledgement_ref?: string;
  response_basis?: string;
  notes?: string;
}

interface RampBody {
  ramp_ref?: string;
  response_basis?: string;
  notes?: string;
}

interface SustainBody {
  delivery_ref?: string;
  response_basis?: string;
  notes?: string;
}

interface ReleaseBody {
  release_ref?: string;
  notes?: string;
}

interface ReviewBody {
  review_ref?: string;
  delivered_mw?: number;
  actual_response_seconds?: number;
  performance_basis?: string;
  notes?: string;
}

interface VerifyBody {
  verification_ref?: string;
  performance_basis?: string;
  availability_payment_zar?: number;
  utilisation_payment_zar?: number;
  notes?: string;
}

interface SettleBody {
  settlement_ref?: string;
  settlement_basis?: string;
  availability_payment_zar?: number;
  utilisation_payment_zar?: number;
  notes?: string;
}

interface PenaltyBody {
  settlement_ref?: string;
  settlement_basis?: string;
  penalty_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface NonPerformanceBody {
  non_performance_basis?: string;
  penalty_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface DisputeBody {
  dispute_ref?: string;
  dispute_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface ResolveDisputeBody {
  dispute_basis?: string;
  regulator_ref?: string;
  notes?: string;
}

interface WithdrawBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ReserveActivationAction,
  bodyHandler?: (row: ActivationRow, body: Record<string, unknown>) => Partial<ActivationRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isProviderAction(action) ? PROVIDER_WRITE_ROLES : SO_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_reserve_activations WHERE id = ?').bind(id).first<ActivationRow>();
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
  const sla = slaDeadlineFor(to, row.reserve_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.reserve_tier);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A non-performance flag on a security tier or a dispute resolution on a
  // critical tier crosses into the NERSA Grid Code inbox — mark reportable.
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
    `UPDATE oe_reserve_activations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `resact_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_reserve_activations_events (id, activation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'reserve_activation',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_reserve_activations WHERE id = ?').bind(id).first<ActivationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/acknowledge', async (c) => transition(c, 'acknowledge', (_row, body) => {
  const b = body as Partial<AcknowledgeBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.acknowledgement_ref === 'string') out.acknowledgement_ref = b.acknowledgement_ref;
  if (typeof b.response_basis === 'string')      out.response_basis = b.response_basis;
  return out;
}));

app.post('/:id/begin-ramp', async (c) => transition(c, 'begin_ramp', (_row, body) => {
  const b = body as Partial<RampBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.ramp_ref === 'string')       out.ramp_ref = b.ramp_ref;
  if (typeof b.response_basis === 'string') out.response_basis = b.response_basis;
  return out;
}));

app.post('/:id/confirm-sustaining', async (c) => transition(c, 'confirm_sustaining', (_row, body) => {
  const b = body as Partial<SustainBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.delivery_ref === 'string')   out.delivery_ref = b.delivery_ref;
  if (typeof b.response_basis === 'string') out.response_basis = b.response_basis;
  return out;
}));

app.post('/:id/release-instruction', async (c) => transition(c, 'release_instruction', (_row, body) => {
  const b = body as Partial<ReleaseBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.release_ref === 'string') out.release_ref = b.release_ref;
  return out;
}));

app.post('/:id/open-review', async (c) => transition(c, 'open_review', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.review_ref === 'string')              out.review_ref = b.review_ref;
  if (typeof b.delivered_mw === 'number')            out.delivered_mw = b.delivered_mw;
  if (typeof b.actual_response_seconds === 'number') out.actual_response_seconds = b.actual_response_seconds;
  if (typeof b.performance_basis === 'string')       out.performance_basis = b.performance_basis;
  return out;
}));

app.post('/:id/verify-performance', async (c) => transition(c, 'verify_performance', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.verification_ref === 'string')          out.verification_ref = b.verification_ref;
  if (typeof b.performance_basis === 'string')         out.performance_basis = b.performance_basis;
  if (typeof b.availability_payment_zar === 'number')  out.availability_payment_zar = b.availability_payment_zar;
  if (typeof b.utilisation_payment_zar === 'number')   out.utilisation_payment_zar = b.utilisation_payment_zar;
  return out;
}));

app.post('/:id/settle', async (c) => transition(c, 'settle', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.settlement_ref === 'string')           out.settlement_ref = b.settlement_ref;
  if (typeof b.settlement_basis === 'string')         out.settlement_basis = b.settlement_basis;
  if (typeof b.availability_payment_zar === 'number') out.availability_payment_zar = b.availability_payment_zar;
  if (typeof b.utilisation_payment_zar === 'number')  out.utilisation_payment_zar = b.utilisation_payment_zar;
  return out;
}));

app.post('/:id/settle-penalty', async (c) => transition(c, 'settle_penalty', (_row, body) => {
  const b = body as Partial<PenaltyBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.settlement_ref === 'string')   out.settlement_ref = b.settlement_ref;
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.penalty_zar === 'number')      out.penalty_zar = b.penalty_zar;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/flag-non-performance', async (c) => transition(c, 'flag_non_performance', (_row, body) => {
  const b = body as Partial<NonPerformanceBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.non_performance_basis === 'string') out.non_performance_basis = b.non_performance_basis;
  if (typeof b.penalty_zar === 'number')           out.penalty_zar = b.penalty_zar;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<ActivationRow> = { dispute_round: (row.dispute_round || 0) + 1 };
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw-instruction', async (c) => transition(c, 'withdraw_instruction', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ActivationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function reserveActivationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_reserve_activations
     WHERE chain_status NOT IN ('settled','dispute_resolved','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ActivationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_reserve_activations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `resact_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_reserve_activations_events (id, activation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'reserve_activation.sla_breached',
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
        event: 'reserve_activation.sla_breached',
        actor_id: 'system',
        entity_type: 'reserve_activation',
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
