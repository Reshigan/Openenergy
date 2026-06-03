// ═══════════════════════════════════════════════════════════════════════════
// Wave 30 — Lender Disbursement UoP Reconciliation chain — SARB + Equator P.
//
// Mounted at /api/disbursement/chain.
//
// 10-state lifecycle layered on every funded drawdown tranche (W21):
//   tranche_released → invoices_pending → invoices_submitted →
//   bank_validating → ie_certifying → uop_certified → reconciled
//
// Terminals: reconciled (good), clawback_executed (bad), waived (special).
//
// Tiers (tranche size):
//   senior_a   — R500m+ tranche
//   senior_b   — R100–R500m tranche
//   mezzanine  — R20–R100m
//   bridge     — <R20m
//
// INVERTED tier SLAs — bigger tranche gets more documentation time.
//
// Reportability (SARB Exchange Control + Equator Principles secretariat):
//   - demand_clawback crosses for ALL tiers (universal hard line)
//   - sla_breached crosses for senior_a + senior_b only
//
// Split-write roles (third lender↔borrower pattern):
//   LENDER_WRITE   — request_invoices, begin_validation, request_ie,
//                    accept_ie, close_reconciliation, demand_clawback, waive
//   BORROWER_WRITE — submit_invoices (only borrower submits their own docs)
//   READ           — admin, support, lender, ipp, regulator
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
  type DisbursementStatus,
  type DisbursementAction,
  type DisbursementTier,
} from '../utils/disbursement-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'lender', 'funder',
  'ipp', 'ipp_developer',
  'regulator',
]);
const LENDER_WRITE_ROLES = new Set([
  'admin', 'support',
  'lender', 'funder',
]);
const BORROWER_WRITE_ROLES = new Set([
  'admin', 'support',
  'lender', 'funder',
  'ipp', 'ipp_developer',
]);

const ACTION_ROLE_SET: Record<DisbursementAction, Set<string>> = {
  request_invoices:     LENDER_WRITE_ROLES,
  submit_invoices:      BORROWER_WRITE_ROLES,
  begin_validation:     LENDER_WRITE_ROLES,
  request_ie:           LENDER_WRITE_ROLES,
  accept_ie:            LENDER_WRITE_ROLES,
  close_reconciliation: LENDER_WRITE_ROLES,
  demand_clawback:      LENDER_WRITE_ROLES,
  waive:                LENDER_WRITE_ROLES,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface DisbursementRow {
  id: string;
  case_number: string;
  lender_party: string;
  borrower_party: string;
  project_id: string | null;
  project_name: string | null;
  drawdown_ref: string | null;
  facility_ref: string;
  tranche_tier: DisbursementTier;
  tranche_amount_zar: number;
  released_zar: number | null;
  invoices_amount_zar: number | null;
  reconciled_amount_zar: number | null;
  clawback_amount_zar: number | null;
  invoice_count: number | null;
  uop_category: string | null;
  ie_firm: string | null;
  ie_certificate_ref: string | null;
  sarb_exchange_control_ref: string | null;
  equator_principles_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: DisbursementStatus;
  tranche_released_at: string;
  invoices_pending_at: string | null;
  invoices_submitted_at: string | null;
  bank_validating_at: string | null;
  ie_certifying_at: string | null;
  uop_certified_at: string | null;
  reconciled_at: string | null;
  clawback_executed_at: string | null;
  waived_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  disbursement_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<DisbursementStatus, keyof DisbursementRow | null> = {
  tranche_released:    null,
  invoices_pending:    'invoices_pending_at',
  invoices_submitted:  'invoices_submitted_at',
  bank_validating:     'bank_validating_at',
  ie_certifying:       'ie_certifying_at',
  uop_certified:       'uop_certified_at',
  reconciled:          'reconciled_at',
  clawback_executed:   'clawback_executed_at',
  waived:              'waived_at',
};

function decorate(row: DisbursementRow, now: Date) {
  const tier = row.tranche_tier;
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

function eventTypeFor(action: DisbursementAction): string {
  switch (action) {
    case 'request_invoices':     return 'invoices_pending';
    case 'submit_invoices':      return 'invoices_submitted';
    case 'begin_validation':     return 'bank_validating';
    case 'request_ie':           return 'ie_certifying';
    case 'accept_ie':            return 'uop_certified';
    case 'close_reconciliation': return 'reconciled';
    case 'demand_clawback':      return 'clawback_executed';
    case 'waive':                return 'waived';
  }
}

function cascadeEventFor(action: DisbursementAction): string {
  switch (action) {
    case 'request_invoices':     return 'disbursement.invoices_pending';
    case 'submit_invoices':      return 'disbursement.invoices_submitted';
    case 'begin_validation':     return 'disbursement.bank_validating';
    case 'request_ie':           return 'disbursement.ie_certifying';
    case 'accept_ie':            return 'disbursement.uop_certified';
    case 'close_reconciliation': return 'disbursement.reconciled';
    case 'demand_clawback':      return 'disbursement.clawback_executed';
    case 'waive':                return 'disbursement.waived';
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
  const lender_party = c.req.query('lender_party');
  const borrower_party = c.req.query('borrower_party');
  const project_id = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_disbursement_cases WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)            { sql += ' AND tranche_tier = ?';   binds.push(tier); }
  if (status)          { sql += ' AND chain_status = ?';   binds.push(status); }
  if (lender_party)    { sql += ' AND lender_party = ?';   binds.push(lender_party); }
  if (borrower_party)  { sql += ' AND borrower_party = ?'; binds.push(borrower_party); }
  if (project_id)      { sql += ' AND project_id = ?';     binds.push(project_id); }

  sql += ' ORDER BY datetime(tranche_released_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<DisbursementRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.tranche_tier] = (by_tier[i.tranche_tier] || 0) + 1;
  }

  const documentation_open = items.filter(
    (i) => i.chain_status === 'invoices_pending' || i.chain_status === 'invoices_submitted',
  ).length;
  const validation_open = items.filter(
    (i) => i.chain_status === 'bank_validating',
  ).length;
  const ie_open = items.filter(
    (i) => i.chain_status === 'ie_certifying' || i.chain_status === 'uop_certified',
  ).length;
  const reconciled_count = items.filter((i) => i.chain_status === 'reconciled').length;
  const clawback_count = items.filter((i) => i.chain_status === 'clawback_executed').length;
  const waived_count = items.filter((i) => i.chain_status === 'waived').length;
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const tranche_released_total_zar = items.reduce(
    (s, i) => s + (i.released_zar || 0), 0,
  );
  const reconciled_total_zar = items
    .filter((i) => i.chain_status === 'reconciled')
    .reduce((s, i) => s + (i.reconciled_amount_zar || i.released_zar || 0), 0);
  const clawback_total_zar = items.reduce(
    (s, i) => s + (i.clawback_amount_zar || 0), 0,
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      documentation_open,
      validation_open,
      ie_open,
      reconciled_count,
      clawback_count,
      waived_count,
      open_count,
      breached: breached_count,
      tranche_released_total_zar,
      reconciled_total_zar,
      clawback_total_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  // admin/support/regulator have platform-wide read; lender/ipp scoped to their party
  const PLATFORM_WIDE = new Set(['admin', 'support', 'regulator']);
  let row: DisbursementRow | null;
  if (PLATFORM_WIDE.has(user.role)) {
    row = await c.env.DB.prepare('SELECT * FROM oe_disbursement_cases WHERE id = ?').bind(id).first<DisbursementRow>();
  } else {
    row = await c.env.DB.prepare(
      'SELECT * FROM oe_disbursement_cases WHERE id = ? AND (lender_party = ? OR borrower_party = ?)',
    ).bind(id, user.id, user.id).first<DisbursementRow>();
  }
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_disbursement_events WHERE disbursement_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitInvoicesBody {
  invoices_amount_zar?: number;
  invoice_count?: number;
  uop_category?: string;
  notes?: string;
}

interface RequestIeBody {
  ie_firm?: string;
  notes?: string;
}

interface AcceptIeBody {
  ie_certificate_ref?: string;
  notes?: string;
}

interface CloseReconBody {
  reconciled_amount_zar?: number;
  sarb_exchange_control_ref?: string;
  notes?: string;
}

interface ClawbackBody {
  clawback_amount_zar?: number;
  reason_code?: string;
  rod_notes?: string;
  sarb_exchange_control_ref?: string;
  equator_principles_ref?: string;
  notes?: string;
}

interface WaiveBody {
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: DisbursementAction,
  bodyHandler?: (row: DisbursementRow, body: Record<string, unknown>) => Partial<DisbursementRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  // Scope the fetch to the requesting user's party to prevent cross-tenant transitions.
  // admin/support can act on any case.
  const TRANSITION_PLATFORM_WIDE = new Set(['admin', 'support']);
  let row: DisbursementRow | null;
  if (TRANSITION_PLATFORM_WIDE.has(user.role)) {
    row = await c.env.DB.prepare('SELECT * FROM oe_disbursement_cases WHERE id = ?').bind(id).first<DisbursementRow>();
  } else {
    row = await c.env.DB.prepare(
      'SELECT * FROM oe_disbursement_cases WHERE id = ? AND (lender_party = ? OR borrower_party = ?)',
    ).bind(id, user.id, user.id).first<DisbursementRow>();
  }
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
  const sla = slaDeadlineFor(to, row.tranche_tier, now);
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
    `UPDATE oe_disbursement_cases SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `dsb_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_disbursement_events (id, disbursement_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'disbursement_case',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.tranche_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_disbursement_cases WHERE id = ?').bind(id).first<DisbursementRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/request-invoices', async (c) => transition(c, 'request_invoices'));

app.post('/:id/submit-invoices', async (c) => transition(c, 'submit_invoices', (_row, body) => {
  const b = body as Partial<SubmitInvoicesBody>;
  const out: Partial<DisbursementRow> = {};
  if (typeof b.invoices_amount_zar === 'number') out.invoices_amount_zar = b.invoices_amount_zar;
  if (typeof b.invoice_count === 'number')        out.invoice_count = b.invoice_count;
  if (typeof b.uop_category === 'string')          out.uop_category = b.uop_category;
  return out;
}));

app.post('/:id/begin-validation', async (c) => transition(c, 'begin_validation'));

app.post('/:id/request-ie', async (c) => transition(c, 'request_ie', (_row, body) => {
  const b = body as Partial<RequestIeBody>;
  const out: Partial<DisbursementRow> = {};
  if (typeof b.ie_firm === 'string') out.ie_firm = b.ie_firm;
  return out;
}));

app.post('/:id/accept-ie', async (c) => transition(c, 'accept_ie', (_row, body) => {
  const b = body as Partial<AcceptIeBody>;
  const out: Partial<DisbursementRow> = {};
  if (typeof b.ie_certificate_ref === 'string') out.ie_certificate_ref = b.ie_certificate_ref;
  return out;
}));

app.post('/:id/close-reconciliation', async (c) => transition(c, 'close_reconciliation', (_row, body) => {
  const b = body as Partial<CloseReconBody>;
  const out: Partial<DisbursementRow> = {};
  if (typeof b.reconciled_amount_zar === 'number')      out.reconciled_amount_zar = b.reconciled_amount_zar;
  if (typeof b.sarb_exchange_control_ref === 'string')  out.sarb_exchange_control_ref = b.sarb_exchange_control_ref;
  return out;
}));

app.post('/:id/demand-clawback', async (c) => transition(c, 'demand_clawback', (_row, body) => {
  const b = body as Partial<ClawbackBody>;
  const out: Partial<DisbursementRow> = {};
  if (typeof b.clawback_amount_zar === 'number')         out.clawback_amount_zar = b.clawback_amount_zar;
  if (typeof b.reason_code === 'string')                  out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')                    out.rod_notes = b.rod_notes;
  if (typeof b.sarb_exchange_control_ref === 'string')    out.sarb_exchange_control_ref = b.sarb_exchange_control_ref;
  if (typeof b.equator_principles_ref === 'string')       out.equator_principles_ref = b.equator_principles_ref;
  return out;
}));

app.post('/:id/waive', async (c) => transition(c, 'waive', (_row, body) => {
  const b = body as Partial<WaiveBody>;
  const out: Partial<DisbursementRow> = {};
  if (typeof b.rod_notes === 'string') out.rod_notes = b.rod_notes;
  return out;
}));

export async function disbursementSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_disbursement_cases
     WHERE chain_status NOT IN ('reconciled','clawback_executed','waived')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<DisbursementRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_disbursement_cases
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `dsb_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_disbursement_events (id, disbursement_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.tranche_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.tranche_tier)) {
      await fireCascade({
        event: 'disbursement.sla_breached',
        actor_id: 'system',
        entity_type: 'disbursement_case',
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
