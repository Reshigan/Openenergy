// ═══════════════════════════════════════════════════════════════════════════
// Wave 56 — Carbon Crediting-Period Renewal & Baseline Reassessment chain (P6)
//
// Mounted at /api/crediting-renewal/chain.
//
// The PERIODIC re-validation of a registered carbon project. W37 registers a
// project, W11 verifies each monitoring period (MRV), W17 retires the credits,
// W42 protects permanence and W48 monetises the offset. THIS chain governs what
// happens when the crediting period EXPIRES: the project must be RENEWED to keep
// issuing. Renewal re-derives the baseline against current data, re-tests
// additionality, has an independent VVB validate the renewed baseline, then the
// standard's review body decides. The renewed baseline is typically LOWER, which
// reduces future issuance and feeds every later MRV / retirement / tax-offset.
//
//   renewal_due → application_submitted → completeness_check
//     → baseline_reassessment → additionality_retest → vvb_validation
//     → standard_review → renewed
//   revision loop: completeness_check → revision_requested → (resubmit) → completeness_check
//   refused:   standard_review → refused
//   withdrawn: any pre-decision state → withdrawn
//   lapsed:    renewal_due → lapsed  (window expired — TIME-DRIVEN, auto in sweep)
//
// Tiers (5) by ANNUAL ISSUANCE volume (tCO2e/yr): minor <10k / moderate <100k /
// material <500k / major <2m / mega ≥2m. INVERTED SLA — the larger the project,
// the LONGER every window (deeper baseline scrutiny warranted).
//
// Single carbon-fund desk write {admin, carbon_fund}. actor_party tags the
// functional party (proponent / registry / vvb) for audit attribution only.
//
// Reportability — the W56 SIGNATURE is "an APPROVAL can be reportable":
//   renew  crosses for EVERY tier when the reassessed baseline is cut by ≥30%.
//   refuse crosses for the large tiers (major + mega).
//   sla_breached crosses for the large tiers (major + mega).
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
  partyForAction,
  baselineReductionPct,
  tierForAnnualIssuance,
  SLA_MINUTES,
  type RenewalStatus,
  type RenewalAction,
  type RenewalTier,
} from '../utils/crediting-renewal-spec';

const READ_ROLES = new Set([
  'admin',
  'regulator',
  'carbon_fund', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

// Single carbon-fund desk write — the desk records the whole renewal lifecycle.
// actor_party tags the contractual function (proponent / registry / vvb) per action.
const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RenewalRow {
  id: string;
  renewal_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string;
  registry_standard: 'verra_vcs' | 'gold_standard' | 'article_6_4' | 'cdm';
  methodology_id: string | null;
  vvb_name: string | null;
  proponent_party_id: string;
  proponent_party_name: string;
  issuance_tier: RenewalTier;
  annual_issuance_tco2e: number | null;
  crediting_period_number: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  renewed_period_start: string | null;
  renewed_period_end: string | null;
  original_baseline_tco2e: number | null;
  revised_baseline_tco2e: number | null;
  baseline_reduction_pct: number | null;
  additionality_outcome: string | null;
  application_ref: string | null;
  completeness_ref: string | null;
  vvb_report_ref: string | null;
  decision_ref: string | null;
  refusal_ref: string | null;
  submission_basis: string | null;
  completeness_basis: string | null;
  revision_basis: string | null;
  baseline_basis: string | null;
  additionality_basis: string | null;
  validation_basis: string | null;
  decision_basis: string | null;
  refusal_basis: string | null;
  reason_code: string | null;
  renewal_summary: string | null;
  chain_status: RenewalStatus;
  renewal_due_at: string;
  application_submitted_at: string | null;
  completeness_check_at: string | null;
  revision_requested_at: string | null;
  baseline_reassessment_at: string | null;
  additionality_retest_at: string | null;
  vvb_validation_at: string | null;
  standard_review_at: string | null;
  renewed_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  lapsed_at: string | null;
  revision_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
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

const TIMESTAMP_COLUMN: Record<RenewalStatus, keyof RenewalRow | null> = {
  renewal_due:           null,
  application_submitted: 'application_submitted_at',
  completeness_check:    'completeness_check_at',
  revision_requested:    'revision_requested_at',
  baseline_reassessment: 'baseline_reassessment_at',
  additionality_retest:  'additionality_retest_at',
  vvb_validation:        'vvb_validation_at',
  standard_review:       'standard_review_at',
  renewed:               'renewed_at',
  refused:               'refused_at',
  withdrawn:             'withdrawn_at',
  lapsed:                'lapsed_at',
};

function effectiveReductionPct(row: RenewalRow, overrides: Partial<RenewalRow>): number {
  const original = (overrides.original_baseline_tco2e ?? row.original_baseline_tco2e) || 0;
  const revised = overrides.revised_baseline_tco2e ?? row.revised_baseline_tco2e;
  if (revised == null) return row.baseline_reduction_pct || 0;
  return baselineReductionPct(original, revised);
}

function decorate(row: RenewalRow, now: Date) {
  const tier = row.issuance_tier;
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

// resubmit lands back in completeness_check → shares that event with check_completeness.
function eventTypeFor(action: RenewalAction): string {
  switch (action) {
    case 'submit_application':          return 'crediting_renewal.application_submitted';
    case 'check_completeness':          return 'crediting_renewal.completeness_check';
    case 'request_revision':            return 'crediting_renewal.revision_requested';
    case 'resubmit':                    return 'crediting_renewal.completeness_check';
    case 'begin_baseline_reassessment': return 'crediting_renewal.baseline_reassessment';
    case 'complete_baseline':           return 'crediting_renewal.additionality_retest';
    case 'complete_additionality':      return 'crediting_renewal.vvb_validation';
    case 'validate':                    return 'crediting_renewal.standard_review';
    case 'renew':                       return 'crediting_renewal.renewed';
    case 'refuse':                      return 'crediting_renewal.refused';
    case 'withdraw':                    return 'crediting_renewal.withdrawn';
    case 'lapse':                       return 'crediting_renewal.lapsed';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const issuance_tier     = c.req.query('issuance_tier');
  const registry_standard = c.req.query('registry_standard');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_crediting_period_renewals WHERE 1=1';
  const binds: unknown[] = [];
  if (issuance_tier)     { sql += ' AND issuance_tier = ?';     binds.push(issuance_tier); }
  if (registry_standard) { sql += ' AND registry_standard = ?'; binds.push(registry_standard); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }

  sql += ' ORDER BY datetime(renewal_due_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RenewalRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_standard: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.issuance_tier] = (by_tier[i.issuance_tier] || 0) + 1;
    by_standard[i.registry_standard] = (by_standard[i.registry_standard] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const renewed_count    = items.filter((i) => i.chain_status === 'renewed').length;
  const refused_count    = items.filter((i) => i.chain_status === 'refused').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const lapsed_count     = items.filter((i) => i.chain_status === 'lapsed').length;
  const in_review_count  = items.filter((i) =>
    i.chain_status === 'standard_review' || i.chain_status === 'vvb_validation').length;
  const reassessment_count = items.filter((i) =>
    i.chain_status === 'baseline_reassessment' || i.chain_status === 'additionality_retest').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable).length;
  const large_open       = items.filter((i) =>
    !i.is_terminal && (i.issuance_tier === 'major' || i.issuance_tier === 'mega')).length;
  const material_downgrade_count = items.filter((i) => (i.baseline_reduction_pct || 0) >= 30).length;
  const total_annual_issuance = items.reduce((sum, i) => sum + (i.annual_issuance_tco2e || 0), 0);
  const total_original_baseline = items.reduce((sum, i) => sum + (i.original_baseline_tco2e || 0), 0);
  const total_revised_baseline  = items.reduce((sum, i) => sum + (i.revised_baseline_tco2e || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_standard,
      open_count,
      renewed_count,
      refused_count,
      withdrawn_count,
      lapsed_count,
      in_review_count,
      reassessment_count,
      breached: breached_count,
      reportable_total,
      large_open,
      material_downgrade_count,
      total_annual_issuance,
      total_original_baseline,
      total_revised_baseline,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_crediting_period_renewals WHERE id = ?').bind(id).first<RenewalRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_crediting_period_renewals_events WHERE renewal_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RenewalEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitBody {
  submission_basis?: string;
  application_ref?: string;
  annual_issuance_tco2e?: number;
  methodology_id?: string;
  vvb_name?: string;
  crediting_period_number?: number;
  notes?: string;
}
interface CompletenessBody {
  completeness_basis?: string;
  completeness_ref?: string;
  notes?: string;
}
interface RevisionBody {
  revision_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface ResubmitBody {
  submission_basis?: string;
  notes?: string;
}
interface BaselineStartBody {
  baseline_basis?: string;
  notes?: string;
}
interface BaselineCompleteBody {
  baseline_basis?: string;
  original_baseline_tco2e?: number;
  revised_baseline_tco2e?: number;
  notes?: string;
}
interface AdditionalityBody {
  additionality_basis?: string;
  additionality_outcome?: string;
  notes?: string;
}
interface ValidateBody {
  validation_basis?: string;
  vvb_report_ref?: string;
  vvb_name?: string;
  notes?: string;
}
interface RenewBody {
  decision_basis?: string;
  decision_ref?: string;
  renewed_period_start?: string;
  renewed_period_end?: string;
  revised_baseline_tco2e?: number;
  renewal_summary?: string;
  notes?: string;
}
interface RefuseBody {
  refusal_basis?: string;
  refusal_ref?: string;
  decision_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  notes?: string;
}
interface LapseBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: RenewalAction,
  bodyHandler?: (row: RenewalRow, body: Record<string, unknown>) => Partial<RenewalRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_crediting_period_renewals WHERE id = ?').bind(id).first<RenewalRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived at submission from the declared annual issuance.
  const effectiveTier = (overrides.issuance_tier as RenewalTier) || row.issuance_tier;
  const reductionPct = effectiveReductionPct(row, overrides);

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier, reductionPct);
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
    `UPDATE oe_crediting_period_renewals SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cpr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_crediting_period_renewals_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'crediting_period_renewal',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      issuance_tier: effectiveTier,
      baseline_reduction_pct: reductionPct,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_crediting_period_renewals WHERE id = ?').bind(id).first<RenewalRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit-application', async (c) => transition(c, 'submit_application', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.submission_basis === 'string')        out.submission_basis = b.submission_basis;
  if (typeof b.application_ref === 'string')          out.application_ref = b.application_ref;
  if (typeof b.methodology_id === 'string')           out.methodology_id = b.methodology_id;
  if (typeof b.vvb_name === 'string')                 out.vvb_name = b.vvb_name;
  if (typeof b.crediting_period_number === 'number')  out.crediting_period_number = b.crediting_period_number;
  if (typeof b.annual_issuance_tco2e === 'number') {
    out.annual_issuance_tco2e = b.annual_issuance_tco2e;
    out.issuance_tier = tierForAnnualIssuance(b.annual_issuance_tco2e);
  }
  return out;
}));

app.post('/:id/check-completeness', async (c) => transition(c, 'check_completeness', (_row, body) => {
  const b = body as Partial<CompletenessBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.completeness_basis === 'string') out.completeness_basis = b.completeness_basis;
  if (typeof b.completeness_ref === 'string')   out.completeness_ref = b.completeness_ref;
  return out;
}));

app.post('/:id/request-revision', async (c) => transition(c, 'request_revision', (row, body) => {
  const b = body as Partial<RevisionBody>;
  const out: Partial<RenewalRow> = { revision_round: (row.revision_round || 0) + 1 };
  if (typeof b.revision_basis === 'string') out.revision_basis = b.revision_basis;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit', (_row, body) => {
  const b = body as Partial<ResubmitBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.submission_basis === 'string') out.submission_basis = b.submission_basis;
  return out;
}));

app.post('/:id/begin-baseline', async (c) => transition(c, 'begin_baseline_reassessment', (_row, body) => {
  const b = body as Partial<BaselineStartBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.baseline_basis === 'string') out.baseline_basis = b.baseline_basis;
  return out;
}));

app.post('/:id/complete-baseline', async (c) => transition(c, 'complete_baseline', (row, body) => {
  const b = body as Partial<BaselineCompleteBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.baseline_basis === 'string')            out.baseline_basis = b.baseline_basis;
  if (typeof b.original_baseline_tco2e === 'number')   out.original_baseline_tco2e = b.original_baseline_tco2e;
  if (typeof b.revised_baseline_tco2e === 'number')    out.revised_baseline_tco2e = b.revised_baseline_tco2e;
  const original = (out.original_baseline_tco2e ?? row.original_baseline_tco2e) || 0;
  const revised = out.revised_baseline_tco2e ?? row.revised_baseline_tco2e;
  if (revised != null) out.baseline_reduction_pct = baselineReductionPct(original, revised);
  return out;
}));

app.post('/:id/complete-additionality', async (c) => transition(c, 'complete_additionality', (_row, body) => {
  const b = body as Partial<AdditionalityBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.additionality_basis === 'string')   out.additionality_basis = b.additionality_basis;
  if (typeof b.additionality_outcome === 'string') out.additionality_outcome = b.additionality_outcome;
  return out;
}));

app.post('/:id/validate', async (c) => transition(c, 'validate', (_row, body) => {
  const b = body as Partial<ValidateBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.validation_basis === 'string') out.validation_basis = b.validation_basis;
  if (typeof b.vvb_report_ref === 'string')   out.vvb_report_ref = b.vvb_report_ref;
  if (typeof b.vvb_name === 'string')         out.vvb_name = b.vvb_name;
  return out;
}));

app.post('/:id/renew', async (c) => transition(c, 'renew', (row, body) => {
  const b = body as Partial<RenewBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.decision_basis === 'string')         out.decision_basis = b.decision_basis;
  if (typeof b.decision_ref === 'string')           out.decision_ref = b.decision_ref;
  if (typeof b.renewed_period_start === 'string')   out.renewed_period_start = b.renewed_period_start;
  if (typeof b.renewed_period_end === 'string')     out.renewed_period_end = b.renewed_period_end;
  if (typeof b.renewal_summary === 'string')        out.renewal_summary = b.renewal_summary;
  if (typeof b.revised_baseline_tco2e === 'number') {
    out.revised_baseline_tco2e = b.revised_baseline_tco2e;
    out.baseline_reduction_pct = baselineReductionPct(row.original_baseline_tco2e || 0, b.revised_baseline_tco2e);
  }
  return out;
}));

app.post('/:id/refuse', async (c) => transition(c, 'refuse', (_row, body) => {
  const b = body as Partial<RefuseBody>;
  const out: Partial<RenewalRow> = { escalation_level: 1 };
  if (typeof b.refusal_basis === 'string') out.refusal_basis = b.refusal_basis;
  if (typeof b.refusal_ref === 'string')   out.refusal_ref = b.refusal_ref;
  if (typeof b.decision_ref === 'string')  out.decision_ref = b.decision_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

// Manual lapse: a proponent/carbon-fund declares an un-filed renewal lapsed at
// crediting-period expiry, rather than waiting for the time-driven sweep below.
// State machine guards it to renewal_due → lapsed (TRANSITIONS.lapse); transition()
// auto-stamps lapsed_at via the status→timestamp map. Mirrors withdraw — parity with
// the W49 licence and W57 SSEG lapse handlers, which the registry already surfaces.
app.post('/:id/lapse', async (c) => transition(c, 'lapse', (_row, body) => {
  const b = body as Partial<LapseBody>;
  const out: Partial<RenewalRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: (1) auto-LAPSE renewal_due rows whose submission window expired —
// TIME-DRIVEN, the project simply lets the period end without renewing; (2) record
// an SLA breach on any other active state past its deadline, crossing to the
// regulator for the large tiers (major + mega).
export async function creditingRenewalSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; lapsed: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const dueRs = await env.DB.prepare(
    `SELECT * FROM oe_crediting_period_renewals
     WHERE chain_status = 'renewal_due'
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)`,
  ).bind(nowIso).all<RenewalRow>();

  const dueRows = dueRs.results || [];
  let lapsed = 0;
  for (const row of dueRows) {
    await env.DB.prepare(
      `UPDATE oe_crediting_period_renewals
       SET chain_status = 'lapsed', lapsed_at = ?, sla_deadline_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cpr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_crediting_period_renewals_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'crediting_renewal.lapsed',
      'renewal_due',
      'lapsed',
      'system',
      'registry',
      `Auto-lapse: renewal window expired without submission (tier ${row.issuance_tier})`,
      JSON.stringify({ renewal_due_at: row.renewal_due_at, sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    await fireCascade({
      event: 'crediting_renewal.lapsed',
      actor_id: 'system',
      entity_type: 'crediting_period_renewal',
      entity_id: row.id,
      data: { ...row, chain_status: 'lapsed', from_status: 'renewal_due', action: 'lapse' },
      env,
    });

    lapsed++;
  }

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_crediting_period_renewals
     WHERE chain_status NOT IN ('renewed','refused','withdrawn','lapsed','renewal_due')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RenewalRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_crediting_period_renewals
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cpr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_crediting_period_renewals_events (id, renewal_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'crediting_renewal.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.issuance_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.issuance_tier)) {
      await fireCascade({
        event: 'crediting_renewal.sla_breached',
        actor_id: 'system',
        entity_type: 'crediting_period_renewal',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }

    breached++;
  }

  return { scanned: dueRows.length + rows.length, lapsed, breached };
}

export default app;
