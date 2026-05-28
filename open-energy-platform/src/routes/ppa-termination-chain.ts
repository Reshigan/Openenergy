// ═══════════════════════════════════════════════════════════════════════════
// Wave 62 — Offtaker PPA Termination & Early-Termination Amount (Buy-Out) chain
// (route). Mounted at /api/ppa-termination/chain.
//
// 12-state P6 lifecycle for a SINGLE termination of an offtake agreement, driven
// by the offtaker, with the seller (IPP) able to dispute the calculated buy-out
// and an independent expert resolving the dispute. NERSA ERA 4/2006 + Section 34
// security-of-supply + the PPA termination & buy-out provisions. The EXIT of the
// offtake relationship (after W22 execution / W39 indexation / W32 take-or-pay /
// W46 curtailment / W54 payment security).
//
// Two-party split write — the SELLER / counterparty (IPP) can dispute the
// calculated buy-out (dispute_eta is the sole counterparty write); the OFFTAKER
// side drives everything else. actor_party records the contractual function
// (offtaker / counterparty / independent).
//
// Reportability is CAUSE-driven (the W62 signature): confirm_termination crosses
// to NERSA for EVERY tier when the cause is INVOLUNTARY; confirm_settlement and
// SLA breaches cross for the large tiers only.
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
  partyForAction,
  isCounterpartyAction,
  tierForBuyoutZarM,
  SLA_MINUTES,
  type PpaTerminationStatus,
  type PpaTerminationAction,
  type PpaTerminationTier,
  type TerminationCause,
} from '../utils/ppa-termination-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'offtaker',
  'ipp_developer',
  'regulator',
]);

// The SELLER / counterparty (IPP) disputes the calculated buy-out.
const COUNTERPARTY_WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);
// The OFFTAKER side drives the rest of the termination machinery.
const OFFTAKER_WRITE_ROLES = new Set(['admin', 'support', 'offtaker']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PpaTerminationRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  offtaker_party_id: string;
  offtaker_party_name: string;
  seller_party_id: string;
  seller_party_name: string;
  independent_party_id: string | null;
  independent_party_name: string | null;
  ppa_code: string | null;
  ppa_name: string;
  plant_name: string | null;
  technology: string | null;
  ppa_currency: string | null;
  ppa_capacity_mw: number | null;
  remaining_term_months: number | null;
  termination_cause: TerminationCause;
  eta_basis: string;
  debt_outstanding_zar_m: number | null;
  equity_makewhole_zar_m: number | null;
  buyout_zar_m: number;
  settlement_zar_m: number | null;
  termination_tier: PpaTerminationTier;
  notice_served_flag: number;
  cure_offered: number;
  cured: number;
  termination_confirmed_flag: number;
  eta_calculated: number;
  eta_agreed_flag: number;
  dispute_raised: number;
  dispute_resolved: number;
  settlement_paid: number;
  trigger_ref: string | null;
  notice_ref: string | null;
  cure_ref: string | null;
  review_ref: string | null;
  confirmation_ref: string | null;
  assessment_ref: string | null;
  agreement_ref: string | null;
  dispute_ref: string | null;
  resolution_ref: string | null;
  settlement_ref: string | null;
  closure_ref: string | null;
  reinstatement_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  trigger_basis: string | null;
  notice_basis: string | null;
  cure_basis: string | null;
  review_basis: string | null;
  confirmation_basis: string | null;
  assessment_basis: string | null;
  agreement_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  settlement_basis: string | null;
  reinstatement_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: PpaTerminationStatus;
  termination_triggered_at: string;
  notice_served_at: string | null;
  cure_period_at: string | null;
  termination_review_at: string | null;
  termination_confirmed_at: string | null;
  eta_assessment_at: string | null;
  eta_agreed_at: string | null;
  disputed_at: string | null;
  settlement_pending_at: string | null;
  closed_at: string | null;
  reinstated_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PpaTerminationEventRow {
  id: string;
  termination_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PpaTerminationStatus, keyof PpaTerminationRow | null> = {
  termination_triggered: null,
  notice_served:         'notice_served_at',
  cure_period:           'cure_period_at',
  termination_review:    'termination_review_at',
  termination_confirmed: 'termination_confirmed_at',
  eta_assessment:        'eta_assessment_at',
  eta_agreed:            'eta_agreed_at',
  disputed:              'disputed_at',
  settlement_pending:    'settlement_pending_at',
  closed:                'closed_at',
  reinstated:            'reinstated_at',
  withdrawn:             'withdrawn_at',
};

function decorate(row: PpaTerminationRow, now: Date) {
  const tier = row.termination_tier;
  const cause = row.termination_cause;
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
    is_reportable_flag: isReportable(tier, cause),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: PpaTerminationAction): string {
  switch (action) {
    case 'serve_notice':        return 'ppa_termination.notice_served';
    case 'open_cure':           return 'ppa_termination.cure_period';
    case 'confirm_cure':        return 'ppa_termination.reinstated';
    case 'escalate_review':     return 'ppa_termination.termination_review';
    case 'confirm_termination': return 'ppa_termination.termination_confirmed';
    case 'open_eta_assessment': return 'ppa_termination.eta_assessment';
    case 'agree_eta':           return 'ppa_termination.eta_agreed';
    case 'dispute_eta':         return 'ppa_termination.disputed';
    case 'resolve_dispute':     return 'ppa_termination.eta_agreed';
    case 'initiate_settlement': return 'ppa_termination.settlement_pending';
    case 'confirm_settlement':  return 'ppa_termination.closed';
    case 'withdraw':            return 'ppa_termination.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const termination_tier   = c.req.query('termination_tier');
  const status             = c.req.query('status');
  const cause              = c.req.query('cause');
  const breached           = c.req.query('breached');
  const offtaker_party_id  = c.req.query('offtaker_party_id');

  let sql = 'SELECT * FROM oe_ppa_terminations WHERE 1=1';
  const binds: unknown[] = [];
  if (termination_tier)  { sql += ' AND termination_tier = ?';  binds.push(termination_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (cause)             { sql += ' AND termination_cause = ?'; binds.push(cause); }
  if (offtaker_party_id) { sql += ' AND offtaker_party_id = ?'; binds.push(offtaker_party_id); }

  sql += ' ORDER BY datetime(termination_triggered_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PpaTerminationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_cause: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]      = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.termination_tier]    = (by_tier[i.termination_tier] || 0) + 1;
    by_cause[i.termination_cause]  = (by_cause[i.termination_cause] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const closed_count      = items.filter((i) => i.chain_status === 'closed').length;
  const in_cure          = items.filter((i) => i.chain_status === 'cure_period').length;
  const in_assessment    = items.filter((i) => i.chain_status === 'eta_assessment').length;
  const in_dispute       = items.filter((i) => i.chain_status === 'disputed').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const involuntary_total = items.filter((i) => i.termination_cause !== 'no_fault').length;
  const large_tier_open  = items.filter((i) => !i.is_terminal && (i.termination_tier === 'major' || i.termination_tier === 'critical')).length;
  const total_buyout_zar_m = items.reduce((sum, i) => sum + (i.buyout_zar_m || 0), 0);
  const settled_buyout_zar_m = items.filter((i) => i.chain_status === 'closed').reduce((sum, i) => sum + (i.settlement_zar_m || i.buyout_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_cause,
      open_count,
      closed_count,
      in_cure,
      in_assessment,
      in_dispute,
      breached: breached_count,
      reportable_total,
      involuntary_total,
      large_tier_open,
      total_buyout_zar_m,
      settled_buyout_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_terminations WHERE id = ?').bind(id).first<PpaTerminationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ppa_terminations_events WHERE termination_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PpaTerminationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// Per-action write gate: dispute_eta requires a counterparty (seller / IPP) role;
// every other action is driven by the offtaker side.
function roleAllows(action: PpaTerminationAction, role: string): boolean {
  if (isCounterpartyAction(action)) return COUNTERPARTY_WRITE_ROLES.has(role);
  return OFFTAKER_WRITE_ROLES.has(role);
}

async function transition(
  c: Context<HonoEnv>,
  action: PpaTerminationAction,
  bodyHandler?: (row: PpaTerminationRow, body: Record<string, unknown>) => Partial<PpaTerminationRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !roleAllows(action, user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_terminations WHERE id = ?').bind(id).first<PpaTerminationRow>();
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
  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // The buy-out can be (re)assessed at agreement / dispute resolution — re-derive
  // the tier from the amount so the SLA + reportability follow the latest number.
  let tier = row.termination_tier;
  if (typeof overrides.buyout_zar_m === 'number') {
    tier = tierForBuyoutZarM(overrides.buyout_zar_m);
    (overrides as Partial<PpaTerminationRow>).termination_tier = tier;
  }
  const cause = row.termination_cause;
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  if (isReportable(tier, cause)) {
    setClauses.push('is_reportable = ?');
    setBinds.push(1);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_ppa_terminations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `pter_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ppa_terminations_events (id, termination_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'ppa_termination',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      termination_tier: tier,
      crosses_into_regulator: crossesIntoRegulator(action, tier, cause),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ppa_terminations WHERE id = ?').bind(id).first<PpaTerminationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/serve-notice', async (c) => transition(c, 'serve_notice', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.notice_ref === 'string')   out.notice_ref = body.notice_ref;
  if (typeof body.notice_basis === 'string') out.notice_basis = body.notice_basis;
  if (typeof body.reason_code === 'string')  out.reason_code = body.reason_code;
  out.notice_served_flag = 1;
  return out;
}));

app.post('/:id/open-cure', async (c) => transition(c, 'open_cure', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.cure_ref === 'string')   out.cure_ref = body.cure_ref;
  if (typeof body.cure_basis === 'string') out.cure_basis = body.cure_basis;
  out.cure_offered = 1;
  return out;
}));

app.post('/:id/confirm-cure', async (c) => transition(c, 'confirm_cure', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.reinstatement_ref === 'string')   out.reinstatement_ref = body.reinstatement_ref;
  if (typeof body.reinstatement_basis === 'string') out.reinstatement_basis = body.reinstatement_basis;
  if (typeof body.reason_code === 'string')         out.reason_code = body.reason_code;
  out.cured = 1;
  return out;
}));

app.post('/:id/escalate-review', async (c) => transition(c, 'escalate_review', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.review_ref === 'string')   out.review_ref = body.review_ref;
  if (typeof body.review_basis === 'string') out.review_basis = body.review_basis;
  return out;
}));

app.post('/:id/confirm-termination', async (c) => transition(c, 'confirm_termination', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.confirmation_ref === 'string')   out.confirmation_ref = body.confirmation_ref;
  if (typeof body.confirmation_basis === 'string') out.confirmation_basis = body.confirmation_basis;
  if (typeof body.regulator_ref === 'string')      out.regulator_ref = body.regulator_ref;
  out.termination_confirmed_flag = 1;
  return out;
}));

app.post('/:id/open-eta-assessment', async (c) => transition(c, 'open_eta_assessment', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.assessment_ref === 'string')   out.assessment_ref = body.assessment_ref;
  if (typeof body.assessment_basis === 'string') out.assessment_basis = body.assessment_basis;
  return out;
}));

app.post('/:id/agree-eta', async (c) => transition(c, 'agree_eta', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.agreement_ref === 'string')          out.agreement_ref = body.agreement_ref;
  if (typeof body.agreement_basis === 'string')        out.agreement_basis = body.agreement_basis;
  if (typeof body.buyout_zar_m === 'number')           out.buyout_zar_m = body.buyout_zar_m;
  if (typeof body.debt_outstanding_zar_m === 'number') out.debt_outstanding_zar_m = body.debt_outstanding_zar_m;
  if (typeof body.equity_makewhole_zar_m === 'number') out.equity_makewhole_zar_m = body.equity_makewhole_zar_m;
  out.eta_calculated = 1;
  out.eta_agreed_flag = 1;
  return out;
}));

app.post('/:id/dispute-eta', async (c) => transition(c, 'dispute_eta', (row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.dispute_ref === 'string')   out.dispute_ref = body.dispute_ref;
  if (typeof body.dispute_basis === 'string') out.dispute_basis = body.dispute_basis;
  if (typeof body.reason_code === 'string')   out.reason_code = body.reason_code;
  out.dispute_raised = 1;
  out.dispute_round = (row.dispute_round || 0) + 1;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.resolution_ref === 'string')   out.resolution_ref = body.resolution_ref;
  if (typeof body.resolution_basis === 'string') out.resolution_basis = body.resolution_basis;
  if (typeof body.buyout_zar_m === 'number')     out.buyout_zar_m = body.buyout_zar_m;
  out.dispute_resolved = 1;
  return out;
}));

app.post('/:id/initiate-settlement', async (c) => transition(c, 'initiate_settlement', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.settlement_ref === 'string')   out.settlement_ref = body.settlement_ref;
  if (typeof body.settlement_basis === 'string') out.settlement_basis = body.settlement_basis;
  return out;
}));

app.post('/:id/confirm-settlement', async (c) => transition(c, 'confirm_settlement', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.closure_ref === 'string')      out.closure_ref = body.closure_ref;
  if (typeof body.settlement_basis === 'string') out.settlement_basis = body.settlement_basis;
  if (typeof body.regulator_ref === 'string')    out.regulator_ref = body.regulator_ref;
  if (typeof body.settlement_zar_m === 'number') out.settlement_zar_m = body.settlement_zar_m;
  out.settlement_paid = 1;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const out: Partial<PpaTerminationRow> = {};
  if (typeof body.withdrawal_ref === 'string')   out.withdrawal_ref = body.withdrawal_ref;
  if (typeof body.withdrawal_basis === 'string') out.withdrawal_basis = body.withdrawal_basis;
  if (typeof body.reason_code === 'string')      out.reason_code = body.reason_code;
  return out;
}));

export async function ppaTerminationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ppa_terminations
     WHERE chain_status NOT IN ('closed','reinstated','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PpaTerminationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ppa_terminations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `pter_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ppa_terminations_events (id, termination_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ppa_termination.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past termination SLA (tier ${row.termination_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // A missed cure / assessment / settlement window on a large buy-out is itself
    // a security-of-supply concern (large tiers only).
    if (slaBreachCrossesIntoRegulator(row.termination_tier)) {
      await fireCascade({
        event: 'ppa_termination.sla_breached',
        actor_id: 'system',
        entity_type: 'ppa_termination',
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
