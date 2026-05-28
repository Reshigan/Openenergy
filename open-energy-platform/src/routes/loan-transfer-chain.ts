// ═══════════════════════════════════════════════════════════════════════════
// Wave 61 — Lender Loan Transfer / Secondary Participation & Syndication
// (LMA Transfer Certificate) chain (route).
//
// Mounted at /api/loan-transfer/chain.
//
// 12-state P6 lifecycle for a SINGLE transfer of a loan participation from one
// lender (the transferor) to an incoming lender (the transferee), administered
// by the facility agent with the borrower (obligor) consenting. LMA secondary-
// trading Standard Terms + SARB Exchange Control + FIC Act 38/2001 KYC/AML +
// Banks Act large-exposure + Equator Principles. The SECONDARY-MARKET dimension
// of the Lender lifecycle (who HOLDS the loan, after W53 origination / W21
// drawdown / W30 disbursement).
//
// Two-party split write — the OBLIGOR (borrower) actively consents to (or
// refuses) the transfer (grant_consent / refuse_consent); the LENDER side
// (transferor + facility agent) drives everything else. actor_party records the
// post-event function (transferor / agent / obligor).
//
// Reportability is RESIDENCY-driven (the W61 signature): approve_transfer to a
// NON-RESIDENT transferee crosses to SARB for EVERY tier.
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
  isObligorAction,
  SLA_MINUTES,
  type LoanTransferStatus,
  type LoanTransferAction,
  type LoanTransferTier,
  type LoanTransferResidency,
} from '../utils/loan-transfer-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'lender',
  'ipp_developer',
  'regulator',
]);

// The OBLIGOR (borrower) side consents to / refuses the transfer.
const OBLIGOR_WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);
// The LENDER side (transferor + facility agent) drives the rest of the chain.
const LENDER_WRITE_ROLES = new Set(['admin', 'support', 'lender']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface LoanTransferRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  transferor_party_id: string;
  transferor_party_name: string;
  transferee_party_id: string;
  transferee_party_name: string;
  agent_party_id: string;
  agent_party_name: string;
  obligor_party_id: string;
  obligor_party_name: string;
  facility_code: string | null;
  facility_name: string;
  transfer_type: string;
  tranche: string | null;
  borrower_project: string | null;
  facility_currency: string | null;
  facility_total_zar_m: number | null;
  transfer_zar_m: number;
  transfer_price_pct: number | null;
  settlement_zar_m: number | null;
  transfer_tier: LoanTransferTier;
  transferee_residency: LoanTransferResidency;
  transferee_epfi: number;
  kyc_cleared: number;
  sanctions_cleared: number;
  obligor_consent_granted: number;
  sarb_approval_required: number;
  sarb_approval_obtained: number;
  certificate_signed: number;
  register_updated: number;
  request_ref: string | null;
  screening_ref: string | null;
  remediation_ref: string | null;
  consent_ref: string | null;
  regulatory_ref: string | null;
  approval_ref: string | null;
  certificate_ref: string | null;
  settlement_ref: string | null;
  completion_ref: string | null;
  rejection_ref: string | null;
  decline_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  remediation_basis: string | null;
  consent_basis: string | null;
  regulatory_basis: string | null;
  approval_basis: string | null;
  certificate_basis: string | null;
  settlement_basis: string | null;
  rejection_basis: string | null;
  decline_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  remediation_round: number;
  chain_status: LoanTransferStatus;
  transfer_requested_at: string;
  kyc_screening_at: string | null;
  screening_remediation_at: string | null;
  consent_solicitation_at: string | null;
  regulatory_review_at: string | null;
  transfer_approved_at: string | null;
  certificate_executed_at: string | null;
  settled_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LoanTransferEventRow {
  id: string;
  transfer_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LoanTransferStatus, keyof LoanTransferRow | null> = {
  transfer_requested:    null,
  kyc_screening:         'kyc_screening_at',
  screening_remediation: 'screening_remediation_at',
  consent_solicitation:  'consent_solicitation_at',
  regulatory_review:     'regulatory_review_at',
  transfer_approved:     'transfer_approved_at',
  certificate_executed:  'certificate_executed_at',
  settled:               'settled_at',
  completed:             'completed_at',
  declined:              'declined_at',
  rejected:              'rejected_at',
  withdrawn:             'withdrawn_at',
};

function decorate(row: LoanTransferRow, now: Date) {
  const tier = row.transfer_tier;
  const residency = row.transferee_residency;
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
    is_reportable_flag: isReportable(tier, residency),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: LoanTransferAction): string {
  switch (action) {
    case 'begin_screening':     return 'loan_transfer.kyc_screening';
    case 'request_remediation': return 'loan_transfer.screening_remediation';
    case 'resubmit_screening':  return 'loan_transfer.kyc_screening';
    case 'fail_screening':      return 'loan_transfer.rejected';
    case 'clear_screening':     return 'loan_transfer.consent_solicitation';
    case 'refuse_consent':      return 'loan_transfer.declined';
    case 'grant_consent':       return 'loan_transfer.regulatory_review';
    case 'approve_transfer':    return 'loan_transfer.transfer_approved';
    case 'execute_certificate': return 'loan_transfer.certificate_executed';
    case 'settle':              return 'loan_transfer.settled';
    case 'complete':            return 'loan_transfer.completed';
    case 'withdraw':            return 'loan_transfer.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const transfer_tier        = c.req.query('transfer_tier');
  const status               = c.req.query('status');
  const residency            = c.req.query('residency');
  const breached             = c.req.query('breached');
  const transferor_party_id  = c.req.query('transferor_party_id');
  const transfer_type        = c.req.query('transfer_type');

  let sql = 'SELECT * FROM oe_loan_transfers WHERE 1=1';
  const binds: unknown[] = [];
  if (transfer_tier)       { sql += ' AND transfer_tier = ?';        binds.push(transfer_tier); }
  if (status)              { sql += ' AND chain_status = ?';         binds.push(status); }
  if (residency)           { sql += ' AND transferee_residency = ?'; binds.push(residency); }
  if (transferor_party_id) { sql += ' AND transferor_party_id = ?';  binds.push(transferor_party_id); }
  if (transfer_type)       { sql += ' AND transfer_type = ?';        binds.push(transfer_type); }

  sql += ' ORDER BY datetime(transfer_requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<LoanTransferRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_residency: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]          = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.transfer_tier]           = (by_tier[i.transfer_tier] || 0) + 1;
    by_residency[i.transferee_residency] = (by_residency[i.transferee_residency] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const completed_count  = items.filter((i) => i.chain_status === 'completed').length;
  const in_screening     = items.filter((i) => ['kyc_screening', 'screening_remediation'].includes(i.chain_status)).length;
  const in_regulatory    = items.filter((i) => i.chain_status === 'regulatory_review').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const non_resident_total = items.filter((i) => i.transferee_residency === 'non_resident').length;
  const large_tier_open  = items.filter((i) => !i.is_terminal && (i.transfer_tier === 'major' || i.transfer_tier === 'systemic')).length;
  const total_transfer_zar_m = items.reduce((sum, i) => sum + (i.transfer_zar_m || 0), 0);
  const completed_transfer_zar_m = items.filter((i) => i.chain_status === 'completed').reduce((sum, i) => sum + (i.transfer_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_residency,
      open_count,
      completed_count,
      in_screening,
      in_regulatory,
      breached: breached_count,
      reportable_total,
      non_resident_total,
      large_tier_open,
      total_transfer_zar_m,
      completed_transfer_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_loan_transfers WHERE id = ?').bind(id).first<LoanTransferRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_loan_transfers_events WHERE transfer_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<LoanTransferEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// Per-action write gate: the OBLIGOR consent actions require an obligor role;
// every other action is driven by the lender side.
function roleAllows(action: LoanTransferAction, role: string): boolean {
  if (isObligorAction(action)) return OBLIGOR_WRITE_ROLES.has(role);
  return LENDER_WRITE_ROLES.has(role);
}

async function transition(
  c: Context<HonoEnv>,
  action: LoanTransferAction,
  bodyHandler?: (row: LoanTransferRow, body: Record<string, unknown>) => Partial<LoanTransferRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !roleAllows(action, user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_loan_transfers WHERE id = ?').bind(id).first<LoanTransferRow>();
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
  const tier = row.transfer_tier;             // tier fixed at request by transferred amount
  const residency = row.transferee_residency; // residency fixed at request
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  if (isReportable(tier, residency)) {
    setClauses.push('is_reportable = ?');
    setBinds.push(1);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_loan_transfers SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ltr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_loan_transfers_events (id, transfer_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'loan_transfer',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, tier, residency),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_loan_transfers WHERE id = ?').bind(id).first<LoanTransferRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-screening', async (c) => transition(c, 'begin_screening', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.screening_ref === 'string')   out.screening_ref = body.screening_ref;
  if (typeof body.screening_basis === 'string') out.screening_basis = body.screening_basis;
  return out;
}));

app.post('/:id/request-remediation', async (c) => transition(c, 'request_remediation', (row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.remediation_ref === 'string')   out.remediation_ref = body.remediation_ref;
  if (typeof body.remediation_basis === 'string') out.remediation_basis = body.remediation_basis;
  if (typeof body.reason_code === 'string')       out.reason_code = body.reason_code;
  out.remediation_round = (row.remediation_round || 0) + 1;
  return out;
}));

app.post('/:id/resubmit-screening', async (c) => transition(c, 'resubmit_screening', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.screening_ref === 'string')   out.screening_ref = body.screening_ref;
  if (typeof body.screening_basis === 'string') out.screening_basis = body.screening_basis;
  return out;
}));

app.post('/:id/fail-screening', async (c) => transition(c, 'fail_screening', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.rejection_ref === 'string')   out.rejection_ref = body.rejection_ref;
  if (typeof body.rejection_basis === 'string') out.rejection_basis = body.rejection_basis;
  if (typeof body.reason_code === 'string')     out.reason_code = body.reason_code;
  if (typeof body.regulator_ref === 'string')   out.regulator_ref = body.regulator_ref;
  return out;
}));

app.post('/:id/clear-screening', async (c) => transition(c, 'clear_screening', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.screening_basis === 'string') out.screening_basis = body.screening_basis;
  out.kyc_cleared = 1;
  out.sanctions_cleared = 1;
  return out;
}));

app.post('/:id/refuse-consent', async (c) => transition(c, 'refuse_consent', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.decline_ref === 'string')   out.decline_ref = body.decline_ref;
  if (typeof body.decline_basis === 'string') out.decline_basis = body.decline_basis;
  if (typeof body.reason_code === 'string')   out.reason_code = body.reason_code;
  return out;
}));

app.post('/:id/grant-consent', async (c) => transition(c, 'grant_consent', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.consent_ref === 'string')   out.consent_ref = body.consent_ref;
  if (typeof body.consent_basis === 'string') out.consent_basis = body.consent_basis;
  out.obligor_consent_granted = 1;
  return out;
}));

app.post('/:id/approve-transfer', async (c) => transition(c, 'approve_transfer', (row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.approval_ref === 'string')   out.approval_ref = body.approval_ref;
  if (typeof body.approval_basis === 'string') out.approval_basis = body.approval_basis;
  if (typeof body.regulator_ref === 'string')  out.regulator_ref = body.regulator_ref;
  if (row.transferee_residency === 'non_resident') out.sarb_approval_obtained = 1;
  return out;
}));

app.post('/:id/execute-certificate', async (c) => transition(c, 'execute_certificate', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.certificate_ref === 'string')   out.certificate_ref = body.certificate_ref;
  if (typeof body.certificate_basis === 'string') out.certificate_basis = body.certificate_basis;
  out.certificate_signed = 1;
  return out;
}));

app.post('/:id/settle', async (c) => transition(c, 'settle', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.settlement_ref === 'string')   out.settlement_ref = body.settlement_ref;
  if (typeof body.settlement_basis === 'string') out.settlement_basis = body.settlement_basis;
  if (typeof body.settlement_zar_m === 'number') out.settlement_zar_m = body.settlement_zar_m;
  return out;
}));

app.post('/:id/complete', async (c) => transition(c, 'complete', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.completion_ref === 'string') out.completion_ref = body.completion_ref;
  if (typeof body.regulator_ref === 'string')  out.regulator_ref = body.regulator_ref;
  out.register_updated = 1;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const out: Partial<LoanTransferRow> = {};
  if (typeof body.withdrawal_ref === 'string')   out.withdrawal_ref = body.withdrawal_ref;
  if (typeof body.withdrawal_basis === 'string') out.withdrawal_basis = body.withdrawal_basis;
  if (typeof body.reason_code === 'string')      out.reason_code = body.reason_code;
  return out;
}));

export async function loanTransferSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_loan_transfers
     WHERE chain_status NOT IN ('completed','declined','rejected','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<LoanTransferRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_loan_transfers
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ltr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_loan_transfers_events (id, transfer_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'loan_transfer.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past transfer SLA (tier ${row.transfer_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // A missed screening/consent/regulatory/settlement window on a large/systemic
    // transfer is itself a supervisory concern (large tiers only).
    if (slaBreachCrossesIntoRegulator(row.transfer_tier)) {
      await fireCascade({
        event: 'loan_transfer.sla_breached',
        actor_id: 'system',
        entity_type: 'loan_transfer',
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
