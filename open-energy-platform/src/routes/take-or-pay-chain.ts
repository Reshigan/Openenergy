// ═══════════════════════════════════════════════════════════════════════════
// Wave 32 — Offtaker Take-or-Pay Annual Reconciliation chain
//
// Mounted at /api/take-or-pay/chain.
//
// 10-state lifecycle for every calendar-year roll-up of monthly PPA delivery
// shortfalls. Under the DMRE REIPPPP PPA template + standard utility PPAs,
// the offtaker is obligated to PAY the contracted MWh price even if the IPP
// didn't DELIVER, minus credits for force-majeure, scheduled outages, and
// curtailment instructions. Accounted under IFRS 16 + IFRS 15; annual return
// to NERSA + Section 34 dispute path.
//
// Forward path:
//   accrual_open → year_end → statement_issued → evidence_required →
//   evidence_submitted → quantum_proposed → quantum_agreed → settled
//
// Branch terminals:
//   disputed   — Section 34 arbitration (NERSA panel)
//   waived     — board exception (force-majeure, regulator-directed curtailment)
//
// Tiers (shortfall % of contracted MWh — INVERTED SLA, catastrophic fastest):
//   catastrophic — >50%   (existential — PPA termination risk)
//   major        — 20-50% (material — regulator-reported)
//   moderate     — 5-20%  (routine TOP demand)
//   minor        — <5%    (de-minimis)
//
// Reportability (NERSA TOP annual return + Section 34 filings):
//   - settle + dispute + waive cross for catastrophic + major
//   - sla_breached crosses for ALL tiers (annual return hard line)
//
// Split-write:
//   OFFTAKER_WRITE: close_year (system/cron), issue_statement, request_evidence,
//                   propose_quantum, settle, waive
//   IPP_WRITE:      submit_evidence, accept_quantum, dispute
//   admin/support always.
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
  type TopStatus,
  type TopAction,
  type TopTier,
} from '../utils/take-or-pay-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'offtaker',
  'ipp_developer',
  'regulator',
]);

const OFFTAKER_WRITE = new Set(['admin', 'support', 'offtaker']);
const IPP_WRITE      = new Set(['admin', 'support', 'ipp_developer']);

const ACTION_ROLE_SET: Record<TopAction, Set<string>> = {
  close_year:       OFFTAKER_WRITE,
  issue_statement:  OFFTAKER_WRITE,
  request_evidence: OFFTAKER_WRITE,
  submit_evidence:  IPP_WRITE,
  propose_quantum:  OFFTAKER_WRITE,
  accept_quantum:   IPP_WRITE,
  settle:           OFFTAKER_WRITE,
  dispute:          IPP_WRITE,
  waive:            OFFTAKER_WRITE,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface TopRow {
  id: string;
  case_number: string;
  ppa_contract_id: string | null;
  ppa_chain_id: string | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  ipp_party_id: string;
  ipp_party_name: string;
  offtaker_party_id: string;
  offtaker_party_name: string;
  reconciliation_year: number;
  contracted_mwh: number;
  delivered_mwh: number;
  credited_mwh: number;
  shortfall_mwh: number;
  shortfall_pct: number;
  severity_tier: TopTier;
  top_rate_per_mwh: number;
  top_amount_proposed: number | null;
  top_amount_agreed: number | null;
  top_amount_settled: number | null;
  evidence_findings: string | null;
  evidence_ref: string | null;
  quantum_proposal_ref: string | null;
  quantum_acceptance_ref: string | null;
  settlement_ref: string | null;
  dispute_panel_ref: string | null;
  dispute_award_ref: string | null;
  waiver_basis: string | null;
  waiver_minute_ref: string | null;
  reason_code: string | null;
  nersa_top_return_ref: string | null;
  section34_filing_ref: string | null;
  rod_notes: string | null;
  chain_status: TopStatus;
  accrual_opened_at: string;
  year_end_at: string | null;
  statement_issued_at: string | null;
  evidence_required_at: string | null;
  evidence_submitted_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  settled_at: string | null;
  disputed_at: string | null;
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
  top_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<TopStatus, keyof TopRow | null> = {
  accrual_open:       null,
  year_end:           'year_end_at',
  statement_issued:   'statement_issued_at',
  evidence_required:  'evidence_required_at',
  evidence_submitted: 'evidence_submitted_at',
  quantum_proposed:   'quantum_proposed_at',
  quantum_agreed:     'quantum_agreed_at',
  settled:            'settled_at',
  disputed:           'disputed_at',
  waived:             'waived_at',
};

function decorate(row: TopRow, now: Date) {
  const tier = row.severity_tier;
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

function eventTypeFor(action: TopAction): string {
  switch (action) {
    case 'close_year':       return 'year_end';
    case 'issue_statement':  return 'statement_issued';
    case 'request_evidence': return 'evidence_required';
    case 'submit_evidence':  return 'evidence_submitted';
    case 'propose_quantum':  return 'quantum_proposed';
    case 'accept_quantum':   return 'quantum_agreed';
    case 'settle':           return 'settled';
    case 'dispute':          return 'disputed';
    case 'waive':            return 'waived';
  }
}

function cascadeEventFor(action: TopAction): string {
  switch (action) {
    case 'close_year':       return 'top.year_end';
    case 'issue_statement':  return 'top.statement_issued';
    case 'request_evidence': return 'top.evidence_required';
    case 'submit_evidence':  return 'top.evidence_submitted';
    case 'propose_quantum':  return 'top.quantum_proposed';
    case 'accept_quantum':   return 'top.quantum_agreed';
    case 'settle':           return 'top.settled';
    case 'dispute':          return 'top.disputed';
    case 'waive':            return 'top.waived';
  }
}

function actorParty(role: string): string {
  if (role === 'offtaker') return 'offtaker';
  if (role === 'ipp_developer') return 'ipp';
  return role;
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier = c.req.query('tier');
  const status = c.req.query('status');
  const breached = c.req.query('breached');
  const year = c.req.query('year');
  const ipp_party_id = c.req.query('ipp_party_id');
  const offtaker_party_id = c.req.query('offtaker_party_id');

  let sql = 'SELECT * FROM oe_top_cases WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)              { sql += ' AND severity_tier = ?';        binds.push(tier); }
  if (status)            { sql += ' AND chain_status = ?';         binds.push(status); }
  if (year)              { sql += ' AND reconciliation_year = ?';  binds.push(Number(year)); }
  if (ipp_party_id)      { sql += ' AND ipp_party_id = ?';         binds.push(ipp_party_id); }
  if (offtaker_party_id) { sql += ' AND offtaker_party_id = ?';    binds.push(offtaker_party_id); }

  sql += ' ORDER BY reconciliation_year DESC, datetime(accrual_opened_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<TopRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
  }

  const open_count = items.filter((i) => !i.is_terminal).length;
  const settled_count = items.filter((i) => i.chain_status === 'settled').length;
  const disputed_count = items.filter((i) => i.chain_status === 'disputed').length;
  const waived_count = items.filter((i) => i.chain_status === 'waived').length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const catastrophic_open = items.filter(
    (i) => !i.is_terminal && i.severity_tier === 'catastrophic',
  ).length;
  const major_open = items.filter(
    (i) => !i.is_terminal && i.severity_tier === 'major',
  ).length;

  const total_shortfall_mwh = items.reduce((s, i) => s + (i.shortfall_mwh || 0), 0);
  const total_proposed = items.reduce((s, i) => s + (i.top_amount_proposed || 0), 0);
  const total_agreed = items.reduce((s, i) => s + (i.top_amount_agreed || 0), 0);
  const total_settled = items.reduce((s, i) => s + (i.top_amount_settled || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      settled_count,
      disputed_count,
      waived_count,
      breached: breached_count,
      reportable_total,
      catastrophic_open,
      major_open,
      total_shortfall_mwh,
      total_proposed,
      total_agreed,
      total_settled,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_top_cases WHERE id = ?').bind(id).first<TopRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_top_events WHERE top_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitEvidenceBody {
  evidence_findings?: string;
  evidence_ref?: string;
  notes?: string;
}

interface ProposeQuantumBody {
  top_amount_proposed?: number;
  quantum_proposal_ref?: string;
  notes?: string;
}

interface AcceptQuantumBody {
  top_amount_agreed?: number;
  quantum_acceptance_ref?: string;
  notes?: string;
}

interface SettleBody {
  top_amount_settled?: number;
  settlement_ref?: string;
  nersa_top_return_ref?: string;
  notes?: string;
}

interface DisputeBody {
  dispute_panel_ref?: string;
  section34_filing_ref?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WaiveBody {
  waiver_basis?: string;
  waiver_minute_ref?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: TopAction,
  bodyHandler?: (row: TopRow, body: Record<string, unknown>) => Partial<TopRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_top_cases WHERE id = ?').bind(id).first<TopRow>();
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
  const sla = slaDeadlineFor(to, row.severity_tier, now);
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
    `UPDATE oe_top_cases SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `top_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_top_events (id, top_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    actorParty(user.role),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = cascadeEventFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'top_case',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.severity_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_top_cases WHERE id = ?').bind(id).first<TopRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/close-year', async (c) => transition(c, 'close_year'));

app.post('/:id/issue-statement', async (c) => transition(c, 'issue_statement', (_row, _body) => {
  return {};
}));

app.post('/:id/request-evidence', async (c) => transition(c, 'request_evidence'));

app.post('/:id/submit-evidence', async (c) => transition(c, 'submit_evidence', (_row, body) => {
  const b = body as Partial<SubmitEvidenceBody>;
  const out: Partial<TopRow> = {};
  if (typeof b.evidence_findings === 'string') out.evidence_findings = b.evidence_findings;
  if (typeof b.evidence_ref === 'string')      out.evidence_ref = b.evidence_ref;
  return out;
}));

app.post('/:id/propose-quantum', async (c) => transition(c, 'propose_quantum', (_row, body) => {
  const b = body as Partial<ProposeQuantumBody>;
  const out: Partial<TopRow> = {};
  if (typeof b.top_amount_proposed === 'number')   out.top_amount_proposed = b.top_amount_proposed;
  if (typeof b.quantum_proposal_ref === 'string')  out.quantum_proposal_ref = b.quantum_proposal_ref;
  return out;
}));

app.post('/:id/accept-quantum', async (c) => transition(c, 'accept_quantum', (_row, body) => {
  const b = body as Partial<AcceptQuantumBody>;
  const out: Partial<TopRow> = {};
  if (typeof b.top_amount_agreed === 'number')      out.top_amount_agreed = b.top_amount_agreed;
  if (typeof b.quantum_acceptance_ref === 'string') out.quantum_acceptance_ref = b.quantum_acceptance_ref;
  return out;
}));

app.post('/:id/settle', async (c) => transition(c, 'settle', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<TopRow> = {};
  if (typeof b.top_amount_settled === 'number')      out.top_amount_settled = b.top_amount_settled;
  if (typeof b.settlement_ref === 'string')          out.settlement_ref = b.settlement_ref;
  if (typeof b.nersa_top_return_ref === 'string')    out.nersa_top_return_ref = b.nersa_top_return_ref;
  return out;
}));

app.post('/:id/dispute', async (c) => transition(c, 'dispute', (_row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<TopRow> = {};
  if (typeof b.dispute_panel_ref === 'string')    out.dispute_panel_ref = b.dispute_panel_ref;
  if (typeof b.section34_filing_ref === 'string') out.section34_filing_ref = b.section34_filing_ref;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')            out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/waive', async (c) => transition(c, 'waive', (_row, body) => {
  const b = body as Partial<WaiveBody>;
  const out: Partial<TopRow> = {};
  if (typeof b.waiver_basis === 'string')      out.waiver_basis = b.waiver_basis;
  if (typeof b.waiver_minute_ref === 'string') out.waiver_minute_ref = b.waiver_minute_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')         out.rod_notes = b.rod_notes;
  return out;
}));

export async function topSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_top_cases
     WHERE chain_status NOT IN ('settled','disputed','waived')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<TopRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_top_cases
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `top_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_top_events (id, top_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.severity_tier)) {
      await fireCascade({
        event: 'top.sla_breached',
        actor_id: 'system',
        entity_type: 'top_case',
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
