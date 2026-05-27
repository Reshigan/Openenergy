// ═══════════════════════════════════════════════════════════════════════════
// Wave 29 — Trader Position Limit Compliance chain — FSCA Section 41.
//
// Mounted at /api/poslimit/chain.
//
// 10-state lifecycle for trader position-limit utilisation breaches against
// per-instrument caps. Operational complement to W2 (VaR) + W9 (MM):
//   within_limit → warning → soft_breach → hard_breach →
//   margin_call_issued → reduction_required → reduction_executing → cured
//
// Terminals: cured (good — back inside limit; happy outcome),
//            escalated (bad — forced liquidation triggered),
//            false_alarm (stale telemetry).
//
// Tiers (FSCA license + capital):
//   prop          — Cat IIA proprietary desk, R5bn cap
//   market_maker  — Cat IIA-MM designated MM, R500m cap
//   retail        — Cat I retail member, R50m cap
//
// Reportability (cross into regulator inbox):
//   - hard_breach + margin_call_issued cross for prop + market_maker only
//   - escalated (forced liquidation) crosses for ALL tiers
//   - sla_breached crosses for ALL tiers (escalation precursor)
//   - warning / soft_breach / cure progressions never cross
//
// Split-write roles (third compliance↔trader chain in this pattern):
//   COMPLIANCE_WRITE — raise_warning, escalate_intraday, escalate_overnight,
//                      issue_margin_call, require_reduction, accept_cure,
//                      force_liquidate, mark_false_alarm
//   TRADER_WRITE     — begin_reduction (only trader can start their unwind)
//   READ             — admin, support, compliance, regulator, trader, marketmaker
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
  SLA_MINUTES,
  type PosLimitStatus,
  type PosLimitAction,
  type PosLimitTier,
} from '../utils/poslimit-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support', 'compliance',
  'regulator',
  'trader', 'marketmaker',
]);
const COMPLIANCE_WRITE_ROLES = new Set([
  'admin', 'support', 'compliance',
]);
const TRADER_WRITE_ROLES = new Set([
  'admin', 'support', 'compliance',
  'trader', 'marketmaker',
]);

const ACTION_ROLE_SET: Record<PosLimitAction, Set<string>> = {
  raise_warning:       COMPLIANCE_WRITE_ROLES,
  escalate_intraday:   COMPLIANCE_WRITE_ROLES,
  escalate_overnight:  COMPLIANCE_WRITE_ROLES,
  issue_margin_call:   COMPLIANCE_WRITE_ROLES,
  require_reduction:   COMPLIANCE_WRITE_ROLES,
  accept_cure:         COMPLIANCE_WRITE_ROLES,
  force_liquidate:     COMPLIANCE_WRITE_ROLES,
  mark_false_alarm:    COMPLIANCE_WRITE_ROLES,
  begin_reduction:     TRADER_WRITE_ROLES,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PosLimitRow {
  id: string;
  case_number: string;
  trader_party: string;
  trader_user_id: string;
  trader_tier: PosLimitTier;
  fsca_license_ref: string;
  instrument: string;
  instrument_class: string;
  tenor: string;
  cap_mw: number;
  position_mw: number;
  utilisation_pct: number;
  cap_zar: number;
  margin_called_zar: number | null;
  margin_posted_zar: number | null;
  reduction_target_mw: number | null;
  reduction_achieved_mw: number | null;
  jse_srl_ref: string | null;
  fsca_ref: string | null;
  liquidation_order_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: PosLimitStatus;
  detected_at: string;
  warning_at: string | null;
  soft_breach_at: string | null;
  hard_breach_at: string | null;
  margin_call_issued_at: string | null;
  reduction_required_at: string | null;
  reduction_executing_at: string | null;
  cured_at: string | null;
  escalated_at: string | null;
  false_alarm_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  poslimit_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PosLimitStatus, keyof PosLimitRow | null> = {
  within_limit:        null,
  warning:             'warning_at',
  soft_breach:         'soft_breach_at',
  hard_breach:         'hard_breach_at',
  margin_call_issued:  'margin_call_issued_at',
  reduction_required:  'reduction_required_at',
  reduction_executing: 'reduction_executing_at',
  cured:               'cured_at',
  escalated:           'escalated_at',
  false_alarm:         'false_alarm_at',
};

function decorate(row: PosLimitRow, now: Date) {
  const tier = row.trader_tier;
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

function eventTypeFor(action: PosLimitAction): string {
  switch (action) {
    case 'raise_warning':       return 'warning';
    case 'escalate_intraday':   return 'soft_breach';
    case 'escalate_overnight':  return 'hard_breach';
    case 'issue_margin_call':   return 'margin_call_issued';
    case 'require_reduction':   return 'reduction_required';
    case 'begin_reduction':     return 'reduction_executing';
    case 'accept_cure':         return 'cured';
    case 'force_liquidate':     return 'escalated';
    case 'mark_false_alarm':    return 'false_alarm';
  }
}

function cascadeEventFor(action: PosLimitAction): string {
  switch (action) {
    case 'raise_warning':       return 'poslimit.warning';
    case 'escalate_intraday':   return 'poslimit.soft_breach';
    case 'escalate_overnight':  return 'poslimit.hard_breach';
    case 'issue_margin_call':   return 'poslimit.margin_call_issued';
    case 'require_reduction':   return 'poslimit.reduction_required';
    case 'begin_reduction':     return 'poslimit.reduction_executing';
    case 'accept_cure':         return 'poslimit.cured';
    case 'force_liquidate':     return 'poslimit.escalated';
    case 'mark_false_alarm':    return 'poslimit.false_alarm';
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
  const trader_party = c.req.query('trader_party');
  const instrument = c.req.query('instrument');

  let sql = 'SELECT * FROM oe_poslimit_cases WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND trader_tier = ?';   binds.push(tier); }
  if (status)       { sql += ' AND chain_status = ?';  binds.push(status); }
  if (trader_party) { sql += ' AND trader_party = ?';  binds.push(trader_party); }
  if (instrument)   { sql += ' AND instrument = ?';    binds.push(instrument); }

  sql += ' ORDER BY datetime(detected_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PosLimitRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.trader_tier] = (by_tier[i.trader_tier] || 0) + 1;
  }

  const warning_open = items.filter(
    (i) => i.chain_status === 'warning',
  ).length;
  const breach_open = items.filter(
    (i) => i.chain_status === 'soft_breach' || i.chain_status === 'hard_breach',
  ).length;
  const margin_open = items.filter(
    (i) => i.chain_status === 'margin_call_issued',
  ).length;
  const reduction_open = items.filter(
    (i) => i.chain_status === 'reduction_required' || i.chain_status === 'reduction_executing',
  ).length;
  const escalated_count = items.filter((i) => i.chain_status === 'escalated').length;
  const cured_count = items.filter((i) => i.chain_status === 'cured').length;
  const false_alarm_count = items.filter((i) => i.chain_status === 'false_alarm').length;
  const open_count = items.filter((i) => !i.is_terminal && i.chain_status !== 'within_limit').length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const margin_called_total_zar = items.reduce(
    (s, i) => s + (i.margin_called_zar || 0), 0,
  );
  const margin_posted_total_zar = items.reduce(
    (s, i) => s + (i.margin_posted_zar || 0), 0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      warning_open,
      breach_open,
      margin_open,
      reduction_open,
      escalated_count,
      cured_count,
      false_alarm_count,
      open_count,
      breached: breached_count,
      margin_called_total_zar,
      margin_posted_total_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_poslimit_cases WHERE id = ?').bind(id).first<PosLimitRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_poslimit_events WHERE poslimit_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface IssueMarginCallBody {
  margin_called_zar?: number;
  fsca_ref?: string;
  notes?: string;
}

interface RequireReductionBody {
  reduction_target_mw?: number;
  notes?: string;
}

interface BeginReductionBody {
  reduction_achieved_mw?: number;
  notes?: string;
}

interface AcceptCureBody {
  rod_notes?: string;
  notes?: string;
}

interface ForceLiquidateBody {
  liquidation_order_ref?: string;
  rod_notes?: string;
  notes?: string;
}

interface MarkFalseAlarmBody {
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PosLimitAction,
  bodyHandler?: (row: PosLimitRow, body: Record<string, unknown>) => Partial<PosLimitRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_poslimit_cases WHERE id = ?').bind(id).first<PosLimitRow>();
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
  const sla = slaDeadlineFor(to, row.trader_tier, now);
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
    `UPDATE oe_poslimit_cases SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `pos_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_poslimit_events (id, poslimit_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'poslimit_case',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.trader_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_poslimit_cases WHERE id = ?').bind(id).first<PosLimitRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/raise-warning', async (c) => transition(c, 'raise_warning'));

app.post('/:id/escalate-intraday', async (c) => transition(c, 'escalate_intraday'));

app.post('/:id/escalate-overnight', async (c) => transition(c, 'escalate_overnight', (_row, body) => {
  const b = body as { fsca_ref?: string };
  const out: Partial<PosLimitRow> = {};
  if (typeof b.fsca_ref === 'string') out.fsca_ref = b.fsca_ref;
  return out;
}));

app.post('/:id/issue-margin-call', async (c) => transition(c, 'issue_margin_call', (_row, body) => {
  const b = body as Partial<IssueMarginCallBody>;
  const out: Partial<PosLimitRow> = {};
  if (typeof b.margin_called_zar === 'number') out.margin_called_zar = b.margin_called_zar;
  if (typeof b.fsca_ref === 'string')          out.fsca_ref = b.fsca_ref;
  return out;
}));

app.post('/:id/require-reduction', async (c) => transition(c, 'require_reduction', (_row, body) => {
  const b = body as Partial<RequireReductionBody>;
  const out: Partial<PosLimitRow> = {};
  if (typeof b.reduction_target_mw === 'number') out.reduction_target_mw = b.reduction_target_mw;
  return out;
}));

app.post('/:id/begin-reduction', async (c) => transition(c, 'begin_reduction', (_row, body) => {
  const b = body as Partial<BeginReductionBody>;
  const out: Partial<PosLimitRow> = {};
  if (typeof b.reduction_achieved_mw === 'number') out.reduction_achieved_mw = b.reduction_achieved_mw;
  return out;
}));

app.post('/:id/accept-cure', async (c) => transition(c, 'accept_cure', (_row, body) => {
  const b = body as Partial<AcceptCureBody>;
  const out: Partial<PosLimitRow> = {};
  if (typeof b.rod_notes === 'string') out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/force-liquidate', async (c) => transition(c, 'force_liquidate', (_row, body) => {
  const b = body as Partial<ForceLiquidateBody>;
  const out: Partial<PosLimitRow> = {};
  if (typeof b.liquidation_order_ref === 'string') out.liquidation_order_ref = b.liquidation_order_ref;
  if (typeof b.rod_notes === 'string')             out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/mark-false-alarm', async (c) => transition(c, 'mark_false_alarm', (_row, body) => {
  const b = body as Partial<MarkFalseAlarmBody>;
  const out: Partial<PosLimitRow> = {};
  if (typeof b.rod_notes === 'string') out.rod_notes = b.rod_notes;
  return out;
}));

export async function poslimitSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_poslimit_cases
     WHERE chain_status NOT IN ('cured','escalated','false_alarm','within_limit')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PosLimitRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_poslimit_cases
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `pos_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_poslimit_events (id, poslimit_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.trader_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.trader_tier)) {
      await fireCascade({
        event: 'poslimit.sla_breached',
        actor_id: 'system',
        entity_type: 'poslimit_case',
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
