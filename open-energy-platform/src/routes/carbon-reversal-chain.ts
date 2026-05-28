// ═══════════════════════════════════════════════════════════════════════════
// Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management chain
//
// Mounted at /api/carbon-reversal/chain.
//
// The back-end integrity safeguard of the carbon-credit lifecycle. Where W37
// registers a project, W11 verifies its reductions (MRV) and W17 retires the
// resulting credits, THIS chain handles what happens when previously-issued
// credits are REVERSED — sequestered carbon released back to atmosphere
// (wildfire, drought/pest mortality, illegal logging, project failure). The
// registry must make the market whole.
//
// Two resolution paths diverge at loss_quantified:
//   [buffer]  reversal_reported → under_assessment → loss_quantified →
//             buffer_cancellation_proposed → buffer_cancelled →
//             remediation_verified → closed     (UNINTENTIONAL — buffer absorbs)
//   [replace] loss_quantified → replacement_required → replacement_submitted →
//             replacement_verified → closed       (INTENTIONAL / proponent-at-fault)
//   escalate: under_assessment|loss_quantified|replacement_required → escalated
//   false_alarm: reversal_reported|under_assessment → false_alarm
//
// Tiers: catastrophic / significant / minor. URGENT SLA (catastrophic tightest).
//
// Write model — single carbon-fund desk {admin, support, carbon_fund} (same as
// W37 registration). actor_party records the contractual function performing
// each step (proponent / vvb / registry / authority) for audit attribution.
//
// Reportability: escalate AND require_replacement cross the regulator inbox for
// EVERY tier; close + sla_breached cross for material tiers (catastrophic +
// significant). Minor unintentional reversals stay internal (buffer accounting).
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
  type ReversalStatus,
  type ReversalAction,
  type ReversalTier,
} from '../utils/carbon-reversal-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'carbon_fund', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader',
]);

// Single carbon-fund desk write — the registry / carbon-fund function records
// the whole reversal. actor_party tags the contractual function per action.
const WRITE_ROLES = new Set(['admin', 'support', 'carbon_fund']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ReversalRow {
  id: string;
  reversal_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_party_id: string;
  project_party_name: string;
  vvb_name: string | null;
  project_name: string;
  project_tier: string | null;
  standard: string | null;
  methodology: string | null;
  province: string | null;
  host_country: string | null;
  registered_project_ref: string | null;
  credit_serial_block: string | null;
  reversal_cause: string | null;
  reversal_type: 'unintentional' | 'intentional';
  reversal_tier: ReversalTier;
  reversed_tco2e: number;
  buffer_cancelled_tco2e: number;
  replacement_tco2e: number;
  buffer_pool_ref: string | null;
  replacement_serial_block: string | null;
  reversal_ref: string | null;
  regulator_ref: string | null;
  reversal_summary: string | null;
  assessment_basis: string | null;
  quantification_basis: string | null;
  buffer_basis: string | null;
  remediation_basis: string | null;
  replacement_basis: string | null;
  verification_basis: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ReversalStatus;
  reversal_reported_at: string;
  under_assessment_at: string | null;
  loss_quantified_at: string | null;
  buffer_cancellation_proposed_at: string | null;
  buffer_cancelled_at: string | null;
  remediation_verified_at: string | null;
  replacement_required_at: string | null;
  replacement_submitted_at: string | null;
  replacement_verified_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  false_alarm_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ReversalEventRow {
  id: string;
  reversal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ReversalStatus, keyof ReversalRow | null> = {
  reversal_reported:            null,
  under_assessment:             'under_assessment_at',
  loss_quantified:              'loss_quantified_at',
  buffer_cancellation_proposed: 'buffer_cancellation_proposed_at',
  buffer_cancelled:             'buffer_cancelled_at',
  remediation_verified:         'remediation_verified_at',
  replacement_required:         'replacement_required_at',
  replacement_submitted:        'replacement_submitted_at',
  replacement_verified:         'replacement_verified_at',
  closed:                       'closed_at',
  escalated:                    'escalated_at',
  false_alarm:                  'false_alarm_at',
};

function decorate(row: ReversalRow, now: Date) {
  const tier = row.reversal_tier;
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

function eventTypeFor(action: ReversalAction): string {
  switch (action) {
    case 'begin_assessment':            return 'carbon_reversal.under_assessment';
    case 'quantify_loss':               return 'carbon_reversal.loss_quantified';
    case 'propose_buffer_cancellation': return 'carbon_reversal.buffer_cancellation_proposed';
    case 'cancel_buffer':               return 'carbon_reversal.buffer_cancelled';
    case 'verify_remediation':          return 'carbon_reversal.remediation_verified';
    case 'require_replacement':         return 'carbon_reversal.replacement_required';
    case 'submit_replacement':          return 'carbon_reversal.replacement_submitted';
    case 'verify_replacement':          return 'carbon_reversal.replacement_verified';
    case 'close':                       return 'carbon_reversal.closed';
    case 'escalate':                    return 'carbon_reversal.escalated';
    case 'dismiss_false_alarm':         return 'carbon_reversal.false_alarm';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const reversal_tier = c.req.query('reversal_tier');
  const reversal_type = c.req.query('reversal_type');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_carbon_reversals WHERE 1=1';
  const binds: unknown[] = [];
  if (reversal_tier) { sql += ' AND reversal_tier = ?'; binds.push(reversal_tier); }
  if (reversal_type) { sql += ' AND reversal_type = ?'; binds.push(reversal_type); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }

  sql += ' ORDER BY datetime(reversal_reported_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ReversalRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.reversal_tier] = (by_tier[i.reversal_tier] || 0) + 1;
    by_type[i.reversal_type] = (by_type[i.reversal_type] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const closed_count      = items.filter((i) => i.chain_status === 'closed').length;
  const escalated_count   = items.filter((i) => i.chain_status === 'escalated').length;
  const false_alarm_count = items.filter((i) => i.chain_status === 'false_alarm').length;
  const buffer_path_count = items.filter((i) =>
    i.chain_status === 'buffer_cancellation_proposed' ||
    i.chain_status === 'buffer_cancelled' ||
    i.chain_status === 'remediation_verified').length;
  const replacement_path_count = items.filter((i) =>
    i.chain_status === 'replacement_required' ||
    i.chain_status === 'replacement_submitted' ||
    i.chain_status === 'replacement_verified').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const catastrophic_open = items.filter((i) => !i.is_terminal && i.reversal_tier === 'catastrophic').length;
  const total_reversed_tco2e   = items.reduce((sum, i) => sum + (i.reversed_tco2e || 0), 0);
  const total_buffer_cancelled = items.reduce((sum, i) => sum + (i.buffer_cancelled_tco2e || 0), 0);
  const total_replacement      = items.reduce((sum, i) => sum + (i.replacement_tco2e || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_type,
      open_count,
      closed_count,
      escalated_count,
      false_alarm_count,
      buffer_path_count,
      replacement_path_count,
      breached: breached_count,
      reportable_total,
      catastrophic_open,
      total_reversed_tco2e,
      total_buffer_cancelled,
      total_replacement,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_reversals WHERE id = ?').bind(id).first<ReversalRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_carbon_reversals_events WHERE reversal_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ReversalEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AssessmentBody {
  assessment_basis?: string;
  notes?: string;
}
interface QuantifyBody {
  quantification_basis?: string;
  reversed_tco2e?: number;
  reversal_ref?: string;
  notes?: string;
}
interface BufferProposeBody {
  buffer_basis?: string;
  buffer_cancelled_tco2e?: number;
  buffer_pool_ref?: string;
  notes?: string;
}
interface BufferCancelBody {
  buffer_basis?: string;
  buffer_cancelled_tco2e?: number;
  buffer_pool_ref?: string;
  notes?: string;
}
interface RemediationBody {
  remediation_basis?: string;
  verification_basis?: string;
  notes?: string;
}
interface ReplacementRequireBody {
  replacement_basis?: string;
  replacement_tco2e?: number;
  regulator_ref?: string;
  notes?: string;
}
interface ReplacementSubmitBody {
  replacement_basis?: string;
  replacement_tco2e?: number;
  replacement_serial_block?: string;
  notes?: string;
}
interface ReplacementVerifyBody {
  verification_basis?: string;
  notes?: string;
}
interface CloseBody {
  reason_code?: string;
  closure_notes?: string;
  notes?: string;
}
interface EscalateBody {
  reason_code?: string;
  regulator_ref?: string;
  closure_notes?: string;
  notes?: string;
}
interface FalseAlarmBody {
  reason_code?: string;
  assessment_basis?: string;
  closure_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ReversalAction,
  bodyHandler?: (row: ReversalRow, body: Record<string, unknown>) => Partial<ReversalRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_reversals WHERE id = ?').bind(id).first<ReversalRow>();
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
  const sla = slaDeadlineFor(to, row.reversal_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.reversal_tier);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
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
    `UPDATE oe_carbon_reversals SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `crev_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'carbon_reversal',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_reversals WHERE id = ?').bind(id).first<ReversalRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment', (_row, body) => {
  const b = body as Partial<AssessmentBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  return out;
}));

app.post('/:id/quantify-loss', async (c) => transition(c, 'quantify_loss', (_row, body) => {
  const b = body as Partial<QuantifyBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.quantification_basis === 'string') out.quantification_basis = b.quantification_basis;
  if (typeof b.reversed_tco2e === 'number')       out.reversed_tco2e = b.reversed_tco2e;
  if (typeof b.reversal_ref === 'string')         out.reversal_ref = b.reversal_ref;
  return out;
}));

app.post('/:id/propose-buffer-cancellation', async (c) => transition(c, 'propose_buffer_cancellation', (_row, body) => {
  const b = body as Partial<BufferProposeBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.buffer_basis === 'string')           out.buffer_basis = b.buffer_basis;
  if (typeof b.buffer_cancelled_tco2e === 'number') out.buffer_cancelled_tco2e = b.buffer_cancelled_tco2e;
  if (typeof b.buffer_pool_ref === 'string')        out.buffer_pool_ref = b.buffer_pool_ref;
  return out;
}));

app.post('/:id/cancel-buffer', async (c) => transition(c, 'cancel_buffer', (_row, body) => {
  const b = body as Partial<BufferCancelBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.buffer_basis === 'string')           out.buffer_basis = b.buffer_basis;
  if (typeof b.buffer_cancelled_tco2e === 'number') out.buffer_cancelled_tco2e = b.buffer_cancelled_tco2e;
  if (typeof b.buffer_pool_ref === 'string')        out.buffer_pool_ref = b.buffer_pool_ref;
  return out;
}));

app.post('/:id/verify-remediation', async (c) => transition(c, 'verify_remediation', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.remediation_basis === 'string')  out.remediation_basis = b.remediation_basis;
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/require-replacement', async (c) => transition(c, 'require_replacement', (_row, body) => {
  const b = body as Partial<ReplacementRequireBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.replacement_basis === 'string') out.replacement_basis = b.replacement_basis;
  if (typeof b.replacement_tco2e === 'number') out.replacement_tco2e = b.replacement_tco2e;
  if (typeof b.regulator_ref === 'string')     out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/submit-replacement', async (c) => transition(c, 'submit_replacement', (_row, body) => {
  const b = body as Partial<ReplacementSubmitBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.replacement_basis === 'string')        out.replacement_basis = b.replacement_basis;
  if (typeof b.replacement_tco2e === 'number')        out.replacement_tco2e = b.replacement_tco2e;
  if (typeof b.replacement_serial_block === 'string') out.replacement_serial_block = b.replacement_serial_block;
  return out;
}));

app.post('/:id/verify-replacement', async (c) => transition(c, 'verify_replacement', (_row, body) => {
  const b = body as Partial<ReplacementVerifyBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.closure_notes === 'string') out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (_row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<ReversalRow> = { escalation_level: 1 };
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  if (typeof b.closure_notes === 'string')  out.closure_notes = b.closure_notes;
  return out;
}));

app.post('/:id/dismiss-false-alarm', async (c) => transition(c, 'dismiss_false_alarm', (_row, body) => {
  const b = body as Partial<FalseAlarmBody>;
  const out: Partial<ReversalRow> = {};
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.assessment_basis === 'string')  out.assessment_basis = b.assessment_basis;
  if (typeof b.closure_notes === 'string')     out.closure_notes = b.closure_notes;
  return out;
}));

export async function carbonReversalSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_reversals
     WHERE chain_status NOT IN ('closed','escalated','false_alarm')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ReversalRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_carbon_reversals
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `crev_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_carbon_reversals_events (id, reversal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_reversal.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.reversal_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.reversal_tier)) {
      await fireCascade({
        event: 'carbon_reversal.sla_breached',
        actor_id: 'system',
        entity_type: 'carbon_reversal',
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
