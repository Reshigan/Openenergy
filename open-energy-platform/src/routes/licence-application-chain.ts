// ═══════════════════════════════════════════════════════════════════════════
// Wave 49 — Regulator Initial Licence Application & Adjudication chain
//
// Mounted at /api/licence-application/chain.
//
// NERSA licensing under the Electricity Regulation Act 4 of 2006 §§8–11: the
// front-end grant of a NEW licence to operate a generation, transmission,
// distribution, trading or import/export facility. A new entrant files a
// licence application; NERSA logs it, checks completeness (§9), may request
// additional information, accepts it for processing, runs the §10
// public-participation process, performs the technical/financial evaluation,
// refers it to the Energy Regulator (Council) for decision, and either grants
// (then issues) the licence or refuses it — while the applicant may withdraw,
// or a non-responsive application may lapse.
//
// Where W33 renewal renews / amends an EXISTING licence (presuming a holder),
// THIS chain grants the FIRST one — the entry gate to the regulated market.
//
// Forward path:
//   application_received → completeness_review → accepted → public_participation
//     → technical_evaluation → council_decision → licence_granted → licence_issued
//
// Information-gap loop: completeness_review → additional_info_requested → completeness_review
// Refusal:              council_decision → refused
// Early withdraw:       application_received|completeness_review|additional_info_requested
//                        |accepted|public_participation → withdrawn
// Lapse:                additional_info_requested → lapsed
//
// Classes: major_licence / standard_licence / minor_licence.
//
// INVERTED SLA — the bigger / higher-stakes the licence, the MORE time every
// window allows. Reportability:
//   - refuse crosses for EVERY class (denying market entry — universal, W49 signature)
//   - grant crosses for the major class only (Council oversight + Gazette)
//   - sla_breached crosses for material classes (major + standard)
//
// Two-party split write: the applicant files / supplies info / withdraws; the
// regulator drives everything else. actor_party
// (applicant / registry / evaluator / council) derived from the action.
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
  isApplicantAction,
  partyForAction,
  SLA_MINUTES,
  type LicenceApplicationStatus,
  type LicenceApplicationAction,
  type LicenceApplicationClass,
} from '../utils/licence-application-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// Two-party split write. The regulator drives the adjudication machinery; the
// applicant files / supplies additional information / withdraws. A licence
// applicant can hold any of the operating roles, so the applicant write-set
// spans every market-side role.
const REGULATOR_WRITE_ROLES = new Set(['admin', 'support', 'regulator']);
const APPLICANT_WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ApplicationRow {
  id: string;
  application_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  regulator_party_id: string;
  regulator_party_name: string;
  licence_class: LicenceApplicationClass;
  licence_type: string;
  technology: string | null;
  facility_name: string;
  facility_location: string | null;
  capacity_mw: number | null;
  estimated_capex_zar_m: number | null;
  grid_connection_ref: string | null;
  reipppp_round: string | null;
  application_ref: string | null;
  completeness_ref: string | null;
  info_request_ref: string | null;
  acceptance_ref: string | null;
  participation_ref: string | null;
  evaluation_ref: string | null;
  council_ref: string | null;
  licence_ref: string | null;
  gazette_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  completeness_basis: string | null;
  info_request_basis: string | null;
  acceptance_basis: string | null;
  participation_basis: string | null;
  evaluation_basis: string | null;
  council_basis: string | null;
  grant_basis: string | null;
  refusal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  info_request_round: number;
  chain_status: LicenceApplicationStatus;
  application_received_at: string;
  completeness_review_at: string | null;
  additional_info_requested_at: string | null;
  accepted_at: string | null;
  public_participation_at: string | null;
  technical_evaluation_at: string | null;
  council_decision_at: string | null;
  licence_granted_at: string | null;
  licence_issued_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  lapsed_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ApplicationEventRow {
  id: string;
  application_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<LicenceApplicationStatus, keyof ApplicationRow | null> = {
  application_received:      null,
  completeness_review:       'completeness_review_at',
  additional_info_requested: 'additional_info_requested_at',
  accepted:                  'accepted_at',
  public_participation:      'public_participation_at',
  technical_evaluation:      'technical_evaluation_at',
  council_decision:          'council_decision_at',
  licence_granted:           'licence_granted_at',
  licence_issued:            'licence_issued_at',
  refused:                   'refused_at',
  withdrawn:                 'withdrawn_at',
  lapsed:                    'lapsed_at',
};

function decorate(row: ApplicationRow, now: Date) {
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
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(klass),
  };
}

// submit_info round-trips the application back into completeness_review, so it
// SHARES the completeness_review event type — the to_status is what matters.
function eventTypeFor(action: LicenceApplicationAction): string {
  switch (action) {
    case 'begin_review':       return 'licence_application.completeness_review';
    case 'request_info':       return 'licence_application.additional_info_requested';
    case 'submit_info':        return 'licence_application.completeness_review';
    case 'accept_application': return 'licence_application.accepted';
    case 'open_participation': return 'licence_application.public_participation';
    case 'begin_evaluation':   return 'licence_application.technical_evaluation';
    case 'refer_to_council':   return 'licence_application.council_decision';
    case 'grant_licence':      return 'licence_application.licence_granted';
    case 'issue_licence':      return 'licence_application.licence_issued';
    case 'refuse_licence':     return 'licence_application.refused';
    case 'withdraw':           return 'licence_application.withdrawn';
    case 'lapse':              return 'licence_application.lapsed';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const licence_class      = c.req.query('licence_class');
  const licence_type       = c.req.query('licence_type');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const applicant_party_id = c.req.query('applicant_party_id');
  const reportable         = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_licence_applications WHERE 1=1';
  const binds: unknown[] = [];
  if (licence_class)      { sql += ' AND licence_class = ?';      binds.push(licence_class); }
  if (licence_type)       { sql += ' AND licence_type = ?';       binds.push(licence_type); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (applicant_party_id) { sql += ' AND applicant_party_id = ?'; binds.push(applicant_party_id); }

  sql += ' ORDER BY datetime(application_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ApplicationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_class[i.licence_class] = (by_class[i.licence_class] || 0) + 1;
    by_type[i.licence_type] = (by_type[i.licence_type] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const issued_count     = items.filter((i) => i.chain_status === 'licence_issued').length;
  const refused_count    = items.filter((i) => i.chain_status === 'refused').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const lapsed_count     = items.filter((i) => i.chain_status === 'lapsed').length;
  const granted_count    = items.filter((i) => i.chain_status === 'licence_granted' || i.chain_status === 'licence_issued').length;
  const in_evaluation    = items.filter((i) => i.chain_status === 'technical_evaluation' || i.chain_status === 'council_decision').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const major_open       = items.filter((i) => !i.is_terminal && i.licence_class === 'major_licence').length;
  const total_capacity_mw   = items.reduce((sum, i) => sum + (i.capacity_mw || 0), 0);
  const granted_capacity_mw = items
    .filter((i) => i.chain_status === 'licence_granted' || i.chain_status === 'licence_issued')
    .reduce((sum, i) => sum + (i.capacity_mw || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_class,
      by_type,
      open_count,
      issued_count,
      refused_count,
      withdrawn_count,
      lapsed_count,
      granted_count,
      in_evaluation,
      breached: breached_count,
      reportable_total,
      major_open,
      total_capacity_mw,
      granted_capacity_mw,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_licence_applications WHERE id = ?').bind(id).first<ApplicationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_licence_applications_events WHERE application_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ApplicationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CompletenessBody {
  completeness_ref?: string;
  completeness_basis?: string;
  notes?: string;
}

interface InfoRequestBody {
  info_request_ref?: string;
  info_request_basis?: string;
  notes?: string;
}

interface SubmitInfoBody {
  notes?: string;
}

interface AcceptBody {
  acceptance_ref?: string;
  acceptance_basis?: string;
  notes?: string;
}

interface ParticipationBody {
  participation_ref?: string;
  participation_basis?: string;
  notes?: string;
}

interface EvaluationBody {
  evaluation_ref?: string;
  evaluation_basis?: string;
  notes?: string;
}

interface CouncilBody {
  council_ref?: string;
  council_basis?: string;
  notes?: string;
}

interface GrantBody {
  grant_basis?: string;
  council_ref?: string;
  notes?: string;
}

interface IssueBody {
  licence_ref?: string;
  gazette_ref?: string;
  regulator_ref?: string;
  rod_notes?: string;
  notes?: string;
}

interface RefuseBody {
  refusal_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WithdrawBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface LapseBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: LicenceApplicationAction,
  bodyHandler?: (row: ApplicationRow, body: Record<string, unknown>) => Partial<ApplicationRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isApplicantAction(action) ? APPLICANT_WRITE_ROLES : REGULATOR_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_licence_applications WHERE id = ?').bind(id).first<ApplicationRow>();
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

  const crosses = crossesIntoRegulator(action, row.licence_class);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A refusal (any class) or major-licence grant that crosses into the
  // regulator marks the case reportable onto the Council oversight queue.
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
    `UPDATE oe_licence_applications SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `lapp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'licence_application',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_licence_applications WHERE id = ?').bind(id).first<ApplicationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const b = body as Partial<CompletenessBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.completeness_ref === 'string')   out.completeness_ref = b.completeness_ref;
  if (typeof b.completeness_basis === 'string') out.completeness_basis = b.completeness_basis;
  return out;
}));

app.post('/:id/request-info', async (c) => transition(c, 'request_info', (row, body) => {
  const b = body as Partial<InfoRequestBody>;
  const out: Partial<ApplicationRow> = { info_request_round: (row.info_request_round || 0) + 1 };
  if (typeof b.info_request_ref === 'string')   out.info_request_ref = b.info_request_ref;
  if (typeof b.info_request_basis === 'string') out.info_request_basis = b.info_request_basis;
  return out;
}));

app.post('/:id/submit-info', async (c) => transition(c, 'submit_info', (_row, body) => {
  const b = body as Partial<SubmitInfoBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.notes === 'string') out.completeness_basis = b.notes;
  return out;
}));

app.post('/:id/accept-application', async (c) => transition(c, 'accept_application', (_row, body) => {
  const b = body as Partial<AcceptBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.acceptance_ref === 'string')   out.acceptance_ref = b.acceptance_ref;
  if (typeof b.acceptance_basis === 'string') out.acceptance_basis = b.acceptance_basis;
  return out;
}));

app.post('/:id/open-participation', async (c) => transition(c, 'open_participation', (_row, body) => {
  const b = body as Partial<ParticipationBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.participation_ref === 'string')   out.participation_ref = b.participation_ref;
  if (typeof b.participation_basis === 'string') out.participation_basis = b.participation_basis;
  return out;
}));

app.post('/:id/begin-evaluation', async (c) => transition(c, 'begin_evaluation', (_row, body) => {
  const b = body as Partial<EvaluationBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.evaluation_ref === 'string')   out.evaluation_ref = b.evaluation_ref;
  if (typeof b.evaluation_basis === 'string') out.evaluation_basis = b.evaluation_basis;
  return out;
}));

app.post('/:id/refer-to-council', async (c) => transition(c, 'refer_to_council', (_row, body) => {
  const b = body as Partial<CouncilBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.council_ref === 'string')   out.council_ref = b.council_ref;
  if (typeof b.council_basis === 'string') out.council_basis = b.council_basis;
  return out;
}));

app.post('/:id/grant-licence', async (c) => transition(c, 'grant_licence', (_row, body) => {
  const b = body as Partial<GrantBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.grant_basis === 'string') out.grant_basis = b.grant_basis;
  if (typeof b.council_ref === 'string') out.council_ref = b.council_ref;
  return out;
}));

app.post('/:id/issue-licence', async (c) => transition(c, 'issue_licence', (_row, body) => {
  const b = body as Partial<IssueBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.licence_ref === 'string')   out.licence_ref = b.licence_ref;
  if (typeof b.gazette_ref === 'string')   out.gazette_ref = b.gazette_ref;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.rod_notes === 'string')     out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/refuse-licence', async (c) => transition(c, 'refuse_licence', (_row, body) => {
  const b = body as Partial<RefuseBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.refusal_basis === 'string') out.refusal_basis = b.refusal_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')     out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/lapse', async (c) => transition(c, 'lapse', (_row, body) => {
  const b = body as Partial<LapseBody>;
  const out: Partial<ApplicationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

export async function licenceApplicationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_licence_applications
     WHERE chain_status NOT IN ('licence_issued','refused','withdrawn','lapsed')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ApplicationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_licence_applications
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `lapp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_licence_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'licence_application.sla_breached',
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
        event: 'licence_application.sla_breached',
        actor_id: 'system',
        entity_type: 'licence_application',
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
