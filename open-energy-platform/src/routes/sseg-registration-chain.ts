// ═══════════════════════════════════════════════════════════════════════════
// Wave 57 — Regulator Embedded-Generation Registration & Schedule 2 Exemption chain
//
// Mounted at /api/sseg-registration/chain.
//
// NERSA registration of small-scale / embedded generation under the Electricity
// Regulation Act 4 of 2006 Schedule 2 (as amended). Schedule 2 lists generation
// activities EXEMPT from holding a licence; the 2023 amendment removed the
// own-use capacity cap. Exempt facilities above the de-minimis threshold must
// still REGISTER with NERSA. The light-touch front-end sibling of W49 full
// licensing: a registration committee determines whether a facility qualifies
// for the Schedule 2 exemption, then registers it, refuses it, or REFERS it UP
// to the W49 licensing pipeline (generation for sale / trading / export, or a
// configuration outside Schedule 2). Unlike W49 there is NO public-participation
// step — that lightness is the W57 distinction.
//
// Forward path:
//   registration_received → eligibility_screening → technical_verification
//     → exemption_determination → registration_approved → registered
//
// Conditional-approval loop: exemption_determination → conditions_pending → registration_approved
// Information-gap loop:       eligibility_screening → information_requested → eligibility_screening
// Referral (W57 signature):   exemption_determination → referred_to_licensing  (hands off to W49)
// Refusal:                    exemption_determination → refused
// Early withdraw:             pre-decision states → withdrawn
// Lapse:                      information_requested → lapsed
//
// Tiers: micro / small / medium / large / utility (by installed capacity kW).
//
// INVERTED SLA — the bigger the embedded generator, the MORE time every window
// allows; shorter overall than W49 licensing. Reportability:
//   - refer_to_licensing crosses for EVERY tier (W57 signature)
//   - refuse_registration crosses for large + utility only
//   - sla_breached crosses for large + utility
//
// Two-party split write: the applicant files / supplies info / satisfies
// conditions / withdraws; the regulator drives everything else. actor_party
// (applicant / registry / verifier / committee) derived from the action.
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
  type SsegRegistrationStatus,
  type SsegRegistrationAction,
  type SsegRegistrationTier,
} from '../utils/sseg-registration-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// Two-party split write. The regulator drives the registration machinery; the
// applicant files / supplies additional information / satisfies conditions /
// withdraws. A registrant can hold any operating role, so the applicant
// write-set spans every market-side role.
const REGULATOR_WRITE_ROLES = new Set(['admin', 'support', 'regulator']);
const APPLICANT_WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RegistrationRow {
  id: string;
  registration_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  regulator_party_id: string;
  regulator_party_name: string;
  capacity_tier: SsegRegistrationTier;
  generation_purpose: string;
  technology: string | null;
  customer_category: string | null;
  facility_name: string;
  facility_location: string | null;
  capacity_kw: number;
  point_of_connection: string | null;
  distributor: string | null;
  estimated_capex_zar_m: number | null;
  grid_connection_ref: string | null;
  application_ref: string | null;
  screening_ref: string | null;
  info_request_ref: string | null;
  verification_ref: string | null;
  determination_ref: string | null;
  conditions_ref: string | null;
  certificate_ref: string | null;
  licensing_referral_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  screening_basis: string | null;
  info_request_basis: string | null;
  verification_basis: string | null;
  determination_basis: string | null;
  conditions_basis: string | null;
  approval_basis: string | null;
  referral_basis: string | null;
  refusal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  info_request_round: number;
  chain_status: SsegRegistrationStatus;
  registration_received_at: string;
  eligibility_screening_at: string | null;
  information_requested_at: string | null;
  technical_verification_at: string | null;
  exemption_determination_at: string | null;
  conditions_pending_at: string | null;
  registration_approved_at: string | null;
  registered_at: string | null;
  referred_to_licensing_at: string | null;
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

interface RegistrationEventRow {
  id: string;
  registration_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<SsegRegistrationStatus, keyof RegistrationRow | null> = {
  registration_received:  null,
  eligibility_screening:  'eligibility_screening_at',
  information_requested:  'information_requested_at',
  technical_verification: 'technical_verification_at',
  exemption_determination:'exemption_determination_at',
  conditions_pending:     'conditions_pending_at',
  registration_approved:  'registration_approved_at',
  registered:             'registered_at',
  referred_to_licensing:  'referred_to_licensing_at',
  refused:                'refused_at',
  withdrawn:              'withdrawn_at',
  lapsed:                 'lapsed_at',
};

function decorate(row: RegistrationRow, now: Date) {
  const tier = row.capacity_tier;
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
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// submit_info round-trips the registration back into eligibility_screening, so
// it SHARES the eligibility_screening event type — the to_status is what matters.
// satisfy_conditions reaches registration_approved like approve_registration —
// it likewise shares the registration_approved event type.
function eventTypeFor(action: SsegRegistrationAction): string {
  switch (action) {
    case 'begin_screening':         return 'sseg_registration.eligibility_screening';
    case 'request_info':            return 'sseg_registration.information_requested';
    case 'submit_info':             return 'sseg_registration.eligibility_screening';
    case 'begin_verification':      return 'sseg_registration.technical_verification';
    case 'determine_exemption':     return 'sseg_registration.exemption_determination';
    case 'approve_registration':    return 'sseg_registration.registration_approved';
    case 'approve_with_conditions': return 'sseg_registration.conditions_pending';
    case 'satisfy_conditions':      return 'sseg_registration.registration_approved';
    case 'issue_certificate':       return 'sseg_registration.registered';
    case 'refer_to_licensing':      return 'sseg_registration.referred_to_licensing';
    case 'refuse_registration':     return 'sseg_registration.refused';
    case 'withdraw':                return 'sseg_registration.withdrawn';
    case 'lapse':                   return 'sseg_registration.lapsed';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const capacity_tier      = c.req.query('capacity_tier');
  const generation_purpose = c.req.query('generation_purpose');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const applicant_party_id = c.req.query('applicant_party_id');
  const reportable         = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_sseg_registrations WHERE 1=1';
  const binds: unknown[] = [];
  if (capacity_tier)      { sql += ' AND capacity_tier = ?';      binds.push(capacity_tier); }
  if (generation_purpose) { sql += ' AND generation_purpose = ?'; binds.push(generation_purpose); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (applicant_party_id) { sql += ' AND applicant_party_id = ?'; binds.push(applicant_party_id); }

  sql += ' ORDER BY datetime(registration_received_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RegistrationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_purpose: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.capacity_tier] = (by_tier[i.capacity_tier] || 0) + 1;
    by_purpose[i.generation_purpose] = (by_purpose[i.generation_purpose] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const registered_count  = items.filter((i) => i.chain_status === 'registered').length;
  const referred_count    = items.filter((i) => i.chain_status === 'referred_to_licensing').length;
  const refused_count     = items.filter((i) => i.chain_status === 'refused').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const lapsed_count      = items.filter((i) => i.chain_status === 'lapsed').length;
  const in_determination  = items.filter((i) => i.chain_status === 'exemption_determination' || i.chain_status === 'conditions_pending').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const large_open        = items.filter((i) => !i.is_terminal && (i.capacity_tier === 'large' || i.capacity_tier === 'utility')).length;
  const total_capacity_kw      = items.reduce((sum, i) => sum + (i.capacity_kw || 0), 0);
  const registered_capacity_kw = items
    .filter((i) => i.chain_status === 'registered')
    .reduce((sum, i) => sum + (i.capacity_kw || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_purpose,
      open_count,
      registered_count,
      referred_count,
      refused_count,
      withdrawn_count,
      lapsed_count,
      in_determination,
      breached: breached_count,
      reportable_total,
      large_open,
      total_capacity_kw,
      registered_capacity_kw,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_sseg_registrations WHERE id = ?').bind(id).first<RegistrationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_sseg_registrations_events WHERE registration_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RegistrationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreeningBody { screening_ref?: string; screening_basis?: string; notes?: string; }
interface InfoRequestBody { info_request_ref?: string; info_request_basis?: string; notes?: string; }
interface SubmitInfoBody { notes?: string; }
interface VerificationBody { verification_ref?: string; verification_basis?: string; notes?: string; }
interface DetermineBody { determination_ref?: string; determination_basis?: string; notes?: string; }
interface ApproveBody { approval_basis?: string; notes?: string; }
interface ConditionsBody { conditions_ref?: string; conditions_basis?: string; notes?: string; }
interface SatisfyBody { notes?: string; }
interface CertificateBody { certificate_ref?: string; regulator_ref?: string; rod_notes?: string; notes?: string; }
interface ReferBody { licensing_referral_ref?: string; referral_basis?: string; reason_code?: string; regulator_ref?: string; rod_notes?: string; notes?: string; }
interface RefuseBody { refusal_basis?: string; reason_code?: string; rod_notes?: string; notes?: string; }
interface WithdrawBody { reason_code?: string; rod_notes?: string; notes?: string; }
interface LapseBody { reason_code?: string; rod_notes?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: SsegRegistrationAction,
  bodyHandler?: (row: RegistrationRow, body: Record<string, unknown>) => Partial<RegistrationRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isApplicantAction(action) ? APPLICANT_WRITE_ROLES : REGULATOR_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_sseg_registrations WHERE id = ?').bind(id).first<RegistrationRow>();
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
  const sla = slaDeadlineFor(to, row.capacity_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, row.capacity_tier);
  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A referral (any tier) or large/utility refusal that crosses into the
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
    `UPDATE oe_sseg_registrations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `sseg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'sseg_registration',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_sseg_registrations WHERE id = ?').bind(id).first<RegistrationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-screening', async (c) => transition(c, 'begin_screening', (_row, body) => {
  const b = body as Partial<ScreeningBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  return out;
}));

app.post('/:id/request-info', async (c) => transition(c, 'request_info', (row, body) => {
  const b = body as Partial<InfoRequestBody>;
  const out: Partial<RegistrationRow> = { info_request_round: (row.info_request_round || 0) + 1 };
  if (typeof b.info_request_ref === 'string')   out.info_request_ref = b.info_request_ref;
  if (typeof b.info_request_basis === 'string') out.info_request_basis = b.info_request_basis;
  return out;
}));

app.post('/:id/submit-info', async (c) => transition(c, 'submit_info', (_row, body) => {
  const b = body as Partial<SubmitInfoBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.notes === 'string') out.screening_basis = b.notes;
  return out;
}));

app.post('/:id/begin-verification', async (c) => transition(c, 'begin_verification', (_row, body) => {
  const b = body as Partial<VerificationBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.verification_ref === 'string')   out.verification_ref = b.verification_ref;
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/determine-exemption', async (c) => transition(c, 'determine_exemption', (_row, body) => {
  const b = body as Partial<DetermineBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.determination_ref === 'string')   out.determination_ref = b.determination_ref;
  if (typeof b.determination_basis === 'string') out.determination_basis = b.determination_basis;
  return out;
}));

app.post('/:id/approve-registration', async (c) => transition(c, 'approve_registration', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  return out;
}));

app.post('/:id/approve-with-conditions', async (c) => transition(c, 'approve_with_conditions', (_row, body) => {
  const b = body as Partial<ConditionsBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.conditions_ref === 'string')   out.conditions_ref = b.conditions_ref;
  if (typeof b.conditions_basis === 'string') out.conditions_basis = b.conditions_basis;
  return out;
}));

app.post('/:id/satisfy-conditions', async (c) => transition(c, 'satisfy_conditions', (_row, body) => {
  const b = body as Partial<SatisfyBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.notes === 'string') out.conditions_basis = b.notes;
  return out;
}));

app.post('/:id/issue-certificate', async (c) => transition(c, 'issue_certificate', (_row, body) => {
  const b = body as Partial<CertificateBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.certificate_ref === 'string') out.certificate_ref = b.certificate_ref;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  if (typeof b.rod_notes === 'string')       out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/refer-to-licensing', async (c) => transition(c, 'refer_to_licensing', (_row, body) => {
  const b = body as Partial<ReferBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.licensing_referral_ref === 'string') out.licensing_referral_ref = b.licensing_referral_ref;
  if (typeof b.referral_basis === 'string')         out.referral_basis = b.referral_basis;
  if (typeof b.reason_code === 'string')            out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')          out.regulator_ref = b.regulator_ref;
  if (typeof b.rod_notes === 'string')              out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/refuse-registration', async (c) => transition(c, 'refuse_registration', (_row, body) => {
  const b = body as Partial<RefuseBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.refusal_basis === 'string') out.refusal_basis = b.refusal_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')     out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/lapse', async (c) => transition(c, 'lapse', (_row, body) => {
  const b = body as Partial<LapseBody>;
  const out: Partial<RegistrationRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

export async function ssegRegistrationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_sseg_registrations
     WHERE chain_status NOT IN ('registered','referred_to_licensing','refused','withdrawn','lapsed')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RegistrationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_sseg_registrations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `sseg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_sseg_registrations_events (id, registration_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sseg_registration.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.capacity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.capacity_tier)) {
      await fireCascade({
        event: 'sseg_registration.sla_breached',
        actor_id: 'system',
        entity_type: 'sseg_registration',
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
