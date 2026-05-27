// ═══════════════════════════════════════════════════════════════════════════
// Wave 28 — Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1.
//
// Mounted at /api/gca/connection-chain.
//
// 10-state lifecycle every IPP must execute with Eskom Transmission /
// Distribution before COD (referenced in W20 COD chain energisation gate):
//   application_filed → studies_required → studies_executing →
//   cost_estimate_issued → cost_accepted → connection_agreement_drafted →
//   executed → construction → energised → in_service
//
// Terminals: rejected (Eskom denies on stability/load grounds),
//            withdrawn (IPP withdraws).
//
// Tiers (INVERTED SLA — larger tier gets MORE time):
//   transmission  — >132kV, ≥75MW utility (NERSA C-1 reportable)
//   distribution  — 33–132kV, 5–75MW
//   embedded      — <33kV SSEG, <5MW
//
// Reportability (cross into regulator inbox):
//   - execute_agreement / energise / commission cross for transmission only
//   - reject crosses for transmission AND distribution (formal grid-impact)
//   - sla_breached crosses for transmission AND distribution
//   - withdraw never crosses; embedded never crosses
//
// Split-write roles (second IPP↔Grid chain after W18 planned outages):
//   IPP_WRITE  — accept_cost, execute_agreement, begin_construction, withdraw
//   GRID_WRITE — request_studies, begin_studies, issue_cost_estimate,
//                draft_agreement, energise, commission, reject
//   READ       — broad (admin, support, compliance, regulator, ipp,
//                ipp_developer, grid, grid_operator, lender, esums)
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
  type GcaStatus,
  type GcaAction,
  type GcaTier,
} from '../utils/gca-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support', 'compliance',
  'regulator',
  'ipp', 'ipp_developer',
  'grid', 'grid_operator',
  'lender',
  'esums', 'esums_om',
]);
const IPP_WRITE_ROLES = new Set([
  'admin', 'support', 'compliance',
  'ipp_developer',
]);
const GRID_WRITE_ROLES = new Set([
  'admin', 'support', 'compliance',
  'grid_operator',
]);

const ACTION_ROLE_SET: Record<GcaAction, Set<string>> = {
  request_studies:     GRID_WRITE_ROLES,
  begin_studies:       GRID_WRITE_ROLES,
  issue_cost_estimate: GRID_WRITE_ROLES,
  draft_agreement:     GRID_WRITE_ROLES,
  energise:            GRID_WRITE_ROLES,
  commission:          GRID_WRITE_ROLES,
  reject:              GRID_WRITE_ROLES,
  accept_cost:         IPP_WRITE_ROLES,
  execute_agreement:   IPP_WRITE_ROLES,
  begin_construction:  IPP_WRITE_ROLES,
  withdraw:            IPP_WRITE_ROLES,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface GcaRow {
  id: string;
  case_number: string;
  project_id: string;
  project_name: string;
  ipp_party: string;
  network_party: string;
  connection_tier: GcaTier;
  voltage_kv: number;
  poc_substation: string;
  capacity_mw: number;
  technology: string;
  gia_ref: string | null;
  cost_estimate_zar: number | null;
  cost_accepted_zar: number | null;
  ungca_ref: string | null;
  energisation_date_planned: string | null;
  energisation_date_actual: string | null;
  rod_reason: string | null;
  withdrawal_reason: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: GcaStatus;
  application_filed_at: string;
  studies_required_at: string | null;
  studies_executing_at: string | null;
  cost_estimate_issued_at: string | null;
  cost_accepted_at: string | null;
  connection_agreement_drafted_at: string | null;
  executed_at: string | null;
  construction_at: string | null;
  energised_at: string | null;
  in_service_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  closure_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  gca_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<GcaStatus, keyof GcaRow | null> = {
  application_filed:            null,
  studies_required:             'studies_required_at',
  studies_executing:            'studies_executing_at',
  cost_estimate_issued:         'cost_estimate_issued_at',
  cost_accepted:                'cost_accepted_at',
  connection_agreement_drafted: 'connection_agreement_drafted_at',
  executed:                     'executed_at',
  construction:                 'construction_at',
  energised:                    'energised_at',
  in_service:                   'in_service_at',
  rejected:                     'rejected_at',
  withdrawn:                    'withdrawn_at',
};

function decorate(row: GcaRow, now: Date) {
  const tier = row.connection_tier;
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

function eventTypeFor(action: GcaAction): string {
  switch (action) {
    case 'request_studies':     return 'studies_required';
    case 'begin_studies':       return 'studies_executing';
    case 'issue_cost_estimate': return 'cost_estimate_issued';
    case 'accept_cost':         return 'cost_accepted';
    case 'draft_agreement':     return 'connection_agreement_drafted';
    case 'execute_agreement':   return 'executed';
    case 'begin_construction':  return 'construction';
    case 'energise':            return 'energised';
    case 'commission':          return 'in_service';
    case 'reject':              return 'rejected';
    case 'withdraw':            return 'withdrawn';
  }
}

function cascadeEventFor(action: GcaAction): string {
  switch (action) {
    case 'request_studies':     return 'gca.studies_required';
    case 'begin_studies':       return 'gca.studies_executing';
    case 'issue_cost_estimate': return 'gca.cost_estimate_issued';
    case 'accept_cost':         return 'gca.cost_accepted';
    case 'draft_agreement':     return 'gca.connection_agreement_drafted';
    case 'execute_agreement':   return 'gca.executed';
    case 'begin_construction':  return 'gca.construction';
    case 'energise':            return 'gca.energised';
    case 'commission':          return 'gca.in_service';
    case 'reject':              return 'gca.rejected';
    case 'withdraw':            return 'gca.withdrawn';
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
  const project_id = c.req.query('project_id');
  const network_party = c.req.query('network_party');

  let sql = 'SELECT * FROM oe_gca_connections WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)          { sql += ' AND connection_tier = ?'; binds.push(tier); }
  if (status)        { sql += ' AND chain_status = ?';    binds.push(status); }
  if (project_id)    { sql += ' AND project_id = ?';      binds.push(project_id); }
  if (network_party) { sql += ' AND network_party = ?';   binds.push(network_party); }

  sql += ' ORDER BY datetime(application_filed_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<GcaRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.connection_tier] = (by_tier[i.connection_tier] || 0) + 1;
  }

  const studies_open = items.filter(
    (i) => i.chain_status === 'studies_required' || i.chain_status === 'studies_executing',
  ).length;
  const cost_phase_open = items.filter(
    (i) => i.chain_status === 'cost_estimate_issued' || i.chain_status === 'cost_accepted',
  ).length;
  const agreement_open = items.filter(
    (i) => i.chain_status === 'connection_agreement_drafted',
  ).length;
  const construction_open = items.filter(
    (i) => i.chain_status === 'construction' || i.chain_status === 'energised',
  ).length;
  const transmission_open = items.filter(
    (i) => i.connection_tier === 'transmission' && !i.is_terminal,
  ).length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const cost_accepted_total_zar = items.reduce(
    (s, i) => s + (i.cost_accepted_zar || 0), 0,
  );
  const capacity_in_service_mw = items
    .filter((i) => i.chain_status === 'in_service')
    .reduce((s, i) => s + (i.capacity_mw || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      studies_open,
      cost_phase_open,
      agreement_open,
      construction_open,
      transmission_open,
      open_count,
      breached: breached_count,
      cost_accepted_total_zar,
      capacity_in_service_mw,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_gca_connections WHERE id = ?').bind(id).first<GcaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_gca_events WHERE gca_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface IssueCostEstimateBody {
  cost_estimate_zar?: number;
  gia_ref?: string;
  notes?: string;
}

interface AcceptCostBody {
  cost_accepted_zar?: number;
  notes?: string;
}

interface ExecuteAgreementBody {
  ungca_ref?: string;
  regulator_authority?: string;
  regulator_ref?: string;
  notes?: string;
}

interface EnergiseBody {
  energisation_date_actual?: string;
  notes?: string;
}

interface RejectBody {
  rod_reason?: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_reason?: string;
  notes?: string;
}

interface ClosureBody {
  closure_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: GcaAction,
  bodyHandler?: (row: GcaRow, body: Record<string, unknown>) => Partial<GcaRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_gca_connections WHERE id = ?').bind(id).first<GcaRow>();
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
  const sla = slaDeadlineFor(to, row.connection_tier, now);
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
    `UPDATE oe_gca_connections SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `gca_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_gca_events (id, gca_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'gca_connection',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.connection_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_gca_connections WHERE id = ?').bind(id).first<GcaRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/request-studies', async (c) => transition(c, 'request_studies'));

app.post('/:id/begin-studies', async (c) => transition(c, 'begin_studies', (_row, body) => {
  const b = body as { gia_ref?: string };
  const out: Partial<GcaRow> = {};
  if (typeof b.gia_ref === 'string') out.gia_ref = b.gia_ref;
  return out;
}));

app.post('/:id/issue-cost-estimate', async (c) => transition(c, 'issue_cost_estimate', (_row, body) => {
  const b = body as Partial<IssueCostEstimateBody>;
  const out: Partial<GcaRow> = {};
  if (typeof b.cost_estimate_zar === 'number') out.cost_estimate_zar = b.cost_estimate_zar;
  if (typeof b.gia_ref === 'string')           out.gia_ref = b.gia_ref;
  return out;
}));

app.post('/:id/accept-cost', async (c) => transition(c, 'accept_cost', (row, body) => {
  const b = body as Partial<AcceptCostBody>;
  const out: Partial<GcaRow> = {};
  out.cost_accepted_zar = typeof b.cost_accepted_zar === 'number'
    ? b.cost_accepted_zar
    : (row.cost_estimate_zar ?? null);
  return out;
}));

app.post('/:id/draft-agreement', async (c) => transition(c, 'draft_agreement'));

app.post('/:id/execute-agreement', async (c) => transition(c, 'execute_agreement', (_row, body) => {
  const b = body as Partial<ExecuteAgreementBody>;
  const out: Partial<GcaRow> = {};
  if (typeof b.ungca_ref === 'string')           out.ungca_ref = b.ungca_ref;
  if (typeof b.regulator_authority === 'string') out.regulator_authority = b.regulator_authority;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/begin-construction', async (c) => transition(c, 'begin_construction'));

app.post('/:id/energise', async (c) => transition(c, 'energise', (_row, body) => {
  const b = body as Partial<EnergiseBody>;
  const out: Partial<GcaRow> = {};
  if (typeof b.energisation_date_actual === 'string') {
    out.energisation_date_actual = b.energisation_date_actual;
  } else {
    out.energisation_date_actual = new Date().toISOString();
  }
  return out;
}));

app.post('/:id/commission', async (c) => transition(c, 'commission', (_row, body) => {
  const b = body as Partial<ClosureBody>;
  const out: Partial<GcaRow> = {};
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<GcaRow> = {};
  if (typeof b.rod_reason === 'string') out.rod_reason = b.rod_reason;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<GcaRow> = {};
  if (typeof b.withdrawal_reason === 'string') out.withdrawal_reason = b.withdrawal_reason;
  return out;
}));

export async function gcaSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_gca_connections
     WHERE chain_status NOT IN ('in_service','rejected','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<GcaRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_gca_connections
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `gca_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_gca_events (id, gca_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.connection_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.connection_tier)) {
      await fireCascade({
        event: 'gca.sla_breached',
        actor_id: 'system',
        entity_type: 'gca_connection',
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
