// ═══════════════════════════════════════════════════════════════════════════
// Wave 58 — Grid Connection Capacity Allocation & Queue Management chain
//
// Mounted at /api/grid-capacity/chain.
//
// NERSA Grid Code + the National Transmission Company SA (NTCSA) Interim Grid
// Capacity Allocation and Curtailment Rules (2024). Transmission / distribution
// headroom is the binding constraint on SA energy transition: far more generation
// wants to connect than the network can host. Before a generator can sign a Grid
// Connection Agreement it must SECURE an allocation of scarce grid capacity. A
// developer applies at a chosen connection point; the network operator screens
// completeness, may request more information, runs a network / capacity assessment
// (load-flow, fault-level, stability, headroom), assigns a QUEUE POSITION, then a
// capacity-allocation committee ISSUES AN OFFER, the applicant ACCEPTS (reserving
// the capacity pending milestones), and the operator finally ALLOCATES it firmly —
// which feeds the W28 Grid Connection Agreement (W58 → W28 handoff).
//
// The capacity-rights QUEUE UPSTREAM of the grid lifecycle — the front-end gate to
// physical connection, the way W57 SSEG registration / W49 licensing front-end the
// regulated market.
//
// Forward path:
//   application_received → completeness_screening → capacity_assessment
//     → queue_positioned → offer_issued → capacity_reserved → capacity_allocated
//
// Information-gap loop: completeness_screening → information_requested → completeness_screening
// Rejection:            capacity_assessment|queue_positioned → rejected
// Lapse:                offer_issued|capacity_reserved → lapsed
// Relinquishment:       capacity_reserved → relinquished
// Early withdraw:       pre-reservation states → withdrawn
//
// Tiers: minor / small / medium / large / strategic (by requested capacity MW).
//
// INVERTED SLA — the bigger the requested connection, the MORE time every window
// allows (a transmission-level connection needs a far deeper system-impact study).
// Reportability:
//   - reject_application crosses for EVERY tier (W58 signature — denying grid
//     access is always material in a capacity-constrained grid)
//   - relinquish crosses for large + strategic only
//   - sla_breached crosses for large + strategic
//
// Two-party split write: the applicant files / supplies info / accepts offers /
// relinquishes / withdraws; the network operator drives screening / assessment /
// queueing / lapse, and the allocation committee issues offers / allocates /
// rejects. actor_party (applicant / network / committee) derived from the action.
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
  isApplicantAction,
  partyForAction,
  SLA_MINUTES,
  type GridCapacityStatus,
  type GridCapacityAction,
  type GridCapacityTier,
} from '../utils/grid-capacity-allocation-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'grid_operator', 'regulator',
  'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// Two-party split write. The network operator (and its allocation committee)
// drives the capacity-allocation machinery; the applicant developer files /
// supplies additional information / accepts offers / relinquishes / withdraws.
// An applicant can hold any market-side operating role.
const OPERATOR_WRITE_ROLES = new Set(['admin', 'support', 'grid_operator']);
const APPLICANT_WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface AllocationRow {
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  operator_party_id: string;
  operator_party_name: string;
  capacity_tier: GridCapacityTier;
  connection_type: string;
  technology: string | null;
  network_level: string | null;
  project_name: string;
  project_location: string | null;
  requested_capacity_mw: number;
  granted_capacity_mw: number | null;
  queue_rank: number | null;
  priority_date: string | null;
  substation: string | null;
  supply_area: string | null;
  estimated_capex_zar_m: number | null;
  gca_ref: string | null;
  application_ref: string | null;
  screening_ref: string | null;
  info_request_ref: string | null;
  assessment_ref: string | null;
  queue_ref: string | null;
  offer_ref: string | null;
  reservation_ref: string | null;
  allocation_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  screening_basis: string | null;
  info_request_basis: string | null;
  assessment_basis: string | null;
  queue_basis: string | null;
  offer_basis: string | null;
  reservation_basis: string | null;
  allocation_basis: string | null;
  rejection_basis: string | null;
  relinquish_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  info_request_round: number;
  chain_status: GridCapacityStatus;
  application_received_at: string;
  completeness_screening_at: string | null;
  information_requested_at: string | null;
  capacity_assessment_at: string | null;
  queue_positioned_at: string | null;
  offer_issued_at: string | null;
  capacity_reserved_at: string | null;
  capacity_allocated_at: string | null;
  rejected_at: string | null;
  lapsed_at: string | null;
  relinquished_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
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

const TIMESTAMP_COLUMN: Record<GridCapacityStatus, keyof AllocationRow | null> = {
  application_received:   null,
  completeness_screening: 'completeness_screening_at',
  information_requested:  'information_requested_at',
  capacity_assessment:    'capacity_assessment_at',
  queue_positioned:       'queue_positioned_at',
  offer_issued:           'offer_issued_at',
  capacity_reserved:      'capacity_reserved_at',
  capacity_allocated:     'capacity_allocated_at',
  rejected:               'rejected_at',
  lapsed:                 'lapsed_at',
  relinquished:           'relinquished_at',
  withdrawn:              'withdrawn_at',
};

function decorate(row: AllocationRow, now: Date) {
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
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// submit_info round-trips the application back into completeness_screening, so it
// SHARES the completeness_screening event type — the to_status is what matters.
function eventTypeFor(action: GridCapacityAction): string {
  switch (action) {
    case 'begin_screening':       return 'grid_capacity.completeness_screening';
    case 'request_info':          return 'grid_capacity.information_requested';
    case 'submit_info':           return 'grid_capacity.completeness_screening';
    case 'begin_assessment':      return 'grid_capacity.capacity_assessment';
    case 'assign_queue_position': return 'grid_capacity.queue_positioned';
    case 'issue_offer':           return 'grid_capacity.offer_issued';
    case 'accept_offer':          return 'grid_capacity.capacity_reserved';
    case 'allocate_capacity':     return 'grid_capacity.capacity_allocated';
    case 'reject_application':    return 'grid_capacity.rejected';
    case 'lapse':                 return 'grid_capacity.lapsed';
    case 'relinquish':            return 'grid_capacity.relinquished';
    case 'withdraw':              return 'grid_capacity.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const capacity_tier      = c.req.query('capacity_tier');
  const connection_type    = c.req.query('connection_type');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const applicant_party_id = c.req.query('applicant_party_id');
  const reportable         = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_grid_capacity_allocations WHERE 1=1';
  const binds: unknown[] = [];
  if (capacity_tier)      { sql += ' AND capacity_tier = ?';      binds.push(capacity_tier); }
  if (connection_type)    { sql += ' AND connection_type = ?';    binds.push(connection_type); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (applicant_party_id) { sql += ' AND applicant_party_id = ?'; binds.push(applicant_party_id); }

  sql += ' ORDER BY datetime(application_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<AllocationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_connection_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.capacity_tier] = (by_tier[i.capacity_tier] || 0) + 1;
    by_connection_type[i.connection_type] = (by_connection_type[i.connection_type] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const allocated_count   = items.filter((i) => i.chain_status === 'capacity_allocated').length;
  const rejected_count    = items.filter((i) => i.chain_status === 'rejected').length;
  const relinquished_count= items.filter((i) => i.chain_status === 'relinquished').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const lapsed_count      = items.filter((i) => i.chain_status === 'lapsed').length;
  const in_offer          = items.filter((i) => i.chain_status === 'offer_issued' || i.chain_status === 'capacity_reserved').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) => !i.is_terminal && (i.capacity_tier === 'large' || i.capacity_tier === 'strategic')).length;
  const total_requested_mw   = items.reduce((sum, i) => sum + (i.requested_capacity_mw || 0), 0);
  const allocated_capacity_mw = items
    .filter((i) => i.chain_status === 'capacity_allocated')
    .reduce((sum, i) => sum + (i.granted_capacity_mw || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_connection_type,
      open_count,
      allocated_count,
      rejected_count,
      relinquished_count,
      withdrawn_count,
      lapsed_count,
      in_offer,
      breached: breached_count,
      reportable_total,
      large_open,
      total_requested_mw,
      allocated_capacity_mw,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_grid_capacity_allocations WHERE id = ?').bind(id).first<AllocationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_grid_capacity_allocations_events WHERE allocation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<AllocationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreeningBody { screening_ref?: string; screening_basis?: string; notes?: string; }
interface InfoRequestBody { info_request_ref?: string; info_request_basis?: string; notes?: string; }
interface SubmitInfoBody { notes?: string; }
interface AssessmentBody { assessment_ref?: string; assessment_basis?: string; notes?: string; }
interface QueueBody { queue_ref?: string; queue_basis?: string; queue_rank?: number; priority_date?: string; notes?: string; }
interface OfferBody { offer_ref?: string; offer_basis?: string; granted_capacity_mw?: number; notes?: string; }
interface AcceptBody { reservation_ref?: string; reservation_basis?: string; notes?: string; }
interface AllocateBody { allocation_ref?: string; allocation_basis?: string; gca_ref?: string; granted_capacity_mw?: number; decision_notes?: string; notes?: string; }
interface RejectBody { rejection_basis?: string; reason_code?: string; regulator_ref?: string; decision_notes?: string; notes?: string; }
interface LapseBody { reason_code?: string; decision_notes?: string; notes?: string; }
interface RelinquishBody { relinquish_basis?: string; reason_code?: string; regulator_ref?: string; decision_notes?: string; notes?: string; }
interface WithdrawBody { reason_code?: string; decision_notes?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: GridCapacityAction,
  bodyHandler?: (row: AllocationRow, body: Record<string, unknown>) => Partial<AllocationRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isApplicantAction(action) ? APPLICANT_WRITE_ROLES : OPERATOR_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_grid_capacity_allocations WHERE id = ?').bind(id).first<AllocationRow>();
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

  const crosses = crossesIntoRegulator(action, row.capacity_tier);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A rejection (any tier) or large/strategic relinquishment that crosses into
  // the regulator marks the case reportable onto the grid-access oversight queue.
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
    `UPDATE oe_grid_capacity_allocations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `gcap_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'grid_capacity_allocation',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_grid_capacity_allocations WHERE id = ?').bind(id).first<AllocationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-screening', async (c) => transition(c, 'begin_screening', (_row, body) => {
  const b = body as Partial<ScreeningBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  return out;
}));

app.post('/:id/request-info', async (c) => transition(c, 'request_info', (row, body) => {
  const b = body as Partial<InfoRequestBody>;
  const out: Partial<AllocationRow> = { info_request_round: (row.info_request_round || 0) + 1 };
  if (typeof b.info_request_ref === 'string')   out.info_request_ref = b.info_request_ref;
  if (typeof b.info_request_basis === 'string') out.info_request_basis = b.info_request_basis;
  return out;
}));

app.post('/:id/submit-info', async (c) => transition(c, 'submit_info', (_row, body) => {
  const b = body as Partial<SubmitInfoBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.notes === 'string') out.screening_basis = b.notes;
  return out;
}));

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment', (_row, body) => {
  const b = body as Partial<AssessmentBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.assessment_ref === 'string')   out.assessment_ref = b.assessment_ref;
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  return out;
}));

app.post('/:id/assign-queue-position', async (c) => transition(c, 'assign_queue_position', (_row, body) => {
  const b = body as Partial<QueueBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.queue_ref === 'string')     out.queue_ref = b.queue_ref;
  if (typeof b.queue_basis === 'string')   out.queue_basis = b.queue_basis;
  if (typeof b.queue_rank === 'number')    out.queue_rank = b.queue_rank;
  if (typeof b.priority_date === 'string') out.priority_date = b.priority_date;
  return out;
}));

app.post('/:id/issue-offer', async (c) => transition(c, 'issue_offer', (_row, body) => {
  const b = body as Partial<OfferBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.offer_ref === 'string')             out.offer_ref = b.offer_ref;
  if (typeof b.offer_basis === 'string')           out.offer_basis = b.offer_basis;
  if (typeof b.granted_capacity_mw === 'number')   out.granted_capacity_mw = b.granted_capacity_mw;
  return out;
}));

app.post('/:id/accept-offer', async (c) => transition(c, 'accept_offer', (_row, body) => {
  const b = body as Partial<AcceptBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.reservation_ref === 'string')   out.reservation_ref = b.reservation_ref;
  if (typeof b.reservation_basis === 'string') out.reservation_basis = b.reservation_basis;
  return out;
}));

app.post('/:id/allocate-capacity', async (c) => transition(c, 'allocate_capacity', (_row, body) => {
  const b = body as Partial<AllocateBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.allocation_ref === 'string')      out.allocation_ref = b.allocation_ref;
  if (typeof b.allocation_basis === 'string')    out.allocation_basis = b.allocation_basis;
  if (typeof b.gca_ref === 'string')             out.gca_ref = b.gca_ref;
  if (typeof b.granted_capacity_mw === 'number') out.granted_capacity_mw = b.granted_capacity_mw;
  if (typeof b.decision_notes === 'string')      out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/reject-application', async (c) => transition(c, 'reject_application', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  if (typeof b.decision_notes === 'string')  out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/lapse', async (c) => transition(c, 'lapse', (_row, body) => {
  const b = body as Partial<LapseBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string') out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/relinquish', async (c) => transition(c, 'relinquish', (_row, body) => {
  const b = body as Partial<RelinquishBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.relinquish_basis === 'string') out.relinquish_basis = b.relinquish_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')    out.regulator_ref = b.regulator_ref;
  if (typeof b.decision_notes === 'string')   out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<AllocationRow> = {};
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string') out.decision_notes = b.decision_notes;
  return out;
}));

export async function gridCapacitySlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_grid_capacity_allocations
     WHERE chain_status NOT IN ('capacity_allocated','rejected','lapsed','relinquished','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<AllocationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_grid_capacity_allocations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `gcap_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_grid_capacity_allocations_events (id, allocation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'grid_capacity.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.capacity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.capacity_tier)) {
      await fireCascade({
        event: 'grid_capacity.sla_breached',
        actor_id: 'system',
        entity_type: 'grid_capacity_allocation',
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
