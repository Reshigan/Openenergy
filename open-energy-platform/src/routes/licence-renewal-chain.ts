// ═══════════════════════════════════════════════════════════════════════════
// Wave 33 — Regulator Licence Renewal / Amendment chain
//
// Mounted at /api/licence/renewal/chain.
//
// 11-state lifecycle for NERSA-issued energy licence renewals under
// Electricity Regulation Act 2006 sections 14-16. Forward path:
//   renewal_initiated → application_filed → completeness_check →
//   public_consultation → evaluation → decision_drafted → council_voted →
//   granted / amended / refused
// Branch terminal:
//   withdrawn — applicant withdrew before Council vote
//
// Licence classes (INVERTED SLA — utility gets MOST time):
//   generation_utility   — ≥100MW or transmission-connected
//   generation_embedded  — 1-100MW distribution-connected
//   generation_sseg      — <1MW Small-Scale Embedded Generation
//   distribution         — REDs / municipal distribution
//   trading              — trading + import/export (fastest)
//
// Reportability (NERSA Council briefing pipeline):
//   - refused crosses for ALL tiers (Council disclosure mandatory)
//   - granted + amended cross for generation_utility (utility-scale only)
//   - sla_breached crosses for ALL tiers (s14(2)(b) statutory hard line)
//   - withdrawn handled via internal log only
//
// Split-write:
//   OFFICER_WRITE: initiate / check_completeness / open_consultation /
//                  start_evaluation / draft_decision / council_vote / grant /
//                  amend / refuse  (NERSA officer + Council Chair)
//   APPLICANT_WRITE: file_application / withdraw  (licensee)
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
  type LicenceRenewalStatus,
  type LicenceRenewalAction,
  type LicenceClass,
} from '../utils/licence-renewal-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer',
  'grid_operator',
  'trader',
  'carbon_fund',
  'offtaker',
]);

const OFFICER_WRITE   = new Set(['admin', 'support', 'regulator']);
const APPLICANT_WRITE = new Set(['admin', 'support', 'ipp_developer', 'grid_operator', 'trader', 'carbon_fund', 'offtaker']);

const ACTION_ROLE_SET: Record<LicenceRenewalAction, Set<string>> = {
  initiate:           OFFICER_WRITE,
  file_application:   APPLICANT_WRITE,
  check_completeness: OFFICER_WRITE,
  open_consultation:  OFFICER_WRITE,
  start_evaluation:   OFFICER_WRITE,
  draft_decision:     OFFICER_WRITE,
  council_vote:       OFFICER_WRITE,
  grant:              OFFICER_WRITE,
  amend:              OFFICER_WRITE,
  refuse:             OFFICER_WRITE,
  withdraw:           APPLICANT_WRITE,
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RenewalRow {
  id: string;
  case_number: string;
  licence_id: string;
  licence_number: string | null;
  licence_type: 'generation' | 'distribution' | 'trading';
  licence_class: LicenceClass;
  capacity_mw: number | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  facility_name: string | null;
  facility_province: string | null;
  current_expiry_date: string;
  requested_expiry_date: string | null;
  granted_expiry_date: string | null;
  application_pack_ref: string | null;
  completeness_findings: string | null;
  completeness_ref: string | null;
  consultation_notice_ref: string | null;
  consultation_responses_count: number | null;
  technical_findings: string | null;
  technical_evaluation_ref: string | null;
  financial_findings: string | null;
  financial_evaluation_ref: string | null;
  decision_rod_ref: string | null;
  council_meeting_ref: string | null;
  council_vote_outcome: string | null;
  conditions_attached: string | null;
  amendment_summary: string | null;
  refusal_grounds: string | null;
  withdrawal_basis: string | null;
  withdrawal_minute_ref: string | null;
  appeal_filed: number;
  appeal_filing_ref: string | null;
  tribunal_case_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: LicenceRenewalStatus;
  initiated_at: string;
  application_filed_at: string | null;
  completeness_checked_at: string | null;
  consultation_opened_at: string | null;
  evaluation_started_at: string | null;
  decision_drafted_at: string | null;
  council_voted_at: string | null;
  granted_at: string | null;
  amended_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RenewalEventRow {
  id: string;
  renewal_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LicenceRenewalStatus, keyof RenewalRow | null> = {
  renewal_initiated:   null,
  application_filed:   'application_filed_at',
  completeness_check:  'completeness_checked_at',
  public_consultation: 'consultation_opened_at',
  evaluation:          'evaluation_started_at',
  decision_drafted:    'decision_drafted_at',
  council_voted:       'council_voted_at',
  granted:             'granted_at',
  amended:             'amended_at',
  refused:             'refused_at',
  withdrawn:           'withdrawn_at',
};

function decorate(row: RenewalRow, now: Date) {
  const klass = row.licence_class;
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
    is_reportable: isReportable(klass),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(klass),
  };
}

function eventTypeFor(action: LicenceRenewalAction): string {
  switch (action) {
    case 'initiate':           return 'initiated';
    case 'file_application':   return 'application_filed';
    case 'check_completeness': return 'completeness_checked';
    case 'open_consultation':  return 'consultation_opened';
    case 'start_evaluation':   return 'evaluation_started';
    case 'draft_decision':     return 'decision_drafted';
    case 'council_vote':       return 'council_voted';
    case 'grant':              return 'granted';
    case 'amend':              return 'amended';
    case 'refuse':             return 'refused';
    case 'withdraw':           return 'withdrawn';
  }
}

function cascadeEventFor(action: LicenceRenewalAction): string {
  switch (action) {
    case 'initiate':           return 'licence_renewal.initiated';
    case 'file_application':   return 'licence_renewal.application_filed';
    case 'check_completeness': return 'licence_renewal.completeness_checked';
    case 'open_consultation':  return 'licence_renewal.consultation_opened';
    case 'start_evaluation':   return 'licence_renewal.evaluation_started';
    case 'draft_decision':     return 'licence_renewal.decision_drafted';
    case 'council_vote':       return 'licence_renewal.council_voted';
    case 'grant':              return 'licence_renewal.granted';
    case 'amend':              return 'licence_renewal.amended';
    case 'refuse':             return 'licence_renewal.refused';
    case 'withdraw':           return 'licence_renewal.withdrawn';
  }
}

function actorParty(role: string): string {
  if (role === 'regulator') return 'regulator';
  if (role === 'admin' || role === 'support') return role;
  return 'applicant';
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const licence_class = c.req.query('licence_class');
  const status = c.req.query('status');
  const breached = c.req.query('breached');
  const licence_type = c.req.query('licence_type');
  const applicant_party_id = c.req.query('applicant_party_id');

  let sql = 'SELECT * FROM oe_licence_renewals WHERE 1=1';
  const binds: unknown[] = [];
  if (licence_class)      { sql += ' AND licence_class = ?';      binds.push(licence_class); }
  if (licence_type)       { sql += ' AND licence_type = ?';       binds.push(licence_type); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (applicant_party_id) { sql += ' AND applicant_party_id = ?'; binds.push(applicant_party_id); }

  sql += ' ORDER BY datetime(initiated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RenewalRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_class[i.licence_class] = (by_class[i.licence_class] || 0) + 1;
  }

  const open_count = items.filter((i) => !i.is_terminal).length;
  const granted_count = items.filter((i) => i.chain_status === 'granted').length;
  const amended_count = items.filter((i) => i.chain_status === 'amended').length;
  const refused_count = items.filter((i) => i.chain_status === 'refused').length;
  const withdrawn_count = items.filter((i) => i.chain_status === 'withdrawn').length;
  const appeal_count = items.filter((i) => i.appeal_filed > 0).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const utility_open = items.filter(
    (i) => !i.is_terminal && i.licence_class === 'generation_utility',
  ).length;
  const distribution_open = items.filter(
    (i) => !i.is_terminal && i.licence_class === 'distribution',
  ).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_class,
      open_count,
      granted_count,
      amended_count,
      refused_count,
      withdrawn_count,
      appeal_count,
      breached: breached_count,
      reportable_total,
      utility_open,
      distribution_open,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_licence_renewals WHERE id = ?').bind(id).first<RenewalRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_licence_renewal_events WHERE renewal_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RenewalEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CompletenessBody {
  completeness_findings?: string;
  completeness_ref?: string;
  notes?: string;
}

interface ConsultationBody {
  consultation_notice_ref?: string;
  notes?: string;
}

interface EvaluationBody {
  technical_findings?: string;
  technical_evaluation_ref?: string;
  financial_findings?: string;
  financial_evaluation_ref?: string;
  notes?: string;
}

interface DecisionDraftBody {
  decision_rod_ref?: string;
  notes?: string;
}

interface CouncilVoteBody {
  council_meeting_ref?: string;
  council_vote_outcome?: string;
  notes?: string;
}

interface GrantBody {
  granted_expiry_date?: string;
  notes?: string;
}

interface AmendBody {
  granted_expiry_date?: string;
  conditions_attached?: string;
  amendment_summary?: string;
  notes?: string;
}

interface RefuseBody {
  refusal_grounds?: string;
  appeal_filing_ref?: string;
  tribunal_case_ref?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_basis?: string;
  withdrawal_minute_ref?: string;
  reason_code?: string;
  notes?: string;
}

interface FileApplicationBody {
  application_pack_ref?: string;
  requested_expiry_date?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: LicenceRenewalAction,
  bodyHandler?: (row: RenewalRow, body: Record<string, unknown>) => Partial<RenewalRow>,
) {
  const user = getCurrentUser(c);
  const allowed = ACTION_ROLE_SET[action];
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_licence_renewals WHERE id = ?').bind(id).first<RenewalRow>();
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
  const sla = slaDeadlineFor(to, row.licence_class, now);
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
    `UPDATE oe_licence_renewals SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `lre_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'licence_renewal',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.licence_class),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_licence_renewals WHERE id = ?').bind(id).first<RenewalRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/file-application', async (c) => transition(c, 'file_application', (_row, body) => {
  const b = body as Partial<FileApplicationBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.application_pack_ref === 'string')  out.application_pack_ref = b.application_pack_ref;
  if (typeof b.requested_expiry_date === 'string') out.requested_expiry_date = b.requested_expiry_date;
  return out;
}));

app.post('/:id/check-completeness', async (c) => transition(c, 'check_completeness', (_row, body) => {
  const b = body as Partial<CompletenessBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.completeness_findings === 'string') out.completeness_findings = b.completeness_findings;
  if (typeof b.completeness_ref === 'string')      out.completeness_ref = b.completeness_ref;
  return out;
}));

app.post('/:id/open-consultation', async (c) => transition(c, 'open_consultation', (_row, body) => {
  const b = body as Partial<ConsultationBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.consultation_notice_ref === 'string') out.consultation_notice_ref = b.consultation_notice_ref;
  return out;
}));

app.post('/:id/start-evaluation', async (c) => transition(c, 'start_evaluation', (_row, body) => {
  const b = body as Partial<EvaluationBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.technical_findings === 'string')         out.technical_findings = b.technical_findings;
  if (typeof b.technical_evaluation_ref === 'string')   out.technical_evaluation_ref = b.technical_evaluation_ref;
  if (typeof b.financial_findings === 'string')         out.financial_findings = b.financial_findings;
  if (typeof b.financial_evaluation_ref === 'string')   out.financial_evaluation_ref = b.financial_evaluation_ref;
  return out;
}));

app.post('/:id/draft-decision', async (c) => transition(c, 'draft_decision', (_row, body) => {
  const b = body as Partial<DecisionDraftBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.decision_rod_ref === 'string') out.decision_rod_ref = b.decision_rod_ref;
  return out;
}));

app.post('/:id/council-vote', async (c) => transition(c, 'council_vote', (_row, body) => {
  const b = body as Partial<CouncilVoteBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.council_meeting_ref === 'string')  out.council_meeting_ref = b.council_meeting_ref;
  if (typeof b.council_vote_outcome === 'string') out.council_vote_outcome = b.council_vote_outcome;
  return out;
}));

app.post('/:id/grant', async (c) => transition(c, 'grant', (_row, body) => {
  const b = body as Partial<GrantBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.granted_expiry_date === 'string') out.granted_expiry_date = b.granted_expiry_date;
  return out;
}));

app.post('/:id/amend', async (c) => transition(c, 'amend', (_row, body) => {
  const b = body as Partial<AmendBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.granted_expiry_date === 'string') out.granted_expiry_date = b.granted_expiry_date;
  if (typeof b.conditions_attached === 'string') out.conditions_attached = b.conditions_attached;
  if (typeof b.amendment_summary === 'string')   out.amendment_summary = b.amendment_summary;
  return out;
}));

app.post('/:id/refuse', async (c) => transition(c, 'refuse', (_row, body) => {
  const b = body as Partial<RefuseBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.refusal_grounds === 'string')   out.refusal_grounds = b.refusal_grounds;
  if (typeof b.appeal_filing_ref === 'string') out.appeal_filing_ref = b.appeal_filing_ref;
  if (typeof b.tribunal_case_ref === 'string') out.tribunal_case_ref = b.tribunal_case_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')         out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.withdrawal_basis === 'string')      out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_minute_ref === 'string') out.withdrawal_minute_ref = b.withdrawal_minute_ref;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  return out;
}));

export async function licenceRenewalSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_licence_renewals
     WHERE chain_status NOT IN ('granted','amended','refused','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RenewalRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_licence_renewals
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `lre_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_licence_renewal_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (class ${row.licence_class})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.licence_class)) {
      await fireCascade({
        event: 'licence_renewal.sla_breached',
        actor_id: 'system',
        entity_type: 'licence_renewal',
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
