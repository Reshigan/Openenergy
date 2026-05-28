// ═══════════════════════════════════════════════════════════════════════════
// Wave 64 — Esums Permit-to-Work (PTW) / LOTO Authorisation & Isolation Control
//
// Mounted at /api/permit-to-work/chain.
//
// OHSA 85/1993 (s.8) + Construction Regulations 2014 + Electrical Machinery
// Regulations + General Machinery Regulations + REIPPPP O&M safe-system-of-work
// discipline. 12-state P6 lifecycle for a SINGLE permit authorising a hazardous
// field intervention on a PV / wind asset.
//
// The PROACTIVE safe-system-of-work GATE every hazardous field task passes BEFORE
// it starts: hazard assessed → isolation (LOTO) plan approved → isolation applied
// and a zero-energy state verified (test-for-dead) → permit issued → work done
// (suspend/resume for shift handover) → permit closed (re-energise, hand back) —
// or rejected at assessment, withdrawn pre-issue, or REVOKED under emergency /
// isolation breach. Complements W25 HSE incident (REACTIVE) and gates W16 / W59.
//
// URGENT SLA — the more hazardous the permit, the tighter the window.
// SIGNATURE (live-work / isolation-integrity): issue_permit crosses for EVERY
// tier when LIVE or confined-space; non-live, non-confined crosses only for top
// tiers; revoke_permit ALWAYS crosses; sla_breached crosses for top tiers.
//
// Single-party write: there is no field-crew login — the Esums O&M operators
// record every party's action; the contractual party is captured separately via
// actor_party (issuing_authority / permit_holder), derived from the action.
// admin / support / ipp_developer write.
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
  partyForAction,
  tierForHazardScore,
  SLA_MINUTES,
  type PermitStatus,
  type PermitAction,
  type HazardTier,
  type WorkClass,
} from '../utils/permit-to-work-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'lender', 'offtaker',
]);

// Single-party write: no dedicated field-crew login — the Esums O&M operators
// record every party's action; the contractual party is captured via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PermitRow {
  id: string;
  permit_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  holder_party_id: string;
  holder_party_name: string;
  authority_party_id: string;
  authority_party_name: string;
  isolating_authority_name: string | null;
  asset_name: string | null;
  equipment_tag: string | null;
  work_location: string | null;
  work_description: string | null;
  work_class: WorkClass;
  method_statement_ref: string | null;
  hazard_score: number;
  hazard_tier: HazardTier;
  live_work: number;
  energy_sources: string | null;
  isolation_points: number | null;
  permit_validity_hours: number | null;
  assessed_flag: number;
  isolation_plan_approved: number;
  isolation_verified: number;
  permit_issued_flag: number;
  work_started_flag: number;
  work_completed_flag: number;
  closed_flag: number;
  revoked_flag: number;
  request_ref: string | null;
  assessment_ref: string | null;
  isolation_plan_ref: string | null;
  isolation_cert_ref: string | null;
  permit_ref: string | null;
  suspension_ref: string | null;
  completion_ref: string | null;
  closure_ref: string | null;
  rejection_ref: string | null;
  revocation_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  assessment_basis: string | null;
  isolation_basis: string | null;
  issue_basis: string | null;
  suspension_basis: string | null;
  completion_basis: string | null;
  closure_basis: string | null;
  rejection_basis: string | null;
  revocation_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  suspend_count: number;
  chain_status: PermitStatus;
  permit_requested_at: string;
  hazard_assessment_at: string | null;
  isolation_pending_at: string | null;
  isolation_confirmed_at: string | null;
  permit_issued_at: string | null;
  work_in_progress_at: string | null;
  suspended_at: string | null;
  work_complete_at: string | null;
  permit_closed_at: string | null;
  permit_rejected_at: string | null;
  permit_revoked_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PermitEventRow {
  id: string;
  permit_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PermitStatus, keyof PermitRow | null> = {
  permit_requested:    null,
  hazard_assessment:   'hazard_assessment_at',
  isolation_pending:   'isolation_pending_at',
  isolation_confirmed: 'isolation_confirmed_at',
  permit_issued:       'permit_issued_at',
  work_in_progress:    'work_in_progress_at',
  suspended:           'suspended_at',
  work_complete:       'work_complete_at',
  permit_closed:       'permit_closed_at',
  permit_rejected:     'permit_rejected_at',
  permit_revoked:      'permit_revoked_at',
  withdrawn:           'withdrawn_at',
};

// The gate flag each action raises (proof the step happened, independent of state).
const GATE_FLAG: Partial<Record<PermitAction, keyof PermitRow>> = {
  begin_assessment:       'assessed_flag',
  approve_isolation_plan: 'isolation_plan_approved',
  verify_isolation:       'isolation_verified',
  issue_permit:           'permit_issued_flag',
  start_work:             'work_started_flag',
  complete_work:          'work_completed_flag',
  close_permit:           'closed_flag',
  revoke_permit:          'revoked_flag',
};

function decorate(row: PermitRow, now: Date) {
  const tier = row.hazard_tier;
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
    is_reportable_flag: !!row.is_reportable,
    live_work_flag: !!row.live_work,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// resume_work has no seed precedent but maps to a distinct .resumed event;
// reject/withdraw likewise map to dedicated terminals.
function eventTypeFor(action: PermitAction): string {
  switch (action) {
    case 'begin_assessment':       return 'permit_to_work.assessment_started';
    case 'approve_isolation_plan': return 'permit_to_work.isolation_planned';
    case 'verify_isolation':       return 'permit_to_work.isolation_verified';
    case 'issue_permit':           return 'permit_to_work.issued';
    case 'start_work':             return 'permit_to_work.work_started';
    case 'suspend_work':           return 'permit_to_work.suspended';
    case 'resume_work':            return 'permit_to_work.resumed';
    case 'complete_work':          return 'permit_to_work.work_completed';
    case 'close_permit':           return 'permit_to_work.closed';
    case 'reject_permit':          return 'permit_to_work.rejected';
    case 'revoke_permit':          return 'permit_to_work.revoked';
    case 'withdraw':               return 'permit_to_work.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const hazard_tier      = c.req.query('hazard_tier');
  const work_class       = c.req.query('work_class');
  const status           = c.req.query('status');
  const breached         = c.req.query('breached');
  const holder_party_id  = c.req.query('holder_party_id');
  const reportable       = c.req.query('reportable');
  const live             = c.req.query('live');

  let sql = 'SELECT * FROM oe_permit_to_work WHERE 1=1';
  const binds: unknown[] = [];
  if (hazard_tier)     { sql += ' AND hazard_tier = ?';     binds.push(hazard_tier); }
  if (work_class)      { sql += ' AND work_class = ?';      binds.push(work_class); }
  if (status)          { sql += ' AND chain_status = ?';    binds.push(status); }
  if (holder_party_id) { sql += ' AND holder_party_id = ?'; binds.push(holder_party_id); }

  sql += ' ORDER BY datetime(permit_requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PermitRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);
  if (live === 'true')       items = items.filter((r) => r.live_work_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.hazard_tier] = (by_tier[i.hazard_tier] || 0) + 1;
    by_class[i.work_class] = (by_class[i.work_class] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const closed_count        = items.filter((i) => i.chain_status === 'permit_closed').length;
  const issued_count        = items.filter((i) => i.chain_status === 'permit_issued').length;
  const in_progress_count   = items.filter((i) => i.chain_status === 'work_in_progress').length;
  const suspended_count     = items.filter((i) => i.chain_status === 'suspended').length;
  const rejected_count      = items.filter((i) => i.chain_status === 'permit_rejected').length;
  const revoked_count       = items.filter((i) => i.chain_status === 'permit_revoked').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const live_work_total     = items.filter((i) => i.live_work_flag).length;
  const confined_total      = items.filter((i) => i.work_class === 'confined_space').length;
  const top_tier_open       = items.filter((i) => !i.is_terminal && (i.hazard_tier === 'critical' || i.hazard_tier === 'catastrophic')).length;
  const total_isolation_points = items.reduce((s, i) => s + (i.isolation_points || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_class,
      open_count,
      closed_count,
      issued_count,
      in_progress_count,
      suspended_count,
      rejected_count,
      revoked_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      live_work_total,
      confined_total,
      top_tier_open,
      total_isolation_points,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_permit_to_work WHERE id = ?').bind(id).first<PermitRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_permit_to_work_events WHERE permit_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PermitEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AssessmentBody {
  assessment_ref?: string;
  assessment_basis?: string;
  notes?: string;
}

interface IsolationPlanBody {
  isolation_plan_ref?: string;
  isolation_basis?: string;
  energy_sources?: string;
  isolation_points?: number;
  notes?: string;
}

interface VerifyBody {
  isolation_cert_ref?: string;
  isolation_basis?: string;
  isolating_authority_name?: string;
  notes?: string;
}

interface IssueBody {
  permit_ref?: string;
  issue_basis?: string;
  permit_validity_hours?: number;
  notes?: string;
}

interface SuspendBody {
  suspension_ref?: string;
  suspension_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface CompleteBody {
  completion_ref?: string;
  completion_basis?: string;
  notes?: string;
}

interface CloseBody {
  closure_ref?: string;
  closure_basis?: string;
  notes?: string;
}

interface RejectBody {
  rejection_ref?: string;
  rejection_basis?: string;
  reason_code?: string;
  notes?: string;
}

interface RevokeBody {
  revocation_ref?: string;
  revocation_basis?: string;
  regulator_ref?: string;
  reason_code?: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_ref?: string;
  withdrawal_basis?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PermitAction,
  bodyHandler?: (row: PermitRow, body: Record<string, unknown>) => Partial<PermitRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_permit_to_work WHERE id = ?').bind(id).first<PermitRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The hazard tier is fixed at request from the composite hazard score — it
  // drives the SLA deadline and the regulator crossing throughout the lifecycle.
  const effectiveTier = tierForHazardScore(row.hazard_score);
  const liveWork = !!row.live_work;
  const workClass = row.work_class;

  // Raise the gate flag for this action (independent proof the step happened).
  const gate = GATE_FLAG[action];
  if (gate) (overrides as Record<string, unknown>)[gate] = 1;

  // Reportability is a stable property of the permit (live/confined OR top tier);
  // recompute it on every transition so the flag tracks the source of truth.
  overrides.is_reportable = isReportable(effectiveTier, liveWork, workClass) ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier, liveWork, workClass);

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
    `UPDATE oe_permit_to_work SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ptw_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_permit_to_work_events (id, permit_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'permit_to_work',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      hazard_tier: effectiveTier,
      live_work: liveWork ? 1 : 0,
      work_class: workClass,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_permit_to_work WHERE id = ?').bind(id).first<PermitRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment', (_row, body) => {
  const b = body as Partial<AssessmentBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.assessment_ref === 'string')   out.assessment_ref = b.assessment_ref;
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  return out;
}));

app.post('/:id/approve-isolation-plan', async (c) => transition(c, 'approve_isolation_plan', (_row, body) => {
  const b = body as Partial<IsolationPlanBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.isolation_plan_ref === 'string') out.isolation_plan_ref = b.isolation_plan_ref;
  if (typeof b.isolation_basis === 'string')    out.isolation_basis = b.isolation_basis;
  if (typeof b.energy_sources === 'string')     out.energy_sources = b.energy_sources;
  if (typeof b.isolation_points === 'number')   out.isolation_points = b.isolation_points;
  return out;
}));

app.post('/:id/verify-isolation', async (c) => transition(c, 'verify_isolation', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.isolation_cert_ref === 'string')        out.isolation_cert_ref = b.isolation_cert_ref;
  if (typeof b.isolation_basis === 'string')           out.isolation_basis = b.isolation_basis;
  if (typeof b.isolating_authority_name === 'string')  out.isolating_authority_name = b.isolating_authority_name;
  return out;
}));

app.post('/:id/issue-permit', async (c) => transition(c, 'issue_permit', (_row, body) => {
  const b = body as Partial<IssueBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.permit_ref === 'string')            out.permit_ref = b.permit_ref;
  if (typeof b.issue_basis === 'string')           out.issue_basis = b.issue_basis;
  if (typeof b.permit_validity_hours === 'number') out.permit_validity_hours = b.permit_validity_hours;
  return out;
}));

app.post('/:id/start-work', async (c) => transition(c, 'start_work'));

app.post('/:id/suspend-work', async (c) => transition(c, 'suspend_work', (row, body) => {
  const b = body as Partial<SuspendBody>;
  const out: Partial<PermitRow> = {
    suspend_count: (row.suspend_count || 0) + 1,
    escalation_level: (row.escalation_level || 0) + 1,
  };
  if (typeof b.suspension_ref === 'string')   out.suspension_ref = b.suspension_ref;
  if (typeof b.suspension_basis === 'string') out.suspension_basis = b.suspension_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resume-work', async (c) => transition(c, 'resume_work'));

app.post('/:id/complete-work', async (c) => transition(c, 'complete_work', (_row, body) => {
  const b = body as Partial<CompleteBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.completion_ref === 'string')   out.completion_ref = b.completion_ref;
  if (typeof b.completion_basis === 'string') out.completion_basis = b.completion_basis;
  return out;
}));

app.post('/:id/close-permit', async (c) => transition(c, 'close_permit', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.closure_ref === 'string')   out.closure_ref = b.closure_ref;
  if (typeof b.closure_basis === 'string') out.closure_basis = b.closure_basis;
  return out;
}));

app.post('/:id/reject-permit', async (c) => transition(c, 'reject_permit', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/revoke-permit', async (c) => transition(c, 'revoke_permit', (_row, body) => {
  const b = body as Partial<RevokeBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.revocation_ref === 'string')   out.revocation_ref = b.revocation_ref;
  if (typeof b.revocation_basis === 'string') out.revocation_basis = b.revocation_basis;
  if (typeof b.regulator_ref === 'string')    out.regulator_ref = b.regulator_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<PermitRow> = {};
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function permitToWorkSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_permit_to_work
     WHERE chain_status NOT IN ('permit_closed','permit_rejected','permit_revoked','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PermitRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_permit_to_work
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ptw_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_permit_to_work_events (id, permit_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'permit_to_work.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.hazard_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.hazard_tier)) {
      await fireCascade({
        event: 'permit_to_work.sla_breached',
        actor_id: 'system',
        entity_type: 'permit_to_work',
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
