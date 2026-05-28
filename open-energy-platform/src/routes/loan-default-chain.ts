// ═══════════════════════════════════════════════════════════════════════════
// Wave 45 — Lender Loan Default & Enforcement / Step-in chain
//
// Mounted at /api/loan-default/chain.
//
// The ENFORCEMENT backbone of project finance. When a borrower defaults — a
// payment miss, a covenant breach crystallising into an event of default, an
// insolvency trigger — the lender works the position through reservation of
// rights, a formal default notice, a cure window, acceleration, standstill
// (forbearance), and ultimately security enforcement / step-in, restructure, or
// write-off.
//
// Sits DOWNSTREAM of the monitoring chains: W38 covenant certificates (an
// accelerated certificate feeds a default flag), the W6 dunning cycles (a
// cycle-3 expiry feeds a default flag), and the one-off W21 drawdown / W30
// disbursement-UoP chains (a UoP diversion is an event of default). Where W38
// ENDS at acceleration, W45 PICKS UP at the default and runs to enforcement.
//
// Forward-to-cure path:
//   default_flagged → under_review → reservation_of_rights
//     → default_notice_issued → cure_period → cured
//   dismiss (false alarm): default_flagged|under_review → cured
//
// Enforcement branch:
//   accelerated → standstill → enforcement_commenced
//               → restructured / enforced_closed / written_off
//
// Tiers (facility seniority): senior_secured / mezzanine / subordinated.
//
// Frameworks: LMA event-of-default framework + SARB large-exposure / impairment
// reporting + SA Insolvency Act / Companies Act business-rescue (step-in) regime.
//
// SLA matrix is URGENT — senior secured gets the TIGHTEST windows (worked
// fastest). Reportability (regulator inbox):
//   - write_off (loss crystallised → SARB impairment) crosses for EVERY tier
//     (the universal hard line)
//   - accelerate (EoD) + commence_enforcement (security enforcement / step-in)
//     cross for senior_secured + mezzanine only
//   - sla_breached crosses for senior_secured + mezzanine only
//
// Two-party split write: the borrower (ipp_developer) effects the cure; the
// lender side (lender / admin / support) drives the workout; the security agent
// commences + closes enforcement. actor_party (borrower / lender / security_agent)
// is derived from the action, not the JWT role.
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
  isReportableTier,
  isBorrowerAction,
  partyForAction,
  SLA_MINUTES,
  type LoanDefaultStatus,
  type LoanDefaultAction,
  type LoanDefaultTier,
} from '../utils/loan-default-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'lender',
  'ipp_developer',
  'regulator',
]);

// Two-party split write. The borrower side (the project company = ipp_developer)
// can only effect the cure; the lender side runs review, notice, acceleration,
// standstill, restructure, write-off, and the security agent (lender side here)
// commences + closes enforcement.
const LENDER_WRITE_ROLES   = new Set(['admin', 'support', 'lender']);
const BORROWER_WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface LoanDefaultRow {
  id: string;
  default_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  borrower_party_id: string;
  borrower_party_name: string;
  lender_name: string | null;
  security_agent_name: string | null;
  facility_name: string;
  facility_tier: LoanDefaultTier;
  facility_limit: number | null;
  outstanding_principal: number | null;
  accelerated_amount: number | null;
  recovery_amount: number | null;
  write_off_amount: number | null;
  default_type: string | null;
  default_event: string | null;
  days_past_due: number | null;
  flag_ref: string | null;
  notice_ref: string | null;
  cure_ref: string | null;
  acceleration_ref: string | null;
  standstill_ref: string | null;
  enforcement_ref: string | null;
  restructure_ref: string | null;
  flag_basis: string | null;
  review_basis: string | null;
  notice_basis: string | null;
  cure_basis: string | null;
  acceleration_basis: string | null;
  standstill_basis: string | null;
  enforcement_basis: string | null;
  restructure_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: LoanDefaultStatus;
  default_flagged_at: string;
  under_review_at: string | null;
  reservation_of_rights_at: string | null;
  default_notice_issued_at: string | null;
  cure_period_at: string | null;
  accelerated_at: string | null;
  standstill_at: string | null;
  enforcement_commenced_at: string | null;
  cured_at: string | null;
  restructured_at: string | null;
  enforced_closed_at: string | null;
  written_off_at: string | null;
  cure_deadline_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LoanDefaultEventRow {
  id: string;
  default_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LoanDefaultStatus, keyof LoanDefaultRow | null> = {
  default_flagged:        null,
  under_review:           'under_review_at',
  reservation_of_rights:  'reservation_of_rights_at',
  default_notice_issued:  'default_notice_issued_at',
  cure_period:            'cure_period_at',
  accelerated:            'accelerated_at',
  standstill:             'standstill_at',
  enforcement_commenced:  'enforcement_commenced_at',
  cured:                  'cured_at',
  restructured:           'restructured_at',
  enforced_closed:        'enforced_closed_at',
  written_off:            'written_off_at',
};

// States reached via the enforcement branch (downstream of acceleration).
const ENFORCEMENT_REACHED = new Set<LoanDefaultStatus>([
  'accelerated', 'standstill', 'enforcement_commenced', 'enforced_closed',
  'restructured', 'written_off',
]);
const ACTIVE_ENFORCEMENT = new Set<LoanDefaultStatus>([
  'accelerated', 'standstill', 'enforcement_commenced',
]);

function decorate(row: LoanDefaultRow, now: Date) {
  const tier = row.facility_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const reachedEnforcement = ENFORCEMENT_REACHED.has(status);
  // write_off crosses for every tier (universal hard line); the rest of the
  // enforcement branch crosses only for the reportable tiers.
  const isReportable = status === 'written_off'
    || (reachedEnforcement && isReportableTier(tier));
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: isReportable,
    reached_enforcement: reachedEnforcement,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: LoanDefaultAction): string {
  switch (action) {
    case 'begin_review':         return 'loan_default.under_review';
    case 'reserve_rights':       return 'loan_default.reservation_of_rights';
    case 'issue_default_notice': return 'loan_default.default_notice_issued';
    case 'open_cure_period':     return 'loan_default.cure_period';
    case 'confirm_cure':         return 'loan_default.cured';
    case 'dismiss':              return 'loan_default.cured';
    case 'accelerate':           return 'loan_default.accelerated';
    case 'agree_standstill':     return 'loan_default.standstill';
    case 'commence_enforcement': return 'loan_default.enforcement_commenced';
    case 'agree_restructure':    return 'loan_default.restructured';
    case 'close_enforcement':    return 'loan_default.enforced_closed';
    case 'write_off':            return 'loan_default.written_off';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const facility_tier     = c.req.query('facility_tier');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const borrower_party_id = c.req.query('borrower_party_id');
  const default_type      = c.req.query('default_type');

  let sql = 'SELECT * FROM oe_loan_defaults WHERE 1=1';
  const binds: unknown[] = [];
  if (facility_tier)     { sql += ' AND facility_tier = ?';     binds.push(facility_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (borrower_party_id) { sql += ' AND borrower_party_id = ?'; binds.push(borrower_party_id); }
  if (default_type)      { sql += ' AND default_type = ?';      binds.push(default_type); }

  sql += ' ORDER BY datetime(default_flagged_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<LoanDefaultRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.facility_tier]  = (by_tier[i.facility_tier] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const cured_count           = items.filter((i) => i.chain_status === 'cured').length;
  const restructured_count    = items.filter((i) => i.chain_status === 'restructured').length;
  const enforced_closed_count = items.filter((i) => i.chain_status === 'enforced_closed').length;
  const written_off_count     = items.filter((i) => i.chain_status === 'written_off').length;
  const accelerated_count     = items.filter((i) => i.chain_status === 'accelerated').length;
  const enforcement_count     = items.filter((i) => ACTIVE_ENFORCEMENT.has(i.chain_status)).length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable).length;
  const senior_open           = items.filter((i) => !i.is_terminal && i.facility_tier === 'senior_secured').length;
  const total_outstanding     = items.reduce((sum, i) => sum + (i.outstanding_principal || 0), 0);
  const total_write_off       = items.reduce((sum, i) => sum + (i.write_off_amount || 0), 0);
  const total_recovery        = items.reduce((sum, i) => sum + (i.recovery_amount || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      cured_count,
      restructured_count,
      enforced_closed_count,
      written_off_count,
      accelerated_count,
      enforcement_count,
      breached: breached_count,
      reportable_total,
      senior_open,
      total_outstanding,
      total_write_off,
      total_recovery,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_loan_defaults WHERE id = ?').bind(id).first<LoanDefaultRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_loan_defaults_events WHERE default_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<LoanDefaultEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ReviewBody {
  review_basis?: string;
  notes?: string;
}

interface RorBody {
  flag_ref?: string;
  review_basis?: string;
  notes?: string;
}

interface NoticeBody {
  notice_ref?: string;
  notice_basis?: string;
  default_type?: string;
  default_event?: string;
  notes?: string;
}

interface CureOpenBody {
  cure_ref?: string;
  cure_basis?: string;
  cure_deadline_at?: string;
  notes?: string;
}

interface CuredBody {
  cure_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface DismissBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface AccelerateBody {
  acceleration_ref?: string;
  acceleration_basis?: string;
  accelerated_amount?: number;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface StandstillBody {
  standstill_ref?: string;
  standstill_basis?: string;
  notes?: string;
}

interface EnforcementBody {
  enforcement_ref?: string;
  enforcement_basis?: string;
  notes?: string;
}

interface RestructureBody {
  restructure_ref?: string;
  restructure_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface CloseBody {
  enforcement_basis?: string;
  recovery_amount?: number;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WriteOffBody {
  write_off_amount?: number;
  recovery_amount?: number;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: LoanDefaultAction,
  bodyHandler?: (row: LoanDefaultRow, body: Record<string, unknown>) => Partial<LoanDefaultRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isBorrowerAction(action) ? BORROWER_WRITE_ROLES : LENDER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_loan_defaults WHERE id = ?').bind(id).first<LoanDefaultRow>();
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
  const sla = slaDeadlineFor(to, row.facility_tier, now);
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
    `UPDATE oe_loan_defaults SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ldef_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'loan_default',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crossesIntoRegulator(action, row.facility_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_loan_defaults WHERE id = ?').bind(id).first<LoanDefaultRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/reserve-rights', async (c) => transition(c, 'reserve_rights', (_row, body) => {
  const b = body as Partial<RorBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.flag_ref === 'string')     out.flag_ref = b.flag_ref;
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/issue-default-notice', async (c) => transition(c, 'issue_default_notice', (_row, body) => {
  const b = body as Partial<NoticeBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.notice_ref === 'string')     out.notice_ref = b.notice_ref;
  if (typeof b.notice_basis === 'string')   out.notice_basis = b.notice_basis;
  if (typeof b.default_type === 'string')   out.default_type = b.default_type;
  if (typeof b.default_event === 'string')  out.default_event = b.default_event;
  return out;
}));

app.post('/:id/open-cure-period', async (c) => transition(c, 'open_cure_period', (_row, body) => {
  const b = body as Partial<CureOpenBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.cure_ref === 'string')          out.cure_ref = b.cure_ref;
  if (typeof b.cure_basis === 'string')        out.cure_basis = b.cure_basis;
  if (typeof b.cure_deadline_at === 'string')  out.cure_deadline_at = b.cure_deadline_at;
  return out;
}));

app.post('/:id/confirm-cure', async (c) => transition(c, 'confirm_cure', (_row, body) => {
  const b = body as Partial<CuredBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.cure_basis === 'string')  out.cure_basis = b.cure_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/dismiss', async (c) => transition(c, 'dismiss', (_row, body) => {
  const b = body as Partial<DismissBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/accelerate', async (c) => transition(c, 'accelerate', (_row, body) => {
  const b = body as Partial<AccelerateBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.acceleration_ref === 'string')   out.acceleration_ref = b.acceleration_ref;
  if (typeof b.acceleration_basis === 'string') out.acceleration_basis = b.acceleration_basis;
  if (typeof b.accelerated_amount === 'number') out.accelerated_amount = b.accelerated_amount;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')          out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/agree-standstill', async (c) => transition(c, 'agree_standstill', (_row, body) => {
  const b = body as Partial<StandstillBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.standstill_ref === 'string')   out.standstill_ref = b.standstill_ref;
  if (typeof b.standstill_basis === 'string') out.standstill_basis = b.standstill_basis;
  return out;
}));

app.post('/:id/commence-enforcement', async (c) => transition(c, 'commence_enforcement', (_row, body) => {
  const b = body as Partial<EnforcementBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.enforcement_ref === 'string')   out.enforcement_ref = b.enforcement_ref;
  if (typeof b.enforcement_basis === 'string') out.enforcement_basis = b.enforcement_basis;
  return out;
}));

app.post('/:id/agree-restructure', async (c) => transition(c, 'agree_restructure', (_row, body) => {
  const b = body as Partial<RestructureBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.restructure_ref === 'string')   out.restructure_ref = b.restructure_ref;
  if (typeof b.restructure_basis === 'string') out.restructure_basis = b.restructure_basis;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')         out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/close-enforcement', async (c) => transition(c, 'close_enforcement', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.enforcement_basis === 'string') out.enforcement_basis = b.enforcement_basis;
  if (typeof b.recovery_amount === 'number')   out.recovery_amount = b.recovery_amount;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')         out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/write-off', async (c) => transition(c, 'write_off', (_row, body) => {
  const b = body as Partial<WriteOffBody>;
  const out: Partial<LoanDefaultRow> = {};
  if (typeof b.write_off_amount === 'number') out.write_off_amount = b.write_off_amount;
  if (typeof b.recovery_amount === 'number')  out.recovery_amount = b.recovery_amount;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')        out.rod_notes = b.rod_notes;
  return out;
}));

export async function loanDefaultSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_loan_defaults
     WHERE chain_status NOT IN ('cured','restructured','enforced_closed','written_off')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<LoanDefaultRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_loan_defaults
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ldef_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_loan_defaults_events (id, default_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'loan_default.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.facility_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.facility_tier)) {
      await fireCascade({
        event: 'loan_default.sla_breached',
        actor_id: 'system',
        entity_type: 'loan_default',
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
