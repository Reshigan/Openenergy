// ═══════════════════════════════════════════════════════════════════════════
// Wave 74 — Regulator NERSA Levy Assessment & Collection chain (P6).
//
// Mounted at /api/levy-assessment/chain.
//
// NERSA recovering its own running costs from the industries it regulates: an
// annual levy under section 5B of the National Energy Regulator Act 40 of 2004
// (and fees under the Electricity Regulation Act 4 of 2006 section 10), assessed
// on a declared base — turnover, throughput volume, or a fixed schedule — across
// the three regulated industries. The desk computes the assessment, QA-reviews
// it, issues a levy notice, entertains an objection, confirms the payable amount,
// receives payment, ages the debt, issues a final demand, escalates an
// uncollected debt into enforcement, and settles or writes it off.
//
// DISTINCT from W43 tariff-determination by SUBJECT: W43 sets what a licensee
// CHARGES its customers; W74 sets what the licensee OWES the regulator. It is the
// financial counterpart to the licensing chains (W33/W49/W57) — a licence grants
// the right to operate; the levy funds the regulator that grants it, so
// non-payment is a licence good-standing matter (the W74 enforcement signature).
//
// Write model — SINGLE regulator desk {admin, regulator} (same single-party model
// as every Regulator chain W5/W31/W33/W40/W43/W49/W57/W66). READ all nine
// personas. actor_party (regulator / licensee) records the functional owner per
// step, not the JWT role.
//
// Reportability (NERSA Council oversight queue):
//   escalate_enforcement crosses for EVERY tier (licence good-standing at risk —
//     the W74 signature); write_off crosses for EVERY tier (fiscal write-off of
//     public revenue); issue_final_demand crosses for large + major; SLA breaches
//     cross for large + major.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isWithdrawable,
  allowedActions,
  slaDeadlineFor,
  slaWindowMinutes,
  tierForLevyAmount,
  outstandingBalance,
  arrearsBucket,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventForAction,
  type LevyStatus,
  type LevyAction,
  type LevyTier,
  type LevyBasis,
  type LevySector,
} from '../utils/levy-assessment-spec';

const READ_ROLES = new Set([
  'admin', 'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund', 'support',
]);

// SINGLE-PARTY write — the NERSA levy desk owns the whole record. actor_party is
// functional attribution only (the desk records the licensee's objection/payment).
const WRITE_ROLES = new Set(['admin', 'regulator']);

interface LevyRow {
  id: string;
  levy_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  licensee_id: string;
  licensee_name: string;
  licensee_licence_no: string | null;
  sector: LevySector;
  levy_basis: LevyBasis;
  levy_tier: LevyTier;
  financial_year: string;
  declared_base: number | null;
  base_unit: string | null;
  levy_rate: number | null;
  assessed_amount: number;
  paid_to_date: number;
  outstanding_amount: number;
  due_date: string | null;
  assessment_ref: string | null;
  invoice_ref: string | null;
  objection_ref: string | null;
  final_demand_ref: string | null;
  enforcement_ref: string | null;
  settlement_ref: string | null;
  writeoff_ref: string | null;
  assessment_basis: string | null;
  review_basis: string | null;
  invoice_basis: string | null;
  objection_basis: string | null;
  payable_basis: string | null;
  payment_basis: string | null;
  arrears_basis: string | null;
  final_demand_basis: string | null;
  enforcement_basis: string | null;
  settlement_basis: string | null;
  writeoff_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: LevyStatus;
  assessed_at: string;
  assessment_review_at: string | null;
  invoiced_at: string | null;
  objection_review_at: string | null;
  payment_pending_at: string | null;
  partially_paid_at: string | null;
  in_arrears_at: string | null;
  final_demand_at: string | null;
  enforcement_at: string | null;
  settled_at: string | null;
  written_off_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LevyEventRow {
  id: string;
  levy_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LevyStatus, keyof LevyRow | null> = {
  levy_assessed:     null,
  assessment_review: 'assessment_review_at',
  invoiced:          'invoiced_at',
  objection_review:  'objection_review_at',
  payment_pending:   'payment_pending_at',
  partially_paid:    'partially_paid_at',
  in_arrears:        'in_arrears_at',
  final_demand:      'final_demand_at',
  enforcement:       'enforcement_at',
  settled:           'settled_at',
  written_off:       'written_off_at',
  withdrawn:         'withdrawn_at',
};

function daysOverdue(dueDate: string | null, now: Date): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.floor((now.getTime() - due) / (24 * 60 * 60 * 1000));
}

function decorate(row: LevyRow, now: Date) {
  const tier = row.levy_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const overdue = daysOverdue(row.due_date, now);
  return {
    ...row,
    is_terminal: isTerminal(status),
    is_withdrawable: isWithdrawable(status),
    allowed_actions: allowedActions(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: slaWindowMinutes(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    outstanding_live: outstandingBalance(row.assessed_amount ?? 0, row.paid_to_date ?? 0),
    days_overdue: overdue,
    arrears_bucket: arrearsBucket(overdue),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const levy_tier   = c.req.query('levy_tier');
  const status      = c.req.query('status');
  const sector      = c.req.query('sector');
  const levy_basis  = c.req.query('levy_basis');
  const licensee_id = c.req.query('licensee_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_regulator_levies WHERE 1=1';
  const binds: unknown[] = [];
  if (levy_tier)   { sql += ' AND levy_tier = ?'; binds.push(levy_tier); }
  if (status)      { sql += ' AND chain_status = ?'; binds.push(status); }
  if (sector)      { sql += ' AND sector = ?'; binds.push(sector); }
  if (levy_basis)  { sql += ' AND levy_basis = ?'; binds.push(levy_basis); }
  if (licensee_id) { sql += ' AND licensee_id = ?'; binds.push(licensee_id); }

  sql += ' ORDER BY datetime(assessed_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<LevyRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_sector: Record<string, number> = {};
  const by_basis: Record<string, number> = {};
  const by_arrears_bucket: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.levy_tier] = (by_tier[i.levy_tier] || 0) + 1;
    by_sector[i.sector] = (by_sector[i.sector] || 0) + 1;
    by_basis[i.levy_basis] = (by_basis[i.levy_basis] || 0) + 1;
    by_arrears_bucket[i.arrears_bucket] = (by_arrears_bucket[i.arrears_bucket] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const in_arrears_count   = items.filter((i) => i.chain_status === 'in_arrears').length;
  const final_demand_count = items.filter((i) => i.chain_status === 'final_demand').length;
  const enforcement_count  = items.filter((i) => i.chain_status === 'enforcement').length;
  const settled_count      = items.filter((i) => i.chain_status === 'settled').length;
  const written_off_count  = items.filter((i) => i.chain_status === 'written_off').length;
  const withdrawn_count    = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count     = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const total_assessed     = items.reduce((sum, i) => sum + (i.assessed_amount || 0), 0);
  const total_collected    = items.reduce((sum, i) => sum + (i.paid_to_date || 0), 0);
  const total_outstanding  = items
    .filter((i) => !['settled', 'written_off', 'withdrawn'].includes(i.chain_status))
    .reduce((sum, i) => sum + outstandingBalance(i.assessed_amount || 0, i.paid_to_date || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_sector,
      by_basis,
      by_arrears_bucket,
      open_count,
      in_arrears_count,
      final_demand_count,
      enforcement_count,
      settled_count,
      written_off_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      total_assessed,
      total_collected,
      total_outstanding,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_regulator_levies WHERE id = ?').bind(id).first<LevyRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_regulator_levies_events WHERE levy_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<LevyEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: LevyAction,
  bodyHandler?: (row: LevyRow, body: Record<string, unknown>) => Partial<LevyRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_regulator_levies WHERE id = ?').bind(id).first<LevyRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The tier is a function of the assessed levy amount; re-derive it live so the
  // SLA window and regulator crossings track the CURRENT amount (e.g. an objection
  // resolution may revise the assessed amount down a tier).
  const assessed = (overrides.assessed_amount as number | undefined) ?? row.assessed_amount;
  const tier = tierForLevyAmount(assessed);
  overrides.levy_tier = tier;
  // Keep the outstanding balance in lock-step with payments-to-date.
  const paid = (overrides.paid_to_date as number | undefined) ?? row.paid_to_date;
  overrides.outstanding_amount = outstandingBalance(assessed, paid);

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  // is_reportable latches on once any action crosses; it never silently clears.
  overrides.is_reportable = (crosses || !!row.is_reportable) ? 1 : 0;

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
    `UPDATE oe_regulator_levies SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `levy_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_regulator_levies_events (id, levy_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventForAction(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventForAction(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'regulator_levy',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      levy_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_regulator_levies WHERE id = ?').bind(id).first<LevyRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/review-assessment', async (c) => transition(c, 'review_assessment', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.review_basis === 'string')   out.review_basis = body.review_basis as string;
  if (typeof body.assessment_ref === 'string') out.assessment_ref = body.assessment_ref as string;
  // The desk may revise the assessed amount during QA review (e.g. a corrected
  // declared base); re-derive the tier downstream from this.
  if (typeof body.assessed_amount === 'number') out.assessed_amount = body.assessed_amount as number;
  return out;
}));

app.post('/:id/issue-invoice', async (c) => transition(c, 'issue_invoice', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.invoice_basis === 'string') out.invoice_basis = body.invoice_basis as string;
  if (typeof body.invoice_ref === 'string')   out.invoice_ref = body.invoice_ref as string;
  if (typeof body.due_date === 'string')      out.due_date = body.due_date as string;
  return out;
}));

app.post('/:id/record-objection', async (c) => transition(c, 'record_objection', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.objection_basis === 'string') out.objection_basis = body.objection_basis as string;
  if (typeof body.objection_ref === 'string')   out.objection_ref = body.objection_ref as string;
  return out;
}));

app.post('/:id/resolve-objection', async (c) => transition(c, 'resolve_objection', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.objection_basis === 'string') out.objection_basis = body.objection_basis as string;
  if (typeof body.reason_code === 'string')     out.reason_code = body.reason_code as string;
  // Resolving an objection may revise the assessed amount (and therefore tier).
  if (typeof body.assessed_amount === 'number') out.assessed_amount = body.assessed_amount as number;
  return out;
}));

app.post('/:id/confirm-payable', async (c) => transition(c, 'confirm_payable', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.payable_basis === 'string') out.payable_basis = body.payable_basis as string;
  return out;
}));

app.post('/:id/record-partial-payment', async (c) => transition(c, 'record_partial_payment', (row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.payment_basis === 'string') out.payment_basis = body.payment_basis as string;
  // Accumulate the payment onto paid_to_date; outstanding is recomputed centrally.
  const amount = typeof body.payment_amount === 'number' ? body.payment_amount : 0;
  out.paid_to_date = Math.max(0, Math.round((row.paid_to_date || 0) + amount));
  return out;
}));

app.post('/:id/flag-arrears', async (c) => transition(c, 'flag_arrears', (row, body) => {
  const out: Partial<LevyRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof body.arrears_basis === 'string') out.arrears_basis = body.arrears_basis as string;
  return out;
}));

app.post('/:id/issue-final-demand', async (c) => transition(c, 'issue_final_demand', (row, body) => {
  const out: Partial<LevyRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof body.final_demand_basis === 'string') out.final_demand_basis = body.final_demand_basis as string;
  if (typeof body.final_demand_ref === 'string')   out.final_demand_ref = body.final_demand_ref as string;
  return out;
}));

app.post('/:id/escalate-enforcement', async (c) => transition(c, 'escalate_enforcement', (row, body) => {
  const out: Partial<LevyRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof body.enforcement_basis === 'string') out.enforcement_basis = body.enforcement_basis as string;
  if (typeof body.enforcement_ref === 'string')   out.enforcement_ref = body.enforcement_ref as string;
  if (typeof body.reason_code === 'string')       out.reason_code = body.reason_code as string;
  return out;
}));

app.post('/:id/record-settlement', async (c) => transition(c, 'record_settlement', (row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.settlement_basis === 'string') out.settlement_basis = body.settlement_basis as string;
  if (typeof body.settlement_ref === 'string')   out.settlement_ref = body.settlement_ref as string;
  // Settlement clears the balance in full — pay the assessed amount to date.
  const settleAmount = typeof body.payment_amount === 'number'
    ? Math.round((row.paid_to_date || 0) + body.payment_amount)
    : row.assessed_amount;
  out.paid_to_date = Math.max(row.paid_to_date || 0, settleAmount);
  return out;
}));

app.post('/:id/write-off', async (c) => transition(c, 'write_off', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.writeoff_basis === 'string') out.writeoff_basis = body.writeoff_basis as string;
  if (typeof body.writeoff_ref === 'string')   out.writeoff_ref = body.writeoff_ref as string;
  if (typeof body.reason_code === 'string')    out.reason_code = body.reason_code as string;
  return out;
}));

app.post('/:id/withdraw-assessment', async (c) => transition(c, 'withdraw_assessment', (_row, body) => {
  const out: Partial<LevyRow> = {};
  if (typeof body.withdrawal_basis === 'string') out.withdrawal_basis = body.withdrawal_basis as string;
  if (typeof body.reason_code === 'string')      out.reason_code = body.reason_code as string;
  return out;
}));

export async function levyAssessmentSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_regulator_levies
     WHERE chain_status NOT IN ('settled','written_off','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<LevyRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_regulator_levies
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `levy_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_regulator_levies_events (id, levy_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'regulator_levy.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.levy_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.levy_tier)) {
      await fireCascade({
        event: 'regulator_levy.sla_breached',
        actor_id: 'system',
        entity_type: 'regulator_levy',
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
