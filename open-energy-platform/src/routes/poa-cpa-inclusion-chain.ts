// ═══════════════════════════════════════════════════════════════════════════
// Wave 73 — Carbon PoA / Programme-of-Activities Sub-Project (CPA) Inclusion &
// Conformance chain.
//
// Mounted at /api/poa-inclusion/chain.
//
// The ONE-TO-MANY operational layer of the carbon portfolio: a Programme of
// Activities is registered once, then individual Component Project Activities
// (CPAs) are screened in over the programme lifetime, gated on a host-country
// Letter of Approval, and monitored/verified for ongoing conformance with
// DELISTING (exclusion) if they stop conforming. W37 registers a single project,
// W11 verifies a monitoring period, W56 re-validates a crediting period, W65
// sells reductions forward — W73 governs how component activities are screened
// into and kept conformant within a registered programme.
//
// DISTINCTIVE move (beat CDM PoA / GS4GG / Verra grouped projects — slow, manual,
// months-long CPA inclusion): automated eligibility scoring, a real-time
// double-counting / geographic-overlap guard, programme-cap headroom checks, and
// an SLA-driven inclusion turnaround the desk can quote up front.
//
// Write model — SINGLE carbon-fund desk {admin, carbon_fund} (same single-party
// model as every carbon chain W37/W11/W17/W42/W48/W56/W65). READ all nine
// personas. actor_party (proponent / coordinating_entity / dna / vvb) records the
// functional owner per step, not the JWT role.
//
// Reportability (the W73 SIGNATURE is DELISTING-driven):
//   exclude_cpa crosses for EVERY tier; approve_inclusion crosses for EVERY tier
//   when a corresponding adjustment is required (Article 6), else for large+mega;
//   reject_cpa and sla_breached cross for large+mega.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForAnnualEr,
  requiresCorrespondingAdjustment,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eligibilityScore,
  predictedInclusionDays,
  programmeHeadroomTco2e,
  SLA_MINUTES,
  type CpaStatus,
  type CpaAction,
  type CpaTier,
  type CpaTransferType,
} from '../utils/poa-cpa-inclusion-spec';

const READ_ROLES = new Set([
  'admin', 'carbon_fund',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

// SINGLE-PARTY write — the carbon desk (acting as the PoA Coordinating Entity)
// owns the whole record. actor_party is functional attribution only.
const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

interface CpaRow {
  id: string;
  cpa_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  programme_id: string;
  programme_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  cpa_ref: string | null;
  cpa_name: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  coordinating_entity_name: string | null;
  dna_name: string | null;
  vvb_name: string | null;
  host_country: string | null;
  geo_key: string | null;
  transfer_type: CpaTransferType;
  cpa_tier: CpaTier;
  annual_er_tco2e: number;
  requires_corresponding_adjustment: number;
  corresponding_adjustment_ref: string | null;
  programme_cap_er_tco2e: number | null;
  included_er_tco2e: number | null;
  programme_headroom_tco2e: number | null;
  vintage_year: number | null;
  crediting_period_start: string | null;
  crediting_period_end: string | null;
  methodology_applicability: number | null;
  additionality_strength: number | null;
  monitoring_readiness: number | null;
  loa_confidence: number | null;
  eligibility_score: number | null;
  predicted_inclusion_days: number | null;
  screened_flag: number;
  methodology_ok_flag: number;
  loa_received_flag: number;
  inclusion_submitted_flag: number;
  included_flag: number;
  verified_flag: number;
  screening_ref: string | null;
  methodology_ref: string | null;
  loa_ref: string | null;
  inclusion_ref: string | null;
  monitoring_ref: string | null;
  verification_ref: string | null;
  exclusion_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  completion_ref: string | null;
  regulator_ref: string | null;
  proposal_basis: string | null;
  screening_basis: string | null;
  methodology_basis: string | null;
  loa_basis: string | null;
  inclusion_basis: string | null;
  monitoring_basis: string | null;
  verification_basis: string | null;
  exclusion_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  completion_basis: string | null;
  reason_code: string | null;
  cpa_summary: string | null;
  monitoring_round: number;
  chain_status: CpaStatus;
  cpa_proposed_at: string;
  eligibility_screening_at: string | null;
  methodology_check_at: string | null;
  loa_pending_at: string | null;
  inclusion_review_at: string | null;
  included_at: string | null;
  monitoring_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  excluded_at: string | null;
  withdrawn_at: string | null;
  completed_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CpaEventRow {
  id: string;
  inclusion_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CpaStatus, keyof CpaRow | null> = {
  cpa_proposed:          null,
  eligibility_screening: 'eligibility_screening_at',
  methodology_check:     'methodology_check_at',
  loa_pending:           'loa_pending_at',
  inclusion_review:      'inclusion_review_at',
  included:              'included_at',
  monitoring:            'monitoring_at',
  verified:              'verified_at',
  rejected:              'rejected_at',
  excluded:              'excluded_at',
  withdrawn:             'withdrawn_at',
  completed:             'completed_at',
};

// begin_monitoring and continue_monitoring both land in 'monitoring', so they
// share the 'carbon_poa.monitoring' event name.
function eventTypeFor(action: CpaAction): string {
  switch (action) {
    case 'screen_eligibility':   return 'carbon_poa.eligibility_screening';
    case 'check_methodology':    return 'carbon_poa.methodology_check';
    case 'request_loa':          return 'carbon_poa.loa_pending';
    case 'submit_inclusion':     return 'carbon_poa.inclusion_review';
    case 'approve_inclusion':    return 'carbon_poa.included';
    case 'begin_monitoring':     return 'carbon_poa.monitoring';
    case 'continue_monitoring':  return 'carbon_poa.monitoring';
    case 'verify_period':        return 'carbon_poa.verified';
    case 'reject_cpa':           return 'carbon_poa.rejected';
    case 'exclude_cpa':          return 'carbon_poa.excluded';
    case 'withdraw_cpa':         return 'carbon_poa.withdrawn';
    case 'complete_cpa':         return 'carbon_poa.completed';
  }
}

function decorate(row: CpaRow, now: Date) {
  const tier = row.cpa_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const requiresCA = !!row.requires_corresponding_adjustment;
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    requires_corresponding_adjustment_flag: requiresCA,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    programme_headroom_live: programmeHeadroomTco2e(
      row.programme_cap_er_tco2e ?? 0,
      row.included_er_tco2e ?? 0,
      row.annual_er_tco2e ?? 0,
    ),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cpa_tier      = c.req.query('cpa_tier');
  const status        = c.req.query('status');
  const transfer_type = c.req.query('transfer_type');
  const programme_id  = c.req.query('programme_id');
  const breached      = c.req.query('breached');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_poa_cpa_inclusions WHERE 1=1';
  const binds: unknown[] = [];
  if (cpa_tier)      { sql += ' AND cpa_tier = ?'; binds.push(cpa_tier); }
  if (status)        { sql += ' AND chain_status = ?'; binds.push(status); }
  if (transfer_type) { sql += ' AND transfer_type = ?'; binds.push(transfer_type); }
  if (programme_id)  { sql += ' AND programme_id = ?'; binds.push(programme_id); }

  sql += ' ORDER BY datetime(cpa_proposed_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CpaRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_transfer_type: Record<string, number> = {};
  const by_programme: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.cpa_tier] = (by_tier[i.cpa_tier] || 0) + 1;
    by_transfer_type[i.transfer_type] = (by_transfer_type[i.transfer_type] || 0) + 1;
    by_programme[i.programme_id] = (by_programme[i.programme_id] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const included_count     = items.filter((i) => i.chain_status === 'included').length;
  const monitoring_count   = items.filter((i) => i.chain_status === 'monitoring').length;
  const verified_count     = items.filter((i) => i.chain_status === 'verified').length;
  const excluded_count     = items.filter((i) => i.chain_status === 'excluded').length;
  const rejected_count     = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count    = items.filter((i) => i.chain_status === 'withdrawn').length;
  const completed_count    = items.filter((i) => i.chain_status === 'completed').length;
  const breached_count     = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const article6_count     = items.filter((i) => i.transfer_type === 'article6').length;
  const total_annual_er    = items.reduce((sum, i) => sum + (i.annual_er_tco2e || 0), 0);
  const included_annual_er = items
    .filter((i) => ['included', 'monitoring', 'verified', 'completed'].includes(i.chain_status))
    .reduce((sum, i) => sum + (i.annual_er_tco2e || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_transfer_type,
      by_programme,
      open_count,
      included_count,
      monitoring_count,
      verified_count,
      excluded_count,
      rejected_count,
      withdrawn_count,
      completed_count,
      breached: breached_count,
      reportable_total,
      article6_count,
      total_annual_er,
      included_annual_er,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_poa_cpa_inclusions WHERE id = ?').bind(id).first<CpaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_poa_cpa_inclusions_events WHERE inclusion_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CpaEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreenBody {
  screening_basis?: string;
  screening_ref?: string;
  methodology_applicability?: number;
  additionality_strength?: number;
  monitoring_readiness?: number;
  loa_confidence?: number;
  geo_key?: string;
  notes?: string;
}
interface MethodologyBody {
  methodology_basis?: string;
  methodology_ref?: string;
  methodology_id?: string;
  notes?: string;
}
interface LoaBody {
  loa_basis?: string;
  loa_ref?: string;
  corresponding_adjustment_ref?: string;
  notes?: string;
}
interface InclusionBody {
  inclusion_basis?: string;
  inclusion_ref?: string;
  notes?: string;
}
interface ApproveBody {
  inclusion_basis?: string;
  inclusion_ref?: string;
  included_er_tco2e?: number;
  regulator_ref?: string;
  notes?: string;
}
interface MonitoringBody {
  monitoring_basis?: string;
  monitoring_ref?: string;
  notes?: string;
}
interface VerifyBody {
  verification_basis?: string;
  verification_ref?: string;
  notes?: string;
}
interface RejectBody {
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface ExcludeBody {
  exclusion_basis?: string;
  exclusion_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface WithdrawBody {
  withdrawal_basis?: string;
  withdrawal_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface CompleteBody {
  completion_basis?: string;
  completion_ref?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: CpaAction,
  bodyHandler?: (row: CpaRow, body: Record<string, unknown>) => Partial<CpaRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_poa_cpa_inclusions WHERE id = ?').bind(id).first<CpaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The tier is a function of estimated annual ER + the Article-6 floor; re-derive
  // it live so the SLA window and regulator crossings track the CURRENT tier.
  const transferType = (overrides.transfer_type as CpaTransferType | undefined) ?? row.transfer_type;
  const annualEr = (overrides.annual_er_tco2e as number | undefined) ?? row.annual_er_tco2e;
  const tier = tierForAnnualEr(annualEr, transferType);
  overrides.cpa_tier = tier;
  const requiresCA = requiresCorrespondingAdjustment(transferType);
  overrides.requires_corresponding_adjustment = requiresCA ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier, requiresCA);
  // is_reportable is a stable property of the line (requiresCA OR large/mega);
  // recompute it each transition and force it on when an action crosses.
  overrides.is_reportable = (isReportable(tier, requiresCA) || crosses) ? 1 : 0;

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
    `UPDATE oe_poa_cpa_inclusions SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `poa_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_poa_cpa_inclusions_events (id, inclusion_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'poa_cpa_inclusion',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      cpa_tier: tier,
      transfer_type: transferType,
      requires_corresponding_adjustment: requiresCA ? 1 : 0,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_poa_cpa_inclusions WHERE id = ?').bind(id).first<CpaRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/screen-eligibility', async (c) => transition(c, 'screen_eligibility', (row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<CpaRow> = { screened_flag: 1 };
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  if (typeof b.geo_key === 'string')         out.geo_key = b.geo_key;
  // Recompute the composite eligibility score + predicted turnaround from the
  // updated inputs (beats the manual, paper-driven assessment).
  const ma = typeof b.methodology_applicability === 'number' ? b.methodology_applicability : (row.methodology_applicability ?? 0);
  const ad = typeof b.additionality_strength === 'number' ? b.additionality_strength : (row.additionality_strength ?? 0);
  const mr = typeof b.monitoring_readiness === 'number' ? b.monitoring_readiness : (row.monitoring_readiness ?? 0);
  const lc = typeof b.loa_confidence === 'number' ? b.loa_confidence : (row.loa_confidence ?? 0);
  out.methodology_applicability = ma;
  out.additionality_strength = ad;
  out.monitoring_readiness = mr;
  out.loa_confidence = lc;
  out.eligibility_score = eligibilityScore({
    methodologyApplicability: ma,
    additionalityStrength: ad,
    monitoringReadiness: mr,
    loaConfidence: lc,
  });
  out.predicted_inclusion_days = predictedInclusionDays(
    tierForAnnualEr(row.annual_er_tco2e, row.transfer_type),
  );
  return out;
}));

app.post('/:id/check-methodology', async (c) => transition(c, 'check_methodology', (_row, body) => {
  const b = body as Partial<MethodologyBody>;
  const out: Partial<CpaRow> = { methodology_ok_flag: 1 };
  if (typeof b.methodology_basis === 'string') out.methodology_basis = b.methodology_basis;
  if (typeof b.methodology_ref === 'string')   out.methodology_ref = b.methodology_ref;
  if (typeof b.methodology_id === 'string')    out.methodology_id = b.methodology_id;
  return out;
}));

app.post('/:id/request-loa', async (c) => transition(c, 'request_loa', (_row, body) => {
  const b = body as Partial<LoaBody>;
  const out: Partial<CpaRow> = {};
  if (typeof b.loa_basis === 'string')                    out.loa_basis = b.loa_basis;
  if (typeof b.loa_ref === 'string')                      out.loa_ref = b.loa_ref;
  if (typeof b.corresponding_adjustment_ref === 'string') out.corresponding_adjustment_ref = b.corresponding_adjustment_ref;
  return out;
}));

app.post('/:id/submit-inclusion', async (c) => transition(c, 'submit_inclusion', (_row, body) => {
  const b = body as Partial<InclusionBody>;
  const out: Partial<CpaRow> = { loa_received_flag: 1, inclusion_submitted_flag: 1 };
  if (typeof b.inclusion_basis === 'string') out.inclusion_basis = b.inclusion_basis;
  if (typeof b.inclusion_ref === 'string')   out.inclusion_ref = b.inclusion_ref;
  return out;
}));

app.post('/:id/approve-inclusion', async (c) => transition(c, 'approve_inclusion', (row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<CpaRow> = { included_flag: 1 };
  if (typeof b.inclusion_basis === 'string') out.inclusion_basis = b.inclusion_basis;
  if (typeof b.inclusion_ref === 'string')   out.inclusion_ref = b.inclusion_ref;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  // Once included, the CPA ER joins the programme total; refresh the headroom.
  const includedEr = typeof b.included_er_tco2e === 'number'
    ? b.included_er_tco2e
    : (row.included_er_tco2e ?? 0) + (row.annual_er_tco2e ?? 0);
  out.included_er_tco2e = includedEr;
  out.programme_headroom_tco2e = (row.programme_cap_er_tco2e ?? 0) - includedEr;
  return out;
}));

app.post('/:id/begin-monitoring', async (c) => transition(c, 'begin_monitoring', (row, body) => {
  const b = body as Partial<MonitoringBody>;
  const out: Partial<CpaRow> = { monitoring_round: (row.monitoring_round || 0) + 1 };
  if (typeof b.monitoring_basis === 'string') out.monitoring_basis = b.monitoring_basis;
  if (typeof b.monitoring_ref === 'string')   out.monitoring_ref = b.monitoring_ref;
  return out;
}));

app.post('/:id/verify-period', async (c) => transition(c, 'verify_period', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<CpaRow> = { verified_flag: 1 };
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  if (typeof b.verification_ref === 'string')   out.verification_ref = b.verification_ref;
  return out;
}));

app.post('/:id/continue-monitoring', async (c) => transition(c, 'continue_monitoring', (row, body) => {
  const b = body as Partial<MonitoringBody>;
  const out: Partial<CpaRow> = { monitoring_round: (row.monitoring_round || 0) + 1 };
  if (typeof b.monitoring_basis === 'string') out.monitoring_basis = b.monitoring_basis;
  if (typeof b.monitoring_ref === 'string')   out.monitoring_ref = b.monitoring_ref;
  return out;
}));

app.post('/:id/reject-cpa', async (c) => transition(c, 'reject_cpa', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<CpaRow> = {};
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/exclude-cpa', async (c) => transition(c, 'exclude_cpa', (row, body) => {
  const b = body as Partial<ExcludeBody>;
  const out: Partial<CpaRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.exclusion_basis === 'string') out.exclusion_basis = b.exclusion_basis;
  if (typeof b.exclusion_ref === 'string')   out.exclusion_ref = b.exclusion_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw-cpa', async (c) => transition(c, 'withdraw_cpa', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CpaRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/complete-cpa', async (c) => transition(c, 'complete_cpa', (_row, body) => {
  const b = body as Partial<CompleteBody>;
  const out: Partial<CpaRow> = {};
  if (typeof b.completion_basis === 'string') out.completion_basis = b.completion_basis;
  if (typeof b.completion_ref === 'string')   out.completion_ref = b.completion_ref;
  return out;
}));

export async function poaCpaInclusionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_poa_cpa_inclusions
     WHERE chain_status NOT IN ('rejected','excluded','withdrawn','completed')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CpaRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_poa_cpa_inclusions
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `poa_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_poa_cpa_inclusions_events (id, inclusion_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_poa.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.cpa_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.cpa_tier)) {
      await fireCascade({
        event: 'carbon_poa.sla_breached',
        actor_id: 'system',
        entity_type: 'poa_cpa_inclusion',
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
