// ═══════════════════════════════════════════════════════════════════════════
// Wave 69 — Security / Collateral Perfection & Registration chain (P6)
//
// Mounted at /api/security-perfection/chain.
//
// A best-in-class project-finance lender takes, PERFECTS and maintains a SECURITY
// PACKAGE that makes the debt enforceable and correctly ranked. In SA law a
// security interest only bites once legally PERFECTED at the right registry —
// Deeds Office (Deeds Registries Act 47/1937 mortgage / notarial bonds; Security
// by Means of Movable Property Act 57/1993), Companies Act 71/2008 s126 + STRATE /
// CSDP (Financial Markets Act 19/2012) for share / dematerialised pledges, cession
// in securitatem debiti by notice, and SARB Exchange Control for non-resident
// beneficiaries. See src/utils/security-perfection-spec.ts for the full
// state-machine, tiering and reportability rationale.
//
//   identified → documentation_pending → executed → lodged_for_registration
//     → registered → perfection_review → perfected → released
//   defect:   {lodged_for_registration, perfection_review} → defective → (re-lodge)
//   overdue:  {documentation_pending, executed, lodged_for_registration, defective}
//               → perfection_overdue → lodged_for_registration | lapsed
//   withdraw: {identified, documentation_pending, executed} → withdrawn
//
// Two-party write: the security agent (lender) drives every step; the grantor
// (borrower / ipp_developer) executes the security document. execute_security is
// gated to the grantor write set; every other action to the agent write set.
// partyForAction tags each step for the audit trail.
//
// Reportability (the W69 signature, SECURITY-LOSS-driven): mark_lapsed crosses for
// EVERY tier (a lapse is always a material credit / impairment event); flag_overdue
// and SLA breaches cross for the high tiers (major + critical); reject_registration
// crosses for the critical tier only.
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
  isGrantorAction,
  tierForSecuredValue,
  SLA_MINUTES,
  type PerfectionStatus,
  type PerfectionAction,
  type PerfectionTier,
} from '../utils/security-perfection-spec';

// All nine personas may read the security-perfection register.
const READ_ROLES = new Set([
  'admin',
  'lender', 'regulator', 'grid_operator', 'ipp_developer', 'carbon_fund', 'offtaker', 'trader', 'support',
]);

// Two-party write. The security agent (lender) drives every step; the grantor
// (borrower) executes the security document.
const AGENT_ROLES = new Set(['admin', 'lender']);
const GRANTOR_ROLES = new Set(['admin', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PerfectionRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string | null;
  facility_name: string | null;
  borrower_id: string;
  borrower_name: string;
  project_id: string | null;
  project_name: string | null;
  security_type: string;
  security_description: string | null;
  registry: string | null;
  secured_value_zar: number | null;
  ranking: string | null;
  perfection_critical: number;
  cross_border: number;
  severity_tier: PerfectionTier;
  security_agent_id: string | null;
  security_agent_name: string | null;
  grantor_id: string | null;
  grantor_name: string | null;
  document_ref: string | null;
  lodgement_ref: string | null;
  registration_ref: string | null;
  perfection_ref: string | null;
  legal_opinion_ref: string | null;
  release_ref: string | null;
  documentation_basis: string | null;
  execution_basis: string | null;
  lodgement_basis: string | null;
  registration_basis: string | null;
  defect_basis: string | null;
  perfection_basis: string | null;
  overdue_basis: string | null;
  release_basis: string | null;
  lapse_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: PerfectionStatus;
  identified_at: string;
  documentation_pending_at: string | null;
  executed_at: string | null;
  lodged_for_registration_at: string | null;
  registered_at: string | null;
  perfection_review_at: string | null;
  perfected_at: string | null;
  defective_at: string | null;
  perfection_overdue_at: string | null;
  released_at: string | null;
  lapsed_at: string | null;
  withdrawn_at: string | null;
  perfection_deadline_at: string | null;
  relodge_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PerfectionEventRow {
  id: string;
  perfection_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PerfectionStatus, keyof PerfectionRow | null> = {
  identified:              'identified_at',
  documentation_pending:   'documentation_pending_at',
  executed:                'executed_at',
  lodged_for_registration: 'lodged_for_registration_at',
  registered:              'registered_at',
  perfection_review:       'perfection_review_at',
  perfected:               'perfected_at',
  defective:               'defective_at',
  perfection_overdue:      'perfection_overdue_at',
  released:                'released_at',
  lapsed:                  'lapsed_at',
  withdrawn:               'withdrawn_at',
};

function decorate(row: PerfectionRow, now: Date) {
  const tier = row.severity_tier;
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

function eventTypeFor(action: PerfectionAction): string {
  switch (action) {
    case 'begin_documentation':     return 'security_perfection.documentation_pending';
    case 'execute_security':        return 'security_perfection.executed';
    case 'lodge_registration':      return 'security_perfection.lodged_for_registration';
    case 'confirm_registration':    return 'security_perfection.registered';
    case 'reject_registration':     return 'security_perfection.defective';
    case 'begin_perfection_review': return 'security_perfection.perfection_review';
    case 'confirm_perfection':      return 'security_perfection.perfected';
    case 'flag_overdue':            return 'security_perfection.perfection_overdue';
    case 'cure_overdue':            return 'security_perfection.lodged_for_registration';
    case 'release_security':        return 'security_perfection.released';
    case 'mark_lapsed':             return 'security_perfection.lapsed';
    case 'withdraw':                return 'security_perfection.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const severity_tier = c.req.query('severity_tier');
  const security_type = c.req.query('security_type');
  const registry      = c.req.query('registry');
  const status        = c.req.query('status');
  const breached      = c.req.query('breached');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_security_perfection WHERE 1=1';
  const binds: unknown[] = [];
  if (severity_tier) { sql += ' AND severity_tier = ?'; binds.push(severity_tier); }
  if (security_type) { sql += ' AND security_type = ?'; binds.push(security_type); }
  if (registry)      { sql += ' AND registry = ?';      binds.push(registry); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }

  sql += ' ORDER BY datetime(identified_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PerfectionRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_security_type: Record<string, number> = {};
  const by_registry: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
    if (i.security_type) by_security_type[i.security_type] = (by_security_type[i.security_type] || 0) + 1;
    if (i.registry) by_registry[i.registry] = (by_registry[i.registry] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const perfected_count   = items.filter((i) => i.chain_status === 'perfected').length;
  const defective_count   = items.filter((i) => i.chain_status === 'defective').length;
  const overdue_count     = items.filter((i) => i.chain_status === 'perfection_overdue').length;
  const released_count    = items.filter((i) => i.chain_status === 'released').length;
  const lapsed_count      = items.filter((i) => i.chain_status === 'lapsed').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const cp_open           = items.filter((i) => !i.is_terminal && i.perfection_critical).length;
  const high_open         = items.filter((i) =>
    !i.is_terminal && (i.severity_tier === 'major' || i.severity_tier === 'critical')).length;
  const total_secured_zar = items.reduce((sum, i) => sum + (i.secured_value_zar || 0), 0);
  const perfected_secured_zar = items
    .filter((i) => i.chain_status === 'perfected' || i.chain_status === 'released')
    .reduce((sum, i) => sum + (i.secured_value_zar || 0), 0);
  const lapsed_secured_zar = items
    .filter((i) => i.chain_status === 'lapsed')
    .reduce((sum, i) => sum + (i.secured_value_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_security_type,
      by_registry,
      open_count,
      perfected_count,
      defective_count,
      overdue_count,
      released_count,
      lapsed_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      cp_open,
      high_open,
      total_secured_zar,
      perfected_secured_zar,
      lapsed_secured_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_security_perfection WHERE id = ?').bind(id).first<PerfectionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_security_perfection_events WHERE perfection_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PerfectionEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface DocumentationBody {
  documentation_basis?: string;
  document_ref?: string;
  secured_value_zar?: number;
  perfection_critical?: boolean;
  notes?: string;
}
interface ExecuteBody {
  execution_basis?: string;
  document_ref?: string;
  notes?: string;
}
interface LodgeBody {
  lodgement_basis?: string;
  lodgement_ref?: string;
  notes?: string;
}
interface RegistrationBody {
  registration_basis?: string;
  registration_ref?: string;
  notes?: string;
}
interface RejectBody {
  defect_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface ReviewBody {
  perfection_basis?: string;
  legal_opinion_ref?: string;
  notes?: string;
}
interface PerfectBody {
  perfection_basis?: string;
  perfection_ref?: string;
  legal_opinion_ref?: string;
  resolution_summary?: string;
  notes?: string;
}
interface OverdueBody {
  overdue_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface CureBody {
  lodgement_basis?: string;
  lodgement_ref?: string;
  resolution_summary?: string;
  notes?: string;
}
interface ReleaseBody {
  release_basis?: string;
  release_ref?: string;
  resolution_summary?: string;
  notes?: string;
}
interface LapseBody {
  lapse_basis?: string;
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}
interface WithdrawBody {
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PerfectionAction,
  bodyHandler?: (row: PerfectionRow, body: Record<string, unknown>) => Partial<PerfectionRow>,
) {
  const user = getCurrentUser(c);
  const allowedRoles = isGrantorAction(action) ? GRANTOR_ROLES : AGENT_ROLES;
  if (!user || !allowedRoles.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_security_perfection WHERE id = ?').bind(id).first<PerfectionRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived when documentation restates the secured value or the
  // condition-precedent flag; otherwise the row's recorded severity stands.
  const effectiveValue = (overrides.secured_value_zar ?? row.secured_value_zar) ?? 0;
  const effectiveCritical = (overrides.perfection_critical ?? row.perfection_critical) ? true : false;
  let effectiveTier: PerfectionTier = row.severity_tier;
  if (overrides.secured_value_zar != null || overrides.perfection_critical != null) {
    effectiveTier = tierForSecuredValue(effectiveValue, effectiveCritical);
    overrides.severity_tier = effectiveTier;
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier);
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
    `UPDATE oe_security_perfection SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `spf_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_security_perfection_events (id, perfection_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'security_perfection',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      severity_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_security_perfection WHERE id = ?').bind(id).first<PerfectionRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-documentation', async (c) => transition(c, 'begin_documentation', (_row, body) => {
  const b = body as Partial<DocumentationBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.documentation_basis === 'string') out.documentation_basis = b.documentation_basis;
  if (typeof b.document_ref === 'string')        out.document_ref = b.document_ref;
  if (typeof b.secured_value_zar === 'number')   out.secured_value_zar = b.secured_value_zar;
  if (typeof b.perfection_critical === 'boolean') out.perfection_critical = b.perfection_critical ? 1 : 0;
  return out;
}));

app.post('/:id/execute-security', async (c) => transition(c, 'execute_security', (_row, body) => {
  const b = body as Partial<ExecuteBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.execution_basis === 'string') out.execution_basis = b.execution_basis;
  if (typeof b.document_ref === 'string')    out.document_ref = b.document_ref;
  return out;
}));

app.post('/:id/lodge-registration', async (c) => transition(c, 'lodge_registration', (row, body) => {
  const b = body as Partial<LodgeBody>;
  // Re-lodging after a defect is a fresh round.
  const out: Partial<PerfectionRow> = { escalation_level: 0 };
  if (row.chain_status === 'defective') out.relodge_round = (row.relodge_round || 0) + 1;
  if (typeof b.lodgement_basis === 'string') out.lodgement_basis = b.lodgement_basis;
  if (typeof b.lodgement_ref === 'string')   out.lodgement_ref = b.lodgement_ref;
  return out;
}));

app.post('/:id/confirm-registration', async (c) => transition(c, 'confirm_registration', (_row, body) => {
  const b = body as Partial<RegistrationBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.registration_basis === 'string') out.registration_basis = b.registration_basis;
  if (typeof b.registration_ref === 'string')   out.registration_ref = b.registration_ref;
  return out;
}));

app.post('/:id/reject-registration', async (c) => transition(c, 'reject_registration', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<PerfectionRow> = { escalation_level: 1 };
  if (typeof b.defect_basis === 'string') out.defect_basis = b.defect_basis;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/begin-perfection-review', async (c) => transition(c, 'begin_perfection_review', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.perfection_basis === 'string')   out.perfection_basis = b.perfection_basis;
  if (typeof b.legal_opinion_ref === 'string')  out.legal_opinion_ref = b.legal_opinion_ref;
  return out;
}));

app.post('/:id/confirm-perfection', async (c) => transition(c, 'confirm_perfection', (_row, body) => {
  const b = body as Partial<PerfectBody>;
  const out: Partial<PerfectionRow> = { escalation_level: 0 };
  if (typeof b.perfection_basis === 'string')    out.perfection_basis = b.perfection_basis;
  if (typeof b.perfection_ref === 'string')      out.perfection_ref = b.perfection_ref;
  if (typeof b.legal_opinion_ref === 'string')   out.legal_opinion_ref = b.legal_opinion_ref;
  if (typeof b.resolution_summary === 'string')  out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/flag-overdue', async (c) => transition(c, 'flag_overdue', (_row, body) => {
  const b = body as Partial<OverdueBody>;
  const out: Partial<PerfectionRow> = { escalation_level: 2 };
  if (typeof b.overdue_basis === 'string') out.overdue_basis = b.overdue_basis;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cure-overdue', async (c) => transition(c, 'cure_overdue', (row, body) => {
  const b = body as Partial<CureBody>;
  const out: Partial<PerfectionRow> = { escalation_level: 1, relodge_round: (row.relodge_round || 0) + 1 };
  if (typeof b.lodgement_basis === 'string')    out.lodgement_basis = b.lodgement_basis;
  if (typeof b.lodgement_ref === 'string')      out.lodgement_ref = b.lodgement_ref;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/release-security', async (c) => transition(c, 'release_security', (_row, body) => {
  const b = body as Partial<ReleaseBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.release_basis === 'string')      out.release_basis = b.release_basis;
  if (typeof b.release_ref === 'string')        out.release_ref = b.release_ref;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/mark-lapsed', async (c) => transition(c, 'mark_lapsed', (_row, body) => {
  const b = body as Partial<LapseBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.lapse_basis === 'string')        out.lapse_basis = b.lapse_basis;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<PerfectionRow> = {};
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the high tiers (major + critical).
export async function securityPerfectionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_security_perfection
     WHERE chain_status NOT IN ('released','lapsed','withdrawn','perfected')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PerfectionRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_security_perfection
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `spf_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_security_perfection_events (id, perfection_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'security_perfection.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.severity_tier)) {
      await fireCascade({
        event: 'security_perfection.sla_breached',
        actor_id: 'system',
        entity_type: 'security_perfection',
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
