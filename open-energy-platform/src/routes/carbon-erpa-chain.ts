// ═══════════════════════════════════════════════════════════════════════════
// Wave 65 — Carbon ERPA (Emission Reduction Purchase Agreement) Forward Delivery
// & Make-Good chain (P6)
//
// Mounted at /api/carbon-erpa/chain.
//
// The commercial FORWARD-SALE contract sitting on top of the carbon-credit
// lifecycle. A buyer contracts today to purchase a contracted volume of a
// project's future emission reductions; the seller (project developer) must
// DELIVER that volume against a delivery schedule. A short delivery triggers a
// MAKE-GOOD obligation (re-deliver replacement reductions, or settle the gap).
// Where W37 registers a project, W11 verifies each monitoring period, W56
// re-validates the crediting period, W17 retires the credit and W48 monetises
// the tax offset, THIS chain governs how reductions are SOLD FORWARD and
// physically delivered against a binding purchase agreement.
//
//   erpa_drafted → erpa_executed → delivery_scheduled → delivery_initiated
//     → delivery_verified → settled → completed              (clean delivery)
//   shortfall/make-good: delivery_initiated → shortfall_flagged → make_good_pending
//     → (initiate_delivery) → delivery_initiated → …          (re-deliver)
//     shortfall_flagged | make_good_pending → settled          (settle the gap)
//   dispute:  delivery_verified | settled → disputed → (resolve_dispute) → settled
//   terminate: executed/active state → terminated
//   withdraw:  erpa_drafted | erpa_executed → withdrawn
//
// Tiers (5) by CONTRACTED VOLUME (tCO2e): minor <10k / moderate <100k /
// material <500k / major <2m / mega ≥2m. INVERTED SLA — bigger forward sale gets
// the LONGER window at every active stage (same flavour as W56 / W48).
//
// Single carbon-fund desk write {admin, carbon_fund}. actor_party tags the
// functional party (seller / buyer / registry) for audit attribution only.
//
// Reportability — the W65 SIGNATURE is CORRESPONDING-ADJUSTMENT driven:
//   verify_delivery crosses for EVERY tier when transfer_type = 'article6' (an
//     ITMO needing an NDC corresponding adjustment at delivery); else only for
//     the large tiers (major + mega).
//   terminate + sla_breached cross for the large tiers (major + mega).
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
  requiresCorrespondingAdjustment,
  partyForAction,
  tierForContractedVolume,
  SLA_MINUTES,
  type ErpaStatus,
  type ErpaAction,
  type ErpaTier,
  type ErpaTransferType,
} from '../utils/carbon-erpa-spec';

const READ_ROLES = new Set([
  'admin',
  'regulator',
  'carbon_fund', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

// Single carbon-fund desk write — the desk records the whole ERPA lifecycle.
// actor_party tags the contractual function (seller / buyer / registry) per action.
const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ErpaRow {
  id: string;
  erpa_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string;
  registry_standard: 'verra_vcs' | 'gold_standard' | 'article_6_4' | 'cdm';
  methodology_id: string | null;
  seller_party_id: string;
  seller_party_name: string;
  buyer_party_id: string;
  buyer_party_name: string;
  transfer_type: ErpaTransferType;
  volume_tier: ErpaTier;
  contracted_volume_tco2e: number | null;
  delivered_volume_tco2e: number | null;
  shortfall_volume_tco2e: number | null;
  price_per_tco2e: number | null;
  contract_currency: string | null;
  contract_value: number | null;
  vintage_year: number | null;
  host_country: string | null;
  corresponding_adjustment_required: number;
  corresponding_adjustment_ref: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  erpa_ref: string | null;
  delivery_ref: string | null;
  verification_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  execution_basis: string | null;
  schedule_basis: string | null;
  delivery_basis: string | null;
  verification_basis: string | null;
  shortfall_basis: string | null;
  make_good_basis: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  termination_basis: string | null;
  reason_code: string | null;
  erpa_summary: string | null;
  chain_status: ErpaStatus;
  drafted_at: string;
  executed_at: string | null;
  delivery_scheduled_at: string | null;
  delivery_initiated_at: string | null;
  delivery_verified_at: string | null;
  shortfall_flagged_at: string | null;
  make_good_pending_at: string | null;
  settled_at: string | null;
  completed_at: string | null;
  disputed_at: string | null;
  terminated_at: string | null;
  withdrawn_at: string | null;
  delivery_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ErpaEventRow {
  id: string;
  erpa_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ErpaStatus, keyof ErpaRow | null> = {
  erpa_drafted:       null,
  erpa_executed:      'executed_at',
  delivery_scheduled: 'delivery_scheduled_at',
  delivery_initiated: 'delivery_initiated_at',
  delivery_verified:  'delivery_verified_at',
  shortfall_flagged:  'shortfall_flagged_at',
  make_good_pending:  'make_good_pending_at',
  settled:            'settled_at',
  completed:          'completed_at',
  disputed:           'disputed_at',
  terminated:         'terminated_at',
  withdrawn:          'withdrawn_at',
};

function requiresCa(row: ErpaRow): boolean {
  return row.corresponding_adjustment_required === 1
    || requiresCorrespondingAdjustment(row.transfer_type);
}

function decorate(row: ErpaRow, now: Date) {
  const tier = row.volume_tier;
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
    requires_ca_flag: requiresCa(row),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// resolve_dispute lands back in settled → shares that event with settle.
function eventTypeFor(action: ErpaAction): string {
  switch (action) {
    case 'execute_erpa':       return 'carbon_erpa.executed';
    case 'schedule_delivery':  return 'carbon_erpa.delivery_scheduled';
    case 'initiate_delivery':  return 'carbon_erpa.delivery_initiated';
    case 'verify_delivery':    return 'carbon_erpa.delivery_verified';
    case 'flag_shortfall':     return 'carbon_erpa.shortfall_flagged';
    case 'initiate_make_good': return 'carbon_erpa.make_good_pending';
    case 'settle':             return 'carbon_erpa.settled';
    case 'complete':           return 'carbon_erpa.completed';
    case 'raise_dispute':      return 'carbon_erpa.disputed';
    case 'resolve_dispute':    return 'carbon_erpa.settled';
    case 'terminate':          return 'carbon_erpa.terminated';
    case 'withdraw':           return 'carbon_erpa.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const volume_tier       = c.req.query('volume_tier');
  const transfer_type     = c.req.query('transfer_type');
  const registry_standard = c.req.query('registry_standard');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_carbon_erpas WHERE 1=1';
  const binds: unknown[] = [];
  if (volume_tier)       { sql += ' AND volume_tier = ?';       binds.push(volume_tier); }
  if (transfer_type)     { sql += ' AND transfer_type = ?';     binds.push(transfer_type); }
  if (registry_standard) { sql += ' AND registry_standard = ?'; binds.push(registry_standard); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }

  sql += ' ORDER BY datetime(drafted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ErpaRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_transfer_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.volume_tier] = (by_tier[i.volume_tier] || 0) + 1;
    by_transfer_type[i.transfer_type] = (by_transfer_type[i.transfer_type] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const completed_count  = items.filter((i) => i.chain_status === 'completed').length;
  const terminated_count = items.filter((i) => i.chain_status === 'terminated').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const in_delivery_count = items.filter((i) =>
    i.chain_status === 'delivery_scheduled'
    || i.chain_status === 'delivery_initiated'
    || i.chain_status === 'delivery_verified').length;
  const shortfall_count  = items.filter((i) => i.chain_status === 'shortfall_flagged').length;
  const make_good_count  = items.filter((i) => i.chain_status === 'make_good_pending').length;
  const disputed_count   = items.filter((i) => i.chain_status === 'disputed').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const ca_required_total = items.filter((i) => i.requires_ca_flag).length;
  const large_open       = items.filter((i) =>
    !i.is_terminal && (i.volume_tier === 'major' || i.volume_tier === 'mega')).length;
  const total_contracted_volume = items.reduce((sum, i) => sum + (i.contracted_volume_tco2e || 0), 0);
  const total_delivered_volume  = items.reduce((sum, i) => sum + (i.delivered_volume_tco2e || 0), 0);
  const total_shortfall_volume  = items.reduce((sum, i) => sum + (i.shortfall_volume_tco2e || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_transfer_type,
      open_count,
      completed_count,
      terminated_count,
      withdrawn_count,
      in_delivery_count,
      shortfall_count,
      make_good_count,
      disputed_count,
      breached: breached_count,
      reportable_total,
      ca_required_total,
      large_open,
      total_contracted_volume,
      total_delivered_volume,
      total_shortfall_volume,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_erpas WHERE id = ?').bind(id).first<ErpaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_carbon_erpas_events WHERE erpa_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ErpaEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ExecuteBody {
  execution_basis?: string;
  erpa_ref?: string;
  contracted_volume_tco2e?: number;
  price_per_tco2e?: number;
  contract_currency?: string;
  vintage_year?: number;
  host_country?: string;
  methodology_id?: string;
  delivery_window_start?: string;
  delivery_window_end?: string;
  notes?: string;
}
interface ScheduleBody {
  schedule_basis?: string;
  delivery_window_start?: string;
  delivery_window_end?: string;
  notes?: string;
}
interface InitiateBody {
  delivery_basis?: string;
  delivery_ref?: string;
  notes?: string;
}
interface VerifyBody {
  verification_basis?: string;
  verification_ref?: string;
  delivered_volume_tco2e?: number;
  corresponding_adjustment_ref?: string;
  notes?: string;
}
interface ShortfallBody {
  shortfall_basis?: string;
  delivered_volume_tco2e?: number;
  shortfall_volume_tco2e?: number;
  reason_code?: string;
  notes?: string;
}
interface MakeGoodBody {
  make_good_basis?: string;
  notes?: string;
}
interface SettleBody {
  settlement_basis?: string;
  settlement_ref?: string;
  erpa_summary?: string;
  notes?: string;
}
interface CompleteBody {
  erpa_summary?: string;
  notes?: string;
}
interface DisputeBody {
  dispute_basis?: string;
  dispute_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ResolveBody {
  dispute_basis?: string;
  settlement_ref?: string;
  notes?: string;
}
interface TerminateBody {
  termination_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ErpaAction,
  bodyHandler?: (row: ErpaRow, body: Record<string, unknown>) => Partial<ErpaRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_erpas WHERE id = ?').bind(id).first<ErpaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived at execution from the declared contracted volume.
  const effectiveTier = (overrides.volume_tier as ErpaTier) || row.volume_tier;
  const effectiveCa = (overrides.corresponding_adjustment_required ?? row.corresponding_adjustment_required) === 1
    || requiresCorrespondingAdjustment(row.transfer_type);

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier, effectiveCa);
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
    `UPDATE oe_carbon_erpas SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `erpa_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_erpas_events (id, erpa_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'carbon_erpa',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      volume_tier: effectiveTier,
      transfer_type: row.transfer_type,
      corresponding_adjustment_required: effectiveCa ? 1 : 0,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_erpas WHERE id = ?').bind(id).first<ErpaRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/execute-erpa', async (c) => transition(c, 'execute_erpa', (_row, body) => {
  const b = body as Partial<ExecuteBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.execution_basis === 'string')       out.execution_basis = b.execution_basis;
  if (typeof b.erpa_ref === 'string')              out.erpa_ref = b.erpa_ref;
  if (typeof b.price_per_tco2e === 'number')       out.price_per_tco2e = b.price_per_tco2e;
  if (typeof b.contract_currency === 'string')     out.contract_currency = b.contract_currency;
  if (typeof b.vintage_year === 'number')          out.vintage_year = b.vintage_year;
  if (typeof b.host_country === 'string')          out.host_country = b.host_country;
  if (typeof b.methodology_id === 'string')        out.methodology_id = b.methodology_id;
  if (typeof b.delivery_window_start === 'string') out.delivery_window_start = b.delivery_window_start;
  if (typeof b.delivery_window_end === 'string')   out.delivery_window_end = b.delivery_window_end;
  if (typeof b.contracted_volume_tco2e === 'number') {
    out.contracted_volume_tco2e = b.contracted_volume_tco2e;
    out.volume_tier = tierForContractedVolume(b.contracted_volume_tco2e);
    if (typeof b.price_per_tco2e === 'number') {
      out.contract_value = b.contracted_volume_tco2e * b.price_per_tco2e;
    }
  }
  return out;
}));

app.post('/:id/schedule-delivery', async (c) => transition(c, 'schedule_delivery', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.schedule_basis === 'string')        out.schedule_basis = b.schedule_basis;
  if (typeof b.delivery_window_start === 'string') out.delivery_window_start = b.delivery_window_start;
  if (typeof b.delivery_window_end === 'string')   out.delivery_window_end = b.delivery_window_end;
  return out;
}));

app.post('/:id/initiate-delivery', async (c) => transition(c, 'initiate_delivery', (row, body) => {
  const b = body as Partial<InitiateBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.delivery_basis === 'string') out.delivery_basis = b.delivery_basis;
  if (typeof b.delivery_ref === 'string')   out.delivery_ref = b.delivery_ref;
  // Re-entry from make_good_pending counts a new delivery round.
  if (row.chain_status === 'make_good_pending') out.delivery_round = (row.delivery_round || 0) + 1;
  return out;
}));

app.post('/:id/verify-delivery', async (c) => transition(c, 'verify_delivery', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.verification_basis === 'string')          out.verification_basis = b.verification_basis;
  if (typeof b.verification_ref === 'string')            out.verification_ref = b.verification_ref;
  if (typeof b.delivered_volume_tco2e === 'number')      out.delivered_volume_tco2e = b.delivered_volume_tco2e;
  if (typeof b.corresponding_adjustment_ref === 'string') out.corresponding_adjustment_ref = b.corresponding_adjustment_ref;
  return out;
}));

app.post('/:id/flag-shortfall', async (c) => transition(c, 'flag_shortfall', (row, body) => {
  const b = body as Partial<ShortfallBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.shortfall_basis === 'string')        out.shortfall_basis = b.shortfall_basis;
  if (typeof b.reason_code === 'string')            out.reason_code = b.reason_code;
  if (typeof b.delivered_volume_tco2e === 'number') out.delivered_volume_tco2e = b.delivered_volume_tco2e;
  if (typeof b.shortfall_volume_tco2e === 'number') {
    out.shortfall_volume_tco2e = b.shortfall_volume_tco2e;
  } else {
    const contracted = row.contracted_volume_tco2e || 0;
    const delivered = (typeof b.delivered_volume_tco2e === 'number')
      ? b.delivered_volume_tco2e
      : (row.delivered_volume_tco2e || 0);
    out.shortfall_volume_tco2e = Math.max(0, contracted - delivered);
  }
  return out;
}));

app.post('/:id/initiate-make-good', async (c) => transition(c, 'initiate_make_good', (_row, body) => {
  const b = body as Partial<MakeGoodBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.make_good_basis === 'string') out.make_good_basis = b.make_good_basis;
  return out;
}));

app.post('/:id/settle', async (c) => transition(c, 'settle', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.settlement_ref === 'string')   out.settlement_ref = b.settlement_ref;
  if (typeof b.erpa_summary === 'string')     out.erpa_summary = b.erpa_summary;
  return out;
}));

app.post('/:id/complete', async (c) => transition(c, 'complete', (_row, body) => {
  const b = body as Partial<CompleteBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.erpa_summary === 'string') out.erpa_summary = b.erpa_summary;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<ErpaRow> = { escalation_level: 1 };
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.dispute_basis === 'string')  out.dispute_basis = b.dispute_basis;
  if (typeof b.settlement_ref === 'string') out.settlement_ref = b.settlement_ref;
  return out;
}));

app.post('/:id/terminate', async (c) => transition(c, 'terminate', (_row, body) => {
  const b = body as Partial<TerminateBody>;
  const out: Partial<ErpaRow> = { escalation_level: 1 };
  if (typeof b.termination_basis === 'string') out.termination_basis = b.termination_basis;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ErpaRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal ERPA past its deadline,
// crossing to the regulator for the large tiers (major + mega).
export async function carbonErpaSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_erpas
     WHERE chain_status NOT IN ('completed','terminated','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ErpaRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_carbon_erpas
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `erpa_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_carbon_erpas_events (id, erpa_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_erpa.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.volume_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.volume_tier)) {
      await fireCascade({
        event: 'carbon_erpa.sla_breached',
        actor_id: 'system',
        entity_type: 'carbon_erpa',
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
