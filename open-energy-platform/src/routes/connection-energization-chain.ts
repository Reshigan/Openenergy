// ═══════════════════════════════════════════════════════════════════════════
// Wave 75 — Grid Connection Energization & Commissioning Hold-Point Gate (P6)
//
// Mounted at /api/connection-energization/chain.
//
// The PHYSICAL go-live gate for a new generator. Once a plant has won scarce
// capacity (W58) and signed its Grid Connection Agreement (W28), the SA Grid Code
// and the NTCSA / System Operator commissioning procedures require it to be
// COMMISSIONED and ENERGIZED through a sequence of witnessed HOLD-POINTS before it
// can sell a MWh. See src/utils/connection-energization-spec.ts for the full
// state-machine, INVERTED tiering and reportability rationale.
//
//   connection_ready → program_review → program_approved
//     → pre_energization_inspection → energization_authorized → cold_commissioning
//     → synchronized → trial_operation → compliance_testing → commercial_operation
//   suspend (failed hold-point): {pre_energization_inspection, energization_authorized,
//     cold_commissioning, synchronized, trial_operation, compliance_testing}
//       → commissioning_suspended → (resume) → program_approved
//   withdraw: any non-terminal → connection_withdrawn
//
// Split write: the connected FACILITY (IPP developer) submits the programme, performs
// cold commissioning and the trial-operation run, and may withdraw; the System
// Operator (operator) approves the programme, witnesses each hold-point, issues the
// COD, and suspends / resumes. isFacilityAction routes each POST to the right write
// role set; actor_party records which side acted.
//
// Reportability (the W75 signature, COD-driven and POSITIVE): issue_cod crosses for
// EVERY tier (bringing new generation to commercial operation is always notifiable);
// authorize_energization + suspend_commissioning + SLA breaches cross for the large
// tiers (transmission + bulk).
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
  isFacilityAction,
  tierForConnectionCapacity,
  SLA_MINUTES,
  type EnergizationStatus,
  type EnergizationAction,
  type EnergizationTier,
} from '../utils/connection-energization-spec';

// All nine personas may read the energization register.
const READ_ROLES = new Set([
  'admin',
  'grid_operator', 'regulator', 'ipp_developer', 'carbon_fund', 'offtaker', 'lender', 'trader', 'support',
]);

// Split write: the SO/TSO desk drives the witnessed hold-points; the connected
// facility (an IPP developer) submits the programme and performs commissioning.
const OPERATOR_WRITE_ROLES = new Set(['admin', 'support', 'grid_operator']);
const FACILITY_WRITE_ROLES = new Set(['admin', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface EnergizationRow {
  id: string;
  energization_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  gca_ref: string | null;
  capacity_allocation_ref: string | null;
  facility_id: string;
  facility_name: string;
  connection_point: string | null;
  network_operator: string | null;
  technology: string | null;
  connection_capacity_mw: number;
  voltage_kv: number | null;
  connection_tier: EnergizationTier;
  cod_certificate_no: string | null;
  cod_date: string | null;
  program_ref: string | null;
  inspection_ref: string | null;
  energization_ref: string | null;
  synchronization_ref: string | null;
  compliance_test_ref: string | null;
  suspension_ref: string | null;
  withdrawal_ref: string | null;
  program_basis: string | null;
  approval_basis: string | null;
  inspection_basis: string | null;
  energization_basis: string | null;
  cold_commissioning_basis: string | null;
  synchronization_basis: string | null;
  trial_operation_basis: string | null;
  compliance_test_basis: string | null;
  cod_basis: string | null;
  suspension_basis: string | null;
  resumption_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: EnergizationStatus;
  connection_ready_at: string;
  program_review_at: string | null;
  program_approved_at: string | null;
  pre_energization_inspection_at: string | null;
  energization_authorized_at: string | null;
  cold_commissioning_at: string | null;
  synchronized_at: string | null;
  trial_operation_at: string | null;
  compliance_testing_at: string | null;
  commercial_operation_at: string | null;
  commissioning_suspended_at: string | null;
  connection_withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EnergizationEventRow {
  id: string;
  energization_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<EnergizationStatus, keyof EnergizationRow | null> = {
  connection_ready:            null,
  program_review:              'program_review_at',
  program_approved:            'program_approved_at',
  pre_energization_inspection: 'pre_energization_inspection_at',
  energization_authorized:     'energization_authorized_at',
  cold_commissioning:          'cold_commissioning_at',
  synchronized:                'synchronized_at',
  trial_operation:             'trial_operation_at',
  compliance_testing:          'compliance_testing_at',
  commercial_operation:        'commercial_operation_at',
  commissioning_suspended:     'commissioning_suspended_at',
  connection_withdrawn:        'connection_withdrawn_at',
};

function decorate(row: EnergizationRow, now: Date) {
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
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// resume_commissioning lands back in program_approved → shares that event.
function eventTypeFor(action: EnergizationAction): string {
  switch (action) {
    case 'submit_program':            return 'connection_energization.program_review';
    case 'approve_program':           return 'connection_energization.program_approved';
    case 'conduct_inspection':        return 'connection_energization.pre_energization_inspection';
    case 'authorize_energization':    return 'connection_energization.energization_authorized';
    case 'begin_cold_commissioning':  return 'connection_energization.cold_commissioning';
    case 'authorize_synchronization': return 'connection_energization.synchronized';
    case 'begin_trial_operation':     return 'connection_energization.trial_operation';
    case 'begin_compliance_testing':  return 'connection_energization.compliance_testing';
    case 'issue_cod':                 return 'connection_energization.commercial_operation';
    case 'suspend_commissioning':     return 'connection_energization.commissioning_suspended';
    case 'resume_commissioning':      return 'connection_energization.program_approved';
    case 'withdraw_connection':       return 'connection_energization.connection_withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const connection_tier = c.req.query('connection_tier');
  const technology      = c.req.query('technology');
  const status          = c.req.query('status');
  const breached        = c.req.query('breached');
  const reportable      = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_connection_energization WHERE 1=1';
  const binds: unknown[] = [];
  if (connection_tier) { sql += ' AND connection_tier = ?'; binds.push(connection_tier); }
  if (technology)      { sql += ' AND technology = ?';      binds.push(technology); }
  if (status)          { sql += ' AND chain_status = ?';    binds.push(status); }

  sql += ' ORDER BY datetime(connection_ready_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<EnergizationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_technology: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.connection_tier] = (by_tier[i.connection_tier] || 0) + 1;
    if (i.technology) by_technology[i.technology] = (by_technology[i.technology] || 0) + 1;
  }

  const ready_count       = items.filter((i) => i.chain_status === 'connection_ready').length;
  const open_count        = items.filter((i) => !i.is_terminal).length;
  const suspended_count   = items.filter((i) => i.chain_status === 'commissioning_suspended').length;
  const energized_count   = items.filter((i) => i.chain_status === 'commercial_operation').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'connection_withdrawn').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) =>
    !i.is_terminal && (i.connection_tier === 'transmission' || i.connection_tier === 'bulk')).length;
  const total_capacity_mw     = items.reduce((sum, i) => sum + (i.connection_capacity_mw || 0), 0);
  const energized_capacity_mw = items
    .filter((i) => i.chain_status === 'commercial_operation')
    .reduce((sum, i) => sum + (i.connection_capacity_mw || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_technology,
      ready_count,
      open_count,
      suspended_count,
      energized_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      large_open,
      total_capacity_mw,
      energized_capacity_mw,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_connection_energization WHERE id = ?').bind(id).first<EnergizationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_connection_energization_events WHERE energization_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EnergizationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ProgramBody {
  program_basis?: string;
  program_ref?: string;
  connection_capacity_mw?: number;
  notes?: string;
}
interface ApprovalBody {
  approval_basis?: string;
  notes?: string;
}
interface InspectionBody {
  inspection_basis?: string;
  inspection_ref?: string;
  notes?: string;
}
interface EnergizationBody {
  energization_basis?: string;
  energization_ref?: string;
  notes?: string;
}
interface ColdBody {
  cold_commissioning_basis?: string;
  notes?: string;
}
interface SyncBody {
  synchronization_basis?: string;
  synchronization_ref?: string;
  notes?: string;
}
interface TrialBody {
  trial_operation_basis?: string;
  notes?: string;
}
interface ComplianceBody {
  compliance_test_basis?: string;
  compliance_test_ref?: string;
  notes?: string;
}
interface CodBody {
  cod_basis?: string;
  cod_certificate_no?: string;
  cod_date?: string;
  notes?: string;
}
interface SuspendBody {
  suspension_basis?: string;
  suspension_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ResumeBody {
  resumption_basis?: string;
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
  action: EnergizationAction,
  bodyHandler?: (row: EnergizationRow, body: Record<string, unknown>) => Partial<EnergizationRow>,
) {
  const user = getCurrentUser(c);
  const writeRoles = isFacilityAction(action) ? FACILITY_WRITE_ROLES : OPERATOR_WRITE_ROLES;
  if (!user || !writeRoles.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_connection_energization WHERE id = ?').bind(id).first<EnergizationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is re-derived live from the connection capacity (the programme submission may
  // restate it); otherwise the row's recorded tier stands.
  const effectiveCapacity = (overrides.connection_capacity_mw ?? row.connection_capacity_mw);
  let effectiveTier: EnergizationTier = row.connection_tier;
  if (overrides.connection_capacity_mw != null) {
    effectiveTier = tierForConnectionCapacity(effectiveCapacity || 0);
    overrides.connection_tier = effectiveTier;
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
    `UPDATE oe_connection_energization SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cen_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_connection_energization_events (id, energization_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'connection_energization',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      connection_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_connection_energization WHERE id = ?').bind(id).first<EnergizationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit-program', async (c) => transition(c, 'submit_program', (_row, body) => {
  const b = body as Partial<ProgramBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.program_basis === 'string')          out.program_basis = b.program_basis;
  if (typeof b.program_ref === 'string')            out.program_ref = b.program_ref;
  if (typeof b.connection_capacity_mw === 'number') out.connection_capacity_mw = b.connection_capacity_mw;
  return out;
}));

app.post('/:id/approve-program', async (c) => transition(c, 'approve_program', (_row, body) => {
  const b = body as Partial<ApprovalBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  return out;
}));

app.post('/:id/conduct-inspection', async (c) => transition(c, 'conduct_inspection', (_row, body) => {
  const b = body as Partial<InspectionBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.inspection_basis === 'string') out.inspection_basis = b.inspection_basis;
  if (typeof b.inspection_ref === 'string')   out.inspection_ref = b.inspection_ref;
  return out;
}));

app.post('/:id/authorize-energization', async (c) => transition(c, 'authorize_energization', (_row, body) => {
  const b = body as Partial<EnergizationBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.energization_basis === 'string') out.energization_basis = b.energization_basis;
  if (typeof b.energization_ref === 'string')   out.energization_ref = b.energization_ref;
  return out;
}));

app.post('/:id/begin-cold-commissioning', async (c) => transition(c, 'begin_cold_commissioning', (_row, body) => {
  const b = body as Partial<ColdBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.cold_commissioning_basis === 'string') out.cold_commissioning_basis = b.cold_commissioning_basis;
  return out;
}));

app.post('/:id/authorize-synchronization', async (c) => transition(c, 'authorize_synchronization', (_row, body) => {
  const b = body as Partial<SyncBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.synchronization_basis === 'string') out.synchronization_basis = b.synchronization_basis;
  if (typeof b.synchronization_ref === 'string')   out.synchronization_ref = b.synchronization_ref;
  return out;
}));

app.post('/:id/begin-trial-operation', async (c) => transition(c, 'begin_trial_operation', (_row, body) => {
  const b = body as Partial<TrialBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.trial_operation_basis === 'string') out.trial_operation_basis = b.trial_operation_basis;
  return out;
}));

app.post('/:id/begin-compliance-testing', async (c) => transition(c, 'begin_compliance_testing', (_row, body) => {
  const b = body as Partial<ComplianceBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.compliance_test_basis === 'string') out.compliance_test_basis = b.compliance_test_basis;
  if (typeof b.compliance_test_ref === 'string')   out.compliance_test_ref = b.compliance_test_ref;
  return out;
}));

app.post('/:id/issue-cod', async (c) => transition(c, 'issue_cod', (_row, body) => {
  const b = body as Partial<CodBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.cod_basis === 'string')           out.cod_basis = b.cod_basis;
  if (typeof b.cod_certificate_no === 'string')  out.cod_certificate_no = b.cod_certificate_no;
  if (typeof b.cod_date === 'string')            out.cod_date = b.cod_date;
  return out;
}));

app.post('/:id/suspend-commissioning', async (c) => transition(c, 'suspend_commissioning', (_row, body) => {
  const b = body as Partial<SuspendBody>;
  const out: Partial<EnergizationRow> = { escalation_level: 1 };
  if (typeof b.suspension_basis === 'string') out.suspension_basis = b.suspension_basis;
  if (typeof b.suspension_ref === 'string')   out.suspension_ref = b.suspension_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resume-commissioning', async (c) => transition(c, 'resume_commissioning', (_row, body) => {
  const b = body as Partial<ResumeBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.resumption_basis === 'string') out.resumption_basis = b.resumption_basis;
  return out;
}));

app.post('/:id/withdraw-connection', async (c) => transition(c, 'withdraw_connection', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<EnergizationRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the large tiers (transmission + bulk).
export async function connectionEnergizationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_connection_energization
     WHERE chain_status NOT IN ('commercial_operation','connection_withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<EnergizationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_connection_energization
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cen_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_connection_energization_events (id, energization_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'connection_energization.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.connection_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.connection_tier)) {
      await fireCascade({
        event: 'connection_energization.sla_breached',
        actor_id: 'system',
        entity_type: 'connection_energization',
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
