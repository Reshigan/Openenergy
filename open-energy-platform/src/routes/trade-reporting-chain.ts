// ═══════════════════════════════════════════════════════════════════════════
// Wave 44 — Trader OTC Transaction / Trade-Repository Reporting & Reconciliation chain
//
// Mounted at /api/trade-reporting/chain.
//
// 12-state lifecycle for every reportable transaction the desk executes. Under
// the Financial Markets Act 19 of 2012 + the FSCA OTC Derivatives Reporting
// regulations (SA's analogue of EMIR / Dodd-Frank), each report must be
// submitted to a licensed Trade Repository (TR) by a hard T+1 deadline,
// acknowledged, then RECONCILED against the counterparty's dual-sided
// submission. Post-trade complement to W2 VaR (risk), W9 MM compliance, W29
// position limits (quantity) and W36 best-execution (quality): this governs
// whether the trade is correctly REPORTED to the supervisor afterward.
//
// Forward path:
//   report_due → report_generated → submitted_to_tr → tr_acknowledged →
//   reconciled → confirmed_complete
//
// Branch states:
//   tr_rejected     — TR NACK'd the submission → corrected → re-submit loop
//   break_identified / break_resolved — dual-sided reconciliation mismatch
//   exempted        — intragroup / de-minimis (no report required)
//   cancelled       — trade busted / errored (report withdrawn)
//
// Classes (reportable product): otc_derivative / physical_forward / spot_physical.
//
// Reportability (FSCA reporting supervisor inbox):
//   - sla_breach crosses for EVERY class (a late / missing report IS the FMA
//     violation — the universal hard line; thematic inversion)
//   - reject crosses for material classes (otc_derivative + physical_forward)
//   - flag_break crosses for otc_derivative only (the systemic-risk product)
//
// Write is open to admin / trader / support — a transaction-reporting obligation
// is the firm's own (no counterparty login). Each transition is tagged with the
// post-trade party (desk / reporting_ops / trade_repository) via actor_party
// derived from the action (audit attribution only, not access control).
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
  isReportableClass,
  partyForAction,
  SLA_MINUTES,
  type TradeReportStatus,
  type TradeReportAction,
  type TradeReportClass,
} from '../utils/trade-reporting-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'trader',
  'regulator',
]);

// No dedicated reporting-ops / TR login — the desk / admin / support users
// record every party's action; the post-trade party is captured via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'trader']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface TradeReportRow {
  id: string;
  report_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  desk_party_id: string;
  desk_party_name: string;
  trade_repository: string | null;
  uti: string | null;
  trade_ref: string | null;
  counterparty_name: string | null;
  counterparty_lei: string | null;
  energy_type: string | null;
  product: string | null;
  report_class: TradeReportClass;
  side: string | null;
  trade_date: string | null;
  value_date: string | null;
  reporting_deadline: string | null;
  notional_zar_m: number | null;
  volume_mwh: number | null;
  price_zar_mwh: number | null;
  collateral_zar_m: number | null;
  generation_ref: string | null;
  submission_ref: string | null;
  acknowledgement_ref: string | null;
  reconciliation_ref: string | null;
  break_ref: string | null;
  rejection_ref: string | null;
  correction_ref: string | null;
  exemption_ref: string | null;
  regulator_ref: string | null;
  generation_basis: string | null;
  submission_basis: string | null;
  reconciliation_basis: string | null;
  break_basis: string | null;
  rejection_basis: string | null;
  correction_basis: string | null;
  exemption_basis: string | null;
  reason_code: string | null;
  resolution_notes: string | null;
  chain_status: TradeReportStatus;
  report_due_at: string;
  report_generated_at: string | null;
  submitted_to_tr_at: string | null;
  tr_acknowledged_at: string | null;
  reconciled_at: string | null;
  break_identified_at: string | null;
  break_resolved_at: string | null;
  confirmed_complete_at: string | null;
  tr_rejected_at: string | null;
  corrected_at: string | null;
  exempted_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  resubmission_count: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TradeReportEventRow {
  id: string;
  report_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<TradeReportStatus, keyof TradeReportRow | null> = {
  report_due:         null,
  report_generated:   'report_generated_at',
  submitted_to_tr:    'submitted_to_tr_at',
  tr_acknowledged:    'tr_acknowledged_at',
  reconciled:         'reconciled_at',
  break_identified:   'break_identified_at',
  break_resolved:     'break_resolved_at',
  confirmed_complete: 'confirmed_complete_at',
  tr_rejected:        'tr_rejected_at',
  corrected:          'corrected_at',
  exempted:           'exempted_at',
  cancelled:          'cancelled_at',
};

function decorate(row: TradeReportRow, now: Date) {
  const klass = row.report_class;
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
    sla_window_minutes: SLA_MINUTES[status]?.[klass] ?? 0,
    is_reportable_class: isReportableClass(klass),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(klass),
  };
}

function eventTypeFor(action: TradeReportAction): string {
  switch (action) {
    case 'generate_report':  return 'trade_report.report_generated';
    case 'submit':           return 'trade_report.submitted_to_tr';
    case 'acknowledge':      return 'trade_report.tr_acknowledged';
    case 'reconcile':        return 'trade_report.reconciled';
    case 'flag_break':       return 'trade_report.break_identified';
    case 'resolve_break':    return 'trade_report.break_resolved';
    case 'correct':          return 'trade_report.corrected';
    case 'confirm_complete': return 'trade_report.confirmed_complete';
    case 'reject':           return 'trade_report.tr_rejected';
    case 'exempt':           return 'trade_report.exempted';
    case 'cancel':           return 'trade_report.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const report_class  = c.req.query('report_class');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const desk_party_id = c.req.query('desk_party_id');
  const product       = c.req.query('product');

  let sql = 'SELECT * FROM oe_trade_reports WHERE 1=1';
  const binds: unknown[] = [];
  if (report_class)  { sql += ' AND report_class = ?';  binds.push(report_class); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }
  if (desk_party_id) { sql += ' AND desk_party_id = ?'; binds.push(desk_party_id); }
  if (product)       { sql += ' AND product = ?';       binds.push(product); }

  sql += ' ORDER BY datetime(report_due_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<TradeReportRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_class[i.report_class]  = (by_class[i.report_class] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const confirmed_count   = items.filter((i) => i.chain_status === 'confirmed_complete').length;
  const reconciled_count  = items.filter((i) => i.chain_status === 'reconciled').length;
  const break_open        = items.filter((i) => i.chain_status === 'break_identified').length;
  const rejected_open     = items.filter((i) => i.chain_status === 'tr_rejected').length;
  const exempted_count    = items.filter((i) => i.chain_status === 'exempted').length;
  const cancelled_count   = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable_class).length;
  const otc_open          = items.filter((i) => !i.is_terminal && i.report_class === 'otc_derivative').length;
  const total_notional_zar_m   = items.reduce((sum, i) => sum + (i.notional_zar_m || 0), 0);
  const total_collateral_zar_m = items.reduce((sum, i) => sum + (i.collateral_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_class,
      open_count,
      confirmed_count,
      reconciled_count,
      break_open,
      rejected_open,
      exempted_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      otc_open,
      total_notional_zar_m,
      total_collateral_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_trade_reports WHERE id = ?').bind(id).first<TradeReportRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_trade_reports_events WHERE report_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<TradeReportEventRow>();

  return c.json({
    success: true,
    data: {
      report: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface GenerateBody {
  uti?: string;
  generation_ref?: string;
  generation_basis?: string;
  notes?: string;
}

interface SubmitBody {
  submission_ref?: string;
  submission_basis?: string;
  notes?: string;
}

interface AcknowledgeBody {
  acknowledgement_ref?: string;
  notes?: string;
}

interface ReconcileBody {
  reconciliation_ref?: string;
  reconciliation_basis?: string;
  notes?: string;
}

interface BreakBody {
  break_ref?: string;
  break_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface ResolveBreakBody {
  reconciliation_ref?: string;
  resolution_notes?: string;
  notes?: string;
}

interface RejectBody {
  rejection_ref?: string;
  rejection_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface CorrectBody {
  correction_ref?: string;
  correction_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface ConfirmBody {
  reason_code?: string;
  resolution_notes?: string;
  notes?: string;
}

interface ExemptBody {
  exemption_ref?: string;
  exemption_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface CancelBody {
  reason_code?: string;
  resolution_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: TradeReportAction,
  bodyHandler?: (row: TradeReportRow, body: Record<string, unknown>) => Partial<TradeReportRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_trade_reports WHERE id = ?').bind(id).first<TradeReportRow>();
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
  const sla = slaDeadlineFor(to, row.report_class, now);
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
    `UPDATE oe_trade_reports SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `trpt_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'trade_report',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.report_class),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_trade_reports WHERE id = ?').bind(id).first<TradeReportRow>();
  return c.json({ success: true, data: { report: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/generate-report', async (c) => transition(c, 'generate_report', (_row, body) => {
  const b = body as Partial<GenerateBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.uti === 'string')              out.uti = b.uti;
  if (typeof b.generation_ref === 'string')   out.generation_ref = b.generation_ref;
  if (typeof b.generation_basis === 'string') out.generation_basis = b.generation_basis;
  return out;
}));

app.post('/:id/submit', async (c) => transition(c, 'submit', (row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.submission_ref === 'string')   out.submission_ref = b.submission_ref;
  if (typeof b.submission_basis === 'string') out.submission_basis = b.submission_basis;
  // A re-submission after a correction increments the resubmission counter.
  if (row.chain_status === 'corrected') out.resubmission_count = (row.resubmission_count || 0) + 1;
  return out;
}));

app.post('/:id/acknowledge', async (c) => transition(c, 'acknowledge', (_row, body) => {
  const b = body as Partial<AcknowledgeBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.acknowledgement_ref === 'string') out.acknowledgement_ref = b.acknowledgement_ref;
  return out;
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.reconciliation_ref === 'string')   out.reconciliation_ref = b.reconciliation_ref;
  if (typeof b.reconciliation_basis === 'string') out.reconciliation_basis = b.reconciliation_basis;
  return out;
}));

app.post('/:id/flag-break', async (c) => transition(c, 'flag_break', (_row, body) => {
  const b = body as Partial<BreakBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.break_ref === 'string')   out.break_ref = b.break_ref;
  if (typeof b.break_basis === 'string') out.break_basis = b.break_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-break', async (c) => transition(c, 'resolve_break', (_row, body) => {
  const b = body as Partial<ResolveBreakBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.reconciliation_ref === 'string') out.reconciliation_ref = b.reconciliation_ref;
  if (typeof b.resolution_notes === 'string')   out.resolution_notes = b.resolution_notes;
  return out;
}));

app.post('/:id/correct', async (c) => transition(c, 'correct', (_row, body) => {
  const b = body as Partial<CorrectBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.correction_ref === 'string')   out.correction_ref = b.correction_ref;
  if (typeof b.correction_basis === 'string') out.correction_basis = b.correction_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/confirm-complete', async (c) => transition(c, 'confirm_complete', (_row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.resolution_notes === 'string')  out.resolution_notes = b.resolution_notes;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/exempt', async (c) => transition(c, 'exempt', (_row, body) => {
  const b = body as Partial<ExemptBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.exemption_ref === 'string')   out.exemption_ref = b.exemption_ref;
  if (typeof b.exemption_basis === 'string') out.exemption_basis = b.exemption_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<TradeReportRow> = {};
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.resolution_notes === 'string') out.resolution_notes = b.resolution_notes;
  return out;
}));

export async function tradeReportingSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_trade_reports
     WHERE chain_status NOT IN ('confirmed_complete','exempted','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<TradeReportRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_trade_reports
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `trpt_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'trade_report.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past regulatory SLA (class ${row.report_class})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // Thematic inversion: a late / missing transaction report IS the FMA
    // violation, so the breach crosses to the FSCA supervisor for EVERY class.
    if (slaBreachCrossesIntoRegulator(row.report_class)) {
      await fireCascade({
        event: 'trade_report.sla_breached',
        actor_id: 'system',
        entity_type: 'trade_report',
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
