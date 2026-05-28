// ═══════════════════════════════════════════════════════════════════════════
// Wave 37 — Carbon Project Registration / PDD Validation chain
//
// Mounted at /api/carbon-registration/chain.
//
// The FRONT END of the carbon credit lifecycle. A mitigation project moves from
// idea (PIN) → full Project Design Document (PDD) → independent validation by a
// VVB → public stakeholder consultation → host-country DNA authorization →
// registry registration → active crediting period, then hands off to W11 (MRV
// verification), W17 (retirement) and W4 (Article 6 ITMO corresponding adjust).
//
// Forward path:
//   pin_submitted → pdd_drafted → validation_underway → public_consultation →
//   dna_authorization → registration_requested → registered → crediting_active
//
// Branch states:
//   corrections_required — VVB raised Corrective Action Requests (CARs); the
//                          developer resubmits to re-enter validation
//   rejected             — validation failed or registry refused (terminal)
//   withdrawn            — developer withdrew the project (terminal)
//
// Tiers (project type / scale): afolu_redd / large_scale / small_scale.
//
// Standards: Gold Standard for the Global Goals + Verra VCS + CDM (legacy) +
// Paris Agreement Article 6.4 mechanism + SA DFFE DNA Letter of Approval.
//
// SLA matrix is INVERTED — higher-integrity-risk tier gets MORE time in every
// state (more diligence). Reportability (regulator inbox):
//   - rejected crosses for EVERY tier (stopping a non-additional / fraudulent
//     project is always a market-integrity event)
//   - registered crosses for high-integrity tiers (afolu_redd + large_scale)
//   - sla_breached crosses for high-integrity tiers
//
// Write is open to admin / support / carbon_fund. One carbon-fund desk records
// the workflow; each transition is tagged with the contractual party
// (developer / vvb / registry / authority) via actor_party derived from the action.
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
  enhancedDueDiligenceApplies,
  partyForAction,
  SLA_MINUTES,
  type RegStatus,
  type RegAction,
  type RegTier,
} from '../utils/carbon-registration-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'carbon_fund',
  'regulator',
]);

// No dedicated developer / VVB / registry / authority login — the carbon-fund
// desk (or admin / support) records every party's action; the contractual party
// is captured separately via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'carbon_fund']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CarbonRegRow {
  id: string;
  project_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  developer_party_id: string;
  developer_party_name: string;
  vvb_name: string | null;
  project_name: string;
  project_tier: RegTier;
  standard: string | null;
  methodology: string | null;
  province: string | null;
  host_country: string;
  crediting_years: number | null;
  estimated_annual_tco2e: number | null;
  estimated_total_tco2e: number | null;
  registered_serial_block: string | null;
  pin_ref: string | null;
  pdd_ref: string | null;
  validation_ref: string | null;
  car_ref: string | null;
  consultation_ref: string | null;
  dna_authorization_ref: string | null;
  registration_ref: string | null;
  rejection_ref: string | null;
  validation_basis: string | null;
  corrections_basis: string | null;
  consultation_basis: string | null;
  dna_basis: string | null;
  registration_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: RegStatus;
  pin_submitted_at: string;
  pdd_drafted_at: string | null;
  validation_underway_at: string | null;
  corrections_required_at: string | null;
  public_consultation_at: string | null;
  dna_authorization_at: string | null;
  registration_requested_at: string | null;
  registered_at: string | null;
  crediting_active_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  car_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CarbonRegEventRow {
  id: string;
  project_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<RegStatus, keyof CarbonRegRow | null> = {
  pin_submitted:          null,
  pdd_drafted:            'pdd_drafted_at',
  validation_underway:    'validation_underway_at',
  corrections_required:   'corrections_required_at',
  public_consultation:    'public_consultation_at',
  dna_authorization:      'dna_authorization_at',
  registration_requested: 'registration_requested_at',
  registered:             'registered_at',
  crediting_active:       'crediting_active_at',
  rejected:               'rejected_at',
  withdrawn:              'withdrawn_at',
};

function decorate(row: CarbonRegRow, now: Date) {
  const tier = row.project_tier;
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
    enhanced_due_diligence: enhancedDueDiligenceApplies(tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: RegAction): string {
  switch (action) {
    case 'draft_pdd':            return 'carbon_registration.pdd_drafted';
    case 'submit_validation':    return 'carbon_registration.validation_underway';
    case 'request_corrections':  return 'carbon_registration.corrections_required';
    case 'resubmit':             return 'carbon_registration.validation_underway';
    case 'open_consultation':    return 'carbon_registration.public_consultation';
    case 'authorize_dna':        return 'carbon_registration.dna_authorization';
    case 'request_registration': return 'carbon_registration.registration_requested';
    case 'register':             return 'carbon_registration.registered';
    case 'activate_crediting':   return 'carbon_registration.crediting_active';
    case 'reject':               return 'carbon_registration.rejected';
    case 'withdraw':             return 'carbon_registration.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const project_tier       = c.req.query('project_tier');
  const status             = c.req.query('status');
  const breached           = c.req.query('breached');
  const developer_party_id = c.req.query('developer_party_id');
  const standard           = c.req.query('standard');

  let sql = 'SELECT * FROM oe_carbon_registration WHERE 1=1';
  const binds: unknown[] = [];
  if (project_tier)       { sql += ' AND project_tier = ?';       binds.push(project_tier); }
  if (status)             { sql += ' AND chain_status = ?';       binds.push(status); }
  if (developer_party_id) { sql += ' AND developer_party_id = ?'; binds.push(developer_party_id); }
  if (standard)           { sql += ' AND standard = ?';           binds.push(standard); }

  sql += ' ORDER BY datetime(pin_submitted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CarbonRegRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.project_tier]   = (by_tier[i.project_tier] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const registered_count    = items.filter((i) => i.chain_status === 'registered').length;
  const crediting_count     = items.filter((i) => i.chain_status === 'crediting_active').length;
  const rejected_count      = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable).length;
  const high_integrity_open = items.filter((i) => !i.is_terminal && i.enhanced_due_diligence).length;
  const total_estimated_tco2e = items.reduce((sum, i) => sum + (i.estimated_total_tco2e || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      registered_count,
      crediting_count,
      rejected_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      high_integrity_open,
      total_estimated_tco2e,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_registration WHERE id = ?').bind(id).first<CarbonRegRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_carbon_registration_events WHERE project_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CarbonRegEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface DraftPddBody {
  pdd_ref?: string;
  methodology?: string;
  crediting_years?: number;
  estimated_annual_tco2e?: number;
  estimated_total_tco2e?: number;
  notes?: string;
}

interface SubmitValidationBody {
  validation_ref?: string;
  vvb_name?: string;
  validation_basis?: string;
  notes?: string;
}

interface CorrectionsBody {
  car_ref?: string;
  corrections_basis?: string;
  notes?: string;
}

interface ResubmitBody {
  validation_basis?: string;
  notes?: string;
}

interface ConsultationBody {
  consultation_ref?: string;
  consultation_basis?: string;
  notes?: string;
}

interface DnaBody {
  dna_authorization_ref?: string;
  dna_basis?: string;
  notes?: string;
}

interface RegistrationRequestBody {
  registration_ref?: string;
  registration_basis?: string;
  notes?: string;
}

interface RegisterBody {
  registered_serial_block?: string;
  registration_basis?: string;
  notes?: string;
}

interface ActivateBody {
  registered_serial_block?: string;
  estimated_total_tco2e?: number;
  notes?: string;
}

interface RejectBody {
  rejection_ref?: string;
  rejection_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_basis?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: RegAction,
  bodyHandler?: (row: CarbonRegRow, body: Record<string, unknown>) => Partial<CarbonRegRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_registration WHERE id = ?').bind(id).first<CarbonRegRow>();
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
  const sla = slaDeadlineFor(to, row.project_tier, now);
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
    `UPDATE oe_carbon_registration SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `creg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'carbon_registration',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.project_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_registration WHERE id = ?').bind(id).first<CarbonRegRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/draft-pdd', async (c) => transition(c, 'draft_pdd', (_row, body) => {
  const b = body as Partial<DraftPddBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.pdd_ref === 'string')                out.pdd_ref = b.pdd_ref;
  if (typeof b.methodology === 'string')            out.methodology = b.methodology;
  if (typeof b.crediting_years === 'number')        out.crediting_years = b.crediting_years;
  if (typeof b.estimated_annual_tco2e === 'number') out.estimated_annual_tco2e = b.estimated_annual_tco2e;
  if (typeof b.estimated_total_tco2e === 'number')  out.estimated_total_tco2e = b.estimated_total_tco2e;
  return out;
}));

app.post('/:id/submit-validation', async (c) => transition(c, 'submit_validation', (_row, body) => {
  const b = body as Partial<SubmitValidationBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.validation_ref === 'string')   out.validation_ref = b.validation_ref;
  if (typeof b.vvb_name === 'string')         out.vvb_name = b.vvb_name;
  if (typeof b.validation_basis === 'string') out.validation_basis = b.validation_basis;
  return out;
}));

app.post('/:id/request-corrections', async (c) => transition(c, 'request_corrections', (row, body) => {
  const b = body as Partial<CorrectionsBody>;
  const out: Partial<CarbonRegRow> = { car_round: (row.car_round || 0) + 1 };
  if (typeof b.car_ref === 'string')           out.car_ref = b.car_ref;
  if (typeof b.corrections_basis === 'string') out.corrections_basis = b.corrections_basis;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit', (_row, body) => {
  const b = body as Partial<ResubmitBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.validation_basis === 'string') out.validation_basis = b.validation_basis;
  return out;
}));

app.post('/:id/open-consultation', async (c) => transition(c, 'open_consultation', (_row, body) => {
  const b = body as Partial<ConsultationBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.consultation_ref === 'string')   out.consultation_ref = b.consultation_ref;
  if (typeof b.consultation_basis === 'string') out.consultation_basis = b.consultation_basis;
  return out;
}));

app.post('/:id/authorize-dna', async (c) => transition(c, 'authorize_dna', (_row, body) => {
  const b = body as Partial<DnaBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.dna_authorization_ref === 'string') out.dna_authorization_ref = b.dna_authorization_ref;
  if (typeof b.dna_basis === 'string')             out.dna_basis = b.dna_basis;
  return out;
}));

app.post('/:id/request-registration', async (c) => transition(c, 'request_registration', (_row, body) => {
  const b = body as Partial<RegistrationRequestBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.registration_ref === 'string')   out.registration_ref = b.registration_ref;
  if (typeof b.registration_basis === 'string') out.registration_basis = b.registration_basis;
  return out;
}));

app.post('/:id/register', async (c) => transition(c, 'register', (_row, body) => {
  const b = body as Partial<RegisterBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.registered_serial_block === 'string') out.registered_serial_block = b.registered_serial_block;
  if (typeof b.registration_basis === 'string')      out.registration_basis = b.registration_basis;
  return out;
}));

app.post('/:id/activate-crediting', async (c) => transition(c, 'activate_crediting', (_row, body) => {
  const b = body as Partial<ActivateBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.registered_serial_block === 'string') out.registered_serial_block = b.registered_serial_block;
  if (typeof b.estimated_total_tco2e === 'number')   out.estimated_total_tco2e = b.estimated_total_tco2e;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')       out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CarbonRegRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function carbonRegistrationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_registration
     WHERE chain_status NOT IN ('crediting_active','rejected','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CarbonRegRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_carbon_registration
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `creg_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_registration.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.project_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.project_tier)) {
      await fireCascade({
        event: 'carbon_registration.sla_breached',
        actor_id: 'system',
        entity_type: 'carbon_registration',
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
