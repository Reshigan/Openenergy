// ═══════════════════════════════════════════════════════════════════════════
// Wave 80 — OEM-Support Service-Contract / AMC Renewal, Entitlement & Coverage.
//
// Mounted at /api/service-contract/chain.
//
// The COMMERCIAL GATE of the OEM-Support profile: the contract that decides
// whether a deployed asset can get manufacturer support at all, at what
// response-time service level, and within what entitlement limits. Every other
// OEM-Support chain runs UNDER a service contract — a ticket (W14) is answered
// to the contract's response-time SLA, an RMA (W15) draws on its parts
// allowance, a spare (W72) is provisioned against its coverage — but none manage
// the contract itself: its quote, activation, the annual renewal loop,
// suspension for non-payment, the grace buffer, and the coverage gap that opens
// when it lapses. W80 is that missing layer.
//
// DISTINCTIVE move (beat ServiceMax / SAP Service Cloud / Salesforce Field
// Service entitlements / IFS): the entitlement is LIVE-WIRED into the platform
// as a real coverage gate, the renewal urgency is COVERAGE-GAP-aware (mission-
// critical is chased fastest), and a lapse on important coverage crosses to the
// regulator as a security-of-supply concern.
//
// Write model — SINGLE-PARTY {admin, support}. READ all nine personas. The
// actor_party (account_manager / service_desk / finance) records the functional
// owner per step, not the JWT role.
//
// Reportability (the W80 SIGNATURE is COVERAGE-GAP-driven):
//   expire_coverage crosses for HIGH tiers; suspend_coverage / cancel_contract
//   cross for mission_critical only; sla_breached crosses HIGH.
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
  isCoverageGap,
  partyForAction,
  SLA_MINUTES,
  type ContractStatus,
  type ContractAction,
  type CoverageTier,
} from '../utils/service-contract-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund', 'esco',
]);

// SINGLE-PARTY write — the OEM-Support desk owns the whole record. actor_party
// is functional attribution only (account_manager / service_desk / finance).
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ContractRow {
  id: string;
  contract_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  customer_party_id: string | null;
  customer_name: string;
  oem_name: string | null;
  site_id: string | null;
  site_name: string | null;
  product_line: string | null;
  contract_type: string | null;
  coverage_tier: CoverageTier;
  covered_fault_classes: string | null;
  covered_assets: string | null;
  response_sla_minutes: number | null;
  preventive_visits_included: number | null;
  preventive_visits_consumed: number;
  parts_allowance_zar: number | null;
  parts_consumed_zar: number;
  currency: string | null;
  annual_value_zar: number;
  term_days: number | null;
  term_start: string | null;
  term_end: string | null;
  renewal_window_days: number;
  renewal_uplift_pct: number | null;
  renewal_value_zar: number | null;
  refund_zar: number | null;
  account_manager_name: string | null;
  service_desk_name: string | null;
  finance_contact_name: string | null;
  reason_code: string | null;
  suspend_reason: string | null;
  quote_ref: string | null;
  acceptance_ref: string | null;
  activation_ref: string | null;
  renewal_ref: string | null;
  renewal_quote_ref: string | null;
  negotiation_ref: string | null;
  grace_ref: string | null;
  suspension_ref: string | null;
  reinstatement_ref: string | null;
  expiry_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  quote_basis: string | null;
  acceptance_basis: string | null;
  activation_basis: string | null;
  renewal_basis: string | null;
  renewal_quote_basis: string | null;
  negotiation_basis: string | null;
  grace_basis: string | null;
  suspension_basis: string | null;
  reinstatement_basis: string | null;
  expiry_basis: string | null;
  cancellation_basis: string | null;
  notes: string | null;
  chain_status: ContractStatus;
  draft_at: string;
  quoted_at: string | null;
  pending_activation_at: string | null;
  active_at: string | null;
  renewal_due_at: string | null;
  renewal_quoted_at: string | null;
  negotiating_at: string | null;
  in_grace_at: string | null;
  suspended_at: string | null;
  renewed_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ContractEventRow {
  id: string;
  contract_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ContractStatus, keyof ContractRow | null> = {
  draft:              null,
  quoted:             'quoted_at',
  pending_activation: 'pending_activation_at',
  active:             'active_at',
  renewal_due:        'renewal_due_at',
  renewal_quoted:     'renewal_quoted_at',
  negotiating:        'negotiating_at',
  in_grace:           'in_grace_at',
  suspended:          'suspended_at',
  renewed:            'renewed_at',
  expired:            'expired_at',
  cancelled:          'cancelled_at',
};

function decorate(row: ContractRow, now: Date) {
  const tier = row.coverage_tier;
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
    is_reportable_flag: !!row.is_reportable,
    coverage_gap: isCoverageGap(status),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// activate_coverage and reinstate_coverage both land in 'active', so they share
// the 'service_contract.active' event name.
function eventTypeFor(action: ContractAction): string {
  switch (action) {
    case 'issue_quote':         return 'service_contract.quoted';
    case 'accept_quote':        return 'service_contract.pending_activation';
    case 'activate_coverage':   return 'service_contract.active';
    case 'open_renewal':        return 'service_contract.renewal_due';
    case 'issue_renewal_quote': return 'service_contract.renewal_quoted';
    case 'begin_negotiation':   return 'service_contract.negotiating';
    case 'confirm_renewal':     return 'service_contract.renewed';
    case 'enter_grace':         return 'service_contract.in_grace';
    case 'suspend_coverage':    return 'service_contract.suspended';
    case 'reinstate_coverage':  return 'service_contract.active';
    case 'expire_coverage':     return 'service_contract.expired';
    case 'cancel_contract':     return 'service_contract.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const coverage_tier     = c.req.query('coverage_tier');
  const status            = c.req.query('status');
  const contract_type     = c.req.query('contract_type');
  const customer_party_id = c.req.query('customer_party_id');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_service_contracts WHERE 1=1';
  const binds: unknown[] = [];
  if (coverage_tier)     { sql += ' AND coverage_tier = ?'; binds.push(coverage_tier); }
  if (status)            { sql += ' AND chain_status = ?'; binds.push(status); }
  if (contract_type)     { sql += ' AND contract_type = ?'; binds.push(contract_type); }
  if (customer_party_id) { sql += ' AND customer_party_id = ?'; binds.push(customer_party_id); }

  sql += ' ORDER BY datetime(draft_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ContractRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.coverage_tier] = (by_tier[i.coverage_tier] || 0) + 1;
    if (i.contract_type) by_type[i.contract_type] = (by_type[i.contract_type] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const active_count       = items.filter((i) => i.chain_status === 'active').length;
  const renewal_pipeline   = items.filter((i) =>
    i.chain_status === 'renewal_due' ||
    i.chain_status === 'renewal_quoted' ||
    i.chain_status === 'negotiating').length;
  const in_grace_count     = items.filter((i) => i.chain_status === 'in_grace').length;
  const suspended_count    = items.filter((i) => i.chain_status === 'suspended').length;
  const renewed_count      = items.filter((i) => i.chain_status === 'renewed').length;
  const expired_count      = items.filter((i) => i.chain_status === 'expired').length;
  const cancelled_count    = items.filter((i) => i.chain_status === 'cancelled').length;
  const coverage_gap_count = items.filter((i) => i.coverage_gap).length;
  const breached_count     = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const total_annual_value_zar  = items.reduce((sum, i) => sum + (i.annual_value_zar || 0), 0);
  const total_renewal_value_zar = items.reduce((sum, i) => sum + (i.renewal_value_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_type,
      open_count,
      active_count,
      renewal_pipeline,
      in_grace_count,
      suspended_count,
      renewed_count,
      expired_count,
      cancelled_count,
      coverage_gap_count,
      breached: breached_count,
      reportable_total,
      total_annual_value_zar,
      total_renewal_value_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_service_contracts WHERE id = ?').bind(id).first<ContractRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_service_contract_events WHERE contract_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ContractEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface QuoteBody {
  quote_basis?: string;
  quote_ref?: string;
  annual_value_zar?: number;
  notes?: string;
}
interface AcceptBody {
  acceptance_basis?: string;
  acceptance_ref?: string;
  notes?: string;
}
interface ActivateBody {
  activation_basis?: string;
  activation_ref?: string;
  term_start?: string;
  term_end?: string;
  term_days?: number;
  notes?: string;
}
interface OpenRenewalBody {
  renewal_basis?: string;
  renewal_ref?: string;
  notes?: string;
}
interface RenewalQuoteBody {
  renewal_quote_basis?: string;
  renewal_quote_ref?: string;
  renewal_value_zar?: number;
  renewal_uplift_pct?: number;
  notes?: string;
}
interface NegotiationBody {
  negotiation_basis?: string;
  negotiation_ref?: string;
  notes?: string;
}
interface ConfirmRenewalBody {
  renewal_basis?: string;
  renewal_ref?: string;
  renewal_value_zar?: number;
  term_start?: string;
  term_end?: string;
  notes?: string;
}
interface GraceBody {
  grace_basis?: string;
  grace_ref?: string;
  notes?: string;
}
interface SuspendBody {
  suspension_basis?: string;
  suspension_ref?: string;
  suspend_reason?: string;
  reason_code?: string;
  notes?: string;
}
interface ReinstateBody {
  reinstatement_basis?: string;
  reinstatement_ref?: string;
  notes?: string;
}
interface ExpireBody {
  expiry_basis?: string;
  expiry_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface CancelBody {
  cancellation_basis?: string;
  cancellation_ref?: string;
  reason_code?: string;
  refund_zar?: number;
  regulator_ref?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ContractAction,
  bodyHandler?: (row: ContractRow, body: Record<string, unknown>) => Partial<ContractRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_service_contracts WHERE id = ?').bind(id).first<ContractRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The coverage tier is an explicit contract attribute, not a derived figure —
  // it drives the renewal-window SLA and the regulator crossings unchanged.
  const tier = row.coverage_tier;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  // is_reportable is a stable property of the coverage tier (HIGH = reportable);
  // recompute it each transition and force it on when an action crosses.
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

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
    `UPDATE oe_service_contracts SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `svc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_service_contract_events (id, contract_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'service_contract',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      coverage_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_service_contracts WHERE id = ?').bind(id).first<ContractRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/issue-quote', async (c) => transition(c, 'issue_quote', (_row, body) => {
  const b = body as Partial<QuoteBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.quote_basis === 'string')      out.quote_basis = b.quote_basis;
  if (typeof b.quote_ref === 'string')        out.quote_ref = b.quote_ref;
  if (typeof b.annual_value_zar === 'number') out.annual_value_zar = b.annual_value_zar;
  return out;
}));

app.post('/:id/accept-quote', async (c) => transition(c, 'accept_quote', (_row, body) => {
  const b = body as Partial<AcceptBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.acceptance_basis === 'string') out.acceptance_basis = b.acceptance_basis;
  if (typeof b.acceptance_ref === 'string')   out.acceptance_ref = b.acceptance_ref;
  return out;
}));

app.post('/:id/activate-coverage', async (c) => transition(c, 'activate_coverage', (_row, body) => {
  const b = body as Partial<ActivateBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.activation_basis === 'string') out.activation_basis = b.activation_basis;
  if (typeof b.activation_ref === 'string')   out.activation_ref = b.activation_ref;
  if (typeof b.term_start === 'string')       out.term_start = b.term_start;
  if (typeof b.term_end === 'string')         out.term_end = b.term_end;
  if (typeof b.term_days === 'number')        out.term_days = b.term_days;
  return out;
}));

app.post('/:id/open-renewal', async (c) => transition(c, 'open_renewal', (_row, body) => {
  const b = body as Partial<OpenRenewalBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.renewal_basis === 'string') out.renewal_basis = b.renewal_basis;
  if (typeof b.renewal_ref === 'string')   out.renewal_ref = b.renewal_ref;
  return out;
}));

app.post('/:id/issue-renewal-quote', async (c) => transition(c, 'issue_renewal_quote', (_row, body) => {
  const b = body as Partial<RenewalQuoteBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.renewal_quote_basis === 'string') out.renewal_quote_basis = b.renewal_quote_basis;
  if (typeof b.renewal_quote_ref === 'string')   out.renewal_quote_ref = b.renewal_quote_ref;
  if (typeof b.renewal_value_zar === 'number')   out.renewal_value_zar = b.renewal_value_zar;
  if (typeof b.renewal_uplift_pct === 'number')  out.renewal_uplift_pct = b.renewal_uplift_pct;
  return out;
}));

app.post('/:id/begin-negotiation', async (c) => transition(c, 'begin_negotiation', (_row, body) => {
  const b = body as Partial<NegotiationBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.negotiation_basis === 'string') out.negotiation_basis = b.negotiation_basis;
  if (typeof b.negotiation_ref === 'string')   out.negotiation_ref = b.negotiation_ref;
  return out;
}));

app.post('/:id/confirm-renewal', async (c) => transition(c, 'confirm_renewal', (_row, body) => {
  const b = body as Partial<ConfirmRenewalBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.renewal_basis === 'string')     out.renewal_basis = b.renewal_basis;
  if (typeof b.renewal_ref === 'string')       out.renewal_ref = b.renewal_ref;
  if (typeof b.renewal_value_zar === 'number') out.renewal_value_zar = b.renewal_value_zar;
  if (typeof b.term_start === 'string')        out.term_start = b.term_start;
  if (typeof b.term_end === 'string')          out.term_end = b.term_end;
  return out;
}));

app.post('/:id/enter-grace', async (c) => transition(c, 'enter_grace', (_row, body) => {
  const b = body as Partial<GraceBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.grace_basis === 'string') out.grace_basis = b.grace_basis;
  if (typeof b.grace_ref === 'string')   out.grace_ref = b.grace_ref;
  return out;
}));

app.post('/:id/suspend-coverage', async (c) => transition(c, 'suspend_coverage', (row, body) => {
  const b = body as Partial<SuspendBody>;
  const out: Partial<ContractRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.suspension_basis === 'string') out.suspension_basis = b.suspension_basis;
  if (typeof b.suspension_ref === 'string')   out.suspension_ref = b.suspension_ref;
  if (typeof b.suspend_reason === 'string')   out.suspend_reason = b.suspend_reason;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reinstate-coverage', async (c) => transition(c, 'reinstate_coverage', (_row, body) => {
  const b = body as Partial<ReinstateBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.reinstatement_basis === 'string') out.reinstatement_basis = b.reinstatement_basis;
  if (typeof b.reinstatement_ref === 'string')   out.reinstatement_ref = b.reinstatement_ref;
  return out;
}));

app.post('/:id/expire-coverage', async (c) => transition(c, 'expire_coverage', (_row, body) => {
  const b = body as Partial<ExpireBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.expiry_basis === 'string')  out.expiry_basis = b.expiry_basis;
  if (typeof b.expiry_ref === 'string')    out.expiry_ref = b.expiry_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/cancel-contract', async (c) => transition(c, 'cancel_contract', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<ContractRow> = {};
  if (typeof b.cancellation_basis === 'string') out.cancellation_basis = b.cancellation_basis;
  if (typeof b.cancellation_ref === 'string')   out.cancellation_ref = b.cancellation_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.refund_zar === 'number')         out.refund_zar = b.refund_zar;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  return out;
}));

export async function serviceContractSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_service_contracts
     WHERE chain_status NOT IN ('renewed','expired','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ContractRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_service_contracts
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `svc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_service_contract_events (id, contract_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'service_contract.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past renewal-window SLA (tier ${row.coverage_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.coverage_tier)) {
      await fireCascade({
        event: 'service_contract.sla_breached',
        actor_id: 'system',
        entity_type: 'service_contract',
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
