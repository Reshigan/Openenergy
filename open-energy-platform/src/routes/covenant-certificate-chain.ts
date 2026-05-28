// ═══════════════════════════════════════════════════════════════════════════
// Wave 38 — Lender Covenant Compliance Certificate chain
//
// Mounted at /api/covenant-certificate/chain.
//
// The ONGOING monitoring backbone of project finance. After financial close,
// every facility imposes a periodic (quarterly / semi-annual) information
// covenant: the borrower delivers a signed Compliance Certificate evidencing
// the financial covenants (DSCR, LLCR, gearing) for the test period. The
// facility agent reviews and either confirms compliance or declares a breach;
// a breach routes through the waiver / cure / acceleration branches.
//
// Sits downstream of the one-off W21 drawdown + W30 disbursement-UoP chains;
// wraps the static covenant evaluator (src/utils/covenants.ts) in a formal
// certification lifecycle.
//
// Forward path:
//   certificate_due → certificate_submitted → under_review → ratios_verified
//     → compliant
//
// Breach branch:
//   breach_identified → waiver_requested → waiver_granted (closed-with-waiver)
//                     → cure_period → cured
//                     → accelerated (event of default)
//   certificate_due → breach_identified (information-covenant breach — non-delivery)
//
// Tiers (facility seniority): senior_secured / mezzanine / subordinated.
//
// Frameworks: LMA project-finance compliance certificate + Equator Principles +
// SARB large-exposure reporting.
//
// SLA matrix is URGENT — senior secured gets the TIGHTEST windows (closest
// monitoring). Reportability (regulator inbox):
//   - accelerate (event of default) crosses for EVERY tier (SARB hard line)
//   - breach declarations cross for senior_secured + mezzanine only
//   - sla_breached crosses for senior_secured + mezzanine only
//
// Two-party split write: the borrower (ipp_developer) submits certificates +
// requests waivers; the lender side (lender / admin / support) does everything
// else. actor_party (borrower / agent / lender) is derived from the action.
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
  type CovCertStatus,
  type CovCertAction,
  type CovCertTier,
} from '../utils/covenant-certificate-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'lender',
  'ipp_developer',
  'regulator',
]);

// Two-party split write. The borrower side (the project company = ipp_developer)
// can only deliver certificates + request waivers; the lender side runs review,
// verification, breach handling, waiver decisions, and acceleration.
const LENDER_WRITE_ROLES   = new Set(['admin', 'support', 'lender']);
const BORROWER_WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CovCertRow {
  id: string;
  certificate_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  borrower_party_id: string;
  borrower_party_name: string;
  facility_agent_name: string | null;
  lender_name: string | null;
  facility_name: string;
  facility_tier: CovCertTier;
  facility_limit: number | null;
  outstanding_principal: number | null;
  test_period: string | null;
  test_period_end: string | null;
  dscr_actual: number | null;
  dscr_threshold: number | null;
  llcr_actual: number | null;
  llcr_threshold: number | null;
  gearing_actual: number | null;
  gearing_threshold: number | null;
  breached_covenants: string | null;
  certificate_ref: string | null;
  review_ref: string | null;
  breach_ref: string | null;
  waiver_ref: string | null;
  cure_ref: string | null;
  acceleration_ref: string | null;
  submission_basis: string | null;
  review_basis: string | null;
  breach_basis: string | null;
  waiver_basis: string | null;
  cure_basis: string | null;
  acceleration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: CovCertStatus;
  certificate_due_at: string;
  certificate_submitted_at: string | null;
  under_review_at: string | null;
  ratios_verified_at: string | null;
  compliant_at: string | null;
  breach_identified_at: string | null;
  waiver_requested_at: string | null;
  waiver_granted_at: string | null;
  cure_period_at: string | null;
  cured_at: string | null;
  accelerated_at: string | null;
  waiver_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CovCertEventRow {
  id: string;
  certificate_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CovCertStatus, keyof CovCertRow | null> = {
  certificate_due:        null,
  certificate_submitted:  'certificate_submitted_at',
  under_review:           'under_review_at',
  ratios_verified:        'ratios_verified_at',
  compliant:              'compliant_at',
  breach_identified:      'breach_identified_at',
  waiver_requested:       'waiver_requested_at',
  waiver_granted:         'waiver_granted_at',
  cure_period:            'cure_period_at',
  cured:                  'cured_at',
  accelerated:            'accelerated_at',
};

const BREACH_PATH = new Set<CovCertStatus>([
  'breach_identified', 'waiver_requested', 'waiver_granted', 'cure_period', 'cured', 'accelerated',
]);
const ACTIVE_BREACH = new Set<CovCertStatus>([
  'breach_identified', 'waiver_requested', 'cure_period',
]);

function decorate(row: CovCertRow, now: Date) {
  const tier = row.facility_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const hasBreached = BREACH_PATH.has(status);
  const isReportable = (hasBreached && isReportableTier(tier)) || status === 'accelerated';
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: isReportable,
    has_breached: hasBreached,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: CovCertAction): string {
  switch (action) {
    case 'submit_certificate':   return 'covenant_certificate.certificate_submitted';
    case 'begin_review':         return 'covenant_certificate.under_review';
    case 'verify_ratios':        return 'covenant_certificate.ratios_verified';
    case 'confirm_compliant':    return 'covenant_certificate.compliant';
    case 'flag_breach':          return 'covenant_certificate.breach_identified';
    case 'flag_non_submission':  return 'covenant_certificate.breach_identified';
    case 'request_waiver':       return 'covenant_certificate.waiver_requested';
    case 'grant_waiver':         return 'covenant_certificate.waiver_granted';
    case 'require_cure':         return 'covenant_certificate.cure_period';
    case 'confirm_cured':        return 'covenant_certificate.cured';
    case 'accelerate':           return 'covenant_certificate.accelerated';
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
  const test_period       = c.req.query('test_period');

  let sql = 'SELECT * FROM oe_covenant_certificates WHERE 1=1';
  const binds: unknown[] = [];
  if (facility_tier)     { sql += ' AND facility_tier = ?';     binds.push(facility_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (borrower_party_id) { sql += ' AND borrower_party_id = ?'; binds.push(borrower_party_id); }
  if (test_period)       { sql += ' AND test_period = ?';       binds.push(test_period); }

  sql += ' ORDER BY datetime(certificate_due_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CovCertRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.facility_tier]  = (by_tier[i.facility_tier] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const compliant_count     = items.filter((i) => i.chain_status === 'compliant').length;
  const active_breach_count = items.filter((i) => ACTIVE_BREACH.has(i.chain_status)).length;
  const waiver_granted_count = items.filter((i) => i.chain_status === 'waiver_granted').length;
  const cured_count         = items.filter((i) => i.chain_status === 'cured').length;
  const accelerated_count   = items.filter((i) => i.chain_status === 'accelerated').length;
  const breached_count      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable).length;
  const senior_open         = items.filter((i) => !i.is_terminal && i.facility_tier === 'senior_secured').length;
  const total_outstanding   = items.reduce((sum, i) => sum + (i.outstanding_principal || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      compliant_count,
      active_breach_count,
      waiver_granted_count,
      cured_count,
      accelerated_count,
      breached: breached_count,
      reportable_total,
      senior_open,
      total_outstanding,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_covenant_certificates WHERE id = ?').bind(id).first<CovCertRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_covenant_certificate_events WHERE certificate_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CovCertEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitBody {
  certificate_ref?: string;
  dscr_actual?: number;
  llcr_actual?: number;
  gearing_actual?: number;
  submission_basis?: string;
  notes?: string;
}

interface ReviewBody {
  review_ref?: string;
  review_basis?: string;
  notes?: string;
}

interface VerifyBody {
  dscr_actual?: number;
  llcr_actual?: number;
  gearing_actual?: number;
  review_basis?: string;
  notes?: string;
}

interface CompliantBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface BreachBody {
  breach_ref?: string;
  breached_covenants?: string;
  breach_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface WaiverRequestBody {
  waiver_ref?: string;
  waiver_basis?: string;
  notes?: string;
}

interface GrantWaiverBody {
  waiver_ref?: string;
  waiver_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface CureBody {
  cure_ref?: string;
  cure_basis?: string;
  notes?: string;
}

interface CuredBody {
  cure_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface AccelerateBody {
  acceleration_ref?: string;
  acceleration_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: CovCertAction,
  bodyHandler?: (row: CovCertRow, body: Record<string, unknown>) => Partial<CovCertRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isBorrowerAction(action) ? BORROWER_WRITE_ROLES : LENDER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_covenant_certificates WHERE id = ?').bind(id).first<CovCertRow>();
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
    `UPDATE oe_covenant_certificates SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `covcert_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'covenant_certificate',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_covenant_certificates WHERE id = ?').bind(id).first<CovCertRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit-certificate', async (c) => transition(c, 'submit_certificate', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.certificate_ref === 'string')  out.certificate_ref = b.certificate_ref;
  if (typeof b.dscr_actual === 'number')      out.dscr_actual = b.dscr_actual;
  if (typeof b.llcr_actual === 'number')      out.llcr_actual = b.llcr_actual;
  if (typeof b.gearing_actual === 'number')   out.gearing_actual = b.gearing_actual;
  if (typeof b.submission_basis === 'string') out.submission_basis = b.submission_basis;
  return out;
}));

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.review_ref === 'string')   out.review_ref = b.review_ref;
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/verify-ratios', async (c) => transition(c, 'verify_ratios', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.dscr_actual === 'number')    out.dscr_actual = b.dscr_actual;
  if (typeof b.llcr_actual === 'number')    out.llcr_actual = b.llcr_actual;
  if (typeof b.gearing_actual === 'number') out.gearing_actual = b.gearing_actual;
  if (typeof b.review_basis === 'string')   out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/confirm-compliant', async (c) => transition(c, 'confirm_compliant', (_row, body) => {
  const b = body as Partial<CompliantBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/flag-breach', async (c) => transition(c, 'flag_breach', (_row, body) => {
  const b = body as Partial<BreachBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.breach_ref === 'string')          out.breach_ref = b.breach_ref;
  if (typeof b.breached_covenants === 'string')  out.breached_covenants = b.breached_covenants;
  if (typeof b.breach_basis === 'string')        out.breach_basis = b.breach_basis;
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/flag-non-submission', async (c) => transition(c, 'flag_non_submission', (_row, body) => {
  const b = body as Partial<BreachBody>;
  const out: Partial<CovCertRow> = { breached_covenants: 'INFORMATION_COVENANT' };
  if (typeof b.breach_ref === 'string')   out.breach_ref = b.breach_ref;
  if (typeof b.breach_basis === 'string') out.breach_basis = b.breach_basis;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/request-waiver', async (c) => transition(c, 'request_waiver', (_row, body) => {
  const b = body as Partial<WaiverRequestBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.waiver_ref === 'string')   out.waiver_ref = b.waiver_ref;
  if (typeof b.waiver_basis === 'string') out.waiver_basis = b.waiver_basis;
  return out;
}));

app.post('/:id/grant-waiver', async (c) => transition(c, 'grant_waiver', (row, body) => {
  const b = body as Partial<GrantWaiverBody>;
  const out: Partial<CovCertRow> = { waiver_round: (row.waiver_round || 0) + 1 };
  if (typeof b.waiver_ref === 'string')   out.waiver_ref = b.waiver_ref;
  if (typeof b.waiver_basis === 'string') out.waiver_basis = b.waiver_basis;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')    out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/require-cure', async (c) => transition(c, 'require_cure', (_row, body) => {
  const b = body as Partial<CureBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.cure_ref === 'string')   out.cure_ref = b.cure_ref;
  if (typeof b.cure_basis === 'string') out.cure_basis = b.cure_basis;
  return out;
}));

app.post('/:id/confirm-cured', async (c) => transition(c, 'confirm_cured', (_row, body) => {
  const b = body as Partial<CuredBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.cure_basis === 'string')  out.cure_basis = b.cure_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/accelerate', async (c) => transition(c, 'accelerate', (_row, body) => {
  const b = body as Partial<AccelerateBody>;
  const out: Partial<CovCertRow> = {};
  if (typeof b.acceleration_ref === 'string')   out.acceleration_ref = b.acceleration_ref;
  if (typeof b.acceleration_basis === 'string') out.acceleration_basis = b.acceleration_basis;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')          out.rod_notes = b.rod_notes;
  return out;
}));

export async function covenantCertificateSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_covenant_certificates
     WHERE chain_status NOT IN ('compliant','waiver_granted','cured','accelerated')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CovCertRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_covenant_certificates
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `covcert_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_covenant_certificate_events (id, certificate_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'covenant_certificate.sla_breached',
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
        event: 'covenant_certificate.sla_breached',
        actor_id: 'system',
        entity_type: 'covenant_certificate',
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
