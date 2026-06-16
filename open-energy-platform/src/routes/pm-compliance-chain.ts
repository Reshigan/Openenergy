// ═══════════════════════════════════════════════════════════════════════════
// Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral chain
//
// Mounted at /api/pm-compliance/chain.
//
// IEC 62446 (PV inspection / maintenance) + IEC 61724 + standard REIPPPP O&M
// service-agreement PM-program discipline. 12-state P6 lifecycle for a single
// scheduled PM task instance on the maintenance calendar.
//
// The PROACTIVE maintenance-program counterpart UPSTREAM of W51 (availability
// guarantee) and W24 (PR underperformance): keeping PMs on schedule is what
// keeps availability and PR within guarantee.
//
// Forward path:
//   pm_scheduled → work_assigned → in_progress → completed →
//   verification_pending → closed
// Rework:   require_rework (verification_pending) → rework_required → start_work
// On-hold:  place_on_hold (in_progress) → on_hold → start_work
// Deferral: request_deferral (pm_scheduled|work_assigned|on_hold)
//   → deferral_requested → approve_deferral → deferred  (or reject_deferral →
//   work_assigned)
// Skip:     skip_pm (pm_scheduled|work_assigned|on_hold|deferral_requested)
//   → skipped
// Cancel:   cancel_pm (pm_scheduled|work_assigned) → cancelled
//
// URGENT SLA — the MORE critical the PM, the TIGHTER the response window.
// Reportability:
//   - skip_pm crosses for CRITICAL tiers {critical, safety_critical}.
//   - approve_deferral crosses for safety_critical ONLY.
//   - sla_breached crosses for CRITICAL tiers.
//
// Single-party write: there is no O&M-contractor login — the Esums O&M
// operators record every party's action; the contractual party is captured
// separately via actor_party (asset_owner / om_contractor) derived from action.
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
  SLA_MINUTES,
  type PmComplianceStatus,
  type PmComplianceAction,
  type PmCriticalityTier,
} from '../utils/pm-compliance-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'lender', 'offtaker', 'esco',
]);

// Single-party write: no dedicated O&M-contractor login — the Esums O&M
// operators record every party's action; the contractual party is captured
// separately via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer', 'esco']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PmRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  contractor_party_id: string;
  contractor_party_name: string;
  site_id: string | null;
  site_name: string;
  site_province: string | null;
  technology: string;
  asset_tag: string | null;
  asset_class: string | null;
  contract_ref: string | null;
  pm_code: string | null;
  pm_title: string;
  pm_frequency: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  deferred_to_date: string | null;
  criticality_score: number;
  criticality_tier: PmCriticalityTier;
  checklist_total_items: number | null;
  checklist_passed_items: number | null;
  labour_hours: number | null;
  estimated_cost_zar: number | null;
  actual_cost_zar: number | null;
  assignment_ref: string | null;
  completion_ref: string | null;
  verification_ref: string | null;
  rework_ref: string | null;
  deferral_ref: string | null;
  skip_ref: string | null;
  regulator_ref: string | null;
  assignment_basis: string | null;
  hold_basis: string | null;
  completion_basis: string | null;
  verification_basis: string | null;
  rework_basis: string | null;
  deferral_basis: string | null;
  skip_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  rework_round: number;
  deferral_round: number;
  chain_status: PmComplianceStatus;
  pm_scheduled_at: string;
  work_assigned_at: string | null;
  in_progress_at: string | null;
  on_hold_at: string | null;
  completed_at: string | null;
  verification_pending_at: string | null;
  rework_required_at: string | null;
  deferral_requested_at: string | null;
  closed_at: string | null;
  deferred_at: string | null;
  skipped_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PmEventRow {
  id: string;
  pm_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PmComplianceStatus, keyof PmRow | null> = {
  pm_scheduled:         null,
  work_assigned:        'work_assigned_at',
  in_progress:          'in_progress_at',
  on_hold:              'on_hold_at',
  completed:            'completed_at',
  verification_pending: 'verification_pending_at',
  rework_required:      'rework_required_at',
  deferral_requested:   'deferral_requested_at',
  closed:               'closed_at',
  deferred:             'deferred_at',
  skipped:              'skipped_at',
  cancelled:            'cancelled_at',
};

function decorate(row: PmRow, now: Date) {
  const tier = row.criticality_tier;
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

// reject_deferral routes back to work_assigned, so it SHARES the
// 'pm_compliance.work_assigned' event with assign_work — the deferral_round /
// payload distinguish a fresh assignment from a deferral rejection.
function eventTypeFor(action: PmComplianceAction): string {
  switch (action) {
    case 'assign_work':       return 'pm_compliance.work_assigned';
    case 'start_work':        return 'pm_compliance.in_progress';
    case 'place_on_hold':     return 'pm_compliance.on_hold';
    case 'complete_work':     return 'pm_compliance.completed';
    case 'open_verification': return 'pm_compliance.verification_pending';
    case 'require_rework':    return 'pm_compliance.rework_required';
    case 'close_pm':          return 'pm_compliance.closed';
    case 'request_deferral':  return 'pm_compliance.deferral_requested';
    case 'approve_deferral':  return 'pm_compliance.deferred';
    case 'reject_deferral':   return 'pm_compliance.work_assigned';
    case 'skip_pm':           return 'pm_compliance.skipped';
    case 'cancel_pm':         return 'pm_compliance.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const criticality_tier    = c.req.query('criticality_tier');
  const technology          = c.req.query('technology');
  const status              = c.req.query('status');
  const breached            = c.req.query('breached');
  const contractor_party_id = c.req.query('contractor_party_id');
  const reportable          = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_pm_compliance WHERE 1=1';
  const binds: unknown[] = [];
  if (criticality_tier)    { sql += ' AND criticality_tier = ?';    binds.push(criticality_tier); }
  if (technology)          { sql += ' AND technology = ?';          binds.push(technology); }
  if (status)              { sql += ' AND chain_status = ?';        binds.push(status); }
  if (contractor_party_id) { sql += ' AND contractor_party_id = ?'; binds.push(contractor_party_id); }

  sql += ' ORDER BY datetime(pm_scheduled_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PmRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_technology: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.criticality_tier] = (by_tier[i.criticality_tier] || 0) + 1;
    by_technology[i.technology] = (by_technology[i.technology] || 0) + 1;
  }

  const CRITICAL = new Set<PmCriticalityTier>(['critical', 'safety_critical']);
  const open_count           = items.filter((i) => !i.is_terminal).length;
  const closed_count         = items.filter((i) => i.chain_status === 'closed').length;
  const in_progress_count    = items.filter((i) => i.chain_status === 'in_progress').length;
  const on_hold_count        = items.filter((i) => i.chain_status === 'on_hold').length;
  const verification_count   = items.filter((i) => i.chain_status === 'verification_pending').length;
  const rework_count         = items.filter((i) => i.chain_status === 'rework_required').length;
  const deferral_open_count  = items.filter((i) => i.chain_status === 'deferral_requested').length;
  const deferred_count       = items.filter((i) => i.chain_status === 'deferred').length;
  const skipped_count        = items.filter((i) => i.chain_status === 'skipped').length;
  const cancelled_count      = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count       = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total     = items.filter((i) => i.is_reportable).length;
  const critical_open        = items.filter((i) => !i.is_terminal && CRITICAL.has(i.criticality_tier)).length;
  const total_estimated_cost_zar = items.reduce((s, i) => s + (i.estimated_cost_zar || 0), 0);
  const total_actual_cost_zar    = items.reduce((s, i) => s + (i.actual_cost_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_technology,
      open_count,
      closed_count,
      in_progress_count,
      on_hold_count,
      verification_count,
      rework_count,
      deferral_open_count,
      deferred_count,
      skipped_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      critical_open,
      total_estimated_cost_zar,
      total_actual_cost_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_pm_compliance WHERE id = ?').bind(id).first<PmRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_pm_compliance_events WHERE pm_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PmEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AssignBody {
  assignment_ref?: string;
  assignment_basis?: string;
  notes?: string;
}

interface StartBody {
  labour_hours?: number;
  notes?: string;
}

interface HoldBody {
  hold_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface CompleteBody {
  completion_ref?: string;
  completion_basis?: string;
  checklist_total_items?: number;
  checklist_passed_items?: number;
  labour_hours?: number;
  actual_cost_zar?: number;
  notes?: string;
}

interface VerificationBody {
  verification_ref?: string;
  verification_basis?: string;
  notes?: string;
}

interface ReworkBody {
  rework_ref?: string;
  rework_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface CloseBody {
  verification_ref?: string;
  verification_basis?: string;
  notes?: string;
}

interface DeferralBody {
  deferral_ref?: string;
  deferral_basis?: string;
  deferred_to_date?: string;
  reason_code?: string;
  notes?: string;
}

interface ApproveDeferralBody {
  deferred_to_date?: string;
  deferral_basis?: string;
  regulator_ref?: string;
  notes?: string;
}

interface RejectDeferralBody {
  deferral_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface SkipBody {
  skip_ref?: string;
  skip_basis?: string;
  regulator_ref?: string;
  reason_code?: string;
  notes?: string;
}

interface CancelBody {
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PmComplianceAction,
  bodyHandler?: (row: PmRow, body: Record<string, unknown>) => Partial<PmRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_pm_compliance WHERE id = ?').bind(id).first<PmRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The PM criticality tier is fixed at scheduling — it drives the SLA deadline
  // and the regulator crossing throughout the lifecycle.
  const effectiveTier = row.criticality_tier;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier);
  // skip_pm on a critical / safety tier, or approve_deferral on a safety tier,
  // crosses into the regulator inbox — mark reportable.
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
    `UPDATE oe_pm_compliance SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `pmc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_pm_compliance_events (id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'pm_compliance',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      criticality_tier: effectiveTier,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_pm_compliance WHERE id = ?').bind(id).first<PmRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/assign-work', async (c) => transition(c, 'assign_work', (_row, body) => {
  const b = body as Partial<AssignBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.assignment_ref === 'string')   out.assignment_ref = b.assignment_ref;
  if (typeof b.assignment_basis === 'string') out.assignment_basis = b.assignment_basis;
  return out;
}));

app.post('/:id/start-work', async (c) => transition(c, 'start_work', (_row, body) => {
  const b = body as Partial<StartBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.labour_hours === 'number') out.labour_hours = b.labour_hours;
  return out;
}));

app.post('/:id/place-on-hold', async (c) => transition(c, 'place_on_hold', (_row, body) => {
  const b = body as Partial<HoldBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.hold_basis === 'string')  out.hold_basis = b.hold_basis;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/complete-work', async (c) => transition(c, 'complete_work', (_row, body) => {
  const b = body as Partial<CompleteBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.completion_ref === 'string')        out.completion_ref = b.completion_ref;
  if (typeof b.completion_basis === 'string')      out.completion_basis = b.completion_basis;
  if (typeof b.checklist_total_items === 'number') out.checklist_total_items = b.checklist_total_items;
  if (typeof b.checklist_passed_items === 'number')out.checklist_passed_items = b.checklist_passed_items;
  if (typeof b.labour_hours === 'number')          out.labour_hours = b.labour_hours;
  if (typeof b.actual_cost_zar === 'number')       out.actual_cost_zar = b.actual_cost_zar;
  return out;
}));

app.post('/:id/open-verification', async (c) => transition(c, 'open_verification', (_row, body) => {
  const b = body as Partial<VerificationBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.verification_ref === 'string')   out.verification_ref = b.verification_ref;
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/require-rework', async (c) => transition(c, 'require_rework', (row, body) => {
  const b = body as Partial<ReworkBody>;
  const out: Partial<PmRow> = { rework_round: (row.rework_round || 0) + 1 };
  if (typeof b.rework_ref === 'string')   out.rework_ref = b.rework_ref;
  if (typeof b.rework_basis === 'string') out.rework_basis = b.rework_basis;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/close-pm', async (c) => transition(c, 'close_pm', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.verification_ref === 'string')   out.verification_ref = b.verification_ref;
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/request-deferral', async (c) => transition(c, 'request_deferral', (row, body) => {
  const b = body as Partial<DeferralBody>;
  const out: Partial<PmRow> = { deferral_round: (row.deferral_round || 0) + 1 };
  if (typeof b.deferral_ref === 'string')     out.deferral_ref = b.deferral_ref;
  if (typeof b.deferral_basis === 'string')   out.deferral_basis = b.deferral_basis;
  if (typeof b.deferred_to_date === 'string') out.deferred_to_date = b.deferred_to_date;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/approve-deferral', async (c) => transition(c, 'approve_deferral', (_row, body) => {
  const b = body as Partial<ApproveDeferralBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.deferred_to_date === 'string') out.deferred_to_date = b.deferred_to_date;
  if (typeof b.deferral_basis === 'string')   out.deferral_basis = b.deferral_basis;
  if (typeof b.regulator_ref === 'string')    out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/reject-deferral', async (c) => transition(c, 'reject_deferral', (_row, body) => {
  const b = body as Partial<RejectDeferralBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.deferral_basis === 'string') out.deferral_basis = b.deferral_basis;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/skip-pm', async (c) => transition(c, 'skip_pm', (_row, body) => {
  const b = body as Partial<SkipBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.skip_ref === 'string')      out.skip_ref = b.skip_ref;
  if (typeof b.skip_basis === 'string')    out.skip_basis = b.skip_basis;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel-pm', async (c) => transition(c, 'cancel_pm', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<PmRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function pmComplianceSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_pm_compliance
     WHERE chain_status NOT IN ('closed','deferred','skipped','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PmRow>();

  const rows = rs.results || [];
  // Per-row UPDATE + event INSERT committed atomically; fireCascade is a multi-stage
  // fan-out (not a D1 statement) so it runs afterwards, off the batch.
  const stmts: D1PreparedStatement[] = [];
  const toCascade: PmRow[] = [];
  const mkUpdate = (row: PmRow) => env.DB.prepare(
    `UPDATE oe_pm_compliance
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
  ).bind(nowIso, nowIso, row.id);
  const mkEvent = (row: PmRow) => {
    const evtId = `pmc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    return env.DB.prepare(
      'INSERT INTO oe_pm_compliance_events (id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'pm_compliance.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.criticality_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    );
  };
  for (const row of rows) {
    stmts.push(mkUpdate(row), mkEvent(row));
    if (slaBreachCrossesIntoRegulator(row.criticality_tier)) toCascade.push(row);
  }

  if (stmts.length) {
    try {
      await env.DB.batch(stmts);
    } catch {
      // Best-effort fallback: one bad row must not abort the whole sweep.
      for (const row of rows) {
        await mkUpdate(row).run().catch(() => {});
        await mkEvent(row).run().catch(() => {});
      }
    }
  }

  for (const row of toCascade) {
    await fireCascade({
      event: 'pm_compliance.sla_breached',
      actor_id: 'system',
      entity_type: 'pm_compliance',
      entity_id: row.id,
      data: {
        ...row,
        crosses_into_regulator: true,
      },
      env,
    });
  }

  return { scanned: rows.length, breached: rows.length };
}

export default app;
