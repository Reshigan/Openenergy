// ═══════════════════════════════════════════════════════════════════════════
// Wave 53 — Lender Credit Facility Origination & Credit Approval chain
//
// Mounted at /api/credit-origination/chain.
//
// The FRONT-END of the project-finance lifecycle: the credit-approval gate a
// borrower passes BEFORE any money is committed. A prospective borrower applies
// for a facility; the lender screens it (eligibility / KYC / NCA affordability),
// runs a full credit assessment (financial model, DD, security), refers it to the
// credit committee, which approves / approves-with-conditions / refers-back /
// declines; once approved the lender issues the facility agreement, the borrower
// satisfies the conditions precedent, and the lender activates the facility — at
// which point it becomes available to draw.
//
// Sits UPSTREAM of every other Lender chain — it CREATES the facility the rest of
// the lifecycle then governs (W21 drawdown, W30 disbursement-UoP, W38 covenant
// certificate, W6 dunning, W45 loan default). A `facility_available` terminal here
// is the precondition for a W21 drawdown.
//
// Frameworks: National Credit Act 34/2005 + Banks Act 94/1990 + Basel III +
// SARB large-exposure framework + an LMA-style facility agreement.
//
// SLA matrix is INVERTED — the bigger the facility, the MORE time every window
// allows. Reportability (SARB large-exposure / prudential queue):
//   - activate crosses for large-exposure tiers (major + systemic) — making the
//     facility live puts a large exposure on the book (the W53 signature)
//   - decline crosses for systemic only
//   - sla_breached crosses for large-exposure tiers (major + systemic)
//
// Two-party split write: the applicant (borrower / ipp_developer) satisfies
// conditions / CPs and may withdraw; the lender drives screening, assessment,
// committee, issuance, activation and decline. actor_party (applicant / lender)
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
  isLargeExposureTier,
  isApplicantAction,
  partyForAction,
  SLA_MINUTES,
  type CreditFacilityStatus,
  type CreditFacilityAction,
  type CreditFacilityTier,
} from '../utils/credit-origination-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'lender',
  'ipp_developer',
  'regulator',
]);

// Two-party split write. The applicant side (the project company = ipp_developer)
// supplies info to satisfy conditions / satisfy CPs / withdraw; the lender side
// drives screening, assessment, committee, issuance, activation and decline.
const LENDER_WRITE_ROLES    = new Set(['admin', 'support', 'lender']);
const APPLICANT_WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CreditFacilityRow {
  id: string;
  application_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  lender_name: string | null;
  sponsor_name: string | null;
  facility_tier: CreditFacilityTier;
  facility_name: string;
  facility_type: string | null;
  facility_purpose: string | null;
  facility_limit_zar_m: number | null;
  tenor_months: number | null;
  margin_bps: number | null;
  pricing_basis: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  credit_rating: string | null;
  ltv_pct: number | null;
  dscr_base: number | null;
  gearing_pct: number | null;
  pd_pct: number | null;
  lgd_pct: number | null;
  ead_zar_m: number | null;
  approved_amount_zar_m: number | null;
  conditions_count: number | null;
  cp_count: number | null;
  screening_ref: string | null;
  assessment_ref: string | null;
  committee_ref: string | null;
  approval_ref: string | null;
  agreement_ref: string | null;
  cp_ref: string | null;
  activation_ref: string | null;
  decline_ref: string | null;
  regulator_ref: string | null;
  screening_basis: string | null;
  assessment_basis: string | null;
  committee_basis: string | null;
  approval_basis: string | null;
  conditions_basis: string | null;
  cp_basis: string | null;
  activation_basis: string | null;
  decline_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  referral_round: number;
  chain_status: CreditFacilityStatus;
  application_received_at: string;
  screening_at: string | null;
  credit_assessment_at: string | null;
  committee_review_at: string | null;
  referred_back_at: string | null;
  conditions_pending_at: string | null;
  approved_at: string | null;
  agreement_issued_at: string | null;
  cp_satisfied_at: string | null;
  facility_available_at: string | null;
  declined_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CreditFacilityEventRow {
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

const TIMESTAMP_COLUMN: Record<CreditFacilityStatus, keyof CreditFacilityRow | null> = {
  application_received: null,
  screening:            'screening_at',
  credit_assessment:    'credit_assessment_at',
  committee_review:     'committee_review_at',
  referred_back:        'referred_back_at',
  conditions_pending:   'conditions_pending_at',
  approved:             'approved_at',
  agreement_issued:     'agreement_issued_at',
  cp_satisfied:         'cp_satisfied_at',
  facility_available:   'facility_available_at',
  declined:             'declined_at',
  withdrawn:            'withdrawn_at',
};

function decorate(row: CreditFacilityRow, now: Date) {
  const tier = row.facility_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  // activate crossing materialises at facility_available for large-exposure tiers;
  // decline crossing materialises at declined for systemic only.
  const isReportable =
    (status === 'facility_available' && isLargeExposureTier(tier))
    || (status === 'declined' && tier === 'systemic');
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: isReportable,
    is_large_exposure: isLargeExposureTier(tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: CreditFacilityAction): string {
  switch (action) {
    case 'screen':                  return 'credit_origination.screening';
    case 'assess':                  return 'credit_origination.credit_assessment';
    case 'refer_committee':         return 'credit_origination.committee_review';
    case 'refer_back':              return 'credit_origination.referred_back';
    case 'approve':                 return 'credit_origination.approved';
    case 'approve_with_conditions': return 'credit_origination.conditions_pending';
    case 'satisfy_conditions':      return 'credit_origination.approved';
    case 'issue_agreement':         return 'credit_origination.agreement_issued';
    case 'satisfy_cp':              return 'credit_origination.cp_satisfied';
    case 'activate':                return 'credit_origination.facility_available';
    case 'decline':                 return 'credit_origination.declined';
    case 'withdraw':                return 'credit_origination.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const facility_tier      = c.req.query('facility_tier');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const applicant_party_id = c.req.query('applicant_party_id');
  const sector             = c.req.query('sector');

  let sql = 'SELECT * FROM oe_credit_facility_applications WHERE 1=1';
  const binds: unknown[] = [];
  if (facility_tier)      { sql += ' AND facility_tier = ?';      binds.push(facility_tier); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (applicant_party_id) { sql += ' AND applicant_party_id = ?'; binds.push(applicant_party_id); }
  if (sector)             { sql += ' AND sector = ?';             binds.push(sector); }

  sql += ' ORDER BY datetime(application_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CreditFacilityRow>();
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
  const available_count       = items.filter((i) => i.chain_status === 'facility_available').length;
  const declined_count        = items.filter((i) => i.chain_status === 'declined').length;
  const withdrawn_count       = items.filter((i) => i.chain_status === 'withdrawn').length;
  const in_committee_count     = items.filter((i) => i.chain_status === 'committee_review').length;
  const conditions_pending_cnt = items.filter((i) => i.chain_status === 'conditions_pending').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable).length;
  const large_exposure_open   = items.filter((i) => !i.is_terminal && i.is_large_exposure).length;
  const total_limit_zar_m     = items.reduce((sum, i) => sum + (i.facility_limit_zar_m || 0), 0);
  const total_approved_zar_m  = items.reduce((sum, i) => sum + (i.approved_amount_zar_m || 0), 0);
  const available_limit_zar_m = items
    .filter((i) => i.chain_status === 'facility_available')
    .reduce((sum, i) => sum + (i.facility_limit_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      available_count,
      declined_count,
      withdrawn_count,
      in_committee_count,
      conditions_pending_count: conditions_pending_cnt,
      breached: breached_count,
      reportable_total,
      large_exposure_open,
      total_limit_zar_m,
      total_approved_zar_m,
      available_limit_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_credit_facility_applications WHERE id = ?').bind(id).first<CreditFacilityRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_credit_facility_applications_events WHERE application_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CreditFacilityEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreenBody {
  screening_ref?: string;
  screening_basis?: string;
  credit_rating?: string;
  notes?: string;
}

interface AssessBody {
  assessment_ref?: string;
  assessment_basis?: string;
  ltv_pct?: number;
  dscr_base?: number;
  gearing_pct?: number;
  pd_pct?: number;
  lgd_pct?: number;
  ead_zar_m?: number;
  credit_rating?: string;
  notes?: string;
}

interface ReferCommitteeBody {
  committee_ref?: string;
  committee_basis?: string;
  notes?: string;
}

interface ReferBackBody {
  committee_basis?: string;
  reason_code?: string;
  decision_notes?: string;
  notes?: string;
}

interface ApproveBody {
  approval_ref?: string;
  approval_basis?: string;
  approved_amount_zar_m?: number;
  reason_code?: string;
  decision_notes?: string;
  notes?: string;
}

interface ApproveWithConditionsBody {
  approval_ref?: string;
  approval_basis?: string;
  conditions_basis?: string;
  conditions_count?: number;
  approved_amount_zar_m?: number;
  reason_code?: string;
  decision_notes?: string;
  notes?: string;
}

interface SatisfyConditionsBody {
  conditions_basis?: string;
  notes?: string;
}

interface IssueAgreementBody {
  agreement_ref?: string;
  cp_count?: number;
  notes?: string;
}

interface SatisfyCpBody {
  cp_ref?: string;
  cp_basis?: string;
  notes?: string;
}

interface ActivateBody {
  activation_ref?: string;
  activation_basis?: string;
  regulator_ref?: string;
  notes?: string;
}

interface DeclineBody {
  decline_ref?: string;
  decline_basis?: string;
  reason_code?: string;
  decision_notes?: string;
  regulator_ref?: string;
  notes?: string;
}

interface WithdrawBody {
  reason_code?: string;
  decision_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: CreditFacilityAction,
  bodyHandler?: (row: CreditFacilityRow, body: Record<string, unknown>) => Partial<CreditFacilityRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isApplicantAction(action) ? APPLICANT_WRITE_ROLES : LENDER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_credit_facility_applications WHERE id = ?').bind(id).first<CreditFacilityRow>();
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

  // A referral back to assessment bumps the referral_round counter.
  if (action === 'refer_back') {
    overrides.referral_round = (row.referral_round || 0) + 1;
  }
  // Reportability flag is set when the crossing actually materialises.
  if (crossesIntoRegulator(action, row.facility_tier)) {
    overrides.is_reportable = 1;
  }

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
    `UPDATE oe_credit_facility_applications SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cfa_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_credit_facility_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'credit_facility_application',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_credit_facility_applications WHERE id = ?').bind(id).first<CreditFacilityRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/screen', async (c) => transition(c, 'screen', (_row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  if (typeof b.credit_rating === 'string')   out.credit_rating = b.credit_rating;
  return out;
}));

app.post('/:id/assess', async (c) => transition(c, 'assess', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.assessment_ref === 'string')   out.assessment_ref = b.assessment_ref;
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  if (typeof b.ltv_pct === 'number')          out.ltv_pct = b.ltv_pct;
  if (typeof b.dscr_base === 'number')        out.dscr_base = b.dscr_base;
  if (typeof b.gearing_pct === 'number')      out.gearing_pct = b.gearing_pct;
  if (typeof b.pd_pct === 'number')           out.pd_pct = b.pd_pct;
  if (typeof b.lgd_pct === 'number')          out.lgd_pct = b.lgd_pct;
  if (typeof b.ead_zar_m === 'number')        out.ead_zar_m = b.ead_zar_m;
  if (typeof b.credit_rating === 'string')    out.credit_rating = b.credit_rating;
  return out;
}));

app.post('/:id/refer-committee', async (c) => transition(c, 'refer_committee', (_row, body) => {
  const b = body as Partial<ReferCommitteeBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.committee_ref === 'string')   out.committee_ref = b.committee_ref;
  if (typeof b.committee_basis === 'string') out.committee_basis = b.committee_basis;
  return out;
}));

app.post('/:id/refer-back', async (c) => transition(c, 'refer_back', (_row, body) => {
  const b = body as Partial<ReferBackBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.committee_basis === 'string') out.committee_basis = b.committee_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string')  out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.approval_ref === 'string')           out.approval_ref = b.approval_ref;
  if (typeof b.approval_basis === 'string')         out.approval_basis = b.approval_basis;
  if (typeof b.approved_amount_zar_m === 'number')  out.approved_amount_zar_m = b.approved_amount_zar_m;
  if (typeof b.reason_code === 'string')            out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string')         out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/approve-with-conditions', async (c) => transition(c, 'approve_with_conditions', (_row, body) => {
  const b = body as Partial<ApproveWithConditionsBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.approval_ref === 'string')           out.approval_ref = b.approval_ref;
  if (typeof b.approval_basis === 'string')         out.approval_basis = b.approval_basis;
  if (typeof b.conditions_basis === 'string')       out.conditions_basis = b.conditions_basis;
  if (typeof b.conditions_count === 'number')       out.conditions_count = b.conditions_count;
  if (typeof b.approved_amount_zar_m === 'number')  out.approved_amount_zar_m = b.approved_amount_zar_m;
  if (typeof b.reason_code === 'string')            out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string')         out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/satisfy-conditions', async (c) => transition(c, 'satisfy_conditions', (_row, body) => {
  const b = body as Partial<SatisfyConditionsBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.conditions_basis === 'string') out.conditions_basis = b.conditions_basis;
  return out;
}));

app.post('/:id/issue-agreement', async (c) => transition(c, 'issue_agreement', (_row, body) => {
  const b = body as Partial<IssueAgreementBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.agreement_ref === 'string') out.agreement_ref = b.agreement_ref;
  if (typeof b.cp_count === 'number')      out.cp_count = b.cp_count;
  return out;
}));

app.post('/:id/satisfy-cp', async (c) => transition(c, 'satisfy_cp', (_row, body) => {
  const b = body as Partial<SatisfyCpBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.cp_ref === 'string')   out.cp_ref = b.cp_ref;
  if (typeof b.cp_basis === 'string') out.cp_basis = b.cp_basis;
  return out;
}));

app.post('/:id/activate', async (c) => transition(c, 'activate', (_row, body) => {
  const b = body as Partial<ActivateBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.activation_ref === 'string')   out.activation_ref = b.activation_ref;
  if (typeof b.activation_basis === 'string') out.activation_basis = b.activation_basis;
  if (typeof b.regulator_ref === 'string')    out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/decline', async (c) => transition(c, 'decline', (_row, body) => {
  const b = body as Partial<DeclineBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.decline_ref === 'string')    out.decline_ref = b.decline_ref;
  if (typeof b.decline_basis === 'string')  out.decline_basis = b.decline_basis;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string') out.decision_notes = b.decision_notes;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CreditFacilityRow> = {};
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string') out.decision_notes = b.decision_notes;
  return out;
}));

export async function creditOriginationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_credit_facility_applications
     WHERE chain_status NOT IN ('facility_available','declined','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CreditFacilityRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_credit_facility_applications
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cfa_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_credit_facility_applications_events (id, application_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'credit_origination.sla_breached',
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
        event: 'credit_origination.sla_breached',
        actor_id: 'system',
        entity_type: 'credit_facility_application',
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
