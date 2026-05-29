// ═══════════════════════════════════════════════════════════════════════════
// Wave 68 — Counterparty Margin Call & Default Management chain (P6)
//
// Mounted at /api/counterparty-margin/chain.
//
// The clearing / risk desk of a best-in-class trading venue manages the
// COUNTERPARTY CREDIT and COLLATERAL relationship for every participant with an
// open position, per the Financial Markets Act 19/2012 (clearing houses / CCPs),
// the FSCA Conduct Standards and the CPMI-IOSCO PFMI (Principles 4 credit, 5
// collateral, 6 margin, 13 participant-default rules). See
// src/utils/counterparty-margin-spec.ts for the full state-machine, tiering and
// reportability rationale.
//
//   limit_active → exposure_warning → margin_call_issued → collateral_received
//     → (cure_breach) → limit_active
//   restriction:  {exposure_warning, margin_call_issued} → position_restriction
//   cure_period:  {margin_call_issued, position_restriction} → cure_period
//   waterfall:    {cure_period, position_restriction} → default_declared → close_out
//                   → default_fund_draw → recovered | written_off
//                 close_out → recovered | written_off (collateral sufficient)
//   withdrawn:    {exposure_warning, margin_call_issued} → withdrawn
//
// Single write: the clearing house / risk desk (trader role) drives every step;
// the member posts collateral out-of-band. partyForAction records whether a step
// represents the clearing house or the member, for the audit trail only.
//
// Reportability (the W68 signature, DEFAULT-driven): declare_default crosses for
// EVERY tier; draw_default_fund, write_off and SLA breaches cross for the high
// tiers (major + systemic).
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
  tierForExposure,
  SLA_MINUTES,
  type MarginStatus,
  type MarginAction,
  type MarginTier,
} from '../utils/counterparty-margin-spec';

// All nine personas may read the counterparty-margin register.
const READ_ROLES = new Set([
  'admin',
  'trader', 'regulator', 'grid_operator', 'ipp_developer', 'carbon_fund', 'offtaker', 'lender', 'support',
]);

// Single write: the clearing house / risk desk drives every step. The member
// posts collateral out-of-band — it is not a platform write role.
const WRITE_ROLES = new Set(['admin', 'trader']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface MarginRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  counterparty_id: string;
  counterparty_name: string;
  member_code: string | null;
  account_type: 'house' | 'client' | 'omnibus' | null;
  systemically_important: number;
  product_class: string | null;
  exposure_zar: number | null;
  collateral_held_zar: number | null;
  margin_call_zar: number | null;
  collateral_posted_zar: number | null;
  shortfall_zar: number | null;
  default_fund_draw_zar: number | null;
  recovery_zar: number | null;
  write_off_zar: number | null;
  utilisation_pct: number | null;
  severity_tier: MarginTier;
  clearing_party_id: string | null;
  clearing_party_name: string | null;
  member_party_id: string | null;
  member_party_name: string | null;
  warning_ref: string | null;
  margin_call_ref: string | null;
  collateral_ref: string | null;
  restriction_ref: string | null;
  cure_ref: string | null;
  default_ref: string | null;
  close_out_ref: string | null;
  default_fund_ref: string | null;
  warning_basis: string | null;
  margin_call_basis: string | null;
  collateral_basis: string | null;
  restriction_basis: string | null;
  cure_basis: string | null;
  default_basis: string | null;
  close_out_basis: string | null;
  default_fund_basis: string | null;
  recovery_basis: string | null;
  write_off_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: MarginStatus;
  limit_active_at: string;
  exposure_warning_at: string | null;
  margin_call_issued_at: string | null;
  collateral_received_at: string | null;
  position_restriction_at: string | null;
  cure_period_at: string | null;
  default_declared_at: string | null;
  close_out_at: string | null;
  default_fund_draw_at: string | null;
  recovered_at: string | null;
  written_off_at: string | null;
  withdrawn_at: string | null;
  cure_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface MarginEventRow {
  id: string;
  margin_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<MarginStatus, keyof MarginRow | null> = {
  limit_active:         'limit_active_at',
  exposure_warning:     'exposure_warning_at',
  margin_call_issued:   'margin_call_issued_at',
  collateral_received:  'collateral_received_at',
  position_restriction: 'position_restriction_at',
  cure_period:          'cure_period_at',
  default_declared:     'default_declared_at',
  close_out:            'close_out_at',
  default_fund_draw:    'default_fund_draw_at',
  recovered:            'recovered_at',
  written_off:          'written_off_at',
  withdrawn:            'withdrawn_at',
};

function decorate(row: MarginRow, now: Date) {
  const tier = row.severity_tier;
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

function eventTypeFor(action: MarginAction): string {
  switch (action) {
    case 'issue_warning':      return 'counterparty_margin.exposure_warning';
    case 'issue_margin_call':  return 'counterparty_margin.margin_call_issued';
    case 'record_collateral':  return 'counterparty_margin.collateral_received';
    case 'cure_breach':        return 'counterparty_margin.limit_active';
    case 'restrict_positions': return 'counterparty_margin.position_restriction';
    case 'open_cure_period':   return 'counterparty_margin.cure_period';
    case 'declare_default':    return 'counterparty_margin.default_declared';
    case 'begin_close_out':    return 'counterparty_margin.close_out';
    case 'draw_default_fund':  return 'counterparty_margin.default_fund_draw';
    case 'record_recovery':    return 'counterparty_margin.recovered';
    case 'write_off':          return 'counterparty_margin.written_off';
    case 'withdraw':           return 'counterparty_margin.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const severity_tier = c.req.query('severity_tier');
  const product_class = c.req.query('product_class');
  const account_type  = c.req.query('account_type');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_counterparty_margin WHERE 1=1';
  const binds: unknown[] = [];
  if (severity_tier) { sql += ' AND severity_tier = ?'; binds.push(severity_tier); }
  if (product_class) { sql += ' AND product_class = ?'; binds.push(product_class); }
  if (account_type)  { sql += ' AND account_type = ?';  binds.push(account_type); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }

  sql += ' ORDER BY datetime(limit_active_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<MarginRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_product_class: Record<string, number> = {};
  const by_account_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
    if (i.product_class) by_product_class[i.product_class] = (by_product_class[i.product_class] || 0) + 1;
    if (i.account_type) by_account_type[i.account_type] = (by_account_type[i.account_type] || 0) + 1;
  }

  const active_count       = items.filter((i) => i.chain_status === 'limit_active').length;
  const open_count         = items.filter((i) => !i.is_terminal).length;
  const default_count      = items.filter((i) => i.chain_status === 'default_declared').length;
  const close_out_count    = items.filter((i) => i.chain_status === 'close_out').length;
  const fund_draw_count    = items.filter((i) => i.chain_status === 'default_fund_draw').length;
  const recovered_count    = items.filter((i) => i.chain_status === 'recovered').length;
  const written_off_count  = items.filter((i) => i.chain_status === 'written_off').length;
  const withdrawn_count    = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count     = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable).length;
  const high_open          = items.filter((i) =>
    !i.is_terminal && (i.severity_tier === 'major' || i.severity_tier === 'systemic')).length;
  const total_exposure_zar = items.reduce((sum, i) => sum + (i.exposure_zar || 0), 0);
  const total_fund_draw_zar = items.reduce((sum, i) => sum + (i.default_fund_draw_zar || 0), 0);
  const total_write_off_zar = items.reduce((sum, i) => sum + (i.write_off_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_product_class,
      by_account_type,
      active_count,
      open_count,
      default_count,
      close_out_count,
      fund_draw_count,
      recovered_count,
      written_off_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      high_open,
      total_exposure_zar,
      total_fund_draw_zar,
      total_write_off_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_counterparty_margin WHERE id = ?').bind(id).first<MarginRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_counterparty_margin_events WHERE margin_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<MarginEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface WarningBody {
  warning_basis?: string;
  warning_ref?: string;
  exposure_zar?: number;
  collateral_held_zar?: number;
  utilisation_pct?: number;
  product_class?: string;
  systemically_important?: boolean;
  notes?: string;
}
interface MarginCallBody {
  margin_call_basis?: string;
  margin_call_ref?: string;
  margin_call_zar?: number;
  notes?: string;
}
interface CollateralBody {
  collateral_basis?: string;
  collateral_ref?: string;
  collateral_posted_zar?: number;
  notes?: string;
}
interface CureBreachBody {
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}
interface RestrictionBody {
  restriction_basis?: string;
  restriction_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface CurePeriodBody {
  cure_basis?: string;
  cure_ref?: string;
  notes?: string;
}
interface DefaultBody {
  default_basis?: string;
  default_ref?: string;
  reason_code?: string;
  shortfall_zar?: number;
  notes?: string;
}
interface CloseOutBody {
  close_out_basis?: string;
  close_out_ref?: string;
  shortfall_zar?: number;
  notes?: string;
}
interface FundDrawBody {
  default_fund_basis?: string;
  default_fund_ref?: string;
  default_fund_draw_zar?: number;
  notes?: string;
}
interface RecoveryBody {
  recovery_basis?: string;
  recovery_zar?: number;
  resolution_summary?: string;
  notes?: string;
}
interface WriteOffBody {
  write_off_basis?: string;
  write_off_zar?: number;
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: MarginAction,
  bodyHandler?: (row: MarginRow, body: Record<string, unknown>) => Partial<MarginRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_counterparty_margin WHERE id = ?').bind(id).first<MarginRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived when the warning restates the exposure-at-risk or the
  // systemic-importance flag; otherwise the row's recorded severity stands.
  const effectiveExposure = (overrides.exposure_zar ?? row.exposure_zar) ?? 0;
  const effectiveSifi = (overrides.systemically_important ?? row.systemically_important) ? true : false;
  let effectiveTier: MarginTier = row.severity_tier;
  if (overrides.exposure_zar != null || overrides.systemically_important != null) {
    effectiveTier = tierForExposure(effectiveExposure, effectiveSifi);
    overrides.severity_tier = effectiveTier;
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
    `UPDATE oe_counterparty_margin SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ccm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_counterparty_margin_events (id, margin_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'counterparty_margin',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      severity_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_counterparty_margin WHERE id = ?').bind(id).first<MarginRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/issue-warning', async (c) => transition(c, 'issue_warning', (_row, body) => {
  const b = body as Partial<WarningBody>;
  const out: Partial<MarginRow> = {};
  if (typeof b.warning_basis === 'string')         out.warning_basis = b.warning_basis;
  if (typeof b.warning_ref === 'string')           out.warning_ref = b.warning_ref;
  if (typeof b.exposure_zar === 'number')          out.exposure_zar = b.exposure_zar;
  if (typeof b.collateral_held_zar === 'number')   out.collateral_held_zar = b.collateral_held_zar;
  if (typeof b.utilisation_pct === 'number')       out.utilisation_pct = b.utilisation_pct;
  if (typeof b.product_class === 'string')         out.product_class = b.product_class;
  if (typeof b.systemically_important === 'boolean') out.systemically_important = b.systemically_important ? 1 : 0;
  return out;
}));

app.post('/:id/issue-margin-call', async (c) => transition(c, 'issue_margin_call', (_row, body) => {
  const b = body as Partial<MarginCallBody>;
  const out: Partial<MarginRow> = {};
  if (typeof b.margin_call_basis === 'string') out.margin_call_basis = b.margin_call_basis;
  if (typeof b.margin_call_ref === 'string')   out.margin_call_ref = b.margin_call_ref;
  if (typeof b.margin_call_zar === 'number')   out.margin_call_zar = b.margin_call_zar;
  return out;
}));

app.post('/:id/record-collateral', async (c) => transition(c, 'record_collateral', (_row, body) => {
  const b = body as Partial<CollateralBody>;
  const out: Partial<MarginRow> = {};
  if (typeof b.collateral_basis === 'string')      out.collateral_basis = b.collateral_basis;
  if (typeof b.collateral_ref === 'string')        out.collateral_ref = b.collateral_ref;
  if (typeof b.collateral_posted_zar === 'number') out.collateral_posted_zar = b.collateral_posted_zar;
  return out;
}));

app.post('/:id/cure-breach', async (c) => transition(c, 'cure_breach', (row, body) => {
  const b = body as Partial<CureBreachBody>;
  const out: Partial<MarginRow> = { cure_round: (row.cure_round || 0) + 1, escalation_level: 0 };
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string')  out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/restrict-positions', async (c) => transition(c, 'restrict_positions', (_row, body) => {
  const b = body as Partial<RestrictionBody>;
  const out: Partial<MarginRow> = { escalation_level: 1 };
  if (typeof b.restriction_basis === 'string') out.restriction_basis = b.restriction_basis;
  if (typeof b.restriction_ref === 'string')   out.restriction_ref = b.restriction_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/open-cure-period', async (c) => transition(c, 'open_cure_period', (_row, body) => {
  const b = body as Partial<CurePeriodBody>;
  const out: Partial<MarginRow> = { escalation_level: 1 };
  if (typeof b.cure_basis === 'string') out.cure_basis = b.cure_basis;
  if (typeof b.cure_ref === 'string')   out.cure_ref = b.cure_ref;
  return out;
}));

app.post('/:id/declare-default', async (c) => transition(c, 'declare_default', (_row, body) => {
  const b = body as Partial<DefaultBody>;
  const out: Partial<MarginRow> = { escalation_level: 2 };
  if (typeof b.default_basis === 'string') out.default_basis = b.default_basis;
  if (typeof b.default_ref === 'string')   out.default_ref = b.default_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.shortfall_zar === 'number') out.shortfall_zar = b.shortfall_zar;
  return out;
}));

app.post('/:id/begin-close-out', async (c) => transition(c, 'begin_close_out', (_row, body) => {
  const b = body as Partial<CloseOutBody>;
  const out: Partial<MarginRow> = { escalation_level: 2 };
  if (typeof b.close_out_basis === 'string') out.close_out_basis = b.close_out_basis;
  if (typeof b.close_out_ref === 'string')   out.close_out_ref = b.close_out_ref;
  if (typeof b.shortfall_zar === 'number')   out.shortfall_zar = b.shortfall_zar;
  return out;
}));

app.post('/:id/draw-default-fund', async (c) => transition(c, 'draw_default_fund', (_row, body) => {
  const b = body as Partial<FundDrawBody>;
  const out: Partial<MarginRow> = { escalation_level: 2 };
  if (typeof b.default_fund_basis === 'string')    out.default_fund_basis = b.default_fund_basis;
  if (typeof b.default_fund_ref === 'string')      out.default_fund_ref = b.default_fund_ref;
  if (typeof b.default_fund_draw_zar === 'number') out.default_fund_draw_zar = b.default_fund_draw_zar;
  return out;
}));

app.post('/:id/record-recovery', async (c) => transition(c, 'record_recovery', (_row, body) => {
  const b = body as Partial<RecoveryBody>;
  const out: Partial<MarginRow> = {};
  if (typeof b.recovery_basis === 'string')     out.recovery_basis = b.recovery_basis;
  if (typeof b.recovery_zar === 'number')       out.recovery_zar = b.recovery_zar;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/write-off', async (c) => transition(c, 'write_off', (_row, body) => {
  const b = body as Partial<WriteOffBody>;
  const out: Partial<MarginRow> = {};
  if (typeof b.write_off_basis === 'string')    out.write_off_basis = b.write_off_basis;
  if (typeof b.write_off_zar === 'number')      out.write_off_zar = b.write_off_zar;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<MarginRow> = {};
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the high tiers (major + systemic).
export async function counterpartyMarginSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_counterparty_margin
     WHERE chain_status NOT IN ('recovered','written_off','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<MarginRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_counterparty_margin
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ccm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_counterparty_margin_events (id, margin_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'counterparty_margin.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.severity_tier)) {
      await fireCascade({
        event: 'counterparty_margin.sla_breached',
        actor_id: 'system',
        entity_type: 'counterparty_margin',
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
