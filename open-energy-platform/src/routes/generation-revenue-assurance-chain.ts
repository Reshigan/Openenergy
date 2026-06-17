// ═══════════════════════════════════════════════════════════════════════════
// Wave 79 — Esums Generation Revenue Assurance & Meter Reconciliation (P6)
//
// Mounted at /api/generation-revenue-assurance/chain.
//
// Every MWh a plant generates is supposed to turn into cash. Between the inverter
// and the bank account sit four numbers that should agree but rarely do: EXPECTED
// generation (the W71 prognostics / W24 PR model), the REVENUE METER reading, the
// SETTLEMENT statement (what the DSO / market operator settled) and the PPA INVOICE
// (what the offtaker was billed). Where they diverge, money leaks. W79 reconciles a
// settlement period against the EXPECTED-generation baseline, auto-classifies the
// leakage signature, and drives an SLA-bound recovery with a NERSA-visible
// settlement-dispute branch and a quantified recovered-ZAR ledger. See
// src/utils/generation-revenue-assurance-spec.ts for the full state machine,
// URGENT variance tiering and reportability rationale.
//
//   period_open → data_ingested → reconciled → variance_flagged
//     → investigating → classified → recovery_pending → recovered   (recovery path)
//   clean:     reconciled → closed_clean                            (within tolerance)
//   dispute:   recovery_pending → in_dispute
//                → recovered (resolve_dispute_recovered) | written_off (resolve_dispute_writeoff)
//   write-off: {classified, recovery_pending} → written_off         (unrecoverable)
//   cancel:    {period_open … classified} → cancelled               (opened in error)
//
// Single write {admin, support} — the Esums revenue-assurance desk operates the
// chain; actor_party records the function (analyst / counterparty / reviewer) per
// step for audit texture, not the JWT role.
//
// Reportability (the W79 signature): raise_dispute crosses for EVERY tier (a
// settlement / metering dispute is always a NERSA metering-code matter);
// classify_leakage crosses for EVERY tier when the category is meter_tampering;
// write-offs cross for the material+ tiers; SLA breaches cross for major + critical.
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
  tierForVarianceZar,
  isLargeTier,
  SLA_MINUTES,
  type RevenueAssuranceStatus,
  type RevenueAssuranceAction,
  type RevenueAssuranceTier,
  type LeakageCategory,
} from '../utils/generation-revenue-assurance-spec';

// All nine personas may read the revenue-assurance register.
const READ_ROLES = new Set([
  'admin',
  'support', 'offtaker', 'lender', 'regulator', 'grid_operator', 'ipp_developer', 'carbon_fund', 'trader', 'esco',
]);

// Single write: the Esums revenue-assurance desk operates the chain. esco is the
// live Esums/O&M operator persona (seed 494); 'support' was the pre-persona
// placeholder. Both write so the laned esco Horizon is functional.
const WRITE_ROLES = new Set(['admin', 'support', 'esco']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface AssuranceRow {
  id: string;
  gra_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  site_id: string | null;
  project_id: string | null;
  meter_id: string | null;
  ppa_ref: string | null;
  reconciliation_period: string;
  period_start: string | null;
  period_end: string | null;
  data_cutoff_date: string | null;
  site_name: string;
  operator_name: string;
  counterparty_name: string | null;
  reviewer_name: string | null;
  expected_generation_mwh: number | null;
  metered_generation_mwh: number | null;
  settled_generation_mwh: number | null;
  invoiced_generation_mwh: number | null;
  currency: string | null;
  tariff_ref: string | null;
  expected_revenue_zar: number | null;
  settled_revenue_zar: number | null;
  variance_zar: number;
  variance_mwh: number | null;
  recovered_zar: number | null;
  written_off_zar: number | null;
  leakage_category: LeakageCategory | null;
  recovery_method: string | null;
  revenue_assurance_tier: RevenueAssuranceTier;
  reason_code: string | null;
  recovery_deadline: string | null;
  dispute_deadline: string | null;
  ingest_ref: string | null;
  reconciliation_ref: string | null;
  investigation_ref: string | null;
  classification_ref: string | null;
  recovery_ref: string | null;
  dispute_ref: string | null;
  resolution_ref: string | null;
  writeoff_ref: string | null;
  cancellation_ref: string | null;
  period_basis: string | null;
  ingest_basis: string | null;
  reconciliation_basis: string | null;
  investigation_basis: string | null;
  classification_basis: string | null;
  recovery_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  writeoff_basis: string | null;
  cancellation_basis: string | null;
  chain_status: RevenueAssuranceStatus;
  period_open_at: string;
  data_ingested_at: string | null;
  reconciled_at: string | null;
  variance_flagged_at: string | null;
  investigating_at: string | null;
  classified_at: string | null;
  recovery_pending_at: string | null;
  in_dispute_at: string | null;
  recovered_at: string | null;
  closed_clean_at: string | null;
  written_off_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AssuranceEventRow {
  id: string;
  assurance_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<RevenueAssuranceStatus, keyof AssuranceRow | null> = {
  period_open:      null,
  data_ingested:    'data_ingested_at',
  reconciled:       'reconciled_at',
  variance_flagged: 'variance_flagged_at',
  investigating:    'investigating_at',
  classified:       'classified_at',
  recovery_pending: 'recovery_pending_at',
  in_dispute:       'in_dispute_at',
  recovered:        'recovered_at',
  closed_clean:     'closed_clean_at',
  written_off:      'written_off_at',
  cancelled:        'cancelled_at',
};

function decorate(row: AssuranceRow, now: Date) {
  const tier = row.revenue_assurance_tier;
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

function eventTypeFor(action: RevenueAssuranceAction): string {
  switch (action) {
    case 'ingest_data':               return 'generation_revenue_assurance.data_ingested';
    case 'run_reconciliation':        return 'generation_revenue_assurance.reconciled';
    case 'close_clean':               return 'generation_revenue_assurance.closed_clean';
    case 'flag_variance':             return 'generation_revenue_assurance.variance_flagged';
    case 'open_investigation':        return 'generation_revenue_assurance.investigating';
    case 'classify_leakage':          return 'generation_revenue_assurance.classified';
    case 'issue_recovery_claim':      return 'generation_revenue_assurance.recovery_pending';
    case 'confirm_recovery':          return 'generation_revenue_assurance.recovered';
    case 'raise_dispute':             return 'generation_revenue_assurance.in_dispute';
    case 'resolve_dispute_recovered': return 'generation_revenue_assurance.recovered';
    case 'resolve_dispute_writeoff':  return 'generation_revenue_assurance.written_off';
    case 'write_off':                 return 'generation_revenue_assurance.written_off';
    case 'cancel_reconciliation':     return 'generation_revenue_assurance.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const revenue_assurance_tier = c.req.query('revenue_assurance_tier');
  const leakage_category       = c.req.query('leakage_category');
  const status                 = c.req.query('status');
  const breached               = c.req.query('breached');
  const reportable             = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_generation_revenue_assurance WHERE 1=1';
  const binds: unknown[] = [];
  if (revenue_assurance_tier) { sql += ' AND revenue_assurance_tier = ?'; binds.push(revenue_assurance_tier); }
  if (leakage_category)       { sql += ' AND leakage_category = ?'; binds.push(leakage_category); }
  if (status)                 { sql += ' AND chain_status = ?'; binds.push(status); }

  sql += ' ORDER BY datetime(period_open_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<AssuranceRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.revenue_assurance_tier] = (by_tier[i.revenue_assurance_tier] || 0) + 1;
    if (i.leakage_category) by_category[i.leakage_category] = (by_category[i.leakage_category] || 0) + 1;
  }

  const open_count         = items.filter((i) => !i.is_terminal).length;
  const dispute_count       = items.filter((i) => i.chain_status === 'in_dispute').length;
  const recovered_count     = items.filter((i) => i.chain_status === 'recovered').length;
  const closed_clean_count  = items.filter((i) => i.chain_status === 'closed_clean').length;
  const written_off_count   = items.filter((i) => i.chain_status === 'written_off').length;
  const cancelled_count     = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_sla        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable).length;
  const large_open          = items.filter((i) => !i.is_terminal && isLargeTier(i.revenue_assurance_tier)).length;
  const total_variance_zar  = items.reduce((sum, i) => sum + (i.variance_zar || 0), 0);
  const recovered_zar_total = items.reduce((sum, i) => sum + (i.recovered_zar || 0), 0);
  const written_off_zar_total = items.reduce((sum, i) => sum + (i.written_off_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_category,
      open_count,
      dispute_count,
      recovered_count,
      closed_clean_count,
      written_off_count,
      cancelled_count,
      breached: breached_sla,
      reportable_total,
      large_open,
      total_variance_zar,
      recovered_zar_total,
      written_off_zar_total,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_generation_revenue_assurance WHERE id = ?').bind(id).first<AssuranceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_generation_revenue_assurance_events WHERE assurance_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<AssuranceEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface IngestBody {
  ingest_basis?: string;
  ingest_ref?: string;
  metered_generation_mwh?: number;
  settled_generation_mwh?: number;
  invoiced_generation_mwh?: number;
  data_cutoff_date?: string;
  notes?: string;
}
interface ReconcileBody {
  reconciliation_basis?: string;
  reconciliation_ref?: string;
  expected_generation_mwh?: number;
  expected_revenue_zar?: number;
  settled_revenue_zar?: number;
  variance_zar?: number;
  variance_mwh?: number;
  notes?: string;
}
interface CloseCleanBody {
  reconciliation_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface FlagVarianceBody {
  reconciliation_basis?: string;
  variance_zar?: number;
  variance_mwh?: number;
  reason_code?: string;
  notes?: string;
}
interface InvestigationBody {
  investigation_basis?: string;
  investigation_ref?: string;
  notes?: string;
}
interface ClassifyBody {
  classification_basis?: string;
  classification_ref?: string;
  leakage_category?: LeakageCategory;
  reason_code?: string;
  notes?: string;
}
interface RecoveryClaimBody {
  recovery_basis?: string;
  recovery_ref?: string;
  recovery_method?: string;
  recovery_deadline?: string;
  counterparty_name?: string;
  notes?: string;
}
interface ConfirmRecoveryBody {
  recovery_basis?: string;
  recovery_ref?: string;
  recovered_zar?: number;
  reviewer_name?: string;
  notes?: string;
}
interface RaiseDisputeBody {
  dispute_basis?: string;
  dispute_ref?: string;
  dispute_deadline?: string;
  counterparty_name?: string;
  notes?: string;
}
interface ResolveRecoveredBody {
  resolution_basis?: string;
  resolution_ref?: string;
  recovered_zar?: number;
  reviewer_name?: string;
  notes?: string;
}
interface ResolveWriteoffBody {
  resolution_basis?: string;
  writeoff_basis?: string;
  writeoff_ref?: string;
  written_off_zar?: number;
  reviewer_name?: string;
  notes?: string;
}
interface WriteOffBody {
  writeoff_basis?: string;
  writeoff_ref?: string;
  written_off_zar?: number;
  reason_code?: string;
  reviewer_name?: string;
  notes?: string;
}
interface CancelBody {
  cancellation_basis?: string;
  cancellation_ref?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: RevenueAssuranceAction,
  bodyHandler?: (row: AssuranceRow, body: Record<string, unknown>) => Partial<AssuranceRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_generation_revenue_assurance WHERE id = ?').bind(id).first<AssuranceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is re-derived live from the (absolute) revenue variance whenever a
  // reconciliation or re-flag restates it; otherwise the recorded tier stands.
  let effectiveTier: RevenueAssuranceTier = row.revenue_assurance_tier;
  if (overrides.variance_zar != null) {
    effectiveTier = tierForVarianceZar(overrides.variance_zar || 0);
    overrides.revenue_assurance_tier = effectiveTier;
  }
  const effectiveCategory: LeakageCategory | null =
    (overrides.leakage_category as LeakageCategory | undefined) ?? row.leakage_category;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier, effectiveCategory);
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
    `UPDATE oe_generation_revenue_assurance SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `gra_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_generation_revenue_assurance_events (id, assurance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'generation_revenue_assurance',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      revenue_assurance_tier: effectiveTier,
      leakage_category: effectiveCategory,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_generation_revenue_assurance WHERE id = ?').bind(id).first<AssuranceRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/ingest-data', async (c) => transition(c, 'ingest_data', (_row, body) => {
  const b = body as Partial<IngestBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.ingest_basis === 'string')             out.ingest_basis = b.ingest_basis;
  if (typeof b.ingest_ref === 'string')               out.ingest_ref = b.ingest_ref;
  if (typeof b.metered_generation_mwh === 'number')   out.metered_generation_mwh = b.metered_generation_mwh;
  if (typeof b.settled_generation_mwh === 'number')   out.settled_generation_mwh = b.settled_generation_mwh;
  if (typeof b.invoiced_generation_mwh === 'number')  out.invoiced_generation_mwh = b.invoiced_generation_mwh;
  if (typeof b.data_cutoff_date === 'string')         out.data_cutoff_date = b.data_cutoff_date;
  return out;
}));

app.post('/:id/run-reconciliation', async (c) => transition(c, 'run_reconciliation', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.reconciliation_basis === 'string')   out.reconciliation_basis = b.reconciliation_basis;
  if (typeof b.reconciliation_ref === 'string')     out.reconciliation_ref = b.reconciliation_ref;
  if (typeof b.expected_generation_mwh === 'number') out.expected_generation_mwh = b.expected_generation_mwh;
  if (typeof b.expected_revenue_zar === 'number')   out.expected_revenue_zar = b.expected_revenue_zar;
  if (typeof b.settled_revenue_zar === 'number')    out.settled_revenue_zar = b.settled_revenue_zar;
  if (typeof b.variance_zar === 'number')           out.variance_zar = b.variance_zar;
  if (typeof b.variance_mwh === 'number')           out.variance_mwh = b.variance_mwh;
  return out;
}));

app.post('/:id/close-clean', async (c) => transition(c, 'close_clean', (_row, body) => {
  const b = body as Partial<CloseCleanBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.reconciliation_basis === 'string') out.reconciliation_basis = b.reconciliation_basis;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/flag-variance', async (c) => transition(c, 'flag_variance', (_row, body) => {
  const b = body as Partial<FlagVarianceBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.reconciliation_basis === 'string') out.reconciliation_basis = b.reconciliation_basis;
  if (typeof b.variance_zar === 'number')         out.variance_zar = b.variance_zar;
  if (typeof b.variance_mwh === 'number')         out.variance_mwh = b.variance_mwh;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/open-investigation', async (c) => transition(c, 'open_investigation', (_row, body) => {
  const b = body as Partial<InvestigationBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.investigation_basis === 'string') out.investigation_basis = b.investigation_basis;
  if (typeof b.investigation_ref === 'string')   out.investigation_ref = b.investigation_ref;
  return out;
}));

app.post('/:id/classify-leakage', async (c) => transition(c, 'classify_leakage', (_row, body) => {
  const b = body as Partial<ClassifyBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.classification_basis === 'string') out.classification_basis = b.classification_basis;
  if (typeof b.classification_ref === 'string')   out.classification_ref = b.classification_ref;
  if (typeof b.leakage_category === 'string')     out.leakage_category = b.leakage_category;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/issue-recovery-claim', async (c) => transition(c, 'issue_recovery_claim', (_row, body) => {
  const b = body as Partial<RecoveryClaimBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.recovery_basis === 'string')     out.recovery_basis = b.recovery_basis;
  if (typeof b.recovery_ref === 'string')       out.recovery_ref = b.recovery_ref;
  if (typeof b.recovery_method === 'string')    out.recovery_method = b.recovery_method;
  if (typeof b.recovery_deadline === 'string')  out.recovery_deadline = b.recovery_deadline;
  if (typeof b.counterparty_name === 'string')  out.counterparty_name = b.counterparty_name;
  return out;
}));

app.post('/:id/confirm-recovery', async (c) => transition(c, 'confirm_recovery', (_row, body) => {
  const b = body as Partial<ConfirmRecoveryBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.recovery_basis === 'string')   out.recovery_basis = b.recovery_basis;
  if (typeof b.recovery_ref === 'string')     out.recovery_ref = b.recovery_ref;
  if (typeof b.recovered_zar === 'number')    out.recovered_zar = b.recovered_zar;
  if (typeof b.reviewer_name === 'string')    out.reviewer_name = b.reviewer_name;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<AssuranceRow> = { escalation_level: 1 };
  if (typeof b.dispute_basis === 'string')      out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')        out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_deadline === 'string')   out.dispute_deadline = b.dispute_deadline;
  if (typeof b.counterparty_name === 'string')  out.counterparty_name = b.counterparty_name;
  return out;
}));

app.post('/:id/resolve-dispute-recovered', async (c) => transition(c, 'resolve_dispute_recovered', (_row, body) => {
  const b = body as Partial<ResolveRecoveredBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.resolution_basis === 'string') out.resolution_basis = b.resolution_basis;
  if (typeof b.resolution_ref === 'string')   out.resolution_ref = b.resolution_ref;
  if (typeof b.recovered_zar === 'number')    out.recovered_zar = b.recovered_zar;
  if (typeof b.reviewer_name === 'string')    out.reviewer_name = b.reviewer_name;
  return out;
}));

app.post('/:id/resolve-dispute-writeoff', async (c) => transition(c, 'resolve_dispute_writeoff', (_row, body) => {
  const b = body as Partial<ResolveWriteoffBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.resolution_basis === 'string') out.resolution_basis = b.resolution_basis;
  if (typeof b.writeoff_basis === 'string')   out.writeoff_basis = b.writeoff_basis;
  if (typeof b.writeoff_ref === 'string')     out.writeoff_ref = b.writeoff_ref;
  if (typeof b.written_off_zar === 'number')  out.written_off_zar = b.written_off_zar;
  if (typeof b.reviewer_name === 'string')    out.reviewer_name = b.reviewer_name;
  return out;
}));

app.post('/:id/write-off', async (c) => transition(c, 'write_off', (_row, body) => {
  const b = body as Partial<WriteOffBody>;
  const out: Partial<AssuranceRow> = { recovery_method: 'none' };
  if (typeof b.writeoff_basis === 'string')  out.writeoff_basis = b.writeoff_basis;
  if (typeof b.writeoff_ref === 'string')    out.writeoff_ref = b.writeoff_ref;
  if (typeof b.written_off_zar === 'number') out.written_off_zar = b.written_off_zar;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.reviewer_name === 'string')   out.reviewer_name = b.reviewer_name;
  return out;
}));

app.post('/:id/cancel-reconciliation', async (c) => transition(c, 'cancel_reconciliation', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<AssuranceRow> = {};
  if (typeof b.cancellation_basis === 'string') out.cancellation_basis = b.cancellation_basis;
  if (typeof b.cancellation_ref === 'string')   out.cancellation_ref = b.cancellation_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal recon past its deadline,
// crossing to the regulator for the large tiers (major + critical).
export async function generationRevenueAssuranceSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_generation_revenue_assurance
     WHERE chain_status NOT IN ('recovered','closed_clean','written_off','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<AssuranceRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_generation_revenue_assurance
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `gra_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_generation_revenue_assurance_events (id, assurance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'generation_revenue_assurance.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'analyst',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.revenue_assurance_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.revenue_assurance_tier)) {
      await fireCascade({
        event: 'generation_revenue_assurance.sla_breached',
        actor_id: 'system',
        entity_type: 'generation_revenue_assurance',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
