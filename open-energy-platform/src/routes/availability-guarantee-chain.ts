// ═══════════════════════════════════════════════════════════════════════════
// Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages chain
//
// Mounted at /api/availability-guarantee/chain.
//
// IEC 61724 / IEC 62446 PV O&M practice + standard REIPPPP O&M service
// agreement availability-guarantee mechanics. 12-state P6 lifecycle for the
// per-reporting-period reconciliation of contracted plant availability against
// the O&M contractor's guaranteed availability.
//
// The asset-management / availability counterpart to W24 (energy
// performance-ratio underperformance) — availability is time-based uptime,
// PR is energy-based yield; distinct contractual metrics.
//
// Forward path:
//   period_open → measurement_submitted → adjustment_review → reconciled →
//   meets_guarantee → settled
// Shortfall:  flag_shortfall (reconciled) → shortfall_flagged → assess_ld →
//   ld_assessed → settle → settled (optional cure: ld_assessed → cure_period
//   → settled; waive_ld too)
// Dispute:    raise_dispute (shortfall_flagged|ld_assessed|cure_period)
//   → disputed → resolve_dispute → dispute_resolved
// Early exit: withdraw (period_open|measurement_submitted|adjustment_review)
//   → withdrawn
//
// URGENT SLA — the LARGER the shortfall, the TIGHTER the response window.
// Reportability:
//   - flag_shortfall crosses for CRITICAL tiers (severe / critical).
//   - resolve_dispute crosses for CRITICAL tiers.
//   - sla_breached crosses for CRITICAL tiers only.
//
// Single-party write: there is no O&M-contractor login — the Esums O&M
// operators record every party's action; the contractual party is captured
// separately via actor_party (asset_owner / om_contractor) derived from action.
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
  type AvailabilityGuaranteeStatus,
  type AvailabilityGuaranteeAction,
  type AvailabilityShortfallTier,
} from '../utils/availability-guarantee-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'lender', 'offtaker',
]);

// Single-party write: no dedicated O&M-contractor login — the Esums O&M
// operators record every party's action; the contractual party is captured
// separately via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface GuaranteeRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  contractor_party_id: string;
  contractor_party_name: string;
  site_id: string | null;
  site_name: string;
  site_province: string | null;
  technology: string;
  capacity_mw: number | null;
  contract_ref: string | null;
  reporting_period: string;
  period_start: string | null;
  period_end: string | null;
  guaranteed_availability_pct: number;
  bonus_threshold_pct: number | null;
  measured_availability_pct: number | null;
  excused_downtime_hours: number | null;
  adjusted_availability_pct: number | null;
  shortfall_pp: number | null;
  shortfall_tier: AvailabilityShortfallTier;
  ld_rate_zar_per_pp: number | null;
  ld_cap_zar: number | null;
  ld_assessed_zar: number | null;
  bonus_zar: number | null;
  settlement_zar: number | null;
  measurement_ref: string | null;
  adjustment_ref: string | null;
  reconciliation_ref: string | null;
  ld_assessment_ref: string | null;
  cure_plan_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  measurement_basis: string | null;
  adjustment_basis: string | null;
  shortfall_basis: string | null;
  ld_basis: string | null;
  cure_plan: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: AvailabilityGuaranteeStatus;
  period_open_at: string;
  measurement_submitted_at: string | null;
  adjustment_review_at: string | null;
  reconciled_at: string | null;
  meets_guarantee_at: string | null;
  shortfall_flagged_at: string | null;
  ld_assessed_at: string | null;
  cure_period_at: string | null;
  settled_at: string | null;
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

interface GuaranteeEventRow {
  id: string;
  guarantee_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<AvailabilityGuaranteeStatus, keyof GuaranteeRow | null> = {
  period_open:           null,
  measurement_submitted: 'measurement_submitted_at',
  adjustment_review:     'adjustment_review_at',
  reconciled:            'reconciled_at',
  meets_guarantee:       'meets_guarantee_at',
  shortfall_flagged:     'shortfall_flagged_at',
  ld_assessed:           'ld_assessed_at',
  cure_period:           'cure_period_at',
  settled:               'settled_at',
  disputed:              'disputed_at',
  dispute_resolved:      'dispute_resolved_at',
  withdrawn:             'withdrawn_at',
};

function decorate(row: GuaranteeRow, now: Date) {
  const tier = row.shortfall_tier;
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

// settle and waive_ld BOTH terminate at 'settled', so they SHARE the
// 'availability_guarantee.settled' event type — the settlement_zar / ld_assessed_zar
// distinguish an LD settlement, a bonus settlement, and a waiver.
function eventTypeFor(action: AvailabilityGuaranteeAction): string {
  switch (action) {
    case 'submit_measurement':      return 'availability_guarantee.measurement_submitted';
    case 'open_adjustment_review':  return 'availability_guarantee.adjustment_review';
    case 'reconcile':               return 'availability_guarantee.reconciled';
    case 'confirm_meets_guarantee': return 'availability_guarantee.meets_guarantee';
    case 'flag_shortfall':          return 'availability_guarantee.shortfall_flagged';
    case 'assess_ld':               return 'availability_guarantee.ld_assessed';
    case 'agree_cure_plan':         return 'availability_guarantee.cure_period';
    case 'settle':                  return 'availability_guarantee.settled';
    case 'waive_ld':                return 'availability_guarantee.settled';
    case 'raise_dispute':           return 'availability_guarantee.disputed';
    case 'resolve_dispute':         return 'availability_guarantee.dispute_resolved';
    case 'withdraw':                return 'availability_guarantee.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const shortfall_tier      = c.req.query('shortfall_tier');
  const technology          = c.req.query('technology');
  const status              = c.req.query('status');
  const breached            = c.req.query('breached');
  const contractor_party_id = c.req.query('contractor_party_id');
  const reportable          = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_availability_guarantees WHERE 1=1';
  const binds: unknown[] = [];
  if (shortfall_tier)      { sql += ' AND shortfall_tier = ?';      binds.push(shortfall_tier); }
  if (technology)          { sql += ' AND technology = ?';          binds.push(technology); }
  if (status)              { sql += ' AND chain_status = ?';        binds.push(status); }
  if (contractor_party_id) { sql += ' AND contractor_party_id = ?'; binds.push(contractor_party_id); }

  sql += ' ORDER BY datetime(period_open_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<GuaranteeRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_technology: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.shortfall_tier] = (by_tier[i.shortfall_tier] || 0) + 1;
    by_technology[i.technology] = (by_technology[i.technology] || 0) + 1;
  }

  const CRITICAL = new Set<AvailabilityShortfallTier>(['severe_shortfall', 'critical_shortfall']);
  const open_count             = items.filter((i) => !i.is_terminal).length;
  const settled_count          = items.filter((i) => i.chain_status === 'settled').length;
  const meets_guarantee_count  = items.filter((i) => i.chain_status === 'meets_guarantee').length;
  const shortfall_count        = items.filter((i) => i.chain_status === 'shortfall_flagged').length;
  const ld_assessed_count      = items.filter((i) => i.chain_status === 'ld_assessed').length;
  const cure_count             = items.filter((i) => i.chain_status === 'cure_period').length;
  const disputed_count         = items.filter((i) => i.chain_status === 'disputed').length;
  const dispute_resolved_count = items.filter((i) => i.chain_status === 'dispute_resolved').length;
  const withdrawn_count        = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count         = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total       = items.filter((i) => i.is_reportable).length;
  const critical_open          = items.filter((i) => !i.is_terminal && CRITICAL.has(i.shortfall_tier)).length;
  const total_capacity_mw      = items.reduce((s, i) => s + (i.capacity_mw || 0), 0);
  const total_ld_assessed_zar  = items.reduce((s, i) => s + (i.ld_assessed_zar || 0), 0);
  const total_bonus_zar        = items.reduce((s, i) => s + (i.bonus_zar || 0), 0);
  const total_settlement_zar   = items.reduce((s, i) => s + (i.settlement_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_technology,
      open_count,
      settled_count,
      meets_guarantee_count,
      shortfall_count,
      ld_assessed_count,
      cure_count,
      disputed_count,
      dispute_resolved_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      critical_open,
      total_capacity_mw,
      total_ld_assessed_zar,
      total_bonus_zar,
      total_settlement_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_availability_guarantees WHERE id = ?').bind(id).first<GuaranteeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_availability_guarantee_events WHERE guarantee_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<GuaranteeEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface MeasurementBody {
  measurement_ref?: string;
  measured_availability_pct?: number;
  excused_downtime_hours?: number;
  measurement_basis?: string;
  notes?: string;
}

interface AdjustmentBody {
  adjustment_ref?: string;
  excused_downtime_hours?: number;
  adjusted_availability_pct?: number;
  adjustment_basis?: string;
  notes?: string;
}

interface ReconcileBody {
  reconciliation_ref?: string;
  adjusted_availability_pct?: number;
  shortfall_pp?: number;
  notes?: string;
}

interface MeetsBody {
  bonus_zar?: number;
  settlement_basis?: string;
  notes?: string;
}

interface ShortfallBody {
  shortfall_pp?: number;
  shortfall_tier?: AvailabilityShortfallTier;
  shortfall_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface AssessLdBody {
  ld_assessment_ref?: string;
  ld_assessed_zar?: number;
  ld_basis?: string;
  notes?: string;
}

interface CureBody {
  cure_plan_ref?: string;
  cure_plan?: string;
  notes?: string;
}

interface SettleBody {
  settlement_ref?: string;
  settlement_basis?: string;
  settlement_zar?: number;
  bonus_zar?: number;
  notes?: string;
}

interface WaiveBody {
  settlement_ref?: string;
  settlement_basis?: string;
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
  settlement_zar?: number;
  regulator_ref?: string;
  notes?: string;
}

interface WithdrawBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: AvailabilityGuaranteeAction,
  bodyHandler?: (row: GuaranteeRow, body: Record<string, unknown>) => Partial<GuaranteeRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_availability_guarantees WHERE id = ?').bind(id).first<GuaranteeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The tier may be updated by flag_shortfall; resolve the effective tier for
  // the SLA deadline + regulator crossing from the override if present.
  const effectiveTier = (overrides.shortfall_tier as AvailabilityShortfallTier) ?? row.shortfall_tier;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier);
  // flag_shortfall on a critical tier or a dispute resolution on a critical
  // tier crosses into the regulator inbox — mark reportable.
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
    `UPDATE oe_availability_guarantees SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `availg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_availability_guarantee_events (id, guarantee_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'availability_guarantee',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      shortfall_tier: effectiveTier,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_availability_guarantees WHERE id = ?').bind(id).first<GuaranteeRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit-measurement', async (c) => transition(c, 'submit_measurement', (_row, body) => {
  const b = body as Partial<MeasurementBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.measurement_ref === 'string')           out.measurement_ref = b.measurement_ref;
  if (typeof b.measured_availability_pct === 'number') out.measured_availability_pct = b.measured_availability_pct;
  if (typeof b.excused_downtime_hours === 'number')    out.excused_downtime_hours = b.excused_downtime_hours;
  if (typeof b.measurement_basis === 'string')         out.measurement_basis = b.measurement_basis;
  return out;
}));

app.post('/:id/open-adjustment-review', async (c) => transition(c, 'open_adjustment_review', (_row, body) => {
  const b = body as Partial<AdjustmentBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.adjustment_ref === 'string')             out.adjustment_ref = b.adjustment_ref;
  if (typeof b.excused_downtime_hours === 'number')     out.excused_downtime_hours = b.excused_downtime_hours;
  if (typeof b.adjusted_availability_pct === 'number')  out.adjusted_availability_pct = b.adjusted_availability_pct;
  if (typeof b.adjustment_basis === 'string')           out.adjustment_basis = b.adjustment_basis;
  return out;
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.reconciliation_ref === 'string')        out.reconciliation_ref = b.reconciliation_ref;
  if (typeof b.adjusted_availability_pct === 'number') out.adjusted_availability_pct = b.adjusted_availability_pct;
  if (typeof b.shortfall_pp === 'number')              out.shortfall_pp = b.shortfall_pp;
  return out;
}));

app.post('/:id/confirm-meets-guarantee', async (c) => transition(c, 'confirm_meets_guarantee', (_row, body) => {
  const b = body as Partial<MeetsBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.bonus_zar === 'number')         out.bonus_zar = b.bonus_zar;
  if (typeof b.settlement_basis === 'string')  out.settlement_basis = b.settlement_basis;
  return out;
}));

app.post('/:id/flag-shortfall', async (c) => transition(c, 'flag_shortfall', (_row, body) => {
  const b = body as Partial<ShortfallBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.shortfall_pp === 'number')    out.shortfall_pp = b.shortfall_pp;
  if (typeof b.shortfall_tier === 'string')  out.shortfall_tier = b.shortfall_tier;
  if (typeof b.shortfall_basis === 'string') out.shortfall_basis = b.shortfall_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/assess-ld', async (c) => transition(c, 'assess_ld', (_row, body) => {
  const b = body as Partial<AssessLdBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.ld_assessment_ref === 'string') out.ld_assessment_ref = b.ld_assessment_ref;
  if (typeof b.ld_assessed_zar === 'number')   out.ld_assessed_zar = b.ld_assessed_zar;
  if (typeof b.ld_basis === 'string')          out.ld_basis = b.ld_basis;
  return out;
}));

app.post('/:id/agree-cure-plan', async (c) => transition(c, 'agree_cure_plan', (_row, body) => {
  const b = body as Partial<CureBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.cure_plan_ref === 'string') out.cure_plan_ref = b.cure_plan_ref;
  if (typeof b.cure_plan === 'string')     out.cure_plan = b.cure_plan;
  return out;
}));

app.post('/:id/settle', async (c) => transition(c, 'settle', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.settlement_ref === 'string')   out.settlement_ref = b.settlement_ref;
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.settlement_zar === 'number')   out.settlement_zar = b.settlement_zar;
  if (typeof b.bonus_zar === 'number')        out.bonus_zar = b.bonus_zar;
  return out;
}));

app.post('/:id/waive-ld', async (c) => transition(c, 'waive_ld', (_row, body) => {
  const b = body as Partial<WaiveBody>;
  const out: Partial<GuaranteeRow> = { ld_assessed_zar: 0, settlement_zar: 0 };
  if (typeof b.settlement_ref === 'string')   out.settlement_ref = b.settlement_ref;
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<GuaranteeRow> = { dispute_round: (row.dispute_round || 0) + 1 };
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.settlement_zar === 'number') out.settlement_zar = b.settlement_zar;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<GuaranteeRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function availabilityGuaranteeSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_availability_guarantees
     WHERE chain_status NOT IN ('settled','dispute_resolved','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<GuaranteeRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_availability_guarantees
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `availg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_availability_guarantee_events (id, guarantee_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'availability_guarantee.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.shortfall_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.shortfall_tier)) {
      await fireCascade({
        event: 'availability_guarantee.sla_breached',
        actor_id: 'system',
        entity_type: 'availability_guarantee',
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
