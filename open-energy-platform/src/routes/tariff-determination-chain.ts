// ═══════════════════════════════════════════════════════════════════════════
// Wave 43 — Regulator Tariff / Revenue (MYPD Price-Control) Determination chain
//
// Mounted at /api/tariff-determination/chain.
//
// NERSA's economic-regulation core (ERA 2006 §15–§16) + the Multi-Year Price
// Determination (MYPD) methodology + the Regulatory Clearing Account (RCA). A
// licensee files a revenue application; NERSA checks completeness, runs public
// consultation / hearings, performs the revenue analysis (RAB × WACC + opex +
// RCA true-up), prepares a draft determination, tables it for the Energy
// Regulator (Council) to deliberate, issues the determination, and the tariff is
// implemented — or the application is rejected, the applicant requests
// reconsideration, or a court sets the determination aside and remits it back.
//
// Where W33 renewal decides WHO may operate and W40 inspection enforces licence
// conditions, THIS chain decides WHAT a licensee may charge. Distinct from W39
// tariff-indexation (contractual CPI escalation of an already-agreed PPA tariff)
// — this is the upstream regulatory price-control determination that sets the cap.
//
// Forward path:
//   application_received → completeness_review → public_consultation
//     → revenue_analysis → draft_determination → council_deliberation
//     → determination_issued → implemented
//
// Reconsideration branch: determination_issued → reconsideration_requested → implemented|remitted
// Judicial set-aside:      determination_issued|reconsideration_requested → remitted
// Regulator rejection:     completeness_review|revenue_analysis → rejected
// Early withdraw:          application_received|completeness_review|public_consultation → withdrawn
//
// Classes (determination scope): multi_year / annual_tariff / sseg_feedin.
//
// INVERTED SLA — the bigger / higher-stakes the determination, the MORE time
// every window allows (a full MYPD warrants extensive analysis + hearings).
// Reportability:
//   - remit crosses for EVERY class (court set-aside — universal)
//   - issue_determination crosses for material classes (multi_year + annual_tariff)
//   - reject crosses for material classes
//   - sla_breached crosses for material classes
//
// Two-party split write: the applicant licensee files / requests reconsideration
// / withdraws; the regulator drives everything else. actor_party
// (applicant / registry / analyst / council / court) derived from the action.
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
  type TariffDeterminationStatus,
  type TariffDeterminationAction,
  type TariffDeterminationClass,
} from '../utils/tariff-determination-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// Two-party split write. The regulator drives the determination machinery; the
// applicant licensee files / requests reconsideration / withdraws. A licensee
// can hold any of the operating roles, so the applicant write-set spans every
// licensee-side role.
const REGULATOR_WRITE_ROLES = new Set(['admin', 'support', 'regulator']);
const APPLICANT_WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface DeterminationRow {
  id: string;
  determination_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  regulator_party_id: string;
  regulator_party_name: string;
  licence_ref: string | null;
  tariff_entity: string;
  tariff_segment: string | null;
  determination_class: TariffDeterminationClass;
  mypd_period: string | null;
  price_year: string | null;
  requested_revenue_zar_m: number | null;
  allowed_revenue_zar_m: number | null;
  rab_zar_m: number | null;
  wacc_pre_tax: number | null;
  opex_zar_m: number | null;
  rca_balance_zar_m: number | null;
  requested_tariff_zar_kwh: number | null;
  allowed_tariff_zar_kwh: number | null;
  tariff_increase_pct: number | null;
  x_factor: number | null;
  application_ref: string | null;
  completeness_ref: string | null;
  consultation_ref: string | null;
  analysis_ref: string | null;
  draft_ref: string | null;
  determination_ref: string | null;
  reconsideration_ref: string | null;
  court_ref: string | null;
  gazette_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  completeness_basis: string | null;
  consultation_basis: string | null;
  analysis_basis: string | null;
  draft_basis: string | null;
  determination_basis: string | null;
  reconsideration_basis: string | null;
  remit_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: TariffDeterminationStatus;
  application_received_at: string;
  completeness_review_at: string | null;
  public_consultation_at: string | null;
  revenue_analysis_at: string | null;
  draft_determination_at: string | null;
  council_deliberation_at: string | null;
  determination_issued_at: string | null;
  reconsideration_requested_at: string | null;
  implemented_at: string | null;
  remitted_at: string | null;
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

interface DeterminationEventRow {
  id: string;
  determination_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<TariffDeterminationStatus, keyof DeterminationRow | null> = {
  application_received:      null,
  completeness_review:       'completeness_review_at',
  public_consultation:       'public_consultation_at',
  revenue_analysis:          'revenue_analysis_at',
  draft_determination:       'draft_determination_at',
  council_deliberation:      'council_deliberation_at',
  determination_issued:      'determination_issued_at',
  reconsideration_requested: 'reconsideration_requested_at',
  implemented:               'implemented_at',
  remitted:                  'remitted_at',
  rejected:                  'rejected_at',
  withdrawn:                 'withdrawn_at',
};

function decorate(row: DeterminationRow, now: Date) {
  const klass = row.determination_class;
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

function eventTypeFor(action: TariffDeterminationAction): string {
  switch (action) {
    case 'begin_review':            return 'tariff_determination.completeness_review';
    case 'open_consultation':       return 'tariff_determination.public_consultation';
    case 'begin_analysis':          return 'tariff_determination.revenue_analysis';
    case 'prepare_draft':           return 'tariff_determination.draft_determination';
    case 'table_for_council':       return 'tariff_determination.council_deliberation';
    case 'issue_determination':     return 'tariff_determination.determination_issued';
    case 'request_reconsideration': return 'tariff_determination.reconsideration_requested';
    case 'implement':               return 'tariff_determination.implemented';
    case 'remit':                   return 'tariff_determination.remitted';
    case 'reject':                  return 'tariff_determination.rejected';
    case 'withdraw':                return 'tariff_determination.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const determination_class = c.req.query('determination_class');
  const tariff_segment      = c.req.query('tariff_segment');
  const status              = c.req.query('status');
  const breached            = c.req.query('breached');
  const applicant_party_id  = c.req.query('applicant_party_id');
  const reportable          = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_tariff_determinations WHERE 1=1';
  const binds: unknown[] = [];
  if (determination_class) { sql += ' AND determination_class = ?'; binds.push(determination_class); }
  if (tariff_segment)      { sql += ' AND tariff_segment = ?';      binds.push(tariff_segment); }
  if (status)              { sql += ' AND chain_status = ?';        binds.push(status); }
  if (applicant_party_id)  { sql += ' AND applicant_party_id = ?';  binds.push(applicant_party_id); }

  sql += ' ORDER BY datetime(application_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<DeterminationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_class[i.determination_class] = (by_class[i.determination_class] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const implemented_count     = items.filter((i) => i.chain_status === 'implemented').length;
  const remitted_count        = items.filter((i) => i.chain_status === 'remitted').length;
  const rejected_count        = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count       = items.filter((i) => i.chain_status === 'withdrawn').length;
  const reconsideration_count = items.filter((i) => i.chain_status === 'reconsideration_requested').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable).length;
  const multi_year_open       = items.filter((i) => !i.is_terminal && i.determination_class === 'multi_year').length;
  const total_requested_revenue = items.reduce((sum, i) => sum + (i.requested_revenue_zar_m || 0), 0);
  const total_allowed_revenue   = items.reduce((sum, i) => sum + (i.allowed_revenue_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_class,
      open_count,
      implemented_count,
      remitted_count,
      rejected_count,
      withdrawn_count,
      reconsideration_count,
      breached: breached_count,
      reportable_total,
      multi_year_open,
      total_requested_revenue,
      total_allowed_revenue,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_tariff_determinations WHERE id = ?').bind(id).first<DeterminationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_tariff_determinations_events WHERE determination_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<DeterminationEventRow>();

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

interface ConsultationBody {
  consultation_ref?: string;
  consultation_basis?: string;
  notes?: string;
}

interface AnalysisBody {
  analysis_ref?: string;
  analysis_basis?: string;
  rab_zar_m?: number;
  wacc_pre_tax?: number;
  opex_zar_m?: number;
  rca_balance_zar_m?: number;
  notes?: string;
}

interface DraftBody {
  draft_ref?: string;
  draft_basis?: string;
  allowed_revenue_zar_m?: number;
  allowed_tariff_zar_kwh?: number;
  tariff_increase_pct?: number;
  x_factor?: number;
  notes?: string;
}

interface CouncilBody {
  determination_basis?: string;
  notes?: string;
}

interface IssueBody {
  determination_ref?: string;
  determination_basis?: string;
  gazette_ref?: string;
  regulator_ref?: string;
  allowed_revenue_zar_m?: number;
  allowed_tariff_zar_kwh?: number;
  tariff_increase_pct?: number;
  x_factor?: number;
  notes?: string;
}

interface ReconsiderationBody {
  reconsideration_ref?: string;
  reconsideration_basis?: string;
  notes?: string;
}

interface ImplementBody {
  gazette_ref?: string;
  regulator_ref?: string;
  rod_notes?: string;
  notes?: string;
}

interface RemitBody {
  court_ref?: string;
  remit_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface RejectBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WithdrawBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: TariffDeterminationAction,
  bodyHandler?: (row: DeterminationRow, body: Record<string, unknown>) => Partial<DeterminationRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isApplicantAction(action) ? APPLICANT_WRITE_ROLES : REGULATOR_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_tariff_determinations WHERE id = ?').bind(id).first<DeterminationRow>();
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
  const sla = slaDeadlineFor(to, row.determination_class, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.determination_class);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A determination / rejection / set-aside that crosses into the regulator
  // marks the case reportable onto the Council oversight queue.
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
    `UPDATE oe_tariff_determinations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `tdet_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'tariff_determination',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_tariff_determinations WHERE id = ?').bind(id).first<DeterminationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const b = body as Partial<CompletenessBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.completeness_ref === 'string')   out.completeness_ref = b.completeness_ref;
  if (typeof b.completeness_basis === 'string') out.completeness_basis = b.completeness_basis;
  return out;
}));

app.post('/:id/open-consultation', async (c) => transition(c, 'open_consultation', (_row, body) => {
  const b = body as Partial<ConsultationBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.consultation_ref === 'string')   out.consultation_ref = b.consultation_ref;
  if (typeof b.consultation_basis === 'string') out.consultation_basis = b.consultation_basis;
  return out;
}));

app.post('/:id/begin-analysis', async (c) => transition(c, 'begin_analysis', (_row, body) => {
  const b = body as Partial<AnalysisBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.analysis_ref === 'string')       out.analysis_ref = b.analysis_ref;
  if (typeof b.analysis_basis === 'string')     out.analysis_basis = b.analysis_basis;
  if (typeof b.rab_zar_m === 'number')          out.rab_zar_m = b.rab_zar_m;
  if (typeof b.wacc_pre_tax === 'number')       out.wacc_pre_tax = b.wacc_pre_tax;
  if (typeof b.opex_zar_m === 'number')         out.opex_zar_m = b.opex_zar_m;
  if (typeof b.rca_balance_zar_m === 'number')  out.rca_balance_zar_m = b.rca_balance_zar_m;
  return out;
}));

app.post('/:id/prepare-draft', async (c) => transition(c, 'prepare_draft', (_row, body) => {
  const b = body as Partial<DraftBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.draft_ref === 'string')             out.draft_ref = b.draft_ref;
  if (typeof b.draft_basis === 'string')           out.draft_basis = b.draft_basis;
  if (typeof b.allowed_revenue_zar_m === 'number') out.allowed_revenue_zar_m = b.allowed_revenue_zar_m;
  if (typeof b.allowed_tariff_zar_kwh === 'number') out.allowed_tariff_zar_kwh = b.allowed_tariff_zar_kwh;
  if (typeof b.tariff_increase_pct === 'number')   out.tariff_increase_pct = b.tariff_increase_pct;
  if (typeof b.x_factor === 'number')              out.x_factor = b.x_factor;
  return out;
}));

app.post('/:id/table-for-council', async (c) => transition(c, 'table_for_council', (_row, body) => {
  const b = body as Partial<CouncilBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.determination_basis === 'string') out.determination_basis = b.determination_basis;
  return out;
}));

app.post('/:id/issue-determination', async (c) => transition(c, 'issue_determination', (_row, body) => {
  const b = body as Partial<IssueBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.determination_ref === 'string')      out.determination_ref = b.determination_ref;
  if (typeof b.determination_basis === 'string')    out.determination_basis = b.determination_basis;
  if (typeof b.gazette_ref === 'string')            out.gazette_ref = b.gazette_ref;
  if (typeof b.regulator_ref === 'string')          out.regulator_ref = b.regulator_ref;
  if (typeof b.allowed_revenue_zar_m === 'number')  out.allowed_revenue_zar_m = b.allowed_revenue_zar_m;
  if (typeof b.allowed_tariff_zar_kwh === 'number') out.allowed_tariff_zar_kwh = b.allowed_tariff_zar_kwh;
  if (typeof b.tariff_increase_pct === 'number')    out.tariff_increase_pct = b.tariff_increase_pct;
  if (typeof b.x_factor === 'number')               out.x_factor = b.x_factor;
  return out;
}));

app.post('/:id/request-reconsideration', async (c) => transition(c, 'request_reconsideration', (_row, body) => {
  const b = body as Partial<ReconsiderationBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.reconsideration_ref === 'string')   out.reconsideration_ref = b.reconsideration_ref;
  if (typeof b.reconsideration_basis === 'string') out.reconsideration_basis = b.reconsideration_basis;
  return out;
}));

app.post('/:id/implement', async (c) => transition(c, 'implement', (_row, body) => {
  const b = body as Partial<ImplementBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.gazette_ref === 'string')   out.gazette_ref = b.gazette_ref;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.rod_notes === 'string')     out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/remit', async (c) => transition(c, 'remit', (_row, body) => {
  const b = body as Partial<RemitBody>;
  const out: Partial<DeterminationRow> = { escalation_level: 1 };
  if (typeof b.court_ref === 'string')   out.court_ref = b.court_ref;
  if (typeof b.remit_basis === 'string') out.remit_basis = b.remit_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<DeterminationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

export async function tariffDeterminationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_tariff_determinations
     WHERE chain_status NOT IN ('implemented','remitted','rejected','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<DeterminationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_tariff_determinations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `tdet_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_tariff_determinations_events (id, determination_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'tariff_determination.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (class ${row.determination_class})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.determination_class)) {
      await fireCascade({
        event: 'tariff_determination.sla_breached',
        actor_id: 'system',
        entity_type: 'tariff_determination',
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
