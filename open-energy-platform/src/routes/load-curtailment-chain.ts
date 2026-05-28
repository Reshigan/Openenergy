// ═══════════════════════════════════════════════════════════════════════════
// Wave 34 — Grid CSC-1 Load Curtailment / Emergency Load Reduction chain
//
// Mounted at /api/load-curtailment/chain.
//
// 11-state lifecycle for every formal System Operator (SO) load-curtailment
// instruction issued under NERSA Grid Code System Operations Code §CSC-1
// during a Stage 1-8 load-shedding event or other system-emergency condition.
//
// Forward path:
//   instruction_issued → acknowledged → curtailment_started → target_achieved →
//   instruction_lifted → reconciled → post_mortem → closed
//
// Branch terminals:
//   refused             — target party refuses to comply (§C-3 referral)
//   partial_compliance  — target not met (proportional penalty)
//   withdrawn           — SO withdrew the instruction before customer action
//
// Stages (URGENT SLA — higher stage = TIGHTER deadline):
//   stage_1_2 — mild (1-2 GW shed nationally, ack 60min)
//   stage_3_4 — moderate (3-4 GW, ack 30min)
//   stage_5_6 — high (5-6 GW, ack 15min)
//   stage_7_8 — critical (7-8 GW, ack 5min — system survival)
//
// Reportability:
//   - refused crosses for ALL stages (§C-3 mandatory disclosure)
//   - partial_compliance crosses for stage_3_4+
//   - target_achieved + post_mortem closure cross for stage_5_6+ (national)
//   - sla_breached crosses for stage_5_6+ only (mild events stay internal)
//
// Split-write:
//   GRID_WRITE: issue_instruction / lift_instruction / withdraw / reconcile /
//               open_post_mortem / close_post_mortem / close
//   CUSTOMER_WRITE: acknowledge / start_curtailment / report_target_achieved /
//                   refuse / report_partial
//   admin/support always.
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
  type LoadCurtailmentStatus,
  type LoadCurtailmentAction,
  type LoadShedStage,
} from '../utils/load-curtailment-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'grid_operator',
  'ipp_developer',
  'trader',
  'carbon_fund',
  'offtaker',
]);

const GRID_WRITE     = new Set(['admin', 'support', 'grid_operator']);
const CUSTOMER_WRITE = new Set([
  'admin', 'support',
  'ipp_developer', 'grid_operator', 'trader', 'carbon_fund', 'offtaker',
]);

const ACTION_ROLE_SET: Record<LoadCurtailmentAction, Set<string>> = {
  issue_instruction:      GRID_WRITE,
  acknowledge:            CUSTOMER_WRITE,
  start_curtailment:      CUSTOMER_WRITE,
  report_target_achieved: CUSTOMER_WRITE,
  lift_instruction:       GRID_WRITE,
  reconcile:              GRID_WRITE,
  open_post_mortem:       GRID_WRITE,
  close_post_mortem:      GRID_WRITE,
  close:                  GRID_WRITE,
  refuse:                 CUSTOMER_WRITE,
  report_partial:         CUSTOMER_WRITE,
  withdraw:               GRID_WRITE,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CurtailmentRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  so_party_id: string;
  so_party_name: string;
  customer_party_id: string;
  customer_party_name: string;
  customer_category: 'distribution' | 'large_industrial' | 'embedded_generator' | 'mining' | 'metro';
  facility_name: string | null;
  facility_province: string | null;
  load_shed_stage: LoadShedStage;
  national_shed_gw: number;
  target_mw: number;
  actual_shed_mw: number | null;
  variance_pct: number | null;
  duration_hours: number;
  grid_code_section: string;
  instruction_ref: string | null;
  acknowledgement_ref: string | null;
  metering_reconcile_ref: string | null;
  post_mortem_ref: string | null;
  refusal_ref: string | null;
  partial_ref: string | null;
  withdrawal_ref: string | null;
  penalty_zar: number | null;
  penalty_basis: string | null;
  tribunal_case_ref: string | null;
  refusal_grounds: string | null;
  partial_basis: string | null;
  withdrawal_basis: string | null;
  post_mortem_findings: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: LoadCurtailmentStatus;
  instruction_issued_at: string;
  acknowledged_at: string | null;
  curtailment_started_at: string | null;
  target_achieved_at: string | null;
  partial_compliance_at: string | null;
  instruction_lifted_at: string | null;
  reconciled_at: string | null;
  post_mortem_opened_at: string | null;
  closed_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CurtailmentEventRow {
  id: string;
  curtailment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LoadCurtailmentStatus, keyof CurtailmentRow | null> = {
  instruction_issued:   null,
  acknowledged:         'acknowledged_at',
  curtailment_started:  'curtailment_started_at',
  target_achieved:      'target_achieved_at',
  partial_compliance:   'partial_compliance_at',
  instruction_lifted:   'instruction_lifted_at',
  reconciled:           'reconciled_at',
  post_mortem:          'post_mortem_opened_at',
  closed:               'closed_at',
  refused:              'refused_at',
  withdrawn:            'withdrawn_at',
};

function decorate(row: CurtailmentRow, now: Date) {
  const stage = row.load_shed_stage;
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
    sla_window_minutes: SLA_MINUTES[status]?.[stage] ?? 0,
    is_reportable: isReportable(stage),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(stage),
  };
}

function eventTypeFor(action: LoadCurtailmentAction): string {
  switch (action) {
    case 'issue_instruction':      return 'instruction_issued';
    case 'acknowledge':            return 'acknowledged';
    case 'start_curtailment':      return 'curtailment_started';
    case 'report_target_achieved': return 'target_achieved';
    case 'lift_instruction':       return 'instruction_lifted';
    case 'reconcile':              return 'reconciled';
    case 'open_post_mortem':       return 'post_mortem_opened';
    case 'close_post_mortem':      return 'post_mortem_closed';
    case 'close':                  return 'closed';
    case 'refuse':                 return 'refused';
    case 'report_partial':         return 'partial_compliance';
    case 'withdraw':               return 'withdrawn';
  }
}

function cascadeEventFor(action: LoadCurtailmentAction): string {
  switch (action) {
    case 'issue_instruction':      return 'load_curtailment.instruction_issued';
    case 'acknowledge':            return 'load_curtailment.acknowledged';
    case 'start_curtailment':      return 'load_curtailment.curtailment_started';
    case 'report_target_achieved': return 'load_curtailment.target_achieved';
    case 'lift_instruction':       return 'load_curtailment.instruction_lifted';
    case 'reconcile':              return 'load_curtailment.reconciled';
    case 'open_post_mortem':       return 'load_curtailment.post_mortem_opened';
    case 'close_post_mortem':      return 'load_curtailment.post_mortem_closed';
    case 'close':                  return 'load_curtailment.closed';
    case 'refuse':                 return 'load_curtailment.refused';
    case 'report_partial':         return 'load_curtailment.partial_compliance';
    case 'withdraw':               return 'load_curtailment.withdrawn';
  }
}

function actorParty(role: string): string {
  if (role === 'grid_operator') return 'grid_so';
  if (role === 'admin' || role === 'support') return role;
  return 'customer';
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const load_shed_stage   = c.req.query('load_shed_stage');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const customer_category = c.req.query('customer_category');
  const customer_party_id = c.req.query('customer_party_id');
  const so_party_id       = c.req.query('so_party_id');

  let sql = 'SELECT * FROM oe_load_curtailment WHERE 1=1';
  const binds: unknown[] = [];
  if (load_shed_stage)   { sql += ' AND load_shed_stage = ?';   binds.push(load_shed_stage); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (customer_category) { sql += ' AND customer_category = ?'; binds.push(customer_category); }
  if (customer_party_id) { sql += ' AND customer_party_id = ?'; binds.push(customer_party_id); }
  if (so_party_id)       { sql += ' AND so_party_id = ?';       binds.push(so_party_id); }

  sql += ' ORDER BY datetime(instruction_issued_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CurtailmentRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_stage: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]   = (by_status[i.chain_status] || 0) + 1;
    by_stage[i.load_shed_stage] = (by_stage[i.load_shed_stage] || 0) + 1;
    by_category[i.customer_category] = (by_category[i.customer_category] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const closed_count      = items.filter((i) => i.chain_status === 'closed').length;
  const refused_count     = items.filter((i) => i.chain_status === 'refused').length;
  const partial_count     = items.filter((i) => i.chain_status === 'partial_compliance').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const critical_open     = items.filter(
    (i) => !i.is_terminal && i.load_shed_stage === 'stage_7_8',
  ).length;
  const high_open         = items.filter(
    (i) => !i.is_terminal && i.load_shed_stage === 'stage_5_6',
  ).length;
  const total_target_mw    = items.reduce((sum, i) => sum + (i.target_mw || 0), 0);
  const total_actual_mw    = items.reduce((sum, i) => sum + (i.actual_shed_mw || 0), 0);
  const total_penalty_zar  = items.reduce((sum, i) => sum + (i.penalty_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_stage,
      by_category,
      open_count,
      closed_count,
      refused_count,
      partial_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      critical_open,
      high_open,
      total_target_mw,
      total_actual_mw,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_load_curtailment WHERE id = ?').bind(id).first<CurtailmentRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_load_curtailment_events WHERE curtailment_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CurtailmentEventRow>();

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
  notes?: string;
}

interface TargetAchievedBody {
  actual_shed_mw?: number;
  notes?: string;
}

interface PartialBody {
  actual_shed_mw?: number;
  partial_basis?: string;
  partial_ref?: string;
  penalty_zar?: number;
  penalty_basis?: string;
  notes?: string;
}

interface ReconcileBody {
  metering_reconcile_ref?: string;
  actual_shed_mw?: number;
  notes?: string;
}

interface PostMortemOpenBody {
  post_mortem_ref?: string;
  notes?: string;
}

interface PostMortemCloseBody {
  post_mortem_findings?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface CloseBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface RefuseBody {
  refusal_grounds?: string;
  refusal_ref?: string;
  tribunal_case_ref?: string;
  penalty_zar?: number;
  penalty_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_basis?: string;
  withdrawal_ref?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: LoadCurtailmentAction,
  bodyHandler?: (row: CurtailmentRow, body: Record<string, unknown>) => Partial<CurtailmentRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_load_curtailment WHERE id = ?').bind(id).first<CurtailmentRow>();
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
  const sla = slaDeadlineFor(to, row.load_shed_stage, now);
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
    `UPDATE oe_load_curtailment SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `lce_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    actorParty(user.role),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = cascadeEventFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'load_curtailment',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.load_shed_stage),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_load_curtailment WHERE id = ?').bind(id).first<CurtailmentRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/acknowledge', async (c) => transition(c, 'acknowledge', (_row, body) => {
  const b = body as Partial<AcknowledgeBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.acknowledgement_ref === 'string') out.acknowledgement_ref = b.acknowledgement_ref;
  return out;
}));

app.post('/:id/start-curtailment', async (c) => transition(c, 'start_curtailment', (_row, _body) => {
  return {};
}));

app.post('/:id/report-target-achieved', async (c) => transition(c, 'report_target_achieved', (row, body) => {
  const b = body as Partial<TargetAchievedBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.actual_shed_mw === 'number') {
    out.actual_shed_mw = b.actual_shed_mw;
    if (row.target_mw > 0) {
      out.variance_pct = ((b.actual_shed_mw - row.target_mw) / row.target_mw) * 100;
    }
  }
  return out;
}));

app.post('/:id/report-partial', async (c) => transition(c, 'report_partial', (row, body) => {
  const b = body as Partial<PartialBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.actual_shed_mw === 'number') {
    out.actual_shed_mw = b.actual_shed_mw;
    if (row.target_mw > 0) {
      out.variance_pct = ((b.actual_shed_mw - row.target_mw) / row.target_mw) * 100;
    }
  }
  if (typeof b.partial_basis === 'string') out.partial_basis = b.partial_basis;
  if (typeof b.partial_ref === 'string')   out.partial_ref = b.partial_ref;
  if (typeof b.penalty_zar === 'number')   out.penalty_zar = b.penalty_zar;
  if (typeof b.penalty_basis === 'string') out.penalty_basis = b.penalty_basis;
  return out;
}));

app.post('/:id/lift-instruction', async (c) => transition(c, 'lift_instruction', (_row, _body) => {
  return {};
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.metering_reconcile_ref === 'string') out.metering_reconcile_ref = b.metering_reconcile_ref;
  if (typeof b.actual_shed_mw === 'number') {
    out.actual_shed_mw = b.actual_shed_mw;
    if (row.target_mw > 0) {
      out.variance_pct = ((b.actual_shed_mw - row.target_mw) / row.target_mw) * 100;
    }
  }
  return out;
}));

app.post('/:id/open-post-mortem', async (c) => transition(c, 'open_post_mortem', (_row, body) => {
  const b = body as Partial<PostMortemOpenBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.post_mortem_ref === 'string') out.post_mortem_ref = b.post_mortem_ref;
  return out;
}));

app.post('/:id/close-post-mortem', async (c) => transition(c, 'close_post_mortem', (_row, body) => {
  const b = body as Partial<PostMortemCloseBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.post_mortem_findings === 'string') out.post_mortem_findings = b.post_mortem_findings;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')            out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/refuse', async (c) => transition(c, 'refuse', (_row, body) => {
  const b = body as Partial<RefuseBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.refusal_grounds === 'string')   out.refusal_grounds = b.refusal_grounds;
  if (typeof b.refusal_ref === 'string')       out.refusal_ref = b.refusal_ref;
  if (typeof b.tribunal_case_ref === 'string') out.tribunal_case_ref = b.tribunal_case_ref;
  if (typeof b.penalty_zar === 'number')       out.penalty_zar = b.penalty_zar;
  if (typeof b.penalty_basis === 'string')     out.penalty_basis = b.penalty_basis;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function loadCurtailmentSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_load_curtailment
     WHERE chain_status NOT IN ('closed','refused','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CurtailmentRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_load_curtailment
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `lce_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_load_curtailment_events (id, curtailment_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (stage ${row.load_shed_stage})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.load_shed_stage)) {
      await fireCascade({
        event: 'load_curtailment.sla_breached',
        actor_id: 'system',
        entity_type: 'load_curtailment',
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
